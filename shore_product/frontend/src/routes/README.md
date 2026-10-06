# routes/ — Định tuyến & Auth Guard

## Mục đích

Khai báo toàn bộ cây route của Shore Dashboard bằng `react-router-dom` v7, và chặn truy cập các trang cần đăng nhập.

## Cấu trúc & vai trò

| File | Vai trò |
|---|---|
| `AppRoutes.tsx` | **File thật sự chứa route.** Định nghĩa `RequireAuth` (auth guard) và toàn bộ `<Routes>`/`<Route>`. Được `App.tsx` render trực tiếp: `<AppRoutes />`. |
| `index.ts` | **File rỗng.** Không phải barrel re-export như thường lệ — đây là stub chưa dùng. Import route phải trỏ thẳng `'./routes/AppRoutes'`, không phải `'./routes'`. |

## Luồng hoạt động chính

```
App.tsx
  <BrowserRouter>
    <AuthProvider> ...  <AppRoutes />  ... </AuthProvider>
  </BrowserRouter>

AppRoutes.tsx
  <Routes>
    <Route path="/login" element={<LoginPage/>} />        ← route public duy nhất

    <Route element={<RequireAuth/>}>                        ← guard: nếu !isAuthenticated → <Navigate to="/login"/>
      <Route path="/" element={<Navigate to="/report"/>} /> ← trang chủ = báo cáo, KHÔNG PHẢI Dashboard/
      <Route element={<TopNavLayout/>}>                     ← layout thật (top nav + <Outlet/>)
        <Route path="/report" .../>
        <Route path="/crew" .../>
        <Route path="/vessels" .../>
        ... (~30 route con)
      </Route>
    </Route>

    <Route path="*" element={<div>404</div>} />
  </Routes>
```

`RequireAuth` là một component nội bộ (không export) dùng `useAuth()` từ `contexts/AuthContext`:
- `isLoading` → render màn hình chờ tối giản (không dùng `common/Card` gì cả, style inline).
- `!isAuthenticated` → `<Navigate to="/login" state={{ from: location }} replace />`.
- Ngược lại → `<Outlet/>` cho phép route con render.

Tất cả route "sau đăng nhập" đều lồng trong `<Route element={<TopNavLayout/>}>` — nghĩa là **mọi trang nghiệp vụ đều có thanh điều hướng ngang cố định**, không có route nào thoát ra ngoài layout này (trừ `/login`).

## Danh sách route → trang (tham chiếu nhanh)

| Path | Page | Ghi chú |
|---|---|---|
| `/login` | `Auth/LoginPage` | Public |
| `/` | *(redirect)* | → `/report` |
| `/report`, `/report/:reportId`, `/report/vessel/:vesselId` | `Report/*` | Trang chủ thật sự |
| `/categories` | `CategoryManagement/CategoryManagementPage` | Tab crew/certificate-types |
| `/crew`, `/crew/:id`, `/vessels/:vesselId/crew/:id` | `CrewManagement/CrewListPage`, `CrewDetailPage` | |
| `/certificates` | `CrewManagement/CertificateMonitorPage` | |
| `/sync` | `SyncManagement/SyncDashboardPage` | |
| `/work-assignments` | `WorkAssignment/WorkAssignmentPage` | ⚠️ dữ liệu mock |
| `/vessels`, `/vessels/tracking`, `/vessels/:id` | `VesselManagement/*` | |
| `/pms/master-schedule`, `/pms/assets`, `/pms/work-planning`, `/pms/work-report/:id` | `PMS/*` | |
| `/onboarding`, `/onboarding/:caseId` | `OnboardingManagement/*` | Case tuyển dụng |
| `/onboard-events` | `OnboardManagement/OnboardDashboardPage` | Sự kiện lên/xuống tàu vật lý |
| `/verification-queue` | `DocumentWorkflow/VerificationQueuePage` | |
| `/compliance`, `/compliance/rule-sets`, `/compliance/evaluate/:crewId` | `ComplianceManagement/*` | |
| `/assignments`, `/assignments/:id`, `/assignments/planning/:vesselId` | `AssignmentManagement/*` | |
| `/external-requests`, `/external-requests/:id` | `ExternalRequestManagement/*` | |
| `/travel`, `/travel/:id` | `TravelManagement/*` | |
| `/materials`, `/materials/store-locations`, `/materials/requests`, `/materials/receipts`, `/materials/inventory` | `Materials/*` | |
| `/voyages`, `/voyages/new`, `/voyages/:id/edit`, `/voyages/:id` | `VoyageManagement/*` | |

## Liên kết với phần khác

- **contexts/AuthContext**: nguồn của `isAuthenticated`/`isLoading` dùng trong `RequireAuth`.
- **components/layout/TopNavLayout**: layout bao toàn bộ route đã đăng nhập; menu điều hướng khai báo *độc lập* trong chính `TopNavLayout.tsx`, không đọc từ file route này — nếu thêm route mới, phải tự tay thêm cả `<Route>` ở đây **và** mục menu trong `TopNavLayout` (hai nơi tách biệt, dễ quên một bên).
- **pages/**: mọi page module export qua `index.ts` của từng thư mục rồi được import vào đây.

## Ghi chú khi đọc/dạy

- `routes/index.tsx` **rỗng** — nếu bạn quen mẫu "index.ts barrel" ở các thư mục khác, đừng tìm route ở đây; toàn bộ nằm trong `AppRoutes.tsx`.
- Không có khái niệm route theo role/permission (không có `<Route roles={...}>`); `RequireAuth` chỉ kiểm tra đã đăng nhập hay chưa, chưa phân quyền theo `user.role` ở tầng route (phân quyền UI, nếu có, phải tự kiểm tra bên trong từng page).
