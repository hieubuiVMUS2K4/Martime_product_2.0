# lib/ — Tiện ích không thuộc nghiệp vụ

| File | Nội dung |
|---|---|
| `draftsDb.ts` | Lưu bản nháp biểu mẫu vào IndexedDB (Dexie) để không mất khi tải lại trang. |
| `printUtils.ts` | Mở cửa sổ in cho tài liệu SMS. Bị trình chặn pop-up chặn thì báo bằng toast. |

Bộ shadcn/ui (`components/ui/`, `cn()` trong `lib/utils.ts`) đã bỏ: không trang nào dùng. Component giao diện dùng chung nằm ở `components/common/` (xem README ở đó).
