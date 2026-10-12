import { useState, useEffect, useCallback, useRef } from 'react'
import { Package } from 'lucide-react'
import { DataTable, type Column } from '@/components/common/DataTable'
import { materialService } from '@/services/materialService'
import type { MaterialItem } from '@/types/maritime.types'
import { useTranslationSafe } from '@/contexts/I18nContext'

/**
 * Tab "Vật tư của tàu" (material_item_ship) — vật tư bờ cấp riêng cho tàu này (mã riêng của tàu, gán thiết bị).
 * Danh mục vật tư CHUNG của công ty nằm ở tab CompanyMaterialCatalogTab.
 */
export function MaterialCatalogTab() {
  const { t } = useTranslationSafe()
  const [items, setItems] = useState<(MaterialItem & { assignedEquipment: string })[]>([])
  const [loading, setLoading] = useState(true)
  const requestId = useRef(0)
  const [loadError, setLoadError] = useState('')
  const [linkError, setLinkError] = useState('')

  const load = useCallback(async (quiet = false) => {
    const request = ++requestId.current
    if (!quiet) setLoading(true)
    try {
      const [materials, assignments] = await Promise.allSettled([
        materialService.getItems({ onlyActive: true }), materialService.getAssignedEquipment(),
      ])
      if (request !== requestId.current) return
      if (materials.status === 'rejected') throw materials.reason
      const equipmentByMaterial = new Map<string, string[]>()
      if (assignments.status === 'fulfilled') {
        for (const link of assignments.value) {
          const names = equipmentByMaterial.get(link.materialItemId) ?? []
          names.push([link.equipmentCode, link.equipmentName].filter(Boolean).join(' — '))
          equipmentByMaterial.set(link.materialItemId, names)
        }
      }
      setLinkError(assignments.status === 'rejected' ? 'Không thể tải thiết bị đã gán. Vui lòng tải lại danh sách.' : '')
      setItems(materials.value.map(row => ({ ...row,
        assignedEquipment: (equipmentByMaterial.get(row.id) ?? []).join('; ') })))
      setLoadError('')
    } catch (e) {
      if (request === requestId.current) setLoadError(e instanceof Error ? e.message : 'Không thể tải danh mục vật tư.')
    } finally {
      if (request === requestId.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const refresh = () => { if (document.visibilityState === 'visible') void load(true) }
    const timer = window.setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      requestId.current++
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [load])


  type Row = MaterialItem & { assignedEquipment: string }

  const columns: Column<Row>[] = [
    { key: 'code', header: t('materials.catalog.colCode'), width: 190, value: r => r.itemCode, className: 'font-mono text-xs font-medium' },
    { key: 'name', header: t('materials.catalog.colName'), value: r => r.name },
    { key: 'part', header: 'Mã phụ tùng', width: 160, value: r => r.partNumber ?? '', className: 'font-mono text-xs',
      render: r => r.partNumber || <span className="text-gray-400">—</span> },
    {
      key: 'equipment', header: 'Thuộc thiết bị', value: r => (linkError ? '' : r.assignedEquipment),
      filter: r => (linkError ? 'Chưa tải được liên kết' : r.assignedEquipment || '(Chưa gán thiết bị)'),
      render: r => linkError
        ? <span className="text-amber-700">Chưa tải được liên kết</span>
        : r.assignedEquipment || <span className="text-gray-400">—</span>,
    },
    { key: 'unit', header: 'Đơn vị tính', width: 110, align: 'center', value: r => r.unit ?? '', render: r => r.unit || '—' },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      {loadError && <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{loadError}</p>}
      {linkError && <p role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">{linkError}</p>}
      <DataTable
        flush
        columns={columns}
        data={items}
        rowKey={r => r.id}
        loading={loading && items.length === 0}
        itemLabel="vật tư"
        emptyMessage={items.length === 0 ? 'Tàu chưa có vật tư riêng nào (bờ chưa cấp / chưa đồng bộ nhóm Thông tin & vật tư tàu).' : t('materials.catalog.emptyFiltered')}
        searchPlaceholder="Tìm mã, tên vật tư, mã phụ tùng, thiết bị..."
        exportOptions={{ fileName: 'vat-tu-cua-tau', title: 'VẬT TƯ CỦA TÀU' }}
        minWidth={1000}
        toolbarTitle={
          <span className="flex items-center gap-2">
            <Package className="h-4 w-4 text-blue-600" aria-hidden="true" />
            <span className="text-sm font-semibold text-gray-700">Vật tư của tàu</span>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">{items.length}</span>
            <span className="text-xs italic text-gray-400">{t('materials.catalog.syncNote')}</span>
          </span>
        }
      />
    </div>
  )
}
