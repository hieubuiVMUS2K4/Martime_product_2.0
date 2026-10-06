import { PermissionGate } from '@/components/auth/PermissionGate'
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Search, Package, DollarSign, AlertTriangle, ChevronsUpDown, Download, Clock, X, Plus, Pencil } from 'lucide-react';
import { inventoryService } from '@/services/inventory.service';
import { storeLocationService } from '@/services/store-location.service';
import { materialService } from '@/services/materialService';
import { useTranslationSafe } from '@/contexts/I18nContext';
import type { InventoryStockItem, InventorySummary, StoreLocation } from '@/types/pms.types';
import type { MaterialItem } from '@/types/maritime.types';


export default function InventoryPage() {
  const { t } = useTranslationSafe();
  const [items, setItems] = useState<InventoryStockItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalValue, setTotalValue] = useState(0);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(25);
  const [searchCode, setSearchCode] = useState('');
  const [searchName, setSearchName] = useState('');
  const [locations, setLocations] = useState<StoreLocation[]>([]);

  // Modal states
  const [showHistory, setShowHistory] = useState(false);
  const [historyItems, setHistoryItems] = useState<{ date: string; type: string; itemCode: string; itemName: string; quantity: number; note: string }[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);

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
      const res = await inventoryService.getAll({
        page: currentPage, pageSize,
        q: [searchCode, searchName].filter(Boolean).join(' ') || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
      setTotalValue(res.totalValue);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [currentPage, pageSize, searchCode, searchName]);

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

  // ── Export Excel/CSV ──
  const handleExport = async () => {
    try {
      const res = await inventoryService.getAll({ page: 1, pageSize: 100000 });
      const XLSX = await import('xlsx');
      const rows = res.items.map(item => ({
        'Mã vật tư': item.itemCode,
        'Vật tư': item.itemName,
        'Ghi chú': item.notes || '',
        'Vị trí kho': item.locationName,
        'Số lượng tồn': item.quantity,
        'Đơn giá (USD)': item.unitCost,
        'Giá trị tồn (USD)': item.totalValue,
        'ĐVT': item.unit || '',
        'Cập nhật': item.updatedAt ? item.updatedAt.slice(0, 10) : '',
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 18 }, { wch: 32 }, { wch: 28 }, { wch: 24 }, { wch: 14 },
        { wch: 14 }, { wch: 16 }, { wch: 10 }, { wch: 14 },
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Tồn kho');
      XLSX.writeFile(workbook, `inventory-export-${new Date().toISOString().slice(0, 10)}.xlsx`, { bookType: 'xlsx' });
    } catch (e) { console.error(e); toast.error('Export failed'); }
  };

  // ── History ──
  const openHistory = async () => {
    setShowHistory(true);
    setHistoryPage(1);
    await loadHistory(1);
  };

  const loadHistory = async (page: number) => {
    setHistoryLoading(true);
    try {
      const res = await inventoryService.getHistory({
        page, pageSize: 20,
      });
      setHistoryItems(res.items);
      setHistoryTotal(res.total);
      setHistoryPage(page);
    } catch (e) { console.error(e); }
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


  const totalPages = Math.ceil(total / pageSize);
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

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
                <PermissionGate permission="pms.inventory.export"><button onClick={handleExport} className="flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-600">
                  <Download size={13} /> Xuất Excel
                </button></PermissionGate>
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
          <>
          {/* Table */}
          <div className="flex-1 overflow-auto">
            <table className="min-w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10">
                {/* Row 1: Column headers + sort icons */}
                <tr className="bg-blue-50">
                  <th className="w-10 px-2 py-2 text-center text-xs font-semibold text-gray-600 border-b border-r border-gray-200">TT</th>
                  <th className="w-32 px-3 py-2 text-left border-b border-r border-gray-200">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-gray-600">{t('inventory.itemCode')}</span>
                      <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    </div>
                  </th>
                  <th className="min-w-[180px] px-3 py-2 text-left border-b border-r border-gray-200">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-gray-600">{t('inventory.itemName')}</span>
                      <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    </div>
                  </th>
                  <th className="w-36 px-3 py-2 text-left border-b border-r border-gray-200">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-gray-600">Ghi chú</span>
                      <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    </div>
                  </th>
                  <th className="w-32 px-3 py-2 text-left border-b border-r border-gray-200">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-gray-600">{t('inventory.location')}</span>
                      <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    </div>
                  </th>
                  <th className="w-24 px-3 py-2 text-right border-b border-r border-gray-200">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-xs font-semibold text-gray-600">{t('inventory.quantity')}</span>
                      <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    </div>
                  </th>
                  <th className="w-24 px-3 py-2 text-right border-b border-r border-gray-200">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-xs font-semibold text-gray-600">{t('inventory.unitCost')}</span>
                      <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    </div>
                  </th>
                  <th className="w-28 px-3 py-2 text-right border-b border-r border-gray-200">
                    <div className="flex items-center justify-end gap-1">
                      <span className="text-xs font-semibold text-gray-600">{t('inventory.totalValue')}</span>
                      <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    </div>
                  </th>
                  <th className="w-16 px-3 py-2 text-left border-b border-r border-gray-200">
                    <span className="text-xs font-semibold text-gray-600">ĐVT</span>
                  </th>
                  <th className="w-24 px-3 py-2 border-b border-r border-gray-200">
                    <span className="text-xs font-semibold text-gray-600">Cập nhật</span>
                  </th>
                  <th className="w-24 px-3 py-2 border-b border-gray-200 text-center">
                    <span className="text-xs font-semibold text-gray-600">Thao tác</span>
                  </th>
                </tr>
                {/* Row 2: Column filters */}
                <tr className="bg-white border-b border-gray-200">
                  <th className="border-r border-gray-200"></th>
                  <th className="px-2 py-1 border-r border-gray-200">
                    <div className="flex items-center gap-0.5 border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                      <span className="text-gray-400 text-xs select-none">→</span>
                      <input type="text" placeholder={t('common.search')} value={searchCode} onChange={e => { setSearchCode(e.target.value); setCurrentPage(1); }} className="flex-1 text-xs outline-none min-w-0 bg-transparent" />
                      <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    </div>
                  </th>
                  <th className="px-2 py-1 border-r border-gray-200">
                    <div className="flex items-center gap-0.5 border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                      <span className="text-gray-400 text-xs select-none">→</span>
                      <input type="text" placeholder={t('common.search')} value={searchName} onChange={e => { setSearchName(e.target.value); setCurrentPage(1); }} className="flex-1 text-xs outline-none min-w-0 bg-transparent" />
                      <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    </div>
                  </th>
                  <th className="border-r border-gray-200"></th>
                  <th className="border-r border-gray-200"></th>
                  <th className="border-r border-gray-200"></th>
                  <th className="border-r border-gray-200"></th>
                  <th className="border-r border-gray-200"></th>
                  <th className="border-r border-gray-200"></th>
                  <th className="border-gray-200"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={11} className="text-center py-8 text-gray-400">Đang tải...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-8 text-gray-400">Không có dữ liệu tồn kho</td></tr>
                ) : items.map((row, idx) => (
                  <tr key={row.id} className={`hover:bg-blue-50 ${idx % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'}`}>
                    <td className="px-2 py-2 text-center text-xs text-gray-500 border-r border-gray-100">{(currentPage - 1) * pageSize + idx + 1}</td>
                    <td className="px-3 py-2 text-xs font-medium border-r border-gray-100">{row.itemCode}</td>
                    <td className="px-3 py-2 text-xs border-r border-gray-100">{row.itemName}</td>
                    <td className="px-3 py-2 text-xs text-gray-500 truncate max-w-[150px] border-r border-gray-100">{row.notes || '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-600 border-r border-gray-100">{row.locationName}</td>
                    <td className="px-3 py-2 text-xs text-right font-semibold border-r border-gray-100">{fmt(row.quantity)}</td>
                    <td className="px-3 py-2 text-xs text-right border-r border-gray-100">{fmt(row.unitCost)}</td>
                    <td className="px-3 py-2 text-xs text-right font-semibold text-green-700 border-r border-gray-100">{fmt(row.totalValue)}</td>
                    <td className="px-3 py-2 text-xs border-r border-gray-100">{row.unit}</td>
                    <td className="px-3 py-2 text-gray-400 text-xs border-r border-gray-100">{row.updatedAt?.slice(0, 10)}</td>
                    <td className="px-2 py-2 text-center">
                      <PermissionGate permission="pms.inventory.update"><button
                        onClick={() => openEdit(row)}
                        title="Cập nhật kho"
                        className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded"
                      >
                        <Pencil size={14} />
                      </button></PermissionGate>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── PAGINATION ── */}
          <div className="flex items-center justify-center px-4 py-2 border-t border-gray-200 bg-white flex-shrink-0 text-xs text-gray-600">
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">‹</button>
              {[...Array(Math.min(5, totalPages || 1))].map((_, i) => {
                const tp = totalPages || 1;
                let page: number;
                if (tp <= 5) page = i + 1;
                else if (currentPage <= 3) page = i + 1;
                else if (currentPage >= tp - 2) page = tp - 4 + i;
                else page = currentPage - 2 + i;
                return (
                  <button key={page} onClick={() => setCurrentPage(page)} className={`w-7 h-7 flex items-center justify-center border rounded text-xs ${currentPage === page ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 hover:bg-gray-50'}`}>
                    {page}
                  </button>
                );
              })}
              <button onClick={() => setCurrentPage(p => Math.min(totalPages || 1, p + 1))} disabled={currentPage >= (totalPages || 1)} className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">›</button>
            </div>
          </div>
            </>
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

      {/* ── HISTORY MODAL ── */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-[700px] max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b bg-slate-700 rounded-t-lg">
              <h3 className="text-sm font-semibold text-white">Lịch sử tồn kho</h3>
              <button onClick={() => setShowHistory(false)} className="text-gray-300 hover:text-white"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {historyLoading ? (
                <div className="text-center py-8 text-gray-400">Đang tải...</div>
              ) : historyItems.length === 0 ? (
                <div className="text-center py-8 text-gray-400">Chưa có lịch sử</div>
              ) : (
                <table className="min-w-full text-sm">
                  <thead><tr className="bg-gray-50 text-xs text-gray-600">
                    <th className="px-3 py-2 text-left">Ngày</th>
                    <th className="px-3 py-2 text-left">Loại</th>
                    <th className="px-3 py-2 text-left">Mã VT</th>
                    <th className="px-3 py-2 text-left">Tên vật tư</th>
                    <th className="px-3 py-2 text-right">Số lượng</th>
                    <th className="px-3 py-2 text-left">Ghi chú</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {historyItems.map((h, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-xs">{h.date?.slice(0, 10)}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${h.type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {h.type === 'IN' ? 'Nhập' : 'Xuất'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs font-medium">{h.itemCode}</td>
                        <td className="px-3 py-2 text-xs">{h.itemName}</td>
                        <td className="px-3 py-2 text-xs text-right font-semibold">{fmt(h.quantity)}</td>
                        <td className="px-3 py-2 text-xs text-gray-500 truncate max-w-[120px]">{h.note || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {historyTotal > 20 && (
              <div className="flex items-center justify-center gap-2 px-4 py-2 border-t text-xs">
                <button disabled={historyPage <= 1} onClick={() => loadHistory(historyPage - 1)} className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-40">← Trước</button>
                <span>Trang {historyPage} / {Math.ceil(historyTotal / 20)}</span>
                <button disabled={historyPage >= Math.ceil(historyTotal / 20)} onClick={() => loadHistory(historyPage + 1)} className="px-3 py-1 border rounded hover:bg-gray-50 disabled:opacity-40">Sau →</button>
              </div>
            )}
          </div>
        </div>
      )}

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
