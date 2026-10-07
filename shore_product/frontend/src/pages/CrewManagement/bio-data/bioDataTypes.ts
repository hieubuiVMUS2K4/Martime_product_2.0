/*
  Kiểu dữ liệu của bản hồ sơ thuyền viên, tách riêng khỏi bioData.ts (nơi gọi API) để
  bộ dựng PDF / Excel chỉ phụ thuộc dữ liệu, chạy được độc lập.
*/

export type DocStatus = 'valid' | 'expiring' | 'expired' | 'none';

export interface BioField { vi: string; en: string; value: string }

export interface BioDocRow {
  name: string;
  number: string;
  issuedBy: string;
  issueDate: string;
  expiryDate: string;
  status: DocStatus;
  remark: string;
}

export interface BioServiceRow {
  vessel: string;
  imo: string;
  flagType: string;
  rank: string;
  signOn: string;
  signOff: string;
  duration: string;
  remark: string;
}

export interface BioData {
  fileName: string;
  preparedBy: string;
  preparedAt: string;
  crewCode: string;
  fullName: string;
  rank: string;
  vessel: string;
  photoDataUrl: string | null;
  personal: BioField[];
  employment: BioField[];
  physical: BioField[];
  kin: BioField[];
  education: BioField[];
  identityDocs: BioDocRow[];
  certificates: BioDocRow[];
  healthDocs: BioDocRow[];
  seaService: BioServiceRow[];
  notes: string;
}

export const STATUS_LABEL: Record<DocStatus, { vi: string; en: string }> = {
  valid: { vi: 'Còn hạn', en: 'Valid' },
  expiring: { vi: 'Sắp hết hạn', en: 'Expiring' },
  expired: { vi: 'Hết hạn', en: 'Expired' },
  none: { vi: 'Không thời hạn', en: 'No expiry' },
};
