import { useState, useEffect, useCallback } from 'react'
import { MapPin, Info } from 'lucide-react'
import { toast } from 'sonner'
import { voyageMgmtService } from '@/services/voyage.service'
import type { Port } from '@/types/voyage.types'
import { useTranslationSafe } from '@/contexts/I18nContext'
import { DataTable, type Column } from '@/components/common/DataTable'

/**
 * Danh mục cảng — CHỈ ĐỌC tại tàu. Bờ làm chủ danh mục (thêm/sửa/ngừng dùng trên Shore)
 * và phát xuống tàu qua đồng bộ; API tạo/sửa/xoá cảng của Edge đã bị khoá.
 * Danh mục chỉ vài trăm cảng nên tải hết một lần, bảng tự tìm / lọc / phân trang.
 */
export function PortManagementPage() {
  const { t } = useTranslationSafe()
  const [ports, setPorts] = useState<Port[]>([])
  const [loading, setLoading] = useState(true)

  const loadPorts = useCallback(async () => {
    try {
      setLoading(true)
      const result = await voyageMgmtService.ports.search({ isActive: true, page: 1, pageSize: 100000 })
      setPorts(result.data)
    } catch (err: any) {
      toast.error('Không tải được danh mục cảng: ' + (err.message || 'Lỗi không xác định'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPorts() }, [loadPorts])

  const coord = (v?: number | null) => (v != null ? v.toFixed(4) : '')
  const dash = (v?: string | null) => v || <span className="text-gray-400">—</span>

  const columns: Column<Port>[] = [
    {
      key: 'portCode', header: t('voyage.portMgmt.code'), width: 120, value: p => p.portCode,
      render: p => <span className="rounded bg-blue-50 px-2 py-0.5 font-mono font-semibold text-blue-700">{p.portCode}</span>,
    },
    { key: 'portName', header: t('voyage.portMgmt.portName'), value: p => p.portName, className: 'font-medium text-gray-900' },
    { key: 'country', header: t('voyage.portMgmt.country'), width: 180, value: p => p.country ?? '', render: p => dash(p.country) },
    { key: 'countryCode', header: 'Mã quốc gia', width: 110, align: 'center', value: p => p.countryCode ?? '', className: 'font-mono', render: p => dash(p.countryCode) },
    { key: 'latitude', header: t('voyage.portMgmt.lat'), width: 120, numeric: true, value: p => p.latitude ?? null, className: 'font-mono', render: p => coord(p.latitude) || <span className="text-gray-400">—</span> },
    { key: 'longitude', header: t('voyage.portMgmt.lng'), width: 120, numeric: true, value: p => p.longitude ?? null, className: 'font-mono', render: p => coord(p.longitude) || <span className="text-gray-400">—</span> },
    { key: 'timeZone', header: t('voyage.portMgmt.timeZone'), width: 140, align: 'center', value: p => p.timeZone ?? '', render: p => dash(p.timeZone) },
  ]

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white">
      {/* Header */}
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-200 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <MapPin className="h-4 w-4 text-blue-600" aria-hidden="true" />
          {t('voyage.portMgmt.title')}
        </span>
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">{ports.length}</span>
        <span className="flex items-center gap-1 text-xs italic text-gray-500">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {t('voyage.portMgmt.shoreManaged')}
        </span>
      </div>

      <DataTable
        flush
        showCount={false}
        loading={loading}
        columns={columns}
        data={ports}
        rowKey={p => p.id}
        itemLabel="cảng"
        emptyMessage={t('voyage.portMgmt.noPortsFound')}
        searchPlaceholder={t('voyage.portMgmt.searchPlaceholder')}
        exportOptions={{ fileName: 'danh-muc-cang', title: 'DANH MỤC CẢNG' }}
        minWidth={900}
      />
    </div>
  )
}
