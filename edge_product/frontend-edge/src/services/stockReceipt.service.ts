import axios from 'axios';
import type { StockReceipt, CreateStockReceiptDto } from '@/types/pms.types';

const API = '/api/stock-receipts';

export const stockReceiptService = {
  async getAll(params?: { page?: number; pageSize?: number; status?: string; q?: string }) {
    const response = await axios.get(API, { params });
    return response.data as { items: StockReceipt[]; total: number; page: number; pageSize: number };
  },

  async getById(id: number): Promise<StockReceipt> {
    const response = await axios.get(`${API}/${id}`);
    return response.data;
  },

  async create(data: CreateStockReceiptDto) {
    const response = await axios.post(API, data);
    return response.data as { id: number; receiptCode: string };
  },

  async update(id: number, data: Partial<CreateStockReceiptDto> & { status?: string }) {
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

  async complete(id: number) {
    const response = await axios.put(`${API}/${id}/complete`);
    return response.data;
  },

  async delete(id: number) {
    await axios.delete(`${API}/${id}`);
  },
};
