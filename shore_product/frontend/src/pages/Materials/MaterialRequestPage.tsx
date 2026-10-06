import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Send, Eye, ArrowLeft, ChevronRight, Search, X, Paperclip, Info, ChevronsUpDown } from 'lucide-react';
import { materialRequestService } from '@/services/materialRequest.service';
import { materialService } from '@/services/materialService';
import { maritimeService } from '@/services/maritime.service';
import { equipmentAssetService } from '@/services/equipment-asset.service';
import { VESSEL_CONFIG } from '@/config/app.config';
import { useTranslationSafe } from '@/contexts/I18nContext';
import type { MaterialRequest, MaterialRequestItem } from '@/types/pms.types';
import type { MaterialItem, VoyageRecord } from '@/types/maritime.types';
import type { EquipmentAsset } from '@/types/pms.types';
import { toast } from 'sonner';
import { useConfirm } from '@/components/common/ConfirmDialog';

type ViewMode = 'list' | 'create' | 'edit' | 'detail';

const URGENCY_OPTIONS = [
  { value: 'Normal', label: 'Không khẩn cấp', color: 'bg-gray-100 text-gray-700' },
  { value: 'Urgent', label: 'Khẩn cấp', color: 'bg-orange-100 text-orange-700' },
  { value: 'Critical', label: 'Rất khẩn cấp', color: 'bg-red-100 text-red-700' },
];

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-700',
  Submitted: 'bg-[#dce9f8] text-[#16375f]',
  Approved: 'bg-green-100 text-green-700',
  Rejected: 'bg-red-100 text-red-700',
  Completed: 'bg-purple-100 text-purple-700',
};

const STATUS_LABELS: Record<string, string> = {
  Draft: 'Bản nháp',
  Submitted: 'Đã gửi duyệt',
  Approved: 'Đã duyệt',
  Rejected: 'Từ chối',
  Completed: 'Hoàn thành',
};

const ITEMS_PER_PAGE_OPTIONS = [10, 20, 50];

/** Nhúng trong màn chi tiết tàu: vesselId lọc theo tàu, readOnly để bờ chỉ xem. */
export default function MaterialRequestPage({ vesselId, readOnly = false }: { vesselId?: string; readOnly?: boolean } = {}) {
  const ask = useConfirm();
  const { t } = useTranslationSafe();
  const [view, setView] = useState<ViewMode>('list');
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQ, setSearchQ] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form state
  const [formData, setFormData] = useState<{
    vesselName: string;
    voyageId: string;
    voyageName: string;
    urgency: string;
    neededDate: string;
    requestDate: string;
    requestedBy: string;
    notes: string;
    attachments: string;
    requestCode: string;
  }>({
    vesselName: VESSEL_CONFIG.VESSEL_NAME,
    voyageId: '',
    voyageName: '',
    urgency: 'Normal',
    neededDate: new Date().toISOString().slice(0, 10),
    requestDate: new Date().toISOString().slice(0, 10),
    requestedBy: '',
    notes: '',
    attachments: '',
    requestCode: '', // for display in edit mode
  });
  const [formItems, setFormItems] = useState<MaterialRequestItem[]>([]);
  const [materialOptions, setMaterialOptions] = useState<MaterialItem[]>([]);
  const [voyageOptions, setVoyageOptions] = useState<VoyageRecord[]>([]);
  const [assetOptions, setAssetOptions] = useState<EquipmentAsset[]>([]);
  const [saving, setSaving] = useState(false);

  // Detail view
  const [detailData, setDetailData] = useState<MaterialRequest | null>(null);

  const loadList = useCallback(async () => {
    try {
      setLoading(true);
      const res = await materialRequestService.getAll({
        page: currentPage,
        pageSize,
        status: filterStatus || undefined,
        q: searchQ || undefined,
        vesselId,
      });
      setRequests(res.items);
      setTotal(res.total);
    } catch (e) {
      console.error('Failed to load requests', e);
    } finally {
      setLoading(false);
    }
  }, [currentPage, pageSize, filterStatus, searchQ, vesselId]);

  useEffect(() => { loadList(); }, [loadList]);

  const loadFormOptions = async () => {
    const [mats, voyages, assets] = await Promise.all([
      materialService.getItems({ onlyActive: true }),
      maritimeService.voyage.getAll({ pageSize: 100 }).then(r => r).catch(() => []),
      equipmentAssetService.getAll().catch(() => []),
    ]);
    setMaterialOptions(mats);
    setVoyageOptions(Array.isArray(voyages) ? voyages : []);
    setAssetOptions(Array.isArray(assets) ? assets : []);
  };

  const openCreate = async () => {
    if (readOnly) return;

    setFormData({
      vesselName: VESSEL_CONFIG.VESSEL_NAME,
      voyageId: '',
      voyageName: '',
      urgency: 'Normal',
      neededDate: new Date().toISOString().slice(0, 10),
      requestDate: new Date().toISOString().slice(0, 10),
      requestedBy: '',
      notes: '',
      attachments: '',
      requestCode: '',
    });
    setFormItems([]);
    setEditingId(null);
    await loadFormOptions();
    setView('create');
  };

  const openEdit = async (id: number) => {
    if (readOnly) return;

    try {
      const data = await materialRequestService.getById(id);
      setFormData({
        vesselName: data.vesselName || VESSEL_CONFIG.VESSEL_NAME,
        voyageId: data.voyageId || '',
        voyageName: data.voyageName || '',
        urgency: data.urgency,
        neededDate: data.neededDate?.slice(0, 10) || '',
        requestDate: data.requestDate?.slice(0, 10) || '',
        requestedBy: data.requestedBy || '',
        notes: data.notes || '',
        attachments: data.attachments || '',
        requestCode: data.requestCode || '',
      });
      setFormItems(data.items || []);
      setEditingId(id);
      await loadFormOptions();
      setView('edit');
    } catch { /* ignore */ }
  };

  const openDetail = async (id: number) => {
    try {
      const data = await materialRequestService.getById(id);
      setDetailData(data);
      setView('detail');
    } catch { /* ignore */ }
  };

  const handleSave = async (andSubmit = false) => {
    if (formItems.length === 0) return void toast.warning('Vui lòng thêm ít nhất 1 dòng vật tư.');
    try {
      setSaving(true);
      const payload = {
        vesselName: formData.vesselName || undefined,
        voyageId: formData.voyageId || undefined,
        voyageName: formData.voyageName || undefined,
        urgency: formData.urgency,
        neededDate: formData.neededDate,
        requestDate: formData.requestDate,
        requestedBy: formData.requestedBy || undefined,
        notes: formData.notes || undefined,
        attachments: formData.attachments || undefined,
        items: formItems,
      };
      if (editingId) {
        await materialRequestService.update(editingId, payload);
        if (andSubmit) await materialRequestService.submit(editingId);
      } else {
        const res = await materialRequestService.create(payload);
        if (andSubmit) await materialRequestService.submit(res.id);
      }
      setView('list');
      loadList();
    } catch (e) {
      console.error('Save failed', e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (readOnly) return;

    if (!await ask('Xác nhận xóa yêu cầu này?')) return;
    await materialRequestService.delete(id);
    loadList();
  };

  const addFormItem = () => {
    setFormItems(prev => [...prev, {
      equipmentAssetId: null,
      materialItemId: null,
      itemName: '',
      description: '',
      unit: 'PCS',
      quantityOnHand: 0,
      quantityRequested: 1,
      note: '',
    }]);
  };

  const updateFormItem = (idx: number, field: string, value: string | number | null) => {
    setFormItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  };

  const removeFormItem = (idx: number) => {
    setFormItems(prev => prev.filter((_, i) => i !== idx));
  };

  const selectMaterial = (idx: number, materialId: string) => {
    const mat = materialOptions.find(m => m.id === materialId);
    if (!mat) return;
    setFormItems(prev => prev.map((item, i) => i === idx ? {
      ...item,
      materialItemId: materialId,
      itemName: mat.name,
      unit: mat.unit || 'PCS',
      quantityOnHand: mat.onHandQuantity || 0,
    } : item));
  };

  const selectVoyage = (voyageId: string) => {
    const v = voyageOptions.find(voy => voy.id === voyageId);
    setFormData(prev => ({
      ...prev,
      voyageId,
      voyageName: v ? `${v.voyageNumber} (${v.departurePort || ''} → ${v.arrivalPort || ''})` : '',
    }));
  };

  const totalPages = Math.ceil(total / pageSize);

  // ─────── LIST VIEW ───────
  if (view === 'list') {
    return (
      <div className="h-full w-full flex flex-col overflow-hidden bg-white">
        {/* ── HEADER ROW ── */}
        <div className="flex flex-shrink-0 border-b border-gray-200">
          <div className="flex-1 flex items-center justify-between px-4 py-3 bg-white">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700">
                ≡ {t('materialRequests.title')}
              </span>
              <span className="text-xs bg-[#dce9f8] text-[#16375f] px-2 py-0.5 rounded-full font-semibold">{total}</span>
            </div>
            <div className="flex items-center gap-2">
            </div>
          </div>
        </div>

        {/* ── TABLE ── */}
        <div className="flex-1 overflow-auto">
          <table className="min-w-full text-sm border-collapse table-fixed">
            <thead className="sticky top-0 z-10">
              {/* Row 1: Column headers + sort icons */}
              <tr className="bg-[#eef2f7]">
                <th className="w-10 px-2 py-2 text-center text-xs font-semibold text-gray-600 border-b border-r border-gray-200">TT</th>
                <th className="w-[200px] px-3 py-2 text-left border-b border-r border-gray-200">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-gray-600">{t('materialRequests.code')}</span>
                    <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                <th className="w-[110px] px-3 py-2 text-left border-b border-r border-gray-200">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-gray-600">{t('materialRequests.urgency')}</span>
                    <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                <th className="w-[105px] px-3 py-2 text-left border-b border-r border-gray-200">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-gray-600">{t('materialRequests.requestDate')}</span>
                    <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                <th className="w-[105px] px-3 py-2 text-left border-b border-r border-gray-200">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-gray-600">{t('materialRequests.neededDate')}</span>
                    <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                <th className="w-[120px] px-3 py-2 text-left border-b border-r border-gray-200">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-gray-600">{t('materialRequests.requestedBy')}</span>
                    <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                <th className="w-[110px] px-3 py-2 text-left border-b border-r border-gray-200">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-gray-600">{t('materialRequests.status')}</span>
                    <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                <th className="w-14 px-3 py-2 text-left border-b border-r border-gray-200">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-gray-600">{t('materialRequests.items')}</span>
                    <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                <th className="w-20 px-3 py-2 border-b border-gray-200"></th>
              </tr>
              {/* Row 2: Column filters */}
              <tr className="bg-white border-b border-gray-200">
                <th className="border-r border-gray-200"></th>
                <th className="px-2 py-1 border-r border-gray-200">
                  <div className="flex items-center gap-0.5 border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                    <span className="text-gray-400 text-xs select-none">→</span>
                    <input type="text" placeholder={t('common.search')} value={searchQ} onChange={e => { setSearchQ(e.target.value); setCurrentPage(1); }} className="flex-1 text-xs outline-none min-w-0 bg-transparent" />
                    <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                <th className="border-r border-gray-200"></th>
                <th className="border-r border-gray-200"></th>
                <th className="border-r border-gray-200"></th>
                <th className="border-r border-gray-200"></th>
                <th className="px-2 py-1 border-r border-gray-200">
                  <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1); }} className="w-full py-0.5 text-xs border border-gray-200 rounded outline-none bg-white">
                    <option value="">Tất cả</option>
                    {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </th>
                <th className="border-r border-gray-200"></th>
                <th className="border-gray-200"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">Đang tải...</td></tr>
              ) : requests.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-8 text-gray-400">Không có dữ liệu</td></tr>
              ) : requests.map((r, idx) => (
                <tr key={r.id} className={`hover:bg-[#eef2f7] ${idx % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'}`}>
                  <td className="px-2 py-2 text-center text-xs text-gray-500 border-r border-gray-100">{(currentPage - 1) * pageSize + idx + 1}</td>
                  <td className="px-3 py-2 text-xs border-r border-gray-100">
                    <button onClick={() => openDetail(r.id)} className="text-[#0b2545] hover:underline font-medium text-xs">
                      {r.requestCode}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-xs border-r border-gray-100">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${URGENCY_OPTIONS.find(u => u.value === r.urgency)?.color || ''}`}>
                      {URGENCY_OPTIONS.find(u => u.value === r.urgency)?.label || r.urgency}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600 border-r border-gray-100">{r.requestDate?.slice(0, 10)}</td>
                  <td className="px-3 py-2 text-xs text-gray-600 border-r border-gray-100">{r.neededDate?.slice(0, 10)}</td>
                  <td className="px-3 py-2 text-xs text-gray-600 border-r border-gray-100">{r.requestedBy}</td>
                  <td className="px-3 py-2 text-xs border-r border-gray-100">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[r.status] || ''}`}>
                      {STATUS_LABELS[r.status] || r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600 border-r border-gray-100">{r.itemCount}</td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => openDetail(r.id)} className="p-1 text-gray-400 hover:text-[#0b2545] hover:bg-[#eef2f7] rounded" title="Xem"><Eye size={15} /></button>
                      {r.status === 'Draft' && (
                        <>
                          {!readOnly && <button onClick={() => openEdit(r.id)} className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded" title="Sửa"><Edit2 size={15} /></button>}
                          {!readOnly && <button onClick={() => handleDelete(r.id)} className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" title="Xóa"><Trash2 size={15} /></button>}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── PAGINATION ── */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 bg-white flex-shrink-0 text-xs text-gray-600">
          <div>
            <select value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }} className="border border-gray-300 rounded px-2 py-1 text-xs">
              {ITEMS_PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n} / trang</option>)}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="mr-2">Trang {currentPage} / {totalPages} ({total} bản ghi)</span>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">‹</button>
            {[...Array(Math.min(5, totalPages))].map((_, i) => {
              let page: number;
              if (totalPages <= 5) page = i + 1;
              else if (currentPage <= 3) page = i + 1;
              else if (currentPage >= totalPages - 2) page = totalPages - 4 + i;
              else page = currentPage - 2 + i;
              return (
                <button key={page} onClick={() => setCurrentPage(page)} className={`w-7 h-7 flex items-center justify-center border rounded text-xs ${currentPage === page ? 'bg-[#0b2545] text-white border-accent' : 'border-gray-300 hover:bg-gray-50'}`}>
                  {page}
                </button>
              );
            })}
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">›</button>
          </div>
          <div className="flex items-center gap-2">
            <span>Đến trang</span>
            <input type="number" min={1} max={totalPages} value={currentPage} onChange={e => { const v = Number(e.target.value); if (v >= 1 && v <= totalPages) setCurrentPage(v); }} className="w-12 border border-gray-300 rounded px-1 py-1 text-center text-xs" />
          </div>
        </div>
      </div>
    );
  }

  // ─────── DETAIL VIEW ───────
  if (view === 'detail' && detailData) {
    return (
      <div className="h-full w-full flex flex-col overflow-hidden bg-white">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2.5">
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-700"><ArrowLeft size={18} /></button>
            <button onClick={() => setView('list')} className="text-[#0b2545] hover:underline">Vật tư</button>
            <ChevronRight size={14} className="text-gray-300" />
            <button onClick={() => setView('list')} className="text-[#0b2545] hover:underline">{t('materialRequests.title')}</button>
            <ChevronRight size={14} className="text-gray-300" />
            <span className="text-gray-700 font-medium">{detailData.requestCode}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[detailData.status]}`}>
              {STATUS_LABELS[detailData.status]}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {detailData.status === 'Draft' && (
              <>
                {!readOnly && <button onClick={() => openEdit(detailData.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50"><Edit2 className="w-3.5 h-3.5" /> Sửa</button>}
                <button
                  onClick={async () => {
                    await materialRequestService.submit(detailData.id);
                    setView('list');
                    loadList();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#0b2545] text-white rounded hover:bg-[#16375f]"
                ><Send className="w-3.5 h-3.5" /> Gửi duyệt</button>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {/* ── Thông tin yêu cầu ── */}
          <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50">
            <span className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Info size={14} /> Thông tin yêu cầu</span>
          </div>
          <div className="px-4 py-4 space-y-3 text-sm border-b border-gray-200">
            {/* Title + counter badge */}
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">YÊU CẦU VẬT TƯ</h3>
              <span className="text-xs text-gray-400">{detailData.itemCount || detailData.items?.length || 0}/{255}</span>
            </div>

            {/* Row 1: Tàu / Voyage / Mã yêu cầu */}
            <div className="grid grid-cols-3 gap-x-6 gap-y-3">
              <div className="flex items-center">
                <span className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 140 }}>Tàu</span>
                <input type="text" readOnly value={detailData.vesselName || VESSEL_CONFIG.VESSEL_NAME} className="flex-1 border border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-600 text-sm" />
              </div>
              <div className="flex items-center">
                <span className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 100 }}>Voyage</span>
                <input type="text" readOnly value={detailData.voyageName || '—'} className="flex-1 border border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-600 text-sm" />
              </div>
              <div className="flex items-center">
                <span className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 110 }}>Mã yêu cầu</span>
                <input type="text" readOnly value={detailData.requestCode} className="flex-1 border border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-600 text-sm" />
              </div>

              {/* Row 2: Trạng thái khẩn cấp / Ngày cần vật tư / Ngày yêu cầu */}
              <div className="flex items-center">
                <span className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 140 }}>Trạng thái khẩn cấp</span>
                <div className="flex-1 border border-gray-300 px-3 py-1.5 bg-gray-50 text-sm">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${URGENCY_OPTIONS.find(u => u.value === detailData.urgency)?.color || ''}`}>
                    {URGENCY_OPTIONS.find(u => u.value === detailData.urgency)?.label}
                  </span>
                </div>
              </div>
              <div className="flex items-center">
                <span className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 100 }}>Ngày cần vật tư</span>
                <input type="text" readOnly value={detailData.neededDate?.slice(0, 10) || '—'} className="flex-1 border border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-600 text-sm" />
              </div>
              <div className="flex items-center">
                <span className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 110 }}>Ngày yêu cầu <span className="text-red-500">*</span></span>
                <input type="text" readOnly value={detailData.requestDate?.slice(0, 10) || '—'} className="flex-1 border border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-600 text-sm" />
              </div>

              {/* Row 3: Người yêu cầu / Ghi chú */}
              <div className="flex items-center">
                <span className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 140 }}>Người yêu cầu <span className="text-red-500">*</span></span>
                <input type="text" readOnly value={detailData.requestedBy || '—'} className="flex-1 border border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-600 text-sm" />
              </div>
              <div className="flex items-center col-span-2">
                <span className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 100 }}>Ghi chú</span>
                <input type="text" readOnly value={detailData.notes || '—'} className="flex-1 border border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-600 text-sm" />
              </div>

              {/* Row 4: Đính kèm tệp tin */}
              {detailData.attachments && (
                <div className="flex items-center">
                  <span className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 140 }}>Đính kèm tệp tin</span>
                  <div className="flex-1 border border-gray-300 px-3 py-1.5 bg-gray-50 text-sm">
                    <div className="flex items-center gap-1 text-[#0b2545]">
                      <Paperclip size={13} /> {detailData.attachments}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Danh sách vật tư ── */}
          <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50">
            <span className="text-sm font-semibold text-gray-700">Danh sách vật tư</span>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-[#eef2f7]">
              <tr>
                <th className="px-3 py-2 text-left w-12">TT</th>
                <th className="px-3 py-2 text-left">Tên thiết bị</th>
                <th className="px-3 py-2 text-left">Tên vật tư <span className="text-red-500">*</span></th>
                <th className="px-3 py-2 text-left">Mô tả</th>
                <th className="px-3 py-2 text-left w-20">Đơn vị tính</th>
                <th className="px-3 py-2 text-right w-24">Số lượng còn</th>
                <th className="px-3 py-2 text-right w-28">Số lượng yêu cầu <span className="text-red-500">*</span></th>
                <th className="px-3 py-2 text-left">Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {(detailData.items || []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-8 text-gray-400">
                    Không có dữ liệu
                  </td>
                </tr>
              ) : (detailData.items || []).map((item, idx) => (
                <tr key={idx} className="border-b hover:bg-[#eef2f7]">
                  <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {item.equipmentAssetId ? (item.equipmentAssetId) : '—'}
                  </td>
                  <td className="px-3 py-2 font-medium">{item.itemName}</td>
                  <td className="px-3 py-2 text-gray-500">{item.description || '—'}</td>
                  <td className="px-3 py-2">{item.unit}</td>
                  <td className="px-3 py-2 text-right">{item.quantityOnHand}</td>
                  <td className="px-3 py-2 text-right font-semibold">{item.quantityRequested}</td>
                  <td className="px-3 py-2 text-gray-500">{item.note || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // ─────── CREATE / EDIT FORM ───────
  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-white">
      {/* Breadcrumb header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2.5">
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-700"><ArrowLeft size={18} /></button>
          <button onClick={() => setView('list')} className="text-[#0b2545] hover:underline">Vật tư</button>
          <ChevronRight size={14} className="text-gray-300" />
          <button onClick={() => setView('list')} className="text-[#0b2545] hover:underline">{t('materialRequests.title')}</button>
          <ChevronRight size={14} className="text-gray-300" />
          <span className="text-gray-700 font-medium">{editingId ? 'Chỉnh sửa yêu cầu vật tư' : 'Thêm mới yêu cầu vật tư'}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setView('list')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50">
            <X className="w-3.5 h-3.5" /> Hủy bỏ
          </button>
          <button
            disabled={saving}
            onClick={() => handleSave(false)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#0b2545] text-white rounded hover:bg-[#16375f] disabled:opacity-50"
          >
            Lưu nháp
          </button>
          <button
            disabled={saving}
            onClick={() => handleSave(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" /> Lưu và gửi duyệt
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {/* ── Thông tin yêu cầu ── */}
        <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50">
          <span className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Info size={14} /> Thông tin yêu cầu</span>
        </div>
        <div className="px-4 py-4 space-y-3 text-sm border-b border-gray-200">
          {/* Title + counter badge */}
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base">YÊU CẦU VẬT TƯ</h3>
            <span className="text-xs text-gray-400">{formItems.length}/{255}</span>
          </div>

          {/* Row 1: Tàu / Voyage / Mã yêu cầu */}
          <div className="grid grid-cols-3 gap-x-6 gap-y-3">
            <div className="flex items-center">
              <label className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 140 }}>Tàu</label>
              <select
                value={formData.vesselName}
                onChange={e => setFormData(p => ({ ...p, vesselName: e.target.value }))}
                className="flex-1 border border-gray-300 px-3 py-1.5 bg-white text-sm"
              >
                <option value={VESSEL_CONFIG.VESSEL_NAME}>{VESSEL_CONFIG.VESSEL_NAME}</option>
              </select>
            </div>
            <div className="flex items-center">
              <label className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 100 }}>Voyage</label>
              <select
                value={formData.voyageId}
                onChange={e => selectVoyage(e.target.value)}
                className="flex-1 border border-gray-300 px-3 py-1.5 bg-white text-sm"
              >
                <option value="">Lựa chọn</option>
                {voyageOptions.map(v => (
                  <option key={v.id} value={v.id}>{v.voyageNumber} ({v.departurePort} → {v.arrivalPort})</option>
                ))}
              </select>
            </div>
            <div className="flex items-center">
              <label className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 110 }}>Mã yêu cầu</label>
              <input
                type="text"
                value={formData.requestCode || '(Tự sinh)'}
                readOnly
                className="flex-1 border border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-400 text-sm"
              />
            </div>

            {/* Row 2: Trạng thái khẩn cấp / Ngày cần vật tư / Ngày yêu cầu */}
            <div className="flex items-center">
              <label className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 140 }}>Trạng thái khẩn cấp <span className="text-red-500">*</span></label>
              <select
                value={formData.urgency}
                onChange={e => setFormData(p => ({ ...p, urgency: e.target.value }))}
                className="flex-1 border border-gray-300 px-3 py-1.5 bg-white text-sm"
              >
                {URGENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="flex items-center">
              <label className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 100 }}>Ngày cần vật tư</label>
              <input
                type="date"
                value={formData.neededDate}
                onChange={e => setFormData(p => ({ ...p, neededDate: e.target.value }))}
                className="flex-1 border border-gray-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex items-center">
              <label className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 110 }}>Ngày yêu cầu <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={formData.requestDate}
                onChange={e => setFormData(p => ({ ...p, requestDate: e.target.value }))}
                className="flex-1 border border-gray-300 px-3 py-1.5 text-sm"
              />
            </div>

            {/* Row 3: Người yêu cầu */}
            <div className="flex items-center col-span-3">
              <label className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 140 }}>Người yêu cầu <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.requestedBy}
                onChange={e => setFormData(p => ({ ...p, requestedBy: e.target.value }))}
                className="flex-1 border border-gray-300 px-3 py-1.5 text-sm"
                placeholder="Nhập thông tin"
              />
            </div>

            {/* Row 4: Ghi chú */}
            <div className="flex items-start col-span-3">
              <label className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap pt-1.5" style={{ width: 140 }}>Ghi chú</label>
              <textarea
                value={formData.notes}
                onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
                className="flex-1 border border-gray-300 px-3 py-1.5 min-h-[36px] resize-y text-sm"
                placeholder="Nhập thông tin"
                rows={1}
              />
            </div>

            {/* Row 5: Đính kèm tệp tin */}
            <div className="flex items-center col-span-3">
              <label className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 140 }}>Đính kèm tệp tin</label>
              <div className="flex-1">
                <label className="flex items-center gap-1.5 text-[#0b2545] text-sm cursor-pointer hover:text-primary">
                  <Paperclip size={14} /> Đính kèm tệp tin
                  <input
                    type="file"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) setFormData(p => ({ ...p, attachments: file.name }));
                    }}
                  />
                </label>
                {formData.attachments && (
                  <span className="text-xs text-gray-500 ml-2">{formData.attachments}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Danh sách vật tư ── */}
        <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50">
          <span className="text-sm font-semibold text-gray-700">Danh sách vật tư</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1000px]">
            <thead className="bg-[#eef2f7]">
              <tr>
                <th className="px-2 py-2 text-left w-10">TT</th>
                <th className="px-2 py-2 text-left w-44">Tên thiết bị</th>
                <th className="px-2 py-2 text-left">Tên vật tư <span className="text-red-500">*</span></th>
                <th className="px-2 py-2 text-left w-32">Mô tả</th>
                <th className="px-2 py-2 text-left w-20">Đơn vị tính</th>
                <th className="px-2 py-2 text-right w-24">Số lượng còn</th>
                <th className="px-2 py-2 text-right w-28">Số lượng yêu cầu <span className="text-red-500">*</span></th>
                <th className="px-2 py-2 text-left w-28">Ghi chú</th>
                <th className="px-2 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {formItems.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-8 text-gray-400">
                    Không có dữ liệu
                  </td>
                </tr>
              ) : formItems.map((item, idx) => (
                <tr key={idx} className="border-b">
                  <td className="px-2 py-1.5 text-gray-500">{idx + 1}</td>
                  {/* Tên thiết bị */}
                  <td className="px-2 py-1.5">
                    <select
                      value={item.equipmentAssetId || ''}
                      onChange={e => updateFormItem(idx, 'equipmentAssetId', e.target.value || null)}
                      className="w-full border border-gray-300 px-1.5 py-1 text-sm"
                    >
                      <option value="">-- Chọn thiết bị --</option>
                      {assetOptions.map(a => (
                        <option key={a.id} value={a.id}>{a.assetCode} - {a.assetName}</option>
                      ))}
                    </select>
                  </td>
                  {/* Tên vật tư */}
                  <td className="px-2 py-1.5">
                    <select
                      value={item.materialItemId || ''}
                      onChange={e => {
                        if (e.target.value) selectMaterial(idx, e.target.value);
                        else updateFormItem(idx, 'materialItemId', null);
                      }}
                      className="w-full border border-gray-300 px-1.5 py-1 text-sm"
                    >
                      <option value="">-- Chọn vật tư --</option>
                      {materialOptions.map(m => (
                        <option key={m.id} value={m.id}>{m.itemCode} - {m.name}</option>
                      ))}
                    </select>
                    {!item.materialItemId && (
                      <input
                        type="text"
                        value={item.itemName}
                        onChange={e => updateFormItem(idx, 'itemName', e.target.value)}
                        className="w-full border border-gray-300 px-1.5 py-1 text-sm mt-1"
                        placeholder="Hoặc nhập tên thủ công..."
                      />
                    )}
                  </td>
                  {/* Mô tả */}
                  <td className="px-2 py-1.5">
                    <input type="text" value={item.description || ''} onChange={e => updateFormItem(idx, 'description', e.target.value)} className="w-full border border-gray-300 px-1.5 py-1 text-sm" />
                  </td>
                  {/* Đơn vị tính */}
                  <td className="px-2 py-1.5">
                    <input type="text" value={item.unit} onChange={e => updateFormItem(idx, 'unit', e.target.value)} className="w-full border border-gray-300 px-1.5 py-1 text-sm" />
                  </td>
                  {/* Số lượng còn */}
                  <td className="px-2 py-1.5 text-right text-gray-500">{item.quantityOnHand}</td>
                  {/* Số lượng yêu cầu */}
                  <td className="px-2 py-1.5">
                    <input type="number" min={0} step={1} value={item.quantityRequested} onChange={e => updateFormItem(idx, 'quantityRequested', Number(e.target.value))} className="w-full border border-gray-300 px-1.5 py-1 text-sm text-right" />
                  </td>
                  {/* Ghi chú */}
                  <td className="px-2 py-1.5">
                    <input type="text" value={item.note || ''} onChange={e => updateFormItem(idx, 'note', e.target.value)} className="w-full border border-gray-300 px-1.5 py-1 text-sm" />
                  </td>
                  {/* Xóa */}
                  <td className="px-2 py-1.5 text-center">
                    <button onClick={() => removeFormItem(idx)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2 border-t border-gray-200">
          <button onClick={addFormItem} className="flex items-center gap-1 text-[#0b2545] text-sm hover:text-primary">
            <Plus size={14} /> Thêm dòng
          </button>
        </div>
      </div>
    </div>
  );
}

