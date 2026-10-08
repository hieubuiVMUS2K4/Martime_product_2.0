import { useState } from 'react';
import { Download, FileSpreadsheet } from 'lucide-react';
import { vesselMaterialService, parseVesselMaterialFile, downloadVesselMaterialTemplate, type VesselMaterialInput } from '@/services/vesselMaterialService';
import { Button, Modal, FormAlert, fieldClass } from '@/components/common';

export function VesselMaterialImportModal({ vesselId, onClose, onSuccess }: { vesselId: string; onClose: () => void; onSuccess: () => void }) {
  const [rows, setRows] = useState<VesselMaterialInput[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleFile = async (file?: File) => {
    setRows([]); setError('');
    if (!file) return;
    try { setRows(await parseVesselMaterialFile(file)); } catch (e) { setError(e instanceof Error ? e.message : 'Không thể đọc file.'); }
  };

  const handleImport = async () => {
    setSaving(true); setError('');
    try { await vesselMaterialService.import(vesselId, rows); onSuccess(); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Import thất bại.'); }
    finally { setSaving(false); }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      busy={saving}
      size="lg"
      icon={<FileSpreadsheet />}
      title="Import vật tư vào tàu đang chọn"
      subtitle="Mã đã tồn tại sẽ bị từ chối, không tự ghi đè. Sau khi lưu, bấm Đồng bộ để gửi xuống tàu."
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>Hủy</Button>
          <Button variant="primary" loading={saving} disabled={!rows.length} onClick={handleImport}>
            {saving ? 'Đang import...' : `Import ${rows.length} vật tư`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <Button icon={<Download className="h-4 w-4" />} onClick={downloadVesselMaterialTemplate}>Tải mẫu</Button>
          <input type="file" accept=".xlsx,.xls" disabled={saving} className={`${fieldClass} py-1.5`}
            onChange={e => handleFile(e.target.files?.[0])} />
        </div>
        <FormAlert>{error}</FormAlert>
        {!!rows.length && (
          <div className="overflow-auto rounded-md border border-line">
            <table className="w-full text-sm">
              <thead className="bg-primary-soft text-left text-xs text-primary">
                <tr>
                  <th className="px-3 py-2 font-semibold">Mã vật tư</th>
                  <th className="px-3 py-2 font-semibold">Tên vật tư</th>
                  <th className="px-3 py-2 font-semibold">Đơn vị</th>
                  <th className="px-3 py-2 font-semibold">Mã phụ tùng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map(row => (
                  <tr key={row.itemCode}>
                    <td className="px-3 py-2 font-mono">{row.itemCode}</td>
                    <td className="px-3 py-2">{row.name}</td>
                    <td className="px-3 py-2">{row.unit}</td>
                    <td className="px-3 py-2">{row.partNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
