import { PermissionGate } from '@/components/auth/PermissionGate'
import React, { useState, useEffect } from 'react';
import { LogbookGrid } from '../../components/common/LogbookGrid';
import { MaritimeInput } from '../../components/common/MaritimeInput';
import { logbookService } from '../../services/logbook.service';
import { CreateOilRecordEntryDto, OilRecordEntryResponseDto } from '../../types/logbook.types';
import { toast } from 'sonner';
import { useTranslationSafe } from '@/contexts/I18nContext';

const OPERATIONS = [
  { code: 'A', desc: 'Ballasting or cleaning of oil fuel tanks' },
  { code: 'B', desc: 'Discharge of dirty ballast or cleaning water from oil fuel tanks' },
  { code: 'C', desc: 'Collection and disposal of oil residues (sludge)' },
  { code: 'D', desc: 'Non-automatic starting of discharge overboard, transfer or other disposal of bilge water' },
  { code: 'H', desc: 'Bunkering of fuel or bulk lubricating oil' },
];

export const OilRecordPage: React.FC = () => {
  const { t } = useTranslationSafe();
  const [entries, setEntries] = useState<OilRecordEntryResponseDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    operationCode: '',
    itemNo: '',
    quantity: '',
    tank: '',
    officerInCharge: ''
  });

  const handleStartEdit = (entry: OilRecordEntryResponseDto) => {
    // Parse itemNo from remarks or description
    const itemNo = entry.remarks?.replace('Item No: ', '') || 
                   entry.operationDescription?.match(/Item:\s*([^\s)]+)/)?.[1] || '';
    setFormData({
      operationCode: entry.operationCode || '',
      itemNo: itemNo,
      quantity: entry.quantity?.toString() || '',
      tank: entry.tankFrom || '',
      officerInCharge: entry.officerInCharge || ''
    });
    setEditingId(entry.id);
    setStep(2); // Go directly to details page
    setShowForm(true);
  };

  const handleSign = async (id: string) => {
    try {
      await logbookService.signOilEntry(id, {
        signature: 'Chief Engineer Signature',
        remarks: 'Signed',
        signedAt: new Date().toISOString()
      });
      toast.success(t('logbooks.common.signSuccess'));
      fetchEntries();
    } catch (error) {
      console.error(error);
      toast.error(t('logbooks.common.signFailed'));
    }
  };

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const response = await logbookService.getOilEntries({ page: 1, pageSize: 20 });
      setEntries(response.data);
    } catch (error) {
      console.error(error);
      toast.error(t('logbooks.oilRecord.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  const handleNext = () => setStep(step + 1);
  const handleBack = () => setStep(step - 1);

  const handleSave = async () => {
    try {
      const operation = OPERATIONS.find(op => op.code === formData.operationCode);
      const entry: CreateOilRecordEntryDto = {
        entryDate: new Date().toISOString(),
        operationCode: formData.operationCode,
        operationDescription: `${operation?.desc || ''} (Item: ${formData.itemNo})`,
        quantity: Number(formData.quantity),
        quantityUnit: 'm3',
        tankFrom: formData.tank,
        officerInCharge: formData.officerInCharge || 'Chief Engineer', // Default if empty
        remarks: `Item No: ${formData.itemNo}`
      };

      if (editingId) {
        await logbookService.updateOilEntry(editingId, entry);
        toast.success(t('logbooks.oilRecord.entryUpdated') || 'Entry updated successfully');
      } else {
        await logbookService.createOilEntry(entry);
        toast.success(t('logbooks.oilRecord.entrySaved'));
      }
      fetchEntries();
      setShowForm(false);
      // Reset
      setStep(1);
      setEditingId(null);
      setFormData({
        operationCode: '',
        itemNo: '',
        quantity: '',
        tank: '',
        officerInCharge: ''
      });
    } catch (error) {
      console.error(error);
      toast.error(t('logbooks.oilRecord.saveFailed'));
    }
  };

  return (
    <LogbookGrid 
      title={t('logbooks.oilRecord.partITitle')}
      actions={
        <PermissionGate permission="logbooks.oil.create"><button
          onClick={() => {
            if (showForm) {
              setShowForm(false);
              setStep(1);
              setEditingId(null);
              setFormData({
                operationCode: '',
                itemNo: '',
                quantity: '',
                tank: '',
                officerInCharge: ''
              });
            } else {
              setShowForm(true);
            }
          }}
          className="bg-blue-600 text-white font-semibold py-2.5 px-6 rounded-lg shadow-md hover:bg-blue-700 "
        >
          {showForm ? t('common.cancel') : t('logbooks.oilRecord.newEntry')}
        </button></PermissionGate>
      }
    >
      {showForm && (
        <div className="max-w-2xl mx-auto w-full mb-6">
        {/* Progress Bar */}
        <div className="flex justify-between mb-8">
          {[1, 2, 3].map(s => (
            <div key={s} className={`flex items-center ${s < 3 ? 'flex-1' : ''}`}>
              <div className={`
                w-10 h-10 rounded-full flex items-center justify-center font-sans font-bold border-2
                ${step >= s ? 'bg-blue-600 text-white border-blue-500' : 'bg-transparent text-gray-500 border-gray-500'}
              `}>
                {s}
              </div>
              {s < 3 && (
                <div className={`h-1 flex-1 mx-2 ${step > s ? 'bg-blue-600' : 'bg-gray-700'}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1: Select Operation */}
        {step === 1 && (
          <div className="bg-white p-6 border border-gray-200 rounded-lg shadow-sm">
            <h2 className="text-blue-600 font-sans text-xl font-bold mb-4">{t('logbooks.oilRecord.step1Title')}</h2>
            <div className="flex flex-col gap-2">
              {OPERATIONS.map(op => (
                <button
                  key={op.code}
                  onClick={() => {
                    setFormData({ ...formData, operationCode: op.code });
                    handleNext();
                  }}
                  className="text-left p-4 border border-gray-200 hover:bg-gray-50 hover:border-blue-500 transition-colors"
                >
                  <span className="text-blue-600 font-bold font-sans mr-4">Code {op.code}</span>
                  <span className="text-gray-900 font-sans">{op.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Enter Details */}
        {step === 2 && (
          <div className="bg-white p-6 border border-gray-200 rounded-lg shadow-sm">
            <h2 className="text-blue-600 font-sans text-xl font-bold mb-4">{t('logbooks.oilRecord.step2Title')} (Code {formData.operationCode})</h2>
            <div className="flex flex-col gap-4">
              <MaritimeInput 
                label={t('logbooks.oilRecord.itemNo')} 
                placeholder="e.g., 12.1"
                value={formData.itemNo}
                onChange={e => setFormData({ ...formData, itemNo: e.target.value })}
              />
              <MaritimeInput 
                label={t('logbooks.oilRecord.quantity')} 
                type="number"
                value={formData.quantity}
                onChange={e => setFormData({ ...formData, quantity: e.target.value })}
              />
              <MaritimeInput 
                label={t('logbooks.oilRecord.tankLocation')} 
                placeholder="e.g., Sludge Tank #1"
                value={formData.tank}
                onChange={e => setFormData({ ...formData, tank: e.target.value })}
              />
              <MaritimeInput 
                label={t('logbooks.oilRecord.officerInCharge')} 
                placeholder="Name / Rank"
                value={formData.officerInCharge}
                onChange={e => setFormData({ ...formData, officerInCharge: e.target.value })}
              />
              <div className="flex justify-between mt-4">
                <button onClick={handleBack} className="text-gray-900 font-sans underline">{t('common.back')}</button>
                <button 
                  onClick={handleNext}
                  className="bg-blue-600 text-white font-semibold py-2.5 px-6 rounded-lg shadow-md hover:bg-blue-700"
                >
                  {t('common.next')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Review & Sign */}
        {step === 3 && (
          <div className="bg-white p-6 border border-gray-200 rounded-lg shadow-sm">
            <h2 className="text-blue-600 font-sans text-xl font-bold mb-4">{t('logbooks.oilRecord.step3Title')}</h2>
            <div className="bg-gray-50/30 p-4 mb-6 border border-gray-200 font-sans text-sm">
              <div className="grid grid-cols-2 gap-2">
                <span className="text-gray-400">{t('logbooks.oilRecord.codeLabel')}:</span>
                <span className="text-gray-900">{formData.operationCode}</span>
                
                <span className="text-gray-400">{t('logbooks.oilRecord.itemNo')}:</span>
                <span className="text-gray-900">{formData.itemNo}</span>
                
                <span className="text-gray-400">{t('logbooks.oilRecord.quantity')}:</span>
                <span className="text-gray-900">{formData.quantity} m3</span>
                
                <span className="text-gray-400">{t('logbooks.oilRecord.tankLocation')}:</span>
                <span className="text-gray-900">{formData.tank}</span>

                <span className="text-gray-400">{t('logbooks.oilRecord.officerInCharge')}:</span>
                <span className="text-gray-900">{formData.officerInCharge}</span>
              </div>
            </div>
            
            <div className="flex justify-between mt-4">
              <button onClick={handleBack} className="text-gray-900 font-sans underline">{t('common.back')}</button>
              <PermissionGate permission={editingId ? 'logbooks.oil.update' : 'logbooks.oil.create'}><button
                onClick={handleSave}
                className="bg-green-600 text-white font-semibold py-2.5 px-6 rounded-lg shadow-md hover:bg-green-700"
              >
                {t('common.confirm')}
              </button></PermissionGate>
            </div>
          </div>
        )}
      </div>
      )}

      {/* Entries Table */}
      <div className="bg-white border border-gray-200 overflow-x-auto mt-6">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 text-blue-600 font-sans text-sm font-semibold">
              <th className="p-4 border-b border-gray-200">{t('voyageLog.dateTime')}</th>
              <th className="p-4 border-b border-gray-200">{t('logbooks.oilRecord.codeLabel')}</th>
              <th className="p-4 border-b border-gray-200">{t('voyageLog.event')}</th>
              <th className="p-4 border-b border-gray-200">{t('logbooks.oilRecord.quantity')}</th>
              <th className="p-4 border-b border-gray-200">{t('logbooks.oilRecord.tankLocation')}</th>
              <th className="p-4 border-b border-gray-200">{t('logbooks.oilRecord.officerInCharge')}</th>
              <th className="p-4 border-b border-gray-200">{t('voyageLog.status')}</th>
              <th className="p-4 border-b border-gray-200">{t('common.action') || 'Action'}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={8} className="p-4 text-center text-green-600 font-sans">
                  {t('common.loading')}
                </td>
              </tr>
            )}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={8} className="p-4 text-center text-gray-500 font-sans">
                  {t('logbooks.oilRecord.noEntries')}
                </td>
              </tr>
            )}
            {entries.map(entry => (
              <tr key={entry.id} className="border-b border-gray-200 hover:bg-gray-50">
                <td className="p-4 font-sans text-gray-900">{new Date(entry.entryDate).toLocaleDateString()}</td>
                <td className="p-4 font-sans text-blue-600 font-bold">{entry.operationCode}</td>
                <td className="p-4 font-sans text-gray-900 text-sm">{entry.operationDescription}</td>
                <td className="p-4 font-sans text-gray-900">{entry.quantity} {entry.quantityUnit}</td>
                <td className="p-4 font-sans text-gray-900 text-sm">{entry.tankFrom || '-'}</td>
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
                    {!entry.masterSignature && (
                      <>
                        <PermissionGate permission="logbooks.oil.update"><button
                          onClick={() => handleStartEdit(entry)}
                          className="text-amber-600 hover:underline font-sans text-sm font-semibold"
                        >
                          {t('common.edit') || 'EDIT'}
                        </button></PermissionGate>
                        <PermissionGate permission="logbooks.oil.approve"><button
                          onClick={() => handleSign(entry.id)}
                          className="text-green-600 hover:underline font-sans text-sm font-semibold"
                        >
                          {t('common.sign') || 'SIGN'}
                        </button></PermissionGate>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </LogbookGrid>
  );
};





