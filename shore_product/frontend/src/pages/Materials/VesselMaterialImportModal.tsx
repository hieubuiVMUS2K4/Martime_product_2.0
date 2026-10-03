import { useState } from 'react';
import { X, Download } from 'lucide-react';
import { vesselMaterialService, parseVesselMaterialFile, downloadVesselMaterialTemplate, type VesselMaterialInput } from '@/services/vesselMaterialService';

export function VesselMaterialImportModal({ vesselId, onClose, onSuccess }: { vesselId: string; onClose: () => void; onSuccess: () => void }) {
  const [rows, setRows] = useState<VesselMaterialInput[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <div role="dialog" aria-modal="true" aria-labelledby="vessel-import-title" className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg bg-white shadow-xl">
      <div className="flex justify-between border-b p-4"><h2 id="vessel-import-title" className="font-semibold">Import vật tư vào tàu đang chọn</h2><button disabled={saving} aria-label="Đóng" onClick={onClose}><X size={20} /></button></div>
      <div className="overflow-auto p-4">
        <p className="mb-3 text-sm text-gray-600">Import vật tư mới. Mã đã tồn tại sẽ bị từ chối, không tự ghi đè. Sau khi lưu, bấm Đồng bộ để gửi xuống tàu.</p>
        <div className="mb-4 flex items-center gap-3"><button title="Tải mẫu import" aria-label="Tải mẫu import" className="rounded border p-2" onClick={downloadVesselMaterialTemplate}><Download size={16} /></button><input type="file" accept=".xlsx,.xls" disabled={saving} onChange={async e => { const file = e.target.files?.[0]; setRows([]); setError(''); if (!file) return; try { setRows(await parseVesselMaterialFile(file)); } catch (e) { setError(e instanceof Error ? e.message : 'Không thể đọc file.'); } }} /></div>
        {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
        {!!rows.length && <table className="w-full text-sm"><thead><tr><th>Mã vật tư</th><th>Tên vật tư</th><th>Đơn vị</th><th>Mã phụ tùng</th></tr></thead><tbody>{rows.map(row => <tr key={row.itemCode}><td className="p-2">{row.itemCode}</td><td className="p-2">{row.name}</td><td className="p-2">{row.unit}</td><td className="p-2">{row.partNumber}</td></tr>)}</tbody></table>}
      </div>
      <div className="flex justify-end gap-2 border-t p-4"><button disabled={saving} onClick={onClose} className="rounded border px-3 py-2 text-sm">Hủy</button><button disabled={saving || !rows.length} className="rounded bg-[#0b2545] px-3 py-2 text-sm text-white disabled:opacity-40" onClick={async () => { setSaving(true); setError(''); try { await vesselMaterialService.import(vesselId, rows); onSuccess(); onClose(); } catch (e) { setError(e instanceof Error ? e.message : 'Import thất bại.'); } finally { setSaving(false); } }}>{saving ? 'Đang import...' : `Import ${rows.length} vật tư`}</button></div>
    </div>
  </div>;
}
