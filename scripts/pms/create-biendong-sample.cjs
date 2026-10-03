const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');
const XLSX = require('../../edge_product/frontend-edge/node_modules/xlsx');
const dir = path.resolve(__dirname, '../../docs/imports/biendong-star-2026');
const read = (file, sheet) => XLSX.utils.sheet_to_json(XLSX.readFile(path.join(dir, file)).Sheets[sheet], { defval: '' });
const jobs = read('BIENDONG_STAR_2026_Cong_viec_bao_tri.xlsx', 'Maintenance');
const equipment = read('BIENDONG_STAR_2026_Thiet_bi.xlsx', 'Equipment');
const valid = jobs.filter(j => !j.Review && j.ScheduleName && (j.MaintenanceCategory !== 'PERIODIC' || j.IntervalMonths || j.IntervalYears || j.IntervalHours));
const selected = new Set();
const kinds = {
  MONTHS: j => !!j.IntervalMonths, YEARS: j => !!j.IntervalYears, HOURS: j => !!j.IntervalHours,
  DRY_DOCK: j => j.MaintenanceCategory === 'DRY_DOCK',
  ON_DEMAND: j => j.MaintenanceCategory === 'ON_DEMAND', VOYAGE: j => j.MaintenanceCategory === 'VOYAGE',
};
for (const [kind, predicate] of Object.entries(kinds)) {
  const job = valid.find(predicate);
  if (!job) throw new Error('No valid source row for ' + kind);
  selected.add(job.AssetCode);
}
for (const job of valid) { if (selected.size >= 10) break; selected.add(job.AssetCode); }
const importBatch = process.argv.includes('--renew') ? Date.now().toString(36).toUpperCase() + '-' + randomBytes(4).toString('hex').toUpperCase() : null;
const sample = valid.filter(j => selected.has(j.AssetCode)).map(job => ({
  ...job,
  ScheduleCode: importBatch ? job.ScheduleCode + '-T-' + importBatch : job.ScheduleCode,
}));
if (sample.some(job => job.ScheduleCode.length > 50)) throw new Error('ScheduleCode exceeds import limit');
const ancestors = new Set(selected);
for (const code of ancestors) {
  const asset = equipment.find(a => a.AssetCode === code);
  if (!asset) throw new Error('Missing equipment ' + code);
  if (asset.ParentAssetCode) ancestors.add(asset.ParentAssetCode);
}
function write(file, sheet, rows, notes) {
  const book = XLSX.utils.book_new();
  const data = XLSX.utils.json_to_sheet(rows);
  data['!autofilter'] = { ref: data['!ref'] };
  data['!cols'] = Object.keys(rows[0]).map(k => ({ wch: /Name|Instructions|Description/.test(k) ? 48 : 22 }));
  XLSX.utils.book_append_sheet(book, data, sheet);
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(notes.map(Note => ({ Note }))), 'Huong_dan');
  XLSX.writeFile(book, path.join(dir, file));
}
write('BIENDONG_STAR_2026_Cong_viec_bao_tri_10_thiet_bi.xlsx', 'Maintenance', sample, [
  importBatch ? 'Mã ScheduleCode mới cho đợt thử ' + importBatch + '; tránh trùng cấu hình đã xóa mềm. WorkCode và AssetCode giữ nguyên.' : 'Dùng --renew để tạo mã cấu hình mới khi thử import lại sau xóa mềm.',
  "Không nhập lịch sử thực hiện hoặc hạn tiếp theo. Hệ thống tự tính lịch từ chu kỳ; ngày nguồn chỉ dùng đối chiếu.",
  'Chọn 10 thiết bị từ file đã tách, giữ tất cả công việc có chu kỳ rõ ràng của các thiết bị này. Không tự thêm công việc.',
  'Có đủ tháng, năm, giờ, lên đà, theo yêu cầu và theo chuyến. Các dòng cần rà soát không nằm trong mẫu này.',
  'Nhập file thiết bị mẫu trước nếu các AssetCode chưa có trên tàu. Nhóm không tính vào số 10 thiết bị.',
  'ScheduleCode là khóa duy nhất; WorkCode giữ mã công việc nguồn. Import cấu hình, không tự sinh công việc đang chờ thực hiện.',
]);
write('BIENDONG_STAR_2026_Thiet_bi_mau_10.xlsx', 'Equipment', equipment.filter(a => ancestors.has(a.AssetCode)), [
  '10 thiết bị thật và các nhóm cha cần thiết, cùng AssetCode với file công việc mẫu.',
  'Chỉ nhập vào tàu phù hợp; không nhập lại nếu các mã thiết bị này đã tồn tại.',
]);
const summary = { equipment: selected.size, groups: ancestors.size - selected.size, jobs: sample.length,
  kinds: Object.fromEntries(Object.entries(kinds).map(([k, p]) => [k, sample.filter(p).length])) };
fs.writeFileSync(path.join(dir, 'sample-10-summary.json'), JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
