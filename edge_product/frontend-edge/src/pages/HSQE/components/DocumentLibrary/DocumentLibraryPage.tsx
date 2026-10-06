import { PermissionGate } from '@/components/auth/PermissionGate'
/**
 * Document Library Page - Main Orchestrator
 * ISM Code / ISO 9001 Document Control System
 * 
 * Layout matching reference screenshot:
 * - Left: Sidebar with tree view (Library View / Location View)
 * - Right: 6 tabs (Data, Document, Attached Documents, Read Logs, Chapter Versions, History)
 * - Bottom: Finish Writing / Approve / Release Version + Save/Cancel
 */
import { useState, useEffect, useCallback } from 'react';
import {
  FileText, Database, Paperclip, BookOpen, GitBranch, History,
  RefreshCw, Plus, BookOpen as BookOpenIcon, Save, X, Check, Upload, Trash2,
  GripVertical, Calendar, SlidersHorizontal, ListChecks
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import { documentService } from '@/services/document.service';
import { DocumentSidebar } from './DocumentSidebar';
import { DataTab } from './tabs/DataTab';
import { DocumentTab } from './tabs/DocumentTab';
import { AttachedDocumentsTab } from './tabs/AttachedDocumentsTab';
import { ReadLogsTab } from './tabs/ReadLogsTab';
import { ChapterVersionsTab } from './tabs/ChapterVersionsTab';
import { HistoryTab } from './tabs/HistoryTab';
import type {
  DocTreeNode, TabType, DocAttachment,
  DocReadLog, DocHistoryEntry, DocCategory, DocChapterVersion,
} from './types';

type ChecklistExportQuestion = {
  id: string;
  code?: string;
  text: string;
  answerType: 'date' | 'select' | 'slider' | 'text';
  mandatory: boolean;
  options?: string[];
  min?: number;
  max?: number;
};

type ChecklistExportSection = {
  id: string;
  title: string;
  questions: ChecklistExportQuestion[];
};

type ChecklistExportTemplate = {
  type: 'checklist-template';
  name: string;
  sections: ChecklistExportSection[];
};

const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = String(reader.result || '');
    resolve(result.includes(',') ? result.split(',')[1] : result);
  };
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(file);
});

const parseChecklistTemplate = (html: string): ChecklistExportTemplate | null => {
  const match = html.match(/<script type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as ChecklistExportTemplate;
    if (parsed.type !== 'checklist-template' || !Array.isArray(parsed.sections)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const element = document.createElement('a');
  element.href = url;
  element.download = fileName;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
  URL.revokeObjectURL(url);
};

// Modal Components

function CreateDocumentModal({
  isOpen,
  onClose,
  onCreate,
  defaultCode,
  defaultCategory,
  currentUserName,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: { documentCode: string; title: string; content: string; category: string; createdBy: string }) => Promise<void>;
  defaultCode: string;
  defaultCategory: string;
  currentUserName: string;
}) {
  const [code, setCode] = useState(defaultCode);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(defaultCategory);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCode(defaultCode);
    setCategory(defaultCategory);
    setTitle('');
  }, [defaultCode, defaultCategory, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-lg w-full border border-slate-200 dark:border-slate-700 shadow-2xl">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Tạo tài liệu mới</h3>
        <p className="text-xs text-slate-400 mb-5">ISM Code Document Control System</p>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Mã tài liệu</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="VD: TL-01"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Phân loại</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="PROCEDURE">Quy trình</option>
                <option value="FORM">Biểu mẫu</option>
                <option value="SMS_HANDBOOK">Sổ tay SMS</option>
                <option value="MANUAL">Manual</option>
                <option value="CHECKLIST">Checklist</option>
                <option value="EXTERNAL">Tài liệu bên ngoài</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Tiêu đề tài liệu</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Nhập tiêu đề tài liệu"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-slate-100 dark:border-slate-700">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50">
            Hủy bỏ
          </button>
          <PermissionGate permission="hsqe.create"><button
            onClick={async () => {
              if (!code.trim() || !title.trim()) { toast.error('Vui lòng nhập đầy đủ thông tin'); return; }
              setSaving(true);
              try {
                await onCreate({ documentCode: code, title, content: '<p>Nhập nội dung tại đây...</p>', category, createdBy: currentUserName });
                onClose();
              } finally { setSaving(false); }
            }}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition disabled:opacity-50 flex items-center gap-1.5"
          >
            {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
            Tạo tài liệu
          </button></PermissionGate>
        </div>
      </div>
    </div>
  );
}

function ImportDocumentModal({
  isOpen,
  onClose,
  onImport,
  defaultCode,
  documents,
}: {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: { documentCode: string; title: string; fileName: string; content: string; createdBy: string }) => Promise<void>;
  defaultCode: string;
  documents: DocTreeNode[];
}) {
  const { user } = useAuthStore();
  const [code, setCode] = useState(defaultCode);
  const [destinationCode, setDestinationCode] = useState('');
  const [title, setTitle] = useState('');
  const [fileName, setFileName] = useState('');
  const [importedContent, setImportedContent] = useState('');
  const [fileError, setFileError] = useState('');
  const [saving, setSaving] = useState(false);
  const currentUserName = user?.fullName || user?.username || 'Demo User';
  const destinationOptions = documents.filter(doc =>
    !doc.isVirtual && ['MANUAL', 'SMS_HANDBOOK', 'PROCEDURE'].includes(doc.category)
  );
  const getNextImportCode = (parentCode: string) => {
    if (!parentCode) return defaultCode;
    const usedNumbers = documents
      .map(doc => doc.code)
      .filter(docCode => docCode.startsWith(`${parentCode}-`))
      .map(docCode => Number(docCode.slice(parentCode.length + 1).split('-')[0]))
      .filter(Number.isFinite);
    const next = Math.max(0, ...usedNumbers) + 1;
    return `${parentCode}-${String(next).padStart(2, '0')}`;
  };

  useEffect(() => {
    setCode(defaultCode);
    setDestinationCode('');
    setTitle('');
    setFileName('');
    setImportedContent('');
    setFileError('');
  }, [defaultCode, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-700 dark:bg-slate-800">
        <h3 className="mb-1 text-lg font-bold text-slate-900 dark:text-white">Import Document</h3>
        <p className="mb-5 text-xs text-slate-400">Upload external file into SMS Library.</p>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Document code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Import vào</label>
              <select
                value={destinationCode}
                onChange={(e) => {
                  const parentCode = e.target.value;
                  setDestinationCode(parentCode);
                  setCode(getNextImportCode(parentCode));
                }}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="">Không chọn</option>
                {destinationOptions.map(option => (
                  <option key={option.id} value={option.code}>
                    {option.code} - {option.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              placeholder="Document title"
            />
          </div>

          <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center hover:border-blue-400 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900/40">
            <Upload className="mb-2 h-6 w-6 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {fileName || 'Choose file to import'}
            </span>
            <input
              type="file"
              accept=".docx,.doc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setFileName(file.name);
                setImportedContent('');
                setFileError('');
                if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ''));

                const extension = file.name.split('.').pop()?.toLowerCase();
                if (extension === 'doc') {
                  setFileError('File .doc là định dạng Word cũ, trình duyệt không thể preview trực tiếp ổn định. Vui lòng mở bằng Word và Save As sang .docx rồi import lại.');
                  return;
                }
                if (extension !== 'docx') {
                  setFileError('Chỉ hỗ trợ import preview cho file Word .docx.');
                  return;
                }

                try {
                  setImportedContent(await fileToBase64(file));
                } catch {
                  setFileError('Không thể đọc nội dung file Word. Vui lòng kiểm tra file hoặc lưu lại dưới định dạng .docx.');
                }
              }}
            />
          </label>
          {fileError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              {fileError}
            </div>
          )}
          {importedContent && !fileError && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-700 dark:border-green-900/50 dark:bg-green-950/30 dark:text-green-300">
              Đã đọc file Word. Khi import, tài liệu sẽ được render bằng trình xem DOCX để giữ header, logo, ảnh và bảng tốt hơn.
            </div>
          )}
        </div>

        <div className="mt-6 flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-700">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400">
            Cancel
          </button>
          <PermissionGate permission="hsqe.create"><button
            onClick={async () => {
              if (!code.trim() || !title.trim() || !fileName.trim()) {
                toast.error('Vui lòng chọn file và nhập đầy đủ thông tin');
                return;
              }
              if (fileError || !importedContent.trim()) {
                toast.error(fileError || 'Chưa đọc được nội dung file Word');
                return;
              }
              setSaving(true);
              try {
                await onImport({ documentCode: code, title, fileName, content: importedContent, createdBy: currentUserName });
                onClose();
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Import
          </button></PermissionGate>
        </div>
      </div>
    </div>
  );
}

type ChecklistQuestion = {
  id: string;
  code: string;
  text: string;
  answerType: 'date' | 'select' | 'slider' | 'text';
  mandatory: boolean;
  options: string[];
  min?: number;
  max?: number;
};

type ChecklistSection = {
  id: string;
  title: string;
  questions: ChecklistQuestion[];
};

function ChecklistTemplateModal({
  isOpen,
  onClose,
  onCreate,
  defaultCode,
  currentUserName,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (data: { documentCode: string; title: string; content: string; category: string; createdBy: string }) => Promise<void>;
  defaultCode: string;
  currentUserName: string;
}) {
  const [code, setCode] = useState(defaultCode);
  const [name, setName] = useState('Performance report');
  const [saving, setSaving] = useState(false);
  const [sections, setSections] = useState<ChecklistSection[]>([
    {
      id: 's1',
      title: 'General',
      questions: [
        { id: 'q1', code: '', text: 'Date of report', answerType: 'date', mandatory: true, options: [] },
        { id: 'q2', code: '', text: 'Engineer', answerType: 'select', mandatory: true, options: ['John Doe', 'Monique Smit'] },
        { id: 'q3', code: '', text: 'Wind force (Bft)', answerType: 'slider', mandatory: true, options: [], min: 1, max: 12 },
        { id: 'q4', code: '', text: 'Sea', answerType: 'select', mandatory: true, options: ['Slight'] },
      ],
    },
  ]);

  useEffect(() => {
    if (!isOpen) return;
    setCode(defaultCode);
  }, [defaultCode, isOpen]);

  if (!isOpen) return null;

  const updateSection = (sectionId: string, patch: Partial<ChecklistSection>) => {
    setSections(prev => prev.map(section => section.id === sectionId ? { ...section, ...patch } : section));
  };

  const updateQuestion = (sectionId: string, questionId: string, patch: Partial<ChecklistQuestion>) => {
    setSections(prev => prev.map(section => section.id === sectionId ? {
      ...section,
      questions: section.questions.map(item => item.id === questionId ? { ...item, ...patch } : item),
    } : section));
  };

  const addSection = () => {
    setSections(prev => [
      ...prev,
      {
        id: `s${Date.now()}`,
        title: `Section ${prev.length + 1}`,
        questions: [
          {
            id: `q${Date.now()}`,
            code: '',
            text: '',
            answerType: 'text',
            mandatory: true,
            options: [],
          },
        ],
      },
    ]);
  };

  const removeSection = (sectionId: string) => {
    setSections(prev => prev.length <= 1 ? prev : prev.filter(section => section.id !== sectionId));
  };

  const addQuestion = (sectionId: string) => {
    setSections(prev => prev.map(section => section.id === sectionId ? {
      ...section,
      questions: [
        ...section.questions,
        {
          id: `q${Date.now()}`,
          code: '',
          text: '',
          answerType: 'text',
          mandatory: true,
          options: [],
        },
      ],
    } : section));
  };

  const removeQuestion = (sectionId: string, questionId: string) => {
    setSections(prev => prev.map(section => section.id === sectionId ? {
      ...section,
      questions: section.questions.length <= 1
        ? section.questions
        : section.questions.filter(item => item.id !== questionId),
    } : section));
  };

  const checklistPayload = {
    type: 'checklist-template',
    name,
    sections,
  };
  const answerTypeLabel: Record<ChecklistQuestion['answerType'], string> = {
    date: 'Date',
    select: 'Answer select',
    slider: 'Slider',
    text: 'Text',
  };
  const checklistBodyHtml = sections.map((section, sectionIndex) => `
    <div style="margin: 18px 0 0; border: 1px solid #d8e0ea;">
      <div style="display: grid; grid-template-columns: 72px 1fr; background: #f8fafc; border-bottom: 1px solid #d8e0ea; font-weight: 700;">
        <div style="padding: 10px 12px; border-right: 1px solid #d8e0ea;">${sectionIndex + 1}.</div>
        <div style="padding: 10px 12px;">${section.title}</div>
      </div>
      ${section.questions.map((question, questionIndex) => `
        <div style="display: grid; grid-template-columns: 72px 1fr 160px 120px; border-bottom: 1px solid #e6edf5;">
          <div style="padding: 10px 12px; border-right: 1px solid #e6edf5; font-weight: 600;">${sectionIndex + 1}.${questionIndex + 1}.</div>
          <div style="padding: 10px 12px;">
            <div style="font-weight: 600;">${question.text}</div>
            ${question.code ? `<div style="font-size: 12px; color: #64748b;">Code: ${question.code}</div>` : ''}
            ${question.options.length ? `<div style="font-size: 12px; color: #64748b;">Options: ${question.options.filter(Boolean).join(', ')}</div>` : ''}
            ${question.answerType === 'slider' ? `<div style="font-size: 12px; color: #64748b;">Range: ${question.min ?? 1} - ${question.max ?? 10}</div>` : ''}
          </div>
          <div style="padding: 10px 12px; border-left: 1px solid #e6edf5;">${answerTypeLabel[question.answerType]}</div>
          <div style="padding: 10px 12px; border-left: 1px solid #e6edf5;">${question.mandatory ? 'Mandatory' : 'Optional'}</div>
        </div>
      `).join('')}
    </div>
  `).join('');

  const checklistHtml = `
    <section data-hsqe-checklist="true" style="font-family: Arial, sans-serif;">
      <h1 style="font-size: 22px; margin: 0 0 8px;">${name}</h1>
      <p style="margin: 0 0 16px; color: #64748b;">Checklist template | Code: ${code} | Version: 1</p>
      ${checklistBodyHtml}
      <script type="application/json">${JSON.stringify(checklistPayload)}</script>
    </section>
  `;
  const today = new Date().toLocaleDateString('en-GB');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
      <div className="flex max-h-[86vh] w-full max-w-6xl flex-col overflow-hidden rounded border border-slate-300 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2 dark:border-slate-700">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Edit checklist</h3>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-[1fr_1fr_1.35fr] gap-x-10 gap-y-3 border-b border-slate-200 px-4 py-3 text-sm dark:border-slate-700">
          <label className="grid grid-cols-[120px_1fr] items-center gap-2">
            <span>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="h-8 rounded border border-slate-300 px-2 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
          </label>
          <div className="grid grid-cols-[110px_1fr_36px_120px] items-center gap-2">
            <span>Created by</span>
            <strong>{currentUserName}</strong>
            <span>On</span>
            <strong>{today}</strong>
          </div>
          <span />

          <label className="grid grid-cols-[120px_1fr] items-center gap-2">
            <span>Version</span>
            <strong>1</strong>
          </label>
          <label className="grid grid-cols-[110px_1fr] items-center gap-2">
            <span>Code</span>
            <input value={code} onChange={(e) => setCode(e.target.value)} className="h-8 rounded border border-slate-300 px-2 font-semibold outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-4">
          {sections.map((section, sectionIndex) => (
            <div key={section.id}>
              <div className="grid grid-cols-[34px_56px_1fr_auto] items-center gap-3 border-b border-slate-200 py-2 text-sm dark:border-slate-700">
                <GripVertical className="h-4 w-4 text-slate-500" />
                <span>{sectionIndex + 1}.</span>
                <label className="grid grid-cols-[150px_1fr] items-center gap-2">
                  <span>Paragraph name</span>
                  <input
                    value={section.title}
                    onChange={(e) => updateSection(section.id, { title: e.target.value })}
                    className="h-8 rounded border border-slate-300 px-2 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
                  />
                </label>
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={() => addQuestion(section.id)}
                    className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    title="Add question"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Question
                  </button>
                  <button
                    type="button"
                    onClick={addSection}
                    className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                    title="Add section"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Section
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSection(section.id)}
                    disabled={sections.length <= 1}
                    className="flex h-8 w-8 items-center justify-center rounded border border-red-100 text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-red-900/40 dark:hover:bg-red-950/30"
                    title="Delete section"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {section.questions.map((question, questionIndex) => (
                <div key={question.id} className="grid grid-cols-[34px_80px_1fr_300px_210px_40px] gap-3 border-b border-slate-200 py-3 text-sm dark:border-slate-700">
                  <GripVertical className="mt-7 h-4 w-4 text-slate-500" />
                  <span className="mt-7">{`${sectionIndex + 1}.${questionIndex + 1}.`}</span>

                  <div className="grid grid-cols-[220px_1fr] gap-3">
                    <label>
                      <span className="mb-1 block text-xs">Code</span>
                      <input value={question.code} onChange={(e) => updateQuestion(section.id, question.id, { code: e.target.value })} placeholder="Code" className="h-8 w-full rounded border border-slate-300 px-2 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
                    </label>
                    <label>
                      <span className="mb-1 block text-xs">Question text</span>
                      <input value={question.text} onChange={(e) => updateQuestion(section.id, question.id, { text: e.target.value })} placeholder="Question text" className="h-8 w-full rounded border border-slate-300 px-2 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800" />
                    </label>
                  </div>

                  <div>
                    {question.answerType === 'select' && (
                      <div>
                        <span className="mb-1 block text-xs">Possible answers</span>
                        <div className="space-y-1">
                          {(question.options.length ? question.options : ['']).map((option, optionIndex) => (
                            <div key={optionIndex} className="flex items-center gap-1">
                              <input
                                value={option}
                                onChange={(e) => {
                                  const options = question.options.length ? [...question.options] : [''];
                                  options[optionIndex] = e.target.value;
                                  updateQuestion(section.id, question.id, { options });
                                }}
                                className="h-8 min-w-0 flex-1 rounded border border-slate-300 px-2 outline-none focus:border-blue-500 dark:border-slate-700 dark:bg-slate-800"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const options = question.options.filter((_, index) => index !== optionIndex);
                                  updateQuestion(section.id, question.id, { options });
                                }}
                                className="flex h-8 w-8 items-center justify-center rounded border border-red-100 text-red-500 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-950/30"
                                title="Delete answer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => updateQuestion(section.id, question.id, { options: [...question.options, ''] })}
                          className="mt-2 inline-flex h-8 w-full items-center justify-center gap-1.5 rounded border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Answer
                        </button>
                      </div>
                    )}
                    {question.answerType === 'slider' && (
                      <div className="space-y-2">
                        <label className="block">
                          <span className="mb-1 block text-xs">Minimum value</span>
                          <input type="number" value={question.min ?? 1} onChange={(e) => updateQuestion(section.id, question.id, { min: Number(e.target.value) })} className="h-8 w-full rounded border border-slate-300 px-2 text-right dark:border-slate-700 dark:bg-slate-800" />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs">Maximum value</span>
                          <input type="number" value={question.max ?? 10} onChange={(e) => updateQuestion(section.id, question.id, { max: Number(e.target.value) })} className="h-8 w-full rounded border border-slate-300 px-2 text-right dark:border-slate-700 dark:bg-slate-800" />
                        </label>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-2">
                      <select value={question.answerType} onChange={(e) => updateQuestion(section.id, question.id, { answerType: e.target.value as ChecklistQuestion['answerType'] })} className="h-8 flex-1 rounded border border-slate-300 px-2 dark:border-slate-700 dark:bg-slate-800">
                        <option value="date">Date</option>
                        <option value="select">Answer select</option>
                        <option value="slider">Slider</option>
                        <option value="text">Text</option>
                      </select>
                      {question.answerType === 'date' && <Calendar className="h-4 w-4" />}
                      {question.answerType === 'slider' && <SlidersHorizontal className="h-4 w-4" />}
                      {question.answerType === 'select' && <ListChecks className="h-4 w-4" />}
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={question.mandatory} onChange={(e) => updateQuestion(section.id, question.id, { mandatory: e.target.checked })} className="h-4 w-4" />
                      <span>Is mandatory</span>
                    </label>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeQuestion(section.id, question.id)}
                    disabled={section.questions.length <= 1}
                    className="mt-7 flex h-8 w-8 items-center justify-center rounded border border-red-100 text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-red-900/40 dark:hover:bg-red-950/30"
                    title="Delete question"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-4 py-2 dark:border-slate-700">
          <PermissionGate permission="hsqe.create"><button
            onClick={async () => {
              if (!code.trim() || !name.trim()) {
                toast.error('Vui lòng nhập code và tên checklist');
                return;
              }
              if (sections.some(section => !section.title.trim())) {
                toast.error('Vui lòng nhập tên cho tất cả paragraph');
                return;
              }
              if (sections.some(section => section.questions.some(question => !question.text.trim()))) {
                toast.error('Vui lòng nhập nội dung cho tất cả câu hỏi');
                return;
              }
              setSaving(true);
              try {
                await onCreate({
                  documentCode: code,
                  title: name,
                  content: checklistHtml,
                  category: 'CHECKLIST',
                  createdBy: currentUserName,
                });
                onClose();
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
            className="flex items-center gap-1.5 rounded bg-green-500 px-4 py-1.5 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
            Save
          </button></PermissionGate>
          <button onClick={onClose} disabled={saving} className="rounded border border-slate-200 px-4 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkDeleteConfirmModal({
  isOpen,
  count,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  count: number;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-300">
            <Trash2 className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete selected documents?</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {count} selected document(s) will be moved to Obsolete and hidden from the active library.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-700">
          <button
            onClick={onClose}
            disabled={deleting}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
          >
            Cancel
          </button>
          <PermissionGate permission="hsqe.delete"><button
            onClick={async () => {
              setDeleting(true);
              try {
                await onConfirm();
              } finally {
                setDeleting(false);
              }
            }}
            disabled={deleting}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete
          </button></PermissionGate>
        </div>
      </div>
    </div>
  );
}

function ApproveModal({
  isOpen,
  onClose,
  onApprove,
  docCode,
  defaultApprover,
}: {
  isOpen: boolean;
  onClose: () => void;
  onApprove: (approverName: string) => Promise<void>;
  docCode: string;
  defaultApprover: string;
}) {
  const [approverName, setApproverName] = useState(defaultApprover);

  useEffect(() => { setApproverName(defaultApprover); }, [defaultApprover, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 max-w-md w-full border border-slate-200 dark:border-slate-700 shadow-2xl">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Ký duyệt & Ban hành - {docCode}</h3>
        <p className="text-xs text-slate-400 mb-5">Quy trình sẽ được chuyển sang trạng thái Published và phân phối xuống đội tàu.</p>

        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Người phê duyệt</label>
          <input
            type="text"
            value={approverName}
            onChange={(e) => setApproverName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center justify-end gap-2 mt-6 pt-4 border-t border-slate-100 dark:border-slate-700">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-50">
            Hủy bỏ
          </button>
          <PermissionGate permission="hsqe.approve"><button
            onClick={() => onApprove(approverName)}
            className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" /> Ký và phê duyệt
          </button></PermissionGate>
        </div>
      </div>
    </div>
  );
}

// Main Component

export function DocumentLibraryPage() {
  const { user } = useAuthStore();
  const currentUserName = user?.fullName || user?.username || 'Demo User';
  const currentUserTitle = user?.rankName || user?.position || user?.roleName || 'Admin';
  const currentAuthorString = `${currentUserName} (${currentUserTitle})`;

  // State
  const [documents, setDocuments] = useState<DocTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('document');
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editChangeSummary, setEditChangeSummary] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editWatermark, setEditWatermark] = useState('');

  // Layout & View states
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [margins, setMargins] = useState<'normal' | 'narrow' | 'wide'>('normal');
  const [showRuler, setShowRuler] = useState<boolean>(true);
  const [zoom, setZoom] = useState<number>(100);
  const [readMode, setReadMode] = useState<boolean>(false);

  // Bottom bar workflow
  const [finishWriting, setFinishWriting] = useState(false);

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [checklistModalOpen, setChecklistModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [createDefaultCode, setCreateDefaultCode] = useState('');
  const [createDefaultCategory, setCreateDefaultCategory] = useState('PROCEDURE');

  // Sub-data
  const [attachments, setAttachments] = useState<DocAttachment[]>([]);
  const [readLogs, setReadLogs] = useState<DocReadLog[]>([]);
  const [historyEntries, setHistoryEntries] = useState<DocHistoryEntry[]>([]);

  const [isSeeding, setIsSeeding] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  // Computed
  const selectedDoc = documents.find(d => d.id === selectedDocId) || documents[0] || null;
  const selectedDocIsImportedWord = Boolean(
    selectedDoc?.content.includes('data-imported-word-document="true"') ||
    selectedDoc?.content.includes('data-docx-preview="true"')
  );
  const selectedDocIsChecklistTemplate = Boolean(
    selectedDoc?.category === 'CHECKLIST' &&
    selectedDoc?.content.includes('"type":"checklist-template"')
  );
  const selectedDocUsesSpecialPreview = selectedDocIsImportedWord || selectedDocIsChecklistTemplate;

  // Data Fetching
  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const data = await documentService.getDocuments();
      const mapped: DocTreeNode[] = data.map((d) => ({
        id: d.id,
        code: d.documentCode,
        title: d.title,
        type: d.category === 'FORM' ? 'form' as const : d.category === 'MANUAL' ? 'manual' as const : 'chapter' as const,
        parentId: d.documentCode.includes('-') && d.documentCode.split('-').length > 2
          ? undefined // Let tree builder handle nesting via code
          : undefined,
        children: [],
        status: d.status as DocTreeNode['status'],
        currentVersion: d.currentVersion,
        lastModified: d.updatedAt ? d.updatedAt.split('T')[0] : d.createdAt.split('T')[0],
        author: d.revisions && d.revisions.length > 0
          ? [...d.revisions].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0].changedBy
          : currentAuthorString,
        approver: d.approvedBy || undefined,
        content: d.content,
        category: d.category,
        editCount: d.editCount,
        watermarkText: d.watermarkText || '',
        revisions: (d.revisions || []).map((r) => ({
          id: r.id,
          version: r.version,
          date: r.createdAt ? r.createdAt.split('T')[0] : '',
          modifiedBy: r.changedBy,
          changeSummary: r.changeSummary,
          content: r.contentSnapshot,
          status: r.status || 'Published',
        })),
        syncStatuses: (d.syncStatuses || []).map((s) => ({
          shipName: s.shipName,
          received: s.received,
          receivedDate: s.receivedDate ? s.receivedDate.split('T')[0] : undefined,
          trained: s.trained,
        })),
        attachments: [],
        readLogs: [],
      }));

      setDocuments(mapped);
      if (!selectedDocId && mapped.length > 0) {
        setSelectedDocId(mapped[0].id);
      }
    } catch {
      toast.error('Không thể kết nối đến backend API');
    } finally {
      setLoading(false);
    }
  }, [currentAuthorString, selectedDocId]);

  useEffect(() => {
    fetchDocuments();
  }, []);

  // Fetch sub-data when document changes
  useEffect(() => {
    if (selectedDoc) {
      loadSubData(selectedDoc.id);
      setEditContent(selectedDoc.content);
      setEditTitle(selectedDoc.title);
      const isImportedWord = selectedDoc.content.includes('data-imported-word-document="true"') || selectedDoc.content.includes('data-docx-preview="true"');
      const isChecklistTemplate = selectedDoc.category === 'CHECKLIST' && selectedDoc.content.includes('"type":"checklist-template"');
      setEditWatermark(selectedDoc.watermarkText || (isImportedWord ? '' : 'TÀI LIỆU ĐƯỢC KIỂM SOÁT'));
      setIsEditing(!(isImportedWord || isChecklistTemplate));
      setEditChangeSummary('');
    }
  }, [selectedDocId]);

  const loadSubData = async (docId: string) => {
    const [atts, logs, hist] = await Promise.all([
      documentService.getAttachments(docId),
      documentService.getReadLogs(docId),
      documentService.getHistory(docId),
    ]);
    setAttachments(atts);
    setReadLogs(logs);
    setHistoryEntries(hist);
  };

  // Actions
  const handleSeedData = async () => {
    setIsSeeding(true);
    try {
      await documentService.seedData();
      toast.success('Khởi tạo dữ liệu mẫu thành công!');
      await fetchDocuments();
    } catch {
      toast.error('Không thể khởi tạo dữ liệu mẫu');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleCreateDocument = async (data: { documentCode: string; title: string; content: string; category: string; createdBy: string }) => {
    try {
      const newDoc = await documentService.createDocument({
        ...data,
        category: data.category as DocCategory,
        isControlled: true,
      });
      toast.success('Tạo tài liệu mới thành công!');
      await fetchDocuments();
      setSelectedDocId(newDoc.id);
    } catch {
      toast.error('Không thể tạo tài liệu mới');
    }
  };

  const handleImportDocument = async (data: { documentCode: string; title: string; fileName: string; content: string; createdBy: string }) => {
    try {
      const newDoc = await documentService.createDocument({
        documentCode: data.documentCode,
        title: data.title,
        category: 'EXTERNAL',
        isControlled: true,
        createdBy: data.createdBy,
        content: `
          <section data-docx-preview="true" data-file-name="${data.fileName}">
            <script type="application/json">${JSON.stringify({ fileName: data.fileName, base64: data.content })}</script>
          </section>
        `,
        watermarkText: '',
      });
      toast.success('Import document thành công!');
      await fetchDocuments();
      setSelectedDocId(newDoc.id);
    } catch {
      toast.error('Không thể import document');
    }
  };

  const handleToggleDocumentSelection = (id: string) => {
    setSelectedDocumentIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleBulkDeleteDocuments = async () => {
    if (selectedDocumentIds.length === 0) return;
    try {
      await documentService.bulkDeleteDocuments(selectedDocumentIds);
      toast.success(`Đã xóa ${selectedDocumentIds.length} tài liệu`);
      if (selectedDocId && selectedDocumentIds.includes(selectedDocId)) {
        setSelectedDocId(null);
      }
      setSelectedDocumentIds([]);
      setBulkDeleteConfirmOpen(false);
      await fetchDocuments();
    } catch {
      toast.error('Không thể xóa các tài liệu đã chọn');
    }
  };

  const handleSaveDocument = async () => {
    if (!selectedDoc) {
      return;
    }
    try {
      await documentService.updateDocument(selectedDoc.id, {
        title: editTitle,
        content: editContent,
        changeSummary: editChangeSummary.trim() || 'Cập nhật nội dung tài liệu',
        changedBy: currentAuthorString,
        watermarkText: editWatermark,
      });
      toast.success('Đã lưu thay đổi thành công!');
      setIsEditing(!selectedDocUsesSpecialPreview);
      setFinishWriting(false);
      setEditChangeSummary('');
      await fetchDocuments();
    } catch {
      toast.error('Không thể lưu thay đổi');
    }
  };

  const handleSubmitForReview = async () => {
    if (!selectedDoc) return;
    try {
      await documentService.submitForReview(selectedDoc.id);
      toast.success('Đang gửi trình duyệt.');
      await fetchDocuments();
    } catch {
      toast.error('Gặp lỗi khi gửi trình duyệt');
    }
  };

  const handleApprove = async (approverName: string) => {
    if (!selectedDoc) return;
    try {
      await documentService.approve(selectedDoc.id, approverName);
      toast.success('Phê duyệt & ban hành thành công!');
      setApproveModalOpen(false);
      await fetchDocuments();
    } catch {
      toast.error('Gặp lỗi khi phê duyệt');
    }
  };

  const handleMarkAsRead = async () => {
    if (!selectedDoc) return;
    await documentService.markAsRead(selectedDoc.id, currentUserName, currentUserTitle);
    toast.success('Đã xác nhận đã đọc tài liệu');
    await loadSubData(selectedDoc.id);
  };

  const handleUploadAttachment = async (file: File) => {
    if (!selectedDocId) return;
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('uploadedBy', currentAuthorString);
      await documentService.uploadAttachment(selectedDocId, formData);
      toast.success('Đã tải lên tệp đính kèm thành công!');
      await loadSubData(selectedDocId);
    } catch {
      toast.error('Không thể tải lên tệp đính kèm');
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    if (!selectedDoc) return;
    try {
      await documentService.deleteAttachment(selectedDoc.id, attachmentId);
      toast.success('Đã xóa tệp đính kèm');
      await loadSubData(selectedDoc.id);
    } catch {
      toast.error('Không thể xóa tệp');
    }
  };

  const buildPrintableDocumentHtml = (doc: DocTreeNode) => {
    const checklistTemplate = doc.category === 'CHECKLIST' ? parseChecklistTemplate(doc.content) : null;
    const checklistRows = checklistTemplate?.sections.map((section, sectionIndex) => `
      <tr><td colspan="5" class="section">${sectionIndex + 1}. ${section.title}</td></tr>
      ${section.questions.map((question, questionIndex) => `
        <tr>
          <td class="no">${sectionIndex + 1}.${questionIndex + 1}</td>
          <td>${question.text}${question.mandatory ? ' *' : ''}</td>
          <td class="center">Yes</td>
          <td class="center">No</td>
          <td></td>
        </tr>
      `).join('')}
    `).join('');

    const bodyContent = checklistTemplate ? `
      <table class="checklist">
        <thead>
          <tr>
            <th class="no">No.</th>
            <th>Description</th>
            <th colspan="2">Checked and found satisfactory</th>
            <th>Remarks</th>
          </tr>
          <tr><th></th><th></th><th>Yes</th><th>No</th><th></th></tr>
        </thead>
        <tbody>${checklistRows}</tbody>
      </table>
    ` : `<div class="content">${doc.content}</div>`;

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${doc.code} - ${doc.title}</title>
      <style>
        @page{size:A4;margin:15mm}
        body{font-family:Arial,serif;color:#222;margin:0;background:#fff;font-size:12px}
        .page{width:100%;box-sizing:border-box}
        .doc-header{width:100%;border-collapse:collapse;margin-bottom:22px}
        .doc-header td{border:1px solid #555;padding:10px;vertical-align:middle}
        .logo-cell{width:150px;text-align:center}.logo{width:92px;height:52px;border:2px solid #888;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;font-style:italic;color:#777}
        .company{font-size:9px;font-weight:700;text-transform:uppercase;color:#555;margin-top:4px}.title-cell{text-align:center}.title{font-size:20px;font-weight:900;text-transform:uppercase;color:#666;line-height:1.25}.subtitle{font-size:13px;font-weight:700;font-style:italic;text-transform:uppercase;color:#777;margin-top:7px}.meta-cell{width:170px;text-align:right;font-size:14px;font-weight:800;color:#666}
        .content{font-size:13px;line-height:1.55;text-align:justify}table.checklist{width:100%;border-collapse:collapse;font-size:11px}.checklist th,.checklist td{border:1px solid #111;padding:5px;vertical-align:top}.checklist th{font-weight:800;text-align:center}.checklist .section{font-weight:800;background:#f3f4f6}.checklist .no{width:42px;text-align:center}.checklist .center{text-align:center;width:52px}
      </style></head><body><div class="page">
        <table class="doc-header"><tr><td class="logo-cell" rowspan="2"><div class="logo">FLY</div><div class="company">Flying Shipping<br/>Company</div></td><td class="title-cell" rowspan="2"><div class="title">${doc.title}</div><div class="subtitle">${doc.category === 'CHECKLIST' ? 'Checklist Template' : 'Controlled Document'}</div></td><td class="meta-cell">Flying ${doc.category === 'CHECKLIST' ? 'Checklist' : 'Manual'}<br/>${doc.code}</td></tr><tr><td class="meta-cell">Revision: ${doc.currentVersion.replace(/^Rev\s*/i, '')}<br/>Date: ${doc.lastModified}</td></tr></table>
        ${bodyContent}
      </div></body></html>`;
  };

  const handleDownloadDocument = async (format: 'word' | 'excel' | 'pdf') => {
    if (!selectedDoc) return;

    if (format === 'word') {
      const html = buildPrintableDocumentHtml(selectedDoc);
      downloadBlob(new Blob(['﻿', html], { type: 'application/msword;charset=utf-8' }), `${selectedDoc.code}_${selectedDoc.title}.doc`);
      toast.success('Da tai tai lieu Word');
      return;
    }

    if (format === 'pdf') {
      const { default: jsPDF } = await import('jspdf');
      await import('jspdf-autotable');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const left = 18;
      const top = 18;
      const tableWidth = pageWidth - left * 2;
      const logoWidth = 38;
      const metaWidth = 42;
      const titleWidth = tableWidth - logoWidth - metaWidth;

      pdf.setDrawColor(40);
      pdf.rect(left, top, logoWidth, 28);
      pdf.rect(left + logoWidth, top, titleWidth, 28);
      pdf.rect(left + logoWidth + titleWidth, top, metaWidth, 14);
      pdf.rect(left + logoWidth + titleWidth, top + 14, metaWidth, 14);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(18);
      pdf.text('FLY', left + logoWidth / 2, top + 12, { align: 'center' });
      pdf.setFontSize(7);
      pdf.text('FLYING SHIPPING', left + logoWidth / 2, top + 20, { align: 'center' });
      pdf.text('COMPANY', left + logoWidth / 2, top + 24, { align: 'center' });

      pdf.setFontSize(15);
      pdf.text(selectedDoc.title.toUpperCase(), left + logoWidth + titleWidth / 2, top + 12, {
        align: 'center',
        maxWidth: titleWidth - 8,
      });
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(10);
      pdf.text(selectedDoc.category === 'CHECKLIST' ? 'CHECKLIST TEMPLATE' : 'CONTROLLED DOCUMENT', left + logoWidth + titleWidth / 2, top + 21, {
        align: 'center',
      });

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.text(`Flying ${selectedDoc.category === 'CHECKLIST' ? 'Checklist' : 'Manual'}`, left + logoWidth + titleWidth + metaWidth - 3, top + 6, { align: 'right' });
      pdf.text(selectedDoc.code, left + logoWidth + titleWidth + metaWidth - 3, top + 11, { align: 'right' });
      pdf.text(`Revision: ${selectedDoc.currentVersion.replace(/^Rev\s*/i, '')}`, left + logoWidth + titleWidth + metaWidth - 3, top + 20, { align: 'right' });
      pdf.text(`Date: ${selectedDoc.lastModified}`, left + logoWidth + titleWidth + metaWidth - 3, top + 25, { align: 'right' });

      const template = selectedDoc.category === 'CHECKLIST' ? parseChecklistTemplate(selectedDoc.content) : null;
      if (template) {
        const body: any[] = [];
        template.sections.forEach((section, sectionIndex) => {
          body.push([{ content: `${sectionIndex + 1}. ${section.title}`, colSpan: 5, styles: { fontStyle: 'bold', fillColor: [245, 245, 245] } }]);
          section.questions.forEach((question, questionIndex) => {
            body.push([`${sectionIndex + 1}.${questionIndex + 1}`, question.text, '', '', '']);
          });
        });
        (pdf as any).autoTable({
          startY: top + 36,
          head: [['No.', 'Description', 'Yes', 'No', 'Remarks']],
          body,
          theme: 'grid',
          styles: { font: 'helvetica', fontSize: 8, lineColor: [0, 0, 0], lineWidth: 0.2, cellPadding: 2 },
          headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], halign: 'center', fontStyle: 'bold' },
          columnStyles: {
            0: { cellWidth: 12, halign: 'center' },
            1: { cellWidth: 100 },
            2: { cellWidth: 14, halign: 'center' },
            3: { cellWidth: 14, halign: 'center' },
            4: { cellWidth: 32 },
          },
        });
      } else {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.text(selectedDoc.content.replace(/<[^>]*>/g, ' '), left, top + 40, { maxWidth: tableWidth });
      }
      pdf.save(`${selectedDoc.code}_${selectedDoc.title}.pdf`);
      toast.success('Đã tải tài liệu PDF');
      return;
    }

    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Checklist');
    sheet.columns = [{ width: 8 }, { width: 62 }, { width: 10 }, { width: 10 }, { width: 24 }];
    sheet.mergeCells('A1:B3');
    sheet.getCell('A1').value = 'FLYING SHIPPING\nCOMPANY';
    sheet.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    sheet.mergeCells('C1:D3');
    sheet.getCell('C1').value = selectedDoc.title.toUpperCase();
    sheet.getCell('C1').font = { bold: true, size: 14 };
    sheet.getCell('C1').alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    sheet.getCell('E1').value = `Flying ${selectedDoc.category === 'CHECKLIST' ? 'Checklist' : 'Manual'}\n${selectedDoc.code}`;
    sheet.getCell('E2').value = `Revision: ${selectedDoc.currentVersion.replace(/^Rev\s*/i, '')}`;
    sheet.getCell('E3').value = `Date: ${selectedDoc.lastModified}`;

    const template = selectedDoc.category === 'CHECKLIST' ? parseChecklistTemplate(selectedDoc.content) : null;
    let rowIndex = 5;
    if (template) {
      sheet.addRow(['No.', 'Description', 'Yes', 'No', 'Remarks']);
      sheet.getRow(rowIndex).font = { bold: true };
      rowIndex += 1;
      template.sections.forEach((section, sectionIndex) => {
        sheet.mergeCells(`A${rowIndex}:E${rowIndex}`);
        sheet.getCell(`A${rowIndex}`).value = `${sectionIndex + 1}. ${section.title}`;
        sheet.getCell(`A${rowIndex}`).font = { bold: true };
        rowIndex += 1;
        section.questions.forEach((question, questionIndex) => {
          sheet.addRow([`${sectionIndex + 1}.${questionIndex + 1}`, question.text, '', '', '']);
          rowIndex += 1;
        });
      });
    } else {
      sheet.mergeCells(`A${rowIndex}:E${rowIndex}`);
      sheet.getCell(`A${rowIndex}`).value = selectedDoc.content.replace(/<[^>]*>/g, ' ');
      sheet.getCell(`A${rowIndex}`).alignment = { wrapText: true };
    }

    sheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        cell.alignment = { vertical: 'middle', wrapText: true };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${selectedDoc.code}_${selectedDoc.title}.xlsx`);
    toast.success('Da tai tai lieu Excel');
  };
  const handleRestoreVersion = async (version: DocChapterVersion) => {
    if (!selectedDoc) return;
    toast(`Bạn có chắc chắn muốn khôi phục tài liệu về phiên bản ${version.version}?`, {
      action: {
        label: 'Khôi phục',
        onClick: async () => {
          try {
            await documentService.updateDocument(selectedDoc.id, {
              content: version.content,
              changeSummary: `Khôi phục về phiên bản ${version.version}`,
              changedBy: currentAuthorString
            });
            toast.success(`Đã khôi phục về phiên bản ${version.version} thành công!`);
            await fetchDocuments();
          } catch {
            toast.error('Không thể khôi phục phiên bản');
          }
        }
      }
    });
  };

  const handlePrintDocument = () => {
    if (!selectedDoc) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Khong the mo cua so in');
      return;
    }
    const htmlContent = buildPrintableDocumentHtml(selectedDoc).replace('</body>', '<script>window.onload=function(){setTimeout(function(){window.print()},500)}</script></body>');
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };
  const handleStartEditing = () => {
    if (selectedDoc) {
      setEditContent(selectedDoc.content);
      setEditTitle(selectedDoc.title);
      setEditWatermark(selectedDoc.watermarkText || (selectedDocIsImportedWord ? '' : 'TÀI LIỆU ĐƯỢC KIỂM SOÁT'));
      setIsEditing(!selectedDocUsesSpecialPreview);
      setActiveTab('document');
    }
  };

  const handleCancelEditing = () => {
    setIsEditing(false);
    setFinishWriting(false);
    setEditChangeSummary('');
    if (selectedDoc) {
      setEditTitle(selectedDoc.title);
      setEditWatermark(selectedDoc.watermarkText || (selectedDocIsImportedWord ? '' : 'TÀI LIỆU ĐƯỢC KIỂM SOÁT'));
    }
  };

  const getNextDocumentCode = (category: DocCategory) => {
    const prefixByCategory: Record<DocCategory, string> = {
      PROCEDURE: 'QP',
      FORM: 'FM',
      SMS_HANDBOOK: 'SMS',
      EXTERNAL: 'EXT',
      MANUAL: 'MAN',
      CHECKLIST: 'CL',
    };
    const prefix = prefixByCategory[category];
    const count = documents.filter(d => d.code.startsWith(`${prefix}-`)).length + 1;
    return `${prefix}-${count.toString().padStart(2, '0')}`;
  };

  const openCreateModal = (parentCode?: string, categoryOverride: DocCategory = 'PROCEDURE') => {
    if (categoryOverride === 'CHECKLIST') {
      setCreateDefaultCode(getNextDocumentCode('CHECKLIST'));
      setCreateDefaultCategory('CHECKLIST');
      setChecklistModalOpen(true);
      return;
    }

    if (parentCode) {
      const children = documents.filter(d => d.code.startsWith(parentCode + '-'));
      const nextIdx = children.length + 1;
      setCreateDefaultCode(`${parentCode}-${nextIdx < 10 ? '0' + nextIdx : nextIdx}`);
      setCreateDefaultCategory(categoryOverride);
    } else {
      setCreateDefaultCode(getNextDocumentCode(categoryOverride));
      setCreateDefaultCategory(categoryOverride);
    }
    setCreateModalOpen(true);
  };

  // Tab Config
  const tabs: { key: TabType; label: string; icon: React.ReactNode }[] = [
    { key: 'data', label: 'Data', icon: <Database className="w-3.5 h-3.5" /> },
    { key: 'document', label: 'Document', icon: <FileText className="w-3.5 h-3.5" /> },
    { key: 'attachments', label: 'Attached Documents', icon: <Paperclip className="w-3.5 h-3.5" /> },
    { key: 'readLogs', label: 'Read Logs', icon: <BookOpen className="w-3.5 h-3.5" /> },
    { key: 'versions', label: 'Chapter Versions', icon: <GitBranch className="w-3.5 h-3.5" /> },
    { key: 'history', label: 'History', icon: <History className="w-3.5 h-3.5" /> },
  ];

  // Loading State
  if (loading) {
    return (
      <div className="w-full h-[700px] flex flex-col items-center justify-center text-slate-500 dark:text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mb-2" />
        <span className="text-sm font-semibold">Đang tải Document Library...</span>
      </div>
    );
  }

  // Empty State
  if (false && documents.length === 0) {
    return (
      <div className="w-full min-h-[500px] flex flex-col items-center justify-center p-8 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-full text-blue-600 dark:text-blue-400 mb-4 animate-pulse">
          <BookOpenIcon className="w-12 h-12" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Document Library tr?ng</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md text-center mb-6">
          SMS Library chưa chứa tài liệu nào. Hãy khởi tạo dữ liệu mẫu hoặc tạo tài liệu đầu tiên.
        </p>
        <div className="flex flex-wrap gap-4 justify-center">
          <PermissionGate permission="hsqe.create"><button
            onClick={handleSeedData}
            disabled={isSeeding}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            {isSeeding ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Khởi tạo dữ liệu mẫu
          </button></PermissionGate>
          <PermissionGate permission="hsqe.create"><button
            onClick={() => openCreateModal()}
            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-xl font-semibold transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Tạo tài liệu đầu tiên
          </button></PermissionGate>
        </div>

        <CreateDocumentModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onCreate={handleCreateDocument}
          defaultCode={createDefaultCode}
          defaultCategory={createDefaultCategory}
          currentUserName={currentAuthorString}
        />
      </div>
    );
  }

  // Main Layout
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-y border-slate-200 bg-white shadow-none dark:border-slate-700 dark:bg-slate-800">
      {/* Top Header Bar */}
      <div className="hidden items-center justify-between px-4 py-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Company:</span>
          <select className="text-xs border border-slate-200 dark:border-slate-700 rounded-none px-2 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            <option>Flying Shipping</option>
          </select>

          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 ml-3">Location:</span>
          <select className="text-xs border border-slate-200 dark:border-slate-700 rounded-none px-2 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            <option>Marpesia V</option>
          </select>

          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 ml-3">Status:</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-xs border border-slate-200 dark:border-slate-700 rounded-none px-2 py-1 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 outline-none"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="Published">Published</option>
            <option value="Draft">Draft</option>
            <option value="Pending_DPA">Pending DPA</option>
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-medium">{currentUserName}</span>
          <span className="text-slate-300 dark:text-slate-600">|</span>
          <span>{currentUserTitle}</span>
        </div>
      </div>

      {/* Main Content: Sidebar + Tabs */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        {!readMode && (
          <div className="w-[260px] flex-shrink-0 border-r border-slate-200 dark:border-slate-700 transition-all duration-300 animate-in slide-in-from-left">
            <DocumentSidebar
              documents={documents}
              selectedDocId={selectedDocId}
              selectedDocumentIds={selectedDocumentIds}
              onSelectDocument={(id) => {
                setSelectedDocId(id);
                setIsEditing(false);
              }}
              onToggleDocumentSelection={handleToggleDocumentSelection}
              onBulkDelete={() => setBulkDeleteConfirmOpen(true)}
              onCreateDocument={(parentCode, category) => openCreateModal(parentCode, category)}
              onImportDocument={() => setImportModalOpen(true)}
            />
          </div>
        )}

        {/* Right Panel: Tabs + Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab Bar */}
          <div className="flex items-center bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold transition-all border-b-2 ${
                  activeTab === tab.key
                    ? 'border-blue-600 dark:border-blue-400 text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}

            {/* Action buttons on right side of tab bar */}
            <div className="ml-auto flex items-center gap-1.5 pr-3">
              {!isEditing && selectedDoc && !selectedDocUsesSpecialPreview && (
                <PermissionGate permission="hsqe.update"><button
                  onClick={handleStartEditing}
                  className="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition flex items-center gap-1"
                >
                  <FileText className="w-3 h-3" /> Edit
                </button></PermissionGate>
              )}
            </div>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {selectedDoc ? (
              <>
                {activeTab === 'data' && (
                  <DataTab
                    document={{
                      ...selectedDoc,
                      title: isEditing ? editTitle : selectedDoc.title,
                    }}
                    isEditing={isEditing}
                    onFieldChange={(field, value) => {
                      if (field === 'title') {
                        setEditTitle(value);
                      }
                    }}
                  />
                )}
                {activeTab === 'document' && (
                  <DocumentTab
                    document={{
                      ...selectedDoc,
                      title: isEditing ? editTitle : selectedDoc.title,
                      watermarkText: isEditing ? editWatermark : selectedDoc.watermarkText,
                    }}
                    isEditing={isEditing}
                    editContent={editContent}
                    onContentChange={setEditContent}
                    onSave={handleSaveDocument}
                    onPrint={handlePrintDocument}
                    onCreateNew={() => openCreateModal()}
                    onDownload={handleDownloadDocument}
                    orientation={orientation}
                    onOrientationChange={setOrientation}
                    margins={margins}
                    onMarginsChange={setMargins}
                    showRuler={showRuler}
                    onShowRulerChange={setShowRuler}
                    zoom={zoom}
                    onZoomChange={setZoom}
                    readMode={readMode}
                    onReadModeChange={setReadMode}
                    watermarkText={isEditing ? editWatermark : (selectedDoc.watermarkText || '')}
                    onWatermarkChange={setEditWatermark}
                  />
                )}
                {activeTab === 'attachments' && (
                  <AttachedDocumentsTab
                    attachments={attachments}
                    onUpload={handleUploadAttachment}
                    onDelete={handleDeleteAttachment}
                    isEditing={isEditing}
                  />
                )}
                {activeTab === 'readLogs' && (
                  <ReadLogsTab
                    readLogs={readLogs}
                    documentTitle={selectedDoc.title}
                    onMarkAsRead={handleMarkAsRead}
                    currentUserName={currentUserName}
                  />
                )}
                {activeTab === 'versions' && (
                  <ChapterVersionsTab
                    versions={selectedDoc.revisions}
                    currentVersion={selectedDoc.currentVersion}
                    documentTitle={selectedDoc.title}
                    onRestoreVersion={handleRestoreVersion}
                  />
                )}
                {activeTab === 'history' && (
                  <HistoryTab
                    history={historyEntries}
                    revisions={selectedDoc.revisions}
                    documentCode={selectedDoc.code}
                  />
                )}
              </>
            ) : (
              <div className="h-full flex items-center justify-center text-slate-400 dark:text-slate-500">
                <p className="text-sm">Chọn tài liệu từ sidebar để xem nội dung</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Bar: Finish Writing / Approve / Release Version */}
      <div className="sticky bottom-0 z-20 flex flex-shrink-0 items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-700 dark:bg-slate-900/80">
        <div className="flex items-center gap-6">
          {/* Finish Writing Checkbox */}
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={finishWriting}
              onChange={(e) => setFinishWriting(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
              disabled={!isEditing}
            />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Finish Writing</span>
          </label>

          {/* Approve Checkbox/Button */}
          <PermissionGate permission="hsqe.update"><label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selectedDoc?.status === 'Pending_DPA' || selectedDoc?.status === 'Published'}
              onChange={() => {
                if (selectedDoc?.status === 'Draft') handleSubmitForReview();
              }}
              disabled={selectedDoc?.status !== 'Draft'}
              className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
            />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Approve</span>
          </label></PermissionGate>

          {/* Release Version */}
          <PermissionGate permission="hsqe.approve"><label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={selectedDoc?.status === 'Published'}
              onChange={() => {
                if (selectedDoc?.status === 'Pending_DPA') setApproveModalOpen(true);
              }}
              disabled={selectedDoc?.status !== 'Pending_DPA'}
              className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
            />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Release Version</span>
          </label></PermissionGate>
        </div>

        {/* Save / Cancel Buttons */}
        <div className="flex items-center gap-2">
          {isEditing && (
            <>
              {/* Change Summary Input */}
              <input
                type="text"
                value={editChangeSummary}
                onChange={(e) => setEditChangeSummary(e.target.value)}
                placeholder="Tóm tắt nội dung thay đổi..."
                className="px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 w-64 outline-none focus:ring-1 focus:ring-blue-500"
              />
            </>
          )}

          <PermissionGate permission="hsqe.update"><button
            onClick={isEditing ? handleSaveDocument : handleStartEditing}
            disabled={selectedDocUsesSpecialPreview && !isEditing}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition shadow-sm"
          >
            <Save className="w-3.5 h-3.5" /> Save
          </button></PermissionGate>
          <button
            onClick={isEditing ? handleCancelEditing : undefined}
            disabled={!isEditing}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg transition disabled:opacity-40"
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </button>
        </div>
      </div>

      {/* Modals */}
      <CreateDocumentModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onCreate={handleCreateDocument}
        defaultCode={createDefaultCode}
        defaultCategory={createDefaultCategory}
        currentUserName={currentAuthorString}
      />
      <ChecklistTemplateModal
        isOpen={checklistModalOpen}
        onClose={() => setChecklistModalOpen(false)}
        onCreate={handleCreateDocument}
        defaultCode={createDefaultCode}
        currentUserName={currentAuthorString}
      />
      <ImportDocumentModal
        isOpen={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        onImport={handleImportDocument}
        defaultCode={getNextDocumentCode('EXTERNAL')}
        documents={documents}
      />
      <BulkDeleteConfirmModal
        isOpen={bulkDeleteConfirmOpen}
        count={selectedDocumentIds.length}
        onClose={() => setBulkDeleteConfirmOpen(false)}
        onConfirm={handleBulkDeleteDocuments}
      />
      <ApproveModal
        isOpen={approveModalOpen}
        onClose={() => setApproveModalOpen(false)}
        onApprove={handleApprove}
        docCode={selectedDoc?.code || ''}
        defaultApprover={currentAuthorString}
      />
    </div>
  );
}
