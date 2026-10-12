using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using ProductApi.Services.Network;
using Maritime.Shared.Models.Sync;

namespace ProductApi.Services.Background
{
    /// <summary>
    /// Phase 2.2: Network-Aware Sync Background Service
    /// 
    /// Monitors network conditions and adjusts sync behavior adaptively.
    /// Key features:
    /// - Detects network type (WiFi, Cellular, Satellite, Offline)
    /// - Adjusts sync frequency based on network quality
    /// - Filters outgoing sync batches by priority for poor networks
    /// 
    /// Sync Behavior by Network Type:
    /// - WiFi: Check every 5s, send all priorities
    /// - Cellular 4G: Check every 30s, send Critical + Operational
    /// - Satellite VSAT: Check every 3 min, send Critical only
    /// - Iridium: Check every 3 min, send Critical only
    /// - Offline: Check every 1 min, queue for later
    /// 
    /// This prevents overwhelming low-bandwidth networks with low-priority data
    /// while maximizing critical data delivery across all network types.
    /// </summary>
    public class NetworkAwareSyncBackgroundService : Microsoft.Extensions.Hosting.BackgroundService
    {
        private readonly IServiceProvider _serviceProvider;
        private readonly ILogger<NetworkAwareSyncBackgroundService> _logger;

        public NetworkAwareSyncBackgroundService(
            IServiceProvider serviceProvider,
            ILogger<NetworkAwareSyncBackgroundService> logger)
        {
            _serviceProvider = serviceProvider;
            _logger = logger;
        }

        /// <summary>
        /// Đẩy lại các kỳ phục vụ và thuyền viên còn IsSynced = false xuống đúng con tàu.
        ///
        /// Vì sao cần: một cú đẩy có thể "thành công" ở tầng vận chuyển nhưng bên nhận lại
        /// từ chối áp dụng do luật sở hữu trường. Khi đó hàng đợi sạch, không còn gì kẹt, nên
        /// không có cơ chế nào tự thử lại — bờ và tàu lệch nhau vĩnh viễn. Ngày 29/07/2026 hai
        /// thuyền viên đã cho xuống tàu trên bờ nhưng dưới tàu vẫn hiện đang phục vụ vì lý do đó.
        ///
        /// Cột IsSynced chỉ trở thành true khi tàu xác nhận đã áp dụng, nên nó là thước đo đúng.
        /// Node đích lấy từ VesselId của KỲ PHỤC VỤ, không lấy từ thuyền viên — sau khi cho
        /// xuống tàu thì VesselId của thuyền viên đã bị xoá về null.
        /// </summary>
        private async Task ReconcileUnsyncedCrewRecordsAsync(IServiceProvider sp, CancellationToken token)
        {
            try
            {
                var db = sp.GetRequiredService<ProductApi.Data.AppDbContext>();
                var outbox = sp.GetRequiredService<ProductApi.Services.Sync.ISyncOutboxService>();

                var stale = await db.CrewLogbookEntries
                    .AsNoTracking()
                    .Where(e => !e.IsSynced && e.VesselId != null && e.EntryType == "SEA_SERVICE")
                    .OrderBy(e => e.UpdatedAt)
                    .Take(50)
                    .ToListAsync(token);

                if (stale.Count == 0) return;

                var vesselIds = stale.Select(e => e.VesselId!.Value).Distinct().ToList();
                var imoByVessel = await db.Vessels.AsNoTracking()
                    .Where(v => vesselIds.Contains(v.Id))
                    .ToDictionaryAsync(v => v.Id, v => v.IMO, token);

                var resent = 0;
                foreach (var entry in stale)
                {
                    if (!imoByVessel.TryGetValue(entry.VesselId!.Value, out var imo)
                        || string.IsNullOrWhiteSpace(imo)) continue;

                    // Chỉ thuyền viên CÒN thuộc tàu đó. Người đã rời tàu thì danh sách đối chiếu (crew_roster) đã gỡ
                    // khỏi tàu — gửi lại hồ sơ sẽ dựng lại người không còn thuộc tàu, còn sổ của họ thì tàu không áp
                    // được (thiếu thuyền viên) nên không bao giờ xác nhận → gửi lại mãi mỗi 30 giây.
                    var crew = await db.CrewMembers.AsNoTracking()
                        .FirstOrDefaultAsync(c => c.Id == entry.CrewMemberId, token);
                    if (crew == null || crew.VesselId != entry.VesselId) continue;

                    // Gói trước còn chờ tàu nhận (tàu ngoài vùng phủ sóng): không xếp chồng thêm.
                    var key = entry.Id.ToString();
                    if (await db.SyncOutbox.AnyAsync(o => o.TableName == "crew_logbook_entry" && o.RecordKey == key && o.DeliveredAt == null, token))
                        continue;

                    await outbox.EnqueueAsync(imo, "crew_logbook_entry", key,
                        Maritime.Shared.Models.Sync.SyncActionType.SNAPSHOT, entry);

                    // Bản ghi thuyền viên đi kèm: trạng thái lên/xuống tàu nằm ở đó, không nằm trong sổ
                    await outbox.EnqueueAsync(imo, "crew_member", crew.Id.ToString(),
                        Maritime.Shared.Models.Sync.SyncActionType.UPDATE, crew);

                    resent++;
                }

                if (resent > 0)
                    _logger.LogInformation("[NETWORK-SYNC] Đối soát: đẩy lại {Count} kỳ phục vụ chưa được tàu áp dụng", resent);
            }
            catch (OperationCanceledException) when (token.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception ex)
            {
                // Không để việc đối soát làm hỏng cả chu kỳ đồng bộ
                _logger.LogWarning(ex, "[NETWORK-SYNC] Đối soát kỳ phục vụ thất bại, bỏ qua chu kỳ này");
            }
        }

        protected override async Task ExecuteAsync(CancellationToken stoppingToken)
        {
            _logger.LogInformation("[NETWORK-SYNC] Network-aware sync service started");

            try
            {
                while (!stoppingToken.IsCancellationRequested)
                {
                    try
                    {
                        using (var scope = _serviceProvider.CreateAsyncScope())
                        {
                            var networkDetectionService = scope.ServiceProvider.GetRequiredService<INetworkDetectionService>();
                            
                            // Get current network quality metrics
                            var metrics = await networkDetectionService.GetNetworkQualityAsync();

                            // Perform sync if network is active
                            if (metrics.IsActive && metrics.Type != NetworkType.None)
                            {
                                await ReconcileUnsyncedCrewRecordsAsync(scope.ServiceProvider, stoppingToken);
                                await PerformNetworkAwareSyncAsync(metrics);
                            }
                            else
                            {
                                _logger.LogWarning("[NETWORK-SYNC] Network is offline, queueing sync for later");
                            }

                            // Adapt check interval based on network type
                            int intervalSeconds = GetCheckIntervalSeconds(metrics.Type);
                            await Task.Delay(TimeSpan.FromSeconds(intervalSeconds), stoppingToken);
                        }
                    }
                    catch (OperationCanceledException)
                    {
                        // Service is stopping
                        break;
                    }
                    catch (Exception ex)
                    {
                        // Logging providers are being disposed during shutdown.
                        if (stoppingToken.IsCancellationRequested) break;

                        _logger.LogError(
                            ex,
                            "[NETWORK-SYNC] Error in network-aware sync loop");
                        
                        // Wait a bit before retrying
                        await Task.Delay(TimeSpan.FromSeconds(30), stoppingToken);
                    }
                }
            }
            finally
            {
                _logger.LogInformation("[NETWORK-SYNC] Network-aware sync service stopped");
            }
        }

        private async Task PerformNetworkAwareSyncAsync(NetworkQualityMetrics metrics)
        {
            // Get max sync priority for this network type
            int maxSyncPriority = metrics.Type.GetMaxSyncPriority();

            _logger.LogInformation(
                "[NETWORK-SYNC] Network: {Type}, Latency: {Latency}ms, Max Priority: {Priority} ({Description})",
                metrics.Type, metrics.EstimatedLatencyMs, maxSyncPriority,
                metrics.Type.GetSyncPriorityDescription());

            // TODO: Integrate with actual ISyncOutboxService
            // Filter sync items by maxSyncPriority and attempt send
            // Only items with priority <= maxSyncPriority should be sent

            await Task.CompletedTask;
        }

        private int GetCheckIntervalSeconds(NetworkType networkType)
        {
            return networkType switch
            {
                NetworkType.Shore_WiFi => 5,          // WiFi: check every 5s
                NetworkType.Cellular_4G => 30,        // 4G: check every 30s
                NetworkType.Satellite_VSAT => 180,    // VSAT: check every 3 minutes
                NetworkType.Satellite_Iridium => 180, // Iridium: check every 3 minutes
                NetworkType.None => 60,               // Offline: check every 1 minute
                _ => 30                               // Default to 4G interval
            };
        }
    }
}
