import { PermissionGate } from '@/components/auth/PermissionGate'
import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, ClipboardList, Search } from 'lucide-react';
import { maintenanceScheduleService } from '@/services/maintenance-schedule.service';
import { equipmentGroupService } from '@/services/equipment-group.service';
import { equipmentAssetService } from '@/services/equipment-asset.service';
import { materialService } from '@/services/materialService';
import type { CreateMaintenanceScheduleDto, CreateScheduleSparePartDto, EquipmentGroup, ChecklistItemTemplateDto, EquipmentAsset } from '@/types/pms.types';
import type { MaterialItem } from '@/types/maritime.types';
import { toast } from 'sonner';

interface AddScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const INTERVAL_TYPES = ['CALENDAR', 'RUNNING_HOURS', 'HYBRID'];
const PRIORITY_LEVELS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export function AddScheduleModal({ isOpen, onClose, onSuccess }: AddScheduleModalProps) {
  const [loading, setLoading] = useState(false);
  const [groups, setGroups] = useState<EquipmentGroup[]>([]);
  const [allAssets, setAllAssets] = useState<EquipmentAsset[]>([]);
  const [materialItems, setMaterialItems] = useState<MaterialItem[]>([]);
  const [isAssetMode, setIsAssetMode] = useState(false);
  const [assetSearch, setAssetSearch] = useState('');
  const [showAssetDropdown, setShowAssetDropdown] = useState(false);
  const [formData, setFormData] = useState<CreateMaintenanceScheduleDto>({
    scheduleCode: '',
    equipmentGroupId: '',
    taskTypeId: 1,
    scheduleName: '',
    intervalType: 'CALENDAR',
    intervalDays: 30,
    daysBeforeDue: 7,
    priority: 'MEDIUM',
    autoGenerate: true,
    requiredSpareParts: [],
    checklistItemTemplates: []
  });

  // Selected asset display info
  const selectedAsset = allAssets.find(a => a.id === formData.equipmentAssetId);

  // Filtered asset list for search dropdown
  const filteredAssets = allAssets.filter(a => {
    if (!assetSearch) return true;
    const s = assetSearch.toLowerCase();
    return a.assetCode.toLowerCase().includes(s) || a.assetName.toLowerCase().includes(s);
  }).slice(0, 20);

  useEffect(() => {
    if (isOpen) {
      loadGroups();
      loadAssets();
      loadMaterialItems();
    }
  }, [isOpen]);

  const loadGroups = async () => {
    try {
      const data = await equipmentGroupService.getAll();
      setGroups(data);
    } catch (error) {
      console.error('Error loading groups:', error);
    }
  };

  const loadAssets = async () => {
    try {
      const data = await equipmentAssetService.getAll();
      setAllAssets(data);
    } catch (error) {
      console.error('Error loading assets:', error);
    }
  };

  const loadMaterialItems = async () => {
    try {
      const data = await materialService.getItems();
      setMaterialItems(data);
    } catch (error) {
      console.error('Error loading material items:', error);
      toast.error('Failed to load material items');
    }
  };

  const handleAddSparePart = () => {
    setFormData({
      ...formData,
      requiredSpareParts: [
        ...(formData.requiredSpareParts || []),
        { materialItemId: '', quantityRequired: 1, isMandatory: true }
      ]
    });
  };

  const handleRemoveSparePart = (index: number) => {
    const updated = [...(formData.requiredSpareParts || [])];
    updated.splice(index, 1);
    setFormData({ ...formData, requiredSpareParts: updated });
  };

  const handleSparePartChange = (index: number, field: keyof CreateScheduleSparePartDto, value: any) => {
    const updated = [...(formData.requiredSpareParts || [])];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, requiredSpareParts: updated });
  };

  const handleAddChecklistItem = () => {
    const newOrder = (formData.checklistItemTemplates?.length || 0) + 1;
    setFormData({
      ...formData,
      checklistItemTemplates: [
        ...(formData.checklistItemTemplates || []),
        { 
          sequenceOrder: newOrder, 
          checkpointDescription: '',
          requiresReading: false
        }
      ]
    });
  };

  const handleRemoveChecklistItem = (index: number) => {
    const updated = [...(formData.checklistItemTemplates || [])];
    updated.splice(index, 1);
    // Reorder sequence
    updated.forEach((item, idx) => {
      item.sequenceOrder = idx + 1;
    });
    setFormData({ ...formData, checklistItemTemplates: updated });
  };

  const handleChecklistItemChange = (index: number, field: keyof ChecklistItemTemplateDto, value: any) => {
    const updated = [...(formData.checklistItemTemplates || [])];
    updated[index] = { ...updated[index], [field]: value };
    setFormData({ ...formData, checklistItemTemplates: updated });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.scheduleCode || !formData.scheduleName) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (isAssetMode) {
      if (!formData.equipmentAssetId) {
        toast.error('Vui lòng chọn thiết bị');
        return;
      }
    } else {
      if (!formData.equipmentGroupId) {
        toast.error('Vui lòng chọn nhóm thiết bị');
        return;
      }
      const selectedGroup = groups.find(g => g.id === formData.equipmentGroupId);
      if (selectedGroup && (selectedGroup.memberCount === 0 || !selectedGroup.memberCount)) {
        toast.error('Nhóm thiết bị chưa có tài sản. Vui lòng thêm thiết bị trước.');
        return;
      }
    }

    if (formData.intervalType === 'CALENDAR' && !formData.intervalDays) {
      toast.error('Please specify interval days for calendar-based scheduling');
      return;
    }

    if (formData.intervalType === 'RUNNING_HOURS' && !formData.intervalHours) {
      toast.error('Please specify interval hours for running hours-based scheduling');
      return;
    }

    try {
      setLoading(true);
      const submitData = { ...formData };
      // Ensure mutual exclusion
      if (isAssetMode) {
        delete submitData.equipmentGroupId;
      } else {
        delete submitData.equipmentAssetId;
      }
      await maintenanceScheduleService.create(submitData);
      toast.success('Maintenance schedule created successfully');
      onSuccess();
      handleClose();
    } catch (error: any) {
      console.error('Error creating schedule:', error);
      const errorMessage = error.response?.data?.error || error.response?.data?.message || 'Failed to create schedule';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({
      scheduleCode: '',
      equipmentGroupId: '',
      equipmentAssetId: undefined,
      taskTypeId: 1,
      scheduleName: '',
      intervalType: 'CALENDAR',
      intervalDays: 30,
      daysBeforeDue: 7,
      priority: 'MEDIUM',
      autoGenerate: true,
      requiredSpareParts: []
    });
    setIsAssetMode(false);
    setAssetSearch('');
    setShowAssetDropdown(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Add Maintenance Schedule</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Basic Info */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Schedule Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.scheduleCode}
                  onChange={(e) => setFormData({ ...formData, scheduleCode: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="SCH-ME-001"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Đối tượng bảo trì <span className="text-red-500">*</span>
                </label>
                {/* Toggle Switch */}
                <div className="flex items-center gap-3 mb-3 p-2 bg-gray-50 rounded-lg border border-gray-200">
                  <span className={`text-sm font-medium ${!isAssetMode ? 'text-blue-700' : 'text-gray-400'}`}>Nhóm thiết bị</span>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAssetMode(!isAssetMode);
                      setFormData({ ...formData, equipmentGroupId: '', equipmentAssetId: undefined });
                      setAssetSearch('');
                      setShowAssetDropdown(false);
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${isAssetMode ? 'bg-teal-600' : 'bg-blue-600'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isAssetMode ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                  <span className={`text-sm font-medium ${isAssetMode ? 'text-teal-700' : 'text-gray-400'}`}>Thiết bị đơn lẻ</span>
                </div>

                {/* Group mode */}
                {!isAssetMode && (
                  <>
                    <select
                      value={formData.equipmentGroupId || ''}
                      onChange={(e) => setFormData({ ...formData, equipmentGroupId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      required={!isAssetMode}
                    >
                      <option value="">Chọn nhóm thiết bị</option>
                      {groups.map(group => (
                        <option key={group.id} value={group.id}>
                          {group.groupCode} - {group.groupName} ({group.memberCount || 0} thiết bị)
                        </option>
                      ))}
                    </select>
                    {formData.equipmentGroupId && groups.find(g => g.id === formData.equipmentGroupId)?.memberCount === 0 && (
                      <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-sm font-medium text-red-800">⛔ Nhóm chưa có thiết bị</p>
                        <p className="text-xs text-red-700 mt-1">Vui lòng thêm thiết bị vào nhóm trước.</p>
                      </div>
                    )}
                  </>
                )}

                {/* Asset mode — searchable dropdown */}
                {isAssetMode && (
                  <div className="relative">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={selectedAsset ? `${selectedAsset.assetCode} - ${selectedAsset.assetName}` : assetSearch}
                        onChange={(e) => {
                          setAssetSearch(e.target.value);
                          setFormData({ ...formData, equipmentAssetId: undefined });
                          setShowAssetDropdown(true);
                        }}
                        onFocus={() => {
                          if (!formData.equipmentAssetId) setShowAssetDropdown(true);
                        }}
                        placeholder="Tìm theo mã hoặc tên thiết bị..."
                        className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                      />
                      {formData.equipmentAssetId && (
                        <button
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, equipmentAssetId: undefined });
                            setAssetSearch('');
                            setShowAssetDropdown(true);
                          }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {showAssetDropdown && !formData.equipmentAssetId && (
                      <div className="absolute z-20 mt-1 w-full max-h-48 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg">
                        {filteredAssets.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-gray-500">Không tìm thấy thiết bị</div>
                        ) : (
                          filteredAssets.map(asset => (
                            <button
                              key={asset.id}
                              type="button"
                              onClick={() => {
                                setFormData({ ...formData, equipmentAssetId: asset.id });
                                setAssetSearch('');
                                setShowAssetDropdown(false);
                              }}
                              className="w-full text-left px-4 py-2 hover:bg-teal-50 text-sm border-b border-gray-50 last:border-b-0"
                            >
                              <span className="font-medium text-gray-900">{asset.assetCode}</span>
                              <span className="text-gray-500 ml-2">{asset.assetName}</span>
                              {asset.currentRunningHours != null && (
                                <span className="text-xs text-gray-400 ml-2">({asset.currentRunningHours} hrs)</span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                    {selectedAsset && (
                      <div className="mt-2 p-2 bg-teal-50 border border-teal-200 rounded-lg text-xs text-teal-800">
                        <span className="font-medium">{selectedAsset.assetCode}</span> — {selectedAsset.assetName}
                        {selectedAsset.category && <span className="ml-2 text-teal-600">({selectedAsset.category})</span>}
                        {selectedAsset.currentRunningHours != null && <span className="ml-2">• {selectedAsset.currentRunningHours} hrs</span>}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Schedule Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.scheduleName}
                  onChange={(e) => setFormData({ ...formData, scheduleName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Monthly Oil Filter Replacement"
                  required
                />
              </div>
            </div>
          </div>

          {/* Interval Configuration */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Interval Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Interval Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.intervalType}
                  onChange={(e) => setFormData({ ...formData, intervalType: e.target.value as any })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {INTERVAL_TYPES.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>

              {(formData.intervalType === 'CALENDAR' || formData.intervalType === 'HYBRID') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Interval (Days)
                  </label>
                  <input
                    type="number"
                    value={formData.intervalDays || ''}
                    onChange={(e) => setFormData({ ...formData, intervalDays: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="30"
                    min="1"
                  />
                </div>
              )}

              {(formData.intervalType === 'RUNNING_HOURS' || formData.intervalType === 'HYBRID') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Interval (Running Hours)
                  </label>
                  <input
                    type="number"
                    value={formData.intervalHours || ''}
                    onChange={(e) => setFormData({ ...formData, intervalHours: e.target.value ? parseInt(e.target.value) : undefined })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="500"
                    min="1"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Days Before Due (Auto-generate)
                </label>
                <input
                  type="number"
                  value={formData.daysBeforeDue}
                  onChange={(e) => setFormData({ ...formData, daysBeforeDue: e.target.value ? parseInt(e.target.value) : 7 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  min="1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Priority
                </label>
                <select
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {PRIORITY_LEVELS.map(level => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.autoGenerate}
                  onChange={(e) => setFormData({ ...formData, autoGenerate: e.target.checked })}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label className="ml-2 text-sm text-gray-700">
                  Auto-generate tasks
                </label>
              </div>
            </div>
          </div>

          {/* Required Spare Parts */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Required Spare Parts</h3>
              <button
                type="button"
                onClick={handleAddSparePart}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                Add Part
              </button>
            </div>

            {formData.requiredSpareParts && formData.requiredSpareParts.length > 0 ? (
              <div className="space-y-3">
                {formData.requiredSpareParts.map((part, index) => {
                  const selectedMaterial = materialItems.find(m => m.id.toString() === part.materialItemId);
                  const isLowStock = selectedMaterial && selectedMaterial.onHandQuantity <= (selectedMaterial.minStock || 0);
                  
                  return (
                    <div key={index} className="flex gap-3 items-start p-3 border border-gray-200 rounded-lg bg-gray-50">
                      <div className="flex-1 space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Material Item <span className="text-red-500">*</span>
                            </label>
                            <select
                              value={part.materialItemId}
                              onChange={(e) => handleSparePartChange(index, 'materialItemId', e.target.value)}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                              required
                            >
                              <option value="">Select Material</option>
                              {materialItems.map(item => (
                                <option key={item.id} value={item.id}>
                                  {item.itemCode} - {item.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Quantity Required <span className="text-red-500">*</span>
                            </label>
                            <input
                              type="number"
                              value={part.quantityRequired}
                              onChange={(e) => handleSparePartChange(index, 'quantityRequired', e.target.value ? parseFloat(e.target.value) : 1)}
                              placeholder="Quantity"
                              min="0.001"
                              step="0.001"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                              required
                            />
                          </div>
                        </div>
                        
                        {/* Stock Info */}
                        {selectedMaterial && (
                          <div className="flex items-center justify-between text-xs bg-white p-2 rounded border border-gray-200">
                            <div className="flex items-center gap-4">
                              <span className="text-gray-600">
                                <span className="font-medium">On Hand:</span> {selectedMaterial.onHandQuantity} {selectedMaterial.unit}
                              </span>
                              {selectedMaterial.minStock && (
                                <span className="text-gray-600">
                                  <span className="font-medium">Min Stock:</span> {selectedMaterial.minStock} {selectedMaterial.unit}
                                </span>
                              )}
                              {selectedMaterial.location && (
                                <span className="text-gray-600">
                                  <span className="font-medium">Location:</span> {selectedMaterial.location}
                                </span>
                              )}
                            </div>
                            {isLowStock && (
                              <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded text-xs font-medium">
                                ⚠ Low Stock
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveSparePart(index)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg flex-shrink-0"
                        title="Remove spare part"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">
                No spare parts added. Click "Add Part" to specify required materials.
              </p>
            )}
          </div>

          {/* Checklist Items Template */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Checklist Items</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Define checkpoint items for each asset in the equipment group
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddChecklistItem}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <ClipboardList className="w-4 h-4" />
                Add Checkpoint
              </button>
            </div>

            {formData.checklistItemTemplates && formData.checklistItemTemplates.length > 0 ? (
              <div className="space-y-3">
                {formData.checklistItemTemplates.map((item, index) => (
                  <div key={index} className="flex gap-3 items-start p-4 border border-gray-200 rounded-lg bg-gray-50">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold text-sm">
                      {item.sequenceOrder}
                    </div>
                    
                    <div className="flex-1 space-y-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          Checkpoint Description <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={item.checkpointDescription}
                          onChange={(e) => handleChecklistItemChange(index, 'checkpointDescription', e.target.value)}
                          placeholder="E.g., Check oil level, Inspect filter condition, Measure temperature"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                          required
                        />
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            checked={item.requiresReading || false}
                            onChange={(e) => handleChecklistItemChange(index, 'requiresReading', e.target.checked)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <label className="ml-2 text-sm text-gray-700">
                            Requires Reading Value
                          </label>
                        </div>
                      </div>

                      {item.requiresReading && (
                        <div className="grid grid-cols-3 gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Min Value (Normal Range)
                            </label>
                            <input
                              type="number"
                              value={item.normalRangeMin ?? ''}
                              onChange={(e) => handleChecklistItemChange(index, 'normalRangeMin', e.target.value ? parseFloat(e.target.value) : undefined)}
                              placeholder="0"
                              step="0.01"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Max Value (Normal Range)
                            </label>
                            <input
                              type="number"
                              value={item.normalRangeMax ?? ''}
                              onChange={(e) => handleChecklistItemChange(index, 'normalRangeMax', e.target.value ? parseFloat(e.target.value) : undefined)}
                              placeholder="100"
                              step="0.01"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                              Unit
                            </label>
                            <input
                              type="text"
                              value={item.unit ?? ''}
                              onChange={(e) => handleChecklistItemChange(index, 'unit', e.target.value)}
                              placeholder="°C, bar, rpm"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveChecklistItem(index)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg flex-shrink-0"
                      title="Remove checkpoint"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg">
                <ClipboardList className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-500 mb-1">No checklist items defined</p>
                <p className="text-xs text-gray-400">
                  Add checkpoint items that technicians will verify for each asset in this maintenance task
                </p>
              </div>
            )}
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
            <PermissionGate permission={'pms.config.create'}><button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Schedule'}
            </button></PermissionGate>
          </div>
        </form>
      </div>
    </div>
  );
}
