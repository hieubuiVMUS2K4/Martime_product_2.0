import { PermissionGate } from '@/components/auth/PermissionGate'
import React, { useState, useEffect } from 'react';
import { LogbookGrid } from '../../components/common/LogbookGrid';
import { MaritimeInput } from '../../components/common/MaritimeInput';
import { CoordinatePicker } from '../../components/common/CoordinatePicker';
import { toast } from 'sonner';
import { logbookService } from '../../services/logbook.service';
import type { WatchkeepingLogResponseDto } from '../../types/logbook.types';
import { useTranslationSafe } from '@/contexts/I18nContext';

// Watch periods (4-hour watches)
const WATCH_PERIODS = [
  { code: '00-04', name: '00:00 - 04:00 (Middle Watch)' },
  { code: '04-08', name: '04:00 - 08:00 (Morning Watch)' },
  { code: '08-12', name: '08:00 - 12:00 (Forenoon Watch)' },
  { code: '12-16', name: '12:00 - 16:00 (Afternoon Watch)' },
  { code: '16-20', name: '16:00 - 20:00 (First Dog/Second Dog)' },
  { code: '20-24', name: '20:00 - 24:00 (First Watch)' },
];

const WATCH_TYPES = [
  { value: 'NAVIGATION', label: 'Navigation Watch (Bridge)' },
  { value: 'ENGINE', label: 'Engine Watch (Engine Room)' },
];

// Douglas Sea Scale
const SEA_STATES = [
  { value: 'Calm', label: '0 - Calm (Glassy)' },
  { value: 'Smooth', label: '1 - Smooth (Rippled)' },
  { value: 'Slight', label: '2 - Slight' },
  { value: 'Moderate', label: '3 - Moderate' },
  { value: 'Rough', label: '4 - Rough' },
  { value: 'Very Rough', label: '5 - Very Rough' },
  { value: 'High', label: '6 - High' },
  { value: 'Very High', label: '7 - Very High' },
  { value: 'Phenomenal', label: '8 - Phenomenal' },
];

const VISIBILITY_CONDITIONS = [
  { value: 'Good', label: 'Good (>5 NM)' },
  { value: 'Moderate', label: 'Moderate (2-5 NM)' },
  { value: 'Poor', label: 'Poor (0.5-2 NM)' },
  { value: 'Fog', label: 'Fog (<0.5 NM)' },
];

const FATIGUE_LEVELS = [
  { value: 'LOW', label: '🟢 Low Risk' },
  { value: 'MEDIUM', label: '🟡 Medium Risk' },
  { value: 'HIGH', label: '🔴 High Risk' },
];

const toTimeInputValue = (value?: string | null) => {
  if (!value) return '';
  if (/^\d{2}:\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

const toWatchDateTime = (watchDate: string, time?: string) => {
  if (!time) return undefined;
  if (!watchDate || !/^\d{2}:\d{2}$/.test(time)) return undefined;
  const date = new Date(`${watchDate}T${time}:00`);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

export const WatchkeepingPage: React.FC = () => {
  const { locale, t } = useTranslationSafe();
  const isVi = locale === 'vi';

  const translatedWatchPeriods = WATCH_PERIODS.map(wp => {
    let name = wp.name;
    if (isVi) {
      if (wp.code === '00-04') name = '00:00 - 04:00 (Middle Watch - Giữa ca)';
      else if (wp.code === '04-08') name = '04:00 - 08:00 (Morning Watch - Sáng)';
      else if (wp.code === '08-12') name = '08:00 - 12:00 (Forenoon Watch - Trưa)';
      else if (wp.code === '12-16') name = '12:00 - 16:00 (Afternoon Watch - Chiều)';
      else if (wp.code === '16-20') name = '16:00 - 20:00 (Dog Watches - Ca gãy)';
      else if (wp.code === '20-24') name = '20:00 - 24:00 (First Watch - Tối)';
    }
    return { ...wp, name };
  });

  const translatedWatchTypes = WATCH_TYPES.map(wt => {
    let label = wt.label;
    if (isVi) {
      if (wt.value === 'NAVIGATION') label = 'Ca trực Boong (Buồng lái)';
      else if (wt.value === 'ENGINE') label = 'Ca trực Máy (Buồng máy)';
    }
    return { ...wt, label };
  });

  const translatedSeaStates = SEA_STATES.map(ss => {
    let label = ss.label;
    if (isVi) {
      if (ss.value === 'Calm') label = '0 - Biển lặng (Kính)';
      else if (ss.value === 'Smooth') label = '1 - Sóng nhỏ';
      else if (ss.value === 'Slight') label = '2 - Sóng nhẹ';
      else if (ss.value === 'Moderate') label = '3 - Sóng vừa';
      else if (ss.value === 'Rough') label = '4 - Biển động';
      else if (ss.value === 'Very Rough') label = '5 - Biển động mạnh';
      else if (ss.value === 'High') label = '6 - Sóng cao';
      else if (ss.value === 'Very High') label = '7 - Sóng rất cao';
      else if (ss.value === 'Phenomenal') label = '8 - Sóng dữ dội';
    }
    return { ...ss, label };
  });

  const translatedVisibility = VISIBILITY_CONDITIONS.map(vc => {
    let label = vc.label;
    if (isVi) {
      if (vc.value === 'Good') label = 'Tốt (>5 hải lý)';
      else if (vc.value === 'Moderate') label = 'Trung bình (2-5 hải lý)';
      else if (vc.value === 'Poor') label = 'Kém (0.5-2 hải lý)';
      else if (vc.value === 'Fog') label = 'Sương mù (<0.5 hải lý)';
    }
    return { ...vc, label };
  });

  const translatedFatigue = FATIGUE_LEVELS.map(fl => {
    let label = fl.label;
    if (isVi) {
      if (fl.value === 'LOW') label = '🟢 Nguy cơ thấp';
      else if (fl.value === 'MEDIUM') label = '🟡 Nguy cơ trung bình';
      else if (fl.value === 'HIGH') label = '🔴 Nguy cơ cao';
    }
    return { ...fl, label };
  });

  const [entries, setEntries] = useState<WatchkeepingLogResponseDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<WatchkeepingLogResponseDto | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const handleStartEdit = (entry: WatchkeepingLogResponseDto) => {
    setEditingId(entry.id);
    setFormData({
      watchDate: entry.watchDate ? entry.watchDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
      watchPeriod: entry.watchPeriod || '08-12',
      watchType: entry.watchType || 'NAVIGATION',
      officerOnWatch: entry.officerOnWatch || '',
      reliefOfficer: entry.reliefOfficer || '',
      lookout: entry.lookout || '',
      workHours: entry.workHours ?? 4,
      restHoursLast24h: entry.restHoursLast24h ?? 10,
      restHoursLast7Days: entry.restHoursLast7Days ?? 77,
      restHoursCompliant: entry.restHoursCompliant ?? true,
      restHoursException: entry.restHoursException || '',
      weatherConditions: entry.weatherConditions || '',
      seaState: entry.seaState || 'Moderate',
      visibility: entry.visibility || 'Good',
      courseLogged: entry.courseLogged ?? 0,
      speedLogged: entry.speedLogged ?? 0,
      positionLat: entry.positionLat ?? 0,
      positionLon: entry.positionLon ?? 0,
      distanceRun: entry.distanceRun ?? 0,
      engineStatus: entry.engineStatus || '',
      radarOperational: entry.radarOperational ?? true,
      ecdisOperational: entry.ecdisOperational ?? true,
      aisOperational: entry.aisOperational ?? true,
      gyroOperational: entry.gyroOperational ?? true,
      autopilotEngaged: entry.autopilotEngaged ?? false,
      equipmentDefects: entry.equipmentDefects || '',
      gmdssWatchMaintained: entry.gmdssWatchMaintained ?? true,
      navigationWarningsReceived: entry.navigationWarningsReceived || '',
      notableEvents: entry.notableEvents || '',
      handoverNotes: entry.handoverNotes || '',
      handoverChecklistCompleted: entry.handoverChecklistCompleted ?? false,
      watchStartTime: toTimeInputValue(entry.watchStartTime),
      watchEndTime: toTimeInputValue(entry.watchEndTime),
      bridgeManningLevel: entry.bridgeManningLevel ?? 2,
      lookoutPosted: entry.lookoutPosted ?? true,
      fatigueRiskLevel: entry.fatigueRiskLevel || 'LOW',
      fatigueAssessmentDone: entry.fatigueAssessmentDone ?? false,
    });
    setShowForm(true);
  };
  const [formData, setFormData] = useState({
    watchDate: new Date().toISOString().slice(0, 10),
    watchPeriod: '08-12',
    watchType: 'NAVIGATION',
    officerOnWatch: '',
    reliefOfficer: '',
    lookout: '',
    // STCW Rest Hours
    workHours: 4,
    restHoursLast24h: 10,
    restHoursLast7Days: 77,
    restHoursCompliant: true,
    restHoursException: '',
    // Weather & Navigation
    weatherConditions: '',
    seaState: 'Moderate',
    visibility: 'Good',
    courseLogged: 0,
    speedLogged: 0,
    positionLat: 0,
    positionLon: 0,
    distanceRun: 0,
    // Bridge Equipment
    engineStatus: '',
    radarOperational: true,
    ecdisOperational: true,
    aisOperational: true,
    gyroOperational: true,
    autopilotEngaged: false,
    equipmentDefects: '',
    // GMDSS
    gmdssWatchMaintained: true,
    navigationWarningsReceived: '',
    // Watch Events & Handover
    notableEvents: '',
    handoverNotes: '',
    handoverChecklistCompleted: false,
    watchStartTime: '',
    watchEndTime: '',
    // Bridge Manning
    bridgeManningLevel: 2,
    lookoutPosted: true,
    // Fatigue
    fatigueRiskLevel: 'LOW' as 'LOW' | 'MEDIUM' | 'HIGH',
    fatigueAssessmentDone: false,
  });

  // Auto-calculate rest hours compliance
  useEffect(() => {
    const is24hCompliant = formData.restHoursLast24h >= 10;
    const is7DaysCompliant = formData.restHoursLast7Days >= 77;
    setFormData(prev => ({
      ...prev,
      restHoursCompliant: is24hCompliant && is7DaysCompliant
    }));
  }, [formData.restHoursLast24h, formData.restHoursLast7Days]);

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const response = await logbookService.getWatchkeepingEntries({ page: 1, pageSize: 20 });
      setEntries(response.data);
    } catch (error) {
      console.error(error);
      toast.error(t('logbooks.watchkeeping.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    const numericFields = ['courseLogged', 'speedLogged', 'positionLat', 'positionLon', 'distanceRun', 'workHours', 'restHoursLast24h', 'restHoursLast7Days', 'bridgeManningLevel'];
    
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else if (numericFields.includes(name)) {
      setFormData(prev => ({ ...prev, [name]: Number(value) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const resetForm = () => {
    setFormData({
      watchDate: new Date().toISOString().slice(0, 10),
      watchPeriod: '08-12',
      watchType: 'NAVIGATION',
      officerOnWatch: '',
      reliefOfficer: '',
      lookout: '',
      workHours: 4,
      restHoursLast24h: 10,
      restHoursLast7Days: 77,
      restHoursCompliant: true,
      restHoursException: '',
      weatherConditions: '',
      seaState: 'Moderate',
      visibility: 'Good',
      courseLogged: 0,
      speedLogged: 0,
      positionLat: 0,
      positionLon: 0,
      distanceRun: 0,
      engineStatus: '',
      radarOperational: true,
      ecdisOperational: true,
      aisOperational: true,
      gyroOperational: true,
      autopilotEngaged: false,
      equipmentDefects: '',
      gmdssWatchMaintained: true,
      navigationWarningsReceived: '',
      notableEvents: '',
      handoverNotes: '',
      handoverChecklistCompleted: false,
      watchStartTime: '',
      watchEndTime: '',
      bridgeManningLevel: 2,
      lookoutPosted: true,
      fatigueRiskLevel: 'LOW' as 'LOW' | 'MEDIUM' | 'HIGH',
      fatigueAssessmentDone: false,
    });
    setEditingId(null);
  };

  const handleSubmit = async () => {
    // Validation
    if (!formData.officerOnWatch) {
      toast.error(t('logbooks.watchkeeping.officerRequired'));
      return;
    }

    // STCW compliance warning
    if (!formData.restHoursCompliant && !formData.restHoursException) {
      toast.error(t('logbooks.watchkeeping.restHoursNonCompliant'));
      return;
    }

    try {
      const payload = {
        ...formData,
        watchStartTime: toWatchDateTime(formData.watchDate, formData.watchStartTime),
        watchEndTime: toWatchDateTime(formData.watchDate, formData.watchEndTime),
      };
      if (editingId) {
        await logbookService.updateWatchkeepingEntry(editingId, payload);
        toast.success(t('logbooks.watchkeeping.entryUpdated') || 'Watch entry updated successfully');
      } else {
        await logbookService.createWatchkeepingEntry(payload);
        toast.success(t('logbooks.watchkeeping.entryAdded'));
      }
      fetchEntries();
      setShowForm(false);
      resetForm();
    } catch (error) {
      console.error(error);
      toast.error(editingId ? 'Failed to update watch entry' : t('logbooks.watchkeeping.createFailed'));
    }
  };

  const handleSign = async (id: string, signature: string) => {
    try {
      await logbookService.signWatchkeepingEntry(id, { 
        signature, 
        signedAt: new Date().toISOString() 
      });
      toast.success(t('logbooks.watchkeeping.entrySignedByMaster'));
      fetchEntries();
    } catch (error) {
      console.error(error);
      toast.error(t('logbooks.watchkeeping.signFailed'));
    }
  };

  const handleViewDetail = (entry: WatchkeepingLogResponseDto) => {
    setSelectedEntry(entry);
    setShowDetailModal(true);
  };

  const closeDetailModal = () => {
    setShowDetailModal(false);
    setSelectedEntry(null);
  };

  // Detail Modal Component
  const DetailModal = () => {
    if (!showDetailModal || !selectedEntry) return null;
    
    const entry = selectedEntry;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="bg-blue-600 text-white p-6 rounded-t-xl">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold">{t('logbooks.watchkeeping.watchkeepingDetails')}</h2>
                <p className="text-blue-100 mt-1">
                  {new Date(entry.watchDate).toLocaleDateString(isVi ? 'vi-VN' : 'en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <button
                onClick={closeDetailModal}
                className="text-white hover:bg-blue-700 rounded-full p-2 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex gap-3 mt-4">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${entry.watchType === 'NAVIGATION' ? 'bg-blue-500' : 'bg-orange-500'}`}>
                {entry.watchType === 'NAVIGATION' 
                  ? `🧭 ${t('logbooks.watchkeeping.navigationWatch')}` 
                  : `⚙️ ${t('logbooks.watchkeeping.engineWatch')}`}
              </span>
              <span className="px-3 py-1 bg-blue-500 rounded-full text-sm font-medium">
                ⏰ {entry.watchPeriod}
              </span>
              {entry.masterSignature ? (
                <span className="px-3 py-1 bg-green-500 rounded-full text-sm font-medium">✓ {t('logbooks.watchkeeping.signed')}</span>
              ) : (
                <span className="px-3 py-1 bg-yellow-500 text-black rounded-full text-sm font-medium">{t('logbooks.abstractLog.draft')}</span>
              )}
            </div>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900 border-b pb-2">👤 {t('logbooks.watchkeeping.watchPersonnel')}</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">{t('logbooks.watchkeeping.officerOnWatch')}:</span>
                    <p className="font-medium text-gray-900">{entry.officerOnWatch}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('logbooks.watchkeeping.reliefOfficer')}:</span>
                    <p className="font-medium text-gray-900">{entry.reliefOfficer || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('logbooks.watchkeeping.lookout')}:</span>
                    <p className="font-medium text-gray-900">{entry.lookout || '-'}</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('logbooks.watchkeeping.bridgeManning')}</span>
                    <p className="font-medium text-gray-900">
                      {entry.bridgeManningLevel || 2} {t('logbooks.watchkeeping.persons')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900 border-b pb-2">🧭 {t('logbooks.watchkeeping.navigationSection')}</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">{t('logbooks.watchkeeping.position')}</span>
                    <p className="font-medium text-gray-900">
                      {entry.positionLat?.toFixed(4)}°, {entry.positionLon?.toFixed(4)}°
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('logbooks.watchkeeping.courseSpeed')}</span>
                    <p className="font-medium text-gray-900">{entry.courseLogged}° / {entry.speedLogged} kts</p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('logbooks.watchkeeping.distanceRun')}:</span>
                    <p className="font-medium text-gray-900">{entry.distanceRun || 0} NM</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Weather */}
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 border-b pb-2">🌤️ {t('logbooks.watchkeeping.weatherAndSea')}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">{t('logbooks.watchkeeping.seaState')}:</span>
                  <p className="font-medium text-gray-900">
                    {translatedSeaStates.find(s => s.value === entry.seaState)?.label || entry.seaState || '-'}
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">{t('logbooks.watchkeeping.visibility')}:</span>
                  <p className="font-medium text-gray-900">
                    {translatedVisibility.find(v => v.value === entry.visibility)?.label || entry.visibility || '-'}
                  </p>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500">{t('logbooks.watchkeeping.weatherConditions')}:</span>
                  <p className="font-medium text-gray-900">{entry.weatherConditions || '-'}</p>
                </div>
              </div>
            </div>

            {/* STCW Rest Hours */}
            <div className={`p-4 rounded-lg ${entry.restHoursCompliant !== false ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <h3 className="font-semibold text-gray-900 border-b pb-2 mb-4">
                ⚠️ {t('logbooks.watchkeeping.restHoursCompliant')}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">{t('logbooks.watchkeeping.workHours')}:</span>
                  <p className="font-medium text-gray-900">{entry.workHours || 4}h</p>
                </div>
                <div>
                  <span className="text-gray-500">{t('logbooks.watchkeeping.restLast24hLabel')}</span>
                  <p className={`font-medium ${(entry.restHoursLast24h || 0) >= 10 ? 'text-green-600' : 'text-red-600'}`}>
                    {entry.restHoursLast24h || 0}h (min 10h)
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">{t('logbooks.watchkeeping.restLast7DaysLabel')}</span>
                  <p className={`font-medium ${(entry.restHoursLast7Days || 0) >= 77 ? 'text-green-600' : 'text-red-600'}`}>
                    {entry.restHoursLast7Days || 0}h (min 77h)
                  </p>
                </div>
                <div>
                  <span className="text-gray-500">{t('logbooks.watchkeeping.statusLabel')}</span>
                  <p className={`font-bold ${entry.restHoursCompliant !== false ? 'text-green-600' : 'text-red-600'}`}>
                    {entry.restHoursCompliant !== false ? t('logbooks.watchkeeping.compliantStatus') : t('logbooks.watchkeeping.exceptionStatus')}
                  </p>
                </div>
              </div>
              {entry.restHoursException && (
                <div className="mt-3 p-3 bg-red-100 rounded text-sm">
                  <span className="text-red-700 font-medium">{t('logbooks.watchkeeping.restHoursException')}: </span>
                  <span className="text-red-600">{entry.restHoursException}</span>
                </div>
              )}
            </div>

            {/* Bridge Equipment */}
            <div className="space-y-4">
              <h3 className="font-semibold text-gray-900 border-b pb-2">🖥️ {t('logbooks.watchkeeping.bridgeEquipment')}</h3>
              <div className="flex flex-wrap gap-3">
                <span className={`px-3 py-1 rounded-full text-sm ${entry.radarOperational !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {entry.radarOperational !== false ? '✓' : '✗'} Radar
                </span>
                <span className={`px-3 py-1 rounded-full text-sm ${entry.ecdisOperational !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {entry.ecdisOperational !== false ? '✓' : '✗'} ECDIS
                </span>
                <span className={`px-3 py-1 rounded-full text-sm ${entry.aisOperational !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {entry.aisOperational !== false ? '✓' : '✗'} AIS
                </span>
                <span className={`px-3 py-1 rounded-full text-sm ${entry.gyroOperational !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {entry.gyroOperational !== false ? '✓' : '✗'} Gyro
                </span>
                <span className={`px-3 py-1 rounded-full text-sm ${entry.autopilotEngaged ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-600'}`}>
                  {entry.autopilotEngaged ? `⚡ ${t('logbooks.watchkeeping.autopilotOn')}` : t('logbooks.watchkeeping.autopilotOff')}
                </span>
              </div>
              {entry.equipmentDefects && (
                <div className="p-3 bg-red-50 border border-red-200 rounded text-sm">
                  <span className="text-red-700 font-medium">{t('logbooks.watchkeeping.equipmentDefects')}: </span>
                  <span className="text-red-600">{entry.equipmentDefects}</span>
                </div>
              )}
            </div>

            {/* GMDSS & Fatigue */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900 border-b pb-2">📡 {t('logbooks.watchkeeping.gmdssWatch')}</h3>
                <div className="text-sm">
                  <p className={`font-medium ${entry.gmdssWatchMaintained !== false ? 'text-green-600' : 'text-red-600'}`}>
                    {entry.gmdssWatchMaintained !== false 
                      ? t('logbooks.watchkeeping.gmdssWatchMaintainedText') 
                      : t('logbooks.watchkeeping.gmdssWatchNotMaintained')}
                  </p>
                  {entry.navigationWarningsReceived && (
                    <p className="mt-2 text-gray-600">
                      <span className="font-medium">{t('logbooks.watchkeeping.navigationWarningsReceived')}:</span> {entry.navigationWarningsReceived}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900 border-b pb-2">😴 {t('logbooks.watchkeeping.fatigueAssessment')}</h3>
                <div className="text-sm">
                  <p className="font-medium">
                    {t('logbooks.watchkeeping.riskLevel')} 
                    <span className={`ml-2 px-2 py-1 rounded ${
                      entry.fatigueRiskLevel === 'LOW' ? 'bg-green-100 text-green-700' :
                      entry.fatigueRiskLevel === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                      entry.fatigueRiskLevel === 'HIGH' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {entry.fatigueRiskLevel 
                        ? (isVi 
                            ? (entry.fatigueRiskLevel === 'LOW' ? 'Thấp' : entry.fatigueRiskLevel === 'MEDIUM' ? 'Trung bình' : 'Cao') 
                            : entry.fatigueRiskLevel) 
                        : t('logbooks.watchkeeping.notAssessed')}
                    </span>
                  </p>
                  <p className={`mt-2 ${entry.fatigueAssessmentDone ? 'text-green-600' : 'text-gray-500'}`}>
                    {entry.fatigueAssessmentDone 
                      ? t('logbooks.watchkeeping.assessmentCompleted') 
                      : t('logbooks.watchkeeping.assessmentNotDone')}
                  </p>
                </div>
              </div>
            </div>

            {/* Handover */}
            {(entry.handoverNotes || entry.watchStartTime || entry.watchEndTime) && (
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900 border-b pb-2">🔄 {t('logbooks.watchkeeping.watchHandoverSection')}</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">{t('logbooks.watchkeeping.watchTime')}</span>
                    <p className="font-medium text-gray-900">
                      {toTimeInputValue(entry.watchStartTime) || '-'} → {toTimeInputValue(entry.watchEndTime) || '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('logbooks.watchkeeping.checklist')}</span>
                    <p className={`font-medium ${entry.handoverChecklistCompleted ? 'text-green-600' : 'text-gray-500'}`}>
                      {entry.handoverChecklistCompleted 
                        ? t('logbooks.watchkeeping.checklistCompleted') 
                        : t('logbooks.watchkeeping.checklistNotCompleted')}
                    </p>
                  </div>
                </div>
                {entry.handoverNotes && (
                  <div className="p-3 bg-gray-50 rounded">
                    <span className="text-gray-500 text-sm">{t('logbooks.watchkeeping.handoverNotes')}:</span>
                    <p className="text-gray-900 mt-1">{entry.handoverNotes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Notable Events */}
            {entry.notableEvents && (
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900 border-b pb-2">📝 {t('logbooks.watchkeeping.notableEventsSection')}</h3>
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <p className="text-gray-900 whitespace-pre-wrap">{entry.notableEvents}</p>
                </div>
              </div>
            )}

            {/* Engine Status (for Engine Watch) */}
            {entry.watchType === 'ENGINE' && entry.engineStatus && (
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900 border-b pb-2">⚙️ {t('logbooks.watchkeeping.engineStatus')}</h3>
                <div className="p-4 bg-orange-50 border border-orange-200 rounded-lg">
                  <p className="text-gray-900">{entry.engineStatus}</p>
                </div>
              </div>
            )}

            {/* Signature */}
            <div className="border-t pt-4">
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-500">
                  {t('logbooks.watchkeeping.created')} {new Date(entry.createdAt).toLocaleString(isVi ? 'vi-VN' : 'en-US')}
                  {entry.updatedAt && entry.updatedAt !== entry.createdAt && (
                    <span className="ml-4">{t('logbooks.watchkeeping.updated')} {new Date(entry.updatedAt).toLocaleString(isVi ? 'vi-VN' : 'en-US')}</span>
                  )}
                </div>
                {entry.masterSignature && (
                  <div className="text-right">
                    <p className="text-sm text-gray-500">{t('logbooks.watchkeeping.signedByMaster')}</p>
                    <p className="font-medium text-green-600">{entry.masterSignature}</p>
                    {entry.signedAt && (
                      <p className="text-xs text-gray-400">{new Date(entry.signedAt).toLocaleString(isVi ? 'vi-VN' : 'en-US')}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="bg-gray-50 px-6 py-4 rounded-b-xl flex justify-end gap-3">
            {!entry.masterSignature && (
              <>
                <PermissionGate permission="logbooks.watchkeeping.update"><button
                  onClick={() => {
                    handleStartEdit(entry);
                    closeDetailModal();
                  }}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  ✏️ {t('common.edit') || 'Edit'}
                </button></PermissionGate>
                <PermissionGate permission="logbooks.watchkeeping.approve"><button
                  onClick={() => {
                    handleSign(entry.id, 'Master Signature');
                    closeDetailModal();
                  }}
                  className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors"
                >
                  ✍️ {t('logbooks.watchkeeping.signAsMaster')}
                </button></PermissionGate>
              </>
            )}
            <button
              onClick={closeDetailModal}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 transition-colors"
            >
              {t('logbooks.watchkeeping.close')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <LogbookGrid 
      title="Watchkeeping Log - SOLAS Chapter V/28"
      actions={
        <PermissionGate permission="logbooks.watchkeeping.create"><button
          onClick={() => {
            if (showForm) {
              setShowForm(false);
              resetForm();
            } else {
              resetForm();
              setShowForm(true);
            }
          }}
          className="bg-blue-600 text-white font-semibold py-2.5 px-6 rounded-lg hover:bg-blue-700 transition-colors shadow-md"
        >
          {showForm ? '✕ Cancel' : '+ New Watch'}
        </button></PermissionGate>
      }
    >
      {showForm && (
        <div className="bg-white p-6 border border-blue-200 rounded-lg shadow-lg mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">
            {editingId ? 'Edit Watch Details' : 'Record Watch Details'}
          </h2>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Basic Info */}
            <div className="flex flex-col gap-4">
              <h3 className="text-sm font-semibold text-gray-700  border-b border-gray-200 pb-2">
                Watch Information
              </h3>
              
              <MaritimeInput
                label="Watch Date"
                type="date"
                name="watchDate"
                value={formData.watchDate}
                onChange={handleInputChange}
              />

              <div>
                <label className="text-sm font-medium text-gray-700 block mb-2">
                  Watch Period
                </label>
                <select
                  name="watchPeriod"
                  value={formData.watchPeriod}
                  onChange={handleInputChange}
                  className="w-full bg-white border border-gray-300 rounded-lg text-gray-900 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {translatedWatchPeriods.map(wp => (
                    <option key={wp.code} value={wp.code}>{wp.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-blue-600 font-sans text-sm  block mb-2">
                  Watch Type
                </label>
                <select
                  name="watchType"
                  value={formData.watchType}
                  onChange={handleInputChange}
                  className="w-full bg-white border-2 border-gray-200 text-gray-900 font-sans text-lg p-4 focus:border-blue-500 focus:outline-none"
                >
                  {translatedWatchTypes.map(wt => (
                    <option key={wt.value} value={wt.value}>{wt.label}</option>
                  ))}
                </select>
              </div>

              <MaritimeInput
                label="Officer on Watch"
                name="officerOnWatch"
                value={formData.officerOnWatch}
                onChange={handleInputChange}
                placeholder="Name / Rank"
              />

              <MaritimeInput
                label="Relief Officer (Handover to)"
                name="reliefOfficer"
                value={formData.reliefOfficer}
                onChange={handleInputChange}
                placeholder="Officer taking over watch"
              />

              <MaritimeInput
                label="Lookout"
                name="lookout"
                value={formData.lookout}
                onChange={handleInputChange}
                placeholder="AB name (if applicable)"
              />

              {/* Bridge Manning */}
              <div className="grid grid-cols-2 gap-4">
                <MaritimeInput
                  label="Bridge Manning Level"
                  type="number"
                  name="bridgeManningLevel"
                  value={formData.bridgeManningLevel}
                  onChange={handleInputChange}
                  placeholder="2"
                />
                <div className="flex items-center mt-6">
                  <input
                    type="checkbox"
                    name="lookoutPosted"
                    checked={formData.lookoutPosted}
                    onChange={handleInputChange}
                    className="w-5 h-5 text-blue-600 border-gray-300 rounded"
                  />
                  <label className="ml-2 text-sm text-gray-700">Lookout Posted</label>
                </div>
              </div>
            </div>

            {/* Right Column - Navigation Data */}
            <div className="flex flex-col gap-4">
              <h3 className="text-green-600 font-sans text-sm border-b border-gray-200 pb-2">
                Navigation & Weather
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <MaritimeInput
                  label="Course Logged (°T)"
                  type="number"
                  name="courseLogged"
                  value={formData.courseLogged}
                  onChange={handleInputChange}
                  placeholder="090"
                />
                <MaritimeInput
                  label="Speed Logged (kts)"
                  type="number"
                  step="0.1"
                  name="speedLogged"
                  value={formData.speedLogged}
                  onChange={handleInputChange}
                  placeholder="12.5"
                />
              </div>

              <MaritimeInput
                label="Distance Run (NM)"
                type="number"
                step="0.1"
                name="distanceRun"
                value={formData.distanceRun}
                onChange={handleInputChange}
                placeholder="Nautical miles this watch"
              />

              <CoordinatePicker
                label="Position - Latitude"
                type="latitude"
                value={formData.positionLat}
                onChange={lat => setFormData(prev => ({ ...prev, positionLat: lat }))}
              />

              <CoordinatePicker
                label="Position - Longitude"
                type="longitude"
                value={formData.positionLon}
                onChange={lon => setFormData(prev => ({ ...prev, positionLon: lon }))}
              />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-blue-600 font-sans text-sm  block mb-2">
                    Sea State (Douglas Scale)
                  </label>
                  <select
                    name="seaState"
                    value={formData.seaState}
                    onChange={handleInputChange}
                    className="w-full bg-white border-2 border-gray-200 text-gray-900 font-sans text-lg p-4 focus:border-blue-500 focus:outline-none"
                  >
                    {translatedSeaStates.map(ss => (
                      <option key={ss.value} value={ss.value}>{ss.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-blue-600 font-sans text-sm  block mb-2">
                    Visibility
                  </label>
                  <select
                    name="visibility"
                    value={formData.visibility}
                    onChange={handleInputChange}
                    className="w-full bg-white border-2 border-gray-200 text-gray-900 font-sans text-lg p-4 focus:border-blue-500 focus:outline-none"
                  >
                    {translatedVisibility.map(vc => (
                      <option key={vc.value} value={vc.value}>{vc.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <MaritimeInput
                label="Weather Conditions"
                name="weatherConditions"
                value={formData.weatherConditions}
                onChange={handleInputChange}
                placeholder="e.g., Clear sky, light breeze"
              />
            </div>
          </div>

          {/* Full Width - Additional Info */}
          <div className="mt-6 space-y-4">
            <h3 className="text-green-600 font-sans text-sm border-b border-gray-200 pb-2">
              Additional Information
            </h3>

            {formData.watchType === 'ENGINE' && (
              <MaritimeInput
                label="Engine Status"
                name="engineStatus"
                value={formData.engineStatus}
                onChange={handleInputChange}
                placeholder="e.g., Main Engine running at 85% MCR, All systems normal"
              />
            )}

            <div>
              <label className="text-blue-600 font-sans text-sm  block mb-2">
                Notable Events / Observations
              </label>
              <textarea
                name="notableEvents"
                value={formData.notableEvents}
                onChange={handleInputChange}
                className="w-full bg-white border-2 border-gray-200 text-gray-900 font-sans p-4 focus:border-blue-500 focus:outline-none h-32 resize-none"
                placeholder="Record any significant events: course alterations, vessels sighted, weather changes, alarms, drills, etc."
              />
            </div>
          </div>

          {/* STCW Rest Hours Compliance */}
          <div className="mt-6 p-4 border-2 border-blue-300 rounded-lg bg-blue-50">
            <h3 className="text-amber-700 font-semibold text-sm border-b border-blue-300 pb-2 mb-4 flex items-center gap-2">
              ⚠️ STCW Rest Hours Compliance (Mandatory)
            </h3>
            
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <MaritimeInput
                label="Work Hours (this watch)"
                type="number"
                step="0.5"
                name="workHours"
                value={formData.workHours}
                onChange={handleInputChange}
              />
              <MaritimeInput
                label="Rest Hours (Last 24h)"
                type="number"
                step="0.5"
                name="restHoursLast24h"
                value={formData.restHoursLast24h}
                onChange={handleInputChange}
              />
              <MaritimeInput
                label="Rest Hours (Last 7 Days)"
                type="number"
                step="0.5"
                name="restHoursLast7Days"
                value={formData.restHoursLast7Days}
                onChange={handleInputChange}
              />
              <div className="flex flex-col justify-center">
                <div className={`px-4 py-2 rounded-lg text-center font-bold ${formData.restHoursCompliant ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {formData.restHoursCompliant ? '✓ COMPLIANT' : '✗ NON-COMPLIANT'}
                </div>
                <p className="text-xs text-gray-500 mt-1 text-center">
                  Min: 10h/24h, 77h/7days
                </p>
              </div>
            </div>

            {!formData.restHoursCompliant && (
              <div className="mt-4">
                <label className="text-red-600 font-sans text-sm block mb-2">
                  Exception Reason (Required by STCW A-VIII/1)
                </label>
                <textarea
                  name="restHoursException"
                  value={formData.restHoursException}
                  onChange={handleInputChange}
                  className="w-full bg-white border-2 border-red-300 text-gray-900 font-sans p-3 focus:border-red-500 focus:outline-none h-20 resize-none"
                  placeholder="Explain the exceptional circumstances requiring deviation from rest hour requirements..."
                />
              </div>
            )}
          </div>

          {/* Bridge Equipment Status */}
          <div className="mt-6 p-4 border border-blue-200 rounded-lg bg-blue-50">
            <h3 className="text-blue-700 font-semibold text-sm border-b border-blue-200 pb-2 mb-4">
              🖥️ Bridge Equipment Status
            </h3>
            
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="radarOperational"
                  checked={formData.radarOperational}
                  onChange={handleInputChange}
                  className="w-5 h-5 text-blue-600 border-gray-300 rounded"
                />
                <span className="text-sm">Radar</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="ecdisOperational"
                  checked={formData.ecdisOperational}
                  onChange={handleInputChange}
                  className="w-5 h-5 text-blue-600 border-gray-300 rounded"
                />
                <span className="text-sm">ECDIS</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="aisOperational"
                  checked={formData.aisOperational}
                  onChange={handleInputChange}
                  className="w-5 h-5 text-blue-600 border-gray-300 rounded"
                />
                <span className="text-sm">AIS</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="gyroOperational"
                  checked={formData.gyroOperational}
                  onChange={handleInputChange}
                  className="w-5 h-5 text-blue-600 border-gray-300 rounded"
                />
                <span className="text-sm">Gyro</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  name="autopilotEngaged"
                  checked={formData.autopilotEngaged}
                  onChange={handleInputChange}
                  className="w-5 h-5 text-orange-600 border-gray-300 rounded"
                />
                <span className="text-sm">Autopilot</span>
              </label>
            </div>

            {(!formData.radarOperational || !formData.ecdisOperational || !formData.aisOperational || !formData.gyroOperational) && (
              <div className="mt-4">
                <MaritimeInput
                  label="Equipment Defects Details"
                  name="equipmentDefects"
                  value={formData.equipmentDefects}
                  onChange={handleInputChange}
                  placeholder="Describe any equipment failures or defects..."
                />
              </div>
            )}
          </div>

          {/* GMDSS & Fatigue */}
          <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* GMDSS Watch */}
            <div className="p-4 border border-purple-200 rounded-lg bg-purple-50">
              <h3 className="text-purple-700 font-semibold text-sm border-b border-purple-200 pb-2 mb-4">
                📡 GMDSS Watch (SOLAS Ch. IV)
              </h3>
              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  name="gmdssWatchMaintained"
                  checked={formData.gmdssWatchMaintained}
                  onChange={handleInputChange}
                  className="w-5 h-5 text-purple-600 border-gray-300 rounded"
                />
                <span className="text-sm">GMDSS Distress Watch Maintained</span>
              </label>
              <MaritimeInput
                label="Navigation Warnings Received"
                name="navigationWarningsReceived"
                value={formData.navigationWarningsReceived}
                onChange={handleInputChange}
                placeholder="NAVTEX, SafetyNET messages..."
              />
            </div>

            {/* Fatigue Management */}
            <div className="p-4 border border-orange-200 rounded-lg bg-orange-50">
              <h3 className="text-orange-700 font-semibold text-sm border-b border-orange-200 pb-2 mb-4">
                😴 Fatigue Management (MLC 2006)
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-orange-600 font-sans text-sm block mb-2">
                    Fatigue Risk Level
                  </label>
                  <select
                    name="fatigueRiskLevel"
                    value={formData.fatigueRiskLevel}
                    onChange={handleInputChange}
                    className="w-full bg-white border-2 border-gray-200 text-gray-900 font-sans p-3 focus:border-orange-500 focus:outline-none"
                  >
                    {translatedFatigue.map(fl => (
                      <option key={fl.value} value={fl.value}>{fl.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      name="fatigueAssessmentDone"
                      checked={formData.fatigueAssessmentDone}
                      onChange={handleInputChange}
                      className="w-5 h-5 text-orange-600 border-gray-300 rounded"
                    />
                    <span className="text-sm">Fatigue Assessment Completed</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Watch Handover */}
          <div className="mt-6 p-4 border border-green-200 rounded-lg bg-green-50">
            <h3 className="text-green-700 font-semibold text-sm border-b border-green-200 pb-2 mb-4">
              🔄 Watch Handover (Mandatory at Watch Change)
            </h3>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
              <MaritimeInput
                label="Watch Start Time"
                type="time"
                name="watchStartTime"
                value={formData.watchStartTime}
                onChange={handleInputChange}
              />
              <MaritimeInput
                label="Watch End Time"
                type="time"
                name="watchEndTime"
                value={formData.watchEndTime}
                onChange={handleInputChange}
              />
            </div>

            <div>
              <label className="text-green-600 font-sans text-sm block mb-2">
                Handover Notes (for Relieving Officer)
              </label>
              <textarea
                name="handoverNotes"
                value={formData.handoverNotes}
                onChange={handleInputChange}
                className="w-full bg-white border-2 border-gray-200 text-gray-900 font-sans p-4 focus:border-green-500 focus:outline-none h-24 resize-none"
                placeholder="Important information for the relieving officer: vessel traffic, weather changes, course changes, ongoing situations..."
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer mt-3">
              <input
                type="checkbox"
                name="handoverChecklistCompleted"
                checked={formData.handoverChecklistCompleted}
                onChange={handleInputChange}
                className="w-5 h-5 text-green-600 border-gray-300 rounded"
              />
              <span className="text-sm font-medium">Handover Checklist Completed</span>
            </label>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-4 mt-6">
            <button
              onClick={() => {
                setShowForm(false);
                resetForm();
              }}
              className="px-6 py-2 text-gray-600 font-medium hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <PermissionGate permission={editingId ? 'logbooks.watchkeeping.update' : 'logbooks.watchkeeping.create'}><button
              onClick={handleSubmit}
              className="bg-green-600 text-white font-semibold py-2.5 px-8 rounded-lg hover:bg-green-700 transition-colors shadow-md"
            >
              {editingId ? 'Update Watch Entry' : 'Save Watch Entry'}
            </button></PermissionGate>
          </div>
        </div>
      )}

      {/* Entries Table */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-700 font-semibold text-sm">
              <th className="p-4 border-b border-gray-200">Date</th>
              <th className="p-4 border-b border-gray-200">Watch</th>
              <th className="p-4 border-b border-gray-200">Type</th>
              <th className="p-4 border-b border-gray-200">OOW</th>
              <th className="p-4 border-b border-gray-200">Position</th>
              <th className="p-4 border-b border-gray-200">C/S</th>
              <th className="p-4 border-b border-gray-200">Rest Hours</th>
              <th className="p-4 border-b border-gray-200">Equipment</th>
              <th className="p-4 border-b border-gray-200">Status</th>
              <th className="p-4 border-b border-gray-200">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={10} className="p-4 text-center text-green-600 font-sans">
                  Loading...
                </td>
              </tr>
            )}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={10} className="p-4 text-center text-gray-500 font-sans">
                  No watchkeeping entries recorded. Click "+ New Watch" to start logging.
                </td>
              </tr>
            )}
            {entries.map(entry => (
              <tr 
                key={entry.id} 
                className={`border-b border-gray-200 hover:bg-blue-50 cursor-pointer transition-colors ${entry.restHoursCompliant === false ? 'bg-red-50 hover:bg-red-100' : ''}`}
                onClick={() => handleViewDetail(entry)}
              >
                <td className="p-4 font-sans text-gray-900">{new Date(entry.watchDate).toLocaleDateString()}</td>
                <td className="p-4 font-sans text-gray-900">{entry.watchPeriod}</td>
                <td className="p-4 font-sans text-gray-900">
                  <span className={`px-2 py-1 text-xs rounded ${entry.watchType === 'NAVIGATION' ? 'bg-blue-600 text-white' : 'bg-orange-600 text-white'}`}>
                    {entry.watchType}
                  </span>
                </td>
                <td className="p-4 font-sans text-gray-900">{entry.officerOnWatch}</td>
                <td className="p-4 font-sans text-gray-900 text-xs">
                  {entry.positionLat?.toFixed(4)}, {entry.positionLon?.toFixed(4)}
                </td>
                <td className="p-4 font-sans text-gray-900">
                  {entry.courseLogged}° / {entry.speedLogged} kts
                </td>
                <td className="p-4 font-sans text-xs">
                  {entry.restHoursCompliant !== false ? (
                    <span className="bg-green-100 text-green-700 px-2 py-1 rounded font-medium">✓ OK</span>
                  ) : (
                    <span className="bg-red-100 text-red-700 px-2 py-1 rounded font-medium" title={entry.restHoursException || 'Non-compliant'}>⚠ EXCEPTION</span>
                  )}
                </td>
                <td className="p-4 font-sans text-xs">
                  {(entry.radarOperational !== false && entry.ecdisOperational !== false && entry.aisOperational !== false && entry.gyroOperational !== false) ? (
                    <span className="text-green-600">✓ All OK</span>
                  ) : (
                    <span className="text-red-600" title={entry.equipmentDefects || 'Equipment defects'}>⚠ Defects</span>
                  )}
                </td>
                <td className="p-4">
                  {entry.masterSignature ? (
                    <span className="bg-green-600 text-white text-xs px-2 py-1 font-sans font-bold rounded">
                      SIGNED
                    </span>
                  ) : (
                    <span className="bg-yellow-500 text-black text-xs px-2 py-1 font-sans font-bold rounded">
                      DRAFT
                    </span>
                  )}
                </td>
                <td className="p-4">
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewDetail(entry);
                      }}
                      className="text-blue-600 hover:underline font-sans text-sm"
                    >
                      VIEW
                    </button>
                    {!entry.masterSignature && (
                      <>
                        <PermissionGate permission="logbooks.watchkeeping.update"><button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartEdit(entry);
                          }}
                          className="text-amber-600 hover:underline font-sans text-sm"
                        >
                          EDIT
                        </button></PermissionGate>
                        <PermissionGate permission="logbooks.watchkeeping.approve"><button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSign(entry.id, 'Master Signature');
                          }}
                          className="text-green-600 hover:underline font-sans text-sm"
                        >
                          SIGN
                        </button></PermissionGate>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Notable Events Display */}
      {entries.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Notable Events</h3>
          <div className="space-y-3">
            {entries.filter(e => e.notableEvents).slice(0, 5).map(entry => (
              <div 
                key={entry.id} 
                className="bg-white p-5 border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleViewDetail(entry)}
              >
                <div className="flex justify-between items-start mb-3">
                  <span className="text-sm font-semibold text-blue-600">
                    {new Date(entry.watchDate).toLocaleDateString()} - {entry.watchPeriod}
                  </span>
                  <span className="text-xs text-gray-500 italic">{entry.officerOnWatch}</span>
                </div>
                <p className="text-gray-700 leading-relaxed">{entry.notableEvents}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detail Modal */}
      <DetailModal />
    </LogbookGrid>
  );
};





