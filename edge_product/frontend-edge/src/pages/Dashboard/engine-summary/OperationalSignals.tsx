import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useTranslationSafe } from '@/contexts/I18nContext'
import { dayStart, fleetFuelDay, signalsAt, signalTimes, VESSEL_ZONE } from './model'

export function MachineryDiagram({ time }: { time: number }) {
  const { t, locale } = useTranslationSafe()
  const signals = signalsAt(time)
  const text = (key: string) => t(`engineSummary.signals.${key}`)
  const format = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 1 })
  const gauges = [
    { key: 'coolTemp', value: signals.coolTemp, max: 120, unit: '°C', color: '#3b82f6' },
    { key: 'luboPress', value: signals.luboPress, max: 8, unit: 'bar', color: '#d99a17' },
    { key: 'luboTemp', value: signals.luboTemp, max: 100, unit: '°C', color: '#d99a17' },
    { key: 'startAirPress', value: signals.startAirPress, max: 40, unit: 'bar', color: '#14b8a6' },
  ]
  return <div className="engine-machinery-diagram">
    <div className="engine-system-dials">{gauges.map(gauge => {
      const ratio = Math.min(1, Math.max(0, gauge.value / gauge.max))
      return <figure key={gauge.key} data-signal={gauge.key}>
        <figcaption>{text(gauge.key)}</figcaption>
        <svg viewBox="0 0 220 125" role="img" aria-label={`${text(gauge.key)} ${format(gauge.value)} ${gauge.unit}`}>
          <path d="M 24 100 A 86 86 0 0 1 196 100" className="system-dial-track" pathLength="100" />
          <path d="M 24 100 A 86 86 0 0 1 196 100" className="system-dial-progress" pathLength="100" stroke={gauge.color} strokeDasharray={`${ratio * 100} 100`} />
          {[0, .25, .5, .75, 1].map(tick => {
            const angle = Math.PI * (1 - tick)
            return <line key={tick} x1={110 + Math.cos(angle) * 73} y1={100 - Math.sin(angle) * 73} x2={110 + Math.cos(angle) * 79} y2={100 - Math.sin(angle) * 79} className="gauge-tick" />
          })}
          <g className="system-dial-pointer" style={{ transform: `rotate(${ratio * 180 - 90}deg)`, transformOrigin: '110px 100px' }}><path d="M 107 100 L 110 40 L 113 100 Z" fill={gauge.color} /></g>
          <circle cx="110" cy="100" r="4" fill={gauge.color} />
          <text x="20" y="122" className="system-dial-scale">0</text><text x="200" y="122" textAnchor="end" className="system-dial-scale">{gauge.max} {gauge.unit}</text>
        </svg>
        <strong>{format(gauge.value)} <small>{gauge.unit}</small></strong>
      </figure>
    })}</div>
    <div className="engine-schematic-scroll"><svg className="engine-machine-schematic" viewBox="0 0 1000 310" role="img" aria-label={`${text('machinery')} · ${text('exhaustTemp')} ${signals.exhaustTemp.map((value, index) => `${index + 1}: ${format(value)} °C`).join(', ')} · ${text('fuelRack')} ${format(signals.fuelRack)}%`}>
      <text x="30" y="30" className="system-title">{text('exhaustTemp')} · °C</text>
      <path d="M 82 125 H 840 V 55 H 925" className="system-pipe exhaust-pipe" />
      {signals.exhaustTemp.map((value, index) => {
        const x = 100 + index * 120
        return <g key={index} data-signal="exhaustTemp">
          <text x={x + 35} y="65" textAnchor="middle" className="system-value">{format(value)}°</text>
          <rect x={x + 26} y="77" width="18" height="45" rx="8" className="system-cylinder-shell" />
          <rect x={x + 30} y={118 - value / 600 * 37} width="10" height={value / 600 * 37} rx="4" fill="#f97316" />
          <rect x={x} y="145" width="70" height="90" rx="7" className="system-cylinder-shell" />
          <rect x={x + 10} y={165 + Math.sin(time / 1000 + index) * 8} width="50" height="20" rx="3" fill="#94a3b8" />
          <path d={`M ${x + 35} 185 V 225`} stroke="#64748b" strokeWidth="7" />
          <text x={x + 35} y="253" textAnchor="middle" className="system-caption">{text('cylinder')} {index + 1}</text>
        </g>
      })}
      <g data-signal="fuelRack"><rect x="900" y="150" width="12" height="130" rx="6" className="system-cylinder-shell" /><rect x="900" y={280 - signals.fuelRack * 1.3} width="12" height={signals.fuelRack * 1.3} rx="6" fill="#8b5cf6" />
        <text x="906" y="132" textAnchor="middle" className="system-value">{format(signals.fuelRack)}%</text><text x="980" y="305" textAnchor="end" className="system-caption">{text('fuelRack')}</text></g>
    </svg></div>

  </div>
}

export function VesselFuel({ time }: { time: number }) {
  const { t, locale } = useTranslationSafe()
  const [selectedHour, setSelectedHour] = useState<number | null>(null)
  const signals = signalsAt(time)
  const sampled = signalTimes(time)
  const fuelData = useMemo(() => fleetFuelDay(sampled.bridge), [sampled.bridge])
  const dailyStart = dayStart(time)
  const chartData = useMemo(() => Array.from({ length: 24 }, (_, hour) => {
    const timestamp = dailyStart + hour * 3600000
    return fuelData.hours.find(row => row.time === timestamp) || { time: timestamp, main: null, aux: null, total: null, complete: false }
  }), [dailyStart, fuelData])
  const format = (n: number, digits = 1) => n.toLocaleString(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits })
  const text = (key: string) => t(`engineSummary.signals.${key}`)
  const hourLabel = (value: number) => new Intl.DateTimeFormat(locale, { timeZone: VESSEL_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value)
  const hourReading = fuelData.hours.find(row => row.time === selectedHour)
  return <div className="engine-vessel-fuel">
    <svg viewBox="0 0 560 310" className="engine-fuel-flow" role="img" aria-label={text('fuelScope')}>
      <path d="M 170 50 H 245 V 115 M 170 115 H 345" className="system-pipe fuel-pipe" />
      {[{ key: 'fuelMain', label: t('engineSummary.main'), value: signals.fuelMain }, { key: 'fuelAux', label: t('engineSummary.aux'), value: signals.fuelAux }].map((row, i) => <g key={row.key} data-signal={row.key}><rect x="10" y={20 + i * 65} width="160" height="55" rx="6" className="system-cylinder-shell" /><text x="90" y={42 + i * 65} textAnchor="middle" className="system-caption">{row.label}</text><text x="90" y={63 + i * 65} textAnchor="middle" className="system-value">{format(row.value, 3)} t/h</text></g>)}
      <g data-signal="fuelTotal"><circle cx="420" cy="115" r="75" className="compass-ring" /><text x="420" y="98" textAnchor="middle" className="system-caption">{text('fuelTotal')}</text><text x="420" y="126" textAnchor="middle" className="fuel-total-value">{format(signals.fuelTotal, 3)}</text><text x="420" y="150" textAnchor="middle" className="system-caption">t/h</text></g>
      <g data-signal="fuelHourly"><text x="125" y="260" textAnchor="middle" className="system-caption">{text('fuelHourly')}</text><text x="125" y="287" textAnchor="middle" className="system-value">{format(signals.fuelHourly, 3)} t</text></g>
      <g data-signal="fuelDaily"><text x="410" y="260" textAnchor="middle" className="system-caption">{text('fuelDaily')}</text><text x="410" y="287" textAnchor="middle" className="system-value">{format(signals.fuelDaily, 3)} t</text></g>
    </svg>
    <h3>{text('fuel24h')} · t</h3>
        <div className="engine-fleet-chart"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ top: 12, right: 15, left: 4, bottom: 0 }} onClick={state => { const value = state?.activePayload?.[0]?.payload?.time; if (typeof value === 'number') setSelectedHour(value) }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="time" tickFormatter={hourLabel} minTickGap={28} tick={{ fontSize: 12 }} /><YAxis width={54} tick={{ fontSize: 12 }} tickFormatter={value => format(Number(value), 2)} />
          <Tooltip labelFormatter={value => `${hourLabel(Number(value))}${Number(value) >= sampled.bridge - sampled.bridge % 3600000 ? ` · ${text('inProgress')}` : ''}`} formatter={(value: number, name: string) => [`${format(value, 3)} t`, name]} contentStyle={{ background: 'var(--engine-surface)', color: 'var(--engine-text)', borderColor: 'var(--engine-border)' }} />
          <Legend iconType="circle" /><Bar name={t('engineSummary.main')} dataKey="main" stackId="fuel" fill="#3b82f6" isAnimationActive={false} /><Bar name={t('engineSummary.aux')} dataKey="aux" stackId="fuel" fill="#14b8a6" isAnimationActive={false} />
        </BarChart></ResponsiveContainer></div>
        {hourReading ? <p className="engine-hour-reading">{hourLabel(hourReading.time)} · {text('fuelTotalHour')} <strong>{format(hourReading.total, 3)} t</strong> · {text(hourReading.complete ? 'completeHour' : 'inProgress')}</p> : <p className="engine-chart-hint">{text('hourHint')}</p>}
        <p className="engine-chart-hint">{text('dayHint')}</p>
  </div>
}
