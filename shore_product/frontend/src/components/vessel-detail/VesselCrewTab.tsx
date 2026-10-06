import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, LogOut, Ship, Trash2, AlertTriangle, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';
import { ENV } from '../../config/env';
import { crewApi } from '../../services/crew.service';
import { AssignCrewToVesselModal } from './AssignCrewToVesselModal';
import { SignOffCrewModal } from './SignOffCrewModal';
import { Button, DataTable, TableActions, TableIconButton, useConfirm, type Column } from '@/components/common';
import { formatDateVi } from '@/utils/date';
import { useMarkCrewChangesViewed } from '@/hooks/useMarkCrewChangesViewed';

interface VesselCrewTabProps {
  vesselId: string;
  vesselName: string;
}

interface CrewMember {
  id: string;
  crewId: string;
  fullName: string;
  rank?: { name: string; rankName?: string };
  countryName?: string;
  isOnboard: boolean;
  onboardStatus?: string;
  joinDate?: string;
  embarkDate?: string;
  disembarkDate?: string;
  contractEnd?: string;
  edgeChanges?: string;
  edgeChangesViewed?: boolean;
  reviewNotes?: string;
}

const BASE = ENV.API_BASE_URL;

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

const statusOf = (c: CrewMember) =>
  c.isOnboard ? 'Trên tàu'
    : c.onboardStatus === 'PendingReview' ? 'Đang duyệt'
      : c.onboardStatus === 'OnHold' ? 'Tạm giữ'
        : c.onboardStatus === 'Rejected' ? 'Từ chối'
          : 'Trên bờ';

const STATUS_TONE: Record<string, string> = {
  'Trên tàu': 'bg-emerald-50 text-emerald-700',
  'Đang duyệt': 'bg-amber-50 text-amber-700',
  'Tạm giữ': 'bg-orange-50 text-orange-700',
  'Từ chối': 'bg-red-50 text-red-700',
  'Trên bờ': 'bg-slate-100 text-slate-600',
};

const rankOf = (c: CrewMember) => c.rank?.rankName || c.rank?.name || '';
const hasEdgeChanges = (c: CrewMember) => !!c.edgeChanges && !c.edgeChangesViewed;

export function VesselCrewTab({ vesselId, vesselName }: VesselCrewTabProps) {
  const ask = useConfirm();
  const navigate = useNavigate();
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Gán thuyền viên lên tàu (chuyển từ tab Danh mục → Thuyền viên sang đây)
  const [assignOpen, setAssignOpen] = useState(false);
  /** Thuyền viên đang được chọn để cho xuống tàu (null = modal đóng) */
  const [signOffTarget, setSignOffTarget] = useState<CrewMember | null>(null);

  const { markViewed, marking } = useMarkCrewChangesViewed(ids => {
    setCrew(prev => prev.map(c => (ids.includes(c.id) ? { ...c, edgeChangesViewed: true } : c)));
  });

  const loadCrew = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiFetch<{ data: CrewMember[] }>(`${BASE}/crew?shipId=${vesselId}&pageSize=200`);
      setCrew(response.data || []);
    } catch (err) {
      setError(err instanceof Error ? `Không tải được danh sách thuyền viên (${err.message})` : 'Không tải được danh sách thuyền viên');
    } finally {
      setLoading(false);
    }
  }, [vesselId]);

  useEffect(() => { loadCrew(); }, [loadCrew]);

  const unviewed = crew.filter(hasEdgeChanges);
  const unviewedChangesCount = unviewed.length;

  const markAllViewed = async () => {
    if (!(await ask(`Đánh dấu đã xem thay đổi từ tàu của ${unviewedChangesCount} thuyền viên?\nNên mở hồ sơ kiểm tra trước nếu thay đổi quan trọng.`, { title: 'Đánh dấu đã xem', confirmLabel: 'Đã xem tất cả' }))) return;
    await markViewed(unviewed.map(c => c.id));
  };

  const handleDelete = async (c: CrewMember) => {
    if (!await ask(`Xóa thuyền viên "${c.fullName}"?\nHành động này không thể hoàn tác.`)) return;
    try {
      await crewApi.delete(c.id);
      toast.success('Đã xóa thuyền viên', { description: `${c.crewId} — ${c.fullName}` });
      await loadCrew();
    } catch {
      toast.error('Xóa thất bại. Vui lòng thử lại.');
    }
  };

  // Mở hồ sơ — KHÔNG tự đánh dấu đã xem; người dùng bấm "✓ Đã xem" ở trang chi tiết.
  const handleViewCrew = (c: CrewMember) => navigate(`/vessels/${vesselId}/crew/${c.id}`);

  const columns: Column<CrewMember>[] = [
    { key: 'crewId', header: 'Mã TV', width: 110, value: c => c.crewId, className: 'font-mono text-ink-muted' },
    {
      key: 'name', header: 'Họ và tên', width: 240, value: c => c.fullName,
      render: c => (
        <span className="inline-flex max-w-full items-center gap-1.5 font-semibold text-primary">
          <span className="truncate">{c.fullName}</span>
          {hasEdgeChanges(c) && (
            <span title="Đã chỉnh sửa bởi tàu — mở hồ sơ để xem" className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-red-500" />
          )}
        </span>
      ),
    },
    { key: 'rank', header: 'Chức danh', width: 190, value: rankOf },
    { key: 'country', header: 'Quốc tịch', width: 140, value: c => c.countryName ?? '' },
    {
      key: 'embark', header: 'Ngày lên tàu', width: 120, align: 'center', value: c => c.embarkDate ?? '',
      filter: c => formatDateVi(c.embarkDate), exportValue: c => formatDateVi(c.embarkDate),
      render: c => formatDateVi(c.embarkDate) || '—',
    },
    {
      key: 'contract', header: 'Hết hợp đồng', width: 120, align: 'center', value: c => c.contractEnd ?? '',
      filter: c => formatDateVi(c.contractEnd), exportValue: c => formatDateVi(c.contractEnd),
      render: c => formatDateVi(c.contractEnd) || '—',
    },
    {
      key: 'status', header: 'Trạng thái', width: 120, align: 'center', value: statusOf,
      render: c => <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[statusOf(c)]}`}>{statusOf(c)}</span>,
    },
    {
      key: 'actions', header: 'Thao tác', width: 150, align: 'center',
      render: c => (
        <TableActions>
          <TableIconButton label={`Xem hồ sơ ${c.fullName}`} icon={<Eye />} onClick={() => handleViewCrew(c)} />
          {hasEdgeChanges(c) && (
            <TableIconButton label={`Đánh dấu đã xem thay đổi của ${c.fullName}`} icon={<CheckCheck />} disabled={marking} onClick={() => markViewed([c.id])} />
          )}
          <TableIconButton label={`Cho ${c.fullName} xuống tàu`} icon={<LogOut />} onClick={() => setSignOffTarget(c)} />
          <TableIconButton label={`Xóa ${c.fullName}`} icon={<Trash2 />} variant="danger" onClick={() => handleDelete(c)} />
        </TableActions>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {unviewedChangesCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">
            {unviewedChangesCount} thuyền viên đã được chỉnh sửa bởi tàu (chấm đỏ cạnh tên). Mở hồ sơ để xem từng thay đổi,
            hoặc bấm nút ✓✓ ở cột Thao tác.
          </span>
          <Button size="sm" icon={<CheckCheck className="h-4 w-4" />} loading={marking} onClick={markAllViewed}>
            Đã xem tất cả ({unviewedChangesCount})
          </Button>
        </div>
      )}

      <DataTable
        columns={columns}
        data={crew}
        rowKey={c => c.id}
        loading={loading}
        error={error}
        itemLabel="thuyền viên"
        emptyMessage="Chưa có thuyền viên nào trên tàu này."
        searchPlaceholder="Tìm theo mã, tên, chức danh..."
        exportOptions={{ fileName: `thuyen-vien-${vesselName}`, title: `THUYỀN VIÊN TÀU ${vesselName.toUpperCase()}` }}
        toolbarActions={
          <Button variant="primary" icon={<Ship className="h-4 w-4" />} onClick={() => setAssignOpen(true)}>
            Gán thuyền viên lên tàu
          </Button>
        }
        onRowClick={handleViewCrew}
        minWidth={1100}
      />

      {assignOpen && (
        <AssignCrewToVesselModal
          vesselId={vesselId}
          vesselName={vesselName}
          onClose={() => setAssignOpen(false)}
          onAssigned={loadCrew}
        />
      )}

      {/* Cho xuống tàu — đóng kỳ phục vụ trong sổ thuyền viên */}
      {signOffTarget && (
        <SignOffCrewModal
          crew={signOffTarget}
          vesselName={vesselName}
          onClose={() => setSignOffTarget(null)}
          onDone={loadCrew}
        />
      )}
    </div>
  );
}
