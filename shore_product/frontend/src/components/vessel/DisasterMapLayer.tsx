import React, { useEffect, useState } from 'react';
import { GeoJSON, TileLayer } from 'react-leaflet';
import L from 'leaflet';

interface DisasterMapLayerProps {
  visible: boolean;
}

export const DisasterMapLayer: React.FC<DisasterMapLayerProps> = ({ visible }) => {
  const [geoData, setGeoData] = useState<any>(null);
  const [rainViewerUrl, setRainViewerUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;

    const fetchJson = async (url: string) => {
      const response = await fetch(url);
      const ct = (response.headers.get('content-type') || '').toLowerCase();
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      // Proxy misconfig returns SPA HTML — catch before JSON.parse
      if (ct.includes('text/html') || text.trimStart().startsWith('<!DOCTYPE') || text.trimStart().startsWith('<html')) {
        throw new Error('Proxy /gdacs tra HTML thay vi JSON — kiem tra nginx/vite proxy');
      }
      try {
        return JSON.parse(text);
      } catch {
        throw new Error('Khong parse duoc JSON tu ' + url);
      }
    };

    const fetchDisasters = async () => {
      setLoading(true);
      setError(null);
      try {
        // GDACS bat buoc eventtype; lay TC (bao)
        const data = await fetchJson(
          '/gdacs/gdacsapi/api/events/geteventlist/MAP?eventtype=TC&alertlevel=Green,Orange,Red'
        );
        if (data && Array.isArray(data.features)) {
          data.features = data.features.filter((f: any) => f.properties?.eventtype === 'TC');
        }
        setGeoData(data);

        try {
          const rvData = await fetchJson('/rainviewer/public/weather-maps.json');
          if (rvData?.radar?.past?.length > 0) {
            const latest = rvData.radar.past[rvData.radar.past.length - 1];
            setRainViewerUrl(`${rvData.host}${latest.path}/256/{z}/{x}/{y}/2/1_1.png`);
          }
        } catch (rvErr) {
          console.warn('RainViewer optional fail:', rvErr);
        }
      } catch (err: any) {
        console.error('Error fetching GDACS data:', err);
        setError(err?.message || String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchDisasters();
    const interval = setInterval(fetchDisasters, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, [visible]);

  if (!visible) return null;

  if (loading && !geoData) {
    return null;
  }

  if (error && !geoData) {
    console.warn('GDACS layer error:', error);
    return null;
  }

  if (!geoData) return null;

  // Custom hàm render marker cho các điểm thay vì marker mặc định
  const pointToLayer = (feature: any, latlng: L.LatLng) => {
    const props = feature.properties;
    
    // GDACS cung cấp sẵn URL icon theo loại thảm họa và mức độ
    const iconUrl = props.icon || 'https://www.gdacs.org/images/gdacs_icons/maps/Green/EQ.png'; 
    
    // Xác định màu đường viền dựa trên alert level
    let borderColor = '#22c55e'; // Green
    if (props.alertlevel === 'Orange') borderColor = '#f97316';
    if (props.alertlevel === 'Red') borderColor = '#ef4444';

    const customIcon = L.divIcon({
      className: 'disaster-marker',
      html: `
        <div style="
          width: 32px; 
          height: 32px; 
          background-color: white; 
          border-radius: 50%; 
          border: 3px solid ${borderColor};
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          overflow: hidden;
          position: relative;
        ">
          ${props.alertlevel === 'Red' ? `<div style="position: absolute; inset: 0; border-radius: 50%; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite; background-color: ${borderColor}; opacity: 0.3;"></div>` : ''}
          <img src="${iconUrl}" style="width: 20px; height: 20px; object-fit: contain; z-index: 1;" alt="icon" onerror="this.src='https://www.gdacs.org/images/gdacs_icons/maps/Green/EQ.png'" />
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
      popupAnchor: [0, -16]
    });

    return L.marker(latlng, { icon: customIcon });
  };

  // Custom hàm render popup khi click vào marker hoặc polygon
  const onEachFeature = (feature: any, layer: L.Layer) => {
    const props = feature.properties;
    if (props && props.name) {
      // Định dạng ngày
      const fromDate = props.fromdate ? new Date(props.fromdate).toLocaleString('vi-VN') : 'N/A';
      
      const popupContent = `
        <div style="font-family: ui-sans-serif, system-ui, sans-serif; min-width: 250px;">
          <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 8px; margin-bottom: 8px; display: flex; align-items: center; gap: 8px;">
            <img src="${props.icon}" style="width: 24px; height: 24px;" alt="icon"/>
            <h3 style="margin: 0; font-size: 0.875rem; font-weight: 700; color: #111827;">${props.name}</h3>
          </div>
          <div style="font-size: 0.8125rem; color: #4b5563; line-height: 1.5;">
            <p style="margin: 4px 0;"><strong>Quốc gia:</strong> ${props.country || 'N/A'}</p>
            <p style="margin: 4px 0;"><strong>Thời gian:</strong> ${fromDate}</p>
            <p style="margin: 4px 0;"><strong>Mức độ:</strong> 
              <span style="font-weight: 600; color: ${props.alertlevel === 'Red' ? '#ef4444' : props.alertlevel === 'Orange' ? '#f97316' : '#22c55e'}">
                ${props.alertlevel || 'Unknown'}
              </span>
            </p>
            ${props.severitydata?.severitytext ? `<p style="margin: 4px 0;"><strong>Tác động:</strong> ${props.severitydata.severitytext}</p>` : ''}
            <div style="margin-top: 10px; background: #f3f4f6; padding: 8px; border-radius: 4px; font-size: 0.8125rem;">
              ${props.htmldescription || props.description || 'Không có mô tả chi tiết.'}
            </div>
          </div>
          <div style="margin-top: 10px; text-align: right;">
            <a href="https://www.gdacs.org/report.aspx?eventid=${props.eventid}&episodeid=${props.episodeid}&eventtype=${props.eventtype}" target="_blank" rel="noopener noreferrer" style="font-size: 0.8125rem; color: #2563eb; text-decoration: none; font-weight: 600;">Xem báo cáo gốc ↗</a>
          </div>
        </div>
      `;
      layer.bindPopup(popupContent, { maxWidth: 320 });
    }
  };

  // Style cho polygon (vùng bị ảnh hưởng)
  const styleFeature = (feature: any) => {
    const props = feature.properties;
    let color = '#22c55e'; // Green
    if (props.alertlevel === 'Orange') color = '#f97316';
    if (props.alertlevel === 'Red') color = '#ef4444';

    return {
      fillColor: color,
      weight: 1.5,
      opacity: 0.8,
      color: color,
      dashArray: '3',
      fillOpacity: 0.15
    };
  };

  return (
    <>
      {rainViewerUrl && (
        <TileLayer
          url={rainViewerUrl}
          opacity={0.6}
          zIndex={500}
          maxNativeZoom={7}
        />
      )}
      <GeoJSON 
        key={geoData.features?.length || 'geo'} 
        data={geoData} 
        pointToLayer={pointToLayer}
        onEachFeature={onEachFeature}
        style={styleFeature}
      />
      {geoData.features && geoData.features.length === 0 && (
        <div className="absolute top-20 right-4 z-[1000] bg-white px-4 py-3 rounded-lg shadow-lg border border-yellow-200 text-sm font-medium text-yellow-800 flex items-center gap-2 max-w-xs animate-fade-in-down">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          <div>
            Hiện tại không có cơn bão hoặc áp thấp nhiệt đới (Tropical Cyclone) nào đang hoạt động trên toàn cầu.
          </div>
        </div>
      )}
      {!geoData.features?.length && rainViewerUrl && (
        <div className="absolute top-20 right-4 z-[1000] bg-white px-4 py-3 rounded-lg shadow-lg border border-accent/30 text-sm font-medium text-primary flex items-center gap-2 max-w-xs animate-fade-in-down">
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"></path></svg>
          <div>
            Đang hiển thị bản đồ mây mưa (Radar). Các vùng màu là nơi có mưa dông / nhiễu động.
          </div>
        </div>
      )}
    </>
  );
};
