import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Search, Package, RefreshCw } from 'lucide-react'
import { materialService } from '@/services/materialService'
import type { MaterialItem } from '@/types/maritime.types'
import { useTranslationSafe } from '@/contexts/I18nContext'

/**
 * Tab "Danh mục vật tư của công ty" (material_items) — chỉ đọc.
 * Dữ liệu đồng bộ từ Shore xuống tàu, tàu không chỉnh sửa.
 */
export function MaterialCatalogTab() {
  const { t } = useTranslationSafe()
  const [items, setItems] = useState<(MaterialItem & { assignedEquipment: string })[]>([])
  const [loading, setLoading] = useState(true)
  const requestId = useRef(0)
  const [loadError, setLoadError] = useState('')
  const [linkError, setLinkError] = useState('')
  const [searchCode, setSearchCode] = useState('')
  const [searchName, setSearchName] = useState('')
  const [searchPartNumber, setSearchPartNumber] = useState('')
  const [searchEquipment, setSearchEquipment] = useState('')

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


  const filtered = useMemo(() => items.filter(i => {
    if (searchCode && !i.itemCode.toLowerCase().includes(searchCode.toLowerCase())) return false
    if (searchName && !i.name.toLowerCase().includes(searchName.toLowerCase())) return false
    if (searchPartNumber && !(i.partNumber ?? '').toLowerCase().includes(searchPartNumber.toLowerCase())) return false
    if (searchEquipment && !i.assignedEquipment.toLowerCase().includes(searchEquipment.toLowerCase())) return false
    return true
  }), [items, searchCode, searchName, searchPartNumber, searchEquipment])

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-3" />
        <p>{t('materials.catalog.loading')}</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-semibold text-gray-700">{t('materials.catalog.title')}</span>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">{filtered.length}</span>
          <span className="text-xs text-gray-400 italic">{t('materials.catalog.syncNote')}</span>
        </div>
        <button onClick={() => void load()} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50">
          <RefreshCw className="w-3.5 h-3.5" /> {t('materials.catalog.reload')}
        </button>
      </div>

      {loadError && <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{loadError}</p>}
      {linkError && <p role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">{linkError}</p>}
      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="min-w-full text-sm border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-blue-50">
              <th className="w-12 px-2 py-2 text-center text-xs font-semibold text-gray-600 border-b border-r border-gray-200">{t('materials.catalog.colNo')}</th>
              <th className="w-40 px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-r border-gray-200">{t('materials.catalog.colCode')}</th>
              <th className="min-w-[240px] px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-r border-gray-200">{t('materials.catalog.colName')}</th>
              <th className="w-40 px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-r border-gray-200">Mã phụ tùng</th>
              <th className="min-w-[260px] px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-r border-gray-200">Thuộc thiết bị</th>
              <th className="w-28 px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-gray-200">Đơn vị tính</th>
            </tr>
            <tr className="bg-white border-b border-gray-200">
              <th className="border-r border-gray-200"></th>
              <th className="px-2 py-1 border-r border-gray-200">
                <div className="flex items-center gap-0.5 border border-gray-200 rounded px-1.5 py-0.5">
                  <input value={searchCode} onChange={e => setSearchCode(e.target.value)} placeholder={t('materials.catalog.searchCode')} className="flex-1 text-xs outline-none min-w-0 bg-transparent" />
                  <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
                </div>
              </th>
              <th className="px-2 py-1 border-r border-gray-200">
                <div className="flex items-center gap-0.5 border border-gray-200 rounded px-1.5 py-0.5">
                  <input value={searchName} onChange={e => setSearchName(e.target.value)} placeholder={t('materials.catalog.searchName')} className="flex-1 text-xs outline-none min-w-0 bg-transparent" />
                  <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
                </div>
              </th>
              <th className="px-2 py-1 border-r border-gray-200"><input aria-label="Lọc mã phụ tùng" value={searchPartNumber} onChange={e => setSearchPartNumber(e.target.value)} placeholder="Tìm kiếm" className="w-full text-xs outline-none border border-gray-200 rounded px-1.5 py-0.5" /></th>
              <th className="px-2 py-1 border-r border-gray-200"><input aria-label="Lọc thiết bị" value={searchEquipment} onChange={e => setSearchEquipment(e.target.value)} placeholder="Tìm kiếm" className="w-full text-xs outline-none border border-gray-200 rounded px-1.5 py-0.5" /></th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p>{items.length === 0 ? t('materials.catalog.emptyNotSynced') : t('materials.catalog.emptyFiltered')}</p>
                </td>
              </tr>
            ) : filtered.map((i, idx) => (
              <tr key={i.id} className={idx % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'}>
                <td className="w-12 px-2 py-2 text-center text-xs text-gray-500 border-r border-gray-200">{idx + 1}</td>
                <td className="w-40 px-3 py-2 text-xs font-mono font-medium text-gray-900 border-r border-gray-200">{i.itemCode}</td>
                <td className="min-w-[240px] px-3 py-2 text-xs text-gray-900 border-r border-gray-200">{i.name}</td>
                <td className="px-3 py-2 text-xs font-mono text-gray-700 border-r border-gray-200">{i.partNumber || '—'}</td>
                <td className="px-3 py-2 text-xs text-gray-700 border-r border-gray-200">{linkError ? 'Chưa tải được liên kết' : i.assignedEquipment || '—'}</td>
                <td className="w-28 px-3 py-2 text-xs text-gray-700">{i.unit || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
