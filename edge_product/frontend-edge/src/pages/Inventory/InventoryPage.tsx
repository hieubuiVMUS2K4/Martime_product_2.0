import { AppModal } from '@/components/common/AppModal';
import { PermissionGate } from '@/components/auth/PermissionGate'
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Package, DollarSign, AlertTriangle, Clock, X, Plus, Pencil } from 'lucide-react';
import { DataTable, TableActions, TablePagination, type Column } from '@/components/common/DataTable';
import { usePermission } from '@/stores/permissions.store';
import { inventoryService } from '@/services/inventory.service';
import { storeLocationService } from '@/services/store-location.service';
import { materialService } from '@/services/materialService';
import { useTranslationSafe } from '@/contexts/I18nContext';
import type { InventoryStockItem, InventorySummary, StoreLocation } from '@/types/pms.types';
import type { MaterialItem } from '@/types/maritime.types';


export default function InventoryPage() {
  const { t } = useTranslationSafe();
  const canExport = usePermission('pms.inventory.export');
  const [items, setItems] = useState<InventoryStockItem[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [locations, setLocations] = useState<StoreLocation[]>([]);

  // Modal states
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<{ date: string; type: string; itemCode: string; itemName: string; quantity: number; note: string }[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const [showDeclare, setShowDeclare] = useState(false);
  const [declareItems, setDeclareItems] = useState<{ materialItemId: string; storeLocationId: string; quantity: number; unitCost: number; itemName?: string }[]>([]);
  const [allMaterials, setAllMaterials] = useState<MaterialItem[]>([]);

  // Edit modal
  const [editItem, setEditItem] = useState<InventoryStockItem | null>(null);
  const [editQuantity, setEditQuantity] = useState<number>(0);
  const [editNote, setEditNote] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await inventoryService.getAll({ page: 1, pageSize: 100000 });
      setItems(res.items);
      setTotalValue(res.totalValue);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const loadMeta = async () => {
      const [locs, sum, mats] = await Promise.all([
        storeLocationService.getAll(),
        inventoryService.getSummary(),
        materialService.getItems(),
      ]);
      setLocations(locs);
      setSummary(sum);
      setAllMaterials(mats || []);
    };
    loadMeta();
  }, []);

  // ── History ──
  const openHistory = async () => {
    setShowHistory(true);
    setHistoryPage(1);
    await loadHistory(1);
  };

  const loadHistory = async (page: number) => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const res = await inventoryService.getHistory({
        page, pageSize: 20,
      });
      setHistoryItems(res.items);
      setHistoryTotal(res.total);
      setHistoryPage(page);
    } catch { setHistoryError('Không thể tải lịch sử tồn kho. Vui lòng thử lại.'); setHistoryItems([]); }
    finally { setHistoryLoading(false); }
  };

  // ── Declare ──
  const handleDeclare = async () => {
    const valid = declareItems.filter(i => i.materialItemId && i.storeLocationId && i.quantity > 0);
    if (valid.length === 0) { toast.warning('Vui lòng nhập ít nhất 1 dòng hợp lệ'); return; }
    try {
      await inventoryService.declare(valid);
      setShowDeclare(false);
      loadData();
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Khai báo thất bại'); }
  };

  const openEdit = (item: InventoryStockItem) => {
    setEditItem(item);
    setEditQuantity(item.quantity);
    setEditNote('');
  };

  const handleEdit = async () => {
    if (!editItem) return;
    setEditSaving(true);
    try {
      const adjustQuantity = editQuantity - editItem.quantity;
      await inventoryService.adjust({
        materialItemId: editItem.materialItemId,
        storeLocationId: editItem.storeLocationId,
        adjustQuantity,
        reason: editNote || undefined,
      });
      toast.success('Cập nhật tồn kho thành công');
      setEditItem(null);
      loadData();
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Cập nhật thất bại'); }
    finally { setEditSaving(false); }
  };


  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

  const columns: Column<InventoryStockItem>[] = [
    { key: 'itemCode', header: t('inventory.itemCode'), width: 150, value: r => r.itemCode, className: 'font-mono font-medium' },
    { key: 'itemName', header: t('inventory.itemName'), width: 260, value: r => r.itemName },
    { key: 'notes', header: 'Ghi chú', width: 180, value: r => r.notes ?? '', render: r => r.notes || <span className="text-gray-400">—</span> },
    { key: 'location', header: t('inventory.location'), width: 170, value: r => r.locationName ?? '' },
    { key: 'quantity', header: t('inventory.quantity'), width: 110, numeric: true, value: r => r.quantity, render: r => <span className="font-semibold">{fmt(r.quantity)}</span> },
    { key: 'unitCost', header: `${t('inventory.unitCost')} (USD)`, width: 120, numeric: true, value: r => r.unitCost, render: r => fmt(r.unitCost) },
    { key: 'totalValue', header: `${t('inventory.totalValue')} (USD)`, width: 140, numeric: true, value: r => r.totalValue, render: r => <span className="font-semibold text-green-700">{fmt(r.totalValue)}</span> },
    { key: 'unit', header: 'ĐVT', width: 80, align: 'center', value: r => r.unit ?? '' },
    { key: 'updatedAt', header: 'Cập nhật', width: 110, align: 'center', value: r => r.updatedAt?.slice(0, 10) ?? '' },
    {
      key: 'actions', header: 'Thao tác', width: 80, align: 'center', exportable: false,
      render: r => (
        <TableActions>
          <PermissionGate permission="pms.inventory.update">
            <button type="button" onClick={() => openEdit(r)} title="Cập nhật kho" className="rounded p-1.5 text-blue-600 hover:bg-blue-50 hover:text-blue-800"><Pencil size={14} /></button>
          </PermissionGate>
        </TableActions>
      ),
    },
  ];

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-white">
      {/* ── HEADER ROW ── */}
      <div className="flex flex-shrink-0 border-b border-gray-200">
        {/* Header: title + summary badges */}
        <div className="flex-1 flex items-center justify-between px-4 py-3 bg-white">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">
              ≡ {t('inventory.title')}
            </span>
          </div>
          {summary && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                <Package size={12} /> {summary.totalItems} mặt hàng
              </div>
              <div className="flex items-center gap-1 text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-medium">
                <DollarSign size={12} /> USD {fmt(totalValue)}
              </div>
              {summary.lowStockCount > 0 && (
                <div className="flex items-center gap-1 text-xs bg-red-50 text-red-700 px-2 py-0.5 rounded-full font-medium">
                  <AlertTriangle size={12} /> {summary.lowStockCount} tồn thấp
                </div>
              )}

              {/* Action buttons */}
              <div className="border-l border-gray-200 ml-1 pl-3 flex items-center gap-2">
                <button onClick={openHistory} className="flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-600">
                  <Clock size={13} /> Lịch sử tồn kho
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Right Panel - table */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <DataTable
            flush
            showCount={false}
            loading={loading}
            columns={columns}
            data={items}
            rowKey={r => r.id}
            itemLabel="dòng tồn kho"
            emptyMessage="Không có dữ liệu tồn kho"
            searchPlaceholder="Tìm mã vật tư, tên vật tư, vị trí kho..."
            exportOptions={canExport ? { fileName: 'ton-kho', title: 'BÁO CÁO TỒN KHO' } : false}
            minWidth={1300}
          />
        </div>
      </div>

      {/* ── EDIT MODAL ── */}
      {editItem && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-[440px] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b bg-slate-700 rounded-t-lg">
              <h3 className="text-sm font-semibold text-white">Cập nhật tồn kho</h3>
              <button onClick={() => setEditItem(null)} className="text-gray-300 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <div>
                <span className="text-xs text-gray-500">Vật tư</span>
                <p className="font-medium text-gray-800">{editItem.itemCode} – {editItem.itemName}</p>
              </div>
              <div>
                <span className="text-xs text-gray-500">Vị trí kho</span>
                <p className="text-gray-700">{editItem.locationName}</p>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Số lượng tồn mới</label>
                <input
                  type="number" min={0} value={editQuantity}
                  onChange={e => setEditQuantity(Number(e.target.value))}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                />
                <p className="text-xs text-gray-400 mt-0.5">Hiện tại: {fmt(editItem.quantity)} {editItem.unit}</p>
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Ghi chú / Lý do</label>
                <input
                  type="text" value={editNote}
                  onChange={e => setEditNote(e.target.value)}
                  placeholder="Nhập lý do điều chỉnh..."
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t">
              <button onClick={() => setEditItem(null)} className="px-4 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">Hủy</button>
              <PermissionGate permission="pms.inventory.update"><button onClick={handleEdit} disabled={editSaving} className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                {editSaving ? 'Đang lưu...' : 'Xác nhận'}
              </button></PermissionGate>
            </div>
          </div>
        </div>
      )}

      {showHistory && <AppModal title="Lịch sử tồn kho" onClose={() => setShowHistory(false)} footer={<span className="mr-auto self-center text-xs text-gray-500">{historyTotal} giao dịch</span>}>
        <div className="-m-4">
          <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-4 py-3 text-xs text-slate-500"><span>Nhập và xuất vật tư theo thời gian</span><span>{historyLoading ? 'Đang tải…' : `${historyItems.length} / ${historyTotal} giao dịch`}</span></div>
          {historyError && <div role="alert" className="m-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{historyError}<button className="ml-3 underline" onClick={() => void loadHistory(historyPage)}>Thử lại</button></div>}
          <div className="max-h-[55vh] overflow-auto" aria-busy={historyLoading}>
            <table className="w-full min-w-[800px] border-separate border-spacing-0 text-xs text-slate-700">
              <thead className="sticky top-0 z-10"><tr>{['STT','Ngày','Loại','Mã vật tư','Tên vật tư','Số lượng','Ghi chú'].map(title => <th key={title} className="border-b border-r border-[#a3b1bc] bg-blue-50 px-3 py-3 text-center font-semibold">{title}</th>)}</tr></thead>
              <tbody>{!historyError && historyItems.map((h, i) => <tr key={i} className={i % 2 ? 'bg-gray-50/50' : 'bg-white'}>
                <td className="border-b border-r border-[#a3b1bc] px-3 py-3 text-center">{(historyPage - 1) * 20 + i + 1}</td>
                <td className="whitespace-nowrap border-b border-r border-[#a3b1bc] px-3 py-3">{h.date ? new Date(h.date).toLocaleDateString('vi-VN') : '—'}</td>
                <td className="border-b border-r border-[#a3b1bc] px-3 py-3 text-center"><span className={`rounded px-2 py-1 ${h.type === 'IN' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>{h.type === 'IN' ? 'Nhập' : 'Xuất'}</span></td>
                <td className="border-b border-r border-[#a3b1bc] px-3 py-3 font-medium">{h.itemCode || '—'}</td><td className="border-b border-r border-[#a3b1bc] px-3 py-3">{h.itemName || '—'}</td>
                <td className="border-b border-r border-[#a3b1bc] px-3 py-3 text-right font-semibold tabular-nums">{fmt(h.quantity)}</td>
                <td className="min-w-[230px] whitespace-pre-wrap break-words border-b border-r border-[#a3b1bc] px-3 py-3 text-gray-500">{h.note || '—'}</td>
              </tr>)}{!historyItems.length && !historyError && <tr><td colSpan={7} className="p-10 text-center text-gray-500">{historyLoading ? 'Đang tải lịch sử…' : 'Chưa có lịch sử tồn kho.'}</td></tr>}</tbody>
            </table>
          </div>
          <TablePagination page={historyPage} pageSize={20} totalItems={historyTotal} onPageChange={page => { if (!historyLoading) void loadHistory(page) }} />
        </div>
      </AppModal>}
      {/* ── DECLARE MODAL ── */}
      {showDeclare && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-[700px] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b bg-slate-700 rounded-t-lg">
              <h3 className="text-sm font-semibold text-white">Khai báo tồn kho</h3>
              <button onClick={() => setShowDeclare(false)} className="text-gray-300 hover:text-white"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <table className="min-w-full text-sm">
                <thead><tr className="bg-gray-50 text-xs text-gray-600">
                  <th className="px-2 py-2 text-left">Vật tư</th>
                  <th className="px-2 py-2 text-left">Vị trí kho</th>
                  <th className="px-2 py-2 text-right w-24">Số lượng</th>
                  <th className="px-2 py-2 text-right w-28">Đơn giá (USD)</th>
                  <th className="w-10"></th>
                </tr></thead>
                <tbody>
                  {declareItems.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="px-2 py-1">
                        <select
                          value={item.materialItemId}
                          onChange={e => {
                            const next = [...declareItems];
                            next[idx].materialItemId = e.target.value;
                            next[idx].itemName = allMaterials.find(m => m.id === e.target.value)?.name;
                            setDeclareItems(next);
                          }}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                        >
                          <option value="">-- Chọn vật tư --</option>
                          {allMaterials.map(m => <option key={m.id} value={m.id}>{m.itemCode} - {m.name}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <select
                          value={item.storeLocationId}
                          onChange={e => { const next = [...declareItems]; next[idx].storeLocationId = e.target.value; setDeclareItems(next); }}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs"
                        >
                          <option value="">-- Chọn kho --</option>
                          {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number" min={0} value={item.quantity}
                          onChange={e => { const next = [...declareItems]; next[idx].quantity = Number(e.target.value); setDeclareItems(next); }}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-right"
                        />
                      </td>
                      <td className="px-2 py-1">
                        <input
                          type="number" min={0} step={0.01} value={item.unitCost}
                          onChange={e => { const next = [...declareItems]; next[idx].unitCost = Number(e.target.value); setDeclareItems(next); }}
                          className="w-full border border-gray-300 rounded px-2 py-1 text-xs text-right"
                        />
                      </td>
                      <td className="px-1 py-1 text-center">
                        {declareItems.length > 1 && (
                          <button onClick={() => setDeclareItems(declareItems.filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600"><X size={14} /></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                onClick={() => setDeclareItems([...declareItems, { materialItemId: '', storeLocationId: locations[0]?.id || '', quantity: 0, unitCost: 0 }])}
                className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                <Plus size={13} /> Thêm dòng
              </button>
            </div>
            <div className="flex justify-end gap-2 px-5 py-3 border-t">
              <button onClick={() => setShowDeclare(false)} className="px-4 py-1.5 text-xs border border-gray-300 rounded hover:bg-gray-50">Hủy</button>
              <PermissionGate permission="pms.inventory.update"><button onClick={handleDeclare} className="px-4 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700">Khai báo</button></PermissionGate>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
