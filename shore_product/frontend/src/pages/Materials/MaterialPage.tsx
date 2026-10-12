import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import { Eye, Edit2, Trash2, RefreshCw } from 'lucide-react';
import type { VesselMaterialInput } from '@/services/vesselMaterialService';
import { VesselMaterialFormModal } from './VesselMaterialFormModal';
import { ItemFormModal } from './ItemFormModal';
import { VesselMaterialImportModal } from './VesselMaterialImportModal';
import { vesselMaterialService } from '@/services/vesselMaterialService';
import { Button, DataTable, TableActions, TableIconButton, type Column } from '@/components/common';
import { formatDateVi } from '@/utils/date';
import { useTranslationSafe } from '@/contexts/I18nContext';
import type { MaterialItem, MaterialCategory } from '@/types/maritime.types';
import { useConfirm } from '@/components/common/ConfirmDialog';

const SYNC_LABEL: Record<string, string> = { Synced: 'Đã đồng bộ', Pending: 'Chờ tàu nhận', NotSynced: 'Chưa đồng bộ' };
const SYNC_TONE: Record<string, string> = {
  Synced: 'bg-emerald-50 text-emerald-700', Pending: 'bg-amber-50 text-amber-700', NotSynced: 'bg-slate-100 text-slate-600',
};

/** Nhúng trong màn chi tiết tàu: vesselId lọc theo tàu, readOnly để bờ chỉ xem. */
export function MaterialPage({ vesselId: vesselIdProp, readOnly = false }: { vesselId?: string; readOnly?: boolean } = {}) {
  const ask = useConfirm();
  const { t } = useTranslationSafe();
  const [searchParams] = useSearchParams();
  const vesselId = vesselIdProp ?? (searchParams.get('vesselId') ?? undefined);

  const materialRequest = useRef(0);
  const [items, setItems] = useState<MaterialItem[]>([]);
  const categories: MaterialCategory[] = [];
  const [loading, setLoading] = useState(true);

  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState('');

  // Modals
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [catalogImportOpen, setCatalogImportOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MaterialItem | null>(null);
  const [viewingItem, setViewingItem] = useState<MaterialItem | null>(null);

  useEffect(() => { setItemModalOpen(false); setCatalogImportOpen(false); loadData(); return () => { materialRequest.current++; }; }, [vesselId]);

  const loadData = useCallback(async (quiet = false) => {
    const request = ++materialRequest.current;
    try {
      if (!quiet) setLoading(true);
      const its = vesselId ? await vesselMaterialService.list(vesselId) : [];
      if (request !== materialRequest.current) return;
      setItems(its.map(row => ({ ...row, categoryId: 0, isActive: true, createdAt: row.updatedAt, batchTracked: false, serialTracked: false, expiryRequired: false, currency: 'USD', isSynced: row.syncStatus === 'Synced', syncedAt: row.syncedAt ?? undefined })));
      setLoadError('');
    } catch (e) {
      if (request !== materialRequest.current) return;
      setLoadError(e instanceof Error ? e.message : 'Không thể tải vật tư của tàu.');
    } finally {
      if (request === materialRequest.current) setLoading(false);
    }
  }, [vesselId]);


  useEffect(() => { const timer = window.setInterval(() => loadData(true), 15000); return () => window.clearInterval(timer); }, [loadData]);

  // ---------- Handlers ----------
  const handleCreateItem = async (data: VesselMaterialInput) => {
    if (readOnly) return;
    if (!vesselId) throw new Error('Cần chọn tàu.');
    await vesselMaterialService.create(vesselId, { ...data, unit: data.unit ?? 'PCS' });
    await loadData();
  };

  const handleUpdateItem = async (data: VesselMaterialInput) => {
    if (readOnly) return;
    if (!editingItem) return;
    if (!vesselId) throw new Error('Cần chọn tàu.');
    await vesselMaterialService.update(vesselId, editingItem.id, { ...data, unit: data.unit ?? 'PCS' });
    setEditingItem(null);
    await loadData();
  };

  const handleDeleteItem = async (item: MaterialItem) => {
    if (readOnly) return;
    if (!await ask(t('materials.page.confirmDelete', { name: item.name }))) return;
    try {
      if (!vesselId) return;
      await vesselMaterialService.remove(vesselId, [item.id]);
      await loadData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to delete item');
    }
  };



  // ---------- Columns ----------
  const columns: Column<MaterialItem>[] = [
    { key: 'code', header: t('materials.page.colCode'), width: 150, value: i => i.itemCode, className: 'font-mono' },
    {
      key: 'name', header: t('materials.page.colName'), width: 300, value: i => i.name,
      render: i => (
        <span className="inline-flex max-w-full items-center gap-2">
          <span className="truncate font-medium text-primary">{i.name}</span>
          {i.minStock != null && i.onHandQuantity < (i.minStock ?? 0) && (
            <span className="shrink-0 rounded-full bg-red-100 px-1.5 text-xs font-semibold text-red-700">Dưới tồn tối thiểu</span>
          )}
        </span>
      ),
    },
    { key: 'part', header: 'Mã phụ tùng', width: 160, value: i => i.partNumber ?? '', className: 'font-mono' },
    { key: 'unit', header: t('materials.page.colUnit'), width: 100, align: 'center', value: i => i.unit },
    { key: 'desc', header: t('materials.page.colDescription'), value: i => i.specification || i.notes || '', filter: false },
    {
      key: 'sync', header: 'Trạng thái đồng bộ', width: 150, align: 'center', value: i => SYNC_LABEL[i.syncStatus ?? ''] ?? 'Chưa đồng bộ',
      render: i => (
        <span title={i.syncedAt ? `Tàu xác nhận: ${new Date(i.syncedAt).toLocaleString('vi-VN')}` : undefined}
          className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${SYNC_TONE[i.syncStatus ?? ''] ?? 'bg-slate-100 text-slate-600'}`}>
          {SYNC_LABEL[i.syncStatus ?? ''] ?? 'Chưa đồng bộ'}
        </span>
      ),
    },
    {
      key: 'updated', header: t('materials.page.colUpdatedAt'), width: 120, align: 'center',
      value: i => i.updatedAt ?? i.createdAt ?? '',
      filter: i => formatDateVi(i.updatedAt ?? i.createdAt), exportValue: i => formatDateVi(i.updatedAt ?? i.createdAt),
      render: i => formatDateVi(i.updatedAt ?? i.createdAt),
    },
    {
      key: 'actions', header: 'Thao tác', width: 120, align: 'center',
      render: i => (
        <TableActions>
          <TableIconButton label={`Xem chi tiết ${i.name}`} icon={<Eye />} onClick={() => setViewingItem(i)} />
          {!readOnly && <TableIconButton label={`Sửa ${i.name}`} icon={<Edit2 />} onClick={() => { setEditingItem(i); setItemModalOpen(true); }} />}
          {!readOnly && <TableIconButton label={`Xóa ${i.name}`} icon={<Trash2 />} variant="danger" onClick={() => handleDeleteItem(i)} />}
        </TableActions>
      ),
    },
  ];

  const handleSync = async () => {
    if (!vesselId) return;
    setSyncing(true);
    try { const result = await vesselMaterialService.sync(vesselId); toast.success(result.message, { duration: 6000 }); await loadData(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Đồng bộ thất bại.'); }
    finally { setSyncing(false); }
  };

  // ---------- Render ----------
  if (!vesselId) return <div className="p-6 text-sm text-gray-600">Vào Danh sách tàu, chọn tàu rồi mở Danh sách vật tư để quản lý.</div>;

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <DataTable
        flush
        columns={columns}
        data={items}
        rowKey={i => i.id}
        loading={loading}
        error={loadError || null}
        itemLabel="vật tư"
        emptyMessage={t('materials.noItemsFound')}
        searchPlaceholder="Tìm theo mã, tên, mã phụ tùng, hãng..."
        exportOptions={{ fileName: 'vat-tu-cua-tau', title: 'DANH SÁCH VẬT TƯ CỦA TÀU' }}
        onImport={readOnly ? undefined : () => setCatalogImportOpen(true)}
        onAdd={readOnly ? undefined : () => { setEditingItem(null); setItemModalOpen(true); }}
        addLabel="Thêm vật tư"
        toolbarActions={
          <Button variant="secondary" icon={<RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />} disabled={syncing || !vesselId}
            onClick={handleSync} title="Gửi danh sách vật tư xuống tàu">
            {syncing ? 'Đang đồng bộ...' : 'Đồng bộ xuống tàu'}
          </Button>
        }
        onRowClick={i => setViewingItem(i)}
        minWidth={1180}
      />

      {/* ── MODALS ── */}
      {itemModalOpen && <VesselMaterialFormModal item={editingItem} onClose={() => { setItemModalOpen(false); setEditingItem(null); }} onSubmit={editingItem ? handleUpdateItem : handleCreateItem} />}

      {/* View-only detail modal */}
      <ItemFormModal
        isOpen={!!viewingItem}
        onClose={() => setViewingItem(null)}
        onSubmit={async () => {}}
        item={viewingItem}
        categories={categories}
        title="Chi tiết vật tư"
        viewMode
      />

      {catalogImportOpen && vesselId && <VesselMaterialImportModal vesselId={vesselId} onClose={() => setCatalogImportOpen(false)} onSuccess={() => { loadData(); }} />}

    </div>
  );
}
