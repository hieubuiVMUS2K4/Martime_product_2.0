import { useState, useEffect, useCallback } from 'react'
import { Boxes, Info } from 'lucide-react'
import { toast } from 'sonner'
import { DataTable, type Column } from '@/components/common/DataTable'
import { materialService, type MaterialCatalogItem } from '@/services/materialService'

/**
 * Danh mục vật tư của CÔNG TY — CHỈ ĐỌC tại tàu, giống danh mục cảng / quốc gia / loại chứng chỉ:
 * bờ làm chủ (thêm/sửa/ngừng dùng trên Shore) và đồng bộ xuống tàu — bờ có gì, tàu có đó.
 * Cho tàu biết công ty cung cấp được những vật tư nào để lên phiếu đề xuất / phiếu nhập.
 */
export function CompanyMaterialCatalogTab() {
  const [items, setItems] = useState<MaterialCatalogItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      setItems(await materialService.getCatalog())
    } catch (err) {
      toast.error('Không tải được danh mục vật tư công ty: ' + (err instanceof Error ? err.message : 'Lỗi không xác định'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const dash = (v?: string | null) => v || <span className="text-gray-400">—</span>
  const code = (r: MaterialCatalogItem) => r.catalogCode ?? r.itemCode

  const columns: Column<MaterialCatalogItem>[] = [
    {
      key: 'code', header: 'Mã vật tư', width: 170, value: code,
      render: r => <span className="rounded bg-blue-50 px-2 py-0.5 font-mono font-semibold text-blue-700">{code(r)}</span>,
    },
    { key: 'name', header: 'Tên vật tư', value: r => r.name, className: 'font-medium text-gray-900' },
    { key: 'category', header: 'Loại vật tư', width: 220, value: r => r.categoryName ?? '', render: r => dash(r.categoryName) },
    {
      key: 'price', header: 'Đơn giá', width: 130, numeric: true, filter: false, value: r => r.unitPrice ?? null,
      render: r => (r.unitPrice != null ? r.unitPrice.toLocaleString('vi-VN') : <span className="text-gray-400">—</span>),
    },
  ]

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-200 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <Boxes className="h-4 w-4 text-blue-600" aria-hidden="true" />
          Danh mục vật tư công ty
        </span>
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">{items.length}</span>
        <span className="flex items-center gap-1 text-xs italic text-gray-500">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Bờ quản lý và đồng bộ xuống tàu — chỉ xem. Dùng khi lên phiếu đề xuất / phiếu nhập vật tư.
        </span>
      </div>

      <DataTable
        flush
        showCount={false}
        loading={loading}
        columns={columns}
        data={items}
        rowKey={r => r.id}
        itemLabel="vật tư"
        emptyMessage="Chưa có danh mục vật tư — đồng bộ nhóm Danh mục từ bờ xuống tàu."
        searchPlaceholder="Tìm mã, tên, loại vật tư..."
        exportOptions={{ fileName: 'danh-muc-vat-tu-cong-ty', title: 'DANH MỤC VẬT TƯ CÔNG TY' }}
        minWidth={800}
      />
    </div>
  )
}
