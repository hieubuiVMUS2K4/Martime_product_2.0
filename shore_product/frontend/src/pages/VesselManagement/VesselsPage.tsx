import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Ship, Plus, RefreshCw, Pencil, Trash2, AlertTriangle, Loader2, Search,
  ExternalLink, FileText, Map, Settings, Users, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { ENV } from '../../config/env';
import { ProvisioningModal } from './ProvisioningModal';
import { Button, DateInput, Field, Input, Modal, PageHeader, Select, useConfirm } from '../../components/common';

// ============================================================
// Types
// ============================================================
interface VesselPosition {
  latitude: number;
  longitude: number;
  speed?: number;
  course?: number;
  timestamp: string;
}

interface Vessel {
  id: string;
  imo: string;
  name: string;
  callSign: string;
  vesselType: string;
  grossTonnage: number;
  deadWeight: number;
  buildDate: string;
  flag: string;
  isActive: boolean;
  lastPosition?: VesselPosition;
  unacknowledgedAlerts: number;
  provisioningStatus?: string;
}

interface VesselSummary {
  vesselId: string;
  imo: string;
  crewTotal: number;
  crewOnboard: number;
  reportsTotal: number;
  lastSyncAt?: string;
}

interface VesselFormData {
  imo: string;
  name: string;
  callSign: string;
  vesselType: string;
  grossTonnage: number;
  deadWeight: number;
  buildDate: string;
  flag: string;
  isActive: boolean;
}

const EMPTY_FORM: VesselFormData = {
  imo: '',
  name: '',
  callSign: '',
  vesselType: 'Bulk Carrier',
  grossTonnage: 0,
  deadWeight: 0,
  buildDate: '',
  flag: 'Vietnam',
  isActive: true,
};

const VESSEL_TYPES = [
  'Bulk Carrier', 'Container Ship', 'Tanker', 'General Cargo',
  'RoRo', 'LNG Carrier', 'LPG Carrier', 'Passenger Ship', 'Tug', 'Other'
];

const FLAGS = [
  'Vietnam', 'Panama', 'Liberia', 'Marshall Islands', 'Bahamas',
  'Singapore', 'Malta', 'Cyprus', 'Hong Kong', 'Other'
];

/** Trạng thái kết nối Edge của tàu (gói cấu hình đã cấp, tàu đã liên lạc...). */
const PROVISIONING: Record<string, { label: string; tone: string }> = {
  Active:              { label: 'Đang kết nối',   tone: 'bg-emerald-50 text-emerald-700 [&>i]:bg-emerald-500' },
  Registered:          { label: 'Đã đăng ký',     tone: 'bg-emerald-50 text-emerald-700 [&>i]:bg-emerald-500' },
  Provisioned:         { label: 'Đã cấp gói',     tone: 'bg-sky-50 text-sky-700 [&>i]:bg-sky-500' },
  PendingFirstContact: { label: 'Chờ kết nối',    tone: 'bg-sky-50 text-sky-700 [&>i]:bg-sky-500' },
  Downloaded:          { label: 'Cần import lại', tone: 'bg-amber-50 text-amber-700 [&>i]:bg-amber-500' },
  Revoked:             { label: 'Đã thu hồi',     tone: 'bg-red-50 text-red-700 [&>i]:bg-red-500' },
  Disabled:            { label: 'Đã vô hiệu',     tone: 'bg-red-50 text-red-700 [&>i]:bg-red-500' },
  Unknown:             { label: 'Chưa cấu hình',  tone: 'bg-slate-100 text-slate-600 [&>i]:bg-slate-400' },
};

const formatSync = (iso?: string) => {
  if (!iso) return null;
  const d = new Date(iso);
  return `${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`;
};

// ============================================================
// API helpers
// ============================================================
const BASE = ENV.API_BASE_URL;

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status}: ${body || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ============================================================
// Thẻ một tàu
// ============================================================
const InfoItem: React.FC<{ label: string; value: React.ReactNode; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="min-w-0">
    <dt className="text-xs font-medium text-ink-muted">{label}</dt>
    <dd className={`truncate text-[13px] font-semibold text-ink ${mono ? 'font-mono' : ''}`}>{value || '—'}</dd>
  </div>
);

const CardAction: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }> = ({ icon, label, onClick, danger }) => (
  <button
    type="button"
    onClick={e => { e.stopPropagation(); onClick(); }}
    className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 border-r border-grid py-2 text-[13px] font-medium transition-colors last:border-r-0 [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0 ${
      danger ? 'text-red-600 hover:bg-danger-soft' : 'text-ink-muted hover:bg-primary-soft hover:text-primary'
    }`}
  >
    {icon}<span className="truncate">{label}</span>
  </button>
);

const VesselCard: React.FC<{
  vessel: Vessel;
  summary?: VesselSummary;
  onOpen: () => void;
  onEdit: () => void;
  onProvision: () => void;
  onDelete: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}> = ({ vessel: v, summary, onOpen, onEdit, onProvision, onDelete, onContextMenu }) => {
  const prov = PROVISIONING[v.provisioningStatus ?? 'Unknown'] ?? { label: v.provisioningStatus ?? '', tone: PROVISIONING.Unknown.tone };
  const sync = formatSync(summary?.lastSyncAt);

  return (
    <article
      role="link"
      tabIndex={0}
      aria-label={`Mở chi tiết tàu ${v.name}`}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter') onOpen(); }}
      onContextMenu={onContextMenu}
      className={`group flex min-w-0 cursor-pointer flex-col overflow-hidden rounded-md border bg-surface transition-colors hover:border-accent/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
        v.isActive ? 'border-grid-strong' : 'border-dashed border-grid-strong opacity-80'
      }`}
    >
      {/* Đầu thẻ: tên, IMO, trạng thái kết nối */}
      <header className="flex items-start gap-3 border-b border-grid px-3.5 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-white">
          <Ship className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-bold leading-5 text-ink group-hover:text-primary" title={v.name}>{v.name}</h3>
          <p className="font-mono text-xs text-ink-muted">IMO {v.imo}</p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${prov.tone}`}>
          <i className="h-1.5 w-1.5 rounded-full" />{prov.label}
        </span>
      </header>

      {/* Thông số chính */}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-3.5 py-3">
        <InfoItem label="Call sign" value={v.callSign} mono />
        <InfoItem label="Loại tàu" value={v.vesselType} />
        <InfoItem label="Quốc tịch" value={v.flag} />
        {v.grossTonnage
          ? <InfoItem label="Tổng dung tích (GT)" value={v.grossTonnage.toLocaleString('vi-VN')} />
          : <InfoItem label="Trọng tải (DWT)" value={v.deadWeight ? `${v.deadWeight.toLocaleString('vi-VN')} t` : null} />}
      </dl>

      {/* Tình trạng: thuyền viên, đồng bộ, cảnh báo */}
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-grid bg-canvas/60 px-3.5 py-2 text-xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5" title="Thuyền viên đang trên tàu">
          <Users className="h-3.5 w-3.5" aria-hidden="true" />
          <strong className="text-ink">{summary?.crewOnboard ?? 0}</strong> thuyền viên
        </span>
        <span className="inline-flex items-center gap-1.5" title="Lần đồng bộ gần nhất với tàu">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {sync ? <>Đồng bộ {sync}</> : 'Chưa đồng bộ'}
        </span>
        {v.unacknowledgedAlerts > 0 && (
          <span className="inline-flex items-center gap-1 font-semibold text-red-700">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> {v.unacknowledgedAlerts} cảnh báo
          </span>
        )}
      </div>

      {/* Thao tác */}
      <footer className="flex border-t border-grid">
        <CardAction icon={<FileText />} label="Chi tiết" onClick={onOpen} />
        <CardAction icon={<Pencil />} label="Sửa" onClick={onEdit} />
        <CardAction icon={<Settings />} label="Cấu hình" onClick={onProvision} />
        <CardAction icon={<Trash2 />} label="Xóa" onClick={onDelete} danger />
      </footer>
    </article>
  );
};

// ============================================================
// Main Page
// ============================================================
export const VesselsPage: React.FC = () => {
  const navigate = useNavigate();
  const ask = useConfirm();
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [summaries, setSummaries] = useState<Record<string, VesselSummary>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Lọc
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [flagFilter, setFlagFilter] = useState('');

  // Modal thêm/sửa
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVessel, setEditingVessel] = useState<Vessel | null>(null);
  const [formData, setFormData] = useState<VesselFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Menu chuột phải
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; vessel: Vessel } | null>(null);

  // Cấu hình kết nối Edge
  const [provisionTarget, setProvisionTarget] = useState<Vessel | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, vessel: Vessel) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, vessel });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  useEffect(() => {
    if (!contextMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeContextMenu(); };
    window.addEventListener('click', closeContextMenu);
    window.addEventListener('scroll', closeContextMenu, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', closeContextMenu);
      window.removeEventListener('scroll', closeContextMenu, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu, closeContextMenu]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const [vesselsData, summaryData] = await Promise.allSettled([
        apiRequest<Vessel[]>(`${BASE}/vessels`),
        apiRequest<VesselSummary[]>(`${BASE}/vessels/fleet-summary`),
      ]);
      if (vesselsData.status === 'fulfilled') setVessels(vesselsData.value ?? []);
      else throw new Error(vesselsData.reason?.message ?? 'Không thể tải danh sách tàu');
      if (summaryData.status === 'fulfilled') {
        const m: Record<string, VesselSummary> = {};
        for (const s of summaryData.value ?? []) m[s.imo] = s;
        setSummaries(m);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Bộ lọc chỉ liệt kê loại tàu / quốc tịch đang có trong đội tàu.
  const typeOptions = useMemo(() => [...new Set(vessels.map(v => v.vesselType).filter(Boolean))].sort(), [vessels]);
  const flagOptions = useMemo(() => [...new Set(vessels.map(v => v.flag).filter(Boolean))].sort(), [vessels]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vessels.filter(v =>
      (!q || v.name.toLowerCase().includes(q) || v.imo.toLowerCase().includes(q) || (v.callSign ?? '').toLowerCase().includes(q)) &&
      (!typeFilter || v.vesselType === typeFilter) &&
      (!flagFilter || v.flag === flagFilter)
    );
  }, [vessels, search, typeFilter, flagFilter]);

  const hasFilter = !!(search || typeFilter || flagFilter);
  const clearFilters = () => { setSearch(''); setTypeFilter(''); setFlagFilter(''); };

  const openCreate = () => { setEditingVessel(null); setFormData(EMPTY_FORM); setFormError(null); setModalOpen(true); };
  const openEdit = (v: Vessel) => {
    setEditingVessel(v);
    setFormData({ imo: v.imo, name: v.name, callSign: v.callSign, vesselType: v.vesselType, grossTonnage: v.grossTonnage, deadWeight: v.deadWeight, buildDate: v.buildDate?.slice(0, 10) ?? '', flag: v.flag, isActive: v.isActive });
    setFormError(null);
    setModalOpen(true);
  };
  const setField = <K extends keyof VesselFormData>(k: K, val: VesselFormData[K]) => setFormData(p => ({ ...p, [k]: val }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.buildDate) { setFormError('Chưa nhập ngày đóng tàu.'); return; }
    setSaving(true); setFormError(null);
    try {
      // Sửa qua API thông số: lưu ở bờ và gửi các trường đổi xuống tàu (IMO không đổi được).
      if (editingVessel) await apiRequest(`${BASE}/vessels/${editingVessel.id}/particulars`, { method: 'PUT', body: JSON.stringify(formData) });
      else await apiRequest(`${BASE}/vessels`, { method: 'POST', body: JSON.stringify(formData) });
      setModalOpen(false);
      toast.success(editingVessel ? 'Đã cập nhật tàu' : 'Đã thêm tàu', { description: `${formData.name} — IMO ${formData.imo}` });
      fetchData();
    } catch (err) { setFormError(err instanceof Error ? err.message : 'Lưu thất bại'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (v: Vessel) => {
    if (!(await ask(`Xóa tàu "${v.name}" (IMO ${v.imo})?\nThao tác này không thể hoàn tác.`))) return;
    try {
      await apiRequest(`${BASE}/vessels/${v.id}`, { method: 'DELETE' });
      toast.success('Đã xóa tàu', { description: `${v.name} — IMO ${v.imo}` });
      fetchData();
    } catch (err) {
      toast.error('Không thể xóa tàu', { description: err instanceof Error ? err.message : undefined });
    }
  };

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="px-6 py-5">
      <PageHeader
        icon={<Ship />}
        title="Danh sách tàu"
        description="Đội tàu đang quản lý. Bấm vào một tàu để mở chi tiết, chuột phải để có thêm thao tác."
        actions={
          <>
            <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={fetchData} disabled={loading}>Làm mới</Button>
            <Button variant="secondary" icon={<Map className="h-4 w-4" />} onClick={() => navigate('/vessels/tracking')}>Theo dõi tàu</Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={openCreate}>Thêm tàu</Button>
          </>
        }
      />

      {/* Thanh tìm kiếm & lọc */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-grid-strong bg-surface px-3 py-2.5">
        <label className="relative w-full max-w-[360px]">
          <span className="sr-only">Tìm tàu</span>
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-light" aria-hidden="true" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo tên tàu, IMO, call sign..."
            className="h-9 w-full rounded-md border border-line bg-surface pl-8 pr-3 text-sm text-ink placeholder:text-ink-light focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
        </label>
        <select aria-label="Lọc theo loại tàu" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={filterSelect}>
          <option value="">Tất cả loại tàu</option>
          {typeOptions.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select aria-label="Lọc theo quốc tịch" value={flagFilter} onChange={e => setFlagFilter(e.target.value)} className={filterSelect}>
          <option value="">Tất cả quốc tịch</option>
          {flagOptions.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <span className="text-[13px] font-semibold text-ink" aria-live="polite">
          {loading ? 'Đang tải...' : hasFilter ? `${filtered.length} / ${vessels.length} tàu` : `${vessels.length} tàu`}
        </span>
        {hasFilter && (
          <button type="button" onClick={clearFilters} className="text-[13px] font-medium text-primary hover:underline">Bỏ lọc</button>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{error}</span>
          <Button size="sm" variant="secondary" onClick={fetchData}>Thử lại</Button>
        </div>
      )}

      {/* Lưới tàu: luôn 4 cột */}
      {loading && vessels.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-ink-muted">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Đang tải danh sách đội tàu...
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-grid-strong bg-surface py-16 text-[13px] text-ink-muted">
          <Ship className="h-7 w-7 text-ink-light" aria-hidden="true" />
          {hasFilter ? 'Không có tàu nào khớp bộ lọc.' : 'Chưa có tàu nào. Bấm "Thêm tàu" để bắt đầu.'}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-3">
          {filtered.map(v => (
            <VesselCard
              key={v.id}
              vessel={v}
              summary={summaries[v.imo]}
              onOpen={() => navigate(`/vessels/${v.id}`)}
              onEdit={() => openEdit(v)}
              onProvision={() => setProvisionTarget(v)}
              onDelete={() => handleDelete(v)}
              onContextMenu={e => handleContextMenu(e, v)}
            />
          ))}
        </div>
      )}

      {/* Thêm / sửa tàu */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        icon={<Ship />}
        title={editingVessel ? 'Chỉnh sửa tàu' : 'Thêm tàu mới'}
        subtitle={editingVessel ? `${editingVessel.name} — IMO ${editingVessel.imo}` : 'Thông tin cơ bản của tàu. Thông số chi tiết nhập ở trang chi tiết tàu.'}
        size="md"
        busy={saving}
        closeOnBackdrop={false}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>Hủy</Button>
            <Button type="submit" form="vessel-form" loading={saving}>{editingVessel ? 'Lưu thay đổi' : 'Thêm tàu'}</Button>
          </>
        }
      >
        <form id="vessel-form" onSubmit={handleSave} className="grid grid-cols-2 gap-4">
          {formError && (
            <div className="col-span-2 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {formError}
            </div>
          )}
          <div className="col-span-2">
            <Input label="Tên tàu" required value={formData.name} onChange={e => setField('name', e.target.value)} placeholder="VD: MV PIONEER STAR" />
          </div>
          <Input label="Số IMO" required value={formData.imo} onChange={e => setField('imo', e.target.value)} placeholder="7 chữ số"
            disabled={!!editingVessel} hint={editingVessel ? 'Không đổi được sau khi tạo.' : undefined} />
          <Input label="Call sign" required value={formData.callSign} onChange={e => setField('callSign', e.target.value)} placeholder="VD: XVAB1" />
          <Select label="Loại tàu" required value={formData.vesselType} onChange={e => setField('vesselType', e.target.value)}
            options={VESSEL_TYPES.map(t => ({ value: t, label: t }))} />
          <Select label="Quốc tịch (cờ)" required value={formData.flag} onChange={e => setField('flag', e.target.value)}
            options={FLAGS.map(f => ({ value: f, label: f }))} />
          <Input label="Tổng dung tích (GT)" type="number" min={0} value={formData.grossTonnage} onChange={e => setField('grossTonnage', +e.target.value)} />
          <Input label="Trọng tải (DWT)" type="number" min={0} value={formData.deadWeight} onChange={e => setField('deadWeight', +e.target.value)} />
          <Field label="Ngày đóng tàu" required>
            <DateInput value={formData.buildDate} onChange={iso => setField('buildDate', iso)} />
          </Field>
          {editingVessel && (
            <label className="flex cursor-pointer items-center gap-2 self-end pb-2 text-sm text-ink">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={formData.isActive} onChange={e => setField('isActive', e.target.checked)} />
              Đang hoạt động
            </label>
          )}
        </form>
      </Modal>

      {/* Menu chuột phải */}
      {contextMenu && (
        <div
          role="menu"
          className="fixed z-50 w-56 overflow-hidden rounded-md border border-line bg-surface py-1 text-[13px] shadow-lg"
          style={{ left: Math.min(contextMenu.x, window.innerWidth - 232), top: Math.min(contextMenu.y, window.innerHeight - 220) }}
          onClick={e => e.stopPropagation()}
        >
          <MenuItem icon={<FileText />} label="Xem chi tiết" onClick={() => { navigate(`/vessels/${contextMenu.vessel.id}`); closeContextMenu(); }} />
          <MenuItem icon={<ExternalLink />} label="Mở trong tab mới" onClick={() => { window.open(`/vessels/${contextMenu.vessel.id}`, '_blank'); closeContextMenu(); }} />
          <div className="my-1 border-t border-grid" />
          <MenuItem icon={<Pencil />} label="Chỉnh sửa" onClick={() => { openEdit(contextMenu.vessel); closeContextMenu(); }} />
          <MenuItem icon={<Settings />} label="Cấu hình kết nối Edge" onClick={() => { setProvisionTarget(contextMenu.vessel); closeContextMenu(); }} />
          <div className="my-1 border-t border-grid" />
          <MenuItem icon={<Trash2 />} label="Xóa tàu" danger onClick={() => { const v = contextMenu.vessel; closeContextMenu(); handleDelete(v); }} />
        </div>
      )}

      {/* Cấu hình kết nối Edge */}
      {provisionTarget && (
        <ProvisioningModal
          vesselId={provisionTarget.id}
          vesselName={provisionTarget.name}
          imo={provisionTarget.imo}
          provisioningStatus={provisionTarget.provisioningStatus}
          onChanged={fetchData}
          onClose={() => setProvisionTarget(null)}
        />
      )}
    </div>
  );
};

const filterSelect =
  'h-9 rounded-md border border-line bg-surface px-2.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25';

const MenuItem: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }> = ({ icon, label, onClick, danger }) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    className={`flex w-full items-center gap-2 px-3 py-2 text-left [&>svg]:h-4 [&>svg]:w-4 ${
      danger ? 'text-red-600 hover:bg-danger-soft' : 'text-ink hover:bg-primary-soft'
    }`}
  >
    {icon}{label}
  </button>
);
