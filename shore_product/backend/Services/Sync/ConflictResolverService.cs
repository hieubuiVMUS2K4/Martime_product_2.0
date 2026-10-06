using Maritime.Shared.Interfaces;
using System.Reflection;
using System.Text.Json;

namespace ProductApi.Services.Sync;

/// <summary>
/// Interface for resolving conflicts between Edge and Shore data.
/// </summary>
public interface IConflictResolverService
{
    ConflictResolution Resolve(string tableName, object existing, object incoming, string originNode, IReadOnlySet<string>? fields = null);
}

/// <summary>
/// Result of conflict resolution.
/// </summary>
public class ConflictResolution
{
    public bool ShouldApply { get; set; }
    public object? ResolvedEntity { get; set; }
    public string? ConflictDetail { get; set; }

    public static ConflictResolution Apply(object resolved)
        => new() { ShouldApply = true, ResolvedEntity = resolved };

    public static ConflictResolution Reject(string reason)
        => new() { ShouldApply = false, ConflictDetail = reason };
}

/// <summary>
/// Domain-based conflict resolution following maritime crew data rules:
/// 
/// 1. MASTER DATA (certificates, countries, ranks):
///    → Shore ALWAYS wins (shore is source of truth for reference data)
///
/// 2. CREW DATA (CrewMember basic info):
///    → Shore wins for: FullName, DateOfBirth, Nationality, CrewId (HR data)
///    → Edge wins for: IsOnboard, EmbarkDate, DisembarkDate (operational data)  
///
/// 3. CREW CERTIFICATES:
///    → Shore wins for: CertificateNumber, IssueDate, ExpiryDate (official records)
///    → Edge wins for: DocumentFilePath (scanned copy on board)
///
/// 4. DOCUMENTS:
///    → Shore wins for: official document metadata
///    → Edge wins for: file uploads (local scans)
///
/// 5. SERVICE RECORDS:
///    → Edge wins (created on board during voyage)
/// 
/// Fallback: Last-Write-Wins using UpdatedAt timestamps.
/// </summary>
public class ConflictResolverService : IConflictResolverService
{
    private readonly ILogger<ConflictResolverService> _logger;

    // Properties where Shore is authoritative (overrides edge changes).
    // NOTE: Keep this list minimal — only fields that Shore HR admins own.
    // Crew personal data (FullName, DOB etc.) is created & edited on the ship (edge),
    // so those fields must NOT be listed here.
    private static readonly HashSet<string> _shoreAuthoritativeCrewProps = new(StringComparer.OrdinalIgnoreCase)
    {
        "SocialInsuranceNumber", "TaxIdNumber"
    };

    // Properties where Edge is authoritative (operational data from ship)
    private static readonly HashSet<string> _edgeAuthoritativeCrewProps = new(StringComparer.OrdinalIgnoreCase)
    {
        "IsOnboard", "EmbarkDate", "DisembarkDate",
        "EmbarkPort", "DisembarkPort",
        "ShipId", "CurrentShipName",
        "PhotoUrl",   // Edge owns the avatar file (shore field name)
        "AvatarUrl",  // Alias in case serialisation uses camelCase variant
    };

    // Tables where Shore always wins
    private static readonly HashSet<string> _shoreAuthoritative = new(StringComparer.OrdinalIgnoreCase)
    {
        "certificate", "country", "rank",
        "rank_certificate", "country_certificate",
        "report_type",
        // Danh mục cảng — bờ làm chủ, phát xuống mọi tàu. Trước đây bị xếp nhầm vào nhóm
        // bảng chuyến đi nên mọi cú dội ngược từ tàu đều báo CONFLICT.
        "port"
    };

    // Tables where Edge always wins
    private static readonly HashSet<string> _edgeAuthoritative = new(StringComparer.OrdinalIgnoreCase)
    {
        "service_record",
        "nmea_raw_data", "navigation_data", "environmental_data", "task_deferral_request",
        "position_data", "engine_data", "maritime_report", "noon_report",
        // Voyage tables are NOT here — they have special handling below
        "port_call", "voyage_status_history",
        "cargo_operation", "voyage_log_entry"
    };

    // ════════════════════════════════════════════════════════════
    // VOYAGE DOMAIN OWNERSHIP RULES (Phase 1)
    // ════════════════════════════════════════════════════════════
    // VoyageRecord: Factual data (EDGE) + Planning data (SHORE)
    // Properties where Edge owns the data (actual operation status)
    private static readonly IReadOnlySet<string> _voyageEdgeOwnedFields = Maritime.Shared.Models.Sync.VoyageSyncOwnership.EdgeRecordFields;

    // Properties where Shore owns the data (planning & financial)
    private static readonly IReadOnlySet<string> _voyageShoreOwnedFields = Maritime.Shared.Models.Sync.VoyageSyncOwnership.ShoreRecordFields;

    // VoyagePlanLeg: Use Last-Write-Wins (Hybrid ownership)
    private static readonly HashSet<string> _voyagePlanLegHybridFields = new(StringComparer.OrdinalIgnoreCase)
    {
        "PlannedDepartureTime", "PlannedArrivalTime",
        "PlannedDistance", "PlannedDurationHours", "PlannedAverageSpeed",
        "PlannedFuelConsumption"
    };

    // Tables that require special voyage handling
    private static readonly HashSet<string> _voyageDomainTables = new(StringComparer.OrdinalIgnoreCase)
    {
        "voyage_record",
        "voyage_plan_leg",
        "voyage_crew_assignment",
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
    };

    public ConflictResolverService(ILogger<ConflictResolverService> logger)
    {
        _logger = logger;
    }

    private IReadOnlySet<string>? _incomingFields;
    private bool FieldPresent(string name) => _incomingFields == null ||
        _incomingFields.Any(field => field.Replace("_", "").Equals(name, StringComparison.OrdinalIgnoreCase));

    public ConflictResolution Resolve(string tableName, object existing, object incoming, string originNode, IReadOnlySet<string>? fields = null)
    {
        _incomingFields = fields;
        if (existing == null) throw new ArgumentNullException(nameof(existing));
        if (incoming == null) throw new ArgumentNullException(nameof(incoming));
        if (string.IsNullOrWhiteSpace(originNode))
            throw new ArgumentNullException(nameof(originNode));

        // Rule 1: Shore-authoritative tables — Shore ALWAYS wins.
        // certificate, country, rank and their mapping tables are managed exclusively on Shore.
        // Any update pushed by an Edge node must be rejected to prevent edge's stale data
        // from overwriting shore edits (e.g. certificate rename/delete).
        if (_shoreAuthoritative.Contains(tableName))
        {
            if (originNode != "SHORE")
            {
                return ConflictResolution.Reject(
                    $"Shore-authoritative table '{tableName}': edge update rejected. Shore always wins.");
            }
            return ConflictResolution.Apply(incoming);
        }

        // Rule 1.5: VOYAGE DOMAIN — Field-level conflict resolution
        if (_voyageDomainTables.Contains(tableName))
        {
            return ResolveVoyageConflict(tableName, existing, incoming, originNode);
        }

        // Rule 5: Edge-authoritative tables — always accept from edge
        if (_edgeAuthoritative.Contains(tableName))
        {
            return ConflictResolution.Apply(incoming);
        }

        // Rule 2-3: CrewMember / CrewCertificate — field-level conflict resolution
        if (tableName == "crew_member")
        {
            return ResolveCrewMemberConflict(existing, incoming, originNode);
        }

        if (tableName == "crew_certificate")
        {
            return ResolveCrewCertificateConflict(existing, incoming, originNode);
        }

        // Sổ thuyền viên — sở hữu theo từng trường, danh sách nằm trong chính model
        if (tableName == "crew_logbook_entry")
        {
            return ResolveCrewLogbookConflict(existing, incoming, originNode);
        }

        // Rule 4: Documents — Shore wins metadata, Edge wins file path
        if (tableName.EndsWith("_document"))
        {
            return ResolveDocumentConflict(existing, incoming, originNode);
        }

        // Fallback: Last-Write-Wins using UpdatedAt
        return ResolveByTimestamp(existing, incoming);
    }

    // ============================================================
    // FIELD-LEVEL CONFLICT RESOLUTION
    // ============================================================

    private ConflictResolution ResolveCrewMemberConflict(object existing, object incoming, string originNode)
    {
        // Merge fields: Shore-authoritative fields from shore, Edge-authoritative from edge.
        // For shore-authoritative fields coming from edge: allow if edge record is NEWER
        // (edge user edited it more recently than any shore modification).
        var existingType = existing.GetType();
        var properties = existingType.GetProperties();

        // Compare timestamps to determine which side made the most recent change
        var existingUpdated = GetUpdatedAt(existing);
        var incomingUpdated = GetUpdatedAt(incoming);
        bool incomingIsNewer = !existingUpdated.HasValue
                               || !incomingUpdated.HasValue
                               || incomingUpdated.Value > existingUpdated.Value;

        _logger.LogInformation(
            "CrewMember conflict resolution: origin={Origin}, existingUpdated={ExistingUpdated}, incomingUpdated={IncomingUpdated}, incomingIsNewer={IsNewer}",
            originNode, existingUpdated, incomingUpdated, incomingIsNewer);

        foreach (var prop in properties)
        {
            if (prop.GetSetMethod() == null) continue; // Skip read-only
            if (!IsCopyableScalar(prop) || !FieldPresent(prop.Name)) continue;     // Never touch navigation properties

            // Skip primary key - EF Core does not allow modifying key properties
            if (prop.Name == "Id") continue;

            // Never let incoming payload overwrite EdgeChanges/EdgeChangesViewed.
            // These are computed server-side in SyncInboxService from actual diffs.
            // Allowing the resolver to copy them from the payload causes stale
            // EdgeChanges (e.g. old Weight diff) to re-appear on subsequent syncs.
            if (prop.Name is "EdgeChanges" or "EdgeChangesViewed") continue;

            var existingValue = prop.GetValue(existing);
            var incomingValue = prop.GetValue(incoming);
            
            // Skip null or empty string — empty string means the field was not set
            // (often happens when snake_case payload can't be mapped to PascalCase properties)
            if (incomingValue == null && _incomingFields == null) continue;
            if (incomingValue is string s && s.Length == 0 && _incomingFields == null) continue;

            bool shouldApply;

            if (originNode == "SHORE")
            {
                // Shore pushing → apply shore-authoritative fields, skip edge-authoritative
                shouldApply = !_edgeAuthoritativeCrewProps.Contains(prop.Name);
            }
            else
            {
                // Edge pushing:
                // • Edge-authoritative fields (IsOnboard, EmbarkDate…) → always apply
                // • Shore-authoritative fields (FullName, DOB…) → apply only if edge is newer
                // • All other fields → always apply from edge
                if (_edgeAuthoritativeCrewProps.Contains(prop.Name))
                    shouldApply = true;
                else if (_shoreAuthoritativeCrewProps.Contains(prop.Name))
                    shouldApply = incomingIsNewer; // Edge wins when it has the latest edit
                else
                    shouldApply = true;
            }

            // Log FullName specifically since that's what user reported as lost
            if (prop.Name == "FullName" && existingValue?.ToString() != incomingValue?.ToString())
            {
                _logger.LogInformation(
                    "CrewMember FullName change: '{ExistingValue}' → '{IncomingValue}', shouldApply={ShouldApply}",
                    existingValue, incomingValue, shouldApply);
            }

            if (shouldApply)
            {
                try
                {
                    prop.SetValue(existing, incomingValue);
                }
                catch (Exception ex)
                {
                    _logger.LogDebug("Skipping crew field {Prop}: {Error}", prop.Name, ex.Message);
                }
            }
        }

        return ConflictResolution.Apply(existing);
    }

    private ConflictResolution ResolveCrewCertificateConflict(object existing, object incoming, string originNode)
    {
        // Mirrors ResolveCrewMemberConflict so certificates sync both ways like crew data does.
        // Previously the official metadata was dropped outright when it came from a ship, so an
        // edit made on board was discarded while still being logged SUCCESS — the crew saw the
        // change stick locally and it silently never reached shore.
        //
        // There is deliberately NO "shore wins unless edge is newer" tier here:
        //  1. crew_member reserves only SocialInsuranceNumber/TaxIdNumber for shore; every field
        //     a user actually edits applies straight from edge. Certificates have no comparable
        //     admin-only field, so the equivalent reserved set is empty.
        //  2. Such a tier would have to compare UpdatedAt, which is not an edit clock:
        //     UpdateSyncMetadata stamps UpdatedAt = UtcNow on EVERY sync apply, so shore's value
        //     advances on each round trip — including on the very apply that rejected the edit —
        //     and an edge edit could never win it back.
        var edgeOwnedFields = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "DocumentFilePath", "FilePath", "Remarks", "FileUrl"
        };

        var existingType = existing.GetType();
        foreach (var prop in existingType.GetProperties())
        {
            if (prop.GetSetMethod() == null) continue;
            if (!IsCopyableScalar(prop) || !FieldPresent(prop.Name)) continue;     // Never touch navigation properties

            // Skip primary key — EF Core does not allow modifying key properties
            if (prop.Name == "Id") continue;

            var incomingValue = prop.GetValue(incoming);
            // Skip null and empty string: a delta payload that omits a field deserializes to
            // the model default, and applying that would blank out real shore data.
            if (incomingValue == null && _incomingFields == null) continue;
            if (incomingValue is string s && s.Length == 0 && _incomingFields == null) continue;

            // Shore pushing → apply everything except the file paths the ship owns.
            // Edge pushing → apply everything.
            var shouldApply = originNode != "SHORE" || !edgeOwnedFields.Contains(prop.Name);

            if (shouldApply)
            {
                try
                {
                    prop.SetValue(existing, incomingValue);
                }
                catch (Exception ex)
                {
                    _logger.LogDebug("Skipping certificate field {Prop}: {Error}", prop.Name, ex.Message);
                }
            }
        }

        return ConflictResolution.Apply(existing);
    }

    /// <summary>
    /// Sổ thuyền viên. Không dùng so sánh UpdatedAt như các bảng khác: UpdateSyncMetadata đóng dấu
    /// UpdatedAt = UtcNow trên MỌI lần đồng bộ, nên bên nào vừa được sync chạm vào sẽ luôn "mới hơn"
    /// và bên kia vĩnh viễn không thắng nổi. Ở đây chia theo THẨM QUYỀN, không theo thời điểm.
    /// </summary>
    private ConflictResolution ResolveCrewLogbookConflict(object existing, object incoming, string originNode)
    {
        var fromShore = originNode == "SHORE";
        var existingType = existing.GetType();

        foreach (var prop in existingType.GetProperties())
        {
            if (prop.GetSetMethod() == null) continue;
            if (!IsCopyableScalar(prop) || !FieldPresent(prop.Name)) continue;     // Never touch navigation properties
            if (prop.Name == "Id") continue;

            var incomingValue = prop.GetValue(incoming);
            if (incomingValue == null && _incomingFields == null) continue;
            if (incomingValue is string s && s.Length == 0 && _incomingFields == null) continue;

            // Trạng thái duyệt: mỗi bên chỉ được đặt những giá trị thuộc thẩm quyền của mình,
            // nếu không một lần đồng bộ ngược có thể tự ý "duyệt" hoặc "rút lại duyệt".
            if (prop.Name == nameof(CrewLogbookEntry.RecordStatus))
            {
                var status = incomingValue as string;
                if (status != null)
                {
                    var allowed = fromShore
                        ? !CrewLogbookEntry.EdgeOnlyStatuses.Contains(status)
                        : !CrewLogbookEntry.ShoreOnlyStatuses.Contains(status);
                    if (!allowed)
                    {
                        _logger.LogWarning(
                            "CrewLogbook {Id}: bỏ qua RecordStatus '{Status}' từ {Origin} — không thuộc thẩm quyền",
                            prop.GetValue(existing), status, originNode);
                        continue;
                    }
                }
                prop.SetValue(existing, incomingValue);
                continue;
            }

            var shouldApply = fromShore
                ? !CrewLogbookEntry.EdgeOwnedFields.Contains(prop.Name)
                : !CrewLogbookEntry.ShoreOwnedFields.Contains(prop.Name);

            if (shouldApply)
            {
                try { prop.SetValue(existing, incomingValue); }
                catch (Exception ex) { _logger.LogDebug("Bỏ qua trường {Prop}: {Error}", prop.Name, ex.Message); }
            }
        }

        return ConflictResolution.Apply(existing);
    }

    private ConflictResolution ResolveDocumentConflict(object existing, object incoming, string originNode)
    {
        // CẢ HAI BÊN đều được sửa thông tin tài liệu, nên bên nào gửi lên thì lấy của bên đó.
        //
        // Trước đây nhóm metadata (DocumentType, DocumentNumber, IssueDate, ExpiryDate,
        // CountryId, Notes) được quy định là "bờ làm chủ" và mọi giá trị từ tàu đều bị bỏ.
        // Luật đó viết khi tàu CHỈ upload được ảnh scan, nên metadata từ tàu bị coi là tiếng
        // vọng cũ. Từ khi tàu có màn hình sửa tài liệu thật, giả định đó không còn đúng:
        // tàu sửa xong, đẩy lên, bờ im lặng vứt đi và người dùng không hề biết.
        //
        // Vẫn giữ hai nguyên tắc cũ: bỏ qua giá trị null/rỗng (không cho phép xoá trắng một
        // trường bằng cách gửi thiếu), và đường dẫn file thì tàu làm chủ — bờ không được ghi
        // đè vì ảnh được chụp/quét dưới tàu.
        var edgeOwnedFileFields = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
        {
            "DocumentFilePath", "FilePath", "FileUrl", "FileName"
        };

        var existingType = existing.GetType();
        foreach (var prop in existingType.GetProperties())
        {
            if (prop.GetSetMethod() == null) continue;
            if (!IsCopyableScalar(prop) || !FieldPresent(prop.Name)) continue;     // Never touch navigation properties
            if (prop.Name == "Id") continue;

            var incomingValue = prop.GetValue(incoming);
            if (incomingValue == null && _incomingFields == null) continue;
            if (incomingValue is string s && s.Length == 0 && _incomingFields == null) continue;

            // Bờ gửi xuống thì không được đụng vào đường dẫn file của tàu; ngoài ra áp tất cả.
            var shouldApply = originNode != "SHORE" || !edgeOwnedFileFields.Contains(prop.Name);

            if (shouldApply)
            {
                try { prop.SetValue(existing, incomingValue); }
                catch { /* skip incompatible types */ }
            }
        }

        return ConflictResolution.Apply(existing);
    }

    // ════════════════════════════════════════════════════════════
    // VOYAGE DOMAIN CONFLICT RESOLUTION (Phase 1)
    // ════════════════════════════════════════════════════════════
    // VoyageRecord: Field-level ownership (Edge controls status/actual, Shore controls planning)
    // VoyagePlanLeg: Hybrid - use Last-Write-Wins for planning fields
    // Other voyage tables: always from Edge (cargo ops, crew assignments, logs, financial actuals)
    // ════════════════════════════════════════════════════════════
    private ConflictResolution ResolveVoyageConflict(string tableName, object existing, object incoming, string originNode)
    {
        var existingUpdated = GetUpdatedAt(existing);
        var incomingUpdated = GetUpdatedAt(incoming);
        bool incomingIsNewer = !existingUpdated.HasValue || !incomingUpdated.HasValue || 
                               incomingUpdated.Value > existingUpdated.Value;

        _logger.LogInformation(
            "[VOYAGE-CONFLICT] table={Table}, origin={Origin}, existingUpdated={ExistingUpdated}, incomingUpdated={IncomingUpdated}, isNewer={IsNewer}",
            tableName, originNode, existingUpdated, incomingUpdated, incomingIsNewer);

        // Table-specific handling
        if (tableName == "voyage_record")
        {
            return ResolveVoyageRecordConflict(existing, incoming, originNode, incomingIsNewer);
        }

        if (tableName == "voyage_plan_leg")
        {
            return ResolveVoyagePlanLegConflict(existing, incoming, originNode, incomingIsNewer);
        }

        // All other voyage tables: Edge owns (cargo_operation, voyage_log_entry, voyage_crew_assignment, etc.)
        // Planning entities from Shore will be handled via separate Shore→Edge pull mechanism
        if (!string.Equals(originNode, "SHORE", StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogInformation("[VOYAGE-CONFLICT] {Table}: ACCEPT (Edge-owned)", tableName);
            return ConflictResolution.Apply(incoming);
        }

        // Shore will send planning entities on pull — for now, if Shore tries to push, reject
        return ConflictResolution.Reject($"Voyage table {tableName} from Shore during push not yet supported. Use Shore→Edge pull mechanism.");
    }

    private ConflictResolution ResolveVoyageRecordConflict(object existing, object incoming, string originNode, bool incomingIsNewer)
    {
        var existingType = existing.GetType();
        var properties = existingType.GetProperties();

        foreach (var prop in properties)
        {
            if (prop.GetSetMethod() == null) continue;
            if (!IsCopyableScalar(prop) || !FieldPresent(prop.Name)) continue;     // Never touch navigation properties
            if (prop.Name == "Id" || prop.Name == "CreatedAt" || prop.Name == "CancelledAt") continue;

            var existingValue = prop.GetValue(existing);
            var incomingValue = prop.GetValue(incoming);

            // Skip null/empty incoming
            if (_incomingFields == null && (incomingValue == null || (incomingValue is string s && s.Length == 0)))
                continue;

            bool shouldApply;

            if (originNode == "SHORE")
            {
                // Shore pushing → apply only Shore-owned fields (planning, estimates)
                shouldApply = _voyageShoreOwnedFields.Contains(prop.Name);
                _logger.LogInformation(
                    "[VOYAGE-RECORD] Field {Field} from SHORE: {ShouldApply} (owned={Owned})",
                   prop.Name, shouldApply, _voyageShoreOwnedFields.Contains(prop.Name));
            }
            else
            {
                // Edge pushing:
                // • Edge-owned fields (Status, timing…) → always apply
                // • Shore-owned fields (PlannedDistance, estimates…) → skip (preserve Shore's plan)
                // • Other fields → always apply
                if (_voyageEdgeOwnedFields.Contains(prop.Name))
                {
                    shouldApply = true;
                }
                else if (_voyageShoreOwnedFields.Contains(prop.Name))
                {
                    shouldApply = false; // Keep Shore's planning data
                }
                else
                {
                    shouldApply = true; // Default: accept from Edge
                }

                _logger.LogInformation(
                    "[VOYAGE-RECORD] Field {Field} from EDGE: {ShouldApply} (edgeOwned={E}, shoreOwned={S})",
                    prop.Name, shouldApply, 
                    _voyageEdgeOwnedFields.Contains(prop.Name),
                    _voyageShoreOwnedFields.Contains(prop.Name));
            }

            if (shouldApply)
            {
                try
                {
                    if (existingValue?.ToString() != incomingValue?.ToString())
                    {
                        _logger.LogInformation(
                            "[VOYAGE-RECORD] Applied field {Field}: {Old} → {New}",
                            prop.Name, existingValue, incomingValue);
                    }
                    prop.SetValue(existing, incomingValue);
                }
                catch (Exception ex)
                {
                    _logger.LogDebug("[VOYAGE-RECORD] Skipping field {Field}: {Error}", prop.Name, ex.Message);
                }
            }
        }

        return ConflictResolution.Apply(existing);
    }

    private ConflictResolution ResolveVoyagePlanLegConflict(object existing, object incoming, string originNode, bool incomingIsNewer)
    {
        // VoyagePlanLeg: Last-Write-Wins for planning fields (can come from either Edge or Shore)
        var existingType = existing.GetType();
        var properties = existingType.GetProperties();

        foreach (var prop in properties)
        {
            if (prop.GetSetMethod() == null) continue;
            if (!IsCopyableScalar(prop) || !FieldPresent(prop.Name)) continue;     // Never touch navigation properties
            if (prop.Name == "Id" || prop.Name == "VoyageId") continue;

            var incomingValue = prop.GetValue(incoming);
            if (_incomingFields == null && (incomingValue == null || (incomingValue is string s && s.Length == 0)))
                continue;

            // For hybrid fields (planning dates, distances, fuel), use LWW
            if (_voyagePlanLegHybridFields.Contains(prop.Name))
            {
                if (incomingIsNewer)
                {
                    _logger.LogInformation(
                        "[VOYAGE-PLANLEG] Field {Field}: LWW applied (newer win), origin={Origin}",
                        prop.Name, originNode);
                    prop.SetValue(existing, incomingValue);
                }
                continue;
            }

            // Other fields: Edge is owner (Sequence, LegType, CargoActivity, Notes)
            if (!string.Equals(originNode, "SHORE", StringComparison.OrdinalIgnoreCase))
            {
                try
                {
                    prop.SetValue(existing, incomingValue);
                }
                catch { /* ignore */ }
            }
        }

        return ConflictResolution.Apply(existing);
    }


    private ConflictResolution ResolveByTimestamp(object existing, object incoming)
    {
        var existingUpdated = GetUpdatedAt(existing);
        var incomingUpdated = GetUpdatedAt(incoming);

        if (incomingUpdated.HasValue && existingUpdated.HasValue && 
            incomingUpdated.Value <= existingUpdated.Value)
        {
            return ConflictResolution.Reject(
                $"Incoming timestamp ({incomingUpdated:O}) is older than existing ({existingUpdated:O})");
        }

        return ConflictResolution.Apply(incoming);
    }

    /// <summary>
    /// True when a property holds a plain value that is safe to copy between entity instances.
    ///
    /// Navigation properties must NEVER be copied. An entity deserialised from a sync payload
    /// has them at their initialiser value — an EMPTY List&lt;&gt; — because they are [JsonIgnore]d
    /// and stripped from payloads. Assigning that empty list over a tracked entity's LOADED
    /// collection makes EF treat the real children as orphans, and the crew relationships are
    /// configured OnDelete(Cascade), so EF deletes them.
    ///
    /// This is exactly how 8 crew certificates were destroyed on shore: a batch processed
    /// crew_certificate items first (loading them into the change tracker), then crew_member
    /// items whose resolver blanked CrewMember.Certificates. Certificates processed AFTER the
    /// crew_member items in the same batch survived, which is what pinned down the cause.
    /// </summary>
    private static bool IsCopyableScalar(PropertyInfo prop)
    {
        var type = prop.PropertyType;
        if (type == typeof(string)) return true;
        // Covers int, long, bool, DateTime, Guid, enums and their Nullable<> forms
        if (type.IsValueType) return true;
        // Collections and entity references — owned by EF's relationship fixup, never by us
        return false;
    }

    private static DateTime? GetUpdatedAt(object entity)
    {
        if (entity is ISyncableEntity syncable)
            return syncable.UpdatedAt;
        
        var prop = entity.GetType().GetProperty("UpdatedAt");
        return prop?.GetValue(entity) as DateTime?;
    }
}
