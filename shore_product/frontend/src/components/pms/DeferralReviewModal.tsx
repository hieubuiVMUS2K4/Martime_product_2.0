/**
 * DeferralReviewModal - Popup duyệt/từ chối yêu cầu xin hoãn
 * Có thể dùng ở WorkPlanningPage và WorkReportPage
 */
import { useState, useEffect } from 'react';
import {
  Clock, CheckCircle, XCircle, X, Calendar, Shield, RefreshCw
} from 'lucide-react';
import {
  getDeferralRequests,
  reviewDeferralRequest,
  type DeferralRequest,
  type ReviewDeferralDto
} from '@/services/maintenance.service';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

interface DeferralReviewModalProps {
  open: boolean;
  onClose: () => void;
  /** If provided, only show deferrals for this task */
  taskId?: string;
  /** Called after a successful review action */
  onReviewed?: () => void;
}

export default function DeferralReviewModal({ open, onClose, taskId, onReviewed }: DeferralReviewModalProps) {
  const [deferrals, setDeferrals] = useState<DeferralRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Review sub-modal state
  const [selected, setSelected] = useState<DeferralRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [reviewNotes, setReviewNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (open) loadDeferrals();
  }, [open, taskId]);

  const loadDeferrals = async () => {
    try {
      setLoading(true);
      const res = await getDeferralRequests({ status: 'PENDING', pageSize: 50 });
      const items = taskId ? res.items.filter(d => d.taskId === taskId) : res.items;
      setDeferrals(items);
    } catch {
      toast.error('Không thể tải danh sách yêu cầu hoãn');
    } finally {
      setLoading(false);
    }
  };

  const openReview = (d: DeferralRequest, action: 'APPROVE' | 'REJECT') => {
    setSelected(d);
    setReviewAction(action);
    setReviewNotes('');
  };

  const handleConfirm = async () => {
    if (!selected) return;
    try {
      setActionLoading(true);
      const dto: ReviewDeferralDto = { action: reviewAction, notes: reviewNotes || undefined };
      await reviewDeferralRequest(selected.id, dto);
      toast.success(reviewAction === 'APPROVE' ? 'Đã duyệt yêu cầu hoãn' : 'Đã từ chối yêu cầu hoãn');
      setDeferrals(prev => prev.filter(d => d.id !== selected.id));
      setSelected(null);
      onReviewed?.();
    } catch {
      toast.error('Không thể xử lý yêu cầu hoãn');
    } finally {
      setActionLoading(false);
    }
  };

  if (!open) return null;

  // If no more pending deferrals after review, auto-close after a moment
  const isEmpty = !loading && deferrals.length === 0;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200">
          <div className="flex items-center gap-2.5">
            <Clock className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-semibold text-gray-900">Yêu cầu xin hoãn</h2>
            {deferrals.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">
                {deferrals.length} chờ duyệt
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={loadDeferrals} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded" title="Làm mới">
              <RefreshCw className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-accent border-t-transparent" />
              <span className="ml-2 text-sm text-gray-500">Đang tải...</span>
            </div>
          ) : isEmpty ? (
            <div className="text-center py-12">
              <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
              <p className="text-gray-600 font-medium">Không có yêu cầu hoãn nào đang chờ</p>
            </div>
          ) : (
            <div className="space-y-3">
              {deferrals.map(d => (
                <div key={d.id} className="border border-gray-200 rounded-lg p-3.5 hover:bg-gray-50 transition-colors">
                  {/* Top row: task code + badges */}
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="font-semibold text-sm text-gray-900">{d.taskCode}</span>
                    <span className="px-1.5 py-0.5 text-[10px] font-medium bg-yellow-100 text-yellow-800 rounded border border-yellow-300">
                      PENDING
                    </span>
                    <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${
                      d.priority === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                      d.priority === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {d.priority}
                    </span>
                    {d.isCmsItem && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium bg-[#dce9f8] text-[#16375f] rounded">
                        <Shield className="w-3 h-3" /> CMS
                      </span>
                    )}
                  </div>

                  {/* Reason */}
                  <p className="text-sm text-gray-700 mb-2">{d.reason}</p>

                  {/* Dates */}
                  <div className="flex items-center gap-4 text-xs text-gray-500 mb-2.5">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      Hiện tại: {format(parseISO(d.currentDueDate), 'dd/MM/yyyy')}
                    </span>
                    <span className="flex items-center gap-1 text-amber-600 font-medium">
                      <Calendar className="w-3.5 h-3.5" />
                      Đề xuất: {format(parseISO(d.proposedDueDate), 'dd/MM/yyyy')}
                    </span>
                    <span>+{d.deferralDays} ngày</span>
                  </div>

                  {/* Requester info */}
                  <div className="text-xs text-gray-400 mb-3">
                    Người yêu cầu: {d.requestedByName || d.requestedBy || '—'} · {format(parseISO(d.requestedAt), 'dd/MM/yyyy HH:mm')}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openReview(d, 'APPROVE')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 transition-colors"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Duyệt
                    </button>
                    <button
                      onClick={() => openReview(d, 'REJECT')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-white text-red-600 text-xs font-medium rounded border border-red-300 hover:bg-red-50 transition-colors"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Từ chối
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Review Confirm Sub-modal ── */}
      {selected && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60]" onClick={() => setSelected(null)}>
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="p-5">
              <h3 className="text-base font-semibold text-gray-900 mb-3">
                {reviewAction === 'APPROVE' ? 'Duyệt yêu cầu hoãn' : 'Từ chối yêu cầu hoãn'}
              </h3>

              <div className="bg-gray-50 rounded-lg p-3 mb-3 text-sm space-y-1.5">
                <div><span className="font-medium">Công việc:</span> {selected.taskCode}</div>
                <div><span className="font-medium">Lý do:</span> {selected.reason}</div>
                <div className="pt-1.5 border-t border-gray-200">
                  <span className="font-medium">Thời gian hoãn:</span>
                  <p className="text-gray-600 mt-0.5">
                    {format(parseISO(selected.currentDueDate), 'dd/MM/yyyy')} → {format(parseISO(selected.proposedDueDate), 'dd/MM/yyyy')} (+{selected.deferralDays} ngày)
                  </p>
                </div>
                {selected.isCmsItem && (
                  <div className="pt-1.5 border-t border-gray-200 flex items-center gap-1 text-[#16375f] font-medium">
                    <Shield className="w-4 h-4" /> Hạng mục CMS — cần xem xét kỹ
                  </div>
                )}
              </div>

              <div className={`rounded-lg p-2.5 mb-3 text-xs ${
                reviewAction === 'APPROVE' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'
              }`}>
                {reviewAction === 'APPROVE'
                  ? 'Sau khi duyệt, ngày đến hạn của task sẽ được cập nhật theo ngày đề xuất.'
                  : 'Sau khi từ chối, task sẽ giữ nguyên ngày đến hạn hiện tại.'}
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Ghi chú {reviewAction === 'REJECT' ? '(bắt buộc)' : '(tùy chọn)'}
                </label>
                <textarea
                  value={reviewNotes}
                  onChange={e => setReviewNotes(e.target.value)}
                  placeholder={reviewAction === 'APPROVE' ? 'Ghi chú khi duyệt...' : 'Lý do từ chối...'}
                  rows={3}
                  className={`w-full px-3 py-2 border rounded-md text-sm focus:ring-2 focus:border-transparent ${
                    reviewAction === 'APPROVE' ? 'border-gray-300 focus:ring-green-500' : 'border-gray-300 focus:ring-red-500'
                  }`}
                />
              </div>

              <div className="flex gap-2.5">
                <button
                  onClick={() => setSelected(null)}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={actionLoading || (reviewAction === 'REJECT' && !reviewNotes.trim())}
                  className={`flex-1 px-4 py-2 text-white rounded-md text-sm disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                    reviewAction === 'APPROVE' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {actionLoading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  ) : reviewAction === 'APPROVE' ? (
                    <><CheckCircle className="w-3.5 h-3.5" /> Duyệt</>
                  ) : (
                    <><XCircle className="w-3.5 h-3.5" /> Từ chối</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

