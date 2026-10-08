using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using Maritime.Shared.Models.Crew;

namespace Maritime.Shared.Models.Documents;

/// <summary>
/// Nhóm tài liệu của thuyền viên (cột Category). Chứng chỉ KHÔNG nằm ở đây — dùng bảng crew_certificates riêng.
/// </summary>
public static class CrewDocumentCategory
{
    /// <summary>Hộ chiếu, thị thực, giấy phép cư trú.</summary>
    public const string Travel = "travel";
    /// <summary>Sổ thuyền viên, xác nhận.</summary>
    public const string Seafarer = "seafarer";
    /// <summary>Hợp đồng lao động, thư mời, đánh giá.</summary>
    public const string Employment = "employment";
    /// <summary>Giấy khám sức khoẻ, tiêm chủng, xét nghiệm.</summary>
    public const string Health = "health";

    public static readonly IReadOnlyList<string> All = [Travel, Seafarer, Employment, Health];

    /// <summary>Chuẩn hoá nhóm do client gửi; null nếu không hợp lệ.</summary>
    public static string? Normalize(string? category)
    {
        var value = category?.Trim().ToLowerInvariant();
        return value != null && All.Contains(value) ? value : null;
    }
}

/// <summary>
/// Tài liệu của thuyền viên (định danh + sức khoẻ) — MỘT bảng chung crew_member_documents, phân nhóm bằng
/// <see cref="Category"/>. Thay cho 4 bảng cũ travel/seafarer/employment/health_documents.
/// </summary>
public class CrewMemberDocument
{
    /// <summary>Tên gói đồng bộ bờ ↔ tàu.</summary>
    public const string SyncTable = "crew_member_document";

    [Key]
    public Guid Id { get; set; } = Guid.NewGuid();

    [Required]
    public Guid CrewMemberId { get; set; }

    /// <summary>Nhóm tài liệu: xem <see cref="CrewDocumentCategory"/>.</summary>
    [Required]
    [MaxLength(20)]
    public string Category { get; set; } = CrewDocumentCategory.Travel;

    [Required]
    [MaxLength(50)]
    public string DocumentType { get; set; } = string.Empty;

    [Required]
    [MaxLength(100)]
    public string DocumentNumber { get; set; } = string.Empty;

    public DateTime? IssueDate { get; set; }

    public DateTime? ExpiryDate { get; set; }

    /// <summary>Quốc gia cấp (không dùng cho tài liệu sức khoẻ).</summary>
    public int? CountryId { get; set; }

    public Country? Country { get; set; }

    [MaxLength(500)]
    public string? FileUrl { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    [JsonIgnore]
    public CrewMember CrewMember { get; set; } = null!;
}
