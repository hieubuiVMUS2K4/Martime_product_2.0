import React from 'react';

/** Nút biểu tượng trong cột "Thao tác" của bảng (Sửa, Xóa, Xem...). Luôn có nhãn cho trình đọc màn hình. */
export const TableIconButton: React.FC<{
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
  variant?: 'default' | 'danger';
  disabled?: boolean;
}> = ({ label, onClick, icon, variant = 'default', disabled }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    title={label}
    className={`inline-flex h-7 w-7 items-center justify-center rounded border border-gray-300 bg-white transition-colors disabled:opacity-40 [&>svg]:h-[15px] [&>svg]:w-[15px] ${
      variant === 'danger'
        ? 'text-red-600 hover:border-red-300 hover:bg-red-50'
        : 'text-gray-600 hover:border-blue-500/40 hover:bg-blue-50 hover:text-blue-600'
    }`}
  >
    {icon}
  </button>
);

/** Khung xếp các nút thao tác trong một ô. */
export const TableActions: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex items-center justify-center gap-1">{children}</div>
);
