using System.Text.Json;
using System.Data;
using MaritimeEdge.Data;
using MaritimeEdge.DTOs;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Inventory;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Maintenance;

public sealed class PmsJobService(EdgeDbContext db)
{
    private IQueryable<MaintenanceSchedule> Jobs => db.MaintenanceSchedules.AsNoTracking()
        .Where(j => j.PmsProtocolVersion == PmsJobRules.ProtocolVersion);

    private IQueryable<PmsJobRow> Rows(IQueryable<MaintenanceSchedule> source) => source.Select(j => new PmsJobRow(
        j.Id, j.ScheduleCode, j.WorkCode, j.ScheduleName, j.EquipmentAssetId,
        db.EquipmentAssets.Where(a => a.Id == j.EquipmentAssetId).Select(a => a.AssetName).FirstOrDefault(),
        j.MaintenanceCategory, j.IntervalType, j.IntervalDays, j.IntervalMonths, j.IntervalYears, j.IntervalHours,
        j.LastExecutedAt, j.LastExecutedRunningHours, j.NextDueDate, j.NextDueRunningHours,
        j.ResponsibleDepartment, j.ResponsibleRankId, j.ResponsibleCrewId,
        db.CrewMembers.Where(c => c.Id == j.ResponsibleCrewId).Select(c => c.FullName).FirstOrDefault(),
        j.JobState, j.JobVersion ?? 0, j.AutoGenerate,
        db.MaintenanceTasks.Where(t => t.ScheduleId == j.Id && !t.IsDeleted && t.Status != "COMPLETED" && t.Status != "CANCELLED" && t.Status != "DRAFT")
            .OrderByDescending(t => t.CreatedAt).Select(t => (Guid?)t.Id).FirstOrDefault(),
        db.MaintenanceTasks.Where(t => t.ScheduleId == j.Id && !t.IsDeleted && t.Status != "COMPLETED" && t.Status != "CANCELLED" && t.Status != "DRAFT")
            .OrderByDescending(t => t.CreatedAt).Select(t => t.TaskId).FirstOrDefault()));

    public async Task<PmsPage<PmsJobRow>> ListAsync(PmsJobQuery q, CancellationToken token = default)
    {
        ValidatePage(q.Page, q.PageSize);
        var jobs = Jobs;
        if (!string.IsNullOrWhiteSpace(q.Name))
        {
            var term = q.Name.Trim().ToLowerInvariant();
            jobs = jobs.Where(j => j.ScheduleName.ToLower().Contains(term) || j.ScheduleCode.ToLower().Contains(term) || (j.WorkCode != null && j.WorkCode.ToLower().Contains(term)));
        }
        if (!string.IsNullOrWhiteSpace(q.Equipment))
        {
            var term = q.Equipment.Trim().ToLowerInvariant();
            jobs = jobs.Where(j => db.EquipmentAssets.Any(a => a.Id == j.EquipmentAssetId && (a.AssetName.ToLower().Contains(term) || a.AssetCode.ToLower().Contains(term))));
        }
        if (q.EquipmentAssetId.HasValue) jobs = jobs.Where(j => j.EquipmentAssetId == q.EquipmentAssetId);
        if (q.Category != null) jobs = jobs.Where(j => j.MaintenanceCategory == q.Category);
        if (q.State != null) jobs = jobs.Where(j => j.JobState == q.State);
        else jobs = jobs.Where(j => j.JobState != PmsJobRules.Removed);
        if (q.Department != null) jobs = jobs.Where(j => j.ResponsibleDepartment == q.Department);
        if (q.ResponsibleCrewId.HasValue) jobs = jobs.Where(j => j.ResponsibleCrewId == q.ResponsibleCrewId);
        if (q.DueFrom.HasValue) jobs = jobs.Where(j => j.NextDueDate >= q.DueFrom);
        if (q.DueTo.HasValue) jobs = jobs.Where(j => j.NextDueDate <= q.DueTo);
        if (q.DueHoursFrom.HasValue) jobs = jobs.Where(j => j.NextDueRunningHours >= q.DueHoursFrom);
        if (q.DueHoursTo.HasValue) jobs = jobs.Where(j => j.NextDueRunningHours <= q.DueHoursTo);
        ValidateRanges(q.DueFrom, q.DueTo, q.DueHoursFrom, q.DueHoursTo);
        var total = await jobs.CountAsync(token);
        IOrderedQueryable<MaintenanceSchedule> sorted = (q.Sort, q.Descending) switch
        {
            ("name", false) => jobs.OrderBy(j => j.ScheduleName), ("name", true) => jobs.OrderByDescending(j => j.ScheduleName),
            ("code", false) => jobs.OrderBy(j => j.ScheduleCode), ("code", true) => jobs.OrderByDescending(j => j.ScheduleCode),
            ("due", false) => jobs.OrderBy(j => j.NextDueDate == null).ThenBy(j => j.NextDueDate),
            ("due", true) => jobs.OrderBy(j => j.NextDueDate == null).ThenByDescending(j => j.NextDueDate),
            ("dueHours", false) => jobs.OrderBy(j => j.NextDueRunningHours == null).ThenBy(j => j.NextDueRunningHours),
            ("dueHours", true) => jobs.OrderBy(j => j.NextDueRunningHours == null).ThenByDescending(j => j.NextDueRunningHours),
            ("lastCompleted", false) => jobs.OrderBy(j => j.LastExecutedAt), ("lastCompleted", true) => jobs.OrderByDescending(j => j.LastExecutedAt),
            ("state", false) => jobs.OrderBy(j => j.JobState), ("state", true) => jobs.OrderByDescending(j => j.JobState),
            _ => throw new PmsRequestException(400, "Cột sắp xếp không hợp lệ.")
        };
        var items = await Rows(sorted.ThenBy(j => j.Id).Skip((q.Page - 1) * q.PageSize).Take(q.PageSize)).ToListAsync(token);
        return new(items, total, q.Page, q.PageSize);
    }

    public async Task<object> DetailAsync(Guid id, CancellationToken token = default)
    {
        await using var snapshot = db.Database.IsRelational() && db.Database.CurrentTransaction == null
            ? await db.Database.BeginTransactionAsync(IsolationLevel.RepeatableRead, token) : null;
        var entity = await Jobs.SingleOrDefaultAsync(j => j.Id == id, token)
            ?? throw new PmsRequestException(404, "Không tìm thấy Job.");
        var row = await Rows(Jobs.Where(j => j.Id == id)).SingleAsync(token);
        var checklist = await db.ScheduleChecklistTemplates.AsNoTracking().Where(c => c.ScheduleId == id)
            .OrderBy(c => c.SequenceOrder).Select(c => new ChecklistItemTemplateDto { SequenceOrder = c.SequenceOrder,
                CheckpointDescription = c.CheckpointDescription, RequiresReading = c.RequiresReading,
                NormalRangeMin = c.NormalRangeMin, NormalRangeMax = c.NormalRangeMax, Unit = c.Unit }).ToListAsync(token);
        var materials = await (from link in db.MaterialItemEquipments.AsNoTracking()
            join material in db.MaterialItems.AsNoTracking() on link.MaterialItemId equals material.Id
            where link.EquipmentAssetId == entity.EquipmentAssetId
            select new { material.Id, material.ItemCode, material.Name, material.Unit }).ToListAsync(token);
        var cycleKey = PmsJobRules.CycleKey(entity);
        var requiresCycleResolution = await db.MaintenanceTasks.AnyAsync(t => t.ScheduleId == id && t.CycleKey == cycleKey && (t.IsDeleted || t.Status == "CANCELLED"), token);
        var result = new { job = row, cycleKey, nextCycleNumber = entity.NextCycleNumber ?? 1, requiresCycleResolution,
            entity.Instructions, entity.BaselineAt, entity.BaselineRunningHours, entity.BaselineSource,
            entity.DaysBeforeDue, entity.WarningHours, entity.ReleasePolicy, entity.AssignmentPolicy,
            defaultCrewId = entity.AssignedToCrewId, entity.Priority, checklist, equipmentMaterials = materials,
            missingInformation = PmsJobRules.MissingInformation(entity) };
        if (snapshot != null) await snapshot.CommitAsync(token);
        return result;
    }

    public async Task<Guid> SaveAsync(Guid? id, SavePmsJobDto dto, long actorId, string originNode, CancellationToken token = default)
    {
        ValidateDto(dto);
        if (!id.HasValue && string.IsNullOrWhiteSpace(originNode)) throw new PmsRequestException(503, "Chưa xác định danh tính tàu.");
        await using var transaction = await InventoryWriteScope.BeginAsync(db);
        var job = id.HasValue ? await db.MaintenanceSchedules.SingleOrDefaultAsync(j => j.Id == id && j.PmsProtocolVersion == 2, token)
            ?? throw new PmsRequestException(404, "Không tìm thấy Job.") : new MaintenanceSchedule { AutoGenerate = false, OriginNode = originNode };
        if (id.HasValue)
        {
            await db.Entry(job).ReloadAsync(token);
            Version(job, dto.ExpectedVersion);
            if (job.JobState == PmsJobRules.Removed) throw new PmsRequestException(409, "Job đã xóa mềm; hãy khôi phục trước khi sửa.");
        }
        if (await db.MaintenanceSchedules.AnyAsync(j => j.Id != job.Id && j.ScheduleCode.ToLower() == dto.Code.Trim().ToLower(), token))
            throw new PmsRequestException(409, "Mã công việc đã tồn tại, kể cả cấu hình cũ/ngừng áp dụng. Hãy kiểm tra trước khi nhập lại.");
        if (dto.EquipmentAssetId.HasValue && !await db.EquipmentAssets.AnyAsync(a => a.Id == dto.EquipmentAssetId && a.IsActive && a.Category != "SYSTEM", token))
            throw new PmsRequestException(400, "Thiết bị không hợp lệ hoặc đã ngừng sử dụng.");
        if (dto.ResponsibleRankId.HasValue && !await db.Ranks.AnyAsync(r => r.Id == dto.ResponsibleRankId && r.IsActive, token))
            throw new PmsRequestException(400, "Chức danh chịu trách nhiệm không hợp lệ.");
        if (dto.ResponsibleCrewId.HasValue && !await db.CrewMembers.AnyAsync(c => c.Id == dto.ResponsibleCrewId && (c.IsOnboard || c.OnboardStatus == "Approved"), token))
            throw new PmsRequestException(400, "Người chịu trách nhiệm phải đang trên tàu.");
        if (dto.AssignmentPolicy == "PREASSIGNED" && !string.IsNullOrWhiteSpace(dto.DefaultCrewId) &&
            !await db.CrewMembers.AnyAsync(c => c.CrewId == dto.DefaultCrewId && (c.IsOnboard || c.OnboardStatus == "Approved") && c.Rank != null && c.Rank.IsActive, token))
            throw new PmsRequestException(400, "Người thực hiện mặc định không hợp lệ hoặc đã rời tàu.");
        var hasOrders = id.HasValue && (await db.MaintenanceTasks.AnyAsync(t => t.ScheduleId == job.Id, token)
            || await db.MaintenanceHistories.AnyAsync(h => h.ScheduleId == job.Id, token));
        if (hasOrders && job.EquipmentAssetId != dto.EquipmentAssetId)
            throw new PmsRequestException(409, "Job đã có WO/lịch sử; hãy tạo Job riêng cho thiết bị khác.");
        if (id.HasValue && (job.MaintenanceCategory != dto.Category || job.IntervalType != dto.IntervalType) &&
            await db.MaintenanceTasks.AnyAsync(t => t.ScheduleId == job.Id && t.Status != "COMPLETED" && t.Status != "CANCELLED" && !t.IsDeleted, token))
            throw new PmsRequestException(409, "Hãy xử lý WO đang mở trước khi đổi loại hoặc cơ chế chu kỳ của Job.");
        var baseline = dto.BaselineAt?.ToUniversalTime();
        var baselineChanged = id.HasValue && (job.BaselineAt != baseline || job.BaselineRunningHours != dto.BaselineRunningHours);
        if (baselineChanged && hasOrders && string.IsNullOrWhiteSpace(dto.ChangeReason))
            throw new PmsRequestException(400, "Thay mốc của Job đã vận hành phải có lý do.");
        var previousChecklist = await db.ScheduleChecklistTemplates.Where(c => c.ScheduleId == job.Id).ToListAsync(token);
        var before = id.HasValue ? JsonSerializer.Serialize(new { job, checklist = previousChecklist }) : null;
        ApplyDefinition(job, dto);
        try { PmsJobRules.PrepareForSave(job); }
        catch (ArgumentOutOfRangeException) { throw new PmsRequestException(400, "Chu kỳ hoặc mốc vượt phạm vi ngày được hỗ trợ."); }
        if (!id.HasValue) db.MaintenanceSchedules.Add(job);
        // Do not edit execution checklists. Each existing WO retains its released snapshot.
        db.ScheduleChecklistTemplates.RemoveRange(previousChecklist);
        foreach (var item in dto.Checklist)
            db.ScheduleChecklistTemplates.Add(new ScheduleChecklistTemplate { ScheduleId = job.Id,
                SequenceOrder = item.SequenceOrder, CheckpointDescription = item.CheckpointDescription.Trim(),
                RequiresReading = item.RequiresReading, NormalRangeMin = item.NormalRangeMin,
                NormalRangeMax = item.NormalRangeMax, Unit = item.Unit });
        job.UpdatedAt = DateTime.UtcNow; job.IsSynced = false;
        Audit(job.Id, actorId, id.HasValue ? "PMS_JOB_UPDATED" : "PMS_JOB_CREATED", before, JsonSerializer.Serialize(new { job, dto.Checklist, dto.ChangeReason }));
        await db.SaveChangesAsync(token);
        if (transaction != null) await transaction.CommitAsync(token);
        return job.Id;
    }

    public async Task ChangeStateAsync(Guid id, ChangePmsJobStateDto dto, long actorId, CancellationToken token = default)
    {
        if (dto.State is not (PmsJobRules.Active or PmsJobRules.Paused or PmsJobRules.Retired) || string.IsNullOrWhiteSpace(dto.Reason))
            throw new PmsRequestException(400, "Trạng thái không hợp lệ hoặc thiếu lý do.");
        await using var transaction = await InventoryWriteScope.BeginAsync(db);
        var job = await db.MaintenanceSchedules.SingleOrDefaultAsync(j => j.Id == id && j.PmsProtocolVersion == 2, token)
            ?? throw new PmsRequestException(404, "Không tìm thấy Job.");
        await db.Entry(job).ReloadAsync(token); Version(job, dto.ExpectedVersion);
        var before = job.JobState;
        job.JobState = dto.State == PmsJobRules.Active ? null : dto.State;
        PmsJobRules.PrepareForSave(job);
        job.UpdatedAt = DateTime.UtcNow; job.IsSynced = false;
        Audit(id, actorId, "PMS_JOB_STATE_CHANGED", before, JsonSerializer.Serialize(new { job.JobState, dto.Reason }));
        await db.SaveChangesAsync(token);
        if (transaction != null) await transaction.CommitAsync(token);
    }

    public async Task<PmsImportResult> ImportAsync(ImportPmsJobsDto request, long actorId, string originNode, CancellationToken token = default)
    {
        if (request.Rows == null || request.Rows.Count is < 1 or > 1000 || request.Rows.Any(r => r == null))
            throw new PmsRequestException(400, "File phải có từ 1 đến 1000 dòng hợp lệ.");
        if (string.IsNullOrWhiteSpace(originNode)) throw new PmsRequestException(503, "Chưa xác định danh tính tàu.");
        // Validation is read-only. The real import revalidates under the writer lock before any insert.
        await using var transaction = request.ValidateOnly ? null : await InventoryWriteScope.BeginAsync(db);
        var assetCodes = request.Rows.Select(r => (r.AssetCode ?? "").Trim().ToLowerInvariant()).Distinct().ToArray();
        var assets = (await db.EquipmentAssets.AsNoTracking().Where(a => a.IsActive && a.Category != "SYSTEM" && assetCodes.Contains(a.AssetCode.ToLower()))
            .ToListAsync(token)).ToLookup(a => a.AssetCode, StringComparer.OrdinalIgnoreCase);
        var codes = request.Rows.Select(r => (r.Code ?? "").Trim().ToLowerInvariant()).Distinct().ToArray();
        var existing = (await db.MaintenanceSchedules.AsNoTracking().Where(j => codes.Contains(j.ScheduleCode.ToLower()))
            .Select(j => j.ScheduleCode).ToListAsync(token)).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var duplicates = request.Rows.GroupBy(r => (r.Code ?? "").Trim(), StringComparer.OrdinalIgnoreCase).Where(g => g.Count() > 1)
            .Select(g => g.Key).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var issues = new List<PmsImportIssue>(); var jobs = new List<MaintenanceSchedule>();
        foreach (var row in request.Rows)
        {
            var code = (row.Code ?? "").Trim(); var errors = new List<string>();
            if (row.RowNumber < 1) errors.Add("Thiếu số dòng nguồn hợp lệ.");
            var matches = assets[(row.AssetCode ?? "").Trim()].ToArray();
            if (matches.Length != 1) errors.Add("Mã thiết bị không tồn tại, không duy nhất hoặc là nhóm/ngừng sử dụng.");
            if (duplicates.Contains(code)) errors.Add("Mã công việc trùng trong file.");
            if (existing.Contains(code)) errors.Add("Mã công việc đã tồn tại (kể cả legacy/ngừng áp dụng); không tự ghi đè hoặc đổi mã.");
            var dto = new SavePmsJobDto { Code = code, Name = row.Name, WorkCode = row.WorkCode, EquipmentAssetId = matches.FirstOrDefault()?.Id,
                Category = row.Category, IntervalType = row.IntervalType, IntervalDays = row.IntervalDays, IntervalMonths = row.IntervalMonths,
                IntervalYears = row.IntervalYears, IntervalHours = row.IntervalHours, Instructions = row.Instructions,
                Priority = row.Priority, Department = row.Department, AutoGenerate = false };
            try { ValidateDto(dto); } catch (PmsRequestException e) { errors.Add(e.Message); }
            if (errors.Count != 0) { issues.Add(new(row.RowNumber, code, errors.ToArray())); continue; }
            var job = new MaintenanceSchedule { OriginNode = originNode };
            ApplyDefinition(job, dto); PmsJobRules.PrepareForSave(job);
            jobs.Add(job);
        }
        if (issues.Count != 0) return new(false, 0, request.Rows.Count, issues);
        if (request.ValidateOnly) return new(true, 0, jobs.Count, []);
        db.MaintenanceSchedules.AddRange(jobs);
        foreach (var job in jobs) Audit(job.Id, actorId, "PMS_JOB_IMPORTED", null, JsonSerializer.Serialize(job));
        await db.SaveChangesAsync(token);
        if (transaction != null) await transaction.CommitAsync(token);
        return new(true, jobs.Count, jobs.Count, []);
    }

    public async Task DeleteAsync(Guid id, int expectedVersion, long actorId, CancellationToken token = default)
    {
        await using var transaction = await InventoryWriteScope.BeginAsync(db);
        var job = await db.MaintenanceSchedules.SingleOrDefaultAsync(j => j.Id == id && j.PmsProtocolVersion == 2, token)
            ?? throw new PmsRequestException(404, "Không tìm thấy Job.");
        await db.Entry(job).ReloadAsync(token); Version(job, expectedVersion);
        if (await db.MaintenanceTasks.AnyAsync(t => t.ScheduleId == id, token) || await db.MaintenanceHistories.AnyAsync(h => h.ScheduleId == id, token))
            throw new PmsRequestException(409, "Job đã có WO/lịch sử, chỉ được ngừng áp dụng.");
        // Soft-delete instead of physically deleting an identity already present in the sync outbox.
        job.JobState = PmsJobRules.Removed; job.IsActive = false; job.AutoGenerate = false;
        job.JobVersion++; job.UpdatedAt = DateTime.UtcNow; job.IsSynced = false;
        Audit(id, actorId, "PMS_JOB_REMOVED", null, JsonSerializer.Serialize(new { job.JobState }));
        await db.SaveChangesAsync(token);
        if (transaction != null) await transaction.CommitAsync(token);
    }

    private void Audit(Guid id, long actorId, string action, string? before, string after) => db.SystemLogs.Add(new SystemLog
    { Category = "PMS", Action = action, Level = "INFO", UserId = actorId, EntityType = "PmsJob", EntityId = id.ToString(), OldValues = before, NewValues = after });
    private static void Version(MaintenanceSchedule job, int? expected)
    { if (!expected.HasValue || expected != job.JobVersion) throw new PmsRequestException(409, "Job đã thay đổi. Hãy tải lại trước khi lưu."); }
    public static void ValidatePage(int page, int pageSize)
    { if (page < 1 || page > 100000 || pageSize < 1 || pageSize > 100) throw new PmsRequestException(400, "Phân trang không hợp lệ."); }
    public static void ValidateRanges(DateTime? from, DateTime? to, double? min, double? max)
    {
        if (from.HasValue && from.Value.Kind != DateTimeKind.Utc || to.HasValue && to.Value.Kind != DateTimeKind.Utc)
            throw new PmsRequestException(400, "Khoảng ngày phải gửi theo UTC.");
        if (from > to || min > max || min < 0 || max < 0 || min.HasValue && !double.IsFinite(min.Value) || max.HasValue && !double.IsFinite(max.Value))
            throw new PmsRequestException(400, "Khoảng lọc không hợp lệ.");
    }
    private static void ValidateDto(SavePmsJobDto dto)
    {
        var errors = new List<System.ComponentModel.DataAnnotations.ValidationResult>();
        if (!System.ComponentModel.DataAnnotations.Validator.TryValidateObject(dto, new(dto), errors, true))
            throw new PmsRequestException(400, string.Join(" ", errors.Select(e => e.ErrorMessage)));
        if (dto.Checklist == null || dto.Checklist.Count > 500 || dto.Checklist.Select(c => c.SequenceOrder).Distinct().Count() != dto.Checklist.Count)
            throw new PmsRequestException(400, "Checklist không hợp lệ hoặc trùng thứ tự.");
        foreach (var item in dto.Checklist)
        {
            if (item == null) throw new PmsRequestException(400, "Hạng mục checklist không được rỗng.");
            errors.Clear();
            if (!System.ComponentModel.DataAnnotations.Validator.TryValidateObject(item, new(item), errors, true) ||
                item.SequenceOrder < 1 || string.IsNullOrWhiteSpace(item.CheckpointDescription) ||
                item.NormalRangeMin > item.NormalRangeMax || item.NormalRangeMin.HasValue && !double.IsFinite(item.NormalRangeMin.Value) ||
                item.NormalRangeMax.HasValue && !double.IsFinite(item.NormalRangeMax.Value))
                throw new PmsRequestException(400, "Hạng mục checklist không hợp lệ.");
        }
        if (dto.BaselineAt?.Kind == DateTimeKind.Unspecified)
            throw new PmsRequestException(400, "Mốc ngày phải kèm múi giờ hoặc UTC.");
        if (dto.BaselineRunningHours.HasValue && !double.IsFinite(dto.BaselineRunningHours.Value) || !double.IsFinite(dto.WarningHours))
            throw new PmsRequestException(400, "Số giờ phải hữu hạn.");
        if (dto.Category == "PERIODIC" && dto.IntervalType is "CALENDAR" or "HYBRID" &&
            new[] { dto.IntervalDays, dto.IntervalMonths, dto.IntervalYears }.Count(x => x.HasValue) > 1)
            throw new PmsRequestException(400, "Chỉ chọn một đơn vị chu kỳ lịch.");
    }

    private static void ApplyDefinition(MaintenanceSchedule job, SavePmsJobDto dto)
    {
        job.ScheduleCode = dto.Code.Trim(); job.WorkCode = dto.WorkCode?.Trim(); job.ScheduleName = dto.Name.Trim();
        job.EquipmentAssetId = dto.EquipmentAssetId; job.EquipmentGroupId = null;
        job.MaintenanceCategory = dto.Category; job.IntervalType = dto.IntervalType;
        job.IntervalDays = dto.IntervalDays; job.IntervalMonths = dto.IntervalMonths; job.IntervalYears = dto.IntervalYears; job.IntervalHours = dto.IntervalHours;
        job.BaselineAt = dto.BaselineAt?.ToUniversalTime(); job.BaselineRunningHours = dto.BaselineRunningHours; job.BaselineSource = dto.BaselineSource;
        job.DaysBeforeDue = dto.WarningDays; job.WarningHours = dto.WarningHours; job.ReleasePolicy = dto.ReleasePolicy;
        job.AutoGenerate = dto.AutoGenerate; job.Priority = dto.Priority; job.Instructions = dto.Instructions;
        job.ResponsibleDepartment = dto.Department; job.ResponsibleRankId = dto.ResponsibleRankId; job.ResponsibleCrewId = dto.ResponsibleCrewId;
        job.AssignmentPolicy = dto.AssignmentPolicy; job.AssignedToCrewId = dto.AssignmentPolicy == "PREASSIGNED" ? dto.DefaultCrewId : null;
        job.RequireRiskAssessment = false; job.RequireInspectionReport = false;
        if (job.MaintenanceCategory != "PERIODIC") { job.NextDueDate = null; job.NextDueRunningHours = null; }
    }
}
