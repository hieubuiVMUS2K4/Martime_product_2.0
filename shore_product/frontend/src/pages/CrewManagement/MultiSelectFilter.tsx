import React, { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, Check } from 'lucide-react';

export interface MultiSelectOption {
  id: number;
  label: string;
  /** Dòng phụ hiển thị mờ bên phải (mã chức danh, mã chứng chỉ...). */
  hint?: string;
}

interface Props {
  label: string;
  options: MultiSelectOption[];
  /** Tập id đang được chọn. Rỗng = không hiện gì (giống Excel bỏ tick hết). */
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
}

/**
 * Bộ lọc đa chọn kiểu Excel: ô tìm kiếm, chọn tất cả / bỏ chọn tất cả, danh sách tick.
 * Trang gọi tick sẵn toàn bộ khi dữ liệu về.
 */
export const MultiSelectFilter: React.FC<Props> = ({ label, options, selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  // Bấm ra ngoài hoặc Esc thì đóng. Không dùng onBlur vì click vào ô tick bên trong cũng làm mất focus.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter(o => o.label.toLowerCase().includes(q) || (o.hint ?? '').toLowerCase().includes(q));
  }, [options, search]);

  const allSelected = options.length > 0 && selected.size === options.length;
  const summary = allSelected ? 'Tất cả' : selected.size === 0 ? 'Chưa chọn' : `${selected.size}/${options.length}`;

  const toggle = (id: number) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange(next);
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        className={`inline-flex h-9 items-center gap-1.5 rounded-md border bg-surface px-3 text-sm transition-colors hover:border-accent/40 ${
          allSelected ? 'border-line text-ink' : 'border-primary/40 bg-primary-soft text-primary'
        }`}
      >
        <span className="text-ink-muted">{label}:</span>
        <span className={`font-semibold ${selected.size === 0 ? 'text-red-700' : ''}`}>{summary}</span>
        <ChevronDown className="h-4 w-4 text-ink-light" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-72 overflow-hidden rounded-md border border-line bg-surface shadow-lg">
          <div className="border-b border-grid p-2">
            <label className="relative block">
              <span className="sr-only">Tìm {label.toLowerCase()}</span>
              <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-ink-light" aria-hidden="true" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Tìm..."
                className="h-8 w-full rounded-md border border-line bg-surface pl-8 pr-2 text-[13px] text-ink placeholder:text-ink-light focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
              />
            </label>
          </div>

          <div className="flex gap-3 border-b border-grid px-3 py-1.5 text-[13px]">
            <button type="button" className="font-semibold text-primary hover:underline" onClick={() => onChange(new Set(options.map(o => o.id)))}>
              Chọn tất cả
            </button>
            <button type="button" className="text-ink-muted hover:underline" onClick={() => onChange(new Set())}>
              Bỏ chọn
            </button>
          </div>

          <div className="max-h-64 overflow-y-auto py-1" role="listbox" aria-multiselectable="true">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-center text-[13px] text-ink-muted">Không tìm thấy</p>
            ) : filtered.map(o => {
              const on = selected.has(o.id);
              return (
                <button
                  key={o.id}
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => toggle(o.id)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-primary-soft ${on ? 'bg-primary-soft/60' : ''}`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-primary bg-primary text-white' : 'border-line bg-surface'}`}>
                    {on && <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-ink">{o.label}</span>
                  {o.hint && <span className="shrink-0 font-mono text-xs text-ink-light">{o.hint}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
