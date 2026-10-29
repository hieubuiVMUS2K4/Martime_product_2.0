import { translateMessage as tx } from '@/i18n/messages'
const canonicalNames: Record<string, string> = { DECK: 'Boong', ENGINE: 'Máy', CATERING: 'Phục vụ', OTHER: 'Khác' }
export const departmentNames: Record<string, string> = {
  get DECK() { return tx('pmsRework.departmentDeck') },
  get ENGINE() { return tx('pmsRework.departmentEngine') },
  get CATERING() { return tx('pmsRework.departmentCatering') },
  get OTHER() { return tx('pmsRework.other') },
}
export function departmentCode(value?: string | null): string | null {
  const text = value?.trim()
  if (!text) return null
  const upper = text.toLocaleUpperCase('vi-VN')
  return Object.keys(departmentNames).find(code => code === upper || canonicalNames[code].toLocaleUpperCase('vi-VN') === upper || departmentNames[code].toLocaleUpperCase('vi-VN') === upper) || text
}
export function departmentName(value?: string | null) {
  const code = departmentCode(value)
  return code ? departmentNames[code] || code : tx('pmsRework.notSpecified')
}
