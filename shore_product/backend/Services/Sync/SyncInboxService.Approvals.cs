using System.Text.Json;
using Maritime.Shared.DTOs.Sync;
using Maritime.Shared.Models.Sync;
using Microsoft.EntityFrameworkCore;

namespace ProductApi.Services.Sync;

public partial class SyncInboxService
{
    private async Task ProcessApprovalEvidenceAsync(SyncQueueItemDto item)
    {
        if (item.ActionType?.ToUpperInvariant() == "DELETE") throw new InvalidOperationException("approval_evidence_immutable: deletion prohibited");
        if (!Guid.TryParse(item.RecordKey, out var id) || id == Guid.Empty) throw new InvalidOperationException("approval_evidence_invalid_key");
        // Never run generic conflict merging or recursively strip signed snapshot file references.
        var type = _tableEntityMap[item.TableName];
        var incoming = JsonSerializer.Deserialize(item.Payload, type, _jsonOptions) ?? throw new InvalidOperationException("approval_evidence_invalid_payload");
        if ((Guid)type.GetProperty("Id")!.GetValue(incoming)! != id || type.GetProperty("OriginNode")!.GetValue(incoming)?.ToString() != item.OriginNode)
            throw new InvalidOperationException("ownership_violation: evidence source does not match authenticated node");
        var stored = await _context.FindAsync(type, id);
        if (stored != null && type.GetProperty("OriginNode")!.GetValue(stored)?.ToString() != item.OriginNode)
            throw new InvalidOperationException("ownership_violation: evidence belongs to another node");
        if (incoming is ApprovalDocument doc)
        {
            if (stored is ApprovalDocument existing)
            {
                if (existing.Module != doc.Module || existing.RecordKey != doc.RecordKey) throw new InvalidOperationException("approval_document_identity_immutable");
                if (doc.Version <= existing.Version) return;
                _context.Entry(existing).CurrentValues.SetValues(doc);
            }
            else _context.ApprovalDocuments.Add(doc);
        }
        else
        {
            var documentId = (Guid)type.GetProperty("DocumentId")!.GetValue(incoming)!;
            var document = await _context.ApprovalDocuments.SingleOrDefaultAsync(d => d.Id == documentId);
            if (document == null) throw new InvalidOperationException("dependency_missing: approval_document");
            if (document.OriginNode != item.OriginNode) throw new InvalidOperationException("ownership_violation: evidence parent belongs to another node");
            if (incoming is ApprovalRevision revision)
            {
                if (ApprovalSnapshot.Hash(revision.SnapshotJson) != revision.ContentHash || ApprovalSnapshot.Canonicalize(JsonSerializer.Deserialize<JsonElement>(revision.SnapshotJson)) != revision.SnapshotJson)
                    throw new InvalidOperationException("approval_snapshot_hash_mismatch");
                using var snapshot = JsonDocument.Parse(revision.SnapshotJson);
                if (snapshot.RootElement.TryGetProperty("Files", out var signedFiles))
                {
                    var references = item.FileRefs ?? [];
                    if (references.Count != signedFiles.GetArrayLength()) throw new InvalidOperationException("approval_file_evidence_missing");
                    var index = 0;
                    foreach (var file in signedFiles.EnumerateArray())
                    {
                        var reference = references.SingleOrDefault(f => f.FileRole == "evidence-" + index++);
                        if (reference == null || reference.IsPreprocessed || reference.Sha256 != file.GetProperty("sha256").GetString() || reference.SizeBytes != file.GetProperty("sizeBytes").GetInt64())
                            throw new InvalidOperationException("approval_file_evidence_mismatch");
                    }
                }
                if (revision.PreviousRevisionId.HasValue && !await _context.ApprovalRevisions.AnyAsync(r => r.Id == revision.PreviousRevisionId && r.DocumentId == documentId && r.Revision < revision.Revision))
                    throw new InvalidOperationException("dependency_missing: previous approval_revision");
            }
            if (incoming is ApprovalAction action)
            {
                var signedRevision = await _context.ApprovalRevisions.SingleOrDefaultAsync(r => r.Id == action.RevisionId && r.DocumentId == documentId);
                if (signedRevision == null) throw new InvalidOperationException("dependency_missing: approval_revision");
                if (action.ContentHash != signedRevision.ContentHash || action.AuthenticationMethod != "password-reauthentication" || action.ActorUserId <= 0 || string.IsNullOrWhiteSpace(action.ActorUsername))
                    throw new InvalidOperationException("approval_action_invalid_evidence");
            }
            if (stored != null)
            {
                var existingValues = _context.Entry(stored).Properties.Where(p => p.Metadata.Name != "IsSynced").ToDictionary(p => p.Metadata.Name, p => p.CurrentValue);
                var incomingValues = type.GetProperties().Where(p => p.Name != "IsSynced").ToDictionary(p => p.Name, p => p.GetValue(incoming));
                if (ApprovalSnapshot.Canonicalize(existingValues) != ApprovalSnapshot.Canonicalize(incomingValues)) throw new InvalidOperationException("approval_evidence_immutable: changed evidence rejected");
            }
            else _context.Add(incoming);
        }
    }
}
