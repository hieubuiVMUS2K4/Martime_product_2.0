# Services/Maintenance — Validate báo cáo, hoàn thành task PMS, lập lịch tự động, xuất PDF

## Mục đích

Các dịch vụ hiện tại hỗ trợ validate báo cáo, hoàn thành công việc, lưu lịch sử từng kỳ và cập nhật trạng thái các task định kỳ đã có. Scheduler tự sinh task cũ đã được xóa.

## Cấu trúc & vai trò

| File | Đăng ký DI | Vai trò |
|---|---|---|
| `MaritimeValidationService.cs` | **Không đăng ký** (class `static`, gọi trực tiếp `MaritimeValidationService.ValidateXxx(...)`) | Validate nghiệp vụ cho 4 loại report (Noon/Departure/Bunker/Position) — được `ReportingService` (`Services/Reporting/`) gọi 7 lần. Xem chi tiết rule bên dưới. |
| `MaintenanceCompletionService.cs` | Scoped | **"Chức năng sống còn" của PMS** (nguyên văn comment trong code): hoàn thành task bảo trì — trừ kho phụ tùng tự động, ghi lịch sử, và tự sinh task chu kỳ kế tiếp ("gối đầu"). |
| `MaintenanceCycleWorker.cs` | `AddHostedService` trong `Program.cs` | Kiểm tra trạng thái chu kỳ mỗi phút và khi dịch vụ khởi động. |
| `MaintenanceCycleUpdater.cs` | Scoped | Dùng chung cho worker và Counter; chỉ cập nhật task hiện có, không tự tạo task hoặc sửa cấu hình. |
| `PmsPdfService.cs` | Scoped | Xuất PDF (QuestPDF) cho 2 biểu mẫu: Đánh giá Rủi ro (ĐGRR) và Biên bản Kiểm tra (BBKT), song ngữ VN/EN. |

## Luồng hoạt động chính

### A. Validate report — `MaritimeValidationService` (dùng bởi `Services/Reporting/ReportingService.cs`)

4 hàm `static`, mỗi hàm trả `(bool IsValid, List<string> Errors, List<string> Warnings)` — **`Errors` chặn lưu report, `Warnings` chỉ đính kèm response**:

| Report | Rule tiêu biểu |
|---|---|
| Noon | Toạ độ gần (0,0) → lỗi "Null Island"; SOG mâu thuẫn với Distance Traveled; tiêu thụ nhiên liệu âm hoặc = 0 khi đang chạy máy → lỗi; ROB &lt; 2× tiêu thụ ngày → cảnh báo; giờ báo cáo ngoài khung 10h-14h → cảnh báo; áp suất khí quyển &lt; 950 hPa → cảnh báo "possible typhoon/hurricane". |
| Departure | Bắt buộc `PortName`; ETA phải sau giờ khởi hành; draft âm → lỗi, lệch trim &gt; 3m → cảnh báo. |
| Bunker | **Sulphur content theo MARPOL Annex VI/IMO 2020**: &gt; 0.5% → LỖI ("exceeds MARPOL 2020 global limit"), &gt; 0.1% → cảnh báo ("exceeds ECA limit"); đối chiếu ROB trước+nhận=ROB sau (lệch &gt;10MT → cảnh báo). |
| Position | Toạ độ (0,0) → lỗi GPS malfunction; tốc độ ngoài [0,50] knot → lỗi; thời gian báo cáo trong tương lai → lỗi. |

### B. Hoàn thành task bảo trì — `MaintenanceCompletionService.CompleteTaskAsync` (trong 1 DB transaction)

```
1. Tìm MaintenanceTask, chặn nếu đã COMPLETED
2. Tìm MaintenanceSchedule liên quan (ưu tiên task.ScheduleId, fallback parse TaskId)
3. TRỪ KHO PHỤ TÙNG TỰ ĐỘNG:
   - Tính tổng tồn từ InventoryStock (nhiều vị trí kho); không đủ → ROLLBACK + lỗi "Insufficient stock"
   - Trừ theo chiến lược "vị trí có tồn kho LỚN NHẤT trước" (OrderByDescending(Quantity))
   - Đồng bộ lại MaterialItem.OnHandQuantity = tổng InventoryStock sau khi trừ
   - Nếu tồn < MinStock sau khi trừ → chỉ LOG WARNING (không tạo alert record)
4. Set Task.Status = COMPLETED, ghi SparePartsUsed dạng JSON
5. Tạo MaintenanceHistory (giờ chạy máy, thời gian thực hiện, TotalSparePartsCost)
6. Cập nhật Schedule.LastExecutedAt/LastExecutedRunningHours → CalculateNextDueDate()
7. Nếu schedule PERIODIC + AutoGenerate → TỰ SINH task chu kỳ kế tiếp (status SCHEDULED)
8. Commit transaction
```

`CalculateNextDueDate` có 3 nhánh: `CALENDAR` (LastExecutedAt + IntervalDays), `RUNNING_HOURS` (LastExecutedRunningHours + IntervalHours, ước lượng ngày qua hằng số `AVERAGE_HOURS_PER_DAY = 10.0`), `HYBRID` (tính cả 2, lấy ngày **sớm hơn**).

Có thêm `RecoverMissingCycleTaskAsync` — cơ chế tự phục hồi nếu một schedule RUNNING_HOURS bị "quên" sinh task kế tiếp (do lỗi ở phiên bản code cũ): tìm task COMPLETED gần nhất làm mẫu, tính lại ngưỡng, tạo lại task — và set ngay `DUE` nếu ngưỡng giờ chạy đã vượt.

### C. MaintenanceCycleWorker / MaintenanceCycleUpdater

Worker tạo scope mới mỗi lần kiểm tra và gọi `MaintenanceCycleUpdater.RefreshAsync`. Dịch vụ chỉ chọn công việc định kỳ có cấu hình hoạt động, bật tự động lên lịch và có chu kỳ hợp lệ. Không xử lý task đang thực hiện, chờ duyệt, trả hoàn hoặc đã hủy.

`PeriodicTaskCycle.NextCycleStatus` dùng chung cách tính Đã lên lịch → Sắp đến hạn → Đến hạn/Quá hạn. Công việc theo giờ chạy dùng giờ thực tế, không dùng ngày dự kiến để xác định quá hạn; thời gian cảnh báo trong cấu hình được hiểu là giờ cho RUNNING_HOURS và ngày cho CALENDAR/HYBRID. Nếu một lần cập nhật vượt ngưỡng đến hạn, trạng thái chuyển thẳng đến hạn.

Task hoàn thành cũ được lưu báo cáo vào lịch sử trước khi đặt lại kỳ tiếp theo. Worker không tự sinh task, xóa task, đổi người được giao, đẩy hạn sang tương lai hoặc ghi đè thời gian cảnh báo. Cấu hình tạo task ban đầu; phê duyệt tính hạn của kỳ tiếp theo.

### D. Xuất PDF — `PmsPdfService` (dùng QuestPDF, Community License)

`GenerateRiskAssessmentPdf` (biểu mẫu ĐGRR/Risk Assessment 6 phần: thông tin chung → nhận diện mối nguy → đánh giá rủi ro ban đầu có màu theo mức LOW/MEDIUM/HIGH/CRITICAL → biện pháp kiểm soát → rủi ro dư thừa → bảng chữ ký 3 cột) và `GenerateInspectionReportPdf` (biên bản BBKT — bảng hạng mục kiểm tra + kết luận PASS/FAIL). Cả hai chỉ trả `byte[]`, không tự ghi DB.

## Liên kết với phần khác

- **`Services/Reporting/ReportingService.cs`** — gọi `MaritimeValidationService.ValidateXxx()` trước khi tạo/cập nhật report.
- **`Repositories/` (`IMaintenanceScheduleRepository`, `IEquipmentAssetRepository`)** — được tiêm vào `MaintenanceCompletionService` để đọc schedule/asset.
- **`Constants/TaskStatus.cs`** — `MaintenanceConstants.AVERAGE_HOURS_PER_DAY`, `MaintenanceConstants.MINIMUM_UPCOMING_WINDOW_HOURS` dùng trong tính lead-time.

## Ghi chú khi đọc/dạy

- **`MaritimeValidationService` không tự log `Warnings`** — chỉ trả về kèm response; nếu warnings quan trọng (ví dụ sulphur content vượt ngưỡng ECA nhưng chưa vượt MARPOL 2020 toàn cầu) cần được giám sát, hiện không có cơ chế nào chủ động cảnh báo ngoài việc client tự hiển thị.
- **Chiến lược trừ kho "vị trí tồn kho lớn nhất trước"** trong `MaintenanceCompletionService` là một quyết định thiết kế cụ thể (không phải FIFO theo ngày nhập hay theo hạn dùng) — đáng nêu ra khi thảo luận về các chiến lược quản lý tồn kho khác nhau (FIFO/LIFO/theo vị trí) và khi nào mỗi chiến lược phù hợp.
