import { useEffect, useId, useRef, useState } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { materialCatalogService, type MaterialCatalogItem } from '@/services/materialService';
import { fieldClass } from '@/components/common';

export function MaterialCatalogPicker({ display, onSelect, disabled }: {
  display: string; onSelect: (item: MaterialCatalogItem) => void; disabled?: boolean;
}) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [term, setTerm] = useState('');
  const [items, setItems] = useState<MaterialCatalogItem[]>([]), [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [active, setActive] = useState(-1);
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setBusy(true); setError(''); setItems([]); setActive(-1);
    const timer = setTimeout(() => {
      materialCatalogService.search(term.trim()).then(result => {
        if (!cancelled) { setItems(result.items); setTotal(result.total); }
      }).catch(() => { if (!cancelled) setError('Không tải được danh mục. Hãy đóng rồi mở lại ô chọn để thử lại.'); })
        .finally(() => { if (!cancelled) setBusy(false); });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [term, open]);
  const choose = (item: MaterialCatalogItem) => { onSelect(item); setOpen(false); setTerm(''); };
  return <div ref={box} className="relative sm:col-span-2" onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
  }}>
    <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">Vật tư danh mục công ty <span className="text-red-500">*</span></label>
    <div className="relative">
      <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
      <input id={id} role="combobox" autoComplete="off" disabled={disabled} aria-expanded={open}
        aria-controls={`${id}-options`} aria-autocomplete="list" aria-activedescendant={active >= 0 ? `${id}-option-${active}` : undefined}
        className={`${fieldClass} pl-9 pr-9`} placeholder="Tìm mã hoặc tên vật tư trong danh mục..."
        value={open ? term : display} onFocus={() => { setTerm(''); setOpen(true); }}
        onChange={event => { setTerm(event.target.value); setOpen(true); }}
        onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            setActive(index => items.length ? (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length : -1);
          }
          if (event.key === 'Enter' && open) { event.preventDefault(); if (active >= 0 && items[active]) choose(items[active]); }
        }} />
      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted" />
    </div>
    {open && <div id={`${id}-options`} role="listbox" aria-label="Vật tư danh mục công ty" className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded border border-line bg-white shadow-lg">
      {busy ? <p role="status" className="p-3 text-sm text-ink-muted">Đang tìm vật tư...</p> : error ? <p role="alert" className="p-3 text-sm text-red-600">{error}</p> : <>
        {!items.length && <p className="p-3 text-sm text-ink-muted">Không có vật tư phù hợp. Hãy tạo vật tư tại Danh mục → Vật tư trước.</p>}
        {items.map((item, index) => <button type="button" role="option" aria-selected={index === active} tabIndex={-1} id={`${id}-option-${index}`} key={item.id}
          onMouseDown={event => event.preventDefault()} onClick={() => choose(item)}
          className={`block w-full border-b border-line px-3 py-2 text-left text-sm last:border-0 hover:bg-primary-soft ${active === index ? 'bg-primary-soft' : ''}`}>
          <span className="block font-medium text-ink">{item.name}</span><span className="text-xs text-ink-muted">{item.itemCode}</span>
        </button>)}
        {total > items.length && <p className="p-2 text-xs text-ink-muted">Hiển thị {items.length}/{total} vật tư. Gõ thêm để thu hẹp kết quả.</p>}
      </>}
    </div>}
  </div>;
}
