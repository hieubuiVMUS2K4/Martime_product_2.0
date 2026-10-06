import { useState, useEffect, useRef } from 'react'
import { X, Upload, Trash2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Package, FileText, ClipboardList } from 'lucide-react'
import type { MaterialItem, MaterialCategory } from '@/types/maritime.types'
import type { CreateMaterialItemDto, UpdateMaterialItemDto, ItemActivityResponse } from '@/services/materialService'
import { materialService } from '@/services/materialService'
import { API_CONFIG } from '@/config/app.config'
import { useTranslationSafe } from '@/contexts/I18nContext'

interface ItemFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateMaterialItemDto | UpdateMaterialItemDto) => Promise<void>
  item?: MaterialItem | null
  categories: MaterialCategory[]
  title: string
  viewMode?: boolean
}

type TabKey = 'part' | 'remarks' | 'history'

const inp = 'w-full px-2 py-1.5 border border-gray-300 text-sm focus:ring-1 focus:ring-[#1b4c7e] focus:border-[#1b4c7e] outline-none bg-white'
const inpRo = 'w-full px-2 py-1.5 border border-gray-300 text-sm bg-gray-50 text-gray-600 outline-none'
const lbl = 'text-sm text-gray-600 whitespace-nowrap text-right pr-3'

export function ItemFormModal({
  isOpen,
  onClose,
  onSubmit,
  item,
  categories,
  title,
  viewMode = false,
}: ItemFormModalProps) {
  const { t } = useTranslationSafe()
  const [activeTab, setActiveTab] = useState<TabKey>('part')
  const [formData, setFormData] = useState<CreateMaterialItemDto>({
    itemCode: '',
    name: '',
    categoryId: categories[0]?.id || 0,
    specification: '',
    unit: 'PCS',
    onHandQuantity: 0,
    minStock: null,
    maxStock: null,
    reorderLevel: null,
    reorderQuantity: null,
    location: '',
    manufacturer: '',
    supplier: '',
    partNumber: '',
    barcode: '',
    batchTracked: false,
    serialTracked: false,
    expiryRequired: false,
    unitCost: null,
    currency: 'USD',
    notes: '',
    isActive: true,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [imageUploading, setImageUploading] = useState(false)
  const [activity, setActivity] = useState<ItemActivityResponse | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Fetch activity data when item changes
  useEffect(() => {
    if (item?.id) {
      setActivityLoading(true)
      materialService.getItemActivity(item.id).then(setActivity).catch(() => setActivity(null)).finally(() => setActivityLoading(false))
    } else {
      setActivity(null)
    }
  }, [item?.id])

  // Update form data when item changes
  useEffect(() => {
    if (item) {
      setFormData({
        itemCode: item.itemCode,
        name: item.name,
        categoryId: item.categoryId,
        specification: item.specification || '',
        unit: item.unit,
        onHandQuantity: item.onHandQuantity,
        minStock: item.minStock,
        maxStock: item.maxStock,
        reorderLevel: item.reorderLevel,
        reorderQuantity: item.reorderQuantity,
        location: item.location || '',
        manufacturer: item.manufacturer || '',
        supplier: item.supplier || '',
        partNumber: item.partNumber || '',
        barcode: item.barcode || '',
        batchTracked: item.batchTracked,
        serialTracked: item.serialTracked,
        expiryRequired: item.expiryRequired,
        unitCost: item.unitCost,
        currency: item.currency || 'USD',
        notes: item.notes || '',
        isActive: item.isActive,
      })
      setImageUrl(item.imageUrl || null)
    } else {
      setFormData({
        itemCode: '',
        name: '',
        categoryId: categories[0]?.id || 0,
        specification: '',
        unit: 'PCS',
        onHandQuantity: 0,
        minStock: null,
        maxStock: null,
        reorderLevel: null,
        reorderQuantity: null,
        location: '',
        manufacturer: '',
        supplier: '',
        partNumber: '',
        barcode: '',
        batchTracked: false,
        serialTracked: false,
        expiryRequired: false,
        unitCost: null,
        currency: 'USD',
        notes: '',
        isActive: true,
      })
      setImageUrl(null)
    }
    setError(null)
    setActiveTab('part')
  }, [item, categories])

  if (!isOpen) return null

  const serverBase = API_CONFIG.BASE_URL.replace(/\/api\/?$/, '')

  const ro = viewMode
  const cls = ro ? inpRo : inp

  const set = (key: keyof CreateMaterialItemDto, val: any) => {
    if (ro) return
    setFormData(prev => ({ ...prev, [key]: val }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (ro) return
    setError(null)
    setLoading(true)
    try {
      await onSubmit(formData)
      onClose()
    } catch (err: any) {
      setError(err.message || t('materials.item.saveFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !item) return
    setImageUploading(true)
    try {
      const res = await materialService.uploadItemImage(item.id, file)
      setImageUrl(res.imageUrl)
    } catch {
      setError('Upload ảnh thất bại')
    } finally {
      setImageUploading(false)
    }
  }

  const handleImageDelete = async () => {
    if (!item || !imageUrl) return
    try {
      await materialService.deleteItemImage(item.id)
      setImageUrl(null)
    } catch {
      setError('Xóa ảnh thất bại')
    }
  }

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'part', label: 'Vật tư' },
    { key: 'remarks', label: 'Ghi chú' },
    { key: 'history', label: 'Lịch sử' },
  ]

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />

        <div className="relative w-full max-w-5xl bg-white rounded-lg shadow-xl flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 shrink-0">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 px-5 shrink-0">
            {tabs.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  activeTab === tab.key
                    ? 'border-accent text-[#0b2545]'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
            {error && (
              <div className="mx-5 mt-3 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>
            )}

            {/* TAB: Part */}
            {activeTab === 'part' && (
              <div className="p-5 space-y-5">
                {/* General Details */}
                <div>
                  <div className="bg-primary text-white text-sm font-semibold px-3 py-1.5 rounded-t">Thông tin chung</div>
                  <div className="border border-t-0 border-gray-200 rounded-b p-4">
                    <div className="flex gap-6">
                      {/* Left column */}
                      <div className="flex-1 space-y-2.5">
                        <div className="flex items-center">
                          <label className={lbl} style={{ width: 120 }}>Tên vật tư <span className="text-red-500">*</span></label>
                          <input type="text" required maxLength={200} value={formData.name} onChange={e => set('name', e.target.value)} className={cls} readOnly={ro} />
                        </div>
                        <div className="flex items-center">
                          <label className={lbl} style={{ width: 120 }}>Mã vật tư <span className="text-red-500">*</span></label>
                          <input type="text" required maxLength={50} value={formData.itemCode} onChange={e => set('itemCode', e.target.value)} className={cls} readOnly={ro} />
                        </div>
                        <div className="flex items-center">
                          <label className={lbl} style={{ width: 120 }}>Part Number</label>
                          <input type="text" maxLength={100} value={formData.partNumber || ''} onChange={e => set('partNumber', e.target.value)} className={cls} readOnly={ro} />
                        </div>
                        <div className="flex items-center">
                          <label className={lbl} style={{ width: 120 }}>Nhà sản xuất</label>
                          <input type="text" maxLength={100} value={formData.manufacturer || ''} onChange={e => set('manufacturer', e.target.value)} className={cls} readOnly={ro} />
                        </div>
                        <div className="flex items-center">
                          <label className={lbl} style={{ width: 120 }}>Kho lưu trữ</label>
                          <input type="text" maxLength={100} value={formData.location || ''} onChange={e => set('location', e.target.value)} className={cls} readOnly={ro} />
                        </div>
                        <div className="flex items-center">
                          <label className={lbl} style={{ width: 120 }}>Barcode</label>
                          <input type="text" maxLength={50} value={formData.barcode || ''} onChange={e => set('barcode', e.target.value)} className={cls} readOnly={ro} />
                        </div>
                      </div>

                      {/* Right column */}
                      <div className="flex-1 space-y-2.5">
                        <div className="flex items-center">
                          <label className={lbl} style={{ width: 110 }}>Đơn vị <span className="text-red-500">*</span></label>
                          <input type="text" required maxLength={20} value={formData.unit} onChange={e => set('unit', e.target.value)} className={cls} readOnly={ro} />
                        </div>
                        <div className="flex items-center">
                          <label className={lbl} style={{ width: 110 }}>Mô tả/Spec</label>
                          <input type="text" maxLength={500} value={formData.specification || ''} onChange={e => set('specification', e.target.value)} className={cls} readOnly={ro} />
                        </div>
                        <div className="flex items-center">
                          <label className={lbl} style={{ width: 110 }}>Nhà cung cấp</label>
                          <input type="text" maxLength={200} value={formData.supplier || ''} onChange={e => set('supplier', e.target.value)} className={cls} readOnly={ro} />
                        </div>
                        <div className="flex items-center">
                          <label className={lbl} style={{ width: 110 }}>Giá</label>
                          <input type="number" step="0.01" min="0" value={formData.unitCost ?? ''} onChange={e => set('unitCost', e.target.value ? Number(e.target.value) : null)} className={`${cls} w-28`} readOnly={ro} />
                          <span className="mx-1 text-xs text-gray-500">×</span>
                          {ro ? (
                            <input type="text" readOnly className={`${inpRo} w-20`} value={formData.currency || 'USD'} />
                          ) : (
                            <select value={formData.currency || 'USD'} onChange={e => set('currency', e.target.value)} className={`${cls} w-20`}>
                              <option value="USD">USD</option>
                              <option value="EUR">EUR</option>
                              <option value="VND">VND</option>
                              <option value="GBP">GBP</option>
                              <option value="JPY">JPY</option>
                            </select>
                          )}
                        </div>
                      </div>

                      {/* ROB + Image */}
                      <div className="w-52 shrink-0 space-y-3">
                        <div className="border border-gray-200 rounded p-3 bg-gray-50">
                          <div className="text-xs font-semibold text-gray-700 mb-2">ROB (Tồn kho)</div>
                          <div className="flex items-center gap-2 mb-2">
                            <input type="number" step="0.001" min="0" value={formData.onHandQuantity} onChange={e => set('onHandQuantity', Number(e.target.value))} className={`${ro ? inpRo : inp} w-full text-center font-bold text-lg`} readOnly />
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div>
                              <span className="text-gray-500">Min</span>
                              <input type="number" step="0.001" min="0" value={formData.minStock ?? ''} onChange={e => set('minStock', e.target.value ? Number(e.target.value) : null)} className={`${ro ? inpRo : inp} w-full text-center mt-0.5`} readOnly={ro} />
                            </div>
                            <div>
                              <span className="text-gray-500">Max</span>
                              <input type="number" step="0.001" min="0" value={formData.maxStock ?? ''} onChange={e => set('maxStock', e.target.value ? Number(e.target.value) : null)} className={`${ro ? inpRo : inp} w-full text-center mt-0.5`} readOnly={ro} />
                            </div>
                          </div>
                        </div>

                        <div className="border border-gray-200 rounded overflow-hidden bg-white">
                          <div className="h-32 flex items-center justify-center bg-gray-100">
                            {imageUrl ? (
                              <img src={`${serverBase}${imageUrl}`} alt="Material" className="max-h-full max-w-full object-contain" />
                            ) : (
                              <span className="text-xs text-gray-400">Chưa có ảnh</span>
                            )}
                          </div>
                          {!ro && item && (
                            <div className="flex border-t border-gray-200">
                              <button
                                type="button"
                                onClick={() => fileRef.current?.click()}
                                disabled={imageUploading}
                                className="flex-1 flex items-center justify-center gap-1 py-1.5 text-xs text-[#0b2545] hover:bg-[#eef2f7]"
                              >
                                <Upload className="w-3 h-3" /> {imageUploading ? 'Đang tải...' : 'Browse'}
                              </button>
                              {imageUrl && (
                                <button
                                  type="button"
                                  onClick={handleImageDelete}
                                  className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 border-l border-gray-200"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                              <input ref={fileRef} type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stock Status & Activity Summary */}
                <div>
                  <div className="bg-primary text-white text-sm font-semibold px-3 py-1.5 rounded-t">Tình trạng kho & Hoạt động</div>
                  <div className="border border-t-0 border-gray-200 rounded-b p-4">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Stock Status */}
                      {(() => {
                        const qty = formData.onHandQuantity ?? 0
                        const min = formData.minStock
                        const max = formData.maxStock
                        const isLow = min != null && qty < min
                        const isOver = max != null && qty > max
                        const statusText = isLow ? 'Thấp' : isOver ? 'Vượt mức' : 'Bình thường'
                        const statusColor = isLow ? 'text-red-600 bg-red-50 border-red-200' : isOver ? 'text-orange-600 bg-orange-50 border-orange-200' : 'text-green-600 bg-green-50 border-green-200'
                        const Icon = isLow ? TrendingDown : isOver ? AlertTriangle : CheckCircle
                        return (
                          <div className={`border rounded-lg p-3 ${statusColor}`}>
                            <div className="flex items-center gap-1.5 mb-1">
                              <Icon className="w-4 h-4" />
                              <span className="text-xs font-medium">Trạng thái kho</span>
                            </div>
                            <div className="text-lg font-bold">{statusText}</div>
                            {min != null && <div className="text-xs mt-0.5">Min: {min} | Hiện: {qty}</div>}
                          </div>
                        )
                      })()}

                      {/* Total Value */}
                      <div className="border border-gray-200 rounded-lg p-3 bg-white">
                        <div className="flex items-center gap-1.5 mb-1 text-gray-500">
                          <TrendingUp className="w-4 h-4" />
                          <span className="text-xs font-medium">Giá trị tồn kho</span>
                        </div>
                        <div className="text-lg font-bold text-gray-800">
                          {formData.unitCost ? `${(formData.unitCost * (formData.onHandQuantity ?? 0)).toLocaleString('vi-VN')}` : '—'}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">{formData.currency || 'USD'}</div>
                      </div>

                      {/* Pending Requests */}
                      <div className="border border-gray-200 rounded-lg p-3 bg-white">
                        <div className="flex items-center gap-1.5 mb-1 text-gray-500">
                          <ClipboardList className="w-4 h-4" />
                          <span className="text-xs font-medium">Yêu cầu đang chờ</span>
                        </div>
                        <div className="text-lg font-bold text-gray-800">
                          {activityLoading ? '...' : activity?.summary.pendingRequests ?? 0}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          Tổng đã yêu cầu: {activityLoading ? '...' : activity?.summary.totalRequested?.toLocaleString('vi-VN') ?? 0}
                        </div>
                      </div>

                      {/* Total Received */}
                      <div className="border border-gray-200 rounded-lg p-3 bg-white">
                        <div className="flex items-center gap-1.5 mb-1 text-gray-500">
                          <Package className="w-4 h-4" />
                          <span className="text-xs font-medium">Tổng đã nhập kho</span>
                        </div>
                        <div className="text-lg font-bold text-gray-800">
                          {activityLoading ? '...' : activity?.summary.totalReceived?.toLocaleString('vi-VN') ?? 0}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {activity?.summary.lastReceiptDate ? `Lần cuối: ${new Date(activity.summary.lastReceiptDate).toLocaleDateString('vi-VN')}` : 'Chưa nhập kho'}
                        </div>
                      </div>
                    </div>

                    {/* Active toggle */}
                    <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={formData.isActive} onChange={e => set('isActive', e.target.checked)} disabled={ro} className="w-4 h-4 text-[#0b2545] rounded" />
                        Đang hoạt động
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB: Remarks */}
            {activeTab === 'remarks' && (
              <div className="p-5">
                <div>
                  <div className="bg-primary text-white text-sm font-semibold px-3 py-1.5 rounded-t">Ghi chú</div>
                  <div className="border border-t-0 border-gray-200 rounded-b p-4">
                    <textarea
                      rows={8}
                      maxLength={1000}
                      value={formData.notes || ''}
                      onChange={e => set('notes', e.target.value)}
                      className={`${cls} resize-y`}
                      readOnly={ro}
                      placeholder="Nhập ghi chú cho vật tư..."
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB: History */}
            {activeTab === 'history' && (
              <div className="p-5 space-y-5">
                {/* Item info */}
                {item && (
                  <div>
                    <div className="bg-primary text-white text-sm font-semibold px-3 py-1.5 rounded-t">Thông tin hệ thống</div>
                    <div className="border border-t-0 border-gray-200 rounded-b p-4">
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div><span className="text-gray-500">ID: </span><span className="font-mono text-xs">{item.id}</span></div>
                        <div><span className="text-gray-500">Ngày tạo: </span>{new Date(item.createdAt).toLocaleDateString('vi-VN')}</div>
                        <div><span className="text-gray-500">Đồng bộ: </span><span className={item.isSynced ? 'text-green-600' : 'text-orange-500'}>{item.isSynced ? 'Đã sync' : 'Chưa sync'}</span></div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Recent Receipts */}
                <div>
                  <div className="bg-primary text-white text-sm font-semibold px-3 py-1.5 rounded-t flex items-center gap-2">
                    <Package className="w-4 h-4" /> Phiếu nhập kho gần đây
                  </div>
                  <div className="border border-t-0 border-gray-200 rounded-b">
                    {activityLoading ? (
                      <div className="p-4 text-sm text-gray-400 text-center">Đang tải...</div>
                    ) : !activity?.receipts.length ? (
                      <div className="p-4 text-sm text-gray-400 text-center">Chưa có phiếu nhập kho nào</div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Mã phiếu</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Ngày nhập</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Nhà cung cấp</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">SL nhập</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Đơn giá</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {activity.receipts.map((r, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="px-3 py-2 font-mono text-xs text-[#0b2545]">{r.code}</td>
                              <td className="px-3 py-2 text-gray-600">{new Date(r.date).toLocaleDateString('vi-VN')}</td>
                              <td className="px-3 py-2 text-gray-600">{r.supplierName || '—'}</td>
                              <td className="px-3 py-2 text-right font-medium text-green-700">+{r.quantityReceived}</td>
                              <td className="px-3 py-2 text-right text-gray-600">{r.unitCost ? `${r.unitCost.toLocaleString('vi-VN')} ${r.currency || ''}` : '—'}</td>
                              <td className="px-3 py-2 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  r.status === 'Completed' ? 'bg-green-100 text-green-700' :
                                  r.status === 'Approved' ? 'bg-[#dce9f8] text-[#16375f]' :
                                  'bg-gray-100 text-gray-600'
                                }`}>{r.status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* Recent Requests */}
                <div>
                  <div className="bg-primary text-white text-sm font-semibold px-3 py-1.5 rounded-t flex items-center gap-2">
                    <ClipboardList className="w-4 h-4" /> Yêu cầu vật tư gần đây
                  </div>
                  <div className="border border-t-0 border-gray-200 rounded-b">
                    {activityLoading ? (
                      <div className="p-4 text-sm text-gray-400 text-center">Đang tải...</div>
                    ) : !activity?.requests.length ? (
                      <div className="p-4 text-sm text-gray-400 text-center">Chưa có yêu cầu vật tư nào</div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Mã yêu cầu</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Ngày YC</th>
                            <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Người YC</th>
                            <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Số lượng</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Ưu tiên</th>
                            <th className="px-3 py-2 text-center text-xs font-medium text-gray-500">Trạng thái</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {activity.requests.map((r, i) => (
                            <tr key={i} className="hover:bg-gray-50">
                              <td className="px-3 py-2 font-mono text-xs text-[#0b2545]">{r.code}</td>
                              <td className="px-3 py-2 text-gray-600">{new Date(r.date).toLocaleDateString('vi-VN')}</td>
                              <td className="px-3 py-2 text-gray-600">{r.requestedBy || '—'}</td>
                              <td className="px-3 py-2 text-right font-medium">{r.quantity}</td>
                              <td className="px-3 py-2 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  r.urgency === 'Critical' ? 'bg-red-100 text-red-700' :
                                  r.urgency === 'Urgent' ? 'bg-orange-100 text-orange-700' :
                                  'bg-gray-100 text-gray-600'
                                }`}>{r.urgency}</span>
                              </td>
                              <td className="px-3 py-2 text-center">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  r.status === 'Completed' ? 'bg-green-100 text-green-700' :
                                  r.status === 'Approved' ? 'bg-[#dce9f8] text-[#16375f]' :
                                  r.status === 'Submitted' ? 'bg-yellow-100 text-yellow-700' :
                                  r.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                                  'bg-gray-100 text-gray-600'
                                }`}>{r.status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {!item && <p className="text-sm text-gray-400 text-center">Lưu vật tư trước để xem lịch sử</p>}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-gray-200 bg-gray-50 sticky bottom-0">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
              >
                {ro ? 'Đóng' : t('common.cancel')}
              </button>
              {!ro && (
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {loading ? t('materials.saving') : item ? t('materials.update') : t('materials.create')}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

