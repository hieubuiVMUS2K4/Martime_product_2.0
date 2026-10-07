import React, { useState, useEffect } from 'react';
import { Calendar, Filter, Download, RefreshCw, Settings, AlertCircle } from 'lucide-react';
import { pmsService } from '../../services/pms.service';
import type { MaintenanceSchedule } from '../../types/pms.types';

type ViewMode = 'month' | 'quarter' | 'year';
type Department = 'ALL' | 'ENGINE' | 'DECK' | 'ELECTRICAL' | 'SAFETY' | 'OTHER';

// Native date helpers (replacing date-fns)
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const addMonths = (d: Date, n: number) => { const r = new Date(d); r.setMonth(r.getMonth() + n); return r; };
const eachDayOfInterval = (start: Date, end: Date) => {
  const days: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) { days.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
  return days;
};
const formatDate = (d: Date, fmt: string) => {
  if (fmt === 'yyyy-MM-dd') return d.toISOString().slice(0, 10);
  if (fmt === 'MMMM yyyy') return d.toLocaleDateString('en', { month: 'long', year: 'numeric' });
  return d.toLocaleDateString();
};

export const MasterSchedulePage: React.FC = () => {
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [selectedDepartment, setSelectedDepartment] = useState<Department>('ALL');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSchedules();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, selectedDepartment, currentDate]);

  const loadSchedules = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const start = getStartDate();
      const end = getEndDate();
      
      const data = await pmsService.getMasterSchedule(
        formatDate(start, 'yyyy-MM-dd'),
        formatDate(end, 'yyyy-MM-dd'),
        selectedDepartment === 'ALL' ? undefined : selectedDepartment
      );
      
      setSchedules(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load schedules');
      console.error('Error loading schedules:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStartDate = () => {
    switch (viewMode) {
      case 'month':
        return startOfMonth(currentDate);
      case 'quarter':
        return startOfMonth(currentDate);
      case 'year':
        return startOfMonth(currentDate);
      default:
        return startOfMonth(currentDate);
    }
  };

  const getEndDate = () => {
    switch (viewMode) {
      case 'month':
        return endOfMonth(currentDate);
      case 'quarter':
        return endOfMonth(addMonths(currentDate, 3));
      case 'year':
        return endOfMonth(addMonths(currentDate, 12));
      default:
        return endOfMonth(currentDate);
    }
  };

  const getDaysInView = () => {
    const start = getStartDate();
    const end = getEndDate();
    return eachDayOfInterval(start, end);
  };

  const getSchedulePosition = (schedule: MaintenanceSchedule) => {
    if (!schedule.nextDueDate) return null;
    
    const days = getDaysInView();
    const dueDate = new Date(schedule.nextDueDate);
    const index = days.findIndex((day: Date) => day.toDateString() === dueDate.toDateString());
    
    if (index === -1) return null;
    
    return {
      left: `${(index / days.length) * 100}%`,
      width: '2%' // Width of the marker
    };
  };

  const getCriticalityColor = (criticality?: string) => {
    switch (criticality) {
      case 'CRITICAL':
        return 'bg-red-600';
      case 'HIGH':
        return 'bg-orange-500';
      case 'MEDIUM':
        return 'bg-yellow-500';
      case 'LOW':
        return 'bg-[#1b4c7e]';
      default:
        return 'bg-gray-500';
    }
  };

  const getMaintenanceTypeColor = (type: string) => {
    switch (type) {
      case 'INSPECTION':
        return 'bg-[#dce9f8] text-primary';
      case 'SERVICE':
        return 'bg-green-100 text-green-800';
      case 'OVERHAUL':
        return 'bg-red-100 text-red-800';
      case 'CALIBRATION':
        return 'bg-purple-100 text-purple-800';
      case 'REPLACEMENT':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentDate(prev => addMonths(prev, direction === 'next' ? 1 : -1));
  };

  const exportToCSV = () => {
    const csvContent = [
      ['Schedule Name', 'Equipment', 'Department', 'Type', 'Next Due', 'Man Hours', 'Criticality'].join(','),
      ...schedules.map(s => [
        s.scheduleName,
        s.groupName || '',
        '',
        s.maintenanceCategory,
        s.nextDueDate || '',
        s.estimatedDurationHours,
        ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `master-schedule-${formatDate(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  const days = getDaysInView();
  const filteredSchedules = schedules.filter(s => s.nextDueDate);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Master Schedule</h1>
          <p className="text-sm text-gray-600 mt-1">
            Planned Maintenance System - Visual Timeline
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={loadSchedules}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          
          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          
          <button className="flex items-center gap-2 px-4 py-2 bg-[#0b2545] text-white rounded-lg hover:bg-[#16375f]">
            <Settings className="w-4 h-4" />
            Settings
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Department Filter */}
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value as Department)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e] focus:border-[#1b4c7e]"
              >
                <option value="ALL">All Departments</option>
                <option value="ENGINE">Engine</option>
                <option value="DECK">Deck</option>
                <option value="ELECTRICAL">Electrical</option>
                <option value="SAFETY">Safety</option>
                <option value="OTHER">Other</option>
              </select>
            </div>

            {/* View Mode */}
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-500" />
              <select
                value={viewMode}
                onChange={(e) => setViewMode(e.target.value as ViewMode)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e] focus:border-[#1b4c7e]"
              >
                <option value="month">Monthly View</option>
                <option value="quarter">Quarterly View</option>
                <option value="year">Yearly View</option>
              </select>
            </div>
          </div>

          {/* Date Navigation */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigateMonth('prev')}
              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              ←
            </button>
            <span className="text-lg font-semibold min-w-[200px] text-center">
              {formatDate(currentDate, 'MMMM yyyy')}
            </span>
            <button
              onClick={() => navigateMonth('next')}
              className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              →
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-3 py-2 text-sm text-[#0b2545] hover:underline"
            >
              Today
            </button>
          </div>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Total Schedules</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{schedules.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Due This Period</div>
          <div className="text-2xl font-bold text-[#0b2545] mt-1">{filteredSchedules.length}</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Total Man Hours</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">
            {schedules.reduce((sum, s) => sum + (s.estimatedDurationHours ?? 0), 0)}
          </div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="text-sm text-gray-600">Critical Tasks</div>
          <div className="text-2xl font-bold text-red-600 mt-1">
            {schedules.filter(s => s.groupName?.includes('CRITICAL')).length}
          </div>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold text-red-900">Error Loading Schedule</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Gantt Chart */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent"></div>
          </div>
        ) : filteredSchedules.length === 0 ? (
          <div className="text-center py-20">
            <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Schedules Found</h3>
            <p className="text-gray-600">No maintenance schedules are due in this period.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Timeline Header */}
            <div className="border-b border-gray-200 bg-gray-50">
              <div className="flex">
                <div className="w-80 flex-shrink-0 px-4 py-3 font-semibold text-gray-700 border-r border-gray-200">
                  Equipment / Schedule
                </div>
                <div className="flex-1 relative">
                  <div className="flex h-full">
                    {days.map((day: Date, index: number) => (
                      <div
                        key={index}
                        className="flex-1 px-1 py-3 text-center border-r border-gray-200 last:border-r-0"
                      >
                        <div className="text-xs font-medium text-gray-600">
                          {day.getDate()}
                        </div>
                        <div className="text-xs text-gray-400">
                          {day.toLocaleDateString('en', { weekday: 'short' })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Schedule Rows */}
            <div className="divide-y divide-gray-200">
              {filteredSchedules.map((schedule) => {
                const position = getSchedulePosition(schedule);
                if (!position) return null;

                return (
                  <div key={schedule.id} className="flex hover:bg-gray-50">
                    {/* Schedule Info */}
                    <div className="w-80 flex-shrink-0 px-4 py-3 border-r border-gray-200">
                      <div className="font-medium text-gray-900 text-sm mb-1">
                        {schedule.groupName}
                      </div>
                      <div className="text-xs text-gray-600 mb-2">
                        {schedule.scheduleName}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded ${getMaintenanceTypeColor(schedule.maintenanceCategory ?? '')}`}>
                          {schedule.maintenanceCategory}
                        </span>
                        <span className="text-xs text-gray-500">
                          {schedule.estimatedDurationHours}h
                        </span>
                      </div>
                    </div>

                    {/* Timeline */}
                    <div className="flex-1 relative py-3">
                      <div className="absolute inset-0 flex">
                        {days.map((day: Date, index: number) => (
                          <div
                            key={index}
                            className="flex-1 border-r border-gray-100 last:border-r-0"
                          />
                        ))}
                      </div>
                      
                      {/* Task Marker */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-8 rounded-lg shadow-md flex items-center justify-center cursor-pointer hover:shadow-lg transition-shadow"
                        style={{ left: position.left, width: '40px' }}
                        title={`Due: ${schedule.nextDueDate ? new Date(schedule.nextDueDate).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A'}`}
                      >
                        <div className={`w-3 h-3 rounded-full ${getCriticalityColor('')} border-2 border-white`} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Legend</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-600" />
            <span className="text-sm text-gray-700">Critical</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-orange-500" />
            <span className="text-sm text-gray-700">High Priority</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <span className="text-sm text-gray-700">Medium Priority</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#1b4c7e]" />
            <span className="text-sm text-gray-700">Low Priority</span>
          </div>
        </div>
      </div>
    </div>
  );
};

