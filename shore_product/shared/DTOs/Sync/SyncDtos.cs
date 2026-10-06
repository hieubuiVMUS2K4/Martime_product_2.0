namespace Maritime.Shared.DTOs.Sync;

using Maritime.Shared.Models.Sync;

/// <summary>
/// Shared sync payload format — used for both Edge→Shore and Shore→Edge communication.
/// This DTO is the wire format for sync queue items.
/// </summary>
public class SyncQueueItemDto
{
    public Guid EventId { get; set; }
    public Guid StreamId { get; set; }
    public SyncPriority Priority { get; set; } = SyncPriority.Low;
    /// <summary>Outbox row Id — used by edge to acknowledge delivery with exact IDs.</summary>
    public long OutboxId { get; set; }
    public string TableName { get; set; } = string.Empty;
    public string RecordKey { get; set; } = string.Empty;
    public string ActionType { get; set; } = "CREATE"; // CREATE, UPDATE, DELETE
    public string Payload { get; set; } = string.Empty; // JSON
    public string OriginNode { get; set; } = string.Empty;
    public long SyncVersion { get; set; }
    public DateTime Timestamp { get; set; } = DateTime.UtcNow;

    /// <summary>File metadata references associated with this business record.</summary>
    public List<SyncFileReferenceDto> FileRefs { get; set; } = new();
}

/// <summary>
/// Metadata-only description of a file related to a sync record.
/// The actual file bytes are transferred later through a dedicated file transfer flow.
/// </summary>
public class SyncFileReferenceDto
{
    public Guid FileId { get; set; }
    public string FileRole { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string? ContentType { get; set; }
    public long SizeBytes { get; set; }
    public long? OriginalSizeBytes { get; set; }
    public string Sha256 { get; set; } = string.Empty;
    public string TransportEncoding { get; set; } = nameof(SyncFileTransportEncoding.Identity).ToLowerInvariant();
    public bool IsPreprocessed { get; set; }
    public string? PreprocessProfile { get; set; }
    public string? SourcePath { get; set; }
    public DateTime CapturedAtUtc { get; set; } = DateTime.UtcNow;
    public SyncPriority TransferPriority { get; set; } = SyncPriority.Low;
}

/// <summary>
/// Metadata for a pending file transfer request.
/// The receiver publishes this to the supplier so the supplier can upload bytes on demand.
/// </summary>
public class SyncFileTransferRequestDto
{
    public Guid RequestId { get; set; }
    public Guid ManifestId { get; set; }
    public Guid FileId { get; set; }
    public string RequesterNodeId { get; set; } = string.Empty;
    public string SupplierNodeId { get; set; } = string.Empty;
    public string TableName { get; set; } = string.Empty;
    public string RecordKey { get; set; } = string.Empty;
    public string FileRole { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string? ContentType { get; set; }
    public long SizeBytes { get; set; }
    public string Sha256 { get; set; } = string.Empty;
    public string? SourcePath { get; set; }
    public SyncPriority TransferPriority { get; set; } = SyncPriority.Low;
    public bool PreferDeltaTransfer { get; set; }
    public int? DeltaBlockSizeBytes { get; set; }
    public string? ReceiverBaseSha256 { get; set; }
    public List<string> ReceiverBlockHashes { get; set; } = new();
    public DateTime RequestedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// JSON payload carrying on-demand file bytes.
/// Phase 2 uses base64 content and does not yet implement chunking.
/// </summary>
public class SyncFileContentDto
{
    public Guid RequestId { get; set; }
    public Guid ManifestId { get; set; }
    public Guid FileId { get; set; }
    public string RequesterNodeId { get; set; } = string.Empty;
    public string SupplierNodeId { get; set; } = string.Empty;
    public string TableName { get; set; } = string.Empty;
    public string RecordKey { get; set; } = string.Empty;
    public string FileRole { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string? ContentType { get; set; }
    public long SizeBytes { get; set; }
    public long? OriginalSizeBytes { get; set; }
    public string Sha256 { get; set; } = string.Empty;
    public string TransportEncoding { get; set; } = nameof(SyncFileTransportEncoding.Identity).ToLowerInvariant();
    public bool IsPreprocessed { get; set; }
    public string? PreprocessProfile { get; set; }
    public string Base64Content { get; set; } = string.Empty;
}

/// <summary>
/// Explicit acknowledgment that the requester has persisted and verified a downloaded file.
/// </summary>
public class SyncFileTransferAckDto
{
    public Guid RequestId { get; set; }
    public Guid ManifestId { get; set; }
    public Guid FileId { get; set; }
    public string RequesterNodeId { get; set; } = string.Empty;
    public string SupplierNodeId { get; set; } = string.Empty;
    public string TableName { get; set; } = string.Empty;
    public string RecordKey { get; set; } = string.Empty;
    public string FileRole { get; set; } = string.Empty;
    public string Sha256 { get; set; } = string.Empty;
    public string? StoragePath { get; set; }
    public DateTime VerifiedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Chunk-session metadata used to negotiate resumable file transfer sessions.
/// </summary>
public class SyncFileChunkSessionDto
{
    public Guid SessionId { get; set; }
    public Guid RequestId { get; set; }
    public Guid ManifestId { get; set; }
    public Guid FileId { get; set; }
    public string RequesterNodeId { get; set; } = string.Empty;
    public string SupplierNodeId { get; set; } = string.Empty;
    public string TableName { get; set; } = string.Empty;
    public string RecordKey { get; set; } = string.Empty;
    public string FileRole { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string? ContentType { get; set; }
    public long SizeBytes { get; set; }
    public string Sha256 { get; set; } = string.Empty;
    public int ChunkSizeBytes { get; set; }
    public int TotalChunks { get; set; }
    public int NextChunkIndex { get; set; }
    public long CommittedBytes { get; set; }
    public bool IsDeltaSession { get; set; }
    public int? DeltaBlockSizeBytes { get; set; }
    public string? ReceiverBaseSha256 { get; set; }
    public List<int> RequestedChunkIndexes { get; set; } = new();
    public string ResumeToken { get; set; } = string.Empty;
    public DateTime ExpiresAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// One chunk of a resumable file transfer session.
/// </summary>
public class SyncFileChunkDto
{
    public Guid SessionId { get; set; }
    public Guid RequestId { get; set; }
    public Guid ManifestId { get; set; }
    public Guid FileId { get; set; }
    public string RequesterNodeId { get; set; } = string.Empty;
    public string SupplierNodeId { get; set; } = string.Empty;
    public int ChunkIndex { get; set; }
    public int FileChunkIndex { get; set; }
    public int TotalChunks { get; set; }
    public int ChunkSizeBytes { get; set; }
    public long OffsetBytes { get; set; }
    public string ChunkSha256 { get; set; } = string.Empty;
    public string ResumeToken { get; set; } = string.Empty;
    public bool IsLastChunk { get; set; }
    public string Base64Content { get; set; } = string.Empty;
}

/// <summary>
/// Result for chunk-session start or chunk append operations.
/// </summary>
public class SyncFileChunkResultDto
{
    public bool Success { get; set; }
    public Guid SessionId { get; set; }
    public Guid RequestId { get; set; }
    public Guid ManifestId { get; set; }
    public Guid FileId { get; set; }
    public int ChunkIndex { get; set; }
    public int NextChunkIndex { get; set; }
    public int TotalChunks { get; set; }
    public long CommittedBytes { get; set; }
    public string ResumeToken { get; set; } = string.Empty;
    public bool IsComplete { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? StoragePath { get; set; }
    public DateTime ProcessedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Result of a file transfer operation.
/// </summary>
public class SyncFileTransferResultDto
{
    public bool Success { get; set; }
    public Guid RequestId { get; set; }
    public Guid ManifestId { get; set; }
    public Guid FileId { get; set; }
    public string Message { get; set; } = string.Empty;
    public string? StoragePath { get; set; }
    public DateTime ProcessedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// File item metadata stored inside a bundle upload.
/// </summary>
public class SyncFileBundleItemDto
{
    public Guid RequestId { get; set; }
    public Guid ManifestId { get; set; }
    public Guid FileId { get; set; }
    public string TableName { get; set; } = string.Empty;
    public string RecordKey { get; set; } = string.Empty;
    public string FileRole { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string? ContentType { get; set; }
    public long SizeBytes { get; set; }
    public long? OriginalSizeBytes { get; set; }
    public string Sha256 { get; set; } = string.Empty;
    public bool IsPreprocessed { get; set; }
    public string? PreprocessProfile { get; set; }
}

/// <summary>
/// Transport payload that bundles multiple small files into one archive.
/// </summary>
public class SyncFileBundleUploadDto
{
    public Guid BundleId { get; set; }
    public string RequesterNodeId { get; set; } = string.Empty;
    public string SupplierNodeId { get; set; } = string.Empty;
    public List<SyncFileBundleItemDto> Items { get; set; } = new();
    public string ArchiveEncoding { get; set; } = nameof(SyncFileTransportEncoding.ZipBundle).ToLowerInvariant();
    public string Base64Archive { get; set; } = string.Empty;
    public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Result of a bundle upload operation.
/// </summary>
public class SyncFileBundleResultDto
{
    public bool Success { get; set; }
    public Guid BundleId { get; set; }
    public int AcceptedCount { get; set; }
    public string Message { get; set; } = string.Empty;
    public DateTime ProcessedAtUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Canonical signed sync metadata transported via HTTP headers in protocol v2.
/// Stored here as a shared contract for docs/tests even when runtime transport uses headers.
/// </summary>
public class SyncSecurityMetadataDto
{
    public string NodeId { get; set; } = string.Empty;
    public string Timestamp { get; set; } = string.Empty;
    public string Nonce { get; set; } = string.Empty;
    public int KeyVersion { get; set; } = 1;
    public string ContentSha256 { get; set; } = string.Empty;
    public string ProtocolVersion { get; set; } = "2";
    public string Signature { get; set; } = string.Empty;
}

/// <summary>
/// Response for Edge pull requests — cursor-based pagination
/// </summary>
public class SyncPullResponse
{
    public List<SyncQueueItemDto> Items { get; set; } = new();
    public DateTime ServerTime { get; set; } = DateTime.UtcNow;
    public string? NextCursor { get; set; }
    public bool HasMore { get; set; }
}

/// <summary>
/// Sync status for a specific node/ship
/// </summary>
public class SyncStatusDto
{
    public string NodeId { get; set; } = string.Empty;
    public int PendingRecords { get; set; }
    public DateTime? LastSyncAt { get; set; }
    public bool IsOnline { get; set; }
    public string? CurrentNetwork { get; set; }
}

/// <summary>
/// Acknowledgment from edge that items were received
/// </summary>
public class SyncAcknowledgeDto
{
    public List<long> ItemIds { get; set; } = new();
    public string NodeId { get; set; } = string.Empty;
}
