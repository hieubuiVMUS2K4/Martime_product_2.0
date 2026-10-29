import { translateMessage as tx, useMessageLocale } from '@/i18n/messages'
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
  itemLabel = tx(totalItems === 1 ? "pmsRework.result" : "pmsRework.results"),
}) => {
  useMessageLocale()

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const first = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, totalItems);
  const btn =
    'flex h-8 w-8 items-center justify-center rounded border border-gray-300 bg-white text-gray-900 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#a3b1bc] px-3 py-2 text-xs text-gray-600">
      <div className="flex items-center gap-3">
        <span>{tx("pmsRework.showing")}<strong className="text-gray-900">{first}</strong>–<strong className="text-gray-900">{last}</strong>{" " + tx("pmsRework.of")}{' '}
          <strong className="text-gray-900">{totalItems}</strong> {itemLabel}
        </span>
        {pageSizeOptions && onPageSizeChange && (
          <label className="flex items-center gap-1.5">
            <span>{tx("pmsRework.perPage")}</span>
            <select
              value={pageSize}
              onChange={e => onPageSizeChange(Number(e.target.value))}
              className="h-8 rounded border border-gray-300 bg-white px-1.5 text-xs text-gray-900 focus:border-blue-500 focus:outline-none"
            >
              {pageSizeOptions.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        )}
      </div>
      <nav className="flex items-center gap-1" aria-label={tx("pmsRework.pagination")}>
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPageChange(1)} aria-label={tx("pmsRework.firstPage")} title={tx("pmsRework.firstPage")}>
          <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" className={btn} disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label={tx("pmsRework.previousPage")} title={tx("pmsRework.previousPage")}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="min-w-[64px] text-center" aria-current="page">
          <strong className="text-gray-900">{page}</strong> / {totalPages}
        </span>
        <button type="button" className={btn} disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} aria-label={tx("pmsRework.nextPage")} title={tx("pmsRework.nextPage")}>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" className={btn} disabled={page >= totalPages} onClick={() => onPageChange(totalPages)} aria-label={tx("pmsRework.lastPage")} title={tx("pmsRework.lastPage")}>
          <ChevronsRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </nav>
    </footer>
  );
};
