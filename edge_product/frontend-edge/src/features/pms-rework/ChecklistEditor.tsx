import { translateMessage as tx, useMessageLocale } from '@/i18n/messages'
import type { ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { ActionIcon, button, input } from './ui'
import type { ChecklistTemplate } from './types'
import { MeasurementUnitSelect } from './MeasurementUnitSelect'
export function ChecklistEditor({ value, onChange, help }: { value: ChecklistTemplate[]; onChange: (value: ChecklistTemplate[]) => void; help?: ReactNode }) {
  useMessageLocale()

  const update = (index: number, patch: Partial<ChecklistTemplate>) => onChange(value.map((item, i) => i === index ? { ...item, ...patch } : item))
  return <div><div className="mb-2 flex items-center justify-between"><h3 className="flex items-center gap-1.5 text-sm font-medium">{help}{tx("pmsRework.checklistTemplate")}</h3><button type="button" className={button} disabled={value.length >= 500} onClick={() => onChange([...value, { sequenceOrder: value.length + 1, checkpointDescription: '', requiresReading: false }])}><Plus size={14} />{tx("pmsRework.addItem")}</button></div>
    <div className="overflow-auto"><table className="w-full min-w-[650px] text-xs"><thead className="bg-blue-50"><tr>{[tx("pmsRework.no"), tx("pmsRework.checkItem"), tx("pmsRework.readingRequired"), tx("pmsRework.unit"), tx("pmsRework.min"), tx("pmsRework.max"), ''].map((s, i) => <th key={i} className="border border-[#a3b1bc] p-2 text-center font-semibold">{s}</th>)}</tr></thead><tbody>{value.map((item, i) => <tr key={i}>
      <td className="w-12 border border-[#a3b1bc] p-1 text-center">{i + 1}</td><td className="border border-[#a3b1bc] p-1"><input aria-label={tx("pmsRework.itemDescription", { p0: i + 1 })} className={input} required maxLength={500} value={item.checkpointDescription} onChange={e => update(i, { checkpointDescription: e.target.value })} /></td>
      <td className="w-20 border border-[#a3b1bc] p-1 text-center"><input aria-label={tx("pmsRework.itemRequiresAReading", { p0: i + 1 })} type="checkbox" checked={item.requiresReading} onChange={e => update(i, { requiresReading: e.target.checked })} /></td>
      <td className="w-36 border border-[#a3b1bc] p-1"><MeasurementUnitSelect label={tx("pmsRework.itemUnit", { p0: i + 1 })} value={item.unit} onChange={unit => update(i, { unit })} /></td>
      {(['normalRangeMin', 'normalRangeMax'] as const).map(key => <td key={key} className="w-24 border border-[#a3b1bc] p-1"><input aria-label={tx("pmsRework.item", { p0: key === 'normalRangeMin' ? tx("pmsRework.min") : tx("pmsRework.max"), p1: i + 1 })} className={input} type="number" step="any" value={item[key] ?? ''} onChange={e => update(i, { [key]: e.target.value === '' ? null : Number(e.target.value) })} /></td>)}
      <td className="w-12 border border-[#a3b1bc] p-1"><ActionIcon label={tx("pmsRework.deleteItem", { p0: i + 1 })} icon={<Trash2 />} danger onClick={() => onChange(value.filter((_, n) => n !== i).map((c, n) => ({ ...c, sequenceOrder: n + 1 })))} /></td>
    </tr>)}</tbody></table>{!value.length && <p className="p-4 text-xs text-gray-400">{tx("pmsRework.noChecklistTemplateYet")}</p>}</div></div>
}
