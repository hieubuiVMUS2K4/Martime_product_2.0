import React, { useState, useEffect, useCallback } from 'react';
import { LogOut, Check, X, RefreshCw, Loader2, AlertTriangle, Ship } from 'lucide-react';
import { crewApi } from '../../services/crew.service';
import type { PendingSignOff } from '../../services/crew.service';
import { useConfirm } from '@/components/common/ConfirmDialog';

const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('vi-VN') : '—';

/**
 * Hàng chờ duyệt: các đề nghị cho thuyền viên xuống tàu do tàu gửi lên.
 *
 * Bờ tự cho xuống tàu thì có hiệu lực ngay (xem SignOffCrewModal). Còn tàu đề nghị thì
 * phải qua đây. Trong lúc chờ, thuyền viên VẪN đang phục vụ bình thường — chỉ khi bờ
 * duyệt thì kỳ phục vụ mới đóng lại.
 */
export const PendingSignOffsPage: React.FC = () => {
  const ask = useConfirm();
  const [items, setItems] = useState<PendingSignOff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Modal từ chối — lý do là bắt buộc nên phải hỏi, không từ chối thẳng được
  const [rejecting, setRejecting] = useState<PendingSignOff | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      setItems(await crewApi.getPendingSignOffs());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được hàng chờ duyệt');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (item: PendingSignOff) => {
    if (!await ask(
      `Duyệt cho ${item.fullName} xuống tàu ${item.vesselName ?? ''}?\n\n` +
      `Kỳ phục vụ sẽ được đóng lại và ghi vĩnh viễn vào sổ thuyền viên.`,
      { title: 'Duyệt xuống tàu', confirmLabel: 'Duyệt' }
    )) return;

    setBusyId(item.id);
    try {
      await crewApi.approveSignOff(item.crewMemberId, item.id, {
        signOffDate: item.signOffDate ?? undefined,
        approvedBy: 'Shore',
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Duyệt thất bại');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async () => {
    if (!rejecting || !rejectReason.trim()) return;
    setBusyId(rejecting.id);
    try {
      await crewApi.rejectSignOff(rejecting.crewMemberId, rejecting.id, rejectReason.trim(), 'Shore');
      setRejecting(null);
      setRejectReason('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Từ chối thất bại');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <LogOut size={18} className="text-rose-600" />
          <h1 className="text-lg font-bold text-gray-800">Đề nghị cho xuống tàu</h1>
          <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 text-xs font-bold border border-rose-200">
            {items.length}
          </span>
        </div>
        <button onClick={load}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50">
          <RefreshCw size={13} /> Làm mới
        </button>
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center p-16 text-gray-500">
          <Loader2 size={24} className="animate-spin mr-2" /> Đang tải...
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 text-gray-400">
          <Ship size={32} className="mb-2" />
          <p className="text-sm">Không có đề nghị nào đang chờ duyệt</p>
        </div>
      ) : (
        <div className="overflow-x-auto border border-gray-200 rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-gray-600">
              <tr>
                <th className="px-4 py-2.5 text-left">Thuyền viên</th>
                <th className="px-4 py-2.5 text-left">Tàu</th>
                <th className="px-4 py-2.5 text-left">Kỳ phục vụ</th>
                <th className="px-4 py-2.5 text-left">Đề nghị rời</th>
                <th className="px-4 py-2.5 text-left">Lý do</th>
                <th className="px-4 py-2.5 text-right">Quyết định</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {items.map(it => (
                <tr key={it.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-800">{it.fullName}</div>
                    <div className="text-xs text-gray-500">{it.crewId} · {it.rankAtTime ?? '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-gray-700">{it.vesselName ?? '—'}</div>
                    <div className="text-xs text-gray-400 font-mono">{it.imoNumber ?? ''}</div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">Từ {fmt(it.signOnDate)}</td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-rose-700">{fmt(it.signOffDate)}</div>
                    <div className="text-xs text-gray-500">{it.signOffPortName ?? '—'}</div>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <div className="text-gray-700">{it.signOffRequestReason ?? '—'}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {it.signOffRequestedBy ?? '—'} · {fmt(it.signOffRequestedAt)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <div className="inline-flex gap-1.5">
                      <button
                        onClick={() => handleApprove(it)} disabled={busyId === it.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#0b2545] text-white text-xs hover:bg-[#16375f] disabled:opacity-50">
                        <Check size={12} /> Duyệt
                      </button>
                      <button
                        onClick={() => { setRejecting(it); setRejectReason(''); }} disabled={busyId === it.id}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-gray-300 text-xs hover:bg-gray-50 disabled:opacity-50">
                        <X size={12} /> Từ chối
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Từ chối — bắt buộc ghi lý do để tàu biết phải sửa gì rồi gửi lại */}
      {rejecting && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setRejecting(null)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200">
              <h2 className="font-bold text-gray-800">Từ chối đề nghị</h2>
              <button onClick={() => setRejecting(null)} className="p-1 rounded hover:bg-gray-100"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-gray-600">
                Từ chối cho <strong>{rejecting.fullName}</strong> xuống tàu {rejecting.vesselName}.
              </p>
              <label className="block">
                <span className="text-xs font-semibold text-gray-600">
                  Lý do từ chối <span className="text-red-500">*</span>
                </span>
                <textarea
                  value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3}
                  placeholder="Tàu cần biết phải sửa gì để gửi lại — ví dụ: sai ngày, chưa có người thay thế..."
                  className="mt-1 w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm"
                />
              </label>
              <div className="flex justify-end gap-2">
                <button onClick={() => setRejecting(null)}
                  className="px-3.5 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50">Hủy</button>
                <button onClick={handleReject} disabled={!rejectReason.trim() || busyId === rejecting.id}
                  className="px-3.5 py-1.5 text-sm rounded bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-50">
                  Gửi từ chối
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
