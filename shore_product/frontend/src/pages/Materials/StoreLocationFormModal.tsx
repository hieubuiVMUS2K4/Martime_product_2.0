import { useState, useEffect, useId } from 'react';
import { Warehouse } from 'lucide-react';
import { Button, Modal, FormSection, FormAlert, Input, Select, Textarea } from '@/components/common';
import { storeLocationService } from '@/services/store-location.service';
import { useTranslationSafe } from '@/contexts/I18nContext';
import type { StoreLocation, CreateStoreLocationDto } from '@/types/pms.types';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  locations: StoreLocation[];
  editItem?: StoreLocation | null;
}

export function StoreLocationFormModal({ isOpen, onClose, onSuccess, locations, editItem }: Props) {
  const { t } = useTranslationSafe();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const formId = useId();

  const [form, setForm] = useState<CreateStoreLocationDto>({
    locationCode: '',
    name: '',
    description: '',
    parentId: null,
    address: '',
    managerName: '',
    phone: '',
    email: '',
  });

  useEffect(() => {
    if (isOpen) {
      setError('');
      if (editItem) {
        setForm({
          locationCode: editItem.locationCode,
          name: editItem.name,
          description: editItem.description ?? '',
          parentId: editItem.parentId ?? null,
          address: editItem.address ?? '',
          managerName: editItem.managerName ?? '',
          phone: editItem.phone ?? '',
          email: editItem.email ?? '',
        });
      } else {
        setForm({
          locationCode: '',
          name: '',
          description: '',
          parentId: null,
          address: '',
          managerName: '',
          phone: '',
          email: '',
        });
      }
    }
  }, [isOpen, editItem]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.locationCode.trim() || !form.name.trim()) {
      setError(t('storeLocations.form.required'));
      return;
    }
    try {
      setSaving(true);
      setError('');
      if (editItem) {
        await storeLocationService.update(editItem.id, form);
      } else {
        await storeLocationService.create(form);
      }
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Lưu thất bại. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const getExcludeIds = (id: string): Set<string> => {
    const ids = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const current = stack.pop()!;
      ids.add(current);
      locations.filter(l => l.parentId === current).forEach(c => stack.push(c.id));
    }
    return ids;
  };
  const excludeIds = editItem ? getExcludeIds(editItem.id) : new Set<string>();
  const parentOptions = locations.filter(l => !excludeIds.has(l.id));

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      busy={saving}
      closeOnBackdrop={false}
      icon={<Warehouse />}
      title={editItem ? t('storeLocations.form.editTitle') : t('storeLocations.form.addTitle')}
      footer={
        <>
          <Button onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
          <Button type="submit" form={formId} variant="primary" loading={saving}>
            {saving ? t('storeLocations.form.saving') : (editItem ? t('common.save') : t('storeLocations.form.create'))}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-4">
        <FormAlert>{error}</FormAlert>

        <FormSection title="Thông tin kho">
          <Input label="Mã kho" required value={form.locationCode} placeholder="KHO-01"
            onChange={e => setForm(f => ({ ...f, locationCode: e.target.value }))} />
          <Input label="Tên kho" required value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Select label="Kho cha" value={form.parentId ?? ''} placeholder="— Không (gốc) —"
            options={parentOptions.map(loc => ({ value: loc.id, label: `${loc.name} (${loc.locationCode})` }))}
            onChange={e => setForm(f => ({ ...f, parentId: e.target.value || null }))} />
          <Input label="Địa chỉ" value={form.address ?? ''}
            onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />
        </FormSection>

        <FormSection title="Mô tả" columns={1}>
          <Textarea rows={2} value={form.description ?? ''} placeholder="Mô tả tùy chọn..."
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        </FormSection>

        <FormSection title="Liên hệ quản lý" columns={3}>
          <Input label="Quản lý" value={form.managerName ?? ''}
            onChange={e => setForm(f => ({ ...f, managerName: e.target.value }))} />
          <Input label="Điện thoại" value={form.phone ?? ''}
            onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          <Input label="Email" type="email" value={form.email ?? ''}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        </FormSection>
      </form>
    </Modal>
  );
}
