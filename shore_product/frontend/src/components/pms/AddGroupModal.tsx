/**
 * Reusable Add Equipment Group Modal Component
 * Can be used standalone or embedded in other modals
 */

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { equipmentGroupService } from '@/services/equipment-group.service';
import { maritimeService } from '@/services/maritime.service';
import { toast } from 'sonner';

interface AddGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (newGroupId: string) => void;
  embedded?: boolean; // If true, renders as inline panel instead of full modal
}

interface GroupFormData {
  groupCode: string;
  groupName: string;
  category: string;
  department: string;
  picRole: string;
  picCrewId: string;
  description: string;
  isActive: boolean;
}

const DEPARTMENTS = [
  { value: 'ENGINE', label: 'ENGINE - Bộ phận Máy' },
  { value: 'DECK', label: 'DECK - Bộ phận Boong' },
  { value: 'NAVIGATION', label: 'NAVIGATION - Hàng hải' },
  { value: 'ELECTRICAL', label: 'ELECTRICAL - Điện' },
  { value: 'MANAGEMENT', label: 'MANAGEMENT - Quản lý' },
  { value: 'CATERING', label: 'CATERING - Ăn uống' },
];

const CATEGORIES = [
  'ENGINE',
  'GENERATOR',
  'PUMP',
  'COMPRESSOR',
  'BOILER',
  'DECK_MACHINERY',
  'SAFETY_EQUIPMENT',
  'NAVIGATION_EQUIPMENT',
  'FIRE_FIGHTING',
  'LIFE_SAVING',
  'ELECTRICAL',
  'HVAC',
  'OTHER'
];

const PIC_ROLES = [
  { value: 'MASTER', label: 'MASTER - Thuyền trưởng', departments: ['MANAGEMENT', 'DECK', 'NAVIGATION'] },
  { value: 'C/E', label: 'C/E - Máy trưởng', departments: ['ENGINE', 'MANAGEMENT'] },
  { value: 'C/O', label: 'C/O - Đại phó', departments: ['DECK', 'NAVIGATION', 'MANAGEMENT'] },
  { value: '2/E', label: '2/E - Máy hai', departments: ['ENGINE'] },
  { value: '3/E', label: '3/E - Máy ba', departments: ['ENGINE'] },
  { value: '4/E', label: '4/E - Máy bốn', departments: ['ENGINE'] },
  { value: 'E/O', label: 'E/O - Sĩ quan điện', departments: ['ELECTRICAL', 'ENGINE'] },
  { value: '2/O', label: '2/O - Sĩ quan hai', departments: ['DECK', 'NAVIGATION'] },
  { value: '3/O', label: '3/O - Sĩ quan ba', departments: ['DECK', 'NAVIGATION'] },
  { value: 'BOSUN', label: 'BOSUN - Thủy thủ trưởng', departments: ['DECK'] },
  { value: 'FITTER', label: 'FITTER - Thợ cơ khí', departments: ['ENGINE'] },
  { value: 'OILER', label: 'OILER - Thợ dầu', departments: ['ENGINE'] },
  { value: 'AB', label: 'AB - Thủy thủ thành thạo', departments: ['DECK'] },
  { value: 'OS', label: 'OS - Thủy thủ phổ thông', departments: ['DECK'] },
  { value: 'COOK', label: 'COOK - Đầu bếp', departments: ['CATERING'] },
];

export function AddGroupModal({ isOpen, onClose, onSuccess, embedded = false }: AddGroupModalProps) {
  const [loading, setLoading] = useState(false);
  const [crewList, setCrewList] = useState<any[]>([]);
  const [formData, setFormData] = useState<GroupFormData>({
    groupCode: '',
    groupName: '',
    category: '',
    department: '',
    picRole: '',
    picCrewId: '',
    description: '',
    isActive: true,
  });

  useEffect(() => {
    if (isOpen) {
      loadCrew();
      // Reset form when opening
      setFormData({
        groupCode: '',
        groupName: '',
        category: '',
        department: '',
        picRole: '',
        picCrewId: '',
        description: '',
        isActive: true,
      });
    }
  }, [isOpen]);

  const loadCrew = async () => {
    try {
      const crewData = await maritimeService.crew.getAll({ pageSize: 100, isOnboard: true });
      setCrewList(crewData.data || []);
    } catch (err) {
      console.error('Error loading crew:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.groupCode || !formData.groupName) {
      toast.error('Group Code and Name are required');
      return;
    }

    try {
      setLoading(true);
      const result = await equipmentGroupService.create(formData);
      toast.success('Group created successfully');
      onSuccess?.(result.id);
      onClose();
    } catch (err: any) {
      console.error('Error saving group:', err);
      toast.error(err.message || 'Failed to save group');
    } finally {
      setLoading(false);
    }
  };

  // Filter crew by department
  const filteredCrew = formData.department 
    ? crewList.filter(c => c.department === formData.department)
    : crewList;

  // Filter PIC roles by department
  const filteredPicRoles = formData.department
    ? PIC_ROLES.filter(role => role.departments.includes(formData.department))
    : PIC_ROLES;

  if (!isOpen) return null;

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Group Code */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Group Code <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.groupCode}
          onChange={(e) => setFormData({ ...formData, groupCode: e.target.value.toUpperCase() })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e] focus:border-transparent text-sm"
          placeholder="e.g., ENG-ME, DECK-CARGO"
          required
        />
      </div>

      {/* Group Name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Group Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          value={formData.groupName}
          onChange={(e) => setFormData({ ...formData, groupName: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e] focus:border-transparent text-sm"
          placeholder="e.g., Main Engine, All Generators"
          required
        />
      </div>

      {/* Category */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Category
        </label>
        <select
          value={formData.category}
          onChange={(e) => setFormData({ ...formData, category: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e] focus:border-transparent text-sm"
        >
          <option value="">Select category...</option>
          {CATEGORIES.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
      </div>

      {/* Department */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Department
        </label>
        <select
          value={formData.department}
          onChange={(e) => setFormData({ ...formData, department: e.target.value, picRole: '', picCrewId: '' })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e] focus:border-transparent text-sm"
        >
          <option value="">Select department...</option>
          {DEPARTMENTS.map(dept => (
            <option key={dept.value} value={dept.value}>{dept.label}</option>
          ))}
        </select>
      </div>

      {/* PIC Role */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          PIC Role (Person In Charge)
        </label>
        <select
          value={formData.picRole}
          onChange={(e) => setFormData({ ...formData, picRole: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e] focus:border-transparent text-sm"
          disabled={!formData.department}
        >
          <option value="">Select PIC role...</option>
          {filteredPicRoles.map(role => (
            <option key={role.value} value={role.value}>{role.label}</option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          {formData.department 
            ? `Showing roles for ${formData.department} department`
            : 'Select a department first to filter roles'}
        </p>
      </div>

      {/* PIC Crew ID */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          PIC Crew (Specific Person)
        </label>
        <select
          value={formData.picCrewId}
          onChange={(e) => setFormData({ ...formData, picCrewId: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e] focus:border-transparent text-sm"
          disabled={!formData.department}
        >
          <option value="">Select crew member...</option>
          {filteredCrew.map(crew => (
            <option key={crew.crewId} value={crew.crewId}>
              {crew.fullName} ({typeof crew.rank === 'object' ? crew.rank?.rankName : crew.rank}) - {crew.crewId}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          {formData.department 
            ? `Showing crew from ${formData.department} department`
            : 'Select a department first to filter crew'}
        </p>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e] focus:border-transparent text-sm"
          rows={2}
          placeholder="Optional description..."
        />
      </div>

      {/* Is Active */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="isActive"
          checked={formData.isActive}
          onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
          className="w-4 h-4 text-[#0b2545] rounded focus:ring-2 focus:ring-[#1b4c7e]"
        />
        <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
          Active
        </label>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-[#0b2545] text-white rounded-lg hover:bg-[#16375f] transition-colors disabled:opacity-50 text-sm"
        >
          {loading ? 'Creating...' : 'Create Group'}
        </button>
      </div>
    </form>
  );

  // Embedded mode: render as panel (no modal wrapper)
  if (embedded) {
    return (
      <div className="h-full flex flex-col bg-white">
        {/* Sticky Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm z-10">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Add Equipment Group</h3>
            <p className="text-xs text-gray-500 mt-1">Create a new equipment group to organize assets</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Close panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {/* Scrollable Form Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {formContent}
        </div>
      </div>
    );
  }

  // Full modal mode
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-modal p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">
            Add Equipment Group
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          {formContent}
        </div>
      </div>
    </div>
  );
}

