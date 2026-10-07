import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Eye, Pencil, Trash2, ChevronDown, ChevronRight, FolderOpen, FolderTree, Loader2 } from 'lucide-react';
import { equipmentAssetService } from '@/services/equipment-asset.service';
import { AddAssetModal } from '@/components/pms/AddAssetModal';
import { ImportAssetsModal } from '@/components/pms/ImportAssetsModal';
import { EditAssetModal } from '@/components/pms/EditAssetModal';
import ViewAssetModal from '@/components/pms/ViewAssetModal';
import { useTranslationSafe } from '@/contexts/I18nContext';
import type { EquipmentAsset } from '@/types/pms.types';
import { toast } from 'sonner';
import { Button, DataTable, TableActions, TableIconButton, useConfirm, type Column } from '@/components/common';

const STATUS_TONE: Record<string, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700',
  STANDBY: 'bg-sky-50 text-sky-700',
  UNDER_MAINTENANCE: 'bg-amber-50 text-amber-700',
  DECOMMISSIONED: 'bg-slate-100 text-slate-600',
  IN_STORAGE: 'bg-violet-50 text-violet-700',
};

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

/** Thông số kỹ thuật lưu dạng JSON — hiện thành "khóa: giá trị · ..." cho dễ đọc. */
function specsText(a: EquipmentAsset): string {
  if (a.technicalSpecs) {
    try {
      const obj = JSON.parse(a.technicalSpecs);
      if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
        return Object.entries(obj).map(([k, v]) => `${k}: ${v}`).join(' · ');
      }
    } catch { /* không phải JSON — hiện nguyên văn */ }
    return a.technicalSpecs;
  }
  return [a.model, a.serialNumber && `SN: ${a.serialNumber}`].filter(Boolean).join(' · ');
}

/** Nhúng trong màn chi tiết tàu: vesselId lọc theo tàu, readOnly để bờ chỉ xem. */
export default function AssetsPage({ vesselId: vesselIdProp, readOnly = false }: { vesselId?: string; readOnly?: boolean } = {}) {
  const ask = useConfirm();
  const { t } = useTranslationSafe();
  const [searchParams] = useSearchParams();
  const vesselId = vesselIdProp ?? (searchParams.get('vesselId') ?? undefined);

  const [assets, setAssets] = useState<EquipmentAsset[]>([]);   // flat list từ API
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<EquipmentAsset | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);  // null = tất cả
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('pms-assets-expanded-nodes');
      return saved ? new Set<string>(JSON.parse(saved)) : new Set<string>();
    } catch { return new Set<string>(); }
  });
  const [selectedRows, setSelectedRows] = useState<Set<string | number>>(new Set());

  const loadAssets = useCallback(async () => {
    try {
      setAssets(await equipmentAssetService.getTree(vesselId));
    } catch (error) {
      console.error('Error loading assets:', error);
      toast.error('Không tải được danh sách thiết bị');
    } finally {
      setLoading(false);
    }
  }, [vesselId]);

  useEffect(() => { setLoading(true); loadAssets(); }, [loadAssets]);

  const treeRoots = useMemo(() => buildTree(assets), [assets]);

  const statusLabel = useCallback((status: string) => ({
    ACTIVE: t('pms.assets.active'),
    STANDBY: t('pms.assets.standby'),
    UNDER_MAINTENANCE: t('pms.assets.underMaintenance'),
    DECOMMISSIONED: t('pms.assets.decommissioned'),
    IN_STORAGE: t('pms.assets.inStorage'),
  } as Record<string, string>)[status] ?? status, [t]);

  const toggleNode = useCallback((id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem('pms-assets-expanded-nodes', JSON.stringify([...next])); } catch { /* bỏ qua */ }
      return next;
    });
  }, []);

  /** Chọn một nhánh trong cây thì bảng chỉ hiện nhánh đó và mọi thiết bị con cháu. */
  const rows = useMemo(() => {
    if (!selectedNodeId) return assets;
    const ids = new Set<string>([selectedNodeId]);
    const stack = [selectedNodeId];
    while (stack.length) {
      const id = stack.pop()!;
      assets.forEach(a => { if (a.parentId === id && !ids.has(a.id)) { ids.add(a.id); stack.push(a.id); } });
    }
    return assets.filter(a => ids.has(a.id));
  }, [assets, selectedNodeId]);

  const selectedNodeName = selectedNodeId ? assets.find(a => a.id === selectedNodeId)?.assetName : null;

  const openView = (asset: EquipmentAsset) => { setSelectedAsset(asset); setShowViewModal(true); };

  const handleDelete = async (asset: EquipmentAsset) => {
    if (readOnly) return;
    if (!await ask(t('pms.assets.confirmDelete', { name: asset.assetName }))) return;
    try {
      await equipmentAssetService.delete(asset.id);
      toast.success('Đã xóa thiết bị', { description: `${asset.assetCode} — ${asset.assetName}` });
      await loadAssets();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error('Không thể xóa thiết bị', { description: e?.response?.data?.error });
    }
  };

  const handleBulkDelete = async () => {
    if (readOnly || selectedRows.size === 0) return;
    if (!await ask(t('pms.assets.confirmBulkDelete', { count: selectedRows.size }))) return;
    try {
      await Promise.all([...selectedRows].map(id => equipmentAssetService.delete(String(id))));
      toast.success(`Đã xóa ${selectedRows.size} thiết bị`);
      setSelectedRows(new Set());
      await loadAssets();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error('Không thể xóa thiết bị', { description: e?.response?.data?.error });
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

  const columns: Column<EquipmentAsset>[] = [
    {
      key: 'name', header: t('pms.assets.assetName'), filter: false, value: a => a.assetName,
      render: a => <span className="font-semibold text-primary">{a.assetName}</span>,
    },
    { key: 'code', header: t('pms.assets.colCode'), width: 150, filter: false, value: a => a.assetCode, className: 'font-mono text-xs' },
    { key: 'location', header: t('pms.assets.location'), width: 150, value: a => a.location ?? '' },
    {
      key: 'status', header: t('pms.assets.status'), width: 140, align: 'center', value: a => (a.status ? statusLabel(a.status) : ''),
      render: a => a.status
        ? <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[a.status] ?? STATUS_TONE.DECOMMISSIONED}`}>{statusLabel(a.status)}</span>
        : '—',
    },
    { key: 'manufacturer', header: t('pms.assets.colManufacturer'), width: 150, value: a => a.manufacturer ?? '' },
    {
      key: 'specs', header: t('pms.assets.colSpecs'), filter: false, truncate: true, value: specsText,
      render: a => { const s = specsText(a); return s ? <span className="text-ink-muted" title={s}>{s}</span> : <span className="text-ink-light">—</span>; },
    },
    {
      key: 'actions', header: t('pms.assets.actions'), width: readOnly ? 80 : 120, align: 'center', exportable: false,
      render: a => (
        <TableActions>
          <TableIconButton label={`${t('pms.assets.view')} ${a.assetName}`} icon={<Eye />} onClick={() => openView(a)} />
          {!readOnly && (
            <>
              <TableIconButton label={`${t('pms.assets.edit')} ${a.assetName}`} icon={<Pencil />} onClick={() => { setSelectedAsset(a); setShowEditModal(true); }} />
              <TableIconButton label={`${t('pms.assets.delete')} ${a.assetName}`} icon={<Trash2 />} variant="danger" onClick={() => handleDelete(a)} />
            </>
          )}
        </TableActions>
      ),
    },
  ];

  /** Một nút trong cây thiết bị (đệ quy). */
  const renderTreeNode = (node: EquipmentAsset, depth = 0): React.ReactNode => {
    const hasChildren = (node.children?.length ?? 0) > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNodeId === node.id;

    return (
      <div key={node.id}>
        <button
          type="button"
          onClick={() => { setSelectedNodeId(node.id); if (hasChildren) toggleNode(node.id); }}
          style={{ paddingLeft: `${10 + depth * 14}px` }}
          aria-current={isSelected || undefined}
          className={`flex w-full items-center gap-1.5 py-1.5 pr-3 text-left text-[13px] transition-colors ${
            isSelected ? 'bg-primary-soft font-semibold text-primary' : 'text-ink hover:bg-primary-soft/60'
          }`}
        >
          {hasChildren
            ? (isExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-muted" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-muted" />)
            : <span className="w-3.5 shrink-0" />}
          <FolderOpen className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-primary' : 'text-ink-light'}`} />
          <span className="min-w-0 flex-1 truncate" title={node.assetName}>{node.assetName}</span>
          {hasChildren && <span className="shrink-0 text-xs tabular-nums text-ink-light">{node.children!.length}</span>}
        </button>
        {isExpanded && node.children?.map(child => renderTreeNode(child, depth + 1))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center gap-2 text-[13px] text-ink-muted">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> {t('pms.assets.loading')}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-canvas">
      {/* Cây phân cấp thiết bị */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-surface">
        <p className="flex items-center gap-2 border-b border-grid px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">
          <FolderTree className="h-4 w-4" aria-hidden="true" /> Cây thiết bị
        </p>
        <div className="min-h-0 flex-1 overflow-y-auto py-1">
          <button
            type="button"
            onClick={() => setSelectedNodeId(null)}
            aria-current={selectedNodeId === null || undefined}
            className={`flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[13px] transition-colors ${
              selectedNodeId === null ? 'bg-primary-soft font-semibold text-primary' : 'text-ink hover:bg-primary-soft/60'
            }`}
          >
            <FolderOpen className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1">{t('pms.assets.allEquipment')}</span>
            <span className="text-xs tabular-nums text-ink-light">{assets.length}</span>
          </button>
          {treeRoots.length === 0
            ? <p className="px-4 py-6 text-center text-[13px] text-ink-muted">{t('pms.assets.noEquipmentTree')}</p>
            : treeRoots.map(node => renderTreeNode(node, 0))}
        </div>
      </aside>

      {/* Bảng thiết bị */}
      <div className="flex min-w-0 flex-1 flex-col">
        <DataTable
          flush
          columns={columns}
          data={rows}
          rowKey={a => a.id}
          itemLabel="thiết bị"
          emptyMessage={t('pms.assets.noAssets')}
          searchPlaceholder={t('pms.assets.searchPlaceholder')}
          exportOptions={{ fileName: 'danh-sach-thiet-bi', title: `DANH SÁCH THIẾT BỊ${selectedNodeName ? ` — ${selectedNodeName.toUpperCase()}` : ''}` }}
          onRowClick={openView}
          minWidth={1000}
          toolbarLeft={selectedNodeName && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-[13px] text-primary">
              <FolderOpen className="h-3.5 w-3.5" aria-hidden="true" /> {selectedNodeName}
              <button type="button" onClick={() => setSelectedNodeId(null)} className="ml-0.5 font-semibold hover:underline" aria-label="Bỏ chọn nhánh">×</button>
            </span>
          )}
          {...(readOnly ? {} : {
            onAdd: () => setShowAddModal(true),
            addLabel: t('pms.assets.addAsset'),
            onImport: () => setShowImportModal(true),
            selection: { selected: selectedRows, onChange: setSelectedRows },
            bulkActions: (
              <Button size="sm" variant="danger" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={handleBulkDelete}>
                {t('pms.assets.deleteMany')} ({selectedRows.size})
              </Button>
            ),
            toolbarActions: (
              <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={handleDownloadTemplate} title={t('pms.assets.downloadTemplate')}>
                {t('pms.assets.template')}
              </Button>
            ),
          })}
        />
      </div>

      {/* Modals */}
      {!readOnly && (
        <>
          <AddAssetModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} onSuccess={loadAssets} />
          <ImportAssetsModal isOpen={showImportModal} onClose={() => setShowImportModal(false)} onSuccess={loadAssets} />
          <EditAssetModal
            isOpen={showEditModal}
            asset={selectedAsset}
            onClose={() => { setShowEditModal(false); setSelectedAsset(null); }}
            onSuccess={loadAssets}
          />
        </>
      )}
      <ViewAssetModal
        isOpen={showViewModal}
        asset={selectedAsset}
        onClose={() => { setShowViewModal(false); setSelectedAsset(null); }}
      />
    </div>
  );
}
