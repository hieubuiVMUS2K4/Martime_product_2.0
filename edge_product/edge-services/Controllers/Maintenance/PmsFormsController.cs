using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using MaritimeEdge.Data;
using MaritimeEdge.Models;
using MaritimeEdge.Services.Core;
using MaritimeEdge.Services.Maintenance;
using System.Text.Json;

namespace MaritimeEdge.Controllers.Maintenance;

/// <summary>
/// PMS Forms: Risk Assessment (ĐGRR) and Inspection Report (BBKT)
/// GET/PUT /api/maintenance/tasks/{taskId}/risk-assessment
/// GET/PUT /api/maintenance/tasks/{taskId}/inspection-report
/// </summary>
[ApiController]
[Route("api/maintenance/tasks/{taskId}")]
public class PmsFormsController : ControllerBase
{
    private readonly EdgeDbContext _context;
    private readonly ILogger<PmsFormsController> _logger;
    private readonly PmsPdfService _pdfService;

    public PmsFormsController(EdgeDbContext context, ILogger<PmsFormsController> logger, PmsPdfService pdfService)
    {
        _context = context;
        _logger = logger;
        _pdfService = pdfService;
    }

    // ================================================================
    //  ĐGRR — Risk Assessment
    // ================================================================

    /// <summary>GET risk assessment for a task. Returns empty object if not yet filled.</summary>
    [HttpGet("risk-assessment")]
    public async Task<IActionResult> GetRiskAssessment(string taskId)
    {
        // Support both UUID (task.id) and string code (task.taskId)
        var isUuid = Guid.TryParse(taskId, out var taskUuid);
        var task2 = isUuid
            ? await _context.MaintenanceTasks.FirstOrDefaultAsync(t => t.Id == taskUuid && !t.IsDeleted)
            : await _context.MaintenanceTasks.FirstOrDefaultAsync(t => t.TaskId == taskId && !t.IsDeleted);
        var resolvedTaskId = task2?.TaskId ?? taskId;

        var form = await _context.TaskRiskAssessments
            .FirstOrDefaultAsync(r => r.TaskId == resolvedTaskId);

        if (form == null)
        {
            // Return empty shell so frontend can pre-fill from task
            var task = task2;
            if (task == null) return NotFound(new { error = "Task not found" });

            var raNumber = $"RA-{DateTime.UtcNow:yyyyMMdd}-{resolvedTaskId.Split('-').LastOrDefault()}";
            var raLocation = task.AssignedDepartment ?? task.EquipmentGroupName ?? "";
            return Ok(new
            {
                taskId,
                jobName = task.TaskDescription?.Split('\n').FirstOrDefault() ?? "",
                equipmentName = task.EquipmentName ?? task.EquipmentAssetName ?? task.EquipmentGroupName ?? "",
                location = raLocation,
                assessmentDate = task.StartedAt ?? (DateTime?)DateTime.UtcNow,
                personnel = task.AssignedTo ?? "",
                raNumber,
                hazardMechanical = false, hazardElectrical = false, hazardChemical = false, hazardEnvironmental = false,
                hazardNotes = (string?)null,
                initialSeverity = (string?)null, initialLikelihood = (string?)null, initialRiskLevel = (string?)null,
                controlLOTO = false, controlPTW = false, controlPPE = false, controlVentilation = false,
                controlNotes = (string?)null,
                residualSeverity = (string?)null, residualLikelihood = (string?)null, residualRiskLevel = (string?)null,
                residualRiskNotes = (string?)null, isApprovedToProceed = true,
                workerSignature = (string?)null, supervisorSignature = (string?)null, chiefEngineerApproval = (string?)null,
                createdAt = (DateTime?)null, updatedAt = (DateTime?)null, createdBy = (string?)null,
                isFilled = false
            });
        }

        return Ok(new
        {
            form.TaskId, form.JobName, form.EquipmentName, form.Location, form.AssessmentDate, form.Personnel, form.RaNumber,
            form.HazardMechanical, form.HazardElectrical, form.HazardChemical, form.HazardEnvironmental, form.HazardNotes,
            form.InitialSeverity, form.InitialLikelihood, form.InitialRiskLevel,
            form.ControlLOTO, form.ControlPTW, form.ControlPPE, form.ControlVentilation, form.ControlNotes,
            form.ResidualSeverity, form.ResidualLikelihood, form.ResidualRiskLevel, form.ResidualRiskNotes, form.IsApprovedToProceed,
            form.WorkerSignature, form.SupervisorSignature, form.ChiefEngineerApproval,
            form.CreatedAt, form.UpdatedAt, form.CreatedBy,
            isFilled = true
        });
    }

    /// <summary>Save (upsert) risk assessment. Creates if not exists, updates if already exists.</summary>
    [HttpPut("risk-assessment")]
    public async Task<IActionResult> SaveRiskAssessment(string taskId, [FromBody] JsonElement body)
    {
        var userId = HttpContext.GetUsername() ?? "SYSTEM";

        var isUuid = Guid.TryParse(taskId, out var taskUuid);
        var task = isUuid
            ? await _context.MaintenanceTasks.FirstOrDefaultAsync(t => t.Id == taskUuid && !t.IsDeleted)
            : await _context.MaintenanceTasks.FirstOrDefaultAsync(t => t.TaskId == taskId && !t.IsDeleted);
        if (task == null) return NotFound(new { error = "Task not found" });
        var resolvedTaskId = task.TaskId ?? taskId;

        var existingForm = await _context.TaskRiskAssessments.FirstOrDefaultAsync(r => r.TaskId == resolvedTaskId);
        var isNew = existingForm == null;
        var form = existingForm ?? new TaskRiskAssessment { TaskId = resolvedTaskId, CreatedBy = userId };

        // Map fields from body
        form.JobName = body.TryGet("jobName");
        form.EquipmentName = body.TryGet("equipmentName");
        form.Location = body.TryGet("location");
        form.AssessmentDate = body.TryGetDate("assessmentDate");
        form.Personnel = body.TryGet("personnel");
        form.RaNumber = body.TryGet("raNumber");
        form.HazardMechanical = body.TryGetBool("hazardMechanical");
        form.HazardElectrical = body.TryGetBool("hazardElectrical");
        form.HazardChemical = body.TryGetBool("hazardChemical");
        form.HazardEnvironmental = body.TryGetBool("hazardEnvironmental");
        form.HazardNotes = body.TryGet("hazardNotes");
        form.InitialSeverity = body.TryGet("initialSeverity");
        form.InitialLikelihood = body.TryGet("initialLikelihood");
        form.InitialRiskLevel = body.TryGet("initialRiskLevel");
        form.ControlLOTO = body.TryGetBool("controlLOTO");
        form.ControlPTW = body.TryGetBool("controlPTW");
        form.ControlPPE = body.TryGetBool("controlPPE");
        form.ControlVentilation = body.TryGetBool("controlVentilation");
        form.ControlNotes = body.TryGet("controlNotes");
        form.ResidualSeverity = body.TryGet("residualSeverity");
        form.ResidualLikelihood = body.TryGet("residualLikelihood");
        form.ResidualRiskLevel = body.TryGet("residualRiskLevel");
        form.ResidualRiskNotes = body.TryGet("residualRiskNotes");
        form.IsApprovedToProceed = body.TryGetBool("isApprovedToProceed", defaultVal: true);
        form.WorkerSignature = body.TryGet("workerSignature");
        form.SupervisorSignature = body.TryGet("supervisorSignature");
        form.ChiefEngineerApproval = body.TryGet("chiefEngineerApproval");
        form.UpdatedAt = DateTime.UtcNow;

        if (isNew) _context.TaskRiskAssessments.Add(form);
        await _context.SaveChangesAsync();

        _logger.LogInformation("RiskAssessment {Action} for task {TaskId} by {User}", isNew ? "CREATED" : "UPDATED", taskId, userId);
        return Ok(new { success = true, isFilled = true });
    }

    /// <summary>Generate and stream ĐGRR as PDF.</summary>
    [HttpGet("risk-assessment/pdf")]
    public async Task<IActionResult> GetRiskAssessmentPdf(string taskId)
    {
        var isUuid = Guid.TryParse(taskId, out var taskUuid);
        var task = isUuid
            ? await _context.MaintenanceTasks.FirstOrDefaultAsync(t => t.Id == taskUuid && !t.IsDeleted)
            : await _context.MaintenanceTasks.FirstOrDefaultAsync(t => t.TaskId == taskId && !t.IsDeleted);
        if (task == null) return NotFound(new { error = "Task not found" });
        var resolvedTaskId = task.TaskId ?? taskId;

        var form = await _context.TaskRiskAssessments.FirstOrDefaultAsync(r => r.TaskId == resolvedTaskId);
        if (form == null) return NotFound(new { error = "Risk assessment not filled yet" });

        // Vessel identity comes from the ShipData DB table, NOT appsettings.json "Vessel" section.
        var ship = await _context.ShipData.AsNoTracking().FirstOrDefaultAsync();
        var vesselName = ship?.ShipName ?? "Vessel";
        var pdfBytes = _pdfService.GenerateRiskAssessmentPdf(form, vesselName);
        var fileName = $"DGRR-{resolvedTaskId}.pdf";
        return File(pdfBytes, "application/pdf", fileName);
    }

    // ================================================================
    //  BBKT — Inspection Report
    // ================================================================

    /// <summary>GET inspection report for a task. Returns empty shell if not yet filled.</summary>
    [HttpGet("inspection-report")]
    public async Task<IActionResult> GetInspectionReport(string taskId)
    {
        var isUuid2 = Guid.TryParse(taskId, out var taskUuid2);
        var task2b = isUuid2
            ? await _context.MaintenanceTasks.FirstOrDefaultAsync(t => t.Id == taskUuid2 && !t.IsDeleted)
            : await _context.MaintenanceTasks.FirstOrDefaultAsync(t => t.TaskId == taskId && !t.IsDeleted);
        var resolvedTaskId2 = task2b?.TaskId ?? taskId;

        var form = await _context.TaskInspectionReports
            .FirstOrDefaultAsync(r => r.TaskId == resolvedTaskId2);

        if (form == null)
        {
            var task = task2b;
            if (task == null) return NotFound(new { error = "Task not found" });

            // Build default job items from checklist templates
            var checklistItems = await _context.TaskChecklistItems
                .Where(c => c.TaskId == resolvedTaskId2)
                .OrderBy(c => c.SequenceOrder)
                .Select(c => new { seq = c.SequenceOrder, description = c.CheckpointDescription })
                .ToListAsync();

            var defaultJobItems = checklistItems.Select((c, i) => new
            {
                seq = c.seq,
                description = c.description,
                status = "",
                notes = ""
            }).ToList();

            // Vessel identity comes from the ShipData DB table, NOT appsettings.json "Vessel" section.
            var ship = await _context.ShipData.AsNoTracking().FirstOrDefaultAsync();
            var vesselName = ship?.ShipName ?? "";
            return Ok(new
            {
                taskId = resolvedTaskId2,
                shipName = vesselName,
                equipmentName = task.EquipmentName ?? task.EquipmentAssetName ?? task.EquipmentGroupName ?? "",
                equipmentCode = task.EquipmentId ?? "",
                maintenanceType = task.TaskType ?? "",
                maintenanceDate = task.CompletedAt ?? task.StartedAt,
                jobItemsJson = defaultJobItems.Count > 0 ? JsonSerializer.Serialize(defaultJobItems) : "[]",
                postMaintenanceStatus = (string?)null,
                recommendations = (string?)null,
                operatorSignature = task.AssignedTo ?? "",
                chiefEngineerSignature = (string?)null,
                overallResult = (string?)null,
                createdAt = (DateTime?)null, updatedAt = (DateTime?)null, createdBy = (string?)null,
                isFilled = false
            });
        }

        return Ok(new
        {
            form.TaskId, form.ShipName, form.EquipmentName, form.EquipmentCode, form.MaintenanceType, form.MaintenanceDate,
            form.JobItemsJson, form.PostMaintenanceStatus, form.Recommendations,
            form.OperatorSignature, form.ChiefEngineerSignature, form.OverallResult,
            form.CreatedAt, form.UpdatedAt, form.CreatedBy,
            isFilled = true
        });
    }

    /// <summary>Save (upsert) inspection report.</summary>
    [HttpPut("inspection-report")]
    public async Task<IActionResult> SaveInspectionReport(string taskId, [FromBody] JsonElement body)
    {
        var userId = HttpContext.GetUsername() ?? "SYSTEM";

        var isUuid3 = Guid.TryParse(taskId, out var taskUuid3);
        var task = isUuid3
            ? await _context.MaintenanceTasks.FirstOrDefaultAsync(t => t.Id == taskUuid3 && !t.IsDeleted)
            : await _context.MaintenanceTasks.FirstOrDefaultAsync(t => t.TaskId == taskId && !t.IsDeleted);
        if (task == null) return NotFound(new { error = "Task not found" });
        var resolvedTaskId3 = task.TaskId ?? taskId;

        var existingForm = await _context.TaskInspectionReports.FirstOrDefaultAsync(r => r.TaskId == resolvedTaskId3);
        var isNew = existingForm == null;
        var form = existingForm ?? new TaskInspectionReport { TaskId = resolvedTaskId3, CreatedBy = userId };

        form.ShipName = body.TryGet("shipName");
        form.EquipmentName = body.TryGet("equipmentName");
        form.EquipmentCode = body.TryGet("equipmentCode");
        form.MaintenanceType = body.TryGet("maintenanceType");
        form.MaintenanceDate = body.TryGetDate("maintenanceDate");
        form.JobItemsJson = body.TryGet("jobItemsJson");
        form.PostMaintenanceStatus = body.TryGet("postMaintenanceStatus");
        form.Recommendations = body.TryGet("recommendations");
        form.OperatorSignature = body.TryGet("operatorSignature");
        form.ChiefEngineerSignature = body.TryGet("chiefEngineerSignature");
        form.OverallResult = body.TryGet("overallResult");
        form.UpdatedAt = DateTime.UtcNow;

        if (isNew) _context.TaskInspectionReports.Add(form);
        await _context.SaveChangesAsync();

        _logger.LogInformation("InspectionReport {Action} for task {TaskId} by {User}", isNew ? "CREATED" : "UPDATED", taskId, userId);
        return Ok(new { success = true, isFilled = true });
    }

    /// <summary>Generate and stream BBKT as PDF.</summary>
    [HttpGet("inspection-report/pdf")]
    public async Task<IActionResult> GetInspectionReportPdf(string taskId)
    {
        var isUuid = Guid.TryParse(taskId, out var taskUuid);
        var task = isUuid
            ? await _context.MaintenanceTasks.FirstOrDefaultAsync(t => t.Id == taskUuid && !t.IsDeleted)
            : await _context.MaintenanceTasks.FirstOrDefaultAsync(t => t.TaskId == taskId && !t.IsDeleted);
        if (task == null) return NotFound(new { error = "Task not found" });
        var resolvedTaskId = task.TaskId ?? taskId;

        var form = await _context.TaskInspectionReports.FirstOrDefaultAsync(r => r.TaskId == resolvedTaskId);
        if (form == null) return NotFound(new { error = "Inspection report not filled yet" });

        // Vessel identity comes from the ShipData DB table, NOT appsettings.json "Vessel" section.
        var ship = await _context.ShipData.AsNoTracking().FirstOrDefaultAsync();
        var vesselName = ship?.ShipName ?? "Vessel";
        var pdfBytes = _pdfService.GenerateInspectionReportPdf(form, vesselName);
        var fileName = $"BBKT-{resolvedTaskId}.pdf";
        return File(pdfBytes, "application/pdf", fileName);
    }
}

/// <summary>Extension helpers for parsing JsonElement body fields safely</summary>
internal static class JsonElementExtensions
{
    public static string? TryGet(this JsonElement el, string prop) =>
        el.TryGetProperty(prop, out var v) && v.ValueKind != JsonValueKind.Null ? v.GetString() : null;

    public static bool TryGetBool(this JsonElement el, string prop, bool defaultVal = false) =>
        el.TryGetProperty(prop, out var v) && v.ValueKind == JsonValueKind.True ? true :
        el.TryGetProperty(prop, out var v2) && v2.ValueKind == JsonValueKind.False ? false :
        defaultVal;

    public static DateTime? TryGetDate(this JsonElement el, string prop)
    {
        if (!el.TryGetProperty(prop, out var v) || v.ValueKind == JsonValueKind.Null) return null;
        return DateTime.TryParse(v.GetString(), out var dt) ? dt.ToUniversalTime() : (DateTime?)null;
    }
}
