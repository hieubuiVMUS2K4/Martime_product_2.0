import React, { useState, useEffect } from 'react';
import {
  Ship, Activity, Users, Anchor, Clock, MapPin, Fuel, Gauge,
  AlertTriangle, Bell, Power, PowerOff, RefreshCw, Loader2,
  Navigation, Compass, Shield, Droplets, ThermometerSun, Info
} from 'lucide-react';
import { ENV } from '../../config/env';

interface Vessel {
  id: string; imo: string; name: string; callSign: string; vesselType: string;
  grossTonnage: number; deadWeight: number; buildDate: string; flag: string; isActive: boolean;
  loa?: number; lbp?: number; breadthMoulded?: number; depthMoulded?: number;
  draftMoulded?: number; serviceSpeedKts?: number; yearBuilt?: number;
  portOfRegistry?: string; mmsiNumber?: string; masterName?: string;
  noOfCrewSafeManning?: number; maxPersonsAllowedOB?: number;
  hfoCbm?: number; mdoCbm?: number; freshWaterCbm?: number;
  lastEdgeSyncAt?: string; lastShoreSyncAt?: string;
  lubOilCbm?: number; [key: string]: any;
}

interface VesselStatus {
  latitude?: number; longitude?: number; speedOverGround?: number;
  courseOverGround?: number; timestamp?: string; captainName?: string;
  engineRunning?: boolean; crewCount?: number; lastReport?: string;
}

interface Props { vessel: Vessel; vesselStatus: VesselStatus | null; }

const BASE = ENV.API_BASE_URL;

// ── Alert/Event types ──
interface SafetyAlert {
  id: string; timestamp: string; alarmType: string; alarmCode: string | null;
  severity: string; location: string | null; description: string | null;
  isAcknowledged: boolean; isResolved: boolean;
}

interface EngineEventItem {
  id: string; timestamp: string; engineId: string;
  eventType: string; rpmAtEvent: number | null; triggerSource: string | null;
}

interface AlertsSummary {
  activeAlerts: number; alertsLast24h: number; criticalAlerts: number;
  engineStartsLast24h: number; engineStopsLast24h: number;
  lastEngineEvent: { timestamp: string; eventType: string; engineId: string } | null;
}

// ── Helpers ──
const timeAgo = (ts: string) => {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Vài giây trước';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
};

const fmtTime = (ts: string) =>
  new Date(ts).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const fmt = (n?: number, unit = '') => n != null ? `${n.toLocaleString('en-US')}${unit}` : '—';

// ══════════════════════════════════════════════════
// Circular Gauge Component (Pure SVG)
// ══════════════════════════════════════════════════
const CircularGauge: React.FC<{
  value: number; max: number; label: string; unit: string;
  icon: React.ReactNode; size?: number;
}> = ({ value, max, label, unit, icon, size = 100 }) => {
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const offset = circumference - (pct / 100) * circumference;

  // Color thresholds: Green > 50%, Yellow 20-50%, Red < 20%
  const getColor = (p: number) => {
    if (p > 50) return { stroke: '#22c55e', bg: 'rgba(34,197,94,0.08)', text: '#16a34a', label: 'Tốt' };
    if (p > 20) return { stroke: '#f59e0b', bg: 'rgba(245,158,11,0.08)', text: '#d97706', label: 'Trung bình' };
    return { stroke: '#ef4444', bg: 'rgba(239,68,68,0.08)', text: '#dc2626', label: 'Thấp' };
  };
  const color = getColor(pct);

  return (
    <div className="vo-gauge">
      <div className="vo-gauge-svg-wrap" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background circle */}
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="#e5e7eb" strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          {/* Progress circle */}
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={color.stroke} strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            className="vo-gauge-progress"
          />
        </svg>
        <div className="vo-gauge-center">
          <span className="vo-gauge-value" style={{ color: color.text }}>
            {max > 0 ? `${Math.round(pct)}%` : '—'}
          </span>
        </div>
      </div>
      <div className="vo-gauge-info">
        <div className="vo-gauge-icon" style={{ background: color.bg }}>
          {icon}
        </div>
        <span className="vo-gauge-label">{label}</span>
        <span className="vo-gauge-cap">{max > 0 ? `${max.toLocaleString()} ${unit}` : 'N/A'}</span>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════
// Main Overview Component
// ══════════════════════════════════════════════════
export const VesselOverviewTab: React.FC<Props> = ({ vessel, vesselStatus }) => {
  const eng = vesselStatus?.engineRunning ?? false;
  const speed = vesselStatus?.speedOverGround;
  const lat = vesselStatus?.latitude;
  const lng = vesselStatus?.longitude;
  const course = vesselStatus?.courseOverGround;

  return (
    <div className="vo-root">

      {/* ═══ ROW 1: Hero Status Strip ═══ */}
      <div className="vo-hero-strip">
        {/* Engine */}
        <div className="vo-hero-item">
          <div className={`vo-hero-indicator ${eng ? 'vo-hero-indicator--on' : 'vo-hero-indicator--off'}`}>
            <Activity size={16} />
          </div>
          <div className="vo-hero-text">
            <span className="vo-hero-label">Máy chính</span>
            <span className={`vo-hero-value ${eng ? 'vo-hero-value--green' : 'vo-hero-value--gray'}`}>
              {eng ? 'Đang chạy' : 'Dừng'}
              {speed != null && <span className="vo-hero-speed"> • {speed.toFixed(1)} kn</span>}
            </span>
          </div>
        </div>

        <div className="vo-hero-divider" />

        {/* Position */}
        <div className="vo-hero-item">
          <div className="vo-hero-indicator vo-hero-indicator--blue">
            <MapPin size={16} />
          </div>
          <div className="vo-hero-text">
            <span className="vo-hero-label">Vị trí hiện tại</span>
            <span className="vo-hero-value">
              {lat != null && lng != null
                ? `${lat.toFixed(4)}°N, ${lng!.toFixed(4)}°E`
                : 'Chưa có dữ liệu'}
            </span>
          </div>
          {course != null && (
            <div className="vo-hero-badge">
              <Compass size={12} /> {course.toFixed(0)}°
            </div>
          )}
        </div>

        <div className="vo-hero-divider" />

        {/* Crew */}
        <div className="vo-hero-item">
          <div className="vo-hero-indicator vo-hero-indicator--amber">
            <Users size={16} />
          </div>
          <div className="vo-hero-text">
            <span className="vo-hero-label">Thuyền viên</span>
            <span className="vo-hero-value">
              {vesselStatus?.crewCount != null ? `${vesselStatus.crewCount} người` : fmt(vessel.noOfCrewSafeManning, ' người')}
              <span className="vo-hero-sub"> • Thuyền trưởng: {vesselStatus?.captainName || vessel.masterName || '—'}</span>
            </span>
          </div>
        </div>

        <div className="vo-hero-divider" />

        {/* Vessel */}
        <div className="vo-hero-item">
          <div className="vo-hero-indicator vo-hero-indicator--indigo">
            <Ship size={16} />
          </div>
          <div className="vo-hero-text">
            <span className="vo-hero-label">{vessel.vesselType || 'Tàu'}</span>
            <span className="vo-hero-value vo-hero-value--mono">
              IMO {vessel.imo} • {vessel.flag || '—'}
            </span>
          </div>
        </div>

        {/* Live timestamp */}
        {vesselStatus?.timestamp && (
          <div className="vo-hero-timestamp">
            <Clock size={11} />
            <span>{timeAgo(vesselStatus.timestamp)}</span>
          </div>
        )}
      </div>

      {/* ═══ ROW 2: Dashboard Grid (2 columns) ═══ */}
      <div className="vo-dashboard">

        {/* ── Left Column: Fuel Gauges + Compliance ── */}
        <div className="vo-dashboard-left">
          {/* Fuel Gauges */}
          <div className="vo-section">
            <div className="vo-section-header">
              <Fuel size={15} className="vo-section-icon vo-section-icon--amber" />
              <h3>Dung lượng bồn chứa</h3>
            </div>
            <div className="vo-gauges-grid">
              <CircularGauge
                value={vessel.hfoCbm ?? 0} max={vessel.hfoCbm ?? 0}
                label="HFO" unit="m³"
                icon={<Droplets size={14} className="text-amber-600" />}
              />
              <CircularGauge
                value={vessel.mdoCbm ?? 0} max={vessel.mdoCbm ?? 0}
                label="MDO" unit="m³"
                icon={<Droplets size={14} className="text-accent" />}
              />
              <CircularGauge
                value={vessel.freshWaterCbm ?? 0} max={vessel.freshWaterCbm ?? 0}
                label="Nước ngọt" unit="m³"
                icon={<Droplets size={14} className="text-cyan-600" />}
              />
              <CircularGauge
                value={vessel.lubOilCbm ?? 0} max={vessel.lubOilCbm ?? 0}
                label="Dầu bôi trơn" unit="m³"
                icon={<Droplets size={14} className="text-emerald-600" />}
              />
            </div>
            <p className="vo-gauge-note">
              <Info size={12} />
              Hiển thị dung lượng tối đa bồn chứa. Khi có dữ liệu ROB (Remaining on Board) sẽ cập nhật tỷ lệ thực tế.
            </p>
          </div>

          {/* Compliance Indicators */}
          <div className="vo-section">
            <div className="vo-section-header">
              <Shield size={15} className="vo-section-icon vo-section-icon--violet" />
              <h3>Tuân thủ & Phát thải</h3>
            </div>
            <div className="vo-compliance-grid">
              <div className="vo-compliance-card vo-compliance--pending">
                <span className="vo-compliance-label">CII Rating</span>
                <span className="vo-compliance-value">—</span>
                <span className="vo-compliance-status">Chưa cập nhật</span>
              </div>
              <div className="vo-compliance-card vo-compliance--pending">
                <span className="vo-compliance-label">EEXI</span>
                <span className="vo-compliance-value">—</span>
                <span className="vo-compliance-status">Chưa cập nhật</span>
              </div>
              <div className="vo-compliance-card vo-compliance--pending">
                <span className="vo-compliance-label">EU MRV</span>
                <span className="vo-compliance-value">—</span>
                <span className="vo-compliance-status">Chưa cập nhật</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right Column: Compact Data ── */}
        <div className="vo-dashboard-right">
          {/* Dimensions */}
          <div className="vo-section">
            <div className="vo-section-header">
              <Gauge size={15} className="vo-section-icon vo-section-icon--blue" />
              <h3>Kích thước & Trọng tải</h3>
            </div>
            <div className="vo-compact-table">
              <div className="vo-compact-row">
                <span>L.O.A</span><span>{fmt(vessel.loa, ' m')}</span>
              </div>
              <div className="vo-compact-row">
                <span>L.B.P</span><span>{fmt(vessel.lbp, ' m')}</span>
              </div>
              <div className="vo-compact-row">
                <span>Breadth</span><span>{fmt(vessel.breadthMoulded, ' m')}</span>
              </div>
              <div className="vo-compact-row">
                <span>Depth</span><span>{fmt(vessel.depthMoulded, ' m')}</span>
              </div>
              <div className="vo-compact-row">
                <span>Draft</span><span>{fmt(vessel.draftMoulded, ' m')}</span>
              </div>
              <div className="vo-compact-row vo-compact-row--highlight">
                <span>Gross Tonnage</span><span>{fmt(vessel.grossTonnage)}</span>
              </div>
              <div className="vo-compact-row vo-compact-row--highlight">
                <span>Deadweight</span><span>{fmt(vessel.deadWeight, ' t')}</span>
              </div>
              <div className="vo-compact-row">
                <span>Tốc độ khai thác</span><span>{fmt(vessel.serviceSpeedKts, ' kn')}</span>
              </div>
              <div className="vo-compact-row">
                <span>Năm đóng</span><span>{vessel.yearBuilt ?? '—'}</span>
              </div>
            </div>
          </div>

          {/* Registry */}
          <div className="vo-section">
            <div className="vo-section-header">
              <Anchor size={15} className="vo-section-icon vo-section-icon--teal" />
              <h3>Đăng kiểm & Quản lý</h3>
            </div>
            <div className="vo-compact-table">
              <div className="vo-compact-row">
                <span>Cảng đăng ký</span><span>{vessel.portOfRegistry || '—'}</span>
              </div>
              <div className="vo-compact-row">
                <span>Quốc kỳ</span><span>{vessel.flag || '—'}</span>
              </div>
              <div className="vo-compact-row">
                <span>Định biên an toàn</span><span>{vessel.noOfCrewSafeManning ? `${vessel.noOfCrewSafeManning} người` : '—'}</span>
              </div>
              <div className="vo-compact-row">
                <span>Số người tối đa</span><span>{vessel.maxPersonsAllowedOB ?? '—'}</span>
              </div>
              <div className="vo-compact-row">
                <span>Loại tàu</span><span>{vessel.vesselType || '—'}</span>
              </div>
              <div className="vo-compact-row">
                <span>Ngày đóng</span>
                <span>{vessel.buildDate ? new Date(vessel.buildDate).toLocaleDateString('vi-VN') : '—'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ ROW 3: Sync Timeline (compact) ═══ */}
      <div className="vo-sync-strip">
        <Clock size={14} className="vo-sync-icon" />
        <div className="vo-sync-items">
          {[
            { label: 'Edge Sync', value: vessel.lastEdgeSyncAt },
            { label: 'Shore Sync', value: vessel.lastShoreSyncAt },
            { label: 'Position Report', value: vesselStatus?.timestamp },
          ].map((item, i) => (
            <div key={i} className="vo-sync-item">
              <span className="vo-sync-label">{item.label}:</span>
              <span className="vo-sync-value">
                {item.value ? new Date(item.value).toLocaleString('vi-VN') : '—'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ ROW 4: Alerts & Engine Events ═══ */}
      <AlertsSection vessel={vessel} />
    </div>
  );
};

// ══════════════════════════════════════════════════
// Critical Alert Banner (shown at top if critical alerts exist)
// ══════════════════════════════════════════════════
const CriticalAlertBanner: React.FC<{ vesselId: string }> = ({ vesselId }) => {
  const [summary, setSummary] = useState<AlertsSummary | null>(null);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(`${BASE}/vessel-telemetry/vessel/${vesselId}/alerts-summary`, { headers });
        if (res.ok) setSummary(await res.json());
      } catch { /* silent */ }
    };
    fetchSummary();
    const interval = setInterval(fetchSummary, 30000);
    return () => clearInterval(interval);
  }, [vesselId]);

  if (!summary || (summary.activeAlerts === 0 && summary.criticalAlerts === 0)) return null;

  return (
    <div className={`vo-alert-banner ${summary.criticalAlerts > 0 ? 'vo-alert-banner--critical' : 'vo-alert-banner--warning'}`}>
      <AlertTriangle size={16} />
      <span>
        {summary.criticalAlerts > 0
          ? `⚠ ${summary.criticalAlerts} cảnh báo nghiêm trọng cần xử lý ngay`
          : `${summary.activeAlerts} cảnh báo đang hoạt động`}
      </span>
      <div className="vo-alert-banner-stats">
        {summary.engineStartsLast24h + summary.engineStopsLast24h > 0 && (
          <span>Động cơ: {summary.engineStartsLast24h} start / {summary.engineStopsLast24h} stop (24h)</span>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════
// Alerts & Engine Events Section
// ══════════════════════════════════════════════════
const AlertsSection: React.FC<{ vessel: Vessel }> = ({ vessel }) => {
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [events, setEvents] = useState<EngineEventItem[]>([]);
  const [summary, setSummary] = useState<AlertsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAlerts, setShowAlerts] = useState(true);

  const fetchData = async () => {
    const vesselId = vessel.id;
    try {
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const [alertsRes, eventsRes, summaryRes] = await Promise.all([
        fetch(`${BASE}/vessel-telemetry/vessel/${vesselId}/alerts?hours=0&limit=100&activeOnly=true`, { headers }),
        fetch(`${BASE}/vessel-telemetry/vessel/${vesselId}/engine-events?hours=72&limit=20`, { headers }),
        fetch(`${BASE}/vessel-telemetry/vessel/${vesselId}/alerts-summary`, { headers }),
      ]);

      if (alertsRes.ok) { const d = await alertsRes.json(); setAlerts(d.data ?? []); }
      if (eventsRes.ok) { const d = await eventsRes.json(); setEvents(d.data ?? []); }
      if (summaryRes.ok) setSummary(await summaryRes.json());
    } catch { /* silent */ }
    finally { setLoading(false); }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [vessel.id]);

  if (loading && alerts.length === 0 && events.length === 0) return null;

  const severityRank = (severity: string) => {
    switch (severity.toUpperCase()) {
      case 'CRITICAL': return 0;
      case 'WARNING': return 1;
      default: return 2;
    }
  };

  const activeAlerts = alerts
    .filter(a => !a.isResolved)
    .sort((a, b) => severityRank(a.severity) - severityRank(b.severity)
      || new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const sevClass = (s: string) => {
    switch (s.toUpperCase()) { case 'CRITICAL': return 'vo-sev--critical'; case 'WARNING': return 'vo-sev--warning'; default: return 'vo-sev--info'; }
  };

  return (
    <div className="vo-section vo-alerts-section">
      {/* Header */}
      <div className="vo-section-header vo-section-header--clickable" onClick={() => setShowAlerts(v => !v)}>
        <Bell size={15} className="vo-section-icon vo-section-icon--rose" />
        <h3>Cảnh báo & Sự kiện động cơ</h3>
        {summary && summary.activeAlerts > 0 && (
          <span className="vo-alert-count">
            <span className="vo-alert-dot" /> {summary.activeAlerts}
          </span>
        )}
        <RefreshCw size={13} className="vo-section-refresh" />
      </div>

      {showAlerts && (
        <div className="vo-alerts-body">
          {/* Summary mini-cards */}
          {summary && (
            <div className="vo-alerts-summary">
              {[
                { label: 'Đang hoạt động', value: summary.activeAlerts, cls: 'vo-ascard--red' },
                { label: 'Nghiêm trọng', value: summary.criticalAlerts, cls: 'vo-ascard--rose' },
                { label: 'Khởi động (24h)', value: summary.engineStartsLast24h, cls: 'vo-ascard--green' },
                { label: 'Dừng máy (24h)', value: summary.engineStopsLast24h, cls: 'vo-ascard--gray' },
              ].map((item, i) => (
                <div key={i} className={`vo-ascard ${item.cls}`}>
                  <span className="vo-ascard-value">{item.value}</span>
                  <span className="vo-ascard-label">{item.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Active alerts */}
          {activeAlerts.length > 0 && (
            <div className="vo-alerts-list">
              <p className="vo-list-title">Cảnh báo đang hoạt động</p>
              {activeAlerts.map(alert => (
                <div key={alert.id} className={`vo-alert-item ${sevClass(alert.severity)}`}>
                  <AlertTriangle size={14} className="vo-alert-item-icon" />
                  <div className="vo-alert-item-body">
                    <div className="vo-alert-item-header">
                      <span className="vo-alert-sev-badge">{alert.severity}</span>
                      <span className="vo-alert-type">{alert.alarmType}</span>
                      <span className="vo-alert-time">{timeAgo(alert.timestamp)}</span>
                    </div>
                    {alert.description && <p className="vo-alert-desc">{alert.description}</p>}
                    <p className="vo-alert-meta">
                      {fmtTime(alert.timestamp)}{alert.location ? ` · ${alert.location}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Engine events timeline */}
          {events.length > 0 && (
            <div className="vo-engine-events">
              <p className="vo-list-title">Sự kiện động cơ gần đây</p>
              {events.slice(0, 8).map(evt => (
                <div key={evt.id} className="vo-engine-event">
                  <div className={`vo-engine-dot ${evt.eventType === 'START' ? 'vo-engine-dot--start' : 'vo-engine-dot--stop'}`}>
                    {evt.eventType === 'START'
                      ? <Power size={10} />
                      : <PowerOff size={10} />
                    }
                  </div>
                  <div className="vo-engine-event-text">
                    <span className={evt.eventType === 'START' ? 'vo-evt-start' : 'vo-evt-stop'}>
                      {evt.eventType === 'START' ? 'Khởi động' : 'Dừng máy'}
                    </span>
                    <span className="vo-evt-id">{evt.engineId}</span>
                    {evt.rpmAtEvent != null && <span className="vo-evt-rpm">{evt.rpmAtEvent} RPM</span>}
                    <span className="vo-evt-time">{timeAgo(evt.timestamp)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {alerts.length === 0 && events.length === 0 && (
            <div className="vo-alerts-empty">
              <Activity size={20} />
              <span>Không có cảnh báo hoặc sự kiện nào trong 72 giờ qua</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
