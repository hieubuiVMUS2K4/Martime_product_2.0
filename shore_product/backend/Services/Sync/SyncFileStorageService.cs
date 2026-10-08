using System.Security.Cryptography;
using ProductApi.Security;

namespace ProductApi.Services.Sync;

public interface ISyncFileStorageService
{
    string ResolveLocalPath(string relativeOrAbsolutePath);
    string CreateRelativeStoragePath(string tableName, string fileRole, string recordKey, string fileName);
    string CreateRelativeStoragePath(string tableName, string fileRole, string recordKey, string fileName, string sha256);
    string CreateRelativeStagingPath(Guid sessionId, string fileName);
    bool Exists(string relativeOrAbsolutePath);
    long GetFileSize(string relativeOrAbsolutePath);
    Task<byte[]> ReadAllBytesAsync(string relativeOrAbsolutePath, CancellationToken cancellationToken);
    Task<byte[]> ReadChunkAsync(string relativeOrAbsolutePath, long offsetBytes, int chunkSizeBytes, CancellationToken cancellationToken);
    Task WriteAllBytesAsync(string relativeOrAbsolutePath, byte[] content, CancellationToken cancellationToken);
    Task WriteChunkAsync(string relativeOrAbsolutePath, long offsetBytes, byte[] content, CancellationToken cancellationToken);
    Task CopyAsync(string sourceRelativePath, string destinationRelativePath, CancellationToken cancellationToken);
    Task MoveAsync(string sourceRelativePath, string destinationRelativePath, CancellationToken cancellationToken);
    Task DeleteIfExistsAsync(string relativeOrAbsolutePath, CancellationToken cancellationToken);
    Task<string> ComputeSha256HexAsync(string relativeOrAbsolutePath, CancellationToken cancellationToken);
}

public sealed class LocalSyncFileStorageService : ISyncFileStorageService
{
    private static readonly string[] ProtectedUploadPrefixes =
    {
        "/uploads/crew/avatars/",
        "/uploads/crew/certificates/",
        "/uploads/crew/documents/"
    };

    private readonly IDataEncryptionService _dataEncryptionService;

    public LocalSyncFileStorageService(IDataEncryptionService dataEncryptionService)
    {
        _dataEncryptionService = dataEncryptionService;
    }

    public string ResolveLocalPath(string relativeOrAbsolutePath)
    {
        return relativeOrAbsolutePath.StartsWith("/", StringComparison.Ordinal)
            ? Path.Combine(Directory.GetCurrentDirectory(), relativeOrAbsolutePath.TrimStart('/').Replace('/', Path.DirectorySeparatorChar))
            : relativeOrAbsolutePath;
    }

    public string CreateRelativeStoragePath(string tableName, string fileRole, string recordKey, string fileName)
    {
        var extension = Path.GetExtension(fileName);
        if (string.IsNullOrWhiteSpace(extension))
            extension = ".bin";

        var relativeDirectory = GetRelativeDirectory(tableName, fileRole);
        var generatedFileName = $"{recordKey}-{fileRole}-{Guid.NewGuid():N}{extension}";
        return $"/{Path.Combine(relativeDirectory, generatedFileName).Replace('\\', '/')}";
    }

    public string CreateRelativeStoragePath(string tableName, string fileRole, string recordKey, string fileName, string sha256)
    {
        var extension = Path.GetExtension(fileName);
        if (string.IsNullOrWhiteSpace(extension))
            extension = ".bin";

        var normalizedHash = string.IsNullOrWhiteSpace(sha256)
            ? Guid.NewGuid().ToString("N")
            : sha256.Trim().ToLowerInvariant();

        var shardA = normalizedHash.Length >= 2 ? normalizedHash[..2] : "00";
        var shardB = normalizedHash.Length >= 4 ? normalizedHash.Substring(2, 2) : "00";
        return $"/{Path.Combine("uploads", "sync-content", shardA, shardB, $"{normalizedHash}{extension}").Replace('\\', '/')}";
    }

    public string CreateRelativeStagingPath(Guid sessionId, string fileName)
    {
        var extension = Path.GetExtension(fileName);
        if (string.IsNullOrWhiteSpace(extension))
            extension = ".bin";

        return $"/{Path.Combine("uploads", "sync-staging", $"{sessionId:N}{extension}.part").Replace('\\', '/')}";
    }

    public bool Exists(string relativeOrAbsolutePath)
    {
        return File.Exists(ResolveLocalPath(relativeOrAbsolutePath));
    }

    public long GetFileSize(string relativeOrAbsolutePath)
    {
        var physicalPath = ResolveLocalPath(relativeOrAbsolutePath);
        var fileLength = new FileInfo(physicalPath).Length;

        if (!ShouldProtect(relativeOrAbsolutePath) || !_dataEncryptionService.IsConfigured)
            return fileLength;

        // For encrypted files, read raw bytes and strip envelope to get plaintext size.
        // Use synchronous File.ReadAllBytes to avoid sync-over-async deadlock.
        var raw = File.ReadAllBytes(physicalPath);
        return _dataEncryptionService.IsEncryptedPayload(raw)
            ? _dataEncryptionService.DecryptBytes(raw).LongLength
            : fileLength;
    }

    public async Task<byte[]> ReadAllBytesAsync(string relativeOrAbsolutePath, CancellationToken cancellationToken)
    {
        var physicalPath = ResolveLocalPath(relativeOrAbsolutePath);
        var raw = await File.ReadAllBytesAsync(physicalPath, cancellationToken);
        return ShouldProtect(relativeOrAbsolutePath) ? _dataEncryptionService.DecryptBytes(raw) : raw;
    }

    public async Task<byte[]> ReadChunkAsync(string relativeOrAbsolutePath, long offsetBytes, int chunkSizeBytes, CancellationToken cancellationToken)
    {
        if (ShouldProtect(relativeOrAbsolutePath))
        {
            var plaintext = await ReadAllBytesAsync(relativeOrAbsolutePath, cancellationToken);
            if (offsetBytes >= plaintext.LongLength)
                return Array.Empty<byte>();

            var protectedLength = (int)Math.Min(chunkSizeBytes, plaintext.LongLength - offsetBytes);
            var chunk = new byte[protectedLength];
            Buffer.BlockCopy(plaintext, (int)offsetBytes, chunk, 0, protectedLength);
            return chunk;
        }

        var physicalPath = ResolveLocalPath(relativeOrAbsolutePath);
        await using var stream = new FileStream(physicalPath, FileMode.Open, FileAccess.Read, FileShare.Read);
        stream.Seek(offsetBytes, SeekOrigin.Begin);

        var remaining = Math.Max(0, stream.Length - offsetBytes);
        var length = (int)Math.Min(chunkSizeBytes, remaining);
        var buffer = new byte[length];
        var read = await stream.ReadAsync(buffer.AsMemory(0, length), cancellationToken);
        return read == length ? buffer : buffer[..read];
    }

    public async Task WriteAllBytesAsync(string relativeOrAbsolutePath, byte[] content, CancellationToken cancellationToken)
    {
        var physicalPath = ResolveLocalPath(relativeOrAbsolutePath);
        Directory.CreateDirectory(Path.GetDirectoryName(physicalPath)!);
        var shouldEncrypt = ShouldProtect(relativeOrAbsolutePath) && _dataEncryptionService.IsConfigured;
        var payload = shouldEncrypt ? _dataEncryptionService.EncryptBytes(content) : content;
        await File.WriteAllBytesAsync(physicalPath, payload, cancellationToken);
    }

    public async Task WriteChunkAsync(string relativeOrAbsolutePath, long offsetBytes, byte[] content, CancellationToken cancellationToken)
    {
        if (ShouldProtect(relativeOrAbsolutePath))
            throw new InvalidOperationException($"Chunked writes are not supported for protected file path '{relativeOrAbsolutePath}'.");

        var physicalPath = ResolveLocalPath(relativeOrAbsolutePath);
        Directory.CreateDirectory(Path.GetDirectoryName(physicalPath)!);

        await using var stream = new FileStream(physicalPath, FileMode.OpenOrCreate, FileAccess.Write, FileShare.None);
        stream.Seek(offsetBytes, SeekOrigin.Begin);
        await stream.WriteAsync(content.AsMemory(0, content.Length), cancellationToken);
    }

    public Task CopyAsync(string sourceRelativePath, string destinationRelativePath, CancellationToken cancellationToken)
    {
        return CopyInternalAsync(sourceRelativePath, destinationRelativePath, cancellationToken, deleteSource: false);
    }

    public Task MoveAsync(string sourceRelativePath, string destinationRelativePath, CancellationToken cancellationToken)
    {
        return CopyInternalAsync(sourceRelativePath, destinationRelativePath, cancellationToken, deleteSource: true);
    }

    public Task DeleteIfExistsAsync(string relativeOrAbsolutePath, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var physicalPath = ResolveLocalPath(relativeOrAbsolutePath);
        if (File.Exists(physicalPath))
            File.Delete(physicalPath);
        return Task.CompletedTask;
    }

    public async Task<string> ComputeSha256HexAsync(string relativeOrAbsolutePath, CancellationToken cancellationToken)
    {
        var content = await ReadAllBytesAsync(relativeOrAbsolutePath, cancellationToken);
        var hash = SHA256.HashData(content);
        return Convert.ToHexString(hash).ToLowerInvariant();
    }

    private async Task CopyInternalAsync(string sourceRelativePath, string destinationRelativePath, CancellationToken cancellationToken, bool deleteSource)
    {
        cancellationToken.ThrowIfCancellationRequested();

        if (!ShouldProtect(sourceRelativePath) && !ShouldProtect(destinationRelativePath))
        {
            var source = ResolveLocalPath(sourceRelativePath);
            var destination = ResolveLocalPath(destinationRelativePath);
            Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
            if (deleteSource)
                File.Move(source, destination, true);
            else
                File.Copy(source, destination, true);
            return;
        }

        var content = await ReadAllBytesAsync(sourceRelativePath, cancellationToken);
        await WriteAllBytesAsync(destinationRelativePath, content, cancellationToken);
        if (deleteSource)
            await DeleteIfExistsAsync(sourceRelativePath, cancellationToken);
    }

    private static bool ShouldProtect(string relativeOrAbsolutePath)
    {
        if (string.IsNullOrWhiteSpace(relativeOrAbsolutePath))
            return false;

        var normalized = relativeOrAbsolutePath.StartsWith("/", StringComparison.Ordinal)
            ? relativeOrAbsolutePath.Replace('\\', '/')
            : NormalizePhysicalPath(relativeOrAbsolutePath);

        return ProtectedUploadPrefixes.Any(prefix => normalized.StartsWith(prefix, StringComparison.OrdinalIgnoreCase));
    }

    private static string NormalizePhysicalPath(string physicalPath)
    {
        var relative = Path.GetRelativePath(Directory.GetCurrentDirectory(), physicalPath).Replace('\\', '/');
        return relative.StartsWith("/", StringComparison.Ordinal) ? relative : "/" + relative;
    }

    private static string GetRelativeDirectory(string tableName, string fileRole)
    {
        if (tableName == "crew_member" || string.Equals(fileRole, "avatar", StringComparison.OrdinalIgnoreCase))
            return Path.Combine("uploads", "crew", "avatars");

        return tableName switch
        {
            "crew_certificate" => Path.Combine("uploads", "crew", "certificates"),
            "crew_member_document" => Path.Combine("uploads", "crew", "documents"),
            "sms_procedure" or "sms_procedures" or "sms_filled_record" or "sms_filled_records" => Path.Combine("uploads", "sms"),
            _ => Path.Combine("uploads", "sync-files", tableName)
        };
    }
}