import React from 'react';
import { MaritimeInput } from '../common/MaritimeInput';
import { CoordinatePicker } from '../common/CoordinatePicker';
import { useTranslationSafe } from '@/contexts/I18nContext';

interface PartIIFormProps {
  form: any;
  onChange: (field: string, value: any) => void;
  onCategorySelect: (categoryCode: string) => void;
  categories: any[];
  onSubmit: () => void;
  onCancel: () => void;
}

export const GarbagePartIIForm: React.FC<PartIIFormProps> = ({
  form,
  onChange,
  onCategorySelect,
  categories,
  onSubmit,
  onCancel
}) => {
  const { locale, t } = useTranslationSafe();
  const isVi = locale === 'vi';

  const translatedCategories = categories.map(cat => {
    let name = cat.name;
    let description = cat.description;
    if (isVi) {
      if (cat.code === 'J') {
        name = 'Dư lượng hàng hóa (không HME)';
        description = 'Dư lượng hàng hóa không gây hại môi trường biển';
      } else if (cat.code === 'K') {
        name = 'Dư lượng hàng hóa (HME)';
        description = 'Dư lượng hàng hóa gây hại môi trường biển (Cấm xả biển)';
      }
    }
    return { ...cat, name, description };
  });

  const selectedCategory = translatedCategories.find(c => c.code === form.category);
  const isHME = form.category === 'K';

  return (
    <div className="bg-white border border-gray-200 rounded overflow-hidden mb-4">
      <h2 className="px-4 py-3 bg-blue-50 border-b border-blue-100 text-sm text-blue-800 font-semibold">
        {t('logbooks.garbageRecord.newPartII')}
      </h2>

      <div className="p-4">

      {/* Date & Time */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <MaritimeInput
          label={t('logbooks.garbageRecord.operationDate')}
          type="date"
          value={form.operationDate}
          onChange={e => onChange('operationDate', e.target.value)}
        />
        <MaritimeInput
          label={t('logbooks.garbageRecord.startTime')}
          type="time"
          value={form.operationTime}
          onChange={e => onChange('operationTime', e.target.value)}
        />
        <MaritimeInput
          label={t('logbooks.garbageRecord.stopTime')}
          type="time"
          value={form.operationEndTime}
          onChange={e => onChange('operationEndTime', e.target.value)}
        />
      </div>

      {/* Category Selection (J or K only) */}
      <div className="mb-6">
        <label className="text-blue-600 font-sans text-sm font-semibold block mb-2">
          {t('logbooks.garbageRecord.categoryLabel')}
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {translatedCategories.map(cat => (
            <button
              type="button"
              key={cat.code}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('=== Part II Category Button Clicked ===');
                console.log('Selected category:', cat.code);
                onCategorySelect(cat.code);
              }}
              className={`p-3 border rounded transition-colors text-left cursor-pointer relative ${
                form.category === cat.code
                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                  : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
              }`}
            >
              {form.category === cat.code && (
                <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-lg font-bold">
                  ✓
                </div>
              )}
              <div className="flex items-start justify-between">
                <div className="pr-10">
                  <div className={`font-bold font-sans text-2xl mb-1 ${
                    form.category === cat.code ? 'text-blue-700' : 'text-blue-600'
                  }`}>
                    {cat.code}
                  </div>
                  <div className={`font-sans font-semibold mb-2 ${
                    form.category === cat.code ? 'text-gray-900 font-bold' : 'text-gray-900'
                  }`}>
                    {cat.name}
                  </div>
                  <div className="text-gray-600 font-sans text-xs">
                    {cat.description}
                  </div>
                </div>
                {!cat.seaDischarge && (
                  <span className="text-red-600 text-xs font-sans border border-red-600 px-2 py-1 bg-red-50 font-bold">
                    {t('logbooks.garbageRecord.noSeaBadge')}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
        {selectedCategory && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded">
            <div className="flex items-center gap-2">
              <span className="text-green-600 text-2xl">✓</span>
              <div>
                <p className="text-green-700 font-sans font-bold">
                  {t('logbooks.garbageRecord.selectedCategory')} <span className="text-xl">{selectedCategory.code}</span> - {selectedCategory.name}
                </p>
                <p className="text-green-600 text-sm mt-1 font-sans">
                  {selectedCategory.description}
                </p>
              </div>
            </div>
          </div>
        )}
        {!selectedCategory && (
          <p className="text-orange-600 text-sm mt-3 font-sans font-semibold">
            ⚠ {t('logbooks.garbageRecord.selectCategoryJKPrompt')}
          </p>
        )}
        {isHME && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
            <p className="text-red-700 font-sans font-bold text-sm">
              ⚠ {t('logbooks.garbageRecord.marpolAnnexVWarning')}
            </p>
          </div>
        )}
      </div>

      {/* Start & End Positions - MANDATORY */}
      <div className="mb-6 p-4 border border-gray-200 bg-gray-50/50 rounded">
        <h3 className="text-sm text-gray-700 font-semibold mb-4">
          {t('logbooks.garbageRecord.positionAtStartEnd')}
        </h3>
        <div className="grid grid-cols-1 gap-6">
          {/* Start Position */}
          <div>
            <h4 className="text-xs text-gray-600 font-semibold mb-3">{t('logbooks.garbageRecord.startPosition')}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CoordinatePicker
                label={`${t('voyageLog.form.latitude')} (${t('logbooks.garbageRecord.start')})`}
                type="latitude"
                value={form.startLatitude}
                onChange={lat => onChange('startLatitude', lat)}
              />
              <CoordinatePicker
                label={`${t('voyageLog.form.longitude')} (${t('logbooks.garbageRecord.start')})`}
                type="longitude"
                value={form.startLongitude}
                onChange={lon => onChange('startLongitude', lon)}
              />
            </div>
          </div>

          {/* End Position */}
          <div>
            <h4 className="text-xs text-gray-600 font-semibold mb-3">{t('logbooks.garbageRecord.endPosition')}</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <CoordinatePicker
                label={`${t('voyageLog.form.latitude')} (${t('logbooks.garbageRecord.end')})`}
                type="latitude"
                value={form.endLatitude}
                onChange={lat => onChange('endLatitude', lat)}
              />
              <CoordinatePicker
                label={`${t('voyageLog.form.longitude')} (${t('logbooks.garbageRecord.end')})`}
                type="longitude"
                value={form.endLongitude}
                onChange={lon => onChange('endLongitude', lon)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2-Column Amounts (Sea / Reception) */}
      <div className="mb-6 p-4 border border-gray-200 bg-gray-50/50 rounded">
        <h3 className="text-sm text-gray-700 font-semibold mb-4">{t('logbooks.garbageRecord.estimatedAmount')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <MaritimeInput
              label={t('logbooks.garbageRecord.intoSea')}
              type="number"
              step="0.001"
              value={form.amountToSea}
              onChange={e => onChange('amountToSea', e.target.value)}
              placeholder="0.000"
              disabled={isHME}
            />
            {isHME && (
              <p className="text-red-600 text-xs mt-1 font-bold">
                {t('logbooks.garbageRecord.categoryKNoSea')}
              </p>
            )}
          </div>
          <div>
            <MaritimeInput
              label={t('logbooks.garbageRecord.toReception')}
              type="number"
              step="0.001"
              value={form.amountToReception}
              onChange={e => onChange('amountToReception', e.target.value)}
              placeholder="0.000"
            />
            {isHME && (
              <p className="text-green-600 text-xs mt-1 font-bold">
                {t('logbooks.garbageRecord.categoryKRequired')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Conditional: Reception Facility Details */}
      {parseFloat(form.amountToReception) > 0 && (
        <div className="mb-6 p-4 border border-green-200 bg-green-50 rounded">
          <h3 className="text-green-700 font-sans font-bold mb-3">{t('logbooks.garbageRecord.receptionDetails')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MaritimeInput
              label={t('logbooks.garbageRecord.portName')}
              value={form.portName}
              onChange={e => onChange('portName', e.target.value)}
              placeholder="e.g., Port of Singapore"
            />
            <MaritimeInput
              label={t('logbooks.garbageRecord.receptionFacilityName')}
              value={form.receptionFacilityName}
              onChange={e => onChange('receptionFacilityName', e.target.value)}
              placeholder="Facility name"
            />
            <MaritimeInput
              label={t('logbooks.garbageRecord.receiptNumber')}
              value={form.receiptNumber}
              onChange={e => onChange('receiptNumber', e.target.value)}
              placeholder="Receipt #"
            />
          </div>
        </div>
      )}

      {/* Cargo Details - MANDATORY for Part II */}
      <div className="mb-6 p-4 border border-gray-200 bg-gray-50/50 rounded">
        <h3 className="text-sm text-gray-700 font-semibold mb-4">{t('logbooks.garbageRecord.cargoDetails')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MaritimeInput
            label={t('logbooks.garbageRecord.cargoDescription')}
            value={form.cargoDescription}
            onChange={e => onChange('cargoDescription', e.target.value)}
            placeholder="e.g., Wheat, Coal, Iron Ore"
          />
          <MaritimeInput
            label={t('logbooks.garbageRecord.holdNumbersWashed')}
            value={form.holdNumbersWashed}
            onChange={e => onChange('holdNumbersWashed', e.target.value)}
            placeholder="e.g., Hold 1, 2, 3 or All Holds"
          />
        </div>
      </div>

      {/* Officer & Remarks */}
      <div className="mb-4">
        <MaritimeInput
          label={t('logbooks.garbageRecord.officerInCharge')}
          value={form.officerInCharge}
          onChange={e => onChange('officerInCharge', e.target.value)}
        />
      </div>

      <div className="mb-6">
        <label className="text-xs text-gray-600 font-medium block mb-1.5">
          {t('logbooks.garbageRecord.remarks')}
        </label>
        <textarea
          value={form.remarks}
          onChange={e => onChange('remarks', e.target.value)}
          className="w-full bg-white border border-gray-300 rounded text-sm text-gray-900 px-3 py-2 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none h-20 resize-none"
          placeholder="Additional notes..."
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 border border-gray-300 text-gray-600 text-xs font-medium rounded hover:bg-gray-50"
        >
          {t('common.cancel')}
        </button>
        <button
          type="button"
          onClick={onSubmit}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700"
        >
          {t('logbooks.garbageRecord.saveEntry')}
        </button>
      </div>
      </div>
    </div>
  );
};
