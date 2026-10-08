import React from 'react';

export interface QuickFilter<K extends string> {
  key: K;
  label: string;
  count?: number;
  icon?: React.ReactNode;
  /** Màu biểu tượng, ví dụ 'text-emerald-600'. */
  tone?: string;
  disabled?: boolean;
}

/**
 * Hàng thẻ đếm nhanh phía trên bảng ("Tổng 120 · Trên tàu 80 · Bờ 40"), bấm để lọc.
 * Dùng cho phân loại chính của trang; lọc chi tiết vẫn làm ở nút lọc của từng cột.
 */
export function QuickFilterBar<K extends string>({ items, active, onChange }: {
  items: QuickFilter<K>[];
  active: K;
  onChange: (key: K) => void;
}) {
  return (
    <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Lọc nhanh">
      {items.map(item => {
        const on = item.key === active;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={on}
            disabled={item.disabled}
            onClick={() => onChange(item.key)}
            className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs transition-colors disabled:cursor-default disabled:opacity-60 ${
              on ? 'border-blue-600 bg-blue-50 text-blue-600' : 'border-gray-300 bg-white text-gray-600 hover:bg-blue-50'
            }`}
          >
            {item.icon && <span className={`[&>svg]:h-4 [&>svg]:w-4 ${on ? 'text-blue-600' : item.tone ?? ''}`}>{item.icon}</span>}
            {item.count !== undefined && <strong className={`text-sm tabular-nums ${on ? 'text-blue-600' : 'text-gray-900'}`}>{item.count}</strong>}
            <span className={on ? 'font-semibold' : ''}>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
