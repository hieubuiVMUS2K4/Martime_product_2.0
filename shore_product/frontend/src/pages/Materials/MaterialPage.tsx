import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { useSearchParams } from 'react-router-dom';
import { Search, Package, Eye, Edit2, Trash2, ChevronsUpDown, Upload, Plus, Download, RefreshCw } from 'lucide-react';
import type { VesselMaterialInput } from '@/services/vesselMaterialService';
import { VesselMaterialFormModal } from './VesselMaterialFormModal';
import { ItemFormModal } from './ItemFormModal';
import { VesselMaterialImportModal } from './VesselMaterialImportModal';
import { vesselMaterialService, downloadVesselMaterialTemplate } from '@/services/vesselMaterialService';
import { useTranslationSafe } from '@/contexts/I18nContext';
import type { MaterialItem, MaterialCategory } from '@/types/maritime.types';
import { useConfirm } from '@/components/common/ConfirmDialog';

const ITEMS_PER_PAGE_OPTIONS = [10, 20, 50];

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

  // Filters
  const [searchName, setSearchName] = useState('');
  const [searchCode, setSearchCode] = useState('');
  const [searchPartNumber, setSearchPartNumber] = useState('');
  const [filterSync, setFilterSync] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [filterUnit, setFilterUnit] = useState<string>('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Row selection
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // Modals
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [catalogImportOpen, setCatalogImportOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MaterialItem | null>(null);
  const [viewingItem, setViewingItem] = useState<MaterialItem | null>(null);

  useEffect(() => { setSelectedRows(new Set()); setItemModalOpen(false); setCatalogImportOpen(false); loadData(); return () => { materialRequest.current++; }; }, [vesselId]);

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

  const handleBulkDelete = async () => {
    if (readOnly) return;
    if (selectedRows.size === 0) return;
    if (!await ask(`Bạn có chắc muốn xóa ${selectedRows.size} vật tư đã chọn?`)) return;
    try {
      const ids = Array.from(selectedRows);
      if (!vesselId) return;
      await vesselMaterialService.remove(vesselId, ids);
      setSelectedRows(new Set());
      await loadData();
    } catch (error: any) {
      toast.error(error.message || 'Xóa thất bại');
    }
  };


  // ---------- Derived ----------

  const uniqueUnits = useMemo(() => [...new Set(items.map(i => i.unit))].sort(), [items]);

  const filteredItems = useMemo(() => {
    let data = [...items];
    if (searchName) {
      const q = searchName.toLowerCase();
      data = data.filter(i => i.name.toLowerCase().includes(q) || i.manufacturer?.toLowerCase().includes(q));
    }
    if (searchCode) {
      const q = searchCode.toLowerCase();
      data = data.filter(i => i.itemCode.toLowerCase().includes(q));
    }
    if (searchPartNumber) data = data.filter(i => (i.partNumber ?? '').toLowerCase().includes(searchPartNumber.toLowerCase()));
    if (filterSync) data = data.filter(i => i.syncStatus === filterSync);
    if (filterUnit) {
      data = data.filter(i => i.unit === filterUnit);
    }
    return data;
  }, [items, searchName, searchCode, searchPartNumber, filterSync, filterUnit]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / itemsPerPage));

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredItems.slice(start, start + itemsPerPage);
  }, [filteredItems, currentPage, itemsPerPage]);

  useEffect(() => { setCurrentPage(1); }, [searchName, searchCode, filterSync, filterUnit]);

  const toggleRow = (id: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllRows = () => {
    if (selectedRows.size === paginatedItems.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(paginatedItems.map(i => i.id)));
  };


  const formatDate = (dateStr: string) => {
    try { return new Date(dateStr).toLocaleDateString('vi-VN'); } catch { return dateStr; }
  };

  // ---------- Render ----------
  if (!vesselId) return <div className="p-6 text-sm text-gray-600">Vào Danh sách tàu, chọn tàu rồi mở Danh sách vật tư để quản lý.</div>;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto"></div>
          <p className="mt-4 text-gray-600">{t('materials.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-white">

      {/* ── HEADER ROW ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">
            ≡ {vesselId ? 'Vật tư của tàu' : t('materials.page.materialList')}
          </span>
          <span className="text-xs bg-[#dce9f8] text-[#16375f] px-2 py-0.5 rounded-full font-semibold">
            {filteredItems.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button title="Thêm vật tư" aria-label="Thêm vật tư" onClick={() => { setEditingItem(null); setItemModalOpen(true); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-[#0b2545] text-white hover:bg-[#16375f]"><Plus className="w-3.5 h-3.5" /> Thêm vật tư</button>
          <button
            title="Xóa nhiều" aria-label="Xóa nhiều" onClick={handleBulkDelete}
            disabled={readOnly || selectedRows.size === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-red-300 rounded text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Trash2 className="w-3.5 h-3.5" /> Xóa nhiều
          </button>
          <button title="Tải mẫu import" aria-label="Tải mẫu import" onClick={downloadVesselMaterialTemplate} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50"><Download className="w-3.5 h-3.5" /></button>
          <button
            onClick={() => setCatalogImportOpen(true)}
            className="p-1.5 border border-gray-300 rounded text-gray-500 hover:bg-gray-50"
            title="Import vật tư" aria-label="Import vật tư"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
          <button title="Đồng bộ vật tư xuống tàu" aria-label="Đồng bộ vật tư xuống tàu" disabled={syncing || !vesselId} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50 disabled:opacity-40" onClick={async () => {
            if (!vesselId) return;
            setSyncing(true);
            try { const result = await vesselMaterialService.sync(vesselId); toast.success(result.message, { duration: 6000 }); await loadData(); }
            catch (e) { toast.error(e instanceof Error ? e.message : 'Đồng bộ thất bại.'); }
            finally { setSyncing(false); }
          }}><RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Đang đồng bộ...' : 'Đồng bộ'}</button>
        </div>
      </div>
      {loadError && <p role="alert" className="bg-red-50 px-4 py-2 text-sm text-red-700">{loadError}</p>}
      {/* ── TABLE ── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full min-w-[1440px] table-fixed text-sm border-collapse">
          <colgroup>
            <col className="w-10" /><col className="w-10" /><col className="w-[150px]" />
            <col className="w-[280px]" /><col className="w-[170px]" /><col className="w-[110px]" />
            <col /><col className="w-[170px]" /><col className="w-[140px]" /><col className="w-[100px]" />
          </colgroup>
          <thead className="sticky top-0 z-10">

            {/* Row 1: Column headers */}
            <tr className="bg-[#eef2f7]">
              <th className="w-10 px-2 py-2 text-center text-xs font-semibold text-gray-600 border-b border-r border-gray-200">TT</th>
              <th className="w-10 px-2 py-2 text-center text-xs font-semibold text-gray-600 border-b border-r border-gray-200">
                <input
                  type="checkbox"
                  checked={selectedRows.size === paginatedItems.length && paginatedItems.length > 0}
                  onChange={toggleAllRows}
                  className="rounded text-[#0b2545]"
                />
              </th>
              <th className="w-32 px-3 py-2 text-left border-b border-r border-gray-200">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-gray-600">{t('materials.page.colCode')}</span>
                  <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                </div>
              </th>
              <th className="min-w-[200px] px-3 py-2 text-left border-b border-r border-gray-200">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-gray-600">{t('materials.page.colName')}</span>
                  <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                </div>
              </th>
              <th className="w-40 px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-r border-gray-200">Mã phụ tùng</th>
              <th className="w-24 px-3 py-2 text-left border-b border-r border-gray-200">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-gray-600">{t('materials.page.colUnit')}</span>
                  <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                </div>
              </th>
              <th className="min-w-[180px] px-3 py-2 text-left border-b border-r border-gray-200">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-gray-600">{t('materials.page.colDescription')}</span>
                </div>
              </th>
              <th className="w-40 px-3 py-2 text-left border-b border-r border-gray-200">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-gray-600">Trạng thái đồng bộ</span>
                  <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                </div>
              </th>
              <th className="w-28 px-3 py-2 text-left border-b border-r border-gray-200">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-gray-600">{t('materials.page.colUpdatedAt')}</span>
                  <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                </div>
              </th>
              <th className="w-24 px-3 py-2 border-b border-gray-200"></th>
            </tr>

            {/* Row 2: Column search inputs */}
            <tr className="bg-white border-b border-gray-200">
              <th className="border-r border-gray-200"></th>
              <th className="border-r border-gray-200"></th>
              {/* Code search */}
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
              {/* Name search */}
              <th className="px-2 py-1 border-r border-gray-200">
                <div className="flex items-center gap-0.5 border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                  <span className="text-gray-400 text-xs select-none">→</span>
                  <input
                    type="text"
                    placeholder={t('common.search')}
                    value={searchName}
                    onChange={e => setSearchName(e.target.value)}
                    className="flex-1 text-xs outline-none min-w-0 bg-transparent"
                  />
                  <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
                </div>
              </th>
              <th className="px-2 py-1 border-r border-gray-200"><input aria-label="Lọc mã phụ tùng" placeholder={t('common.search')} value={searchPartNumber} onChange={e => setSearchPartNumber(e.target.value)} className="w-full text-xs border border-gray-200 rounded px-1.5 py-0.5 outline-none" /></th>
              {/* Unit filter */}
              <th className="px-2 py-1 border-r border-gray-200">
                <select
                  value={filterUnit}
                  onChange={e => setFilterUnit(e.target.value)}
                  className="w-full py-0.5 text-xs border border-gray-200 rounded outline-none bg-white"
                >
                  <option value="">{t('materials.allUnits')}</option>
                  {uniqueUnits.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </th>
              {/* Description - no filter */}
              <th className="border-r border-gray-200"></th>
              {/* Sync filter */}
              <th className="px-2 py-1 border-r border-gray-200">
                <select
                  value={filterSync}
                  onChange={e => setFilterSync(e.target.value)}
                  className="w-full py-0.5 text-xs border border-gray-200 rounded outline-none bg-white"
                >
                  <option value="">Tất cả trạng thái</option><option value="NotSynced">Chưa đồng bộ</option><option value="Pending">Chờ tàu nhận</option><option value="Synced">Đã đồng bộ</option>
                </select>
              </th>
              {/* Date - no filter */}
              <th className="border-r border-gray-200"></th>
              <th className="border-gray-200"></th>
            </tr>

          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedItems.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                  <Package className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p>{t('materials.noItemsFound')}</p>
                </td>
              </tr>
            ) : (
              paginatedItems.map((item, idx) => {
                const globalIndex = (currentPage - 1) * itemsPerPage + idx + 1;
                const low = item.minStock != null && item.onHandQuantity < (item.minStock ?? 0);
                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-[#eef2f7] ${
                      selectedRows.has(item.id) ? 'bg-[#eef2f7]' : idx % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'
                    }`}
                  >
                    {/* TT */}
                    <td className="px-2 py-2 text-center text-xs text-gray-500 border-r border-gray-100">
                      {globalIndex}
                    </td>
                    {/* Checkbox */}
                    <td className="px-2 py-2 text-center border-r border-gray-100">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(item.id)}
                        onChange={() => toggleRow(item.id)}
                        className="rounded text-[#0b2545]"
                      />
                    </td>
                    {/* Mã vật tư */}
                    <td className="px-3 py-2 text-xs text-gray-600 border-r border-gray-100 font-mono">
                      <span title={item.itemCode} className="block truncate">{item.itemCode}</span>
                    </td>
                    {/* Tên vật tư */}
                    <td className="px-3 py-2 border-r border-gray-100">
                      <button
                        onClick={() => { setEditingItem(item); setItemModalOpen(true); }}
                        title={item.name}
                        className="block truncate text-[#0b2545] hover:underline font-medium text-xs text-left w-full"
                      >
                        {item.name}
                      </button>
                      {low && (
                        <span className="ml-4 text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 whitespace-nowrap">LOW</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-gray-600 border-r border-gray-100"><span title={item.partNumber || ''} className="block truncate">{item.partNumber || '—'}</span></td>
                    {/* Đơn vị tính */}
                    <td className="px-3 py-2 text-xs text-gray-600 border-r border-gray-100 text-center">
                      {item.unit}
                    </td>
                    {/* Mô tả */}
                    <td className="px-3 py-2 text-xs text-gray-500 border-r border-gray-100 ">
                      <div title={item.specification || item.notes || ''} className="truncate">{item.specification || item.notes || '—'}</div>
                    </td>
                    {/* Trạng thái đồng bộ */}
                    <td className="px-3 py-2 text-xs border-r border-gray-100">
                      <span title={item.syncedAt ? `Tàu xác nhận: ${new Date(item.syncedAt).toLocaleString('vi-VN')}` : undefined} className={`px-2 py-0.5 rounded-full whitespace-nowrap ${item.syncStatus === 'Synced' ? 'bg-green-100 text-green-700' : item.syncStatus === 'Pending' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                        {item.syncStatus === 'Synced' ? 'Đã đồng bộ' : item.syncStatus === 'Pending' ? 'Chờ tàu nhận' : 'Chưa đồng bộ'}
                      </span>
                    </td>
                    {/* Ngày cập nhật */}
                    <td className="px-3 py-2 text-xs text-gray-500 border-r border-gray-100 text-center">
                      {formatDate(item.updatedAt ?? item.createdAt)}
                    </td>
                    {/* Actions */}
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          onClick={() => setViewingItem(item)}
                          className="p-1 text-gray-400 hover:text-[#0b2545] hover:bg-[#eef2f7] rounded"
                          title="Xem chi tiết"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { setEditingItem(item); setItemModalOpen(true); }}
                          className="p-1 text-gray-400 hover:text-[#0b2545] hover:bg-[#eef2f7] rounded"
                          title={t('materials.page.edit')}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteItem(item)}
                          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                          title={t('materials.page.delete')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── PAGINATION ── */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 bg-white flex-shrink-0 text-xs text-gray-600">
        {/* Left: per-page selector */}
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

        {/* Middle: page buttons */}
        <div className="flex items-center gap-1">
          <span className="mr-2">
            {t('pms.assets.pageInfo', { current: currentPage, total: totalPages, records: filteredItems.length })}
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

        {/* Right: go to page */}
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
