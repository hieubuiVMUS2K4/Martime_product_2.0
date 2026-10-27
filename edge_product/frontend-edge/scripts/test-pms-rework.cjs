const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
function load(file, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, require: name => imports[name] ?? require(name), console, setTimeout, clearTimeout, URLSearchParams, crypto: globalThis.crypto, Intl, Date }, { filename: file })
  return exports
}
const time = load('features/pms-rework/time.ts')
test('calendar ranges use vessel midnight rather than the browser timezone', () => {
  assert.equal(time.vesselMidnight('2026-10-26', 'Asia/Ho_Chi_Minh'), '2026-10-25T17:00:00.000Z')
  assert.equal(time.vesselDate('2026-10-25T18:00:00Z', 'Asia/Ho_Chi_Minh'), '2026-10-26')
  assert.equal(time.vesselDate('2026-10-26T02:00:00Z', 'America/New_York'), '2026-10-25')
})
test('calendar ranges respect 23-hour and 25-hour vessel days across DST', () => {
  const span = (from, to) => (Date.parse(time.vesselMidnight(to, 'America/New_York')) - Date.parse(time.vesselMidnight(from, 'America/New_York'))) / 3600000
  assert.equal(span('2026-03-08', '2026-03-09'), 23)
  assert.equal(span('2026-11-01', '2026-11-02'), 25)
})
test('Job baseline input round-trips in vessel time independent of device time', () => {
  const utc = time.vesselLocalToUtc('2026-10-26T09:30', 'Asia/Ho_Chi_Minh')
  assert.equal(utc, '2026-10-26T02:30:00.000Z')
  assert.equal(time.vesselInput(utc, 'Asia/Ho_Chi_Minh'), '2026-10-26T09:30')
})
test('column date filters cover the entire vessel day without UTC boundary loss', () => {
  const result = time.serverFilters({ dueFrom: '2026-10-26', dueTo: '2026-10-26', name: 'Pump', state: '' }, 'Asia/Ho_Chi_Minh')
  assert.equal(result.dueFrom, '2026-10-25T17:00:00.000Z'); assert.equal(result.dueTo, '2026-10-26T16:59:59.999Z')
  assert.equal(result.name, 'Pump'); assert.equal('state' in result, false)
})
test('new Work Order decisions require the common confirmation; execution never signs a review', () => {
  const { approvalTarget } = load('services/approval.ts', { '@/config/app.config': {} })
  assert.equal(approvalTarget('/pms/work-orders/id/approve', {}).action, 'approve')
  assert.equal(approvalTarget('/pms/work-orders/id/return', {}).action, 'reject')
  assert.equal(approvalTarget('/pms/work-orders/id/submit', {}), undefined)
  assert.equal(approvalTarget('/pms/work-orders/id/start', {}), undefined)
})
test('Job-only and legacy config access open Job List without granting Work Order access', () => {
  const permissions = load('stores/permissions.store.ts', { '@/services/api.client': {} })
  const modules = [{ code: 'pms.jobs', routes: ['/pms/jobs'], actions: ['view'] }, { code: 'pms.config', routes: [], actions: ['view'] }, { code: 'pms.work', routes: ['/pms/work-orders'], actions: ['view'] }]
  for (const code of ['pms.jobs', 'pms.config']) {
    permissions.usePermissionsStore.setState({ loaded: true, error: null, isAdmin: false, grants: [code + '.access'], modules })
    assert.equal(permissions.canOpen('/pms/work-planning'), true)
    assert.equal(permissions.canOpen('/pms/jobs/job-id'), true)
    assert.equal(permissions.canOpen('/pms/work-orders/order-id'), false)
  }
})
const XLSX = require('xlsx')
const imports = { '@/services/api.client': {}, './data': {}, './ui': {}, './departments': {} }
const { parseJobWorkbook } = load('features/pms-rework/ImportJobs.tsx', imports)
function book(row) { const b = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(b, XLSX.utils.json_to_sheet([row]), 'Maintenance'); return b }
const row = { ScheduleCode: 'PUMP-1', AssetCode: 'ASSET-1', ScheduleName: 'Pump check', MaintenanceCategory: 'PERIODIC', IntervalType: 'HYBRID', IntervalMonths: 3, IntervalHours: 100 }
test('Excel maps source definition columns to the new Job contract without enabling generation', async () => {
  const [parsed] = await parseJobWorkbook(book({ ...row, AutoGenerate: true }))
  assert.equal(parsed.code, 'PUMP-1'); assert.equal(parsed.intervalMonths, 3); assert.equal(parsed.intervalHours, 100)
  for (const key of ['baselineAt', 'lastExecutedAt', 'nextDueDate', 'autoGenerate', 'materials']) assert.equal(key in parsed, false)
})
test('Excel rejects execution dates and invalid numeric intervals before preview', async () => {
  await assert.rejects(() => parseJobWorkbook(book({ ...row, LastExecutedAt: '2026-01-01' })), /lịch sử/)
  await assert.rejects(() => parseJobWorkbook(book({ ...row, IntervalHours: 'abc' })), /số nguyên dương/)
})
test('read-only snapshot normalization preserves exact source strings and material units', () => {
  const { snapshot } = load('features/pms-rework/data.ts', { '@tanstack/react-query': {}, '@/services/api.client': {}, '@/stores/auth.store': {}, '@/stores/permissions.store': {} })
  const source = JSON.stringify({ Materials: [{ Unit: 'PCS', Quantity: 2 }], JobSnapshot: '{"Instructions":"Original"}' })
  const result = snapshot(source)
  assert.equal(result.materials[0].unit, 'PCS'); assert.equal(result.jobSnapshot, '{"Instructions":"Original"}')
  assert.equal(source, JSON.stringify({ Materials: [{ Unit: 'PCS', Quantity: 2 }], JobSnapshot: '{"Instructions":"Original"}' }))
})
