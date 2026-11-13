import { translateMessage as tx } from '@/i18n/messages'
import { TouchNumberCombo, isWholeUnit } from './TouchNumberCombo'
import { input } from './ui'
import type { ExecutionChecklist, ExecutionResult } from './types'

type ChecklistValues = ExecutionResult['checklist']

// Old drafts may contain a reading entered through the formerly unconditional input.
export function normalizeChecklistReadings(items: ExecutionChecklist[], values: ChecklistValues): ChecklistValues {
  const readingIds = new Set(items.filter(item => item.requiresReading).map(item => item.id))
  return values.map(value => ({ ...value, reading: readingIds.has(value.id) ? value.reading : null }))
}

export function ExecutionChecklistTable({ items, values, touch, onChange }: {
  items: ExecutionChecklist[]
  values: ChecklistValues
  touch: boolean
  onChange: (values: ChecklistValues) => void
}) {
  const hasReadings = items.some(item => item.requiresReading)
  const update = (id: string, patch: Partial<ChecklistValues[number]>) =>
    onChange(values.map(value => value.id === id ? { ...value, ...patch } : value))

  return <div className="overflow-auto"><table className="w-full min-w-[700px] text-xs">
    <thead className="bg-blue-50"><tr>
      {[tx('pmsRework.description'), ...(hasReadings ? [tx('pmsRework.reading433')] : []), tx('pmsRework.notes'), tx('pmsRework.complete')].map(title =>
        <th key={title} className="border border-[#a3b1bc] p-2 text-center font-semibold">{title}</th>)}
    </tr></thead>
    <tbody>{items.map(item => {
      const value = values.find(value => value.id === item.id)!
      const hasRange = item.normalRangeMin != null || item.normalRangeMax != null
      return <tr key={item.id}>
        <td className="border border-[#a3b1bc] p-2">{item.checkpointDescription}
          {item.requiresReading && <span className="ml-1 text-red-500">*</span>}
          {item.requiresReading && (hasRange || item.unit) && <span className="block text-gray-400">
            {hasRange && <>{item.normalRangeMin ?? '—'} – {item.normalRangeMax ?? '—'} </>}{item.unit}
          </span>}
        </td>
        {hasReadings && <td className="w-40 border border-[#a3b1bc] p-2 text-center">
          {item.requiresReading ? touch ? <TouchNumberCombo
            label={tx('pmsRework.readingFor', { p0: item.checkpointDescription })}
            min={-Infinity} whole={isWholeUnit(item.unit)} value={value.reading}
            suggestions={[0, 1, 5, 10, ...(item.normalRangeMin != null ? [item.normalRangeMin] : []), ...(item.normalRangeMax != null ? [item.normalRangeMax] : [])]}
            onChange={reading => update(item.id, { reading: reading === '' ? null : Number(reading) })}
          /> : <input aria-label={tx('pmsRework.readingFor', { p0: item.checkpointDescription })}
            type="number" step="any" className={input} value={value.reading ?? ''}
            onChange={event => update(item.id, { reading: event.target.value === '' ? null : Number(event.target.value) })}
          /> : <span className="text-gray-400">—</span>}
        </td>}
        <td className="border border-[#a3b1bc] p-2"><input
          aria-label={tx('pmsRework.notesFor', { p0: item.checkpointDescription })} maxLength={1000}
          className={input} value={value.remarks} onChange={event => update(item.id, { remarks: event.target.value })}
        /></td>
        <td className="w-20 border border-[#a3b1bc] p-2 text-center align-middle"><input
          aria-label={tx('pmsRework.complete437', { p0: item.checkpointDescription })} className="block mx-auto"
          type="checkbox" checked={value.completed} onChange={event => update(item.id, { completed: event.target.checked })}
        /></td>
      </tr>
    })}</tbody>
  </table>{!items.length && <p className="p-3 text-xs text-gray-400">{tx('pmsRework.thisWOHasNoChecklistItems')}</p>}</div>
}
