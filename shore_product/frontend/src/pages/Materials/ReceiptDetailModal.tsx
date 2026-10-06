import { useEffect, useState } from 'react';
import { X, Package, Calendar, DollarSign, FileText, Clock } from 'lucide-react';
import { receiptService } from '../../services/receiptService';
import type { MaterialReceiptResponseDto } from '../../services/receiptService';
import { useTranslationSafe } from '@/contexts/I18nContext';

interface ReceiptDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  receiptId: number;
}

export function ReceiptDetailModal({ isOpen, onClose, receiptId }: ReceiptDetailModalProps) {
  const { t } = useTranslationSafe();
  const [receipt, setReceipt] = useState<MaterialReceiptResponseDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && receiptId) {
      loadReceiptDetail();
    }
  }, [isOpen, receiptId]);

  const loadReceiptDetail = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await receiptService.getReceiptById(receiptId);
      setReceipt(data);
    } catch (err: any) {
      setError(err.message || t('materials.receipt.loadFailed'));
      console.error('Error loading receipt:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" 
          onClick={onClose}
        />

        {/* Modal panel */}
        <div className="inline-block w-full max-w-5xl my-8 overflow-hidden text-left align-middle transition-all transform bg-white rounded-lg shadow-xl">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-blue-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-[#0b2545] rounded-lg">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900">{t('materials.receipt.details')}</h3>
                {receipt && (
                  <p className="text-sm text-gray-600 mt-0.5">
                    {receipt.receiptCode} - {new Date(receipt.receiptDate).toLocaleDateString('vi-VN')}
                  </p>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4 max-h-[calc(100vh-200px)] overflow-y-auto">
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto"></div>
                <p className="text-gray-600 mt-4">{t('materials.receipt.loading')}</p>
              </div>
            ) : error ? (
              <div className="text-center py-12">
                <div className="text-red-600 mb-4">
                  <X className="w-12 h-12 mx-auto" />
                </div>
                <p className="text-red-600 font-medium">{error}</p>
                <button
                  onClick={loadReceiptDetail}
                  className="mt-4 px-4 py-2 bg-[#0b2545] text-white rounded-lg hover:bg-[#16375f]"
                >
                  {t('materials.receipt.retry')}
                </button>
              </div>
            ) : receipt ? (
              <div className="space-y-6">
                {/* Receipt Info Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <InfoCard
                    icon={<Calendar className="w-5 h-5 text-[#0b2545]" />}
                    label="Receipt Date"
                    value={new Date(receipt.receiptDate).toLocaleDateString('vi-VN')}
                  />
                  <InfoCard
                    icon={<DollarSign className="w-5 h-5 text-green-600" />}
                    label="Total Amount"
                    value={`${receipt.totalAmount ? receipt.totalAmount.toLocaleString('vi-VN') : '0'} ${receipt.currency}`}
                  />
                  <InfoCard
                    icon={<Package className="w-5 h-5 text-purple-600" />}
                    label="Total Items"
                    value={`${receipt.itemCount} items`}
                  />
                </div>

                {/* Status and Metadata */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4" />
                      {t('materials.receipt.receiptInfo')}
                    </h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">{t('materials.receipt.status')}:</span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          receipt.status === 'Completed' ? 'bg-green-100 text-green-700' :
                          receipt.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {receipt.status}
                        </span>
                      </div>
                      {receipt.createdBy && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">{t('materials.receipt.createdBy')}:</span>
                          <span className="text-gray-900 font-medium">{receipt.createdBy}</span>
                        </div>
                      )}
                      {receipt.importSource && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">{t('materials.receipt.importSource')}:</span>
                          <span className="text-gray-900">{receipt.importSource}</span>
                        </div>
                      )}
                      {receipt.importFileName && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">{t('materials.receipt.fileName')}:</span>
                          <span className="text-gray-900 truncate max-w-[200px]" title={receipt.importFileName}>
                            {receipt.importFileName}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      {t('materials.receipt.timestamps')}
                    </h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">{t('materials.receipt.createdAt')}:</span>
                        <span className="text-gray-900">
                          {new Date(receipt.createdAt).toLocaleString('vi-VN')}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">{t('materials.receipt.updatedAt')}:</span>
                        <span className="text-gray-900">
                          {new Date(receipt.updatedAt).toLocaleString('vi-VN')}
                        </span>
                      </div>
                      {receipt.approvedDate && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-600">{t('materials.receipt.approvedDate')}:</span>
                          <span className="text-gray-900">
                            {new Date(receipt.approvedDate).toLocaleString('vi-VN')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Notes */}
                {receipt.notes && (
                  <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                    <h4 className="text-sm font-semibold text-gray-700 mb-2">{t('materials.receipt.notes')}:</h4>
                    <p className="text-sm text-gray-700">{receipt.notes}</p>
                  </div>
                )}

                {/* Items Table */}
                <div>
                  <h4 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Package className="w-5 h-5" />
                    {t('materials.receipt.receiptItems')} ({receipt.items.length})
                  </h4>
                  <div className="overflow-x-auto border border-gray-200 rounded-lg">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-gray-300">
                            #
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase border-r border-gray-300">
                            Item Code
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase border-r border-gray-300">
                            Item Name
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase border-r border-gray-300">
                            Category
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-gray-300">
                            Quantity
                          </th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase border-r border-gray-300">
                            Unit
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase border-r border-gray-300">
                            Unit Cost
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                            Total Cost
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {receipt.items.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-center text-sm text-gray-900 border-r border-gray-300">
                              {item.lineNumber || idx + 1}
                            </td>
                            <td className="px-4 py-3 text-sm border-r border-gray-300">
                              <span className="font-mono text-gray-900">{item.itemCode}</span>
                            </td>
                            <td className="px-4 py-3 text-sm border-r border-gray-300">
                              <div className="font-medium text-gray-900">{item.itemName}</div>
                              {item.notes && (
                                <div className="text-xs text-gray-500 mt-1">{item.notes}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm border-r border-gray-300">
                              <span className="px-2 py-1 bg-[#dce9f8] text-[#16375f] rounded-full text-xs">
                                {item.categoryName}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-center text-sm font-medium text-gray-900 border-r border-gray-300">
                              {item.quantity}
                            </td>
                            <td className="px-4 py-3 text-center text-sm text-gray-700 border-r border-gray-300">
                              {item.unit}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-gray-900 border-r border-gray-300">
                              {item.unitCost ? `${item.unitCost.toFixed(2)} ${item.currency}` : '-'}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">
                              {item.totalCost ? `${item.totalCost.toFixed(2)} ${item.currency}` : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr>
                          <td colSpan={7} className="px-4 py-3 text-right text-sm font-semibold text-gray-700">
                            {t('materials.receipt.grandTotal')}:
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">
                            {receipt.totalAmount ? receipt.totalAmount.toFixed(2) : '0.00'} {receipt.currency}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {t('common.close')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-gray-50 rounded-lg">
          {icon}
        </div>
        <div className="flex-1">
          <p className="text-xs text-gray-600 mb-1">{label}</p>
          <p className="text-sm font-semibold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );
}

