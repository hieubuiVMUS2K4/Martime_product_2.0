using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using ProductApi.Data;
using ProductApi.Models;
using ProductApi.Services;
using Maritime.Shared.DTOs.Sync;
using Maritime.Shared.Models.Sync;
using Maritime.Shared.Models.Crew;
using Maritime.Shared.Models.CrewManagement;
using Maritime.Shared.Models.Documents;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ProductApi.Services.Sync;

/// <summary>
/// Interface for processing incoming sync items from Edge → Shore.
/// </summary>
public interface ISyncInboxService
{
    /// <summary>Process a single incoming sync item.</summary>
    Task ProcessIncomingAsync(SyncQueueItemDto item);

    /// <summary>
    /// Process a batch of sync items with bulk optimizations.
    /// Groups by table for efficient bulk inserts, checks idempotency.
    /// Returns counts plus per-item failure details for diagnostics.
    /// </summary>
    Task<SyncBatchProcessResult> ProcessBatchAsync(List<SyncQueueItemDto> items);

    /// <summary>Check if an item has already been processed (idempotency).</summary>
    Task<bool> IsAlreadyProcessedAsync(string tableName, string recordKey, long syncVersion);
}

/// <summary>
/// Processes incoming sync data from Edge (ship) nodes.
/// Handles CREATE/UPDATE/DELETE for all syncable entity types.
/// Integrates with ConflictResolverService for domain-based conflict resolution.
/// Enhanced with: batch processing, idempotency keys, and hash validation.
/// </summary>
public sealed class SyncBatchItemFailure
{
    public string TableName { get; init; } = string.Empty;
    public string RecordKey { get; init; } = string.Empty;
    public string? ActionType { get; init; }
    public string Error { get; init; } = string.Empty;
}

public sealed class SyncBatchProcessResult
{
    public int Succeeded { get; set; }
    public int Failed { get; set; }
    public List<SyncBatchItemFailure> FailedItems { get; } = new();
}

public class SyncInboxService : ISyncInboxService
{
    private readonly AppDbContext _context;
    private readonly IConfiguration _configuration;
    private readonly IConflictResolverService _conflictResolver;
    private readonly ILogger<SyncInboxService> _logger;
    private readonly INotificationService _notifications;
    private readonly ISyncFileStorageService _syncFileStorageService;
    private readonly string _receiverNodeId;


    /// <summary>
    /// Converts all DateTime/DateTimeOffset values to UTC when deserializing,
    /// preventing Npgsql "Cannot write DateTime with Kind=Local" errors.
    /// </summary>
    private sealed class UtcDateTimeConverter : JsonConverter<DateTime>
    {
        public override DateTime Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
        {
            var dt = reader.GetDateTime();
            return dt.Kind == DateTimeKind.Unspecified
                ? DateTime.SpecifyKind(dt, DateTimeKind.Utc)
                : dt.ToUniversalTime();
        }
        public override void Write(Utf8JsonWriter writer, DateTime value, JsonSerializerOptions options)
            => writer.WriteStringValue(value.ToUniversalTime().ToString("O"));
    }

    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
        Converters = { new UtcDateTimeConverter() }
    };

    /// <summary>
    /// Converts a JSON string with snake_case keys to camelCase keys so that
    /// System.Text.Json's PropertyNameCaseInsensitive can match them to
    /// PascalCase C# properties (e.g. "full_name" → "fullName" → FullName).
    /// </summary>
    /// <summary>
    /// Vài trường được đặt tên khác nhau ở hai bên. Tàu gọi mã vật tư trên tàu là ItemCode
    /// (bảng material_item_ship), bờ đổi tên thành ShipItemCode khi tách danh mục ra riêng.
    /// Không đổi tên khi nhận thì trường rơi vào khoảng trống: cột để rỗng, và vì bờ có ràng
    /// buộc duy nhất (VesselId, ShipItemCode) nên vật tư thứ hai của cùng một tàu sẽ đâm
    /// 23505 vào vật tư đầu tiên — chỉ đồng bộ được đúng 1 dòng rồi tắc.
    /// </summary>
    /// CHỈ áp cho MaterialItemShip. Danh mục vật tư và dòng phiếu nhập kho cũng có ItemCode
    /// nhưng bên bờ vẫn giữ nguyên tên, đổi tràn lan sẽ làm rỗng cột của chúng.
    /// So khớp KHÔNG phân biệt hoa thường: tàu gửi khoá PascalCase ("ItemCode"), còn bộ
    /// chuẩn hoá chỉ đổi snake_case sang camelCase chứ không hạ chữ cái đầu.
    private static string RenameDivergentField(string key, Type? entityType)
    {
        if (entityType == typeof(ProductApi.Models.MaterialItemShip)
            && string.Equals(key, "itemCode", StringComparison.OrdinalIgnoreCase))
            return "shipItemCode";
        return key;
    }

    private static string NormalizePayloadToCamelCase(string json, Type? entityType = null)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var dict = new Dictionary<string, object?>();
            foreach (var prop in doc.RootElement.EnumerateObject())
            {
                // Convert snake_case → camelCase
                var camelKey = System.Text.RegularExpressions.Regex.Replace(
                    prop.Name, "_([a-z])", m => m.Groups[1].Value.ToUpperInvariant());
                dict[camelKey] = prop.Value.ValueKind == JsonValueKind.Null
                    ? null
                    : prop.Value.GetRawText();
            }
            // Re-serialize keeping raw values to avoid double-encoding
            var sb = new System.Text.StringBuilder("{");
            bool first = true;
            using var doc2 = JsonDocument.Parse(json);
            foreach (var prop in doc2.RootElement.EnumerateObject())
            {
                var camelKey = System.Text.RegularExpressions.Regex.Replace(
                    prop.Name, "_([a-z])", m => m.Groups[1].Value.ToUpperInvariant());
                camelKey = RenameDivergentField(camelKey, entityType);
                if (!first) sb.Append(',');
                sb.Append(JsonSerializer.Serialize(camelKey));
                sb.Append(':');
                sb.Append(prop.Value.GetRawText());
                first = false;
            }
            sb.Append('}');
            return sb.ToString();
        }
        catch
        {
            return json; // Return original if parsing fails
        }
    }

    // Maps edge table names (snake_case) to entity types
    private static readonly Dictionary<string, Type> _tableEntityMap = new(StringComparer.OrdinalIgnoreCase)
    {
        // Telemetry / Reports
        ["position_data"]    = typeof(ProductApi.Models.PositionData),
        ["engine_data"]      = typeof(ProductApi.Models.EngineData),
        ["voyage_record"]    = typeof(ProductApi.Models.VoyageRecord),
        ["port"]             = typeof(ProductApi.Models.Port),
        ["voyage_plan_leg"]  = typeof(ProductApi.Models.VoyagePlanLeg),
        ["voyage_status_history"] = typeof(ProductApi.Models.VoyageStatusHistory),
        ["port_call"]        = typeof(ProductApi.Models.PortCall),
        ["voyage_crew_assignment"] = typeof(ProductApi.Models.VoyageCrewAssignment),
        ["cargo_operation"]  = typeof(ProductApi.Models.CargoOperation),
        ["voyage_log_entry"] = typeof(ProductApi.Models.VoyageLogEntry),
        ["voyage_cargo_plan"] = typeof(ProductApi.Models.VoyageCargoPlan),
        ["voyage_bunker_plan"] = typeof(ProductApi.Models.VoyageBunkerPlan),
        ["voyage_crew_change_plan"] = typeof(ProductApi.Models.VoyageCrewChangePlan),
        ["voyage_cost_estimate"] = typeof(ProductApi.Models.VoyageCostEstimate),
        ["voyage_revenue_estimate"] = typeof(ProductApi.Models.VoyageRevenueEstimate),
        ["voyage_expense_request"] = typeof(ProductApi.Models.VoyageExpenseRequest),
        ["voyage_advance_payment"] = typeof(ProductApi.Models.VoyageAdvancePayment),
        ["voyage_disbursement"] = typeof(ProductApi.Models.VoyageDisbursement),
        ["voyage_actual_revenue"] = typeof(ProductApi.Models.VoyageActualRevenue),
        ["voyage_settlement"] = typeof(ProductApi.Models.VoyageSettlement),
        ["maritime_report"]  = typeof(ProductApi.Models.MaritimeReport),
        ["noon_report"]      = typeof(ProductApi.Models.NoonReport),
        ["departure_report"] = typeof(ProductApi.Models.DepartureReport),
        ["arrival_report"]   = typeof(ProductApi.Models.ArrivalReport),
        ["bunker_report"]    = typeof(ProductApi.Models.BunkerReport),
        ["position_report"]  = typeof(ProductApi.Models.PositionReport),

        // Crew Management
        ["crew_member"]         = typeof(CrewMember),
        ["crew_logbook_entry"]  = typeof(CrewLogbookEntry),
        ["certificate"]         = typeof(Certificate),
        ["crew_certificate"]    = typeof(CrewCertificate),
        ["country"]             = typeof(Country),
        ["rank"]                = typeof(Rank),
        ["rank_certificate"]    = typeof(RankCertificate),
        ["country_certificate"] = typeof(CountryCertificate),
        ["service_record"]      = typeof(ServiceRecord),

        // Crew Documents
        ["travel_document"]      = typeof(TravelDocument),
        ["seafarer_document"]    = typeof(SeafarerDocument),
        ["employment_document"]  = typeof(EmploymentDocument),
        ["health_document"]      = typeof(HealthDocument),

        // Crew Management Workflow — onboard events from Edge
        ["onboard_event"]        = typeof(OnboardEvent),
        ["sign_on_record"]       = typeof(SignOnRecord),
        ["sign_off_record"]      = typeof(SignOffRecord),
        ["crew_access_grant"]    = typeof(CrewAccessGrant),

        // PMS — Equipment
        ["equipment_group"]        = typeof(ProductApi.Models.EquipmentGroup),
        ["equipment_group_member"] = typeof(ProductApi.Models.EquipmentGroupMember),
        ["equipment_asset"]        = typeof(ProductApi.Models.EquipmentAsset),

        // Materials — Catalog
        ["material_category"]      = typeof(ProductApi.Models.MaterialCategory),
        // Vật tư theo tàu (có VesselId, số lượng) — đồng bộ từ edge lên.
        ["material_item"]          = typeof(ProductApi.Models.MaterialItemShip),
        // Danh mục vật tư dùng chung (shore-authoritative, đẩy xuống edge).
        ["material_item_catalog"]  = typeof(ProductApi.Models.MaterialItem),
        ["material_item_equipment"]= typeof(ProductApi.Models.MaterialItemEquipment),
        ["store_location"]         = typeof(ProductApi.Models.StoreLocation),

        // Materials — Logistics
        ["material_request"]       = typeof(ProductApi.Models.MaterialRequest),
        ["material_request_item"]  = typeof(ProductApi.Models.MaterialRequestItem),
        ["stock_receipt"]          = typeof(ProductApi.Models.StockReceipt),
        ["stock_receipt_item"]     = typeof(ProductApi.Models.StockReceiptItem),
        ["inventory_stock"]        = typeof(ProductApi.Models.InventoryStock),

        // PMS — Maintenance Tasks (synced from Edge, read-only on Shore)
        ["maintenance_task"]       = typeof(ProductApi.Models.MaintenanceTask),
        ["maintenance_history"]    = typeof(ProductApi.Models.MaintenanceHistory),
        ["maintenance_schedule"]   = typeof(ProductApi.Models.MaintenanceSchedule),
        ["schedule_spare_part"]    = typeof(ProductApi.Models.ScheduleSparePart),
        ["schedule_checklist_template"] = typeof(ProductApi.Models.ScheduleChecklistTemplate),

        // Telemetry — additional sensor data from Edge
        ["ais_data"]               = typeof(ProductApi.Models.AisData),
        ["fuel_consumption"]       = typeof(ProductApi.Models.FuelConsumptionData),
        ["tank_level"]             = typeof(ProductApi.Models.TankLevel),
        ["generator_data"]         = typeof(ProductApi.Models.GeneratorData),
        ["safety_alarm"]           = typeof(ProductApi.Models.SafetyAlarm),
        ["engine_event"]           = typeof(ProductApi.Models.EngineEvent),

        // Reporting — master data from Edge
        ["report_type"]            = typeof(ProductApi.Models.ReportType),

        // SMS — Safety Management System
        ["ism_element"]                    = typeof(ProductApi.Models.IsmElement),
        ["ism_elements"]                   = typeof(ProductApi.Models.IsmElement),
        ["sms_procedure"]                  = typeof(ProductApi.Models.SmsProcedure),
        ["sms_procedures"]                 = typeof(ProductApi.Models.SmsProcedure),
        ["sms_procedure_acknowledge"]      = typeof(ProductApi.Models.SmsProcedureAcknowledge),
        ["sms_procedure_acknowledges"]     = typeof(ProductApi.Models.SmsProcedureAcknowledge),
        ["sms_procedure_acknowledgement"]  = typeof(ProductApi.Models.SmsProcedureAcknowledge),
        ["sms_procedure_acknowledgments"]  = typeof(ProductApi.Models.SmsProcedureAcknowledge),
        ["sms_procedure_acknowledgements"] = typeof(ProductApi.Models.SmsProcedureAcknowledge),
        ["sms_form_template"]              = typeof(ProductApi.Models.SmsFormTemplate),
        ["sms_form_templates"]             = typeof(ProductApi.Models.SmsFormTemplate),
        ["sms_filled_record"]              = typeof(ProductApi.Models.SmsFilledRecord),
        ["sms_filled_records"]             = typeof(ProductApi.Models.SmsFilledRecord),
    };

    // Some sync producers emit plural table names while Shore expects singular.
    // Canonicalize them early so downstream conflict and idempotency rules are consistent.
    private static readonly Dictionary<string, string> _tableAliases = new(StringComparer.OrdinalIgnoreCase)
    {
        ["crew_logbook_entries"] = "crew_logbook_entry",
        ["voyage_records"] = "voyage_record",
        ["voyage_plan_legs"] = "voyage_plan_leg",
        ["voyage_status_histories"] = "voyage_status_history",
        ["port_calls"] = "port_call",
        ["voyage_crew_assignments"] = "voyage_crew_assignment",
        ["cargo_operations"] = "cargo_operation",
        ["voyage_log_entries"] = "voyage_log_entry",
        ["voyage_cargo_plans"] = "voyage_cargo_plan",
        ["voyage_bunker_plans"] = "voyage_bunker_plan",
        ["voyage_crew_change_plans"] = "voyage_crew_change_plan",
        ["voyage_cost_estimates"] = "voyage_cost_estimate",
        ["voyage_revenue_estimates"] = "voyage_revenue_estimate",
        ["voyage_expense_requests"] = "voyage_expense_request",
        ["voyage_advance_payments"] = "voyage_advance_payment",
        ["voyage_disbursements"] = "voyage_disbursement",
        ["voyage_actual_revenues"] = "voyage_actual_revenue",
        ["voyage_settlements"] = "voyage_settlement",
        ["maritime_reports"] = "maritime_report",
        ["noon_reports"] = "noon_report",
        ["departure_reports"] = "departure_report",
        ["arrival_reports"] = "arrival_report",
        ["bunker_reports"] = "bunker_report",
        ["position_reports"] = "position_report",
        ["ism_element"] = "ism_elements",
        ["sms_procedure"] = "sms_procedures",
        ["sms_procedure_acknowledge"] = "sms_procedure_acknowledgements",
        ["sms_procedure_acknowledges"] = "sms_procedure_acknowledgements",
        ["sms_procedure_acknowledgement"] = "sms_procedure_acknowledgements",
        ["sms_procedure_acknowledgments"] = "sms_procedure_acknowledgements",
        ["sms_form_template"] = "sms_form_templates",
        ["sms_filled_record"] = "sms_filled_records",
    };

    // Danh mục SMS do BỜ làm chủ, chỉ đồng bộ một chiều Bờ → Tàu (SMS_SYNC_WORKFLOW_SPEC,
    // ma trận quyền sở hữu). Tàu chỉ đọc ba bảng này, nên mọi bản ghi của chúng đẩy lên đây
    // đều là tiếng vọng của chính dữ liệu bờ vừa phát xuống — nhận vào là ghi đè bản gốc
    // bằng bản sao của tàu, kèm OriginNode = "SHIP_01".
    //
    // Bỏ qua và BÁO THÀNH CÔNG chứ không báo lỗi: các tàu chạy bản cũ vẫn còn những dòng
    // vọng ngược nằm trong sync_queue, báo lỗi thì chúng thử lại tới khi cạn lượt rồi kẹt
    // lại vĩnh viễn trong hàng đợi. Báo thành công để tàu đánh dấu đã đồng bộ và rút ra.
    //
    // sms_filled_records và sms_procedure_acknowledgements KHÔNG nằm ở đây: tàu sở hữu
    // chúng và bờ phải nhận.
    private static readonly HashSet<string> _shoreMasterOnlyTables = new(StringComparer.OrdinalIgnoreCase)
    {
        "ism_elements", "sms_procedures", "sms_form_templates"
    };

    // Tables that edge auto-syncs but shore intentionally does not store.
    // These are silently skipped (not logged as failures) to avoid noise.
    private static readonly HashSet<string> _ignoredTables = new(StringComparer.OrdinalIgnoreCase)
    {
        "nmea_raw_data",             // Raw NMEA — only needed for edge debugging
        "task_deferral_request",     // PMS workflow — edge-only
        "watchkeeping_log",          // Logbook — no shore model
        "oil_record_book",           // Logbook — no shore model
        "deck_log_book",             // Logbook — no shore model
        "engine_log_book",           // Logbook — no shore model
        "garbage_record_book",       // Logbook — no shore model
        "garbage_record_part_i",     // Logbook — no shore model
        "garbage_record_part_ii",    // Logbook — no shore model
        "ballast_water_record_book", // Logbook — no shore model
        // Legacy HSQE tables from older Edge versions
        "hsqe_document",
        "hsqe_document_revision",
        "hsqe_document_sync_status",
        "hsqe_work_permit",
        "hsqe_attachment",
        "hsqe_audit_log",
        "hsqe_sync_log",
        "hsqe_template",
        "hsqe_template_section",
        "hsqe_template_field",
        "hsqe_incident",
        "hsqe_incidents",
        "hsqe_capa",
        "hsqe_capas",
        "hsqe_risk_assessment",
        "hsqe_risk_assessments",
        "hsqe_document_read_log",
        "hsqe_document_read_logs",
    };

    private static bool IsShoreManagedMaterial(string table) => table.ToLowerInvariant() is
        "material_item" or "material_item_ship" or "material_category" or "material_catalog_item" or
        "material_item_catalog" or "material_items" or "vessel_material_definition";

    private static string CanonicalizeTableName(string? tableName)
    {
        if (string.IsNullOrWhiteSpace(tableName))
            return string.Empty;

        return _tableAliases.TryGetValue(tableName, out var canonical)
            ? canonical
            : tableName;
    }

    /// <summary>
    /// Returns a numeric order for dependency-aware batch processing.
    /// Lower numbers are processed first (parent/reference tables),
    /// higher numbers are processed later (child/dependent tables).
    /// Tables not explicitly listed default to order 50 (middle tier).
    /// </summary>
    private static int GetTableProcessingOrder(string canonicalTable)
    {
        return canonicalTable switch
        {
            // Tier 0: Reference / seed tables
            "certificate" or "country" or "rank" or "rank_certificate" or "country_certificate"
                or "report_type" or "equipment_group" or "material_category" or "store_location" => 0,

            // Tier 1: Core entity tables (parents)
            "crew_member" or "vessel" or "ship_data" or "ism_elements" => 10,

            // Tier 2: Direct children of tier 1
            "sms_procedures" or "voyage_record" or "port" or "port_call"
                or "crew_logbook_entry" or "equipment_asset" => 20,

            // Tier 3: Grandchildren (depend on tier 2)
            "sms_form_templates" or "sms_procedure_acknowledgements"
                or "voyage_plan_leg" or "crew_certificate" or "maintenance_task" => 30,

            // Tier 4: Deep children (depend on tier 3)
            "sms_filled_records" or "maintenance_history" or "maintenance_schedule" => 40,

            // Default tier for everything else
            _ => 50,
        };
    }


    // Edge auto-queue emits full-entity snapshots for voyage sync rows even when the
    // action type is UPDATE. On first arrival at Shore there is no existing mirror row,
    // so these tables must be allowed to CREATE from a missing UPDATE payload.
    private static readonly HashSet<string> _createOnMissingUpdateTables = new(StringComparer.OrdinalIgnoreCase)
    {
        "crew_logbook_entry",
        "voyage_record",
        "port",
        "voyage_plan_leg",
        "voyage_status_history",
        "port_call",
        "voyage_crew_assignment",
        "cargo_operation",
        "voyage_log_entry",
        "voyage_cargo_plan",
        "voyage_bunker_plan",
        "voyage_crew_change_plan",
        "voyage_cost_estimate",
        "voyage_revenue_estimate",
        "voyage_expense_request",
        "voyage_advance_payment",
        "voyage_disbursement",
        "voyage_actual_revenue",
        "voyage_settlement",
        // Document tables — edge creates documents locally; if not yet on shore, create them.
        "travel_document",
        "seafarer_document",
        "employment_document",
        "health_document",
        "crew_certificate",
        // SMS operational data from Edge
        "sms_filled_record",
        "sms_filled_records",
        "sms_procedure_acknowledge",
        "sms_procedure_acknowledges",
        "sms_procedure_acknowledgement",
        "sms_procedure_acknowledgments",
        "sms_procedure_acknowledgements",
    };

    // Tables where entities are scoped per-vessel (have VesselId).
    // If a record with the same ID already exists for a DIFFERENT vessel,
    // a new copy is created rather than conflicting.
    private static readonly HashSet<string> _vesselScopedTables = new(StringComparer.OrdinalIgnoreCase)
    {
        "material_item",
        "equipment_asset",
        "maintenance_task",
        "inventory_stock",
        "material_item_equipment",
        // Nghiệp vụ vật tư/PMS dưới tàu — mỗi tàu một bộ, id nguyên có thể trùng nhau
        // giữa các tàu nên phải tách theo VesselId thay vì coi là cùng một bản ghi.
        "material_request",
        "stock_receipt",
        "store_location",
        "equipment_group",
        "maintenance_schedule",
    };

    // Reference tables managed by Shore — applying natural-key dedup to avoid 23505/23503 errors
    // when Edge sends reference data with different PKs than Shore's seed data.
    private static readonly HashSet<string> _shoreAuthoritative = new(StringComparer.OrdinalIgnoreCase)
    {
        "certificate", "country", "rank",
        "rank_certificate", "country_certificate"
    };

    private readonly ProductApi.Services.Background.ReportEvaluationQueue _reportEvaluationQueue;

    public SyncInboxService(
        AppDbContext context,
        IConflictResolverService conflictResolver,
        ILogger<SyncInboxService> logger,
        INotificationService notifications,
        IConfiguration configuration,
        ISyncFileStorageService syncFileStorageService,
        ProductApi.Services.Background.ReportEvaluationQueue reportEvaluationQueue)
    {
        _context = context;
        _configuration = configuration;
        _conflictResolver = conflictResolver;
        _logger = logger;
        _notifications = notifications;
        _syncFileStorageService = syncFileStorageService;
        _reportEvaluationQueue = reportEvaluationQueue;
        _receiverNodeId = configuration["SyncSecurity:ShoreNodeId"] ?? "SHORE";
    }

    // ============================================================
    // BATCH PROCESSING — optimized for high-throughput sync
    // ============================================================

    public async Task<SyncBatchProcessResult> ProcessBatchAsync(List<SyncQueueItemDto> items)
    {
        var result = new SyncBatchProcessResult();
        
        // Track all NoonReport IDs processed successfully for auto-enqueue
        var noonReportIdsForEvaluation = new HashSet<Guid>();

        // Auto-register any vessel whose IMO is not yet in the Vessels table.
        // In Managed Mode, OriginNode is a node id (for example edge-1234567-main),
        // so resolve it through SyncNodeTracker before deciding whether to create a vessel.
        var distinctOrigins = items
            .Where(i => !string.IsNullOrWhiteSpace(i.OriginNode))
            .Select(i => i.OriginNode)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var originToImo = await ResolveOriginNodesToImosAsync(distinctOrigins);

        foreach (var origin in distinctOrigins)
        {
            var imo = originToImo.GetValueOrDefault(origin, origin);
            await AutoRegisterVesselAsync(imo);
        }

        // Group by table for more efficient processing.
        // Order groups by dependency level so parent tables are processed before children.
        // This prevents FK violations when e.g. sms_procedure_acknowledgements arrives
        // in the same batch as its parent sms_procedures.
        var grouped = items
            .GroupBy(i => i.TableName)
            .OrderBy(g => GetTableProcessingOrder(CanonicalizeTableName(g.Key)))
            .ToList();


        foreach (var group in grouped)
        {
            var canonicalTable = CanonicalizeTableName(group.Key);
            if (IsShoreManagedMaterial(canonicalTable))
            {
                _logger.LogInformation("Ignored {Count} obsolete Edge material-definition uploads", group.Count());
                result.Succeeded += group.Count(); // Acknowledge old queues without mutating Shore definitions.
                continue;
            }

            // ── Chặn ghi ngược vào danh mục SMS do Bờ làm chủ ── xem _shoreMasterOnlyTables
            if (_shoreMasterOnlyTables.Contains(canonicalTable))
            {
                _logger.LogDebug(
                    "Bỏ qua {Count} bản ghi {Table} tàu đẩy lên: bảng do Bờ làm chủ, chỉ đồng bộ một chiều Bờ → Tàu",
                    group.Count(), canonicalTable);
                result.Succeeded += group.Count();
                continue;
            }

            // ── Special handler: ship_data → Vessels table (field mapping required) ──
            if (canonicalTable.Equals("ship_data", StringComparison.OrdinalIgnoreCase))
            {
                foreach (var item in group)
                {
                    try
                    {
                        item.TableName = canonicalTable;

                        if (await IsAlreadyProcessedAsync(item.TableName, item.RecordKey, item.SyncVersion))
                        { result.Succeeded++; continue; }

                        await ProcessShipDataAsync(item);
                        await RecordProcessedAsync(item);
                        await _context.SaveChangesAsync();
                        result.Succeeded++;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "ship_data sync failed for key {Key}", item.RecordKey);
                        await PersistFailureLogAsync(item, ex.Message);
                        _context.ChangeTracker.Clear();
                        result.Failed++;
                        result.FailedItems.Add(CreateFailure(item, ex));
                    }
                }
                continue;
            }

            // ── Special handler: onboard events from Edge with business logic ──
            if (canonicalTable.Equals("onboard_event", StringComparison.OrdinalIgnoreCase)
                || canonicalTable.Equals("sign_on_record", StringComparison.OrdinalIgnoreCase)
                || canonicalTable.Equals("sign_off_record", StringComparison.OrdinalIgnoreCase))
            {
                foreach (var item in group)
                {
                    try
                    {
                        item.TableName = canonicalTable;

                        if (await IsAlreadyProcessedAsync(item.TableName, item.RecordKey, item.SyncVersion))
                        { result.Succeeded++; continue; }

                        await ProcessOnboardEventFromEdgeAsync(item);
                        await RecordProcessedAsync(item);
                        await _context.SaveChangesAsync();
                        result.Succeeded++;
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Onboard event sync failed: {Table}/{Key}", item.TableName, item.RecordKey);
                        await PersistFailureLogAsync(item, ex.Message);
                        _context.ChangeTracker.Clear();
                        result.Failed++;
                        result.FailedItems.Add(CreateFailure(item, ex));
                    }
                }
                continue;
            }

            if (!_tableEntityMap.TryGetValue(canonicalTable, out var entityType))
            {
                if (_ignoredTables.Contains(canonicalTable) || canonicalTable.StartsWith("hsqe_", StringComparison.OrdinalIgnoreCase))
                {
                    _logger.LogDebug("Ignoring edge-only/legacy table: {Table}, {Count} items skipped", canonicalTable, group.Count());
                    result.Succeeded += group.Count();
                    continue;
                }

                _logger.LogWarning("Unknown table in batch: {Table} (canonical: {Canonical}), skipping {Count} items", group.Key, canonicalTable, group.Count());
                foreach (var item in group)
                {
                    var error = $"Unknown table: {group.Key}";
                    await PersistFailureLogAsync(item, error);
                    result.Failed++;
                    result.FailedItems.Add(CreateFailure(item, error));
                }
                continue;
            }

            foreach (var item in group)
            {
                try
                {
                    item.TableName = canonicalTable;

                    // Idempotency check — skip already processed
                    if (await IsAlreadyProcessedAsync(item.TableName, item.RecordKey, item.SyncVersion))
                    {
                        _logger.LogDebug("Skipping duplicate: {Table}/{Key} v{Version}",
                            item.TableName, item.RecordKey, item.SyncVersion);
                        result.Succeeded++; // Count as success (already done)
                        continue;
                    }

                    // ── Guard: only accept TRANSMITTED reports on shore ──
                    if (canonicalTable.Equals("maritime_report", StringComparison.OrdinalIgnoreCase)
                        && !string.IsNullOrEmpty(item.Payload))
                    {
                        try
                        {
                            using var doc = System.Text.Json.JsonDocument.Parse(item.Payload);
                            if (doc.RootElement.TryGetProperty("Status", out var statusProp)
                                || doc.RootElement.TryGetProperty("status", out statusProp))
                            {
                                var status = statusProp.GetString();
                                if (!string.Equals(status, "TRANSMITTED", StringComparison.OrdinalIgnoreCase))
                                {
                                    _logger.LogWarning(
                                        "Rejecting non-TRANSMITTED report {Key} (status={Status})",
                                        item.RecordKey, status);
                                    await PersistFailureLogAsync(item, $"Rejected non-TRANSMITTED report (status={status})");
                                    result.Failed++;
                                    result.FailedItems.Add(CreateFailure(item, $"Rejected non-TRANSMITTED report (status={status})"));
                                    continue;
                                }
                            }
                        }
                        catch { /* parse error — continue normal processing */ }
                    }

                    // For document tables: keep FileUrl so ConflictResolver can apply edge's file path.
                    // For crew_certificate: keep DocumentFilePath (edge scans certs on board).
                    // For other tables (crew_member, etc.): strip all file properties — files
                    // arrive via the separate file-transfer pipeline.
                    var isDocumentTable = canonicalTable.EndsWith("_document", StringComparison.OrdinalIgnoreCase);
                    var isCrewCertificate = string.Equals(canonicalTable, "crew_certificate", StringComparison.OrdinalIgnoreCase);
                    item.Payload = (isDocumentTable || isCrewCertificate)
                        ? StripFileReferencePropertiesExceptFileUrl(item.Payload)
                        : StripFileReferenceProperties(item.Payload);

                    await ProcessIncomingAsync(item);
                    await UpsertIncomingFileReferencesAsync(item);

                    // Record idempotency key
                    await RecordProcessedAsync(item);

                    // Save each item individually so a single constraint violation
                    // does NOT roll back the entire batch.
                    await _context.SaveChangesAsync();

                    await SyncIdentitySequenceAsync(canonicalTable);

                    // COLLECT ID ĐỂ AUTO-EVALUATE (sẽ batch-enqueue sau)
                    if ((item.TableName.Equals("noon_report", StringComparison.OrdinalIgnoreCase) || 
                         item.TableName.Equals("noon_reports", StringComparison.OrdinalIgnoreCase)) &&
                        Guid.TryParse(item.RecordKey, out var reportId))
                    {
                        noonReportIdsForEvaluation.Add(reportId);
                    }

                    result.Succeeded++;
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Batch item failed: {Table}/{Key}", item.TableName, item.RecordKey);
                    await PersistFailureLogAsync(item, ex.Message);
                    // Clear any partially-tracked state so the next item starts clean.
                    _context.ChangeTracker.Clear();
                    result.Failed++;
                    result.FailedItems.Add(CreateFailure(item, ex));
                }
            }
        }

        // ── Emit a summary notification per vessel ──────────────────────────────
        if (result.Succeeded > 0)
        {
            await EmitSyncBatchNotificationsAsync(items, result.Succeeded);
        }

        // Trước đây chỗ này tự sinh VesselCertificateAssignment từ dữ liệu tàu đẩy lên.
        // Đã bỏ: danh mục loại chứng chỉ do bờ làm chủ và phát xuống mọi tàu, không còn
        // khái niệm gán loại chứng chỉ cho từng tàu nên cũng không còn gì để suy ra.

        // ── AUTO-ENQUEUE all NoonReports for AI evaluation ──
        if (noonReportIdsForEvaluation.Count > 0)
        {
            try
            {
                _logger.LogInformation("[AUTO-EVAL] Batch-enqueueing {Count} NoonReports for AI evaluation", 
                    noonReportIdsForEvaluation.Count);
                
                var enqueueTasks = noonReportIdsForEvaluation
                    .Select(async reportId =>
                    {
                        try
                        {
                            var ct = new CancellationTokenSource(TimeSpan.FromSeconds(5)).Token;
                            await _reportEvaluationQueue.EnqueueAsync(reportId, ct);
                        }
                        catch (Exception ex)
                        {
                            _logger.LogWarning(ex, "Failed to enqueue NoonReport {ReportId} for evaluation", reportId);
                        }
                    });

                await Task.WhenAll(enqueueTasks);
                _logger.LogInformation("[AUTO-EVAL] Batch-enqueue completed successfully");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Auto-enqueue batch failed (non-critical, evaluations will be missed)");
            }
        }

        return result;
    }

    private static SyncBatchItemFailure CreateFailure(SyncQueueItemDto item, Exception ex)
    {
        // Walk inner exceptions to expose the deepest (most specific) error, e.g. PostgresException
        var messages = new List<string>();
        var current = ex;
        while (current != null)
        {
            if (!string.IsNullOrWhiteSpace(current.Message))
                messages.Add(current.Message);
            current = current.InnerException;
        }
        var detail = messages.Count > 1
            ? string.Join(" → ", messages)
            : messages.FirstOrDefault() ?? ex.Message;
        return new SyncBatchItemFailure
        {
            TableName = item.TableName,
            RecordKey = item.RecordKey,
            ActionType = item.ActionType,
            Error = detail
        };
    }

    private static SyncBatchItemFailure CreateFailure(SyncQueueItemDto item, string error)
    {
        return new SyncBatchItemFailure
        {
            TableName = item.TableName,
            RecordKey = item.RecordKey,
            ActionType = item.ActionType,
            Error = error
        };
    }

    private async Task PersistFailureLogAsync(SyncQueueItemDto item, string detail)
    {
        _context.ChangeTracker.Clear();
        await LogSyncOperation(item, "FAILED", detail);
        await _context.SaveChangesAsync();
    }

    /// <summary>
    /// After a successful batch, emits one summary notification per distinct vessel.
    /// Groups tables and builds a Vietnamese summary message.
    /// </summary>
    private async Task EmitSyncBatchNotificationsAsync(List<SyncQueueItemDto> items, int totalSucceeded)
    {
        // Group by origin IMO so each vessel gets its own notification
        var byVessel = items
            .Where(i => !string.IsNullOrWhiteSpace(i.OriginNode))
            .GroupBy(i => i.OriginNode, StringComparer.OrdinalIgnoreCase);

        foreach (var vesselGroup in byVessel)
        {
            var imo = vesselGroup.Key;
            var vessel = await _context.Vessels
                .Where(v => v.IMO == imo)
                .Select(v => new { v.Id, v.Name })
                .FirstOrDefaultAsync();

            var vesselName = vessel?.Name ?? imo;
            var count = vesselGroup.Count();

            // Collect distinct table names for the summary message
            var tables = vesselGroup
                .Select(i => i.TableName)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var tablesSummary = string.Join(", ", tables.Select(t => t.Replace("_", " ")));
            var message = $"Nhận {count} bản ghi từ tàu {vesselName}: {tablesSummary}";

            await _notifications.CreateAsync(
                type: "sync_batch",
                title: $"Đồng bộ từ tàu {vesselName}",
                message: message,
                vesselId: vessel?.Id,
                vesselName: vesselName);
        }
    }

    public async Task<bool> IsAlreadyProcessedAsync(string tableName, string recordKey, long syncVersion)    {
        if (syncVersion <= 0) return false; // No version = no idempotency check

        var key = $"{tableName}:{recordKey}:{syncVersion}";
        return await _context.SyncIdempotencyRecords
            .AnyAsync(r => r.IdempotencyKey == key);
    }

    private async Task RecordProcessedAsync(SyncQueueItemDto item)
    {
        if (item.SyncVersion <= 0) return;

        var record = new SyncIdempotencyRecord
        {
            IdempotencyKey = $"{item.TableName}:{item.RecordKey}:{item.SyncVersion}",
            OriginNode = item.OriginNode,
            Status = "PROCESSED",
            ProcessedAt = DateTime.UtcNow
        };

        await _context.SyncIdempotencyRecords.AddAsync(record);
    }

    private async Task UpsertIncomingFileReferencesAsync(SyncQueueItemDto item)
    {
        if (item.FileRefs == null || item.FileRefs.Count == 0)
            return;

        foreach (var fileRef in item.FileRefs)
        {
            var manifest = await _context.SyncFileManifests.FirstOrDefaultAsync(m => m.Id == fileRef.FileId);
            if (manifest == null)
            {
                manifest = new SyncFileManifest
                {
                    Id = fileRef.FileId,
                    OwnerNodeId = item.OriginNode,
                    ReceiverNodeId = _receiverNodeId,
                    TableName = item.TableName,
                    RecordKey = item.RecordKey,
                    FileRole = fileRef.FileRole,
                    CreatedAt = DateTime.UtcNow
                };
                await _context.SyncFileManifests.AddAsync(manifest);
            }

            manifest.OwnerNodeId = item.OriginNode;
            manifest.ReceiverNodeId = _receiverNodeId;
            manifest.TableName = item.TableName;
            manifest.RecordKey = item.RecordKey;
            manifest.FileRole = fileRef.FileRole;
            manifest.FileName = fileRef.FileName;
            manifest.ContentType = fileRef.ContentType;
            manifest.SizeBytes = fileRef.SizeBytes;
            manifest.OriginalSizeBytes = fileRef.OriginalSizeBytes;
            manifest.Sha256 = fileRef.Sha256;
            manifest.TransportEncoding = fileRef.TransportEncoding;
            manifest.IsPreprocessed = fileRef.IsPreprocessed;
            manifest.PreprocessProfile = fileRef.PreprocessProfile;
            manifest.SourcePath = fileRef.SourcePath;
            manifest.TransferPriority = fileRef.TransferPriority;
            manifest.CapturedAtUtc = fileRef.CapturedAtUtc;
            manifest.UpdatedAt = DateTime.UtcNow;

            var localPath = await GetExistingLocalFilePathAsync(item, fileRef);
            if (!string.IsNullOrWhiteSpace(localPath))
            {
                manifest.StoragePath = localPath;
                manifest.TransferStatus = SyncFileTransferStatus.Duplicate;
                manifest.VerifiedAtUtc = DateTime.UtcNow;
                manifest.LastError = null;
                continue;
            }

            manifest.TransferStatus = SyncFileTransferStatus.Requested;
            manifest.LastRequestedAtUtc = DateTime.UtcNow;
            manifest.LastError = null;

            var existingRequest = await _context.SyncFileTransferRequests.FirstOrDefaultAsync(r =>
                r.ManifestId == manifest.Id &&
                (r.Status == SyncFileRequestStatus.Pending || r.Status == SyncFileRequestStatus.Deferred));

            if (existingRequest == null)
            {
                existingRequest = new SyncFileTransferRequest
                {
                    ManifestId = manifest.Id,
                    RequesterNodeId = _receiverNodeId,
                    SupplierNodeId = item.OriginNode,
                    Status = SyncFileRequestStatus.Pending,
                    RequestedAtUtc = DateTime.UtcNow
                };
                await _context.SyncFileTransferRequests.AddAsync(existingRequest);
            }

            await ApplyDeltaHintsAsync(item, fileRef, existingRequest);
        }
    }

    private async Task ApplyDeltaHintsAsync(SyncQueueItemDto item, SyncFileReferenceDto fileRef, SyncFileTransferRequest request)
    {
        request.PreferDeltaTransfer = false;
        request.DeltaBlockSizeBytes = null;
        request.ReceiverBaseSha256 = null;
        request.ReceiverBlockHashesJson = null;

        if (!_configuration.GetValue("Sync:DeltaSyncEnabled", true))
            return;

        var localCandidatePath = await FindEntityFilePathAsync(_tableEntityMap[item.TableName], item.RecordKey);
        if (string.IsNullOrWhiteSpace(localCandidatePath))
            return;

        var absolutePath = ResolveLocalFilePath(localCandidatePath);
        if (!System.IO.File.Exists(absolutePath))
            return;

        if (_syncFileStorageService.GetFileSize(localCandidatePath) != fileRef.SizeBytes)
            return;

        var localSha256 = await _syncFileStorageService.ComputeSha256HexAsync(localCandidatePath, CancellationToken.None);
        if (string.Equals(localSha256, fileRef.Sha256, StringComparison.OrdinalIgnoreCase))
            return;

        var blockSizeBytes = Math.Max(64 * 1024, _configuration.GetValue("Sync:DeltaBlockSizeBytes", 256 * 1024));
        var blockHashes = await ComputeBlockHashesAsync(localCandidatePath, blockSizeBytes, CancellationToken.None);
        if (blockHashes.Count == 0)
            return;

        request.PreferDeltaTransfer = true;
        request.DeltaBlockSizeBytes = blockSizeBytes;
        request.ReceiverBaseSha256 = localSha256;
        request.ReceiverBlockHashesJson = System.Text.Json.JsonSerializer.Serialize(blockHashes);
    }

    private async Task<string?> GetExistingLocalFilePathAsync(SyncQueueItemDto item, SyncFileReferenceDto fileRef)
    {
        if (!_tableEntityMap.TryGetValue(item.TableName, out var entityType))
            return null;

        var entity = await FindEntityByKeyAsync(entityType, item.RecordKey);
        if (entity == null)
            return null;

        foreach (var propName in new[] { "DocumentFilePath", "FilePath", "FileUrl", "PhotoUrl" })
        {
            var prop = entity.GetType().GetProperty(propName);
            if (prop?.PropertyType != typeof(string))
                continue;

            var value = prop.GetValue(entity) as string;
            if (string.IsNullOrWhiteSpace(value))
                continue;

            var absPath = ResolveLocalFilePath(value);
            if (!System.IO.File.Exists(absPath))
                continue;

            var checksum = await _syncFileStorageService.ComputeSha256HexAsync(value, CancellationToken.None);
            if (string.Equals(checksum, fileRef.Sha256, StringComparison.OrdinalIgnoreCase))
                return value;
        }

        return null;
    }

    private async Task<string?> FindEntityFilePathAsync(Type entityType, string recordKey)
    {
        var entity = await FindEntityByKeyAsync(entityType, recordKey);
        if (entity == null)
            return null;

        foreach (var propName in new[] { "DocumentFilePath", "FilePath", "FileUrl", "PhotoUrl" })
        {
            var prop = entity.GetType().GetProperty(propName);
            if (prop?.PropertyType != typeof(string))
                continue;

            var value = prop.GetValue(entity) as string;
            if (string.IsNullOrWhiteSpace(value))
                continue;

            var absPath = ResolveLocalFilePath(value);
            if (System.IO.File.Exists(absPath))
                return value;
        }

        return null;
    }

    private static string StripFileReferenceProperties(string payload)
    {
        using var doc = JsonDocument.Parse(payload);
        var root = doc.RootElement;
        if (root.ValueKind != JsonValueKind.Object)
            return payload;

        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            writer.WriteStartObject();
            foreach (var property in root.EnumerateObject())
            {
                if (property.NameEquals("PhotoUrl") || property.NameEquals("photoUrl"))
                {
                    continue;
                }

                property.WriteTo(writer);
            }
            writer.WriteEndObject();
        }

        return System.Text.Encoding.UTF8.GetString(stream.ToArray());
    }

    /// <summary>
    /// Strip file reference properties EXCEPT FileUrl, FilePath, DocumentFilePath.
    /// Used for document tables where ConflictResolver needs file paths
    /// to apply them from edge (edge wins for file properties on documents).
    /// </summary>
    private static string StripFileReferencePropertiesExceptFileUrl(string payload)
    {
        using var doc = JsonDocument.Parse(payload);
        var root = doc.RootElement;
        if (root.ValueKind != JsonValueKind.Object)
            return payload;

        using var stream = new MemoryStream();
        using (var writer = new Utf8JsonWriter(stream))
        {
            writer.WriteStartObject();
            foreach (var property in root.EnumerateObject())
            {
                // Strip PhotoUrl — always served by file transfer, never in metadata payload.
                // Keep FileUrl, FilePath and DocumentFilePath — edge uploads files to these properties
                // directly, and the conflict resolver needs them to update the entity.
                if (property.NameEquals("PhotoUrl") || property.NameEquals("photoUrl"))
                {
                    continue;
                }

                property.WriteTo(writer);
            }
            writer.WriteEndObject();
        }

        return System.Text.Encoding.UTF8.GetString(stream.ToArray());
    }

    private static string ResolveLocalFilePath(string path)
    {
        return path.StartsWith("/", StringComparison.Ordinal)
            ? Path.Combine(Directory.GetCurrentDirectory(), path.TrimStart('/').Replace('/', Path.DirectorySeparatorChar))
            : path;
    }

    private async Task<List<string>> ComputeBlockHashesAsync(string relativeOrAbsolutePath, int blockSizeBytes, CancellationToken cancellationToken)
    {
        var hashes = new List<string>();
        var content = await _syncFileStorageService.ReadAllBytesAsync(relativeOrAbsolutePath, cancellationToken);
        var buffer = new byte[blockSizeBytes];
        var offset = 0;

        while (offset < content.Length)
        {
            var read = Math.Min(blockSizeBytes, content.Length - offset);
            Buffer.BlockCopy(content, offset, buffer, 0, read);
            hashes.Add(Convert.ToHexString(SHA256.HashData(buffer.AsSpan(0, read))).ToLowerInvariant());
            offset += read;
        }

        return hashes;
    }

    // ============================================================
    // SINGLE ITEM PROCESSING
    // ============================================================

    public async Task ProcessIncomingAsync(SyncQueueItemDto item)
    {
        item.TableName = CanonicalizeTableName(item.TableName);
        if (IsShoreManagedMaterial(item.TableName))
        {
            await LogSyncOperation(item, "IGNORED", "Material definitions only synchronize from Shore to Edge.");
            return;
        }

        if (!_tableEntityMap.TryGetValue(item.TableName, out var entityType))
        {
            if (_ignoredTables.Contains(item.TableName) || item.TableName.StartsWith("hsqe_", StringComparison.OrdinalIgnoreCase))
                return; // silently skip edge-only / legacy tables

            _logger.LogWarning("Unknown sync table: {Table}", item.TableName);
            await LogSyncOperation(item, "FAILED", $"Unknown table: {item.TableName}");
            return;
        }

        var action = item.ActionType?.ToUpperInvariant() ?? "CREATE";

        try
        {
            switch (action)
            {
                case "CREATE":
                case "UPDATE":    // Field-level delta from Edge (e.g. FullName changed)
                case "SNAPSHOT":  // Full-entity snapshot from Edge — treat as upsert
                    await ProcessUpdateAsync(entityType, item);
                    break;
                case "DELETE":
                    await ProcessDeleteAsync(entityType, item);
                    break;
                default:
                    _logger.LogWarning("Unknown action type: {Action}", action);
                    break;
            }

            if (item.TableName == "position_data" && (action == "CREATE" || action == "UPDATE" || action == "SNAPSHOT"))
            {
                await AutoUpdateVesselPositionAsync(item);
            }

            await LogSyncOperation(item, "SUCCESS");
        }
        catch (Exception ex)
        {
            await LogSyncOperation(item, "FAILED", ex.Message);
            throw;
        }
    }

    // ============================================================
    // CREATE: Deserialize full entity and add to DB
    // ============================================================
    private async Task ProcessCreateAsync(Type entityType, SyncQueueItemDto item)
    {
        if (string.IsNullOrWhiteSpace(item.Payload))
            throw new InvalidOperationException($"CREATE payload is null/empty for {item.TableName}/{item.RecordKey}");

        // Strip navigation-property objects/arrays from the payload before deserializing.
        // Edge serializes full entity graphs (including Rank, Certificates, Documents nav props)
        // which cannot be deserialized into the shore's EF entity types directly.
        // Also normalize snake_case keys to camelCase so PropertyNameCaseInsensitive can match PascalCase properties.
        var cleanPayload = NormalizePayloadToCamelCase(StripNavigationProperties(item.Payload), entityType);
        var entity = JsonSerializer.Deserialize(cleanPayload, entityType, _jsonOptions);
        if (entity == null) throw new InvalidOperationException("Failed to deserialize CREATE payload");

        // CRITICAL: Force the entity's PK to match RecordKey.
        // Without this, if the payload is missing "id" or has a different value,
        // the deserialised entity gets Guid.NewGuid() default → phantom duplicate.
        ForceEntityPrimaryKey(entityType, entity, item.RecordKey);

        // Check if already exists (idempotency — edge may retry)
        var existing = await FindEntityByKeyAsync(entityType, item.RecordKey);
        if (existing != null)
        {
            if (existing is ProductApi.Models.MaterialItemShip material)
            {
                await ApplyMaterialStockFromEdgeAsync(material, item);
                return;
            }
            // For vessel-scoped entities (MaterialItem, EquipmentAsset, MaintenanceTask):
            // if the existing record already belongs to a DIFFERENT vessel, treat the incoming
            // data as a NEW record for that vessel (create a copy with a new ID).
            // This handles the case where multiple vessels use seed data with identical IDs.
            if (_vesselScopedTables.Contains(item.TableName))
            {
                var existingVesselId = existing.GetType().GetProperty("VesselId")?.GetValue(existing) as Guid?;
                var incomingVessel = await _context.Vessels.AsNoTracking()
                    .FirstOrDefaultAsync(v => v.IMO == item.OriginNode);
                var incomingVesselId = incomingVessel?.Id;

                if (incomingVesselId.HasValue && existingVesselId.HasValue
                    && existingVesselId.Value != incomingVesselId.Value)
                {
                    // Different vessel — create a new record with a new GUID
                    _logger.LogInformation(
                        "Entity {Table}/{Key} belongs to vessel {Existing}, incoming from {Incoming} — creating new copy",
                        item.TableName, item.RecordKey, existingVesselId, incomingVesselId);
                    ForceEntityPrimaryKey(entityType, entity, Guid.NewGuid().ToString());
                    UpdateSyncMetadata(entity, item);
                    await ResolveOrphanedForeignKeysAsync(entityType, entity, item.Payload);
                    await _context.AddAsync(entity);
                    await ResolveCrewVesselIdAsync(entity, item.OriginNode);
                    return;
                }
            }

            _logger.LogDebug("Entity {Table}/{Key} already exists — treating as UPDATE", 
                item.TableName, item.RecordKey);
            // Apply conflict resolution — copy only meaningful non-default values
            var resolution = _conflictResolver.Resolve(item.TableName, existing, entity, item.OriginNode);
            if (resolution.ShouldApply)
            {
                CopyNonDefaultProperties(existing, resolution.ResolvedEntity!, entityType);
                UpdateSyncMetadata(existing, item);
                await ResolveCrewVesselIdAsync(existing, item.OriginNode);
            }
            return;
        }

        // Set sync metadata
        UpdateSyncMetadata(entity, item);

        // Resolve any orphaned FK references (e.g. RankId pointing to a rank not yet on shore)
        await ResolveOrphanedForeignKeysAsync(entityType, entity, item.Payload);

        // For shore-authoritative reference tables (country, rank, certificate, rank_certificate,
        // country_certificate): edge and shore may use different PKs for the same data.
        // If shore already has equivalent data by natural key, skip the insert to avoid
        // unique-constraint violations (23505) or FK violations (23503) from mismatched IDs.
        if (_shoreAuthoritative.Contains(item.TableName)
            && await IsShoreRefDataDuplicateAsync(entityType, entity))
        {
            _logger.LogDebug(
                "Shore-authoritative {Table}/{Key}: already exists by natural key or FK mismatch — skipping insert",
                item.TableName, item.RecordKey);
            return;
        }

        await _context.AddAsync(entity);
        await ResolveCrewVesselIdAsync(entity, item.OriginNode);

        _logger.LogDebug("Created {Table}/{Key} from {Node}", 
            item.TableName, item.RecordKey, item.OriginNode);
    }

    // ============================================================
    // UPDATE: Delta sync — only changed properties
    // ============================================================
    private async Task ProcessUpdateAsync(Type entityType, SyncQueueItemDto item)
    {
        // Payload is passed for identity fallback: an UPDATE means the row already exists, so
        // a key miss is a renamed key, not a new record. ProcessCreateAsync deliberately does
        // NOT do this — there, a key miss really is a new record.
        var existing = await FindEntityByKeyAsync(entityType, item.RecordKey, item.Payload);

        if (existing is ProductApi.Models.MaterialItemShip material)
        {
            await ApplyMaterialStockFromEdgeAsync(material, item);
            return;
        }

        // For vessel-scoped tables: if the existing record belongs to a DIFFERENT vessel,
        // treat this as a new record creation (same seed ID, different vessel).
        if (existing != null && _vesselScopedTables.Contains(item.TableName))
        {
            var existingVesselId = existing.GetType().GetProperty("VesselId")?.GetValue(existing) as Guid?;
            var incomingVessel = await _context.Vessels.AsNoTracking()
                .FirstOrDefaultAsync(v => v.IMO == item.OriginNode);
            var incomingVesselId = incomingVessel?.Id;

            if (incomingVesselId.HasValue && existingVesselId.HasValue
                && existingVesselId.Value != incomingVesselId.Value)
            {
                _logger.LogInformation(
                    "SNAPSHOT {Table}/{Key} belongs to vessel {Existing}, incoming from vessel {Incoming} — creating new copy",
                    item.TableName, item.RecordKey, existingVesselId, incomingVesselId);
                // Force existing to null so we fall through to ProcessCreateAsync
                existing = null;
            }
        }

        if (existing == null)
        {
            // Only fall through to CREATE if the original action is CREATE or SNAPSHOT
            // (meaning the payload is a full entity). For UPDATE actions, the payload
            // may be partial — creating an entity from partial data produces broken
            // records with default values (empty ReportNumber, ReportTypeId=0, etc.).
            var originalAction = item.ActionType?.ToUpperInvariant() ?? "CREATE";
            if (originalAction == "UPDATE" && !_createOnMissingUpdateTables.Contains(item.TableName))
            {
                _logger.LogWarning(
                    "UPDATE for non-existent entity {Table}/{Key} — skipping (partial payload cannot create entity)",
                    item.TableName, item.RecordKey);
                return;
            }

            _logger.LogInformation("{Action} for non-existent entity {Table}/{Key} — creating from snapshot payload",
                originalAction,
                item.TableName, item.RecordKey);
            await ProcessCreateAsync(entityType, item);
            return;
        }

        // Deserialize as full entity for conflict resolution
        // Strip nav props and normalize snake_case → camelCase first
        object? incomingEntity = null;
        try
        {
            var cleanPayload2 = NormalizePayloadToCamelCase(StripNavigationProperties(item.Payload), entityType);
            incomingEntity = JsonSerializer.Deserialize(cleanPayload2, entityType, _jsonOptions);
        }
        catch (JsonException)
        {
            // Payload might be partial (only changed properties) — fall through to patch logic
            _logger.LogDebug("Payload for {Table}/{Key} is not a full entity, using patch logic",
                item.TableName, item.RecordKey);
        }

        if (incomingEntity != null)
        {
            // ── Delta-safe guard ──────────────────────────────────────
            // Deserializing a partial JSON (e.g. {"Weight":80}) into a full entity
            // fills DEFAULTS for missing fields (bool→false, int→0, DateTime→MinValue).
            // The conflict resolver may then apply those defaults, overwriting real data
            // (e.g. IsOnboard true→false). We parse the actual JSON keys and snapshot
            // non-payload value-type properties so we can restore them afterwards.
            HashSet<string> payloadKeys;
            try
            {
                using var jd = JsonDocument.Parse(item.Payload);
                payloadKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                foreach (var jp in jd.RootElement.EnumerateObject())
                    payloadKeys.Add(jp.Name);
            }
            catch { payloadKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase); }

            // Snapshot non-payload properties on existing entity
            var savedValueTypes = new Dictionary<string, object?>();
            foreach (var prop in existing.GetType().GetProperties())
            {
                if (!prop.CanRead || !prop.CanWrite) continue;
                if (prop.Name == "Id") continue;
                // Protect non-nullable value types (bool, int, DateTime…) AND strings.
                // Strings need it just as much: a property initialised to a non-empty default
                // (e.g. CrewCertificate.Status = "VALID") survives the empty-string check in the
                // conflict resolvers, so a delta that omits Status would quietly flip an EXPIRED
                // certificate back to VALID.
                var isProtectedType = prop.PropertyType == typeof(string)
                    || (prop.PropertyType.IsValueType && Nullable.GetUnderlyingType(prop.PropertyType) == null);
                if (!isProtectedType) continue;
                // Check if this property was actually in the payload (PascalCase, camelCase, or snake_case)
                var camel = char.ToLowerInvariant(prop.Name[0]) + prop.Name.Substring(1);
                var snake = System.Text.RegularExpressions.Regex.Replace(prop.Name, "([A-Z])", "_$1").TrimStart('_').ToLowerInvariant();
                if (!payloadKeys.Contains(prop.Name) && !payloadKeys.Contains(camel) && !payloadKeys.Contains(snake))
                {
                    savedValueTypes[prop.Name] = prop.GetValue(existing);
                }
            }

            // DEBUG: Log OnboardStatus before conflict resolution
            if (item.TableName == "crew_member")
            {
                var osPropBefore = existing.GetType().GetProperty("OnboardStatus");
                var inOsProp = incomingEntity.GetType().GetProperty("OnboardStatus");
                _logger.LogWarning("[SYNC-DEBUG] BEFORE resolve: existing.OnboardStatus={ExOs}, incoming.OnboardStatus={InOs}, payloadKeys=[{Keys}]",
                    osPropBefore?.GetValue(existing), inOsProp?.GetValue(incomingEntity), string.Join(",", payloadKeys));
                // Snapshot crew fields BEFORE merge so we can compute fresh EdgeChanges afterwards
            }
            // Snapshot as local variable (thread-safe — instance field would cause race conditions)
            var crewSnapshot = item.TableName == "crew_member" ? SnapshotCrewFields(existing) : null;

            var resolution = _conflictResolver.Resolve(item.TableName, existing, incomingEntity, item.OriginNode);

            // DEBUG: Log OnboardStatus after conflict resolution
            if (item.TableName == "crew_member")
            {
                var osPropAfter = existing.GetType().GetProperty("OnboardStatus");
                _logger.LogWarning("[SYNC-DEBUG] AFTER resolve: ShouldApply={Apply}, existing.OnboardStatus={ExOs}, ResolvedEntity==existing? {Same}",
                    resolution.ShouldApply, osPropAfter?.GetValue(existing), ReferenceEquals(resolution.ResolvedEntity, existing));
            }

            if (resolution.ShouldApply)
            {
                // Restore value-type properties that were NOT in the payload
                // (conflict resolver may have overwritten them with deserialized defaults)
                foreach (var kvp in savedValueTypes)
                {
                    var prop = existing.GetType().GetProperty(kvp.Key);
                    if (prop?.CanWrite == true)
                        prop.SetValue(existing, kvp.Value);
                }

                // DEBUG: Log OnboardStatus after savedValueTypes restore
                if (item.TableName == "crew_member")
                {
                    var osPropRestore = existing.GetType().GetProperty("OnboardStatus");
                    _logger.LogWarning("[SYNC-DEBUG] AFTER restore savedValueTypes: existing.OnboardStatus={ExOs}",
                        osPropRestore?.GetValue(existing));
                }

                // If ResolvedEntity IS existing (conflict resolver mutated it in-place),
                // EF is already tracking the changes — no need for SetValues.
                // If it is a different object, copy non-key values over (only payload fields).
                if (!ReferenceEquals(resolution.ResolvedEntity, existing))
                {
                    var entry2 = _context.Entry(existing);
                    foreach (var prop in entry2.Metadata.GetProperties())
                    {
                        if (prop.IsKey()) continue; // never overwrite PK
                        var propName = prop.PropertyInfo?.Name ?? prop.Name;
                        // Never copy EdgeChanges/EdgeChangesViewed from payload — computed fresh below
                        if (propName.Equals("EdgeChanges", StringComparison.OrdinalIgnoreCase) ||
                            propName.Equals("EdgeChangesViewed", StringComparison.OrdinalIgnoreCase)) continue;
                        // Only copy properties that were actually in the payload
                        var camel2 = char.ToLowerInvariant(propName[0]) + propName.Substring(1);
                        var snake2 = System.Text.RegularExpressions.Regex.Replace(propName, "([A-Z])", "_$1").TrimStart('_').ToLowerInvariant();
                        if (payloadKeys.Count > 0
                            && !payloadKeys.Contains(propName) && !payloadKeys.Contains(camel2) && !payloadKeys.Contains(snake2))
                            continue;

                        var resolved = resolution.ResolvedEntity!;
                        var inVal = prop.PropertyInfo?.GetValue(resolved);
                        if (inVal != null)
                            prop.PropertyInfo?.SetValue(existing, inVal);
                    }
                }
                // For crew_member: compute fresh EdgeChanges from ACTUAL field changes in this payload.
                // Never blindly copy EdgeChanges from the incoming payload (it may contain stale diffs
                // from a previous sync that shore has already viewed/cleared).
                if (item.TableName == "crew_member" && existing is Maritime.Shared.Models.Crew.CrewMember crewEntity && crewSnapshot != null)
                {
                    var freshDiff = ComputeCrewEdgeChanges(crewEntity, crewSnapshot);
                    if (freshDiff.Count > 0)
                    {
                        // REPLACE EdgeChanges with only what actually changed this sync.
                        // Edge sends both a delta payload AND a full entity per save.
                        // Only write when there are real diffs; when freshDiff==0 (full entity
                        // arriving after its delta was already applied) leave EdgeChanges alone.
                        crewEntity.EdgeChanges = System.Text.Json.JsonSerializer.Serialize(freshDiff);
                        crewEntity.EdgeChangesViewed = false;
                    }
                    // freshDiff==0: do nothing — preserve any notification already written by the delta
                }

                // Edge sends its own CertificateId/CountryId in crew_certificate payloads and
                // those ids are edge-local, so remap them here too — until now only the create
                // path did this, leaving updates to fail against the certificates FK.
                if (item.TableName == "crew_certificate")
                {
                    await ResolveOrphanedForeignKeysAsync(entityType, existing, item.Payload);
                }

                UpdateSyncMetadata(existing, item);
                await ResolveCrewVesselIdAsync(existing, item.OriginNode);

                // DEBUG: Final state before SaveChanges
                if (item.TableName == "crew_member")
                {
                    var osFinal = existing.GetType().GetProperty("OnboardStatus")?.GetValue(existing);
                    var iobFinal = existing.GetType().GetProperty("IsOnboard")?.GetValue(existing);
                    var efState = _context.Entry(existing).State;
                    _logger.LogWarning("[SYNC-DEBUG] FINAL before save: OnboardStatus={Os}, IsOnboard={Iob}, EF_State={State}",
                        osFinal, iobFinal, efState);
                }
            }
            else
            {
                await LogSyncOperation(item, "CONFLICT", resolution.ConflictDetail);
                // DEBUG: Log rejection
                if (item.TableName == "crew_member")
                    _logger.LogWarning("[SYNC-DEBUG] REJECTED: {Detail}", resolution.ConflictDetail);
            }
            return;
        }

        // Fallback: patch with changed properties dictionary
        var patchData = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(item.Payload, _jsonOptions);
        if (patchData == null) return;

        // Snapshot before patch for fresh EdgeChanges computation (local variable — thread-safe)
        var patchCrewSnapshot = item.TableName == "crew_member" ? SnapshotCrewFields(existing) : null;

        var entry = _context.Entry(existing);
        foreach (var kvp in patchData)
        {
            // Never overwrite EdgeChanges/EdgeChangesViewed from payload — computed fresh below
            if (kvp.Key.Equals("EdgeChanges", StringComparison.OrdinalIgnoreCase) ||
                kvp.Key.Equals("EdgeChangesViewed", StringComparison.OrdinalIgnoreCase) ||
                kvp.Key.Equals("edge_changes", StringComparison.OrdinalIgnoreCase) ||
                kvp.Key.Equals("edge_changes_viewed", StringComparison.OrdinalIgnoreCase)) continue;

            // Tên trường lệch giữa hai bên (ItemCode ↔ ShipItemCode) phải quy đổi trước khi
            // dò, nếu không cột sẽ im lặng không được vá.
            var patchKey = RenameDivergentField(kvp.Key, existing.GetType());

            // Try EF metadata lookup (PascalCase), then try case-insensitive CLR property search
            var property = entry.Metadata.FindProperty(patchKey)
                        ?? entry.Metadata.GetProperties()
                               .FirstOrDefault(p => string.Equals(p.Name, patchKey, StringComparison.OrdinalIgnoreCase)
                                                   || string.Equals(
                                                           System.Text.RegularExpressions.Regex.Replace(p.Name, "([A-Z])", "_$1").TrimStart('_').ToLower(),
                                                           patchKey, StringComparison.OrdinalIgnoreCase));
            if (property == null || property.IsKey()) continue;

            try
            {
                var targetType = property.ClrType;
                var value = ConvertJsonElement(kvp.Value, targetType);
                // Skip null and empty strings — don't overwrite good data with blanks
                if (value == null) continue;
                if (value is string sv && sv.Length == 0) continue;
                property.PropertyInfo?.SetValue(existing, value);
            }
            catch (Exception ex)
            {
                _logger.LogDebug("Skipping property {Prop}: {Error}", kvp.Key, ex.Message);
            }
        }

        // For patch path: also compute fresh EdgeChanges from actual changed fields.
        if (item.TableName == "crew_member" && existing is Maritime.Shared.Models.Crew.CrewMember patchCrew && patchCrewSnapshot != null)
        {
            var freshDiff = ComputeCrewEdgeChanges(patchCrew, patchCrewSnapshot);
            if (freshDiff.Count > 0)
            {
                // REPLACE EdgeChanges with only what actually changed this sync.
                patchCrew.EdgeChanges = System.Text.Json.JsonSerializer.Serialize(freshDiff);
                patchCrew.EdgeChangesViewed = false;
            }
            // freshDiff==0: do nothing — preserve any notification already written by the delta
        }

        // Same remap as the merge path above — the patch path writes payload values straight
        // onto the entity, so an edge-local CertificateId would reach the DB unresolved.
        if (item.TableName == "crew_certificate")
        {
            await ResolveOrphanedForeignKeysAsync(entityType, existing, item.Payload);
        }

        UpdateSyncMetadata(existing, item);
        await ResolveCrewVesselIdAsync(existing, item.OriginNode);
        _logger.LogDebug("Patched {Table}/{Key} from {Node}",
            item.TableName, item.RecordKey, item.OriginNode);
    }

    // ============================================================
    // EDGE CHANGES HELPERS
    // ============================================================

    private static readonly HashSet<string> _crewTrackableFields = new(StringComparer.OrdinalIgnoreCase)
    {
        "FullName", "DateOfBirth", "PlaceOfBirth", "Gender", "MaritalStatus",
        "Department", "RankId", "CountryId", "CrewId",
        "PhoneNumber", "EmailAddress", "Address", "EmergencyContact", "IdCardNumber",
        "Height", "Weight", "BloodGroup", "ClothingSize", "ShoeSize", "CateringSize",
        "IsSmoker", "IsCovidVaccinated",
        "JoinDate", "ContractEnd",
        "NextOfKinName", "NextOfKinRelation", "NextOfKinRelationship", "NextOfKinPhone", "NextOfKinAddress",
        "EducationInstitution", "EducationCourse", "EducationPeriodYears", "EducationGraduationYear",
        "SocialInsuranceNumber", "TaxIdNumber", "Notes",
    };

    private static readonly Dictionary<string, string> _crewFieldLabels = new(StringComparer.OrdinalIgnoreCase)
    {
        ["FullName"] = "Họ và tên",
        ["DateOfBirth"] = "Ngày sinh",
        ["PlaceOfBirth"] = "Nơi sinh",
        ["Gender"] = "Giới tính",
        ["MaritalStatus"] = "Tình trạng hôn nhân",
        ["Department"] = "Bộ phận",
        ["RankId"] = "Chức danh",
        ["CountryId"] = "Quốc tịch",
        ["CrewId"] = "Mã thuyền viên",
        ["PhoneNumber"] = "Số điện thoại",
        ["EmailAddress"] = "Email",
        ["Address"] = "Địa chỉ",
        ["EmergencyContact"] = "Liên hệ khẩn cấp",
        ["IdCardNumber"] = "CMND/CCCD",
        ["Height"] = "Chiều cao",
        ["Weight"] = "Cân nặng",
        ["BloodGroup"] = "Nhóm máu",
        ["ClothingSize"] = "Kích thước quần áo",
        ["ShoeSize"] = "Cỡ giày",
        ["CateringSize"] = "Cỡ phục vụ ăn uống",
        ["IsSmoker"] = "Hút thuốc",
        ["IsCovidVaccinated"] = "Tiêm Covid",
        ["JoinDate"] = "Ngày gia nhập",
        ["ContractEnd"] = "Hết hạn hợp đồng",
        ["NextOfKinName"] = "Tên thân nhân",
        ["NextOfKinRelation"] = "Quan hệ thân nhân",
        ["NextOfKinRelationship"] = "Quan hệ thân nhân",
        ["NextOfKinPhone"] = "SĐT thân nhân",
        ["NextOfKinAddress"] = "Địa chỉ thân nhân",
        ["EducationInstitution"] = "Cơ sở giáo dục",
        ["EducationCourse"] = "Ngành học",
        ["EducationPeriodYears"] = "Số năm học",
        ["EducationGraduationYear"] = "Năm tốt nghiệp",
        ["SocialInsuranceNumber"] = "Số BHXH",
        ["TaxIdNumber"] = "Mã số thuế",
        ["Notes"] = "Ghi chú",
    };

    /// <summary>Snapshot trackable crew fields. Returns local dict (thread-safe).</summary>
    private static Dictionary<string, string?> SnapshotCrewFields(object entity)
    {
        var snapshot = new Dictionary<string, string?>(StringComparer.OrdinalIgnoreCase);
        foreach (var prop in entity.GetType().GetProperties())
        {
            if (!_crewTrackableFields.Contains(prop.Name)) continue;
            var val = prop.GetValue(entity);
            if (val == null) { snapshot[prop.Name] = null; continue; }
            // Normalize decimals to avoid "59.00" vs "59" false positives
            var str = Convert.ToString(val, System.Globalization.CultureInfo.InvariantCulture);
            if (decimal.TryParse(str, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var d))
                str = d.ToString(System.Globalization.CultureInfo.InvariantCulture);
            snapshot[prop.Name] = str;
        }
        return snapshot;
    }

    /// <summary>Compare snapshot vs updated entity, return list of changed fields.</summary>
    private static List<object> ComputeCrewEdgeChanges(
        object updated, Dictionary<string, string?> snapshot)
    {
        var changes = new List<object>();
        if (snapshot.Count == 0) return changes;
        foreach (var prop in updated.GetType().GetProperties())
        {
            if (!snapshot.TryGetValue(prop.Name, out var oldStr)) continue;
            if (!_crewFieldLabels.TryGetValue(prop.Name, out var label)) continue;
            // Skip EdgeChanges fields themselves
            if (prop.Name.Equals("EdgeChanges", StringComparison.OrdinalIgnoreCase) ||
                prop.Name.Equals("EdgeChangesViewed", StringComparison.OrdinalIgnoreCase)) continue;
            var newVal = prop.GetValue(updated);
            var newStr = newVal == null ? null
                : Convert.ToString(newVal, System.Globalization.CultureInfo.InvariantCulture);
            // Normalize decimal/numeric strings before comparing to avoid false positives
            // e.g. "59.00" vs "59" are equal values but different strings.
            if (oldStr == newStr) continue;
            if (oldStr != null && newStr != null
                && decimal.TryParse(oldStr, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var oldDec)
                && decimal.TryParse(newStr, System.Globalization.NumberStyles.Any, System.Globalization.CultureInfo.InvariantCulture, out var newDec)
                && oldDec == newDec) continue;
            changes.Add(new
            {
                field = char.ToLowerInvariant(prop.Name[0]) + prop.Name.Substring(1),
                label,
                oldValue = oldStr ?? "",
                newValue = newStr ?? "",
                changedAt = DateTime.UtcNow.ToString("o")
            });
        }
        return changes;
    }

    // ============================================================
    // DELETE
    // ============================================================
    private async Task ProcessDeleteAsync(Type entityType, SyncQueueItemDto item)
    {
        var existing = await FindEntityByKeyAsync(entityType, item.RecordKey);
        if (existing == null)
        {
            _logger.LogDebug("DELETE for non-existent entity {Table}/{Key} — ignored",
                item.TableName, item.RecordKey);
            return;
        }

        // Check if entity supports soft delete
        if (existing is Maritime.Shared.Interfaces.ISoftDeletable softDel)
        {
            softDel.IsDeleted = true;
            softDel.DeletedAt = DateTime.UtcNow;
        }
        else
        {
            _context.Remove(existing);
        }

        _logger.LogDebug("Deleted {Table}/{Key} from {Node}",
            item.TableName, item.RecordKey, item.OriginNode);
    }

    // ============================================================
    // HELPERS
    // ============================================================

    /// <summary>
    /// Returns true if the entity already exists on shore by natural unique key (for simple ref data)
    /// or if its FK references don't exist on shore (for junction tables). Used to skip INSERT for
    /// shore-authoritative reference tables when edge and shore use different PKs for the same data.
    /// </summary>
    private async Task<bool> IsShoreRefDataDuplicateAsync(Type entityType, object entity)
    {
        if (entityType == typeof(Country))
        {
            var code = (entity as Country)?.CountryCode;
            return !string.IsNullOrEmpty(code)
                && await _context.Set<Country>().AnyAsync(c => c.CountryCode == code);
        }
        if (entityType == typeof(Rank))
        {
            var code = (entity as Rank)?.RankCode;
            return !string.IsNullOrEmpty(code)
                && await _context.Set<Rank>().AnyAsync(r => r.RankCode == code);
        }
        if (entityType == typeof(Certificate))
        {
            var code = (entity as Certificate)?.CertificateCode;
            return !string.IsNullOrEmpty(code)
                && await _context.Set<Certificate>().AnyAsync(c => c.CertificateCode == code);
        }
        if (entityType == typeof(RankCertificate))
        {
            var rc = entity as RankCertificate;
            if (rc == null) return false;
            // Skip if FK IDs don't exist on shore (edge uses different PK sequence)
            bool rankExists = await _context.Set<Rank>().AnyAsync(r => r.Id == rc.RankId);
            bool certExists = await _context.Set<Certificate>().AnyAsync(c => c.Id == rc.CertificateId);
            if (!rankExists || !certExists) return true;
            // Skip if this (RankId, CertificateId) pair already exists
            return await _context.Set<RankCertificate>()
                .AnyAsync(x => x.RankId == rc.RankId && x.CertificateId == rc.CertificateId);
        }
        if (entityType == typeof(CountryCertificate))
        {
            var cc = entity as CountryCertificate;
            if (cc == null) return false;
            // Skip if FK IDs don't exist on shore
            bool countryExists = await _context.Set<Country>().AnyAsync(c => c.Id == cc.CountryId);
            bool certExists = await _context.Set<Certificate>().AnyAsync(c => c.Id == cc.CertificateId);
            if (!countryExists || !certExists) return true;
            // Skip if this (CountryId, CertificateId) pair already exists
            return await _context.Set<CountryCertificate>()
                .AnyAsync(x => x.CountryId == cc.CountryId && x.CertificateId == cc.CertificateId);
        }
        return false;
    }

    /// <summary>
    /// Đẩy dãy số tự tăng lên bằng Id lớn nhất sau khi nhận một bản ghi từ tàu.
    ///
    /// Cột Id khai GENERATED BY DEFAULT AS IDENTITY: tàu gửi kèm Id tường minh thì Postgres
    /// nhận số đó nhưng KHÔNG đẩy dãy số lên theo. Sau nhiều lần đồng bộ, dãy số đứng yên
    /// trong khi Id thật đã đi rất xa. Đến lúc bờ tự thêm một bản ghi và để CSDL cấp số thì
    /// số cấp ra đâm vào bản ghi đã có — lỗi 23505 trên khoá chính, biểu hiện là 500 khi sửa
    /// loại chứng chỉ (29/07/2026: country_certificates Id lớn nhất 61 mà dãy số vẫn ở 11).
    ///
    /// Chỉ áp cho bảng khoá số nguyên; bảng khoá uuid không có dãy số nên bỏ qua.
    /// Lỗi ở đây KHÔNG được làm hỏng việc nhận đồng bộ — bản ghi đã lưu xong trước đó rồi.
    /// </summary>
    private async Task SyncIdentitySequenceAsync(string canonicalTable)
    {
        if (!_tableEntityMap.TryGetValue(canonicalTable, out var entityType)) return;

        var efEntity = _context.Model.FindEntityType(entityType);
        var keyProp = efEntity?.FindPrimaryKey()?.Properties.SingleOrDefault();
        if (keyProp == null) return;

        var clr = Nullable.GetUnderlyingType(keyProp.ClrType) ?? keyProp.ClrType;
        if (clr != typeof(int) && clr != typeof(long) && clr != typeof(short)) return;

        var tableName = efEntity!.GetTableName();
        var columnName = keyProp.GetColumnName();
        if (string.IsNullOrWhiteSpace(tableName) || string.IsNullOrWhiteSpace(columnName)) return;

        try
        {
            await _context.Database.ExecuteSqlRawAsync(
                @"SELECT setval(s.seq, v.max_id)
                  FROM (SELECT pg_get_serial_sequence({0}, {1}) AS seq) s,
                       LATERAL (SELECT COALESCE(MAX(""" + columnName.Replace("\"", "\"\"") + @"""), 1) AS max_id
                                FROM """ + tableName.Replace("\"", "\"\"") + @""") v
                  WHERE s.seq IS NOT NULL AND v.max_id > (SELECT last_value FROM pg_sequences
                        WHERE schemaname = 'public' AND 'public.' || quote_ident(sequencename) = s.seq)",
                tableName, columnName);
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Không đẩy được dãy số cho bảng {Table}", tableName);
        }
    }

    private async Task<object?> FindEntityByKeyAsync(Type entityType, string recordKey, string? rawPayload = null)
    {
        // Cảng: khớp bằng MÃ UN/LOCODE, không dùng Id — hai cơ sở dữ liệu đánh số độc lập nên
        // Id của tàu trùng Id một cảng khác trên bờ là chuyện thường. Xem thêm phần Port trong
        // SyncConflictHandler.FindByKeyAsync phía Edge (sự cố ghi đè cảng VNSGN 29/07/2026).
        if (entityType == typeof(ProductApi.Models.Port))
        {
            var code = ExtractStringFromPayload(rawPayload, "portCode", "PortCode", "port_code");
            if (string.IsNullOrWhiteSpace(code)) return null;
            return await _context.Ports.AsTracking()
                .FirstOrDefaultAsync(p => p.PortCode == code.Trim().ToUpper());
        }

        // Nghiep vu vat tu cua tau: bo CHI XEM, Id cua tau chinh la Id tren bo.
        // Tra thang theo Id tau gui (duong mac dinh ben duoi) - khong khop theo ma phieu
        // roi tu cap Id khac, vi lam vay pha moi khoa ngoai trong bo du lieu tau day len.

        // crew_certificate: edge sends int Id as recordKey, but some older paths
        // may send CertificateNumber. Try Id first, then fall back to CertificateNumber.
        if (entityType == typeof(CrewCertificate))
        {
            if (int.TryParse(recordKey, out var certId))
            {
                var byId = await _context.CrewCertificates
                    .AsTracking()
                    .FirstOrDefaultAsync(c => c.Id == certId);
                if (byId != null) return byId;
            }
            // Fallback: lookup by CertificateNumber (natural key)
            var byNumber = await _context.CrewCertificates
                .AsTracking()
                .FirstOrDefaultAsync(c => c.CertificateNumber == recordKey);
            if (byNumber != null) return byNumber;

            // CertificateNumber is MUTABLE yet edge uses it as the record key, so renaming a
            // certificate on board arrives keyed by a number shore has never seen. Fall back to
            // the identity anchors edge enriches the payload with — otherwise shore treats the
            // rename as a brand-new record and rebuilds it from partial data.
            return await FindCrewCertificateByPayloadAsync(rawPayload);
        }

        var keyProperty = _context.Model.FindEntityType(entityType)?
            .FindPrimaryKey()?
            .Properties
            .SingleOrDefault();
        var keyType = Nullable.GetUnderlyingType(keyProperty?.ClrType ?? typeof(string))
            ?? keyProperty?.ClrType
            ?? typeof(string);

        object? typedKey = null;
        if (keyType == typeof(Guid) && Guid.TryParse(recordKey, out var guidKey))
            typedKey = guidKey;
        else if (keyType == typeof(int) && int.TryParse(recordKey, out var intKey))
            typedKey = intKey;
        else if (keyType == typeof(long) && long.TryParse(recordKey, out var longKey))
            typedKey = longKey;
        else if (keyType == typeof(string))
            typedKey = recordKey;

        if (typedKey == null)
        {
            _logger.LogWarning("Cannot parse recordKey '{Key}' as {KeyType} for entity {Type}",
                recordKey, keyType.Name, entityType.Name);
            return null;
        }

        var entity = await _context.FindAsync(entityType, typedKey);

        // EF default is NoTracking — attach entity so modifications are persisted by SaveChangesAsync
        if (entity != null)
        {
            var entry = _context.Entry(entity);
            if (entry.State == Microsoft.EntityFrameworkCore.EntityState.Detached)
            {
                entry.State = Microsoft.EntityFrameworkCore.EntityState.Unchanged;
            }
        }

        return entity;
    }

    /// <summary>
    /// Locate an existing crew certificate from the payload's identity anchors when the record
    /// key no longer matches it (CertificateNumber renamed on edge).
    /// Returns null unless the match is unambiguous — a crew member may legitimately hold
    /// several certificates of the same type, and guessing wrong overwrites the wrong one.
    /// </summary>
    private async Task<CrewCertificate?> FindCrewCertificateByPayloadAsync(string? rawPayload)
    {
        if (string.IsNullOrWhiteSpace(rawPayload)) return null;

        // Two payload shapes reach this method and they carry DIFFERENT identity fields:
        //  • delta   → only the enrichment fields (CrewId, CrewFullName, CertificateCode)
        //  • snapshot→ the real columns (CrewMemberId, CertificateId) and no enrichment at all
        // Both must be handled, or a rename arriving as a snapshot falls through to CREATE and
        // tries to insert over an existing primary key.
        CrewMember? crew = null;
        var payloadCrewId = ExtractGuidFromPayload(rawPayload, "crewMemberId", "CrewMemberId", "crew_member_id");
        if (payloadCrewId is { } cid && cid != Guid.Empty)
            crew = await _context.CrewMembers.FirstOrDefaultAsync(c => c.Id == cid);
        crew ??= await ResolveCrewMemberFromPayloadAsync(rawPayload);
        if (crew == null) return null;

        // Edge's row id — only trustworthy once confirmed to belong to the same crew member,
        // since edge and shore assign this identity column independently.
        var payloadId = ExtractIntFromPayload(rawPayload, "id", "Id");
        if (payloadId is > 0)
        {
            var byPayloadId = await _context.CrewCertificates
                .AsTracking()
                .FirstOrDefaultAsync(c => c.Id == payloadId.Value && c.CrewMemberId == crew.Id);
            if (byPayloadId != null)
            {
                _logger.LogInformation(
                    "Crew certificate {Id} for crew {CrewId} resolved via payload Id (record key did not match)",
                    byPayloadId.Id, crew.CrewId);
                return byPayloadId;
            }
        }

        // Certificate type: prefer the code (edge and shore ids may differ), fall back to the
        // raw CertificateId that snapshot payloads carry instead.
        int? certTypeId = null;
        var certCode = ExtractCertificateCodeFromPayload(rawPayload);
        if (!string.IsNullOrWhiteSpace(certCode))
        {
            certTypeId = (await _context.Set<Certificate>()
                .FirstOrDefaultAsync(c => c.CertificateCode == certCode))?.Id;
        }
        if (certTypeId is not > 0)
            certTypeId = ExtractIntFromPayload(rawPayload, "certificateId", "CertificateId", "certificate_id");
        if (certTypeId is not > 0) return null;

        var matches = await _context.CrewCertificates
            .AsTracking()
            .Where(c => c.CrewMemberId == crew.Id && c.CertificateId == certTypeId.Value)
            .ToListAsync();

        if (matches.Count != 1)
        {
            if (matches.Count > 1)
                _logger.LogWarning(
                    "Crew {CrewId} holds {Count} certificates of type {TypeId} — cannot resolve renamed certificate unambiguously",
                    crew.CrewId, matches.Count, certTypeId.Value);
            return null;
        }

        _logger.LogInformation(
            "Crew certificate {Id} resolved via crew {CrewId} + certificate type {TypeId}",
            matches[0].Id, crew.CrewId, certTypeId.Value);
        return matches[0];
    }

    private static string? ExtractStringFromPayload(string? json, params string[] propNames)
    {
        if (string.IsNullOrWhiteSpace(json)) return null;
        try
        {
            using var doc = JsonDocument.Parse(json);
            foreach (var name in propNames)
            {
                if (doc.RootElement.TryGetProperty(name, out var el)
                    && el.ValueKind == JsonValueKind.String)
                {
                    var v = el.GetString();
                    if (!string.IsNullOrWhiteSpace(v)) return v;
                }
            }
        }
        catch { /* payload is not valid JSON */ }
        return null;
    }

    private static Guid? ExtractGuidFromPayload(string json, params string[] propNames)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            foreach (var name in propNames)
            {
                if (doc.RootElement.TryGetProperty(name, out var el)
                    && el.ValueKind == JsonValueKind.String
                    && Guid.TryParse(el.GetString(), out var value))
                    return value;
            }
        }
        catch { /* payload is not valid JSON */ }
        return null;
    }

    private static int? ExtractIntFromPayload(string json, params string[] propNames)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            foreach (var name in propNames)
            {
                if (doc.RootElement.TryGetProperty(name, out var el)
                    && el.ValueKind == JsonValueKind.Number
                    && el.TryGetInt32(out var value))
                    return value;
            }
        }
        catch { /* payload is not valid JSON */ }
        return null;
    }

    /// <summary>
    /// Force the entity's primary key to match RecordKey from the sync item.
    /// Prevents phantom duplicates when the payload is missing/mismatched Id
    /// (e.g. partial payloads produce Guid.NewGuid() default).
    /// </summary>
    private void ForceEntityPrimaryKey(Type entityType, object entity, string recordKey)
    {
        // crew_certificate: PK is auto-increment int — do NOT force it from recordKey (which is
        // CertificateNumber). Actively CLEAR it instead: the column is GENERATED BY DEFAULT AS
        // IDENTITY, so an Id carried in the payload is honoured verbatim by Postgres, and edge's
        // id means nothing on shore (separate sequences). Leaving it set makes the insert collide
        // with whatever shore row already owns that id — a 23505 on PK_crew_certificates.
        if (entityType == typeof(CrewCertificate))
        {
            if (entity is CrewCertificate cc) cc.Id = 0;
            return;
        }

        // port: cùng lý do — cột Id là GENERATED BY DEFAULT, giữ Id của tàu sẽ đâm vào
        // một cảng khác trên bờ. Định danh thật là PortCode (UN/LOCODE).
        if (entityType == typeof(ProductApi.Models.Port))
        {
            if (entity is ProductApi.Models.Port p) p.Id = 0;
            return;
        }

        // Nghiệp vụ vật tư của tàu là BẢN SAO CHỈ ĐỌC: bờ không tạo, không sửa, chỉ nhận
        // nguyên những gì tàu đẩy lên. Vì vậy Id của tàu chính là Id trên bờ — giữ nguyên,
        // KHÔNG xoá về 0 để bờ tự cấp số. Xoá đi thì bờ đánh số khác tàu, và mọi khoá ngoại
        // trong cùng bộ dữ liệu (phiếu nhập → phiếu yêu cầu, dòng chi tiết → phiếu cha) đều
        // trỏ sai, sinh 23503. Cột Id là GENERATED BY DEFAULT AS IDENTITY nên Postgres nhận
        // đúng số tàu gửi.
        if (entity is ProductApi.Models.MaterialRequest
            or ProductApi.Models.MaterialRequestItem
            or ProductApi.Models.StockReceipt
            or ProductApi.Models.StockReceiptItem
            or ProductApi.Models.InventoryStock)
        {
            return;
        }

        var entry = _context.Entry(entity);
        var keyProp = entry.Metadata.FindPrimaryKey()?.Properties.FirstOrDefault();
        if (keyProp?.PropertyInfo == null) return;

        var clrType = keyProp.ClrType;
        object? keyValue = null;

        if (clrType == typeof(Guid) && Guid.TryParse(recordKey, out var g))
            keyValue = g;
        else if (clrType == typeof(int) && int.TryParse(recordKey, out var i))
            keyValue = i;
        else if (clrType == typeof(long) && long.TryParse(recordKey, out var l))
            keyValue = l;

        if (keyValue != null)
        {
            keyProp.PropertyInfo.SetValue(entity, keyValue);
        }
    }

    /// <summary>
    /// Copy properties from source to target, skipping PK and default/empty values.
    /// This prevents overwriting existing good data with deserialization defaults
    /// (e.g. ReportNumber="", ReportTypeId=0, IsTransmitted=false).
    /// </summary>
    private async Task ApplyMaterialStockFromEdgeAsync(ProductApi.Models.MaterialItemShip material, SyncQueueItemDto item)
    {
        var vesselId = await _context.SyncNodeTrackers.Where(n => n.NodeId == item.OriginNode && !n.IsRevoked)
            .Select(n => n.VesselId).FirstOrDefaultAsync()
            ?? await _context.Vessels.Where(v => v.IMO == item.OriginNode).Select(v => (Guid?)v.Id).FirstOrDefaultAsync();
        if (!vesselId.HasValue || (material.VesselId.HasValue && material.VesselId != vesselId))
            throw new InvalidOperationException("Material stock upload belongs to another vessel or an unknown node.");
        if (_context.Entry(material).State == EntityState.Detached) _context.Attach(material);
        material.VesselId ??= vesselId;
        using var payload = JsonDocument.Parse(NormalizePayloadToCamelCase(item.Payload, typeof(ProductApi.Models.MaterialItemShip)));
        var allowed = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            { "OnHandQuantity", "MinStock", "MaxStock", "ReorderLevel", "ReorderQuantity" };
        foreach (var value in payload.RootElement.EnumerateObject())
        {
            var property = typeof(ProductApi.Models.MaterialItemShip).GetProperties()
                .FirstOrDefault(p => allowed.Contains(p.Name) && p.Name.Equals(value.Name, StringComparison.OrdinalIgnoreCase));
            if (property != null) property.SetValue(material, JsonSerializer.Deserialize(value.Value.GetRawText(), property.PropertyType, _jsonOptions));
        }
        // Definitions and deletion are authored on Shore. Old offline snapshots must not undo them.
    }

    private void CopyNonDefaultProperties(object target, object source, Type entityType)
    {
        var entry = _context.Entry(target);
        foreach (var prop in entry.Metadata.GetProperties())
        {
            if (prop.IsKey()) continue;
            if (prop.PropertyInfo == null) continue;

            var inVal = prop.PropertyInfo.GetValue(source);
            if (inVal == null) continue;

            // Skip value-type defaults (0, false, DateTime.MinValue, Guid.Empty)
            var clrType = prop.ClrType;
            if (clrType.IsValueType)
            {
                var defaultVal = Activator.CreateInstance(clrType);
                if (Equals(inVal, defaultVal)) continue;
            }

            // Skip empty strings — don't overwrite existing data with blanks
            if (inVal is string sv && sv.Length == 0) continue;

            prop.PropertyInfo.SetValue(target, inVal);
        }
    }

    private void UpdateSyncMetadata(object entity, SyncQueueItemDto item)
    {
        if (entity is Maritime.Shared.Interfaces.ISyncableEntity syncable)
        {
            syncable.IsSynced = true;
            syncable.OriginNode = item.OriginNode;
            syncable.SyncVersion = item.SyncVersion;
            syncable.UpdatedAt = DateTime.UtcNow;
        }

        // For entities that have OriginNode but don't implement ISyncableEntity
        // (e.g. MaritimeReport), always set OriginNode from the sync item metadata.
        // This ensures the correct vessel IMO is used even if the payload contains
        // the edge DB default "SHIP_01".
        SetOriginNodeFromItem(entity, item.OriginNode);
    }

    /// <summary>
    /// Auto-set VesselId from OriginNode (IMO) for entities that don't have it set.
    /// Covers CrewMember, EquipmentAsset, and MaterialItem synced from edge nodes.
    /// </summary>
    private async Task ResolveCrewVesselIdAsync(object entity, string? overrideOriginNode = null)
    {
        string? originNode = overrideOriginNode;

        // For entities without OriginNode property (EquipmentAsset, MaterialItem),
        // the caller must pass overrideOriginNode from the sync item.
        if (originNode == null)
            originNode = entity.GetType().GetProperty("OriginNode")?.GetValue(entity) as string;

        if (string.IsNullOrWhiteSpace(originNode) || originNode == "SHORE") return;

        Vessel? vessel = null;

        // Resolve registered node ownership first; legacy senders may still use IMO as NodeId.
        // Do NOT skip when VesselId is already set — ConflictResolver may have copied
        // the edge vessel GUID (different from shore's GUID) into the entity, causing an
        // FK violation. Overwriting with shore's lookup ensures correct FK every time.
        // Unknown senders must fail instead of creating invisible rows with no vessel owner.
        switch (entity)
        {
            case CrewMember:
                // KHÔNG suy ra tàu cho thuyền viên từ OriginNode.
                //
                // OriginNode bị UpdateSyncMetadata ghi đè bằng node vừa gửi tới, nên với một
                // thuyền viên tạo trên bờ rồi phát xuống tàu, cú đồng bộ dội ngược sẽ biến
                // OriginNode thành IMO của tàu đó. Suy ra VesselId từ đó tức là TỰ GÁN người
                // vừa tạo lên một con tàu mà không ai ra lệnh — và với TargetNode = "*" thì
                // tàu nào dội về sau cùng sẽ thắng.
                //
                // VesselId của thuyền viên CHỈ được đặt bởi thao tác gán tường minh
                // (CrewService.AssignToVesselAsync), không bao giờ bởi đồng bộ.
                break;
            case ProductApi.Models.EquipmentAsset asset:
                vessel = await ResolveOriginVesselAsync(originNode);
                asset.VesselId = vessel?.Id;
                break;
            case ProductApi.Models.MaterialItemShip mat:
                vessel = await ResolveOriginVesselAsync(originNode);
                mat.VesselId = vessel?.Id;
                break;
            case ProductApi.Models.MaintenanceTask task:
                vessel = await ResolveOriginVesselAsync(originNode);
                task.VesselId = vessel?.Id;
                break;

            // Nghiệp vụ vật tư/PMS dưới tàu — bờ chỉ xem, nhưng phải biết của tàu nào
            // thì mới tách được theo từng tàu trong màn chi tiết tàu.
            case ProductApi.Models.MaterialRequest req:
                vessel = await ResolveOriginVesselAsync(originNode);
                req.VesselId = vessel?.Id;
                break;
            case ProductApi.Models.StockReceipt receipt:
                vessel = await ResolveOriginVesselAsync(originNode);
                receipt.VesselId = vessel?.Id;
                break;
            case ProductApi.Models.InventoryStock stock:
                vessel = await ResolveOriginVesselAsync(originNode);
                stock.VesselId = vessel?.Id;
                break;
            case ProductApi.Models.StoreLocation loc:
                vessel = await ResolveOriginVesselAsync(originNode);
                loc.VesselId = vessel?.Id;
                break;
            case ProductApi.Models.EquipmentGroup grp:
                vessel = await ResolveOriginVesselAsync(originNode);
                grp.VesselId = vessel?.Id;
                break;
            case ProductApi.Models.MaintenanceSchedule sched:
                vessel = await ResolveOriginVesselAsync(originNode);
                sched.VesselId = vessel?.Id;
                break;
        }
    }

    /// <summary>
    /// Force OriginNode to match the sync item metadata (vessel IMO).
    /// The edge DB may still have "SHIP_01" defaults, but the sync item
    /// correctly carries the vessel IMO. Always trust the item-level value.
    /// </summary>
    private async Task<Vessel> ResolveOriginVesselAsync(string originNode)
    {
        var id = await VesselSyncIdentity.ResolveVesselIdAsync(_context, originNode);
        if (!id.HasValue) throw new InvalidOperationException($"Unknown vessel for sync node '{originNode}'");
        return (await _context.Vessels.AsNoTracking().SingleAsync(v => v.Id == id.Value));
    }

    private static void SetOriginNodeFromItem(object entity, string originNode)
    {
        if (string.IsNullOrWhiteSpace(originNode)) return;
        var prop = entity.GetType().GetProperty("OriginNode");
        if (prop != null && prop.CanWrite && prop.PropertyType == typeof(string))
        {
            prop.SetValue(entity, originNode);
        }
    }

    private async Task LogSyncOperation(SyncQueueItemDto item, string status, string? detail = null)
    {
        var log = new SyncLog
        {
            Direction = "EDGE_TO_SHORE",
            OriginNode = item.OriginNode,
            TableName = item.TableName,
            RecordKey = item.RecordKey,
            ActionType = item.ActionType,
            Status = status,
            ConflictDetail = detail,
            ProcessedAt = DateTime.UtcNow
        };
        await _context.SyncLogs.AddAsync(log);
    }

    // ============================================================
    // FK ORPHAN RESOLUTION — prevents FK violations on INSERT
    // ============================================================

    /// <summary>
    /// For entities that reference master data (e.g. CrewMember.RankId → Ranks),
    /// resolves FK values by RankCode when IDs don't match between edge and shore.
    /// Falls back to null if no match found. Prevents FK constraint violations.
    /// </summary>
    private async Task ResolveOrphanedForeignKeysAsync(Type entityType, object entity, string? rawPayload = null)
    {
        // Nghiep vu vat tu cua tau la ban sao chi doc: Id cua tau la Id tren bo, nen
        // RequestId/ReceiptId tau gui sang van tro dung phieu cha. KHONG dich lai nua.

        if (entityType == typeof(CrewMember))
        {
            var crew = (CrewMember)entity;
            if (crew.RankId.HasValue)
            {
                var shoreRank = await _context.Set<Rank>().FirstOrDefaultAsync(r => r.Id == crew.RankId.Value);
                if (shoreRank == null)
                {
                    // Edge RankId doesn't exist on shore (IDs differ between databases).
                    // Try to resolve by RankCode from the embedded Rank in the raw payload.
                    string? rankCode = null;
                    if (!string.IsNullOrEmpty(rawPayload))
                    {
                        rankCode = ExtractRankCodeFromPayload(rawPayload);
                    }

                    if (!string.IsNullOrEmpty(rankCode))
                    {
                        var matchedRank = await _context.Set<Rank>()
                            .FirstOrDefaultAsync(r => r.RankCode == rankCode);
                        if (matchedRank != null)
                        {
                            _logger.LogInformation(
                                "CrewMember {CrewId}: Resolved edge RankId {EdgeRankId} → shore RankId {ShoreRankId} via RankCode {RankCode}",
                                crew.CrewId, crew.RankId, matchedRank.Id, rankCode);
                            crew.RankId = matchedRank.Id;
                        }
                        else
                        {
                            _logger.LogWarning(
                                "CrewMember {CrewId}: RankCode {RankCode} not found on shore — setting RankId to null",
                                crew.CrewId, rankCode);
                            crew.RankId = null;
                        }
                    }
                    else
                    {
                        _logger.LogWarning(
                            "CrewMember {CrewId}: RankId {RankId} not found on shore and no RankCode in payload — setting to null",
                            crew.CrewId, crew.RankId);
                        crew.RankId = null;
                    }
                }
            }

            // ── CountryId resolution ──
            if (crew.CountryId.HasValue)
            {
                var shoreCountry = await _context.Set<Country>().FirstOrDefaultAsync(c => c.Id == crew.CountryId.Value);
                if (shoreCountry == null)
                {
                    // Edge CountryId doesn't exist on shore — resolve by CountryCode from payload
                    string? countryCode = null;
                    if (!string.IsNullOrEmpty(rawPayload))
                        countryCode = ExtractCountryCodeFromPayload(rawPayload);

                    if (!string.IsNullOrEmpty(countryCode))
                    {
                        var matchedCountry = await _context.Set<Country>()
                            .FirstOrDefaultAsync(c => c.CountryCode == countryCode);
                        if (matchedCountry != null)
                        {
                            _logger.LogInformation(
                                "CrewMember {CrewId}: Resolved edge CountryId {EdgeId} → shore CountryId {ShoreId} via CountryCode {Code}",
                                crew.CrewId, crew.CountryId, matchedCountry.Id, countryCode);
                            crew.CountryId = matchedCountry.Id;
                        }
                        else
                        {
                            _logger.LogWarning("CrewMember {CrewId}: CountryCode {Code} not found on shore — setting CountryId to null",
                                crew.CrewId, countryCode);
                            crew.CountryId = null;
                        }
                    }
                    else
                    {
                        _logger.LogWarning("CrewMember {CrewId}: CountryId {Id} not found on shore and no CountryCode in payload — setting to null",
                            crew.CrewId, crew.CountryId);
                        crew.CountryId = null;
                    }
                }
            }

            // VesselId của thuyền viên KHÔNG được suy ra từ OriginNode — xem giải thích đầy đủ
            // trong ResolveCrewVesselIdAsync. Đồng bộ không bao giờ được tự gán người lên tàu.
            //
            // Nhưng GUID tàu do Edge gửi lên là vô nghĩa trên bờ (hai bên đánh GUID độc lập),
            // để nguyên sẽ vi phạm khoá ngoại. Nên chỉ xoá giá trị lạ, tuyệt đối không gán mới.
            if (crew.VesselId.HasValue)
            {
                var vesselExists = await _context.Vessels.AsNoTracking()
                    .AnyAsync(v => v.Id == crew.VesselId.Value);
                if (!vesselExists)
                {
                    _logger.LogWarning(
                        "CrewMember {CrewId}: VesselId {VesselId} không tồn tại trên bờ — xoá về null (KHÔNG tự gán tàu khác)",
                        crew.CrewId, crew.VesselId);
                    crew.VesselId = null;
                }
            }
        }
        // CrewCertificate → Certificate + Country: resolve FK IDs by code
        if (entityType == typeof(CrewCertificate))
        {
            var cert = (CrewCertificate)entity;

            var crewExists = await _context.Set<CrewMember>().AnyAsync(c => c.Id == cert.CrewMemberId);
            if (!crewExists)
            {
                var matchedCrew = await ResolveCrewMemberFromPayloadAsync(rawPayload);
                if (matchedCrew != null)
                {
                    _logger.LogInformation(
                        "CrewCertificate {CertNum}: Resolved edge CrewMemberId {EdgeCrewId} -> shore {ShoreCrewId}",
                        cert.CertificateNumber,
                        cert.CrewMemberId,
                        matchedCrew.Id);
                    cert.CrewMemberId = matchedCrew.Id;
                }
                else
                {
                    throw new InvalidOperationException($"Unable to resolve CrewMember for crew certificate {cert.CertificateNumber}");
                }
            }

            // ── CertificateId resolution ──
            // CertificateId == 0 is the case that matters most, not one to skip: a delta payload
            // that omits the column deserializes to 0, which then trips the FK to certificates.
            // Unlike CountryId below, this FK is non-nullable — an unresolved value cannot be
            // nulled out, so fail loudly rather than let the DB raise an opaque 23503.
            var shoreCert = cert.CertificateId > 0
                ? await _context.Set<Certificate>().FirstOrDefaultAsync(c => c.Id == cert.CertificateId)
                : null;
            if (shoreCert == null)
            {
                var certCode = string.IsNullOrEmpty(rawPayload)
                    ? null
                    : ExtractCertificateCodeFromPayload(rawPayload);

                var matched = string.IsNullOrEmpty(certCode)
                    ? null
                    : await _context.Set<Certificate>().FirstOrDefaultAsync(c => c.CertificateCode == certCode);

                if (matched == null)
                {
                    throw new InvalidOperationException(
                        $"Unable to resolve CertificateId for crew certificate {cert.CertificateNumber} "
                        + $"(incoming CertificateId={cert.CertificateId}, "
                        + $"CertificateCode='{certCode ?? "<missing from payload>"}')");
                }

                _logger.LogInformation(
                    "CrewCertificate {CertNum}: Resolved CertificateId {IncomingId} → shore {ShoreId} via code {Code}",
                    cert.CertificateNumber, cert.CertificateId, matched.Id, certCode);
                cert.CertificateId = matched.Id;
            }

            // ── CountryId resolution ──
            if (cert.CountryId.HasValue)
            {
                var shoreCountry = await _context.Set<Country>().FirstOrDefaultAsync(c => c.Id == cert.CountryId.Value);
                if (shoreCountry == null)
                {
                    string? countryCode = null;
                    if (!string.IsNullOrEmpty(rawPayload))
                        countryCode = ExtractCountryCodeFromPayload(rawPayload);

                    if (!string.IsNullOrEmpty(countryCode))
                    {
                        var matched = await _context.Set<Country>()
                            .FirstOrDefaultAsync(c => c.CountryCode == countryCode);
                        if (matched != null)
                        {
                            _logger.LogInformation(
                                "CrewCertificate {CertNum}: Resolved edge CountryId {EdgeId} → shore {ShoreId} via code {Code}",
                                cert.CertificateNumber, cert.CountryId, matched.Id, countryCode);
                            cert.CountryId = matched.Id;
                        }
                        else
                        {
                            _logger.LogWarning("CrewCertificate {CertNum}: CountryCode {Code} not found on shore — setting CountryId to null",
                                cert.CertificateNumber, countryCode);
                            cert.CountryId = null;
                        }
                    }
                    else
                    {
                        _logger.LogWarning("CrewCertificate {CertNum}: CountryId {Id} not found on shore — setting to null",
                            cert.CertificateNumber, cert.CountryId);
                        cert.CountryId = null;
                    }
                }
            }
        }
        if (entityType == typeof(TravelDocument)
            || entityType == typeof(SeafarerDocument)
            || entityType == typeof(EmploymentDocument)
            || entityType == typeof(HealthDocument))
        {
            await ResolveIdentityDocumentForeignKeysAsync(entity, rawPayload);
        }
        // VoyageCrewAssignment → Rank: null out RankId if it doesn't exist on shore
        // (Edge and shore may have same ranks but with different auto-generated IDs)
        if (entityType == typeof(VoyageCrewAssignment))
        {
            var assignment = (VoyageCrewAssignment)entity;
            if (assignment.RankId.HasValue)
            {
                var rankExists = await _context.Set<Rank>().AnyAsync(r => r.Id == assignment.RankId.Value);
                if (!rankExists)
                {
                    _logger.LogWarning(
                        "VoyageCrewAssignment {Id}: RankId {RankId} not found on shore — setting to null to avoid FK violation",
                        assignment.Id, assignment.RankId);
                    assignment.RankId = null;
                }
            }
        }
        // PortCall → Port: auto-create minimal Port record if PortId references a missing port
        if (entityType == typeof(ProductApi.Models.PortCall))
        {
            var pc = (ProductApi.Models.PortCall)entity;
            if (pc.PortId.HasValue)
            {
                var portExists = await _context.Set<ProductApi.Models.Port>().AnyAsync(p => p.Id == pc.PortId.Value);
                if (!portExists)
                {
                    // Auto-create a placeholder port from the PortCall's inline data
                    var newPort = new ProductApi.Models.Port
                    {
                        Id = pc.PortId.Value,
                        PortCode = string.IsNullOrEmpty(pc.PortCode) ? $"UNK{pc.PortId}" : pc.PortCode,
                        PortName = string.IsNullOrEmpty(pc.PortName) ? $"Port {pc.PortId}" : pc.PortName,
                        Country = pc.Country ?? "",
                        IsActive = true,
                        OriginNode = pc.OriginNode,
                        CreatedAt = DateTime.UtcNow,
                        UpdatedAt = DateTime.UtcNow
                    };
                    await _context.Set<ProductApi.Models.Port>().AddAsync(newPort);
                    await _context.SaveChangesAsync();
                    _logger.LogInformation("Auto-created Port {PortId} ({PortCode}/{PortName}) from PortCall data",
                        pc.PortId, newPort.PortCode, newPort.PortName);
                }
            }
        }

        // ── SmsFormTemplate → SmsProcedure resolution ──
        if (entityType == typeof(ProductApi.Models.SmsFormTemplate))
        {
            var template = (ProductApi.Models.SmsFormTemplate)entity;
            var procExists = await _context.SmsProcedures.AnyAsync(p => p.Id == template.SmsProcedureId);
            if (!procExists)
            {
                var procCode = ExtractPropertyFromPayload(rawPayload, "ProcedureCode", "procedureCode");
                ProductApi.Models.SmsProcedure? matchedProc = null;
                if (!string.IsNullOrEmpty(procCode))
                {
                    matchedProc = await _context.SmsProcedures.FirstOrDefaultAsync(p => p.ProcedureCode == procCode);
                }

                if (matchedProc != null)
                {
                    _logger.LogInformation(
                        "SmsFormTemplate {FormCode}: Resolved edge SmsProcedureId {EdgeProcId} -> shore SmsProcedureId {ShoreProcId} via ProcedureCode {Code}",
                        template.FormCode, template.SmsProcedureId, matchedProc.Id, procCode);
                    template.SmsProcedureId = matchedProc.Id;
                }
                else
                {
                    var fallbackProc = await _context.SmsProcedures.FirstOrDefaultAsync();
                    if (fallbackProc != null)
                    {
                        _logger.LogWarning(
                            "SmsFormTemplate {FormCode}: Procedure {EdgeProcId} not found on shore — remapping to fallback procedure {FallbackId} ({FallbackCode})",
                            template.FormCode, template.SmsProcedureId, fallbackProc.Id, fallbackProc.ProcedureCode);
                        template.SmsProcedureId = fallbackProc.Id;
                    }
                }
            }
        }

        // ── SmsFilledRecord → SmsFormTemplate & FormCode resolution ──
        if (entityType == typeof(ProductApi.Models.SmsFilledRecord))
        {
            var record = (ProductApi.Models.SmsFilledRecord)entity;
            
            var template = await _context.SmsFormTemplates.FirstOrDefaultAsync(t => t.Id == record.SmsFormTemplateId);
            if (template == null)
            {
                var formCode = !string.IsNullOrWhiteSpace(record.FormCode)
                    ? record.FormCode
                    : ExtractPropertyFromPayload(rawPayload, "FormCode", "formCode");

                if (!string.IsNullOrEmpty(formCode))
                {
                    var matchedTemplate = await _context.SmsFormTemplates.FirstOrDefaultAsync(t => t.FormCode == formCode);
                    if (matchedTemplate != null)
                    {
                        _logger.LogInformation(
                            "SmsFilledRecord {Id}: Resolved edge SmsFormTemplateId {EdgeTemplateId} -> shore {ShoreTemplateId} via FormCode {FormCode}",
                            record.Id, record.SmsFormTemplateId, matchedTemplate.Id, formCode);
                        record.SmsFormTemplateId = matchedTemplate.Id;
                        template = matchedTemplate;
                    }
                }

                if (template == null)
                {
                    template = await _context.SmsFormTemplates.FirstOrDefaultAsync();
                    if (template != null)
                    {
                        _logger.LogWarning(
                            "SmsFilledRecord {Id}: Form template {EdgeTemplateId} not found on shore — remapping to fallback template {FallbackId} ({FormCode})",
                            record.Id, record.SmsFormTemplateId, template.Id, template.FormCode);
                        record.SmsFormTemplateId = template.Id;
                    }
                }
            }

            if (string.IsNullOrWhiteSpace(record.FormCode))
            {
                if (template != null && !string.IsNullOrWhiteSpace(template.FormCode))
                {
                    record.FormCode = template.FormCode;
                }
                else
                {
                    var payloadCode = ExtractPropertyFromPayload(rawPayload, "FormCode", "formCode");
                    record.FormCode = !string.IsNullOrWhiteSpace(payloadCode) ? payloadCode : "UNKNOWN";
                }
            }

            if (string.IsNullOrWhiteSpace(record.FormTitle))
            {
                if (template != null && !string.IsNullOrWhiteSpace(template.Title))
                {
                    record.FormTitle = template.Title;
                }
                else
                {
                    var payloadTitle = ExtractPropertyFromPayload(rawPayload, "FormTitle", "formTitle");
                    record.FormTitle = !string.IsNullOrWhiteSpace(payloadTitle) ? payloadTitle : record.FormCode;
                }
            }

            if (string.IsNullOrWhiteSpace(record.ProcedureCode))
            {
                if (template != null)
                {
                    var proc = await _context.SmsProcedures.FirstOrDefaultAsync(p => p.Id == template.SmsProcedureId);
                    if (proc != null && !string.IsNullOrWhiteSpace(proc.ProcedureCode))
                    {
                        record.ProcedureCode = proc.ProcedureCode;
                    }
                }

                if (string.IsNullOrWhiteSpace(record.ProcedureCode))
                {
                    var payloadProcCode = ExtractPropertyFromPayload(rawPayload, "ProcedureCode", "procedureCode");
                    record.ProcedureCode = !string.IsNullOrWhiteSpace(payloadProcCode) ? payloadProcCode : "SOP-01";
                }
            }
        }
    }

    private async Task ResolveIdentityDocumentForeignKeysAsync(object entity, string? rawPayload)
    {
        var entityName = entity.GetType().Name;
        var crewMemberIdProperty = entity.GetType().GetProperty("CrewMemberId");
        if (crewMemberIdProperty?.PropertyType == typeof(Guid))
        {
            var crewMemberId = (Guid)(crewMemberIdProperty.GetValue(entity) ?? Guid.Empty);
            if (crewMemberId != Guid.Empty)
            {
                var crewExists = await _context.CrewMembers.AnyAsync(c => c.Id == crewMemberId);
                if (!crewExists)
                {
                    var matchedCrew = await ResolveCrewMemberFromPayloadAsync(rawPayload);
                    if (matchedCrew != null)
                    {
                        crewMemberIdProperty.SetValue(entity, matchedCrew.Id);
                    }
                    else
                    {
                        var crewId = string.IsNullOrWhiteSpace(rawPayload) ? null : ExtractCrewIdFromPayload(rawPayload);
                        var crewFullName = string.IsNullOrWhiteSpace(rawPayload) ? null : ExtractCrewFullNameFromPayload(rawPayload);
                        throw new InvalidOperationException($"{entityName}: CrewMemberId {crewMemberId} not found on shore; unable to resolve CrewId '{crewId}' or CrewFullName '{crewFullName}'");
                    }
                }
            }
        }

        var countryIdProperty = entity.GetType().GetProperty("CountryId");
        if (countryIdProperty?.PropertyType == typeof(int?))
        {
            var countryId = countryIdProperty.GetValue(entity) as int?;
            if (countryId.HasValue)
            {
                var countryExists = await _context.Countries.AnyAsync(c => c.Id == countryId.Value);
                if (!countryExists)
                {
                    var countryCode = string.IsNullOrWhiteSpace(rawPayload) ? null : ExtractCountryCodeFromPayload(rawPayload);
                    if (!string.IsNullOrWhiteSpace(countryCode))
                    {
                        var matchedCountry = await _context.Countries.FirstOrDefaultAsync(c => c.CountryCode == countryCode);
                        countryIdProperty.SetValue(entity, matchedCountry?.Id);
                    }
                    else
                    {
                        countryIdProperty.SetValue(entity, null);
                    }
                }
            }
        }
    }

    private async Task<CrewMember?> ResolveCrewMemberFromPayloadAsync(string? rawPayload)
    {
        if (string.IsNullOrWhiteSpace(rawPayload))
        {
            return null;
        }

        var crewId = ExtractCrewIdFromPayload(rawPayload);
        if (!string.IsNullOrWhiteSpace(crewId))
        {
            var exactCrew = await _context.CrewMembers.FirstOrDefaultAsync(c => c.CrewId == crewId);
            if (exactCrew != null)
            {
                return exactCrew;
            }

            var normalizedCrewId = NormalizeCrewBusinessKey(crewId);
            if (!string.IsNullOrWhiteSpace(normalizedCrewId))
            {
                var normalizedMatches = await _context.CrewMembers
                    .Where(c => c.CrewId != null)
                    .ToListAsync();

                normalizedMatches = normalizedMatches
                    .Where(c => NormalizeCrewBusinessKey(c.CrewId) == normalizedCrewId)
                    .ToList();

                if (normalizedMatches.Count == 1)
                {
                    _logger.LogInformation(
                        "Resolved crew by normalized CrewId: payload {PayloadCrewId} -> shore {ShoreCrewId}",
                        crewId,
                        normalizedMatches[0].CrewId);
                    return normalizedMatches[0];
                }
            }
        }

        var crewFullName = ExtractCrewFullNameFromPayload(rawPayload);
        if (!string.IsNullOrWhiteSpace(crewFullName))
        {
            var fullNameMatches = await _context.CrewMembers
                .Where(c => c.FullName == crewFullName)
                .ToListAsync();

            if (fullNameMatches.Count == 1)
            {
                _logger.LogInformation(
                    "Resolved crew by full name: payload {CrewFullName} -> shore {ShoreCrewId}",
                    crewFullName,
                    fullNameMatches[0].CrewId);
                return fullNameMatches[0];
            }
        }

        var crewIdCardNumber = ExtractCrewIdCardNumberFromPayload(rawPayload);
        var crewDateOfBirth = ExtractCrewDateOfBirthFromPayload(rawPayload);
        if (!string.IsNullOrWhiteSpace(crewIdCardNumber))
        {
            var idCardMatches = await _context.CrewMembers
                .Where(c => c.IdCardNumber == crewIdCardNumber)
                .ToListAsync();

            if (crewDateOfBirth.HasValue)
            {
                idCardMatches = idCardMatches
                    .Where(c => c.DateOfBirth.HasValue && c.DateOfBirth.Value.Date == crewDateOfBirth.Value.Date)
                    .ToList();
            }

            if (idCardMatches.Count == 1)
            {
                _logger.LogInformation(
                    "Resolved crew by ID card/date of birth: payload {CrewIdCardNumber} -> shore {ShoreCrewId}",
                    crewIdCardNumber,
                    idCardMatches[0].CrewId);
                return idCardMatches[0];
            }
        }

        return null;
    }

    private static string? NormalizeCrewBusinessKey(string? crewId)
    {
        if (string.IsNullOrWhiteSpace(crewId))
        {
            return null;
        }

        var digits = new string(crewId.Where(char.IsDigit).ToArray());
        if (!string.IsNullOrWhiteSpace(digits))
        {
            var trimmedDigits = digits.TrimStart('0');
            return string.IsNullOrWhiteSpace(trimmedDigits) ? "0" : trimmedDigits;
        }

        return new string(crewId.Where(char.IsLetterOrDigit).ToArray()).ToUpperInvariant();
    }

    private static string? ExtractPropertyFromPayload(string? rawPayload, params string[] propertyNames)
    {
        if (string.IsNullOrWhiteSpace(rawPayload)) return null;
        try
        {
            using var doc = JsonDocument.Parse(rawPayload);
            var root = doc.RootElement;
            if (root.ValueKind != JsonValueKind.Object) return null;

            foreach (var propName in propertyNames)
            {
                foreach (var prop in root.EnumerateObject())
                {
                    if (string.Equals(prop.Name, propName, StringComparison.OrdinalIgnoreCase))
                    {
                        if (prop.Value.ValueKind == JsonValueKind.String)
                            return prop.Value.GetString();
                        if (prop.Value.ValueKind == JsonValueKind.Object && prop.Value.TryGetProperty("ProcedureCode", out var codeProp))
                            return codeProp.GetString();
                        return prop.Value.ToString();
                    }
                }
            }
        }
        catch { }
        return null;
    }

    // ============================================================
    // PAYLOAD PRE-PROCESSING
    // ============================================================

    /// <summary>
    /// Strips navigation-property objects and collections from a JSON payload, leaving only
    /// scalar values (string, number, boolean, null). This prevents EF entity graph objects
    /// (e.g. $.Rank embedded inside a CrewMember payload) from breaking System.Text.Json
    /// <summary>
    /// Extract RankCode from the embedded Rank navigation property in the raw payload.
    /// The raw payload from edge may contain: "rank": { "rankCode": "AB", ... }
    /// </summary>
    private static string? ExtractRankCodeFromPayload(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            // Try common casing variants for the Rank property
            foreach (var propName in new[] { "rank", "Rank" })
            {
                if (doc.RootElement.TryGetProperty(propName, out var rankElement)
                    && rankElement.ValueKind == JsonValueKind.Object)
                {
                    foreach (var codePropName in new[] { "rankCode", "RankCode", "rank_code" })
                    {
                        if (rankElement.TryGetProperty(codePropName, out var codeElement)
                            && codeElement.ValueKind == JsonValueKind.String)
                        {
                            return codeElement.GetString();
                        }
                    }
                }
            }
        }
        catch { /* payload is not valid JSON */ }
        return null;
    }

    /// <summary>
    /// Extract CountryCode from the embedded Country navigation property in the raw payload.
    /// The raw payload from edge may contain: "country": { "countryCode": "VNM", ... }
    /// </summary>
    private static string? ExtractCountryCodeFromPayload(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            // Top-level first — edge enriches crew_certificate deltas with a flat CountryCode.
            foreach (var flatName in new[] { "countryCode", "CountryCode", "country_code" })
            {
                if (doc.RootElement.TryGetProperty(flatName, out var flatEl)
                    && flatEl.ValueKind == JsonValueKind.String)
                    return flatEl.GetString();
            }

            foreach (var propName in new[] { "country", "Country" })
            {
                if (doc.RootElement.TryGetProperty(propName, out var el)
                    && el.ValueKind == JsonValueKind.Object)
                {
                    foreach (var codeProp in new[] { "countryCode", "CountryCode", "country_code" })
                    {
                        if (el.TryGetProperty(codeProp, out var codeEl)
                            && codeEl.ValueKind == JsonValueKind.String)
                            return codeEl.GetString();
                    }
                }
            }
        }
        catch { /* payload is not valid JSON */ }
        return null;
    }

    private static string? ExtractCrewIdFromPayload(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            foreach (var propName in new[] { "crewId", "CrewId", "crew_id" })
            {
                if (doc.RootElement.TryGetProperty(propName, out var value)
                    && value.ValueKind == JsonValueKind.String)
                {
                    return value.GetString();
                }
            }

            foreach (var propName in new[] { "crewMember", "CrewMember" })
            {
                if (doc.RootElement.TryGetProperty(propName, out var crewElement)
                    && crewElement.ValueKind == JsonValueKind.Object)
                {
                    foreach (var crewIdProp in new[] { "crewId", "CrewId", "crew_id" })
                    {
                        if (crewElement.TryGetProperty(crewIdProp, out var crewIdElement)
                            && crewIdElement.ValueKind == JsonValueKind.String)
                        {
                            return crewIdElement.GetString();
                        }
                    }
                }
            }
        }
        catch { /* payload is not valid JSON */ }

        return null;
    }

    private static string? ExtractCrewFullNameFromPayload(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            foreach (var propName in new[] { "crewFullName", "CrewFullName", "crew_full_name", "fullName", "FullName", "full_name" })
            {
                if (doc.RootElement.TryGetProperty(propName, out var value)
                    && value.ValueKind == JsonValueKind.String)
                {
                    return value.GetString();
                }
            }

            foreach (var propName in new[] { "crewMember", "CrewMember" })
            {
                if (doc.RootElement.TryGetProperty(propName, out var crewElement)
                    && crewElement.ValueKind == JsonValueKind.Object)
                {
                    foreach (var nameProp in new[] { "fullName", "FullName", "full_name" })
                    {
                        if (crewElement.TryGetProperty(nameProp, out var nameElement)
                            && nameElement.ValueKind == JsonValueKind.String)
                        {
                            return nameElement.GetString();
                        }
                    }
                }
            }
        }
        catch { /* payload is not valid JSON */ }

        return null;
    }

    private static string? ExtractCrewIdCardNumberFromPayload(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            foreach (var propName in new[] { "crewIdCardNumber", "CrewIdCardNumber", "crew_id_card_number", "idCardNumber", "IdCardNumber", "id_card_number" })
            {
                if (doc.RootElement.TryGetProperty(propName, out var value)
                    && value.ValueKind == JsonValueKind.String)
                {
                    return value.GetString();
                }
            }

            foreach (var propName in new[] { "crewMember", "CrewMember" })
            {
                if (doc.RootElement.TryGetProperty(propName, out var crewElement)
                    && crewElement.ValueKind == JsonValueKind.Object)
                {
                    foreach (var idCardProp in new[] { "idCardNumber", "IdCardNumber", "id_card_number" })
                    {
                        if (crewElement.TryGetProperty(idCardProp, out var idCardElement)
                            && idCardElement.ValueKind == JsonValueKind.String)
                        {
                            return idCardElement.GetString();
                        }
                    }
                }
            }
        }
        catch { /* payload is not valid JSON */ }

        return null;
    }

    private static DateTime? ExtractCrewDateOfBirthFromPayload(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            foreach (var propName in new[] { "crewDateOfBirth", "CrewDateOfBirth", "crew_date_of_birth", "dateOfBirth", "DateOfBirth", "date_of_birth" })
            {
                if (doc.RootElement.TryGetProperty(propName, out var value)
                    && value.ValueKind == JsonValueKind.String
                    && DateTime.TryParse(value.GetString(), out var parsedDate))
                {
                    return parsedDate;
                }
            }

            foreach (var propName in new[] { "crewMember", "CrewMember" })
            {
                if (doc.RootElement.TryGetProperty(propName, out var crewElement)
                    && crewElement.ValueKind == JsonValueKind.Object)
                {
                    foreach (var dobProp in new[] { "dateOfBirth", "DateOfBirth", "date_of_birth" })
                    {
                        if (crewElement.TryGetProperty(dobProp, out var dobElement)
                            && dobElement.ValueKind == JsonValueKind.String
                            && DateTime.TryParse(dobElement.GetString(), out var parsedDate))
                        {
                            return parsedDate;
                        }
                    }
                }
            }
        }
        catch { /* payload is not valid JSON */ }

        return null;
    }

    /// <summary>
    /// Extract CertificateCode from the embedded Certificate navigation property in the raw payload.
    /// The raw payload from edge may contain: "certificate": { "certificateCode": "BST", ... }
    /// </summary>
    private static string? ExtractCertificateCodeFromPayload(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            // Edge enriches crew_certificate payloads with a TOP-LEVEL CertificateCode
            // (see EdgeDbContext.EnrichCrewCertificatePayload); only older full-entity
            // payloads carry it nested under the Certificate navigation property.
            foreach (var flatName in new[] { "certificateCode", "CertificateCode", "certificate_code" })
            {
                if (doc.RootElement.TryGetProperty(flatName, out var flatEl)
                    && flatEl.ValueKind == JsonValueKind.String)
                    return flatEl.GetString();
            }

            foreach (var propName in new[] { "certificate", "Certificate" })
            {
                if (doc.RootElement.TryGetProperty(propName, out var el)
                    && el.ValueKind == JsonValueKind.Object)
                {
                    foreach (var codeProp in new[] { "certificateCode", "CertificateCode", "certificate_code" })
                    {
                        if (el.TryGetProperty(codeProp, out var codeEl)
                            && codeEl.ValueKind == JsonValueKind.String)
                            return codeEl.GetString();
                    }
                }
            }
        }
        catch { /* payload is not valid JSON */ }
        return null;
    }

    /// <summary>
    /// Strips navigation-property objects/arrays from synced JSON payloads to avoid
    /// deserialization into the EF entity type.
    /// </summary>
    private static string StripNavigationProperties(string json)
    {
        if (string.IsNullOrWhiteSpace(json)) return json;
        try
        {
            using var doc = JsonDocument.Parse(json);
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return json;

            using var stream = new MemoryStream();
            using (var writer = new Utf8JsonWriter(stream))
            {
                writer.WriteStartObject();
                foreach (var prop in doc.RootElement.EnumerateObject())
                {
                    // Keep primitive values and nulls directly
                    if (prop.Value.ValueKind != JsonValueKind.Object &&
                        prop.Value.ValueKind != JsonValueKind.Array)
                    {
                        prop.WriteTo(writer);
                        continue;
                    }

                    // Preserve JSON content properties even if sent as Object or Array in JSON
                    var name = prop.Name;
                    if (string.Equals(name, "FilledData", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(name, "filled_data", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(name, "DigitalSignatures", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(name, "digital_signatures", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(name, "ContentSchema", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(name, "content_schema", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(name, "EdgeChanges", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(name, "edge_changes", StringComparison.OrdinalIgnoreCase))
                    {
                        if (prop.Value.ValueKind == JsonValueKind.String)
                        {
                            prop.WriteTo(writer);
                        }
                        else
                        {
                            writer.WriteString(name, prop.Value.GetRawText());
                        }
                    }
                }
                writer.WriteEndObject();
            }
            return System.Text.Encoding.UTF8.GetString(stream.ToArray());
        }
        catch
        {
            return json; // Fallback: return original payload unchanged
        }
    }

    // ============================================================
    // SHIP DATA → VESSELS: custom field mapping handler
    // ============================================================

    /// <summary>
    /// Maps edge ShipData payload to shore Vessels table.
    /// Edge fields (snake_case/camelCase) differ from shore Vessel model.
    /// Performs UPSERT by IMO number.
    /// </summary>
    // ============================================================
    // VESSEL AUTO-REGISTRATION
    // ============================================================

    /// <summary>
    /// When a new Edge node pushes for the first time, its IMO may not exist
    /// in the Vessels table yet. This creates a minimal placeholder record so
    /// that VesselDetailPage, crew filter, and sync-log filter all work correctly
    /// immediately. A full vessel record will be created/updated later when the
    /// edge sends a ship_data sync item.
    /// </summary>
    private async Task AutoRegisterVesselAsync(string imo)
    {
        if (string.IsNullOrWhiteSpace(imo)) return;

        var exists = await _context.Vessels.AnyAsync(v => v.IMO == imo);
        if (exists) return;

        var vessel = new ProductApi.Models.Vessel
        {
            Id        = Guid.NewGuid(),
            IMO       = imo,
            Name      = $"Vessel {imo}",   // placeholder — overwritten by ship_data sync
            CallSign  = string.Empty,
            VesselType = "Unknown",
            Flag      = string.Empty,
            IsActive  = true,
            BuildDate = DateTime.UtcNow,
        };

        await _context.Vessels.AddAsync(vessel);
        await _context.SaveChangesAsync();

        _logger.LogInformation(
            "Auto-registered new vessel IMO={IMO} (placeholder — will be updated by ship_data sync)", imo);
    }

    private async Task<Dictionary<string, string>> ResolveOriginNodesToImosAsync(IEnumerable<string> originNodes)
    {
        var nodes = originNodes
            .Where(n => !string.IsNullOrWhiteSpace(n))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (nodes.Count == 0)
        {
            return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }

        return await _context.SyncNodeTrackers
            .AsNoTracking()
            .Where(n => nodes.Contains(n.NodeId) && n.ImoNumber != null && n.ImoNumber != "")
            .ToDictionaryAsync(n => n.NodeId, n => n.ImoNumber!, StringComparer.OrdinalIgnoreCase);
    }

    /// <summary>
    /// Process ship_data sync with Hybrid Master strategy:
    /// - Technical data (dimensions, machinery, radio, tanks): Edge is master → always update
    /// - Commercial data (shipowner, charterer, insurance): Shore is master → preserve existing values
    /// </summary>
    private async Task ProcessShipDataAsync(SyncQueueItemDto item)
    {
        if (string.IsNullOrWhiteSpace(item.Payload))
        {
            _logger.LogWarning("ship_data payload empty for key {Key}", item.RecordKey);
            await LogSyncOperation(item, "FAILED", "Empty payload");
            return;
        }

        using var doc = System.Text.Json.JsonDocument.Parse(item.Payload);
        var root = doc.RootElement;

        // Helper functions with case-insensitive key matching
        string? GetStr(params string[] keys)
        {
            foreach (var k in keys)
                if (root.TryGetProperty(k, out var el) && el.ValueKind == JsonValueKind.String)
                    return el.GetString();
            return null;
        }

        double? GetDbl(params string[] keys)
        {
            foreach (var k in keys)
                if (root.TryGetProperty(k, out var el) && el.ValueKind == JsonValueKind.Number && el.TryGetDouble(out var d))
                    return d;
            return null;
        }

        int? GetInt(params string[] keys)
        {
            foreach (var k in keys)
                if (root.TryGetProperty(k, out var el) && el.ValueKind == JsonValueKind.Number && el.TryGetInt32(out var i))
                    return i;
            return null;
        }

        bool GetBool(params string[] keys)
        {
            foreach (var k in keys)
                if (root.TryGetProperty(k, out var el) && el.ValueKind is JsonValueKind.True or JsonValueKind.False)
                    return el.GetBoolean();
            return false;
        }

        DateTime? GetDate(params string[] keys)
        {
            foreach (var k in keys)
                if (root.TryGetProperty(k, out var el) && el.ValueKind == JsonValueKind.String && DateTime.TryParse(el.GetString(), out var dt))
                    return DateTime.SpecifyKind(dt, DateTimeKind.Utc);
            return null;
        }

        // The payload IMO is untrusted. In Managed Mode, bind it to the IMO owned by
        // the authenticated OriginNode so one vessel credential cannot update another vessel.
        var payloadImo = GetStr("imoNumber", "ImoNumber", "imo_number", "IMO");
        if (string.IsNullOrWhiteSpace(payloadImo))
        {
            _logger.LogWarning("ship_data missing IMO for key {Key}", item.RecordKey);
            await LogSyncOperation(item, "FAILED", "Missing IMO");
            return;
        }

        var originBindings = await ResolveOriginNodesToImosAsync(new[] { item.OriginNode });
        var hasProvisionedBinding = originBindings.TryGetValue(item.OriginNode, out var provisionedImo);
        if (hasProvisionedBinding &&
            !string.Equals(payloadImo, provisionedImo, StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                $"ship_data IMO {payloadImo} does not match provisioned node vessel IMO {provisionedImo}.");
        }

        var imo = hasProvisionedBinding ? provisionedImo! : payloadImo;

        // Upsert: find by IMO or create new
        // AsTracking() needed because DbContext default is NoTracking — without it,
        // changes to the loaded entity are invisible to SaveChangesAsync.
        var vessel = await _context.Vessels.AsTracking().FirstOrDefaultAsync(v => v.IMO == imo);
        bool isNew = vessel == null;
        
        if (isNew)
        {
            vessel = new ProductApi.Models.Vessel { Id = Guid.NewGuid(), IMO = imo, CreatedAt = DateTime.UtcNow };
            await _context.Vessels.AddAsync(vessel);
            _logger.LogInformation("Creating Vessel from Edge ship_data: IMO={IMO}", imo);
        }
        else
        {
            _logger.LogDebug("Updating Vessel from Edge ship_data: IMO={IMO}", imo);
        }

        // ══════════════════════════════════════════════════════════════════
        // BASIC DATA - Always update from Edge (Edge is master)
        // ══════════════════════════════════════════════════════════════════
        
        vessel.Name = GetStr("shipName", "ShipName", "ship_name") ?? vessel.Name;
        vessel.CallSign = GetStr("callSign", "CallSign", "call_sign") ?? vessel.CallSign;
        vessel.VesselType = GetStr("typeOfVessel", "TypeOfVessel", "type_of_vessel") ?? vessel.VesselType;
        vessel.Flag = GetStr("flag", "Flag") ?? vessel.Flag;
        vessel.OfficialNumber = GetStr("officialNumber", "OfficialNumber", "official_number");
        vessel.PortOfRegistry = GetStr("portOfRegistry", "PortOfRegistry", "port_of_registry");
        vessel.PreviousName = GetStr("previousName", "PreviousName", "previous_name");
        vessel.PreviousFlag = GetStr("previousFlag", "PreviousFlag", "previous_flag");
        vessel.MmsiNumber = GetStr("mmsiNumber", "MmsiNumber", "mmsi_number");
        vessel.ClassNotation = GetStr("classNotation", "ClassNotation", "class_notation");
        vessel.ClassRegisterNumber = GetStr("classRegisterNumber", "ClassRegisterNumber", "class_register_number");
        vessel.ShipyardCountry = GetStr("shipyardCountry", "ShipyardCountry", "shipyard_country");
        vessel.ShipyardName = GetStr("shipyardName", "ShipyardName", "shipyard_name");
        vessel.YardNo = GetStr("yardNo", "YardNo", "yard_no");
        vessel.SuezCanalIdNumber = GetStr("suezCanalIdNumber", "SuezCanalIdNumber", "suez_canal_id_number");
        vessel.PanamaCanalIdNumber = GetStr("panamaCanalIdNumber", "PanamaCanalIdNumber", "panama_canal_id_number");
        vessel.VrpNumber = GetStr("vrpNumber", "VrpNumber", "vrp_number");
        vessel.VrpType = GetStr("vrpType", "VrpType", "vrp_type");
        
        vessel.KeelLaidDate = GetDate("keelLaidDate", "KeelLaidDate", "keel_laid_date");
        vessel.YearBuilt = GetInt("yearBuilt", "YearBuilt", "year_built");
        vessel.DateOfRegistry = GetDate("dateOfRegistry", "DateOfRegistry", "date_of_registry");
        vessel.MaxPersonsAllowedOB = GetInt("maxPersonsAllowedOB", "MaxPersonsAllowedOB", "max_persons_allowed_ob");
        vessel.MaxPassengersAllowedOB = GetInt("maxPassengersAllowedOB", "MaxPassengersAllowedOB", "max_passengers_allowed_ob");
        vessel.NoOfCrewSafeManning = GetInt("noOfCrewSafeManning", "NoOfCrewSafeManning", "no_of_crew_safe_manning");
        vessel.ServiceSpeedKts = GetDbl("serviceSpeedKts", "ServiceSpeedKts", "service_speed_kts");

        // Build date from year
        if (vessel.YearBuilt.HasValue && vessel.YearBuilt > 1900)
            vessel.BuildDate = new DateTime(vessel.YearBuilt.Value, 1, 1, 0, 0, 0, DateTimeKind.Utc);

        // Tonnage fields
        vessel.GrossTonnage = GetDbl("grossTonnage", "GrossTonnage", "gross_tonnage") ?? vessel.GrossTonnage;
        vessel.DeadWeight = GetDbl("deadWeight", "DeadWeight", "dead_weight", "deadweightMt", "DeadweightMt") ?? vessel.DeadWeight;
        vessel.GrossTonnageInternational = GetDbl("grossTonnageInternational", "GrossTonnageInternational", "gross_tonnage_international");
        vessel.GrossTonnageSuezCanal = GetDbl("grossTonnageSuezCanal", "GrossTonnageSuezCanal", "gross_tonnage_suez_canal");
        vessel.GrossTonnagePanamaCanal = GetDbl("grossTonnagePanamaCanal", "GrossTonnagePanamaCanal", "gross_tonnage_panama_canal");
        vessel.NettTonnageInternational = GetDbl("nettTonnageInternational", "NettTonnageInternational", "nett_tonnage_international");
        vessel.NettTonnageSuezCanal = GetDbl("nettTonnageSuezCanal", "NettTonnageSuezCanal", "nett_tonnage_suez_canal");
        vessel.NettTonnagePanamaCanal = GetDbl("nettTonnagePanamaCanal", "NettTonnagePanamaCanal", "nett_tonnage_panama_canal");

        // ══════════════════════════════════════════════════════════════════
        // DIMENSIONS - Technical data (Edge Master) - Always update
        // ══════════════════════════════════════════════════════════════════
        
        vessel.Loa = GetDbl("loa", "Loa", "LOA");
        vessel.Lbp = GetDbl("lbp", "Lbp", "LBP");
        vessel.BreadthMoulded = GetDbl("breadthMoulded", "BreadthMoulded", "breadth_moulded");
        vessel.DepthMoulded = GetDbl("depthMoulded", "DepthMoulded", "depth_moulded");
        vessel.DraftMoulded = GetDbl("draftMoulded", "DraftMoulded", "draft_moulded");
        vessel.DraftScantling = GetDbl("draftScantling", "DraftScantling", "draft_scantling");
        vessel.DraftFullBallast = GetDbl("draftFullBallast", "DraftFullBallast", "draft_full_ballast");
        vessel.HMaxAirdraft = GetDbl("hMaxAirdraft", "HMaxAirdraft", "h_max_airdraft");
        vessel.AirdraftReductionMastFouled = GetDbl("airdraftReductionMastFouled", "AirdraftReductionMastFouled");
        vessel.DDistance = GetDbl("dDistance", "DDistance", "d_distance");
        vessel.BridgeToAft = GetDbl("bridgeToAft", "BridgeToAft", "bridge_to_aft");
        vessel.BridgeToBow = GetDbl("bridgeToBow", "BridgeToBow", "bridge_to_bow");
        vessel.BowToBulbousBow = GetDbl("bowToBulbousBow", "BowToBulbousBow", "bow_to_bulbous_bow");
        vessel.ParallelBodyBallast = GetDbl("parallelBodyBallast", "ParallelBodyBallast", "parallel_body_ballast");
        vessel.ParallelBodyLoaded = GetDbl("parallelBodyLoaded", "ParallelBodyLoaded", "parallel_body_loaded");
        vessel.LightShip = GetDbl("lightShip", "LightShip", "light_ship");
        vessel.BlockCoefficientNA = GetBool("blockCoefficientNA", "BlockCoefficientNA", "block_coefficient_na");
        vessel.BlockCoefficient = GetDbl("blockCoefficient", "BlockCoefficient", "block_coefficient");
        vessel.TpcAtSummerDraft = GetDbl("tpcAtSummerDraft", "TpcAtSummerDraft", "tpc_at_summer_draft");
        vessel.FreshWaterAllowanceFwa = GetDbl("freshWaterAllowanceFwa", "FreshWaterAllowanceFwa", "fresh_water_allowance_fwa");

        // Tanker-specific dimensions
        vessel.ManifoldToWaterlineBallast = GetDbl("manifoldToWaterlineBallast", "ManifoldToWaterlineBallast");
        vessel.ManifoldToWaterlineLoaded = GetDbl("manifoldToWaterlineLoaded", "ManifoldToWaterlineLoaded");
        vessel.DeckToManifold = GetDbl("deckToManifold", "DeckToManifold", "deck_to_manifold");
        vessel.SternToManifold = GetDbl("sternToManifold", "SternToManifold", "stern_to_manifold");
        vessel.ShipsideToManifold = GetDbl("shipsideToManifold", "ShipsideToManifold", "shipside_to_manifold");
        vessel.BowToManifold = GetDbl("bowToManifold", "BowToManifold", "bow_to_manifold");
        vessel.ManifoldToKeel = GetDbl("manifoldToKeel", "ManifoldToKeel", "manifold_to_keel");
        vessel.ManifoldToBridge = GetDbl("manifoldToBridge", "ManifoldToBridge", "manifold_to_bridge");
        vessel.MaxLoadingRateShip = GetDbl("maxLoadingRateShip", "MaxLoadingRateShip", "max_loading_rate_ship");
        vessel.NumberOfLines = GetInt("numberOfLines", "NumberOfLines", "number_of_lines");
        vessel.MaxAllowablePressurePsi = GetDbl("maxAllowablePressurePsi", "MaxAllowablePressurePsi", "max_allowable_pressure_psi");
        vessel.VentingSystemShip = GetStr("ventingSystemShip", "VentingSystemShip", "venting_system_ship");

        // ══════════════════════════════════════════════════════════════════
        // MACHINERY - Technical data (Edge Master) - Always update
        // ══════════════════════════════════════════════════════════════════
        
        vessel.AnchorChainPort = GetInt("anchorChainPort", "AnchorChainPort", "anchor_chain_port");
        vessel.AnchorChainStarboard = GetInt("anchorChainStarboard", "AnchorChainStarboard", "anchor_chain_starboard");
        vessel.AnchorChainStern = GetInt("anchorChainStern", "AnchorChainStern", "anchor_chain_stern");
        vessel.AnchorChainSternNA = GetBool("anchorChainSternNA", "AnchorChainSternNA", "anchor_chain_stern_na");
        vessel.BowthrusterNA = GetBool("bowthrusterNA", "BowthrusterNA", "bowthruster_na");
        vessel.SternthrusterNA = GetBool("sternthrusterNA", "SternthrusterNA", "sternthruster_na");
        vessel.ShaftGeneratorNA = GetBool("shaftGeneratorNA", "ShaftGeneratorNA", "shaft_generator_na");
        vessel.HarbourGeneratorMaker = GetStr("harbourGeneratorMaker", "HarbourGeneratorMaker", "harbour_generator_maker");
        vessel.HarbourGeneratorMaxPowerKW = GetDbl("harbourGeneratorMaxPowerKW", "HarbourGeneratorMaxPowerKW");
        vessel.AzimuthEngFwdCount = GetInt("azimuthEngFwdCount", "AzimuthEngFwdCount", "azimuth_eng_fwd_count");
        vessel.AzimuthEngFwdMaxPowerKW = GetDbl("azimuthEngFwdMaxPowerKW", "AzimuthEngFwdMaxPowerKW");
        vessel.AzimuthEngAftCount = GetInt("azimuthEngAftCount", "AzimuthEngAftCount", "azimuth_eng_aft_count");
        vessel.AzimuthEngAftMaxPowerKW = GetDbl("azimuthEngAftMaxPowerKW", "AzimuthEngAftMaxPowerKW");

        // ══════════════════════════════════════════════════════════════════
        // RADIO COMMUNICATION - Technical data (Edge Master) - Always update
        // ══════════════════════════════════════════════════════════════════
        
        vessel.InmarsatTelex1 = GetStr("inmarsatTelex1", "InmarsatTelex1", "inmarsat_telex1");
        vessel.InmarsatTelex2 = GetStr("inmarsatTelex2", "InmarsatTelex2", "inmarsat_telex2");
        vessel.InmarsatPhone1 = GetStr("inmarsatPhone1", "InmarsatPhone1", "inmarsat_phone1");
        vessel.InmarsatPhone2 = GetStr("inmarsatPhone2", "InmarsatPhone2", "inmarsat_phone2");
        vessel.InmarsatFax1 = GetStr("inmarsatFax1", "InmarsatFax1", "inmarsat_fax1");
        vessel.InmarsatFax2 = GetStr("inmarsatFax2", "InmarsatFax2", "inmarsat_fax2");
        vessel.EmailAddress1 = GetStr("emailAddress1", "EmailAddress1", "email_address1");
        vessel.EmailAddress2 = GetStr("emailAddress2", "EmailAddress2", "email_address2");
        vessel.GsmPhone = GetStr("gsmPhone", "GsmPhone", "gsm_phone");
        vessel.SeaAreaA1 = GetBool("seaAreaA1", "SeaAreaA1", "sea_area_a1");
        vessel.SeaAreaA2 = GetBool("seaAreaA2", "SeaAreaA2", "sea_area_a2");
        vessel.SeaAreaA3 = GetBool("seaAreaA3", "SeaAreaA3", "sea_area_a3");
        vessel.SeaAreaA4 = GetBool("seaAreaA4", "SeaAreaA4", "sea_area_a4");
        vessel.DscHF = GetBool("dscHF", "DscHF", "dsc_hf");
        vessel.DscMF = GetBool("dscMF", "DscMF", "dsc_mf");
        vessel.DscVHF = GetBool("dscVHF", "DscVHF", "dsc_vhf");
        vessel.RadiotelephoneHF = GetBool("radiotelephoneHF", "RadiotelephoneHF", "radiotelephone_hf");
        vessel.RadiotelephoneMF = GetBool("radiotelephoneMF", "RadiotelephoneMF", "radiotelephone_mf");
        vessel.RadiotelephoneVHF = GetBool("radiotelephoneVHF", "RadiotelephoneVHF", "radiotelephone_vhf");
        vessel.RadiotelegraphHF = GetBool("radiotelegraphHF", "RadiotelegraphHF", "radiotelegraph_hf");
        vessel.RadiotelegraphMF = GetBool("radiotelegraphMF", "RadiotelegraphMF", "radiotelegraph_mf");
        vessel.RadiotelegraphVHF = GetBool("radiotelegraphVHF", "RadiotelegraphVHF", "radiotelegraph_vhf");
        vessel.Navtex = GetBool("navtex", "Navtex");
        vessel.Ais = GetBool("ais", "Ais", "AIS");
        vessel.SartTransponder = GetBool("sartTransponder", "SartTransponder", "sart_transponder");
        vessel.Radiotelex = GetBool("radiotelex", "Radiotelex");
        vessel.OtherRadioEquipment = GetStr("otherRadioEquipment", "OtherRadioEquipment", "other_radio_equipment");
        vessel.EpirbNumber = GetStr("epirbNumber", "EpirbNumber", "epirb_number");
        vessel.EpirbOperatingSystem = GetStr("epirbOperatingSystem", "EpirbOperatingSystem", "epirb_operating_system");
        vessel.EpirbMaker = GetStr("epirbMaker", "EpirbMaker", "epirb_maker");
        vessel.EpirbModel = GetStr("epirbModel", "EpirbModel", "epirb_model");
        vessel.EpirbFrequency = GetStr("epirbFrequency", "EpirbFrequency", "epirb_frequency");

        // ══════════════════════════════════════════════════════════════════
        // TANKS & CARGO - Technical data (Edge Master) - Always update
        // ══════════════════════════════════════════════════════════════════
        
        vessel.HfoCbm = GetDbl("hfoCbm", "HfoCbm", "hfo_cbm");
        vessel.MdoCbm = GetDbl("mdoCbm", "MdoCbm", "mdo_cbm");
        vessel.LubOilCbm = GetDbl("lubOilCbm", "LubOilCbm", "lub_oil_cbm");
        vessel.SludgeCbm = GetDbl("sludgeCbm", "SludgeCbm", "sludge_cbm");
        vessel.BilgeWaterCbm = GetDbl("bilgeWaterCbm", "BilgeWaterCbm", "bilge_water_cbm");
        vessel.SewageCbm = GetDbl("sewageCbm", "SewageCbm", "sewage_cbm");
        vessel.FreshWaterCbm = GetDbl("freshWaterCbm", "FreshWaterCbm", "fresh_water_cbm");
        vessel.BallastWaterCbm = GetDbl("ballastWaterCbm", "BallastWaterCbm", "ballast_water_cbm");
        vessel.NoOfBallastTanks = GetInt("noOfBallastTanks", "NoOfBallastTanks", "no_of_ballast_tanks");
        vessel.TeuTotal = GetInt("teuTotal", "TeuTotal", "teu_total");
        vessel.TeuOnDeck = GetInt("teuOnDeck", "TeuOnDeck", "teu_on_deck");
        vessel.TeuUnderDeck = GetInt("teuUnderDeck", "TeuUnderDeck", "teu_under_deck");
        vessel.GrainCbm = GetDbl("grainCbm", "GrainCbm", "grain_cbm");
        vessel.BalesCbm = GetDbl("balesCbm", "BalesCbm", "bales_cbm");
        vessel.NoOfCargoHolds = GetInt("noOfCargoHolds", "NoOfCargoHolds", "no_of_cargo_holds");
        vessel.NoOfHatches = GetInt("noOfHatches", "NoOfHatches", "no_of_hatches");

        // ══════════════════════════════════════════════════════════════════
        // CLASS / FLAG STATE - Technical data (Edge Master) - Always update
        // ══════════════════════════════════════════════════════════════════
        
        vessel.ClassSocietyName = GetStr("classSocietyName", "ClassSocietyName", "class_society_name");
        vessel.ClassSocietyStreet = GetStr("classSocietyStreet", "ClassSocietyStreet", "class_society_street");
        vessel.ClassSocietyCountry = GetStr("classSocietyCountry", "ClassSocietyCountry", "class_society_country");
        vessel.ClassSocietyZip = GetStr("classSocietyZip", "ClassSocietyZip", "class_society_zip");
        vessel.ClassSocietyCity = GetStr("classSocietyCity", "ClassSocietyCity", "class_society_city");
        vessel.ClassSocietyPhone = GetStr("classSocietyPhone", "ClassSocietyPhone", "class_society_phone");
        vessel.ClassSocietyFax = GetStr("classSocietyFax", "ClassSocietyFax", "class_society_fax");
        vessel.ClassSocietyTlx = GetStr("classSocietyTlx", "ClassSocietyTlx", "class_society_tlx");
        vessel.ClassSocietyEmail = GetStr("classSocietyEmail", "ClassSocietyEmail", "class_society_email");
        vessel.ClassSocietyContactPerson = GetStr("classSocietyContactPerson", "ClassSocietyContactPerson");
        
        vessel.FlagStateName = GetStr("flagStateName", "FlagStateName", "flag_state_name");
        vessel.FlagStateStreet = GetStr("flagStateStreet", "FlagStateStreet", "flag_state_street");
        vessel.FlagStateCountry = GetStr("flagStateCountry", "FlagStateCountry", "flag_state_country");
        vessel.FlagStateZip = GetStr("flagStateZip", "FlagStateZip", "flag_state_zip");
        vessel.FlagStateCity = GetStr("flagStateCity", "FlagStateCity", "flag_state_city");
        vessel.FlagStatePhone = GetStr("flagStatePhone", "FlagStatePhone", "flag_state_phone");
        vessel.FlagStateFax = GetStr("flagStateFax", "FlagStateFax", "flag_state_fax");
        vessel.FlagStateTlx = GetStr("flagStateTlx", "FlagStateTlx", "flag_state_tlx");
        vessel.FlagStateEmail = GetStr("flagStateEmail", "FlagStateEmail", "flag_state_email");
        vessel.FlagStateContactPerson = GetStr("flagStateContactPerson", "FlagStateContactPerson", "flag_state_contact_person");

        // ══════════════════════════════════════════════════════════════════
        // COMMERCIAL DATA (Shipowner, Charterer, Insurance)
        // ══════════════════════════════════════════════════════════════════
        // IMPORTANT: DO NOT overwrite these fields if already set on Shore
        // Shore is the master for commercial data
        // Strategy: Fill from Edge only if field is currently null (initial sync)
        //           OR if vessel has never been edited on Shore (LastShoreSyncAt == null)
        // ══════════════════════════════════════════════════════════════════

        // Check if this is initial sync (vessel exists but has never been edited on Shore)
        bool isInitialSync = vessel.LastShoreSyncAt == null;
        
        // For new vessels OR initial sync: accept commercial data from Edge as initial values
        if (isNew || isInitialSync)
        {
            // Only fill if current value is null (preserve Shore edits)
            vessel.ShipownerName ??= GetStr("shipownerName", "ShipownerName", "shipowner_name");
            vessel.ShipownerStreet ??= GetStr("shipownerStreet", "ShipownerStreet", "shipowner_street");
            vessel.ShipownerCountry ??= GetStr("shipownerCountry", "ShipownerCountry", "shipowner_country");
            vessel.ShipownerZip ??= GetStr("shipownerZip", "ShipownerZip", "shipowner_zip");
            vessel.ShipownerCity ??= GetStr("shipownerCity", "ShipownerCity", "shipowner_city");
            vessel.ShipownerPhone ??= GetStr("shipownerPhone", "ShipownerPhone", "shipowner_phone");
            vessel.ShipownerFax ??= GetStr("shipownerFax", "ShipownerFax", "shipowner_fax");
            vessel.ShipownerEmail ??= GetStr("shipownerEmail", "ShipownerEmail", "shipowner_email");
            vessel.ShipownerContactPerson ??= GetStr("shipownerContactPerson", "ShipownerContactPerson", "shipowner_contact_person");
            
            vessel.ManagingOwnerName ??= GetStr("managingOwnerName", "ManagingOwnerName", "managing_owner_name");
            vessel.ManagingOwnerEmail ??= GetStr("managingOwnerEmail", "ManagingOwnerEmail", "managing_owner_email");
            vessel.ManagingOwnerContactPerson ??= GetStr("managingOwnerContactPerson", "ManagingOwnerContactPerson");
            
            vessel.OperatorName ??= GetStr("operatorName", "OperatorName", "operator_name");
            vessel.OperatorEmail ??= GetStr("operatorEmail", "OperatorEmail", "operator_email");
            vessel.OperatorContactPerson ??= GetStr("operatorContactPerson", "OperatorContactPerson");
            
            vessel.CsoFirstName ??= GetStr("csoFirstName", "CsoFirstName", "cso_first_name");
            vessel.CsoLastName ??= GetStr("csoLastName", "CsoLastName", "cso_last_name");
            vessel.CsoEmail ??= GetStr("csoEmail", "CsoEmail", "cso_email");
            vessel.CsoPhone24h ??= GetStr("csoPhone24h", "CsoPhone24h", "cso_phone_24h");
            
            vessel.DpaFirstName ??= GetStr("dpaFirstName", "DpaFirstName", "dpa_first_name");
            vessel.DpaLastName ??= GetStr("dpaLastName", "DpaLastName", "dpa_last_name");
            vessel.DpaEmail ??= GetStr("dpaEmail", "DpaEmail", "dpa_email");
            vessel.DpaPhone24h ??= GetStr("dpaPhone24h", "DpaPhone24h", "dpa_phone_24h");
            
            vessel.ChartererName ??= GetStr("chartererName", "ChartererName", "charterer_name");
            vessel.ChartererStreet ??= GetStr("chartererStreet", "ChartererStreet", "charterer_street");
            vessel.ChartererCountry ??= GetStr("chartererCountry", "ChartererCountry", "charterer_country");
            vessel.ChartererZip ??= GetStr("chartererZip", "ChartererZip", "charterer_zip");
            vessel.ChartererCity ??= GetStr("chartererCity", "ChartererCity", "charterer_city");
            vessel.ChartererPhone ??= GetStr("chartererPhone", "ChartererPhone", "charterer_phone");
            vessel.ChartererEmail ??= GetStr("chartererEmail", "ChartererEmail", "charterer_email");
            vessel.ChartererContactPerson ??= GetStr("chartererContactPerson", "ChartererContactPerson", "charterer_contact_person");
            
            vessel.BareboatChartererName ??= GetStr("bareboatChartererName", "BareboatChartererName", "bareboat_charterer_name");
            vessel.BareboatChartererEmail ??= GetStr("bareboatChartererEmail", "BareboatChartererEmail", "bareboat_charterer_email");
            vessel.BareboatChartererContactPerson ??= GetStr("bareboatChartererContactPerson", "BareboatChartererContactPerson");
            
            vessel.PiClubName ??= GetStr("piClubName", "PiClubName", "pi_club_name");
            vessel.PiClubStreet ??= GetStr("piClubStreet", "PiClubStreet", "pi_club_street");
            vessel.PiClubCountry ??= GetStr("piClubCountry", "PiClubCountry", "pi_club_country");
            vessel.PiClubZip ??= GetStr("piClubZip", "PiClubZip", "pi_club_zip");
            vessel.PiClubCity ??= GetStr("piClubCity", "PiClubCity", "pi_club_city");
            vessel.PiClubPhone ??= GetStr("piClubPhone", "PiClubPhone", "pi_club_phone");
            vessel.PiClubEmail ??= GetStr("piClubEmail", "PiClubEmail", "pi_club_email");
            vessel.PiClubContactPerson ??= GetStr("piClubContactPerson", "PiClubContactPerson", "pi_club_contact_person");
            
            vessel.HmClubName ??= GetStr("hmClubName", "HmClubName", "hm_club_name");
            vessel.HmClubEmail ??= GetStr("hmClubEmail", "HmClubEmail", "hm_club_email");
            vessel.HmClubContactPerson ??= GetStr("hmClubContactPerson", "HmClubContactPerson", "hm_club_contact_person");
            
            _logger.LogInformation("Filled commercial data from Edge for vessel IMO={IMO} (IsNew={IsNew}, IsInitialSync={IsInitialSync})", 
                imo, isNew, isInitialSync);
        }
        
        // ══════════════════════════════════════════════════════════════════
        // UPDATE METADATA
        // ══════════════════════════════════════════════════════════════════
        
        vessel.LastEdgeSyncAt = DateTime.UtcNow;
        vessel.UpdatedAt = DateTime.UtcNow;
        vessel.IsActive = true;

        _logger.LogInformation("Processed ship_data sync for IMO={IMO} (New={IsNew}, Technical fields updated)", imo, isNew);
        await LogSyncOperation(item, "SUCCESS");
    }

    private static object? ConvertJsonElement(JsonElement element, Type targetType)
    {
        if (element.ValueKind == JsonValueKind.Null) return null;

        var underlying = Nullable.GetUnderlyingType(targetType) ?? targetType;

        if (underlying == typeof(string)) return element.GetString();
        if (underlying == typeof(int)) return element.GetInt32();
        if (underlying == typeof(long)) return element.GetInt64();
        if (underlying == typeof(Guid)) return element.GetGuid();
        if (underlying == typeof(bool)) return element.GetBoolean();
        if (underlying == typeof(DateTime)) return element.GetDateTime();
        if (underlying == typeof(decimal)) return element.GetDecimal();
        if (underlying == typeof(double)) return element.GetDouble();
        if (underlying == typeof(float)) return element.GetSingle();

        // Enum support
        if (underlying.IsEnum)
        {
            var str = element.ToString();
            return Enum.TryParse(underlying, str, ignoreCase: true, out var enumVal) ? enumVal : null;
        }

        // Fallback: convert via string
        try
        {
            return Convert.ChangeType(element.ToString(), underlying);
        }
        catch
        {
            return null;
        }
    }

    // ============================================================
    // ONBOARD EVENT HANDLER — processes Edge onboard events with
    // business logic (assignment updates, crew status, access grants)
    // ============================================================

    private async Task ProcessOnboardEventFromEdgeAsync(SyncQueueItemDto item)
    {
        if (string.IsNullOrWhiteSpace(item.Payload))
            throw new InvalidOperationException($"Empty payload for {item.TableName}/{item.RecordKey}");

        var cleanPayload = NormalizePayloadToCamelCase(StripNavigationProperties(item.Payload));

        switch (item.TableName.ToLowerInvariant())
        {
            case "onboard_event":
                await ProcessOnboardEventEntityAsync(cleanPayload, item);
                break;
            case "sign_on_record":
                await ProcessSignOnFromEdgeAsync(cleanPayload, item);
                break;
            case "sign_off_record":
                await ProcessSignOffFromEdgeAsync(cleanPayload, item);
                break;
        }
    }

    private async Task ProcessOnboardEventEntityAsync(string payload, SyncQueueItemDto item)
    {
        var ev = JsonSerializer.Deserialize<OnboardEvent>(payload, _jsonOptions);
        if (ev == null) throw new InvalidOperationException("Failed to deserialize OnboardEvent");

        // Upsert: check if exists
        var existing = await _context.OnboardEvents.FindAsync(ev.Id);
        if (existing != null)
        {
            _context.Entry(existing).CurrentValues.SetValues(ev);
            existing.IsSynced = true;
        }
        else
        {
            ev.IsSynced = true;
            await _context.OnboardEvents.AddAsync(ev);
        }

        // Business logic: update assignment status based on event type
        if (ev.AssignmentId.HasValue)
        {
            var assignment = await _context.CrewAssignments.FindAsync(ev.AssignmentId.Value);
            if (assignment != null)
            {
                if (ev.EventType == OnboardEventType.Arrived
                    && (assignment.Status == AssignmentStatus.ReadyToJoin
                        || assignment.Status == AssignmentStatus.TravelInProgress))
                {
                    assignment.Status = AssignmentStatus.OnBoarded;
                    assignment.ActualStartDate ??= ev.EventTimestamp;
                    assignment.StatusChangedAt = DateTime.UtcNow;
                    assignment.StatusChangedBy = $"Edge:{ev.ConfirmedBy}";
                    assignment.UpdatedAt = DateTime.UtcNow;
                }
            }
        }

        _logger.LogInformation("Processed onboard_event {Id} type={Type} crew={CrewId} from Edge",
            ev.Id, ev.EventType, ev.CrewMemberId);
        await LogSyncOperation(item, "SUCCESS");
    }

    private async Task ProcessSignOnFromEdgeAsync(string payload, SyncQueueItemDto item)
    {
        var record = JsonSerializer.Deserialize<SignOnRecord>(payload, _jsonOptions);
        if (record == null) throw new InvalidOperationException("Failed to deserialize SignOnRecord");

        // Upsert
        var existing = await _context.SignOnRecords.FindAsync(record.Id);
        if (existing != null)
        {
            _context.Entry(existing).CurrentValues.SetValues(record);
            existing.IsSynced = true;
        }
        else
        {
            record.IsSynced = true;
            await _context.SignOnRecords.AddAsync(record);
        }

        // Business logic: update assignment to OnBoarded
        if (record.AssignmentId.HasValue)
        {
            var assignment = await _context.CrewAssignments.FindAsync(record.AssignmentId.Value);
            if (assignment != null && assignment.Status != AssignmentStatus.OnBoarded
                && assignment.Status != AssignmentStatus.Completed)
            {
                assignment.Status = AssignmentStatus.OnBoarded;
                assignment.ActualStartDate ??= record.SignOnDate;
                assignment.StatusChangedAt = DateTime.UtcNow;
                assignment.StatusChangedBy = $"Edge:{record.SignedOnBy}";
                assignment.UpdatedAt = DateTime.UtcNow;

                _context.AssignmentStatusHistory.Add(new AssignmentStatusHistory
                {
                    Id = Guid.NewGuid(),
                    AssignmentId = assignment.Id,
                    FromStatus = assignment.Status,
                    ToStatus = AssignmentStatus.OnBoarded,
                    ChangedBy = $"Edge:{record.SignedOnBy}",
                    Reason = "Sign-on received from Edge",
                });
            }
        }

        // Update crew status: IsOnboard = true, PoolStatus = Assigned
        var crew = await _context.CrewMembers.FindAsync(record.CrewMemberId);
        if (crew != null)
        {
            crew.IsOnboard = true;
            crew.EmbarkDate = record.SignOnDate;
            crew.PoolStatus = PoolStatus.Assigned;
            crew.UpdatedAt = DateTime.UtcNow;
        }

        // Auto-grant access if none exists
        var hasGrant = await _context.CrewAccessGrants
            .AnyAsync(g => g.CrewMemberId == record.CrewMemberId
                && g.VesselId == record.VesselId
                && g.Status == AccessGrantStatus.Granted);

        if (!hasGrant)
        {
            _context.CrewAccessGrants.Add(new CrewAccessGrant
            {
                CrewMemberId = record.CrewMemberId,
                VesselId = record.VesselId,
                AssignmentId = record.AssignmentId,
                Module = "All",
                Status = AccessGrantStatus.Granted,
                GrantedAt = DateTime.UtcNow,
                GrantedBy = $"System (Edge Sign-On by {record.SignedOnBy})"
            });
        }

        // Create service record if not exists for this period
        var hasServiceRecord = await _context.ServiceRecords
            .AnyAsync(sr => sr.CrewMemberId == record.CrewMemberId
                && sr.DisembarkDate == null
                && sr.BoardingDate >= record.SignOnDate.AddDays(-1));

        if (!hasServiceRecord)
        {
            var vessel = await _context.Vessels.FindAsync(record.VesselId);
            var rank = await _context.Set<Rank>().FindAsync(record.RankId);
            _context.ServiceRecords.Add(new ServiceRecord
            {
                CrewMemberId = record.CrewMemberId,
                VesselName = vessel?.Name ?? "Unknown",
                VesselFlag = vessel?.Flag,
                VesselType = vessel?.VesselType,
                RankAtTime = rank?.RankName,
                BoardingDate = record.SignOnDate,
                BoardingPortCode = record.PortCode,
                BoardingPortName = record.PortName,
                OriginNode = "EDGE",
                Notes = $"Sign-on synced from Edge by {record.SignedOnBy}"
            });
        }

        _logger.LogInformation("Processed sign_on_record {Id} crew={CrewId} vessel={VesselId} from Edge",
            record.Id, record.CrewMemberId, record.VesselId);
        await LogSyncOperation(item, "SUCCESS");

        // ── Sign-on notification ───────────────────────────────────────────────
        var crewName = crew?.FullName ?? record.CrewMemberId.ToString();
        var signOnVessel = await _context.Vessels.FindAsync(record.VesselId);
        var vesselName = signOnVessel?.Name ?? record.VesselId.ToString();
        await _notifications.CreateAsync(
            type: "sign_on",
            title: "Thuyền viên lên tàu",
            message: $"{crewName} đã ký lên tàu {vesselName}" +
                     (string.IsNullOrWhiteSpace(record.SignedOnBy) ? "" : $" (bởi {record.SignedOnBy})"),
            vesselId: record.VesselId,
            vesselName: vesselName,
            crewMemberId: record.CrewMemberId,
            crewName: crewName);
    }

    private async Task ProcessSignOffFromEdgeAsync(string payload, SyncQueueItemDto item)
    {
        var record = JsonSerializer.Deserialize<SignOffRecord>(payload, _jsonOptions);
        if (record == null) throw new InvalidOperationException("Failed to deserialize SignOffRecord");

        // Upsert
        var existing = await _context.SignOffRecords.FindAsync(record.Id);
        if (existing != null)
        {
            _context.Entry(existing).CurrentValues.SetValues(record);
            existing.IsSynced = true;
        }
        else
        {
            record.IsSynced = true;
            await _context.SignOffRecords.AddAsync(record);
        }

        // Business logic: complete assignment
        if (record.AssignmentId.HasValue)
        {
            var assignment = await _context.CrewAssignments.FindAsync(record.AssignmentId.Value);
            if (assignment != null && assignment.Status != AssignmentStatus.Completed)
            {
                var oldStatus = assignment.Status;
                assignment.Status = AssignmentStatus.Completed;
                assignment.ActualEndDate = record.SignOffDate;
                assignment.StatusChangedAt = DateTime.UtcNow;
                assignment.StatusChangedBy = $"Edge:{record.SignedOffBy}";
                assignment.UpdatedAt = DateTime.UtcNow;

                _context.AssignmentStatusHistory.Add(new AssignmentStatusHistory
                {
                    Id = Guid.NewGuid(),
                    AssignmentId = assignment.Id,
                    FromStatus = oldStatus,
                    ToStatus = AssignmentStatus.Completed,
                    ChangedBy = $"Edge:{record.SignedOffBy}",
                    Reason = $"Sign-off from Edge: {record.Reason}",
                });
            }
        }

        // Revoke access grants for this crew on this vessel
        var activeGrants = await _context.CrewAccessGrants
            .Where(g => g.CrewMemberId == record.CrewMemberId
                && g.VesselId == record.VesselId
                && g.Status == AccessGrantStatus.Granted)
            .ToListAsync();

        foreach (var grant in activeGrants)
        {
            grant.Status = AccessGrantStatus.Revoked;
            grant.RevokedAt = DateTime.UtcNow;
            grant.RevokedBy = $"System (Edge Sign-Off)";
            grant.RevokeReason = $"Sign-off: {record.Reason}";
            grant.UpdatedAt = DateTime.UtcNow;
        }

        // Update crew status
        var crew = await _context.CrewMembers.FindAsync(record.CrewMemberId);
        if (crew != null)
        {
            crew.IsOnboard = false;
            crew.DisembarkDate = record.SignOffDate;
            crew.UpdatedAt = DateTime.UtcNow;

            // Check if crew has other active assignments
            var hasOtherActive = await _context.CrewAssignments
                .AnyAsync(a => a.CrewMemberId == record.CrewMemberId
                    && a.Id != record.AssignmentId
                    && AssignmentStatus.Active.Contains(a.Status));

            crew.PoolStatus = hasOtherActive ? PoolStatus.Assigned : PoolStatus.Available;
        }

        // Update service record — set disembark date
        var serviceRecord = await _context.ServiceRecords
            .Where(sr => sr.CrewMemberId == record.CrewMemberId && sr.DisembarkDate == null)
            .OrderByDescending(sr => sr.BoardingDate)
            .FirstOrDefaultAsync();

        if (serviceRecord != null)
        {
            serviceRecord.DisembarkDate = record.SignOffDate;
            serviceRecord.DisembarkPortCode = record.PortCode;
            serviceRecord.DisembarkPortName = record.PortName;
            serviceRecord.UpdatedAt = DateTime.UtcNow;
        }

        _logger.LogInformation("Processed sign_off_record {Id} crew={CrewId} vessel={VesselId} reason={Reason} from Edge",
            record.Id, record.CrewMemberId, record.VesselId, record.Reason);
        await LogSyncOperation(item, "SUCCESS");

        // ── Sign-off notification ──────────────────────────────────────────────
        var signOffCrewName = crew?.FullName ?? record.CrewMemberId.ToString();
        var signOffVessel = await _context.Vessels.FindAsync(record.VesselId);
        var signOffVesselName = signOffVessel?.Name ?? record.VesselId.ToString();
        await _notifications.CreateAsync(
            type: "sign_off",
            title: "Thuyền viên xuống tàu",
            message: $"{signOffCrewName} đã ký xuống tàu {signOffVesselName}" +
                     (string.IsNullOrWhiteSpace(record.Reason) ? "" : $" (lý do: {record.Reason})"),
            vesselId: record.VesselId,
            vesselName: signOffVesselName,
            crewMemberId: record.CrewMemberId,
            crewName: signOffCrewName);
    }

    private async Task AutoUpdateVesselPositionAsync(SyncQueueItemDto item)
    {
        if (string.IsNullOrWhiteSpace(item.Payload)) return;
        try 
        {
            var cleanPayload = NormalizePayloadToCamelCase(StripNavigationProperties(item.Payload));
            var positionData = JsonSerializer.Deserialize<ProductApi.Models.PositionData>(cleanPayload, _jsonOptions);
            
            if (positionData != null && !string.IsNullOrWhiteSpace(positionData.OriginNode))
            {
                var vessel = await _context.Vessels.FirstOrDefaultAsync(v => v.IMO == positionData.OriginNode);
                if (vessel != null)
                {
                    var vesselPos = new ProductApi.Models.VesselPosition
                    {
                        Id = positionData.Id, // Link ID mapping to prevent duplicate creation on retry
                        VesselId = vessel.Id,
                        Latitude = positionData.Latitude,
                        Longitude = positionData.Longitude,
                        Speed = positionData.SpeedOverGround,
                        Course = positionData.CourseOverGround,
                        Timestamp = positionData.Timestamp,
                        Source = positionData.Source ?? "GPS"
                    };
                    
                    var existing = await _context.VesselPositions.FindAsync(vesselPos.Id);
                    if (existing == null)
                    {
                        await _context.VesselPositions.AddAsync(vesselPos);
                        await _context.SaveChangesAsync();
                        _logger.LogInformation("Auto-created VesselPosition for {VesselName} at {Lat},{Lon}", vessel.Name, vesselPos.Latitude, vesselPos.Longitude);
                    }
                    else
                    {
                        existing.Latitude = vesselPos.Latitude;
                        existing.Longitude = vesselPos.Longitude;
                        existing.Speed = vesselPos.Speed;
                        existing.Course = vesselPos.Course;
                        existing.Timestamp = vesselPos.Timestamp;
                        await _context.SaveChangesAsync();
                    }
                }
                else
                {
                    _logger.LogWarning("AutoUpdateVesselPositionAsync: Vessel not found with IMO={IMO}", positionData.OriginNode);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to auto-update VesselPosition from position_data");
        }
    }
}
