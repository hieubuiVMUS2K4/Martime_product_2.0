using Maritime.Shared.Models.Sync;
using Microsoft.EntityFrameworkCore;
using ProductApi.Models;
using Xunit;

namespace ProductApi.Tests;

public partial class SyncReliabilityTests
{
    [ShorePostgresFact]
    public async Task SmsPull_BootstrapsSeededChaptersBeforeLegacyProcedures_AcrossPagesAndNodes()
    {
        await using var db = await Database();
        try
        {
            db.SuppressAutoOutbox = true;
            db.IsmElements.AddRange(new IsmElement { Id = 1, ChapterName = "Policy" },
                new IsmElement { Id = 7, ChapterName = "Operations" });
            var procedure = new SmsProcedure { IsmElementId = 7, ProcedureCode = "SMS-TEST", Title = "Operations" };
            db.SmsProcedures.Add(procedure);
            await db.SaveChangesAsync();
            var outbox = Outbox(db);
            // Reproduce existing production queues: child event exists, no chapter events.
            await outbox.BroadcastAsync("sms_procedures", procedure.Id.ToString(), SyncActionType.CREATE, procedure);

            foreach (var node in new[] { "sms-a", "sms-b" })
            {
                var first = await outbox.GetPendingItemsAsync(node, null, null, 1);
                var chapter1 = Assert.Single(first.Items);
                Assert.Equal("ism_element", chapter1.TableName);
                Assert.Equal("1", chapter1.RecordKey);
                // Retrying without ACK must neither release children nor duplicate chapters.
                Assert.Equal(chapter1.OutboxId, Assert.Single((await outbox.GetPendingItemsAsync(node, null, null, 1)).Items).OutboxId);
                Assert.Equal(2, await db.SyncOutbox.CountAsync(o => o.TargetNode == node && o.TableName == "ism_element"));
                await outbox.AcknowledgeDeliveryAsync(node, [chapter1.OutboxId]);
                var second = await outbox.GetPendingItemsAsync(node, null, first.NextCursor, 1);
                var chapter7 = Assert.Single(second.Items);
                Assert.Equal("ism_element", chapter7.TableName);
                Assert.Equal("7", chapter7.RecordKey);
                await outbox.AcknowledgeDeliveryAsync(node, [chapter7.OutboxId]);

                // The older child ID is intentionally picked up from the next cycle's start.
                var child = Assert.Single((await outbox.GetPendingItemsAsync(node, null, null, 50)).Items);
                Assert.Equal("sms_procedures", child.TableName);
                Assert.Equal(procedure.Id.ToString(), child.RecordKey);
                await outbox.AcknowledgeDeliveryAsync(node, [child.OutboxId]);
                Assert.Empty((await outbox.GetPendingItemsAsync(node, null, null, 50)).Items);
            }
        }
        finally { await db.Database.EnsureDeletedAsync(); }
    }
}
