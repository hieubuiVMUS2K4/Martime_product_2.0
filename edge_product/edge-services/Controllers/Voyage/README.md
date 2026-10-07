# Controllers/Voyage — Quản lý chuyến đi, cảng, telemetry & tài chính chuyến đi

## Mục đích

Nhóm controller lớn nhất theo số lượng nghiệp vụ khác nhau trong `Controllers/`: quản lý vòng đời một chuyến đi (voyage) từ tạo mới đến đóng sổ tài chính, dữ liệu cảng biển UN/LOCODE, nhật ký hành trình SOLAS, dashboard "buồng lái" (cockpit) và hiệu suất chuyến đi, và **toàn bộ điểm nạp dữ liệu cảm biến/telemetry thô** của tàu (`TelemetryController`).

## Cấu trúc & vai trò

| File | Route | Vai trò |
|---|---|---|
| `VoyageController.cs` (620 dòng) | `api/voyages`, `api/port-calls`, `api/crew-assignments`, `api/cargo` | Controller trung tâm domain Voyage: CRUD voyage, port call, crew assignment (embark/disembark), cargo operations, sinh số hiệu chuyến tự động (`VN-{year}-{seq:D3}`), xuất **FAL Form 5** (Crew List theo Công ước IMO FAL — văn bản pháp lý phải trình khi cập cảng). |
| `PortController.cs` | `api/ports` | Master data cảng biển chuẩn **UN/LOCODE** (mã 5 ký tự, vd `VNSGN`), kèm toạ độ/timezone. **Chỉ đọc** tại tàu: danh mục do bờ làm chủ và phát xuống qua đồng bộ; tạo/sửa/xoá trả về lỗi "đã bị khóa". |
| `VoyageLogController.cs` | `api/voyage-log` | Nhật ký hành trình SOLAS Chapter V (DEP/ARR/COSP/EOSP/NOON/PILOT_ON-OFF...) — uỷ quyền hoàn toàn cho `IVoyageLogService`. Entry **bất biến sau khi Master ký** (sửa/xoá đều trả lỗi "not found or already signed"). |
| `VoyageCockpitController.cs` (71 dòng) | `api/voyage-cockpit` | Dashboard "buồng lái" — timeline hợp nhất kế hoạch-vs-thực tế cho 1 chuyến. Uỷ quyền hoàn toàn `IVoyageCockpitService`. |
| `VoyageEfficiencyController.cs` (37 dòng — nhỏ nhất repo) | `api/voyage-efficiency` | 1 endpoint duy nhất, pass-through `IVoyageEfficiencyService.GetEfficiencyReportAsync`. |
| `VoyageFinancialController.cs` (496 dòng) | `api/voyage-financial` | Wrapper mỏng quanh `IVoyageFinancialService` — vòng đời tài chính chuyến đi đầy đủ: Expense Request → duyệt → Advance Payment → Disbursement/Actual Revenue → Settlement → đóng sổ (`POST .../close`, yêu cầu đã có settlement được duyệt). |
| `TelemetryController.cs` (573 dòng) | `api/telemetry` | Điểm nạp dữ liệu cảm biến thô: vị trí GPS, góc nghiêng pitch/roll (ESP32/MPU6050), máy chính/phát điện/két/nhiên liệu/môi trường/AIS. Xem mục riêng bên dưới — controller giàu side-effect tự động nhất trong nhóm. |

## Luồng hoạt động chính

### A. `TelemetryController.PostNavigationData` — nạp cảm biến IMU và các hiệu ứng phụ tự động

```
POST /api/telemetry/navigation   [AllowAnonymous — cảm biến ESP32 không đăng nhập được]
Body: SensorNavigationDto { Pitch, Roll, HeadingTrue, HeadingMagnetic, Speed, Depth }
  → Lưu 1 dòng NavigationData
  → ĐỒNG THỜI ghi thêm 1 dòng EngineData (coi Speed > 0 = "máy đang chạy")
  → So sánh với EngineData dòng trước → phát hiện chuyển trạng thái START/STOP → ghi EngineEvent
  → Nếu Pitch/Roll vượt ngưỡng (appsettings: Alerts:Thresholds, mặc định Pitch 15°/Roll 20°)
        → TỰ ĐỘNG tạo SafetyAlarm (EXCESSIVE_PITCH/EXCESSIVE_ROLL)
  → Cập nhật cache 5 giây (IMemoryCache "LatestNavigation") để GET .../latest không phải hit DB liên tục
  → Cứ mỗi 100 lần gọi (counter atomic) → dọn NavigationData, giữ tối đa 1000 dòng gần nhất
```

Đây là ví dụ rõ nét về "biến dữ liệu cảm biến thô thành sự kiện có ý nghĩa vận hành mà không cần con người can thiệp" — 1 request POST đơn giản kích hoạt tới 4 hiệu ứng phụ khác nhau.

### B. Vòng đời tài chính chuyến đi (`VoyageFinancialController` + `IVoyageFinancialService`)

```
ExpenseRequest (DRAFT→SUBMITTED→APPROVED/REJECTED→CANCELLED)
      │ (nếu APPROVED, có thể kèm ApprovedAmount khác đề xuất)
      ▼
AdvancePayment (PENDING→PAID→SETTLED)
      ▼
Disbursement (RECORDED→VERIFIED→PAID, hoặc DISPUTED)      ActualRevenue (song song, theo hạng mục doanh thu)
      └──────────────────┬──────────────────────────────────────┘
                          ▼
                    Settlement (OPEN→PENDING_SETTLEMENT→SETTLED→CLOSED)
                          ▼
        POST /api/voyage-financial/{voyageId}/close
        → CHỈ thành công nếu đã có Settlement ở trạng thái duyệt xong
```

Mọi endpoint ghi trong `VoyageFinancialController` đọc người thao tác từ **header tự khai `X-User-Name`** (mặc định `"system"` nếu thiếu) — không phải từ session/claims đã xác thực.

### C. FAL Form 5 — điểm chạm quy định quốc tế thật

`GET /api/voyages/{voyageId}/fal-form5` sinh văn bản theo đúng mẫu **IMO FAL Convention Form 5 (Crew List)** — một trong các biểu mẫu bắt buộc phải xuất trình cho chính quyền cảng/nhập cư mỗi khi tàu cập cảng quốc tế, tổng hợp từ `VoyageCrewAssignment` + `CrewMember`.

## Liên kết với phần khác

- **`Services/Voyage/README.md`** — toàn bộ business logic thật (`IVoyageManagementService`, `IVoyageCockpitService`, `IVoyageEfficiencyService`, `IVoyageFinancialService`, `IVoyageLogService`) nằm ở đây; controller trong thư mục này chủ yếu là lớp mỏng chuyển tiếp HTTP ↔ Service.
- **`Constants/TaskStatus.cs`** — `VoyageStatus.CurrentVoyageStatuses`/`ReadOnlyStatuses` (dùng để chặn sửa cargo khi voyage đã đóng) và `VoyageFinancialStatus`/`ExpenseRequestStatus`/`AdvancePaymentStatus`/`DisbursementStatus` (ma trận chuyển trạng thái cho toàn bộ vòng đời tài chính ở mục B) đều định nghĩa tại đây.
- **`Data/EdgeDbContext.cs`** — `TelemetryController` và phần Cargo/số hiệu chuyến trong `VoyageController` tiêm thẳng `EdgeDbContext`, không qua service riêng.
- **`Services/AI/ChatService`... không liên quan** — nhưng đáng so sánh: `TelemetryController.PostNavigationData` là 1 trong số rất ít endpoint **cố ý** `[AllowAnonymous]` toàn hệ thống (dành cho thiết bị IoT chưa xác thực), khác hẳn với phần lớn API còn lại yêu cầu Bearer token qua `SessionAuthMiddleware`.

## Ghi chú khi đọc/dạy

- **`GET /api/telemetry/ais/nearby?range=10`** — tham số `range` được nhận vào nhưng **không thực sự dùng để lọc theo khoảng cách** trong code — một tính năng chưa hoàn thiện, không phải bug nghiêm trọng nhưng nên biết trước khi demo.
- **`[AllowAnonymous]` trên `POST /api/telemetry/navigation`** là chủ đích (cảm biến ESP32/ESP8266 không có cách nào gửi Bearer token), không phải lỗ hổng bỏ sót — nhưng đúng là bề mặt tấn công tiềm ẩn nếu mạng cảm biến không được cô lập khỏi mạng ngoài; đáng thảo luận về network segmentation khi dạy bảo mật hệ thống IoT trên tàu.
- **`VoyageEfficiencyController`/`VoyageCockpitController` gần như không có logic** — cả 2 chỉ là "pass-through" tới service. Khi dạy, dùng chúng làm ví dụ mẫu về controller "mỏng" chuẩn mực, đối lập với `VoyageController`/`TelemetryController` là ví dụ controller "dày" (có business logic trực tiếp trên `EdgeDbContext`).
- **Không có `[Authorize]` ở phần lớn action** trong nhóm này (trừ `[AllowAnonymous]` tường minh ở Telemetry) — quyền truy cập dựa vào `SessionAuthMiddleware` bắt buộc Bearer token cho MỌI route không nằm trong whitelist, không dựa vào attribute từng action.
