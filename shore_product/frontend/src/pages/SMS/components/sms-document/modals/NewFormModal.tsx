import type React from 'react';
import { X, Plus, Trash2 } from 'lucide-react';

interface NewFormModalProps {
  newFormCode: string;
  setNewFormCode: (v: string) => void;
  newFormTitle: string;
  setNewFormTitle: (v: string) => void;
  newFormProcedureId: string;
  setNewFormProcedureId: (v: string) => void;
  formBuilderData: any;
  setFormBuilderData: React.Dispatch<React.SetStateAction<any>>;
  treeData: any[];
  addFormField: () => void;
  updateFormField: (idx: number, key: string, val: any) => void;
  removeFormField: (idx: number) => void;
  onClose: () => void;
  onCreate: () => void;
}

export function NewFormModal(props: NewFormModalProps) {
  const { newFormCode, setNewFormCode, newFormTitle, setNewFormTitle, newFormProcedureId, setNewFormProcedureId, formBuilderData, treeData, addFormField, updateFormField, removeFormField, onClose, onCreate } = props;
  const handleCreateFormFromLibrary = onCreate;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-modal p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-primary-soft dark:bg-blue-900/50 text-accent dark:text-blue-400 rounded-lg">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">Tạo biểu mẫu mới vào thư viện</h3>
              <p className="text-[10px] text-slate-500">Thiết kế cấu trúc checklist hoặc form báo cáo điện tử</p>
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
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* Form Code & Title */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Mã biểu mẫu</label>
              <input
                type="text"
                placeholder="VD: BM-07-08"
                value={newFormCode}
                onChange={(e) => setNewFormCode(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Tiêu đề biểu mẫu</label>
              <input
                type="text"
                placeholder="VD: Checklist an toàn cháy nổ"
                value={newFormTitle}
                onChange={(e) => setNewFormTitle(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          </div>

          {/* Procedure Association */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Quy trình (SOP) liên kết bắt buộc</label>
            <select
              value={newFormProcedureId}
              onChange={(e) => setNewFormProcedureId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-accent"
            >
              <option value="">-- Chọn quy trình liên kết --</option>
              {treeData.flatMap(ch => ch.procedures).filter(p => p.status === 'Active').map(p => (
                <option key={p.id} value={p.id}>{p.procedureCode} - {p.title}</option>
              ))}
            </select>
          </div>

          {/* Dynamic Fields Builder */}
          <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-500 uppercase">Cấu trúc các trường ({formBuilderData.fields.length})</span>
              <button
                onClick={addFormField}
                className="flex items-center gap-1 text-[10px] font-bold text-accent hover:text-primary transition"
              >
                <Plus className="w-3 h-3" /> Thêm trường
              </button>
            </div>

            {formBuilderData.fields.length === 0 && (
              <div className="text-[10px] text-slate-400 italic py-4 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded-xl">
                Chưa có trường nào. Nhấn "Thêm trường" để bắt đầu thiết kế form.
              </div>
            )}

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
              {formBuilderData.fields.map((field: any, idx: number) => (
                <div key={field.id} className="flex items-start gap-2 p-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Tên trường"
                      value={field.label}
                      onChange={(e) => updateFormField(idx, 'label', e.target.value)}
                      className="px-2 py-1.5 text-[11px] rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-accent"
                    />
                    <select
                      value={field.type}
                      onChange={(e) => updateFormField(idx, 'type', e.target.value)}
                      className="px-2 py-1.5 text-[11px] rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-accent"
                    >
                      <option value="text">Văn bản</option>
                      <option value="textarea">Đoạn văn</option>
                      <option value="number">Số</option>
                      <option value="date">Ngày</option>
                      <option value="select">Lựa chọn</option>
                      <option value="checkbox">Checkbox</option>
                    </select>
                    <label className="flex items-center gap-1.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(e) => updateFormField(idx, 'required', e.target.checked)}
                        className="rounded border-slate-300 text-accent focus:ring-accent w-3.5 h-3.5"
                      />
                      <span className="text-[10px] text-slate-500">Bắt buộc</span>
                    </label>
                  </div>
                  <button
                    onClick={() => removeFormField(idx)}
                    className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded transition flex-shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            {/* Options for Select field type */}
            {formBuilderData.fields.some((f: any) => f.type === 'select') && (
              <div className="space-y-1.5 p-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg">
                <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400">Các tùy chọn (phân cách bằng dấu phẩy):</span>
                {formBuilderData.fields.filter((f: any) => f.type === 'select').map((field: any) => {
                  const originalIdx = formBuilderData.fields.indexOf(field);
                  return (
                    <div key={field.id} className="flex items-center gap-2">
                      <span className="text-[10px] text-amber-600 font-mono w-20 truncate">{field.label || 'Chưa đặt tên'}</span>
                      <input
                        type="text"
                        placeholder="VD: Đạt, Không đạt, N/A"
                        value={field.options || ''}
                        onChange={(e) => updateFormField(originalIdx, 'options', e.target.value)}
                        className="flex-1 px-2 py-1 text-[11px] rounded border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>
                  );
                })}
              </div>
            )}
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
            onClick={handleCreateFormFromLibrary}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded-lg text-xs font-semibold shadow-sm transition"
          >
            Tạo & liên kết biểu mẫu
          </button>
        </div>

      </div>
    </div>
  );
}
