# pages/SyncManagement — Dashboard giám sát đồng bộ Shore ↔ Edge

## Mục đích

Đây là **cửa sổ quan sát duy nhất từ phía Shore** vào cơ chế đồng bộ store-and-forward mô tả ở README gốc (mục 5 — Sync Protocol). Trang cho phép người vận hành trên bờ biết: tàu nào đang online, hàng đợi Shore→Edge còn bao nhiêu bản ghi chưa gửi, log đồng bộ gần đây thành công/lỗi ra sao, và cho phép **ép đồng bộ ngay** thay vì chờ chu kỳ tự động.

## Cấu trúc & vai trò

| File | Vai trò |
|---|---|
| `SyncDashboardPage.tsx` | Trang duy nhất (route `/sync`, menu "Đồng bộ"). Chứa cả UI chính lẫn sub-component `ShoreConfirmModal` (modal xác nhận trước khi force-push) ngay trong cùng file. |
| `index.ts` | `export { SyncDashboardPage } from './SyncDashboardPage'`. |

Không có modal/tab con nào khác — đây là module **đơn giản nhất về cấu trúc file** trong số 4 module có README riêng, nhưng **đậm đặc về ý nghĩa kiến trúc** (là nơi duy nhất UI phản chiếu trực tiếp bảng `SyncOutbox`/`SyncLog`/node tracker của Backend).

## Luồng hoạt động chính

```
SyncDashboardPage (mount)
   │
   ├─ syncApi.getStatus()  ──► GET /api/sync/status
   │     trả về: { outboxStats[], recentLogs[], serverTime, nodes[] }
   │
   ├─ setInterval(fetchData, syncInterval*1000)   ← auto-refresh, mặc định 15s, chọn được 10/15/30/60s
   │
   ├─ render 3 khối:
   │     • Nhật ký đồng bộ (bảng recentLogs, phân trang 10 dòng/trang, cột Hướng/Nguồn/Loại DL/Hành động/ID/Trạng thái/Thời gian)
   │     • Đội tàu (nodes[] — chấm xanh/xám online/offline, "HB: x phút trước" = lastHeartbeatAt)
   │     • Hàng đợi Shore (outboxStats[] — thanh tiến trình theo bảng dữ liệu, dịch tên bảng sang tiếng Việt qua TABLE_TO_LABEL)
   │
   └─ nút "Đồng bộ ngay" → mở ShoreConfirmModal
         │  chọn: 1 tàu cụ thể (nodeId) hoặc "Tất cả tàu"
         │  xác nhận →  syncApi.forcePush(nodeId)  hoặc  syncApi.forcePushAll()
         │        ──► POST /api/sync/force-push/:nodeId   hoặc   POST /api/sync/force-push-all
         │  thành công → fetchData() lại ngay để phản ánh số liệu mới
```

Toàn bộ dữ liệu hiển thị đều là **Shore Outbox** (hàng đợi Shore gửi cho Edge) — trang này **không** hiển thị hàng đợi ngược lại Edge→Shore (SyncQueue phía Edge nằm trong `edge_product`, ngoài phạm vi Shore Frontend).

## Liên kết với phần khác

- **services/sync.service.ts** (`syncApi`): toàn bộ tầng gọi API — `getStatus`, `getHealth` (không dùng ở trang này dù có export), `forcePush`, `forcePushAll`, `reconcile` (có trong service nhưng **UI hiện không có nút gọi `reconcile`** — tính năng đã có ở tầng service nhưng chưa lộ ra giao diện).
- **README gốc, mục 5 (Sync Protocol) & mục 6 (Conflict Resolution)**: giải thích ý nghĩa nghiệp vụ của `SyncOutbox`, `SyncLog`, node tracker mà trang này hiển thị — đọc mục đó trước khi đọc code sẽ dễ hiểu hơn nhiều.
- **components/layout/TopNavLayout.tsx**: mục "Đồng bộ" trong menu chính trỏ tới `/sync`; chuông thông báo trong cùng layout cũng hiển thị một phần dữ liệu sync (qua `notificationApi`, khác `syncApi`).
- **Shore Backend**: endpoint thật nằm ở Controller Sync/SyncDashboard (ASP.NET Core, `shore_product/backend`) — không thuộc phạm vi tài liệu này nhưng là nơi cần xem nếu muốn hiểu logic `ConflictResolverService` phía sau `/api/sync/status`.

## Ghi chú khi đọc/dạy

- **Đây là ví dụ rõ nhất trong toàn bộ Shore Frontend về việc UI phản ánh trực tiếp kiến trúc Edge-Shore** đã mô tả ở README gốc — nếu dạy người mới về mô hình đồng bộ, nên demo trực tiếp trang này (đặc biệt là nút "Đồng bộ ngay" + `ShoreConfirmModal`) thay vì chỉ giải thích bằng sơ đồ.
- `syncApi` (xem `services/README.md`) là một trong các service **không gắn `Authorization` header** — nếu Backend sau này bắt buộc JWT cho các route `/api/sync/*`, trang này sẽ ngừng hoạt động cho tới khi service được cập nhật.
- Nhãn bảng dữ liệu tiếng Việt (`TABLE_TO_LABEL`) là danh sách **cứng, thủ công** trong file — nếu Backend thêm bảng mới có `ISyncableEntity` (theo README gốc mục 7.4), tên bảng đó sẽ hiển thị nguyên dạng tiếng Anh/snake_case cho tới khi ai đó cập nhật map này bằng tay.
- `syncInterval` (chu kỳ auto-refresh UI, 10-60s) là khái niệm **khác** với `SyncInterval` trong `appsettings.json` của Edge Backend (chu kỳ Edge thực sự đẩy dữ liệu, mặc định 30s theo README gốc mục 10.5) — đừng nhầm hai cấu hình lấy tên giống nhau nhưng ở hai tầng khác nhau (một cái là tần suất Shore UI tự hỏi lại API, một cái là tần suất Edge thực sự gửi dữ liệu).
