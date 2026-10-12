using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using ProductApi.Models;
using Maritime.Shared.DTOs.Sync;
using Maritime.Shared.Models.Sync;
using System.Security.Cryptography;
using System.Text.Json;

namespace ProductApi.Services.Sync;

/// <summary>
/// Interface for managing Shore → Edge outbox.
/// Queues shore-side changes for edge nodes to pull.
/// </summary>
public interface ISyncOutboxService
{
    /// <summary>Enqueue a change to be delivered to edge node(s).</summary>
    Task EnqueueAsync(string targetNode, string tableName, string recordKey,
        SyncActionType action, object payload);

    /// <summary>Broadcast a change to all edge nodes. KHÔNG dùng cho dữ liệu thuyền viên (SyncOutboxService.CrewScopedTables).</summary>
    Task BroadcastAsync(string tableName, string recordKey, SyncActionType action, object payload);

    /// <summary>
    /// Gửi tới đúng con tàu <paramref name="vesselId"/>. Không thuộc tàu nào (null) thì không gửi:
    /// thuyền viên ở danh bạ chung trên bờ không có mặt ở tàu nào.
    /// </summary>
    Task EnqueueForVesselAsync(Guid? vesselId, string tableName, string recordKey, SyncActionType action, object payload);

    /// <summary>Gửi dữ liệu của một thuyền viên tới con tàu người đó ĐANG thuộc (crew_members.VesselId).</summary>
    Task EnqueueForCrewAsync(Guid crewMemberId, string tableName, string recordKey, SyncActionType action, object payload);

    /// <summary>Enqueue multiple items in a single batch (single SaveChanges).</summary>
    Task EnqueueBatchAsync(string targetNode, List<(string TableName, string RecordKey, SyncActionType Action, object Payload)> items);

    /// <summary>Get pending items for an edge node (cursor-based pagination).</summary>
    Task<SyncPullResponse> GetPendingItemsAsync(string nodeId, DateTime? since, string? cursor, int pageSize, NetworkType network = NetworkType.Shore_WiFi, int maxBytes = 262144);

    /// <summary>Mark items as delivered after edge acknowledges receipt.</summary>
    Task AcknowledgeDeliveryAsync(string nodeId, List<long> itemIds);
}

/// <summary>
/// Manages the Shore → Edge sync outbox.
/// When shore data changes (certificate renewal, crew assignment, master data update),
/// those changes are queued in SyncOutbox for edge nodes to pull.
/// </summary>
public class SyncOutboxService : ISyncOutboxService
{
    /// <summary>
    /// Dữ liệu gắn với một thuyền viên. Mỗi tàu chỉ được nhận thuyền viên của chính nó, nên các bảng này
    /// luôn gửi đích danh một tàu — không bao giờ phát "*" cho cả đội tàu, kể cả gói "*" cũ còn trong hàng đợi.
    /// </summary>
    private static readonly string[] CrewScopedTableList =
    [
        "crew_member", "crew_certificate", "crew_logbook_entry", "crew_assignment", "service_record",
        "crew_member_document", CrewRosterTable
    ];

    /// <summary>
    /// Danh sách thuyền viên của MỘT tàu (payload: crewIds). Tàu nhận sẽ gỡ những thuyền viên đến từ bờ
    /// nhưng không còn trong danh sách — "đưa về bờ" dữ liệu bị gửi nhầm hoặc đã chuyển tàu.
    /// </summary>
    public const string CrewRosterTable = "crew_roster";

    /// <summary>Khoá đóng dấu IMO tàu đích trong payload dữ liệu thuyền viên — tàu đối chiếu và từ chối gói không phải của mình.</summary>
    public const string TargetVesselImoField = "targetVesselImo";

    public static readonly HashSet<string> CrewScopedTables = new(CrewScopedTableList, StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Danh mục dùng chung của công ty — bảng DUY NHẤT được gửi cho mọi tàu ("*"). Mọi bảng khác là dữ liệu
    /// riêng của một tàu (thuyền viên, chuyến đi, thông số/vật tư/thiết bị của tàu…): phải gửi đích danh và
    /// đóng dấu IMO tàu đích để tàu từ chối gói không phải của mình.
    /// </summary>
    internal static readonly string[] SharedCatalogTableList =
    [
        "certificate", "country", "rank", "rank_certificate", "country_certificate", "port",
        "material_category", "material_item_catalog", "report_type",
        "ism_element", "ism_elements", "sms_procedure", "sms_procedures", "sms_form_template", "sms_form_templates",
        ShoreSyncPushService.CatalogRosterTable
    ];

    public static readonly HashSet<string> SharedCatalogTables = new(SharedCatalogTableList, StringComparer.OrdinalIgnoreCase);

    private readonly AppDbContext _context;
    private readonly ILogger<SyncOutboxService> _logger;
    private readonly ISyncFileStorageService _syncFileStorageService;
    private readonly IConfiguration? _configuration;
    private static readonly HashSet<string> _fileTableNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "crew_member", "crew_certificate", "crew_member_document", "sms_procedure", "sms_procedures", "sms_filled_record", "sms_filled_records"
    };

    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
        ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles
    };

    public SyncOutboxService(AppDbContext context, ILogger<SyncOutboxService> logger, ISyncFileStorageService syncFileStorageService, IConfiguration? configuration = null)
    {
        _context = context;
        _logger = logger;
        _syncFileStorageService = syncFileStorageService;
        _configuration = configuration;
    }

    public async Task EnqueueAsync(string targetNode, string tableName, string recordKey,
        SyncActionType action, object payload)
    {
        if (string.IsNullOrWhiteSpace(targetNode))
            throw new ArgumentNullException(nameof(targetNode));
        if (string.IsNullOrWhiteSpace(tableName))
            throw new ArgumentNullException(nameof(tableName));
        if (string.IsNullOrWhiteSpace(recordKey))
            throw new ArgumentNullException(nameof(recordKey));

        try
        {
            targetNode = await VesselSyncIdentity.CanonicalTargetAsync(_context, targetNode);
            var prepared = await PrepareOutgoingAsync(tableName, recordKey, action, payload);
            action = prepared.Action;
            var serializedPayload = await StampTargetVesselAsync(tableName, targetNode, prepared.Payload);

            // Only identical pending snapshots can be coalesced. Exposed events are immutable.
            if (await _context.SyncOutbox.AnyAsync(o => o.DeliveredAt == null &&
                (o.TargetNode == targetNode || o.TargetNode == "*") && o.TableName == tableName && o.RecordKey == recordKey &&
                o.ActionType == action && o.Payload == serializedPayload)) return;

            var outboxItem = new SyncOutbox
            {
                TargetNode = targetNode,
                TableName = tableName,
                RecordKey = recordKey,
                ActionType = action,
                Payload = serializedPayload,
                SyncVersion = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                CreatedAt = DateTime.UtcNow
            };

            await _context.SyncOutbox.AddAsync(outboxItem);
            await _context.SaveChangesAsync();

            _logger.LogDebug("Enqueued outbox: {Table}/{Key} → {Node}", tableName, recordKey, targetNode);
        }
        catch (JsonException ex)
        {
            _logger.LogError(ex, "Failed to serialize payload for {Table}/{Key}", tableName, recordKey);
            throw new InvalidOperationException($"Failed to serialize sync payload for {tableName}/{recordKey}", ex);
        }
        catch (DbUpdateException ex)
        {
            _logger.LogError(ex, "Database error enqueuing outbox item {Table}/{Key} → {Node}", tableName, recordKey, targetNode);
            throw;
        }
    }

    public async Task BroadcastAsync(string tableName, string recordKey,
        SyncActionType action, object payload)
    {
        if (CrewScopedTables.Contains(tableName))
            throw new InvalidOperationException(
                $"{tableName} là dữ liệu thuyền viên, phải gửi đúng tàu (EnqueueForCrewAsync / EnqueueForVesselAsync), không phát cho mọi tàu.");
        await EnqueueAsync("*", tableName, recordKey, action, payload);
    }

    public async Task EnqueueForVesselAsync(Guid? vesselId, string tableName, string recordKey,
        SyncActionType action, object payload)
    {
        if (!vesselId.HasValue)
        {
            _logger.LogDebug("Bỏ qua {Table}/{Key}: không thuộc tàu nào", tableName, recordKey);
            return;
        }
        var imo = await _context.Vessels.AsNoTracking().Where(v => v.Id == vesselId.Value).Select(v => v.IMO).SingleOrDefaultAsync();
        if (string.IsNullOrWhiteSpace(imo))
        {
            _logger.LogWarning("Bỏ qua {Table}/{Key}: tàu {VesselId} không tồn tại hoặc chưa có IMO", tableName, recordKey, vesselId);
            return;
        }
        await EnqueueAsync(imo, tableName, recordKey, action, payload);
    }

    public async Task EnqueueForCrewAsync(Guid crewMemberId, string tableName, string recordKey,
        SyncActionType action, object payload)
    {
        var vesselId = await _context.CrewMembers.AsNoTracking()
            .Where(c => c.Id == crewMemberId).Select(c => c.VesselId).SingleOrDefaultAsync();
        await EnqueueForVesselAsync(vesselId, tableName, recordKey, action, payload);
    }

    public async Task EnqueueBatchAsync(string targetNode, List<(string TableName, string RecordKey, SyncActionType Action, object Payload)> items)
    {
        if (string.IsNullOrWhiteSpace(targetNode))
            throw new ArgumentNullException(nameof(targetNode));
        if (items == null || items.Count == 0) return;

        targetNode = await VesselSyncIdentity.CanonicalTargetAsync(_context, targetNode);
        var now = DateTime.UtcNow;
        var version = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        foreach (var item in items)
        {
            var prepared = await PrepareOutgoingAsync(item.TableName, item.RecordKey, item.Action, item.Payload);
            var serializedPayload = await StampTargetVesselAsync(item.TableName, targetNode, prepared.Payload);
            var outboxItem = new SyncOutbox
            {
                TargetNode = targetNode,
                TableName = item.TableName,
                RecordKey = item.RecordKey,
                ActionType = prepared.Action,
                Payload = serializedPayload,
                SyncVersion = version++,
                CreatedAt = now
            };
            await _context.SyncOutbox.AddAsync(outboxItem);
        }

        await _context.SaveChangesAsync();
        _logger.LogDebug("Batch enqueued {Count} outbox items → {Node}", items.Count, targetNode);
    }

    /// <summary>
    /// Dữ liệu thuyền viên: ghi IMO của tàu đích vào payload. Không xác định được tàu đích thì không gửi —
    /// thà không gửi còn hơn gửi nhầm tàu.
    /// </summary>
    private async Task<string> StampTargetVesselAsync(string tableName, string targetNode, string payload)
    {
        if (SharedCatalogTables.Contains(tableName)) return payload;
        var imo = await TargetImoAsync(targetNode)
            ?? throw new InvalidOperationException($"Không xác định được tàu đích cho {tableName} (đích {targetNode}); dữ liệu riêng của tàu phải gửi đúng một tàu.");
        if (System.Text.Json.Nodes.JsonNode.Parse(payload) is not System.Text.Json.Nodes.JsonObject json) return payload;
        json[TargetVesselImoField] = imo;
        return json.ToJsonString();
    }

    private async Task<string?> TargetImoAsync(string targetNode)
    {
        Guid? vesselId = null;
        if (targetNode.StartsWith("vessel:", StringComparison.Ordinal) && Guid.TryParse(targetNode[7..], out var pending)) vesselId = pending;
        vesselId ??= await _context.SyncNodeTrackers.AsNoTracking().Where(n => n.NodeId == targetNode).Select(n => n.VesselId).FirstOrDefaultAsync();
        if (vesselId.HasValue)
            return await _context.Vessels.AsNoTracking().Where(v => v.Id == vesselId.Value).Select(v => v.IMO).FirstOrDefaultAsync();
        // Đích là IMO (tàu chưa có node đăng ký): chỉ nhận nếu đúng là IMO của một tàu.
        return await _context.Vessels.AsNoTracking().Where(v => v.IMO == targetNode).Select(v => v.IMO).FirstOrDefaultAsync();
    }

    private async Task<(SyncActionType Action, string Payload)> PrepareOutgoingAsync(string table, string recordKey, SyncActionType action, object payload)
    {
        if (action != SyncActionType.UPDATE) return (action, JsonSerializer.Serialize(payload, _jsonOptions));
        var metadata = _context.Model.GetEntityTypes().FirstOrDefault(e =>
            System.Text.RegularExpressions.Regex.Replace(e.ClrType.Name, "([a-z0-9])([A-Z])", "$1_$2").ToLowerInvariant() == table);
        var key = metadata?.FindPrimaryKey()?.Properties.SingleOrDefault();
        if (metadata == null || key == null) return (action, JsonSerializer.Serialize(payload, _jsonOptions));
        object? entity = null;
        if (table == "crew_certificate" && !int.TryParse(recordKey, out _))
            entity = await _context.CrewCertificates.FirstOrDefaultAsync(c => c.CertificateNumber == recordKey);
        else
        {
            object parsed;
            try { parsed = key.ClrType == typeof(Guid) ? Guid.Parse(recordKey) : Convert.ChangeType(recordKey, key.ClrType, System.Globalization.CultureInfo.InvariantCulture); }
            catch (Exception ex) when (ex is FormatException or InvalidCastException or OverflowException)
            { return (action, JsonSerializer.Serialize(payload, _jsonOptions)); }
            entity = await _context.FindAsync(metadata.ClrType, parsed);
        }
        if (entity == null) throw new InvalidOperationException($"Cannot enqueue UPDATE for missing {table}/{recordKey}");
        return (SyncActionType.SNAPSHOT, JsonSerializer.Serialize(_context.Entry(entity).Properties.ToDictionary(p => p.Metadata.Name, p => p.CurrentValue)));
    }

    public async Task<SyncPullResponse> GetPendingItemsAsync(
        string nodeId, DateTime? since, string? cursor, int pageSize, NetworkType network = NetworkType.Shore_WiFi, int maxBytes = 262144)
    {
        if (string.IsNullOrWhiteSpace(nodeId))
            throw new ArgumentNullException(nameof(nodeId));
        if (pageSize <= 0) pageSize = 50;
        if (pageSize > 1000) pageSize = 1000;

        try
        {
            // Parse cursor as outbox Id for cursor-based pagination
            long afterId = 0;
            if (!string.IsNullOrEmpty(cursor) && long.TryParse(cursor, out var parsedCursor))
                afterId = parsedCursor;

            await VesselSyncIdentity.BindPendingRoutesAsync(_context, nodeId);
            await EnsurePendingCrewReferencesAsync(nodeId);
            var query = _context.SyncOutbox
                .Where(o => (o.TargetNode != nodeId ? !_context.SyncOutboxDeliveries.Any(d => d.OutboxId == o.Id && d.NodeId == nodeId) : o.DeliveredAt == null))
                .Where(o => o.TargetNode == nodeId || (o.TargetNode == "*" && SharedCatalogTableList.Contains(o.TableName)))
                .Where(o => o.Id > afterId);

            if (since.HasValue)
                query = query.Where(o => o.CreatedAt >= since.Value);

            var allowed = SyncLinkPolicy.Priorities(network);
            if (allowed.Length == 0) return new SyncPullResponse { ServerTime = DateTime.UtcNow };
            var streamId = await GetStreamIdAsync();
            var criticalTables = new[] { "safety_alarm", "engine_event", "alert" };
            var operationalTables = new[] { "crew_member", "crew_certificate", "crew_logbook_entry", "crew_member_document", CrewRosterTable, ShoreSyncPushService.CatalogRosterTable, "maritime_report", "report_type", "ship_data", "rank", "country", "certificate", "rank_certificate", "country_certificate", "port", "ism_element", "sms_procedure", "sms_procedures", "sms_form_template", "sms_form_templates" };
            if (!allowed.Contains(SyncPriority.Low))
                query = query.Where(o => criticalTables.Contains(o.TableName) || (allowed.Contains(SyncPriority.Operational) && operationalTables.Contains(o.TableName)));
            var items = await query
                .OrderBy(o => o.Id)
                .Take(pageSize + 1) // Fetch one extra to determine HasMore
                .ToListAsync();

            var hasMore = items.Count > pageSize;
            if (hasMore) items = items.Take(pageSize).ToList();

            maxBytes = Math.Clamp(maxBytes, 1024, SyncLinkPolicy.For(network).MetadataBytes);
            var bytes = 2;
            var withinBudget = new List<SyncOutbox>();
            foreach (var item in items)
            {
                var size = System.Text.Encoding.UTF8.GetByteCount(item.Payload) + 512;
                if (bytes + size > maxBytes) { hasMore = true; continue; }
                bytes += size;
                withinBudget.Add(item);
            }
            items = withinBudget;
            var response = new SyncPullResponse
            {
                Items = items.Select(o => new SyncQueueItemDto
                {
                    OutboxId = o.Id,
                    StreamId = streamId,
                    Priority = SyncLinkPolicy.TablePriority(o.TableName),
                    TableName = o.TableName,
                    RecordKey = o.RecordKey,
                    ActionType = o.ActionType.ToString(),
                    Payload = o.Payload,
                    OriginNode = "SHORE",
                    SyncVersion = o.Id,
                    Timestamp = o.CreatedAt
                }).ToList(),
                ServerTime = DateTime.UtcNow,
                NextCursor = items.LastOrDefault()?.Id.ToString(),
                HasMore = hasMore
            };

            // Attach metadata-only file references for document-related items.
            var unavailable = new List<SyncQueueItemDto>();
            foreach (var dto in response.Items)
            {
                try
                {
                    dto.FileRefs = await BuildOutgoingFileReferencesAsync(dto, "SHORE", nodeId);
                    dto.Payload = StripFileReferenceProperties(dto.Payload);
                    await TranslateVesselKeysAsync(dto, nodeId);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to build file refs for pull item {Table}/{Key}", dto.TableName, dto.RecordKey);
                    unavailable.Add(dto);
                    response.HasMore = true;
                }
            }

            response.Items.RemoveAll(unavailable.Contains);
            var packed = new List<SyncQueueItemDto>();
            foreach (var dto in response.Items)
            {
                packed.Add(dto);
                if (System.Text.Encoding.UTF8.GetByteCount(JsonSerializer.Serialize(packed, _jsonOptions)) <= maxBytes - 256) continue;
                packed.RemoveAt(packed.Count - 1);
                response.HasMore = true;
                continue;
            }
            response.Items = packed;
            response.NextCursor = packed.LastOrDefault()?.OutboxId.ToString();
            _logger.LogDebug("Pull response for {NodeId}: {Count} items, hasMore={HasMore}",
                nodeId, response.Items.Count, hasMore);

            return response;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching pending items for node {NodeId}", nodeId);
            throw;
        }
    }

    private async Task TranslateVesselKeysAsync(SyncQueueItemDto item, string nodeId)
    {
        var type = SyncInboxService.EntityTypeFor(item.TableName);
        var metadata = type == null ? null : _context.Model.FindEntityType(type);
        if (metadata == null) return;
        var payload = string.IsNullOrWhiteSpace(item.Payload) ? null : System.Text.Json.Nodes.JsonNode.Parse(item.Payload) as System.Text.Json.Nodes.JsonObject;
        var properties = payload?.Select(pair => pair.Key).ToDictionary(key => key.Replace("_", "").ToLowerInvariant(), key => key);
        var key = metadata.FindPrimaryKey()?.Properties.SingleOrDefault();
        var own = await _context.SyncRecordIdentities.AsNoTracking().SingleOrDefaultAsync(mapping =>
            mapping.OriginNode == nodeId && mapping.TableName == item.TableName && mapping.ShoreKey == item.RecordKey);
        if (own != null)
        {
            item.RecordKey = own.LocalKey;
            if (key != null && properties?.TryGetValue(key.Name.Replace("_", "").ToLowerInvariant(), out var name) == true)
                payload![name] = JsonSerializer.SerializeToNode(ParseKey(own.LocalKey, key.ClrType));
        }
        if (payload == null || properties == null) return;
        foreach (var foreignKey in metadata.GetForeignKeys().Where(fk => fk.Properties.Count == 1))
        {
            var property = foreignKey.Properties[0];
            if (!properties.TryGetValue(property.Name.Replace("_", "").ToLowerInvariant(), out var name) || payload[name] == null) continue;
            var principalTable = SyncInboxService.TableForEntity(foreignKey.PrincipalEntityType.ClrType);
            var shoreKey = payload[name]!.ToString();
            var mapping = await _context.SyncRecordIdentities.AsNoTracking().SingleOrDefaultAsync(identity =>
                identity.OriginNode == nodeId && identity.TableName == principalTable && identity.ShoreKey == shoreKey);
            if (mapping != null) payload[name] = JsonSerializer.SerializeToNode(ParseKey(mapping.LocalKey, property.ClrType));
        }
        item.Payload = payload.ToJsonString();
    }

    private static object ParseKey(string key, Type type)
    {
        type = Nullable.GetUnderlyingType(type) ?? type;
        return type == typeof(Guid) ? Guid.Parse(key) : Convert.ChangeType(key, type, System.Globalization.CultureInfo.InvariantCulture);
    }

    private async Task<Guid> GetStreamIdAsync()
    {
        if (Guid.TryParse(_configuration?["Sync:StreamId"], out var configured) && configured != Guid.Empty) return configured;
        var states = _context.Set<SyncStreamState>();
        var state = await states.AsNoTracking().SingleOrDefaultAsync(s => s.Key == "outbox");
        if (state != null) return state.Epoch;
        var epoch = Guid.NewGuid();
        if (_context.Database.IsRelational())
        {
            await _context.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO sync_stream_state (\"Key\", \"Epoch\") VALUES ({"outbox"}, {epoch}) ON CONFLICT (\"Key\") DO NOTHING");
            return (await states.AsNoTracking().SingleAsync(s => s.Key == "outbox")).Epoch;
        }
        states.Add(new SyncStreamState { Key = "outbox", Epoch = epoch });
        await _context.SaveChangesAsync();
        return epoch;
    }

    private async Task EnsurePendingCrewReferencesAsync(string nodeId)
    {
        var payloads = await _context.SyncOutbox.AsNoTracking()
            .Where(o => o.DeliveredAt == null && o.TableName == "crew_member" &&
                (o.TargetNode == nodeId || o.TargetNode == "*"))
            .Select(o => o.Payload).Take(1000).ToListAsync();
        var rankIds = new HashSet<int>(); var countryIds = new HashSet<int>();
        foreach (var payload in payloads)
        {
            try {
                using var json = JsonDocument.Parse(payload);
                if (json.RootElement.ValueKind != JsonValueKind.Object) continue;
                foreach (var property in json.RootElement.EnumerateObject())
                {
                    if (!int.TryParse(property.Value.ToString(), out var id)) continue;
                    if (property.Name.Equals("RankId", StringComparison.OrdinalIgnoreCase)) rankIds.Add(id);
                    if (property.Name.Equals("CountryId", StringComparison.OrdinalIgnoreCase)) countryIds.Add(id);
                }
            } catch (JsonException) { /* The malformed crew item is handled separately by the receiver. */ }
        }
        foreach (var rank in await _context.Ranks.AsNoTracking().Where(r => rankIds.Contains(r.Id)).ToListAsync())
            if (!await _context.SyncOutbox.AnyAsync(o => o.TargetNode == nodeId && o.TableName == "rank" && o.RecordKey == rank.Id.ToString()))
                await EnqueueAsync(nodeId, "rank", rank.Id.ToString(), SyncActionType.SNAPSHOT, rank);
        foreach (var country in await _context.Countries.AsNoTracking().Where(c => countryIds.Contains(c.Id)).ToListAsync())
            if (!await _context.SyncOutbox.AnyAsync(o => o.TargetNode == nodeId && o.TableName == "country" && o.RecordKey == country.Id.ToString()))
                await EnqueueAsync(nodeId, "country", country.Id.ToString(), SyncActionType.SNAPSHOT, country);
    }

    private async Task<List<SyncFileReferenceDto>> BuildOutgoingFileReferencesAsync(SyncQueueItemDto dto, string sourceNodeId, string receiverNodeId)
    {
        var refs = new List<SyncFileReferenceDto>();

        if (!_fileTableNames.Contains(dto.TableName))
            return refs;

        foreach (var (role, filePath) in ExtractSyncFilePaths(dto.Payload))
        {
            if (!_syncFileStorageService.Exists(filePath))
            {
                throw new FileNotFoundException($"Sync attachment missing for {dto.TableName}/{dto.RecordKey}", filePath);
            }

            var absPath = _syncFileStorageService.ResolveLocalPath(filePath);
            var fileInfo = new FileInfo(absPath);
            var checksum = await _syncFileStorageService.ComputeSha256HexAsync(filePath, CancellationToken.None);
            refs.Add(new SyncFileReferenceDto
            {
                FileId = CreateDeterministicFileId(sourceNodeId + ":" + receiverNodeId, dto.TableName, dto.RecordKey, role, checksum),
                FileRole = role,
                FileName = Path.GetFileName(filePath),
                ContentType = GuessContentType(filePath),
                SizeBytes = _syncFileStorageService.GetFileSize(filePath),
                Sha256 = checksum,
                SourcePath = filePath,
                CapturedAtUtc = fileInfo.LastWriteTimeUtc,
                TransferPriority = GetFileTransferPriority(dto.TableName)
            });
        }

        foreach (var file in refs)
        {
            if (await _context.SyncFileManifests.AnyAsync(manifest => manifest.Id == file.FileId)) continue;
            _context.SyncFileManifests.Add(new SyncFileManifest
            {
                Id = file.FileId, OwnerNodeId = sourceNodeId, ReceiverNodeId = receiverNodeId,
                TableName = dto.TableName, RecordKey = dto.RecordKey, FileRole = file.FileRole,
                FileName = file.FileName, ContentType = file.ContentType, SizeBytes = file.SizeBytes,
                Sha256 = file.Sha256, SourcePath = file.SourcePath, TransferPriority = file.TransferPriority,
                CreatedAt = DateTime.UtcNow, UpdatedAt = DateTime.UtcNow
            });
        }
        if (refs.Count > 0) await _context.SaveChangesAsync();
        return refs;
    }

    private static List<(string Role, string FilePath)> ExtractSyncFilePaths(string payload)
    {
        var refs = new List<(string Role, string FilePath)>();
        using var doc = JsonDocument.Parse(payload);
        foreach (var (propName, role) in new[]
        {
            ("documentFilePath", "attachment"),
            ("DocumentFilePath", "attachment"),
            ("filePath", "attachment"),
            ("FilePath", "attachment"),
            ("fileUrl", "attachment"),
            ("FileUrl", "attachment"),
            ("photoUrl", "avatar"),
            ("PhotoUrl", "avatar")
        })
        {
            if (doc.RootElement.TryGetProperty(propName, out var val))
            {
                var filePath = val.GetString();
                if (!string.IsNullOrWhiteSpace(filePath))
                    refs.Add((role, filePath));
            }
        }

        return refs;
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
                // Only strip PhotoUrl (avatars) if needed; preserve relative file paths (FilePath, DocumentFilePath, FileUrl)
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

    private static Guid CreateDeterministicFileId(string sourceNodeId, string tableName, string recordKey, string role, string checksum)
    {
        var bytes = SHA256.HashData(System.Text.Encoding.UTF8.GetBytes($"{sourceNodeId}:{tableName}:{recordKey}:{role}:{checksum}"));
        var guidBytes = new byte[16];
        Array.Copy(bytes, guidBytes, 16);
        return new Guid(guidBytes);
    }

    private static string GuessContentType(string filePath)
    {
        return Path.GetExtension(filePath).ToLowerInvariant() switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".gif" => "image/gif",
            ".pdf" => "application/pdf",
            _ => "application/octet-stream"
        };
    }

    private static SyncPriority GetFileTransferPriority(string tableName)
    {
        return tableName switch
        {
            "crew_member" => SyncPriority.Operational,
            "crew_certificate" => SyncPriority.Operational,
            _ => SyncPriority.Low
        };
    }

    /// <summary>
    /// Tàu chỉ ACK gói đã ÁP xong. Kỳ phục vụ bờ tạo thì tàu không gửi ngược lại, nên ACK là bằng chứng duy nhất
    /// để coi bản ghi đã đồng bộ — thiếu bước này, tác vụ đối soát gửi lại mãi. Bản ghi sửa SAU khi gói được tạo
    /// thì chưa tính (gói mới sẽ mang thay đổi đó).
    /// </summary>
    private async Task MarkAppliedLogbookEntriesAsync(List<SyncOutbox> acknowledged)
    {
        if (!_context.Database.IsRelational()) return;
        foreach (var item in acknowledged.Where(i => i.TableName == "crew_logbook_entry"))
        {
            if (!Guid.TryParse(item.RecordKey, out var id)) continue;
            var queuedAt = item.CreatedAt;
            await _context.CrewLogbookEntries
                .Where(e => e.Id == id && !e.IsSynced && e.UpdatedAt <= queuedAt)
                .ExecuteUpdateAsync(s => s.SetProperty(e => e.IsSynced, true));
        }
    }

    public async Task AcknowledgeDeliveryAsync(string nodeId, List<long> itemIds)
    {
        if (string.IsNullOrWhiteSpace(nodeId))
            throw new ArgumentNullException(nameof(nodeId));
        if (itemIds == null || itemIds.Count == 0)
        {
            _logger.LogWarning("AcknowledgeDelivery called with empty itemIds for {NodeId}", nodeId);
            return;
        }

        try
        {
            // Try matching by exact outbox IDs first
            await VesselSyncIdentity.BindPendingRoutesAsync(_context, nodeId);
            var baseQuery = _context.SyncOutbox
                .AsTracking()
                .Where(o => (o.TargetNode != nodeId ? !_context.SyncOutboxDeliveries.Any(d => d.OutboxId == o.Id && d.NodeId == nodeId) : o.DeliveredAt == null))
                .Where(o => o.TargetNode == nodeId || o.TargetNode == "*");

            // Only exact positive IDs may be acknowledged. Repeated/stale ACKs must never
            // mark a different pending batch as delivered.
            var ids = itemIds.Where(id => id > 0).Distinct().ToList();
            var items = await baseQuery.Where(o => ids.Contains(o.Id)).ToListAsync();

            foreach (var item in items)
            {
                if (item.TargetNode != nodeId)
                {
                    if (_context.Database.IsRelational())
                        await _context.Database.ExecuteSqlInterpolatedAsync($@"INSERT INTO sync_outbox_deliveries (""OutboxId"", ""NodeId"", ""AppliedAtUtc"") VALUES ({item.Id}, {nodeId}, {DateTime.UtcNow}) ON CONFLICT (""OutboxId"", ""NodeId"") DO NOTHING");
                    else _context.SyncOutboxDeliveries.Add(new SyncOutboxDelivery { OutboxId = item.Id, NodeId = nodeId, AppliedAtUtc = DateTime.UtcNow });
                }
                if (item.TargetNode != "*") item.DeliveredAt = DateTime.UtcNow;
            }

            await _context.SaveChangesAsync();
            await MarkAppliedLogbookEntriesAsync(items);

            _logger.LogInformation("Acknowledged {Count} items delivered to {NodeId} (requested: {Requested})",
                items.Count, nodeId, itemIds.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error acknowledging delivery for {NodeId}", nodeId);
            throw;
        }
    }
}
