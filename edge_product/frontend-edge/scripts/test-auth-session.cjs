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

test('crew without dashboard permission is directed to an allowed module', () => {
  const router = require('react-router-dom')
  const permissions = { loaded: true, error: null, modules: [{ routes: ['/dashboard'] }, { routes: ['/pms/catalog/assets'] }] }
  const guard = load('components/auth/PermissionGuard.tsx', {
    react: { useEffect: () => {} },
    'react-router-dom': { Navigate: router.Navigate, useLocation: () => ({ pathname: '/dashboard' }) },
    '@/stores/permissions.store': { usePermissionsStore: () => permissions, canOpen: path => path === '/pms/catalog/assets' },
    '@/stores/auth.store': { useAuthStore: selector => selector({ accessToken: 'crew-token' }) },
  }).PermissionGuard({ children: null })
  assert.equal(guard.type, router.Navigate)
  assert.equal(guard.props.to, '/pms/catalog/assets')
})
