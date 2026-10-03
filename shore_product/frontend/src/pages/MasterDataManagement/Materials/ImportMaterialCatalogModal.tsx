import { useState } from 'react';
import { X, Upload, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { downloadMaterialCatalogTemplate } from './materialCatalogTemplate';
import { materialCatalogService, type CatalogImportRow } from '../../../services/materialService';

export function ImportMaterialCatalogModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [rows, setRows] = useState<CatalogImportRow[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const readFile = async (file?: File) => {
    setRows([]); setError('');
    if (!file) return;
    try {
      const book = XLSX.read(await file.arrayBuffer(), { type: 'array' });
      const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], { defval: '' });
      if (!data.length || data.length > 1000) throw new Error('File cần từ 1 đến 1000 dòng vật tư.');
      const parsed = data.map((r, index) => {
        const itemCode = String(r.ItemCode ?? '').trim();
        const name = String(r.Name ?? '').trim();
        const categoryCode = String(r.CategoryCode ?? '').trim();
        const unitPrice = r.UnitPrice === '' || r.UnitPrice == null ? null : Number(r.UnitPrice);
        if (!itemCode || !name || !categoryCode) throw new Error(`Dòng ${index + 2}: cần ItemCode, Name và CategoryCode.`);
        if (unitPrice != null && (!Number.isFinite(unitPrice) || unitPrice < 0)) throw new Error(`Dòng ${index + 2}: đơn giá không hợp lệ.`);
        return { itemCode, name, categoryCode, unitPrice };
      });
      if (new Set(parsed.map(r => r.itemCode.toLowerCase())).size !== parsed.length) throw new Error('File chứa mã vật tư trùng nhau.');
      setRows(parsed);
    } catch (e) { setError(e instanceof Error ? e.message : 'Không thể đọc file Excel.'); }
  };


  const submit = async () => {
    if (!rows.length || saving) return;
    setSaving(true); setError('');
    try { await materialCatalogService.import(rows); onSuccess(); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không thể import danh mục vật tư.'); }
    finally { setSaving(false); }
  };

  return <div className="modal-backdrop">
    <div className="cert-form-modal" style={{ maxWidth: 760 }} role="dialog" aria-modal="true" aria-labelledby="import-catalog-title">
      <div className="cfm-header"><span className="cfm-title" id="import-catalog-title">Import danh mục vật tư</span><button className="cfm-close" disabled={saving} onClick={onClose} aria-label="Đóng"><X size={18} /></button></div>
      <div className="p-5">
        <p className="mb-3 text-sm text-slate-600">Mã mới sẽ được thêm; mã đã có sẽ được cập nhật. CategoryCode phải là mã loại vật tư đã khai báo trên bờ. Danh mục được đồng bộ xuống tàu sau khi lưu.</p>
        <div className="mb-4 flex items-center gap-3"><button className="cl-btn" onClick={downloadMaterialCatalogTemplate}><Download size={14} /> Tải mẫu import</button><input type="file" accept=".xlsx,.xls" disabled={saving} onChange={e => readFile(e.target.files?.[0])} /></div>
        {error && <p role="alert" className="mb-3 whitespace-pre-wrap rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {!!rows.length && <div className="max-h-80 overflow-auto"><table className="cl-table"><thead><tr><th>Mã vật tư</th><th>Tên vật tư</th><th>Mã loại</th><th>Đơn giá</th></tr></thead><tbody>{rows.map(row => <tr key={row.itemCode}><td>{row.itemCode}</td><td>{row.name}</td><td>{row.categoryCode}</td><td>{row.unitPrice ?? '—'}</td></tr>)}</tbody></table></div>}
        <div className="mt-4 flex justify-end gap-2"><button className="cl-btn" disabled={saving} onClick={onClose}>Hủy</button><button className="cl-btn cl-btn--primary" disabled={!rows.length || saving} onClick={submit}><Upload size={14} />{saving ? 'Đang import...' : `Import ${rows.length} vật tư`}</button></div>
      </div>
    </div>
  </div>;
}
