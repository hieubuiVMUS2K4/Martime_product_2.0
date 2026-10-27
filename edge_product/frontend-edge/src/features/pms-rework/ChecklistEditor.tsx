import type { ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { ActionIcon, button, input } from './ui'
import type { ChecklistTemplate } from './types'
export function ChecklistEditor({ value, onChange, help }: { value: ChecklistTemplate[]; onChange: (value: ChecklistTemplate[]) => void; help?: ReactNode }) {
  const update = (index: number, patch: Partial<ChecklistTemplate>) => onChange(value.map((item, i) => i === index ? { ...item, ...patch } : item))
  return <div><div className="mb-2 flex items-center justify-between"><h3 className="flex items-center gap-1.5 text-sm font-medium">{help}Checklist mẫu</h3><button type="button" className={button} disabled={value.length >= 500} onClick={() => onChange([...value, { sequenceOrder: value.length + 1, checkpointDescription: '', requiresReading: false }])}><Plus size={14} />Thêm mục</button></div>
    <div className="overflow-auto"><table className="w-full min-w-[650px] text-xs"><thead className="bg-blue-50"><tr>{['STT', 'Nội dung kiểm tra', 'Cần số đo', 'Đơn vị', 'Min', 'Max', ''].map((s, i) => <th key={i} className="border border-[#a3b1bc] p-2 text-center font-semibold">{s}</th>)}</tr></thead><tbody>{value.map((item, i) => <tr key={i}>
      <td className="w-12 border border-[#a3b1bc] p-1 text-center">{i + 1}</td><td className="border border-[#a3b1bc] p-1"><input aria-label={`Nội dung mục ${i + 1}`} className={input} required maxLength={500} value={item.checkpointDescription} onChange={e => update(i, { checkpointDescription: e.target.value })} /></td>
      <td className="w-20 border border-[#a3b1bc] p-1 text-center"><input aria-label={`Mục ${i + 1} cần số đo`} type="checkbox" checked={item.requiresReading} onChange={e => update(i, { requiresReading: e.target.checked })} /></td>
      <td className="w-20 border border-[#a3b1bc] p-1"><input aria-label={`Đơn vị mục ${i + 1}`} className={input} maxLength={20} value={item.unit || ''} onChange={e => update(i, { unit: e.target.value })} /></td>
      {(['normalRangeMin', 'normalRangeMax'] as const).map(key => <td key={key} className="w-24 border border-[#a3b1bc] p-1"><input aria-label={`${key === 'normalRangeMin' ? 'Min' : 'Max'} mục ${i + 1}`} className={input} type="number" step="any" value={item[key] ?? ''} onChange={e => update(i, { [key]: e.target.value === '' ? null : Number(e.target.value) })} /></td>)}
      <td className="w-12 border border-[#a3b1bc] p-1"><ActionIcon label={`Xóa mục ${i + 1}`} icon={<Trash2 />} danger onClick={() => onChange(value.filter((_, n) => n !== i).map((c, n) => ({ ...c, sequenceOrder: n + 1 })))} /></td>
    </tr>)}</tbody></table>{!value.length && <p className="p-4 text-xs text-gray-400">Chưa có checklist mẫu.</p>}</div></div>
}
