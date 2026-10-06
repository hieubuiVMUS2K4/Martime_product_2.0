import { useState, useEffect, useMemo } from 'react'
import { X, Search, ChevronRight, ChevronDown, Check } from 'lucide-react'
import { equipmentAssetService } from '@/services/equipment-asset.service'
import { materialService } from '@/services/materialService'
import type { AssignEquipmentDto, MaterialItemEquipmentLink } from '@/services/materialService'
import type { EquipmentAsset } from '@/types/pms.types'

interface AssignEquipmentModalProps {
  vesselId?: string
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  selectedMaterialIds: string[]
  /** Names shown for reference */
  selectedMaterialNames: string[]
}

interface TreeNode extends EquipmentAsset {
  children: TreeNode[]
}

function buildTree(flatList: EquipmentAsset[]): TreeNode[] {
  const map = new Map<string, TreeNode>()
  const roots: TreeNode[] = []

  for (const item of flatList) {
    map.set(item.id, { ...item, children: [] })
  }

  for (const item of flatList) {
    const node = map.get(item.id)!
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

export function AssignEquipmentModal({
  vesselId,
  isOpen,
  onClose,
  onSuccess,
  selectedMaterialIds,
  selectedMaterialNames,
}: AssignEquipmentModalProps) {
  const [equipmentList, setEquipmentList] = useState<EquipmentAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [selectedEquipment, setSelectedEquipment] = useState<Set<string>>(new Set())
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [notes, setNotes] = useState('')

  // Load existing links when single item selected
  const [existingLinks, setExistingLinks] = useState<MaterialItemEquipmentLink[]>([])

  useEffect(() => {
    if (!isOpen) return
    setSelectedEquipment(new Set())
    setExpandedNodes(new Set())
    setSearch('')
    setNotes('')
    setError(null)
    setExistingLinks([])

    const load = async () => {
      setLoading(true)
      try {
        const list = await equipmentAssetService.getTree(vesselId)
        setEquipmentList(list)
        // Auto-expand root
        const roots = list.filter(e => !e.parentId)
        setExpandedNodes(new Set(roots.map(r => r.id)))

        // Load existing links for the first selected item
        if (selectedMaterialIds.length === 1) {
          const links = await materialService.getItemEquipment(selectedMaterialIds[0])
          setExistingLinks(links)
          // Pre-select already-linked equipment
          setSelectedEquipment(new Set(links.map(l => l.equipmentAssetId)))
        }
      } catch {
        setError('Không thể tải danh sách thiết bị')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [isOpen, selectedMaterialIds, vesselId])

  const tree = useMemo(() => buildTree(equipmentList), [equipmentList])

  const matchesSearch = (node: EquipmentAsset) => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      node.assetName?.toLowerCase().includes(s) ||
      node.assetCode?.toLowerCase().includes(s) ||
      node.category?.toLowerCase().includes(s)
    )
  }

  const hasMatchingDescendant = (node: TreeNode): boolean => {
    if (matchesSearch(node)) return true
    return node.children.some(c => hasMatchingDescendant(c))
  }

  const toggleSelect = (id: string) => {
    setSelectedEquipment(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleExpand = (id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSubmit = async () => {
    if (selectedEquipment.size === 0) {
      setError('Vui lòng chọn ít nhất 1 thiết bị')
      return
    }
    setError(null)
    setSaving(true)
    try {
      // Remove unlinked equipment (only for single-item mode)
      if (selectedMaterialIds.length === 1) {
        const toRemove = existingLinks.filter(l => !selectedEquipment.has(l.equipmentAssetId))
        for (const link of toRemove) {
          await materialService.removeEquipmentLink(link.materialItemId, link.equipmentAssetId)
        }
      }

      // Add new links
      const existingEqIds = new Set(existingLinks.map(l => l.equipmentAssetId))
      const newEqIds = [...selectedEquipment].filter(id => !existingEqIds.has(id))

      if (newEqIds.length > 0) {
        const dto: AssignEquipmentDto = {
          materialItemIds: selectedMaterialIds,
          equipmentAssetIds: newEqIds,
          notes: notes || null,
        }
        await materialService.assignEquipment(dto)
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.error || err.message || 'Gán thiết bị thất bại')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const renderTreeNode = (node: TreeNode, depth = 0): React.ReactNode => {
    if (!hasMatchingDescendant(node)) return null

    const hasChildren = node.children.length > 0
    const isExpanded = expandedNodes.has(node.id)
    const isSelected = selectedEquipment.has(node.id)

    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 py-1.5 px-2 hover:bg-gray-50 cursor-pointer rounded ${
            isSelected ? 'bg-[#eef2f7]' : ''
          }`}
          style={{ paddingLeft: depth * 20 + 8 }}
        >
          {/* Expand toggle */}
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleExpand(node.id)}
              className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-gray-600"
            >
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
          ) : (
            <span className="w-5" />
          )}

          {/* Checkbox - only for leaf equipment (or any) */}
          <button
            type="button"
            onClick={() => toggleSelect(node.id)}
            className={`w-5 h-5 flex items-center justify-center border rounded ${
              isSelected
                ? 'bg-[#0b2545] border-accent text-white'
                : 'border-gray-300 hover:border-[#a9bdd6]'
            }`}
          >
            {isSelected && <Check className="w-3 h-3" />}
          </button>

          {/* Label */}
          <div className="flex-1 text-sm" onClick={() => toggleSelect(node.id)}>
            <span className="font-medium text-gray-800">{node.assetCode}</span>
            <span className="text-gray-500 ml-2">{node.assetName}</span>
            {node.category && (
              <span className="ml-2 text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                {node.category}
              </span>
            )}
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && node.children.map(c => renderTreeNode(c, depth + 1))}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />

        <div className="relative w-full max-w-2xl bg-white rounded-lg shadow-xl flex flex-col max-h-[85vh]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 shrink-0">
            <h2 className="text-xl font-semibold text-gray-900">Gán thiết bị cho vật tư</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-4 flex-1 overflow-y-auto min-h-0 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {/* Selected materials info */}
            <div className="bg-[#eef2f7] border border-[#d6dee8] rounded-lg p-3">
              <p className="text-sm font-medium text-primary mb-1">
                Vật tư đã chọn ({selectedMaterialIds.length}):
              </p>
              <div className="flex flex-wrap gap-1">
                {selectedMaterialNames.map((name, i) => (
                  <span key={i} className="text-xs bg-[#dce9f8] text-[#16375f] px-2 py-0.5 rounded">
                    {name}
                  </span>
                ))}
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Tìm thiết bị theo mã, tên, loại..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#1b4c7e] focus:border-transparent"
              />
            </div>

            {/* Equipment tree */}
            <div className="border border-gray-200 rounded-lg overflow-y-auto" style={{ maxHeight: 350 }}>
              {loading ? (
                <div className="flex items-center justify-center py-10 text-gray-500 text-sm">
                  Đang tải danh sách thiết bị...
                </div>
              ) : tree.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-gray-400 text-sm">
                  Không có thiết bị nào
                </div>
              ) : (
                <div className="py-1">{tree.map(n => renderTreeNode(n))}</div>
              )}
            </div>

            {/* Selected count */}
            <p className="text-sm text-gray-500">
              Đã chọn: <span className="font-semibold text-[#0b2545]">{selectedEquipment.size}</span> thiết bị
            </p>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ghi chú (không bắt buộc)"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#1b4c7e] focus:border-transparent"
                maxLength={500}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-6 py-4 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || selectedEquipment.size === 0}
              className="px-4 py-2 bg-[#0b2545] text-white rounded-lg text-sm font-medium hover:bg-[#16375f] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Đang lưu...' : 'Gán thiết bị'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

