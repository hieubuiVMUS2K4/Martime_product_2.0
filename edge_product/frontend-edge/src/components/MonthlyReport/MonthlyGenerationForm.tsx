/**
 * Monthly Report Generation Form
 * Form for generating comprehensive monthly summary reports
 */

import React from 'react';
import { 
  Loader2, CheckCircle, Calendar, BarChart, 
  AlertTriangle, X, Clock 
} from 'lucide-react';
import { GenerateMonthlyReportDto } from '../../types/aggregate-reports.types';

interface MonthlyGenerationFormProps {
  formData: GenerateMonthlyReportDto;
  onFormDataChange: (data: GenerateMonthlyReportDto) => void;
  onSubmit: (e: React.FormEvent) => void;
  loading: boolean;
  error: string | null;
  success: string | null;
  onErrorDismiss: () => void;
  onSuccessDismiss: () => void;
  currentMonth: number;
  currentYear: number;
  monthNames: string[];
}

export const MonthlyGenerationForm: React.FC<MonthlyGenerationFormProps> = ({
  formData,
  onFormDataChange,
  onSubmit,
  loading,
  error,
  success,
  onErrorDismiss,
  onSuccessDismiss,
  currentMonth,
  currentYear,
  monthNames,
}) => {
  return (
    <div className="bg-white rounded border border-gray-200">
      <div className="bg-blue-50 border-b border-gray-200 px-4 py-2.5">
        <h3 className="text-sm font-semibold flex items-center gap-2 text-gray-700">
          <BarChart className="w-4 h-4" />
          Generate Monthly Summary Report
        </h3>
        <p className="text-xs text-gray-500 mt-0.5">
          Comprehensive aggregation • {monthNames[formData.month - 1]} {formData.year}
        </p>
      </div>

      <form onSubmit={onSubmit} className="p-4 space-y-4">
        {/* Month & Year Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Month */}
          <div>
            <label htmlFor="month" className="block text-sm font-medium text-gray-700 mb-1.5">
              Month <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                id="month"
                value={formData.month}
                onChange={(e) => 
                  onFormDataChange({ ...formData, month: parseInt(e.target.value) })
                }
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all appearance-none bg-white"
                required
              >
                {monthNames.map((name, index) => (
                  <option key={index + 1} value={index + 1}>{name}</option>
                ))}
              </select>
            </div>
            <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Current month: {monthNames[currentMonth - 1]}
            </p>
          </div>

          {/* Year */}
          <div>
            <label htmlFor="year" className="block text-sm font-medium text-gray-700 mb-1.5">
              Year <span className="text-red-500">*</span>
            </label>
            <input
              id="year"
              type="number"
              min={2020}
              max={2050}
              value={formData.year}
              onChange={(e) => 
                onFormDataChange({ ...formData, year: parseInt(e.target.value) || currentYear })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Selected: {monthNames[formData.month - 1]} {formData.year}
            </p>
          </div>
        </div>

        {/* Remarks */}
        <div>
          <label htmlFor="remarks" className="block text-sm font-medium text-gray-700 mb-1.5">
            Executive Summary
          </label>
          <textarea
            id="remarks"
            value={formData.remarks || ''}
            onChange={(e) => 
              onFormDataChange({ ...formData, remarks: e.target.value })
            }
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
            placeholder="Key operational highlights, compliance notes, safety achievements, or significant events during the month..."
            maxLength={1000}
          />
          <p className="text-xs text-gray-500 mt-1">
            {(formData.remarks || '').length}/1000 characters
          </p>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 rounded-r-lg p-3 flex items-start gap-2 animate-fadeIn">
            <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-red-800">Generation Failed</h4>
              <p className="text-xs text-red-700 mt-0.5">{error}</p>
            </div>
            <button 
              type="button"
              onClick={onErrorDismiss} 
              className="text-red-400 hover:text-red-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border-l-4 border-green-400 rounded-r-lg p-3 flex items-start gap-2 animate-fadeIn">
            <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-green-800">Success!</h4>
              <p className="text-xs text-green-700 mt-0.5">{success}</p>
            </div>
            <button 
              type="button"
              onClick={onSuccessDismiss} 
              className="text-green-400 hover:text-green-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Submit Button */}
        <button 
          type="submit" 
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Generating Report...</span>
            </>
          ) : (
            <>
              <BarChart className="h-4 w-4 group-hover:scale-110 transition-transform" />
              <span>Generate Monthly Report</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
