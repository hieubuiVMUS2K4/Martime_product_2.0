import { PermissionGate } from '@/components/auth/PermissionGate'
import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { ArrowLeftRight, Loader2, Lock, Pencil, Plus, Save, Ship, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { shipDataService } from '@/services/ship-data.service';
import type { SaveShipData, ShipDataTabId } from '@/types/ship-data.types';
import { createEmptyShipData } from '@/types/ship-data.types';
import { ALL_FIELDS, ALL_LISTS, SHIP_DATA_TABS, type FieldDef, type ListDef } from '@/components/ship-data/particularsConfig';

/*
  Dữ liệu tàu — cùng bố cục với "Thông số tàu" bên bờ:
  - Chế độ xem (mặc định): nhãn — giá trị, không có ô nhập để lỡ tay sửa.
  - Bấm "Sửa": cùng bố cục, giá trị thành ô nhập; ô đã đổi tô vàng.
  - Chế độ sửa giữ nguyên khi chuyển tab, "Lưu thay đổi" lưu thay đổi ở mọi tab.
  Lưu xong, thay đổi được gửi lên bờ ở lần đồng bộ tới (đồng bộ hai chiều).
*/

type Row = Record<string, unknown>;

const isEmpty = (v: unknown) => v === undefined || v === null || v === '';

/** So sánh hai giá trị đã chuẩn hóa (ngày theo yyyy-mm-dd, rỗng = null). */
const same = (f: FieldDef, a: unknown, b: unknown) => {
  if (isEmpty(a) && isEmpty(b)) return true;
  if (f.kind === 'date') return String(a ?? '').slice(0, 10) === String(b ?? '').slice(0, 10);
  if (f.kind === 'bool') return !!a === !!b;
  return a === b;
};

const sameList = (a: unknown, b: unknown) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

/** Mọi trường chiếm đúng 1 ô. Hàng cuối thiếu ô thì bù ô trống để lưới kẻ không bị hở. */
const fillers = (count: number) => ({ sm: (2 - (count % 2)) % 2, lg: (4 - (count % 4)) % 4 });

const fmtDate = (v: unknown) => {
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('vi-VN');
};
const fmtDateTime = (v?: string | null) =>
  v ? new Date(v).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

const inputClass = 'w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500';

export function ShipDataPage() {
  const [data, setData] = useState<SaveShipData | null>(null);
  const [edited, setEdited] = useState<SaveShipData>(createEmptyShipData());
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ShipDataTabId>('basic-data');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await shipDataService.get();
      let next = createEmptyShipData();
      if (response.exists && response.data) {
        const { id: _id, createdAt: _c, updatedAt: u, ...rest } = response.data;
        next = rest as SaveShipData;
        setUpdatedAt(u ?? null);
      }
      setData(next);
      setEdited(next);
    } catch (err: any) {
      setError('Không tải được dữ liệu tàu: ' + (err?.message || 'lỗi không xác định'));
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const val = (key: string) => (edited as unknown as Row)[key];
  const orig = (key: string) => (data as unknown as Row | null)?.[key];
  const set = (key: string, value: unknown) => setEdited(prev => ({ ...prev, [key]: value }));

  /** Trường và danh sách đã đổi, ở tất cả các tab. */
  const changed = useMemo(() => {
    if (!data) return { fields: [] as FieldDef[], lists: [] as ListDef[] };
    const d = data as unknown as Row, e = edited as unknown as Row;
    return {
      fields: ALL_FIELDS.filter(f => !same(f, d[f.key], e[f.key])),
      lists: ALL_LISTS.filter(l => !sameList(d[l.collection], e[l.collection])),
    };
  }, [data, edited]);
  const changeCount = changed.fields.length + changed.lists.length;
  const tabChanges = (tabId: ShipDataTabId) => {
    const tab = SHIP_DATA_TABS.find(t => t.id === tabId)!;
    const keys = new Set(tab.sections.flatMap(s => s.fields.map(f => f.key)));
    const lists = new Set((tab.lists ?? []).map(l => l.id));
    return changed.fields.filter(f => keys.has(f.key)).length + changed.lists.filter(l => lists.has(l.id)).length;
  };

  const cancel = () => { if (data) setEdited(data); setEditing(false); };

  const save = async () => {
    const missing = ALL_FIELDS.filter(f => f.required && isEmpty(val(f.key)));
    if (missing.length) {
      toast.warning('Chưa nhập đủ thông tin bắt buộc', { description: missing.map(f => f.label).join(', ') });
      setActiveTab('basic-data');
      return;
    }
    if (changeCount === 0) { setEditing(false); return; }

    setSaving(true);
    try {
      await shipDataService.save(edited);
      toast.success(`Đã lưu ${changeCount} thay đổi dữ liệu tàu`, { description: 'Thay đổi sẽ được gửi lên bờ ở lần đồng bộ tới.' });
      setEditing(false);
      await load();
    } catch (err: any) {
      toast.error('Không lưu được dữ liệu tàu', { description: err?.response?.data?.error || err?.message });
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-sm text-gray-500">
        <span className="text-red-700">{error}</span>
        <button type="button" onClick={() => void load()} className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">Thử lại</button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin text-blue-500" aria-hidden="true" /> Đang tải dữ liệu tàu...
      </div>
    );
  }

  /* ── Một trường: xem hoặc sửa ── */
  const displayValue = (f: FieldDef): ReactNode => {
    const v = val(f.key);
    if (f.kind === 'bool') return v ? <span className="text-emerald-700">Có</span> : <span className="text-gray-500">Không</span>;
    if (isEmpty(v)) return null;
    if (f.kind === 'date') return fmtDate(v);
    if (f.kind === 'number') return `${Number(v).toLocaleString('vi-VN')}${f.unit ? ` ${f.unit}` : ''}`;
    return `${String(v)}${f.unit ? ` ${f.unit}` : ''}`;
  };

  const renderInput = (f: FieldDef, id: string, dirty: boolean, value: unknown, onSet: (v: unknown) => void) => {
    const cls = `${inputClass} ${dirty ? 'border-amber-400 bg-amber-50' : ''}`;
    switch (f.kind) {
      case 'date':
        return <input id={id} type="date" className={cls} value={isEmpty(value) ? '' : String(value).slice(0, 10)} onChange={e => onSet(e.target.value || undefined)} />;
      case 'bool':
        return (
          <label className="flex h-[34px] items-center gap-2 text-sm text-gray-900">
            <input id={id} type="checkbox" className="h-4 w-4 accent-blue-600" checked={!!value} onChange={e => onSet(e.target.checked)} />
            {value ? 'Có' : 'Không'}
          </label>
        );
      case 'number':
        return (
          <div className="relative">
            <input id={id} type="number" step={f.integer ? 1 : 'any'} className={`${cls} ${f.unit ? 'pr-20' : ''}`}
              value={isEmpty(value) ? '' : String(value)}
              onChange={e => onSet(e.target.value === '' ? undefined : f.integer ? parseInt(e.target.value, 10) : Number(e.target.value))} />
            {f.unit && <span className="pointer-events-none absolute right-2.5 top-1.5 text-sm text-gray-400">{f.unit}</span>}
          </div>
        );
      case 'select': {
        const opts = f.options ?? [];
        const cur = isEmpty(value) ? '' : String(value);
        return (
          <select id={id} className={cls} value={cur} onChange={e => onSet(e.target.value || undefined)}>
            <option value="">— Chọn —</option>
            {cur && !opts.includes(cur) && <option value={cur}>{cur}</option>}
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      }
      default:
        return (
          <div className="relative">
            <input id={id} type={f.kind === 'email' ? 'email' : 'text'} className={`${cls} ${f.unit ? 'pr-16' : ''}`}
              value={isEmpty(value) ? '' : String(value)} onChange={e => onSet(e.target.value)} />
            {f.unit && <span className="pointer-events-none absolute right-2.5 top-1.5 text-sm text-gray-400">{f.unit}</span>}
          </div>
        );
    }
  };

  /* ── Danh sách nhiều dòng (máy chính, chân vịt...) ── */
  const renderList = (list: ListDef) => {
    const rows = ((val(list.collection) as Row[] | undefined) ?? []);
    const na = list.naKey ? !!val(list.naKey) : false;
    const dirty = editing && !sameList(orig(list.collection), val(list.collection));
    const setRows = (next: Row[]) => set(list.collection, next.map((r, i) => ({ ...r, sortOrder: i })));
    const addRow = () => setRows([...rows, Object.fromEntries(list.columns.map(c => [c.key, undefined]))]);
    const cell = (r: Row, c: FieldDef) => {
      const v = r[c.key];
      if (isEmpty(v)) return <span className="text-gray-400">—</span>;
      return c.kind === 'number' ? Number(v).toLocaleString('vi-VN') : String(v);
    };

    return (
      <section key={list.id} className={`overflow-hidden rounded-lg border bg-white ${dirty ? 'border-amber-300' : 'border-gray-200'}`}>
        <header className="flex items-center justify-between gap-2 border-b border-gray-200 bg-blue-50 px-4 py-2.5">
          <h2 className="text-sm font-semibold text-blue-700">
            {list.title}
            {!na && <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">{rows.length}</span>}
          </h2>
          {editing && !na && (
            <button type="button" onClick={addRow} className="inline-flex items-center gap-1 rounded border border-blue-600 bg-white px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50">
              <Plus className="h-3.5 w-3.5" /> Thêm dòng
            </button>
          )}
        </header>
        {na ? (
          <p className="px-4 py-3 text-sm italic text-gray-400">Tàu không có.</p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-3 text-sm italic text-gray-400">Chưa có dữ liệu.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="w-12 border-b border-r border-b-[#7d8d9a] border-r-[#a3b1bc] bg-gray-50 px-2 py-2 text-center text-xs font-semibold text-gray-600">STT</th>
                  {list.columns.map(c => (
                    <th key={c.key} className="border-b border-r border-b-[#7d8d9a] border-r-[#a3b1bc] bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-600 last:border-r-0">
                      {c.label}{c.unit ? ` (${c.unit})` : ''}
                    </th>
                  ))}
                  {list.computed && <th className="border-b border-r border-b-[#7d8d9a] border-r-[#a3b1bc] bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-600">{list.computed.label}</th>}
                  {editing && <th className="w-12 border-b border-b-[#7d8d9a] bg-gray-50" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className={i % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'}>
                    <td className="border-b border-r border-[#a3b1bc] px-2 py-1.5 text-center text-gray-500">{i + 1}</td>
                    {list.columns.map(c => (
                      <td key={c.key} className={`border-b border-r border-[#a3b1bc] px-2 py-1.5 ${c.kind === 'number' ? 'text-right tabular-nums' : ''}`}>
                        {editing
                          ? renderInput({ ...c, unit: undefined }, `${list.id}-${i}-${c.key}`, false, r[c.key],
                              v => setRows(rows.map((x, j) => (j === i ? { ...x, [c.key]: v } : x))))
                          : cell(r, c)}
                      </td>
                    ))}
                    {list.computed && <td className="border-b border-r border-[#a3b1bc] px-3 py-1.5 text-right tabular-nums text-gray-600">{list.computed.value(r) || '—'}</td>}
                    {editing && (
                      <td className="border-b border-[#a3b1bc] px-2 py-1.5 text-center">
                        <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} title="Xóa dòng" aria-label={`Xóa dòng ${i + 1}`}
                          className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    );
  };

  const tab = SHIP_DATA_TABS.find(t => t.id === activeTab)!;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white">
      {/* Tiêu đề + thao tác */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Ship className="h-4 w-4 text-blue-600" aria-hidden="true" />
            Dữ liệu tàu
          </span>
          {data.shipName && (
            <span className="text-sm text-gray-600">
              {data.shipName}{data.imoNumber && <span className="ml-1 font-mono text-gray-500">· IMO {data.imoNumber}</span>}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <ArrowLeftRight className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
            Đồng bộ hai chiều với bờ
            <span className="text-gray-300">·</span>
            Cập nhật lần cuối: <strong className="font-medium text-gray-700">{fmtDateTime(updatedAt) ?? 'chưa có'}</strong>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {editing ? (
            <>
              {changeCount > 0 && <span className="text-xs font-medium text-amber-700">{changeCount} thay đổi chưa lưu</span>}
              <button type="button" onClick={cancel} disabled={saving}
                className="inline-flex items-center gap-1.5 rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">
                <X className="h-3.5 w-3.5" /> Hủy
              </button>
              <button type="button" onClick={() => void save()} disabled={saving || changeCount === 0}
                className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Lưu thay đổi
              </button>
            </>
          ) : (
            <PermissionGate permission="ship-data.update">
              <button type="button" onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
                <Pencil className="h-3.5 w-3.5" /> Sửa
              </button>
            </PermissionGate>
          )}
        </div>
      </div>

      {/* Tab — cùng thứ tự với bên bờ */}
      <nav className="flex shrink-0 overflow-x-auto border-b border-gray-200 bg-white px-4" aria-label="Nhóm dữ liệu tàu">
        {SHIP_DATA_TABS.map(t => {
          const count = editing ? tabChanges(t.id) : 0;
          return (
            <button key={t.id} type="button" onClick={() => setActiveTab(t.id)}
              className={`-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}>
              {t.label}
              {count > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-xs font-semibold text-amber-700">{count}</span>}
            </button>
          );
        })}
      </nav>

      {/* Nội dung tab */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50 p-4">
        <div className="flex flex-col gap-4">
          {tab.sections.map(section => {
            const fill = fillers(section.fields.length);
            return (
              <section key={section.id} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                <header className="border-b border-gray-200 bg-blue-50 px-4 py-2.5">
                  <h2 className="text-sm font-semibold text-blue-700">{section.title}</h2>
                </header>
                <dl className="grid grid-cols-1 gap-px bg-gray-200 sm:grid-cols-2 lg:grid-cols-4">
                  {section.fields.map(f => {
                    const id = `ship-field-${f.key}`;
                    const locked = !!f.lockedOnceSet && !isEmpty(orig(f.key));
                    const dirty = editing && !same(f, orig(f.key), val(f.key));
                    const shown = displayValue(f);
                    return (
                      <div key={f.key} className={`min-w-0 px-4 py-3 ${dirty ? 'bg-amber-50/60' : 'bg-white'}`}>
                        <dt>
                          <label htmlFor={editing && !locked ? id : undefined} className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                            {f.label}
                            {f.required && editing && <span className="text-red-600">*</span>}
                            {locked && <Lock className="h-3 w-3 text-gray-400" aria-label="Không sửa được" />}
                          </label>
                        </dt>
                        <dd>
                          {editing && !locked ? renderInput(f, id, dirty, val(f.key), v => set(f.key, v)) : (
                            <div className={`min-h-[22px] break-words text-sm font-medium text-gray-900 ${f.key === 'imoNumber' ? 'font-mono' : ''}`}>
                              {shown ?? <span className="font-normal text-gray-400">—</span>}
                            </div>
                          )}
                        </dd>
                      </div>
                    );
                  })}
                  {Array.from({ length: fill.sm }, (_, i) => <div key={`sm${i}`} aria-hidden="true" className="hidden bg-white sm:block lg:hidden" />)}
                  {Array.from({ length: fill.lg }, (_, i) => <div key={`lg${i}`} aria-hidden="true" className="hidden bg-white lg:block" />)}
                </dl>
              </section>
            );
          })}
          {tab.lists?.map(renderList)}
        </div>
      </div>
    </div>
  );
}

export default ShipDataPage;
