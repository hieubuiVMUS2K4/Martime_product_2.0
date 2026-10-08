import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownAZ, ArrowDownZA, ListFilter, Search, X } from 'lucide-react';
import { foldVietnamese } from '@/utils/text';

/*
  Menu lọc của một cột, kiểu bộ lọc của Excel: bấm nút ở góc tiêu đề cột là mở.

  - Sắp xếp tăng/giảm ngay trong menu.
  - Danh sách giá trị đang có của cột, tích chọn để lọc. Danh sách này chỉ gồm giá trị
    còn thấy sau khi đã lọc các cột khác (đang lọc tàu A thì cột chức danh chỉ liệt kê
    chức danh có trên tàu A).
  - Ô tìm trong danh sách, gõ không dấu vẫn ra ("thuyen truong" → "Thuyền trưởng").
  - Lọc nhanh theo nhóm (ví dụ "Sắp hết hạn") do trang khai báo.
  - Chọn tất cả = bỏ lọc, để dấu "đang lọc" không bật oan.
*/

export type SortDirection = 'asc' | 'desc';

interface ColumnFilterMenuProps {
  label: string;
  values: string[];
  /** null = chưa lọc. */
  selected: string[] | null;
  quickFilters?: { label: string; values: string[] }[];
  sortDirection: SortDirection | null;
  /** false với cột không sắp xếp được. */
  sortable?: boolean;
  onApply: (selected: string[] | null) => void;
  onSort: (direction: SortDirection | null) => void;
}

const PANEL_WIDTH = 280;
const GAP = 4;

export const ColumnFilterMenu: React.FC<ColumnFilterMenuProps> = ({
  label,
  values,
  selected,
  quickFilters,
  sortDirection,
  sortable = true,
  onApply,
  onSort,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  /** Bản nháp, chỉ ghi vào bộ lọc thật khi bấm Áp dụng. */
  const [draft, setDraft] = useState<string[]>(values);
  const [style, setStyle] = useState<React.CSSProperties>({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const isFiltered = selected !== null;

  const show = () => {
    setDraft(selected ?? values);
    setSearch('');
    setOpen(true);
  };

  const matching = (keyword: string) => values.filter(v => foldVietnamese(v).includes(keyword));

  /* Gõ tìm là chọn lại đúng các giá trị khớp, như Excel. Nếu chỉ ẩn dòng mà giữ bản nháp
     thì giá trị bị ẩn vẫn đang được chọn, bấm Áp dụng thành "chọn hết" — sai ý người dùng. */
  const changeSearch = (next: string) => {
    setSearch(next);
    const keyword = foldVietnamese(next);
    setDraft(keyword ? matching(keyword) : (selected ?? values));
  };

  // Khung neo theo tọa độ màn hình, vì bảng nằm trong vùng cuộn ngang sẽ cắt mất khung.
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const pad = 8;
    const below = window.innerHeight - rect.bottom - GAP - pad;
    const above = rect.top - GAP - pad;
    const openAbove = below < 320 && above > below;
    setStyle({
      top: openAbove ? rect.top - GAP : rect.bottom + GAP,
      left: Math.max(pad, Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - pad)),
      maxHeight: Math.min(460, Math.max(0, openAbove ? above : below)),
      transform: openAbove ? 'translateY(-100%)' : undefined,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); buttonRef.current?.focus(); }
    };
    // Cuộn trang thì khung lệch khỏi nút nên đóng; cuộn bên trong khung thì không.
    const onScroll = (e: Event) => {
      const t = e.target as Node | null;
      if (t && panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const visible = useMemo(() => {
    const keyword = foldVietnamese(search);
    return keyword ? values.filter(v => foldVietnamese(v).includes(keyword)) : values;
  }, [values, search]);

  const checkedCount = visible.filter(v => draft.includes(v)).length;
  const allChecked = visible.length > 0 && checkedCount === visible.length;
  const someChecked = checkedCount > 0 && !allChecked;

  const toggle = (value: string) =>
    setDraft(prev => (prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]));

  const toggleAll = () =>
    setDraft(prev => (allChecked ? prev.filter(v => !visible.includes(v)) : [...new Set([...prev, ...visible])]));

  const apply = (next: string[]) => {
    onApply(values.every(v => next.includes(v)) ? null : next);
    setOpen(false);
  };

  const itemClass =
    'flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-gray-900 hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        onClick={() => (open ? setOpen(false) : show())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Lọc và sắp xếp cột ${label}${isFiltered ? ' (đang lọc)' : ''}`}
        title={isFiltered ? `Đang lọc cột ${label}` : `Lọc và sắp xếp cột ${label}`}
        className={`absolute right-1 top-1 flex h-[18px] w-[18px] items-center justify-center rounded-sm border transition-colors ${
          isFiltered
            ? 'border-blue-600 bg-blue-600 text-white'
            : 'border-[#a3b1bc] bg-white text-gray-600 hover:border-blue-600 hover:text-blue-600'
        }`}
      >
        {isFiltered
          ? <ListFilter className="h-3 w-3" aria-hidden="true" />
          : <span aria-hidden="true" className="mt-0.5 border-x-[4px] border-t-[5px] border-x-transparent border-t-current" />}
      </button>

      {open && createPortal(
        <div
          ref={panelRef}
          role="dialog"
          aria-label={`Bộ lọc cột ${label}`}
          style={{ ...style, width: PANEL_WIDTH }}
          className="fixed z-[1350] flex flex-col overflow-hidden rounded-md border border-gray-300 bg-white p-1.5 text-left font-normal normal-case tracking-normal shadow-xl"
        >
          {sortable && (
            <>
              <button type="button" className={`${itemClass} ${sortDirection === 'asc' ? 'font-semibold text-blue-600' : ''}`}
                onClick={() => { onSort(sortDirection === 'asc' ? null : 'asc'); setOpen(false); }}>
                <ArrowDownAZ className="h-4 w-4" aria-hidden="true" /> Sắp xếp tăng dần (A → Z)
              </button>
              <button type="button" className={`${itemClass} ${sortDirection === 'desc' ? 'font-semibold text-blue-600' : ''}`}
                onClick={() => { onSort(sortDirection === 'desc' ? null : 'desc'); setOpen(false); }}>
                <ArrowDownZA className="h-4 w-4" aria-hidden="true" /> Sắp xếp giảm dần (Z → A)
              </button>
              <div className="my-1 border-t border-gray-300" />
            </>
          )}

          {isFiltered && (
            <button type="button" className={`${itemClass} text-red-700`} onClick={() => apply(values)}>
              <X className="h-4 w-4" aria-hidden="true" /> Bỏ lọc cột này
            </button>
          )}

          {quickFilters?.map(q => (
            <button key={q.label} type="button" className={itemClass} disabled={q.values.length === 0}
              onClick={() => apply(q.values)}>
              <ListFilter className="h-4 w-4" aria-hidden="true" /> {q.label}
            </button>
          ))}
          {(isFiltered || (quickFilters && quickFilters.length > 0)) && <div className="my-1 border-t border-gray-300" />}

          <label className="relative mb-1 block">
            <span className="sr-only">Tìm giá trị trong cột {label}</span>
            <input
              type="text"
              autoFocus
              value={search}
              placeholder="Tìm giá trị..."
              onChange={e => changeSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && draft.length > 0) apply(draft); }}
              className="h-8 w-full rounded border border-gray-300 pl-2 pr-7 text-xs text-gray-900 focus:border-blue-500 focus:outline-none"
            />
            <Search className="pointer-events-none absolute right-2 top-2 h-4 w-4 text-gray-400" aria-hidden="true" />
          </label>

          <div role="group" aria-label="Giá trị của cột" className="min-h-[80px] flex-1 overflow-y-auto rounded border border-gray-300 py-1">
            {visible.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-gray-600">Không có giá trị nào khớp.</p>
            ) : (
              <>
                <label className="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs font-medium text-gray-900 hover:bg-blue-50">
                  <input type="checkbox" className="h-3.5 w-3.5 accent-blue-600" checked={allChecked}
                    ref={node => { if (node) node.indeterminate = someChecked; }} onChange={toggleAll} />
                  (Chọn tất cả)
                </label>
                {visible.map(value => (
                  <label key={value} className="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs text-gray-900 hover:bg-blue-50">
                    <input type="checkbox" className="h-3.5 w-3.5 shrink-0 accent-blue-600" checked={draft.includes(value)}
                      onChange={() => toggle(value)} />
                    <span className="truncate" title={value}>{value === '' ? '(trống)' : value}</span>
                  </label>
                ))}
              </>
            )}
          </div>

          <div className="mt-1.5 flex justify-end gap-1.5">
            <button type="button" onClick={() => setOpen(false)}
              className="h-8 rounded border border-gray-300 px-3 text-xs text-gray-900 hover:bg-blue-50">
              Hủy
            </button>
            <button type="button" disabled={draft.length === 0} onClick={() => apply(draft)}
              title={draft.length === 0 ? 'Phải chọn ít nhất một giá trị' : undefined}
              className="h-8 rounded bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              Áp dụng
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
};
