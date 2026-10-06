import React, { useState, useRef } from 'react';
import { X, Upload, FileSpreadsheet, AlertCircle, CheckCircle } from 'lucide-react';
import { equipmentAssetService } from '@/services/equipment-asset.service';
import { toast } from 'sonner';

interface ImportAssetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ImportAssetsModal({ isOpen, onClose, onSuccess }: ImportAssetsModalProps) {
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    imported: number;
    errors?: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      if (selectedFile.name.endsWith('.csv') || selectedFile.name.endsWith('.xlsx')) {
        setFile(selectedFile);
        setImportResult(null);
      } else {
        toast.error('Please select a CSV or Excel file');
      }
    }
  };

  const parseCSV = (text: string): any[] => {
    const lines = text.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim());
    const assets = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const asset: any = {};
      
      headers.forEach((header, index) => {
        const value = values[index];
        if (value) {
          // Map CSV headers to DTO properties
          if (header === 'AssetCode') asset.assetCode = value;
          else if (header === 'AssetName') asset.assetName = value;
          else if (header === 'Category') asset.category = value;
          else if (header === 'Manufacturer') asset.manufacturer = value;
          else if (header === 'Model') asset.model = value;
          else if (header === 'SerialNumber') asset.serialNumber = value;
          else if (header === 'Location') asset.location = value;
          else if (header === 'Criticality') asset.criticality = value;
          else if (header === 'EquipmentGroupCode') asset.equipmentGroupCode = value;
        }
      });

      if (asset.assetCode && asset.assetName && asset.category) {
        assets.push(asset);
      }
    }

    return assets;
  };

  const handleImport = async () => {
    if (!file) {
      toast.error('Please select a file');
      return;
    }

    try {
      setLoading(true);
      const text = await file.text();
      const assets = parseCSV(text);

      if (assets.length === 0) {
        toast.error('No valid assets found in file');
        return;
      }

      const result = await equipmentAssetService.bulkImport(assets);
      setImportResult(result);

      if (result.success) {
        toast.success(`Successfully imported ${result.imported} assets`);
        onSuccess();
      } else {
        toast.error('Import completed with errors');
      }
    } catch (error: any) {
      console.error('Error importing assets:', error);
      toast.error(error.response?.data?.message || 'Failed to import assets');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full">
        <div className="border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Import Equipment Assets</h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Instructions */}
          <div className="bg-[#eef2f7] border border-[#d6dee8] rounded-lg p-4">
            <h3 className="text-sm font-semibold text-primary mb-2">Import Instructions</h3>
            <ul className="text-sm text-primary space-y-1 list-disc list-inside">
              <li>Download the CSV template first</li>
              <li>Fill in asset information (AssetCode, AssetName, Category are required)</li>
              <li>Optional: Add EquipmentGroupCode to assign assets to groups</li>
              <li>Save as CSV format</li>
              <li>Upload the file below</li>
            </ul>
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select CSV File
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              {file ? (
                <div className="flex items-center justify-center gap-3">
                  <FileSpreadsheet className="w-8 h-8 text-green-600" />
                  <div className="text-left">
                    <p className="font-medium text-gray-900">{file.name}</p>
                    <p className="text-sm text-gray-600">{(file.size / 1024).toFixed(2)} KB</p>
                  </div>
                  <button
                    onClick={() => setFile(null)}
                    className="ml-4 text-red-600 hover:text-red-800"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ) : (
                <div>
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="text-[#0b2545] hover:text-primary font-medium"
                  >
                    Click to select file
                  </button>
                  <p className="text-sm text-gray-600 mt-2">or drag and drop</p>
                </div>
              )}
            </div>
          </div>

          {/* Import Result */}
          {importResult && (
            <div className={`border rounded-lg p-4 ${
              importResult.success ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
            }`}>
              <div className="flex items-start gap-3">
                {importResult.success ? (
                  <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                )}
                <div className="flex-1">
                  <h3 className={`font-semibold mb-2 ${
                    importResult.success ? 'text-green-900' : 'text-yellow-900'
                  }`}>
                    Import {importResult.success ? 'Successful' : 'Completed with Errors'}
                  </h3>
                  <p className="text-sm mb-2">
                    Successfully imported: <strong>{importResult.imported}</strong> assets
                  </p>
                  {importResult.errors && importResult.errors.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-medium mb-1">Errors:</p>
                      <ul className="text-sm space-y-1 list-disc list-inside">
                        {importResult.errors.map((error, idx) => (
                          <li key={idx} className="text-red-700">{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={handleClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              disabled={loading}
            >
              {importResult ? 'Close' : 'Cancel'}
            </button>
            {!importResult && (
              <button
                onClick={handleImport}
                className="px-4 py-2 bg-[#0b2545] text-white rounded-lg hover:bg-[#16375f] disabled:opacity-50"
                disabled={loading || !file}
              >
                {loading ? 'Importing...' : 'Import Assets'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

