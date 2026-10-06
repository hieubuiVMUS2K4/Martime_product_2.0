// ============================================================
// Crew Management Types — matches backend Shore API DTOs
// ============================================================

// --- Core Entities ---

export interface CrewMember {
  id: string;
  crewId: string;
  fullName: string;
  rankId?: number;
  rankName?: string;
  rankCode?: string;
  department?: string;
  countryId?: number;
  countryName?: string;
  dateOfBirth?: string;
  joinDate?: string;
  embarkDate?: string;
  disembarkDate?: string;
  contractEnd?: string;
  isOnboard: boolean;
  onboardStatus?: string;
  vesselId?: string;
  vesselName?: string;
  emergencyContact?: string;
  emailAddress?: string;
  phoneNumber?: string;
  seamanBookNumber?: string;
  address?: string;
  placeOfBirth?: string;
  idCardNumber?: string;
  maritalStatus?: string;
  height?: number;
  weight?: number;
  bloodGroup?: string;
  clothingSize?: string;
  shoeSize?: string;
  cateringSize?: string;
  isSmoker?: boolean;
  isCovidVaccinated?: boolean;
  nextOfKinName?: string;
  nextOfKinRelation?: string;
  nextOfKinPhone?: string;
  nextOfKinAddress?: string;
  educationInstitution?: string;
  educationCourse?: string;
  educationPeriodYears?: number;
  educationGraduationYear?: number;
  notes?: string;
  avatarUrl?: string;
  originNode?: string;
  isSynced?: boolean;
  createdAt?: string;
  updatedAt?: string;
  // Review workflow fields (synced from edge)
  onboardStatusChangedAt?: string;
  onboardStatusChangedBy?: string;
  reviewChecklist?: string;
  reviewNotes?: string;
  edgeChanges?: string;
  edgeChangesViewed?: boolean;
}

export interface CrewDetail extends CrewMember {
  certificates?: CrewCertificate[];
  passportNumber?: string;
  passportExpiry?: string;
  seamanBookNumber?: string;
}

// --- Certificates ---

export interface CertificateType {
  id: number;
  certificateCode: string;
  certificateName: string;
  category?: string;
  issuingAuthority?: string | null;
  validityPeriodMonths?: number;
  description?: string;
  isMandatory: boolean;
  isActive: boolean;
  isRequiredForRank?: boolean;
  createdAt?: string;
}

/* ── Ma trận tuân thủ: lưới thuyền viên × loại chứng chỉ ── */

/** Trạng thái của một ô trong lưới. */
export type ComplianceStatus = 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'MISSING';

/** Một thuyền viên: nhận dạng + tổng kết tình trạng của riêng người đó. */
export interface CrewComplianceSummary {
  crewMemberId: string;
  crewName: string;
  crewCode?: string;
  rankId?: number;
  rankName?: string;
  department?: string;
  vesselName?: string;
  isOnboard: boolean;
  requiredCount: number;
  validCount: number;
  expiringCount: number;
  expiredCount: number;
  missingCount: number;
  /** Thiếu hẳn + hết hạn — con số cần hành động. */
  gapCount: number;
}

/** Ô của lưới: trạng thái một loại chứng chỉ với một thuyền viên. */
export interface CrewCertStatus {
  crewMemberId: string;
  /** Id bản ghi chứng chỉ đang giữ; không có nghĩa là người này chưa có loại đó. */
  crewCertificateId?: number;
  status: ComplianceStatus;
  expiryDate?: string;
  daysUntilExpiry?: number;
}

/** Một loại chứng chỉ: thống kê + trạng thái của TẤT CẢ người bắt buộc phải có. */
export interface CertificateComplianceRow {
  certificateId: number;
  certificateCode: string;
  certificateName: string;
  category?: string;
  isMandatory: boolean;
  requiredCount: number;
  validCount: number;
  expiringCount: number;
  expiredCount: number;
  missingCount: number;
  /** Thiếu hẳn + hết hạn — con số cần hành động. */
  gapCount: number;
  crew: CrewCertStatus[];
}

/** Tổng hợp theo chức danh. */
export interface RankComplianceRow {
  rankId: number;
  rankCode: string;
  rankName: string;
  department?: string;
  crewCount: number;
  requiredPerCrew: number;
  crewWithGaps: number;
  gapCount: number;
}

export interface ComplianceMatrix {
  generatedAt: string;
  crewTotal: number;
  totalGaps: number;
  /** Hàng của lưới. */
  crew: CrewComplianceSummary[];
  /** Cột của lưới, kèm thống kê từng loại. */
  certificates: CertificateComplianceRow[];
  ranks: RankComplianceRow[];
}

export interface CrewCertificate {
  id: number;
  crewMemberId: string;
  crewMemberName?: string;
  vesselId?: string;
  certificateId: number;
  certificateName?: string;
  certificateCode?: string;
  category?: string;
  certificateNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  issuingAuthority?: string;
  certificateOfCompetency?: string;
  countryId?: number;
  countryName?: string;
  notes?: string;
  status?: string;
  daysUntilExpiry?: number;
  fileUrl?: string;
  documentFilePath?: string;
  originNode?: string;
  isSynced?: boolean;
}

// --- Documents ---

export interface CrewDocument {
  id: string;
  crewMemberId: string;
  documentType: string;
  documentNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  countryId?: number;
  countryName?: string;
  fileUrl?: string;
  notes?: string;
  category: string;
  createdAt?: string;
  updatedAt?: string;
}

// --- Service Records ---

export interface ServiceRecord {
  id: string;
  crewMemberId: string;
  vesselName: string;
  vesselIMO?: string;
  rankDuringService?: string;
  signOnDate: string;
  signOffDate?: string;
  tradingArea?: string;
  remarks?: string;
  createdAt?: string;
}

// --- Reference Data ---

export interface Rank {
  id: number;
  rankCode: string;
  rankName: string;
  department?: string;
  level?: string | null;
  sortOrder?: number;
}

export interface Country {
  id: number;
  countryCode: string;
  countryName: string;
  flagImageUrl?: string;
}

// --- Request DTOs ---

export interface CreateCrewRequest {
  crewId: string;
  fullName: string;
  rankId?: number;
  department?: string;
  countryId?: number;
  dateOfBirth?: string;
  joinDate?: string;
  embarkDate?: string;
  contractEnd?: string;
  isOnboard?: boolean;
  vesselId?: string;
  emergencyContact?: string;
  emailAddress?: string;
  phoneNumber?: string;
  address?: string;
  placeOfBirth?: string;
  idCardNumber?: string;
  maritalStatus?: string;
  height?: number;
  weight?: number;
  bloodGroup?: string;
  clothingSize?: string;
  shoeSize?: string;
  cateringSize?: string;
  isSmoker?: boolean;
  isCovidVaccinated?: boolean;
  nextOfKinName?: string;
  nextOfKinRelation?: string;
  nextOfKinPhone?: string;
  nextOfKinAddress?: string;
  educationInstitution?: string;
  educationCourse?: string;
  educationPeriodYears?: number;
  educationGraduationYear?: number;
  notes?: string;
  seamanBookNumber?: string;
}

export type UpdateCrewRequest = Partial<CreateCrewRequest>;

export interface CrewCertificateRequest {
  crewMemberId: string;
  certificateId: number;
  certificateNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  issuingAuthority?: string;
  certificateOfCompetency?: string;
  countryId?: number;
  notes?: string;
}

export interface CreateServiceRecordRequest {
  vesselName: string;
  vesselIMO?: string;
  rankDuringService?: string;
  signOnDate: string;
  signOffDate?: string;
  tradingArea?: string;
  remarks?: string;
}

export interface CreateDocumentRequest {
  documentType: string;
  documentNumber?: string;
  issueDate?: string;
  expiryDate?: string;
  countryId?: number;
  fileUrl?: string;
  notes?: string;
}

// --- API Response wrappers ---

export interface PaginatedResponse<T> {
  data: T[];
  totalCount: number;
  totalPages: number;
  page: number;
  pageSize: number;
}

export interface ComplianceReport {
  crewMemberId: string;
  crewMemberName: string;
  rankName?: string;
  totalRequired: number;
  totalHeld: number;
  compliancePercentage: number;
  missingCertificates: string[];
  expiringCertificates: string[];
}

// --- UI State Types ---

export interface CrewFilters {
  search: string;
  isOnboard?: boolean | null;
  department?: string;
  rankId?: number | null;
  vesselId?: string | null;
  rankName?: string;
  vesselName?: string;
  page: number;
  pageSize: number;
}

export type CertificateStatusType = 'VALID' | 'EXPIRING_SOON' | 'EXPIRED' | 'SUSPENDED' | 'REVOKED';

export type TabKey = 'personal' | 'certificates' | 'documents' | 'service-history';

export interface VesselSimple {
  id: string;
  name: string;
  imo: string;
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
