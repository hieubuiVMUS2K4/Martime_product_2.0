using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace MaritimeEdge.Controllers.Inventory;

/// <summary>Catalogue definitions are authored on shore and synchronized to edge.</summary>
[AttributeUsage(AttributeTargets.Method)]
public sealed class ShoreManagedCatalogAttribute : ActionFilterAttribute
{
    public override void OnActionExecuting(ActionExecutingContext context)
    {
        context.Result = new ObjectResult(new
        {
            code = "SHORE_MANAGED_CATALOG",
            message = "Danh mục vật tư do công ty quản lý trên bờ. Tàu chỉ nhận dữ liệu đồng bộ."
        }) { StatusCode = StatusCodes.Status403Forbidden };
    }
}
