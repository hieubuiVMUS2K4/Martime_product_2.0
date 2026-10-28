import { useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/services/api.client'
import { useAuthStore } from '@/stores/auth.store'
import { hasPermission, usePermissionsStore } from '@/stores/permissions.store'
import type { Job, JobDetail, JobDefinition, JobImpact, WorkOrder, WorkOrderDetail, Page, CrewOption, RankOption, WorkflowResult, AdHocDefinition, ExecutionResult, Report, HistoryRow, MaterialOption, Counter } from './types'
export const pms = {
  jobs: (params: Record<string, unknown>) => apiClient.get<Page<Job>>('/pms/jobs', { params }),
  job: (id: string) => apiClient.get<JobDetail>(`/pms/jobs/${id}`),
  saveJob: (id: string | undefined, data: JobDefinition) => id ? apiClient.put(`/pms/jobs/${id}`, data) : apiClient.post('/pms/jobs', data),
  previewJob: (id: string | undefined, data: JobDefinition) => apiClient.post<JobImpact>(id ? `/pms/jobs/${id}/preview` : '/pms/jobs/preview', data),
  jobState: (job: Job, state: string, reason: string) => apiClient.post(`/pms/jobs/${job.id}/state`, { expectedVersion: job.version, state, reason }),
  resolveCycle: (detail: JobDetail, action: 'REPLACE' | 'SKIP', reason: string) => apiClient.post<{ workOrderId?: string }>(`/pms/jobs/${detail.job.id}/resolve-cycle`, { expectedJobVersion: detail.job.version, expectedCycleKey: detail.cycleKey, cancelledWorkOrderId: detail.cancelledWorkOrderId, action, reason }),
  deleteJob: (job: Job) => apiClient.delete(`/pms/jobs/${job.id}?expectedVersion=${job.version}`),
  jobReferences: () => apiClient.get<{ crew: CrewOption[]; ranks: RankOption[] }>('/pms/jobs/references'),
  orders: (params: Record<string, unknown>) => apiClient.get<Page<WorkOrder>>('/pms/work-orders', { params }),
  order: (id: string) => apiClient.get<WorkOrderDetail>(`/pms/work-orders/${id}`),
  crew: () => apiClient.get<CrewOption[]>('/pms/work-orders/references'),
  settings: () => apiClient.get<{ vesselTimeZone: string; automaticReleaseEnabled: boolean; pmsDatasetId?: string }>('/pms/work-orders/settings'),
  release: (detail: JobDetail, earlyReleaseReason: string) => apiClient.post<WorkflowResult>('/pms/work-orders/from-job', { jobId: detail.job.id, expectedJobVersion: detail.job.version, expectedCycleKey: detail.cycleKey, earlyReleaseReason }),
  releaseManual: (detail: JobDetail, data: { commandId: string; reason: string; dueDate: string | null; dueHours: number | null }) => apiClient.post<WorkflowResult>('/pms/work-orders/from-manual-job', { jobId: detail.job.id, expectedJobVersion: detail.job.version, ...data }),
  createOrder: (data: AdHocDefinition, commandId: string, issueNow: boolean) => apiClient.post<WorkflowResult>('/pms/work-orders/ad-hoc', { ...data, commandId, issueNow }),
  saveDraft: (order: WorkOrder, data: AdHocDefinition) => apiClient.put<WorkflowResult>(`/pms/work-orders/${order.id}/draft`, { ...data, expectedVersion: order.workflowVersion }),
  issue: (order: WorkOrder) => apiClient.post<WorkflowResult>(`/pms/work-orders/${order.id}/issue`, { expectedVersion: order.workflowVersion }),
  deleteDraft: (order: WorkOrder) => apiClient.delete(`/pms/work-orders/${order.id}/draft?expectedVersion=${order.workflowVersion}`),
  assign: (order: WorkOrder, crewId: string, supportingCrewIds: string[], reason: string) => apiClient.post(`/pms/work-orders/${order.id}/assignment`, { expectedVersion: order.workflowVersion, crewId, supportingCrewIds, reason }),
  start: (order: WorkOrder) => apiClient.post(`/pms/work-orders/${order.id}/start`, { expectedVersion: order.workflowVersion }),
  save: (id: string, result: ExecutionResult) => apiClient.put<WorkflowResult>(`/pms/work-orders/${id}/progress`, result),
  submit: (id: string, result: ExecutionResult, commandId: string) => apiClient.post<WorkflowResult>(`/pms/work-orders/${id}/submit`, { ...result, commandId }),
  decide: (order: WorkOrder, report: Report, approve: boolean, reason: string) => apiClient.post(`/pms/work-orders/${order.id}/${approve ? 'approve' : 'return'}`, { expectedVersion: order.workflowVersion, revision: report.revision, reportHash: report.contentHash, reason }),
  cancel: (order: WorkOrder, reason: string) => apiClient.post(`/pms/work-orders/${order.id}/cancel`, { expectedVersion: order.workflowVersion, reason }),
  report: (id: string, revision: number) => apiClient.get<Report>(`/pms/work-orders/${id}/reports/${revision}`),
  history: (id: string, params: Record<string, unknown>) => apiClient.get<Page<HistoryRow>>(`/pms/jobs/${id}/history`, { params }),
  completedReport: (jobId: string, id: string) => apiClient.get<Report>(`/pms/jobs/${jobId}/completed-reports/${id}`),
  legacyReport: (jobId: string, id: string) => apiClient.get<{ reportSnapshot?: string }>(`/pms/jobs/${jobId}/history/${id}`),
  materials: (search: string, selectedIds?: string) => apiClient.get<Page<MaterialOption>>('/pms/work-orders/material-options', { params: { search, selectedIds, pageSize: selectedIds ? 200 : 30 } }),
  counters: (params: Record<string, unknown>) => apiClient.get<Page<Counter>>('/pms/counters', { params }),
  updateCounter: (id: string, value: number) => apiClient.patch(`/equipment-assets/${id}/running-hours`, value),
}
export function usePmsQuery<T>(key: unknown[], queryFn: () => Promise<T>, enabled = true) {
  const session = useAuthStore(s => s.accessToken)
  return useQuery({ queryKey: ['pms-rework', session, ...key], queryFn, enabled, staleTime: 15000, gcTime: 60000, retry: false, refetchOnWindowFocus: true })
}
export function usePmsRefresh() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: ['pms-rework'] })
}
export function usePmsPermissions() {
  const state = usePermissionsStore()
  return { enabled: state.loaded && state.modules.some(m => m.code === 'pms.jobs'),
    job: (action: string) => hasPermission(state, `pms.jobs.${action}`) || hasPermission(state, `pms.config.${action}`),
    work: (action: string) => hasPermission(state, `pms.work.${action}`), counter: (action: string) => hasPermission(state, `pms.counter.${action}`) }
}
export function usePmsClock() {
  const settings = usePmsQuery(['settings'], pms.settings)
  const zone = settings.data?.vesselTimeZone
  return { zone, automaticReleaseEnabled: settings.data?.automaticReleaseEnabled === true, error: settings.error,
    date: (value?: string | null) => !value ? '—' : zone ? new Intl.DateTimeFormat('vi-VN', { timeZone: zone, dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value)) : 'Đang tải múi giờ…',
    due: (at?: string | null, hours?: number | null) => [at ? zone ? new Intl.DateTimeFormat('vi-VN', { timeZone: zone }).format(new Date(at)) : 'Đang tải múi giờ…' : '', hours != null ? `${hours.toLocaleString('vi-VN')} giờ` : ''].filter(Boolean).join(' / ') || '—' }
}
// Snapshots preserve their exact bytes/hash. Normalize keys only in this read-only view model.
export function snapshot<T>(text?: string): T | null {
  if (!text) return null
  const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key[0].toLowerCase() + key.slice(1), normalize(item)])) : value
  return normalize(JSON.parse(text)) as T
}
export const label: Record<string, string> = { PERIODIC: 'Định kỳ', AD_HOC: 'Đột xuất', DRY_DOCK: 'Lên đà', ON_DEMAND: 'Theo yêu cầu', VOYAGE: 'Theo chuyến',
  ACTIVE: 'Hoạt động', NEEDS_INFORMATION: 'Cần bổ sung thông tin', PAUSED: 'Tạm dừng', RETIRED: 'Ngừng áp dụng', REMOVED: 'Đã xóa',
  DRAFT: 'Nháp', UNASSIGNED: 'Chờ phân công', ASSIGNED: 'Đã phân công', IN_PROGRESS: 'Đang thực hiện', RECTIFY: 'Cần làm lại', PENDING_APPROVAL: 'Chờ duyệt', COMPLETED: 'Hoàn thành', CANCELLED: 'Đã hủy',
  UPCOMING: 'Sắp đến hạn', DUE: 'Đến hạn', OVERDUE: 'Quá hạn', NOT_DUE: 'Chưa đến hạn', NO_DEADLINE: 'Chưa có hạn',
  NORMAL: 'Trung bình', HIGH: 'Cao', LOW: 'Thấp', CRITICAL: 'Khẩn cấp', APPROVED: 'Đã duyệt', RETURNED: 'Đã trả lại' }
export const date = (value?: string | null) => value ? new Date(value).toLocaleString('vi-VN') : '—'
export const due = (at?: string | null, hours?: number | null) => [at ? new Date(at).toLocaleDateString('vi-VN') : '', hours != null ? `${hours.toLocaleString('vi-VN')} giờ` : ''].filter(Boolean).join(' / ') || '—'
export const cycle = (job: Pick<Job, 'category' | 'intervalDays' | 'intervalMonths' | 'intervalYears' | 'intervalHours'>) => job.category !== 'PERIODIC' ? label[job.category] : [job.intervalDays ? `${job.intervalDays} ngày` : '', job.intervalMonths ? `${job.intervalMonths} tháng` : '', job.intervalYears ? `${job.intervalYears} năm` : '', job.intervalHours ? `${job.intervalHours} giờ` : ''].filter(Boolean).join(' / ') || 'Chưa có chu kỳ'
export const message = (error: unknown) => error instanceof Error ? error.message : 'Không thể thực hiện thao tác.'
