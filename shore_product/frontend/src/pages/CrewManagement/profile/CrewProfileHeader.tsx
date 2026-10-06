import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Pencil, Ship, CalendarClock, Loader2, Download, ChevronDown, FileText, FileSpreadsheet } from 'lucide-react';
import ProtectedImage from '../../../components/common/ProtectedImage';
import { Button } from '../../../components/common';
import type { CrewMember } from '../../../types/crew.types';
import { formatDateVi } from '../../../utils/date';
import { departmentLabel } from './crewProfileFields';

/*
  Phần đầu hồ sơ thuyền viên: những gì người xem cần thấy ngay (ảnh, tên, chức danh, tàu,
  trạng thái, hạn hợp đồng) và các nút chính. Luôn hiện ở mọi tab.
*/

const STATUS: Record<string, { label: string; tone: string }> = {
  onboard: { label: 'Đang trên tàu', tone: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  PendingReview: { label: 'Đang chờ duyệt', tone: 'bg-amber-50 text-amber-700 ring-amber-200' },
  OnHold: { label: 'Tạm giữ', tone: 'bg-orange-50 text-orange-700 ring-orange-200' },
  Rejected: { label: 'Bị từ chối', tone: 'bg-red-50 text-red-700 ring-red-200' },
  pool: { label: 'Ở bờ', tone: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

const AVATAR_FALLBACK =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 260'%3E%3Crect width='200' height='260' fill='%23e5e7eb'/%3E%3Ccircle cx='100' cy='70' r='35' fill='%239ca3af'/%3E%3Cellipse cx='100' cy='180' rx='65' ry='50' fill='%239ca3af'/%3E%3C/svg%3E";

interface Props {
  crew: CrewMember;
  /** Tên chức danh / tên tàu tra từ danh mục, khi API chi tiết chỉ trả mã. */
  rankName?: string;
  vesselName?: string;
  onBack: () => void;
  editing: boolean;
  onEdit: () => void;
  /** Ảnh mới đang chờ lưu (xem trước). */
  avatarPreview: string | null;
  avatarPending: boolean;
  avatarUploading: boolean;
  onAvatarChoose: () => void;
  onAvatarSave: () => void;
  onAvatarCancel: () => void;
  onExport: (format: 'pdf' | 'excel') => void;
  exporting: boolean;
}

/** Nút "Xuất hồ sơ" kèm menu chọn PDF / Excel. */
const ExportButton: React.FC<{ onExport: (format: 'pdf' | 'excel') => void; exporting: boolean }> = ({ onExport, exporting }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const item = 'flex w-full items-start gap-2.5 rounded px-3 py-2 text-left hover:bg-primary-soft';
  return (
    <div ref={ref} className="relative">
      <Button loading={exporting} icon={<Download className="h-4 w-4" />} onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}>
        {exporting ? 'Đang chuẩn bị...' : 'Xuất hồ sơ'} {!exporting && <ChevronDown className="h-3.5 w-3.5" />}
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-dropdown mt-1 w-64 rounded-md border border-line bg-surface p-1 shadow-lg">
          <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); onExport('pdf'); }}>
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <span><span className="block text-sm font-medium text-ink">PDF (in / lưu PDF)</span>
              <span className="block text-xs text-ink-muted">Mở hộp thoại in, chọn "Lưu thành PDF"</span></span>
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); onExport('excel'); }}>
            <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            <span><span className="block text-sm font-medium text-ink">Excel (.xlsx)</span>
              <span className="block text-xs text-ink-muted">Tải file Excel để sửa hoặc gửi đi</span></span>
          </button>
        </div>
      )}
    </div>
  );
};

export const CrewProfileHeader: React.FC<Props> = ({
  crew, rankName, vesselName, onBack, editing, onEdit,
  avatarPreview, avatarPending, avatarUploading, onAvatarChoose, onAvatarSave, onAvatarCancel, onExport, exporting,
}) => {
  const rank = crew.rankName || rankName;
  const vessel = crew.vesselName || vesselName;
  const status = crew.isOnboard ? STATUS.onboard : STATUS[crew.onboardStatus ?? ''] ?? STATUS.pool;

  const daysLeft = crew.contractEnd
    ? Math.ceil((new Date(crew.contractEnd).getTime() - Date.now()) / 86400000)
    : null;
  const contractTone = daysLeft === null ? 'text-ink'
    : daysLeft < 0 ? 'text-red-700'
      : daysLeft <= 60 ? 'text-amber-700'
        : 'text-ink';

  return (
    <div className="border-b border-line bg-surface px-6 pb-5 pt-3">
      <div>
      <button type="button" onClick={onBack}
        className="mb-3 inline-flex items-center gap-1.5 rounded px-1.5 py-1 text-sm text-ink-muted hover:bg-primary-soft hover:text-primary">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Quay lại danh sách
      </button>

      <div className="flex flex-wrap items-start gap-5">
        {/* Ảnh */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="relative h-36 w-28 overflow-hidden rounded-lg bg-slate-200 ring-1 ring-line">
            <ProtectedImage src={avatarPreview || crew.avatarUrl} fallbackSrc={AVATAR_FALLBACK} alt={`Ảnh ${crew.fullName}`}
              className="h-full w-full object-cover" />
            {avatarUploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="h-6 w-6 animate-spin text-white" aria-label="Đang tải ảnh" />
              </div>
            )}
            {!avatarPending && !avatarUploading && (
              <button type="button" onClick={onAvatarChoose} title="Đổi ảnh (JPG/PNG, tối đa 5MB)" aria-label="Đổi ảnh"
                className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-primary shadow hover:bg-white">
                <Camera className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
          {avatarPending && (
            <div className="flex gap-1">
              <Button size="sm" variant="primary" loading={avatarUploading} onClick={onAvatarSave}>Lưu ảnh</Button>
              <Button size="sm" disabled={avatarUploading} onClick={onAvatarCancel}>Hủy</Button>
            </div>
          )}
        </div>

        {/* Tên và thông tin chính */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold text-ink">{crew.fullName}</h1>
            <span className={`rounded-full px-3 py-1 text-[13px] font-semibold ring-1 ${status.tone}`}>{status.label}</span>
          </div>
          <p className="mt-1 text-base text-ink-muted">
            <span className="font-mono">{crew.crewId}</span>
            {rank && <> · <span className="font-medium text-ink">{rank}</span></>}
            {crew.department && <> · Bộ phận {departmentLabel(crew.department)}</>}
          </p>

          <dl className="mt-4 flex flex-wrap gap-x-10 gap-y-3 text-base">
            <div>
              <dt className="text-[13px] text-ink-muted">Tàu</dt>
              <dd className="mt-0.5 flex items-center gap-1.5 font-medium text-ink">
                {vessel
                  ? <><Ship className="h-4 w-4 text-accent" aria-hidden="true" />{vessel}</>
                  : <span className="text-ink-light">{crew.isOnboard ? 'Chưa rõ tàu' : 'Chưa ở tàu nào'}</span>}
              </dd>
            </div>
            <div>
              <dt className="text-[13px] text-ink-muted">Ngày lên tàu</dt>
              <dd className="mt-0.5 font-medium text-ink">{formatDateVi(crew.embarkDate) || '—'}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-ink-muted">Hết hạn hợp đồng</dt>
              <dd className={`mt-0.5 flex items-center gap-1.5 font-medium ${contractTone}`}>
                {daysLeft !== null && daysLeft <= 60 && <CalendarClock className="h-4 w-4" aria-hidden="true" />}
                {formatDateVi(crew.contractEnd) || '—'}
                {daysLeft !== null && daysLeft < 0 && <span className="text-[13px]">(đã quá hạn)</span>}
                {daysLeft !== null && daysLeft >= 0 && daysLeft <= 60 && <span className="text-[13px]">(còn {daysLeft} ngày)</span>}
              </dd>
            </div>
            {crew.phoneNumber && (
              <div>
                <dt className="text-[13px] text-ink-muted">Điện thoại</dt>
                <dd className="mt-0.5 font-medium text-ink">{crew.phoneNumber}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Nút chính */}
        <div className="flex items-center gap-2">
          <ExportButton onExport={onExport} exporting={exporting} />
          {!editing && (
            <Button variant="primary" icon={<Pencil className="h-4 w-4" />} onClick={onEdit}>Sửa hồ sơ</Button>
          )}
        </div>
      </div>
      </div>
    </div>
  );
};
