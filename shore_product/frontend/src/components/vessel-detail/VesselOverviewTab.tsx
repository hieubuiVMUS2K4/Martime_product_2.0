import React, { useState, useEffect, useCallback } from 'react';
import {
  Activity, Anchor, Bell, ChevronDown, Clock, Compass, Droplets, Gauge, Leaf,
  MapPin, Power, PowerOff, RefreshCw, AlertTriangle, Users,
} from 'lucide-react';
import { ENV } from '../../config/env';

interface Vessel {
  id: string; imo: string; name: string; callSign: string; vesselType: string;
  grossTonnage: number; deadWeight: number; buildDate: string; flag: string; isActive: boolean;
  loa?: number; lbp?: number; breadthMoulded?: number; depthMoulded?: number;
  draftMoulded?: number; serviceSpeedKts?: number; yearBuilt?: number;
  portOfRegistry?: string; mmsiNumber?: string; masterName?: string;
  noOfCrewSafeManning?: number; maxPersonsAllowedOB?: number;
  hfoCbm?: number; mdoCbm?: number; freshWaterCbm?: number; lubOilCbm?: number;
  lastEdgeSyncAt?: string; lastShoreSyncAt?: string;
}

interface VesselStatus {
  latitude?: number; longitude?: number; speedOverGround?: number;
  courseOverGround?: number; timestamp?: string; captainName?: string;
  engineRunning?: boolean; crewCount?: number; lastReport?: string;
}

interface Props { vessel: Vessel; vesselStatus: VesselStatus | null; }

const BASE = ENV.API_BASE_URL;

// ── Cảnh báo / sự kiện động cơ ──
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
  const mins = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (mins < 1) return 'Vài giây trước';
  if (mins < 60) return `${mins} phút trước`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
};

const fmtDateTime = (ts?: string) => ts
  ? new Date(ts).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : null;

const fmt = (n?: number | null, unit = '') => (n != null && n !== 0 ? `${n.toLocaleString('vi-VN')}${unit}` : null);

const fmtCoord = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(4)}° ${v >= 0 ? pos : neg}`;

// ══════════════════════════════════════════════════
// Khối giao diện dùng chung trong tab
// ══════════════════════════════════════════════════
const Card: React.FC<{
  title: string; icon: React.ReactNode; actions?: React.ReactNode; className?: string; children: React.ReactNode;
}> = ({ title, icon, actions, className = '', children }) => (
  <section className={`flex min-w-0 flex-col overflow-hidden rounded-md border border-grid-strong bg-surface ${className}`}>
    <header className="flex items-center gap-2 border-b border-grid-strong bg-accent-soft px-4 py-2.5">
      <span className="text-primary [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <h3 className="text-sm font-bold text-primary">{title}</h3>
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </header>
    {children}
  </section>
);

/** Danh sách nhãn — giá trị, giá trị canh phải. Giá trị trống hiện "—" mờ. */
const InfoList: React.FC<{ rows: [string, React.ReactNode][] }> = ({ rows }) => (
  <dl className="divide-y divide-grid">
    {rows.map(([label, value]) => (
      <div key={label} className="flex items-baseline justify-between gap-4 px-4 py-2 text-sm">
        <dt className="font-semibold text-ink-muted">{label}</dt>
        <dd className={`text-right tabular-nums ${value ? 'font-bold text-ink' : 'text-ink-light'}`}>{value || '—'}</dd>
      </div>
    ))}
  </dl>
);

const StatusItem: React.FC<{
  icon: React.ReactNode; tone: string; label: string; value: React.ReactNode; sub?: React.ReactNode;
}> = ({ icon, tone, label, value, sub }) => (
  <div className="flex min-w-0 items-center gap-3 px-4 py-3">
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md [&>svg]:h-[18px] [&>svg]:w-[18px] ${tone}`}>{icon}</span>
    <div className="min-w-0">
      <p className="text-sm font-semibold text-ink-muted">{label}</p>
      <p className="truncate text-sm font-bold text-ink">{value}</p>
      {sub && <p className="truncate text-sm font-semibold text-ink-muted">{sub}</p>}
    </div>
  </div>
);

// ══════════════════════════════════════════════════
// Tab Tổng quan
// ══════════════════════════════════════════════════
export const VesselOverviewTab: React.FC<Props> = ({ vessel, vesselStatus }) => {
  const eng = vesselStatus?.engineRunning ?? false;
  const speed = vesselStatus?.speedOverGround;
  const lat = vesselStatus?.latitude;
  const lng = vesselStatus?.longitude;
  const course = vesselStatus?.courseOverGround;
  const crewCount = vesselStatus?.crewCount;

  const tanks: { label: string; value?: number; tone: string }[] = [
    { label: 'Dầu nặng (HFO)', value: vessel.hfoCbm, tone: 'text-amber-600' },
    { label: 'Dầu diesel (MDO)', value: vessel.mdoCbm, tone: 'text-sky-600' },
    { label: 'Nước ngọt', value: vessel.freshWaterCbm, tone: 'text-cyan-600' },
    { label: 'Dầu bôi trơn', value: vessel.lubOilCbm, tone: 'text-emerald-600' },
  ];

  return (
    <div className="space-y-4">
      {/* ═══ Hàng trạng thái ═══ */}
      <div className="grid grid-cols-4 divide-x divide-grid overflow-hidden rounded-md border border-grid-strong bg-surface">
        <StatusItem
          icon={<Activity />}
          tone={eng ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}
          label="Máy chính"
          value={<span className={eng ? 'text-emerald-700' : ''}>{eng ? 'Đang chạy' : 'Dừng'}</span>}
          sub={speed != null ? `Tốc độ ${speed.toFixed(1)} hải lý/giờ` : undefined}
        />
        <StatusItem
          icon={<MapPin />}
          tone="bg-sky-50 text-sky-600"
          label="Vị trí hiện tại"
          value={lat != null && lng != null ? <span className="font-mono">{fmtCoord(lat, 'N', 'S')}, {fmtCoord(lng, 'E', 'W')}</span> : 'Chưa có dữ liệu'}
          sub={course != null ? <span className="inline-flex items-center gap-1"><Compass className="h-3 w-3" aria-hidden="true" /> Hướng {course.toFixed(0)}°</span> : undefined}
        />
        <StatusItem
          icon={<Users />}
          tone="bg-amber-50 text-amber-600"
          label="Thuyền viên trên tàu"
          value={crewCount != null ? `${crewCount} người` : vessel.noOfCrewSafeManning ? `${vessel.noOfCrewSafeManning} người (định biên)` : '—'}
          sub={`Thuyền trưởng: ${vesselStatus?.captainName || vessel.masterName || '—'}`}
        />
        <StatusItem
          icon={<Clock />}
          tone="bg-primary-soft text-primary"
          label="Báo vị trí gần nhất"
          value={vesselStatus?.timestamp ? timeAgo(vesselStatus.timestamp) : 'Chưa có'}
          sub={fmtDateTime(vesselStatus?.timestamp) ?? undefined}
        />
      </div>

      {/* ═══ Thông số ═══ */}
      <div className="grid grid-cols-3 gap-4">
        <Card title="Kích thước & trọng tải" icon={<Gauge />}>
          <InfoList rows={[
            ['Chiều dài toàn bộ (LOA)', fmt(vessel.loa, ' m')],
            ['Chiều dài giữa hai trụ (LBP)', fmt(vessel.lbp, ' m')],
            ['Chiều rộng', fmt(vessel.breadthMoulded, ' m')],
            ['Chiều cao mạn', fmt(vessel.depthMoulded, ' m')],
            ['Mớn nước', fmt(vessel.draftMoulded, ' m')],
            ['Tổng dung tích (GT)', fmt(vessel.grossTonnage)],
            ['Trọng tải (DWT)', fmt(vessel.deadWeight, ' t')],
            ['Tốc độ khai thác', fmt(vessel.serviceSpeedKts, ' hải lý/giờ')],
          ]} />
        </Card>

        <Card title="Đăng ký & quản lý" icon={<Anchor />}>
          <InfoList rows={[
            ['Loại tàu', vessel.vesselType],
            ['Quốc tịch (cờ)', vessel.flag],
            ['Cảng đăng ký', vessel.portOfRegistry],
            ['Số MMSI', vessel.mmsiNumber ? <span className="font-mono">{vessel.mmsiNumber}</span> : null],
            ['Năm đóng', vessel.yearBuilt ?? (vessel.buildDate ? new Date(vessel.buildDate).getFullYear() : null)],
            ['Ngày đóng', vessel.buildDate ? new Date(vessel.buildDate).toLocaleDateString('vi-VN') : null],
            ['Định biên an toàn', vessel.noOfCrewSafeManning ? `${vessel.noOfCrewSafeManning} người` : null],
            ['Số người tối đa', vessel.maxPersonsAllowedOB ? `${vessel.maxPersonsAllowedOB} người` : null],
          ]} />
        </Card>

        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Dung tích két chứa" icon={<Droplets />}>
            <div className="grid grid-cols-2 gap-px bg-grid">
              {tanks.map(t => (
                <div key={t.label} className="bg-surface px-4 py-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-ink-muted">
                    <Droplets className={`h-3.5 w-3.5 ${t.tone}`} aria-hidden="true" />{t.label}
                  </p>
                  <p className={`mt-0.5 text-base font-bold tabular-nums ${t.value ? 'text-ink' : 'text-ink-light'}`}>
                    {t.value ? <>{t.value.toLocaleString('vi-VN')} <span className="text-sm font-medium text-ink-muted">m³</span></> : '—'}
                  </p>
                </div>
              ))}
            </div>
            <p className="border-t border-grid px-4 py-2 text-sm text-ink-muted">
              Dung tích tối đa theo thiết kế. Lượng còn trên tàu (ROB) sẽ hiện khi tàu gửi báo cáo.
            </p>
          </Card>

          <Card title="Đồng bộ dữ liệu" icon={<RefreshCw />}>
            <InfoList rows={[
              ['Tàu gửi lên bờ', fmtDateTime(vessel.lastEdgeSyncAt)],
              ['Bờ gửi xuống tàu', fmtDateTime(vessel.lastShoreSyncAt)],
            ]} />
          </Card>
        </div>
      </div>

      {/* ═══ Tuân thủ + cảnh báo ═══ */}
      <div className="grid grid-cols-3 gap-4">
        <Card title="Tuân thủ & phát thải" icon={<Leaf />}>
          <InfoList rows={[
            ['Xếp hạng CII', null],
            ['Chỉ số EEXI', null],
            ['Báo cáo EU MRV', null],
          ]} />
          <p className="border-t border-grid px-4 py-2 text-sm text-ink-muted">Chưa có dữ liệu phát thải từ tàu.</p>
        </Card>

        <AlertsSection vesselId={vessel.id} className="col-span-2" />
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════
// Cảnh báo & sự kiện động cơ
// ══════════════════════════════════════════════════
const SEVERITY: Record<string, { label: string; tone: string; rank: number }> = {
  CRITICAL: { label: 'Nghiêm trọng', tone: 'border-red-200 bg-red-50 text-red-700', rank: 0 },
  WARNING: { label: 'Cảnh báo', tone: 'border-amber-200 bg-amber-50 text-amber-700', rank: 1 },
};
const sevOf = (s: string) => SEVERITY[s.toUpperCase()] ?? { label: 'Thông tin', tone: 'border-sky-200 bg-sky-50 text-sky-700', rank: 2 };

const AlertsSection: React.FC<{ vesselId: string; className?: string }> = ({ vesselId, className = '' }) => {
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [events, setEvents] = useState<EngineEventItem[]>([]);
  const [summary, setSummary] = useState<AlertsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(true);

  const fetchData = useCallback(async () => {
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
    } catch { /* bỏ qua — thử lại ở chu kỳ sau */ }
    finally { setLoading(false); }
  }, [vesselId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const activeAlerts = alerts
    .filter(a => !a.isResolved)
    .sort((a, b) => sevOf(a.severity).rank - sevOf(b.severity).rank
      || new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const stats = summary ? [
    { label: 'Đang hoạt động', value: summary.activeAlerts, tone: summary.activeAlerts ? 'text-red-700' : 'text-ink' },
    { label: 'Nghiêm trọng', value: summary.criticalAlerts, tone: summary.criticalAlerts ? 'text-red-700' : 'text-ink' },
    { label: 'Khởi động máy (24h)', value: summary.engineStartsLast24h, tone: 'text-ink' },
    { label: 'Dừng máy (24h)', value: summary.engineStopsLast24h, tone: 'text-ink' },
  ] : [];

  return (
    <Card
      title="Cảnh báo & sự kiện động cơ"
      icon={<Bell />}
      className={className}
      actions={
        <>
          {summary && summary.activeAlerts > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2 py-0.5 text-sm font-semibold text-red-700">
              <i className="h-1.5 w-1.5 rounded-full bg-red-500" /> {summary.activeAlerts} đang hoạt động
            </span>
          )}
          <button type="button" onClick={fetchData} aria-label="Làm mới cảnh báo" title="Làm mới"
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-primary-soft hover:text-primary">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-label={open ? 'Thu gọn' : 'Mở rộng'}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-primary-soft hover:text-primary">
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
          </button>
        </>
      }
    >
      {open && (
        loading && !summary ? (
          <p className="px-4 py-8 text-center text-sm text-ink-muted">Đang tải cảnh báo...</p>
        ) : (
          <div>
            {stats.length > 0 && (
              <div className="grid grid-cols-4 divide-x divide-grid border-b border-grid">
                {stats.map(s => (
                  <div key={s.label} className="px-4 py-2.5">
                    <p className={`text-lg font-bold tabular-nums ${s.tone}`}>{s.value}</p>
                    <p className="text-sm font-semibold text-ink-muted">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 divide-x divide-grid">
              {/* Cảnh báo đang hoạt động */}
              <div className="min-w-0 p-3">
                <p className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">Cảnh báo đang hoạt động</p>
                {activeAlerts.length === 0 ? (
                  <p className="px-1 py-4 text-sm text-ink-muted">Không có cảnh báo nào.</p>
                ) : (
                  <ul className="max-h-72 space-y-2 overflow-y-auto">
                    {activeAlerts.map(alert => {
                      const sev = sevOf(alert.severity);
                      return (
                        <li key={alert.id} className={`rounded-md border px-3 py-2 ${sev.tone}`}>
                          <p className="flex items-center gap-2 text-sm font-semibold">
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span className="truncate">{alert.alarmType}</span>
                            <span className="ml-auto shrink-0 text-sm font-medium">{sev.label}</span>
                          </p>
                          {alert.description && <p className="mt-0.5 text-sm text-ink">{alert.description}</p>}
                          <p className="mt-0.5 text-sm text-ink-muted">
                            {timeAgo(alert.timestamp)} · {fmtDateTime(alert.timestamp)}{alert.location ? ` · ${alert.location}` : ''}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Sự kiện động cơ */}
              <div className="min-w-0 p-3">
                <p className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-ink-muted">Sự kiện động cơ (72 giờ)</p>
                {events.length === 0 ? (
                  <p className="px-1 py-4 text-sm text-ink-muted">Không có sự kiện nào.</p>
                ) : (
                  <ul className="divide-y divide-grid">
                    {events.slice(0, 8).map(evt => {
                      const start = evt.eventType === 'START';
                      return (
                        <li key={evt.id} className="flex items-center gap-2.5 px-1 py-2 text-sm">
                          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${start ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                            {start ? <Power className="h-3.5 w-3.5" aria-hidden="true" /> : <PowerOff className="h-3.5 w-3.5" aria-hidden="true" />}
                          </span>
                          <span className={`font-semibold ${start ? 'text-emerald-700' : 'text-ink'}`}>{start ? 'Khởi động' : 'Dừng máy'}</span>
                          <span className="truncate font-mono text-sm text-ink-muted">{evt.engineId}</span>
                          {evt.rpmAtEvent != null && <span className="text-sm text-ink-muted">{evt.rpmAtEvent} RPM</span>}
                          <span className="ml-auto shrink-0 text-sm text-ink-muted">{timeAgo(evt.timestamp)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )
      )}
    </Card>
  );
};
