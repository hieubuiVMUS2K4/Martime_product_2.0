import { PermissionGate } from '@/components/auth/PermissionGate'
import React, { useState, useEffect } from 'react';
import { LogbookGrid } from '../../components/common/LogbookGrid';
import { MaritimeInput } from '../../components/common/MaritimeInput';
import { logbookService } from '../../services/logbook.service';
import { DeckLogEntryResponseDto, CreateDeckLogEntryDto } from '../../types/logbook.types';
import { toast } from 'sonner';
import { useTranslationSafe } from '@/contexts/I18nContext';

export const DeckLogPage: React.FC = () => {
  const { t } = useTranslationSafe();
  const [entries, setEntries] = useState<DeckLogEntryResponseDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateDeckLogEntryDto>({
    logDateTime: new Date().toISOString().slice(0, 16),
    watchPeriod: '00-04',
    officerOnWatch: '',
    entryType: 'ROUTINE',
    description: '',
    latitude: 0,
    longitude: 0,
    courseOverGround: 0,
    speedOverGround: 0,
    remarks: ''
  });

  const resetForm = () => {
    setFormData({
      logDateTime: new Date().toISOString().slice(0, 16),
      watchPeriod: '00-04',
      officerOnWatch: '',
      entryType: 'ROUTINE',
      description: '',
      latitude: 0,
      longitude: 0,
      courseOverGround: 0,
      speedOverGround: 0,
      remarks: ''
    });
    setEditingId(null);
  };

  const handleStartEdit = (entry: DeckLogEntryResponseDto) => {
    setEditingId(entry.id);
    setFormData({
      logDateTime: entry.logDateTime ? new Date(entry.logDateTime).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16),
      watchPeriod: entry.watchPeriod || '00-04',
      officerOnWatch: entry.officerOnWatch || '',
      entryType: entry.entryType || 'ROUTINE',
      description: entry.description || '',
      latitude: entry.latitude ?? 0,
      longitude: entry.longitude ?? 0,
      courseOverGround: entry.courseOverGround ?? 0,
      speedOverGround: entry.speedOverGround ?? 0,
      remarks: entry.remarks || ''
    });
    // Scroll to form if needed
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const response = await logbookService.getDeckEntries({ page: 1, pageSize: 20 });
      setEntries(response.data);
    } catch (error) {
      console.error(error);
      toast.error(t('logbooks.deckLog.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ 
      ...prev, 
      [name]: ['latitude', 'longitude', 'courseOverGround', 'speedOverGround'].includes(name) ? Number(value) : value 
    }));
  };

  const handleSubmit = async () => {
    try {
      const payload = {
        ...formData,
        logDateTime: new Date(formData.logDateTime).toISOString()
      };
      if (editingId) {
        await logbookService.updateDeckEntry(editingId, payload);
        toast.success(t('logbooks.deckLog.entryUpdated') || 'Entry updated successfully');
      } else {
        await logbookService.createDeckEntry(payload);
        toast.success(t('logbooks.deckLog.entryAdded'));
      }
      fetchEntries();
      resetForm();
    } catch (error) {
      console.error(error);
      toast.error(editingId ? 'Failed to update entry' : t('logbooks.deckLog.createFailed'));
    }
  };

  const handleSign = async (id: string, signature: string) => {
    try {
      await logbookService.signDeckEntry(id, {
        signature,
        signedAt: new Date().toISOString()
      });
      toast.success(t('logbooks.common.signSuccess'));
      fetchEntries();
    } catch (error) {
      console.error(error);
      toast.error(t('logbooks.common.signFailed'));
    }
  };

  return (
    <LogbookGrid title={t('logbooks.deckLog.title')}>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Form */}
        <div className="lg:col-span-1 bg-white dark:bg-gray-800 p-6 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
            {editingId ? (t('logbooks.deckLog.editEntry') || 'Edit Entry') : t('logbooks.deckLog.newEntry')}
          </h2>
          <div className="flex flex-col gap-4">
            <MaritimeInput 
              label={t('logbooks.deckLog.dateTimeUtc')} 
              type="datetime-local" 
              name="logDateTime"
              value={formData.logDateTime}
              onChange={handleInputChange}
            />
            <div className="grid grid-cols-2 gap-4">
              <MaritimeInput 
                label={t('logbooks.deckLog.watchPeriod')} 
                placeholder="00-04"
                name="watchPeriod"
                value={formData.watchPeriod}
                onChange={handleInputChange}
              />
              <MaritimeInput 
                label={t('logbooks.deckLog.officerOnWatch')} 
                placeholder="Officer Name"
                name="officerOnWatch"
                value={formData.officerOnWatch}
                onChange={handleInputChange}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <MaritimeInput 
                label={t('logbooks.deckLog.latitude')} 
                type="number"
                placeholder="0.0000"
                name="latitude"
                value={formData.latitude}
                onChange={handleInputChange}
              />
              <MaritimeInput 
                label={t('logbooks.deckLog.longitude')} 
                type="number"
                placeholder="0.0000"
                name="longitude"
                value={formData.longitude}
                onChange={handleInputChange}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <MaritimeInput 
                label={t('logbooks.deckLog.courseOverGround')} 
                type="number" 
                placeholder="090"
                name="courseOverGround"
                value={formData.courseOverGround}
                onChange={handleInputChange}
              />
              <MaritimeInput 
                label={t('logbooks.deckLog.speedOverGround')} 
                type="number" 
                placeholder="12.5"
                name="speedOverGround"
                value={formData.speedOverGround}
                onChange={handleInputChange}
              />
            </div>
            <MaritimeInput 
              label={t('logbooks.deckLog.description')} 
              placeholder="Noon position report..."
              name="description"
              value={formData.description}
              onChange={handleInputChange}
            />
            <div className="flex gap-2 w-full">
              {editingId && (
                <button
                  onClick={resetForm}
                  className="flex-1 bg-gray-500 text-white font-semibold py-2 px-4 rounded-lg hover:bg-gray-600 transition-colors"
                >
                  {t('common.cancel') || 'Cancel'}
                </button>
              )}
              <PermissionGate permission={editingId ? 'logbooks.deck.update' : 'logbooks.deck.create'}><button
                onClick={handleSubmit}
                className="flex-1 bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editingId ? (t('logbooks.deckLog.updateEntry') || 'Update Entry') : t('logbooks.deckLog.addEntry')}
              </button></PermissionGate>
            </div>
          </div>
        </div>

        {/* Log Entries Timeline */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {loading && <div className="text-gray-600 dark:text-gray-400 text-center">{t('logbooks.common.loading')}</div>}
          {!loading && entries.length === 0 && (
            <div className="text-gray-500 dark:text-gray-400 text-center py-10">{t('logbooks.deckLog.noEntries')}</div>
          )}
          {entries.map(entry => (
            <div key={entry.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex flex-col gap-2 relative shadow-sm">
              <div className="flex justify-between items-start">
                <span className="text-blue-600 dark:text-blue-400 font-semibold text-lg">{new Date(entry.logDateTime).toLocaleString()}</span>
                {entry.masterSignature ? (
                  <span className="bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 text-xs px-2 py-1 rounded font-semibold">{t('logbooks.deckLog.signed')}</span>
                ) : (
                  <span className="bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 text-xs px-2 py-1 rounded font-semibold">{t('voyageLog.draft')}</span>
                )}
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm text-gray-600 dark:text-gray-400 mt-2">
                <div>POS: <span className="text-gray-900 dark:text-white font-medium">{entry.latitude?.toFixed(4)}, {entry.longitude?.toFixed(4)}</span></div>
                <div>COG: <span className="text-gray-900 dark:text-white font-medium">{entry.courseOverGround}°</span></div>
                <div>SOG: <span className="text-gray-900 dark:text-white font-medium">{entry.speedOverGround} kts</span></div>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400">
                OOW: <span className="text-gray-900 dark:text-white font-medium">{entry.officerOnWatch}</span> | {t('logbooks.deckLog.watchPeriod')}: <span className="text-gray-900 dark:text-white font-medium">{entry.watchPeriod}</span>
              </div>
              <p className="text-gray-900 dark:text-white mt-2 border-t border-gray-200 dark:border-gray-700 pt-2">{entry.description}</p>
              
              {!entry.masterSignature && (
                <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4 flex flex-col gap-3 max-w-md">
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block mb-1">
                        {t('logbooks.deckLog.sign')}
                      </label>
                      <input
                        type="text"
                        placeholder="Enter master's name"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        id={`sig-input-${entry.id}`}
                      />
                    </div>
                    <PermissionGate permission="logbooks.deck.approve"><button
                      onClick={() => {
                        const input = document.getElementById(`sig-input-${entry.id}`) as HTMLInputElement;
                        const sigVal = input?.value || '';
                        if (!sigVal.trim()) {
                          toast.error("Master signature is required");
                          return;
                        }
                        handleSign(entry.id, sigVal.trim());
                      }}
                      className="bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Sign
                    </button></PermissionGate>
                  </div>
                  <div>
                    <PermissionGate permission="logbooks.deck.update"><button
                      onClick={() => handleStartEdit(entry)}
                      className="text-amber-600 dark:text-amber-400 hover:underline text-sm font-semibold flex items-center gap-1"
                    >
                      ✏️ {t('common.edit') || 'Edit Entry'}
                    </button></PermissionGate>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </LogbookGrid>
  );
};
