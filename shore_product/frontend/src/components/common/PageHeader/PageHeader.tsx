import React from 'react';

/** Tiêu đề trang/mục: một dòng tên, một dòng mô tả ngắn, nút riêng của trang (nếu có) bên phải. */
export const PageHeader: React.FC<{
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}> = ({ title, description, icon, actions }) => (
  <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
    <div className="flex items-start gap-2.5">
      {icon && <span className="mt-0.5 text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}</span>}
      <div>
        <h1 className="text-lg font-bold leading-7 text-ink">{title}</h1>
        {description && <p className="text-[13px] text-ink-muted">{description}</p>}
      </div>
    </div>
    {actions && <div className="flex items-center gap-2">{actions}</div>}
  </header>
);
