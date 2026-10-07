import React, { useState, useEffect, useCallback, useId } from 'react';
import { Pencil, Trash2, Award } from 'lucide-react';
import { toast } from 'sonner';
import { rankApi, type RankPayload } from '../../../services/crew.service';
import {
  Button, DataTable, FormAlert, ImportExcelModal, Input, Modal, PageHeader, Select, TableActions, TableIconButton,
  useConfirm, type Column, type ImportField,
} from '../../../components/common';
import type { Rank } from '../../../types/crew.types';

/** Mã bộ phận lưu trong CSDL giữ nguyên tiếng Anh (đồng bộ với tàu), chỉ đổi nhãn hiển thị. */
const DEPARTMENTS: { value: string; label: string }[] = [
  { value: 'DECK', label: 'Boong' },
  { value: 'ENGINE', label: 'Máy' },
  { value: 'CATERING', label: 'Phục vụ' },
  { value: 'OTHER', label: 'Khác' },
];
const deptLabel = (code?: string | null) => DEPARTMENTS.find(d => d.value === code)?.label ?? code ?? '';
/** Nhận cả mã (DECK) lẫn nhãn (Boong) khi import. */
const deptCode = (text: string) => {
  const t = text.trim().toUpperCase();
  return DEPARTMENTS.find(d => d.value === t || d.label.toUpperCase() === t)?.value ?? 'OTHER';
};

const emptyForm: RankPayload = { rankCode: '', rankName: '', department: 'DECK', level: '', sortOrder: 0 };

const IMPORT_FIELDS: ImportField[] = [
  { key: 'rankCode', header: 'Mã chức danh', required: true, example: 'CAPT' },
  { key: 'rankName', header: 'Tên chức danh', required: true, example: 'Thuyền trưởng' },
  { key: 'department', header: 'Bộ phận', example: 'Boong' },
  { key: 'level', header: 'Cấp bậc', example: 'Sĩ quan quản lý' },
  { key: 'sortOrder', header: 'Thứ tự', example: '1' },
];

const errorText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

export const RankPage: React.FC = () => {
  const ask = useConfirm();
  const formId = useId();

  const [ranks, setRanks] = useState<Rank[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<Rank | null>(null);
  const [form, setForm] = useState<RankPayload>(emptyForm);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchRanks = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try { setRanks(await rankApi.getAll()); }
    catch (err) { setLoadError(errorText(err, 'Không thể tải danh sách chức danh')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRanks(); }, [fetchRanks]);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setFormError(''); setShowForm(true); };
  const openEdit = (r: Rank) => {
    setEditing(r);
    setForm({ rankCode: r.rankCode, rankName: r.rankName, department: r.department || 'DECK', level: r.level || '', sortOrder: r.sortOrder ?? 0 });
    setFormError('');
    setShowForm(true);
  };

  const handleDelete = async (r: Rank) => {
    if (!(await ask(`Xóa chức danh "${r.rankName}"?`))) return;
    try {
      await rankApi.remove(r.id);
      toast.success('Đã xóa chức danh', { description: `${r.rankCode} — ${r.rankName}` });
      fetchRanks();
    } catch (err) {
      toast.error('Không thể xóa chức danh', { description: errorText(err, 'Lỗi không xác định') });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.rankCode.trim() || !form.rankName.trim()) { setFormError('Vui lòng nhập mã và tên chức danh.'); return; }
    setSaving(true);
    try {
      if (editing) await rankApi.update(editing.id, form);
      else await rankApi.create(form);
      toast.success(editing ? 'Đã cập nhật chức danh' : 'Đã thêm chức danh', { description: `${form.rankCode} — ${form.rankName}` });
      setShowForm(false);
      fetchRanks();
    } catch (err) {
      setFormError(errorText(err, 'Không thể lưu'));
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<Rank>[] = [
    {
      key: 'code', header: 'Mã chức danh', width: 150, value: r => r.rankCode,
      render: r => <span className="font-mono font-semibold text-primary">{r.rankCode}</span>,
    },
    { key: 'name', header: 'Tên chức danh', value: r => r.rankName },
    { key: 'dept', header: 'Bộ phận', width: 130, value: r => deptLabel(r.department) },
    { key: 'level', header: 'Cấp bậc', width: 200, value: r => r.level ?? '' },
    { key: 'order', header: 'Thứ tự', width: 90, numeric: true, value: r => r.sortOrder ?? 0 },
    {
      key: 'actions', header: 'Thao tác', width: 100, align: 'center',
      render: r => (
        <TableActions>
          <TableIconButton label={`Sửa ${r.rankName}`} icon={<Pencil />} onClick={() => openEdit(r)} />
          <TableIconButton label={`Xóa ${r.rankName}`} icon={<Trash2 />} variant="danger" onClick={() => handleDelete(r)} />
        </TableActions>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        icon={<Award />}
        title="Danh mục chức danh"
        description="Chức danh thuyền viên theo bộ phận. Thêm/sửa ở đây sẽ đồng bộ xuống tất cả các tàu."
      />

      <DataTable
        columns={columns}
        data={ranks}
        rowKey={r => r.id}
        loading={loading}
        error={loadError}
        itemLabel="chức danh"
        emptyMessage="Chưa có chức danh nào."
        searchPlaceholder="Tìm theo mã, tên chức danh..."
        exportOptions={{ fileName: 'danh-muc-chuc-danh', title: 'DANH MỤC CHỨC DANH' }}
        onImport={() => setShowImport(true)}
        onAdd={openCreate}
        addLabel="Thêm chức danh"
        onRowClick={openEdit}
        minWidth={760}
      />

      <Modal
        isOpen={showForm}
        onClose={() => setShowForm(false)}
        busy={saving}
        closeOnBackdrop={false}
        icon={<Award />}
        title={editing ? 'Chỉnh sửa chức danh' : 'Thêm chức danh'}
        footer={<>
          <Button onClick={() => setShowForm(false)} disabled={saving}>Hủy</Button>
          <Button type="submit" form={formId} variant="primary" loading={saving}>{editing ? 'Cập nhật' : 'Thêm mới'}</Button>
        </>}
      >
        <form id={formId} onSubmit={handleSubmit} className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2">
          {formError && <div className="sm:col-span-2"><FormAlert>{formError}</FormAlert></div>}
          <Input label="Mã chức danh" required value={form.rankCode} placeholder="VD: CAPT" className="font-mono uppercase"
            onChange={e => setForm(f => ({ ...f, rankCode: e.target.value.toUpperCase() }))} />
          <Input label="Tên chức danh" required value={form.rankName} placeholder="VD: Thuyền trưởng"
            onChange={e => setForm(f => ({ ...f, rankName: e.target.value }))} />
          <Select label="Bộ phận" value={form.department} options={DEPARTMENTS}
            onChange={e => setForm(f => ({ ...f, department: e.target.value }))} />
          <Input label="Cấp bậc" value={form.level || ''}
            onChange={e => setForm(f => ({ ...f, level: e.target.value }))} />
          <Input label="Thứ tự hiển thị" type="number" value={form.sortOrder}
            onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))} />
        </form>
      </Modal>

      <ImportExcelModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        title="Import danh mục chức danh"
        note="Cột Bộ phận nhận Boong/Máy/Phục vụ/Khác (hoặc DECK/ENGINE/CATERING/OTHER). Mã đã có sẽ báo lỗi ở dòng đó."
        templateName="mau-import-chuc-danh"
        fields={IMPORT_FIELDS}
        importRow={row => rankApi.create({
          rankCode: row.rankCode.toUpperCase(), rankName: row.rankName,
          department: deptCode(row.department || 'OTHER'), level: row.level,
          sortOrder: Number(row.sortOrder) || 0,
        })}
        onDone={fetchRanks}
      />
    </div>
  );
};
