// Local browser smoke test: real components/CSS, isolated HTTP fixtures, no operational backend.
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..')
const artifacts = path.resolve(root, '../../artifacts/test-results/pms-ui-2026-10-26')
const html = path.join(root, 'pms-rework-preview.local.html')
const jobId = '11111111-1111-4111-8111-111111111111', woId = '22222222-2222-4222-8222-222222222222', assetId = '33333333-3333-4333-8333-333333333333', materialId = '44444444-4444-4444-8444-444444444444'
let state = 'PENDING_APPROVAL', version = 3, invalidApproval = false, longContent = false
let cancelledCycle = false
let bulkMode = false
const deletedJobs = new Set()
const requests = [], failures = []
const job = { id: jobId, code: 'FIRE-PUMP-001', name: 'Kiểm tra và bảo dưỡng máy bơm cứu hỏa', equipmentAssetId: assetId, equipmentName: 'Máy bơm cứu hỏa', category: 'PERIODIC', intervalType: 'CALENDAR', intervalMonths: 3, state: 'ACTIVE', version: 1, department: 'DECK', nextDueAt: '2026-10-27T00:00:00Z', responsibleName: 'Đại phó' }
const work = () => ({ id: woId, code: 'WO-2026-000001', jobId, name: job.name, equipmentAssetId: assetId, equipmentName: job.equipmentName, dueAt: job.nextDueAt, dueState: 'UPCOMING', status: state, assignedTo: 'THIRD-OFFICER', assignedName: 'Phó ba', priority: 'HIGH', reportRevision: 1, workflowVersion: version, updatedAt: '2026-10-27T04:30:00Z' })
const report = { id: 'report-1', revision: 1, contentHash: 'report-hash', submittedAt: '2026-10-26T04:00:00Z', submittedByCrewId: 'THIRD-OFFICER', snapshotJson: JSON.stringify({ Name: job.name, Code: 'WO-22222222222242228222222222222222', SubmittedAt: '2026-10-26T04:00:00Z', SubmittedByCrewId: 'THIRD-OFFICER', DurationMinutes: 90, RunningHours: 1001, Checklist: [{ Id: 'check-1', Description: 'Đo áp suất bơm', Completed: true, Reading: 5, Unit: 'bar' }], Materials: [{ MaterialItemId: materialId, Code: 'GASKET', Name: 'Gioăng bơm', Unit: 'PCS', Quantity: 2 }], Contributors: [{ UserId: 2, CrewId: 'THIRD-OFFICER' }] }) }
const page = items => ({ items, total: items.length, page: 1, pageSize: 20 })
function fixture(url, method, body) {
  const p = new URL(url).pathname
  requests.push({ path: p, method, body, url })
  if (p === '/api/pms/work-orders/equipment-tree') return [{ id: 'folder', assetName: 'Thiết bị boong', category: 'SYSTEM', isActive: true }, { id: assetId, parentId: 'folder', assetCode: 'PUMP-001', assetName: job.equipmentName, category: 'DECK', isActive: true }]
  if (p === '/api/pms/jobs/references') return { crew: [{ id: assetId, crewId: 'THIRD-OFFICER', fullName: 'Phó ba' }], ranks: [{ id: 1, rankName: 'Đại phó', department: 'DECK' }, { id: 2, rankName: 'Máy trưởng', department: 'ENGINE' }] }
  if (p === '/api/pms/jobs/preview') return { previousDueAt: null, nextDueAt: job.nextDueAt, state: 'ACTIVE', openWorkOrders: 0, baselineChanged: false, reasonRequired: false, usesApprovedExecution: false, automaticReleaseRequested: false, missingInformation: [] }
  if (p.startsWith('/api/pms/jobs/') && method === 'DELETE') { deletedJobs.add(p.split('/').at(-1)); return {} }
  if (p === '/api/pms/jobs/import') return { valid: true, count: body.rows.length, errors: [], imported: body.validateOnly ? 0 : body.rows.length }
  if (p === '/api/pms/jobs') return method === 'POST' ? { id: jobId } : page((bulkMode ? [{...job, canDelete:true}, {...job,id:'bulk-second',name:'Công việc có thể xóa',canDelete:true},{...job,id:'bulk-locked',name:'Công việc đã có WO',canDelete:false}] : [{...job,canDelete:false}]).filter(j => !deletedJobs.has(j.id)))
  if (p === '/api/store-locations' || p === '/api/material/items') return []
  if (p === '/api/inventory') return { ...page([]), totalValue: 0 }
  if (p === '/api/inventory/summary') return { totalItems: 0, totalValue: 0, lowStockCount: 0 }
  if (p === '/api/inventory/history') return page([{date:'2026-10-27T10:00:00Z',type:'OUT',itemCode:'OIL-001',itemName:'Dầu thủy lực',quantity:25,note:'Tiêu hao vật tư bảo trì'}])
  if (p === `/api/pms/jobs/${jobId}/resolve-cycle`) { assert.ok(body.reason.trim()); assert.equal(body.cancelledWorkOrderId, woId); cancelledCycle = false; return { workOrderId: body.action === 'REPLACE' ? woId : null } }
  if (p === `/api/pms/jobs/${jobId}/history`) return page([{ id: 'report-1', workOrderId: woId, workOrderCode: 'WO-FIRE-PUMP-001', sourceExecutedAt: report.submittedAt, submittedAt: report.submittedAt, approvedAt: report.submittedAt, completedBy: 'Phó ba', isLegacy: false, hasReport: true }])
  if (p.includes('/completed-reports/')) return { ...report, decision: 'APPROVED' }
  if (p === `/api/pms/jobs/${jobId}`) return { job, cycleKey: 'PERIODIC:1', requiresCycleResolution: cancelledCycle, cancelledWorkOrderId: cancelledCycle ? woId : null, instructions: 'Kiểm tra bơm và ghi nhận áp suất', checklist: [{ sequenceOrder: 1, checkpointDescription: 'Đo áp suất bơm', requiresReading: true, unit: 'bar' }], equipmentMaterials: [{ id: materialId, itemCode: 'GASKET', name: 'Gioăng bơm', unit: 'PCS' }], missingInformation: [], daysBeforeDue: 7, warningHours: 50, releasePolicy: 'ON_UPCOMING', assignmentPolicy: 'ON_RELEASE', priority: 'HIGH' }
  if (p === '/api/pms/work-orders/settings') return { vesselTimeZone: 'Asia/Ho_Chi_Minh', automaticReleaseEnabled: false }
  if (p === '/api/pms/work-orders/references') return [{ id: assetId, crewId: 'THIRD-OFFICER', fullName: 'Phó ba' }]
  if (p === '/api/pms/work-orders/material-options') return page([{ id: materialId, itemCode: 'GASKET', name: 'Gioăng bơm', unit: 'PCS', onHand: 10 }])
  if (p === '/api/pms/work-orders') {
    const params = new URL(url).searchParams
    const rows = [work(), { ...work(), id: '55555555-5555-4555-8555-555555555555', code: 'WO-COMPLETED', name: 'Bảo dưỡng đã hoàn thành', status: 'COMPLETED' }, { ...work(), id: '66666666-6666-4666-8666-666666666666', name: 'WO đã hủy cần ẩn', status: 'CANCELLED' }]
    return page(rows.filter(w => (params.get('status') === 'ALL' || params.get('status') === 'OPEN' ? params.get('status') === 'ALL' || !['COMPLETED','CANCELLED','DRAFT'].includes(w.status) : w.status === params.get('status')) && (params.get('excludeCancelled') !== 'true' || w.status !== 'CANCELLED')))
  }
  if (p === `/api/pms/work-orders/${woId}`) return { workOrder: work(), taskType: 'PERIODIC', missingInformation: [], jobSnapshot: JSON.stringify({ Instructions: 'Kiểm tra bơm và ghi nhận áp suất' }), checklist: [{ id: 'check-1', checkpointDescription: 'Đo áp suất bơm', requiresReading: true, sequenceOrder: 1, isCompleted: false, unit: 'bar' }], reports: [report], timeline: longContent ? Array.from({length: 70}, (_,i)=>({id: `event-${i}`,changedAt: '2026-10-27T04:00:00Z',changedBy: 'THIRD-OFFICER',reason: `Sự kiện bảo trì ${i+1}`})) : [{id:'event-1',changedAt:'2026-10-26T03:00:00Z',changedBy:'THIRD-OFFICER',reason:'Nhận và bắt đầu công việc'},{id:'event-2',changedAt:'2026-10-26T04:00:00Z',changedBy:'THIRD-OFFICER',reason:'Gửi kết quả kiểm tra'}], actualDurationMinutes: 90 }
  if (p.includes('/reports/1')) {
    if (!longContent) return report
    const content = JSON.parse(report.snapshotJson)
    content.Checklist = Array.from({length: 50}, (_, i) => ({...content.Checklist[0], Id: `check-${i}`, Description: `Hạng mục kiểm tra ${i + 1}`}))
    content.Materials = Array.from({length: 50}, (_, i) => ({...content.Materials[0], MaterialItemId: `material-${i}`, Name: `Vật tư sử dụng ${i + 1}`}))
    return {...report, snapshotJson: JSON.stringify(content)}
  }
  if (p === '/api/pms/counters') return page([{ id: assetId, assetCode: 'PUMP-001', assetName: job.equipmentName, currentRunningHours: 1000 }])
  if (p.startsWith('/api/approvals/pms/')) return { actor: { name: 'Đại phó', rank: 'Đại phó', username: 'reviewer', authority: 'pms.work.approve' }, module: 'pms', recordKey: woId, action: new URL(url).searchParams.get('action'), state, version: 0, revision: 0, contentHash: 'approval-hash', snapshot: { Id: woId, Revision: 1, ContentHash: 'approval-hash', SubmittedReport: invalidApproval ? 'invalid-json' : report.snapshotJson } }
  if (p.endsWith('/return')) { state = 'RECTIFY'; version++; return { id: woId, status: state, version, revision: 1 } }
  if (p.endsWith('/start')) { state = 'IN_PROGRESS'; version++; return { id: woId, status: state, version, revision: 1 } }
  if (p.endsWith('/approve')) { state = 'COMPLETED'; report.decision='APPROVED'; report.decidedAt='2026-10-27T04:30:00Z'; version++; return { id: woId, status: state, version, revision: 1 } }
  if (p.endsWith('/submit')) { state = 'PENDING_APPROVAL'; version++; return { id: woId, status: state, version, revision: 2 } }
  throw Error(`Unexpected fixture request: ${method} ${p}`)
}
async function main() {
  process.chdir(root)
  fs.mkdirSync(artifacts, { recursive: true })
  if (await fetch('http://127.0.0.1:15308/json/version').catch(() => null)) throw Error('Browser test port 15308 is already in use');
  const { createServer } = await import('vite')
  const server = await createServer({ root, server: { host: '127.0.0.1', port: 15307, strictPort: true } })
  await server.listen()
  const modules = [{ code: 'pms.jobs', actions: ['view', 'create', 'delete', 'import', 'update'], routes: ['/pms/jobs'] }, { code: 'pms.work', actions: ['view', 'create', 'delete', 'update', 'assign', 'execute', 'approve', 'reject'], routes: ['/pms/work-orders'] }, { code: 'pms.counter', actions: ['view', 'update'], routes: [] }]
  fs.writeFileSync(html, `<html><body style="margin:0"><div id="root" style="height:100vh"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter,Routes,Route} from 'react-router-dom';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import '/src/styles/globals.css';import InventoryPage from '/src/pages/Inventory/InventoryPage.tsx';import Planning from '/src/features/pms-rework/Planning.tsx';import JobPage from '/src/features/pms-rework/JobPage.tsx';import WorkOrderPage from '/src/features/pms-rework/WorkOrderPage.tsx';import {ApprovalDialog} from '/src/components/ApprovalDialog.tsx';import {usePermissionsStore} from '/src/stores/permissions.store.ts';import {useAuthStore} from '/src/stores/auth.store.ts';
const modules=${JSON.stringify(modules)};const qc=new QueryClient();window.testUser=(execute=false,readonly=false)=>{useAuthStore.setState({accessToken:'browser-fixture-token',user:{id:execute?2:1,crewId:execute?'THIRD-OFFICER':null,username:'fixture'}});usePermissionsStore.setState({loaded:true,error:null,isAdmin:false,modules,grants:modules.flatMap(m=>readonly?[m.code+'.access']:['access',...m.actions].map(a=>m.code+'.'+a))});qc.clear()};window.testUser();window.testNavigate=p=>{history.pushState({},'',p);window.dispatchEvent(new PopStateEvent('popstate'))};history.replaceState({},'','/pms/work-planning');
const h=React.createElement;createRoot(document.getElementById('root')).render(h(QueryClientProvider,{client:qc},h(BrowserRouter,null,h(ApprovalDialog),h(Routes,null,h(Route,{path:'/inventory-test',element:h(InventoryPage)}),h(Route,{path:'/pms/work-planning',element:h(Planning)}),h(Route,{path:'/pms/jobs/:id',element:h(JobPage)}),h(Route,{path:'/pms/work-orders/:id',element:h(WorkOrderPage)}),h(Route,{path:'/pms/work-orders/:id/execute',element:h(WorkOrderPage,{mode:'execute'})}),h(Route,{path:'/pms/work-orders/:id/review',element:h(WorkOrderPage,{mode:'review'})})))));
</script></body></html>`)
  const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=15308', `--user-data-dir=${path.join(artifacts, 'chrome-profile-' + process.pid + '-' + Date.now())}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  let ws, closing = false
  try {
    let browser
    for (let i = 0; i < 100; i++) { try { browser = await fetch('http://127.0.0.1:15308/json/version').then(r => r.json()); break } catch { await new Promise(r => setTimeout(r, 100)) } }
    if (!browser) throw Error('Chrome did not start')
    ws = new WebSocket(browser.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
    let nextId = 1; const pending = new Map()
    ws.onclose = () => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(Error('Browser connection closed')) } pending.clear() }
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = nextId++; const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)) }, 20000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params, sessionId })) })
    ws.onmessage = async event => {
      const m = JSON.parse(event.data)
      if (m.id) { const p = pending.get(m.id); if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result) } }
      if (m.method === 'Runtime.exceptionThrown') failures.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
      if (m.method === 'Fetch.requestPaused') {
        const req = m.params.request; let body
        try { body = fixture(req.url, req.method, req.postData ? JSON.parse(req.postData) : undefined) } catch (e) { failures.push(e.message); body = { error: e.message } }
        try { await send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') }, m.sessionId) }
        catch (error) { if (!closing) failures.push(error.message) }
      }
    }
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' }); const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    const call = (method, params) => send(method, params, sessionId)
    await call('Runtime.enable'); await call('Page.enable'); await call('Fetch.enable', { patterns: [{ urlPattern: 'http://127.0.0.1:15307/api/*' }] })
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] })
    const evaluate = async expression => { const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.text); return result.result.value }
    const wait = async expression => { for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 100)) } throw Error('Browser wait timeout: ' + expression) }
    const click = text => evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)})?.click()`)
    const fill = (selector, value) => evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    const screen = async name => { const { data } = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(artifacts, name + '.png'), Buffer.from(data, 'base64')) }
    await call('Page.navigate', { url: 'http://127.0.0.1:15307/pms-rework-preview.local.html' })
    await wait(`document.body.textContent.includes('Kiểm tra và bảo dưỡng máy bơm cứu hỏa')`)
    assert.equal(await evaluate(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Thêm công việc');const s=getComputedStyle(b);return s.color!==s.backgroundColor})()`), true)
    await screen('job-list')
    await click('Import Excel'); await wait(`!!document.querySelector('[role=dialog] input[type=file]')`)
    assert.equal(await evaluate(`document.querySelector('[role=dialog]').textContent.includes('Kiểm tra trước khi nhập')`), true)
    await screen('job-import-redesign-empty')
    const XLSX = require('xlsx'), importFile = path.join(artifacts, 'jobs-import-ui.xlsx'), invalidFile = path.join(artifacts, 'jobs-import-invalid.xlsx')
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet([{ ScheduleCode:'IMPORT-001',AssetCode:'PUMP-001',ScheduleName:'Kiểm tra import bơm',MaintenanceCategory:'PERIODIC',IntervalType:'CALENDAR',IntervalMonths:3 }]), 'Maintenance'); XLSX.writeFile(book, importFile)
    const invalidBook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(invalidBook, XLSX.utils.json_to_sheet([{Name:'Missing required columns'}]), 'Maintenance'); XLSX.writeFile(invalidBook, invalidFile)
    const chooseFile = async file => { const {root} = await call('DOM.getDocument'); const {nodeId} = await call('DOM.querySelector',{nodeId:root.nodeId,selector:'[role=dialog] input[type=file]'}); await call('DOM.setFileInputFiles',{nodeId,files:[file]}) }
    await chooseFile(importFile); await wait(`document.querySelector('[role=dialog]').textContent.includes('1 công việc hợp lệ')`)
    assert.equal(await evaluate(`document.querySelector('[role=dialog] tbody').textContent.includes('Kiểm tra import bơm')`), true)
    await screen('job-import-redesign-preview')
    await chooseFile(invalidFile); await wait(`!!document.querySelector('[role=dialog] [role=alert]')`)
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('[role=dialog] button')).find(b=>b.textContent.includes('Nhập 0')).disabled`), true)
    await evaluate(`document.querySelector('[role=dialog] button[aria-label="Đóng"]').click()`)
    bulkMode = true
    await evaluate(`window.testUser();window.testNavigate('/pms/work-planning?tab=table')`); await wait(`document.body.textContent.includes('Công việc đã có WO')`)
    await evaluate(`document.querySelector('input[aria-label="Chọn tất cả dòng trên trang"]').click()`)
    assert.equal(await evaluate(`document.querySelector('input[aria-label="Chọn dòng 3"]').disabled`), true)
    await click('Xóa nhiều (2)'); await wait(`!!document.querySelector('[role=dialog]')`); await screen('job-bulk-delete-confirmation')
    await click('Xóa 2 công việc'); await wait(`!document.querySelector('[role=dialog]') && !document.body.textContent.includes('Công việc có thể xóa')`)
    assert.equal(deletedJobs.has('bulk-locked'),false); assert.equal(deletedJobs.size,2)
    bulkMode = false; deletedJobs.clear()
    await evaluate(`window.testUser();window.testNavigate('/inventory-test')`); await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Lịch sử tồn kho'))`)
    await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Lịch sử tồn kho')).click()`)
    await wait(`!!document.querySelector('[role=dialog]') && document.querySelector('[role=dialog]').textContent.includes('Dầu thủy lực')`)
    assert.equal(await evaluate(`document.querySelector('[role=dialog]').textContent.includes('OIL-001')`),true)
    await screen('inventory-history-redesign')
    await evaluate(`document.querySelector('[role=dialog] button[aria-label="Đóng"]').click();window.testUser();window.testNavigate('/pms/work-planning?tab=table')`)
    await wait(`document.body.textContent.includes('Kiểm tra và bảo dưỡng máy bơm cứu hỏa')`)
    assert.equal(await evaluate(`document.querySelector('thead').rows.length`), 1)
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('table')).borderCollapse`), 'separate')
    assert.equal(await evaluate(`!!document.querySelector('thead th:nth-child(2)>span svg')`), false)
    assert.equal(await evaluate(`getComputedStyle(document.querySelector('tbody td')).borderRightColor`), 'rgb(163, 177, 188)')
    await evaluate(`(()=>{const el=document.querySelector('input[aria-label="Tìm tên công việc"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'bơm');el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await wait(`document.querySelector('input[aria-label="Tìm tên công việc"]').value==='bơm'`)
    await new Promise(r=>setTimeout(r,600));assert.equal(new URL(requests.filter(r=>r.path==='/api/pms/jobs').at(-1).url).searchParams.get('name'),'bơm')
    assert.equal(await evaluate(`document.body.textContent.includes('Đang lọc:')`), false)
    await fill('input[aria-label="Tìm tên công việc"]', '')
    await evaluate(`document.querySelector('button[aria-label="Lọc và sắp xếp cột Hạn tới"]').click()`)
    await wait(`!!document.querySelector('input[aria-label="Hạn tới từ ngày"]')`)
    assert.equal(await evaluate(`(()=>{const r=document.querySelector('[aria-label="Bộ lọc cột Hạn tới"]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight})()`), true)
    await screen('column-filter-system-style')
    await evaluate(`(()=>{const el=document.querySelector('input[aria-label="Hạn tới từ ngày"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'2026-10-26');el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await wait(`document.querySelector('input[aria-label="Hạn tới từ ngày"]').value==='2026-10-26'`)
    await click('Áp dụng'); await wait(`!document.querySelector('[aria-label="Bộ lọc cột Hạn tới"]')`)
    await new Promise(r=>setTimeout(r,600));assert.equal(new URL(requests.filter(r=>r.path==='/api/pms/jobs').at(-1).url).searchParams.get('dueFrom'),'2026-10-25T17:00:00.000Z')
    await evaluate(`document.querySelector('button[aria-label^="Lọc và sắp xếp cột Hạn tới"]').click()`)
    await wait(`!!document.querySelector('[aria-label="Bộ lọc cột Hạn tới"]')`); await click('Bỏ lọc')
    await evaluate(`document.querySelector('button[aria-label="Lọc và sắp xếp cột Tên công việc"]').click()`)
    await click('Sắp xếp giảm dần (Z → A)')
    await new Promise(r=>setTimeout(r,400));assert.equal(new URL(requests.filter(r=>r.path==='/api/pms/jobs').at(-1).url).searchParams.get('descending'),'true')
    await screen('job-list-system-style')
    const pinned = await evaluate(`(()=>{const grid=document.querySelector('[aria-label="Bảng dữ liệu, có thể cuộn ngang"]');const before=grid.querySelector('tbody td:nth-child(2)').getBoundingClientRect().left;grid.scrollLeft=500;const after=grid.querySelector('tbody td:nth-child(2)').getBoundingClientRect().left;const head=grid.querySelector('thead th:nth-child(2)');return {before,after,head:head.getBoundingClientRect().left,position:getComputedStyle(head).position}})()`)
    assert.equal(pinned.before, pinned.after); assert.equal(pinned.head, pinned.after); assert.equal(pinned.position, 'sticky')
    await evaluate(`document.querySelector('[aria-label="Bảng dữ liệu, có thể cuộn ngang"]').scrollLeft=0`)
    await click('Thêm công việc'); await wait(`!!document.querySelector('[role=dialog]')`)
    await evaluate(`(()=>{const el=document.querySelector('#pms-job-form input');el.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'TEST');el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    assert.equal(await evaluate(`document.activeElement===document.querySelector('#pms-job-form input')`), true)
    for (const [group, expected] of [['Thông tin công việc', 'Mã công việc nguồn'], ['Chu kỳ và mốc bắt đầu tính hạn', 'mốc 0 giờ'], ['Trách nhiệm', 'không mặc nhiên'], ['Checklist mẫu', 'Sửa mẫu Job']]) {
      await evaluate(`(()=>{const b=document.querySelector('button[aria-label=${JSON.stringify('Giải thích: '+group)}]');b.focus();b.click()})()`)
      await wait(`document.querySelectorAll('[role="dialog"]').length===2`)
      assert.equal(await evaluate(`Array.from(document.querySelectorAll('[role="dialog"]')).at(-1).textContent.includes(${JSON.stringify(expected)})`), true)
      if (group === 'Chu kỳ và mốc bắt đầu tính hạn') await screen('job-cycle-help')
      await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
      await wait(`document.querySelectorAll('[role="dialog"]').length===1`)
      assert.equal(await evaluate(`document.activeElement.getAttribute('aria-label')===${JSON.stringify('Giải thích: '+group)}`), true)
    }
    assert.equal(requests.some(r=>r.path==='/api/pms/jobs' && r.method==='POST'), false)
    for (const [interval, days, hours] of [['CALENDAR',true,false], ['RUNNING_HOURS',false,true], ['HYBRID',true,true], ['CALENDAR',true,false]]) {
      await evaluate(`(()=>{const s=document.querySelector('select[aria-label="Tính chu kỳ theo"]');s.value=${JSON.stringify(interval)};s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
      await wait(`document.querySelector('select[aria-label="Tính chu kỳ theo"]').value===${JSON.stringify(interval)}`)
      const visible = await evaluate(`(()=>{const names=Array.from(document.querySelectorAll('#pms-job-form label>span:first-child')).map(e=>e.textContent);return [names.includes('Cảnh báo trước (ngày)'),names.includes('Cảnh báo trước (giờ chạy)')]})()`)
      assert.deepEqual(visible, [days,hours])
    }
    await evaluate(`(()=>{const s=document.querySelector('select[aria-label="Chức danh chịu trách nhiệm"]');s.value='1';s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await wait(`document.querySelector('select[aria-label="Bộ phận phụ trách"]').value==='DECK'`)
    assert.equal(await evaluate(`document.querySelector('select[aria-label="Bộ phận phụ trách"]').disabled`), true)
    await evaluate(`(()=>{const s=document.querySelector('select[aria-label="Chức danh chịu trách nhiệm"]');s.value='2';s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await wait(`document.querySelector('select[aria-label="Bộ phận phụ trách"]').value==='ENGINE'`)
    await evaluate(`(()=>{const s=document.querySelector('select[aria-label="Chức danh chịu trách nhiệm"]');s.value='';s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await wait(`!document.querySelector('select[aria-label="Bộ phận phụ trách"]').disabled`)
    await evaluate(`(()=>{const s=document.querySelector('select[aria-label="Bộ phận phụ trách"]');s.value='CATERING';s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await screen('job-form')
    await evaluate(`document.querySelector('input[role=combobox][aria-label="Thiết bị"]').focus()`)
    await fill('input[role=combobox][aria-label="Thiết bị"]', 'may bom')
    await wait(`!!document.querySelector('[role=listbox] [role=option]')`)
    assert.equal(await evaluate(`document.querySelectorAll('[role=listbox] [role=option]').length`), 1)
    assert.equal(await evaluate(`document.querySelector('[role=listbox]').textContent.includes('Máy bơm cứu hỏa')`), true)
    await fill('input[role=combobox][aria-label="Thiết bị"]', 'PUMP-001')
    await wait(`document.querySelector('[role=listbox]').textContent.includes('PUMP-001')`)
    await screen('equipment-search')
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter' })
    await wait(`!document.querySelector('[role=listbox]')`)
    assert.equal(await evaluate(`document.querySelector('input[role=combobox][aria-label="Thiết bị"]').value.includes('PUMP-001')`), true)
    await evaluate(`document.querySelector('input[role=combobox][aria-label="Thiết bị"]').dispatchEvent(new FocusEvent('focusin',{bubbles:true}))`)
    await fill('input[role=combobox][aria-label="Thiết bị"]', 'khong-ton-tai')
    await wait(`document.body.textContent.includes('Không tìm thấy thiết bị phù hợp.')`)
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' })
    await wait(`!document.querySelector('[role=listbox]')`)
    assert.equal(await evaluate(`!!document.querySelector('#pms-job-form') && document.querySelector('input[role=combobox][aria-label="Thiết bị"]').value.includes('PUMP-001')`), true)
    await evaluate(`(()=>{const el=document.querySelectorAll('#pms-job-form input')[1];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Preview test');el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await click('Xem trước và lưu'); await wait(`document.body.textContent.includes('Ảnh hưởng sau khi lưu')`)
    assert.equal(requests.some(r => r.path === '/api/pms/jobs' && r.method === 'POST'), false)
    await screen('job-impact')
    await evaluate(`(()=>{const el=document.querySelector('#pms-job-form input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'TEST-EDITED');el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await wait(`!document.body.textContent.includes('Ảnh hưởng sau khi lưu')`)
    await click('Xem trước và lưu'); await wait(`document.body.textContent.includes('Ảnh hưởng sau khi lưu')`)
    await click('Xác nhận lưu'); await wait(`!document.querySelector('[role=dialog]')`)
    assert.equal(requests.find(r => r.path === '/api/pms/jobs' && r.method === 'POST').body.code, 'TEST-EDITED')
    assert.equal(requests.find(r => r.path === '/api/pms/jobs' && r.method === 'POST').body.equipmentAssetId, assetId)
    assert.equal(requests.find(r => r.path === '/api/pms/jobs' && r.method === 'POST').body.department, 'CATERING')
    await evaluate(`document.querySelector('button[aria-label="Lịch sử bảo trì"]').click()`); await wait(`document.body.textContent.includes('WO-FIRE-PUMP-001')`)
    await evaluate(`document.querySelector('button[aria-label="Xem báo cáo"]').click()`); await wait(`document.body.textContent.includes('Báo cáo đã gửi')`)
    await evaluate(`Array.from(document.querySelectorAll('[role="dialog"] [role="tab"]')).find(b=>b.textContent.includes('Vật tư đã sử dụng')).click()`)
    await wait(`document.body.textContent.includes('Gioăng bơm')`); await screen('maintenance-report')
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }); await wait(`document.querySelectorAll('[role=dialog]').length===1`)
    await evaluate(`document.querySelector('button[aria-label="Đóng"]').click()`)
    await evaluate(`window.testNavigate('/pms/jobs/${jobId}')`); await wait(`!!document.querySelector('[aria-label="Đường dẫn công việc"] h1')`)
    assert.equal(await evaluate(`document.querySelector('[aria-label="Đường dẫn công việc"] h1').textContent`), job.name)
    await screen('job-detail-redesign')
    for (const choice of ['Phát hành WO thay thế', 'Bỏ qua kỳ này']) {
      cancelledCycle = true
      await evaluate(`window.testUser();window.testNavigate('/pms/jobs/${jobId}')`)
      await wait(`document.body.textContent.includes('Bỏ qua kỳ này')`)
      await click(choice); await wait(`!!document.querySelector('[role=dialog] textarea')`)
      assert.equal(await evaluate(`document.querySelector('button[type=submit]').disabled`), true)
      await evaluate(`(()=>{const el=document.querySelector('[role=dialog] textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(el,'Đối soát kỳ đã hủy');el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
      await click('Xác nhận'); await wait(`!document.querySelector('[role=dialog]')`)
      await wait(choice === 'Phát hành WO thay thế' ? `location.pathname.includes('/pms/work-orders/')` : `!document.body.textContent.includes('Bỏ qua kỳ này')`)
    }
    await evaluate(`window.testNavigate('/pms/jobs/${jobId}')`); await wait(`!!document.querySelector('[aria-label="Nội dung công việc"]')`)
    await evaluate(`Array.from(document.querySelectorAll('[aria-label="Nội dung công việc"] button')).find(b=>b.textContent.includes('Vật tư của thiết bị')).click()`)
    await wait(`document.body.textContent.includes('Gioăng bơm')`); await screen('job-detail-materials')
    await evaluate(`window.testNavigate('/pms/jobs/${jobId}?edit=1')`); await wait(`!!document.querySelector('[role=dialog]')`)
    await evaluate(`document.querySelector('button[aria-label="Đóng"]').click()`); await wait(`!document.querySelector('[role=dialog]')`)
    await evaluate(`window.testNavigate('/pms/work-planning?tab=orders')`); await wait(`document.body.textContent.includes('Chờ duyệt')`)
    assert.equal(new URL(requests.filter(r=>r.path==='/api/pms/work-orders').at(-1).url).searchParams.get('status'), 'OPEN')
    assert.equal(await evaluate(`document.querySelector('tbody').textContent.includes('WO-2026-000001')`), true)
    assert.equal(await evaluate(`document.body.textContent.includes('Bảo dưỡng đã hoàn thành') || document.body.textContent.includes('WO đã hủy cần ẩn')`), false)
    assert.equal(await evaluate(`document.body.textContent.includes('Đang lọc:')`), false)
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('tbody td:last-child')).every(c=>c.textContent.trim()==='')`), true)
    await evaluate(`document.querySelector('button[aria-label^="Lọc và sắp xếp cột Tiến độ"]').click()`)
    await wait(`!!document.querySelector('[aria-label="Bộ lọc cột Tiến độ"]')`)
    await evaluate(`Array.from(document.querySelectorAll('[aria-label="Bộ lọc cột Tiến độ"] label')).find(l=>l.textContent.trim()==='Chờ duyệt').click()`)
    await click('Áp dụng'); await new Promise(r=>setTimeout(r,500))
    for (let i = 0; i < 100 && new URL(requests.filter(r=>r.path==='/api/pms/work-orders').at(-1).url).searchParams.get('status') !== 'PENDING_APPROVAL'; i++) await new Promise(r=>setTimeout(r,100))
    assert.equal(new URL(requests.filter(r=>r.path==='/api/pms/work-orders').at(-1).url).searchParams.get('status'), 'PENDING_APPROVAL')
    assert.equal(await evaluate(`document.body.textContent.includes('Đang lọc:')`), false)
    await evaluate(`document.querySelector('button[aria-label^="Lọc và sắp xếp cột Tiến độ"]').click()`)
    await wait(`!!document.querySelector('[aria-label="Bộ lọc cột Tiến độ"]')`); await click('Bỏ lọc'); await new Promise(r=>setTimeout(r,500))
    await wait(`document.body.textContent.includes('Bảo dưỡng đã hoàn thành')`)
    assert.equal(new URL(requests.filter(r=>r.path==='/api/pms/work-orders').at(-1).url).searchParams.get('status'), 'ALL')
    assert.equal(await evaluate(`document.body.textContent.includes('WO đã hủy cần ẩn')`), true)
    assert.equal(await evaluate(`!!document.querySelector('button[aria-label="Lọc và sắp xếp cột Tiến độ"]')`), true)
    await screen('work-orders')
    await click('Lịch'); await wait(`document.body.textContent.includes('T2') && !!document.querySelector('input[aria-label="Chọn tháng"]')`); await screen('calendar')
    await wait(`document.body.textContent.includes('Bảo dưỡng đã hoàn thành')`)
    assert.equal(await evaluate(`document.body.textContent.includes('WO đã hủy cần ẩn')`), false)
    assert.equal(new URL(requests.filter(r=>r.path==='/api/pms/work-orders').at(-1).url).searchParams.get('excludeCancelled'), 'true')
    await click('Gantt chart'); await wait(`!!document.querySelector('[aria-label="Biểu đồ Gantt"]')`)
    assert.equal(await evaluate(`document.body.textContent.includes('WO đã hủy cần ẩn')`), false)
    assert.equal(await evaluate(`document.querySelector('[aria-label="Bảng công việc Gantt"]').textContent.includes('Phó ba')`), true)
    assert.equal(await evaluate(`(()=>{const l=document.querySelector('[aria-label="Bảng công việc Gantt"] tbody tr').getBoundingClientRect();const r=document.querySelector('[aria-label="Dòng thời gian Gantt"]>div>div:nth-child(2)').getBoundingClientRect();return l.top===r.top&&l.height===r.height})()`), true)
    await screen('gantt')
    const separator = await evaluate(`(()=>{const e=document.querySelector('[role=separator]');const r=e.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+70,value:e.getAttribute('aria-valuenow')}})()`)
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:separator.x,y:separator.y})
    await call('Input.dispatchMouseEvent',{type:'mousePressed',x:separator.x,y:separator.y,button:'left',clickCount:1})
    await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:separator.x-100,y:separator.y,button:'left',buttons:1})
    await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:separator.x-100,y:separator.y,button:'left',clickCount:1})
    assert.notEqual(await evaluate(`document.querySelector('[role=separator]').getAttribute('aria-valuenow')`), separator.value)
    await screen('gantt-resized')
    const originalMonth = await evaluate(`document.querySelector('input[aria-label="Chọn tháng"]').value`)
    await evaluate(`document.querySelector('button[aria-label="Tháng sau"]').click()`)
    await wait(`document.querySelector('input[aria-label="Chọn tháng"]').value!==${JSON.stringify(originalMonth)}`)
    await evaluate(`document.querySelector('button[aria-label="Tháng trước"]').click()`)
    await wait(`document.querySelector('input[aria-label="Chọn tháng"]').value===${JSON.stringify(originalMonth)}`)
    await click('Counter'); await wait(`document.body.textContent.includes('Giờ chạy hiện tại')`); await screen('counter')
    await evaluate(`window.testNavigate('/pms/work-orders/${woId}/review')`); await wait(`document.body.textContent.includes('Báo cáo đã gửi')`)
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('section>header')).some(h=>h.textContent.includes('Thông tin lệnh thực hiện') && h.textContent.includes('Chờ duyệt'))`), true)
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('section>header')).some(h=>h.textContent.includes('Báo cáo đã gửi') && h.textContent.includes('Lượt 1'))`), true)
    assert.equal(await evaluate(`(()=>{const a=Array.from(document.querySelectorAll('a')).find(a=>a.textContent==='Chi tiết WO');const g=document.querySelector('[aria-label="Quyết định kiểm tra WO"]');const boxes=[a,...g.querySelectorAll('button')].map(e=>e.getBoundingClientRect());return boxes.length===3 && boxes.every(r=>Math.abs(r.top-boxes[0].top)<1 && Math.abs(r.height-boxes[0].height)<1)})()`), true)
    assert.equal(await evaluate(`document.querySelector('aside[aria-label="Kết quả thực hiện WO"]').textContent.includes('Đo áp suất bơm') && document.querySelector('aside[aria-label="Kết quả thực hiện WO"]').textContent.includes('Gioăng bơm')`), true)
    assert.equal(await evaluate(`(()=>{const m=document.querySelector('[aria-label="Bố cục chi tiết WO"] main').getBoundingClientRect(),a=document.querySelector('[aria-label="Kết quả thực hiện WO"]').getBoundingClientRect();return a.left>=m.right && Math.abs(a.top-m.top)<2})()`), true)
    assert.equal(await evaluate(`document.body.textContent.includes('Lưu kết quả')`), false)
    assert.equal(await evaluate(`document.body.textContent.includes('WO-${woId.replaceAll('-', '')}')`), false)
    await screen('work-order-review'); await click('Trả lại'); await wait(`document.body.textContent.includes('Nhập lại mật khẩu')`)
    assert.equal(await evaluate(`document.querySelector('[aria-label="Ký xác nhận"]').textContent.includes('${woId}')`), false)
    await evaluate(`document.querySelector('[aria-label="Ký xác nhận"] summary').click()`)
    await evaluate(`Array.from(document.querySelectorAll('[aria-label="Ký xác nhận"] [role="tab"]')).find(b=>b.textContent.includes('Vật tư đã sử dụng')).click()`)
    await wait(`document.querySelector('[aria-label="Ký xác nhận"]').textContent.includes('Gioăng bơm')`)
    assert.equal(await evaluate(`document.querySelector('[aria-label="Ký xác nhận"] pre')!==null`), false)
    assert.equal(await evaluate(`document.querySelector('[aria-label="Ký xác nhận"]').textContent.includes('ContentHash')`), false)
    await screen('approval-readable-summary')
    await evaluate(`(()=>{const p=document.querySelector('input[type=password]');const r=document.querySelector('[aria-label="Ký xác nhận"] textarea');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(p,'fixture-password');p.dispatchEvent(new Event('input',{bubbles:true}));Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(r,'Kiểm tra lại áp suất');r.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[aria-label="Ký xác nhận"] input[type=checkbox]').click()})()`)
    await click('Xác nhận'); await wait(`document.body.textContent.includes('Cần làm lại')`)
    const returned = requests.find(r => r.path.endsWith('/return')); assert.equal(returned.body.reason, 'Kiểm tra lại áp suất'); assert.equal(returned.body.reportHash, 'report-hash')
    const startsBefore = requests.filter(r=>r.path.endsWith('/start')).length
    await evaluate(`window.testUser(true);window.testNavigate('/pms/work-orders/${woId}')`)
    await wait(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Nhận / bắt đầu')`)
    await click('Nhận / bắt đầu')
    await wait(`location.pathname.endsWith('/execute') && document.body.textContent.includes('Lưu kết quả')`)
    assert.equal(requests.filter(r=>r.path.endsWith('/start')).length, startsBefore + 1)
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.startsWith('Nhận và bắt đầu'))`), false)
    await evaluate(`window.testUser(true);window.testNavigate('/pms/work-orders/${woId}/execute')`); await wait(`document.body.textContent.includes('Lưu kết quả')`); await screen('execution')
    await evaluate(`(()=>{document.querySelector('input[aria-label="Hoàn tất Đo áp suất bơm"]').click();const el=document.querySelector('input[aria-label="Số đo Đo áp suất bơm"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'5');el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(b=>b.textContent.includes('Vật tư đã sử dụng')).click()`)
    await wait(`Array.from(document.querySelectorAll('[role="tabpanel"] button')).some(b=>b.textContent.includes('Gioăng bơm'))`)
    await evaluate(`Array.from(document.querySelectorAll('[role="tabpanel"] button')).find(b=>b.textContent.includes('Gioăng bơm')).click()`)
    await wait(`!!document.querySelector('input[aria-label="Số lượng đã sử dụng"]')`)
    await screen('execution-material-tab')
    await evaluate(`Array.from(document.querySelectorAll('[role="tab"]')).find(b=>b.textContent.includes('Checklist thực hiện')).click()`)
    assert.equal(await evaluate(`document.querySelector('input[aria-label="Hoàn tất Đo áp suất bơm"]').checked && document.querySelector('input[aria-label="Số đo Đo áp suất bơm"]').value==='5'`), true)
    await click('Gửi kiểm tra'); await wait(`!!document.querySelector('h1') && document.querySelector('h1').textContent.includes('Chi tiết WO')`)
    const submitted = requests.find(r => r.path.endsWith('/submit')); assert.equal(submitted.body.actualDurationMinutes, 90); assert.equal(submitted.body.checklist[0].reading, 5); assert.equal(submitted.body.checklist[0].completed, true); assert.ok(submitted.body.commandId); assert.equal('photos' in submitted.body, false)
    assert.deepEqual(submitted.body.materials, [{materialItemId: materialId, quantity: 1}])
    await evaluate(`window.testUser();window.testNavigate('/pms/work-orders/${woId}/review')`)
    await wait(`document.body.textContent.includes('Báo cáo đã gửi')`)
    invalidApproval = true
    await click('Phê duyệt'); await wait(`!!document.querySelector('[aria-label="Ký xác nhận"]')`)
    await evaluate(`document.querySelector('[aria-label="Ký xác nhận"] summary').click()`)
    await wait(`document.querySelector('[aria-label="Ký xác nhận"]').textContent.includes('Không đọc được bản báo cáo')`)
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('[aria-label="Ký xác nhận"] button')).find(b=>b.textContent==='Xác nhận').disabled`), true)
    await evaluate(`document.querySelector('button[aria-label="Đóng xác nhận"]').click()`)
    invalidApproval = false
    await click('Phê duyệt'); await wait(`!!document.querySelector('[aria-label="Ký xác nhận"]')`)
    await evaluate(`(()=>{const p=document.querySelector('input[type=password]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(p,'fixture-password');p.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[aria-label="Ký xác nhận"] input[type=checkbox]').click()})()`)
    await click('Xác nhận'); await wait(`!!document.querySelector('h1') && document.querySelector('h1').textContent.includes('Chi tiết WO')`)
    assert.equal(requests.find(r=>r.path.endsWith('/approve')).body.reportHash, 'report-hash')
    await wait(`!!document.querySelector('[aria-label="Kết quả thực hiện WO"]')`)
    await evaluate(`Array.from(document.querySelectorAll('summary')).find(b=>b.textContent.includes('Các lượt báo cáo')).click()`)
    await wait(`!!document.querySelector('button[aria-label="Xem bản gửi"]')`)
    await screen('work-order-reference-layout')
    await evaluate(`document.querySelector('button[aria-label="Xem bản gửi"]').click()`)
    await wait(`document.querySelector('[aria-label="Kết quả thực hiện WO"]').textContent.includes('Đo áp suất bơm')`)
    await call('Emulation.setDeviceMetricsOverride', { width: 900, height: 780, deviceScaleFactor: 1, mobile: false })
    assert.equal(await evaluate(`(()=>{const m=document.querySelector('[aria-label="Bố cục chi tiết WO"] main').getBoundingClientRect(),a=document.querySelector('[aria-label="Kết quả thực hiện WO"]').getBoundingClientRect();return a.top>=m.bottom && document.documentElement.scrollWidth<=innerWidth})()`), true)
    await screen('work-order-reference-narrow')
    await call('Emulation.clearDeviceMetricsOverride')
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
    longContent = true
    await evaluate(`window.testUser();window.testNavigate('/pms/work-orders/${woId}');window.scrollTo(0,0)`)
    await wait(`document.body.textContent.includes('Hạng mục kiểm tra 50') && document.body.textContent.includes('Vật tư sử dụng 50')`)
    const scrollLabels = ['Nội dung Checklist và số đo', 'Nội dung Vật tư đã sử dụng', 'Nội dung Lịch sử & Ghi chú']
    for (const name of scrollLabels) {
      assert.equal(await evaluate(`(()=>{const all=${JSON.stringify(scrollLabels)}.map(n=>document.querySelector('[aria-label="'+n+'"]'));const p=all.find(e=>e.getAttribute('aria-label')===${JSON.stringify(name)});const before=all.map(e=>e.scrollTop);const page=window.scrollY;p.scrollTop=160;return p.clientHeight<=360 && p.scrollHeight>p.clientHeight && p.scrollTop>0 && all.every((e,i)=>e===p || e.scrollTop===before[i]) && window.scrollY===page})()`), true)
      if (name !== 'Nội dung Lịch sử & Ghi chú') {
        const heading = await evaluate(`(()=>{const p=document.querySelector('[aria-label=${JSON.stringify(name)}]'),th=p.querySelector('th'),top=th.getBoundingClientRect().top;p.scrollTop+=80;return {name:${JSON.stringify(name)},top,after:th.getBoundingClientRect().top,panel:p.getBoundingClientRect().top,padding:parseFloat(getComputedStyle(p).paddingTop),position:getComputedStyle(th).position}})()`)
        assert.ok(heading.position==='sticky' && Math.abs(heading.top-heading.after)<2 && Math.abs(heading.top-heading.panel-heading.padding)<2, JSON.stringify(heading))
      }
    }
    await screen('work-order-independent-scroll')
    longContent = false
    await evaluate(`window.testUser(false,true);window.testNavigate('/pms/work-planning')`); await wait(`!!document.querySelector('nav[aria-label="PMS"]') && document.body.textContent.includes('Kiểm tra và bảo dưỡng máy bơm cứu hỏa')`)
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Thêm công việc'))`), false)
    await call('Emulation.setDeviceMetricsOverride', { width: 900, height: 780, deviceScaleFactor: 1, mobile: false }); await screen('readonly-responsive')
    await click('Counter'); await wait(`document.body.textContent.includes('Giờ chạy hiện tại')`); assert.equal(await evaluate(`!!document.querySelector('input[aria-label^="Giờ chạy mới"]')`), false)
    assert.deepEqual(failures, [])
    const checks = ['job-list', 'column-date-filter', 'job-form-focus-and-contrast', 'job-impact-no-write-before-confirmation', 'job-impact-invalidated-after-edit', 'history-report', 'nested-dialog-escape', 'work-orders', 'calendar', 'gantt', 'counter', 'review-readonly', 'signed-return-reason', 'approval-readable-snapshot', 'approval-no-raw-json', 'approval-malformed-report-blocked', 'signed-approve', 'uuid-hidden', 'wo-two-column-layout', 'wo-report-revision-navigation', 'wo-narrow-layout', 'wo-independent-long-content-scroll', 'wo-sticky-table-headings', 'job-group-help', 'job-help-escape-and-focus', 'job-department-follows-rank', 'job-warning-fields-follow-interval', 'execution', 'submit-hours-to-minutes', 'readonly-permissions', 'responsive', 'readonly-counter', 'separate-borders-and-pinned-columns', 'no-sort-arrow', 'toolbar-server-search', 'no-filter-banner', 'job-detail-breadcrumb', 'job-detail-readonly-materials', 'job-edit-link', 'work-orders-open-default-and-all-reset', 'icon-only-actions', 'gantt-assignee', 'gantt-row-alignment', 'gantt-pointer-resize', 'month-navigation']
    checks.push('equipment-search-name-without-accents-and-code', 'equipment-keyboard-selection', 'equipment-search-escape-keeps-selection')
    checks.push('cancelled-cycle-replace-with-reason-and-navigation', 'cancelled-cycle-skip-with-reason')
    checks.push('job-import-preview-and-inline-errors', 'job-bulk-delete-only-eligible-rows', 'inventory-history-material-code-name-and-dialog')
    fs.writeFileSync(path.join(artifacts, 'browser-summary.json'), JSON.stringify({ checks, requests: requests.map(r => ({ path: r.path, method: r.method })), failures }, null, 2))
    closing = true
    await call('Fetch.disable'); await call('Page.navigate', { url: 'about:blank' })
    console.log(`PMS browser smoke: ${checks.length} checks passed; screenshots in ` + artifacts)
  } finally {
    ws?.close(); chrome.kill(); await server.close(); fs.rmSync(html, { force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
