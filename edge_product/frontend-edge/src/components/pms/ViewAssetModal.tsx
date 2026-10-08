import { EquipmentAsset } from '../../types/pms.types';
import { X } from 'lucide-react';

interface ViewAssetModalProps {
  isOpen: boolean;
  asset: EquipmentAsset | null;
  onClose: () => void;
}

export default function ViewAssetModal({ isOpen, asset, onClose }: ViewAssetModalProps) {

  if (!isOpen || !asset) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Equipment Asset Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Basic Information */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-3">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Asset Code</label>
                <p className="text-sm text-gray-900">{asset.assetCode}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Asset Name</label>
                <p className="text-sm text-gray-900">{asset.assetName}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Category</label>
                <p className="text-sm text-gray-900">{asset.category || '-'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Location</label>
                <p className="text-sm text-gray-900">{asset.location || '-'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Status</label>
                <span className={`inline-flex px-2 py-1 text-xs rounded ${
                  asset.status === 'ACTIVE' ? 'bg-green-100 text-green-800' :
                  asset.status === 'STANDBY' ? 'bg-blue-100 text-blue-800' :
                  asset.status === 'UNDER_MAINTENANCE' ? 'bg-yellow-100 text-yellow-800' :
                  asset.status === 'DECOMMISSIONED' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {asset.status}
                </span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Active</label>
                <span className={`inline-flex px-2 py-1 text-xs rounded ${
                  asset.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                }`}>
                  {asset.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>

          {/* Technical Specifications */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-3">Technical Specifications</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Manufacturer</label>
                <p className="text-sm text-gray-900">{asset.manufacturer || '-'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Model</label>
                <p className="text-sm text-gray-900">{asset.model || '-'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Serial Number</label>
                <p className="text-sm text-gray-900">{asset.serialNumber || '-'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Criticality</label>
                <span className={`inline-flex px-2 py-1 text-xs rounded ${
                  asset.criticality === 'CRITICAL' ? 'bg-red-100 text-red-800' :
                  asset.criticality === 'HIGH' ? 'bg-orange-100 text-orange-800' :
                  asset.criticality === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {asset.criticality}
                </span>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Installation Date</label>
                <p className="text-sm text-gray-900">
                  {asset.installationDate ? new Date(asset.installationDate).toLocaleDateString() : '-'}
                </p>
              </div>
            </div>
            {asset.technicalSpecs && (
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-600 mb-1">Technical Specs</label>
                <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded border border-gray-200 whitespace-pre-wrap">{asset.technicalSpecs}</p>
              </div>
            )}
          </div>

          {/* Running Hours */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-3">Running Hours</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Current Running Hours</label>
                <p className="text-sm text-gray-900 font-semibold">{asset.currentRunningHours?.toLocaleString() || '0'} hrs</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Last Update</label>
                <p className="text-sm text-gray-900">
                  {asset.lastRunningHoursUpdate ? new Date(asset.lastRunningHoursUpdate).toLocaleString() : '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Assignment */}
          <div>
            <h3 className="text-base font-semibold text-gray-900 mb-3">Assignment</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Default Executor Role</label>
                <p className="text-sm text-gray-900">{asset.defaultExecutorRole || '-'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Approver Role</label>
                <p className="text-sm text-gray-900">{asset.approverRole || '-'}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Equipment Group ID</label>
                <p className="text-sm text-gray-900">{asset.equipmentGroupId || '-'}</p>
              </div>
            </div>
          </div>

          {/* Notes */}
          {asset.notes && (
            <div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">Notes</h3>
              <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded border border-gray-200 whitespace-pre-wrap">{asset.notes}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
