import { useState, useEffect } from 'react';
import { useTranslationSafe } from '@/contexts/I18nContext';
import { VesselMap, type GpsPoint } from '@/components/ship-data/VesselMap';
import { fetchVesselNavigation } from '@/services/vessel-navigation';

export function NavigationPage() {
  const { t } = useTranslationSafe();
  const [currentPosition, setCurrentPosition] = useState<GpsPoint | null>(null);
  const [route, setRoute] = useState<GpsPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedHours, setSelectedHours] = useState(24);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchPosition = async () => {
    try {
      const result = await fetchVesselNavigation(selectedHours);
      setCurrentPosition(result.currentPosition);
      setRoute(result.route);
      setError(null);
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Failed to load position data');
      console.error('NavigationPage error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosition();
  }, [selectedHours]);

  // Auto-refresh mỗi 30s
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchPosition, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const timeOptions = [
    { label: '6h', hours: 6 },
    { label: '24h', hours: 24 },
    { label: '3d', hours: 72 },
    { label: '7d', hours: 168 },
  ];

  return (
    <div className="h-full w-full overflow-y-auto bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="p-4 md:p-6">
        {/* Header */}
        <div className="mb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            🗺️ {t('navigation.title')}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Real-time GPS position & route tracking
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-4 bg-white dark:bg-gray-800 rounded-xl p-3 shadow-sm border border-gray-200 dark:border-gray-700">
          {timeOptions.map(opt => (
            <button
              key={opt.hours}
              onClick={() => { setSelectedHours(opt.hours); setLoading(true); }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedHours === opt.hours
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              {opt.label}
            </button>
          ))}

          <label className="flex items-center gap-2 ml-2 text-sm text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            Auto-refresh
          </label>

          <button
            onClick={() => { fetchPosition(); }}
            className="ml-auto px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            ↻ Refresh
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-red-700 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Map */}
        {loading ? (
          <div className="flex items-center justify-center h-[500px] bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="text-gray-500">Loading map...</div>
          </div>
        ) : (
          <VesselMap
            currentPosition={currentPosition}
            positions={route}
            autoFit={true}
            height="500px"
          />
        )}

        {/* Info Bar */}
        {currentPosition && (
          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <InfoCard label="Latitude" value={`${currentPosition.latitude.toFixed(6)}°`} />
            <InfoCard label="Longitude" value={`${currentPosition.longitude.toFixed(6)}°`} />
            <InfoCard label="SOG" value={currentPosition.speedOverGround != null ? `${currentPosition.speedOverGround.toFixed(1)} kn` : 'N/A'} />
            <InfoCard label="COG" value={currentPosition.courseOverGround != null ? `${currentPosition.courseOverGround.toFixed(1)}°` : 'N/A'} />
            <InfoCard label="Satellites" value={currentPosition.satellitesUsed ? `${currentPosition.satellitesUsed}` : 'N/A'} />
            <InfoCard label="Route Points" value={`${route.length}`} />
            <InfoCard label="Last Update" value={currentPosition.timestamp ? new Date(currentPosition.timestamp).toLocaleTimeString() : 'N/A'} />
            <InfoCard label="Auto Refresh" value={autoRefresh ? 'ON' : 'OFF'} />
          </div>
        )}
      </div>
    </div>
  );
}

const InfoCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
    <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</div>
    <div className="text-lg font-semibold text-gray-900 dark:text-white mt-1 font-mono">{value}</div>
  </div>
);
