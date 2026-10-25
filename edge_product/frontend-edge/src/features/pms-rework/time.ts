export function vesselDate(utc: string, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(utc))
  const get = (type: string) => parts.find(p => p.type === type)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}
export function vesselMidnight(day: string, zone: string): string {
  return vesselLocalToUtc(`${day}T00:00`, zone)
}
export function vesselLocalToUtc(value: string, zone: string): string {
  const desired = Date.parse(`${value}:00Z`)
  let guess = desired
  const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
  for (let i = 0; i < 4; i++) {
    const parts = formatter.formatToParts(new Date(guess)); const get = (type: string) => parts.find(p => p.type === type)!.value
    const represented = Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`)
    const difference = desired - represented
    if (difference === 0) return new Date(guess).toISOString()
    guess += difference
  }
  throw new Error('Ngày được chọn không có đầu ngày hợp lệ trong múi giờ tàu.')
}
export function vesselInput(utc: string | null | undefined, zone?: string): string {
  if (!utc || !zone) return ''
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(utc))
  const get = (type: string) => parts.find(p => p.type === type)!.value
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`
}
export function serverFilters(values: Record<string, string>, zone?: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(values)) {
    if (!value) continue
    if (['dueFrom', 'sourceFrom', 'dueTo', 'sourceTo'].includes(key)) {
      if (!zone) continue
      if (key.endsWith('From')) result[key] = vesselMidnight(value, zone)
      else { const next = new Date(Date.parse(value + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10); result[key] = new Date(Date.parse(vesselMidnight(next, zone)) - 1).toISOString() }
    } else result[key] = value
  }
  return result
}
