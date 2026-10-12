using Maritime.Shared.Models.Sync;
using Microsoft.EntityFrameworkCore;
using Xunit;

namespace ProductApi.Tests;

public partial class SyncReliabilityTests
{
    [ShorePostgresFact]
    public async Task ApprovalEvidence_PersistsDependencies_Retries_AndRejectsForgedOrChangedEvidence()
    {
        await using var db = await Database(); await BindNode(db, "APPROVAL-A"); await BindNode(db, "APPROVAL-B");
        var inbox = Inbox(db); var stream = Guid.NewGuid();
        var doc = new ApprovalDocument { OriginNode = "APPROVAL-A", Module = "permit", RecordKey = Guid.NewGuid().ToString(), Version = 2, CurrentRevision = 1, CurrentState = "Issued" };
        var snapshot = ApprovalSnapshot.Canonicalize(new { title = "Hot work", templateFilePath = "/uploads/approval-evidence/original.pdf", Files = Array.Empty<object>() });
        var revision = new ApprovalRevision { OriginNode = doc.OriginNode, DocumentId = doc.Id, Revision = 1, SnapshotJson = snapshot, ContentHash = ApprovalSnapshot.Hash(snapshot) };
        var action = new ApprovalAction { OriginNode = doc.OriginNode, DocumentId = doc.Id, RevisionId = revision.Id, ActorUserId = 58, ActorUsername = "officer", ActorName = "Officer A", ActorRank = "Master", Action = "issue", ContentHash = revision.ContentHash, IdempotencyKey = Guid.NewGuid().ToString() };
        var events = new[] {
            MirrorEvent("approval_action", action.Id.ToString(), doc.OriginNode, stream, 3, action),
            MirrorEvent("approval_revision", revision.Id.ToString(), doc.OriginNode, stream, 2, revision),
            MirrorEvent("approval_document", doc.Id.ToString(), doc.OriginNode, stream, 1, doc)
        };
        var result = await inbox.ProcessBatchAsync(events.ToList());
        Assert.Empty(result.FailedItems); Assert.Equal(3, result.Succeeded); Assert.Equal(3, result.AcknowledgedEventIds.Count);
        Assert.Equal(3, (await inbox.ProcessBatchAsync(events.ToList())).Succeeded);
        Assert.Single(await db.ApprovalActions.ToListAsync());
        Assert.Equal(snapshot, (await db.ApprovalRevisions.SingleAsync()).SnapshotJson);
        action.ActorName = "Changed actor";
        var changed = await inbox.ProcessBatchAsync([MirrorEvent("approval_action", action.Id.ToString(), doc.OriginNode, stream, 4, action)]);
        Assert.Equal(1, changed.Failed); Assert.Empty(changed.AcknowledgedEventIds);
        Assert.Contains("immutable", changed.FailedItems.Single().Error);
        var forged = await inbox.ProcessBatchAsync([MirrorEvent("approval_document", doc.Id.ToString(), "APPROVAL-B", Guid.NewGuid(), 1, doc)]);
        Assert.Equal(1, forged.Failed); Assert.Contains("ownership_violation", forged.FailedItems.Single().Error);
        revision.Id = Guid.NewGuid(); revision.Revision = 2; revision.SnapshotJson = "{}";
        var tampered = await inbox.ProcessBatchAsync([MirrorEvent("approval_revision", revision.Id.ToString(), doc.OriginNode, stream, 5, revision)]);
        Assert.Equal(1, tampered.Failed); Assert.Contains("hash_mismatch", tampered.FailedItems.Single().Error);
        await db.Database.EnsureDeletedAsync();
    }
}
