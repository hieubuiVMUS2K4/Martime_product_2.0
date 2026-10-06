import { PermissionGate } from '@/components/auth/PermissionGate'
/**
 * Noon Report Creation/Edit Form
 * IMO/SOLAS Compliant Maritime Reporting
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { 
  Ship, 
  MapPin, 
  Cloud, 
  Fuel, 
  Gauge, 
  Anchor,
  Save,
  Send,
  AlertTriangle,
  Wrench,
  CheckCircle2,
  Users,
  Loader2
} from 'lucide-react';
import { ReportingService } from '../../services/reporting.service';
import { getTasksCompletedLast24Hours, calculateManHours, toTaskSummary } from '../../services/maintenance.service';
import { maritimeService } from '../../services/maritime.service';
import { useCurrentAccountName } from '../../hooks/useCurrentAccountName';
import type { CreateNoonReportDto } from '../../types/reporting.types';
import type { TaskSummary } from '../../types/maintenance.types';

function formatSparePartsUsed(value?: string | null): string {
  if (!value) return '';
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return value;

    return parsed
      .map((part) => {
        const name = part.materialName || part.materialCode || part.itemName || part.itemCode || part.materialItemId;
        const qty = part.quantityUsed ?? part.quantity ?? part.quantityRequired;
        return qty != null ? `${name} x${qty}` : name;
      })
      .filter(Boolean)
      .join(', ');
  } catch {
    return value;
  }
}

export function NoonReportForm() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>(); // Get ID from URL if editing
  const isEditMode = !!id; // Edit mode if ID exists
  const currentAccountName = useCurrentAccountName();
  const loadedDraftKeysRef = useRef<Set<string>>(new Set());
  
  const [loading, setLoading] = useState(false);
  const [loadingReport, setLoadingReport] = useState(isEditMode);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [lastAutoSave, setLastAutoSave] = useState<Date | null>(null);
  
  // Refs for scrolling to error fields
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null>>({});
  
  // Callback ref setter that doesn't return a value
  const setFieldRef = (fieldName: string) => (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null) => {
    fieldRefs.current[fieldName] = el;
  };
  
  // Daily Tasks Summary
  const [completedTasks, setCompletedTasks] = useState<TaskSummary[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [totalManHours, setTotalManHours] = useState(0);
  
  // Auto-load states
  const [loadingVoyage, setLoadingVoyage] = useState(true);
  const [loadingCrew, setLoadingCrew] = useState(true);
  const [currentVoyageNumber, setCurrentVoyageNumber] = useState<string | null>(null);

  const [formData, setFormData] = useState<CreateNoonReportDto>({
    reportDate: new Date().toISOString().split('T')[0],
    voyageId: undefined, // Guid? in backend - send undefined instead of 0
    
    // Position
    latitude: 0,
    longitude: 0,
    courseOverGround: 0,
    speedOverGround: 0,
    
    // Weather
    weatherConditions: 'FAIR',
    windDirection: 'N',
    windSpeed: 0,
    seaState: 'CALM',
    visibility: 'GOOD',
    airTemperature: 0,
    seaTemperature: 0,
    barometricPressure: 1013.25,
    
    // Distance
    distanceTraveled: 0,
    distanceToGo: 0,
    
    // Fuel
    fuelOilROB: 0,
    dieselOilROB: 0,
    fuelOilConsumed: 0,
    dieselOilConsumed: 0,
    
    // Engine - Backend expects string type
    mainEngineRunningHours: '',
    auxEngineRunningHours: '',
    
    // Cargo
    cargoOnBoard: 0,
    
    // Remarks
    generalRemarks: '',
    preparedBy: ''
  });
  
  // Load completed tasks from last 24 hours on mount
  useEffect(() => {
    const loadCompletedTasks = async () => {
      try {
        setLoadingTasks(true);
        const tasks = await getTasksCompletedLast24Hours();
        
        if (!tasks || tasks.length === 0) {
          console.log('ℹ️ No completed maintenance tasks found in last 24 hours');
          return;
        }
        
        const taskSummaries = tasks.map(toTaskSummary);
        setCompletedTasks(taskSummaries);
        
        const manHours = calculateManHours(tasks);
        setTotalManHours(manHours);
        
        // Store task IDs in form data
        const taskIds = tasks.map(t => t.taskId);
        handleChange('completedTaskIds', taskIds);
        handleChange('totalManHours', manHours);
        
        console.log(`✅ Loaded ${tasks.length} completed maintenance tasks`);
      } catch (err) {
        console.error('⚠️ Failed to load completed tasks:', err);
        // Don't block form if tasks fail to load - user can still submit report
        // Set empty arrays to prevent undefined errors
        setCompletedTasks([]);
        setTotalManHours(0);
      } finally {
        setLoadingTasks(false);
      }
    };
    
    loadCompletedTasks();
  }, []);
  
  // Auto-load current voyage and crew data on mount
  useEffect(() => {
    const loadAutoData = async () => {
      // Skip auto-load if in edit mode (data comes from existing report)
      if (isEditMode) {
        setLoadingVoyage(false);
        setLoadingCrew(false);
        return;
      }
      
      // Load current voyage
      try {
        setLoadingVoyage(true);
        const voyage = await maritimeService.voyage.getCurrent();
        if (voyage && voyage.id) {
          setFormData(prev => ({ 
            ...prev, 
            voyageId: String(voyage.id),
            distanceTraveled: voyage.distanceTraveled ?? prev.distanceTraveled
          }));
          setCurrentVoyageNumber(voyage.voyageNumber || `Voyage ${String(voyage.id).slice(0, 8)}`);
          console.log('✅ Auto-loaded current voyage:', voyage.voyageNumber || voyage.id);
        }
      } catch (err) {
        console.warn('⚠️ No active voyage found - user must select manually');
      } finally {
        setLoadingVoyage(false);
      }
      
      // Load crew onboard count
      try {
        setLoadingCrew(true);
        const crewOnboard = await maritimeService.crew.getOnboard();
        if (crewOnboard && Array.isArray(crewOnboard)) {
          setFormData(prev => ({ 
            ...prev, 
            crewOnBoard: crewOnboard.length,
            // Default passengers to 0 (typically no passengers on cargo ships)
            passengersOnBoard: prev.passengersOnBoard || 0
          }));
          console.log('✅ Auto-loaded crew count:', crewOnboard.length);
        }
      } catch (err) {
        console.warn('⚠️ Failed to load crew data:', err);
      } finally {
        setLoadingCrew(false);
      }
      
      // Auto-load position and speed
      try {
        const posData = await maritimeService.telemetry.getLatest('position');
        if (posData) {
          setFormData(prev => ({
            ...prev,
            latitude: posData.latitude ?? prev.latitude,
            longitude: posData.longitude ?? prev.longitude,
            courseOverGround: posData.courseOverGround ?? prev.courseOverGround,
            speedOverGround: posData.speedOverGround ?? prev.speedOverGround,
          }));
          console.log('✅ Auto-loaded position data:', posData.latitude, posData.longitude);
        }
      } catch (err) {
        console.warn('⚠️ Failed to load position data:', err);
      }
      
      // Auto-load pitch/roll from latest navigation data
      try {
        const navData = await maritimeService.telemetry.getLatest('navigation');
        if (navData) {
          const p = navData.pitch ?? 0;
          const r = navData.roll ?? 0;
          const absP = Math.abs(p);
          const absR = Math.abs(r);
          
          const pitchLevel = absP <= 3 ? 'BÌNH THƯỜNG' : absP <= 7 ? 'THẬN TRỌNG' : absP <= 10 ? 'CẢNH BÁO' : 'NGUY HIỂM';
          const rollLevel  = absR <= 5 ? 'BÌNH THƯỜNG' : absR <= 15 ? 'THẬN TRỌNG' : absR <= 25 ? 'CẢNH BÁO' : 'NGUY HIỂM';
          
          const hasWarning = pitchLevel === 'CẢNH BÁO' || pitchLevel === 'NGUY HIỂM' || 
                            rollLevel === 'CẢNH BÁO' || rollLevel === 'NGUY HIỂM';
          
          const now = new Date();
          const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
          const dateStr = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
          
          // Auto-fill safetyIncidents with formatted warning if there's any warning
          const warningText = hasWarning 
            ? `[AUTO ${timeStr} ${dateStr}] Cảnh báo độ nghiêng/chúi - Pitch: ${p.toFixed(1)}° (${pitchLevel}) | Roll: ${r.toFixed(1)}° (${rollLevel})`
            : undefined;
          
          setFormData(prev => ({
            ...prev,
            pitch: p,
            roll: r,
            ...(warningText ? { safetyIncidents: warningText } : {}),
          }));
          console.log('✅ Auto-loaded pitch/roll from navigation:', p, r, hasWarning ? `⚠️ ${warningText}` : '✓ Normal');
        }
      } catch (err) {
        // Silent - pitch/roll data is optional
      }
    };
    
    loadAutoData();
  }, [isEditMode]);

  // Load existing report data if in edit mode
  useEffect(() => {
    if (!isEditMode || !id) return;
    
    const loadReportData = async () => {
      try {
        setLoadingReport(true);
        const report = await ReportingService.getNoonReport(id);
        
        // Populate form with existing data
        setFormData({
          reportDate: report.reportDate.split('T')[0],
          voyageId: report.voyageId,
          latitude: report.latitude,
          longitude: report.longitude,
          courseOverGround: report.courseOverGround,
          speedOverGround: report.speedOverGround,
          weatherConditions: report.weatherConditions,
          windDirection: report.windDirection,
          windSpeed: report.windSpeed,
          seaState: report.seaState,
          visibility: report.visibility,
          airTemperature: report.airTemperature,
          seaTemperature: report.seaTemperature,
          barometricPressure: report.barometricPressure,
          distanceTraveled: report.distanceTraveled,
          fuelOilConsumed: report.fuelOilConsumed,
          fuelOilROB: report.fuelOilROB,
          dieselOilConsumed: report.dieselOilConsumed,
          dieselOilROB: report.dieselOilROB,
          mainEngineRunningHours: report.mainEngineRunningHours,
          auxEngineRunningHours: report.auxEngineRunningHours,
          cargoOnBoard: report.cargoOnBoard,
          pitch: report.pitch,
          roll: report.roll,
          generalRemarks: report.generalRemarks || '',
          preparedBy: report.preparedBy || '',
          completedTaskIds: report.completedTaskIds || [],
          totalManHours: report.totalManHours || 0,
        });
        
        console.log('✅ Loaded report data for editing');
      } catch (err) {
        console.error('❌ Failed to load report:', err);
        setError('Failed to load report data');
      } finally {
        setLoadingReport(false);
      }
    };
    
    loadReportData();
  }, [isEditMode, id]);

  useEffect(() => {
    if (isEditMode || !currentAccountName || (formData.preparedBy || '').trim()) {
      return;
    }

    setFormData((prev) => {
      if ((prev.preparedBy || '').trim()) {
        return prev;
      }

      return { ...prev, preparedBy: currentAccountName };
    });
  }, [currentAccountName, formData.preparedBy, isEditMode]);

  // Load an auto-saved draft once per draft key.
  useEffect(() => {
    const AUTOSAVE_KEY = `draft-noon-${formData.reportDate}`;

    if (isEditMode || loadedDraftKeysRef.current.has(AUTOSAVE_KEY)) {
      return;
    }

    loadedDraftKeysRef.current.add(AUTOSAVE_KEY);

    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (!saved) {
        return;
      }

      toast('Found an auto-saved draft from a previous session.', {
        action: {
          label: 'Load Draft',
          onClick: () => {
            try {
              const parsed = JSON.parse(saved) as CreateNoonReportDto;
              setFormData(parsed);
              setLastAutoSave(new Date());
              toast.success('Loaded auto-saved draft');
            } catch (err) {
              console.error('Failed to load auto-saved draft:', err);
            }
          }
        },
        cancel: {
          label: 'Discard',
          onClick: () => {
            localStorage.removeItem(AUTOSAVE_KEY);
          }
        }
      });
    } catch (err) {
      console.error('Failed to load auto-saved draft:', err);
    }
  }, [formData.reportDate, isEditMode]);

  // Auto-save the current draft after 60 seconds of inactivity.
  useEffect(() => {
    if (isEditMode || !formData.voyageId) {
      return;
    }

    const AUTOSAVE_KEY = `draft-noon-${formData.reportDate}`;
    const autoSaveTimeout = window.setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(formData));
        setLastAutoSave(new Date());
        console.log('💾 Auto-saved draft at', new Date().toLocaleTimeString());
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    }, 60000);

    return () => {
      window.clearTimeout(autoSaveTimeout);
    };
  }, [formData, isEditMode]);

  const handleChange = (field: keyof CreateNoonReportDto, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    // Clear field error when user starts typing
    if (fieldErrors[field]) {
      setFieldErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };
  
  // Helper to get input class with error styling
  const getInputClassName = (fieldName: string, baseClass: string = '') => {
    const hasError = fieldErrors[fieldName];
    const errorClass = 'border-red-500 bg-red-50 ring-2 ring-red-300 focus:ring-red-500 focus:border-red-500';
    const normalClass = 'border-gray-300 focus:ring-blue-500 focus:border-transparent';
    const baseInput = 'w-full px-3 py-1.5 text-sm border rounded-lg focus:ring-2 transition-all duration-200';
    return `${baseInput} ${hasError ? errorClass : normalClass} ${baseClass}`;
  };
  
  // Helper to render field error message
  const renderFieldError = (fieldName: string) => {
    if (!fieldErrors[fieldName]) return null;
    return (
      <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" />
        {fieldErrors[fieldName]}
      </p>
    );
  };

  // Helper to scroll to first error field
  const scrollToFirstError = (fieldErrorsMap: Record<string, string>) => {
    const firstErrorField = Object.keys(fieldErrorsMap)[0];
    if (firstErrorField) {
      const fieldRef = fieldRefs.current[firstErrorField];
      if (fieldRef) {
        fieldRef.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => fieldRef.focus(), 150);
      }
    }
  };

  const applyFieldErrors = (nextFieldErrors: Record<string, string>) => {
    setError(null);
    setFieldErrors(nextFieldErrors);

    if (Object.keys(nextFieldErrors).length > 0) {
      setTimeout(() => scrollToFirstError(nextFieldErrors), 100);
    }
  };

  const mapValidationMessageToField = (message: string): string | null => {
    const normalized = message.toLowerCase();

    if (normalized.includes('prepared by')) return 'preparedBy';
    if (normalized.includes('voyage')) return 'voyageId';
    if (normalized.includes('null island') || normalized.includes('latitude')) return 'latitude';
    if (normalized.includes('longitude')) return 'longitude';
    if (normalized.includes('speed')) return 'speedOverGround';
    if (normalized.includes('course')) return 'courseOverGround';
    if (normalized.includes('fuel oil rob')) return 'fuelOilROB';
    if (normalized.includes('fuel oil consumed')) return 'fuelOilConsumed';
    if (normalized.includes('diesel oil rob')) return 'dieselOilROB';
    if (normalized.includes('diesel oil consumed')) return 'dieselOilConsumed';
    if (normalized.includes('barometric pressure')) return 'barometricPressure';
    if (normalized.includes('air temperature')) return 'airTemperature';
    if (normalized.includes('sea temperature')) return 'seaTemperature';
    if (normalized.includes('wind speed')) return 'windSpeed';
    if (normalized.includes('distance traveled')) return 'distanceTraveled';
    if (normalized.includes('distance to go')) return 'distanceToGo';
    if (normalized.includes('report date')) return 'reportDate';

    return null;
  };

  const validateForm = (): boolean => {
    const newFieldErrors: Record<string, string> = {};
    
    // Required fields
    if (!formData.voyageId) {
      newFieldErrors['voyageId'] = 'Voyage ID is required';
    }
    
    if (!formData.preparedBy?.trim()) {
      newFieldErrors['preparedBy'] = 'Prepared By is required';
    }
    
    // GPS validation
    if (formData.latitude !== undefined && (formData.latitude < -90 || formData.latitude > 90)) {
      newFieldErrors['latitude'] = 'Must be between -90 and 90';
    }
    
    if (formData.longitude !== undefined && (formData.longitude < -180 || formData.longitude > 180)) {
      newFieldErrors['longitude'] = 'Must be between -180 and 180';
    }
    
    // Null Island check
    if (formData.latitude === 0 && formData.longitude === 0) {
      newFieldErrors['latitude'] = 'Invalid position. Please enter actual latitude.';
      newFieldErrors['longitude'] = 'Invalid position. Please enter actual longitude.';
    }
    
    // Speed validation
    if (formData.speedOverGround !== undefined && (formData.speedOverGround < 0 || formData.speedOverGround > 40)) {
      newFieldErrors['speedOverGround'] = 'Must be between 0 and 40 knots';
    }
    
    // Course validation
    if (formData.courseOverGround !== undefined && (formData.courseOverGround < 0 || formData.courseOverGround > 360)) {
      newFieldErrors['courseOverGround'] = 'Must be between 0 and 360°';
    }
    
    // Fuel validation
    if (formData.fuelOilROB !== undefined && formData.fuelOilROB < 0) {
      newFieldErrors['fuelOilROB'] = 'Cannot be negative';
    }
    
    if (formData.fuelOilConsumed !== undefined && formData.fuelOilConsumed < 0) {
      newFieldErrors['fuelOilConsumed'] = 'Cannot be negative';
    }
    
    // Backend validation rules (from ReportingDTOs.cs)
    if (formData.barometricPressure !== undefined && 
        (formData.barometricPressure < 900 || formData.barometricPressure > 1100)) {
      newFieldErrors['barometricPressure'] = 'Must be 900-1100 hPa';
    }
    
    if (formData.airTemperature !== undefined && 
        (formData.airTemperature < -50 || formData.airTemperature > 50)) {
      newFieldErrors['airTemperature'] = 'Must be -50 to 50°C';
    }
    
    if (formData.seaTemperature !== undefined && 
        (formData.seaTemperature < -50 || formData.seaTemperature > 50)) {
      newFieldErrors['seaTemperature'] = 'Must be -50 to 50°C';
    }
    
    if (formData.windSpeed !== undefined && 
        (formData.windSpeed < 0 || formData.windSpeed > 100)) {
      newFieldErrors['windSpeed'] = 'Must be 0-100 knots';
    }
    
    if (formData.distanceTraveled !== undefined && 
        (formData.distanceTraveled < 0 || formData.distanceTraveled > 1000)) {
      newFieldErrors['distanceTraveled'] = 'Must be 0-1000 nm';
    }

    if (Object.keys(newFieldErrors).length > 0) {
      applyFieldErrors(newFieldErrors);
      return false;
    }

    setFieldErrors({});
    return true;
  };

  const handleSubmit = async (asDraft: boolean = false) => {
    if (!asDraft && !validateForm()) {
      return; // validateForm now handles scrolling
    }
    
    try {
      setLoading(true);
      setError(null);
      setFieldErrors({}); // Clear field errors
      
      // Clean up data before sending - ensure voyageId is valid GUID or null
      const cleanedData = {
        ...formData,
        // VoyageId: if empty string or invalid, send null; otherwise keep as-is
        voyageId: formData.voyageId && formData.voyageId.trim() !== '' 
          ? formData.voyageId 
          : null,
      };
      
      console.log('📤 Submitting report with data:', cleanedData);
      
      let reportId: string;
      
      if (isEditMode && id) {
        // UPDATE existing report
        await ReportingService.updateNoonReport(id, cleanedData);
        reportId = id;
        console.log('✅ Report updated successfully');
      } else {
        // CREATE new report
        const report = await ReportingService.createNoonReport(cleanedData);
        reportId = report.reportId;
        console.log('✅ Report created successfully');
      }
      
      // Auto-submit if not draft
      if (!asDraft) {
        await ReportingService.submitReport(reportId);
        console.log('✅ Report submitted for approval');
      }
      
      // Clear auto-saved draft on successful submission
      const AUTOSAVE_KEY = `draft-noon-${formData.reportDate}`;
      localStorage.removeItem(AUTOSAVE_KEY);
      console.log('✅ Cleared auto-saved draft');
      
      navigate('/reporting/reports');
    } catch (err: any) {
      console.error('Failed to save Noon Report:', err);
      
      // Check for validation errors from backend
      if (err.validationErrors) {
        const newFieldErrors: Record<string, string> = {};
        
        Object.entries(err.validationErrors).forEach(([field, messages]) => {
          if (Array.isArray(messages)) {
            messages.forEach((msg: string) => {
              // Map backend field names to frontend field names
              const fieldNameMap: Record<string, string> = {
                'ReportDate': 'reportDate',
                'VoyageId': 'voyageId',
                'Latitude': 'latitude',
                'Longitude': 'longitude',
                'CourseOverGround': 'courseOverGround',
                'SpeedOverGround': 'speedOverGround',
                'DistanceTraveled': 'distanceTraveled',
                'DistanceToGo': 'distanceToGo',
                'BarometricPressure': 'barometricPressure',
                'AirTemperature': 'airTemperature',
                'SeaTemperature': 'seaTemperature',
                'WindSpeed': 'windSpeed',
                'WindDirection': 'windDirection',
                'FuelOilROB': 'fuelOilROB',
                'DieselOilROB': 'dieselOilROB',
                'FuelOilConsumed': 'fuelOilConsumed',
                'DieselOilConsumed': 'dieselOilConsumed',
                'PreparedBy': 'preparedBy',
                'WeatherConditions': 'weatherConditions',
                'SeaState': 'seaState',
                'GeneralRemarks': 'generalRemarks',
                'CargoOnBoard': 'cargoOnBoard',
                'MainEngineRunningHours': 'mainEngineRunningHours',
                'AuxEngineRunningHours': 'auxEngineRunningHours',
                'CrewOnBoard': 'crewOnBoard',
                'PassengersOnBoard': 'passengersOnBoard',
              };
              
              const frontendField = fieldNameMap[field] || field.charAt(0).toLowerCase() + field.slice(1);
              newFieldErrors[frontendField] = msg;
            });
          }
        });

        applyFieldErrors(newFieldErrors);
        return;
      }
      
      // User-friendly error messages
      let errorMsg = 'Không thể tạo Noon Report';
      
      if (err?.response?.data?.error) {
        errorMsg = err.response.data.error;
      } else if (err.message) {
        // If it's a formatted validation message from api.client
        if (err.message.includes('Validation failed:')) {
          const lines = err.message.split('\n').filter((l: string) => l.startsWith('•'));
          if (lines.length > 0) {
            const parsedFieldErrors: Record<string, string> = {};

            lines
              .map((line: string) => line.replace('• ', '').trim())
              .forEach((line: string) => {
                const mappedField = mapValidationMessageToField(line);
                if (mappedField) {
                  parsedFieldErrors[mappedField] = line;
                }
              });

            if (Object.keys(parsedFieldErrors).length > 0) {
              applyFieldErrors(parsedFieldErrors);
              return;
            }
          }

          errorMsg = err.message;
        } else {
          const msg = err.message.toLowerCase();
          
          if (msg.includes('validation') || msg.includes('invalid')) {
            errorMsg = '❌ Dữ liệu không hợp lệ. Vui lòng kiểm tra lại các trường bắt buộc (có dấu *)';
          } else if (msg.includes('duplicate')) {
            errorMsg = `⚠️ Đã tồn tại Noon Report cho ngày ${formData.reportDate}.\n\nVui lòng chỉnh sửa báo cáo hiện tại thay vì tạo mới.`;
          } else if (msg.includes('timeout') || msg.includes('network')) {
            errorMsg = '🌐 Lỗi kết nối mạng. Báo cáo đã được lưu nháp tự động, bạn có thể gửi lại sau.';
          } else if (msg.includes('401') || msg.includes('unauthorized')) {
            errorMsg = '🔒 Phiên đăng nhập đã hết hạn. Dữ liệu đã được lưu nháp, vui lòng đăng nhập lại.';
          } else if (msg.includes('403') || msg.includes('forbidden')) {
            errorMsg = '⛔ Bạn không có quyền tạo báo cáo. Vui lòng liên hệ Chief Officer hoặc Captain.';
          } else if (msg.includes('500') || msg.includes('internal')) {
            errorMsg = '⚠️ Lỗi máy chủ. Dữ liệu đã được lưu nháp tự động, vui lòng thử lại sau.';
          } else {
            errorMsg = err.message;
          }
        }
      }
      
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto p-4 sm:p-6">
        {/* Compact Header */}
        <div className="mb-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Ship className="h-6 w-6 text-blue-600" />
                {isEditMode ? 'Edit Noon Report' : 'Create Noon Report'}
                {isEditMode && (
                  <span className="text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded">
                    ✏️ Draft
                  </span>
                )}
              </h1>
              <p className="text-xs text-gray-500 mt-1">
                Daily position report at 12:00 Local Time (LT)
              </p>
            </div>
            
            {/* Auto-save indicator */}
            {lastAutoSave && (
              <div className="text-xs text-gray-500 flex items-center gap-1.5">
                <Save className="h-3.5 w-3.5 text-green-600" />
                <span>Saved {lastAutoSave.toLocaleTimeString()}</span>
              </div>
            )}
          </div>
        </div>

        {/* Compact Loading */}
        {loadingReport && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              <p className="text-sm text-blue-700">Loading report data...</p>
            </div>
          </div>
        )}

        {/* Error Message - Enhanced */}
        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 rounded-r-xl p-4 mb-4 shadow-sm">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-red-900 mb-1">Error</h3>
                <p className="text-sm text-red-700 whitespace-pre-wrap">{error}</p>
              </div>
            </div>
          </div>
        )}

        <form className="space-y-4">
          {/* Report Info - Compact */}
          <div className="bg-white rounded-lg shadow-sm p-2 border border-gray-200">
            <h2 className="text-base font-semibold text-gray-900 mb-3">Report Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Report Date <span className="text-red-600">*</span>
                </label>
                <input
                  type="date"
                  ref={setFieldRef('reportDate')}
                  value={formData.reportDate}
                  onChange={(e) => handleChange('reportDate', e.target.value)}
                  className={getInputClassName('reportDate')}
                  required
                />
                {renderFieldError('reportDate')}
              </div>
              
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Voyage <span className="text-red-600">*</span>
                  {loadingVoyage && <Loader2 className="inline h-3 w-3 ml-1 animate-spin text-blue-500" />}
                  {!loadingVoyage && currentVoyageNumber && (
                    <span className="ml-2 text-xs font-normal text-green-600">✓ {currentVoyageNumber}</span>
                  )}
                </label>
                <input
                  type="text"
                  ref={setFieldRef('voyageId')}
                  value={formData.voyageId || ''}
                  onChange={(e) => handleChange('voyageId', e.target.value || undefined)}
                  className={getInputClassName('voyageId')}
                  required
                  placeholder={loadingVoyage ? "Loading current voyage..." : "Auto-loaded from active voyage"}
                  readOnly={!!currentVoyageNumber}
                />
                {!currentVoyageNumber && !loadingVoyage && (
                  <p className="text-xs text-amber-600 mt-1">⚠️ No active voyage found. Please enter manually.</p>
                )}
                {renderFieldError('voyageId')}
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Prepared By <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                ref={setFieldRef('preparedBy')}
                value={formData.preparedBy}
                onChange={(e) => handleChange('preparedBy', e.target.value)}
                placeholder="Officer name"
                className={getInputClassName('preparedBy')}
                required
              />
              {renderFieldError('preparedBy')}
            </div>
          </div>
        </div>

        {/* Position Section - Compact */}
        <div className="bg-white rounded-lg shadow-sm p-2 border border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 text-blue-600" />
            Position & Navigation
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Latitude (°) <span className="text-red-600">*</span>
              </label>
              <input
                type="number"
                step="0.000001"
                ref={setFieldRef('latitude')}
                value={formData.latitude}
                onChange={(e) => handleChange('latitude', parseFloat(e.target.value) || 0)}
                className={getInputClassName('latitude')}
                placeholder="e.g. 10.762622"
                required
              />
              {renderFieldError('latitude') || <p className="text-xs text-gray-500 mt-0.5">Range: -90 to +90</p>}
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Longitude (°) <span className="text-red-600">*</span>
              </label>
              <input
                type="number"
                step="0.000001"
                ref={setFieldRef('longitude')}
                value={formData.longitude}
                onChange={(e) => handleChange('longitude', parseFloat(e.target.value) || 0)}
                className={getInputClassName('longitude')}
                placeholder="e.g. 106.660172"
                required
              />
              {renderFieldError('longitude') || <p className="text-xs text-gray-500 mt-0.5">Range: -180 to +180</p>}
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Course Over Ground (°)
              </label>
              <input
                type="number"
                step="1"
                ref={setFieldRef('courseOverGround')}
                value={formData.courseOverGround}
                onChange={(e) => handleChange('courseOverGround', parseFloat(e.target.value) || 0)}
                className={getInputClassName('courseOverGround')}
                min="0"
                max="360"
              />
              {renderFieldError('courseOverGround') || <p className="text-xs text-gray-500 mt-1">0-360 degrees</p>}
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Speed Over Ground (knots)
              </label>
              <input
                type="number"
                step="0.1"
                ref={setFieldRef('speedOverGround')}
                value={formData.speedOverGround}
                onChange={(e) => handleChange('speedOverGround', parseFloat(e.target.value) || 0)}
                className={getInputClassName('speedOverGround')}
                min="0"
                max="40"
              />
              {renderFieldError('speedOverGround')}
            </div>
          </div>
        </div>

        {/* Weather Section */}
        <div className="bg-white rounded-lg shadow-sm p-2 border border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <Cloud className="h-5 w-5 text-blue-600" />
            Weather Conditions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Weather
              </label>
              <select
                ref={setFieldRef('weatherConditions')}
                value={formData.weatherConditions}
                onChange={(e) => handleChange('weatherConditions', e.target.value)}
                className={getInputClassName('weatherConditions')}
              >
                <option value="CLEAR">Clear</option>
                <option value="FAIR">Fair</option>
                <option value="CLOUDY">Cloudy</option>
                <option value="RAIN">Rain</option>
                <option value="STORM">Storm</option>
                <option value="FOG">Fog</option>
              </select>
              {renderFieldError('weatherConditions')}
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Wind Direction
              </label>
              <select
                ref={setFieldRef('windDirection')}
                value={formData.windDirection}
                onChange={(e) => handleChange('windDirection', e.target.value)}
                className={getInputClassName('windDirection')}
              >
                <option value="N">N</option>
                <option value="NE">NE</option>
                <option value="E">E</option>
                <option value="SE">SE</option>
                <option value="S">S</option>
                <option value="SW">SW</option>
                <option value="W">W</option>
                <option value="NW">NW</option>
              </select>
              {renderFieldError('windDirection')}
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Wind Speed (knots)
              </label>
              <input
                type="number"
                step="1"
                ref={setFieldRef('windSpeed')}
                value={formData.windSpeed}
                onChange={(e) => handleChange('windSpeed', parseFloat(e.target.value) || 0)}
                className={getInputClassName('windSpeed')}
                min="0"
              />
              {renderFieldError('windSpeed')}
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Sea State
              </label>
              <select
                ref={setFieldRef('seaState')}
                value={formData.seaState}
                onChange={(e) => handleChange('seaState', e.target.value)}
                className={getInputClassName('seaState')}
              >
                <option value="CALM">Calm (0-1)</option>
                <option value="SLIGHT">Slight (2-3)</option>
                <option value="MODERATE">Moderate (4-5)</option>
                <option value="ROUGH">Rough (6-7)</option>
                <option value="VERY_ROUGH">Very Rough (8-9)</option>
              </select>
              {renderFieldError('seaState')}
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Visibility
              </label>
              <select
                ref={setFieldRef('visibility')}
                value={formData.visibility}
                onChange={(e) => handleChange('visibility', e.target.value)}
                className={getInputClassName('visibility')}
              >
                <option value="EXCELLENT">Excellent (&gt;10 nm)</option>
                <option value="GOOD">Good (5-10 nm)</option>
                <option value="MODERATE">Moderate (2-5 nm)</option>
                <option value="POOR">Poor (&lt;2 nm)</option>
              </select>
              {renderFieldError('visibility')}
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Barometric Pressure (hPa)
              </label>
              <input
                type="number"
                step="0.1"
                ref={setFieldRef('barometricPressure')}
                value={formData.barometricPressure}
                onChange={(e) => handleChange('barometricPressure', parseFloat(e.target.value) || 1013.25)}
                className={getInputClassName('barometricPressure')}
              />
              {renderFieldError('barometricPressure')}
            </div>
          </div>
        </div>

        {/* Distance Section */}
        <div className="bg-white rounded-lg shadow-sm p-2 border border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <Anchor className="h-5 w-5 text-blue-600" />
            Distance & Speed
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Distance Traveled (nm)
              </label>
              <input
                type="number"
                step="0.1"
                ref={setFieldRef('distanceTraveled')}
                value={formData.distanceTraveled}
                onChange={(e) => handleChange('distanceTraveled', parseFloat(e.target.value) || 0)}
                className={getInputClassName('distanceTraveled')}
              />
              {renderFieldError('distanceTraveled')}
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Distance To Go (nm)
              </label>
              <input
                type="number"
                step="0.1"
                ref={setFieldRef('distanceToGo')}
                value={formData.distanceToGo}
                onChange={(e) => handleChange('distanceToGo', parseFloat(e.target.value) || 0)}
                className={getInputClassName('distanceToGo')}
              />
              {renderFieldError('distanceToGo')}
            </div>
          </div>
        </div>

        {/* Fuel Section */}
        <div className="bg-white rounded-lg shadow-sm p-2 border border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <Fuel className="h-5 w-5 text-blue-600" />
            Fuel Status
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Fuel Oil ROB (MT)
              </label>
              <input
                type="number"
                step="0.1"
                ref={setFieldRef('fuelOilROB')}
                value={formData.fuelOilROB}
                onChange={(e) => handleChange('fuelOilROB', parseFloat(e.target.value) || 0)}
                className={getInputClassName('fuelOilROB')}
                min="0"
              />
              {renderFieldError('fuelOilROB')}
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Diesel Oil ROB (MT)
              </label>
              <input
                type="number"
                step="0.1"
                ref={setFieldRef('dieselOilROB')}
                value={formData.dieselOilROB}
                onChange={(e) => handleChange('dieselOilROB', parseFloat(e.target.value) || 0)}
                className={getInputClassName('dieselOilROB')}
                min="0"
              />
              {renderFieldError('dieselOilROB')}
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Fuel Oil Consumed (MT)
              </label>
              <input
                type="number"
                step="0.1"
                ref={setFieldRef('fuelOilConsumed')}
                value={formData.fuelOilConsumed}
                onChange={(e) => handleChange('fuelOilConsumed', parseFloat(e.target.value) || 0)}
                className={getInputClassName('fuelOilConsumed')}
                min="0"
              />
              {renderFieldError('fuelOilConsumed')}
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Diesel Oil Consumed (MT)
              </label>
              <input
                type="number"
                step="0.1"
                ref={setFieldRef('dieselOilConsumed')}
                value={formData.dieselOilConsumed}
                onChange={(e) => handleChange('dieselOilConsumed', parseFloat(e.target.value) || 0)}
                className={getInputClassName('dieselOilConsumed')}
                min="0"
              />
              {renderFieldError('dieselOilConsumed')}
            </div>
          </div>
        </div>

        {/* Engine Section */}
        <div className="bg-white rounded-lg shadow-sm p-2 border border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <Gauge className="h-5 w-5 text-blue-600" />
            Engine Running Hours
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Main Engine (hrs)
              </label>
              <input
                type="text"
                ref={setFieldRef('mainEngineRunningHours')}
                value={formData.mainEngineRunningHours}
                onChange={(e) => handleChange('mainEngineRunningHours', e.target.value)}
                className={getInputClassName('mainEngineRunningHours')}
                placeholder="e.g., 12345.5"
              />
              {renderFieldError('mainEngineRunningHours')}
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Auxiliary Engine (hrs)
              </label>
              <input
                type="text"
                ref={setFieldRef('auxEngineRunningHours')}
                value={formData.auxEngineRunningHours}
                onChange={(e) => handleChange('auxEngineRunningHours', e.target.value)}
                className={getInputClassName('auxEngineRunningHours')}
                placeholder="e.g., 5678.2"
              />
              {renderFieldError('auxEngineRunningHours')}
            </div>
          </div>
        </div>

        {/* Cargo Section */}
        <div className="bg-white rounded-lg shadow-sm p-2 border border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900 mb-2">Cargo Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Cargo On Board (MT)
              </label>
              <input
                type="number"
                step="0.1"
                ref={setFieldRef('cargoOnBoard')}
                value={formData.cargoOnBoard}
                onChange={(e) => handleChange('cargoOnBoard', parseFloat(e.target.value) || 0)}
                className={getInputClassName('cargoOnBoard')}
                min="0"
              />
              {renderFieldError('cargoOnBoard')}
            </div>
          </div>
        </div>

        {/* Daily Tasks Summary - ISM Code Compliance */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg shadow-sm p-6 border border-blue-200">
          <h2 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <Wrench className="h-5 w-5 text-blue-600" />
            Daily Maintenance Tasks (Last 24 Hours)
            <span className="text-xs font-normal text-gray-500 ml-2">ISM Code - PMS</span>
          </h2>
          
          {loadingTasks ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Loading completed tasks...</span>
            </div>
          ) : completedTasks.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Wrench className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p>No maintenance tasks completed in the last 24 hours</p>
            </div>
          ) : (
            <>
              {/* Summary Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-6">
                <div className="bg-white rounded-lg p-4 border border-blue-200">
                  <div className="text-sm text-gray-600">Total Tasks</div>
                  <div className="text-2xl font-bold text-blue-600">{completedTasks.length}</div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-blue-200">
                  <div className="text-sm text-gray-600">Total Man-Hours</div>
                  <div className="text-2xl font-bold text-green-600">{totalManHours.toFixed(1)} hrs</div>
                </div>
                <div className="bg-white rounded-lg p-4 border border-blue-200">
                  <div className="text-sm text-gray-600">Avg Duration</div>
                  <div className="text-2xl font-bold text-purple-600">
                    {(totalManHours / completedTasks.length).toFixed(1)} hrs
                  </div>
                </div>
              </div>

              {/* Tasks List */}
              <div className="space-y-3">
                {completedTasks.map((task) => (
                  <div 
                    key={task.taskId} 
                    className="bg-white rounded-lg p-4 border border-gray-200 hover:border-blue-300 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                          <span className="font-semibold text-gray-900">{task.equipmentName}</span>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            task.priority === 'CRITICAL' ? 'bg-red-100 text-red-800' :
                            task.priority === 'HIGH' ? 'bg-orange-100 text-orange-800' :
                            task.priority === 'NORMAL' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {task.priority}
                          </span>
                        </div>
                        
                        <p className="text-sm text-gray-700 mb-2">{task.taskDescription}</p>
                        
                        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
                          <span>👤 {task.completedBy}</span>
                          <span>⏱️ {task.duration.toFixed(1)} hrs</span>
                          <span>📅 {new Date(task.completedAt).toLocaleString('en-GB', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}</span>
                        </div>
                        
                        {task.sparePartsUsed && (
                          <div className="mt-2 text-xs text-gray-600 bg-gray-50 px-3 py-1.5 rounded">
                            <span className="font-medium">Spare Parts: </span>
                            {formatSparePartsUsed(task.sparePartsUsed)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                <strong>Note:</strong> Tasks are automatically linked to this Noon Report for ISM Code compliance and maintenance record-keeping.
              </div>
            </>
          )}
        </div>

        {/* Crew & Safety Section (SOLAS/ISM Code Compliance) */}
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200">
          <h2 className="text-base font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            Crew & Safety (SOLAS Compliance)
            {loadingCrew && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
            {!loadingCrew && formData.crewOnBoard !== undefined && formData.crewOnBoard > 0 && (
              <span className="ml-2 text-xs font-normal text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                ✓ Auto-loaded
              </span>
            )}
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="bg-blue-50 rounded-lg p-3">
              <label className="block text-xs font-medium text-blue-700 mb-1">
                Crew On Board
                {loadingCrew && <Loader2 className="inline h-3 w-3 ml-1 animate-spin" />}
              </label>
              <input
                type="number"
                ref={setFieldRef('crewOnBoard')}
                value={formData.crewOnBoard || 0}
                onChange={(e) => handleChange('crewOnBoard', parseInt(e.target.value) || 0)}
                className={`w-full px-3 py-2 text-sm border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white ${formData.crewOnBoard && formData.crewOnBoard > 0 ? 'font-semibold text-blue-800' : ''}`}
                min="0"
                placeholder={loadingCrew ? "Loading..." : "Total crew members"}
              />
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Auto-loaded from Crew module
              </p>
            </div>
            
            <div className="bg-blue-50 rounded-lg p-3">
              <label className="block text-xs font-medium text-blue-700 mb-1">
                Passengers On Board
              </label>
              <input
                type="number"
                ref={setFieldRef('passengersOnBoard')}
                value={formData.passengersOnBoard || 0}
                onChange={(e) => handleChange('passengersOnBoard', parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 text-sm border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
                min="0"
                placeholder="Total passengers (usually 0 for cargo ships)"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Safety Drills Conducted
              </label>
              <input
                type="text"
                value={formData.safetyDrillsConducted || ''}
                onChange={(e) => handleChange('safetyDrillsConducted', e.target.value)}
                placeholder="e.g., Fire Drill, Abandon Ship Drill"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                Safety Incidents (if any)
                {(formData.safetyIncidents || '').includes('[AUTO]') && (
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] font-bold bg-orange-100 text-orange-700 rounded-full">
                    AUTO
                  </span>
                )}
              </label>
              <input
                type="text"
                value={formData.safetyIncidents || ''}
                onChange={(e) => handleChange('safetyIncidents', e.target.value)}
                placeholder="Brief description of any incidents"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Remarks - Enhanced */}
        <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200">
          <h2 className="text-base font-semibold text-gray-900 mb-3">Remarks & Notes</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Operational Remarks
              </label>
              <textarea
                value={formData.operationalRemarks || ''}
                onChange={(e) => handleChange('operationalRemarks', e.target.value)}
                rows={2}
                placeholder="Navigation, voyage progress..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Machinery Remarks
              </label>
              <textarea
                value={formData.machineryRemarks || ''}
                onChange={(e) => handleChange('machineryRemarks', e.target.value)}
                rows={2}
                placeholder="Engine performance, issues..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Cargo Remarks
              </label>
              <textarea
                value={formData.cargoRemarks || ''}
                onChange={(e) => handleChange('cargoRemarks', e.target.value)}
                rows={2}
                placeholder="Cargo condition, handling..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Maintenance Remarks
              </label>
              <textarea
                value={formData.maintenanceRemarks || ''}
                onChange={(e) => handleChange('maintenanceRemarks', e.target.value)}
                rows={2}
                placeholder="PMS activities, repairs..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              General Remarks
            </label>
            <textarea
              value={formData.generalRemarks}
              onChange={(e) => handleChange('generalRemarks', e.target.value)}
              rows={3}
              placeholder="Any additional information..."
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Action Buttons - Enhanced */}
        <div className="flex gap-3 justify-end pt-2">
          <button
            type="button"
            onClick={() => navigate('/reporting/reports')}
            className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            disabled={loading}
          >
            Cancel
          </button>
          
          <PermissionGate permission={id ? 'reporting.update' : 'reporting.create'}><button
            type="button"
            onClick={() => handleSubmit(true)}
            className="px-6 py-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2 font-medium"
            disabled={loading}
          >
            <Save className="h-4 w-4" />
            Save as Draft
          </button></PermissionGate>
          
          <PermissionGate permission={id ? 'reporting.update' : 'reporting.create'}><button
            type="button"
            onClick={() => handleSubmit(false)}
            className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-md flex items-center gap-2 font-medium"
            disabled={loading}
          >
            {loading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <Send className="h-4 w-4" />
            )}
            Submit Report
          </button></PermissionGate>
        </div>
      </form>
      </div>
    </div>
  );
}

