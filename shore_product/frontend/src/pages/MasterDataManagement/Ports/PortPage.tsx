import React, { useState, useEffect, useCallback, useId } from 'react';
import { Anchor, Pencil, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { portApi } from '../../../services/crew.service';
import type { Port, PortPayload } from '../../../services/crew.service';
import {
  Button, DataTable, FormAlert, ImportExcelModal, Input, Modal, PageHeader, TableActions, TableIconButton,
  useConfirm, type Column, type ImportField,
} from '../../../components/common';

const EMPTY: PortPayload = {
  portCode: '', portName: '', country: '', countryCode: '',
  latitude: undefined, longitude: undefined, timeZone: '', isActive: true,
};

/** Máy chủ trả tối đa 500 cảng mỗi lần; danh mục chỉ vài trăm cảng nên tải hết về để lọc theo cột. */
const FETCH_PAGE = 500;

const IMPORT_FIELDS: ImportField[] = [
  { key: 'portCode', header: 'Mã UN/LOCODE', required: true, example: 'VNSGN' },
  { key: 'portName', header: 'Tên cảng', required: true, example: 'Ho Chi Minh City (Saigon)' },
  { key: 'country', header: 'Quốc gia', example: 'Vietnam' },
  { key: 'countryCode', header: 'Mã quốc gia', example: 'VN' },
  { key: 'latitude', header: 'Vĩ độ', example: '10.7626' },
  { key: 'longitude', header: 'Kinh độ', example: '106.7432' },
  { key: 'timeZone', header: 'Múi giờ', example: 'Asia/Ho_Chi_Minh' },
];

const toNumber = (v: string) => (v.trim() === '' ? undefined : Number(v.replace(',', '.')));
const errorText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

/**
 * Danh mục cảng — bờ làm chủ, phát xuống mọi tàu.
 *
 * Thêm/sửa ở đây sẽ tự đồng bộ tới tất cả các tàu, giống cách làm với chức danh,
 * quốc gia và loại chứng chỉ. Ngừng sử dụng là đặt cờ, KHÔNG xoá cứng — các chuyến đi
 * và mục sổ thuyền viên cũ còn tham chiếu tới cảng.
 */
export const PortPage: React.FC = () => {
  const ask = useConfirm();
  const formId = useId();
  const [ports, setPorts] = useState<Port[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editing, setEditing] = useState<Port | null>(null);
  const [form, setForm] = useState<PortPayload>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Chỉ lấy cảng đang dùng. Cảng đã ngừng vẫn nằm trong CSDL để dữ liệu cũ
      // (chuyến đi, sổ thuyền viên) còn tham chiếu được, chỉ không hiện ở danh mục.
      const all: Port[] = [];
      for (let page = 1; ; page++) {
        const res = await portApi.search({ isActive: true, page, pageSize: FETCH_PAGE });
        all.push(...res.data);
        if (all.length >= res.pagination.totalCount || res.data.length === 0) break;
      }
      setPorts(all);
    } catch (err) {
      setError(errorText(err, 'Không tải được danh mục cảng'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setFormError(null); setModalOpen(true); };
  const openEdit = (p: Port) => {
    setEditing(p);
    setForm({
      portCode: p.portCode, portName: p.portName,
      country: p.country ?? '', countryCode: p.countryCode ?? '',
      latitude: p.latitude ?? undefined, longitude: p.longitude ?? undefined,
      timeZone: p.timeZone ?? '', isActive: p.isActive,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setFormError(null);
    try {
      if (editing) await portApi.update(editing.id, form);
      else await portApi.create(form);
      toast.success(editing ? 'Đã cập nhật cảng' : 'Đã thêm cảng', { description: `${form.portCode} — ${form.portName}` });
      setModalOpen(false);
      await load();
    } catch (err) {
      setFormError(errorText(err, 'Lưu thất bại'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (p: Port) => {
    if (!await ask(`Ngừng sử dụng cảng "${p.portName}"?\nCảng vẫn được giữ lại trong dữ liệu cũ.`, { title: 'Ngừng sử dụng cảng', confirmLabel: 'Ngừng sử dụng', variant: 'warning' })) return;
    try {
      await portApi.deactivate(p.id);
      toast.success('Đã ngừng sử dụng cảng', { description: `${p.portCode} — ${p.portName}` });
      await load();
    } catch (err) {
      toast.error('Không thể ngừng sử dụng cảng', { description: errorText(err, 'Thao tác thất bại') });
    }
  };

  const columns: Column<Port>[] = [
    {
      key: 'code', header: 'Mã UN/LOCODE', width: 120, value: p => p.portCode,
      render: p => <span className="font-mono font-semibold text-primary">{p.portCode}</span>,
    },
    { key: 'name', header: 'Tên cảng', value: p => p.portName },
    { key: 'country', header: 'Quốc gia', width: 170, value: p => p.country ?? '' },
    { key: 'countryCode', header: 'Mã QG', width: 80, align: 'center', value: p => p.countryCode ?? '', className: 'font-mono' },
    { key: 'lat', header: 'Vĩ độ', width: 100, numeric: true, filter: false, value: p => p.latitude ?? null,
      render: p => (p.latitude != null ? p.latitude.toFixed(4) : '—') },
    { key: 'lon', header: 'Kinh độ', width: 100, numeric: true, filter: false, value: p => p.longitude ?? null,
      render: p => (p.longitude != null ? p.longitude.toFixed(4) : '—') },
    { key: 'tz', header: 'Múi giờ', width: 170, value: p => p.timeZone ?? '' },
    {
      key: 'actions', header: 'Thao tác', width: 100, align: 'center',
      render: p => (
        <TableActions>
          <TableIconButton label={`Sửa cảng ${p.portName}`} icon={<Pencil />} onClick={() => openEdit(p)} />
          <TableIconButton label={`Ngừng sử dụng cảng ${p.portName}`} icon={<Ban />} variant="danger" onClick={() => handleDeactivate(p)} />
        </TableActions>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        icon={<Anchor />}
        title="Danh mục cảng"
        description="Bờ làm chủ danh mục cảng: thêm/sửa ở đây sẽ tự phát xuống tất cả các tàu. Ngừng sử dụng không xóa dữ liệu cũ."
      />

      <DataTable
        columns={columns}
        data={ports}
        rowKey={p => p.id}
        loading={loading}
        error={error}
        itemLabel="cảng"
        emptyMessage="Chưa có cảng nào."
        searchPlaceholder="Tìm theo mã, tên cảng, quốc gia..."
        exportOptions={{ fileName: 'danh-muc-cang', title: 'DANH MỤC CẢNG' }}
        onImport={() => setShowImport(true)}
        onAdd={openCreate}
        addLabel="Thêm cảng"
        onRowClick={openEdit}
        minWidth={980}
      />

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        busy={saving}
        closeOnBackdrop={false}
        icon={<Anchor />}
        title={editing ? `Sửa cảng ${editing.portCode}` : 'Thêm cảng mới'}
        subtitle="Cảng lưu tại đây sẽ tự động được phát xuống tất cả các tàu."
        footer={<>
          <Button onClick={() => setModalOpen(false)} disabled={saving}>Hủy</Button>
          <Button type="submit" form={formId} variant="primary" loading={saving}>{editing ? 'Lưu thay đổi' : 'Thêm cảng'}</Button>
        </>}
      >
        <form id={formId} onSubmit={handleSave} className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-3">
          {formError && <div className="sm:col-span-3"><FormAlert>{formError}</FormAlert></div>}
          <Input label="Mã UN/LOCODE" required maxLength={5} value={form.portCode} placeholder="VNSGN" className="font-mono uppercase"
            onChange={e => setForm({ ...form, portCode: e.target.value.toUpperCase() })} />
          <div className="sm:col-span-2">
            <Input label="Tên cảng" required value={form.portName} placeholder="Ho Chi Minh City (Saigon)"
              onChange={e => setForm({ ...form, portName: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Input label="Quốc gia" value={form.country ?? ''} placeholder="Vietnam"
              onChange={e => setForm({ ...form, country: e.target.value })} />
          </div>
          <Input label="Mã quốc gia" maxLength={2} value={form.countryCode ?? ''} placeholder="VN" className="font-mono uppercase"
            onChange={e => setForm({ ...form, countryCode: e.target.value.toUpperCase() })} />
          <Input label="Vĩ độ" type="number" step="0.0001" value={form.latitude ?? ''}
            onChange={e => setForm({ ...form, latitude: e.target.value === '' ? undefined : Number(e.target.value) })} />
          <Input label="Kinh độ" type="number" step="0.0001" value={form.longitude ?? ''}
            onChange={e => setForm({ ...form, longitude: e.target.value === '' ? undefined : Number(e.target.value) })} />
          <Input label="Múi giờ" value={form.timeZone ?? ''} placeholder="Asia/Ho_Chi_Minh"
            onChange={e => setForm({ ...form, timeZone: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-ink sm:col-span-3">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={form.isActive}
              onChange={e => setForm({ ...form, isActive: e.target.checked })} />
            Đang sử dụng
          </label>
        </form>
      </Modal>

      <ImportExcelModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        title="Import danh mục cảng"
        note="Mã cảng đã có sẽ báo lỗi ở dòng đó, các dòng khác vẫn được thêm. Cảng import sẽ phát xuống tất cả các tàu."
        templateName="mau-import-cang"
        fields={IMPORT_FIELDS}
        importRow={row => portApi.create({
          portCode: row.portCode.toUpperCase(), portName: row.portName,
          country: row.country, countryCode: row.countryCode.toUpperCase(),
          latitude: toNumber(row.latitude), longitude: toNumber(row.longitude),
          timeZone: row.timeZone, isActive: true,
        })}
        onDone={load}
      />
    </div>
  );
};
