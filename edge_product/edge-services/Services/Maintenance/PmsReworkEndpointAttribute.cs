using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using MaritimeEdge.DTOs;
using Microsoft.EntityFrameworkCore;

namespace MaritimeEdge.Services.Maintenance;

/// <summary>Staged rollout: schema may be installed without exposing an incomplete workflow.</summary>
[AttributeUsage(AttributeTargets.Class)]
public sealed class PmsReworkEndpointAttribute : Attribute, IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var configuration = context.HttpContext.RequestServices.GetRequiredService<IConfiguration>();
        if (!configuration.GetValue<bool>("Pms:ReworkApiEnabled"))
        {
            context.Result = new ObjectResult(new { code = "PMS_REWORK_NOT_ENABLED", error = "Luồng Job/Work Order mới chưa được bật cho tàu này." }) { StatusCode = 503 };
            return;
        }
        try
        {
            var db = context.HttpContext.RequestServices.GetRequiredService<MaritimeEdge.Data.EdgeDbContext>();
            var dataset = await db.SyncState.AsNoTracking().SingleOrDefaultAsync(s => s.Key == "pms-dataset-id");
            if (dataset != null)
            {
                var active = await db.SyncState.AsNoTracking().AnyAsync(s => s.Key == "pms-cutover-state" && s.Value == "ACTIVE");
                if (!active) throw new PmsRequestException(503, "PMS đang chuyển đổi dữ liệu; vui lòng thử lại sau.");
                if (context.HttpContext.Request.Method is not ("GET" or "HEAD"))
                {
                    var supplied = context.HttpContext.Request.Headers["X-Pms-Dataset-Id"].FirstOrDefault();
                    if (!Guid.TryParse(supplied, out var expected) || !Guid.TryParse(dataset.Value, out var actual) || actual != expected)
                        throw new PmsRequestException(409, "Bộ dữ liệu PMS đã thay đổi. Hãy tải lại trang hoặc cập nhật ứng dụng trước khi thao tác.");
                    db.ExpectedPmsDatasetId = expected;
                }
            }
            var executed = await next();
            if (executed.Exception is PmsRequestException requestError)
            {
                executed.ExceptionHandled = true;
                executed.Result = new ObjectResult(new { error = requestError.Message }) { StatusCode = requestError.Status };
            }
        }
        catch (PmsRequestException error)
        { context.Result = new ObjectResult(new { error = error.Message }) { StatusCode = error.Status }; }
    }
}
