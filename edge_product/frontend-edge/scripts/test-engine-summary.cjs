const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const root = path.join(__dirname, '..')
const code = ts.transpileModule(fs.readFileSync(path.join(root, 'src/pages/Dashboard/engine-summary/model.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
function loadModel() {
  const exports = {}
  vm.runInNewContext(code, { exports })
  return exports
}
const model = loadModel()
const now = Date.parse('2026-11-09T07:32:00Z')
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} != ${b}`)

test('dashboard uses the main engine while vessel fuel includes the auxiliary signal', () => {
  assert.equal(model.engines.map(e => e.kind).join(','), 'main,aux')
  const page = fs.readFileSync(path.join(root, 'src/pages/Dashboard/EngineSummaryPage.tsx'), 'utf8')
  assert.ok(page.includes('const engine = engines[0]'))
  assert.ok(!page.includes('view.engineId'))
  assert.ok(!page.includes('engines.map((item'))
})

test('fuel, SFOC, load and power are consistent over 30 days', () => {
  for (const engine of model.engines) {
    for (let i = 0; i < 720; i++) {
      const at = model.engineAt(engine, now - i * 3600000)
      close(at.supply - at.returnRate, at.consumption)
      close(at.hfo + at.mdo, at.consumption)
      close(at.power, engine.ratedPower * at.load / 100)
      if (at.sfoc !== null) close(at.sfoc, at.consumption * 1000 / at.power)
      assert.ok(at.consumption >= 0)
      if (!at.running) { assert.equal(at.rpm, 0); assert.equal(at.power, 0); assert.equal(at.consumption, 0) }
    }
  }
})
test('calendar windows roll over at vessel midnight, not browser midnight', () => {
  assert.equal(model.dayStart(Date.parse('2026-11-09T16:59:59Z')), Date.parse('2026-11-08T17:00:00Z'))
  assert.equal(model.dayStart(Date.parse('2026-11-09T17:00:00Z')), Date.parse('2026-11-09T17:00:00Z'))
  assert.equal(model.rangeStart(now, 7), Date.parse('2026-11-02T17:00:00Z'))
  assert.equal(model.windowData(model.engines[0], 1, model.dayStart(now)).totals.fuel, 0)
})
test('chart buckets sum to KPI totals with bounded point counts', () => {
  for (const days of [1, 7, 30]) {
    const history = model.windowData(model.engines[0], days, now)
    assert.ok(history.points.length > 0 && history.points.length <= 240)
    close(history.points.reduce((sum, p) => sum + p.hfo + p.mdo, 0), history.totals.fuel)
    close(history.totals.fuel, model.integrate(model.engines[0], model.rangeStart(now, days), now).fuel)
  }
})
test('integrating a split minute preserves totals across refresh and pause', () => {
  const engine = model.engines[0], start = now - 4321000, split = now - 3217
  const first = model.integrate(engine, start, split), last = model.integrate(engine, split, now)
  close(first.fuel + last.fuel, model.integrate(engine, start, now).fuel)
  assert.ok(model.windowData(engine, 1, now + 3000).totals.fuel >= model.windowData(engine, 1, now).totals.fuel)
})
test('reloads and engine changes cannot reset a day or corrupt the cached window', () => {
  const before = model.windowData(model.engines[0], 1, now)
  model.windowData(model.engines[1], 7, now + 3000)
  close(model.windowData(model.engines[0], 1, now).totals.fuel, before.totals.fuel)
  const fresh = loadModel()
  close(fresh.windowData(fresh.engines[0], 1, now).totals.fuel, before.totals.fuel)
})
test('KPI conversions and zero distance are handled', () => {
  const value = model.kpis({ fuel: 10800, distance: 210 })
  close(value.co2, 33480)
  close(value.fuelPerMile, 10800 / 210)
  assert.equal(model.kpis({ fuel: 0, distance: 0 }).fuelPerMile, null)
  assert.equal(model.kpis({ fuel: 0, distance: 0 }).co2PerMile, null)
})
test('engine dashboard has a separate read permission in the shared module catalog', () => {
  const registry = JSON.parse(fs.readFileSync(path.join(root, '../edge-services/permissions.registry.json'), 'utf8'))
  const definition = registry.modules.find(m => m.code === 'dashboard.engine-summary')
  assert.deepEqual(definition.actions, ['view'])
  assert.deepEqual(definition.routes, ['/engine-summary'])
})
test('VI and EN have complete matching labels, without a simulated-data banner', () => {
  const vi = JSON.parse(fs.readFileSync(path.join(root, 'src/locales/vi.json'), 'utf8')).engineSummary
  const en = JSON.parse(fs.readFileSync(path.join(root, 'src/locales/en.json'), 'utf8')).engineSummary
  assert.deepEqual(Object.keys(vi).sort(), Object.keys(en).sort())
  const page = fs.readFileSync(path.join(root, 'src/pages/Dashboard/EngineSummaryPage.tsx'), 'utf8')
  assert.ok(!page.includes('Dữ liệu mô phỏng'))
})

test('direct navigation requires the saved dashboard grant, including for Admin', () => {
  const source = ts.transpileModule(fs.readFileSync(path.join(root, 'src/stores/permissions.store.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  vm.runInNewContext(source, { exports, require: name => name === '@/services/api.client' ? { apiClient: {} } : require(name) })
  const module = { code: 'dashboard.engine-summary', actions: ['view'], routes: ['/engine-summary'] }
  for (const isAdmin of [false, true]) {
    exports.usePermissionsStore.setState({ loaded: true, isAdmin, error: null, modules: [module], grants: ['dashboard.access'] })
    assert.equal(exports.canOpen('/engine-summary'), false)
    exports.usePermissionsStore.setState({ grants: ['dashboard.access', 'dashboard.engine-summary.access'] })
    assert.equal(exports.canOpen('/engine-summary'), true)
    exports.usePermissionsStore.setState({ error: 'offline' })
    assert.equal(exports.canOpen('/engine-summary'), false)
  }
})

test('continuous fifteen-minute updates stay deterministic and bounded', () => {
  for (let tick = 0; tick <= 300; tick++) {
    const time = now + tick * 3000
    for (const engine of model.engines) {
      const data = model.windowData(engine, 1, time)
      assert.ok(data.points.length <= 96)
      assert.ok(data.totals.runningMinutes <= (time - model.dayStart(time)) / 60000 + 1e-6)
    }
  }
})

test('all 27 spreadsheet signal keys have finite readings and separate RPM channels', () => {
  const signals = model.signalsAt(now)
  assert.equal(model.SIGNAL_KEYS.length, 27)
  assert.equal(Object.keys(signals).length, 27)
  for (const key of model.SIGNAL_KEYS) {
    const readings = Array.isArray(signals[key]) ? signals[key] : [signals[key]]
    assert.ok(readings.every(Number.isFinite), key)
  }
  assert.equal(signals.exhaustTemp.length, 6)
  assert.ok(Object.hasOwn(signals, 'mainRpm') && Object.hasOwn(signals, 'propRpm'))
  close(signals.mainRpm, signals.propRpm) // Configured direct-drive ratio is 1:1.
})

test('live instruments refresh every 1.5 seconds with visible changes within twelve seconds', () => {
  const start = Math.floor(now / 1500) * 1500
  const first = model.signalsAt(start), second = model.signalsAt(start + 1500)
  assert.deepEqual(model.signalTimes(start + 1499), model.signalTimes(start))
  assert.notEqual(first.rudder, second.rudder)
  assert.notEqual(first.lat, second.lat)
  assert.notEqual(first.coolTemp, second.coolTemp)
  assert.notEqual(first.fuelDaily, second.fuelDaily)
  const samples = Array.from({ length: 9 }, (_, i) => model.signalsAt(start + i * 1500))
  for (const key of ['propRpm', 'mainRpm', 'coolTemp', 'luboPress', 'luboTemp', 'startAirPress',
    'windSpeed', 'windDir', 'compass', 'depth', 'currentSpeed', 'currentDir', 'sog']) {
    assert.ok(new Set(samples.map(sample => sample[key].toFixed(1))).size > 1, `${key} appears frozen`)
  }
})

test('vessel fuel rate includes main and auxiliary signals with tonnes conversion', () => {
  const values = model.signalsAt(now)
  const sample = model.signalTimes(now).bridge
  close(values.fuelTotal, values.fuelMain + values.fuelAux)
  close(values.fuelMain * 1000, model.engineAt(model.engines[0], sample).consumption)
})

test('hourly vessel consumption reconciles with all equipment and rolls over at midnight', () => {
  const values = model.fleetFuelDay(now)
  const expected = model.engines.reduce((sum, engine) => sum + model.windowData(engine, 1, now).totals.fuel / 1000, 0)
  close(values.total, expected)
  close(values.total, values.hours.reduce((sum, hour) => sum + hour.total, 0))
  assert.equal(values.hours.filter(h => !h.complete).length, 1)
  for (const hour of values.hours) close(hour.total, hour.main + hour.aux)
  const midnight = model.dayStart(now) + 86400000
  assert.equal(model.fleetFuelDay(midnight).total, 0)
  assert.equal(model.fleetFuelDay(midnight).hours.length, 1)
})

test('every spreadsheet signal has a translated display and 24 hour view leaves future values empty', () => {
  for (const lang of ['vi', 'en']) {
    const labels = JSON.parse(fs.readFileSync(path.join(root, `src/locales/${lang}.json`), 'utf8')).engineSummary.signals
    for (const key of model.SIGNAL_KEYS) assert.ok(labels[key], `${lang}/${key}`)
  }
  const source = fs.readFileSync(path.join(root, 'src/pages/Dashboard/engine-summary/OperationalSignals.tsx'), 'utf8')
  const instruments = fs.readFileSync(path.join(root, 'src/pages/Dashboard/engine-summary/Instruments.tsx'), 'utf8')
  const page = fs.readFileSync(path.join(root, 'src/pages/Dashboard/EngineSummaryPage.tsx'), 'utf8')
  for (const key of model.SIGNAL_KEYS) assert.ok((source + instruments + page).includes(key), key)
  assert.ok(!source.includes('engine-signal-cards'))
  assert.ok(source.includes('length: 24'))
  assert.ok(source.includes('total: null'))
})


test('whole vessel KPI sums fuel while counting vessel distance once', () => {
  for (const period of [1, 7, 30]) {
    const total = model.fleetTotals(period, now)
    const parts = model.engines.map(engine => model.windowData(engine, period, now).totals)
    close(total.fuel, parts.reduce((sum, row) => sum + row.fuel, 0))
    close(total.distance, parts[0].distance)
    close(total.hfo + total.mdo, total.fuel)
  }
})


test('main-engine condition belongs to the main tab and removed dashboard controls stay absent', () => {
  const page = fs.readFileSync(path.join(root, 'src/pages/Dashboard/EngineSummaryPage.tsx'), 'utf8')
  assert.ok(page.includes('className="engine-detail-grid has-main-engine"'))
  assert.ok(!page.includes('engine-toolbar'))
  assert.ok(!page.includes('engine-dual-view'))
  assert.ok(!page.includes('setPaused'))
  const diagram = fs.readFileSync(path.join(root, 'src/pages/Dashboard/engine-summary/OperationalSignals.tsx'), 'utf8')
  assert.ok(diagram.includes('<strong>{format(gauge.value)}'))
  assert.ok(!diagram.includes('engine-pipe-legend'))
})
