import React from 'react'
import { AlertTriangle, Check, Lock, Unlock } from 'lucide-react'
import type { CrewMember } from '../../../types/maritime.types'
import {
  SECTIONS, calcAge, departmentLabel, departmentOptions, formatDateVi, optionLabel,
  type FieldDef, type FieldKey, type Option,
} from './crewProfileFields'

/*
  Tab "Thông tin cơ bản" của hồ sơ thuyền viên trên tàu — cùng bố cục với bờ, theme của tàu.

  - Chế độ xem (mặc định): nhãn — giá trị, không có ô nhập để lỡ tay sửa. Bấm "Sửa hồ sơ" mới thành ô nhập.
  - Một lưới 4 cột chung cho mọi nhóm; trường dài (địa chỉ, ghi chú) chiếm trọn hàng.
  - Trường BỜ vừa sửa được tô đỏ kèm "Bờ đã sửa: cũ → mới" ở cả hai chế độ.
  - Thuyền viên chờ duyệt: mỗi nhóm có ô "Đã kiểm tra" trên tiêu đề (bảng kiểm tra duyệt).
*/

type Ref = { id: number; rankName?: string; rankCode?: string; department?: string; countryName?: string }

interface Props {
  edited: Partial<CrewMember>
  set: (key: FieldKey, value: unknown) => void
  editing: boolean
  ranks: Ref[]
  countries: Ref[]
  /** Trường bờ đã sửa: key camelCase → { old, new }. */
  changeMap: Record<string, { old: string; new: string }>
  manualOverride: boolean
  onManualOverrideChange: (on: boolean) => void
  /** Đang duyệt thuyền viên: hiện ô "Đã kiểm tra" trên mỗi nhóm. */
  reviewing: boolean
  checklist: Record<string, boolean>
  onToggleCheck: (keys: string[], checked: boolean) => void
}

const inputCls = 'w-full rounded border px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:bg-gray-50'

export const CrewBasicInfo: React.FC<Props> = ({
  edited, set, editing, ranks, countries, changeMap, manualOverride, onManualOverrideChange, reviewing, checklist, onToggleCheck,
}) => {
  const rankOptions: Option[] = ranks.map(r => ({ value: String(r.id), label: `${r.rankName ?? ''} (${r.rankCode ?? ''})` }))
  const countryOptions: Option[] = countries.map(c => ({ value: String(c.id), label: c.countryName ?? '' }))

  const optionsFor = (f: FieldDef): Option[] | undefined =>
    f.key === 'rankId' ? rankOptions
      : f.key === 'countryId' ? countryOptions
        : f.key === 'department' ? departmentOptions(edited.department)
          : f.options

  /** Đổi chức danh thì gợi ý luôn bộ phận theo chức danh mới. */
  const changeRank = (raw: string) => {
    const rankId = raw ? Number(raw) : undefined
    set('rankId', rankId)
    const dept = ranks.find(r => r.id === rankId)?.department
    if (dept && dept.toUpperCase() !== (edited.department ?? '').toUpperCase()) set('department', dept)
  }

  const value = (key: FieldKey) => (edited as Record<string, unknown>)[key]

  const displayValue = (f: FieldDef): React.ReactNode => {
    const v = value(f.key)
    if (f.kind === 'bool') return v ? 'Có' : 'Không'
    if (v === undefined || v === null || v === '') return null
    if (f.kind === 'date') {
      const text = formatDateVi(String(v))
      if (f.key === 'dateOfBirth') {
        const age = calcAge(String(v))
        return age !== null ? <>{text} <span className="text-gray-500">({age} tuổi)</span></> : text
      }
      return text
    }
    if (f.key === 'department') return departmentLabel(String(v))
    if (f.kind === 'select') return optionLabel(optionsFor(f), v)
    return f.unit ? `${v} ${f.unit}` : String(v)
  }

  const renderInput = (f: FieldDef, id: string, changed: boolean) => {
    const v = value(f.key)
    const cls = `${inputCls} ${changed ? 'border-red-400 bg-red-50 focus:ring-red-400' : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'}`
    const locked = f.managed && !manualOverride
    switch (f.kind) {
      case 'date':
        return <input id={id} type="date" className={cls} disabled={locked} value={v ? String(v).split('T')[0] : ''}
          onChange={e => set(f.key, e.target.value || undefined)} />
      case 'select': {
        const base = optionsFor(f) ?? []
        const raw = v === undefined || v === null ? '' : String(v)
        const opts = raw && !base.some(o => o.value === raw) ? [{ value: raw, label: optionLabel(base, raw) }, ...base] : base
        return (
          <select id={id} className={cls} value={raw}
            onChange={e => {
              const next = e.target.value
              if (f.key === 'rankId') changeRank(next)
              else if (f.key === 'countryId') set('countryId', next ? Number(next) : undefined)
              else set(f.key, next)
            }}>
            <option value="">— Chọn —</option>
            {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        )
      }
      case 'number':
        return (
          <div className="relative">
            <input id={id} type="number" className={`${cls} ${f.unit ? 'pr-12' : ''}`} placeholder={f.placeholder}
              value={v === undefined || v === null ? '' : String(v)}
              onChange={e => set(f.key, e.target.value === '' ? undefined : Number(e.target.value))} />
            {f.unit && <span className="pointer-events-none absolute right-3 top-1.5 text-sm text-gray-400">{f.unit}</span>}
          </div>
        )
      case 'textarea':
        return <textarea id={id} rows={4} className={cls} placeholder={f.placeholder} value={(v as string) ?? ''}
          onChange={e => set(f.key, e.target.value)} />
      case 'bool':
        return (
          <label className="flex h-[34px] items-center gap-2 text-sm text-gray-900">
            <input id={id} type="checkbox" className="h-4 w-4 accent-blue-600" checked={!!v}
              onChange={e => set(f.key, e.target.checked)} />
            {v ? 'Có' : 'Không'}
          </label>
        )
      default:
        return <input id={id} type={f.kind === 'email' ? 'email' : 'text'} className={cls} placeholder={f.placeholder}
          value={(v as string) ?? ''} onChange={e => set(f.key, e.target.value)} />
    }
  }

  const SPAN: Record<number, string> = { 1: '', 2: 'sm:col-span-2', 3: 'sm:col-span-2 lg:col-span-3', 4: 'sm:col-span-2 lg:col-span-4' }

  /** Hàng cuối thiếu ô thì bù ô trống để lưới kẻ không bị hở. */
  const fillers = (spans: number[]) => {
    const used2 = spans.reduce((n, sp) => n + Math.min(sp, 2), 0)
    const used4 = spans.reduce((n, sp) => n + Math.min(sp, 4), 0)
    return { sm: (2 - (used2 % 2)) % 2, lg: (4 - (used4 % 4)) % 4 }
  }

  return (
    <div className="flex flex-col gap-4">
      {SECTIONS.map(section => {
        const fill = fillers(section.fields.map(f => f.span ?? 1))
        const checked = section.reviewKeys.length > 0 && section.reviewKeys.every(k => checklist[k])
        return (
          <section key={section.id} className={`overflow-hidden rounded-lg border bg-white ${reviewing && checked ? 'border-green-300' : 'border-gray-200'}`}>
            <header className="flex items-center justify-between gap-3 border-b border-gray-200 bg-blue-50 px-4 py-2.5">
              <h2 className="text-sm font-semibold text-blue-700">{section.title}</h2>
              <div className="flex items-center gap-3">
                {section.id === 'employment' && editing && (
                  <button type="button" onClick={() => onManualOverrideChange(!manualOverride)}
                    className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs font-medium ${
                      manualOverride ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-gray-300 bg-white text-gray-600 hover:text-blue-700'
                    }`}>
                    {manualOverride ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                    {manualOverride ? 'Đang sửa thủ công' : 'Sửa thủ công ngày lên/xuống tàu'}
                  </button>
                )}
                {reviewing && section.reviewKeys.length > 0 && (
                  <label className={`inline-flex cursor-pointer select-none items-center gap-1.5 text-xs font-medium ${checked ? 'text-green-700' : 'text-gray-500'}`}>
                    <input type="checkbox" className="h-4 w-4 accent-green-600" checked={checked}
                      onChange={e => onToggleCheck(section.reviewKeys, e.target.checked)} />
                    {checked ? <><Check className="h-3.5 w-3.5" />Đã kiểm tra</> : 'Đánh dấu đã kiểm tra'}
                  </label>
                )}
              </div>
            </header>

            {section.id === 'employment' && editing && manualOverride && (
              <div className="flex items-start gap-2 border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Ngày lên/xuống tàu bình thường được cập nhật qua duyệt lên tàu / đề nghị rời tàu và sổ thuyền viên. Chỉ sửa tay khi cần chỉnh lại ngày nhập sai.</span>
              </div>
            )}

            <dl className="grid grid-cols-1 gap-px bg-gray-200 sm:grid-cols-2 lg:grid-cols-4">
              {section.fields.map(f => {
                const change = changeMap[f.key]
                const id = `crew-field-${f.key}`
                const shown = displayValue(f)
                return (
                  <div key={f.key} className={`min-w-0 px-4 py-3 ${SPAN[f.span ?? 1]} ${change ? 'bg-red-50' : 'bg-white'}`}>
                    <dt>
                      <label htmlFor={editing ? id : undefined} className="mb-1 flex items-center gap-1.5 text-xs font-medium text-gray-500">
                        {f.label}
                        {f.managed && <Lock className="h-3 w-3 text-gray-400" aria-label="Do quy trình quản lý" />}
                      </label>
                    </dt>
                    <dd>
                      {editing ? renderInput(f, id, !!change) : (
                        <div className={`min-h-[22px] whitespace-pre-line break-words text-sm ${change ? 'font-semibold text-red-800' : 'font-medium text-gray-900'}`}>
                          {shown ?? <span className="font-normal text-gray-400">—</span>}
                        </div>
                      )}
                      {change && (
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-red-700">
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                          Bờ đã sửa: <s className="text-gray-400">{change.old || '(trống)'}</s> → <strong>{change.new || '(trống)'}</strong>
                        </p>
                      )}
                    </dd>
                  </div>
                )
              })}
              {Array.from({ length: fill.sm }, (_, i) => <div key={`sm${i}`} aria-hidden="true" className="hidden bg-white sm:block lg:hidden" />)}
              {Array.from({ length: fill.lg }, (_, i) => <div key={`lg${i}`} aria-hidden="true" className="hidden bg-white lg:block" />)}
            </dl>
          </section>
        )
      })}
    </div>
  )
}
