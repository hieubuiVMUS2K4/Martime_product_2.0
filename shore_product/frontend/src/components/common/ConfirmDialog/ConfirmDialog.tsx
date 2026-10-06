import React, { createContext, useContext, useState, useCallback, useRef, useEffect, useId } from 'react';
import { AlertTriangle, HelpCircle, Trash2, Info } from 'lucide-react';

/*
  Hộp xác nhận dùng chung, thay cho window.confirm() của trình duyệt.

  Gọi kiểu promise nên thay được ngay tại chỗ, không phải tách state:
    const { confirm } = useConfirmDialog();
    if (!(await confirm({ title: 'Xóa cảng?', message: '...', variant: 'danger' })).confirmed) return;

  Bàn phím: Esc = Hủy, Enter = Xác nhận (trừ khi đang gõ trong ô lý do), Tab chỉ đi
  vòng trong hộp. Đóng xong trả focus về nút đã mở hộp.
*/

type DialogVariant = 'danger' | 'warning' | 'info' | 'default';

interface DialogOptions {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  /** Tên cũ của confirmLabel, giữ để các trang cũ không phải sửa. */
  confirmText?: string;
  cancelLabel?: string;
  variant?: DialogVariant;
  /** If true, show a text input for the user to provide a reason */
  withInput?: boolean;
  showInput?: boolean;
  inputLabel?: string;
  inputPlaceholder?: string;
  inputRequired?: boolean;
}

interface DialogResult {
  confirmed: boolean;
  inputValue?: string;
}

interface ConfirmDialogContextValue {
  confirm: (options: DialogOptions) => Promise<DialogResult>;
}

const ConfirmDialogContext = createContext<ConfirmDialogContextValue | null>(null);

export const useConfirmDialog = (): ConfirmDialogContextValue => {
  const ctx = useContext(ConfirmDialogContext);
  if (!ctx) throw new Error('useConfirmDialog must be used within ConfirmDialogProvider');
  return ctx;
};

interface QuickConfirmOptions {
  title?: string;
  confirmLabel?: string;
  variant?: DialogVariant;
}

/**
 * Bản rút gọn cho trường hợp chỉ cần hỏi có/không, thay thẳng cho window.confirm:
 *   const ask = useConfirm();
 *   if (!(await ask(`Xóa cảng "${p.portName}"?`))) return;
 * Câu hỏi có chữ "xóa" thì tự thành hộp cảnh báo đỏ với nút "Xóa".
 */
export const useConfirm = () => {
  const { confirm } = useConfirmDialog();
  return useCallback(async (message: React.ReactNode, options: QuickConfirmOptions = {}) => {
    const isDelete = typeof message === 'string' && /xóa|xoá/i.test(message);
    const variant = options.variant ?? (isDelete ? 'danger' : 'default');
    const result = await confirm({
      title: options.title ?? (variant === 'danger' ? 'Xác nhận xóa' : 'Xác nhận'),
      message,
      variant,
      confirmLabel: options.confirmLabel ?? (variant === 'danger' ? 'Xóa' : 'Đồng ý'),
    });
    return result.confirmed;
  }, [confirm]);
};

const ICONS: Record<DialogVariant, React.ReactNode> = {
  danger: <Trash2 size={22} />,
  warning: <AlertTriangle size={22} />,
  info: <Info size={22} />,
  default: <HelpCircle size={22} />,
};

const ICON_TONE: Record<DialogVariant, string> = {
  danger: 'bg-danger-soft text-danger',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-info-soft text-info',
  default: 'bg-accent-soft text-accent',
};

const CONFIRM_TONE: Record<DialogVariant, string> = {
  danger: 'bg-red-600 hover:bg-red-700',
  warning: 'bg-amber-600 hover:bg-amber-700',
  info: 'bg-primary hover:bg-primary-hover',
  default: 'bg-primary hover:bg-primary-hover',
};

const FOCUSABLE = 'textarea, button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])';

export const ConfirmDialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dialog, setDialog] = useState<DialogOptions | null>(null);
  const [inputValue, setInputValue] = useState('');
  const resolverRef = useRef<((result: DialogResult) => void) | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const titleId = useId();
  const messageId = useId();

  const confirm = useCallback((options: DialogOptions): Promise<DialogResult> => {
    setDialog(options);
    setInputValue('');
    return new Promise<DialogResult>(resolve => {
      resolverRef.current = resolve;
    });
  }, []);

  const shouldShowInput = !!(dialog?.withInput || dialog?.showInput);
  const inputMissing = shouldShowInput && !!dialog?.inputRequired && !inputValue.trim();

  const close = useCallback((result: DialogResult) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setDialog(null);
  }, []);

  const handleConfirm = useCallback(() => {
    if (inputMissing) return;
    close({ confirmed: true, inputValue: inputValue.trim() || undefined });
  }, [close, inputMissing, inputValue]);

  const handleCancel = useCallback(() => close({ confirmed: false }), [close]);

  // Mở hộp: khóa cuộn nền, đặt focus. Việc xóa thì focus vào Hủy để lỡ tay Enter
  // không xóa mất; cần nhập lý do thì focus vào ô nhập.
  useEffect(() => {
    if (!dialog) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => (inputRef.current ?? cancelRef.current)?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        handleCancel();
        return;
      }
      if (event.key === 'Enter' && !(event.target instanceof HTMLTextAreaElement)
          && !(event.target instanceof HTMLButtonElement)) {
        event.preventDefault();
        handleConfirm();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
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
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [dialog, handleCancel, handleConfirm]);

  const variant = dialog?.variant || 'default';

  return (
    <ConfirmDialogContext.Provider value={{ confirm }}>
      {children}
      {dialog && (
        <div
          className="fixed inset-0 z-modal flex items-center justify-center bg-slate-900/45 backdrop-blur-[2px] p-4"
          onMouseDown={e => { if (e.target === e.currentTarget) handleCancel(); }}
        >
          <div
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={messageId}
            className="w-full max-w-[440px] rounded-xl bg-surface px-6 pb-5 pt-7 text-center shadow-xl"
          >
            <div className={`mx-auto mb-3.5 flex h-12 w-12 items-center justify-center rounded-full ${ICON_TONE[variant]}`}>
              {ICONS[variant]}
            </div>
            <h3 id={titleId} className="mb-2 text-lg font-semibold text-ink">{dialog.title}</h3>
            <div id={messageId} className="whitespace-pre-line text-sm leading-relaxed text-ink-muted">
              {dialog.message}
            </div>

            {shouldShowInput && (
              <div className="mt-4 text-left">
                {dialog.inputLabel && (
                  <label className="mb-1.5 block text-sm font-medium text-ink">
                    {dialog.inputLabel}
                    {dialog.inputRequired && <span className="text-danger"> *</span>}
                  </label>
                )}
                <textarea
                  ref={inputRef}
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  placeholder={dialog.inputPlaceholder || ''}
                  rows={3}
                />
              </div>
            )}

            <div className="mt-6 flex justify-center gap-2.5">
              <button
                ref={cancelRef}
                type="button"
                className="min-w-[96px] rounded-lg border border-line bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-primary-soft"
                onClick={handleCancel}
              >
                {dialog.cancelLabel || 'Hủy'}
              </button>
              <button
                type="button"
                className={`min-w-[96px] rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${CONFIRM_TONE[variant]}`}
                onClick={handleConfirm}
                disabled={inputMissing}
              >
                {dialog.confirmLabel || dialog.confirmText || 'Xác nhận'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmDialogContext.Provider>
  );
};
