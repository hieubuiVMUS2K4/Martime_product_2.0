import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Ship, Plus, RefreshCw, Pencil, Trash2,
  AlertTriangle,
  X, Loader2,
  ExternalLink, FileText, Map, Settings
} from 'lucide-react';
import { ENV } from '../../config/env';
import { ProvisioningModal } from './ProvisioningModal';
import './VesselsPage.css';
import { toast } from 'sonner';

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

const PROVISIONING_LABELS: Record<string, string> = {
  Unknown: 'Unknown',
  Provisioned: 'Provisioned',
  Downloaded: 'Needs Re-import',
  PendingFirstContact: 'Pending Contact',
  Registered: 'Registered',
  Active: 'Active',
  Revoked: 'Revoked',
  Disabled: 'Disabled',
};

const getProvisioningBadgeClass = (status?: string) => {
  switch (status) {
    case 'Active':
    case 'Registered':
      return 'vp-provision-badge--ok';
    case 'Provisioned':
    case 'PendingFirstContact':
      return 'vp-provision-badge--pending';
    case 'Downloaded':
      return 'vp-provision-badge--needs-import';
    case 'Revoked':
    case 'Disabled':
      return 'vp-provision-badge--blocked';
    default:
      return 'vp-provision-badge--unknown';
  }
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
// Main Page
// ============================================================
export const VesselsPage: React.FC = () => {
  const navigate = useNavigate();
  const [vessels, setVessels] = useState<Vessel[]>([]);
  const [, setSummaries] = useState<Record<string, VesselSummary>>({})
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-column filters
  const [colF, setColF] = useState({ name: '', imo: '', type: '', flag: '' });

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVessel, setEditingVessel] = useState<Vessel | null>(null);
  const [formData, setFormData] = useState<VesselFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Vessel | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Context menu
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; vessel: Vessel } | null>(null);
  const [selectedVesselId, setSelectedVesselId] = useState<string | null>(null);

  // Provisioning
  const [provisionTarget, setProvisionTarget] = useState<Vessel | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, vessel: Vessel) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, vessel });
    setSelectedVesselId(vessel.id);
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setSelectedVesselId(null);
  }, []);

  useEffect(() => {
    const handler = () => closeContextMenu();
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [closeContextMenu]);

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

  const filtered = useMemo(() => vessels.filter(v =>
    (!colF.name || v.name.toLowerCase().includes(colF.name.toLowerCase())) &&
    (!colF.imo  || v.imo.toLowerCase().includes(colF.imo.toLowerCase()) || v.callSign.toLowerCase().includes(colF.imo.toLowerCase())) &&
    (!colF.type || v.vesselType.toLowerCase().includes(colF.type.toLowerCase())) &&
    (!colF.flag || (v.flag ?? '').toLowerCase().includes(colF.flag.toLowerCase()))
  ), [vessels, colF]);

  const cf = (k: keyof typeof colF, v: string) => setColF(p => ({ ...p, [k]: v }));

  const openCreate = () => { setEditingVessel(null); setFormData(EMPTY_FORM); setFormError(null); setModalOpen(true); };
  const openEdit = (v: Vessel) => {
    setEditingVessel(v);
    setFormData({ imo: v.imo, name: v.name, callSign: v.callSign, vesselType: v.vesselType, grossTonnage: v.grossTonnage, deadWeight: v.deadWeight, buildDate: v.buildDate?.slice(0, 10) ?? '', flag: v.flag, isActive: v.isActive });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setFormError(null);
    try {
      if (editingVessel) await apiRequest(`${BASE}/vessels/${editingVessel.id}`, { method: 'PUT', body: JSON.stringify(formData) });
      else await apiRequest(`${BASE}/vessels`, { method: 'POST', body: JSON.stringify(formData) });
      setModalOpen(false); fetchData();
    } catch (err) { setFormError(err instanceof Error ? err.message : 'Lưu thất bại'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return; setDeleting(true);
    try {
      await apiRequest(`${BASE}/vessels/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null); fetchData();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Xóa thất bại'); }
    finally { setDeleting(false); }
  };

  // ============================================================
  // Render
  // ============================================================
  if (loading) return (
    <div className="vp-page">
      <div className="vp-loading"><Loader2 size={28} className="spin" /><p>Đang tải danh sách đội tàu...</p></div>
    </div>
  );

  return (
    <div className="vp-page">

      {/*  Page header  */}
      <div className="vp-header">
        <div className="vp-header-left">
          <Ship size={18} className="vp-header-icon" />
          <h1 className="vp-title">Danh sách tàu</h1>
          <span className="vp-count-badge">{vessels.length}</span>
        </div>
        <div className="vp-header-right">
          <button className="vp-btn vp-btn--ghost" onClick={fetchData} title="Làm mới"><RefreshCw size={14} /></button>
          <button className="vp-btn vp-btn--outline" onClick={() => navigate('/vessels/tracking')} title="Bản đồ tracking">
            <Map size={14} /> Tracking
          </button>
          <button className="vp-btn vp-btn--primary" onClick={openCreate}><Plus size={14} /> Thêm tàu</button>
        </div>
      </div>

      {/*  Error  */}
      {error && (
        <div className="vp-error">
          <AlertTriangle size={14} /> {error}
          <button className="vp-link-btn" onClick={fetchData}>Thử lại</button>
        </div>
      )}

      {/*  Search Bar  */}
      <div className="vp-search-bar">
        <div className="vp-search-field">
          <input
            className="vp-search-input"
            placeholder="Tìm theo tên tàu, IMO, call sign..."
            value={colF.name || colF.imo}
            onChange={e => { cf('name', e.target.value); cf('imo', e.target.value); }}
          />
        </div>
        <div className="vp-search-filters">
          <select className="vp-select-filter" value={colF.type} onChange={e => cf('type', e.target.value)}>
            <option value="">Tất cả loại tàu</option>
            {VESSEL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="vp-select-filter" value={colF.flag} onChange={e => cf('flag', e.target.value)}>
            <option value="">Tất cả cờ</option>
            {FLAGS.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
      </div>

      {/*  Vessel Cards Grid  */}
      <div className="vp-card-grid">
        {filtered.length === 0 ? (
          <div className="vp-empty">
            <Ship size={32} />
            <p>Không tìm thấy tàu nào</p>
          </div>
        ) : filtered.map((v) => (
            <div
              key={v.id}
              className="vp-card"
              onContextMenu={(e) => handleContextMenu(e, v)}
              onClick={() => navigate(`/vessels/${v.id}`)}
            >
              {/* Card header */}
              <div className="vp-card-head">
                <div className="vp-card-head-left">
                  <div className="vp-card-avatar">
                    <Ship size={18} />
                  </div>
                  <div>
                    <h3 className="vp-card-name">{v.name}</h3>
                    <span className="vp-card-imo">{v.imo}</span>
                  </div>
                </div>
                <div className="vp-card-head-right">
                  <span className={`vp-provision-badge ${getProvisioningBadgeClass(v.provisioningStatus)}`}>
                    {PROVISIONING_LABELS[v.provisioningStatus ?? 'Unknown'] ?? v.provisioningStatus}
                  </span>
                </div>
              </div>

              {/* Card body */}
              <div className="vp-card-body">
                <div className="vp-card-info">
                  <div className="vp-card-info-item">
                    <span className="vp-card-info-label">Call Sign</span>
                    <span className="vp-card-info-value">{v.callSign || '—'}</span>
                  </div>
                  <div className="vp-card-info-item">
                    <span className="vp-card-info-label">Loại tàu</span>
                    <span className="vp-card-info-value">{v.vesselType || '—'}</span>
                  </div>
                  <div className="vp-card-info-item">
                    <span className="vp-card-info-label">Quốc tịch</span>
                    <span className="vp-card-info-value">{v.flag || '—'}</span>
                  </div>
                  <div className="vp-card-info-item">
                    <span className="vp-card-info-label">{v.grossTonnage ? 'GT' : 'DWT'}</span>
                    <span className="vp-card-info-value">{v.grossTonnage ? `${v.grossTonnage.toLocaleString()}` : v.deadWeight ? `${v.deadWeight.toLocaleString()} t` : '—'}</span>
                  </div>
                </div>
                {v.unacknowledgedAlerts > 0 && (
                  <div className="vp-card-alert">
                    <AlertTriangle size={12} />
                    <span>{v.unacknowledgedAlerts} cảnh báo chưa xử lý</span>
                  </div>
                )}
              </div>

              {/* Card footer */}
              <div className="vp-card-footer">
                <button
                  className="vp-card-action"
                  onClick={(e) => { e.stopPropagation(); navigate(`/vessels/${v.id}`); }}
                >
                  <FileText size={12} /> Chi tiết
                </button>
                <button
                  className="vp-card-action"
                  onClick={(e) => { e.stopPropagation(); openEdit(v); }}
                >
                  <Pencil size={12} /> Sửa
                </button>
                <button
                  className="vp-card-action"
                  onClick={(e) => { e.stopPropagation(); setProvisionTarget(v); }}
                >
                  <Settings size={12} /> Cấu hình
                </button>
                <button
                  className="vp-card-action vp-card-action--danger"
                  onClick={(e) => { e.stopPropagation(); setDeleteTarget(v); }}
                >
                  <Trash2 size={12} /> Xóa
                </button>
              </div>
            </div>
        ))}
      </div>

      {/* Footer */}
      <div className="vp-footer">Hiển thị {filtered.length} / {vessels.length} tàu</div>

      {/*  Add/Edit Modal  */}
      {modalOpen && (
        <div className="vp-overlay" onClick={() => setModalOpen(false)}>
          <div className="vp-modal" onClick={e => e.stopPropagation()}>
            <div className="vp-modal-head">
              <h2>{editingVessel ? 'Chỉnh sửa tàu' : 'Thêm tàu mới'}</h2>
              <button className="vp-icon-btn" onClick={() => setModalOpen(false)}><X size={15} /></button>
            </div>
            {formError && <div className="vp-form-error"><AlertTriangle size={12} /> {formError}</div>}
            <form className="vp-form" onSubmit={handleSave}>
              <div className="vp-form-grid">
                <div className="vp-field vp-field--full">
                  <label>Tên tàu <span className="req">*</span></label>
                  <input required value={formData.name} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} placeholder="VD: MV PIONEER STAR" />
                </div>
                <div className="vp-field">
                  <label>Số IMO <span className="req">*</span></label>
                  <input required value={formData.imo} onChange={e => setFormData(p => ({ ...p, imo: e.target.value }))} placeholder="7 chữ số" disabled={!!editingVessel} />
                </div>
                <div className="vp-field">
                  <label>Call Sign <span className="req">*</span></label>
                  <input required value={formData.callSign} onChange={e => setFormData(p => ({ ...p, callSign: e.target.value }))} placeholder="VD: XVAB1" />
                </div>
                <div className="vp-field">
                  <label>Loại tàu <span className="req">*</span></label>
                  <select value={formData.vesselType} onChange={e => setFormData(p => ({ ...p, vesselType: e.target.value }))}>
                    {VESSEL_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div className="vp-field">
                  <label>Cờ quốc tịch <span className="req">*</span></label>
                  <select value={formData.flag} onChange={e => setFormData(p => ({ ...p, flag: e.target.value }))}>
                    {FLAGS.map(f => <option key={f}>{f}</option>)}
                  </select>
                </div>
                <div className="vp-field">
                  <label>Gross Tonnage (GT)</label>
                  <input type="number" min={0} value={formData.grossTonnage} onChange={e => setFormData(p => ({ ...p, grossTonnage: +e.target.value }))} />
                </div>
                <div className="vp-field">
                  <label>Deadweight (DWT)</label>
                  <input type="number" min={0} value={formData.deadWeight} onChange={e => setFormData(p => ({ ...p, deadWeight: +e.target.value }))} />
                </div>
                <div className="vp-field">
                  <label>Ngày đóng tàu <span className="req">*</span></label>
                  <input required type="date" value={formData.buildDate} onChange={e => setFormData(p => ({ ...p, buildDate: e.target.value }))} />
                </div>
                {editingVessel && (
                  <div className="vp-field vp-field--checkbox">
                    <label className="vp-checkbox-label">
                      <input type="checkbox" checked={formData.isActive} onChange={e => setFormData(p => ({ ...p, isActive: e.target.checked }))} />
                      Đang hoạt động
                    </label>
                  </div>
                )}
              </div>
              <div className="vp-form-footer">
                <button type="button" className="vp-btn" onClick={() => setModalOpen(false)}>Hủy</button>
                <button type="submit" className="vp-btn vp-btn--primary" disabled={saving}>
                  {saving && <Loader2 size={12} className="spin" />}
                  {saving ? 'Đang lưu...' : editingVessel ? 'Lưu thay đổi' : 'Thêm tàu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="vp-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={e => e.stopPropagation()}
        >
          <button
            className="vp-ctx-item"
            onClick={() => { navigate(`/vessels/${contextMenu.vessel.id}`); closeContextMenu(); }}
          >
            <FileText size={13} /> Xem chi tiết
          </button>
          <button
            className="vp-ctx-item"
            onClick={() => { window.open(`/vessels/${contextMenu.vessel.id}`, '_blank'); closeContextMenu(); }}
          >
            <ExternalLink size={13} /> Mở trong tab mới
          </button>
          <div className="vp-ctx-divider" />
          <button
            className="vp-ctx-item"
            onClick={() => { openEdit(contextMenu.vessel); closeContextMenu(); }}
          >
            <Pencil size={13} /> Chỉnh sửa
          </button>
          <button
            className="vp-ctx-item"
            onClick={() => { setProvisionTarget(contextMenu.vessel); closeContextMenu(); }}
          >
            <Settings size={13} /> Cấu hình kết nối Edge
          </button>
          <div className="vp-ctx-divider" />
          <button
            className="vp-ctx-item vp-ctx-item--danger"
            onClick={() => { setDeleteTarget(contextMenu.vessel); closeContextMenu(); }}
          >
            <Trash2 size={13} /> Xóa tàu
          </button>
        </div>
      )}

      {/*  Delete confirm  */}
      {deleteTarget && (
        <div className="vp-overlay" onClick={() => setDeleteTarget(null)}>
          <div className="vp-modal vp-modal--sm" onClick={e => e.stopPropagation()}>
            <div className="vp-modal-head">
              <h2>Xác nhận xóa</h2>
              <button className="vp-icon-btn" onClick={() => setDeleteTarget(null)}><X size={15} /></button>
            </div>
            <div className="vp-delete-body">
              <AlertTriangle size={26} className="vp-delete-icon" />
              <p>Bạn có chắc muốn xóa tàu <strong>{deleteTarget.name}</strong> (IMO: {deleteTarget.imo})?</p>
              <p className="vp-delete-warn">Hành động này không thể hoàn tác.</p>
            </div>
            <div className="vp-form-footer">
              <button className="vp-btn" onClick={() => setDeleteTarget(null)}>Hủy</button>
              <button className="vp-btn vp-btn--danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />}
                {deleting ? 'Đang xóa...' : 'Xóa tàu'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Provisioning Modal */}
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
