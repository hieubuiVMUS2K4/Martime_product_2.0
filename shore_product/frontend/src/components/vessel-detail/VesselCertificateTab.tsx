import { useState, useEffect, useCallback } from 'react';
import { ENV } from '../../config/env';
import { DataTable, type Column } from '@/components/common';
import { formatDateVi } from '@/utils/date';

const BASE = ENV.API_BASE_URL;

interface VesselCertificateTabProps {
  vesselId: string;
  vesselName: string;
}

interface CrewCert {
  id: number;
  crewMemberId: string;
  crewMemberName: string;
  certificateCode: string;
  certificateName: string;
  category: string | null;
  certificateNumber: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  issuingAuthority: string | null;
  countryName: string | null;
  documentFilePath: string | null;
  isSynced: boolean;
  status: string;
  daysUntilExpiry: number | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  DOCUMENT: 'Giấy tờ',
  COMPETENCY: 'Năng lực',
  MEDICAL: 'Y tế',
  PROFICIENCY: 'Thành thạo',
  SAFETY: 'An toàn',
};

const CATEGORY_TONE: Record<string, string> = {
  DOCUMENT: 'bg-indigo-100 text-indigo-800',
  COMPETENCY: 'bg-accent-soft text-accent',
  MEDICAL: 'bg-emerald-100 text-emerald-800',
  PROFICIENCY: 'bg-amber-100 text-amber-800',
  SAFETY: 'bg-red-100 text-red-800',
};

const STATUS: Record<string, { label: string; tone: string }> = {
  EXPIRED: { label: 'Hết hạn', tone: 'bg-red-50 text-red-700' },
  EXPIRING_SOON: { label: 'Sắp hết hạn', tone: 'bg-amber-50 text-amber-700' },
  VALID: { label: 'Còn hiệu lực', tone: 'bg-emerald-50 text-emerald-700' },
};
const statusOf = (s: string) => STATUS[s] ?? STATUS.VALID;

/**
 * Chứng chỉ của thuyền viên đang ở trên tàu.
 *
 * Không còn phần "gán loại chứng chỉ cho tàu": danh mục loại chứng chỉ do BỜ làm chủ
 * và phát xuống MỌI tàu (giống danh mục vật tư), nên không có khái niệm tàu nào được
 * gán loại nào nữa. Loại chứng chỉ nào bắt buộc với ai được suy ra từ chức danh
 * (rank_certificates) và cờ IsMandatory, đúng như logic tính tuân thủ vẫn dùng.
 */
export function VesselCertificateTab({ vesselId, vesselName }: VesselCertificateTabProps) {
  const [crewCerts, setCrewCerts] = useState<CrewCert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCrewCerts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BASE}/vessels/${vesselId}/certificates/crew`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCrewCerts(await res.json());
    } catch (err) {
      setError(err instanceof Error ? `Không tải được chứng chỉ thuyền viên (${err.message})` : 'Không tải được chứng chỉ thuyền viên');
    } finally {
      setLoading(false);
    }
  }, [vesselId]);

  useEffect(() => { fetchCrewCerts(); }, [fetchCrewCerts]);

  const columns: Column<CrewCert>[] = [
    { key: 'crew', header: 'Thuyền viên', width: 190, value: c => c.crewMemberName, className: 'font-medium' },
    { key: 'code', header: 'Mã CC', width: 130, value: c => c.certificateCode, className: 'font-mono font-semibold' },
    { key: 'name', header: 'Tên chứng chỉ', value: c => c.certificateName },
    {
      key: 'category', header: 'Loại', width: 110, align: 'center', value: c => CATEGORY_LABELS[c.category ?? ''] ?? c.category ?? '',
      render: c => c.category
        ? <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${CATEGORY_TONE[c.category] ?? 'bg-slate-100 text-slate-600'}`}>{CATEGORY_LABELS[c.category] ?? c.category}</span>
        : <span className="text-ink-light">—</span>,
    },
    { key: 'number', header: 'Số CC', width: 150, value: c => c.certificateNumber ?? '', className: 'text-ink-muted' },
    {
      key: 'expiry', header: 'Ngày hết hạn', width: 120, align: 'center', value: c => c.expiryDate ?? '',
      filter: c => formatDateVi(c.expiryDate), exportValue: c => formatDateVi(c.expiryDate),
      render: c => formatDateVi(c.expiryDate) || '—',
    },
    {
      key: 'days', header: 'Còn lại (ngày)', width: 110, numeric: true, filter: false, value: c => c.daysUntilExpiry,
      render: c => c.daysUntilExpiry === null ? '—' : (
        <span className={`font-semibold ${c.daysUntilExpiry <= 0 ? 'text-red-700' : c.daysUntilExpiry <= 30 ? 'text-amber-700' : 'text-emerald-700'}`}>
          {c.daysUntilExpiry <= 0 ? 'Quá hạn' : c.daysUntilExpiry}
        </span>
      ),
    },
    {
      key: 'status', header: 'Trạng thái', width: 125, align: 'center', value: c => statusOf(c.status).label,
      render: c => <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${statusOf(c.status).tone}`}>{statusOf(c.status).label}</span>,
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={crewCerts}
      rowKey={c => c.id}
      loading={loading}
      error={error}
      itemLabel="chứng chỉ"
      emptyMessage="Chưa có dữ liệu chứng chỉ — hãy đồng bộ từ tàu."
      searchPlaceholder="Tìm thuyền viên, mã hoặc tên chứng chỉ..."
      exportOptions={{ fileName: `chung-chi-thuyen-vien-${vesselName}`, title: `CHỨNG CHỈ THUYỀN VIÊN TÀU ${vesselName.toUpperCase()}` }}
      minWidth={1100}
    />
  );
}
