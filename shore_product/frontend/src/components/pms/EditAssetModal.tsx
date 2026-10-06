import { useState, useEffect } from 'react';
import { X, Save } from 'lucide-react';
import { equipmentAssetService } from '@/services/equipment-asset.service';
import { equipmentGroupService } from '@/services/equipment-group.service';
import type { EquipmentAsset } from '@/types/pms.types';
import { toast } from 'sonner';

interface EditAssetModalProps {
  isOpen: boolean;
  asset: EquipmentAsset | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface GroupMembership {
  id: string;
  groupCode: string;
  groupName: string;
  category?: string;
}

const CATEGORIES = [
  'ENGINE',
  'GENERATOR',
  'PUMP',
  'COMPRESSOR',
  'SEPARATOR',
  'BOILER',
  'DECK_MACHINERY',
  'NAVIGATION',
  'SAFETY',
  'ELECTRICAL',
  'HVAC'
];

const CRITICALITY_LEVELS = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'];

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active', description: 'In operation' },
  { value: 'STANDBY', label: 'Standby', description: 'Spare/backup ready' },
  { value: 'UNDER_MAINTENANCE', label: 'Under Maintenance', description: 'Being serviced' },
  { value: 'DECOMMISSIONED', label: 'Decommissioned', description: 'Retired (records kept)' },
  { value: 'IN_STORAGE', label: 'In Storage', description: 'Stored/not installed' }
];

export function EditAssetModal({ isOpen, asset, onClose, onSuccess }: EditAssetModalProps) {
  const [formData, setFormData] = useState({
    assetName: '',
    category: '',
    manufacturer: '',
    model: '',
    serialNumber: '',
    location: '',
    criticality: 'NORMAL',
    status: 'ACTIVE',
    technicalSpecs: '',
    notes: '',
    currentRunningHours: 0
  });
  const [saving, setSaving] = useState(false);
  const [groups, setGroups] = useState<GroupMembership[]>([]);
  const [allGroups, setAllGroups] = useState<any[]>([]);
  const [showAddGroups, setShowAddGroups] = useState(false);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(false);

  useEffect(() => {
    if (asset) {
      setFormData({
        assetName: asset.assetName || '',
        category: asset.category || '',
        manufacturer: asset.manufacturer || '',
        model: asset.model || '',
        serialNumber: asset.serialNumber || '',
        location: asset.location || '',
        criticality: asset.criticality || 'NORMAL',
        status: asset.status || 'ACTIVE',
        technicalSpecs: asset.technicalSpecs || '',
        notes: asset.notes || '',
        currentRunningHours: asset.currentRunningHours || 0
      });
      loadAssetGroups();
      loadAllGroups();
    }
  }, [asset]);

  const loadAssetGroups = async () => {
    if (!asset) return;
    
    try {
      setLoadingGroups(true);
      const response = await equipmentGroupService.getAssetGroups(asset.id);
      setGroups(response);
    } catch (error) {
      console.error('Error loading asset groups:', error);
    } finally {
      setLoadingGroups(false);
    }
  };

  const loadAllGroups = async () => {
    try {
      const response = await equipmentGroupService.getAll();
      setAllGroups(response);
    } catch (error) {
      console.error('Error loading all groups:', error);
    }
  };

  const handleAddToGroups = async () => {
    if (!asset || selectedGroupIds.length === 0) return;
    
    try {
      setLoadingGroups(true);
      await Promise.all(
        selectedGroupIds.map(groupId => 
          equipmentGroupService.addAsset(groupId, asset.id)
        )
      );
      
      await loadAssetGroups();
      setShowAddGroups(false);
      setSelectedGroupIds([]);
      toast.success('Added to groups successfully');
    } catch (error) {
      console.error('Error adding asset to groups:', error);
      toast.error('Failed to add asset to groups');
    } finally {
      setLoadingGroups(false);
    }
  };

  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroupIds(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const availableGroups = allGroups.filter(
    g => !groups.some(ag => ag.id === g.id)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset) return;

    try {
      setSaving(true);
      await equipmentAssetService.update(asset.id, formData);
      toast.success('Equipment updated successfully');
      onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Error updating equipment:', error);
      toast.error(error.response?.data?.error || 'Failed to update equipment');
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800 border-green-300';
      case 'STANDBY': return 'bg-[#dce9f8] text-primary border-accent/40';
      case 'UNDER_MAINTENANCE': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'DECOMMISSIONED': return 'bg-gray-100 text-gray-800 border-gray-300';
      case 'IN_STORAGE': return 'bg-purple-100 text-purple-800 border-purple-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  if (!isOpen || !asset) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Edit Equipment Asset</h2>
            <p className="text-gray-600 text-sm mt-1">Asset Code: {asset.assetCode}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-900">Basic Information</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Asset Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="assetName"
                    value={formData.assetName}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e] focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e]"
                  >
                    <option value="">Select Category</option>
                    {CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Manufacturer
                  </label>
                  <input
                    type="text"
                    name="manufacturer"
                    value={formData.manufacturer}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Model
                  </label>
                  <input
                    type="text"
                    name="model"
                    value={formData.model}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Serial Number
                  </label>
                  <input
                    type="text"
                    name="serialNumber"
                    value={formData.serialNumber}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Location
                  </label>
                  <input
                    type="text"
                    name="location"
                    value={formData.location}
                    onChange={handleChange}
                    placeholder="e.g., Engine Room, Deck"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e]"
                  />
                </div>
              </div>
            </div>

            {/* Status & Criticality */}
            <div className="space-y-4 border-t pt-4">
              <h3 className="text-lg font-semibold text-gray-900">Status & Priority</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Equipment Status <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e]"
                  >
                    {STATUS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label} - {option.description}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getStatusBadgeColor(formData.status)}`}>
                      {STATUS_OPTIONS.find(s => s.value === formData.status)?.label}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Criticality Level <span className="text-red-500">*</span>
                  </label>
                  <select
                    name="criticality"
                    value={formData.criticality}
                    onChange={handleChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e]"
                  >
                    {CRITICALITY_LEVELS.map(level => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Additional Information */}
            <div className="space-y-4 border-t pt-4">
              <h3 className="text-lg font-semibold text-gray-900">Additional Information</h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Technical Specifications
                </label>
                <textarea
                  name="technicalSpecs"
                  value={formData.technicalSpecs}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Enter technical specifications (e.g., power rating, capacity, etc.)"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Additional notes or remarks"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e]"
                />
              </div>
            </div>

            {/* Running Hours Management */}
            <div className="space-y-4 border-t pt-4">
              <h3 className="text-lg font-semibold text-gray-900">Running Hours</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Current Running Hours
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      name="currentRunningHours"
                      value={formData.currentRunningHours}
                      onChange={handleChange}
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e]"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">hrs</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Update running hours based on engine counter or telemetry
                  </p>
                </div>

                {asset.lastRunningHoursUpdate && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Updated
                    </label>
                    <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                      <p className="text-sm text-gray-900">
                        {new Date(asset.lastRunningHoursUpdate).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}

                {asset.installationDate && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Installation Date
                    </label>
                    <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                      <p className="text-sm text-gray-900">
                        {new Date(asset.installationDate).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Equipment Groups */}
            <div className="space-y-4 border-t pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Equipment Groups</h3>
                {!showAddGroups && (
                  <button
                    type="button"
                    onClick={() => setShowAddGroups(true)}
                    className="text-sm text-[#0b2545] hover:text-[#16375f] font-medium flex items-center gap-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Add to Groups
                  </button>
                )}
              </div>

              {loadingGroups ? (
                <p className="text-sm text-gray-500">Loading groups...</p>
              ) : groups.length > 0 ? (
                <div className="space-y-2">
                  {groups.map((group) => (
                    <div
                      key={group.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <div>
                        <p className="text-sm font-medium text-gray-900">{group.groupName}</p>
                        <p className="text-xs text-gray-500">{group.groupCode}</p>
                      </div>
                      {group.category && (
                        <span className="text-xs px-2 py-1 bg-[#dce9f8] text-primary rounded">
                          {group.category}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">This asset is not assigned to any groups</p>
                </div>
              )}

              {/* Add to Groups UI */}
              {showAddGroups && (
                <div className="p-4 border border-[#d6dee8] bg-[#eef2f7] rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-gray-900">Select Groups</h4>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddGroups(false);
                        setSelectedGroupIds([]);
                      }}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                  
                  {availableGroups.length === 0 ? (
                    <p className="text-sm text-gray-500">No groups available</p>
                  ) : (
                    <>
                      <div className="space-y-2 max-h-48 overflow-y-auto mb-3">
                        {availableGroups.map(group => (
                          <label
                            key={group.id}
                            className="flex items-center gap-2 p-2 hover:bg-[#dce9f8] rounded cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedGroupIds.includes(group.id)}
                              onChange={() => toggleGroupSelection(group.id)}
                              className="rounded text-[#0b2545]"
                            />
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">{group.groupName}</p>
                              <p className="text-xs text-gray-500">{group.groupCode}</p>
                            </div>
                            {group.category && (
                              <span className="text-xs px-2 py-1 bg-white text-gray-700 rounded">
                                {group.category}
                              </span>
                            )}
                          </label>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={handleAddToGroups}
                        disabled={selectedGroupIds.length === 0 || loadingGroups}
                        className="w-full px-3 py-2 bg-[#0b2545] text-white rounded-lg hover:bg-[#16375f] disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        {loadingGroups ? 'Adding...' : `Add to ${selectedGroupIds.length} Group(s)`}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-[#0b2545] text-white rounded-lg hover:bg-[#16375f] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

