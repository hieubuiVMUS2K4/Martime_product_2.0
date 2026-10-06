import { PermissionGate } from '@/components/auth/PermissionGate'
/**
 * Departure Report Form
 * SOLAS Compliant - Port Departure Notification
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Anchor, MapPin, Save, Send, Ship, User } from 'lucide-react';
import { useCurrentAccountName } from '../../hooks/useCurrentAccountName';
import { useOfflineDraft } from '../../hooks/useOfflineDraft';
import { maritimeService } from '../../services/maritime.service';
import { ReportingService } from '../../services/reporting.service';
import type { CreateDepartureReportDto } from '../../types/reporting.types';
import {
  createSetFieldRef,
  extractBackendFieldErrors,
  focusFirstValidationError,
  getValidationInputClassName,
  renderValidationFieldError,
} from './reportFormValidation';

const DEPARTURE_FIELD_NAME_MAP: Record<string, string> = {
  VoyageId: 'voyageId',
  PortName: 'portName',
  PortCode: 'portCode',
  DepartureDateTime: 'departureDateTime',
  PilotOffTime: 'pilotOffTime',
  LastLineLetGoTime: 'lastLineLetGoTime',
  DepartureLatitude: 'departureLatitude',
  DepartureLongitude: 'departureLongitude',
  DraftForward: 'draftForward',
  DraftAft: 'draftAft',
  DraftMidship: 'draftMidship',
  FuelOilROB: 'fuelOilROB',
  DieselOilROB: 'dieselOilROB',
  LubOilROB: 'lubOilROB',
  FreshWaterROB: 'freshWaterROB',
  CargoOnBoard: 'cargoOnBoard',
  CrewOnBoard: 'crewOnBoard',
  PassengersOnBoard: 'passengersOnBoard',
  DestinationPort: 'destinationPort',
  NextPortCode: 'nextPortCode',
  DistanceToNextPort: 'distanceToNextPort',
  EstimatedArrival: 'estimatedArrival',
  PreparedBy: 'preparedBy',
};

export function DepartureReportForm() {
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

  const [formData, setFormData] = useState<CreateDepartureReportDto>({
    departureDateTime: new Date().toISOString().slice(0, 16),
    voyageId: undefined,
    portName: '',
    draftForward: 0,
    draftAft: 0,
  });

  const { hasDraft, restoreDraft, clearDraft, restoredDraft, lastSaved } = useOfflineDraft<CreateDepartureReportDto>(
    isEditMode ? `departure-report-edit-${id}` : 'departure-report-new',
    formData,
    (restored) => setFormData(restored)
  );

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
        // Leave voyage selection/manual entry available when no active voyage exists.
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
        const report = await ReportingService.getDepartureReport(id);
        setFormData({
          departureDateTime: report.departureDateTime.slice(0, 16),
          voyageId: report.voyageId,
          portName: report.portName,
          portCode: report.portCode,
          pilotOffTime: report.pilotOffTime ? report.pilotOffTime.slice(11, 16) : undefined,
          lastLineLetGoTime: report.lastLineLetGoTime ? report.lastLineLetGoTime.slice(11, 16) : undefined,
          departureLatitude: report.departureLatitude,
          departureLongitude: report.departureLongitude,
          draftForward: report.draftForward,
          draftAft: report.draftAft,
          draftMidship: report.draftMidship,
          fuelOilROB: report.fuelOilROB,
          dieselOilROB: report.dieselOilROB,
          lubOilROB: report.lubOilROB,
          freshWaterROB: report.freshWaterROB,
          cargoOnBoard: report.cargoOnBoard,
          cargoDescription: report.cargoDescription,
          crewOnBoard: report.crewOnBoard,
          passengersOnBoard: report.passengersOnBoard,
          destinationPort: report.destinationPort,
          nextPortCode: report.nextPortCode,
          distanceToNextPort: report.distanceToNextPort,
          estimatedArrival: report.estimatedArrival ? report.estimatedArrival.slice(0, 16) : undefined,
          remarks: report.remarks,
          preparedBy: report.preparedBy,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load departure report');
      } finally {
        setLoadingReport(false);
      }
    };

    void loadReport();
  }, [id, isEditMode]);

  const handleChange = (field: keyof CreateDepartureReportDto, value: any) => {
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

  const combineWithDepartureDate = (timeValue?: string) => {
    if (!timeValue) {
      return undefined;
    }

    if (timeValue.includes('T')) {
      return timeValue;
    }

    return `${formData.departureDateTime.slice(0, 10)}T${timeValue}`;
  };

  const mapValidationMessageToField = (message: string): string | null => {
    const normalized = message.toLowerCase();

    if (normalized.includes('port name')) return 'portName';
    if (normalized.includes('departure date')) return 'departureDateTime';
    if (normalized.includes('voyage')) return 'voyageId';
    if (normalized.includes('draft forward')) return 'draftForward';
    if (normalized.includes('draft aft')) return 'draftAft';
    if (normalized.includes('draft midship')) return 'draftMidship';
    if (normalized.includes('departure latitude')) return 'departureLatitude';
    if (normalized.includes('departure longitude')) return 'departureLongitude';
    if (normalized.includes('fuel oil rob')) return 'fuelOilROB';
    if (normalized.includes('diesel oil rob')) return 'dieselOilROB';
    if (normalized.includes('lub oil rob')) return 'lubOilROB';
    if (normalized.includes('fresh water rob')) return 'freshWaterROB';
    if (normalized.includes('cargo on board')) return 'cargoOnBoard';
    if (normalized.includes('crew on board')) return 'crewOnBoard';
    if (normalized.includes('passengers on board')) return 'passengersOnBoard';
    if (normalized.includes('next port code')) return 'nextPortCode';
    if (normalized.includes('distance to next port')) return 'distanceToNextPort';
    if (normalized.includes('prepared by')) return 'preparedBy';

    return null;
  };

  const validateForm = (): boolean => {
    const nextFieldErrors: Record<string, string> = {};

    if (!formData.portName?.trim()) {
      nextFieldErrors.portName = 'Port name is required';
    }

    if (!formData.departureDateTime) {
      nextFieldErrors.departureDateTime = 'Departure date/time is required';
    }

    if (formData.draftForward !== undefined && formData.draftForward < 0) {
      nextFieldErrors.draftForward = 'Draft forward cannot be negative';
    }

    if (formData.draftAft !== undefined && formData.draftAft < 0) {
      nextFieldErrors.draftAft = 'Draft aft cannot be negative';
    }

    if (formData.draftMidship !== undefined && formData.draftMidship < 0) {
      nextFieldErrors.draftMidship = 'Draft midship cannot be negative';
    }

    if (formData.departureLatitude !== undefined && (formData.departureLatitude < -90 || formData.departureLatitude > 90)) {
      nextFieldErrors.departureLatitude = 'Departure latitude must be between -90 and 90 degrees';
    }

    if (formData.departureLongitude !== undefined && (formData.departureLongitude < -180 || formData.departureLongitude > 180)) {
      nextFieldErrors.departureLongitude = 'Departure longitude must be between -180 and 180 degrees';
    }

    if (formData.fuelOilROB !== undefined && formData.fuelOilROB < 0) {
      nextFieldErrors.fuelOilROB = 'Fuel Oil ROB cannot be negative';
    }

    if (formData.dieselOilROB !== undefined && formData.dieselOilROB < 0) {
      nextFieldErrors.dieselOilROB = 'Diesel Oil ROB cannot be negative';
    }

    if (formData.lubOilROB !== undefined && formData.lubOilROB < 0) {
      nextFieldErrors.lubOilROB = 'Lub Oil ROB cannot be negative';
    }

    if (formData.freshWaterROB !== undefined && formData.freshWaterROB < 0) {
      nextFieldErrors.freshWaterROB = 'Fresh water ROB cannot be negative';
    }

    if (formData.cargoOnBoard !== undefined && formData.cargoOnBoard < 0) {
      nextFieldErrors.cargoOnBoard = 'Cargo on board cannot be negative';
    }

    if (formData.distanceToNextPort !== undefined && formData.distanceToNextPort < 0) {
      nextFieldErrors.distanceToNextPort = 'Distance to next port cannot be negative';
    }

    if (formData.crewOnBoard !== undefined && formData.crewOnBoard < 0) {
      nextFieldErrors.crewOnBoard = 'Crew on board cannot be negative';
    }

    if (formData.passengersOnBoard !== undefined && formData.passengersOnBoard < 0) {
      nextFieldErrors.passengersOnBoard = 'Passengers on board cannot be negative';
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

      const cleanedData = {
        ...formData,
        voyageId: formData.voyageId && formData.voyageId.trim() !== '' ? formData.voyageId : undefined,
        pilotOffTime: combineWithDepartureDate(formData.pilotOffTime),
        lastLineLetGoTime: combineWithDepartureDate(formData.lastLineLetGoTime),
      };

      if (isEditMode && id) {
        await ReportingService.updateDepartureReport(id, cleanedData);
        if (!asDraft) {
          await ReportingService.submitReport(id);
        }
      } else {
        const report = await ReportingService.createDepartureReport(cleanedData);
        if (!asDraft) {
          await ReportingService.submitReport(report.reportId);
        }
      }

      await clearDraft();
      navigate('/reporting/reports');
    } catch (err) {
      const backendFieldErrors = extractBackendFieldErrors(err, DEPARTURE_FIELD_NAME_MAP, mapValidationMessageToField);
      if (Object.keys(backendFieldErrors).length > 0) {
        applyFieldErrors(backendFieldErrors);
        return;
      }

      setError(err instanceof Error ? err.message : 'Failed to create report');
    } finally {
      setLoading(false);
    }
  };

  if (loadingReport) {
    return (
      <div className="p-6 max-w-5xl mx-auto flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <Anchor className="h-8 w-8 text-blue-600" />
          {isEditMode ? 'Edit Departure Report' : 'Departure Report'}
        </h1>
        <p className="text-gray-600 mt-2">SOLAS Compliant Port Departure Notification</p>
      </div>

      {hasDraft && restoredDraft && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-lg mb-6 flex items-center justify-between shadow-sm">
          <div>
            <p className="font-semibold text-sm">Phát hiện bản nháp chưa lưu!</p>
            <p className="text-xs text-gray-600 mt-0.5">Tự động sao lưu ngoại tuyến vào lúc {lastSaved ? new Date(lastSaved).toLocaleTimeString() : ''}. Bạn có muốn khôi phục không?</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={restoreDraft}
              className="bg-amber-600 hover:bg-amber-700 text-white text-xs px-3 py-1.5 rounded font-semibold transition-colors shadow-sm"
            >
              Khôi phục
            </button>
            <button
              type="button"
              onClick={clearDraft}
              className="bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 text-xs px-3 py-1.5 rounded transition-colors"
            >
              Xóa nháp
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          <p className="font-semibold">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      <form className="space-y-6">
        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Departure Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Departure Date/Time <span className="text-red-600">*</span>
              </label>
              <input
                ref={setFieldRef('departureDateTime')}
                type="datetime-local"
                value={formData.departureDateTime}
                onChange={(e) => handleChange('departureDateTime', e.target.value)}
                className={getValidationInputClassName(fieldErrors, 'departureDateTime')}
                required
              />
              {renderValidationFieldError(fieldErrors, 'departureDateTime')}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Voyage ID (Optional)</label>
              <input
                ref={setFieldRef('voyageId')}
                type="text"
                value={formData.voyageId || ''}
                onChange={(e) => handleChange('voyageId', e.target.value || undefined)}
                className={getValidationInputClassName(fieldErrors, 'voyageId')}
                placeholder="Leave empty if no voyage"
              />
              {renderValidationFieldError(fieldErrors, 'voyageId')}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-blue-600" />
            Port Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Port Name <span className="text-red-600">*</span>
              </label>
              <input
                ref={setFieldRef('portName')}
                type="text"
                value={formData.portName}
                onChange={(e) => handleChange('portName', e.target.value)}
                placeholder="e.g., Port of Singapore"
                className={getValidationInputClassName(fieldErrors, 'portName')}
                required
              />
              {renderValidationFieldError(fieldErrors, 'portName')}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Port Code (UN/LOCODE)</label>
              <input
                ref={setFieldRef('portCode')}
                type="text"
                value={formData.portCode || ''}
                onChange={(e) => handleChange('portCode', e.target.value)}
                placeholder="e.g., SGSIN"
                className={getValidationInputClassName(fieldErrors, 'portCode')}
                maxLength={5}
              />
              {renderValidationFieldError(fieldErrors, 'portCode')}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <User className="h-5 w-5 text-blue-600" />
            Pilot Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Pilot Off Time</label>
              <input
                type="time"
                value={formData.pilotOffTime || ''}
                onChange={(e) => handleChange('pilotOffTime', e.target.value)}
                className={getValidationInputClassName(fieldErrors, 'pilotOffTime')}
              />
              {renderValidationFieldError(fieldErrors, 'pilotOffTime')}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Last Line Let Go Time</label>
              <input
                type="time"
                value={formData.lastLineLetGoTime || ''}
                onChange={(e) => handleChange('lastLineLetGoTime', e.target.value)}
                className={getValidationInputClassName(fieldErrors, 'lastLineLetGoTime')}
              />
              {renderValidationFieldError(fieldErrors, 'lastLineLetGoTime')}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Departure Latitude</label>
              <input
                ref={setFieldRef('departureLatitude')}
                type="number"
                step="0.000001"
                value={formData.departureLatitude ?? ''}
                onChange={(e) => handleChange('departureLatitude', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                className={getValidationInputClassName(fieldErrors, 'departureLatitude')}
                min="-90"
                max="90"
              />
              {renderValidationFieldError(fieldErrors, 'departureLatitude')}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Departure Longitude</label>
              <input
                ref={setFieldRef('departureLongitude')}
                type="number"
                step="0.000001"
                value={formData.departureLongitude ?? ''}
                onChange={(e) => handleChange('departureLongitude', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                className={getValidationInputClassName(fieldErrors, 'departureLongitude')}
                min="-180"
                max="180"
              />
              {renderValidationFieldError(fieldErrors, 'departureLongitude')}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Ship className="h-5 w-5 text-blue-600" />
            Vessel Draft
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Draft Forward (meters)</label>
              <input
                ref={setFieldRef('draftForward')}
                type="number"
                step="0.01"
                value={formData.draftForward}
                onChange={(e) => handleChange('draftForward', parseFloat(e.target.value) || 0)}
                className={getValidationInputClassName(fieldErrors, 'draftForward')}
                min="0"
              />
              {renderValidationFieldError(fieldErrors, 'draftForward')}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Draft Aft (meters)</label>
              <input
                ref={setFieldRef('draftAft')}
                type="number"
                step="0.01"
                value={formData.draftAft}
                onChange={(e) => handleChange('draftAft', parseFloat(e.target.value) || 0)}
                className={getValidationInputClassName(fieldErrors, 'draftAft')}
                min="0"
              />
              {renderValidationFieldError(fieldErrors, 'draftAft')}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Draft Midship (meters)</label>
              <input
                ref={setFieldRef('draftMidship')}
                type="number"
                step="0.01"
                value={formData.draftMidship || ''}
                onChange={(e) => handleChange('draftMidship', parseFloat(e.target.value) || 0)}
                className={getValidationInputClassName(fieldErrors, 'draftMidship')}
                min="0"
              />
              {renderValidationFieldError(fieldErrors, 'draftMidship')}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Cargo & Fuel Status</h2>
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
              <label className="block text-sm font-medium text-gray-700 mb-2">Cargo Description</label>
              <input
                type="text"
                value={formData.cargoDescription || ''}
                onChange={(e) => handleChange('cargoDescription', e.target.value)}
                className={getValidationInputClassName(fieldErrors, 'cargoDescription')}
                placeholder="Type of cargo"
              />
              {renderValidationFieldError(fieldErrors, 'cargoDescription')}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Fuel Oil ROB (MT)</label>
              <input
                ref={setFieldRef('fuelOilROB')}
                type="number"
                step="0.1"
                value={formData.fuelOilROB || ''}
                onChange={(e) => handleChange('fuelOilROB', parseFloat(e.target.value))}
                className={getValidationInputClassName(fieldErrors, 'fuelOilROB')}
                min="0"
              />
              {renderValidationFieldError(fieldErrors, 'fuelOilROB')}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Diesel Oil ROB (MT)</label>
              <input
                ref={setFieldRef('dieselOilROB')}
                type="number"
                step="0.1"
                value={formData.dieselOilROB || ''}
                onChange={(e) => handleChange('dieselOilROB', parseFloat(e.target.value))}
                className={getValidationInputClassName(fieldErrors, 'dieselOilROB')}
                min="0"
              />
              {renderValidationFieldError(fieldErrors, 'dieselOilROB')}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Lub Oil ROB</label>
              <input
                ref={setFieldRef('lubOilROB')}
                type="number"
                step="0.1"
                value={formData.lubOilROB ?? ''}
                onChange={(e) => handleChange('lubOilROB', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                className={getValidationInputClassName(fieldErrors, 'lubOilROB')}
                min="0"
              />
              {renderValidationFieldError(fieldErrors, 'lubOilROB')}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Fresh Water ROB</label>
              <input
                ref={setFieldRef('freshWaterROB')}
                type="number"
                step="0.1"
                value={formData.freshWaterROB ?? ''}
                onChange={(e) => handleChange('freshWaterROB', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                className={getValidationInputClassName(fieldErrors, 'freshWaterROB')}
                min="0"
              />
              {renderValidationFieldError(fieldErrors, 'freshWaterROB')}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Destination Port</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Destination Port</label>
              <input
                type="text"
                value={formData.destinationPort || ''}
                onChange={(e) => handleChange('destinationPort', e.target.value)}
                placeholder="Destination port"
                className={getValidationInputClassName(fieldErrors, 'destinationPort')}
              />
              {renderValidationFieldError(fieldErrors, 'destinationPort')}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Next Port Code</label>
              <input
                type="text"
                value={formData.nextPortCode || ''}
                onChange={(e) => handleChange('nextPortCode', e.target.value || undefined)}
                placeholder="UN/LOCODE"
                className={getValidationInputClassName(fieldErrors, 'nextPortCode')}
                maxLength={10}
              />
              {renderValidationFieldError(fieldErrors, 'nextPortCode')}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Distance To Next Port (nm)</label>
              <input
                ref={setFieldRef('distanceToNextPort')}
                type="number"
                step="0.1"
                value={formData.distanceToNextPort ?? ''}
                onChange={(e) => handleChange('distanceToNextPort', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                className={getValidationInputClassName(fieldErrors, 'distanceToNextPort')}
                min="0"
              />
              {renderValidationFieldError(fieldErrors, 'distanceToNextPort')}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Estimated Arrival</label>
              <input
                type="datetime-local"
                value={formData.estimatedArrival || ''}
                onChange={(e) => handleChange('estimatedArrival', e.target.value)}
                className={getValidationInputClassName(fieldErrors, 'estimatedArrival')}
              />
              {renderValidationFieldError(fieldErrors, 'estimatedArrival')}
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
            placeholder="Additional information, incidents, or observations..."
            className={getValidationInputClassName(fieldErrors, 'remarks')}
          />
          {renderValidationFieldError(fieldErrors, 'remarks')}
        </div>

        <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Prepared By</label>
            <input
              ref={setFieldRef('preparedBy')}
              type="text"
              value={formData.preparedBy || ''}
              onChange={(e) => handleChange('preparedBy', e.target.value)}
              placeholder="Officer name"
              className={getValidationInputClassName(fieldErrors, 'preparedBy')}
            />
            {renderValidationFieldError(fieldErrors, 'preparedBy')}
          </div>
        </div>

        <div className="flex gap-4 justify-end">
          <button
            type="button"
            onClick={() => navigate('/reporting/reports')}
            className="px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
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
            <Save className="h-4 w-4" />
            {isEditMode ? 'Update Draft' : 'Save as Draft'}
          </button></PermissionGate>

          <PermissionGate permission={id ? 'reporting.update' : 'reporting.create'}><button
            type="button"
            onClick={() => handleSubmit(false)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            disabled={loading}
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <Send className="h-4 w-4" />
            )}
            {isEditMode ? 'Update & Submit' : 'Submit Report'}
          </button></PermissionGate>
        </div>

        {lastSaved && (
          <p className="text-xs text-gray-400 text-right mt-2 italic flex items-center justify-end gap-1 select-none">
            <span className="inline-block w-1.5 h-1.5 bg-green-500 rounded-full animate-ping"></span>
            Tự động sao lưu ngoại tuyến hoạt động: Đã lưu nháp lúc {new Date(lastSaved).toLocaleTimeString()}
          </p>
        )}
      </form>
    </div>
  );
}