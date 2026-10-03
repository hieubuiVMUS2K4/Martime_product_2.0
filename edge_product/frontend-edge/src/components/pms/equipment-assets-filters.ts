import type { EquipmentAsset } from '@/types/pms.types';

export const emptyEquipmentFilters = {
  assetName: '', assetCode: '', category: '', status: '', manufacturer: '', model: '',
  serialNumber: '', technicalSpecs: '', picCrewName: '',
};
export type EquipmentFilters = typeof emptyEquipmentFilters;

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();

export function matchesEquipmentFilters(asset: EquipmentAsset, filters: EquipmentFilters) {
  const textFields = ['assetName', 'assetCode', 'manufacturer', 'model', 'serialNumber', 'technicalSpecs', 'picCrewName'] as const;
  if (textFields.some(key => filters[key] && !normalize(asset[key] || '').includes(normalize(filters[key].trim())))) return false;
  if (filters.category && asset.category !== filters.category) return false;
  if (filters.status && asset.status !== filters.status) return false;
  return true;
}
