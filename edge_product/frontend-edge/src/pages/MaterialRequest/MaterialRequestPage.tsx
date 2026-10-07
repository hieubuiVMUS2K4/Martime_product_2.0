import { PermissionGate } from '@/components/auth/PermissionGate'
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, Send, Eye, Search, X, Paperclip, Info, ChevronsUpDown, CheckCircle, XCircle } from 'lucide-react';
import { materialRequestService } from '@/services/materialRequest.service';
import { materialService, type MaterialCatalogItem } from '@/services/materialService';
import { maritimeService } from '@/services/maritime.service';
import { equipmentAssetService } from '@/services/equipment-asset.service';
import { VESSEL_CONFIG } from '@/config/app.config';
import { DataTable, TableActions, type Column } from '@/components/common/DataTable';
import { useTranslationSafe } from '@/contexts/I18nContext';
import type { MaterialRequest, MaterialRequestItem } from '@/types/pms.types';
import type { VoyageRecord } from '@/types/maritime.types';
import type { EquipmentAsset } from '@/types/pms.types';

type ViewMode = 'list' | 'detail';

type SearchableOption = {
  value: string;
  label: string;
  subLabel?: string;
};

function SearchableSelect({
  value,
  options,
  placeholder,
  emptyText,
  onChange,
  className = '',
}: {
  value?: string | null;
  options: SearchableOption[];
  placeholder: string;
  emptyText: string;
  onChange: (value: string | null) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const selected = options.find(option => option.value === value);
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? options.filter(option =>
        `${option.label} ${option.subLabel || ''}`.toLowerCase().includes(normalizedQuery)
      )
    : options;

  const toggleOpen = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && buttonRef.current) {
      setMenuRect(buttonRef.current.getBoundingClientRect());
    }
  };

  useEffect(() => {
    if (!open) return;
    const updatePosition = () => {
      if (buttonRef.current) setMenuRect(buttonRef.current.getBoundingClientRect());
    };
    const close = (event: MouseEvent) => {
      if (buttonRef.current?.contains(event.target as Node)) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-searchable-menu="true"]')) return;
      setOpen(false);
    };
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('mousedown', close);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('mousedown', close);
    };
  }, [open]);

  return (
    <div className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className="flex w-full items-center justify-between gap-2 border border-gray-300 bg-white px-2 py-1 text-left text-xs hover:border-blue-400 focus:border-blue-500 focus:outline-none"
      >
        <span className={`truncate ${selected ? 'text-gray-900' : 'text-gray-400'}`}>
          {selected?.label || placeholder}
        </span>
        <ChevronsUpDown size={13} className="shrink-0 text-gray-400" />
      </button>
      {open && menuRect && createPortal(
        <div
          data-searchable-menu="true"
          className="fixed z-[9999] rounded border border-gray-200 bg-white shadow-lg"
          style={{
            top: menuRect.bottom + 4,
            left: menuRect.left,
            width: Math.max(menuRect.width, 260),
          }}
        >
          <div className="flex items-center gap-1 border-b border-gray-100 px-2 py-1.5">
            <Search size={13} className="text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={placeholder}
              className="w-full text-xs outline-none"
            />
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setQuery('');
                  setOpen(false);
                }}
                className="text-gray-400 hover:text-red-500"
              >
                <X size={13} />
              </button>
            )}
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">{emptyText}</div>
            ) : filtered.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setQuery('');
                  setOpen(false);
                }}
                className="flex w-full items-start gap-2 px-3 py-1.5 text-left text-xs hover:bg-blue-50"
              >
                <CheckCircle size={13} className={`mt-0.5 shrink-0 ${option.value === value ? 'text-blue-600' : 'text-transparent'}`} />
                <span className="min-w-0">
                  <span className="block truncate text-gray-900">{option.label}</span>
                  {option.subLabel && <span className="block truncate text-[11px] text-gray-400">{option.subLabel}</span>}
                </span>
              </button>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

const URGENCY_OPTIONS = [
  { value: 'Normal', label: 'Không khẩn cấp', color: 'bg-gray-100 text-gray-700' },
  { value: 'Urgent', label: 'Khẩn cấp', color: 'bg-orange-100 text-orange-700' },
  { value: 'Critical', label: 'Rất khẩn cấp', color: 'bg-red-100 text-red-700' },
];

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-700',
  Submitted: 'bg-blue-100 text-blue-700',
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



export default function MaterialRequestPage() {
  const { t } = useTranslationSafe();
  const [view, setView] = useState<ViewMode>('list');
  const [requests, setRequests] = useState<MaterialRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
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
  // Chọn từ DANH MỤC vật tư công ty (material_items, chuẩn IMPA), không phải tồn kho tàu.
  // Yêu cầu vật tư chính là để bổ sung thứ tàu ĐANG THIẾU, nên không được giới hạn
  // danh sách theo những gì tàu đã có.
  const [materialOptions, setMaterialOptions] = useState<MaterialCatalogItem[]>([]);
  // Tồn kho tra theo MÃ vật tư — danh mục và kho tàu là hai bảng khác nhau, id không trùng.
  const [inventoryStockByItemCode, setInventoryStockByItemCode] = useState<Record<string, { qty: number; unit?: string }>>({});
  const [voyageOptions, setVoyageOptions] = useState<VoyageRecord[]>([]);
  const [assetOptions, setAssetOptions] = useState<EquipmentAsset[]>([]);
  const [materialIdsByEquipment, setMaterialIdsByEquipment] = useState<Record<string, string[]>>({});
  const [loadingMaterialsByEquipment, setLoadingMaterialsByEquipment] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);

  // Detail view
  const [detailData, setDetailData] = useState<MaterialRequest | null>(null);

  const loadList = useCallback(async () => {
    try {
      setLoading(true);
      const res = await materialRequestService.getAll({ page: 1, pageSize: 100000 });
      setRequests(res.items);
      setTotal(res.total);
    } catch (e) {
      console.error('Failed to load requests', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const loadFormOptions = async () => {
    const [mats, shipItems, voyages, assets] = await Promise.all([
      materialService.getCatalog(),
      materialService.getItems({ onlyActive: true }).catch(() => []),
      maritimeService.voyage.getAll({ pageSize: 100 }).then(r => r).catch(() => []),
      equipmentAssetService.getAll().catch(() => []),
    ]);
    const nextStockByItemCode: Record<string, { qty: number; unit?: string }> = {};
    shipItems.forEach(row => {
      if (!row.itemCode) return;
      nextStockByItemCode[row.itemCode] = { qty: Number(row.onHandQuantity || 0), unit: row.unit ?? undefined };
    });
    setMaterialOptions(mats);
    setInventoryStockByItemCode(nextStockByItemCode);
    setVoyageOptions(Array.isArray(voyages) ? voyages : []);
    setAssetOptions(Array.isArray(assets) ? assets : []);
  };

  const loadEquipmentMaterials = async (equipmentAssetId: string, force = false) => {
    if (!force && (materialIdsByEquipment[equipmentAssetId] || loadingMaterialsByEquipment[equipmentAssetId])) return;
    setLoadingMaterialsByEquipment(prev => ({ ...prev, [equipmentAssetId]: true }));
    try {
      const linkedMaterials = await materialService.getMaterialsByEquipment(equipmentAssetId);
      setMaterialIdsByEquipment(prev => ({
        ...prev,
        [equipmentAssetId]: linkedMaterials.map(material => material.materialItemId),
      }));
    } catch {
      setMaterialIdsByEquipment(prev => ({ ...prev, [equipmentAssetId]: [] }));
      toast.error('Không thể tải vật tư theo thiết bị đã chọn.');
    } finally {
      setLoadingMaterialsByEquipment(prev => ({ ...prev, [equipmentAssetId]: false }));
    }
  };

  const getMaterialOptions = (item: MaterialRequestItem) => {
    if (!item.equipmentAssetId) return materialOptions;
    const linkedIds = materialIdsByEquipment[item.equipmentAssetId];
    if (!linkedIds) return [];
    return materialOptions.filter(material => linkedIds.includes(material.id));
  };

  /** Số còn trên tàu — tra theo mã vật tư của danh mục. Null = tàu chưa có vật tư này. */
  const getInventoryQuantity = (materialItemId?: string | null) => {
    if (!materialItemId) return null;
    const item = materialOptions.find(m => m.id === materialItemId);
    if (!item?.itemCode) return null;
    return inventoryStockByItemCode[item.itemCode]?.qty ?? null;
  };

  /** Đơn vị tính lấy theo tồn kho tàu — danh mục không giữ đơn vị. */
  const getInventoryUnit = (materialItemId?: string | null) => {
    if (!materialItemId) return undefined;
    const item = materialOptions.find(m => m.id === materialItemId);
    if (!item?.itemCode) return undefined;
    return inventoryStockByItemCode[item.itemCode]?.unit;
  };

  const getEquipmentLabel = (equipmentAssetId: string | null | undefined) => {
    if (!equipmentAssetId) return '—';
    const asset = assetOptions.find(option => option.id === equipmentAssetId);
    return asset ? `${asset.assetCode} - ${asset.assetName}` : 'Không xác định';
  };

  const openCreate = async () => {
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
    setMaterialIdsByEquipment({});
    setLoadingMaterialsByEquipment({});
    setEditingId(null);
    await loadFormOptions();
    setShowFormModal(true);
  };

  const openEdit = async (id: number) => {
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
      setMaterialIdsByEquipment({});
      setLoadingMaterialsByEquipment({});
      setEditingId(id);
      await loadFormOptions();
      await Promise.all(
        [...new Set((data.items || []).flatMap(item => item.equipmentAssetId ? [item.equipmentAssetId] : []))]
          .map(equipmentAssetId => loadEquipmentMaterials(equipmentAssetId, true)),
      );
      setView('list');
      setShowFormModal(true);
    } catch { /* ignore */ }
  };

  const openDetail = async (id: number) => {
    try {
      const [data, assets] = await Promise.all([
        materialRequestService.getById(id),
        equipmentAssetService.getAll().catch(() => []),
      ]);
      setAssetOptions(Array.isArray(assets) ? assets : []);
      setDetailData(data);
      setView('detail');
    } catch { /* ignore */ }
  };

  const handleSave = async (andSubmit = false) => {
    if (formItems.some(item => !item.materialItemId)) {
      toast.warning('Vui lòng chọn vật tư cho tất cả các dòng yêu cầu.');
      return;
    }
    if (formItems.length === 0) { toast.warning('Vui lòng thêm ít nhất 1 dòng vật tư.'); return; }
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
      setShowFormModal(false);
      loadList();
    } catch (e: any) {
      console.error('Save failed', e);
      const reason = e?.response?.data?.message || e?.response?.data || e?.message;
      toast.error(typeof reason === 'string' && reason ? reason : 'Lưu yêu cầu vật tư thất bại.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    toast('Xác nhận xóa yêu cầu này?', {
      action: { label: 'Xóa', onClick: async () => { await materialRequestService.delete(id); loadList(); } },
      cancel: { label: 'Hủy', onClick: () => {} },
      duration: 8000,
    });
  };

  const handleApprove = async (id: number) => {
    toast('Xác nhận duyệt yêu cầu này?', {
      action: {
        label: 'Duyệt',
        onClick: async () => {
          await materialRequestService.approve(id);
          if (detailData?.id === id) setDetailData({ ...detailData, status: 'Approved' });
          loadList();
          toast.success('Đã duyệt yêu cầu vật tư');
        }
      },
      cancel: { label: 'Hủy', onClick: () => {} },
      duration: 8000,
    });
  };

  const handleReject = async (id: number) => {
    toast('Xác nhận từ chối yêu cầu này?', {
      action: {
        label: 'Từ chối',
        onClick: async () => {
          await materialRequestService.reject(id);
          if (detailData?.id === id) setDetailData({ ...detailData, status: 'Rejected' });
          loadList();
          toast.success('Đã từ chối yêu cầu vật tư');
        }
      },
      cancel: { label: 'Hủy', onClick: () => {} },
      duration: 8000,
    });
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
      unit: getInventoryUnit(materialId) || 'PCS',
      quantityOnHand: getInventoryQuantity(materialId) ?? 0,
    } : item));
  };

  const selectEquipment = async (idx: number, equipmentAssetId: string | null) => {
    setFormItems(prev => prev.map((item, i) => i === idx ? {
      ...item,
      equipmentAssetId,
      materialItemId: null,
      itemName: '',
      unit: 'PCS',
      quantityOnHand: 0,
    } : item));
    if (equipmentAssetId) await loadEquipmentMaterials(equipmentAssetId);
  };

  const selectVoyage = (voyageId: string) => {
    const v = voyageOptions.find(voy => voy.id === voyageId);
    setFormData(prev => ({
      ...prev,
      voyageId,
      voyageName: v ? `${v.voyageNumber} (${v.departurePort || ''} → ${v.arrivalPort || ''})` : '',
    }));
  };

  const urgencyOf = (v: string) => URGENCY_OPTIONS.find(u => u.value === v);
  const columns: Column<MaterialRequest>[] = [
    {
      key: 'requestCode', header: t('materialRequests.code'), width: 200, value: r => r.requestCode,
      render: r => (
        <button type="button" onClick={() => openDetail(r.id)} className="font-medium text-blue-600 hover:underline">{r.requestCode}</button>
      ),
    },
    {
      key: 'urgency', header: t('materialRequests.urgency'), width: 130, align: 'center', value: r => urgencyOf(r.urgency)?.label || r.urgency,
      render: r => <span className={`rounded px-2 py-0.5 font-medium ${urgencyOf(r.urgency)?.color || ''}`}>{urgencyOf(r.urgency)?.label || r.urgency}</span>,
    },
    { key: 'requestDate', header: t('materialRequests.requestDate'), width: 115, align: 'center', value: r => r.requestDate?.slice(0, 10) ?? '' },
    { key: 'neededDate', header: t('materialRequests.neededDate'), width: 115, align: 'center', value: r => r.neededDate?.slice(0, 10) ?? '' },
    { key: 'requestedBy', header: t('materialRequests.requestedBy'), width: 160, value: r => r.requestedBy ?? '' },
    {
      key: 'status', header: t('materialRequests.status'), width: 130, align: 'center', value: r => STATUS_LABELS[r.status] || r.status,
      render: r => <span className={`rounded px-2 py-0.5 font-medium ${STATUS_COLORS[r.status] || ''}`}>{STATUS_LABELS[r.status] || r.status}</span>,
    },
    { key: 'itemCount', header: t('materialRequests.items'), width: 90, numeric: true, value: r => r.itemCount ?? 0 },
    {
      key: 'actions', header: 'Hành động', width: 110, align: 'center', exportable: false,
      render: r => (
        <TableActions>
          <button type="button" onClick={() => openDetail(r.id)} className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600" title="Xem"><Eye size={15} /></button>
          {r.status === 'Draft' && (
            <>
              <PermissionGate permission="pms.requests.update"><button type="button" onClick={() => openEdit(r.id)} className="rounded p-1 text-gray-400 hover:bg-green-50 hover:text-green-600" title="Sửa"><Edit2 size={15} /></button></PermissionGate>
              <PermissionGate permission="pms.requests.delete"><button type="button" onClick={() => handleDelete(r.id)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Xóa"><Trash2 size={15} /></button></PermissionGate>
            </>
          )}
          {r.status === 'Submitted' && (
            <>
              <PermissionGate permission="pms.requests.approve"><button type="button" onClick={() => handleApprove(r.id)} className="rounded p-1 text-gray-400 hover:bg-green-50 hover:text-green-600" title="Duyệt"><CheckCircle size={15} /></button></PermissionGate>
              <PermissionGate permission="pms.requests.reject"><button type="button" onClick={() => handleReject(r.id)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Từ chối"><XCircle size={15} /></button></PermissionGate>
            </>
          )}
        </TableActions>
      ),
    },
  ];

  // ─────── FORM MODAL (Create / Edit) ───────
  const formModal = showFormModal && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={e => { if (e.target === e.currentTarget) setShowFormModal(false); }}>
      <div className="bg-white flex flex-col rounded-lg shadow-2xl" style={{ width: '80vw', height: '88vh', maxWidth: 900 }}>
        {/* Modal header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2.5">
          <span className="text-sm font-semibold text-gray-700">
            {editingId ? 'Chỉnh sửa yêu cầu vật tư' : 'Thêm mới yêu cầu vật tư'}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowFormModal(false)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50">
              <X className="w-3.5 h-3.5" /> Hủy bỏ
            </button>
            <PermissionGate permission={editingId ? 'pms.requests.update' : 'pms.requests.create'}><button disabled={saving} onClick={() => handleSave(false)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              Lưu nháp
            </button></PermissionGate>
            <PermissionGate permission={editingId ? 'pms.requests.update' : 'pms.requests.create'}><button disabled={saving} onClick={() => handleSave(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
              <Send className="w-3.5 h-3.5" /> Lưu và gửi duyệt
            </button></PermissionGate>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {/* Thông tin yêu cầu */}
          <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50">
            <span className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Info size={14} /> Thông tin yêu cầu</span>
          </div>
          <div className="px-4 py-4 space-y-3 text-sm border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">YÊU CẦU VẬT TƯ</h3>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
              {/* Row 1 */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 shrink-0 w-28 text-right">Tàu</label>
                <select value={formData.vesselName} onChange={e => setFormData(p => ({ ...p, vesselName: e.target.value }))} className="flex-1 min-w-0 border border-gray-300 px-2 py-1.5 bg-white text-sm">
                  <option value={VESSEL_CONFIG.VESSEL_NAME}>{VESSEL_CONFIG.VESSEL_NAME}</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 shrink-0 w-28 text-right">Voyage</label>
                <select value={formData.voyageId} onChange={e => selectVoyage(e.target.value)} className="flex-1 min-w-0 border border-gray-300 px-2 py-1.5 bg-white text-sm">
                  <option value="">Lựa chọn</option>
                  {voyageOptions.map(v => <option key={v.id} value={v.id}>{v.voyageNumber} ({v.departurePort} → {v.arrivalPort})</option>)}
                </select>
              </div>
              {/* Row 2 */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 shrink-0 w-28 text-right">Mã yêu cầu</label>
                <input type="text" value={formData.requestCode || '(Tự sinh)'} readOnly className="flex-1 min-w-0 border border-gray-300 px-2 py-1.5 bg-gray-50 text-gray-400 text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 shrink-0 w-28 text-right">Khẩn cấp <span className="text-red-500">*</span></label>
                <select value={formData.urgency} onChange={e => setFormData(p => ({ ...p, urgency: e.target.value }))} className="flex-1 min-w-0 border border-gray-300 px-2 py-1.5 bg-white text-sm">
                  {URGENCY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              {/* Row 3 */}
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 shrink-0 w-28 text-right">Ngày cần VT</label>
                <input type="date" value={formData.neededDate} onChange={e => setFormData(p => ({ ...p, neededDate: e.target.value }))} className="flex-1 min-w-0 border border-gray-300 px-2 py-1.5 text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 shrink-0 w-28 text-right">Ngày yêu cầu <span className="text-red-500">*</span></label>
                <input type="date" value={formData.requestDate} onChange={e => setFormData(p => ({ ...p, requestDate: e.target.value }))} className="flex-1 min-w-0 border border-gray-300 px-2 py-1.5 text-sm" />
              </div>
              {/* Row 4 full */}
              <div className="flex items-center gap-2 col-span-2">
                <label className="text-sm font-medium text-gray-700 shrink-0 w-28 text-right">Người yêu cầu <span className="text-red-500">*</span></label>
                <input type="text" value={formData.requestedBy} onChange={e => setFormData(p => ({ ...p, requestedBy: e.target.value }))} className="flex-1 min-w-0 border border-gray-300 px-2 py-1.5 text-sm" placeholder="Nhập thông tin" />
              </div>
              {/* Row 5 full */}
              <div className="flex items-start gap-2 col-span-2">
                <label className="text-sm font-medium text-gray-700 shrink-0 w-28 text-right pt-1.5">Ghi chú</label>
                <textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} className="flex-1 min-w-0 border border-gray-300 px-2 py-1.5 resize-y text-sm" placeholder="Nhập thông tin" rows={2} />
              </div>
            </div>
          </div>

          {/* Danh sách vật tư */}
          <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50">
            <span className="text-sm font-semibold text-gray-700">Danh sách vật tư</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead className="bg-blue-50">
                <tr>
                  <th className="px-2 py-2 text-left w-8">TT</th>
                  <th className="px-2 py-2 text-left w-36">Tên thiết bị</th>
                  <th className="px-2 py-2 text-left">Tên vật tư <span className="text-red-500">*</span></th>
                  <th className="px-2 py-2 text-left w-14">ĐVT</th>
                  <th className="px-2 py-2 text-right w-16">SL còn</th>
                  <th className="px-2 py-2 text-right w-20">SL yêu cầu <span className="text-red-500">*</span></th>
                  <th className="px-2 py-2 text-left w-24">Ghi chú</th>
                  <th className="px-2 py-2 w-7"></th>
                </tr>
              </thead>
              <tbody>
                {formItems.length === 0 ? (
                  <tr><td colSpan={8} className="text-center py-8 text-gray-400">Không có dữ liệu</td></tr>
                ) : formItems.map((item, idx) => (
                  <tr key={idx} className="border-b">
                    <td className="px-2 py-1.5 text-gray-500">{idx + 1}</td>
                    <td className="px-2 py-1.5">
                      <SearchableSelect
                        value={item.equipmentAssetId || null}
                        placeholder="-- Thiết bị --"
                        emptyText="Không tìm thấy thiết bị"
                        options={assetOptions.map(a => ({
                          value: a.id,
                          label: `${a.assetCode} - ${a.assetName}`,
                        }))}
                        onChange={value => { void selectEquipment(idx, value); }}
                      />
                      <select value={item.equipmentAssetId || ''} onChange={e => selectEquipment(idx, e.target.value || null)} className="hidden">
                        <option value="">-- Thiết bị --</option>
                        {assetOptions.map(a => <option key={a.id} value={a.id}>{a.assetCode} - {a.assetName}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <SearchableSelect
                        value={item.materialItemId || null}
                        placeholder="-- Chọn vật tư --"
                        emptyText="Không tìm thấy vật tư"
                        options={getMaterialOptions(item).map(m => ({
                          value: m.id,
                          label: `${m.itemCode} - ${m.name}`,
                          subLabel: getInventoryQuantity(m.id) == null
                            ? 'Chưa có trên tàu'
                            : `Tồn: ${getInventoryQuantity(m.id)} ${getInventoryUnit(m.id) || ''}`.trim(),
                        }))}
                        onChange={value => {
                          if (value) selectMaterial(idx, value);
                          else updateFormItem(idx, 'materialItemId', null);
                        }}
                      />
                      <select value={item.materialItemId || ''} onChange={e => { if (e.target.value) selectMaterial(idx, e.target.value); else updateFormItem(idx, 'materialItemId', null); }} className="hidden">
                        <option value="">-- Chọn vật tư --</option>
                        {getMaterialOptions(item).map(m => <option key={m.id} value={m.id}>{m.itemCode} - {m.name}</option>)}
                      </select>
                      {item.equipmentAssetId && loadingMaterialsByEquipment[item.equipmentAssetId] && (
                        <div className="mt-1 text-xs text-gray-400">Đang tải vật tư...</div>
                      )}
                      {item.equipmentAssetId && !loadingMaterialsByEquipment[item.equipmentAssetId] && materialIdsByEquipment[item.equipmentAssetId]?.length === 0 && (
                        <div className="mt-1 text-xs text-amber-600">Thiết bị chưa được gán vật tư.</div>
                      )}
                    </td>
                    <td className="px-2 py-1.5"><input type="text" value={item.unit} onChange={e => updateFormItem(idx, 'unit', e.target.value)} className="w-full border border-gray-300 px-1 py-1 text-xs" /></td>
                    <td className="px-2 py-1.5 text-right text-xs text-gray-500">{getInventoryQuantity(item.materialItemId) ?? '-'}</td>
                    <td className="px-2 py-1.5"><input type="number" min={0} step={1} value={item.quantityRequested} onChange={e => updateFormItem(idx, 'quantityRequested', Number(e.target.value))} className="w-full border border-gray-300 px-1 py-1 text-xs text-right" /></td>
                    <td className="px-2 py-1.5"><input type="text" value={item.note || ''} onChange={e => updateFormItem(idx, 'note', e.target.value)} className="w-full border border-gray-300 px-1 py-1 text-xs" /></td>
                    <td className="px-2 py-1.5 text-center"><button onClick={() => removeFormItem(idx)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2 border-t border-gray-200">
            <button onClick={addFormItem} className="flex items-center gap-1 text-blue-600 text-sm hover:text-blue-800">
              <Plus size={14} /> Thêm dòng
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const listView = (
    <div className="h-full w-full flex flex-col overflow-hidden bg-white">
      {/* ── HEADER ROW ── */}
        <div className="flex flex-shrink-0 border-b border-gray-200">
          <div className="flex-1 flex items-center justify-between px-4 py-3 bg-white">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700">
                ≡ {t('materialRequests.title')}
              </span>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">{total}</span>
            </div>
            <div className="flex items-center gap-2">
              <PermissionGate permission="pms.requests.create"><button
                onClick={openCreate}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                <Plus className="w-3.5 h-3.5" /> {t('materialRequests.addNew')}
              </button></PermissionGate>
            </div>
          </div>
        </div>

        <DataTable
          flush
          showCount={false}
          loading={loading}
          columns={columns}
          data={requests}
          rowKey={r => r.id}
          itemLabel="phiếu yêu cầu"
          emptyMessage="Không có dữ liệu"
          searchPlaceholder="Tìm mã phiếu, người yêu cầu..."
          exportOptions={{ fileName: 'yeu-cau-vat-tu', title: 'DANH SÁCH YÊU CẦU VẬT TƯ' }}
          minWidth={1000}
        />
    </div>
  );

  // ─────── DETAIL MODAL ───────
  const detailModal = (view === 'detail' && detailData && !showFormModal) && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={e => { if (e.target === e.currentTarget) setView('list'); }}>
      <div className="bg-white flex flex-col rounded-lg shadow-2xl" style={{ width: '80vw', height: '88vh', maxWidth: 900 }}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">{detailData.requestCode}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[detailData.status]}`}>
              {STATUS_LABELS[detailData.status]}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {detailData.status === 'Draft' && (
              <>
                <PermissionGate permission="pms.requests.update"><button onClick={() => openEdit(detailData.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50"><Edit2 className="w-3.5 h-3.5" /> Sửa</button></PermissionGate>
                <PermissionGate permission="pms.requests.update"><button
                  onClick={async () => {
                    await materialRequestService.submit(detailData.id);
                    setView('list');
                    loadList();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                ><Send className="w-3.5 h-3.5" /> Gửi duyệt</button></PermissionGate>
              </>
            )}
            {detailData.status === 'Submitted' && (
              <>
                <PermissionGate permission="pms.requests.approve"><button
                  onClick={async () => {
                    await handleApprove(detailData.id);
                    const latest = await materialRequestService.getById(detailData.id);
                    setDetailData(latest);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                ><CheckCircle className="w-3.5 h-3.5" /> Duyệt</button></PermissionGate>
                <PermissionGate permission="pms.requests.reject"><button
                  onClick={async () => {
                    await handleReject(detailData.id);
                    const latest = await materialRequestService.getById(detailData.id);
                    setDetailData(latest);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                ><XCircle className="w-3.5 h-3.5" /> Từ chối</button></PermissionGate>
              </>
            )}
            <button onClick={() => setView('list')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50"><X className="w-3.5 h-3.5" /> Đóng</button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {/* ── Thông tin yêu cầu ── */}
          <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50">
            <span className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Info size={14} /> Thông tin yêu cầu</span>
          </div>
          <div className="px-4 py-4 space-y-3 text-sm border-b border-gray-200">
            {/* Title */}
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">YÊU CẦU VẬT TƯ</h3>
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
                    <div className="flex items-center gap-1 text-blue-600">
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
            <thead className="bg-blue-50">
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
                <tr key={idx} className="border-b hover:bg-blue-50">
                  <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                  <td className="px-3 py-2 text-gray-600">
                    {getEquipmentLabel(item.equipmentAssetId)}
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
    </div>
  );

  return <>{listView}{detailModal}{formModal}</>;
}
