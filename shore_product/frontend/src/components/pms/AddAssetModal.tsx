import React, { useState, useEffect } from 'react';
import { X, Plus } from 'lucide-react';
import { equipmentAssetService } from '@/services/equipment-asset.service';
import { equipmentGroupService } from '@/services/equipment-group.service';
import type { CreateEquipmentAssetDto, EquipmentGroup } from '@/types/pms.types';
import { toast } from 'sonner';
import { AddGroupModal } from './AddGroupModal';

const CATEGORIES = [
  'ENGINE', 'GENERATOR', 'PUMP', 'COMPRESSOR', 'SEPARATOR', 'BOILER',
  'DECK_MACHINERY', 'NAVIGATION', 'SAFETY', 'ELECTRICAL', 'HVAC'
];

const CRITICALITY_LEVELS = ['CRITICAL', 'HIGH', 'NORMAL', 'LOW'];

const CREW_RANKS = [
  'MASTER', 'C/E', 'C/O', '2/E', '3/E', '4/E', 'E/O', '2/O', '3/O',
  'BOSUN', 'AB', 'OS', 'FITTER', 'OILER', 'COOK'
];

interface AddAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function AddAssetModal({ isOpen, onClose, onSuccess }: AddAssetModalProps) {
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<EquipmentGroup[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [formData, setFormData] = useState<CreateEquipmentAssetDto>({
    assetCode: '',
    assetName: '',
    category: 'ENGINE',
    criticality: 'NORMAL',
    manufacturer: '',
    model: '',
    serialNumber: '',
    location: '',
    notes: '',
    defaultExecutorRole: '',
    approverRole: ''
  });

  // Load groups
  useEffect(() => {
    if (isOpen) {
      loadGroups();
    }
  }, [isOpen]);

  const loadGroups = async () => {
    try {
      const data = await equipmentGroupService.getAll();
      setGroups(data);
    } catch (error) {
      console.error('Error loading groups:', error);
      toast.error('Failed to load equipment groups');
    }
  };

  const toggleGroup = (groupId: string) => {
    setSelectedGroupIds(prev =>
      prev.includes(groupId)
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.assetCode || !formData.assetName) {
      toast.error('Asset code and name are required');
      return;
    }

    try {
      setLoading(true);
      const createdAsset = await equipmentAssetService.create(formData);
      
      // Add asset to selected groups
      if (selectedGroupIds.length > 0) {
        await Promise.all(
          selectedGroupIds.map(groupId =>
            equipmentGroupService.addAsset(groupId, createdAsset.id)
          )
        );
      }
      
      toast.success('Equipment asset created successfully');
      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Error creating asset:', error);
      toast.error(error.response?.data?.message || 'Failed to create asset');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      assetCode: '',
      assetName: '',
      category: 'ENGINE',
      criticality: 'NORMAL',
      manufacturer: '',
      model: '',
      serialNumber: '',
      location: '',
      notes: '',
      defaultExecutorRole: '',
      approverRole: ''
    });
    setSelectedGroupIds([]);
    onClose();
  };

  const handleGroupCreated = async (newGroupId: string) => {
    // Reload groups and auto-select the new one
    await loadGroups();
    setSelectedGroupIds(prev => [...prev, newGroupId]);
    setShowAddGroupModal(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-modal p-4">
      <div className={`flex items-start justify-center gap-4 max-w-[1400px] w-full transition-all duration-300 ${showAddGroupModal ? '' : 'max-w-2xl'}`}>
        {/* Add Equipment Asset Modal */}
        <div className={`bg-white rounded-lg shadow-xl w-full max-h-[90vh] overflow-y-auto transition-all duration-300 ${showAddGroupModal ? 'max-w-[600px]' : 'max-w-2xl'}`}>
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <h2 className="text-xl font-semibold text-gray-900">Add Equipment Asset</h2>
            <button
              onClick={handleClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Asset Code */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Asset Code <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.assetCode}
                onChange={(e) => setFormData({ ...formData, assetCode: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e] focus:border-transparent"
                placeholder="ME-01"
                required
              />
            </div>

            {/* Asset Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Asset Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.assetName}
                onChange={(e) => setFormData({ ...formData, assetName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e] focus:border-transparent"
                placeholder="Main Engine"
                required
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e] focus:border-transparent"
                required
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Criticality */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Criticality
              </label>
              <select
                value={formData.criticality}
                onChange={(e) => setFormData({ ...formData, criticality: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e] focus:border-transparent"
              >
                {CRITICALITY_LEVELS.map(level => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
            </div>

            {/* Manufacturer */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Manufacturer
              </label>
              <input
                type="text"
                value={formData.manufacturer}
                onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e] focus:border-transparent"
                placeholder="MAN B&W"
              />
            </div>

            {/* Model */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Model
              </label>
              <input
                type="text"
                value={formData.model}
                onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e] focus:border-transparent"
                placeholder="6S50MC"
              />
            </div>

            {/* Serial Number */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Serial Number
              </label>
              <input
                type="text"
                value={formData.serialNumber}
                onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e] focus:border-transparent"
                placeholder="ME-2024-001"
              />
            </div>

            {/* Location */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Location
              </label>
              <input
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e] focus:border-transparent"
                placeholder="Engine Room"
              />
            </div>

            {/* Default Executor Role */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Default Executor Role
              </label>
              <select
                value={formData.defaultExecutorRole}
                onChange={(e) => setFormData({ ...formData, defaultExecutorRole: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e] focus:border-transparent"
              >
                <option value="">None (Manual Assignment)</option>
                {CREW_RANKS.map(rank => (
                  <option key={rank} value={rank}>{rank}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Auto-assign tasks to crew with this rank
              </p>
            </div>

            {/* Approver Role */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Approver Role
              </label>
              <select
                value={formData.approverRole}
                onChange={(e) => setFormData({ ...formData, approverRole: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e] focus:border-transparent"
              >
                <option value="">None</option>
                {CREW_RANKS.map(rank => (
                  <option key={rank} value={rank}>{rank}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Who needs to approve completed tasks
              </p>
            </div>
          </div>

          {/* Equipment Groups */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Equipment Groups
              </label>
              <button
                type="button"
                onClick={() => setShowAddGroupModal(true)}
                className="text-xs text-[#0b2545] hover:text-[#16375f] flex items-center gap-1 px-2 py-1 rounded hover:bg-[#eef2f7] transition-colors"
                title="Create new equipment group"
              >
                <Plus className="w-3 h-3" />
                Add Group
              </button>
            </div>
            <div className="border border-gray-300 rounded-lg p-3 max-h-40 overflow-y-auto">
              {groups.length === 0 ? (
                <p className="text-sm text-gray-500">No groups available</p>
              ) : (
                <div className="space-y-2">
                  {groups.map(group => (
                    <label key={group.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                      <input
                        type="checkbox"
                        checked={selectedGroupIds.includes(group.id)}
                        onChange={() => toggleGroup(group.id)}
                        className="w-4 h-4 text-[#0b2545] border-gray-300 rounded focus:ring-[#1b4c7e]"
                      />
                      <span className="text-sm text-gray-900">{group.groupName}</span>
                      <span className="text-xs text-gray-500">({group.groupCode})</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Select which equipment groups this asset belongs to
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e] focus:border-transparent"
              placeholder="Additional information about this equipment..."
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#0b2545] text-white rounded-lg hover:bg-[#16375f] disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Asset'}
            </button>
          </div>
        </form>
      </div>
      
      {/* Add Group Modal - Side by side */}
      {showAddGroupModal && (
        <div className="bg-white rounded-lg shadow-xl w-full max-w-[600px] max-h-[90vh] overflow-hidden">
          <AddGroupModal 
            isOpen={showAddGroupModal}
            onClose={() => setShowAddGroupModal(false)}
            onSuccess={handleGroupCreated}
            embedded={true}
          />
        </div>
      )}
      </div>
    </div>
  );
}

