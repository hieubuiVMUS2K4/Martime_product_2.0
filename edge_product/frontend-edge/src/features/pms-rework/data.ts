import { translateMessage as tx, localizePmsMessage, messageLocale, useMessageLocale } from '@/i18n/messages'
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
  useMessageLocale()

  const settings = usePmsQuery(['settings'], pms.settings)
  const zone = settings.data?.vesselTimeZone
  return { zone, automaticReleaseEnabled: settings.data?.automaticReleaseEnabled === true, error: settings.error,
    date: (value?: string | null) => !value ? '—' : zone ? new Intl.DateTimeFormat(messageLocale(), { timeZone: zone, dateStyle: 'short', timeStyle: 'medium' }).format(new Date(value)) : tx("pmsRework.loadingVesselTimeZone"),
    due: (at?: string | null, hours?: number | null) => [at ? zone ? new Intl.DateTimeFormat(messageLocale(), { timeZone: zone }).format(new Date(at)) : tx("pmsRework.loadingVesselTimeZone") : '', hours != null ? tx(hours === 1 ? "pmsRework.hoursSingular" : "pmsRework.hours", { p0: hours.toLocaleString(messageLocale()) }) : ''].filter(Boolean).join(' / ') || '—' }
}
// Snapshots preserve their exact bytes/hash. Normalize keys only in this read-only view model.
export function snapshot<T>(text?: string): T | null {
  if (!text) return null
  const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key[0].toLowerCase() + key.slice(1), normalize(item)])) : value
  return normalize(JSON.parse(text)) as T
}
export const label: Record<string, string> = { get PERIODIC() { return tx("pmsRework.periodic") }, get AD_HOC() { return tx("pmsRework.adHoc") }, get DRY_DOCK() { return tx("pmsRework.dryDock") }, get ON_DEMAND() { return tx("pmsRework.onDemand") }, get VOYAGE() { return tx("pmsRework.perVoyage") },
  get ACTIVE() { return tx("pmsRework.active") }, get NEEDS_INFORMATION() { return tx("pmsRework.informationRequired") }, get PAUSED() { return tx("pmsRework.paused") }, get RETIRED() { return tx("pmsRework.retired") }, get REMOVED() { return tx("pmsRework.deleted") },
  get DRAFT() { return tx("pmsRework.draft") }, get UNASSIGNED() { return tx("pmsRework.awaitingAssignment") }, get ASSIGNED() { return tx("pmsRework.assigned") }, get IN_PROGRESS() { return tx("pmsRework.inProgress") }, get RECTIFY() { return tx("pmsRework.reworkRequired") }, get PENDING_APPROVAL() { return tx("pmsRework.pendingApproval") }, get COMPLETED() { return tx("pmsRework.completed") }, get CANCELLED() { return tx("pmsRework.cancelled") },
  get UPCOMING() { return tx("pmsRework.upcoming") }, get DUE() { return tx("pmsRework.due") }, get OVERDUE() { return tx("pmsRework.overdue") }, get NOT_DUE() { return tx("pmsRework.notDue") }, get NO_DEADLINE() { return tx("pmsRework.noDeadline") },
  get NORMAL() { return tx("pmsRework.normal") }, get HIGH() { return tx("pmsRework.high") }, get LOW() { return tx("pmsRework.low") }, get CRITICAL() { return tx("pmsRework.critical") }, get APPROVED() { return tx("pmsRework.approved") }, get RETURNED() { return tx("pmsRework.returned") } }
export const date = (value?: string | null) => value ? new Date(value).toLocaleString(messageLocale()) : '—'
export const due = (at?: string | null, hours?: number | null) => [at ? new Date(at).toLocaleDateString(messageLocale()) : '', hours != null ? tx(hours === 1 ? "pmsRework.hoursSingular" : "pmsRework.hours", { p0: hours.toLocaleString(messageLocale()) }) : ''].filter(Boolean).join(' / ') || '—'
export const cycle = (job: Pick<Job, 'category' | 'intervalDays' | 'intervalMonths' | 'intervalYears' | 'intervalHours'>) => job.category !== 'PERIODIC' ? label[job.category] : [job.intervalDays ? tx(job.intervalDays === 1 ? "pmsRework.daysSingular" : "pmsRework.days", { p0: job.intervalDays }) : '', job.intervalMonths ? tx(job.intervalMonths === 1 ? "pmsRework.monthsSingular" : "pmsRework.months", { p0: job.intervalMonths }) : '', job.intervalYears ? tx(job.intervalYears === 1 ? "pmsRework.yearsSingular" : "pmsRework.years", { p0: job.intervalYears }) : '', job.intervalHours ? tx(job.intervalHours === 1 ? "pmsRework.hoursSingular" : "pmsRework.hours", { p0: job.intervalHours }) : ''].filter(Boolean).join(' / ') || tx("pmsRework.noIntervalConfigured")
export const message = (error: unknown) => error instanceof Error ? localizePmsMessage(error.message) : tx("pmsRework.theActionCouldNotBeCompleted")
