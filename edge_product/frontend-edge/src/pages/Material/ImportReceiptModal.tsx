import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CheckCircle, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { materialService, type CreateMaterialItemDto, type UpdateMaterialItemDto } from '@/services/materialService'
import { useTranslationSafe } from '@/contexts/I18nContext'
import type { MaterialCategory, MaterialItem } from '@/types/maritime.types'

interface ImportReceiptModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

type ImportAction = 'CREATE' | 'UPDATE' | 'ERROR'

interface ParsedMaterialRow {
  rowNumber: number
  itemCode: string
  name: string
  categoryName: string
  unit: string
  onHandQuantity?: number
  specification?: string
  location?: string
  manufacturer?: string
  supplier?: string
  partNumber?: string
  barcode?: string
  minStock?: number
  maxStock?: number
  reorderLevel?: number
  reorderQuantity?: number
  unitCost?: number
  currency?: string
  notes?: string
  batchTracked?: boolean
  serialTracked?: boolean
  expiryRequired?: boolean
  isActive?: boolean
}

interface PreviewMaterialRow extends ParsedMaterialRow {
  action: ImportAction
  categoryId?: number
  existingItem?: MaterialItem
  errorMessage?: string
}

const normalize = (value: unknown) => String(value ?? '').trim()
const normalizeKey = (value: string) => value.trim().toLowerCase().replace(/\s+/g, '')
const normalizeLookup = (value: string) => value.trim().toLowerCase()

const toNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined
  const n = Number(String(value).replace(/,/g, ''))
  return Number.isFinite(n) ? n : undefined
}

const toBool = (value: unknown): boolean | undefined => {
  if (value === null || value === undefined || value === '') return undefined
  const v = String(value).trim().toLowerCase()
  if (['true', '1', 'yes', 'y', 'co', 'có', 'active'].includes(v)) return true
  if (['false', '0', 'no', 'n', 'khong', 'không', 'inactive'].includes(v)) return false
  return undefined
}

const columnMap: Record<string, keyof ParsedMaterialRow> = {
  itemcode: 'itemCode',
  mavattu: 'itemCode',
  code: 'itemCode',
  itemname: 'name',
  name: 'name',
  tenvattu: 'name',
  category: 'categoryName',
  categoryname: 'categoryName',
  danhmuc: 'categoryName',
  unit: 'unit',
  donvi: 'unit',
  quantity: 'onHandQuantity',
  onhandquantity: 'onHandQuantity',
  stock: 'onHandQuantity',
  tonkho: 'onHandQuantity',
  specification: 'specification',
  spec: 'specification',
  thongso: 'specification',
  location: 'location',
  vitri: 'location',
  manufacturer: 'manufacturer',
  nhasanxuat: 'manufacturer',
  supplier: 'supplier',
  nhacungcap: 'supplier',
  partnumber: 'partNumber',
  malinhkien: 'partNumber',
  barcode: 'barcode',
  mavach: 'barcode',
  minstock: 'minStock',
  maxstock: 'maxStock',
  reorderlevel: 'reorderLevel',
  reorderquantity: 'reorderQuantity',
  unitcost: 'unitCost',
  dongia: 'unitCost',
  currency: 'currency',
  tien: 'currency',
  notes: 'notes',
  ghichu: 'notes',
  batchtracked: 'batchTracked',
  serialtracked: 'serialTracked',
  expiryrequired: 'expiryRequired',
  isactive: 'isActive',
}

export function ImportReceiptModal({ isOpen, onClose, onSuccess }: ImportReceiptModalProps) {
  const { t } = useTranslationSafe()
  const [step, setStep] = useState<'upload' | 'preview' | 'importing'>('upload')
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<ParsedMaterialRow[]>([])
  const [previewRows, setPreviewRows] = useState<PreviewMaterialRow[]>([])
  const [items, setItems] = useState<MaterialItem[]>([])
  const [categories, setCategories] = useState<MaterialCategory[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) return
    Promise.all([
      materialService.getItems({ onlyActive: false }),
      materialService.getCategories(true),
    ])
      .then(([loadedItems, loadedCategories]) => {
        setItems(loadedItems)
        setCategories(loadedCategories)
      })
      .catch((err: any) => setError(err.message || t('materials.import.failedToLoadCatalog')))
  }, [isOpen])

  const summary = useMemo(() => {
    const validRows = previewRows.filter(row => row.action !== 'ERROR')
    return {
      totalItems: previewRows.length,
      newItems: previewRows.filter(row => row.action === 'CREATE').length,
      existingItems: previewRows.filter(row => row.action === 'UPDATE').length,
      errorItems: previewRows.filter(row => row.action === 'ERROR').length,
      totalValue: validRows.reduce((sum, row) => sum + ((row.onHandQuantity ?? row.existingItem?.onHandQuantity ?? 0) * (row.unitCost ?? row.existingItem?.unitCost ?? 0)), 0),
    }
  }, [previewRows])

  if (!isOpen) return null

  const reset = () => {
    setStep('upload')
    setUploadedFile(null)
    setParsedRows([])
    setPreviewRows([])
    setError(null)
    setLoading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleClose = () => {
    reset()
    onClose()
  }

  const parseExcelFile = (file: File): Promise<ParsedMaterialRow[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onload = (event) => {
        try {
          const data = event.target?.result
          if (!data) throw new Error(t('materials.import.failedToRead'))

          const workbook = XLSX.read(data, { type: 'binary' })
          const sheet = workbook.Sheets[workbook.SheetNames[0]]
          const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)
          if (rawRows.length === 0) throw new Error(t('materials.import.emptyFile'))

          const rows = rawRows.map((rawRow, index) => {
            const row: Partial<ParsedMaterialRow> = { rowNumber: index + 2 }

            Object.entries(rawRow).forEach(([key, value]) => {
              const mappedKey = columnMap[normalizeKey(key)]
              if (!mappedKey) return

              if (['onHandQuantity', 'minStock', 'maxStock', 'reorderLevel', 'reorderQuantity', 'unitCost'].includes(mappedKey)) {
                ;(row as any)[mappedKey] = toNumber(value)
              } else if (['batchTracked', 'serialTracked', 'expiryRequired', 'isActive'].includes(mappedKey)) {
                ;(row as any)[mappedKey] = toBool(value)
              } else {
                ;(row as any)[mappedKey] = normalize(value)
              }
            })

            if (!row.itemCode && !row.name && !row.categoryName) return null
            return {
              rowNumber: row.rowNumber!,
              itemCode: normalize(row.itemCode),
              name: normalize(row.name),
              categoryName: normalize(row.categoryName),
              unit: normalize(row.unit) || 'PCS',
              onHandQuantity: row.onHandQuantity,
              specification: normalize(row.specification) || undefined,
              location: normalize(row.location) || undefined,
              manufacturer: normalize(row.manufacturer) || undefined,
              supplier: normalize(row.supplier) || undefined,
              partNumber: normalize(row.partNumber) || undefined,
              barcode: normalize(row.barcode) || undefined,
              minStock: row.minStock,
              maxStock: row.maxStock,
              reorderLevel: row.reorderLevel,
              reorderQuantity: row.reorderQuantity,
              unitCost: row.unitCost,
              currency: normalize(row.currency) || 'USD',
              notes: normalize(row.notes) || undefined,
              batchTracked: row.batchTracked ?? false,
              serialTracked: row.serialTracked ?? false,
              expiryRequired: row.expiryRequired ?? false,
              isActive: row.isActive ?? true,
            } satisfies ParsedMaterialRow
          }).filter(Boolean) as ParsedMaterialRow[]

          if (rows.length === 0) throw new Error(t('materials.import.noValidItemsDetail'))
          resolve(rows)
        } catch (err: any) {
          reject(new Error(err.message || t('materials.import.failedToParseFormat')))
        }
      }

      reader.onerror = () => reject(new Error(t('materials.import.failedToRead')))
      reader.readAsBinaryString(file)
    })
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setError(null)
    setUploadedFile(file)
    setPreviewRows([])
    setStep('upload')

    try {
      const rows = await parseExcelFile(file)
      setParsedRows(rows)
    } catch (err: any) {
      setError(err.message || t('materials.import.failedToParse'))
      setParsedRows([])
    }
  }

  const buildPreview = () => {
    if (parsedRows.length === 0) {
      setError(t('materials.import.noItemsToImport'))
      return
    }

    const itemByCode = new Map(items.map(item => [normalizeLookup(item.itemCode), item]))
    const categoryByNameOrCode = new Map<string, MaterialCategory>()
    categories.forEach(category => {
      categoryByNameOrCode.set(normalizeLookup(category.name), category)
      categoryByNameOrCode.set(normalizeLookup(category.categoryCode), category)
    })

    const seenCodes = new Set<string>()
    const rows = parsedRows.map(row => {
      const codeKey = normalizeLookup(row.itemCode)
      const category = categoryByNameOrCode.get(normalizeLookup(row.categoryName))
      const existingItem = itemByCode.get(codeKey)
      const errors: string[] = []

      if (!row.itemCode) errors.push(t('materials.import.missingItemCode'))
      if (!row.name) errors.push(t('materials.import.missingItemName'))
      if (!row.categoryName) errors.push(t('materials.import.missingCategory'))
      if (row.categoryName && !category) errors.push(t('materials.import.categoryNotFound', { category: row.categoryName }))
      if (seenCodes.has(codeKey)) errors.push(t('materials.import.duplicateItemCode', { code: row.itemCode }))
      if (codeKey) seenCodes.add(codeKey)

      if (errors.length > 0) {
        return { ...row, action: 'ERROR', errorMessage: errors.join('; ') } satisfies PreviewMaterialRow
      }

      return {
        ...row,
        action: existingItem ? 'UPDATE' : 'CREATE',
        categoryId: category!.id,
        existingItem,
      } satisfies PreviewMaterialRow
    })

    setError(null)
    setPreviewRows(rows)
    setStep('preview')
  }

  const toDto = (row: PreviewMaterialRow): CreateMaterialItemDto | UpdateMaterialItemDto => ({
    itemCode: row.itemCode,
    name: row.name,
    categoryId: row.categoryId!,
    specification: row.specification ?? row.existingItem?.specification ?? null,
    unit: row.unit || row.existingItem?.unit || 'PCS',
    onHandQuantity: row.onHandQuantity ?? row.existingItem?.onHandQuantity ?? 0,
    minStock: row.minStock ?? row.existingItem?.minStock ?? null,
    maxStock: row.maxStock ?? row.existingItem?.maxStock ?? null,
    reorderLevel: row.reorderLevel ?? row.existingItem?.reorderLevel ?? null,
    reorderQuantity: row.reorderQuantity ?? row.existingItem?.reorderQuantity ?? null,
    location: row.location ?? row.existingItem?.location ?? null,
    manufacturer: row.manufacturer ?? row.existingItem?.manufacturer ?? null,
    supplier: row.supplier ?? row.existingItem?.supplier ?? null,
    partNumber: row.partNumber ?? row.existingItem?.partNumber ?? null,
    barcode: row.barcode ?? row.existingItem?.barcode ?? null,
    batchTracked: row.batchTracked ?? row.existingItem?.batchTracked ?? false,
    serialTracked: row.serialTracked ?? row.existingItem?.serialTracked ?? false,
    expiryRequired: row.expiryRequired ?? row.existingItem?.expiryRequired ?? false,
    unitCost: row.unitCost ?? row.existingItem?.unitCost ?? null,
    currency: row.currency ?? row.existingItem?.currency ?? 'USD',
    notes: row.notes ?? row.existingItem?.notes ?? null,
    isActive: row.isActive ?? row.existingItem?.isActive ?? true,
  })

  const handleImport = async () => {
    const validRows = previewRows.filter(row => row.action !== 'ERROR')
    if (validRows.length === 0) return

    try {
      setStep('importing')
      let created = 0
      let updated = 0

      for (const row of validRows) {
        const dto = toDto(row)
        if (row.action === 'UPDATE' && row.existingItem) {
          await materialService.updateItem(row.existingItem.id, dto as UpdateMaterialItemDto)
          updated += 1
        } else {
          await materialService.createItem(dto as CreateMaterialItemDto)
          created += 1
        }
      }

      toast.success(t('materials.import.importDone', { created, updated }))
      onSuccess()
      handleClose()
    } catch (err: any) {
      setError(err.message || t('materials.import.failedToImport'))
      setStep('preview')
    }
  }

  const renderAction = (action: ImportAction) => {
    if (action === 'CREATE') return t('materials.import.actionCreate')
    if (action === 'UPDATE') return t('materials.import.actionUpdate')
    return t('materials.import.actionError')
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">{t('materials.import.title')}</h2>
              <p className="text-sm text-gray-600">{t('materials.import.subtitle')}</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 'upload' && (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">{t('materials.import.instructions')}</h3>
                <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
                  <li>{t('materials.import.instruction1')}</li>
                  <li className="ml-6"><code className="bg-blue-100 px-1 rounded">ItemCode, ItemName, Category, Unit</code></li>
                  <li className="ml-6">{t('materials.import.instruction2')}: <code className="bg-blue-100 px-1 rounded">OnHandQuantity, UnitCost, Location, Supplier, PartNumber, Barcode, Manufacturer, Specification, MinStock, MaxStock</code></li>
                  <li>{t('materials.import.instruction3')}</li>
                  <li>{t('materials.import.instruction4')}</li>
                </ol>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('materials.import.uploadFile')} <span className="text-red-500">*</span>
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="material-excel-file-input"
                  />
                  <label htmlFor="material-excel-file-input" className="cursor-pointer">
                    <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    {uploadedFile ? (
                      <div>
                        <p className="text-sm font-medium text-gray-900">{uploadedFile.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {parsedRows.length} {t('materials.import.itemsDetected')}
                        </p>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault()
                            setUploadedFile(null)
                            setParsedRows([])
                            setPreviewRows([])
                            if (fileInputRef.current) fileInputRef.current.value = ''
                          }}
                          className="mt-2 text-sm text-red-600 hover:text-red-800"
                        >
                          {t('materials.import.removeFile')}
                        </button>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm text-gray-600">{t('materials.import.clickToSelect')}</p>
                        <p className="text-xs text-gray-500 mt-1">{t('materials.import.supportedFormats')}</p>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              {parsedRows.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-green-900">
                    {t('materials.import.parseSuccess', { count: parsedRows.length })}
                  </p>
                  <p className="text-xs text-green-700 mt-1">{t('materials.import.clickPreview')}</p>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-900">{t('common.error')}</p>
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <p className="text-xs text-blue-600 font-medium">{t('materials.import.totalItems')}</p>
                  <p className="text-2xl font-bold text-blue-900">{summary.totalItems}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-xs text-green-600 font-medium">{t('materials.import.newItems')}</p>
                  <p className="text-2xl font-bold text-green-900">{summary.newItems}</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-4">
                  <p className="text-xs text-yellow-600 font-medium">{t('materials.import.updateItems')}</p>
                  <p className="text-2xl font-bold text-yellow-900">{summary.existingItems}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <p className="text-xs text-red-600 font-medium">{t('materials.import.errorItems')}</p>
                  <p className="text-2xl font-bold text-red-900">{summary.errorItems}</p>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">{t('materials.import.colNo')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">{t('materials.import.colAction')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">{t('materials.import.colItemCode')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">{t('materials.import.colItemName')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">{t('materials.import.colCategory')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">{t('materials.import.colUnit')}</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">{t('materials.import.colOnHand')}</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">{t('materials.import.colResult')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {previewRows.map((row) => (
                        <tr key={row.rowNumber} className={row.action === 'ERROR' ? 'bg-red-50' : row.action === 'CREATE' ? 'bg-green-50' : 'bg-yellow-50'}>
                          <td className="px-3 py-2 text-sm">{row.rowNumber}</td>
                          <td className="px-3 py-2">
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                              row.action === 'CREATE' ? 'bg-green-100 text-green-700' :
                              row.action === 'UPDATE' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {renderAction(row.action)}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-sm font-mono">{row.itemCode}</td>
                          <td className="px-3 py-2 text-sm">{row.name}</td>
                          <td className="px-3 py-2 text-sm text-gray-600">{row.categoryName}</td>
                          <td className="px-3 py-2 text-sm">{row.unit}</td>
                          <td className="px-3 py-2 text-sm text-right">{row.onHandQuantity ?? row.existingItem?.onHandQuantity ?? 0}</td>
                          <td className="px-3 py-2 text-xs text-gray-600">{row.errorMessage || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
              <p className="text-lg font-medium text-gray-900">{t('materials.import.importing')}</p>
              <p className="text-sm text-gray-600">{t('materials.import.pleaseWait')}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            {step === 'upload' && t('materials.import.step1')}
            {step === 'preview' && t('materials.import.step2')}
            {step === 'importing' && t('materials.import.processing')}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              disabled={step === 'importing'}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            {step === 'upload' && (
              <button
                onClick={buildPreview}
                disabled={!uploadedFile || parsedRows.length === 0 || loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {t('materials.import.preview')}
              </button>
            )}
            {step === 'preview' && (
              <>
                <button onClick={() => setStep('upload')} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                  {t('common.back')}
                </button>
                <button
                  onClick={handleImport}
                  disabled={summary.errorItems > 0 || summary.totalItems === 0}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  {t('materials.import.confirmImport')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
