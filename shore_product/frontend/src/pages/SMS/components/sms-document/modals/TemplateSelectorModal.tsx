import type React from 'react';
import { X, Database, Search, RefreshCw } from 'lucide-react';

interface TemplateSelectorModalProps {
  selectedProcDetail: any;
  selectorSearch: string;
  setSelectorSearch: (v: string) => void;
  allFormTemplates: any[];
  selectedAssignIds: string[];
  setSelectedAssignIds: React.Dispatch<React.SetStateAction<string[]>>;
  loadingSelector: boolean;
  assigningTemplates: boolean;
  onClose: () => void;
  onAssign: () => void;
}

export function TemplateSelectorModal(props: TemplateSelectorModalProps) {
  const { selectedProcDetail, selectorSearch, setSelectorSearch, allFormTemplates, selectedAssignIds, setSelectedAssignIds, loadingSelector, assigningTemplates, onClose, onAssign } = props;
  const handleAssignTemplates = onAssign;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-xl w-full border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col max-h-[85vh]">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary-soft dark:bg-blue-900/50 text-accent dark:text-blue-400 rounded-lg">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Gán biểu mẫu đã có vào quy trình</h3>
              <p className="text-[10px] text-slate-500">
                Quy trình hiện tại: <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedProcDetail?.procedureCode} - {selectedProcDetail?.title}</span>
              </p>
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
        <div className="p-5 overflow-y-auto flex-1 flex flex-col min-h-0 space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm mã biểu mẫu hoặc tên biểu mẫu..."
              value={selectorSearch}
              onChange={(e) => setSelectorSearch(e.target.value)}
              className="pl-9 pr-4 py-2 w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {/* Templates List */}
          <div className="flex-1 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 min-h-[250px] max-h-[40vh] scrollbar-thin">
            {loadingSelector ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-accent" />
                <span>Đang tải danh sách biểu mẫu...</span>
              </div>
            ) : (() => {
              const filtered = allFormTemplates.filter(t => 
                t.formCode.toLowerCase().includes(selectorSearch.toLowerCase()) ||
                t.title.toLowerCase().includes(selectorSearch.toLowerCase())
              );

              if (filtered.length === 0) {
                return (
                  <div className="py-12 text-center text-slate-400 text-xs italic">
                    Không tìm thấy biểu mẫu nào khả dụng.
                  </div>
                );
              }

              return filtered.map((temp) => {
                const isChecked = selectedAssignIds.includes(temp.id);
                return (
                  <label
                    key={temp.id}
                    className="flex items-start gap-3 p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer select-none transition"
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedAssignIds(prev => [...prev, temp.id]);
                        } else {
                          setSelectedAssignIds(prev => prev.filter(id => id !== temp.id));
                        }
                      }}
                      className="mt-0.5 rounded border-slate-300 text-accent focus:ring-accent w-3.5 h-3.5"
                    />
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-[9px] font-bold bg-slate-100 dark:bg-slate-900 text-slate-500 px-1.5 py-0.5 rounded">
                          {temp.formCode}
                        </span>
                        <span className="text-xs font-bold text-slate-800 dark:text-white">
                          {temp.title}
                        </span>
                      </div>
                      {temp.procedureCode && (
                        <p className="text-[10px] text-slate-400">
                          Thuộc quy trình: <span className="font-medium text-slate-500">{temp.procedureCode}</span>
                        </p>
                      )}
                    </div>
                  </label>
                );
              });
            })()}
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
          <button
            onClick={handleAssignTemplates}
            disabled={assigningTemplates}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
          >
            {assigningTemplates && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            Gán {selectedAssignIds.length} biểu mẫu
          </button>
        </div>

      </div>
    </div>
  );
}
