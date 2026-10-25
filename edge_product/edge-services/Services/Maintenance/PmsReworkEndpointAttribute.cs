using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using MaritimeEdge.DTOs;

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
