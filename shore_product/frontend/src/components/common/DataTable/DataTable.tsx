import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, Download, FileSpreadsheet, Inbox, Loader2, Plus, Search, Upload, X } from 'lucide-react';
import { foldVietnamese } from '@/utils/text';
import { ColumnFilterMenu, type SortDirection } from './ColumnFilterMenu';
import { TablePagination } from './TablePagination';
import { exportToCsv, exportToExcel, type ExportColumn } from './exportTable';

/*
  Bảng dữ liệu dùng chung của phân hệ bờ.

  Quy chuẩn (mọi bảng giống nhau):
  - Thanh công cụ: ô tìm nhanh + số kết quả bên trái; Xuất dữ liệu, Import, Thêm mới bên phải.
  - KHÔNG có hàng ô lọc dưới tiêu đề. Mỗi cột có nút lọc riêng ở góc tiêu đề (kiểu Excel),
    sắp xếp nằm trong menu đó.
  - Chữ căn trái, số căn phải, nút căn giữa. Tiêu đề cột căn giữa.
  - Nét kẻ cột đậm (token --rgb-grid), dưới tiêu đề đậm hơn.
  - Phân trang 20 dòng, tự lùi trang khi lọc làm số trang giảm.

  Trang chỉ khai báo cột:
    { key: 'name', header: 'Tên cảng', value: p => p.portName }
    { key: 'lat', header: 'Vĩ độ', value: p => p.latitude, numeric: true }
    { key: 'actions', header: 'Thao tác', align: 'center', render: p => <...nút...> }
  `value` dùng chung cho hiển thị (khi không có render), tìm nhanh, lọc cột, sắp xếp và xuất file.
*/

type CellValue = string | number | boolean | null | undefined;

export interface Column<T> {
  key: string;
  header: string;
  /** Giải thích ngắn hiện khi rê chuột lên tiêu đề cột. */
  headerHint?: string;
  value?: (item: T) => CellValue;
  render?: (item: T) => React.ReactNode;
  /** Có nút lọc cột không. Mặc định có nếu cột khai `value`. Truyền hàm để lọc theo nhãn khác giá trị gốc. */
  filter?: boolean | ((item: T) => string);
  /** Lọc nhanh theo nhóm trong menu lọc, ví dụ { label: 'Sắp hết hạn', match: v => ... }. */
  quickFilters?: { label: string; match: (value: string) => boolean }[];
  sortable?: boolean;
  /** Cột số: căn phải, sắp xếp theo trị số. */
  numeric?: boolean;
  align?: 'left' | 'right' | 'center';
  width?: number | string;
  /** Có xuất ra file không. Mặc định có nếu cột khai `value`. */
  exportable?: boolean;
  exportValue?: (item: T) => CellValue;
  /** Có tham gia ô tìm nhanh không. Mặc định có nếu cột khai `value`. */
  searchable?: boolean;
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  rowKey: (item: T) => string | number;
  loading?: boolean;
  /** Lỗi tải dữ liệu, hiện thay cho bảng trống. */
  error?: string | null;
  emptyMessage?: string;

  searchPlaceholder?: string;
  /** Tắt ô tìm nhanh (bảng rất nhỏ). */
  searchable?: boolean;

  onAdd?: () => void;
  addLabel?: string;
  onImport?: () => void;
  importLabel?: string;
  /** Cấu hình xuất file. `false` để tắt. */
  exportOptions?: { fileName: string; title?: string } | false;
  /** Nút riêng của trang, đặt trước nút Xuất. */
  toolbarActions?: React.ReactNode;
  /** Khối riêng bên trái thanh công cụ, sau ô tìm (ví dụ bộ chọn tàu). */
  toolbarLeft?: React.ReactNode;

  showIndex?: boolean;
  pageSize?: number;
  pageSizeOptions?: number[];
  itemLabel?: string;

  /** Cột tích chọn nhiều dòng. */
  selection?: { selected: Set<string | number>; onChange: (next: Set<string | number>) => void };
  /** Thanh thao tác khi đang chọn dòng, ví dụ nút "Xóa đã chọn". */
  bulkActions?: React.ReactNode;

  onRowClick?: (item: T) => void;
  onRowContextMenu?: (event: React.MouseEvent, item: T) => void;
  rowClassName?: (item: T) => string | undefined;
  /** Chiều rộng tối thiểu của bảng trước khi cuộn ngang. */
  minWidth?: number;
  className?: string;
}

const str = (v: CellValue) => (v === null || v === undefined ? '' : String(v));

export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading = false,
  error,
  emptyMessage = 'Chưa có dữ liệu.',
  searchPlaceholder = 'Tìm nhanh...',
  searchable = true,
  onAdd,
  addLabel = 'Thêm mới',
  onImport,
  importLabel = 'Import Excel',
  exportOptions,
  toolbarActions,
  toolbarLeft,
  showIndex = true,
  pageSize: initialPageSize = 20,
  pageSizeOptions = [20, 50, 100],
  itemLabel = 'kết quả',
  selection,
  bulkActions,
  onRowClick,
  onRowContextMenu,
  rowClassName,
  minWidth = 760,
  className = '',
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [sort, setSort] = useState<{ key: string; dir: SortDirection } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const filterOf = (col: Column<T>): ((item: T) => string) | null => {
    if (typeof col.filter === 'function') return col.filter;
    if (col.filter === false || !col.value) return null;
    return item => str(col.value!(item));
  };

  const filterable = useMemo(
    () => columns.map(c => ({ col: c, get: filterOf(c) })).filter(x => x.get) as { col: Column<T>; get: (i: T) => string }[],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns],
  );

  const passes = (item: T, except?: string) =>
    filterable.every(({ col, get }) => {
      if (col.key === except) return true;
      const allowed = filters[col.key];
      return !allowed || allowed.includes(get(item));
    });

  const searched = useMemo(() => {
    const keyword = foldVietnamese(search);
    if (!keyword) return data;
    const cols = columns.filter(c => c.value && c.searchable !== false);
    return data.filter(item => cols.some(c => foldVietnamese(str(c.value!(item))).includes(keyword)));
  }, [data, columns, search]);

  const filtered = useMemo(
    () => searched.filter(item => passes(item)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searched, filters, filterable],
  );

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find(c => c.key === sort.key);
    if (!col?.value) return filtered;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const x = col.value!(a);
      const y = col.value!(b);
      if (x === y) return 0;
      if (x === null || x === undefined || x === '') return 1;
      if (y === null || y === undefined || y === '') return -1;
      const r = typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x).localeCompare(String(y), 'vi', { numeric: true, sensitivity: 'base' });
      return r * dir;
    });
  }, [filtered, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => { setPage(p => Math.min(p, totalPages)); }, [totalPages]);
  useEffect(() => { setPage(1); }, [search, filters, sort, pageSize]);

  const first = (page - 1) * pageSize;
  const rows = sorted.slice(first, first + pageSize);

  /** Giá trị cho menu lọc của một cột, đã trừ các dòng bị cột khác lọc mất. */
  const valuesFor = (col: Column<T>, get: (i: T) => string) =>
    [...new Set(searched.filter(i => passes(i, col.key)).map(get))].sort((a, b) =>
      col.numeric ? Number(a) - Number(b) : a.localeCompare(b, 'vi', { numeric: true }),
    );

  const applyFilter = (key: string, selected: string[] | null) =>
    setFilters(prev => {
      const next = { ...prev };
      if (selected === null) delete next[key];
      else next[key] = selected;
      return next;
    });

  const activeFilterCount = Object.keys(filters).length;
  const hasQuery = !!search.trim() || activeFilterCount > 0;

  /* ── Chọn dòng ── */
  const pageKeys = rows.map(rowKey);
  const allOnPage = !!selection && pageKeys.length > 0 && pageKeys.every(k => selection.selected.has(k));
  const someOnPage = !!selection && pageKeys.some(k => selection.selected.has(k)) && !allOnPage;
  const togglePage = () => {
    if (!selection) return;
    const next = new Set(selection.selected);
    pageKeys.forEach(k => (allOnPage ? next.delete(k) : next.add(k)));
    selection.onChange(next);
  };
  const toggleRow = (k: string | number) => {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (next.has(k)) next.delete(k); else next.add(k);
    selection.onChange(next);
  };

  /* ── Xuất file: xuất đúng những dòng đang thấy sau tìm/lọc/sắp xếp ── */
  const exportCols: ExportColumn<T>[] = columns
    .filter(c => c.exportable ?? !!(c.value || c.exportValue))
    .map(c => ({ header: c.header, value: (c.exportValue ?? c.value)!, numeric: c.numeric }));

  const colCount = columns.length + (showIndex ? 1 : 0) + (selection ? 1 : 0);
  const alignOf = (c: Column<T>) => c.align ?? (c.numeric ? 'right' : 'left');
  const alignClass = { left: 'text-left', right: 'text-right tabular-nums', center: 'text-center' } as const;

  return (
    <section className={`flex min-w-0 flex-col overflow-hidden rounded-md border border-grid-strong bg-surface ${className}`}>
      {/* ── Thanh công cụ ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-grid px-3 py-2.5">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
          {searchable && (
            <label className="relative w-full max-w-[340px]">
              <span className="sr-only">Tìm nhanh</span>
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-light" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="h-9 w-full rounded-md border border-line bg-surface pl-8 pr-3 text-sm text-ink placeholder:text-ink-light focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
              />
            </label>
          )}
          <span className="whitespace-nowrap text-[13px] font-semibold text-ink" aria-live="polite">
            {loading ? 'Đang tải...' : `${sorted.length} ${itemLabel}`}
          </span>
          {activeFilterCount > 0 && (
            <button type="button" onClick={() => setFilters({})}
              className="flex h-7 items-center gap-1 rounded-full border border-primary/30 bg-primary-soft px-2.5 text-[12px] font-medium text-primary hover:bg-accent-soft">
              Đang lọc {activeFilterCount} cột <X className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only">Bỏ tất cả bộ lọc</span>
            </button>
          )}
          {toolbarLeft}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {toolbarActions}
          {exportOptions !== false && exportOptions && (
            <ExportMenu
              disabled={sorted.length === 0}
              onExcel={() => exportToExcel({ ...exportOptions, columns: exportCols, rows: sorted })}
              onCsv={() => exportToCsv({ ...exportOptions, columns: exportCols, rows: sorted })}
            />
          )}
          {onImport && (
            <button type="button" onClick={onImport} className={toolbarBtn}>
              <Upload className="h-4 w-4" aria-hidden="true" /> {importLabel}
            </button>
          )}
          {onAdd && (
            <button type="button" onClick={onAdd}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-medium text-white hover:bg-primary-hover">
              <Plus className="h-4 w-4" aria-hidden="true" /> {addLabel}
            </button>
          )}
        </div>
      </div>

      {selection && selection.selected.size > 0 && (
        <div className="flex items-center gap-3 border-b border-grid bg-accent-soft px-3 py-1.5 text-[13px] text-primary">
          <span>Đã chọn <strong>{selection.selected.size}</strong> dòng</span>
          {bulkActions}
          <button type="button" className="ml-auto text-[13px] underline-offset-2 hover:underline" onClick={() => selection.onChange(new Set())}>
            Bỏ chọn
          </button>
        </div>
      )}

      {/* ── Bảng ── */}
      <div className="min-h-0 flex-1 overflow-auto" tabIndex={0} aria-label="Bảng dữ liệu, có thể cuộn ngang">
        <table className="w-full border-collapse text-[13px] text-ink" style={{ minWidth }}>
          <thead>
            <tr>
              {selection && (
                <th scope="col" className={`${thClass} w-10`}>
                  <input type="checkbox" className="h-4 w-4 accent-primary" aria-label="Chọn cả trang"
                    checked={allOnPage} ref={n => { if (n) n.indeterminate = someOnPage; }} onChange={togglePage} />
                </th>
              )}
              {showIndex && <th scope="col" className={`${thClass} w-12`}>STT</th>}
              {columns.map(col => {
                const get = filterOf(col);
                const sortable = col.sortable ?? !!col.value;
                const sorting = sort?.key === col.key ? sort.dir : null;
                return (
                  <th key={col.key} scope="col" className={`${thClass} ${get ? 'pr-6' : ''}`} style={{ width: col.width }}
                    title={col.headerHint}>
                    <span className="inline-flex items-center justify-center gap-1">
                      {col.header}
                      {sorting === 'asc' && <ArrowUp className="h-3.5 w-3.5 text-primary" aria-label="tăng dần" />}
                      {sorting === 'desc' && <ArrowDown className="h-3.5 w-3.5 text-primary" aria-label="giảm dần" />}
                    </span>
                    {get && (
                      <ColumnFilterMenu
                        label={col.header}
                        values={valuesFor(col, get)}
                        selected={filters[col.key] ?? null}
                        quickFilters={col.quickFilters?.map(q => ({ label: q.label, values: valuesFor(col, get).filter(q.match) }))}
                        sortable={sortable}
                        sortDirection={sorting}
                        onSort={dir => setSort(dir ? { key: col.key, dir } : null)}
                        onApply={sel => applyFilter(col.key, sel)}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-14 text-center text-ink-muted">
                  <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-accent" aria-hidden="true" />
                  Đang tải dữ liệu...
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-14 text-center text-red-700">{error}</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="px-4 py-14 text-center text-ink-muted">
                  <Inbox className="mx-auto mb-2 h-7 w-7 text-ink-light" aria-hidden="true" />
                  <strong className="block text-sm text-ink">{hasQuery ? 'Không tìm thấy kết quả phù hợp' : emptyMessage}</strong>
                  {hasQuery && <span className="mt-1 block">Thử đổi từ khóa hoặc bỏ bớt bộ lọc.</span>}
                </td>
              </tr>
            ) : (
              rows.map((item, i) => {
                const k = rowKey(item);
                const selected = selection?.selected.has(k);
                return (
                  <tr
                    key={k}
                    onClick={onRowClick ? e => {
                      if ((e.target as HTMLElement).closest('button, a, input, select, textarea, label')) return;
                      onRowClick(item);
                    } : undefined}
                    onContextMenu={onRowContextMenu ? e => onRowContextMenu(e, item) : undefined}
                    className={`${selected ? 'bg-accent-soft' : 'hover:bg-primary-soft/70'} ${onRowClick ? 'cursor-pointer' : ''} ${rowClassName?.(item) ?? ''}`}
                  >
                    {selection && (
                      <td className={`${tdClass} text-center`}>
                        <input type="checkbox" className="h-4 w-4 accent-primary" aria-label="Chọn dòng"
                          checked={!!selected} onChange={() => toggleRow(k)} />
                      </td>
                    )}
                    {showIndex && <td className={`${tdClass} text-right tabular-nums text-ink-muted`}>{first + i + 1}</td>}
                    {columns.map(col => (
                      <td key={col.key} className={`${tdClass} ${alignClass[alignOf(col)]} ${col.className ?? ''}`}>
                        {col.render ? col.render(item) : str(col.value?.(item))}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!loading && sorted.length > 0 && (
        <TablePagination
          page={page}
          pageSize={pageSize}
          totalItems={sorted.length}
          onPageChange={setPage}
          pageSizeOptions={pageSizeOptions}
          onPageSizeChange={setPageSize}
          itemLabel={itemLabel}
        />
      )}
    </section>
  );
}

const thClass =
  'sticky top-0 z-[1] h-11 border-b border-r border-b-grid-strong border-r-grid bg-canvas px-2 py-1.5 text-center align-middle text-[13px] font-semibold leading-tight text-ink last:border-r-0';
const tdClass = 'border-b border-r border-grid px-2.5 py-2 align-middle last:border-r-0';
const toolbarBtn =
  'inline-flex h-9 items-center gap-1.5 rounded-md border border-line bg-surface px-3 text-sm font-medium text-ink hover:bg-primary-soft hover:border-accent/40 disabled:cursor-not-allowed disabled:opacity-50';

/** Nút "Xuất dữ liệu" kèm menu chọn định dạng. */
const ExportMenu: React.FC<{ disabled?: boolean; onExcel: () => void; onCsv: () => void }> = ({ disabled, onExcel, onCsv }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const item = 'flex w-full items-center gap-2 rounded px-2.5 py-2 text-left text-[13px] text-ink hover:bg-primary-soft';
  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open} className={toolbarBtn}
        title={disabled ? 'Không có dữ liệu để xuất' : 'Xuất những dòng đang hiển thị (đã tìm/lọc)'}>
        <Download className="h-4 w-4" aria-hidden="true" /> Xuất dữ liệu <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-dropdown mt-1 w-48 rounded-md border border-line bg-surface p-1 shadow-lg">
          <button type="button" role="menuitem" className={item} onClick={() => { onExcel(); setOpen(false); }}>
            <FileSpreadsheet className="h-4 w-4 text-emerald-700" aria-hidden="true" /> Excel (.xlsx)
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => { onCsv(); setOpen(false); }}>
            <FileSpreadsheet className="h-4 w-4 text-ink-muted" aria-hidden="true" /> CSV (.csv)
          </button>
        </div>
      )}
    </div>
  );
};
