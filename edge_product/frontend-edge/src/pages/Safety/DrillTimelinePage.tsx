import { PermissionGate } from '@/components/auth/PermissionGate'
/**
 * Drill Training Timeline Page
 * Clone of Ảnh 2 - Gantt chart view with tree structure
 * SOLAS/ISPS Compliance - ISM Code 10
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import { ChevronRight, ChevronDown, Plus, Filter, Calendar, RefreshCw, Download, Trash2, Search, X, FileText } from 'lucide-react';
import { useTranslationSafe } from '@/contexts/I18nContext';
import { toast } from 'sonner';
import type { 
  DrillTimelineGroupDto, 
  DrillSchedule, 
  DrillCategory,
  DrillScheduleStatus,
  DrillTimelineQueryDto
} from '@/types/drill.types';
import { getDrillTimeline, getTimelineBarColor, calculateBarPosition, bulkDeleteDrillSchedules } from '@/services/drill.service';
import { DRILL_CATEGORY_NAMES } from '@/types/drill.types';
import { DrillEditModal } from '@/components/drill/DrillEditModal';
import { DocumentPreviewModal } from '@/components/drill/DocumentPreviewModal';

// Month labels for timeline header (Jan 2025 - Dec 2025 visible in Ảnh 2)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function DrillTimelinePage() {
  const { t } = useTranslationSafe();
  const [timelineData, setTimelineData] = useState<DrillTimelineGroupDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | undefined>(undefined);
  const [categoryFilter, setCategoryFilter] = useState<DrillCategory | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<DrillScheduleStatus | undefined>(undefined);
  const [expandedCategories, setExpandedCategories] = useState<Set<DrillCategory>>(new Set());
  const [selectedSchedules, setSelectedSchedules] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  
  // Transformative Search (Marad style)
  const [searchMode, setSearchMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Document preview modal
  const [showDocPreview, setShowDocPreview] = useState(false);
  const [previewSchedule, setPreviewSchedule] = useState<DrillSchedule | null>(null);
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingScheduleId, setEditingScheduleId] = useState<string | undefined>(undefined);
  
  // Delete confirmation dialog
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Timeline date range (visible portion - 12 months in Ảnh 2)
  const timelineStart = useMemo(() => new Date(selectedYear, 0, 1), [selectedYear]); // Jan 1
  const timelineEnd = useMemo(() => new Date(selectedYear, 11, 31), [selectedYear]); // Dec 31
  
  // Current date red line position
  const currentDatePosition = useMemo(() => {
    const now = new Date();
    if (now.getFullYear() !== selectedYear) return null; // Don't show if not current year
    
    const timelineSpanMs = timelineEnd.getTime() - timelineStart.getTime();
    const currentOffsetMs = now.getTime() - timelineStart.getTime();
    return (currentOffsetMs / timelineSpanMs) * 100; // Percentage
  }, [selectedYear, timelineStart, timelineEnd]);
  
  /**
   * Load timeline data from API
   */
  const loadTimeline = useCallback(async () => {
    try {
      setLoading(true);
      
      const query: DrillTimelineQueryDto = {
        year: selectedYear,
        month: selectedMonth,
        category: categoryFilter,
        status: statusFilter,
      };
      
      const data = await getDrillTimeline(query);
      setTimelineData(data);
      
      // Auto-expand categories with data
      const newExpanded = new Set<DrillCategory>();
      data.forEach(group => {
        if (group.schedules.length > 0) {
          newExpanded.add(group.category);
        }
      });
      setExpandedCategories(newExpanded);
      
    } catch (error) {
      console.error('Failed to load drill timeline:', error);
      toast.error(t('drillTimeline.toast.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedMonth, categoryFilter, statusFilter]);
  
  // Load data on mount and when filters change
  useEffect(() => {
    loadTimeline();
  }, [loadTimeline]);
  
  /**
   * Toggle category expansion in tree view
   */
  const toggleCategory = (category: DrillCategory) => {
    setExpandedCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };
  
  /**
   * Toggle schedule selection (checkboxes in Ảnh 2)
   */
  const toggleScheduleSelection = (scheduleId: string) => {
    setSelectedSchedules(prev => {
      const newSet = new Set(prev);
      if (newSet.has(scheduleId)) {
        newSet.delete(scheduleId);
      } else {
        newSet.add(scheduleId);
      }
      return newSet;
    });
  };
  
  /**
   * Handle schedule click (open Edit Modal - to be implemented)
   */
  const handleScheduleClick = (schedule: DrillSchedule) => {
    setEditingScheduleId(schedule.id);
    setIsModalOpen(true);
  };
  
  /**
   * Handle document preview (quick view without opening Edit Modal)
   */
  const handleDocumentPreview = (schedule: DrillSchedule, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent schedule click event
    if (schedule.documents && schedule.documents.length > 0) {
      setPreviewSchedule(schedule);
      setShowDocPreview(true);
    } else {
      toast.info(t('drillTimeline.noDocuments'));
    }
  };
  
  /**
   * Handle Add Drill button click
   */
  const handleAddDrill = () => {
    setEditingScheduleId(undefined);
    setIsModalOpen(true);
  };
  
  /**
   * Handle modal save callback
   */
  const handleModalSave = () => {
    loadTimeline(); // Refresh timeline data
  };
  
  /**
   * Handle bulk delete with confirmation
   */
  const handleBulkDelete = async () => {
    if (selectedSchedules.size === 0) return;
    
    setShowDeleteConfirm(true);
  };
  
  /**
   * Confirm and execute bulk delete
   */
  const executeDelete = async () => {
    if (selectedSchedules.size === 0) return;
    
    try {
      setIsDeleting(true);
      
      const scheduleIds = Array.from(selectedSchedules);
      const result = await bulkDeleteDrillSchedules(scheduleIds, deleteReason || undefined);
      
      toast.success(t('drillTimeline.toast.deleteSuccess', { count: result.deletedCount }));
      
      // Clear selection and refresh
      setSelectedSchedules(new Set());
      setShowDeleteConfirm(false);
      setDeleteReason('');
      await loadTimeline();
      
    } catch (error: any) {
      toast.error(error.message || t('drillTimeline.toast.deleteFailed'));
      console.error('Delete error:', error);
    } finally {
      setIsDeleting(false);
    }
  };
  
  /**
   * Cancel delete confirmation
   */
  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setDeleteReason('');
  };
  
  /**
   * Filter timeline data by search query
   */
  const filteredTimelineData = useMemo(() => {
    if (!searchQuery.trim()) return timelineData;
    
    const query = searchQuery.toLowerCase().trim();
    return timelineData
      .map(group => ({
        ...group,
        schedules: group.schedules.filter(schedule => 
          schedule.drillName?.toLowerCase().includes(query) ||
          schedule.scheduleCode?.toLowerCase().includes(query) ||
          schedule.drillType?.drillCode?.toLowerCase().includes(query) ||
          schedule.drillType?.drillName?.toLowerCase().includes(query)
        )
      }))
      .filter(group => group.schedules.length > 0); // Only show categories with matching drills
  }, [timelineData, searchQuery]);

  /**
   * Calculate bar style for Gantt chart
   */
  const getBarStyle = (schedule: DrillSchedule) => {
    const TIMELINE_WIDTH = 1000; // Base width in pixels (will be percentage-based)
    const position = calculateBarPosition(
      schedule.startDate,
      schedule.dueDate,
      timelineStart,
      timelineEnd,
      TIMELINE_WIDTH
    );
    
    const color = getTimelineBarColor(schedule.status, schedule.drillType?.hasNoExpiry ?? false);
    
    return {
      left: `${(position.left / TIMELINE_WIDTH) * 100}%`,
      width: `${(position.width / TIMELINE_WIDTH) * 100}%`,
      backgroundColor: 
        color === 'red' ? 'rgba(239, 68, 68, 0.8)' : // RED for OVERDUE
        color === 'green' ? 'rgba(34, 197, 94, 0.8)' : // GREEN for COMPLETED
        color === 'yellow' ? 'rgba(234, 179, 8, 0.8)' : // YELLOW for DUE/No expiry
        'rgba(59, 130, 246, 0.8)', // BLUE for SCHEDULED
    };
  };
  
  /**
   * Clear all filters
   */
  const clearFilters = () => {
    setSelectedMonth(undefined);
    setCategoryFilter(undefined);
    setStatusFilter(undefined);
  };
  
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{t('drillTimeline.title')}</h1>
              <p className="text-sm text-gray-500 mt-1">{t('drillTimeline.subtitle')}</p>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={loadTimeline}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                <RefreshCw className="w-4 h-4" />
                {t('drillTimeline.refresh')}
              </button>
              
              <PermissionGate permission="drills.create"><button
                onClick={handleAddDrill}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                <Plus className="w-4 h-4" />
                {t('drillTimeline.addDrill')}
              </button></PermissionGate>
              
              {/* Delete button - only visible when items selected */}
              {selectedSchedules.size > 0 && (
                <PermissionGate permission="drills.delete"><button
                  onClick={handleBulkDelete}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                >
                  <Trash2 className="w-4 h-4" />
                  {t('drillTimeline.delete', { count: selectedSchedules.size })}
                </button></PermissionGate>
              )}
              
              <button
                className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
              >
                <Download className="w-4 h-4" />
                {t('drillTimeline.export')}
              </button>
            </div>
          </div>
          
          {/* Filters bar */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
            >
              <Filter className="w-4 h-4" />
              {t('drillTimeline.filters')}
            </button>
            
            {/* Year selector */}
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-3 py-2 border rounded-lg bg-white"
            >
              {[2024, 2025, 2026, 2027, 2028].map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
            
            {showFilters && (
              <>
                <select
                  value={selectedMonth ?? ''}
                  onChange={(e) => setSelectedMonth(e.target.value ? Number(e.target.value) : undefined)}
                  className="px-3 py-2 border rounded-lg bg-white"
                >
                  <option value="">{t('drillTimeline.allMonths')}</option>
                  {MONTHS.map((month, idx) => (
                    <option key={month} value={idx + 1}>{month}</option>
                  ))}
                </select>
                
                <select
                  value={categoryFilter ?? ''}
                  onChange={(e) => setCategoryFilter(e.target.value as DrillCategory || undefined)}
                  className="px-3 py-2 border rounded-lg bg-white"
                >
                  <option value="">{t('drillTimeline.allCategories')}</option>
                  {Object.entries(DRILL_CATEGORY_NAMES).map(([key, name]) => (
                    <option key={key} value={key}>{name}</option>
                  ))}
                </select>
                
                <select
                  value={statusFilter ?? ''}
                  onChange={(e) => setStatusFilter(e.target.value as DrillScheduleStatus || undefined)}
                  className="px-3 py-2 border rounded-lg bg-white"
                >
                  <option value="">{t('drillTimeline.allStatus')}</option>
                  <option value="SCHEDULED">{t('drillTimeline.status.scheduled')}</option>
                  <option value="DUE">{t('drillTimeline.status.due')}</option>
                  <option value="OVERDUE">{t('drillTimeline.status.overdue')}</option>
                  <option value="COMPLETED">{t('drillTimeline.status.completed')}</option>
                </select>
                
                <button
                  onClick={clearFilters}
                  className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
                >
                  {t('drillTimeline.clearFilters')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      
      {/* Timeline Container */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-2" />
              <p className="text-gray-600">{t('drillTimeline.loading')}</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col h-full overflow-hidden">
            {/* Header Row - Fixed */}
            <div className="flex bg-white border-b sticky top-0 z-10">
              {/* Left header - Transformative Search */}
              <div className="w-96 px-4 py-3 border-r flex-shrink-0">
                {searchMode ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t('drillTimeline.searchPlaceholder')}
                      autoFocus
                      className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => {
                        setSearchMode(false);
                        setSearchQuery('');
                      }}
                      className="p-1 hover:bg-gray-100 rounded transition"
                      title="Close search"
                    >
                      <X className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-500">{t('drillTimeline.categories')}</h3>
                    <button
                      onClick={() => setSearchMode(true)}
                      className="p-1 hover:bg-gray-100 rounded transition"
                      title="Search drills"
                    >
                      <Search className="w-4 h-4 text-gray-500" />
                    </button>
                  </div>
                )}
              </div>
              
              {/* Month headers */}
              <div className="flex-1 overflow-x-auto">
                <div className="min-w-[1200px] flex">
                  {MONTHS.map((month) => (
                    <div
                      key={month}
                      className="flex-1 px-4 py-3 text-center border-r last:border-r-0"
                    >
                      <span className="text-sm font-semibold text-gray-700">
                        {month} {selectedYear}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Scrollable Content */}
            <div className="flex-1 overflow-auto">
              <div className="flex flex-col">
                {filteredTimelineData.map((group) => (
                  <div key={group.category}>
                    {/* Category Header Row */}
                    <div className="flex border-b bg-gray-50 hover:bg-gray-100 transition">
                      {/* Left side - Category button */}
                      <div className="w-96 px-4 py-2 border-r flex-shrink-0">
                        <button
                          onClick={() => toggleCategory(group.category)}
                          className="w-full flex items-center gap-2"
                        >
                          {expandedCategories.has(group.category) ? (
                            <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
                          ) : (
                            <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
                          )}
                          
                          <span className="flex-1 text-left font-medium text-gray-900 truncate">
                            {group.categoryDisplayName}
                          </span>
                          
                          <span className="text-sm text-gray-500 flex-shrink-0">
                            ({group.totalDrills})
                          </span>
                          
                          {group.overdueCount > 0 && (
                            <span className="px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-700 rounded-full flex-shrink-0">
                              {group.overdueCount}
                            </span>
                          )}
                        </button>
                      </div>
                      
                      {/* Right side - Category label on timeline */}
                      <div className="flex-1 overflow-x-auto">
                        <div className="min-w-[1200px] px-4 py-2 font-medium text-sm text-gray-700">
                          {group.categoryDisplayName}
                        </div>
                      </div>
                    </div>
                    
                    {/* Drill Schedule Rows - if expanded */}
                    {expandedCategories.has(group.category) && group.schedules.map((schedule) => (
                      <div key={schedule.id} className="flex border-b hover:bg-blue-50 transition">
                        {/* Left side - Drill name with checkbox */}
                        <div className="w-96 px-4 py-3 border-r flex-shrink-0">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedSchedules.has(schedule.id)}
                              onChange={(e) => {
                                e.stopPropagation();
                                toggleScheduleSelection(schedule.id);
                              }}
                              className="w-4 h-4 text-blue-600 flex-shrink-0"
                            />
                            
                            {/* PDF icon - clickable for quick preview (only show if documents uploaded) */}
                            {schedule.documents && schedule.documents.length > 0 && (
                              <button
                                onClick={(e) => handleDocumentPreview(schedule, e)}
                                className="p-0.5 hover:bg-red-50 rounded transition flex-shrink-0 group"
                                title={`View ${schedule.documents.length} document${schedule.documents.length > 1 ? 's' : ''}`}
                              >
                                <FileText className="w-3.5 h-3.5 text-red-600 group-hover:text-red-700" />
                              </button>
                            )}
                            
                            <span 
                              className="flex-1 text-sm text-gray-700 truncate cursor-pointer hover:text-blue-600"
                              title={schedule.drillName ?? schedule.scheduleCode}
                              onClick={() => handleScheduleClick(schedule)}
                            >
                              {schedule.drillName ?? schedule.scheduleCode}
                            </span>
                          </div>
                        </div>
                        
                        {/* Right side - Timeline bar */}
                        <div className="flex-1 overflow-x-auto relative">
                          <div className="min-w-[1200px] relative h-12">
                            {/* Current date red line */}
                            {currentDatePosition !== null && (
                              <div
                                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-20"
                                style={{ left: `${currentDatePosition}%` }}
                              />
                            )}
                            
                            {/* Month grid lines */}
                            <div className="absolute inset-0 flex">
                              {MONTHS.map((month) => (
                                <div
                                  key={month}
                                  className="flex-1 border-r last:border-r-0 border-gray-200"
                                />
                              ))}
                            </div>
                            
                            {/* Timeline bar - Slender Marad style */}
                            <div
                              className="absolute top-1/2 -translate-y-1/2 h-6 rounded-full shadow-md flex items-center px-2 cursor-pointer group hover:shadow-lg transition-all"
                              style={getBarStyle(schedule)}
                              title={`${schedule.drillName}\nStatus: ${schedule.status}\nDue: ${new Date(schedule.dueDate).toLocaleDateString()}`}
                              onClick={() => handleScheduleClick(schedule)}
                            >
                              {/* Time label */}
                              <span className="text-white text-[10px] font-semibold truncate mr-1">
                                {schedule.timelineLabel}
                              </span>
                              
                              {/* Overdue indicator */}
                              {schedule.status === 'OVERDUE' && (
                                <span className="ml-auto bg-white/20 px-1.5 py-0.5 rounded text-[9px] font-bold text-white whitespace-nowrap">
                                  {t('drillTimeline.overdue')}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
                
                {filteredTimelineData.length === 0 && (
                  <div className="flex items-center justify-center h-64">
                    <div className="text-center">
                      <Calendar className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                      <p className="text-gray-500">
                        {searchQuery ? t('drillTimeline.noResults', { query: searchQuery }) : t('drillTimeline.noDrills')}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Edit Modal */}
      <DrillEditModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        scheduleId={editingScheduleId}
        onSave={handleModalSave}
      />
      
      {/* Document Preview Modal - Quick view without editing */}
      <DocumentPreviewModal
        isOpen={showDocPreview}
        onClose={() => {
          setShowDocPreview(false);
          setPreviewSchedule(null);
        }}
        documents={previewSchedule?.documents || []}
        drillName={previewSchedule?.drillName || previewSchedule?.scheduleCode || 'Unknown Drill'}
      />
      
      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              {t('drillTimeline.deleteConfirmTitle', { count: selectedSchedules.size })}
            </h3>
            
            <div className="mb-4 p-3 bg-yellow-50 border-l-4 border-yellow-400 text-sm">
              <p className="font-medium text-yellow-900 mb-1">⚠️ {t('drillTimeline.solasWarningTitle')}</p>
              <p className="text-yellow-800">
                {t('drillTimeline.solasWarningText')}
              </p>
              <p className="text-yellow-800 mt-2">
                <strong>{t('common.note')}:</strong> {t('drillTimeline.solasWarningNote')}
              </p>
            </div>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('drillTimeline.reasonLabel')}
              </label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder={t('drillTimeline.reasonPlaceholder')}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={cancelDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
              >
                {t('drillTimeline.cancel')}
              </button>
              <PermissionGate permission="drills.delete"><button
                onClick={executeDelete}
                disabled={isDeleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 flex items-center gap-2"
              >
                {isDeleting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t('drillTimeline.deleting')}
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    {t('drillTimeline.confirmDelete')}
                  </>
                )}
              </button></PermissionGate>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
