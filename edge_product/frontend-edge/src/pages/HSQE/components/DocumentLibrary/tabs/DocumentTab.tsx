import { PermissionGate } from '@/components/auth/PermissionGate'
/**
 * Document Tab - Rich Text Editor with Word-like Ribbon
 * Main document editing/viewing area following the reference screenshot
 */
import { useEffect, useRef, useState } from 'react';
import {
  FilePlus, FolderOpen, Save, Download, Printer,
  Scissors, Copy, Clipboard, Table, CheckSquare,
  Minus, Image, Compass, Shield, BookOpen,
  Ruler, ZoomIn, ZoomOut, Eye, EyeOff,
  Type, Bold, Italic, Underline as UnderlineIcon,
  Strikethrough, Highlighter, AlignLeft, AlignCenter,
  AlignRight, AlignJustify, List, ListOrdered, Quote, Undo2, Redo2
} from 'lucide-react';
import { toast } from 'sonner';
import { renderAsync } from 'docx-preview';
import { RichTextEditor, RichContentViewer } from '@/components/editor/RichTextEditor';
import { useTranslationSafe } from '@/contexts/I18nContext';
import type { DocTreeNode } from '../types';

interface DocumentTabProps {
  document: DocTreeNode;
  isEditing: boolean;
  editContent: string;
  onContentChange: (html: string) => void;
  onSave: () => void;
  onPrint: () => void;
  onCreateNew?: () => void;
  onDownload?: (format: 'word' | 'excel' | 'pdf') => void;

  // Layout & View states
  orientation: 'portrait' | 'landscape';
  onOrientationChange: (orientation: 'portrait' | 'landscape') => void;
  margins: 'normal' | 'narrow' | 'wide';
  onMarginsChange: (margins: 'normal' | 'narrow' | 'wide') => void;
  showRuler: boolean;
  onShowRulerChange: (show: boolean) => void;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  readMode: boolean;
  onReadModeChange: (readMode: boolean) => void;
  watermarkText: string;
  onWatermarkChange: (watermark: string) => void;
}

type RibbonTab = 'File' | 'Home' | 'Insert' | 'Page Layout' | 'References' | 'View';
const ribbonTabLabelKey: Record<RibbonTab, string> = {
  File: 'file',
  Home: 'home',
  Insert: 'insert',
  'Page Layout': 'pageLayout',
  References: 'references',
  View: 'view',
};

type ChecklistQuestion = {
  id: string;
  code?: string;
  text: string;
  answerType: 'date' | 'select' | 'slider' | 'text';
  mandatory: boolean;
  options?: string[];
  min?: number;
  max?: number;
};

type ChecklistSection = {
  id: string;
  title: string;
  questions: ChecklistQuestion[];
};

type ChecklistTemplate = {
  type: 'checklist-template';
  name: string;
  sections: ChecklistSection[];
};

type ImportedDocxPayload = {
  fileName: string;
  base64: string;
};

const parseImportedDocxPayload = (html: string): ImportedDocxPayload | null => {
  if (!html.includes('data-docx-preview="true"')) return null;
  const match = html.match(/<script type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as ImportedDocxPayload;
    return parsed.base64 ? parsed : null;
  } catch {
    return null;
  }
};

const base64ToArrayBuffer = (base64: string) => {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

function ImportedDocxPreview({ payload }: { payload: ImportedDocxPayload }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const styleRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const styleContainer = styleRef.current;
    if (!container || !styleContainer) return;

    container.innerHTML = '';
    styleContainer.innerHTML = '';
    const blob = new Blob([base64ToArrayBuffer(payload.base64)], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });

    renderAsync(blob, container, styleContainer, {
      className: 'docx-preview',
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      renderComments: true,
      renderAltChunks: true,
      useBase64URL: true,
    }).catch(() => {
      container.innerHTML = '<div style="padding:24px;color:#b91c1c;font-weight:600">Không thể render file DOCX.</div>';
    });
  }, [payload.base64]);

  return (
    <div className="hsqe-docx-preview w-full">
      <style>
        {`
          .hsqe-docx-preview .docx-wrapper {
            background: transparent !important;
            padding: 0 !important;
            box-shadow: none !important;
          }

          .hsqe-docx-preview .docx {
            margin: 0 auto !important;
            box-shadow: 0 16px 36px rgba(15, 23, 42, 0.18) !important;
          }

          .hsqe-docx-preview .docx,
          .hsqe-docx-preview .docx * {
            font-family: "Times New Roman", "Times", Arial, sans-serif !important;
          }
        `}
      </style>
      <div ref={styleRef} />
      <div ref={containerRef} className="docx-preview-container" />
    </div>
  );
}

const parseChecklistTemplate = (html: string): ChecklistTemplate | null => {
  const match = html.match(/<script type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[1]) as ChecklistTemplate;
    if (parsed.type !== 'checklist-template' || !Array.isArray(parsed.sections)) return null;
    return parsed;
  } catch {
    return null;
  }
};

function ChecklistTemplatePreview({ template }: { template: ChecklistTemplate }) {
  const [values, setValues] = useState<Record<string, string | number | boolean>>(() => {
    const initial: Record<string, string | number | boolean> = {};
    template.sections.forEach(section => {
      section.questions.forEach(question => {
        if (question.answerType === 'date') initial[question.id] = new Date().toISOString().slice(0, 10);
        else if (question.answerType === 'slider') initial[question.id] = question.min ?? 1;
        else if (question.answerType === 'select') initial[question.id] = question.options?.[0] ?? '';
        else initial[question.id] = '';
      });
    });
    return initial;
  });
  const setValue = (questionId: string, value: string | number | boolean) => {
    setValues(prev => ({ ...prev, [questionId]: value }));
  };

  const renderAnswerControl = (question: ChecklistQuestion) => {
    const value = values[question.id];
    const baseInputClass = 'w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';

    if (question.answerType === 'date') {
      return (
        <input
          type="date"
          value={String(value || '')}
          onChange={(e) => setValue(question.id, e.target.value)}
          className={baseInputClass}
        />
      );
    }

    if (question.answerType === 'select') {
      return (
        <select
          value={String(value || '')}
          onChange={(e) => setValue(question.id, e.target.value)}
          className={baseInputClass}
        >
          {(question.options?.length ? question.options : ['']).filter(Boolean).map(option => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      );
    }

    if (question.answerType === 'slider') {
      const min = question.min ?? 1;
      const max = question.max ?? 10;
      const sliderValue = Number(value ?? min);
      return (
        <div className="flex items-center gap-3">
          <span className="w-6 text-xs font-semibold text-slate-500">{min}</span>
          <input
            type="range"
            min={min}
            max={max}
            value={sliderValue}
            onChange={(e) => setValue(question.id, Number(e.target.value))}
            className="h-2 flex-1 accent-blue-600"
          />
          <span className="w-6 text-xs font-semibold text-slate-500">{max}</span>
          <span className="w-10 rounded bg-slate-100 px-2 py-1 text-center text-sm font-bold text-slate-800 dark:bg-slate-800 dark:text-slate-100">
            {sliderValue}
          </span>
        </div>
      );
    }

    return (
      <input
        type="text"
        value={String(value || '')}
        onChange={(e) => setValue(question.id, e.target.value)}
        className={baseInputClass}
        placeholder="Enter value"
      />
    );
  };

  return (
    <div className="mx-auto w-full max-w-[820px] rounded border border-slate-200 bg-white text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
      <div className="border-b border-slate-200 px-6 py-4 dark:border-slate-700">
        <h2 className="text-xl font-bold uppercase tracking-normal">{template.name}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Checklist template preview</p>
      </div>

      <div className="space-y-7 p-6">
        {template.sections.map((section, sectionIndex) => (
          <section key={section.id}>
            <h3 className="mb-3 border-b border-slate-200 pb-2 text-sm font-bold uppercase text-slate-700 dark:border-slate-700 dark:text-slate-200">
              {sectionIndex + 1}. {section.title}
            </h3>
            <div className="space-y-5">
              {section.questions.map((question) => (
                <div key={question.id} className="rounded border border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-950/30">
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {question.text}
                      {question.mandatory && <span className="ml-1 text-red-500">*</span>}
                    </span>
                    <div className="w-full">
                      {renderAnswerControl(question)}
                    </div>
                    {question.code && (
                      <span className="mt-1.5 block text-xs text-slate-400">Code: {question.code}</span>
                    )}
                  </label>
                </div>
              ))}
            </div>
          </section>
        ))}

      </div>
    </div>
  );
}

export function DocumentTab({
  document,
  isEditing,
  editContent,
  onContentChange,
  onSave,
  onPrint,
  onCreateNew,
  onDownload,
  orientation,
  onOrientationChange,
  margins,
  onMarginsChange,
  showRuler,
  onShowRulerChange,
  zoom,
  onZoomChange,
  readMode,
  onReadModeChange,
  watermarkText,
  onWatermarkChange,
}: DocumentTabProps) {
  const { t } = useTranslationSafe();
  const [activeRibbonTab, setActiveRibbonTab] = useState<RibbonTab>('Home');
  const [editorInstance, setEditorInstance] = useState<any>(null);
  const [fontFamily, setFontFamily] = useState<string>('font-sans');
  const [fontSize, setFontSize] = useState<string>('text-sm');
  const [downloadMenuOpen, setDownloadMenuOpen] = useState(false);
  const checklistTemplate = document.category === 'CHECKLIST'
    ? parseChecklistTemplate(document.content)
    : null;
  const importedDocxPayload = parseImportedDocxPayload(document.content);
  const isImportedWordDocument = Boolean(importedDocxPayload) || document.content.includes('data-imported-word-document="true"');

  // Trigger command on editor if editing is enabled
  const runCommand = (command: (editor: any) => void) => {
    if (!isEditing) {
      toast.info(t('hsqeDocumentRibbon.toast.enableEdit'));
      return;
    }
    if (!editorInstance) {
      toast.error(t('hsqeDocumentRibbon.toast.editorNotReady'));
      return;
    }
    editorInstance.commands.focus();
    command(editorInstance);
  };

  const isCommandActive = (name: string | Record<string, any>, attributes?: any) => {
    if (!editorInstance || !isEditing) return false;
    return editorInstance.isActive(name, attributes);
  };

  // Clipboard actions
  const handleCopy = () => {
    const textToCopy = isEditing && editorInstance ? editorInstance.getHTML() : document.content;
    navigator.clipboard.writeText(textToCopy);
    toast.success(t('hsqeDocumentRibbon.toast.copied'));
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      runCommand((editor) => {
        editor.chain().focus().insertContent(`<p>${text}</p>`).run();
        toast.success(t('hsqeDocumentRibbon.toast.pasted'));
      });
    } catch {
      toast.error(t('hsqeDocumentRibbon.toast.clipboardUnavailable'));
    }
  };

  // Insertion handlers
  const handleInsertTable = () => {
    const tableHtml = `
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; margin: 16px 0; font-size: 13px;">
        <thead>
          <tr style="background-color: #f8fafc; border-bottom: 2px solid #cbd5e1;">
            <th style="border: 1px solid #cbd5e1; padding: 10px; font-weight: bold; text-align: left;">Mục kiểm tra</th>
            <th style="border: 1px solid #cbd5e1; padding: 10px; font-weight: bold; text-align: left; width: 150px;">Trạng thái</th>
            <th style="border: 1px solid #cbd5e1; padding: 10px; font-weight: bold; text-align: left;">Ghi chú chi tiết</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border: 1px solid #cbd5e1; padding: 10px;">1. Thiết bị cứu sinh / cứu hỏa</td>
            <td style="border: 1px solid #cbd5e1; padding: 10px; color: #16a34a; font-weight: 500;">Sẵn sàng</td>
            <td style="border: 1px solid #cbd5e1; padding: 10px;">Đầy đủ kiểm định năm 2026</td>
          </tr>
          <tr>
            <td style="border: 1px solid #cbd5e1; padding: 10px;">2. Hệ thống báo cháy và báo động khẩn cấp</td>
            <td style="border: 1px solid #cbd5e1; padding: 10px; color: #16a34a; font-weight: 500;">Hoạt động tốt</td>
            <td style="border: 1px solid #cbd5e1; padding: 10px;">Đã test hoạt động hoàn hảo</td>
          </tr>
        </tbody>
      </table>
    `;
    runCommand((editor) => {
      editor.chain().focus().insertContent(tableHtml).run();
      toast.success(t('hsqeDocumentRibbon.toast.insertedTable'));
    });
  };

  const handleInsertChecklist = () => {
    const checklistHtml = `
      <div style="margin: 16px 0; padding: 16px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #fafafa;">
        <h4 style="color: #1e3a8a; font-weight: bold; margin-top: 0; margin-bottom: 12px; font-size: 14px;">BẢNG KIỂM TRA PHÒNG NGỪA RỦI RO</h4>
        <ul style="list-style-type: none; padding-left: 0; margin: 0; font-size: 13px; line-height: 2;">
          <li>[x] Đã ngắt nguồn điện chính khi bảo dưỡng</li>
          <li>[ ] Đã đặt biển cảnh báo "Đang làm việc trên cao"</li>
          <li>[ ] Trang bị đầy đủ dây đai an toàn và mũ bảo hộ</li>
        </ul>
      </div>
    `;
    runCommand((editor) => {
      editor.chain().focus().insertContent(checklistHtml).run();
      toast.success(t('hsqeDocumentRibbon.toast.insertedChecklist'));
    });
  };

  const handleInsertPageBreak = () => {
    const pageBreakHtml = `
      <div style="page-break-after: always; border-bottom: 2px dashed #3b82f6; margin: 32px 0; text-align: center; font-size: 11px; color: #3b82f6; font-weight: bold; user-select: none; padding: 4px;">
        [ NGẮT TRANG IN ]
      </div>
    `;
    runCommand((editor) => {
      editor.chain().focus().insertContent(pageBreakHtml).run();
      toast.success(t('hsqeDocumentRibbon.toast.insertedPageBreak'));
    });
  };

  const handleInsertLogo = () => {
    const logoHtml = `
      <div style="text-align: center; margin: 20px 0; border: 1px double #1e40af; padding: 12px; border-radius: 6px; display: inline-block;">
        <div style="font-size: 18px; font-weight: 800; color: #1e40af; letter-spacing: 2px; text-transform: uppercase;">
          FLYING SHIPPING COMPANY
        </div>
        <div style="font-size: 9px; color: #475569; margin-top: 4px; letter-spacing: 1px;">
          SAFETY MANAGEMENT SYSTEM (SMS) MANUAL
        </div>
      </div>
    `;
    runCommand((editor) => {
      editor.chain().focus().insertContent(logoHtml).run();
      toast.success(t('hsqeDocumentRibbon.toast.insertedLogo'));
    });
  };

  const handleGenerateTOC = () => {
    const htmlToParse = isEditing && editorInstance ? editorInstance.getHTML() : document.content;
    const tempDiv = window.document.createElement('div');
    tempDiv.innerHTML = htmlToParse;
    const headings = tempDiv.querySelectorAll('h1, h2, h3');
    if (headings.length === 0) {
      toast.warning(t('hsqeDocumentRibbon.toast.noHeadings'));
      return;
    }

    let tocHtml = `
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin: 20px 0; font-size: 13px;">
        <h4 style="margin-top: 0; color: #1e40af; font-weight: bold; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px;">MỤC LỤC TỰ ĐỘNG</h4>
        <ul style="list-style-type: none; padding-left: 0; margin-bottom: 0;">
    `;
    headings.forEach((h) => {
      const text = h.textContent || '';
      const tag = h.tagName.toLowerCase();
      const pad = tag === 'h1' ? '0' : tag === 'h2' ? '16px' : '32px';
      const weight = tag === 'h1' ? 'bold' : 'normal';
      tocHtml += `<li style="padding-left: ${pad}; font-weight: ${weight}; margin-bottom: 6px;">
        <span style="color: #64748b; margin-right: 4px;">-</span> ${text}
      </li>`;
    });
    tocHtml += `</ul></div>`;

    runCommand((editor) => {
      editor.chain().focus().insertContentAt(0, tocHtml).run();
      toast.success(t('hsqeDocumentRibbon.toast.insertedToc'));
    });
  };

  const handleInsertFootnote = () => {
    const footnoteHtml = `
      <div style="margin-top: 40px; border-top: 1px solid #cbd5e1; padding-top: 10px; font-size: 11px; color: #64748b;">
        <p><strong>Ghi chú hàng hải:</strong></p>
        <p>[1] Tham chiếu ISM Code Mục 8 - Chuẩn bị ứng phó tình huống khẩn cấp trên tàu.</p>
        <p>[2] Tuân thủ các quy định phòng ngừa ô nhiễm môi trường biển theo MARPOL 73/78.</p>
      </div>
    `;
    runCommand((editor) => {
      editor.chain().focus().insertContent(footnoteHtml).run();
      toast.success(t('hsqeDocumentRibbon.toast.insertedFootnote'));
    });
  };

  const ribbonTabs: RibbonTab[] = ['File', 'Home', 'Insert', 'Page Layout', 'References', 'View'];

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-800">
      {/* Ribbon Tab Bar */}
      <div className="flex items-center bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
        {ribbonTabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveRibbonTab(tab)}
            className={`px-4 py-2 text-xs font-semibold transition-all border-b-2 ${
              activeRibbonTab === tab
                ? 'bg-white dark:bg-slate-800 text-blue-600 dark:text-blue-400 border-b-blue-600 dark:border-b-blue-400'
                : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
            }`}
          >
            {t(`hsqeDocumentRibbon.tabs.${ribbonTabLabelKey[tab]}`)}
          </button>
        ))}
      </div>

      {/* Ribbon Action Bar */}
      <div className="flex flex-wrap items-center gap-1 px-4 py-2 bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 flex-shrink-0 min-h-[46px]">
        {/* FILE TAB ACTIONS */}
        {activeRibbonTab === 'File' && (
          <div className="flex items-center gap-1">
            <PermissionGate permission={'hsqe.create'}><button
              onClick={onCreateNew}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition font-medium"
            >
              <FilePlus className="w-3.5 h-3.5 text-blue-500" /> {t('hsqeDocumentRibbon.new')}
            </button></PermissionGate>
            <button
              onClick={() => toast.info(t('hsqeDocumentRibbon.openFromTree'))}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition font-medium"
            >
              <FolderOpen className="w-3.5 h-3.5 text-amber-500" /> {t('hsqeDocumentRibbon.open')}
            </button>
            <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1.5" />
            <PermissionGate permission={'hsqe.update'}><button
              onClick={onSave}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition font-medium"
            >
              <Save className="w-3.5 h-3.5 text-green-500" /> {t('hsqeDocumentRibbon.save')}
            </button></PermissionGate>
            <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1.5" />
            <div className="relative">
              <button
                onClick={() => setDownloadMenuOpen(prev => !prev)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition font-medium"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" /> {t('hsqeDocumentRibbon.download')}
                <span className="text-xs text-slate-400">v</span>
              </button>
              {downloadMenuOpen && (
                <div className="absolute left-0 top-full z-50 mt-1 w-32 rounded border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                  <button
                    onClick={() => { onDownload?.('word'); setDownloadMenuOpen(false); }}
                    className="block w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    Word
                  </button>
                  <button
                    onClick={() => { onDownload?.('excel'); setDownloadMenuOpen(false); }}
                    className="block w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    Excel
                  </button>
                  <button
                    onClick={() => { onDownload?.('pdf'); setDownloadMenuOpen(false); }}
                    className="block w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    PDF
                  </button>
                </div>
              )}
            </div>
            <button
              onClick={onPrint}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition font-medium"
            >
              <Printer className="w-3.5 h-3.5 text-purple-500" /> {t('hsqeDocumentRibbon.print')}
            </button>
          </div>
        )}
        {/* HOME TAB ACTIONS */}
        {activeRibbonTab === 'Home' && (
          <div className="flex items-center gap-1 flex-wrap">
            {/* Clipboard group */}
            <div className="flex items-center bg-slate-200/50 dark:bg-slate-800 px-1.5 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => {
                  handleCopy();
                  if (isEditing && editorInstance) {
                    editorInstance.commands.setContent('<p></p>');
                  }
                  toast.success(t('hsqeDocumentRibbon.toast.cut'));
                }}
                disabled={!isEditing}
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition disabled:opacity-40"
                title="Cut"
              >
                <Scissors className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
              </button>
              <button
                onClick={handleCopy}
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition"
                title="Copy"
              >
                <Copy className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
              </button>
              <button
                onClick={handlePaste}
                disabled={!isEditing}
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition disabled:opacity-40"
                title="Paste"
              >
                <Clipboard className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
              </button>
            </div>

            <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

            {/* Typography selection */}
            <div className="flex items-center gap-1 bg-slate-200/50 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
              <Type className="w-3.5 h-3.5 text-slate-500 mr-1" />
              <select
                value={fontFamily}
                onChange={(e) => setFontFamily(e.target.value)}
                className="text-xs bg-transparent text-slate-700 dark:text-slate-300 border-none outline-none font-semibold cursor-pointer"
              >
                <option value="font-sans">Arial (Default Sans)</option>
                <option value="font-serif">Times New Roman (Serif)</option>
                <option value="font-mono">Courier New (Monospace)</option>
              </select>
            </div>

            <div className="flex items-center gap-1 bg-slate-200/50 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
              <select
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value)}
                className="text-xs bg-transparent text-slate-700 dark:text-slate-300 border-none outline-none font-semibold cursor-pointer"
              >
                <option value="text-xs">12px (Small)</option>
                <option value="text-sm">14px (Normal)</option>
                <option value="text-base">16px (Medium)</option>
                <option value="text-lg">18px (Large)</option>
              </select>
            </div>

            <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

            {/* Live Text Style Group */}
            <div className="flex items-center bg-slate-200/50 dark:bg-slate-800 px-1.5 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 gap-0.5">
              <button
                onClick={() => runCommand((editor) => editor.chain().focus().toggleBold().run())}
                className={`p-1 rounded transition ${
                  isCommandActive('bold')
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
                title={t('hsqeDocumentRibbon.tooltips.bold')}
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => runCommand((editor) => editor.chain().focus().toggleItalic().run())}
                className={`p-1 rounded transition ${
                  isCommandActive('italic')
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
                title={t('hsqeDocumentRibbon.tooltips.italic')}
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => runCommand((editor) => editor.chain().focus().toggleUnderline().run())}
                className={`p-1 rounded transition ${
                  isCommandActive('underline')
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
                title={t('hsqeDocumentRibbon.tooltips.underline')}
              >
                <UnderlineIcon className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => runCommand((editor) => editor.chain().focus().toggleStrike().run())}
                className={`p-1 rounded transition ${
                  isCommandActive('strike')
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
                title={t('hsqeDocumentRibbon.tooltips.strike')}
              >
                <Strikethrough className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => runCommand((editor) => editor.chain().focus().toggleHighlight().run())}
                className={`p-1 rounded transition ${
                  isCommandActive('highlight')
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
                title={t('hsqeDocumentRibbon.tooltips.highlight')}
              >
                <Highlighter className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

            {/* Alignments and Lists Group */}
            <div className="flex items-center bg-slate-200/50 dark:bg-slate-800 px-1.5 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 gap-0.5">
              <button
                onClick={() => runCommand((editor) => editor.chain().focus().setTextAlign('left').run())}
                className={`p-1 rounded transition ${
                  isCommandActive({ textAlign: 'left' })
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
                title={t('hsqeDocumentRibbon.tooltips.alignLeft')}
              >
                <AlignLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => runCommand((editor) => editor.chain().focus().setTextAlign('center').run())}
                className={`p-1 rounded transition ${
                  isCommandActive({ textAlign: 'center' })
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
                title={t('hsqeDocumentRibbon.tooltips.alignCenter')}
              >
                <AlignCenter className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => runCommand((editor) => editor.chain().focus().setTextAlign('right').run())}
                className={`p-1 rounded transition ${
                  isCommandActive({ textAlign: 'right' })
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
                title={t('hsqeDocumentRibbon.tooltips.alignRight')}
              >
                <AlignRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => runCommand((editor) => editor.chain().focus().setTextAlign('justify').run())}
                className={`p-1 rounded transition ${
                  isCommandActive({ textAlign: 'justify' })
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
                title={t('hsqeDocumentRibbon.tooltips.alignJustify')}
              >
                <AlignJustify className="w-3.5 h-3.5" />
              </button>

              <div className="w-px h-3.5 bg-slate-300 dark:bg-slate-600 mx-1" />

              <button
                onClick={() => runCommand((editor) => editor.chain().focus().toggleBulletList().run())}
                className={`p-1 rounded transition ${
                  isCommandActive('bulletList')
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
                title="Bullet List"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => runCommand((editor) => editor.chain().focus().toggleOrderedList().run())}
                className={`p-1 rounded transition ${
                  isCommandActive('orderedList')
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
                title="Ordered List"
              >
                <ListOrdered className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => runCommand((editor) => editor.chain().focus().toggleBlockquote().run())}
                className={`p-1 rounded transition ${
                  isCommandActive('blockquote')
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
                title={t('hsqeDocumentRibbon.tooltips.quote')}
              >
                <Quote className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

            {/* Headings and History Undo/Redo */}
            <div className="flex items-center bg-slate-200/50 dark:bg-slate-800 px-1.5 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700 gap-0.5">
              <button
                onClick={() => runCommand((editor) => editor.chain().focus().toggleHeading({ level: 1 }).run())}
                className={`p-1 text-xs font-extrabold rounded transition ${
                  isCommandActive('heading', { level: 1 })
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
                title={t('hsqeDocumentRibbon.tooltips.heading1')}
              >
                H1
              </button>
              <button
                onClick={() => runCommand((editor) => editor.chain().focus().toggleHeading({ level: 2 }).run())}
                className={`p-1 text-xs font-extrabold rounded transition ${
                  isCommandActive('heading', { level: 2 })
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
                title={t('hsqeDocumentRibbon.tooltips.heading2')}
              >
                H2
              </button>
              <button
                onClick={() => runCommand((editor) => editor.chain().focus().toggleHeading({ level: 3 }).run())}
                className={`p-1 text-xs font-extrabold rounded transition ${
                  isCommandActive('heading', { level: 3 })
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
                title={t('hsqeDocumentRibbon.tooltips.heading3')}
              >
                H3
              </button>

              <div className="w-px h-3.5 bg-slate-300 dark:bg-slate-600 mx-1" />

              <button
                onClick={() => runCommand((editor) => editor.chain().focus().undo().run())}
                disabled={!isEditing || !editorInstance?.can().undo()}
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition disabled:opacity-30"
                title="Undo (Ctrl+Z)"
              >
                <Undo2 className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
              </button>
              <button
                onClick={() => runCommand((editor) => editor.chain().focus().redo().run())}
                disabled={!isEditing || !editorInstance?.can().redo()}
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition disabled:opacity-30"
                title="Redo (Ctrl+Y)"
              >
                <Redo2 className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" />
              </button>
            </div>
          </div>
        )}

        {/* INSERT TAB ACTIONS */}
        {activeRibbonTab === 'Insert' && (
          <div className="flex items-center gap-1">
            <button
              onClick={handleInsertTable}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition font-medium"
            >
              <Table className="w-3.5 h-3.5 text-blue-500" /> {t('hsqeDocumentRibbon.actions.insertTable')}
            </button>
            <button
              onClick={handleInsertChecklist}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition font-medium"
            >
              <CheckSquare className="w-3.5 h-3.5 text-green-500" /> {t('hsqeDocumentRibbon.actions.insertChecklist')}
            </button>
            <button
              onClick={handleInsertPageBreak}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition font-medium"
            >
              <Minus className="w-3.5 h-3.5 text-red-500" /> {t('hsqeDocumentRibbon.actions.insertPageBreak')}
            </button>
            <button
              onClick={handleInsertLogo}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition font-medium"
            >
              <Image className="w-3.5 h-3.5 text-amber-500" /> {t('hsqeDocumentRibbon.actions.insertCompanyLogo')}
            </button>
          </div>
        )}

        {/* PAGE LAYOUT TAB ACTIONS */}
        {activeRibbonTab === 'Page Layout' && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Orientation */}
            <div className="flex items-center gap-1 bg-slate-200/50 dark:bg-slate-800 px-1.5 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
              <span className="text-xs uppercase font-bold text-slate-500 px-1">{t('hsqeDocumentRibbon.actions.orientation')}</span>
              <button
                onClick={() => {
                  onOrientationChange('portrait');
                  toast.success(t('hsqeDocumentRibbon.toast.portrait'));
                }}
                className={`px-2 py-1 text-xs rounded transition font-medium ${
                  orientation === 'portrait'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                {t('hsqeDocumentRibbon.actions.portrait')}
              </button>
              <button
                onClick={() => {
                  onOrientationChange('landscape');
                  toast.success(t('hsqeDocumentRibbon.toast.landscape'));
                }}
                className={`px-2 py-1 text-xs rounded transition font-medium ${
                  orientation === 'landscape'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                {t('hsqeDocumentRibbon.actions.landscape')}
              </button>
            </div>

            {/* Margins */}
            <div className="flex items-center gap-1 bg-slate-200/50 dark:bg-slate-800 px-1.5 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
              <span className="text-xs uppercase font-bold text-slate-500 px-1">{t('hsqeDocumentRibbon.actions.margins')}</span>
              <button
                onClick={() => onMarginsChange('normal')}
                className={`px-2 py-1 text-xs rounded transition font-medium ${
                  margins === 'normal'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                {t('hsqeDocumentRibbon.actions.marginNormal')}
              </button>
              <button
                onClick={() => onMarginsChange('narrow')}
                className={`px-2 py-1 text-xs rounded transition font-medium ${
                  margins === 'narrow'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                {t('hsqeDocumentRibbon.actions.marginNarrow')}
              </button>
              <button
                onClick={() => onMarginsChange('wide')}
                className={`px-2 py-1 text-xs rounded transition font-medium ${
                  margins === 'wide'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                }`}
              >
                {t('hsqeDocumentRibbon.actions.marginWide')}
              </button>
            </div>

            {/* Watermark input */}
            <div className="flex items-center gap-1.5 bg-slate-200/50 dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
              <Shield className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs uppercase font-bold text-slate-500">Watermark:</span>
              <input
                type="text"
                value={watermarkText}
                readOnly={!isEditing}
                onChange={(e) => onWatermarkChange(e.target.value)}
                placeholder={t('hsqeDocumentRibbon.actions.watermarkPlaceholder')}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-750 text-xs px-2 py-0.5 rounded w-36 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {/* REFERENCES TAB ACTIONS */}
        {activeRibbonTab === 'References' && (
          <div className="flex items-center gap-1">
            <button
              onClick={handleGenerateTOC}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition font-medium"
              title={t('hsqeDocumentRibbon.actions.generateTocTitle')}
            >
              <BookOpen className="w-3.5 h-3.5 text-blue-500" /> {t('hsqeDocumentRibbon.actions.generateToc')}
            </button>
            <button
              onClick={handleInsertFootnote}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition font-medium"
            >
              <Compass className="w-3.5 h-3.5 text-slate-500" /> {t('hsqeDocumentRibbon.actions.insertFootnote')}
            </button>
          </div>
        )}

        {/* VIEW TAB ACTIONS */}
        {activeRibbonTab === 'View' && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Show Ruler Toggle */}
            <label className="flex items-center gap-1.5 px-2 py-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition cursor-pointer select-none text-xs text-slate-700 dark:text-slate-300 font-medium">
              <input
                type="checkbox"
                checked={showRuler}
                onChange={(e) => onShowRulerChange(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
              />
              <Ruler className="w-3.5 h-3.5 text-slate-400" /> {t('hsqeDocumentRibbon.actions.showRuler')}
            </label>

            <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

            {/* Zoom Group */}
            <div className="flex items-center gap-1 bg-slate-200/50 dark:bg-slate-800 px-1.5 py-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
              <span className="text-xs uppercase font-bold text-slate-500 px-1">Zoom:</span>
              <button
                onClick={() => {
                  onZoomChange(Math.max(50, zoom - 10));
                  toast.success(`Zoom: ${Math.max(50, zoom - 10)}%`);
                }}
                className="p-1 hover:bg-slate-200 rounded text-slate-600 dark:text-slate-400"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 px-1.5 w-12 text-center select-none">
                {zoom}%
              </span>
              <button
                onClick={() => {
                  onZoomChange(Math.min(150, zoom + 10));
                  toast.success(`Zoom: ${Math.min(150, zoom + 10)}%`);
                }}
                className="p-1 hover:bg-slate-200 rounded text-slate-600 dark:text-slate-400"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  onZoomChange(100);
                  toast.success(t('hsqeDocumentRibbon.toast.zoomReset'));
                }}
                className="px-1.5 py-0.5 text-xs font-bold bg-slate-300 dark:bg-slate-750 rounded text-slate-700 dark:text-slate-300"
              >
                100%
              </button>
            </div>

            <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />

            {/* Read Mode Toggle */}
            <button
              onClick={() => {
                onReadModeChange(!readMode);
                toast.success(
                  !readMode
                    ? t('hsqeDocumentRibbon.toast.readModeOn')
                    : t('hsqeDocumentRibbon.toast.readModeOff')
                );
              }}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg transition font-semibold ${
                readMode
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-200/50 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-250 dark:border-slate-700'
              }`}
            >
              {readMode ? (
                <>
                  <EyeOff className="w-3.5 h-3.5" /> {t('hsqeDocumentRibbon.actions.normalMode')}
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5" /> {t('hsqeDocumentRibbon.actions.readMode')}
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Page Ruler bar */}
      {showRuler && (
        <div className="h-5 bg-slate-100 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-700 flex items-center px-2 overflow-hidden flex-shrink-0 select-none">
          <div className="flex items-center gap-0 text-xs text-slate-400 dark:text-slate-600 font-mono">
            {Array.from({ length: orientation === 'landscape' ? 24 : 18 }, (_, i) => (
              <span key={i} className="flex items-center">
                <span className="w-[1px] h-2 bg-slate-300 dark:bg-slate-600 mr-px" />
                <span className="px-1.5">{i + 1}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {importedDocxPayload && !isEditing ? (
        <div className="flex-1 overflow-auto bg-slate-200 p-6 dark:bg-slate-900">
          <div
            className="mx-auto transition-all duration-200"
            style={{
              transform: `scale(${zoom / 100})`,
              transformOrigin: 'top center',
              width: orientation === 'landscape' ? '1100px' : '850px',
              maxWidth: '100%',
            }}
          >
            <ImportedDocxPreview payload={importedDocxPayload} />
          </div>
        </div>
      ) : checklistTemplate && !isEditing ? (
        <div className="flex-1 overflow-auto bg-slate-100 p-4 dark:bg-slate-950">
          <ChecklistTemplatePreview template={checklistTemplate} />
        </div>
      ) : (
      <div className="flex-1 overflow-auto bg-slate-200 dark:bg-slate-900 p-6 flex justify-center">
        {/* Document scale wrap */}
        <div
          className="transition-all duration-200 relative select-text"
          style={{
            transform: `scale(${zoom / 100})`,
            transformOrigin: 'top center',
            width: orientation === 'landscape' ? '1100px' : '850px',
            maxWidth: '100%',
          }}
        >
          <div className="bg-white dark:bg-slate-800 shadow-xl border border-slate-300 dark:border-slate-700 w-full min-h-[1080px] relative overflow-hidden flex flex-col">
            {/* Watermark overlay */}
            {watermarkText.trim() && !isImportedWordDocument && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden z-0">
                <span className="text-slate-150 dark:text-slate-800/10 font-black text-[4.375rem] uppercase tracking-[12px] -rotate-[35deg] opacity-25 whitespace-nowrap">
                  {watermarkText}
                </span>
              </div>
            )}

            {/* Document Header Table */}
            {!isImportedWordDocument && (
            <div className="z-10 flex-shrink-0 px-10 pt-10">
              <table className="w-full border-collapse border border-slate-500 text-slate-700 dark:border-slate-500 dark:text-slate-200">
                <tbody>
                  <tr>
                    <td className="w-[170px] border border-slate-500 p-3 text-center align-middle" rowSpan={2}>
                      <div className="mx-auto mb-1 flex h-14 w-24 items-center justify-center rounded-[50%] border-2 border-slate-400 text-2xl font-black italic tracking-tight text-slate-500">
                        FLY
                      </div>
                      <div className="text-xs font-bold uppercase leading-tight text-slate-500">
                        Flying Shipping<br />Company
                      </div>
                    </td>
                    <td className="border border-slate-500 px-6 py-3 text-center align-middle" rowSpan={2}>
                      <div className="text-xl font-black uppercase leading-snug tracking-normal text-slate-600 dark:text-slate-100">
                        {document.title}
                      </div>
                      <div className="mt-2 text-sm font-bold italic uppercase text-slate-500 dark:text-slate-300">
                        {document.category === 'PROCEDURE' ? 'Shipboard Procedure' : 'Controlled Document'}
                      </div>
                    </td>
                    <td className="w-[190px] border border-slate-500 px-3 py-3 text-right align-middle">
                      <div className="text-base font-black text-slate-600 dark:text-slate-100">
                        {document.category === 'FORM' ? 'Flying Form' : document.category === 'CHECKLIST' ? 'Flying Checklist' : 'Flying Manual'}
                      </div>
                      <div className="text-sm font-bold text-slate-600 dark:text-slate-100">
                        {document.code}
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-500 px-3 py-3 text-right align-middle">
                      <div className="text-sm font-bold text-slate-600 dark:text-slate-100">
                        Revision: {document.currentVersion.replace(/^Rev\s*/i, '')}
                      </div>
                      <div className="text-sm font-bold text-slate-600 dark:text-slate-100">
                        Date: {document.lastModified}
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            )}
            <div className="hidden">
              <table className="w-full text-xs border-collapse">
                <tbody>
                  <tr>
                    {/* Company Logo Cell */}
                    <td className="w-[120px] border border-slate-300 dark:border-slate-600 p-4 text-center align-middle" rowSpan={2}>
                      <div className="flex flex-col items-center gap-1.5">
                        <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-blue-800 rounded-lg flex items-center justify-center shadow-sm">
                          <span className="text-white font-black text-lg">F</span>
                        </div>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider leading-tight">
                          Flying<br />Shipping
                        </span>
                      </div>
                    </td>

                    {/* Title Cell */}
                    <td className="border border-slate-300 dark:border-slate-600 p-4 text-center align-middle" rowSpan={2}>
                      <div className="text-sm font-extrabold text-slate-900 dark:text-white uppercase tracking-wide">
                        {document.title}
                      </div>
                    </td>

                    {/* Meta Info - Top Row */}
                    <td className="w-[220px] border border-slate-300 dark:border-slate-600 px-4 py-2">
                      <div className="flex justify-between font-medium">
                        <span className="text-slate-500">{t('hsqeDocumentRibbon.documentHeader.revision')}</span>
                        <span className="font-bold text-slate-900 dark:text-white">{document.currentVersion}</span>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="w-[220px] border border-slate-300 dark:border-slate-600 px-4 py-2">
                      <div className="space-y-1 font-medium text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-500">Effective Date:</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">{document.lastModified}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Page Number:</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200">1 of 1</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Approved By:</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[120px]">{document.approver || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">Released By:</span>
                          <span className="font-bold text-slate-800 dark:text-slate-200 truncate max-w-[120px]">
                            {document.status === 'Published' ? document.approver || '-' : '-'}
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="border border-slate-300 dark:border-slate-600 px-4 py-2.5 text-slate-500 font-semibold uppercase">
                      {t('hsqeDocumentRibbon.documentHeader.code')}
                    </td>
                    <td className="border border-slate-300 dark:border-slate-600 px-4 py-2.5 font-bold text-slate-850 dark:text-slate-200">
                      {document.code}
                    </td>
                    <td className="border border-slate-300 dark:border-slate-600 px-4 py-2.5 text-slate-500 font-semibold">
                      {document.title}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Content Body */}
            <div
              className={`flex-1 z-10 transition-all duration-200 ${
                margins === 'narrow' ? 'p-4' : margins === 'wide' ? 'p-12' : 'p-10'
              }`}
            >
              {isEditing ? (
                <RichTextEditor
                  content={editContent}
                  onChange={onContentChange}
                  placeholder={t('hsqeDocumentRibbon.documentHeader.contentPlaceholder')}
                  minHeight="700px"
                  onEditorReady={setEditorInstance}
                  showToolbar={false}
                />
              ) : (
                <div
                  className={`prose max-w-none text-slate-800 dark:text-slate-200 leading-relaxed ${fontFamily} ${fontSize}`}
                >
                  {checklistTemplate ? (
                    <ChecklistTemplatePreview template={checklistTemplate} />
                  ) : (
                    <RichContentViewer html={document.content} />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

