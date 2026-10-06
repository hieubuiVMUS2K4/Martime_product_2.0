import { PermissionGate } from '@/components/auth/PermissionGate'
/**
 * C/E Approval Dashboard
 * For Chief Engineer to approve/reject maintenance tasks
 * PMS Workflow v2.0
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, XCircle, AlertTriangle, Clock, FileText, RefreshCw, ArrowLeft, Filter } from 'lucide-react';
import { 
  getPendingApprovalTasks, 
  getApprovalDashboardSummary,
  verifyTask,
  type ApprovalDashboardSummary,
  type VerifyTaskDto
} from '@/services/maintenance.service';
import { useTranslationSafe } from '@/contexts/I18nContext';
import type { MaintenanceTask } from '@/types/maintenance.types';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import DeferralReviewModal from '@/components/pms/DeferralReviewModal';

export default function ApprovalDashboardPage() {
  const { t } = useTranslationSafe();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [summary, setSummary] = useState<ApprovalDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showDeferralModal, setShowDeferralModal] = useState(false);
  
  // Filter state
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  
  // Approval/Reject modal state
  const [selectedTask, setSelectedTask] = useState<MaintenanceTask | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // TODO: Get current user from authentication context
  const [currentUserCrewId] = useState('CREW002'); // Default to C/E for testing

  useEffect(() => {
    loadData();
  }, [page]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tasksData, summaryData] = await Promise.all([
        getPendingApprovalTasks(page, 20),
        getApprovalDashboardSummary()
      ]);
      setTasks(tasksData.items);
      setTotalPages(tasksData.totalPages);
      setSummary(summaryData);
    } catch (err) {
      console.error('Error loading data:', err);
      toast.error(t('pms.approval.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleApproveClick = (task: MaintenanceTask) => {
    setSelectedTask(task);
    setApprovalNotes('');
    setShowApproveModal(true);
  };

  const handleRejectClick = (task: MaintenanceTask) => {
    setSelectedTask(task);
    setShowRejectModal(true);
    setRejectionReason('');
  };

  const handleApproveConfirm = async () => {
    if (!selectedTask || !currentUserCrewId) return;

    try {
      setActionLoading(true);
      const dto: VerifyTaskDto = {
        action: 'APPROVE',
        notes: approvalNotes || undefined
      };
      await verifyTask(selectedTask.id, dto);
      
      toast.success(t('pms.approval.taskApproved'));
      
      // Remove task from list
      setTasks(prev => prev.filter(t => t.id !== selectedTask.id));
      if (summary) {
        setSummary({
          ...summary,
          pendingApprovalCount: summary.pendingApprovalCount - 1
        });
      }
      
      // Close modal
      setShowApproveModal(false);
      setSelectedTask(null);
      setApprovalNotes('');
    } catch (err) {
      console.error('Error approving task:', err);
      toast.error(t('pms.approval.approveFailed'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleRejectConfirm = async () => {
    if (!selectedTask || !rejectionReason.trim() || !currentUserCrewId) {
      toast.error(t('pms.approval.rejectionRequired'));
      return;
    }

    try {
      setActionLoading(true);
      const dto: VerifyTaskDto = {
        action: 'REJECT',
        rejectionReason: rejectionReason
      };
      await verifyTask(selectedTask.id, dto);
      
      toast.success(t('pms.approval.taskRejected'));
      
      // Remove task from list
      setTasks(prev => prev.filter(t => t.id !== selectedTask.id));
      if (summary) {
        setSummary({
          ...summary,
          pendingApprovalCount: summary.pendingApprovalCount - 1,
          rectifyTaskCount: summary.rectifyTaskCount + 1
        });
      }
      
      // Close modal
      setShowRejectModal(false);
      setSelectedTask(null);
      setRejectionReason('');
    } catch (err) {
      console.error('Error rejecting task:', err);
      toast.error(t('pms.approval.rejectFailed'));
    } finally {
      setActionLoading(false);
    }
  };

  // Filter tasks
  const filteredTasks = tasks.filter(task => {
    if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
    if (departmentFilter !== 'all' && task.assignedDepartment !== departmentFilter) return false;
    return true;
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'CRITICAL': return 'bg-red-100 text-red-800 border-red-300';
      case 'HIGH': return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'NORMAL': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'LOW': return 'bg-blue-100 text-blue-800 border-blue-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="ml-3 text-gray-600">{t('pms.approval.loading')}</p>
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
          <AlertTriangle className="w-8 h-8 text-orange-500" />
          <h1 className="text-2xl font-bold text-gray-900">{t('pms.approval.title')}</h1>
        </div>
        <p className="text-gray-600 ml-14">
          {t('pms.approval.subtitle')}
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">{t('pms.approval.pendingApproval')}</p>
              <p className="text-2xl font-bold text-gray-900">
                {summary?.pendingApprovalCount ?? tasks.length}
              </p>
            </div>
          </div>
        </div>
        
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-pink-100 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-pink-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">{t('pms.approval.rectifyTasks')}</p>
              <p className="text-2xl font-bold text-gray-900">
                {summary?.rectifyTaskCount ?? 0}
              </p>
            </div>
          </div>
        </div>

        <div 
          className="bg-white rounded-lg border border-gray-200 p-4 cursor-pointer hover:bg-yellow-50 hover:border-yellow-300 transition-colors"
          onClick={() => setShowDeferralModal(true)}
          title="Click to manage deferral requests"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-100 flex items-center justify-center">
              <FileText className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">{t('pms.approval.pendingDeferrals')}</p>
              <p className="text-2xl font-bold text-gray-900">
                {summary?.pendingDeferralCount ?? 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-600">{t('pms.approval.overdueTasks')}</p>
              <p className="text-2xl font-bold text-gray-900">
                {summary?.overdueTaskCount ?? 0}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">{t('pms.approval.filters')}</span>
          </div>
          
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          >
            <option value="all">{t('pms.approval.allPriorities')}</option>
            <option value="CRITICAL">{t('pms.common.critical')}</option>
            <option value="HIGH">{t('pms.common.high')}</option>
            <option value="NORMAL">{t('pms.common.normal')}</option>
            <option value="LOW">{t('pms.common.low')}</option>
          </select>
          
          <select
            value={departmentFilter}
            onChange={(e) => setDepartmentFilter(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          >
            <option value="all">{t('pms.approval.allDepartments')}</option>
            <option value="ENGINE">{t('pms.approval.department.engine')}</option>
            <option value="DECK">{t('pms.approval.department.deck')}</option>
            <option value="ELECTRICAL">{t('pms.approval.department.electrical')}</option>
          </select>
          
          <button
            onClick={loadData}
            className="ml-auto px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md text-sm hover:bg-gray-200 flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            {t('pms.approval.refresh')}
          </button>
        </div>
      </div>

      {/* Tasks List */}
      {filteredTasks.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {t('pms.approval.noTasks')}
          </h3>
          <p className="text-gray-600">
            {t('pms.approval.noTasksDesc')}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('pms.approval.table.taskId')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('pms.approval.table.equipment')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('pms.approval.table.description')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('pms.approval.table.priority')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('pms.approval.table.dueDate')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('pms.approval.table.assignedTo')}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredTasks.map((task) => (
                <tr key={task.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="font-medium text-gray-900">{task.taskId}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{task.equipmentName}</p>
                      <p className="text-xs text-gray-500">{task.equipmentId}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-gray-700 line-clamp-2 max-w-md">
                      {task.taskDescription}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border ${getPriorityColor(task.priority)}`}>
                      {task.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-700">
                      {format(parseISO(task.nextDueAt), 'dd/MM/yyyy HH:mm')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-700">
                      {task.assignedTo || t('pms.approval.unassigned')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <PermissionGate permission="pms.work.approve"><button
                        onClick={() => handleApproveClick(task)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors"
                      >
                        <CheckCircle className="w-4 h-4" />
                        {t('pms.approval.approve')}
                      </button></PermissionGate>
                      <PermissionGate permission="pms.work.reject"><button
                        onClick={() => handleRejectClick(task)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-white text-red-600 text-sm font-medium rounded-md border border-red-300 hover:bg-red-50 transition-colors"
                      >
                        <XCircle className="w-4 h-4" />
                        {t('pms.approval.reject')}
                      </button></PermissionGate>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-700">
                {t('pms.approval.pagination.page', { current: page, total: totalPages })}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm disabled:opacity-50 hover:bg-gray-50"
                >
                  {t('pms.approval.pagination.previous')}
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 border border-gray-300 rounded-md text-sm disabled:opacity-50 hover:bg-gray-50"
                >
                  {t('pms.approval.pagination.next')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Approve Modal */}
      {showApproveModal && selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('pms.approval.modal.approveTitle')}</h3>
              
              <p className="text-gray-700 mb-4">
                {t('pms.approval.modal.approveConfirm')}
              </p>
              
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">{t('pms.approval.table.taskId')}:</span> {selectedTask.taskId}
                  </div>
                  <div>
                    <span className="font-medium">{t('pms.approval.table.equipment')}:</span> {selectedTask.equipmentName}
                  </div>
                  <div>
                    <span className="font-medium">{t('pms.approval.table.priority')}:</span> {selectedTask.priority}
                  </div>
                  <div className="pt-2 border-t border-gray-200">
                    <span className="font-medium">{t('pms.approval.table.description')}:</span>
                    <p className="text-gray-600 mt-1">{selectedTask.taskDescription}</p>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-blue-800">
                  {t('pms.approval.modal.approveInfo')}
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('pms.approval.modal.approvalNotes')}
                </label>
                <textarea
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  placeholder={t('pms.approval.modal.approvalNotesPlaceholder')}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowApproveModal(false)}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50"
                >
                  {t('common.cancel')}
                </button>
                <PermissionGate permission="pms.work.approve"><button
                  onClick={handleApproveConfirm}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      {t('pms.approval.modal.approving')}
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      {t('pms.approval.modal.approveTask')}
                    </>
                  )}
                </button></PermissionGate>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('pms.approval.modal.rejectTitle')}</h3>
              
              <p className="text-gray-700 mb-4">
                {t('pms.approval.modal.rejectConfirm')}
              </p>
              
              <div className="bg-gray-50 rounded-lg p-4 mb-4">
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">{t('pms.approval.table.taskId')}:</span> {selectedTask.taskId}
                  </div>
                  <div>
                    <span className="font-medium">{t('pms.approval.table.equipment')}:</span> {selectedTask.equipmentName}
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('pms.approval.modal.rejectionReason')} *
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder={t('pms.approval.modal.rejectionPlaceholder')}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  required
                />
              </div>

              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-4">
                <p className="text-sm text-orange-800">
                  {t('pms.approval.modal.rejectInfo')}
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowRejectModal(false)}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 disabled:opacity-50"
                >
                  {t('common.cancel')}
                </button>
                <PermissionGate permission="pms.work.reject"><button
                  onClick={handleRejectConfirm}
                  disabled={actionLoading || !rejectionReason.trim()}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {actionLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      {t('pms.approval.modal.rejecting')}
                    </>
                  ) : (
                    <>
                      <XCircle className="w-4 h-4" />
                      {t('pms.approval.modal.rejectTask')}
                    </>
                  )}
                </button></PermissionGate>
              </div>
            </div>
          </div>
        </div>
      )}

      <DeferralReviewModal
        open={showDeferralModal}
        onClose={() => setShowDeferralModal(false)}
        onReviewed={() => loadData()}
      />
    </div>
  );
}
