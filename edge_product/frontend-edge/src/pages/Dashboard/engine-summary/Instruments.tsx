import { useId } from 'react'
import { useTranslationSafe } from '@/contexts/I18nContext'
import { signalTimes, signalsAt, vesselAt } from './model'

function position(angle: number, radius: number) {
  const radians = angle * Math.PI / 180
  return [160 + Math.sin(radians) * radius, 151 - Math.cos(radians) * radius]
}
export function Gauge({ value, maximum, unit, label, small = false, format }: {
  value: number | null; maximum: number; unit: string; label: string; small?: boolean; format: (n: number) => string
}) {
  const angle = -120 + Math.min(1, Math.max(0, (value || 0) / maximum)) * 240
  const arc = (from: number, to: number) => {
    const a = position(from, 130), b = position(to, 130)
    return `M ${a[0]} ${a[1]} A 130 130 0 ${to - from > 180 ? 1 : 0} 1 ${b[0]} ${b[1]}`
  }
  return <svg viewBox={small ? '0 0 320 280' : '0 0 320 254'} className={`engine-gauge ${small ? 'engine-gauge-small' : ''}`} role="img" aria-label={`${label} ${value === null ? '—' : format(value)} ${unit}`}>
    <path d={arc(-120, 120)} className="gauge-rim" />
    <path d={arc(88, 120)} className="gauge-warning" />
    {Array.from({ length: 31 }, (_, i) => {
      const a = -120 + i * 8, start = position(a, i % 5 === 0 ? 112 : 119), end = position(a, 125)
      const text = position(a, 97)
      return <g key={i}><line x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]} className="gauge-tick" />
        {i % 5 === 0 && <text x={text[0]} y={text[1]} dy="4" textAnchor="middle" className="gauge-number">{Math.round(maximum * i / 30)}</text>}</g>
    })}
    <g className="gauge-needle" style={{ transform: `rotate(${angle}deg)`, transformOrigin: '160px 151px' }}>
      <path d="M 156 153 L 160 48 L 164 153 Z" />
    </g>
    <circle cx="160" cy="151" r="7" className="gauge-hub" />
    <text x="160" y={small ? 228 : 187} textAnchor="middle" className="gauge-caption">{label}</text>
    <text x="160" y={small ? 257 : 215} textAnchor="middle" className="gauge-value">{value === null ? '—' : format(value)} <tspan className="gauge-unit">{unit}</tspan></text>
  </svg>
}

export function Compass({ time, format }: { time: number; format: (n: number) => string }) {
  const { t } = useTranslationSafe()
  const data = vesselAt(signalTimes(time).engine)
  const signals = signalsAt(time)
  const clip = useId().replace(/:/g, '')
  const text = (key: string) => t(`engineSummary.${key}`)
  return <div className="engine-compass">
    <div className="compass-corners" data-signal="depth windSpeed windDir currentSpeed currentDir"><div><span>{text('depth')}</span><strong>{format(data.depth)} m</strong></div><div><span>{text('current')}</span><strong>{format(data.current)} kn</strong><small>{format(data.currentDirection)}°</small></div></div>
    <svg viewBox="0 0 360 340" role="img" aria-label={`${text('heading')} ${format(data.heading)}°`}>
      <defs><clipPath id={clip}><circle cx="180" cy="170" r="75" /></clipPath></defs>
      <circle cx="180" cy="170" r="132" className="compass-ring" />
      <circle cx="180" cy="170" r="127" className="compass-inner-ring" />
      <g style={{ transform: `rotate(${-data.heading}deg)`, transformOrigin: '180px 170px' }}>
        {Array.from({ length: 36 }, (_, index) => <line key={index} x1="180" y1="39" x2="180" y2={index % 9 === 0 ? 52 : 46} transform={`rotate(${index * 10} 180 170)`} className="gauge-tick" />)}
        {['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].map((label, i) => <text key={label} x={180 + Math.sin(i * Math.PI / 4) * 111} y={175 - Math.cos(i * Math.PI / 4) * 111} textAnchor="middle" className={i === 0 ? 'compass-north' : 'compass-direction'}>{label}</text>)}
      </g>
      <circle cx="180" cy="170" r="80" className="compass-bezel" />
      <g clipPath={`url(#${clip})`}>
        <g style={{ transform: `rotate(${-data.roll}deg) translateY(${data.pitch * 2}px)`, transformOrigin: '180px 170px' }}>
          <rect x="60" y="40" width="240" height="130" fill="#88cde1" />
          <rect x="60" y="170" width="240" height="130" fill="#3f5146" />
          <line x1="60" y1="170" x2="300" y2="170" stroke="#fff" strokeWidth="2" />
          {[-30, -20, -10, 10, 20, 30].map(value => <g key={value}><line x1={180 - Math.abs(value) / 2} y1={170 - value * 1.6} x2={180 + Math.abs(value) / 2} y2={170 - value * 1.6} stroke={value > 0 ? '#285266' : '#fff'} /><text x="151" y={174 - value * 1.6} fontSize="8" fill={value > 0 ? '#285266' : '#fff'}>{Math.abs(value)}</text></g>)}
        </g>
      </g>
      <path d="M 145 170 H 170 L 180 179 L 190 170 H 215" fill="none" stroke="#e2b746" strokeWidth="3" />
      <g transform={`rotate(${data.windDirection - data.heading} 180 170)`}><path d="M 180 35 L 173 50 L 187 50 Z" fill="#eab308" /></g>
      <g transform={`rotate(${data.currentDirection - data.heading} 180 170)`}><path d="M 180 35 L 175 47 L 185 47 Z" fill="#a855f7" /></g>
      <path d="M 180 34 L 175 24 L 185 24 Z" fill="#ef4444" />
      <path d="M 180 306 L 175 316 L 185 316 Z" fill="#22c55e" />
      <text x="180" y="16" textAnchor="middle" className="compass-label">{text('bow')}</text>
      <text x="180" y="335" textAnchor="middle" className="compass-label">{text('aft')}</text>
      <text x="4" y="175" className="compass-side">{text('port')}</text>
      <text x="356" y="175" textAnchor="end" className="compass-side">{text('starboard')}</text>
    </svg>
    <div className="compass-corners compass-bottom" data-signal="sog cog"><div><span>{text('wind')}</span><strong>{format(data.wind)} kn</strong><small>{format(data.windDirection)}°</small></div><div><span>{text('gps')}</span><strong>{format(data.speed)} kn</strong><small>{format(data.course)}°</small></div></div>
    <div className="engine-helm" data-signal="rudder rot roll speedLog">
      <svg viewBox="0 0 360 135" role="img" aria-label={`${t('engineSummary.signals.rudder')} ${format(signals.rudder)}°`}>
        <path d="M 60 100 Q 180 0 300 100" className="compass-ring" />
        {[-35, 0, 35].map((value, i) => <text key={value} x={60 + i * 120} y={i === 1 ? 43 : 117} textAnchor="middle" className="system-caption">{value}°</text>)}
        <g transform={`rotate(${signals.rudder} 180 105)`}><path d="M 180 105 V 55" stroke="#3b82f6" strokeWidth="4" /><circle cx="180" cy="105" r="5" fill="#3b82f6" /></g>
        <text x="180" y="130" textAnchor="middle" className="system-value">{t('engineSummary.signals.rudder')} {format(signals.rudder)}°</text>
      </svg>
      <dl className="engine-metrics"><div><dt>{t('engineSummary.signals.rot')}</dt><dd>{signals.rot.toFixed(3)} °/min</dd></div><div><dt>{t('engineSummary.signals.roll')}</dt><dd>{format(signals.roll)}°</dd></div><div><dt>{t('engineSummary.signals.speedLog')}</dt><dd>{format(signals.speedLog)} kn</dd></div></dl>
    </div>
    <div className="engine-coordinates" data-signal="lat lon"><span>{t('engineSummary.signals.lat')} {signals.lat.toFixed(5)}° N</span><span>{t('engineSummary.signals.lon')} {signals.lon.toFixed(5)}° E</span></div>
    <p className="engine-heading" data-signal="compass">{text('heading')} <strong>{format(data.heading)}°</strong></p>
  </div>
}
