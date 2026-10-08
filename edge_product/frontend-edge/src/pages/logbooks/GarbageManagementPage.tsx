import { PermissionGate } from '@/components/auth/PermissionGate'
import React, { useState, useEffect } from 'react';
import { GarbagePartIForm } from '../../components/logbooks/GarbagePartIForm';
import { GarbagePartIIForm } from '../../components/logbooks/GarbagePartIIForm';
import { FileText, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { logbookService } from '../../services/logbook.service';
import type { 
  GarbagePartIResponseDto,
  GarbagePartIIResponseDto 
} from '../../types/logbook.types';
import { useTranslationSafe } from '@/contexts/I18nContext';

// MARPOL Annex V Part I Categories (A-I)
const PART_I_CATEGORIES = [
  { code: 'A', name: 'Plastics', seaDischarge: false, description: 'All types of plastic' },
  { code: 'B', name: 'Food Wastes', seaDischarge: true, description: 'Food preparation waste' },
  { code: 'C', name: 'Domestic Wastes', seaDischarge: false, description: 'Paper, rags, glass, metal, bottles, crockery' },
  { code: 'D', name: 'Cooking Oil', seaDischarge: false, description: 'Edible oils' },
  { code: 'E', name: 'Incinerator Ashes', seaDischarge: false, description: 'Ash from incineration' },
  { code: 'F', name: 'Operational Wastes', seaDischarge: false, description: 'Maintenance/cleaning materials' },
  { code: 'G', name: 'Animal Carcasses', seaDischarge: true, description: 'Animal carcasses carried as cargo' },
  { code: 'H', name: 'Fishing Gear', seaDischarge: false, description: 'Fishing gear and synthetic line' },
  { code: 'I', name: 'E-waste', seaDischarge: false, description: 'Discarded electrical and electronic equipment' },
];

// Part II Categories (J-K - Cargo Residues)
const PART_II_CATEGORIES = [
  { code: 'J', name: 'Cargo Residues (non-HME)', seaDischarge: true, description: 'Non-harmful cargo residues in wash water' },
  { code: 'K', name: 'Cargo Residues (HME)', seaDischarge: false, description: 'Harmful cargo residues - STRICTLY PROHIBITED TO SEA' },
];

type TabType = 'part-i' | 'part-ii';

export const GarbageManagementPage: React.FC = () => {
  const { locale, t } = useTranslationSafe();
  const isVi = locale === 'vi';
  const [activeTab, setActiveTab] = useState<TabType>('part-i');
  const [partIEntries, setPartIEntries] = useState<GarbagePartIResponseDto[]>([]);
  const [partIIEntries, setPartIIEntries] = useState<GarbagePartIIResponseDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [signModal, setSignModal] = useState<{
    show: boolean;
    entryId: string | null;
    type: 'part-i' | 'part-ii';
  }>({ show: false, entryId: null, type: 'part-i' });
  const [masterSignature, setMasterSignature] = useState('Captain');

  // Part I form state
  const [partIForm, setPartIForm] = useState({
    operationDate: new Date().toISOString().split('T')[0],
    operationTime: new Date().toTimeString().slice(0, 5),
    operationEndTime: '',
    category: '',
    description: '',
    amountToSea: '',
    amountToReception: '',
    amountIncinerated: '',
    latitude: 0,
    longitude: 0,
    portName: '',
    receptionFacilityName: '',
    receiptNumber: '',
    incinerationStartTime: '',
    incinerationEndTime: '',
    incineratorDetails: '',
    exceptionalDischargeReason: '',
    waterDepth: '',
    remarks: '',
    officerInCharge: 'Chief Officer'
  });

  // Part II form state
  const [partIIForm, setPartIIForm] = useState({
    operationDate: new Date().toISOString().split('T')[0],
    operationTime: new Date().toTimeString().slice(0, 5),
    operationEndTime: '',
    category: '',
    startLatitude: 0,
    startLongitude: 0,
    endLatitude: 0,
    endLongitude: 0,
    amountToSea: '',
    amountToReception: '',
    portName: '',
    receptionFacilityName: '',
    receiptNumber: '',
    cargoDescription: '',
    holdNumbersWashed: '',
    remarks: '',
    officerInCharge: 'Chief Officer'
  });

  const handleStartEditPartI = (entry: GarbagePartIResponseDto) => {
    setPartIForm({
      operationDate: entry.operationDate ? entry.operationDate.slice(0, 10) : new Date().toISOString().split('T')[0],
      operationTime: entry.operationTime ? entry.operationTime.slice(0, 5) : new Date().toTimeString().slice(0, 5),
      operationEndTime: entry.operationEndTime ? entry.operationEndTime.slice(0, 5) : '',
      category: entry.category || '',
      description: entry.description || '',
      amountToSea: entry.estimatedAmountDischargedToSea?.toString() || '',
      amountToReception: entry.estimatedAmountToReceptionFacilities?.toString() || '',
      amountIncinerated: entry.estimatedAmountIncinerated?.toString() || '',
      latitude: entry.dischargeLatitude ?? 0,
      longitude: entry.dischargeLongitude ?? 0,
      portName: entry.portName || '',
      receptionFacilityName: entry.receptionFacilityName || '',
      receiptNumber: entry.receiptNumber || '',
      incinerationStartTime: entry.incinerationStartTime ? new Date(entry.incinerationStartTime).toTimeString().slice(0, 5) : '',
      incinerationEndTime: entry.incinerationEndTime ? new Date(entry.incinerationEndTime).toTimeString().slice(0, 5) : '',
      incineratorDetails: entry.incineratorDetails || '',
      exceptionalDischargeReason: entry.exceptionalDischargeReason || '',
      waterDepth: entry.waterDepth?.toString() || '',
      remarks: entry.remarks || '',
      officerInCharge: entry.officerInCharge || 'Chief Officer'
    });
    setEditingId(entry.id);
    setShowForm(true);
  };

  const handleStartEditPartII = (entry: GarbagePartIIResponseDto) => {
    setPartIIForm({
      operationDate: entry.operationDate ? entry.operationDate.slice(0, 10) : new Date().toISOString().split('T')[0],
      operationTime: entry.operationTime ? entry.operationTime.slice(0, 5) : new Date().toTimeString().slice(0, 5),
      operationEndTime: entry.operationEndTime ? entry.operationEndTime.slice(0, 5) : '',
      category: entry.category || '',
      startLatitude: entry.startLatitude ?? 0,
      startLongitude: entry.startLongitude ?? 0,
      endLatitude: entry.endLatitude ?? 0,
      endLongitude: entry.endLongitude ?? 0,
      amountToSea: entry.estimatedAmountDischargedToSea?.toString() || '',
      amountToReception: entry.estimatedAmountToReceptionFacilities?.toString() || '',
      portName: entry.portName || '',
      receptionFacilityName: entry.receptionFacilityName || '',
      receiptNumber: entry.receiptNumber || '',
      cargoDescription: entry.cargoDescription || '',
      holdNumbersWashed: entry.holdNumbersWashed || '',
      remarks: entry.remarks || '',
      officerInCharge: entry.officerInCharge || 'Chief Officer'
    });
    setEditingId(entry.id);
    setShowForm(true);
  };

  useEffect(() => {
    fetchEntries();
  }, [activeTab]);

  // Debug: Log form changes
  useEffect(() => {
    console.log('[Part I Form State Updated]', partIForm.category, partIForm.description);
  }, [partIForm]);

  useEffect(() => {
    console.log('[Part II Form State Updated]', partIIForm.category);
  }, [partIIForm]);

  // Part I onChange handlers
  const handlePartIChange = (field: string, value: any) => {
    console.log(`[Part I] Changing ${field} to:`, value);
    setPartIForm(prev => {
      const newForm = { ...prev, [field]: value };
      console.log('[Part I] New form state:', newForm);
      return newForm;
    });
  };

  const handlePartICategorySelect = (categoryCode: string, categoryName: string) => {
    console.log(`[Part I] Category selected: ${categoryCode} - ${categoryName}`);
    setPartIForm(prev => ({
      ...prev,
      category: categoryCode,
      description: categoryName
    }));
  };

  // Part II onChange handlers
  const handlePartIIChange = (field: string, value: any) => {
    console.log(`[Part II] Changing ${field} to:`, value);
    setPartIIForm(prev => {
      const newForm = { ...prev, [field]: value };
      console.log('[Part II] New form state:', newForm);
      return newForm;
    });
  };

  const handlePartIICategorySelect = (categoryCode: string) => {
    console.log(`[Part II] Category selected: ${categoryCode}`);
    setPartIIForm(prev => ({
      ...prev,
      category: categoryCode,
      amountToSea: categoryCode === 'K' ? '' : prev.amountToSea
    }));
  };

  const fetchEntries = async () => {
    try {
      setLoading(true);
      if (activeTab === 'part-i') {
        const response = await logbookService.getGarbagePartIEntries({ page: 1, pageSize: 20 });
        setPartIEntries(response.data);
      } else {
        const response = await logbookService.getGarbagePartIIEntries({ page: 1, pageSize: 20 });
        setPartIIEntries(response.data);
      }
    } catch (error) {
      console.error(error);
      toast.error(
        isVi
          ? `Không thể tải các bản ghi ${activeTab === 'part-i' ? 'Phần I' : 'Phần II'}`
          : `Failed to load ${activeTab === 'part-i' ? 'Part I' : 'Part II'} entries`
      );
    } finally {
      setLoading(false);
    }
  };

  const handlePartISubmit = async () => {
    try {
      // Validation
      if (!partIForm.category) {
        toast.error(t('logbooks.garbageRecord.selectCategory'));
        return;
      }

      if (!partIForm.description || partIForm.description.trim().length === 0) {
        toast.error(t('logbooks.garbageRecord.descriptionRequired'));
        return;
      }

      const totalAmount = parseFloat(partIForm.amountToSea || '0') +
        parseFloat(partIForm.amountToReception || '0') +
        parseFloat(partIForm.amountIncinerated || '0');

      if (totalAmount <= 0) {
        toast.error(t('logbooks.garbageRecord.amountGreaterThanZero'));
        return;
      }

      // Check sea discharge prohibition
      const category = PART_I_CATEGORIES.find(c => c.code === partIForm.category);
      if (parseFloat(partIForm.amountToSea) > 0 && category && !category.seaDischarge) {
        let catName = category.name;
        if (isVi) {
          if (category.code === 'A') catName = 'Chất dẻo (Nhựa)';
          else if (category.code === 'B') catName = 'Chất thải thực phẩm';
          else if (category.code === 'C') catName = 'Chất thải sinh hoạt';
          else if (category.code === 'D') catName = 'Dầu ăn';
          else if (category.code === 'E') catName = 'Tro lò đốt';
          else if (category.code === 'F') catName = 'Chất thải khai thác';
          else if (category.code === 'G') catName = 'Xác động vật';
          else if (category.code === 'H') catName = 'Ngư cụ';
          else if (category.code === 'I') catName = 'Rác thải điện tử';
        }
        toast.error(
          isVi
            ? `Loại ${category.code} (${catName}) không được phép xả ra biển theo MARPOL Phụ lục V`
            : `Category ${category.code} (${category.name}) cannot be discharged to sea per MARPOL Annex V`
        );
        return;
      }

      // Require position for sea discharge
      if (parseFloat(partIForm.amountToSea) > 0 && (!partIForm.latitude || !partIForm.longitude)) {
        toast.error(t('logbooks.garbageRecord.positionRequired'));
        return;
      }

      // Require port for reception
      if (parseFloat(partIForm.amountToReception) > 0 && !partIForm.portName && !partIForm.receptionFacilityName) {
        toast.error(t('logbooks.garbageRecord.portOrFacilityRequired'));
        return;
      }

      const entry = {
        operationDate: partIForm.operationDate,
        operationTime: partIForm.operationTime + ':00', // Convert HH:mm to HH:mm:ss for TimeSpan
        ...(partIForm.operationEndTime && partIForm.operationEndTime.trim().length > 0 && {
          operationEndTime: partIForm.operationEndTime + ':00'
        }),
        category: partIForm.category,
        description: partIForm.description,
        ...(parseFloat(partIForm.amountToSea) > 0 && {
          estimatedAmountDischargedToSea: parseFloat(partIForm.amountToSea)
        }),
        ...(parseFloat(partIForm.amountToReception) > 0 && {
          estimatedAmountToReceptionFacilities: parseFloat(partIForm.amountToReception)
        }),
        ...(parseFloat(partIForm.amountIncinerated) > 0 && {
          estimatedAmountIncinerated: parseFloat(partIForm.amountIncinerated)
        }),
        ...(partIForm.latitude && partIForm.latitude !== 0 && {
          dischargeLatitude: partIForm.latitude
        }),
        ...(partIForm.longitude && partIForm.longitude !== 0 && {
          dischargeLongitude: partIForm.longitude
        }),
        ...(partIForm.portName && partIForm.portName.trim().length > 0 && {
          portName: partIForm.portName.trim()
        }),
        ...(partIForm.receptionFacilityName && partIForm.receptionFacilityName.trim().length > 0 && {
          receptionFacilityName: partIForm.receptionFacilityName.trim()
        }),
        ...(partIForm.receiptNumber && partIForm.receiptNumber.trim().length > 0 && {
          receiptNumber: partIForm.receiptNumber.trim()
        }),
        // IMPORTANT: Completely omit these fields if empty, don't send empty strings or null
        ...(partIForm.incinerationStartTime && partIForm.incinerationStartTime.trim().length > 0 && {
          incinerationStartTime: `${partIForm.operationDate}T${partIForm.incinerationStartTime}:00`
        }),
        ...(partIForm.incinerationEndTime && partIForm.incinerationEndTime.trim().length > 0 && {
          incinerationEndTime: `${partIForm.operationDate}T${partIForm.incinerationEndTime}:00`
        }),
        ...(partIForm.incineratorDetails && partIForm.incineratorDetails.trim().length > 0 && {
          incineratorDetails: partIForm.incineratorDetails.trim()
        }),
        ...(partIForm.exceptionalDischargeReason && partIForm.exceptionalDischargeReason.trim().length > 0 && {
          exceptionalDischargeReason: partIForm.exceptionalDischargeReason.trim()
        }),
        ...(partIForm.waterDepth && parseFloat(partIForm.waterDepth) > 0 && {
          waterDepth: parseFloat(partIForm.waterDepth)
        }),
        ...(partIForm.remarks && partIForm.remarks.trim().length > 0 && {
          remarks: partIForm.remarks.trim()
        }),
        officerInCharge: partIForm.officerInCharge
      };

      console.log('=== Submitting Part I Entry ===');
      console.log('Payload:', JSON.stringify(entry, null, 2));

      if (editingId) {
        await logbookService.updateGarbagePartIEntry(editingId, entry);
        toast.success(t('logbooks.garbageRecord.entryUpdated') || 'Entry updated successfully');
      } else {
        await logbookService.createGarbagePartIEntry(entry);
        toast.success(t('logbooks.garbageRecord.entrySaved'));
      }
      fetchEntries();
      setShowForm(false);
      resetPartIForm();
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.error || t('logbooks.garbageRecord.saveFailed'));
    }
  };

  const handlePartIISubmit = async () => {
    try {
      // Validation
      if (!partIIForm.category) {
        toast.error(t('logbooks.garbageRecord.selectCategoryJK'));
        return;
      }

      const totalAmount = parseFloat(partIIForm.amountToSea || '0') +
        parseFloat(partIIForm.amountToReception || '0');

      if (totalAmount <= 0) {
        toast.error(t('logbooks.garbageRecord.amountGreaterThanZero'));
        return;
      }

      // CRITICAL: Check Category K
      if (partIIForm.category === 'K' && parseFloat(partIIForm.amountToSea) > 0) {
        toast.error(t('logbooks.garbageRecord.marpolViolationK'));
        return;
      }

      if (partIIForm.category === 'K' && parseFloat(partIIForm.amountToReception) <= 0) {
        toast.error(t('logbooks.garbageRecord.categoryKReceptionOnly'));
        return;
      }

      // MANDATORY: Check positions
      if (partIIForm.startLatitude === 0 && partIIForm.startLongitude === 0) {
        toast.error(t('logbooks.garbageRecord.startPositionRequired'));
        return;
      }

      if (partIIForm.endLatitude === 0 && partIIForm.endLongitude === 0) {
        toast.error(t('logbooks.garbageRecord.endPositionRequired'));
        return;
      }

      if (!partIIForm.cargoDescription) {
        toast.error(t('logbooks.garbageRecord.cargoDescriptionRequired'));
        return;
      }

      if (!partIIForm.holdNumbersWashed) {
        toast.error(t('logbooks.garbageRecord.holdNumbersWashedRequired'));
        return;
      }

      const entry = {
        operationDate: partIIForm.operationDate,
        operationTime: partIIForm.operationTime + ':00', // Convert HH:mm to HH:mm:ss for TimeSpan
        ...(partIIForm.operationEndTime && partIIForm.operationEndTime.trim().length > 0 && {
          operationEndTime: partIIForm.operationEndTime + ':00'
        }),
        category: partIIForm.category,
        startLatitude: partIIForm.startLatitude,
        startLongitude: partIIForm.startLongitude,
        endLatitude: partIIForm.endLatitude,
        endLongitude: partIIForm.endLongitude,
        ...(parseFloat(partIIForm.amountToSea) > 0 && {
          estimatedAmountDischargedToSea: parseFloat(partIIForm.amountToSea)
        }),
        ...(parseFloat(partIIForm.amountToReception) > 0 && {
          estimatedAmountToReceptionFacilities: parseFloat(partIIForm.amountToReception)
        }),
        ...(partIIForm.portName && partIIForm.portName.trim().length > 0 && {
          portName: partIIForm.portName.trim()
        }),
        ...(partIIForm.receptionFacilityName && partIIForm.receptionFacilityName.trim().length > 0 && {
          receptionFacilityName: partIIForm.receptionFacilityName.trim()
        }),
        ...(partIIForm.receiptNumber && partIIForm.receiptNumber.trim().length > 0 && {
          receiptNumber: partIIForm.receiptNumber.trim()
        }),
        cargoDescription: partIIForm.cargoDescription.trim(),
        holdNumbersWashed: partIIForm.holdNumbersWashed.trim(),
        ...(partIIForm.remarks && partIIForm.remarks.trim().length > 0 && {
          remarks: partIIForm.remarks.trim()
        }),
        officerInCharge: partIIForm.officerInCharge
      };

      console.log('=== Submitting Part II Entry ===');
      console.log('Payload:', JSON.stringify(entry, null, 2));

      if (editingId) {
        await logbookService.updateGarbagePartIIEntry(editingId, entry);
        toast.success(t('logbooks.garbageRecord.entryUpdated') || 'Entry updated successfully');
      } else {
        await logbookService.createGarbagePartIIEntry(entry);
        toast.success(t('logbooks.garbageRecord.entrySaved'));
      }
      fetchEntries();
      setShowForm(false);
      resetPartIIForm();
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.error || t('logbooks.garbageRecord.saveFailed'));
    }
  };

  const handleSignEntry = (entryId: string, type: 'part-i' | 'part-ii', alreadySigned: boolean) => {
    if (alreadySigned) {
      toast.info(t('logbooks.garbageRecord.alreadySigned'));
      return;
    }
    setSignModal({ show: true, entryId, type });
  };

  const confirmSign = async () => {
    if (!signModal.entryId || !masterSignature.trim()) {
      toast.error(t('logbooks.garbageRecord.masterSignatureRequired'));
      return;
    }

    try {
      const signData = {
        signature: masterSignature.trim(),
        masterSignature: masterSignature.trim(),
        signedAt: new Date().toISOString()
      };

      if (signModal.type === 'part-i') {
        await logbookService.signGarbagePartIEntry(signModal.entryId, signData);
      } else {
        await logbookService.signGarbagePartIIEntry(signModal.entryId, signData);
      }
      toast.success(t('logbooks.common.signSuccess'));

      setSignModal({ show: false, entryId: null, type: 'part-i' });
      setMasterSignature('Captain');
      fetchEntries();
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.error || t('logbooks.common.signFailed'));
    }
  };

  const resetPartIForm = () => {
    setPartIForm({
      operationDate: new Date().toISOString().split('T')[0],
      operationTime: new Date().toTimeString().slice(0, 5),
      operationEndTime: '',
      category: '',
      description: '',
      amountToSea: '',
      amountToReception: '',
      amountIncinerated: '',
      latitude: 0,
      longitude: 0,
      portName: '',
      receptionFacilityName: '',
      receiptNumber: '',
      incinerationStartTime: '',
      incinerationEndTime: '',
      incineratorDetails: '',
      exceptionalDischargeReason: '',
      waterDepth: '',
      remarks: '',
      officerInCharge: 'Chief Officer'
    });
    setEditingId(null);
  };

  const resetPartIIForm = () => {
    setPartIIForm({
      operationDate: new Date().toISOString().split('T')[0],
      operationTime: new Date().toTimeString().slice(0, 5),
      operationEndTime: '',
      category: '',
      startLatitude: 0,
      startLongitude: 0,
      endLatitude: 0,
      endLongitude: 0,
      amountToSea: '',
      amountToReception: '',
      portName: '',
      receptionFacilityName: '',
      receiptNumber: '',
      cargoDescription: '',
      holdNumbersWashed: '',
      remarks: '',
      officerInCharge: 'Chief Officer'
    });
    setEditingId(null);
  };

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();
  const visiblePartIEntries = partIEntries.filter(entry => !normalizedSearch || [
    entry.category,
    entry.description,
    entry.portName,
    entry.officerInCharge,
    entry.masterSignature,
  ].some(value => String(value || '').toLocaleLowerCase().includes(normalizedSearch)));
  const visiblePartIIEntries = partIIEntries.filter(entry => !normalizedSearch || [
    entry.category,
    entry.cargoDescription,
    entry.holdNumbersWashed,
    entry.portName,
    entry.officerInCharge,
    entry.masterSignature,
  ].some(value => String(value || '').toLocaleLowerCase().includes(normalizedSearch)));
  const activeEntryCount = activeTab === 'part-i' ? visiblePartIEntries.length : visiblePartIIEntries.length;

  return (
    <div className="h-full min-h-0 w-full flex flex-col overflow-hidden bg-white">
      {/* Header row - same compact visual language as PMS Work Planning */}
      <div className="flex flex-shrink-0 border-b border-gray-200">
        <div className="w-64 flex-shrink-0 flex items-center gap-2 px-3 py-3 bg-blue-800 text-white border-r border-blue-900">
          <Trash2 className="w-4 h-4" />
          <span className="text-sm font-semibold truncate">MARPOL Annex V</span>
        </div>
        <div className="flex-1 flex items-center justify-between gap-4 px-4 py-3 bg-white">
          <div className="min-w-0 flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500 flex-shrink-0" />
            <h1 className="text-sm font-semibold text-gray-700 truncate">
              {t('logbooks.garbageRecord.marpolTitle')}
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-semibold">
              {activeEntryCount}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={fetchEntries}
              disabled={loading}
              className="p-1.5 border border-gray-300 rounded text-gray-500 hover:bg-gray-50 disabled:opacity-50"
              title={t('common.refresh') || 'Refresh'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
        <PermissionGate permission="logbooks.garbage.create"><button
          onClick={() => {
            if (showForm) {
              setShowForm(false);
              resetPartIForm();
              resetPartIIForm();
            } else {
              setShowForm(true);
            }
          }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border transition-colors ${
                showForm
                  ? 'border-gray-300 text-gray-600 bg-white hover:bg-gray-50'
                  : 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
              }`}
        >
              {showForm ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {showForm ? t('common.cancel') : t('logbooks.garbageRecord.newEntry')}
        </button></PermissionGate>
          </div>
        </div>
      </div>

      {/* Search + tabs */}
      <div className="flex flex-shrink-0 border-b border-gray-200 bg-white">
        <div className="w-64 flex-shrink-0 border-r border-gray-200 flex items-center px-2 py-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder={t('common.search') || 'Search'}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>
        <div className="flex flex-1 items-center gap-1 px-4">
          <button
            onClick={() => {
              setActiveTab('part-i');
              setShowForm(false);
              resetPartIForm();
              resetPartIIForm();
            }}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'part-i'
                ? 'text-blue-600 border-blue-600'
                : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            {t('logbooks.garbageRecord.regularGarbage')}
          </button>
          <button
            onClick={() => {
              setActiveTab('part-ii');
              setShowForm(false);
              resetPartIForm();
              resetPartIIForm();
            }}
            className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === 'part-ii'
                ? 'text-blue-600 border-blue-600'
                : 'text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            {t('logbooks.garbageRecord.cargoResidues')}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto bg-white">
        <div className={showForm ? 'p-4' : ''}>

      {/* Forms */}
      {showForm && activeTab === 'part-i' && (
        <PermissionGate permission={editingId ? 'logbooks.garbage.update' : 'logbooks.garbage.create'}><GarbagePartIForm
          form={partIForm}
          onChange={handlePartIChange}
          onCategorySelect={handlePartICategorySelect}
          categories={PART_I_CATEGORIES}
          onSubmit={handlePartISubmit}
          onCancel={() => setShowForm(false)}
        /></PermissionGate>
      )}

      {showForm && activeTab === 'part-ii' && (
        <PermissionGate permission={editingId ? 'logbooks.garbage.update' : 'logbooks.garbage.create'}><GarbagePartIIForm
          form={partIIForm}
          onChange={handlePartIIChange}
          onCategorySelect={handlePartIICategorySelect}
          categories={PART_II_CATEGORIES}
          onSubmit={handlePartIISubmit}
          onCancel={() => setShowForm(false)}
        /></PermissionGate>
      )}

      {/* Entries Table */}
      <div className="bg-white overflow-x-auto border-t border-gray-200">
        <table className="w-full min-w-[1120px] text-left border-collapse text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="bg-blue-50 text-gray-600 text-xs font-semibold">
              <th className="px-3 py-2 border-b border-r border-gray-200">{t('logbooks.garbageRecord.dateTime')}</th>
              <th className="px-3 py-2 border-b border-r border-gray-200">{t('logbooks.garbageRecord.category')}</th>
              {activeTab === 'part-i' ? (
                <>
                  <th className="px-3 py-2 text-right border-b border-r border-gray-200">{t('logbooks.garbageRecord.intoSea')} (m³)</th>
                  <th className="px-3 py-2 text-right border-b border-r border-gray-200">{t('logbooks.garbageRecord.toReception')} (m³)</th>
                  <th className="px-3 py-2 text-right border-b border-r border-gray-200">{t('logbooks.garbageRecord.incinerated')} (m³)</th>
                  <th className="px-3 py-2 border-b border-r border-gray-200">{t('logbooks.garbageRecord.location')}</th>
                </>
              ) : (
                <>
                  <th className="px-3 py-2 border-b border-r border-gray-200">{t('logbooks.garbageRecord.cargoDetails')}</th>
                  <th className="px-3 py-2 text-right border-b border-r border-gray-200">{t('logbooks.garbageRecord.intoSea')} (m³)</th>
                  <th className="px-3 py-2 text-right border-b border-r border-gray-200">{t('logbooks.garbageRecord.toReception')} (m³)</th>
                  <th className="px-3 py-2 border-b border-r border-gray-200">{t('logbooks.garbageRecord.location')}</th>
                </>
              )}
              <th className="px-3 py-2 border-b border-r border-gray-200">{t('logbooks.garbageRecord.officer')}</th>
              <th className="px-3 py-2 text-center border-b border-r border-gray-200">{t('logbooks.garbageRecord.status')}</th>
              <th className="px-3 py-2 text-center border-b border-gray-200">{t('common.action') || 'Action'}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                  {t('common.loading')}
                </td>
              </tr>
            )}
            {!loading && activeTab === 'part-i' && visiblePartIEntries.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                  {t('logbooks.garbageRecord.noEntries')}
                </td>
              </tr>
            )}
            {!loading && activeTab === 'part-ii' && visiblePartIIEntries.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-gray-400">
                  {t('logbooks.garbageRecord.noEntries')}
                </td>
              </tr>
            )}

            {/* Part I Entries */}
            {activeTab === 'part-i' && visiblePartIEntries.map((entry, index) => {
              const category = PART_I_CATEGORIES.find(c => c.code === entry.category);
              let catName = category?.name || entry.description;
              if (isVi) {
                if (entry.category === 'A') catName = 'Chất dẻo (Nhựa)';
                else if (entry.category === 'B') catName = 'Chất thải thực phẩm';
                else if (entry.category === 'C') catName = 'Chất thải sinh hoạt';
                else if (entry.category === 'D') catName = 'Dầu ăn';
                else if (entry.category === 'E') catName = 'Tro lò đốt';
                else if (entry.category === 'F') catName = 'Chất thải khai thác';
                else if (entry.category === 'G') catName = 'Xác động vật';
                else if (entry.category === 'H') catName = 'Ngư cụ';
                else if (entry.category === 'I') catName = 'Rác thải điện tử';
              }
              const isSigned = !!entry.masterSignature;
              return (
                <tr 
                  key={entry.id} 
                  onClick={() => handleSignEntry(entry.id, 'part-i', isSigned)}
                  className={`border-b border-gray-100 ${index % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'} ${
                    !isSigned ? 'cursor-pointer hover:bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                  title={!isSigned ? t('logbooks.garbageRecord.signEntry') : t('logbooks.deckLog.signed')}
                >
                  <td className="px-3 py-2 text-xs text-gray-700 border-r border-gray-100 whitespace-nowrap">
                    {new Date(entry.operationDate).toLocaleDateString()}
                    <br />
                    <span className="text-xs text-gray-500">{entry.operationTime}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700 border-r border-gray-100">
                    <span className="font-bold text-blue-600">{entry.category}</span> - {catName}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700 text-right border-r border-gray-100">
                    {entry.estimatedAmountDischargedToSea?.toFixed(3) || '-'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700 text-right border-r border-gray-100">
                    {entry.estimatedAmountToReceptionFacilities?.toFixed(3) || '-'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700 text-right border-r border-gray-100">
                    {entry.estimatedAmountIncinerated?.toFixed(3) || '-'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600 border-r border-gray-100">
                    {entry.portName || (entry.dischargeLatitude && entry.dischargeLongitude 
                      ? `${entry.dischargeLatitude.toFixed(2)}°, ${entry.dischargeLongitude.toFixed(2)}°`
                      : '-')}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700 border-r border-gray-100">{entry.officerInCharge}</td>
                  <td className="px-3 py-2 text-center border-r border-gray-100">
                    {entry.masterSignature ? (
                      <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded font-medium">
                        {t('logbooks.deckLog.signed')}
                      </span>
                    ) : (
                      <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded font-medium">
                        {t('logbooks.abstractLog.draft')}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-center gap-1">
                      {!isSigned && (
                        <>
                          <PermissionGate permission="logbooks.garbage.update"><button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEditPartI(entry);
                            }}
                            className="px-2 py-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                          >
                            {t('common.edit') || 'EDIT'}
                          </button></PermissionGate>
                          <PermissionGate permission="logbooks.garbage.approve"><button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSignEntry(entry.id, 'part-i', false);
                            }}
                            className="px-2 py-1 text-xs text-gray-500 hover:text-green-600 hover:bg-green-50 rounded"
                          >
                            {t('common.sign') || 'SIGN'}
                          </button></PermissionGate>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}

            {/* Part II Entries */}
            {activeTab === 'part-ii' && visiblePartIIEntries.map((entry, index) => {
              const category = PART_II_CATEGORIES.find(c => c.code === entry.category);
              let catName = category?.name;
              if (isVi) {
                if (entry.category === 'J') catName = 'Dư lượng hàng hóa (không HME)';
                else if (entry.category === 'K') catName = 'Dư lượng hàng hóa (HME)';
              }
              const isSigned = !!entry.masterSignature;
              return (
                <tr 
                  key={entry.id} 
                  onClick={() => handleSignEntry(entry.id, 'part-ii', isSigned)}
                  className={`border-b border-gray-100 ${index % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'} ${
                    !isSigned ? 'cursor-pointer hover:bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                  title={!isSigned ? t('logbooks.garbageRecord.signEntry') : t('logbooks.deckLog.signed')}
                >
                  <td className="px-3 py-2 text-xs text-gray-700 border-r border-gray-100 whitespace-nowrap">
                    {new Date(entry.operationDate).toLocaleDateString()}
                    <br />
                    <span className="text-xs text-gray-500">{entry.operationTime}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700 border-r border-gray-100">
                    <span className={`font-bold ${entry.category === 'K' ? 'text-red-600' : 'text-blue-600'}`}>
                      {entry.category}
                    </span> - {catName}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700 border-r border-gray-100">
                    {entry.cargoDescription}
                    <br />
                    <span className="text-xs text-gray-500">{entry.holdNumbersWashed}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700 text-right border-r border-gray-100">
                    {entry.estimatedAmountDischargedToSea?.toFixed(3) || '-'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700 text-right border-r border-gray-100">
                    {entry.estimatedAmountToReceptionFacilities?.toFixed(3) || '-'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600 border-r border-gray-100">
                    {t('logbooks.garbageRecord.start')}: {entry.startLatitude.toFixed(2)}°, {entry.startLongitude.toFixed(2)}°
                    <br />
                    {t('logbooks.garbageRecord.end')}: {entry.endLatitude.toFixed(2)}°, {entry.endLongitude.toFixed(2)}°
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-700 border-r border-gray-100">{entry.officerInCharge}</td>
                  <td className="px-3 py-2 text-center border-r border-gray-100">
                    {entry.masterSignature ? (
                      <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded font-medium">
                        {t('logbooks.deckLog.signed')}
                      </span>
                    ) : (
                      <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded font-medium">
                        {t('logbooks.abstractLog.draft')}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex items-center justify-center gap-1">
                      {!isSigned && (
                        <>
                          <PermissionGate permission="logbooks.garbage.update"><button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEditPartII(entry);
                            }}
                            className="px-2 py-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                          >
                            {t('common.edit') || 'EDIT'}
                          </button></PermissionGate>
                          <PermissionGate permission="logbooks.garbage.approve"><button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSignEntry(entry.id, 'part-ii', false);
                            }}
                            className="px-2 py-1 text-xs text-gray-500 hover:text-green-600 hover:bg-green-50 rounded"
                          >
                            {t('common.sign') || 'SIGN'}
                          </button></PermissionGate>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

        </div>
      </div>

      {/* Sign Confirmation Modal */}
      {signModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-xl w-full mx-4 overflow-hidden border border-gray-200">
            <div className="px-5 py-3 bg-blue-50 border-b border-blue-100">
            <h3 className="text-sm font-semibold text-blue-800">
              🖊 {t('logbooks.garbageRecord.signEntry')} {signModal.type === 'part-i' ? 'Part I' : 'Part II'}
            </h3>
            </div>
            <div className="p-5">
            <p className="text-sm text-gray-600 mb-4">
              {t('logbooks.voyageLog.signInstructions')}
            </p>
            <div className="mb-6">
              <label className="text-xs text-gray-600 font-medium block mb-1.5">
                {t('logbooks.garbageRecord.masterSignature')}
              </label>
              <input
                type="text"
                value={masterSignature}
                onChange={e => setMasterSignature(e.target.value)}
                className="w-full bg-white border border-gray-300 rounded text-sm text-gray-900 px-3 py-2 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                placeholder={t('logbooks.garbageRecord.enterMasterName')}
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setSignModal({ show: false, entryId: null, type: 'part-i' });
                  setMasterSignature('Captain');
                }}
                className="px-3 py-1.5 border border-gray-300 text-gray-600 text-xs font-medium rounded hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <PermissionGate permission="logbooks.garbage.approve"><button
                onClick={confirmSign}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700"
              >
                ✓ {t('logbooks.garbageRecord.signEntry')}
              </button></PermissionGate>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
