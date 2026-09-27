import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { VesselMap } from '../../components/vessel/VesselMap';
import type { GpsPoint } from '../../components/vessel/VesselMap';
import { weatherRoutingApi } from '../../services/weatherRouting.service';
import type {
  CreateWeatherRoutingJobRequest,
  HazardLegendDto,
  HazardZoneDto,
  LatLonDto,
  PortOptionDto,
  VesselOptionDto,
  WeatherRoutingJobDto,
} from '../../types/weatherRouting.types';

/** Số vùng thiên tai demo mặc định (backend nhận 0–40). */
const HAZARD_COUNT_DEFAULT = 24;
const HAZARD_COUNT_OPTIONS = [8, 16, 24, 32, 40];

/** Cảng mặc định của hành trình demo Vũng Tàu → Panama. */
const DEFAULT_START_PORT = 'VNVUT';
const DEFAULT_END_PORT = 'PAPCN';

/** Màu + nhãn cho vai trò cảng trả về từ backend (StopKind). */
const STOP_KIND_STYLE: Record<string, { color: string; bg: string; icon: string; label: string }> = {
  START: { color: '#16a34a', bg: 'rgba(22,163,74,.14)', icon: '⚓', label: 'Cảng bắt đầu' },
  END: { color: '#16a34a', bg: 'rgba(22,163,74,.14)', icon: '🏁', label: 'Cảng kết thúc' },
  BUNKER: { color: '#ca8a04', bg: 'rgba(234,179,8,.16)', icon: '⛽', label: 'Gợi ý ghé (nạp nhiên liệu)' },
  MANDATORY: { color: '#ea580c', bg: 'rgba(249,115,22,.16)', icon: '📦', label: 'Bắt buộc ghé' },
};

function stopStyle(kind?: string | null) {
  return STOP_KIND_STYLE[(kind || 'BUNKER').toUpperCase()] ?? STOP_KIND_STYLE.BUNKER;
}

function toGps(pts: LatLonDto[]): GpsPoint[] {
  return pts.map((p) => ({
    latitude: p.lat,
    longitude: p.lon,
    timestamp: new Date().toISOString(),
  }));
}

/** Keep longitudes continuous eastbound so Leaflet does not draw across Asia. */
function unwrapEastboundForMap(pts: GpsPoint[]): GpsPoint[] {
  if (pts.length < 2) return pts;
  const out = pts.map((p) => ({ ...p }));
  for (let i = 1; i < out.length; i++) {
    let d = out[i].longitude - out[i - 1].longitude;
    while (d < -180) {
      out[i].longitude += 360;
      d += 360;
    }
    while (d > 180) {
      out[i].longitude -= 360;
      d -= 360;
    }
  }
  return out;
}

function parseHazards(
  raw: unknown,
): Array<{
  lat: number;
  lon: number;
  radiusNm: number;
  name?: string;
  hazardType?: string;
  label?: string;
  icon?: string;
  color?: string;
  severity?: string;
}> {
  const arr = Array.isArray(raw) ? raw : [];
  const out: Array<{
    lat: number;
    lon: number;
    radiusNm: number;
    name?: string;
    hazardType?: string;
    label?: string;
    icon?: string;
    color?: string;
    severity?: string;
  }> = [];
  for (const h of arr as any[]) {
    const lat = h?.center?.lat ?? h?.lat;
    const lon = h?.center?.lon ?? h?.lon;
    const radiusNm = h?.radiusNm ?? h?.radius_nm;
    if (typeof lat === 'number' && typeof lon === 'number' && typeof radiusNm === 'number') {
      out.push({
        lat,
        lon,
        radiusNm,
        name: h?.name,
        hazardType: h?.hazardType,
        label: h?.label,
        icon: h?.icon,
        color: h?.color,
        severity: h?.severity,
      });
    }
  }
  return out;
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function fmtNum(v: unknown, digits = 1): string {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n.toFixed(digits) : '—';
}

function fmtDate(v?: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

function fmtDays(hours: unknown): string {
  const n = typeof hours === 'number' ? hours : Number(hours);
  return Number.isFinite(n) ? (n / 24).toFixed(1) : '—';
}

/** Ô chọn cảng có tìm kiếm (mã / tên / quốc gia). */
const PortPicker: React.FC<{
  ports: PortOptionDto[];
  value: string;
  onChange: (code: string) => void;
  placeholder: string;
  /** Cảng không cho chọn (ví dụ đã chọn ở ô khác). */
  exclude?: string[];
  disabled?: boolean;
}> = ({ ports, value, onChange, placeholder, exclude, disabled }) => {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => ports.find((p) => p.code === value) ?? null, [ports, value]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const base = ports.filter((p) => !(exclude || []).includes(p.code));
    if (!needle) return base.slice(0, 80);
    return base
      .filter((p) => `${p.code} ${p.name} ${p.country ?? ''}`.toLowerCase().includes(needle))
      .slice(0, 80);
  }, [ports, query, exclude]);

  // Đóng dropdown khi bấm ra ngoài.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="w-full text-left rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm disabled:opacity-50"
      >
        {selected ? (
          <span>
            <span className="font-mono text-xs font-semibold">{selected.code}</span>{' '}
            <span>{selected.name}</span>
            {selected.country ? (
              <span className="text-xs text-slate-500"> · {selected.country}</span>
            ) : null}
          </span>
        ) : (
          <span className="text-slate-400">{placeholder}</span>
        )}
        <span className="float-right text-slate-400">▾</span>
      </button>

      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-lg">
          <input
            autoFocus
            value={query}
            placeholder="Tìm mã / tên cảng / quốc gia…"
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-t-lg border-b border-slate-200 dark:border-slate-700 bg-transparent px-3 py-2 text-sm outline-none"
          />
          <div className="max-h-60 overflow-y-auto">
            {filtered.map((p) => (
              <button
                key={p.code}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(p.code);
                  setOpen(false);
                  setQuery('');
                }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 ${
                  p.code === value ? 'bg-slate-100 dark:bg-slate-800' : ''
                }`}
              >
                <span className="font-mono text-xs font-semibold">{p.code}</span>{' '}
                <span>{p.name}</span>
                {p.country ? <span className="text-xs text-slate-500"> · {p.country}</span> : null}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="px-3 py-2 text-sm text-slate-400">Không tìm thấy cảng.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const WeatherRoutingPage: React.FC = () => {
  // ─── Dữ liệu danh mục ────────────────────────────────────────────
  const [vessels, setVessels] = useState<VesselOptionDto[]>([]);
  const [ports, setPorts] = useState<PortOptionDto[]>([]);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // ─── Lựa chọn của người dùng ─────────────────────────────────────
  const [vesselId, setVesselId] = useState<string>('');
  const [startPortCode, setStartPortCode] = useState<string>(DEFAULT_START_PORT);
  const [endPortCode, setEndPortCode] = useState<string>(DEFAULT_END_PORT);
  const [mustVisit, setMustVisit] = useState<string[]>([]);

  // ─── Tuỳ chọn nâng cao ───────────────────────────────────────────
  const [gridSize, setGridSize] = useState<number>(120);
  const [mockStormRadiusNm, setMockStormRadiusNm] = useState<number>(250);

  // ─── Kết quả ─────────────────────────────────────────────────────
  const [job, setJob] = useState<WeatherRoutingJobDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Hộp thoại "Thông số dùng để tính toán" — mở từ nút cạnh ô chọn tàu. */
  const [showSpecs, setShowSpecs] = useState(false);

  const [demoZones, setDemoZones] = useState<HazardZoneDto[]>([]);
  const [legend, setLegend] = useState<HazardLegendDto[]>([]);
  const [hazardSeed, setHazardSeed] = useState<number | null>(null);

  const refreshHazards = useCallback(async () => {
    try {
      const res = await weatherRoutingApi.getHazards();
      setDemoZones(res.zones ?? []);
      setLegend(res.legend ?? []);
      setHazardSeed(res.seed);
    } catch (e: any) {
      setDemoZones([]);
      setLegend([]);
      setHazardSeed(null);
      setError(`Không tải được thiên tai: ${e?.message || String(e)}`);
    }
  }, []);

  useEffect(() => {
    void refreshHazards();
  }, [refreshHazards]);

  // Đã có job thì vẽ đúng tập thiên tai mà job đó né (thời tiết động: mỗi lần "Cập nhật thời tiết"
  // bão di chuyển). Chưa có job thì vẽ bản đồ gốc từ GET /hazards.
  const hazards = useMemo(
    () =>
      job && Array.isArray(job.hazards)
        ? parseHazards(job.hazards)
        : demoZones.map((z) => ({
        lat: z.center.lat,
        lon: z.center.lon,
        radiusNm: z.radiusNm,
        name: z.name,
        hazardType: z.hazardType,
        label: z.label,
        icon: z.icon,
        color: z.color,
        severity: z.severity,
      })),
    [demoZones, job],
  );


  const startPort = useMemo(
    () => ports.find((p) => p.code === startPortCode) ?? null,
    [ports, startPortCode],
  );
  const endPort = useMemo(
    () => ports.find((p) => p.code === endPortCode) ?? null,
    [ports, endPortCode],
  );
  const vessel = useMemo(() => vessels.find((v) => v.id === vesselId) ?? null, [vessels, vesselId]);
  const profile = vessel?.profile ?? null;

  // ─── Nạp danh mục tàu + cảng từ API ──────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [vs, ps] = await Promise.all([
          weatherRoutingApi.listVessels(),
          weatherRoutingApi.listPorts(),
        ]);
        if (cancelled) return;
        setVessels(vs);
        setPorts(ps);
        setVesselId((cur) => cur || vs.find((v) => v.hasProfile)?.id || vs[0]?.id || '');
        const codes = new Set(ps.map((p) => p.code));
        if (!codes.has(DEFAULT_START_PORT) && ps[0]) setStartPortCode(ps[0].code);
        if (!codes.has(DEFAULT_END_PORT) && ps[1]) setEndPortCode(ps[1].code);
      } catch (e: any) {
        if (!cancelled) setCatalogError(e?.message || String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const optimized = useMemo(
    () => unwrapEastboundForMap(toGps(job?.routes?.find((r) => r.kind === 'astar')?.waypoints ?? [])),
    [job],
  );
  const baseline = useMemo(
    () => unwrapEastboundForMap(toGps(job?.routes?.find((r) => r.kind === 'baseline')?.waypoints ?? [])),
    [job],
  );
  const metrics = useMemo(() => asRecord(job?.metrics), [job]);
  const replanStats = useMemo(() => asRecord(metrics.replan), [metrics]);
  const aStarRoute = job?.routes?.find((r) => r.kind === 'astar');
  const baseRoute = job?.routes?.find((r) => r.kind === 'baseline');
  const aStarM = asRecord(aStarRoute?.metrics);
  const baseM = asRecord(baseRoute?.metrics);
  const plan = job?.plan ?? null;

  /** Polyline tuyến hành trình: nối các chặng bằng đường biển thật từ A*. */
  const planRoute = useMemo<GpsPoint[]>(() => {
    const legs = plan?.legs ?? [];
    if (legs.length === 0) return [];
    const pts: GpsPoint[] = [];
    const push = (lat?: number | null, lon?: number | null) => {
      if (typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon)) {
        pts.push({ latitude: lat, longitude: lon, timestamp: new Date().toISOString() });
      }
    };
    legs.forEach((l, i) => {
      const legPts = l.waypoints ?? [];
      if (legPts.length >= 2) {
        if (i === 0) push(legPts[0].lat, legPts[0].lon);
        legPts.slice(1).forEach((p) => push(p.lat, p.lon));
      } else {
        // Không có polyline đường biển → dùng toạ độ cảng để không mất chặng.
        if (i === 0) push(l.fromLat, l.fromLon);
        push(l.toLat, l.toLon);
      }
    });
    return unwrapEastboundForMap(pts);
  }, [plan]);

  /** Cảng hiển thị trên bản đồ, tô màu theo vai trò (START / BUNKER / MANDATORY / END). */
  const planPorts = useMemo(() => {
    const legs = plan?.legs ?? [];
    const out: Array<{
      code?: string | null;
      name?: string | null;
      lat: number;
      lon: number;
      kind: string;
    }> = [];
    const seen = new Set<string>();
    const add = (
      code?: string | null,
      name?: string | null,
      lat?: number | null,
      lon?: number | null,
      kind?: string | null,
    ) => {
      if (typeof lat !== 'number' || typeof lon !== 'number') return;
      const k = (kind || 'BUNKER').toUpperCase();
      const key = `${k}-${code}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ code, name, lat, lon, kind: k });
    };
    legs.forEach((l, i) => {
      if (i === 0) add(l.fromPortCode, l.fromPortName, l.fromLat, l.fromLon, 'START');
      const isLast = i === legs.length - 1;
      add(
        l.toPortCode,
        l.toPortName,
        l.toLat,
        l.toLon,
        l.stopKind || (isLast ? 'END' : 'BUNKER'),
      );
    });
    // Luôn hiển thị cảng người dùng đã chọn — kể cả khi chưa chạy tuyến hoặc
    // kế hoạch rỗng (hết nhiên liệu giữa đường) thì bản đồ vẫn có mốc để nhìn.
    if (startPort) add(startPort.code, startPort.name, startPort.lat, startPort.lon, 'START');
    if (endPort) add(endPort.code, endPort.name, endPort.lat, endPort.lon, 'END');
    for (const code of mustVisit) {
      const p = ports.find((x) => x.code === code);
      if (p) add(p.code, p.name, p.lat, p.lon, 'MANDATORY');
    }
    return out;
  }, [plan, startPort, endPort, mustVisit, ports]);

  /** Khung nhìn bản đồ: ưu tiên tuyến hành trình, không có thì theo tuyến A*. */
  const fitPoints = useMemo<GpsPoint[]>(() => {
    if (planRoute.length >= 2) return planRoute;
    if (optimized.length >= 2) return optimized;
    // Chưa có tuyến: ôm trọn các cảng đã chọn để map không nhảy lung tung.
    return planPorts.map((p) => ({
      latitude: p.lat,
      longitude: p.lon,
      timestamp: new Date().toISOString(),
    }));
  }, [planRoute, optimized, planPorts]);

  /** Có kế hoạch chặng thì bản đồ chỉ vẽ tuyến hành trình (A* phía đông gây nhầm hướng đi). */
  const hasPlan = (plan?.legs?.length ?? 0) > 0;

  const run = async () => {
    if (!startPort || !endPort) return;
    setLoading(true);
    setError(null);
    try {
      const payload: CreateWeatherRoutingJobRequest = {
        vesselId,
        startLat: startPort.lat,
        startLon: startPort.lon,
        goalLat: endPort.lat,
        goalLon: endPort.lon,
        gridSize,
        mockStormRadiusNm,
        planLegs: true,
        routePreference: 'auto',
        // Cảng BẮT BUỘC ghé (nhập hàng / thủ tục) do người dùng chọn.
        ...(mustVisit.length > 0 ? { mustVisitPortCodes: mustVisit } : {}),
      };
      const res = await weatherRoutingApi.createJob(payload);
      setJob(res);
      if (res.status === 'failed') setError(res.errorMessage || 'Job failed');
    } catch (e: any) {
      setError(e?.message || String(e));
      setJob(null);
    } finally {
      setLoading(false);
    }
  };

  const replan = async () => {
    if (!job) return;
    setLoading(true);
    setError(null);
    try {
      const res = await weatherRoutingApi.replan(job.id, { gridSize, mockStormRadiusNm });
      setJob(res);
      if (res.status === 'failed') setError(res.errorMessage || 'Replan failed');
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const canRun = !!vesselId && !!startPort && !!endPort && startPortCode !== endPortCode;

  return (
    <div className="p-3 md:p-4 space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Tối ưu tuyến tránh bão</h1>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Chọn tàu, cảng đi và cảng đến rồi bấm <strong>Chạy tuyến</strong> — bản đồ vẽ tuyến theo
          đường biển thật qua từng cảng tiếp nhiên liệu.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[350px_minmax(0,1fr)] gap-3 items-start">
        <div className="min-w-0 space-y-3">
          {/* 1. Chọn tàu — thông số tính toán nằm trong hộp thoại riêng */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">1 · Chọn tàu</h2>
            <div className="flex gap-2">
              <select
                value={vesselId}
                onChange={(e) => setVesselId(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 text-sm"
              >
                <option value="">— Chọn tàu —</option>
                {vessels.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                    {v.imo ? ` · IMO ${v.imo}` : ''}
                    {v.hasProfile ? '' : ' (chưa có hồ sơ nhiên liệu)'}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!vessel}
                onClick={() => setShowSpecs(true)}
                className="shrink-0 rounded-lg border border-slate-300 dark:border-slate-600 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                title="Xem thông số dùng để tính toán"
              >
                ⚙ Thông số
              </button>
            </div>
          </section>
          {/* Hộp thoại "Thông số dùng để tính toán" — mở từ nút cạnh ô chọn tàu */}
          {showSpecs && vessel && (
            <div
              className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/40 p-4"
              onClick={() => setShowSpecs(false)}
            >
              <div
                className="mt-10 w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl text-xs"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-3 px-3 py-2 font-semibold bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                  <span>Thông số dùng để tính toán</span>
                  <button
                    type="button"
                    className="rounded px-1 text-lg leading-none text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    onClick={() => setShowSpecs(false)}
                    title="Đóng"
                  >
                    ×
                  </button>
                </div>
                <dl className="divide-y divide-slate-100 dark:divide-slate-800">
                  {([
                    ['Sức chứa nhiên liệu tối đa', profile ? `${fmtNum(profile.fuelCapacityTons, 0)} t` : `${fmtNum(vessel.specs?.fuelCapacityTons, 0)} t`],
                    ['Tiêu thụ / hải lý', profile?.tonsPerNm != null ? `${fmtNum(profile.tonsPerNm, 4)} t/NM` : '—'],
                    ['Tiêu thụ / ngày', profile?.tonsPerDay != null ? `${fmtNum(profile.tonsPerDay, 2)} t/ngày` : '—'],
                    ['Tốc độ khai thác', `${fmtNum(profile?.serviceSpeedKts ?? vessel.specs?.serviceSpeedKts, 1)} kn`],
                    ['Công suất máy chính', `${fmtNum(profile?.servicePowerKw ?? vessel.specs?.mainEnginePowerKw, 0)} kW`],
                    ['SFOC máy chính / máy phụ', profile ? `${fmtNum(profile.sfocMainGPerKwh, 0)} / ${fmtNum(profile.sfocAuxGPerKwh, 0)} g/kWh` : '—'],
                    ['Tải phụ', profile ? `${fmtNum(profile.auxLoadKw, 0)} kW` : '—'],
                    ['Hệ số biển / thời tiết', profile ? `${fmtNum(profile.seaMarginFraction * 100, 0)}% / ${fmtNum(profile.weatherAllowanceFraction * 100, 0)}%` : '—'],
                    ['Dự trữ an toàn', profile ? `${fmtNum(profile.reserveTons, 1)} t (${fmtNum(profile.reserveFraction * 100, 0)}%)` : '—'],
                    ['Tầm hoạt động', profile?.rangeNm != null ? `${fmtNum(profile.rangeNm, 0)} NM` : '—'],
                    ['Đỗ cảng mỗi lần ghé', profile ? `${fmtNum(profile.portStayHours, 0)} h` : '—'],
                    ['Nhiên liệu hiện có', profile?.currentFuelTons != null ? `${fmtNum(profile.currentFuelTons, 1)} t` : '—'],
                    ['Loại nhiên liệu', profile?.fuelType || '—'],
                  ] as const).map(([k, v]) => (
                    <div key={k} className="flex items-start justify-between gap-3 px-3 py-1.5">
                      <dt className="text-slate-500">{k}</dt>
                      <dd className="font-medium text-right">{v}</dd>
                    </div>
                  ))}
                </dl>
                <div className="px-3 py-2 border-t border-slate-200 dark:border-slate-700 text-slate-500">
                  Hồ sơ đăng kiểm: DWT {fmtNum(vessel.specs?.deadWeight, 0)} t · GT{' '}
                  {fmtNum(vessel.specs?.grossTonnage, 0)} · mớn nước {fmtNum(vessel.specs?.draftMoulded, 2)} m ·{' '}
                  {vessel.specs?.noOfCargoHolds ?? '—'} hầm hàng · {vessel.specs?.vesselType || '—'} ·{' '}
                  {vessel.specs?.flag || '—'}
                </div>
              </div>
            </div>
          )}

          {/* 2. Cảng bắt đầu / kết thúc */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">2 · Hành trình</h2>
            <div className="space-y-1">
              <span className="text-xs text-slate-500">Cảng bắt đầu</span>
              <PortPicker
                ports={ports}
                value={startPortCode}
                onChange={setStartPortCode}
                placeholder="— Chọn cảng bắt đầu —"
                exclude={[endPortCode]}
                disabled={loading}
              />
            </div>
            <div className="space-y-1">
              <span className="text-xs text-slate-500">Cảng kết thúc</span>
              <PortPicker
                ports={ports}
                value={endPortCode}
                onChange={setEndPortCode}
                placeholder="— Chọn cảng kết thúc —"
                exclude={[startPortCode]}
                disabled={loading}
              />
            </div>
            {startPortCode === endPortCode && (
              <p className="text-xs text-red-600">Cảng bắt đầu và kết thúc phải khác nhau.</p>
            )}
          </section>

          {/* 3. Cảng bắt buộc ghé */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              3 · Cảng bắt buộc ghé <span className="font-normal text-slate-500">(tuỳ chọn)</span>
            </h2>
            <PortPicker
              ports={ports}
              value=""
              onChange={(code) => {
                if (code && !mustVisit.includes(code)) setMustVisit((m) => [...m, code]);
              }}
              placeholder="— Thêm cảng phải ghé (nhập hàng / thủ tục) —"
              exclude={[startPortCode, endPortCode, ...mustVisit]}
              disabled={loading}
            />
            {mustVisit.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {mustVisit.map((code) => {
                  const p = ports.find((x) => x.code === code);
                  return (
                    <span
                      key={code}
                      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs"
                      style={{
                        backgroundColor: STOP_KIND_STYLE.MANDATORY.bg,
                        color: STOP_KIND_STYLE.MANDATORY.color,
                      }}
                    >
                      {STOP_KIND_STYLE.MANDATORY.icon} {p?.name || code}
                      <button
                        type="button"
                        className="ml-1 font-bold"
                        onClick={() => setMustVisit((m) => m.filter((c) => c !== code))}
                        title="Bỏ"
                      >
                        ×
                      </button>
                    </span>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-500">
                Không bắt buộc. Hệ thống chỉ tự chọn cảng nạp nhiên liệu.
              </p>
            )}
          </section>

          {/* 4. Chạy tuyến */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={loading || !canRun}
                className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold disabled:opacity-50"
                onClick={() => void run()}
              >
                {loading ? 'Đang tính…' : '▶ Chạy tuyến'}
              </button>
              <button
                type="button"
                disabled={loading || !job}
                className="px-3 py-2 rounded-lg bg-amber-600 text-white text-sm font-semibold disabled:opacity-50"
                onClick={replan}
              >
                ↻ Cập nhật thời tiết
              </button>
            </div>

          <details className="text-xs">
            <summary className="cursor-pointer text-slate-500">Tuỳ chọn nâng cao</summary>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <label className="flex flex-col gap-1">
                <span className="text-slate-500">Độ mịn lưới A*</span>
                <input
                  type="number"
                  className="rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1"
                  value={gridSize}
                  onChange={(e) => setGridSize(Number(e.target.value) || 120)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-500">Bán kính bão (NM)</span>
                <input
                  type="number"
                  className="rounded border border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1"
                  value={mockStormRadiusNm}
                  onChange={(e) => setMockStormRadiusNm(Number(e.target.value) || 250)}
                />
              </label>
            </div>
          </details>

          {catalogError && (
            <p className="text-xs text-red-600">Không tải được danh mục: {catalogError}</p>
          )}
          {loading && <p className="text-sm text-blue-600">Đang tính tuyến…</p>}
          {error && <p className="text-sm text-red-600 whitespace-pre-wrap">{error}</p>}

          {job && (
            <div className="text-sm space-y-3 text-slate-700 dark:text-slate-200">
              <div className="space-y-1">
                <div>Trạng thái: <strong className="capitalize">{job.status}</strong> · phiên bản {job.version}</div>
                <div className="text-xs text-slate-500">
                  Thời tiết: T+{fmtNum(metrics.weatherHours ?? (job.version - 1) * 24, 0)} h ·{' '}
                  {hazards.length} vùng thiên tai — mỗi lần “Cập nhật thời tiết” dự báo tiến thêm 24 h
                </div>
                <div className="text-xs text-slate-500 break-all">Mã job: {job.id}</div>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
                <div className="px-3 py-2 font-semibold bg-slate-50 dark:bg-slate-800/80">Kết quả tính toán</div>
                <div className="px-3 py-2 grid grid-cols-2 gap-x-3 gap-y-1">
                  <span className="text-slate-500">Quãng đường A*</span>
                  <span className="font-medium text-right">{fmtNum(metrics.aStarDistanceNm ?? aStarM.distanceNm)} NM</span>
                  <span className="text-slate-500">Quãng đường baseline</span>
                  <span className="font-medium text-right">{fmtNum(metrics.baselineDistanceNm ?? baseM.distanceNm)} NM</span>
                  <span className="text-slate-500">Ô lưới đã duyệt</span>
                  <span className="font-medium text-right">{fmtNum(metrics.aStarExplored ?? aStarM.exploredCells, 0)}</span>
                  <span className="text-slate-500">Bán kính bão mock</span>
                  <span className="font-medium text-right">{fmtNum(metrics.stormRadiusNm, 0)} NM</span>
                  <span className="text-slate-500">Thời gian tính</span>
                  <span className="font-medium text-right">{fmtNum(metrics.elapsedMs, 0)} ms</span>
                  <span className="text-slate-500">Số điểm A* / baseline</span>
                  <span className="font-medium text-right">
                    {aStarRoute?.waypoints?.length ?? 0} / {baseRoute?.waypoints?.length ?? 0}
                  </span>
                </div>
              </div>

              {/* Lập lại kế hoạch tăng dần (D* Lite) so với A* chạy lại từ đầu — chỉ có từ lần "Cập nhật thời tiết" */}
              {replanStats.mode ? (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700">
                  <div className="px-3 py-2 font-semibold bg-slate-50 dark:bg-slate-800/80">
                    Lập lại kế hoạch (T+{fmtNum(Number(replanStats.fromStep) * 24, 0)} h → T+{fmtNum(Number(replanStats.toStep) * 24, 0)} h)
                  </div>
                  <div className="px-3 py-2 grid grid-cols-2 gap-x-3 gap-y-1">
                    <span className="text-slate-500">Thuật toán</span>
                    <span className="font-medium text-right">
                      {replanStats.mode === 'dstar-lite' ? 'D* Lite (tăng dần)' : 'A* (D* Lite thất bại)'}
                    </span>
                    <span className="text-slate-500">Ô thời tiết thay đổi</span>
                    <span className="font-medium text-right">
                      {fmtNum(replanStats.changedCells, 0)} / {fmtNum(replanStats.gridCells, 0)}
                    </span>
                    <span className="text-slate-500">Ô duyệt: D* Lite / A* từ đầu</span>
                    <span className="font-medium text-right">
                      {fmtNum(replanStats.incrementalExpanded, 0)} / {fmtNum(replanStats.fullAStarExplored, 0)}
                    </span>
                    <span className="text-slate-500">Thời gian: D* Lite / A*</span>
                    <span className="font-medium text-right">
                      {fmtNum(replanStats.incrementalMs, 0)} / {fmtNum(replanStats.fullAStarMs, 0)} ms
                    </span>
                    <span className="text-slate-500">Chi phí tối ưu trùng A*</span>
                    <span className={`font-medium text-right ${replanStats.sameCost ? 'text-green-600' : 'text-red-600'}`}>
                      {replanStats.sameCost ? '✓ trùng' : '✗ lệch'} ({fmtNum(replanStats.incrementalCost, 2)} t)
                    </span>
                  </div>
                  {!replanStats.reusedState && (
                    <div className="px-3 py-2 text-xs text-slate-500">
                      Chưa có trạng thái D* Lite trong bộ nhớ (lần cập nhật đầu hoặc backend vừa khởi động lại) —
                      đã dựng lại từ thời tiết bước trước ({fmtNum(replanStats.initExpanded, 0)} ô, không tính vào so sánh).
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
          </section>

        </div>

        {/* Bản đồ chiếm hết phần còn lại và cao gần trọn màn hình.
            `relative z-0` tạo stacking context riêng: Leaflet dùng z-index nội bộ tới 1000
            cho các pane/control, không nhốt lại thì chúng đè lên mọi hộp thoại của trang. */}
        <div className="min-w-0 relative z-0">
          <VesselMap
            height="max(520px, calc(100vh - 250px))"
            autoFit
            hideDisasterToggle
            currentPosition={
              optimized[0]
                ? { ...optimized[0], longitude: ((((optimized[0].longitude + 180) % 360) + 360) % 360) - 180 }
                : startPort
                  ? { latitude: startPort.lat, longitude: startPort.lon, timestamp: new Date().toISOString() }
                  : null
            }
            optimizedRoute={hasPlan ? [] : optimized}
            baselineRoute={hasPlan ? [] : baseline}
            planRoute={planRoute}
            planPorts={planPorts}
            allPorts={ports}
            fitPoints={fitPoints}
            hazards={hazards}
          />

          {/* Chú thích màu cảng */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs">
            {(['START', 'BUNKER', 'MANDATORY'] as const).map((k) => {
              const s = STOP_KIND_STYLE[k];
              return (
                <span key={k} className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] text-white"
                    style={{ backgroundColor: s.color }}
                  >
                    {s.icon}
                  </span>
                  <span className="text-slate-600 dark:text-slate-300">
                    {k === 'START' ? 'Bắt đầu / Kết thúc' : s.label}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {plan && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/80 flex flex-wrap items-center gap-3">
            <span className="font-semibold">Kế hoạch {plan.legCount} chặng — tiếp nhiên liệu</span>
            <span className="text-xs rounded-full bg-blue-100 text-blue-800 px-2 py-0.5">
              {plan.bunkerStopCount} điểm tiếp nhiên liệu
            </span>
            <span className="text-xs rounded-full bg-slate-100 dark:bg-slate-700 px-2 py-0.5 text-slate-600 dark:text-slate-300">
              hành lang: {plan.corridorSource ?? '—'}
            </span>
            <span className="text-xs text-slate-500">
              {fmtNum(plan.totalDistanceNm, 0)} NM · {fmtNum(plan.totalFuelTons, 1)} t nhiên liệu ·{' '}
              {fmtDays(plan.totalHours)} ngày
            </span>
          </div>

          <div className="px-4 py-2 text-xs text-slate-500 border-b border-slate-200 dark:border-slate-700">
            Mô hình: {plan.model} · tốc độ khai thác {fmtNum(plan.serviceSpeedKts, 1)} kn ·{' '}
            {fmtNum(plan.tonsPerDay, 2)} t/ngày · {fmtNum(plan.tonsPerNm, 4)} t/NM · sức chứa{' '}
            {fmtNum(plan.fuelCapacityTons, 0)} t · dự trữ {fmtNum(plan.reserveTons, 0)} t (
            {fmtNum((plan.reserveFraction ?? 0) * 100, 0)}%) · tầm khi rời cảng{' '}
            {fmtNum(plan.rangeAtDepartureNm, 0)} NM
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500">
                <tr>
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">Từ</th>
                  <th className="px-3 py-2 text-left">Đến</th>
                  <th className="px-3 py-2 text-left">Vai trò</th>
                  <th className="px-3 py-2 text-right">NM</th>
                  <th className="px-3 py-2 text-right">Giờ</th>
                  <th className="px-3 py-2 text-right">NL rời cảng</th>
                  <th className="px-3 py-2 text-right">Tiêu thụ</th>
                  <th className="px-3 py-2 text-right">NL tới cảng</th>
                  <th className="px-3 py-2 text-right">% sức chứa</th>
                  <th className="px-3 py-2 text-right">Nạp thêm</th>
                  <th className="px-3 py-2 text-left">Giờ tới (UTC)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                {plan.legs.map((l, i) => {
                  const kind =
                    l.stopKind || (i === plan.legs.length - 1 ? 'END' : l.isBunkerStop ? 'BUNKER' : 'BUNKER');
                  const s = stopStyle(kind);
                  return (
                    <tr key={l.sequence} style={{ backgroundColor: s.bg }}>
                      <td className="px-3 py-2">{l.sequence}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-mono text-xs">{l.fromPortCode || '—'}</span>
                        <div className="text-xs text-slate-500">{l.fromPortName || ''}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-mono text-xs">{l.toPortCode || '—'}</span>
                        <div className="text-xs text-slate-500">{l.toPortName || ''}</div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: s.color }}>
                          {s.icon} {s.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">{fmtNum(l.distanceNm, 0)}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(l.durationHours, 0)}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(l.fuelOnDepartureTons, 1)}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(l.fuelConsumedTons, 1)}</td>
                    <td className="px-3 py-2 text-right">{fmtNum(l.fuelOnArrivalTons, 1)}</td>
                    <td className="px-3 py-2 text-right">
                      <span
                        className={
                          l.fuelOnArrivalPercent < 22
                            ? 'text-red-600 font-medium'
                            : l.isBunkerStop
                              ? 'text-amber-600 font-medium'
                              : ''
                        }
                      >
                        {fmtNum(l.fuelOnArrivalPercent, 0)}%
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {l.bunkerTons > 0 ? `${fmtNum(l.bunkerTons, 1)} t` : '—'}
                    </td>
                      <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">
                        {fmtDate(l.arrivalUtc)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {plan.legs.length > 0 && (
                <tfoot className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60 font-semibold">
                  <tr>
                    <td className="px-3 py-2" colSpan={4}>
                      Tổng cộng ({plan.legs.length} chặng)
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmtNum(plan.legs.reduce((s, l) => s + (l.distanceNm ?? 0), 0), 0)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmtNum(plan.legs.reduce((s, l) => s + (l.durationHours ?? 0), 0), 0)}
                    </td>
                    <td className="px-3 py-2 text-right">—</td>
                    <td className="px-3 py-2 text-right">
                      {fmtNum(plan.legs.reduce((s, l) => s + (l.fuelConsumedTons ?? 0), 0), 1)}
                    </td>
                    <td className="px-3 py-2 text-right">—</td>
                    <td className="px-3 py-2 text-right">—</td>
                    <td className="px-3 py-2 text-right">
                      {fmtNum(plan.legs.reduce((s, l) => s + (l.bunkerTons ?? 0), 0), 1)} t
                    </td>
                    <td className="px-3 py-2 text-xs whitespace-nowrap">
                      {fmtDate(plan.legs[plan.legs.length - 1].arrivalUtc)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {plan.warnings?.length > 0 && (
            <ul className="px-4 py-3 text-xs text-amber-700 dark:text-amber-400 space-y-1 border-t border-slate-200 dark:border-slate-700">
              {plan.warnings.map((w, i) => (
                <li key={i}>⚠ {w}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default WeatherRoutingPage;
