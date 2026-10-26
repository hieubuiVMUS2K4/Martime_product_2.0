import { prepareApproval } from './approval'
import { API_CONFIG } from '@/config/app.config'

// ─── Auth Token Provider ──────────────────────────────────
// Lazy import to avoid circular dependency with auth.store
type TokenProvider = () => string | null
type AccountNameProvider = () => string | null
type UnauthorizedHandler = (token: string) => Promise<boolean>

let _getToken: TokenProvider | null = null
let _getAccountName: AccountNameProvider | null = null
let _onUnauthorized: UnauthorizedHandler | null = null
let _pmsDataset: { token: string | null; id: string } | null = null
let _pmsDatasetChanged = false
let _pmsSettingsLoaded = false

/** Register auth token provider (called from auth store init) */
export function registerAuthProvider(
  getToken: TokenProvider,
  getAccountName: AccountNameProvider,
  onUnauthorized: UnauthorizedHandler
) {
  _getToken = getToken
  _getAccountName = getAccountName
  _onUnauthorized = onUnauthorized
}

/** Get current auth token (used by other service modules to inject Bearer header) */
export function getAuthToken(): string | null {
  return _getToken?.() ?? null
}

/** Get current account name for backend audit headers */
export function getCurrentAccountName(): string | null {
  const accountName = _getAccountName?.()?.trim()
  return accountName ? accountName : null
}

export class ApiClient {
  private baseURL: string
  private timeout: number

  constructor() {
    this.baseURL = API_CONFIG.BASE_URL
    this.timeout = API_CONFIG.TIMEOUT
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryAuth = true
  ): Promise<T> {
    if (_pmsDatasetChanged && options.method && options.method !== 'GET' && /^\/pms\/(jobs|work-orders)(\/|\?|$)/.test(endpoint)) {
      throw Object.assign(new Error('Bộ dữ liệu PMS đã thay đổi. Hãy tải lại trang trước khi tiếp tục; dữ liệu đang nhập chưa được gửi.'), { response: { status: 409 } })
    }
    if (options.method && options.method !== 'GET' && /^\/pms\/(jobs|work-orders)(\/|\?|$)/.test(endpoint) &&
      _pmsDataset?.token === (_getToken?.() ?? null)) {
      options = { ...options, headers: { ...options.headers, 'X-Pms-Dataset-Id': _pmsDataset.id } }
    }
    if (retryAuth && options.method && options.method !== "GET") {
      const proof = await prepareApproval(endpoint, typeof options.body === "string" ? JSON.parse(options.body) : undefined, _getToken?.() ?? null)
      if (/^\/pms\/work-orders\/[^/]+\/(approve|return)$/.test(endpoint) && typeof options.body === 'string' && proof['X-Approval-Reason'] != null) {
        // The reason confirmed with the signature must be the same as the report's decision reason.
        options = { ...options, body: JSON.stringify({ ...JSON.parse(options.body), reason: decodeURIComponent(proof['X-Approval-Reason']) }) }
      }
      options = { ...options, headers: { ...options.headers, ...proof } }
    }
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.timeout)

    // Inject auth token if available
    const authHeaders: Record<string, string> = {}
    const token = _getToken?.()
    if (token) {
      authHeaders['Authorization'] = `Bearer ${token}`
    }

    const accountName = getCurrentAccountName()
    if (accountName) {
      authHeaders['X-User-Name'] = accountName
    }

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        ...options,
        signal: controller.signal,
        headers: {
          ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
          ...authHeaders,
          ...options.headers,
        },
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        // Confirm session failure before clearing auth; old responses cannot clear a newer login.
        const isAuthEndpoint = endpoint.startsWith('/auth/')
        if (response.status === 401 && token && _onUnauthorized && !isAuthEndpoint && retryAuth) {
          const currentToken = _getToken?.()
          if ((currentToken && currentToken !== token) ||
              (currentToken === token && await _onUnauthorized(token))) {
            return this.request<T>(endpoint, options, false)
          }
        }

        // Try to parse error response body for more details
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`
        let validationErrors: Record<string, string[]> | null = null
        
        try {
          const errorData = await response.json()
          
          // Handle ASP.NET Core ModelState validation errors
          // Format: { "FieldName": ["Error 1", "Error 2"], ... }
          // or { "errors": { "FieldName": ["Error 1"], ... }, "title": "...", "status": 400 }
          if (errorData.errors && typeof errorData.errors === 'object') {
            validationErrors = errorData.errors
            const errorMessages: string[] = []
            Object.entries(errorData.errors).forEach(([field, messages]) => {
              if (Array.isArray(messages)) {
                messages.forEach((msg: string) => {
                  // Make field names more readable
                  const readableField = field
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/^./, str => str.toUpperCase())
                    .trim()
                  errorMessages.push(`${readableField}: ${msg}`)
                })
              }
            })
            errorMessage = errorMessages.length > 0 
              ? `Validation failed:\n• ${errorMessages.join('\n• ')}`
              : errorData.title || 'Validation failed'
          } 
          // Handle direct validation errors without "errors" wrapper
          else if (typeof errorData === 'object' && !errorData.error && !errorData.message) {
            const keys = Object.keys(errorData).filter(k => k !== 'type' && k !== 'title' && k !== 'status' && k !== 'traceId')
            if (keys.length > 0 && Array.isArray(errorData[keys[0]])) {
              validationErrors = errorData as Record<string, string[]>
              const errorMessages: string[] = []
              keys.forEach(field => {
                const messages = errorData[field]
                if (Array.isArray(messages)) {
                  messages.forEach((msg: string) => {
                    const readableField = field
                      .replace(/([A-Z])/g, ' $1')
                      .replace(/^./, str => str.toUpperCase())
                      .trim()
                    errorMessages.push(`${readableField}: ${msg}`)
                  })
                }
              })
              errorMessage = `Validation failed:\n• ${errorMessages.join('\n• ')}`
            }
          }
          // Handle simple error object
          else if (errorData.error) {
            errorMessage = errorData.error
          } else if (errorData.message) {
            errorMessage = errorData.message
          } else if (errorData.title) {
            errorMessage = errorData.title
          }
        } catch {
          // If JSON parsing fails, use default error message
        }
        
        const error: any = new Error(errorMessage)
        error.response = { status: response.status, data: { error: errorMessage } }
        error.validationErrors = validationErrors
        throw error
      }

      // Handle empty response (204 No Content, etc.)
      const contentType = response.headers.get('content-type')
      if (response.status === 204 || !contentType || !contentType.includes('application/json')) {
        return null as T
      }

      const data = await response.json()
      if (endpoint === '/pms/work-orders/settings') {
        if (_pmsSettingsLoaded && (_pmsDataset?.id ?? null) !== (data.pmsDatasetId ?? null)) _pmsDatasetChanged = true
        if (!_pmsDatasetChanged) _pmsDataset = data.pmsDatasetId ? { token: _getToken?.() ?? null, id: data.pmsDatasetId } : null
        _pmsSettingsLoaded = true
      }
      return data
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Request timeout')
        }
        throw error
      }
      throw new Error('Unknown error occurred')
    }
  }

  async get<T>(endpoint: string, options?: { params?: Record<string, any> }): Promise<T> {
    let url = endpoint
    if (options?.params) {
      const params = new URLSearchParams()
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          params.append(key, String(value))
        }
      })
      const queryString = params.toString()
      if (queryString) {
        url = `${endpoint}?${queryString}`
      }
    }
    return this.request<T>(url, { method: 'GET' })
  }

  async post<T>(endpoint: string, data: unknown, options?: RequestInit): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data instanceof FormData ? data : JSON.stringify(data),
      ...options,
    })
  }

  async put<T>(endpoint: string, data: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async patch<T>(endpoint: string, data: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' })
  }
}

export const apiClient = new ApiClient()
