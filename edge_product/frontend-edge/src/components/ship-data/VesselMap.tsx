import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import plannedRouteData from '../../assets/planned-route.json';
import { useTranslationSafe } from '@/contexts/I18nContext';

// Fix default marker icon issue with bundlers
// @ts-expect-error _getIconUrl is internal Leaflet API
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

export interface GpsPoint {
  latitude: number;
  longitude: number;
  speedOverGround?: number;
  courseOverGround?: number;
  timestamp?: string;
  satellitesUsed?: number;
}

interface VesselMapProps {
  positions: GpsPoint[];
  currentPosition: GpsPoint | null;
  autoFit?: boolean;
  height?: string;
  className?: string;
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
          html: `<div style="font-weight:bold;color:#000000;text-shadow:0 0 4px white,0 0 4px white;font-size:14px;white-space:nowrap;background:rgba(255,255,255,0.9);padding:2px 8px;border-radius:4px;border:1.5px solid #000000;">${name}</div>`,
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        }),
      }).addTo(map)
    );
    return () => markers.forEach(m => m.removeFrom(map));
  }, [map]);
  return null;
}

function MapController({ currentPosition, positions, autoFit }: {
  currentPosition: GpsPoint | null;
  positions: GpsPoint[];
  autoFit: boolean;
}) {
  const map = useMap();
  const prevLat = useRef<number | null>(null);
  const prevLng = useRef<number | null>(null);

  useEffect(() => {
    if (!currentPosition) return;
    if (prevLat.current === null && prevLng.current === null) {
      map.setView([currentPosition.latitude, currentPosition.longitude], 13);
      prevLat.current = currentPosition.latitude;
      prevLng.current = currentPosition.longitude;
      return;
    }
    if (autoFit && prevLat.current && prevLng.current) {
      const dist = Math.sqrt(
        Math.pow(currentPosition.latitude - prevLat.current, 2) +
        Math.pow(currentPosition.longitude - prevLng.current, 2)
      );
      if (dist > 0.0001) {
        map.panTo([currentPosition.latitude, currentPosition.longitude], { animate: true, duration: 0.5 });
      }
    }
    prevLat.current = currentPosition.latitude;
    prevLng.current = currentPosition.longitude;
  }, [currentPosition, map, autoFit]);

  useEffect(() => {
    if (positions.length < 2 || !autoFit) return;
    const bounds = L.latLngBounds(
      positions.map(p => [p.latitude, p.longitude] as [number, number])
    );
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
  }, [positions, map, autoFit]);

  return null;
}

export const VesselMap: React.FC<VesselMapProps> = ({
  positions,
  currentPosition,
  autoFit = true,
  height = '600px',
  className = '',
}) => {
  const { t } = useTranslationSafe();
  const defaultCenter: [number, number] = currentPosition
    ? [currentPosition.latitude, currentPosition.longitude]
    : [10.7769, 106.7009];

  const routePoints: [number, number][] = positions
    .filter(p => p.latitude && p.longitude)
    .map(p => [p.latitude, p.longitude]);

  const plannedPoints: [number, number][] = (plannedRouteData as any[])
    .filter(p => p.latitude && p.longitude)
    .map(p => [p.latitude, p.longitude]);

  return (
    // isolate: Leaflet tự đặt z-index tới 1000 cho các lớp và nút điều khiển của nó. Không
    // nhốt lại thì chúng cạnh tranh với cả trang, xuyên qua lớp phủ của hộp thoại và các
    // bảng thả xuống. `isolation: isolate` tạo một ngữ cảnh xếp lớp riêng, mọi thứ bên trong
    // bản đồ chỉ so nhau chứ không leo ra ngoài thẻ.
    <div className={`isolate rounded-xl overflow-hidden shadow-lg border border-gray-200 dark:border-gray-700 ${className}`}>
      <MapContainer
        center={defaultCenter}
        zoom={13}
        style={{ height, width: '100%' }}
        scrollWheelZoom={true}
        zoomControl={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <VietnameseLabels />

        <MapController currentPosition={currentPosition} positions={positions} autoFit={autoFit} />

        {currentPosition && currentPosition.latitude && currentPosition.longitude && (
          <Marker position={[currentPosition.latitude, currentPosition.longitude]} icon={makeShipIcon('#3b82f6', currentPosition.courseOverGround)}>
            <Popup>
              <div className="text-sm min-w-[180px]">
                <div className="font-bold text-base mb-1">🚢 {t('map.shipPosition')}</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-gray-700">
                  <span className="text-gray-500">{t('map.lat')}:</span>
                  <span className="font-mono">{currentPosition.latitude.toFixed(6)}°</span>
                  <span className="text-gray-500">{t('map.lon')}:</span>
                  <span className="font-mono">{currentPosition.longitude.toFixed(6)}°</span>
                  {currentPosition.speedOverGround != null && (
                    <>
                      <span className="text-gray-500">{t('map.sog')}:</span>
                      <span className="font-semibold">{currentPosition.speedOverGround.toFixed(1)} kn</span>
                    </>
                  )}
                  {currentPosition.courseOverGround != null && (
                    <>
                      <span className="text-gray-500">{t('map.cog')}:</span>
                      <span className="font-semibold">{currentPosition.courseOverGround.toFixed(1)}°</span>
                    </>
                  )}
                  {currentPosition.timestamp && (
                    <>
                      <span className="text-gray-500">{t('map.time')}:</span>
                      <span>{new Date(currentPosition.timestamp).toLocaleTimeString()}</span>
                    </>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {routePoints.length >= 2 && (
          <Polyline positions={routePoints} color="#3b82f6" weight={3} opacity={0.7} smoothFactor={1} />
        )}
        {plannedPoints.length >= 2 && (
          <Polyline positions={plannedPoints} color="#6b7280" weight={3} opacity={0.8} dashArray="5, 10" smoothFactor={1} />
        )}
      </MapContainer>
    </div>
  );
};
