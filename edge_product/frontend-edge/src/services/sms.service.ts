/**
 * SMS Document Management Service - API Layer
 * Integrates with edge-services /api/sms
 */
import { apiClient } from '@/services/api.client';

// SMS master data is issued by Shore, regardless of the user's role on Edge.
export const canManageSmsPolicies = false;

function requireShorePolicyManagement(): void {
  throw new Error('Chính sách, quy trình và biểu mẫu SMS chỉ được cập nhật từ bờ (Shore).');
}

export interface SmsTreeChapter {
  id: number;
  chapterName: string;
  procedures: SmsProcedure[];
}

export interface SmsProcedure {
  id: string;
  procedureCode: string;
  title: string;
  version: string;
  publishDate: string;
  status: 'Active' | 'Draft' | 'Obsolete';
  watermarkText: string;
  filePath?: string;
  formTemplates: SmsFormTemplateSummary[];
}

export interface SmsFormTemplateSummary {
  id: string;
  formCode: string;
  title: string;
}

export interface SmsProcedureDetail {
  id: string;
  ismElementId: number;
  procedureCode: string;
  title: string;
  content: string;
  filePath?: string;
  version: string;
  publishDate: string;
  status: 'Active' | 'Draft' | 'Obsolete';
  changeNote?: string;
  obsoleteDate?: string;
  watermarkText: string;
  formTemplates: SmsFormTemplate[];
  acknowledgements: SmsAcknowledgement[];
}

export interface SmsAcknowledgement {
  id: string;
  userName: string;
  rank: string;
  acknowledgedAt: string;
}

export interface SmsFormTemplate {
  id: string;
  smsProcedureId: string;
  formCode: string;
  title: string;
  contentSchema: string; // JSON String
  procedureTitle?: string;
  procedureCode?: string;
}

export interface SmsFilledRecord {
  id: string;
  formTemplateId: string;
  vesselName: string;
  filledBy: string;
  filledDate: string;
  filledData: string; // JSON String
  digitalSignatures: string; // JSON String (SignatureEntry[])
  status: 'Draft' | 'Submitted' | 'Approved';
  formTitle?: string;
  formCode?: string;
  procedureCode?: string;
  ismChapterId?: number;
}

export interface SignatureEntry {
  name: string;
  rank: string;
  timestamp: string;
  sigCode: string;
}

class SmsService {
  async getSmsTree(search?: string): Promise<SmsTreeChapter[]> {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiClient.get<SmsTreeChapter[]>(`/sms/tree${query}`);
  }

  async getProcedure(id: string): Promise<SmsProcedureDetail> {
    return apiClient.get<SmsProcedureDetail>(`/sms/procedures/${id}`);
  }

  async acknowledgeProcedure(id: string, userName: string, rank: string): Promise<{ message: string }> {
    return apiClient.post<{ message: string }>(`/sms/procedures/${id}/acknowledge`, { userName, rank });
  }

  async getFormTemplate(id: string): Promise<SmsFormTemplate> {
    return apiClient.get<SmsFormTemplate>(`/sms/templates/${id}`);
  }

  async getFilledRecords(ismChapter?: number, status?: string): Promise<SmsFilledRecord[]> {
    const params: Record<string, string> = {};
    if (ismChapter !== undefined && ismChapter !== null) {
      params.ismChapter = ismChapter.toString();
    }
    if (status) {
      params.status = status;
    }
    const query = new URLSearchParams(params).toString();
    return apiClient.get<SmsFilledRecord[]>(`/sms/records${query ? '?' + query : ''}`);
  }

  async createFilledRecord(data: {
    formTemplateId: string;
    vesselName?: string;
    filledBy: string;
    filledData: string;
    submitImmediately?: boolean;
  }): Promise<{ message: string; recordId: string; status: string }> {
    return apiClient.post<{ message: string; recordId: string; status: string }>('/sms/records', data);
  }

  async updateFilledRecord(
    id: string,
    data: {
      filledBy: string;
      filledData: string;
      submitImmediately?: boolean;
    }
  ): Promise<{ message: string; status: string }> {
    return apiClient.put<{ message: string; status: string }>(`/sms/records/${id}`, data);
  }

  async signRecord(
    id: string,
    data: {
      pin: string;
      name: string;
      rank: string;
    }
  ): Promise<{ message: string; signatures: SignatureEntry[]; status: string }> {
    return apiClient.post<{ message: string; signatures: SignatureEntry[]; status: string }>(`/sms/records/${id}/sign`, data);
  }

  async approveRecord(
    id: string,
    data: {
      pin: string;
      name: string;
      rank: string;
    }
  ): Promise<{ message: string; signatures: SignatureEntry[]; status: string }> {
    return apiClient.post<{ message: string; signatures: SignatureEntry[]; status: string }>(`/sms/records/${id}/approve`, data);
  }

  async bumpVersion(data: {
    procedureId: string;
    newVersion: string;
    newContent: string;
    changeNote?: string;
    filePath?: string;
  }): Promise<{ message: string; newProcedureId: string }> {
    requireShorePolicyManagement();
    return apiClient.post<{ message: string; newProcedureId: string }>('/sms/procedures/version-up', data);
  }

  async importDocx(file: File): Promise<{ message: string; html: string; filePath: string }> {
    requireShorePolicyManagement();
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post<{ message: string; html: string; filePath: string }>('/sms/procedures/import', formData);
  }

  async createProcedure(data: {
    ismElementId: number;
    procedureCode: string;
    title: string;
    content: string;
    version: string;
    filePath?: string;
  }): Promise<{ message: string; procedureId: string }> {
    requireShorePolicyManagement();
    return apiClient.post<{ message: string; procedureId: string }>('/sms/procedures', data);
  }

  async createFormTemplate(data: {
    smsProcedureId: string;
    formCode: string;
    title: string;
    contentSchema?: string;
  }): Promise<{ message: string; templateId: string }> {
    requireShorePolicyManagement();
    return apiClient.post<{ message: string; templateId: string }>('/sms/templates', data);
  }

  async getAllFormTemplates(): Promise<SmsFormTemplate[]> {
    return apiClient.get<SmsFormTemplate[]>('/sms/templates');
  }

  async assignTemplates(procedureId: string, templateIds: string[]): Promise<{ message: string; assignedTemplateIds: string[] }> {
    requireShorePolicyManagement();
    return apiClient.post<{ message: string; assignedTemplateIds: string[] }>(`/sms/procedures/${procedureId}/assign-templates`, templateIds);
  }

  async deleteProcedure(id: string): Promise<{ message: string }> {
    requireShorePolicyManagement();
    return apiClient.delete<{ message: string }>(`/sms/procedures/${id}`);
  }

  async deleteFormTemplate(id: string): Promise<{ message: string }> {
    requireShorePolicyManagement();
    return apiClient.delete<{ message: string }>(`/sms/templates/${id}`);
  }
}

export const smsService = new SmsService();
