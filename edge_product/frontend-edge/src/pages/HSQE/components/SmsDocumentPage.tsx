import { PermissionGate } from '@/components/auth/PermissionGate'
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Shield, FileText, ChevronRight, ChevronDown, Check, X,
  Award, Filter, Save, RefreshCw,
  AlertTriangle, BookOpen, Lock, Sparkles, Send, Database,
  History, Plus, Trash2, Printer, Search, Maximize2, Minimize2,
  GitCompare, ChevronLeft, Layers, Link2, ExternalLink, Eye
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/auth.store';
import { smsService, SmsTreeChapter, SmsProcedureDetail, SmsFormTemplate, SmsFilledRecord, SignatureEntry, SmsProcedure } from '@/services/sms.service';
import { RichTextEditor } from '@/components/editor/RichTextEditor';
import { printSmsDocument } from '@/lib/printUtils';
import { shipDataService } from '@/services/ship-data.service';
import { maritimeService } from '@/services/maritime.service';
import { useParams, useNavigate } from 'react-router-dom';

// ─── HTML Tokenizer & Tag-Safe Diff Utility ──────────────────
function tokenizeHtml(html: string): string[] {
  const regex = /<[^>]+>|[\w\u00C0-\u1FFF\u2C00-\uD7FF\uAC00-\uD7A3]+|\s+|./g;
  return html.match(regex) || [];
}

function diffHtml(oldHtml: string, newHtml: string): string {
  const oldTokens = tokenizeHtml(oldHtml);
  const newTokens = tokenizeHtml(newHtml);
  
  // To avoid performance issues on huge texts, fallback if too large
  if (oldTokens.length > 2500 || newTokens.length > 2500) {
    return `<div class="text-slate-500 italic p-4">Tài liệu quá lớn để so sánh chi tiết từng từ. Hiển thị nội dung mới:</div>${newHtml}`;
  }

  // Dynamic Programming LCS Table
  const n = oldTokens.length;
  const m = newTokens.length;
  const dp: number[][] = Array(n + 1).fill(0).map(() => Array(m + 1).fill(0));
  
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      if (oldTokens[i - 1] === newTokens[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  
  let i = n;
  let j = m;
  const result: string[] = [];
  
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldTokens[i - 1] === newTokens[j - 1]) {
      result.unshift(oldTokens[i - 1]);
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      const token = newTokens[j - 1];
      // HTML tag check
      if (token.startsWith('<') && token.endsWith('>')) {
        result.unshift(token);
      } else if (token.trim() === '') {
        result.unshift(token);
      } else {
        result.unshift(`<ins class="bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 px-0.5 rounded border-b border-emerald-500 font-medium">${token}</ins>`);
      }
      j--;
    } else {
      const token = oldTokens[i - 1];
      // HTML tag check
      if (token.startsWith('<') && token.endsWith('>')) {
        result.unshift(token);
      } else if (token.trim() === '') {
        result.unshift(token);
      } else {
        result.unshift(`<del class="bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-450 line-through px-0.5 rounded opacity-70">${token}</del>`);
      }
      i--;
    }
  }
  
  return result.join('');
}

const formatPdfUrl = (pathStr?: string) => {
  if (!pathStr) return '';
  if (pathStr.startsWith('http://') || pathStr.startsWith('https://')) {
    try {
      const url = new URL(pathStr);
      url.pathname = url.pathname.split('/').map(segment => encodeURIComponent(segment)).join('/');
      url.hash = 'toolbar=0';
      return url.toString();
    } catch {
      return `${pathStr}#toolbar=0`;
    }
  }
  const cleanPath = pathStr.replace(/\\/g, '/');
  const normalizedPath = cleanPath.startsWith('/') ? cleanPath : '/' + cleanPath;
  const parts = normalizedPath.split('/').map(segment => encodeURIComponent(segment));
  return `${parts.join('/')}#toolbar=0`;
};

const isPdfFile = (pathStr?: string) => {
  if (!pathStr) return false;
  const clean = pathStr.split('?')[0].split('#')[0].toLowerCase();
  return clean.endsWith('.pdf');
};

interface CleaningScheduleItem {
  num: string;
  name: string;
  cycle: string;
  method: string;
  note: string;
}

interface CleaningScheduleCategory {
  title: string;
  prefix: string;
  items: CleaningScheduleItem[];
}

export const cleaningCategories: CleaningScheduleCategory[] = [
  {
    title: "BẾP / GALLEY",
    prefix: "galley",
    items: [
      { num: "1", name: "Các bề mặt làm việc", cycle: "Sau khi sử dụng", method: "Bỏ thức ăn dư thừa và bụi bẩn / Rửa bề mặt bằng chất tẩy để loại bỏ dầu mỡ, thực phẩm và bụi bẩn / Rửa sạch, khử trùng, rửa lại / Lau khô (tự nhiên hoặc bằng khăn sạch)", note: "Đảm bảo dùng đúng nồng độ các chất tẩy rửa và khử trùng." },
      { num: "2", name: "Thớt", cycle: "Sau khi sử dụng", method: "Bỏ thức ăn dư thừa và bụi bẩn / Rửa bề mặt bằng chất tẩy để loại bỏ dầu mỡ, thực phẩm và bụi bẩn / Rửa sạch, khử trùng, rửa lại / Lau khô (tự nhiên hoặc bằng khăn sạch)", note: "" },
      { num: "3", name: "Sàn bếp", cycle: "Sau mỗi bữa ăn.", method: "Bỏ thức ăn dư thừa và bụi bẩn / Lau bề mặt bằng chất tẩy để loại bỏ dầu mỡ, thực phẩm và bụi bẩn / Lau sạch, để khô tự nhiên", note: "" },
      { num: "4", name: "Khu vực vệ sinh tay", cycle: "Sau mỗi bữa ăn.", method: "Rửa bề mặt với chất tẩy rửa / Khử trùng / Rửa sạch, để khô tự nhiên.", note: "" },
      { num: "5", name: "Dụng cụ - dao, đồ mở hộp, máy trộn thức ăn, v.v...", cycle: "Sau khi sử dụng", method: "Rửa bằng chất tẩy để loại bỏ dầu mỡ, thực phẩm và bụi bẩn. / Rửa sạch, khử trùng, rửa sạch / Lau khô (tự nhiên hoặc bằng khăn sạch)", note: "" },
      { num: "6", name: "Bồn rửa / vòi nước", cycle: "Hàng ngày", method: "Rửa bề mặt với chất tẩy rửa / Rửa sạch, để khô tự nhiên", note: "" },
      { num: "7", name: "Các đồ dùng thường xuyên chạm vào – tay nắm cửa, công tắc đèn, điều khiển, điện thoại vv", cycle: "Hàng ngày", method: "Lau sạch bằng chất khử trùng", note: "" },
      { num: "8", name: "Vách ngăn bếp/ sàn tàu", cycle: "Hàng ngày", method: "Rửa bề mặt với chất tẩy rửa / Rửa sạch, để khô tự nhiên", note: "" },
      { num: "9", name: "Chụp hút mùi/ quạt hút", cycle: "Hàng tuần", method: "Làm sạch, tẩy bằng chất tẩy rửa / Rửa sạch", note: "Đeo găng tay" },
      { num: "10", name: "Tủ lạnh", cycle: "Hàng tuần", method: "Dỡ bỏ thức ăn / Rửa bề mặt bằng chất tẩy rửa / Rửa sạch, khử trùng, rửa sạch / Để khô tự nhiên", note: "" },
      { num: "11", name: "Lò nướng, lò vi sóng, vỉ nướng", cycle: "Hàng tuần", method: "Làm sạch theo hướng dẫn của nhà sản xuất", note: "Đeo găng tay, chất tẩy rửa lò có thể là loại ăn mòn cao" }
    ]
  },
  {
    title: "CÁC KHO THỰC PHẨM / FOOD STORES",
    prefix: "stores",
    items: [
      { num: "1", name: "Quạt thông gió", cycle: "Hàng tuần", method: "Làm sạch, lau chùi", note: "" },
      { num: "2", name: "Sàn nhà kho khô", cycle: "Hàng tuần", method: "Hút bụi, Lau bằng nước lau sàn pha loãng, để khô tự nhiên", note: "" },
      { num: "3", name: "Thực phẩm kho kho dầu", cycle: "Hàng ngày", method: "Lau dọn sạch sẽ", note: "" },
      { num: "4", name: "Sàn nhà, kệ kho lạnh", cycle: "Khi nhận thực phẩm mới", method: "Dỡ bỏ thức ăn / Rửa bề mặt bằng chất tẩy rửa / Rửa sạch, khử trùng, rửa sạch / Để khô tự nhiên", note: "" }
    ]
  },
  {
    title: "PHÒNG Ở / CABINS & ACCOMMODATIONS",
    prefix: "cabins",
    items: [
      { num: "1", name: "Chăn, drap, vỏ gối, rèm vải.", cycle: "Hàng tuần", method: "Thay chăn, drap, vỏ gối, rèm vải sạch", note: "" },
      { num: "2", name: "Giường, tủ", cycle: "Hàng tuần", method: "Lau bụi, bẩn", note: "" },
      { num: "3", name: "Sàn nhà", cycle: "Hàng ngày", method: "Hút bụi, Lau bằng nước lau sàn pha loãng, để khô tự nhiên", note: "Giữ trật tự khi thuyền viên đang nghỉ ngơi" },
      { num: "4", name: "Kệ để giày dép", cycle: "Hàng tuần", method: "Hút bụi , lau sạch.", note: "" },
      { num: "5", name: "Thùng rác", cycle: "Hàng ngày", method: "Gom rác, phân loại, thay túi lót", note: "Phân loại rác theo quy định" },
      { num: "6", name: "Bộ phận thông gió", cycle: "Hàng tuần", method: "Làm sạch, lau chùi", note: "" },
      { num: "7", name: "Phòng vệ sinh, phòng tắm", cycle: "Hàng ngày", method: "Lau chùi", note: "" }
    ]
  },
  {
    title: "KHU VỰC SINH HOẠT CHUNG / COMMON AREAS",
    prefix: "common",
    items: [
      { num: "1", name: "Trần tường", cycle: "Hàng tuần", method: "Lau, chùi sạch", note: "" },
      { num: "2", name: "Sàn", cycle: "Hàng ngày", method: "Hút bụi, Lau bằng nước lau sàn pha loãng, để khô tự nhiên", note: "" },
      { num: "3", name: "Bàn, ghế, tủ", cycle: "Hàng ngày", method: "Lau, chùi sạch", note: "" },
      { num: "4", name: "Ti vi, đầu đĩa, quạt, đèn", cycle: "Hàng tuần", method: "Lau, chùi sạch", note: "" },
      { num: "5", name: "Tranh, khẩu hiệu, áp phích, tờ rơi", cycle: "Hàng tuần", method: "Lau, chùi", note: "" },
      { num: "6", name: "Thùng rác", cycle: "Hàng ngày", method: "Gom rác, phân loại, thay túi lót", note: "" },
      { num: "7", name: "Tủ lạnh", cycle: "Hàng tuần", method: "Rửa sạch, khử trùng, rửa sạch / Để khô tự nhiên", note: "" },
      { num: "8", name: "Bộ phận thông gió", cycle: "Hàng tuần", method: "Làm sạch, lau chùi", note: "" },
      { num: "9", name: "Phòng vệ sinh, phòng tắm", cycle: "Hàng ngày", method: "Lau chùi", note: "" }
    ]
  }
];

export function SmsDocumentPage() {
  const { templateId } = useParams<{ templateId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const currentUserName = user?.fullName || user?.username || 'Thuyền viên Demo';
  const currentUserRank = user?.rankName || user?.position || user?.roleName || 'Sỹ quan';

  // ─── State ─────────────────────────────────────────────────
  const [treeData, setTreeData] = useState<SmsTreeChapter[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [expandedChapters, setExpandedChapters] = useState<Record<number, boolean>>({
    1: true,
    6: true,
    7: true
  });
  
  // Selected Entities
  const [selectedProcId, setSelectedProcId] = useState<string | null>(null);
  const [selectedProcDetail, setSelectedProcDetail] = useState<SmsProcedureDetail | null>(null);
  const [loadingProc, setLoadingProc] = useState<boolean>(false);
  
  // E-Form States
  const [selectedTemplate, setSelectedTemplate] = useState<SmsFormTemplate | null>(null);
  const [formValues, setFormValues] = useState<Record<string, any>>({});
  const [shipData, setShipData] = useState<any>(null);
  const [isFormMaximized, setIsFormMaximized] = useState<boolean>(false);
  const [filledRecordId, setFilledRecordId] = useState<string | null>(null);
  const [recordStatus, setRecordStatus] = useState<string | null>(null);
  const [signatures, setSignatures] = useState<SignatureEntry[]>([]);
  const [signingName, setSigningName] = useState<string>(currentUserName);
  const [signingRank, setSigningRank] = useState<string>(currentUserRank);
  const [signingPin, setSigningPin] = useState<string>('');
  const [crewList, setCrewList] = useState<any[]>([]);

  // Edit / Version Control States
  const [isEditingSop, setIsEditingSop] = useState<boolean>(false);
  const [sopEditContent, setSopEditContent] = useState<string>('');
  const [sopEditVersion, setSopEditVersion] = useState<string>('');
  const [sopEditChangeNote, setSopEditChangeNote] = useState<string>('');

  // Tree Theme & DOCX Import States
  const [treeTheme] = useState<'dark' | 'light'>('light');
  const [showObsolete, setShowObsolete] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImportingDocx, setIsImportingDocx] = useState<boolean>(false);
  const [importLoading, setImportLoading] = useState<boolean>(false);
  const [importedHtml, setImportedHtml] = useState<string>('');
  const [importedHtmlBackup, setImportedHtmlBackup] = useState<string>('');
  const [importedFilePath, setImportedFilePath] = useState<string>('');
  const [importForm, setImportForm] = useState({
    ismElementId: 7,
    procedureCode: '',
    title: '',
    version: 'Rev 1.0',
    changeNote: '',
    replaceExisting: false,
    existingProcedureId: ''
  });
  const [showDiffPreview, setShowDiffPreview] = useState<boolean>(false);
  const [replaceChapterFilter, setReplaceChapterFilter] = useState<number | 'ALL'>('ALL');
  const [isFormsSidebarOpen, setIsFormsSidebarOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Form Template Builder States
  const [showFormBuilder, setShowFormBuilder] = useState<boolean>(false);
  const [formBuilderData, setFormBuilderData] = useState({
    formCode: '',
    title: '',
    fields: [] as { id: string; label: string; type: string; required: boolean; options?: string }[]
  });
  const [creatingTemplate, setCreatingTemplate] = useState<boolean>(false);

  // Template Selector Modal States
  const [showTemplateSelector, setShowTemplateSelector] = useState<boolean>(false);
  const [allFormTemplates, setAllFormTemplates] = useState<SmsFormTemplate[]>([]);
  const [selectedAssignIds, setSelectedAssignIds] = useState<string[]>([]);
  const [selectorSearch, setSelectorSearch] = useState<string>('');
  const [loadingSelector, setLoadingSelector] = useState<boolean>(false);
  const [assigningTemplates, setAssigningTemplates] = useState<boolean>(false);

  // Mode: 'workspace' | 'auditor' | 'forms'
  const [viewMode, setViewMode] = useState<'workspace' | 'auditor' | 'forms'>('workspace');

  // Form Library State
  const [formLibrarySearch, setFormLibrarySearch] = useState('');
  const [formLibraryLoading, setFormLibraryLoading] = useState(false);
  const [showNewFormModal, setShowNewFormModal] = useState(false);
  const [newFormProcedureId, setNewFormProcedureId] = useState('');
  const [newFormCode, setNewFormCode] = useState('');
  const [newFormTitle, setNewFormTitle] = useState('');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTemplateId, setAssignTemplateId] = useState('');
  const [assignProcedureId, setAssignProcedureId] = useState('');
  const [selectedAssignedForm, setSelectedAssignedForm] = useState<any | null>(null);

  // Group Form Templates by FormCode for Form Library view
  const groupedFormTemplates = useMemo(() => {
    const map = new Map<string, {
      formCode: string;
      title: string;
      sampleId: string;
      contentSchema: string;
      fieldCount: number;
      assignedProcedures: Array<{ id: string; code: string; title: string; templateId: string }>;
    }>();

    allFormTemplates.forEach(t => {
      const code = t.formCode?.trim() || 'UNCODED';
      if (!map.has(code)) {
        let fieldCount = 0;
        try {
          fieldCount = JSON.parse(t.contentSchema || '[]').length;
        } catch { }
        map.set(code, {
          formCode: code,
          title: t.title,
          sampleId: t.id,
          contentSchema: t.contentSchema || '[]',
          fieldCount,
          assignedProcedures: []
        });
      }

      const group = map.get(code)!;
      if (t.procedureCode) {
        if (!group.assignedProcedures.some(p => p.code === t.procedureCode)) {
          group.assignedProcedures.push({
            id: t.smsProcedureId || '',
            code: t.procedureCode,
            title: t.procedureTitle || '',
            templateId: t.id
          });
        }
      }
    });

    return Array.from(map.values());
  }, [allFormTemplates]);

  // Auditor States
  const [auditChapterFilter, setAuditChapterFilter] = useState<number | 'ALL'>('ALL');
  const [auditStatusFilter, setAuditStatusFilter] = useState<string>('ALL');
  const [auditRecords, setAuditRecords] = useState<SmsFilledRecord[]>([]);
  const [loadingAudit, setLoadingAudit] = useState<boolean>(false);
  const [viewRecordDetail, setViewRecordDetail] = useState<SmsFilledRecord | null>(null);

  // Context Menu States & Handlers
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    procedure: SmsProcedure;
  } | null>(null);

  useEffect(() => {
    const handleCloseMenu = () => setContextMenu(null);
    window.addEventListener('click', handleCloseMenu);
    return () => window.removeEventListener('click', handleCloseMenu);
  }, []);

  const handleContextMenu = (e: React.MouseEvent, proc: SmsProcedure) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      procedure: proc
    });
  };

  const handleDeleteProcedure = (proc: SmsProcedure) => {
    toast(`Bạn có chắc chắn muốn xóa quy trình "${proc.procedureCode} - ${proc.title}" khỏi cơ sở dữ liệu? Hành động này sẽ xóa vĩnh viễn quy trình, biểu mẫu liên kết và các hồ sơ liên quan.`, {
      action: {
        label: 'Xóa',
        onClick: async () => {
          try {
            await smsService.deleteProcedure(proc.id);
            toast.success('Xóa quy trình thành công!');
            if (selectedProcId === proc.id) {
              setSelectedProcId(null);
              setSelectedProcDetail(null);
            }
            fetchTree();
          } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi xóa quy trình');
          }
        },
      },
      cancel: { label: 'Hủy', onClick: () => {} },
      duration: 8000,
    });
  };

  // ─── Data Loading ──────────────────────────────────────────
  const fetchTree = useCallback(async (search?: string, silent = false) => {
    if (!silent) {
      setLoading(true);
    }
    try {
      const data = await smsService.getSmsTree(search);
      setTreeData(data);
      if (search?.trim()) {
        const expanded: Record<number, boolean> = {};
        data.forEach(ch => {
          if (ch.procedures && ch.procedures.length > 0) {
            expanded[ch.id] = true;
          }
        });
        setExpandedChapters(prev => ({ ...prev, ...expanded }));
      }
    } catch (err) {
      toast.error('Không thể kết nối đến máy chủ để tải cây thư mục SMS');
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, []);

  const handleSearch = (val: string) => {
    setSearchQuery(val);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      fetchTree(val, true);
    }, 300);
  };

  useEffect(() => {
    fetchTree();
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [fetchTree]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        void fetchTree(searchQuery, true);
      }
    };
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [fetchTree, searchQuery]);

  useEffect(() => {
    const fetchShip = async () => {
      try {
        const res = await shipDataService.get();
        if (res.exists && res.data) {
          setShipData(res.data);
        }
      } catch (e) {
        console.error('Failed to fetch ship data', e);
      }
    };
    const fetchCrew = async () => {
      try {
        const res = await maritimeService.crew.getOnboard();
        if (res) {
          setCrewList(res);
        }
      } catch (e) {
        console.error('Failed to fetch crew onboard', e);
      }
    };
    fetchShip();
    fetchCrew();
  }, []);

  useEffect(() => {
    if (importForm.replaceExisting) {
      const filteredProcs = treeData
        .filter(ch => replaceChapterFilter === 'ALL' || ch.id === replaceChapterFilter)
        .flatMap(ch => ch.procedures)
        .filter(p => p.status === 'Active');
      
      if (filteredProcs.length > 0) {
        const exists = filteredProcs.some(p => p.id === importForm.existingProcedureId);
        if (!exists) {
          const matched = filteredProcs[0];
          const currentVer = matched.version;
          const verNumMatch = currentVer.match(/\d+(\.\d+)?/);
          let newVer = 'Rev 2.0';
          if (verNumMatch) {
            const nextVal = (parseFloat(verNumMatch[0]) + 1.0).toFixed(1);
            newVer = currentVer.replace(verNumMatch[0], nextVal);
          }
          setImportForm(prev => ({
            ...prev,
            existingProcedureId: matched.id,
            procedureCode: matched.procedureCode,
            title: matched.title,
            version: newVer
          }));
        }
      } else {
        setImportForm(prev => ({
          ...prev,
          existingProcedureId: '',
          procedureCode: '',
          title: '',
          version: 'Rev 1.0'
        }));
      }
    }
  }, [replaceChapterFilter, importForm.replaceExisting, treeData]);

  useEffect(() => {
    if (templateId) {
      setIsFormsSidebarOpen(true);
      setIsFormMaximized(true);
      handleSelectTemplate({ id: templateId });
    }
  }, [templateId, shipData]);

  const loadProcedureDetails = async (id: string) => {
    setLoadingProc(true);
    try {
      const detail = await smsService.getProcedure(id);
      setSelectedProcDetail(detail);
      setSopEditContent(detail.content);
      setSopEditVersion(detail.version);
      
      // Reset form view when procedure changes
      setSelectedTemplate(null);
      setFormValues({});
      setFilledRecordId(null);
      setRecordStatus(null);
      setSignatures([]);
    } catch (err) {
      toast.error('Không thể tải nội dung chi tiết quy trình');
    } finally {
      setLoadingProc(false);
    }
  };

  useEffect(() => {
    if (selectedProcId) {
      loadProcedureDetails(selectedProcId);
    }
  }, [selectedProcId]);

  // Load Auditor Records
  const loadAuditRecords = async () => {
    setLoadingAudit(true);
    try {
      const records = await smsService.getFilledRecords(
        auditChapterFilter === 'ALL' ? undefined : auditChapterFilter,
        auditStatusFilter
      );
      setAuditRecords(records);
    } catch (err) {
      toast.error('Không thể tải danh sách hồ sơ kiểm tra');
    } finally {
      setLoadingAudit(false);
    }
  };

  useEffect(() => {
    setSearchQuery('');
    setFormLibrarySearch('');
  }, [viewMode]);

  useEffect(() => {
    if (viewMode === 'auditor') {
      loadAuditRecords();
    }
    if (viewMode === 'forms') {
      loadFormLibrary();
    }
  }, [viewMode, auditChapterFilter, auditStatusFilter]);

  const loadFormLibrary = async () => {
    setFormLibraryLoading(true);
    try {
      const templates = await smsService.getAllFormTemplates();
      setAllFormTemplates(templates);
    } catch {
      toast.error('Không thể tải danh sách biểu mẫu');
    } finally {
      setFormLibraryLoading(false);
    }
  };

  const handlePrintSop = () => {
    if (!selectedProcDetail) return;
    printSmsDocument({
      title: selectedProcDetail.title,
      subtitle: 'QUY TRÌNH QUẢN LÝ AN TOÀN - SAFETY MANAGEMENT PROCEDURE',
      code: selectedProcDetail.procedureCode,
      version: selectedProcDetail.version,
      date: selectedProcDetail.publishDate,
      contentHtml: selectedProcDetail.content,
      watermark: selectedProcDetail.status === 'Obsolete' ? 'HẾT HIỆU LỰC (OBSOLETE)' : (selectedProcDetail.watermarkText || 'CONTROLLED COPY')
    });
  };

  const handlePrintRecord = () => {
    if (!viewRecordDetail) return;
    
    // Parse filled fields and signatures
    let fields: Record<string, any> = {};
    try {
      fields = JSON.parse(viewRecordDetail.filledData || '{}');
    } catch (e) {
      console.error(e);
    }
    
    let signatures: SignatureEntry[] = [];
    try {
      signatures = JSON.parse(viewRecordDetail.digitalSignatures || '[]');
    } catch (e) {
      console.error(e);
    }

    // Build metadata record to print
    const metadata: Record<string, string> = {
      'Tên tàu': viewRecordDetail.vesselName,
      'Quy trình liên kết': viewRecordDetail.procedureCode || 'N/A',
      'Người lập': viewRecordDetail.filledBy,
      'Ngày lập': viewRecordDetail.filledDate.replace('T', ' ').substring(0, 16) + ' UTC',
      'Mã biểu mẫu': viewRecordDetail.formCode || 'N/A'
    };

    // Add all form fields to the metadata for the print table
    Object.entries(fields).forEach(([key, val]) => {
      metadata[key] = val;
    });

    printSmsDocument({
      title: viewRecordDetail.formTitle || 'BIỂU MẪU ĐÁNH GIÁ AN TOÀN - SMS RECORD',
      subtitle: 'HỒ SƠ BÁO CÁO & KIỂM TRA ĐỘI TÀU - SMS AUDITOR SEARCH',
      code: viewRecordDetail.formCode || '',
      version: 'Rev 1.0',
      date: viewRecordDetail.filledDate,
      isForm: true,
      metadata,
      watermark: viewRecordDetail.status === 'Approved' ? 'PHÊ DUYỆT ĐIỆN TỬ' : 'HỒ SƠ HỆ THỐNG',
      signatures
    });
  };

  // ─── Handlers ──────────────────────────────────────────────
  const toggleChapter = (id: number) => {
    setExpandedChapters(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSelectTemplate = async (templateSummary: any) => {
    try {
      const template = await smsService.getFormTemplate(templateSummary.id);
      setSelectedTemplate(template);
      const initialValues: Record<string, any> = {};
      if (template.formCode === 'TL-02-01') {
        initialValues['shipName'] = shipData?.shipName || 'M/V Green Star';
        initialValues['shipType'] = shipData?.typeOfVessel || 'Bulk Carrier';
        initialValues['masterName'] = currentUserName;
        initialValues['reviewDate'] = new Date().toISOString().split('T')[0];
      } else if (template.formCode === 'TL-26-03') {
        initialValues['shipName'] = shipData?.shipName || 'M/V Green Star';
        initialValues['monthYear'] = new Date().toISOString().split('-').slice(0, 2).reverse().join('/');
      } else if (template.formCode === 'TL-15-01') {
        initialValues['vessel'] = shipData?.shipName || 'M/V Green Star';
        initialValues['location'] = shipData?.currentPort || 'Hải Phòng, Việt Nam';
        initialValues['supplyBarge'] = '';
        initialValues['bunkerDate'] = new Date().toISOString().split('T')[0];
        initialValues['foreDraft'] = '';
        initialValues['aftDraft'] = '';

        // Products to be handled
        initialValues['products'] = [
          { grade: '', density: '', stemmedQty: '', qtyOnboard: '', duration: '', robCompletion: '' },
          { grade: '', density: '', stemmedQty: '', qtyOnboard: '', duration: '', robCompletion: '' },
          { grade: '', density: '', stemmedQty: '', qtyOnboard: '', duration: '', robCompletion: '' }
        ];

        // Crew responsibilities
        const getCrewName = (rank: string) => {
          const match = crewList?.find(c => {
            const r = (c.rankName || c.position || '').toLowerCase();
            return r.includes(rank.toLowerCase()) || 
                   (rank === 'C/E' && (r.includes('chief engineer') || r.includes('máy trưởng'))) ||
                   (rank === 'C/O' && (r.includes('chief officer') || r.includes('đại phó'))) ||
                   (rank === '3rd Engineer' && (r.includes('third engineer') || r.includes('máy 3') || r.includes('3rd engineer'))) ||
                   (rank === '2nd &4th Engr.' && (r.includes('second engineer') || r.includes('máy 2') || r.includes('fourth engineer') || r.includes('máy 4'))) ||
                   (rank === 'Oiler' && (r.includes('oiler') || r.includes('thợ máy'))) ||
                   (rank === 'AB' && (r.includes('ab') || r.includes('able seaman') || r.includes('thủy thủ'))) ||
                   (rank === 'Fitter' && (r.includes('fitter') || r.includes('thợ cả')));
          });
          return match ? (match.fullName || match.name) : '';
        };

        initialValues['personnel'] = [
          { rank: 'Máy trưởng / C/E', name: getCrewName('C/E'), duty: 'Chịu trách nhiệm chung / Overall in Charge' },
          { rank: 'Đại phó / C/O', name: getCrewName('C/O'), duty: 'Chịu trách nhiệm các vấn đề về tháo, buộc dây và ngăn ngừa ô nhiễm / In charge of Mooring and pollution prevention aspects' },
          { rank: 'Máy 3 / 3rd Engineer', name: getCrewName('3rd Engineer'), duty: 'Giám sát chung và thao tác các van / General Supervision and operation of valves' },
          { rank: 'Máy 2 & máy 4 / 2nd &4th Engr.', name: getCrewName('2nd &4th Engr.'), duty: 'Đo các két và giám sát lưu lượng bơm / Tank gauging and monitoring bunker inflow rate' },
          { rank: 'Thợ máy / Oiler', name: getCrewName('Oiler'), duty: 'Trực tại đầu ống nhận nhiên liệu và giữ liên lạc với máy 3. / Bunker manifold watch, in contact with 3/E.' },
          { rank: 'Thủy thủ / AB', name: getCrewName('AB'), duty: 'Trực ca boong và theo dõi các dây buộc tàu / Deck watch and tending moorings' },
          { rank: 'Thợ cả / Fitter', name: getCrewName('Fitter'), duty: 'Nối và tháo rỗng nhận nhiên liệu / Connection / disconnection of hoses' }
        ];

        // Section 3-6 Checkboxes
        initialValues['chk_pressure_gauge'] = false;
        initialValues['chk_sounding_tape'] = false;
        initialValues['chk_calibration_table'] = false;
        initialValues['chk_computer'] = false;
        initialValues['chk_reset_alarm'] = false;
        initialValues['chk_temp_sensor'] = false;
        initialValues['chk_thermometer'] = false;
        initialValues['chk_ventilate_sounding'] = false;
        initialValues['chk_h2s_benzene'] = false;
        initialValues['chk_hc_detector'] = false;
        initialValues['chk_respiratory_ready'] = false;

        // Section 7: Distribution
        initialValues['line_up_piping'] = '';
        initialValues['distribution'] = [
          { recvTank: '', valveOpened: '', valveClosed: '', overflowTank: '', overflowValveOpened: '' },
          { recvTank: '', valveOpened: '', valveClosed: '', overflowTank: '', overflowValveOpened: '' },
          { recvTank: '', valveOpened: '', valveClosed: '', overflowTank: '', overflowValveOpened: '' }
        ];

        // Section 8: Loading Rates
        initialValues['rate_initial'] = '';
        initialValues['rate_max'] = '';
        initialValues['rate_topping'] = '';

        // Section 9: Gauging of Tanks
        initialValues['gauging'] = [
          { tank: '', capSound: '', capVol: '', preSound: '', preVol: '', preTemp: '', postSound: '', postVol: '', reduceSound: '', reduceVol: '', seq: '' },
          { tank: '', capSound: '', capVol: '', preSound: '', preVol: '', preTemp: '', postSound: '', postVol: '', reduceSound: '', reduceVol: '', seq: '' },
          { tank: '', capSound: '', capVol: '', preSound: '', preVol: '', preTemp: '', postSound: '', postVol: '', reduceSound: '', reduceVol: '', seq: '' }
        ];

        // Section 10: Communications & Emergency Stop
        initialValues['comm_ship_barge'] = '';
        initialValues['comm_stop_signal'] = '';

        // Section 11: Local contacts
        initialValues['local_contacts'] = '';

        // Section 12: Spill Equipment
        initialValues['spill_loc1'] = '';
        initialValues['spill_loc2'] = '';

        // Section 13: Signatures list
        initialValues['signatures_list'] = [
          { rank: 'Máy trưởng / Chief engineer', name: getCrewName('C/E'), signed: false },
          { rank: 'Đại phó / Chief officer', name: getCrewName('C/O'), signed: false },
          { rank: 'Máy 3 / 3rd Engineer', name: getCrewName('3rd Engineer'), signed: false }
        ];
      }
      setFormValues(initialValues);
      setFilledRecordId(null);
      setRecordStatus(null);
      setSignatures([]);
      setSigningPin('');
      setIsFormMaximized(true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi tải biểu mẫu');
    }
  };

  const handleFormFieldChange = (fieldId: string, val: any) => {
    setFormValues(prev => ({ ...prev, [fieldId]: val }));
  };

  const handleSaveDraft = async () => {
    if (!selectedTemplate) return;
    try {
      const payload = {
        formTemplateId: selectedTemplate.id,
        filledBy: currentUserName,
        filledData: JSON.stringify(formValues),
        submitImmediately: false
      };

      if (filledRecordId) {
        const res = await smsService.updateFilledRecord(filledRecordId, payload);
        toast.success('Đã lưu nháp hồ sơ thành công!');
        setRecordStatus(res.status);
      } else {
        const res = await smsService.createFilledRecord(payload);
        setFilledRecordId(res.recordId);
        setRecordStatus(res.status);
        toast.success('Đã khởi tạo bản nháp hồ sơ thành công!');
      }
    } catch (err) {
      toast.error('Lỗi khi lưu nháp biểu mẫu');
    }
  };

  const handleECompactSign = async () => {
    if (!selectedTemplate) return;

    // Validation for TL-02-01 safety form
    if (selectedTemplate.formCode === 'TL-02-01') {
      const requiredFields = [
        { key: 'shipName', label: 'Tên tàu / Ship\'s Name' },
        { key: 'shipType', label: 'Loại tàu / Ship Type' },
        { key: 'masterName', label: 'Thuyền trưởng / Master\'s Name' },
        { key: 'reviewDate', label: 'Ngày lập / Date' },
      ];
      for (const field of requiredFields) {
        if (!formValues[field.key] || !formValues[field.key].trim()) {
          toast.error(`Vui lòng điền trường bắt buộc: ${field.label}`);
          return;
        }
      }

      for (let i = 1; i <= 10; i++) {
        const key = `reviewItem${i}`;
        if (!formValues[key] || !formValues[key].trim()) {
          toast.error(`Vui lòng trả lời câu hỏi số ${i} (Xem xét của Thuyền trưởng).`);
          return;
        }
      }
    } else if (selectedTemplate.formCode === 'TL-26-03') {
      const requiredFields = [
        { key: 'shipName', label: 'Tên tàu / Ship\'s Name' },
        { key: 'monthYear', label: 'Tháng / Month-Year' },
      ];
      for (const field of requiredFields) {
        if (!formValues[field.key] || !formValues[field.key].trim()) {
          toast.error(`Vui lòng điền trường bắt buộc: ${field.label}`);
          return;
        }
      }
    }

    if (!signingName.trim() || !signingRank.trim() || !signingPin.trim()) {
      toast.error('Vui lòng điền tên, chức danh và mã PIN ký số.');
      return;
    }

    try {
      let recordId = filledRecordId;
      // Auto save first if not saved yet
      if (!recordId) {
        const saveRes = await smsService.createFilledRecord({
          formTemplateId: selectedTemplate.id,
          filledBy: currentUserName,
          filledData: JSON.stringify(formValues),
          submitImmediately: false
        });
        recordId = saveRes.recordId;
        setFilledRecordId(recordId);
      }

      // Call Sign API
      const signRes = await smsService.signRecord(recordId, {
        pin: signingPin,
        name: signingName,
        rank: signingRank
      });

      setSignatures(signRes.signatures);
      setRecordStatus(signRes.status);
      setSigningPin('');
      toast.success('Đã ký số điện tử đóng dấu thành công!');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Mã PIN không chính xác hoặc lỗi ký số');
    }
  };

  const handleCaptainApprove = async () => {
    if (!filledRecordId) return;
    if (!signingPin.trim()) {
      toast.error('Vui lòng nhập mã PIN Thuyền trưởng.');
      return;
    }

    try {
      const res = await smsService.approveRecord(filledRecordId, {
        pin: signingPin,
        name: currentUserName,
        rank: 'Thuyền trưởng (Master)'
      });

      setSignatures(res.signatures);
      setRecordStatus(res.status);
      setSigningPin('');
      toast.success('Thuyền trưởng đã phê duyệt hoàn tất hồ sơ!');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'PIN Thuyền trưởng không đúng (Mặc định: 1111)');
    }
  };

  const handleDocxFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    try {
      const res = await smsService.importDocx(file);
      setImportedHtml(res.html);
      setImportedHtmlBackup(res.html);
      setImportedFilePath(res.filePath);
      
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, "");
      const codeMatch = file.name.match(/SOP-\d{2}-\d{2}/i) || file.name.match(/BM-\d{2}-\d{2}/i);
      const suggestedCode = codeMatch ? codeMatch[0].toUpperCase() : '';
      
      let suggestedChapter = 7;
      if (suggestedCode) {
        const chapterPart = suggestedCode.split('-')[1];
        if (chapterPart && !isNaN(parseInt(chapterPart))) {
          suggestedChapter = parseInt(chapterPart);
        }
      }

      setImportForm({
        ismElementId: suggestedChapter,
        procedureCode: suggestedCode || 'SOP-07-',
        title: nameWithoutExt.replace(/SOP-\d{2}-\d{2}/i, '').replace(/[-_]/g, ' ').trim(),
        version: 'Rev 1.0',
        changeNote: '',
        replaceExisting: false,
        existingProcedureId: ''
      });
      
      setIsImportingDocx(true);
      setShowDiffPreview(false);
      
      const fileExt = file.name.split('.').pop()?.toLowerCase();
      if (fileExt === 'pdf') {
        toast.success('Tải lên file PDF thành công!');
      } else {
        toast.success('Đọc và chuyển đổi tài liệu thành công!');
      }
    } catch (err: any) {
      toast.error(err.message || 'Không thể xử lý tài liệu này. Hãy chắc chắn file hợp lệ.');
    } finally {
      setImportLoading(false);
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const handlePublishImport = async () => {
    if (!importForm.procedureCode.trim() || !importForm.title.trim()) {
      toast.error('Vui lòng điền mã số quy trình và tiêu đề.');
      return;
    }

    try {
      let newProcId = '';
      if (importForm.replaceExisting && importForm.existingProcedureId) {
        const res = await smsService.bumpVersion({
          procedureId: importForm.existingProcedureId,
          newVersion: importForm.version,
          newContent: importedHtml,
          changeNote: importForm.changeNote,
          filePath: importedFilePath
        });
        newProcId = res.newProcedureId;
        toast.success('Ban hành phiên bản cập nhật từ Word thành công!');
      } else {
        const res = await smsService.createProcedure({
          ismElementId: importForm.ismElementId,
          procedureCode: importForm.procedureCode,
          title: importForm.title,
          content: importedHtml,
          version: importForm.version,
          filePath: importedFilePath
        });
        newProcId = res.procedureId;
        toast.success('Ban hành quy trình mới từ Word thành công!');
      }
      
      setIsImportingDocx(false);
      fetchTree(undefined, true);
      if (newProcId) {
        setSelectedProcId(newProcId);
      }
    } catch (err: any) {
      toast.error(err.message || 'Lỗi khi ban hành quy trình.');
    }
  };

  const handleBumpSopVersion = async () => {
    if (!selectedProcDetail) return;
    if (!sopEditVersion.trim() || !sopEditContent.trim()) {
      toast.error('Vui lòng nhập phiên bản mới và nội dung sửa đổi.');
      return;
    }

    try {
      const res = await smsService.bumpVersion({
        procedureId: selectedProcDetail.id,
        newVersion: sopEditVersion,
        newContent: sopEditContent,
        changeNote: sopEditChangeNote
      });

      toast.success('Nâng cấp phiên bản mới thành công! Phiên bản cũ đã được thu hồi.');
      setIsEditingSop(false);
      setSopEditChangeNote('');
      // Reload tree and details in background
      fetchTree(undefined, true);
      loadProcedureDetails(res.newProcedureId);
    } catch (err) {
      toast.error('Lỗi khi cập nhật phiên bản quy trình');
    }
  };

  // ─── Create Form Template Handler ───────────────────────────
  const handleCreateFormTemplate = async () => {
    if (!selectedProcDetail) return;
    if (!formBuilderData.formCode.trim() || !formBuilderData.title.trim()) {
      toast.error('Vui lòng nhập mã biểu mẫu và tiêu đề.');
      return;
    }
    if (formBuilderData.fields.length === 0) {
      toast.error('Vui lòng thêm ít nhất một trường dữ liệu.');
      return;
    }

    setCreatingTemplate(true);
    try {
      const contentSchema = JSON.stringify(
        formBuilderData.fields.map(f => ({
          id: f.id,
          label: f.label,
          type: f.type,
          required: f.required,
          ...(f.type === 'select' && f.options ? { options: f.options.split(',').map(o => o.trim()).filter(Boolean) } : {})
        }))
      );

      await smsService.createFormTemplate({
        smsProcedureId: selectedProcDetail.id,
        formCode: formBuilderData.formCode,
        title: formBuilderData.title,
        contentSchema
      });

      toast.success('Tạo biểu mẫu liên kết thành công!');
      setShowFormBuilder(false);
      setFormBuilderData({ formCode: '', title: '', fields: [] });
      // Reload procedure details in background to refresh form templates list
      loadProcedureDetails(selectedProcDetail.id);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi tạo biểu mẫu');
    } finally {
      setCreatingTemplate(false);
    }
  };

  const handleCreateFormFromLibrary = async () => {
    if (!newFormCode.trim() || !newFormTitle.trim()) {
      toast.error('Vui lòng nhập mã và tiêu đề biểu mẫu!');
      return;
    }
    if (!newFormProcedureId) {
      toast.error('Vui lòng chọn một quy trình liên kết!');
      return;
    }
    if (formBuilderData.fields.length === 0) {
      toast.error('Vui lòng thêm ít nhất một trường dữ liệu.');
      return;
    }

    setFormLibraryLoading(true);
    try {
      const contentSchema = JSON.stringify(
        formBuilderData.fields.map(f => ({
          id: f.id,
          label: f.label,
          type: f.type,
          required: f.required,
          ...(f.type === 'select' && f.options ? { options: f.options.split(',').map(o => o.trim()).filter(Boolean) } : {})
        }))
      );

      await smsService.createFormTemplate({
        smsProcedureId: newFormProcedureId,
        formCode: newFormCode,
        title: newFormTitle,
        contentSchema
      });

      toast.success('Tạo và liên kết biểu mẫu thành công!');
      setShowNewFormModal(false);
      setNewFormCode('');
      setNewFormTitle('');
      setFormBuilderData({ formCode: '', title: '', fields: [] });
      loadFormLibrary();
      fetchTree(undefined, true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi tạo biểu mẫu');
    } finally {
      setFormLibraryLoading(false);
    }
  };

  const handleAssignFromLibrary = async () => {
    if (!assignProcedureId || !assignTemplateId) {
      toast.error('Vui lòng chọn quy trình để gán!');
      return;
    }
    setFormLibraryLoading(true);
    try {
      await smsService.assignTemplates(assignProcedureId, [assignTemplateId]);
      toast.success('Gán biểu mẫu vào quy trình thành công!');
      setShowAssignModal(false);
      loadFormLibrary();
      fetchTree(undefined, true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi gán biểu mẫu');
    } finally {
      setFormLibraryLoading(false);
    }
  };

  const handleOpenTemplateSelector = async () => {
    if (!selectedProcDetail) return;
    setLoadingSelector(true);
    setShowTemplateSelector(true);
    try {
      const templates = await smsService.getAllFormTemplates();
      // Filter out templates that are already assigned to the current procedure (by FormCode)
      const existingCodes = selectedProcDetail.formTemplates.map(t => t.formCode);
      const filtered = templates.filter(t => !existingCodes.includes(t.formCode));
      
      // Group/distinct by formCode so we don't show duplicates of the same form
      const uniqueTemplates: SmsFormTemplate[] = [];
      const seenCodes = new Set<string>();
      for (const t of filtered) {
        if (!seenCodes.has(t.formCode)) {
          seenCodes.add(t.formCode);
          uniqueTemplates.push(t);
        }
      }

      setAllFormTemplates(uniqueTemplates);
      setSelectedAssignIds([]);
      setSelectorSearch('');
    } catch (err) {
      toast.error('Không thể tải danh sách biểu mẫu có sẵn');
      setShowTemplateSelector(false);
    } finally {
      setLoadingSelector(false);
    }
  };

  const handleAssignTemplates = async () => {
    if (!selectedProcDetail) return;
    if (selectedAssignIds.length === 0) {
      toast.error('Vui lòng chọn ít nhất một biểu mẫu để gán');
      return;
    }
    setAssigningTemplates(true);
    try {
      const res = await smsService.assignTemplates(selectedProcDetail.id, selectedAssignIds);
      toast.success(res.message || 'Gán biểu mẫu vào quy trình thành công!');
      setShowTemplateSelector(false);
      // Reload procedure details & tree in background
      loadProcedureDetails(selectedProcDetail.id);
      fetchTree(undefined, true);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Lỗi khi gán biểu mẫu');
    } finally {
      setAssigningTemplates(false);
    }
  };

  const handleUnassignTemplate = (templateId: string, title: string) => {
    if (!selectedProcDetail) return;
    toast(`Bạn có chắc chắn muốn bỏ gán biểu mẫu "${title}" khỏi quy trình này?`, {
      action: {
        label: 'Bỏ gán',
        onClick: async () => {
          try {
            await smsService.deleteFormTemplate(templateId);
            toast.success('Bỏ gán biểu mẫu thành công!');
            loadProcedureDetails(selectedProcDetail.id);
            fetchTree(undefined, true);
          } catch (err: any) {
            toast.error(err.response?.data?.message || 'Lỗi khi bỏ gán biểu mẫu');
          }
        },
      },
      cancel: { label: 'Hủy', onClick: () => {} },
      duration: 8000,
    });
  };

  void showFormBuilder;
  void creatingTemplate;
  void setAssignTemplateId;
  void handleCreateFormTemplate;
  void handleOpenTemplateSelector;
  void handleUnassignTemplate;

  const addFormField = () => {
    const newId = `field_${Date.now()}`;
    setFormBuilderData(prev => ({
      ...prev,
      fields: [...prev.fields, { id: newId, label: '', type: 'text', required: false }]
    }));
  };

  const updateFormField = (idx: number, key: string, value: any) => {
    setFormBuilderData(prev => ({
      ...prev,
      fields: prev.fields.map((f, i) => i === idx ? { ...f, [key]: value } : f)
    }));
  };

  const removeFormField = (idx: number) => {
    setFormBuilderData(prev => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== idx)
    }));
  };

  // ─── Render Helpers ────────────────────────────────────────

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Active':
        return <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs px-2.5 py-1 rounded-full font-semibold border border-emerald-200 dark:border-emerald-900">Hiệu lực</span>;
      case 'Obsolete':
        return <span className="bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-300 text-xs px-2.5 py-1 rounded-full font-semibold border border-rose-200 dark:border-rose-900">Lỗi thời (Obsolete)</span>;
      case 'Draft':
        return <span className="bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-300 text-xs px-2.5 py-1 rounded-full font-semibold border border-slate-200 dark:border-slate-650">Bản thảo</span>;
      default:
        return <span className="bg-blue-150 text-blue-800 text-xs px-2.5 py-1 rounded-full font-semibold">{status}</span>;
    }
  };

  const getRecordStatusBadge = (status: string) => {
    switch (status) {
      case 'Draft':
        return <span className="bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-xs px-2 py-0.5 rounded font-medium">Bản nháp</span>;
      case 'Submitted':
        return <span className="bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 text-xs px-2 py-0.5 rounded font-medium animate-pulse">Chờ duyệt</span>;
      case 'Approved':
        return <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-xs px-2 py-0.5 rounded font-medium">Đã duyệt</span>;
      default:
        return <span className="bg-slate-100 text-slate-800 text-xs px-2 py-0.5 rounded">{status}</span>;
    }
  };

  // ─── Main Render ───────────────────────────────────────────
  return (
    <div className={templateId ? "flex flex-col h-screen bg-slate-50 dark:bg-slate-900 overflow-hidden" : "flex flex-col h-[calc(100vh-64px)] bg-slate-50 dark:bg-slate-900 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800"}>
      
      {isImportingDocx ? (
        /* ─── DEDICATED FULL-PAGE IMPORT WORKSPACE ─── */
        <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex-shrink-0 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsImportingDocx(false)}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500 transition-colors"
                title="Quay lại Workspace"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-sm font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-blue-500" />
                  Workspace: Số hóa Quy trình từ tài liệu (.docx, .doc, .pdf)
                </h2>
                <p className="text-xs text-slate-500">Nhập, tùy chỉnh và ban hành quy trình mới hoặc cập nhật quy trình hiện tại</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {importForm.replaceExisting && importForm.existingProcedureId && (
                <button
                  onClick={async () => {
                    if (!showDiffPreview) {
                      toast.info('Đang tạo bản so sánh nội dung...');
                      try {
                        const oldProc = await smsService.getProcedure(importForm.existingProcedureId);
                        const diff = diffHtml(oldProc.content, importedHtml);
                        setImportedHtml(diff);
                        setShowDiffPreview(true);
                        toast.success('Đã bật chế độ xem Track Changes (đỏ = xóa, xanh = thêm)');
                      } catch {
                        toast.error('Không thể tải quy trình cũ để so sánh');
                      }
                    } else {
                      setShowDiffPreview(false);
                      setImportedHtml(importedHtmlBackup);
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                    showDiffPreview 
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' 
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200'
                  }`}
                >
                  <GitCompare className="w-3.5 h-3.5" />
                  {showDiffPreview ? 'Xem bản gốc' : 'So sánh thay đổi (Track changes)'}
                </button>
              )}
            </div>
          </div>

          {/* Form and Preview Split View */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left Column: Properties Form */}
            <div className="w-[360px] border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-5 overflow-y-auto space-y-4 flex-shrink-0">
              
              {/* Chapter select */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Chương ISM Code liên kết</label>
                <select
                  value={importForm.ismElementId}
                  onChange={(e) => setImportForm(prev => ({ ...prev, ismElementId: parseInt(e.target.value) }))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-850 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {Array.from({ length: 16 }, (_, idx) => idx + 1).map(num => (
                    <option key={num} value={num}>Điều {num}: {
                      num === 1 ? 'Chính sách chung' :
                      num === 2 ? 'An toàn & Bảo vệ môi trường' :
                      num === 3 ? 'Trách nhiệm & Quyền hạn Công ty' :
                      num === 4 ? 'Người được chỉ định (DPA)' :
                      num === 5 ? 'Trách nhiệm & Quyền hạn Thuyền trưởng' :
                      num === 6 ? 'Nguồn lực & Nhân sự' :
                      num === 7 ? 'Xây dựng kế hoạch hoạt động trên tàu' :
                      num === 8 ? 'Chuẩn bị sẵn sàng ứng phó tình huống khẩn cấp' :
                      num === 9 ? 'Báo cáo & Phân tích sự cố' :
                      num === 10 ? 'Bảo dưỡng tàu và thiết bị' :
                      num === 11 ? 'Kiểm soát tài liệu & dữ liệu' :
                      num === 12 ? 'Đánh giá của công ty & xem xét của Ban giám đốc' :
                      num === 13 ? 'Chứng nhận và Thời hạn hiệu lực' :
                      num === 14 ? 'Chứng nhận tạm thời' :
                      num === 15 ? 'Xác minh và Đánh giá' :
                      num === 16 ? 'Mẫu Giấy chứng nhận' :
                      `Điều khoản ${num}`
                    }</option>
                  ))}
                </select>
              </div>

              {/* Checkbox replace existing procedure */}
              <div className="p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/50 rounded-xl flex items-start gap-2.5 animate-in fade-in duration-300">
                <input
                  type="checkbox"
                  id="replaceExistingCheckbox"
                  checked={importForm.replaceExisting}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    let extId = '';
                    let newVer = 'Rev 2.0';
                    let code = importForm.procedureCode;
                    let title = importForm.title;
                    
                    if (checked) {
                      const activeProcs = treeData.flatMap(ch => ch.procedures).filter(p => p.status === 'Active');
                      if (activeProcs.length > 0) {
                        extId = activeProcs[0].id;
                        code = activeProcs[0].procedureCode;
                        title = activeProcs[0].title;
                        const currentVer = activeProcs[0].version;
                        const verNumMatch = currentVer.match(/\d+(\.\d+)?/);
                        if (verNumMatch) {
                          const nextVal = (parseFloat(verNumMatch[0]) + 1.0).toFixed(1);
                          newVer = currentVer.replace(verNumMatch[0], nextVal);
                        }
                      }
                    }
                    
                    setImportForm(prev => ({
                      ...prev,
                      replaceExisting: checked,
                      existingProcedureId: extId,
                      procedureCode: code,
                      title: title,
                      version: newVer
                    }));
                  }}
                  className="mt-1 h-3.5 w-3.5 text-blue-600 border-slate-350 rounded focus:ring-blue-500 cursor-pointer"
                />
                <label htmlFor="replaceExistingCheckbox" className="text-xs text-blue-800 dark:text-blue-300 font-semibold select-none cursor-pointer">
                  Thay thế/Cập nhật quy trình hiện có (Lưu lịch sử kiểm soát tài liệu - ISM Clause 11)
                </label>
              </div>

              {/* Selection of existing procedure if replacing */}
              {importForm.replaceExisting && (
                <div className="space-y-3 p-3 bg-slate-100/50 dark:bg-slate-850/50 rounded-xl border border-slate-200 dark:border-slate-800 animate-in slide-in-from-top-2 duration-200">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Lọc theo Chương ISM</label>
                    <select
                      value={replaceChapterFilter}
                      onChange={(e) => {
                        const val = e.target.value;
                        setReplaceChapterFilter(val === 'ALL' ? 'ALL' : parseInt(val));
                      }}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-850 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 mb-2 font-medium"
                    >
                      <option value="ALL">Tất cả các chương</option>
                      {treeData.map(ch => (
                        <option key={ch.id} value={ch.id}>Điều {ch.id}: {ch.chapterName.split('(')[0]}</option>
                      ))}
                    </select>

                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Chọn quy trình cần thay thế</label>
                    <select
                      value={importForm.existingProcedureId}
                      onChange={(e) => {
                        const selectedId = e.target.value;
                        const matched = treeData.flatMap(ch => ch.procedures).find(p => p.id === selectedId);
                        if (matched) {
                          const currentVer = matched.version;
                          const verNumMatch = currentVer.match(/\d+(\.\d+)?/);
                          let newVer = 'Rev 2.0';
                          if (verNumMatch) {
                            const nextVal = (parseFloat(verNumMatch[0]) + 1.0).toFixed(1);
                            newVer = currentVer.replace(verNumMatch[0], nextVal);
                          }
                          setImportForm(prev => ({
                            ...prev,
                            existingProcedureId: selectedId,
                            procedureCode: matched.procedureCode,
                            title: matched.title,
                            version: newVer
                          }));
                        }
                      }}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-850 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    >
                      {treeData
                        .filter(ch => replaceChapterFilter === 'ALL' || ch.id === replaceChapterFilter)
                        .flatMap(ch => ch.procedures)
                        .filter(p => p.status === 'Active')
                        .map(p => (
                          <option key={p.id} value={p.id}>{p.procedureCode} - {p.title}</option>
                        ))
                      }
                    </select>
                  </div>
                </div>
              )}

              {/* Code input */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Mã số Quy trình (SOP Code)</label>
                <input
                  type="text"
                  placeholder="Ví dụ: SOP-07-02"
                  value={importForm.procedureCode}
                  onChange={(e) => setImportForm(prev => ({ ...prev, procedureCode: e.target.value }))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-850 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              {/* Title input */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Tiêu đề quy trình</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Quy trình chuẩn bị ứng phó sự cố"
                  value={importForm.title}
                  onChange={(e) => setImportForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-850 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                />
              </div>

              {/* Version input */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Phiên bản ban hành</label>
                <input
                  type="text"
                  placeholder="Rev 1.0"
                  value={importForm.version}
                  onChange={(e) => setImportForm(prev => ({ ...prev, version: e.target.value }))}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-850 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              {/* Change Note for Version Bump */}
              {importForm.replaceExisting && (
                <div className="animate-in fade-in duration-300">
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">
                    Lý do thay đổi / Control log <span className="text-rose-500 font-bold">*</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Điền tóm tắt lý do cập nhật quy trình để ghi nhận vào lịch sử kiểm soát tài liệu..."
                    value={importForm.changeNote}
                    onChange={(e) => setImportForm(prev => ({ ...prev, changeNote: e.target.value }))}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-850 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 font-sans leading-relaxed"
                  />
                </div>
              )}
            </div>

            {/* Right Column: Preview Area */}
            <div className="flex-1 bg-slate-100 dark:bg-slate-950 p-6 overflow-hidden flex flex-col min-w-0">
              <div className="flex items-center justify-between mb-3 flex-shrink-0">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-blue-500" />
                  Xem trước nội dung văn bản (Read-only Preview)
                </span>
                <span className="text-xs bg-blue-55 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 px-2.5 py-1 rounded-full font-bold border border-blue-100 dark:border-blue-900/50">
                  Chế độ chỉ đọc bảo mật
                </span>
              </div>
              <div className="flex-1 overflow-hidden h-full flex flex-col">
                {importedFilePath ? (
                  <iframe
                    src={formatPdfUrl(importedFilePath)}
                    className="w-full h-full min-h-[450px] border border-slate-200 dark:border-slate-800 bg-slate-105 dark:bg-slate-900 rounded-xl shadow-sm"
                    title="Import PDF Preview"
                  />
                ) : (
                  <div className="flex-1 overflow-y-auto">
                    <div className="p-8 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-xl font-serif leading-relaxed text-[0.9375rem] space-y-4 md:space-y-6 prose dark:prose-invert max-w-none min-h-[450px] shadow-sm">
                      <div dangerouslySetInnerHTML={{ __html: importedHtml }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer Bar */}
          <div className="px-6 py-4 bg-white dark:bg-slate-850 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3 flex-shrink-0 shadow-md">
            <button
              onClick={() => setIsImportingDocx(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition-all duration-250"
            >
              Hủy bỏ
            </button>
            <PermissionGate permission="hsqe.create"><button
              onClick={handlePublishImport}
              disabled={importForm.replaceExisting && !importForm.changeNote.trim()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-all duration-250 flex items-center gap-1.5 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              title={importForm.replaceExisting && !importForm.changeNote.trim() ? 'Yêu cầu điền lý do thay đổi phiên bản' : ''}
            >
              <Check className="w-4 h-4" /> Ban hành & Đồng bộ đội tàu
            </button></PermissionGate>
          </div>
        </div>
      ) : (
        <>
          {/* Header bar */}
          {!templateId && (
            <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-850 border-b border-slate-200 dark:border-slate-850 flex-shrink-0 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                  <Shield className="w-5 h-5" />
                </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 dark:text-white">Safety Management System (SMS) Dashboard</h2>
              <p className="text-xs text-slate-400 dark:text-slate-400">Hệ thống Quản lý tài liệu Quy trình (SOP) & Biểu mẫu Ký số tàu biển</p>
            </div>
          </div>

          {/* View mode toggle */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewMode('workspace')}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                viewMode === 'workspace'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-250 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
              }`}
            >
              <BookOpen className="w-4 h-4" /> Workspace
            </button>
            <button
              onClick={() => setViewMode('auditor')}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                viewMode === 'auditor'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-250 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
              }`}
            >
              <Database className="w-4 h-4" /> Auditor Search
            </button>
            <button
              onClick={() => setViewMode('forms')}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                viewMode === 'forms'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-250 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750'
              }`}
            >
              <Layers className="w-4 h-4" /> Form Library
            </button>
          </div>
        </div>
      )}

      {/* Loader */}
      {loading && !templateId ? (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500 mb-2" />
          <p className="text-sm">Đang tải cơ sở dữ liệu SMS...</p>
        </div>
      ) : viewMode === 'workspace' ? (
        
        /* ─── WORKSPACE VIEW ─── */
        <div className="flex flex-1 overflow-hidden">
          
          {/* Left Panel: Sidebar Tree */}
          {!templateId && (
            <div className={`w-[300px] border-r flex flex-col flex-shrink-0 transition-all duration-300 relative ${
              treeTheme === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}>
            <div className={`p-4 border-b flex items-center justify-between transition-colors ${
              treeTheme === 'dark' ? 'bg-slate-950 border-slate-850' : 'bg-white border-slate-200'
            }`}>
              <span className="text-xs uppercase tracking-wider font-extrabold text-slate-500">Cây thư mục ISM Code</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowObsolete(v => !v)}
                  className={`p-1 rounded-md transition-colors text-xs font-semibold flex items-center gap-1 ${
                    showObsolete
                      ? 'bg-rose-100 text-rose-600 hover:bg-rose-200'
                      : 'hover:bg-slate-200 text-slate-400'
                  }`}
                  title={showObsolete ? 'Ẩn quy trình lỗi thời' : 'Hiện quy trình lỗi thời'}
                >
                  <History className="w-3.5 h-3.5" />
                </button>
                <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-bold ${
                  treeTheme === 'dark' ? 'bg-slate-800 text-slate-300' : 'bg-slate-200 text-slate-700'
                }`}>v2.0</span>
              </div>
            </div>

            {/* Search Input Bar */}
            <div className={`px-4 py-2 border-b transition-colors flex items-center gap-2 ${
              treeTheme === 'dark' ? 'bg-slate-900/60 border-slate-800' : 'bg-slate-100/40 border-slate-200'
            }`}>
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm kiếm quy trình..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className={`w-full bg-transparent border-0 text-xs focus:ring-0 outline-none placeholder-slate-400 ${
                  treeTheme === 'dark' ? 'text-white' : 'text-slate-800'
                }`}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    fetchTree('');
                  }}
                  className="text-slate-400 hover:text-slate-600 dark:hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 scrollbar-thin">
              {treeData.map(chapter => (
                <div key={chapter.id} className="space-y-1">
                  {/* Chapter Trigger */}
                  <button
                    onClick={() => toggleChapter(chapter.id)}
                    className={`w-full flex items-center justify-between px-2.5 py-2 text-left rounded-lg transition-all group ${
                      treeTheme === 'dark' 
                        ? 'text-slate-300 hover:bg-slate-800 hover:text-white' 
                        : 'text-slate-700 hover:bg-slate-200 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-start gap-2 max-w-[220px]">
                      <span className="text-blue-500 font-bold font-mono text-sm pt-0.5">{chapter.id}.</span>
                      <span className="text-xs font-semibold leading-relaxed group-hover:translate-x-0.5 transition-transform truncate">{chapter.chapterName}</span>
                    </div>
                    <div>
                      {expandedChapters[chapter.id] ? (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                      )}
                    </div>
                  </button>

                  {/* Chapter Procedures */}
                  {expandedChapters[chapter.id] && (
                    <div className={`pl-4 pr-1 space-y-1 border-l ml-4 animate-in fade-in duration-200 ${
                      treeTheme === 'dark' ? 'border-slate-800' : 'border-slate-200'
                    }`}>
                      {chapter.procedures.filter(p => showObsolete || p.status !== 'Obsolete').length === 0 ? (
                        <span className="text-xs text-slate-500 block py-1 italic">Không có tài liệu</span>
                      ) : (
                        chapter.procedures.filter(p => showObsolete || p.status !== 'Obsolete').map(proc => (
                          <div key={proc.id} className="space-y-0.5">
                            {/* Procedure Link */}
                            <button
                              onClick={() => {
                                setSelectedProcId(proc.id);
                                setIsEditingSop(false);
                              }}
                              onContextMenu={(e) => handleContextMenu(e, proc)}
                              className={`w-full flex items-start gap-2 px-2.5 py-1.5 rounded-md text-left text-xs transition-all ${
                                selectedProcId === proc.id
                                  ? 'bg-blue-600 text-white font-medium shadow-sm'
                                  : (treeTheme === 'dark'
                                    ? 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                                    : 'text-slate-650 hover:bg-slate-200 hover:text-slate-900')
                              }`}
                            >
                              <FileText className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                              <div className="truncate flex-1">
                                <span className={`font-mono text-xs opacity-75 mr-1 px-1 py-0.2 rounded ${
                                  treeTheme === 'dark' ? 'bg-slate-950 text-slate-400' : 'bg-slate-200 text-slate-700'
                                }`}>{proc.procedureCode}</span>
                                {proc.title}
                                {proc.status === 'Obsolete' && (
                                  <span className="ml-1 text-xs bg-rose-500 text-white px-1 rounded font-semibold">Lỗi thời</span>
                                )}
                              </div>
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Dòng trống cuối cùng danh sách của ISM Code */}
              <div className="pt-2 px-1 pb-4">
                <PermissionGate permission="hsqe.create"><button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={importLoading}
                  className={`w-full h-10 rounded-lg border border-dashed transition-all flex items-center justify-center gap-2 ${
                    treeTheme === 'dark'
                      ? 'border-slate-800/60 hover:border-slate-700 hover:bg-slate-850/50 text-slate-600 hover:text-slate-400'
                      : 'border-slate-200 hover:border-slate-350 hover:bg-slate-100 hover:text-slate-650'
                  }`}
                  title="Click để tải lên quy trình mới (.docx/.pdf)"
                >
                  {importLoading ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />
                  ) : (
                    <Plus className="w-3.5 h-3.5 opacity-55" />
                  )}
                  <span className="text-xs font-semibold">{importLoading ? 'Đang xử lý...' : 'Tải quy trình mới...'}</span>
                </button></PermissionGate>
              </div>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={handleDocxFileChange}
              accept=".docx,.doc,.pdf"
              className="hidden"
            />
            {importLoading && (
              <div className="absolute inset-0 bg-white/90 dark:bg-slate-900/90 flex flex-col items-center justify-center z-20 rounded-b-xl gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
                <div className="text-sm font-bold text-slate-700 dark:text-white">Đang bóc tách tài liệu...</div>
                <div className="text-xs text-slate-400">Vui lòng chờ, quá trình sẽ hoàn tất tự động</div>
                <div className="w-32 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full animate-pulse" style={{width: '70%'}} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Right Panel: Split Workspace */}
        <div className="flex-1 flex overflow-hidden">
            {(selectedProcId || templateId) ? (
              <div className="flex-1 flex overflow-hidden divide-x divide-slate-200 dark:divide-slate-800">
                
                {/* SPLIT 1: Procedure Document Viewer */}
                {!isFormMaximized && (
                  <div className={`${isFormsSidebarOpen ? 'flex-1' : 'w-full'} flex flex-col h-full bg-white dark:bg-slate-900 overflow-hidden relative`}>
                  
                  {/* OBOSLETE WATERMARK OVERLAY */}
                  {selectedProcDetail?.status === 'Obsolete' && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 overflow-hidden select-none">
                      <div className="text-rose-500/10 dark:text-rose-500/5 font-extrabold text-7xl uppercase border-8 border-rose-500/15 dark:border-rose-500/5 px-8 py-4 rounded-3xl transform -rotate-45 leading-none tracking-widest">
                        OBSOLETE
                        <div className="text-2xl text-center mt-2 font-mono">{selectedProcDetail.obsoleteDate?.split('T')[0]}</div>
                      </div>
                    </div>
                  )}
                  {selectedProcDetail?.status === 'Active' && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 overflow-hidden select-none">
                      <div className="text-blue-500/[0.04] dark:text-blue-400/[0.02] font-extrabold text-6xl uppercase border-4 border-blue-500/[0.04] px-6 py-2 rounded-2xl transform -rotate-45 leading-none tracking-widest">
                        CONTROLLED COPY
                      </div>
                    </div>
                  )}

                  {/* SOP Header */}
                  <div className="px-6 py-4 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold text-blue-600 bg-blue-100 dark:bg-blue-950 dark:text-blue-400 px-2 py-0.5 rounded">
                          {selectedProcDetail?.procedureCode}
                        </span>
                        <span className="text-slate-400 text-xs">Version {selectedProcDetail?.version}</span>
                        {selectedProcDetail && getStatusBadge(selectedProcDetail.status)}
                      </div>
                      <h3 className="font-bold text-slate-800 dark:text-white truncate text-base">{selectedProcDetail?.title}</h3>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {selectedProcDetail && (
                        <button
                          onClick={handlePrintSop}
                          className="p-2 text-slate-500 hover:text-slate-800 dark:hover:text-white bg-slate-200/50 hover:bg-slate-200 dark:bg-slate-800 rounded-lg transition"
                          title="In / Xuất PDF Quy trình"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                      )}

                      {selectedProcDetail && (
                        <button
                          onClick={() => {
                            setIsFormsSidebarOpen(!isFormsSidebarOpen);
                            setSelectedTemplate(null);
                          }}
                          className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold border rounded-lg transition ${
                            isFormsSidebarOpen
                              ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                              : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 border-emerald-200 dark:border-emerald-900'
                          }`}
                          title="Đóng/Mở biểu mẫu liên kết"
                        >
                          <Send className="w-3 h-3" />
                          {selectedProcDetail.formTemplates?.length || 0} biểu mẫu
                        </button>
                      )}
                    </div>
                  </div>

                  {/* SOP Scrollable Content */}
                  <div className={`flex-1 ${selectedProcDetail?.filePath?.endsWith('.pdf') && !isEditingSop ? 'overflow-hidden p-0' : 'overflow-y-auto p-8'} scrollbar-thin`}>
                    {loadingProc ? (
                      <div className="h-full flex items-center justify-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Đang tải...
                      </div>
                    ) : isEditingSop ? (
                      /* SOP EDITING VIEW */
                      <div className="space-y-4 max-w-2xl p-8">
                        <div className="p-4 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl flex items-start gap-2.5">
                          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                          <div className="text-xs text-amber-800 dark:text-amber-300">
                            <strong>BUMP VERSION CONTROL:</strong> Khi bạn lưu phiên bản mới, phiên bản hiện tại ({selectedProcDetail?.version}) sẽ tự động chuyển sang trạng thái <strong>Lỗi thời (Obsolete)</strong> và tất cả đội tàu sẽ nhận được phiên bản mới sau khi đồng bộ.
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Mã số phiên bản mới</label>
                          <input
                            type="text"
                            value={sopEditVersion}
                            onChange={(e) => setSopEditVersion(e.target.value)}
                            placeholder="Ví dụ: Rev 2.0"
                            className="w-full px-3 py-2 rounded-lg border border-slate-250 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-850 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Nội dung quy trình (HTML/Rich-text)</label>
                          <RichTextEditor
                            content={sopEditContent}
                            onChange={(html) => setSopEditContent(html)}
                            placeholder="Nhập nội dung quy trình..."
                            minHeight="350px"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Ghi chú thay đổi (Change Note)</label>
                          <textarea
                            rows={3}
                            value={sopEditChangeNote}
                            onChange={(e) => setSopEditChangeNote(e.target.value)}
                            placeholder="Nhập lý do cập nhật phiên bản mới (ví dụ: Cập nhật sơ đồ tổ chức theo Nghị quyết IMO mới)..."
                            className="w-full px-3 py-2 rounded-lg border border-slate-250 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>

                        <div className="flex gap-2">
                          <PermissionGate permission="hsqe.update"><button
                            onClick={handleBumpSopVersion}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5"
                          >
                            <Save className="w-3.5 h-3.5" /> Ban hành & Thay thế
                          </button></PermissionGate>
                          <button
                            onClick={() => setIsEditingSop(false)}
                            className="px-4 py-2 bg-slate-205 text-slate-650 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 rounded-lg text-xs font-semibold"
                          >
                            Hủy bỏ
                          </button>
                        </div>
                      </div>
                    ) : selectedProcDetail?.filePath && isPdfFile(selectedProcDetail.filePath) ? (
                      /* PDF FULL VIEW */
                      <iframe
                        src={formatPdfUrl(selectedProcDetail.filePath)}
                        className="w-full h-full min-h-[600px] border-0 bg-slate-100 dark:bg-slate-900"
                        title={selectedProcDetail.title}
                      />
                    ) : (
                      /* SOP NORMAL VIEW */
                      <div className="max-w-2xl mx-auto space-y-6">
                        {selectedProcDetail?.changeNote && (
                          <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-xl flex items-start gap-2.5 shadow-sm animate-in fade-in duration-300">
                            <History className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                            <div>
                              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-0.5">Nhật ký cập nhật phiên bản:</div>
                              <div className="text-xs text-slate-650 dark:text-slate-450 italic">"{selectedProcDetail.changeNote}"</div>
                            </div>
                          </div>
                        )}

                        {/* Serif text document body */}
                        <div 
                          className="font-serif text-slate-800 dark:text-slate-200 leading-relaxed text-[0.9375rem] space-y-4 md:space-y-6 prose dark:prose-invert max-w-none"
                          dangerouslySetInnerHTML={{ __html: selectedProcDetail?.content || '' }}
                        />

                        <hr className="border-slate-200 dark:border-slate-800 pt-2" />
                      </div>
                    )}
                  </div>
                </div>
              )}

                {/* SPLIT 2: Suggested Forms & Web Form Renderer (Collapsible Sidebar) */}
                {isFormsSidebarOpen && (
                  <div className={`${isFormMaximized ? 'w-full' : (selectedTemplate?.formCode === 'TL-02-01' ? 'w-[800px]' : ((selectedTemplate?.formCode === 'TL-26-03' || selectedTemplate?.formCode === 'TL-15-01') ? 'w-[950px]' : 'w-[420px]'))} flex-shrink-0 flex flex-col h-full bg-slate-50 dark:bg-slate-905 overflow-hidden transition-all duration-300 border-l border-slate-200 dark:border-slate-800`}>
                    
                    {selectedTemplate ? (
                      /* DYNAMIC E-FORM FILLER WORKSPACE */
                      <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-slate-900">
                      
                      {/* E-Form Header */}
                      <div className="px-6 py-4 bg-slate-55 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between flex-shrink-0">
                        <div>
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs bg-slate-200 dark:bg-slate-800 font-mono font-bold text-slate-700 dark:text-slate-300 px-1.5 py-0.2 rounded">
                              {selectedTemplate.formCode}
                            </span>
                            {recordStatus && getRecordStatusBadge(recordStatus)}
                          </div>
                          <h4 className="font-bold text-slate-800 dark:text-white text-sm">{selectedTemplate.title}</h4>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {!templateId && (
                            <button
                              type="button"
                              onClick={() => setIsFormMaximized(!isFormMaximized)}
                              className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition text-slate-500 hover:text-slate-700 dark:hover:text-white"
                              title={isFormMaximized ? "Thu nhỏ" : "Phóng to toàn màn hình"}
                            >
                              {isFormMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (templateId) {
                                navigate('/safety/hsqe');
                              } else {
                                setSelectedTemplate(null);
                                setIsFormMaximized(false);
                              }
                            }}
                            className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition text-slate-500 hover:text-slate-750 dark:hover:text-white"
                            title="Đóng"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* E-Form Scrollable Form Inputs */}
                      <div className="flex-1 overflow-y-auto p-6 space-y-5 scrollbar-thin">
                        
                        {selectedTemplate.formCode === 'TL-26-03' ? (
                          /* CUSTOM HIGH-FIDELITY FORM FOR TL-26-03 */
                          <div className="max-w-5xl mx-auto bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 p-6 shadow-md rounded-xl font-sans text-slate-800 dark:text-slate-200 text-xs">
                            {/* Paper-like Header Table */}
                            <div className="border border-slate-300 dark:border-slate-700 grid grid-cols-12 items-stretch text-center font-sans">
                              {/* Logo Box */}
                              <div className="col-span-3 border-r border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center p-3">
                                <div className="w-10 h-10 rounded-full border-2 border-blue-650 flex items-center justify-center mb-1 text-blue-650 text-base font-bold">⚓</div>
                                <span className="text-xs font-extrabold tracking-tight leading-tight text-blue-900 dark:text-blue-300 uppercase">HP SHIPPING</span>
                                <span className="text-xs text-slate-500 font-medium">Hòa Phát Sea Transport</span>
                              </div>
                              {/* Document Title Box */}
                              <div className="col-span-6 border-r border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center p-3 bg-slate-50/30 dark:bg-slate-900/30">
                                <h3 className="font-extrabold text-xs leading-snug uppercase tracking-tight text-slate-800 dark:text-white">
                                  LỊCH LÀM VỆ SINH BẾP, CÁC KHO THỰC PHẨM,<br/>KHU VỰC SINH HOẠT CHUNG, PHÒNG Ở
                                </h3>
                                <div className="w-16 h-0.5 bg-blue-500 my-1"></div>
                                <span className="italic text-xs text-slate-500 font-semibold tracking-wide uppercase leading-tight">
                                  ACCOMMODATIONS, STORE, GALLEY CLEANING SCHEDULE
                                </span>
                              </div>
                              {/* Document Meta Box */}
                              <div className="col-span-3 flex flex-col justify-center p-3 text-left text-xs space-y-1 bg-slate-50/10">
                                <div><strong>Mã biểu mẫu:</strong> <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">TL-26-03</span></div>
                                <div><strong>Ngày ban hành:</strong> <span className="font-mono">20/10/2016</span></div>
                                <div><strong>Lần sửa đổi:</strong> <span className="font-mono">0</span></div>
                                <div><strong>Trang:</strong> <span className="font-mono">1 / 1</span></div>
                              </div>
                            </div>

                            {/* Metadata Inputs Row */}
                            <div className="grid grid-cols-2 gap-4 border-x border-b border-slate-300 dark:border-slate-700 p-4 bg-slate-50/50 dark:bg-slate-900/40 font-sans text-xs">
                              <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tên tàu / Ship's Name <span className="text-red-500">*</span></label>
                                <input
                                  type="text"
                                  value={formValues['shipName'] || ''}
                                  onChange={(e) => handleFormFieldChange('shipName', e.target.value)}
                                  disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 font-semibold"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tháng / Month-Year <span className="text-red-500">*</span></label>
                                <input
                                  type="text"
                                  placeholder="e.g. 06/2026"
                                  value={formValues['monthYear'] || ''}
                                  onChange={(e) => handleFormFieldChange('monthYear', e.target.value)}
                                  disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 font-semibold"
                                />
                              </div>
                            </div>

                            {/* Cleaning Schedule Grid Table */}
                            <div className="mt-4 border border-slate-300 dark:border-slate-750 rounded-lg overflow-hidden">
                              <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                  <tr className="bg-slate-100 dark:bg-slate-850 text-slate-700 dark:text-slate-200 uppercase font-bold text-xs border-b border-slate-300 dark:border-slate-750">
                                    <th className="p-2 border-r border-slate-300 dark:border-slate-750 w-[45px] text-center">STT</th>
                                    <th className="p-2 border-r border-slate-300 dark:border-slate-750 w-[200px]">Hạng mục / Item</th>
                                    <th className="p-2 border-r border-slate-300 dark:border-slate-750 w-[120px]">Chu kỳ / Frequency</th>
                                    <th className="p-2 border-r border-slate-300 dark:border-slate-750 w-[280px]">Phương thức vệ sinh / Method</th>
                                    <th className="p-2 border-r border-slate-300 dark:border-slate-750 w-[150px]">Người thực hiện / Performer</th>
                                    <th className="p-2">Lưu ý / Note</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {cleaningCategories.map((category) => (
                                    <React.Fragment key={category.prefix}>
                                      {/* Category Header Row */}
                                      <tr className="bg-blue-50/40 dark:bg-blue-950/20 text-blue-800 dark:text-blue-300 font-bold border-b border-slate-300 dark:border-slate-750">
                                        <td colSpan={6} className="p-2 text-xs uppercase tracking-wider font-extrabold">{category.title}</td>
                                      </tr>
                                      {category.items.map((item) => {
                                        const key = `${category.prefix}_perf_${item.num}`;
                                        return (
                                          <tr key={item.num} className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-850/30">
                                            <td className="p-2 border-r border-slate-200 dark:border-slate-800 text-center text-slate-500 font-mono">{item.num}</td>
                                            <td className="p-2 border-r border-slate-200 dark:border-slate-800 font-semibold text-slate-900 dark:text-slate-100">{item.name}</td>
                                            <td className="p-2 border-r border-slate-200 dark:border-slate-800 text-slate-650 dark:text-slate-400 italic">{item.cycle}</td>
                                            <td className="p-2 border-r border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-450 leading-relaxed">{item.method}</td>
                                            <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                                              <input
                                                type="text"
                                                placeholder="..."
                                                value={formValues[key] || ''}
                                                onChange={(e) => handleFormFieldChange(key, e.target.value)}
                                                disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                                className="w-full px-2 py-1 rounded border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-850 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 text-xs"
                                              />
                                            </td>
                                            <td className="p-2 text-slate-500 italic text-xs">{item.note}</td>
                                          </tr>
                                        );
                                      })}
                                    </React.Fragment>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ) : selectedTemplate.formCode === 'TL-15-01' ? (
                          /* CUSTOM HIGH-FIDELITY FORM FOR TL-15-01 */
                          <div className="max-w-5xl mx-auto bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 p-6 shadow-md rounded-xl font-sans text-slate-800 dark:text-slate-200 text-xs">
                            {/* Paper-like Header Table */}
                            <div className="border border-slate-300 dark:border-slate-700 grid grid-cols-12 items-stretch text-center font-sans">
                              {/* Logo Box */}
                              <div className="col-span-3 border-r border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center p-3">
                                <div className="w-10 h-10 rounded-full border-2 border-blue-650 flex items-center justify-center mb-1 text-blue-650 text-base font-bold">⚓</div>
                                <span className="text-xs font-extrabold tracking-tight leading-tight text-blue-900 dark:text-blue-300 uppercase">HP SHIPPING</span>
                                <span className="text-xs text-slate-500 font-medium">Hòa Phát Sea Transport</span>
                              </div>
                              {/* Document Title Box */}
                              <div className="col-span-6 border-r border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center p-3 bg-slate-50/30 dark:bg-slate-900/30">
                                <h3 className="font-extrabold text-xs leading-snug uppercase tracking-tight text-slate-800 dark:text-white">
                                  KẾ HOẠCH NHẬN NHIÊN LIỆU
                                </h3>
                                <div className="w-16 h-0.5 bg-blue-500 my-1"></div>
                                <span className="italic text-xs text-slate-500 font-semibold tracking-wide uppercase leading-tight">
                                  BUNKERING PLAN
                                </span>
                              </div>
                              {/* Document Meta Box */}
                              <div className="col-span-3 flex flex-col justify-center p-3 text-left text-xs space-y-1 bg-slate-50/10">
                                <div><strong>Mã biểu mẫu:</strong> <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">TL-15-01</span></div>
                                <div><strong>Ngày ban hành:</strong> <span className="font-mono">20/10/2016</span></div>
                                <div><strong>Lần sửa đổi:</strong> <span className="font-mono">0</span></div>
                                <div><strong>Trang:</strong> <span className="font-mono">1 / 3</span></div>
                              </div>
                            </div>

                            {/* Metadata Inputs Row */}
                            <div className="grid grid-cols-3 gap-4 border-x border-b border-slate-300 dark:border-slate-700 p-4 bg-slate-50/50 dark:bg-slate-900/40 font-sans text-xs">
                              <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tàu / Vessel <span className="text-red-500">*</span></label>
                                <input
                                  type="text"
                                  value={formValues['vessel'] || ''}
                                  onChange={(e) => handleFormFieldChange('vessel', e.target.value)}
                                  disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 font-semibold"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Vị trí / Location <span className="text-red-500">*</span></label>
                                <input
                                  type="text"
                                  value={formValues['location'] || ''}
                                  onChange={(e) => handleFormFieldChange('location', e.target.value)}
                                  disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 font-semibold"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Xà lan/Cảng / Supply Barge/Terminal <span className="text-red-500">*</span></label>
                                <input
                                  type="text"
                                  value={formValues['supplyBarge'] || ''}
                                  onChange={(e) => handleFormFieldChange('supplyBarge', e.target.value)}
                                  disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 font-semibold"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Ngày / Date <span className="text-red-500">*</span></label>
                                <input
                                  type="date"
                                  value={formValues['bunkerDate'] || ''}
                                  onChange={(e) => handleFormFieldChange('bunkerDate', e.target.value)}
                                  disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 font-mono font-semibold"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mớn nước mũi / Fore Draft</label>
                                <input
                                  type="text"
                                  value={formValues['foreDraft'] || ''}
                                  onChange={(e) => handleFormFieldChange('foreDraft', e.target.value)}
                                  disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 font-semibold"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mớn nước lái / Aft Draft</label>
                                <input
                                  type="text"
                                  value={formValues['aftDraft'] || ''}
                                  onChange={(e) => handleFormFieldChange('aftDraft', e.target.value)}
                                  disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 font-semibold"
                                />
                              </div>
                            </div>

                            {/* Section 1: Product to be Handled */}
                            <div className="mt-6">
                              <h4 className="font-extrabold text-xs uppercase text-blue-900 dark:text-blue-400 mb-2 border-b border-blue-200 dark:border-blue-800 pb-1">
                                1. Loại nhiên liệu nhận / Product to be Handled
                              </h4>
                              <div className="border border-slate-300 dark:border-slate-750 rounded-lg overflow-hidden">
                                <table className="w-full text-left border-collapse text-xs">
                                  <thead>
                                    <tr className="bg-slate-100 dark:bg-slate-850 text-slate-700 dark:text-slate-200 uppercase font-bold text-xs border-b border-slate-300 dark:border-slate-750 text-center">
                                      <th className="p-2 border-r border-slate-300 dark:border-slate-750 w-[40px]">STT</th>
                                      <th className="p-2 border-r border-slate-300 dark:border-slate-750">Chủng loại / Grade</th>
                                      <th className="p-2 border-r border-slate-300 dark:border-slate-750">Tỷ trọng / Density</th>
                                      <th className="p-2 border-r border-slate-300 dark:border-slate-750">Lượng nhận / Stemmed Qty (Mts)</th>
                                      <th className="p-2 border-r border-slate-300 dark:border-slate-750">Lượng có sẵn / Qty onboard (Mts)</th>
                                      <th className="p-2 border-r border-slate-300 dark:border-slate-750">Thời gian dự kiến / Expected Duration</th>
                                      <th className="p-2 border-r border-slate-300 dark:border-slate-750">Lượng dự kiến hoàn thành / ROB on completion</th>
                                      {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && <th className="p-2 w-[50px]">Xóa</th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(formValues['products'] || []).map((row: any, idx: number) => (
                                      <tr key={idx} className="border-b border-slate-200 dark:border-slate-800">
                                        <td className="p-2 border-r border-slate-200 dark:border-slate-800 text-center font-mono">{idx + 1}</td>
                                        <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.grade || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['products']];
                                              newArr[idx] = { ...newArr[idx], grade: e.target.value };
                                              handleFormFieldChange('products', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white"
                                          />
                                        </td>
                                        <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.density || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['products']];
                                              newArr[idx] = { ...newArr[idx], density: e.target.value };
                                              handleFormFieldChange('products', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center"
                                          />
                                        </td>
                                        <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.stemmedQty || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['products']];
                                              newArr[idx] = { ...newArr[idx], stemmedQty: e.target.value };
                                              handleFormFieldChange('products', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center"
                                          />
                                        </td>
                                        <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.qtyOnboard || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['products']];
                                              newArr[idx] = { ...newArr[idx], qtyOnboard: e.target.value };
                                              handleFormFieldChange('products', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center"
                                          />
                                        </td>
                                        <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.duration || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['products']];
                                              newArr[idx] = { ...newArr[idx], duration: e.target.value };
                                              handleFormFieldChange('products', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center"
                                          />
                                        </td>
                                        <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.robCompletion || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['products']];
                                              newArr[idx] = { ...newArr[idx], robCompletion: e.target.value };
                                              handleFormFieldChange('products', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center"
                                          />
                                        </td>
                                        {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && (
                                          <td className="p-2 text-center">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const newArr = [...formValues['products']];
                                                newArr.splice(idx, 1);
                                                handleFormFieldChange('products', newArr);
                                              }}
                                              className="text-red-500 hover:text-red-700"
                                            >
                                              Xóa
                                            </button>
                                          </td>
                                        )}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newArr = [...(formValues['products'] || []), { grade: '', density: '', stemmedQty: '', qtyOnboard: '', duration: '', robCompletion: '' }];
                                    handleFormFieldChange('products', newArr);
                                  }}
                                  className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                                >
                                  + Thêm dòng / Add row
                                </button>
                              )}
                            </div>

                            {/* Section 2: Personnel Responsibilities */}
                            <div className="mt-6">
                              <h4 className="font-extrabold text-xs uppercase text-blue-900 dark:text-blue-400 mb-2 border-b border-blue-200 dark:border-blue-800 pb-1">
                                2. Trách nhiệm của thành viên tham gia / Responsibilities of Personnel
                              </h4>
                              <div className="border border-slate-300 dark:border-slate-750 rounded-lg overflow-hidden">
                                <table className="w-full text-left border-collapse text-xs">
                                  <thead>
                                    <tr className="bg-slate-100 dark:bg-slate-850 text-slate-700 dark:text-slate-200 uppercase font-bold text-xs border-b border-slate-300 dark:border-slate-750">
                                      <th className="p-2 border-r border-slate-300 dark:border-slate-750 w-[40px] text-center">STT</th>
                                      <th className="p-2 border-r border-slate-300 dark:border-slate-750 w-[180px]">Chức danh / Rank</th>
                                      <th className="p-2 border-r border-slate-300 dark:border-slate-750 w-[200px]">Họ tên / Name</th>
                                      <th className="p-2 border-r border-slate-300 dark:border-slate-750">Nhiệm vụ cụ thể / Specific Duty</th>
                                      {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && <th className="p-2 w-[50px] text-center">Xóa</th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(formValues['personnel'] || []).map((row: any, idx: number) => (
                                      <tr key={idx} className="border-b border-slate-200 dark:border-slate-800">
                                        <td className="p-2 border-r border-slate-200 dark:border-slate-800 text-center font-mono">{idx + 1}</td>
                                        <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.rank || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['personnel']];
                                              newArr[idx] = { ...newArr[idx], rank: e.target.value };
                                              handleFormFieldChange('personnel', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white font-semibold"
                                          />
                                        </td>
                                        <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.name || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['personnel']];
                                              newArr[idx] = { ...newArr[idx], name: e.target.value };
                                              handleFormFieldChange('personnel', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white"
                                          />
                                        </td>
                                        <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.duty || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['personnel']];
                                              newArr[idx] = { ...newArr[idx], duty: e.target.value };
                                              handleFormFieldChange('personnel', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white"
                                          />
                                        </td>
                                        {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && (
                                          <td className="p-2 text-center">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const newArr = [...formValues['personnel']];
                                                newArr.splice(idx, 1);
                                                handleFormFieldChange('personnel', newArr);
                                              }}
                                              className="text-red-500 hover:text-red-700"
                                            >
                                              Xóa
                                            </button>
                                          </td>
                                        )}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newArr = [...(formValues['personnel'] || []), { rank: '', name: '', duty: '' }];
                                    handleFormFieldChange('personnel', newArr);
                                  }}
                                  className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                                >
                                  + Thêm chức danh / Add personnel
                                </button>
                              )}
                            </div>

                            {/* Section 3 to 6: Checklists */}
                            <div className="mt-6 grid grid-cols-2 gap-4">
                              <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl space-y-3">
                                <h5 className="font-extrabold text-xs uppercase text-slate-600 dark:text-slate-400">
                                  3. Thiết bị đo & Độ chính xác / Equipment calibration & Accuracy
                                </h5>
                                <div className="space-y-2">
                                  <label className="flex items-start gap-2 text-slate-700 dark:text-slate-350 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={!!formValues['chk_pressure_gauge']}
                                      onChange={(e) => handleFormFieldChange('chk_pressure_gauge', e.target.checked)}
                                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                      className="rounded mt-0.5"
                                    />
                                    <span>Đồng hồ đo áp suất đã hiệu chuẩn / Pressure gauge calibrated</span>
                                  </label>
                                  <label className="flex items-start gap-2 text-slate-700 dark:text-slate-350 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={!!formValues['chk_sounding_tape']}
                                      onChange={(e) => handleFormFieldChange('chk_sounding_tape', e.target.checked)}
                                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                      className="rounded mt-0.5"
                                    />
                                    <span>Thước đo dầu có dán tem hiệu chuẩn / Sounding tape calibrated</span>
                                  </label>
                                  <label className="flex items-start gap-2 text-slate-700 dark:text-slate-350 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={!!formValues['chk_calibration_table']}
                                      onChange={(e) => handleFormFieldChange('chk_calibration_table', e.target.checked)}
                                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                      className="rounded mt-0.5"
                                    />
                                    <span>Bảng hiệu chuẩn két sẵn sàng / Tank calibration table ready</span>
                                  </label>
                                  <label className="flex items-start gap-2 text-slate-700 dark:text-slate-350 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={!!formValues['chk_computer']}
                                      onChange={(e) => handleFormFieldChange('chk_computer', e.target.checked)}
                                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                      className="rounded mt-0.5"
                                    />
                                    <span>Máy tính tính toán đã kiểm tra / Calculation computer checked</span>
                                  </label>
                                </div>
                              </div>

                              <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl space-y-3">
                                <h5 className="font-extrabold text-xs uppercase text-slate-600 dark:text-slate-400">
                                  4. Báo động mức cao / High-level alarms
                                </h5>
                                <div className="space-y-2">
                                  <label className="flex items-start gap-2 text-slate-700 dark:text-slate-350 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={!!formValues['chk_reset_alarm']}
                                      onChange={(e) => handleFormFieldChange('chk_reset_alarm', e.target.checked)}
                                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                      className="rounded mt-0.5"
                                    />
                                    <span>Đã reset và thử hoạt động tốt còi/đèn báo động mức cao (95% & 98%) / High level and overfill alarms tested and operational</span>
                                  </label>
                                </div>

                                <h5 className="font-extrabold text-xs uppercase text-slate-600 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-800">
                                  5. Phương pháp đo nhiệt độ / Temperature measuring
                                </h5>
                                <div className="space-y-2">
                                  <label className="flex items-start gap-2 text-slate-700 dark:text-slate-350 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={!!formValues['chk_temp_sensor']}
                                      onChange={(e) => handleFormFieldChange('chk_temp_sensor', e.target.checked)}
                                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                      className="rounded mt-0.5"
                                    />
                                    <span>Sử dụng cảm biến nhiệt độ tự động / Remote temperature sensor</span>
                                  </label>
                                  <label className="flex items-start gap-2 text-slate-700 dark:text-slate-350 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={!!formValues['chk_thermometer']}
                                      onChange={(e) => handleFormFieldChange('chk_thermometer', e.target.checked)}
                                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                      className="rounded mt-0.5"
                                    />
                                    <span>Đo bằng nhiệt kế cầm tay tại lỗ đo / Portable thermometer through sounding pipe</span>
                                  </label>
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-250 dark:border-slate-800 rounded-xl space-y-3">
                              <h5 className="font-extrabold text-xs uppercase text-slate-600 dark:text-slate-400">
                                6. Kiểm soát hơi thoát và đo khí độc / Vapor control and gas check
                              </h5>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <label className="flex items-start gap-2 text-slate-700 dark:text-slate-350 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={!!formValues['chk_ventilate_sounding']}
                                      onChange={(e) => handleFormFieldChange('chk_ventilate_sounding', e.target.checked)}
                                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                      className="rounded mt-0.5"
                                    />
                                    <span>Thông gió khu vực lỗ đo và hộp van xả / Ventilate sounding pipe and air vent boxes</span>
                                  </label>
                                  <label className="flex items-start gap-2 text-slate-700 dark:text-slate-350 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={!!formValues['chk_h2s_benzene']}
                                      onChange={(e) => handleFormFieldChange('chk_h2s_benzene', e.target.checked)}
                                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                      className="rounded mt-0.5"
                                    />
                                    <span>Kiểm tra hàm lượng khí H2S và Benzene trong không khí / Check H2S and Benzene concentration</span>
                                  </label>
                                </div>
                                <div className="space-y-2">
                                  <label className="flex items-start gap-2 text-slate-700 dark:text-slate-350 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={!!formValues['chk_hc_detector']}
                                      onChange={(e) => handleFormFieldChange('chk_hc_detector', e.target.checked)}
                                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                      className="rounded mt-0.5"
                                    />
                                    <span>Máy đo khí cháy HC hoạt động tốt / Hydrocarbon gas detector calibrated and ready</span>
                                  </label>
                                  <label className="flex items-start gap-2 text-slate-700 dark:text-slate-350 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={!!formValues['chk_respiratory_ready']}
                                      onChange={(e) => handleFormFieldChange('chk_respiratory_ready', e.target.checked)}
                                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                      className="rounded mt-0.5"
                                    />
                                    <span>Thiết bị hỗ trợ hô hấp sẵn sàng khẩn cấp / Emergency breathing apparatus standby</span>
                                  </label>
                                </div>
                              </div>
                            </div>

                            {/* Section 7: Distribution of Bunker Oil */}
                            <div className="mt-6">
                              <h4 className="font-extrabold text-xs uppercase text-blue-900 dark:text-blue-400 mb-2 border-b border-blue-200 dark:border-blue-800 pb-1">
                                7. Phân phối nhiên liệu và sơ đồ đường ống / Distribution of Bunker Oil and Pipe Line-up
                              </h4>
                              <div className="mb-3">
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Thiết lập sơ đồ van nhận nhiên liệu / Piping line-up description <span className="text-red-500">*</span></label>
                                <textarea
                                  rows={2}
                                  value={formValues['line_up_piping'] || ''}
                                  onChange={(e) => handleFormFieldChange('line_up_piping', e.target.value)}
                                  disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                  placeholder="Ví dụ: Mở van tổng nhận mạn phải, đóng van nhận mạn trái. Mở van vào két 1P, 2P..."
                                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
                                />
                              </div>
                              <div className="border border-slate-300 dark:border-slate-750 rounded-lg overflow-hidden">
                                <table className="w-full text-left border-collapse text-xs">
                                  <thead>
                                    <tr className="bg-slate-100 dark:bg-slate-850 text-slate-700 dark:text-slate-200 uppercase font-bold text-xs border-b border-slate-300 dark:border-slate-750 text-center">
                                      <th className="p-2 border-r border-slate-300 dark:border-slate-750 w-[40px]">STT</th>
                                      <th className="p-2 border-r border-slate-300 dark:border-slate-750">Két nhận / Receiving Tank</th>
                                      <th className="p-2 border-r border-slate-300 dark:border-slate-750">Các van mở / Valves opened</th>
                                      <th className="p-2 border-r border-slate-300 dark:border-slate-750">Các van đóng cách ly / Valves closed & isolated</th>
                                      <th className="p-2 border-r border-slate-300 dark:border-slate-750">Két chứa tràn / Overflow Tank</th>
                                      <th className="p-2 border-r border-slate-300 dark:border-slate-750">Van két tràn mở / Overflow valve opened</th>
                                      {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && <th className="p-2 w-[50px]">Xóa</th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(formValues['distribution'] || []).map((row: any, idx: number) => (
                                      <tr key={idx} className="border-b border-slate-200 dark:border-slate-800">
                                        <td className="p-2 border-r border-slate-200 dark:border-slate-800 text-center font-mono">{idx + 1}</td>
                                        <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.recvTank || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['distribution']];
                                              newArr[idx] = { ...newArr[idx], recvTank: e.target.value };
                                              handleFormFieldChange('distribution', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white"
                                          />
                                        </td>
                                        <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.valveOpened || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['distribution']];
                                              newArr[idx] = { ...newArr[idx], valveOpened: e.target.value };
                                              handleFormFieldChange('distribution', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white"
                                          />
                                        </td>
                                        <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.valveClosed || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['distribution']];
                                              newArr[idx] = { ...newArr[idx], valveClosed: e.target.value };
                                              handleFormFieldChange('distribution', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white"
                                          />
                                        </td>
                                        <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.overflowTank || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['distribution']];
                                              newArr[idx] = { ...newArr[idx], overflowTank: e.target.value };
                                              handleFormFieldChange('distribution', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white"
                                          />
                                        </td>
                                        <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.overflowValveOpened || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['distribution']];
                                              newArr[idx] = { ...newArr[idx], overflowValveOpened: e.target.value };
                                              handleFormFieldChange('distribution', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white"
                                          />
                                        </td>
                                        {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && (
                                          <td className="p-2 text-center">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const newArr = [...formValues['distribution']];
                                                newArr.splice(idx, 1);
                                                handleFormFieldChange('distribution', newArr);
                                              }}
                                              className="text-red-500 hover:text-red-700"
                                            >
                                              Xóa
                                            </button>
                                          </td>
                                        )}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newArr = [...(formValues['distribution'] || []), { recvTank: '', valveOpened: '', valveClosed: '', overflowTank: '', overflowValveOpened: '' }];
                                    handleFormFieldChange('distribution', newArr);
                                  }}
                                  className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                                >
                                  + Thêm dòng phân phối / Add row
                                </button>
                              )}
                            </div>

                            {/* Section 8: Loading Rates */}
                            <div className="mt-6">
                              <h4 className="font-extrabold text-xs uppercase text-blue-900 dark:text-blue-400 mb-2 border-b border-blue-200 dark:border-blue-800 pb-1">
                                8. Lưu lượng nhận nhiên liệu dự kiến / Expected Loading Rates
                              </h4>
                              <div className="grid grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl">
                                <div>
                                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Lưu lượng ban đầu / Initial Rate (Mts/Hr) <span className="text-red-500">*</span></label>
                                  <input
                                    type="text"
                                    value={formValues['rate_initial'] || ''}
                                    onChange={(e) => handleFormFieldChange('rate_initial', e.target.value)}
                                    disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 font-semibold"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Lưu lượng tối đa / Max Rate (Mts/Hr) <span className="text-red-500">*</span></label>
                                  <input
                                    type="text"
                                    value={formValues['rate_max'] || ''}
                                    onChange={(e) => handleFormFieldChange('rate_max', e.target.value)}
                                    disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 font-semibold"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Lưu lượng khi sắp đầy / Topping-off Rate (Mts/Hr) <span className="text-red-500">*</span></label>
                                  <input
                                    type="text"
                                    value={formValues['rate_topping'] || ''}
                                    onChange={(e) => handleFormFieldChange('rate_topping', e.target.value)}
                                    disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                    className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 font-semibold"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* Section 9: Gauging of Tanks */}
                            <div className="mt-6">
                              <h4 className="font-extrabold text-xs uppercase text-blue-900 dark:text-blue-400 mb-2 border-b border-blue-200 dark:border-blue-800 pb-1">
                                9. Bảng đo các két trước và sau nhận / Gauging of Tanks (Pre-bunkering & Final Expected)
                              </h4>
                              <div className="border border-slate-300 dark:border-slate-750 rounded-lg overflow-hidden">
                                <table className="w-full text-left border-collapse text-xs">
                                  <thead>
                                    <tr className="bg-slate-100 dark:bg-slate-850 text-slate-700 dark:text-slate-200 uppercase font-bold text-xs border-b border-slate-300 dark:border-slate-750 text-center">
                                      <th rowSpan={2} className="p-1.5 border-r border-slate-300 dark:border-slate-750 w-[35px]">STT</th>
                                      <th rowSpan={2} className="p-1.5 border-r border-slate-300 dark:border-slate-750 w-[90px]">Két / Tank</th>
                                      <th colSpan={2} className="p-1.5 border-r border-slate-300 dark:border-slate-750 border-b">Dung tích 85% / 85% Capacity</th>
                                      <th colSpan={3} className="p-1.5 border-r border-slate-300 dark:border-slate-750 border-b">Đo trước nhận / Pre-bunkering</th>
                                      <th colSpan={2} className="p-1.5 border-r border-slate-300 dark:border-slate-750 border-b">Dự kiến sau nhận / Final Expected</th>
                                      <th colSpan={2} className="p-1.5 border-r border-slate-300 dark:border-slate-750 border-b">Mức giảm tốc / Reduce Rate</th>
                                      <th rowSpan={2} className="p-1.5 border-r border-slate-300 dark:border-slate-750 w-[55px]">Thứ tự / Seq</th>
                                      {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && <th rowSpan={2} className="p-1.5 w-[45px]">Xóa</th>}
                                    </tr>
                                    <tr className="bg-slate-50 dark:bg-slate-800 text-slate-650 dark:text-slate-300 text-xs border-b border-slate-300 dark:border-slate-750 text-center">
                                      <th className="p-1 border-r border-slate-300 dark:border-slate-750">Chiều cao / Sound (m)</th>
                                      <th className="p-1 border-r border-slate-300 dark:border-slate-750">Thể tích / Vol (m³)</th>
                                      <th className="p-1 border-r border-slate-300 dark:border-slate-750">Chiều cao / Sound (m)</th>
                                      <th className="p-1 border-r border-slate-300 dark:border-slate-750">Thể tích / Vol (m³)</th>
                                      <th className="p-1 border-r border-slate-300 dark:border-slate-750">Nhiệt độ / Temp (°C)</th>
                                      <th className="p-1 border-r border-slate-300 dark:border-slate-750">Chiều cao / Sound (m)</th>
                                      <th className="p-1 border-r border-slate-300 dark:border-slate-750">Thể tích / Vol (m³)</th>
                                      <th className="p-1 border-r border-slate-300 dark:border-slate-750">Chiều cao / Sound (m)</th>
                                      <th className="p-1 border-r border-slate-300 dark:border-slate-750">Thể tích / Vol (m³)</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(formValues['gauging'] || []).map((row: any, idx: number) => (
                                      <tr key={idx} className="border-b border-slate-200 dark:border-slate-800 text-center">
                                        <td className="p-1 border-r border-slate-200 dark:border-slate-800 font-mono">{idx + 1}</td>
                                        <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.tank || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['gauging']];
                                              newArr[idx] = { ...newArr[idx], tank: e.target.value };
                                              handleFormFieldChange('gauging', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center font-bold"
                                          />
                                        </td>
                                        <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.capSound || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['gauging']];
                                              newArr[idx] = { ...newArr[idx], capSound: e.target.value };
                                              handleFormFieldChange('gauging', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center"
                                          />
                                        </td>
                                        <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.capVol || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['gauging']];
                                              newArr[idx] = { ...newArr[idx], capVol: e.target.value };
                                              handleFormFieldChange('gauging', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center font-semibold"
                                          />
                                        </td>
                                        <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.preSound || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['gauging']];
                                              newArr[idx] = { ...newArr[idx], preSound: e.target.value };
                                              handleFormFieldChange('gauging', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center"
                                          />
                                        </td>
                                        <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.preVol || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['gauging']];
                                              newArr[idx] = { ...newArr[idx], preVol: e.target.value };
                                              handleFormFieldChange('gauging', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center font-semibold"
                                          />
                                        </td>
                                        <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.preTemp || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['gauging']];
                                              newArr[idx] = { ...newArr[idx], preTemp: e.target.value };
                                              handleFormFieldChange('gauging', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center"
                                          />
                                        </td>
                                        <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.postSound || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['gauging']];
                                              newArr[idx] = { ...newArr[idx], postSound: e.target.value };
                                              handleFormFieldChange('gauging', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center"
                                          />
                                        </td>
                                        <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.postVol || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['gauging']];
                                              newArr[idx] = { ...newArr[idx], postVol: e.target.value };
                                              handleFormFieldChange('gauging', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center font-semibold"
                                          />
                                        </td>
                                        <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.reduceSound || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['gauging']];
                                              newArr[idx] = { ...newArr[idx], reduceSound: e.target.value };
                                              handleFormFieldChange('gauging', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center"
                                          />
                                        </td>
                                        <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.reduceVol || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['gauging']];
                                              newArr[idx] = { ...newArr[idx], reduceVol: e.target.value };
                                              handleFormFieldChange('gauging', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center font-semibold"
                                          />
                                        </td>
                                        <td className="p-1 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.seq || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['gauging']];
                                              newArr[idx] = { ...newArr[idx], seq: e.target.value };
                                              handleFormFieldChange('gauging', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white text-center"
                                          />
                                        </td>
                                        {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && (
                                          <td className="p-1 text-center">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const newArr = [...formValues['gauging']];
                                                newArr.splice(idx, 1);
                                                handleFormFieldChange('gauging', newArr);
                                              }}
                                              className="text-red-500 hover:text-red-700 text-xs"
                                            >
                                              Xóa
                                            </button>
                                          </td>
                                        )}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              <div className="mt-2 grid grid-cols-3 gap-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 p-2.5 rounded-lg text-center font-semibold text-xs">
                                <div className="text-slate-500">Tổng dung tích 85% / Total 85% Cap: <span className="text-slate-800 dark:text-white font-extrabold font-mono ml-1">{formValues['gauging']?.reduce((sum: number, r: any) => sum + (parseFloat(r.capVol) || 0), 0).toFixed(2)} m³</span></div>
                                <div className="text-slate-500">Tổng thực tế trước nhận / Total Pre-bunkering: <span className="text-slate-800 dark:text-white font-extrabold font-mono ml-1">{formValues['gauging']?.reduce((sum: number, r: any) => sum + (parseFloat(r.preVol) || 0), 0).toFixed(2)} m³</span></div>
                                <div className="text-slate-500">Tổng dự kiến sau nhận / Total Final Expected: <span className="text-slate-800 dark:text-white font-extrabold font-mono ml-1">{formValues['gauging']?.reduce((sum: number, r: any) => sum + (parseFloat(r.postVol) || 0), 0).toFixed(2)} m³</span></div>
                              </div>
                              {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newArr = [...(formValues['gauging'] || []), { tank: '', capSound: '', capVol: '', preSound: '', preVol: '', preTemp: '', postSound: '', postVol: '', reduceSound: '', reduceVol: '', seq: '' }];
                                    handleFormFieldChange('gauging', newArr);
                                  }}
                                  className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                                >
                                  + Thêm dòng đo két / Add tank row
                                </button>
                              )}
                            </div>

                            {/* Section 10 to 12: Communication, Emergency Contacts, Spill Equipment */}
                            <div className="mt-6 grid grid-cols-2 gap-4">
                              <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3 font-sans">
                                <h5 className="font-extrabold text-xs uppercase text-slate-650 dark:text-slate-350">
                                  10. Thông tin liên lạc & Ngắt khẩn cấp / Communications & Emergency Stop
                                </h5>
                                <div className="space-y-2 text-xs">
                                  <div>
                                    <label className="block text-xs font-bold text-slate-450 uppercase mb-0.5">Phương thức liên lạc / Communication method (e.g. VHF Ch. 12) <span className="text-red-500">*</span></label>
                                    <input
                                      type="text"
                                      value={formValues['comm_ship_barge'] || ''}
                                      onChange={(e) => handleFormFieldChange('comm_ship_barge', e.target.value)}
                                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                      className="w-full px-2.5 py-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded text-slate-800 dark:text-white"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-slate-450 uppercase mb-0.5">Tín hiệu dừng khẩn cấp / Emergency stop signal <span className="text-red-500">*</span></label>
                                    <input
                                      type="text"
                                      value={formValues['comm_stop_signal'] || ''}
                                      onChange={(e) => handleFormFieldChange('comm_stop_signal', e.target.value)}
                                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                      className="w-full px-2.5 py-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded text-slate-800 dark:text-white"
                                    />
                                  </div>
                                </div>
                              </div>

                              <div className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3 font-sans">
                                <h5 className="font-extrabold text-xs uppercase text-slate-650 dark:text-slate-350">
                                  12. Thiết bị ứng phó sự cố dầu tràn / Oil Spill Equipment Location
                                </h5>
                                <div className="space-y-2 text-xs">
                                  <div>
                                    <label className="block text-xs font-bold text-slate-450 uppercase mb-0.5">Vị trí SOPEP Box trên tàu / Ship's SOPEP Box Location <span className="text-red-500">*</span></label>
                                    <input
                                      type="text"
                                      value={formValues['spill_loc1'] || ''}
                                      onChange={(e) => handleFormFieldChange('spill_loc1', e.target.value)}
                                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                      className="w-full px-2.5 py-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded text-slate-800 dark:text-white"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-bold text-slate-450 uppercase mb-0.5">Vị trí thiết bị trên xà lan / Barge SOPEP Box Location</label>
                                    <input
                                      type="text"
                                      value={formValues['spill_loc2'] || ''}
                                      onChange={(e) => handleFormFieldChange('spill_loc2', e.target.value)}
                                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                      className="w-full px-2.5 py-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded text-slate-800 dark:text-white"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2 font-sans">
                              <h5 className="font-extrabold text-xs uppercase text-slate-650 dark:text-slate-350">
                                11. Các địa chỉ liên lạc khẩn cấp tại địa phương / Local Emergency Contacts
                              </h5>
                              <textarea
                                rows={2}
                                value={formValues['local_contacts'] || ''}
                                onChange={(e) => handleFormFieldChange('local_contacts', e.target.value)}
                                disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                placeholder="Cảng vụ Hàng hải, Đại lý tàu, Trung tâm ứng phó sự cố tràn dầu địa phương..."
                                className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 text-xs font-semibold"
                              />
                            </div>

                            {/* Section 13: Crew Sign-off */}
                            <div className="mt-6 border-t border-slate-250 dark:border-slate-800 pt-4">
                              <h4 className="font-extrabold text-xs uppercase text-blue-900 dark:text-blue-400 mb-2">
                                13. Xác nhận hiểu rõ kế hoạch / Crew Sign-off List
                              </h4>
                              <p className="text-xs italic text-slate-500 mb-2">
                                Chúng tôi xác nhận đã hiểu rõ kế hoạch nhận nhiên liệu và các biện pháp ứng phó sự cố dầu tràn. / We confirm that we understand the bunkering plan and spill response actions.
                              </p>
                              <div className="border border-slate-300 dark:border-slate-750 rounded-lg overflow-hidden">
                                <table className="w-full text-left border-collapse text-xs">
                                  <thead>
                                    <tr className="bg-slate-100 dark:bg-slate-850 text-slate-700 dark:text-slate-200 uppercase font-bold text-xs border-b border-slate-300 dark:border-slate-750">
                                      <th className="p-2 border-r border-slate-300 dark:border-slate-750 w-[40px] text-center">STT</th>
                                      <th className="p-2 border-r border-slate-300 dark:border-slate-750 w-[180px]">Chức danh / Rank</th>
                                      <th className="p-2 border-r border-slate-300 dark:border-slate-750 w-[200px]">Họ tên / Name</th>
                                      <th className="p-2 border-r border-slate-300 dark:border-slate-750 w-[180px] text-center">Chữ ký điện tử / Signature</th>
                                      {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && <th className="p-2 w-[50px] text-center">Xóa</th>}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(formValues['signatures_list'] || []).map((row: any, idx: number) => (
                                      <tr key={idx} className="border-b border-slate-200 dark:border-slate-800">
                                        <td className="p-2 border-r border-slate-200 dark:border-slate-800 text-center font-mono">{idx + 1}</td>
                                        <td className="p-2 border-r border-slate-200 dark:border-slate-800 font-semibold">{row.rank}</td>
                                        <td className="p-2 border-r border-slate-200 dark:border-slate-800">
                                          <input
                                            type="text"
                                            value={row.name || ''}
                                            onChange={(e) => {
                                              const newArr = [...formValues['signatures_list']];
                                              newArr[idx] = { ...newArr[idx], name: e.target.value };
                                              handleFormFieldChange('signatures_list', newArr);
                                            }}
                                            disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                            className="w-full bg-transparent border-0 outline-none p-0 focus:ring-0 text-slate-800 dark:text-white"
                                          />
                                        </td>
                                        <td className="p-2 border-r border-slate-200 dark:border-slate-800 text-center">
                                          {row.signed ? (
                                            <span className="inline-block bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 font-bold border border-green-200 dark:border-green-900/50 px-3 py-1 rounded text-xs tracking-wide shadow-sm">
                                              ✓ ĐÃ KÝ / SIGNED
                                            </span>
                                          ) : (
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const newArr = [...formValues['signatures_list']];
                                                newArr[idx] = { ...newArr[idx], signed: true };
                                                handleFormFieldChange('signatures_list', newArr);
                                                toast.success(`Đã xác nhận chữ ký cho chức danh ${row.rank}`);
                                              }}
                                              disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                              className="px-3 py-1 bg-blue-500 hover:bg-blue-600 text-white rounded text-xs font-bold shadow-sm transition"
                                            >
                                              Ký tên / Sign
                                            </button>
                                          )}
                                        </td>
                                        {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && (
                                          <td className="p-2 text-center">
                                            <button
                                              type="button"
                                              onClick={() => {
                                                const newArr = [...formValues['signatures_list']];
                                                newArr.splice(idx, 1);
                                                handleFormFieldChange('signatures_list', newArr);
                                              }}
                                              className="text-red-500 hover:text-red-700"
                                            >
                                              Xóa
                                            </button>
                                          </td>
                                        )}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                              {!(recordStatus === 'Approved' || recordStatus === 'Submitted') && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newArr = [...(formValues['signatures_list'] || []), { rank: 'Thành viên bổ sung / Custom rank', name: '', signed: false }];
                                    handleFormFieldChange('signatures_list', newArr);
                                  }}
                                  className="mt-2 text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1"
                                >
                                  + Thêm hàng ký xác nhận / Add sign-off row
                                </button>
                              )}
                            </div>
                          </div>
                        ) : selectedTemplate.formCode === 'TL-02-01' ? (
                          /* CUSTOM HIGH-FIDELITY FORM FOR TL-02-01 */
                          <div className="max-w-4xl mx-auto bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 p-8 shadow-md rounded-xl font-serif text-slate-800 dark:text-slate-200 text-xs">
                            
                            {/* Paper-like Header Table */}
                            <div className="border border-slate-300 dark:border-slate-700 grid grid-cols-12 items-stretch text-center font-sans">
                              {/* Logo Box */}
                              <div className="col-span-3 border-r border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center p-3">
                                <div className="w-10 h-10 rounded-full border-2 border-blue-650 flex items-center justify-center mb-1 text-blue-650 text-base font-bold">⚓</div>
                                <span className="text-xs font-extrabold tracking-tight leading-tight text-blue-900 dark:text-blue-300 uppercase">HP SHIPPING</span>
                                <span className="text-xs text-slate-500 font-medium">Hòa Phát Sea Transport</span>
                              </div>
                              {/* Document Title Box */}
                              <div className="col-span-6 border-r border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center p-3 bg-slate-50/30 dark:bg-slate-900/30">
                                <h3 className="font-extrabold text-xs leading-snug uppercase tracking-tight text-slate-800 dark:text-white">
                                  BIÊN BẢN SOÁT XÉT CÔNG TÁC QUẢN LÝ AN TOÀN,<br/>SỨC KHỎE, BẢO VỆ MÔI TRƯỜNG
                                </h3>
                                <div className="w-16 h-0.5 bg-blue-500 my-1"></div>
                                <span className="italic text-xs text-slate-500 font-semibold tracking-wide">Master's Review of the SLMS</span>
                              </div>
                              {/* Document Meta Box */}
                              <div className="col-span-3 flex flex-col justify-center p-3 text-left text-xs space-y-1 bg-slate-50/10">
                                <div><strong>Mã biểu mẫu:</strong> <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">TL-02-01</span></div>
                                <div><strong>Ngày ban hành:</strong> <span className="font-mono">20/10/2016</span></div>
                                <div><strong>Lần sửa đổi:</strong> <span className="font-mono">00</span></div>
                                <div><strong>Trang:</strong> <span className="font-mono">1 / 2</span></div>
                              </div>
                            </div>

                            {/* Metadata Inputs Row */}
                            <div className="grid grid-cols-2 gap-4 border-x border-b border-slate-300 dark:border-slate-700 p-4 bg-slate-50/50 dark:bg-slate-900/40 font-sans text-xs">
                              <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tên tàu / Ship's Name <span className="text-red-500">*</span></label>
                                <input
                                  type="text"
                                  value={formValues['shipName'] || ''}
                                  onChange={(e) => handleFormFieldChange('shipName', e.target.value)}
                                  disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Loại tàu / Ship Type <span className="text-red-500">*</span></label>
                                <input
                                  type="text"
                                  value={formValues['shipType'] || ''}
                                  onChange={(e) => handleFormFieldChange('shipType', e.target.value)}
                                  disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Thuyền trưởng / Master's Name <span className="text-red-500">*</span></label>
                                <input
                                  type="text"
                                  value={formValues['masterName'] || ''}
                                  onChange={(e) => handleFormFieldChange('masterName', e.target.value)}
                                  disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Ngày lập / Date <span className="text-red-500">*</span></label>
                                <input
                                  type="date"
                                  value={formValues['reviewDate'] || ''}
                                  onChange={(e) => handleFormFieldChange('reviewDate', e.target.value)}
                                  disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 font-mono"
                                />
                              </div>
                            </div>

                            {/* 10 Review Questions */}
                            <div className="mt-6 space-y-5">
                              {[
                                {
                                  id: 'reviewItem1',
                                  num: '1',
                                  en: 'Are personnel aware of and understand the Company policies? Are there any areas of policy where staff consider that improvement could be made?',
                                  vi: 'Nhận thức của thuyền viên về các chính sách của Công ty? Những phần nào của chính sách cần được chú trọng nâng cao cho thuyền viên?'
                                },
                                {
                                  id: 'reviewItem2',
                                  num: '2',
                                  en: 'Is the SLMS easily and readily accessible to all relevant staff? Do the officers and crew have a relevant understanding of the procedures contained in SLMS in relation to safety and their responsibilities onboard?',
                                  vi: 'Thuyền viên có thể dễ dàng tiếp cận với tài liệu QLAT&LĐHH? Thuyền viên và sỹ quan có hiểu được các quy trình và nhiệm vụ liên quan đến mình?'
                                },
                                {
                                  id: 'reviewItem3',
                                  num: '3',
                                  en: 'Are records, filing and checklists being completed as required? What improvements would you recommend in relation to these areas of the SLMS?',
                                  vi: 'Các báo cáo, danh mục kiểm tra và cặp hồ sơ lưu được thực hiện theo yêu cầu? Những khuyến nghị để công tác này được thực hiện tốt hơn?'
                                },
                                {
                                  id: 'reviewItem4',
                                  num: '4',
                                  en: 'Summarise any significant internal and external audit findings since last review and comment on any issues that may have come about as a result and corrective actions.',
                                  vi: 'Tóm tắt những phát hiện quan trọng trong đánh giá nội bộ và của bên ngoài kể từ lần soát xét trước, những nhận xét về các vấn đề liên quan đến việc thực hiện các hành động khắc phục.'
                                },
                                {
                                  id: 'reviewItem5',
                                  num: '5',
                                  en: 'Briefly summarise any significant findings or defects raised by any third party since last review such as Port State and comment on steps taken to avoid recurrence.',
                                  vi: 'Tóm tắt những phát hiện, lỗi quan trọng trong các cuộc kiểm tra của PSC kể từ lần soát xét trước và những khuyến nghị về các hành động cần thiết để tránh lặp lại lỗi đó.'
                                },
                                {
                                  id: 'reviewItem6',
                                  num: '6',
                                  en: 'Summarise accidents/ incidents since last review and comment on steps taken to avoid recurrence.',
                                  vi: 'Tóm tắt những tai nạn/ sự cố kể từ lần soát xét và những khuyến nghị về các hành động cần thiết để tránh lặp lại sự cố đó.'
                                },
                                {
                                  id: 'reviewItem7',
                                  num: '7',
                                  en: 'Any customer (i.e. Owner and/or Charterers) feedback regarding satisfaction or complaints.',
                                  vi: 'Những nhận xét, khiếu nại của khách hàng/ người thuê tàu.'
                                },
                                {
                                  id: 'reviewItem8',
                                  num: '8',
                                  en: 'What general improvements do you consider could be made to the SLMS?',
                                  vi: 'Những cải tiến cần thiết đối với HTQLAT&LĐHH?'
                                },
                                {
                                  id: 'reviewItem9',
                                  num: '9',
                                  en: 'Discuss any training carried out during command and comment on its effectiveness. What areas of training would you consider that could be improved or made more beneficial?',
                                  vi: 'Những cuộc huấn luyện và đào tạo đã thực hiện trong thời gian điều hành tàu của Thuyền trưởng và nhận xét về hiệu quả của các buổi đào tạo, những việc làm cần thiết để nâng cao hiệu quả đào tạo?'
                                },
                                {
                                  id: 'reviewItem10',
                                  num: '10',
                                  en: 'Document Review / Soát xét hệ thống tài liệu. Please recommend any significant changes which you consider should be made in order to improve the effectiveness of the SLMS and/or the safe and efficient running of your vessel and include the reasons for same. Please ensure that you list the revision number and chapter/section reference.',
                                  vi: 'Nêu những sửa đổi lớn cần thiết để nâng cao hiệu lực của Sổ tay QLAT&LĐHH. Nêu rõ tên quy trình, số kiểm soát, lần sửa đổi và phần cần sửa đổi.'
                                }
                              ].map((item) => (
                                <div key={item.id} className="space-y-2 border-b border-slate-150 dark:border-slate-800 pb-4">
                                  <div className="font-sans font-bold text-slate-800 dark:text-white flex items-start gap-2">
                                    <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">{item.num}</span>
                                    <div className="space-y-0.5">
                                      <p className="text-xs text-slate-700 dark:text-slate-200">{item.en}</p>
                                      <p className="text-xs text-slate-500 italic font-medium">{item.vi}</p>
                                    </div>
                                  </div>
                                  <textarea
                                    rows={4}
                                    value={formValues[item.id] || ''}
                                    onChange={(e) => handleFormFieldChange(item.id, e.target.value)}
                                    disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                    placeholder="Nhập nội dung nhận xét hoặc kết quả soát xét..."
                                    className="w-full px-3 py-2 text-xs rounded border border-slate-250 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 leading-relaxed font-sans"
                                  />
                                </div>
                              ))}
                            </div>

                            {/* Footer Note */}
                            <div className="mt-4 text-xs italic text-slate-400 font-sans border-t border-slate-200 dark:border-slate-800 pt-3">
                              * Review shall be carried out every 6 months or at change of command / Soát xét được tiến hành 6 tháng 1 lần hoặc trước khi Thuyền trưởng rời tàu.
                            </div>
                          </div>
                        ) : (
                          /* STANDARD DYNAMIC FIELDS */
                          <div className="space-y-4 max-w-lg">
                            {JSON.parse(selectedTemplate.contentSchema || '[]').map((field: any) => {
                              if (field.type === 'info') {
                                return (
                                  <div key={field.id} className="p-3.5 bg-blue-50 dark:bg-blue-950/20 border border-blue-150 dark:border-blue-900 text-xs text-blue-800 dark:text-blue-300 rounded-xl leading-relaxed">
                                    {field.value}
                                  </div>
                                );
                              }

                              return (
                                <div key={field.id} className="space-y-1">
                                  <label className="block text-xs font-semibold text-slate-650 dark:text-slate-350">
                                    {field.label} {field.required && <span className="text-red-500">*</span>}
                                  </label>
                                  
                                  {field.type === 'text' && (
                                    <input
                                      type="text"
                                      value={formValues[field.id] || ''}
                                      onChange={(e) => handleFormFieldChange(field.id, e.target.value)}
                                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-850 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                                    />
                                  )}

                                  {field.type === 'textarea' && (
                                    <textarea
                                      rows={3}
                                      value={formValues[field.id] || ''}
                                      onChange={(e) => handleFormFieldChange(field.id, e.target.value)}
                                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-850 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                                    />
                                  )}

                                  {field.type === 'number' && (
                                    <input
                                      type="number"
                                      value={formValues[field.id] || ''}
                                      onChange={(e) => handleFormFieldChange(field.id, parseFloat(e.target.value))}
                                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-850 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                                    />
                                  )}

                                  {field.type === 'date' && (
                                    <input
                                      type="date"
                                      value={formValues[field.id] || ''}
                                      onChange={(e) => handleFormFieldChange(field.id, e.target.value)}
                                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-850 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                                    />
                                  )}

                                  {field.type === 'select' && (
                                    <select
                                      value={formValues[field.id] || ''}
                                      onChange={(e) => handleFormFieldChange(field.id, e.target.value)}
                                      disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                      className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-850 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                                    >
                                      <option value="">-- Chọn --</option>
                                      {field.options?.map((opt: string) => (
                                        <option key={opt} value={opt}>{opt}</option>
                                      ))}
                                    </select>
                                  )}

                                  {field.type === 'checkbox' && (
                                    <label className="flex items-center gap-2 py-1 cursor-pointer select-none">
                                      <input
                                        type="checkbox"
                                        checked={!!formValues[field.id]}
                                        onChange={(e) => handleFormFieldChange(field.id, e.target.checked)}
                                        disabled={recordStatus === 'Approved' || recordStatus === 'Submitted'}
                                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 disabled:opacity-60"
                                      />
                                      <span className="text-xs text-slate-650 dark:text-slate-350">Xác nhận thực hiện</span>
                                    </label>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Signatures List displaying actual Stamp Certificates */}
                        {signatures.length > 0 && (
                          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                            <span className="text-xs font-bold uppercase tracking-wider text-slate-450 block">Chữ ký số đã xác thực</span>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {signatures.map((sig, idx) => {
                                const name = sig.name || (sig as any).Name || '';
                                const rank = sig.rank || (sig as any).Rank || '';
                                const sigCode = sig.sigCode || (sig as any).SigCode || '';
                                const timestamp = sig.timestamp || (sig as any).Timestamp || '';
                                const datePart = timestamp.split('T')[0] || '';
                                const timePart = timestamp.split('T')[1]?.substring(0, 5) || '';
                                return (
                                  <div key={idx} className="border-2 border-dashed border-blue-500/40 dark:border-blue-400/30 bg-blue-50/20 dark:bg-blue-950/10 p-3 rounded-xl relative overflow-hidden flex flex-col justify-between">
                                    <div className="absolute top-1 right-2 text-blue-600/10 dark:text-blue-400/5 select-none font-bold text-5xl">SIG</div>
                                    <div>
                                      <div className="text-xs uppercase font-bold text-blue-600 dark:text-blue-400 tracking-wider">MÃ XÁC THỰC</div>
                                      <div className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">{sigCode}</div>
                                    </div>
                                    <div className="mt-3 flex items-end justify-between">
                                      <div>
                                        <div className="text-xs font-extrabold text-slate-800 dark:text-white leading-tight">{name}</div>
                                        <div className="text-xs text-slate-450">{rank}</div>
                                      </div>
                                      <div className="text-xs text-slate-400 font-mono text-right">
                                        {datePart} <br /> {timePart} UTC
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* E-Signature Input & Submission Controls */}
                        {recordStatus !== 'Approved' && (
                          <div className="bg-slate-50 dark:bg-slate-850 p-4 rounded-xl border border-slate-250 dark:border-slate-800 space-y-3 pt-4">
                            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-white">
                              <Lock className="w-4 h-4 text-blue-500" />
                              <span>MÃ PIN XÁC THỰC CHỮ KÝ SỐ</span>
                            </div>

                            <p className="text-xs text-slate-450 leading-relaxed">
                              Đóng dấu số điện tử trực tiếp lên biểu mẫu. Crew/Officers sử dụng mã PIN cá nhân của mình. <br />
                              <strong>Thuyền trưởng duyệt hồ sơ sử dụng mã PIN: 1111</strong>
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                              {recordStatus !== 'Submitted' && (
                                <>
                                  <input
                                    type="text"
                                    placeholder="Họ tên người ký"
                                    value={signingName}
                                    onChange={(e) => setSigningName(e.target.value)}
                                    className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-850 dark:text-white outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Chức danh ký"
                                    value={signingRank}
                                    onChange={(e) => setSigningRank(e.target.value)}
                                    className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-850 dark:text-white outline-none focus:ring-1 focus:ring-blue-500"
                                  />
                                </>
                              )}

                              <input
                                type="password"
                                maxLength={4}
                                placeholder="PIN (4 số)"
                                value={signingPin}
                                onChange={(e) => setSigningPin(e.target.value)}
                                className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-850 dark:text-white font-mono text-center outline-none focus:ring-1 focus:ring-blue-500"
                              />
                            </div>

                            <div className="flex gap-2 justify-end pt-1">
                              {recordStatus !== 'Submitted' ? (
                                <>
                                  <PermissionGate permission="hsqe.update"><button
                                    onClick={handleSaveDraft}
                                    className="px-4 py-1.5 bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300 rounded-lg text-xs font-semibold"
                                  >
                                    Lưu nháp
                                  </button></PermissionGate>
                                  <PermissionGate permission="hsqe.approve"><button
                                    onClick={handleECompactSign}
                                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1"
                                  >
                                    <Sparkles className="w-3.5 h-3.5" /> Ký & Đệ trình
                                  </button></PermissionGate>
                                </>
                              ) : (
                                <PermissionGate permission="hsqe.approve"><button
                                  onClick={handleCaptainApprove}
                                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-600/10"
                                >
                                  <Award className="w-4 h-4" /> Captain Duyệt & Ban hành
                                </button></PermissionGate>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* SUGGESTED FORMS DIRECTORY VIEW */
                    <div className="flex-1 flex flex-col p-6 space-y-6 overflow-y-auto scrollbar-thin">
                      
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                          <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 font-extrabold uppercase px-2 py-0.5 rounded-full">Suggested Checklists</span>
                          <h4 className="text-sm font-bold text-slate-850 dark:text-white pt-1">Biểu mẫu liên kết</h4>
                        </div>
                        <button
                          onClick={() => setIsFormsSidebarOpen(false)}
                          className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition"
                          title="Đóng bảng biểu mẫu"
                        >
                          <X className="w-4 h-4 text-slate-500" />
                        </button>
                      </div>
                      <p className="text-xs text-slate-400 dark:text-slate-400 leading-relaxed">
                        Dưới đây là các biểu mẫu, báo cáo, và biên bản kiểm tra bắt buộc phải điền và lưu trữ điện tử để đáp ứng quy định vận hành an toàn tàu biển:
                      </p>

                      {selectedProcDetail?.formTemplates && selectedProcDetail.formTemplates.length > 0 ? (
                        <div className="grid grid-cols-1 gap-3.5">
                          {selectedProcDetail.formTemplates.map((temp) => (
                            <div
                              key={temp.id}
                              className="w-full p-4 bg-white dark:bg-slate-850 border border-slate-200 dark:border-slate-850 rounded-2xl hover:border-blue-500 hover:shadow-lg transition group flex items-start justify-between relative"
                            >
                              <div 
                                onClick={() => window.open(`/safety/hsqe/form/${temp.id}`, '_blank')}
                                className="flex-1 cursor-pointer space-y-1.5 pr-8"
                              >
                                <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded font-bold">
                                  {temp.formCode}
                                </span>
                                <h5 className="font-bold text-slate-800 dark:text-white text-xs leading-snug group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                                  {temp.title}
                                </h5>
                                <p className="text-xs text-slate-450 leading-relaxed">
                                  Digital e-form template. Click to expand input fields and stamp crew digital signatures.
                                </p>
                              </div>
                              <div className="flex flex-col items-end justify-between self-stretch gap-2 mt-1 flex-shrink-0">
                                <button
                                  onClick={() => window.open(`/safety/hsqe/form/${temp.id}`, '_blank')}
                                  className="p-1.5 bg-slate-50 dark:bg-slate-800 text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg transition"
                                  title="Điền biểu mẫu"
                                >
                                  <Send className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="border border-dashed border-slate-250 dark:border-slate-800 rounded-2xl p-6 text-center text-slate-400 text-xs">
                          Quy trình này hiện chưa có biểu mẫu liên kết.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8">
                <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full mb-4 text-slate-350 dark:text-slate-600">
                  <FileText className="w-12 h-12" />
                </div>
                <h3 className="text-base font-bold text-slate-700 dark:text-white mb-1">Chưa chọn Quy trình</h3>
                <p className="text-xs max-w-sm text-center leading-relaxed">
                  Hãy chọn một chương và quy trình (SOP) từ thanh thư mục bên trái để đọc nội dung hướng dẫn và mở các biểu mẫu điện tử tương ứng.
                </p>
              </div>
            )}
          </div>
        </div>
      ) : viewMode === 'auditor' ? (
        
        /* ─── AUDITOR CROSS-REFERENCE VIEW ─── */
        <div className="flex-1 flex flex-col p-6 space-y-4 overflow-hidden bg-white dark:bg-slate-900">
          <div className="flex flex-wrap items-center justify-between gap-3 flex-shrink-0 bg-slate-50 dark:bg-slate-850 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Bộ lọc tìm kiếm (ISM Chapters Audit)</h4>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500">Chương ISM:</span>
                <select
                  value={auditChapterFilter}
                  onChange={(e) => setAuditChapterFilter(e.target.value === 'ALL' ? 'ALL' : parseInt(e.target.value))}
                  className="text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-350 outline-none"
                >
                  <option value="ALL">Tất cả (Chapters 1-16)</option>
                  {treeData.map(c => (
                    <option key={c.id} value={c.id}>{c.id}. {c.chapterName.split('(')[0]}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500">Trạng thái:</span>
                <select
                  value={auditStatusFilter}
                  onChange={(e) => setAuditStatusFilter(e.target.value)}
                  className="text-xs border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-350 outline-none"
                >
                  <option value="ALL">Tất cả trạng thái</option>
                  <option value="Draft">Bản nháp (Draft)</option>
                  <option value="Submitted">Chờ phê duyệt (Submitted)</option>
                  <option value="Approved">Đã phê duyệt (Approved)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Records Table */}
          <div className="flex-1 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800 scrollbar-thin">
            {loadingAudit ? (
              <div className="h-full flex items-center justify-center text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Đang truy vấn dữ liệu...
              </div>
            ) : auditRecords.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-slate-400 text-xs">
                Không tìm thấy hồ sơ nào phù hợp với bộ lọc tìm kiếm.
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-850 text-slate-400 uppercase tracking-wider font-extrabold text-xs border-b border-slate-200 dark:border-slate-800">
                    <th className="p-3.5">Mã số Form</th>
                    <th className="p-3.5">Tên Biểu mẫu / Hồ sơ</th>
                    <th className="p-3.5">Chương ISM</th>
                    <th className="p-3.5">Tàu</th>
                    <th className="p-3.5">Người lập</th>
                    <th className="p-3.5">Ngày lập</th>
                    <th className="p-3.5">Trạng thái</th>
                    <th className="p-3.5 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {auditRecords.map((record) => (
                    <tr key={record.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-850/50 transition">
                      <td className="p-3.5 font-mono font-bold text-slate-500">{record.formCode}</td>
                      <td className="p-3.5 font-semibold text-slate-800 dark:text-white">{record.formTitle}</td>
                      <td className="p-3.5">Chương {record.ismChapterId || 'N/A'}</td>
                      <td className="p-3.5">{record.vesselName}</td>
                      <td className="p-3.5">{record.filledBy}</td>
                      <td className="p-3.5 font-mono">{record.filledDate?.replace('T', ' ').substring(0, 16)}</td>
                      <td className="p-3.5">{getRecordStatusBadge(record.status)}</td>
                      <td className="p-3.5 text-right">
                        <button
                          onClick={() => setViewRecordDetail(record)}
                          className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-semibold flex items-center gap-1.5 ml-auto transition"
                        >
                          <Search className="w-3.5 h-3.5" /> Xem hồ sơ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : (
        /* ─── FORM TEMPLATE LIBRARY VIEW ─── */
        <div className="flex-1 flex flex-col p-6 space-y-4 overflow-hidden bg-white dark:bg-slate-900 animate-in fade-in duration-250">
          {/* Header & Search / Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 flex-shrink-0 bg-slate-50 dark:bg-slate-850 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-500" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">Thư viện biểu mẫu & checklist</h4>
            </div>

            <div className="flex items-center gap-3">
              {/* Search input */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm theo mã hoặc tên..."
                  value={formLibrarySearch}
                  onChange={(e) => setFormLibrarySearch(e.target.value)}
                  className="pl-9 pr-4 py-1.5 text-xs border border-slate-250 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-blue-500 w-60"
                />
              </div>
            </div>
          </div>

          {/* Grid list of templates */}
          <div className="flex-1 overflow-auto scrollbar-thin">
            {formLibraryLoading ? (
              <div className="h-full flex items-center justify-center text-slate-400">
                <RefreshCw className="w-6 h-6 animate-spin mr-2" /> Đang tải thư viện biểu mẫu...
              </div>
            ) : groupedFormTemplates.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-slate-400 text-xs">
                Thư viện chưa có biểu mẫu nào.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-6">
                {groupedFormTemplates
                  .filter(group => 
                    group.formCode.toLowerCase().includes(formLibrarySearch.toLowerCase()) ||
                    group.title.toLowerCase().includes(formLibrarySearch.toLowerCase())
                  )
                  .map((group) => (
                    <div key={group.formCode} className="bg-slate-50 dark:bg-slate-850 p-4 rounded-xl border border-slate-205 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:shadow-md transition">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span 
                            onClick={() => window.open(`/safety/hsqe/form/${group.sampleId}`, '_blank')}
                            className="font-mono text-xs font-bold bg-blue-50 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
                            title="Bấm để xem chi tiết biểu mẫu"
                          >
                            {group.formCode}
                          </span>
                          <span className="text-xs text-slate-400">Số trường: {group.fieldCount}</span>
                        </div>
                        <h5 
                          onClick={() => window.open(`/safety/hsqe/form/${group.sampleId}`, '_blank')}
                          className="text-xs font-bold text-slate-850 dark:text-white mb-2 leading-snug cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          title="Bấm để xem chi tiết biểu mẫu"
                        >
                          {group.title}
                        </h5>
                        
                        <div className="mb-4">
                          <button
                            onClick={() => setSelectedAssignedForm(group)}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg text-xs font-bold hover:bg-blue-100 dark:hover:bg-blue-900/50 transition cursor-pointer"
                            title="Bấm để xem danh sách quy trình gán"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                            {group.assignedProcedures.length > 0 ? (
                              <span>Đã gán vào <strong className="underline">{group.assignedProcedures.length} quy trình</strong></span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400 font-normal italic">Chưa gán quy trình nào</span>
                            )}
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800 pt-3">
                        <button
                          onClick={() => window.open(`/safety/hsqe/form/${group.sampleId}`, '_blank')}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg transition flex items-center gap-1.5"
                          title="Xem chi tiết biểu mẫu"
                        >
                          <Eye className="w-3.5 h-3.5 text-slate-500" /> Xem chi tiết
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )}

  {viewRecordDetail && (
            <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
              <div className={`bg-white dark:bg-slate-800 rounded-2xl ${(viewRecordDetail.formCode === 'TL-02-01' || viewRecordDetail.formCode === 'TL-26-03' || viewRecordDetail.formCode === 'TL-15-01') ? 'max-w-4xl' : 'max-w-xl'} w-full border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col max-h-[90vh]`}>
                
                {/* Modal Header */}
                <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-mono text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-900 px-2 py-0.5 rounded">
                        {viewRecordDetail.formCode}
                      </span>
                      {getRecordStatusBadge(viewRecordDetail.status)}
                    </div>
                    <h3 className="font-bold text-slate-900 dark:text-white text-base">{viewRecordDetail.formTitle}</h3>
                  </div>
                  <button
                    onClick={() => setViewRecordDetail(null)}
                    className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition"
                  >
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
                </div>
 
                {/* Modal Body */}
                <div className="p-6 overflow-y-auto space-y-6 flex-1 scrollbar-thin">
                  
                  {/* Metadata */}
                  <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 dark:bg-slate-850 p-4 rounded-xl border border-slate-200 dark:border-slate-750">
                    <div>
                      <span className="text-slate-400 block mb-0.5">Tên tàu</span>
                      <span className="font-semibold text-slate-850 dark:text-white">{viewRecordDetail.vesselName}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block mb-0.5">Quy trình liên kết</span>
                      <span className="font-semibold text-slate-850 dark:text-white font-mono">{viewRecordDetail.procedureCode}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block mb-0.5">Người lập hồ sơ</span>
                      <span className="font-semibold text-slate-850 dark:text-white">{viewRecordDetail.filledBy}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block mb-0.5">Ngày khởi tạo</span>
                      <span className="font-semibold text-slate-850 dark:text-white font-mono">{viewRecordDetail.filledDate.replace('T', ' ').substring(0, 16)} UTC</span>
                    </div>
                  </div>
 
                  {/* Filled Fields */}
                  {viewRecordDetail.formCode === 'TL-26-03' ? (
                    <div className="space-y-4 font-sans text-slate-800 dark:text-slate-200 text-xs">
                      {/* Header Table */}
                      <div className="border border-slate-300 dark:border-slate-700 grid grid-cols-12 items-stretch text-center font-sans">
                        <div className="col-span-3 border-r border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center p-2">
                          <div className="w-8 h-8 rounded-full border border-blue-650 flex items-center justify-center mb-1 text-blue-650 text-xs font-bold">⚓</div>
                          <span className="text-xs font-extrabold tracking-tight leading-tight text-blue-900 dark:text-blue-300 uppercase">HP SHIPPING</span>
                        </div>
                        <div className="col-span-6 border-r border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center p-2 bg-slate-50/30 dark:bg-slate-900/30">
                          <h3 className="font-extrabold text-xs leading-snug uppercase tracking-tight text-slate-800 dark:text-white">
                            LỊCH LÀM VỆ SINH BẾP, CÁC KHO THỰC PHẨM, KHU VỰC SINH HOẠT CHUNG, PHÒNG Ở
                          </h3>
                          <span className="italic text-xs text-slate-500 font-semibold uppercase">ACCOMMODATIONS, STORE, GALLEY CLEANING SCHEDULE</span>
                        </div>
                        <div className="col-span-3 flex flex-col justify-center p-2 text-left text-xs space-y-0.5 bg-slate-50/10">
                          <div><strong>Mã biểu mẫu:</strong> <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">TL-26-03</span></div>
                          <div><strong>Ngày ban hành:</strong> <span className="font-mono">20/10/2016</span></div>
                          <div><strong>Lần sửa đổi:</strong> <span className="font-mono">0</span></div>
                        </div>
                      </div>

                      {/* Metadata Row */}
                      {(() => {
                        const filled = JSON.parse(viewRecordDetail.filledData || '{}');
                        return (
                          <>
                            <div className="grid grid-cols-2 gap-4 border border-slate-300 dark:border-slate-700 p-3 bg-slate-50/50 dark:bg-slate-900/40 font-sans text-xs">
                              <div><strong>Tên tàu / Ship's Name:</strong> <span className="ml-1 text-slate-900 dark:text-white font-medium">{filled.shipName || viewRecordDetail.vesselName}</span></div>
                              <div><strong>Tháng / Month-Year:</strong> <span className="ml-1 text-slate-900 dark:text-white font-medium">{filled.monthYear || ''}</span></div>
                            </div>

                            {/* Cleaning Schedule Grid Table */}
                            <div className="mt-4 border border-slate-300 dark:border-slate-700 rounded-lg overflow-hidden">
                              <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                  <tr className="bg-slate-105 dark:bg-slate-850 text-slate-700 dark:text-slate-200 uppercase font-bold text-xs border-b border-slate-300 dark:border-slate-700">
                                    <th className="p-1.5 border-r border-slate-300 dark:border-slate-700 w-[40px] text-center">STT</th>
                                    <th className="p-1.5 border-r border-slate-300 dark:border-slate-700 w-[180px]">Hạng mục</th>
                                    <th className="p-1.5 border-r border-slate-300 dark:border-slate-700 w-[100px]">Chu kỳ</th>
                                    <th className="p-1.5 border-r border-slate-300 dark:border-slate-700 w-[240px]">Phương thức vệ sinh</th>
                                    <th className="p-1.5 border-r border-slate-300 dark:border-slate-700 w-[120px]">Người thực hiện</th>
                                    <th className="p-1.5">Lưu ý</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {cleaningCategories.map((category) => (
                                    <React.Fragment key={category.prefix}>
                                      <tr className="bg-blue-50/30 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 font-bold border-b border-slate-300 dark:border-slate-700">
                                        <td colSpan={6} className="p-1.5 text-xs uppercase font-bold">{category.title}</td>
                                      </tr>
                                      {category.items.map((item) => {
                                        const key = `${category.prefix}_perf_${item.num}`;
                                        return (
                                          <tr key={item.num} className="border-b border-slate-200 dark:border-slate-800">
                                            <td className="p-1.5 border-r border-slate-200 dark:border-slate-800 text-center text-slate-500">{item.num}</td>
                                            <td className="p-1.5 border-r border-slate-200 dark:border-slate-800 font-semibold text-slate-900 dark:text-slate-100">{item.name}</td>
                                            <td className="p-1.5 border-r border-slate-200 dark:border-slate-800 text-slate-650 dark:text-slate-400 italic">{item.cycle}</td>
                                            <td className="p-1.5 border-r border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-450 leading-tight">{item.method}</td>
                                            <td className="p-1.5 border-r border-slate-200 dark:border-slate-800 font-medium text-blue-650 dark:text-blue-450">
                                              {filled[key] || <span className="text-slate-400 italic">Chưa nhập</span>}
                                            </td>
                                            <td className="p-1.5 text-slate-500 italic text-xs">{item.note}</td>
                                          </tr>
                                        );
                                      })}
                                    </React.Fragment>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : viewRecordDetail.formCode === 'TL-02-01' ? (
                    <div className="space-y-4 font-serif text-slate-800 dark:text-slate-200 text-xs">
                      {/* Header Table */}
                      <div className="border border-slate-300 dark:border-slate-700 grid grid-cols-12 items-stretch text-center font-sans">
                        <div className="col-span-3 border-r border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center p-2">
                          <div className="w-8 h-8 rounded-full border border-blue-650 flex items-center justify-center mb-1 text-blue-650 text-xs font-bold">⚓</div>
                          <span className="text-xs font-extrabold tracking-tight leading-tight text-blue-900 dark:text-blue-300 uppercase">HP SHIPPING</span>
                        </div>
                        <div className="col-span-6 border-r border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center p-2 bg-slate-50/30 dark:bg-slate-900/30">
                          <h3 className="font-extrabold text-xs leading-snug uppercase tracking-tight text-slate-800 dark:text-white">
                            BIÊN BẢN SOÁT XÉT CÔNG TÁC QUẢN LÝ AN TOÀN,<br/>SỨC KHỎE, BẢO VỆ MÔI TRƯỜNG
                          </h3>
                          <span className="italic text-xs text-slate-500 font-semibold">Master's Review of the SLMS</span>
                        </div>
                        <div className="col-span-3 flex flex-col justify-center p-2 text-left text-xs space-y-0.5">
                          <div><strong>Mã:</strong> <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">TL-02-01</span></div>
                          <div><strong>Ngày BH:</strong> <span className="font-mono">20/10/2016</span></div>
                          <div><strong>Lần sửa đổi:</strong> <span className="font-mono">00</span></div>
                        </div>
                      </div>
 
                      {/* Metadata Row */}
                      {(() => {
                        const filled = JSON.parse(viewRecordDetail.filledData || '{}');
                        return (
                          <>
                            <div className="grid grid-cols-2 gap-4 border border-slate-300 dark:border-slate-700 p-3 bg-slate-50/50 dark:bg-slate-900/40 font-sans text-xs">
                              <div><strong>Tên tàu / Ship's Name:</strong> <span className="ml-1 text-slate-900 dark:text-white font-medium">{filled.shipName || viewRecordDetail.vesselName}</span></div>
                              <div><strong>Loại tàu / Ship Type:</strong> <span className="ml-1 text-slate-900 dark:text-white font-medium">{filled.shipType || 'Bulk Carrier'}</span></div>
                              <div><strong>Thuyền trưởng / Master:</strong> <span className="ml-1 text-slate-900 dark:text-white font-medium">{filled.masterName || viewRecordDetail.filledBy}</span></div>
                              <div><strong>Ngày lập / Date:</strong> <span className="ml-1 text-slate-900 dark:text-white font-mono">{filled.reviewDate || viewRecordDetail.filledDate.split('T')[0]}</span></div>
                            </div>
 
                            <div className="mt-4 space-y-4">
                              {[
                                {
                                  id: 'reviewItem1',
                                  num: '1',
                                  en: 'Are personnel aware of and understand the Company policies? Are there any areas of policy where staff consider that improvement could be made?',
                                  vi: 'Nhận thức của thuyền viên về các chính sách của Công ty? Những phần nào của chính sách cần được chú trọng nâng cao cho thuyền viên?'
                                },
                                {
                                  id: 'reviewItem2',
                                  num: '2',
                                  en: 'Is the SLMS easily and readily accessible to all relevant staff? Do the officers and crew have a relevant understanding of the procedures contained in SLMS in relation to safety and their responsibilities onboard?',
                                  vi: 'Thuyền viên có thể dễ dàng tiếp cận với tài liệu QLAT&LĐHH? Thuyền viên và sỹ quan có hiểu được các quy trình và nhiệm vụ liên quan đến mình?'
                                },
                                {
                                  id: 'reviewItem3',
                                  num: '3',
                                  en: 'Are records, filing and checklists being completed as required? What improvements would you recommend in relation to these areas of the SLMS?',
                                  vi: 'Các báo cáo, danh mục kiểm tra và cặp hồ sơ lưu được thực hiện theo yêu cầu? Những khuyến nghị để công tác này được thực hiện tốt hơn?'
                                },
                                {
                                  id: 'reviewItem4',
                                  num: '4',
                                  en: 'Summarise any significant internal and external audit findings since last review and comment on any issues that may have come about as a result and corrective actions.',
                                  vi: 'Tóm tắt những phát hiện quan trọng trong đánh giá nội bộ và của bên ngoài kể từ lần soát xét trước, những nhận xét về các vấn đề liên quan đến việc thực hiện các hành động khắc phục.'
                                },
                                {
                                  id: 'reviewItem5',
                                  num: '5',
                                  en: 'Briefly summarise any significant findings or defects raised by any third party since last review such as Port State and comment on steps taken to avoid recurrence.',
                                  vi: 'Tóm tắt những phát hiện, lỗi quan trọng trong các cuộc kiểm tra của PSC kể từ lần soát xét trước và những khuyến nghị về các hành động cần thiết để tránh lặp lại lỗi đó.'
                                },
                                {
                                  id: 'reviewItem6',
                                  num: '6',
                                  en: 'Summarise accidents/ incidents since last review and comment on steps taken to avoid recurrence.',
                                  vi: 'Tóm tắt những tai nạn/ sự cố kể từ lần soát xét và những khuyến nghị về các hành động cần thiết để tránh lặp lại sự cố đó.'
                                },
                                {
                                  id: 'reviewItem7',
                                  num: '7',
                                  en: 'Any customer (i.e. Owner and/or Charterers) feedback regarding satisfaction or complaints.',
                                  vi: 'Những nhận xét, khiếu nại của khách hàng/ người thuê tàu.'
                                },
                                {
                                  id: 'reviewItem8',
                                  num: '8',
                                  en: 'What general improvements do you consider could be made to the SLMS?',
                                  vi: 'Những cải tiến cần thiết đối với HTQLAT&LĐHH?'
                                },
                                {
                                  id: 'reviewItem9',
                                  num: '9',
                                  en: 'Discuss any training carried out during command and comment on its effectiveness. What areas of training would you consider that could be improved or made more beneficial?',
                                  vi: 'Những cuộc huấn luyện và đào tạo đã thực hiện trong thời gian điều hành tàu của Thuyền trưởng và nhận xét về hiệu quả của các buổi đào tạo, những việc làm cần thiết để nâng cao hiệu quả đào tạo?'
                                },
                                {
                                  id: 'reviewItem10',
                                  num: '10',
                                  en: 'Document Review / Soát xét hệ thống tài liệu. Please recommend any significant changes which you consider should be made in order to improve the effectiveness of the SLMS and/or the safe and efficient running of your vessel and include the reasons for same. Please ensure that you list the revision number and chapter/section reference.',
                                  vi: 'Nêu những sửa đổi lớn cần thiết để nâng cao hiệu lực của Sổ tay QLAT&LĐHH. Nêu rõ tên quy trình, số kiểm soát, lần sửa đổi và phần cần sửa đổi.'
                                }
                              ].map((item) => (
                                <div key={item.id} className="space-y-1.5 border-b border-slate-150 dark:border-slate-800 pb-3">
                                  <div className="font-sans font-bold text-slate-800 dark:text-white flex items-start gap-2">
                                    <span className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-350 w-5 h-5 rounded-full flex items-center justify-center text-xs flex-shrink-0 mt-0.5">{item.num}</span>
                                    <div className="space-y-0.5">
                                      <p className="text-xs text-slate-700 dark:text-slate-200">{item.en}</p>
                                      <p className="text-xs text-slate-500 italic font-medium">{item.vi}</p>
                                    </div>
                                  </div>
                                  <div className="p-2.5 bg-slate-50 dark:bg-slate-850 rounded border border-slate-200 dark:border-slate-750 text-xs leading-relaxed text-slate-850 dark:text-white font-sans whitespace-pre-wrap">
                                    {filled[item.id] || '--- Không có thông tin / No comment ---'}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : viewRecordDetail.formCode === 'TL-15-01' ? (
                    <div className="space-y-6 font-sans text-slate-800 dark:text-slate-200 text-xs">
                      {/* Header Table */}
                      <div className="border border-slate-300 dark:border-slate-700 grid grid-cols-12 items-stretch text-center font-sans">
                        <div className="col-span-3 border-r border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center p-2">
                          <div className="w-8 h-8 rounded-full border border-blue-650 flex items-center justify-center mb-1 text-blue-650 text-xs font-bold">⚓</div>
                          <span className="text-xs font-extrabold tracking-tight leading-tight text-blue-900 dark:text-blue-300 uppercase">HP SHIPPING</span>
                        </div>
                        <div className="col-span-6 border-r border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center p-2 bg-slate-50/30 dark:bg-slate-900/30">
                          <h3 className="font-extrabold text-xs leading-snug uppercase tracking-tight text-slate-800 dark:text-white">
                            KẾ HOẠCH NHẬN NHIÊN LIỆU / BUNKERING PLAN
                          </h3>
                          <span className="italic text-xs text-slate-500 font-semibold uppercase">SAFETY MANAGEMENT SYSTEM - CHECKLIST</span>
                        </div>
                        <div className="col-span-3 flex flex-col justify-center p-2 text-left text-xs space-y-0.5">
                          <div><strong>Mã biểu mẫu:</strong> <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">TL-15-01</span></div>
                          <div><strong>Ngày ban hành:</strong> <span className="font-mono">20/10/2016</span></div>
                          <div><strong>Lần sửa đổi:</strong> <span className="font-mono">0</span></div>
                        </div>
                      </div>

                      {/* Metadata Row */}
                      {(() => {
                        let filled: any = {};
                        try {
                          filled = JSON.parse(viewRecordDetail.filledData || '{}');
                        } catch (e) {
                          filled = {};
                        }
                        const products = filled.products || [];
                        const personnel = filled.personnel || [];
                        const distribution = filled.distribution || [];
                        const gauging = filled.gauging || [];
                        const signaturesList = filled.signatures_list || [];

                        const getCheckboxStatus = (val: any) => {
                          return val === true || val === 'true' ? (
                            <span className="text-emerald-600 font-bold">✓ Đạt / Yes</span>
                          ) : (
                            <span className="text-rose-500 font-medium">✗ Không / No</span>
                          );
                        };

                        return (
                          <>
                            <div className="grid grid-cols-3 gap-4 border border-slate-300 dark:border-slate-700 p-3 bg-slate-50/50 dark:bg-slate-900/40 font-sans text-xs rounded-lg">
                              <div><strong>Tên tàu / Vessel:</strong> <span className="ml-1 text-slate-900 dark:text-white font-medium">{filled.vessel || viewRecordDetail.vesselName}</span></div>
                              <div><strong>Vị trí / Location:</strong> <span className="ml-1 text-slate-900 dark:text-white font-medium">{filled.location || ''}</span></div>
                              <div><strong>Xà lan/Cảng / Supply:</strong> <span className="ml-1 text-slate-900 dark:text-white font-medium">{filled.supplyBarge || ''}</span></div>
                              <div><strong>Ngày nhận / Date:</strong> <span className="ml-1 text-slate-900 dark:text-white font-mono">{filled.bunkerDate || ''}</span></div>
                              <div><strong>Mớn nước mũi / Fore:</strong> <span className="ml-1 text-slate-900 dark:text-white font-medium">{filled.foreDraft || ''}</span></div>
                              <div><strong>Mớn nước lái / Aft:</strong> <span className="ml-1 text-slate-900 dark:text-white font-medium">{filled.aftDraft || ''}</span></div>
                            </div>

                            {/* Section 1 */}
                            <div>
                              <h4 className="font-extrabold text-xs uppercase text-blue-900 dark:text-blue-400 mb-1 border-b border-blue-200 dark:border-blue-800 pb-0.5">
                                1. Loại nhiên liệu nhận / Product to be Handled
                              </h4>
                              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                                <table className="w-full text-left border-collapse text-xs">
                                  <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-850 text-slate-600 dark:text-slate-200 uppercase font-bold text-xs border-b border-slate-200 dark:border-slate-700">
                                      <th className="p-1.5 border-r border-slate-200 dark:border-slate-700 text-center w-[40px]">STT</th>
                                      <th className="p-1.5 border-r border-slate-200 dark:border-slate-700">Chủng loại / Grade</th>
                                      <th className="p-1.5 border-r border-slate-200 dark:border-slate-700 text-center">Tỷ trọng / Density</th>
                                      <th className="p-1.5 border-r border-slate-200 dark:border-slate-700 text-center">Lượng nhận / Stemmed</th>
                                      <th className="p-1.5 border-r border-slate-200 dark:border-slate-700 text-center">Lượng có sẵn / Onboard</th>
                                      <th className="p-1.5 border-r border-slate-200 dark:border-slate-700 text-center">Thời gian / Duration</th>
                                      <th className="p-1.5 text-center">ROB Completion</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {products.map((row: any, idx: number) => (
                                      <tr key={idx} className="border-b border-slate-150 dark:border-slate-800">
                                        <td className="p-1.5 border-r border-slate-150 dark:border-slate-800 text-center">{idx + 1}</td>
                                        <td className="p-1.5 border-r border-slate-150 dark:border-slate-800 font-bold">{row.grade}</td>
                                        <td className="p-1.5 border-r border-slate-150 dark:border-slate-800 text-center">{row.density}</td>
                                        <td className="p-1.5 border-r border-slate-150 dark:border-slate-800 text-center">{row.stemmedQty}</td>
                                        <td className="p-1.5 border-r border-slate-150 dark:border-slate-800 text-center">{row.qtyOnboard}</td>
                                        <td className="p-1.5 border-r border-slate-150 dark:border-slate-800 text-center">{row.duration}</td>
                                        <td className="p-1.5 text-center">{row.robCompletion}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            {/* Section 2 */}
                            <div>
                              <h4 className="font-extrabold text-xs uppercase text-blue-900 dark:text-blue-400 mb-1 border-b border-blue-200 dark:border-blue-800 pb-0.5">
                                2. Trách nhiệm của thành viên tham gia / Responsibilities of Personnel
                              </h4>
                              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                                <table className="w-full text-left border-collapse text-xs">
                                  <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-850 text-slate-600 dark:text-slate-200 uppercase font-bold text-xs border-b border-slate-200 dark:border-slate-700">
                                      <th className="p-1.5 border-r border-slate-200 dark:border-slate-700 text-center w-[40px]">STT</th>
                                      <th className="p-1.5 border-r border-slate-200 dark:border-slate-700 w-[150px]">Chức danh / Rank</th>
                                      <th className="p-1.5 border-r border-slate-200 dark:border-slate-700 w-[180px]">Họ tên / Name</th>
                                      <th className="p-1.5">Nhiệm vụ cụ thể / Specific Duty</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {personnel.map((row: any, idx: number) => (
                                      <tr key={idx} className="border-b border-slate-150 dark:border-slate-800">
                                        <td className="p-1.5 border-r border-slate-150 dark:border-slate-800 text-center">{idx + 1}</td>
                                        <td className="p-1.5 border-r border-slate-150 dark:border-slate-800 font-bold">{row.rank}</td>
                                        <td className="p-1.5 border-r border-slate-150 dark:border-slate-800 font-medium">{row.name}</td>
                                        <td className="p-1.5 text-slate-600 dark:text-slate-350">{row.duty}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            {/* Section 3-6 Checklists */}
                            <div className="grid grid-cols-2 gap-4">
                              <div className="p-3 bg-slate-50 dark:bg-slate-850 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
                                <div className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-1 text-slate-700 dark:text-slate-300">3. Thiết bị đo & Độ chính xác / Calibration</div>
                                <div className="flex justify-between items-start gap-2">
                                  <span className="text-slate-500">Áp kế nhận hàng đã hiệu chuẩn / Pressure gauge calibrated</span>
                                  {getCheckboxStatus(filled.chk_pressure_gauge)}
                                </div>
                                <div className="flex justify-between items-start gap-2">
                                  <span className="text-slate-500">Thước đo dầu có tem hiệu chuẩn / Sounding tape calibrated</span>
                                  {getCheckboxStatus(filled.chk_sounding_tape)}
                                </div>
                                <div className="flex justify-between items-start gap-2">
                                  <span className="text-slate-500">Bảng hiệu chuẩn két sẵn sàng / Tank calibration table ready</span>
                                  {getCheckboxStatus(filled.chk_calibration_table)}
                                </div>
                                <div className="flex justify-between items-start gap-2">
                                  <span className="text-slate-500">Máy tính tính toán đã kiểm tra / Calculation computer checked</span>
                                  {getCheckboxStatus(filled.chk_computer)}
                                </div>
                              </div>

                              <div className="p-3 bg-slate-50 dark:bg-slate-850 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
                                <div className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-1 text-slate-700 dark:text-slate-300">4. Báo động mức cao & 5. Đo nhiệt độ</div>
                                <div className="flex justify-between items-start gap-2">
                                  <span className="text-slate-500">Thử hoạt động còi/đèn báo động mức cao / High-level alarms tested</span>
                                  {getCheckboxStatus(filled.chk_reset_alarm)}
                                </div>
                                <div className="flex justify-between items-start gap-2">
                                  <span className="text-slate-500">Cảm biến nhiệt độ tự động / Remote temp sensor</span>
                                  {getCheckboxStatus(filled.chk_temp_sensor)}
                                </div>
                                <div className="flex justify-between items-start gap-2">
                                  <span className="text-slate-500">Đo bằng nhiệt kế cầm tay / Portable thermometer</span>
                                  {getCheckboxStatus(filled.chk_thermometer)}
                                </div>
                              </div>
                            </div>

                            {/* Section 6 */}
                            <div className="p-3 bg-slate-50 dark:bg-slate-850 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
                              <div className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-1 text-slate-700 dark:text-slate-300">6. Kiểm soát hơi thoát và đo khí độc / Vapor control and gas check</div>
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <div className="flex justify-between items-start gap-2">
                                    <span className="text-slate-500">Thông gió khu vực lỗ đo / Ventilate sounding pipes</span>
                                    {getCheckboxStatus(filled.chk_ventilate_sounding)}
                                  </div>
                                  <div className="flex justify-between items-start gap-2">
                                    <span className="text-slate-500">Kiểm tra hàm lượng khí H2S & Benzene / H2S & Benzene checked</span>
                                    {getCheckboxStatus(filled.chk_h2s_benzene)}
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <div className="flex justify-between items-start gap-2">
                                    <span className="text-slate-500">Máy đo khí cháy HC hoạt động tốt / HC gas detector checked</span>
                                    {getCheckboxStatus(filled.chk_hc_detector)}
                                  </div>
                                  <div className="flex justify-between items-start gap-2">
                                    <span className="text-slate-500">SCBA sẵn sàng khẩn cấp / SCBA ready for emergency</span>
                                    {getCheckboxStatus(filled.chk_respiratory_ready)}
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Section 7 */}
                            <div>
                              <h4 className="font-extrabold text-xs uppercase text-blue-900 dark:text-blue-400 mb-1 border-b border-blue-200 dark:border-blue-800 pb-0.5">
                                7. Phân phối nhiên liệu và sơ đồ đường ống / Distribution of Bunker Oil and Pipe Line-up
                              </h4>
                              <div className="p-3 bg-slate-50 dark:bg-slate-850 rounded-lg border border-slate-200 dark:border-slate-700 text-xs mb-2 font-mono leading-relaxed">
                                <span className="text-slate-400 block font-sans text-xs font-bold mb-1">MÔ TẢ THIẾT LẬP VAN / PIPING LINE-UP DESCRIPTION:</span>
                                {filled.line_up_piping || 'Chưa thiết lập sơ đồ van'}
                              </div>
                              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                                <table className="w-full text-left border-collapse text-xs">
                                  <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-850 text-slate-600 dark:text-slate-200 uppercase font-bold text-xs border-b border-slate-200 dark:border-slate-700">
                                      <th className="p-1.5 border-r border-slate-200 dark:border-slate-700 text-center w-[40px]">STT</th>
                                      <th className="p-1.5 border-r border-slate-200 dark:border-slate-700">Két nhận / Receiving Tank</th>
                                      <th className="p-1.5 border-r border-slate-200 dark:border-slate-700">Các van mở / Valves opened</th>
                                      <th className="p-1.5 border-r border-slate-200 dark:border-slate-700">Van đóng cách ly / Isolated</th>
                                      <th className="p-1.5 border-r border-slate-200 dark:border-slate-700">Két chứa tràn / Overflow</th>
                                      <th className="p-1.5 text-center">Van tràn mở</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {distribution.map((row: any, idx: number) => (
                                      <tr key={idx} className="border-b border-slate-150 dark:border-slate-800">
                                        <td className="p-1.5 border-r border-slate-150 dark:border-slate-800 text-center">{idx + 1}</td>
                                        <td className="p-1.5 border-r border-slate-150 dark:border-slate-800 font-bold">{row.recvTank}</td>
                                        <td className="p-1.5 border-r border-slate-150 dark:border-slate-800">{row.valveOpened}</td>
                                        <td className="p-1.5 border-r border-slate-150 dark:border-slate-800">{row.valveClosed}</td>
                                        <td className="p-1.5 border-r border-slate-150 dark:border-slate-800">{row.overflowTank}</td>
                                        <td className="p-1.5 text-center font-bold text-emerald-600">{row.overflowValveOpened}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            {/* Section 8 */}
                            <div>
                              <h4 className="font-extrabold text-xs uppercase text-blue-900 dark:text-blue-400 mb-1 border-b border-blue-200 dark:border-blue-800 pb-0.5">
                                8. Lưu lượng nhận nhiên liệu dự kiến / Expected Loading Rates
                              </h4>
                              <div className="grid grid-cols-3 gap-4 border border-slate-200 dark:border-slate-700 p-3 bg-slate-50/50 dark:bg-slate-900/40 rounded-lg text-center">
                                <div>
                                  <div className="text-xs text-slate-450 uppercase">Ban đầu / Initial Rate</div>
                                  <div className="text-xs font-extrabold text-slate-800 dark:text-white mt-0.5">{filled.rate_initial || 'N/A'} Mts/Hr</div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-455 uppercase">Tối đa / Max Rate</div>
                                  <div className="text-xs font-extrabold text-slate-800 dark:text-white mt-0.5">{filled.rate_max || 'N/A'} Mts/Hr</div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-450 uppercase">Topping-off Rate</div>
                                  <div className="text-xs font-extrabold text-slate-800 dark:text-white mt-0.5">{filled.rate_topping || 'N/A'} Mts/Hr</div>
                                </div>
                              </div>
                            </div>

                            {/* Section 9 */}
                            <div>
                              <h4 className="font-extrabold text-xs uppercase text-blue-900 dark:text-blue-400 mb-1 border-b border-blue-200 dark:border-blue-800 pb-0.5">
                                9. Bảng đo các két trước và sau nhận / Gauging of Tanks
                              </h4>
                              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                                <table className="w-full text-left border-collapse text-xs">
                                  <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-850 text-slate-600 dark:text-slate-200 uppercase font-bold text-xs border-b border-slate-200 dark:border-slate-700">
                                      <th rowSpan={2} className="p-1 border-r border-slate-200 dark:border-slate-700 text-center w-[30px]">STT</th>
                                      <th rowSpan={2} className="p-1 border-r border-slate-200 dark:border-slate-700">Két / Tank</th>
                                      <th colSpan={2} className="p-1 border-r border-slate-200 dark:border-slate-700 text-center">Dung tích 85%</th>
                                      <th colSpan={3} className="p-1 border-r border-slate-200 dark:border-slate-700 text-center">Đo trước nhận</th>
                                      <th colSpan={2} className="p-1 border-r border-slate-200 dark:border-slate-700 text-center">Dự kiến sau nhận</th>
                                      <th colSpan={2} className="p-1 border-r border-slate-200 dark:border-slate-700 text-center">Mức giảm tốc</th>
                                      <th rowSpan={2} className="p-1 text-center w-[50px]">Seq</th>
                                    </tr>
                                    <tr className="bg-slate-50 dark:bg-slate-850 text-slate-550 border-b border-slate-200 dark:border-slate-700 text-xs">
                                      <th className="p-1 border-r border-slate-200 dark:border-slate-700 text-center font-normal">Sound</th>
                                      <th className="p-1 border-r border-slate-200 dark:border-slate-700 text-center font-normal">Vol</th>
                                      <th className="p-1 border-r border-slate-200 dark:border-slate-700 text-center font-normal">Sound</th>
                                      <th className="p-1 border-r border-slate-200 dark:border-slate-700 text-center font-normal">Vol</th>
                                      <th className="p-1 border-r border-slate-200 dark:border-slate-700 text-center font-normal">Temp</th>
                                      <th className="p-1 border-r border-slate-200 dark:border-slate-700 text-center font-normal">Sound</th>
                                      <th className="p-1 border-r border-slate-200 dark:border-slate-700 text-center font-normal">Vol</th>
                                      <th className="p-1 border-r border-slate-200 dark:border-slate-700 text-center font-normal">Sound</th>
                                      <th className="p-1 border-r border-slate-200 dark:border-slate-700 text-center font-normal">Vol</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {gauging.map((row: any, idx: number) => (
                                      <tr key={idx} className="border-b border-slate-150 dark:border-slate-800">
                                        <td className="p-1 border-r border-slate-150 dark:border-slate-800 text-center">{idx + 1}</td>
                                        <td className="p-1 border-r border-slate-150 dark:border-slate-800 font-bold">{row.tank}</td>
                                        <td className="p-1 border-r border-slate-150 dark:border-slate-800 text-center">{row.capSound}</td>
                                        <td className="p-1 border-r border-slate-150 dark:border-slate-800 text-center font-semibold">{row.capVol}</td>
                                        <td className="p-1 border-r border-slate-150 dark:border-slate-800 text-center">{row.preSound}</td>
                                        <td className="p-1 border-r border-slate-150 dark:border-slate-800 text-center font-semibold">{row.preVol}</td>
                                        <td className="p-1 border-r border-slate-150 dark:border-slate-800 text-center">{row.preTemp}</td>
                                        <td className="p-1 border-r border-slate-150 dark:border-slate-800 text-center">{row.postSound}</td>
                                        <td className="p-1 border-r border-slate-150 dark:border-slate-800 text-center font-semibold">{row.postVol}</td>
                                        <td className="p-1 border-r border-slate-150 dark:border-slate-800 text-center">{row.reduceSound}</td>
                                        <td className="p-1 border-r border-slate-150 dark:border-slate-800 text-center font-semibold">{row.reduceVol}</td>
                                        <td className="p-1 text-center font-bold text-blue-600">{row.seq}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>

                              {/* Sum Calculations */}
                              <div className="grid grid-cols-3 gap-2 mt-2 bg-slate-50 dark:bg-slate-850 p-2.5 rounded-lg border border-slate-200 dark:border-slate-750 text-xs text-center font-bold">
                                <div>Tổng 85% / Total 85% Cap: <span className="text-slate-850 dark:text-white font-mono ml-1">{gauging.reduce((sum: number, r: any) => sum + (parseFloat(r.capVol) || 0), 0).toFixed(2)} m³</span></div>
                                <div>Tổng trước nhận / Total Pre: <span className="text-slate-850 dark:text-white font-mono ml-1">{gauging.reduce((sum: number, r: any) => sum + (parseFloat(r.preVol) || 0), 0).toFixed(2)} m³</span></div>
                                <div>Dự kiến sau nhận / Total Post: <span className="text-slate-850 dark:text-white font-mono ml-1">{gauging.reduce((sum: number, r: any) => sum + (parseFloat(r.postVol) || 0), 0).toFixed(2)} m³</span></div>
                              </div>
                            </div>

                            {/* Section 10 */}
                            <div className="grid grid-cols-2 gap-4">
                              <div className="p-3 bg-slate-50 dark:bg-slate-850 rounded-lg border border-slate-200 dark:border-slate-700">
                                <div className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-1 text-slate-700 dark:text-slate-300">10. Thông tin liên lạc & Ngắt khẩn cấp / Comm</div>
                                <div className="space-y-1.5 text-xs">
                                  <div><strong>Phương thức liên lạc / Comm method:</strong> <span className="text-slate-900 dark:text-white font-medium block mt-0.5">{filled.comm_ship_barge || 'N/A'}</span></div>
                                  <div><strong>Tín hiệu dừng khẩn cấp / Emergency stop:</strong> <span className="text-slate-900 dark:text-white font-medium block mt-0.5">{filled.comm_stop_signal || 'N/A'}</span></div>
                                </div>
                              </div>

                              <div className="p-3 bg-slate-50 dark:bg-slate-850 rounded-lg border border-slate-200 dark:border-slate-700">
                                <div className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-1 text-slate-700 dark:text-slate-300">12. Thiết bị ứng phó sự cố tràn dầu / Spill Equip</div>
                                <div className="space-y-1.5 text-xs">
                                  <div><strong>Vị trí SOPEP tàu / Ship's SOPEP:</strong> <span className="text-slate-900 dark:text-white font-medium block mt-0.5">{filled.spill_loc1 || 'N/A'}</span></div>
                                  <div><strong>Thiết bị xà lan / Barge SOPEP:</strong> <span className="text-slate-900 dark:text-white font-medium block mt-0.5">{filled.spill_loc2 || 'N/A'}</span></div>
                                </div>
                              </div>
                            </div>

                            {/* Section 11 */}
                            <div className="p-3 bg-slate-50 dark:bg-slate-850 rounded-lg border border-slate-200 dark:border-slate-700">
                              <div className="font-bold border-b border-slate-200 dark:border-slate-700 pb-1 mb-1 text-slate-700 dark:text-slate-300">11. Các địa chỉ liên lạc khẩn cấp tại địa phương / Local Emergency Contacts</div>
                              <div className="text-xs text-slate-850 dark:text-white font-mono leading-relaxed whitespace-pre-wrap">{filled.local_contacts || 'N/A'}</div>
                            </div>

                            {/* Section 13 */}
                            <div>
                              <h4 className="font-extrabold text-xs uppercase text-blue-900 dark:text-blue-400 mb-1 border-b border-blue-200 dark:border-blue-800 pb-0.5">
                                13. Xác nhận hiểu rõ kế hoạch / Crew Sign-off List
                              </h4>
                              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                                <table className="w-full text-left border-collapse text-xs">
                                  <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-850 text-slate-600 dark:text-slate-200 uppercase font-bold text-xs border-b border-slate-200 dark:border-slate-700">
                                      <th className="p-1.5 border-r border-slate-200 dark:border-slate-700 text-center w-[40px]">STT</th>
                                      <th className="p-1.5 border-r border-slate-200 dark:border-slate-700 w-[150px]">Chức danh / Rank</th>
                                      <th className="p-1.5 border-r border-slate-200 dark:border-slate-700">Họ tên / Name</th>
                                      <th className="p-1.5 text-center w-[120px]">Chữ ký / Signature</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {signaturesList.map((row: any, idx: number) => (
                                      <tr key={idx} className="border-b border-slate-150 dark:border-slate-800">
                                        <td className="p-1.5 border-r border-slate-150 dark:border-slate-800 text-center">{idx + 1}</td>
                                        <td className="p-1.5 border-r border-slate-150 dark:border-slate-800 font-bold">{row.rank}</td>
                                        <td className="p-1.5 border-r border-slate-150 dark:border-slate-800 font-medium">{row.name}</td>
                                        <td className="p-1.5 text-center">
                                          {row.signed ? (
                                            <span className="text-emerald-600 font-bold text-xs">✓ ĐÃ KÝ / SIGNED</span>
                                          ) : (
                                            <span className="text-slate-400 italic text-xs">Chưa ký</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  ) : (
                    /* Filled Fields (Standard) */
                    <div className="space-y-3">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-455 block">Dữ liệu biểu mẫu chi tiết</span>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs border border-slate-100 dark:border-slate-800 rounded-xl p-3 bg-white dark:bg-slate-900 space-y-2">
                        {Object.entries(JSON.parse(viewRecordDetail.filledData || '{}')).map(([key, val]) => (
                          <div key={key} className="flex justify-between items-center py-2">
                            <span className="text-slate-500 font-medium capitalize">{key.replace('chk_', '').replace('chk', '').replace('prep_', '').replace('gas_', '')}</span>
                            <span className="font-semibold text-slate-850 dark:text-white font-mono">
                              {typeof val === 'boolean' ? (val ? '✅ Có / Đạt' : '❌ Không / Chưa đạt') : String(val)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Digital Signature Stamps */}
                  <div className="space-y-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-450 block">Chữ ký số đã kiểm tra hợp lệ</span>
                    <div className="grid grid-cols-1 gap-2">
                      {JSON.parse(viewRecordDetail.digitalSignatures || '[]').map((sig: any, idx: number) => {
                        const name = sig.name || sig.Name || '';
                        const rank = sig.rank || sig.Rank || '';
                        const sigCode = sig.sigCode || sig.SigCode || '';
                        const timestamp = sig.timestamp || sig.Timestamp || '';
                        const timeStr = timestamp.replace('T', ' ').substring(0, 16);
                        return (
                          <div key={idx} className="border border-emerald-500/35 bg-emerald-500/[0.03] p-3 rounded-xl flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-emerald-100 dark:bg-emerald-950 text-emerald-600 rounded-lg">
                                <Check className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="text-xs font-extrabold text-slate-800 dark:text-white">{name}</div>
                                <div className="text-xs text-slate-500">{rank}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-xs font-mono font-bold text-emerald-600 dark:text-emerald-400">{sigCode}</div>
                              <div className="text-xs text-slate-400 font-mono mt-0.5">{timeStr} UTC</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="p-4 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-850 flex justify-end gap-2 flex-shrink-0 rounded-b-2xl">
                  <button
                    onClick={handlePrintRecord}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Printer className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                    In / Xuất PDF
                  </button>
                  <button
                    onClick={() => setViewRecordDetail(null)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition"
                  >
                    Đóng cửa sổ
                  </button>
                </div>

              </div>
            </div>
          )}

          {/* ─── CHOOSE & ASSIGN EXISTING FORM TEMPLATES MODAL ─── */}
          {showTemplateSelector && (
            <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
              <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-2xl w-full border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col max-h-[85vh]">
                
                {/* Modal Header */}
                <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-blue-50 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg">
                      <Database className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm">Gán biểu mẫu đã có vào quy trình</h3>
                      <p className="text-xs text-slate-500">
                        Quy trình hiện tại: <span className="font-semibold text-slate-700 dark:text-slate-350">{selectedProcDetail?.procedureCode} - {selectedProcDetail?.title}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowTemplateSelector(false)}
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
                      className="pl-9 pr-4 py-2 w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* Templates List */}
                  <div className="flex-1 overflow-y-auto border border-slate-150 dark:border-slate-700 rounded-xl divide-y divide-slate-100 dark:divide-slate-850 min-h-[250px] max-h-[40vh] scrollbar-thin">
                    {loadingSelector ? (
                      <div className="py-12 flex flex-col items-center justify-center text-slate-400 text-xs gap-2">
                        <RefreshCw className="w-5 h-5 animate-spin text-blue-500" />
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
                            className="flex items-start gap-3 p-3.5 hover:bg-slate-50 dark:hover:bg-slate-850/50 cursor-pointer select-none transition"
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
                              className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                            />
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs font-bold bg-slate-100 dark:bg-slate-900 text-slate-500 px-1.5 py-0.5 rounded">
                                  {temp.formCode}
                                </span>
                                <span className="text-xs font-bold text-slate-800 dark:text-white">
                                  {temp.title}
                                </span>
                              </div>
                              {temp.procedureCode && (
                                <p className="text-xs text-slate-450">
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
                    onClick={() => setShowTemplateSelector(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition"
                  >
                    Hủy
                  </button>
                  <PermissionGate permission="hsqe.update"><button
                    onClick={handleAssignTemplates}
                    disabled={assigningTemplates}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    {assigningTemplates && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    Gán {selectedAssignIds.length} biểu mẫu
                  </button></PermissionGate>
                </div>

              </div>
            </div>
          )}

          {/* ─── CREATE NEW FORM TEMPLATE FROM LIBRARY MODAL ─── */}
          {showNewFormModal && (
            <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
              <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-3xl w-full border border-slate-205 dark:border-slate-700 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
                
                {/* Modal Header */}
                <div className="p-5 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-blue-50 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-lg">
                      <Plus className="w-4.5 h-4.5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm">Tạo biểu mẫu mới vào thư viện</h3>
                      <p className="text-xs text-slate-500">Thiết kế cấu trúc checklist hoặc form báo cáo điện tử</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowNewFormModal(false)}
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
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mã biểu mẫu</label>
                      <input
                        type="text"
                        placeholder="VD: BM-07-08"
                        value={newFormCode}
                        onChange={(e) => setNewFormCode(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-202 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-850 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Tiêu đề biểu mẫu</label>
                      <input
                        type="text"
                        placeholder="VD: Checklist an toàn cháy nổ"
                        value={newFormTitle}
                        onChange={(e) => setNewFormTitle(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-202 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-850 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {/* Procedure Association */}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Quy trình (SOP) liên kết bắt buộc</label>
                    <select
                      value={newFormProcedureId}
                      onChange={(e) => setNewFormProcedureId(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-202 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-850 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
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
                      <span className="text-xs font-bold text-slate-500 uppercase">Cấu trúc các trường ({formBuilderData.fields.length})</span>
                      <button
                        onClick={addFormField}
                        className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 transition"
                      >
                        <Plus className="w-3 h-3" /> Thêm trường
                      </button>
                    </div>

                    {formBuilderData.fields.length === 0 && (
                      <div className="text-xs text-slate-400 italic py-4 text-center border border-dashed border-slate-202 dark:border-slate-700 rounded-xl">
                        Chưa có trường nào. Nhấn "Thêm trường" để bắt đầu thiết kế form.
                      </div>
                    )}

                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                      {formBuilderData.fields.map((field, idx) => (
                        <div key={field.id} className="flex items-start gap-2 p-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-150 dark:border-slate-800">
                          <div className="flex-1 grid grid-cols-3 gap-2">
                            <input
                              type="text"
                              placeholder="Tên trường"
                              value={field.label}
                              onChange={(e) => updateFormField(idx, 'label', e.target.value)}
                              className="px-2 py-1.5 text-xs rounded border border-slate-202 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-850 dark:text-white outline-none focus:ring-1 focus:ring-blue-500"
                            />
                            <select
                              value={field.type}
                              onChange={(e) => updateFormField(idx, 'type', e.target.value)}
                              className="px-2 py-1.5 text-xs rounded border border-slate-202 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-850 dark:text-white outline-none focus:ring-1 focus:ring-blue-500"
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
                                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                              />
                              <span className="text-xs text-slate-500">Bắt buộc</span>
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
                    {formBuilderData.fields.some(f => f.type === 'select') && (
                      <div className="space-y-1.5 p-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg">
                        <span className="text-xs font-bold text-amber-700 dark:text-amber-400">Các tùy chọn (phân cách bằng dấu phẩy):</span>
                        {formBuilderData.fields.filter(f => f.type === 'select').map((field) => {
                          const originalIdx = formBuilderData.fields.indexOf(field);
                          return (
                            <div key={field.id} className="flex items-center gap-2">
                              <span className="text-xs text-amber-600 font-mono w-20 truncate">{field.label || 'Chưa đặt tên'}</span>
                              <input
                                type="text"
                                placeholder="VD: Đạt, Không đạt, N/A"
                                value={field.options || ''}
                                onChange={(e) => updateFormField(originalIdx, 'options', e.target.value)}
                                className="flex-1 px-2 py-1 text-xs rounded border border-amber-200 dark:border-amber-800 bg-white dark:bg-slate-800 text-slate-800 dark:text-white outline-none focus:ring-1 focus:ring-amber-500"
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
                    onClick={() => setShowNewFormModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-semibold transition"
                  >
                    Hủy
                  </button>
                  <PermissionGate permission="hsqe.create"><button
                    onClick={handleCreateFormFromLibrary}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
                  >
                    Tạo & liên kết biểu mẫu
                  </button></PermissionGate>
                </div>

              </div>
            </div>
          )}

          {/* ─── ASSIGN FORM TEMPLATE TO ANOTHER PROCEDURE MODAL ─── */}
          {showAssignModal && (
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
                    onClick={() => setShowAssignModal(false)}
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
                      {treeData.flatMap(ch => ch.procedures).filter(p => p.status === 'Active').map(p => (
                        <option key={p.id} value={p.id}>{p.procedureCode} - {p.title}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="p-5 border-t border-slate-100 dark:border-slate-700 flex items-center justify-end gap-2.5 flex-shrink-0">
                  <button
                    onClick={() => setShowAssignModal(false)}
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
          )}

      {/* Custom Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-white dark:bg-slate-800 border border-slate-205 dark:border-slate-700 rounded-lg shadow-xl py-1 z-50 min-w-[180px] animate-in fade-in zoom-in-95 duration-100"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setSelectedProcId(contextMenu.procedure.id);
              setIsEditingSop(false);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-left transition-colors"
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-500" />
            <span>Xem chi tiết</span>
          </button>
          
          <button
            onClick={async () => {
              const procId = contextMenu.procedure.id;
              setContextMenu(null);
              if (selectedProcDetail?.id === procId) {
                handlePrintSop();
              } else {
                toast.loading('Đang chuẩn bị in tài liệu...');
                try {
                  const detail = await smsService.getProcedure(procId);
                  printSmsDocument({
                    title: detail.title,
                    subtitle: 'QUY TRÌNH QUẢN LÝ AN TOÀN - SAFETY MANAGEMENT PROCEDURE',
                    code: detail.procedureCode,
                    version: detail.version,
                    date: detail.publishDate,
                    contentHtml: detail.content,
                    watermark: detail.status === 'Obsolete' ? 'HẾT HIỆU LỰC (OBSOLETE)' : (detail.watermarkText || 'CONTROLLED COPY')
                  });
                  toast.dismiss();
                } catch {
                  toast.dismiss();
                  toast.error('Lỗi khi tải chi tiết quy trình để in');
                }
              }
            }}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 dark:text-slate-350 hover:bg-slate-100 dark:hover:bg-slate-700 text-left transition-colors"
          >
            <Printer className="w-3.5 h-3.5 text-slate-500" />
            <span>In / Xuất PDF</span>
          </button>

          {contextMenu.procedure.status === 'Obsolete' && (
            <>
              <div className="border-t border-slate-150 dark:border-slate-700 my-1" />
              <PermissionGate permission="hsqe.delete"><button
                onClick={() => {
                  const proc = contextMenu.procedure;
                  setContextMenu(null);
                  handleDeleteProcedure(proc);
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-650 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-left transition-colors font-semibold"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                <span>Xóa quy trình khỏi DB</span>
              </button></PermissionGate>
            </>
          )}
        </div>
      )}
      {/* Modal displaying list of assigned procedures */}
      {selectedAssignedForm && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-850 rounded-2xl max-w-xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-blue-50 dark:bg-blue-950 text-blue-600 rounded-xl">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/40 px-2 py-0.5 rounded">
                      {selectedAssignedForm.formCode}
                    </span>
                    <span className="text-xs text-slate-400 font-medium">({selectedAssignedForm.assignedProcedures.length} quy trình đã gán)</span>
                  </div>
                  <h3 className="font-bold text-slate-850 dark:text-white text-sm mt-0.5">{selectedAssignedForm.title}</h3>
                </div>
              </div>
              <button
                onClick={() => setSelectedAssignedForm(null)}
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto max-h-[60vh] space-y-3 scrollbar-thin">
              {selectedAssignedForm.assignedProcedures.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs italic">
                  Biểu mẫu này chưa được gán vào quy trình nào.
                </div>
              ) : (
                selectedAssignedForm.assignedProcedures.map((proc: any, idx: number) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 flex items-center justify-between hover:border-blue-300 dark:hover:border-blue-800 transition"
                  >
                    <div className="space-y-0.5 flex-1 pr-3">
                      <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded">
                        {proc.code}
                      </span>
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-snug mt-1">
                        {proc.title}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedAssignedForm(null);
                        if (proc.id) {
                          setSelectedProcId(proc.id);
                          loadProcedureDetails(proc.id);
                          setViewMode('workspace');
                        }
                      }}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1 flex-shrink-0"
                    >
                      <Eye className="w-3.5 h-3.5" /> Xem quy trình
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
              <button
                onClick={() => setSelectedAssignedForm(null)}
                className="px-4 py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
