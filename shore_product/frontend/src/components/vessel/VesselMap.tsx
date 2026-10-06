import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polyline, Circle, CircleMarker, useMap } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import plannedRouteData from '../../assets/planned-route.json';
import { DisasterMapLayer } from './DisasterMapLayer';

// Fix default marker icon issue with bundlers
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as L.Icon.Default & { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl, iconRetinaUrl, shadowUrl });

/** Tọa độ GPS */
export interface GpsPoint {
  latitude: number;
  longitude: number;
  speedOverGround?: number;
  courseOverGround?: number;
  timestamp?: string;
  satellitesUsed?: number;
}

/** Dữ liệu 1 tàu trên bản đồ (multi-vessel mode) */
export interface VesselTrackData {
  id: string;
  name: string;
  imo?: string;
  color: string;
  position: GpsPoint;
  route: GpsPoint[];
  dashArray?: string; // e.g. "2,4" or "5,8"
  // Thông tin bổ sung
  captainName?: string;
  engineRunning?: boolean;
  destination?: string;
  eta?: string;
  flag?: string;
  vesselType?: string;
  draught?: number;
  destLat?: number;
  destLon?: number;
  // Thông tin chuyến đi
  departurePort?: string;
  arrivalPort?: string;
  atd?: string; // actual time of departure
  ata?: string; // actual time of arrival
}

/** Props cho VesselMap component */
interface VesselMapProps {
  /** Danh sách điểm GPS cho polyline hành trình (single mode) */
  positions?: GpsPoint[];
  /** Vị trí hiện tại của tàu (marker) (single mode) */
  currentPosition?: GpsPoint | null;
  /** Danh sách nhiều tàu (multi mode) */
  vessels?: VesselTrackData[];
  /** Tự động fit bounds khi có dữ liệu mới */
  autoFit?: boolean;
  /** Chiều cao của map */
  height?: string;
  /** CSS class */
  className?: string;
  /** Id tàu cần focus — map sẽ flyTo vị trí tàu đó */
  focusVesselId?: string;
  /** Callback khi click vào marker tàu */
  onVesselSelect?: (vesselId: string) => void;
  /** DE4: A* optimized route polyline */
  optimizedRoute?: GpsPoint[];
  /** DE4: straight baseline route polyline */
  baselineRoute?: GpsPoint[];
  /** DE4: tuyến theo kế hoạch chặng (nối các cảng tiếp nhiên liệu) */
  planRoute?: GpsPoint[];
  /** Điểm dùng để fit khung nhìn (mặc định lấy positions). Truyền tuyến để map ôm trọn hành trình. */
  fitPoints?: GpsPoint[];
  /** DE4: các vùng thiên tai (tâm + bán kính + loại, có ký hiệu ở tâm) */
  hazards?: Array<{
    lat: number;
    lon: number;
    radiusNm: number;
    name?: string;
    hazardType?: string;
    label?: string;
    icon?: string;
    color?: string;
    severity?: string;
  }>;
  /** Optional controlled GDACS disaster layer visibility */
  showDisasters?: boolean;
  onShowDisastersChange?: (show: boolean) => void;
  /** Ẩn nút "Hiện/Ẩn cảnh báo thiên tai" (trang luôn hiển thị thiên tai). */
  hideDisasterToggle?: boolean;
  /**
   * DE4: các cảng trong kế hoạch chặng, tô màu theo vai trò (StopKind).
   * START/END = xanh lá, BUNKER = vàng, MANDATORY = cam.
   */
  planPorts?: Array<{
    code?: string | null;
    name?: string | null;
    lat: number;
    lon: number;
    kind?: string | null;
  }>;
  /**
   * DE4: toàn bộ cảng trong danh mục — vẽ chấm xanh nước biển nhỏ, rê chuột xem thông tin.
   * Cảng đã có trong planPorts (cùng mã) không vẽ chấm nữa.
   */
  allPorts?: Array<{
    code: string;
    name: string;
    country?: string | null;
    lat: number;
    lon: number;
  }>;
}

/** Màu + ký hiệu cho từng vai trò cảng trong kế hoạch chặng. */
const PLAN_PORT_STYLE: Record<string, { color: string; icon: string; label: string }> = {
  START: { color: '#16a34a', icon: '⚓', label: 'Cảng bắt đầu' },
  END: { color: '#16a34a', icon: '🏁', label: 'Cảng kết thúc' },
  BUNKER: { color: '#eab308', icon: '⛽', label: 'Cảng gợi ý ghé (nạp nhiên liệu)' },
  MANDATORY: { color: '#f97316', icon: '📦', label: 'Cảng bắt buộc ghé' },
};

/**
 * Độ lệch kinh độ của các bản sao thế giới mà bản đồ lặp khi cuộn ngang.
 * Lớp DE4 (cảng, tuyến) vẽ lại ở mỗi bản sao để phần lặp cũng được đánh dấu.
 */
const WORLD_COPY_OFFSETS = [-720, -360, 0, 360, 720];

/** Polyline dịch kinh độ sang một bản sao thế giới, bỏ điểm không hợp lệ. */
function toShiftedLatLngs(points: GpsPoint[], lonOffset: number): [number, number][] {
  return points
    .filter((p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
    .map((p) => [p.latitude, p.longitude + lonOffset] as [number, number]);
}

/** SVG hình mũi tên điều hướng (như AIS marker) */
const shipSvg = `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2L4 20L12 17L20 20L12 2Z" fill="currentColor" stroke="rgba(0,0,0,0.5)" stroke-width="1.5" stroke-linejoin="round"/>
</svg>`;

/** Tạo icon tàu dạng mũi tên với màu tùy chỉnh và hướng đi */
function makeShipIcon(color: string, course?: number) {
  const rotation = course != null ? course : 0;
  return new L.DivIcon({
    className: 'vessel-marker-arrow',
    html: `<div style="
      width: 24px; height: 24px;
      color: ${color};
      display: flex;
      align-items: center;
      justify-content: center;
      transform: rotate(${rotation}deg);
      filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
    ">
      ${shipSvg}
    </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
    tooltipAnchor: [12, 0],
  });
}

/** Dash array patterns for different routes */
const dashPatterns = [
  '2,4',    // Route 1: South
  '5,8',    // Route 2: North  
  '3,6',    // Route 3: Central
  '4,7',    // Route 4: Southwest
  '6,9',    // Route 5: Regional
];

/** Get dash pattern by vessel index */
function getDashPattern(index: number): string {
  return dashPatterns[index % dashPatterns.length];
}

/** Component hiển thị nhãn tiếng Việt cho Hoàng Sa và Trường Sa */
function VietnameseLabels() {
  const map = useMap();
  useEffect(() => {
    const labels = [
      { name: 'Quần đảo Hoàng Sa', lat: 16.5, lng: 111.5 },
      { name: 'Quần đảo Trường Sa', lat: 9.5, lng: 113.5 },
    ];
    const markers = labels.map(({ name, lat, lng }) =>
      L.marker([lat, lng], {
        icon: L.divIcon({
          className: 'vn-label',
          html: `<div style="font-weight:bold;color:#000000;text-shadow:0 0 4px white,0 0 4px white;font-size:13px;white-space:nowrap;background:rgba(255,255,255,0.9);padding:2px 8px;border-radius:4px;border:1.5px solid #000000;">${name}</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
      }).addTo(map)
    );
    return () => markers.forEach(m => m.removeFrom(map));
  }, [map]);
  return null;
}

/** Component con để tự động fly-to và fit bounds */
function MapController({ 
  currentPosition, 
  positions, 
  vessels,
  autoFit,
  focusVesselId,
  fitPoints,
}: {
  currentPosition: GpsPoint | null;
  positions: GpsPoint[];
  vessels?: VesselTrackData[];
  autoFit: boolean;
  focusVesselId?: string;
  fitPoints?: GpsPoint[];
}) {
  const map = useMap();
  const prevLat = useRef<number | null>(null);
  const prevLng = useRef<number | null>(null);
  const prevFocusId = useRef<string | null>(null);

  useEffect(() => {
    if (!currentPosition) return;

    // Fly to current position on first load
    if (prevLat.current === null && prevLng.current === null) {
      // In multi mode, don't override the view set by fitBounds
      if (vessels && vessels.length > 1) return;
      map.setView([currentPosition.latitude, currentPosition.longitude], 13);
      prevLat.current = currentPosition.latitude;
      prevLng.current = currentPosition.longitude;
      return;
    }

    // Smooth pan to new position
    if (autoFit && prevLat.current && prevLng.current) {
      const dist = Math.sqrt(
        Math.pow(currentPosition.latitude - prevLat.current, 2) +
        Math.pow(currentPosition.longitude - prevLng.current, 2)
      );
      // Only pan if significant movement (> 0.0001 deg ≈ 11m)
      if (dist > 0.0001) {
        map.panTo([currentPosition.latitude, currentPosition.longitude], { animate: true, duration: 0.5 });
      }
    }

    prevLat.current = currentPosition.latitude;
    prevLng.current = currentPosition.longitude;
  }, [currentPosition, map, autoFit, vessels]);

  // Fit bounds — collect all points from single or multi mode
  useEffect(() => {
    if (!autoFit) return;
    
    let allPoints: GpsPoint[] = [];
    
    if (vessels && vessels.length > 0) {
      vessels.forEach(v => {
        if (v.position) allPoints.push(v.position);
        if (v.route) allPoints = allPoints.concat(v.route);
      });
    } else {
      allPoints = positions;
    }

    if (fitPoints && fitPoints.length > 0) {
      allPoints = allPoints.concat(fitPoints);
    }
    
    if (allPoints.length < 2) return;

    const bounds = L.latLngBounds(
      allPoints.map(p => [p.latitude, p.longitude] as [number, number])
    );
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }, [positions, vessels, map, autoFit, fitPoints]);

  // Fly to focused vessel when focusVesselId changes
  useEffect(() => {
    if (!focusVesselId || focusVesselId === prevFocusId.current) return;
    prevFocusId.current = focusVesselId;

    if (vessels) {
      const vessel = vessels.find(v => v.id === focusVesselId);
      if (vessel && vessel.position) {
        map.flyTo([vessel.position.latitude, vessel.position.longitude], 13, {
          duration: 1,
        });
      }
    }
  }, [focusVesselId, vessels, map]);

  return null;
}

export const VesselMap: React.FC<VesselMapProps> = ({
  positions,
  currentPosition,
  vessels,
  autoFit = true,
  height = '600px',
  className = '',
  focusVesselId,
  onVesselSelect,
  optimizedRoute,
  baselineRoute,
  planRoute,
  fitPoints,
  hazards,
  planPorts,
  allPorts,
  showDisasters: showDisastersProp,
  onShowDisastersChange,
  hideDisasterToggle,
}) => {
  const isMulti = vessels && vessels.length > 0;
  const navigate = useNavigate();
  const [showDisastersLocal, setShowDisastersLocal] = useState(false);
  const showDisasters = showDisastersProp ?? showDisastersLocal;
  const setShowDisasters = (v: boolean) => {
    setShowDisastersLocal(v);
    onShowDisastersChange?.(v);
  };

  // Chấm cảng vẽ bằng canvas để danh mục nhiều cảng không làm nặng DOM.
  const portDotRenderer = useMemo(() => L.canvas({ padding: 0.5 }), []);
  const portDots = useMemo(() => {
    const planCodes = new Set((planPorts || []).map((p) => p.code).filter(Boolean));
    return (allPorts || []).filter(
      (p) => !planCodes.has(p.code) && Number.isFinite(p.lat) && Number.isFinite(p.lon),
    );
  }, [allPorts, planPorts]);

  // Single mode
  const defaultCenter: [number, number] = !isMulti && currentPosition
    ? [currentPosition.latitude, currentPosition.longitude]
    : [15.0, 108.5]; // Center of Vietnam

  const routePoints: [number, number][] = isMulti
    ? []
    : (positions || [])
        .filter(p => p.latitude && p.longitude)
        .map(p => [p.latitude, p.longitude]);

  const plannedPoints: [number, number][] = (plannedRouteData as any[])
    .filter(p => p.latitude && p.longitude)
    .map(p => [p.latitude, p.longitude]);

  // Palette for multi-vessel mode
  const colorPalette = [
    '#ef4444', '#3b82f6', '#22c55e', '#f59e0b',
    '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
    '#6366f1', '#84cc16', '#06b6d4', '#d946ef',
  ];

  return (
    <div className={`relative rounded-2xl overflow-hidden shadow-2xl border border-gray-200/80 dark:border-gray-700/80 ring-1 ring-black/[0.02] h-full ${className}`}>
      
      {/* Nút toggle hiển thị thiên tai */}
      {!hideDisasterToggle && (
      <div className="absolute top-4 right-4 z-[1000]">
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowDisasters(!showDisasters);
          }}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg shadow-md font-semibold text-sm transition-all border ${
            showDisasters 
              ? 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' 
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {showDisasters ? 'Ẩn cảnh báo thiên tai' : 'Hiện cảnh báo thiên tai'}
        </button>
      </div>
      )}

      <MapContainer
        center={defaultCenter}
        zoom={6}
        style={{ height, width: '100%' }}
        scrollWheelZoom={true}
        zoomControl={true}
      >
        {/* OpenStreetMap Tiles */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <VietnameseLabels />

        {/* DE4: vùng thiên tai — vòng tròn bán kính ảnh hưởng + icon ở tâm, lặp ở mọi bản sao thế giới */}
        {WORLD_COPY_OFFSETS.flatMap((off) => (hazards || [])
          .filter((h) => Number.isFinite(h.lat) && Number.isFinite(h.lon) && Number.isFinite(h.radiusNm))
          .map((h, idx) => {
            const color = h.color || '#dc2626';
            const center: [number, number] = [h.lat, h.lon + off];
            return (
              <React.Fragment key={`hazard-${off}-${idx}`}>
                <Circle
                  center={center}
                  radius={h.radiusNm * 1852}
                  pathOptions={{ color, weight: 1.5, fillColor: color, fillOpacity: 0.18, dashArray: '4, 4' }}
                />
                <Marker
                  position={center}
                  icon={L.divIcon({
                    className: '',
                    html: `<div style="font-size:18px;line-height:1;text-shadow:0 0 3px #fff,0 0 3px #fff">${h.icon || '⚠️'}</div>`,
                    iconSize: [20, 20],
                    iconAnchor: [10, 10],
                  })}
                >
                  <Tooltip direction="top" offset={[0, -10]} opacity={0.95}>
                    <div style={{ fontSize: 12 }}>
                      <div style={{ fontWeight: 700, color }}>
                        {h.icon} {h.label || h.hazardType || 'Thiên tai'}
                      </div>
                      {h.name ? <div>{h.name}</div> : null}
                      <div style={{ color: '#6b7280' }}>
                        Bán kính {Math.round(h.radiusNm)} NM
                        {h.severity ? ` · mức ${h.severity}` : ''}
                      </div>
                    </div>
                  </Tooltip>
                </Marker>
              </React.Fragment>
            );
          }))}

        {/* DE4 weather routing overlays — vẽ lặp ở mọi bản sao thế giới khi bản đồ cuộn ngang */}
        {WORLD_COPY_OFFSETS.map((off) => (
          <React.Fragment key={`de4-routes-${off}`}>
            {baselineRoute && baselineRoute.length >= 2 && (
              <Polyline
                positions={toShiftedLatLngs(baselineRoute, off)}
                color="#6b7280"
                weight={3}
                opacity={0.85}
                dashArray="6, 10"
              />
            )}
            {optimizedRoute && optimizedRoute.length >= 2 && (
              <Polyline
                positions={toShiftedLatLngs(optimizedRoute, off)}
                color="#16a34a"
                weight={4}
                opacity={0.9}
              />
            )}
            {planRoute && planRoute.length >= 2 && (
              <Polyline
                positions={toShiftedLatLngs(planRoute, off)}
                color="#7c3aed"
                weight={4}
                opacity={0.9}
                dashArray="10, 6"
              />
            )}
          </React.Fragment>
        ))}

        {/* Toàn bộ cảng trong danh mục: chấm xanh nước biển, rê chuột xem thông tin */}
        {WORLD_COPY_OFFSETS.flatMap((off) => portDots.map((p, idx) => (
          <CircleMarker
            key={`port-dot-${off}-${p.code}-${idx}`}
            center={[p.lat, p.lon + off]}
            radius={4}
            renderer={portDotRenderer}
            pathOptions={{ color: '#ffffff', weight: 1, fillColor: '#0284c7', fillOpacity: 0.9 }}
          >
            <Tooltip direction="top" offset={[0, -4]} opacity={0.95}>
              <div style={{ fontSize: 12 }}>
                <div style={{ fontWeight: 700, color: '#0284c7' }}>
                  {p.name} ({p.code})
                </div>
                {p.country ? <div>{p.country}</div> : null}
                <div style={{ color: '#6b7280' }}>
                  {p.lat.toFixed(3)}, {p.lon.toFixed(3)}
                </div>
              </div>
            </Tooltip>
          </CircleMarker>
        )))}

        {/* Cảng trong kế hoạch chặng: xanh lá = bắt đầu/kết thúc, vàng = gợi ý ghé, cam = bắt buộc ghé */}
        {WORLD_COPY_OFFSETS.flatMap((off) => (planPorts || [])
          .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon))
          .map((p, idx) => {
            const kind = (p.kind || 'BUNKER').toUpperCase();
            const style = PLAN_PORT_STYLE[kind] ?? PLAN_PORT_STYLE.BUNKER;
            const key = `port-${off}-${kind}-${p.code || idx}-${p.lat}-${p.lon}`;
            return (
              <Marker
                key={key}
                position={[p.lat, p.lon + off]}
                zIndexOffset={1000}
                icon={L.divIcon({
                  className: '',
                  html: `<div style="width:28px;height:28px;border-radius:50%;background:${style.color};color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;line-height:1;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45)">${style.icon}</div>`,
                  iconSize: [28, 28],
                  iconAnchor: [14, 14],
                })}
              >
                <Tooltip permanent direction="top" offset={[0, -14]} opacity={0.95}>
                  <span style={{ fontWeight: 600, color: style.color }}>
                    {style.icon} {p.code || '—'}
                  </span>
                </Tooltip>
                <Popup>
                  <div style={{ fontSize: 12 }}>
                    <div style={{ fontWeight: 700, color: style.color }}>
                      {style.icon} {style.label}
                    </div>
                    <div>
                      <b>{p.name || p.code}</b>
                      {p.code ? ` (${p.code})` : ''}
                    </div>
                    <div style={{ color: '#6b7280' }}>
                      {p.lat.toFixed(3)}, {p.lon.toFixed(3)}
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          }))}

        {/* Map Controller */}
        <MapController
          currentPosition={isMulti ? null : currentPosition ?? null}
          positions={isMulti ? [] : (positions || [])}
          vessels={vessels}
          autoFit={autoFit}
          focusVesselId={focusVesselId}
          fitPoints={fitPoints}
        />

        {/* Tuyến đường dự định Vũng Tàu → Hải Phòng */}
        {plannedPoints.length >= 2 && (
          <Polyline
            positions={plannedPoints}
            color="#6b7280"
            weight={3}
            opacity={0.8}
            dashArray="5, 10"
            smoothFactor={1}
          />
        )}

        {/* ── Multi-vessel mode ── */}
        {isMulti && vessels.map((v, idx) => {
          const vColor = v.color || colorPalette[idx % colorPalette.length];
          const vDashArray = v.dashArray || getDashPattern(idx);
          const vRoute: [number, number][] = (v.route || [])
            .filter(p => p.latitude && p.longitude)
            .map(p => [p.latitude, p.longitude]);
          const hasPos = v.position && v.position.latitude && v.position.longitude;

          return (
            <React.Fragment key={v.id}>
              {/* Route polyline with dashed style */}
              {vRoute.length >= 2 && (
                <Polyline 
                  positions={vRoute} 
                  color={vColor} 
                  weight={2.5} 
                  opacity={0.7}
                  dashArray={vDashArray}
                  smoothFactor={1} 
                />
              )}
              {/* Marker với popup chuyên nghiệp (giống AIS) */}
              {hasPos && (
                <Marker
                  position={[v.position.latitude, v.position.longitude]}
                  icon={makeShipIcon(vColor, v.position.courseOverGround)}
                  eventHandlers={{
                    click: () => onVesselSelect?.(v.id),
                    mouseover: (e: L.LeafletMouseEvent) => (e.target as L.Marker).openPopup(),
                  }}
                >
                  <Popup className="ais-popup" minWidth={340} maxWidth={340} autoPanPadding={[50,50]}>
                    <div className="w-[340px] font-sans" style={{ margin: '-14px -22px -14px -21px' }}>
                      {/* ── Header gradient ── */}
                      <div 
                        className="px-4 py-3 flex items-center gap-3"
                        style={{ background: `linear-gradient(135deg, ${vColor}, ${vColor}dd)` }}
                      >
                        <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 shadow-inner">
                          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2L4 20L8 19.5L12 17L16 19.5L20 20L12 2Z"/>
                          </svg>
                        </div><div className="flex-1 min-w-0">
                          <h3 className="font-bold text-base text-white truncate">{v.name}</h3>
                          <div className="flex items-center gap-2 text-white/80 text-[10px]">
                            {v.imo && <span>IMO {v.imo}</span>}
                            {v.vesselType && <><span>•</span><span>{v.vesselType}</span></>}
                            {v.flag && <><span>•</span><span>Flag: {v.flag}</span></>}
                          </div>
                        </div>
                        <div className="flex-shrink-0">
                          <div className={`w-3 h-3 rounded-full ${v.engineRunning ? 'bg-green-400 animate-ping' : 'bg-gray-400'} shadow-lg`} />
                        </div>
                      </div>

                      {/* ── Body ── */}
                      <div className="px-4 pt-3 pb-2 space-y-3">
                        {/* Hàng 1: Trạng thái động cơ + Thuyền trưởng + Hướng đi */}
                        <div className="grid grid-cols-3 gap-2">
                          <div className="bg-gray-50 rounded-lg p-2 text-center">
                            <div className="flex items-center justify-center gap-1 text-gray-500 text-[9px] uppercase font-semibold mb-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>Engine
                            </div>
                            <span className={`text-xs font-bold ${v.engineRunning ? 'text-green-600' : 'text-gray-500'}`}>
                              {v.engineRunning ? '● Running' : '○ Stopped'}
                            </span>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-2 text-center">
                            <div className="flex items-center justify-center gap-1 text-gray-500 text-[9px] uppercase font-semibold mb-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>Captain
                            </div>
                            <span className="text-xs font-bold text-gray-700 truncate block">{v.captainName || '—'}</span>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-2 text-center">
                            <div className="flex items-center justify-center gap-1 text-gray-500 text-[9px] uppercase font-semibold mb-1">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>Course
                            </div>
                            <span className="text-xs font-bold text-gray-700">{v.position.courseOverGround?.toFixed(0) || '—'}°</span>
                          </div>
                        </div>

                        {/* Progress bar hành trình (nếu có destination) */}
                        {v.departurePort && v.arrivalPort && (
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-[10px] text-gray-500 uppercase font-semibold">
                              <span>{v.departurePort}</span>
                              <span>{v.arrivalPort}</span>
                            </div>
                            <div className="relative h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all" style={{ width: v.position.speedOverGround ? `${Math.min(v.position.speedOverGround * 6, 100)}%` : '30%' }} />
                              <div className="absolute -top-2 right-0 w-0 h-0 border-t-[4px] border-b-[4px] border-l-[6px] border-t-transparent border-b-transparent border-l-emerald-500" />
                            </div>
                            <div className="flex justify-between text-[10px]">
                              <span className="text-gray-400">ATD: {v.atd || '—'}</span>
                              <span className="text-gray-400">ETA: {v.eta || '—'}</span>
                            </div>
                          </div>
                        )}

                        {/* Hàng 2: Thông số kỹ thuật */}
                        <div className="grid grid-cols-4 gap-2 text-center border-t border-gray-100 pt-3">
                          <div>
                            <p className="text-[9px] text-gray-400 uppercase">Speed</p>
                            <p className="text-sm font-bold text-gray-800 font-mono">{v.position.speedOverGround?.toFixed(1) || '0.0'}</p>
                            <p className="text-[9px] text-gray-400">knots</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-gray-400 uppercase">Lat</p>
                            <p className="text-sm font-bold text-gray-800 font-mono">{v.position.latitude.toFixed(3)}°</p>
                            <p className="text-[9px] text-gray-400">N</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-gray-400 uppercase">Lon</p>
                            <p className="text-sm font-bold text-gray-800 font-mono">{v.position.longitude.toFixed(3)}°</p>
                            <p className="text-[9px] text-gray-400">E</p>
                          </div>
                          <div>
                            <p className="text-[9px] text-gray-400 uppercase">Draught</p>
                            <p className="text-sm font-bold text-gray-800 font-mono">{v.draught?.toFixed(1) || '—'}</p>
                            <p className="text-[9px] text-gray-400">m</p>
                          </div>
                        </div>

                        {/* Hàng 3: Timestamp */}
                        <div className="flex items-center justify-between border-t border-gray-100 pt-2">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /><span className="text-[10px] text-gray-500">
                              {v.position.timestamp 
                                ? new Date(v.position.timestamp).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                                : 'N/A'}
                            </span>
                          </div>
                          <button 
                            onClick={(e) => { e.stopPropagation(); navigate(`/vessels/${v.id}`); }}
                            className="bg-primary hover:bg-primary-hover text-white text-[10px] font-bold px-3 py-1.5 rounded-md transition flex items-center gap-1.5 shadow-sm"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>View Details
                          </button>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              )}
            </React.Fragment>
          );
        })}

        {/* ── Single-vessel mode (backward compat) ── */}
        {!isMulti && currentPosition && currentPosition.latitude && currentPosition.longitude && (
          <Marker
            position={[currentPosition.latitude, currentPosition.longitude]}
            icon={makeShipIcon('#3b82f6', currentPosition.courseOverGround)}
          >
            <Popup className="ais-popup" minWidth={300} autoPanPadding={[50,50]}>
              <div className="w-[300px] font-sans !m-0" style={{ margin: '-13px -20px -13px -19px' }}>
                <div className="font-bold text-base px-3 py-2 border-b bg-gray-50 rounded-t-lg">🚢 Vessel Position</div>
                <div className="p-3 space-y-2 text-sm">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-gray-700">
                    <span className="text-gray-500 text-xs">Latitude:</span>
                    <span className="font-mono text-sm">{currentPosition.latitude.toFixed(6)}°</span>
                    <span className="text-gray-500 text-xs">Longitude:</span>
                    <span className="font-mono text-sm">{currentPosition.longitude.toFixed(6)}°</span>
                    {currentPosition.speedOverGround != null && (
                      <>
                        <span className="text-gray-500 text-xs">Speed Over Ground:</span>
                        <span className="font-semibold text-sm">{currentPosition.speedOverGround.toFixed(1)} kn</span>
                      </>
                    )}
                    {currentPosition.courseOverGround != null && (
                      <>
                        <span className="text-gray-500 text-xs">Course Over Ground:</span>
                        <span className="font-semibold text-sm">{currentPosition.courseOverGround.toFixed(1)}°</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Single-mode route */}
        {!isMulti && routePoints.length >= 2 && (
          <Polyline
            positions={routePoints}
            color="#3b82f6"
            weight={3}
            opacity={0.7}
            smoothFactor={1}
          />
        )}
      </MapContainer>
    </div>
  );
};
