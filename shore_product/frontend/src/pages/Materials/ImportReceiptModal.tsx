import { useState, useRef } from 'react';
import { X, Upload, FileSpreadsheet, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { receiptService, type ImportReceiptDto, type ImportReceiptItemDto, type ReceiptPreviewResponseDto } from '../../services/receiptService';
import { useTranslationSafe } from '@/contexts/I18nContext';

interface ImportReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ImportReceiptModal({ isOpen, onClose, onSuccess }: ImportReceiptModalProps) {
  const { t } = useTranslationSafe();
  const [step, setStep] = useState<'upload' | 'preview' | 'importing'>('upload');
  const [receiptDate, setReceiptDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [parsedItems, setParsedItems] = useState<ImportReceiptItemDto[]>([]);
  const [preview, setPreview] = useState<ReceiptPreviewResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    setStep('upload');
    setUploadedFile(null);
    setParsedItems([]);
    setPreview(null);
    setError(null);
    setNotes('');
    setCreatedBy('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploadedFile(file);

    try {
      const items = await parseExcelFile(file);
      setParsedItems(items);
      
      if (items.length === 0) {
        setError(t('materials.import.noValidItems'));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to parse Excel file');
      setParsedItems([]);
    }
  };

  const parseExcelFile = (file: File): Promise<ImportReceiptItemDto[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          if (!data) {
            reject(new Error('Failed to read file'));
            return;
          }

          // Parse Excel file
          const workbook = XLSX.read(data, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet);

          if (jsonData.length === 0) {
            reject(new Error('Excel file is empty'));
            return;
          }

          // Column name mapping (support both English and Vietnamese)
          const columnMappings: Record<string, string> = {
            // English names
            'ItemCode': 'itemCode',
            'itemcode': 'itemCode',
            'Item Code': 'itemCode',
            'ItemName': 'itemName',
            'itemname': 'itemName',
            'Item Name': 'itemName',
            'Category': 'categoryName',
            'category': 'categoryName',
            'Quantity': 'quantity',
            'quantity': 'quantity',
            'Qty': 'quantity',
            'Unit': 'unit',
            'unit': 'unit',
            'UnitCost': 'unitCost',
            'unitcost': 'unitCost',
            'Unit Cost': 'unitCost',
            'Cost': 'unitCost',
            'Price': 'unitCost',
            'PartNumber': 'partNumber',
            'partnumber': 'partNumber',
            'Part Number': 'partNumber',
            'Barcode': 'barcode',
            'barcode': 'barcode',
            'Manufacturer': 'manufacturer',
            'manufacturer': 'manufacturer',
            'Specification': 'specification',
            'specification': 'specification',
            'Spec': 'specification',
            'Location': 'location',
            'location': 'location',
            'Supplier': 'supplier',
            'supplier': 'supplier',
            'MinStock': 'minStock',
            'minstock': 'minStock',
            'Min Stock': 'minStock',
            'MaxStock': 'maxStock',
            'maxstock': 'maxStock',
            'Max Stock': 'maxStock',
            'ReorderLevel': 'reorderLevel',
            'reorderlevel': 'reorderLevel',
            'Reorder Level': 'reorderLevel',
            'ReorderQuantity': 'reorderQuantity',
            'reorderquantity': 'reorderQuantity',
            'Reorder Quantity': 'reorderQuantity',
            'BatchTracked': 'batchTracked',
            'batchtracked': 'batchTracked',
            'Batch Tracked': 'batchTracked',
            'SerialTracked': 'serialTracked',
            'serialtracked': 'serialTracked',
            'Serial Tracked': 'serialTracked',
            'ExpiryRequired': 'expiryRequired',
            'expiryrequired': 'expiryRequired',
            'Expiry Required': 'expiryRequired',
            // Vietnamese names
            'Mã vật tư': 'itemCode',
            'Tên vật tư': 'itemName',
            'Danh mục': 'categoryName',
            'Số lượng': 'quantity',
            'Đơn vị': 'unit',
            'Đơn giá': 'unitCost',
            'Mã linh kiện': 'partNumber',
            'Mã vạch': 'barcode',
            'Nhà sản xuất': 'manufacturer',
            'Thông số': 'specification',
            'Vị trí': 'location',
            'Nhà cung cấp': 'supplier',
          };

          // Map Excel data to ImportReceiptItemDto
          const items: ImportReceiptItemDto[] = jsonData.map((row, index) => {
            // Normalize row keys
            const normalizedRow: Record<string, any> = {};
            for (const key of Object.keys(row)) {
              const mappedKey = columnMappings[key] || columnMappings[key.trim()] || key.toLowerCase();
              normalizedRow[mappedKey] = row[key];
            }

            // Validate required fields
            const itemCode = normalizedRow.itemCode || normalizedRow.itemcode;
            const itemName = normalizedRow.itemName || normalizedRow.itemname;
            const quantity = Number(normalizedRow.quantity) || 0;
            const unit = normalizedRow.unit || 'pcs';

            if (!itemCode || !itemName) {
              console.warn(`Row ${index + 2}: Missing itemCode or itemName, skipping`);
              return null;
            }

            if (quantity <= 0) {
              console.warn(`Row ${index + 2}: Invalid quantity, skipping`);
              return null;
            }

            return {
              itemCode: String(itemCode).trim(),
              itemName: String(itemName).trim(),
              categoryName: normalizedRow.categoryName || normalizedRow.category || 'General',
              quantity,
              unit: String(unit).trim(),
              unitCost: Number(normalizedRow.unitCost) || 0,
              location: normalizedRow.location || undefined,
              supplier: normalizedRow.supplier || undefined,
              partNumber: normalizedRow.partNumber || undefined,
              barcode: normalizedRow.barcode || undefined,
              manufacturer: normalizedRow.manufacturer || undefined,
              specification: normalizedRow.specification || undefined,
              minStock: Number(normalizedRow.minStock) || undefined,
              maxStock: Number(normalizedRow.maxStock) || undefined,
              reorderLevel: Number(normalizedRow.reorderLevel) || Number(normalizedRow.reorderlevel) || undefined,
              reorderQuantity: Number(normalizedRow.reorderQuantity) || Number(normalizedRow.reorderquantity) || undefined,
              batchTracked: normalizedRow.batchTracked === 'TRUE' || normalizedRow.batchTracked === true || normalizedRow.batchtracked === 'TRUE',
              serialTracked: normalizedRow.serialTracked === 'TRUE' || normalizedRow.serialTracked === true || normalizedRow.serialtracked === 'TRUE',
              expiryRequired: normalizedRow.expiryRequired === 'TRUE' || normalizedRow.expiryRequired === true || normalizedRow.expiryrequired === 'TRUE',
            };
          }).filter((item) => item !== null) as ImportReceiptItemDto[];

          if (items.length === 0) {
            reject(new Error(t('materials.import.noValidItemsDetail')));
            return;
          }

          resolve(items);
        } catch (error: any) {
          console.error('Excel parse error:', error);
          reject(new Error('Failed to parse Excel file. Please check the format.'));
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsBinaryString(file);
    });
  };

  const handlePreview = async () => {
    try {
      setError(null);
      setLoading(true);

      if (parsedItems.length === 0) {
        setError('No items to import. Please select an Excel file.');
        setLoading(false);
        return;
      }

      const dto: ImportReceiptDto = {
        receiptDate,
        notes: notes || undefined,
        createdBy: createdBy || undefined,
        importSource: 'Excel',
        importFileName: uploadedFile?.name,
        items: parsedItems
      };

      const previewResult = await receiptService.previewImport(dto);
      setPreview(previewResult);
      setStep('preview');
    } catch (err: any) {
      setError(err.message || 'Failed to preview import');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!preview) return;

    try {
      setError(null);
      setStep('importing');

      const dto: ImportReceiptDto = {
        receiptDate,
        notes: notes || undefined,
        createdBy: createdBy || undefined,
        importSource: 'Excel',
        importFileName: uploadedFile?.name,
        items: parsedItems,
      };

      await receiptService.importReceipt(dto);
      onSuccess();
      handleClose();
    } catch (err: any) {
      setError(err.message || 'Failed to import receipt');
      setStep('preview');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-6 h-6 text-[#0b2545]" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">{t('materials.import.title')}</h2>
              <p className="text-sm text-gray-600">{t('materials.import.subtitle')}</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'upload' && (
            <div className="space-y-6">
              {/* Receipt Info */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('materials.import.receiptDate')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={receiptDate}
                    onChange={(e) => setReceiptDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('materials.import.createdBy')}
                  </label>
                  <input
                    type="text"
                    value={createdBy}
                    onChange={(e) => setCreatedBy(e.target.value)}
                    placeholder={t('materials.import.createdByPlaceholder')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('materials.import.notes')}
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t('materials.import.notesPlaceholder')}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#1b4c7e] focus:border-transparent"
                  />
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-[#eef2f7] border border-[#d6dee8] rounded-lg p-4">
                <h3 className="font-semibold text-primary mb-2">📋 {t('materials.import.instructions')}:</h3>
                <ol className="text-sm text-primary space-y-1 list-decimal list-inside">
                  <li>{t('materials.import.instruction1')}</li>
                  <li className="ml-6"><code className="bg-[#dce9f8] px-1 rounded">ItemCode, ItemName, Category, Quantity, Unit, UnitCost, Location</code></li>
                  <li className="ml-6">{t('materials.import.instruction2')}: <code className="bg-[#dce9f8] px-1 rounded">PartNumber, Barcode, Manufacturer, Specification, MinStock, MaxStock</code></li>
                  <li>{t('materials.import.instruction3')}</li>
                  <li>{t('materials.import.instruction4')}</li>
                </ol>
              </div>

              {/* File Upload Area */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {t('materials.import.uploadFile')} <span className="text-red-500">*</span>
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-[#1b4c7e] transition-colors">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="excel-file-input"
                  />
                  <label htmlFor="excel-file-input" className="cursor-pointer">
                    <FileSpreadsheet className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    {uploadedFile ? (
                      <div>
                        <p className="text-sm font-medium text-gray-900">{uploadedFile.name}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {parsedItems.length} {t('materials.import.itemsDetected')}
                        </p>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setUploadedFile(null);
                            setParsedItems([]);
                            if (fileInputRef.current) {
                              fileInputRef.current.value = '';
                            }
                          }}
                          className="mt-2 text-sm text-red-600 hover:text-red-800"
                        >
                          {t('materials.import.removeFile')}
                        </button>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm text-gray-600">
                          {t('materials.import.clickToSelect')}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {t('materials.import.supportedFormats')}
                        </p>
                      </div>
                    )}
                  </label>
                </div>
              </div>

              {/* Preview parsed items */}
              {parsedItems.length > 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-green-900">
                    ✓ {t('materials.import.parseSuccess', { count: parsedItems.length })}
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    {t('materials.import.clickPreview')}
                  </p>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-900">{t('common.error')}</p>
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'preview' && preview && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="grid grid-cols-5 gap-4">
                <div className="bg-[#eef2f7] rounded-lg p-4">
                  <p className="text-xs text-[#0b2545] font-medium">{t('materials.import.totalItems')}</p>
                  <p className="text-2xl font-bold text-primary">{preview.summary.totalItems}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-xs text-green-600 font-medium">{t('materials.import.newItems')}</p>
                  <p className="text-2xl font-bold text-green-900">{preview.summary.newItems}</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-4">
                  <p className="text-xs text-yellow-600 font-medium">{t('materials.import.updateItems')}</p>
                  <p className="text-2xl font-bold text-yellow-900">{preview.summary.existingItems}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <p className="text-xs text-red-600 font-medium">{t('materials.import.errorItems')}</p>
                  <p className="text-2xl font-bold text-red-900">{preview.summary.errorItems}</p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <p className="text-xs text-purple-600 font-medium">{t('materials.import.totalValue')}</p>
                  <p className="text-2xl font-bold text-purple-900">${preview.summary.totalAmount.toFixed(2)}</p>
                </div>
              </div>

              {/* Warnings & Errors */}
              {preview.warnings.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p className="font-semibold text-yellow-900 mb-2">⚠️ {t('materials.import.warnings')}:</p>
                  <ul className="text-sm text-yellow-800 space-y-1">
                    {preview.warnings.map((w, i) => <li key={i}>• {w}</li>)}
                  </ul>
                </div>
              )}

              {preview.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="font-semibold text-red-900 mb-2">❌ {t('materials.import.errors')}:</p>
                  <ul className="text-sm text-red-800 space-y-1">
                    {preview.errors.map((e, i) => <li key={i}>• {e}</li>)}
                  </ul>
                </div>
              )}

              {/* Items Preview Table */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-96">
                  <table className="w-full">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">STT</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Action</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Item Code</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Item Name</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Category</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Quantity</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Unit</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Unit Cost</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Stock Change</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {preview.items.map((item, idx) => (
                        <tr key={idx} className={`
                          ${item.action === 'ERROR' ? 'bg-red-50' : ''}
                          ${item.action === 'CREATE' ? 'bg-green-50' : ''}
                          ${item.action === 'UPDATE' ? 'bg-yellow-50' : ''}
                        `}>
                          <td className="px-3 py-2 text-sm">{item.lineNumber}</td>
                          <td className="px-3 py-2">
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                              item.action === 'CREATE' ? 'bg-green-100 text-green-700' :
                              item.action === 'UPDATE' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {item.action}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-sm font-mono">{item.itemCode}</td>
                          <td className="px-3 py-2 text-sm">{item.itemName}</td>
                          <td className="px-3 py-2 text-sm text-gray-600">{item.categoryName}</td>
                          <td className="px-3 py-2 text-sm text-right font-medium">{item.quantity}</td>
                          <td className="px-3 py-2 text-sm">{item.unit}</td>
                          <td className="px-3 py-2 text-sm text-right">{item.unitCost?.toFixed(2) || '-'}</td>
                          <td className="px-3 py-2 text-sm">
                            {item.action === 'UPDATE' && (
                              <span className="text-xs text-gray-600">
                                {item.currentStock?.toFixed(2)} → {item.newStock?.toFixed(2)}
                              </span>
                            )}
                            {item.action === 'CREATE' && (
                              <span className="text-xs text-green-600">New: {item.newStock?.toFixed(2)}</span>
                            )}
                            {item.errorMessage && (
                              <span className="text-xs text-red-600">{item.errorMessage}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 text-[#0b2545] animate-spin mb-4" />
              <p className="text-lg font-medium text-gray-900">{t('materials.import.importing')}</p>
              <p className="text-sm text-gray-600">{t('materials.import.pleaseWait')}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 bg-gray-50">
          <div className="text-sm text-gray-600">
            {step === 'upload' && t('materials.import.step1')}
            {step === 'preview' && t('materials.import.step2')}
            {step === 'importing' && t('materials.import.processing')}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              disabled={step === 'importing'}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            {step === 'upload' && (
              <button
                onClick={handlePreview}
                disabled={!uploadedFile || parsedItems.length === 0 || loading}
                className="px-4 py-2 bg-[#0b2545] text-white rounded-lg hover:bg-[#16375f] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('materials.import.processing')}
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Preview
                  </>
                )}
              </button>
            )}
            {step === 'preview' && (
              <>
                <button
                  onClick={() => setStep('upload')}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  ← {t('common.back')}
                </button>
                <button
                  onClick={handleImport}
                  disabled={!preview || preview.summary.errorItems > 0}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  {t('materials.import.confirmImport')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

