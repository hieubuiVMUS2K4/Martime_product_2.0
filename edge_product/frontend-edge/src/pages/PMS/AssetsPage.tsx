import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Plus, Upload, Download, Search, Package, Trash2, ChevronDown, ChevronRight, FolderOpen, X, Pencil } from 'lucide-react';
import { getOnboardCrew, type CrewMember } from '@/services/crew.service';
import { EquipmentAssetsTable } from '@/components/pms/EquipmentAssetsTable';
import { emptyEquipmentFilters, matchesEquipmentFilters, type EquipmentFilters } from '@/components/pms/equipment-assets-filters';
import { equipmentAssetService } from '@/services/equipment-asset.service';
import { ImportAssetsModal } from '@/components/pms/ImportAssetsModal';
import { materialService, type EquipmentMaterialLink, type MaterialCatalogItem } from '@/services/materialService';
import { useTranslationSafe } from '@/contexts/I18nContext';
import { toast } from 'sonner';
import type { CreateEquipmentAssetDto, EquipmentAsset } from '@/types/pms.types';

const STATUS_VALUES = ['', 'ACTIVE', 'STANDBY', 'UNDER_MAINTENANCE', 'DECOMMISSIONED', 'IN_STORAGE'] as const;
const ASSET_CATEGORIES = ['SYSTEM', 'UNCLASSIFIED', 'ENGINE', 'GENERATOR', 'PUMP', 'COMPRESSOR', 'SEPARATOR', 'BOILER', 'DECK_MACHINERY', 'NAVIGATION', 'SAFETY', 'ELECTRICAL', 'HVAC'];
const ASSET_CATEGORY_LABELS: Record<string, string> = {
  SYSTEM: 'Nhóm thiết bị', UNCLASSIFIED: 'Chưa phân loại', ENGINE: 'Động cơ', GENERATOR: 'Máy phát điện',
  PUMP: 'Bơm', COMPRESSOR: 'Máy nén', SEPARATOR: 'Máy phân ly', BOILER: 'Nồi hơi',
  DECK_MACHINERY: 'Thiết bị boong', NAVIGATION: 'Thiết bị hàng hải', SAFETY: 'Thiết bị an toàn',
  ELECTRICAL: 'Thiết bị điện', HVAC: 'Điều hòa / thông gió',
};
const CRITICALITY_VALUES = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'];
type CreateNodeMode = 'folder' | 'asset';



/** Build tree từ flat list có parentId */
function buildTree(items: EquipmentAsset[]): EquipmentAsset[] {
  const map = new Map<string, EquipmentAsset>();
  items.forEach(i => map.set(i.id, { ...i, children: [] }));
  const roots: EquipmentAsset[] = [];
  map.forEach(item => {
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children!.push(item);
    } else {
      roots.push(item);
    }
  });
  return roots;
}

/** Lấy tất cả descendant IDs của 1 node (bao gồm chính nó) */
function getDescendantIds(node: EquipmentAsset): Set<string> {
  const ids = new Set<string>();
  const stack = [node];
  while (stack.length) {
    const n = stack.pop()!;
    ids.add(n.id);
    n.children?.forEach(c => stack.push(c));
  }
  return ids;
}

function isFolderNode(node?: EquipmentAsset | null): boolean {
  return !!node && node.category === 'SYSTEM';
}

export default function AssetsPage() {
  const { t } = useTranslationSafe();

  const [assets, setAssets] = useState<EquipmentAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [showImportModal, setShowImportModal] = useState(false);
  const [createNodeMode, setCreateNodeMode] = useState<CreateNodeMode | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('pms-assets-expanded-nodes');
      return saved ? new Set<string>(JSON.parse(saved)) : new Set<string>();
    } catch { return new Set<string>(); }
  });
  // Edit mode & context menu
  const editMode = false;
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string | null } | null>(null);
  const [inlineNew, setInlineNew] = useState<{ parentId: string | null } | null>(null);
  const [inlineCode, setInlineCode] = useState('');
  const [inlineName, setInlineName] = useState('');
  const contextMenuRef = useRef<HTMLDivElement>(null);
  // Table state (view mode)
  const [filters, setFilters] = useState<EquipmentFilters>({ ...emptyEquipmentFilters });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(25);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [equipmentMaterials, setEquipmentMaterials] = useState<EquipmentMaterialLink[]>([]);
  const [materialsLoading, setMaterialsLoading] = useState(false);
  const [showAssignMaterialModal, setShowAssignMaterialModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState<EquipmentAsset | null>(null);
  const [materialAsset, setMaterialAsset] = useState<EquipmentAsset | null>(null);
  const materialRequest = useRef(0);
  const [materialsError, setMaterialsError] = useState('');
  const [isEditingMaterialRow, setIsEditingMaterialRow] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await equipmentAssetService.getTree();
      setAssets(data);
    } catch (error) {
      console.error('Error loading assets:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAssets = async () => {
    const data = await equipmentAssetService.getTree();
    setAssets(data);
  };

  /** Cây phân cấp từ flat list */
  const treeRoots = useMemo(() => buildTree(assets), [assets]);

  /** Map id -> EquipmentAsset (để lookup nhanh) */
  const assetMap = useMemo(() => {
    const m = new Map<string, EquipmentAsset>();
    assets.forEach(a => m.set(a.id, a));
    return m;
  }, [assets]);

  const toggleNode = useCallback((id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      try { localStorage.setItem('pms-assets-expanded-nodes', JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  /** Filtered + paginated assets for table (view mode) */
  const filteredAssets = useMemo(() => {
    let data = assets.filter(a => !isFolderNode(a));
    
    if (selectedNodeId) {
      const buildFromFlat = (id: string): EquipmentAsset => {
        const node = { ...assetMap.get(id)!, children: [] as EquipmentAsset[] };
        assets.filter(a => a.parentId === id).forEach(child => { node.children!.push(buildFromFlat(child.id)); });
        return node;
      };
      const ids = getDescendantIds(buildFromFlat(selectedNodeId));
      data = data.filter(a => ids.has(a.id));
    }
    
    return data.filter(asset => matchesEquipmentFilters(asset, filters));
  }, [assets, selectedNodeId, filters, assetMap]);

  const totalPages = Math.ceil(filteredAssets.length / itemsPerPage);
  const paginatedAssets = useMemo(() => filteredAssets.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredAssets, currentPage, itemsPerPage]);

  useEffect(() => { setCurrentPage(1); setSelectedRows(new Set()); }, [filters, selectedNodeId]);

  const toggleRow = (id: string) => setSelectedRows(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAllRows = () => {
    if (paginatedAssets.every(a => selectedRows.has(a.id))) setSelectedRows(new Set());
    else setSelectedRows(new Set(paginatedAssets.map(a => a.id)));
  };
  const handleBulkDelete = async () => {
    if (selectedRows.size === 0) return;
    toast(t('pms.assets.confirmBulkDelete', { count: selectedRows.size }), {
      action: {
        label: t('pms.assets.delete'),
        onClick: async () => {
          try {
            const count = selectedRows.size;
            await Promise.all([...selectedRows].map(id => equipmentAssetService.delete(id)));
            setSelectedRows(new Set());
            await loadAssets();
            toast.success(t('pms.assets.deleteManySuccess', { count }));
          } catch (err: any) {
            toast.error(err?.response?.data?.error || t('pms.assets.deleteFailed'));
          }
        },
      },
      cancel: { label: t('common.cancel'), onClick: () => {} },
      duration: 8000,
    });
  };

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  const handleDelete = async (asset: EquipmentAsset) => {
    toast(t('pms.assets.confirmDelete', { name: asset.assetName }), {
      action: {
        label: t('pms.assets.delete'),
        onClick: async () => {
          try {
            await equipmentAssetService.delete(asset.id);
            if (selectedNodeId === asset.id) setSelectedNodeId(null);
            await loadAssets();
            toast.success(t('pms.assets.deleteSuccess', { name: asset.assetName }));
          } catch (err: any) {
            toast.error(err?.response?.data?.error || t('pms.assets.deleteFailed'));
          }
        },
      },
      cancel: { label: t('common.cancel'), onClick: () => {} },
      duration: 8000,
    });
  };

  const startInlineNew = (parentId: string | null) => {
    if (parentId) {
      setExpandedNodes(prev => { const n = new Set(prev); n.add(parentId); return n; });
    }
    setInlineNew({ parentId });
    setInlineCode('');
    setInlineName('');
    setContextMenu(null);
  };

  const handleInlineKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setInlineNew(null); return; }
    if (e.key === 'Enter') {
      if (!inlineCode.trim() || !inlineName.trim()) return;
      try {
        const created = await equipmentAssetService.create({
          assetCode: inlineCode.trim(),
          assetName: inlineName.trim(),
          category: 'SYSTEM',
          parentId: inlineNew?.parentId ?? undefined,
        });
        setInlineNew(null);
        await loadAssets();
        setSelectedNodeId(created.id);
        toast.success(t('pms.assets.createSuccess', { name: created.assetName }));
      } catch (err: any) {
        toast.error(err?.response?.data?.error || t('pms.assets.createFailed'));
      }
    }
  };

  const handleDownloadTemplate = async () => {
    const XLSX = await import('xlsx');
    const rows = [
      ['AssetCode', 'AssetName', 'Category', 'Manufacturer', 'Model', 'SerialNumber', 'Location', 'Criticality', 'ParentAssetCode'],
      ['TREE-SYS-001', 'Engine Room Tree System', 'SYSTEM', '', '', '', 'Engine Room', 'CRITICAL', ''],
      ['TREE-ME-001', 'Main Engine Tree Test', 'ENGINE', 'MAN B&W', '6S50MC-C', 'ME-TREE-001', 'Engine Room', 'CRITICAL', 'TREE-SYS-001'],
      ['TREE-PUMP-001', 'Cooling Sea Water Pump Tree Test', 'PUMP', 'Grundfos', 'CRN 45', 'PMP-TREE-001', 'Engine Room', 'HIGH', 'TREE-SYS-001'],
      ['TREE-GEN-001', 'Emergency Generator Tree Test', 'GENERATOR', 'Cummins', 'QSB7', 'GEN-TREE-001', 'Emergency Generator Room', 'CRITICAL', 'TREE-SYS-001'],
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Equipment Assets');
    XLSX.writeFile(workbook, 'equipment-assets-tree-template.xlsx');
    return;

    {
    const template = [
      ['AssetCode', 'AssetName', 'Category', 'Manufacturer', 'Model', 'SerialNumber', 'Location', 'Criticality', 'EquipmentGroupCode', 'ParentAssetCode'],
      ['PROP-SYS', 'Hệ thống Động lực', 'SYSTEM', '', '', '', 'Engine Room', 'CRITICAL', ''],
      ['ME-TEST-001', 'Main Engine Test', 'ENGINE', 'MAN B&W', '6S50MC-C', 'ME-T001', 'Engine Room', 'CRITICAL', '', 'ER-SYS-TEST'],
      ['PUMP-TEST-001', 'Cooling Sea Water Pump Test', 'PUMP', 'Grundfos', 'CRN 45', 'PMP-T001', 'Engine Room', 'HIGH', '', 'ER-SYS-TEST'],
      ['GEN-TEST-001', 'Emergency Generator Test', 'GENERATOR', 'Cummins', 'QSB7', 'GEN-T001', 'Emergency Generator Room', 'CRITICAL', '', 'ER-SYS-TEST'],
    ];
    const worksheet = XLSX.utils.aoa_to_sheet(template);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Equipment Assets');
    XLSX.writeFile(workbook, 'equipment-assets-template.xlsx');
    }
  };

  const selectedNode = selectedNodeId ? assetMap.get(selectedNodeId) ?? null : null;
  const selectedNodeName = selectedNode?.assetName ?? null;
  const selectedNodeIsFolder = !!selectedNode && isFolderNode(selectedNode);


  const loadEquipmentMaterials = useCallback(async (equipmentId: string) => {
    const request = ++materialRequest.current;
    setMaterialsLoading(true); setMaterialsError('');
    try {
      const data = await materialService.getMaterialsByEquipment(equipmentId);
      if (request === materialRequest.current) setEquipmentMaterials(data);
    } catch (error: any) {
      if (request === materialRequest.current) {
        setEquipmentMaterials([]);
        setMaterialsError(error?.response?.data?.error || 'Không thể tải vật tư liên kết.');
      }
    } finally {
      if (request === materialRequest.current) setMaterialsLoading(false);
    }
  }, []);

  useEffect(() => {
    setEquipmentMaterials([]); setIsEditingMaterialRow(false);
    if (materialAsset) loadEquipmentMaterials(materialAsset.id);
    return () => { materialRequest.current++; };
  }, [materialAsset?.id, loadEquipmentMaterials]);

  useEffect(() => {
    if (!materialAsset || isEditingMaterialRow) return;
    const refresh = () => loadEquipmentMaterials(materialAsset.id);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [materialAsset?.id, isEditingMaterialRow, loadEquipmentMaterials]);

  /** Render đệ quy 1 node trong tree */
  const renderTreeNode = (node: EquipmentAsset, depth = 0): React.ReactNode => {
    const hasChildren = (node.children?.length ?? 0) > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNodeId === node.id;
    const childCount = node.children?.length ?? 0;
    const isFolder = isFolderNode(node);

    return (
      <div key={node.id}>
        <div
          style={{ paddingLeft: `${12 + depth * 14}px` }}
          className={`w-full flex items-center gap-1.5 pr-3 py-1.5 text-xs cursor-pointer select-none ${
            isSelected ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
          }`}
          data-asset-node="true"
          onClick={() => setSelectedNodeId(node.id)}
          onContextMenu={editMode ? (e) => {
            e.preventDefault();
            e.stopPropagation();
            setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id });
          } : undefined}
        >
          <span
            className={`flex-shrink-0 ${hasChildren ? 'cursor-pointer' : ''}`}
            onClick={e => { e.stopPropagation(); if (hasChildren) toggleNode(node.id); }}
          >
            {hasChildren ? (
              isExpanded
                ? <ChevronDown className="w-3 h-3 text-blue-500" />
                : <ChevronRight className="w-3 h-3 text-blue-500" />
            ) : (
              <span className="w-3 block" />
            )}
          </span>
          {isFolder ? (
            <FolderOpen className="w-3 h-3 flex-shrink-0 text-amber-500" />
          ) : (
            <Package className="w-3 h-3 flex-shrink-0 text-slate-400" />
          )}
          <span className="flex-1 text-left leading-snug truncate" title={`${node.assetCode} — ${node.assetName}`}>
            {isFolder && node.assetCode && <span className="mr-1.5 font-semibold text-slate-500">{node.assetCode}</span>}
            {node.assetName}
          </span>
          {childCount > 0 && (
            <span className="text-gray-400 text-[10px] flex-shrink-0">{childCount}</span>
          )}
        </div>

        {/* Inline input để thêm con mới (kiểu VSCode) */}
        {inlineNew?.parentId === node.id && (
          <div
            style={{ paddingLeft: `${12 + (depth + 1) * 14 + 6}px` }}
            className="flex items-center gap-1 pr-2 py-1 bg-blue-50 border-l-2 border-blue-400"
          >
            <FolderOpen className="w-3 h-3 flex-shrink-0 text-blue-400" />
            <input
              autoFocus
              placeholder={t('pms.assets.codePlaceholder')}
              value={inlineCode}
              onChange={e => setInlineCode(e.target.value)}
              onKeyDown={handleInlineKeyDown}
              className="w-16 text-xs border border-blue-300 rounded px-1 py-0.5 outline-none focus:border-blue-500 bg-white"
            />
            <input
              placeholder={t('pms.assets.namePlaceholder')}
              value={inlineName}
              onChange={e => setInlineName(e.target.value)}
              onKeyDown={handleInlineKeyDown}
              className="flex-1 text-xs border border-blue-300 rounded px-1 py-0.5 outline-none focus:border-blue-500 bg-white min-w-0"
            />
            <button onClick={() => setInlineNew(null)} className="text-gray-400 hover:text-gray-600 text-xs px-1 flex-shrink-0">✕</button>
          </div>
        )}

        {isExpanded && node.children?.map(child => renderTreeNode(child, depth + 1))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{t('pms.assets.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-white">

      {/* ── HEADER ROW ── */}
      <div className="flex flex-shrink-0 border-b border-gray-200">

        {/* Header trái: root node "Tất cả thiết bị" */}
        <div
          className={`w-64 flex-shrink-0 flex items-center border-r border-gray-200 ${
            selectedNodeId === null
              ? 'bg-blue-800 text-white'
              : 'text-gray-700 bg-white'
          }`}
        >
          <button
            onClick={() => setSelectedNodeId(null)}
            className="flex-1 flex items-center gap-1.5 px-3 py-3 text-sm font-semibold text-left min-w-0 hover:opacity-90"
          >
            <FolderOpen className="w-4 h-4 flex-shrink-0" />
            <span className="flex-1 text-left truncate">
              {t('pms.assets.allEquipment')}
            </span>
          </button>
            <button
              type="button"
              onClick={() => {
                setSelectedNodeId(null);
                setCreateNodeMode('folder');
              }}
              className={`flex-shrink-0 mr-2 p-1.5 rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
                selectedNodeId === null
                  ? 'text-blue-200 hover:text-white hover:bg-blue-700'
                  : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'
              }`}
              title="Thêm nhóm thiết bị"
              aria-label="Thêm nhóm thiết bị"
            >
              <Plus className="w-4 h-4" />
            </button>
        </div>

        {/* Header phải: title + action buttons */}
        <div className="min-w-0 flex-1 flex items-center justify-between gap-3 px-4 py-3 bg-white">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">
              ≡ {t('pms.assets.equipmentList')}{selectedNodeName ? ` - ${selectedNodeName}` : ''}
            </span>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
              {filteredAssets.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* View mode: bulk delete + copy */}
            {!editMode && (
              <>
                <button
                  onClick={handleBulkDelete}
                  disabled={selectedRows.size === 0}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded ${selectedRows.size > 0 ? 'text-red-600 hover:bg-red-50 border-red-300' : 'text-gray-400 cursor-not-allowed border-gray-300'}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t('pms.assets.deleteMany')}{selectedRows.size > 0 ? ` (${selectedRows.size})` : ''}
                </button>

              </>
            )}
            {selectedNodeIsFolder && selectedNode && <button onClick={() => setEditingAsset(selectedNode)} className="inline-flex items-center gap-1.5 rounded border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"><Pencil className="h-3.5 w-3.5" />Chỉnh sửa nhóm thiết bị</button>}
            <button
              onClick={() => setCreateNodeMode('asset')}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-blue-600 rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              title="Thêm thiết bị"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm thiết bị
            </button>
            <button onClick={handleDownloadTemplate} className="p-1.5 border border-gray-300 rounded text-gray-500 hover:bg-gray-50" title={t('pms.assets.downloadTemplate')}>
              <Download className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setShowImportModal(true)} className="p-1.5 border border-gray-300 rounded text-gray-500 hover:bg-gray-50" title={t('pms.assets.import')}>
              <Upload className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── BODY: tree trái + bảng phải ── */}
      <div className="flex min-h-0 flex-1 overflow-hidden">

        {/* LEFT: cây phân cấp thiết bị */}
        <div
          className="w-64 flex-shrink-0 flex flex-col min-h-0 border-r border-gray-200 bg-white"
          onContextMenu={editMode ? (e) => {
            // chỉ trigger khi click vào vùng trống (không phải node)
            if ((e.target as HTMLElement).closest('[data-asset-node]') === null) {
              e.preventDefault();
              setContextMenu({ x: e.clientX, y: e.clientY, nodeId: null });
            }
          } : undefined}
        >
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
          {treeRoots.length === 0 && !inlineNew ? (
            <div className="px-4 py-6 text-xs text-gray-400 text-center">
              {editMode ? t('pms.assets.rightClickToAdd') : t('pms.assets.noEquipmentTree')}
            </div>
          ) : (
            treeRoots.map(node => renderTreeNode(node, 0))
          )}
          {/* Inline input thêm root mới */}
          {inlineNew?.parentId === null && (
            <div className="flex items-center gap-1 px-3 py-1 bg-blue-50 border-l-2 border-blue-400 mx-1 mt-1 rounded">
              <FolderOpen className="w-3 h-3 flex-shrink-0 text-blue-400" />
              <input
                autoFocus
                placeholder={t('pms.assets.codePlaceholder')}
                value={inlineCode}
                onChange={e => setInlineCode(e.target.value)}
                onKeyDown={handleInlineKeyDown}
                className="w-16 text-xs border border-blue-300 rounded px-1 py-0.5 outline-none focus:border-blue-500 bg-white"
              />
              <input
                placeholder={t('pms.assets.namePlaceholder')}
                value={inlineName}
                onChange={e => setInlineName(e.target.value)}
                onKeyDown={handleInlineKeyDown}
                className="flex-1 text-xs border border-blue-300 rounded px-1 py-0.5 outline-none focus:border-blue-500 bg-white min-w-0"
              />
              <button onClick={() => setInlineNew(null)} className="text-gray-400 hover:text-gray-600 text-xs px-1 flex-shrink-0">✕</button>
            </div>
          )}
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <EquipmentAssetsTable
            assets={paginatedAssets} allAssets={assets} selectedRows={selectedRows}
            rowOffset={(currentPage - 1) * itemsPerPage}
            filters={filters}
            onFilter={(key, value) => setFilters(prev => ({ ...prev, [key]: value }))}
            onToggleRow={toggleRow} onToggleAll={toggleAllRows}
            onMaterials={setMaterialAsset} onEdit={setEditingAsset} onDelete={handleDelete}
          />
              {/* Pagination */}
              <div className="flex items-center justify-center px-4 py-2 border-t border-gray-200 bg-white flex-shrink-0 text-xs text-gray-600">
                <div className="flex items-center gap-1">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">‹</button>
                  {[...Array(Math.min(5, totalPages))].map((_, i) => {
                    let page: number;
                    if (totalPages <= 5) page = i + 1;
                    else if (currentPage <= 3) page = i + 1;
                    else if (currentPage >= totalPages - 2) page = totalPages - 4 + i;
                    else page = currentPage - 2 + i;
                    return (
                      <button key={page} onClick={() => setCurrentPage(page)} className={`w-7 h-7 flex items-center justify-center border rounded text-xs ${currentPage === page ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-gray-50'}`}>{page}</button>
                    );
                  })}
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages || totalPages === 0} className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">›</button>
                </div>
              </div>
        </div>
      </div>

      {materialAsset && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
        <div role="dialog" aria-modal="true" aria-labelledby="linked-materials-title" className="flex h-[75vh] max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
            <div><h2 id="linked-materials-title" className="text-base font-semibold text-slate-900">Vật tư liên kết</h2><p className="mt-1 text-sm text-slate-500">{materialAsset.assetCode} — {materialAsset.assetName}</p></div>
            <div className="flex items-center gap-3"><button onClick={() => setShowAssignMaterialModal(true)} className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"><Plus className="h-4 w-4" />Gán vật tư</button><button type="button" aria-label="Đóng" onClick={() => setMaterialAsset(null)} className="rounded p-1 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button></div>
          </div>
          {materialsError ? <div role="alert" className="m-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{materialsError}<button onClick={() => loadEquipmentMaterials(materialAsset.id)} className="ml-3 underline">Thử lại</button></div> : <EquipmentMaterialsPanel
            t={t} materials={equipmentMaterials} loading={materialsLoading}
            onEditingChange={setIsEditingMaterialRow}
            onUpdate={async (material, quantityRequired, notes) => {
              if (material.inheritedFrom) return;
              await materialService.updateEquipmentLink(material.materialItemId, materialAsset.id, { quantityRequired, notes });
              setEquipmentMaterials(prev => prev.map(item => item.linkId === material.linkId ? { ...item, quantityRequired, notes } : item));
              toast.success('Đã cập nhật vật tư yêu cầu');
            }}
            onRemove={async material => {
              if (material.inheritedFrom) return;
              await materialService.removeEquipmentLink(material.materialItemId, materialAsset.id);
              setEquipmentMaterials(prev => prev.filter(item => item.linkId !== material.linkId));
              toast.success('Đã xóa liên kết vật tư');
            }}
          />}
          <div className="flex shrink-0 justify-end border-t border-slate-200 bg-slate-50 px-5 py-3"><button onClick={() => setMaterialAsset(null)} className="rounded border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-100">Đóng</button></div>
        </div>
      </div>}

      {/* Import Modal */}
      <ImportAssetsModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={loadAssets}
      />

      <CreateAssetModal
        mode={createNodeMode}
        assets={assets}
        defaultParentId={selectedNodeId}
        onClose={() => setCreateNodeMode(null)}
        onSuccess={async (createdId, parentId) => {
          await loadAssets();
          if (parentId) {
            setExpandedNodes(prev => {
              const next = new Set(prev);
              next.add(parentId);
              return next;
            });
          }
          setSelectedNodeId(createdId);
          setCreateNodeMode(null);
        }}
      />

      <EditAssetModal
        asset={editingAsset}
        onClose={() => setEditingAsset(null)}
        onSuccess={async (updated) => {
          await loadAssets();
          setSelectedNodeId(updated.id);
          setEditingAsset(null);
          toast.success(t('pms.assets.saveSuccess', { name: updated.assetName }));
        }}
      />

      <AssignEquipmentMaterialModal
        isOpen={showAssignMaterialModal}
        asset={materialAsset}
        onClose={() => setShowAssignMaterialModal(false)}
        onAssigned={async () => {
          if (materialAsset) await loadEquipmentMaterials(materialAsset.id);
          setShowAssignMaterialModal(false);
        }}
      />

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 text-xs min-w-[170px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onMouseDown={e => e.stopPropagation()}
        >
          {contextMenu.nodeId ? (
            <>
              <button
                onClick={() => startInlineNew(contextMenu.nodeId)}
                className="w-full px-4 py-2 text-left hover:bg-blue-50 text-gray-700 flex items-center gap-2"
              >
                <Plus className="w-3 h-3 text-blue-500" /> {t('pms.assets.addChildAsset')}
              </button>
              <div className="border-t border-gray-100 my-0.5" />
              <button
                onClick={() => {
                  const a = assetMap.get(contextMenu.nodeId!);
                  if (a) handleDelete(a);
                  setContextMenu(null);
                }}
                className="w-full px-4 py-2 text-left hover:bg-red-50 text-red-600 flex items-center gap-2"
              >
                <Trash2 className="w-3 h-3" /> {t('pms.assets.deleteAsset')}
              </button>
            </>
          ) : (
            <button
              onClick={() => startInlineNew(null)}
              className="w-full px-4 py-2 text-left hover:bg-blue-50 text-gray-700 flex items-center gap-2"
            >
              <Plus className="w-3 h-3 text-blue-500" /> {t('pms.assets.addRootAssetContext')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface CreateAssetModalProps {
  mode: CreateNodeMode | null;
  assets: EquipmentAsset[];
  defaultParentId: string | null;
  onClose: () => void;
  onSuccess: (createdId: string, parentId?: string) => void | Promise<void>;
}

interface EditAssetModalProps {
  asset: EquipmentAsset | null;
  onClose: () => void;
  onSuccess: (asset: EquipmentAsset) => void | Promise<void>;
}

function EditAssetModal({ asset, onClose, onSuccess }: EditAssetModalProps) {
  const { t } = useTranslationSafe();
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<Partial<EquipmentAsset>>({});

  useEffect(() => {
    if (!asset) return;
    setFormData({
      picCrewId: asset.picCrewId || '',
      assetCode: asset.assetCode,
      assetName: asset.assetName,
      category: asset.category,
      manufacturer: asset.manufacturer || '',
      model: asset.model || '',
      serialNumber: asset.serialNumber || '',
      location: asset.location || '',
      criticality: asset.criticality || 'NORMAL',
      status: asset.status || 'ACTIVE',
      currentRunningHours: asset.currentRunningHours ?? 0,
      technicalSpecs: asset.technicalSpecs || '',
      notes: asset.notes || '',
      parentId: asset.parentId,
      isActive: asset.isActive,
    });
  }, [asset]);

  if (!asset) return null;

  const handleChange = (field: keyof EquipmentAsset, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.assetCode?.trim() || !formData.assetName?.trim()) {
      toast.error(t('pms.assets.codeNameRequired'));
      return;
    }

    try {
      setSaving(true);
      const updated = await equipmentAssetService.update(asset.id, {
        ...formData,
        assetCode: formData.assetCode.trim(),
        assetName: formData.assetName.trim(),
        currentRunningHours: Number(formData.currentRunningHours || 0),
      });
      await onSuccess(updated);
    } catch (err: any) {
      toast.error(err?.response?.data?.error || t('pms.assets.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
      <form onSubmit={handleSubmit} className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{t('pms.assets.edit')} {asset.assetName}</h2>
            <p className="mt-0.5 text-xs text-slate-500">{asset.assetCode}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-5 md:grid-cols-2">
          <Field label={t('pms.assets.assetCodeLabel')} required>
            <input value={formData.assetCode || ''} onChange={e => handleChange('assetCode', e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </Field>
          <Field label={t('pms.assets.assetNameLabel')} required>
            <input value={formData.assetName || ''} onChange={e => handleChange('assetName', e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </Field>
          {isFolderNode(asset) && <CrewPicField value={formData.picCrewId || ''} onChange={value => handleChange('picCrewId', value)} />}
          {!isFolderNode(asset) && <>
          <Field label={t('pms.assets.categoryLabel')} required>
            <select value={formData.category || 'ENGINE'} onChange={e => handleChange('category', e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
              {ASSET_CATEGORIES.map(category => <option key={category} value={category}>{ASSET_CATEGORY_LABELS[category]}</option>)}
            </select>
          </Field>
          <Field label={t('pms.assets.locationLabel')}>
            <input value={formData.location || ''} onChange={e => handleChange('location', e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </Field>
          <Field label={t('pms.assets.statusLabel')}>
            <select value={formData.status || 'ACTIVE'} onChange={e => handleChange('status', e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
              {STATUS_VALUES.filter(Boolean).map(status => <option key={status} value={status}>{assetStatusLabel(status)}</option>)}
            </select>
          </Field>
          <Field label={t('pms.assets.criticalityLabel')}>
            <select value={formData.criticality || 'NORMAL'} onChange={e => handleChange('criticality', e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
              {CRITICALITY_VALUES.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </Field>
          <Field label={t('pms.assets.manufacturerLabel')}>
            <input value={formData.manufacturer || ''} onChange={e => handleChange('manufacturer', e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </Field>
          <Field label={t('pms.assets.modelLabel')}>
            <input value={formData.model || ''} onChange={e => handleChange('model', e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </Field>
          <Field label={t('pms.assets.serialNumberLabel')}>
            <input value={formData.serialNumber || ''} onChange={e => handleChange('serialNumber', e.target.value)} className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </Field>
          <Field label={t('pms.assets.runningHoursLabel')}>
            <input type="number" value={formData.currentRunningHours ?? 0} onChange={e => handleChange('currentRunningHours', Number(e.target.value))} className="w-full rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </Field>
          <Field label={t('pms.assets.technicalSpecsLabel')} className="md:col-span-2">
            <textarea rows={3} value={formData.technicalSpecs || ''} onChange={e => handleChange('technicalSpecs', e.target.value)} className="w-full resize-none rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </Field>
          </>}
          <Field label={t('pms.assets.notesLabel')} className="md:col-span-2">
            <textarea rows={3} value={formData.notes || ''} onChange={e => handleChange('notes', e.target.value)} className="w-full resize-none rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </Field>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <button type="button" onClick={onClose} className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={saving} className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? t('pms.assets.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </div>
  );
}

function CreateAssetModal({ mode, assets, defaultParentId, onClose, onSuccess }: CreateAssetModalProps) {
  const [saving, setSaving] = useState(false);
  const isFolderMode = mode === 'folder';
  const [formData, setFormData] = useState<CreateEquipmentAssetDto>({
    assetCode: '',
    assetName: '',
    category: isFolderMode ? 'SYSTEM' : 'UNCLASSIFIED',
    parentId: defaultParentId || undefined,
    criticality: 'NORMAL',
    status: 'ACTIVE',
    manufacturer: '',
    model: '',
    serialNumber: '',
    location: '',
    technicalSpecs: '',
    notes: '',
  });

  useEffect(() => {
    if (!mode) return;
    setFormData({
      assetCode: '',
      assetName: '',
      category: isFolderMode ? 'SYSTEM' : 'UNCLASSIFIED',
      parentId: defaultParentId || undefined,
      criticality: 'NORMAL',
      status: 'ACTIVE',
      manufacturer: '',
      model: '',
      serialNumber: '',
      location: '',
      technicalSpecs: '',
      notes: '',
    });
  }, [mode, defaultParentId, isFolderMode]);

  const parentOptions = useMemo(() => {
    const roots = buildTree(assets);
    const rows: Array<{ id: string; label: string }> = [];
    const walk = (nodes: EquipmentAsset[], depth = 0) => {
      nodes.forEach((node) => {
        const typeLabel = isFolderNode(node) ? 'Nhóm thiết bị' : 'Thiết bị';
        rows.push({ id: node.id, label: `${'  '.repeat(depth)}[${typeLabel}] ${node.assetCode ? `${node.assetCode} - ` : ''}${node.assetName}` });
        if (node.children?.length) walk(node.children, depth + 1);
      });
    };
    walk(roots);
    return rows;
  }, [assets]);

  if (!mode) return null;

  const title = isFolderMode ? 'Thêm nhóm thiết bị' : 'Thêm thiết bị';
  const codeLabel = isFolderMode ? 'Mã nhóm thiết bị' : 'Mã thiết bị';
  const nameLabel = isFolderMode ? 'Tên nhóm thiết bị' : 'Tên thiết bị';

  const handleChange = (field: keyof CreateEquipmentAssetDto, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: field === 'parentId' ? (value || undefined) : value,
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!formData.assetCode.trim() || !formData.assetName.trim()) {
      toast.error(isFolderMode ? 'Vui lòng nhập mã và tên nhóm thiết bị' : 'Vui lòng nhập mã và tên thiết bị');
      return;
    }

    try {
      setSaving(true);
      const created = await equipmentAssetService.create({
        ...formData,
        assetCode: formData.assetCode.trim(),
        assetName: formData.assetName.trim(),
        category: isFolderMode ? 'SYSTEM' : 'UNCLASSIFIED',
        criticality: formData.criticality || 'NORMAL',
        status: formData.status || 'ACTIVE',
        manufacturer: isFolderMode ? '' : formData.manufacturer?.trim(),
        model: isFolderMode ? '' : formData.model?.trim(),
        serialNumber: isFolderMode ? '' : formData.serialNumber?.trim(),
        location: formData.location?.trim(),
        technicalSpecs: isFolderMode ? '' : formData.technicalSpecs?.trim(),
        notes: formData.notes?.trim(),
      });
      toast.success(`Đã thêm ${isFolderMode ? 'nhóm thiết bị' : 'thiết bị'} ${created.assetName}`);
      await onSuccess(created.id, formData.parentId);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || error?.response?.data?.error || `Không thể thêm ${isFolderMode ? 'nhóm thiết bị' : 'thiết bị'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="create-equipment-title" className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 id="create-equipment-title" className="text-base font-semibold text-slate-900">{title}</h2>
          </div>
          <button onClick={onClose} aria-label="Đóng" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" type="button">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
          <div className="min-h-0 overflow-y-auto px-5 py-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label={codeLabel} required>
                <input autoFocus required value={formData.assetCode} onChange={e => handleChange('assetCode', e.target.value)} className="h-9 w-full rounded border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder={isFolderMode ? 'E' : 'E001'} />
              </Field>
              <Field label={nameLabel} required>
                <input required value={formData.assetName} onChange={e => handleChange('assetName', e.target.value)} className="h-9 w-full rounded border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder={isFolderMode ? 'Air condition plant' : 'Compressor & motor No.1'} />
              </Field>
              <Field label="Thuộc nhóm / thiết bị cha" className="md:col-span-2">
                <select value={formData.parentId || ''} onChange={e => handleChange('parentId', e.target.value)} className="h-9 w-full rounded border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500">
                  <option value="">Cấp gốc (không có cha)</option>
                  {parentOptions.map(option => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </Field>
              {isFolderMode && <CrewPicField value={formData.picCrewId || ''} onChange={value => handleChange('picCrewId', value)} />}
            </div>
          </div>
          <div className="flex flex-shrink-0 justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
            <button type="button" onClick={onClose} className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              Hủy
            </button>
            <button type="submit" disabled={saving} className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? 'Đang lưu...' : title}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CrewPicField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; getOnboardCrew().then(data => { if (active) setCrew(data); }).catch(() => { if (active) setError('Không thể tải thuyền viên. Hãy đóng và mở lại biểu mẫu.'); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  return <Field label="Người phụ trách" required className="md:col-span-2"><select required value={value} disabled={loading || !!error} onChange={e => onChange(e.target.value)} className="h-9 w-full rounded border border-slate-300 px-3 text-sm outline-none focus:border-blue-500"><option value="">{loading ? 'Đang tải thuyền viên...' : 'Chọn thuyền viên phụ trách'}</option>{value && !crew.some(c => c.crewId === value) && <option value={value}>{value} (cần chọn lại thuyền viên trên tàu)</option>}{crew.map(c => <option key={c.id} value={c.crewId}>{c.fullName} — {c.crewId}</option>)}</select>{error && <p className="mt-1 text-xs text-red-600">{error}</p>}{!loading && !error && !crew.length && <p className="mt-1 text-xs text-amber-700">Chưa có thuyền viên trên tàu để chọn.</p>}</Field>;
}

interface EquipmentMaterialsPanelProps {
  t: (key: string, params?: Record<string, string | number>) => string;
  materials: EquipmentMaterialLink[];
  loading: boolean;
  onUpdate: (material: EquipmentMaterialLink, quantityRequired: number, notes?: string | null) => Promise<void>;
  onRemove: (material: EquipmentMaterialLink) => Promise<void>;
  onEditingChange: (isEditing: boolean) => void;
}

function EquipmentMaterialsPanel({ t, materials, loading, onUpdate, onRemove, onEditingChange }: EquipmentMaterialsPanelProps) {
  return (
    <section className="flex flex-1 flex-col overflow-hidden bg-white">
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="px-4 py-6 text-center text-sm text-slate-500">{t('pms.assets.requiredMaterials.loading')}</div>
        ) : materials.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-500">
            {t('pms.assets.requiredMaterials.empty')}
          </div>
        ) : (
          <table className="min-w-full border-collapse text-sm">
            <thead className="sticky top-0 z-10">
              <tr className="bg-blue-50">
                <th className="w-12 border-b border-r border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600">{t('pms.assets.requiredMaterials.no')}</th>
                <th className="w-28 border-b border-r border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600">{t('pms.assets.requiredMaterials.itemCode')}</th>
                <th className="min-w-[220px] border-b border-r border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600">{t('pms.assets.requiredMaterials.itemName')}</th>
                <th className="w-28 border-b border-r border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600">{t('pms.assets.requiredMaterials.required')}</th>
                <th className="w-28 border-b border-r border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600">{t('pms.assets.requiredMaterials.onHand')}</th>
                <th className="w-24 border-b border-r border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600">{t('pms.assets.requiredMaterials.shortage')}</th>
                <th className="w-28 border-b border-r border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600">{t('pms.assets.requiredMaterials.status')}</th>
                <th className="min-w-[180px] border-b border-r border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600">{t('pms.assets.requiredMaterials.notes')}</th>
                <th className="min-w-[90px] border-b border-r border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600">Đơn vị</th>
                <th className="min-w-[160px] border-b border-r border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-600">Ngày liên kết</th>
                <th className="w-16 border-b border-gray-200 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {materials.map((material, index) => (
                <EquipmentMaterialRow
                  key={`${material.materialItemId}-${material.inheritedFrom || 'direct'}`}
                  index={index}
                  t={t}
                  material={material}
                  onUpdate={onUpdate}
                  onRemove={onRemove}
                  onEditingChange={onEditingChange}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function EquipmentMaterialRow({
  index,
  t,
  material,
  onUpdate,
  onRemove,
  onEditingChange,
}: {
  index: number;
  t: (key: string, params?: Record<string, string | number>) => string;
  material: EquipmentMaterialLink;
  onUpdate: (material: EquipmentMaterialLink, quantityRequired: number, notes?: string | null) => Promise<void>;
  onRemove: (material: EquipmentMaterialLink) => Promise<void>;
  onEditingChange: (isEditing: boolean) => void;
}) {
  const [quantityRequired, setQuantityRequired] = useState(String(material.quantityRequired ?? 1));
  const [notes, setNotes] = useState(material.notes || '');
  const [saving, setSaving] = useState(false);
  const inherited = !!material.inheritedFrom;
  const required = Number(quantityRequired || 0);
  const hasStock = material.onHandQuantity !== null && material.onHandQuantity !== undefined;
  const onHand = hasStock ? Number(material.onHandQuantity) : null;
  const shortage = hasStock ? Math.max(0, required - (onHand ?? 0)) : null;

  useEffect(() => {
    setQuantityRequired(String(material.quantityRequired ?? 1));
    setNotes(material.notes || '');
  }, [material.materialItemId, material.quantityRequired, material.notes]);

  const save = async () => {
    if (inherited) return;
    const nextQuantity = Math.max(0, Number(quantityRequired || 0));
    try {
      setSaving(true);
      await onUpdate(material, nextQuantity, notes.trim() || null);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Không thể cập nhật vật tư yêu cầu');
    } finally {
      setSaving(false);
      onEditingChange(false);
    }
  };

  const remove = async () => {
    if (inherited) return;
    try {
      setSaving(true);
      await onRemove(material);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Không thể xóa vật tư khỏi thiết bị');
      setSaving(false);
    }
  };

  return (
    <tr className="hover:bg-blue-50">
      <td className="border-r border-gray-100 px-3 py-2 text-left text-xs text-gray-500">{index + 1}</td>
      <td className="border-r border-gray-100 px-3 py-2 text-left font-mono text-slate-600">{material.itemCode}</td>
      <td className="border-r border-gray-100 px-3 py-2">
        <div className="font-medium text-slate-800">{material.name}</div>
        {material.specification ? <div className="mt-0.5 truncate text-slate-400">{material.specification}</div> : null}
      </td>
      <td className="border-r border-gray-100 px-3 py-2 text-left">
        <div className="flex items-center justify-start">
          <input
            type="number"
            min="0"
            step="0.01"
            value={quantityRequired}
            onChange={event => setQuantityRequired(event.target.value)}
            onFocus={() => onEditingChange(true)}
            onBlur={save}
            disabled={inherited || saving}
            className="h-7 w-20 rounded border border-slate-300 px-2 text-left outline-none focus:border-blue-500 disabled:bg-slate-100"
          />
        </div>
      </td>
      <td className="border-r border-gray-100 px-3 py-2 text-left font-medium text-slate-700">
        {hasStock ? formatQuantity(onHand ?? 0) : '-'}
      </td>
      <td className={`border-r border-gray-100 px-3 py-2 text-left font-semibold ${shortage === null ? 'text-slate-400' : shortage > 0 ? 'text-red-600' : 'text-green-600'}`}>
        {shortage === null ? '-' : formatQuantity(shortage)}
      </td>
      <td className="border-r border-gray-100 px-3 py-2">
        {inherited ? (
          <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-600">{t('pms.assets.requiredMaterials.inherited')}</span>
        ) : shortage === null ? (
          <span className="text-slate-400">-</span>
        ) : shortage > 0 ? (
          <span className="rounded bg-red-50 px-2 py-0.5 font-medium text-red-700">{t('pms.assets.requiredMaterials.insufficient')}</span>
        ) : (
          <span className="rounded bg-green-50 px-2 py-0.5 font-medium text-green-700">{t('pms.assets.requiredMaterials.sufficient')}</span>
        )}
      </td>
      <td className="border-r border-gray-100 px-3 py-2">
        <input
          value={notes}
          onChange={event => setNotes(event.target.value)}
          onFocus={() => onEditingChange(true)}
          onBlur={save}
          disabled={inherited || saving}
          placeholder={t('pms.assets.requiredMaterials.notesPlaceholder')}
          className="h-7 w-full rounded border border-slate-300 px-2 outline-none focus:border-blue-500 disabled:bg-slate-100"
        />
      </td>
      <td className="border-r border-gray-100 px-3 py-2 text-xs">{material.unit || '—'}</td>
      <td className="whitespace-nowrap border-r border-gray-100 px-3 py-2 text-xs">{material.linkedAt ? formatDate(material.linkedAt) : '—'}</td>
      <td className="px-2 py-2 text-center">
        <button
          type="button"
          onClick={remove}
          disabled={inherited || saving}
          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
          title={inherited ? t('pms.assets.requiredMaterials.inheritedTitle') : t('pms.assets.requiredMaterials.remove')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </td>
    </tr>
  );
}

function AssignEquipmentMaterialModal({
  isOpen,
  asset,
  onClose,
  onAssigned,
}: {
  isOpen: boolean;
  asset: EquipmentAsset | null;
  onClose: () => void;
  onAssigned: () => Promise<void> | void;
}) {
  // Chọn từ DANH MỤC vật tư của công ty (material_items, chuẩn IMPA), KHÔNG phải tồn kho tàu.
  // Thiết bị yêu cầu vật tư tiêu hao theo chuẩn — độc lập với việc con tàu hiện có hay không.
  // Thiếu thì làm phiếu yêu cầu nhập vật tư, không phải lý do để không khai báo yêu cầu.
  const [items, setItems] = useState<MaterialCatalogItem[]>([]);
  // Tồn kho tra theo MÃ vật tư: danh mục và kho tàu là hai bảng khác nhau, id không trùng.
  const [stockByItemCode, setStockByItemCode] = useState<Record<string, { qty: number; unit?: string }>>({});
  const [search, setSearch] = useState('');
  const [selectedMaterialId, setSelectedMaterialId] = useState('');
  const [quantityRequired, setQuantityRequired] = useState('1');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadItems = useCallback(async () => {
    if (!isOpen) return;
    try {
      setLoading(true);
      const [data, shipItems] = await Promise.all([
        materialService.getCatalog({ q: search.trim() || undefined }),
        materialService.getItems({ onlyActive: true }),
      ]);
      const nextStock: Record<string, { qty: number; unit?: string }> = {};
      shipItems.forEach(row => {
        if (!row.itemCode) return;
        nextStock[row.itemCode] = {
          qty: Number(row.onHandQuantity || 0),
          unit: row.unit ?? undefined,
        };
      });
      setItems(data);
      setStockByItemCode(nextStock);
      setSelectedMaterialId(prev => {
        if (prev && data.some(item => item.id === prev)) return prev;
        return data[0]?.id || '';
      });
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Không thể tải danh mục vật tư');
    } finally {
      setLoading(false);
    }
  }, [isOpen, search]);

  useEffect(() => {
    if (!isOpen) return;
    setQuantityRequired('1');
    setNotes('');
    setSelectedMaterialId('');
  }, [isOpen, asset?.id]);

  useEffect(() => {
    const timer = window.setTimeout(loadItems, 250);
    return () => window.clearTimeout(timer);
  }, [loadItems]);

  if (!isOpen || !asset) return null;

  const selectedItem = items.find(item => item.id === selectedMaterialId) || null;
  const selectedStock = selectedItem ? stockByItemCode[selectedItem.itemCode] : undefined;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedMaterialId) {
      toast.error('Vui lòng chọn vật tư');
      return;
    }
    const nextQuantity = Math.max(0, Number(quantityRequired || 0));
    if (nextQuantity <= 0) {
      toast.error('Số lượng yêu cầu phải lớn hơn 0');
      return;
    }

    try {
      setSaving(true);
      await materialService.assignEquipment({
        materialItemIds: [selectedMaterialId],
        equipmentAssetIds: [asset.id],
        quantityRequired: nextQuantity,
        notes: notes.trim() || null,
      });
      toast.success('Đã gán vật tư vào thiết bị');
      await onAssigned();
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Không thể gán vật tư vào thiết bị');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
      <div className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">Gán vật tư yêu cầu</h2>
            <p className="mt-1 truncate text-xs text-slate-500">{asset.assetCode} - {asset.assetName}</p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" type="button">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit}>
          <div className="space-y-4 px-5 py-4">
            <Field label="Tìm vật tư">
              <div className="flex items-center gap-2 rounded border border-slate-300 px-3">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Nhập mã hoặc tên vật tư..."
                  className="h-9 flex-1 text-sm outline-none"
                />
              </div>
            </Field>

            <Field label="Vật tư" required>
              <select
                value={selectedMaterialId}
                onChange={event => setSelectedMaterialId(event.target.value)}
                className="h-9 w-full rounded border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              >
                {loading ? <option value="">Đang tải...</option> : null}
                {!loading && items.length === 0 ? <option value="">Không có vật tư phù hợp</option> : null}
                {items.map(item => (
                  <option key={item.id} value={item.id}>
                    {item.itemCode} - {item.name}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Field label="Số lượng yêu cầu" required>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={quantityRequired}
                  onChange={event => setQuantityRequired(event.target.value)}
                  className="h-9 w-full rounded border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </Field>
              {/* Chỉ để tham khảo — không ràng buộc việc khai báo yêu cầu.
                  Thiếu thì làm phiếu yêu cầu nhập vật tư. */}
              <Field label="Tồn kho hiện có trên tàu">
                <div className="flex h-9 items-center rounded border border-slate-200 bg-slate-50 px-3 text-sm text-slate-700">
                  {selectedStock
                    ? `${formatQuantity(selectedStock.qty)}${selectedStock.unit ? ' ' + selectedStock.unit : ''}`
                    : <span className="text-amber-600">Chưa có trên tàu</span>}
                </div>
              </Field>
            </div>

            <Field label="Ghi chú">
              <textarea
                value={notes}
                onChange={event => setNotes(event.target.value)}
                rows={3}
                className="w-full resize-none rounded border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Ví dụ: dùng cho bảo trì định kỳ, bộ dự phòng tối thiểu..."
              />
            </Field>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
            <button type="button" onClick={onClose} className="rounded border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
              Hủy
            </button>
            <button type="submit" disabled={saving || !selectedMaterialId} className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">
              {saving ? 'Đang gán...' : 'Gán vật tư'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function formatQuantity(value: number): string {
  return Number.isFinite(value)
    ? new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value)
    : '0';
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('vi-VN');
}

function assetStatusLabel(status?: string): string {
  switch (status) {
    case 'ACTIVE': return 'Đang hoạt động';
    case 'STANDBY': return 'Chờ sẵn';
    case 'UNDER_MAINTENANCE': return 'Đang bảo trì';
    case 'DECOMMISSIONED': return 'Ngừng sử dụng';
    case 'IN_STORAGE': return 'Trong kho';
    default: return status || '-';
  }
}

function Field({ label, required, className = '', children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}{required ? <span className="text-red-500"> *</span> : null}
      </span>
      {children}
    </label>
  );
}
