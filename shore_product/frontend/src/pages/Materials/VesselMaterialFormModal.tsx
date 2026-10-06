import { useId, useState } from 'react';
import { Package } from 'lucide-react';
import type { VesselMaterialInput } from '@/services/vesselMaterialService';
import { Button, Modal, FormAlert, Input, Textarea } from '@/components/common';

const TEXT_FIELDS = [
  ['itemCode', 'Mã vật tư', 50, true],
  ['name', 'Tên vật tư', 200, true],
  ['unit', 'Đơn vị tính', 20, true],
  ['partNumber', 'Mã phụ tùng', 100, false],
  ['manufacturer', 'Hãng sản xuất', 100, false],
  ['supplier', 'Nhà cung cấp', 200, false],
] as const;

export function VesselMaterialFormModal({ item, onClose, onSubmit }: {
  item?: VesselMaterialInput | null; onClose: () => void; onSubmit: (row: VesselMaterialInput) => Promise<void>;
}) {
  const formId = useId();
  const [form, setForm] = useState<VesselMaterialInput>(item ? { ...item } : { itemCode: '', name: '', unit: 'PCS', unitCost: null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setError('');
    try { await onSubmit(form); onClose(); } catch (e) { setError(e instanceof Error ? e.message : 'Không thể lưu vật tư.'); }
    finally { setSaving(false); }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      busy={saving}
      closeOnBackdrop={false}
      size="lg"
      icon={<Package />}
      title={item ? 'Chỉnh sửa vật tư' : 'Thêm vật tư'}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>Hủy</Button>
          <Button type="submit" form={formId} variant="primary" loading={saving}>{saving ? 'Đang lưu...' : 'Lưu'}</Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
        {error && <div className="sm:col-span-2"><FormAlert>{error}</FormAlert></div>}
        {TEXT_FIELDS.map(([key, label, maxLength, required]) => (
          <Input key={key} label={label} required={required} maxLength={maxLength} value={form[key] ?? ''}
            onChange={e => setForm(previous => ({ ...previous, [key]: e.target.value }))} />
        ))}
        <Input label="Đơn giá" type="number" min="0" step="0.0001" value={form.unitCost ?? ''}
          onChange={e => setForm(previous => ({ ...previous, unitCost: e.target.value ? Number(e.target.value) : null }))} />
        <div className="sm:col-span-2">
          <Textarea label="Thông số kỹ thuật" rows={2} value={form.specification ?? ''}
            onChange={e => setForm(previous => ({ ...previous, specification: e.target.value }))} />
        </div>
        <div className="sm:col-span-2">
          <Textarea label="Ghi chú" rows={2} value={form.notes ?? ''}
            onChange={e => setForm(previous => ({ ...previous, notes: e.target.value }))} />
        </div>
      </form>
    </Modal>
  );
}
