import type { EquipmentNode } from './types'

export const selectableJobEquipment = (asset: EquipmentNode) => asset.isActive && asset.category !== 'SYSTEM' && asset.status !== 'DECOMMISSIONED'

export function equipmentReferenceRows(equipment: EquipmentNode[]) {
  const byId = new Map(equipment.map(asset => [asset.id, asset]))
  return [...equipment].sort((a, b) => a.assetCode.localeCompare(b.assetCode)).map((asset, index) => {
    const seen = new Set([asset.id]); const parents: string[] = []; let parentId = asset.parentId
    while (parentId && !seen.has(parentId)) {
      seen.add(parentId); const parent = byId.get(parentId); if (!parent) break
      parents.unshift(`${parent.assetCode} — ${parent.assetName}`); parentId = parent.parentId
    }
    const statuses: Record<string, string> = { STANDBY: 'Sẵn sàng', OPERATIONAL: 'Đang hoạt động', UNDER_MAINTENANCE: 'Đang bảo trì', ACTIVE: 'Đang hoạt động', INACTIVE: 'Ngừng hoạt động' }
    return [index + 1, asset.assetCode, asset.assetName, parents.join(' / '), asset.category === 'SYSTEM' ? 'Nhóm thiết bị' : 'Thiết bị',
      !asset.isActive ? 'Ngừng hoạt động' : asset.status === 'DECOMMISSIONED' ? 'Ngừng sử dụng' : statuses[asset.status] || asset.status,
      selectableJobEquipment(asset) ? 'Có' : asset.category === 'SYSTEM' ? 'Nhóm thiết bị — không chọn' : 'Không']
  })
}

// The application fills the prepared workbook at download time, so its reference data is never a stale static export.
export async function fillJobTemplate(template: ArrayBuffer, equipment: EquipmentNode[]) {
  const ExcelJS = await import('exceljs')
  const book = new ExcelJS.Workbook()
  await book.xlsx.load(template)
  const sheet = book.getWorksheet('Danh_muc_thiet_bi')
  if (!sheet || !book.getWorksheet('Huong_dan')) throw new Error('Mẫu Job thiếu sheet danh mục thiết bị hoặc hướng dẫn.')
  sheet.unMergeCells('A4:G4')
  if (sheet.rowCount > 3) sheet.spliceRows(4, sheet.rowCount - 3)
  const rows = equipmentReferenceRows(equipment)
  const eligible = equipment.filter(selectableJobEquipment).sort((a, b) => a.assetCode.localeCompare(b.assetCode))
  if (!eligible.length) throw new Error('Chưa có thiết bị cụ thể đang sử dụng để lập Job. Hãy bổ sung danh mục thiết bị trước.')
  rows.forEach((values, i) => {
    const row = sheet.getRow(i + 4)
    values.forEach((value, column) => { row.getCell(column + 1).value = value })
    row.height = Math.max(30, Math.ceil(Math.max(String(values[2]).length / 40, String(values[3]).length / 65)) * 15)
    for (let c = 1; c <= 7; c++) {
      const cell = row.getCell(c)
      cell.font = { name: 'Arial', size: 10, color: { argb: 'FF000000' } }
      cell.alignment = { vertical: 'middle', wrapText: true }
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
    }
  })
  eligible.forEach((asset, i) => { sheet.getCell(i + 4, 8).value = asset.assetCode })
  sheet.getColumn(8).hidden = true
  sheet.autoFilter = { from: 'A3', to: `G${Math.max(4, rows.length + 3)}` }
  sheet.views = [{ state: 'frozen', ySplit: 3 }]
  book.definedNames.add(`'Danh_muc_thiet_bi'!$H$4:$H$${eligible.length + 3}`, 'MaThietBiChoJob')
  for (const name of ['Máy', 'Boong']) {
    const jobs = book.getWorksheet(name); if (!jobs) throw new Error('Mẫu Job thiếu sheet Máy/Boong.')
    for (let r = 9; r <= 22; r++) jobs.getCell(r, 4).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['MaThietBiChoJob'], showErrorMessage: true,
      errorStyle: 'stop', errorTitle: 'Mã thiết bị không hợp lệ', error: 'Chọn mã trong danh sách hoặc xem sheet Danh_muc_thiet_bi.',
    }
    // Example jobs remain examples; their equipment cells are blank until the user selects a real code.
    for (let r = 9; r <= 22; r++) { jobs.getCell(r, 4).value = null; jobs.getCell(r, 5).value = null }
    jobs.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:7' }
  }
  const bytes = await book.xlsx.writeBuffer()
  return new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
