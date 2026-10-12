import { MaintenanceTask, TaskChecklistItem } from '../../types/maritime.types'
import { X, Calendar, User, ListChecks, AlertTriangle } from 'lucide-react'
import { format, parseISO } from 'date-fns'

interface TaskDetailModalProps {
  task: MaintenanceTask | null
  isOpen: boolean
  onClose: () => void
  onChecklistUpdate?: (itemId: string, data: Partial<TaskChecklistItem>) => Promise<void>
}

export function TaskDetailModal({ task, isOpen, onClose }: TaskDetailModalProps) {
  if (!task || !isOpen) return null

  const isGroupTask = !!task.equipmentGroupId
  const checklistItems = task.checklistItems || []
  const completedCount = checklistItems.filter(i => i.isCompleted).length
  const hasAbnormal = checklistItems.some(i => i.isAbnormal && !i.isCompleted)

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      
      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
            <h2 className="text-xl font-bold break-words pr-4">
              {task.equipmentGroupName || task.equipmentName}
            </h2>
            <button 
              onClick={onClose} 
              className="p-2 hover:bg-gray-100 rounded-full transition-colors flex-shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6">
            {/* Status Badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                task.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                task.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-800' :
                task.status === 'OVERDUE' ? 'bg-red-100 text-red-800' :
                'bg-gray-100 text-gray-800'
              }`}>
                {task.status}
              </span>
              
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                task.priority === 'CRITICAL' ? 'bg-red-500 text-white' :
                task.priority === 'HIGH' ? 'bg-orange-500 text-white' :
                task.priority === 'NORMAL' ? 'bg-yellow-100 text-yellow-800' :
                'bg-blue-100 text-blue-800'
              }`}>
                {task.priority}
              </span>

              {isGroupTask && (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 flex items-center gap-1">
                  <ListChecks className="w-3 h-3" />
                  {completedCount}/{checklistItems.length} assets
                </span>
              )}

              {hasAbnormal && (
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Abnormal Detected
                </span>
              )}
            </div>

            {/* Task Details */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <span className="text-gray-600">Due Date:</span>
                <span className="font-medium">
                  {format(parseISO(task.nextDueAt), 'dd MMM yyyy')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-gray-500" />
                <span className="text-gray-600">Assigned To:</span>
                <span className="font-medium">{task.assignedTo || 'Unassigned'}</span>
              </div>
            </div>

            {/* Description */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Description</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{task.taskDescription}</p>
            </div>

            {/* Notes */}
            {task.notes && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">Notes</h3>
                <p className="text-sm text-gray-600 whitespace-pre-wrap break-words">{task.notes}</p>
              </div>
            )}

            {/* Checklist for Group Tasks */}
            {isGroupTask && checklistItems.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <ListChecks className="w-5 h-5" />
                    Asset Checklist
                  </h3>
                  <span className="text-sm text-gray-600">
                    {completedCount}/{checklistItems.length} ({Math.round((completedCount / checklistItems.length) * 100)}%)
                  </span>
                </div>

                <div className="space-y-2">
                  {checklistItems.map((item) => (
                    <div
                      key={item.id}
                      className={`border rounded-lg p-4 ${
                        item.isCompleted ? 'bg-green-50 border-green-200' : 
                        item.isAbnormal ? 'bg-amber-50 border-amber-200' : 
                        'bg-white border-gray-200'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={item.isCompleted}
                          readOnly
                          className="mt-1 w-5 h-5 rounded"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-sm">{item.assetCode}</span>
                            <span className="text-sm text-gray-600">- {item.assetName}</span>
                            {item.isAbnormal && (
                              <span className="flex items-center gap-1 text-amber-700 text-xs font-medium">
                                <AlertTriangle className="w-3 h-3" />
                                Abnormal
                              </span>
                            )}
                          </div>
                          
                          {item.readingValue !== null && item.readingValue !== undefined && (
                            <div className="text-sm text-gray-600">
                              <span className="font-medium">Reading:</span> {item.readingValue}
                            </div>
                          )}
                          
                          {item.remarks && (
                            <div className="text-sm text-gray-600 mt-1 break-words">
                              <span className="font-medium">Remarks:</span> {item.remarks}
                            </div>
                          )}
                          
                          {item.completedAt && (
                            <div className="text-xs text-gray-500 mt-2">
                              Completed {format(parseISO(item.completedAt), 'dd MMM yyyy HH:mm')}
                              {item.completedBy && ` by ${item.completedBy}`}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Legacy Single Asset Note */}
            {!isGroupTask && (
              <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm text-gray-600">
                  This is a legacy individual asset task. Group-based tasks show asset checklists above.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
