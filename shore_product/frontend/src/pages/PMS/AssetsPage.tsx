import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Upload, Download, Search, Package, Edit2, Eye, Trash2, ChevronDown, ChevronRight, FolderOpen, Copy, ChevronsUpDown } from 'lucide-react';
import { equipmentAssetService } from '@/services/equipment-asset.service';
import { AddAssetModal } from '@/components/pms/AddAssetModal';
import { ImportAssetsModal } from '@/components/pms/ImportAssetsModal';
import { EditAssetModal } from '@/components/pms/EditAssetModal';
import ViewAssetModal from '@/components/pms/ViewAssetModal';
import { useTranslationSafe } from '@/contexts/I18nContext';
import type { EquipmentAsset } from '@/types/pms.types';
import { toast } from 'sonner';
import { useConfirm } from '@/components/common/ConfirmDialog';

const STATUS_VALUES = ['', 'ACTIVE', 'STANDBY', 'UNDER_MAINTENANCE', 'DECOMMISSIONED', 'IN_STORAGE'] as const;

const ITEMS_PER_PAGE_OPTIONS = [10, 20, 50];

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

/** Nhúng trong màn chi tiết tàu: vesselId lọc theo tàu, readOnly để bờ chỉ xem. */
export default function AssetsPage({ vesselId: vesselIdProp, readOnly = false }: { vesselId?: string; readOnly?: boolean } = {}) {
  const ask = useConfirm();
  const { t } = useTranslationSafe();
  const [searchParams] = useSearchParams();
  const vesselId = vesselIdProp ?? (searchParams.get('vesselId') ?? undefined);

  const statusOptions = useMemo(() => STATUS_VALUES.map(v => ({
    value: v,
    label: v === '' ? t('common.search')
         : v === 'ACTIVE' ? t('pms.assets.active')
         : v === 'STANDBY' ? t('pms.assets.standby')
         : v === 'UNDER_MAINTENANCE' ? t('pms.assets.underMaintenance')
         : v === 'DECOMMISSIONED' ? t('pms.assets.decommissioned')
         : t('pms.assets.inStorage'),
  })), [t]);
  const [assets, setAssets] = useState<EquipmentAsset[]>([]);   // flat list từ API
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchCode, setSearchCode] = useState('');
  const [searchLocation, setSearchLocation] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<EquipmentAsset | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);  // null = root (tất cả)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('pms-assets-expanded-nodes');
      return saved ? new Set<string>(JSON.parse(saved)) : new Set<string>();
    } catch { return new Set<string>(); }
  });
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  useEffect(() => { loadData(); }, [vesselId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await equipmentAssetService.getTree(vesselId);
      setAssets(data);
    } catch (error) {
      console.error('Error loading assets:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAssets = async () => {
    const data = await equipmentAssetService.getTree(vesselId);
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

  /** Assets xuất hiện trong bảng: nếu chọn 1 node thì lấy tất cả descendants */
  const filteredAssets = useMemo(() => {
    let data = assets;

    // Lọc theo node được chọn trong tree
    if (selectedNodeId) {
      // Build subtree của node đó để lấy descendant ids
      const buildFromFlat = (id: string): EquipmentAsset => {
        const node: EquipmentAsset = { ...assetMap.get(id)!, children: [] as EquipmentAsset[] };
        assets.filter(a => a.parentId === id).forEach(child => {
          node.children!.push(buildFromFlat(child.id));
        });
        return node;
      };
      const subtree = buildFromFlat(selectedNodeId);
      const ids = getDescendantIds(subtree);
      data = data.filter(a => ids.has(a.id));
    }

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      data = data.filter(a => a.assetName.toLowerCase().includes(q) || a.manufacturer?.toLowerCase().includes(q));
    }
    if (searchCode) {
      const q = searchCode.toLowerCase();
      data = data.filter(a => a.assetCode.toLowerCase().includes(q));
    }
    if (searchLocation) {
      const q = searchLocation.toLowerCase();
      data = data.filter(a => a.location?.toLowerCase().includes(q));
    }
    if (selectedStatus) {
      data = data.filter(a => a.status === selectedStatus);
    }
    return data;
  }, [assets, selectedNodeId, searchTerm, searchCode, searchLocation, selectedStatus, assetMap]);

  const totalPages = Math.ceil(filteredAssets.length / itemsPerPage);
  const paginatedAssets = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredAssets.slice(start, start + itemsPerPage);
  }, [filteredAssets, currentPage, itemsPerPage]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, searchCode, searchLocation, selectedStatus, selectedNodeId]);

  const toggleRow = (id: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllRows = () => {
    if (selectedRows.size === paginatedAssets.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(paginatedAssets.map(a => a.id)));
  };

  const handleDelete = async (asset: EquipmentAsset) => {
    if (readOnly) return;
    if (!await ask(t('pms.assets.confirmDelete', { name: asset.assetName }))) return;
    try {
      await equipmentAssetService.delete(asset.id);
      await loadAssets();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Delete failed');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedRows.size === 0) return;
    if (!await ask(t('pms.assets.confirmBulkDelete', { count: selectedRows.size }))) return;
    try {
      await Promise.all([...selectedRows].map(id => equipmentAssetService.delete(id)));
      setSelectedRows(new Set());
      await loadAssets();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Delete failed');
    }
  };

  const handleDownloadTemplate = () => {
    const template = [
      ['AssetCode', 'AssetName', 'Category', 'Manufacturer', 'Model', 'SerialNumber', 'Location', 'Criticality', 'ParentAssetCode'],
      ['PROP-SYS', 'Hệ thống Động lực', 'SYSTEM', '', '', '', 'Engine Room', 'CRITICAL', ''],
      ['ME-01', 'Main Engine', 'ENGINE', 'MAN B&W', '6S50MC', 'ME001', 'Engine Room', 'CRITICAL', 'PROP-SYS'],
      ['ME-01-CYL', 'Cylinder Unit', 'COMPONENT', '', '', '', 'Engine Room', 'HIGH', 'ME-01'],
    ];
    const csv = template.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'equipment-assets-template.csv'; a.click();
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800';
      case 'STANDBY': return 'bg-[#dce9f8] text-primary';
      case 'UNDER_MAINTENANCE': return 'bg-yellow-100 text-yellow-800';
      case 'DECOMMISSIONED': return 'bg-gray-100 text-gray-800';
      case 'IN_STORAGE': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      ACTIVE: t('pms.assets.active'),
      STANDBY: t('pms.assets.standby'),
      UNDER_MAINTENANCE: t('pms.assets.underMaintenance'),
      DECOMMISSIONED: t('pms.assets.decommissioned'),
      IN_STORAGE: t('pms.assets.inStorage'),
    };
    return map[status] ?? status;
  };

  const selectedNodeName = selectedNodeId ? assetMap.get(selectedNodeId)?.assetName : null;

  /** Render đệ quy 1 node trong tree */
  const renderTreeNode = (node: EquipmentAsset, depth = 0): React.ReactNode => {
    const hasChildren = (node.children?.length ?? 0) > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNodeId === node.id;
    const childCount = node.children?.length ?? 0;

    return (
      <div key={node.id}>
        <button
          onClick={() => {
            setSelectedNodeId(node.id);
            if (hasChildren) toggleNode(node.id);
          }}
          style={{ paddingLeft: `${12 + depth * 14}px` }}
          className={`w-full flex items-center gap-1.5 pr-3 py-1.5 text-xs ${
            isSelected ? 'bg-[#eef2f7] text-[#16375f] font-semibold' : 'text-gray-700 hover:bg-gray-50'
          }`}
        >
          {hasChildren ? (
            isExpanded
              ? <ChevronDown className="w-3 h-3 flex-shrink-0 text-[#1b4c7e]" />
              : <ChevronRight className="w-3 h-3 flex-shrink-0 text-[#1b4c7e]" />
          ) : (
            <span className="w-3 flex-shrink-0" />
          )}
          <FolderOpen className="w-3 h-3 flex-shrink-0 text-gray-400" />
          <span className="flex-1 text-left leading-snug marquee-cell">
            <span className="marquee-text">{node.assetName}</span>
          </span>
          <span className="text-gray-400 text-[10px] flex-shrink-0">{t('pms.assets.childCount', { count: childCount })}</span>
        </button>

        {isExpanded && node.children?.map(child => renderTreeNode(child, depth + 1))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto"></div>
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
        <button
          onClick={() => setSelectedNodeId(null)}
          className={`w-64 flex-shrink-0 flex items-center gap-1.5 px-3 py-3 text-sm font-semibold border-r border-gray-200 ${
            selectedNodeId === null
              ? 'bg-primary-hover text-white'
              : 'text-gray-700 hover:bg-gray-50 bg-white'
          }`}
        >
          <FolderOpen className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1 text-left truncate">
            {t('pms.assets.allEquipment')} ({t('pms.assets.childCount', { count: assets.length })})
          </span>
        </button>

        {/* Header phải: title + action buttons */}
        <div className="flex-1 flex items-center justify-between px-4 py-3 bg-white">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">
              ≡ {t('pms.assets.equipmentList')}{selectedNodeName ? ` - ${selectedNodeName}` : ''}
            </span>
            <span className="text-xs bg-[#dce9f8] text-[#16375f] px-2 py-0.5 rounded-full font-semibold">
              {filteredAssets.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkDelete}
              disabled={selectedRows.size === 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded ${selectedRows.size > 0 ? 'text-red-600 hover:bg-red-50 border-red-300' : 'text-gray-400 cursor-not-allowed'}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t('pms.assets.deleteMany')}{selectedRows.size > 0 ? ` (${selectedRows.size})` : ''}
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50">
              <Copy className="w-3.5 h-3.5" />
              {t('pms.assets.copy')}
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
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: cây phân cấp thiết bị */}
        <div className="w-64 flex-shrink-0 border-r border-gray-200 overflow-y-auto bg-white">
          {treeRoots.length === 0 ? (
            <div className="px-4 py-6 text-xs text-gray-400 text-center">{t('pms.assets.noEquipmentTree')}</div>
          ) : (
            treeRoots.map(node => renderTreeNode(node, 0))
          )}
        </div>

        {/* RIGHT: table panel */}
        <div className="flex-1 flex flex-col overflow-hidden">

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="min-w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">

              {/* Hàng 1: Tên cột + sort icon */}
              <tr className="bg-[#eef2f7]">
                <th className="w-10 px-2 py-2 text-center text-xs font-semibold text-gray-600 border-b border-r border-gray-200">TT</th>
                <th className="w-10 px-2 py-2 text-center text-xs font-semibold text-gray-600 border-b border-r border-gray-200">
                  <input
                    type="checkbox"
                    checked={selectedRows.size === paginatedAssets.length && paginatedAssets.length > 0}
                    onChange={toggleAllRows}
                    className="rounded text-[#0b2545]"
                  />
                </th>
                <th className="min-w-[200px] px-3 py-2 text-left border-b border-r border-gray-200">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-gray-600">{t('pms.assets.colTitle')}</span>
                    <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                <th className="w-32 px-3 py-2 text-left border-b border-r border-gray-200">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-gray-600">{t('pms.assets.colCode')}</span>
                    <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                <th className="w-36 px-3 py-2 text-left border-b border-r border-gray-200">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-gray-600">{t('pms.assets.location')}</span>
                    <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                <th className="w-36 px-3 py-2 text-left border-b border-r border-gray-200">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-gray-600">{t('pms.assets.status')}</span>
                    <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                <th className="w-40 px-3 py-2 text-left border-b border-r border-gray-200">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-gray-600">{t('pms.assets.colManufacturer')}</span>
                    <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                <th className="min-w-[180px] px-3 py-2 text-left border-b border-r border-gray-200">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-gray-600">{t('pms.assets.colSpecs')}</span>
                    <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                <th className="w-24 px-3 py-2 border-b border-gray-200"></th>
              </tr>

              {/* Hàng 2: Ô tìm kiếm theo cột */}
              <tr className="bg-white border-b border-gray-200">
                <th className="border-r border-gray-200"></th>
                <th className="border-r border-gray-200"></th>
                <th className="px-2 py-1 border-r border-gray-200">
                  <div className="flex items-center gap-0.5 border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                    <span className="text-gray-400 text-xs select-none">→</span>
                    <input
                      type="text"
                      placeholder={t('common.search')}
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="flex-1 text-xs outline-none min-w-0 bg-transparent"
                    />
                    <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                <th className="px-2 py-1 border-r border-gray-200">
                  <div className="flex items-center gap-0.5 border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                    <span className="text-gray-400 text-xs select-none">→</span>
                    <input
                      type="text"
                      placeholder={t('common.search')}
                      value={searchCode}
                      onChange={e => setSearchCode(e.target.value)}
                      className="flex-1 text-xs outline-none min-w-0 bg-transparent"
                    />
                    <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                <th className="px-2 py-1 border-r border-gray-200">
                  <div className="flex items-center gap-0.5 border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                    <span className="text-gray-400 text-xs select-none">→</span>
                    <input
                      type="text"
                      placeholder={t('common.search')}
                      value={searchLocation}
                      onChange={e => setSearchLocation(e.target.value)}
                      className="flex-1 text-xs outline-none min-w-0 bg-transparent"
                    />
                    <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                <th className="px-2 py-1 border-r border-gray-200">
                  <select
                    value={selectedStatus}
                    onChange={e => setSelectedStatus(e.target.value)}
                    className="w-full py-0.5 text-xs border border-gray-200 rounded outline-none bg-white"
                  >
                    {statusOptions.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </th>
                <th className="px-2 py-1 border-r border-gray-200">
                  <div className="flex items-center gap-0.5 border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                    <span className="text-gray-400 text-xs select-none">→</span>
                    <input type="text" placeholder={t('common.search')} className="flex-1 text-xs outline-none min-w-0 bg-transparent" />
                    <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                <th className="px-2 py-1 border-r border-gray-200">
                  <div className="flex items-center gap-0.5 border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                    <span className="text-gray-400 text-xs select-none">→</span>
                    <input type="text" placeholder={t('common.search')} className="flex-1 text-xs outline-none min-w-0 bg-transparent" />
                    <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                <th className="border-gray-200"></th>
              </tr>

            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedAssets.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                    <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p>{t('pms.assets.noAssets')}</p>
                  </td>
                </tr>
              ) : (
                paginatedAssets.map((asset, idx) => (
                  <tr
                    key={asset.id}
                    className={`hover:bg-[#eef2f7] ${
                      selectedRows.has(asset.id) ? 'bg-[#eef2f7]' : idx % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'
                    }`}
                  >
                    <td className="px-2 py-2 text-center text-xs text-gray-500 border-r border-gray-100">
                      {(currentPage - 1) * itemsPerPage + idx + 1}
                    </td>
                    <td className="px-2 py-2 text-center border-r border-gray-100">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(asset.id)}
                        onChange={() => toggleRow(asset.id)}
                        className="rounded text-[#0b2545]"
                      />
                    </td>
                    <td className="px-3 py-2 border-r border-gray-100">
                      <button
                        onClick={() => { setSelectedAsset(asset); setShowViewModal(true); }}
                        className="flex items-center gap-1 text-[#0b2545] hover:underline font-medium text-xs text-left w-full"
                      >
                        <ChevronRight className="w-3 h-3 flex-shrink-0" />
                        <span className="marquee-cell flex-1 min-w-0">
                          <span className="marquee-text">{asset.assetName}</span>
                        </span>
                      </button>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 border-r border-gray-100 font-mono">
                      {asset.assetCode}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 border-r border-gray-100">
                      <div className="marquee-cell">
                        <span className="marquee-text">{asset.location || ''}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 border-r border-gray-100">
                      {asset.status ? (
                        <span className={`px-2 py-0.5 text-xs font-medium rounded whitespace-nowrap ${getStatusBadgeColor(asset.status)}`}>
                          {getStatusLabel(asset.status)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600 border-r border-gray-100">
                      <div className="marquee-cell">
                        <span className="marquee-text">{asset.manufacturer || ''}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 border-r border-gray-100 max-w-[200px]">
                      <div className="marquee-cell">
                        <span className="marquee-text">
                          {asset.technicalSpecs
                            ? asset.technicalSpecs
                            : `${asset.model || ''}${asset.model && asset.serialNumber ? ' · ' : ''}${asset.serialNumber ? 'SN:' + asset.serialNumber : ''}` || ''}
                        </span>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          onClick={() => { setSelectedAsset(asset); setShowViewModal(true); }}
                          className="p-1 text-gray-400 hover:text-[#0b2545] hover:bg-[#eef2f7] rounded"
                          title={t('pms.assets.view')}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { setSelectedAsset(asset); setShowEditModal(true); }}
                          className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded"
                          title={t('pms.assets.edit')}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(asset)}
                          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                          title={t('pms.assets.delete')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 bg-white flex-shrink-0 text-xs text-gray-600">
          {/* Trái: số dòng / trang */}
          <div>
            <select
              value={itemsPerPage}
              onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="border border-gray-300 rounded px-2 py-1 text-xs"
            >
              {ITEMS_PER_PAGE_OPTIONS.map(n => (
                <option key={n} value={n}>{t('pms.assets.perPage', { n })}</option>
              ))}
            </select>
          </div>

          {/* Giữa: thông tin trang + số trang */}
          <div className="flex items-center gap-1">
            <span className="mr-2">
              {t('pms.assets.pageInfo', { current: currentPage, total: totalPages, records: filteredAssets.length })}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
            >‹</button>
            {[...Array(Math.min(5, totalPages))].map((_, i) => {
              let page: number;
              if (totalPages <= 5) page = i + 1;
              else if (currentPage <= 3) page = i + 1;
              else if (currentPage >= totalPages - 2) page = totalPages - 4 + i;
              else page = currentPage - 2 + i;
              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-7 h-7 flex items-center justify-center border rounded text-xs ${
                    currentPage === page
                      ? 'bg-[#0b2545] text-white border-accent'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {page}
                </button>
              );
            })}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
            >›</button>
          </div>

          {/* Phải: nhảy đến trang */}
          <div className="flex items-center gap-2">
            <span>{t('pms.assets.goToPage')}</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={currentPage}
              onChange={e => {
                const v = Number(e.target.value);
                if (v >= 1 && v <= totalPages) setCurrentPage(v);
              }}
              className="w-12 border border-gray-300 rounded px-1 py-1 text-center text-xs"
            />
          </div>
        </div>
      </div>{/* end RIGHT table panel */}
      </div>{/* end BODY row */}

      {/* Modals */}
      <AddAssetModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={loadAssets}
      />
      <ImportAssetsModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={loadAssets}
      />
      <EditAssetModal
        isOpen={showEditModal}
        asset={selectedAsset}
        onClose={() => {
          setShowEditModal(false);
          setSelectedAsset(null);
        }}
        onSuccess={loadAssets}
      />
      <ViewAssetModal
        isOpen={showViewModal}
        asset={selectedAsset}
        onClose={() => {
          setShowViewModal(false);
          setSelectedAsset(null);
        }}
      />
    </div>
  );
}
