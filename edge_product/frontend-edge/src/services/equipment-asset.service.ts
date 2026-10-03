import axios from 'axios';
import type { EquipmentAsset, CreateEquipmentAssetDto } from '@/types/pms.types';
import { getAuthToken } from './api.client';

const API_BASE_URL = '/api';
let treeSnapshot: EquipmentAsset[] | null = null;
let treeSnapshotJson = '';
let treeRequest: Promise<EquipmentAsset[]> | null = null;

export const getCachedEquipmentTree = () => treeSnapshot;

// Inject auth token into all axios requests (for audit trail)
axios.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const equipmentAssetService = {
  async getAll(category?: string): Promise<EquipmentAsset[]> {
    const params = category ? { category } : {};
    const response = await axios.get(`${API_BASE_URL}/equipment-assets`, { params });
    return response.data;
  },

  /** Lấy tất cả assets dưới dạng flat list có parentId, frontend tự build tree */
  async getTree(): Promise<EquipmentAsset[]> {
    if (treeRequest) return treeRequest;
    const request = axios.get<EquipmentAsset[]>(`${API_BASE_URL}/equipment-assets/tree`).then(response => {
      const serialized = JSON.stringify(response.data);
      if (treeSnapshot && serialized === treeSnapshotJson) return treeSnapshot;
      treeSnapshot = response.data;
      treeSnapshotJson = serialized;
      return response.data;
    });
    treeRequest = request;
    try { return await request; } finally { if (treeRequest === request) treeRequest = null; }
  },

  async getById(id: string): Promise<EquipmentAsset> {
    const response = await axios.get(`${API_BASE_URL}/equipment-assets/${id}`);
    return response.data;
  },

  async getByGroupId(groupId: string): Promise<EquipmentAsset[]> {
    const response = await axios.get(`${API_BASE_URL}/equipment-assets/group/${groupId}`);
    return response.data;
  },

  async create(data: CreateEquipmentAssetDto): Promise<EquipmentAsset> {
    const response = await axios.post(`${API_BASE_URL}/equipment-assets`, data);
    return response.data;
  },

  async update(id: string, data: Partial<EquipmentAsset>): Promise<EquipmentAsset> {
    const response = await axios.put(`${API_BASE_URL}/equipment-assets/${id}`, data);
    return response.data;
  },

  async delete(id: string): Promise<void> {
    await axios.delete(`${API_BASE_URL}/equipment-assets/${id}`);
  },

  async bulkImport(assets: any[]): Promise<{ success: boolean; imported: number; errors?: string[] }> {
    const response = await axios.post(`${API_BASE_URL}/equipment-assets/import`, assets);
    return response.data;
  },

  async updateRunningHours(id: string, runningHours: number): Promise<{ triggeredTasks: number }> {
    const response = await axios.patch(`${API_BASE_URL}/equipment-assets/${id}/running-hours`, runningHours, {
      headers: { 'Content-Type': 'application/json' }
    });
    return response.data;
  }
};
