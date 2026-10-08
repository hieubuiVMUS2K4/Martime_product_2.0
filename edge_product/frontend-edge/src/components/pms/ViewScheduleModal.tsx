import { X } from 'lucide-react';
import type { MaintenanceSchedule } from '@/types/pms.types';

interface ViewScheduleModalProps {
  isOpen: boolean;
  schedule: MaintenanceSchedule | null;
  onClose: () => void;
}

const INTERVAL_TYPE_LABELS = {
  CALENDAR: 'Calendar-Based',
  RUNNING_HOURS: 'Running Hours',
  HYBRID: 'Hybrid (Calendar + Running Hours)'
};

const PRIORITY_COLORS = {
  CRITICAL: 'bg-red-100 text-red-800 border-red-200',
  HIGH: 'bg-orange-100 text-orange-800 border-orange-200',
  MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  LOW: 'bg-blue-100 text-blue-800 border-blue-200'
};

export function ViewScheduleModal({ isOpen, schedule, onClose }: ViewScheduleModalProps) {
  if (!isOpen || !schedule) return null;

  const getIntervalDisplay = () => {
    const parts = [];
    if (schedule.intervalDays) {
      parts.push(`${schedule.intervalDays} days`);
    }
    if (schedule.intervalHours) {
      parts.push(`${schedule.intervalHours} hours`);
    }
    return parts.join(' or ') || 'Not set';
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Schedule Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Basic Information */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-3">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Schedule Code</label>
                <p className="text-sm text-gray-900">
                  {schedule.scheduleCode}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Schedule Name</label>
                <p className="text-sm text-gray-900">
                  {schedule.scheduleName}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Đối tượng bảo trì</label>
                {schedule.equipmentAssetId ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 bg-teal-100 text-teal-700 rounded text-xs font-bold">A</span>
                    <p className="text-sm text-gray-900">
                      {schedule.assetCode && <span className="font-medium">{schedule.assetCode}</span>}
                      {schedule.assetName && <span className="ml-1">{schedule.assetName}</span>}
                      {!schedule.assetCode && !schedule.assetName && <span className="text-gray-400">Thiết bị đơn lẻ</span>}
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-5 h-5 bg-indigo-100 text-indigo-700 rounded text-xs font-bold">G</span>
                    <p className="text-sm text-gray-900">
                      {schedule.groupName || schedule.groupCode}
                      {schedule.assetCount !== undefined && schedule.assetCount > 0 && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                          {schedule.assetCount} thiết bị
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Task Type</label>
                <p className="text-sm text-gray-900">{schedule.taskTypeName || `ID: ${schedule.taskTypeId}`}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Priority</label>
                <span className={`inline-flex items-center px-3 py-1 rounded text-sm font-medium ${PRIORITY_COLORS[schedule.priority as keyof typeof PRIORITY_COLORS]}`}>
                  {schedule.priority}
                </span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Status</label>
                <span className={`inline-flex items-center px-3 py-1 rounded text-sm font-medium ${
                  schedule.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                }`}>
                  {schedule.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Estimated Duration</label>
                <p className="text-sm text-gray-900">
                  {schedule.estimatedDurationHours ? `${schedule.estimatedDurationHours} hours` : '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Interval Configuration */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-3">Interval Configuration</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Interval Type</label>
                <p className="text-sm text-gray-900">
                  {INTERVAL_TYPE_LABELS[schedule.intervalType as keyof typeof INTERVAL_TYPE_LABELS]}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Interval</label>
                <p className="text-sm font-semibold text-gray-900">
                  {getIntervalDisplay()}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Warning Period</label>
                <p className="text-sm text-gray-900">
                  {schedule.daysBeforeDue || 0} days before due
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Auto Generate Tasks</label>
                <p className="text-sm text-gray-900">
                  {schedule.autoGenerate ? (
                    <span className="text-green-600 font-medium">✓ Yes</span>
                  ) : (
                    <span className="text-gray-500">✗ No</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Execution Tracking */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-3">Execution Tracking</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Last Executed</label>
                <p className="text-sm text-gray-900">
                  {schedule.lastExecutedAt ? new Date(schedule.lastExecutedAt).toLocaleDateString() : '-'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Last Executed Running Hours</label>
                <p className="text-sm text-gray-900">
                  {schedule.lastExecutedRunningHours?.toLocaleString() || '-'} hrs
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Next Due Date</label>
                <p className="text-sm text-gray-900">
                  {schedule.nextDueDate ? new Date(schedule.nextDueDate).toLocaleDateString() : '-'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Next Due Running Hours</label>
                <p className="text-sm text-gray-900">
                  {schedule.nextDueRunningHours?.toLocaleString() || '-'} hrs
                </p>
              </div>
            </div>
          </div>

          {/* Instructions */}
          {schedule.instructions && (
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">Instructions</h3>
              <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded border border-gray-200 whitespace-pre-wrap">
                {schedule.instructions}
              </p>
            </div>
          )}

          {/* System Information */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-3">System Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Schedule ID</label>
                <p className="text-sm text-gray-900 font-mono text-xs">{schedule.id}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Equipment Group ID</label>
                <p className="text-sm text-gray-900 font-mono text-xs">{schedule.equipmentGroupId}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Task Type ID</label>
                <p className="text-sm text-gray-900">{schedule.taskTypeId}</p>
              </div>
            </div>
          </div>

          {/* Required Spare Parts */}
          {schedule.requiredSpareParts && schedule.requiredSpareParts.length > 0 && (
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">
                Required Spare Parts ({schedule.requiredSpareParts.length})
              </h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Item</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Material Code</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Quantity</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Mandatory</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {schedule.requiredSpareParts.map((part, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {part.materialName || `Item #${part.materialItemId}`}
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-xs text-gray-600">{part.materialCode || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{part.quantityRequired}</td>
                        <td className="px-4 py-3 text-sm">
                          {part.isMandatory ? (
                            <span className="text-red-600 font-medium">✓ Yes</span>
                          ) : (
                            <span className="text-gray-500">✗ Optional</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{part.notes || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Checklist Items */}
          {schedule.checklistItemTemplates && schedule.checklistItemTemplates.length > 0 && (
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">
                Checklist Items ({schedule.checklistItemTemplates.length})
              </h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Order</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Reading</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Normal Range</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {schedule.checklistItemTemplates.map((item, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-700 font-medium">{item.sequenceOrder}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{item.checkpointDescription}</td>
                        <td className="px-4 py-3 text-sm">
                          {item.requiresReading ? (
                            <span className="text-blue-600 font-medium">✓ Required</span>
                          ) : (
                            <span className="text-gray-500">✗ No</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700">
                          {item.normalRangeMin !== undefined && item.normalRangeMax !== undefined ? (
                            <>
                              {item.normalRangeMin} - {item.normalRangeMax}
                              {item.unit && <span className="ml-1 text-gray-500">{item.unit}</span>}
                            </>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
