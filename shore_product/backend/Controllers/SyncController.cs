using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using ProductApi.Data;
using ProductApi.Models;
using ProductApi.Security;
using ProductApi.Services;
using ProductApi.Services.Sync;
using System.Text.Json;

namespace ProductApi.Controllers;

/// <summary>
/// Shore Sync Controller — receives data pushed from Edge (ship) and serves pull requests.
/// Phase 3: Extended with node tracking, batch processing, idempotency, and hash validation.
/// </summary>
[ApiController]
[Route("api/[controller]")]
[EnableRateLimiting("sync")]
public class SyncController : ControllerBase
{
    private const string VerifiedNodeIdItemKey = "VerifiedSyncNodeId";

    private readonly AppDbContext _context;
    private readonly ISyncInboxService _syncInbox;
    private readonly ISyncOutboxService _syncOutbox;
    private readonly ISyncFileTransferService _syncFileTransfer;
    private readonly ICrewSyncOrchestrator _crewSync;
    private readonly IVesselProvisioningService _provisioningService;
    private readonly ILogger<SyncController> _logger;

    public SyncController(
        AppDbContext context,
        ISyncInboxService syncInbox,
        ISyncOutboxService syncOutbox,
        ISyncFileTransferService syncFileTransfer,
        ICrewSyncOrchestrator crewSync,
        IVesselProvisioningService provisioningService,
        ILogger<SyncController> logger)
    {
        _context = context;
        _syncInbox = syncInbox;
        _syncOutbox = syncOutbox;
        _syncFileTransfer = syncFileTransfer;
        _crewSync = crewSync;
        _provisioningService = provisioningService;
        _logger = logger;
    }

    /// <summary>
    /// POST /api/sync/handshake — Vessel Provisioning v3 (Component 3).
    /// Edge calls this right after importing a provisioning package, using the raw NodeApiToken
    /// (header X-Node-Api-Token) to prove which node it is. On success, Shore records
    /// FirstHandshakeAt/LastHandshakeAt and registers the node for enforced sync.
    /// </summary>
    [HttpPost("handshake")]
    public async Task<IActionResult> Handshake([FromBody] SyncHandshakeDto handshake)
    {
        if (string.IsNullOrWhiteSpace(handshake.NodeId) ||
            string.IsNullOrWhiteSpace(handshake.VesselImo) ||
            !handshake.ShoreVesselId.HasValue)
        {
            return BadRequest(new { error = "nodeId, vesselImo and shoreVesselId are required." });
        }

        var rawToken = Request.Headers[NodeApiTokenMiddleware.NodeApiTokenHeader].FirstOrDefault();
        if (string.IsNullOrWhiteSpace(rawToken))
        {
            return Unauthorized(new { error = "Missing X-Node-Api-Token header." });
        }

        var node = await _provisioningService.ValidateNodeTokenAsync(rawToken);
        if (node == null)
        {
            return Unauthorized(new { error = "Invalid or revoked node API token." });
        }

        if (!string.Equals(node.NodeId, handshake.NodeId, StringComparison.Ordinal) ||
            !string.Equals(node.ImoNumber, handshake.VesselImo, StringComparison.OrdinalIgnoreCase) ||
            node.VesselId != handshake.ShoreVesselId)
        {
            return Unauthorized(new { error = "Provisioning credentials do not belong to the specified vessel identity." });
        }

        var vesselBindingExists = await _context.Vessels
            .AsNoTracking()
            .AnyAsync(v => v.Id == node.VesselId && v.IMO == node.ImoNumber);
        if (!vesselBindingExists)
            return Unauthorized(new { error = "Provisioning credentials are not bound to an existing Shore vessel." });

        var trackedNode = await _context.SyncNodeTrackers.AsTracking().FirstAsync(n => n.Id == node.Id);
        var now = DateTime.UtcNow;

        trackedNode.FirstHandshakeAt ??= now;
        trackedNode.LastHandshakeAt = now;
        trackedNode.LastHeartbeatAt = now;
        trackedNode.IsOnline = true;
        trackedNode.IsRegistered = true;
        if (!string.IsNullOrWhiteSpace(handshake.NetworkType))
            trackedNode.CurrentNetworkType = handshake.NetworkType;
        if (trackedNode.ProvisioningStatus is "Provisioned" or "Downloaded" or "PendingFirstContact")
            trackedNode.ProvisioningStatus = "Active";
        trackedNode.UpdatedAt = now;

        await _context.SaveChangesAsync();

        _logger.LogInformation(
            "Handshake accepted for node {NodeId} (edgeVersion={EdgeVersion}, networkType={NetworkType})",
            trackedNode.NodeId, handshake.EdgeVersion, handshake.NetworkType);

        return Ok(new
        {
            accepted = true,
            serverTime = now,
            nodeId = trackedNode.NodeId,
            vesselImo = trackedNode.ImoNumber,
            shoreVesselId = trackedNode.VesselId,
            provisioningStatus = trackedNode.ProvisioningStatus
        });
    }

    /// <summary>
    /// POST /api/sync — Edge → Shore push. Receives batch of sync items from a ship.
    /// Enhanced: batch processing, idempotency, node tracking.
    /// </summary>
    [HttpPost]
    public async Task<IActionResult> Sync([FromBody] List<Maritime.Shared.DTOs.Sync.SyncQueueItemDto> items)
    {
        if (items == null || items.Count == 0)
            return Ok(new { message = "No items to sync", succeeded = 0, failed = 0 });

        var verifiedNodeId = HttpContext.Items[VerifiedNodeIdItemKey] as string;
        if (!string.IsNullOrWhiteSpace(verifiedNodeId))
        {
            var hasValidVesselBinding = await _context.SyncNodeTrackers
                .AsNoTracking()
                .AnyAsync(n =>
                    n.NodeId == verifiedNodeId &&
                    n.IsRegistered &&
                    !n.IsRevoked &&
                    n.VesselId != null &&
                    n.ImoNumber != null);
            if (!hasValidVesselBinding)
                return Unauthorized(new { error = "Sync node is not bound to a vessel." });
        }

        var distinctOriginNodes = items
            .Select(i => i.OriginNode)
            .Where(i => !string.IsNullOrWhiteSpace(i))
            .Distinct(StringComparer.Ordinal)
            .ToList();

        if (distinctOriginNodes.Count > 1)
            return BadRequest(new { error = "Sync batch must contain a single origin node." });

        if (!string.IsNullOrWhiteSpace(verifiedNodeId) &&
            distinctOriginNodes.Count == 1 &&
            !string.Equals(verifiedNodeId, distinctOriginNodes[0], StringComparison.Ordinal))
        {
            return BadRequest(new { error = "Signed node identity does not match payload origin node." });
        }

        if (!string.IsNullOrWhiteSpace(verifiedNodeId))
        {
            foreach (var item in items)
            {
                item.OriginNode = verifiedNodeId;
            }
        }

        // Limit batch size to prevent abuse
        const int maxBatchSize = 5000;
        if (items.Count > maxBatchSize)
            return BadRequest(new { error = $"Batch size {items.Count} exceeds maximum of {maxBatchSize}" });

        if (items.Any(i => i.SyncVersion <= 0 || string.IsNullOrWhiteSpace(i.TableName) || string.IsNullOrWhiteSpace(i.RecordKey)) ||
            items.Where(i => i.EventId != Guid.Empty).GroupBy(i => i.EventId).Any(g => g.Count() > 1))
            return BadRequest(new { error = "Each sync event requires a positive sequence, table, record key and a distinct event ID." });

        var originNode = verifiedNodeId ?? items.FirstOrDefault()?.OriginNode ?? "UNKNOWN";
        _logger.LogInformation("Received {Count} sync items from {Node}", items.Count, originNode);

        using var transaction = await _context.Database.BeginTransactionAsync();
        try
        {
            // Use batch processing with idempotency (each item saved individually)
            await _context.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({originNode}, 0))");
            var batchResult = await _syncInbox.ProcessBatchAsync(items);

            await transaction.CommitAsync();

            // Update node tracker (non-transactional, best-effort)
            try
            {
                var maxVersion = items.Max(i => i.SyncVersion);
                await _crewSync.UpdateNodeAfterPushAsync(originNode, items.Count, maxVersion);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to update node tracker for {Node}", originNode);
            }

            _logger.LogInformation("Sync batch from {Node}: {Success}/{Total} succeeded",
                originNode, batchResult.Succeeded, items.Count);

            return Ok(new
            {
                message = "Sync complete",
                succeeded = batchResult.Succeeded,
                failed = batchResult.Failed,
                total = items.Count,
                failedItems = batchResult.FailedItems,
                acknowledgedEventIds = batchResult.AcknowledgedEventIds,
                sensorDeferralSyncVersion = 1,
                serverTime = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            await transaction.RollbackAsync();
            _logger.LogError(ex, "Transaction failed during sync from {Node}", originNode);
            return StatusCode(500, new { error = "Sync transaction failed" });
        }
    }

    /// <summary>
    /// POST /api/sync/heartbeat — Edge sends periodic heartbeat with status info.
    /// </summary>
    [HttpPost("heartbeat")]
    public async Task<IActionResult> Heartbeat([FromBody] SyncHeartbeatDto heartbeat)
    {
        var verifiedNodeId = HttpContext.Items[VerifiedNodeIdItemKey] as string;
        if (!string.IsNullOrWhiteSpace(verifiedNodeId) &&
            !string.Equals(verifiedNodeId, heartbeat.NodeId, StringComparison.Ordinal))
        {
            return BadRequest(new { error = "Signed node identity does not match heartbeat node." });
        }

        SyncNodeTracker? verifiedNode = null;
        if (!string.IsNullOrWhiteSpace(verifiedNodeId))
        {
            verifiedNode = await _context.SyncNodeTrackers
                .AsTracking()
                .FirstOrDefaultAsync(n =>
                    n.NodeId == verifiedNodeId &&
                    n.IsRegistered &&
                    !n.IsRevoked &&
                    n.VesselId != null &&
                    n.ImoNumber != null);
            if (verifiedNode == null)
                return Unauthorized(new { error = "Sync node is not bound to a vessel." });

            if (!string.Equals(verifiedNode.ImoNumber, heartbeat.ImoNumber, StringComparison.OrdinalIgnoreCase) ||
                verifiedNode.VesselId != heartbeat.ShoreVesselId)
            {
                return BadRequest(new { error = "Heartbeat vessel identity does not match the provisioned node." });
            }

            heartbeat.NodeId = verifiedNodeId;
            heartbeat.ImoNumber = verifiedNode.ImoNumber;
            heartbeat.ShoreVesselId = verifiedNode.VesselId;
        }

        try
        {
            var node = verifiedNode ?? await _crewSync.GetOrCreateNodeAsync(
                heartbeat.NodeId, heartbeat.ShipName, heartbeat.ImoNumber);

            var receivedAt = DateTime.UtcNow;
            node.LastHeartbeatAt = receivedAt;
            node.IsOnline = true;
            node.IsRegistered = true;
            node.CurrentNetworkType = heartbeat.NetworkType;
            node.ConsecutiveFailures = 0;
            if (node.ProvisioningStatus == "PendingFirstContact")
                node.ProvisioningStatus = "Active";
            node.UpdatedAt = receivedAt;

            await _context.SaveChangesAsync();

            // Return pending outbox count so edge knows how much to pull
            var pendingForNode = await _context.SyncOutbox
                .Where(o => o.TargetNode != heartbeat.NodeId ? !_context.SyncOutboxDeliveries.Any(d => d.OutboxId == o.Id && d.NodeId == heartbeat.NodeId) : o.DeliveredAt == null)
                .Where(o => o.TargetNode == heartbeat.NodeId || o.TargetNode == "*")
                .CountAsync();

            return Ok(new
            {
                serverTime = DateTime.UtcNow,
                pendingItems = pendingForNode,
                nodeStatus = "ONLINE"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error processing heartbeat from {NodeId}", heartbeat.NodeId);
            return StatusCode(500, new { error = "Heartbeat failed" });
        }
    }

    /// <summary>
    /// GET /api/sync/pull — Shore → Edge pull. Returns pending outbox items for a specific node.
    /// Cursor-based pagination for bandwidth efficiency. Updates node tracker.
    /// </summary>
    [HttpGet("pull")]
    public async Task<IActionResult> Pull(
        [FromQuery] string nodeId,
        [FromQuery] DateTime? since = null,
        [FromQuery] string? cursor = null,
        [FromQuery] int pageSize = 50,
        [FromQuery] NetworkType networkType = NetworkType.Shore_WiFi,
        [FromQuery] int maxBytes = 262144)
    {
        var verifiedNodeId = HttpContext.Items[VerifiedNodeIdItemKey] as string;
        if (!string.IsNullOrWhiteSpace(verifiedNodeId) &&
            !string.Equals(verifiedNodeId, nodeId, StringComparison.Ordinal))
        {
            return BadRequest(new { error = "Signed node identity does not match pull node." });
        }

        if (!string.IsNullOrWhiteSpace(verifiedNodeId))
        {
            nodeId = verifiedNodeId;
        }

        try
        {
            if (string.IsNullOrEmpty(nodeId))
                return BadRequest(new { error = "nodeId is required" });

            var response = await _syncOutbox.GetPendingItemsAsync(nodeId, since, cursor, pageSize, networkType, maxBytes);

            // Update node tracker (best-effort)
            try
            {
                if (response.Items.Count > 0)
                    await _crewSync.UpdateNodeAfterPullAsync(nodeId, response.Items.Count);
                else
                {
                    // Even empty pull = heartbeat
                    var node = await _crewSync.GetOrCreateNodeAsync(nodeId);
                    node.LastHeartbeatAt = DateTime.UtcNow;
                    node.IsOnline = true;
                    await _context.SaveChangesAsync();
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to update node tracker for pull from {NodeId}", nodeId);
            }

            return Ok(response);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during pull for node {NodeId}", nodeId);
            return StatusCode(500, new { error = "Pull failed" });
        }
    }

    /// <summary>
    /// POST /api/sync/acknowledge — Edge acknowledges receipt of pulled items.
    /// </summary>
    [HttpPost("acknowledge")]
    public async Task<IActionResult> Acknowledge([FromBody] Maritime.Shared.DTOs.Sync.SyncAcknowledgeDto ack)
    {
        var verifiedNodeId = HttpContext.Items[VerifiedNodeIdItemKey] as string;
        if (!string.IsNullOrWhiteSpace(verifiedNodeId) &&
            !string.Equals(verifiedNodeId, ack.NodeId, StringComparison.Ordinal))
        {
            return BadRequest(new { error = "Signed node identity does not match acknowledge node." });
        }

        if (!string.IsNullOrWhiteSpace(verifiedNodeId))
        {
            ack.NodeId = verifiedNodeId;
        }

        try
        {
            if (string.IsNullOrEmpty(ack.NodeId))
                return BadRequest(new { error = "nodeId is required" });
            if (ack.ItemIds == null || ack.ItemIds.Count == 0)
                return BadRequest(new { error = "itemIds cannot be empty" });

            await _syncOutbox.AcknowledgeDeliveryAsync(ack.NodeId, ack.ItemIds);
            return Ok(new { message = $"Acknowledged {ack.ItemIds.Count} items" });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error acknowledging items for node {NodeId}", ack.NodeId);
            return StatusCode(500, new { error = "Acknowledge failed" });
        }
    }

    /// <summary>
    /// GET /api/sync/file-requests — supplier polls pending file requests created by the receiver.
    /// </summary>
    [HttpGet("file-requests")]
    public async Task<IActionResult> GetFileRequests([FromQuery] string supplierNodeId)
    {
        var verifiedNodeId = HttpContext.Items[VerifiedNodeIdItemKey] as string;
        if (!string.IsNullOrWhiteSpace(verifiedNodeId) &&
            !string.Equals(verifiedNodeId, supplierNodeId, StringComparison.Ordinal))
        {
            return BadRequest(new { error = "Signed node identity does not match supplier node." });
        }

        if (!string.IsNullOrWhiteSpace(verifiedNodeId))
        {
            supplierNodeId = verifiedNodeId;
        }

        if (string.IsNullOrWhiteSpace(supplierNodeId))
            return BadRequest(new { error = "supplierNodeId is required" });

        try
        {
            var requests = await _syncFileTransfer.GetPendingRequestsForSupplierAsync(supplierNodeId, HttpContext.RequestAborted);
            return Ok(requests);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting file requests for supplier {SupplierNodeId}", supplierNodeId);
            return StatusCode(500, new { error = "File request lookup failed" });
        }
    }

    /// <summary>
    /// POST /api/sync/file-request — receiver registers a request for a supplier-owned file.
    /// </summary>
    [HttpPost("file-request")]
    public async Task<IActionResult> RegisterFileRequest([FromBody] Maritime.Shared.DTOs.Sync.SyncFileTransferRequestDto request)
    {
        var verifiedNodeId = HttpContext.Items[VerifiedNodeIdItemKey] as string;
        if (!string.IsNullOrWhiteSpace(verifiedNodeId) &&
            !string.Equals(verifiedNodeId, request.RequesterNodeId, StringComparison.Ordinal))
        {
            return BadRequest(new { error = "Signed node identity does not match requester node." });
        }

        if (!string.IsNullOrWhiteSpace(verifiedNodeId))
        {
            request.RequesterNodeId = verifiedNodeId;
        }

        try
        {
            var result = await _syncFileTransfer.RegisterRequestAsync(request, HttpContext.RequestAborted);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error registering file request {ManifestId} from {RequesterNodeId}", request.ManifestId, request.RequesterNodeId);
            return StatusCode(500, new { error = "File request registration failed" });
        }
    }

    /// <summary>
    /// GET /api/sync/file-download — receiver downloads a supplier-owned file after registering a request.
    /// </summary>
    [HttpGet("file-download")]
    public async Task<IActionResult> DownloadFile([FromQuery] Guid manifestId, [FromQuery] string requesterNodeId)
    {
        var verifiedNodeId = HttpContext.Items[VerifiedNodeIdItemKey] as string;
        if (!string.IsNullOrWhiteSpace(verifiedNodeId) &&
            !string.Equals(verifiedNodeId, requesterNodeId, StringComparison.Ordinal))
        {
            return BadRequest(new { error = "Signed node identity does not match requester node." });
        }

        if (!string.IsNullOrWhiteSpace(verifiedNodeId))
        {
            requesterNodeId = verifiedNodeId;
        }

        try
        {
            var content = await _syncFileTransfer.GetFileContentAsync(manifestId, requesterNodeId, HttpContext.RequestAborted);
            if (content == null)
                return NotFound(new { error = "Requested file is not available" });

            return Ok(content);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error downloading file {ManifestId} for requester {RequesterNodeId}", manifestId, requesterNodeId);
            return StatusCode(500, new { error = "File download failed" });
        }
    }

    /// <summary>
    /// GET /api/sync/file-download-session — requester opens or resumes a chunked download session.
    /// </summary>
    [HttpGet("file-download-session")]
    public async Task<IActionResult> CreateDownloadSession([FromQuery] Guid manifestId, [FromQuery] string requesterNodeId)
    {
        var verifiedNodeId = HttpContext.Items[VerifiedNodeIdItemKey] as string;
        if (!string.IsNullOrWhiteSpace(verifiedNodeId) &&
            !string.Equals(verifiedNodeId, requesterNodeId, StringComparison.Ordinal))
        {
            return BadRequest(new { error = "Signed node identity does not match requester node." });
        }

        if (!string.IsNullOrWhiteSpace(verifiedNodeId))
        {
            requesterNodeId = verifiedNodeId;
        }

        try
        {
            var session = await _syncFileTransfer.CreateDownloadSessionAsync(manifestId, requesterNodeId, HttpContext.RequestAborted);
            if (session == null)
                return NotFound(new { error = "Requested file is not available for chunk transfer" });

            return Ok(session);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating download session for file {ManifestId} and requester {RequesterNodeId}", manifestId, requesterNodeId);
            return StatusCode(500, new { error = "File download session failed" });
        }
    }

    /// <summary>
    /// GET /api/sync/file-download-chunk — requester fetches one chunk from an open download session.
    /// </summary>
    [HttpGet("file-download-chunk")]
    public async Task<IActionResult> DownloadFileChunk(
        [FromQuery] Guid sessionId,
        [FromQuery] string requesterNodeId,
        [FromQuery] int chunkIndex,
        [FromQuery] string resumeToken)
    {
        var verifiedNodeId = HttpContext.Items[VerifiedNodeIdItemKey] as string;
        if (!string.IsNullOrWhiteSpace(verifiedNodeId) &&
            !string.Equals(verifiedNodeId, requesterNodeId, StringComparison.Ordinal))
        {
            return BadRequest(new { error = "Signed node identity does not match requester node." });
        }

        if (!string.IsNullOrWhiteSpace(verifiedNodeId))
        {
            requesterNodeId = verifiedNodeId;
        }

        try
        {
            var chunk = await _syncFileTransfer.GetDownloadChunkAsync(sessionId, requesterNodeId, chunkIndex, resumeToken, HttpContext.RequestAborted);
            if (chunk == null)
                return NotFound(new { error = "Requested chunk is not available" });

            return Ok(chunk);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error downloading chunk {ChunkIndex} for session {SessionId}", chunkIndex, sessionId);
            return StatusCode(500, new { error = "File chunk download failed" });
        }
    }

    /// <summary>
    /// POST /api/sync/file-upload — supplier uploads file bytes to the receiver after a pending request was found.
    /// </summary>
    [HttpPost("file-upload")]
    public async Task<IActionResult> UploadFile([FromBody] Maritime.Shared.DTOs.Sync.SyncFileContentDto content)
    {
        var verifiedNodeId = HttpContext.Items[VerifiedNodeIdItemKey] as string;
        if (!string.IsNullOrWhiteSpace(verifiedNodeId) &&
            !string.Equals(verifiedNodeId, content.SupplierNodeId, StringComparison.Ordinal))
        {
            return BadRequest(new { error = "Signed node identity does not match supplier node." });
        }

        if (!string.IsNullOrWhiteSpace(verifiedNodeId))
        {
            content.SupplierNodeId = verifiedNodeId;
        }

        try
        {
            var result = await _syncFileTransfer.AcceptUploadedFileAsync(content, HttpContext.RequestAborted);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error accepting uploaded file {ManifestId} from supplier {SupplierNodeId}", content.ManifestId, content.SupplierNodeId);
            return StatusCode(500, new { error = "File upload failed" });
        }
    }

    /// <summary>
    /// POST /api/sync/file-upload-bundle — supplier uploads a zip bundle of small files.
    /// </summary>
    [HttpPost("file-upload-bundle")]
    public async Task<IActionResult> UploadFileBundle([FromBody] Maritime.Shared.DTOs.Sync.SyncFileBundleUploadDto bundle)
    {
        var verifiedNodeId = HttpContext.Items[VerifiedNodeIdItemKey] as string;
        if (!string.IsNullOrWhiteSpace(verifiedNodeId) &&
            !string.Equals(verifiedNodeId, bundle.SupplierNodeId, StringComparison.Ordinal))
        {
            return BadRequest(new { error = "Signed node identity does not match supplier node." });
        }

        if (!string.IsNullOrWhiteSpace(verifiedNodeId))
        {
            bundle.SupplierNodeId = verifiedNodeId;
        }

        try
        {
            var result = await _syncFileTransfer.AcceptUploadedBundleAsync(bundle, HttpContext.RequestAborted);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error accepting uploaded file bundle {BundleId} from supplier {SupplierNodeId}", bundle.BundleId, bundle.SupplierNodeId);
            return StatusCode(500, new { error = "File bundle upload failed" });
        }
    }

    /// <summary>
    /// POST /api/sync/file-upload-session — supplier opens or resumes a chunked upload session.
    /// </summary>
    [HttpPost("file-upload-session")]
    public async Task<IActionResult> RegisterUploadSession([FromBody] Maritime.Shared.DTOs.Sync.SyncFileChunkSessionDto session)
    {
        var verifiedNodeId = HttpContext.Items[VerifiedNodeIdItemKey] as string;
        if (!string.IsNullOrWhiteSpace(verifiedNodeId) &&
            !string.Equals(verifiedNodeId, session.SupplierNodeId, StringComparison.Ordinal))
        {
            return BadRequest(new { error = "Signed node identity does not match supplier node." });
        }

        if (!string.IsNullOrWhiteSpace(verifiedNodeId))
        {
            session.SupplierNodeId = verifiedNodeId;
        }

        try
        {
            var result = await _syncFileTransfer.RegisterUploadSessionAsync(session, HttpContext.RequestAborted);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error registering upload session for manifest {ManifestId} from supplier {SupplierNodeId}", session.ManifestId, session.SupplierNodeId);
            return StatusCode(500, new { error = "File upload session failed" });
        }
    }

    /// <summary>
    /// POST /api/sync/file-upload-chunk — supplier uploads one chunk into an open upload session.
    /// </summary>
    [HttpPost("file-upload-chunk")]
    public async Task<IActionResult> UploadFileChunk([FromBody] Maritime.Shared.DTOs.Sync.SyncFileChunkDto chunk)
    {
        var verifiedNodeId = HttpContext.Items[VerifiedNodeIdItemKey] as string;
        if (!string.IsNullOrWhiteSpace(verifiedNodeId) &&
            !string.Equals(verifiedNodeId, chunk.SupplierNodeId, StringComparison.Ordinal))
        {
            return BadRequest(new { error = "Signed node identity does not match supplier node." });
        }

        if (!string.IsNullOrWhiteSpace(verifiedNodeId))
        {
            chunk.SupplierNodeId = verifiedNodeId;
        }

        try
        {
            var result = await _syncFileTransfer.AcceptUploadedChunkAsync(chunk, HttpContext.RequestAborted);
            if (!result.Success)
                return BadRequest(result);

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error accepting uploaded chunk {ChunkIndex} for session {SessionId}", chunk.ChunkIndex, chunk.SessionId);
            return StatusCode(500, new { error = "File chunk upload failed" });
        }
    }

    /// <summary>
    /// POST /api/sync/file-ack — requester confirms the downloaded file is persisted and verified.
    /// </summary>
    [HttpPost("file-ack")]
    public async Task<IActionResult> AcknowledgeFile([FromBody] Maritime.Shared.DTOs.Sync.SyncFileTransferAckDto ack)
    {
        var verifiedNodeId = HttpContext.Items[VerifiedNodeIdItemKey] as string;
        if (!string.IsNullOrWhiteSpace(verifiedNodeId) &&
            !string.Equals(verifiedNodeId, ack.RequesterNodeId, StringComparison.Ordinal))
        {
            return BadRequest(new { error = "Signed node identity does not match requester node." });
        }

        if (!string.IsNullOrWhiteSpace(verifiedNodeId))
        {
            ack.RequesterNodeId = verifiedNodeId;
        }

        try
        {
            var result = await _syncFileTransfer.AcknowledgeReceiptAsync(ack, HttpContext.RequestAborted);
            if (!result.Success)
                return NotFound(new { error = result.Message });

            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error acknowledging file {ManifestId} from requester {RequesterNodeId}", ack.ManifestId, ack.RequesterNodeId);
            return StatusCode(500, new { error = "File acknowledgment failed" });
        }
    }

    /// <summary>
    /// GET /api/sync/status — Get sync overview for all connected nodes/ships.
    /// Enhanced with node tracker data.
    /// </summary>
    [HttpGet("status")]
    [Authorize(Policy = "InternalAccess")]
    public async Task<IActionResult> GetSyncStatus()
    {
        try
        {
            // Node tracker info
            var nodes = await _context.SyncNodeTrackers
                .AsNoTracking()
                .Select(n => new
                {
                    n.NodeId,
                    n.ShipName,
                    n.ImoNumber,
                    n.ProvisioningStatus,
                    n.IsOnline,
                    n.LastPushAt,
                    n.LastPullAt,
                    n.LastHeartbeatAt,
                    n.PendingOutboxCount,
                    n.TotalReceivedCount,
                    n.TotalDeliveredCount,
                    n.ConsecutiveFailures,
                    n.CurrentNetworkType
                })
                .ToListAsync();

            // Pending outbox items per node (from outbox table)
            var outboxStats = await _context.SyncOutbox
                .Where(o => o.DeliveredAt == null)
                .GroupBy(o => o.TargetNode)
                .Select(g => new { Node = g.Key, Pending = g.Count() })
                .ToListAsync();

            // Recent sync logs
            var recentLogs = await _context.SyncLogs
                .OrderByDescending(l => l.ProcessedAt)
                .Take(20)
                .Select(l => new
                {
                    l.Direction,
                    l.OriginNode,
                    l.TableName,
                    l.RecordKey,
                    l.ActionType,
                    l.Status,
                    l.ProcessedAt
                })
                .ToListAsync();

            return Ok(new
            {
                nodes,
                outboxStats,
                recentLogs,
                serverTime = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting sync status");
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    /// <summary>
    /// POST /api/sync/reconcile — Trigger reconciliation of unsynced records.
    /// </summary>
    [HttpPost("reconcile")]
    [Authorize(Policy = "InternalAccess")]
    public async Task<IActionResult> Reconcile()
    {
        try
        {
            var count = await _crewSync.ReconcileUnsyncedDataAsync();
            return Ok(new { message = $"Reconciled {count} unsynced records", count });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during reconciliation");
            return StatusCode(500, new { error = "Reconciliation failed" });
        }
    }

    /// <summary>
    /// POST /api/sync/force-push — Admin trigger: Queue data for specific node to pull.
    /// Pushes all crew/certificate data to target ship's outbox.
    /// </summary>
    [HttpPost("force-push/{nodeId}")]
    [Authorize(Policy = "InternalAccess")]
    public async Task<IActionResult> ForcePush(string nodeId)
    {
        try
        {
            if (string.IsNullOrEmpty(nodeId))
                return BadRequest(new { error = "nodeId is required" });

            _logger.LogInformation("Force push initiated for node {NodeId}", nodeId);

            // Queue full snapshot for the target node
            var count = await _crewSync.QueueFullCrewSnapshotAsync(nodeId);

            _logger.LogInformation("Force push queued {Count} items for node {NodeId}", count, nodeId);

            return Ok(new
            {
                message = $"Successfully queued {count} items for sync",
                nodeId,
                queuedItems = count,
                status = "QUEUED",
                note = "Edge node will pull these items in next sync cycle (typically 5 minutes)"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during force push for node {NodeId}", nodeId);
            return StatusCode(500, new { error = "Force push failed" });
        }
    }

    /// <summary>
    /// POST /api/sync/force-push-all — Broadcast push to all connected nodes.
    /// </summary>
    [HttpPost("force-push-all")]
    [Authorize(Policy = "InternalAccess")]
    public async Task<IActionResult> ForcePushAll()
    {
        try
        {
            var nodes = await _context.SyncNodeTrackers
                .Where(n => n.IsOnline)
                .Select(n => n.NodeId)
                .ToListAsync();

            if (nodes.Count == 0)
                return BadRequest(new { error = "No online nodes found" });

            var totalQueued = 0;
            foreach (var nodeId in nodes)
            {
                var count = await _crewSync.QueueFullCrewSnapshotAsync(nodeId);
                totalQueued += count;
            }

            _logger.LogInformation("Force push all queued {Total} items for {NodeCount} nodes", totalQueued, nodes.Count);

            return Ok(new
            {
                message = $"Queued sync for {nodes.Count} ships",
                nodeCount = nodes.Count,
                totalQueuedItems = totalQueued,
                nodes
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error during force push all");
            return StatusCode(500, new { error = "Force push all failed" });
        }
    }

}

public class SyncResultDto
{
    public long Id { get; set; }
    public bool Success { get; set; }
    public string? Error { get; set; }
}

public class SyncHeartbeatDto
{
    public string NodeId { get; set; } = string.Empty;
    public string? ShipName { get; set; }
    public string? ImoNumber { get; set; }
    public Guid? ShoreVesselId { get; set; }
    public string? NetworkType { get; set; }
    public int PendingSyncItems { get; set; }
    /// <summary>UTC timestamp set by Edge just before sending — used to compute one-way latency.</summary>
    public DateTime? SentAt { get; set; }
}

/// <summary>Vessel Provisioning v3 — payload for POST /api/sync/handshake.</summary>
public class SyncHandshakeDto
{
    public string? NodeId { get; set; }
    public string? VesselImo { get; set; }
    public Guid? ShoreVesselId { get; set; }
    public string? EdgeVersion { get; set; }
    public string? NetworkType { get; set; }
}
