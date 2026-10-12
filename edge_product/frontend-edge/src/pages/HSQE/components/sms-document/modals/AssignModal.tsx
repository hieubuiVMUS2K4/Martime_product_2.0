import { PermissionGate } from '@/components/auth/PermissionGate'
import { X, ExternalLink } from 'lucide-react';

interface AssignModalProps {
  assignProcedureId: string;
  setAssignProcedureId: (v: string) => void;
  treeData: any[];
  onClose: () => void;
  onAssign: () => void;
}

export function AssignModal({ assignProcedureId, setAssignProcedureId, treeData, onClose, onAssign }: AssignModalProps) {
  const handleAssignFromLibrary = onAssign;

  return (
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
        <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-xl w-full border border-slate-205 dark:border-slate-700 shadow-2xl flex flex-col">
          
          {/* Modal Header */}
          <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-50 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg">
                <ExternalLink className="w-4.5 h-4.5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">Gán biểu mẫu vào quy trình</h3>
                <p className="text-xs text-slate-500">Sao chép biểu mẫu này sang quy trình hoạt động khác</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition"
            >
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>

          {/* Modal Body */}
          <div className="p-5 space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Chọn quy trình nhận biểu mẫu</label>
              <select
                value={assignProcedureId}
                onChange={(e) => setAssignProcedureId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-202 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-850 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">-- Chọn quy trình --</option>
                {treeData.flatMap((ch: any) => ch.procedures).filter((p: any) => p.status === 'Active').map((p: any) => (
                  <option key={p.id} value={p.id}>{p.procedureCode} - {p.title}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="p-5 border-t border-slate-100 dark:border-slate-700 flex items-center justify-end gap-2.5 flex-shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition"
            >
              Hủy
            </button>
            <PermissionGate permission="hsqe.update"><button
              onClick={handleAssignFromLibrary}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
            >
              Gán biểu mẫu
            </button></PermissionGate>
          </div>

        </div>
      </div>
  );
}
