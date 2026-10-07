# pages/Crew — Quản lý thuyền viên & chứng chỉ trên tàu

## Mục đích

`Crew/` là toàn bộ giao diện quản lý **hồ sơ thuyền viên (crew)** và **chứng chỉ** ở phía Edge (trên tàu). Thư
mục này gồm 2 nhóm chức năng gắn chặt nhau:

1. **Nhân sự onboard**: xem danh sách thuyền viên đang ở trên tàu, xem hồ sơ chi tiết, và **duyệt thuyền viên
   mới** do Shore đẩy xuống (quy trình PendingReview → Approved/OnHold/Rejected — xem mục 6.3 README gốc dự án).
2. **Danh mục & giám sát chứng chỉ**: theo dõi hạn chứng chỉ của từng thuyền viên (STCW) và quản lý danh mục
   loại chứng chỉ + quốc gia/chức danh công nhận.

Đây là một trong những module "nghiệp vụ thật" chảy qua cơ chế sync 2 chiều: hồ sơ HR do **Shore** sở hữu,
còn trạng thái vận hành (IsOnboard, ngày lên/xuống tàu) do **Edge** sở hữu (xem `Ghi chú` bên dưới).

## Cấu trúc & vai trò

| File | Route (App.tsx) | Vai trò |
|---|---|---|
| `CrewPage.tsx` | `crew/members` | Danh sách thuyền viên onboard + khu vực **duyệt crew mới** (approve/hold/reject). Có cache danh sách onboard, sắp xếp theo cột, tải thông báo thay đổi từ Shore, export danh sách ra PDF (jsPDF) |
| `CrewDetailPage.tsx` | `crew/:id` và `crew/:id/standalone` (bản có `AuthGuard`, full-screen) | Hồ sơ đầy đủ 1 thuyền viên — **file lớn nhất thư mục (~131 KB)**: thông tin cá nhân, 4 nhóm giấy tờ (travel/seafarer/employment/health), avatar, và nhúng `CrewLogbookSection` |
| `CertificateMonitorView.tsx` (export tên `CrewCertificatePage`) | `crew/certificates` | Bảng giám sát chứng chỉ toàn bộ thuyền viên — phân loại Còn hạn / Sắp hết hạn / Hết hạn (dashboard tuân thủ STCW) |
| `CertificateManagementPage.tsx` | `crew/certificates/:certificateId` | Quản lý **danh mục** 1 loại chứng chỉ: quốc gia công nhận (`country-certificates`) và chức danh bắt buộc (`rank-certificates`) |
| `CrewLogbookSection.tsx` | — (component nhúng trong `CrewDetailPage`) | Sổ nhật ký cá nhân thuyền viên (seaman's record) — nhận `crewMemberId`, `onSaved` |
| `AddCrewCertificateModal.tsx` | — | Modal gán/sửa chứng chỉ cho 1 thuyền viên (upload file scan) |
| `DetailCertificatesModal.tsx` | — | Modal xem/sửa chi tiết một chứng chỉ đã gán |
| `AddCertificateModal.tsx` | — | Modal thêm loại chứng chỉ mới vào danh mục |

> Edge không có thao tác thêm thuyền viên. Thuyền viên được tạo trên Shore rồi đồng bộ xuống tàu.

## Luồng hoạt động chính

```
CrewPage  (crew/members)
   ├─ maritimeService.crew.getOnboard()  → GET /api/crew/onboard   → danh sách onboard (có cache)
   ├─ maritimeService.crew.getPending()  → GET /api/crew/pending   → hàng đợi duyệt
   ├─ fetch('/api/sync/notifications/crew-summary')  → số trường Shore vừa đổi cho mỗi crew
   │
   ├─ Duyệt crew mới:
   │     approve → maritimeService.crew.approve(id) → POST /api/crew/:id/approve  (IsOnboard=true)
   │     hold    → maritimeService.crew.hold(id)    → POST /api/crew/:id/hold
   │     reject  → maritimeService.crew.reject(id)  → POST /api/crew/:id/reject
   │
   └─ click 1 dòng → điều hướng /crew/:id → CrewDetailPage
                                              ├─ getById / get*Documents / uploadAvatar / updateDocumentFile
                                              └─ <CrewLogbookSection crewMemberId=... />
```

Nhánh chứng chỉ đi qua **fetch trực tiếp** (không qua `maritimeService`) tới danh mục dùng chung:
`/api/certificates`, `/api/countries`, `/api/ranks`, và 2 endpoint batch
`/api/country-certificates/batch`, `/api/rank-certificates/batch`.

## Liên kết với phần khác

- **`services/maritime.service.ts`** (`maritimeService.crew`): getAll, getOnboard, getPending, getById,
  update, approve, hold, reject, uploadAvatar, updateDocumentFile, get{Travel,Seafarer,Employment,Health}Documents.
- **`components/crew/`**: các modal giấy tờ và hồ sơ thuyền viên — xem `components/crew/README.md`.
- **`types/maritime.types.ts`**: kiểu `CrewMember`.
- **Backend Edge** `Controllers/Crew/` (CrewController, CertificatesController, CountriesController,
  RanksController...) — xem `edge-services/Controllers/Crew/README.md` để hiểu phía server.
- **Cơ chế sync**: mọi thay đổi crew/chứng chỉ đều được backend enqueue vào `SyncQueue` để đẩy lên Shore.

## Ghi chú khi đọc/dạy

- **Quy tắc sở hữu dữ liệu (quan trọng nhất)**: hồ sơ HR (họ tên, ngày sinh, mã BHXH, mã thuế) do **Shore**
  sở hữu; trạng thái vận hành (`IsOnboard`, ngày lên/xuống tàu, tàu hiện tại) do **Edge** sở hữu. Vì vậy
  `IsOnboard` **không** sửa trực tiếp ở form cập nhật — chỉ đổi qua nút approve/hold/reject. Cột "thông báo
  thay đổi từ Shore" (`crew-summary`) chính là để captain biết Shore vừa sửa trường nào.
- Có **2 loại "certificate" dễ nhầm**: (1) *danh mục loại chứng chỉ* (Certificate — quản lý ở
  `CertificateManagementPage`/`AddCertificateModal`) và (2) *chứng chỉ một thuyền viên đang giữ* (CrewCertificate —
  gán ở `AddCrewCertificateModal`). Nhớ phân biệt khi dạy.
- `CrewPage` dùng **cache cục bộ** (`crewOnboardCache`) để tránh gọi lại API; sau khi approve phải chủ động
  `setCrewOnboardCache(null)` để làm mới — nếu quên, danh sách sẽ không cập nhật.
- File dùng lẫn `sonner` (toast), `jsPDF` (export) và `date-fns` (format ngày) — cùng bộ thư viện với các trang khác.
- Nhánh chứng chỉ gọi API bằng `fetch` thô kèm `Bearer` token đọc từ `localStorage('maritime_token')`, khác với
  các nhánh khác đi qua `apiClient`/service — một điểm bất nhất về cách gọi API (xem `services/README.md`).
