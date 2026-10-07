import { useState, useEffect, useId } from 'react'
import { FolderTree } from 'lucide-react'
import type { MaterialCategory } from '@/types/maritime.types'
import type { CreateMaterialCategoryDto, UpdateMaterialCategoryDto } from '@/services/materialService'
import { useTranslationSafe } from '@/contexts/I18nContext'
import { Button, Modal, FormSection, FormAlert, Input, Select, Textarea } from '@/components/common'

interface CategoryFormModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: CreateMaterialCategoryDto | UpdateMaterialCategoryDto) => Promise<void>
  category?: MaterialCategory | null
  categories: MaterialCategory[]
  title: string
}

export function CategoryFormModal({
  isOpen,
  onClose,
  onSubmit,
  category,
  categories,
  title,
}: CategoryFormModalProps) {
  const { t } = useTranslationSafe()
  const formId = useId()
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      busy={loading}
      closeOnBackdrop={false}
      icon={<FolderTree />}
      title={title}
      footer={
        <>
          <Button onClick={onClose} disabled={loading}>{t('common.cancel')}</Button>
          <Button type="submit" form={formId} variant="primary" loading={loading}>
            {loading ? t('materials.saving') : category ? t('materials.update') : t('materials.create')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormAlert>{error}</FormAlert>

        <FormSection title="Thông tin danh mục">
          <Input label="Mã danh mục" required maxLength={50} value={formData.categoryCode} placeholder="VD: CAT-001"
            onChange={e => setFormData({ ...formData, categoryCode: e.target.value })} />
          <Input label="Tên danh mục" required maxLength={200} value={formData.name} placeholder="Tên danh mục"
            onChange={e => setFormData({ ...formData, name: e.target.value })} />
          <Select label="Danh mục cha" value={formData.parentCategoryId || ''} placeholder="Không (Cấp cao nhất)"
            options={availableParents.map(c => ({ value: c.id, label: `${c.name} (${c.categoryCode})` }))}
            onChange={e => setFormData({ ...formData, parentCategoryId: e.target.value ? Number(e.target.value) : null })} />
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-ink">
            <input type="checkbox" checked={formData.isActive} className="h-4 w-4 rounded border-line accent-primary"
              onChange={e => setFormData({ ...formData, isActive: e.target.checked })} />
            Đang hoạt động
          </label>
        </FormSection>

        <FormSection title="Mô tả" columns={1}>
          <Textarea rows={3} maxLength={1000} value={formData.description || ''} placeholder="Mô tả tùy chọn..."
            onChange={e => setFormData({ ...formData, description: e.target.value })} />
        </FormSection>
      </form>
    </Modal>
  )
}
