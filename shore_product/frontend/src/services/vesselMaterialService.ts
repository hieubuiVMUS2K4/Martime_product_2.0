import { apiClient } from './api.client';
import * as XLSX from 'xlsx';

export interface VesselMaterialInput {
  itemCode: string; name: string; unit: string; specification?: string | null;
  manufacturer?: string | null; partNumber?: string | null; supplier?: string | null; notes?: string | null; unitCost?: number | null;
}
export interface VesselMaterial extends VesselMaterialInput {
  id: string; catalogId: string; vesselId: string; onHandQuantity: number; updatedAt: string;
  syncStatus: 'NotSynced' | 'Pending' | 'Synced'; syncedAt?: string | null;
}
const path = (vesselId: string) => `/vessels/${vesselId}/materials`;
export const vesselMaterialService = {
  list: (vesselId: string) => apiClient.get<VesselMaterial[]>(path(vesselId)),
  create: (vesselId: string, row: VesselMaterialInput) => apiClient.post(path(vesselId), row),
  update: (vesselId: string, id: string, row: VesselMaterialInput) => apiClient.put(`${path(vesselId)}/${id}`, row),
  remove: (vesselId: string, ids: string[]) => apiClient.post(`${path(vesselId)}/delete`, ids),
  import: (vesselId: string, rows: VesselMaterialInput[]) => apiClient.post(`${path(vesselId)}/import`, rows),
  sync: (vesselId: string) => apiClient.post<{ queued: number; message: string }>(`${path(vesselId)}/sync`, {}),
};

const headers = ['ItemCode', 'Name', 'Unit', 'PartNumber', 'Manufacturer', 'Specification', 'Supplier', 'UnitCost', 'Notes'];
export function downloadVesselMaterialTemplate() {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([headers]);
  sheet['!cols'] = headers.map(() => ({ wch: 24 }));
  XLSX.utils.book_append_sheet(book, sheet, 'Vật tư');
  const guide = XLSX.utils.aoa_to_sheet([
    ['Cột', 'Hướng dẫn'], ['ItemCode', 'Mã vật tư trên tàu, bắt buộc, tối đa 50 ký tự.'],
    ['Name', 'Tên vật tư, bắt buộc, tối đa 200 ký tự.'], ['Unit', 'Đơn vị tính, bắt buộc, tối đa 20 ký tự.'],
    ['UnitCost', 'Đơn giá không âm, có thể để trống.'],
    ['Import', 'Tối đa 1000 vật tư mới cho tàu đang chọn. Mã đã tồn tại sẽ bị từ chối; không tự ghi đè.'],
    ['Đồng bộ', 'Sau khi lưu/import, bấm Đồng bộ để gửi tới đúng tàu. Không import số lượng tồn kho.'],
  ]);
  guide['!cols'] = [{ wch: 20 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(book, guide, 'Hướng dẫn');
  XLSX.writeFile(book, 'Mau-vat-tu-tau.xlsx');
}

export async function parseVesselMaterialFile(file: File): Promise<VesselMaterialInput[]> {
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], { defval: '' });
  if (!data.length || data.length > 1000) throw new Error('File cần từ 1 đến 1000 vật tư.');
  const codes = new Set<string>();
  return data.map((row, index) => {
    const itemCode = String(row.ItemCode ?? '').trim();
    const name = String(row.Name ?? '').trim();
    const unit = String(row.Unit ?? '').trim();
    const unitCost = row.UnitCost === '' || row.UnitCost == null ? null : Number(row.UnitCost);
    if (!itemCode || itemCode.length > 50 || !name || name.length > 200 || !unit || unit.length > 20)
      throw new Error(`Dòng ${index + 2}: cần mã vật tư, tên và đơn vị tính đúng giới hạn.`);
    if (codes.has(itemCode.toLowerCase())) throw new Error(`Dòng ${index + 2}: mã vật tư bị trùng.`);
    codes.add(itemCode.toLowerCase());
    if (unitCost != null && (!Number.isFinite(unitCost) || unitCost < 0)) throw new Error(`Dòng ${index + 2}: đơn giá không hợp lệ.`);
    return { itemCode, name, unit, unitCost, partNumber: String(row.PartNumber ?? '').trim(),
      manufacturer: String(row.Manufacturer ?? '').trim(), specification: String(row.Specification ?? '').trim(),
      supplier: String(row.Supplier ?? '').trim(), notes: String(row.Notes ?? '').trim() };
  });
}
