const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

// Exercise the actual store/client with controlled HTTP responses and session storage.
function load(file, imports, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, require: name => imports[name] ?? require(name), console,
    setTimeout: () => 1, clearTimeout: () => {}, navigator: { userAgent: 'test browser' },
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    AbortController, FormData, URLSearchParams, ...globals }, { filename: file })
  return exports
}
const user = { id: 1, username: 'admin', roleCode: 'ADMIN' }
function materialRequestFormFixture(getCatalog) {
  const { renderToStaticMarkup } = require('react-dom/server')
  const slots = []; let cursor = 0
  const hooks = {
    useState: initial => {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }]
    },
    useRef: initial => {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: initial }
      return slots[index]
    },
    useCallback: fn => fn, useEffect: () => {},
  }
  const Page = load('pages/MaterialRequest/MaterialRequestPage.tsx', {
    react: hooks,
    '@/components/common/CatalogSelect': { CatalogSelect: () => null },
    '@/config/catalogs': { UNITS_OF_MEASURE: [] },
    '@/components/auth/PermissionGate': { PermissionGate: ({ children }) => children },
    '@/components/common/DataTable': { DataTable: () => null, TableActions: ({ children }) => children },
    '@/contexts/I18nContext': { useTranslationSafe: () => ({ t: key => key }) },
    '@/config/app.config': { VESSEL_CONFIG: { VESSEL_NAME: 'Test vessel' } },
    '@/services/materialRequest.service': { materialRequestService: {} },
    '@/services/materialService': { materialService: { getCatalog, getItems: async () => [] } },
    '@/services/maritime.service': { maritimeService: { voyage: { getAll: async () => [] } } },
    '@/services/equipment-asset.service': { equipmentAssetService: { getAll: async () => [] } },
  }).default
  const render = () => { cursor = 0; return Page() }
  const buttons = node => !node || typeof node !== 'object' ? [] : [
    ...(node.type === 'button' ? [node] : []),
    ...[].concat(node.props?.children ?? []).flat(Infinity).flatMap(buttons),
  ]
  return {
    html: () => renderToStaticMarkup(render()),
    button: label => {
      const button = buttons(render()).find(node => renderToStaticMarkup(node).includes(label))
      assert.ok(button, `Missing button: ${label}`)
      return button
    },
  }
}

test('new material request opens before a slow catalog resolves; reopening shares the pending load', async () => {
  const wait = deferred(); let calls = 0
  const form = materialRequestFormFixture(() => { calls++; return wait.promise })
  form.button('materialRequests.addNew').props.onClick()
  assert.match(form.html(), /Thêm mới yêu cầu vật tư/)
  assert.match(form.html(), /role="status"/)
  assert.equal(form.button('Lưu nháp').props.disabled, true)
  form.button('Hủy bỏ').props.onClick()
  form.button('materialRequests.addNew').props.onClick()
  assert.equal(calls, 1)
  form.button('Hủy bỏ').props.onClick()
  wait.resolve([])
  await new Promise(setImmediate)
  assert.doesNotMatch(form.html(), /Thêm mới yêu cầu vật tư/)
})

test('material request load failure stays in the open form and retry enables saving after recovery', async () => {
  let calls = 0
  const form = materialRequestFormFixture(() => ++calls === 1 ? Promise.reject(new Error('Offline')) : Promise.resolve([]))
  form.button('materialRequests.addNew').props.onClick()
  await new Promise(setImmediate)
  assert.match(form.html(), /Thêm mới yêu cầu vật tư/)
  assert.match(form.html(), /role="alert"/)
  assert.equal(form.button('Lưu nháp').props.disabled, true)
  form.button('Thử lại').props.onClick()
  await new Promise(setImmediate)
  assert.equal(calls, 2)
  assert.doesNotMatch(form.html(), /role="alert"|role="status"/)
  assert.equal(form.button('Lưu nháp').props.disabled, false)
})

function pollingFixture(task) {
  const timers = new Map(); let nextId = 0
  const { startPolling } = load('lib/polling.ts', {}, {
    setTimeout: (callback, delay) => { timers.set(++nextId, { callback, delay }); return nextId },
    clearTimeout: id => timers.delete(id),
  })
  const stop = startPolling(task, 200)
  const tick = () => {
    const [id, timer] = timers.entries().next().value
    timers.delete(id)
    return timer.callback()
  }
  return { timers, tick, stop }
}

function webWorkFixture(grants, status = 'DUE') {
  const { renderToStaticMarkup } = require('react-dom/server')
  const { permissions, state, gate } = actionPermissions(grants)
  const task = { id: 'task-uuid', taskId: 'WEB-WORK', taskDescription: 'Engine inspection', status,
    priority: 'NORMAL', equipmentAssetId: 'engine', actualRunningHours: 100, actualDuration: 0,
    notes: '', sparePartsUsed: '[]', completionPhotos: '[]', requiredPhotos: 0, checklistItems: [], statusHistory: [] }
  const slots = [task, false]; let cursor = 0; const saves = [], submissions = [], effects = []
  let nextRead = null, poll = null
  const hooks = {
    useState: initial => {
      const index = cursor++
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value }]
    },
    useRef: initial => {
      const index = cursor++
      if (!(index in slots)) slots[index] = { current: initial }
      return slots[index]
    },
    useEffect: (fn, dependencies) => effects.push({ fn, dependencies }), useMemo: fn => fn(), useCallback: fn => fn,
  }
  const Page = load('pages/PMS/WorkReportPage.tsx', {
    react: hooks,
    'react-router-dom': { useParams: () => ({ id: task.id }), useNavigate: () => () => {} },
    '@/components/SigningControls': { SigningControls: () => null },
    '@/components/auth/PermissionGate': { PermissionGate: gate },
    '@/stores/permissions.store': { usePermission: code => permissions.hasPermission(state, code) },
    '@/contexts/I18nContext': { useTranslationSafe: () => ({ t: key => key }) },
    '@/components/pms/DeferralReviewModal': { default: () => null },
    '@/lib/polling': { startPolling: callback => { poll = callback; return () => {} } },
    '../../services/materialService': { materialService: { getItems: async () => [] } },
    '../../services/equipment-asset.service': { equipmentAssetService: { getById: async () => ({ currentRunningHours: 100 }) } },
    '../../services/maritime.service': { maritimeService: { maintenance: { getById: async () => {
      if (nextRead) { const read = nextRead; nextRead = null; return read.promise }
      return { ...task }
    } } } },
    '../../services/maintenance.service': {
      startTask: async () => { task.status = 'IN_PROGRESS' },
      saveTaskProgress: async (id, dto) => { saves.push({ id, dto }); task.notes = dto.notes; task.actualRunningHours = dto.completedRunningHours; task.actualDuration = dto.actualDurationMinutes },
      submitTask: async (id, dto) => { submissions.push({ id, dto }); task.status = 'PENDING_APPROVAL' },
    },
    sonner: { toast: { success: () => {}, error: message => { throw new Error(message) } } },
  }, { document: { hidden: false } }).default
  const render = () => { cursor = 0; effects.length = 0; return Page() }
  const elements = node => !node || typeof node !== 'object' ? [] : [node, ...[].concat(node.props?.children ?? []).flat(Infinity).flatMap(elements)]
  return { task, saves, submissions, html: () => renderToStaticMarkup(render()),
    deferNextRead: () => { nextRead = deferred(); return nextRead },
    poll: () => {
      render()
      effects.find(effect => effect.dependencies?.some(value => typeof value === 'function')).fn()
      assert.ok(poll, 'Viewer polling was not registered')
      return poll()
    },
    button: label => elements(render()).find(node => node.type === 'button' && renderToStaticMarkup(node).includes(label)),
    editReport: value => elements(render()).find(node => node.type === 'textarea' && node.props.onChange).props.onChange({ target: { value } }),
  }
}

test('web executor can start, save and submit without update/approve permission', async () => {
  const form = webWorkFixture(['pms.work.access', 'pms.work.execute'])
  assert.match(form.html(), /pms.workReport.startBtn/)
  assert.doesNotMatch(form.html(), /pms.workReport.approveBtn/)
  assert.equal(form.button('pms.workReport.saveBtn').props.disabled, true)
  await form.button('pms.workReport.startBtn').props.onClick()
  assert.equal(form.task.status, 'IN_PROGRESS')
  assert.equal(form.button('pms.workReport.saveBtn').props.disabled, false)
  form.editReport('Web result')
  await form.button('pms.workReport.saveBtn').props.onClick()
  assert.equal(form.saves[0].dto.notes, 'Web result')
  assert.equal('assignedTo' in form.saves[0].dto, false)
  assert.equal('taskDescription' in form.saves[0].dto, false)
  assert.equal('photoUrls' in form.saves[0].dto, false)
  assert.doesNotMatch(form.html(), /type="file"|pms.workReport.completionPhotos/)
  await form.button('pms.workReport.completeBtn').props.onClick()
  assert.equal(form.submissions.length, 1)
  assert.equal(form.submissions[0].dto.notes, 'Web result')
  assert.equal('photoUrls' in form.submissions[0].dto, false)
  assert.equal(form.task.status, 'PENDING_APPROVAL')
  assert.equal(form.button('pms.workReport.saveBtn').props.disabled, true)
})

test('web read-only and reviewer roles cannot see execution actions', () => {
  for (const grants of [['pms.work.access'], ['pms.work.access', 'pms.work.approve', 'pms.work.reject']]) {
    const form = webWorkFixture(grants, 'PENDING_APPROVAL')
    assert.doesNotMatch(form.html(), /pms.workReport.startBtn|pms.workReport.saveBtn|pms.workReport.completeBtn/)
    assert.equal(form.html().includes('pms.workReport.approveBtn'), grants.includes('pms.work.approve'))
  }
})

test('late viewer polling cannot replace a web executor draft after work has started', async () => {
  const form = webWorkFixture(['pms.work.access', 'pms.work.execute'])
  const wait = form.deferNextRead()
  const oldTask = { ...form.task, notes: 'Old server notes' }
  const polling = form.poll()
  await form.button('pms.workReport.startBtn').props.onClick()
  form.editReport('Unsaved execution result')
  wait.resolve(oldTask)
  await polling
  await form.button('pms.workReport.saveBtn').props.onClick()
  assert.equal(form.saves[0].dto.notes, 'Unsaved execution result')
  assert.equal(form.task.status, 'IN_PROGRESS')
})

test('telemetry polling waits for an in-flight request instead of starting overlapping reads', async () => {
  const wait = deferred(); let calls = 0
  const polling = pollingFixture(() => { calls++; return wait.promise })
  const request = polling.tick()
  assert.equal(calls, 1)
  assert.equal(polling.timers.size, 0)
  wait.resolve()
  await request
  assert.equal(polling.timers.size, 1)
  polling.stop()
})

for (const status of [401, 403]) test(`telemetry polling stops after HTTP ${status}`, async () => {
  const polling = pollingFixture(async () => { throw { response: { status } } })
  await polling.tick()
  assert.equal(polling.timers.size, 0)
})

test('telemetry polling backs off on throttling and does not restart after unmount', async () => {
  const polling = pollingFixture(async () => { throw { response: { status: 429 } } })
  await polling.tick()
  assert.equal([...polling.timers.values()][0].delay, 30000)
  polling.stop()
  assert.equal(polling.timers.size, 0)
  const wait = deferred()
  const pending = pollingFixture(() => wait.promise)
  const request = pending.tick()
  pending.stop()
  wait.resolve()
  await request
  assert.equal(pending.timers.size, 0)
})

function fixture(overrides = {}) {
  const service = {
    validateSession: async () => ({ isValid: true, user }),
    login: async () => ({ success: true, accessToken: 'new-login', refreshToken: 'new-refresh', expiresIn: 600, user }),
    refreshToken: async () => ({ success: true, accessToken: 'renewed', refreshToken: 'renewed-refresh', expiresIn: 600, user }),
    logout: async () => ({}), ...overrides,
  }
  const store = load('stores/auth.store.ts', { '@/services/auth.service': { authService: service } }).useAuthStore
  store.setState({ user, accessToken: 'existing', storedRefreshToken: 'refresh',
    expiresAt: Date.now() + 600000, isAuthenticated: true, isLoading: false })
  return store
}
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function unauthorized() { return Object.assign(new Error('Unauthorized'), { response: { status: 401 } }) }
function client(fetch) {
  const config = { API_CONFIG: { BASE_URL: '/api', TIMEOUT: 30000 } }
  const approval = load('services/approval.ts', { '@/config/app.config': config }, { fetch, crypto: require('node:crypto').webcrypto })
  return load('services/api.client.ts', { '@/config/app.config': config, './approval': approval }, { fetch })
}

test('approval proof uses reviewed server identity and version; credentials remain transient headers', async () => {
  const context = { actor: { name: 'Officer', rank: 'Master', username: 'officer' }, module: 'sms', recordKey: 'record', action: 'approve', version: 4, revision: 2, contentHash: 'reviewed-hash', snapshot: { title: 'Reviewed content' } }
  const approval = load('services/approval.ts', { '@/config/app.config': { API_CONFIG: { BASE_URL: '/api' } } }, {
    fetch: async (url, options) => { assert.equal(url, '/api/approvals/sms/record/context?action=approve'); assert.equal(options.headers.Authorization, 'Bearer session'); return { ok: true, json: async () => context } }, crypto: require('node:crypto').webcrypto,
  })
  approval.registerApprovalConfirmation(async value => { assert.equal(value.actor.username, 'officer'); assert.equal(value.snapshot.title, 'Reviewed content'); return { password: 'transient-password', reason: 'Checked' } })
  const headers = await approval.prepareApproval('/sms/records/record/approve', {}, 'session')
  assert.equal(headers['X-Approval-Hash'], 'reviewed-hash')
  assert.equal(headers['X-Approval-Version'], '4')
  assert.equal(headers['X-Approval-Password'], 'transient-password')
  assert.match(headers['X-Approval-Idempotency-Key'], /^[0-9a-f-]{36}$/)
})

test('approval permission failure does not open a confirmation dialog', async () => {
  const approval = load('services/approval.ts', { '@/config/app.config': { API_CONFIG: { BASE_URL: '/api' } } }, { fetch: async () => ({ ok: false, json: async () => ({ message: 'No authority' }) }) })
  approval.registerApprovalConfirmation(() => { throw new Error('Must not open') })
  await assert.rejects(() => approval.prepareApproval('/tasks/task/verify', { action: 'REJECT' }, 'session'), /No authority/)
})

for (const [status, message] of [
  [403, 'Mật khẩu xác nhận không đúng hoặc tài khoản đang khóa.'],
  [403, 'Bạn không có quyền ký hồ sơ này.'],
  [409, 'Hồ sơ đã thay đổi. Tải lại và kiểm tra nội dung trước khi ký.'],
  [429, 'Quá nhiều lần sai mật khẩu. Thử lại sau 5 phút.'],
]) test(`signing feedback preserves backend reason: ${message}`, async () => {
  const config = { API_CONFIG: { BASE_URL: '/api', TIMEOUT: 30000 } }
  const fetch = async url => url.includes('/context?')
    ? { ok: true, json: async () => ({ actor: {}, version: 1, contentHash: 'hash' }) }
    : { ok: false, status, statusText: 'Signing failed', json: async () => ({ message }) }
  const approval = load('services/approval.ts', { '@/config/app.config': config }, { fetch, crypto: require('node:crypto').webcrypto })
  approval.registerApprovalConfirmation(async () => ({ password: 'test-only', reason: '' }))
  const { apiClient } = load('services/api.client.ts', { '@/config/app.config': config, './approval': approval }, { fetch })
  const errors = []
  const { reportSigningError } = load('lib/signingFeedback.ts', { sonner: { toast: { error: value => errors.push(value), info: () => assert.fail('Not a cancellation') } } })
  try {
    await apiClient.post('/voyage-log/record/sign', {})
    assert.fail('Must fail')
  } catch (error) {
    reportSigningError(error, 'Failed to sign entry')
  }
  assert.deepEqual(errors, [message])
})

test('cancelled signing sends no mutation and displays informational feedback', async () => {
  const config = { API_CONFIG: { BASE_URL: '/api', TIMEOUT: 30000 } }
  let requests = 0
  const fetch = async () => { requests++; return { ok: true, json: async () => ({ actor: {} }) } }
  const approval = load('services/approval.ts', { '@/config/app.config': config }, { fetch })
  approval.registerApprovalConfirmation(async () => { throw new approval.ApprovalCancelledError() })
  const { apiClient } = load('services/api.client.ts', { '@/config/app.config': config, './approval': approval }, { fetch })
  const information = []
  const { reportSigningError } = load('lib/signingFeedback.ts', { sonner: { toast: { error: () => assert.fail('Cancellation is not an error'), info: value => information.push(value) } } })
  await assert.rejects(() => apiClient.post('/voyage-log/record/sign', {}), error => {
    reportSigningError(error)
    return error.name === 'ApprovalCancelledError'
  })
  assert.equal(requests, 1)
  assert.deepEqual(information, ['Đã hủy ký xác nhận.'])
})

test('reload restores a stored authenticated session; duplicate guards share validation', async () => {
  const wait = deferred(); let calls = 0
  const store = fixture({ validateSession: () => { calls++; return wait.promise } })
  store.setState({ isAuthenticated: false, isLoading: true })
  const first = store.getState().initializeAuth()
  const second = store.getState().initializeAuth()
  assert.equal(first, second)
  wait.resolve({ isValid: true, user })
  await first
  assert.equal(calls, 1)
  assert.equal(store.getState().isAuthenticated, true)
  assert.equal(store.getState().isLoading, false)
  await store.getState().initializeAuth()
  assert.equal(calls, 1)
})

test('late validation cannot remove a successful new login', async () => {
  const wait = deferred()
  const store = fixture({ validateSession: () => wait.promise })
  const validation = store.getState().initializeAuth()
  assert.equal(await store.getState().login('admin', 'test'), true)
  wait.resolve({ isValid: false })
  await validation
  assert.equal(store.getState().accessToken, 'new-login')
  assert.equal(store.getState().isAuthenticated, true)
  assert.equal(store.getState().isLoading, false)
})

test('late validation after logout cannot restore the ended session', async () => {
  const wait = deferred()
  const store = fixture({ validateSession: () => wait.promise })
  const validation = store.getState().initializeAuth()
  await store.getState().logout('User logout')
  wait.resolve({ isValid: true, user })
  await validation
  assert.equal(store.getState().accessToken, null)
  assert.equal(store.getState().isAuthenticated, false)
})

test('a business 401 with a valid session does not log out the user', async () => {
  const store = fixture()
  assert.equal(await store.getState().recoverSession('existing'), false)
  assert.equal(store.getState().isAuthenticated, true)
  assert.equal(store.getState().accessToken, 'existing')
})

test('parallel expired requests share token refresh', async () => {
  const wait = deferred(); let calls = 0
  const store = fixture({ refreshToken: () => { calls++; return wait.promise } })
  const first = store.getState().doRefreshToken()
  const second = store.getState().doRefreshToken()
  assert.equal(first, second)
  wait.resolve({ success: true, accessToken: 'rotated', refreshToken: 'rotated-refresh', expiresIn: 600, user })
  assert.equal(await first, true)
  assert.equal(calls, 1)
  assert.equal(store.getState().accessToken, 'rotated')
})

test('expired access token refreshes without losing the session', async () => {
  const store = fixture()
  store.setState({ expiresAt: Date.now() - 1000 })
  assert.equal(await store.getState().recoverSession('existing'), true)
  assert.equal(store.getState().accessToken, 'renewed')
  assert.equal(store.getState().isAuthenticated, true)
})

test('a previously initialized session still refreshes after expiry', async () => {
  const store = fixture()
  await store.getState().login('admin', 'test')
  store.setState({ expiresAt: Date.now() - 1000 })
  await store.getState().initializeAuth()
  assert.equal(store.getState().accessToken, 'renewed')
  assert.equal(store.getState().isAuthenticated, true)
})

test('late failed refresh cannot clear a new login', async () => {
  const wait = deferred()
  const store = fixture({ refreshToken: () => wait.promise })
  const pending = store.getState().doRefreshToken()
  await store.getState().login('admin', 'test')
  wait.reject(unauthorized())
  await pending
  assert.equal(store.getState().accessToken, 'new-login')
  assert.equal(store.getState().isAuthenticated, true)
})

test('confirmed revoked session and rejected refresh clear authentication', async () => {
  const store = fixture({ validateSession: async () => { throw unauthorized() }, refreshToken: async () => { throw unauthorized() } })
  assert.equal(await store.getState().recoverSession('existing'), false)
  assert.equal(store.getState().accessToken, null)
  assert.equal(store.getState().isAuthenticated, false)
})

test('network failures during validation do not erase credentials', async () => {
  const store = fixture({ validateSession: async () => { throw new Error('Network offline') } })
  await store.getState().initializeAuth()
  await store.getState().recoverSession('existing')
  assert.equal(store.getState().accessToken, 'existing')
  assert.equal(store.getState().isAuthenticated, true)
})

test('temporary refresh failure on reload preserves the stored session instead of redirecting to login', async () => {
  const store = fixture({ refreshToken: async () => { throw { response: { status: 503 } } } })
  store.setState({ expiresAt: Date.now() - 1000, isAuthenticated: false, isLoading: true })
  await store.getState().initializeAuth()
  assert.equal(store.getState().accessToken, 'existing')
  assert.equal(store.getState().storedRefreshToken, 'refresh')
  assert.equal(store.getState().isAuthenticated, true)
  assert.equal(store.getState().isLoading, false)
})

test('503 during validation keeps persisted credentials on reload', async () => {
  const store = fixture({ validateSession: async () => { throw { response: { status: 503 } } } })
  store.setState({ isAuthenticated: false, isLoading: true })
  await store.getState().initializeAuth()
  assert.equal(store.getState().accessToken, 'existing')
  assert.equal(store.getState().isAuthenticated, true)
})

test('403 is a permission failure and never invokes session recovery', async () => {
  let recoveryCalls = 0
  const api = client(async () => new Response('{"error":"Forbidden"}', { status: 403, headers: { 'Content-Type': 'application/json' } }))
  api.registerAuthProvider(() => 'valid', () => 'crew', async () => { recoveryCalls++; return false })
  await assert.rejects(api.apiClient.get('/permissions/ranks'), e => e.response.status === 403)
  assert.equal(recoveryCalls, 0)
})

test('an old 401 retries with the new token and cannot log out the new session', async () => {
  let token = 'old'; let calls = 0; let recoveryCalls = 0
  const api = client(async (_url, options) => {
    calls++
    if (calls === 1) { token = 'new'; return new Response('{}', { status: 401 }) }
    assert.equal(options.headers.Authorization, 'Bearer new')
    return new Response('{"ok":true}', { headers: { 'Content-Type': 'application/json' } })
  })
  api.registerAuthProvider(() => token, () => 'crew', async () => { recoveryCalls++; return false })
  const result = await api.apiClient.get('/permissions/me')
  assert.equal(result.ok, true)
  assert.equal(recoveryCalls, 0)
  assert.equal(calls, 2)
})

test('401 recovery retries once, without an infinite login/request loop', async () => {
  let calls = 0; let recoveries = 0
  const api = client(async () => { calls++; return new Response('{}', { status: 401 }) })
  api.registerAuthProvider(() => 'valid', () => 'crew', async () => { recoveries++; return true })
  await assert.rejects(api.apiClient.get('/ship-data'), e => e.response.status === 401)
  assert.equal(calls, 2)
  assert.equal(recoveries, 1)
})

test('/admin and /admin/ resolve to the account route instead of dashboard/login', () => {
  const router = require('react-router-dom')
  const component = () => null
  const app = load('App.tsx', {}, { require: name => ['react', 'react/jsx-runtime', 'react-router-dom'].includes(name) ? require(name)
    : new Proxy({}, { get: () => component }) }).default()
  const routesElement = app.props.children.find(child => child?.type === router.Routes)
  const routes = router.createRoutesFromChildren(routesElement.props.children)
  for (const location of ['/admin', '/admin/', '/admin/unknown']) {
    const matches = router.matchRoutes(routes, location)
    const element = matches.at(-1).route.element
    assert.equal(element.type, router.Navigate)
    assert.equal(element.props.to, '/admin/accounts')
  }
})

test('dashboard remains the landing page without grants or when permissions are still loading', () => {
  const router = require('react-router-dom')
  const permissions = { loaded: false, error: null, modules: [], grants: [] }
  const guard = load('components/auth/PermissionGuard.tsx', {
    react: { useEffect: () => {} },
    'react-router-dom': { Navigate: router.Navigate, useLocation: () => ({ pathname: '/dashboard' }) },
    '@/stores/permissions.store': { usePermissionsStore: () => permissions, canOpen: () => false },
    '@/stores/auth.store': { useAuthStore: selector => selector({ accessToken: 'crew-token' }) },
  }).PermissionGuard({ children: 'dashboard-content' })
  assert.equal(guard.props.children, 'dashboard-content')
})

test('dashboard is always open while protected modules still require configured access', () => {
  const permissions = load('stores/permissions.store.ts', { '@/services/api.client': { apiClient: {} } })
  assert.equal(permissions.canOpen('/dashboard'), true)
  assert.equal(permissions.canOpen('/logbooks/deck'), false)
  permissions.usePermissionsStore.setState({ loaded: true, modules: [{ code: 'logbooks.deck', routes: ['/logbooks/deck'] }],
    grants: ['logbooks.deck.access', 'logbooks.deck.view'] })
  assert.equal(permissions.canOpen('/logbooks/deck'), true)
})

for (const allowedLogbook of [false, true]) test(`sidebar hides empty logbook group; permitted child=${allowedLogbook}`, () => {
  const React = require('react')
  const { renderToStaticMarkup } = require('react-dom/server')
  const sidebar = load('components/layouts/Sidebar.tsx', {
    react: { useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], useMemo: fn => fn(), useEffect: () => {} },
    'react-router-dom': { useLocation: () => ({ pathname: '/dashboard' }),
      NavLink: ({ children }) => React.createElement('a', null, typeof children === 'function' ? children({ isActive: false }) : children) },
    '@/stores/permissions.store': { usePermissionsStore: () => ({ grants: [], modules: [], loaded: true, isAdmin: false }),
      canOpen: path => path === '/dashboard' || (allowedLogbook && path === '/logbooks/deck') },
    '@/contexts/I18nContext': { useTranslationSafe: () => ({ t: key => key }) },
  }).Sidebar()
  const html = renderToStaticMarkup(sidebar)
  assert.equal(html.includes('nav.logbooks'), allowedLogbook)
  assert.equal(html.includes('nav.dashboard'), true)
})

function actionPermissions(grants, isAdmin = false) {
  const permissions = load('stores/permissions.store.ts', { '@/services/api.client': { apiClient: {} } })
  const registry = JSON.parse(fs.readFileSync(path.join(__dirname, '../../edge-services/permissions.registry.json'), 'utf8'))
  const state = { grants, isAdmin, loaded: true, error: null, modules: registry.modules }
  const gate = load('components/auth/PermissionGate.tsx', {
    '@/stores/permissions.store': { usePermission: code => permissions.hasPermission(state, code) },
  }).PermissionGate
  return { permissions, state, gate }
}

test('receipt completion is visible but disabled before approval, enabled after approval, and gated by execute', () => {
  const { renderToStaticMarkup } = require('react-dom/server')
  const { state, gate } = actionPermissions(['pms.receipts.access', 'pms.receipts.execute'])
  const Button = load('pages/StockReceipt/ReceiptCompletionButton.tsx', {
    '@/components/auth/PermissionGate': { PermissionGate: gate },
  }).ReceiptCompletionButton
  const draft = renderToStaticMarkup(Button({ status: 'Draft', onComplete: () => {} }))
  assert.equal(draft.includes('Hoàn tất nhập kho'), true)
  assert.equal(draft.includes('disabled=""'), true)
  assert.equal(draft.includes('Cần duyệt phiếu nhập trước'), true)
  const approved = renderToStaticMarkup(Button({ status: 'Approved', onComplete: () => {} }))
  const submitted = renderToStaticMarkup(Button({ status: 'Submitted', onComplete: () => {} }))
  assert.equal(submitted.includes('disabled=""'), true)
  assert.equal(approved.includes('Hoàn tất nhập kho'), true)
  assert.equal(approved.includes('disabled=""'), false)
  assert.equal(renderToStaticMarkup(Button({ status: 'Completed', onComplete: () => {} })), '')
  state.grants = ['pms.receipts.access', 'pms.receipts.update']
  assert.equal(renderToStaticMarkup(Button({ status: 'Approved', onComplete: () => {} })), '')
})

test('company materials remain read-only and receipt update cannot approve or complete', () => {
  const { permissions, state } = actionPermissions(['pms.materials.access', 'pms.materials.assign', 'pms.receipts.access', 'pms.receipts.update'])
  assert.deepEqual(state.modules.find(module => module.code === 'pms.materials').actions, ['view'])
  assert.equal(permissions.hasPermission(state, 'pms.materials.view'), true)
  assert.equal(permissions.hasPermission(state, 'pms.materials.assign'), false)
  assert.equal(permissions.hasPermission(state, 'pms.receipts.approve'), false)
  assert.equal(permissions.hasPermission(state, 'pms.receipts.execute'), false)
  state.grants.push('pms.receipts.approve')
  assert.equal(permissions.hasPermission(state, 'pms.receipts.approve'), true)
  assert.equal(permissions.hasPermission(state, 'pms.receipts.execute'), false)
})

test('access switch grants view only across all modules', () => {
  const { permissions, state } = actionPermissions([])
  for (const module of state.modules) {
    state.grants = [module.code + '.access']
    assert.equal(permissions.hasPermission(state, module.code + '.view'), true)
    for (const action of module.actions.filter(a => a !== 'view'))
      assert.equal(permissions.hasPermission(state, module.code + '.' + action), false, module.code + '.' + action)
  }
})

test('create/delete/import and update/assign are bundles; workflow rights remain separate', () => {
  const { permissions, state } = actionPermissions([])
  for (const module of state.modules) for (const bundle of [['create', 'delete', 'import'], ['update', 'assign']]) {
    for (const selected of bundle.filter(a => module.actions.includes(a))) {
      state.grants = [module.code + '.access', module.code + '.' + selected]
      for (const action of bundle)
        assert.equal(permissions.hasPermission(state, module.code + '.' + action), module.actions.includes(action))
      for (const action of module.actions.filter(a => a !== 'view' && !bundle.includes(a)))
        assert.equal(permissions.hasPermission(state, module.code + '.' + action), false)
      state.grants = [module.code + '.' + selected]
      assert.equal(permissions.hasPermission(state, module.code + '.' + selected), false)
    }
  }
})

for (const grants of [['pms.assets.access'], ['pms.assets.access', 'pms.assets.create'], ['pms.assets.access', 'pms.assets.update']])
  test('equipment UI matches toolbar and row grants: ' + grants.join(', '), () => {
    const { renderToStaticMarkup } = require('react-dom/server')
    const { permissions, state, gate } = actionPermissions(grants)
    const hooks = { useState: value => [typeof value === 'function' ? value() : value, () => {}],
      useMemo: fn => fn(), useCallback: fn => fn, useEffect: () => {}, useRef: current => ({ current }) }
    const dataTable = load('components/common/DataTable/DataTable.tsx', {
      react: { ...require('react'), default: require('react'), ...hooks },
      '@/utils/text': load('utils/text.ts', {}),
      './ColumnFilterMenu': { ColumnFilterMenu: () => null },
      './TablePagination': { TablePagination: () => null },
      './exportTable': { exportToCsv: () => {}, exportToExcel: () => {} },
    })
    const tableActions = load('components/common/DataTable/TableIconButton.tsx', {})
    const asset = { id: 'engine', assetName: 'Test engine', assetCode: 'E001', category: 'ENGINE', status: 'ACTIVE' }
    const table = load('components/pms/EquipmentAssetsTable.tsx', {
      '@/components/auth/PermissionGate': { PermissionGate: gate },
      '@/components/common/DataTable': { ...dataTable, ...tableActions },
    }).EquipmentAssetsTable
    const page = load('pages/PMS/AssetsPage.tsx', { react: hooks,
      '@/components/auth/PermissionGate': { PermissionGate: gate },
      '@/stores/permissions.store': { usePermission: code => permissions.hasPermission(state, code) },
      '@/components/pms/EquipmentAssetsTable': { EquipmentAssetsTable: table },
      '@/services/equipment-asset.service': { getCachedEquipmentTree: () => [asset] },
      '@/components/pms/ImportAssetsModal': { ImportAssetsModal: () => null },
      '@/services/materialService': {}, '@/services/crew.service': {},
      '@/contexts/I18nContext': { useTranslationSafe: () => ({ t: key => key }) },
    }).default
    const html = renderToStaticMarkup(page())
    const canCreate = permissions.hasPermission(state, 'pms.assets.create')
    const canUpdate = permissions.hasPermission(state, 'pms.assets.update')
    assert.equal(html.includes('title="Thêm thiết bị"'), canCreate)
    assert.equal(html.includes('aria-label="Thêm nhóm thiết bị"'), canCreate)
    assert.equal(html.includes('pms.assets.deleteMany'), canCreate)
    assert.equal(html.includes('title="pms.assets.import"'), canCreate)
    assert.equal(html.includes('title="pms.assets.downloadTemplate"'), canCreate)
    assert.equal(html.includes('title="Xóa thiết bị"'), canCreate)
    assert.equal(html.includes('title="Chỉnh sửa thiết bị"'), canUpdate)
    assert.equal(html.includes('title="Vật tư liên kết"'), true)
    assert.equal(html.includes('Test engine'), true)
  })

test('permission gates fail closed during loading/error and react to revoked grants', () => {
  const { permissions, state, gate } = actionPermissions(['pms.assets.access', 'pms.assets.create'])
  assert.equal(gate({ permission: 'pms.assets.create', children: 'add' }).props.children, 'add')
  state.grants = ['pms.assets.access']
  assert.equal(gate({ permission: 'pms.assets.create', children: 'add' }), null)
  state.isAdmin = true
  assert.equal(permissions.hasPermission(state, 'pms.assets.create'), true)
  state.error = 'network failure'
  assert.equal(permissions.hasPermission(state, 'pms.assets.create'), false)
  state.error = null; state.loaded = false
  assert.equal(permissions.hasPermission(state, 'pms.assets.create'), false)
})

test('rank editor uses the access switch for view and grouped action checkboxes', () => {
  const { renderToStaticMarkup } = require('react-dom/server')
  const modules = [{ code: 'pms.assets', name: 'Thiết bị', group: 'Danh mục',
    routes: ['/pms/catalog/assets'], actions: ['view', 'create', 'delete', 'import', 'update', 'assign'] }]
  let grants = new Set(['pms.assets.access', 'pms.assets.view'])
  const overrides = { 0: [{ id: 1, rankName: 'Đại phó', department: 'DECK', version: 0, grants: [] }],
    1: 1, 5: grants, 6: new Set(['pms.assets']), 7: false }
  let index = 0
  const page = load('pages/Admin/RankPermissionsPage.tsx', {
    react: { useEffect: () => {}, useMemo: fn => fn(), useCallback: fn => fn, useRef: current => ({ current }),
      useState: initial => {
        const key = index++
        return [overrides[key] ?? initial, next => { if (key === 5) grants = typeof next === 'function' ? next(grants) : next }]
      } },
    '@/stores/permissions.store': { usePermissionsStore: () => ({ modules, isAdmin: true }) },
    '@/services/api.client': { apiClient: {} },
  }).default()
  const html = renderToStaticMarkup(page)
  assert.equal(html.includes('aria-label="Truy cập / xem Thiết bị"'), true)
  assert.equal(html.includes('aria-label="Xem: Thiết bị"'), false)
  assert.equal(html.includes('aria-label="Import: Thiết bị"'), false)
  assert.equal(html.includes('aria-label="Phân công / liên kết: Thiết bị"'), false)
  const checkboxes = []
  function visit(node) {
    if (Array.isArray(node)) { node.forEach(visit); return }
    if (!node?.props) return
    if (node.props.label && node.props.onChange && node.type?.name === 'PermissionCheckbox') checkboxes.push(node)
    visit(node.props.children)
  }
  visit(page)
  checkboxes.find(c => c.props.label === 'Thêm / xóa: Thiết bị').props.onChange()
  for (const action of ['create', 'delete', 'import']) assert.equal(grants.has('pms.assets.' + action), true)
  checkboxes.find(c => c.props.label === 'Cập nhật: Thiết bị').props.onChange()
  for (const action of ['update', 'assign']) assert.equal(grants.has('pms.assets.' + action), true)
  assert.equal(grants.has('pms.assets.approve'), false)
})

test('read-only drill attachments retain viewing but hide upload and removal', () => {
  const { renderToStaticMarkup } = require('react-dom/server')
  const { permissions, state } = actionPermissions(['drills.access'])
  const zone = load('components/drill/DocumentUploadZone.tsx', {
    react: { useState: initial => [initial, () => {}], useCallback: fn => fn },
    '@/stores/permissions.store': { usePermission: code => permissions.hasPermission(state, code) },
    '@/services/drill.service': {}, '@/config/app.config': { API_CONFIG: { BASE_URL: '/api' } },
  }).DocumentUploadZone
  const props = { documents: [{ name: 'procedure.pdf', url: '/files/procedure.pdf', mimeType: 'application/pdf' }], onChange: () => {} }
  const readOnly = renderToStaticMarkup(zone(props))
  assert.equal(readOnly.includes('type="file"'), false)
  assert.equal(readOnly.includes('title="Remove document"'), false)
  assert.equal(readOnly.includes('href="/files/procedure.pdf"'), true)
  state.grants.push('drills.create')
  const writable = renderToStaticMarkup(zone(props))
  assert.equal(writable.includes('type="file"'), true)
  assert.equal(writable.includes('title="Remove document"'), true)
})

test('all journal and report signing routes require the common confirmation', () => {
  const { approvalTarget } = load('services/approval.ts', { '@/config/app.config': { API_CONFIG: { BASE_URL: '/api' } } })
  const routes = [
    ['/voyage-log/record/sign', 'log-voyage', 'sign'],
    ['/logbooks/deck/record/sign', 'log-deck', 'sign'],
    ['/logbooks/engine/record/sign', 'log-engine', 'sign'],
    ['/logbooks/oil/record/sign', 'log-oil', 'sign'],
    ['/logbooks/watchkeeping/record/sign', 'log-watchkeeping', 'sign'],
    ['/logbooks/garbage/record/sign', 'log-garbage', 'sign'],
    ['/logbooks/garbage/part-i/record/sign', 'log-garbage-i', 'sign'],
    ['/logbooks/garbage/part-ii/record/sign', 'log-garbage-ii', 'sign'],
    ['/logbooks/ballast/record/sign', 'log-ballast', 'sign'],
    ['/reports/record/approve', 'report', 'approve'],
    ['/reports/original/amendments/record/approve', 'report-amendment', 'approve'],
    ['/drill/logs/record/approve', 'drill-log', 'approve'],
    ['/hsqe/documents/record/approve', 'hsqe-document', 'approve'],
    ...['log-abstract-master', 'log-abstract-engineer', 'report-weekly', 'report-monthly', 'report-engineer', 'pms-risk-worker', 'pms-risk-supervisor', 'pms-risk-chief', 'pms-inspection-operator', 'pms-inspection-chief'].map(module => [`/approvals/${module}/record/sign`, module, 'sign']),
  ]
  for (const [path, module, action] of routes) assert.deepEqual(JSON.parse(JSON.stringify(approvalTarget(path, {}))), { module, key: 'record', action })
})
