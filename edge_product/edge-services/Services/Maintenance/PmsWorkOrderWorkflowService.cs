using System.Text.Json;
using Maritime.Shared.Models.Sync;
using MaritimeEdge.Data;
using MaritimeEdge.DTOs;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Core;
using MaritimeEdge.Services.Inventory;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Maintenance;

public sealed partial class PmsWorkOrderWorkflowService(EdgeDbContext db, RankPermissionService permissions,
    IConfiguration configuration, TimeProvider? clock = null)
{
    // PostgreSQL stores microseconds. Freeze the same instant in JSON, metadata and the next cycle.
    private DateTime Now
    {
        get
        {
            var utc = (clock ?? TimeProvider.System).GetUtcNow().UtcDateTime;
            return new DateTime(utc.Ticks - utc.Ticks % 10, DateTimeKind.Utc);
        }
    }
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private void Enabled()
    { if (!configuration.GetValue<bool>("Pms:ReworkApiEnabled")) throw new PmsRequestException(503, "Workflow WO mới chưa được bật."); }

    public async Task<PmsWorkflowResult> ReleaseAsync(ReleasePmsWorkOrderDto dto, long userId, CancellationToken token = default)
    {
        Enabled();
        if (dto.ExpectedJobVersion < 1) throw new PmsRequestException(400, "Thiếu phiên bản Job.");
        if (string.IsNullOrWhiteSpace(dto.ExpectedCycleKey) || dto.ExpectedCycleKey.Length > 120)
            throw new PmsRequestException(400, "Thiếu khóa kỳ cần phát hành.");
        if (dto.EarlyReleaseReason?.Length > 2000) throw new PmsRequestException(400, "Lý do phát hành quá dài.");
        await using var tx = await InventoryWriteScope.BeginAsync(db);
        await Actor(userId, "pms.work.create", token);
        MaintenanceTask? order;
        try { order = await new PmsWorkOrderReleaseService(db).ReleasePeriodicAsync(dto.JobId, Now, Zone(), false, dto.EarlyReleaseReason, token, dto.ExpectedJobVersion, dto.ExpectedCycleKey); }
        catch (KeyNotFoundException) { throw new PmsRequestException(404, "Không tìm thấy Job."); }
        catch (InvalidOperationException e) { throw new PmsRequestException(409, e.Message); }
        if (order == null || order.Status == "CANCELLED" || order.IsDeleted) throw new PmsRequestException(409, "Kỳ này chưa được phát hành hoặc lệnh đã hủy; không tạo lại tự động.");
        if (tx != null) await tx.CommitAsync(token);
        return Result(order);
    }

    public Task<PmsWorkflowResult> AssignAsync(Guid id, AssignPmsWorkOrderDto dto, long userId, string device, CancellationToken token = default) =>
        Write(id, dto.ExpectedVersion, userId, "pms.work.assign", device, async (order, actor) =>
        {
            if (order.Status is not ("UNASSIGNED" or "ASSIGNED" or "IN_PROGRESS" or "RECTIFY")) Conflict("Không thể phân công ở trạng thái hiện tại.");
            var support = dto.SupportingCrewIds ?? [];
            if (string.IsNullOrWhiteSpace(dto.CrewId) || dto.CrewId.Length > 50 || dto.Reason?.Length > 2000 ||
                support.Length > 30 || support.Any(s => string.IsNullOrWhiteSpace(s) || s.Length > 50) || support.Contains(dto.CrewId) || support.Distinct().Count() != support.Length)
                throw new PmsRequestException(400, "Người thực hiện/người hỗ trợ không hợp lệ.");
            var all = support.Append(dto.CrewId).ToArray();
            var valid = await db.CrewMembers.CountAsync(c => all.Contains(c.CrewId) && c.Rank != null && c.Rank.IsActive && (c.IsOnboard || c.OnboardStatus == "Approved"), token);
            if (valid != all.Length) throw new PmsRequestException(400, "Người được giao phải có chức danh hoạt động và đang trên tàu.");
            if (order.AssignedTo != null && string.IsNullOrWhiteSpace(dto.Reason)) throw new PmsRequestException(400, "Phân công lại cần có lý do bàn giao.");
            var before = order.Status;
            order.AssignedTo = dto.CrewId; order.SupportingCrewIds = JsonSerializer.Serialize(support.Order().ToArray());
            if (before == "UNASSIGNED") order.Status = "ASSIGNED";
            History(order, actor, before, dto.Reason ?? "Phân công WO", device);
            return null;
        }, token);

    public Task<PmsWorkflowResult> StartAsync(Guid id, StartPmsWorkOrderDto dto, long userId, string device, CancellationToken token = default) =>
        Write(id, dto.ExpectedVersion, userId, "pms.work.execute", device, async (order, actor) =>
        {
            Executor(order, actor);
            if (order.Status is not ("ASSIGNED" or "RECTIFY")) Conflict("Chỉ bắt đầu lệnh đã phân công hoặc cần làm lại.");
            var before = order.Status;
            if (order.EquipmentAssetId.HasValue)
            {
                var asset = await db.EquipmentAssets.SingleAsync(a => a.Id == order.EquipmentAssetId, token);
                await db.Entry(asset).ReloadAsync(token);
                if (!asset.IsActive || asset.Status == "DECOMMISSIONED") Conflict("Thiết bị đã ngừng sử dụng.");
                order.ExecutionStartedHours ??= asset.CurrentRunningHours;
                order.ActualRunningHours ??= asset.CurrentRunningHours;
                if (asset.Status != "UNDER_MAINTENANCE") asset.MaintenancePreviousStatus = asset.Status;
                asset.Status = "UNDER_MAINTENANCE"; asset.UpdatedAt = Now; asset.IsSynced = false;
            }
            order.Status = "IN_PROGRESS"; order.StartedAt ??= Now; order.StartedBy ??= actor.CrewId;
            Contribute(order, actor); History(order, actor, before, before == "RECTIFY" ? "Bắt đầu làm lại" : "Nhận và bắt đầu", device);
            return null;
        }, token);

    public Task<PmsWorkflowResult> SaveAsync(Guid id, SavePmsExecutionDto dto, long userId, string device, CancellationToken token = default) =>
        Write(id, dto.ExpectedVersion, userId, "pms.work.execute", device, async (order, actor) =>
        {
            await ApplyResults(order, dto, actor, false, token);
            History(order, actor, order.Status, "Lưu kết quả đang làm", device);
            return null;
        }, token);

    public Task<PmsWorkflowResult> SubmitAsync(Guid id, SubmitPmsExecutionDto dto, long userId, string device, CancellationToken token = default)
    {
        if (dto.CommandId == Guid.Empty) throw new PmsRequestException(400, "Thiếu mã yêu cầu gửi duyệt.");
        var commandHash = ApprovalSnapshot.Hash(ApprovalSnapshot.Canonicalize(new { userId, dto }));
        return Write(id, dto.ExpectedVersion, userId, "pms.work.execute", device, async (order, actor) =>
        {
            await ApplyResults(order, dto, actor, true, token);
            var items = await db.TaskChecklistItems.Where(c => c.TaskId == order.TaskId).OrderBy(c => c.SequenceOrder).ThenBy(c => c.Id).ToListAsync(token);
            var usage = Read<PmsMaterialUsageDto>(order.SparePartsUsed);
            var materialIds = usage.Select(m => m.MaterialItemId).ToArray();
            var catalog = await db.MaterialItems.AsNoTracking().Where(m => materialIds.Contains(m.Id)).ToDictionaryAsync(m => m.Id, token);
            var materialSnapshot = usage.Select(m => new PmsSubmittedMaterial(m.MaterialItemId, catalog[m.MaterialItemId].ItemCode,
                catalog[m.MaterialItemId].Name, catalog[m.MaterialItemId].Unit, m.Quantity)).ToArray();
            order.ReportRevision = (order.ReportRevision ?? 0) + 1;
            var snapshot = new PmsSubmissionSnapshot(2, order.Id, order.WorkOrderCode ?? order.TaskId, order.ScheduleId, order.JobSnapshot,
                order.EquipmentAssetId, order.TaskDescription, order.WorkOrderDueAt, order.WorkOrderDueHours, Now,
                actor.UserId, actor.CrewId!, order.Notes, order.ActualDuration!.Value, order.ActualRunningHours,
                items.Select(c => new PmsSubmittedChecklist(c.Id, c.CheckpointDescription, c.IsCompleted, c.ReadingValue, c.Unit, c.Remarks, c.IsAbnormal)).ToArray(),
                materialSnapshot, Read<PmsExecutionActor>(order.ExecutionActors));
            var text = ApprovalSnapshot.Canonicalize(snapshot);
            var report = new PmsWorkOrderReport { WorkOrderId = order.Id, JobId = order.ScheduleId, Revision = order.ReportRevision.Value,
                SubmitCommandId = dto.CommandId, CommandHash = commandHash, SubmittedAt = snapshot.SubmittedAt,
                ExecutedRunningHours = snapshot.RunningHours, DurationMinutes = snapshot.DurationMinutes, DueAt = snapshot.DueAt, DueHours = snapshot.DueHours,
                WasOverdue = PmsJobRules.DueState(snapshot.DueAt, snapshot.DueHours, snapshot.RunningHours, snapshot.SubmittedAt, Zone(), 0, 0) == "OVERDUE",
                SubmittedByUserId = actor.UserId, SubmittedByCrewId = actor.CrewId!, SnapshotJson = text,
                ContentHash = ApprovalSnapshot.Hash(text), OriginNode = order.OriginNode, CreatedAt = Now };
            db.PmsWorkOrderReports.Add(report);
            order.SubmittedAt = report.SubmittedAt; order.SubmittedBy = actor.CrewId; order.Status = "PENDING_APPROVAL";
            History(order, actor, "IN_PROGRESS", "Gửi kết quả kiểm tra", device);
            return report;
        }, token, dto.CommandId, commandHash);
    }

    public Task<PmsWorkflowResult> DecideAsync(Guid id, DecidePmsWorkOrderDto dto, long userId, bool approve,
        PmsApprovalEvidence evidence, string device, CancellationToken token = default) =>
        Write(id, dto.ExpectedVersion, userId, approve ? "pms.work.approve" : "pms.work.reject", device, async (order, actor) =>
        {
            if (evidence.ActionId == Guid.Empty || evidence.RevisionId == Guid.Empty || string.IsNullOrWhiteSpace(evidence.ContentHash))
                throw new PmsRequestException(428, "Cần xác nhận tài khoản qua luồng ký duyệt.");
            if (order.Status != "PENDING_APPROVAL" || order.ReportRevision != dto.Revision) Conflict("WO không còn chờ duyệt ở lượt này.");
            var report = await db.PmsWorkOrderReports.SingleAsync(r => r.WorkOrderId == id && r.Revision == dto.Revision, token);
            await db.Entry(report).ReloadAsync(token);
            if (report.Decision != null || dto.ReportHash != report.ContentHash || ApprovalSnapshot.Hash(report.SnapshotJson) != report.ContentHash)
                Conflict("Báo cáo đã thay đổi hoặc đã được xử lý.");
            var frozen = JsonSerializer.Deserialize<PmsSubmissionSnapshot>(report.SnapshotJson, Json) ?? throw new PmsRequestException(409, "Báo cáo không hợp lệ.");
            if (frozen.WorkOrderId != id || frozen.JobId != order.ScheduleId) Conflict("Báo cáo không thuộc WO/Job này.");
            if (frozen.Contributors.Any(c => c.UserId == actor.UserId || c.CrewId == actor.CrewId))
                throw new PmsRequestException(403, "Người thực hiện không tự kiểm tra/duyệt báo cáo của mình.");
            if (!approve && string.IsNullOrWhiteSpace(dto.Reason)) throw new PmsRequestException(400, "Trả lại phải có lý do.");
            if (dto.Reason?.Length > 2000) throw new PmsRequestException(400, "Lý do quá dài.");
            if (approve)
            {
                await PostMaterials(order, report, frozen.Materials, token);
                order.Status = "COMPLETED"; order.CompletedAt = Now; order.CompletedBy = frozen.SubmittedByCrewId;
                order.LastDoneAt = frozen.SubmittedAt; order.SubmittedAt = frozen.SubmittedAt;
                order.ActualRunningHours = frozen.RunningHours; order.ActualDuration = frozen.DurationMinutes;
                order.ApprovedAt = Now; order.ApprovedBy = actor.CrewId ?? actor.Username;
                order.DueState = PmsJobRules.DueState(frozen.DueAt, frozen.DueHours, frozen.RunningHours, frozen.SubmittedAt, Zone(), 0, 0);
                if (order.ScheduleId.HasValue)
                {
                    var job = await db.MaintenanceSchedules.SingleAsync(j => j.Id == order.ScheduleId, token);
                    await db.Entry(job).ReloadAsync(token);
                    if (job.PmsProtocolVersion != 2) Conflict("Job chưa được chuyển sang protocol mới.");
                    if (job.MaintenanceCategory == "PERIODIC")
                    {
                        try { PmsJobRules.ApplyApprovedExecution(job, order); }
                        catch (InvalidOperationException e) { throw new PmsRequestException(409, e.Message); }
                    }
                    job.UpdatedAt = Now; job.IsSynced = false;
                }
                if (order.EquipmentAssetId.HasValue)
                {
                    var asset = await db.EquipmentAssets.SingleAsync(a => a.Id == order.EquipmentAssetId, token);
                    await db.Entry(asset).ReloadAsync(token);
                    if (frozen.RunningHours > (asset.CurrentRunningHours ?? 0))
                    { asset.CurrentRunningHours = frozen.RunningHours; asset.LastRunningHoursUpdate = Now; asset.UpdatedAt = Now; asset.IsSynced = false; }
                }
                await RestoreEquipment(order, token);
            }
            else
            {
                order.Status = "RECTIFY"; order.RejectionReason = dto.Reason; order.RejectionCount++;
                order.LastRejectedAt = Now; order.LastRejectedBy = actor.CrewId ?? actor.Username;
            }
            order.VerifiedAt = Now; order.VerifiedBy = actor.CrewId ?? actor.Username;
            order.VerificationResult = approve ? "APPROVED" : "REJECTED"; order.VerificationNotes = dto.Reason;
            report.Decision = approve ? "APPROVED" : "RETURNED"; report.DecidedAt = Now;
            report.DecidedByUserId = actor.UserId; report.DecidedByCrewId = actor.CrewId; report.DecisionReason = dto.Reason;
            report.ApprovalEvidenceJson = JsonSerializer.Serialize(new { evidence, actor, completionDueState = order.DueState }); report.IsSynced = false;
            History(order, actor, "PENDING_APPROVAL", dto.Reason ?? "Phê duyệt kết quả", device);
            return report;
        }, token);

    public Task<PmsWorkflowResult> CancelAsync(Guid id, CancelPmsWorkOrderDto dto, long userId, string device, CancellationToken token = default) =>
        Write(id, dto.ExpectedVersion, userId, "pms.work.update", device, async (order, actor) =>
        {
            if (order.Status is "DRAFT" or "PENDING_APPROVAL" or "COMPLETED" or "CANCELLED") Conflict("Không thể hủy lệnh ở trạng thái này; WO nháp dùng thao tác xóa nháp.");
            if (string.IsNullOrWhiteSpace(dto.Reason) || dto.Reason.Length > 2000) throw new PmsRequestException(400, "Cần lý do hủy hợp lệ.");
            var before = order.Status; order.Status = "CANCELLED"; order.CancelledAt = Now;
            order.CancelledBy = actor.CrewId ?? actor.Username; order.CancellationReason = dto.Reason;
            History(order, actor, before, dto.Reason, device); await RestoreEquipment(order, token);
            return null;
        }, token);

    private async Task<PmsWorkflowResult> Write(Guid id, int version, long userId, string grant, string device,
        Func<MaintenanceTask, ApprovalActor, Task<PmsWorkOrderReport?>> operation, CancellationToken token,
        Guid? command = null, string? commandHash = null)
    {
        Enabled(); if (device is not ("WEB" or "MOBILE")) throw new PmsRequestException(400, "Nguồn thao tác không hợp lệ.");
        await using var tx = await InventoryWriteScope.BeginAsync(db);
        var order = await db.MaintenanceTasks.SingleOrDefaultAsync(t => t.Id == id && t.PmsProtocolVersion == 2 && !t.IsDeleted, token)
            ?? throw new PmsRequestException(404, "Không tìm thấy WO.");
        await db.Entry(order).ReloadAsync(token);
        var actor = await Actor(userId, grant, token);
        if (command.HasValue)
        {
            var replay = await db.PmsWorkOrderReports.SingleOrDefaultAsync(r => r.WorkOrderId == id && r.SubmitCommandId == command, token);
            if (replay != null)
            {
                if (replay.SubmittedByUserId != userId || replay.CommandHash != commandHash || replay.Revision != order.ReportRevision || order.Status != "PENDING_APPROVAL")
                    Conflict("Yêu cầu gửi đã được xử lý hoặc dùng cho nội dung khác.");
                if (tx != null) await tx.CommitAsync(token); return Result(order, replay);
            }
        }
        if (version != (order.WorkflowVersion ?? 0)) Conflict("WO đã thay đổi. Tải lại trước khi thao tác.");
        var report = await operation(order, actor);
        order.WorkflowVersion = (order.WorkflowVersion ?? 0) + 1; order.UpdatedAt = Now; order.IsSynced = false;
        await db.SaveChangesAsync(token);
        if (tx != null) await tx.CommitAsync(token);
        return Result(order, report);
    }

    private async Task<ApprovalActor> Actor(long userId, string grant, CancellationToken token)
    {
        if (db.Database.IsNpgsql()) await db.Database.ExecuteSqlInterpolatedAsync($"SELECT id FROM users WHERE id = {userId} FOR SHARE", token);
        var user = await db.Users.AsNoTracking().Include(u => u.Role).SingleOrDefaultAsync(u => u.Id == userId && u.IsActive, token);
        if (user?.Role?.IsActive != true) throw new PmsRequestException(403, "Tài khoản không hoạt động.");
        var crew = await db.CrewMembers.AsNoTracking().Include(c => c.Rank).SingleOrDefaultAsync(c => c.CrewId == user.CrewId, token);
        if (db.Database.IsNpgsql() && crew?.RankId is int rank)
            await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(2026100602, {rank})", token);
        var effective = await permissions.GetAsync(userId);
        if (!effective.IsAccountActive || !PermissionRegistry.Allows(effective.Grants.ToHashSet(), grant)) throw new PmsRequestException(403, "Bạn chưa có quyền thao tác này.");
        if (grant == "pms.work.execute" && (crew?.Rank?.IsActive != true || !(crew.IsOnboard || crew.OnboardStatus == "Approved")))
            throw new PmsRequestException(403, "Cần tài khoản liên kết thuyền viên đang trên tàu để thực hiện.");
        return new(userId, user.Username, crew?.CrewId, crew?.FullName ?? user.Username, crew?.Rank?.RankName ?? "ADMIN", grant);
    }

    private static void Executor(MaintenanceTask order, ApprovalActor actor)
    { if (actor.CrewId == null || order.AssignedTo != actor.CrewId && !Read<string>(order.SupportingCrewIds).Contains(actor.CrewId)) throw new PmsRequestException(403, "Bạn không được giao thực hiện WO này."); }
    private void Contribute(MaintenanceTask order, ApprovalActor actor)
    {
        var actors = Read<PmsExecutionActor>(order.ExecutionActors).ToList();
        if (!actors.Any(a => a.UserId == actor.UserId && a.CrewId == actor.CrewId)) actors.Add(new(actor.UserId, actor.CrewId!));
        order.ExecutionActors = JsonSerializer.Serialize(actors);
    }

    private async Task ApplyResults(MaintenanceTask order, SavePmsExecutionDto dto, ApprovalActor actor, bool submitting, CancellationToken token)
    {
        Executor(order, actor); if (order.Status != "IN_PROGRESS") Conflict("Chỉ nhập kết quả khi WO đang thực hiện.");
        if (dto.Notes?.Length > 20000 || dto.ActualDurationMinutes < 0 || dto.ActualDurationMinutes > 525600 ||
            dto.RunningHours.HasValue && (!double.IsFinite(dto.RunningHours.Value) || dto.RunningHours < (order.ExecutionStartedHours ?? 0) || dto.RunningHours > 1000000000))
            throw new PmsRequestException(400, "Giờ chạy/thời gian/ghi chú không hợp lệ; số giờ không được thấp hơn mốc bắt đầu thực hiện.");
        if (submitting && !dto.ActualDurationMinutes.HasValue) throw new PmsRequestException(400, "Cần nhập thời gian thực hiện.");
        if (submitting && order.WorkOrderDueHours.HasValue && !dto.RunningHours.HasValue) throw new PmsRequestException(400, "Cần ghi giờ chạy cho WO theo giờ/HYBRID.");
        var items = await db.TaskChecklistItems.Where(c => c.TaskId == order.TaskId).ToListAsync(token);
        if (dto.Checklist == null || dto.Checklist.Any(c => c == null) || dto.Checklist.Count > 500 || dto.Checklist.Count != items.Count ||
            dto.Checklist.Select(c => c.Id).Distinct().Count() != dto.Checklist.Count || !items.Select(c => c.Id).ToHashSet().SetEquals(dto.Checklist.Select(c => c.Id)))
            throw new PmsRequestException(400, "Checklist phải đúng các hạng mục đã phát hành của WO.");
        foreach (var value in dto.Checklist)
        {
            var item = items.Single(c => c.Id == value.Id);
            if (value.Reading.HasValue && !double.IsFinite(value.Reading.Value) || value.Remarks?.Length > 1000 ||
                value.Completed && item.RequiresReading && !value.Reading.HasValue || submitting && !value.Completed)
                throw new PmsRequestException(400, "Hoàn thành checklist và số đo bắt buộc trước khi gửi.");
        }
        if (dto.Materials == null || dto.Materials.Count > 200 || dto.Materials.Any(m => m == null || m.MaterialItemId == Guid.Empty || m.Quantity <= 0 || m.Quantity > 999999999999.999999m || decimal.Round(m.Quantity, 6) != m.Quantity))
            throw new PmsRequestException(400, "Vật tư sử dụng/số lượng không hợp lệ.");
        var materials = dto.Materials.GroupBy(m => m.MaterialItemId).Select(g => new PmsMaterialUsageDto(g.Key, g.Sum(m => m.Quantity))).ToArray();
        if (materials.Any(m => m.Quantity > 999999999999.999999m)) throw new PmsRequestException(400, "Tổng số lượng vật tư vượt giới hạn.");
        var ids = materials.Select(m => m.MaterialItemId).ToArray();
        if (await db.MaterialItems.CountAsync(m => ids.Contains(m.Id), token) != ids.Length) throw new PmsRequestException(400, "Vật tư không tồn tại trong danh mục.");
        foreach (var value in dto.Checklist)
        {
            var item = items.Single(c => c.Id == value.Id);
            if (item.IsCompleted != value.Completed || item.ReadingValue != value.Reading || item.Remarks != value.Remarks)
            { item.CompletedAt = value.Completed ? Now : null; item.CompletedBy = value.Completed ? actor.CrewId : null; }
            item.IsCompleted = value.Completed; item.ReadingValue = value.Reading; item.Remarks = value.Remarks;
            item.IsAbnormal = value.Reading.HasValue && (value.Reading < item.NormalRangeMin || value.Reading > item.NormalRangeMax);
        }
        order.Notes = dto.Notes; order.ActualDuration = dto.ActualDurationMinutes; order.ActualRunningHours = dto.RunningHours;
        order.SparePartsUsed = JsonSerializer.Serialize(materials); order.ChecklistCompleted = items.All(c => c.IsCompleted); Contribute(order, actor);
    }

    private async Task PostMaterials(MaintenanceTask order, PmsWorkOrderReport report, IReadOnlyList<PmsSubmittedMaterial> usage, CancellationToken token)
    {
        if (await db.PmsWorkOrderMaterialPostings.AnyAsync(p => p.WorkOrderId == order.Id, token)) Conflict("WO đã có hạch toán vật tư.");
        var ids = usage.Select(u => u.MaterialItemId).ToArray();
        var trackedStocks = db.InventoryStocks.Local.Select(s => s.Id).ToHashSet();
        var trackedMaterials = db.MaterialItems.Local.Select(m => m.Id).ToHashSet();
        var stocks = await db.InventoryStocks.Where(s => ids.Contains(s.MaterialItemId)).OrderByDescending(s => s.Quantity).ThenBy(s => s.Id).ToListAsync(token);
        var materials = await db.MaterialItems.Where(m => ids.Contains(m.Id)).ToDictionaryAsync(m => m.Id, token);
        foreach (var stock in stocks.Where(s => trackedStocks.Contains(s.Id))) await db.Entry(stock).ReloadAsync(token);
        foreach (var material in materials.Values.Where(m => trackedMaterials.Contains(m.Id))) await db.Entry(material).ReloadAsync(token);
        foreach (var part in usage)
            if (!materials.ContainsKey(part.MaterialItemId) || !stocks.Any(s => s.MaterialItemId == part.MaterialItemId) ||
                stocks.Any(s => s.MaterialItemId == part.MaterialItemId && s.Quantity < 0) || stocks.Where(s => s.MaterialItemId == part.MaterialItemId).Sum(s => s.Quantity) < part.Quantity)
                throw new PmsRequestException(409, "Tồn kho theo vị trí chưa đủ/hợp lệ để duyệt báo cáo. Chưa trừ vật tư.");
        foreach (var part in usage)
        {
            var remaining = part.Quantity; var locations = new List<object>();
            foreach (var stock in stocks.Where(s => s.MaterialItemId == part.MaterialItemId))
            {
                if (remaining <= 0) break;
                var before = stock.Quantity; var take = Math.Min(before, remaining); if (take == 0) continue;
                stock.Quantity -= take; stock.UpdatedAt = Now; stock.IsSynced = false; remaining -= take;
                locations.Add(new { stock.Id, stock.StoreLocationId, before, after = stock.Quantity, used = take });
            }
            var material = materials[part.MaterialItemId]; material.OnHandQuantity = (double)stocks.Where(s => s.MaterialItemId == part.MaterialItemId).Sum(s => s.Quantity); material.UpdatedAt = Now;
            db.PmsWorkOrderMaterialPostings.Add(new() { WorkOrderId = order.Id, ReportId = report.Id, MaterialItemId = part.MaterialItemId,
                Quantity = part.Quantity, OriginNode = order.OriginNode, CreatedAt = Now,
                StockSnapshotJson = JsonSerializer.Serialize(new { ItemCode = part.Code, part.Name, part.Unit, locations }) });
        }
    }

    private async Task RestoreEquipment(MaintenanceTask order, CancellationToken token)
    {
        if (!order.EquipmentAssetId.HasValue) return;
        var id = order.EquipmentAssetId.Value;
        if (await db.MaintenanceTasks.AnyAsync(t => t.Id != order.Id && !t.IsDeleted && (t.Status == "IN_PROGRESS" || t.Status == "PENDING_APPROVAL" || t.Status == "RECTIFY") &&
            (t.EquipmentAssetId == id || t.EquipmentGroupId != null && db.EquipmentGroupMembers.Any(m => m.GroupId == t.EquipmentGroupId && m.AssetId == id)), token)) return;
        var asset = await db.EquipmentAssets.SingleAsync(a => a.Id == id, token);
        if (asset.Status == "UNDER_MAINTENANCE")
        { asset.Status = asset.MaintenancePreviousStatus ?? "ACTIVE"; asset.MaintenancePreviousStatus = null; asset.UpdatedAt = Now; asset.IsSynced = false; }
    }
    private void History(MaintenanceTask order, ApprovalActor actor, string before, string reason, string device) => db.TaskStatusHistories.Add(new()
    { TaskId = order.Id, FromStatus = before, ToStatus = order.Status, ChangedBy = actor.CrewId ?? actor.Username, ChangedAt = Now,
        Reason = reason, DeviceType = device, Notes = JsonSerializer.Serialize(new { actor.UserId, order.AssignedTo, order.SupportingCrewIds }) });
    private TimeZoneInfo Zone()
    {
        try { return TimeZoneInfo.FindSystemTimeZoneById(configuration["Pms:VesselTimeZone"] ?? ""); }
        catch (Exception e) when (e is TimeZoneNotFoundException or InvalidTimeZoneException or ArgumentException)
        { throw new PmsRequestException(503, "Chưa cấu hình múi giờ tàu hợp lệ."); }
    }
    private static List<T> Read<T>(string? text)
    { try { return text == null ? [] : JsonSerializer.Deserialize<List<T>>(text, Json) ?? []; } catch (JsonException) { throw new PmsRequestException(409, "Dữ liệu WO cần đối soát."); } }
    private static PmsWorkflowResult Result(MaintenanceTask order, PmsWorkOrderReport? report = null) =>
        new(order.Id, order.Status, order.WorkflowVersion ?? 0, order.ReportRevision ?? 0, report?.Id, report?.ContentHash);
    private static void Conflict(string reason) => throw new PmsRequestException(409, reason);
}
