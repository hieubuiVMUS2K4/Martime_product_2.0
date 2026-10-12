import React from 'react';
import { Loader2 } from 'lucide-react';

/*
  Nút bấm dùng chung. Mọi nút mới dùng component này thay vì tự viết class,
  để cả phân hệ chỉ có một kiểu nút chính, một kiểu nút phụ, một kiểu nút xóa.

  - primary: hành động chính của màn/hộp thoại (Lưu, Thêm mới). Mỗi vùng chỉ một nút.
  - secondary: hành động phụ (Hủy, Xuất Excel, Import).
  - danger: hành động phá dữ liệu (Xóa).
  - ghost: nút chìm trong thanh công cụ, bảng.
*/

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  fullWidth?: boolean;
  /** Đang xử lý: hiện vòng quay và khóa nút để không bấm hai lần. */
  loading?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover border border-primary',
  secondary: 'bg-surface text-ink border border-line hover:bg-primary-soft hover:border-accent/40',
  danger: 'bg-red-600 text-white border border-red-600 hover:bg-red-700',
  ghost: 'bg-transparent text-ink-muted border border-transparent hover:bg-primary-soft hover:text-ink',
};

const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-[0.9375rem] gap-2',
};

export const buttonClass = (variant: Variant = 'secondary', size: Size = 'md', extra = '') =>
  [
    'inline-flex items-center justify-center rounded-md font-medium whitespace-nowrap transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-55',
    VARIANT[variant],
    SIZE[size],
    extra,
  ].filter(Boolean).join(' ');

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  loading = false,
  icon,
  className = '',
  type = 'button',
  disabled,
  children,
  ...props
}, ref) => (
  <button
    ref={ref}
    type={type}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    className={buttonClass(variant, size, `${fullWidth ? 'w-full' : ''} ${className}`)}
    {...props}
  >
    {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : icon}
    {children}
  </button>
));

Button.displayName = 'Button';
