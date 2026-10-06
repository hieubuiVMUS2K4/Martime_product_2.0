import { PermissionGate } from '@/components/auth/PermissionGate'
/**
 * Deferral Management Page
 * For reviewing and managing deferral requests
 * PMS Workflow v2.0
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  ArrowLeft, 
  Filter,
  RefreshCw,
  Calendar,
  Shield,
  FileText
} from 'lucide-react';
import { 
  getDeferralRequests,
  reviewDeferralRequest,
  type DeferralRequest,
  type ReviewDeferralDto
} from '@/services/maintenance.service';
import { useTranslationSafe } from '@/contexts/I18nContext';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';

type DeferralStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'all';

export default function DeferralManagementPage() {
  const { t } = useTranslationSafe();
  const navigate = useNavigate();
  const [deferrals, setDeferrals] = useState<DeferralRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<DeferralStatus>('PENDING');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // Review modal state
  const [selectedDeferral, setSelectedDeferral] = useState<DeferralRequest | null>(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewAction, setReviewAction] = useState<'APPROVE' | 'REJECT'>('APPROVE');
  const [reviewNotes, setReviewNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadDeferrals();
  }, [page, statusFilter]);

  const loadDeferrals = async () => {
    try {
      setLoading(true);
      const response = await getDeferralRequests({
        status: statusFilter === 'all' ? undefined : statusFilter,
        page,
        pageSize: 20
      });
      setDeferrals(response.items);
      setTotalPages(response.totalPages);
    } catch (err) {
      console.error('Error loading deferrals:', err);
      toast.error(t('pms.deferral.failedToLoad'));
    } finally {
      setLoading(false);
    }
  };

  const handleReviewClick = (deferral: DeferralRequest, action: 'APPROVE' | 'REJECT') => {
    setSelectedDeferral(deferral);
    setReviewAction(action);
    setReviewNotes('');
    setShowReviewModal(true);
  };

  const handleReviewConfirm = async () => {
    if (!selectedDeferral) return;

    try {
      setActionLoading(true);
      const dto: ReviewDeferralDto = {
        action: reviewAction,
        notes: reviewNotes || undefined
      };
      await reviewDeferralRequest(selectedDeferral.id, dto);
      
      toast.success(
        reviewAction === 'APPROVE' 
          ? t('pms.deferral.approvedSuccess') 
          : t('pms.deferral.rejectedSuccess')
      );
      
      // Remove from list or update status
      setDeferrals(prev => 
        statusFilter === 'PENDING'
          ? prev.filter(d => d.id !== selectedDeferral.id)
          : prev.map(d => 
              d.id === selectedDeferral.id 
                ? { ...d, status: reviewAction === 'APPROVE' ? 'APPROVED' : 'REJECTED' }
                : d
            )
      );
      
      // Close modal
      setShowReviewModal(false);
      setSelectedDeferral(null);
      setReviewNotes('');
    } catch (err) {
      console.error('Error reviewing deferral:', err);
      toast.error(t('pms.deferral.failedToReview'));
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'APPROVED':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'REJECTED':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'CRITICAL':
        return 'bg-red-500 text-white';
      case 'HIGH':
        return 'bg-orange-500 text-white';
      case 'NORMAL':
        return 'bg-yellow-100 text-yellow-800';
      case 'LOW':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const pendingCount = deferrals.filter(d => d.status === 'PENDING').length;

  if (loading && deferrals.length === 0) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="ml-3 text-gray-600">{t('pms.deferral.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <button 
            onClick={() => navigate('/pms')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <Clock className="w-8 h-8 text-yellow-500" />
          <h1 className="text-2xl font-bold text-gray-900">{t('pms.deferral.title')}</h1>
          {statusFilter === 'PENDING' && pendingCount > 0 && (
            <span className="ml-2 px-2.5 py-0.5 bg-yellow-100 text-yellow-800 text-sm font-medium rounded-full">
              {t('pms.deferral.pending', { count: pendingCount })}
            </span>
          )}
        </div>
        <p className="text-gray-600 ml-14">
          {t('pms.deferral.subtitle')}
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">{t('pms.deferral.status')}:</span>
          </div>
          
          <div className="flex gap-2">
            {(['PENDING', 'APPROVED', 'REJECTED', 'all'] as DeferralStatus[]).map((status) => (
              <button
                key={status}
                onClick={() => {
                  setStatusFilter(status);
                  setPage(1);
                }}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  statusFilter === status
                    ? 'bg-yellow-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {status === 'all' ? t('pms.deferral.all') : status === 'APPROVED' ? t('pms.deferral.approved') : status === 'REJECTED' ? t('pms.deferral.rejected') : status.charAt(0) + status.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          
          <button
            onClick={loadDeferrals}
            className="ml-auto px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            {t('pms.deferral.refresh')}
          </button>
        </div>
      </div>

      {/* Deferral List */}
      {deferrals.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {t('pms.deferral.noDeferrals')}
          </h3>
          <p className="text-gray-600">
            {statusFilter === 'PENDING' 
              ? t('pms.deferral.allReviewed')
              : t('pms.deferral.noStatusDeferrals', { status: statusFilter.toLowerCase() })
            }
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {deferrals.map((deferral) => (
            <div 
              key={deferral.id} 
              className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* Task Info */}
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-semibold text-gray-900">{deferral.taskCode}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getStatusBadge(deferral.status)}`}>
                      {deferral.status}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getPriorityBadge(deferral.priority)}`}>
                      {deferral.priority}
                    </span>
                    {deferral.isCmsItem && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                        <Shield className="w-3 h-3" />
                        {t('pms.deferral.cmsItem')}
                      </span>
                    )}
                  </div>
                  
                  {/* Reason */}
                  <p className="text-gray-700 mb-3 break-words whitespace-pre-wrap">{deferral.reason}</p>
                  
                  {/* Dates */}
                  <div className="flex items-center gap-6 text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Calendar className="w-4 h-4" />
                      <span>{t('pms.deferral.currentDue', { date: format(parseISO(deferral.currentDueDate), 'dd MMM yyyy') })}</span>
                    </div>
                    <div className="flex items-center gap-2 text-amber-600 font-medium">
                      <Calendar className="w-4 h-4" />
                      <span>{t('pms.deferral.proposed', { date: format(parseISO(deferral.proposedDueDate), 'dd MMM yyyy') })}</span>
                    </div>
                    <div className="text-gray-500">
                      {t('pms.deferral.deferralDays', { days: deferral.deferralDays })}
                    </div>
                  </div>
                  
                  {/* Requester & Date */}
                  <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                    <span>{t('pms.deferral.requestedBy', { name: deferral.requestedByName || deferral.requestedBy || 'Unknown' })}</span>
                    <span>{t('pms.deferral.on', { date: format(parseISO(deferral.requestedAt), 'dd MMM yyyy HH:mm') })}</span>
                  </div>
                  
                  {/* Review Info (if reviewed) */}
                  {deferral.reviewedAt && (
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 bg-gray-50 px-3 py-2 rounded">
                      <span>{t('pms.deferral.reviewedBy', { name: deferral.reviewedByName || deferral.reviewedBy || 'Unknown' })}</span>
                      <span>{t('pms.deferral.on', { date: format(parseISO(deferral.reviewedAt), 'dd MMM yyyy HH:mm') })}</span>
                      {deferral.reviewNotes && (
                        <span className="flex items-center gap-1 break-words">
                          <FileText className="w-3 h-3 flex-shrink-0" />
                          {deferral.reviewNotes}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Actions */}
                {deferral.status === 'PENDING' && (
                  <div className="flex items-center gap-2 ml-4">
                    <PermissionGate permission="pms.work.approve"><button
                      onClick={() => handleReviewClick(deferral, 'APPROVE')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" />
                      {t('pms.deferral.approve')}
                    </button></PermissionGate>
                    <PermissionGate permission="pms.work.reject"><button
                      onClick={() => handleReviewClick(deferral, 'REJECT')}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-white text-red-600 text-sm font-medium rounded-md border border-red-300 hover:bg-red-50 transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                      {t('pms.deferral.reject')}
                    </button></PermissionGate>
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between py-4">
              <div className="text-sm text-gray-700">
                {t('pms.deferral.page', { current: page, total: totalPages })}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm disabled:opacity-50 hover:bg-gray-50"
                >
                  {t('pms.deferral.previous')}
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm disabled:opacity-50 hover:bg-gray-50"
                >
                  {t('pms.deferral.next')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && selectedDeferral && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                {reviewAction === 'APPROVE' ? t('pms.deferral.approveDeferralRequest') : t('pms.deferral.rejectDeferralRequest')}
              </h3>
              
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">{t('pms.deferral.task')}</span> {selectedDeferral.taskCode}
                  </div>
                  <div>
                    <span className="font-medium">{t('pms.deferral.reason')}</span> {selectedDeferral.reason}
                  </div>
                  <div className="pt-2 border-t border-gray-200">
                    <span className="font-medium">{t('pms.deferral.deferralPeriod')}</span>
                    <p className="text-gray-600 mt-1">
                      {format(parseISO(selectedDeferral.currentDueDate), 'dd MMM yyyy')} → {format(parseISO(selectedDeferral.proposedDueDate), 'dd MMM yyyy')} (+{selectedDeferral.deferralDays} {t('pms.deferral.deferralDays', { days: '' }).replace('+', '').replace(' ', '')})
                    </p>
                  </div>
                  {selectedDeferral.isCmsItem && (
                    <div className="pt-2 border-t border-gray-200">
                      <span className="inline-flex items-center gap-1 text-blue-700 font-medium">
                        <Shield className="w-4 h-4" />
                        {t('pms.deferral.cmsWarning')}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              <div className={`rounded-lg p-3 mb-4 ${
                reviewAction === 'APPROVE' 
                  ? 'bg-green-50 border border-green-200' 
                  : 'bg-red-50 border border-red-200'
              }`}>
                <p className={`text-sm ${reviewAction === 'APPROVE' ? 'text-green-800' : 'text-red-800'}`}>
                  {reviewAction === 'APPROVE' 
                    ? t('pms.deferral.approveNote')
                    : t('pms.deferral.rejectNote')
                  }
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('pms.deferral.reviewNotes')} {reviewAction === 'REJECT' ? t('pms.deferral.required') : t('pms.deferral.optional')}
                </label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder={reviewAction === 'APPROVE' 
                    ? t('pms.deferral.approvePlaceholder')
                    : t('pms.deferral.rejectPlaceholder')
                  }
                  rows={3}
                  className={`w-full px-3 py-2 border rounded-md focus:ring-2 focus:border-transparent ${
                    reviewAction === 'APPROVE' 
                      ? 'border-gray-300 focus:ring-green-500' 
                      : 'border-gray-300 focus:ring-red-500'
                  }`}
                  required={reviewAction === 'REJECT'}
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowReviewModal(false)}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50"
                >
                  {t('pms.deferral.cancel')}
                </button>
                <button
                  onClick={handleReviewConfirm}
                  disabled={actionLoading || (reviewAction === 'REJECT' && !reviewNotes.trim())}
                  className={`flex-1 px-4 py-2 text-white rounded-md disabled:opacity-50 flex items-center justify-center gap-2 ${
                    reviewAction === 'APPROVE'
                      ? 'bg-green-600 hover:bg-green-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {actionLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      {t('pms.deferral.processing')}
                    </>
                  ) : (
                    <>
                      {reviewAction === 'APPROVE' ? (
                        <CheckCircle className="w-4 h-4" />
                      ) : (
                        <XCircle className="w-4 h-4" />
                      )}
                      {reviewAction === 'APPROVE' ? t('pms.deferral.approveDeferral') : t('pms.deferral.rejectDeferral')}
                    </>
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
