import React from 'react';
import { AlertTriangle, Lock, Unlock } from 'lucide-react';
import { DateInput, fieldClass } from '../../../components/common';
import type { Country, Rank } from '../../../types/crew.types';
import { formatDateVi } from '../../../utils/date';
import {
  SECTIONS, calcAge, departmentOptions, departmentLabel, optionLabel,
  type CrewForm, type FieldDef, type FieldKey, type Option,
} from './crewProfileFields';

/*
  Tab "Thông tin cơ bản" của hồ sơ thuyền viên.

  - Chế độ xem (mặc định): nhãn — giá trị, gọn, không có ô nhập nào để lỡ tay sửa.
  - Chế độ sửa: cùng bố cục, giá trị thành ô nhập.
  - Một lưới 4 cột chung cho mọi nhóm; ô rộng theo nội dung (`span`).
  - Trường tàu đã sửa (edgeChanges) được tô đỏ và ghi "Tàu đã sửa: cũ → mới" ở cả hai chế độ.
  - Ngày lên/xuống tàu do quy trình quản lý: chỉ sửa khi bật "Sửa thủ công". Trạng thái trên tàu
    thì máy chủ không cho sửa qua form này (chỉ qua lên/xuống tàu), nên không có ô sửa.
*/

interface Props {
  edited: CrewForm;
  set: (key: FieldKey, value: unknown) => void;
  editing: boolean;
  ranks: Rank[];
  countries: Country[];
  changeMap: Record<string, { oldValue: string; newValue: string }>;
  manualOverride: boolean;
  onManualOverrideChange: (on: boolean) => void;
}

export const CrewBasicInfo: React.FC<Props> = ({
  edited, set, editing, ranks, countries, changeMap, manualOverride, onManualOverrideChange,
}) => {
  const rankOptions: Option[] = ranks.map(r => ({ value: String(r.id), label: `${r.rankName} (${r.rankCode})` }));
  const countryOptions: Option[] = countries.map(c => ({ value: String(c.id), label: c.countryName }));

  const optionsFor = (f: FieldDef): Option[] | undefined =>
    f.key === 'rankId' ? rankOptions
      : f.key === 'countryId' ? countryOptions
        : f.key === 'department' ? departmentOptions(edited.department)
          : f.options;

  /** Đổi chức danh thì gợi ý luôn bộ phận theo chức danh mới. Không tự đổi khi chỉ mở/lưu hồ sơ. */
  const changeRank = (raw: string) => {
    const rankId = raw ? Number(raw) : undefined;
    set('rankId', rankId);
    const dept = ranks.find(r => r.id === rankId)?.department;
    if (dept && dept.toUpperCase() !== (edited.department ?? '').toUpperCase()) set('department', dept);
  };

  const displayValue = (f: FieldDef): React.ReactNode => {
    const v = edited[f.key];
    if (f.kind === 'bool') return v ? 'Có' : 'Không';
    if (v === undefined || v === null || v === '') return null;
    if (f.kind === 'date') {
      const text = formatDateVi(String(v));
      if (f.key === 'dateOfBirth') {
        const age = calcAge(String(v));
        return age !== null ? <>{text} <span className="text-ink-muted">({age} tuổi)</span></> : text;
      }
      return text;
    }
    if (f.key === 'department') return departmentLabel(String(v));
    if (f.kind === 'select') return optionLabel(optionsFor(f), v);
    return f.unit ? `${v} ${f.unit}` : String(v);
  };

  const renderInput = (f: FieldDef, id: string, changed: boolean) => {
    const v = edited[f.key];
    const cls = `${fieldClass} ${changed ? 'border-red-400 bg-red-50' : ''}`;
    const locked = f.managed && !manualOverride;
    switch (f.kind) {
      case 'date':
        return <DateInput id={id} value={(v as string) ?? ''} disabled={locked} onChange={iso => set(f.key, iso)} />;
      case 'select': {
        const base = optionsFor(f) ?? [];
        const raw = v === undefined || v === null ? '' : String(v);
        // Giá trị đang lưu không khớp đúng chữ hoa/thường (vd. "MARRIED") thì giữ nguyên nó làm một
        // lựa chọn, để mở form rồi lưu không tự đổi dữ liệu.
        const opts = raw && !base.some(o => o.value === raw) ? [{ value: raw, label: optionLabel(base, raw) }, ...base] : base;
        return (
          <select id={id} className={cls} value={v === undefined || v === null ? '' : String(v)}
            onChange={e => {
              const raw = e.target.value;
              if (f.key === 'rankId') changeRank(raw);
              else if (f.key === 'countryId') set('countryId', raw ? Number(raw) : undefined);
              else set(f.key, raw);
            }}>
            <option value="">— Chọn —</option>
            {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        );
      }
      case 'number':
        return (
          <div className="relative">
            <input id={id} type="number" className={`${cls} ${f.unit ? 'pr-12' : ''}`} placeholder={f.placeholder}
              value={v === undefined || v === null ? '' : String(v)}
              onChange={e => set(f.key, e.target.value === '' ? undefined : Number(e.target.value))} />
            {f.unit && <span className="pointer-events-none absolute right-3 top-2 text-sm text-ink-muted">{f.unit}</span>}
          </div>
        );
      case 'textarea':
        return <textarea id={id} rows={4} className={cls} placeholder={f.placeholder} value={(v as string) ?? ''}
          onChange={e => set(f.key, e.target.value)} />;
      case 'bool':
        return (
          <label className="flex h-[38px] items-center gap-2 text-sm text-ink">
            <input id={id} type="checkbox" className="h-4 w-4 accent-primary" checked={!!v}
              onChange={e => set(f.key, e.target.checked)} />
            {v ? 'Có' : 'Không'}
          </label>
        );
      default:
        return <input id={id} type={f.kind === 'email' ? 'email' : 'text'} className={cls} placeholder={f.placeholder}
          value={(v as string) ?? ''} onChange={e => set(f.key, e.target.value)} />;
    }
  };

  const SPAN: Record<number, string> = { 1: '', 2: 'sm:col-span-2', 3: 'sm:col-span-2 lg:col-span-3', 4: 'sm:col-span-2 lg:col-span-4' };

  /*
    Mỗi trường là một ô có khung, lưới kẻ như tờ phiếu (nền khung + gap-px). Hàng cuối thiếu
    ô thì bù ô trống, để lưới không bị "hở" một mảng xám. Số ô bù tính riêng cho màn 2 cột
    và màn 4 cột.
  */
  const fillers = (spans: number[]) => {
    const used2 = spans.reduce((n, sp) => n + Math.min(sp, 2), 0);
    const used4 = spans.reduce((n, sp) => n + Math.min(sp, 4), 0);
    return { sm: (2 - (used2 % 2)) % 2, lg: (4 - (used4 % 4)) % 4 };
  };

  const labelCls = 'mb-1.5 flex items-center gap-1.5 text-xs font-medium text-ink-muted';
  const valueCls = 'min-h-[24px] whitespace-pre-line break-words text-[0.9375rem] leading-6';
  const cellCls = 'min-w-0 bg-surface px-4 py-3';

  return (
    <div className="flex flex-col gap-4">
      {SECTIONS.map(section => {
        const spans = section.fields.map(f => f.span ?? 1);
        const fill = fillers(spans);
        return (
          <section key={section.id} className="overflow-hidden rounded-lg border border-line bg-surface shadow-sm">
            <header className="flex items-center justify-between gap-3 border-b border-line bg-primary-soft px-4 py-3">
              <h2 className="text-base font-semibold text-primary">{section.title}</h2>
              {section.id === 'employment' && editing && (
                <div className="flex items-center gap-3">
                <button type="button" onClick={() => onManualOverrideChange(!manualOverride)}
                  className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium ${
                    manualOverride ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-line bg-surface text-ink-muted hover:text-primary'
                  }`}>
                  {manualOverride ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                  {manualOverride ? 'Đang sửa thủ công' : 'Sửa thủ công ngày lên/xuống tàu'}
                </button>
                </div>
              )}
            </header>

            {section.id === 'employment' && editing && manualOverride && (
              <div className="flex items-start gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  Ngày lên/xuống tàu bình thường được cập nhật qua quy trình gán lên tàu / phê duyệt rời tàu và sổ thuyền viên.
                  Chỉ sửa tay khi cần chỉnh lại ngày nhập sai. Trạng thái trên tàu không sửa ở đây được — dùng
                  "Gán lên tàu" / "Cho xuống tàu" ở Chi tiết tàu.
                </span>
              </div>
            )}

            <dl className="grid grid-cols-1 gap-px bg-line sm:grid-cols-2 lg:grid-cols-4">
              {section.fields.map(f => {
                const change = changeMap[f.key];
                const id = `crew-field-${f.key}`;
                const shown = displayValue(f);
                return (
                  <div key={f.key} className={`${cellCls} ${SPAN[f.span ?? 1]} ${change ? 'bg-red-50' : ''}`}>
                    <dt>
                      <label htmlFor={editing ? id : undefined} className={labelCls}>
                        {f.label}
                        {f.managed && <Lock className="h-3.5 w-3.5 text-ink-light" aria-label="Do quy trình quản lý" />}
                      </label>
                    </dt>
                    <dd>
                      {editing ? renderInput(f, id, !!change) : (
                        <div className={`${valueCls} ${change ? 'font-semibold text-red-800' : 'font-medium text-ink'}`}>
                          {shown ?? <span className="font-normal text-ink-light">—</span>}
                        </div>
                      )}
                      {change && (
                        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-red-700">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                          Tàu đã sửa: <s className="text-ink-light">{change.oldValue || '(trống)'}</s> → <strong>{change.newValue || '(trống)'}</strong>
                        </p>
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
