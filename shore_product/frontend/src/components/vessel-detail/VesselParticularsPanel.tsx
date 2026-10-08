import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Loader2, Lock, Pencil, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { ENV } from '../../config/env';
import { buildAuthHeaders } from '../../services/api.client';
import { Button, DateInput, fieldClass } from '../common';
import { formatDateVi } from '../../utils/date';
import { PARTICULARS, type FieldDef, type ParticularsTab } from './vesselParticularsFields';

/*
  Tab "Thông số tàu" — cùng kiểu hồ sơ thuyền viên:
  - Chế độ xem (mặc định): nhãn — giá trị, không có ô nhập để lỡ tay sửa.
  - Bấm "Sửa": cùng bố cục, giá trị thành ô nhập; ô đã đổi tô vàng.
  - Lưu chỉ gửi các trường đã đổi; bờ lưu rồi đẩy đúng các trường đó xuống tàu.
  Chế độ sửa giữ nguyên khi chuyển giữa các tab con, "Lưu" lưu thay đổi ở mọi tab con.
*/

type Particulars = Record<string, unknown>;

const API = `${ENV.API_BASE_URL}/vessels`;

const isEmpty = (v: unknown) => v === undefined || v === null || v === '';

/** So sánh hai giá trị đã chuẩn hóa (ngày so theo yyyy-mm-dd, rỗng = null). */
const same = (f: FieldDef, a: unknown, b: unknown) => {
  if (isEmpty(a) && isEmpty(b)) return true;
  if (f.kind === 'date') return String(a ?? '').slice(0, 10) === String(b ?? '').slice(0, 10);
  if (f.kind === 'bool') return !!a === !!b;
  return a === b;
};

const fmtDateTime = (iso?: unknown) =>
  iso ? new Date(String(iso)).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;

/** Mọi trường chiếm đúng 1 ô. Hàng cuối thiếu ô thì bù ô trống để lưới kẻ không bị hở. */
const fillers = (count: number) => ({ sm: (2 - (count % 2)) % 2, lg: (4 - (count % 4)) % 4 });

export const VesselParticularsPanel: React.FC<{
  vesselId: string;
  tab: ParticularsTab;
  /** Báo trang cha khi lưu xong (cập nhật tên tàu ở đầu trang...). */
  onSaved?: (data: Particulars) => void;
  /** Báo trang cha còn thay đổi chưa lưu (để hỏi trước khi rời tab). */
  onDirtyChange?: (dirty: boolean) => void;
}> = ({ vesselId, tab, onSaved, onDirtyChange }) => {
  const [data, setData] = useState<Particulars | null>(null);
  const [edited, setEdited] = useState<Particulars>({});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch(`${API}/${vesselId}/particulars`, { headers: buildAuthHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as Particulars;
      setData(json);
      setEdited(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được thông số tàu');
    }
  }, [vesselId]);

  useEffect(() => { load(); }, [load]);

  /** Mọi trường đã đổi, ở tất cả tab con. */
  const allFields = useMemo(() => Object.values(PARTICULARS).flat().flatMap(s => s.fields), []);
  const changed = useMemo(() => {
    if (!data) return [] as FieldDef[];
    return allFields.filter(f => !f.readOnly && !same(f, data[f.key], edited[f.key]));
  }, [allFields, data, edited]);

  useEffect(() => { onDirtyChange?.(editing && changed.length > 0); }, [editing, changed.length, onDirtyChange]);

  const set = (key: string, value: unknown) => setEdited(prev => ({ ...prev, [key]: value }));

  const cancel = () => { if (data) setEdited(data); setEditing(false); };

  const save = async () => {
    if (!data) return;
    const missing = allFields.filter(f => f.required && isEmpty(edited[f.key]));
    if (missing.length) {
      toast.warning('Chưa nhập đủ thông tin bắt buộc', { description: missing.map(f => f.label).join(', ') });
      return;
    }
    if (changed.length === 0) { setEditing(false); return; }

    const body: Particulars = {};
    changed.forEach(f => {
      const v = edited[f.key];
      body[f.key] = f.kind === 'bool' ? !!v : isEmpty(v) ? null : v;
    });

    setSaving(true);
    try {
      const res = await fetch(`${API}/${vesselId}/particulars`, {
        method: 'PUT',
        headers: buildAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      const json = await res.json() as Particulars;
      setData(json);
      setEdited(json);
      setEditing(false);
      onSaved?.(json);
      toast.success(`Đã lưu ${changed.length} thông số tàu`, { description: 'Thay đổi sẽ được gửi xuống tàu ở lần kết nối tới.' });
    } catch (e) {
      toast.error('Không lưu được thông số tàu', { description: e instanceof Error ? e.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-xs text-ink-muted">
        <span className="text-red-700">{error}</span>
        <Button variant="secondary" onClick={load}>Thử lại</Button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-xs text-ink-muted">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Đang tải thông số tàu...
      </div>
    );
  }

  const displayValue = (f: FieldDef): React.ReactNode => {
    const v = edited[f.key];
    if (f.kind === 'bool') return v ? <span className="text-emerald-700">Có</span> : <span className="text-ink-muted">Không</span>;
    if (isEmpty(v)) return null;
    if (f.kind === 'date') return formatDateVi(String(v));
    if (f.kind === 'number') return `${Number(v).toLocaleString('vi-VN')}${f.unit ? ` ${f.unit}` : ''}`;
    return String(v);
  };

  const renderInput = (f: FieldDef, id: string, dirty: boolean) => {
    const v = edited[f.key];
    const cls = `${fieldClass} text-base ${dirty ? 'border-amber-400 bg-amber-50' : ''}`;
    switch (f.kind) {
      case 'date':
        return <DateInput id={id} value={isEmpty(v) ? '' : String(v).slice(0, 10)} onChange={iso => set(f.key, iso || null)} />;
      case 'bool':
        return (
          <label className="flex h-[38px] items-center gap-2 text-base text-ink">
            <input id={id} type="checkbox" className="h-4 w-4 accent-primary" checked={!!v} onChange={e => set(f.key, e.target.checked)} />
            {v ? 'Có' : 'Không'}
          </label>
        );
      case 'number':
        return (
          <div className="relative">
            <input id={id} type="number" step="any" className={`${cls} ${f.unit ? 'pr-20' : ''}`}
              value={isEmpty(v) ? '' : String(v)}
              onChange={e => set(f.key, e.target.value === '' ? null : Number(e.target.value))} />
            {f.unit && <span className="pointer-events-none absolute right-3 top-2 text-base text-ink-muted">{f.unit}</span>}
          </div>
        );
      case 'select': {
        const opts = f.options ?? [];
        const cur = isEmpty(v) ? '' : String(v);
        return (
          <select id={id} className={cls} value={cur} onChange={e => set(f.key, e.target.value || null)}>
            <option value="">— Chọn —</option>
            {cur && !opts.includes(cur) && <option value={cur}>{cur}</option>}
            {opts.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        );
      }
      default:
        return <input id={id} type={f.kind === 'email' ? 'email' : 'text'} className={cls}
          value={isEmpty(v) ? '' : String(v)} onChange={e => set(f.key, e.target.value)} />;
    }
  };

  const edgeSync = fmtDateTime(data.lastEdgeSyncAt);
  const shoreSync = fmtDateTime(data.lastShoreSyncAt);

  return (
    <div className="flex flex-col gap-4">
      {/* Thanh thao tác — dính ở đầu vùng cuộn để luôn bấm được Lưu / Hủy */}
      <div className="sticky -top-5 z-10 -mx-6 -mt-5 flex flex-wrap items-center gap-3 border-b border-line bg-canvas/95 px-6 py-3 backdrop-blur">
        <span className="inline-flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-muted">
          <ArrowLeftRight className="h-4 w-4 text-primary" aria-hidden="true" />
          Đồng bộ hai chiều với tàu
          <span className="text-ink-light">·</span>
          Tàu gửi lên: <strong className="font-bold text-ink">{edgeSync ?? 'chưa có'}</strong>
          <span className="text-ink-light">·</span>
          Bờ sửa: <strong className="font-bold text-ink">{shoreSync ?? 'chưa có'}</strong>
        </span>
        <div className="ml-auto flex items-center gap-2">
          {editing ? (
            <>
              {changed.length > 0 && <span className="text-xs font-medium text-amber-700">{changed.length} thay đổi chưa lưu</span>}
              <Button variant="secondary" icon={<X className="h-4 w-4" />} onClick={cancel} disabled={saving}>Hủy</Button>
              <Button icon={<Save className="h-4 w-4" />} loading={saving} onClick={save} disabled={changed.length === 0}>Lưu thay đổi</Button>
            </>
          ) : (
            <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Sửa</Button>
          )}
        </div>
      </div>

      {PARTICULARS[tab].map(section => {
        const fill = fillers(section.fields.length);
        return (
          <section key={section.id} className="overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
            <header className="border-b border-grid-strong bg-accent-soft px-4 py-3">
              <h2 className="text-base font-bold text-primary">{section.title}</h2>
            </header>
            <dl className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
              {section.fields.map(f => {
                const id = `vessel-field-${f.key}`;
                const dirty = editing && !f.readOnly && !same(f, data[f.key], edited[f.key]);
                const shown = displayValue(f);
                return (
                  <div key={f.key} className={`min-w-0 px-4 py-3 ${dirty ? 'bg-amber-50/60' : 'bg-surface'}`}>
                    <dt>
                      <label htmlFor={editing && !f.readOnly ? id : undefined} className="mb-1.5 flex items-center gap-1.5 text-base font-semibold text-ink-muted">
                        {f.label}
                        {f.required && editing && <span className="text-red-600">*</span>}
                        {f.readOnly && <Lock className="h-3.5 w-3.5 text-ink-light" aria-label="Không sửa được" />}
                      </label>
                    </dt>
                    <dd>
                      {editing && !f.readOnly ? renderInput(f, id, dirty) : (
                        <div className={`min-h-[24px] break-words text-base font-bold leading-6 text-ink ${f.key === 'imo' ? 'font-mono' : ''}`}>
                          {shown ?? <span className="font-normal text-ink-light">—</span>}
                        </div>
                      )}
                    </dd>
                  </div>
                );
              })}
              {Array.from({ length: fill.sm }, (_, i) => <div key={`sm${i}`} aria-hidden="true" className="hidden bg-surface sm:block lg:hidden" />)}
              {Array.from({ length: fill.lg }, (_, i) => <div key={`lg${i}`} aria-hidden="true" className="hidden bg-surface lg:block" />)}
            </dl>
          </section>
        );
      })}
    </div>
  );
};
