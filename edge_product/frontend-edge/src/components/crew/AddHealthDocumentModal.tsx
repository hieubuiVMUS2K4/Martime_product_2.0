import { X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import { maritimeService } from '../../services/maritime.service'

type AddHealthDocumentModalProps = {
  isOpen: boolean
  crewMemberId: string
  onClose: () => void
  onSuccess: () => void
  /** CÃ³ giÃ¡ trá»‹ = Ä‘ang Sá»¬A tÃ i liá»‡u nÃ y; bá» trá»‘ng = thÃªm má»›i. */
  editingDocument?: any | null
}

/** Chuáº©n hoÃ¡ ngÃ y vá» dáº¡ng yyyy-MM-dd cho input type="date". */
const toDateInput = (v?: string | null) => (v ? String(v).slice(0, 10) : '')

const HEALTH_DOCUMENT_TYPES = [
  { value: 'medical_certificate', label: 'Medical Certificate' },
  { value: 'vaccination_record', label: 'Vaccination Record' },
  { value: 'yellow_fever', label: 'Yellow Fever Certificate' },
  { value: 'covid_vaccination', label: 'COVID-19 Vaccination' },
  { value: 'health_insurance', label: 'Health Insurance' },
  { value: 'other', label: 'Other' },
]

export default function AddHealthDocumentModal({ isOpen, crewMemberId, onClose, onSuccess, editingDocument }: AddHealthDocumentModalProps) {
  const [documentType, setDocumentType] = useState('')
  const [documentNumber, setDocumentNumber] = useState('')
  const [issueDate, setIssueDate] = useState('')
  const [expiryDate, setExpiryDate] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)

  const isEditing = !!editingDocument

  // Náº¡p sáºµn dá»¯ liá»‡u khi má»Ÿ á»Ÿ cháº¿ Ä‘á»™ sá»­a, dá»n form khi má»Ÿ Ä‘á»ƒ thÃªm má»›i.
  useEffect(() => {
    if (!isOpen) return
    setDocumentType(editingDocument?.documentType || '')
    setDocumentNumber(editingDocument?.documentNumber || '')
    setIssueDate(toDateInput(editingDocument?.issueDate))
    setExpiryDate(toDateInput(editingDocument?.expiryDate))
    setNotes(editingDocument?.notes || '')
    setFile(null)
  }, [isOpen, editingDocument])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!documentType || !documentNumber) {
      toast.warning('Please fill in all required fields')
      return
    }

    try {
      setLoading(true)
      if (isEditing) {
        await maritimeService.crew.updateIdentityDocument(editingDocument.id, {
          targetTable: 'health_documents',
          documentType,
          documentNumber,
          issueDate: issueDate || null,
          expiryDate: expiryDate || null,
          notes: notes || null,
        })
        if (file) {
          const fd = new FormData()
          fd.append('file', file)
          fd.append('targetTable', 'health_documents')
          await maritimeService.crew.updateDocumentFile(editingDocument.id, fd)
        }
      } else {
        const formData = new FormData()
        formData.append('targetTable', 'health_documents')
        formData.append('documentType', documentType)
        formData.append('documentNumber', documentNumber)
        if (issueDate) formData.append('issueDate', issueDate)
        if (expiryDate) formData.append('expiryDate', expiryDate)
        if (notes) formData.append('notes', notes)
        if (file) formData.append('file', file)

        await maritimeService.crew.createIdentityDocument(crewMemberId, formData)
      }
      
      // Reset form
      setDocumentType('')
      setDocumentNumber('')
      setIssueDate('')
      setExpiryDate('')
      setNotes('')
      setFile(null)
      
      onSuccess()
      onClose()
      toast.success(isEditing ? 'Health document updated successfully!' : 'Health document added successfully!')
    } catch (error: any) {
      console.error('Failed to add health document:', error)
      toast.error(error.message || (isEditing ? 'Failed to update health document' : 'Failed to add health document'))
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{isEditing ? 'Edit Health Document' : 'Add Health Document'}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Document Type <span className="text-red-500">*</span>
            </label>
            <select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
              required
            >
              <option value="">Select document type</option>
              {HEALTH_DOCUMENT_TYPES.map(type => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Document Number <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
              placeholder="Enter document number"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Issue Date
              </label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Expiry Date
              </label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Document File (Image)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
            />
            {file && (
              <p className="text-sm text-gray-500 mt-1">Selected: {file.name}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
              placeholder="Additional notes..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Adding...' : 'Add Document'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

