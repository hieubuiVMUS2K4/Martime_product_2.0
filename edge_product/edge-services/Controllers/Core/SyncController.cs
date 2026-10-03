using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using MaritimeEdge.Data;
using MaritimeEdge.Services.Core;

namespace MaritimeEdge.Controllers.Core;

[ApiController]
[Route("api/sync")]
[Microsoft.AspNetCore.RateLimiting.EnableRateLimiting("fixed")]
public class SyncController : ControllerBase
{
    private readonly EdgeDbContext _context;
    private readonly ILogger<SyncController> _logger;
    private readonly ISyncService _syncService;
    private readonly IHttpClientFactory _httpClientFactory;
    private readonly IConfiguration _configuration;
    private readonly IEdgeRuntimeConfigService _runtimeConfigService;

    public SyncController(EdgeDbContext context, ILogger<SyncController> logger, ISyncService syncService,
        IHttpClientFactory httpClientFactory, IConfiguration configuration, IEdgeRuntimeConfigService runtimeConfigService)
    {
        _context = context;
        _logger = logger;
        _syncService = syncService;
        _httpClientFactory = httpClientFactory;
        _configuration = configuration;
        _runtimeConfigService = runtimeConfigService;
    }

    [HttpGet("queue")]
    [Authorize(Policy = "InternalAccess")]
    public async Task<IActionResult> GetSyncQueue()
    {
        try
        {
            var queue = await _context.SyncQueue
                .AsNoTracking()
                .Where(s => s.SyncedAt == null)
                .OrderBy(s => s.Priority)
                .ThenBy(s => s.CreatedAt)
                .Take(100)
                .ToListAsync();

            return Ok(queue);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting sync queue");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet("status")]
    [Authorize(Policy = "InternalAccess")]
    public async Task<IActionResult> GetSyncStatus()
    {
        try
        {
            var pendingRecords = await _context.SyncQueue
                .AsNoTracking()
                .Where(s => s.SyncedAt == null)
                .CountAsync();

            var lastSync = await _context.SyncQueue
                .AsNoTracking()
                .Where(s => s.SyncedAt != null)
                .OrderByDescending(s => s.SyncedAt)
                .Select(s => s.SyncedAt)
                .FirstOrDefaultAsync();

            // isOnline must reflect sync connectivity, not just a reachable /api/health endpoint.
            bool shoreHealthOk = false;
            string? connectionError = null;
            try
            {
                string? shoreBaseUrl = null;
                try
                {
                    var syncConfig = await _runtimeConfigService.GetSyncConfigAsync();
                    shoreBaseUrl = syncConfig?.ShoreBaseUrl;
                }
                catch (ProvisioningRequiredException) { }
                catch (ConfigInvalidException) { }

                if (!string.IsNullOrEmpty(shoreBaseUrl))
                {
                    var client = _httpClientFactory.CreateClient("ShoreAPI");
                    using var cts = new System.Threading.CancellationTokenSource(TimeSpan.FromSeconds(5));
                    var pingResponse = await client.GetAsync($"{shoreBaseUrl}/api/health", cts.Token);
                    shoreHealthOk = pingResponse.IsSuccessStatusCode;
                    if (!shoreHealthOk)
                        connectionError = $"Shore health check failed: HTTP {(int)pingResponse.StatusCode}";
                }
                else
                {
                    connectionError = "No active Shore configuration";
                }
            }
            catch (Exception ex)
            {
                shoreHealthOk = false;
                connectionError = $"Shore health check failed: {ex.Message}";
            }

            var syncConnectivity = _syncService.GetConnectivitySnapshot();
            var isOnline = shoreHealthOk && syncConnectivity.IsReachable;
            connectionError = isOnline ? null : syncConnectivity.LastError ?? connectionError ?? "Shore sync is not reachable";

            var status = new
            {
                pendingRecords = pendingRecords,
                lastSyncAt = lastSync,
                isOnline = isOnline,
                lastConnectionError = connectionError,
                lastConnectionCheckedAt = syncConnectivity.LastCheckedAtUtc
            };

            return Ok(status);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting sync status");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpPost("trigger")]
    [Authorize(Policy = "InternalAccess")]
    public async Task<IActionResult> TriggerSync()
    {
        try
        {
            _logger.LogInformation("Manual sync triggered via API");
            
            using var cts = new CancellationTokenSource(TimeSpan.FromMinutes(5));

            // Snapshot pending count before sync
            var initialPending = await _context.SyncQueue
                .AsNoTracking()
                .Where(s => s.SyncedAt == null)
                .CountAsync(cts.Token);

            // Count items ready to sync right now (not blocked by retry backoff)
            var readyToSync = await _context.SyncQueue
                .AsNoTracking()
                .Where(s => s.SyncedAt == null && s.RetryCount < s.MaxRetries)
                .Where(s => s.NextRetryAt == null || s.NextRetryAt <= DateTime.UtcNow)
                .CountAsync(cts.Token);

            // Run enough batches to clear all ready items
            int batchSize;
            try
            {
                var syncConfig = await _runtimeConfigService.GetSyncConfigAsync();
                batchSize = syncConfig.BatchSize;
            }
            catch (ProvisioningRequiredException)
            {
                batchSize = _configuration.GetValue("Sync:BatchSize", 100);
            }
            catch (ConfigInvalidException)
            {
                batchSize = _configuration.GetValue("Sync:BatchSize", 100);
            }
            var maxBatches = (int)Math.Ceiling((double)readyToSync / Math.Max(batchSize, 1)) + 1;
            var triggerInterBatchDelayMs = Math.Max(0, _configuration.GetValue("Sync:TriggerInterBatchDelayMs", 150));
            var previousPending = initialPending;
            var noProgressCount = 0;
            const int noProgressLimit = 3;

            for (int i = 0; i < maxBatches && !cts.IsCancellationRequested; i++)
            {
                await _syncService.ExecuteSyncAsync(cts.Token);

                var pendingAfterBatch = await _context.SyncQueue
                    .AsNoTracking()
                    .Where(s => s.SyncedAt == null)
                    .CountAsync(cts.Token);

                if (pendingAfterBatch >= previousPending)
                {
                    noProgressCount++;
                    if (noProgressCount >= noProgressLimit)
                    {
                        _logger.LogWarning("Trigger sync loop stopped early after {NoProgressLimit} no-progress batches to avoid retry burst.", noProgressLimit);
                        break;
                    }
                }
                else
                {
                    noProgressCount = 0;
                }

                previousPending = pendingAfterBatch;
                if (triggerInterBatchDelayMs > 0)
                {
                    await Task.Delay(triggerInterBatchDelayMs, cts.Token);
                }
            }

            // Pull from shore (master data, assignments)
            await _syncService.PullFromShoreAsync(cts.Token);

            var pendingRecords = await _context.SyncQueue
                .AsNoTracking()
                .Where(s => s.SyncedAt == null)
                .CountAsync();

            var totalSynced = initialPending - pendingRecords;

            _logger.LogInformation("Manual sync done. Synced: {Synced}, Remaining: {Remaining}",
                totalSynced, pendingRecords);

            return Ok(new {
                message = "Đồng bộ hoàn tất",
                totalSynced,
                pendingRecords
            });
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("Manual sync timed out after 5 minutes");
            return StatusCode(408, new { error = "Sync operation timed out" });
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "Shore server unreachable during manual sync");
            return StatusCode(503, new { error = "Shore server is unreachable", detail = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during manual sync");
            return StatusCode(500, new { error = "Sync failed", detail = ex.Message });
        }
    }

    /// <summary>
    /// POST /api/sync/reset-errors — Reset retry count for all stuck items so they can be retried
    /// </summary>
    [HttpPost("reset-errors")]
    [Authorize(Policy = "InternalAccess")]
    public async Task<IActionResult> ResetErrors()
    {
        try
        {
            var stuckItems = await _context.SyncQueue
                .Where(s => s.SyncedAt == null && s.RetryCount >= s.MaxRetries)
                .ToListAsync();

            foreach (var item in stuckItems)
            {
                item.RetryCount = 0;
                item.NextRetryAt = null;
                item.LastError = null;
            }

            await _context.SaveChangesAsync();
            _logger.LogInformation("Reset {Count} stuck sync items", stuckItems.Count);

            return Ok(new { message = $"Reset {stuckItems.Count} stuck items. They will be retried in next sync cycle." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error resetting sync errors");
            return StatusCode(500, new { error = "Reset failed", detail = ex.Message });
        }
    }

    /// <summary>
    /// POST /api/sync/snapshot-crew — Queue all existing crew data for first-time (or re-)sync to Shore.
    /// Order is dependency-safe: master data (Countries, Ranks, Certificates) is queued before
    /// crew members and their dependent documents so Shore can create them in the right order.
    /// After calling this, use POST /api/sync/trigger to push queued items to Shore.
    /// </summary>
    [HttpPost("snapshot-crew")]
    [Authorize(Policy = "InternalAccess")]
    public async Task<IActionResult> SnapshotCrew()
    {
        try
        {
            _logger.LogInformation("Crew snapshot initiated");

            var jsonOptions = new System.Text.Json.JsonSerializerOptions
            {
                WriteIndented = false,
                DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
                ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles
            };

            // Build set of already-pending keys to avoid re-queuing
            var alreadyPending = await _context.SyncQueue
                .Where(q => q.SyncedAt == null)
                .Select(q => new { q.TableName, q.RecordKey })
                .ToListAsync();

            var pendingSet = new HashSet<string>(
                alreadyPending.Select(x => $"{x.TableName}:{x.RecordKey}"),
                StringComparer.OrdinalIgnoreCase);

            var toAdd = new List<SyncQueue>();
            var baseTime = DateTime.UtcNow;
            int seq = 0;

            void Enqueue(string tableName, string recordKey, object entity)
            {
                var key = $"{tableName}:{recordKey}";
                if (!pendingSet.Add(key)) return;
                toAdd.Add(new SyncQueue
                {
                    TableName   = tableName,
                    RecordKey   = recordKey,
                    ActionType  = SyncActionType.CREATE,
                    Payload     = System.Text.Json.JsonSerializer.Serialize(entity, jsonOptions),
                    Priority    = SyncPriority.Operational,
                    RetryCount  = 0,
                    MaxRetries  = 5,
                    CreatedAt   = baseTime.AddMilliseconds(seq++)
                });
            }

            // Master/reference data first so Shore can satisfy FK constraints
            var countries = await _context.Countries.AsNoTracking().ToListAsync();
            foreach (var x in countries) Enqueue("country", x.Id.ToString(), x);

            var ranks = await _context.Ranks.AsNoTracking().ToListAsync();
            foreach (var x in ranks) Enqueue("rank", x.Id.ToString(), x);

            // Danh mục loại chứng chỉ (certificate, rank_certificate, country_certificate) do BỜ làm chủ
            // và phát xuống mọi tàu. Tàu chỉ đọc, không được đẩy ngược lên — bờ vốn đã bỏ qua chúng
            // (_shoreAuthoritative), nên gửi lên chỉ tạo rác trong hàng đợi và che mất lệch dữ liệu thật.

            // Crew members (depend on Rank + Country — include nav props for FK resolution on Shore)
            var crew = await _context.CrewMembers.AsNoTracking()
                .Include(c => c.Rank)
                .Include(c => c.Country)
                .ToListAsync();
            foreach (var x in crew) Enqueue("crew_member", x.Id.ToString(), x);

            // Dependent on CrewMember (include Certificate + Country nav props for FK resolution)
            var crewCerts = await _context.CrewCertificates.AsNoTracking()
                .Include(c => c.Certificate)
                .Include(c => c.Country)
                .ToListAsync();
            foreach (var x in crewCerts) Enqueue("crew_certificate", x.CertificateNumber, x);

            var svcRecs = await _context.ServiceRecords.AsNoTracking().ToListAsync();
            foreach (var x in svcRecs) Enqueue("service_record", x.Id.ToString(), x);

            var travelDocs = await _context.TravelDocuments.AsNoTracking().ToListAsync();
            foreach (var x in travelDocs) Enqueue("travel_document", x.Id.ToString(), x);

            var seafarerDocs = await _context.SeafarerDocuments.AsNoTracking().ToListAsync();
            foreach (var x in seafarerDocs) Enqueue("seafarer_document", x.Id.ToString(), x);

            var empDocs = await _context.EmploymentDocuments.AsNoTracking().ToListAsync();
            foreach (var x in empDocs) Enqueue("employment_document", x.Id.ToString(), x);

            var healthDocs = await _context.HealthDocuments.AsNoTracking().ToListAsync();
            foreach (var x in healthDocs) Enqueue("health_document", x.Id.ToString(), x);

            var logbookEntries = await _context.CrewLogbookEntries.AsNoTracking().ToListAsync();
            foreach (var x in logbookEntries) Enqueue("crew_logbook_entry", x.Id.ToString(), x);

            if (toAdd.Count == 0)
                return Ok(new { message = "Tất cả dữ liệu thuyền viên đã có trong hàng đợi", queued = 0 });

            await _context.SyncQueue.AddRangeAsync(toAdd);
            await _context.SaveChangesAsync();

            _logger.LogInformation("Crew snapshot queued {Count} items", toAdd.Count);

            return Ok(new
            {
                message = $"Đã đưa {toAdd.Count} bản ghi thuyền viên vào hàng đợi — nhấn 'Đồng bộ ngay' để gửi lên Shore",
                queued  = toAdd.Count
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during crew snapshot");
            return StatusCode(500, new { error = "Snapshot thất bại", detail = ex.Message });
        }
    }

    // ============================================================
    // POST /api/sync/snapshot — Multi-group snapshot (new generic endpoint)
    // Supported groups: "ship_data" | "crew" | "voyage" | "report"
    // fromDate/toDate: optional ISO8601, only applied to voyage + report groups.
    // This endpoint is INDEPENDENT of /api/sync/snapshot-crew.
    // ============================================================

    /// <summary>
    /// POST /api/sync/snapshot — Queue selected data groups for full sync to Shore.
    /// Enqueue order is dependency-safe: master data first, dependent records after.
    /// Uses ActionType = SNAPSHOT so Shore applies as UPSERT (safe to run multiple times).
    /// </summary>
    [HttpPost("snapshot")]
    [Authorize(Policy = "InternalAccess")]
    public async Task<IActionResult> Snapshot([FromBody] SnapshotRequestDto request)
    {
        if (request?.Groups == null || request.Groups.Count == 0)
            return BadRequest(new { error = "Cần chỉ định ít nhất một nhóm dữ liệu" });

        var validGroups = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            { "ship_data", "crew", "voyage", "report", "pms" };
        var unknown = request.Groups.Where(g => !validGroups.Contains(g)).ToList();
        if (unknown.Count > 0)
            return BadRequest(new { error = $"Nhóm không hợp lệ: {string.Join(", ", unknown)}" });

        _logger.LogInformation("Snapshot initiated for groups: {Groups}", string.Join(", ", request.Groups));

        var jsonOptions = new System.Text.Json.JsonSerializerOptions
        {
            WriteIndented = false,
            DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
            ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles
        };

        // Build pending set to skip already-queued records
        var alreadyPending = await _context.SyncQueue
            .Where(q => q.SyncedAt == null)
            .Select(q => new { q.TableName, q.RecordKey })
            .ToListAsync();
        var pendingSet = new HashSet<string>(
            alreadyPending.Select(x => $"{x.TableName}:{x.RecordKey}"),
            StringComparer.OrdinalIgnoreCase);

        var toAdd   = new List<SyncQueue>();
        var baseTime = DateTime.UtcNow;
        int seq = 0;

        void Enqueue(string tableName, string recordKey, object entity)
        {
            if (tableName is "material_item" or "material_category" or "material_catalog_item" or "material_item_catalog") return;
            var key = $"{tableName}:{recordKey}";
            if (!pendingSet.Add(key)) return;
            toAdd.Add(new SyncQueue
            {
                TableName  = tableName,
                RecordKey  = recordKey,
                ActionType = SyncActionType.SNAPSHOT,   // UPSERT on Shore — safe to repeat
                Payload    = System.Text.Json.JsonSerializer.Serialize(entity, jsonOptions),
                Priority   = SyncPriority.Operational,
                RetryCount = 0,
                MaxRetries = 5,
                CreatedAt  = baseTime.AddMilliseconds(seq++)
            });
        }

        // Process groups in fixed dependency-safe order regardless of request order
        var orderedGroups = new[] { "ship_data", "crew", "voyage", "report", "pms" }
            .Where(g => request.Groups.Contains(g, StringComparer.OrdinalIgnoreCase));

        var groupResults = new List<object>();

        foreach (var group in orderedGroups)
        {
            var before = toAdd.Count;
            try
            {
                switch (group.ToLowerInvariant())
                {
                    // ── ship_data: single record, no date filter ──────────────────
                    case "ship_data":
                    {
                        var shipData = await _context.ShipData.AsNoTracking().FirstOrDefaultAsync();
                        if (shipData != null)
                            Enqueue("ship_data", shipData.Id.ToString(), shipData);
                        break;
                    }

                    // ── crew: reference data first, then members + documents ──────
                    case "crew":
                    {
                        var countries    = await _context.Countries.AsNoTracking().ToListAsync();
                        foreach (var x in countries) Enqueue("country", x.Id.ToString(), x);

                        var ranks        = await _context.Ranks.AsNoTracking().ToListAsync();
                        foreach (var x in ranks) Enqueue("rank", x.Id.ToString(), x);

                        // Danh mục loại chứng chỉ do BỜ làm chủ — tàu chỉ đọc, không đẩy ngược lên.
                        // Xem ghi chú ở nhánh full snapshot phía trên.

                        var crew         = await _context.CrewMembers.AsNoTracking()
                            .Include(c => c.Rank)
                            .Include(c => c.Country)
                            .ToListAsync();
                        foreach (var x in crew) Enqueue("crew_member", x.Id.ToString(), x);

                        var crewCerts    = await _context.CrewCertificates.AsNoTracking()
                            .Include(c => c.Certificate)
                            .Include(c => c.Country)
                            .ToListAsync();
                        foreach (var x in crewCerts) Enqueue("crew_certificate", x.CertificateNumber, x);

                        var svcRecs      = await _context.ServiceRecords.AsNoTracking().ToListAsync();
                        foreach (var x in svcRecs) Enqueue("service_record", x.Id.ToString(), x);

                        var travelDocs   = await _context.TravelDocuments.AsNoTracking().ToListAsync();
                        foreach (var x in travelDocs) Enqueue("travel_document", x.Id.ToString(), x);

                        var seafarerDocs = await _context.SeafarerDocuments.AsNoTracking().ToListAsync();
                        foreach (var x in seafarerDocs) Enqueue("seafarer_document", x.Id.ToString(), x);

                        var empDocs      = await _context.EmploymentDocuments.AsNoTracking().ToListAsync();
                        foreach (var x in empDocs) Enqueue("employment_document", x.Id.ToString(), x);

                        var healthDocs   = await _context.HealthDocuments.AsNoTracking().ToListAsync();
                        foreach (var x in healthDocs) Enqueue("health_document", x.Id.ToString(), x);

                        var logbookEntries = await _context.CrewLogbookEntries.AsNoTracking().ToListAsync();
                        foreach (var x in logbookEntries) Enqueue("crew_logbook_entry", x.Id.ToString(), x);
                        break;
                    }

                    // ── voyage: filtered by DepartureTime (nullable → fallback CreatedAt) ──
                    case "voyage":
                    {
                        var all = await _context.VoyageRecords.AsNoTracking().ToListAsync();
                        var filtered = all.Where(v =>
                        {
                            var d = v.DepartureTime ?? v.CreatedAt;
                            if (request.FromDate.HasValue && d < request.FromDate.Value) return false;
                            if (request.ToDate.HasValue   && d > request.ToDate.Value.AddDays(1)) return false;
                            return true;
                        });
                        foreach (var x in filtered) Enqueue("voyage_record", x.Id.ToString(), x);
                        break;
                    }

                    // ── pms: catalog master data first, then logistics documents ────────────────────
                    case "pms":
                    {
                        // Catalog — master data (no FK deps between them)
                        var equipmentGroups = await _context.EquipmentGroups.AsNoTracking().ToListAsync();
                        foreach (var x in equipmentGroups) Enqueue("equipment_group", x.Id.ToString(), x);


                        var storeLocations = await _context.StoreLocations.AsNoTracking().ToListAsync();
                        foreach (var x in storeLocations) Enqueue("store_location", x.Id.ToString(), x);

                        // Equipment assets (depend on EquipmentGroup)
                        var equipmentAssets = await _context.EquipmentAssets.AsNoTracking().ToListAsync();
                        foreach (var x in equipmentAssets) Enqueue("equipment_asset", x.Id.ToString(), x);

                        // Shore-managed material definitions are never uploaded.

                        // Logistics — documents (depend on MaterialItem + StoreLocation)
                        var materialRequests = await _context.MaterialRequests.AsNoTracking().ToListAsync();
                        foreach (var x in materialRequests) Enqueue("material_request", x.Id.ToString(), x);

                        var materialRequestItems = await _context.MaterialRequestItems.AsNoTracking().ToListAsync();
                        foreach (var x in materialRequestItems) Enqueue("material_request_item", x.Id.ToString(), x);

                        var stockReceipts = await _context.StockReceipts.AsNoTracking().ToListAsync();
                        foreach (var x in stockReceipts) Enqueue("stock_receipt", x.Id.ToString(), x);

                        var stockReceiptItems = await _context.StockReceiptItems.AsNoTracking().ToListAsync();
                        foreach (var x in stockReceiptItems) Enqueue("stock_receipt_item", x.Id.ToString(), x);

                        // Inventory (depends on MaterialItem + StoreLocation)
                        var inventoryStocks = await _context.InventoryStocks.AsNoTracking().ToListAsync();
                        foreach (var x in inventoryStocks) Enqueue("inventory_stock", x.Id.ToString(), x);

                        // Material-Equipment mappings
                        var materialItemEquipments = await _context.MaterialItemEquipments.AsNoTracking().ToListAsync();
                        foreach (var x in materialItemEquipments) Enqueue("material_item_equipment", x.Id.ToString(), x);

                        // Maintenance tasks (execution data — Edge is authority)
                        var maintenanceTasks = await _context.MaintenanceTasks
                            .Where(t => !t.IsDeleted)
                            .AsNoTracking().ToListAsync();
                        foreach (var x in maintenanceTasks) Enqueue("maintenance_task", x.Id.ToString(), x);

                        // Maintenance history (completed work records)
                        var maintenanceHistories = await _context.MaintenanceHistories.AsNoTracking().ToListAsync();
                        foreach (var x in maintenanceHistories) Enqueue("maintenance_history", x.Id.ToString(), x);

                        break;
                    }

                    // ── report: ReportType (master) → MaritimeReport → NoonReport ──
                    case "report":
                    {
                        // Master data — always include regardless of date filter
                        var reportTypes = await _context.ReportTypes.AsNoTracking().ToListAsync();
                        foreach (var x in reportTypes) Enqueue("report_type", x.Id.ToString(), x);

                        // MaritimeReports with optional date filter.
                        // Shore only accepts transmitted reports; APPROVED reports must stay on Edge
                        // until the user explicitly transmits them.
                        var allReports = await _context.MaritimeReports.AsNoTracking().ToListAsync();
                        var reports = allReports.Where(r =>
                        {
                            if (!string.Equals(r.Status, "TRANSMITTED", StringComparison.OrdinalIgnoreCase)) return false;
                            if (request.FromDate.HasValue && r.ReportDateTime < request.FromDate.Value) return false;
                            if (request.ToDate.HasValue   && r.ReportDateTime > request.ToDate.Value.AddDays(1)) return false;
                            return true;
                        }).ToList();
                        foreach (var x in reports) Enqueue("maritime_report", x.Id.ToString(), x);

                        // NoonReports linked to the filtered MaritimeReports (VoyageId already nullable)
                        if (reports.Count > 0)
                        {
                            var rptIds = reports.Select(r => r.Id).ToHashSet();
                            var noons  = await _context.NoonReports
                                .AsNoTracking()
                                .Where(n => rptIds.Contains(n.MaritimeReportId))
                                .ToListAsync();
                            foreach (var x in noons) Enqueue("noon_report", x.Id.ToString(), x);
                        }
                        break;
                    }
                }
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Snapshot failed for group: {Group}", group);
            }

            groupResults.Add(new
            {
                name  = group,
                label = group.ToLowerInvariant() switch
                {
                    "ship_data" => "Thông tin tàu",
                    "crew"      => "Thuyền viên",
                    "voyage"    => "Chuyến đi",
                    "report"    => "Báo cáo",
                    "pms"       => "PMS (Thiết bị / Vật tư / Kho)",
                    _           => group
                },
                count = toAdd.Count - before
            });
        }

        if (toAdd.Count == 0)
            return Ok(new { message = "Tất cả dữ liệu đã có trong hàng đợi", queued = 0, groups = groupResults });

        await _context.SyncQueue.AddRangeAsync(toAdd);
        await _context.SaveChangesAsync();

        _logger.LogInformation("Snapshot queued {Count} items for groups: {Groups}",
            toAdd.Count, string.Join(", ", request.Groups));

        return Ok(new
        {
            message = $"Đã đưa {toAdd.Count} bản ghi vào hàng đợi — nhấn 'Đồng bộ ngay' để gửi lên Shore",
            queued  = toAdd.Count,
            groups  = groupResults
        });
    }

    /// <summary>
    /// Lấy danh sách thông báo thuyền viên được đồng bộ từ bờ xuống tàu.
    /// Dùng để hiển thị thông báo trên edge dashboard khi bờ cập nhật thông tin thuyền viên.
    /// </summary>
    [HttpGet("notifications")]
    [Authorize(Policy = "InternalAccess")]
    public async Task<IActionResult> GetSyncNotifications(
        [FromQuery] int limit = 30,
        [FromQuery] DateTime? since = null)
    {
        try
        {
            var query = _context.SystemLogs
                .AsNoTracking()
                .Where(l => l.Category == "SYNC" &&
                            (l.Action == "CREW_UPDATED_FROM_SHORE" ||
                             l.Action == "CREW_CREATED_FROM_SHORE"));

            if (since.HasValue)
            {
                var sinceUtc = DateTime.SpecifyKind(since.Value, DateTimeKind.Utc);
                query = query.Where(l => l.Timestamp > sinceUtc);
            }

            var notifications = await query
                .OrderByDescending(l => l.Timestamp)
                .Take(limit)
                .Select(l => new
                {
                    id        = l.Id,
                    timestamp = l.Timestamp,
                    action    = l.Action,
                    message   = l.Message,
                    entityId  = l.EntityId,
                    newValues = l.NewValues,
                    oldValues = l.OldValues
                })
                .ToListAsync();

            return Ok(notifications);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting sync notifications");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Lấy thông báo chưa xem cho một thứ viên cụ thể.
    /// Được gọi khi mở CrewDetailPage để hiển thị field-level diff.
    /// </summary>
    [HttpGet("notifications/crew/{crewId}")]
    [Authorize(Policy = "InternalAccess")]
    public async Task<IActionResult> GetCrewNotifications(string crewId)
    {
        try
        {
            var items = await _context.SystemLogs
                .AsNoTracking()
                .Where(l => l.Category == "SYNC" &&
                            l.EntityId == crewId &&
                            (l.Action == "CREW_UPDATED_FROM_SHORE" ||
                             l.Action == "CREW_CREATED_FROM_SHORE") &&
                            l.Result != "VIEWED")
                .OrderByDescending(l => l.Timestamp)
                .Take(10)
                .Select(l => new
                {
                    id        = l.Id,
                    timestamp = l.Timestamp,
                    action    = l.Action,
                    message   = l.Message,
                    newValues = l.NewValues,
                    oldValues = l.OldValues
                })
                .ToListAsync();

            return Ok(items);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting crew notifications for {CrewId}", crewId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Đánh dấu các thông báo của một thứ viên là đã xem (khi user nhấn Save).
    /// </summary>
    [HttpPost("notifications/crew/{crewId}/mark-viewed")]
    [Authorize(Policy = "InternalAccess")]
    public async Task<IActionResult> MarkCrewNotificationsViewed(string crewId)
    {
        try
        {
            var items = await _context.SystemLogs
                .Where(l => l.Category == "SYNC" &&
                            l.EntityId == crewId &&
                            (l.Action == "CREW_UPDATED_FROM_SHORE" ||
                             l.Action == "CREW_CREATED_FROM_SHORE") &&
                            l.Result != "VIEWED")
                .ToListAsync();

            foreach (var log in items)
                log.Result = "VIEWED";

            await _context.SaveChangesAsync();
            return Ok(new { cleared = items.Count });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error marking crew notifications viewed for {CrewId}", crewId);
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// Trả về map { crewId → số field thay đổi chưa xem } cho tất cả crew có thông báo chưa xem.
    /// Dùng để hiển thị badge đỏ trong crew list.
    /// </summary>
    [HttpGet("notifications/crew-summary")]
    [Authorize(Policy = "InternalAccess")]
    public async Task<IActionResult> GetCrewNotificationSummary()
    {
        try
        {
            var logs = await _context.SystemLogs
                .AsNoTracking()
                .Where(l => l.Category == "SYNC" &&
                            (l.Action == "CREW_UPDATED_FROM_SHORE" ||
                             l.Action == "CREW_CREATED_FROM_SHORE") &&
                            l.Result != "VIEWED" &&
                            l.EntityId != null)
                .Select(l => new { l.EntityId, l.NewValues })
                .ToListAsync();

            // Count changed fields per crew (newest entry per crew)
            var summary = new Dictionary<string, int>();
            foreach (var log in logs)
            {
                if (log.EntityId == null) continue;
                try
                {
                    if (log.NewValues != null)
                    {
                        var nv = System.Text.Json.JsonSerializer.Deserialize<System.Text.Json.JsonElement>(log.NewValues);
                        if (nv.TryGetProperty("changedFields", out var cf) && cf.ValueKind == System.Text.Json.JsonValueKind.Array)
                        {
                            var count = cf.GetArrayLength();
                            if (!summary.ContainsKey(log.EntityId) || summary[log.EntityId] < count)
                                summary[log.EntityId] = count;
                        }
                    }
                    if (!summary.ContainsKey(log.EntityId))
                        summary[log.EntityId] = 1;
                }
                catch { summary[log.EntityId] = 1; }
            }

            return Ok(summary);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting crew notification summary");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }
}

/// <summary>Request body for POST /api/sync/snapshot</summary>
public class SnapshotRequestDto
{
    /// <summary>Groups to include. Valid values: "ship_data", "crew", "voyage", "report"</summary>
    public List<string> Groups { get; set; } = new();

    /// <summary>
    /// Optional lower bound for time-filtered groups (voyage, report).
    /// Records with date before this value are excluded.
    /// Leave null to include all records with no lower bound.
    /// </summary>
    public DateTime? FromDate { get; set; }

    /// <summary>
    /// Optional upper bound for time-filtered groups (voyage, report).
    /// Records with date after this value + 1 day are excluded.
    /// Leave null to include all records with no upper bound.
    /// </summary>
    public DateTime? ToDate { get; set; }
}

