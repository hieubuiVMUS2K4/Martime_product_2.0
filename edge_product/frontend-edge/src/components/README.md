# components/ — Thư viện component dùng chung

## Mục đích

Chứa toàn bộ component React tái sử dụng được nhiều trang (`pages/`) dùng chung: layout khung sườn, modal
CRUD theo domain, bảng/ô nhập liệu atomic, và các khối UI nguyên tử theo phong cách shadcn/ui. Quy tắc phân
loại: nếu một component chỉ phục vụ **một** page duy nhất, nó thường nằm ngay trong thư mục `pages/` tương
ứng; nếu được **nhiều page hoặc nhiều domain** dùng lại, nó nằm ở đây theo tên miền nghiệp vụ.

## Cấu trúc & vai trò

| Thư mục/file | Vai trò | README riêng? |
|---|---|---|
| `layouts/` | `MainLayout` (Sidebar+Header+Outlet), `Header`, `Sidebar`, `UserMenu`, `SyncNotificationBell` | Không — mô tả trong mục dưới |
| `auth/` | `AuthGuard` — bảo vệ route, khởi tạo phiên đăng nhập | Không |
| `settings/` | `SettingsButton`, `SettingsDialog` (Radix Dialog) — điều khiển theme/font/ngôn ngữ | Không |
| `ui/` | `alert.tsx`, `badge.tsx`, `card.tsx`, `tabs.tsx` — wrapper phong cách shadcn/ui trên nền Radix + `cva` + `cn()` | Không (nguyên tử) |
| `common/` | `LogbookGrid`, `MaritimeInput`, `Pagination`, `CoordinatePicker`, `VirtualizedTable` (dựa `react-window`) — atomic dùng khắp `pages/logbooks`, form nhập liệu | Không (nguyên tử) |
| `ship-data/` | `particularsConfig` (tab → nhóm → trường của trang Dữ liệu tàu), `VesselMap` (react-leaflet) | Không |
| `drill/` | `DrillEditModal`, `DocumentPreviewModal`, `DocumentUploadZone` — phục vụ `pages/Safety/DrillTimelinePage` | Không |
| **`crew/`** | 5 modal quản lý thuyền viên (thêm mới, tài liệu, sức khoẻ, xem ảnh, chứng chỉ) | **Có** — `components/crew/README.md` |
| **`editor/`** | `RichTextEditor` (tiptap) — trình soạn thảo rich text dùng cho tài liệu SMS | **Có** — `components/editor/README.md` |
| **`logbooks/`** | `GarbagePartIForm`, `GarbagePartIIForm` — form MARPOL Annex V phức tạp | **Có** — `components/logbooks/README.md` |
| **`maintenance/`** | Toàn bộ Kanban (dnd-kit) + modal task bảo trì | **Có** — `components/maintenance/README.md` |
| **`pms/`** | 10 modal Asset/Group/Schedule/Import/Deferral | **Có** — `components/pms/README.md` |
| **`reporting/`**, **`MonthlyReport/`**, **`WeeklyReport/`** | UI dùng chung cho báo cáo + 2 module báo cáo tổng hợp | **Có** — `components/reporting/README.md` (gộp cả 3 thư mục) |
| `DailyNoonReportForm.tsx`, `UnifiedReportingForm.tsx`, `MonthlyReport.tsx`, `WeeklyReport.tsx` (file rời, không phải thư mục) | Bản dựng thử/legacy của tính năng báo cáo | Không — xem cảnh báo bên dưới |
| `ErrorMessage.tsx` | `ErrorMessage`, `SuccessMessage`, `WarningMessage` — khối thông báo trạng thái dùng lại ở vài trang (`WorkReportPage`, `AccountManagementPage`) | Không |

## Luồng hoạt động chính

Layout bọc mọi trang:

```
App.tsx  → <AuthGuard><MainLayout /></AuthGuard>
              │
              ├─ AuthGuard (components/auth/)      → kiểm tra useAuthStore, redirect /login nếu chưa đăng nhập
              └─ MainLayout (components/layouts/)
                    ├─ Sidebar   → menu điều hướng theo route
                    ├─ Header    → tên user (UserMenu), SyncNotificationBell (poll 30s)
                    └─ <Outlet/> → nội dung page hiện tại (pages/*)
```

Modal theo domain (crew/maintenance/pms/logbooks) tuân theo một khuôn mẫu chung:

```
Page cha (vd. MaintenancePage) giữ state isOpen + hàm onSave
   ▼
<AddXModal isOpen={...} onClose={...} onSave={...} />
   │  form nội bộ, validate, gọi service tương ứng (vd. maritimeService.maintenance.create)
   ▼
Gọi onSave()/onClose() → page cha tự fetch lại danh sách (không có cơ chế cache/invalidate tự động
   qua Zustand hay React Query cho phần lớn modal — trừ nơi có dùng useCachedMetadata)
```

## Liên kết với phần khác

- **`pages/`**: mọi thư mục trong `components/` được ít nhất 1 page trong `pages/` sử dụng (trừ các file dead
  code nêu dưới).
- **`services/`**: modal luôn gọi service tương ứng để tạo/sửa/xoá — không tự gọi `fetch` trực tiếp (trừ vài
  ngoại lệ đã nêu ở `services/README.md`, mục "3 cách gọi API").
- **`stores/settings.store.ts`, `contexts/I18nContext.tsx`**: `SettingsDialog` là giao diện duy nhất chỉnh
  theme/ngôn ngữ.
- **`components/ui/`**: `card`, `badge`, `alert`, `tabs` được dùng ở các trang có dashboard số liệu (vd.
  `pages/FuelAnalytics`) — nhưng nhiều nơi khác trong app lại dùng thẳng `@radix-ui/react-dialog`,
  `react-toastify`, `sonner`... mà không bọc qua `components/ui/` (vd. `SettingsDialog.tsx` tự
  `import * as Dialog from '@radix-ui/react-dialog'`), nên đừng mặc định "mọi Radix component đều có wrapper
  trong `ui/`" — chỉ 4 loại kể trên có wrapper thật.

## Ghi chú khi đọc/dạy

- **4 file rời ngay dưới `components/` là code cũ/thử nghiệm, không thuộc luồng đang chạy**: đã xác nhận
  bằng `grep` toàn bộ `src/`:
  - `UnifiedReportingForm.tsx` chỉ tự import `./WeeklyReport` và `./MonthlyReport` (2 **file** legacy, không
    phải 2 **thư mục** cùng tên) — không có nơi nào khác import `UnifiedReportingForm`.
  - `components/MonthlyReport.tsx` và `components/WeeklyReport.tsx` (file `.tsx` nằm ngay cạnh, KHÔNG phải
    bên trong, thư mục `MonthlyReport/`/`WeeklyReport/`) là bản viết tay đơn giản hơn, chỉ được
    `UnifiedReportingForm.tsx` dùng — tức là cả chuỗi 3 file này (`UnifiedReportingForm` +
    `MonthlyReport.tsx` + `WeeklyReport.tsx`) hoàn toàn tách biệt khỏi app thật.
  - `DailyNoonReportForm.tsx` cũng không được import ở đâu khác.
  - **Điểm nguy hiểm cần nhớ**: vì vừa có file `MonthlyReport.tsx` vừa có thư mục `MonthlyReport/`, nếu ai đó
    lỡ viết `import X from '../../components/MonthlyReport'` (không có `/index` ở cuối), bundler sẽ ưu tiên
    phân giải sang **file** `MonthlyReport.tsx` (bản cũ, đơn giản hơn) chứ không phải thư mục — trong khi
    code thật đang dùng luôn viết rõ `'.../MonthlyReport/index'`. Khi thêm import mới, luôn ghi rõ `/index`
    hoặc tốt hơn là đổi tên/xoá file cũ để tránh nhầm lẫn.
- Việc phân chia `ui/` (nguyên tử, vô trạng thái) và `common/` (atomic nhưng có logic — vd. `LogbookGrid` tự
  render bảng theo cấu hình cột) là quy ước ngầm của dự án, không có tài liệu chính thức nào ép buộc — khi
  thêm component mới, cứ theo tinh thần: không gọi API, không phụ thuộc domain cụ thể → `ui/`; có thể tái sử
  dụng nhưng vẫn "biết" về domain (logbook, maritime input...) → `common/`.
