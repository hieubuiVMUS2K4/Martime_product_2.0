import { PermissionGate } from '@/components/auth/PermissionGate'
/**
 * Position Report Creation Form
 * SOLAS V Reg 19.2.1.4 - Special Position Reporting
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MapPin, Save, Send, AlertTriangle, Ship } from 'lucide-react';
import { useCurrentAccountName } from '../../hooks/useCurrentAccountName';
import { maritimeService } from '../../services/maritime.service';
import { ReportingService } from '../../services/reporting.service';
import type { CreatePositionReportDto } from '../../types/reporting.types';
import {
  createSetFieldRef,
  extractBackendFieldErrors,
  focusFirstValidationError,
  getValidationInputClassName,
  renderValidationFieldError,
} from './reportFormValidation';

const POSITION_FIELD_NAME_MAP: Record<string, string> = {
  ReportDateTime: 'reportDateTime',
  VoyageId: 'voyageId',
  Latitude: 'latitude',
  Longitude: 'longitude',
  CourseOverGround: 'courseOverGround',
  SpeedOverGround: 'speedOverGround',
  ReportReason: 'reportReason',
  LastPort: 'lastPort',
  NextPort: 'nextPort',
  ETA: 'eta',
  CargoOnBoard: 'cargoOnBoard',
  CrewOnBoard: 'crewOnBoard',
  PreparedBy: 'preparedBy',
};

export function PositionReportForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const currentAccountName = useCurrentAccountName();
  const [loading, setLoading] = useState(false);
  const [loadingReport, setLoadingReport] = useState(isEditMode);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>>({});
  const setFieldRef = createSetFieldRef(fieldRefs);

  const [formData, setFormData] = useState<CreatePositionReportDto>({
    reportDateTime: new Date().toISOString().slice(0, 16),
    voyageId: undefined,
    latitude: 0,
    longitude: 0,
    reportReason: 'ROUTING',
  });

  useEffect(() => {
    if (isEditMode || formData.voyageId) {
      return;
    }

    const loadCurrentVoyage = async () => {
      try {
        const voyage = await maritimeService.voyage.getCurrent();
        if (voyage?.id) {
          setFormData((prev) => {
            if (prev.voyageId) {
              return prev;
            }

            return { ...prev, voyageId: String(voyage.id) };
          });
        }
      } catch {
        // Keep manual input available if no active voyage is found.
      }
    };

    void loadCurrentVoyage();
  }, [isEditMode, formData.voyageId]);

  useEffect(() => {
    if (isEditMode || !currentAccountName || formData.preparedBy?.trim()) {
      return;
    }

    setFormData((prev) => {
      if (prev.preparedBy?.trim()) {
        return prev;
      }

      return { ...prev, preparedBy: currentAccountName };
    });
  }, [currentAccountName, formData.preparedBy, isEditMode]);

  useEffect(() => {
    if (!isEditMode || !id) {
      return;
    }

    const loadReport = async () => {
      try {
        setLoadingReport(true);
        const report = await ReportingService.getPositionReport(id);
        setFormData({
          reportDateTime: report.reportDateTime.slice(0, 16),
          voyageId: report.voyageId,
          latitude: report.latitude,
          longitude: report.longitude,
          courseOverGround: report.courseOverGround,
          speedOverGround: report.speedOverGround,
          reportReason: report.reportReason,
          lastPort: report.lastPort,
          nextPort: report.nextPort,
          eta: report.eta ? report.eta.slice(0, 16) : undefined,
          cargoOnBoard: report.cargoOnBoard,
          crewOnBoard: report.crewOnBoard,
          remarks: report.remarks,
          preparedBy: report.preparedBy,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load position report');
      } finally {
        setLoadingReport(false);
      }
    };

    void loadReport();
  }, [id, isEditMode]);

  const handleChange = (field: keyof CreatePositionReportDto, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));

    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const nextErrors = { ...prev };
        delete nextErrors[field];
        return nextErrors;
      });
    }
  };

  const applyFieldErrors = (nextFieldErrors: Record<string, string>) => {
    setError(null);
    setFieldErrors(nextFieldErrors);

    if (Object.keys(nextFieldErrors).length > 0) {
      setTimeout(() => focusFirstValidationError(fieldRefs, nextFieldErrors), 100);
    }
  };

  const mapValidationMessageToField = (message: string): string | null => {
    const normalized = message.toLowerCase();

    if (normalized.includes('report date')) return 'reportDateTime';
    if (normalized.includes('voyage')) return 'voyageId';
    if (normalized.includes('report reason')) return 'reportReason';
    if (normalized.includes('null island') || normalized.includes('latitude')) return 'latitude';
    if (normalized.includes('longitude')) return 'longitude';
    if (normalized.includes('course')) return 'courseOverGround';
    if (normalized.includes('speed')) return 'speedOverGround';
    if (normalized.includes('cargo on board')) return 'cargoOnBoard';
    if (normalized.includes('crew on board')) return 'crewOnBoard';
    if (normalized.includes('prepared by')) return 'preparedBy';

    return null;
  };

  const validateForm = (): boolean => {
    const nextFieldErrors: Record<string, string> = {};

    if (!formData.reportDateTime) {
      nextFieldErrors.reportDateTime = 'Report date/time is required';
    }

    if (formData.latitude < -90 || formData.latitude > 90) {
      nextFieldErrors.latitude = 'Latitude must be between -90 and 90 degrees';
    }

    if (formData.longitude < -180 || formData.longitude > 180) {
      nextFieldErrors.longitude = 'Longitude must be between -180 and 180 degrees';
    }

    if (formData.latitude === 0 && formData.longitude === 0) {
      nextFieldErrors.latitude = 'Invalid position. Please enter actual latitude.';
      nextFieldErrors.longitude = 'Invalid position. Please enter actual longitude.';
    }

    if (formData.courseOverGround !== undefined && (formData.courseOverGround < 0 || formData.courseOverGround > 360)) {
      nextFieldErrors.courseOverGround = 'Course must be between 0 and 360 degrees';
    }

    if (formData.speedOverGround !== undefined && (formData.speedOverGround < 0 || formData.speedOverGround > 50)) {
      nextFieldErrors.speedOverGround = 'Speed must be between 0 and 50 knots';
    }

    if (!formData.reportReason?.trim()) {
      nextFieldErrors.reportReason = 'Report reason is required';
    }

    if (formData.cargoOnBoard !== undefined && formData.cargoOnBoard < 0) {
      nextFieldErrors.cargoOnBoard = 'Cargo on board cannot be negative';
    }

    if (formData.crewOnBoard !== undefined && formData.crewOnBoard < 0) {
      nextFieldErrors.crewOnBoard = 'Crew on board cannot be negative';
    }

    if (Object.keys(nextFieldErrors).length > 0) {
      applyFieldErrors(nextFieldErrors);
      return false;
    }

    setFieldErrors({});
    setError(null);
    return true;
  };

  const handleSubmit = async (asDraft = false) => {
    if (!asDraft && !validateForm()) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setFieldErrors({});

      if (isEditMode && id) {
        await ReportingService.updatePositionReport(id, formData);
        if (!asDraft) {
          await ReportingService.submitReport(id);
        }
      } else {
        const response = await ReportingService.createPositionReport(formData);
        if (!asDraft) {
          await ReportingService.submitReport(response.reportId);
        }
      }

      navigate('/reporting/reports');
    } catch (err: any) {
      const backendFieldErrors = extractBackendFieldErrors(err, POSITION_FIELD_NAME_MAP, mapValidationMessageToField);
      if (Object.keys(backendFieldErrors).length > 0) {
        applyFieldErrors(backendFieldErrors);
        return;
      }

      setError(err.message || 'Failed to create position report');
    } finally {
      setLoading(false);
    }
  };

  if (loadingReport) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <MapPin className="h-8 w-8 text-blue-600" />
            {isEditMode ? 'Edit Position Report' : 'Position Report'}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">SOLAS V Regulation 19.2.1.4 - Special Position Reporting</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <p className="text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        <form className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Report Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Report Date/Time <span className="text-red-600">*</span>
                </label>
                <input
                  ref={setFieldRef('reportDateTime')}
                  type="datetime-local"
                  value={formData.reportDateTime}
                  onChange={(e) => handleChange('reportDateTime', e.target.value)}
                  className={getValidationInputClassName(fieldErrors, 'reportDateTime')}
                  required
                />
                {renderValidationFieldError(fieldErrors, 'reportDateTime')}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Voyage ID</label>
                <input
                  ref={setFieldRef('voyageId')}
                  type="text"
                  value={formData.voyageId || ''}
                  onChange={(e) => handleChange('voyageId', e.target.value || undefined)}
                  placeholder="Auto-loaded from active voyage"
                  className={getValidationInputClassName(fieldErrors, 'voyageId')}
                />
                {renderValidationFieldError(fieldErrors, 'voyageId')}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Report Reason <span className="text-red-600">*</span>
                </label>
                <select
                  ref={setFieldRef('reportReason')}
                  value={formData.reportReason}
                  onChange={(e) => handleChange('reportReason', e.target.value)}
                  className={getValidationInputClassName(fieldErrors, 'reportReason')}
                  required
                >
                  <option value="ROUTING">Routing Report</option>
                  <option value="DEVIATION">Deviation from Route</option>
                  <option value="EMERGENCY">Emergency</option>
                  <option value="SEARCH_RESCUE">Search and Rescue</option>
                  <option value="SPECIAL_AREA">Special Area Transit</option>
                  <option value="PIRACY_AREA">High Risk/Piracy Area</option>
                  <option value="WEATHER">Severe Weather</option>
                  <option value="POLLUTION">Pollution Incident</option>
                  <option value="MEDICAL">Medical Emergency</option>
                  <option value="OTHER">Other</option>
                </select>
                {renderValidationFieldError(fieldErrors, 'reportReason')}
                <p className="text-xs text-gray-500 mt-1">Select reason for position report per SOLAS V</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <MapPin className="h-5 w-5 text-blue-600" />
              Current Position
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Latitude (°) <span className="text-red-600">*</span>
                </label>
                <input
                  ref={setFieldRef('latitude')}
                  type="number"
                  step="0.000001"
                  value={formData.latitude}
                  onChange={(e) => handleChange('latitude', parseFloat(e.target.value) || 0)}
                  className={getValidationInputClassName(fieldErrors, 'latitude')}
                  placeholder="e.g., 1.290270"
                  min="-90"
                  max="90"
                  required
                />
                {renderValidationFieldError(fieldErrors, 'latitude')}
                <p className="text-xs text-gray-500 mt-1">Range: -90 to 90 (North positive)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Longitude (°) <span className="text-red-600">*</span>
                </label>
                <input
                  ref={setFieldRef('longitude')}
                  type="number"
                  step="0.000001"
                  value={formData.longitude}
                  onChange={(e) => handleChange('longitude', parseFloat(e.target.value) || 0)}
                  className={getValidationInputClassName(fieldErrors, 'longitude')}
                  placeholder="e.g., 103.851959"
                  min="-180"
                  max="180"
                  required
                />
                {renderValidationFieldError(fieldErrors, 'longitude')}
                <p className="text-xs text-gray-500 mt-1">Range: -180 to 180 (East positive)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Course Over Ground (°)</label>
                <input
                  ref={setFieldRef('courseOverGround')}
                  type="number"
                  step="1"
                  value={formData.courseOverGround || ''}
                  onChange={(e) => handleChange('courseOverGround', parseFloat(e.target.value))}
                  className={getValidationInputClassName(fieldErrors, 'courseOverGround')}
                  min="0"
                  max="360"
                  placeholder="0-360"
                />
                {renderValidationFieldError(fieldErrors, 'courseOverGround')}
                <p className="text-xs text-gray-500 mt-1">Degrees true</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Speed Over Ground (knots)</label>
                <input
                  ref={setFieldRef('speedOverGround')}
                  type="number"
                  step="0.1"
                  value={formData.speedOverGround || ''}
                  onChange={(e) => handleChange('speedOverGround', parseFloat(e.target.value))}
                  className={getValidationInputClassName(fieldErrors, 'speedOverGround')}
                  min="0"
                  max="50"
                  placeholder="0-50"
                />
                {renderValidationFieldError(fieldErrors, 'speedOverGround')}
              </div>
            </div>

            {formData.latitude === 0 && formData.longitude === 0 && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <p className="text-sm text-yellow-800">Warning: Position (0,0) is Null Island. Please enter actual coordinates.</p>
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Ship className="h-5 w-5 text-blue-600" />
              Voyage Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Last Port</label>
                <input
                  ref={setFieldRef('lastPort')}
                  type="text"
                  value={formData.lastPort || ''}
                  onChange={(e) => handleChange('lastPort', e.target.value)}
                  placeholder="e.g., Port of Singapore"
                  className={getValidationInputClassName(fieldErrors, 'lastPort')}
                />
                {renderValidationFieldError(fieldErrors, 'lastPort')}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Next Port</label>
                <input
                  ref={setFieldRef('nextPort')}
                  type="text"
                  value={formData.nextPort || ''}
                  onChange={(e) => handleChange('nextPort', e.target.value)}
                  placeholder="e.g., Port of Hong Kong"
                  className={getValidationInputClassName(fieldErrors, 'nextPort')}
                />
                {renderValidationFieldError(fieldErrors, 'nextPort')}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">ETA at Next Port</label>
                <input
                  ref={setFieldRef('eta')}
                  type="datetime-local"
                  value={formData.eta || ''}
                  onChange={(e) => handleChange('eta', e.target.value)}
                  className={getValidationInputClassName(fieldErrors, 'eta')}
                />
                {renderValidationFieldError(fieldErrors, 'eta')}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Cargo & Personnel</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Cargo On Board (MT)</label>
                <input
                  ref={setFieldRef('cargoOnBoard')}
                  type="number"
                  step="0.1"
                  value={formData.cargoOnBoard || ''}
                  onChange={(e) => handleChange('cargoOnBoard', parseFloat(e.target.value))}
                  className={getValidationInputClassName(fieldErrors, 'cargoOnBoard')}
                  min="0"
                />
                {renderValidationFieldError(fieldErrors, 'cargoOnBoard')}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Crew On Board</label>
                <input
                  ref={setFieldRef('crewOnBoard')}
                  type="number"
                  value={formData.crewOnBoard || ''}
                  onChange={(e) => handleChange('crewOnBoard', parseInt(e.target.value, 10))}
                  className={getValidationInputClassName(fieldErrors, 'crewOnBoard')}
                  min="0"
                />
                {renderValidationFieldError(fieldErrors, 'crewOnBoard')}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Remarks</h2>
            <textarea
              ref={setFieldRef('remarks')}
              value={formData.remarks || ''}
              onChange={(e) => handleChange('remarks', e.target.value)}
              rows={4}
              placeholder="Provide details about the situation requiring this position report..."
              className={getValidationInputClassName(fieldErrors, 'remarks')}
            />
            {renderValidationFieldError(fieldErrors, 'remarks')}
            <p className="text-xs text-gray-500 mt-1">
              {formData.reportReason === 'EMERGENCY' && 'For emergencies, include nature of emergency and assistance required.'}
              {formData.reportReason === 'PIRACY_AREA' && 'For piracy areas, include security measures taken.'}
              {formData.reportReason === 'POLLUTION' && 'For pollution, include substance type, quantity, and actions taken.'}
              {formData.reportReason === 'MEDICAL' && 'For medical emergencies, include patient condition and treatment needed.'}
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Prepared By</label>
              <input
                ref={setFieldRef('preparedBy')}
                type="text"
                value={formData.preparedBy || ''}
                onChange={(e) => handleChange('preparedBy', e.target.value)}
                placeholder="Officer name and rank"
                className={getValidationInputClassName(fieldErrors, 'preparedBy')}
              />
              {renderValidationFieldError(fieldErrors, 'preparedBy')}
            </div>
          </div>

          <div className="flex gap-4 justify-end">
            <button
              type="button"
              onClick={() => navigate('/reporting/reports')}
              className="px-6 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <PermissionGate permission={id ? 'reporting.update' : 'reporting.create'}><button
              type="button"
              onClick={() => handleSubmit(true)}
              className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
              disabled={loading}
            >
              <Save className="h-5 w-5" />
              {loading ? 'Saving...' : isEditMode ? 'Update Draft' : 'Save Draft'}
            </button></PermissionGate>
            <PermissionGate permission={id ? 'reporting.update' : 'reporting.create'}><button
              type="button"
              onClick={() => handleSubmit(false)}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              disabled={loading}
            >
              <Send className="h-5 w-5" />
              {loading ? 'Submitting...' : isEditMode ? 'Update & Submit' : 'Submit Report'}
            </button></PermissionGate>
          </div>
        </form>
      </div>
    </div>
  );
}