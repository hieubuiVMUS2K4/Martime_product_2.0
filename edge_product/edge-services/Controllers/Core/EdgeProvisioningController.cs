using System.IO.Compression;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Security;
using MaritimeEdge.Services.Core;

namespace MaritimeEdge.Controllers.Core;

/// <summary>
/// Vessel Provisioning v3 — Component 6. Lets IT on the vessel import a Provisioning Package
/// (ZIP/JSON) exported from Shore, preview/test it, and activate it as the Managed Mode config
/// source of truth (<see cref="EdgeProvisioningProfile"/>).
/// </summary>
[ApiController]
[Route("api/edge/provisioning")]
[Authorize(Policy = "InternalAccess")]
public class EdgeProvisioningController : ControllerBase
{
    private static readonly string[] SupportedSchemaVersions = { "1.0" };
    private static readonly string[] SupportedProtocolVersions = { "1", "2" };

    private readonly EdgeDbContext _context;
    private readonly IEdgeDataEncryptionService _encryption;
    private readonly IEdgeRuntimeConfigService _runtimeConfigService;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IEdgeVesselSwitchService _vesselSwitch;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<EdgeProvisioningController> _logger;

    public EdgeProvisioningController(
        EdgeDbContext context,
        IEdgeDataEncryptionService encryption,
        IEdgeRuntimeConfigService runtimeConfigService,
        IHttpClientFactory httpClientFactory,
        IEdgeVesselSwitchService vesselSwitch,
        IServiceScopeFactory scopeFactory,
        ILogger<EdgeProvisioningController> logger)
    {
        _context = context;
        _encryption = encryption;
        _runtimeConfigService = runtimeConfigService;
        _httpClientFactory = httpClientFactory;
        _vesselSwitch = vesselSwitch;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    /// <summary>GET /api/edge/provisioning/status</summary>
    [HttpGet("status")]
    public async Task<IActionResult> GetStatus()
    {
        var active = await _context.EdgeProvisioningProfiles
            .AsNoTracking()
            .FirstOrDefaultAsync(p => p.IsActive);

        if (active == null)
        {
            return Ok(new
            {
                isActive = false,
                nodeId = (string?)null,
                vesselImo = (string?)null,
                vesselName = (string?)null,
                shoreVesselId = (Guid?)null,
                shoreUrl = (string?)null,
                lastHandshake = (DateTime?)null,
                handshakeStatus = (string?)null,
                lastHandshakeError = (string?)null,
                source = "none"
            });
        }

        return Ok(new
        {
            isActive = true,
            profileId = active.Id,
            nodeId = active.NodeId,
            vesselImo = active.VesselImo,
            vesselName = active.VesselName,
            shoreVesselId = active.VesselId,
            shoreUrl = active.ShoreBaseUrl,
            lastHandshake = active.LastHandshakeAt,
            handshakeStatus = active.HandshakeStatus,
            lastHandshakeError = active.LastHandshakeError,
            source = "db"
        });
    }

    /// <summary>
    /// POST /api/edge/provisioning/import — multipart/form-data upload of a Provisioning Package
    /// (.zip containing edge-provisioning.json, or a bare .json file). Validates required fields,
    /// encrypts secrets, and stores as an inactive profile (is_active=false) for preview/testing.
    /// </summary>
    [HttpPost("import")]
    [RequestSizeLimit(5 * 1024 * 1024)]
    public async Task<IActionResult> Import(IFormFile file)
    {
        if (file == null || file.Length == 0)
            return BadRequest(new { error = "Không có file được tải lên." });

        string jsonContent;
        try
        {
            jsonContent = await ExtractProvisioningJsonAsync(file);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = $"Không đọc được file provisioning: {ex.Message}" });
        }

        JsonDocument doc;
        try
        {
            doc = JsonDocument.Parse(jsonContent);
        }
        catch (JsonException ex)
        {
            return BadRequest(new { error = $"File edge-provisioning.json không hợp lệ (JSON lỗi): {ex.Message}" });
        }

        using (doc)
        {
            var root = doc.RootElement;

            var validationError = ValidateProvisioningJson(root, out var parsed);
            if (validationError != null)
                return BadRequest(new { error = validationError });

            EdgeProvisioningProfile profile;
            try
            {
                profile = new EdgeProvisioningProfile
                {
                    IsActive = false,
                    NodeId = parsed.NodeId,
                    VesselImo = parsed.VesselImo,
                    VesselName = parsed.VesselName,
                    VesselId = parsed.VesselId,
                    ShoreBaseUrl = parsed.ShoreBaseUrl,
                    NodeApiToken = _encryption.Encrypt(parsed.NodeApiToken),
                    SigningKey = _encryption.Encrypt(parsed.SigningKey),
                    KeyVersion = parsed.KeyVersion,
                    ProtocolVersion = parsed.ProtocolVersion,
                    SecurityEnabled = parsed.SecurityEnabled,
                    BatchSize = parsed.BatchSize,
                    SyncIntervalSec = parsed.SyncIntervalSec,
                    NetworkType = parsed.NetworkType,
                    SchemaVersion = parsed.SchemaVersion,
                    ImportedAt = DateTime.UtcNow,
                    ImportedFrom = file.FileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase) ? "zip_upload" : "json_upload",
                    HandshakeStatus = "never"
                };
            }
            catch (InvalidOperationException ex)
            {
                _logger.LogError(ex, "Failed to encrypt EdgeProvisioningProfile credentials during import.");
                return BadRequest(new
                {
                    error = "EDGE_DATA_PROTECTION_KEY / DataProtection:EncryptionKey chưa được cấu hình trên Edge backend."
                });
            }

            try
            {
                // Chỉ lưu gói. Danh tính tàu (ShipData) đổi lúc KÍCH HOẠT, không phải lúc import.
                _context.EdgeProvisioningProfiles.Add(profile);
                await _context.SaveChangesAsync();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to save EdgeProvisioningProfile during import.");
                return StatusCode(500, new
                {
                    error = "Không lưu được EdgeProvisioningProfile. Kiểm tra migration/table edge_provisioning_profile trong Edge DB."
                });
            }

            _logger.LogInformation(
                "Imported EdgeProvisioningProfile #{ProfileId} (NodeId={NodeId}, Source={Source})",
                profile.Id, profile.NodeId, profile.ImportedFrom);

            return Ok(new
            {
                profileId = profile.Id,
                preview = new
                {
                    nodeId = profile.NodeId,
                    vesselImo = profile.VesselImo,
                    vesselName = profile.VesselName,
                    shoreBaseUrl = profile.ShoreBaseUrl,
                    keyVersion = profile.KeyVersion,
                    protocolVersion = profile.ProtocolVersion,
                    securityEnabled = profile.SecurityEnabled
                }
            });
        }
    }

    public class ProfileActionRequest
    {
        public int ProfileId { get; set; }

        /// <summary>Kích hoạt gói của TÀU KHÁC: phải xác nhận xoá toàn bộ dữ liệu tàu hiện tại.</summary>
        public bool ConfirmReset { get; set; }
    }

    /// <summary>
    /// GET /api/edge/provisioning/{id}/switch-check — Trước khi kích hoạt: gói này có phải tàu khác không,
    /// có bao nhiêu thay đổi chưa gửi lên bờ sẽ mất.
    /// </summary>
    [HttpGet("{id:int}/switch-check")]
    public async Task<IActionResult> SwitchCheck(int id)
    {
        var profile = await _context.EdgeProvisioningProfiles.AsNoTracking().FirstOrDefaultAsync(p => p.Id == id);
        if (profile == null)
            return NotFound(new { error = $"Không tìm thấy profile #{id}." });
        return Ok(await _vesselSwitch.CheckAsync(profile));
    }

    /// <summary>
    /// POST /api/edge/provisioning/test — Uses a not-yet-activated profile to call Shore's
    /// POST /api/sync/handshake and confirm the credentials/URL actually work before activating.
    /// </summary>
    [HttpPost("test")]
    public async Task<IActionResult> TestConnection([FromBody] ProfileActionRequest request)
    {
        var profile = await _context.EdgeProvisioningProfiles.FirstOrDefaultAsync(p => p.Id == request.ProfileId);
        if (profile == null)
            return NotFound(new { error = $"Không tìm thấy profile #{request.ProfileId}." });

        if (string.IsNullOrWhiteSpace(profile.ShoreBaseUrl) || string.IsNullOrWhiteSpace(profile.NodeId))
            return BadRequest(new { error = "Profile thiếu ShoreBaseUrl hoặc NodeId." });

        try
        {
            _ = _encryption.Decrypt(profile.NodeApiToken);
        }
        catch (Exception ex)
        {
            return BadRequest(new { error = $"Không giải mã được NodeApiToken: {ex.Message}" });
        }

        ShoreHandshakeResult result;
        try
        {
            result = await _vesselSwitch.HandshakeAsync(profile, requestFullSync: false);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Test connection failed for profile #{ProfileId}", profile.Id);
            result = new ShoreHandshakeResult(false, Truncate(ex.Message, 500), 0);
        }

        profile.HandshakeStatus = result.Success ? "success" : "failed";
        profile.LastHandshakeError = result.Error;
        profile.LastHandshakeAt = DateTime.UtcNow;
        await _context.SaveChangesAsync();

        return result.Success
            ? Ok(new { success = true, message = "Kết nối thành công.", serverTime = DateTime.UtcNow })
            : Ok(new { success = false, message = result.Error });
    }

    /// <summary>
    /// POST /api/edge/provisioning/activate — Deactivates any currently active profile and
    /// activates the given one, atomically. This is the moment Managed Mode "goes live".
    /// </summary>
    [HttpPost("activate")]
    public async Task<IActionResult> Activate([FromBody] ProfileActionRequest request)
    {
        var profile = await _context.EdgeProvisioningProfiles.FirstOrDefaultAsync(p => p.Id == request.ProfileId);
        if (profile == null)
            return NotFound(new { error = $"Không tìm thấy profile #{request.ProfileId}." });

        if (!string.Equals(profile.HandshakeStatus, "success", StringComparison.OrdinalIgnoreCase) ||
            !profile.LastHandshakeAt.HasValue)
        {
            return BadRequest(new { error = "Profile must pass Test Connection before activation." });
        }

        if (string.IsNullOrWhiteSpace(profile.NodeId) ||
            string.IsNullOrWhiteSpace(profile.VesselImo) ||
            !profile.VesselId.HasValue)
        {
            return BadRequest(new { error = "Profile is missing its node/vessel identity binding." });
        }

        // Gói của tàu khác: tàu chỉ chứa dữ liệu của MỘT tàu → xoá sạch dữ liệu tàu cũ rồi nhận lại từ bờ.
        var check = await _vesselSwitch.CheckAsync(profile);
        if (check.RequiresReset && !request.ConfirmReset)
        {
            return Conflict(new
            {
                error = "Gói cấu hình này thuộc tàu khác. Kích hoạt sẽ XOÁ toàn bộ dữ liệu của tàu hiện tại.",
                requiresReset = true,
                check
            });
        }

        _context.SuppressSyncQueue = true;
        int? previousProfileId;
        var wipedRows = 0;
        await using (var transaction = await _context.Database.BeginTransactionAsync())
        {
            try
            {
                if (check.RequiresReset)
                    wipedRows = await _vesselSwitch.WipeVesselDataAsync();

                var previouslyActive = await _context.EdgeProvisioningProfiles
                    .Where(p => p.IsActive)
                    .ToListAsync();

                previousProfileId = previouslyActive.FirstOrDefault()?.Id;

                foreach (var p in previouslyActive)
                    p.IsActive = false;

                await _context.SaveChangesAsync();

                profile.IsActive = true;
                profile.ActivatedAt = DateTime.UtcNow;
                await UpsertShipDataFromProfileAsync(profile);

                if (check.RequiresReset)
                {
                    var flag = await _context.SyncState.AsTracking().SingleOrDefaultAsync(s => s.Key == EdgeVesselSwitchService.FullSyncPendingKey);
                    if (flag == null)
                        _context.SyncState.Add(new SyncState { Key = EdgeVesselSwitchService.FullSyncPendingKey, Value = profile.NodeId!, UpdatedAt = DateTime.UtcNow });
                    else { flag.Value = profile.NodeId!; flag.UpdatedAt = DateTime.UtcNow; }
                }

                await _context.SaveChangesAsync();
                await transaction.CommitAsync();
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Failed to activate EdgeProvisioningProfile #{ProfileId}", request.ProfileId);
                return StatusCode(500, new { error = $"Kích hoạt thất bại, dữ liệu không thay đổi: {ex.Message}" });
            }
        }

        _logger.LogInformation(
            "Activated EdgeProvisioningProfile #{ProfileId} (NodeId={NodeId}); previous active profile: #{PreviousProfileId}; reset={Reset} ({Rows} rows)",
            profile.Id, profile.NodeId, previousProfileId, check.RequiresReset, wipedRows);

        // Xin bờ gửi lại toàn bộ dữ liệu của tàu mới, rồi kéo về ngay (không chờ chu kỳ đồng bộ).
        var fullSyncRequested = false;
        if (check.RequiresReset)
        {
            fullSyncRequested = await _vesselSwitch.CompletePendingFullSyncAsync();
            if (fullSyncRequested)
                StartInitialPull();
        }

        return Ok(new { activated = true, previousProfileId, reset = check.RequiresReset, wipedRows, fullSyncRequested });
    }

    public class ResetRequest
    {
        /// <summary>IMO tàu đang chạy — gõ lại để xác nhận.</summary>
        public string? ConfirmImo { get; set; }
    }

    /// <summary>
    /// POST /api/edge/provisioning/reset — Làm sạch tàu đang chạy và nhận lại toàn bộ dữ liệu từ bờ (giữ gói đang
    /// dùng, danh mục dùng chung, tài khoản quản trị). Dùng khi dữ liệu tàu lệch bờ hoặc cài lại máy.
    /// </summary>
    [HttpPost("reset")]
    public async Task<IActionResult> ResetFromShore([FromBody] ResetRequest request)
    {
        var profile = await _context.EdgeProvisioningProfiles.FirstOrDefaultAsync(p => p.IsActive);
        if (profile == null)
            return BadRequest(new { error = "Chưa có gói cấu hình nào đang dùng." });
        if (!string.Equals(request.ConfirmImo?.Trim(), profile.VesselImo, StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { error = "IMO xác nhận không khớp tàu đang chạy." });

        _context.SuppressSyncQueue = true;
        int wipedRows;
        await using (var transaction = await _context.Database.BeginTransactionAsync())
        {
            try
            {
                wipedRows = await _vesselSwitch.WipeVesselDataAsync();
                await UpsertShipDataFromProfileAsync(profile);
                _context.SyncState.Add(new SyncState { Key = EdgeVesselSwitchService.FullSyncPendingKey, Value = profile.NodeId!, UpdatedAt = DateTime.UtcNow });
                await _context.SaveChangesAsync();
                await transaction.CommitAsync();
            }
            catch (Exception ex)
            {
                await transaction.RollbackAsync();
                _logger.LogError(ex, "Reset from shore failed");
                return StatusCode(500, new { error = $"Làm sạch thất bại, dữ liệu không thay đổi: {ex.Message}" });
            }
        }

        var fullSyncRequested = await _vesselSwitch.CompletePendingFullSyncAsync();
        if (fullSyncRequested)
            StartInitialPull();
        _logger.LogWarning("[VESSEL-SWITCH] Reset {NodeId} from shore: wiped {Rows} rows, fullSyncRequested={Requested}", profile.NodeId, wipedRows, fullSyncRequested);
        return Ok(new { reset = true, wipedRows, fullSyncRequested });
    }

    /// <summary>Kéo hết dữ liệu bờ vừa xếp hàng cho tàu mới, chạy nền để không giữ request.</summary>
    private void StartInitialPull()
    {
        var scopeFactory = _scopeFactory;
        var logger = _logger;
        _ = Task.Run(async () =>
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var sync = scope.ServiceProvider.GetRequiredService<ISyncService>();
                using var cts = new CancellationTokenSource(TimeSpan.FromMinutes(10));
                var total = 0;
                for (var round = 0; round < 200; round++)
                {
                    var applied = await sync.PullFromShoreAsync(cts.Token, maxItems: 500);
                    total += applied;
                    if (applied == 0) break;
                }
                logger.LogInformation("[VESSEL-SWITCH] Đã nhận {Count} gói dữ liệu từ bờ cho tàu mới", total);
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "[VESSEL-SWITCH] Kéo dữ liệu ban đầu dở dang; chu kỳ đồng bộ sẽ kéo tiếp");
            }
        });
    }

    /// <summary>GET /api/edge/provisioning/history</summary>
    [HttpGet("history")]
    public async Task<IActionResult> GetHistory()
    {
        var profiles = await _context.EdgeProvisioningProfiles
            .AsNoTracking()
            .OrderByDescending(p => p.ImportedAt)
            .Select(p => new
            {
                p.Id,
                p.IsActive,
                p.NodeId,
                p.VesselImo,
                p.VesselName,
                shoreVesselId = p.VesselId,
                p.ShoreBaseUrl,
                p.KeyVersion,
                p.ImportedAt,
                p.ImportedFrom,
                p.ActivatedAt,
                p.LastHandshakeAt,
                p.HandshakeStatus,
                p.LastHandshakeError
            })
            .ToListAsync();

        return Ok(profiles);
    }

    private static async Task<string> ExtractProvisioningJsonAsync(IFormFile file)
    {
        if (file.FileName.EndsWith(".zip", StringComparison.OrdinalIgnoreCase))
        {
            using var stream = file.OpenReadStream();
            using var archive = new ZipArchive(stream, ZipArchiveMode.Read);
            var entry = archive.GetEntry("edge-provisioning.json")
                        ?? throw new InvalidOperationException("ZIP không chứa file edge-provisioning.json.");
            using var entryStream = entry.Open();
            using var reader = new StreamReader(entryStream);
            return await reader.ReadToEndAsync();
        }

        using var jsonStream = file.OpenReadStream();
        using var jsonReader = new StreamReader(jsonStream);
        return await jsonReader.ReadToEndAsync();
    }

    private class ParsedProvisioningJson
    {
        public string SchemaVersion = "1.0";
        public string? NodeId;
        public string? VesselImo;
        public string? VesselName;
        public string? VesselCallSign;
        public string? VesselType;
        public string? VesselFlag;
        public double? GrossTonnage;
        public double? DeadWeight;
        public Guid? VesselId;
        public string? ShoreBaseUrl;
        public string? NodeApiToken;
        public string? SigningKey;
        public int KeyVersion = 1;
        public string ProtocolVersion = "2";
        public bool SecurityEnabled;
        public int BatchSize = 100;
        public int SyncIntervalSec = 30;
        public string? NetworkType = "Shore_WiFi";
    }

    /// <summary>
    /// Validates the edge-provisioning.json structure against the mandatory checklist from the plan.
    /// Returns an error message string if invalid, or null (with <paramref name="parsed"/> populated) if valid.
    /// </summary>
    private static string? ValidateProvisioningJson(JsonElement root, out ParsedProvisioningJson parsed)
    {
        parsed = new ParsedProvisioningJson();

        var schemaVersion = root.TryGetProperty("schemaVersion", out var sv) ? sv.GetString() : null;
        if (string.IsNullOrWhiteSpace(schemaVersion) || !SupportedSchemaVersions.Contains(schemaVersion))
            return $"schemaVersion không hợp lệ hoặc không hỗ trợ (nhận: '{schemaVersion}').";
        parsed.SchemaVersion = schemaVersion;

        if (!root.TryGetProperty("vessel", out var vessel))
            return "Thiếu object 'vessel' trong edge-provisioning.json.";

        parsed.VesselImo = vessel.TryGetProperty("imo", out var imo) ? imo.GetString() : null;
        parsed.VesselName = vessel.TryGetProperty("name", out var name) ? name.GetString() : null;
        if (string.IsNullOrWhiteSpace(parsed.VesselImo) || string.IsNullOrWhiteSpace(parsed.VesselName))
            return "vessel.imo and vessel.name are required.";

        parsed.VesselCallSign = vessel.TryGetProperty("callSign", out var callSign) ? callSign.GetString() : null;
        parsed.VesselType = vessel.TryGetProperty("vesselType", out var vesselType) ? vesselType.GetString() : null;
        parsed.VesselFlag = vessel.TryGetProperty("flag", out var flag) ? flag.GetString() : null;
        parsed.GrossTonnage = vessel.TryGetProperty("grossTonnage", out var gt) && gt.TryGetDouble(out var gtValue)
            ? gtValue
            : null;
        parsed.DeadWeight = vessel.TryGetProperty("deadWeight", out var dwt) && dwt.TryGetDouble(out var dwtValue)
            ? dwtValue
            : null;

        var vesselIdStr = vessel.TryGetProperty("shoreVesselId", out var vid) ? vid.GetString() : null;
        if (string.IsNullOrWhiteSpace(vesselIdStr) || !Guid.TryParse(vesselIdStr, out var vesselIdParsed))
            return "vessel.shoreVesselId không phải là GUID hợp lệ.";
        parsed.VesselId = vesselIdParsed;

        if (!root.TryGetProperty("shoreConnection", out var shoreConnection))
            return "Thiếu object 'shoreConnection'.";

        var baseUrl = shoreConnection.TryGetProperty("baseUrl", out var bu) ? bu.GetString() : null;
        if (!IsAllowedShoreBaseUrl(baseUrl))
            return "shoreConnection.baseUrl phải bắt đầu bằng 'https://' (hoặc http://localhost cho test local).";
        parsed.ShoreBaseUrl = baseUrl;

        if (!root.TryGetProperty("nodeCredentials", out var creds))
            return "Thiếu object 'nodeCredentials'.";

        parsed.NodeId = creds.TryGetProperty("nodeId", out var nodeIdEl) ? nodeIdEl.GetString() : null;
        if (string.IsNullOrWhiteSpace(parsed.NodeId) || parsed.NodeId.Any(c => char.IsWhiteSpace(c)))
            return "nodeCredentials.nodeId không được rỗng hoặc chứa khoảng trắng.";

        parsed.NodeApiToken = creds.TryGetProperty("nodeApiToken", out var tokenEl) ? tokenEl.GetString() : null;
        if (string.IsNullOrWhiteSpace(parsed.NodeApiToken))
            return "nodeCredentials.nodeApiToken không được rỗng.";

        parsed.SigningKey = creds.TryGetProperty("signingKey", out var keyEl) ? keyEl.GetString() : null;

        var keyVersion = creds.TryGetProperty("keyVersion", out var kv) ? kv.GetInt32() : 0;
        if (keyVersion <= 0)
            return "nodeCredentials.keyVersion phải là số nguyên dương.";
        parsed.KeyVersion = keyVersion;

        var protocolVersion = creds.TryGetProperty("protocolVersion", out var pv) ? pv.GetString() : null;
        if (string.IsNullOrWhiteSpace(protocolVersion) || !SupportedProtocolVersions.Contains(protocolVersion))
            return $"nodeCredentials.protocolVersion không hợp lệ hoặc không hỗ trợ (nhận: '{protocolVersion}').";
        parsed.ProtocolVersion = protocolVersion;

        parsed.SecurityEnabled = creds.TryGetProperty("securityEnabled", out var se) && se.GetBoolean();

        if (root.TryGetProperty("syncPolicy", out var syncPolicy))
        {
            if (syncPolicy.TryGetProperty("batchSize", out var bs) && bs.TryGetInt32(out var bsVal))
                parsed.BatchSize = bsVal;
            if (syncPolicy.TryGetProperty("syncIntervalSeconds", out var si) && si.TryGetInt32(out var siVal))
                parsed.SyncIntervalSec = siVal;
            if (syncPolicy.TryGetProperty("networkType", out var nt))
                parsed.NetworkType = nt.GetString();
        }

        return null;
    }

    private static string Truncate(string value, int maxLength) =>
        value.Length <= maxLength ? value : value[..maxLength];

    /// <summary>Danh tính tàu theo gói đang kích hoạt. Thông số chi tiết bờ gửi xuống sau (nhóm Vessel).</summary>
    private async Task UpsertShipDataFromProfileAsync(EdgeProvisioningProfile profile)
    {
        if (string.IsNullOrWhiteSpace(profile.VesselImo) || string.IsNullOrWhiteSpace(profile.VesselName))
            return;

        var now = DateTime.UtcNow;
        var shipData = await _context.ShipData.AsTracking().FirstOrDefaultAsync();
        if (shipData == null)
        {
            shipData = new ShipData { Id = Guid.NewGuid(), CreatedAt = now, CallSign = string.Empty, Flag = string.Empty };
            _context.ShipData.Add(shipData);
        }

        shipData.ImoNumber = profile.VesselImo.Trim();
        shipData.ShipName = profile.VesselName.Trim();
        shipData.PortOfRegistry ??= string.Empty;
        shipData.OriginNode = profile.NodeId?.Trim() ?? shipData.OriginNode;
        shipData.UpdatedAt = now;
    }

    private static bool IsAllowedShoreBaseUrl(string? baseUrl)
    {
        if (string.IsNullOrWhiteSpace(baseUrl) || !Uri.TryCreate(baseUrl, UriKind.Absolute, out var uri))
        {
            return false;
        }

        if (uri.Scheme.Equals(Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (!uri.Scheme.Equals(Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return uri.Host.Equals("localhost", StringComparison.OrdinalIgnoreCase)
            || uri.Host.Equals("host.docker.internal", StringComparison.OrdinalIgnoreCase)
            || uri.Host.Equals("127.0.0.1", StringComparison.OrdinalIgnoreCase)
            || uri.Host.Equals("::1", StringComparison.OrdinalIgnoreCase);
    }
}
