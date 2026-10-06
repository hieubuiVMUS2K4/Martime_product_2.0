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
  return load('services/api.client.ts', { '@/config/app.config': { API_CONFIG: { BASE_URL: '/api', TIMEOUT: 30000 } } }, { fetch })
}

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
    react: { useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}], useMemo: fn => fn() },
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
    const filters = load('components/pms/equipment-assets-filters.ts', {})
    const asset = { id: 'engine', assetName: 'Test engine', assetCode: 'E001', category: 'ENGINE', status: 'ACTIVE' }
    const table = load('components/pms/EquipmentAssetsTable.tsx', { '@/components/auth/PermissionGate': { PermissionGate: gate } }).EquipmentAssetsTable
    const page = load('pages/PMS/AssetsPage.tsx', { react: hooks,
      '@/components/auth/PermissionGate': { PermissionGate: gate },
      '@/stores/permissions.store': { usePermission: code => permissions.hasPermission(state, code) },
      '@/components/pms/EquipmentAssetsTable': { EquipmentAssetsTable: table },
      '@/components/pms/equipment-assets-filters': filters,
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
