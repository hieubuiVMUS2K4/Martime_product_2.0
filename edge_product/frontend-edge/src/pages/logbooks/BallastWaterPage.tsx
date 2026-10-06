import { PermissionGate } from '@/components/auth/PermissionGate'
import React, { useState, useEffect } from 'react';
import { LogbookGrid } from '../../components/common/LogbookGrid';
import { MaritimeInput } from '../../components/common/MaritimeInput';
import { CoordinatePicker } from '../../components/common/CoordinatePicker';
import { toast } from 'sonner';
import { logbookService } from '../../services/logbook.service';
import type { BallastWaterRecordResponseDto } from '../../types/logbook.types';
import { useTranslationSafe } from '@/contexts/I18nContext';

// BWM Convention Operation Codes
const BWM_OPERATIONS = [
  { code: '1', name: 'Ballast water uptake', requiresTreatment: false },
  { code: '2', name: 'Ballast water circulation/exchange at sea', requiresTreatment: false },
  { code: '3', name: 'Ballast water exchange - sequential method', requiresTreatment: false },
  { code: '4', name: 'Ballast water exchange - flow-through method', requiresTreatment: false },
  { code: '5', name: 'Ballast water discharge at sea', requiresTreatment: true },
  { code: '6', name: 'Ballast water discharge to reception facility', requiresTreatment: false },
  { code: '7', name: 'Accidental/exceptional uptake or discharge', requiresTreatment: false },
  { code: '8', name: 'Ballast water management (D-2 treatment)', requiresTreatment: true },
  { code: '9', name: 'Discharge of sediment', requiresTreatment: false },
];

const EXCHANGE_METHODS = [
  { value: 'SEQUENTIAL', label: 'Sequential (Empty-Refill)' },
  { value: 'FLOW_THROUGH', label: 'Flow-Through (Continuous)' },
];

const TREATMENT_SYSTEMS = [
  { value: 'UV', label: 'UV Disinfection' },
  { value: 'ELECTROLYSIS', label: 'Electrolysis (Chlorination)' },
  { value: 'FILTRATION', label: 'Filtration + UV' },
  { value: 'OZONE', label: 'Ozone Treatment' },
];

export const BallastWaterPage: React.FC = () => {
  const { t } = useTranslationSafe();
  const [entries, setEntries] = useState<BallastWaterRecordResponseDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [selectedOperation, setSelectedOperation] = useState<typeof BWM_OPERATIONS[0] | null>(null);
  const [formData, setFormData] = useState({
    ballastTank: '',
    volume: '',
    startLat: 0,
    startLon: 0,
    endLat: 0,
    endLon: 0,
    waterDepth: '',
    distanceFromLand: '',
    exchangeMethod: '',
    exchangeVolumePercent: '',
    treatmentSystemUsed: false,
    treatmentSystemType: '',
    treatmentSuccessful: true,
    salinityBefore: '',
    salinityAfter: '',
    portName: '',
    receptionFacility: '',
    officerInCharge: '',
    remarks: ''
  });

  const handleStartEdit = (entry: BallastWaterRecordResponseDto) => {
    const op = BWM_OPERATIONS.find(o => o.code === entry.operationCode) || null;
    setSelectedOperation(op);
    setFormData({
      ballastTank: entry.ballastTank || '',
      volume: entry.volume?.toString() || '',
      startLat: entry.startLatitude ?? 0,
      startLon: entry.startLongitude ?? 0,
      endLat: entry.endLatitude ?? 0,
      endLon: entry.endLongitude ?? 0,
      waterDepth: entry.waterDepth?.toString() || '',
      distanceFromLand: entry.distanceFromLand?.toString() || '',
      exchangeMethod: entry.exchangeMethod || '',
      exchangeVolumePercent: entry.exchangeVolumePercent?.toString() || '',
      treatmentSystemUsed: entry.treatmentSystemUsed ?? false,
      treatmentSystemType: entry.treatmentSystemType || '',
      treatmentSuccessful: entry.treatmentSuccessful ?? true,
      salinityBefore: entry.salinityBefore?.toString() || '',
      salinityAfter: entry.salinityAfter?.toString() || '',
      portName: entry.portName || '',
      receptionFacility: entry.receptionFacility || '',
      officerInCharge: entry.officerInCharge || '',
      remarks: entry.remarks || ''
    });
    setEditingId(entry.id);
    setStep(2);
    setShowForm(true);
  };

  const [signModal, setSignModal] = useState<{
    show: boolean;
    entryId: string | null;
  }>({ show: false, entryId: null });
  const [masterSignature, setMasterSignature] = useState('Captain');

  const handleSignEntry = (entryId: string, alreadySigned: boolean) => {
    if (alreadySigned) {
      toast.info(t('logbooks.common.alreadySigned') || 'This entry is already signed');
      return;
    }
    setSignModal({ show: true, entryId });
  };

  const confirmSign = async () => {
    if (!signModal.entryId || !masterSignature.trim()) {
      toast.error('Master signature is required');
      return;
    }

    try {
      const signData = {
        signature: masterSignature.trim(),
        signedAt: new Date().toISOString()
      };

      await logbookService.signBallastWaterEntry(signModal.entryId, signData);
      toast.success(t('logbooks.common.signSuccess'));
      
      setSignModal({ show: false, entryId: null });
      setMasterSignature('Captain');
      fetchEntries();
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.error || t('logbooks.common.signFailed'));
    }
  };

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const response = await logbookService.getBallastWaterEntries({ page: 1, pageSize: 20 });
      setEntries(response.data);
    } catch (error) {
      console.error(error);
      toast.error(t('logbooks.ballastWater.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  const handleOperationSelect = (op: typeof BWM_OPERATIONS[0]) => {
    setSelectedOperation(op);
    setStep(2);
  };

  const handleSave = async () => {
    // Validation
    if (!formData.ballastTank || !formData.volume) {
      toast.error(t('logbooks.ballastWater.tankVolumeRequired'));
      return;
    }

    // D-2 Treatment validation
    if (selectedOperation?.code === '5' || selectedOperation?.code === '8') {
      if (!formData.treatmentSystemUsed) {
        toast.error(t('logbooks.ballastWater.d2Required'));
        return;
      }
      if (!formData.treatmentSystemType) {
        toast.error(t('logbooks.ballastWater.selectTreatment'));
        return;
      }
    }

    // Exchange validation (codes 2, 3, 4)
    if (['2', '3', '4'].includes(selectedOperation?.code || '')) {
      if (!formData.exchangeMethod) {
        toast.error(t('logbooks.ballastWater.selectExchangeMethod'));
        return;
      }
      if (!formData.distanceFromLand || parseFloat(formData.distanceFromLand) < 200) {
        toast.warning('D-1 Exchange should be performed at least 200 NM from land');
      }
      if (!formData.waterDepth || parseFloat(formData.waterDepth) < 200) {
        toast.warning('D-1 Exchange should be performed in water deeper than 200 meters');
      }
    }

    try {
      const entry = {
        operationDateTime: new Date().toISOString(),
        operationCode: selectedOperation?.code || '',
        operationDescription: selectedOperation?.name || '',
        ballastTank: formData.ballastTank,
        volume: parseFloat(formData.volume),
        startLatitude: formData.startLat,
        startLongitude: formData.startLon,
        endLatitude: formData.endLat,
        endLongitude: formData.endLon,
        waterDepth: formData.waterDepth ? parseFloat(formData.waterDepth) : undefined,
        distanceFromLand: formData.distanceFromLand ? parseFloat(formData.distanceFromLand) : undefined,
        exchangeMethod: formData.exchangeMethod || undefined,
        exchangeVolumePercent: formData.exchangeVolumePercent ? parseFloat(formData.exchangeVolumePercent) : undefined,
        treatmentSystemUsed: formData.treatmentSystemUsed,
        treatmentSystemType: formData.treatmentSystemType || undefined,
        treatmentSuccessful: formData.treatmentSuccessful,
        salinityBefore: formData.salinityBefore ? parseFloat(formData.salinityBefore) : undefined,
        salinityAfter: formData.salinityAfter ? parseFloat(formData.salinityAfter) : undefined,
        portName: formData.portName || undefined,
        receptionFacility: formData.receptionFacility || undefined,
        officerInCharge: formData.officerInCharge || 'Chief Officer',
        remarks: formData.remarks || undefined
      };

      if (editingId) {
        await logbookService.updateBallastWaterEntry(editingId, entry);
        toast.success(t('logbooks.ballastWater.entryUpdated') || 'Entry updated successfully');
      } else {
        await logbookService.createBallastWaterEntry(entry);
        toast.success(t('logbooks.ballastWater.entrySaved'));
      }
      fetchEntries();
      setShowForm(false);
      
      // Reset
      setStep(1);
      setEditingId(null);
      setSelectedOperation(null);
      setFormData({
        ballastTank: '',
        volume: '',
        startLat: 0,
        startLon: 0,
        endLat: 0,
        endLon: 0,
        waterDepth: '',
        distanceFromLand: '',
        exchangeMethod: '',
        exchangeVolumePercent: '',
        treatmentSystemUsed: false,
        treatmentSystemType: '',
        treatmentSuccessful: true,
        salinityBefore: '',
        salinityAfter: '',
        portName: '',
        receptionFacility: '',
        officerInCharge: '',
        remarks: ''
      });
    } catch (error) {
      console.error(error);
      toast.error(t('logbooks.ballastWater.saveFailed'));
    }
  };

  return (
    <LogbookGrid 
      title={t('logbooks.ballastWater.bwmTitle')}
      actions={
        <PermissionGate permission="logbooks.ballast.create"><button
          onClick={() => {
            if (showForm) {
              setShowForm(false);
              setStep(1);
              setEditingId(null);
              setSelectedOperation(null);
              setFormData({
                ballastTank: '',
                volume: '',
                startLat: 0,
                startLon: 0,
                endLat: 0,
                endLon: 0,
                waterDepth: '',
                distanceFromLand: '',
                exchangeMethod: '',
                exchangeVolumePercent: '',
                treatmentSystemUsed: false,
                treatmentSystemType: '',
                treatmentSuccessful: true,
                salinityBefore: '',
                salinityAfter: '',
                portName: '',
                receptionFacility: '',
                officerInCharge: '',
                remarks: ''
              });
            } else {
              setShowForm(true);
            }
          }}
          className="bg-blue-600 text-white font-semibold py-2.5 px-6 rounded-lg shadow-md hover:bg-blue-700 "
        >
          {showForm ? t('common.cancel') : t('logbooks.ballastWater.newEntry')}
        </button></PermissionGate>
      }
    >
      {showForm && (
      <div className="max-w-5xl mx-auto w-full mb-6">
        {/* Progress */}
        <div className="flex justify-between mb-8">
          {[1, 2].map(s => (
            <div key={s} className={`flex items-center ${s < 2 ? 'flex-1' : ''}`}>
              <div className={`
                w-12 h-12 rounded-full flex items-center justify-center font-sans font-bold border-2
                ${step >= s ? 'bg-blue-600 text-white border-blue-500' : 'bg-transparent text-gray-500 border-gray-500'}
              `}>
                {s}
              </div>
              {s < 2 && (
                <div className={`h-1 flex-1 mx-2 ${step > s ? 'bg-blue-600' : 'bg-gray-700'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Select Operation */}
        {step === 1 && (
          <div className="bg-white dark:bg-gray-800 p-6 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
            <h2 className="text-blue-600 dark:text-blue-400 font-sans text-xl font-bold mb-6">
              {t('logbooks.ballastWater.step1Title')}
            </h2>
            <div className="flex flex-col gap-3">
              {BWM_OPERATIONS.map(op => (
                <button
                  key={op.code}
                  onClick={() => handleOperationSelect(op)}
                  className="text-left p-4 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-blue-500 transition-colors"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="text-blue-600 dark:text-blue-400 font-bold font-sans mr-4">
                        {t('logbooks.oilRecord.codeLabel')} {op.code}
                      </span>
                      <span className="text-gray-900 dark:text-white font-sans">{op.name}</span>
                    </div>
                    {op.requiresTreatment && (
                      <span className="bg-blue-600 text-white text-xs px-2 py-1 font-sans rounded">
                        D-2 REQUIRED
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Enter Details */}
        {step === 2 && selectedOperation && (
          <div className="bg-white dark:bg-gray-800 p-6 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
            <h2 className="text-blue-600 dark:text-blue-400 font-sans text-xl font-bold mb-4">
              {t('logbooks.ballastWater.step2Title')}
            </h2>
            
            <div className="bg-gray-50/30 dark:bg-gray-700/30 p-4 mb-6 border border-gray-200 dark:border-gray-700">
              <span className="text-gray-400 font-sans text-sm">{t('logbooks.ballastWater.operation')}: </span>
              <span className="text-gray-900 dark:text-white font-sans font-bold">
                {t('logbooks.oilRecord.codeLabel')} {selectedOperation.code} - {selectedOperation.name}
              </span>
            </div>

            <div className="flex flex-col gap-6">
              {/* Tank & Volume */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <MaritimeInput
                  label={t('logbooks.ballastWater.ballastTankId')}
                  value={formData.ballastTank}
                  onChange={e => setFormData({ ...formData, ballastTank: e.target.value })}
                  placeholder="e.g., No. 1 Port"
                />
                <MaritimeInput
                  label={t('logbooks.oilRecord.quantity')}
                  type="number"
                  step="0.1"
                  value={formData.volume}
                  onChange={e => setFormData({ ...formData, volume: e.target.value })}
                  placeholder="0.0"
                />
              </div>

              {/* Position at Start */}
              <div className="border border-blue-600/30 bg-blue-900/10 p-4">
                <div className="text-blue-600 dark:text-blue-400 font-sans text-sm font-semibold mb-4">{t('logbooks.ballastWater.startPosition')}</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <CoordinatePicker
                    label={t('logbooks.deckLog.latitude')}
                    type="latitude"
                    value={formData.startLat}
                    onChange={lat => setFormData(prev => ({ ...prev, startLat: lat }))}
                  />
                  <CoordinatePicker
                    label={t('logbooks.deckLog.longitude')}
                    type="longitude"
                    value={formData.startLon}
                    onChange={lon => setFormData(prev => ({ ...prev, startLon: lon }))}
                  />
                </div>
              </div>

              {/* Exchange-specific fields (codes 2, 3, 4) */}
              {['2', '3', '4'].includes(selectedOperation.code) && (
                <div className="border border-green-600/30 bg-green-900/10 p-4">
                  <div className="text-green-600 dark:text-green-400 font-sans text-sm font-semibold mb-4">{t('logbooks.ballastWater.d1ExchangeParams')}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-blue-600 dark:text-blue-400 font-sans text-sm block mb-2">
                        {t('logbooks.ballastWater.exchangeMethod')}
                      </label>
                      <select
                        value={formData.exchangeMethod}
                        onChange={e => setFormData({ ...formData, exchangeMethod: e.target.value })}
                        className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-sans text-base p-3 rounded-lg focus:border-blue-500 focus:outline-none"
                      >
                        <option value="">{t('logbooks.ballastWater.selectExchangeMethod')}</option>
                        {EXCHANGE_METHODS.map(m => (
                          <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                      </select>
                    </div>
                    <MaritimeInput
                      label={t('logbooks.ballastWater.exchangeVolumePercent')}
                      type="number"
                      min="0"
                      max="100"
                      value={formData.exchangeVolumePercent}
                      onChange={e => setFormData({ ...formData, exchangeVolumePercent: e.target.value })}
                      placeholder="95%"
                    />
                    <MaritimeInput
                      label={t('logbooks.ballastWater.waterDepth')}
                      type="number"
                      value={formData.waterDepth}
                      onChange={e => setFormData({ ...formData, waterDepth: e.target.value })}
                      placeholder="Min 200m recommended"
                    />
                    <MaritimeInput
                      label={t('logbooks.ballastWater.distanceFromLand')}
                      type="number"
                      value={formData.distanceFromLand}
                      onChange={e => setFormData({ ...formData, distanceFromLand: e.target.value })}
                      placeholder="Min 200 NM"
                    />
                    <MaritimeInput
                      label={t('logbooks.ballastWater.salinityBefore')}
                      type="number"
                      step="0.1"
                      value={formData.salinityBefore}
                      onChange={e => setFormData({ ...formData, salinityBefore: e.target.value })}
                      placeholder="e.g., 15.0"
                    />
                    <MaritimeInput
                      label={t('logbooks.ballastWater.salinityAfter')}
                      type="number"
                      step="0.1"
                      value={formData.salinityAfter}
                      onChange={e => setFormData({ ...formData, salinityAfter: e.target.value })}
                      placeholder="e.g., 32.5"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    <CoordinatePicker
                      label={t('logbooks.deckLog.latitude')}
                      type="latitude"
                      value={formData.endLat}
                      onChange={lat => setFormData(prev => ({ ...prev, endLat: lat }))}
                    />
                    <CoordinatePicker
                      label={t('logbooks.deckLog.longitude')}
                      type="longitude"
                      value={formData.endLon}
                      onChange={lon => setFormData(prev => ({ ...prev, endLon: lon }))}
                    />
                  </div>
                </div>
              )}

              {/* D-2 Treatment System (codes 5, 8) */}
              {(selectedOperation.code === '5' || selectedOperation.code === '8') && (
                <div className="border border-purple-600/30 bg-purple-900/10 p-4">
                  <div className="text-purple-600 dark:text-purple-400 font-sans text-sm mb-4 flex items-center gap-2">
                    {t('logbooks.ballastWater.d2TreatmentSystem')}
                    <span className="bg-red-600 text-white text-xs px-2 py-1 rounded">REQUIRED</span>
                  </div>
                  <div className="flex items-center gap-4 mb-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.treatmentSystemUsed}
                        onChange={e => setFormData({ ...formData, treatmentSystemUsed: e.target.checked })}
                        className="w-6 h-6"
                      />
                      <span className="text-gray-900 dark:text-white font-sans">{t('logbooks.ballastWater.treatmentSystemUsed')}</span>
                    </label>
                  </div>
                  {formData.treatmentSystemUsed && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-blue-600 dark:text-blue-400 font-sans text-sm block mb-2">
                          {t('logbooks.ballastWater.treatmentSystemType')}
                        </label>
                        <select
                          value={formData.treatmentSystemType}
                          onChange={e => setFormData({ ...formData, treatmentSystemType: e.target.value })}
                          className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-sans text-base p-3 rounded-lg focus:border-blue-500 focus:outline-none"
                        >
                          <option value="">{t('logbooks.ballastWater.selectTreatment')}</option>
                          {TREATMENT_SYSTEMS.map(tOption => (
                            <option key={tOption.value} value={tOption.value}>{tOption.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-blue-600 dark:text-blue-400 font-sans text-sm block mb-2">
                          {t('logbooks.ballastWater.treatmentResult')}
                        </label>
                        <select
                          value={formData.treatmentSuccessful ? 'SUCCESS' : 'FAILURE'}
                          onChange={e => setFormData({ ...formData, treatmentSuccessful: e.target.value === 'SUCCESS' })}
                          className="w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white font-sans text-base p-3 rounded-lg focus:border-blue-500 focus:outline-none"
                        >
                          <option value="SUCCESS">{t('logbooks.ballastWater.successful')}</option>
                          <option value="FAILURE">{t('logbooks.ballastWater.failedPartial')}</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Port/Facility (code 6) */}
              {selectedOperation.code === '6' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <MaritimeInput
                    label={t('voyageLog.form.portName')}
                    value={formData.portName}
                    onChange={e => setFormData({ ...formData, portName: e.target.value })}
                    placeholder="Port of discharge"
                  />
                  <MaritimeInput
                    label={t('logbooks.ballastWater.receptionFacility')}
                    value={formData.receptionFacility}
                    onChange={e => setFormData({ ...formData, receptionFacility: e.target.value })}
                    placeholder="Facility name"
                  />
                </div>
              )}

              {/* Officer & Remarks */}
              <MaritimeInput
                label={t('logbooks.oilRecord.officerInCharge')}
                value={formData.officerInCharge}
                onChange={e => setFormData({ ...formData, officerInCharge: e.target.value })}
                placeholder="Name / Rank"
              />
              
              <div>
                <label className="text-blue-600 dark:text-blue-400 font-sans text-sm block mb-2">
                  {t('voyageLog.form.remarks')}
                </label>
                <textarea
                  value={formData.remarks}
                  onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                  className="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white font-sans p-4 rounded-lg focus:border-blue-500 focus:outline-none h-24 resize-none"
                  placeholder={t('voyageLog.form.remarksPlaceholder')}
                />
              </div>

              {/* Actions */}
              <div className="flex justify-between mt-6">
                <button 
                  onClick={() => setStep(1)}
                  className="text-gray-900 dark:text-white font-sans underline hover:text-blue-600"
                >
                  {t('common.back')}
                </button>
                <PermissionGate permission={editingId ? 'logbooks.ballast.update' : 'logbooks.ballast.create'}><button
                  onClick={handleSave}
                  className="bg-green-600 text-white font-semibold py-2.5 px-8 rounded-lg shadow-md hover:bg-green-700 "
                >
                  {t('voyageLog.saveEntry')}
                </button></PermissionGate>
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Entries Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto mt-6 shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 text-blue-600 font-sans text-sm font-semibold">
              <th className="p-4 border-b border-gray-200">{t('voyageLog.dateTime')}</th>
              <th className="p-4 border-b border-gray-200">{t('voyageLog.event')}</th>
              <th className="p-4 border-b border-gray-200">{t('logbooks.oilRecord.tankLocation')}</th>
              <th className="p-4 border-b border-gray-200">{t('logbooks.oilRecord.quantity')}</th>
              <th className="p-4 border-b border-gray-200">{t('voyageLog.form.position')}</th>
              <th className="p-4 border-b border-gray-200">{t('logbooks.ballastWater.d2TreatmentSystem')}</th>
              <th className="p-4 border-b border-gray-200">{t('voyageLog.officer')}</th>
              <th className="p-4 border-b border-gray-200">{t('voyageLog.status')}</th>
              <th className="p-4 border-b border-gray-200">{t('common.action') || 'Action'}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={9} className="p-4 text-center text-green-600 font-sans">
                  {t('common.loading')}
                </td>
              </tr>
            )}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={9} className="p-4 text-center text-gray-500 font-sans">
                  {t('logbooks.ballastWater.noEntries')}
                </td>
              </tr>
            )}
            {entries.map(entry => {
              const operation = BWM_OPERATIONS.find(op => op.code === entry.operationCode);
              const isSigned = !!entry.masterSignature;
              return (
                <tr 
                  key={entry.id} 
                  onClick={() => handleSignEntry(entry.id, isSigned)}
                  className={`border-b border-gray-200 hover:bg-gray-50 ${
                    !isSigned ? 'cursor-pointer hover:bg-blue-50' : ''
                  }`}
                  title={!isSigned ? 'Click to sign this entry' : 'Already signed'}
                >
                  <td className="p-4 font-sans text-gray-900">{new Date(entry.operationDateTime).toLocaleDateString()}</td>
                  <td className="p-4 font-sans text-gray-900 text-sm">
                    <span className="bg-blue-600 text-white px-2 py-1 text-xs">
                      {entry.operationCode}
                    </span>
                    <div className="text-xs text-gray-400 mt-1">{operation?.name}</div>
                  </td>
                  <td className="p-4 font-sans text-gray-900">{entry.ballastTank}</td>
                  <td className="p-4 font-sans text-gray-900">{entry.volume.toFixed(2)}</td>
                  <td className="p-4 font-sans text-gray-900 text-xs">
                    {entry.portName || `${entry.startLatitude.toFixed(2)}°, ${entry.startLongitude.toFixed(2)}°`}
                  </td>
                  <td className="p-4 font-sans text-gray-900 text-xs">
                    {entry.treatmentSystemUsed ? (
                      <span className="bg-green-600 text-white px-2 py-1 text-xs">
                        {entry.treatmentSystemType}
                      </span>
                    ) : (
                      <span className="text-gray-500">{t('logbooks.ballastWater.noTreatment')}</span>
                    )}
                  </td>
                  <td className="p-4 font-sans text-gray-900 text-sm">{entry.officerInCharge}</td>
                  <td className="p-4">
                    {entry.masterSignature ? (
                      <span className="bg-green-600 text-white text-xs px-2 py-1 font-sans font-bold">
                        {t('logbooks.deckLog.signed')}
                      </span>
                    ) : (
                      <span className="bg-yellow-600 text-black text-xs px-2 py-1 font-sans font-bold">
                        {t('voyageLog.draft')}
                      </span>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      {!isSigned && (
                        <>
                          <PermissionGate permission="logbooks.ballast.update"><button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleStartEdit(entry);
                            }}
                            className="text-amber-600 hover:underline font-sans text-sm font-semibold"
                          >
                            {t('common.edit') || 'EDIT'}
                          </button></PermissionGate>
                          <PermissionGate permission="logbooks.ballast.approve"><button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSignEntry(entry.id, false);
                            }}
                            className="text-green-600 hover:underline font-sans text-sm font-semibold"
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

      {/* Sign Confirmation Modal */}
      {signModal.show && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-blue-600 font-sans mb-4">
              🖊 {t('logbooks.deckLog.sign')} {t('logbooks.ballastWater.title')}
            </h3>
            <p className="text-gray-700 font-sans mb-4">
              By signing this entry, you confirm that all information is accurate and complete.
              This action cannot be undone.
            </p>
            <div className="mb-6">
              <label className="text-blue-600 font-sans text-sm font-semibold block mb-2">
                Master Signature *
              </label>
              <input
                type="text"
                value={masterSignature}
                onChange={e => setMasterSignature(e.target.value)}
                className="w-full bg-white border-2 border-gray-200 text-gray-900 font-sans p-3 focus:border-blue-500 focus:outline-none"
                placeholder="Enter master's name"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setSignModal({ show: false, entryId: null });
                  setMasterSignature('Captain');
                }}
                className="px-6 py-2.5 border-2 border-gray-300 text-gray-700 font-sans font-semibold rounded hover:bg-gray-50"
              >
                {t('common.cancel')}
              </button>
              <PermissionGate permission="logbooks.ballast.approve"><button
                onClick={confirmSign}
                className="px-6 py-2.5 bg-green-600 text-white font-sans font-semibold rounded hover:bg-green-700"
              >
                ✓ {t('logbooks.deckLog.sign')}
              </button></PermissionGate>
            </div>
          </div>
        </div>
      )}
    </LogbookGrid>
  );
};
