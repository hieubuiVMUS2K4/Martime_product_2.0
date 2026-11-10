import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, ClipboardList, FolderOpen } from 'lucide-react'
import { useTranslationSafe } from '@/contexts/I18nContext'
import { useEquipment } from './Forms'
import { Orders } from './Planning'
import WorkOrderPage from './WorkOrderPage'
import { ErrorBox } from './ui'
import type { EquipmentNode } from './types'
import './execute-work-orders.css'

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase()

export default function ExecuteWorkOrders() {
  const { t } = useTranslationSafe()
  const equipment = useEquipment()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [treeOpen, setTreeOpen] = useState(false)
  const tree = useMemo(() => {
    const rows = equipment.data || []
    const byId = new Map(rows.map(row => [row.id, row]))
    const children = new Map<string, EquipmentNode[]>()
    const visible = new Set<string>()
    const term = normalize(search.trim())
    for (const row of rows) {
      const parent = row.parentId && byId.has(row.parentId) ? row.parentId : ''
      children.set(parent, [...(children.get(parent) || []), row])
      if (term && !normalize(`${row.assetCode} ${row.assetName}`).includes(term)) continue
      let ancestor: EquipmentNode | undefined = row
      const visited = new Set<string>()
      while (ancestor && !visited.has(ancestor.id)) {
        visited.add(ancestor.id)
        visible.add(ancestor.id)
        ancestor = ancestor.parentId ? byId.get(ancestor.parentId) : undefined
      }
    }
    return { children, visible }
  }, [equipment.data, search])
  const selectionKey = [...selected].sort().join(',')
  const toggle = (id: string) => setSelected(previous => {
    const next = new Set(previous)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const visited = new Set<string>()
  const render = (parent: string, depth: number): React.ReactNode => tree.children.get(parent)?.map(row => {
    if (!tree.visible.has(row.id) || visited.has(row.id)) return null
    visited.add(row.id)
    const hasChildren = !!tree.children.get(row.id)?.length
    const open = !!search || expanded.has(row.id)
    return <div key={row.id}>
      <div className="execute-equipment-row" style={{ paddingLeft: 8 + depth * 20 }}>
        {hasChildren ? <button type="button" aria-label={row.assetName} aria-expanded={open} onClick={() => setExpanded(previous => {
          const next = new Set(previous)
          next.has(row.id) ? next.delete(row.id) : next.add(row.id)
          return next
        })}>{open ? <ChevronDown /> : <ChevronRight />}</button> : <span className="execute-tree-spacer" />}
        <label title={`${row.assetCode} · ${row.assetName}`}>
          <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} />
          <FolderOpen aria-hidden="true" />
          <span>{row.assetName}</span>
        </label>
      </div>
      {open && render(row.id, depth + 1)}
    </div>
  })
  return <div className="execute-work-orders execute-work-orders-list">
    <button className="execute-tree-toggle" type="button" aria-expanded={treeOpen} aria-controls="execute-equipment" onClick={() => setTreeOpen(!treeOpen)}><FolderOpen />{t('pmsRework.allEquipment')}<ChevronDown /></button>
    <aside id="execute-equipment" className="execute-equipment" data-open={treeOpen}>
      <header><FolderOpen />{t('pmsRework.allEquipment')}</header>
      <div className="execute-equipment-search"><input type="search" aria-label={t('pmsRework.searchEquipment')} placeholder={t('pmsRework.searchEquipment')} value={search} onChange={event => setSearch(event.target.value)} /></div>
      <label className="execute-all-equipment"><input type="checkbox" checked={!selected.size} onChange={() => setSelected(new Set())} />{t('pmsRework.allEquipment')}</label>
      <div className="execute-equipment-nodes">
        {equipment.error ? <ErrorBox error={equipment.error} retry={() => void equipment.refetch()} /> : equipment.isLoading ? <p>{t('pmsRework.loading')}</p> : render('', 0)}
        {!equipment.isLoading && !equipment.error && !tree.visible.size && <p>{t('pmsRework.noMatchingData')}</p>}
      </div>
    </aside>
    <main className="execute-orders-main"><header><ClipboardList />Execute Work Order</header><Orders key={selectionKey} equipmentAssetIds={selectionKey} executionOnly /></main>
  </div>
}

export function ExecuteWorkOrderDetail({ mode = 'view' }: { mode?: 'view' | 'execute' }) {
  return <div className={`execute-work-orders execute-work-orders-detail ${mode === 'execute' ? 'execute-work-orders-working' : ''}`}><WorkOrderPage mode={mode} /></div>
}
