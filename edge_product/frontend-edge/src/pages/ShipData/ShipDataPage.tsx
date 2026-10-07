import { PermissionGate } from '@/components/auth/PermissionGate'
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Save, Loader2, Ship, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslationSafe } from '@/contexts/I18nContext';
import { shipDataService } from '@/services/ship-data.service';
import type { SaveShipData, ShipDataTabId } from '@/types/ship-data.types';
import { createEmptyShipData } from '@/types/ship-data.types';
import { BasicDataTab } from '@/components/ship-data/BasicDataTab';
import { DimensionsTab } from '@/components/ship-data/DimensionsTab';
import { MachineryTab } from '@/components/ship-data/MachineryTab';
import { ShipownerTab } from '@/components/ship-data/ShipownerTab';
import { ChartererTab } from '@/components/ship-data/ChartererTab';
import { ClassFlagStateTab } from '@/components/ship-data/ClassFlagStateTab';
import { InsuranceTab } from '@/components/ship-data/InsuranceTab';
import { RadioCommTab } from '@/components/ship-data/RadioCommTab';
import { TanksCargoTab } from '@/components/ship-data/TanksCargoTab';

const TABS_BASE: { id: ShipDataTabId; labelKey: string }[] = [
  { id: 'basic-data', labelKey: 'basicData' },
  { id: 'dimensions', labelKey: 'dimensions' },
  { id: 'machinery', labelKey: 'machinery' },
  { id: 'shipowner', labelKey: 'shipowner' },
  { id: 'charterer', labelKey: 'charterer' },
  { id: 'class-flag-state', labelKey: 'classFlagState' },
  { id: 'insurance', labelKey: 'insurance' },
  { id: 'radio-comm', labelKey: 'radioComm' },
  { id: 'tanks-cargo', labelKey: 'tanksCargo' },
];

export function ShipDataPage() {
  const { t } = useTranslationSafe();
  const TABS = useMemo(() => TABS_BASE.map(tab => ({ ...tab, label: t(`shipData.tabs.${tab.labelKey}`) })), [t]);
  const [data, setData] = useState<SaveShipData>(createEmptyShipData());
  const [activeTab, setActiveTab] = useState<ShipDataTabId>('basic-data');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // Load ship data on mount
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await shipDataService.get();
      if (response.exists && response.data) {
        // Map response data to SaveShipData (strip id, createdAt, updatedAt)
        const { id, createdAt, updatedAt, ...saveData } = response.data;
        setData(saveData as SaveShipData);
      } else {
        setData(createEmptyShipData());
      }
      setIsDirty(false);
    } catch (err: any) {
      setError('Failed to load ship data: ' + (err.message || 'Unknown error'));
      console.error('Error loading ship data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Generic field change handler
  const handleChange = useCallback((field: string, value: any) => {
    setData(prev => ({ ...prev, [field]: value }));
    setIsDirty(true);
  }, []);

  // Child collection item change
  const handleChildChange = useCallback(<T,>(collection: string, index: number, field: keyof T, value: any) => {
    setData(prev => {
      const items = [...(prev as any)[collection]];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, [collection]: items };
    });
    setIsDirty(true);
  }, []);

  // Add child item
  const handleChildAdd = useCallback((collection: string, defaultItem: any) => {
    setData(prev => ({
      ...prev,
      [collection]: [...(prev as any)[collection], defaultItem],
    }));
    setIsDirty(true);
  }, []);

  // Remove child item
  const handleChildRemove = useCallback((collection: string, index: number) => {
    setData(prev => {
      const items = [...(prev as any)[collection]];
      items.splice(index, 1);
      // Re-index sortOrder
      items.forEach((item: any, i: number) => { item.sortOrder = i; });
      return { ...prev, [collection]: items };
    });
    setIsDirty(true);
  }, []);

  // Save all data
  const handleSave = async () => {
    // Basic validation
    if (!data.imoNumber?.trim() || !data.shipName?.trim() || !data.flag?.trim() || !data.portOfRegistry?.trim()) {
      toast.error(t('shipData.requiredFields'));
      setActiveTab('basic-data');
      return;
    }

    try {
      setSaving(true);
      await shipDataService.save(data);
      toast.success(t('shipData.saveSuccess'));
      setIsDirty(false);
      // Reload to get server-generated data
      await loadData();
    } catch (err: any) {
      toast.error(t('shipData.saveFailed') + ': ' + (err.response?.data?.error || err.message || 'Unknown error'));
      console.error('Error saving ship data:', err);
    } finally {
      setSaving(false);
    }
  };

  // Render active tab content
  const renderTabContent = () => {
    const commonProps = { data, onChange: handleChange };
    const dynamicProps = { ...commonProps, onChildChange: handleChildChange, onChildAdd: handleChildAdd, onChildRemove: handleChildRemove };

    switch (activeTab) {
      case 'basic-data': return <BasicDataTab {...commonProps} />;
      case 'dimensions': return <DimensionsTab {...dynamicProps} />;
      case 'machinery': return <MachineryTab {...dynamicProps} />;
      case 'shipowner': return <ShipownerTab {...commonProps} />;
      case 'charterer': return <ChartererTab {...commonProps} />;
      case 'class-flag-state': return <ClassFlagStateTab {...commonProps} />;
      case 'insurance': return <InsuranceTab {...commonProps} />;
      case 'radio-comm': return <RadioCommTab {...commonProps} />;
      case 'tanks-cargo': return <TanksCargoTab {...commonProps} />;
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        <span className="ml-3 text-gray-500">{t('shipData.loading')}</span>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <Ship className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{t('shipData.title')}</h1>
            {data.shipName && (
              <p className="text-sm text-gray-500">{data.shipName} {data.imoNumber ? `(IMO: ${data.imoNumber})` : ''}</p>
            )}
          </div>
          {isDirty && (
            <span className="px-2 py-0.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full">
              {t('shipData.unsavedChanges')}
            </span>
          )}
        </div>
        <PermissionGate permission="ship-data.update"><button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? t('shipData.saving') : t('shipData.saveAll')}
        </button></PermissionGate>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-3 flex items-center gap-2 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Tab navigation */}
      <div className="border-b border-gray-200 bg-white px-6">
        <nav className="flex gap-0 overflow-x-auto -mb-px" aria-label="Tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
        {renderTabContent()}
      </div>
    </div>
  );
}

export default ShipDataPage;
