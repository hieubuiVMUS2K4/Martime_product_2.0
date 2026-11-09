export type EngineKind = 'main' | 'aux'
export type Period = 1 | 7 | 30
export interface Engine {
  id: string
  kind: EngineKind
  ratedPower: number
  maxRpm: number
  maxPressure: number
}
export const engines: Engine[] = [
  { id: 'ME1', kind: 'main', ratedPower: 6400, maxRpm: 120, maxPressure: 0 },
  { id: 'AE1', kind: 'aux', ratedPower: 800, maxRpm: 900, maxPressure: 0 },
]
// The standalone dashboard's vessel clock is UTC+07. Every value is reproducible from time.
export const VESSEL_ZONE = 'Asia/Ho_Chi_Minh'
const HOUR = 3600000
const DAY = 24 * HOUR
export function dayStart(time: number) {
  return Math.floor((time + 7 * HOUR) / DAY) * DAY - 7 * HOUR
}
export function rangeStart(time: number, days: Period) {
  return dayStart(time) - (days - 1) * DAY
}
export function vesselAt(time: number) {
  const phase = time / HOUR
  return {
    speed: 12.4 + Math.sin(phase / 3) * .8,
    heading: (68 + Math.sin(phase / 4) * 15 + 360) % 360,
    course: (70 + Math.sin(phase / 4) * 16 + 360) % 360,
    wind: 9 + Math.sin(phase) * 2,
    windDirection: (44 + Math.sin(phase / 2) * 20 + 360) % 360,
    current: 1.2 + Math.sin(phase / 2) * .3,
    currentDirection: 110 + Math.sin(phase) * 10,
    depth: 45 + Math.sin(phase / 3) * 8,
    roll: Math.sin(time / 9500) * 3,
    pitch: Math.sin(time / 13000) * 2,
  }
}
export function engineAt(engine: Engine, time: number) {
  const phase = time / HOUR
  const dayFraction = (time - dayStart(time)) / DAY
  const running = engine.kind === 'main' ? dayFraction > .04 && dayFraction < .97
    : Math.floor(phase / 8) % 3 !== 0
  const wave = Math.sin(phase * 1.8) * .05 + Math.sin(phase * 7.1) * .012
  const load = running ? .72 + wave : 0
  const power = engine.ratedPower * load
  const efficiency = engine.kind === 'main' ? 195 + (1 - load) * 12 : 210 + (1 - load) * 18
  const consumption = power * efficiency / 1000
  const supply = running ? consumption * 1.58 : 0
  const fuel = engine.kind === 'main' && dayFraction > .15 && dayFraction < .85 ? 'HFO' : 'MDO'
  return {
    time, running, load: load * 100, power,
    rpm: running ? engine.kind === 'main' ? 100 * Math.cbrt(load) : engine.kind === 'aux' ? 720 + wave * 8 : 0 : 0,
    pressure: 7.7 + Math.sin(phase * 2 - .8) * 1.1,
    consumption, supply, returnRate: supply - consumption,
    sfoc: power > 1 ? consumption * 1000 / power : null,
    hfo: fuel === 'HFO' ? consumption : 0,
    mdo: fuel === 'MDO' ? consumption : 0,
  }
}
export interface Totals {
  fuel: number
  hfo: number
  mdo: number
  distance: number
  runningMinutes: number
  energy: number
  pressureIntegral: number
  durationHours: number
}
function emptyTotals(): Totals {
  return { fuel: 0, hfo: 0, mdo: 0, distance: 0, runningMinutes: 0, energy: 0, pressureIntegral: 0, durationHours: 0 }
}
function add(a: Totals, b: Totals): Totals {
  return {
    fuel: a.fuel + b.fuel, hfo: a.hfo + b.hfo, mdo: a.mdo + b.mdo,
    distance: a.distance + b.distance, runningMinutes: a.runningMinutes + b.runningMinutes,
    energy: a.energy + b.energy, pressureIntegral: a.pressureIntegral + b.pressureIntegral,
    durationHours: a.durationHours + b.durationHours,
  }
}
// Integrate on a fixed minute lattice so refreshes and chart buckets agree exactly.
export function integrate(engine: Engine, from: number, to: number): Totals {
  let total = emptyTotals()
  for (let start = from; start < to;) {
    const minute = Math.floor(start / 60000) * 60000
    const end = Math.min(to, minute + 60000)
    const at = engineAt(engine, minute + 30000)
    const hours = (end - start) / HOUR
    total = add(total, {
      fuel: at.consumption * hours, hfo: at.hfo * hours, mdo: at.mdo * hours,
      distance: vesselAt(minute + 30000).speed * hours,
      runningMinutes: at.running ? hours * 60 : 0, energy: at.power * hours,
      pressureIntegral: at.pressure * hours, durationHours: hours,
    })
    start = end
  }
  return total
}
export interface TrendPoint { time: number; hfo: number; mdo: number; sfoc: number | null; pressure: number }
interface History { points: TrendPoint[]; totals: Totals }
const cache = new Map<string, History>()
function point(time: number, totals: Totals): TrendPoint {
  return { time, hfo: totals.hfo, mdo: totals.mdo,
    sfoc: totals.energy > 0 ? totals.fuel * 1000 / totals.energy : null,
    pressure: totals.durationHours > 0 ? totals.pressureIntegral / totals.durationHours : 0 }
}
export function windowData(engine: Engine, days: Period, time: number): History {
  const start = rangeStart(time, days)
  const step = (days === 1 ? .25 : days === 7 ? 1 : 6) * HOUR
  const completeUntil = Math.max(start, Math.floor((time - start) / step) * step + start)
  const key = `${engine.id}/${days}/${start}/${completeUntil}`
  let history = cache.get(key)
  if (!history) {
    const points: TrendPoint[] = []
    let totals = emptyTotals()
    for (let from = start; from < completeUntil; from += step) {
      const bucket = integrate(engine, from, from + step)
      totals = add(totals, bucket)
      points.push(point(from, bucket))
    }
    history = { points, totals }
    if (cache.size >= 18) cache.delete(cache.keys().next().value!)
    cache.set(key, history)
  }
  const live = integrate(engine, completeUntil, time)
  return { points: time > completeUntil ? [...history.points, point(completeUntil, live)] : history.points,
    totals: add(history.totals, live) }
}
export function kpis(totals: Totals) {
  // Configured presentation factor, deliberately separate from the equipment calculations.
  const co2 = totals.fuel * 3.1
  return { fuel: totals.fuel, distance: totals.distance, co2,
    fuelPerMile: totals.distance > 0 ? totals.fuel / totals.distance : null,
    co2PerMile: totals.distance > 0 ? co2 / totals.distance : null }
}

export const SIGNAL_KEYS = [
  'rudder', 'propRpm', 'lat', 'lon', 'windSpeed', 'windDir', 'compass', 'speedLog', 'roll', 'depth',
  'cog', 'sog', 'rot', 'currentSpeed', 'currentDir', 'fuelTotal', 'fuelMain', 'fuelAux', 'fuelHourly',
  'fuelDaily', 'coolTemp', 'luboPress', 'luboTemp', 'exhaustTemp', 'mainRpm', 'startAirPress', 'fuelRack',
] as const
export const SIGNAL_INTERVALS = { electric: 1000, engine: 3000, bridge: 5000 } as const
export function signalTimes(time: number) {
  return {
    electric: Math.floor(time / SIGNAL_INTERVALS.electric) * SIGNAL_INTERVALS.electric,
    engine: Math.floor(time / SIGNAL_INTERVALS.engine) * SIGNAL_INTERVALS.engine,
    bridge: Math.floor(time / SIGNAL_INTERVALS.bridge) * SIGNAL_INTERVALS.bridge,
  }
}
export interface FuelHour { time: number; main: number; aux: number; total: number; complete: boolean }
const fuelDayCache = new Map<number, FuelHour[]>()
export function fleetFuelDay(time: number) {
  const start = dayStart(time)
  const cutoff = Math.floor(time / HOUR) * HOUR
  let completed = fuelDayCache.get(cutoff)
  if (!completed) {
    completed = []
    for (let hour = start; hour < cutoff; hour += HOUR) completed.push(fuelHour(hour, hour + HOUR, true))
    if (fuelDayCache.size >= 4) fuelDayCache.delete(fuelDayCache.keys().next().value!)
    fuelDayCache.set(cutoff, completed)
  }
  const current = fuelHour(cutoff, time, false)
  const hours = [...completed, current]
  return { hours, total: hours.reduce((sum, hour) => sum + hour.total, 0), currentHour: current.total }
}
function fuelHour(from: number, to: number, complete: boolean): FuelHour {
  const main = integrate(engines[0], from, to).fuel / 1000
  const aux = integrate(engines[1], from, to).fuel / 1000
  return { time: from, main, aux, total: main + aux, complete }
}
export function signalsAt(time: number) {
  const times = signalTimes(time)
  const vessel = vesselAt(times.engine)
  const electric = engineAt(engines[0], times.electric)
  const engine = engineAt(engines[0], times.engine)
  const main = engineAt(engines[0], times.bridge)
  const aux = engineAt(engines[1], times.bridge)
  const phase = times.engine / HOUR
  const fuel = fleetFuelDay(times.bridge)
  return {
    rudder: Math.sin(times.electric / 18000) * 8,
    // Direct-drive demonstration: separate shaft and engine channels share a 1:1 ratio.
    propRpm: electric.rpm,
    mainRpm: electric.rpm,
    lat: 10.15 + Math.sin(phase / 4) * .12,
    lon: 107.45 + Math.cos(phase / 4) * .12,
    windSpeed: vessel.wind, windDir: vessel.windDirection, compass: vessel.heading,
    speedLog: vessel.speed - .25 + Math.sin(phase / 5) * .1,
    roll: vessel.roll, depth: vessel.depth, cog: vessel.course, sog: vessel.speed,
    rot: 15 * Math.cos(times.electric / HOUR / 4) / 240,
    currentSpeed: vessel.current, currentDir: vessel.currentDirection,
    fuelTotal: (main.consumption + aux.consumption) / 1000,
    fuelMain: main.consumption / 1000, fuelAux: aux.consumption / 1000,
    fuelHourly: fuel.currentHour, fuelDaily: fuel.total,
    coolTemp: main.running ? 79 + main.load * .06 + Math.sin(times.bridge / HOUR) : 35,
    luboPress: electric.running ? 4.6 + electric.load * .005 + Math.sin(times.electric / 15000) * .08 : 0,
    luboTemp: main.running ? 51 + main.load * .08 : 29,
    // Six independently identified cylinders, kept in sequence for future channel mapping.
    exhaustTemp: Array.from({ length: 6 }, (_, i) => engine.running ? 280 + engine.load * 1.15 + Math.sin(phase * 3 + i) * 9 : 36 + i),
    startAirPress: 27 + Math.sin(phase / 2) * 1.5,
    fuelRack: electric.load,
  }
}

// Distance is a vessel measure and must only be counted once when summing engines.
export function fleetTotals(period: Period, time: number): Totals {
  const totals = engines.map(engine => windowData(engine, period, time).totals)
  return { ...totals[0],
    fuel: totals.reduce((sum, row) => sum + row.fuel, 0),
    hfo: totals.reduce((sum, row) => sum + row.hfo, 0),
    mdo: totals.reduce((sum, row) => sum + row.mdo, 0),
  }
}
