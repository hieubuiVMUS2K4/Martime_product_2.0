import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, UserCheck, UserMinus, ShieldAlert, Clock,
  Eye, Pencil, Trash2, Anchor, Ship, CheckCheck, AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useReferenceData, useExpiringCertificates, useCrewStats, useVessels } from '../../../hooks/useCrew';
import { crewApi } from '../../../services/crew.service';
import {
  Button, DataTable, ImportExcelModal, PageHeader, QuickFilterBar, TableActions, TableIconButton, fieldClass,
  useConfirm, type Column, type ImportField,
} from '../../../components/common';
import { CrewFormModal } from './CrewFormModal';
import { AssignShipModal } from './AssignShipModal';
import ProtectedImage from '../../../components/common/ProtectedImage';
import type { CrewMember, CreateCrewRequest, CrewCertificate } from '../../../types/crew.types';
import { formatDateVi, parseImportDate } from '../../../utils/date';
import { useMarkCrewChangesViewed } from '../../../hooks/useMarkCrewChangesViewed';

type View = 'all' | 'onboard' | 'pool' | 'certificates';

/** Máy chủ trả tối đa 200 thuyền viên mỗi lần; tải hết theo lô để lọc theo cột. */
const FETCH_PAGE = 200;

const hasEdgeChanges = (m: CrewMember) => !!m.edgeChanges && !m.edgeChangesViewed;

function getInitials(name: string) {
  const p = name.split(' ').filter(Boolean);
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : name.substring(0, 2).toUpperCase();
}

const statusOf = (m: CrewMember) =>
  m.isOnboard ? 'Trên tàu'
    : m.onboardStatus === 'PendingReview' ? 'Đang duyệt'
      : m.onboardStatus === 'OnHold' ? 'Tạm giữ'
        : m.onboardStatus === 'Rejected' ? 'Từ chối'
          : 'Ở bờ';

const STATUS_TONE: Record<string, string> = {
  'Trên tàu': 'bg-emerald-50 text-emerald-700 [&>i]:bg-emerald-500',
  'Đang duyệt': 'bg-amber-50 text-amber-700 [&>i]:bg-amber-500',
  'Tạm giữ': 'bg-orange-50 text-orange-700 [&>i]:bg-orange-500',
  'Từ chối': 'bg-red-50 text-red-700 [&>i]:bg-red-500',
  'Ở bờ': 'bg-slate-100 text-slate-600 [&>i]:bg-slate-400',
};

const CERT_STATUS: Record<string, { label: string; tone: string }> = {
  VALID: { label: 'Còn hiệu lực', tone: 'bg-emerald-50 text-emerald-700' },
  EXPIRING_SOON: { label: 'Sắp hết hạn', tone: 'bg-amber-50 text-amber-700' },
  EXPIRED: { label: 'Đã hết hạn', tone: 'bg-red-50 text-red-700' },
};

const IMPORT_FIELDS: ImportField[] = [
  { key: 'crewId', header: 'Mã thuyền viên', required: true, example: 'TV0001' },
  { key: 'fullName', header: 'Họ và tên', required: true, example: 'Nguyễn Văn An' },
  { key: 'rank', header: 'Chức danh (mã hoặc tên)', example: 'CAPT' },
  { key: 'department', header: 'Bộ phận', example: 'DECK' },
  { key: 'dateOfBirth', header: 'Ngày sinh', example: '15/03/1985' },
  { key: 'placeOfBirth', header: 'Nơi sinh', example: 'Hải Phòng' },
  { key: 'idCardNumber', header: 'Số CCCD', example: '031085001234' },
  { key: 'seamanBookNumber', header: 'Số sổ thuyền viên', example: 'HP-123456' },
  { key: 'phoneNumber', header: 'Điện thoại', example: '0912345678' },
  { key: 'emailAddress', header: 'Email', example: 'an.nguyen@example.com' },
  { key: 'address', header: 'Địa chỉ' },
];

export const CrewListPage: React.FC = () => {
  const navigate = useNavigate();
  const ask = useConfirm();
  const { ranks } = useReferenceData();
  const { data: expiringCerts } = useExpiringCertificates(90);
  const { data: crewStats, refetch: refetchStats } = useCrewStats();
  const { vessels } = useVessels();

  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingCrew, setEditingCrew] = useState<CrewMember | null>(null);
  const [saving, setSaving] = useState(false);
  const [assignList, setAssignList] = useState<CrewMember[]>([]);

  const { markViewed, marking } = useMarkCrewChangesViewed(ids => {
    setCrew(prev => prev.map(m => (ids.includes(m.id) ? { ...m, edgeChangesViewed: true } : m)));
  });

  // Theo dõi chứng chỉ
  const [certDaysAhead, setCertDaysAhead] = useState(90);
  const [certVessel, setCertVessel] = useState('');
  const { data: certData, loading: certLoading } = useExpiringCertificates(certDaysAhead);

  const fetchCrew = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all: CrewMember[] = [];
      for (let page = 1; ; page++) {
        const res = await crewApi.getAll({ page, pageSize: FETCH_PAGE });
        all.push(...res.data);
        if (all.length >= res.totalCount || res.data.length === 0) break;
      }
      setCrew(all);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được danh sách thuyền viên');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCrew(); }, [fetchCrew]);

  const reload = () => { fetchCrew(); refetchStats(); };

  const handleCreate = async (data: CreateCrewRequest | Partial<CreateCrewRequest>) => {
    setSaving(true);
    try {
      await crewApi.create(data as CreateCrewRequest);
      setFormOpen(false); reload();
      toast.success('Đã thêm thuyền viên', { description: data.fullName });
    } catch (err) {
      toast.error('Không thể thêm thuyền viên', { description: err instanceof Error ? err.message : undefined });
    } finally { setSaving(false); }
  };

  const handleUpdate = async (data: CreateCrewRequest | Partial<CreateCrewRequest>) => {
    if (!editingCrew) return;
    setSaving(true);
    try {
      await crewApi.update(editingCrew.id, data);
      setEditingCrew(null); setFormOpen(false); reload();
      toast.success('Đã cập nhật thuyền viên', { description: data.fullName ?? editingCrew.fullName });
    } catch (err) {
      toast.error('Không thể cập nhật thuyền viên', { description: err instanceof Error ? err.message : undefined });
    } finally { setSaving(false); }
  };

  const handleDelete = async (m: CrewMember) => {
    if (!(await ask(`Xóa thuyền viên "${m.fullName}"?\nThao tác này không thể hoàn tác.`))) return;
    try {
      await crewApi.delete(m.id);
      reload();
      toast.success('Đã xóa thuyền viên', { description: `${m.crewId} — ${m.fullName}` });
    } catch (err) {
      toast.error('Không thể xóa thuyền viên', { description: err instanceof Error ? err.message : undefined });
    }
  };

  const handleUnassign = async (ids: string[]) => {
    setSaving(true);
    try {
      await Promise.all(ids.map(id => crewApi.unassignFromVessel(id)));
      setAssignList([]); reload();
      toast.success(`Đã rút ${ids.length} thuyền viên về bờ`);
    } catch (err) {
      toast.error('Không thể rút thuyền viên', { description: err instanceof Error ? err.message : undefined });
    } finally { setSaving(false); }
  };

  const openEdit = (m: CrewMember) => { setEditingCrew(m); setFormOpen(true); };
  const openNew = () => { setEditingCrew(null); setFormOpen(true); };

  const vesselMap = useMemo(() => new Map(vessels.map(v => [v.id, v.name])), [vessels]);
  const rankByText = useMemo(() => {
    const m = new Map<string, number>();
    ranks.forEach(r => { m.set(r.rankCode.toUpperCase(), r.id); m.set(r.rankName.toUpperCase(), r.id); });
    return m;
  }, [ranks]);

  const crewInView = useMemo(() => (
    view === 'onboard' ? crew.filter(m => m.isOnboard)
      : view === 'pool' ? crew.filter(m => !m.isOnboard)
        : crew
  ), [crew, view]);

  const unviewed = useMemo(() => crewInView.filter(hasEdgeChanges), [crewInView]);

  const markAllViewed = async () => {
    if (!(await ask(`Đánh dấu đã xem thay đổi từ tàu của ${unviewed.length} thuyền viên?\nNên mở hồ sơ kiểm tra trước nếu thay đổi quan trọng.`, { title: 'Đánh dấu đã xem', confirmLabel: 'Đã xem tất cả' }))) return;
    await markViewed(unviewed.map(m => m.id));
  };

  const certsInView = useMemo(
    () => (certVessel ? certData.filter(c => c.vesselId === certVessel) : certData),
    [certData, certVessel],
  );

  /* ── Cột bảng thuyền viên ── */
  const crewColumns: Column<CrewMember>[] = [
    {
      key: 'name', header: 'Thuyền viên', value: m => m.fullName,
      render: m => (
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft text-[11px] font-bold text-primary">
            {m.avatarUrl ? <ProtectedImage src={m.avatarUrl} alt="" className="h-full w-full object-cover" /> : getInitials(m.fullName)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-ink">{m.fullName}</span>
            <span className="block font-mono text-xs text-ink-muted">{m.crewId}</span>
          </span>
        </span>
      ),
    },
    { key: 'crewId', header: 'Mã TV', width: 110, value: m => m.crewId, render: m => <span className="font-mono">{m.crewId}</span> },
    { key: 'rank', header: 'Chức danh', width: 160, value: m => m.rankName ?? '' },
    { key: 'dept', header: 'Bộ phận', width: 110, value: m => m.department ?? '' },
    {
      key: 'vessel', header: 'Tàu', width: 170, value: m => m.vesselName ?? '',
      render: m => m.vesselName
        ? <span className="inline-flex items-center gap-1.5"><Ship className="h-3.5 w-3.5 text-accent" aria-hidden="true" />{m.vesselName}</span>
        : <span className="text-ink-light">—</span>,
    },
    {
      key: 'status', header: 'Trạng thái', width: 130, align: 'center', value: statusOf,
      render: m => {
        const s = statusOf(m);
        let changes = 0;
        if (hasEdgeChanges(m)) { try { changes = JSON.parse(m.edgeChanges!).length; } catch { /* bỏ qua */ } }
        return (
          <span className="inline-flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_TONE[s]}`}>
              <i className="h-1.5 w-1.5 rounded-full" />{s}
            </span>
            {changes > 0 && (
              <span className="rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-white" title={`${changes} thay đổi từ tàu chưa xem`}>{changes}</span>
            )}
          </span>
        );
      },
    },
    { key: 'embark', header: 'Ngày lên tàu', width: 115, align: 'center', value: m => m.embarkDate ?? '',
      filter: m => formatDateVi(m.embarkDate), exportValue: m => formatDateVi(m.embarkDate), render: m => formatDateVi(m.embarkDate) || '—' },
    { key: 'contract', header: 'Hết hợp đồng', width: 115, align: 'center', value: m => m.contractEnd ?? '',
      filter: m => formatDateVi(m.contractEnd), exportValue: m => formatDateVi(m.contractEnd), render: m => formatDateVi(m.contractEnd) || '—' },
    {
      key: 'actions', header: 'Thao tác', width: 170, align: 'center',
      render: m => (
        <TableActions>
          <TableIconButton label={`Xem hồ sơ ${m.fullName}`} icon={<Eye />} onClick={() => navigate(`/crew/${m.id}`)} />
          {hasEdgeChanges(m) && (
            <TableIconButton label={`Đánh dấu đã xem thay đổi của ${m.fullName}`} icon={<CheckCheck />} disabled={marking} onClick={() => markViewed([m.id])} />
          )}
          <TableIconButton label={`Sửa ${m.fullName}`} icon={<Pencil />} onClick={() => openEdit(m)} />
          {m.isOnboard && <TableIconButton label={`Rút ${m.fullName} về bờ`} icon={<Anchor />} onClick={() => setAssignList([m])} />}
          <TableIconButton label={`Xóa ${m.fullName}`} icon={<Trash2 />} variant="danger" onClick={() => handleDelete(m)} />
        </TableActions>
      ),
    },
  ];

  /* ── Cột bảng theo dõi chứng chỉ ── */
  const certColumns: Column<CrewCertificate>[] = [
    { key: 'crew', header: 'Thuyền viên', width: 200, value: c => c.crewMemberName ?? '', className: 'font-semibold' },
    { key: 'vessel', header: 'Tàu', width: 160, value: c => (c.vesselId && vesselMap.get(c.vesselId)) || '' },
    { key: 'cert', header: 'Chứng chỉ', value: c => c.certificateName || c.certificateCode || '' },
    { key: 'number', header: 'Số chứng chỉ', width: 150, value: c => c.certificateNumber ?? '', className: 'font-mono' },
    { key: 'issue', header: 'Ngày cấp', width: 110, align: 'center', value: c => c.issueDate ?? '',
      filter: c => formatDateVi(c.issueDate), exportValue: c => formatDateVi(c.issueDate), render: c => formatDateVi(c.issueDate) || '—' },
    { key: 'expiry', header: 'Ngày hết hạn', width: 115, align: 'center', value: c => c.expiryDate ?? '',
      filter: c => formatDateVi(c.expiryDate), exportValue: c => formatDateVi(c.expiryDate), render: c => formatDateVi(c.expiryDate) || '—' },
    {
      key: 'days', header: 'Còn lại (ngày)', width: 110, numeric: true, filter: false, value: c => c.daysUntilExpiry ?? null,
      render: c => c.daysUntilExpiry === undefined ? '—'
        : <span className={c.daysUntilExpiry <= 0 ? 'font-semibold text-red-700' : c.daysUntilExpiry <= 30 ? 'font-semibold text-amber-700' : ''}>
          {c.daysUntilExpiry <= 0 ? 'Quá hạn' : c.daysUntilExpiry}
        </span>,
    },
    {
      key: 'status', header: 'Trạng thái', width: 125, align: 'center', value: c => CERT_STATUS[c.status ?? '']?.label ?? c.status ?? '',
      render: c => {
        const s = CERT_STATUS[c.status ?? ''];
        return s ? <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${s.tone}`}>{s.label}</span> : (c.status ?? '—');
      },
    },
  ];

  return (
    <div>
      <PageHeader
        icon={<Users />}
        title="Quản lý thuyền viên"
        description="Hồ sơ thuyền viên toàn đội tàu. Bấm vào một dòng để mở hồ sơ chi tiết."
      />

      <QuickFilterBar<View>
        active={view}
        onChange={setView}
        items={[
          { key: 'all', label: 'Tổng', count: crewStats.total || crew.length, icon: <Users /> },
          { key: 'onboard', label: 'Trên tàu', count: crewStats.onboard, icon: <UserCheck />, tone: 'text-emerald-600' },
          { key: 'pool', label: 'Ở bờ', count: crewStats.pool, icon: <UserMinus />, tone: 'text-slate-500' },
          { key: 'certificates', label: 'Chứng chỉ sắp hết hạn', count: expiringCerts.length, icon: <ShieldAlert />, tone: 'text-amber-600' },
        ]}
      />
      {crewStats.pendingReview > 0 && view !== 'certificates' && (
        <p className="-mt-1 mb-3 flex items-center gap-1.5 text-[13px] text-amber-700">
          <Clock className="h-4 w-4" aria-hidden="true" /> {crewStats.pendingReview} thuyền viên đang chờ duyệt lên tàu.
        </p>
      )}

      {view !== 'certificates' && unviewed.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] font-medium text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">
            {unviewed.length} thuyền viên có thay đổi từ tàu chưa xem (số màu cam ở cột Trạng thái). Mở hồ sơ để xem từng thay đổi,
            hoặc bấm nút ✓✓ ở cột Thao tác.
          </span>
          <Button size="sm" icon={<CheckCheck className="h-4 w-4" />} loading={marking} onClick={markAllViewed}>
            Đã xem tất cả ({unviewed.length})
          </Button>
        </div>
      )}

      {view !== 'certificates' ? (
        <DataTable
          key="crew"
          columns={crewColumns}
          data={crewInView}
          rowKey={m => m.id}
          loading={loading}
          error={error}
          itemLabel="thuyền viên"
          emptyMessage="Chưa có thuyền viên nào."
          searchPlaceholder="Tìm theo tên, mã, chức danh, tàu..."
          exportOptions={{ fileName: 'danh-sach-thuyen-vien', title: 'DANH SÁCH THUYỀN VIÊN' }}
          onImport={() => setShowImport(true)}
          onAdd={openNew}
          addLabel="Thêm thuyền viên"
          onRowClick={m => navigate(`/crew/${m.id}`)}
          minWidth={1220}
        />
      ) : (
        <DataTable
          key="certificates"
          columns={certColumns}
          data={certsInView}
          rowKey={c => c.id}
          loading={certLoading}
          itemLabel="chứng chỉ"
          emptyMessage="Không có chứng chỉ nào trong khoảng thời gian này."
          searchPlaceholder="Tìm chứng chỉ, thuyền viên, số chứng chỉ..."
          exportOptions={{ fileName: 'chung-chi-sap-het-han', title: 'CHỨNG CHỈ SẮP HẾT HẠN' }}
          onRowClick={c => c.crewMemberId && navigate(`/crew/${c.crewMemberId}`)}
          minWidth={1180}
          toolbarLeft={
            <>
              <select aria-label="Lọc theo tàu" value={certVessel} onChange={e => setCertVessel(e.target.value)} className={`${fieldClass} h-9 w-auto py-1`}>
                <option value="">Tất cả tàu</option>
                {vessels.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
              <select aria-label="Khoảng thời gian" value={certDaysAhead} onChange={e => setCertDaysAhead(Number(e.target.value))} className={`${fieldClass} h-9 w-auto py-1`}>
                <option value={30}>Hết hạn trong 30 ngày</option>
                <option value={60}>Hết hạn trong 60 ngày</option>
                <option value={90}>Hết hạn trong 90 ngày</option>
                <option value={180}>Hết hạn trong 180 ngày</option>
                <option value={365}>Hết hạn trong 1 năm</option>
              </select>
            </>
          }
        />
      )}

      {formOpen && (
        <CrewFormModal
          crew={editingCrew}
          onClose={() => { setFormOpen(false); setEditingCrew(null); }}
          onSubmit={editingCrew ? handleUpdate : handleCreate}
          saving={saving}
        />
      )}

      {assignList.length > 0 && (
        <AssignShipModal
          crewMembers={assignList}
          mode="unassign"
          onClose={() => setAssignList([])}
          onAssign={async () => { /* Gán lên tàu làm ở Chi tiết tàu → tab Thuyền viên */ }}
          onUnassign={handleUnassign}
          saving={saving}
        />
      )}

      <ImportExcelModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        title="Import danh sách thuyền viên"
        note="Chức danh ghi mã (CAPT) hoặc tên (Thuyền trưởng) đúng như danh mục. Ngày ghi dd/mm/yyyy. Mã thuyền viên đã có sẽ báo lỗi ở dòng đó."
        templateName="mau-import-thuyen-vien"
        fields={IMPORT_FIELDS}
        importRow={row => {
          const rankId = row.rank ? rankByText.get(row.rank.trim().toUpperCase()) : undefined;
          if (row.rank && rankId === undefined) return Promise.reject(new Error(`Không có chức danh "${row.rank}" trong danh mục`));
          return crewApi.create({
            crewId: row.crewId,
            fullName: row.fullName,
            rankId,
            department: row.department || undefined,
            dateOfBirth: parseImportDate(row.dateOfBirth) || undefined,
            placeOfBirth: row.placeOfBirth || undefined,
            idCardNumber: row.idCardNumber || undefined,
            seamanBookNumber: row.seamanBookNumber || undefined,
            phoneNumber: row.phoneNumber || undefined,
            emailAddress: row.emailAddress || undefined,
            address: row.address || undefined,
          });
        }}
        onDone={reload}
      />
    </div>
  );
};
