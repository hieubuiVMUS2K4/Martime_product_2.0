import React, { useEffect, useRef, useState } from 'react'
import { ArrowLeft, CalendarClock, Camera, ChevronDown, Download, FileSpreadsheet, FileText, Loader2, Pencil, Trash2 } from 'lucide-react'
import type { CrewMember } from '../../../types/maritime.types'
import { PermissionGate } from '../../../components/auth/PermissionGate'
import { departmentLabel, formatDateVi } from './crewProfileFields'

/*
  Phần đầu hồ sơ thuyền viên trên tàu — cùng bố cục với bờ (ảnh, tên + trạng thái, mã · chức danh,
  ngày lên tàu, hết hạn hợp đồng; nút Xuất hồ sơ và Sửa hồ sơ), theme của tàu.
*/

const AVATAR_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 260'%3E%3Crect width='200' height='260' fill='%23e5e7eb'/%3E%3Ccircle cx='100' cy='70' r='35' fill='%239ca3af'/%3E%3Cellipse cx='100' cy='180' rx='65' ry='50' fill='%239ca3af'/%3E%3C/svg%3E"

const STATUS: Record<string, { label: string; tone: string }> = {
  onboard: { label: 'Đang trên tàu', tone: 'bg-green-50 text-green-700 ring-green-200' },
  PendingReview: { label: 'Chờ duyệt lên tàu', tone: 'bg-amber-50 text-amber-800 ring-amber-200' },
  OnHold: { label: 'Tạm giữ — chờ bờ bổ sung', tone: 'bg-orange-50 text-orange-800 ring-orange-200' },
  Rejected: { label: 'Đã từ chối', tone: 'bg-red-50 text-red-700 ring-red-200' },
  pool: { label: 'Không trên tàu', tone: 'bg-gray-100 text-gray-600 ring-gray-200' },
}

interface Props {
  crew: CrewMember
  rankName?: string
  onBack: () => void
  editing: boolean
  onEdit: () => void
  /** Có thay đổi từ bờ chưa xem: chấm đỏ cạnh tên. */
  hasShoreChanges: boolean
  avatarSrc?: string
  avatarPending: boolean
  avatarUploading: boolean
  onAvatarClick: () => void
  onAvatarChoose: () => void
  onAvatarSave: () => void
  onAvatarCancel: () => void
  onAvatarDelete: () => void
  onExport: (format: 'pdf' | 'excel') => void
}

/** Nút "Xuất hồ sơ" kèm menu PDF / Excel (giống bờ). */
const ExportButton: React.FC<{ onExport: (format: 'pdf' | 'excel') => void }> = ({ onExport }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])
  const item = 'flex w-full items-start gap-2.5 rounded px-3 py-2 text-left hover:bg-blue-50'
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} aria-haspopup="menu" aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
        <Download className="h-3.5 w-3.5" /> Xuất hồ sơ <ChevronDown className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1 w-60 rounded-md border border-gray-200 bg-white p-1 shadow-lg">
          <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); onExport('pdf') }}>
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <span><span className="block text-sm font-medium text-gray-900">PDF (.pdf)</span>
              <span className="block text-xs text-gray-500">Tải file PDF để gửi hoặc lưu hồ sơ</span></span>
          </button>
          <button type="button" role="menuitem" className={item} onClick={() => { setOpen(false); onExport('excel') }}>
            <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
            <span><span className="block text-sm font-medium text-gray-900">Excel (.xlsx)</span>
              <span className="block text-xs text-gray-500">Tải file Excel để sửa hoặc gửi đi</span></span>
          </button>
        </div>
      )}
    </div>
  )
}

export const CrewProfileHeader: React.FC<Props> = ({
  crew, rankName, onBack, editing, onEdit, hasShoreChanges,
  avatarSrc, avatarPending, avatarUploading, onAvatarClick, onAvatarChoose, onAvatarSave, onAvatarCancel, onAvatarDelete, onExport,
}) => {
  const status = crew.isOnboard && !crew.onboardStatus?.match(/PendingReview|OnHold|Rejected/)
    ? STATUS.onboard
    : STATUS[crew.onboardStatus ?? ''] ?? (crew.isOnboard ? STATUS.onboard : STATUS.pool)

  const daysLeft = crew.contractEnd ? Math.ceil((new Date(crew.contractEnd).getTime() - Date.now()) / 86400000) : null
  const contractTone = daysLeft === null ? 'text-gray-900' : daysLeft < 0 ? 'text-red-700' : daysLeft <= 60 ? 'text-amber-700' : 'text-gray-900'

  return (
    <div className="border-b border-gray-200 bg-white px-6 pb-4 pt-3">
      <button type="button" onClick={onBack}
        className="mb-3 inline-flex items-center gap-1.5 rounded px-1.5 py-1 text-sm text-gray-500 hover:bg-blue-50 hover:text-blue-700">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Quay lại danh sách
      </button>

      <div className="flex flex-wrap items-start gap-5">
        {/* Ảnh */}
        <div className="flex flex-col items-center gap-1.5">
          <div className="relative h-36 w-28 overflow-hidden rounded-lg bg-gray-200 ring-1 ring-gray-200">
            <img src={avatarSrc || AVATAR_FALLBACK} alt={`Ảnh ${crew.fullName}`} onClick={onAvatarClick}
              className={`h-full w-full object-cover ${avatarSrc && !avatarPending ? 'cursor-zoom-in' : ''}`} />
            {avatarUploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 className="h-6 w-6 animate-spin text-white" aria-label="Đang tải ảnh" />
              </div>
            )}
            {avatarPending && !avatarUploading && (
              <span className="absolute left-1 top-1 rounded bg-amber-500 px-1.5 py-0.5 text-xs font-semibold text-white">MỚI</span>
            )}
            {!avatarPending && !avatarUploading && (
              <PermissionGate permission="crew.update">
                <div className="absolute bottom-1 right-1 flex gap-1">
                  {avatarSrc && (
                    <button type="button" onClick={onAvatarDelete} title="Xóa ảnh" aria-label="Xóa ảnh"
                      className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-red-600 shadow hover:bg-white">
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  )}
                  <button type="button" onClick={onAvatarChoose} title="Đổi ảnh (JPG/PNG)" aria-label="Đổi ảnh"
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-blue-700 shadow hover:bg-white">
                    <Camera className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </PermissionGate>
            )}
          </div>
          {avatarPending && (
            <div className="flex gap-1">
              <button type="button" onClick={onAvatarSave} disabled={avatarUploading}
                className="rounded bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">Lưu ảnh</button>
              <button type="button" onClick={onAvatarCancel} disabled={avatarUploading}
                className="rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">Hủy</button>
            </div>
          )}
        </div>

        {/* Tên và thông tin chính */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-bold text-gray-900">{crew.fullName}</h1>
            {hasShoreChanges && <span className="h-2.5 w-2.5 rounded-full bg-red-500" title="Có thay đổi từ bờ chưa xem" />}
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${status.tone}`}>{status.label}</span>
          </div>
          <p className="mt-1 text-sm text-gray-500">
            <span className="font-mono">{crew.crewId}</span>
            {(crew.rank?.rankName || rankName) && <> · <span className="font-medium text-gray-900">{crew.rank?.rankName || rankName}</span></>}
            {crew.department && <> · Bộ phận {departmentLabel(crew.department)}</>}
          </p>

          <dl className="mt-3 flex flex-wrap gap-x-10 gap-y-2 text-sm">
            <div>
              <dt className="text-xs text-gray-500">Ngày lên tàu</dt>
              <dd className="mt-0.5 font-medium text-gray-900">{formatDateVi(crew.embarkDate) || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Hết hạn hợp đồng</dt>
              <dd className={`mt-0.5 flex items-center gap-1.5 font-medium ${contractTone}`}>
                {daysLeft !== null && daysLeft <= 60 && <CalendarClock className="h-4 w-4" aria-hidden="true" />}
                {formatDateVi(crew.contractEnd) || '—'}
                {daysLeft !== null && daysLeft < 0 && <span className="text-xs">(đã quá hạn)</span>}
                {daysLeft !== null && daysLeft >= 0 && daysLeft <= 60 && <span className="text-xs">(còn {daysLeft} ngày)</span>}
              </dd>
            </div>
            {crew.phoneNumber && (
              <div>
                <dt className="text-xs text-gray-500">Điện thoại</dt>
                <dd className="mt-0.5 font-medium text-gray-900">{crew.phoneNumber}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Nút chính */}
        <div className="flex items-center gap-2">
          <ExportButton onExport={onExport} />
          {!editing && (
            <PermissionGate permission="crew.update">
              <button type="button" onClick={onEdit}
                className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">
                <Pencil className="h-3.5 w-3.5" /> Sửa hồ sơ
              </button>
            </PermissionGate>
          )}
        </div>
      </div>
    </div>
  )
}
