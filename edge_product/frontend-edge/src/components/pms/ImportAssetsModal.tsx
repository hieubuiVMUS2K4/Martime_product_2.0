import { PermissionGate } from '@/components/auth/PermissionGate'
import React, { useRef, useState } from 'react';
import { AlertCircle, CheckCircle, FileSpreadsheet, Upload, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { equipmentAssetService } from '@/services/equipment-asset.service';
import { useTranslationSafe } from '@/contexts/I18nContext';

type ImportAssetRow = {
  assetCode: string;
  assetName: string;
  category: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  location?: string;
  criticality?: string;
  equipmentGroupCode?: string;
  parentAssetCode?: string;
};

interface ImportAssetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const columns: Record<string, keyof ImportAssetRow> = {
  AssetCode: 'assetCode',
  AssetName: 'assetName',
  Category: 'category',
  Manufacturer: 'manufacturer',
  Model: 'model',
  SerialNumber: 'serialNumber',
  Location: 'location',
  Criticality: 'criticality',
  EquipmentGroupCode: 'equipmentGroupCode',
  ParentAssetCode: 'parentAssetCode',
};

function readAssetsFromWorkbook(workbook: XLSX.WorkBook): ImportAssetRow[] {
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  return rows
    .map(row => {
      const asset: Partial<ImportAssetRow> = {};
      Object.entries(columns).forEach(([excelColumn, field]) => {
        const value = String(row[excelColumn] ?? '').trim();
        if (value) asset[field] = value;
      });
      return asset as ImportAssetRow;
    })
    .filter(asset => asset.assetCode && asset.assetName && asset.category);
}

async function parseAssetFile(file: File): Promise<ImportAssetRow[]> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: 'array' });
  return readAssetsFromWorkbook(workbook);
}

export function ImportAssetsModal({ isOpen, onClose, onSuccess }: ImportAssetsModalProps) {
  const { t } = useTranslationSafe();
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [assets, setAssets] = useState<ImportAssetRow[]>([]);
  const [result, setResult] = useState<{ success: boolean; imported: number; errors?: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    try {
      setFile(selected);
      setResult(null);
      const parsed = await parseAssetFile(selected);
      setAssets(parsed);
      if (parsed.length === 0) toast.error(t('pms.assets.importModal.noValidAssets'));
    } catch (error) {
      console.error('Parse equipment asset file failed:', error);
      setAssets([]);
      toast.error(t('pms.assets.importModal.parseFailed'));
    }
  };

  const handleImport = async () => {
    if (assets.length === 0) {
      toast.error(t('pms.assets.importModal.selectValidFile'));
      return;
    }

    try {
      setLoading(true);
      const importResult = await equipmentAssetService.bulkImport(assets);
      setResult(importResult);
      if (importResult.success) {
        toast.success(t('pms.assets.importModal.importSuccess', { count: importResult.imported }));
        onSuccess();
      } else {
        toast.error(t('pms.assets.importModal.importWithErrors'));
      }
    } catch (error: any) {
      console.error('Import equipment assets failed:', error);
      toast.error(error.response?.data?.error || error.response?.data?.message || t('pms.assets.importModal.importFailed'));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setAssets([]);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-3xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">{t('pms.assets.importModal.title')}</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-6">
          <div className="rounded border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
            {t('pms.assets.importModal.instructions')}
          </div>

          <div className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileSelect}
              className="hidden"
            />

            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileSpreadsheet className="h-8 w-8 text-green-600" />
                <div className="text-left">
                  <p className="font-medium text-gray-900">{file.name}</p>
                  <p className="text-sm text-gray-600">{t('pms.assets.importModal.validAssetCount', { count: assets.length })}</p>
                </div>
                <button onClick={() => { setFile(null); setAssets([]); }} className="ml-4 text-red-600 hover:text-red-800">
                  <X className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <>
                <Upload className="mx-auto mb-4 h-10 w-10 text-gray-400" />
                <PermissionGate permission="pms.assets.import"><button onClick={() => fileInputRef.current?.click()} className="font-medium text-blue-600 hover:text-blue-800">
                  {t('pms.assets.importModal.chooseFile')}
                </button></PermissionGate>
                <p className="mt-2 text-sm text-gray-500">{t('pms.assets.importModal.supportedFormats')}</p>
              </>
            )}
          </div>

          {assets.length > 0 && !result && (
            <div className="max-h-44 overflow-auto rounded border border-gray-200">
              <table className="w-full text-left text-xs">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="px-3 py-2">{t('pms.assets.importModal.code')}</th>
                    <th className="px-3 py-2">{t('pms.assets.importModal.assetName')}</th>
                    <th className="px-3 py-2">{t('pms.assets.importModal.category')}</th>
                    <th className="px-3 py-2">{t('pms.assets.importModal.location')}</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map(asset => (
                    <tr key={asset.assetCode} className="border-t border-gray-100">
                      <td className="px-3 py-2 font-mono">{asset.assetCode}</td>
                      <td className="px-3 py-2">{asset.assetName}</td>
                      <td className="px-3 py-2">{asset.category}</td>
                      <td className="px-3 py-2">{asset.location || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {result && (
            <div className={`rounded border p-4 ${result.success ? 'border-green-200 bg-green-50' : 'border-yellow-200 bg-yellow-50'}`}>
              <div className="flex gap-3">
                {result.success ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertCircle className="h-5 w-5 text-yellow-600" />}
                <div className="text-sm">
                  <p className="font-semibold">{t('pms.assets.importModal.importedCount', { count: result.imported })}</p>
                  {result.errors?.map(error => <p key={error} className="mt-1 text-red-700">{error}</p>)}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button onClick={handleClose} disabled={loading} className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
            {result ? t('common.close') : t('common.cancel')}
          </button>
          {!result && (
            <PermissionGate permission="pms.assets.import"><button
              onClick={handleImport}
              disabled={loading || assets.length === 0}
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? t('pms.assets.importModal.importing') : t('pms.assets.importModal.importButton')}
            </button></PermissionGate>
          )}
        </div>
      </div>
    </div>
  );
}
