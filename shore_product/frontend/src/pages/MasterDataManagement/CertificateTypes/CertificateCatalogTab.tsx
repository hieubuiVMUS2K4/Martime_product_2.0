import React, { useState, useEffect, useCallback } from 'react';
import { Pencil, Trash2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { certificateApi } from '../../../services/crew.service';
import {
  DataTable, ImportExcelModal, PageHeader, TableActions, TableIconButton, useConfirm,
  type Column, type ImportField,
} from '../../../components/common';
import { CertificateFormModal } from './CertificateFormModal';
import type { CertificateType } from '../../../types/crew.types';

const CATEGORY_LABELS: Record<string, string> = {
  DOCUMENT: 'Giấy tờ',
  COMPETENCY: 'Năng lực', MEDICAL: 'Y tế', PROFICIENCY: 'Thành thạo', SAFETY: 'An toàn',
};
const CATEGORY_TONE: Record<string, string> = {
  DOCUMENT: 'bg-indigo-100 text-indigo-800',
  COMPETENCY: 'bg-accent-soft text-accent',
  MEDICAL: 'bg-emerald-100 text-emerald-800',
  PROFICIENCY: 'bg-amber-100 text-amber-800',
  SAFETY: 'bg-red-100 text-red-800',
};
/** Nhận cả mã (SAFETY) lẫn nhãn (An toàn) khi import. */
const categoryCode = (text: string) => {
  const t = text.trim().toUpperCase();
  if (!t) return undefined;
  return Object.keys(CATEGORY_LABELS).find(k => k === t || CATEGORY_LABELS[k].toUpperCase() === t) ?? t;
};
const isYes = (text: string) =>
  ['co', 'có', 'x', 'yes', 'y', '1', 'true', 'bắt buộc', 'bat buoc'].includes(text.trim().toLowerCase());

const IMPORT_FIELDS: ImportField[] = [
  { key: 'certificateCode', header: 'Mã chứng chỉ', required: true, example: 'STCW-BST' },
  { key: 'certificateName', header: 'Tên chứng chỉ', required: true, example: 'Huấn luyện an toàn cơ bản' },
  { key: 'category', header: 'Phân loại', example: 'An toàn' },
  { key: 'issuingAuthority', header: 'Cấp bởi', example: 'Cục Hàng hải Việt Nam' },
  { key: 'validityPeriodMonths', header: 'Thời hạn (tháng)', example: '60' },
  { key: 'isMandatory', header: 'Bắt buộc', example: 'Có' },
  { key: 'description', header: 'Mô tả' },
];

type CertificatePayload = {
  certificateCode: string;
  certificateName: string;
  category?: string;
  validityPeriodMonths?: number;
  description?: string;
  issuingAuthority?: string;
  isMandatory: boolean;
  countryIds: number[];
  rankIds: number[];
};

export const CertificateCatalogTab: React.FC = () => {
  const ask = useConfirm();

  const [certs, setCerts] = useState<CertificateType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [editingCert, setEditingCert] = useState<CertificateType | null>(null);

  const fetchCerts = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try { setCerts(await certificateApi.getTypes()); }
    catch (err) { setLoadError(err instanceof Error ? err.message : 'Không thể tải danh sách chứng chỉ'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCerts(); }, [fetchCerts]);

  const openCreate = () => { setEditingCert(null); setShowForm(true); };
  const openEdit = (c: CertificateType) => { setEditingCert(c); setShowForm(true); };

  const handleDelete = async (c: CertificateType) => {
    if (!(await ask(`Xóa loại chứng chỉ "${c.certificateName}"?`))) return;
    try {
      await certificateApi.deleteType(c.id);
      toast.success('Đã xóa loại chứng chỉ', { description: `${c.certificateCode} — ${c.certificateName}` });
      fetchCerts();
    } catch (err) {
      toast.error('Không thể xóa loại chứng chỉ', { description: err instanceof Error ? err.message : undefined });
    }
  };

  const handleSubmit = async (payload: CertificatePayload) => {
    if (!payload.certificateCode.trim() || !payload.certificateName.trim()) {
      toast.warning('Vui lòng nhập mã và tên chứng chỉ');
      return;
    }
    setSaving(true);
    try {
      if (editingCert) await certificateApi.updateType(editingCert.id, payload);
      else await certificateApi.createType(payload);
      toast.success(editingCert ? 'Đã cập nhật loại chứng chỉ' : 'Đã thêm loại chứng chỉ', {
        description: `${payload.certificateCode} — ${payload.certificateName}`,
      });
      setShowForm(false);
      fetchCerts();
    } catch (err) {
      toast.error('Không thể lưu loại chứng chỉ', { description: err instanceof Error ? err.message : undefined });
    } finally {
      setSaving(false);
    }
  };

  const columns: Column<CertificateType>[] = [
    {
      key: 'code', header: 'Mã chứng chỉ', width: 150, value: c => c.certificateCode,
      render: c => <span className="font-mono font-semibold text-primary">{c.certificateCode}</span>,
    },
    { key: 'name', header: 'Tên chứng chỉ', value: c => c.certificateName },
    { key: 'authority', header: 'Cấp bởi', width: 190, value: c => c.issuingAuthority ?? '' },
    {
      key: 'category', header: 'Phân loại', width: 120, align: 'center',
      value: c => (c.category ? CATEGORY_LABELS[c.category] ?? c.category : ''),
      render: c => c.category
        ? <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${CATEGORY_TONE[c.category] ?? 'bg-primary-soft text-primary'}`}>{CATEGORY_LABELS[c.category] ?? c.category}</span>
        : <span className="text-ink-light">—</span>,
    },
    {
      key: 'validity', header: 'Thời hạn (tháng)', width: 110, numeric: true, value: c => c.validityPeriodMonths ?? null,
      render: c => c.validityPeriodMonths ?? <span className="text-ink-light">—</span>,
    },
    {
      key: 'mandatory', header: 'Bắt buộc', width: 100, align: 'center', value: c => (c.isMandatory ? 'Bắt buộc' : 'Tùy chọn'),
      render: c => c.isMandatory
        ? <span className="font-semibold text-red-700">Bắt buộc</span>
        : <span className="text-ink-muted">Tùy chọn</span>,
    },
    {
      key: 'status', header: 'Trạng thái', width: 110, align: 'center', value: c => (c.isActive ? 'Hoạt động' : 'Ngưng'),
      render: c => (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${c.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${c.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          {c.isActive ? 'Hoạt động' : 'Ngưng'}
        </span>
      ),
    },
    {
      key: 'actions', header: 'Thao tác', width: 100, align: 'center',
      render: c => (
        <TableActions>
          <TableIconButton label={`Sửa ${c.certificateName}`} icon={<Pencil />} onClick={() => openEdit(c)} />
          <TableIconButton label={`Xóa ${c.certificateName}`} icon={<Trash2 />} variant="danger" onClick={() => handleDelete(c)} />
        </TableActions>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        icon={<ShieldCheck />}
        title="Danh mục loại chứng chỉ"
        description="Bờ làm chủ danh mục, phát xuống mọi tàu. Gán chứng chỉ bắt buộc theo chức danh ở tab bên cạnh."
      />

      <DataTable
        columns={columns}
        data={certs}
        rowKey={c => c.id}
        loading={loading}
        error={loadError}
        itemLabel="loại chứng chỉ"
        emptyMessage="Chưa có loại chứng chỉ nào."
        searchPlaceholder="Tìm theo mã, tên, nơi cấp..."
        exportOptions={{ fileName: 'danh-muc-loai-chung-chi', title: 'DANH MỤC LOẠI CHỨNG CHỈ' }}
        onImport={() => setShowImport(true)}
        onAdd={openCreate}
        addLabel="Thêm loại chứng chỉ"
        onRowClick={openEdit}
        minWidth={1060}
      />

      {showForm && (
        <CertificateFormModal
          cert={editingCert}
          onClose={() => setShowForm(false)}
          onSubmit={handleSubmit}
          saving={saving}
        />
      )}

      <ImportExcelModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        title="Import danh mục loại chứng chỉ"
        note="Phân loại nhận Giấy tờ/Năng lực/Y tế/Thành thạo/An toàn; Bắt buộc ghi Có hoặc để trống. Gán quốc gia, chức danh sau bằng nút Sửa."
        templateName="mau-import-loai-chung-chi"
        fields={IMPORT_FIELDS}
        importRow={row => certificateApi.createType({
          certificateCode: row.certificateCode,
          certificateName: row.certificateName,
          category: categoryCode(row.category),
          validityPeriodMonths: row.validityPeriodMonths ? Number(row.validityPeriodMonths) : undefined,
          issuingAuthority: row.issuingAuthority || undefined,
          description: row.description || undefined,
          isMandatory: isYes(row.isMandatory),
          countryIds: [],
          rankIds: [],
        })}
        onDone={fetchCerts}
      />
    </div>
  );
};
