import type { WorkBook } from 'xlsx'
import type { EquipmentNode } from './types'

export interface ImportRow {
  rowNumber: number; code: string; name: string; assetCode: string; workCode: string; category: string; intervalType: string;
  intervalDays?: number; intervalMonths?: number; intervalYears?: number; intervalHours?: number;
  instructions: string; priority: string; department: string;
  sourceSheet?: string; sourceRow?: number; assetName?: string; sourceFrequency?: string; issues?: string[];
}
const oldLetters = 'µ¸¶·¹¨»¾¼½Æ©ÇÊÈÉË®ÌÐÎÏÑªÒÕÓÔÖ×ÝØÜÞßãáâä«åèæçé¬êíëìîïóñòô­õøö÷ùúýûüþ¡¢£¤¥¦§'
const newLetters = 'àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵĂÂÊÔƠƯĐ'
const letters = new Map([...oldLetters].map((c, i) => [c, newLetters[i]]))
// The original BIENDONG forms use TCVN3 mixed with Unicode and English.
export function planText(value: unknown, legacy = false) {
  const raw = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!legacy && !/[µ¸¶·¹¨»¾¼½Æ©ÇÊÈÉË®ÐÎÏÑªÒÕÓÔÖ×ÝØÜÞß«¬­¡¢£¤¥¦§]/.test(raw)) return raw
  if (/[ĂăĐđƠơƯư\u1EA0-\u1EF9]/.test(raw) && !/[µ¸¶·¹¨»¾¼½Æ©ÇÊÈÉË®ÐÎÏÑªÒÕÓÔÖ×ÝØÜÞß«¬­¡¢£¤¥¦§]/.test(raw)) return raw
  if (!/[µ¸¶·¹¨»¾¼½Æ©ÇÊÈÉË®ÐÎÏÑªÒÕÓÔÖ×ÝØÜÞß«åèæçé¬êíëîïñòô­õøö÷ùúýûüþ¡¢£¤¥¦§]/.test(raw)) return raw
  return raw.split(/(\s+)/).map(word => [...word].some(c => c.charCodeAt(0) > 255 && !letters.has(c)) ? word : [...word].map(c => letters.get(c) || c).join('')).join('')
}
const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim()
const fold = (value: unknown) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()
const key = (value: unknown) => fold(value).replace(/[^a-z0-9]/g, '')
const aliases: Record<string, string[]> = {
  code: ['schedulecode', 'macongviec', 'majob'], workCode: ['workcode', 'manguon', 'macongviecnguon'],
  name: ['schedulename', 'tencongviec', 'noidungbaoduong', 'motacongviecbaoquan', 'maintenancedescription'],
  assetCode: ['assetcode', 'mathietbi'], assetName: ['assetname', 'tenthietbi', 'equipmentname', 'tencuatrangthietbi'],
  category: ['maintenancecategory', 'loaibaotri'], frequency: ['freq', 'frequency', 'chuky'], intervalType: ['intervaltype'],
  intervalDays: ['intervaldays'], intervalMonths: ['intervalmonths'], intervalYears: ['intervalyears'], intervalHours: ['intervalhours'],
  instructions: ['instructions', 'huongdan'], notes: ['ghichu', 'notes'], priority: ['priority', 'uutien', 'douutien'], department: ['department', 'bophan', 'bophanphutrach'],
}
const categories: Record<string, string> = { periodic: 'PERIODIC', dinhky: 'PERIODIC', drydock: 'DRY_DOCK', docking: 'DRY_DOCK', lenda: 'DRY_DOCK', ondemand: 'ON_DEMAND', theoyeucau: 'ON_DEMAND', asneed: 'ON_DEMAND', asrequest: 'ON_DEMAND', voyage: 'VOYAGE', theochuyen: 'VOYAGE', chuyen: 'VOYAGE' }
const departments: Record<string, string> = { may: 'ENGINE', engine: 'ENGINE', boong: 'DECK', deck: 'DECK', phucvu: 'CATERING', catering: 'CATERING', khac: 'OTHER', other: 'OTHER' }
const priorities: Record<string, string> = { low: 'LOW', thap: 'LOW', normal: 'NORMAL', trungbinh: 'NORMAL', high: 'HIGH', cao: 'HIGH', critical: 'CRITICAL', khancap: 'CRITICAL' }

function frequency(raw: string) {
  const normalized = key(raw)
  if (categories[normalized] && categories[normalized] !== 'PERIODIC') return { category: categories[normalized], intervalType: 'CALENDAR' }
  const parts = fold(raw).split(/\s*(?:\+|\/)\s*/)
  const result: Partial<ImportRow> = { category: 'PERIODIC', intervalType: 'CALENDAR' }
  const seen = new Set<string>()
  for (const part of parts) {
    const text = part.replace(/\s+/g, '')
    const match = text.match(/^(m|y|d|h)(\d+)$/) || text.match(/^(\d+)(thang|nam|ngay|gio|hours?|months?|years?|days?)$/)
    if (!match) throw new Error(raw ? `Chu kỳ “${raw}” chưa rõ; dùng M3, Y1, D7, H1000 hoặc M3/H1000. Khoảng giờ cần được chọn lại, không tự lấy cận dưới.` : 'Chưa có chu kỳ cho công việc Định kỳ.')
    const unit = /^\d+$/.test(match[1]) ? match[2] : match[1], count = Number(/^\d+$/.test(match[1]) ? match[1] : match[2])
    if (!Number.isSafeInteger(count) || count < 1) throw new Error('Chu kỳ phải là số nguyên dương.')
    const field = /^(h|gio|hours?)$/.test(unit) ? 'intervalHours' : /^(m|thang|months?)$/.test(unit) ? 'intervalMonths' : /^(y|nam|years?)$/.test(unit) ? 'intervalYears' : 'intervalDays'
    if (seen.has(field) || field !== 'intervalHours' && [...seen].some(value => value !== 'intervalHours')) throw new Error('Chỉ chọn một chu kỳ lịch và tối đa một chu kỳ giờ chạy.')
    seen.add(field); result[field] = count
  }
  result.intervalType = seen.has('intervalHours') ? seen.size > 1 ? 'HYBRID' : 'RUNNING_HOURS' : 'CALENDAR'
  return result
}

export async function parseJobWorkbook(book: WorkBook, equipment: EquipmentNode[] = []): Promise<ImportRow[]> {
  const XLSX = await import('xlsx')
  const rows: ImportRow[] = []
  let found = false
  for (const [sheetIndex, sheetName] of book.SheetNames.entries()) {
    const sheet = book.Sheets[sheetName]
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: true })
    const headerIndex = matrix.slice(0, 40).findIndex(cells => {
      const headers = cells.map(key)
      return aliases.name.some(h => headers.includes(h)) && aliases.assetName.concat(aliases.assetCode).some(h => headers.includes(h))
    })
    if (headerIndex < 0) continue
    found = true
    const headers = matrix[headerIndex].map(key)
    const original = headers.includes('code') && headers.includes('maintenancedescription') && headers.includes('freq')
    const technical = headers.includes('schedulecode')
    if (technical) {
      for (const h of ['schedulecode', 'assetcode', 'schedulename', 'maintenancecategory', 'intervaltype']) if (!headers.includes(h)) throw new Error(`Thiếu cột ${h}. Hãy dùng mẫu import công việc.`)
      if (headers.some(h => ['lastexecutedat', 'nextduedate', 'lastexecutedrunninghours', 'baselineat', 'baselinerunninghours', 'lanthuchiencuoi', 'hantieptheo'].includes(h))) throw new Error('File import chỉ chứa định nghĩa công việc. Hãy bỏ các cột lịch sử, mốc và hạn tiếp theo.')
    }
    const columns = Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, headers.findIndex(h => names.includes(h))]))
    const nameOfSheet = fold(sheetName)
    const department = /may|engine|machinery/.test(nameOfSheet) ? 'ENGINE' : /boong|deck|hull/.test(nameOfSheet) ? 'DECK' : ''
    const year = sheetName.match(/20\d{2}/)?.[0]?.slice(-2) || ''
    // Propagate only genuinely merged source cells, never an arbitrary preceding work code.
    if (original) for (const merge of sheet['!merges'] || []) {
      if (merge.s.r <= headerIndex || merge.s.c > 3) continue
      for (let r = merge.s.r + 1; r <= merge.e.r; r++) if (matrix[r]) matrix[r][merge.s.c] ||= matrix[merge.s.r]?.[merge.s.c]
    }
    let previousAsset = '', sourceGroup = ''
    for (let r = headerIndex + (original ? 2 : 1); r < matrix.length; r++) {
      const cells = matrix[r]
      if (!cells || cells.every(c => clean(c) === '')) continue
      const get = (field: string) => columns[field] < 0 ? '' : clean(cells[columns[field]])
      const name = planText(get('name'), original), sourceFrequency = planText(get('frequency'), original)
      let assetName = planText(get('assetName'), original)
      if (original && /^(chief engineer|chief officer|captain|manager)/i.test(cells.map(clean).join(' ').trim())) break
      if (original && !name && !sourceFrequency) {
        if (assetName || clean(cells[0])) { sourceGroup = assetName || planText(cells[0], true); previousAsset = '' }
        continue
      }
      if (!name && !get('code') && !get('assetCode') && !sourceFrequency) continue
      if (original && !assetName) assetName = previousAsset
      if (original && assetName) previousAsset = assetName
      const issues: string[] = []
      let schedule: Partial<ImportRow> = { category: categories[key(get('category'))] || get('category') || 'PERIODIC', intervalType: get('intervalType') || 'CALENDAR' }
      if (!technical) {
        const category = categories[key(get('category'))]
        if (get('category') && !category) issues.push(`Loại bảo trì “${get('category')}” chưa được hỗ trợ.`)
        try {
          const parsed = frequency(sourceFrequency || (category && category !== 'PERIODIC' ? category : ''))
          if (category && parsed.category !== category) issues.push('Loại bảo trì và chu kỳ không thống nhất.')
          schedule = { ...schedule, ...parsed }
        } catch (error) { issues.push(error instanceof Error ? error.message : 'Chu kỳ không hợp lệ.') }
      }
      const positive = (field: string) => {
        const raw = get(field); if (!raw) return undefined
        const value = Number(raw)
        if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Dòng ${r + 1}: ${field} phải là số nguyên dương.`)
        return value
      }
      let assetCode = get('assetCode')
      if (!assetCode && assetName) {
        let matches = equipment.filter(a => a.isActive && a.category !== 'SYSTEM' && a.status !== 'DECOMMISSIONED' && fold(a.assetName) === fold(assetName))
        if (matches.length > 1 && sourceGroup) {
          const inGroup = matches.filter(asset => {
            const seen = new Set<string>(); let parentId = asset.parentId
            while (parentId && !seen.has(parentId)) {
              seen.add(parentId); const parent = equipment.find(a => a.id === parentId)
              if (!parent) break
              if (fold(parent.assetName) === fold(sourceGroup)) return true
              parentId = parent.parentId
            }
            return false
          })
          if (inGroup.length === 1) matches = inGroup
        }
        if (matches.length === 1) assetCode = matches[0].assetCode
        else issues.push(matches.length ? `Tên thiết bị “${assetName}” bị trùng; bổ sung mã thiết bị cụ thể.` : `Chưa đối chiếu được thiết bị “${assetName}”; bổ sung mã thiết bị đang có.`)
      }
      if (get('assetCode') && assetName) {
        const asset = equipment.find(a => a.assetCode.toLowerCase() === assetCode.toLowerCase())
        if (asset && fold(asset.assetName) !== fold(assetName)) issues.push('Tên thiết bị không khớp mã thiết bị; sửa tên đối chiếu hoặc để trống tên.')
      }
      const rowNumber = sheetIndex * 100000 + r + 1
      const code = original ? `BD${year}-${department === 'ENGINE' ? 'M' : department === 'DECK' ? 'D' : sheetIndex + 1}-R${String(r + 1).padStart(4, '0')}` : get('code')
      rows.push({ rowNumber, code, workCode: original ? clean(cells[0]) : get('workCode'), assetCode, assetName, name: original ? name.slice(0, 200) : name,
        category: schedule.category!, intervalType: schedule.intervalType!,
        intervalDays: technical ? positive('intervalDays') : schedule.intervalDays,
        intervalMonths: technical ? positive('intervalMonths') : schedule.intervalMonths,
        intervalYears: technical ? positive('intervalYears') : schedule.intervalYears,
        intervalHours: technical ? positive('intervalHours') : schedule.intervalHours,
        instructions: [original ? name : '', planText(get('instructions')), planText(get('notes'))].filter(Boolean).join('\n'),
        priority: priorities[key(get('priority'))] || get('priority') || 'NORMAL',
        department: departments[key(get('department'))] || get('department') || department,
        sourceSheet: sheetName, sourceRow: r + 1, sourceFrequency, ...(issues.length ? { issues } : {}) })
    }
  }
  if (!found) throw new Error('Không tìm thấy bảng công việc. Dùng mẫu Job BQBD hoặc bảng Code / Equipment Name / Maintenance Description / Freq. trong file BIENDONG.')
  if (rows.length < 1 || rows.length > 1000) throw new Error('Mỗi file cần từ 1 đến 1.000 công việc.')
  return rows
}

export function jobImportPayload(rows: ImportRow[]) {
  return rows.map(({ sourceSheet: _sheet, sourceRow: _row, assetName: _name, sourceFrequency: _frequency, issues: _issues, ...definition }) => definition)
}
