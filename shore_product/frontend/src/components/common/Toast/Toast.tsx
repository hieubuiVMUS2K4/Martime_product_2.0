import React from 'react';
import { Toaster, toast } from 'sonner';

/*
  Thông báo của phân hệ bờ chạy MỘT hệ duy nhất là sonner.

  Trước đây có ba hệ chạy song song (hộp tự viết ở file này, sonner ở PMS/Vật tư,
  react-toastify ở SMS), mỗi hệ một vị trí, một kiểu, một thời gian tắt. Giờ:
  - Code mới gọi thẳng `toast.success(tiêu đề, { description })` từ 'sonner'.
  - `useToast()` giữ lại để các trang cũ không phải sửa; nó chỉ chuyển tiếp sang sonner.
  - Không dùng `alert()` của trình duyệt: hộp đó chặn cả trang và không theo giao diện.
*/

interface ToastContextValue {
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const api: ToastContextValue = {
  success: (title, message) => toast.success(title, { description: message }),
  error: (title, message) => toast.error(title, { description: message, duration: 6000 }),
  warning: (title, message) => toast.warning(title, { description: message }),
  info: (title, message) => toast.info(title, { description: message }),
};

export const useToast = (): ToastContextValue => api;

/** Khung hiển thị thông báo, đặt một lần duy nhất ở gốc ứng dụng. */
export const AppToaster: React.FC = () => (
  <Toaster
    position="top-right"
    richColors
    closeButton
    expand
    visibleToasts={4}
    duration={4500}
    offset={16}
    containerAriaLabel="Thông báo hệ thống"
    toastOptions={{ closeButtonAriaLabel: 'Đóng thông báo' }}
  />
);
