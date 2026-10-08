/**
 * Weekly Report Edit Modal
 * Form to edit remarks, status, and master signature
 */

import React, { useState, useEffect } from 'react';
import { X, Save, AlertCircle } from 'lucide-react';
import { WeeklyReportDto } from '../../types/aggregate-reports.types';
import { ReportingService } from '../../services/reporting.service';
import { useCurrentAccountName } from '../../hooks/useCurrentAccountName';

interface WeeklyReportEditModalProps {
  report: WeeklyReportDto;
  onClose: () => void;
  onSaved: () => void;
}

export const WeeklyReportEditModal: React.FC<WeeklyReportEditModalProps> = ({ 
  report, 
  onClose, 
  onSaved 
}) => {
  const currentAccountName = useCurrentAccountName();
  const [formData, setFormData] = useState({
    remarks: report.remarks || '',
    masterSignature: report.masterSignature || '',
      status: report.status || 'DRAFT' as 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'TRANSMITTED'
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [loading, onClose]);

  useEffect(() => {
    if (!currentAccountName) {
      return;
    }

    setFormData((prev) => ({
      ...prev,
      masterSignature: prev.masterSignature.trim() ? prev.masterSignature : currentAccountName,
    }));
  }, [currentAccountName]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await ReportingService.updateWeeklyReport(report.id, formData);
      onSaved();
      onClose();
    } catch (err: any) {
      console.error('Failed to update weekly report:', err);
      setError(err?.response?.data?.error || err.message || 'Failed to update report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold">Edit Weekly Report</h2>
            <p className="text-blue-100 text-sm mt-1">{report.reportNumber}</p>
          </div>
          <button 
            onClick={onClose}
            disabled={loading}
            className="p-2 hover:bg-white hover:bg-opacity-20 rounded-full transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-800">Error</p>
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
          )}

          {/* Status */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Report Status
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            >
              <option value="DRAFT">Draft</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
              <option value="TRANSMITTED">Transmitted</option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              Change report workflow status
            </p>
          </div>

          {/* Master Signature */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Master Signature
            </label>
            <input
              type="text"
              value={formData.masterSignature}
              onChange={(e) => setFormData({ ...formData, masterSignature: e.target.value })}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Captain's name or signature"
              disabled={loading}
            />
            <p className="text-xs text-gray-500 mt-1">
              Digital signature will be timestamped automatically
            </p>
          </div>

          {/* Remarks */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Remarks & Notes
            </label>
            <textarea
              value={formData.remarks}
              onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
              rows={6}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              placeholder="Add any additional observations, weather conditions, or operational notes..."
              disabled={loading}
            />
            <p className="text-xs text-gray-500 mt-1">
              {formData.remarks.length} characters
            </p>
          </div>

          {/* Info Note */}
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <p className="text-sm text-yellow-800">
              <strong>Note:</strong> Aggregated data (distance, fuel, speed) cannot be edited. 
              These values are calculated from daily Noon Reports.
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex justify-between items-center bg-gray-50">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 
                     disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Changes
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
