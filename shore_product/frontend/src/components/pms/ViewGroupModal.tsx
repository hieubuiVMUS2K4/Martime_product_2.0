import { X } from 'lucide-react';
import type { EquipmentGroup } from '@/types/pms.types';

interface ViewGroupModalProps {
  isOpen: boolean;
  group: EquipmentGroup | null;
  onClose: () => void;
}

const DEPARTMENT_LABELS: Record<string, string> = {
  'ENGINE': 'ENGINE - Engine Department',
  'DECK': 'DECK - Deck Department',
  'NAVIGATION': 'NAVIGATION - Navigation',
  'ELECTRICAL': 'ELECTRICAL - Electrical',
  'MANAGEMENT': 'MANAGEMENT - Management',
  'CATERING': 'CATERING - Catering'
};

export function ViewGroupModal({ isOpen, group, onClose }: ViewGroupModalProps) {
  if (!isOpen || !group) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-modal p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Equipment Group Details</h2>
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
                <label className="block text-sm font-medium text-gray-600 mb-1">Group Code</label>
                <p className="text-sm text-gray-900">{group.groupCode}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Group Name</label>
                <p className="text-sm text-gray-900">{group.groupName}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Category</label>
                <p className="text-sm text-gray-900">{group.category || '-'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Status</label>
                <span className={`inline-flex items-center px-3 py-1 rounded text-sm font-medium ${
                  group.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                }`}>
                  {group.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>

          {/* Department & Assignment */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-3">Department & Assignment</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Department</label>
                <p className="text-sm text-gray-900">
                  {group.department ? DEPARTMENT_LABELS[group.department] || group.department : '-'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Person In Charge (PIC)</label>
                <p className="text-sm text-gray-900">
                  {group.picRole || group.picCrewId || '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Description */}
          {group.description && (
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">Description</label>
              <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded border border-gray-200 whitespace-pre-wrap">
                {group.description}
              </p>
            </div>
          )}

          {/* IDs & References */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-3">System Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Group ID</label>
                <p className="text-sm text-gray-900 font-mono text-xs">{group.id}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">PIC Crew ID</label>
                <p className="text-sm text-gray-900">{group.picCrewId || '-'}</p>
              </div>
            </div>
          </div>

          {/* Equipment Assets */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-3">
              Equipment Assets {group.memberCount !== undefined && `(${group.memberCount})`}
            </h3>
            {group.members && group.members.length > 0 ? (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Code</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Location</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Running Hours</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {group.members.map((asset) => (
                      <tr key={asset.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{asset.assetCode}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">{asset.assetName}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{asset.category || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{asset.location || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{asset.currentRunningHours?.toLocaleString() || '0'} hrs</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 text-xs rounded ${
                            asset.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {asset.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm text-gray-500">No equipment assets in this group</p>
              </div>
            )}
          </div>
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
