import { useEffect, useMemo, useState, useRef, type ReactNode } from 'react'
import { Info, Maximize2, X } from 'lucide-react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useTranslationSafe } from '@/contexts/I18nContext'
import { AppModal } from '@/components/common/AppModal'
import { Gauge, Compass } from './engine-summary/Instruments'
import { engineAt, engines, kpis, signalTimes, VESSEL_ZONE, windowData, type Engine, type Period, type TrendPoint, fleetTotals } from './engine-summary/model'
import { MachineryDiagram, VesselFuel } from './engine-summary/OperationalSignals'
import { useEngineSummary } from './engine-summary/store'
import './engine-summary/engine-summary.css'

function useClock() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const update = () => { if (!document.hidden) setNow(Date.now()) }
    const timer = window.setInterval(update, 1000)
    document.addEventListener('visibilitychange', update)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', update) }
  }, [])
  return now
}

function Panel({ title, tools, children, className = '' }: { title: string; tools?: ReactNode; children: ReactNode; className?: string }) {
  const { t } = useTranslationSafe()
  const [expanded, setExpanded] = useState(false)
  return <section className={`engine-panel ${className}`}><header><h2>{title}</h2><div className="engine-panel-tools">{tools}<button type="button" className="engine-icon-button" aria-label={t('engineSummary.expand', { name: title })} onClick={() => setExpanded(true)}><Maximize2 size={17} /></button></div></header>
    <div className="engine-panel-content">{children}</div>
    {expanded && <AppModal title={title} onClose={() => setExpanded(false)}><div className="engine-summary engine-expanded">{children}</div></AppModal>}
  </section>
}
function PeriodSelect({ value, onChange, label }: { value: Period; onChange: (value: Period) => void; label: string }) {
  const { t } = useTranslationSafe()
  return <select aria-label={label} value={value} onChange={e => onChange(Number(e.target.value) as Period)}>
    <option value={1}>{t('engineSummary.today')}</option><option value={7}>{t('engineSummary.week')}</option><option value={30}>{t('engineSummary.month')}</option>
  </select>
}
function EngineCard({ engine, time }: { engine: Engine; time: number }) {
  const { t, locale } = useTranslationSafe()
  const at = engineAt(engine, signalTimes(time).bridge)
  const electric = engineAt(engine, signalTimes(time).electric)
  const today = useMemo(() => windowData(engine, 1, time).totals, [engine, time])
  const format = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 1 })
  const text = (key: string) => t(`engineSummary.${key}`)
  const big = { value: electric.rpm, max: engine.maxRpm, unit: 'RPM', label: t('engineSummary.signals.propRpm') }
  const small = { value: at.power, max: engine.ratedPower, unit: 'kW', label: text('shaftPower') }
  const metrics: [string, string][] = [
    [text('consumption'), `${format(at.consumption)} kg/h`],
    [text('runningToday'), t('engineSummary.hoursMinutes', { hours: Math.floor(today.runningMinutes / 60), minutes: Math.floor(today.runningMinutes % 60) })],
    [text('fuelToday'), `${format(today.fuel)} kg`],
  ]
  metrics.push(['SFOC', at.sfoc === null ? '—' : `${format(at.sfoc)} g/kWh`])
  return <div className="engine-equipment" data-engine={engine.id}>
    <div className="engine-equipment-subtitle"><span>{text('information')} · {engine.id}</span><span className={`engine-state ${at.running ? 'is-running' : ''}`}>{text(at.running ? 'running' : 'stopped')}</span></div>
    <div className="engine-instruments" data-signal="propRpm"><Gauge value={big.value} maximum={big.max} unit={big.unit} label={big.label} format={format} />
      <div className="engine-secondary-gauges has-pair"><Gauge value={small.value} maximum={small.max} unit={small.unit} label={small.label} small format={format} /><Gauge value={electric.rpm} maximum={engine.maxRpm} unit="RPM" label={t('engineSummary.signals.mainRpm')} small format={format} /></div></div>
    <dl className="engine-metrics" data-signal="mainRpm">{metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  </div>
}
function Trends({ engine, time, period }: { engine: Engine; time: number; period: Period }) {
  const { t, locale } = useTranslationSafe()
  const data = useMemo(() => windowData(engine, period, time), [engine, period, time])
  const [reading, setReading] = useState<TrendPoint | null>(null)
  useEffect(() => setReading(null), [engine.id, period])
  const at = engineAt(engine, signalTimes(time).bridge)
  const format = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 1 })
  const date = (value: number) => new Intl.DateTimeFormat(locale, { timeZone: VESSEL_ZONE, ...(period === 1 ? { hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', hour: '2-digit' }) }).format(value)
  const chart = (fuel: boolean) => <div className="engine-chart" aria-label={t(`engineSummary.${fuel ? 'fuelChart' : 'sfoc'}`)}>
    <ResponsiveContainer width="100%" height="100%"><LineChart data={data.points} margin={{ top: 10, right: 12, left: 0, bottom: 0 }} onClick={state => {
      const value = state?.activePayload?.[0]?.payload as TrendPoint | undefined
      if (value) setReading({ ...value })
    }}>
      <CartesianGrid strokeDasharray="3 3" vertical={false} />
      <XAxis dataKey="time" tickFormatter={date} minTickGap={35} tick={{ fontSize: 11 }} />
      <YAxis width={52} tick={{ fontSize: 11 }} tickFormatter={value => Number(value).toLocaleString(locale, { maximumFractionDigits: fuel ? 1 : 2 })} domain={fuel ? [0, 'auto'] : ['auto', 'auto']} />
      <Tooltip labelFormatter={value => date(Number(value))} formatter={(value: number, name: string) => [`${format(value)} ${fuel ? 'kg' : 'g/kWh'}`, name]} contentStyle={{ background: 'var(--engine-surface)', borderColor: 'var(--engine-border)', color: 'var(--engine-text)' }} />
      {fuel && <Legend verticalAlign="top" height={25} iconType="circle" />}
      {fuel && <Line name="MDO" dataKey="mdo" stroke="#ef4444" strokeWidth={2} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />}
      {fuel && <Line name="HFO" dataKey="hfo" stroke="#3b82f6" strokeWidth={2} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />}
      {!fuel && <Line name="SFOC" dataKey="sfoc" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} />}
    </LineChart></ResponsiveContainer>
  </div>
  return <div className="engine-trends">
    <div className="engine-chart-unit">kg</div>{chart(true)}
    <dl className="engine-metrics engine-rates"><div><dt>{t('engineSummary.supply')}</dt><dd>{format(at.supply)} kg/h</dd></div><div><dt>{t('engineSummary.return')}</dt><dd>{format(at.returnRate)} kg/h</dd></div></dl>
    <h3>{t('engineSummary.sfoc')}<Info size={15} aria-label={t('engineSummary.sfocHelp')}><title>{t('engineSummary.sfocHelp')}</title></Info></h3>
    <div className="engine-chart-unit">g/kWh</div>{chart(false)}
    <dl className="engine-metrics engine-rates"><div><dt>{t('engineSummary.currentSfoc')}</dt><dd>{at.sfoc === null ? '—' : `${format(at.sfoc)} g/kWh`}</dd></div></dl>
    {reading ? <div className="engine-reading"><span>{date(reading.time)} · MDO {format(reading.mdo)} kg · HFO {format(reading.hfo)} kg · {`SFOC ${reading.sfoc === null ? '—' : format(reading.sfoc)} g/kWh`}</span><button type="button" className="engine-icon-button" aria-label={t('engineSummary.closeReading')} onClick={() => setReading(null)}><X size={16} /></button></div> : <p className="engine-chart-hint">{t('engineSummary.chartHint')}</p>}
  </div>
}
function Kpi({ engine, time, period, vessel }: { engine: Engine; time: number; period: Period; vessel: boolean }) {
  const { t, locale } = useTranslationSafe()
  const totals = useMemo(() => kpis(vessel ? fleetTotals(period, time) : windowData(engine, period, time).totals), [engine, period, time, vessel])
  const format = (n: number | null) => n === null ? '—' : n.toLocaleString(locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 })
  const rows: [string, number | null, string][] = [
    ['totalFuel', totals.fuel / 1000, 't'], ['distance', totals.distance, 'NM'], ['co2', totals.co2 / 1000, 't'],
    ['fuelPerMile', totals.fuelPerMile, 'kg/NM'], ['co2PerMile', totals.co2PerMile, 'kg/NM'],
  ]
  return <><dl className="engine-metrics engine-kpi">{rows.map(([key, value, unit]) => <div key={key}><dt>{t(`engineSummary.${key}`)}</dt><dd>{format(value)} <small>{unit}</small></dd></div>)}</dl>
    <div className="engine-kpi-scope"><span>{vessel ? t('engineSummary.signals.fleetFuel') : `${t(`engineSummary.${engine.kind}`)} · ${engine.id}`}</span><Info size={15} aria-label={t(vessel ? 'engineSummary.signals.fleetKpiHelp' : 'engineSummary.kpiHelp')}><title>{t(vessel ? 'engineSummary.signals.fleetKpiHelp' : 'engineSummary.kpiHelp')}</title></Info></div></>
}
export function EngineSummaryPage() {
  const { t, locale } = useTranslationSafe()
  const view = useEngineSummary()
  const [fuelScope, setFuelScope] = useState<'engine' | 'vessel'>('engine')
  const now = useClock()
  const dashboard = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number>()
  useEffect(() => {
    const measure = () => setHeight(Math.max(480, window.innerHeight - (dashboard.current?.getBoundingClientRect().top || 0)))
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  const engine = engines[0]
  const text = (key: string) => t(`engineSummary.${key}`)
  const name = (item: Engine) => `${text(item.kind)} (${engines.filter(row => row.kind === item.kind).indexOf(item) + 1})`
  const format = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 1 })
  return <div ref={dashboard} className="engine-summary engine-dashboard" data-time={now} style={{ height }}>
      <div className="engine-detail-grid has-main-engine"><div id="engine-detail-content" aria-label={text('main')} className="engine-detail-content">
        <Panel title={name(engine)} className="engine-info-panel"><EngineCard engine={engine} time={now} /></Panel>
        <Panel title={text('fuelChart')} className="engine-trend-panel" tools={fuelScope === 'engine' ? <PeriodSelect value={view.chartPeriod} onChange={view.setChartPeriod} label={text('chartPeriod')} /> : undefined}><div className="engine-fuel-scope" role="group" aria-label={text('fuelChart')}><button type="button" aria-pressed={fuelScope === 'engine'} onClick={() => setFuelScope('engine')}>{name(engine)}</button><button type="button" aria-pressed={fuelScope === 'vessel'} onClick={() => setFuelScope('vessel')}>{t('engineSummary.signals.fleetFuel')}</button></div>{fuelScope === 'engine' ? <Trends engine={engine} time={now} period={view.chartPeriod} /> : <VesselFuel time={now} />}</Panel>
        <Panel title={t('engineSummary.signals.machinery')} className="engine-machinery-panel"><MachineryDiagram time={now} /></Panel>
      </div>
      <div className="engine-right-column"><Panel title={text('kpi')} tools={<PeriodSelect value={view.kpiPeriod} onChange={view.setKpiPeriod} label={text('kpiPeriod')} />}><Kpi engine={engine} time={now} period={view.kpiPeriod} vessel={fuelScope === 'vessel'} /></Panel>
        <Panel title={text('navigation')} className="engine-navigation-panel"><Compass time={now} format={format} /></Panel></div>
    </div>
  </div>
}
