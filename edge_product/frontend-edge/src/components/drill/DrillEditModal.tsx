import { useTranslationSafe } from '@/contexts/I18nContext';
import { PermissionGate } from '@/components/auth/PermissionGate'
/**
 * Drill Edit Modal Component
 * Clone of Ảnh 3 - Edit Drill form with rich text editor
 * SOLAS/ISPS Compliance - ISM Code 10
 */

import { useState, useEffect } from 'react';
import { X, Save, Users } from 'lucide-react';
import { toast } from 'sonner';
import type { 
  DrillType,
  CreateUpdateDrillScheduleDto,
  DrillCategory
} from '@/types/drill.types';
import { 
  getDrillTypes, 
  getDrillScheduleById,
  createDrillSchedule,
  updateDrillSchedule,
  formatDateDMY
} from '@/services/drill.service';
import { DRILL_CATEGORY_NAMES } from '@/types/drill.types';
import { getOnboardCrew, type CrewMember } from '@/services/crew.service';
import { DocumentUploadZone } from './DocumentUploadZone';

interface DrillEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  scheduleId?: string; // If editing existing schedule
  onSave: () => void; // Callback after successful save
}

export function DrillEditModal({ isOpen, onClose, scheduleId, onSave }: DrillEditModalProps) {
  const { t } = useTranslationSafe();
  const [loading, setLoading] = useState(false);
  const [drillTypes, setDrillTypes] = useState<DrillType[]>([]);
  const [activeTab, setActiveTab] = useState<'datacard' | 'documents' | 'template' | 'participants'>('datacard');
  const [crewList, setCrewList] = useState<CrewMember[]>([]);
  const [loadingCrew, setLoadingCrew] = useState(false);
  
  // Initial form state
  const getInitialFormData = (): CreateUpdateDrillScheduleDto => ({
    drillTypeId: '',
    description: '',
    category: 'STATION_DRILLS',
    isInterval: true,
    intervalValue: 1,
    intervalUnit: 'months',
    startDate: new Date().toISOString(),
    dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    beforeDueDays: 7,
    hasNoExpiry: false,
    isFixedInterval: true,
    isDocumentRequired: false,
    isSecureHistory: false,
    isCrewMemberRequired: false,
    isMandatorySignOnEvaluation: false,
    instructionContent: '',
    remarks: '',
    participants: [],
    documents: [], // Reset documents to empty array
  });
  
  // Form state
  const [formData, setFormData] = useState<CreateUpdateDrillScheduleDto>(getInitialFormData());
  
  /**
   * Reset form when modal opens in create mode or when modal closes
   */
  useEffect(() => {
    if (isOpen && !scheduleId) {
      // Create mode: Reset to initial state
      setFormData(getInitialFormData());
      setActiveTab('datacard');
    }
  }, [isOpen, scheduleId]);
  
  /**
   * Load drill types for category dropdown
   */
  useEffect(() => {
    const loadDrillTypes = async () => {
      try {
        const types = await getDrillTypes();
        setDrillTypes(types);
      } catch (error) {
        console.error('Failed to load drill types:', error);
        toast.error(t('drillEditor.loadTypesFailed'));
      }
    };
    
    if (isOpen) {
      loadDrillTypes();
    }
  }, [isOpen]);
  
  /**
   * Load existing schedule data if editing
   */
  useEffect(() => {
    const loadSchedule = async () => {
      if (!scheduleId) return;
      
      try {
        setLoading(true);
        const schedule = await getDrillScheduleById(scheduleId);
        
        // Populate form with existing data
        setFormData({
          drillTypeId: schedule.drillTypeId,
          description: schedule.drillName ?? '',
          category: schedule.category ?? 'STATION_DRILLS',
          isInterval: schedule.drillType?.isFixedInterval ?? true,
          intervalValue: 1, // TODO: Parse from drill type frequency
          intervalUnit: 'months',
          startDate: schedule.startDate,
          dueDate: schedule.dueDate,
          beforeDueDays: schedule.drillType?.warningDaysBefore ?? 7,
          hasNoExpiry: schedule.drillType?.hasNoExpiry ?? false,
          isFixedInterval: schedule.isFixedInterval ?? true,
          isDocumentRequired: schedule.isDocumentRequired ?? false,
          isSecureHistory: schedule.isSecureHistory ?? false,
          isCrewMemberRequired: schedule.isCrewMemberRequired ?? false,
          isMandatorySignOnEvaluation: schedule.isMandatorySignOnEvaluation ?? false,
          instructionContent: schedule.instructionContent ?? '', // Load from schedule, not drillType
          remarks: schedule.remarks ?? '',
          participants: schedule.participants ?? [], // Load selected crew
          documents: schedule.documents ?? [], // Load attached documents
        });
      } catch (error) {
        console.error('Failed to load schedule:', error);
        toast.error(t('drillEditor.loadScheduleFailed'));
      } finally {
        setLoading(false);
      }
    };
    
    if (isOpen && scheduleId) {
      loadSchedule();
    }
  }, [isOpen, scheduleId]);
  
  /**
   * Load onboard crew when Participants tab is opened
   */
  useEffect(() => {
    const loadCrew = async () => {
      try {
        setLoadingCrew(true);
        const crew = await getOnboardCrew();
        console.log('Loaded crew:', crew);
        setCrewList(crew);
      } catch (error) {
        console.error('Failed to load crew:', error);
        toast.error(t('drillEditor.loadCrewFailed'));
      } finally {
        setLoadingCrew(false);
      }
    };
    
    // Load crew when modal opens and Participants tab is active
    if (isOpen && activeTab === 'participants') {
      loadCrew();
    }
  }, [isOpen, activeTab]);
  
  /**
   * Handle modal close - reset form to prevent data leakage
   */
  const handleClose = () => {
    setFormData(getInitialFormData());
    setActiveTab('datacard');
    onClose();
  };
  
  /**
   * Handle form submission (Save button)
   */
  const handleSave = async () => {
    try {
      setLoading(true);
      
      // Validate required fields
      if (!formData.drillTypeId || formData.drillTypeId.trim() === '') {
        toast.error(t('drillEditor.typeRequired'));
        return;
      }
      
      if (!formData.description || formData.description.trim() === '') {
        toast.error(t('drillEditor.descriptionRequired'));
        return;
      }
      
      if (new Date(formData.dueDate) <= new Date(formData.startDate)) {
        toast.error(t('drillEditor.invalidDue'));
        return;
      }
      
      // Validate dates are valid
      if (isNaN(new Date(formData.startDate).getTime()) || isNaN(new Date(formData.dueDate).getTime())) {
        toast.error(t('drillEditor.invalidDate'));
        return;
      }
      
      // Create or update schedule
      if (scheduleId) {
        await updateDrillSchedule(scheduleId, formData);
        toast.success(t('drillEditor.updated'));
      } else {
        await createDrillSchedule(formData);
        toast.success(t('drillEditor.created'));
      }
      
      onSave(); // Trigger parent refresh
      handleClose(); // Close modal and reset form
      
    } catch (error: any) {
      console.error('Failed to save drill schedule:', error);
      console.error('Error response:', error.response?.data);
      const errorMessage = error.response?.data?.message || error.response?.data?.error || error.message || t('drillEditor.saveFailed');
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };
  
  /**
   * Handle category change - load drill types for that category
   */
  const handleCategoryChange = (category: DrillCategory) => {
    setFormData(prev => ({ ...prev, category }));
    // Optionally filter drill types by category
  };
  
  /**
   * Handle drill type selection - populate form with drill type defaults
   */
  const handleDrillTypeChange = (drillTypeId: string) => {
    const drillType = drillTypes.find(dt => dt.id === drillTypeId);
    if (!drillType) return;
    
    setFormData(prev => ({
      ...prev,
      drillTypeId,
      description: drillType.drillName,
      category: drillType.category,
      beforeDueDays: drillType.warningDaysBefore,
      hasNoExpiry: drillType.hasNoExpiry,
      isFixedInterval: drillType.isFixedInterval,
      isDocumentRequired: drillType.isDocumentRequired,
      isSecureHistory: drillType.isSecureHistory,
      isCrewMemberRequired: drillType.isCrewMemberRequired,
      isMandatorySignOnEvaluation: drillType.isMandatorySignOnEvaluation,
      instructionContent: drillType.instructionContent ?? '',
    }));
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-2xl w-[90vw] max-w-5xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="operations-section-title flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {t(scheduleId ? 'drillEditor.edit' : 'drillEditor.add')}
          </h2>
          <button
            onClick={handleClose}
            aria-label={t('drillEditor.close')}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        
        {/* Body - 2 columns layout (matching Ảnh 3) */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="grid grid-cols-3 gap-6">
            {/* Left column - Drill details (2/3 width) */}
            <div className="col-span-2 space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase">{t('drillEditor.details')}</h3>
              
              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('drillEditor.description')}
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder={t('drillEditor.descriptionPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              {/* Category dropdown */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('drillEditor.category')}
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => handleCategoryChange(e.target.value as DrillCategory)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  {Object.entries(DRILL_CATEGORY_NAMES).map(([key]) => (
                    <option key={key} value={key}>{t(`drillEditor.${key}`)}</option>
                  ))}
                </select>
              </div>
              
              {/* Drill Type selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('drillEditor.drillType')}
                </label>
                <select
                  value={formData.drillTypeId}
                  onChange={(e) => handleDrillTypeChange(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">{t('drillEditor.selectType')}</option>
                  {drillTypes.filter(dt => dt.category === formData.category).map(dt => (
                    <option key={dt.id} value={dt.id}>{dt.drillName}</option>
                  ))}
                </select>
              </div>
              
              {/* Type radio buttons: Interval / One-time */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('drillEditor.type')}
                </label>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={formData.isInterval}
                      onChange={() => setFormData(prev => ({ ...prev, isInterval: true }))}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm text-gray-700">{t('drillEditor.interval')}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={!formData.isInterval}
                      onChange={() => setFormData(prev => ({ ...prev, isInterval: false }))}
                      className="w-4 h-4 text-blue-600"
                    />
                    <span className="text-sm text-gray-700">{t('drillEditor.oneTime')}</span>
                  </label>
                </div>
              </div>
              
              {/* Interval value and unit (show if Interval is selected) */}
              {formData.isInterval && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('drillEditor.interval')}
                    </label>
                    <input
                      type="number"
                      value={formData.intervalValue}
                      onChange={(e) => setFormData(prev => ({ ...prev, intervalValue: Number(e.target.value) }))}
                      min="1"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {t('drillEditor.unit')}
                    </label>
                    <select
                      value={formData.intervalUnit}
                      onChange={(e) => setFormData(prev => ({ ...prev, intervalUnit: e.target.value as any }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="days">{t('drillEditor.days')}</option>
                      <option value="weeks">{t('drillEditor.weeks')}</option>
                      <option value="months">{t('drillEditor.months')}</option>
                      <option value="years">{t('drillEditor.years')}</option>
                    </select>
                  </div>
                </div>
              )}
              
              {/* Date fields - Start date, Due date */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('drillEditor.startDate')}
                  </label>
                  <input
                    type="date"
                    value={formData.startDate.split('T')[0]}
                    onChange={(e) => setFormData(prev => ({ ...prev, startDate: new Date(e.target.value).toISOString() }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {formatDateDMY(formData.startDate)}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('drillEditor.dueDate')}
                  </label>
                  <input
                    type="date"
                    value={formData.dueDate.split('T')[0]}
                    onChange={(e) => setFormData(prev => ({ ...prev, dueDate: new Date(e.target.value).toISOString() }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {formatDateDMY(formData.dueDate)}
                  </p>
                </div>
              </div>
              
              {/* Before due (warning days) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('drillEditor.beforeDue')}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={formData.beforeDueDays}
                    onChange={(e) => setFormData(prev => ({ ...prev, beforeDueDays: Number(e.target.value) }))}
                    min="1"
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <span className="text-sm text-gray-700">{t('drillEditor.days')}</span>
                </div>
              </div>
              
              {/* No expiry checkbox */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.hasNoExpiry}
                    onChange={(e) => setFormData(prev => ({ ...prev, hasNoExpiry: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm text-gray-700">{t('drillEditor.noExpiry')}</span>
                </label>
              </div>
            </div>
            
            {/* Right column - Checkboxes (1/3 width) */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-gray-700 uppercase">{t('drillEditor.options')}</h3>
              
              <div className="space-y-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isFixedInterval}
                    onChange={(e) => setFormData(prev => ({ ...prev, isFixedInterval: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm text-gray-700">{t('drillEditor.fixedIntervals')}</span>
                </label>
                
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isDocumentRequired}
                    onChange={(e) => setFormData(prev => ({ ...prev, isDocumentRequired: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm text-gray-700">{t('drillEditor.documentRequired')}</span>
                </label>
                
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isSecureHistory}
                    onChange={(e) => setFormData(prev => ({ ...prev, isSecureHistory: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm text-gray-700">{t('drillEditor.secureHistory')}</span>
                </label>
                
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isCrewMemberRequired}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, isCrewMemberRequired: e.target.checked }));
                      // Reset to Data card tab when unchecking Crew Member Required
                      if (!e.target.checked && activeTab === 'participants') {
                        setActiveTab('datacard');
                      }
                    }}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm text-gray-700">{t('drillEditor.crewRequired')}</span>
                </label>
                
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isMandatorySignOnEvaluation}
                    onChange={(e) => setFormData(prev => ({ ...prev, isMandatorySignOnEvaluation: e.target.checked }))}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm text-gray-700">{t('drillEditor.mandatorySign')}</span>
                </label>
              </div>
            </div>
          </div>
          
          {/* Tabs: Data card / Documents / Template */}
          <div className="mt-6">
            <div className="border-b">
              <div className="flex gap-6">
                <button
                  onClick={() => setActiveTab('datacard')}
                  className={`px-1 py-2 text-sm font-medium border-b-2 transition ${
                    activeTab === 'datacard'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {t('drillEditor.dataCard')}
                </button>
                <button
                  onClick={() => setActiveTab('documents')}
                  className={`px-1 py-2 text-sm font-medium border-b-2 transition ${
                    activeTab === 'documents'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {t('drillEditor.documents')}
                </button>
                <button
                  onClick={() => setActiveTab('template')}
                  className={`px-1 py-2 text-sm font-medium border-b-2 transition ${
                    activeTab === 'template'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-600 hover:text-gray-900'
                  }`}
                >
                  {t('drillEditor.template')}
                </button>
                {formData.isCrewMemberRequired && (
                  <button
                    onClick={() => setActiveTab('participants')}
                    className={`px-1 py-2 text-sm font-medium border-b-2 transition flex items-center gap-1 ${
                      activeTab === 'participants'
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    <Users className="w-4 h-4" />
                    <span>{t('drillEditor.participants')}</span>
                  </button>
                )}
              </div>
            </div>
            
            {/* Tab content */}
            <div className="mt-4">
              {activeTab === 'datacard' && (
                <div>
                  {/* Rich text editor (simplified - use TinyMCE or Quill for full implementation) */}
                  <div className="border border-gray-300 rounded-lg">
                    <div className="bg-gray-50 px-3 py-2 border-b flex items-center gap-2 flex-wrap">
                      {/* Toolbar buttons (simplified) */}
                      <button className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50">{t('drillEditor.undo')}</button>
                      <button className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50">{t('drillEditor.redo')}</button>
                      <div className="w-px h-4 bg-gray-300 mx-1" />
                      <select className="px-2 py-1 text-xs bg-white border rounded">
                        <option>{t('drillEditor.paragraph')}</option>
                        <option>{t('drillEditor.heading1')}</option>
                        <option>{t('drillEditor.heading2')}</option>
                      </select>
                      <select className="px-2 py-1 text-xs bg-white border rounded">
                        <option>12px</option>
                        <option>14px</option>
                        <option>16px</option>
                      </select>
                      <div className="w-px h-4 bg-gray-300 mx-1" />
                      <button title={t('drillEditor.bold')} className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50 font-bold">B</button>
                      <button title={t('drillEditor.italic')} className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50 italic">I</button>
                      <button title={t('drillEditor.underline')} className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50 underline">U</button>
                    </div>
                    <textarea
                      value={formData.instructionContent}
                      onChange={(e) => setFormData(prev => ({ ...prev, instructionContent: e.target.value }))}
                      placeholder={t('drillEditor.instructionPlaceholder')}
                      rows={10}
                      className="w-full px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-b-lg"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {t('drillEditor.formatHint')}
                  </p>
                </div>
              )}
              
              {activeTab === 'documents' && (
                <div>
                  <div className="mb-4">
                    <h3 className="text-base font-semibold text-gray-900 mb-2">
                      {t('drillEditor.drillDocuments')}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {t('drillEditor.documentHint')}
                    </p>
                  </div>
                  
                  {/* Professional Document Upload Zone */}
                  <DocumentUploadZone
                    documents={formData.documents || []}
                    onChange={(docs) => setFormData(prev => ({ ...prev, documents: docs }))}
                    maxFileSize={10 * 1024 * 1024} // 10MB
                    acceptedFileTypes={[
                      'application/pdf',
                      'image/jpeg',
                      'image/jpg',
                      'image/png',
                      'image/webp',
                      'image/gif'
                    ]}
                  />
                </div>
              )}
              
              {activeTab === 'template' && (
                <div className="text-center py-8 text-gray-500">
                  {t('drillEditor.templateSoon')}
                </div>
              )}
              
              {activeTab === 'participants' && formData.isCrewMemberRequired && (
                <div>
                  {loadingCrew ? (
                    <div className="text-center py-8 text-gray-500">
                      {t('drillEditor.loadingCrew')}
                    </div>
                  ) : (
                    <>
                      {/* Selection counter */}
                      <div className="mb-4 flex items-center justify-between">
                        <p className="text-sm text-gray-700">
                          {t('drillEditor.selectedCrew', { selected: formData.participants?.length || 0, total: crewList?.length || 0 })}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({ 
                              ...prev, 
                              participants: crewList?.map(c => c.id) || [] 
                            }))}
                            className="px-3 py-1 text-xs bg-blue-50 text-blue-700 rounded hover:bg-blue-100"
                          >
                            {t('drillEditor.selectAll')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, participants: [] }))}
                            className="px-3 py-1 text-xs bg-gray-50 text-gray-700 rounded hover:bg-gray-100"
                          >
                            {t('drillEditor.clearAll')}
                          </button>
                        </div>
                      </div>
                      
                      {/* Quick filters by rank group */}
                      <div className="mb-4 flex items-center gap-2">
                        <span className="text-xs text-gray-600 font-medium">{t('drillEditor.quickFilters')}</span>
                        {['Officers', 'Deck', 'Engine', 'Galley'].map(group => {
                          const groupCrew = crewList?.filter(c => c.rankGroup === group) || [];
                          const isGroupSelected = groupCrew.length > 0 && 
                            groupCrew.every(c => formData.participants?.includes(c.id));
                          
                          return (
                            <button
                              key={group}
                              type="button"
                              onClick={() => {
                                const groupIds = groupCrew.map(c => c.id);
                                setFormData(prev => {
                                  const currentIds = prev.participants || [];
                                  if (isGroupSelected) {
                                    // Deselect this group
                                    return { 
                                      ...prev, 
                                      participants: currentIds.filter(id => !groupIds.includes(id)) 
                                    };
                                  } else {
                                    // Select this group
                                    return { 
                                      ...prev, 
                                      participants: [...new Set([...currentIds, ...groupIds])] 
                                    };
                                  }
                                });
                              }}
                              className={`px-3 py-1 text-xs rounded border ${
                                isGroupSelected 
                                  ? 'bg-blue-50 text-blue-700 border-blue-300' 
                                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              {t(`drillEditor.${group}`)} ({groupCrew.length})
                            </button>
                          );
                        })}
                      </div>
                      
                      {/* Crew table */}
                      <div className="border border-gray-300 rounded-lg overflow-hidden">
                        <table className="w-full">
                          <thead className="bg-gray-50 border-b">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 w-12">
                                <input
                                  type="checkbox"
                                  checked={(crewList?.length || 0) > 0 && 
                                    (crewList?.every(c => formData.participants?.includes(c.id)) || false)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setFormData(prev => ({ 
                                        ...prev, 
                                        participants: crewList?.map(c => c.id) || [] 
                                      }));
                                    } else {
                                      setFormData(prev => ({ ...prev, participants: [] }));
                                    }
                                  }}
                                  className="w-4 h-4 text-blue-600 rounded"
                                />
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">
                                {t('drillEditor.rank')}
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">
                                {t('drillEditor.name')}
                              </th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-700">
                                {t('drillEditor.department')}
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {!crewList || crewList.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
                                  {t('drillEditor.noCrew')}
                                </td>
                              </tr>
                            ) : (
                              crewList.map(crew => (
                                <tr 
                                  key={crew.id} 
                                  className="hover:bg-gray-50 cursor-pointer"
                                  onClick={() => {
                                    setFormData(prev => {
                                      const currentIds = prev.participants || [];
                                      if (currentIds.includes(crew.id)) {
                                        return { 
                                          ...prev, 
                                          participants: currentIds.filter(id => id !== crew.id) 
                                        };
                                      } else {
                                        return { 
                                          ...prev, 
                                          participants: [...currentIds, crew.id] 
                                        };
                                      }
                                    });
                                  }}
                                >
                                  <td className="px-4 py-2">
                                    <input
                                      type="checkbox"
                                      checked={formData.participants?.includes(crew.id) || false}
                                      onChange={() => {}} // Handled by row onClick
                                      className="w-4 h-4 text-blue-600 rounded pointer-events-none"
                                    />
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-900">
                                    {crew.rank}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-900">
                                    {crew.fullName}
                                  </td>
                                  <td className="px-4 py-2 text-sm text-gray-600">
                                    {crew.department || crew.rankGroup || '-'}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Footer - Action buttons */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50">
          <button
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition disabled:opacity-50"
          >
            {t('drillEditor.cancel')}
          </button>
          <PermissionGate permission={scheduleId ? 'drills.update' : 'drills.create'}><button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                {t('drillEditor.saving')}
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                {t('drillEditor.save')}
              </>
            )}
          </button></PermissionGate>
        </div>
      </div>
    </div>
  );
}
