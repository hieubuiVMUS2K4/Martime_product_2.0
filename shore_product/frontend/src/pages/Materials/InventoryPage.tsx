import { useState, useEffect, useCallback } from 'react';
import { Search, Package, DollarSign, AlertTriangle, ChevronsUpDown, Download, Clock, SlidersHorizontal, X, Plus, Minus } from 'lucide-react';
import { inventoryService } from '@/services/inventory.service';
import { storeLocationService } from '@/services/store-location.service';
import { materialService } from '@/services/materialService';
import { useTranslationSafe } from '@/contexts/I18nContext';
import { Button, Modal } from '@/components/common';
import type { InventoryStockItem, InventorySummary, StoreLocation } from '@/types/pms.types';
import type { MaterialItem } from '@/types/maritime.types';
import { toast } from 'sonner';

const ITEMS_PER_PAGE_OPTIONS = [10, 20, 50];

/** vesselId: xem tồn kho của MỘT tàu trong màn chi tiết tàu. readOnly: bờ chỉ xem, không sửa. */
export default function InventoryPage({ vesselId, readOnly = false }: { vesselId?: string; readOnly?: boolean } = {}) {
  const { t } = useTranslationSafe();
  const [items, setItems] = useState<InventoryStockItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalValue, setTotalValue] = useState(0);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchQ, setSearchQ] = useState('');
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

  const [showAdjust, setShowAdjust] = useState(false);
  const [adjustItem, setAdjustItem] = useState<InventoryStockItem | null>(null);
  const [adjustQty, setAdjustQty] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await inventoryService.getAll({
        page: currentPage, pageSize,
        q: searchQ || undefined,
        vesselId,
      });
      setItems(res.items);
      setTotal(res.total);
      setTotalValue(res.totalValue);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [currentPage, pageSize, searchQ, vesselId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const loadMeta = async () => {
      const [locs, sum] = await Promise.all([
        storeLocationService.getAll({ vesselId }),
        inventoryService.getSummary(),
      ]);
      setLocations(locs);
      setSummary(sum);
    };
    loadMeta();
  }, []);

  // ── Export Excel/CSV ──
  const handleExport = async () => {
    try {
      const blob = await inventoryService.exportCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventory-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
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
  const openDeclare = async () => {
    try {
      const mats = await materialService.getItems();
      setAllMaterials(mats);
    } catch { setAllMaterials([]); }
    setDeclareItems([{ materialItemId: '', storeLocationId: locations[0]?.id || '', quantity: 0, unitCost: 0 }]);
    setShowDeclare(true);
  };

  const handleDeclare = async () => {
    const valid = declareItems.filter(i => i.materialItemId && i.storeLocationId && i.quantity > 0);
    if (valid.length === 0) { toast.warning('Vui lòng nhập ít nhất 1 dòng hợp lệ'); return; }
    try {
      await inventoryService.declare(valid);
      setShowDeclare(false);
      loadData();
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Khai báo thất bại'); }
  };

  // ── Adjust ──
  const openAdjust = (item: InventoryStockItem) => {
    setAdjustItem(item);
    setAdjustQty(0);
    setAdjustReason('');
    setShowAdjust(true);
  };

  const handleAdjust = async () => {
    if (!adjustItem || adjustQty === 0) return;
    try {
      await inventoryService.adjust({
        materialItemId: adjustItem.materialItemId,
        storeLocationId: adjustItem.storeLocationId,
        adjustQuantity: adjustQty,
        reason: adjustReason || undefined,
      });
      setShowAdjust(false);
      loadData();
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Điều chỉnh thất bại'); }
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
              <div className="flex items-center gap-1 text-xs bg-[#eef2f7] text-[#16375f] px-2 py-0.5 rounded-full font-medium">
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
                <button onClick={handleExport} className="flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-600">
                  <Download size={13} /> Xuất Excel
                </button>
                <button onClick={openHistory} className="flex items-center gap-1 px-2.5 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50 text-gray-600">
                  <Clock size={13} /> Lịch sử tồn kho
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Table */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Table */}
          <div className="flex-1 overflow-auto">
            <table className="min-w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10">
                {/* Row 1: Column headers + sort icons */}
                <tr className="bg-[#eef2f7]">
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
                  <th className="w-20 px-2 py-2 border-b border-gray-200 text-center">
                    <span className="text-xs font-semibold text-gray-600">Thao tác</span>
                  </th>
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
                  <th className="px-2 py-1 border-r border-gray-200">
                    <div className="flex items-center gap-0.5 border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                      <span className="text-gray-400 text-xs select-none">→</span>
                      <input type="text" placeholder={t('common.search')} className="flex-1 text-xs outline-none min-w-0 bg-transparent" />
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
                  <th className="border-gray-200"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr><td colSpan={11} className="text-center py-8 text-gray-400">Đang tải...</td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={11} className="text-center py-8 text-gray-400">Không có dữ liệu tồn kho</td></tr>
                ) : items.map((row, idx) => (
                  <tr key={row.id} className={`hover:bg-[#eef2f7] ${idx % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'}`}>
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
                      {!readOnly && (
                      <button
                        onClick={() => openAdjust(row)}
                        className="p-1 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded" title="Điều chỉnh tồn kho"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                      </button>
                      )}
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
              <span className="mr-2">Trang {currentPage} / {totalPages || 1} ({total} bản ghi)</span>
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">‹</button>
              {[...Array(Math.min(5, totalPages || 1))].map((_, i) => {
                const tp = totalPages || 1;
                let page: number;
                if (tp <= 5) page = i + 1;
                else if (currentPage <= 3) page = i + 1;
                else if (currentPage >= tp - 2) page = tp - 4 + i;
                else page = currentPage - 2 + i;
                return (
                  <button key={page} onClick={() => setCurrentPage(page)} className={`w-7 h-7 flex items-center justify-center border rounded text-xs ${currentPage === page ? 'bg-[#0b2545] text-white border-accent' : 'border-gray-300 hover:bg-gray-50'}`}>
                    {page}
                  </button>
                );
              })}
              <button onClick={() => setCurrentPage(p => Math.min(totalPages || 1, p + 1))} disabled={currentPage >= (totalPages || 1)} className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40">›</button>
            </div>
            <div className="flex items-center gap-2">
              <span>Đến trang</span>
              <input type="number" min={1} max={totalPages || 1} value={currentPage} onChange={e => { const v = Number(e.target.value); if (v >= 1 && v <= (totalPages || 1)) setCurrentPage(v); }} className="w-12 border border-gray-300 rounded px-1 py-1 text-center text-xs" />
            </div>
          </div>
        </div>
      </div>

      {/* ── HISTORY MODAL ── */}
      <Modal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        size="lg"
        icon={<Clock />}
        title="Lịch sử tồn kho"
        footer={historyTotal > 20 ? (
          <div className="flex w-full items-center justify-center gap-2 text-[13px]">
            <Button size="sm" disabled={historyPage <= 1} onClick={() => loadHistory(historyPage - 1)}>← Trước</Button>
            <span>Trang {historyPage} / {Math.ceil(historyTotal / 20)}</span>
            <Button size="sm" disabled={historyPage >= Math.ceil(historyTotal / 20)} onClick={() => loadHistory(historyPage + 1)}>Sau →</Button>
          </div>
        ) : undefined}
      >
            <div>
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
      </Modal>

      {/* ── DECLARE MODAL ── */}
      <Modal
        isOpen={showDeclare}
        onClose={() => setShowDeclare(false)}
        closeOnBackdrop={false}
        size="lg"
        icon={<Package />}
        title="Khai báo tồn kho"
        footer={<>
          <Button onClick={() => setShowDeclare(false)}>Hủy</Button>
          <Button variant="primary" onClick={handleDeclare}>Khai báo</Button>
        </>}
      >
            <div>
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
                className="mt-2 flex items-center gap-1 text-xs text-[#0b2545] hover:underline"
              >
                <Plus size={13} /> Thêm dòng
              </button>
            </div>
      </Modal>

      {/* ── ADJUST MODAL ── */}
      <Modal
        isOpen={showAdjust && !!adjustItem}
        onClose={() => setShowAdjust(false)}
        size="sm"
        icon={<SlidersHorizontal />}
        title="Điều chỉnh tồn kho"
        footer={<>
          <Button onClick={() => setShowAdjust(false)}>Hủy</Button>
          <Button variant="primary" onClick={handleAdjust} disabled={adjustQty === 0}>Điều chỉnh</Button>
        </>}
      >
        {adjustItem && (
            <div className="space-y-4">
              <div>
                <label className="text-[13px] font-medium text-ink-muted">Vật tư</label>
                <div className="text-sm font-semibold mt-1">{adjustItem.itemCode} - {adjustItem.itemName}</div>
              </div>
              <div>
                <label className="text-[13px] font-medium text-ink-muted">Vị trí kho</label>
                <div className="text-sm mt-1">{adjustItem.locationName}</div>
              </div>
              <div>
                <label className="text-[13px] font-medium text-ink-muted">Tồn hiện tại</label>
                <div className="text-sm font-semibold mt-1">{fmt(adjustItem.quantity)}</div>
              </div>
              <div>
                <label className="mb-1 block text-[13px] font-medium text-ink-muted">Điều chỉnh số lượng</label>
                <div className="flex items-center gap-2">
                  <button onClick={() => setAdjustQty(q => q - 1)} className="w-8 h-8 flex items-center justify-center border rounded hover:bg-red-50 text-red-600"><Minus size={14} /></button>
                  <input
                    type="number"
                    value={adjustQty}
                    onChange={e => setAdjustQty(Number(e.target.value))}
                    className="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm text-center"
                  />
                  <button onClick={() => setAdjustQty(q => q + 1)} className="w-8 h-8 flex items-center justify-center border rounded hover:bg-green-50 text-green-600"><Plus size={14} /></button>
                  <span className="text-xs text-gray-500">→ Tồn mới: <strong>{fmt(adjustItem.quantity + adjustQty)}</strong></span>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[13px] font-medium text-ink-muted">Lý do</label>
                <input
                  type="text" value={adjustReason}
                  onChange={e => setAdjustReason(e.target.value)}
                  placeholder="Kiểm kê, hư hỏng, sai số..."
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
                />
              </div>
            </div>
        )}
      </Modal>
    </div>
  );
}

