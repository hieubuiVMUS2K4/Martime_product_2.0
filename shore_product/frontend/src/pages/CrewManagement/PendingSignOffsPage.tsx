import React, { useState, useEffect, useCallback } from 'react';
import { Check, LogOut, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { crewApi } from '../../services/crew.service';
import type { PendingSignOff } from '../../services/crew.service';
import { Button, DataTable, Modal, Textarea, useConfirm, type Column } from '../../components/common';
import { formatDateVi } from '../../utils/date';

const errMsg = (err: unknown) => (err instanceof Error ? err.message : undefined);

/**
 * Hàng chờ phê duyệt: các đề nghị cho thuyền viên rời tàu do tàu gửi lên.
 *
 * Bờ tự cho xuống tàu thì có hiệu lực ngay (xem SignOffCrewModal). Còn tàu đề nghị thì
 * phải qua đây. Trong lúc chờ, thuyền viên VẪN đang phục vụ bình thường — chỉ khi bờ
 * duyệt thì kỳ phục vụ mới đóng lại.
 */
export const PendingSignOffsPage: React.FC<{
  /** Báo số đề nghị còn chờ cho trang cha (badge trên tab). */
  onCountChange?: (count: number) => void;
}> = ({ onCountChange }) => {
  const ask = useConfirm();
  const [items, setItems] = useState<PendingSignOff[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Từ chối — lý do là bắt buộc nên phải hỏi, không từ chối thẳng được
  const [rejecting, setRejecting] = useState<PendingSignOff | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const data = await crewApi.getPendingSignOffs();
      setItems(data);
      onCountChange?.(data.length);
    } catch (err) {
      setError(errMsg(err) ?? 'Không tải được danh sách đề nghị rời tàu');
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (item: PendingSignOff) => {
    if (!await ask(
      `Phê duyệt cho ${item.fullName} rời tàu ${item.vesselName ?? ''}?\n\n` +
      `Kỳ phục vụ sẽ được đóng lại và ghi vĩnh viễn vào sổ thuyền viên.`,
      { title: 'Phê duyệt rời tàu', confirmLabel: 'Phê duyệt' }
    )) return;

    setBusyId(item.id);
    try {
      await crewApi.approveSignOff(item.crewMemberId, item.id, {
        signOffDate: item.signOffDate ?? undefined,
        approvedBy: 'Shore',
      });
      toast.success('Đã phê duyệt rời tàu', { description: `${item.fullName} — ${item.vesselName ?? ''}` });
      await load();
    } catch (err) {
      toast.error('Không phê duyệt được', { description: errMsg(err) });
    } finally {
      setBusyId(null);
    }
  };

  const closeReject = () => { setRejecting(null); setRejectReason(''); };

  const handleReject = async () => {
    if (!rejecting || !rejectReason.trim()) return;
    setBusyId(rejecting.id);
    try {
      await crewApi.rejectSignOff(rejecting.crewMemberId, rejecting.id, rejectReason.trim(), 'Shore');
      toast.success('Đã từ chối đề nghị', { description: `${rejecting.fullName} — ${rejecting.vesselName ?? ''}` });
      closeReject();
      await load();
    } catch (err) {
      toast.error('Không từ chối được', { description: errMsg(err) });
    } finally {
      setBusyId(null);
    }
  };

  const columns: Column<PendingSignOff>[] = [
    {
      key: 'crew', header: 'Thuyền viên', filter: false, value: it => it.fullName,
      render: it => (
        <span className="block min-w-0">
          <span className="block truncate font-semibold text-ink">{it.fullName}</span>
          <span className="block font-mono text-xs text-ink-muted">{it.crewId}</span>
        </span>
      ),
    },
    { key: 'rank', header: 'Chức danh', width: 140, value: it => it.rankAtTime ?? '' },
    {
      key: 'vessel', header: 'Tàu', width: 170, value: it => it.vesselName ?? '',
      render: it => (
        <span className="block">
          <span className="block text-ink">{it.vesselName ?? '—'}</span>
          {it.imoNumber && <span className="block font-mono text-xs text-ink-light">IMO {it.imoNumber}</span>}
        </span>
      ),
    },
    { key: 'signOn', header: 'Lên tàu từ', width: 110, align: 'center', filter: false, value: it => it.signOnDate ?? '',
      exportValue: it => formatDateVi(it.signOnDate), render: it => formatDateVi(it.signOnDate) || '—' },
    {
      key: 'signOff', header: 'Đề nghị rời', width: 140, filter: false, value: it => it.signOffDate ?? '',
      exportValue: it => `${formatDateVi(it.signOffDate)} ${it.signOffPortName ?? ''}`.trim(),
      render: it => (
        <span className="block">
          <span className="block font-semibold text-ink">{formatDateVi(it.signOffDate) || '—'}</span>
          <span className="block text-xs text-ink-muted">{it.signOffPortName ?? '—'}</span>
        </span>
      ),
    },
    {
      key: 'reason', header: 'Lý do', filter: false, value: it => it.signOffRequestReason ?? '',
      render: it => (
        <span className="block">
          <span className="block text-ink">{it.signOffRequestReason ?? '—'}</span>
          <span className="mt-0.5 block text-xs text-ink-light">
            {it.signOffRequestedBy ?? '—'} · {formatDateVi(it.signOffRequestedAt) || '—'}
          </span>
        </span>
      ),
    },
    {
      key: 'actions', header: 'Quyết định', width: 190, align: 'center', exportable: false, filter: false,
      render: it => (
        <span className="inline-flex gap-1.5" onClick={e => e.stopPropagation()}>
          <Button size="sm" icon={<Check className="h-3.5 w-3.5" />} loading={busyId === it.id} disabled={!!busyId} onClick={() => handleApprove(it)}>
            Phê duyệt
          </Button>
          <Button size="sm" variant="secondary" icon={<X className="h-3.5 w-3.5" />} disabled={!!busyId} onClick={() => setRejecting(it)}>
            Từ chối
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div>
      <DataTable
        columns={columns}
        data={items}
        rowKey={it => it.id}
        loading={loading}
        error={error}
        itemLabel="đề nghị"
        emptyMessage="Không có đề nghị rời tàu nào đang chờ phê duyệt."
        searchPlaceholder="Tìm theo thuyền viên, tàu, lý do..."
        exportOptions={{ fileName: 'de-nghi-roi-tau', title: 'ĐỀ NGHỊ RỜI TÀU CHỜ PHÊ DUYỆT' }}
        toolbarActions={
          <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={load} disabled={loading}>
            Làm mới
          </Button>
        }
        minWidth={1100}
      />

      {/* Từ chối — bắt buộc ghi lý do để tàu biết phải sửa gì rồi gửi lại */}
      <Modal
        isOpen={!!rejecting}
        onClose={closeReject}
        size="sm"
        icon={<LogOut />}
        title="Từ chối đề nghị rời tàu"
        subtitle={rejecting ? `${rejecting.fullName} — ${rejecting.vesselName ?? ''}` : undefined}
        busy={!!rejecting && busyId === rejecting.id}
        closeOnBackdrop={false}
        footer={
          <>
            <Button variant="secondary" onClick={closeReject}>Hủy</Button>
            <Button
              variant="danger"
              onClick={handleReject}
              disabled={!rejectReason.trim()}
              loading={!!rejecting && busyId === rejecting.id}
            >
              Gửi từ chối
            </Button>
          </>
        }
      >
        <Textarea
          label="Lý do từ chối"
          required
          autoFocus
          value={rejectReason}
          onChange={e => setRejectReason(e.target.value)}
          placeholder="Tàu cần biết phải sửa gì để gửi lại — ví dụ: sai ngày, chưa có người thay thế..."
          hint="Lý do được gửi xuống tàu cùng kết quả từ chối."
        />
      </Modal>
    </div>
  );
};
