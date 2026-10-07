# components/common/ — Bộ giao diện dùng chung của phân hệ bờ

Mọi trang của shore dùng chung các khối trong thư mục này thay vì tự viết lại nút, ô nhập, hộp thoại, thông báo. Màu lấy từ token trong `styles/variables.css` (qua Tailwind: `bg-primary`, `text-ink`, `border-line`...), **không** viết cứng mã màu hay dùng `blue-600`.

## Các khối

| Thư mục | Export | Dùng khi |
|---|---|---|
| `Button/` | `Button` (`variant`: primary/secondary/danger/ghost, `size`: sm/md/lg, `loading`, `icon`), `buttonClass()` | Mọi nút bấm. `buttonClass()` cho thẻ `<a>`/`<Link>` cần trông như nút. |
| `Input/` | `Field`, `Input`, `Select`, `Textarea`, `fieldClass` | Ô nhập có nhãn/gợi ý/lỗi. `Field` bọc ô tự viết (combobox...) để nhãn và lỗi giống hệt ô chuẩn. |
| `Modal/` | `Modal` (`title`, `subtitle`, `icon`, `footer`, `size`: sm/md/lg/xl/full, `busy`, `closeOnBackdrop`, `flush`) | Mọi hộp thoại thêm/sửa/xem. Lo sẵn Esc, giữ focus trong hộp, trả focus khi đóng, khóa cuộn nền, hộp chồng hộp. Form dài đặt `closeOnBackdrop={false}`; đang lưu đặt `busy`. |
| `ConfirmDialog/` | `useConfirm()` → `ask(message, opts?) => Promise<boolean>`; `useConfirmDialog()` → `confirm(options)` | Thay cho `window.confirm`. Câu hỏi có chữ "xóa" tự thành hộp đỏ, nút "Xóa". Cần ô nhập lý do thì dùng `confirm({ withInput: true, ... })`. |
| `Toast/` | `AppToaster` (đặt một lần ở `App.tsx`), `useToast()` | Thông báo. Code mới gọi thẳng `toast.success(tiêu đề, { description })` từ `'sonner'`; `useToast()` giữ cho trang cũ. |
| `StatusBadge/` | `StatusBadge` | Hiện chỉ nhận `WorkStatus`. |

Ngoài ra (import theo đường dẫn file, không qua `index.ts`): `ProtectedImage`, `ImageViewerModal`, `PortSelect`, `PortCombobox`.

## Quy ước

- **Không** dùng `alert()`/`confirm()`/`prompt()` của trình duyệt: lỗi → `toast.error`, thiếu dữ liệu → `toast.warning` hoặc lỗi ngay dưới ô nhập, hỏi lại → `useConfirm()`.
- Lỗi kiểm tra dữ liệu của form hiện **trong** hộp thoại (prop `error` của ô), không bắn toast.
- Mỗi vùng (trang, hộp thoại) chỉ có **một** nút `primary`.
- Thông báo thành công nêu rõ việc và đối tượng: `toast.success('Đã xóa cảng', { description: 'VNSGN — Sài Gòn' })`.
