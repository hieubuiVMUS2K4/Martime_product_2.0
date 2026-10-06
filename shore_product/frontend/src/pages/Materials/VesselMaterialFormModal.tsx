import { useState } from 'react';
import { X } from 'lucide-react';
import type { VesselMaterialInput } from '@/services/vesselMaterialService';

export function VesselMaterialFormModal({ item, onClose, onSubmit }: {
  item?: VesselMaterialInput | null; onClose: () => void; onSubmit: (row: VesselMaterialInput) => Promise<void>;
}) {
  const [form, setForm] = useState<VesselMaterialInput>(item ? { ...item } : { itemCode: '', name: '', unit: 'PCS', unitCost: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
    <form role="dialog" aria-modal="true" aria-labelledby="vessel-material-form-title" onSubmit={async e => {
      e.preventDefault(); setSaving(true); setError('');
      try { await onSubmit(form); onClose(); } catch (e) { setError(e instanceof Error ? e.message : 'Không thể lưu vật tư.'); }
      finally { setSaving(false); }
    }} className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
      <div className="flex items-center justify-between border-b px-5 py-4"><h2 id="vessel-material-form-title" className="font-semibold">{item ? 'Chỉnh sửa vật tư' : 'Thêm vật tư'}</h2><button type="button" disabled={saving} aria-label="Đóng" onClick={onClose}><X size={20} /></button></div>
      <div className="grid grid-cols-2 gap-4 overflow-auto p-5">
        {([['itemCode', 'Mã vật tư', 50], ['name', 'Tên vật tư', 200], ['unit', 'Đơn vị tính', 20], ['partNumber', 'Mã phụ tùng', 100], ['manufacturer', 'Hãng sản xuất', 100], ['supplier', 'Nhà cung cấp', 200]] as const).map(([key, label, maxLength]) => <label key={key} className="text-xs text-gray-600">{label}{['itemCode', 'name', 'unit'].includes(key) && ' *'}<input required={['itemCode', 'name', 'unit'].includes(key)} maxLength={maxLength} value={form[key] ?? ''} onChange={e => setForm(previous => ({ ...previous, [key]: e.target.value }))} className="mt-1 h-9 w-full rounded border border-gray-300 px-3 text-sm outline-none focus:border-accent" /></label>)}
        <label className="text-xs text-gray-600">Đơn giá<input type="number" min="0" step="0.0001" value={form.unitCost ?? ''} onChange={e => setForm(previous => ({ ...previous, unitCost: e.target.value ? Number(e.target.value) : null }))} className="mt-1 h-9 w-full rounded border border-gray-300 px-3 text-sm" /></label>
        {(['specification', 'notes'] as const).map(key => <label key={key} className="col-span-2 text-xs text-gray-600">{key === 'notes' ? 'Ghi chú' : 'Thông số kỹ thuật'}<textarea rows={2} value={form[key] ?? ''} onChange={e => setForm(previous => ({ ...previous, [key]: e.target.value }))} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" /></label>)}
        {error && <p role="alert" className="col-span-2 text-sm text-red-600">{error}</p>}
      </div>
      <div className="flex justify-end gap-2 border-t bg-slate-50 px-5 py-3"><button type="button" disabled={saving} onClick={onClose} className="rounded border px-3 py-2 text-sm">Hủy</button><button disabled={saving} className="rounded bg-[#0b2545] px-4 py-2 text-sm text-white">{saving ? 'Đang lưu...' : 'Lưu'}</button></div>
    </form>
  </div>;
}
