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
  - Ngày lên/xuống tàu và trạng thái trên tàu do quy trình quản lý: chỉ sửa khi bật "Sửa thủ công".
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
        const opts = optionsFor(f) ?? [];
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

  return (
    <div className="flex flex-col gap-3">
      {SECTIONS.map(section => (
        <section key={section.id} className="rounded-lg border border-line bg-surface">
          <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-2.5">
            <h2 className="text-sm font-semibold text-primary">{section.title}</h2>
            {section.id === 'employment' && editing && (
              <button type="button" onClick={() => onManualOverrideChange(!manualOverride)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${
                  manualOverride ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-line text-ink-muted hover:bg-primary-soft'
                }`}>
                {manualOverride ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                {manualOverride ? 'Đang sửa thủ công' : 'Sửa thủ công ngày lên/xuống tàu'}
              </button>
            )}
          </header>

          {section.id === 'employment' && editing && manualOverride && (
            <div className="mx-5 mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                Ngày lên/xuống tàu và trạng thái trên tàu bình thường được cập nhật qua quy trình gán lên tàu / duyệt xuống tàu
                và sổ thuyền viên. Chỉ sửa tay khi cần chỉnh lại dữ liệu nhập sai.
              </span>
            </div>
          )}

          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 px-5 py-4 sm:grid-cols-2 lg:grid-cols-4">
            {section.fields.map(f => {
              const change = changeMap[f.key];
              const id = `crew-field-${f.key}`;
              const shown = displayValue(f);
              return (
                <div key={f.key} className={`min-w-0 ${SPAN[f.span ?? 1]}`}>
                  <dt>
                    <label htmlFor={editing ? id : undefined} className="mb-1 flex items-center gap-1.5 text-[13px] text-ink-muted">
                      {f.label}
                      {f.managed && <Lock className="h-3 w-3 text-ink-light" aria-label="Do quy trình quản lý" />}
                    </label>
                  </dt>
                  <dd>
                    {editing ? renderInput(f, id, !!change) : (
                      <div className={`min-h-[22px] whitespace-pre-line break-words text-sm ${
                        change ? 'rounded bg-red-50 px-1.5 font-semibold text-red-800 ring-1 ring-red-300' : 'text-ink'
                      }`}>
                        {shown ?? <span className="text-ink-light">—</span>}
                      </div>
                    )}
                    {change && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-red-700">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                        Tàu đã sửa: <s className="text-ink-light">{change.oldValue || '(trống)'}</s> → <strong>{change.newValue || '(trống)'}</strong>
                      </p>
                    )}
                  </dd>
                </div>
              );
            })}

            {section.id === 'employment' && (
              <div className="min-w-0">
                <dt className="mb-1 flex items-center gap-1.5 text-[13px] text-ink-muted">
                  Trạng thái trên tàu <Lock className="h-3 w-3 text-ink-light" aria-label="Do quy trình quản lý" />
                </dt>
                <dd>
                  {editing && manualOverride ? (
                    <label className="flex h-[38px] items-center gap-2 text-sm text-ink">
                      <input type="checkbox" className="h-4 w-4 accent-primary" checked={!!edited.isOnboard}
                        onChange={e => set('isOnboard', e.target.checked)} />
                      Đang ở trên tàu
                    </label>
                  ) : (
                    <span className="text-sm text-ink">{edited.isOnboard ? 'Đang ở trên tàu' : 'Ở bờ'}</span>
                  )}
                </dd>
              </div>
            )}
          </dl>
        </section>
      ))}
    </div>
  );
};
