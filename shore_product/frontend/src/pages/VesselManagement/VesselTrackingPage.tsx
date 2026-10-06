import React, { useState, useEffect, useCallback } from 'react';
import { VesselMap, type VesselTrackData } from '@/components/vessel/VesselMap';
import axios from 'axios';
import { getAuthToken } from '@/services/api.client';

const API_BASE = '/api';

interface PositionResponse {
  latest: {
    id: string;
    timestamp: string;
    latitude: number;
    longitude: number;
    speedOverGround: number | null;
    courseOverGround: number | null;
    source: string;
    originNode: string;
    createdAt: string;
  } | null;
  route: Array<{
    id: string;
    timestamp: string;
    latitude: number;
    longitude: number;
    speedOverGround: number | null;
    courseOverGround: number | null;
    source: string;
    originNode: string;
    createdAt: string;
  }>;
  stats: {
    totalPoints: number;
    distanceNm: number;
    avgSpeedKn: number;
  };
  engine: {
    timestamp: string;
    engineId: string;
    rpm: number | null;
    isRunning: boolean;
    loadPercent: number | null;
  } | null;
}

interface VesselOption {
  id: string;
  name: string;
  imo: string;
  originNode: string;
}

// Luôn lấy toàn bộ dữ liệu (≈ 11 năm)
const ALL_HOURS = 99999;

// Color palette for vessels on the map
const VESSEL_COLORS = [
  '#ef4444', '#3b82f6', '#22c55e', '#f59e0b',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  '#6366f1', '#84cc16', '#06b6d4', '#d946ef',
];

// Dash patterns for different routes
const DASH_PATTERNS = [
  '2,4',    // Route 1: South
  '5,8',    // Route 2: North
  '3,6',    // Route 3: Central
  '4,7',    // Route 4: Southwest
  '6,9',    // Route 5: Regional
];

// ── Helpers ──
const statusLabel = (v: VesselTrackData) => {
  if (v.engineRunning) return { text: 'Active', class: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10' };
  return { text: 'Idle', class: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10' };
};

const courseToCompass = (deg: number): string => {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  return dirs[Math.round(deg / 22.5) % 16];
};

export const VesselTrackingPage: React.FC = () => {
  const [vessels, setVessels] = useState<VesselOption[]>([]);
  const selectedHours = ALL_HOURS;
  const [allVesselData, setAllVesselData] = useState<VesselTrackData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focusVesselId, setFocusVesselId] = useState<string | null>(null);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Lấy danh sách tàu và dữ liệu vị trí của tất cả
  useEffect(() => {
    const fetchVessels = async () => {
      try {
        const token = getAuthToken();
        const res = await axios.get(`${API_BASE}/vessels`, {
          headers: { Authorization: `Bearer ${token}` },
          params: { pageSize: 100 },
        });
        const data = res.data;
        const list = (data?.data || data || []).map((v: any) => ({
          id: v.id,
          name: v.name || v.vesselName || 'Unknown',
          imo: v.imo || v.imoNumber || '',
          originNode: v.originNode || '',
        }));
        setVessels(list);
      } catch (err) {
        console.error('Failed to load vessels:', err);
      }
    };
    fetchVessels();
  }, []);

  // Lấy dữ liệu vị trí cho TẤT CẢ tàu
  const fetchAllPositions = useCallback(async () => {
    if (vessels.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const token = getAuthToken();
      const headers = { Authorization: `Bearer ${token}` };
      
      const results = await Promise.allSettled(
        vessels.map(v =>
          axios.get<PositionResponse>(
            `${API_BASE}/vessel-telemetry/vessel/${v.id}/realtime`,
            { headers, params: { hours: selectedHours } }
          )
        )
      );

      const trackData: VesselTrackData[] = [];

      // Fetch thêm thông tin chi tiết cho từng tàu (IMO, Captain, v.v.)
      const vesselDetailPromises = vessels.map(v =>
        axios.get(`${API_BASE}/vessels/${v.id}`, { headers }).catch(() => null)
      );
      const vesselDetailResults = await Promise.allSettled(vesselDetailPromises);

      results.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          const d = result.value.data;
          const latest = d.latest;
          if (!latest) return;
          const v = vessels[idx];
          
          // Lấy thông tin bổ sung từ vessel detail
          let imo = v.imo;
          let captainName: string | undefined;
          let engineRunning: boolean | undefined;
          const detailResult = vesselDetailResults[idx];
          if (detailResult.status === 'fulfilled' && detailResult.value?.data) {
            const detail = detailResult.value.data;
            imo = detail.imo || detail.imoNumber || v.imo;
            // Nếu có crew trên tàu, lấy thuyền trưởng
            if (detail.crew && Array.isArray(detail.crew)) {
              const captain = detail.crew.find((c: any) => 
                c.rank?.toLowerCase()?.includes('captain') || 
                c.position?.toLowerCase()?.includes('master') ||
                c.rankName?.toLowerCase()?.includes('thuyền trưởng')
              );
              if (captain) {
                captainName = captain.fullName || captain.name || `${captain.firstName || ''} ${captain.lastName || ''}`.trim();
              }
            }
          }

          // Lấy trạng thái động cơ từ realtime API (engine_data sync từ Edge)
          engineRunning = d.engine?.isRunning;

          trackData.push({
            id: v.id,
            name: v.name,
            imo: imo,
            color: VESSEL_COLORS[idx % VESSEL_COLORS.length],
            dashArray: DASH_PATTERNS[idx % DASH_PATTERNS.length],
            position: {
              latitude: latest.latitude,
              longitude: latest.longitude,
              speedOverGround: latest.speedOverGround ?? undefined,
              courseOverGround: latest.courseOverGround ?? undefined,
              timestamp: latest.timestamp,
            },
            route: (d.route || []).map(p => ({
              latitude: p.latitude,
              longitude: p.longitude,
              speedOverGround: p.speedOverGround ?? undefined,
              courseOverGround: p.courseOverGround ?? undefined,
              timestamp: p.timestamp,
            })),
            captainName,
            engineRunning,
            flag: undefined, // sẽ fetch nếu có
          });
        }
      });

      setAllVesselData(trackData);
      if (trackData.length === 0) {
        setError('Không có tàu nào có dữ liệu vị trí.');
      }
      // Lần load đầu tiên thành công — tắt autoFit cho các lần sau
      if (isFirstLoad) setIsFirstLoad(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to load position data');
      console.error('Failed to load positions:', err);
    } finally {
      setLoading(false);
    }
  }, [vessels, selectedHours]);

  // Auto-refresh mỗi 30s
  useEffect(() => {
    fetchAllPositions();
    const interval = setInterval(fetchAllPositions, 10000);
    return () => clearInterval(interval);
  }, [fetchAllPositions]);

  // Stats
  const activeVessels = allVesselData.filter(v => v.engineRunning).length;
  const avgSpeed = allVesselData.length > 0
    ? allVesselData.reduce((s, v) => s + (v.position.speedOverGround ?? 0), 0) / allVesselData.length
    : 0;

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 overflow-hidden">
      {/* ── Header (compact) ── */}
      <div className="relative flex-shrink-0">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 via-indigo-500/5 to-purple-600/5 dark:from-blue-600/10 dark:via-indigo-500/10 dark:to-purple-600/10" />
        <div className="relative px-3 md:px-4 pt-2 md:pt-3 pb-1.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="hidden md:inline-flex bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-base w-8 h-8 rounded-lg flex items-center justify-center shadow-md shadow-blue-500/20 flex-shrink-0">
                🗺️
              </span>
              <div className="min-w-0">
                <h1 className="text-lg md:text-xl font-extrabold text-gray-900 dark:text-white truncate flex items-center gap-2">
                  <span className="md:hidden bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-sm w-7 h-7 rounded-lg flex items-center justify-center shadow-md shadow-blue-500/20 flex-shrink-0">
                    🗺️
                  </span>
                  Vessel Tracking
                  <span className="hidden sm:inline text-xs font-normal text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-md">Real-time GPS</span>
                </h1>
              </div>
            </div>

            {/* Quick stats + refresh — inline */}
            {allVesselData.length > 0 && (
              <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
                <div className="flex items-center gap-2 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg px-2.5 py-1.5 shadow-xs border border-gray-200/60 dark:border-gray-700/60 text-[11px]">
                  <span className="flex items-center gap-1 text-gray-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{activeVessels}</span>
                  </span>
                  <span className="text-gray-300 dark:text-gray-600">|</span>
                  <span className="text-gray-500">
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{avgSpeed.toFixed(1)}</span>
                    <span className="hidden xs:inline"> kn</span>
                  </span>
                  <span className="text-gray-300 dark:text-gray-600">|</span>
                  <span className="text-gray-500">
                    <span className="font-semibold text-gray-800 dark:text-gray-200">{allVesselData.length}</span>
                    <span className="hidden xs:inline"> vessel</span>
                  </span>
                </div>
                <button
                  onClick={fetchAllPositions}
                  disabled={loading}
                  className="px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 transition-all duration-200 flex items-center gap-1 shadow-md shadow-blue-500/15 active:scale-95"
                >
                  {loading ? (
                    <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  )}
                  <span className="hidden sm:inline">Refresh</span>
                </button>
              </div>
            )}
            {allVesselData.length === 0 && !loading && (
              <button
                onClick={fetchAllPositions}
                disabled={loading}
                className="px-2.5 py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs font-semibold hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50 transition-all duration-200 flex items-center gap-1 shadow-md shadow-blue-500/15"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Load Data
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Main content: map fills remaining space ── */}
      <div className="flex-1 px-3 md:px-4 pb-3 md:pb-4 min-h-0 flex flex-col">
        {/* Controls Bar */}
        {allVesselData.length > 0 && (
          <div className="flex-shrink-0 mb-1.5 bg-white/90 dark:bg-gray-800/90 backdrop-blur-sm rounded-xl px-2 py-1.5 shadow-sm border border-gray-200/70 dark:border-gray-700/70 overflow-x-auto">
            <div className="flex items-center gap-1">
              {allVesselData.map((v, idx) => (
                <button
                  key={v.id}
                  onClick={() => setFocusVesselId(v.id)}
                  className={`group flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all duration-200 whitespace-nowrap border ${
                    focusVesselId === v.id
                      ? 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600'
                      : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <span className="inline-block w-2 h-2 rounded-full ring-2 ring-white dark:ring-gray-800" style={{ backgroundColor: v.color }} />
                  <span className="text-gray-700 dark:text-gray-200">{v.name}</span><span className="text-[10px] text-gray-400">{v.position.speedOverGround?.toFixed(1) || '—'}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex-shrink-0 mb-1.5 p-2 bg-red-50/90 dark:bg-red-900/30 backdrop-blur-sm border border-red-200 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 text-xs flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" /></svg>
            {error}
          </div>
        )}

        {/* Map area */}
        {loading && allVesselData.length === 0 ? (
          <div className="flex-1 flex items-center justify-center bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-2xl border border-gray-200/70 dark:border-gray-700/70 shadow-lg">
            <div className="text-center">
              <div className="relative inline-flex mb-4">
                <div className="w-10 h-10 border-4 border-accent/30 dark:border-blue-800 rounded-full" />
                <div className="absolute inset-0 w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
              </div>
              <div className="text-gray-500 dark:text-gray-400 text-sm font-medium">Loading vessel positions...</div>
              <div className="text-gray-400 dark:text-gray-500 text-xs mt-1">Fetching real-time GPS data</div>
            </div>
          </div>
        ) : (
          <div className="flex-1 relative">
            {/* Toggle sidebar button */}
            {allVesselData.length > 0 && (
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className={`absolute top-2 left-2 z-[1001] w-7 h-7 rounded-lg flex items-center justify-center transition-all duration-200 shadow-md backdrop-blur-sm border ${
                  sidebarOpen
                    ? 'bg-white/90 dark:bg-gray-800/90 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300'
                    : 'bg-blue-600/90 border-blue-500/50 text-white hover:bg-primary-hover'
                }`}
                title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {sidebarOpen
                    ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                    : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
                  }
                </svg>
              </button>
            )}

            {/* Danh sách tàu — overlay bên trái trên map */}
            {allVesselData.length > 0 && (
              <div
                className={`absolute top-2 left-2 z-[1000] transition-all duration-300 ease-in-out ${
                  sidebarOpen ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'
                }`}
                style={{ maxHeight: 'calc(100% - 16px)' }}
              >
                <div className="bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl rounded-xl shadow-2xl border border-gray-200/80 dark:border-gray-700/80 w-64 overflow-hidden">
                  {/* Header */}
                  <div className="px-3 py-2.5 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
                        <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                      </div>
                      <div><h3 className="text-xs font-bold text-gray-800 dark:text-gray-100">Vessels</h3><p className="text-[9px] text-gray-400">{allVesselData.length} tracked</p></div>
                    </div>
                  </div>

                  {/* Scrollable list */}
                  <div className="overflow-y-auto overscroll-contain" style={{ maxHeight: 'min(380px, calc(100vh - 200px))' }}>
                    <div className="py-0.5">
                      {allVesselData.map((v, idx) => {
                        const isFocus = focusVesselId === v.id;
                        return (
                          <button
                            key={v.id}
                            onClick={() => setFocusVesselId(v.id)}
                            className={`w-full text-left relative transition-all duration-150 ${
                              isFocus
                                ? 'bg-gradient-to-r from-blue-50 to-indigo-50/50 dark:from-blue-900/20 dark:to-indigo-900/10'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                            }`}
                          >
                            <div className="flex items-center gap-2 pl-3 pr-2 py-2">
                              {/* Vessel icon */}
                              <div className="relative flex-shrink-0">
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${v.color}18` }}>
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill={v.color}>
                                    <path d="M12 2L4 20L8 19.5L12 17L16 19.5L20 20L12 2Z" />
                                  </svg>
                                </div>
                                <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-white dark:border-gray-900 ${
                                  v.engineRunning ? 'bg-emerald-400' : 'bg-gray-300'
                                }`} />
                              </div>
                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{v.name}</div><div className="text-[10px] text-gray-500">
                                  {v.position.speedOverGround != null ? `${v.position.speedOverGround.toFixed(1)} kn` : '— kn'}{v.position.courseOverGround != null && ` • ${v.position.courseOverGround.toFixed(0)}°`}
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Map fills remaining space */}
            <VesselMap
              vessels={allVesselData.length > 0 ? allVesselData : undefined}
              positions={[]}
              currentPosition={null}
              autoFit={isFirstLoad}
              height="100%"
              focusVesselId={focusVesselId ?? undefined}
              onVesselSelect={(id) => setFocusVesselId(id)}
            />
          </div>
        )}

        {/* Compact stats bar */}
        {allVesselData.length > 0 && (
          <div className="flex-shrink-0 flex items-center gap-1.5 mt-1.5 bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm rounded-lg px-3 py-1.5 shadow-xs border border-gray-200/60 dark:border-gray-700/60">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span className="font-semibold text-gray-800 dark:text-gray-200">{allVesselData.length}</span> vessels
            </div>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <div className="flex items-center gap-1 text-[11px] text-gray-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{activeVessels}</span> active
            </div>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <div className="text-[11px] text-gray-500">
              <span className="font-semibold text-gray-800 dark:text-gray-200">{avgSpeed.toFixed(1)}</span> kn avg
            </div>
            <span className="text-gray-300 dark:text-gray-600">|</span>
            <div className="text-[11px] text-gray-500">
              Updated <span className="font-medium text-gray-700 dark:text-gray-300">{new Date().toLocaleTimeString()}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
