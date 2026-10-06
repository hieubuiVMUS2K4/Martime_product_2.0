import { CheckCircle } from 'lucide-react';
import { PermissionGate } from '@/components/auth/PermissionGate';

export function ReceiptCompletionButton({ status, onComplete, iconOnly = false }: {
  status: string;
  onComplete: () => void;
  iconOnly?: boolean;
}) {
  if (!['Draft', 'Submitted', 'Approved'].includes(status)) return null;
  const requiresApproval = status !== 'Approved';
  return (
    <PermissionGate permission="pms.receipts.execute">
      <div className="flex flex-col items-center gap-1">
        <button type="button" disabled={requiresApproval} onClick={onComplete}
          aria-label="Hoàn tất nhập kho"
          title={requiresApproval ? 'Cần duyệt phiếu nhập trước khi hoàn tất nhập kho' : 'Hoàn tất nhập kho và cập nhật tồn kho'}
          className={iconOnly
            ? 'rounded p-1 text-gray-400 hover:bg-green-50 hover:text-green-600 disabled:cursor-not-allowed disabled:opacity-40'
            : 'flex items-center gap-1.5 whitespace-nowrap rounded bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500'}>
          <CheckCircle size={iconOnly ? 15 : 14} />{!iconOnly && ' Hoàn tất nhập kho'}
        </button>
        {requiresApproval && !iconOnly && <span className="whitespace-nowrap text-xs text-gray-500">Cần duyệt phiếu nhập trước</span>}
      </div>
    </PermissionGate>
  );
}
