import axios from 'axios';
import type { MaterialRequest, CreateMaterialRequestDto } from '@/types/pms.types';

const API = '/api/material-requests';

export const materialRequestService = {
  async getAll(params?: { page?: number; pageSize?: number; status?: string; q?: string }) {
    const response = await axios.get(API, { params });
    return response.data as { items: MaterialRequest[]; total: number; page: number; pageSize: number };
  },

  async getById(id: number): Promise<MaterialRequest> {
    const response = await axios.get(`${API}/${id}`);
    return response.data;
  },

  async create(data: CreateMaterialRequestDto) {
    const response = await axios.post(API, data);
    return response.data as { id: number; requestCode: string };
  },

  async update(id: number, data: Partial<CreateMaterialRequestDto> & { status?: string }) {
    const response = await axios.put(`${API}/${id}`, data);
    return response.data;
  },

  async submit(id: number) {
    const response = await axios.put(`${API}/${id}/submit`);
    return response.data;
  },

  async approve(id: number) {
    const response = await axios.put(`${API}/${id}/approve`);
    return response.data;
  },

  async reject(id: number) {
    const response = await axios.put(`${API}/${id}/reject`);
    return response.data;
  },

  async delete(id: number) {
    await axios.delete(`${API}/${id}`);
  },

  async getApproved() {
    const response = await axios.get(`${API}/approved`);
    return (response.data as MaterialRequest[]).filter(request => request.status === 'Approved');
  },
};
