import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface TablePaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  /** Bỏ trống thì không hiện ô chọn số dòng mỗi trang. */
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
  itemLabel?: string;
}

/** Thanh phân trang dùng chung cho mọi bảng. */
export const TablePagination: React.FC<TablePaginationProps> = ({
  page,
  pageSize,
  totalItems,
  onPageChange,
  pageSizeOptions,
  onPageSizeChange,
  itemLabel = 'kết quả',
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const first = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);
  const btn =
    'flex h-8 w-8 items-center justify-center rounded border border-line bg-surface text-ink hover:bg-primary-soft disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-grid px-3 py-2 text-[13px] text-ink-muted">
      <div className="flex items-center gap-3">
        <span>
          Hiển thị <strong className="text-ink">{first}</strong>–<strong className="text-ink">{last}</strong> trên{' '}
          <strong className="text-ink">{totalItems}</strong> {itemLabel}
        </span>
        {pageSizeOptions && onPageSizeChange && (
          <label className="flex items-center gap-1.5">
            <span>Mỗi trang</span>
            <select
              value={pageSize}
              onChange={e => onPageSizeChange(Number(e.target.value))}
              className="h-8 rounded border border-line bg-surface px-1.5 text-[13px] text-ink focus:border-accent focus:outline-none"
            >
              {pageSizeOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
      </div>
      <nav className="flex items-center gap-1" aria-label="Phân trang">
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPageChange(1)} aria-label="Trang đầu" title="Trang đầu">
          <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Trang trước" title="Trang trước">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="min-w-[64px] text-center" aria-current="page">
          <strong className="text-ink">{page}</strong> / {totalPages}
        </span>
        <button type="button" className={btn} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label="Trang sau" title="Trang sau">
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" className={btn} disabled={page >= totalPages} onClick={() => onPageChange(totalPages)} aria-label="Trang cuối" title="Trang cuối">
          <ChevronsRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </nav>
    </footer>
  );
};
