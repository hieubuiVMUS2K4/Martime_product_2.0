using System.ComponentModel.DataAnnotations;
using System.Text.Json;
using Maritime.Shared.Models.Sync;
using MaritimeEdge.DTOs;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Core;
using MaritimeEdge.Services.Inventory;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Maintenance;

public sealed partial class PmsWorkOrderWorkflowService
{
    public async Task<PmsWorkflowResult> CreateAdHocAsync(CreatePmsAdHocOrderDto dto, long userId, string originNode,
        string device, CancellationToken token = default)
    {
        Enabled(); ValidateDevice(device); ValidateAdHocDefinition(dto);
        if (dto.CommandId == Guid.Empty) throw new PmsRequestException(400, "Thiếu mã yêu cầu tạo WO.");
        if (string.IsNullOrWhiteSpace(originNode) || originNode.Length > 50)
            throw new PmsRequestException(503, "Chưa xác định danh tính tàu hợp lệ.");
        var commandHash = ApprovalSnapshot.Hash(ApprovalSnapshot.Canonicalize(new { userId, dto }));
        await using var tx = await InventoryWriteScope.BeginAsync(db);
        var actor = await Actor(userId, "pms.work.create", token);
        // Keep the receipt on the order even after draft edits/deletion. Retry cannot recreate it.
        var existing = await db.MaintenanceTasks.SingleOrDefaultAsync(t => t.OriginNode == originNode && t.CreationCommandId == dto.CommandId, token);
        if (existing != null)
        {
            await db.Entry(existing).ReloadAsync(token);
            if (existing.CreatedByUserId != userId || existing.CreationCommandHash != commandHash)
                Conflict("Mã tạo WO đã dùng cho người/nội dung khác.");
            if (existing.IsDeleted) throw new PmsRequestException(410, "WO nháp đã xóa; yêu cầu cũ không tạo lại WO.");
            if (tx != null) await tx.CommitAsync(token);
            return Result(existing);
        }
        var order = new MaintenanceTask
        {
            PmsProtocolVersion = 2, TaskType = "AD_HOC", Status = "DRAFT", WorkflowVersion = 1, ReportRevision = 0,
            OriginNode = originNode, CreationCommandId = dto.CommandId, CreationCommandHash = commandHash,
            CreatedByUserId = userId, CreatedAt = Now, UpdatedAt = Now
        };
        order.TaskId = $"WO-{order.Id:N}";
        await ApplyAdHocDefinition(order, dto, actor, token);
        db.MaintenanceTasks.Add(order);
        if (dto.IssueNow) await IssueAdHoc(order, token);
        History(order, actor, "", dto.IssueNow ? "Tạo và phát hành WO đột xuất" : "Lưu WO đột xuất nháp", device);
        await db.SaveChangesAsync(token);
        if (tx != null) await tx.CommitAsync(token);
        return Result(order);
    }

    public Task<PmsWorkflowResult> UpdateAdHocDraftAsync(Guid id, UpdatePmsAdHocDraftDto dto, long userId, string device,
        CancellationToken token = default) => Write(id, dto.ExpectedVersion, userId, "pms.work.update", device, async (order, actor) =>
        {
            AdHocDraft(order); ValidateAdHocDefinition(dto);
            await ApplyAdHocDefinition(order, dto, actor, token);
            History(order, actor, "DRAFT", "Cập nhật WO đột xuất nháp", device);
            return null;
        }, token);

    public Task<PmsWorkflowResult> IssueAdHocDraftAsync(Guid id, IssuePmsAdHocDraftDto dto, long userId, string device,
        CancellationToken token = default) => Write(id, dto.ExpectedVersion, userId, "pms.work.create", device, async (order, actor) =>
        {
            AdHocDraft(order); await IssueAdHoc(order, token);
            // Publishing an assigned draft is also a current assignment decision.
            if (order.AssignedTo != null) await Actor(userId, "pms.work.assign", token);
            History(order, actor, "DRAFT", "Phát hành WO đột xuất", device);
            return null;
        }, token);

    public Task<PmsWorkflowResult> DeleteAdHocDraftAsync(Guid id, int expectedVersion, long userId, string device,
        CancellationToken token = default) => Write(id, expectedVersion, userId, "pms.work.delete", device, async (order, actor) =>
        {
            AdHocDraft(order);
            if (await db.PmsWorkOrderReports.AnyAsync(r => r.WorkOrderId == id, token) || order.StartedAt != null)
                Conflict("WO đã có thực hiện/báo cáo, không được xóa nháp.");
            order.IsDeleted = true; order.DeletedAt = Now; order.DeletedBy = actor.Username;
            History(order, actor, "DRAFT", "Xóa mềm WO nháp; giữ mã và yêu cầu tạo", device);
            return null;
        }, token);

    public static string[] MissingAdHocInformation(MaintenanceTask order)
    {
        var missing = new List<string>();
        if (string.IsNullOrWhiteSpace(order.TaskDescription)) missing.Add("Tên công việc");
        if (!order.EquipmentAssetId.HasValue) missing.Add("Thiết bị cụ thể");
        if (!order.WorkOrderDueAt.HasValue && !order.WorkOrderDueHours.HasValue) missing.Add("Hạn ngày hoặc giờ chạy");
        return missing.ToArray();
    }

    private static void ValidateDevice(string device)
    { if (device is not ("WEB" or "MOBILE")) throw new PmsRequestException(400, "Nguồn thao tác không hợp lệ."); }

    private static void AdHocDraft(MaintenanceTask order)
    {
        if (order.Status != "DRAFT" || order.TaskType != "AD_HOC" || order.ScheduleId != null || order.CreationCommandId == null)
            Conflict("Chỉ sửa/phát hành/xóa WO đột xuất đang nháp. WO đã phát hành giữ nguyên nội dung.");
    }

    private static void ValidateAdHocDefinition(PmsAdHocDefinitionDto dto)
    {
        var errors = new List<ValidationResult>();
        if (!Validator.TryValidateObject(dto, new ValidationContext(dto), errors, true))
            throw new PmsRequestException(400, string.Join(" ", errors.Select(e => e.ErrorMessage)));
        if (dto.DueDate is { Year: < 1900 or > 9998 } || dto.DueHours.HasValue && !double.IsFinite(dto.DueHours.Value) || !double.IsFinite(dto.WarningHours))
            throw new PmsRequestException(400, "Mốc hạn/cảnh báo không hợp lệ.");
        if (dto.SupportingCrewIds == null || dto.SupportingCrewIds.Any(c => string.IsNullOrWhiteSpace(c) || c.Length > 50) ||
            dto.SupportingCrewIds.Distinct().Count() != dto.SupportingCrewIds.Length || dto.SupportingCrewIds.Contains(dto.CrewId ?? "") ||
            string.IsNullOrWhiteSpace(dto.CrewId) && dto.SupportingCrewIds.Length != 0)
            throw new PmsRequestException(400, "Cần PIC hợp lệ trước khi chọn người hỗ trợ; không chọn trùng người.");
        if (dto.Checklist == null || dto.Checklist.Any(c => c == null) ||
            dto.Checklist.Select(c => c.SequenceOrder).Distinct().Count() != dto.Checklist.Count)
            throw new PmsRequestException(400, "Checklist không hợp lệ hoặc trùng thứ tự.");
        foreach (var item in dto.Checklist)
        {
            var itemErrors = new List<ValidationResult>();
            if (!Validator.TryValidateObject(item, new(item), itemErrors, true) || item.SequenceOrder < 1 ||
                item.NormalRangeMin.HasValue && !double.IsFinite(item.NormalRangeMin.Value) ||
                item.NormalRangeMax.HasValue && !double.IsFinite(item.NormalRangeMax.Value) || item.NormalRangeMin > item.NormalRangeMax)
                throw new PmsRequestException(400, "Nội dung/thứ tự/khoảng đo checklist không hợp lệ.");
        }
    }

    private async Task ApplyAdHocDefinition(MaintenanceTask order, PmsAdHocDefinitionDto dto, ApprovalActor actor, CancellationToken token)
    {
        EquipmentAsset? asset = null;
        if (dto.EquipmentAssetId.HasValue)
        {
            asset = await db.EquipmentAssets.SingleOrDefaultAsync(a => a.Id == dto.EquipmentAssetId, token);
            if (asset != null) await db.Entry(asset).ReloadAsync(token);
            if (asset == null || !asset.IsActive || asset.Category == "SYSTEM" || asset.Status == "DECOMMISSIONED")
                throw new PmsRequestException(400, "Chọn thiết bị cụ thể còn sử dụng; không chọn thư mục thiết bị.");
        }
        var pic = string.IsNullOrWhiteSpace(dto.CrewId) ? null : dto.CrewId;
        var support = dto.SupportingCrewIds.Order().ToArray();
        var previousSupport = Read<string>(order.SupportingCrewIds).Order().ToArray();
        if (order.AssignedTo != pic || !previousSupport.SequenceEqual(support)) await Actor(actor.UserId, "pms.work.assign", token);
        await ValidateAdHocCrew(pic, support, token);
        order.TaskDescription = dto.Name?.Trim() ?? ""; order.WorkOrderInstructions = dto.Instructions?.Trim();
        order.EquipmentAssetId = asset?.Id; order.EquipmentId = asset?.AssetCode;
        order.EquipmentName = asset?.AssetName; order.EquipmentAssetName = asset?.AssetName;
        order.Priority = dto.Priority; order.AssignedDepartment = dto.Department?.Trim();
        order.AssignedTo = pic; order.SupportingCrewIds = JsonSerializer.Serialize(support);
        order.WorkOrderDueAt = dto.DueDate.HasValue ? VesselDateToUtc(dto.DueDate.Value) : null;
        order.WorkOrderDueHours = dto.DueHours; order.WorkOrderWarningDays = dto.WarningDays; order.WorkOrderWarningHours = dto.WarningHours;
        order.NextDueAt = order.WorkOrderDueAt ?? DateTime.SpecifyKind(DateTime.MaxValue.Date, DateTimeKind.Utc);
        order.DueState = "NO_DEADLINE";
        // A draft may lack equipment; execution checklists require a real AssetId.
        // Store templates separately until issue instead of creating fake equipment/checklist rows.
        order.DraftChecklistJson = JsonSerializer.Serialize(dto.Checklist);
    }

    private DateTime VesselDateToUtc(DateOnly date)
    {
        var local = date.ToDateTime(TimeOnly.MinValue, DateTimeKind.Unspecified);
        var zone = Zone();
        if (zone.IsInvalidTime(local)) throw new PmsRequestException(400, "Ngày hạn không có mốc đầu ngày hợp lệ trong múi giờ tàu.");
        return TimeZoneInfo.ConvertTimeToUtc(local, zone);
    }

    private async Task ValidateAdHocCrew(string? pic, IReadOnlyCollection<string> support, CancellationToken token)
    {
        if (pic == null) return;
        var all = support.Append(pic).ToArray();
        if (await db.CrewMembers.CountAsync(c => all.Contains(c.CrewId) && c.Rank != null && c.Rank.IsActive && (c.IsOnboard || c.OnboardStatus == "Approved"), token) != all.Length)
            throw new PmsRequestException(400, "PIC/người hỗ trợ phải có chức danh hoạt động và đang trên tàu.");
    }

    private async Task IssueAdHoc(MaintenanceTask order, CancellationToken token)
    {
        var missing = MissingAdHocInformation(order);
        if (missing.Length != 0) throw new PmsRequestException(400, "Chưa thể phát hành, thiếu: " + string.Join(", ", missing));
        var asset = await db.EquipmentAssets.SingleOrDefaultAsync(a => a.Id == order.EquipmentAssetId, token);
        if (asset != null) await db.Entry(asset).ReloadAsync(token);
        if (asset == null || !asset.IsActive || asset.Category == "SYSTEM" || asset.Status == "DECOMMISSIONED")
            throw new PmsRequestException(400, "Thiết bị không còn sử dụng, không thể phát hành WO.");
        await ValidateAdHocCrew(order.AssignedTo, Read<string>(order.SupportingCrewIds), token);
        // Use the freshly resolved equipment identity in the released definition.
        order.EquipmentId = asset.AssetCode; order.EquipmentName = asset.AssetName; order.EquipmentAssetName = asset.AssetName;
        if (await db.TaskChecklistItems.AnyAsync(c => c.TaskId == order.TaskId, token))
            Conflict("WO nháp đã có checklist thực hiện; cần đối soát trước khi phát hành.");
        var templates = Read<PmsAdHocChecklistDto>(order.DraftChecklistJson);
        foreach (var item in templates)
            db.TaskChecklistItems.Add(new()
            {
                TaskId = order.TaskId, AssetId = asset.Id, AssetCode = asset.AssetCode, AssetName = asset.AssetName,
                SequenceOrder = item.SequenceOrder, CheckpointDescription = item.CheckpointDescription.Trim(), RequiresReading = item.RequiresReading,
                NormalRangeMin = item.NormalRangeMin, NormalRangeMax = item.NormalRangeMax, Unit = item.Unit
            });
        var checklist = db.TaskChecklistItems.Local.Where(c => c.TaskId == order.TaskId && db.Entry(c).State != EntityState.Deleted)
            .OrderBy(c => c.SequenceOrder).Select(c => new { c.Id, c.SequenceOrder, c.CheckpointDescription, c.RequiresReading, c.NormalRangeMin, c.NormalRangeMax, c.Unit }).ToArray();
        order.JobSnapshot = ApprovalSnapshot.Canonicalize(new
        {
            schemaVersion = 2, source = "AD_HOC", jobId = (Guid?)null, order.TaskDescription, order.WorkOrderInstructions,
            asset = new { asset.Id, asset.AssetCode, asset.AssetName }, order.Priority, order.AssignedDepartment,
            order.WorkOrderDueAt, order.WorkOrderDueHours, deadlinePrecision = "VESSEL_DATE_OR_COUNTER", checklist
        });
        order.DueState = PmsJobRules.DueState(order.WorkOrderDueAt, order.WorkOrderDueHours, asset.CurrentRunningHours,
            Now, Zone(), order.WorkOrderWarningDays ?? 7, order.WorkOrderWarningHours ?? 50);
        order.Status = order.AssignedTo == null ? "UNASSIGNED" : "ASSIGNED";
        order.DraftChecklistJson = null;
    }
}
