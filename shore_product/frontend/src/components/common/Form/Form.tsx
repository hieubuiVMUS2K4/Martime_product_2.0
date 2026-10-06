import React from 'react';
import { AlertCircle } from 'lucide-react';

/*
  Khối dựng form trong hộp thoại, để mọi form thêm/sửa có cùng cách chia nhóm và báo lỗi.
*/

interface FormSectionProps {
  title: React.ReactNode;
  /** Số cột của lưới trường bên trong (mặc định 2; 1 cho trường dài như mô tả). */
  columns?: 1 | 2 | 3;
  children: React.ReactNode;
}

const GRID: Record<1 | 2 | 3, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-3',
};

/** Một nhóm trường có tiêu đề, ví dụ "Thông tin kho", "Liên hệ quản lý". */
export const FormSection: React.FC<FormSectionProps> = ({ title, columns = 2, children }) => (
  <section className="rounded-md border border-line">
    <h3 className="rounded-t-md border-b border-line bg-primary-soft px-3 py-2 text-[13px] font-semibold text-primary">
      {title}
    </h3>
    <div className={`grid gap-x-4 gap-y-3 p-4 ${GRID[columns]}`}>{children}</div>
  </section>
);

/** Hộp báo lỗi của cả form (lỗi từ máy chủ, lỗi không gắn với ô nào). */
export const FormAlert: React.FC<{ children?: React.ReactNode }> = ({ children }) =>
  children ? (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-red-700">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  ) : null;
