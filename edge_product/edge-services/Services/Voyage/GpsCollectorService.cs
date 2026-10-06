using System.Net.Sockets;
using System.Text;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Core;
using MaritimeEdge.Services.Parsers;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Voyage;

/// <summary>
/// Background service kết nối TCP đến thiết bị GPS (gpsd / NMEA streamer),
/// đọc NMEA stream, parse qua NmeaParser, và lưu PositionData vào DB local.
/// 
/// Hỗ trợ:
/// - Kết nối TCP với auto-reconnect (exponential backoff: 1s → 60s max)
/// - Xử lý buffer phân mảnh dữ liệu NMEA
/// - Parse $GPRMC (vĩ độ, kinh độ, tốc độ, hướng, thời gian)
/// - Parse $GPGGA (độ cao, số vệ tinh, chất lượng fix)
/// - Validate checksum, bỏ qua câu không hợp lệ
/// - Ghi NmeaRawData để debug (có thể tắt qua config)
/// </summary>
public class GpsCollectorService : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    private readonly NmeaParser _nmeaParser;
    private readonly ILogger<GpsCollectorService> _logger;
    private readonly IConfiguration _configuration;

    // Cấu hình
    private readonly string _host;
    private readonly int _port;
    private readonly int _reconnectDelayMs;
    private readonly int _maxReconnectDelayMs;
    private readonly int _bufferSize;
    private readonly bool _logRawNmea;
    private string _nodeId = "UNKNOWN";

    // Trạng thái kết nối
    private int _reconnectAttempts;
    private TcpClient? _tcpClient;
    private NetworkStream? _networkStream;

    public GpsCollectorService(
        IServiceProvider serviceProvider,
        NmeaParser nmeaParser,
        ILogger<GpsCollectorService> logger,
        IConfiguration configuration)
    {
        _serviceProvider = serviceProvider;
        _nmeaParser = nmeaParser;
        _logger = logger;
        _configuration = configuration;

        _host = _configuration.GetValue("GpsCollector:Host", "192.168.1.200")!;
        _port = _configuration.GetValue("GpsCollector:Port", 2947);
        _reconnectDelayMs = _configuration.GetValue("GpsCollector:ReconnectDelayMs", 1000);
        _maxReconnectDelayMs = _configuration.GetValue("GpsCollector:MaxReconnectDelayMs", 60000);
        _bufferSize = _configuration.GetValue("GpsCollector:ReadBufferSize", 4096);
        _logRawNmea = _configuration.GetValue("GpsCollector:LogRawNmea", false);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var enabled = _configuration.GetValue("GpsCollector:Enabled", false);
        if (!enabled)
        {
            _logger.LogInformation("GPS Collector Service is DISABLED in configuration");
            return;
        }

        _logger.LogInformation(
            "GPS Collector Service starting. Target: {Host}:{Port}, Buffer: {BufferSize}B",
            _host, _port, _bufferSize);

        // Warmup delay
        await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken);

        _nodeId = await ResolveNodeIdAsync();
        _logger.LogInformation("GPS Collector Service using NodeId: {NodeId}", _nodeId);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var connected = await ConnectWithRetryAsync(stoppingToken);
                if (!connected)
                {
                    // Không thể kết nối sau tất cả retry — đợi rồi thử lại
                    _logger.LogWarning("Unable to connect to GPS device. Restarting connection cycle.");
                    _reconnectAttempts = 0;
                    await Task.Delay(_maxReconnectDelayMs, stoppingToken);
                    continue;
                }

                // Đọc NMEA stream
                await ReadNmeaStreamAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                _logger.LogInformation("GPS Collector Service is shutting down");
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unexpected error in GPS Collector main loop");
            }
            finally
            {
                Disconnect();
            }

            // Đợi trước khi reconnect
            if (!stoppingToken.IsCancellationRequested)
            {
                var delay = CalculateBackoff();
                _logger.LogWarning("GPS connection lost. Reconnecting in {Delay}ms (attempt {Attempt})",
                    delay, _reconnectAttempts);
                await Task.Delay(delay, stoppingToken);
            }
        }

        _logger.LogInformation("GPS Collector Service stopped");
    }

    /// <summary>
    /// Kết nối TCP đến GPS device với retry và exponential backoff
    /// </summary>
    private async Task<bool> ConnectWithRetryAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                _logger.LogInformation("Connecting to GPS device at {Host}:{Port} (attempt {Attempt})...",
                    _host, _port, _reconnectAttempts + 1);

                _tcpClient = new TcpClient
                {
                    ReceiveTimeout = 30000,  // 30s read timeout
                    SendTimeout = 5000       // 5s write timeout
                };

                // Kết nối với timeout 10s
                using var connectCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                connectCts.CancelAfter(TimeSpan.FromSeconds(10));

                await _tcpClient.ConnectAsync(_host, _port, connectCts.Token);

                _networkStream = _tcpClient.GetStream();

                _logger.LogInformation(
                    "✅ GPS Collector connected to {Host}:{Port}",
                    _host, _port);

                _reconnectAttempts = 0; // Reset counter on success
                return true;
            }
            catch (SocketException ex)
            {
                _logger.LogWarning(ex, "GPS connection failed: {Message}", ex.Message);
            }
            catch (TaskCanceledException) when (ct.IsCancellationRequested)
            {
                return false;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "GPS connection failed: {Message}", ex.Message);
            }

            Disconnect();

            if (ct.IsCancellationRequested)
                return false;

            // Exponential backoff
            _reconnectAttempts++;
            var delay = CalculateBackoff();
            _logger.LogInformation("Retrying GPS connection in {Delay}ms...", delay);
            await Task.Delay(delay, ct);
        }

        return false;
    }

    /// <summary>
    /// Đọc TCP stream, tách buffer thành các câu NMEA hoàn chỉnh
    /// </summary>
    private async Task ReadNmeaStreamAsync(CancellationToken ct)
    {
        var buffer = new byte[_bufferSize];
        var leftover = new StringBuilder();

        while (!ct.IsCancellationRequested)
        {
            if (_tcpClient == null || !_tcpClient.Connected || _networkStream == null)
            {
                _logger.LogWarning("TCP connection lost during read");
                break;
            }

            int bytesRead;
            try
            {
                bytesRead = await _networkStream.ReadAsync(buffer, 0, buffer.Length, ct);
            }
            catch (IOException ex)
            {
                _logger.LogWarning(ex, "GPS stream read error (connection likely lost)");
                break;
            }
            catch (SocketException ex)
            {
                _logger.LogWarning(ex, "GPS socket error");
                break;
            }

            if (bytesRead == 0)
            {
                _logger.LogWarning("GPS stream closed (0 bytes read)");
                break;
            }

            // Giải mã buffer thành string (NMEA dùng ASCII)
            var chunk = Encoding.ASCII.GetString(buffer, 0, bytesRead);
            leftover.Append(chunk);

            // Tách các câu NMEA hoàn chỉnh bằng \r\n hoặc \n
            var fullBuffer = leftover.ToString();
            leftover.Clear();

            var lines = fullBuffer.Split(new[] { "\r\n", "\n" }, StringSplitOptions.None);

            // Tất cả các dòng trừ dòng cuối là hoàn chỉnh
            // Dòng cuối có thể bị cắt ngang → giữ lại trong leftover
            for (int i = 0; i < lines.Length - 1; i++)
            {
                var line = lines[i].Trim();
                if (!string.IsNullOrEmpty(line))
                {
                    await ProcessSentenceAsync(line, ct);
                }
            }

            // Dòng cuối (chưa có \r\n → có thể bị phân mảnh)
            var lastLine = lines[^1];
            if (!string.IsNullOrEmpty(lastLine))
            {
                leftover.Append(lastLine);
            }
        }
    }

    /// <summary>
    /// Parse một câu NMEA → PositionData → lưu DB
    /// </summary>
    private async Task ProcessSentenceAsync(string sentence, CancellationToken ct)
    {
        try
        {
            // Lưu raw NMEA để debug (nếu bật)
            if (_logRawNmea)
            {
                await SaveRawNmeaAsync(sentence, ct);
            }

            // Parse qua NmeaParser
            var parsed = _nmeaParser.ParseSentence(sentence);

            if (parsed is PositionData position)
            {
                // Đảm bảo timestamp luôn là UTC
                if (position.Timestamp.Kind != DateTimeKind.Utc)
                {
                    position.Timestamp = position.Timestamp.ToUniversalTime();
                }

                position.Id = Guid.NewGuid();
                position.IsSynced = false;
                position.CreatedAt = DateTime.UtcNow;
                position.UpdatedAt = DateTime.UtcNow;
                position.OriginNode = _nodeId; // Set IMO thực để khớp với Shore filter

                using var scope = _serviceProvider.CreateScope();
                var dbContext = scope.ServiceProvider.GetRequiredService<EdgeDbContext>();

                await dbContext.PositionData.AddAsync(position, ct);
                await dbContext.SaveChangesAsync(ct);

                _logger.LogDebug(
                    "GPS Position saved: {Lat:F6}, {Lon:F6} | SOG: {SOG:F1}kn | COG: {COG:F1}° | Sats: {Sats}",
                    position.Latitude, position.Longitude,
                    position.SpeedOverGround, position.CourseOverGround,
                    position.SatellitesUsed);
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error processing NMEA sentence: {Sentence}", sentence);
        }
    }

    /// <summary>
    /// Lưu raw NMEA sentence để debug/audit
    /// </summary>
    private async Task SaveRawNmeaAsync(string sentence, CancellationToken ct)
    {
        try
        {
            var sentenceType = "UNK";
            var checksumValid = false;

            // Trích xuất loại câu (VD: "GPRMC" → "RMC")
            if (sentence.Length >= 6 && sentence[0] == '$')
            {
                sentenceType = sentence.Length >= 6 ? sentence.Substring(3, 3) : "UNK";
            }

            // Validate checksum nhanh
            if (sentence.Contains('*'))
            {
                var parts = sentence.Split('*');
                if (parts.Length == 2)
                {
                    var data = parts[0].TrimStart('$', '!');
                    var checksumStr = parts[1].Substring(0, Math.Min(2, parts[1].Length));
                    if (int.TryParse(checksumStr, System.Globalization.NumberStyles.HexNumber, null, out var expected))
                    {
                        var calculated = data.Aggregate(0, (current, c) => current ^ c);
                        checksumValid = calculated == expected;
                    }
                }
            }

            var rawData = new NmeaRawData
            {
                Timestamp = DateTime.UtcNow,
                SentenceType = sentenceType,
                RawSentence = sentence.Length <= 512 ? sentence : sentence.Substring(0, 512),
                ChecksumValid = checksumValid,
                DeviceSource = $"{_host}:{_port}",
                IsSynced = false
            };

            using var scope = _serviceProvider.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<EdgeDbContext>();
            await dbContext.NmeaRawData.AddAsync(rawData, ct);
            await dbContext.SaveChangesAsync(ct);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Failed to save raw NMEA (non-critical)");
        }
    }

    /// <summary>
    /// Tính delay reconnect theo exponential backoff:
    /// 1s → 2s → 4s → 8s → 16s → 32s → max 60s
    /// </summary>
    private int CalculateBackoff()
    {
        var delayMs = _reconnectDelayMs * (int)Math.Pow(2, Math.Min(_reconnectAttempts, 6));
        return Math.Min(delayMs, _maxReconnectDelayMs);
    }

    /// <summary>
    /// Ngắt kết nối TCP và dọn dẹp tài nguyên
    /// </summary>
    private void Disconnect()
    {
        try
        {
            _networkStream?.Close();
            _networkStream?.Dispose();
            _networkStream = null;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Error closing network stream");
        }

        try
        {
            _tcpClient?.Close();
            _tcpClient?.Dispose();
            _tcpClient = null;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Error closing TCP client");
        }
    }

    public override void Dispose()
    {
        Disconnect();
        base.Dispose();
    }

    /// <summary>
    /// Vessel Provisioning v3: resolves NodeId via <see cref="IEdgeRuntimeConfigService"/> instead of
    /// reading <c>_configuration["SyncSecurity:NodeId"]</c> directly. Cached once at service startup
    /// (BackgroundService is Singleton) — a service restart is needed to pick up a newly activated
    /// Managed profile, which is acceptable given the high-frequency (per-NMEA-sentence) usage of this
    /// value; resolving per-sentence would add unnecessary DB load. Falls back to "UNKNOWN" (does not
    /// throw) on Fail-Closed conditions.
    /// </summary>
    private async Task<string> ResolveNodeIdAsync()
    {
        try
        {
            using var scope = _serviceProvider.CreateScope();
            var runtimeConfigService = scope.ServiceProvider.GetRequiredService<IEdgeRuntimeConfigService>();
            var syncConfig = await runtimeConfigService.GetSyncConfigAsync();
            return string.IsNullOrWhiteSpace(syncConfig?.NodeId)
                ? "UNKNOWN"
                : syncConfig!.NodeId;
        }
        catch (ProvisioningRequiredException ex)
        {
            _logger.LogWarning("GPS Collector Service: VesselIMO unavailable — {Message}", ex.Message);
            return "UNKNOWN";
        }
        catch (ConfigInvalidException ex)
        {
            _logger.LogError("GPS Collector Service: VesselIMO unavailable — {Message}", ex.Message);
            return "UNKNOWN";
        }
    }
}
