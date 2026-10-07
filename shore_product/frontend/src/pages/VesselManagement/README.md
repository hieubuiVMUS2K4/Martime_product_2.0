# pages/VesselManagement — Hồ sơ & theo dõi đội tàu

## Mục đích

Module lớn nhất trong `pages/` theo mức độ "gộp nghiệp vụ": không chỉ CRUD thông tin tàu, mà `VesselDetailPage` còn đóng vai trò **workspace trung tâm cho một con tàu cụ thể**, nhúng cả PMS lẫn Materials được lọc theo đúng tàu đó.

## Cấu trúc & vai trò

| File | Route | Vai trò |
|---|---|---|
| `VesselsPage.tsx` (+ `.css`) | `/vessels` | Danh sách tàu dạng bảng: CRUD (thêm/sửa/xoá), hiển thị vị trí gần nhất, số cảnh báo chưa xác nhận (`unacknowledgedAlerts`), link sang chi tiết tàu và sang Tracking. Tự fetch qua `ENV.API_BASE_URL` (không qua file service riêng). |
| `VesselDetailPage.tsx` (+ `.css`) | `/vessels/:id` | **Trang phức tạp nhất module**: fetch 1 lần toàn bộ object `Vessel` (80+ field kỹ thuật/thương mại), render dạng tab. 12 tab đầu tiên đến từ `components/vessel-detail/*` (Overview, Basic Data, Dimensions, Machinery, Shipowner, Charterer, Class/Flag State, Insurance, Radio/Comm, Tanks/Cargo, Crew, Certificate). Thêm **6 tab khác** là nguyên trang PMS/Materials được nhúng thẳng bằng cách import component: `AssetsPage`, `WorkPlanningPage` (từ `pages/PMS/`), `MaterialPage`, `MaterialRequestPage`, `StockReceiptPage`, `InventoryPage` (từ `pages/Materials/`) — lọc theo tàu đang xem. |
| `VesselTrackingPage.tsx` | `/vessels/tracking` (menu "🛰️ Tracking") | Bản đồ Leaflet nhiều tàu real-time, dùng `components/vessel/VesselMap`. |
| `VesselDetailPage.tsx.backup2` | *(không phải route)* | **File backup thủ công** (đuôi `.tsx.backup2`) — không được TypeScript/Vite biên dịch vào bundle (không khớp `*.tsx`), an toàn để bỏ qua khi đọc code, nhưng hữu ích nếu cần so sánh lịch sử chỉnh sửa `VesselDetailPage.tsx`. |
| `VesselsPage.css`, `VesselDetailPage.css` | — | Style riêng từng trang. |
| `index.ts` | — | Export `VesselsPage`, `VesselDetailPage`, `VesselTrackingPage`. |

## Luồng hoạt động chính

**Danh sách → chi tiết:**
```
VesselsPage  ──(click "Xem chi tiết")──►  /vessels/:id
                                              │
                                    VesselDetailPage
                                       │  GET {ENV.API_BASE_URL}/vessels/:id  (1 lần, object Vessel đầy đủ)
                                       │  state: activeTab: TabId  (nhóm hiển thị theo TAB_GROUPS: Tổng quan / Thuyền viên / Ship Data / PMS / Vật tư)
                                       ▼
                       switch(activeTab):
                         'overview'                                       → VesselOverviewTab (tự fetch alerts/engine events riêng)
                         'basic-data' … 'insurance' (9 mục con)            → VesselParticularsPanel (GET/PUT /vessels/:id/particulars, đồng bộ hai chiều với tàu)
                         'certificates'                                    → VesselCertificateTab
                         'crew'                                            → VesselCrewTab (tự fetch crewApi riêng theo vesselId)
                         'pms-assets' | 'pms-work-planning'                → <AssetsPage/> | <WorkPlanningPage/>  (nguyên trang PMS, lọc theo vessel)
                         'materials-list'|'materials-requests'|
                         'materials-receipts'|'materials-inventory'        → <MaterialPage/>|<MaterialRequestPage/>|<StockReceiptPage/>|<InventoryPage/>
```

Thông số tàu đồng bộ **hai chiều** theo từng trường: bờ sửa được mọi trường (trừ IMO) và gửi xuống tàu; tàu sửa thì gửi lên bờ. Xem `components/vessel-detail/README.md`.

**Theo dõi vị trí:**
```
VesselTrackingPage
   │  fetch danh sách tàu + vị trí mới nhất mỗi tàu
   ▼
components/vessel/VesselMap  (multi-vessel mode)
   │  click marker / nút "View Details" → navigate(`/vessels/${id}`)
```

## Liên kết với phần khác

- **components/vessel-detail/**: 12 tab nội dung — xem README riêng của thư mục đó.
- **components/vessel/VesselMap**: bản đồ dùng bởi trang tracking.
- **pages/PMS/, pages/Materials/**: được **nhúng trực tiếp** (không phải điều hướng route) vào `VesselDetailPage` — đây là lý do các trang PMS/Materials "độc lập" (`/pms/assets`, `/materials`...) và "bản nhúng trong tàu" là **cùng một component React**, chỉ khác context/props khi mount.
- **services/crew.service.ts**: hậu thuẫn tab Crew.
- **contexts/VesselContext**: về mặt khái niệm liên quan (chọn tàu toàn cục) nhưng **không thực sự được `VesselDetailPage`/`VesselsPage` sử dụng** — mỗi trang tự fetch/tự quản lý vessel theo `useParams()`/state riêng (xem `contexts/README.md`).

## Ghi chú khi đọc/dạy

- **`VesselDetailPage.tsx` là ứng viên hàng đầu để minh hoạ khái niệm "workspace theo tàu"**: thay vì bắt người dùng rời trang để vào PMS/Materials riêng rồi tự lọc theo tàu, trang này mount thẳng các trang đó với tàu đã biết trước — đây là mẫu thiết kế đáng chú ý nhất trong toàn bộ Shore Frontend, nên dùng làm ví dụ khi dạy về tái sử dụng "page-as-component".
- Vì 6 tab PMS/Materials trong `VesselDetailPage` chính là **import thẳng component trang** (không phải bản rút gọn riêng), bất kỳ thay đổi nào ở `pages/PMS/AssetsPage.tsx` hay `pages/Materials/*.tsx` đều ảnh hưởng **đồng thời** cả bản standalone (`/pms/assets`) lẫn bản nhúng trong tàu — không có 2 bộ code riêng biệt cần đồng bộ tay, nhưng cũng có nghĩa là sửa 1 nơi có thể gãy UI ở nơi kia nếu không kiểm tra kỹ props/context mà từng nơi truyền vào.
- File `.tsx.backup2` là dấu hiệu quen thuộc của việc sửa tay một file lớn/rủi ro rồi tự backup thủ công thay vì tin tưởng hoàn toàn vào git — không phải quy ước chính thức của dự án, không nên tạo thêm file kiểu này khi làm việc (dùng git commit/branch thay thế).
- `/vessels/tracking` phải được khai báo **trước** `/vessels/:id` trong `routes/AppRoutes.tsx` để `react-router` không hiểu nhầm "tracking" là một `:id`.
