using Microsoft.EntityFrameworkCore;
using Maritime.Shared.Models.Crew;
using Maritime.Shared.Models.Sync;
using ProductApi.Data;
using ProductApi.Models;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ProductApi.Services.Sync;

/// <summary>
/// Interface for orchestrating crew &amp; certificate synchronization on Shore side.
/// Provides high-level operations: full resync, delta push, validation, and integrity checks.
/// </summary>
public interface ICrewSyncOrchestrator
{
    /// <summary>Queue all crew data for a specific node (full snapshot resync).</summary>
    Task<int> QueueFullCrewSnapshotAsync(string targetNode);

    /// <summary>Queue only changed crew/cert records since a given timestamp.</summary>
    Task<int> QueueDeltaSyncAsync(string targetNode, DateTime since);

    /// <summary>Validate incoming crew data integrity (hash check).</summary>
    bool ValidatePayloadIntegrity(string payload, string? expectedHash);

    /// <summary>Update SyncNodeTracker after a successful push from edge.</summary>
    Task UpdateNodeAfterPushAsync(string originNode, int batchSize, long maxVersion);

    /// <summary>Update SyncNodeTracker after a successful pull by edge.</summary>
    Task UpdateNodeAfterPullAsync(string nodeId, int deliveredCount);

    /// <summary>Get or register a sync node tracker.</summary>
    Task<SyncNodeTracker> GetOrCreateNodeAsync(string nodeId, string? shipName = null, string? imo = null);

    /// <summary>Reconcile unsynced crew records — queue them for outbox.</summary>
    Task<int> ReconcileUnsyncedDataAsync();
}

public class CrewSyncOrchestrator : ICrewSyncOrchestrator
{
    private readonly AppDbContext _context;
    private readonly ISyncOutboxService _syncOutbox;
    private readonly ILogger<CrewSyncOrchestrator> _logger;

    private static readonly JsonSerializerOptions _jsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        WriteIndented = false,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
        ReferenceHandler = System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles
    };

    public CrewSyncOrchestrator(
        AppDbContext context,
        ISyncOutboxService syncOutbox,
        ILogger<CrewSyncOrchestrator> logger)
    {
        _context = context;
        _syncOutbox = syncOutbox;
        _logger = logger;
    }

    public async Task<int> QueueFullCrewSnapshotAsync(string targetNode)
    {
        var batch = new List<(string TableName, string RecordKey, SyncActionType Action, object Payload)>();

        // 1. Master data first (dependencies)
        var countries = await _context.Countries.AsNoTracking().ToListAsync();
        foreach (var c in countries)
            batch.Add(("country", c.Id.ToString(), SyncActionType.SNAPSHOT, c));

        var ranks = await _context.Ranks.AsNoTracking().ToListAsync();
        foreach (var r in ranks)
            batch.Add(("rank", r.Id.ToString(), SyncActionType.SNAPSHOT, r));

        var certTypes = await _context.CrewCertificateTypes.AsNoTracking().ToListAsync();
        foreach (var ct in certTypes)
            batch.Add(("certificate", ct.Id.ToString(), SyncActionType.SNAPSHOT, ct));

        // 1b. Certificate junction tables (country + rank mappings)
        var countryCerts = await _context.CountryCertificates.AsNoTracking().ToListAsync();
        foreach (var cc in countryCerts)
            batch.Add(("country_certificate", cc.Id.ToString(), SyncActionType.SNAPSHOT, cc));

        var rankCerts = await _context.RankCertificates.AsNoTracking().ToListAsync();
        foreach (var rc in rankCerts)
            batch.Add(("rank_certificate", rc.Id.ToString(), SyncActionType.SNAPSHOT, rc));

        // 1c. Danh mục cảng — bờ làm chủ. Tàu khớp theo PortCode (UN/LOCODE), không theo Id.
        // Gồm cả cảng đã ngừng dùng để tàu cũng cập nhật IsActive = false.
        var ports = await _context.Ports.AsNoTracking().OrderBy(p => p.Id).ToListAsync();
        foreach (var p in ports)
            batch.Add(("port", p.Id.ToString(), SyncActionType.SNAPSHOT, p));

        // 2. Crew members
        var crew = await _context.CrewMembers.AsNoTracking().Include(c => c.Rank).ToListAsync();
        foreach (var c in crew)
            batch.Add(("crew_member", c.Id.ToString(), SyncActionType.SNAPSHOT, c));

        // 3. Crew certificates
        var crewCerts = await _context.CrewCertificates.AsNoTracking()
            .Include(cc => cc.Certificate)
            .Include(cc => cc.Country)
            .ToListAsync();
        foreach (var cc in crewCerts)
            batch.Add(("crew_certificate", cc.Id.ToString(), SyncActionType.SNAPSHOT, cc));

        // 4. Service records
        var serviceRecords = await _context.ServiceRecords.AsNoTracking().ToListAsync();
        foreach (var sr in serviceRecords)
            batch.Add(("service_record", sr.Id.ToString(), SyncActionType.SNAPSHOT, sr));

        // 5. Documents
        var travelDocs = await _context.TravelDocuments.AsNoTracking().ToListAsync();
        foreach (var d in travelDocs)
            batch.Add(("travel_document", d.Id.ToString(), SyncActionType.SNAPSHOT, d));

        var seafarerDocs = await _context.SeafarerDocuments.AsNoTracking().ToListAsync();
        foreach (var d in seafarerDocs)
            batch.Add(("seafarer_document", d.Id.ToString(), SyncActionType.SNAPSHOT, d));

        var employmentDocs = await _context.EmploymentDocuments.AsNoTracking().ToListAsync();
        foreach (var d in employmentDocs)
            batch.Add(("employment_document", d.Id.ToString(), SyncActionType.SNAPSHOT, d));

        var healthDocs = await _context.HealthDocuments.AsNoTracking().ToListAsync();
        foreach (var d in healthDocs)
            batch.Add(("health_document", d.Id.ToString(), SyncActionType.SNAPSHOT, d));

        // Enqueue all items in a single batch (one SaveChanges)
        await _syncOutbox.EnqueueBatchAsync(targetNode, batch);

        _logger.LogInformation("Full crew snapshot queued for {Node}: {Count} items (batch)", targetNode, batch.Count);
        return batch.Count;
    }

    public async Task<int> QueueDeltaSyncAsync(string targetNode, DateTime since)
    {
        var enqueued = 0;

        // Only queue records updated since `since`
        var changedCrew = await _context.CrewMembers
            .Where(c => c.UpdatedAt >= since && c.OriginNode == "SHORE")
            .ToListAsync();

        foreach (var c in changedCrew)
        {
            await _syncOutbox.EnqueueAsync(targetNode, "crew_member", c.Id.ToString(), SyncActionType.UPDATE, c);
            enqueued++;
        }

        var changedCerts = await _context.CrewCertificates
            .Where(c => c.UpdatedAt >= since && c.OriginNode == "SHORE")
            .Include(cc => cc.Certificate)
            .Include(cc => cc.Country)
            .ToListAsync();

        foreach (var cc in changedCerts)
        {
            await _syncOutbox.EnqueueAsync(targetNode, "crew_certificate", cc.Id.ToString(), SyncActionType.UPDATE, cc);
            enqueued++;
        }

        // Master data changes
        var changedCertTypes = await _context.CrewCertificateTypes
            .Where(c => c.UpdatedAt >= since)
            .ToListAsync();

        foreach (var ct in changedCertTypes)
        {
            await _syncOutbox.EnqueueAsync(targetNode, "certificate", ct.Id.ToString(), SyncActionType.UPDATE, ct);
            enqueued++;
        }

        var changedCountries = await _context.Countries
            .Where(c => c.UpdatedAt >= since)
            .ToListAsync();

        foreach (var c in changedCountries)
        {
            await _syncOutbox.EnqueueAsync(targetNode, "country", c.Id.ToString(), SyncActionType.UPDATE, c);
            enqueued++;
        }

        var changedRanks = await _context.Ranks
            .Where(r => r.UpdatedAt >= since)
            .ToListAsync();

        foreach (var r in changedRanks)
        {
            await _syncOutbox.EnqueueAsync(targetNode, "rank", r.Id.ToString(), SyncActionType.UPDATE, r);
            enqueued++;
        }

        // Service records
        var changedServiceRecords = await _context.ServiceRecords
            .Where(sr => sr.UpdatedAt >= since && sr.OriginNode == "SHORE")
            .ToListAsync();

        foreach (var sr in changedServiceRecords)
        {
            await _syncOutbox.EnqueueAsync(targetNode, "service_record", sr.Id.ToString(), SyncActionType.UPDATE, sr);
            enqueued++;
        }

        // Documents (no ISyncableEntity — filter by UpdatedAt only)
        var changedTravelDocs = await _context.TravelDocuments
            .Where(d => d.UpdatedAt >= since)
            .ToListAsync();

        foreach (var d in changedTravelDocs)
        {
            await _syncOutbox.EnqueueAsync(targetNode, "travel_document", d.Id.ToString(), SyncActionType.UPDATE, d);
            enqueued++;
        }

        var changedSeafarerDocs = await _context.SeafarerDocuments
            .Where(d => d.UpdatedAt >= since)
            .ToListAsync();

        foreach (var d in changedSeafarerDocs)
        {
            await _syncOutbox.EnqueueAsync(targetNode, "seafarer_document", d.Id.ToString(), SyncActionType.UPDATE, d);
            enqueued++;
        }

        var changedEmploymentDocs = await _context.EmploymentDocuments
            .Where(d => d.UpdatedAt >= since)
            .ToListAsync();

        foreach (var d in changedEmploymentDocs)
        {
            await _syncOutbox.EnqueueAsync(targetNode, "employment_document", d.Id.ToString(), SyncActionType.UPDATE, d);
            enqueued++;
        }

        var changedHealthDocs = await _context.HealthDocuments
            .Where(d => d.UpdatedAt >= since)
            .ToListAsync();

        foreach (var d in changedHealthDocs)
        {
            await _syncOutbox.EnqueueAsync(targetNode, "health_document", d.Id.ToString(), SyncActionType.UPDATE, d);
            enqueued++;
        }

        _logger.LogInformation("Delta sync for {Node} since {Since}: {Count} items", targetNode, since, enqueued);
        return enqueued;
    }

    public bool ValidatePayloadIntegrity(string payload, string? expectedHash)
    {
        if (string.IsNullOrEmpty(expectedHash)) return true; // Hash optional for backward compatibility
        var actualHash = ComputeHash(payload);
        return string.Equals(actualHash, expectedHash, StringComparison.OrdinalIgnoreCase);
    }

    public async Task UpdateNodeAfterPushAsync(string originNode, int batchSize, long maxVersion)
    {
        var node = await GetOrCreateNodeAsync(originNode);
        node.LastPushAt = DateTime.UtcNow;
        node.LastHeartbeatAt = DateTime.UtcNow;
        node.TotalReceivedCount += batchSize;
        node.LastPushBatchSize = batchSize;
        node.IsOnline = true;
        node.ConsecutiveFailures = 0;
        node.LastError = null;
        node.LastErrorAt = null;
        MarkProvisioningActiveIfReady(node);
        node.UpdatedAt = DateTime.UtcNow;

        if (maxVersion > node.LastReceivedVersion)
            node.LastReceivedVersion = maxVersion;

        await _context.SaveChangesAsync();
    }

    public async Task UpdateNodeAfterPullAsync(string nodeId, int deliveredCount)
    {
        var node = await GetOrCreateNodeAsync(nodeId);
        node.LastPullAt = DateTime.UtcNow;
        node.LastHeartbeatAt = DateTime.UtcNow;
        node.TotalDeliveredCount += deliveredCount;
        node.IsOnline = true;
        node.ConsecutiveFailures = 0;
        MarkProvisioningActiveIfReady(node);
        node.UpdatedAt = DateTime.UtcNow;

        // Update pending outbox count
        node.PendingOutboxCount = await _context.SyncOutbox
            .Where(o => o.DeliveredAt == null)
            .Where(o => o.TargetNode == nodeId || o.TargetNode == "*")
            .CountAsync();

        await _context.SaveChangesAsync();
    }

    public async Task<SyncNodeTracker> GetOrCreateNodeAsync(string nodeId, string? shipName = null, string? imo = null)
    {
        // AsTracking() needed because DbContext default is NoTracking
        var node = await _context.SyncNodeTrackers.AsTracking().FirstOrDefaultAsync(n => n.NodeId == nodeId);

        if (node == null)
        {
            node = new SyncNodeTracker
            {
                NodeId = nodeId,
                ShipName = shipName,
                ImoNumber = imo,
                IsRegistered = false,
                IsRevoked = false,
                KeyVersion = 1,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            _context.SyncNodeTrackers.Add(node);
            await _context.SaveChangesAsync();
            _logger.LogInformation("Registered new sync node: {NodeId} ({ShipName})", nodeId, shipName);
        }
        else if ((shipName != null && node.ShipName != shipName) || (imo != null && node.ImoNumber != imo))
        {
            if (node.VesselId.HasValue &&
                !string.IsNullOrWhiteSpace(imo) &&
                !string.Equals(node.ImoNumber, imo, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException(
                    $"Provisioned node {node.NodeId} cannot change vessel IMO from {node.ImoNumber} to {imo}.");
            }

            node.ShipName = shipName;
            if (!node.VesselId.HasValue)
                node.ImoNumber = imo ?? node.ImoNumber;
            node.UpdatedAt = DateTime.UtcNow;
        }

        return node;
    }

    private static void MarkProvisioningActiveIfReady(SyncNodeTracker node)
    {
        node.IsRegistered = true;

        if (node.ProvisioningStatus == "PendingFirstContact")
        {
            node.ProvisioningStatus = "Active";
        }
    }

    public async Task<int> ReconcileUnsyncedDataAsync()
    {
        var enqueued = 0;

        // Find crew members created/updated on Shore but not yet in outbox
        var unsyncedCrew = await _context.CrewMembers
            .Where(c => !c.IsSynced && c.OriginNode == "SHORE")
            .ToListAsync();

        foreach (var c in unsyncedCrew)
        {
            await _syncOutbox.BroadcastAsync("crew_member", c.Id.ToString(), SyncActionType.CREATE, c);
            c.IsSynced = true;
            enqueued++;
        }

        var unsyncedCerts = await _context.CrewCertificates
            .Where(c => !c.IsSynced && c.OriginNode == "SHORE")
            .Include(cc => cc.Certificate)
            .Include(cc => cc.Country)
            .ToListAsync();

        foreach (var cc in unsyncedCerts)
        {
            await _syncOutbox.BroadcastAsync("crew_certificate", cc.Id.ToString(), SyncActionType.CREATE, cc);
            cc.IsSynced = true;
            enqueued++;
        }

        var unsyncedServiceRecords = await _context.ServiceRecords
            .Where(sr => !sr.IsSynced && sr.OriginNode == "SHORE")
            .ToListAsync();

        foreach (var sr in unsyncedServiceRecords)
        {
            await _syncOutbox.BroadcastAsync("service_record", sr.Id.ToString(), SyncActionType.CREATE, sr);
            sr.IsSynced = true;
            enqueued++;
        }

        if (enqueued > 0)
        {
            await _context.SaveChangesAsync();
            _logger.LogInformation("Reconciled {Count} unsynced records to outbox", enqueued);
        }

        return enqueued;
    }

    // ── Utility ──

    public static string ComputeHash(string data)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(data));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
