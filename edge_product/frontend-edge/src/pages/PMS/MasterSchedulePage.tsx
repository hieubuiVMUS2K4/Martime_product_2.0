import { useState, useEffect, useCallback } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Download, Clock, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { addDays } from 'date-fns';
import { maintenanceScheduleService } from '@/services/maintenance-schedule.service';
import { useTranslationSafe } from '@/contexts/I18nContext';
import type { SchedulePreview } from '@/types/pms.types';

type ViewMode = 'day' | 'week' | 'month' | 'quarter';

interface GanttTask {
  id: string;
  name: string;
  groupName: string;
  dueDate: Date;
  startDate: Date;  // When task should be started
  workDurationDays: number;  // Actual work duration
  leadTimeDays: number;  // Lead time configured
  priority: string;
  isOverdue: boolean;
  daysUntilDue: number;
  intervalType?: string;
  intervalValue?: number;
  estimatedHours?: number;
  progress: number;  // Actual completion progress (0-100)
  nextDueDate?: Date;  // For showing next occurrence after completion
  hasNextDue?: boolean;  // Flag to show this is a future scheduled occurrence
}

// Light mode colors
const PRIORITY_COLORS_LIGHT = {
  CRITICAL: { bg: '#FEE2E2', bar: '#EF4444', text: '#991B1B' }, // red
  HIGH: { bg: '#FFEDD5', bar: '#F97316', text: '#9A3412' }, // orange
  MEDIUM: { bg: '#FEF3C7', bar: '#EAB308', text: '#854D0E' }, // yellow
  LOW: { bg: '#DBEAFE', bar: '#3B82F6', text: '#1E40AF' } // blue
};

// Dark mode colors - more transparent backgrounds for dark mode
const PRIORITY_COLORS_DARK = {
  CRITICAL: { bg: 'rgba(239, 68, 68, 0.2)', bar: '#EF4444', text: '#FCA5A5' }, // red
  HIGH: { bg: 'rgba(249, 115, 22, 0.2)', bar: '#F97316', text: '#FDBA74' }, // orange
  MEDIUM: { bg: 'rgba(234, 179, 8, 0.2)', bar: '#EAB308', text: '#FDE047' }, // yellow
  LOW: { bg: 'rgba(59, 130, 246, 0.2)', bar: '#3B82F6', text: '#93C5FD' } // blue
};

// Keep PRIORITY_COLORS for backward compatibility (legend)
const PRIORITY_COLORS = PRIORITY_COLORS_LIGHT;

export default function MasterSchedulePage() {
  const { t } = useTranslationSafe();
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [isDarkMode, setIsDarkMode] = useState(() => 
    document.documentElement.classList.contains('dark')
  );

  // Watch for theme changes using MutationObserver
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          setIsDarkMode(document.documentElement.classList.contains('dark'));
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });

    return () => observer.disconnect();
  }, []);

  // Get priority colors based on current theme state
  const getPriorityColors = useCallback((priority: string) => {
    const colors = isDarkMode ? PRIORITY_COLORS_DARK : PRIORITY_COLORS_LIGHT;
    return colors[priority as keyof typeof colors] || colors.LOW;
  }, [isDarkMode]);

  // Initial load
  useEffect(() => {
    loadScheduleData();
  }, []);

  // Auto-refresh every 2 minutes to sync with completed tasks
  useEffect(() => {
    const AUTO_REFRESH_INTERVAL = 2 * 60 * 1000; // 2 minutes
    
    const interval = setInterval(() => {
      loadScheduleData();
    }, AUTO_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  // Calculate next due date based on interval type if not set
  const calculateNextDueDate = (preview: SchedulePreview): Date => {
    // Always use database value if exists (source of truth for compliance)
    if (preview.nextDueDate) {
      return new Date(preview.nextDueDate);
    }
    
    // If no nextDueDate, calculate based on interval type from today
    const today = new Date();
    const intervalDays = getIntervalDays(preview.intervalType, preview.intervalValue);
    return addDays(today, intervalDays);
  };
  
  // Convert interval type to days
  const getIntervalDays = (intervalType: string | undefined, intervalValue: number | undefined): number => {
    switch (intervalType?.toUpperCase()) {
      case 'DAILY':
        return 1;
      case 'WEEKLY':
        return 7;
      case 'BI_WEEKLY':
      case 'BIWEEKLY':
        return 14;
      case 'MONTHLY':
        return 30;
      case 'QUARTERLY':
        return 90;
      case 'SEMI_ANNUALLY':
      case 'SEMIANNUALLY':
        return 180;
      case 'ANNUALLY':
        return 365;
      case 'CALENDAR':
        return intervalValue || 30;
      case 'RUNNING_HOURS':
        // For running hours, assume average 12 hours/day operation
        return intervalValue ? Math.ceil(intervalValue / 12) : 30;
      default:
        return 30; // Default to monthly
    }
  };

  const loadScheduleData = async () => {
    try {
      setLoading(true);
      const previews = await maintenanceScheduleService.getPreview();
      
      // Convert previews to Gantt tasks with CORRECT work period calculation
      const ganttTasks: GanttTask[] = previews.map(preview => {
        // Calculate or use existing due date
        const dueDate = calculateNextDueDate(preview);
        
        // Recalculate days until due
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dueDateTime = new Date(dueDate);
        dueDateTime.setHours(0, 0, 0, 0);
        const daysUntil = Math.ceil((dueDateTime.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        
        // Calculate actual work duration (man-hours to calendar days)
        const estimatedHours = preview.estimatedDurationHours || 4;
        const workDurationDays = Math.ceil(estimatedHours / 8); // 8 hours per workday
        
        // Lead time = when to start preparing (ordering parts, allocating crew)
        const leadTimeDays = preview.daysBeforeDue || 7;
        
        // Start date = Due date - lead time
        const startDate = new Date(dueDate);
        startDate.setDate(startDate.getDate() - leadTimeDays);
        
        // Calculate REAL progress (for tasks already generated)
        let progress = 0;
        const isOverdue = daysUntil < 0;
        if (isOverdue) {
          progress = 100; // Should be completed
        } else if (daysUntil <= leadTimeDays) {
          // Task is in active window, show preparation progress
          const elapsed = leadTimeDays - daysUntil;
          progress = Math.min(95, (elapsed / leadTimeDays) * 100);
        }
        
        // ✨ Calculate next occurrence for display on same row
        let nextDueDate: Date | undefined;
        if (preview.intervalType && preview.intervalValue) {
          const intervalDays = getIntervalDays(preview.intervalType, preview.intervalValue);
          nextDueDate = addDays(dueDate, intervalDays);
        }
        
        return {
          id: preview.scheduleId,
          name: preview.scheduleName,
          groupName: preview.assetName,
          dueDate,
          startDate,
          workDurationDays,
          leadTimeDays,
          priority: preview.priority,
          isOverdue,
          daysUntilDue: daysUntil,
          intervalType: preview.intervalType,
          intervalValue: preview.intervalValue,
          estimatedHours,
          progress,
          nextDueDate,  // 🎯 Include next due on same task
          hasNextDue: !!nextDueDate
        };
      }).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

      console.log('📊 Total Gantt tasks:', ganttTasks.length);
      console.log('📊 Tasks with next due:', ganttTasks.filter(t => t.hasNextDue).length);

      setTasks(ganttTasks);
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error loading schedule data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getDaysInView = (): Date[] => {
    const days: Date[] = [];
    const start = new Date(currentDate);
    
    // For day and week views, start from current date
    // For month and quarter views, start from beginning of month
    if (viewMode === 'month' || viewMode === 'quarter') {
      start.setDate(1);
    }
    start.setHours(0, 0, 0, 0);
    
    const daysToShow = viewMode === 'day' ? 7 : viewMode === 'week' ? 14 : viewMode === 'month' ? 60 : 90;
    
    for (let i = 0; i < daysToShow; i++) {
      const day = new Date(start);
      day.setDate(day.getDate() + i);
      days.push(day);
    }
    
    return days;
  };

  const getDatePosition = (date: Date, days: Date[], align: 'start' | 'center' | 'end' = 'center'): number | null => {
    const firstDay = days[0];
    const lastDay = days[days.length - 1];
    
    if (date < firstDay || date > lastDay) {
      return null;
    }
    
    // Find which day index this date corresponds to
    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < days.length; i++) {
      const dayDate = new Date(days[i]);
      dayDate.setHours(0, 0, 0, 0);
      
      if (targetDate.getTime() === dayDate.getTime()) {
        const columnWidth = 100 / days.length;
        const basePosition = i * columnWidth;
        
        // Return position based on alignment
        if (align === 'start') {
          return basePosition;
        } else if (align === 'end') {
          return basePosition + columnWidth;
        } else {
          return basePosition + (columnWidth / 2);
        }
      }
    }
    
    // Fallback to continuous calculation if exact day not found
    const viewStart = firstDay.getTime();
    const viewEnd = lastDay.getTime();
    const viewDuration = viewEnd - viewStart;
    const dateTime = date.getTime();
    
    return ((dateTime - viewStart) / viewDuration) * 100;
  };

  const getWorkPeriod = (task: GanttTask, days: Date[]): { start: number; width: number } | null => {
    // Find start and end day indices
    const startDate = new Date(task.startDate);
    startDate.setHours(0, 0, 0, 0);
    const dueDate = new Date(task.dueDate);
    dueDate.setHours(0, 0, 0, 0);
    
    let startIdx = -1;
    let endIdx = -1;
    
    for (let i = 0; i < days.length; i++) {
      const dayDate = new Date(days[i]);
      dayDate.setHours(0, 0, 0, 0);
      
      if (startIdx === -1 && dayDate.getTime() >= startDate.getTime()) {
        startIdx = i;
      }
      if (dayDate.getTime() === dueDate.getTime()) {
        endIdx = i;
        break;
      }
    }
    
    // If due date not found but we have start, extend to last visible day
    if (startIdx !== -1 && endIdx === -1) {
      // Check if due date is after visible range
      const lastDay = new Date(days[days.length - 1]);
      lastDay.setHours(0, 0, 0, 0);
      if (dueDate.getTime() > lastDay.getTime()) {
        endIdx = days.length - 1;
      }
    }
    
    // If dates are outside visible range
    if (startIdx === -1 || endIdx === -1) {
      return null;
    }
    
    const columnWidth = 100 / days.length;
    
    // Bar spans from start of startIdx column to END of endIdx column
    // (where the due date marker sits at end of day)
    const width = (endIdx - startIdx + 1) * columnWidth;
    
    return {
      start: startIdx * columnWidth,
      width: Math.max(columnWidth * 0.8, width)
    };
  };

  const formatInterval = (task: GanttTask): string => {
    if (task.intervalType === 'RUNNING_HOURS' && task.intervalValue) {
      return t('pms.masterSchedule.interval', { value: task.intervalValue });
    } else if (task.intervalType === 'CALENDAR' && task.intervalValue) {
      return t('pms.masterSchedule.intervalDays', { value: task.intervalValue });
    }
    return '';
  };

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (viewMode === 'day') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    } else if (viewMode === 'week') {
      newDate.setDate(newDate.getDate() + (direction === 'next' ? 7 : -7));
    } else if (viewMode === 'month') {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 1 : -1));
    } else {
      newDate.setMonth(newDate.getMonth() + (direction === 'next' ? 3 : -3));
    }
    setCurrentDate(newDate);
  };

  const handleExport = () => {
    toast.info(t('pms.masterSchedule.exportComingSoon'));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{t('pms.masterSchedule.loading')}</p>
        </div>
      </div>
    );
  }

  const days = getDaysInView();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="h-full w-full overflow-y-auto bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('pms.masterSchedule.title')}</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1">
              {t('pms.masterSchedule.subtitle')}
              <span className="ml-3 text-xs text-gray-500 dark:text-gray-400">
                <RefreshCw className="w-3 h-3 inline mr-1" />
                {t('pms.masterSchedule.autoRefresh', { time: lastRefresh.toLocaleTimeString() })}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={loadScheduleData}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              title={t('pms.masterSchedule.refresh')}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              {t('pms.masterSchedule.refresh')}
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              <Download className="w-4 h-4" />
              {t('pms.masterSchedule.export')}
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            {/* View Mode */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('day')}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  viewMode === 'day'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {t('pms.masterSchedule.day')}
              </button>
              <button
                onClick={() => setViewMode('week')}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  viewMode === 'week'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {t('pms.masterSchedule.week')}
              </button>
              <button
                onClick={() => setViewMode('month')}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  viewMode === 'month'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {t('pms.masterSchedule.month')}
              </button>
              <button
                onClick={() => setViewMode('quarter')}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  viewMode === 'quarter'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {t('pms.masterSchedule.quarter')}
              </button>
            </div>

            {/* Date Navigation */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigateDate('prev')}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div className="text-center min-w-[200px]">
                <p className="font-semibold text-gray-900 dark:text-gray-100">
                  {viewMode === 'day' 
                    ? (() => {
                        const endDate = new Date(currentDate);
                        endDate.setDate(endDate.getDate() + 6);
                        return `${currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
                      })()
                    : viewMode === 'week'
                    ? (() => {
                        const endDate = new Date(currentDate);
                        endDate.setDate(endDate.getDate() + 13); // 14 days
                        return `${currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
                      })()
                    : viewMode === 'month'
                    ? (() => {
                        const endDate = new Date(currentDate);
                        endDate.setDate(endDate.getDate() + 59); // 60 days
                        return `${currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
                      })()
                    : (() => {
                        const endDate = new Date(currentDate);
                        endDate.setDate(endDate.getDate() + 89); // 90 days
                        return `${currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
                      })()
                  }
                </p>
              </div>
              <button
                onClick={() => navigateDate('next')}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-medium"
            >
              {t('pms.masterSchedule.today')}
            </button>
          </div>
        </div>

        {/* Legend */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
          <div className="flex items-center flex-wrap gap-6">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('pms.masterSchedule.priority')}:</span>
            {Object.entries(PRIORITY_COLORS).map(([priority, colors]) => (
              <div key={priority} className="flex items-center gap-2">
                <div className="w-4 h-4 rounded" style={{ backgroundColor: colors.bar }}></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">{priority}</span>
              </div>
            ))}
            <div className="flex items-center gap-2 ml-4">
              <div className="w-4 h-4 bg-blue-600 rounded-full"></div>
              <span className="text-sm text-gray-600 dark:text-gray-400">{t('pms.masterSchedule.currentDueDate')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-purple-600 rounded-full"></div>
              <span className="text-sm text-gray-600 dark:text-gray-400">{t('pms.masterSchedule.nextDueDate')}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-600 rounded-full"></div>
              <span className="text-sm text-gray-600 dark:text-gray-400">{t('pms.masterSchedule.startDate')}</span>
            </div>
          </div>
        </div>

        {/* Gantt Chart */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            {/* Timeline Header */}
            <div className="flex border-b-2 border-gray-300 dark:border-gray-600">
              <div className="w-96 flex-shrink-0 bg-gray-50 dark:bg-gray-700 border-r-2 border-gray-300 dark:border-gray-600">
                <div className="p-4">
                  <div className="font-semibold text-gray-900 dark:text-gray-100">{t('pms.masterSchedule.taskEquipmentGroup')}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">{t('pms.masterSchedule.scheduleDetails')}</div>
                </div>
              </div>
              <div className="flex-1 min-w-[800px] bg-white dark:bg-gray-800">
                <div className="flex items-center h-full">
                  {/* For day view, show all days; for other views, show weekly markers */}
                  {(viewMode === 'day' 
                    ? days 
                    : days.filter((_, idx) => idx % 7 === 0 || idx === 0)
                  ).map((day, idx) => {
                    const isToday = day.toDateString() === today.toDateString();
                    
                    return (
                      <div
                        key={idx}
                        className={`flex-1 border-r border-gray-200 dark:border-gray-600 p-2 text-center ${
                          isToday ? 'bg-blue-50 dark:bg-blue-900/30' : 'bg-gray-50 dark:bg-gray-700'
                        }`}
                      >
                        <div className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                          {viewMode === 'day' 
                            ? day.toLocaleDateString('en-US', { weekday: 'short' })
                            : day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                          }
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {viewMode === 'day'
                            ? day.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            : day.toLocaleDateString('en-US', { weekday: 'short' })
                          }
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Task Rows */}
            <div className="relative bg-white dark:bg-gray-800">
              {tasks.length === 0 ? (
                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                  <Calendar className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                  <p>{t('pms.masterSchedule.noTasks')}</p>
                </div>
              ) : (
                tasks.map((task, idx) => {
                  const workPeriod = getWorkPeriod(task, days);
                  const duePos = getDatePosition(task.dueDate, days, 'end');
                  const priorityColors = getPriorityColors(task.priority);
                  
                  return (
                    <div key={task.id} className={`flex hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-gray-800' : 'bg-gray-50/50 dark:bg-gray-700/50'}`}>
                      {/* Task Info - Use priority-based background color */}
                      <div 
                        className="w-96 flex-shrink-0 border-r-2 border-gray-200 dark:border-gray-600 p-4"
                        style={{ backgroundColor: priorityColors.bg }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div 
                              className="font-semibold text-sm"
                              style={{ color: isDarkMode ? '#F3F4F6' : '#111827' }}
                            >
                              {task.name}
                            </div>
                            <div 
                              className="text-xs mt-1"
                              style={{ color: isDarkMode ? '#9CA3AF' : '#4B5563' }}
                            >
                              {task.groupName}
                            </div>
                            <div className="flex items-center gap-3 mt-2">
                              <span
                                className="px-2 py-0.5 rounded text-xs font-medium"
                                style={{ 
                                  backgroundColor: priorityColors.bar,
                                  color: 'white'
                                }}
                              >
                                {task.priority}
                              </span>
                              {task.isOverdue ? (
                                <span className="flex items-center gap-1 text-xs font-medium" style={{ color: '#DC2626' }}>
                                  <Clock className="w-3 h-3" />
                                  {t('pms.masterSchedule.overdue')}
                                </span>
                              ) : (
                                <span 
                                  className="text-xs"
                                  style={{ color: isDarkMode ? '#9CA3AF' : '#4B5563' }}
                                >
                                  {t('pms.masterSchedule.daysLeft', { days: task.daysUntilDue })}
                                </span>
                              )}
                            </div>
                            <div 
                              className="text-xs mt-2 space-y-0.5"
                              style={{ color: isDarkMode ? '#9CA3AF' : '#6B7280' }}
                            >
                              <div>{t('pms.masterSchedule.leadTime', { days: task.leadTimeDays })}</div>
                              {formatInterval(task) && <div>{formatInterval(task)}</div>}
                              {task.nextDueDate && (
                                <div className="text-purple-600 dark:text-purple-400 font-medium">
                                  🔄 {t('pms.masterSchedule.next', { date: task.nextDueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Timeline */}
                      <div className="flex-1 min-w-[800px] border-b border-gray-200 dark:border-gray-600 relative bg-white dark:bg-gray-800" style={{ minHeight: '90px' }}>
                        {/* Today Indicator */}
                        {(() => {
                          const todayPos = getDatePosition(today, days);
                          return todayPos !== null ? (
                            <div
                              className="absolute top-0 bottom-0 w-0.5 bg-blue-400 z-10"
                              style={{ left: `${todayPos}%` }}
                            >
                              <div className="absolute top-0 -translate-x-1/2 -translate-y-full pb-1">
                                <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/50 px-1 rounded whitespace-nowrap">
                                  {t('pms.masterSchedule.today').toUpperCase()}
                                </div>
                              </div>
                            </div>
                          ) : null;
                        })()}

                        {/* Date Grid */}
                        {days.filter((_, idx) => idx % 7 === 0 || idx === 0).map((_, idx, arr) => (
                          <div
                            key={idx}
                            className="absolute top-0 bottom-0 border-r border-gray-100 dark:border-gray-700"
                            style={{ left: `${(idx / arr.length) * 100}%` }}
                          ></div>
                        ))}

                        {/* Work Period Bar */}
                        {workPeriod && (
                          <div 
                            className="absolute top-1/2 transform -translate-y-1/2 rounded"
                            style={{ 
                              left: `${workPeriod.start}%`,
                              width: `${workPeriod.width}%`,
                              height: '20px',
                              backgroundColor: priorityColors.bar,
                              opacity: 0.7,
                              border: `2px solid ${priorityColors.bar}`
                            }}
                          />
                        )}

                        {/* Start Date Marker */}
                        {(() => {
                          const startPos = getDatePosition(task.startDate, days, 'start');
                          return startPos !== null ? (
                            <div className="absolute top-1/2 transform -translate-y-1/2 z-10" style={{ left: `${startPos}%` }}>
                              <div className="relative">
                                <div 
                                  className="w-6 h-6 rounded-full shadow-lg flex items-center justify-center ring-2 ring-white"
                                  style={{ backgroundColor: '#10B981' }}
                                >
                                  <div className="w-2 h-2 bg-white rounded-full"></div>
                                </div>
                                <div className="absolute bottom-full mb-1 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                                  <div className="text-xs font-medium text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 px-2 py-1 rounded shadow border border-gray-200 dark:border-gray-600">
                                    {t('pms.masterSchedule.start', { date: task.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) })}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null;
                        })()}

                        {/* Current Due Date Milestone */}
                        {duePos !== null && (
                          <div className="absolute top-1/2 transform -translate-y-1/2 z-20" style={{ left: `${duePos}%` }}>
                            <div className="relative -ml-3">
                              <div 
                                className="w-6 h-6 rounded-full shadow-lg flex items-center justify-center ring-2 ring-white"
                                style={{ backgroundColor: task.isOverdue ? '#EF4444' : '#2563EB' }}
                              >
                                <div className="w-2 h-2 bg-white rounded-full"></div>
                              </div>
                              <div className="absolute top-full mt-1 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                                <div className="text-xs font-medium text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 px-2 py-1 rounded shadow border-2 border-blue-600">
                                  {t('pms.masterSchedule.due', { date: task.dueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) })}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Next Due Date Milestone (if exists) */}
                        {task.nextDueDate && (() => {
                          const nextPos = getDatePosition(task.nextDueDate, days, 'end');
                          return nextPos !== null ? (
                            <div className="absolute top-1/2 transform -translate-y-1/2 z-20" style={{ left: `${nextPos}%` }}>
                              <div className="relative -ml-3">
                                <div 
                                  className="w-6 h-6 rounded-full shadow-lg flex items-center justify-center ring-2 ring-white"
                                  style={{ backgroundColor: '#9333EA' }}
                                >
                                  <div className="w-2 h-2 bg-white rounded-full"></div>
                                </div>
                                <div className="absolute top-full mt-1 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
                                  <div className="text-xs font-medium text-purple-900 dark:text-purple-100 bg-purple-50 dark:bg-purple-900 px-2 py-1 rounded shadow border-2 border-purple-600">
                                    🔄 {t('pms.masterSchedule.next', { date: task.nextDueDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) })}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};