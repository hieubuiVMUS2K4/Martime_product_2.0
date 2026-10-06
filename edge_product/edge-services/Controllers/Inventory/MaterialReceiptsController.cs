using MaritimeEdge.DTOs;
using MaritimeEdge.Services.Inventory;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace MaritimeEdge.Controllers.Inventory;

/// <summary>
/// API Controller cho quản lý phiếu nhập kho vật tư
/// </summary>
[ApiController]
[Route("api/materials/receipts")]
[Produces("application/json")]
public class MaterialReceiptsController : ControllerBase
{
    private readonly MaterialReceiptService _receiptService;
    private readonly ILogger<MaterialReceiptsController> _logger;

    public MaterialReceiptsController(
        MaterialReceiptService receiptService,
        ILogger<MaterialReceiptsController> logger)
    {
        _receiptService = receiptService;
        _logger = logger;
    }

    /// <summary>
    /// Preview dữ liệu import trước khi thực hiện nhập kho
    /// </summary>
    /// <param name="dto">Dữ liệu phiếu nhập từ Excel</param>
    /// <returns>Kết quả preview với thông tin items sẽ được tạo mới/cập nhật</returns>
    /// <response code="200">Preview successful</response>
    /// <response code="400">Invalid data</response>
    [ShoreManagedCatalog]
    [HttpPost("preview")]
    [ProducesResponseType(typeof(ReceiptPreviewResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<ActionResult<ReceiptPreviewResponseDto>> PreviewImport([FromBody] ImportReceiptDto dto)
    {
        try
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var preview = await _receiptService.PreviewImportAsync(dto);
            
            // Nếu có lỗi nghiêm trọng, trả về BadRequest
            if (preview.Summary.ErrorItems > 0)
            {
                return BadRequest(new
                {
                    message = "Import data contains errors",
                    preview
                });
            }

            return Ok(preview);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error previewing import");
            return StatusCode(500, new { message = "Error previewing import" });
        }
    }

    /// <summary>
    /// Import phiếu nhập kho - Tạo/cập nhật MaterialItems và tạo Receipt records
    /// </summary>
    /// <param name="dto">Dữ liệu phiếu nhập từ Excel</param>
    /// <returns>Phiếu nhập đã được tạo với đầy đủ thông tin</returns>
    /// <response code="201">Import successful</response>
    /// <response code="400">Invalid data</response>
    /// <response code="500">Server error</response>
    [ShoreManagedCatalog]
    [HttpPost("import")]
    [ProducesResponseType(typeof(MaterialReceiptResponseDto), StatusCodes.Status201Created)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<ActionResult<MaterialReceiptResponseDto>> ImportReceipt([FromBody] ImportReceiptDto dto)
    {
        try
        {
            if (!ModelState.IsValid)
            {
                return BadRequest(ModelState);
            }

            var receipt = await _receiptService.ImportReceiptAsync(dto);
            
            _logger.LogInformation($"Receipt {receipt.ReceiptCode} imported successfully with {receipt.ItemCount} items");

            return CreatedAtAction(
                nameof(GetReceiptById),
                new { id = receipt.Id },
                receipt
            );
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error importing receipt");
            return StatusCode(500, new { message = "Error importing receipt" });
        }
    }

    /// <summary>
    /// Lấy danh sách phiếu nhập có phân trang và filter
    /// </summary>
    /// <param name="query">Query parameters cho filter và pagination</param>
    /// <returns>Danh sách phiếu nhập</returns>
    /// <response code="200">Success</response>
    [HttpGet]
    [ProducesResponseType(typeof(MaterialReceiptPagedResponseDto), StatusCodes.Status200OK)]
    public async Task<ActionResult<MaterialReceiptPagedResponseDto>> GetReceipts([FromQuery] ReceiptQueryDto query)
    {
        try
        {
            var result = await _receiptService.GetReceiptsAsync(query);
            return Ok(result);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting receipts");
            return StatusCode(500, new { message = "Error getting receipts" });
        }
    }

    /// <summary>
    /// Lấy chi tiết một phiếu nhập theo ID
    /// </summary>
    /// <param name="id">Receipt ID</param>
    /// <returns>Chi tiết phiếu nhập bao gồm tất cả items</returns>
    /// <response code="200">Success</response>
    /// <response code="404">Receipt not found</response>
    [HttpGet("{id}")]
    [ProducesResponseType(typeof(MaterialReceiptResponseDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<ActionResult<MaterialReceiptResponseDto>> GetReceiptById(int id)
    {
        try
        {
            var receipt = await _receiptService.GetReceiptByIdAsync(id);
            
            if (receipt == null)
            {
                return NotFound(new { message = $"Receipt with ID {id} not found" });
            }

            return Ok(receipt);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, $"Error getting receipt {id}");
            return StatusCode(500, new { message = "Error getting receipt" });
        }
    }

    /// <summary>
    /// Lấy thống kê tổng quan về phiếu nhập
    /// </summary>
    /// <returns>Statistics về phiếu nhập</returns>
    [HttpGet("stats")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public ActionResult GetReceiptStats()
    {
        try
        {
            // TODO: Implement statistics aggregation
            return Ok(new
            {
                message = "Stats endpoint - To be implemented"
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting receipt stats");
            return StatusCode(500, new { message = "Error getting stats" });
        }
    }
}
