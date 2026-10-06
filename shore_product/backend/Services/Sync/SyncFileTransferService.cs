using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using ProductApi.Data;
using Maritime.Shared.DTOs.Sync;
using Maritime.Shared.Models.Sync;
using System.Security.Cryptography;
using System.IO.Compression;

namespace ProductApi.Services.Sync;

public interface ISyncFileTransferService
{
    Task<List<SyncFileTransferRequestDto>> GetPendingRequestsForSupplierAsync(string supplierNodeId, CancellationToken cancellationToken);
    Task<SyncFileTransferResultDto> RegisterRequestAsync(SyncFileTransferRequestDto request, CancellationToken cancellationToken);
    Task<SyncFileContentDto?> GetFileContentAsync(Guid manifestId, string requesterNodeId, CancellationToken cancellationToken);
    Task<SyncFileChunkSessionDto?> CreateDownloadSessionAsync(Guid manifestId, string requesterNodeId, CancellationToken cancellationToken);
    Task<SyncFileChunkDto?> GetDownloadChunkAsync(Guid sessionId, string requesterNodeId, int chunkIndex, string resumeToken, CancellationToken cancellationToken);
    Task<SyncFileTransferResultDto> AcceptUploadedFileAsync(SyncFileContentDto content, CancellationToken cancellationToken);
    Task<SyncFileChunkSessionDto> RegisterUploadSessionAsync(SyncFileChunkSessionDto session, CancellationToken cancellationToken);
    Task<SyncFileChunkResultDto> AcceptUploadedChunkAsync(SyncFileChunkDto chunk, CancellationToken cancellationToken);
    Task<SyncFileTransferResultDto> AcknowledgeReceiptAsync(SyncFileTransferAckDto ack, CancellationToken cancellationToken);
    Task<SyncFileBundleResultDto> AcceptUploadedBundleAsync(SyncFileBundleUploadDto bundle, CancellationToken cancellationToken);
}

public class SyncFileTransferService : ISyncFileTransferService
{
    private readonly AppDbContext _context;
    private readonly ISyncFileStorageService _syncFileStorageService;
    private readonly ILogger<SyncFileTransferService> _logger;
    private readonly IConfiguration _configuration;
    private readonly string _receiverNodeId;

    public SyncFileTransferService(
        AppDbContext context,
        ISyncFileStorageService syncFileStorageService,
        IConfiguration configuration,
        ILogger<SyncFileTransferService> logger)
    {
        _context = context;
        _context.SuppressAutoOutbox = true;
        _syncFileStorageService = syncFileStorageService;
        _configuration = configuration;
        _logger = logger;
        _receiverNodeId = configuration["SyncSecurity:NodeId"]
            ?? configuration["Sync:NodeId"]
            ?? "SHORE";
    }

    public async Task<List<SyncFileTransferRequestDto>> GetPendingRequestsForSupplierAsync(string supplierNodeId, CancellationToken cancellationToken)
    {
        return await _context.SyncFileTransferRequests
            .AsNoTracking()
            .Include(r => r.Manifest)
            .Where(r => r.SupplierNodeId == supplierNodeId)
            .Where(r => r.Status == SyncFileRequestStatus.Pending || r.Status == SyncFileRequestStatus.Deferred)
            .Where(r => r.NextRetryAt == null || r.NextRetryAt <= DateTime.UtcNow)
            .Where(r => r.Manifest != null)
            .OrderBy(r => r.RequestedAtUtc)
            .Take(50)
            .Select(r => new SyncFileTransferRequestDto
            {
                RequestId = r.Id,
                ManifestId = r.ManifestId,
                FileId = r.ManifestId,
                RequesterNodeId = r.RequesterNodeId,
                SupplierNodeId = r.SupplierNodeId,
                TableName = r.Manifest!.TableName,
                RecordKey = r.Manifest.RecordKey,
                FileRole = r.Manifest.FileRole,
                FileName = r.Manifest.FileName,
                ContentType = r.Manifest.ContentType,
                SizeBytes = r.Manifest.SizeBytes,
                Sha256 = r.Manifest.Sha256,
                SourcePath = r.Manifest.SourcePath,
                TransferPriority = r.Manifest.TransferPriority,
                PreferDeltaTransfer = r.PreferDeltaTransfer,
                DeltaBlockSizeBytes = r.DeltaBlockSizeBytes,
                ReceiverBaseSha256 = r.ReceiverBaseSha256,
                ReceiverBlockHashes = DeserializeStringList(r.ReceiverBlockHashesJson),
                RequestedAtUtc = r.RequestedAtUtc
            })
            .ToListAsync(cancellationToken);
    }

    public async Task<SyncFileTransferResultDto> RegisterRequestAsync(SyncFileTransferRequestDto request, CancellationToken cancellationToken)
    {
        var manifest = await _context.SyncFileManifests
            .AsTracking()
            .FirstOrDefaultAsync(m => m.Id == request.ManifestId, cancellationToken);

        if (request.RequesterNodeId != _receiverNodeId && request.SupplierNodeId != _receiverNodeId)
            throw new InvalidOperationException("Only files supplied by this Shore node can be requested remotely");
        string? verifiedSource = null;
        if (manifest == null && request.SupplierNodeId == _receiverNodeId)
        {
            // Backward compatibility for metadata issued before manifests were persisted on pull.
            var authorized = await _context.SyncOutbox.AnyAsync(item => item.TableName == request.TableName && item.RecordKey == request.RecordKey &&
                (item.TargetNode == request.RequesterNodeId || item.TargetNode == "*"), cancellationToken);
            verifiedSource = authorized ? await FindEntityFilePathAsync(request.TableName, request.RecordKey, cancellationToken) : null;
            if (string.IsNullOrWhiteSpace(verifiedSource) || !_syncFileStorageService.Exists(verifiedSource) ||
                !string.Equals(await _syncFileStorageService.ComputeSha256HexAsync(verifiedSource, cancellationToken), request.Sha256, StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Unknown or unauthorized Shore file manifest; request refreshed metadata");
        }
        if (manifest == null)
        {
            manifest = new SyncFileManifest
            {
                Id = request.ManifestId,
                OwnerNodeId = request.SupplierNodeId,
                ReceiverNodeId = request.RequesterNodeId,
                TableName = request.TableName,
                RecordKey = request.RecordKey,
                FileRole = request.FileRole,
                SourcePath = verifiedSource,
                CreatedAt = DateTime.UtcNow
            };
            await _context.SyncFileManifests.AddAsync(manifest, cancellationToken);
        }

        AssertManifestParticipants(manifest, request.RequesterNodeId, request.SupplierNodeId);
        AssertManifestRecord(manifest, request.TableName, request.RecordKey, request.FileRole);
        if (request.SupplierNodeId == _receiverNodeId) AssertManifestContent(manifest, request.Sha256, request.SizeBytes);
        var sameContent = string.Equals(manifest.Sha256, request.Sha256, StringComparison.OrdinalIgnoreCase) && manifest.SizeBytes == request.SizeBytes;
        var alreadyReceived = sameContent && manifest.TransferStatus == SyncFileTransferStatus.Verified;
        manifest.OwnerNodeId = request.SupplierNodeId;
        manifest.ReceiverNodeId = request.RequesterNodeId;
        manifest.TableName = request.TableName;
        manifest.RecordKey = request.RecordKey;
        manifest.FileRole = request.FileRole;
        manifest.FileName = request.FileName;
        manifest.ContentType = request.ContentType;
        manifest.SizeBytes = request.SizeBytes;
        manifest.Sha256 = request.Sha256;
        if (request.SupplierNodeId != _receiverNodeId) manifest.SourcePath = request.SourcePath;
        manifest.TransferPriority = request.TransferPriority;
        manifest.TransferStatus = alreadyReceived ? SyncFileTransferStatus.Verified : SyncFileTransferStatus.Requested;
        manifest.LastRequestedAtUtc = DateTime.UtcNow;
        manifest.LastError = null;
        manifest.UpdatedAt = DateTime.UtcNow;

        var transferRequest = await _context.SyncFileTransferRequests
            .AsTracking()
            .FirstOrDefaultAsync(r => r.Id == request.RequestId, cancellationToken);

        transferRequest ??= await _context.SyncFileTransferRequests
            .AsTracking()
            .FirstOrDefaultAsync(r =>
                r.ManifestId == request.ManifestId &&
                r.RequesterNodeId == request.RequesterNodeId &&
                r.SupplierNodeId == request.SupplierNodeId &&
                (r.Status == SyncFileRequestStatus.Pending ||
                 r.Status == SyncFileRequestStatus.Deferred ||
                 r.Status == SyncFileRequestStatus.Completed),
                cancellationToken);

        if (transferRequest == null)
        {
            transferRequest = new SyncFileTransferRequest
            {
                Id = request.RequestId == Guid.Empty ? Guid.NewGuid() : request.RequestId,
                ManifestId = request.ManifestId,
                RequesterNodeId = request.RequesterNodeId,
                SupplierNodeId = request.SupplierNodeId,
                RequestedAtUtc = request.RequestedAtUtc == default ? DateTime.UtcNow : request.RequestedAtUtc,
                Status = SyncFileRequestStatus.Pending
            };
            await _context.SyncFileTransferRequests.AddAsync(transferRequest, cancellationToken);
        }
        else
        {
            AssertRequestParticipants(transferRequest, request.ManifestId, request.RequesterNodeId, request.SupplierNodeId);
            transferRequest.ManifestId = request.ManifestId;
            transferRequest.RequesterNodeId = request.RequesterNodeId;
            transferRequest.SupplierNodeId = request.SupplierNodeId;
            transferRequest.RequestedAtUtc = request.RequestedAtUtc == default ? transferRequest.RequestedAtUtc : request.RequestedAtUtc;
            if (!sameContent || transferRequest.Status != SyncFileRequestStatus.Completed)
                transferRequest.Status = alreadyReceived ? SyncFileRequestStatus.Completed : SyncFileRequestStatus.Pending;
        }

        transferRequest.NextRetryAt = null;
        transferRequest.LastError = null;
        transferRequest.PreferDeltaTransfer = request.PreferDeltaTransfer;
        transferRequest.DeltaBlockSizeBytes = request.DeltaBlockSizeBytes;
        transferRequest.ReceiverBaseSha256 = request.ReceiverBaseSha256;
        transferRequest.ReceiverBlockHashesJson = request.ReceiverBlockHashes.Count == 0
            ? null
            : System.Text.Json.JsonSerializer.Serialize(request.ReceiverBlockHashes);

        await _context.SaveChangesAsync(cancellationToken);

        return new SyncFileTransferResultDto
        {
            Success = true,
            RequestId = transferRequest.Id,
            ManifestId = manifest.Id,
            FileId = manifest.Id,
            Message = "File request registered",
            ProcessedAtUtc = DateTime.UtcNow
        };
    }

    public async Task<SyncFileContentDto?> GetFileContentAsync(Guid manifestId, string requesterNodeId, CancellationToken cancellationToken)
    {
        var request = await GetActiveRequestAsync(manifestId, requesterNodeId, cancellationToken);
        if (request?.Manifest == null)
            return null;

        var relativePath = await ResolveOutgoingTransferPathAsync(request.Manifest, cancellationToken);
        if (string.IsNullOrWhiteSpace(relativePath) || !_syncFileStorageService.Exists(relativePath))
            return null;

        var actualSha256 = await _syncFileStorageService.ComputeSha256HexAsync(relativePath, cancellationToken);
        if (!string.Equals(actualSha256, request.Manifest.Sha256, StringComparison.OrdinalIgnoreCase))
        {
            request.LastError = "Checksum mismatch while preparing outgoing file";
            request.Manifest.LastError = request.LastError;
            request.Manifest.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync(cancellationToken);
            return null;
        }

        var fileBytes = await _syncFileStorageService.ReadAllBytesAsync(relativePath, cancellationToken);

        request.LastError = null;
        request.NextRetryAt = null;
        await _context.SaveChangesAsync(cancellationToken);

        return new SyncFileContentDto
        {
            RequestId = request.Id,
            ManifestId = request.ManifestId,
            FileId = request.ManifestId,
            RequesterNodeId = request.RequesterNodeId,
            SupplierNodeId = request.SupplierNodeId,
            TableName = request.Manifest.TableName,
            RecordKey = request.Manifest.RecordKey,
            FileRole = request.Manifest.FileRole,
            FileName = request.Manifest.FileName,
            ContentType = request.Manifest.ContentType,
            SizeBytes = fileBytes.LongLength,
            OriginalSizeBytes = request.Manifest.OriginalSizeBytes,
            Sha256 = request.Manifest.Sha256,
            TransportEncoding = nameof(SyncFileTransportEncoding.Identity).ToLowerInvariant(),
            IsPreprocessed = request.Manifest.IsPreprocessed,
            PreprocessProfile = request.Manifest.PreprocessProfile,
            Base64Content = Convert.ToBase64String(fileBytes)
        };
    }

    public async Task<SyncFileChunkSessionDto?> CreateDownloadSessionAsync(Guid manifestId, string requesterNodeId, CancellationToken cancellationToken)
    {
        var request = await GetActiveRequestAsync(manifestId, requesterNodeId, cancellationToken);
        if (request?.Manifest == null)
            return null;

        var relativePath = await ResolveOutgoingTransferPathAsync(request.Manifest, cancellationToken);
        if (string.IsNullOrWhiteSpace(relativePath) || !_syncFileStorageService.Exists(relativePath))
            return null;

        var actualSha256 = await _syncFileStorageService.ComputeSha256HexAsync(relativePath, cancellationToken);
        if (!string.Equals(actualSha256, request.Manifest.Sha256, StringComparison.OrdinalIgnoreCase))
            return null;

        var requester = await _context.SyncNodeTrackers.AsNoTracking().SingleOrDefaultAsync(n => n.NodeId == requesterNodeId, cancellationToken);
        var link = Enum.TryParse<NetworkType>(requester?.CurrentNetworkType, out var parsedLink) ? parsedLink : NetworkType.Satellite_VSAT;
        var chunkSizeBytes = Math.Min(GetFileTransferChunkSizeBytes(), SyncLinkPolicy.For(link).ChunkBytes);
        if (chunkSizeBytes <= 0) throw new InvalidOperationException("File transfer is paused on the offline link");
        var sizeBytes = _syncFileStorageService.GetFileSize(relativePath);
        var totalFileChunks = Math.Max(1, (int)((sizeBytes + chunkSizeBytes - 1) / chunkSizeBytes));
        var requestedChunkIndexes = await BuildRequestedChunkIndexesAsync(request, relativePath, chunkSizeBytes, totalFileChunks, cancellationToken);
        var isDeltaSession = requestedChunkIndexes.Count > 0 && requestedChunkIndexes.Count < totalFileChunks;
        var sessionChunkCount = isDeltaSession ? requestedChunkIndexes.Count : totalFileChunks;
        var now = DateTime.UtcNow;

        var session = await _context.SyncFileChunkSessions
            .AsTracking()
            .FirstOrDefaultAsync(s => s.RequestId == request.Id && s.Direction == "download", cancellationToken);

        var resetDownload = session == null || session.ExpiresAtUtc <= now || session.CompletedAtUtc != null ||
            session.ChunkSizeBytes != chunkSizeBytes || session.Sha256 != request.Manifest.Sha256 ||
            session.IsDeltaSession != isDeltaSession || session.RequestedChunkIndexesJson != (isDeltaSession ? System.Text.Json.JsonSerializer.Serialize(requestedChunkIndexes) : null);
        if (session == null)
        {
            session = new SyncFileChunkSession
            {
                Id = Guid.NewGuid(),
                RequestId = request.Id,
                ManifestId = request.ManifestId,
                FileId = request.ManifestId,
                RequesterNodeId = request.RequesterNodeId,
                SupplierNodeId = request.SupplierNodeId,
                Direction = "download",
                TableName = request.Manifest.TableName,
                RecordKey = request.Manifest.RecordKey,
                FileRole = request.Manifest.FileRole,
                FileName = request.Manifest.FileName,
                ContentType = request.Manifest.ContentType,
                SizeBytes = sizeBytes,
                Sha256 = request.Manifest.Sha256,
                ChunkSizeBytes = chunkSizeBytes,
                TotalChunks = sessionChunkCount,
                NextChunkIndex = 0,
                CommittedBytes = 0,
                IsDeltaSession = isDeltaSession,
                RequestedChunkIndexesJson = isDeltaSession ? System.Text.Json.JsonSerializer.Serialize(requestedChunkIndexes) : null,
                ReceiverBaseSha256 = request.ReceiverBaseSha256,
                SourcePath = relativePath,
                ResumeToken = GenerateResumeToken(),
                Status = SyncFileChunkSessionStatus.Active,
                CreatedAtUtc = now,
                LastActivityAtUtc = now,
                ExpiresAtUtc = now.AddHours(12)
            };
            await _context.SyncFileChunkSessions.AddAsync(session, cancellationToken);
        }
        else
        {
            session.ManifestId = request.ManifestId;
            session.FileId = request.ManifestId;
            session.RequesterNodeId = request.RequesterNodeId;
            session.SupplierNodeId = request.SupplierNodeId;
            session.TableName = request.Manifest.TableName;
            session.RecordKey = request.Manifest.RecordKey;
            session.FileRole = request.Manifest.FileRole;
            session.FileName = request.Manifest.FileName;
            session.ContentType = request.Manifest.ContentType;
            session.SizeBytes = sizeBytes;
            session.Sha256 = request.Manifest.Sha256;
            session.ChunkSizeBytes = chunkSizeBytes;
            session.TotalChunks = sessionChunkCount;
            session.IsDeltaSession = isDeltaSession;
            session.RequestedChunkIndexesJson = isDeltaSession ? System.Text.Json.JsonSerializer.Serialize(requestedChunkIndexes) : null;
            session.ReceiverBaseSha256 = request.ReceiverBaseSha256;
            session.SourcePath = relativePath;
            session.Status = SyncFileChunkSessionStatus.Active;
            session.LastActivityAtUtc = now;
            session.ExpiresAtUtc = now.AddHours(12);
            session.LastError = null;

            if (resetDownload)
            {
                session.NextChunkIndex = 0;
                session.CommittedBytes = 0;
                session.CompletedAtUtc = null;
                session.ResumeToken = GenerateResumeToken();
            }
        }

        await _context.SaveChangesAsync(cancellationToken);
        return MapSession(session);
    }

    public async Task<SyncFileChunkDto?> GetDownloadChunkAsync(Guid sessionId, string requesterNodeId, int chunkIndex, string resumeToken, CancellationToken cancellationToken)
    {
        var session = await _context.SyncFileChunkSessions
            .AsTracking()
            .FirstOrDefaultAsync(s => s.Id == sessionId && s.Direction == "download" && s.RequesterNodeId == requesterNodeId, cancellationToken);
        if (session == null)
            return null;

        if (session.ExpiresAtUtc <= DateTime.UtcNow)
        {
            session.Status = SyncFileChunkSessionStatus.Expired;
            session.LastError = "Download session expired";
            await _context.SaveChangesAsync(cancellationToken);
            return null;
        }

        if (!string.Equals(session.ResumeToken, resumeToken, StringComparison.Ordinal))
            return null;

        if (chunkIndex < 0 || chunkIndex >= session.TotalChunks)
            return null;

        if (string.IsNullOrWhiteSpace(session.SourcePath) || !_syncFileStorageService.Exists(session.SourcePath))
            return null;

        var requestedChunkIndexes = DeserializeIntList(session.RequestedChunkIndexesJson);
        var fileChunkIndex = session.IsDeltaSession && requestedChunkIndexes.Count > 0
            ? requestedChunkIndexes[chunkIndex]
            : chunkIndex;
        var offsetBytes = (long)fileChunkIndex * session.ChunkSizeBytes;
        var bytes = await _syncFileStorageService.ReadChunkAsync(session.SourcePath, offsetBytes, session.ChunkSizeBytes, cancellationToken);
        if (bytes.Length == 0 && fileChunkIndex < (requestedChunkIndexes.Count > 0 ? requestedChunkIndexes[^1] : session.TotalChunks - 1))
            return null;

        session.NextChunkIndex = Math.Max(session.NextChunkIndex, chunkIndex + 1);
        session.CommittedBytes = Math.Min(session.SizeBytes, Math.Max(session.CommittedBytes, ((long)chunkIndex + 1) * session.ChunkSizeBytes));
        session.LastActivityAtUtc = DateTime.UtcNow;
        session.LastError = null;
        if (chunkIndex == session.TotalChunks - 1)
        {
            session.Status = SyncFileChunkSessionStatus.Completed;
            session.CompletedAtUtc = DateTime.UtcNow;
        }

        await _context.SaveChangesAsync(cancellationToken);

        return new SyncFileChunkDto
        {
            SessionId = session.Id,
            RequestId = session.RequestId,
            ManifestId = session.ManifestId,
            FileId = session.FileId,
            RequesterNodeId = session.RequesterNodeId,
            SupplierNodeId = session.SupplierNodeId,
            ChunkIndex = chunkIndex,
            FileChunkIndex = fileChunkIndex,
            TotalChunks = session.TotalChunks,
            ChunkSizeBytes = session.ChunkSizeBytes,
            OffsetBytes = offsetBytes,
            ChunkSha256 = ComputeSha256Hex(bytes),
            ResumeToken = session.ResumeToken,
            IsLastChunk = chunkIndex == session.TotalChunks - 1,
            Base64Content = Convert.ToBase64String(bytes)
        };
    }

    public async Task<SyncFileTransferResultDto> AcceptUploadedFileAsync(SyncFileContentDto content, CancellationToken cancellationToken)
    {
        _logger.LogInformation("[AcceptUploadedFile] START: manifest={ManifestId}, table={Table}, record={RecordKey}, role={FileRole}, supplier={Supplier}",
            content.ManifestId, content.TableName, content.RecordKey, content.FileRole, content.SupplierNodeId);

        var request = await EnsureIncomingRequestAsync(content.RequestId, content.ManifestId, content.RequesterNodeId, content.SupplierNodeId, cancellationToken);
        var manifest = request.Manifest!;
        AssertManifestRecord(manifest, content.TableName, content.RecordKey, content.FileRole);
        AssertManifestContent(manifest, content.Sha256, content.SizeBytes);

        _logger.LogInformation("[AcceptUploadedFile] After EnsureIncoming: requestStatus={Status}, manifestSha={ManifestSha}, contentSha={ContentSha}, storagePath={StoragePath}",
            request.Status, manifest.Sha256, content.Sha256, manifest.StoragePath);

        if (request.Status == SyncFileRequestStatus.Completed &&
            string.Equals(manifest.Sha256, content.Sha256, StringComparison.OrdinalIgnoreCase) &&
            !string.IsNullOrWhiteSpace(manifest.StoragePath) &&
            _syncFileStorageService.Exists(manifest.StoragePath))
        {
            _logger.LogInformation("[AcceptUploadedFile] EARLY RETURN - already processed. ManifestId={ManifestId}", content.ManifestId);
            return new SyncFileTransferResultDto
            {
                Success = true,
                RequestId = request.Id,
                ManifestId = manifest.Id,
                FileId = content.FileId == Guid.Empty ? manifest.Id : content.FileId,
                StoragePath = manifest.StoragePath,
                Message = "File upload already processed",
                ProcessedAtUtc = DateTime.UtcNow
            };
        }

        manifest.TableName = content.TableName;
        manifest.RecordKey = content.RecordKey;
        manifest.FileRole = content.FileRole;
        manifest.FileName = content.FileName;
        manifest.ContentType = content.ContentType;
        manifest.SizeBytes = content.SizeBytes;
        manifest.OriginalSizeBytes = content.OriginalSizeBytes;
        manifest.Sha256 = content.Sha256;
        manifest.TransportEncoding = content.TransportEncoding;
        manifest.IsPreprocessed = content.IsPreprocessed;
        manifest.PreprocessProfile = content.PreprocessProfile;
        manifest.LastError = null;
        manifest.UpdatedAt = DateTime.UtcNow;

        var fileBytes = DecodeTransportBytes(content.Base64Content, content.TransportEncoding);
        var relativePath = await StoreIncomingFileAsync(
            content.TableName,
            content.FileRole,
            content.RecordKey,
            content.FileName,
            content.Sha256,
            content.SizeBytes,
            fileBytes,
            cancellationToken);

        _logger.LogInformation("[AcceptUploadedFile] File stored at: {RelativePath}. Calling UpdateEntityFilePathAsync...", relativePath);
        await UpdateEntityFilePathAsync(content.TableName, content.RecordKey, content.FileRole, relativePath, cancellationToken, content.SupplierNodeId);

        MarkRequestCompleted(request, manifest, relativePath);

        _logger.LogInformation("[AcceptUploadedFile] Calling SaveChangesAsync...");
        await _context.SaveChangesAsync(cancellationToken);
        _logger.LogInformation("[AcceptUploadedFile] SaveChangesAsync COMPLETED for manifest={ManifestId}", content.ManifestId);

        return new SyncFileTransferResultDto
        {
            Success = true,
            RequestId = request.Id,
            ManifestId = manifest.Id,
            FileId = content.FileId == Guid.Empty ? manifest.Id : content.FileId,
            StoragePath = relativePath,
            Message = "File upload accepted",
            ProcessedAtUtc = DateTime.UtcNow
        };
    }

    public async Task<SyncFileChunkSessionDto> RegisterUploadSessionAsync(SyncFileChunkSessionDto session, CancellationToken cancellationToken)
    {
        var request = await EnsureIncomingRequestAsync(session.RequestId, session.ManifestId, session.RequesterNodeId, session.SupplierNodeId, cancellationToken);
        var manifest = request.Manifest!;
        var now = DateTime.UtcNow;
        AssertManifestRecord(manifest, session.TableName, session.RecordKey, session.FileRole);
        AssertManifestContent(manifest, session.Sha256, session.SizeBytes);
        if (session.SizeBytes < 0 || session.ChunkSizeBytes <= 0 || session.TotalChunks <= 0)
            throw new InvalidOperationException("Invalid upload session dimensions");
        var fileChunkCount = Math.Max(1, checked((int)((session.SizeBytes + session.ChunkSizeBytes - 1) / session.ChunkSizeBytes)));
        if (session.IsDeltaSession)
        {
            if (session.RequestedChunkIndexes.Count != session.TotalChunks ||
                session.RequestedChunkIndexes.Distinct().Count() != session.TotalChunks ||
                session.RequestedChunkIndexes.Any(index => index < 0 || index >= fileChunkCount))
                throw new InvalidOperationException("Invalid delta chunk indexes");
            var basePath = await FindEntityFilePathAsync(session.TableName, session.RecordKey, cancellationToken);
            if (string.IsNullOrWhiteSpace(basePath) || !_syncFileStorageService.Exists(basePath) ||
                string.IsNullOrWhiteSpace(session.ReceiverBaseSha256) ||
                !string.Equals(await _syncFileStorageService.ComputeSha256HexAsync(basePath, cancellationToken), session.ReceiverBaseSha256, StringComparison.OrdinalIgnoreCase))
            {
                // Negotiate a full transfer when the saved receiver base is unavailable.
                session.IsDeltaSession = false;
                session.RequestedChunkIndexes = new();
                session.ReceiverBaseSha256 = null;
                session.TotalChunks = fileChunkCount;
            }
        }
        else if (session.TotalChunks != fileChunkCount)
            throw new InvalidOperationException("Invalid full upload chunk count");

        if (session.IsDeltaSession)
        {
            _logger.LogInformation(
                "Accepted delta upload session for manifest {ManifestId}: {ChangedChunks}/{TotalChunks} chunks requested",
                session.ManifestId,
                session.RequestedChunkIndexes.Count,
                session.TotalChunks);
        }

        manifest.TableName = session.TableName;
        manifest.RecordKey = session.RecordKey;
        manifest.FileRole = session.FileRole;
        manifest.FileName = session.FileName;
        manifest.ContentType = session.ContentType;
        manifest.SizeBytes = session.SizeBytes;
        manifest.Sha256 = session.Sha256;
        manifest.LastError = null;
        manifest.UpdatedAt = now;

        var uploadSession = await _context.SyncFileChunkSessions
            .AsTracking()
            .FirstOrDefaultAsync(s =>
                s.Id == session.SessionId ||
                (s.RequestId == request.Id && s.Direction == "upload" && s.Status != SyncFileChunkSessionStatus.Completed),
                cancellationToken);

        if (uploadSession != null)
        {
            if (uploadSession.Direction != "upload") throw new InvalidOperationException("Session direction mismatch");
            AssertSessionParticipants(uploadSession, request.Id, manifest.Id, request.RequesterNodeId, request.SupplierNodeId);
        }
        var resetStaging = uploadSession == null || uploadSession.ExpiresAtUtc <= now ||
            uploadSession.Status == SyncFileChunkSessionStatus.Failed || uploadSession.CompletedAtUtc != null ||
            !string.Equals(uploadSession.Sha256, session.Sha256, StringComparison.OrdinalIgnoreCase) ||
            uploadSession.ChunkSizeBytes != session.ChunkSizeBytes || uploadSession.SizeBytes != session.SizeBytes ||
            uploadSession.TotalChunks != session.TotalChunks ||
            uploadSession.IsDeltaSession != session.IsDeltaSession ||
            uploadSession.RequestedChunkIndexesJson != (session.RequestedChunkIndexes.Count == 0 ? null : System.Text.Json.JsonSerializer.Serialize(session.RequestedChunkIndexes));
        if (uploadSession == null)
        {
            uploadSession = new SyncFileChunkSession
            {
                Id = session.SessionId == Guid.Empty ? Guid.NewGuid() : session.SessionId,
                RequestId = request.Id,
                ManifestId = manifest.Id,
                FileId = session.FileId == Guid.Empty ? manifest.Id : session.FileId,
                RequesterNodeId = request.RequesterNodeId,
                SupplierNodeId = request.SupplierNodeId,
                Direction = "upload",
                TableName = session.TableName,
                RecordKey = session.RecordKey,
                FileRole = session.FileRole,
                FileName = session.FileName,
                ContentType = session.ContentType,
                SizeBytes = session.SizeBytes,
                Sha256 = session.Sha256,
                ChunkSizeBytes = session.ChunkSizeBytes,
                TotalChunks = session.TotalChunks,
                NextChunkIndex = 0,
                CommittedBytes = 0,
                IsDeltaSession = session.IsDeltaSession,
                RequestedChunkIndexesJson = session.RequestedChunkIndexes.Count == 0 ? null : System.Text.Json.JsonSerializer.Serialize(session.RequestedChunkIndexes),
                ReceiverBaseSha256 = session.ReceiverBaseSha256,
                StagingPath = _syncFileStorageService.CreateRelativeStagingPath(session.SessionId == Guid.Empty ? Guid.NewGuid() : session.SessionId, session.FileName),
                ResumeToken = GenerateResumeToken(),
                Status = SyncFileChunkSessionStatus.Active,
                CreatedAtUtc = now,
                LastActivityAtUtc = now,
                ExpiresAtUtc = now.AddHours(12)
            };
            uploadSession.StagingPath = _syncFileStorageService.CreateRelativeStagingPath(uploadSession.Id, session.FileName);
            await _context.SyncFileChunkSessions.AddAsync(uploadSession, cancellationToken);
        }
        else
        {
            uploadSession.RequestId = request.Id;
            uploadSession.ManifestId = manifest.Id;
            uploadSession.FileId = session.FileId == Guid.Empty ? manifest.Id : session.FileId;
            uploadSession.RequesterNodeId = request.RequesterNodeId;
            uploadSession.SupplierNodeId = request.SupplierNodeId;
            uploadSession.Direction = "upload";
            uploadSession.TableName = session.TableName;
            uploadSession.RecordKey = session.RecordKey;
            uploadSession.FileRole = session.FileRole;
            uploadSession.FileName = session.FileName;
            uploadSession.ContentType = session.ContentType;
            uploadSession.SizeBytes = session.SizeBytes;
            uploadSession.Sha256 = session.Sha256;
            uploadSession.ChunkSizeBytes = session.ChunkSizeBytes;
            uploadSession.TotalChunks = session.TotalChunks;
            uploadSession.IsDeltaSession = session.IsDeltaSession;
            uploadSession.RequestedChunkIndexesJson = session.RequestedChunkIndexes.Count == 0 ? null : System.Text.Json.JsonSerializer.Serialize(session.RequestedChunkIndexes);
            uploadSession.ReceiverBaseSha256 = session.ReceiverBaseSha256;
            uploadSession.StagingPath ??= _syncFileStorageService.CreateRelativeStagingPath(uploadSession.Id, session.FileName);
            uploadSession.Status = SyncFileChunkSessionStatus.Active;
            uploadSession.LastActivityAtUtc = now;
            uploadSession.ExpiresAtUtc = now.AddHours(12);
            uploadSession.LastError = null;

            if (resetStaging || !_syncFileStorageService.Exists(uploadSession.StagingPath))
            {
                resetStaging = true;
                uploadSession.NextChunkIndex = 0;
                uploadSession.CommittedBytes = 0;
                uploadSession.CompletedAtUtc = null;
                uploadSession.ResumeToken = GenerateResumeToken();
            }
        }

        if (resetStaging) await PrepareUploadSessionStagingAsync(uploadSession, cancellationToken);
        await _context.SaveChangesAsync(cancellationToken);
        return MapSession(uploadSession);
    }

    public async Task<SyncFileChunkResultDto> AcceptUploadedChunkAsync(SyncFileChunkDto chunk, CancellationToken cancellationToken)
    {
        var session = await _context.SyncFileChunkSessions
            .AsTracking()
            .FirstOrDefaultAsync(s => s.Id == chunk.SessionId && s.Direction == "upload", cancellationToken);
        if (session == null)
        {
            return BuildChunkResult(false, chunk, 0, 0, chunk.ResumeToken, false, "Upload session not found", null);
        }

        AssertSessionParticipants(session, chunk.RequestId, chunk.ManifestId, chunk.RequesterNodeId, chunk.SupplierNodeId);
        if (chunk.TotalChunks != session.TotalChunks || chunk.ChunkSizeBytes != session.ChunkSizeBytes ||
            (chunk.FileId != Guid.Empty && chunk.FileId != session.FileId))
            throw new InvalidOperationException("Chunk session dimensions mismatch");
        if (session.Status == SyncFileChunkSessionStatus.Failed)
            return BuildChunkResult(false, chunk, session.NextChunkIndex, session.CommittedBytes, session.ResumeToken, false, "Upload session must be renegotiated", null);
        if (session.ExpiresAtUtc <= DateTime.UtcNow)
        {
            session.Status = SyncFileChunkSessionStatus.Expired;
            session.LastError = "Upload session expired";
            await _context.SaveChangesAsync(cancellationToken);
            return BuildChunkResult(false, chunk, session.NextChunkIndex, session.CommittedBytes, session.ResumeToken, false, "Upload session expired", null);
        }

        if (!string.Equals(session.ResumeToken, chunk.ResumeToken, StringComparison.Ordinal))
        {
            return BuildChunkResult(false, chunk, session.NextChunkIndex, session.CommittedBytes, session.ResumeToken, false, "Resume token mismatch", null);
        }

        if (chunk.ChunkIndex < session.NextChunkIndex)
            return BuildChunkResult(true, chunk, session.NextChunkIndex, session.CommittedBytes, session.ResumeToken,
                session.Status == SyncFileChunkSessionStatus.Completed, "Chunk already committed", null);
        if (chunk.ChunkIndex != session.NextChunkIndex)
        {
            return BuildChunkResult(false, chunk, session.NextChunkIndex, session.CommittedBytes, session.ResumeToken, false, "Unexpected chunk index", null);
        }

        var requestedChunkIndexes = DeserializeIntList(session.RequestedChunkIndexesJson);
        var expectedFileChunkIndex = session.IsDeltaSession && requestedChunkIndexes.Count > session.NextChunkIndex
            ? requestedChunkIndexes[session.NextChunkIndex]
            : session.NextChunkIndex;
        if (chunk.FileChunkIndex != expectedFileChunkIndex)
        {
            return BuildChunkResult(false, chunk, session.NextChunkIndex, session.CommittedBytes, session.ResumeToken, false, "Unexpected file chunk index", null);
        }

        var bytes = Convert.FromBase64String(chunk.Base64Content);
        var expectedOffset = (long)expectedFileChunkIndex * session.ChunkSizeBytes;
        if (chunk.OffsetBytes != expectedOffset || chunk.IsLastChunk != (chunk.ChunkIndex == session.TotalChunks - 1))
            throw new InvalidOperationException("Chunk position mismatch");
        var expectedLength = (int)Math.Min(session.ChunkSizeBytes, session.SizeBytes - expectedOffset);
        if (expectedLength < 0 || bytes.Length != expectedLength)
            return BuildChunkResult(false, chunk, session.NextChunkIndex, session.CommittedBytes, session.ResumeToken, false, "Invalid chunk length", null);
        if (!string.Equals(ComputeSha256Hex(bytes), chunk.ChunkSha256, StringComparison.OrdinalIgnoreCase))
        {
            session.LastError = $"Chunk checksum mismatch at index {chunk.ChunkIndex}";
            await _context.SaveChangesAsync(cancellationToken);
            return BuildChunkResult(false, chunk, session.NextChunkIndex, session.CommittedBytes, session.ResumeToken, false, session.LastError, null);
        }

        if (string.IsNullOrWhiteSpace(session.StagingPath))
            session.StagingPath = _syncFileStorageService.CreateRelativeStagingPath(session.Id, session.FileName);

        if (session.IsDeltaSession && !_syncFileStorageService.Exists(session.StagingPath))
            throw new InvalidOperationException("Delta staging is missing; renegotiate the upload session");

        var offsetBytes = (long)expectedFileChunkIndex * session.ChunkSizeBytes;
        await _syncFileStorageService.WriteChunkAsync(session.StagingPath, offsetBytes, bytes, cancellationToken);

        session.NextChunkIndex = chunk.ChunkIndex + 1;
        session.CommittedBytes += bytes.LongLength;
        session.LastActivityAtUtc = DateTime.UtcNow;
        session.Status = SyncFileChunkSessionStatus.Active;
        session.LastError = null;

        string? storagePath = null;
        var isComplete = session.NextChunkIndex >= session.TotalChunks;
        if (isComplete)
        {
            try
            {
                storagePath = await CompleteUploadedChunkSessionAsync(session, cancellationToken);
                isComplete = true;
            }
            catch (Exception ex)
            {
                session.Status = SyncFileChunkSessionStatus.Failed;
                session.LastError = ex.Message;
                await _context.SaveChangesAsync(cancellationToken);
                return BuildChunkResult(false, chunk, session.NextChunkIndex, session.CommittedBytes, session.ResumeToken, false, ex.Message, null);
            }
        }

        await _context.SaveChangesAsync(cancellationToken);
        if (isComplete)
        {
            try { await _syncFileStorageService.DeleteIfExistsAsync(session.StagingPath!, cancellationToken); }
            catch (Exception ex) { _logger.LogWarning(ex, "Completed staging cleanup deferred for session {SessionId}", session.Id); }
        }
        return BuildChunkResult(true, chunk, session.NextChunkIndex, session.CommittedBytes, session.ResumeToken, isComplete, isComplete ? "Chunk upload completed" : "Chunk accepted", storagePath);
    }

    public async Task<SyncFileTransferResultDto> AcknowledgeReceiptAsync(SyncFileTransferAckDto ack, CancellationToken cancellationToken)
    {
        var request = await _context.SyncFileTransferRequests
            .AsTracking()
            .Include(r => r.Manifest)
            .FirstOrDefaultAsync(r => r.Id == ack.RequestId, cancellationToken);

        request ??= await _context.SyncFileTransferRequests
            .AsTracking()
            .Include(r => r.Manifest)
            .FirstOrDefaultAsync(r =>
                r.ManifestId == ack.ManifestId &&
                r.RequesterNodeId == ack.RequesterNodeId &&
                r.SupplierNodeId == ack.SupplierNodeId,
                cancellationToken);

        if (request?.Manifest == null)
        {
            return new SyncFileTransferResultDto
            {
                Success = false,
                RequestId = ack.RequestId,
                ManifestId = ack.ManifestId,
                FileId = ack.FileId,
                Message = "File request not found",
                ProcessedAtUtc = DateTime.UtcNow
            };
        }

        AssertRequestParticipants(request, ack.ManifestId, ack.RequesterNodeId, ack.SupplierNodeId);
        if (!string.Equals(request.Manifest.Sha256, ack.Sha256, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("File acknowledgement content mismatch");
        request.Status = SyncFileRequestStatus.Completed;
        request.CompletedAtUtc = ack.VerifiedAtUtc == default ? DateTime.UtcNow : ack.VerifiedAtUtc;
        request.NextRetryAt = null;
        request.LastError = null;

        request.Manifest.TransferStatus = SyncFileTransferStatus.Verified;
        request.Manifest.VerifiedAtUtc = request.CompletedAtUtc;
        request.Manifest.LastError = null;
        // The receiver path belongs to its own filesystem; retain the local source path.
        request.Manifest.UpdatedAt = DateTime.UtcNow;

        await _context.SaveChangesAsync(cancellationToken);

        return new SyncFileTransferResultDto
        {
            Success = true,
            RequestId = request.Id,
            ManifestId = request.ManifestId,
            FileId = ack.FileId == Guid.Empty ? request.ManifestId : ack.FileId,
            StoragePath = request.Manifest.StoragePath,
            Message = "File receipt acknowledged",
            ProcessedAtUtc = DateTime.UtcNow
        };
    }

    public async Task<SyncFileBundleResultDto> AcceptUploadedBundleAsync(SyncFileBundleUploadDto bundle, CancellationToken cancellationToken)
    {
        _logger.LogInformation(
            "Accepting bundle upload {BundleId} with {FileCount} files from {SupplierNodeId} to {RequesterNodeId}",
            bundle.BundleId,
            bundle.Items.Count,
            bundle.SupplierNodeId,
            bundle.RequesterNodeId);

        var archiveBytes = DecodeTransportBytes(bundle.Base64Archive, bundle.ArchiveEncoding);
        using var archiveStream = new MemoryStream(archiveBytes);
        using var archive = new ZipArchive(archiveStream, ZipArchiveMode.Read, leaveOpen: false);

        var acceptedCount = 0;
        foreach (var item in bundle.Items)
        {
            var entry = archive.GetEntry(item.FileId == Guid.Empty ? item.ManifestId.ToString("N") : item.FileId.ToString("N"));
            if (entry == null)
                continue;

            await using var entryStream = entry.Open();
            await using var output = new MemoryStream();
            await entryStream.CopyToAsync(output, cancellationToken);

            var request = await EnsureIncomingRequestAsync(item.RequestId, item.ManifestId, bundle.RequesterNodeId, bundle.SupplierNodeId, cancellationToken);
            AssertManifestRecord(request.Manifest!, item.TableName, item.RecordKey, item.FileRole);
            AssertManifestContent(request.Manifest!, item.Sha256, item.SizeBytes);
            var relativePath = await StoreIncomingFileAsync(
                item.TableName,
                item.FileRole,
                item.RecordKey,
                item.FileName,
                item.Sha256,
                item.SizeBytes,
                output.ToArray(),
                cancellationToken);

            await UpdateEntityFilePathAsync(item.TableName, item.RecordKey, item.FileRole, relativePath, cancellationToken, bundle.SupplierNodeId);
            MarkRequestCompleted(request, request.Manifest!, relativePath);
            acceptedCount++;
        }

        await _context.SaveChangesAsync(cancellationToken);
        return new SyncFileBundleResultDto
        {
            Success = acceptedCount == bundle.Items.Count,
            BundleId = bundle.BundleId,
            AcceptedCount = acceptedCount,
            Message = acceptedCount == bundle.Items.Count ? "Bundle upload accepted" : "Bundle upload partially accepted",
            ProcessedAtUtc = DateTime.UtcNow
        };
    }

    private async Task<SyncFileTransferRequest?> GetActiveRequestAsync(Guid manifestId, string requesterNodeId, CancellationToken cancellationToken)
    {
        return await _context.SyncFileTransferRequests
            .AsTracking()
            .Include(r => r.Manifest)
            .Where(r => r.ManifestId == manifestId && r.RequesterNodeId == requesterNodeId)
            .Where(r => r.Status == SyncFileRequestStatus.Pending || r.Status == SyncFileRequestStatus.Deferred || r.Status == SyncFileRequestStatus.Completed)
            .OrderByDescending(r => r.RequestedAtUtc)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private async Task<SyncFileTransferRequest> EnsureIncomingRequestAsync(Guid requestId, Guid manifestId, string requesterNodeId, string supplierNodeId, CancellationToken cancellationToken)
    {
        var request = await _context.SyncFileTransferRequests
            .AsTracking()
            .Include(r => r.Manifest)
            .FirstOrDefaultAsync(r => r.Id == requestId, cancellationToken);

        request ??= await _context.SyncFileTransferRequests
            .AsTracking()
            .Include(r => r.Manifest)
            .FirstOrDefaultAsync(r => r.ManifestId == manifestId && r.RequesterNodeId == requesterNodeId && r.SupplierNodeId == supplierNodeId, cancellationToken);

        if (request == null)
            throw new InvalidOperationException("File metadata and request must be synchronized before uploading content");

        else
        {
            AssertRequestParticipants(request, manifestId, requesterNodeId, supplierNodeId);
            AssertManifestParticipants(request.Manifest!, requesterNodeId, supplierNodeId);
            request.RequesterNodeId = requesterNodeId;
            request.SupplierNodeId = supplierNodeId;
            // Preserve completed receipts when the supplier retries after a lost response.
            request.NextRetryAt = null;
            request.LastError = null;
            if (request.Manifest != null)
            {
                request.Manifest.UpdatedAt = DateTime.UtcNow;
            }
        }

        AssertManifestParticipants(request.Manifest!, requesterNodeId, supplierNodeId);
        return request;
    }

    private static void AssertManifestParticipants(SyncFileManifest manifest, string requester, string supplier)
    {
        if (manifest.OwnerNodeId != supplier ||
            (manifest.ReceiverNodeId != requester && manifest.ReceiverNodeId != "*"))
            throw new InvalidOperationException("File manifest belongs to another node");
    }

    private static void AssertManifestRecord(SyncFileManifest manifest, string table, string key, string role)
    {
        if ((!string.IsNullOrEmpty(manifest.TableName) && manifest.TableName != table) ||
            (!string.IsNullOrEmpty(manifest.RecordKey) && manifest.RecordKey != key) ||
            (!string.IsNullOrEmpty(manifest.FileRole) && manifest.FileRole != role))
            throw new InvalidOperationException("File manifest record mismatch");
    }

    private static void AssertManifestContent(SyncFileManifest manifest, string hash, long size)
    {
        if (!string.IsNullOrEmpty(manifest.Sha256) &&
            (!string.Equals(manifest.Sha256, hash, StringComparison.OrdinalIgnoreCase) || manifest.SizeBytes != size))
            throw new InvalidOperationException("File content changed; synchronize new metadata before transferring it");
    }

    private static void AssertRequestParticipants(SyncFileTransferRequest request, Guid manifest, string requester, string supplier)
    {
        if (request.ManifestId != manifest || request.RequesterNodeId != requester || request.SupplierNodeId != supplier)
            throw new InvalidOperationException("File request belongs to another transfer");
    }

    private static void AssertSessionParticipants(SyncFileChunkSession session, Guid request, Guid manifest, string requester, string supplier)
    {
        if (session.RequestId != request || session.ManifestId != manifest || session.RequesterNodeId != requester || session.SupplierNodeId != supplier)
            throw new InvalidOperationException("File session belongs to another transfer");
    }

    private async Task<string?> ResolveOutgoingTransferPathAsync(SyncFileManifest manifest, CancellationToken cancellationToken)
    {
        foreach (var candidate in new[] { manifest.StoragePath, manifest.SourcePath, await FindEntityFilePathAsync(manifest.TableName, manifest.RecordKey, cancellationToken) })
        {
            if (string.IsNullOrWhiteSpace(candidate))
                continue;

            if (_syncFileStorageService.Exists(candidate))
                return candidate;
        }

        return null;
    }

    private async Task<string?> FindEntityFilePathAsync(string tableName, string recordKey, CancellationToken cancellationToken)
    {
        object? entity = null;

        if (tableName == "crew_member" && Guid.TryParse(recordKey, out var crewId))
            entity = await _context.CrewMembers.FindAsync(new object[] { crewId }, cancellationToken);
        else if (tableName == "crew_certificate")
        {
            if (int.TryParse(recordKey, out var crewCertificateId))
                entity = await _context.CrewCertificates.FindAsync(new object[] { crewCertificateId }, cancellationToken);
            else
                entity = await _context.CrewCertificates.FirstOrDefaultAsync(c => c.CertificateNumber == recordKey, cancellationToken);
        }
        else if (Guid.TryParse(recordKey, out var documentId))
            entity = tableName switch
            {
                "travel_document" => await _context.TravelDocuments.FindAsync(new object[] { documentId }, cancellationToken),
                "seafarer_document" => await _context.SeafarerDocuments.FindAsync(new object[] { documentId }, cancellationToken),
                "employment_document" => await _context.EmploymentDocuments.FindAsync(new object[] { documentId }, cancellationToken),
                "health_document" => await _context.HealthDocuments.FindAsync(new object[] { documentId }, cancellationToken),
                "sms_procedure" or "sms_procedures" => await _context.SmsProcedures.FindAsync(new object[] { documentId }, cancellationToken),
                _ => null
            };

        if (entity == null)
            return null;

        foreach (var propertyName in GetFilePathPropertyCandidates(manifestFileRole: null))
        {
            var property = entity.GetType().GetProperty(propertyName);
            if (property?.PropertyType != typeof(string))
                continue;

            var value = property.GetValue(entity) as string;
            if (!string.IsNullOrWhiteSpace(value))
                return value;
        }

        return null;
    }

    private async Task UpdateEntityFilePathAsync(string tableName, string recordKey, string fileRole, string relativePath, CancellationToken cancellationToken, string? supplierNodeId = null)
    {
        _logger.LogInformation("[UpdateEntityFilePath] START: table={Table}, recordKey={RecordKey}, fileRole={FileRole}, relativePath={RelativePath}",
            tableName, recordKey, fileRole, relativePath);

        if (tableName == "maintenance_history")
        {
            if (supplierNodeId == null) throw new InvalidOperationException("Maintenance file supplier identity is required.");
            var identity = await _context.SyncRecordIdentities.AsNoTracking().SingleOrDefaultAsync(m =>
                m.OriginNode == supplierNodeId && m.TableName == tableName && m.LocalKey == recordKey, cancellationToken)
                ?? throw new InvalidOperationException("Maintenance file record has no verified local key mapping.");
            var key = Guid.Parse(identity.ShoreKey);
            var history = await _context.MaintenanceHistories.AsTracking().SingleOrDefaultAsync(h => h.Id == key, cancellationToken)
                ?? throw new InvalidOperationException("Maintenance history file record is missing.");
            if (history.OriginNode != supplierNodeId) throw new InvalidOperationException("Maintenance file belongs to another vessel.");
            history.ReportSnapshot = MaintenanceHistorySyncFiles.Rewrite(history.ReportSnapshot, fileRole, relativePath);
            return;
        }
        if (tableName == "task_deferral_request")
        {
            if (supplierNodeId == null) throw new InvalidOperationException("Deferral file supplier identity is required.");
            var identity = await _context.SyncRecordIdentities.AsNoTracking().SingleOrDefaultAsync(m =>
                m.OriginNode == supplierNodeId && m.TableName == tableName && m.LocalKey == recordKey, cancellationToken);
            if (identity == null) throw new InvalidOperationException("Deferral file record has no verified local key mapping.");
            var key = Guid.Parse(identity.ShoreKey);
            var request = await _context.TaskDeferralRequests.AsTracking().SingleOrDefaultAsync(r => r.Id == key, cancellationToken)
                ?? throw new InvalidOperationException("Deferral file record is missing.");
            if (request.VesselId != await VesselSyncIdentity.ResolveVesselIdAsync(_context, supplierNodeId))
                throw new InvalidOperationException("Deferral file belongs to another vessel.");
            request.Attachments = DeferralSyncFiles.RewriteAttachments(request.Attachments, fileRole, relativePath);
            request.ClassPermissionLetter = DeferralSyncFiles.RewriteLetter(request.ClassPermissionLetter, fileRole, relativePath);
            return;
        }

        object? entity = null;

        if (tableName == "crew_member" && Guid.TryParse(recordKey, out var crewId))
            entity = await _context.CrewMembers.AsNoTracking().FirstOrDefaultAsync(e => e.Id == crewId, cancellationToken);
        else if (tableName == "crew_certificate")
        {
            if (int.TryParse(recordKey, out var crewCertificateId))
                entity = await _context.CrewCertificates.AsNoTracking().FirstOrDefaultAsync(e => e.Id == crewCertificateId, cancellationToken);
            else
                entity = await _context.CrewCertificates.AsNoTracking().FirstOrDefaultAsync(c => c.CertificateNumber == recordKey, cancellationToken);
        }
        else if (Guid.TryParse(recordKey, out var documentId))
            entity = tableName switch
            {
                "travel_document" => (object?)await _context.TravelDocuments.AsNoTracking().FirstOrDefaultAsync(e => e.Id == documentId, cancellationToken),
                "seafarer_document" => await _context.SeafarerDocuments.AsNoTracking().FirstOrDefaultAsync(e => e.Id == documentId, cancellationToken),
                "employment_document" => await _context.EmploymentDocuments.AsNoTracking().FirstOrDefaultAsync(e => e.Id == documentId, cancellationToken),
                "health_document" => await _context.HealthDocuments.AsNoTracking().FirstOrDefaultAsync(e => e.Id == documentId, cancellationToken),
                "sms_procedure" or "sms_procedures" => await _context.SmsProcedures.AsNoTracking().FirstOrDefaultAsync(e => e.Id == documentId, cancellationToken),
                _ => null
            };

        if (entity == null)
        {
            _logger.LogWarning("[UpdateEntityFilePath] Entity NOT FOUND: table={Table}, recordKey={RecordKey}", tableName, recordKey);
            return;
        }

        _logger.LogInformation("[UpdateEntityFilePath] Entity found: type={EntityType}", entity.GetType().Name);

        foreach (var propertyName in GetFilePathPropertyCandidates(fileRole))
        {
            var property = entity.GetType().GetProperty(propertyName);
            if (property?.CanWrite == true && property.PropertyType == typeof(string))
            {
                var oldValue = property.GetValue(entity) as string;

                // Find if this entity is already tracked by the current DbContext (same type + same PK).
                // This happens when a bundle contains multiple files for the same record
                // (e.g. keyed by CertificateNumber "MFA-0001" and by int Id 31 in separate items).
                // Calling Attach() on a second object instance with the same PK throws
                // "another instance with the same key value is already being tracked".
                var clrType = entity.GetType();
                var pkProps = _context.Model.FindEntityType(clrType)?.FindPrimaryKey()?.Properties;
                EntityEntry entryToUse;

                var existingTracked = pkProps != null
                    ? _context.ChangeTracker.Entries()
                        .Where(e => e.Metadata.ClrType == clrType)
                        .FirstOrDefault(e => pkProps.All(pk =>
                            Equals(pk.PropertyInfo?.GetValue(e.Entity),
                                   pk.PropertyInfo?.GetValue(entity))))
                    : null;

                if (existingTracked != null)
                {
                    // Reuse the already-tracked instance — update its property directly
                    property.SetValue(existingTracked.Entity, relativePath);
                    entryToUse = existingTracked;
                }
                else
                {
                    // Not yet tracked — attach safely
                    entryToUse = _context.Attach(entity);
                    property.SetValue(entryToUse.Entity, relativePath);
                }

                // Mark only this specific property as modified (don't touch other fields)
                entryToUse.Property(propertyName).IsModified = true;
                _logger.LogInformation("[UpdateEntityFilePath] SET {Property}: '{OldValue}' → '{NewValue}' (entity marked Modified)",
                    propertyName, property.GetValue(entryToUse.Entity) as string, relativePath);
                return;
            }
        }

        _logger.LogWarning("[UpdateEntityFilePath] No writable property found for fileRole={FileRole}, candidates={Candidates}",
            fileRole, string.Join(",", GetFilePathPropertyCandidates(fileRole)));
    }

    private async Task ValidateStoredFileAsync(string relativePath, string expectedSha256, long expectedSizeBytes, CancellationToken cancellationToken)
    {
        var actualSha256 = await _syncFileStorageService.ComputeSha256HexAsync(relativePath, cancellationToken);
        if (!string.Equals(actualSha256, expectedSha256, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Stored file checksum mismatch");

        if (expectedSizeBytes > 0 && _syncFileStorageService.GetFileSize(relativePath) != expectedSizeBytes)
            throw new InvalidOperationException("Stored file size mismatch");
    }

    private async Task<string> StoreIncomingFileAsync(
        string tableName,
        string fileRole,
        string recordKey,
        string fileName,
        string expectedSha256,
        long expectedSizeBytes,
        byte[] fileBytes,
        CancellationToken cancellationToken)
    {
        var relativePath = _syncFileStorageService.CreateRelativeStoragePath(tableName, fileRole, recordKey, fileName, expectedSha256);
        if (_syncFileStorageService.Exists(relativePath))
        {
            await ValidateStoredFileAsync(relativePath, expectedSha256, expectedSizeBytes, cancellationToken);
            return relativePath;
        }

        await _syncFileStorageService.WriteAllBytesAsync(relativePath, fileBytes, cancellationToken);
        try
        {
            await ValidateStoredFileAsync(relativePath, expectedSha256, expectedSizeBytes, cancellationToken);
            return relativePath;
        }
        catch
        {
            await _syncFileStorageService.DeleteIfExistsAsync(relativePath, cancellationToken);
            throw;
        }
    }

    private async Task<string> CompleteUploadedChunkSessionAsync(SyncFileChunkSession session, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(session.StagingPath) || !_syncFileStorageService.Exists(session.StagingPath))
            throw new InvalidOperationException("Chunk staging file missing");

        await ValidateStoredFileAsync(session.StagingPath, session.Sha256, session.SizeBytes, cancellationToken);

        var relativePath = _syncFileStorageService.CreateRelativeStoragePath(session.TableName, session.FileRole, session.RecordKey, session.FileName, session.Sha256);
        if (_syncFileStorageService.Exists(relativePath))
        {
            await ValidateStoredFileAsync(relativePath, session.Sha256, session.SizeBytes, cancellationToken);
        }
        else
        {
            await _syncFileStorageService.CopyAsync(session.StagingPath, relativePath, cancellationToken);
        }
        await UpdateEntityFilePathAsync(session.TableName, session.RecordKey, session.FileRole, relativePath, cancellationToken, session.SupplierNodeId);

        var request = await _context.SyncFileTransferRequests
            .AsTracking()
            .Include(r => r.Manifest)
            .FirstOrDefaultAsync(r => r.Id == session.RequestId, cancellationToken);
        if (request?.Manifest == null)
            throw new InvalidOperationException("Chunk upload request not found");

        MarkRequestCompleted(request, request.Manifest, relativePath);

        session.StoragePath = relativePath;
        session.Status = SyncFileChunkSessionStatus.Completed;
        session.CompletedAtUtc = DateTime.UtcNow;
        session.LastError = null;

        return relativePath;
    }

    private void MarkRequestCompleted(SyncFileTransferRequest request, SyncFileManifest manifest, string relativePath)
    {
        request.Status = SyncFileRequestStatus.Completed;
        request.CompletedAtUtc = DateTime.UtcNow;
        request.NextRetryAt = null;
        request.LastError = null;

        manifest.StoragePath = relativePath;
        manifest.TransferStatus = SyncFileTransferStatus.Verified;
        manifest.VerifiedAtUtc = DateTime.UtcNow;
        manifest.LastError = null;
        manifest.UpdatedAt = DateTime.UtcNow;
    }

    private SyncFileChunkSessionDto MapSession(SyncFileChunkSession session)
    {
        return new SyncFileChunkSessionDto
        {
            SessionId = session.Id,
            RequestId = session.RequestId,
            ManifestId = session.ManifestId,
            FileId = session.FileId,
            RequesterNodeId = session.RequesterNodeId,
            SupplierNodeId = session.SupplierNodeId,
            TableName = session.TableName,
            RecordKey = session.RecordKey,
            FileRole = session.FileRole,
            FileName = session.FileName,
            ContentType = session.ContentType,
            SizeBytes = session.SizeBytes,
            Sha256 = session.Sha256,
            ChunkSizeBytes = session.ChunkSizeBytes,
            TotalChunks = session.TotalChunks,
            NextChunkIndex = session.NextChunkIndex,
            CommittedBytes = session.CommittedBytes,
            IsDeltaSession = session.IsDeltaSession,
            DeltaBlockSizeBytes = session.ChunkSizeBytes,
            ReceiverBaseSha256 = session.ReceiverBaseSha256,
            RequestedChunkIndexes = DeserializeIntList(session.RequestedChunkIndexesJson),
            ResumeToken = session.ResumeToken,
            ExpiresAtUtc = session.ExpiresAtUtc
        };
    }

    private async Task<List<int>> BuildRequestedChunkIndexesAsync(
        SyncFileTransferRequest request,
        string relativePath,
        int chunkSizeBytes,
        int totalFileChunks,
        CancellationToken cancellationToken)
    {
        if (!request.PreferDeltaTransfer || request.DeltaBlockSizeBytes != chunkSizeBytes)
            return new List<int>();

        var receiverBlockHashes = DeserializeStringList(request.ReceiverBlockHashesJson);
        if (receiverBlockHashes.Count != totalFileChunks)
            return new List<int>();

        var senderBlockHashes = await ComputeBlockHashesAsync(relativePath, chunkSizeBytes, cancellationToken);
        if (senderBlockHashes.Count != receiverBlockHashes.Count)
            return new List<int>();

        var changed = new List<int>();
        for (var index = 0; index < senderBlockHashes.Count; index++)
        {
            if (!string.Equals(senderBlockHashes[index], receiverBlockHashes[index], StringComparison.OrdinalIgnoreCase))
                changed.Add(index);
        }

        return changed;
    }

    private async Task PrepareUploadSessionStagingAsync(SyncFileChunkSession session, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(session.StagingPath))
            session.StagingPath = _syncFileStorageService.CreateRelativeStagingPath(session.Id, session.FileName);

        await _syncFileStorageService.DeleteIfExistsAsync(session.StagingPath, cancellationToken);
        if (!session.IsDeltaSession)
            return;

        var basePath = await FindEntityFilePathAsync(session.TableName, session.RecordKey, cancellationToken);
        if (string.IsNullOrWhiteSpace(basePath) || !_syncFileStorageService.Exists(basePath) || string.IsNullOrWhiteSpace(session.ReceiverBaseSha256))
            throw new InvalidOperationException("Delta base is unavailable; renegotiate a full transfer");

        var baseSha256 = await _syncFileStorageService.ComputeSha256HexAsync(basePath, cancellationToken);
        if (!string.Equals(baseSha256, session.ReceiverBaseSha256, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Delta base changed; renegotiate a full transfer");

        await _syncFileStorageService.CopyAsync(basePath, session.StagingPath, cancellationToken);
    }

    private static byte[] DecodeTransportBytes(string base64Payload, string? transportEncoding)
    {
        var rawBytes = Convert.FromBase64String(base64Payload);
        if (string.Equals(transportEncoding, nameof(SyncFileTransportEncoding.Gzip).ToLowerInvariant(), StringComparison.OrdinalIgnoreCase))
        {
            using var input = new MemoryStream(rawBytes);
            using var gzip = new GZipStream(input, CompressionMode.Decompress);
            using var output = new MemoryStream();
            gzip.CopyTo(output);
            return output.ToArray();
        }

        return rawBytes;
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

    private static List<string> DeserializeStringList(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return new List<string>();

        return System.Text.Json.JsonSerializer.Deserialize<List<string>>(json) ?? new List<string>();
    }

    private static List<int> DeserializeIntList(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return new List<int>();

        return System.Text.Json.JsonSerializer.Deserialize<List<int>>(json) ?? new List<int>();
    }

    private static SyncFileChunkResultDto BuildChunkResult(
        bool success,
        SyncFileChunkDto chunk,
        int nextChunkIndex,
        long committedBytes,
        string resumeToken,
        bool isComplete,
        string message,
        string? storagePath)
    {
        return new SyncFileChunkResultDto
        {
            Success = success,
            SessionId = chunk.SessionId,
            RequestId = chunk.RequestId,
            ManifestId = chunk.ManifestId,
            FileId = chunk.FileId,
            ChunkIndex = chunk.ChunkIndex,
            NextChunkIndex = nextChunkIndex,
            TotalChunks = chunk.TotalChunks,
            CommittedBytes = committedBytes,
            ResumeToken = resumeToken,
            IsComplete = isComplete,
            Message = message,
            StoragePath = storagePath,
            ProcessedAtUtc = DateTime.UtcNow
        };
    }

    private int GetFileTransferChunkSizeBytes()
    {
        return Math.Max(1024, _configuration.GetValue("Sync:FileTransferChunkSizeBytes", 256 * 1024));
    }

    private static string[] GetFilePathPropertyCandidates(string? manifestFileRole)
    {
        return string.Equals(manifestFileRole, "avatar", StringComparison.OrdinalIgnoreCase)
            ? new[] { "PhotoUrl", "FileUrl", "FilePath", "DocumentFilePath" }
            : new[] { "DocumentFilePath", "FilePath", "FileUrl", "PhotoUrl" };
    }

    private static string GenerateResumeToken()
    {
        return Convert.ToHexString(RandomNumberGenerator.GetBytes(24)).ToLowerInvariant();
    }

    private static string ComputeSha256Hex(byte[] bytes)
    {
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
