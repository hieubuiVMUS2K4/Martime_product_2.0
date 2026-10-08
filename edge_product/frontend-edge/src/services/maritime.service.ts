import { apiClient, getAuthToken } from './api.client'
import type {
  PositionData,
  NavigationData,
  EngineData,
  GeneratorData,
  TankLevel,
  FuelConsumption,
  EnvironmentalData,
  SafetyAlarm,
  AisData,
  VoyageRecord,
  CrewMember,
  Certificate,
  CrewCertificate,
  Country,
  MaintenanceTask,
  CargoOperation,
  WatchkeepingLog,
  OilRecordBook,
  SyncQueue,
  DashboardStats,
  MaterialCategory,
  MaterialItem,
  PaginatedResponse,
  ServiceRecord,
  CrewLogbookEntry,
} from '@/types/maritime.types'
import type { TaskRiskAssessment, TaskInspectionReport } from '@/types/pms.types'

// ============================================================
// MARITIME SERVICE CLASS (for direct API base URL usage)
// ============================================================

export class MaritimeService {
  private baseUrl: string

  constructor(baseUrl: string = '') {
    // Default to empty string to use Vite proxy
    // Vite will proxy /api/* to http://localhost:5001/api/*
    this.baseUrl = baseUrl
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = this.baseUrl ? `${this.baseUrl}/api${endpoint}` : `/api${endpoint}`
    const isFormDataBody = options?.body instanceof FormData
    
    try {
      const headers: Record<string, string> = {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        ...(options?.headers as Record<string, string> | undefined),
      }

      // Inject auth token for audit trail (user identity in backend)
      const token = getAuthToken()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }

      if (!isFormDataBody) {
        headers['Content-Type'] = 'application/json'
      }

      const response = await fetch(url, {
        ...options,
        headers,
      })

      // Parse response body once
      const contentType = response.headers.get('content-type')
      let data: any
      
      if (contentType && contentType.includes('application/json')) {
        data = await response.json()
      } else {
        data = await response.text()
      }

      if (!response.ok) {
        // Extract error message from response
        const errorMessage = data?.error || data?.message || data || response.statusText
        const errorDetails = data?.details || ''
        
        console.error('❌ API Error:', {
          status: response.status,
          url,
          message: errorMessage,
          details: errorDetails
        })

        // Throw structured error
        const error: any = new Error(errorMessage)
        error.status = response.status
        error.details = errorDetails
        error.data = data
        throw error
      }

      return data
    } catch (error: any) {
      // Network errors or fetch failures
      if (error.message === 'Failed to fetch') {
        console.error('❌ Network Error: Cannot connect to backend. Is the server running?')
        throw new Error('Cannot connect to server. Please check if backend is running.')
      }
      throw error
    }
  }

  telemetry = {
    getLatest: (type: 'position' | 'navigation' | 'environmental') =>
      this.request<any>(`/telemetry/${type}/latest`),
    getEngines: () => this.request<EngineData[]>('/telemetry/engines'),
    getGenerators: () => this.request<GeneratorData[]>('/telemetry/generators'),
    getTanks: () => this.request<TankLevel[]>('/telemetry/tanks'),
    getFuelConsumption: (days: number = 7) =>
      this.request<FuelConsumption[]>(`/telemetry/fuel/consumption?days=${days}`),
    getNearbyVessels: (range: number = 10) =>
      this.request<AisData[]>(`/telemetry/ais/nearby?range=${range}`),
  }

  alarm = {
    getActive: () => this.request<SafetyAlarm[]>('/alarms/active'),
    getHistory: (days: number = 7) =>
      this.request<SafetyAlarm[]>(`/alarms/history?days=${days}`),
    acknowledge: (id: number, acknowledgedBy: string) =>
      this.request(`/alarms/${id}/acknowledge`, {
        method: 'POST',
        body: JSON.stringify({ acknowledgedBy }),
      }),
    resolve: (id: number) =>
      this.request(`/alarms/${id}/resolve`, { method: 'POST' }),
  }

  crew = {
    getAll: (params?: { page?: number; pageSize?: number; search?: string; isOnboard?: boolean }) => {
      const queryParams = new URLSearchParams()
      if (params?.page) queryParams.set('page', params.page.toString())
      if (params?.pageSize) queryParams.set('pageSize', params.pageSize.toString())
      if (params?.search) queryParams.set('search', params.search)
      if (params?.isOnboard !== undefined) queryParams.set('isOnboard', params.isOnboard.toString())
      
      const query = queryParams.toString()
      return this.request<PaginatedResponse<CrewMember>>(`/crew${query ? `?${query}` : ''}`)
    },
    getOnboard: () => this.request<CrewMember[]>('/crew/onboard'),
    getById: (id: string) => this.request<CrewMember>(`/crew/${id}`),
    getPending: () => this.request<CrewMember[]>('/crew/pending'),
    approve: (id: string, reviewChecklist?: string) =>
      this.request<{ message: string; crew: CrewMember }>(`/crew/${id}/approve`, {
        method: 'POST',
        body: JSON.stringify({ reviewChecklist }),
      }),
    hold: (id: string, reviewChecklist?: string, reviewNotes?: string) =>
      this.request<{ message: string; crew: CrewMember }>(`/crew/${id}/hold`, {
        method: 'POST',
        body: JSON.stringify({ reviewChecklist, reviewNotes }),
      }),
    reject: (id: string, reason?: string) =>
      this.request<{ message: string; crew: CrewMember }>(`/crew/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    add: (crew: Partial<CrewMember>) =>
      this.request<CrewMember>('/crew', {
        method: 'POST',
        body: JSON.stringify(crew),
      }),
    update: (id: string, crew: Partial<CrewMember>) =>
      this.request<CrewMember>(`/crew/${id}`, {
        method: 'PUT',
        body: JSON.stringify(crew),
      }),
    delete: (id: string) =>
      this.request<{ message: string; id: string; crewId: string; fullName: string }>(`/crew/${id}`, {
        method: 'DELETE',
      }),
    getExpiringCertificates: (days: number = 90) =>
      this.request<CrewMember[]>(`/crew/expiring-certificates?days=${days}`),
    getTravelDocuments: (crewMemberId: string) =>
      this.request<any[]>(`/crew/${crewMemberId}/travel-documents`),
    createIdentityDocument: (crewMemberId: string, formData: FormData) =>
      this.request<any>(`/crew/${crewMemberId}/identity-documents`, {
        method: 'POST',
        body: formData,
      }),
    updateDocumentFile: (documentId: string, formData: FormData) =>
      this.request<any>(`/crew/identity-documents/${documentId}/file`, {
        method: 'PUT',
        body: formData,
      }),
    /** Cập nhật THÔNG TIN tài liệu. File đính kèm đi đường riêng qua updateDocumentFile. */
    updateIdentityDocument: (documentId: string, data: {
      targetTable: string
      documentType: string
      documentNumber: string
      issueDate?: string | null
      expiryDate?: string | null
      countryId?: number | null
      notes?: string | null
    }) =>
      this.request<any>(`/crew/identity-documents/${documentId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    getSeafarerDocuments: (crewMemberId: string) =>
      this.request<any[]>(`/crew/${crewMemberId}/seafarer-documents`),
    getEmploymentDocuments: (crewMemberId: string) =>
      this.request<any[]>(`/crew/${crewMemberId}/employment-documents`),
    getHealthDocuments: (crewMemberId: string) =>
      this.request<any[]>(`/crew/${crewMemberId}/health-documents`),
    getServiceRecords: (crewMemberId: string) =>
      this.request<ServiceRecord[]>(`/crew/${crewMemberId}/service-records`),
    uploadAvatar: (crewMemberId: string, formData: FormData) =>
      this.request<any>(`/crew/${crewMemberId}/avatar`, {
        method: 'PUT',
        body: formData,
      }),
  }

  logbook = {
    getEntries: (
      crewMemberId: string,
      params?: { search?: string; entryOrigin?: string; entryType?: string; startDate?: string; endDate?: string }
    ) => {
      const q = new URLSearchParams()
      if (params?.search) q.set('search', params.search)
      if (params?.entryOrigin) q.set('entryOrigin', params.entryOrigin)
      if (params?.entryType) q.set('entryType', params.entryType)
      if (params?.startDate) q.set('startDate', params.startDate)
      if (params?.endDate) q.set('endDate', params.endDate)
      const qs = q.toString()
      return this.request<CrewLogbookEntry[]>(`/crew/${crewMemberId}/logbook${qs ? `?${qs}` : ''}`)
    },
    getPendingSync: (crewMemberId: string) =>
      this.request<CrewLogbookEntry[]>(`/crew/${crewMemberId}/logbook/pending-sync`),
    triggerSync: (crewMemberId: string) =>
      this.request<{ message: string; pendingRecords: number }>(`/crew/${crewMemberId}/logbook/sync`, {
        method: 'POST'
      }),
    createEntry: (crewMemberId: string, data: Partial<CrewLogbookEntry>) =>
      this.request<CrewLogbookEntry>(`/crew/${crewMemberId}/logbook`, {
        method: 'POST',
        body: JSON.stringify(data)
      }),
    updateEntry: (crewMemberId: string, entryId: string, data: Partial<CrewLogbookEntry>) =>
      this.request<CrewLogbookEntry>(`/crew/${crewMemberId}/logbook/${entryId}`, {
        method: 'PUT',
        body: JSON.stringify(data)
      }),
    deleteEntry: (crewMemberId: string, entryId: string) =>
      this.request<{ message: string }>(`/crew/${crewMemberId}/logbook/${entryId}`, {
        method: 'DELETE'
      }),

    /** Tàu đề nghị cho thuyền viên xuống tàu — phải chờ bờ duyệt mới có hiệu lực */
    requestSignOff: (
      crewMemberId: string,
      entryId: string,
      data: {
        signOffDate?: string
        portCode?: string
        portName?: string
        reason: string
        requestedBy?: string
        conduct?: string
        remarks?: string
      }
    ) =>
      this.request<CrewLogbookEntry>(`/crew/${crewMemberId}/logbook/${entryId}/request-sign-off`, {
        method: 'POST',
        body: JSON.stringify(data)
      }),

    /** Sau khi bờ từ chối: sửa rồi gửi lại (resubmit=true) hoặc huỷ hẳn (false) */
    signOffFollowUp: (
      crewMemberId: string,
      entryId: string,
      data: {
        resubmit: boolean
        signOffDate?: string
        portCode?: string
        portName?: string
        reason?: string
        requestedBy?: string
      }
    ) =>
      this.request<CrewLogbookEntry>(`/crew/${crewMemberId}/logbook/${entryId}/sign-off-follow-up`, {
        method: 'POST',
        body: JSON.stringify(data)
      }),
  }

  // === CERTIFICATE MANAGEMENT ===
  certificates = {
    getAll: () => this.request<Certificate[]>('/certificates'),
    getById: (id: number) => this.request<Certificate>(`/certificates/${id}`),
    getWithCrewCount: () => this.request<(Certificate & { crewCount: number })[]>('/certificates/with-crew-count'),
    getCertificateCountries: (certificateId: number) => this.request<Country[]>(`/certificates/${certificateId}/countries`),
    // Chức danh (STCW) bắt buộc phải có loại chứng chỉ này — bảng nối rank_certificates.
    getCertificateRanks: (certificateId: number) =>
      this.request<any[]>(`/rank-certificates/certificate/${certificateId}`),
    // Không có create/update/delete LOẠI chứng chỉ: danh mục do bờ làm chủ và phát xuống
    // mọi tàu qua đồng bộ. Tàu chỉ đọc, dùng làm khoá ngoại khi gán chứng chỉ cho thuyền viên.
    getCrewCertificates: (certificateId: number) =>
      this.request<CrewCertificate[]>(`/certificates/${certificateId}/crew-certificates`),
    getCrewCertificatesByCrewId: (crewId: string) =>
      this.request<CrewCertificate[]>(`/certificates/crew/${crewId}`),
    getCrewCertificatesBulk: (crewIds: string[]) =>
      this.request<Record<string, CrewCertificate[]>>(`/certificates/crew/bulk?crewIds=${crewIds.join(',')}`),
    addCrewCertificate: (data: {
      certificateId: number
      crewMemberId: string
      certificateNumber: string
      issueDate: string
      expiryDate: string
      issuingAuthority?: string | null
      certificateOfCompetency?: string
      countryId?: number | null
      status: string
      notes?: string | null
    }) => this.request<{ id: number; message: string }>('/certificates/crew-certificates', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    updateCrewCertificate: (id: number, data: {
      certificateId: number
      crewMemberId: string
      certificateNumber: string
      issueDate: string
      expiryDate: string
      issuingAuthority?: string | null
      certificateOfCompetency?: string
      countryId?: number | null
      status: string
      notes?: string | null
    }) => this.request<{ message: string }>(`/certificates/crew-certificates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    uploadCertificateFile: (crewCertificateId: number, formData: FormData) =>
      this.request<{ message: string; documentFilePath: string }>(`/certificates/crew-certificates/${crewCertificateId}/file`, {
        method: 'PUT',
        body: formData,
      }),
  }

  // === MATERIAL MANAGEMENT (thêm mới) ===
  material = {
    getCategories: (onlyActive = true, parentId?: number) => {
      const params = new URLSearchParams()
      params.set('onlyActive', String(onlyActive))
      if (typeof parentId === 'number') params.set('parentId', String(parentId))
      return this.request<MaterialCategory[]>(`/material/categories?${params.toString()}`)
    },

    getItems: (params?: { categoryId?: number; q?: string; onlyActive?: boolean }) => {
      const qs = new URLSearchParams()
      if (typeof params?.categoryId === 'number') qs.set('categoryId', String(params.categoryId))
      if (params?.q) qs.set('q', params.q)
      if (params?.onlyActive !== undefined) qs.set('onlyActive', String(params.onlyActive))
      return this.request<MaterialItem[]>(`/material/items?${qs.toString()}`)
    },

    getLowStock: () => this.request<MaterialItem[]>('/material/items/low-stock'),

    getItemById: (id: number) => this.request<MaterialItem>(`/material/items/${id}`),

    createItem: (payload: Partial<MaterialItem>) =>
      this.request<MaterialItem>('/material/items', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),

    updateItem: (id: number, payload: Partial<MaterialItem>) =>
      this.request<MaterialItem>(`/material/items/${id}`, {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),

    deleteItem: (id: number) =>
      this.request(`/material/items/${id}`, { method: 'DELETE' }),
  }

  maintenance = {
    getAll: (params?: { page?: number; pageSize?: number; status?: string; priority?: string }) => {
      const queryParams = new URLSearchParams()
      if (params?.page) queryParams.set('page', params.page.toString())
      if (params?.pageSize) queryParams.set('pageSize', params.pageSize.toString())
      if (params?.status) queryParams.set('status', params.status)
      if (params?.priority) queryParams.set('priority', params.priority)
      
      const query = queryParams.toString()
      return this.request<PaginatedResponse<MaintenanceTask>>(`/maintenance/tasks${query ? `?${query}` : ''}`)
    },
    getPending: () => this.request<MaintenanceTask[]>('/maintenance/tasks/pending'),
    getOverdue: () => this.request<MaintenanceTask[]>('/maintenance/tasks/overdue'),
    getById: (id: string) => this.request<MaintenanceTask>(`/maintenance/tasks/${id}`),
    getChecklist: (id: string) => this.request<any[]>(`/maintenance/tasks/${id}/checklist`),
    updateChecklistItem: (taskId: string, itemId: string, data: { isCompleted?: boolean; readingValue?: number | null; remarks?: string; isAbnormal?: boolean; completedBy?: string }) =>
      this.request(`/maintenance/tasks/${taskId}/checklist/${itemId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    toggleChecklistItem: (taskId: string, itemId: string, data: { completedBy?: string; readingValue?: number | null; remarks?: string; isAbnormal?: boolean }) =>
      this.request(`/maintenance/tasks/${taskId}/checklist/${itemId}/complete`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    create: (task: Partial<MaintenanceTask>) =>
      this.request<MaintenanceTask>('/maintenance/tasks', {
        method: 'POST',
        body: JSON.stringify(task),
      }),
    update: (id: string, task: Partial<MaintenanceTask>) =>
      this.request<MaintenanceTask>(`/maintenance/tasks/${id}`, {
        method: 'PUT',
        body: JSON.stringify(task),
      }),
    // Partial update for work report fields
    patch: (id: string, fields: Record<string, unknown>) =>
      this.request<MaintenanceTask>(`/maintenance/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(fields),
      }),
    // Quick status update for Kanban drag-and-drop
    updateStatus: (id: string, status: string) =>
      this.request(`/maintenance/tasks/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    completeTask: (
      id: string,
      data: { completedBy: string; notes?: string; sparePartsUsed?: string }
    ) =>
      this.request(`/maintenance/tasks/${id}/complete`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      this.request(`/maintenance/tasks/${id}`, {
        method: 'DELETE',
      }),
    getRiskAssessment: (taskId: string) =>
      this.request<TaskRiskAssessment>(`/maintenance/tasks/${taskId}/risk-assessment`),
    saveRiskAssessment: (taskId: string, data: Partial<TaskRiskAssessment>) =>
      this.request<{ success: boolean; isFilled: boolean }>(`/maintenance/tasks/${taskId}/risk-assessment`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    getInspectionReport: (taskId: string) =>
      this.request<TaskInspectionReport>(`/maintenance/tasks/${taskId}/inspection-report`),
    saveInspectionReport: (taskId: string, data: Partial<TaskInspectionReport>) =>
      this.request<{ success: boolean; isFilled: boolean }>(`/maintenance/tasks/${taskId}/inspection-report`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    downloadRiskAssessmentPdf: async (taskId: string): Promise<string> => {
      const url = this.baseUrl ? `${this.baseUrl}/api/maintenance/tasks/${taskId}/risk-assessment/pdf` : `/api/maintenance/tasks/${taskId}/risk-assessment/pdf`
      const token = getAuthToken()
      const resp = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!resp.ok) throw new Error('PDF chưa có')
      const blob = await resp.blob()
      return URL.createObjectURL(blob)
    },
    downloadInspectionReportPdf: async (taskId: string): Promise<string> => {
      const url = this.baseUrl ? `${this.baseUrl}/api/maintenance/tasks/${taskId}/inspection-report/pdf` : `/api/maintenance/tasks/${taskId}/inspection-report/pdf`
      const token = getAuthToken()
      const resp = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      if (!resp.ok) throw new Error('PDF chưa có')
      const blob = await resp.blob()
      return URL.createObjectURL(blob)
    },
  }

  voyage = {
    getCurrent: () => this.request<VoyageRecord>('/voyages/current'),
    getAll: (params?: { page?: number; pageSize?: number }) => {
      const q = new URLSearchParams()
      if (params?.page) q.set('page', params.page.toString())
      if (params?.pageSize) q.set('pageSize', params.pageSize.toString())
      const qs = q.toString()
      return this.request<VoyageRecord[]>(`/voyages${qs ? `?${qs}` : ''}`)
    },
    getById: (id: string) => this.request<VoyageRecord>(`/voyages/${id}`),
  }

  cargo = {
    getAll: (voyageId?: number) =>
      this.request<CargoOperation[]>(`/cargo${voyageId ? `?voyageId=${voyageId}` : ''}`),
    getById: (id: number) => this.request<CargoOperation>(`/cargo/${id}`),
  }

  compliance = {
    getWatchkeeping: (days: number = 7) =>
      this.request<WatchkeepingLog[]>(`/compliance/watchkeeping?days=${days}`),
    getOilRecordBook: (days: number = 30) =>
      this.request<OilRecordBook[]>(`/compliance/oil-record-book?days=${days}`),
  }

  // === COUNTRIES MANAGEMENT ===
  countries = {
    getAll: () => this.request<Country[]>('/countries'),
    getById: (id: number) => this.request<Country>(`/countries/${id}`),
  }

  // === RANKS MANAGEMENT ===
  ranks = {
    getAll: (includeInactive = false) => 
      this.request<any[]>(`/ranks${includeInactive ? '?includeInactive=true' : ''}`),
    getById: (id: number) => this.request<any>(`/ranks/${id}`),
    create: (data: {
      rankCode: string
      rankName: string
      isActive: boolean
    }) => this.request<{ id: number; rankCode: string; rankName: string; message: string }>('/ranks', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
    update: (id: number, data: {
      rankCode: string
      rankName: string
      isActive: boolean
    }) => this.request<{ message: string }>(`/ranks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    delete: (id: number) => this.request<{ message: string }>(`/ranks/${id}`, {
      method: 'DELETE'
    }),
    deletePermanent: (id: number) => this.request<{ message: string }>(`/ranks/${id}/permanent`, {
      method: 'DELETE'
    })
  }

  sync = {
    getQueue: () => this.request<SyncQueue[]>('/sync/queue'),
    getStatus: () =>
      this.request<{
        pendingRecords: number
        lastSyncAt?: string
        isOnline: boolean
        lastConnectionError?: string
        lastConnectionCheckedAt?: string
      }>('/sync/status'),
    trigger: () => this.request('/sync/trigger', { method: 'POST' }),
  }

  dashboard = {
    getStats: () => this.request<DashboardStats>('/dashboard/stats'),
  }
}

// ============================================================
// SINGLETON INSTANCE for default usage
// ============================================================

export const maritimeService = new MaritimeService()

// Alias (tùy chọn) nếu muốn import { materialService } ở các trang:
export const materialService = maritimeService.material

// ============================================================
// TELEMETRY & SENSOR DATA
// ============================================================

export const telemetryService = {
  // Position & Navigation
  getLatestPosition: () => apiClient.get<PositionData>('/telemetry/position/latest'),
  getPositionHistory: (hours: number = 24) => 
    apiClient.get<PositionData[]>(`/telemetry/position/history?hours=${hours}`),
  
  getLatestNavigation: () => apiClient.get<NavigationData>('/telemetry/navigation/latest'),
  getNavigationHistory: (hours: number = 24) =>
    apiClient.get<NavigationData[]>(`/telemetry/navigation/history?hours=${hours}`),

  // Engine Data
  getEngineStatus: (engineId?: string) =>
    apiClient.get<EngineData[]>(`/telemetry/engines${engineId ? `?id=${engineId}` : ''}`),
  getEngineHistory: (engineId: string, hours: number = 24) =>
    apiClient.get<EngineData[]>(`/telemetry/engines/${engineId}/history?hours=${hours}`),

  // Generators
  getGeneratorStatus: (genId?: string) =>
    apiClient.get<GeneratorData[]>(`/telemetry/generators${genId ? `?id=${genId}` : ''}`),
  getGeneratorHistory: (genId: string, hours: number = 24) =>
    apiClient.get<GeneratorData[]>(`/telemetry/generators/${genId}/history?hours=${hours}`),

  // Tanks & Fuel
  getTankLevels: () => apiClient.get<TankLevel[]>('/telemetry/tanks'),
  getFuelConsumption: (days: number = 7) =>
    apiClient.get<FuelConsumption[]>(`/telemetry/fuel/consumption?days=${days}`),

  // Environmental
  getEnvironmentalData: () => apiClient.get<EnvironmentalData>('/telemetry/environmental/latest'),
  getEnvironmentalHistory: (hours: number = 24) =>
    apiClient.get<EnvironmentalData[]>(`/telemetry/environmental/history?hours=${hours}`),

  // AIS Data
  getNearbyVessels: (range: number = 10) =>
    apiClient.get<AisData[]>(`/telemetry/ais/nearby?range=${range}`),
}

// ============================================================
// ALARMS & SAFETY
// ============================================================

export const alarmService = {
  getActiveAlarms: () => apiClient.get<SafetyAlarm[]>('/alarms/active'),
  getAlarmHistory: (days: number = 7) =>
    apiClient.get<SafetyAlarm[]>(`/alarms/history?days=${days}`),
  acknowledgeAlarm: (id: number, acknowledgedBy: string) =>
    apiClient.post(`/alarms/${id}/acknowledge`, { acknowledgedBy }),
  resolveAlarm: (id: number) =>
    apiClient.post(`/alarms/${id}/resolve`, {}),
}

// ============================================================
// CREW MANAGEMENT
// ============================================================

/**
 * @deprecated Use maritimeService.crew instead. This legacy crewService fetches unpaginated data by default.
 */
export const crewService = {
  /**
   * @deprecated Use maritimeService.crew.getAll instead for database-level pagination.
   */
  getAllCrew: (params?: { page?: number; pageSize?: number }) => {
    const page = params?.page ?? 1
    const pageSize = params?.pageSize ?? 50
    return apiClient.get<CrewMember[]>(`/crew?page=${page}&pageSize=${pageSize}`)
  },
  getOnboardCrew: () => apiClient.get<CrewMember[]>('/crew/onboard'),
  getCrewById: (id: string) => apiClient.get<CrewMember>(`/crew/${id}`),
  addCrew: (crew: Partial<CrewMember>) => apiClient.post<CrewMember>('/crew', crew),
  updateCrew: (id: string, crew: Partial<CrewMember>) =>
    apiClient.put<CrewMember>(`/crew/${id}`, crew),
  getExpiringCertificates: (days: number = 90) =>
    apiClient.get<CrewMember[]>(`/crew/expiring-certificates?days=${days}`),
}

// ============================================================
// MAINTENANCE
// ============================================================

/**
 * @deprecated Use maritimeService.maintenance instead. This legacy maintenanceService fetches unpaginated data by default.
 */
export const maintenanceService = {
  /**
   * @deprecated Use maritimeService.maintenance.getAll instead for database-level pagination.
   */
  getAllTasks: (params?: { page?: number; pageSize?: number }) => {
    const page = params?.page ?? 1
    const pageSize = params?.pageSize ?? 50
    return apiClient.get<MaintenanceTask[]>(`/maintenance/tasks?page=${page}&pageSize=${pageSize}`)
  },
  getPendingTasks: () => apiClient.get<MaintenanceTask[]>('/maintenance/tasks/pending'),
  getOverdueTasks: () => apiClient.get<MaintenanceTask[]>('/maintenance/tasks/overdue'),
  getTaskById: (id: string) => apiClient.get<MaintenanceTask>(`/maintenance/tasks/${id}`),
  createTask: (task: Partial<MaintenanceTask>) =>
    apiClient.post<MaintenanceTask>('/maintenance/tasks', task),
  updateTask: (id: string, task: Partial<MaintenanceTask>) =>
    apiClient.put<MaintenanceTask>(`/maintenance/tasks/${id}`, task),
  completeTask: (id: string, completedBy: string, notes?: string, sparePartsUsed?: string) =>
    apiClient.post(`/maintenance/tasks/${id}/complete`, {
      completedBy,
      notes,
      sparePartsUsed,
    }),
}

// ============================================================
// VOYAGE & CARGO
// ============================================================

/**
 * @deprecated Use maritimeService.voyage instead. This legacy voyageService fetches unpaginated data by default.
 */
export const voyageService = {
  getCurrentVoyage: () => apiClient.get<VoyageRecord>('/voyages/current'),
  /**
   * @deprecated Use maritimeService.voyage.getAll instead for database-level pagination.
   */
  getAllVoyages: (params?: { page?: number; pageSize?: number }) => {
    const page = params?.page ?? 1
    const pageSize = params?.pageSize ?? 50
    return apiClient.get<VoyageRecord[]>(`/voyages?page=${page}&pageSize=${pageSize}`)
  },
  getVoyageById: (id: string) => apiClient.get<VoyageRecord>(`/voyages/${id}`),
  createVoyage: (voyage: Partial<VoyageRecord>) =>
    apiClient.post<VoyageRecord>('/voyages', voyage),
  updateVoyage: (id: string, voyage: Partial<VoyageRecord>) =>
    apiClient.put<VoyageRecord>(`/voyages/${id}`, voyage),
}

/**
 * @deprecated Use maritimeService.cargo instead. This legacy cargoService fetches unpaginated data by default.
 */
export const cargoService = {
  /**
   * @deprecated Use maritimeService.cargo.getAll instead for database-level pagination.
   */
  getCargoOperations: (voyageId?: number, params?: { page?: number; pageSize?: number }) => {
    const page = params?.page ?? 1
    const pageSize = params?.pageSize ?? 50
    return apiClient.get<CargoOperation[]>(`/cargo?page=${page}&pageSize=${pageSize}${voyageId ? `&voyageId=${voyageId}` : ''}`)
  },
  getCargoById: (id: number) => apiClient.get<CargoOperation>(`/cargo/${id}`),
  createCargo: (cargo: Partial<CargoOperation>) =>
    apiClient.post<CargoOperation>('/cargo', cargo),
  updateCargo: (id: number, cargo: Partial<CargoOperation>) =>
    apiClient.put<CargoOperation>(`/cargo/${id}`, cargo),
}

// ============================================================
// COMPLIANCE (SOLAS/MARPOL)
// ============================================================

/**
 * @deprecated Use maritimeService.compliance instead. This legacy complianceService fetches unpaginated data by default.
 */
export const complianceService = {
  // Watchkeeping Logs
  getWatchkeepingLogs: (days: number = 7) =>
    apiClient.get<WatchkeepingLog[]>(`/compliance/watchkeeping?days=${days}`),
  createWatchkeepingLog: (log: Partial<WatchkeepingLog>) =>
    apiClient.post<WatchkeepingLog>('/compliance/watchkeeping', log),
  
  // Oil Record Book
  getOilRecordBook: (days: number = 30) =>
    apiClient.get<OilRecordBook[]>(`/compliance/oil-record-book?days=${days}`),
  createOilRecordEntry: (entry: Partial<OilRecordBook>) =>
    apiClient.post<OilRecordBook>('/compliance/oil-record-book', entry),
}

// ============================================================
// SYNC STATUS
// ============================================================

// Response types for POST /api/sync/snapshot
export interface SnapshotGroupResult {
  name:  string
  label: string
  count: number
}

export interface SnapshotResponse {
  message: string
  queued:  number
  groups:  SnapshotGroupResult[]
}

export const syncService = {
  getSyncQueue: () => apiClient.get<SyncQueue[]>('/sync/queue'),
  getSyncStatus: () => apiClient.get<{
    pendingRecords: number
    lastSyncAt?: string
    isOnline: boolean
  }>('/sync/status'),
  triggerSync: () => apiClient.post<{ message: string; totalSynced: number; pendingRecords: number }>('/sync/trigger', {}),
  resetErrors: () => apiClient.post<{ message: string }>('/sync/reset-errors', {}),
  snapshotCrew: () => apiClient.post<{ message: string; queued: number }>('/sync/snapshot-crew', {}),
  /** POST /api/sync/snapshot — queue selected groups with optional date range */
  snapshotGroups: (groups: string[], fromDate?: string, toDate?: string): Promise<SnapshotResponse> =>
    apiClient.post<SnapshotResponse>('/sync/snapshot', { groups, fromDate, toDate }),
}

// ============================================================
// EDGE PROVISIONING
// ============================================================
export interface EdgeProvisioningStatus {
  isActive: boolean
  profileId?: number
  nodeId?: string
  vesselImo?: string
  vesselName?: string
  shoreVesselId?: string
  shoreUrl?: string
  lastHandshake?: string
  handshakeStatus?: string
  lastHandshakeError?: string
  source: string
}

export interface EdgeProvisioningImportResponse {
  profileId: number
  preview: {
    nodeId: string
    vesselImo: string
    vesselName: string
    shoreBaseUrl: string
    keyVersion: number
    protocolVersion: string
    securityEnabled: boolean
  }
}

export interface EdgeProvisioningHistoryItem {
  id: number
  isActive: boolean
  nodeId: string
  vesselImo: string
  vesselName: string
  shoreVesselId: string
  shoreBaseUrl: string
  keyVersion: number
  importedAt: string
  importedFrom: 'zip_upload' | 'json_upload'
  activatedAt?: string
  lastHandshakeAt?: string
  handshakeStatus?: string
  lastHandshakeError?: string
}

export interface EdgeVesselSwitchCheck {
  requiresReset: boolean
  currentVesselName?: string
  currentVesselImo?: string
  newVesselName?: string
  newVesselImo?: string
  pendingUploads: number
}

export const provisioningService = {
  getStatus: () => apiClient.get<EdgeProvisioningStatus>('/edge/provisioning/status'),

  import: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return apiClient.post<EdgeProvisioningImportResponse>('/edge/provisioning/import', formData)
  },

  testConnection: (profileId: number) =>
    apiClient.post<{ success: boolean; message: string; serverTime?: string }>(
      '/edge/provisioning/test',
      { profileId }
    ),

  /** Gói của tàu khác: tàu sẽ xoá toàn bộ dữ liệu tàu hiện tại rồi nhận lại từ bờ. */
  switchCheck: (profileId: number) =>
    apiClient.get<EdgeVesselSwitchCheck>(`/edge/provisioning/${profileId}/switch-check`),

  activate: (profileId: number, confirmReset = false) =>
    apiClient.post<{ activated: boolean; previousProfileId?: number; reset: boolean; wipedRows: number; fullSyncRequested: boolean }>(
      '/edge/provisioning/activate',
      { profileId, confirmReset }
    ),

  /** Làm sạch tàu đang chạy và nhận lại toàn bộ dữ liệu từ bờ. */
  resetFromShore: (confirmImo: string) =>
    apiClient.post<{ reset: boolean; wipedRows: number; fullSyncRequested: boolean }>('/edge/provisioning/reset', { confirmImo }),

  getHistory: () => apiClient.get<EdgeProvisioningHistoryItem[]>('/edge/provisioning/history'),
}

// ============================================================
// DASHBOARD
// ============================================================

export const dashboardService = {
  getStats: () => apiClient.get<DashboardStats>('/dashboard/stats'),
}

// ============================================================
// AUDIT LOG (ISM Code Chapter 12 / IMO MSC.428)
// ============================================================

export interface AuditLogEntry {
  id: number
  timestamp: string
  category: string
  action: string
  level: string
  message?: string
  userId?: number
  username?: string
  ipAddress?: string
  entityType?: string
  entityId?: string
  oldValues?: string
  newValues?: string
  result?: string
  durationMs?: number
}

export interface AuditLogResponse {
  success: boolean
  data: AuditLogEntry[]
  totalCount: number
  totalPages: number
  currentPage: number
  pageSize: number
}

export interface AuditLogStats {
  success: boolean
  totalCount: number
  period: { from: string; to: string }
  byCategory: { category: string; count: number }[]
  byAction: { action: string; count: number }[]
  byLevel: { level: string; count: number }[]
  topUsers: { username: string; count: number }[]
  topEntities: { entityType: string; count: number }[]
}

export interface AuditLogFilterOptions {
  success: boolean
  categories: string[]
  actions: string[]
  levels: string[]
  entityTypes: string[]
  usernames: string[]
  messages: string[]
}

export const auditLogService = {
  getLogs: (params?: {
    page?: number
    pageSize?: number
    category?: string | string[]
    action?: string | string[]
    level?: string | string[]
    entityType?: string | string[]
    username?: string | string[]
    message?: string | string[]
    search?: string
    from?: string
    to?: string
  }) => {
    const searchParams = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        // Mảng gửi thành nhiều tham số cùng tên (?level=INFO&level=WARNING)
        const values = Array.isArray(value) ? value : [value]
        values.forEach(v => {
          if (v !== undefined && v !== null && v !== '') searchParams.append(key, String(v))
        })
      })
    }
    const qs = searchParams.toString()
    return apiClient.get<AuditLogResponse>(`/audit-logs${qs ? `?${qs}` : ''}`)
  },
  getStats: (from?: string, to?: string) => {
    const params = new URLSearchParams()
    if (from) params.append('from', from)
    if (to) params.append('to', to)
    const qs = params.toString()
    return apiClient.get<AuditLogStats>(`/audit-logs/stats${qs ? `?${qs}` : ''}`)
  },
  getFilterOptions: () =>
    apiClient.get<AuditLogFilterOptions>('/audit-logs/filter-options'),
  getEntityTypes: () =>
    apiClient.get<{ success: boolean; entityTypes: string[] }>('/audit-logs/entity-types'),
  getById: (id: number) =>
    apiClient.get<{ success: boolean; data: AuditLogEntry }>(`/audit-logs/${id}`),
  cleanup: (retentionDays: number = 90) =>
    apiClient.post<{ success: boolean; message: string; deletedCount: number }>(
      `/audit-logs/cleanup?retentionDays=${retentionDays}`, {}
    ),
}
