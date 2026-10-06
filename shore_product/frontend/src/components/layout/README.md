# components/layout/ — Khung giao diện

## Mục đích

Chứa khung bao ngoài (nav + `<Outlet/>`) cho toàn bộ trang sau đăng nhập. Thư mục có **hai bộ layout** — chỉ một bộ đang thực sự chạy.

## Cấu trúc & vai trò

| File / thư mục | Export | Đang được `routes/AppRoutes.tsx` dùng? | Vai trò |
|---|---|---|---|
| `TopNavLayout/TopNavLayout.tsx` | `TopNavLayout` | ✅ **Có** — bọc toàn bộ route sau `RequireAuth` | Thanh điều hướng **ngang**, cố định trên cùng: logo "Maritime", các link/dropdown (Danh mục, Danh sách tàu, Tracking, Thông tin [Onboarding/Xác minh/Tuân thủ/Phân công/Tuyển ngoài/Di chuyển/Onboard], Báo cáo, Đồng bộ), chuông thông báo (gộp 2 nguồn: `crewApi.holdNotifications()` — thuyền viên bị tạm giữ, và `notificationApi.getRecent()` — thông báo sync), `UserMenu`, menu mobile responsive. Tự poll thông báo mỗi 30 giây. |
| `UserMenu.tsx` | `UserMenu` | ✅ Có (bên trong `TopNavLayout`) | Avatar chữ cái đầu tên user + dropdown (portal ra `document.body`) hiển thị tên/role, nút Hồ sơ (chưa nối chức năng), nút Đăng xuất (`useAuth().logout()` rồi `navigate('/login')`). |


## Luồng hoạt động chính

```
routes/AppRoutes.tsx
  <Route element={<TopNavLayout/>}>      ← layout thật, tất cả route nghiệp vụ nằm trong này
    <Route path="/report" .../>
    ...
  </Route>

TopNavLayout.tsx
  useEffect: poll mỗi 30s → crewApi.holdNotifications() + notificationApi.getRecent(30)
  render: <header class="topnav">...</header> + <main><Outlet/></main>
```


## Liên kết với phần khác

- **contexts/AuthContext**: `UserMenu` đọc `user`/`logout()`.
- **services/crew.service.ts** (`crewApi.holdNotifications`) và **services/notification.service.ts** (`notificationApi.getRecent`, `markAllRead`): nguồn dữ liệu chuông thông báo trong `TopNavLayout`.
- **routes/AppRoutes.tsx**: nơi duy nhất quyết định layout nào bọc route nào.

## Ghi chú khi đọc/dạy

- Route `path="/vessels/tracking"` trong `TopNavLayout` được đặt **phía trên** `path="/vessels/:id"` trong `AppRoutes.tsx` — thứ tự này bắt buộc, nếu đảo ngược `react-router` sẽ khớp `:id = "tracking"` trước.
