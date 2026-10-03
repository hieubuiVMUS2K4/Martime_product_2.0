// PMS Types for Equipment Asset Management

export interface EquipmentAsset {
  picCrewName?: string;
  isSynced: boolean;
  createdAt: string;
  updatedAt: string;
  originNode: string;
  picCrewId?: string;
  id: string;
  assetCode: string;
  assetName: string;
  category: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  installationDate?: string;
  currentRunningHours?: number;
  lastRunningHoursUpdate?: string;
  equipmentGroupId?: string;
  /** Parent asset ID — null/undefined = root node in hierarchy tree */
  parentId?: string;
  /** Children assets (populated by frontend tree builder, not from API) */
  children?: EquipmentAsset[];
  location?: string;
  criticality: string;
  status: string;
  defaultExecutorRole?: string;
  approverRole?: string;
  technicalSpecs?: string;
  notes?: string;
  isActive: boolean;
}

export interface CreateEquipmentAssetDto {
  picCrewId?: string;
  assetCode: string;
  assetName: string;
  category: string;
  parentId?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  installationDate?: string;
  equipmentGroupId?: string;
  location?: string;
  criticality?: string;
  status?: string;
  defaultExecutorRole?: string;
  approverRole?: string;
  technicalSpecs?: string;
  notes?: string;
}

export interface MaintenanceSchedule {
  id: string;
  scheduleCode: string;
  equipmentGroupId?: string;
  equipmentAssetId?: string;
  assetCode?: string;
  assetName?: string;
  groupCode?: string;
  groupName?: string;
  assetCount?: number;
  taskTypeId: number;
  taskTypeName?: string;
  scheduleName: string;
  maintenanceCategory?: 'PERIODIC' | 'AD_HOC';
  intervalType: 'CALENDAR' | 'RUNNING_HOURS' | 'HYBRID';
  intervalHours?: number;
  intervalDays?: number;
  daysBeforeDue: number;
  lastExecutedAt?: string;
  lastExecutedRunningHours?: number;
  nextDueDate?: string;
  nextDueRunningHours?: number;
  priority: string;
  estimatedDurationHours?: number;
  autoGenerate: boolean;
  instructions?: string;
  isActive: boolean;
  requiredSpareParts?: ScheduleSparePart[];
  checklistItemTemplates?: ChecklistItemTemplateDto[];
}

export interface ScheduleSparePart {
  id?: string;
  scheduleId: string;
  materialItemId: string;
  materialCode?: string;
  materialName?: string;
  quantityRequired: number;
  isMandatory: boolean;
  notes?: string;
}

export interface CreateMaintenanceScheduleDto {
  scheduleCode: string;
  equipmentGroupId?: string;
  equipmentAssetId?: string;
  taskTypeId: number;
  scheduleName: string;
  maintenanceCategory?: 'PERIODIC' | 'AD_HOC';
  intervalType: 'CALENDAR' | 'RUNNING_HOURS' | 'HYBRID';
  intervalHours?: number;
  intervalDays?: number;
  daysBeforeDue?: number;
  priority?: string;
  estimatedDurationHours?: number;
  autoGenerate?: boolean;
  instructions?: string;
  requiredSpareParts?: CreateScheduleSparePartDto[];
  checklistItemTemplates?: ChecklistItemTemplateDto[];
}

export interface CreateScheduleSparePartDto {
  materialItemId: string;
  quantityRequired: number;
  isMandatory?: boolean;
  notes?: string;
}

export interface ChecklistItemTemplateDto {
  sequenceOrder: number;
  checkpointDescription: string;
  requiresReading?: boolean;
  normalRangeMin?: number;
  normalRangeMax?: number;
  unit?: string;
}

export interface SchedulePreview {
  scheduleId: string;
  scheduleName: string;
  assetName: string;
  nextDueDate?: string;
  nextDueRunningHours?: number;
  daysUntilDue: number;
  isOverdue: boolean;
  priority: string;
  intervalType?: string;
  intervalValue?: number;
  estimatedDurationHours?: number;
  daysBeforeDue: number;
}

export interface EquipmentGroup {
  id: string;
  groupCode: string;
  groupName: string;
  category?: string;
  description?: string;
  department?: string;     // ENGINE, DECK, NAVIGATION, etc.
  picRole?: string;        // Person In Charge rank (e.g., "2/E", "C/O")
  picCrewId?: string;      // Specific crew member override
  isActive: boolean;
  memberCount?: number;    // Number of assets in this group
  members?: EquipmentAsset[];
}

export interface MaintenanceHistory {
  id: string;
  scheduleId: string;
  taskId: string;
  executedAt: string;
  executedRunningHours?: number;
  completedBy?: string;
  actualDurationHours?: number;
  sparePartsUsed?: string;
  totalSparePartsCost?: number;
  notes?: string;
  conditionAfter?: string;
}

// ── Store Locations (Danh mục vị trí kho) ──

export interface StoreLocation {
  id: string;
  locationCode: string;
  name: string;
  description?: string | null;
  parentId?: string | null;
  address?: string | null;
  managerName?: string | null;
  phone?: string | null;
  email?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Children (populated by frontend tree builder) */
  children?: StoreLocation[];
}

export interface CreateStoreLocationDto {
  locationCode: string;
  name: string;
  description?: string | null;
  parentId?: string | null;
  address?: string | null;
  managerName?: string | null;
  phone?: string | null;
  email?: string | null;
}

// ── Material Requests (Yêu cầu vật tư) ──

export interface MaterialRequest {
  id: number;
  requestCode: string;
  vesselName?: string | null;
  voyageId?: string | null;
  voyageName?: string | null;
  urgency: string;
  neededDate: string;
  requestDate: string;
  requestedBy?: string | null;
  notes?: string | null;
  attachments?: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  itemCount?: number;
  items?: MaterialRequestItem[];
}

export interface MaterialRequestItem {
  id?: number;
  equipmentAssetId?: string | null;
  materialItemId?: string | null;
  itemName: string;
  description?: string | null;
  unit: string;
  quantityOnHand: number;
  quantityRequested: number;
  note?: string | null;
}

// ── Task Risk Assessment Form (Biểu mẫu ĐGRR) ──
export interface TaskRiskAssessment {
  taskId: string;
  isFilled: boolean;
  jobName?: string;
  equipmentName?: string;
  location?: string;
  assessmentDate?: string;
  personnel?: string;
  raNumber?: string;
  hazardMechanical: boolean;
  hazardElectrical: boolean;
  hazardChemical: boolean;
  hazardEnvironmental: boolean;
  hazardNotes?: string;
  initialSeverity?: string;
  initialLikelihood?: string;
  initialRiskLevel?: string;
  controlLOTO: boolean;
  controlPTW: boolean;
  controlPPE: boolean;
  controlVentilation: boolean;
  controlNotes?: string;
  residualSeverity?: string;
  residualLikelihood?: string;
  residualRiskLevel?: string;
  residualRiskNotes?: string;
  isApprovedToProceed: boolean;
  workerSignature?: string;
  supervisorSignature?: string;
  chiefEngineerApproval?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

// ── Task Inspection Report Form (BBKT) ──
export interface InspectionJobItem {
  seq: number;
  description: string;
  status: 'GOOD' | 'BAD' | 'REPLACED' | '';
  notes: string;
}

export interface TaskInspectionReport {
  taskId: string;
  isFilled: boolean;
  shipName?: string;
  equipmentName?: string;
  equipmentCode?: string;
  maintenanceType?: string;
  maintenanceDate?: string;
  jobItemsJson?: string;
  postMaintenanceStatus?: string;
  recommendations?: string;
  operatorSignature?: string;
  chiefEngineerSignature?: string;
  overallResult?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}


export interface CreateMaterialRequestDto {
  vesselName?: string;
  voyageId?: string;
  voyageName?: string;
  urgency: string;
  neededDate: string;
  requestDate: string;
  requestedBy?: string;
  notes?: string;
  attachments?: string;
  items: MaterialRequestItem[];
}

// ── Stock Receipts (Phiếu nhập kho) ──

export interface StockReceipt {
  id: number;
  receiptCode: string;
  vesselName?: string | null;
  voyageId?: string | null;
  voyageName?: string | null;
  supplierCode?: string | null;
  supplierName?: string | null;
  receivedDate: string;
  receiptDate: string;
  createdBy?: string | null;
  notes?: string | null;
  attachments?: string | null;
  status: string;
  materialRequestId?: number | null;
  requestCode?: string | null;
  createdAt: string;
  updatedAt: string;
  itemCount?: number;
  totalValue?: number;
  items?: StockReceiptItem[];
}

export interface StockReceiptItem {
  id?: number;
  storeLocationId?: string | null;
  materialItemId?: string | null;
  itemCode?: string | null;
  itemName: string;
  description?: string | null;
  unit: string;
  quantityRequested: number;
  quantityReceived: number;
  unitCost?: number | null;
  currency?: string | null;
  note?: string | null;
}

export interface CreateStockReceiptDto {
  vesselName?: string;
  voyageId?: string;
  voyageName?: string;
  supplierCode?: string;
  supplierName?: string;
  receivedDate: string;
  receiptDate: string;
  createdBy?: string;
  notes?: string;
  attachments?: string;
  materialRequestId?: number;
  items: StockReceiptItem[];
}

// ── Inventory Stock (Tồn kho) ──

export interface InventoryStockItem {
  id: number;
  materialItemId: string;
  itemCode: string;
  itemName: string;
  notes?: string | null;
  unit: string;
  storeLocationId: string;
  locationName: string;
  quantity: number;
  unitCost: number;
  totalValue: number;
  lastReceiptDate?: string | null;
  updatedAt: string;
}

export interface InventorySummary {
  totalItems: number;
  totalValue: number;
  lowStockCount: number;
}
