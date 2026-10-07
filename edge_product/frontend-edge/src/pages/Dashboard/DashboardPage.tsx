import { useEffect, useState, useCallback, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts'
import { dashboardService, alarmService, telemetryService, maritimeService } from '@/services/maritime.service'
import { useMaritimeStore } from '@/stores/maritime.store'
import type { MaterialItem, MaintenanceTask, SafetyAlarm } from '@/types/maritime.types'
import { useTranslationSafe } from '@/contexts/I18nContext'
import { VesselMap } from '@/components/ship-data/VesselMap'
import { startPolling } from '@/lib/polling'
import plannedRouteData from '@/assets/planned-route.json'
import { 
  AlertTriangle, 
  Activity,
  Navigation,
  Settings,
  Wifi,
  WifiOff,
  CloudLightning,
  Clock,
  MapPin,
  Anchor,
  X
} from 'lucide-react'

const MOCK_WIND = { direction: 45, speed: 18 }
const MOCK_RUDDER = { angle: 5 }
const MOCK_ROT = { rate: 12 }
const MOCK_DEPTH = { ukc: 24.5 }
const MOCK_EDGE = { pendingSync: 12, lastSync: new Date(Date.now() - 45000).toISOString() }
const MOCK_DRAFT = { fore: 8.2, mid: 8.5, aft: 8.8 }
const MOCK_THRUSTERS = { bow: 45, stern: 0 }

type DashboardAlert = {
  id: string
  severity: SafetyAlarm['severity']
  code?: string
  title: string
  description?: string
  timestamp: string
  location?: string
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

function createMaintenanceAlerts(tasks: MaintenanceTask[]): DashboardAlert[] {
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  return tasks.flatMap(task => {
    if (!task.nextDueAt || ['COMPLETED', 'CANCELLED', 'APPROVED'].includes(task.status)) return []

    const isRunningHours = !!task.intervalHours && !task.intervalDays
    if (
      isRunningHours &&
      task.nextDueRunningHours !== undefined &&
      task.currentRunningHours !== undefined
    ) {
      const hoursUntilDue = task.nextDueRunningHours - task.currentRunningHours
      const warningHours = Math.max(1, Number(task.daysBeforeDue || 70))
      if (task.status !== 'OVERDUE' && hoursUntilDue > warningHours) return []
      return [{
        id: `maintenance-${task.id}`,
        severity: (task.status === 'OVERDUE' || hoursUntilDue < 0 ? 'CRITICAL' : 'WARNING') as SafetyAlarm['severity'],
        code: task.taskId,
        title: task.status === 'OVERDUE' || hoursUntilDue < 0 ? 'Công việc quá hạn theo giờ chạy' : 'Công việc sắp đến hạn theo giờ chạy',
        description: `${task.taskDescription || task.taskType} - ${task.equipmentAssetName || task.equipmentName || task.equipmentGroupName || 'Thiết bị'} (${hoursUntilDue < 0 ? `quá ${Math.abs(hoursUntilDue).toFixed(1)} giờ` : `còn ${hoursUntilDue.toFixed(1)} giờ`})`,
        timestamp: task.nextDueAt,
        location: task.assignedDepartment,
      }]
    }

    const due = new Date(task.nextDueAt)
    due.setHours(0, 0, 0, 0)
    const daysUntil = Math.ceil((due.getTime() - now.getTime()) / MS_PER_DAY)
    if (task.status !== 'OVERDUE' && daysUntil >= 0 && daysUntil > 3) return []
    return [{
      id: `maintenance-${task.id}`,
      severity: (task.status === 'OVERDUE' || daysUntil < 0 ? 'CRITICAL' : 'WARNING') as SafetyAlarm['severity'],
      code: task.taskId,
      title: task.status === 'OVERDUE' || daysUntil < 0 ? 'Công việc quá hạn' : 'Công việc sắp đến hạn',
      description: `${task.taskDescription || task.taskType} - ${task.equipmentAssetName || task.equipmentName || task.equipmentGroupName || 'Thiết bị'} (${daysUntil < 0 ? `quá hạn ${Math.abs(daysUntil)} ngày` : `còn ${daysUntil} ngày`})`,
      timestamp: due.toISOString(),
      location: task.assignedDepartment,
    }]
  })
}

function createLowStockAlerts(items: MaterialItem[]): DashboardAlert[] {
  return items.map(item => ({
    id: `stock-${item.id}`,
    severity: 'WARNING' as SafetyAlarm['severity'],
    code: item.itemCode,
    title: 'Vật tư dưới mức tối thiểu',
    description: `${item.name}: hiện ${item.onHandQuantity} ${item.unit}, tối thiểu ${item.minStock ?? 0} ${item.unit}`,
    timestamp: item.createdAt || new Date().toISOString(),
    location: item.location || undefined,
  }))
}

export function DashboardPage() {
  const { t } = useTranslationSafe()
  const [loading, setLoading] = useState(true)
  const [position, setPosition] = useState<any>(null)
  const [navigation, setNavigation] = useState<any>(null)
  const [activeAlarms, setActiveAlarmsState] = useState<SafetyAlarm[]>([])
  const [maintenanceAlerts, setMaintenanceAlerts] = useState<DashboardAlert[]>([])
  const [stockAlerts, setStockAlerts] = useState<DashboardAlert[]>([])
  const [isAlarmModalOpen, setIsAlarmModalOpen] = useState(false)
  const [history, setHistory] = useState<any[]>([])
  const [currentTime, setCurrentTime] = useState(new Date())
  
  const { setDashboardStats, setActiveAlarms, setCurrentPosition, setCurrentNavigation } = useMaritimeStore()

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const utcTimeStr = useMemo(() => currentTime.toISOString().slice(11, 19), [currentTime])
  const localTimeStr = useMemo(() => currentTime.toLocaleTimeString('vi-VN', { hour12: false }), [currentTime])
  const dateStr = useMemo(() => currentTime.toLocaleDateString('vi-VN', { day: '2-digit', month: 'short', year: 'numeric' }), [currentTime])

  useEffect(() => {
    const initialData = Array.from({ length: 60 }).map(() => ({
      time: '', pitch: 0, roll: 0, rpm: 0
    }))
    setHistory(initialData)
  }, [])

  const loadDashboardData = useCallback(async () => {
    try {
      const [dashStatsRes, alarmsRes, posRes, navRes, tasksRes, lowStockRes] = await Promise.allSettled([
        dashboardService.getStats(),
        alarmService.getActiveAlarms(),
        telemetryService.getLatestPosition(),
        telemetryService.getLatestNavigation(),
        maritimeService.maintenance.getAll({ page: 1, pageSize: 200 }),
        maritimeService.material.getLowStock(),
      ])

      if (posRes.status === 'fulfilled') {
        setPosition(posRes.value)
        setCurrentPosition(posRes.value)
      }
      if (navRes.status === 'fulfilled') {
        setNavigation(navRes.value)
        setCurrentNavigation(navRes.value)
      }
      if (alarmsRes.status === 'fulfilled') {
        setActiveAlarmsState(alarmsRes.value)
        setActiveAlarms(alarmsRes.value)
      }
      if (dashStatsRes.status === 'fulfilled') setDashboardStats(dashStatsRes.value)

      if (tasksRes.status === 'fulfilled') {
        setMaintenanceAlerts(createMaintenanceAlerts(tasksRes.value.data || []))
      }
      if (lowStockRes.status === 'fulfilled') {
        setStockAlerts(createLowStockAlerts(lowStockRes.value || []))
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }, [setDashboardStats, setActiveAlarms, setCurrentPosition, setCurrentNavigation])

  useEffect(() => {
    loadDashboardData()
    const interval = setInterval(loadDashboardData, 5000) 
    return () => clearInterval(interval)
  }, [loadDashboardData])

  const refreshNavigation = useCallback(async () => {
      const navData = await telemetryService.getLatestNavigation()

      if (navData) {
        setNavigation(navData)
        setCurrentNavigation(navData)
        
        setHistory(prev => {
          const now = new Date()
          const timeStr = `${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
          const stw = navData.speedThroughWater ?? 0;
          const rpm = stw * 11.5;
          
          const newPoint = {
            time: timeStr,
            pitch: navData.pitch ?? 0,
            roll: navData.roll ?? 0,
            rpm: Math.max(0, rpm)
          }
          return [...prev.slice(-59), newPoint]
        })
      }
  }, [setCurrentNavigation])

  useEffect(() => {
    return startPolling(async () => {
      if (document.visibilityState === 'visible') await refreshNavigation()
    }, 200)
  }, [refreshNavigation])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-slate-600 dark:text-slate-300">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  const currentSog = position?.speedOverGround ?? 0
  const currentStw = navigation?.speedThroughWater ?? 0
  const currentCog = position?.courseOverGround ?? 0
  const currentHdg = navigation?.headingTrue ?? 0
  
  // Calculate dynamic data based on STW in real-time
  const realRpm = currentStw * 11.5
  const isEngineRunning = realRpm > 0
  
  // Real-time simulated pitch and load based on STW
  const dynamicPitch = isEngineRunning ? Math.min(85, currentStw * 5.5) : 0 
  const engineLoad = isEngineRunning ? Math.min(100, currentStw * 6.0) : 0
  const fuelRate = isEngineRunning ? (engineLoad * 0.18) : 0
  const isOnline = MOCK_EDGE.pendingSync < 50
  const gpsFix = position?.fixQuality >= 2 ? t('conning.dgpsFix') : position?.fixQuality === 1 ? t('conning.gpsFix') : t('conning.noFix')

  const activeUnresolvedAlarms = activeAlarms.filter(alarm => !alarm.isResolved)
  const safetyAlertItems: DashboardAlert[] = activeUnresolvedAlarms.map(alarm => ({
    id: `safety-${alarm.id}`,
    severity: alarm.severity,
    code: alarm.alarmCode,
    title: alarm.alarmType,
    description: alarm.description,
    timestamp: alarm.timestamp,
    location: alarm.location,
  }))
  const dashboardAlerts = [...safetyAlertItems, ...maintenanceAlerts, ...stockAlerts]
  const criticalAlarmsCount = dashboardAlerts.filter(alarm => alarm.severity === 'CRITICAL').length
  const totalAlarmsCount = dashboardAlerts.length

  return (
    <div className="h-full w-full overflow-y-auto bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-200 transition-colors duration-200">
      <div className="p-4 space-y-4 max-w-7xl mx-auto">
        
        {/* â”€â”€ Header: Clocks & GPS Status â”€â”€ */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-700 pb-4">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
              <Clock className="w-10 h-10 text-blue-500" />
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-black font-mono tracking-tighter text-slate-900 dark:text-white leading-none">{utcTimeStr}</span>
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase">UTC</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-lg font-bold font-mono text-slate-600 dark:text-slate-400">{localTimeStr}</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">{t('conning.local')}</span>
                  <span className="text-[10px] text-slate-400 ml-2">{dateStr}</span>
                </div>
              </div>
            </div>

            {/* GPS Status Badge */}
            <div className="hidden sm:flex items-center gap-3 px-4 py-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
               <MapPin className={`w-5 h-5 ${position?.fixQuality > 0 ? 'text-green-500' : 'text-red-500'}`} />
               <div>
                 <div className="text-[10px] font-bold text-slate-400 uppercase">{t('conning.positioning')}</div>
                 <div className="flex items-center gap-2">
                   <span className="text-sm font-bold text-slate-900 dark:text-white">{gpsFix}</span>
                   <span className="text-[10px] font-mono text-slate-500">SAT: {position?.satellitesUsed || 0} | HDOP: {position?.hdop?.toFixed(1) || '0.0'}</span>
                 </div>
               </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className={`flex flex-col items-end px-3 py-1.5 rounded-lg border ${isOnline ? 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700' : 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-500/50'}`}>
              <div className="flex items-center gap-2">
                {isOnline ? <Wifi className="w-4 h-4 text-green-500 dark:text-green-400" /> : <WifiOff className="w-4 h-4 text-red-500 dark:text-red-400" />}
                <span className="text-xs font-bold text-slate-700 dark:text-white tracking-wide uppercase">{t('conning.edgeNode')}</span>
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-mono">
                {t('conning.queue')}: {MOCK_EDGE.pendingSync} | {t('conning.lastSync')}: {new Date(MOCK_EDGE.lastSync).toLocaleTimeString('vi-VN')}
              </div>
            </div>
          </div>
        </div>

        {/* â”€â”€ Navigation Vector Matrix â”€â”€ */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <NavBox label={t('conning.hdg')} value={currentHdg} unit="°" icon={Navigation} color="text-orange-500" subValue={`${t('conning.magnetic')}: ---°`} />
          <NavBox label={t('conning.cog')} value={currentCog} unit="°" icon={Activity} color="text-blue-500" subValue={`${t('conning.drift')}: ${(currentCog - currentHdg).toFixed(1)}°`} />
          <NavBox label={t('conning.sog')} value={currentSog} unit="kn" icon={Anchor} color="text-teal-500" subValue={t('conning.gpsDerived')} />
          <NavBox label={t('conning.stw')} value={currentStw} unit="kn" icon={Activity} color="text-sky-500" subValue={`${t('conning.tide')}: ${(currentSog - currentStw).toFixed(1)} kn`} />
        </div>

        {/* â”€â”€ Main Ship-Centric Display â”€â”€ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          
          {/* Left: Vessel Attitude & Alarms */}
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => setIsAlarmModalOpen(true)}
              className={`rounded-xl border p-4 shadow-sm text-left transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${criticalAlarmsCount > 0 ? 'bg-red-50 dark:bg-red-900/40 border-red-200 dark:border-red-500/50' : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{t('conning.activeAlarms')}</span>
                <AlertTriangle className={`w-5 h-5 ${criticalAlarmsCount > 0 ? 'text-red-500 dark:text-red-400' : 'text-slate-400'}`} />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className={`text-4xl font-black ${criticalAlarmsCount > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>{criticalAlarmsCount}</span>
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase">{t('conning.critical')} / {totalAlarmsCount} {t('conning.total')}</span>
              </div>
            </button>

            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-lg flex-1">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-2 mb-4">
                <CloudLightning className="w-4 h-4 text-yellow-500 dark:text-yellow-400" />
                {t('conning.attitude')}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                 <AttitudeGauge label={t('conning.pitch')} value={navigation?.pitch ?? 0} max={10} color="#3b82f6" />
                 <AttitudeGauge label={t('conning.roll')} value={navigation?.roll ?? 0} max={25} color="#10b981" />
              </div>
              <div className="h-40 mt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#cbd5e1" strokeOpacity={0.3} />
                    <XAxis dataKey="time" hide />
                    <YAxis domain={[-15, 15]} tick={{fontSize: 10, fill: '#64748b'}} stroke="#94a3b8" />
                    <Area type="monotone" dataKey="pitch" stroke="#3b82f6" fillOpacity={0.2} fill="#3b82f6" name="Pitch" isAnimationActive={false} />
                    <Area type="monotone" dataKey="roll" stroke="#10b981" fillOpacity={0.2} fill="#10b981" name="Roll" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Center: Professional Ship Visualization */}
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-lg flex flex-col relative overflow-hidden items-center justify-center min-h-[450px]">
             <div className="absolute inset-0 opacity-10 dark:opacity-20" style={{ backgroundImage: 'radial-gradient(currentColor 1px, transparent 1px)', backgroundSize: '20px 20px', color: 'gray' }}></div>
             
             <div className="absolute inset-0 z-20 pointer-events-none p-6">
                <div className="absolute top-1/4 left-8 text-left">
                  <div className="text-[10px] font-bold text-blue-500 uppercase">{t('conning.draftFore')}</div>
                  <div className="text-xl font-black font-mono text-slate-800 dark:text-white">{MOCK_DRAFT.fore.toFixed(1)}m</div>
                </div>
                <div className="absolute top-1/2 left-4 -translate-y-1/2 text-left">
                  <div className="text-[10px] font-bold text-blue-500 uppercase">{t('conning.draftMid')}</div>
                  <div className="text-xl font-black font-mono text-slate-800 dark:text-white">{MOCK_DRAFT.mid.toFixed(1)}m</div>
                </div>
                <div className="absolute bottom-1/4 left-8 text-left">
                  <div className="text-[10px] font-bold text-blue-500 uppercase">{t('conning.draftAft')}</div>
                  <div className="text-xl font-black font-mono text-slate-800 dark:text-white">{MOCK_DRAFT.aft.toFixed(1)}m</div>
                </div>
                
                <div className="absolute bottom-[25%] right-8 text-right">
                  <div className="text-[10px] font-bold text-teal-500 uppercase">{t('conning.ukc')}</div>
                  <div className="text-2xl font-black font-mono text-slate-800 dark:text-white">{MOCK_DEPTH.ukc.toFixed(1)}m</div>
                </div>
             </div>

             <div className="absolute top-4 text-center z-10">
               <div className="text-xs text-sky-600 dark:text-sky-400 font-mono mb-1">{t('conning.wind')} {MOCK_WIND.speed} kn</div>
               <div className="w-10 h-10 rounded-full border border-sky-400/50 flex items-center justify-center mx-auto" style={{ transform: `rotate(${MOCK_WIND.direction}deg)` }}>
                 <div className="w-1 h-5 bg-sky-500 dark:bg-sky-400 rounded-t-full -translate-y-2"></div>
               </div>
             </div>

             <div className="relative z-0 my-16">
               <svg width="120" height="280" viewBox="0 0 120 280" className="drop-shadow-xl dark:drop-shadow-2xl">
                 <path d="M 60 10 C 20 50, 10 100, 10 220 L 10 260 C 10 270, 20 275, 60 275 C 100 275, 110 270, 110 260 L 110 220 C 110 100, 100 50, 60 10 Z" className="fill-slate-200 dark:fill-slate-700 stroke-slate-300 dark:stroke-slate-600" strokeWidth="4" />
                 <rect x="25" y="180" width="70" height="30" rx="4" className="fill-slate-400 dark:fill-slate-900 stroke-slate-500 dark:stroke-slate-950" />
                 <circle cx="60" cy="50" r="10" className={`${MOCK_THRUSTERS.bow > 0 ? 'fill-teal-500/30 stroke-teal-400 animate-pulse' : 'fill-slate-300 dark:fill-slate-800 stroke-slate-400 dark:stroke-slate-600'}`} strokeWidth="2" />
                 <circle cx="60" cy="240" r="10" className={`${MOCK_THRUSTERS.stern > 0 ? 'fill-teal-500/30 stroke-teal-400 animate-pulse' : 'fill-slate-300 dark:fill-slate-800 stroke-slate-400 dark:stroke-slate-600'}`} strokeWidth="2" />
               </svg>
               
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                 <div className="text-4xl font-black text-slate-800 dark:text-white drop-shadow-md">{currentSog.toFixed(1)}</div>
                 <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">SOG kn</div>
               </div>
             </div>

             <div className="absolute inset-0 pointer-events-none">
                {MOCK_THRUSTERS.bow > 0 && <div className="absolute top-[18%] left-1/2 translate-x-4 text-[9px] font-bold text-teal-400 uppercase">{t('conning.bowThr')}: {MOCK_THRUSTERS.bow}%</div>}
                {MOCK_THRUSTERS.stern > 0 && <div className="absolute bottom-[18%] left-1/2 translate-x-4 text-[9px] font-bold text-teal-400 uppercase">{t('conning.sternThr')}: {MOCK_THRUSTERS.stern}%</div>}
             </div>

             <div className="absolute bottom-6 w-full px-8 flex justify-between items-end z-10">
               <div className="text-center">
                 <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold mb-1">{t('conning.rudder')}</div>
                 <div className="relative w-16 h-8 overflow-hidden border-b-2 border-slate-300 dark:border-slate-600 mx-auto">
                   <div className="absolute bottom-0 left-1/2 w-0.5 h-full bg-slate-400 dark:bg-slate-500 origin-bottom -translate-x-1/2"></div>
                   <div className="absolute bottom-0 left-1/2 w-1 h-full bg-green-500 dark:bg-green-400 origin-bottom transition-transform duration-300" style={{ transform: `translateX(-50%) rotate(${MOCK_RUDDER.angle * 2}deg)` }}></div>
                 </div>
                 <div className="text-sm font-mono text-slate-700 dark:text-white mt-1 font-bold">
                   {MOCK_RUDDER.angle > 0 ? `${t('conning.stbd')} ${MOCK_RUDDER.angle}°` : MOCK_RUDDER.angle < 0 ? `${t('conning.port')} ${Math.abs(MOCK_RUDDER.angle)}°` : t('conning.mid')}
                 </div>
               </div>

               <div className="text-center">
                 <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold mb-1">{t('conning.rot')}</div>
                 <div className="text-xl font-mono text-yellow-600 dark:text-yellow-400 font-bold">{MOCK_ROT.rate.toFixed(1)}°/m</div>
               </div>
             </div>
          </div>

          {/* Right: Map & Propulsion details */}
          <div className="flex flex-col gap-4">
             <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden flex-1 relative min-h-[250px]">
               <div className="absolute inset-0">
                  <VesselMap 
                    currentPosition={position} 
                    positions={plannedRouteData as any[]} 
                    autoFit={true} 
                    height="100%" 
                    className="w-full h-full" 
                  />
               </div>
               <div className="absolute top-2 left-2 bg-white/90 dark:bg-slate-900/80 backdrop-blur border border-slate-200 dark:border-slate-700 p-2 rounded text-xs font-mono shadow-sm z-30">
                 <div className="text-slate-700 dark:text-slate-400 mb-1 font-bold uppercase tracking-tighter text-[9px]">{t('conning.aisTargets')}: 4</div>
                 <div className="flex justify-between gap-4 text-green-600 dark:text-green-400"><span>{t('conning.cpa')}:</span><span>2.4 NM</span></div>
                 <div className="flex justify-between gap-4 text-green-600 dark:text-green-400"><span>{t('conning.tcpa')}:</span><span>14 min</span></div>
               </div>
             </div>

             <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-lg">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-2 border-b border-slate-100 dark:border-slate-700 pb-2 mb-4">
                  <Settings className="w-4 h-4 text-orange-500 dark:text-orange-400" />
                  {t('conning.propulsion')}
                </h3>
                
                <div className="flex items-center justify-between">
                  <div className="relative w-28 h-28 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="45" fill="none" className="stroke-slate-200 dark:stroke-slate-700" strokeWidth="8" />
                      <circle 
                        cx="50" cy="50" r="45" fill="none" 
                        stroke={isEngineRunning ? '#10b981' : '#ef4444'} 
                        strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={`${(Math.min(realRpm, 200) / 200) * 283} 283`}
                        className="transition-all duration-300"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                      <span className="font-mono text-2xl font-bold text-slate-800 dark:text-white">{Math.round(realRpm)}</span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase">{t('conning.rpm')}</span>
                    </div>
                  </div>

                  <div className="flex-1 ml-6 space-y-3">
                     <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-lg border border-slate-100 dark:border-slate-700">
                       <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 font-bold mb-1">
                         <span className="uppercase">{t('conning.propPitch')}</span>
                         <span className="text-orange-500">{dynamicPitch.toFixed(0)}%</span>
                       </div>
                       <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                         <div className="h-full bg-orange-500 transition-all duration-500" style={{ width: `${dynamicPitch}%` }} />
                       </div>
                     </div>
                     <div className="grid grid-cols-2 gap-2 text-center">
                        <div className="bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded-lg border border-slate-100 dark:border-slate-700">
                           <div className="text-[9px] text-slate-400 uppercase">{t('conning.engineLoad')}</div>
                           <div className="text-xs font-bold text-slate-800 dark:text-white">{engineLoad.toFixed(1)}%</div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-900/50 p-1.5 rounded-lg border border-slate-100 dark:border-slate-700">
                           <div className="text-[9px] text-slate-400 uppercase">{t('conning.fuelRate')}</div>
                           <div className="text-xs font-bold text-slate-800 dark:text-white">{fuelRate.toFixed(1)} t/d</div>
                        </div>
                     </div>
                  </div>
                </div>
             </div>
          </div>
        </div>

      </div>

      {isAlarmModalOpen && (
        <AlarmListModal alarms={dashboardAlerts} onClose={() => setIsAlarmModalOpen(false)} />
      )}
    </div>
  )
}

function AlarmListModal({ alarms, onClose }: { alarms: DashboardAlert[]; onClose: () => void }) {
  const severityClass = (severity: SafetyAlarm['severity']) => {
    if (severity === 'CRITICAL') return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-700'
    if (severity === 'WARNING') return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700'
    return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-700'
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-3xl max-h-[80vh] overflow-hidden rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white uppercase tracking-wide">Cảnh báo đang hoạt động</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{alarms.length} cảnh báo chưa xử lý</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-white dark:hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(80vh-82px)] p-4">
          {alarms.length === 0 ? (
            <div className="py-12 text-center">
              <AlertTriangle className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Không có cảnh báo đang hoạt động</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Danh sách sẽ cập nhật khi backend trả về cảnh báo mới.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {alarms.map(alarm => (
                <div key={alarm.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase ${severityClass(alarm.severity)}`}>{alarm.severity}</span>
                        {alarm.code && <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{alarm.code}</span>}
                      </div>
                      <div className="mt-2 text-sm font-bold text-slate-900 dark:text-white">{alarm.title}</div>
                      {alarm.description && <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">{alarm.description}</div>}
                    </div>
                    <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                      <div>{new Date(alarm.timestamp).toLocaleString('vi-VN')}</div>
                      {alarm.location && <div className="mt-1 font-semibold uppercase">{alarm.location}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function NavBox({ label, value, unit, icon: Icon, color, subValue }: { label: string; value: number; unit: string; icon: any; color: string; subValue?: string }) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-3xl font-black font-mono text-slate-900 dark:text-white leading-none">{value.toFixed(1)}</span>
        <span className="text-xs font-bold text-slate-400">{unit}</span>
      </div>
      {subValue && <div className="text-[10px] font-mono text-slate-500 mt-1">{subValue}</div>}
    </div>
  )
}

function AttitudeGauge({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const isDanger = Math.abs(value) > max * 0.7;
  return (
    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-100 dark:border-slate-700 text-center">
      <div className="text-[10px] text-slate-500 dark:text-slate-400 font-bold mb-1 tracking-tighter uppercase">{label}</div>
      <div className={`text-2xl font-mono font-bold ${isDanger ? 'text-red-500 dark:text-red-400' : 'text-slate-800 dark:text-white'}`}>
        {value > 0 ? '+' : ''}{value.toFixed(1)}°
      </div>
      <div className="mt-2 h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden relative">
        <div className="absolute top-0 bottom-0 w-0.5 bg-slate-400 left-1/2 -translate-x-1/2 z-10" />
        <div 
          className="absolute top-0 bottom-0 transition-all duration-300"
          style={{
            backgroundColor: isDanger ? '#ef4444' : color,
            left: value < 0 ? `${50 + (value/max)*50}%` : '50%',
            right: value > 0 ? `${50 - (value/max)*50}%` : '50%'
          }}
        />
      </div>
    </div>
  )
}
