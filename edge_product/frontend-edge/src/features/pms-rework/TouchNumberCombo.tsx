import { useDragScroll } from './useDragScroll'
import { useEffect, useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { input } from './ui'

// Counting units use whole values; physical measurements retain decimal precision.
export const isWholeUnit = (unit?: string) => /^(pcs?|pieces?|cái|chiếc|bộ|set|sets|lần|count|min|phút|s|sec|giây)$/i.test(unit?.trim() || '')

export function TouchNumberCombo({ value, onChange, label, whole = false, suggestions = [], min = 0 }: {
  value: number | string | null; onChange: (value: string) => void; label: string;
  whole?: boolean; suggestions?: number[]; min?: number;
}) {
  const [text, setText] = useState(String(value ?? '')), [open, setOpen] = useState(false), [active, setActive] = useState(0)
  const id = useId()
  const dragScroll = useDragScroll()
  useEffect(() => { setText(current => Number(current.replace(',', '.')) === Number(value) && current !== '' && value !== null ? current : String(value ?? '')) }, [value])
  const values = [...new Set(suggestions.filter(n => Number.isFinite(n) && n >= min && (!whole || Number.isInteger(n))))].sort((a, b) => a - b)
  const choose = (n: number) => { setText(String(n)); onChange(String(n)); setOpen(false) }
  return <div className="touch-number-combo" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false) }}>
    <input className={input} type="text" role="combobox" inputMode={whole ? 'numeric' : 'decimal'} aria-label={label} aria-expanded={open} aria-controls={id} aria-autocomplete="list" aria-activedescendant={open && values[active] !== undefined ? `${id}-${active}` : undefined}
      value={text} onClick={() => setOpen(true)} onChange={e => {
        const next = e.target.value.replace(',', '.')
        if (!(whole ? /^\d*$/ : /^-?\d*\.?\d*$/).test(next) || (min >= 0 && next.startsWith('-'))) return
        setText(e.target.value)
        if (next === '') onChange('')
        else if (Number.isFinite(Number(next))) onChange(String(Number(next)))
        else onChange('')
      }} onKeyDown={e => {
        if (e.key === 'Escape') { e.stopPropagation(); setOpen(false) }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setOpen(true); setActive(n => Math.max(0, Math.min(values.length - 1, n + (e.key === 'ArrowDown' ? 1 : -1)))) }
        if (e.key === 'Enter' && open && values[active] !== undefined) { e.preventDefault(); choose(values[active]) }
      }} />
    <button type="button" aria-label={label} aria-expanded={open} onClick={() => { setActive(0); setOpen(v => !v) }}><ChevronDown size={22} /></button>
    {open && values.length > 0 && <div id={id} role="listbox" aria-label={label} className="touch-number-options" {...dragScroll} onMouseDown={e => e.preventDefault()}>
      {values.map((n, i) => <button type="button" id={`${id}-${i}`} role="option" aria-selected={Number(text.replace(',', '.')) === n && text !== ''} key={n} onMouseEnter={() => setActive(i)} onClick={() => choose(n)}>{n.toLocaleString(undefined, { maximumFractionDigits: 6 })}</button>)}
    </div>}
  </div>
}
