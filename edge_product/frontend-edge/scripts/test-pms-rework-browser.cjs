// Local browser smoke test: real components/CSS, isolated HTTP fixtures, no operational backend.
const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..')
const artifacts = path.resolve(root, '../../artifacts/test-results/pms-ui-2026-10-26')
const html = path.join(root, 'pms-rework-preview.local.html')
const jobId = '11111111-1111-4111-8111-111111111111', woId = '22222222-2222-4222-8222-222222222222', assetId = '33333333-3333-4333-8333-333333333333', materialId = '44444444-4444-4444-8444-444444444444'
let state = 'PENDING_APPROVAL', version = 3
const requests = [], failures = []
const job = { id: jobId, code: 'FIRE-PUMP-001', name: 'Kiểm tra và bảo dưỡng máy bơm cứu hỏa', equipmentAssetId: assetId, equipmentName: 'Máy bơm cứu hỏa', category: 'PERIODIC', intervalType: 'CALENDAR', intervalMonths: 3, state: 'ACTIVE', version: 1, department: 'DECK', nextDueAt: '2026-10-27T00:00:00Z', responsibleName: 'Đại phó' }
const work = () => ({ id: woId, code: 'WO-FIRE-PUMP-001', jobId, name: job.name, equipmentAssetId: assetId, equipmentName: job.equipmentName, dueAt: job.nextDueAt, dueState: 'UPCOMING', status: state, assignedTo: 'THIRD-OFFICER', assignedName: 'Phó ba', priority: 'HIGH', reportRevision: 1, workflowVersion: version })
const report = { id: 'report-1', revision: 1, contentHash: 'report-hash', submittedAt: '2026-10-26T04:00:00Z', submittedByCrewId: 'THIRD-OFFICER', snapshotJson: JSON.stringify({ Name: job.name, Code: 'WO-FIRE-PUMP-001', SubmittedAt: '2026-10-26T04:00:00Z', SubmittedByCrewId: 'THIRD-OFFICER', DurationMinutes: 90, RunningHours: 1001, Checklist: [{ Id: 'check-1', Description: 'Đo áp suất bơm', Completed: true, Reading: 5, Unit: 'bar' }], Materials: [{ MaterialItemId: materialId, Code: 'GASKET', Name: 'Gioăng bơm', Unit: 'PCS', Quantity: 2 }], Contributors: [{ UserId: 2, CrewId: 'THIRD-OFFICER' }] }) }
const page = items => ({ items, total: items.length, page: 1, pageSize: 20 })
function fixture(url, method, body) {
  const p = new URL(url).pathname
  requests.push({ path: p, method, body, url })
  if (p === '/api/pms/work-orders/equipment-tree') return [{ id: 'folder', assetName: 'Thiết bị boong', category: 'SYSTEM', isActive: true }, { id: assetId, parentId: 'folder', assetCode: 'PUMP-001', assetName: job.equipmentName, category: 'DECK', isActive: true }]
  if (p === '/api/pms/jobs/references') return { crew: [{ id: assetId, crewId: 'THIRD-OFFICER', fullName: 'Phó ba' }], ranks: [{ id: 1, rankName: 'Đại phó' }] }
  if (p === '/api/pms/jobs/preview') return { previousDueAt: null, nextDueAt: job.nextDueAt, state: 'ACTIVE', openWorkOrders: 0, baselineChanged: false, reasonRequired: false, usesApprovedExecution: false, automaticReleaseRequested: false, missingInformation: [] }
  if (p === '/api/pms/jobs') return method === 'POST' ? { id: jobId } : page([job])
  if (p === `/api/pms/jobs/${jobId}/history`) return page([{ id: 'report-1', workOrderId: woId, workOrderCode: 'WO-FIRE-PUMP-001', sourceExecutedAt: report.submittedAt, submittedAt: report.submittedAt, approvedAt: report.submittedAt, completedBy: 'Phó ba', isLegacy: false, hasReport: true }])
  if (p.includes('/completed-reports/')) return { ...report, decision: 'APPROVED' }
  if (p === `/api/pms/jobs/${jobId}`) return { job, cycleKey: 'PERIODIC:1', instructions: 'Kiểm tra bơm và ghi nhận áp suất', checklist: [{ sequenceOrder: 1, checkpointDescription: 'Đo áp suất bơm', requiresReading: true, unit: 'bar' }], equipmentMaterials: [{ id: materialId, itemCode: 'GASKET', name: 'Gioăng bơm', unit: 'PCS' }], missingInformation: [], daysBeforeDue: 7, warningHours: 50, releasePolicy: 'ON_UPCOMING', assignmentPolicy: 'ON_RELEASE', priority: 'HIGH' }
  if (p === '/api/pms/work-orders/settings') return { vesselTimeZone: 'Asia/Ho_Chi_Minh', automaticReleaseEnabled: false }
  if (p === '/api/pms/work-orders/references') return [{ id: assetId, crewId: 'THIRD-OFFICER', fullName: 'Phó ba' }]
  if (p === '/api/pms/work-orders/material-options') return page([{ id: materialId, itemCode: 'GASKET', name: 'Gioăng bơm', unit: 'PCS', onHand: 10 }])
  if (p === '/api/pms/work-orders') return page([work()])
  if (p === `/api/pms/work-orders/${woId}`) return { workOrder: work(), taskType: 'PERIODIC', missingInformation: [], jobSnapshot: JSON.stringify({ Instructions: 'Kiểm tra bơm và ghi nhận áp suất' }), checklist: [{ id: 'check-1', checkpointDescription: 'Đo áp suất bơm', requiresReading: true, sequenceOrder: 1, isCompleted: false, unit: 'bar' }], reports: [report], timeline: [], actualDurationMinutes: 90 }
  if (p.includes('/reports/1')) return report
  if (p === '/api/pms/counters') return page([{ id: assetId, assetCode: 'PUMP-001', assetName: job.equipmentName, currentRunningHours: 1000 }])
  if (p.startsWith('/api/approvals/pms/')) return { actor: { name: 'Đại phó', rank: 'Đại phó', username: 'reviewer', authority: 'pms.work.approve' }, module: 'pms', recordKey: woId, action: new URL(url).searchParams.get('action'), state, version: 0, revision: 0, contentHash: 'approval-hash', snapshot: {} }
  if (p.endsWith('/return')) { state = 'RECTIFY'; version++; return { id: woId, status: state, version, revision: 1 } }
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
import '/src/styles/globals.css';import Planning from '/src/features/pms-rework/Planning.tsx';import JobPage from '/src/features/pms-rework/JobPage.tsx';import WorkOrderPage from '/src/features/pms-rework/WorkOrderPage.tsx';import {ApprovalDialog} from '/src/components/ApprovalDialog.tsx';import {usePermissionsStore} from '/src/stores/permissions.store.ts';import {useAuthStore} from '/src/stores/auth.store.ts';
const modules=${JSON.stringify(modules)};const qc=new QueryClient();window.testUser=(execute=false,readonly=false)=>{useAuthStore.setState({accessToken:'browser-fixture-token',user:{id:execute?2:1,crewId:execute?'THIRD-OFFICER':null,username:'fixture'}});usePermissionsStore.setState({loaded:true,error:null,isAdmin:false,modules,grants:modules.flatMap(m=>readonly?[m.code+'.access']:['access',...m.actions].map(a=>m.code+'.'+a))});qc.clear()};window.testUser();window.testNavigate=p=>{history.pushState({},'',p);window.dispatchEvent(new PopStateEvent('popstate'))};history.replaceState({},'','/pms/work-planning');
const h=React.createElement;createRoot(document.getElementById('root')).render(h(QueryClientProvider,{client:qc},h(BrowserRouter,null,h(ApprovalDialog),h(Routes,null,h(Route,{path:'/pms/work-planning',element:h(Planning)}),h(Route,{path:'/pms/jobs/:id',element:h(JobPage)}),h(Route,{path:'/pms/work-orders/:id',element:h(WorkOrderPage)}),h(Route,{path:'/pms/work-orders/:id/execute',element:h(WorkOrderPage,{mode:'execute'})}),h(Route,{path:'/pms/work-orders/:id/review',element:h(WorkOrderPage,{mode:'review'})})))));
</script></body></html>`)
  const chrome = spawn(process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=15308', `--user-data-dir=${path.join(artifacts, 'chrome-profile-' + process.pid + '-' + Date.now())}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
  let ws
  try {
    let browser
    for (let i = 0; i < 100; i++) { try { browser = await fetch('http://127.0.0.1:15308/json/version').then(r => r.json()); break } catch { await new Promise(r => setTimeout(r, 100)) } }
    if (!browser) throw Error('Chrome did not start')
    ws = new WebSocket(browser.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject })
    let nextId = 1; const pending = new Map()
    const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = nextId++; const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP timeout: ${method}`)) }, 20000); pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params, sessionId })) })
    ws.onmessage = async event => {
      const m = JSON.parse(event.data)
      if (m.id) { const p = pending.get(m.id); if (p) { clearTimeout(p.timer); pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result) } }
      if (m.method === 'Runtime.exceptionThrown') failures.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text)
      if (m.method === 'Fetch.requestPaused') {
        const req = m.params.request; let body
        try { body = fixture(req.url, req.method, req.postData ? JSON.parse(req.postData) : undefined) } catch (e) { failures.push(e.message); body = { error: e.message } }
        await send('Fetch.fulfillRequest', { requestId: m.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'application/json' }], body: Buffer.from(JSON.stringify(body)).toString('base64') }, m.sessionId)
      }
    }
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' }); const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true })
    const call = (method, params) => send(method, params, sessionId)
    await call('Runtime.enable'); await call('Page.enable'); await call('Fetch.enable', { patterns: [{ urlPattern: 'http://127.0.0.1:15307/api/*' }] })
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
    const evaluate = async expression => { const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (result.exceptionDetails) throw Error(result.exceptionDetails.text); return result.result.value }
    const wait = async expression => { for (let i = 0; i < 150; i++) { if (await evaluate(expression)) return; await new Promise(r => setTimeout(r, 100)) } throw Error('Browser wait timeout: ' + expression) }
    const click = text => evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)})?.click()`)
    const screen = async name => { const { data } = await call('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(artifacts, name + '.png'), Buffer.from(data, 'base64')) }
    await call('Page.navigate', { url: 'http://127.0.0.1:15307/pms-rework-preview.local.html' })
    await wait(`document.body.textContent.includes('Kiểm tra và bảo dưỡng máy bơm cứu hỏa')`)
    assert.equal(await evaluate(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Thêm công việc');const s=getComputedStyle(b);return s.color!==s.backgroundColor})()`), true)
    await screen('job-list')
    await evaluate(`document.querySelector('details summary').click();(()=>{const el=document.querySelector('input[aria-label="Hạn tới từ ngày"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'2026-10-26');el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await wait(`document.querySelector('input[aria-label="Hạn tới từ ngày"]').value==='2026-10-26'`)
    await new Promise(r=>setTimeout(r,600));assert.equal(new URL(requests.filter(r=>r.path==='/api/pms/jobs').at(-1).url).searchParams.get('dueFrom'),'2026-10-25T17:00:00.000Z')
    await click('Xóa lọc ngày');await evaluate(`document.querySelector('details summary').click()`)
    await click('Thêm công việc'); await wait(`!!document.querySelector('[role=dialog]')`)
    await evaluate(`(()=>{const el=document.querySelector('#pms-job-form input');el.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'TEST');el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    assert.equal(await evaluate(`document.activeElement===document.querySelector('#pms-job-form input')`), true)
    await screen('job-form')
    await evaluate(`(()=>{const el=document.querySelectorAll('#pms-job-form input')[1];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'Preview test');el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await click('Xem trước và lưu'); await wait(`document.body.textContent.includes('Ảnh hưởng sau khi lưu')`)
    assert.equal(requests.some(r => r.path === '/api/pms/jobs' && r.method === 'POST'), false)
    await screen('job-impact')
    await evaluate(`(()=>{const el=document.querySelector('#pms-job-form input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'TEST-EDITED');el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await wait(`!document.body.textContent.includes('Ảnh hưởng sau khi lưu')`)
    await click('Xem trước và lưu'); await wait(`document.body.textContent.includes('Ảnh hưởng sau khi lưu')`)
    await click('Xác nhận lưu'); await wait(`!document.querySelector('[role=dialog]')`)
    assert.equal(requests.find(r => r.path === '/api/pms/jobs' && r.method === 'POST').body.code, 'TEST-EDITED')
    await evaluate(`document.querySelector('button[aria-label="Lịch sử bảo trì"]').click()`); await wait(`document.body.textContent.includes('WO-FIRE-PUMP-001')`)
    await evaluate(`document.querySelector('button[aria-label="Xem báo cáo"]').click()`); await wait(`document.body.textContent.includes('Gioăng bơm')`); await screen('maintenance-report')
    await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' }); await wait(`document.querySelectorAll('[role=dialog]').length===1`)
    await evaluate(`document.querySelector('button[aria-label="Đóng"]').click()`)
    await click('Work Order'); await wait(`document.body.textContent.includes('Chờ duyệt')`); await screen('work-orders')
    await click('Lịch'); await wait(`document.body.textContent.includes('T2') && document.body.textContent.includes('Hiển thị WO có hạn ngày')`); await screen('calendar')
    await click('Gantt chart'); await wait(`document.body.textContent.includes('Tên công việc / mốc hạn')`); await screen('gantt')
    await click('Counter'); await wait(`document.body.textContent.includes('Giờ chạy hiện tại')`); await screen('counter')
    await evaluate(`window.testNavigate('/pms/work-orders/${woId}/review')`); await wait(`document.body.textContent.includes('Gioăng bơm')`)
    assert.equal(await evaluate(`document.body.textContent.includes('Lưu kết quả')`), false)
    await click('Trả lại'); await wait(`document.body.textContent.includes('Nhập lại mật khẩu')`)
    await evaluate(`(()=>{const p=document.querySelector('input[type=password]');const r=document.querySelector('[aria-label="Ký xác nhận"] textarea');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(p,'fixture-password');p.dispatchEvent(new Event('input',{bubbles:true}));Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(r,'Kiểm tra lại áp suất');r.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('[aria-label="Ký xác nhận"] input[type=checkbox]').click()})()`)
    await click('Xác nhận'); await wait(`document.body.textContent.includes('Cần làm lại')`)
    const returned = requests.find(r => r.path.endsWith('/return')); assert.equal(returned.body.reason, 'Kiểm tra lại áp suất'); assert.equal(returned.body.reportHash, 'report-hash')
    state = 'IN_PROGRESS'; version++
    await evaluate(`window.testUser(true);window.testNavigate('/pms/work-orders/${woId}/execute')`); await wait(`document.body.textContent.includes('Lưu kết quả')`); await screen('execution')
    await evaluate(`(()=>{document.querySelector('input[aria-label="Hoàn tất Đo áp suất bơm"]').click();const el=document.querySelector('input[aria-label="Số đo Đo áp suất bơm"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'5');el.dispatchEvent(new Event('input',{bubbles:true}))})()`)
    await click('Gửi kiểm tra'); await wait(`!!document.querySelector('h1') && document.querySelector('h1').textContent.includes('Chi tiết WO')`)
    const submitted = requests.find(r => r.path.endsWith('/submit')); assert.equal(submitted.body.actualDurationMinutes, 90); assert.equal(submitted.body.checklist[0].reading, 5); assert.equal(submitted.body.checklist[0].completed, true); assert.ok(submitted.body.commandId); assert.equal('photos' in submitted.body, false)
    await evaluate(`window.testUser(false,true);window.testNavigate('/pms/work-planning')`); await wait(`!!document.querySelector('nav[aria-label="PMS"]') && document.body.textContent.includes('Kiểm tra và bảo dưỡng máy bơm cứu hỏa')`)
    assert.equal(await evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Thêm công việc'))`), false)
    await call('Emulation.setDeviceMetricsOverride', { width: 900, height: 780, deviceScaleFactor: 1, mobile: false }); await screen('readonly-responsive')
    await click('Counter'); await wait(`document.body.textContent.includes('Giờ chạy hiện tại')`); assert.equal(await evaluate(`!!document.querySelector('input[aria-label^="Giờ chạy mới"]')`), false)
    assert.deepEqual(failures, [])
    fs.writeFileSync(path.join(artifacts, 'browser-summary.json'), JSON.stringify({ checks: ['job-list', 'column-date-filter', 'job-form-focus-and-contrast', 'job-impact-no-write-before-confirmation', 'job-impact-invalidated-after-edit', 'history-report', 'nested-dialog-escape', 'work-orders', 'calendar', 'gantt', 'counter', 'review-readonly', 'signed-return-reason', 'execution', 'submit-hours-to-minutes', 'readonly-permissions', 'responsive', 'readonly-counter'], requests: requests.map(r => ({ path: r.path, method: r.method })), failures }, null, 2))
    console.log('PMS browser smoke: 18 checks passed; screenshots in ' + artifacts)
    await send('Browser.close')
  } finally {
    ws?.close(); chrome.kill(); await server.close(); fs.rmSync(html, { force: true })
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
