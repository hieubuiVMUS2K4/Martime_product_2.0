import { useState, useEffect, useCallback, useMemo } from 'react';
import { AlertTriangle, Boxes, Clock, DollarSign, Minus, Package, Plus, SlidersHorizontal, X } from 'lucide-react';
import { inventoryService } from '@/services/inventory.service';
import { storeLocationService } from '@/services/store-location.service';
import { materialService } from '@/services/materialService';
import { useTranslationSafe } from '@/contexts/I18nContext';
import { Button, DataTable, Modal, QuickFilterBar, TableActions, TableIconButton, type Column } from '@/components/common';
import type { InventoryStockItem, StoreLocation } from '@/types/pms.types';
import type { MaterialItem } from '@/types/maritime.types';
import { formatDateVi } from '@/utils/date';
import { toast } from 'sonner';

/** API trả tối đa 100 dòng mỗi lần; tải hết theo lô để bảng tự tìm/lọc/phân trang. */
const FETCH_PAGE = 100;

type View = 'all' | 'low';

const fmt = (n: number) => n.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const locationOf = (r: InventoryStockItem) => r.storeLocationName ?? r.locationName ?? '';

/** vesselId: xem tồn kho của MỘT tàu trong màn chi tiết tàu. readOnly: bờ chỉ xem, không sửa. */
export default function InventoryPage({ vesselId, readOnly = false }: { vesselId?: string; readOnly?: boolean } = {}) {
  const { t } = useTranslationSafe();
  const [items, setItems] = useState<InventoryStockItem[]>([]);
  const [totalValue, setTotalValue] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('all');
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
    setLoading(true);
    setError(null);
    try {
      const all: InventoryStockItem[] = [];
      let value = 0;
      for (let page = 1; ; page++) {
        const res = await inventoryService.getAll({ page, pageSize: FETCH_PAGE, vesselId });
        all.push(...res.items);
        value = res.totalValue;
        if (all.length >= res.total || res.items.length === 0) break;
      }
      setItems(all);
      setTotalValue(value);
    } catch (e) {
      console.error(e);
      setError('Không tải được dữ liệu tồn kho');
    } finally {
      setLoading(false);
    }
  }, [vesselId]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    storeLocationService.getAll({ vesselId }).then(setLocations).catch(() => setLocations([]));
  }, [vesselId]);

  const lowCount = useMemo(() => items.filter(i => i.isLowStock).length, [items]);
  const rows = useMemo(() => (view === 'low' ? items.filter(i => i.isLowStock) : items), [items, view]);

  // ── History ──
  const loadHistory = async (page: number) => {
    setHistoryLoading(true);
    try {
      const res = await inventoryService.getHistory({ page, pageSize: 20 });
      setHistoryItems(res.items);
      setHistoryTotal(res.total);
      setHistoryPage(page);
    } catch (e) { console.error(e); }
    finally { setHistoryLoading(false); }
  };

  const openHistory = async () => {
    setShowHistory(true);
    await loadHistory(1);
  };

  // ── Declare ──
  const openDeclare = async () => {
    try {
      setAllMaterials(await materialService.getItems());
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
      toast.success('Đã khai báo tồn kho', { description: `${valid.length} dòng` });
      loadData();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error('Khai báo thất bại', { description: err?.response?.data?.error });
    }
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
      toast.success('Đã điều chỉnh tồn kho', { description: `${adjustItem.itemCode} — ${adjustItem.itemName}` });
      loadData();
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      toast.error('Điều chỉnh thất bại', { description: err?.response?.data?.error });
    }
  };

  const columns: Column<InventoryStockItem>[] = [
    { key: 'code', header: t('inventory.itemCode'), width: 150, filter: false, value: r => r.itemCode, className: 'font-mono text-xs' },
    {
      key: 'name', header: t('inventory.itemName'), filter: false, value: r => r.itemName,
      render: r => (
        <span className="flex items-center gap-1.5">
          <span className="truncate font-semibold">{r.itemName}</span>
          {r.isLowStock && (
            <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700" title={r.minStock != null ? `Tối thiểu ${fmt(r.minStock)}` : undefined}>Tồn thấp</span>
          )}
        </span>
      ),
    },
    { key: 'location', header: t('inventory.location'), width: 160, value: locationOf },
    { key: 'unit', header: 'ĐVT', width: 80, align: 'center', value: r => r.unit },
    {
      key: 'qty', header: t('inventory.quantity'), width: 110, numeric: true, filter: false, value: r => r.quantity,
      render: r => <span className={`font-semibold ${r.isLowStock ? 'text-red-700' : ''}`}>{fmt(r.quantity)}</span>,
    },
    { key: 'cost', header: t('inventory.unitCost'), width: 110, numeric: true, filter: false, value: r => r.unitCost, render: r => fmt(r.unitCost) },
    { key: 'value', header: t('inventory.totalValue'), width: 130, numeric: true, filter: false, value: r => r.totalValue, render: r => <span className="font-semibold">{fmt(r.totalValue)}</span> },
    {
      key: 'receipt', header: 'Nhập kho gần nhất', width: 130, align: 'center', filter: false, value: r => r.lastReceiptDate ?? '',
      exportValue: r => formatDateVi(r.lastReceiptDate), render: r => formatDateVi(r.lastReceiptDate) || '—',
    },
    ...(readOnly ? [] : [{
      key: 'actions', header: 'Thao tác', width: 90, align: 'center' as const, exportable: false,
      render: (r: InventoryStockItem) => (
        <TableActions>
          <TableIconButton label={`Điều chỉnh tồn ${r.itemName}`} icon={<SlidersHorizontal />} onClick={() => openAdjust(r)} />
        </TableActions>
      ),
    }]),
  ];

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="shrink-0 border-b border-line bg-surface px-3 pt-3">
      <QuickFilterBar<View>
        active={view}
        onChange={setView}
        items={[
          { key: 'all', label: 'Mặt hàng tồn kho', count: items.length, icon: <Boxes /> },
          { key: 'low', label: 'Tồn thấp', count: lowCount, icon: <AlertTriangle />, tone: 'text-red-600' },
        ]}
      />
      </div>

      <DataTable
        flush
        columns={columns}
        data={rows}
        rowKey={r => r.id}
        loading={loading}
        error={error}
        itemLabel="mặt hàng"
        emptyMessage={view === 'low' ? 'Không có vật tư nào dưới mức tồn tối thiểu.' : 'Chưa có dữ liệu tồn kho.'}
        searchPlaceholder="Tìm theo mã, tên vật tư, kho..."
        exportOptions={{ fileName: 'ton-kho', title: 'TỒN KHO VẬT TƯ' }}
        minWidth={1050}
        toolbarLeft={
          <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
            <DollarSign className="h-4 w-4 text-emerald-600" aria-hidden="true" />
            Tổng giá trị <strong className="tabular-nums text-ink">{fmt(totalValue)} USD</strong>
          </span>
        }
        toolbarActions={
          <>
            <Button variant="secondary" icon={<Clock className="h-4 w-4" />} onClick={openHistory}>Lịch sử</Button>
            {!readOnly && <Button icon={<Plus className="h-4 w-4" />} onClick={openDeclare}>Khai báo tồn kho</Button>}
          </>
        }
      />

      {/* ── HISTORY MODAL ── */}
      <Modal
        isOpen={showHistory}
        onClose={() => setShowHistory(false)}
        size="lg"
        icon={<Clock />}
        title="Lịch sử tồn kho"
        footer={historyTotal > 20 ? (
          <div className="flex w-full items-center justify-center gap-2 text-xs">
            <Button size="sm" disabled={historyPage <= 1} onClick={() => loadHistory(historyPage - 1)}>← Trước</Button>
            <span>Trang {historyPage} / {Math.ceil(historyTotal / 20)}</span>
            <Button size="sm" disabled={historyPage >= Math.ceil(historyTotal / 20)} onClick={() => loadHistory(historyPage + 1)}>Sau →</Button>
          </div>
        ) : undefined}
      >
            <div>
              {historyLoading ? (
                <div className="py-8 text-center text-xs text-ink-muted">Đang tải...</div>
              ) : historyItems.length === 0 ? (
                <div className="py-8 text-center text-xs text-ink-muted">Chưa có lịch sử</div>
              ) : (
                <table className="min-w-full text-sm">
                  <thead><tr className="bg-canvas text-xs font-semibold text-ink">
                    <th className="px-3 py-2 text-left">Ngày</th>
                    <th className="px-3 py-2 text-left">Loại</th>
                    <th className="px-3 py-2 text-left">Mã VT</th>
                    <th className="px-3 py-2 text-left">Tên vật tư</th>
                    <th className="px-3 py-2 text-right">Số lượng</th>
                    <th className="px-3 py-2 text-left">Ghi chú</th>
                  </tr></thead>
                  <tbody className="divide-y divide-grid">
                    {historyItems.map((h, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-xs">{formatDateVi(h.date) || '—'}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${h.type === 'IN' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {h.type === 'IN' ? 'Nhập' : 'Xuất'}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{h.itemCode}</td>
                        <td className="px-3 py-2 text-xs">{h.itemName}</td>
                        <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums">{fmt(h.quantity)}</td>
                        <td className="max-w-[160px] truncate px-3 py-2 text-xs text-ink-muted">{h.note || '—'}</td>
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
                <thead><tr className="bg-canvas text-xs font-semibold text-ink">
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
                <label className="text-xs font-medium text-ink-muted">Vật tư</label>
                <div className="text-sm font-semibold mt-1">{adjustItem.itemCode} - {adjustItem.itemName}</div>
              </div>
              <div>
                <label className="text-xs font-medium text-ink-muted">Vị trí kho</label>
                <div className="text-sm mt-1">{locationOf(adjustItem)}</div>
              </div>
              <div>
                <label className="text-xs font-medium text-ink-muted">Tồn hiện tại</label>
                <div className="text-sm font-semibold mt-1">{fmt(adjustItem.quantity)}</div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ink-muted">Điều chỉnh số lượng</label>
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
                <label className="mb-1 block text-xs font-medium text-ink-muted">Lý do</label>
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

