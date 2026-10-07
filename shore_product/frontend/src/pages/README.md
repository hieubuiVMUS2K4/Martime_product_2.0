# pages/ — Toàn bộ trang (route) của Shore Dashboard

## Mục đích

Mỗi thư mục con trong `pages/` tương ứng với một **module nghiệp vụ**, chứa 1..n "Page" (`*Page.tsx`, được `routes/AppRoutes.tsx` render trực tiếp) và các modal/tab con chỉ dùng nội bộ module đó. Đây là tầng cao nhất của UI — page gọi `hooks/`/`services/` để lấy dữ liệu, dùng `components/` để dựng UI.

File `REFACTOR_NOTES.md` nằm ngay trong thư mục này là tài liệu lịch sử (viết 2025-10-08) ghi lại lần chuyển từ HTML tĩnh sang React — nhiều page/type nhắc trong đó (Dashboard, CategoryManagement bản gốc, CrewManagementPage) **đã không còn được dùng** trong routing hiện tại (xem cột "Trạng thái" bên dưới); tài liệu vẫn hữu ích để hiểu gốc tích nhưng không mô tả đúng hiện trạng routing.

## Cấu trúc & vai trò (18 module)

| Module | Page chính (route thật) | Trạng thái | Mô tả ngắn |
|---|---|---|---|
| **AssignmentManagement** | `AssignmentListPage` (`/assignments`), `AssignmentDetailPage` (`/assignments/:id`), `PlanningBoardPage` (`/assignments/planning/:vesselId`) | ✅ Thật | Phân công **thuyền viên lên tàu**: manning standard (định biên theo rank), planning board kéo-thả ứng viên vào vị trí, quy trình xác nhận/comment/lịch sử trạng thái. Đừng nhầm với **WorkAssignment** (bên dưới) — tên gần giống nhưng nghiệp vụ khác hẳn. |
| **Auth** | `LoginPage` (`/login`) | ✅ Thật | Form đăng nhập duy nhất, gọi `authService.login()`. Route public duy nhất trong app. |
| **CategoryManagement** | `CategoryManagementPage` (`/categories`) | ✅ Thật (nhưng mỏng) | Chỉ là **tab wrapper** cho dữ liệu tham chiếu: loại chứng chỉ, chức danh, quốc gia, cảng. `?tab=crew` cũ chuyển sang `/crew`. Không có logic riêng đáng kể. |
| **ComplianceManagement** | `ComplianceDashboardPage` (`/compliance`), `RuleSetsPage` (`/compliance/rule-sets`), `CrewEvaluationPage` (`/compliance/evaluate/:crewId`) | ✅ Thật | Bộ quy tắc tuân thủ STCW/MLC theo rank/tàu, waiver (miễn trừ), engine đánh giá crew đủ điều kiện lên tàu hay không (Eligible/Warnings/Not Eligible/Waiver), snapshot toàn fleet. |
| **CrewManagement** | `CrewHubPage` (`/crew`), `CrewDetailPage` (`/crew/:id`) | ✅ Thật | Mục menu "Thuyền viên". `CrewHubPage` gồm 3 tab: Hồ sơ (`MasterDataManagement/Crew/CrewListPage`), Phê duyệt rời tàu (`PendingSignOffsPage`), Chứng chỉ thuyền viên (`RankComplianceTab`: lưới thuyền viên × chứng chỉ yêu cầu theo chức danh). Ngoài ra: chi tiết thuyền viên, các modal thêm chứng chỉ/tài liệu, `CrewLogbookSection` (sổ nhật ký crew). |
| **Dashboard** | *(không có route)* | ❌ **Không gắn route, nhưng KHÔNG phải mock** | `DashboardPage.tsx` là một trang tổng quan đầy đủ chức năng — gọi thật `voyageApi.getFleetDashboard()`, hiển thị số liệu tài chính/hải trình, có Link sang `/voyages` và `/crew`. Tuy vậy **`routes/AppRoutes.tsx` không import nó** — trang chủ thật của app là `/report` (xem module **Report**). Nhiều khả năng đây là bản dashboard "ứng viên trang chủ" bị thay thế bởi `ReportPage` nhưng chưa bị xoá khỏi source. |
| **DocumentWorkflow** | `VerificationQueuePage` (`/verification-queue`) | ✅ Thật | Hàng đợi xác minh giấy tờ thuyền viên (passport, health, employment...) trước khi duyệt onboarding — verify/reject từng task. |
| **ExternalRequestManagement** | `ExternalRequestListPage`/`ExternalRequestDetailPage` (`/external-requests`, `/external-requests/:id`) | ✅ Thật | "Tuyển ngoài" — gửi yêu cầu tuyển dụng cho manning agency bên ngoài, theo dõi ứng viên & tin nhắn trao đổi. |
| **Materials** | `MaterialPage` (`/materials`), `StoreLocationPage`, `MaterialRequestPage`, `StockReceiptPage`, `InventoryPage` (`/materials/*`) | ✅ Thật, cấu trúc phức tạp | Quản lý vật tư kho: danh mục & item, vị trí lưu kho, phiếu yêu cầu vật tư, **2 luồng nhập kho song song**, tồn kho tổng hợp. → xem **[README riêng](./Materials/README.md)**. |
| **OnboardManagement** | `OnboardDashboardPage` (`/onboard-events`, menu hiển thị "Onboard") | ✅ Thật | Sự kiện lên/xuống tàu **vật lý**: Sự kiện (arrival...), Quyền truy cập (access grant/suspend/revoke), sổ Sign-On, sổ Sign-Off. Đừng nhầm với **OnboardingManagement**. |
| **OnboardingManagement** | `OnboardingDashboardPage` (`/onboarding`), `OnboardingDetailPage` (`/onboarding/:caseId`) | ✅ Thật | Quy trình **tuyển dụng/onboarding thuyền viên mới**: case theo trạng thái Draft→Invited→InProgress→PendingReview→Approved→Activated, checklist hoàn thành. Đừng nhầm với **OnboardManagement** (tên chỉ khác nhau chữ "-ing"). |
| **PMS** | `MasterSchedulePage`, `AssetsPage`, `WorkPlanningPage`, `WorkReportPage` (`/pms/*`) | ✅ Thật, cấu trúc phức tạp | Bảo trì phòng ngừa (Preventive Maintenance System): lịch bảo trì toàn fleet, cây thiết bị, kế hoạch công việc (Table/Calendar/Gantt), xem báo cáo công việc **đã đồng bộ từ Edge**. → xem **[README riêng](./PMS/README.md)**. |
| **Report** | `ReportPage` (`/report` — **trang chủ thật**, `/` redirect vào đây), `ReportDetailPage` (`/report/:reportId`), `VesselReportDetailPage` (`/report/vessel/:vesselId`) | ✅ Thật | Danh sách tàu kèm thống kê báo cáo, chi tiết 1 báo cáo (có `AIInsights`), chi tiết báo cáo theo tàu (có `AIChatWidget`). |
| **SyncManagement** | `SyncDashboardPage` (`/sync`, menu "Đồng bộ") | ✅ Thật | Dashboard giám sát đồng bộ Shore ↔ Edge: log, hàng đợi outbox, danh sách tàu online/offline, force-push thủ công. → xem **[README riêng](./SyncManagement/README.md)**. |
| **TravelManagement** | `TravelListPage`/`TravelDetailPage` (`/travel`, `/travel/:id`) | ✅ Thật | Yêu cầu di chuyển (đặt vé máy bay...) phục vụ thuyền viên lên/xuống tàu — trạng thái Draft→Pending→Booking→Booked→InTransit→Completed. |
| **VesselManagement** | `VesselsPage` (`/vessels`), `VesselDetailPage` (`/vessels/:id`), `VesselTrackingPage` (`/vessels/tracking`) | ✅ Thật, cấu trúc phức tạp | CRUD đội tàu, hồ sơ kỹ thuật/thương mại chi tiết theo 12 tab + nhúng cả PMS/Materials theo tàu, bản đồ theo dõi vị trí nhiều tàu real-time. → xem **[README riêng](./VesselManagement/README.md)**. |
| **VoyageManagement** | `VoyageListPage` (`/voyages`), `VoyageFormPage` (`/voyages/new`, `/voyages/:id/edit`), `VoyageDetailPage` (`/voyages/:id`) | ✅ Thật | Danh sách chuyến đi + fleet dashboard, timeline/performance/review từng chuyến (dữ liệu vận hành gốc từ Edge). |
| **WorkAssignment** | `WorkAssignmentPage` (`/work-assignments`, menu "QL phân công công việc" trong `MainLayout` cũ — không còn hiển thị ở `TopNavLayout`) | 🧪 **Mock data** | Danh sách "kế hoạch kiểm tra kỹ thuật tàu" — toàn bộ dữ liệu là mảng `mockWorkPlans` hard-code trong file, **không gọi service/API nào**. Là trang duy nhất còn dùng thật `components/common` (Button/Input/Select/Modal/StatusBadge). |

## Luồng hoạt động chính

```
routes/AppRoutes.tsx  → chọn <XxxPage/> theo path
   ▼
pages/<Module>/<Xxx>Page.tsx
   │  gọi hooks/useXxx() (nếu có)  hoặc  gọi services/xxx.service.ts trực tiếp
   │  render bằng components/ (modal, tab, bản đồ...) hoặc JSX/Tailwind viết tay
   ▼
services/*.service.ts → /api/... (Vite proxy) → Shore Backend (port 5000) → PostgreSQL
```

Mỗi module export qua `index.ts` riêng (trừ **Materials**, không có `index.ts` — import thẳng theo path file) rồi được `routes/AppRoutes.tsx` import theo `import { X } from '../pages/<Module>'`.

## Liên kết với phần khác

- **routes/AppRoutes.tsx**: nguồn sự thật duy nhất về việc page nào thực sự "sống" (đang được route tới) — nếu nghi ngờ 1 page có dùng hay không, luôn đối chiếu file này trước.
- **components/layout/TopNavLayout.tsx**: định nghĩa menu điều hướng thực tế hiển thị (khác danh sách trong `components/layout/MainLayout.tsx` đã lỗi thời).
- **hooks/, services/**: tầng dữ liệu đứng sau hầu hết page — xem `hooks/README.md`, `services/README.md` để tra cứu API thật.

## Ghi chú khi đọc/dạy

1. **3 cặp tên dễ nhầm nhất trong toàn bộ Shore Frontend** — luôn nhắc học viên mới phân biệt:
   - `AssignmentManagement` (phân công **thuyền viên** lên tàu) vs `WorkAssignment` (kế hoạch **công việc/kiểm tra kỹ thuật**, hiện là mock).
   - `OnboardManagement` (sự kiện lên/xuống tàu **vật lý**: sign-on/sign-off/access) vs `OnboardingManagement` (case **tuyển dụng/hoàn thiện hồ sơ** thuyền viên mới).
   - `PMS/WorkPlanningPage` (kế hoạch công việc bảo trì, **dữ liệu thật** đồng bộ từ Edge) vs `pages/WorkAssignment/WorkAssignmentPage` (**mock**, tên nghe rất giống "Work...").
2. **`Dashboard/` không có route nào cả** — nếu bạn được giao "sửa trang Dashboard", hỏi lại xem ý người giao việc là `pages/Report/ReportPage.tsx` (trang chủ thật) hay thực sự muốn hồi sinh `pages/Dashboard/DashboardPage.tsx` (hiện chết).
3. **Không phải route nào cũng có lối vào từ menu.** Menu thật (`components/layout/TopNavLayout.tsx`) chỉ có: Danh mục (crew/certificate-types), Danh sách tàu, Tracking, Onboarding, Xác minh, Tuân thủ, Phân công, Tuyển ngoài, Di chuyển, Onboard, Báo cáo, Đồng bộ — cộng thêm logo "Maritime" ở góc trái link sang `/crew`. Kiểm tra bằng grep cho thấy các route sau **không được bất kỳ trang đang hoạt động nào liên kết tới** (chỉ vào được bằng gõ thẳng URL, hoặc — với PMS/Materials — bằng cách mở tab tương ứng trong `VesselManagement/VesselDetailPage`): `/certificates`, `/work-assignments`, `/voyages` (chỉ được `Dashboard/DashboardPage.tsx` link tới, mà trang đó tự nó cũng không có route), `/pms/master-schedule`, `/pms/assets`, `/pms/work-planning` (dạng standalone, khác với bản nhúng trong tab tàu), `/materials/*` (dạng standalone). Khi có người báo "không tìm thấy tính năng X ở đâu trong menu", đây là danh sách đầu tiên cần tra.
4. 4 module dưới đây được tách README riêng vì cấu trúc/luồng dữ liệu phức tạp hơn hẳn phần còn lại (nhiều service, nhiều sub-feature, hoặc là điểm quan sát trung tâm của kiến trúc Edge-Shore): **SyncManagement**, **VesselManagement**, **PMS**, **Materials**. Các module còn lại theo đúng một khuôn mẫu CRUD list/detail giống nhau (list page + detail page + đôi khi form modal), đọc kỹ một module (khuyến nghị **TravelManagement** hoặc **ExternalRequestManagement** — đơn giản, ít ngoại lệ) là đủ suy ra cách đọc các module còn lại.
4. Không có quy ước thống nhất "index.ts luôn tồn tại" — `Materials/` không có; các module khác đều có.
