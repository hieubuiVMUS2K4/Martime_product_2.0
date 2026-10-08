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

    // Gửi dữ liệu xuống tàu theo nhóm: xem ShoreSyncPushService (mỗi tàu chỉ nhận thuyền viên của chính nó).

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
            .Where(o => o.TargetNode != nodeId ? !_context.SyncOutboxDeliveries.Any(d => d.OutboxId == o.Id && d.NodeId == nodeId) : o.DeliveredAt == null)
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
            await _syncOutbox.EnqueueForVesselAsync(c.VesselId, "crew_member", c.Id.ToString(), SyncActionType.CREATE, c);
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
            await _syncOutbox.EnqueueForCrewAsync(cc.CrewMemberId, "crew_certificate", cc.Id.ToString(), SyncActionType.CREATE, cc);
            cc.IsSynced = true;
            enqueued++;
        }

        var unsyncedServiceRecords = await _context.ServiceRecords
            .Where(sr => !sr.IsSynced && sr.OriginNode == "SHORE")
            .ToListAsync();

        foreach (var sr in unsyncedServiceRecords)
        {
            await _syncOutbox.EnqueueForCrewAsync(sr.CrewMemberId, "service_record", sr.Id.ToString(), SyncActionType.CREATE, sr);
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
