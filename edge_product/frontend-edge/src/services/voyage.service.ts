import type {
  Port,
  PortSearchQuery,
  PortCall,
  CreatePortCallDto,
  UpdatePortCallDto,
  VoyageCrewAssignment,
  CreateCrewAssignmentDto,
  UpdateCrewAssignmentDto,
  BulkAssignCrewDto,
  VoyageDetail,
  CreateVoyageDto,
  UpdateVoyageDto,
  FalForm5,
  VoyageCargoOperation,
  CreateCargoOperationDto,
  UpdateCargoOperationDto,
} from '@/types/voyage.types'
import type {
  VoyageCockpitDto,
  CockpitTimelineEvent,
} from '@/types/cockpit.types'
import type { VoyageEfficiencyReport } from '@/types/efficiency.types'
import type {
  VoyageFinancialOverview,
  VoyageExpenseRequest,
  CreateExpenseRequestDto,
  UpdateExpenseRequestDto,
  VoyageAdvancePayment,
  CreateAdvancePaymentDto,
  UpdateAdvancePaymentDto,
  VoyageDisbursement,
  CreateDisbursementDto,
  UpdateDisbursementDto,
  VoyageActualRevenue,
  CreateActualRevenueDto,
  UpdateActualRevenueDto,
  VoyageSettlement,
  CreateSettlementDto,
  UpdateSettlementDto,
  TransitionStatusDto,
  CloseVoyageFinancialsDto,
} from '@/types/financial.types'
import type { PaginatedResponse, VoyageRecord } from '@/types/maritime.types'
import { getAuthToken, getCurrentAccountName } from './api.client'

// ============================================================
// VOYAGE MANAGEMENT SERVICE
// Calls edge-services API endpoints for voyage, port, crew assignment
// ============================================================

class VoyageManagementService {
  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `/api${endpoint}`
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      ...(options?.headers as Record<string, string> | undefined),
    }

    // Inject auth token for audit trail (user identity in backend)
    const token = getAuthToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const accountName = getCurrentAccountName()
    if (accountName) {
      headers['X-User-Name'] = accountName
    }

    const response = await fetch(url, { ...options, headers })
    
    const contentType = response.headers.get('content-type')
    let data: any
    
    if (contentType && contentType.includes('application/json')) {
      data = await response.json()
    } else {
      data = await response.text()
    }

    if (!response.ok) {
      const errorMessage = data?.error || data?.message || data || response.statusText
      const error: any = new Error(errorMessage)
      error.status = response.status
      error.data = data
      throw error
    }

    return data
  }

  // ========== PORTS ==========

  ports = {
    search: (query?: PortSearchQuery) => {
      const params = new URLSearchParams()
      if (query?.search) params.set('search', query.search)
      if (query?.countryCode) params.set('countryCode', query.countryCode)
      if (query?.isActive !== undefined) params.set('isActive', String(query.isActive))
      if (query?.page) params.set('page', String(query.page))
      if (query?.pageSize) params.set('pageSize', String(query.pageSize))
      const qs = params.toString()
      return this.request<PaginatedResponse<Port>>(`/ports${qs ? `?${qs}` : ''}`)
    },

    getByCode: (portCode: string) =>
      this.request<Port>(`/ports/by-code/${portCode}`),

    getById: (id: number) =>
      this.request<Port>(`/ports/${id}`),

    // Không có create/update/delete: danh mục cảng do bờ làm chủ, tàu chỉ đọc.

    getCountries: () =>
      this.request<string[]>('/ports/countries'),
  }

  // ========== VOYAGES ==========

  voyages = {
    getCurrent: () =>
      this.request<VoyageRecord>('/voyages/current'),

    getAll: () =>
      this.request<VoyageRecord[]>('/voyages'),

    getDetail: (id: string) =>
      this.request<VoyageDetail>(`/voyages/${id}`),

    create: (data: CreateVoyageDto) =>
      this.request<VoyageRecord>('/voyages', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (id: string, data: UpdateVoyageDto) =>
      this.request<VoyageRecord>(`/voyages/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      this.request<void>(`/voyages/${id}`, { method: 'DELETE' }),

    getFalForm5: (voyageId: string) =>
      this.request<FalForm5>(`/voyages/${voyageId}/fal-form5`),

    getNextNumber: () =>
      this.request<{ voyageNumber: string }>('/voyages/next-number'),
  }

  // ========== PORT CALLS ==========

  portCalls = {
    getByVoyage: (voyageId: string) =>
      this.request<PortCall[]>(`/voyages/${voyageId}/port-calls`),

    create: (voyageId: string, data: CreatePortCallDto) =>
      this.request<PortCall>(`/voyages/${voyageId}/port-calls`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (id: string, data: UpdatePortCallDto) =>
      this.request<PortCall>(`/port-calls/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      this.request<void>(`/port-calls/${id}`, { method: 'DELETE' }),
  }

  // ========== CREW ASSIGNMENTS ==========

  crewAssignments = {
    getByVoyage: (voyageId: string) =>
      this.request<VoyageCrewAssignment[]>(`/voyages/${voyageId}/crew`),

    assign: (voyageId: string, data: CreateCrewAssignmentDto) =>
      this.request<VoyageCrewAssignment>(`/voyages/${voyageId}/crew`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    bulkAssign: (voyageId: string, data: BulkAssignCrewDto) =>
      this.request<VoyageCrewAssignment[]>(`/voyages/${voyageId}/crew/bulk`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (id: string, data: UpdateCrewAssignmentDto) =>
      this.request<VoyageCrewAssignment>(`/crew-assignments/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    remove: (id: string) =>
      this.request<void>(`/crew-assignments/${id}`, { method: 'DELETE' }),

    getCrewHistory: (crewMemberId: string) =>
      this.request<VoyageCrewAssignment[]>(`/crew/${crewMemberId}/voyages`),
  }

  // ========== CARGO OPERATIONS ==========

  cargo = {
    getByVoyage: (voyageId: string) =>
      this.request<VoyageCargoOperation[]>(`/cargo?voyageId=${voyageId}`),

    getById: (id: string) =>
      this.request<VoyageCargoOperation>(`/cargo/${id}`),

    create: (data: CreateCargoOperationDto) =>
      this.request<VoyageCargoOperation>('/cargo', {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (id: string, data: UpdateCargoOperationDto) =>
      this.request<VoyageCargoOperation>(`/cargo/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    delete: (id: string) =>
      this.request<void>(`/cargo/${id}`, { method: 'DELETE' }),
  }

  // ========== COCKPIT ==========

  cockpit = {
    get: (voyageId: string) =>
      this.request<VoyageCockpitDto>(`/voyage-cockpit/${voyageId}`),

    getTimeline: (voyageId: string, params?: {
      planLegId?: string
      source?: string
      from?: string
      to?: string
      limit?: number
    }) => {
      const qs = new URLSearchParams()
      if (params?.planLegId) qs.set('planLegId', params.planLegId)
      if (params?.source) qs.set('source', params.source)
      if (params?.from) qs.set('from', params.from)
      if (params?.to) qs.set('to', params.to)
      if (params?.limit) qs.set('limit', String(params.limit))
      const q = qs.toString()
      return this.request<CockpitTimelineEvent[]>(
        `/voyage-cockpit/${voyageId}/timeline${q ? `?${q}` : ''}`
      )
    },
  }

  // ========== FINANCIAL ==========

  financial = {
    getOverview: (voyageId: string) =>
      this.request<VoyageFinancialOverview>(`/voyage-financial/${voyageId}/overview`),

    // Expense Requests
    getExpenses: (voyageId: string) =>
      this.request<VoyageExpenseRequest[]>(`/voyage-financial/${voyageId}/expenses`),
    createExpense: (voyageId: string, data: CreateExpenseRequestDto) =>
      this.request<VoyageExpenseRequest>(`/voyage-financial/${voyageId}/expenses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    updateExpense: (id: string, data: UpdateExpenseRequestDto) =>
      this.request<VoyageExpenseRequest>(`/voyage-financial/expenses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    transitionExpense: (id: string, data: TransitionStatusDto) =>
      this.request<{ message: string }>(`/voyage-financial/expenses/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    deleteExpense: (id: string) =>
      this.request<{ message: string }>(`/voyage-financial/expenses/${id}`, { method: 'DELETE' }),

    // Advance Payments
    getAdvances: (voyageId: string) =>
      this.request<VoyageAdvancePayment[]>(`/voyage-financial/${voyageId}/advances`),
    createAdvance: (voyageId: string, data: CreateAdvancePaymentDto) =>
      this.request<VoyageAdvancePayment>(`/voyage-financial/${voyageId}/advances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    updateAdvance: (id: string, data: UpdateAdvancePaymentDto) =>
      this.request<VoyageAdvancePayment>(`/voyage-financial/advances/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    payAdvance: (id: string, data: TransitionStatusDto) =>
      this.request<{ message: string }>(`/voyage-financial/advances/${id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    deleteAdvance: (id: string) =>
      this.request<{ message: string }>(`/voyage-financial/advances/${id}`, { method: 'DELETE' }),

    // Disbursements
    getDisbursements: (voyageId: string) =>
      this.request<VoyageDisbursement[]>(`/voyage-financial/${voyageId}/disbursements`),
    createDisbursement: (voyageId: string, data: CreateDisbursementDto) =>
      this.request<VoyageDisbursement>(`/voyage-financial/${voyageId}/disbursements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    updateDisbursement: (id: string, data: UpdateDisbursementDto) =>
      this.request<VoyageDisbursement>(`/voyage-financial/disbursements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    transitionDisbursement: (id: string, data: TransitionStatusDto) =>
      this.request<{ message: string }>(`/voyage-financial/disbursements/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    deleteDisbursement: (id: string) =>
      this.request<{ message: string }>(`/voyage-financial/disbursements/${id}`, { method: 'DELETE' }),

    // Actual Revenue
    getRevenues: (voyageId: string) =>
      this.request<VoyageActualRevenue[]>(`/voyage-financial/${voyageId}/revenues`),
    createRevenue: (voyageId: string, data: CreateActualRevenueDto) =>
      this.request<VoyageActualRevenue>(`/voyage-financial/${voyageId}/revenues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    updateRevenue: (id: string, data: UpdateActualRevenueDto) =>
      this.request<VoyageActualRevenue>(`/voyage-financial/revenues/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    transitionRevenue: (id: string, data: TransitionStatusDto) =>
      this.request<{ message: string }>(`/voyage-financial/revenues/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    deleteRevenue: (id: string) =>
      this.request<{ message: string }>(`/voyage-financial/revenues/${id}`, { method: 'DELETE' }),

    // Settlements
    getSettlements: (voyageId: string) =>
      this.request<VoyageSettlement[]>(`/voyage-financial/${voyageId}/settlements`),
    createSettlement: (voyageId: string, data: CreateSettlementDto) =>
      this.request<VoyageSettlement>(`/voyage-financial/${voyageId}/settlements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    updateSettlement: (id: string, data: UpdateSettlementDto) =>
      this.request<VoyageSettlement>(`/voyage-financial/settlements/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    transitionSettlement: (id: string, data: TransitionStatusDto) =>
      this.request<{ message: string }>(`/voyage-financial/settlements/${id}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),

    // Financial Closing
    close: (voyageId: string, data: CloseVoyageFinancialsDto) =>
      this.request<{ message: string }>(`/voyage-financial/${voyageId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
  }

  // ========== EFFICIENCY ==========

  efficiency = {
    getReport: (voyageId: string) =>
      this.request<VoyageEfficiencyReport>(`/voyage-efficiency/${voyageId}`),
  }
}

export const voyageMgmtService = new VoyageManagementService()
