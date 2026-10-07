# Rà soát quyền module Edge — 2026-10-06

Phạm vi: danh sách thao tác và binding API của 29 module. Bảng điều khiển là trang mặc định của tài khoản đã đăng nhập, không cấu hình theo chức danh. API vẫn xác thực phiên và tài khoản phải hoạt động.

## Căn cứ xác định quyền

- Đọc route/controller, DTO và phần xử lý ghi dữ liệu; đối chiếu lời gọi API ở frontend. Tên method và HTTP verb chỉ là dấu hiệu, không đủ để kết luận quyền.
- GET đọc dữ liệu thường là Xem. GET xuất Excel/PDF có thể là Xuất. POST đọc/preview không tự động được coi là Thêm.
- Thêm tạo bản ghi; Sửa thay đổi bản ghi hoặc gửi lại hồ sơ; Phân công thay đổi người được giao hoặc liên kết; Thực hiện ghi kết quả công việc; Duyệt/Từ chối dựa vào quyết định trong payload.
- API máy/cảm biến, seed/sửa dữ liệu hệ thống, quản trị tài khoản và danh mục thuộc bờ không phải thao tác cấp cho chức danh trên tàu.
- API đọc phục vụ nhiều màn hình có thể chấp nhận một trong các quyền Xem liên quan. Điều này không cho phép sửa dữ liệu hoặc mở module chưa được cấp.

## Các lỗi đã sửa

1. Dashboard chỉ đọc: [DashboardPage.tsx](../../edge_product/frontend-edge/src/pages/Dashboard/DashboardPage.tsx) chỉ dùng API đọc và mở popup xem cảnh báo. API `Alarms.CreateAlarm/AcknowledgeAlarm/ResolveAlarm` tồn tại nhưng không phải thao tác của giao diện Dashboard; chuyển thành ADMIN-only. Dashboard có quyền đọc mặc định, được loại khỏi danh sách module có thể bật/tắt.
2. Hàng hải bỏ Thêm: `Telemetry.PostNavigationData` nhận dữ liệu cảm biến, không phải thao tác tạo của người dùng. Dữ liệu tàu bỏ Thêm: `SaveShipData` là lưu/cập nhật, `InitializeFromConfig` là thao tác hệ thống.
3. Vật tư công ty trên tàu chỉ có Truy cập/Xem. API thêm/sửa/xóa danh mục có `ShoreManagedCatalog`, không thể cấp cho tàu. Gán/sửa/xóa liên kết vật tư nằm trong quyền Cập nhật của Thiết bị/Cấu hình công việc, không thuộc module Vật tư công ty. `Material.AdjustStock` thuộc `pms.inventory.update`.
4. Yêu cầu vật tư, Phiếu nhập kho, Tồn kho bỏ Liên kết vì không có API thay đổi liên kết riêng tương ứng.
5. HSQE, Diễn tập và các nhật ký ký sổ bỏ Từ chối: controller/DTO chỉ có duyệt hoặc ký, không có nhánh từ chối. Công việc bảo trì giữ Từ chối vì `VerifyTask/BulkVerifyTasks/ReviewDeferralRequest` có quyết định REJECT. Chuyến đi giữ Từ chối vì tài chính có trạng thái REJECTED; filter kiểm tra `NewStatus` để không dùng nhầm quyền Duyệt.
6. `Hsqe.SubmitDocumentForReview` chuyển từ Duyệt sang Sửa/gửi hồ sơ. `Logbook.SignOffFollowUp` là gửi lại/hủy đề nghị sau khi bờ từ chối, chuyển từ Duyệt sang Sửa.
7. `Voyage.GetCrewAssignments` là API đọc, chuyển từ Phân công sang Xem. `Material.GetAssignedEquipment` cũng dùng Xem. Các API gán/sửa/xóa liên kết vẫn yêu cầu `assign`.
8. `Inventory.Export` yêu cầu quyền Xuất của Tồn kho; quyền Xem thiết bị/công việc không tự cấp quyền xuất kho.
9. Sidebar Nhật ký chỉ xuất hiện khi có ít nhất một mục con được phép mở; các nhóm khác đã lọc mục con trước khi hiển thị.

## Danh sách thao tác sau rà soát

Đây là danh sách quyền API của từng module; không mặc định mọi module có đủ Thêm/Sửa/Xóa. Một module có thể bao gồm nhiều màn hình hoặc popup. Điều kiện nghiệp vụ như trạng thái hồ sơ, người thực hiện và chữ ký vẫn được kiểm tra trong controller/service.

| Module | Thao tác | Căn cứ code/API |
| --- | --- | --- |
| Bảng điều khiển | Xem mặc định, không có switch phân quyền | Dashboard.GetStats, Alarms.GetActiveAlarms, Telemetry.GetLatestNavigation; DashboardPage chỉ đọc |
| Hàng hải | Xem | [TelemetryController](../../edge_product/edge-services/Controllers/Voyage/TelemetryController.cs): API đọc GPS/navigation; POST navigation dành cho cảm biến |
| Dữ liệu tàu | Xem, Cập nhật | [ShipDataController](../../edge_product/edge-services/Controllers/Core/ShipDataController.cs): GetShipData, SaveShipData |
| Thuyền viên | Xem, Thêm, Cập nhật, Xóa, Duyệt, Từ chối | [CrewController](../../edge_product/edge-services/Controllers/Crew/CrewController.cs): hồ sơ/giấy tờ, ApproveCrew/HoldCrew/RejectCrew; Logbook sửa kỳ phục vụ. AddCrew bị chặn trên tàu, quyền Thêm còn phục vụ giấy tờ và kỳ phục vụ |
| Chứng chỉ | Xem, Thêm, Cập nhật | [CertificatesController](../../edge_product/edge-services/Controllers/Crew/CertificatesController.cs): AddCrewCertificate, UpdateCrewCertificate, UploadCertificateFile |
| Cảng | Xem, Thêm, Cập nhật, Xóa | [PortController](../../edge_product/edge-services/Controllers/Voyage/PortController.cs): Get/Create/Update/Delete |
| Chuyến đi | Xem, Thêm, Cập nhật, Xóa, Phân công, Duyệt, Từ chối | [VoyageController](../../edge_product/edge-services/Controllers/Voyage/VoyageController.cs): chuyến đi/cảng/khai thác, AssignCrew; VoyageFinancial xử lý duyệt/từ chối hồ sơ tài chính |
| Báo cáo | Xem, Thêm, Cập nhật, Xóa, Duyệt, Từ chối | [ReportingController](../../edge_product/edge-services/Controllers/Reporting/ReportingController.cs): báo cáo vận hành; AggregateReportController tạo/cập nhật báo cáo tuần/tháng |
| Thiết bị | Xem, Thêm, Cập nhật, Xóa, Import, Liên kết | [EquipmentAssetController](../../edge_product/edge-services/Controllers/Maintenance/EquipmentAssetController.cs), EquipmentGroup.Create/Update/Delete/AddAsset/RemoveAsset; BulkImport và liên kết vật tư |
| Vật tư công ty | Truy cập/Xem | [MaterialController](../../edge_product/edge-services/Controllers/Inventory/MaterialController.cs): GetCatalog/GetAssignedEquipment; không có quyền ghi trong module này |
| Kho | Xem, Thêm, Cập nhật, Xóa | [StoreLocationController](../../edge_product/edge-services/Controllers/Inventory/StoreLocationController.cs): GetAll/GetById/Create/Update/Delete |
| Yêu cầu vật tư | Xem, Thêm, Cập nhật/gửi, Xóa, Duyệt, Từ chối | [MaterialRequestController](../../edge_product/edge-services/Controllers/Inventory/MaterialRequestController.cs): Create/Update/Submit/Delete/Approve/Reject |
| Phiếu nhập kho | Xem, Thêm/xóa, Cập nhật, Duyệt, Hoàn tất nhập kho | [StockReceiptController](../../edge_product/edge-services/Controllers/Inventory/StockReceiptController.cs): Create/Update/Delete/Submit/Approve/Complete; Submit đổi Nháp → Chờ duyệt (quyền create/update), Approve đổi Chờ duyệt → Đã duyệt; Complete hoàn tất và cập nhật tồn kho; không có luồng Từ chối |
| Tồn kho | Xem, Điều chỉnh, Xuất | [InventoryController](../../edge_product/edge-services/Controllers/Inventory/InventoryController.cs): Declare/Adjust/Export; Material.AdjustStock |
| Công việc bảo trì | Xem, Thêm, Cập nhật, Xóa, Phân công, Thực hiện, Duyệt, Từ chối | [MaintenanceController](../../edge_product/edge-services/Controllers/Maintenance/MaintenanceController.cs), TaskWorkflow.StartTask/SubmitTask/VerifyTask/BulkVerifyTasks, DeferralRequest.ReviewDeferralRequest; checklist/biểu mẫu thuộc Thực hiện |
| Cấu hình bảo trì | Xem, Thêm, Cập nhật, Xóa, Import | [WorkItemConfigController](../../edge_product/edge-services/Controllers/Maintenance/WorkItemConfigController.cs): Create/Update/Delete/Import; PreviewDueDates chỉ đọc |
| Counter | Xem, Cập nhật | EquipmentAsset.GetAll/GetById, UpdateRunningHours |
| HSQE/SMS | Xem, Thêm, Cập nhật, Xóa, Duyệt/ký, Import, Phân công | [HsqeController](../../edge_product/edge-services/Controllers/Safety/HsqeController.cs), SmsController: hồ sơ/sự cố/rủi ro/giấy phép, SignRecord/ApproveRecord/AssignTemplates/ImportDocx |
| Diễn tập | Xem, Thêm, Cập nhật, Xóa, Duyệt | [DrillController](../../edge_product/edge-services/Controllers/Safety/DrillController.cs): lịch, CreateDrillLog, ApproveDrillLog; DTO duyệt không có quyết định từ chối |
| Nhật ký boong | Xem, Thêm, Cập nhật, Xóa, Ký | [DeckLogbookController](../../edge_product/edge-services/Controllers/Logbooks/DeckLogbookController.cs): Create/Update/Delete/SignEntry |
| Nhật ký máy | Xem, Thêm, Cập nhật, Xóa, Ký | EngineLogbookController: Create/Update/Delete/SignEntry |
| Nhật ký dầu | Xem, Thêm, Cập nhật, Xóa, Ký | OilRecordController: Create/Update/Delete/SignEntry |
| Nhật ký rác | Xem, Thêm, Cập nhật, Xóa, Ký | GarbageRecord/GarbagePartI/GarbagePartII: Create/Update/Delete/SignEntry |
| Nhật ký nước dằn | Xem, Thêm, Cập nhật, Xóa, Ký | BallastWaterController: Create/Update/Delete/SignEntry |
| Nhật ký trực ca | Xem, Thêm, Cập nhật, Xóa, Ký | WatchkeepingController: Create/Update/Delete/SignEntry |
| Nhật ký hành trình | Xem, Thêm, Cập nhật, Xóa, Ký | VoyageLogController: Create/Update/Delete/SignEntry; DTO chỉ có chữ ký/ghi chú |
| Abstract Log | Xem, Thêm, Cập nhật, Xóa, Xuất | [AbstractLogController](../../edge_product/edge-services/Controllers/Logbooks/AbstractLogController.cs): Create/Update/Delete cho sổ/chặng/dòng; AutoFill/Recalculate cập nhật tổng hợp; ExportExcel/ExportPdf |
| Nhật ký kiểm toán | Xem | [AuditLogController](../../edge_product/edge-services/Controllers/Core/AuditLogController.cs): truy vấn/thống kê. CleanupLogs chỉ dành ADMIN |
| Đồng bộ | Xem, Thực hiện cập nhật đồng bộ | [SyncController](../../edge_product/edge-services/Controllers/Core/SyncController.cs): GetSyncStatus/GetSyncQueue; TriggerSync/ResetErrors/Snapshot/MarkCrewNotificationsViewed |

Danh sách binding đầy đủ nằm trong [permissions.registry.json](../../edge_product/edge-services/permissions.registry.json). API dùng chung có thể có nhiều quyền đọc thay thế nhau. Các quyền từ chối Chuyến đi/Công việc bảo trì được quyết định tại [RankPermissionFilter](../../edge_product/edge-services/Services/Core/RankPermissionFilter.cs) theo payload, thay vì suy từ HTTP verb.

## Cấu hình cũ và kiểm chứng

- Không xóa database cấu hình cũ: quyền đã bỏ được lọc khi tính quyền hiệu lực và khi trả cấu hình cho admin. Khi lưu lại, chỉ giữ quyền hợp lệ. Dashboard không phụ thuộc cấu hình đó.
- Registry vẫn ánh xạ tường minh controller/action. Quyền khai báo phải có binding API hoặc quyết định từ chối đã rà soát; kiểm thử ngăn thêm checkbox không có thao tác.
- Kiểm thử qua RankPermissionFilter xác nhận đọc mặc định Dashboard không cho phép ghi cảnh báo, quyền Xem không cho phép gán/sửa, gửi duyệt không đồng nghĩa duyệt, và Từ chối tài chính độc lập với Duyệt.
- Kiểm thử frontend xác nhận Dashboard mở khi chưa tải quyền và nhóm Nhật ký rỗng không xuất hiện.
- Chưa kiểm chứng trực tiếp mọi thao tác của mọi màn hình bằng trình duyệt. Bản rà soát xác nhận danh sách quyền/binding và các trường hợp hồi quy trên, không thay thế kiểm thử nghiệp vụ hoàn chỉnh của từng module.

## Bổ sung: nhóm quyền và hiển thị thao tác

Các action trong bảng rà soát là mã nội bộ để nối API. Giao diện quản trị hiển thị Truy cập / xem bằng công tắc; gộp create/delete/import thành Thêm / xóa; gộp update/assign thành Cập nhật. Execute, approve, reject, export giữ riêng. Chỉ gộp những action có trong registry của module. Tải mẫu import đi cùng quyền import/create, không thuộc xuất dữ liệu.

Giao diện Edge dùng `PermissionGate` ở các nút thao tác đã rà soát, gồm toolbar, từng dòng và popup. Thiếu quyền ghi sẽ ẩn nút ghi; popup vật tư liên kết vẫn cho xem, nhưng ô yêu cầu/ghi chú chỉ đọc và nút gán/xóa liên kết bị ẩn. Filter backend áp dụng cùng bundle và vẫn chặn request ghi nếu chỉ có module.access. Giữ điều kiện sở hữu dữ liệu của bờ và điều kiện workflow.
