import { translateMessage as tx, messageLocale, useMessageLocale } from '@/i18n/messages'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from './ui'
import { vesselDate } from './time'
import type { WorkOrder } from './types'

export function GanttView({ orders, days, month, zone }: { orders: WorkOrder[]; days: number; month: string; zone: string }) {
  useMessageLocale()

  const frame = useRef<HTMLDivElement>(null), left = useRef<HTMLDivElement>(null), right = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  const [split, setSplit] = useState(55)
  const firstDue = orders.find(order => order.dueAt)?.dueAt
  useEffect(() => {
    if (!month || !right.current) return
    const today = vesselDate(new Date().toISOString(), zone)
    const focus = today.startsWith(month) ? today : firstDue ? vesselDate(firstDue, zone) : `${month}-01`
    right.current.scrollLeft = Math.max(0, (Number(focus.slice(-2)) - 4) * 40)
  }, [month, zone, firstDue])
  const syncScroll = (source: HTMLDivElement, target: HTMLDivElement | null) => {
    if (target && target.scrollTop !== source.scrollTop) target.scrollTop = source.scrollTop
  }
  const header = 'h-12 border-b border-r border-[#a3b1bc] bg-blue-50 px-2 text-center text-xs font-semibold text-gray-600'
  const cell = 'h-11 border-b border-r border-[#a3b1bc] px-2 text-xs text-gray-700'
  return <div ref={frame} className="flex min-h-0 flex-1 overflow-hidden border-t border-[#a3b1bc]" aria-label={tx("pmsRework.ganttChart")}>
    <div className="flex min-w-0 shrink-0 flex-col" style={{ width: `calc(${split}% - 3px)` }}>
      <div ref={left} className="min-h-0 flex-1 overflow-auto" aria-label={tx("pmsRework.ganttTaskTable")} tabIndex={0} onScroll={e => syncScroll(e.currentTarget, right.current)}>
        <table className="w-full min-w-[600px] table-fixed border-separate border-spacing-0"><colgroup>{[28, 17, 22, 19, 14].map((width, i) => <col key={i} style={{ width: `${width}%` }} />)}</colgroup>
          <thead className="sticky top-0 z-10"><tr>{[tx("pmsRework.jobName"), tx("pmsRework.completionDeadline"), tx("pmsRework.equipment"), tx("pmsRework.personInCharge"), tx("pmsRework.progress")].map(title => <th key={title} className={header}><span className="block whitespace-normal break-words">{title}</span></th>)}</tr></thead>
          <tbody>{orders.map((order, i) => <tr key={order.id} className={i % 2 ? 'bg-gray-50' : 'bg-white'}>
            <td className={cell}><Link className="block truncate text-blue-600 hover:underline" title={order.name} to={`/pms/work-orders/${order.id}`}>{order.name}</Link></td>
            <td className={`${cell} text-center`}>{order.dueAt ? new Intl.DateTimeFormat(messageLocale(), { timeZone: zone }).format(new Date(order.dueAt)) : '—'}</td>
            <td className={cell}><span className="block truncate" title={order.equipmentName}>{order.equipmentName || '—'}</span></td>
            <td className={cell}><span className="block truncate" title={order.assignedName}>{order.assignedName || tx("pmsRework.unassigned")}</span></td>
            <td className={`${cell} overflow-hidden whitespace-nowrap text-center`}><Badge value={order.status} /></td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
    <div role="separator" aria-orientation="vertical" aria-label={tx("pmsRework.resizeGanttTable")} aria-valuemin={25} aria-valuemax={80} aria-valuenow={split} tabIndex={0}
      title={tx("pmsRework.dragToResizeOrUseTheLeftAnd")}
      className="z-20 w-1.5 shrink-0 touch-none cursor-col-resize bg-slate-300 hover:bg-blue-400 focus:bg-blue-400 focus:outline-none"
      onPointerDown={e => { dragging.current = true; e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault() }}
      onPointerMove={e => { if (!dragging.current || !frame.current) return; const rect = frame.current.getBoundingClientRect(); setSplit(Math.max(25, Math.min(80, (e.clientX - rect.left) / rect.width * 100))) }}
      onPointerUp={e => { dragging.current = false; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId) }}
      onPointerCancel={() => { dragging.current = false }} onLostPointerCapture={() => { dragging.current = false }}
      onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setSplit(value => Math.max(25, Math.min(80, value + (e.key === 'ArrowLeft' ? -5 : 5)))) } }} onDoubleClick={() => setSplit(55)} />
    <div ref={right} className="min-h-0 min-w-0 flex-1 overflow-auto" aria-label={tx("pmsRework.ganttTimeline")} tabIndex={0} onScroll={e => syncScroll(e.currentTarget, left.current)}>
      <div className="min-h-full" style={{ width: days * 40, minWidth: '100%' }}>
        <div className="sticky top-0 z-10 flex h-12 bg-blue-50">{Array.from({ length: days }, (_, i) => {
          const day = `${month}-${String(i + 1).padStart(2, '0')}`
          const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
          return <div key={day} className={`flex h-12 w-10 shrink-0 flex-col items-center justify-center border-b border-r border-[#a3b1bc] text-xs ${weekday === 0 ? 'text-red-500' : 'text-gray-600'}`}><span className="font-semibold">{i + 1}</span><span>{new Intl.DateTimeFormat(messageLocale(), { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`))}</span></div>
        })}</div>
        {orders.map((order, i) => {
          const index = order.dueAt ? Number(vesselDate(order.dueAt, zone).slice(-2)) - 1 : 0
          return <div key={order.id} className={`relative h-11 border-b border-[#a3b1bc] bg-[linear-gradient(to_right,#a3b1bc_1px,transparent_1px)] bg-[length:40px_100%] ${i % 2 ? 'bg-gray-50' : 'bg-white'}`}>
            <Link to={`/pms/work-orders/${order.id}`} title={`${order.name} · ${order.assignedName || tx("pmsRework.unassigned")} · ${order.dueAt ? vesselDate(order.dueAt, zone) : ''}`} aria-label={tx("pmsRework.due141", { p0: order.name })} className="absolute top-3 h-5 w-8 rounded bg-blue-400 hover:bg-blue-500" style={{ left: index * 40 + 4 }} />
          </div>
        })}
      </div>
    </div>
  </div>
}
