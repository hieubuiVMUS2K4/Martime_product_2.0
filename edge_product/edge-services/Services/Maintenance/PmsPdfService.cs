using MaritimeEdge.Models;
using QuestPDF.Fluent;
using QuestPDF.Helpers;
using QuestPDF.Infrastructure;
using System.Text.Json;

namespace MaritimeEdge.Services.Maintenance;

/// <summary>
/// Generates professional PDF documents for PMS forms:
/// - TaskRiskAssessment (ĐGRR)
/// - TaskInspectionReport (BBKT)
/// Style mirrors maritime industry standard DD Form / MPC card format.
/// Uses QuestPDF (Community License, free for internal/open use).
/// </summary>
public class PmsPdfService
{
    // Navy blue used for section headers, matching MPC card style

    // ─── ĐGRR ───────────────────────────────────────────────────────────────────

    public byte[] GenerateRiskAssessmentPdf(TaskRiskAssessment f, string vesselName)
    {
        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(15, Unit.Millimetre);
                page.DefaultTextStyle(x => x.FontSize(9).FontFamily("Lato"));

                page.Content().Column(col =>
                {
                    // ── Header ──────────────────────────────────────────────
                    col.Item().Border(1).Row(hdr =>
                    {
                        hdr.ConstantItem(110).Border(1).Padding(6).Column(c =>
                        {
                            c.Item().Text(vesselName).Bold().FontSize(10);
                            c.Item().Text("MARITIME EDGE PMS").FontSize(7).FontColor("#555555");
                        });
                        hdr.RelativeItem().Border(1).Padding(6).AlignCenter().Column(c =>
                        {
                            c.Item().Text("ĐÁNH GIÁ RỦI RO").Bold().FontSize(13).AlignCenter();
                            c.Item().Text("RISK ASSESSMENT FORM (ĐGRR)").FontSize(8).AlignCenter();
                        });
                        hdr.ConstantItem(110).Border(1).Padding(6).Column(c =>
                        {
                            c.Item().Text($"Số/No: {f.RaNumber ?? "—"}").FontSize(8);
                            c.Item().Text($"Task: {f.TaskId}").FontSize(7);
                            c.Item().Text($"Ngày: {(f.AssessmentDate.HasValue ? f.AssessmentDate.Value.ToString("dd/MM/yyyy") : "—")}").FontSize(8);
                        });
                    });

                    col.Item().PaddingTop(4);

                    // ── Section I: Thông tin chung ───────────────────────────
                    col.Item().Element(c => SectionHeader(c, "I. THÔNG TIN CHUNG / GENERAL INFORMATION"));
                    col.Item().Border(1).Padding(6).Column(body =>
                    {
                        body.Item().Row(r =>
                        {
                            r.RelativeItem().Column(lc =>
                            {
                                lc.Item().LabelValue("Tên công việc / Job Name", f.JobName);
                                lc.Item().PaddingTop(4).LabelValue("Thiết bị / Equipment", f.EquipmentName);
                            });
                            r.ConstantItem(8);
                            r.RelativeItem().Column(rc =>
                            {
                                rc.Item().LabelValue("Vị trí / Location", f.Location);
                                rc.Item().PaddingTop(4).LabelValue("Nhân sự / Personnel", f.Personnel);
                            });
                        });
                    });

                    col.Item().PaddingTop(2);

                    // ── Section II: Nhận diện mối nguy ──────────────────────
                    col.Item().Element(c => SectionHeader(c, "II. NHẬN DIỆN MỐI NGUY / HAZARD IDENTIFICATION"));
                    col.Item().Border(1).Padding(6).Column(body =>
                    {
                        body.Item().Row(r =>
                        {
                            r.RelativeItem().CheckboxRow(f.HazardMechanical, "Cơ học / Mechanical");
                            r.RelativeItem().CheckboxRow(f.HazardElectrical, "Điện / Electrical");
                            r.RelativeItem().CheckboxRow(f.HazardChemical, "Hóa chất / Chemical");
                            r.RelativeItem().CheckboxRow(f.HazardEnvironmental, "Môi trường / Environmental");
                        });
                        if (!string.IsNullOrWhiteSpace(f.HazardNotes))
                        {
                            body.Item().PaddingTop(4).LabelValue("Ghi chú / Notes", f.HazardNotes);
                        }
                    });

                    col.Item().PaddingTop(2);

                    // ── Section III: Đánh giá rủi ro ban đầu ─────────────────
                    col.Item().Element(c => SectionHeader(c, "III. ĐÁNH GIÁ RỦI RO BAN ĐẦU / INITIAL RISK ASSESSMENT"));
                    col.Item().Border(1).Padding(6).Row(r =>
                    {
                        r.RelativeItem().Column(lc =>
                        {
                            lc.Item().LabelValue("Hậu quả / Severity", LocalizeLevel(f.InitialSeverity));
                            lc.Item().PaddingTop(4).LabelValue("Khả năng xảy ra / Likelihood", LocalizeLevel(f.InitialLikelihood));
                        });
                        r.ConstantItem(8);
                        r.RelativeItem().Column(rc =>
                        {
                            rc.Item().Text("Mức rủi ro / Risk Level:").Bold().FontSize(8);
                            rc.Item().PaddingTop(2).Element(c => RiskBadge(c, f.InitialRiskLevel));
                        });
                    });

                    col.Item().PaddingTop(2);

                    // ── Section IV: Biện pháp kiểm soát ─────────────────────
                    col.Item().Element(c => SectionHeader(c, "IV. BIỆN PHÁP KIỂM SOÁT / CONTROL MEASURES"));
                    col.Item().Border(1).Padding(6).Column(body =>
                    {
                        body.Item().Row(r =>
                        {
                            r.RelativeItem().CheckboxRow(f.ControlLOTO, "LOTO (Lockout/Tagout)");
                            r.RelativeItem().CheckboxRow(f.ControlPTW, "Giấy phép làm việc / PTW");
                            r.RelativeItem().CheckboxRow(f.ControlPPE, "Trang bị BHLĐ / PPE");
                            r.RelativeItem().CheckboxRow(f.ControlVentilation, "Thông gió / Ventilation");
                        });
                        if (!string.IsNullOrWhiteSpace(f.ControlNotes))
                        {
                            body.Item().PaddingTop(4).LabelValue("Chi tiết / Details", f.ControlNotes);
                        }
                    });

                    col.Item().PaddingTop(2);

                    // ── Section V: Rủi ro dư thừa ────────────────────────────
                    col.Item().Element(c => SectionHeader(c, "V. RỦI RO DƯ THỪA / RESIDUAL RISK"));
                    col.Item().Border(1).Padding(6).Row(r =>
                    {
                        r.RelativeItem().Column(lc =>
                        {
                            lc.Item().LabelValue("Hậu quả / Severity", LocalizeLevel(f.ResidualSeverity));
                            lc.Item().PaddingTop(4).LabelValue("Khả năng xảy ra / Likelihood", LocalizeLevel(f.ResidualLikelihood));
                        });
                        r.ConstantItem(8);
                        r.RelativeItem().Column(rc =>
                        {
                            rc.Item().Text("Mức rủi ro / Risk Level:").Bold().FontSize(8);
                            rc.Item().PaddingTop(2).Element(c => RiskBadge(c, f.ResidualRiskLevel));
                            rc.Item().PaddingTop(6).Row(approveRow =>
                            {
                                approveRow.AutoItem().Element(c => DrawCheckbox(c, f.IsApprovedToProceed));
                                approveRow.AutoItem().PaddingLeft(4).AlignMiddle().Text("Được phép tiến hành / Approved to Proceed").FontSize(8);
                            });
                        });
                    });

                    col.Item().PaddingTop(2);

                    // ── Section VI: Phê duyệt ─────────────────────────────────
                    col.Item().Element(c => SectionHeader(c, "VI. PHÊ DUYỆT / APPROVAL"));
                    col.Item().Border(1).Table(table =>
                    {
                        table.ColumnsDefinition(cd =>
                        {
                            cd.RelativeColumn();
                            cd.RelativeColumn();
                            cd.RelativeColumn();
                        });
                        table.Cell().Border(1).Padding(6).Column(c =>
                        {
                            c.Item().Text("Người thực hiện / Worker").FontSize(7).FontColor("#555555");
                            c.Item().PaddingTop(18).Text(f.WorkerSignature ?? "").Bold();
                            c.Item().PaddingTop(2).LineHorizontal(0.5f).LineColor("#000000");
                            c.Item().Text("Ký tên / Signature").FontSize(7).AlignCenter();
                        });
                        table.Cell().Border(1).Padding(6).Column(c =>
                        {
                            c.Item().Text("Giám sát / Supervisor").FontSize(7).FontColor("#555555");
                            c.Item().PaddingTop(18).Text(f.SupervisorSignature ?? "").Bold();
                            c.Item().PaddingTop(2).LineHorizontal(0.5f).LineColor("#000000");
                            c.Item().Text("Ký tên / Signature").FontSize(7).AlignCenter();
                        });
                        table.Cell().Border(1).Padding(6).Column(c =>
                        {
                            c.Item().Text("Máy trưởng / Chief Engineer").FontSize(7).FontColor("#555555");
                            c.Item().PaddingTop(18).Text(f.ChiefEngineerApproval ?? "").Bold();
                            c.Item().PaddingTop(2).LineHorizontal(0.5f).LineColor("#000000");
                            c.Item().Text("Phê duyệt / Approval").FontSize(7).AlignCenter();
                        });
                    });
                });

                page.Footer().AlignRight().Text(x =>
                {
                    x.Span($"ĐGRR / {f.TaskId} — ").FontSize(7).FontColor("#777777");
                    x.CurrentPageNumber().FontSize(7).FontColor("#777777");
                    x.Span("/").FontSize(7).FontColor("#777777");
                    x.TotalPages().FontSize(7).FontColor("#777777");
                });
            });
        }).GeneratePdf();
    }

    // ─── BBKT ───────────────────────────────────────────────────────────────────

    public byte[] GenerateInspectionReportPdf(TaskInspectionReport f, string vesselName)
    {
        // Parse job items
        var jobItems = new List<BbktJobItem>();
        if (!string.IsNullOrWhiteSpace(f.JobItemsJson))
        {
            try
            {
                var raw = JsonSerializer.Deserialize<List<JsonElement>>(f.JobItemsJson);
                if (raw != null)
                {
                    foreach (var el in raw)
                    {
                        jobItems.Add(new BbktJobItem
                        {
                            Seq = el.TryGetProperty("seq", out var s) ? s.GetInt32() : 0,
                            Description = el.TryGetProperty("description", out var d) ? d.GetString() ?? "" : "",
                            Status = el.TryGetProperty("status", out var st) ? st.GetString() ?? "" : "",
                            Notes = el.TryGetProperty("notes", out var n) ? n.GetString() ?? "" : ""
                        });
                    }
                }
            }
            catch { /* ignore parse errors */ }
        }

        return Document.Create(container =>
        {
            container.Page(page =>
            {
                page.Size(PageSizes.A4);
                page.Margin(15, Unit.Millimetre);
                page.DefaultTextStyle(x => x.FontSize(9).FontFamily("Lato"));

                page.Content().Column(col =>
                {
                    // ── Header ──────────────────────────────────────────────
                    col.Item().Border(1).Row(hdr =>
                    {
                        hdr.ConstantItem(110).Border(1).Padding(6).Column(c =>
                        {
                            c.Item().Text(f.ShipName ?? vesselName).Bold().FontSize(10);
                            c.Item().Text("MARITIME EDGE PMS").FontSize(7).FontColor("#555555");
                        });
                        hdr.RelativeItem().Border(1).Padding(6).AlignCenter().Column(c =>
                        {
                            c.Item().Text("BIÊN BẢN KIỂM TRA").Bold().FontSize(13).AlignCenter();
                            c.Item().Text("MAINTENANCE INSPECTION REPORT (BBKT)").FontSize(8).AlignCenter();
                        });
                        hdr.ConstantItem(110).Border(1).Padding(6).Column(c =>
                        {
                            c.Item().Text($"Task: {f.TaskId}").FontSize(7);
                            c.Item().Text($"Ngày: {(f.MaintenanceDate.HasValue ? f.MaintenanceDate.Value.ToString("dd/MM/yyyy") : "—")}").FontSize(8);
                        });
                    });

                    col.Item().PaddingTop(4);

                    // ── Section I: Thông tin chung ───────────────────────────
                    col.Item().Element(c => SectionHeader(c, "I. THÔNG TIN CHUNG / GENERAL INFORMATION"));
                    col.Item().Border(1).Padding(6).Column(body =>
                    {
                        body.Item().Row(r =>
                        {
                            r.RelativeItem().Column(lc =>
                            {
                                lc.Item().LabelValue("Thiết bị / Equipment", f.EquipmentName);
                                lc.Item().PaddingTop(4).LabelValue("Mã thiết bị / Equipment Code", f.EquipmentCode);
                            });
                            r.ConstantItem(8);
                            r.RelativeItem().Column(rc =>
                            {
                                rc.Item().LabelValue("Loại bảo dưỡng / Maintenance Type", LocalizeMaintenanceType(f.MaintenanceType));
                                rc.Item().PaddingTop(4).LabelValue("Ngày thực hiện / Date", f.MaintenanceDate.HasValue ? f.MaintenanceDate.Value.ToString("dd/MM/yyyy") : "—");
                            });
                        });
                    });

                    col.Item().PaddingTop(2);

                    // ── Section II: Nội dung công việc ──────────────────────
                    col.Item().Element(c => SectionHeader(c, "II. NỘI DUNG CÔNG VIỆC / JOB ITEMS"));
                    col.Item().Border(1).Table(table =>
                    {
                        table.ColumnsDefinition(cd =>
                        {
                            cd.ConstantColumn(30);    // STT
                            cd.RelativeColumn(3);     // Mô tả
                            cd.ConstantColumn(70);    // Trạng thái
                            cd.RelativeColumn(2);     // Ghi chú
                        });

                        // Header row
                        table.Cell().Background("#1a3a5c").Padding(4).Text("STT").FontColor("#FFFFFF").Bold().FontSize(8);
                        table.Cell().Background("#1a3a5c").Padding(4).Text("Nội dung / Description").FontColor("#FFFFFF").Bold().FontSize(8);
                        table.Cell().Background("#1a3a5c").Padding(4).Text("Kết quả / Status").FontColor("#FFFFFF").Bold().FontSize(8);
                        table.Cell().Background("#1a3a5c").Padding(4).Text("Ghi chú / Notes").FontColor("#FFFFFF").Bold().FontSize(8);

                        if (jobItems.Count == 0)
                        {
                            table.Cell().ColumnSpan(4).Padding(6).Text("(Không có nội dung / No items)").Italic().AlignCenter();
                        }
                        else
                        {
                            foreach (var item in jobItems)
                            {
                                var rowBg = jobItems.IndexOf(item) % 2 == 0 ? "#ffffff" : "#f5f5f5";
                                table.Cell().Background(rowBg).BorderBottom(0.5f).BorderColor("#cccccc").Padding(4).Text(item.Seq.ToString());
                                table.Cell().Background(rowBg).BorderBottom(0.5f).BorderColor("#cccccc").Padding(4).Text(item.Description);
                                table.Cell().Background(rowBg).BorderBottom(0.5f).BorderColor("#cccccc").Padding(4).Element(c => StatusBadge(c, item.Status));
                                table.Cell().Background(rowBg).BorderBottom(0.5f).BorderColor("#cccccc").Padding(4).Text(item.Notes).FontSize(8).FontColor("#444444");
                            }
                        }
                    });

                    col.Item().PaddingTop(2);

                    // ── Section III: Kết luận ─────────────────────────────────
                    col.Item().Element(c => SectionHeader(c, "III. KẾT LUẬN / CONCLUSION"));
                    col.Item().Border(1).Padding(6).Column(body =>
                    {
                        body.Item().Row(r =>
                        {
                            r.RelativeItem().Column(lc =>
                            {
                                lc.Item().Text("Trạng thái sau bảo dưỡng / Post-Maintenance Status:").Bold().FontSize(8);
                                lc.Item().PaddingTop(3).Element(c => PostStatusBadge(c, f.PostMaintenanceStatus));
                            });
                            r.ConstantItem(8);
                            r.RelativeItem().Column(rc =>
                            {
                                rc.Item().Text("Kết quả tổng thể / Overall Result:").Bold().FontSize(8);
                                rc.Item().PaddingTop(3).Element(c => OverallResultBadge(c, f.OverallResult));
                            });
                        });
                        if (!string.IsNullOrWhiteSpace(f.Recommendations))
                        {
                            body.Item().PaddingTop(6).LabelValue("Kiến nghị / Recommendations", f.Recommendations);
                        }
                    });

                    col.Item().PaddingTop(2);

                    // ── Section IV: Xác nhận ──────────────────────────────────
                    col.Item().Element(c => SectionHeader(c, "IV. XÁC NHẬN / CONFIRMATION"));
                    col.Item().Border(1).Table(table =>
                    {
                        table.ColumnsDefinition(cd =>
                        {
                            cd.RelativeColumn();
                            cd.RelativeColumn();
                        });
                        table.Cell().Border(1).Padding(6).Column(c =>
                        {
                            c.Item().Text("Người thực hiện / Operator").FontSize(7).FontColor("#555555");
                            c.Item().PaddingTop(18).Text(f.OperatorSignature ?? "").Bold();
                            c.Item().PaddingTop(2).LineHorizontal(0.5f).LineColor("#000000");
                            c.Item().Text("Ký tên / Signature").FontSize(7).AlignCenter();
                        });
                        table.Cell().Border(1).Padding(6).Column(c =>
                        {
                            c.Item().Text("Máy trưởng / Chief Engineer").FontSize(7).FontColor("#555555");
                            c.Item().PaddingTop(18).Text(f.ChiefEngineerSignature ?? "").Bold();
                            c.Item().PaddingTop(2).LineHorizontal(0.5f).LineColor("#000000");
                            c.Item().Text("Phê duyệt / Approval").FontSize(7).AlignCenter();
                        });
                    });
                });

                page.Footer().AlignRight().Text(x =>
                {
                    x.Span($"BBKT / {f.TaskId} — ").FontSize(7).FontColor("#777777");
                    x.CurrentPageNumber().FontSize(7).FontColor("#777777");
                    x.Span("/").FontSize(7).FontColor("#777777");
                    x.TotalPages().FontSize(7).FontColor("#777777");
                });
            });
        }).GeneratePdf();
    }

    // ────────────────────────────────────────────────────────────────────────────
    //  Helper types and static methods
    // ────────────────────────────────────────────────────────────────────────────

    private sealed class BbktJobItem
    {
        public int Seq { get; set; }
        public string Description { get; set; } = "";
        public string Status { get; set; } = "";
        public string Notes { get; set; } = "";
    }

    private static void SectionHeader(IContainer c, string title)
    {
        c.Background("#1a3a5c").Padding(4).Text(title).FontColor("#FFFFFF").Bold().FontSize(8);
    }

    private static void RiskBadge(IContainer c, string? level)
    {
        var (bg, fg) = level switch
        {
            "HIGH" => ("#f8d7da", "#721c24"),
            "CRITICAL" => ("#6c1a20", "#ffffff"),
            "MEDIUM" => ("#fff3cd", "#856404"),
            _ => ("#d4edda", "#155724")  // LOW or unknown
        };
        var label = LocalizeLevel(level);
        c.Background(bg).Padding(4).Text(label).FontColor(fg).Bold().FontSize(9);
    }

    private static void StatusBadge(IContainer c, string? status)
    {
        var (text, fg) = status switch
        {
            "GOOD" => ("Tốt [V]", "#155724"),
            "BAD" => ("Xấu [X]", "#721c24"),
            "REPLACED" => ("Thay thế", "#856404"),
            _ => ("—", "#000000")
        };
        c.Text(text).FontColor(fg).Bold().FontSize(8);
    }

    private static void PostStatusBadge(IContainer c, string? status)
    {
        var (text, fg) = status switch
        {
            "NORMAL" => ("Hoạt động bình thường [V]", "#155724"),
            "MONITOR" => ("Cần theo dõi [!]", "#856404"),
            "NEEDS_REPAIR" => ("Cần sửa chữa [X]", "#721c24"),
            _ => ("—", "#000000")
        };
        c.Text(text).FontColor(fg).Bold().FontSize(9);
    }

    private static void OverallResultBadge(IContainer c, string? result)
    {
        var (text, fg) = result switch
        {
            "PASS" => ("ĐẠT [V]", "#155724"),
            "FAIL" => ("KHÔNG ĐẠT [X]", "#721c24"),
            _ => ("—", "#000000")
        };
        c.Text(text).FontColor(fg).Bold().FontSize(11);
    }

    private static string LocalizeLevel(string? s) => s switch
    {
        "LOW" => "Thấp",
        "MEDIUM" => "Trung bình",
        "HIGH" => "Cao",
        "CRITICAL" => "Nghiêm trọng",
        _ => s ?? "—"
    };

    private static string LocalizeMaintenanceType(string? s) => s switch
    {
        "DAILY" => "Hàng ngày",
        "WEEKLY" => "Hàng tuần",
        "MONTHLY" => "Hàng tháng",
        "ANNUAL" => "Hàng năm",
        "RUNNING_HOURS" => "Theo giờ chạy",
        _ => s ?? "—"
    };

    /// <summary>
    /// Draws a 10x10 checkbox. If checked, draws an "X" inside.
    /// </summary>
    internal static void DrawCheckbox(IContainer container, bool isChecked)
    {
        container.Width(11).Height(11).Border(1).BorderColor("#333333").Background(isChecked ? "#e8f5e9" : "#ffffff")
            .AlignCenter().AlignMiddle()
            .Text(isChecked ? "X" : "").Bold().FontSize(7);
    }
}

/// <summary>
/// QuestPDF extension methods used by PmsPdfService for reusable layout fragments.
/// </summary>
internal static class PdfExtensions
{
    internal static void LabelValue(this IContainer c, string label, string? value)
    {
        c.Column(col =>
        {
            col.Item().Text(label).FontSize(7).FontColor("#444444");
            col.Item().BorderBottom(0.5f).BorderColor("#888888").Padding(1)
               .Text(value ?? "—").Bold().FontSize(9);
        });
    }

    internal static void CheckboxRow(this IContainer c, bool isChecked, string label)
    {
        c.Row(r =>
        {
            r.AutoItem().Element(cb => PmsPdfService.DrawCheckbox(cb, isChecked));
            r.AutoItem().PaddingLeft(3).AlignMiddle().Text(label).FontSize(8);
        });
    }
}