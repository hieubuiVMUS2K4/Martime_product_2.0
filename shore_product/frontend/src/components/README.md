# components/ — Thư viện component dùng chung

## Mục đích

Chứa mọi component **không phải là một "trang"** (page) — từ các khối UI nguyên tử (Button, Card...) đến các khối nghiệp vụ lớn (bản đồ tàu, tab chi tiết tàu, modal PMS). Ranh giới với `pages/`: nếu component được một `<Route>` render trực tiếp → nó thuộc `pages/`; nếu nó được *nhúng vào bên trong* một trang khác → nó thuộc `components/`.

## Cấu trúc & vai trò

| Thư mục / file | Vai trò | README riêng |
|---|---|---|
| `common/` | Component UI nguyên tử tái dùng khắp app: Button, Card, Input/Select, Modal, StatusBadge, Toast, ConfirmDialog, ProtectedImage, ImageViewerModal, PortSelect. | [`common/README.md`](./common/README.md) |
| `layout/` | Khung giao diện bao quanh trang: `TopNavLayout`, `UserMenu`. | [`layout/README.md`](./layout/README.md) |
| `pms/` | 10 modal CRUD phục vụ các trang PMS (`Assets`, `WorkPlanning`) — thêm/sửa/xem thiết bị, lịch bảo trì, nhóm thiết bị, import Excel, duyệt gia hạn. | [`pms/README.md`](./pms/README.md) |
| `ui/` | 4 component kiểu shadcn/ui (Radix + `class-variance-authority`): `button`, `card`, `badge`, `input`. | [`ui/README.md`](./ui/README.md) |
| `vessel/` | `VesselMap` (bản đồ Leaflet nhiều tàu) + `DisasterMapLayer` (lớp cảnh báo thiên tai). | [`vessel/README.md`](./vessel/README.md) |
| `vessel-detail/` | 12 tab nội dung cho `VesselDetailPage` (Overview, Basic Data, Dimensions, Machinery, Shipowner, Charterer, Class/Flag State, Insurance, Radio/Comm, Tanks/Cargo, Crew, Certificate). | [`vessel-detail/README.md`](./vessel-detail/README.md) |
| `Reports/` | `AIInsights` + `AIChatWidget` — 2 component gọi API AI phân tích báo cáo tàu. | [`Reports/README.md`](./Reports/README.md) |

## Luồng hoạt động chính

Không có luồng chung cho cả thư mục — mỗi cụm con có luồng riêng (state cục bộ + gọi `services/`). Xem README của từng thư mục con để biết chi tiết luồng dữ liệu.

## Liên kết với phần khác

- **pages/**: hầu hết page import component từ đây để dựng UI (modal form, tab, bản đồ...).
- **services/**, **hooks/**: các component nghiệp vụ (PMS modal, vessel-detail tab, AI widget) tự gọi service/hook giống như một page thu nhỏ.
- **contexts/**: `common/Toast` và `common/ConfirmDialog` được `App.tsx` bọc ở gốc cây component, nên `useToast()`/`useConfirmDialog()` gọi được từ bất kỳ đâu.

## Ghi chú khi đọc/dạy

- Không có `components/index.ts` gộp tất cả — mỗi thư mục con tự có (hoặc không có) barrel riêng; import phải trỏ đúng đường dẫn con (`@/components/common`, `@/components/vessel/VesselMap`...).
- Có 2 quy ước đặt tên file thư mục con khác nhau: PascalCase (`Reports/`) vs lowercase (`common/`, `layout/`, `pms/`, `ui/`, `vessel/`, `vessel-detail/`) — trên hệ điều hành phân biệt hoa/thường (Linux, kể cả server build) việc gõ sai hoa/thường sẽ gãy import, cẩn thận khi copy-paste.
