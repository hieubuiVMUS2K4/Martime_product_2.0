import React from 'react';
import { MaritimeInput } from '../common/MaritimeInput';
import { CoordinatePicker } from '../common/CoordinatePicker';
import { useTranslationSafe } from '@/contexts/I18nContext';

interface PartIFormProps {
  form: any;
  onChange: (field: string, value: any) => void;
  onCategorySelect: (categoryCode: string, categoryName: string) => void;
  categories: any[];
  onSubmit: () => void;
  onCancel: () => void;
}

export const GarbagePartIForm: React.FC<PartIFormProps> = ({
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
      if (cat.code === 'A') { name = 'Chất dẻo (Nhựa)'; description = 'Tất cả các loại chất dẻo/nhựa'; }
      else if (cat.code === 'B') { name = 'Chất thải thực phẩm'; description = 'Chất thải từ chế biến thực phẩm'; }
      else if (cat.code === 'C') { name = 'Chất thải sinh hoạt'; description = 'Giấy, giẻ lau, thủy tinh, kim loại, chai lọ, đồ sành sứ'; }
      else if (cat.code === 'D') { name = 'Dầu ăn'; description = 'Dầu ăn có thể ăn được'; }
      else if (cat.code === 'E') { name = 'Tro lò đốt'; description = 'Tro từ lò thiêu chất thải'; }
      else if (cat.code === 'F') { name = 'Chất thải khai thác'; description = 'Vật liệu bảo dưỡng/vệ sinh'; }
      else if (cat.code === 'G') { name = 'Xác động vật'; description = 'Xác động vật được vận chuyển như hàng hóa'; }
      else if (cat.code === 'H') { name = 'Ngư cụ'; description = 'Ngư cụ, dây câu và vật liệu tổng hợp liên quan'; }
      else if (cat.code === 'I') { name = 'Rác thải điện tử'; description = 'Thiết bị điện, điện tử và các bộ phận bị thải bỏ'; }
    }
    return { ...cat, name, description };
  });

  const selectedCategory = translatedCategories.find(c => c.code === form.category);
  const seaAmountDisabled = selectedCategory && !selectedCategory.seaDischarge;

  return (
    <div className="bg-white border border-gray-200 rounded overflow-hidden mb-4">
      <h2 className="px-4 py-3 bg-blue-50 border-b border-blue-100 text-sm text-blue-800 font-semibold">
        {t('logbooks.garbageRecord.newPartI')}
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

      {/* Category Selection */}
      <div className="mb-6">
        <label className="text-blue-600 font-sans text-sm font-semibold block mb-2">
          {t('logbooks.garbageRecord.categoryLabel')}
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {translatedCategories.map(cat => (
            <button
              type="button"
              key={cat.code}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('=== Category Button Clicked ===');
                console.log('Selected category:', cat.code, cat.name);
                onCategorySelect(cat.code, cat.name);
              }}
              className={`p-3 border rounded transition-colors text-left cursor-pointer relative ${
                form.category === cat.code
                  ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500'
                  : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50/50'
              }`}
            >
              {form.category === cat.code && (
                <div className="absolute top-1 right-1 bg-blue-600 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                  ✓
                </div>
              )}
              <div className="flex items-start justify-between">
                <div>
                  <div className={`font-bold font-sans text-xl ${
                    form.category === cat.code ? 'text-blue-700' : 'text-blue-600'
                  }`}>
                    {cat.code}
                  </div>
                  <div className={`font-sans text-sm mt-1 ${
                    form.category === cat.code ? 'text-gray-900 font-semibold' : 'text-gray-900'
                  }`}>
                    {cat.name}
                  </div>
                </div>
                {!cat.seaDischarge && (
                  <span className="text-red-600 text-xs font-sans border border-red-600 px-1 py-0.5">
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
              <span className="text-green-600 text-xl">✓</span>
              <div>
                <p className="text-green-700 font-sans font-bold text-sm">
                  {t('logbooks.garbageRecord.selectedCategory')} <span className="text-lg">{selectedCategory.code}</span> - {selectedCategory.name}
                </p>
                <p className="text-green-600 text-xs mt-1 font-sans">
                  {selectedCategory.description}
                </p>
              </div>
            </div>
          </div>
        )}
        {!selectedCategory && (
          <p className="text-orange-600 text-sm mt-3 font-sans font-semibold">
            ⚠ {t('logbooks.garbageRecord.selectCategory')}
          </p>
        )}
      </div>

      {/* 3-Column Amounts */}
      <div className="mb-6 p-4 border border-gray-200 bg-gray-50/50 rounded">
        <h3 className="text-sm text-gray-700 font-semibold mb-4">{t('logbooks.garbageRecord.estimatedAmount')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <MaritimeInput
              label={t('logbooks.garbageRecord.intoSea')}
              type="number"
              step="0.001"
              value={form.amountToSea}
              onChange={e => onChange('amountToSea', e.target.value)}
              placeholder="0.000"
              disabled={seaAmountDisabled}
            />
            {seaAmountDisabled && (
              <p className="text-red-600 text-xs mt-1">{t('logbooks.garbageRecord.prohibitedByMarpol')}</p>
            )}
          </div>
          <MaritimeInput
            label={t('logbooks.garbageRecord.toReception')}
            type="number"
            step="0.001"
            value={form.amountToReception}
            onChange={e => onChange('amountToReception', e.target.value)}
            placeholder="0.000"
          />
          <MaritimeInput
            label={t('logbooks.garbageRecord.incinerated')}
            type="number"
            step="0.001"
            value={form.amountIncinerated}
            onChange={e => onChange('amountIncinerated', e.target.value)}
            placeholder="0.000"
          />
        </div>
      </div>

      {/* Conditional: Position for Sea Discharge */}
      {parseFloat(form.amountToSea) > 0 && (
        <div className="mb-6 p-4 border border-amber-200 bg-amber-50 rounded">
          <h3 className="text-yellow-700 font-sans font-bold mb-3 flex items-center gap-2">
            <span>⚠</span>
            {t('logbooks.garbageRecord.positionRequiredSea')}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CoordinatePicker
              label={t('voyageLog.form.latitude')}
              type="latitude"
              value={form.latitude}
              onChange={lat => onChange('latitude', lat)}
            />
            <CoordinatePicker
              label={t('voyageLog.form.longitude')}
              type="longitude"
              value={form.longitude}
              onChange={lon => onChange('longitude', lon)}
            />
          </div>
        </div>
      )}

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

      {/* Conditional: Incineration Details */}
      {parseFloat(form.amountIncinerated) > 0 && (
        <div className="mb-6 p-4 border border-orange-200 bg-orange-50 rounded">
          <h3 className="text-orange-700 font-sans font-bold mb-3">{t('logbooks.garbageRecord.incinerationDetails')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MaritimeInput
              label={t('logbooks.garbageRecord.startTime')}
              type="time"
              value={form.incinerationStartTime}
              onChange={e => onChange('incinerationStartTime', e.target.value)}
            />
            <MaritimeInput
              label={t('logbooks.garbageRecord.stopTime')}
              type="time"
              value={form.incinerationEndTime}
              onChange={e => onChange('incinerationEndTime', e.target.value)}
            />
            <MaritimeInput
              label={t('logbooks.garbageRecord.incineratorDetails')}
              value={form.incineratorDetails}
              onChange={e => onChange('incineratorDetails', e.target.value)}
              placeholder="Brand/Model"
            />
          </div>
        </div>
      )}

      {/* Officer */}
      <div className="mb-4">
        <MaritimeInput
          label={t('logbooks.garbageRecord.officerInCharge')}
          value={form.officerInCharge}
          onChange={e => onChange('officerInCharge', e.target.value)}
        />
      </div>

      {/* Exceptional Discharge Section */}
      <div className="mb-4 p-4 border border-gray-200 bg-gray-50/50 rounded">
        <h3 className="text-orange-700 font-sans font-semibold mb-3">{t('logbooks.garbageRecord.exceptionalDischarge')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MaritimeInput
            label={t('logbooks.garbageRecord.exceptionalReason')}
            value={form.exceptionalDischargeReason}
            onChange={e => onChange('exceptionalDischargeReason', e.target.value)}
            placeholder="Leave blank if normal operation"
          />
          <MaritimeInput
            label={t('logbooks.garbageRecord.waterDepth')}
            type="number"
            step="0.1"
            value={form.waterDepth}
            onChange={e => onChange('waterDepth', e.target.value)}
            placeholder="Required for exceptional discharge"
          />
        </div>
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
