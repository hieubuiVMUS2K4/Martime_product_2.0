# Controllers/Maintenance — PMS (Planned Maintenance System) theo ISM Code

## Mục đích

Module lớn và phức tạp nhất về nghiệp vụ thuần Việt Nam hoá quy trình bảo trì phòng ngừa: quản lý thiết bị (cây cha-con + nhóm), lịch bảo trì tự sinh task, checklist, ghi nhận tiến độ real-time, đánh giá rủi ro/biên bản kiểm tra (PDF), và **2 quy trình phê duyệt/thực thi task song song** (`MaintenanceController` và `TaskWorkflowController`) — đây là điểm quan trọng nhất cần nắm khi đọc thư mục này.

## Cấu trúc & vai trò

| File | Route | Vai trò |
|---|---|---|
| `MaintenanceController.cs` (1685 dòng) | `api/maintenance` | CRUD `MaintenanceTask` (list/pending/overdue/my-tasks/detail), state machine trạng thái riêng (`ValidateStatusTransition`), quick-assign, và **bộ hành động Start/Complete/Approve của RIÊNG file này** (`tasks/{id}/start`, `tasks/{id}/complete` — gọi đúng `MaintenanceCompletionService`, `tasks/{id}/approve`). `POST tasks` (tạo task kiểu cũ) đã bị vô hiệu hoá, trả thẳng lỗi "TaskType feature removed. Please use PMS Planning v2.0". |
| `WorkItemConfigController.cs` | `api/maintenance-schedules` | Quản lý cấu hình bảo trì và sinh task ban đầu. Worker chỉ cập nhật trạng thái các task đã có, không tạo task hoặc ghi đè cấu hình. |
| `TaskWorkflowController.cs` | `api/tasks` | **Chu trình thực thi/phê duyệt "hiện đại"**: `start` → `submit` → `verify` (approve/reject/rectify), `dashboard/summary`, `morning-briefing` (họp giao ban sáng), `bulk-verify`, `pending-approval`, `rectify`. |
| `EquipmentAssetController.cs` | `api/equipment-assets` | CRUD thiết bị (cây cha-con qua `ParentId`), theo nhóm — dùng qua `IEquipmentAssetRepository` (1 trong 3 nơi hiếm hoi dùng Repository pattern). |
| `EquipmentGroupController.cs` | `api/equipment-groups` | CRUD nhóm thiết bị + thành viên nhóm + gán/gỡ asset khỏi nhóm. |
| `TaskChecklistItemsController.cs` | `api/maintenance/tasks/{taskId}/checklist` | Checklist "hiện đại" của 1 task — GET danh sách/tổng kết, PUT sửa, POST hoàn thành từng mục. Thay thế endpoint `checklist-legacy` đã vô hiệu trong `MaintenanceController`. |
| `TaskRealTimeUpdatesController.cs` | `api/maintenance/tasks/{taskId}` | 2 endpoint cập nhật tức thời trong lúc đang thi công: `PUT spare-parts` (hiển thị phụ tùng đang dùng dở, chưa phải trừ kho chính thức — việc trừ kho thật diễn ra ở `MaintenanceCompletionService` khi Complete), `POST progress-update` (chỉ báo tiến độ Kanban). |
| `PmsFormsController.cs` | `api/maintenance/tasks/{taskId}` | GET/PUT `risk-assessment` và `inspection-report` (ĐGRR/BBKT) + `GET .../pdf` xuất PDF qua `PmsPdfService` (`Services/Maintenance/`). |

## Luồng hoạt động chính

### A. Vòng đời task — 2 con đường song song (điểm quan trọng nhất)

```
Con đường 1 — MaintenanceController (route api/maintenance/tasks):
  PATCH tasks/{id}/status  -- đổi trạng thái tự do theo state machine riêng (ValidateStatusTransition,
                               10 trạng thái: SCHEDULED/UPCOMING/DUE/OVERDUE/TASK/PENDING_APPROVAL/
                               REJECTED/PENDING/IN_PROGRESS/COMPLETED/CANCELLED) — dùng cho kéo-thả Kanban
  POST  tasks/{id}/start    -- IN_PROGRESS
  POST  tasks/{id}/complete -- gọi MaintenanceCompletionService.CompleteTaskAsync (trừ kho thật)
  POST  tasks/{id}/approve  -- PENDING_APPROVAL → PENDING/REJECTED (kiểm tra rank C/E hoặc Master theo
                               phòng ban — NHƯNG code kiểm tra rank đã bị comment do cột Rank cũ trên
                               CrewMember đã xoá, "Rank column deleted - skip rank validation for now")

Con đường 2 — TaskWorkflowController (route api/tasks):
  POST {id}/start   → IN_PROGRESS (kiểm tra thiết bị sẵn sàng)
  POST {id}/submit  → PENDING_APPROVAL hoặc COMPLETED thẳng (tuỳ priority) — TRỪ KHO qua
                       MaintenanceCompletionService nếu hoàn thành trực tiếp
  POST {id}/verify  → APPROVE (hoàn thành, PostApprovalScheduleUpdateAsync sinh chu kỳ kế tiếp) /
                       REJECT (→ RECTIFY, yêu cầu sửa lại)
  POST bulk-verify  → duyệt/từ chối hàng loạt — KHÔNG chạy logic trừ kho (khác verify đơn lẻ!)
```

Cả 2 route (`api/maintenance/tasks/{id}/...` và `api/tasks/{id}/...`) đều thao tác trên cùng bảng `MaintenanceTask` — chưa rõ ràng route nào là "chính thức" hiện tại; `TaskWorkflowController` có vẻ mới hơn và đầy đủ nghiệp vụ hơn (dashboard, morning-briefing, rectify), trong khi `MaintenanceController` giữ lại các hành động cũ hơn cho tương thích Kanban.

### B. Sinh task tự động từ lịch bảo trì

```
WorkItemConfigController.Create (schedule mới, AutoGenerate=true, NextDueDate có giá trị)
  → gọi ngay GenerateInitialTask() — task xuất hiện ngay sau cấu hình, không cần chờ worker
    (vốn đang KHÔNG được đăng ký chạy nền — xem Services/Maintenance/README.md)
  → Task được set MISSING_PIC/MISSING_CHECKLIST/MISSING_BOTH/SCHEDULED tuỳ đã đủ người phụ trách +
    checklist hay chưa
```

### C. Checklist, tiến độ, và form ĐGRR/BBKT trong lúc thi công

```
GET  /api/maintenance/tasks/{taskId}/checklist              -- danh sách hạng mục
POST /api/maintenance/tasks/{taskId}/checklist/{itemId}/complete
PUT  /api/maintenance/tasks/{taskId}/spare-parts             -- cập nhật tạm thời (chưa trừ kho)
POST /api/maintenance/tasks/{taskId}/progress-update

Nếu Task.RequireRiskAssessment / RequireInspectionReport (set từ metadata <!--META:...--> khi sinh task):
GET/PUT /api/maintenance/tasks/{taskId}/risk-assessment       -- ĐGRR
GET/PUT /api/maintenance/tasks/{taskId}/inspection-report     -- BBKT
GET     .../risk-assessment/pdf | inspection-report/pdf       -- xuất PDF (PmsPdfService)
```

## Liên kết với phần khác

- **`Services/Maintenance/README.md`** — `MaintenanceCompletionService`, `MaintenanceCycleUpdater` dùng chung cho Counter/worker, `MaintenanceCycleWorker` và `PmsPdfService`. Scheduler tự sinh task cũ đã được xóa.
- **`Repositories/EquipmentAssetRepository.cs`, `MaintenanceScheduleRepository.cs`** — 2 trong 3 nơi duy nhất của cả dự án dùng Repository pattern, tiêm vào `EquipmentAssetController`/`WorkItemConfigController`.
- **`Constants/TaskStatus.cs`** — định nghĩa toàn bộ hằng số trạng thái (`TaskStatus`, `TaskPriority`, `TaskCategory`, `MaintenanceConstants`) dùng xuyên suốt nhóm controller này.
- **`Controllers/Safety/DeferralRequestController`** — xử lý yêu cầu hoãn task (bảng riêng `TaskDeferralRequest`), tương tác trực tiếp với `MaintenanceTask.HasPendingDeferral`/`NextDueAt` mà các controller ở đây đọc/hiển thị.
- **`Controllers/Inventory/`** — `MaintenanceCompletionService` trừ `InventoryStock`/`MaterialItem.OnHandQuantity` khi task hoàn thành; `InventoryController.GetHistory` đọc ngược `MaintenanceTask.SparePartsUsed`/`MaintenanceHistory.SparePartsUsed` để hiển thị lịch sử xuất kho do bảo trì.

## Ghi chú khi đọc/dạy

- **Trùng lặp trách nhiệm giữa `MaintenanceController` và `TaskWorkflowController`** là phát hiện quan trọng nhất của thư mục này — cả 2 đều có hành động "start"/"hoàn thành"/"duyệt" cho cùng 1 `MaintenanceTask`, dùng 2 tiền tố route khác nhau (`api/maintenance/tasks` vs `api/tasks`). Khi dạy, nên yêu cầu sinh viên xác định qua tài liệu API/frontend xem UI hiện tại thực sự gọi endpoint nào, thay vì giả định.
- **`bulk-verify` KHÔNG trừ kho phụ tùng** như `verify` đơn lẻ — nếu duyệt hàng loạt task có dùng spare parts, tồn kho sẽ KHÔNG được cập nhật. Đây là một bất nhất quán thực tế đáng lưu ý khi vận hành (không phải giả định lý thuyết).
- **Kỹ thuật nhúng metadata trong text tự do**: `Schedule.Instructions` chứa `<!--CREW:{...}-->` (vai trò PIC/SUPPORT/RECEIVER) và `<!--META:{...}-->` (cờ yêu cầu ĐGRR/BBKT) dưới dạng HTML comment — bị "bóc" ra bằng string-parsing thủ công ở nhiều nơi (`WorkItemConfigController`, `MaintenanceController.GetMyTasks`). Đây không phải cách làm "chuẩn" (đáng lẽ nên có bảng/cột riêng) nhưng là giải pháp thực dụng để thêm dữ liệu mới mà không phải migrate schema — đáng thảo luận về đánh đổi giữa tốc độ phát triển và tính rõ ràng của mô hình dữ liệu.
- **Nhiều đoạn code kiểm tra theo `CrewMember.Rank` (string) đã bị vô hiệu hoá bằng comment** ("Rank column deleted - skip rank validation for now") sau khi hệ thống chuyển sang `RankId` + navigation property `Rank` — cùng một dấu vết migrate dữ liệu đã thấy ở `Controllers/Crew/CrewController.cs`, cho thấy đây là một đợt refactor lớn ảnh hưởng nhiều module cùng lúc.
- **`EquipmentAssetController`/`WorkItemConfigController` (tương ứng `MaintenanceScheduleRepository`) là 2 trong 3 nơi duy nhất dùng Repository pattern** của toàn dự án — phần còn lại của cả nhóm Maintenance (`MaintenanceController`, `TaskWorkflowController`, `TaskChecklistItemsController`...) vẫn tiêm thẳng `EdgeDbContext`.
