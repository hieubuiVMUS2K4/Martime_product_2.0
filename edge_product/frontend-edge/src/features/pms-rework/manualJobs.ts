export const manualJobCategories = ['ON_DEMAND', 'DRY_DOCK', 'VOYAGE'] as const
export const isManualJob = (category: string) => manualJobCategories.some(value => value === category)
