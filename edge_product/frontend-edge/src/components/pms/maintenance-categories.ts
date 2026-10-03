export const eventMaintenanceCategories = ['DRY_DOCK', 'ON_DEMAND', 'VOYAGE'] as const;
export const isEventMaintenance = (category?: string) => eventMaintenanceCategories.some(value => value === category);
export const maintenanceCategoryLabel = (category: string | undefined, t: (key: string) => string) => {
  if (category === 'DRY_DOCK') return 'Lên đà';
  if (category === 'ON_DEMAND') return 'Theo yêu cầu';
  if (category === 'VOYAGE') return 'Theo chuyến';
  if (category === 'AD_HOC' || category === 'CORRECTIVE') return t('pms.workPlanning.filters.adhoc');
  return t('pms.workPlanning.filters.periodic');
};
