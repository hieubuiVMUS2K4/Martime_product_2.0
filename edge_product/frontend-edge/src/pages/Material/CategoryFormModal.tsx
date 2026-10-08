import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import type { MaterialCategory } from '@/types/maritime.types'
import type { CreateMaterialCategoryDto, UpdateMaterialCategoryDto } from '@/services/materialService'
import { useTranslationSafe } from '@/contexts/I18nContext'

interface CategoryFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateMaterialCategoryDto | UpdateMaterialCategoryDto) => Promise<void>
  category?: MaterialCategory | null
  categories: MaterialCategory[]
  title: string
}

const inp = 'w-full px-2 py-1.5 border border-gray-300 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white'
const lbl = 'text-sm text-gray-600 whitespace-nowrap text-right pr-3'

export function CategoryFormModal({
  isOpen,
  onClose,
  onSubmit,
  category,
  categories,
  title,
}: CategoryFormModalProps) {
  const { t } = useTranslationSafe()
  const [formData, setFormData] = useState<CreateMaterialCategoryDto>({
    categoryCode: '',
    name: '',
    description: '',
    parentCategoryId: null,
    isActive: true,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (category) {
      setFormData({
        categoryCode: category.categoryCode,
        name: category.name,
        description: category.description || '',
        parentCategoryId: category.parentCategoryId || null,
        isActive: category.isActive,
      })
    } else {
      setFormData({
        categoryCode: '',
        name: '',
        description: '',
        parentCategoryId: null,
        isActive: true,
      })
    }
    setError(null)
  }, [category, isOpen])

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await onSubmit(formData)
      onClose()
    } catch (err: any) {
      setError(err.message || t('materials.category.saveFailed'))
    } finally {
      setLoading(false)
    }
  }

  const availableParents = categories.filter((c) => !category || c.id !== category.id)

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />

        <div className="relative w-full max-w-2xl bg-white rounded-lg shadow-xl flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 shrink-0">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
            {error && (
              <div className="mx-5 mt-3 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>
            )}

            <div className="p-5 space-y-5">
              {/* General Info */}
              <div>
                <div className="bg-slate-700 text-white text-sm font-semibold px-3 py-1.5 rounded-t">{t('materials.category.sectionInfo')}</div>
                <div className="border border-t-0 border-gray-200 rounded-b p-4 space-y-2.5">
                  <div className="flex items-center">
                    <label className={lbl} style={{ width: 120 }}>{t('materials.category.code')} <span className="text-red-500">*</span></label>
                    <input type="text" required maxLength={50} value={formData.categoryCode} onChange={e => setFormData({ ...formData, categoryCode: e.target.value })} className={inp} placeholder={t('materials.category.codePlaceholder')} />
                  </div>
                  <div className="flex items-center">
                    <label className={lbl} style={{ width: 120 }}>{t('materials.category.name')} <span className="text-red-500">*</span></label>
                    <input type="text" required maxLength={200} value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} className={inp} placeholder={t('materials.category.namePlaceholder')} />
                  </div>
                  <div className="flex items-center">
                    <label className={lbl} style={{ width: 120 }}>{t('materials.category.parentCategory')}</label>
                    <select value={formData.parentCategoryId || ''} onChange={e => setFormData({ ...formData, parentCategoryId: e.target.value ? Number(e.target.value) : null })} className={inp}>
                      <option value="">{t('materials.category.noneTopLevel')}</option>
                      {availableParents.map(c => <option key={c.id} value={c.id}>{c.name} ({c.categoryCode})</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <div className="bg-slate-700 text-white text-sm font-semibold px-3 py-1.5 rounded-t">{t('materials.category.description')}</div>
                <div className="border border-t-0 border-gray-200 rounded-b p-4">
                  <textarea
                    rows={3}
                    maxLength={1000}
                    value={formData.description || ''}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className={`${inp} resize-y`}
                    placeholder={t('materials.category.descriptionPlaceholder')}
                  />
                </div>
              </div>

              {/* Options */}
              <div>
                <div className="bg-slate-700 text-white text-sm font-semibold px-3 py-1.5 rounded-t">{t('materials.category.options')}</div>
                <div className="border border-t-0 border-gray-200 rounded-b p-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={formData.isActive} onChange={e => setFormData({ ...formData, isActive: e.target.checked })} className="w-4 h-4 text-blue-600 rounded" />
                    {t('materials.category.isActive')}
                  </label>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-gray-200 bg-gray-50 sticky bottom-0">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50">
                {t('common.cancel')}
              </button>
              <button type="submit" disabled={loading} className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50">
                {loading ? t('materials.saving') : category ? t('materials.update') : t('materials.create')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
