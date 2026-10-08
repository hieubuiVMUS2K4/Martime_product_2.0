import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { X } from 'lucide-react'
import { maritimeService } from '@/services/maritime.service'
import type { Country } from '@/types/maritime.types'

const DOCUMENT_TARGET_OPTIONS = [
  { value: 'travel_documents', label: 'Travel Documents' },
  { value: 'seafarer_documents', label: 'Seafarer Documents' },
  { value: 'employment_documents', label: 'Employment Documents' },
] as const

const DOCUMENT_TYPE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  travel_documents: [
    { value: 'passport', label: 'Passport' },
    { value: 'visa', label: 'Visa' },
    { value: 'residence_permit', label: 'Residence Permit' },
    { value: 'seaman_book', label: 'Seaman Book' },
  ],
  seafarer_documents: [
    { value: 'sid', label: 'SID (Seafarer Identity Document)' },
    { value: 'coc', label: 'COC (Certificate of Competency)' },
  ],
  employment_documents: [
    { value: 'contract', label: 'Contract' },
    { value: 'appraisal', label: 'Appraisal' },
    { value: 'offer_letter', label: 'Offer Letter' },
  ],
}

type AddDocumentModalProps = {
  isOpen: boolean
  crewMemberId: string
  onClose: () => void
  onSuccess?: () => void
  /** Có giá trị = đang SỬA tài liệu này; bỏ trống = thêm mới. */
  editingDocument?: any | null
  /** Bảng lưu của tài liệu đang sửa (travel_documents / seafarer_documents / ...). */
  editingTable?: string | null
}

/** Chuẩn hoá ngày về dạng yyyy-MM-dd cho input type="date". */
const toDateInput = (v?: string | null) => (v ? String(v).slice(0, 10) : '')

type FormState = {
  targetTable: string
  documentType: string
  documentNumber: string
  issueDate: string
  expiryDate: string
  countryId: string
  notes: string
  file: File | null
}

const initialFormState: FormState = {
  targetTable: 'travel_documents',
  documentType: '',
  documentNumber: '',
  issueDate: '',
  expiryDate: '',
  countryId: '',
  notes: '',
  file: null,
}

export default function AddDocumentModal({ isOpen, crewMemberId, onClose, onSuccess, editingDocument, editingTable }: AddDocumentModalProps) {
  const [submitting, setSubmitting] = useState(false)
  const [countries, setCountries] = useState<Country[]>([])
  const [loadingCountries, setLoadingCountries] = useState(false)
  const [form, setForm] = useState<FormState>(initialFormState)

  const isEditing = !!editingDocument

  // Nạp sẵn dữ liệu khi mở ở chế độ sửa, dọn form khi mở để thêm mới.
  useEffect(() => {
    if (!isOpen) return
    setForm(editingDocument
      ? {
          targetTable: editingTable || 'travel_documents',
          documentType: editingDocument.documentType || '',
          documentNumber: editingDocument.documentNumber || '',
          issueDate: toDateInput(editingDocument.issueDate),
          expiryDate: toDateInput(editingDocument.expiryDate),
          countryId: editingDocument.countryId != null ? String(editingDocument.countryId) : '',
          notes: editingDocument.notes || '',
          file: null,
        }
      : initialFormState)
  }, [isOpen, editingDocument, editingTable])

  useEffect(() => {
    if (!isOpen) return

    const loadCountries = async () => {
      try {
        setLoadingCountries(true)
        const data = await maritimeService.countries.getAll()
        setCountries(data || [])
      } catch (error) {
        console.error('❌ Failed to load countries:', error)
        setCountries([])
      } finally {
        setLoadingCountries(false)
      }
    }

    loadCountries()
  }, [isOpen])

  if (!isOpen) return null

  const handleInputChange = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleTargetTableChange = (newTargetTable: string) => {
    setForm((prev) => ({
      ...prev,
      targetTable: newTargetTable,
      documentType: '', // Reset document type when changing table
    }))
  }

  const currentDocumentTypeOptions = DOCUMENT_TYPE_OPTIONS[form.targetTable] || []

  const resetAndClose = () => {
    setForm(initialFormState)
    onClose()
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!crewMemberId) return
    if (!form.documentType.trim() || !form.documentNumber.trim()) {
      toast.warning('Document Type và Document Number là bắt buộc')
      return
    }

    try {
      setSubmitting(true)

      if (isEditing) {
        // Bảng lưu lấy theo tài liệu gốc: đổi nhóm là đổi bảng, không sửa được bằng một lệnh.
        await maritimeService.crew.updateIdentityDocument(editingDocument.id, {
          targetTable: editingTable || form.targetTable,
          documentType: form.documentType.trim(),
          documentNumber: form.documentNumber.trim(),
          issueDate: form.issueDate || null,
          expiryDate: form.expiryDate || null,
          countryId: form.countryId ? Number(form.countryId) : null,
          notes: form.notes || null,
        })
        if (form.file) {
          const fd = new FormData()
          fd.append('file', form.file)
          fd.append('targetTable', editingTable || form.targetTable)
          await maritimeService.crew.updateDocumentFile(editingDocument.id, fd)
        }
      } else {
        const payload = new FormData()
        payload.append('targetTable', form.targetTable)
        payload.append('documentType', form.documentType.trim())
        payload.append('documentNumber', form.documentNumber.trim())

        if (form.issueDate) payload.append('issueDate', form.issueDate)
        if (form.expiryDate) payload.append('expiryDate', form.expiryDate)
        if (form.countryId) payload.append('countryId', form.countryId)
        if (form.notes) payload.append('notes', form.notes)
        if (form.file) payload.append('file', form.file)

        await maritimeService.crew.createIdentityDocument(crewMemberId, payload)
      }

      toast.success(isEditing ? 'Updated document successfully' : 'Added document successfully')
      onSuccess?.()
      resetAndClose()
    } catch (error: any) {
      console.error('❌ Failed to add document:', error)
      toast.error(error.message || (isEditing ? 'Failed to update document' : 'Failed to add document'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-base font-semibold text-gray-800">{isEditing ? 'Edit Identity Document' : 'Add Identity Document'}</h2>
          <button
            type="button"
            onClick={resetAndClose}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase text-gray-500">Document Table</label>
              <select
                value={form.targetTable}
                onChange={(e) => handleTargetTableChange(e.target.value)}
                disabled={isEditing}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-gray-100"
              >
                {DOCUMENT_TARGET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-gray-500">Document Type *</label>
              <select
                value={form.documentType}
                onChange={(e) => handleInputChange('documentType', e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                required
              >
                <option value="">Select document type</option>
                {currentDocumentTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-gray-500">Document Number *</label>
              <input
                type="text"
                value={form.documentNumber}
                onChange={(e) => handleInputChange('documentNumber', e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-gray-500">Issue Date</label>
              <input
                type="date"
                value={form.issueDate}
                onChange={(e) => handleInputChange('issueDate', e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-gray-500">Expiry Date</label>
              <input
                type="date"
                value={form.expiryDate}
                onChange={(e) => handleInputChange('expiryDate', e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-gray-500">Country</label>
              <select
                value={form.countryId}
                onChange={(e) => handleInputChange('countryId', e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select country</option>
                {countries.map((country) => (
                  <option key={country.id} value={country.id}>{country.countryName}</option>
                ))}
              </select>
              {loadingCountries && <p className="mt-1 text-xs text-gray-500">Loading countries...</p>}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium uppercase text-gray-500">Document Image</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleInputChange('file', e.target.files?.[0] || null)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase text-gray-500">Notes</label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={resetAndClose}
              className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
