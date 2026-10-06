import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/*
  Hộp thoại dùng chung cho mọi màn thêm/sửa/xem chi tiết của phân hệ bờ.

  Lo sẵn những thứ mà các modal tự viết trước đây thường thiếu:
  - Esc để đóng, Tab chỉ đi vòng bên trong hộp, đóng xong trả focus về nút đã mở.
  - Khóa cuộn trang nền.
  - Nhiều hộp chồng nhau thì Esc chỉ đóng hộp trên cùng.
  - `busy`: đang lưu thì không cho đóng, tránh mất kết quả giữa chừng.
  - `closeOnBackdrop={false}` cho form dài: bấm trượt ra ngoài không mất dữ liệu đang nhập.

  Dùng:
    <Modal isOpen={open} onClose={close} title="Thêm cảng" icon={<Anchor />}
      footer={<><Button onClick={close}>Hủy</Button><Button variant="primary">Lưu</Button></>}>
      ...nội dung...
    </Modal>
*/

type Size = 'sm' | 'md' | 'lg' | 'xl' | 'full';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  /** Dòng mô tả nhỏ dưới tiêu đề. */
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  children: React.ReactNode;
  /** Thanh nút cố định ở đáy, không cuộn theo nội dung. */
  footer?: React.ReactNode;
  size?: Size;
  closeOnBackdrop?: boolean;
  /** Đang xử lý: khóa Esc, nút X và bấm nền. */
  busy?: boolean;
  /** Bỏ padding mặc định của thân hộp, khi nội dung tự lo bố cục (bảng tràn lề, tab...). */
  flush?: boolean;
  className?: string;
}

const SIZE: Record<Size, string> = {
  sm: 'max-w-[440px]',
  md: 'max-w-[600px]',
  lg: 'max-w-[800px]',
  xl: 'max-w-[1080px]',
  full: 'max-w-[min(1400px,96vw)]',
};

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Thứ tự các hộp đang mở; chỉ hộp cuối cùng nhận phím. */
const openStack: symbol[] = [];

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  children,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  busy = false,
  flush = false,
  className = '',
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const busyRef = useRef(busy);
  onCloseRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    if (!isOpen) return;
    const token = Symbol('modal');
    openStack.push(token);

    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    // Ưu tiên ô nhập đầu tiên (autoFocus nếu có), không thì chính hộp thoại.
    requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      if (!dialog || dialog.contains(document.activeElement)) return;
      const first = dialog.querySelector<HTMLElement>('[autofocus], input:not([type=hidden]):not([disabled]), select, textarea');
      (first ?? dialog).focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (openStack[openStack.length - 1] !== token) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busyRef.current) onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter(el => el.offsetParent !== null);
      if (items.length === 0) {
        event.preventDefault();
        dialogRef.current.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      openStack.splice(openStack.indexOf(token), 1);
      if (openStack.length === 0) document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-slate-900/45 p-4"
      onMouseDown={event => {
        if (closeOnBackdrop && !busy && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-lg bg-surface shadow-2xl outline-none ${SIZE[size]} ${className}`}
      >
        {title && (
          <header className="flex shrink-0 items-start gap-2.5 border-b border-line px-5 py-3.5">
            {icon && <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}</span>}
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-[15px] font-bold leading-6 text-ink">{title}</h2>
              {subtitle && <p className="mt-0.5 text-[13px] text-ink-muted">{subtitle}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              aria-label="Đóng hộp thoại"
              title="Đóng (Esc)"
              className="-mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-primary-soft hover:text-ink disabled:opacity-40"
            >
              <X className="h-[18px] w-[18px]" aria-hidden="true" />
            </button>
          </header>
        )}

        <div className={`min-h-0 flex-1 overflow-y-auto ${flush ? '' : 'px-5 py-4'}`}>{children}</div>

        {footer && (
          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-line bg-canvas/60 px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
};

/* Các khối con giữ lại cho trang cũ dựng hộp thoại theo kiểu tự xếp. */
export const ModalHeader: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="border-b border-line px-5 py-3.5">{children}</div>
);

export const ModalBody: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="px-5 py-4">{children}</div>
);

export const ModalFooter: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{children}</div>
);
