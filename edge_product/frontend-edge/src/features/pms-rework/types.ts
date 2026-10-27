export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
export interface ChecklistTemplate { sequenceOrder: number; checkpointDescription: string; requiresReading: boolean; normalRangeMin?: number | null; normalRangeMax?: number | null; unit?: string | null }
export interface CrewOption { id: string; crewId: string; fullName: string; rankId?: number; department?: string }
export interface RankOption { id: number; rankName: string; department?: string }
export interface Job {
  id: string; code: string; workCode?: string; name: string; equipmentAssetId?: string; equipmentName?: string;
  category: string; intervalType: string; intervalDays?: number; intervalMonths?: number; intervalYears?: number; intervalHours?: number;
  lastSubmittedAt?: string; lastRunningHours?: number; nextDueAt?: string; nextDueHours?: number; department?: string;
  responsibleRankId?: number; responsibleCrewId?: string; responsibleName?: string; state: string; version: number;
  autoGenerate: boolean; openWorkOrderId?: string; openWorkOrderCode?: string; canDelete?: boolean;
}
export interface JobDefinition {
  expectedVersion?: number; code: string; workCode?: string | null; name: string; equipmentAssetId: string | null;
  category: string; intervalType: string; intervalDays: number | null; intervalMonths: number | null; intervalYears: number | null; intervalHours: number | null;
  baselineAt: string | null; baselineRunningHours: number | null; baselineSource: string | null; changeReason?: string | null;
  warningDays: number; warningHours: number; releasePolicy: string; autoGenerate: boolean; priority: string; department: string | null;
  responsibleRankId: number | null; responsibleCrewId: string | null; assignmentPolicy: string; defaultCrewId: string | null;
  instructions: string | null; checklist: ChecklistTemplate[];
}
export interface JobDetail {
  job: Job; cycleKey: string; requiresCycleResolution: boolean; cancelledWorkOrderId?: string; instructions?: string; baselineAt?: string; baselineRunningHours?: number;
  baselineSource?: string; daysBeforeDue: number; warningHours: number; releasePolicy: string; assignmentPolicy: string; defaultCrewId?: string;
  priority: string; checklist: ChecklistTemplate[]; equipmentMaterials: { id: string; itemCode: string; name: string; unit?: string }[]; missingInformation: string[];
}
export interface JobImpact {
  previousDueAt?: string; previousDueHours?: number; nextDueAt?: string; nextDueHours?: number;
  state: string; openWorkOrders: number; baselineChanged: boolean; reasonRequired: boolean;
  usesApprovedExecution: boolean; automaticReleaseRequested: boolean; missingInformation: string[];
}
export interface WorkOrder {
  id: string; code: string; jobId?: string; name: string; equipmentAssetId?: string; equipmentName?: string;
  dueAt?: string; dueHours?: number; dueState: string; status: string; assignedTo?: string; assignedName?: string; department?: string;
  priority: string; reportRevision: number; workflowVersion: number; updatedAt: string;
}
export interface ExecutionChecklist { id: string; checkpointDescription: string; sequenceOrder: number; requiresReading: boolean; normalRangeMin?: number; normalRangeMax?: number; unit?: string; isCompleted: boolean; readingValue?: number | null; remarks?: string | null }
export interface ReportMeta { id: string; revision: number; contentHash: string; submittedAt: string; submittedByCrewId: string; decision?: string; decidedAt?: string; decidedByCrewId?: string; decisionReason?: string }
export interface WorkOrderDetail {
  workOrder: WorkOrder; taskType: string; workOrderInstructions?: string; dueDate?: string; warningDays?: number; warningHours?: number;
  missingInformation: string[]; draftChecklistJson?: string; jobSnapshot?: string; notes?: string; sparePartsUsed?: string;
  actualRunningHours?: number; actualDurationMinutes?: number; supportingCrewIds?: string; startedAt?: string;
  rejectionReason?: string; checklist: ExecutionChecklist[]; timeline: { id: string; changedAt: string; changedBy: string; reason: string }[]; reports: ReportMeta[];
}
export interface AdHocDefinition {
  name: string; equipmentAssetId: string | null; instructions: string | null; priority: string; department: string | null;
  dueDate: string | null; dueHours: number | null; warningDays: number; warningHours: number; crewId: string | null;
  supportingCrewIds: string[]; checklist: ChecklistTemplate[];
}
export interface WorkflowResult { id: string; status: string; version: number; revision: number; reportId?: string; reportHash?: string }
export interface ExecutionResult {
  expectedVersion: number; notes: string; actualDurationMinutes: number | null; runningHours: number | null;
  checklist: { id: string; completed: boolean; reading: number | null; remarks: string }[];
  materials: { materialItemId: string; quantity: number }[];
}
export interface Report extends ReportMeta { snapshotJson: string; approvalEvidenceJson?: string }
export interface Submission {
  code: string; name: string; jobSnapshot?: string; submittedAt: string; submittedByCrewId: string; notes?: string;
  durationMinutes: number; runningHours?: number; dueAt?: string; dueHours?: number;
  checklist: { id: string; description: string; completed: boolean; reading?: number; unit?: string; remarks?: string; isAbnormal: boolean }[];
  materials: { materialItemId: string; code: string; name: string; unit?: string; quantity: number }[];
  contributors: { userId: number; crewId: string }[];
}
export interface HistoryRow { id: string; workOrderId: string; workOrderCode?: string; sourceExecutedAt: string; submittedAt?: string; approvedAt?: string; completedBy?: string; approvedBy?: string; executedRunningHours?: number; isLegacy: boolean; hasReport: boolean }
export interface MaterialOption { id: string; itemCode: string; name: string; unit?: string; onHand: number }
export interface Counter { id: string; assetCode: string; assetName: string; currentRunningHours?: number; lastRunningHoursUpdate?: string }
export interface EquipmentNode { id: string; assetCode: string; assetName: string; category: string; parentId?: string; isActive: boolean; status: string }
