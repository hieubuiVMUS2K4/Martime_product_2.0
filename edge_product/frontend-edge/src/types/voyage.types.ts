// ============================================================
// VOYAGE, PORT, CREW ASSIGNMENT - Type Definitions
// Based on edge-services DTOs (VoyageDtos.cs)
// ============================================================

// ========== PORT ==========

export interface Port {
  id: number
  portCode: string     // UN/LOCODE (5 chars, e.g. VNSGN)
  portName: string
  country?: string
  countryCode?: string
  latitude?: number
  longitude?: number
  timeZone?: string
  isActive: boolean
}

export interface PortSearchQuery {
  search?: string
  countryCode?: string
  isActive?: boolean
  page?: number
  pageSize?: number
}

// ========== PORT CALL ==========

export type PortCallType = 'DEPARTURE' | 'ARRIVAL' | 'TRANSIT' | 'BUNKERING' | 'DRYDOCK'

export interface PortCall {
  id: string   // Guid
  voyageId: string
  portId?: number
  portCode?: string
  portName: string
  country?: string
  callType: PortCallType
  sequence: number
  arrivalTime?: string
  departureTime?: string
  berthNumber?: string
  pilotOnBoard?: string
  pilotOffBoard?: string
  draftFore?: number
  draftAft?: number
  cargoOpsCompleted: boolean
  remarks?: string
  createdAt: string
}

export interface CreatePortCallDto {
  voyageId: string
  portId?: number
  portCode?: string
  portName: string
  country?: string
  callType: string
  sequence?: number
  arrivalTime?: string
  departureTime?: string
  berthNumber?: string
  pilotOnBoard?: string
  pilotOffBoard?: string
  draftFore?: number
  draftAft?: number
  cargoOpsCompleted?: boolean
  remarks?: string
}

export interface UpdatePortCallDto {
  portId?: number
  portCode?: string
  portName?: string
  country?: string
  callType?: string
  sequence?: number
  arrivalTime?: string
  departureTime?: string
  berthNumber?: string
  pilotOnBoard?: string
  pilotOffBoard?: string
  draftFore?: number
  draftAft?: number
  cargoOpsCompleted?: boolean
  remarks?: string
}

// ========== VOYAGE CREW ASSIGNMENT ==========

export type CrewRole = 'REGULAR' | 'SUPERNUMERARY' | 'OBSERVER' | 'TRAINEE' | 'RIDER'
export type AssignmentStatus = 'ASSIGNED' | 'ONBOARD' | 'DISEMBARKED' | 'CANCELLED'

export interface VoyageCrewAssignment {
  id: string   // Guid
  voyageId: string
  voyageNumber?: string
  crewMemberId: string
  crewName?: string
  crewId?: string
  rankId?: number
  rankName?: string
  role: CrewRole
  embarkPortCode?: string
  embarkPortName?: string
  embarkDate?: string
  disembarkPortCode?: string
  disembarkPortName?: string
  disembarkDate?: string
  watchSchedule?: string
  status: AssignmentStatus
  remarks?: string
  createdAt: string
}

export interface CreateCrewAssignmentDto {
  voyageId: string
  crewMemberId: string
  rankId?: number
  role?: string
  embarkPortCode?: string
  embarkPortName?: string
  embarkDate?: string
  watchSchedule?: string
  remarks?: string
}

export interface UpdateCrewAssignmentDto {
  rankId?: number
  role?: string
  embarkPortCode?: string
  embarkPortName?: string
  embarkDate?: string
  disembarkPortCode?: string
  disembarkPortName?: string
  disembarkDate?: string
  watchSchedule?: string
  status?: string
  remarks?: string
}

export interface BulkAssignCrewDto {
  voyageId: string
  crewMemberIds: string[]
  embarkPortCode?: string
  embarkPortName?: string
  embarkDate?: string
}

// ========== VOYAGE (Extended) ==========

export type VoyageStatus =
  | 'PLANNING'
  | 'APPROVED'
  | 'READY'
  | 'UNDERWAY'
  | 'ARRIVED'
  | 'COMPLETED'
  | 'CANCELLED'

export type VoyageCharterType =
  | 'VOYAGE_CHARTER'
  | 'TIME_CHARTER'
  | 'TIME_CHARTER_TRIP'
  | 'CONTRACT_OF_AFFREIGHTMENT'
  | 'OTHER'

export interface VoyagePlanLeg {
  id: string
  voyageId: string
  sequence: number
  legType: string
  fromPortCode?: string
  fromPortName?: string
  toPortCode?: string
  toPortName?: string
  plannedDepartureTime?: string
  plannedArrivalTime?: string
  plannedDistance?: number
  plannedDurationHours?: number
  plannedAverageSpeed?: number
  plannedFuelConsumption?: number
  cargoActivity?: string
  crewChangePlanned: boolean
  bunkerSupplyPlanned: boolean
  weatherRoutingNotes?: string
  notes?: string
}

export interface UpsertVoyagePlanLegDto {
  sequence: number
  legType: string
  fromPortCode?: string
  fromPortName?: string
  toPortCode?: string
  toPortName?: string
  plannedDepartureTime?: string
  plannedArrivalTime?: string
  plannedDistance?: number
  plannedDurationHours?: number
  plannedAverageSpeed?: number
  plannedFuelConsumption?: number
  cargoActivity?: string
  crewChangePlanned?: boolean
  bunkerSupplyPlanned?: boolean
  weatherRoutingNotes?: string
  notes?: string
}

export interface VoyageStatusHistory {
  id: string
  fromStatus?: string
  toStatus: string
  changedBy: string
  notes?: string
  changedAt: string
}

export interface VoyageDetail {
  id: string   // Guid
  voyageNumber: string
  
  // Vessel Info
  vesselIMO?: string
  vesselName?: string
  vesselFlag?: string
  callSign?: string
  
  // Port Info
  departurePort?: string
  departurePortCode?: string
  departureTime?: string
  arrivalPort?: string
  arrivalPortCode?: string
  arrivalTime?: string
  previousPortCode?: string
  previousPortName?: string
  
  // Performance
  cargoType?: string
  charterType?: VoyageCharterType
  cargoWeight?: number
  plannedDistance?: number
  plannedDurationHours?: number
  plannedAverageSpeed?: number
  plannedFuelConsumption?: number
  voyageInstructions?: string
  distanceTraveled?: number
  fuelConsumed?: number
  averageSpeed?: number
  voyageStatus: VoyageStatus
  approvedAt?: string
  readyAt?: string
  commencedAt?: string
  arrivedAt?: string
  completedAt?: string
  cancelledAt?: string
  
  createdAt: string
  updatedAt: string
  
  // Financial summary
  totalEstimatedCost?: number
  totalEstimatedRevenue?: number
  estimatedProfitMargin?: number
  
  // Related data
  portCalls: PortCall[]
  crewAssignments: VoyageCrewAssignment[]
  planLegs: VoyagePlanLeg[]
  statusHistory: VoyageStatusHistory[]
  cargoPlans: VoyageCargoPlan[]
  bunkerPlans: VoyageBunkerPlan[]
  crewChangePlans: VoyageCrewChangePlan[]
  costEstimates: VoyageCostEstimate[]
  revenueEstimates: VoyageRevenueEstimate[]
  logEntryCount: number
  cargoOperationCount: number
}

export interface CreateVoyageDto {
  voyageNumber: string
  departurePort?: string
  departurePortCode?: string
  departureTime?: string
  arrivalPort?: string
  arrivalPortCode?: string
  arrivalTime?: string
  previousPortCode?: string
  previousPortName?: string
  cargoType?: string
  charterType?: VoyageCharterType
  cargoWeight?: number
  plannedDistance?: number
  plannedDurationHours?: number
  plannedAverageSpeed?: number
  plannedFuelConsumption?: number
  voyageInstructions?: string
  voyageStatus?: VoyageStatus
  planLegs?: UpsertVoyagePlanLegDto[]
  cargoPlans?: UpsertVoyageCargoPlanDto[]
  bunkerPlans?: UpsertVoyageBunkerPlanDto[]
  crewChangePlans?: UpsertVoyageCrewChangePlanDto[]
  costEstimates?: UpsertVoyageCostEstimateDto[]
  revenueEstimates?: UpsertVoyageRevenueEstimateDto[]
}

export interface UpdateVoyageDto {
  voyageNumber?: string
  departurePort?: string
  departurePortCode?: string
  departureTime?: string
  arrivalPort?: string
  arrivalPortCode?: string
  arrivalTime?: string
  previousPortCode?: string
  previousPortName?: string
  cargoType?: string
  charterType?: VoyageCharterType
  cargoWeight?: number
  plannedDistance?: number
  plannedDurationHours?: number
  plannedAverageSpeed?: number
  plannedFuelConsumption?: number
  voyageInstructions?: string
  distanceTraveled?: number
  fuelConsumed?: number
  averageSpeed?: number
  voyageStatus?: VoyageStatus
  planLegs?: UpsertVoyagePlanLegDto[]
  cargoPlans?: UpsertVoyageCargoPlanDto[]
  bunkerPlans?: UpsertVoyageBunkerPlanDto[]
  crewChangePlans?: UpsertVoyageCrewChangePlanDto[]
  costEstimates?: UpsertVoyageCostEstimateDto[]
  revenueEstimates?: UpsertVoyageRevenueEstimateDto[]
}

// ========== PHASE 2: VOYAGE PLANNING SUB-ENTITIES ==========

export type CargoPlanOperationType = 'LOADING' | 'DISCHARGING' | 'TRANSSHIPMENT'
export type BunkerFuelType = 'HFO' | 'VLSFO' | 'MGO' | 'MDO' | 'LNG'
export type BunkerOperationType = 'SUPPLY' | 'TRANSFER'
export type CrewChangeType = 'EMBARK' | 'DISEMBARK' | 'ROTATION'
export type CostCategory = 'FUEL' | 'PORT_CHARGES' | 'CANAL_FEES' | 'CREW' | 'SUPPLIES' | 'INSURANCE' | 'BROKERAGE' | 'MISC'
export type RevenueCategory = 'FREIGHT' | 'DEMURRAGE' | 'DISPATCH' | 'DEADFREIGHT' | 'MISC'

export interface VoyageCargoPlan {
  id: string
  voyageId: string
  planLegId?: string
  sequence: number
  operationType: CargoPlanOperationType
  cargoType?: string
  cargoDescription?: string
  plannedQuantity?: number
  unit?: string
  portCode?: string
  portName?: string
  shipperName?: string
  consigneeName?: string
  specialRequirements?: string
  notes?: string
}

export interface UpsertVoyageCargoPlanDto {
  planLegId?: string
  sequence: number
  operationType: string
  cargoType?: string
  cargoDescription?: string
  plannedQuantity?: number
  unit?: string
  portCode?: string
  portName?: string
  shipperName?: string
  consigneeName?: string
  specialRequirements?: string
  notes?: string
}

export interface VoyageBunkerPlan {
  id: string
  voyageId: string
  planLegId?: string
  sequence: number
  fuelType: BunkerFuelType
  plannedQuantity?: number
  operationType: BunkerOperationType
  portCode?: string
  portName?: string
  estimatedCostUsd?: number
  supplierName?: string
  notes?: string
}

export interface UpsertVoyageBunkerPlanDto {
  planLegId?: string
  sequence: number
  fuelType: string
  plannedQuantity?: number
  operationType: string
  portCode?: string
  portName?: string
  estimatedCostUsd?: number
  supplierName?: string
  notes?: string
}

export interface VoyageCrewChangePlan {
  id: string
  voyageId: string
  planLegId?: string
  sequence: number
  crewMemberId?: string
  crewMemberName?: string
  rankId?: number
  rankName?: string
  changeType: CrewChangeType
  portCode?: string
  portName?: string
  plannedDate?: string
  replacementReason?: string
  notes?: string
}

export interface UpsertVoyageCrewChangePlanDto {
  planLegId?: string
  sequence: number
  crewMemberId?: string
  rankId?: number
  changeType: string
  portCode?: string
  portName?: string
  plannedDate?: string
  replacementReason?: string
  notes?: string
}

export interface VoyageCostEstimate {
  id: string
  voyageId: string
  sequence: number
  costCategory: CostCategory
  description?: string
  estimatedAmount: number
  currency: string
  notes?: string
}

export interface UpsertVoyageCostEstimateDto {
  sequence: number
  costCategory: string
  description?: string
  estimatedAmount: number
  currency?: string
  notes?: string
}

export interface VoyageRevenueEstimate {
  id: string
  voyageId: string
  sequence: number
  revenueCategory: RevenueCategory
  description?: string
  estimatedAmount: number
  currency: string
  notes?: string
}

export interface UpsertVoyageRevenueEstimateDto {
  sequence: number
  revenueCategory: string
  description?: string
  estimatedAmount: number
  currency?: string
  notes?: string
}

// ========== FAL FORM 5 ==========

export interface FalForm5 {
  voyageNumber: string
  vesselName?: string
  vesselIMO?: string
  vesselFlag?: string
  callSign?: string
  portOfArrival?: string
  portOfArrivalCode?: string
  dateOfArrival?: string
  arrivedFrom?: string
  crewList: FalCrewEntry[]
}

export interface FalCrewEntry {
  no: number
  fullName?: string
  rank?: string
  nationality?: string
  dateOfBirth?: string
  placeOfBirth?: string
  travelDocumentType?: string
  travelDocumentNumber?: string
}

// ========== CARGO OPERATIONS ==========

export type CargoOperationType = 'LOADING' | 'DISCHARGING'
export type CargoStatus = 'PLANNED' | 'LOADING' | 'LOADED' | 'DISCHARGING' | 'DISCHARGED'

export interface VoyageCargoOperation {
  id: string
  operationId: string
  voyageId?: string
  operationType: CargoOperationType
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
  status: CargoStatus
  createdAt: string
}

export interface CreateCargoOperationDto {
  voyageId?: string
  operationType: string
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
}

export interface UpdateCargoOperationDto {
  operationType?: string
  cargoType?: string
  cargoDescription?: string
  quantity?: number
  unit?: string
  loadingPort?: string
  dischargePort?: string
  loadedAt?: string
  dischargedAt?: string
  shipper?: string
  consignee?: string
  billOfLading?: string
  sealNumbers?: string
  specialRequirements?: string
  status?: string
}
