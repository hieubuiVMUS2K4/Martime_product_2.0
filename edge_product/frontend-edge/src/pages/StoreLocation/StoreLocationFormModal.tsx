import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
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

const inp = 'w-full px-2 py-1.5 border border-gray-300 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white';
const lbl = 'text-sm text-gray-600 whitespace-nowrap text-right pr-3';

export function StoreLocationFormModal({ isOpen, onClose, onSuccess, locations, editItem }: Props) {
  const { t } = useTranslationSafe();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
      setError(err?.response?.data?.error || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />

        <div className="relative w-full max-w-2xl bg-white rounded-lg shadow-xl flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3 shrink-0">
            <h2 className="text-lg font-semibold text-gray-900">
              {editItem ? t('storeLocations.form.editTitle') : t('storeLocations.form.addTitle')}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
          </div>

          {/* Body */}
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
            {error && (
              <div className="mx-5 mt-3 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">{error}</div>
            )}

            <div className="p-5 space-y-5">
              {/* Basic Info */}
              <div>
                <div className="bg-slate-700 text-white text-sm font-semibold px-3 py-1.5 rounded-t">Thông tin kho</div>
                <div className="border border-t-0 border-gray-200 rounded-b p-4 space-y-2.5">
                  <div className="flex items-center">
                    <label className={lbl} style={{ width: 110 }}>Mã kho <span className="text-red-500">*</span></label>
                    <input type="text" required value={form.locationCode} onChange={e => setForm(f => ({ ...f, locationCode: e.target.value }))} className={inp} placeholder="KHO-01" />
                  </div>
                  <div className="flex items-center">
                    <label className={lbl} style={{ width: 110 }}>Tên kho <span className="text-red-500">*</span></label>
                    <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className={inp} />
                  </div>
                  <div className="flex items-center">
                    <label className={lbl} style={{ width: 110 }}>Kho cha</label>
                    <select value={form.parentId ?? ''} onChange={e => setForm(f => ({ ...f, parentId: e.target.value || null }))} className={inp}>
                      <option value="">— Không (gốc) —</option>
                      {parentOptions.map(loc => <option key={loc.id} value={loc.id}>{loc.name} ({loc.locationCode})</option>)}
                    </select>
                  </div>
                  <div className="flex items-center">
                    <label className={lbl} style={{ width: 110 }}>Địa chỉ</label>
                    <input type="text" value={form.address ?? ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className={inp} />
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <div className="bg-slate-700 text-white text-sm font-semibold px-3 py-1.5 rounded-t">Mô tả</div>
                <div className="border border-t-0 border-gray-200 rounded-b p-4">
                  <textarea rows={2} value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={`${inp} resize-y`} placeholder="Mô tả tùy chọn..." />
                </div>
              </div>

              {/* Contact */}
              <div>
                <div className="bg-slate-700 text-white text-sm font-semibold px-3 py-1.5 rounded-t">Liên hệ quản lý</div>
                <div className="border border-t-0 border-gray-200 rounded-b p-4 space-y-2.5">
                  <div className="flex items-center">
                    <label className={lbl} style={{ width: 110 }}>Quản lý</label>
                    <input type="text" value={form.managerName ?? ''} onChange={e => setForm(f => ({ ...f, managerName: e.target.value }))} className={inp} />
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center flex-1">
                      <label className={lbl} style={{ width: 110 }}>Điện thoại</label>
                      <input type="text" value={form.phone ?? ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inp} />
                    </div>
                    <div className="flex items-center flex-1">
                      <label className={lbl} style={{ width: 60 }}>Email</label>
                      <input type="email" value={form.email ?? ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inp} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-3 border-t border-gray-200 bg-gray-50 sticky bottom-0">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50">
                {t('common.cancel')}
              </button>
              <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50">
                {saving ? t('storeLocations.form.saving') : (editItem ? t('common.save') : t('storeLocations.form.create'))}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
