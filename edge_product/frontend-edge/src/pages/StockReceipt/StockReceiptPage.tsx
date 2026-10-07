import { PermissionGate } from '@/components/auth/PermissionGate'
import { ReceiptCompletionButton } from './ReceiptCompletionButton';
import { usePermission } from '@/stores/permissions.store';
import axios from 'axios';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, Eye, Search, X, CheckCircle, Send, Paperclip, Info, ChevronsUpDown } from 'lucide-react';
import { stockReceiptService } from '@/services/stockReceipt.service';
import { materialService, type MaterialCatalogItem } from '@/services/materialService';
import { storeLocationService } from '@/services/store-location.service';
import { materialRequestService } from '@/services/materialRequest.service';
import { maritimeService } from '@/services/maritime.service';
import { VESSEL_CONFIG } from '@/config/app.config';
import { DataTable, TableActions, type Column } from '@/components/common/DataTable';
import { useTranslationSafe } from '@/contexts/I18nContext';
import type { StockReceipt, StockReceiptItem, StoreLocation, MaterialRequest } from '@/types/pms.types';
import type { MaterialItem, VoyageRecord } from '@/types/maritime.types';

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
    ? options.filter(option => `${option.label} ${option.subLabel || ''}`.toLowerCase().includes(normalizedQuery))
    : options;

  const toggleOpen = () => {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && buttonRef.current) setMenuRect(buttonRef.current.getBoundingClientRect());
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

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-gray-100 text-gray-700',
  Submitted: 'bg-yellow-100 text-yellow-700',
  Approved: 'bg-green-100 text-green-700',
  Completed: 'bg-purple-100 text-purple-700',
};
const STATUS_LABELS: Record<string, string> = {
  Draft: 'Bản nháp',
  Submitted: 'Chờ duyệt',
  Approved: 'Đã duyệt',
  Completed: 'Hoàn thành',
};



export default function StockReceiptPage() {
  const canCreate = usePermission('pms.receipts.create');
  const canUpdate = usePermission('pms.receipts.update');
  const canSubmit = canCreate || canUpdate;
  const { t } = useTranslationSafe();
  const [view, setView] = useState<ViewMode>('list');
  const [receipts, setReceipts] = useState<StockReceipt[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showFormModal, setShowFormModal] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    vesselName: VESSEL_CONFIG.VESSEL_NAME,
    voyageId: '',
    voyageName: '',
    supplierCode: '',
    supplierName: '',
    receivedDate: new Date().toISOString().slice(0, 10),
    receiptDate: new Date().toISOString().slice(0, 10),
    createdBy: '',
    notes: '',
    attachments: '',
    materialRequestId: undefined as number | undefined,
    receiptCode: '', // display in edit mode
  });
  const [formItems, setFormItems] = useState<StockReceiptItem[]>([]);
  const [materialOptions, setMaterialOptions] = useState<MaterialCatalogItem[]>([]);
  // Tồn kho tàu tra theo mã vật tư — danh mục và kho tàu là 2 bảng khác nhau, id không trùng.
  const [shipStockByItemCode, setShipStockByItemCode] = useState<Record<string, MaterialItem>>({});
  const [locationOptions, setLocationOptions] = useState<StoreLocation[]>([]);
  const [requestOptions, setRequestOptions] = useState<MaterialRequest[]>([]);
  const [voyageOptions, setVoyageOptions] = useState<VoyageRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [detailData, setDetailData] = useState<StockReceipt | null>(null);

  const [showRequestPicker, setShowRequestPicker] = useState(false);

  const loadList = useCallback(async () => {
    try {
      setLoading(true);
      const res = await stockReceiptService.getAll({ page: 1, pageSize: 100000 });
      setReceipts(res.items);
      setTotal(res.total);
    } catch (e) {
      toast.error(axios.isAxiosError(e) && typeof e.response?.data === 'string'
        ? e.response.data : 'Không thể tải danh sách phiếu nhập kho');
    }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const loadFormOptions = async () => {
    const [mats, shipItems, locs, reqs, voyages] = await Promise.all([
      materialService.getCatalog(),
      materialService.getItems({ onlyActive: true }),
      storeLocationService.getAll(),
      materialRequestService.getApproved(),
      maritimeService.voyage.getAll({ pageSize: 100 }).then(r => r).catch(() => []),
    ]);
    setMaterialOptions(mats);
    const stockMap: Record<string, MaterialItem> = {};
    (Array.isArray(shipItems) ? shipItems : []).forEach(row => { stockMap[row.itemCode] = row; });
    setShipStockByItemCode(stockMap);
    setLocationOptions(locs);
    setRequestOptions(reqs);
    setVoyageOptions(Array.isArray(voyages) ? voyages : []);
  };

  const openCreate = async () => {
    setFormData({
      vesselName: VESSEL_CONFIG.VESSEL_NAME,
      voyageId: '',
      voyageName: '',
      supplierCode: '',
      supplierName: '',
      receivedDate: new Date().toISOString().slice(0, 10),
      receiptDate: new Date().toISOString().slice(0, 10),
      createdBy: '',
      notes: '',
      attachments: '',
      materialRequestId: undefined,
      receiptCode: '',
    });
    setFormItems([]);
    setEditingId(null);
    await loadFormOptions();
    setShowFormModal(true);
  };

  const openEdit = async (id: number) => {
    try {
      const data = await stockReceiptService.getById(id);
      setFormData({
        vesselName: data.vesselName || VESSEL_CONFIG.VESSEL_NAME,
        voyageId: data.voyageId || '',
        voyageName: data.voyageName || '',
        supplierCode: data.supplierCode || '',
        supplierName: data.supplierName || '',
        receivedDate: data.receivedDate?.slice(0, 10) || '',
        receiptDate: data.receiptDate?.slice(0, 10) || '',
        createdBy: data.createdBy || '',
        notes: data.notes || '',
        attachments: data.attachments || '',
        materialRequestId: data.materialRequestId || undefined,
        receiptCode: data.receiptCode || '',
      });
      setFormItems(data.items || []);
      setEditingId(id);
      await loadFormOptions();
      setView('list');
      setShowFormModal(true);
    } catch { /* ignore */ }
  };

  const openDetail = async (id: number) => {
    try {
      const data = await stockReceiptService.getById(id);
      setDetailData(data);
      await loadFormOptions();
      setView('detail');
    } catch { /* ignore */ }
  };

  const handleSave = async (andSubmit = false) => {
    if (formItems.some(item => !item.storeLocationId)) {
      toast.warning('Vui lòng chọn vị trí kho cho tất cả các dòng vật tư.');
      return;
    }
    if (formItems.length === 0) { toast.warning('Vui lòng thêm ít nhất 1 dòng vật tư.'); return; }
    try {
      setSaving(true);
      const payload = {
        vesselName: formData.vesselName || undefined,
        voyageId: formData.voyageId || undefined,
        voyageName: formData.voyageName || undefined,
        supplierCode: formData.supplierCode || undefined,
        supplierName: formData.supplierName || undefined,
        receivedDate: formData.receivedDate,
        receiptDate: formData.receiptDate,
        createdBy: formData.createdBy || undefined,
        notes: formData.notes || undefined,
        attachments: formData.attachments || undefined,
        materialRequestId: formData.materialRequestId,
        items: formItems,
      };
      if (editingId) {
        await stockReceiptService.update(editingId, payload);
        if (andSubmit) await stockReceiptService.submit(editingId);
      } else {
        const res = await stockReceiptService.create(payload);
        setEditingId(res.id);
        if (andSubmit) await stockReceiptService.submit(res.id);
      }
      setShowFormModal(false);
      loadList();
      toast.success(andSubmit ? 'Đã gửi phiếu nhập kho chờ duyệt' : 'Đã lưu phiếu nhập kho');
    } catch (e) {
      toast.error(axios.isAxiosError(e) && typeof e.response?.data === 'string'
        ? e.response.data : 'Không thể lưu hoặc gửi duyệt phiếu nhập kho');
    }
    finally { setSaving(false); }
  };

  const handleSubmit = async (id: number) => {
    toast('Gửi phiếu nhập kho chờ duyệt?', {
      action: {
        label: 'Gửi duyệt',
        onClick: async () => {
          try {
            await stockReceiptService.submit(id);
            await loadList();
            if (view === 'detail') await openDetail(id);
            toast.success('Đã gửi phiếu nhập kho chờ duyệt');
          } catch (error) {
            toast.error(axios.isAxiosError(error) && typeof error.response?.data === 'string'
              ? error.response.data : 'Không thể gửi duyệt phiếu nhập kho');
          }
        },
      },
      cancel: { label: 'Hủy', onClick: () => {} },
    });
  };

  const handleApprove = async (id: number) => {
    toast('Xác nhận duyệt phiếu nhập kho?', {
      action: {
        label: 'Duyệt',
        onClick: async () => {
          try {
            await stockReceiptService.approve(id);
            await loadList();
            if (view === 'detail') await openDetail(id);
            toast.success('Đã duyệt phiếu nhập kho');
          } catch (error) {
            toast.error(axios.isAxiosError(error) && typeof error.response?.data === 'string'
              ? error.response.data : 'Không thể duyệt phiếu nhập kho');
          }
        },
      },
      cancel: { label: 'Hủy', onClick: () => {} },
    });
  };

  const handleComplete = async (id: number) => {
    toast('Xác nhận hoàn thành nhập kho? Tồn kho sẽ được cập nhật.', {
      action: {
        label: 'Xác nhận',
        onClick: async () => {
          try {
            await stockReceiptService.complete(id);
            setView('list');
            await loadList();
            toast.success('Đã hoàn thành nhập kho, tồn kho đã được cập nhật');
          } catch (error) {
            toast.error(axios.isAxiosError(error) && typeof error.response?.data === 'string'
              ? error.response.data : 'Không thể hoàn tất phiếu nhập kho');
          }
        }
      },
      cancel: { label: 'Hủy', onClick: () => {} },
      duration: 8000,
    });
  };

  const handleDelete = async (id: number) => {
    toast('Xác nhận xóa phiếu này?', {
      action: { label: 'Xóa', onClick: async () => { await stockReceiptService.delete(id); loadList(); } },
      cancel: { label: 'Hủy', onClick: () => {} },
      duration: 8000,
    });
  };

  const addFormItem = () => {
    setFormItems(prev => [...prev, { itemName: '', unit: 'PCS', quantityRequested: 0, quantityReceived: 1 }]);
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
    // Đơn giá lấy theo danh mục (giá chuẩn công ty); tàu chưa có giá danh mục thì
    // dùng giá nhập gần nhất trên tàu. Danh mục không giữ đơn vị/tiền tệ nên lấy từ kho tàu.
    const stock = shipStockByItemCode[mat.itemCode];
    setFormItems(prev => prev.map((item, i) => i === idx ? {
      ...item,
      materialItemId: materialId,
      itemCode: mat.itemCode,
      itemName: mat.name,
      unit: stock?.unit || 'PCS',
      unitCost: mat.unitPrice ?? stock?.unitCost ?? undefined,
      currency: stock?.currency || 'USD',
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

  const selectRequest = async (req: MaterialRequest) => {
    try {
      const detail = await materialRequestService.getById(req.id);
      if (detail.status !== 'Approved') {
        setRequestOptions(options => options.filter(option => option.id !== req.id));
        toast.warning('Yêu cầu vật tư chưa được duyệt hoặc không còn đủ điều kiện nhập kho.');
        return;
      }
      setFormData(p => ({ ...p, materialRequestId: req.id }));
      if (detail.items && detail.items.length > 0) {
        const mapped: StockReceiptItem[] = detail.items.map(item => {
          // Yêu cầu vật tư tham chiếu danh mục, nên tra thẳng trong danh mục để ra mã + đơn giá.
          const mat = materialOptions.find(material => material.id === item.materialItemId);
          const stock = mat ? shipStockByItemCode[mat.itemCode] : undefined;
          return {
            materialItemId: item.materialItemId || null,
            itemCode: mat?.itemCode || null,
            itemName: item.itemName,
            description: item.description || null,
            unit: item.unit || stock?.unit || 'PCS',
            quantityRequested: item.quantityRequested,
            quantityReceived: 0,
            unitCost: mat?.unitPrice ?? stock?.unitCost ?? undefined,
            currency: stock?.currency || 'USD',
            note: item.note || null,
          };
        });
        setFormItems(mapped);
      }
      setShowRequestPicker(false);
    } catch (e) {
      console.error('Failed to load request detail', e);
    }
  };

  const fmt = (n?: number | null) => n != null ? n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) : '';

  const columns: Column<StockReceipt>[] = [
    {
      key: 'receiptCode', header: t('stockReceipts.code'), width: 190, value: r => r.receiptCode,
      render: r => <button type="button" onClick={() => openDetail(r.id)} className="font-medium text-blue-600 hover:underline">{r.receiptCode}</button>,
    },
    { key: 'supplier', header: t('stockReceipts.supplier'), width: 200, value: r => r.supplierName || r.supplierCode || '', render: r => r.supplierName || r.supplierCode || <span className="text-gray-400">—</span> },
    { key: 'receivedDate', header: t('stockReceipts.receivedDate'), width: 115, align: 'center', value: r => r.receivedDate?.slice(0, 10) ?? '' },
    { key: 'receiptDate', header: t('stockReceipts.receiptDate'), width: 115, align: 'center', value: r => r.receiptDate?.slice(0, 10) ?? '' },
    { key: 'createdBy', header: t('stockReceipts.createdBy'), width: 150, value: r => r.createdBy ?? '' },
    {
      key: 'status', header: t('stockReceipts.status'), width: 130, align: 'center', value: r => STATUS_LABELS[r.status] || r.status,
      render: r => <span className={`rounded px-2 py-0.5 font-medium ${STATUS_COLORS[r.status] || ''}`}>{STATUS_LABELS[r.status] || r.status}</span>,
    },
    { key: 'totalValue', header: 'Tổng giá trị (USD)', width: 140, numeric: true, value: r => r.totalValue ?? null, render: r => <span className="font-medium">{fmt(r.totalValue)}</span> },
    {
      key: 'actions', header: 'Hành động', width: 140, align: 'center', exportable: false,
      render: r => (
        <TableActions>
          <button type="button" onClick={() => openDetail(r.id)} title="Xem" className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600"><Eye size={15} /></button>
          {r.status === 'Draft' && (
            <>
              <PermissionGate permission="pms.receipts.update"><button type="button" onClick={() => openEdit(r.id)} title="Sửa" className="rounded p-1 text-gray-400 hover:bg-green-50 hover:text-green-600"><Edit2 size={15} /></button></PermissionGate>
              <PermissionGate permission="pms.receipts.delete"><button type="button" onClick={() => handleDelete(r.id)} title="Xóa" className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button></PermissionGate>
              {canSubmit && <button type="button" onClick={() => handleSubmit(r.id)} title="Gửi duyệt phiếu nhập" className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600"><Send size={15} /></button>}
            </>
          )}
          {r.status === 'Submitted' && <PermissionGate permission="pms.receipts.approve"><button type="button" onClick={() => handleApprove(r.id)} title="Duyệt phiếu nhập" className="rounded p-1 text-gray-400 hover:bg-green-50 hover:text-green-600"><CheckCircle size={15} /></button></PermissionGate>}
          <ReceiptCompletionButton status={r.status} iconOnly onComplete={() => handleComplete(r.id)} />
        </TableActions>
      ),
    },
  ];

  // ─────── LIST VIEW ───────
  const listView = (
      <div className="h-full w-full flex flex-col overflow-hidden bg-white">
        {/* ── HEADER ROW ── */}
        <div className="flex flex-shrink-0 border-b border-gray-200">
          <div className="flex-1 flex items-center justify-between px-4 py-3 bg-white">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-700">
                ≡ {t('stockReceipts.title')}
              </span>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">{total}</span>
            </div>
            <div className="flex items-center gap-2">
              <PermissionGate permission="pms.receipts.create"><button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
                <Plus className="w-3.5 h-3.5" /> {t('stockReceipts.addNew')}
              </button></PermissionGate>
            </div>
          </div>
        </div>

        <DataTable
          flush
          showCount={false}
          loading={loading}
          columns={columns}
          data={receipts}
          rowKey={r => r.id}
          itemLabel="phiếu nhập"
          emptyMessage="Không có dữ liệu"
          searchPlaceholder="Tìm mã phiếu, nhà cung cấp, người tạo..."
          exportOptions={{ fileName: 'phieu-nhap-kho', title: 'DANH SÁCH PHIẾU NHẬP KHO' }}
          minWidth={1100}
        />
      </div>
    );

  // ─────── DETAIL VIEW ───────
  const detailModal = (view === 'detail' && detailData && !showFormModal) && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={e => { if (e.target === e.currentTarget) setView('list'); }}>
      <div className="bg-white flex flex-col rounded-lg shadow-2xl" style={{ width: '85vw', height: '90vh', maxWidth: 1100 }}>
        <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">{detailData.receiptCode}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[detailData.status]}`}>{STATUS_LABELS[detailData.status]}</span>
          </div>
          <div className="flex items-center gap-2">
            {detailData.status === 'Draft' && <PermissionGate permission="pms.receipts.update"><button onClick={() => openEdit(detailData.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50"><Edit2 className="w-3.5 h-3.5" /> Sửa</button></PermissionGate>}
            {detailData.status === 'Draft' && canSubmit && <button onClick={() => handleSubmit(detailData.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"><Send className="w-3.5 h-3.5" /> Gửi duyệt</button>}
            {detailData.status === 'Submitted' && <PermissionGate permission="pms.receipts.approve"><button onClick={() => handleApprove(detailData.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"><CheckCircle className="w-3.5 h-3.5" /> Duyệt phiếu nhập</button></PermissionGate>}
            <ReceiptCompletionButton status={detailData.status} onComplete={() => handleComplete(detailData.id)} />
            <button onClick={() => setView('list')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50"><X className="w-3.5 h-3.5" /> Đóng</button>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {/* ── Thông tin phiếu nhập kho ── */}
          <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50">
            <span className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Info size={14} /> Thông tin phiếu nhập kho</span>
          </div>
          <div className="px-4 py-4 space-y-3 text-sm border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">PHIẾU NHẬP KHO</h3>
            </div>

            <div className="grid grid-cols-3 gap-x-6 gap-y-3">
              {/* Row 1: Tàu / Voyage / Mã nhập kho */}
              <div className="flex items-center">
                <span className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 140 }}>Tàu</span>
                <input type="text" readOnly value={detailData.vesselName || VESSEL_CONFIG.VESSEL_NAME} className="flex-1 border border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-600 text-sm" />
              </div>
              <div className="flex items-center">
                <span className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 120 }}>Voyage</span>
                <input type="text" readOnly value={detailData.voyageName || '—'} className="flex-1 border border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-600 text-sm" />
              </div>
              <div className="flex items-center">
                <span className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 110 }}>Mã nhập kho</span>
                <input type="text" readOnly value={detailData.receiptCode} className="flex-1 border border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-600 text-sm" />
              </div>

              {/* Row 2: Mã NCC / Tên NCC / Ngày nhận hàng */}
              <div className="flex items-center">
                <span className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 140 }}>Mã nhà cung cấp</span>
                <input type="text" readOnly value={detailData.supplierCode || '—'} className="flex-1 border border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-600 text-sm" />
              </div>
              <div className="flex items-center">
                <span className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 120 }}>Tên nhà cung cấp</span>
                <input type="text" readOnly value={detailData.supplierName || '—'} className="flex-1 border border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-600 text-sm" />
              </div>
              <div className="flex items-center">
                <span className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 110 }}>Ngày nhận hàng</span>
                <input type="text" readOnly value={detailData.receivedDate?.slice(0, 10) || '—'} className="flex-1 border border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-600 text-sm" />
              </div>

              {/* Row 3: Ngày nhập kho / Ngày tạo / Người tạo */}
              <div className="flex items-center">
                <span className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 140 }}>Ngày nhập kho</span>
                <input type="text" readOnly value={detailData.receiptDate?.slice(0, 10) || '—'} className="flex-1 border border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-600 text-sm" />
              </div>
              <div className="flex items-center">
                <span className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 120 }}>Ngày tạo</span>
                <input type="text" readOnly value={detailData.createdAt?.slice(0, 10) || '—'} className="flex-1 border border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-600 text-sm" />
              </div>
              <div className="flex items-center">
                <span className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 110 }}>Người tạo</span>
                <input type="text" readOnly value={detailData.createdBy || '—'} className="flex-1 border border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-600 text-sm" />
              </div>

              {/* Row 4: Yêu cầu liên kết / Ghi chú */}
              {detailData.requestCode && (
                <div className="flex items-center">
                  <span className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 140 }}>Yêu cầu liên kết</span>
                  <div className="flex-1 border border-gray-300 px-3 py-1.5 bg-gray-50 text-sm text-blue-600">{detailData.requestCode}</div>
                </div>
              )}
              <div className={`flex items-center ${detailData.requestCode ? 'col-span-2' : 'col-span-3'}`}>
                <span className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: detailData.requestCode ? 120 : 140 }}>Ghi chú</span>
                <input type="text" readOnly value={detailData.notes || '—'} className="flex-1 border border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-600 text-sm" />
              </div>

              {/* Row 5: Đính kèm tệp tin */}
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

          <table className="w-full text-sm">
              <thead className="bg-blue-50">
                <tr>
                  <th className="px-3 py-2 text-left w-10">TT</th>
                  <th className="px-3 py-2 text-left">Vị trí kho</th>
                  <th className="px-3 py-2 text-left">Mã vật tư</th>
                  <th className="px-3 py-2 text-left">Tên vật tư</th>
                  <th className="px-3 py-2 text-left w-16">ĐVT</th>
                  <th className="px-3 py-2 text-right w-24">SL yêu cầu</th>
                  <th className="px-3 py-2 text-right w-24">SL nhập</th>
                  <th className="px-3 py-2 text-right w-24">Đơn giá</th>
                  <th className="px-3 py-2 text-right w-28">Thành tiền</th>
                  <th className="px-3 py-2 text-left">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {(detailData.items || []).length === 0 ? (
                  <tr><td colSpan={10} className="text-center py-8 text-gray-400">Không có dữ liệu</td></tr>
                ) : (detailData.items || []).map((item, idx) => (
                  <tr key={idx} className="border-b hover:bg-blue-50">
                    <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                    <td className="px-3 py-2 text-gray-600">{locationOptions.find(l => l.id === item.storeLocationId)?.name || '—'}</td>
                    <td className="px-3 py-2 font-medium">{item.itemCode}</td>
                    <td className="px-3 py-2">{item.itemName}</td>
                    <td className="px-3 py-2">{item.unit}</td>
                    <td className="px-3 py-2 text-right">{fmt(item.quantityRequested)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{fmt(item.quantityReceived)}</td>
                    <td className="px-3 py-2 text-right">{fmt(item.unitCost)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{fmt((item.quantityReceived || 0) * (item.unitCost || 0))}</td>
                    <td className="px-3 py-2 text-gray-500">{item.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
        </div>
      </div>
    </div>
  );

  // ─────── FORM MODAL (Create / Edit) ───────
  const formModal = showFormModal && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={e => { if (e.target === e.currentTarget) setShowFormModal(false); }}>
      <div className="bg-white flex flex-col rounded-lg shadow-2xl" style={{ width: '85vw', height: '90vh', maxWidth: 1100 }}>
        {/* Modal header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2.5">
          <span className="text-sm font-semibold text-gray-700">
            {editingId ? 'Chỉnh sửa phiếu nhập kho' : 'Thêm mới phiếu nhập kho'}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowFormModal(false)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50"><X className="w-3.5 h-3.5" /> Hủy bỏ</button>
            <PermissionGate permission={editingId ? 'pms.receipts.update' : 'pms.receipts.create'}><button disabled={saving} onClick={() => handleSave(false)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">Lưu nháp</button></PermissionGate>
            <PermissionGate permission={editingId ? 'pms.receipts.update' : 'pms.receipts.create'}><button disabled={saving} onClick={() => handleSave(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
              <Send className="w-3.5 h-3.5" /> Lưu và gửi duyệt
            </button></PermissionGate>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {/* ── Thông tin phiếu nhập kho ── */}
          <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50">
            <span className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Info size={14} /> Thông tin phiếu nhập kho</span>
          </div>
          <div className="px-4 py-4 space-y-3 text-sm border-b border-gray-200">
            {/* Title */}
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base">TẠO PHIẾU NHẬP KHO</h3>
            </div>

            {/* Form fields: 2-col grid */}
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
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
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 shrink-0 w-28 text-right">Mã nhập kho</label>
                <input type="text" value={formData.receiptCode || '(Tự sinh)'} readOnly className="flex-1 min-w-0 border border-gray-300 px-2 py-1.5 bg-gray-50 text-gray-400 text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 shrink-0 w-28 text-right">Mã NCC <span className="text-red-500">*</span></label>
                <input type="text" value={formData.supplierCode} onChange={e => setFormData(p => ({ ...p, supplierCode: e.target.value }))} className="flex-1 min-w-0 border border-gray-300 px-2 py-1.5 text-sm" placeholder="Nhập thông tin" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 shrink-0 w-28 text-right">Tên NCC</label>
                <input type="text" value={formData.supplierName} onChange={e => setFormData(p => ({ ...p, supplierName: e.target.value }))} className="flex-1 min-w-0 border border-gray-300 px-2 py-1.5 text-sm" placeholder="Nhập thông tin" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 shrink-0 w-28 text-right">Ngày nhận HH <span className="text-red-500">*</span></label>
                <input type="date" value={formData.receivedDate} onChange={e => setFormData(p => ({ ...p, receivedDate: e.target.value }))} className="flex-1 min-w-0 border border-gray-300 px-2 py-1.5 text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 shrink-0 w-28 text-right">Ngày nhập kho <span className="text-red-500">*</span></label>
                <input type="date" value={formData.receiptDate} onChange={e => setFormData(p => ({ ...p, receiptDate: e.target.value }))} className="flex-1 min-w-0 border border-gray-300 px-2 py-1.5 text-sm" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-700 shrink-0 w-28 text-right">Người tạo <span className="text-red-500">*</span></label>
                <input type="text" value={formData.createdBy} onChange={e => setFormData(p => ({ ...p, createdBy: e.target.value }))} className="flex-1 min-w-0 border border-gray-300 px-2 py-1.5 text-sm" placeholder="Nhập thông tin" />
              </div>
              <div className="flex items-start gap-2 col-span-2">
                <label className="text-sm font-medium text-gray-700 shrink-0 w-28 text-right pt-1.5">Ghi chú</label>
                <textarea value={formData.notes} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} className="flex-1 min-w-0 border border-gray-300 px-2 py-1.5 resize-y text-sm" placeholder="Nhập thông tin" rows={2} />
              </div>
            </div>
          </div>

          <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm table-fixed">
                  <thead className="bg-blue-50">
                    <tr>
                      <th className="px-2 py-2 text-left w-8">TT</th>
                      <th className="px-2 py-2 text-left w-36">Vị trí kho <span className="text-red-500">*</span></th>
                      <th className="px-2 py-2 text-left w-24">Mã vật tư</th>
                      <th className="px-2 py-2 text-left">Tên vật tư <span className="text-red-500">*</span></th>
                      <th className="px-2 py-2 text-left w-14">ĐVT</th>
                      <th className="px-2 py-2 text-right w-20">SL YC</th>
                      <th className="px-2 py-2 text-right w-20">SL nhập <span className="text-red-500">*</span></th>
                      <th className="px-2 py-2 text-right w-24">Đơn giá</th>
                      <th className="px-2 py-2 text-left w-24">Ghi chú</th>
                      <th className="px-2 py-2 w-7"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {formItems.length === 0 ? (
                      <tr><td colSpan={10} className="text-center py-8 text-gray-400">Không có dữ liệu</td></tr>
                    ) : formItems.map((item, idx) => {
                      const selectedMaterial = materialOptions.find(material => material.id === item.materialItemId);
                      return (
                      <tr key={idx} className="border-b">
                        <td className="px-2 py-1.5 text-gray-500">{idx + 1}</td>
                        <td className="px-2 py-1.5">
                          <SearchableSelect
                            value={item.storeLocationId || null}
                            placeholder="-- Kho --"
                            emptyText="Không tìm thấy kho"
                            options={locationOptions.map(l => ({
                              value: l.id,
                              label: l.name,
                              subLabel: l.locationCode,
                            }))}
                            onChange={value => updateFormItem(idx, 'storeLocationId', value)}
                          />
                        </td>
                        <td className="px-2 py-1.5 text-gray-500 text-xs">{selectedMaterial?.itemCode || item.itemCode || '—'}</td>
                        <td className="px-2 py-1.5">
                          <SearchableSelect
                            value={item.materialItemId || null}
                            placeholder="-- Vật tư --"
                            emptyText="Không tìm thấy vật tư"
                            options={materialOptions.map(m => {
                              const stock = shipStockByItemCode[m.itemCode];
                              return {
                                value: m.id,
                                label: m.name,
                                subLabel: stock
                                  ? `${m.itemCode} · tồn ${stock.onHandQuantity ?? 0} ${stock.unit || ''}`
                                  : `${m.itemCode} · chưa có trên tàu`,
                              };
                            })}
                            onChange={value => {
                              if (value) {
                                selectMaterial(idx, value);
                              } else {
                                setFormItems(prev => prev.map((row, i) => i === idx ? {
                                  ...row,
                                  materialItemId: null,
                                  itemCode: null,
                                  itemName: '',
                                  unit: 'PCS',
                                  unitCost: undefined,
                                  currency: undefined,
                                } : row));
                              }
                            }}
                          />
                          <select value={item.materialItemId || ''} onChange={e => { if (e.target.value) selectMaterial(idx, e.target.value); else updateFormItem(idx, 'materialItemId', null); }} className="hidden">
                            <option value="">-- Vật tư --</option>
                            {materialOptions.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1.5"><input type="text" value={item.unit} onChange={e => updateFormItem(idx, 'unit', e.target.value)} className="w-full border border-gray-300 px-1 py-1 text-xs" /></td>
                        <td className="px-2 py-1.5"><input type="number" min={0} value={item.quantityRequested} onChange={e => updateFormItem(idx, 'quantityRequested', Number(e.target.value))} className="w-full border border-gray-300 px-1 py-1 text-xs text-right" /></td>
                        <td className="px-2 py-1.5"><input type="number" min={0} value={item.quantityReceived} onChange={e => updateFormItem(idx, 'quantityReceived', Number(e.target.value))} className="w-full border border-gray-300 px-1 py-1 text-xs text-right" /></td>
                        <td className="px-2 py-1.5"><input type="number" min={0} step={0.01} value={item.unitCost ?? ''} onChange={e => updateFormItem(idx, 'unitCost', e.target.value ? Number(e.target.value) : null)} className="w-full border border-gray-300 px-1 py-1 text-xs text-right" /></td>
                        <td className="px-2 py-1.5"><input type="text" value={item.note || ''} onChange={e => updateFormItem(idx, 'note', e.target.value)} className="w-full border border-gray-300 px-1 py-1 text-xs" /></td>
                        <td className="px-2 py-1.5 text-center"><button onClick={() => removeFormItem(idx)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button></td>
                      </tr>
                    )})}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t border-gray-200 flex items-center justify-between">
              <button onClick={addFormItem} className="flex items-center gap-1 text-blue-600 text-sm hover:text-blue-800">
                <Plus size={14} /> Thêm dòng
              </button>
                <button onClick={() => setShowRequestPicker(true)} className="flex items-center gap-1 text-blue-600 text-sm hover:text-blue-800">
                  <Plus size={14} /> Chọn yêu cầu nhập kho
                </button>
              </div>
            </>
        </div>
      </div>

      {/* Request picker sub-modal */}
      {showRequestPicker && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-bold text-base">Chọn yêu cầu nhập kho</h3>
              <button onClick={() => setShowRequestPicker(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-auto">
              {requestOptions.length === 0 ? (
                <div className="p-8 text-center text-gray-400">Không có yêu cầu nào đã duyệt</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-blue-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Mã yêu cầu</th>
                      <th className="px-3 py-2 text-left">Người yêu cầu</th>
                      <th className="px-3 py-2 text-left">Ngày yêu cầu</th>
                      <th className="px-3 py-2 text-right">Số dòng</th>
                      <th className="px-3 py-2 text-center w-20"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {requestOptions.map(req => (
                      <tr key={req.id} className="border-b hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-blue-600">{req.requestCode}</td>
                        <td className="px-3 py-2 text-gray-600">{req.requestedBy || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{req.requestDate?.slice(0, 10)}</td>
                        <td className="px-3 py-2 text-right">{req.itemCount || 0}</td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => selectRequest(req)} className="bg-blue-600 text-white px-3 py-1 rounded text-xs hover:bg-blue-700">Chọn</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return <>{listView}{detailModal}{formModal}</>;
}
