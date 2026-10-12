import { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Eye, ArrowLeft, ChevronRight as ChevronRightIcon, X, CheckCircle, Paperclip, Info, Package, Truck, ClipboardList } from 'lucide-react';
import { stockReceiptService } from '@/services/stockReceipt.service';
import { materialService } from '@/services/materialService';
import { storeLocationService } from '@/services/store-location.service';
import { materialRequestService } from '@/services/materialRequest.service';
import { maritimeService } from '@/services/maritime.service';
import { VESSEL_CONFIG } from '@/config/app.config';
import { useTranslationSafe } from '@/contexts/I18nContext';
import type { StockReceipt, StockReceiptItem, StoreLocation, MaterialRequest } from '@/types/pms.types';
import type { MaterialItem, VoyageRecord } from '@/types/maritime.types';
import { toast } from 'sonner';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { Button, DataTable, Modal, TableActions, TableIconButton, type Column } from '@/components/common';
import { formatDateVi } from '@/utils/date';

type ViewMode = 'list' | 'create' | 'edit' | 'detail';

const STATUS_COLORS: Record<string, string> = {
  Draft: 'bg-slate-100 text-slate-600',
  Approved: 'bg-emerald-50 text-emerald-700',
  Completed: 'bg-violet-50 text-violet-700',
};
const STATUS_LABELS: Record<string, string> = {
  Draft: 'Bản nháp',
  Approved: 'Đã duyệt',
  Completed: 'Hoàn thành',
};

/** Tải hết theo lô để bảng tự tìm/lọc/phân trang. */
const FETCH_PAGE = 100;

/** Nhúng trong màn chi tiết tàu: vesselId lọc theo tàu, readOnly để bờ chỉ xem. */
export default function StockReceiptPage({ vesselId, readOnly = false }: { vesselId?: string; readOnly?: boolean } = {}) {
  const ask = useConfirm();
  const { t } = useTranslationSafe();
  const [view, setView] = useState<ViewMode>('list');
  const [receipts, setReceipts] = useState<StockReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Form state
  const [formData, setFormData] = useState<{
    vesselName: string;
    voyageId: string;
    voyageName: string;
    supplierCode: string;
    supplierName: string;
    receivedDate: string;
    receiptDate: string;
    createdBy: string;
    notes: string;
    attachments: string;
    materialRequestId: number | undefined;
    receiptCode: string;
  }>({
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
  const [materialOptions, setMaterialOptions] = useState<MaterialItem[]>([]);
  const [locationOptions, setLocationOptions] = useState<StoreLocation[]>([]);
  const [requestOptions, setRequestOptions] = useState<MaterialRequest[]>([]);
  const [voyageOptions, setVoyageOptions] = useState<VoyageRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [detailData, setDetailData] = useState<StockReceipt | null>(null);
  const [activeTab, setActiveTab] = useState<'materials' | 'shipping'>('materials');
  const [showRequestPicker, setShowRequestPicker] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const all: StockReceipt[] = [];
      for (let page = 1; ; page++) {
        const res = await stockReceiptService.getAll({ page, pageSize: FETCH_PAGE, vesselId });
        all.push(...res.items);
        if (all.length >= res.total || res.items.length === 0) break;
      }
      setReceipts(all);
    } catch (e) {
      console.error(e);
      setLoadError('Không tải được danh sách phiếu nhập kho');
    } finally {
      setLoading(false);
    }
  }, [vesselId]);

  useEffect(() => { loadList(); }, [loadList]);

  const loadFormOptions = async () => {
    const [mats, locs, reqs, voyages] = await Promise.all([
      materialService.getItems({ onlyActive: true }),
      storeLocationService.getAll(),
      materialRequestService.getApproved(),
      maritimeService.voyage.getAll({ pageSize: 100 }).then(r => r).catch(() => []),
    ]);
    setMaterialOptions(mats);
    setLocationOptions(locs);
    setRequestOptions(reqs);
    setVoyageOptions(Array.isArray(voyages) ? voyages : []);
  };

  const openCreate = async () => {
    if (readOnly) return;

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
    setActiveTab('materials');
    await loadFormOptions();
    setView('create');
  };

  const openEdit = async (id: number) => {
    if (readOnly) return;

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
      setActiveTab('materials');
      await loadFormOptions();
      setView('edit');
    } catch { /* ignore */ }
  };

  const openDetail = async (id: number) => {
    try {
      const data = await stockReceiptService.getById(id);
      setDetailData(data);
      await loadFormOptions();
      setActiveTab('materials');
      setView('detail');
    } catch { /* ignore */ }
  };

  const handleSave = async (andApprove = false) => {
    if (formItems.length === 0) return void toast.warning('Vui lòng thêm ít nhất 1 dòng vật tư.');
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
        await stockReceiptService.update(editingId, { ...payload, status: andApprove ? 'Approved' : undefined });
      } else {
        const res = await stockReceiptService.create(payload);
        if (andApprove) await stockReceiptService.update(res.id, { status: 'Approved' });
      }
      setView('list');
      loadList();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  const handleComplete = async (id: number) => {
    if (readOnly) return;

    if (!await ask('Hoàn thành phiếu nhập kho này? Tồn kho sẽ được cập nhật.', { title: 'Hoàn thành nhập kho', confirmLabel: 'Hoàn thành' })) return;
    await stockReceiptService.complete(id);
    setView('list');
    loadList();
  };

  const handleDelete = async (id: number) => {
    if (readOnly) return;

    if (!await ask('Xác nhận xóa phiếu này?')) return;
    await stockReceiptService.delete(id);
    loadList();
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
    setFormItems(prev => prev.map((item, i) => i === idx ? {
      ...item,
      materialItemId: materialId,
      itemCode: mat.itemCode,
      itemName: mat.name,
      unit: mat.unit || 'PCS',
      unitCost: mat.unitCost ?? undefined,
      currency: mat.currency || 'USD',
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
      setFormData(p => ({ ...p, materialRequestId: req.id }));
      if (detail.items && detail.items.length > 0) {
        const mapped: StockReceiptItem[] = detail.items.map(item => ({
          materialItemId: item.materialItemId || null,
          itemCode: null,
          itemName: item.itemName,
          description: item.description || null,
          unit: item.unit,
          quantityRequested: item.quantityRequested,
          quantityReceived: 0,
          note: item.note || null,
        }));
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
      key: 'code', header: t('stockReceipts.code'), width: 180, filter: false, value: r => r.receiptCode,
      render: r => <span className="font-mono text-xs font-semibold text-primary">{r.receiptCode}</span>,
    },
    { key: 'supplier', header: t('stockReceipts.supplier'), value: r => r.supplierName || r.supplierCode || '' },
    { key: 'receivedDate', header: t('stockReceipts.receivedDate'), width: 120, align: 'center', filter: false, value: r => r.receivedDate ?? '',
      exportValue: r => formatDateVi(r.receivedDate), render: r => formatDateVi(r.receivedDate) || '—' },
    { key: 'receiptDate', header: t('stockReceipts.receiptDate'), width: 120, align: 'center', filter: false, value: r => r.receiptDate ?? '',
      exportValue: r => formatDateVi(r.receiptDate), render: r => formatDateVi(r.receiptDate) || '—' },
    { key: 'createdBy', header: t('stockReceipts.createdBy'), width: 150, value: r => r.createdBy ?? '' },
    {
      key: 'status', header: t('stockReceipts.status'), width: 130, align: 'center', value: r => STATUS_LABELS[r.status] ?? r.status,
      render: r => <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[r.status] ?? ''}`}>{STATUS_LABELS[r.status] ?? r.status}</span>,
    },
    {
      key: 'value', header: 'Tổng giá trị (USD)', width: 140, numeric: true, filter: false, value: r => r.totalValue ?? 0,
      render: r => <span className="font-semibold">{fmt(r.totalValue)}</span>,
    },
    {
      key: 'actions', header: 'Thao tác', width: readOnly ? 80 : 130, align: 'center', exportable: false,
      render: r => (
        <TableActions>
          <TableIconButton label={`Xem ${r.receiptCode}`} icon={<Eye />} onClick={() => openDetail(r.id)} />
          {!readOnly && r.status === 'Draft' && (
            <>
              <TableIconButton label={`Sửa ${r.receiptCode}`} icon={<Edit2 />} onClick={() => openEdit(r.id)} />
              <TableIconButton label={`Xóa ${r.receiptCode}`} icon={<Trash2 />} variant="danger" onClick={() => handleDelete(r.id)} />
            </>
          )}
          {!readOnly && r.status === 'Approved' && (
            <TableIconButton label={`Hoàn thành nhập kho ${r.receiptCode}`} icon={<CheckCircle />} onClick={() => handleComplete(r.id)} />
          )}
        </TableActions>
      ),
    },
  ];

  // ─────── LIST VIEW ───────
  if (view === 'list') {
    return (
      <div className="flex h-full min-h-0 w-full flex-col">
        <DataTable
          flush
          columns={columns}
          data={receipts}
          rowKey={r => r.id}
          loading={loading}
          error={loadError}
          itemLabel="phiếu"
          emptyMessage="Chưa có phiếu nhập kho nào."
          searchPlaceholder="Tìm theo mã phiếu, nhà cung cấp, người lập..."
          exportOptions={{ fileName: 'phieu-nhap-kho', title: 'PHIẾU NHẬP KHO' }}
          onRowClick={r => openDetail(r.id)}
          onAdd={readOnly ? undefined : openCreate}
          addLabel="Tạo phiếu nhập"
          minWidth={1050}
        />
      </div>
    );
  }

  // ─────── DETAIL VIEW ───────
  if (view === 'detail' && detailData) {
    return (
      <div className="h-full w-full flex flex-col overflow-hidden bg-white">
        {/* Breadcrumb */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2.5">
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <button onClick={() => setView('list')} className="text-gray-500 hover:text-gray-700"><ArrowLeft size={18} /></button>
            <button onClick={() => setView('list')} className="text-[#0b2545] hover:underline">Vật tư</button>
            <ChevronRightIcon size={14} className="text-gray-300" />
            <button onClick={() => setView('list')} className="text-[#0b2545] hover:underline">{t('stockReceipts.title')}</button>
            <ChevronRightIcon size={14} className="text-gray-300" />
            <span className="text-gray-700 font-medium">{detailData.receiptCode}</span>
            <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[detailData.status]}`}>{STATUS_LABELS[detailData.status]}</span>
          </div>
          <div className="flex items-center gap-2">
            {!readOnly && detailData.status === 'Draft' && <button onClick={() => openEdit(detailData.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50"><Edit2 className="w-3.5 h-3.5" /> Sửa</button>}
            {(detailData.status === 'Draft' || detailData.status === 'Approved') && (
              <button onClick={() => handleComplete(detailData.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700">
                <CheckCircle className="w-3.5 h-3.5" /> Hoàn thành nhập kho
              </button>
            )}
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
              <span className="text-xs text-gray-400">{detailData.itemCount || detailData.items?.length || 0}/{255}</span>
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
                  <div className="flex-1 border border-gray-300 px-3 py-1.5 bg-gray-50 text-sm text-[#0b2545]">{detailData.requestCode}</div>
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
                    <div className="flex items-center gap-1 text-[#0b2545]">
                      <Paperclip size={13} /> {detailData.attachments}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Tabs: Vật tư / Vận chuyển ── */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('materials')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'materials' ? 'border-accent text-[#0b2545]' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Package size={14} /> Vật tư
            </button>
            <button
              onClick={() => setActiveTab('shipping')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'shipping' ? 'border-accent text-[#0b2545]' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Truck size={14} /> Vận chuyển
            </button>
          </div>

          {activeTab === 'materials' ? (
            <table className="w-full text-sm">
              <thead className="bg-[#eef2f7]">
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
                  <tr key={idx} className="border-b hover:bg-[#eef2f7]">
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
          ) : (
            <div className="p-8 text-center text-gray-400 text-sm">
              Chức năng vận chuyển đang phát triển...
            </div>
          )}
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
          <ChevronRightIcon size={14} className="text-gray-300" />
          <button onClick={() => setView('list')} className="text-[#0b2545] hover:underline">{t('stockReceipts.title')}</button>
          <ChevronRightIcon size={14} className="text-gray-300" />
          <span className="text-gray-700 font-medium">{editingId ? 'Chỉnh sửa phiếu nhập kho' : 'Thêm mới phiếu nhập kho'}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setView('list')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50"><X className="w-3.5 h-3.5" /> Hủy bỏ</button>
          <button disabled={saving} onClick={() => handleSave(false)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#0b2545] text-white rounded hover:bg-[#16375f] disabled:opacity-50">Lưu nháp</button>
          <button disabled={saving} onClick={() => handleSave(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
            <CheckCircle className="w-3.5 h-3.5" /> Lưu và duyệt
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {/* ── Thông tin phiếu nhập kho ── */}
        <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50">
          <span className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Info size={14} /> Thông tin phiếu nhập kho</span>
        </div>
        <div className="px-4 py-4 space-y-3 text-sm border-b border-gray-200">
          {/* Title + counter badge */}
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base">TẠO PHIẾU NHẬP KHO</h3>
            <span className="text-xs text-gray-400">{formItems.length}/{255}</span>
          </div>

          {/* Row 1: Tàu / Voyage / Mã nhập kho */}
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
              <label className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 120 }}>Voyage</label>
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
              <label className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 110 }}>Mã nhập kho</label>
              <input
                type="text"
                value={formData.receiptCode || '(Tự sinh)'}
                readOnly
                className="flex-1 border border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-400 text-sm"
              />
            </div>

            {/* Row 2: Mã NCC / Tên NCC / Ngày nhận hàng */}
            <div className="flex items-center">
              <label className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 140 }}>Mã nhà cung cấp <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.supplierCode}
                onChange={e => setFormData(p => ({ ...p, supplierCode: e.target.value }))}
                className="flex-1 border border-gray-300 px-3 py-1.5 text-sm"
                placeholder="Nhập thông tin"
              />
            </div>
            <div className="flex items-center">
              <label className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 120 }}>Tên nhà cung cấp</label>
              <input
                type="text"
                value={formData.supplierName}
                onChange={e => setFormData(p => ({ ...p, supplierName: e.target.value }))}
                className="flex-1 border border-gray-300 px-3 py-1.5 text-sm"
                placeholder="Nhập thông tin"
              />
            </div>
            <div className="flex items-center">
              <label className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 110 }}>Ngày nhận hàng <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={formData.receivedDate}
                onChange={e => setFormData(p => ({ ...p, receivedDate: e.target.value }))}
                className="flex-1 border border-gray-300 px-3 py-1.5 text-sm"
              />
            </div>

            {/* Row 3: Ngày nhập kho / Ngày tạo / Người tạo */}
            <div className="flex items-center">
              <label className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 140 }}>Ngày nhập kho <span className="text-red-500">*</span></label>
              <input
                type="date"
                value={formData.receiptDate}
                onChange={e => setFormData(p => ({ ...p, receiptDate: e.target.value }))}
                className="flex-1 border border-gray-300 px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex items-center">
              <label className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 120 }}>Ngày tạo</label>
              <input
                type="text"
                value={new Date().toISOString().slice(0, 10)}
                readOnly
                className="flex-1 border border-gray-300 px-3 py-1.5 bg-gray-50 text-gray-400 text-sm"
              />
            </div>
            <div className="flex items-center">
              <label className="text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap" style={{ width: 110 }}>Người tạo <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={formData.createdBy}
                onChange={e => setFormData(p => ({ ...p, createdBy: e.target.value }))}
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

            {/* Row 6: Đính kèm tệp tin */}
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

        {/* ── Tabs: Vật tư / Vận chuyển ── */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('materials')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'materials' ? 'border-accent text-[#0b2545]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Package size={14} /> Vật tư
          </button>
          <button
            onClick={() => setActiveTab('shipping')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'shipping' ? 'border-accent text-[#0b2545]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Truck size={14} /> Vận chuyển
          </button>
        </div>

        {activeTab === 'materials' ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[1100px]">
                <thead className="bg-[#eef2f7]">
                  <tr>
                    <th className="px-2 py-2 text-left w-10">TT</th>
                    <th className="px-2 py-2 text-left w-40">Vị trí kho <span className="text-red-500">*</span></th>
                    <th className="px-2 py-2 text-left w-28">Mã vật tư</th>
                    <th className="px-2 py-2 text-left">Tên vật tư <span className="text-red-500">*</span></th>
                    <th className="px-2 py-2 text-left w-28">Mô tả</th>
                    <th className="px-2 py-2 text-left w-16">ĐVT</th>
                    <th className="px-2 py-2 text-right w-24">SL YC nhập</th>
                    <th className="px-2 py-2 text-right w-28">SL nhập kho <span className="text-red-500">*</span></th>
                    <th className="px-2 py-2 text-right w-24">Đơn giá</th>
                    <th className="px-2 py-2 text-left w-28">Ghi chú nhập kho</th>
                    <th className="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {formItems.length === 0 ? (
                    <tr><td colSpan={11} className="text-center py-8 text-gray-400">Không có dữ liệu</td></tr>
                  ) : formItems.map((item, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="px-2 py-1.5 text-gray-500">{idx + 1}</td>
                      {/* Vị trí kho */}
                      <td className="px-2 py-1.5">
                        <select value={item.storeLocationId || ''} onChange={e => updateFormItem(idx, 'storeLocationId', e.target.value || null)} className="w-full border border-gray-300 px-1.5 py-1 text-sm">
                          <option value="">-- Chọn kho --</option>
                          {locationOptions.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                      </td>
                      {/* Mã vật tư */}
                      <td className="px-2 py-1.5 text-gray-500 text-xs">{item.itemCode || '—'}</td>
                      {/* Tên vật tư */}
                      <td className="px-2 py-1.5">
                        <select value={item.materialItemId || ''} onChange={e => { if (e.target.value) selectMaterial(idx, e.target.value); else updateFormItem(idx, 'materialItemId', null); }} className="w-full border border-gray-300 px-1.5 py-1 text-sm">
                          <option value="">-- Chọn vật tư --</option>
                          {materialOptions.map(m => <option key={m.id} value={m.id}>{m.itemCode} - {m.name}</option>)}
                        </select>
                        {!item.materialItemId && (
                          <input type="text" value={item.itemName} onChange={e => updateFormItem(idx, 'itemName', e.target.value)} className="w-full border border-gray-300 px-1.5 py-1 text-sm mt-1" placeholder="Hoặc nhập tên..." />
                        )}
                      </td>
                      {/* Mô tả */}
                      <td className="px-2 py-1.5">
                        <input type="text" value={item.description || ''} onChange={e => updateFormItem(idx, 'description', e.target.value)} className="w-full border border-gray-300 px-1.5 py-1 text-sm" />
                      </td>
                      {/* ĐVT */}
                      <td className="px-2 py-1.5">
                        <input type="text" value={item.unit} onChange={e => updateFormItem(idx, 'unit', e.target.value)} className="w-full border border-gray-300 px-1.5 py-1 text-sm" />
                      </td>
                      {/* SL YC nhập */}
                      <td className="px-2 py-1.5">
                        <input type="number" min={0} value={item.quantityRequested} onChange={e => updateFormItem(idx, 'quantityRequested', Number(e.target.value))} className="w-full border border-gray-300 px-1.5 py-1 text-sm text-right" />
                      </td>
                      {/* SL nhập kho */}
                      <td className="px-2 py-1.5">
                        <input type="number" min={0} value={item.quantityReceived} onChange={e => updateFormItem(idx, 'quantityReceived', Number(e.target.value))} className="w-full border border-gray-300 px-1.5 py-1 text-sm text-right" />
                      </td>
                      {/* Đơn giá */}
                      <td className="px-2 py-1.5">
                        <input type="number" min={0} step={0.01} value={item.unitCost ?? ''} onChange={e => updateFormItem(idx, 'unitCost', e.target.value ? Number(e.target.value) : null)} className="w-full border border-gray-300 px-1.5 py-1 text-sm text-right" />
                      </td>
                      {/* Ghi chú nhập kho */}
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
            <div className="px-4 py-2 border-t border-gray-200 flex items-center justify-between">
              <button onClick={addFormItem} className="flex items-center gap-1 text-[#0b2545] text-sm hover:text-primary">
                <Plus size={14} /> Thêm dòng
              </button>
              <button
                onClick={() => setShowRequestPicker(true)}
                className="flex items-center gap-1 text-[#0b2545] text-sm hover:text-primary"
              >
                <Plus size={14} /> Chọn yêu cầu nhập kho
              </button>
            </div>
          </>
        ) : (
          <div className="p-8 text-center text-gray-400 text-sm">
            Chức năng vận chuyển đang phát triển...
          </div>
        )}
      </div>

      {/* ── Modal: Chọn yêu cầu nhập kho ── */}
      <Modal
        isOpen={showRequestPicker}
        onClose={() => setShowRequestPicker(false)}
        size="lg"
        flush
        icon={<ClipboardList />}
        title="Chọn yêu cầu nhập kho"
        subtitle="Chỉ hiện các yêu cầu đã được duyệt."
      >
            <div>
              {requestOptions.length === 0 ? (
                <div className="p-8 text-center text-gray-400">Không có yêu cầu nào đã duyệt</div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-primary-soft text-xs text-primary">
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
                        <td className="px-3 py-2 font-medium text-primary">{req.requestCode}</td>
                        <td className="px-3 py-2 text-gray-600">{req.requestedBy || '—'}</td>
                        <td className="px-3 py-2 text-gray-600">{req.requestDate?.slice(0, 10)}</td>
                        <td className="px-3 py-2 text-right">{req.itemCount || 0}</td>
                        <td className="px-3 py-2 text-center">
                          <Button size="sm" variant="primary" onClick={() => selectRequest(req)}>Chọn</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
      </Modal>
    </div>
  );
}

