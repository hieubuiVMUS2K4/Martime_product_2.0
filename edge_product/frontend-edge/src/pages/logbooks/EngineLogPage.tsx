import { PermissionGate } from '@/components/auth/PermissionGate'
import React, { useState, useEffect } from 'react';
import { LogbookGrid } from '../../components/common/LogbookGrid';
import { MaritimeInput } from '../../components/common/MaritimeInput';
import { logbookService } from '../../services/logbook.service';
import { EngineLogEntryResponseDto, CreateEngineLogEntryDto } from '../../types/logbook.types';
import { toast } from 'sonner';
import { useTranslationSafe } from '@/contexts/I18nContext';

export const EngineLogPage: React.FC = () => {
  const { t } = useTranslationSafe();
  const [entries, setEntries] = useState<EngineLogEntryResponseDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<CreateEngineLogEntryDto>>({});
  const [newEntry, setNewEntry] = useState<Partial<CreateEngineLogEntryDto>>({
    logDateTime: new Date().toISOString().slice(0, 16),
    mainEngineRPM: 0,
    mainEngineLoad: 0,
    mainEngineExhaustTemp: 0,
    mainEngineLubeOilPressure: 0,
    fuelOilConsumedME: 0
  });

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const response = await logbookService.getEngineEntries({ page: 1, pageSize: 20 });
      setEntries(response.data);
    } catch (error) {
      console.error(error);
      toast.error(t('logbooks.engineLog.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewEntry(prev => ({ 
      ...prev, 
      [name]: name === 'logDateTime' ? value : Number(value) 
    }));
  };

  const handleEditInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setEditForm(prev => ({ 
      ...prev, 
      [name]: name === 'logDateTime' ? value : Number(value) 
    }));
  };

  const handleStartEdit = (entry: EngineLogEntryResponseDto) => {
    setEditingId(entry.id);
    setEditForm({
      logDateTime: entry.logDateTime ? new Date(entry.logDateTime).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
      mainEngineRPM: entry.mainEngineRPM || 0,
      mainEngineLoad: entry.mainEngineLoad || 0,
      mainEngineExhaustTemp: entry.mainEngineExhaustTemp || 0,
      mainEngineLubeOilPressure: entry.mainEngineLubeOilPressure || 0,
      fuelOilConsumedME: entry.fuelOilConsumedME || 0
    });
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    try {
      const entryToUpdate: CreateEngineLogEntryDto = {
        logDateTime: new Date(editForm.logDateTime || new Date()).toISOString(),
        watchPeriod: '08-12', // Default
        engineerOnWatch: 'Chief Engineer', // Default
        mainEngineStatus: 'RUNNING',
        mainEngineRPM: editForm.mainEngineRPM,
        mainEngineLoad: editForm.mainEngineLoad,
        mainEngineExhaustTemp: editForm.mainEngineExhaustTemp,
        mainEngineLubeOilPressure: editForm.mainEngineLubeOilPressure,
        fuelOilConsumedME: editForm.fuelOilConsumedME,
      };

      await logbookService.updateEngineEntry(editingId, entryToUpdate);
      toast.success(t('logbooks.engineLog.entryUpdated') || 'Entry updated successfully');
      setEditingId(null);
      setEditForm({});
      fetchEntries();
    } catch (error) {
      console.error(error);
      toast.error(t('logbooks.engineLog.updateFailed') || 'Failed to update entry');
    }
  };

  const handleSign = async (id: string) => {
    try {
      await logbookService.signEngineEntry(id, {
        signature: 'Chief Engineer Signature',
        remarks: 'Signed',
        signedAt: new Date().toISOString()
      });
      toast.success(t('logbooks.common.signSuccess') || 'Signed successfully');
      fetchEntries();
    } catch (error) {
      console.error(error);
      toast.error(t('logbooks.common.signFailed') || 'Failed to sign entry');
    }
  };

  const handleAdd = async () => {
    try {
      const entryToCreate: CreateEngineLogEntryDto = {
        logDateTime: new Date(newEntry.logDateTime || new Date()).toISOString(),
        watchPeriod: '08-12', // Default for now
        engineerOnWatch: 'Chief Engineer', // Default
        mainEngineStatus: 'RUNNING',
        mainEngineRPM: newEntry.mainEngineRPM,
        mainEngineLoad: newEntry.mainEngineLoad,
        mainEngineExhaustTemp: newEntry.mainEngineExhaustTemp,
        mainEngineLubeOilPressure: newEntry.mainEngineLubeOilPressure,
        fuelOilConsumedME: newEntry.fuelOilConsumedME,
      };

      await logbookService.createEngineEntry(entryToCreate);
      toast.success(t('logbooks.engineLog.entryAdded'));
      fetchEntries();
      setNewEntry({
        logDateTime: new Date().toISOString().slice(0, 16),
        mainEngineRPM: 0,
        mainEngineLoad: 0,
        mainEngineExhaustTemp: 0,
        mainEngineLubeOilPressure: 0,
        fuelOilConsumedME: 0
      });
    } catch (error) {
      console.error(error);
      toast.error(t('logbooks.engineLog.addFailed'));
    }
  };

  return (
    <LogbookGrid title={t('logbooks.engineLog.mainEngineTitle')}>
      <div className="overflow-x-auto bg-white border border-gray-200">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 text-blue-600 font-sans text-sm font-semibold">
              <th className="p-4 border-b border-gray-200">{t('logbooks.engineLog.time')}</th>
              <th className="p-4 border-b border-gray-200">{t('logbooks.engineLog.rpm')}</th>
              <th className="p-4 border-b border-gray-200">{t('logbooks.engineLog.load')}</th>
              <th className="p-4 border-b border-gray-200">{t('logbooks.engineLog.exhaustTemp')}</th>
              <th className="p-4 border-b border-gray-200">{t('logbooks.engineLog.lubePress')}</th>
              <th className="p-4 border-b border-gray-200">{t('logbooks.engineLog.fuelCons')}</th>
              <th className="p-4 border-b border-gray-200">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-green-600 font-sans">{t('common.loading')}</td>
              </tr>
            )}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={7} className="p-4 text-center text-gray-500 font-sans">{t('logbooks.engineLog.noEntries')}</td>
              </tr>
            )}
            {entries.map(entry => {
              if (editingId === entry.id) {
                return (
                  <tr key={entry.id} className="border-b border-gray-200 bg-blue-50/50">
                    <td className="p-2">
                      <MaritimeInput 
                        type="datetime-local" 
                        name="logDateTime"
                        value={editForm.logDateTime}
                        onChange={handleEditInputChange}
                        className="h-10 text-sm p-2 w-40" 
                      />
                    </td>
                    <td className="p-2">
                      <MaritimeInput 
                        type="number" 
                        name="mainEngineRPM"
                        value={editForm.mainEngineRPM}
                        onChange={handleEditInputChange}
                        className="h-10 text-sm p-2 w-20" 
                      />
                    </td>
                    <td className="p-2">
                      <MaritimeInput 
                        type="number" 
                        name="mainEngineLoad"
                        value={editForm.mainEngineLoad}
                        onChange={handleEditInputChange}
                        className="h-10 text-sm p-2 w-20" 
                      />
                    </td>
                    <td className="p-2">
                      <MaritimeInput 
                        type="number" 
                        name="mainEngineExhaustTemp"
                        value={editForm.mainEngineExhaustTemp}
                        onChange={handleEditInputChange}
                        className="h-10 text-sm p-2 w-20" 
                      />
                    </td>
                    <td className="p-2">
                      <MaritimeInput 
                        type="number" 
                        name="mainEngineLubeOilPressure"
                        value={editForm.mainEngineLubeOilPressure}
                        onChange={handleEditInputChange}
                        className="h-10 text-sm p-2 w-20" 
                      />
                    </td>
                    <td className="p-2">
                      <MaritimeInput 
                        type="number" 
                        name="fuelOilConsumedME"
                        value={editForm.fuelOilConsumedME}
                        onChange={handleEditInputChange}
                        className="h-10 text-sm p-2 w-20" 
                      />
                    </td>
                    <td className="p-2">
                      <div className="flex gap-2">
                        <PermissionGate permission="logbooks.engine.update"><button
                          onClick={handleUpdate}
                          className="bg-green-600 text-white px-2 py-1 text-xs font-semibold rounded hover:bg-green-700"
                        >
                          Save
                        </button></PermissionGate>
                        <button 
                          onClick={() => { setEditingId(null); setEditForm({}); }}
                          className="bg-gray-500 text-white px-2 py-1 text-xs font-semibold rounded hover:bg-gray-600"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={entry.id} className="border-b border-gray-200 hover:bg-gray-50">
                  <td className="p-4 font-sans text-gray-900">{new Date(entry.logDateTime).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</td>
                  <td className="p-4 font-sans text-gray-900">{entry.mainEngineRPM}</td>
                  <td className="p-4 font-sans text-gray-900">{entry.mainEngineLoad}</td>
                  <td className="p-4 font-sans text-gray-900">{entry.mainEngineExhaustTemp}</td>
                  <td className="p-4 font-sans text-gray-900">{entry.mainEngineLubeOilPressure}</td>
                  <td className="p-4 font-sans text-gray-900">{entry.fuelOilConsumedME}</td>
                  <td className="p-4 font-sans text-gray-900">
                    <div className="flex gap-2">
                      {entry.chiefEngineerSignature ? (
                        <span className="text-green-600 font-sans text-xs">{t('logbooks.deckLog.signed')}</span>
                      ) : (
                        <>
                          <PermissionGate permission="logbooks.engine.update"><button
                            onClick={() => handleStartEdit(entry)}
                            className="text-amber-600 hover:underline font-sans text-sm font-semibold"
                          >
                            {t('common.edit') || 'Edit'}
                          </button></PermissionGate>
                          <PermissionGate permission="logbooks.engine.approve"><button
                            onClick={() => handleSign(entry.id)}
                            className="text-blue-600 hover:underline font-sans text-sm font-semibold"
                          >
                            {t('logbooks.deckLog.sign')}
                          </button></PermissionGate>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {/* Input Row */}
            <tr className="bg-white/5">
              <td className="p-2">
                <MaritimeInput 
                  type="datetime-local" 
                  name="logDateTime"
                  value={newEntry.logDateTime}
                  onChange={handleInputChange}
                  className="h-10 text-sm p-2 w-40" 
                />
              </td>
              <td className="p-2">
                <MaritimeInput 
                  type="number" 
                  name="mainEngineRPM"
                  value={newEntry.mainEngineRPM}
                  onChange={handleInputChange}
                  className="h-10 text-sm p-2 w-20" 
                  placeholder="RPM" 
                />
              </td>
              <td className="p-2">
                <MaritimeInput 
                  type="number" 
                  name="mainEngineLoad"
                  value={newEntry.mainEngineLoad}
                  onChange={handleInputChange}
                  className="h-10 text-sm p-2 w-20" 
                  placeholder="%" 
                />
              </td>
              <td className="p-2">
                <MaritimeInput 
                  type="number" 
                  name="mainEngineExhaustTemp"
                  value={newEntry.mainEngineExhaustTemp}
                  onChange={handleInputChange}
                  className="h-10 text-sm p-2 w-20" 
                  placeholder="°C" 
                />
              </td>
              <td className="p-2">
                <MaritimeInput 
                  type="number" 
                  name="mainEngineLubeOilPressure"
                  value={newEntry.mainEngineLubeOilPressure}
                  onChange={handleInputChange}
                  className="h-10 text-sm p-2 w-20" 
                  placeholder="Bar" 
                />
              </td>
              <td className="p-2">
                <MaritimeInput 
                  type="number" 
                  name="fuelOilConsumedME"
                  value={newEntry.fuelOilConsumedME}
                  onChange={handleInputChange}
                  className="h-10 text-sm p-2 w-20" 
                  placeholder="L/h" 
                />
              </td>
              <td className="p-2">
                <PermissionGate permission="logbooks.engine.create"><button
                  onClick={handleAdd}
                  className="bg-blue-600 text-white px-4 py-2.5 font-semibold rounded-lg hover:bg-blue-700"
                >
                  {t('common.add')}
                </button></PermissionGate>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </LogbookGrid>
  );
};




