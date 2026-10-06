import { ENV } from '../config/env';
import { buildAuthHeaders } from './api.client';
import type {
  CrewMember, CrewDetail, CrewCertificate, CrewDocument, ServiceRecord,
  CertificateType, Rank, Country, ComplianceReport, ComplianceMatrix,
  CreateCrewRequest, UpdateCrewRequest, CrewCertificateRequest,
  CreateServiceRecordRequest, CreateDocumentRequest,
  PaginatedResponse, VesselSimple, CrewLogbookEntry,
} from '../types/crew.types';

const BASE = ENV.API_BASE_URL;

// ============================================================
// Xuống tàu / phê duyệt
// ============================================================

/** Bờ cho xuống tàu — có hiệu lực ngay, không qua duyệt. */
export interface SignOffPayload {
  /** Bỏ trống = thời điểm hiện tại */
  signOffDate?: string;
  portCode?: string;
  portName?: string;
  /** Hết hợp đồng, bệnh, kỷ luật, việc gia đình... */
  reason?: string;
  signedOffBy?: string;
  conduct?: string;
  remarks?: string;
}

/** Một đề nghị cho xuống tàu do tàu gửi lên, đang chờ bờ quyết định. */
export interface PendingSignOff {
  id: string;
  crewMemberId: string;
  crewId: string;
  fullName: string;
  vesselName?: string | null;
  imoNumber?: string | null;
  rankAtTime?: string | null;
  signOnDate?: string | null;
  signOffDate?: string | null;
  signOffPortName?: string | null;
  signOffRequestReason?: string | null;
  signOffRequestedBy?: string | null;
  signOffRequestedAt?: string | null;
}

export interface ApproveSignOffPayload {
  /** Bờ được chốt lại ngày/cảng khác với đề nghị của tàu */
  signOffDate?: string;
  portCode?: string;
  portName?: string;
  approvedBy?: string;
  note?: string;
}

// ============================================================
// Generic fetch helper with error handling
// ============================================================

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: buildAuthHeaders({ 'Content-Type': 'application/json', ...options?.headers }),
    ...options,
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.error || body.message || JSON.stringify(body);
    } catch {
      const text = await res.text().catch(() => '');
      if (text) message = text;
    }
    throw new Error(message);
  }

  // Handle 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json();
}

// ============================================================
// CREW MEMBERS
// ============================================================

export const crewApi = {
  /** Get paginated crew list with optional filters */
  getAll: async (params?: {
    page?: number; pageSize?: number;
    search?: string; isOnboard?: boolean; shipId?: string; poolOnly?: boolean;
    rankName?: string; department?: string; vesselName?: string;
  }): Promise<PaginatedResponse<CrewMember>> => {
    const sp = new URLSearchParams();
    if (params?.page) sp.set('page', String(params.page));
    if (params?.pageSize) sp.set('pageSize', String(params.pageSize));
    if (params?.search) sp.set('search', params.search);
    if (params?.isOnboard !== undefined && params?.isOnboard !== null)
      sp.set('isOnboard', String(params.isOnboard));
    if (params?.shipId) sp.set('shipId', params.shipId);
    // Backend nhận query param tên "pool" (CrewController.GetAllCrew)
    if (params?.poolOnly) sp.set('pool', 'true');
    if (params?.rankName) sp.set('rankName', params.rankName);
    if (params?.department) sp.set('department', params.department);
    if (params?.vesselName) sp.set('vesselName', params.vesselName);

    const raw = await request<{
      data: CrewMember[];
      pagination?: { totalCount: number; totalPages: number; currentPage: number; pageSize: number };
      totalCount?: number;
      totalPages?: number;
      page?: number;
      pageSize?: number;
    }>(`${BASE}/crew?${sp.toString()}`);

    // Backend wraps pagination info under a nested "pagination" object.
    // Normalise to the flat PaginatedResponse<T> shape.
    if (raw.pagination) {
      return {
        data: raw.data,
        totalCount: raw.pagination.totalCount,
        totalPages: raw.pagination.totalPages,
        page: raw.pagination.currentPage,
        pageSize: raw.pagination.pageSize,
      };
    }
    // Already flat (future-proof)
    return raw as unknown as PaginatedResponse<CrewMember>;
  },

  /** Get fleet-wide crew counts */
  getStats: (): Promise<{ total: number; onboard: number; pool: number; pendingReview: number }> =>
    request(`${BASE}/crew/stats`),

  /** Get vessels list for assignment dropdown */
  getVessels: (): Promise<VesselSimple[]> =>
    request(`${BASE}/crew/vessels`),

  /** Assign crew member to a vessel */
  assignToVessel: (crewId: string, vesselId: string): Promise<CrewMember> =>
    request(`${BASE}/crew/${crewId}/assign`, {
      method: 'POST', body: JSON.stringify({ vesselId }),
    }),

  /** Remove crew member from vessel (back to pool) */
  unassignFromVessel: (crewId: string): Promise<CrewMember> =>
    request(`${BASE}/crew/${crewId}/unassign`, { method: 'POST' }),

  /**
   * Cho thuyền viên xuống tàu — ĐÓNG kỳ phục vụ trong sổ thuyền viên.
   * Khác unassign (chỉ gỡ khỏi tàu, không ghi gì vào sổ).
   */
  signOffFromVessel: (crewId: string, payload: SignOffPayload): Promise<CrewMember> =>
    request(`${BASE}/crew/${crewId}/sign-off`, {
      method: 'POST', body: JSON.stringify(payload),
    }),

  /** Hàng chờ duyệt: các đề nghị cho xuống tàu do tàu gửi lên */
  getPendingSignOffs: (): Promise<PendingSignOff[]> =>
    request(`${BASE}/crew/pending-sign-offs`),

  /** Bờ duyệt đề nghị cho xuống tàu */
  approveSignOff: (crewId: string, entryId: string, payload: ApproveSignOffPayload): Promise<unknown> =>
    request(`${BASE}/crew/${crewId}/logbook/${entryId}/approve-sign-off`, {
      method: 'POST', body: JSON.stringify(payload),
    }),

  /** Bờ từ chối — lý do là bắt buộc, tàu cần biết phải sửa gì */
  rejectSignOff: (crewId: string, entryId: string, reason: string, rejectedBy?: string): Promise<unknown> =>
    request(`${BASE}/crew/${crewId}/logbook/${entryId}/reject-sign-off`, {
      method: 'POST', body: JSON.stringify({ reason, rejectedBy }),
    }),

  /** Get crew member by ID */
  getById: (id: string): Promise<CrewMember> =>
    request(`${BASE}/crew/${id}`),

  /** Get crew detail (with certificates, passport, seaman book) */
  getDetail: (id: string): Promise<CrewDetail> =>
    request(`${BASE}/crew/${id}/detail`),

  /** Create new crew member */
  create: (data: CreateCrewRequest): Promise<CrewMember> =>
    request(`${BASE}/crew`, { method: 'POST', body: JSON.stringify(data) }),

  /** Update crew member */
  update: (id: string, data: UpdateCrewRequest): Promise<CrewMember> =>
    request(`${BASE}/crew/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  /** Delete crew member */
  delete: (id: string): Promise<void> =>
    request(`${BASE}/crew/${id}`, { method: 'DELETE' }),

  // --- Documents ---

  /** Get crew documents by category */
  getDocuments: (crewId: string, category: string): Promise<CrewDocument[]> =>
    request(`${BASE}/crew/${crewId}/documents/${category}`),

  /** Add document to crew */
  addDocument: (crewId: string, category: string, data: CreateDocumentRequest): Promise<CrewDocument> =>
    request(`${BASE}/crew/${crewId}/documents`, {
      method: 'POST', body: JSON.stringify({ ...data, category }),
    }),

  /** Cập nhật thông tin tài liệu. File đính kèm đi đường riêng qua uploadDocumentFile. */
  updateDocument: (crewId: string, docId: string, category: string, data: CreateDocumentRequest): Promise<CrewDocument> =>
    request(`${BASE}/crew/${crewId}/documents/${category}/${docId}`, {
      method: 'PUT', body: JSON.stringify({ ...data, category }),
    }),

  /** Delete crew document */
  deleteDocument: (crewId: string, docId: string, category: string): Promise<void> =>
    request(`${BASE}/crew/${crewId}/documents/${category}/${docId}`, { method: 'DELETE' }),

  /** Upload or replace a document file (identity / health) */
  uploadDocumentFile: async (crewId: string, category: string, docId: string, formData: FormData): Promise<{ message: string; fileUrl: string }> => {
    const res = await fetch(`${BASE}/crew/${crewId}/documents/${category}/${docId}/file`, {
      method: 'PUT',
      body: formData,
      headers: buildAuthHeaders(),
    });
    if (!res.ok) {
      let message = res.statusText;
      try { const b = await res.json(); message = b.error || b.message || message; } catch { /* ignore */ }
      throw new Error(message);
    }
    return res.json();
  },

  // --- Service Records ---

  /** Get service records */
  getServiceRecords: (crewId: string): Promise<ServiceRecord[]> =>
    request(`${BASE}/crew/${crewId}/service-records`),

  /** Add service record */
  addServiceRecord: (crewId: string, data: CreateServiceRecordRequest): Promise<ServiceRecord> =>
    request(`${BASE}/crew/${crewId}/service-records`, {
      method: 'POST', body: JSON.stringify(data),
    }),

  /** Update service record */
  updateServiceRecord: (recordId: string, data: CreateServiceRecordRequest): Promise<ServiceRecord> =>
    request(`${BASE}/crew/service-records/${recordId}`, {
      method: 'PUT', body: JSON.stringify(data),
    }),

  /** Delete service record */
  deleteServiceRecord: (recordId: string): Promise<void> =>
    request(`${BASE}/crew/service-records/${recordId}`, { method: 'DELETE' }),

  // --- Edge Changes ---

  /** Mark edge changes as viewed by shore */
  markChangesViewed: (crewId: string): Promise<{ message: string }> =>
    request(`${BASE}/crew/${crewId}/mark-changes-viewed`, { method: 'POST' }),

  /** Upload / replace crew avatar photo */
  uploadAvatar: async (crewId: string, formData: FormData): Promise<{ message: string; avatarUrl: string; crewMember: CrewMember }> => {
    const res = await fetch(`${BASE}/crew/${crewId}/avatar`, {
      method: 'POST',
      body: formData,
      headers: buildAuthHeaders(),
    });
    if (!res.ok) {
      let message = res.statusText;
      try { const b = await res.json(); message = b.error || b.message || message; } catch { /* ignore */ }
      throw new Error(message);
    }
    return res.json();
  },

  /** Get recent OnHold crew notifications (last 30 days) */
  holdNotifications: (): Promise<HoldNotification[]> =>
    request(`${BASE}/crew/hold-notifications`),
};

export interface HoldNotification {
  id: string;
  crewId: string;
  fullName: string;
  vesselId: string;
  vesselName: string;
  onboardStatusChangedAt: string;
  onboardStatusChangedBy?: string;
}

// ============================================================
// CERTIFICATES
// ============================================================

export const certificateApi = {
  /** Get certificate types (master data), optionally filtered by rank */
  getTypes: (params?: { category?: string; rankId?: number }): Promise<CertificateType[]> => {
    const sp = new URLSearchParams();
    if (params?.category) sp.set('category', params.category);
    if (params?.rankId) sp.set('rankId', params.rankId.toString());
    const qs = sp.toString();
    return request(`${BASE}/certificates${qs ? `?${qs}` : ''}`);
  },

  /** Get single certificate type */
  getTypeById: (id: number): Promise<CertificateType> =>
    request(`${BASE}/certificates/${id}`),

  /** Create certificate type */
  createType: (data: { certificateCode: string; certificateName: string; category?: string; validityPeriodMonths?: number; issuingAuthority?: string; description?: string; isMandatory?: boolean; countryIds?: number[]; rankIds?: number[] }): Promise<CertificateType> =>
    request(`${BASE}/certificates`, { method: 'POST', body: JSON.stringify(data) }),

  /** Update certificate type */
  updateType: (id: number, data: { certificateCode: string; certificateName: string; category?: string; validityPeriodMonths?: number; issuingAuthority?: string; description?: string; isMandatory?: boolean; countryIds?: number[]; rankIds?: number[] }): Promise<CertificateType> =>
    request(`${BASE}/certificates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  /** Delete (deactivate) certificate type */
  deleteType: (id: number): Promise<void> =>
    request(`${BASE}/certificates/${id}`, { method: 'DELETE' }),

  /** Get country IDs mapped to a certificate type */
  getCertificateCountries: (certId: number): Promise<number[]> =>
    request(`${BASE}/certificates/${certId}/countries`),

  /** Get rank IDs mapped to a certificate type */
  getCertificateRanks: (certId: number): Promise<number[]> =>
    request(`${BASE}/certificates/${certId}/ranks`),

  /**
   * Ma trận tuân thủ xoay theo LOẠI chứng chỉ: mỗi loại cho biết ai đang thiếu,
   * kèm tổng hợp theo chức danh. Một lần gọi cho cả hai góc nhìn.
   */
  getComplianceMatrix: (onboardOnly = false): Promise<ComplianceMatrix> =>
    request(`${BASE}/certificates/compliance/matrix?onboardOnly=${onboardOnly}`),

  // --- Crew Certificates ---

  /** Get all certificates for a crew member */
  getCrewCertificates: (crewMemberId: string): Promise<CrewCertificate[]> =>
    request(`${BASE}/certificates/crew/${crewMemberId}`),

  /** Lấy một chứng chỉ của thuyền viên theo id — dùng để mở modal sửa/gia hạn từ ma trận. */
  getCrewCertificateById: (id: number): Promise<CrewCertificate> =>
    request(`${BASE}/certificates/crew-certificates/${id}`),

  /** Add certificate to crew */
  addCrewCertificate: (data: CrewCertificateRequest): Promise<CrewCertificate> =>
    request(`${BASE}/certificates/crew-certificates`, { method: 'POST', body: JSON.stringify(data) }),

  /** Update crew certificate */
  updateCrewCertificate: (id: number, data: CrewCertificateRequest): Promise<CrewCertificate> =>
    request(`${BASE}/certificates/crew-certificates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  /** Delete crew certificate */
  deleteCrewCertificate: (id: number): Promise<void> =>
    request(`${BASE}/certificates/crew-certificates/${id}`, { method: 'DELETE' }),

  /** Upload certificate document file */
  uploadCertificateFile: async (crewCertificateId: number, formData: FormData): Promise<{ message: string; documentFilePath: string }> => {
    const res = await fetch(`${BASE}/certificates/crew-certificates/${crewCertificateId}/file`, {
      method: 'PUT',
      body: formData,
      headers: buildAuthHeaders(),
    });
    if (!res.ok) {
      let message = res.statusText;
      try { const b = await res.json(); message = b.error || b.message || message; } catch {}
      throw new Error(message);
    }
    return res.json();
  },

  // --- Fleet Queries ---

  /** Get expiring certificates across fleet */
  getExpiring: async (days = 90): Promise<CrewCertificate[]> => {
    const res = await request<{ data: CrewCertificate[] } | CrewCertificate[]>(`${BASE}/certificates/expiring?days=${days}`);
    // Backend wraps response in { data: [...] }, unwrap if needed
    if (res && !Array.isArray(res) && Array.isArray((res as { data: CrewCertificate[] }).data)) {
      return (res as { data: CrewCertificate[] }).data;
    }
    return Array.isArray(res) ? res : [];
  },

  /** Get fleet compliance report */
  getCompliance: async (): Promise<ComplianceReport[]> => {
    try {
      return await request<ComplianceReport[]>(`${BASE}/certificates/compliance`);
    } catch {
      // Fleet-wide compliance endpoint may not exist yet
      return [];
    }
  },
};

// ============================================================
// REFERENCE DATA
// ============================================================

export const referenceApi = {
  /** Get all ranks */
  getRanks: (): Promise<Rank[]> => request(`${BASE}/ranks`),

  /** Get all countries */
  getCountries: (): Promise<Country[]> => request(`${BASE}/countries`),
};

// ============================================================
// RANKS — MASTER DATA CRUD (chức danh)
// ============================================================

export interface RankPayload {
  rankCode: string;
  rankName: string;
  department?: string;
  level?: string | null;
  sortOrder?: number;
}

export const rankApi = {
  getCertificateMappings: (): Promise<{ id: number; rankId: number; certificateId: number }[]> =>
    request(`${BASE}/rank-certificates`),
  updateCertificateRequirements: (rankId: number, certificateIds: number[]): Promise<{ added: number; removed: number }> =>
    request(`${BASE}/rank-certificates/rank/${rankId}`, { method: 'PUT', body: JSON.stringify({ certificateIds }) }),
  getAll: (): Promise<Rank[]> => request(`${BASE}/ranks`),
  create: (data: RankPayload): Promise<Rank> =>
    request(`${BASE}/ranks`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: RankPayload): Promise<Rank> =>
    request(`${BASE}/ranks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id: number): Promise<void> =>
    request(`${BASE}/ranks/${id}`, { method: 'DELETE' }),
};

// ============================================================
// COUNTRIES — MASTER DATA CRUD (quốc gia)
// ============================================================

export interface CountryPayload {
  countryCode: string;
  countryName: string;
  flagImageUrl?: string;
}

export const countryApi = {
  getAll: (): Promise<Country[]> => request(`${BASE}/countries`),
  create: (data: CountryPayload): Promise<Country> =>
    request(`${BASE}/countries`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: CountryPayload): Promise<Country> =>
    request(`${BASE}/countries/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  remove: (id: number): Promise<void> =>
    request(`${BASE}/countries/${id}`, { method: 'DELETE' }),
};

// ============================================================
// PORTS API — danh mục cảng, bờ làm chủ, dùng chung cho mọi tàu
// ============================================================

export interface Port {
  id: number;
  portCode: string;   // UN/LOCODE, 5 ký tự — VD: VNSGN
  portName: string;
  country?: string | null;
  countryCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  timeZone?: string | null;
  isActive: boolean;
}

export interface PortPayload {
  portCode: string;
  portName: string;
  country?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  timeZone?: string;
  isActive: boolean;
}

export interface PortListResponse {
  data: Port[];
  pagination: { currentPage: number; pageSize: number; totalCount: number; totalPages: number };
}

export const portApi = {
  search: (params?: { search?: string; code?: string; name?: string; country?: string; countryCode?: string; isActive?: boolean; page?: number; pageSize?: number }): Promise<PortListResponse> => {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.code) q.set('code', params.code);
    if (params?.name) q.set('name', params.name);
    if (params?.country) q.set('country', params.country);
    if (params?.countryCode) q.set('countryCode', params.countryCode);
    if (params?.isActive !== undefined) q.set('isActive', String(params.isActive));
    if (params?.page) q.set('page', String(params.page));
    if (params?.pageSize) q.set('pageSize', String(params.pageSize));
    const qs = q.toString();
    return request(`${BASE}/ports${qs ? `?${qs}` : ''}`);
  },
  create: (data: PortPayload): Promise<Port> =>
    request(`${BASE}/ports`, { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: PortPayload): Promise<Port> =>
    request(`${BASE}/ports/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  /** Ngừng sử dụng — không xoá cứng vì chuyến đi và sổ thuyền viên còn tham chiếu tới */
  deactivate: (id: number): Promise<void> =>
    request(`${BASE}/ports/${id}`, { method: 'DELETE' }),
};

// ============================================================
// LOGBOOK API
// ============================================================

export const logbookApi = {
  getEntries: (
    crewMemberId: string,
    params?: { search?: string; entryOrigin?: string; entryType?: string; startDate?: string; endDate?: string }
  ): Promise<CrewLogbookEntry[]> => {
    const sp = new URLSearchParams();
    if (params?.search) sp.set('search', params.search);
    if (params?.entryOrigin) sp.set('entryOrigin', params.entryOrigin);
    if (params?.entryType) sp.set('entryType', params.entryType);
    if (params?.startDate) sp.set('startDate', params.startDate);
    if (params?.endDate) sp.set('endDate', params.endDate);
    return request<CrewLogbookEntry[]>(`${BASE}/crew/${crewMemberId}/logbook${sp.toString() ? `?${sp.toString()}` : ''}`);
  },
  createEntry: (crewMemberId: string, data: Partial<CrewLogbookEntry>): Promise<CrewLogbookEntry> =>
    request(`${BASE}/crew/${crewMemberId}/logbook`, { method: 'POST', body: JSON.stringify(data) }),
  updateEntry: (crewMemberId: string, entryId: string, data: Partial<CrewLogbookEntry>): Promise<CrewLogbookEntry> =>
    request(`${BASE}/crew/${crewMemberId}/logbook/${entryId}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEntry: (crewMemberId: string, entryId: string): Promise<void> =>
    request(`${BASE}/crew/${crewMemberId}/logbook/${entryId}`, { method: 'DELETE' }),
};
