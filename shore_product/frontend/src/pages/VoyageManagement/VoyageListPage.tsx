import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Ship, Anchor, ChevronRight, RefreshCw, Plus, Search, ArrowLeft, Edit2, Trash2, Eye } from 'lucide-react';
import { voyageApi } from '../../services/voyage.service';
import type {
  FleetDashboard,
  VoyageListItem,
  VoyageListResponse,
  VesselVoyageSummary,
} from '../../types/voyage.types';
import './VoyageManagement.css';
import { toast } from 'sonner';
import { useConfirm } from '@/components/common/ConfirmDialog';

function formatDateTime(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function formatCurrency(value?: number) {
  if (value === undefined || value === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}

function getStatusClass(status?: string) {
  const n = (status || '').toLowerCase();
  if (['underway', 'ready', 'approved', 'completed', 'arrived', 'settled'].includes(n)) return 'vm-badge vm-badge--success';
  if (['planning', 'open', 'pending'].includes(n)) return 'vm-badge vm-badge--warning';
  if (['cancelled', 'rejected', 'disputed'].includes(n)) return 'vm-badge vm-badge--danger';
  return 'vm-badge';
}

export const VoyageListPage: React.FC = () => {
  const ask = useConfirm();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const vesselFilter = searchParams.get('vessel') || '';
  const vesselNodeFilter = searchParams.get('node') || '';

  const [dashboard, setDashboard] = useState<FleetDashboard | null>(null);
  const [payload, setPayload] = useState<VoyageListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [vesselSearch, setVesselSearch] = useState('');

  useEffect(() => {
    setLoading(true);
    voyageApi.getFleetDashboard()
      .then(setDashboard)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!vesselFilter && !vesselNodeFilter) { setPayload(null); return; }
    setListLoading(true);
    voyageApi.getVoyages({
      search: vesselFilter || undefined,
      node: vesselNodeFilter || undefined,
      page: 1,
      pageSize: 50,
    })
      .then(setPayload)
      .catch(() => {})
      .finally(() => setListLoading(false));
  }, [vesselFilter, vesselNodeFilter]);

  const vessels = dashboard?.vesselSummaries ?? [];
  const filteredVessels = vessels.filter(v =>
    v.vesselName.toLowerCase().includes(vesselSearch.toLowerCase()) ||
    v.vesselIMO.toLowerCase().includes(vesselSearch.toLowerCase())
  );

  const voyages = (payload?.data ?? []).filter(v =>
    !search || v.voyageNumber.toLowerCase().includes(search.toLowerCase()) ||
    (v.departurePort || '').toLowerCase().includes(search.toLowerCase()) ||
    (v.arrivalPort || '').toLowerCase().includes(search.toLowerCase())
  );

  function selectVessel(v: VesselVoyageSummary) {
    const nextParams = new URLSearchParams();
    const vesselKey = v.vesselIMO || (v.vesselName !== 'Unknown' ? v.vesselName : '');
    if (vesselKey) nextParams.set('vessel', vesselKey);
    if (v.originNode) nextParams.set('node', v.originNode);
    if (!vesselKey && !v.originNode) return;
    setSearchParams(nextParams);
  }

  function clearVessel() {
    setSearchParams({});
    setSearch('');
  }

  async function handleDelete(id: string, voyageNumber: string) {
    if (!await ask(`Xóa hải trình ${voyageNumber}?`)) return;
    try {
      await voyageApi.deleteVoyage(id);
      if (vesselFilter) {
        const data = await voyageApi.getVoyages({ search: vesselFilter, page: 1, pageSize: 50 });
        setPayload(data);
      }
    } catch { toast.error('Lỗi khi xóa'); }
  }

  // ═══════════ VESSEL CARDS VIEW ═══════════
  if (!vesselFilter && !vesselNodeFilter) {
    return (
      <div className="vm-page">
        <div className="vm-header">
          <div className="vm-header-left">
            <Anchor size={17} className="vm-header-icon" />
            <h1 className="vm-title">Quản lý hải trình</h1>
            {!loading && <span className="vm-count-badge">{filteredVessels.length}</span>}
            <span className="vm-subtitle">— Chọn tàu để xem hải trình</span>
          </div>
          <div className="vm-header-right">
            <div className="vm-search-wrap">
              <Search size={12} className="vm-search-icon" />
              <input
                className="vm-search"
                type="text"
                placeholder="Tìm tàu…"
                value={vesselSearch}
                onChange={e => setVesselSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        {loading && <div className="vm-loading"><RefreshCw size={16} className="spin" /> Đang tải…</div>}
        {!loading && error && <div className="vm-empty"><p>⚠️ {error}</p></div>}
        {!loading && !error && filteredVessels.length === 0 && (
          <div className="vm-empty"><Ship size={32} /><p>Không tìm thấy tàu nào.</p></div>
        )}

        {dashboard && !loading && (
          <div className="vm-summary-bar">
            <div className="vm-summary-item"><span>Tổng hải trình</span><strong>{dashboard.summary.totalVoyages}</strong></div>
            <div className="vm-summary-item"><span>Đang hoạt động</span><strong>{dashboard.summary.activeVoyages}</strong></div>
            <div className="vm-summary-item"><span>Hoàn thành</span><strong>{dashboard.summary.completedVoyages}</strong></div>
            <div className="vm-summary-item"><span>Lập kế hoạch</span><strong>{dashboard.summary.planningVoyages}</strong></div>
          </div>
        )}

        {!loading && !error && filteredVessels.length > 0 && (
          <div className="vm-grid">
            {filteredVessels.map(vessel => (
              <div key={vessel.vesselIMO || vessel.vesselName} className="vm-card" onClick={() => selectVessel(vessel)}>
                <div className="vm-card__head">
                  <div className="vm-card__ship-badge"><Ship size={18} /></div>
                  <div className="vm-card__info">
                    <p className="vm-card__name">{vessel.vesselName}</p>
                    <p className="vm-card__meta">IMO: {vessel.vesselIMO} · {vessel.originNode}</p>
                  </div>
                  {vessel.currentStatus && (
                    <span className={getStatusClass(vessel.currentStatus)}>{vessel.currentStatus}</span>
                  )}
                </div>
                <div className="vm-card__stats">
                  <div className="vm-card__stat">
                    <span className="vm-card__stat-val">{vessel.voyageCount}</span>
                    <span className="vm-card__stat-lbl">Tổng</span>
                  </div>
                  <div className="vm-card__stat">
                    <span className="vm-card__stat-val vm-card__stat-val--active">{vessel.activeCount}</span>
                    <span className="vm-card__stat-lbl">Hoạt động</span>
                  </div>
                  <div className="vm-card__stat">
                    <span className="vm-card__stat-val">{vessel.currentVoyageNumber || '—'}</span>
                    <span className="vm-card__stat-lbl">Hiện tại</span>
                  </div>
                </div>
                {vessel.currentRoute && (
                  <div className="vm-card__route">📍 {vessel.currentRoute}</div>
                )}
                <div className="vm-card__footer">
                  <span>Xem hải trình</span>
                  <ChevronRight size={14} />
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    );
  }

  // ═══════════ VESSEL VOYAGE LIST VIEW ═══════════
  const selectedVessel = vessels.find(v =>
    (vesselNodeFilter && v.originNode === vesselNodeFilter) ||
    (vesselFilter && (v.vesselIMO === vesselFilter || v.vesselName === vesselFilter))
  );

  return (
    <div className="vm-page">
      <div className="vm-header">
        <div className="vm-header-left">
          <button className="vm-btn vm-btn--ghost" onClick={clearVessel}>
            <ArrowLeft size={14} /> Tất cả tàu
          </button>
          <div className="vm-header-divider" />
          <Ship size={17} className="vm-header-icon" />
          <h1 className="vm-title">{selectedVessel?.vesselName || vesselFilter || vesselNodeFilter}</h1>
          {selectedVessel && (
            <span className="vm-subtitle">
              IMO: {selectedVessel.vesselIMO || 'N/A'} · Node: {selectedVessel.originNode}
            </span>
          )}
        </div>
        <div className="vm-header-right">
          <div className="vm-search-wrap">
            <Search size={12} className="vm-search-icon" />
            <input className="vm-search" type="text" placeholder="Tìm hải trình…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="vm-btn vm-btn--primary" onClick={() => navigate('/voyages/new?vesselIMO=' + encodeURIComponent(selectedVessel?.vesselIMO || '') + '&vesselName=' + encodeURIComponent(selectedVessel?.vesselName || ''))}>
            <Plus size={13} /> Tạo hải trình
          </button>
        </div>
      </div>

      {selectedVessel && (
        <div className="vm-kpi-row">
          <div className="vm-kpi"><span>Tổng</span><strong>{selectedVessel.voyageCount}</strong></div>
          <div className="vm-kpi"><span>Hoạt động</span><strong>{selectedVessel.activeCount}</strong></div>
          <div className="vm-kpi"><span>Hiện tại</span><strong>{selectedVessel.currentVoyageNumber || '—'}</strong></div>
          <div className="vm-kpi"><span>Tuyến</span><strong>{selectedVessel.currentRoute || '—'}</strong></div>
        </div>
      )}

      <div className="vm-table-wrap">
        {listLoading && <div className="vm-loading"><RefreshCw size={14} className="spin" /> Đang tải…</div>}
        {!listLoading && voyages.length === 0 && (
          <div className="vm-empty"><p>Chưa có hải trình nào cho tàu này.</p></div>
        )}
        {!listLoading && voyages.length > 0 && (
          <table className="vm-table">
            <thead>
              <tr>
                <th>Số hải trình</th>
                <th>Tuyến đường</th>
                <th>Thời gian</th>
                <th>Trạng thái</th>
                <th>Tài chính</th>
                <th style={{ width: 100, textAlign: 'center' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {voyages.map((v: VoyageListItem) => (
                <tr key={v.id} onClick={() => navigate(`/voyages/${v.id}`)} className="vm-table-row--clickable">
                  <td>
                    <div className="vm-cell-primary">{v.voyageNumber}</div>
                    <div className="vm-cell-sub">{v.charterType || '—'}</div>
                  </td>
                  <td>
                    <div className="vm-cell-primary">{v.departurePort || '—'} → {v.arrivalPort || '—'}</div>
                    <div className="vm-cell-sub">{v.plannedDistance ? `${v.plannedDistance} NM` : '—'}</div>
                  </td>
                  <td>
                    <div className="vm-cell-sub">Đi: {formatDateTime(v.departureTime)}</div>
                    <div className="vm-cell-sub">Đến: {formatDateTime(v.arrivalTime)}</div>
                  </td>
                  <td><span className={getStatusClass(v.voyageStatus)}>{v.voyageStatus}</span></td>
                  <td>
                    <div className="vm-cell-sub">CP: {formatCurrency(v.totalActualCost)}</div>
                    <div className="vm-cell-sub">DT: {formatCurrency(v.totalActualRevenue)}</div>
                  </td>
                  <td>
                    <div className="vm-actions" onClick={e => e.stopPropagation()}>
                      <button className="vm-action-btn" title="Xem" onClick={() => navigate(`/voyages/${v.id}`)}><Eye size={14} /></button>
                      <button className="vm-action-btn" title="Sửa" onClick={() => navigate(`/voyages/${v.id}/edit`)}><Edit2 size={14} /></button>
                      <button className="vm-action-btn vm-action-btn--danger" title="Xóa" onClick={() => handleDelete(v.id, v.voyageNumber)}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
