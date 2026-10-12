using System.IO.Compression;
using System.Security.Cryptography;
using Maritime.Shared.Models.Sync;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Jpeg;
using SixLabors.ImageSharp.Formats.Png;
using SixLabors.ImageSharp.Processing;

namespace MaritimeEdge.Services.Core;

public sealed record PreparedSyncFile(
    string SourcePath,
    string LogicalPath,
    string FileName,
    string? ContentType,
    long SizeBytes,
    long OriginalSizeBytes,
    string Sha256,
    bool IsPreprocessed,
    string? PreprocessProfile);

public interface ISyncFilePreparationService
{
    Task<PreparedSyncFile?> PrepareForSyncAsync(
        string sourcePath,
        string tableName,
        string recordKey,
        string fileRole,
        CancellationToken cancellationToken);

    Task<(byte[] Bytes, SyncFileTransportEncoding Encoding)> ReadTransportBytesAsync(
        PreparedSyncFile preparedFile,
        bool allowCompression,
        CancellationToken cancellationToken);

    bool CanBundle(PreparedSyncFile preparedFile);
}

public sealed class SyncFilePreparationService : ISyncFilePreparationService
{
    private static readonly HashSet<string> ImageExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg",
        ".jpeg",
        ".png"
    };

    private static readonly HashSet<string> CompressibleExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".json",
        ".txt",
        ".xml",
        ".csv",
        ".log",
        ".pdf"
    };

    private readonly IConfiguration _configuration;
    private readonly ISyncFileStorageService _syncFileStorageService;

    public SyncFilePreparationService(IConfiguration configuration, ISyncFileStorageService syncFileStorageService)
    {
        _configuration = configuration;
        _syncFileStorageService = syncFileStorageService;
    }

    public async Task<PreparedSyncFile?> PrepareForSyncAsync(
        string sourcePath,
        string tableName,
        string recordKey,
        string fileRole,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(sourcePath) || !_syncFileStorageService.Exists(sourcePath))
            return null;

        var absolutePath = _syncFileStorageService.ResolveLocalPath(sourcePath);
        var fileInfo = new FileInfo(absolutePath);
        var fileName = Path.GetFileName(absolutePath);
        var contentType = GuessContentType(absolutePath);
        var extension = Path.GetExtension(fileName);

        if (tableName == "approval_revision" || !ShouldOptimizeImage(extension))
        {
            return new PreparedSyncFile(
                sourcePath,
                sourcePath,
                fileName,
                contentType,
                fileInfo.Length,
                fileInfo.Length,
                await _syncFileStorageService.ComputeSha256HexAsync(sourcePath, cancellationToken),
                false,
                null);
        }

        var cacheKey = ComputePreparationCacheKey(absolutePath, tableName, recordKey, fileRole, fileInfo);
        var relativeCachePath = $"/{Path.Combine("uploads", "sync-cache", cacheKey[..2], cacheKey).Replace('\\', '/')}{extension}";
        if (!_syncFileStorageService.Exists(relativeCachePath))
        {
            var optimizedBytes = await OptimizeImageAsync(absolutePath, extension, cancellationToken);
            await _syncFileStorageService.WriteAllBytesAsync(relativeCachePath, optimizedBytes, cancellationToken);
        }

        var optimizedSize = _syncFileStorageService.GetFileSize(relativeCachePath);
        var optimizedSha = await _syncFileStorageService.ComputeSha256HexAsync(relativeCachePath, cancellationToken);
        return new PreparedSyncFile(
            sourcePath,
            relativeCachePath,
            fileName,
            contentType,
            optimizedSize,
            fileInfo.Length,
            optimizedSha,
            true,
            "image-optimized");
    }

    public async Task<(byte[] Bytes, SyncFileTransportEncoding Encoding)> ReadTransportBytesAsync(
        PreparedSyncFile preparedFile,
        bool allowCompression,
        CancellationToken cancellationToken)
    {
        var logicalBytes = await File.ReadAllBytesAsync(_syncFileStorageService.ResolveLocalPath(preparedFile.LogicalPath), cancellationToken);
        if (!allowCompression || !ShouldCompress(preparedFile.FileName, logicalBytes.LongLength))
            return (logicalBytes, SyncFileTransportEncoding.Identity);

        await using var output = new MemoryStream();
        await using (var gzip = new GZipStream(output, CompressionLevel.SmallestSize, leaveOpen: true))
        {
            await gzip.WriteAsync(logicalBytes.AsMemory(0, logicalBytes.Length), cancellationToken);
        }

        var compressedBytes = output.ToArray();
        var minSavingsRatio = Math.Clamp(_configuration.GetValue("Sync:CompressionMinSavingsRatio", 0.08), 0.0, 0.9);
        var savingsRatio = logicalBytes.Length == 0
            ? 0.0
            : 1.0 - ((double)compressedBytes.Length / logicalBytes.Length);

        return savingsRatio >= minSavingsRatio
            ? (compressedBytes, SyncFileTransportEncoding.Gzip)
            : (logicalBytes, SyncFileTransportEncoding.Identity);
    }

    public bool CanBundle(PreparedSyncFile preparedFile)
    {
        if (!_configuration.GetValue("Sync:BundleSmallFilesEnabled", true))
            return false;

        var maxFileBytes = Math.Max(16 * 1024, _configuration.GetValue("Sync:BundleMaxFileBytes", 256 * 1024));
        return preparedFile.SizeBytes <= maxFileBytes;
    }

    private bool ShouldOptimizeImage(string extension)
    {
        return _configuration.GetValue("Sync:PreprocessImagesEnabled", true)
            && ImageExtensions.Contains(extension);
    }

    private bool ShouldCompress(string fileName, long fileSizeBytes)
    {
        if (!_configuration.GetValue("Sync:UseCompression", false))
            return false;

        var extension = Path.GetExtension(fileName);
        var maxCompressionBytes = Math.Max(64 * 1024, _configuration.GetValue("Sync:CompressionMaxFileBytes", 1024 * 1024));
        return fileSizeBytes > 0 && fileSizeBytes <= maxCompressionBytes && CompressibleExtensions.Contains(extension);
    }

    private async Task<byte[]> OptimizeImageAsync(string absolutePath, string extension, CancellationToken cancellationToken)
    {
        using var image = await Image.LoadAsync(absolutePath, cancellationToken);
        var maxWidth = Math.Max(320, _configuration.GetValue("Sync:ImageMaxWidth", 1600));
        var maxHeight = Math.Max(320, _configuration.GetValue("Sync:ImageMaxHeight", 1600));

        if (image.Width > maxWidth || image.Height > maxHeight)
        {
            image.Mutate(ctx => ctx.Resize(new ResizeOptions
            {
                Mode = ResizeMode.Max,
                Size = new Size(maxWidth, maxHeight)
            }));
        }

        image.Metadata.ExifProfile = null;
        image.Metadata.IccProfile = null;
        image.Metadata.XmpProfile = null;

        await using var output = new MemoryStream();
        switch (extension.ToLowerInvariant())
        {
            case ".png":
                await image.SaveAsPngAsync(output, new PngEncoder
                {
                    CompressionLevel = PngCompressionLevel.BestCompression
                }, cancellationToken);
                break;
            default:
                await image.SaveAsJpegAsync(output, new JpegEncoder
                {
                    Quality = Math.Clamp(_configuration.GetValue("Sync:ImageJpegQuality", 82), 40, 95)
                }, cancellationToken);
                break;
        }

        return output.ToArray();
    }

    private static string GuessContentType(string filePath)
    {
        return Path.GetExtension(filePath).ToLowerInvariant() switch
        {
            ".jpg" or ".jpeg" => "image/jpeg",
            ".png" => "image/png",
            ".gif" => "image/gif",
            ".pdf" => "application/pdf",
            ".json" => "application/json",
            ".csv" => "text/csv",
            ".txt" => "text/plain",
            _ => "application/octet-stream"
        };
    }

    private static string ComputePreparationCacheKey(string absolutePath, string tableName, string recordKey, string fileRole, FileInfo fileInfo)
    {
        var input = string.Join('|',
            absolutePath.ToLowerInvariant(),
            tableName,
            recordKey,
            fileRole,
            fileInfo.Length,
            fileInfo.LastWriteTimeUtc.Ticks);
        var hash = SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(input));
        return Convert.ToHexString(hash).ToLowerInvariant();
    }
}
