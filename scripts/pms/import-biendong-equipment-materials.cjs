// Manual import into the BIENDONG STAR Edge database. Default: prepare only.
// Run with --apply to back up the database, import atomically, and verify.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const XLSX = require('../../edge_product/frontend-edge/node_modules/xlsx');
const root = path.resolve(__dirname, '../..');
const sourceDir = path.join(root, 'docs/imports/biendong-star-2026');
const outputDir = path.join(sourceDir, 'database-import');
const container = 'maritime-edge-postgres';
const dbArgs = ['-U', 'edge_user', '-d', 'maritime_edge'];
const apply = process.argv.includes('--apply');

function sql(text) {
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1', ...dbArgs],
    { input: text, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  return result.stdout.trim();
}
function rows(table) {
  return JSON.parse(sql(`SELECT COALESCE(json_agg(t),'[]'::json) FROM ${table} t;`));
}
function quote(value) { return "'" + String(value).replace(/'/g, "''") + "'"; }
function id(key) {
  const bytes = crypto.createHash('sha256').update('biendong-star-2026:' + key).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const h = bytes.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
function read(file, sheet) {
  const book = XLSX.readFile(path.join(sourceDir, file));
  if (!book.Sheets[sheet]) throw new Error(`Missing sheet ${sheet}`);
  return XLSX.utils.sheet_to_json(book.Sheets[sheet], { defval: '' });
}
function assert(condition, message) { if (!condition) throw new Error(message); }

const ships = rows('ship_data');
assert(ships.length === 1 && ships[0].imo_number === '9228289' && ships[0].ship_name.toUpperCase() === 'BIENDONG STAR',
  'Target database must belong to BIENDONG STAR, IMO 9228289');
const origin = ships[0].origin_node;
const before = Object.fromEntries(['equipment_assets', 'material_items', 'material_item_ship', 'material_item_equipments']
  .map(table => [table, rows(table)]));
const categories = new Map(rows('material_categories').filter(c => c.is_active).map(c => [c.category_code, c.id]));
const sourceAssets = read('BIENDONG_STAR_2026_Thiet_bi.xlsx', 'Equipment');
const jobs = read('BIENDONG_STAR_2026_Cong_viec_bao_tri.xlsx', 'Maintenance');
const sourceCodes = new Set(sourceAssets.map(a => a.AssetCode));
assert(sourceAssets.length === 753 && sourceCodes.size === 753, 'Unexpected or duplicate equipment source rows');
assert(sourceAssets.filter(a => a.Category === 'SYSTEM').length === 91, 'Unexpected group count');
assert(jobs.length === 680 && jobs.every(j => sourceCodes.has(j.AssetCode)), 'Invalid maintenance source references');
const existingAssets = new Map(before.equipment_assets.map(a => [a.asset_code, a]));
const assets = sourceAssets.map(a => ({
  id: existingAssets.get(a.AssetCode)?.id || id('asset:' + a.AssetCode),
  asset_code: a.AssetCode, name: a.AssetName, category: a.Category,
  parent_code: a.ParentAssetCode || null, criticality: a.Criticality,
  notes: `Nguồn KHBQBD BIENDONG STAR 2026; ${a.SourceSheet}, dòng ${a.SourceRow}. `
    + (a.Category === 'SYSTEM' ? 'Tiêu đề/nhóm trong cây thiết bị; chưa gán người phụ trách.' : 'Thiết bị/hạng mục bảo trì theo nguồn; chưa xác minh hãng, model, serial.'),
  technical_specs: JSON.stringify({ sourceFile: 'Copy of KHBQBD 2026  Biendong star - .xls',
    sourceSheet: a.SourceSheet, sourceRow: a.SourceRow, originalEquipmentName: a.OriginalEquipmentName }),
}));
const byCode = new Map(assets.map(a => [a.asset_code, a]));
for (const a of assets) {
  assert(a.name && a.name.length <= 200, 'Invalid asset name ' + a.asset_code);
  assert(!a.parent_code || byCode.has(a.parent_code), 'Missing parent ' + a.asset_code);
  const visited = new Set([a.asset_code]);
  let parent = a.parent_code;
  while (parent) {
    assert(!visited.has(parent), 'Cycle in equipment tree');
    visited.add(parent); parent = byCode.get(parent).parent_code;
  }
  const existing = existingAssets.get(a.asset_code);
  if (existing) assert(existing.name === a.name && existing.category === a.category
    && existing.parent_id === (a.parent_code ? byCode.get(a.parent_code).id : null),
    'Existing equipment differs from source: ' + a.asset_code);
}

// Only explicit material mentions are extracted. Generic descriptions retain
// unknown specifications; a lubrication task alone does not identify an oil.
const rules = [
  { code: 'BD26-MAT-GREASE', name: 'Mỡ bôi trơn (chưa xác định quy cách)', category: 'LUBE-GREASE', unit: 'KG', test: j => /\bgrease\b|mỡ/iu.test(j.Instructions) },
  { code: 'BD26-MAT-PAINT', name: 'Sơn bảo quản (chưa xác định loại, màu)', category: 'PAINT-COAT', unit: 'LTR', test: j => /sơn|\bpaint\b/iu.test(j.Instructions) },
  { code: 'BD26-MAT-CHEMICAL', name: 'Hóa chất vệ sinh (chưa xác định loại)', category: 'CLEANING', unit: 'LTR', test: j => /\bchemical\b/i.test(j.Instructions) },
  { code: 'BD26-MAT-SILICAGEL', name: 'Hạt hút ẩm silicagel', category: 'CLEANING', unit: 'KG', test: j => /\bsilicagel\b/i.test(j.Instructions) },
  { code: 'BD26-MAT-SEAL', name: 'Phớt làm kín (chưa xác định quy cách)', category: 'ENGINE-GASKETS', unit: 'PCS', test: j => /\brenew\b.*\bseal\b/i.test(j.Instructions) },
  { code: 'BD26-MAT-BEARING', name: 'Vòng bi thay thế (chưa xác định quy cách)', category: 'ENGINE-BEARINGS', unit: 'PCS', test: j => /\brenew\b.*\bbearing\b/i.test(j.Instructions) },
  { code: 'BD26-MAT-BATTERY', name: 'Ắc quy thay thế (chưa xác định điện áp, dung lượng)', category: 'ELEC-BATTERIES', unit: 'PCS', test: j => /\bbattery\b/i.test(j.AssetName) && /thay thế/i.test(j.Instructions) },
  { code: 'BD26-MAT-LO', name: 'Dầu bôi trơn thay thế (chưa xác định cấp dầu)', category: 'LUBE-ENGINE-OIL', unit: 'LTR', test: j => /\bLO\b/i.test(j.AssetName) && /^renew$/i.test(j.Instructions.trim()) },
  { code: 'BD26-MAT-FILTER', name: 'Lọc thay thế (chưa xác định quy cách)', category: 'ENGINE-FILTERS', unit: 'PCS', test: j => /\bfilter\b/i.test(j.AssetName) && /^renew$/i.test(j.Instructions.trim()) },
  { code: 'BD26-MAT-CEMENT', name: 'Xi măng lớp bảo vệ (chưa xác định quy cách)', category: 'DECK-SUPPLIES', unit: 'KG', test: j => /xi\s*măng/iu.test(j.Instructions) },
];
const materials = [], links = [], evidence = [];
for (const rule of rules) {
  const matches = jobs.filter(rule.test);
  assert(matches.length > 0, 'Rule has no source evidence: ' + rule.code);
  assert(categories.has(rule.category), 'Missing category ' + rule.category);
  const existing = before.material_items.find(m => m.item_code === rule.code);
  const material = { id: existing?.id || id('catalog:' + rule.code), ship_id: id('ship:' + rule.code),
    item_code: rule.code, name: rule.name, category_id: categories.get(rule.category), unit: rule.unit,
    specification: 'Mục vật tư tổng quát từ kế hoạch bảo trì; cần xác minh quy cách/part number trước khi mua hoặc sử dụng.',
    notes: 'Nguồn KHBQBD BIENDONG STAR 2026. Không có số lượng tồn, định mức, giá hoặc quy cách trong Excel. '
      + 'Tồn khởi tạo 0; đơn vị gợi ý cần xác nhận. Liên kết chỉ ghi nhận vật tư được nhắc trong nguồn, định mức 0 = chưa xác định.' };
  if (existing) assert(existing.name === material.name && existing.category_id === material.category_id,
    'Existing catalog item differs: ' + rule.code);
  materials.push(material);
  for (const assetCode of new Set(matches.map(j => j.AssetCode))) {
    const ref = matches.filter(j => j.AssetCode === assetCode).map(j => ({
      sheet: j.SourceSheet, row: j.SourceRow, description: j.Instructions,
    }));
    const notes = `Nguồn ${ref.map(r => `${r.sheet}:${r.row}`).join(', ')}; vật tư được nhắc trong kế hoạch. Quy cách và định mức chưa xác định (0).`;
    assert(notes.length <= 500, 'Link notes too long');
    links.push({ id: id('link:' + rule.code + ':' + assetCode), material_item_id: material.id,
      equipment_asset_id: byCode.get(assetCode).id, notes });
    evidence.push({ materialCode: rule.code, assetCode, references: ref });
  }
}

const stage = (table, definitions, data) => `CREATE TEMP TABLE ${table} AS SELECT * FROM jsonb_to_recordset(${quote(JSON.stringify(data))}::jsonb) AS x(${definitions});`;
const script = [
  'BEGIN;',
  'LOCK TABLE equipment_assets, material_items, material_item_ship, material_item_equipments IN SHARE ROW EXCLUSIVE MODE;',
  `DO $$ BEGIN IF (SELECT count(*) FROM ship_data WHERE imo_number='9228289' AND upper(ship_name)='BIENDONG STAR') <> 1
    THEN RAISE EXCEPTION 'Wrong target vessel'; END IF; END $$;`,
  stage('bd_assets', 'id uuid, asset_code text, name text, category text, parent_code text, criticality text, notes text, technical_specs text', assets),
  stage('bd_materials', 'id uuid, ship_id uuid, item_code text, name text, category_id bigint, unit text, specification text, notes text', materials),
  stage('bd_links', 'id uuid, material_item_id uuid, equipment_asset_id uuid, notes text', links),
  // Insert the entire tree in one statement so every parent is available to FK checks.
  `INSERT INTO equipment_assets (id,asset_code,name,category,parent_id,criticality,status,technical_specs,notes,is_active,is_synced,created_at,updated_at,origin_node)
   SELECT a.id,a.asset_code,a.name,a.category,p.id,a.criticality,'ACTIVE',a.technical_specs,a.notes,true,false,NOW(),NOW(),${quote(origin)}
   FROM bd_assets a LEFT JOIN bd_assets p ON p.asset_code=a.parent_code ON CONFLICT (asset_code) DO NOTHING;`,
  `INSERT INTO material_items (id,item_code,name,category_id,unit_price,is_active,created_at,updated_at)
   SELECT id,item_code,name,category_id,NULL,true,NOW(),NOW() FROM bd_materials ON CONFLICT (item_code) DO NOTHING;`,
  `INSERT INTO material_item_ship (id,item_code,name,material_item_code,category_id,specification,unit,on_hand_quantity,
    batch_tracked,serial_tracked,expiry_required,notes,is_active,is_synced,created_at,updated_at,origin_node)
   SELECT ship_id,item_code,name,item_code,category_id,specification,unit,0,false,false,false,notes,true,false,NOW(),NOW(),${quote(origin)}
   FROM bd_materials ON CONFLICT (item_code) DO NOTHING;`,
  `INSERT INTO material_item_equipments (id,material_item_id,equipment_asset_id,notes,quantity_required,created_at)
   SELECT id,material_item_id,equipment_asset_id,notes,0,NOW() FROM bd_links
   ON CONFLICT (material_item_id,equipment_asset_id) DO NOTHING;`,
  `DO $$ BEGIN
   IF EXISTS (SELECT 1 FROM bd_assets s LEFT JOIN equipment_assets a ON a.asset_code=s.asset_code
     LEFT JOIN bd_assets p ON p.asset_code=s.parent_code
     WHERE a.id IS DISTINCT FROM s.id OR a.name IS DISTINCT FROM s.name OR a.category IS DISTINCT FROM s.category
       OR a.parent_id IS DISTINCT FROM p.id OR NOT a.is_active) THEN RAISE EXCEPTION 'Asset verification failed'; END IF;
   IF EXISTS (SELECT 1 FROM bd_materials s LEFT JOIN material_items c ON c.item_code=s.item_code
     LEFT JOIN material_item_ship m ON m.item_code=s.item_code
     WHERE c.id IS DISTINCT FROM s.id OR c.name IS DISTINCT FROM s.name OR c.category_id IS DISTINCT FROM s.category_id
       OR m.name IS DISTINCT FROM s.name OR m.material_item_code IS DISTINCT FROM s.item_code
       OR m.category_id IS DISTINCT FROM s.category_id OR NOT c.is_active OR NOT m.is_active)
     THEN RAISE EXCEPTION 'Material verification failed'; END IF;
   IF EXISTS (SELECT 1 FROM bd_links s LEFT JOIN material_item_equipments l
     ON l.material_item_id=s.material_item_id AND l.equipment_asset_id=s.equipment_asset_id WHERE l.id IS NULL)
     THEN RAISE EXCEPTION 'Link verification failed'; END IF;
   END $$;`,
  'COMMIT;',
].join('\n');

fs.mkdirSync(outputDir, { recursive: true });
fs.writeFileSync(path.join(outputDir, 'import-edge.sql'), script + '\n');
const report = { vessel: 'BIENDONG STAR', imo: '9228289', origin,
  assets: assets.length, equipment: assets.filter(a => a.category !== 'SYSTEM').length,
  groups: assets.filter(a => a.category === 'SYSTEM').length, newAssets: assets.filter(a => !existingAssets.has(a.asset_code)).length,
  catalogMaterials: materials.length, equipmentMaterialLinks: links.length,
  materials: materials.map(m => ({ code: m.item_code, name: m.name, unit: m.unit,
    equipmentLinks: links.filter(l => l.material_item_id === m.id).length })),
  sourceHashes: Object.fromEntries(['BIENDONG_STAR_2026_Thiet_bi.xlsx', 'BIENDONG_STAR_2026_Cong_viec_bao_tri.xlsx']
    .map(f => [f, crypto.createHash('sha256').update(fs.readFileSync(path.join(sourceDir, f))).digest('hex')])),
  limitations: ['Vật tư tổng quát được nhắc trong mô tả, không phải BOM đã xác minh.',
    'Không có quy cách, part number, giá, số lượng tồn, định mức trong nguồn. Tồn và định mức khởi tạo 0; đơn vị gợi ý.',
    '91 nhóm nguồn là các nút SYSTEM trong cây thiết bị; chưa gán PIC.',
    'Chưa nhập lịch công việc hoặc lịch sử bảo trì.'],
  evidence,
};
fs.writeFileSync(path.join(outputDir, 'import-manifest.json'), JSON.stringify(report, null, 2) + '\n');
if (apply) {
  const backupDir = path.join(root, 'artifacts/database-backups');
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dump = spawnSync('docker', ['exec', container, 'pg_dump', ...dbArgs, '-Fc'], { maxBuffer: 128 * 1024 * 1024 });
  if (dump.error || dump.status !== 0) throw new Error(dump.error?.message || dump.stderr.toString('utf8'));
  assert(dump.stdout.subarray(0, 5).toString() === 'PGDMP', 'Invalid database backup');
  const backupPath = path.join(backupDir, `biendong-before-equipment-materials-${stamp}.dump`);
  fs.writeFileSync(backupPath, dump.stdout);
  sql(script);
  const after = Object.fromEntries(Object.keys(before).map(t => [t, rows(t)]));
  for (const table of Object.keys(before)) {
    const byId = new Map(after[table].map(r => [r.id, r]));
    for (const old of before[table]) assert(JSON.stringify(byId.get(old.id)) === JSON.stringify(old),
      `Existing record changed: ${table}/${old.id}`);
  }
  report.applied = true; report.backupPath = path.relative(root, backupPath);
  report.inserted = Object.fromEntries(Object.keys(before).map(t => [t, after[t].length - before[t].length]));
  report.verifiedExistingUnchanged = true;
  fs.writeFileSync(path.join(outputDir, 'applied-result.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ applied: apply, assets: report.assets, newAssets: report.newAssets,
  equipment: report.equipment, groups: report.groups, materials: report.catalogMaterials,
  equipmentMaterialLinks: report.equipmentMaterialLinks, inserted: report.inserted,
  verifiedExistingUnchanged: report.verifiedExistingUnchanged }, null, 2));
