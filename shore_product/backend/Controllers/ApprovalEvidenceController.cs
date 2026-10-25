using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using ProductApi.Data;

namespace ProductApi.Controllers;

[ApiController]
[Authorize]
[Route("api/approval-evidence")]
public sealed class ApprovalEvidenceController(AppDbContext db, ProductApi.Services.Sync.ISyncFileStorageService storage) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? originNode, [FromQuery] int page = 1)
    {
        var query = db.ApprovalDocuments.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(originNode)) query = query.Where(d => d.OriginNode == originNode);
        return Ok(await query.OrderByDescending(d => d.CreatedAt).Skip((Math.Max(1, page) - 1) * 50).Take(50).ToListAsync());
    }
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Detail(Guid id)
    {
        var document = await db.ApprovalDocuments.AsNoTracking().SingleOrDefaultAsync(d => d.Id == id);
        if (document == null) return NotFound();
        var revisions = await db.ApprovalRevisions.AsNoTracking().Where(r => r.DocumentId == id).OrderBy(r => r.Revision).ToListAsync();
        var revisionKeys = revisions.Select(r => r.Id.ToString()).ToArray();
        var files = await db.SyncFileManifests.AsNoTracking().Where(f => f.TableName == "approval_revision" && f.OwnerNodeId == document.OriginNode && revisionKeys.Contains(f.RecordKey))
            .Select(f => new { f.Id, f.RecordKey, f.FileRole, f.FileName, f.Sha256, f.SizeBytes, ready = f.StoragePath != null }).ToListAsync();
        return Ok(new { document, revisions, files,
            actions = await db.ApprovalActions.AsNoTracking().Where(a => a.DocumentId == id).OrderBy(a => a.CreatedAt)
                .Select(a => new { a.Id, a.RevisionId, a.ActorUserId, a.ActorName, a.ActorUsername, a.ActorRank, a.CrewId, a.Authority, a.Action, a.Reason, a.ContentHash, a.CreatedAt, a.AuthenticationMethod }).ToListAsync() });
    }

    [HttpGet("{id:guid}/files/{fileId:guid}")]
    public async Task<IActionResult> Download(Guid id, Guid fileId)
    {
        var document = await db.ApprovalDocuments.AsNoTracking().SingleOrDefaultAsync(d => d.Id == id);
        var manifest = await db.SyncFileManifests.AsNoTracking().SingleOrDefaultAsync(f => f.Id == fileId && f.TableName == "approval_revision");
        if (document == null || manifest == null || manifest.OwnerNodeId != document.OriginNode || !Guid.TryParse(manifest.RecordKey, out var revisionId) || !await db.ApprovalRevisions.AnyAsync(r => r.Id == revisionId && r.DocumentId == id)) return NotFound();
        if (manifest.StoragePath == null || !storage.Exists(manifest.StoragePath)) return Conflict(new { message = "Tệp đang chờ đồng bộ." });
        if (await storage.ComputeSha256HexAsync(manifest.StoragePath, default) != manifest.Sha256) return Conflict(new { message = "Tệp không khớp bằng chứng đã nhận." });
        return PhysicalFile(storage.ResolveLocalPath(manifest.StoragePath), manifest.ContentType ?? "application/octet-stream", manifest.FileName);
    }
}
