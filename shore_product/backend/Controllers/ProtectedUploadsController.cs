using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using ProductApi.Services.Sync;

namespace ProductApi.Controllers;

[ApiController]
[Route("uploads")]
[Route("api/uploads")]
[Authorize(Policy = "InternalAccess")]
public class ProtectedUploadsController : ControllerBase
{
    private static readonly FileExtensionContentTypeProvider ContentTypeProvider = new();

    private readonly ISyncFileStorageService _syncFileStorageService;
    private readonly ILogger<ProtectedUploadsController> _logger;

    public ProtectedUploadsController(ISyncFileStorageService syncFileStorageService, ILogger<ProtectedUploadsController> logger)
    {
        _syncFileStorageService = syncFileStorageService;
        _logger = logger;
    }

    [HttpGet("{**relativePath}")]
    public async Task<IActionResult> Download(string relativePath, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(relativePath))
            return NotFound();

        var normalizedPath = "/uploads/" + relativePath.TrimStart('/');

        // Path traversal protection: resolve and verify the physical path
        // stays within the uploads root directory.
        var uploadsRoot = Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "uploads"));
        var resolvedPhysical = Path.GetFullPath(_syncFileStorageService.ResolveLocalPath(normalizedPath));
        if (!resolvedPhysical.StartsWith(uploadsRoot, StringComparison.OrdinalIgnoreCase))
        {
            _logger.LogWarning("Path traversal attempt blocked: {Path}", relativePath);
            return BadRequest(new { error = "Invalid path" });
        }

        if (!_syncFileStorageService.Exists(normalizedPath))
            return NotFound();

        try
        {
            var fileBytes = await _syncFileStorageService.ReadAllBytesAsync(normalizedPath, cancellationToken);
            if (!ContentTypeProvider.TryGetContentType(normalizedPath, out var contentType))
                contentType = "application/octet-stream";

            return File(fileBytes, contentType);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            // Client aborted the request (navigated away or the image re-rendered).
            return new EmptyResult();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to serve protected upload {Path}", normalizedPath);
            return StatusCode(StatusCodes.Status500InternalServerError, new { error = "Failed to read protected upload" });
        }
    }
}