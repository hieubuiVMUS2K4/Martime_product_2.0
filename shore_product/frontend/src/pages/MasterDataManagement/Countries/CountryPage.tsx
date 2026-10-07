import React, { useState, useEffect, useCallback, useId } from 'react';
import { Pencil, Trash2, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { countryApi, type CountryPayload } from '../../../services/crew.service';
import {
  Button, DataTable, FormAlert, ImportExcelModal, Input, Modal, PageHeader, TableActions, TableIconButton,
  useConfirm, type Column, type ImportField,
} from '../../../components/common';
import type { Country } from '../../../types/crew.types';

const emptyForm: CountryPayload = { countryCode: '', countryName: '', flagImageUrl: '' };

const IMPORT_FIELDS: ImportField[] = [
  { key: 'countryCode', header: 'Mã quốc gia', required: true, example: 'VN' },
  { key: 'countryName', header: 'Tên quốc gia', required: true, example: 'Việt Nam' },
  { key: 'flagImageUrl', header: 'URL ảnh cờ', example: 'https://flagcdn.com/vn.svg' },
];

const errorText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

export const CountryPage: React.FC = () => {
  const ask = useConfirm();
  const formId = useId();

  const [countries, setCountries] = useState<Country[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<Country | null>(null);
  const [form, setForm] = useState<CountryPayload>(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchCountries = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try { setCountries(await countryApi.getAll()); }
    catch (err) { setLoadError(errorText(err, 'Không thể tải danh sách quốc gia')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCountries(); }, [fetchCountries]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setFormError(''); setShowForm(true); };
  const openEdit = (c: Country) => {
    setEditing(c);
    setForm({ countryCode: c.countryCode, countryName: c.countryName, flagImageUrl: c.flagImageUrl || '' });
    setFormError('');
    setShowForm(true);
  };

  const handleDelete = async (c: Country) => {
    if (!(await ask(`Xóa quốc gia "${c.countryName}"?`))) return;
    try {
      await countryApi.remove(c.id);
      toast.success('Đã xóa quốc gia', { description: `${c.countryCode} — ${c.countryName}` });
      fetchCountries();
    } catch (err) {
      toast.error('Không thể xóa quốc gia', { description: errorText(err, 'Lỗi không xác định') });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.countryCode.trim() || !form.countryName.trim()) { setFormError('Vui lòng nhập mã và tên quốc gia.'); return; }
    setSaving(true);
    try {
      if (editing) await countryApi.update(editing.id, form);
      else await countryApi.create(form);
      toast.success(editing ? 'Đã cập nhật quốc gia' : 'Đã thêm quốc gia', { description: `${form.countryCode} — ${form.countryName}` });
      setShowForm(false);
      fetchCountries();
    } catch (err) {
      setFormError(errorText(err, 'Không thể lưu'));
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<Country>[] = [
    {
      key: 'code', header: 'Mã quốc gia', width: 140, value: c => c.countryCode,
      render: c => <span className="font-mono font-semibold text-primary">{c.countryCode}</span>,
    },
    { key: 'name', header: 'Tên quốc gia', value: c => c.countryName },
    {
      key: 'flag', header: 'Cờ', width: 90, align: 'center', exportValue: c => c.flagImageUrl ?? '',
      render: c => c.flagImageUrl
        ? <img src={c.flagImageUrl} alt={c.countryCode} className="inline-block h-4 w-6 rounded-sm object-cover align-middle" />
        : <span className="text-ink-light">—</span>,
    },
    {
      key: 'actions', header: 'Thao tác', width: 100, align: 'center',
      render: c => (
        <TableActions>
          <TableIconButton label={`Sửa ${c.countryName}`} icon={<Pencil />} onClick={() => openEdit(c)} />
          <TableIconButton label={`Xóa ${c.countryName}`} icon={<Trash2 />} variant="danger" onClick={() => handleDelete(c)} />
        </TableActions>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        icon={<Globe />}
        title="Danh mục quốc gia"
        description="Quốc tịch thuyền viên và quốc gia của cảng. Thêm/sửa ở đây sẽ đồng bộ xuống tất cả các tàu."
      />

      <DataTable
        columns={columns}
        data={countries}
        rowKey={c => c.id}
        loading={loading}
        error={loadError}
        itemLabel="quốc gia"
        emptyMessage="Chưa có quốc gia nào."
        searchPlaceholder="Tìm theo mã hoặc tên quốc gia..."
        exportOptions={{ fileName: 'danh-muc-quoc-gia', title: 'DANH MỤC QUỐC GIA' }}
        onImport={() => setShowImport(true)}
        onAdd={openCreate}
        addLabel="Thêm quốc gia"
        onRowClick={openEdit}
        minWidth={600}
      />

      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        busy={saving}
        closeOnBackdrop={false}
        size="sm"
        icon={<Globe />}
        title={editing ? 'Chỉnh sửa quốc gia' : 'Thêm quốc gia'}
        footer={<>
          <Button onClick={() => setShowForm(false)} disabled={saving}>Hủy</Button>
          <Button type="submit" form={formId} variant="primary" loading={saving}>{editing ? 'Cập nhật' : 'Thêm mới'}</Button>
        </>}
      >
        <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-3">
          <FormAlert>{formError}</FormAlert>
          <Input label="Mã quốc gia" required value={form.countryCode} placeholder="VD: VN" className="font-mono uppercase"
            onChange={e => setForm(f => ({ ...f, countryCode: e.target.value.toUpperCase() }))} />
          <Input label="Tên quốc gia" required value={form.countryName} placeholder="VD: Việt Nam"
            onChange={e => setForm(f => ({ ...f, countryName: e.target.value }))} />
          <Input label="URL ảnh cờ" value={form.flagImageUrl ?? ''} placeholder="https://..."
            onChange={e => setForm(f => ({ ...f, flagImageUrl: e.target.value }))} />
        </form>
      </Modal>

      <ImportExcelModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        title="Import danh mục quốc gia"
        note="Mã quốc gia đã có sẽ báo lỗi ở dòng đó, các dòng khác vẫn được thêm."
        templateName="mau-import-quoc-gia"
        fields={IMPORT_FIELDS}
        importRow={row => countryApi.create({ countryCode: row.countryCode.toUpperCase(), countryName: row.countryName, flagImageUrl: row.flagImageUrl })}
        onDone={fetchCountries}
      />
    </div>
  );
};
