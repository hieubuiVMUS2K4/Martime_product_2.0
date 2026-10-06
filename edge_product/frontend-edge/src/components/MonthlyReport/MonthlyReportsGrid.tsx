/**
 * Monthly Reports Grid/List Display
 * Container for displaying all monthly reports
 */

import React from 'react';
import { Loader2, FileText } from 'lucide-react';
import { MonthlyReportDto, ViewMode } from '../../types/aggregate-reports.types';
import { MonthlyReportCard } from './MonthlyReportCard';

interface MonthlyReportsGridProps {
  reports: MonthlyReportDto[];
  loading: boolean;
  year: number;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  onReportClick: (reportId: string) => void;
  monthNames: string[];
}

export const MonthlyReportsGrid: React.FC<MonthlyReportsGridProps> = ({
  reports,
  loading,
  year,
  viewMode,
  onViewModeChange,
  onReportClick,
  monthNames,
}) => {
  return (
    <div className="bg-white rounded border border-gray-200">
      <div className="bg-blue-50 border-b border-gray-200 px-4 py-2.5 flex flex-wrap gap-3 justify-between items-center">
        <div>
          <h3 className="text-sm font-semibold text-gray-700">
            Monthly Reports {year}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {loading ? 'Loading...' : `${reports.length} reports found`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onViewModeChange('grid')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'grid' 
                ? 'bg-blue-100 text-blue-700'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
            aria-label="Switch to grid view"
            aria-pressed={viewMode === 'grid'}
          >
            Grid
          </button>
          <button
            onClick={() => onViewModeChange('list')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              viewMode === 'list' 
                ? 'bg-blue-100 text-blue-700'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
            aria-label="Switch to list view"
            aria-pressed={viewMode === 'list'}
          >
            List
          </button>
        </div>
      </div>

      <div className="p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : reports.length === 0 ? (
          <EmptyState year={year} />
        ) : (
          <div className={viewMode === 'grid' 
            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" 
            : "space-y-3"
          }>
            {reports.map((report) => (
              <MonthlyReportCard 
                key={report.id} 
                report={report} 
                onClick={() => onReportClick(report.id)}
                viewMode={viewMode}
                monthNames={monthNames}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================================
// EMPTY STATE
// ============================================================

const EmptyState: React.FC<{ year: number }> = ({ year }) => (
  <div className="text-center py-12">
    <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
    <p className="text-gray-500">No monthly reports found for {year}</p>
    <p className="text-sm text-gray-400 mt-1">Generate your first monthly report above</p>
  </div>
);
