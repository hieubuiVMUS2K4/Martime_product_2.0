// ============================================================
// TYPE DEFINITIONS - Based on EdgeModels.cs
// ============================================================

// Pagination Response Type
export interface PaginationInfo {
  currentPage: number
  pageSize: number
  totalCount: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: PaginationInfo
}

export interface PositionData {
  id: number
  timestamp: string
  latitude: number
  longitude: number
  altitude?: number
  speedOverGround?: number
  courseOverGround?: number
  magneticVariation?: number
  fixQuality: number
  satellitesUsed: number
  hdop?: number
  source: string
  isSynced: boolean
  createdAt: string
}

export interface NavigationData {
  id: number
  timestamp: string
  headingTrue?: number
  headingMagnetic?: number
  rateOfTurn?: number
  pitch?: number
  roll?: number
  speedThroughWater?: number
  depth?: number
  windSpeedRelative?: number
  windDirectionRelative?: number
  windSpeedTrue?: number
  windDirectionTrue?: number
  isSynced: boolean
  createdAt: string
}

export interface EngineData {
  id: number
  timestamp: string
  engineId: string
  rpm?: number
  loadPercent?: number
  coolantTemp?: number
  exhaustTemp?: number
  lubeOilPressure?: number
  lubeOilTemp?: number
  fuelPressure?: number
  fuelRate?: number
  runningHours?: number
  startCount?: number
  alarmStatus?: number
  isSynced: boolean
  createdAt: string
}

export interface GeneratorData {
  id: number
  timestamp: string
  generatorId: string
  isRunning: boolean
  voltage?: number
  frequency?: number
  current?: number
  activePower?: number
  powerFactor?: number
  runningHours?: number
  loadPercent?: number
  isSynced: boolean
  createdAt: string
}

export interface TankLevel {
  id: number
  timestamp: string
  tankId: string
  tankType: string
  levelPercent: number
  volumeLiters?: number
  temperature?: number
  isSynced: boolean
  createdAt: string
}

export interface FuelConsumption {
  id: number
  timestamp: string
  fuelType: string
  consumedVolume: number
  consumedMass: number
  tankId?: string
  density?: number
  distanceTraveled?: number
  timeUnderway?: number
  cargoWeight?: number
  co2Emissions?: number
  isSynced: boolean
  createdAt: string
}

export interface EnvironmentalData {
  id: number
  timestamp: string
  airTemperature?: number
  barometricPressure?: number
  humidity?: number
  seaTemperature?: number
  windSpeed?: number
  windDirection?: number
  waveHeight?: number
  visibility?: number
  isSynced: boolean
  createdAt: string
}

export interface SafetyAlarm {
  id: number
  timestamp: string
  alarmType: string
  alarmCode?: string
  severity: 'CRITICAL' | 'WARNING' | 'INFO'
  location?: string
  description?: string
  isAcknowledged: boolean
  acknowledgedAt?: string
  acknowledgedBy?: string
  isResolved: boolean
  resolvedAt?: string
  isSynced: boolean
  createdAt: string
}

export interface AisData {
  id: number
  timestamp: string
  mmsi: string
  messageType: number
  navigationStatus?: number
  rateOfTurn?: number
  speedOverGround?: number
  positionAccuracy?: boolean
  latitude?: number
  longitude?: number
  courseOverGround?: number
  trueHeading?: number
  imoNumber?: string
  callSign?: string
  shipName?: string
  shipType?: number
  dimensionBow?: number
  dimensionStern?: number
  dimensionPort?: number
  dimensionStarboard?: number
  etaMonth?: number
  etaDay?: number
  etaHour?: number
  etaMinute?: number
  draught?: number
  destination?: string
  isSynced: boolean
  createdAt: string
}

export interface VoyageRecord {
  id: string   // Guid
  voyageNumber: string
  vesselIMO?: string
  vesselName?: string
  vesselFlag?: string
  callSign?: string
  departurePort?: string
  departurePortCode?: string
  departureTime?: string
  arrivalPort?: string
  arrivalPortCode?: string
  arrivalTime?: string
  previousPortCode?: string
  previousPortName?: string
  cargoType?: string
  cargoWeight?: number
  distanceTraveled?: number
  fuelConsumed?: number
  averageSpeed?: number
  voyageStatus: string
  isSynced: boolean
  createdAt: string
}

// ============================================================
// OPERATIONAL TABLES (SOLAS/ISM/MARPOL Compliance)
// ============================================================

export interface CrewMember {
  id: string // Guid
  crewId: string
  fullName: string
  rankId?: number // Foreign key to Ranks table
  rank?: Rank // Navigation property
  department?: string
  countryId?: number
  countryName?: string
  dateOfBirth?: string
  phoneNumber?: string
  address?: string
  
  // Position & Employment
  joinDate?: string
  embarkDate?: string
  disembarkDate?: string
  contractEnd?: string
  isOnboard: boolean
  
  // Travel Documents
  passportNumber?: string
  passportExpiry?: string
  visaNumber?: string
  visaExpiry?: string
  seamanBookNumber?: string
  
  // Emergency Contact
  emergencyContact?: string
  emailAddress?: string
  
  // Additional
  notes?: string
  
  // BIO-DATA FIELDS (Added 2026-02-25)
  // Personal Information
  placeOfBirth?: string
  idCardNumber?: string
  maritalStatus?: string // Single, Married, Divorced, Widowed
  height?: number // cm
  weight?: number // kg
  bloodGroup?: string // A+, A-, B+, B-, AB+, AB-, O+, O-
  clothingSize?: string
  shoeSize?: string
  cateringSize?: string
  isSmoker?: boolean
  isCovidVaccinated?: boolean
  photoUrl?: string
  
  // Next of Kin Information
  nextOfKinName?: string
  nextOfKinRelation?: string // Father, Mother, Spouse, Sibling, Child, Other
  nextOfKinPhone?: string
  nextOfKinAddress?: string
  
  // Education Information
  educationInstitution?: string // Vietnam Maritime University
  educationCourse?: string // Marine Engineering, Nautical Science
  educationPeriodYears?: number
  educationGraduationYear?: number
  
  // Certificates (new system - relation to CrewCertificate[])
  certificates?: CrewCertificate[]
  
  // Legacy certificate fields (for backward compatibility)
  // TODO: Migrate to certificates[] array in future refactor
  certificateNumber?: string
  certificateExpiry?: string
  certificateIssue?: string
  medicalExpiry?: string
  
  isSynced: boolean
  createdAt: string

  // Onboard Review Status
  onboardStatus?: string // 'PendingReview' | 'Approved' | 'OnHold'
  onboardStatusChangedAt?: string
  onboardStatusChangedBy?: string
  reviewChecklist?: string // JSON checklist of verified sections
  reviewNotes?: string // Notes about missing info for shore
  edgeChanges?: string // JSON array of field changes made by edge
  edgeChangesViewed?: boolean
}

// Certificate Types (Master Data)
export interface Certificate {
  id: number
  certificateCode: string // STCW_II_2, MEDICAL, BASIC_SAFETY
  certificateName: string // Certificate of Competency - Master
  category?: string // COMPETENCY, MEDICAL, PROFICIENCY, SAFETY
  validityPeriodMonths?: number
  description?: string
  isMandatory: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// Country - List of countries (ISO 3166-1)
export interface Country {
  id: number
  countryCode: string // ISO 3166-1 alpha-3: VNM, USA, GBR, PHL
  countryName: string // Vietnam, United States, United Kingdom
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// Rank - Ship positions/ranks
export interface Rank {
  id: number
  rankCode: string // Mã cấp bậc: CAPT, C/O, 2/O, etc.
  rankName: string // Tên cấp bậc: Captain, Chief Officer, etc.
  isActive: boolean
  department: string
  level?: string | null
  sortOrder: number
}

// Crew Certificate (actual certificate of crew member)
export interface CrewCertificate {
  id: number
  crewMemberId: string
  certificateId: number
  certificateNumber: string // Số chứng chỉ thực tế
  issueDate: string
  expiryDate: string
  issuingAuthority?: string
  certificateOfCompetency?: string // Chứng chỉ năng lực
  countryId?: number // Quốc gia cấp chứng chỉ
  documentFilePath?: string // File path for scanned certificate
  status: 'VALID' | 'EXPIRED' | 'SUSPENDED'
  notes?: string
  isSynced: boolean
  originNode: string
  createdAt: string
  updatedAt: string
  
  // Navigation properties (from API)
  certificate?: Certificate
  crewMember?: CrewMember
  country?: Country
}

// Service Record (crew member's sea service history)
export interface ServiceRecord {
  id: string
  crewMemberId: string
  // Vessel Information
  vesselName?: string
  vesselFlag?: string
  vesselType?: string
  vesselGrt?: number
  vesselDwt?: number
  vesselYearBuilt?: number
  tradeArea?: string // Coastal, Deep Sea, International
  // Engine Details
  mainEngineType?: string
  mainEnginePowerKw?: number
  mainEngineMaker?: string
  boilerType?: string
  hasExhaustGasScrubber?: boolean
  ecdis?: string
  // Employment Details
  rankAtTime?: string // Rank/Position during this service
  boardingDate?: string
  disembarkDate?: string
  boardingPort?: string
  disembarkPort?: string
  totalServiceDays?: number
  // Metadata
  isSynced: boolean
  createdAt: string
  updatedAt: string
  originNode: string
  // Navigation properties
  crewMember?: CrewMember
}

// Task Status - Updated v2.0 (PMS Workflow)
export type MaintenanceTaskStatus = 
  | 'SCHEDULED'      // Auto-generated, not yet due
  | 'UPCOMING'       // Within DaysBeforeDue window — "Sắp đến hạn"
  | 'DUE'           // Ready for execution
  | 'OVERDUE'       // Past due date
  | 'IN_PROGRESS'   // Crew working on it
  | 'PENDING_APPROVAL' // Waiting for C/E/Master verification
  | 'RECTIFY'       // Returned for correction (replaces REJECTED)
  | 'COMPLETED'     // Approved and done
  | 'CANCELLED'     // Task cancelled
  // Legacy statuses for backward compatibility
  | 'TASK' | 'MISSING_BOTH' | 'MISSING_CHECKLIST' | 'MISSING_PIC' | 'PENDING' | 'REJECTED'

export interface MaintenanceTask {
  id: string  // GUID from backend
  taskId: string
  taskTypeId?: number
  
  // LEGACY: Individual asset fields (nullable for backward compatibility)
  equipmentId?: string
  equipmentName?: string
  
  // NEW: Equipment group fields (for group-based tasks)
  equipmentGroupId?: string
  equipmentGroupName?: string
  
  // NEW: Per-asset fields (from per-equipment schedules)
  equipmentAssetId?: string
  equipmentAssetName?: string
  
  // Schedule reference
  scheduleId?: string
  
  taskType: string
  taskDescription: string
  intervalHours?: number
  intervalDays?: number
  daysBeforeDue?: number
  lastDoneAt?: string
  nextDueAt: string
  runningHoursAtLastDone?: number
  currentRunningHours?: number
  nextDueRunningHours?: number
  priority: 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW'
  status: MaintenanceTaskStatus
  assignedTo?: string
  assignedDepartment?: 'ENGINE' | 'DECK'
  
  // ============ DEFERRAL TRACKING ============
  hasPendingDeferral: boolean
  deferralCount: number
  lastDeferredAt?: string
  lastDeferredBy?: string
  
  // ============ EXECUTION TRACKING ============
  startedAt?: string
  startedBy?: string
  actualRunningHours?: number
  estimatedDuration?: number // hours
  actualDuration?: number // minutes
  
  // ============ REPORT DATA ============
  checklistCompleted: boolean
  photosUploaded: number
  requiredPhotos: number
  completionPhotos?: string // JSON array of photo URLs
  notes?: string
  sparePartsUsed?: string
  
  // ============ SUBMISSION ============
  submittedAt?: string
  submittedBy?: string
  
  // ============ VERIFICATION ============
  verifiedAt?: string
  verifiedBy?: string
  verificationResult?: 'APPROVED' | 'REJECTED'
  verificationNotes?: string
  
  // ============ RECTIFY TRACKING ============
  rejectionReason?: string
  rejectionCount: number
  lastRejectedAt?: string
  lastRejectedBy?: string
  rejectionHistory?: Array<{
    reason: string
    by: string
    at: string
  }>
  
  // ============ COMPLETION ============
  completedAt?: string
  completedBy?: string
  
  // ============ CANCELLATION ============
  cancelledAt?: string
  cancelledBy?: string
  cancellationReason?: string
  
  // ============ ĐGRR / BBKT ============
  requireRiskAssessment?: boolean
  requireInspectionReport?: boolean

  // ============ CMS ============
  isCms: boolean
  
  // ============ LEGACY ============
  approvedBy?: string
  approvedAt?: string
  
  // ============ AUDIT ============
  isSynced: boolean
  createdAt: string
  updatedAt?: string
  originNode?: string
  
  // ============ RELATED DATA ============
  checklistItems?: TaskChecklistItem[]
  
  // Required spare parts - can be JSON string from DB or parsed array
  requiredSpareParts?: string | Array<{
    id?: string
    materialItemId: string
    materialCode?: string
    materialName?: string
    quantityRequired: number
    isMandatory: boolean
    notes?: string
  }>
  
  // Status history (loaded on demand)
  statusHistory?: TaskStatusHistory[]
  
  // Pending deferral (loaded on demand)
  pendingDeferral?: DeferralRequest
}

// ============================================================
// DEFERRAL REQUEST TYPES
// ============================================================

export interface DeferralRequest {
  id: string // Guid
  taskId: string
  taskCode?: string
  taskDescription?: string
  equipmentName?: string
  
  requestedBy: string
  requestedByName?: string
  requestedAt: string
  reason: string
  
  currentDueDate: string
  proposedDueDate: string
  deferralDays: number
  
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  priority: 'LOW' | 'NORMAL' | 'HIGH'
  
  isCmsItem: boolean
  classPermissionLetter?: string
  
  reviewedBy?: string
  reviewedByName?: string
  reviewedAt?: string
  reviewNotes?: string
  
  // OVERDUE deferral fields (PMS Workflow v2.0 - Section 3.4)
  isOverdueDeferral?: boolean
  rootCause?: string
  preventiveMeasures?: string
  attachments?: string[]
  taskStatusAtRequest?: string
  createdAt: string
}

export interface CreateDeferralRequestDto {
  taskId: string
  reason: string // min 20 chars
  proposedDueDate: string
  priority?: 'LOW' | 'NORMAL' | 'HIGH'
  attachments?: string[]
  classPermissionLetter?: string // required if CMS && deferral > 90 days
}

export interface ReviewDeferralRequestDto {
  action: 'APPROVE' | 'REJECT'
  notes?: string
  adjustedDueDate?: string // reviewer can modify proposed date
}

// ============================================================
// TASK STATUS HISTORY
// ============================================================

export interface TaskStatusHistory {
  id: string
  taskId: string
  fromStatus?: string
  toStatus: string
  changedBy: string
  changedByName?: string
  changedAt: string
  reason?: string
  notes?: string
  deviceType?: 'WEB' | 'MOBILE'
}

// ============================================================
// TASK WORKFLOW DTOs
// ============================================================

export interface StartTaskDto {
  taskId: string
  currentRunningHours?: number
  notes?: string
}

export interface SubmitTaskDto {
  taskId: string
  completedRunningHours?: number
  notes?: string
  sparePartsUsed?: string
  photoUrls?: string[]
}

export interface VerifyTaskDto {
  taskId: string
  action: 'APPROVE' | 'REJECT'
  notes?: string
  rejectionReason?: string // required if action = REJECT
}

// ============================================================
// APPROVAL DASHBOARD
// ============================================================

export interface ApprovalDashboardSummary {
  pendingApprovalCount: number
  pendingDeferralCount: number
  rectifyTaskCount: number
  overdueTaskCount: number
  todayDueCount: number
  thisWeekDueCount: number
}

export interface MorningBriefing {
  date: string
  overdueTasksEngine: number
  overdueTasksDeck: number
  dueToday: number
  pendingApproval: number
  pendingDeferral: number
  tasksInProgress: number
  completedYesterday: number
  topPriorityTasks?: TaskSummary[]
}

export interface TaskSummary {
  id: string
  taskId: string
  taskDescription: string
  equipmentName?: string
  priority: string
  status: string
  nextDueAt: string
  assignedTo?: string
  assignedDepartment?: string
  daysOverdue?: number
}

// Task Checklist Items - Per-asset tracking within group maintenance tasks
export interface TaskChecklistItem {
  id: string
  taskId: string
  assetId: string
  assetCode: string
  assetName: string
  sequenceOrder: number
  isCompleted: boolean
  completedAt?: string
  completedBy?: string
  readingValue?: number  // Pressure, temperature, voltage readings
  remarks?: string       // Specific notes per asset
  isAbnormal: boolean    // Flag for abnormal conditions
  createdAt: string
}

// DTO for updating checklist item
export interface UpdateChecklistItemDto {
  isCompleted?: boolean
  readingValue?: number
  remarks?: string
  isAbnormal?: boolean
  completedBy?: string
}

// DTO for completing checklist item with data
export interface CompleteChecklistItemDto {
  readingValue?: number
  remarks?: string
  isAbnormal: boolean
  completedBy: string
}

// Helper interface for parsed schedule info from task
export interface TaskScheduleInfo {
  scheduleCode?: string
  groupName?: string
  isAutoGenerated: boolean
}

// Helper function to parse schedule info from task notes
export function parseTaskScheduleInfo(task: MaintenanceTask): TaskScheduleInfo {
  if (!task.notes) {
    return { isAutoGenerated: false }
  }
  
  // Parse format: "Auto-generated from schedule: {ScheduleCode} (Group: {GroupName})"
  const scheduleMatch = task.notes.match(/Auto-generated from schedule: ([\w-]+)/)
  const groupMatch = task.notes.match(/\(Group: ([^)]+)\)/)
  
  return {
    scheduleCode: scheduleMatch?.[1],
    groupName: groupMatch?.[1],
    isAutoGenerated: !!scheduleMatch
  }
}

export interface CargoOperation {
  id: number
  operationId: string
  voyageId?: number
  operationType: 'LOADING' | 'DISCHARGING'
  cargoType: string
  cargoDescription?: string
  quantity: number
  unit: string
  loadingPort?: string
  dischargePort?: string
  loadedAt?: string
  dischargedAt?: string
  shipper?: string
  consignee?: string
  billOfLading?: string
  sealNumbers?: string
  specialRequirements?: string
  status: 'PLANNED' | 'LOADING' | 'LOADED' | 'DISCHARGING' | 'DISCHARGED'
  isSynced: boolean
  createdAt: string
}

export interface WatchkeepingLog {
  id: number
  watchDate: string
  watchPeriod: string // 00-04, 04-08, 08-12, 12-16, 16-20, 20-24
  watchType: 'NAVIGATION' | 'ENGINE'
  officerOnWatch: string
  reliefOfficer?: string // Officer taking over watch
  lookout?: string
  
  // STCW Rest Hours Compliance
  workHours: number
  restHoursLast24h: number
  restHoursLast7Days: number
  restHoursCompliant: boolean
  restHoursException?: string
  
  // Weather & Navigation
  weatherConditions?: string
  seaState?: string // Douglas Sea Scale
  visibility?: string
  courseLogged?: number
  speedLogged?: number
  positionLat?: number
  positionLon?: number
  distanceRun?: number
  
  // Bridge Equipment Status
  engineStatus?: string
  radarOperational: boolean
  ecdisOperational: boolean
  aisOperational: boolean
  gyroOperational: boolean
  autopilotEngaged: boolean
  equipmentDefects?: string
  
  // GMDSS Watch
  gmdssWatchMaintained: boolean
  navigationWarningsReceived?: string
  
  // Watch Events & Handover
  notableEvents?: string
  handoverNotes?: string
  handoverChecklistCompleted: boolean
  watchStartTime?: string
  watchEndTime?: string
  
  // Bridge Manning
  bridgeManningLevel: number
  lookoutPosted: boolean
  
  // Fatigue Management (MLC 2006)
  fatigueRiskLevel?: 'LOW' | 'MEDIUM' | 'HIGH'
  fatigueAssessmentDone: boolean
  
  masterSignature?: string
  signedAt?: string
  isSynced: boolean
  createdAt: string
}

export interface OilRecordBook {
  id: number
  entryDate: string
  operationCode: string
  operationDescription: string
  locationLat?: number
  locationLon?: number
  quantity?: number
  quantityUnit?: string
  tankFrom?: string
  tankTo?: string
  officerInCharge: string
  masterSignature?: string
  remarks?: string
  isSynced: boolean
  createdAt: string
}

export interface SyncQueue {
  id: number
  tableName: string
  recordId: number
  payload: string
  priority: number
  retryCount: number
  maxRetries: number
  nextRetryAt?: string
  lastError?: string
  createdAt: string
  syncedAt?: string
}

// ============================================================
// TASK MANAGEMENT SYSTEM
// ============================================================

export interface TaskType {
  id: number
  taskTypeCode: string
  typeName: string
  category: string
  description?: string | null
  estimatedDurationMinutes?: number | null
  requiresApproval: boolean
  priority: string
  isActive: boolean
  createdAt: string
  updatedAt?: string | null
  totalDetails?: number
  completedTasks?: number
  pendingTasks?: number
}

export interface TaskDetail {
  id: number
  taskTypeId: number
  detailCode: string
  detailName: string
  detailType: string
  orderIndex: number
  description?: string | null
  isMandatory: boolean
  expectedValue?: string | null
  minValue?: number | null
  maxValue?: number | null
  unit?: string | null
  isActive: boolean
  createdAt: string
  updatedAt?: string | null
}

export interface TaskTypeWithDetails {
  taskType: TaskType
  details: TaskDetail[]
}

export interface TaskTypeCategoryStats {
  category: string
  count: number
  activeCount: number
  totalDetails: number
}

// ============================================================
// UI/UX Types
// ============================================================

export interface DashboardStats {
  totalAlarms: number
  criticalAlarms: number
  pendingMaintenance: number
  crewOnboard: number
  fuelLevel: number
  syncStatus: 'ONLINE' | 'OFFLINE' | 'SYNCING'
  lastSyncAt?: string
  unsyncedRecords: number
}

export interface AlarmSummary {
  critical: number
  warning: number
  info: number
  unacknowledged: number
}

export interface MaterialCategory {
  id: number;
  categoryCode: string;
  name: string;
  description?: string | null;
  parentCategoryId?: number | null;
  isActive: boolean;
  isSynced: boolean;
  createdAt: string;
}

export interface MaterialItem {
  id: string; // Guid
  itemCode: string;
  name: string;
  categoryId: number;
  specification?: string | null;
  unit: string;
  onHandQuantity: number;
  minStock?: number | null;
  maxStock?: number | null;
  reorderLevel?: number | null;
  reorderQuantity?: number | null;
  location?: string | null;
  manufacturer?: string | null;
  supplier?: string | null;
  partNumber?: string | null;
  barcode?: string | null;
  batchTracked: boolean;
  serialTracked: boolean;
  expiryRequired: boolean;
  unitCost?: number | null;
  currency: string;
  notes?: string | null;
  imageUrl?: string | null;
  isActive: boolean;
  isSynced: boolean;
  createdAt: string;
}

export interface CrewLogbookEntry {
  id: string;
  crewMemberId: string;
  entryOrigin: string; // SHORE, EDGE
  entryType: string; // SHORE, WATCH, INCIDENT, TRAINING
  title: string;
  description: string;
  entryDate: string;
  createdBy?: string;
  status: string; // Draft, Approved
  notes?: string;
  shoreActivity?: string;
  trainingCourse?: string;
  shoreLocation?: string;
  supervisor?: string;
  watchDuty?: string;
  navigationPhase?: string;
  incidentType?: string;
  weatherConditions?: string;
  vesselPosition?: string;
  operationalNotes?: string;
  edgeDeviceId?: string;
  edgeLocalCreatedAt?: string;
  isSynced: boolean;
  originNode: string;
  syncVersion: number;
  createdAt: string;
  updatedAt: string;

  // ── Kỳ phục vụ (entryType = SEA_SERVICE) ──────────────────
  // Trước đây nhóm này bị nhét chung vào chuỗi JSON trong `description`.
  vesselId?: string | null;
  voyageId?: string | null;
  assignmentId?: string | null;
  rankId?: number | null;

  vesselName?: string | null;
  imoNumber?: string | null;
  callSign?: string | null;
  vesselFlag?: string | null;
  vesselType?: string | null;
  tradeArea?: string | null;
  grossTonnage?: number | null;
  deadweight?: number | null;
  yearBuilt?: number | null;
  mainEngineType?: string | null;
  mainEnginePowerKw?: number | null;
  mainEngineMaker?: string | null;
  rankAtTime?: string | null;

  signOnDate?: string | null;
  signOnPortCode?: string | null;
  signOnPortName?: string | null;
  signOnBy?: string | null;

  signOffDate?: string | null;
  signOffPortCode?: string | null;
  signOffPortName?: string | null;
  signOffReason?: string | null;
  signOffBy?: string | null;

  conduct?: string | null;
  masterName?: string | null;
  endorsedBy?: string | null;
  endorsedAt?: string | null;

  recordStatus?: string | null;
  signOffRequestedBy?: string | null;
  signOffRequestedAt?: string | null;
  signOffRequestReason?: string | null;
  approvedBy?: string | null;
  approvedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  approvalHistory?: string | null;

  entrySource?: string | null;
  isManuallyEdited?: boolean;
  lastEditedBy?: string | null;
  lastEditedAt?: string | null;
}
