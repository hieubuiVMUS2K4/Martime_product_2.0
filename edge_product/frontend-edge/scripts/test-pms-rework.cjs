const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')
function load(file, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, require: name => imports[name] ?? (name === './time' ? time : require(name)), console, setTimeout, clearTimeout, URLSearchParams, crypto: globalThis.crypto, Intl, Date, Blob }, { filename: file })
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
const { parseJobWorkbook, jobImportPayload } = load('features/pms-rework/planWorkbook.ts', imports)
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

test('optional calendar baseline accepts Excel dates and vessel-local text without treating them as execution', async () => {
  const headers = [...planHeaders, 'Mốc bắt đầu (giờ tàu)']
  const source = value => planBook([['Máy', [headers, [1, 'BASE', '', 'P1', '', 'Inspect', 'Định kỳ', 'M3', '', '', '', value]]]])
  for (const value of ['31/01/2026 09:30', '2026-01-31 09:30', 46053 + 9.5/24]) {
    const [r] = await parseJobWorkbook(source(value), [], 'Asia/Ho_Chi_Minh')
    assert.equal(r.baselineAt, '2026-01-31T02:30:00.000Z'); assert.equal(r.issues, undefined)
    assert.equal(jobImportPayload([r])[0].baselineAt, r.baselineAt)
    assert.equal('lastExecutedAt' in r, false)
  }
  const [blank] = await parseJobWorkbook(source('')); assert.equal(blank.baselineAt, undefined); assert.equal(blank.issues, undefined)
  const [bad] = await parseJobWorkbook(source('31/02/2026'), [], 'Asia/Ho_Chi_Minh'); assert.ok(bad.issues.length)
  const alternateEpoch = source(46053 - 1462); alternateEpoch.Workbook = { WBProps: { date1904: true } }
  const [oldEpoch] = await parseJobWorkbook(alternateEpoch, [], 'Asia/Ho_Chi_Minh'); assert.equal(oldEpoch.baselineAt, '2026-01-30T17:00:00.000Z')
  const [noZone] = await parseJobWorkbook(source('01/02/2026')); assert.ok(noZone.issues.some(s => s.includes('múi giờ')))
  for (const [category, cycle] of [['Định kỳ','H100'],['Lên đà',''],['Theo chuyến',''],['Theo yêu cầu','']]) {
    const [r] = await parseJobWorkbook(planBook([['Máy',[headers,[1,'X','','P1','','Inspect',category,cycle,'','','','01/02/2026']]]]), [], 'Asia/Ho_Chi_Minh')
    assert.equal(r.baselineAt, undefined); assert.ok(r.issues.some(s => s.includes('Mốc bắt đầu')))
  }
  const [hybrid] = await parseJobWorkbook(planBook([['Máy',[headers,[1,'H','','P1','','Inspect','Định kỳ','M3/H100','','','','01/02/2026']]]]), [], 'Asia/Ho_Chi_Minh')
  assert.equal(hybrid.baselineAt, '2026-01-31T17:00:00.000Z'); assert.equal(hybrid.intervalType,'HYBRID')
})

function planBook(sheets) {
  const b = XLSX.utils.book_new()
  for (const [name, rows] of sheets) XLSX.utils.book_append_sheet(b, XLSX.utils.aoa_to_sheet(rows), name)
  return b
}
const planHeaders = ['STT', 'Mã công việc', 'Mã nguồn', 'Mã thiết bị', 'Tên thiết bị', 'Nội dung bảo dưỡng', 'Loại bảo trì', 'Chu kỳ', 'Ưu tiên', 'Hướng dẫn', 'Ghi chú']
test('BQBD Job template reads both departments, title/group rows and all four categories', async () => {
  const sheets = [['Máy', [['DANH MỤC CÔNG VIỆC BẢO DƯỠNG'], [], planHeaders,
    ['', '', '', '', 'I. THIẾT BỊ MÁY'],
    [1, 'M-1', 'A001', 'ASSET-1', '', 'Overhaul', 'Định kỳ', 'M3/H1000', 'Cao', 'Isolate', 'Record pressure'],
    [2, 'M-2', '', 'ASSET-2', '', 'Repair when required', 'Theo yêu cầu', '', 'Trung bình'],
    ['Người lập danh mục: ................................']]],
  ['Boong', [planHeaders, [1, 'D-1', '1.1', 'ASSET-3', '', 'Dry dock repair', 'Lên đà', '', 'Cao'],
    [2, 'D-2', '', 'ASSET-4', '', 'Voyage inspection', 'Theo chuyến', '', 'Thấp']]]]
  const rows = await parseJobWorkbook(planBook(sheets))
  assert.equal(rows.length, 4)
  assert.deepEqual(Array.from(rows, r => r.category), ['PERIODIC', 'ON_DEMAND', 'DRY_DOCK', 'VOYAGE'])
  assert.deepEqual(Array.from(rows, r => r.department), ['ENGINE', 'ENGINE', 'DECK', 'DECK'])
  assert.equal(rows[0].intervalType, 'HYBRID'); assert.equal(rows[0].intervalMonths, 3); assert.equal(rows[0].intervalHours, 1000)
  assert.equal(rows[0].instructions, 'Isolate\nRecord pressure'); assert.equal(rows[0].workCode, 'A001')
  assert.equal(rows[1].issues, undefined); assert.equal(new Set(rows.map(r => r.rowNumber)).size, 4)
})
test('original BIENDONG plan keeps work codes distinct from equipment and never imports actual dates', async () => {
  const equipment = [{ id: 'one', assetCode: 'PUMP-1', assetName: 'Fire pump', isActive: true, category: 'PUMP', status: 'STANDBY' }]
  const rows = await parseJobWorkbook(planBook([['May BD.star 2026', [['maintenance plan for machinery and equipment'], [],
    ['Code', 'Equipment Name', 'Maintenance Description', 'Freq.', 'Last Time', 'Plan', 'Carry Out Date'],
    ['Mã', 'Tên thiết bị', 'Nội dung', 'Chu kỳ', 'Lần trước', 'Kế hoạch', 'Jan.'],
    ['A', 'Main machinery'], ['A001', 'Fire pump', 'Inspect', 'M 03', 45997, 'X', 46000],
    ['A001', 'Fire pump', 'Overhaul', 'As request', 45998, '', 'X'], ['', 'CHIEF ENGINEER', '', 'CAPTAIN']]]]), equipment)
  assert.equal(rows.length, 2); assert.equal(rows[0].assetCode, 'PUMP-1'); assert.equal(rows[0].workCode, 'A001')
  assert.notEqual(rows[0].code, rows[1].code); assert.equal(rows[0].intervalMonths, 3)
  assert.equal(rows[0].instructions, 'Inspect')
  assert.equal(rows[1].category, 'ON_DEMAND')
  for (const r of rows) for (const name of ['lastExecutedAt', 'baselineAt', 'nextDueDate', 'monthlyMarks', 'autoGenerate']) assert.equal(name in r, false)
})
test('original plan refuses ambiguous equipment names and interval ranges without guessing', async () => {
  const book = planBook([['May 2026', [['Code', 'Equipment Name', 'Maintenance Description', 'Freq.'], [], ['A1', 'Pump', 'Overhaul', 'H8000-12000']]]])
  const equipment = ['P1', 'P2'].map(assetCode => ({ id: assetCode, assetCode, assetName: 'Pump', isActive: true, category: 'PUMP', status: 'STANDBY' }))
  const [r] = await parseJobWorkbook(book, equipment)
  assert.equal(r.assetCode, ''); assert.equal(r.intervalHours, undefined)
  assert.ok(r.issues.some(e => e.includes('bị trùng'))); assert.ok(r.issues.some(e => e.includes('cận dưới')))
})
test('legacy TCVN3 and modern Unicode categories are both readable', async () => {
  const { planText } = load('features/pms-rework/planWorkbook.ts')
  assert.equal(planText('3 th¸ng'), '3 tháng'); assert.equal(planText('Theo yêu cầu'), 'Theo yêu cầu')
  const rows = await parseJobWorkbook(planBook([['BOONG BD STAR 2026', [['Code', 'Equipment Name', 'Maintenance Description', 'Freq.'], [], ['1', 'Tời neo', 'Kiểm tra', 'chuyÕn']]]]))
  assert.equal(rows[0].category, 'VOYAGE')
})
test('preview metadata and errors are never sent as unknown import fields', async () => {
  const { jobImportPayload } = load('features/pms-rework/planWorkbook.ts')
  const [r] = await parseJobWorkbook(book(row))
  const [payload] = jobImportPayload([r])
  assert.equal(payload.code, row.ScheduleCode)
  for (const key of ['sourceSheet', 'sourceRow', 'assetName', 'sourceFrequency', 'issues']) assert.equal(key in payload, false)
})

test('source equipment groups disambiguate matching names without choosing an arbitrary asset', async () => {
  const equipment = [
    { id: 'g1', assetCode: 'G1', assetName: 'Main Engine', isActive: true, category: 'SYSTEM' },
    { id: 'g2', assetCode: 'G2', assetName: 'Generator', isActive: true, category: 'SYSTEM' },
    { id: 'p1', parentId: 'g1', assetCode: 'P1', assetName: 'Pump', isActive: true, category: 'PUMP' },
    { id: 'p2', parentId: 'g2', assetCode: 'P2', assetName: 'Pump', isActive: true, category: 'PUMP' },
  ]
  const [r] = await parseJobWorkbook(planBook([['May 2026', [['Code', 'Equipment Name', 'Maintenance Description', 'Freq.'], [],
    ['A', 'Main Engine'], ['A1', 'Pump', 'Inspect', 'M3']]]]), equipment)
  assert.equal(r.assetCode, 'P1'); assert.equal(r.issues, undefined)
  const [wrong] = await parseJobWorkbook(planBook([['Máy', [planHeaders, [1, 'JOB1', '', 'P1', 'Other pump', 'Inspect', 'Định kỳ', 'M3']]]]), equipment)
  assert.ok(wrong.issues.some(e => e.includes('không khớp')))
})

test('downloaded BQBD workbook contains current equipment, eligible dropdowns and a guide without importing helper sheets', async () => {
  const { fillJobTemplate } = load('features/pms-rework/jobTemplate.ts')
  const ExcelJS = require('exceljs')
  const bytes = fs.readFileSync(path.join(__dirname, '../public/templates/Mau_Job_BQBD.xlsx'))
  const equipment = [
    { id: 'g', assetCode: 'GR-01', assetName: 'Main Engine', category: 'SYSTEM', isActive: true, status: 'STANDBY' },
    { id: 'a', parentId: 'g', assetCode: 'PUMP-01', assetName: 'Sea water pump', category: 'PUMP', isActive: true, status: 'STANDBY' },
    { id: 'i', assetCode: 'OLD-01', assetName: 'Old pump', category: 'PUMP', isActive: false, status: 'STANDBY' },
    { id: 'r', assetCode: 'RET-01', assetName: 'Retired pump', category: 'PUMP', isActive: true, status: 'DECOMMISSIONED' },
  ]
  const blob = await fillJobTemplate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), equipment)
  const file = await blob.arrayBuffer(), workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(file)
  assert.deepEqual(workbook.worksheets.map(s => s.name), ['Máy', 'Boong', 'Danh_muc_thiet_bi', 'Huong_dan'])
  const catalog = workbook.getWorksheet('Danh_muc_thiet_bi')
  assert.equal(catalog.rowCount, 7)
  const codes = Array.from({length:4}, (_, i) => catalog.getCell(i+4, 2).value)
  assert.deepEqual(codes, ['GR-01', 'OLD-01', 'PUMP-01', 'RET-01'])
  const parentRow = codes.indexOf('PUMP-01') + 4
  assert.equal(catalog.getCell(parentRow, 4).value, 'GR-01 — Main Engine')
  assert.equal(catalog.getCell(4, 8).value, 'PUMP-01'); assert.equal(catalog.getColumn(8).hidden, true)
  assert.deepEqual(workbook.getWorksheet('Máy').getCell('D9').dataValidation.formulae, ['MaThietBiChoJob'])
  assert.equal(workbook.getWorksheet('Máy').getCell('D9').value, null)
  assert.equal(workbook.getWorksheet('Boong').getCell('D10').value, null)
  assert.equal(workbook.getWorksheet('Máy').getCell('L7').value, 'Mốc bắt đầu (giờ tàu)')
  assert.equal(workbook.getWorksheet('Máy').getCell('L9').numFmt, 'dd/mm/yyyy hh:mm')
  const parsed = await parseJobWorkbook(XLSX.read(file, {type:'array'}))
  assert.equal(parsed.length, 7)
  assert.ok(parsed.every(r => r.sourceSheet === 'Máy' || r.sourceSheet === 'Boong'))
  const fresh = await fillJobTemplate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), [{ ...equipment[1], assetCode: 'NEW-01' }])
  const newer = new ExcelJS.Workbook(); await newer.xlsx.load(await fresh.arrayBuffer())
  assert.equal(newer.getWorksheet('Danh_muc_thiet_bi').getCell('B4').value, 'NEW-01')
  await assert.rejects(() => fillJobTemplate(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), [equipment[0], equipment[2]]), /Chưa có thiết bị/)
})
test('read-only snapshot normalization preserves exact source strings and material units', () => {
  const { snapshot } = load('features/pms-rework/data.ts', { '@tanstack/react-query': {}, '@/services/api.client': {}, '@/stores/auth.store': {}, '@/stores/permissions.store': {} })
  const source = JSON.stringify({ Materials: [{ Unit: 'PCS', Quantity: 2 }], JobSnapshot: '{"Instructions":"Original"}' })
  const result = snapshot(source)
  assert.equal(result.materials[0].unit, 'PCS'); assert.equal(result.jobSnapshot, '{"Instructions":"Original"}')
  assert.equal(source, JSON.stringify({ Materials: [{ Unit: 'PCS', Quantity: 2 }], JobSnapshot: '{"Instructions":"Original"}' }))
})
