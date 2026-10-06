# contexts/ — Global State qua React Context API

## Mục đích

Shore Frontend **không dùng Zustand/Redux** (khác với Edge Frontend — xem README gốc, mục 9.2). Toàn bộ state toàn cục nằm trong 3 React Context, cộng thêm `@tanstack/react-query` (cấu hình ở `main.tsx` nhưng — xem ghi chú — hiện chưa có nơi nào gọi `useQuery`).

## Cấu trúc & vai trò

| File | Context / Hook | Vai trò |
|---|---|---|
| `AuthContext.tsx` | `AuthProvider`, `useAuth()` | Trạng thái đăng nhập: `user`, `isAuthenticated`, `isLoading`, `isLoggingIn`, `error`, `login()`, `logout()`, `clearError()`. Phục hồi phiên đăng nhập lúc mount bằng cách đọc `localStorage['authToken']` rồi gọi `authService.me()`. |
| `VesselContext.tsx` | `VesselProvider`, `useVessel()` | Danh sách tàu (`vessels`) + tàu đang chọn (`selectedVessel`/`selectedVesselId`/`selectedIMO`), lưu lựa chọn vào `localStorage['shore_selected_vessel']`. Tự fetch `GET /vessels` lúc mount. |
| `I18nContext.tsx` | `I18nProvider`, `useTranslation()`, `useTranslationSafe()` | Bộ dịch dựa trên `locales/vi.json`. Shore **chỉ hỗ trợ tiếng Việt** (type `Language = 'vi'` cố định — khác Edge có đa ngôn ngữ), context tồn tại chủ yếu để giữ API `t('key.path', params)` nhất quán và dễ mở rộng sau này. `useTranslationSafe()` không throw khi thiếu Provider (trả về key thô), dùng an toàn hơn trong component có thể render sớm. |

## Luồng hoạt động chính

Thứ tự lồng Provider trong `App.tsx` (từ ngoài vào trong):

```
BrowserRouter
 └─ AuthProvider          ← phải trong cùng, vì AppRoutes cần useAuth() để guard
     └─ I18nProvider
         └─ VesselProvider
             └─ ConfirmDialogProvider (components/common/ConfirmDialog)
                 └─ AppRoutes
                 └─ <AppToaster/>  (sonner — hệ thống thông báo duy nhất)
```

Component đọc state qua hook riêng, không đọc `Context` object trực tiếp:
```
useAuth()          // AuthContext
useVessel()        // VesselContext
useTranslation()   // I18nContext (throw nếu thiếu Provider)
useTranslationSafe() // I18nContext (an toàn, có fallback)
```

## Liên kết với phần khác

- **routes/AppRoutes.tsx**: `RequireAuth` dựa 100% vào `useAuth()`.
- **components/layout/UserMenu.tsx, TopNavLayout.tsx**: hiển thị tên/role người dùng và xử lý logout qua `useAuth()`.
- **services/auth.service.ts**: được `AuthContext` gọi (`login`, `me`); token do `AuthContext` ghi, do `services/api.client.ts` đọc lại.
- **pages/Materials/MaterialPage.tsx** (và một số trang PMS) dùng `useTranslationSafe()` cho vài nhãn — phần lớn UI còn lại vẫn hard-code tiếng Việt trực tiếp trong JSX, **không** đi qua `t()`.

## Ghi chú khi đọc/dạy

- **`VesselContext` gần như chưa có ai tiêu thụ.** Grep toàn repo cho thấy `useVessel()` chỉ xuất hiện trong chính file định nghĩa nó và được `Provider` bọc trong `App.tsx` — chưa có component nào gọi `useVessel()` để lấy `selectedVessel`/`selectVessel`. Đừng nhầm với hook **khác tên nhưng giống**: `useVessels()` (số nhiều, trong `hooks/useCrew.ts`) — đó là một cache module-level độc lập phục vụ dropdown chọn tàu khi gán crew, không liên quan gì đến `VesselContext`. Nhiều khả năng `VesselContext` được chuẩn bị cho một tính năng "chọn tàu toàn cục" chưa hoàn thiện.
- **`I18nContext` chỉ có 1 ngôn ngữ.** Đừng tốn công tìm cơ chế đổi ngôn ngữ (switcher) — không tồn tại ở Shore; khác hẳn Edge/Mobile (có tiếng Việt + tiếng Anh).
- **Thông báo chỉ có một hệ là sonner** (`<AppToaster/>` ở `App.tsx`). `useToast()` trong `components/common/Toast` chỉ chuyển tiếp sang sonner, giữ để trang cũ không phải sửa.
- Không có `ThemeContext`/dark-mode context nào ở Shore.
