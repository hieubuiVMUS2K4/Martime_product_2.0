import { PermissionGate } from '@/components/auth/PermissionGate'
/**
 * Maritime Reports List Page
 * Operational overview for daily reporting workflows
 */

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AlertCircle,
  Anchor,
  Eye,
  FileText,
  Fuel,
  MapPin,
  Plus,
  Send,
  Ship,
  Trash2,
  Waves,
  X,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { ReportingService } from '../../services/reporting.service';
import type { ReportStatus, ReportSummaryDto } from '../../types/reporting.types';
import { DataTable, TableActions, type Column } from '@/components/common/DataTable';
import './ReportingTheme.css';

const STATUS_STYLES: Record<ReportStatus, { badge: string; dot: string; label: string }> = {
  DRAFT: {
    badge: 'bg-slate-100 text-slate-700',
    dot: 'bg-slate-400',
    label: 'Bản nháp',
  },
  SUBMITTED: {
    badge: 'bg-yellow-100 text-yellow-700',
    dot: 'bg-amber-500',
    label: 'Chờ duyệt',
  },
  APPROVED: {
    badge: 'bg-blue-100 text-blue-700',
    dot: 'bg-blue-500',
    label: 'Đã duyệt',
  },
  REJECTED: {
    badge: 'bg-red-100 text-red-700',
    dot: 'bg-rose-500',
    label: 'Bị từ chối',
  },
  TRANSMITTED: {
    badge: 'bg-green-100 text-green-700',
    dot: 'bg-emerald-500',
    label: 'Đã gửi bờ',
  },
};

const REPORT_TYPE_STYLES: Record<string, { label: string; icon: ReactNode; dot: string }> = {
  NOON: { label: 'Báo cáo trưa', icon: <Ship className="h-3.5 w-3.5" />, dot: 'bg-sky-500' },
  DEPARTURE: { label: 'Rời cảng', icon: <Anchor className="h-3.5 w-3.5" />, dot: 'bg-indigo-500' },
  ARRIVAL: { label: 'Đến cảng', icon: <Waves className="h-3.5 w-3.5" />, dot: 'bg-emerald-500' },
  BUNKER: { label: 'Nhiên liệu', icon: <Fuel className="h-3.5 w-3.5" />, dot: 'bg-amber-500' },
  POSITION: { label: 'Vị trí', icon: <MapPin className="h-3.5 w-3.5" />, dot: 'bg-violet-500' },
};

function getReportTypeStyle(reportTypeCode: string) {
  return REPORT_TYPE_STYLES[reportTypeCode] ?? {
    label: reportTypeCode,
    icon: <FileText className="h-3.5 w-3.5" />,
    dot: 'bg-slate-400',
  };
}

function formatDateTime(dateTime: string) {
  return new Date(dateTime).toLocaleString('vi-VN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const statusStyleOf = (status: ReportStatus) =>
  STATUS_STYLES[status]
  ?? STATUS_STYLES[status?.toUpperCase() as ReportStatus]
  ?? { badge: 'bg-slate-100 text-slate-700', dot: 'bg-slate-400', label: status };

/** Máy chủ trả tối đa 100 dòng/lần — tải lần lượt cho đủ để bảng tự tìm, lọc, phân trang. */
async function fetchAllReports() {
  const pageSize = 100;
  const all: ReportSummaryDto[] = [];
  for (let page = 1; ; page += 1) {
    const res = await ReportingService.getReports({ page, pageSize });
    all.push(...res.data);
    if (res.data.length < pageSize || all.length >= res.totalRecords) return all;
  }
}

export function ReportsPage() {
  // Liên kết từ trang tổng quan: /reporting/reports?status=SUBMITTED hoặc ?reportTypeCode=NOON
  const [searchParams, setSearchParams] = useSearchParams();
  const linkStatus = searchParams.get('status') || '';
  const linkType = searchParams.get('reportTypeCode') || searchParams.get('reportType') || '';

  const [reports, setReports] = useState<ReportSummaryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setReports(await fetchAllReports());
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.message || 'Không tải được danh sách báo cáo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const handleDeleteDraft = async (report: ReportSummaryDto) => {
    const reason = window.prompt(`Xóa bản nháp ${report.reportNumber}. Nhập lý do để lưu vết kiểm toán:`);
    if (!reason || !reason.trim()) {
      return;
    }

    try {
      await ReportingService.softDeleteReport(report.id, reason.trim());
      await loadReports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không xóa được báo cáo nháp.');
    }
  };

  const visible = reports.filter(r =>
    (!linkStatus || r.status === linkStatus) && (!linkType || r.reportTypeCode === linkType));

  const counts = reports.reduce(
    (acc, r) => { if (r.status in acc) acc[r.status] += 1; return acc; },
    { DRAFT: 0, SUBMITTED: 0, APPROVED: 0, REJECTED: 0, TRANSMITTED: 0 } as Record<ReportStatus, number>,
  );

  const columns: Column<ReportSummaryDto>[] = [
    {
      key: 'reportNumber', header: 'Số báo cáo', width: 190, value: r => r.reportNumber,
      render: r => <Link to={`/reporting/reports/${r.id}`} className="font-medium text-blue-700 hover:underline">{r.reportNumber}</Link>,
    },
    {
      key: 'type', header: 'Loại báo cáo', width: 150, value: r => getReportTypeStyle(r.reportTypeCode).label,
      render: r => {
        const typeStyle = getReportTypeStyle(r.reportTypeCode);
        return (
          <span className="inline-flex items-center gap-1.5 text-slate-700">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${typeStyle.dot}`} />
            {typeStyle.label}
          </span>
        );
      },
    },
    {
      key: 'status', header: 'Trạng thái', width: 140, align: 'center', value: r => statusStyleOf(r.status).label,
      render: r => {
        const st = statusStyleOf(r.status);
        return (
          <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium ${st.badge}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
            {st.label}
          </span>
        );
      },
    },
    {
      key: 'voyage', header: 'Chuyến đi', width: 170, value: r => r.voyageNumber || r.voyageId || '',
      render: r => r.voyageNumber || r.voyageId || <span className="text-slate-400">—</span>,
    },
    {
      key: 'reportDateTime', header: 'Thời điểm báo cáo', width: 160, align: 'center', value: r => r.reportDateTime,
      filter: r => formatDateTime(r.reportDateTime), exportValue: r => formatDateTime(r.reportDateTime), render: r => formatDateTime(r.reportDateTime),
    },
    {
      key: 'preparedBy', header: 'Người lập', width: 160, value: r => r.preparedBy ?? '',
      render: r => r.preparedBy || <span className="text-slate-400">—</span>,
    },
    {
      key: 'actions', header: 'Hành động', width: 120, align: 'center', exportable: false,
      render: r => (
        <TableActions>
          <Link to={`/reporting/reports/${r.id}`} title="Xem" aria-label={`Xem ${r.reportNumber}`} className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600">
            <Eye className="h-3.5 w-3.5" />
          </Link>
          {r.status === 'APPROVED' && (
            <Link to={`/reporting/reports/${r.id}`} title="Gửi về bờ" aria-label={`Gửi ${r.reportNumber} về bờ`} className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600">
              <Send className="h-3.5 w-3.5" />
            </Link>
          )}
          {r.status === 'DRAFT' && (
            <PermissionGate permission="reporting.delete"><button type="button" onClick={() => void handleDeleteDraft(r)} title="Xóa bản nháp" aria-label={`Xóa ${r.reportNumber}`}
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-3.5 w-3.5" />
            </button></PermissionGate>
          )}
        </TableActions>
      ),
    },
  ];

  const linkChips = [
    linkType ? { label: `Loại: ${getReportTypeStyle(linkType).label}` } : null,
    linkStatus ? { label: `Trạng thái: ${statusStyleOf(linkStatus as ReportStatus).label}` } : null,
  ].filter(Boolean) as { label: string }[];

  return (
    <div className="reporting-page h-full w-full flex flex-col overflow-hidden bg-white">
      <div className="flex min-h-0 flex-1 flex-col">

        {/* ── Tiêu đề ─────────────────────────────────────────── */}
        <div className="flex flex-shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600" />
            <Link to="/reporting" className="text-xs text-gray-500 hover:text-blue-600">Báo cáo</Link>
            <span className="text-gray-300">/</span>
            <h1 className="text-sm font-semibold text-gray-700">Danh sách báo cáo</h1>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">{reports.length}</span>
            <span className="ml-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
              {(Object.keys(counts) as ReportStatus[]).map(st => (
                <span key={st}>
                  <span className={`mr-1 inline-block h-2 w-2 rounded-full ${STATUS_STYLES[st].dot}`} />
                  {STATUS_STYLES[st].label}: <strong className="text-slate-900">{counts[st]}</strong>
                </span>
              ))}
            </span>
          </div>
          <PermissionGate permission={'reporting.create'}><Link
            to="/reporting/noon/new"
            className="inline-flex items-center gap-1.5 rounded border border-blue-600 bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Tạo báo cáo
          </Link></PermissionGate>
        </div>

        {/* ── Lỗi ─────────────────────────────────────────── */}
        {error && (
          <div className="flex flex-shrink-0 items-start gap-3 border-b border-red-200 bg-red-50 px-4 py-3 text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
            <div>
              <p className="text-sm font-semibold">Không tải được danh sách báo cáo</p>
              <p className="text-sm text-rose-700">{error}</p>
            </div>
          </div>
        )}

        <DataTable
          flush
          showCount={false}
          loading={loading}
          columns={columns}
          data={visible}
          rowKey={r => r.id}
          itemLabel="báo cáo"
          emptyMessage="Không có báo cáo nào"
          searchPlaceholder="Tìm số báo cáo, chuyến đi, người lập..."
          exportOptions={{ fileName: 'danh-sach-bao-cao', title: 'DANH SÁCH BÁO CÁO' }}
          minWidth={1100}
          toolbarActions={linkChips.length > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
              {linkChips.map(c => c.label).join(' · ')}
              <button type="button" onClick={() => setSearchParams({}, { replace: true })} title="Bỏ lọc" aria-label="Bỏ lọc" className="rounded-full p-0.5 hover:bg-blue-200"><X className="h-3 w-3" /></button>
            </span>
          ) : undefined}
        />
      </div>
    </div>
  );
}
