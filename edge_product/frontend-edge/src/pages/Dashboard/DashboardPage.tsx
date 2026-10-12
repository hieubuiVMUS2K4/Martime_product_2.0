import { useEffect, useState, useCallback, useMemo, type ReactNode } from 'react'
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
  X,
  type LucideIcon,
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
      <div className="flex items-center justify-center h-full bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-sm text-gray-600">{t('common.loading')}</p>
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
    <div className="h-full w-full overflow-y-auto bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <div className="w-full px-[1.5%] py-[clamp(10px,1.2vw,20px)] flex flex-col gap-[clamp(10px,1vw,16px)]">

        {/* Status strip: clocks, GPS, edge node */}
        <div className="grid grid-cols-1 lg:grid-cols-3 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm divide-y lg:divide-y-0 lg:divide-x divide-gray-200">
          <div className="flex items-center gap-3 px-4 py-3">
            <IconTile icon={Clock} tone="blue" />
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold tabular-nums text-gray-900 leading-none">{utcTimeStr}</span>
                <span className="text-xs font-semibold text-blue-600">UTC</span>
              </div>
              <div className="mt-1 text-xs text-gray-500">
                {t('conning.local')}: <span className="font-medium tabular-nums text-gray-700">{localTimeStr}</span>
                <span className="mx-1.5 text-gray-300">•</span>{dateStr}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 px-4 py-3">
            <IconTile icon={MapPin} tone={position?.fixQuality > 0 ? 'green' : 'red'} />
            <div className="min-w-0">
              <div className="text-xs text-gray-500">{t('conning.positioning')}</div>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-semibold text-gray-900">{gpsFix}</span>
                <span className="text-xs tabular-nums text-gray-500">SAT {position?.satellitesUsed || 0} · HDOP {position?.hdop?.toFixed(1) || '0.0'}</span>
              </div>
            </div>
          </div>

          <div className={`flex items-center gap-3 px-4 py-3 ${isOnline ? '' : 'bg-red-50'}`}>
            <IconTile icon={isOnline ? Wifi : WifiOff} tone={isOnline ? 'green' : 'red'} />
            <div className="min-w-0">
              <div className="text-xs text-gray-500">{t('conning.edgeNode')}</div>
              <div className="text-sm text-gray-700">
                {t('conning.queue')}: <span className="font-semibold text-gray-900">{MOCK_EDGE.pendingSync}</span>
                <span className="mx-1.5 text-gray-300">•</span>
                {t('conning.lastSync')}: <span className="font-semibold tabular-nums text-gray-900">{new Date(MOCK_EDGE.lastSync).toLocaleTimeString('vi-VN')}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation vectors */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-[clamp(10px,1vw,16px)]">
          <NavBox label={t('conning.hdg')} value={currentHdg} unit="°" icon={Navigation} tone="orange" subValue={`${t('conning.magnetic')}: ---°`} />
          <NavBox label={t('conning.cog')} value={currentCog} unit="°" icon={Activity} tone="blue" subValue={`${t('conning.drift')}: ${(currentCog - currentHdg).toFixed(1)}°`} />
          <NavBox label={t('conning.sog')} value={currentSog} unit="kn" icon={Anchor} tone="teal" subValue={t('conning.gpsDerived')} />
          <NavBox label={t('conning.stw')} value={currentStw} unit="kn" icon={Activity} tone="sky" subValue={`${t('conning.tide')}: ${(currentSog - currentStw).toFixed(1)} kn`} />
        </div>

        {/* Main display */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[clamp(10px,1vw,16px)]">

          {/* Left: alarms & attitude */}
          <div className="flex flex-col gap-[clamp(10px,1vw,16px)]">
            <button
              type="button"
              onClick={() => setIsAlarmModalOpen(true)}
              className={`flex items-center gap-4 rounded-lg border px-4 py-3 text-left shadow-sm transition hover:shadow focus:outline-none focus:ring-2 focus:ring-blue-500 ${criticalAlarmsCount > 0 ? 'border-red-200 bg-red-50 hover:bg-red-100/60' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
            >
              <IconTile icon={AlertTriangle} tone={criticalAlarmsCount > 0 ? 'red' : 'gray'} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-gray-700">{t('conning.activeAlarms')}</div>
                <div className="mt-0.5 flex items-baseline gap-2">
                  <span className={`text-3xl font-semibold leading-none ${criticalAlarmsCount > 0 ? 'text-red-600' : 'text-gray-900'}`}>{criticalAlarmsCount}</span>
                  <span className="text-sm text-gray-500">{t('conning.critical').toLowerCase()} / {totalAlarmsCount} {t('conning.total').toLowerCase()}</span>
                </div>
              </div>
              <span className="text-xs font-medium text-blue-600">Xem →</span>
            </button>

            <Panel title={t('conning.attitude')} icon={CloudLightning} className="flex-1">
              <div className="grid grid-cols-2 gap-3">
                <AttitudeGauge label={t('conning.pitch')} value={navigation?.pitch ?? 0} max={10} color="#3b82f6" />
                <AttitudeGauge label={t('conning.roll')} value={navigation?.roll ?? 0} max={25} color="#10b981" />
              </div>
              <div className="mt-3 h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <XAxis dataKey="time" hide />
                    <YAxis domain={[-15, 15]} tick={{ fontSize: '0.875rem', fill: '#6b7280' }} stroke="#d1d5db" />
                    <Area type="monotone" dataKey="pitch" stroke="#3b82f6" fillOpacity={0.15} fill="#3b82f6" name="Pitch" isAnimationActive={false} />
                    <Area type="monotone" dataKey="roll" stroke="#10b981" fillOpacity={0.15} fill="#10b981" name="Roll" isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex items-center justify-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-blue-500" />{t('conning.pitch')}</span>
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />{t('conning.roll')}</span>
              </div>
            </Panel>
          </div>

          {/* Center: ship view — dựng bằng lưới (không đặt tuyệt đối) để khi khung hẹp các ô số
              tự co/xuống dòng chứ không đè lên thân tàu hay đè lên nhau */}
          <Panel title={t('conning.shipView')} icon={Anchor} bodyClassName="p-0 flex">
            <div className="relative flex min-h-[440px] flex-1 flex-col overflow-hidden">
              <div className="pointer-events-none absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(#64748b 1px, transparent 1px)', backgroundSize: '20px 20px' }} />

              {/* Wind */}
              <div className="relative flex flex-col items-center pt-3">
                <div className="mb-1 text-xs font-medium text-sky-700">{t('conning.wind')} {MOCK_WIND.speed} kn</div>
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-sky-300 bg-white" style={{ transform: `rotate(${MOCK_WIND.direction}deg)` }}>
                  <div className="h-5 w-1 -translate-y-2 rounded-t-full bg-sky-500" />
                </div>
              </div>

              {/* Drafts | Hull | UKC & thrusters */}
              <div className="relative grid flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-[clamp(8px,1.2vw,16px)] px-[4%] py-3">
                <div className="flex min-w-0 flex-col items-start gap-3">
                  <Readout label={t('conning.draftFore')} value={`${MOCK_DRAFT.fore.toFixed(1)} m`} />
                  <Readout label={t('conning.draftMid')} value={`${MOCK_DRAFT.mid.toFixed(1)} m`} />
                  <Readout label={t('conning.draftAft')} value={`${MOCK_DRAFT.aft.toFixed(1)} m`} />
                </div>

                <div className="relative w-[clamp(80px,8vw,120px)]">
                  <svg viewBox="0 0 120 280" className="h-auto w-full drop-shadow-md">
                    <path d="M 60 10 C 20 50, 10 100, 10 220 L 10 260 C 10 270, 20 275, 60 275 C 100 275, 110 270, 110 260 L 110 220 C 110 100, 100 50, 60 10 Z" className="fill-slate-100 stroke-slate-300" strokeWidth="3" />
                    <rect x="25" y="180" width="70" height="30" rx="4" className="fill-slate-300 stroke-slate-400" />
                    <circle cx="60" cy="50" r="10" className={MOCK_THRUSTERS.bow > 0 ? 'fill-teal-500/30 stroke-teal-500 animate-pulse' : 'fill-slate-200 stroke-slate-400'} strokeWidth="2" />
                    <circle cx="60" cy="240" r="10" className={MOCK_THRUSTERS.stern > 0 ? 'fill-teal-500/30 stroke-teal-500 animate-pulse' : 'fill-slate-200 stroke-slate-400'} strokeWidth="2" />
                  </svg>
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                    <div className="text-[clamp(20px,2.2vw,36px)] font-semibold leading-none tabular-nums text-gray-900">{currentSog.toFixed(1)}</div>
                    <div className="mt-1 whitespace-nowrap text-xs font-medium text-gray-500">SOG (kn)</div>
                  </div>
                </div>

                <div className="flex min-w-0 flex-col items-end gap-3">
                  {MOCK_THRUSTERS.bow > 0 && <Readout label={t('conning.bowThr')} value={`${MOCK_THRUSTERS.bow}%`} tone="teal" align="right" />}
                  <Readout label={t('conning.ukc')} value={`${MOCK_DEPTH.ukc.toFixed(1)} m`} tone="teal" align="right" />
                  {MOCK_THRUSTERS.stern > 0 && <Readout label={t('conning.sternThr')} value={`${MOCK_THRUSTERS.stern}%`} tone="teal" align="right" />}
                </div>
              </div>

              {/* Rudder & ROT */}
              <div className="relative grid grid-cols-2 divide-x divide-gray-200 border-t border-gray-200 bg-white/90">
                <div className="flex min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 px-2 py-2.5">
                  <div className="relative h-7 w-14 shrink-0 overflow-hidden border-b-2 border-gray-300">
                    <div className="absolute bottom-0 left-1/2 h-full w-0.5 -translate-x-1/2 bg-gray-300" />
                    <div className="absolute bottom-0 left-1/2 h-full w-1 origin-bottom bg-green-500 transition-transform duration-300" style={{ transform: `translateX(-50%) rotate(${MOCK_RUDDER.angle * 2}deg)` }} />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs text-gray-500">{t('conning.rudder')}</div>
                    <div className="truncate text-sm font-semibold text-gray-900">
                      {MOCK_RUDDER.angle > 0 ? `${t('conning.stbd')} ${MOCK_RUDDER.angle}°` : MOCK_RUDDER.angle < 0 ? `${t('conning.port')} ${Math.abs(MOCK_RUDDER.angle)}°` : t('conning.mid')}
                    </div>
                  </div>
                </div>
                <div className="flex min-w-0 flex-col items-center justify-center px-2 py-2.5">
                  <div className="text-xs text-gray-500">{t('conning.rot')}</div>
                  <div className="text-sm font-semibold tabular-nums text-amber-600">{MOCK_ROT.rate.toFixed(1)}°/min</div>
                </div>
              </div>
            </div>
          </Panel>

          {/* Right: map & propulsion — màn vừa (2 cột) thì xuống hàng riêng, trải hết bề ngang */}
          <div className="grid gap-[clamp(10px,1vw,16px)] md:col-span-2 md:grid-cols-2 xl:col-span-1 xl:flex xl:flex-col">
            <Panel title={t('conning.chart')} icon={MapPin} className="flex-1" bodyClassName="p-0 flex-1 flex">
              <div className="relative min-h-[240px] flex-1">
                <div className="absolute inset-0">
                  <VesselMap
                    currentPosition={position}
                    positions={plannedRouteData as any[]}
                    autoFit={true}
                    height="100%"
                    className="w-full h-full"
                  />
                </div>
                <div className="absolute left-2 top-2 z-30 rounded-md border border-gray-200 bg-white/95 px-2.5 py-1.5 text-xs shadow-sm">
                  <div className="mb-0.5 font-semibold text-gray-700">{t('conning.aisTargets')}: 4</div>
                  <div className="flex justify-between gap-4 text-gray-600"><span>{t('conning.cpa')}</span><span className="font-medium text-green-700">2.4 NM</span></div>
                  <div className="flex justify-between gap-4 text-gray-600"><span>{t('conning.tcpa')}</span><span className="font-medium text-green-700">14 min</span></div>
                </div>
              </div>
            </Panel>

            <Panel title={t('conning.propulsion')} icon={Settings}>
              <div className="flex items-center gap-4">
                <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
                  <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="44" fill="none" className="stroke-gray-200" strokeWidth="8" />
                    <circle
                      cx="50" cy="50" r="44" fill="none"
                      stroke={isEngineRunning ? '#10b981' : '#ef4444'}
                      strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={`${(Math.min(realRpm, 200) / 200) * 276} 276`}
                      className="transition-all duration-300"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-xl font-semibold tabular-nums text-gray-900">{Math.round(realRpm)}</span>
                    <span className="text-xs font-medium text-gray-500">{t('conning.rpm')}</span>
                  </div>
                </div>

                <div className="min-w-0 flex-1 space-y-2.5">
                  <div>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-gray-500">{t('conning.propPitch')}</span>
                      <span className="font-semibold text-orange-600">{dynamicPitch.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
                      <div className="h-full bg-orange-500 transition-all duration-500" style={{ width: `${dynamicPitch}%` }} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Stat label={t('conning.engineLoad')} value={`${engineLoad.toFixed(1)}%`} />
                    <Stat label={t('conning.fuelRate')} value={`${fuelRate.toFixed(1)} t/d`} />
                  </div>
                </div>
              </div>
            </Panel>
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
      <div className="w-full max-w-4xl max-h-[80vh] overflow-hidden rounded-lg bg-white border border-gray-200 shadow-2xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 bg-blue-50">
          <div>
            <h2 className="text-base font-semibold text-blue-700">Cảnh báo đang hoạt động</h2>
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
                        <span className={`px-2 py-0.5 rounded-full border text-xs font-bold uppercase ${severityClass(alarm.severity)}`}>{alarm.severity}</span>
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

type Tone = 'blue' | 'green' | 'red' | 'orange' | 'teal' | 'sky' | 'gray'

const TONE_TILE: Record<Tone, string> = {
  blue: 'bg-blue-50 text-blue-600',
  green: 'bg-green-50 text-green-600',
  red: 'bg-red-100 text-red-600',
  orange: 'bg-orange-50 text-orange-600',
  teal: 'bg-teal-50 text-teal-600',
  sky: 'bg-sky-50 text-sky-600',
  gray: 'bg-gray-100 text-gray-500',
}

function IconTile({ icon: Icon, tone, size = 'md' }: { icon: LucideIcon; tone: Tone; size?: 'md' | 'lg' }) {
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-lg ${TONE_TILE[tone]} ${size === 'lg' ? 'h-11 w-11' : 'h-9 w-9'}`}>
      <Icon className={size === 'lg' ? 'h-5 w-5' : 'h-[18px] w-[18px]'} />
    </div>
  )
}

function Panel({ title, icon: Icon, className = '', bodyClassName = 'p-4', children }: { title: string; icon: LucideIcon; className?: string; bodyClassName?: string; children: ReactNode }) {
  return (
    <section className={`flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm ${className}`}>
      <header className="flex items-center gap-2 border-b border-gray-200 bg-blue-50 px-4 py-2.5">
        <Icon className="h-4 w-4 text-blue-600" />
        <h2 className="text-sm font-semibold text-blue-700">{title}</h2>
      </header>
      <div className={`flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  )
}

function Readout({ label, value, tone = 'blue', align = 'left' }: { label: string; value: string; tone?: 'blue' | 'teal'; align?: 'left' | 'right' }) {
  return (
    <div className={`max-w-full min-w-0 rounded-md border border-gray-200 bg-white/90 px-2.5 py-1.5 shadow-sm ${align === 'right' ? 'text-right' : ''}`}>
      <div className={`truncate text-xs font-medium ${tone === 'teal' ? 'text-teal-600' : 'text-blue-600'}`} title={label}>{label}</div>
      <div className="truncate text-base font-semibold tabular-nums text-gray-900">{value}</div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 px-2 py-1.5 text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm font-semibold tabular-nums text-gray-900">{value}</div>
    </div>
  )
}

function NavBox({ label, value, unit, icon, tone, subValue }: { label: string; value: number; unit: string; icon: LucideIcon; tone: Tone; subValue?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <IconTile icon={icon} tone={tone} size="lg" />
      <div className="min-w-0">
        <div className="text-xs font-medium text-gray-500">{label}</div>
        <div className="flex items-baseline gap-1">
          <span className="text-2xl font-semibold tabular-nums leading-tight text-gray-900">{value.toFixed(1)}</span>
          <span className="text-sm text-gray-500">{unit}</span>
        </div>
        {subValue && <div className="truncate text-xs text-gray-500">{subValue}</div>}
      </div>
    </div>
  )
}

function AttitudeGauge({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const isDanger = Math.abs(value) > max * 0.7
  return (
    <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-center">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-xl font-semibold tabular-nums ${isDanger ? 'text-red-600' : 'text-gray-900'}`}>
        {value > 0 ? '+' : ''}{value.toFixed(1)}°
      </div>
      <div className="relative mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
        <div className="absolute inset-y-0 left-1/2 z-10 w-0.5 -translate-x-1/2 bg-gray-400" />
        <div
          className="absolute inset-y-0 transition-all duration-300"
          style={{
            backgroundColor: isDanger ? '#ef4444' : color,
            left: value < 0 ? `${50 + (value / max) * 50}%` : '50%',
            right: value > 0 ? `${50 - (value / max) * 50}%` : '50%',
          }}
        />
      </div>
    </div>
  )
}
