export const departmentNames: Record<string, string> = { DECK: 'Boong', ENGINE: 'Máy', CATERING: 'Phục vụ', OTHER: 'Khác' }
export function departmentCode(value?: string | null): string | null {
  const text = value?.trim()
  if (!text) return null
  const upper = text.toLocaleUpperCase('vi-VN')
  return Object.keys(departmentNames).find(code => code === upper || departmentNames[code].toLocaleUpperCase('vi-VN') === upper) || text
}
export function departmentName(value?: string | null) {
  const code = departmentCode(value)
  return code ? departmentNames[code] || code : 'Chưa xác định'
}
