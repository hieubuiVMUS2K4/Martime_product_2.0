const fs = require('fs');
const path = require('path');
const XLSX = require('../../edge_product/frontend-edge/node_modules/xlsx');
const input = process.argv[2];
if (!input) throw new Error('Usage: node scripts/pms/extract-biendong-plan.cjs <source.xls> [output-directory]');
const output = path.resolve(process.argv[3] || 'docs/imports/biendong-star-2026');
fs.mkdirSync(output, { recursive: true });
const book = XLSX.readFile(input, { cellDates: false });
const legacy = 'µ¸¶·¹¨»¾¼½Æ©ÇÊÈÉË®ÌÐÎÏÑªÒÕÓÔÖ×ÝØÜÞßãáâä«åèæçé¬êíëìîïóñòô­õøö÷ùúýûüþ¡¢£¤¥¦§';
const unicode = 'àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵĂÂÊÔƠƯĐ';
if (legacy.length !== unicode.length) throw new Error('Invalid encoding map');
const mapping = new Map([...legacy].map((c, i) => [c, unicode[i]]));
function clean(v) { return String(v ?? '').replace(/\s+/g, ' ').trim(); }
function text(v) {
  const raw = clean(v);
  if (!/[µ¸¶·¹¨»¾¼½Æ©ÇÊÈÉË®ÐÎÏÑªÒÕÓÔÖ×ÝØÜÞß«åèæçé¬êíëîïñòô­õøö÷ùúýûüþ¡¢£¤¥¦§]/.test(raw)) return raw;
  return raw.split(/(\s+)/).map(token => {
    // Preserve already-Unicode words in mixed cells. Original values are retained separately.
    if ([...token].some(c => c.charCodeAt(0) > 255 && !mapping.has(c))) return token;
    const translated = [...token].map(c => mapping.get(c) || c).join('');
    return /[A-Z]/.test(token) && !/[a-z]/.test(token) ? translated.toUpperCase() : translated;
  }).join('');
}
function iso(v) {
  if (typeof v !== 'number' || v < 20000 || v > 80000) return '';
  const d = XLSX.SSF.parse_date_code(v);
  return d ? [d.y, String(d.m).padStart(2, '0'), String(d.d).padStart(2, '0')].join('-') : '';
}
function frequency(value) {
  const source = clean(value), normalized = text(source).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const f = { MaintenanceCategory: 'PERIODIC', IntervalType: '', IntervalHours: '', IntervalMonths: '', IntervalYears: '', IntervalDays: '', HoursMinimum: '', HoursMaximum: '', AutoGenerate: false, Review: '' };
  if (/dry\s*dock|docking/.test(normalized)) return { ...f, MaintenanceCategory: 'DRY_DOCK' };
  if (/as\s*(need|request)/.test(normalized)) return { ...f, MaintenanceCategory: 'ON_DEMAND' };
  if (/chuyen/.test(normalized)) return { ...f, MaintenanceCategory: 'VOYAGE' };
  const hours = normalized.match(/^h\s*(\d+)(?:\s*-\s*(\d+))?$/);
  if (hours) return { ...f, IntervalType: 'RUNNING_HOURS', IntervalHours: hours[2] ? '' : +hours[1], HoursMinimum: hours[2] ? +hours[1] : '', HoursMaximum: hours[2] ? +hours[2] : '', Review: hours[2] ? 'Khoảng giờ chạy: cần chọn chu kỳ trước khi import.' : '' };
  const m = normalized.match(/^m\s*(\d+)$/) || normalized.match(/^(\d+)\s*thang$/);
  if (m) return { ...f, IntervalType: 'CALENDAR', IntervalMonths: +m[1] };
  const y = normalized.match(/^y\s*(\d+)$/) || normalized.match(/^(\d+)\s*nam$/);
  if (y) return { ...f, IntervalType: 'CALENDAR', IntervalYears: +y[1] };
  return { ...f, Review: source ? 'Chưa nhận diện chu kỳ nguồn.' : 'Nguồn chưa ghi chu kỳ.' };
}
const assets = [], jobs = [], sources = [], audit = [];
const byIdentity = new Map(); let serial = 0;
function asset(name, parent, category, sheet, row, rawName) {
  const key = [parent, category, name.toLowerCase()].join('|');
  if (byIdentity.has(key)) return byIdentity.get(key);
  const a = { AssetCode: 'BD26-E' + String(++serial).padStart(4, '0'), AssetName: name, Category: category, ParentAssetCode: parent, Criticality: 'NORMAL', SourceSheet: sheet, SourceRow: row, OriginalEquipmentName: rawName };
  assets.push(a); byIdentity.set(key, a); return a;
}
for (const sheetName of book.SheetNames) {
  const machinery = sheetName.startsWith('May');
  const sheet = book.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', blankrows: true });
  // Fill only cells that are actually merged; do not propagate work codes to unrelated jobs.
  for (const merge of sheet['!merges'] || []) {
    if (merge.e.r <= merge.s.r || merge.s.c > 4) continue;
    const value = rows[merge.s.r]?.[merge.s.c];
    for (let r = merge.s.r + 1; r <= merge.e.r; r++) if (rows[r]) rows[r][merge.s.c] ||= value;
  }
  const root = asset(machinery ? 'Thiết bị máy' : 'Thân vỏ và thiết bị boong', '', 'SYSTEM', sheetName, 0, '');
  let group = root, section = '', lastAsset = null; const hierarchy = new Map();
  for (let i = 7; i < rows.length; i++) {
    const r = rows[i], rowNumber = i + 1;
    const code = clean(r[0]), rawName = clean(r[1]), rawDescription = clean(r[2]), rawFrequency = clean(r[3]);
    if (/CHIEF|CAPTAIN|Thuyền Trưởng|Đại Phó/.test(code + ' ' + rawName + ' ' + rawFrequency) || (machinery && rowNumber >= 476) || (!machinery && rowNumber >= 314)) break;
    if (!code && !rawName && !rawDescription && !rawFrequency) continue;
    sources.push({ SourceSheet: sheetName, SourceRow: rowNumber, WorkCode: code, EquipmentName: rawName, Description: rawDescription, Frequency: rawFrequency, LastTime: r[4], Plan: r[5], MonthlyMarks: JSON.stringify(r.slice(6, 18)) });
    if (machinery && /^change,? slewing$/i.test(rawName) && !code && !rawDescription && !rawFrequency && lastAsset) {
      lastAsset.AssetName += ' ' + text(rawName);
      lastAsset.OriginalEquipmentName += ' ' + rawName;
      continue;
    }
    const top = machinery ? !rawDescription && !rawFrequency && rawName : /^[IVX]+(?:\.|$)/i.test(code);
    if (top) {
      section = machinery ? (code || section) : code.split('.')[0]; hierarchy.clear();
      group = asset(text(rawName || code), root.AssetCode, 'SYSTEM', sheetName, rowNumber, rawName || code);
      lastAsset = null; continue;
    }
    let parent = group.AssetCode;
    if (!machinery && code.includes('.')) {
      const parts = code.split('.');
      while (parts.length > 1) { parts.pop(); const found = hierarchy.get(parts.join('.')); if (found) { parent = found.AssetCode; break; } }
    }
    const name = text(rawName);
    let equipment;
    if (!name && lastAsset) equipment = lastAsset;
    else if (name) equipment = asset(name, parent, rawDescription || rawFrequency ? 'UNCLASSIFIED' : 'SYSTEM', sheetName, rowNumber, rawName);
    else { audit.push({ SourceSheet: sheetName, SourceRow: rowNumber, Issue: 'Thiếu tên thiết bị; không tự gán công việc.' }); continue; }
    if (code && !machinery) hierarchy.set(code, equipment);
    lastAsset = equipment;
    if (!rawDescription && !rawFrequency) continue;
    const f = frequency(rawFrequency);
    if (!rawDescription) f.Review += (f.Review ? ' ' : '') + 'Thiếu mô tả công việc.';
    const workCode = code; // Original source code belongs to the work, never to the asset.
    if (!workCode) f.Review += (f.Review ? ' ' : '') + 'Nguồn để trống mã công việc; mã import dùng dòng nguồn.';
    const j = { ScheduleCode: 'BD26-' + (machinery ? 'M' : 'D') + '-R' + String(rowNumber).padStart(4, '0'), WorkCode: workCode, AssetCode: equipment.AssetCode, AssetName: equipment.AssetName, ScheduleName: text(rawDescription).slice(0, 200), Instructions: text(rawDescription), ...f, LastExecutedAt: iso(r[4]), LastExecutedRunningHours: '', OriginalFrequency: rawFrequency, OriginalLastTime: r[4], OriginalDescription: rawDescription, Plan: r[5], SourceSheet: sheetName, SourceSection: section, SourceRow: rowNumber, MonthlyMarks: JSON.stringify(r.slice(6, 18)) };
    jobs.push(j); if (j.Review) audit.push({ SourceSheet: sheetName, SourceRow: rowNumber, Issue: j.Review });
  }
}
function write(file, firstName, data, extra) {
  const b = XLSX.utils.book_new();
  const s = XLSX.utils.json_to_sheet(data); s['!autofilter'] = { ref: s['!ref'] }; s['!cols'] = Object.keys(data[0]).map(key => ({ wch: /Name|Instructions|Description|Review|Issue/.test(key) ? 55 : 24 }));
  XLSX.utils.book_append_sheet(b, s, firstName);
  for (const [n, rows] of extra) XLSX.utils.book_append_sheet(b, XLSX.utils.json_to_sheet(rows), n);
  XLSX.writeFile(b, path.join(output, file));
}
write('BIENDONG_STAR_2026_Thiet_bi.xlsx', 'Equipment', assets, [['Huong_dan', [{ Note: 'Code trong nguồn là mã công việc. AssetCode BD26-E... là mã thiết bị được tạo riêng; không lấy mã công việc làm mã thiết bị.' }, { Note: 'Các tiêu đề dùng SYSTEM; thiết bị dùng UNCLASSIFIED. Nguồn không cung cấp người phụ trách: cần gán sau khi import. Không tự đoán hãng/model/serial.' }, { Note: 'Chỉ import sheet Equipment. Các cột Source... và Original... phục vụ đối chiếu. Import vào tàu BIENDONG STAR; kiểm tra nhóm và tên trước khi nhập.' }]]]);
write('BIENDONG_STAR_2026_Cong_viec_bao_tri.xlsx', 'Maintenance', jobs, [['Can_ra_soat', audit], ['Nguon_goc', sources], ['Huong_dan', [{ Note: 'Import tại Danh sách công việc → Import Excel trên Edge. Nhập thiết bị trước và xử lý các dòng Review trước khi nạp file đầy đủ.' }, { Note: 'WorkCode giữ nguyên mã công việc nguồn. ScheduleCode BD26-M/D-R... là khóa import riêng theo sheet/dòng vì hệ thống yêu cầu mã toàn cục duy nhất.' }, { Note: 'AssetCode liên kết với file thiết bị. Chỉ có công việc cho thiết bị thật; tiêu đề không được gán lịch.' }, { Note: 'M/Y và tháng/năm được giữ bằng IntervalMonths/IntervalYears, không đổi tháng thành 30 ngày hoặc năm thành 365 ngày.' }, { Note: 'H khoảng giờ giữ HoursMinimum/Maximum và Review; không tự chọn một đầu khoảng. Last Time là ngày Excel; không suy ra giờ máy.' }, { Note: 'Dấu/giá trị tháng và Plan được giữ nguyên để đối chiếu, không tự coi là bằng chứng công việc hoàn thành. AutoGenerate=false để chưa sinh việc hàng loạt.' }, { Note: 'Một số mô tả nguồn tiếp nối giữa các dòng hoặc ghi Như trên. Giữ OriginalDescription và sheet nguồn; cần duyệt nội dung trước khi import.' }]]]);
const summary = { assets: assets.length, groups: assets.filter(a => a.Category === 'SYSTEM').length, equipment: assets.filter(a => a.Category !== 'SYSTEM').length, jobs: jobs.length, review: audit.length, categories: jobs.reduce((o, j) => (o[j.MaintenanceCategory] = (o[j.MaintenanceCategory] || 0) + 1, o), {}) };
fs.writeFileSync(path.join(output, 'extraction-summary.json'), JSON.stringify(summary, null, 2) + '\n');
// Validate cross-file references and source coverage before treating artifacts as ready for review.
const codes = new Set(assets.map(a => a.AssetCode));
if (codes.size !== assets.length || jobs.some(j => !codes.has(j.AssetCode))) throw new Error('Broken asset identity/reference');
if (jobs.some(j => assets.find(a => a.AssetCode === j.AssetCode).Category === 'SYSTEM')) throw new Error('Job assigned to heading');
console.log(JSON.stringify(summary, null, 2));
