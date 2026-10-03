using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
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

    /// <summary>Broadcast a change to all edge nodes.</summary>
    Task BroadcastAsync(string tableName, string recordKey, SyncActionType action, object payload);

    /// <summary>Enqueue multiple items in a single batch (single SaveChanges).</summary>
    Task EnqueueBatchAsync(string targetNode, List<(string TableName, string RecordKey, SyncActionType Action, object Payload)> items);

    /// <summary>Get pending items for an edge node (cursor-based pagination).</summary>
    Task<SyncPullResponse> GetPendingItemsAsync(string nodeId, DateTime? since, string? cursor, int pageSize);

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
    private readonly AppDbContext _context;
    private readonly ILogger<SyncOutboxService> _logger;
    private readonly ISyncFileStorageService _syncFileStorageService;
    private static readonly HashSet<string> _fileTableNames = new(StringComparer.OrdinalIgnoreCase)
    {
        "crew_member", "crew_certificate", "travel_document", "seafarer_document",
        "employment_document", "health_document", "sms_procedure", "sms_procedures", "sms_filled_record", "sms_filled_records"
    };

    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
        ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles
    };

    public SyncOutboxService(AppDbContext context, ILogger<SyncOutboxService> logger, ISyncFileStorageService syncFileStorageService)
    {
        _context = context;
        _logger = logger;
        _syncFileStorageService = syncFileStorageService;
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
            var serializedPayload = JsonSerializer.Serialize(payload, _jsonOptions);

            // Deduplication: if an undelivered item for the same (node, table, key) already exists,
            // update its payload and version instead of inserting a duplicate.
            var existing = await _context.SyncOutbox
                .AsTracking()
                .Where(o => o.DeliveredAt == null
                         && o.TargetNode == targetNode
                         && o.TableName == tableName
                         && o.RecordKey == recordKey)
                .OrderByDescending(o => o.Id)
                .FirstOrDefaultAsync();

            if (existing != null)
            {
                existing.Payload = serializedPayload;
                existing.ActionType = action;
                existing.SyncVersion = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                await _context.SaveChangesAsync();
                _logger.LogDebug("Updated existing outbox item: {Table}/{Key} → {Node}", tableName, recordKey, targetNode);
                return;
            }

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
        await EnqueueAsync("*", tableName, recordKey, action, payload);
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
            var serializedPayload = JsonSerializer.Serialize(item.Payload, _jsonOptions);
            var outboxItem = new SyncOutbox
            {
                TargetNode = targetNode,
                TableName = item.TableName,
                RecordKey = item.RecordKey,
                ActionType = item.Action,
                Payload = serializedPayload,
                SyncVersion = version++,
                CreatedAt = now
            };
            await _context.SyncOutbox.AddAsync(outboxItem);
        }

        await _context.SaveChangesAsync();
        _logger.LogDebug("Batch enqueued {Count} outbox items → {Node}", items.Count, targetNode);
    }

    public async Task<SyncPullResponse> GetPendingItemsAsync(
        string nodeId, DateTime? since, string? cursor, int pageSize)
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

            var legacyImo = await VesselSyncIdentity.LegacyImoAsync(_context, nodeId);
            await EnsurePendingCrewReferencesAsync(nodeId, legacyImo);
            var query = _context.SyncOutbox
                .Where(o => o.DeliveredAt == null)
                .Where(o => o.TargetNode == nodeId || (legacyImo != null && o.TargetNode == legacyImo) || o.TargetNode == "*")
                .Where(o => o.Id > afterId);

            if (since.HasValue)
                query = query.Where(o => o.CreatedAt >= since.Value);

            var items = await query
                .OrderBy(o => o.Id)
                .Take(pageSize + 1) // Fetch one extra to determine HasMore
                .ToListAsync();

            var hasMore = items.Count > pageSize;
            if (hasMore) items = items.Take(pageSize).ToList();

            var response = new SyncPullResponse
            {
                Items = items.Select(o => new SyncQueueItemDto
                {
                    OutboxId = o.Id,
                    TableName = o.TableName,
                    RecordKey = o.RecordKey,
                    ActionType = o.ActionType.ToString(),
                    Payload = o.Payload,
                    OriginNode = "SHORE",
                    SyncVersion = o.SyncVersion,
                    Timestamp = o.CreatedAt
                }).ToList(),
                ServerTime = DateTime.UtcNow,
                NextCursor = items.LastOrDefault()?.Id.ToString(),
                HasMore = hasMore
            };

            // Attach metadata-only file references for document-related items.
            foreach (var dto in response.Items)
            {
                try
                {
                    dto.FileRefs = await BuildOutgoingFileReferencesAsync(dto, "SHORE");
                    dto.Payload = StripFileReferenceProperties(dto.Payload);
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "Failed to build file refs for pull item {Table}/{Key}", dto.TableName, dto.RecordKey);
                }
            }

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

    private async Task EnsurePendingCrewReferencesAsync(string nodeId, string? legacyImo)
    {
        var payloads = await _context.SyncOutbox.AsNoTracking()
            .Where(o => o.DeliveredAt == null && o.TableName == "crew_member" &&
                (o.TargetNode == nodeId || (legacyImo != null && o.TargetNode == legacyImo) || o.TargetNode == "*"))
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

    private async Task<List<SyncFileReferenceDto>> BuildOutgoingFileReferencesAsync(SyncQueueItemDto dto, string sourceNodeId)
    {
        var refs = new List<SyncFileReferenceDto>();

        if (!_fileTableNames.Contains(dto.TableName))
            return refs;

        foreach (var (role, filePath) in ExtractSyncFilePaths(dto.Payload))
        {
            if (!_syncFileStorageService.Exists(filePath))
            {
                _logger.LogWarning("Sync file path not found for {Table}/{Key}: {Path}", dto.TableName, dto.RecordKey, filePath);
                continue;
            }

            var absPath = _syncFileStorageService.ResolveLocalPath(filePath);
            var fileInfo = new FileInfo(absPath);
            var checksum = await _syncFileStorageService.ComputeSha256HexAsync(filePath, CancellationToken.None);
            refs.Add(new SyncFileReferenceDto
            {
                FileId = CreateDeterministicFileId(sourceNodeId, dto.TableName, dto.RecordKey, role, checksum),
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
            var legacyImo = await VesselSyncIdentity.LegacyImoAsync(_context, nodeId);
            var baseQuery = _context.SyncOutbox
                .AsTracking()
                .Where(o => o.DeliveredAt == null)
                .Where(o => o.TargetNode == nodeId || (legacyImo != null && o.TargetNode == legacyImo) || o.TargetNode == "*");

            // Only exact positive IDs may be acknowledged. Repeated/stale ACKs must never
            // mark a different pending batch as delivered.
            var ids = itemIds.Where(id => id > 0).Distinct().ToList();
            var items = await baseQuery.Where(o => ids.Contains(o.Id)).ToListAsync();

            foreach (var item in items)
            {
                item.DeliveredAt = DateTime.UtcNow;
            }

            await _context.SaveChangesAsync();

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
