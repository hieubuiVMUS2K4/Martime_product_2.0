import { PermissionGate } from '@/components/auth/PermissionGate'
import { usePermissionsStore, canPerform } from '@/stores/permissions.store';
/**
 * Danh sách công việc (Work Planning) - Avison-style
 * Gộp 6 view: Bảng | Lịch | Gantt Chart | Kanban | Counter | Cấu hình
 * Panel trái: Equipment Tree + Filters (Ngày, Người thực hiện, Loại CV, Trạng thái)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import {
  Table2, Calendar, BarChart3, LayoutGrid,
  Search, ChevronRight, ChevronDown, ChevronLeft,
  Eye, Pencil, Trash2,
  RefreshCw, Clock, Settings, Gauge, Plus, Save, ExternalLink,
  CheckCircle, ChevronsUpDown, FolderOpen, ClipboardList, X as XIcon, Users, Package,
  AlertTriangle, FileText, History, Link2, Copy, CalendarDays
} from 'lucide-react';
import { parseISO, format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, addDays, getDay } from 'date-fns';
import { vi } from 'date-fns/locale';
import { maritimeService } from '@/services/maritime.service';
import { equipmentAssetService, getCachedEquipmentTree } from '@/services/equipment-asset.service';
import { maintenanceScheduleService } from '@/services/maintenance-schedule.service';
import { materialService, type MaterialCatalogItem } from '@/services/materialService';
import { inventoryService } from '@/services/inventory.service';
import { KanbanBoard } from '@/components/maintenance/KanbanBoard';
import { isEventMaintenance, maintenanceCategoryLabel } from '@/components/pms/maintenance-categories';
import { AddScheduleModal } from '@/components/pms/AddScheduleModal';
import { ImportMaintenanceModal } from '@/components/pms/ImportMaintenanceModal';
import { MaintenanceHistoryModal } from '@/components/pms/MaintenanceHistoryModal';
import { DataTable, TableActions, type Column } from '@/components/common/DataTable';

import { useTranslationSafe } from '@/contexts/I18nContext';
import { toast } from 'sonner';
import axios from 'axios';
import type { MaintenanceTask, CrewMember } from '@/types/maritime.types';
import { parseTaskScheduleInfo } from '@/types/maritime.types';
import type { EquipmentAsset, MaintenanceSchedule, CreateMaintenanceScheduleDto, CreateScheduleSparePartDto, ChecklistItemTemplateDto } from '@/types/pms.types';

type ViewTab = 'table' | 'calendar' | 'gantt' | 'kanban' | 'counter' | 'config';
const SHOW_KANBAN_TAB = false;

// Checklist templates for common equipment
const CHECKLIST_TEMPLATES: Record<string, { label: string; items: { desc: string; reading?: boolean; unit?: string; min?: number; max?: number }[] }> = {
  MAIN_ENGINE: {
    label: 'Máy chính (Main Engine)',
    items: [
      { desc: 'Kiểm tra mức dầu bôi trơn', reading: true, unit: 'mm', min: 60, max: 90 },
      { desc: 'Kiểm tra áp suất dầu bôi trơn', reading: true, unit: 'bar', min: 3, max: 6 },
      { desc: 'Kiểm tra nhiệt độ nước làm mát', reading: true, unit: '°C', min: 70, max: 85 },
      { desc: 'Kiểm tra rò rỉ nhiên liệu và dầu', reading: false },
      { desc: 'Kiểm tra hệ thống lọc dầu', reading: false },
      { desc: 'Kiểm tra dây curoa / khớp nối', reading: false },
      { desc: 'Ghi nhận giờ chạy máy', reading: true, unit: 'giờ' },
      { desc: 'Kiểm tra hệ thống thoát khí', reading: false },
    ]
  },
  GENERATOR: {
    label: 'Máy phát điện (Generator)',
    items: [
      { desc: 'Kiểm tra điện áp đầu ra', reading: true, unit: 'V', min: 380, max: 440 },
      { desc: 'Kiểm tra tần số', reading: true, unit: 'Hz', min: 59, max: 61 },
      { desc: 'Kiểm tra dòng điện tải', reading: true, unit: 'A' },
      { desc: 'Kiểm tra mức dầu bôi trơn', reading: true, unit: 'mm', min: 60, max: 90 },
      { desc: 'Kiểm tra nhiệt độ vỏ máy', reading: true, unit: '°C', min: 40, max: 80 },
      { desc: 'Kiểm tra tiếng ồn bất thường', reading: false },
      { desc: 'Kiểm tra kết nối dây dẫn điện', reading: false },
      { desc: 'Vệ sinh bộ lọc gió', reading: false },
    ]
  },
  PUMP: {
    label: 'Bơm (Pump)',
    items: [
      { desc: 'Kiểm tra áp suất đầu vào/ra', reading: true, unit: 'bar' },
      { desc: 'Kiểm tra rò rỉ phớt/gioăng', reading: false },
      { desc: 'Kiểm tra độ rung', reading: true, unit: 'mm/s', min: 0, max: 4.5 },
      { desc: 'Kiểm tra nhiệt độ ổ trục', reading: true, unit: '°C', min: 30, max: 70 },
      { desc: 'Bôi trơn ổ trục', reading: false },
    ]
  },
  COMPRESSOR: {
    label: 'Máy nén khí (Compressor)',
    items: [
      { desc: 'Kiểm tra áp suất bình chứa', reading: true, unit: 'bar', min: 25, max: 30 },
      { desc: 'Xả nước ngưng bình chứa', reading: false },
      { desc: 'Kiểm tra van an toàn', reading: false },
      { desc: 'Kiểm tra mức dầu bôi trơn', reading: true, unit: 'mm' },
      { desc: 'Kiểm tra dây curoa', reading: false },
      { desc: 'Vệ sinh bộ lọc gió', reading: false },
    ]
  }
};

// === Equipment Tree Helpers ===
function buildTree(items: EquipmentAsset[]): EquipmentAsset[] {
  const map = new Map<string, EquipmentAsset>();
  items.forEach(i => map.set(i.id, { ...i, children: [] }));
  const roots: EquipmentAsset[] = [];
  map.forEach(item => {
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children!.push(item);
    } else {
      roots.push(item);
    }
  });
  return roots;
}

function isEquipmentFolder(node?: EquipmentAsset | null): boolean {
  return !!node && node.category === 'SYSTEM';
}

function getSelectableEquipmentIds(node: EquipmentAsset): Set<string> {
  const ids = new Set<string>();
  const stack = [node];
  while (stack.length) {
    const n = stack.pop()!;
    if (!isEquipmentFolder(n)) ids.add(n.id);
    n.children?.forEach(c => stack.push(c));
  }
  return ids;
}

function normalizeTreeSearch(value?: string | null): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function matchesEquipmentTreeSearch(node: EquipmentAsset, search: string): boolean {
  const q = normalizeTreeSearch(search);
  if (!q) return true;

  const selfMatches =
    normalizeTreeSearch(node.assetCode).includes(q) ||
    normalizeTreeSearch(node.assetName).includes(q);

  return selfMatches || (node.children?.some(child => matchesEquipmentTreeSearch(child, search)) ?? false);
}

// === Gantt helpers ===
interface GanttTask {
  id: string;
  name: string;
  groupName: string;
  dueDate: Date;
  startDate: Date;
  workDurationDays: number;
  leadTimeDays: number;
  priority: string;
  isOverdue: boolean;
  daysUntilDue: number;
  intervalType?: 'CALENDAR' | 'RUNNING_HOURS';
  intervalValue?: number;
  progress: number;
  checklistCompleted: number;
  checklistTotal: number;
  nextDueDate?: Date;
  hasNextDue?: boolean;
}

const HOURS_PER_CALENDAR_DAY = 24;
const RUNNING_HOURS_PER_DAY = 10;
const getTaskDurationDays = (estimatedDuration?: number | null) =>
  Math.max(1, Math.ceil((Number(estimatedDuration) || HOURS_PER_CALENDAR_DAY) / HOURS_PER_CALENDAR_DAY));

const startOfToday = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const PRIORITY_COLORS: Record<string, { bg: string; bar: string; text: string }> = {
  CRITICAL: { bg: '#FEE2E2', bar: '#EF4444', text: '#991B1B' },
  HIGH: { bg: '#FFEDD5', bar: '#F97316', text: '#9A3412' },
  MEDIUM: { bg: '#FEF3C7', bar: '#EAB308', text: '#854D0E' },
  NORMAL: { bg: '#FEF3C7', bar: '#EAB308', text: '#854D0E' },
  LOW: { bg: '#DBEAFE', bar: '#3B82F6', text: '#1E40AF' },
};

const STATUS_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  SCHEDULED: { label: 'Đã lên lịch', bg: 'bg-slate-100', text: 'text-slate-700' },
  UPCOMING: { label: 'Sắp đến hạn', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  DUE: { label: 'Đến hạn', bg: 'bg-blue-100', text: 'text-blue-700' },
  OVERDUE: { label: 'Quá hạn', bg: 'bg-red-100', text: 'text-red-700' },
  IN_PROGRESS: { label: 'Đang thực hiện', bg: 'bg-amber-100', text: 'text-amber-700' },
  PENDING_APPROVAL: { label: 'Chờ duyệt', bg: 'bg-purple-100', text: 'text-purple-700' },
  RECTIFY: { label: 'Trả hoàn', bg: 'bg-orange-100', text: 'text-orange-700' },
  COMPLETED: { label: 'Hoàn thành', bg: 'bg-green-100', text: 'text-green-700' },
  CANCELLED: { label: 'Hủy bỏ', bg: 'bg-gray-100', text: 'text-gray-500' },
};

const PRIORITY_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  CRITICAL: { label: 'Rất cao', bg: 'bg-red-100', text: 'text-red-700' },
  HIGH: { label: 'Cao', bg: 'bg-orange-100', text: 'text-orange-700' },
  NORMAL: { label: 'Trung bình', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  MEDIUM: { label: 'Trung bình', bg: 'bg-yellow-100', text: 'text-yellow-700' },
  LOW: { label: 'Thấp', bg: 'bg-blue-100', text: 'text-blue-700' },
};

export default function WorkPlanningPage() {
  const navigate = useNavigate();
  const { t } = useTranslationSafe();

  // === Translated label helpers ===
  const STATUS_KEY_MAP: Record<string, string> = {
    SCHEDULED: 'scheduled', UPCOMING: 'upcoming', DUE: 'due', OVERDUE: 'overdue',
    IN_PROGRESS: 'inProgress', PENDING_APPROVAL: 'pendingApproval', RECTIFY: 'rectify',
    COMPLETED: 'completed', CANCELLED: 'cancelled',
  };
  const PRIORITY_KEY_MAP: Record<string, string> = {
    CRITICAL: 'critical', HIGH: 'high', NORMAL: 'normal', MEDIUM: 'medium', LOW: 'low',
  };
  const getStatusLabel = (status: string) => t(`pms.workPlanning.status.${STATUS_KEY_MAP[status] || 'scheduled'}`);
  const getPriorityLabel = (priority: string) => t(`pms.workPlanning.priority.${PRIORITY_KEY_MAP[priority] || 'normal'}`);

  // === View state ===
  const permissionState = usePermissionsStore();
  const [activeTab, setActiveTab] = useState<ViewTab>('table');

  useEffect(() => {
    if (!SHOW_KANBAN_TAB && activeTab === 'kanban') {
      setActiveTab('table');
    }
  }, [activeTab]);

  // === Data state ===
  const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
  const [historyTask, setHistoryTask] = useState<MaintenanceTask | null>(null);
  const [crewList, setCrewList] = useState<CrewMember[]>([]);
  const [assets, setAssets] = useState<EquipmentAsset[]>(() => getCachedEquipmentTree() ?? []);
  const [loading, setLoading] = useState(true);
  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false);
  const [showHistory] = useState(false);
  // Lọc theo mã lịch khi bấm "Xem công việc" từ tab cấu hình
  const [scheduleCodeFilter, setScheduleCodeFilter] = useState('');
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  // Gantt draggable divider
  const [ganttLeftWidth, setGanttLeftWidth] = useState(680);
  const ganttDragging = useRef(false);
  const ganttStartX = useRef(0);
  const ganttStartW = useRef(680);

  // === Equipment tree state ===
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [treeSearch, setTreeSearch] = useState('');

  // === Column filters ===

  // === Table state ===

  // === Calendar state ===
  const [calendarDate, setCalendarDate] = useState(new Date());

  // === Gantt state ===
  // ganttTasks now derived from filteredTasks via useMemo (ganttTasksFromFiltered)

  // === Modals ===
  const [isAddScheduleModalOpen, setIsAddScheduleModalOpen] = useState(false);
  const [showImportMaintenance, setShowImportMaintenance] = useState(false);

  // === Schedule Config state ===
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(false);


  // === Counter state ===
  const [counterEditing, setCounterEditing] = useState<Record<string, number>>({});
  const [counterSaving, setCounterSaving] = useState<Set<string>>(new Set());
  const [counterFilterCode, setCounterFilterCode] = useState('');
  const [counterFilterName, setCounterFilterName] = useState('');
  const [counterSortField, setCounterSortField] = useState<string>('');
  const [counterSortDir, setCounterSortDir] = useState<'asc' | 'desc'>('asc');
  const [counterPage, setCounterPage] = useState(1);
  const [counterPageSize, setCounterPageSize] = useState(25);
  const dataRequestRunning = useRef(false);
  const schedulesLoaded = useRef(false);

  // === Config inline form state ===
  const [cfgEditingId, setCfgEditingId] = useState<string | null>(null);
  // Cấu hình bảo trì là bản chuẩn gắn với thiết bị nên chọn từ DANH MỤC vật tư (material_items),
  // cùng hệ id với liên kết thiết bị–vật tư. Tồn kho tàu tra kèm theo mã để hiển thị ROB.
  const [cfgMaterials, setCfgMaterials] = useState<MaterialCatalogItem[]>([]);
  const [cfgStockByItemCode, setCfgStockByItemCode] = useState<Record<string, { qty: number; unit?: string; minStock?: number | null }>>({});
  const [cfgSaving, setCfgSaving] = useState(false);
  const [cfgListSearch, setCfgListSearch] = useState('');
  const [cfgListFilters, setCfgListFilters] = useState({ code: '', device: '', name: '', type: '', priority: '', cycle: '' });
  const [cfgSelectedIds, setCfgSelectedIds] = useState<Set<string>>(new Set());
  const [cfgBulkDeleting, setCfgBulkDeleting] = useState(false);
  const cfgBulkDeleteRunning = useRef(false);
  useEffect(() => {
    const ids = new Set(schedules.map(schedule => schedule.id));
    setCfgSelectedIds(previous => {
      const next = new Set([...previous].filter(id => ids.has(id)));
      return next.size === previous.size ? previous : next;
    });
  }, [schedules]);
  const [cfgTreeSelectedIds, setCfgTreeSelectedIds] = useState<Set<string>>(new Set());
  const [cfgShowHistory, setCfgShowHistory] = useState(false);
  const cfgHistoryDialog = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!cfgShowHistory) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCfgShowHistory(false);
      if (event.key !== 'Tab') return;
      const controls = cfgHistoryDialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled])');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [cfgShowHistory]);
  // New: CBM, Risk Assessment, Inspection
  const [cfgIsCbm, setCfgIsCbm] = useState(false);
  const [cfgRequireRiskAssessment, setCfgRequireRiskAssessment] = useState(false);
  const [cfgRequireInspectionReport, setCfgRequireInspectionReport] = useState(false);
  const [cfgRiskFile, setCfgRiskFile] = useState<File | null>(null);
  const [cfgRiskFileName, setCfgRiskFileName] = useState('');
  // Crew planning state
  const [cfgCrewAssignments, setCfgCrewAssignments] = useState<{crewId: string; role: string}[]>([]);
  const [cfgCrewSearch, setCfgCrewSearch] = useState('');
  const [cfgActiveCrewDrop, setCfgActiveCrewDrop] = useState<string | null>(null);
  const [cfgShowSupportPanel, setCfgShowSupportPanel] = useState(false);
  const [cfgSupportSearch, setCfgSupportSearch] = useState('');
  const [cfgShowCreateTemplate, setCfgShowCreateTemplate] = useState(false);
  const [cfgTemplateName, setCfgTemplateName] = useState('');
  const [cfgShowChecklistTemplate, setCfgShowChecklistTemplate] = useState(false);
  // Track which materialItemIds are already linked to the selected equipment
  const [cfgLinkedMaterialIds, setCfgLinkedMaterialIds] = useState<Set<string>>(new Set());
  const cfgDefaultForm: CreateMaintenanceScheduleDto = {
    scheduleCode: '', equipmentGroupId: '', equipmentAssetId: undefined, taskTypeId: 1,
    scheduleName: '', maintenanceCategory: 'PERIODIC', intervalType: 'RUNNING_HOURS', intervalDays: undefined, intervalHours: undefined,
    daysBeforeDue: 70, priority: 'MEDIUM', estimatedDurationHours: undefined, autoGenerate: true,
    instructions: '', requiredSpareParts: [], checklistItemTemplates: []
  };

  useEffect(() => {
    const taskIds = new Set(tasks.map(task => task.id));
    setSelectedTaskIds(prev => new Set([...prev].filter(id => taskIds.has(id))));
  }, [tasks]);
  const [cfgForm, setCfgForm] = useState<CreateMaintenanceScheduleDto>({ ...cfgDefaultForm });

  useEffect(() => {
    const module = activeTab === 'config' ? 'pms.config' : activeTab === 'counter' ? 'pms.counter' : 'pms.work';
    if (!canPerform(module + '.view')) {
      const next: ViewTab = canPerform('pms.work.view') ? 'table' : canPerform('pms.config.view') ? 'config' : 'counter';
      if (next !== activeTab) setActiveTab(next);
    }
  }, [activeTab, permissionState.grants, permissionState.isAdmin]);

  // === Build equipment tree ===
  const tree = useMemo(() => buildTree(assets), [assets]);

  useEffect(() => {
    const selectableIds = new Set(assets.filter(asset => !isEquipmentFolder(asset)).map(asset => asset.id));
    setSelectedAssetIds(prev => {
      const next = new Set([...prev].filter(id => selectableIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setCfgTreeSelectedIds(prev => {
      const next = new Set([...prev].filter(id => selectableIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [assets]);


  // === Load data ===
  const loadData = useCallback(async (showSpinner = true) => {
    if (dataRequestRunning.current) return;
    dataRequestRunning.current = true;
    try {
      if (showSpinner) setLoading(true);
      else setIsBackgroundRefreshing(true);

      if (showSpinner) {
        void maritimeService.crew.getAll({ pageSize: 100, isOnboard: true })
          .then(response => setCrewList(response.data)).catch(error => console.error('Error loading crew:', error));
      }
      const [tasksRes, assetsRes] = await Promise.all([
        canPerform('pms.work.view') ? maritimeService.maintenance.getAll({ pageSize: 1000 }) : Promise.resolve({ data: [] }),
        equipmentAssetService.getTree(),
      ]);

      setTasks(prev => {
        const newJson = JSON.stringify(tasksRes.data);
        if (newJson !== JSON.stringify(prev)) return tasksRes.data;
        return prev;
      });
      setAssets(assetsRes);
    } catch (err) {
      console.error('Error loading work planning data:', err);
      toast.error(t('pms.workPlanning.toast.loadFailed'));
    } finally {
      dataRequestRunning.current = false;
      if (showSpinner) setLoading(false);
      else setIsBackgroundRefreshing(false);
    }
  }, []);

  // Load schedule config data
  const loadSchedules = useCallback(async () => {
    try {
      setScheduleLoading(true);
      const data = await maintenanceScheduleService.getAll();
      setSchedules(data);
      schedulesLoaded.current = true;
    } catch (error) {
      console.error('Error loading schedules:', error);
      toast.error(t('pms.workPlanning.toast.scheduleLoadFailed'));
    } finally {
      setScheduleLoading(false);
    }
  }, []);

  useEffect(() => {
    if (['config', 'calendar', 'gantt'].includes(activeTab) && !schedulesLoaded.current) void loadSchedules();
  }, [activeTab, loadSchedules]);

  const handleScheduleDelete = (schedule: MaintenanceSchedule) => {
    toast(`${t('pms.workPlanning.toast.confirmDeleteConfig')} "${schedule.scheduleName}"?`, {
      action: {
        label: t('pms.workPlanning.table.delete') || 'Xóa',
        onClick: async () => {
          try {
            await maintenanceScheduleService.delete(schedule.id);
            await loadSchedules();
            await loadData(false);
            if (cfgEditingId === schedule.id) cfgReset();
            toast.success(t('pms.workPlanning.toast.configDeleted'));
          } catch (error) {
            console.error('Error deleting schedule:', error);
            toast.error(t('pms.workPlanning.toast.configDeleteFailed'));
          }
        }
      },
      cancel: { label: t('pms.workPlanning.config.cancel') || 'Hủy', onClick: () => {} },
      duration: 8000,
    });
  };

  const handleBulkScheduleDelete = () => {
    const ids = [...cfgSelectedIds];
    if (!ids.length || cfgBulkDeleteRunning.current) return;
    toast(`Xóa ${ids.length} cấu hình đã chọn và các công việc liên quan?`, {
      id: 'bulk-delete-maintenance-config',
      action: {
        label: 'Xóa',
        onClick: async () => {
          if (cfgBulkDeleteRunning.current) return;
          cfgBulkDeleteRunning.current = true;
          setCfgBulkDeleting(true);
          const deleted = new Set<string>();
          try {
            // Bound concurrent requests and preserve failed rows for retry.
            for (let offset = 0; offset < ids.length; offset += 4) {
              const batch = ids.slice(offset, offset + 4);
              const results = await Promise.allSettled(batch.map(id => maintenanceScheduleService.delete(id)));
              results.forEach((result, index) => { if (result.status === 'fulfilled') deleted.add(batch[index]); });
            }
            setCfgSelectedIds(previous => new Set([...previous].filter(id => !deleted.has(id))));
            if (cfgEditingId && deleted.has(cfgEditingId)) { cfgReset(); setCfgShowHistory(true); }
            await Promise.all([loadSchedules(), loadData(false)]);
            if (deleted.size) toast.success(`Đã xóa ${deleted.size} cấu hình.`);
            if (deleted.size < ids.length) toast.error(`Không thể xóa ${ids.length - deleted.size} cấu hình. Các dòng lỗi vẫn được chọn để thử lại.`);
          } finally {
            cfgBulkDeleteRunning.current = false;
            setCfgBulkDeleting(false);
          }
        },
      },
      cancel: { label: 'Hủy', onClick: () => {} },
      duration: 8000,
    });
  };

  // Config inline form helpers
  const cfgReset = () => {
    setCfgEditingId(null);
    setCfgForm({ ...cfgDefaultForm });
    setCfgTreeSelectedIds(new Set());
    setCfgCrewAssignments([]);
    setCfgCrewSearch('');
    setCfgActiveCrewDrop(null);
    setCfgSupportSearch('');
    setCfgShowSupportPanel(false);
    setCfgShowHistory(false);
    setCfgIsCbm(false);
    setCfgRequireRiskAssessment(false);
    setCfgRequireInspectionReport(false);
    setCfgRiskFile(null);
    setCfgRiskFileName('');
    setCfgLinkedMaterialIds(new Set());
  };

  const cfgLoadForEdit = (schedule: MaintenanceSchedule) => {
    setCfgEditingId(schedule.id);
    // Populate tree selection from saved equipment
    if (schedule.equipmentAssetId) {
      setCfgTreeSelectedIds(new Set([schedule.equipmentAssetId]));
    } else if (schedule.equipmentGroupId) {
      const groupAssets = assets.filter(a => a.equipmentGroupId === schedule.equipmentGroupId);
      setCfgTreeSelectedIds(new Set(groupAssets.map(a => a.id)));
    } else {
      setCfgTreeSelectedIds(new Set());
    }
    // Parse crew data from instructions
    let crewData: {crewId: string; role: string}[] = [];
    let cleanInstructions = schedule.instructions || '';
    const crewMatch = cleanInstructions.match(/<!--CREW:(.*?)-->/s);
    if (crewMatch) {
      try {
        const parsed = JSON.parse(crewMatch[1]);
        crewData = parsed.a || [];
      } catch {}
      cleanInstructions = cleanInstructions.replace(/<!--CREW:.*?-->/s, '').trim();
    }
    setCfgCrewAssignments(crewData);
    setCfgCrewSearch('');
    setCfgActiveCrewDrop(null);
    // Parse META (CBM, risk, inspection) from instructions
    const metaMatch = cleanInstructions.match(/<!--META:(.*?)-->/s);
    if (metaMatch) {
      try {
        const meta = JSON.parse(metaMatch[1]);
        setCfgIsCbm(meta.cbm || false);
        setCfgRequireRiskAssessment(meta.reqRisk || false);
        setCfgRequireInspectionReport(meta.reqInspection || false);
        setCfgRiskFileName(meta.riskFile || '');
      } catch {}
      cleanInstructions = cleanInstructions.replace(/<!--META:.*?-->/s, '').trim();
    } else {
      setCfgIsCbm(false);
      setCfgRequireRiskAssessment(false);
      setCfgRequireInspectionReport(false);
      setCfgRiskFileName('');
    }
    setCfgForm({
      scheduleCode: schedule.scheduleCode,
      equipmentGroupId: schedule.equipmentGroupId || '',
      equipmentAssetId: schedule.equipmentAssetId,
      taskTypeId: schedule.taskTypeId || 1,
      scheduleName: schedule.scheduleName,
      maintenanceCategory: schedule.maintenanceCategory || 'PERIODIC',
      intervalType: schedule.intervalType || 'RUNNING_HOURS',
      intervalDays: schedule.intervalDays,
      intervalMonths: schedule.intervalMonths,
      intervalYears: schedule.intervalYears,
      workCode: schedule.workCode,
      intervalHours: schedule.intervalHours,
      daysBeforeDue: schedule.daysBeforeDue || (schedule.intervalType === 'RUNNING_HOURS' ? 70 : 7),
      priority: schedule.priority || 'MEDIUM',
      estimatedDurationHours: schedule.estimatedDurationHours,
      autoGenerate: true,
      instructions: cleanInstructions,
      requiredSpareParts: schedule.requiredSpareParts?.map(sp => ({
        materialItemId: sp.materialItemId, quantityRequired: sp.quantityRequired, isMandatory: sp.isMandatory ?? true
      })) || [],
      checklistItemTemplates: schedule.checklistItemTemplates?.map(t => ({
        sequenceOrder: t.sequenceOrder, checkpointDescription: t.checkpointDescription,
        requiresReading: t.requiresReading, normalRangeMin: t.normalRangeMin, normalRangeMax: t.normalRangeMax, unit: t.unit
      })) || []
    });
  };

  // Sao chép cấu hình làm mẫu (tạo mới, không sửa config gốc)
  const cfgCopyAsTemplate = (schedule: MaintenanceSchedule) => {
    cfgLoadForEdit(schedule);
    setCfgEditingId(null); // Quan trọng: không ở chế độ Sửa → submit sẽ tạo mới
    setCfgForm(f => ({ ...f, scheduleCode: `${f.scheduleCode}-COPY` }));
    toast.success(t('pms.workPlanning.toast.configCopied'));
  };

  const cfgSubmit = async () => {
    if (!cfgForm.scheduleCode || !cfgForm.scheduleName) { toast.error(t('pms.workPlanning.toast.fillCodeAndName')); return; }
    if (cfgTreeSelectedIds.size === 0) { toast.error(t('pms.workPlanning.toast.selectEquipment')); return; }
    if (cfgForm.maintenanceCategory !== 'AD_HOC' && !isEventMaintenance(cfgForm.maintenanceCategory)) {
      if (cfgForm.intervalType === 'RUNNING_HOURS' && !cfgForm.intervalHours) { toast.error(t('pms.workPlanning.toast.specifyRunningHours')); return; }
      if (cfgForm.intervalType === 'CALENDAR' && !cfgForm.intervalDays && !cfgForm.intervalMonths && !cfgForm.intervalYears) { toast.error(t('pms.workPlanning.toast.specifyInterval')); return; }
    }

    const submitData = { ...cfgForm };
    if (submitData.maintenanceCategory === 'AD_HOC' || isEventMaintenance(submitData.maintenanceCategory)) {
      submitData.intervalType = 'CALENDAR';
      submitData.intervalDays = isEventMaintenance(submitData.maintenanceCategory) ? undefined : 0;
      submitData.intervalHours = undefined;
      submitData.intervalMonths = undefined;
      submitData.intervalYears = undefined;
    } else if (submitData.intervalType === 'CALENDAR') {
      submitData.intervalHours = undefined;
    } else {
      submitData.intervalDays = undefined;
      submitData.intervalMonths = undefined;
      submitData.intervalYears = undefined;
    }
    submitData.autoGenerate = !isEventMaintenance(submitData.maintenanceCategory);
    // Map tree selection → equipmentAssetId or equipmentGroupId
    // Always per-asset: create one work item per selected equipment
    const selectedAssetIds = [...cfgTreeSelectedIds];
    submitData.equipmentAssetId = selectedAssetIds[0]; // first one for single or first call
    delete submitData.equipmentGroupId;
    // Serialize META (CBM, risk, inspection) into instructions
    const metaObj: Record<string, any> = {};
    if (cfgIsCbm) metaObj.cbm = true;
    if (cfgRequireRiskAssessment) metaObj.reqRisk = true;
    if (cfgRequireInspectionReport) metaObj.reqInspection = true;
    if (cfgRiskFileName) metaObj.riskFile = cfgRiskFileName;
    if (cfgRiskFile) metaObj.riskFileSize = cfgRiskFile.size;
    if (Object.keys(metaObj).length > 0) {
      submitData.instructions = ((submitData.instructions || '') + `\n<!--META:${JSON.stringify(metaObj)}-->`).trim();
    }
    // Serialize crew planning data into instructions
    if (cfgCrewAssignments.length > 0) {
      const crewJson = JSON.stringify({ a: cfgCrewAssignments });
      submitData.instructions = ((submitData.instructions || '') + `\n<!--CREW:${crewJson}-->`).trim();
    }

    try {
      setCfgSaving(true);
      if (cfgEditingId) {
        await maintenanceScheduleService.update(cfgEditingId, submitData);
        toast.success(t('pms.workPlanning.toast.configUpdated'));
      } else {
        // Create one work item per selected equipment
        const allAssetIds = [...cfgTreeSelectedIds];
        let successCount = 0;
        const errors: string[] = [];
        for (let i = 0; i < allAssetIds.length; i++) {
          const assetId = allAssetIds[i];
          const perAssetData = { ...submitData, equipmentAssetId: assetId };
          delete perAssetData.equipmentGroupId;
          // Unique scheduleCode per equipment (append suffix if multiple)
          if (allAssetIds.length > 1) {
            perAssetData.scheduleCode = `${cfgForm.scheduleCode}-${i + 1}`;
          }
          try {
            await maintenanceScheduleService.create(perAssetData);
            successCount++;
          } catch (err: any) {
            const msg = err.response?.data?.error || err.message || t('pms.workPlanning.toast.error');
            errors.push(`${perAssetData.scheduleCode}: ${msg}`);
          }
        }
        if (successCount > 0) {
          toast.success(t('pms.workPlanning.toast.tasksCreated', { success: String(successCount), total: String(allAssetIds.length) }));
        }
        if (errors.length > 0) {
          toast.error(`${t('pms.workPlanning.toast.error')}: ${errors.join('; ')}`);
        }
        if (successCount === 0) throw new Error(t('pms.workPlanning.toast.allFailed'));
      }
      await loadSchedules();
      loadData(false);
      cfgReset();
    } catch (error: any) {
      const msg = error.response?.data?.error || error.response?.data?.message || t('pms.workPlanning.toast.saveFailed');
      toast.error(msg);
    } finally {
      setCfgSaving(false);
    }
  };

  const cfgAddSparePart = () => {
    setCfgForm(f => ({ ...f, requiredSpareParts: [...(f.requiredSpareParts || []), { materialItemId: '', quantityRequired: 1, isMandatory: true }] }));
  };
  const cfgRemoveSparePart = (i: number) => {
    setCfgForm(f => { const u = [...(f.requiredSpareParts || [])]; u.splice(i, 1); return { ...f, requiredSpareParts: u }; });
  };
  const cfgUpdateSparePart = (i: number, field: keyof CreateScheduleSparePartDto, val: any) => {
    setCfgForm(f => { const u = [...(f.requiredSpareParts || [])]; u[i] = { ...u[i], [field]: val }; return { ...f, requiredSpareParts: u }; });
  };
  // Assign a manually-added material to the selected equipment
  const cfgAssignMaterialToEquipment = async (materialItemId: string) => {
    if (!materialItemId || cfgTreeSelectedIds.size === 0) return;
    try {
      const eqIds = [...cfgTreeSelectedIds];
      await materialService.assignEquipment({ materialItemIds: [materialItemId], equipmentAssetIds: eqIds });
      setCfgLinkedMaterialIds(prev => new Set([...prev, materialItemId]));
      toast.success(t('pms.workPlanning.toast.materialLinked'));
    } catch {
      toast.error(t('pms.workPlanning.toast.materialLinkFailed'));
    }
  };
  const cfgAddChecklist = () => {
    setCfgForm(f => ({ ...f, checklistItemTemplates: [...(f.checklistItemTemplates || []), { sequenceOrder: (f.checklistItemTemplates?.length || 0) + 1, checkpointDescription: '', requiresReading: false }] }));
  };
  const cfgRemoveChecklist = (i: number) => {
    setCfgForm(f => { const u = [...(f.checklistItemTemplates || [])]; u.splice(i, 1); u.forEach((it, idx) => { it.sequenceOrder = idx + 1; }); return { ...f, checklistItemTemplates: u }; });
  };
  const cfgUpdateChecklist = (i: number, field: keyof ChecklistItemTemplateDto, val: any) => {
    setCfgForm(f => { const u = [...(f.checklistItemTemplates || [])]; u[i] = { ...u[i], [field]: val }; return { ...f, checklistItemTemplates: u }; });
  };

  // Checklist template helper
  const cfgApplyChecklistTemplate = (templateKey: string) => {
    let tpl = CHECKLIST_TEMPLATES[templateKey];
    if (!tpl) {
      try { const custom = JSON.parse(localStorage.getItem('pms_custom_templates') || '{}'); tpl = custom[templateKey]; } catch {}
    }
    if (!tpl) return;
    const startOrder = (cfgForm.checklistItemTemplates?.length || 0) + 1;
    const newItems: ChecklistItemTemplateDto[] = tpl.items.map((item, idx) => ({
      sequenceOrder: startOrder + idx,
      checkpointDescription: item.desc,
      requiresReading: item.reading || false,
      normalRangeMin: item.min,
      normalRangeMax: item.max,
      unit: item.unit
    }));
    setCfgForm(f => ({ ...f, checklistItemTemplates: [...(f.checklistItemTemplates || []), ...newItems] }));
    setCfgShowChecklistTemplate(false);
    toast.success(t('pms.workPlanning.toast.templateApplied', { count: String(newItems.length), name: tpl.label }));
  };

  // Config crew helpers
  const cfgAddCrew = (crewId: string, role: string = 'SUPPORT') => {
    if (cfgCrewAssignments.some(a => a.crewId === crewId)) return;
    setCfgCrewAssignments(prev => [...prev, { crewId, role }]);
    setCfgCrewSearch('');
    setCfgActiveCrewDrop(null);
  };
  const cfgRemoveCrew = (i: number) => {
    setCfgCrewAssignments(prev => { const u = [...prev]; u.splice(i, 1); return u; });
  };

  const cfgSaveAsTemplate = () => {
    if (!cfgForm.checklistItemTemplates?.length) { toast.error(t('pms.workPlanning.toast.noChecklistForTemplate')); return; }
    setCfgTemplateName('');
    setCfgShowCreateTemplate(true);
  };

  const cfgConfirmSaveTemplate = () => {
    if (!cfgTemplateName.trim()) { toast.error(t('pms.workPlanning.toast.enterTemplateName')); return; }
    const key = 'CUSTOM_' + Date.now();
    const saved = JSON.parse(localStorage.getItem('pms_custom_templates') || '{}');
    saved[key] = {
      label: cfgTemplateName.trim(),
      items: cfgForm.checklistItemTemplates!.map(t => ({
        desc: t.checkpointDescription, reading: t.requiresReading, min: t.normalRangeMin, max: t.normalRangeMax, unit: t.unit
      }))
    };
    localStorage.setItem('pms_custom_templates', JSON.stringify(saved));
    toast.success(t('pms.workPlanning.toast.templateSaved', { name: cfgTemplateName.trim() }));
    setCfgShowCreateTemplate(false);
    setCfgTemplateName('');
  };

  // Config: load materials when switching to config tab
  useEffect(() => {
    if (activeTab === 'config') {
      Promise.all([
        materialService.getCatalog(),
        materialService.getItems(),
        inventoryService.getAll({ page: 1, pageSize: 100000 }),
      ])
        .then(([catalog, shipItems, inventory]) => {
          // inventory_stocks khoá theo id kho tàu → quy về mã vật tư để khớp với danh mục.
          const qtyByShipId: Record<string, number> = {};
          inventory.items.forEach(row => {
            qtyByShipId[row.materialItemId] = (qtyByShipId[row.materialItemId] || 0) + Number(row.quantity || 0);
          });
          const nextStock: Record<string, { qty: number; unit?: string; minStock?: number | null }> = {};
          shipItems.forEach(s => {
            nextStock[s.itemCode] = {
              qty: qtyByShipId[s.id] ?? Number(s.onHandQuantity || 0),
              unit: s.unit,
              minStock: s.minStock,
            };
          });
          setCfgMaterials(catalog);
          setCfgStockByItemCode(nextStock);
        })
        .catch(console.error);
    }
  }, [activeTab]);

  // Config: auto-populate spare parts when equipment selection changes
  useEffect(() => {
    if (cfgTreeSelectedIds.size === 0) {
      setCfgLinkedMaterialIds(new Set());
      return;
    }
    // Fetch materials linked to all selected equipment
    const eqIds = [...cfgTreeSelectedIds];
    Promise.all(eqIds.map(id => materialService.getMaterialsByEquipment(id).catch(() => [])))
      .then(results => {
        const allLinked = results.flat();
        // Deduplicate by materialItemId
        const seen = new Map<string, typeof allLinked[0]>();
        allLinked.forEach(m => { if (!seen.has(m.materialItemId)) seen.set(m.materialItemId, m); });
        const linkedIds = new Set(seen.keys());
        setCfgLinkedMaterialIds(linkedIds);
        setCfgForm(prev => {
          const linkedRows = [...seen.values()].map(m => ({
            materialItemId: m.materialItemId,
            quantityRequired: Number(m.quantityRequired ?? 1) || 1,
            isMandatory: true,
          }));
          if (seen.size === 0) return prev;

          if (!prev.requiredSpareParts || prev.requiredSpareParts.length === 0) {
            return { ...prev, requiredSpareParts: linkedRows };
          }

          const existingIds = new Set(prev.requiredSpareParts.map(part => part.materialItemId).filter(Boolean));
          const updatedRows = prev.requiredSpareParts.map(part => {
            const linked = part.materialItemId ? seen.get(part.materialItemId) : undefined;
            return linked
              ? { ...part, quantityRequired: Number(linked.quantityRequired ?? part.quantityRequired ?? 1) || 1 }
              : part;
          });
          const appendedRows = linkedRows.filter(row => !existingIds.has(row.materialItemId));
          return { ...prev, requiredSpareParts: [...updatedRows, ...appendedRows] };
        });
      })
      .catch(console.error);
  }, [cfgTreeSelectedIds]);

  // Config: selected equipment names from tree
  const cfgSelectedEquipmentNames = useMemo(() => {
    return assets.filter(a => !isEquipmentFolder(a) && cfgTreeSelectedIds.has(a.id)).map(a => ({ id: a.id, code: a.assetCode, name: a.assetName }));
  }, [assets, cfgTreeSelectedIds]);

  // Config: schedules filtered for left list
  const cfgListItems = useMemo(() => {
    const search = cfgListSearch.trim().toLowerCase();
    const matches = (value: string | undefined, query: string) => (value || '').toLowerCase().includes(query.trim().toLowerCase());
    return schedules.filter(sch => {
      const cycle = sch.intervalMonths ? `${sch.intervalMonths} tháng` : sch.intervalYears ? `${sch.intervalYears} năm` : sch.intervalHours ? `${sch.intervalHours} giờ` : sch.intervalDays ? `${sch.intervalDays} ngày` : '';
      return (!search || [sch.scheduleCode, sch.workCode, sch.scheduleName, sch.assetName].some(value => matches(value, search)))
        && matches(sch.workCode || sch.scheduleCode, cfgListFilters.code)
        && matches(sch.assetName, cfgListFilters.device)
        && matches(sch.scheduleName, cfgListFilters.name)
        && (!cfgListFilters.type || sch.maintenanceCategory === cfgListFilters.type)
        && (!cfgListFilters.priority || sch.priority === cfgListFilters.priority)
        && matches(cycle, cfgListFilters.cycle);
    });
  }, [schedules, cfgListSearch, cfgListFilters]);
  const cfgAllVisibleSelected = cfgListItems.length > 0 && cfgListItems.every(schedule => cfgSelectedIds.has(schedule.id));
  const cfgSomeVisibleSelected = cfgListItems.some(schedule => cfgSelectedIds.has(schedule.id));
  const cfgToggleSelected = (id: string) => setCfgSelectedIds(previous => {
    const next = new Set(previous);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // Config: crew filtered for dropdown (deduplicated by id)
  const cfgFilteredCrew = useMemo(() => {
    const seen = new Set<string>();
    let list = crewList.filter(c => {
      if (!c.isOnboard || seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    const assigned = new Set(cfgCrewAssignments.map(a => a.crewId));
    list = list.filter(c => !assigned.has(c.id));
    if (cfgCrewSearch) {
      const s = cfgCrewSearch.toLowerCase();
      list = list.filter(c => c.fullName.toLowerCase().includes(s) || (c.rank?.rankCode || '').toLowerCase().includes(s));
    }
    return list.slice(0, 15);
  }, [crewList, cfgCrewAssignments, cfgCrewSearch]);

  // Config: crew grouped by department for SUPPORT tree selection
  const cfgCrewByDept = useMemo(() => {
    const seen = new Set<string>();
    const assigned = new Set(cfgCrewAssignments.map(a => a.crewId));
    let list = crewList.filter(c => {
      if (!c.isOnboard || seen.has(c.id) || assigned.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
    if (cfgSupportSearch) {
      const s = cfgSupportSearch.toLowerCase();
      list = list.filter(c => c.fullName.toLowerCase().includes(s) || (c.rank?.rankCode || '').toLowerCase().includes(s) || (c.department || '').toLowerCase().includes(s));
    }
    const groups: Record<string, typeof list> = {};
    list.forEach(c => {
      const dept = c.department || t('pms.workPlanning.config.otherDept');
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(c);
    });
    return groups;
  }, [crewList, cfgCrewAssignments, cfgSupportSearch]);

  // Counter helpers
  const counterAssets = useMemo(() => {
    return assets.filter(a => !isEquipmentFolder(a));
  }, [assets]);

  const filteredCounterAssets = useMemo(() => {
    let list = selectedAssetIds.size === 0 ? counterAssets : counterAssets.filter(a => selectedAssetIds.has(a.id));
    if (counterFilterCode) list = list.filter(a => a.assetCode.toLowerCase().includes(counterFilterCode.toLowerCase()));
    if (counterFilterName) list = list.filter(a => a.assetName.toLowerCase().includes(counterFilterName.toLowerCase()));
    if (counterSortField) {
      list = [...list].sort((a, b) => {
        let va: any, vb: any;
        switch (counterSortField) {
          case 'assetCode': va = a.assetCode; vb = b.assetCode; break;
          case 'assetName': va = a.assetName; vb = b.assetName; break;
          case 'currentRunningHours': va = a.currentRunningHours || 0; vb = b.currentRunningHours || 0; break;
          case 'lastRunningHoursUpdate': va = a.lastRunningHoursUpdate || ''; vb = b.lastRunningHoursUpdate || ''; break;
          default: return 0;
        }
        if (typeof va === 'string') { va = va.toLowerCase(); vb = (vb as string).toLowerCase(); }
        if (va < vb) return counterSortDir === 'asc' ? -1 : 1;
        if (va > vb) return counterSortDir === 'asc' ? 1 : -1;
        return 0;
      });
    }
    return list;
  }, [counterAssets, selectedAssetIds, counterFilterCode, counterFilterName, counterSortField, counterSortDir]);

  const counterTotalPages = Math.max(1, Math.ceil(filteredCounterAssets.length / counterPageSize));
  const effectiveCounterPage = Math.min(counterPage, counterTotalPages);
  const counterOffset = (effectiveCounterPage - 1) * counterPageSize;
  const pagedCounterAssets = useMemo(() => filteredCounterAssets.slice(counterOffset, counterOffset + counterPageSize), [filteredCounterAssets, counterOffset, counterPageSize]);
  useEffect(() => { setCounterPage(1); }, [selectedAssetIds, counterFilterCode, counterFilterName, counterSortField, counterSortDir, counterPageSize]);
  useEffect(() => { setCounterPage(page => Math.min(page, counterTotalPages)); }, [counterTotalPages]);

  const handleCounterSort = (field: string) => {
    if (counterSortField === field) {
      setCounterSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setCounterSortField(field);
      setCounterSortDir('asc');
    }
  };

  // Config helpers: count tasks per schedule code, next due info
  // Navigate from config to table with filter by schedule code
  const viewScheduleTasks = (scheduleCode: string) => {
    setScheduleCodeFilter(scheduleCode);
    setActiveTab('table');
  };

  // Jump from Table tab → Config tab to edit PIC/Receiver/Support for a task's schedule
  const handleEditTaskConfig = async (task: MaintenanceTask) => {
    try {
      let available = schedules;
      if (task.scheduleId && !available.some(s => s.id === task.scheduleId)) {
        const fetched = await maintenanceScheduleService.getById(task.scheduleId);
        available = [...available, fetched];
        setSchedules(previous => previous.some(s => s.id === fetched.id) ? previous : [...previous, fetched]);
      } else if (!task.scheduleId && !schedulesLoaded.current) {
        available = await maintenanceScheduleService.getAll();
        setSchedules(available);
        schedulesLoaded.current = true;
      }
      // 1. Find schedule directly by scheduleId
      let schedule = available.find(s => s.id === task.scheduleId);
      // 2. Fallback: match via scheduleCode embedded in task notes
      if (!schedule) {
        const { scheduleCode } = parseTaskScheduleInfo(task);
        if (scheduleCode) schedule = available.find(s => s.scheduleCode === scheduleCode);
      }
      // 3. Fallback: match by taskId prefix (taskId = scheduleCode + suffix like '-1', '-2')
      if (!schedule) {
        const prefix = task.taskId?.replace(/-\d+$/, '');
        if (prefix) schedule = available.find(s => task.taskId?.startsWith(`SCHED-${s.scheduleCode}-`) || s.scheduleCode === prefix || task.taskId?.startsWith(`${s.scheduleCode}-`));
      }
      if (!schedule) {
        toast.error(t('pms.workPlanning.toast.scheduleNotFound'));
        return;
      }
      cfgLoadForEdit(schedule);
      setActiveTab('config');
    } catch (error) {
      toast.error(t(axios.isAxiosError(error) && error.response?.status === 404
        ? 'pms.workPlanning.toast.scheduleNotFound' : 'pms.workPlanning.toast.scheduleLoadFailed'));
    }
  };

  const handleTaskDelete = (taskId: string) => {
    toast(t('pms.workPlanning.toast.confirmDeleteTask'), {
      action: {
        label: t('pms.workPlanning.table.delete') || 'Xóa',
        onClick: async () => {
          try {
            await maritimeService.maintenance.delete(taskId);
            toast.success(t('pms.workPlanning.toast.deleteTaskSuccess'));
            loadData(false);
          } catch (error) {
            console.error('Error deleting task:', error);
            toast.error(t('pms.workPlanning.toast.deleteTaskFailed'));
          }
        }
      },
      cancel: { label: t('pms.workPlanning.config.cancel') || 'Hủy', onClick: () => {} },
      duration: 8000,
    });
  };

  const handleCounterSave = async (assetId: string) => {
    const newHours = counterEditing[assetId];
    if (newHours === undefined) return;
    const asset = assets.find(a => a.id === assetId);
    const currentHours = asset?.currentRunningHours ?? 0;
    if (!Number.isFinite(newHours)) {
      toast.error(t('pms.workPlanning.toast.hoursInvalid'));
      return;
    }
    if (newHours < currentHours) {
      toast.error(t('pms.workPlanning.toast.hoursCannotDecrease', {
        current: String(currentHours),
        requested: String(newHours),
      }));
      return;
    }
    setCounterSaving(prev => new Set(prev).add(assetId));
    try {
      const res = await equipmentAssetService.updateRunningHours(assetId, newHours);
      setAssets(prev => prev.map(a => a.id === assetId ? { ...a, currentRunningHours: newHours, lastRunningHoursUpdate: new Date().toISOString() } : a));
      setCounterEditing(prev => { const n = { ...prev }; delete n[assetId]; return n; });
      const triggered = res?.triggeredTasks || 0;
      if (triggered > 0) {
        toast.success(t('pms.workPlanning.toast.hoursUpdateTriggered', { count: String(triggered) }));
        loadData(false); // Refresh task list to show newly DUE tasks
      } else {
        toast.success(t('pms.workPlanning.toast.hoursUpdated'));
      }
    } catch (error) {
      console.error('Error updating running hours:', error);
      const data = (error as any)?.response?.data;
      if (data?.code === 'RUNNING_HOURS_BELOW_CURRENT') {
        toast.error(t('pms.workPlanning.toast.hoursCannotDecrease', {
          current: String(data.current ?? currentHours),
          requested: String(data.requested ?? newHours),
        }));
      } else {
        toast.error(data?.error || data?.message || t('pms.workPlanning.toast.hoursUpdateFailed'));
      }
    } finally {
      setCounterSaving(prev => { const n = new Set(prev); n.delete(assetId); return n; });
    }
  };

  useEffect(() => {
    loadData(true);
    const iv = setInterval(() => { if (!document.hidden) void loadData(false); }, 15000);
    return () => clearInterval(iv);
  }, [loadData]);

  // === Split active vs history tasks ===
  const { activeTasks, historyTasks } = useMemo(() => {
    const history = tasks.filter(task => task.status === 'COMPLETED' || task.status === 'CANCELLED');
    // Keep main list intact; history is an additional copied view
    const active = [...tasks];
    return { activeTasks: active, historyTasks: history };
  }, [tasks]);

  // === Filter tasks ===
  const filteredTasks = useMemo(() => {
    let f = showHistory ? [...historyTasks] : [...activeTasks];

    // Equipment filter (from tree selection)
    if (selectedAssetIds.size > 0) {
      f = f.filter(task => {
        if (task.equipmentId && selectedAssetIds.has(task.equipmentId)) return true;
        if (task.equipmentAssetId && selectedAssetIds.has(task.equipmentAssetId)) return true;
        if (task.equipmentGroupId) {
          const groupAssets = assets.filter(a => a.equipmentGroupId === task.equipmentGroupId);
          return groupAssets.some(a => selectedAssetIds.has(a.id));
        }
        return false;
      });
    }

    if (scheduleCodeFilter) {
      const code = scheduleCodeFilter.toLowerCase();
      f = f.filter(task => task.taskDescription.toLowerCase().includes(code));
    }

    return f;
  }, [showHistory, activeTasks, historyTasks, selectedAssetIds, assets, scheduleCodeFilter]);

  // Gantt data — derived from filteredTasks (same source as Bảng/Lịch/Kanban)
  const scheduleById = useMemo(() => new Map(schedules.map(schedule => [schedule.id, schedule])), [schedules]);
  const equipmentById = useMemo(() => new Map(assets.map(asset => [asset.id, asset])), [assets]);
  const getCounterAwareDueDate = useCallback((task: MaintenanceTask) => {
    const dueDate = parseISO(task.nextDueAt);
    const isRunningHours = !!task.intervalHours && !task.intervalDays;
    if (!isRunningHours) return dueDate;

    const schedule = task.scheduleId ? scheduleById.get(task.scheduleId) : undefined;
    const asset = task.equipmentAssetId ? equipmentById.get(task.equipmentAssetId) : undefined;
    if (schedule?.nextDueRunningHours === undefined || asset?.currentRunningHours === undefined) return dueDate;

    const hoursRemaining = Math.max(0, schedule.nextDueRunningHours - asset.currentRunningHours);
    return addDays(startOfToday(), Math.ceil(hoursRemaining / RUNNING_HOURS_PER_DAY));
  }, [scheduleById, equipmentById]);

  const ganttTasksFromFiltered = useMemo((): GanttTask[] => {
    if (activeTab !== 'gantt') return [];
    return filteredTasks
      .filter(t => t.nextDueAt)
      .map(t => {
        const isRunningHours = !!t.intervalHours && !t.intervalDays;
        const dueDate = getCounterAwareDueDate(t);

        const today = startOfToday();
        const dueDt = new Date(dueDate); dueDt.setHours(0,0,0,0);
        const daysUntil = Math.ceil((dueDt.getTime() - today.getTime()) / 86400000);
        const intervalType: GanttTask['intervalType'] = isRunningHours ? 'RUNNING_HOURS' : 'CALENDAR';

        const configuredWarning = Math.max(1, Number(t.daysBeforeDue || (isRunningHours ? 70 : 7)));
        const leadTimeDays = isRunningHours
          ? Math.max(1, Math.ceil(configuredWarning / RUNNING_HOURS_PER_DAY))
          : configuredWarning;
        const startDate = addDays(dueDate, -leadTimeDays);
        const isOverdue = t.status === 'OVERDUE' || daysUntil < 0;
        let progress = 0;
        if (t.status === 'COMPLETED') progress = 100;
        else if (t.status === 'IN_PROGRESS') progress = 50;
        else if (isOverdue) progress = 100;
        else if (daysUntil <= leadTimeDays) progress = Math.min(95, ((leadTimeDays - daysUntil) / leadTimeDays) * 100);

        const workDurationDays = getTaskDurationDays(t.estimatedDuration);
        const checklistItems = t.checklistItems || [];
        const checklistTotal = Number((t as any).checklistItemsCount ?? checklistItems.length ?? 0);
        const checklistCompleted = Number((t as any).checklistCompletedCount ?? checklistItems.filter(item => item.isCompleted).length ?? 0);

        return {
          id: t.id,
          name: t.taskDescription || t.taskId,
          groupName: t.equipmentAssetName || t.equipmentName || '',
          dueDate,
          startDate,
          workDurationDays,
          leadTimeDays,
          priority: t.priority,
          isOverdue,
          daysUntilDue: daysUntil,
          intervalType,
          intervalValue: t.intervalHours || t.intervalDays,
          progress,
          checklistCompleted,
          checklistTotal,
        };
      })
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  }, [filteredTasks, getCounterAwareDueDate, activeTab]);

  const selectedTaskCount = selectedTaskIds.size;

  const handleBulkTaskDelete = () => {
    if (selectedTaskIds.size === 0) return;
    const ids = Array.from(selectedTaskIds);
    toast(t('pms.workPlanning.toast.confirmBulkDeleteTasks', { count: String(ids.length) }), {
      action: {
        label: t('pms.workPlanning.table.delete') || 'Xóa',
        onClick: async () => {
          try {
            await Promise.all(ids.map(id => maritimeService.maintenance.delete(id)));
            setSelectedTaskIds(new Set());
            toast.success(t('pms.workPlanning.toast.bulkDeleteTaskSuccess', { count: String(ids.length) }));
            loadData(false);
          } catch (error) {
            console.error('Error bulk deleting tasks:', error);
            toast.error(t('pms.workPlanning.toast.bulkDeleteTaskFailed'));
          }
        }
      },
      cancel: { label: t('pms.workPlanning.config.cancel') || 'Hủy', onClick: () => {} },
      duration: 8000,
    });
  };

  // === Toggle tree node ===
  const toggleExpand = (id: string) => {
    setExpandedNodes(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  const toggleAssetSelection = (node: EquipmentAsset) => {
    const ids = getSelectableEquipmentIds(node);
    if (ids.size === 0) return;
    setSelectedAssetIds(prev => {
      const n = new Set(prev);
      const allSelected = [...ids].every(id => n.has(id));
      if (allSelected) {
        ids.forEach(id => n.delete(id));
      } else {
        ids.forEach(id => n.add(id));
      }
      return n;
    });
  };

  const toggleCfgAssetSelection = (node: EquipmentAsset) => {
    const ids = getSelectableEquipmentIds(node);
    if (ids.size === 0) return;
    setCfgTreeSelectedIds(prev => {
      const n = new Set(prev);
      const allSelected = [...ids].every(id => n.has(id));
      if (allSelected) {
        ids.forEach(id => n.delete(id));
      } else {
        ids.forEach(id => n.add(id));
      }
      return n;
    });
  };

  const taskName = (task: MaintenanceTask) => task.taskDescription?.split('\n')[0] || task.taskType;
  const taskEquipment = (task: MaintenanceTask) => task.equipmentName || task.equipmentAssetName || task.equipmentGroupName || '';
  const taskDetail = (task: MaintenanceTask) => task.taskDescription?.split('\n').slice(1).join('\n').replace(/<!--(META|CREW):.*?-->/gs, '').trim() || '';

  const taskColumns: Column<MaintenanceTask>[] = [
    { key: 'taskName', header: t('pms.workPlanning.table.taskName'), width: 220, value: taskName, truncate: true },
    {
      key: 'taskId', header: t('pms.workPlanning.table.taskCode'), width: 200, value: task => task.taskId,
      render: task => (
        <button type="button" onClick={() => navigate(`/pms/work-report/${task.id}`)} className="text-left font-medium text-blue-600 hover:underline">{task.taskId}</button>
      ),
    },
    { key: 'equipment', header: t('pms.workPlanning.table.equipmentName'), width: 220, value: taskEquipment, truncate: true, render: task => taskEquipment(task) || <span className="text-gray-400">—</span> },
    { key: 'description', header: t('pms.workPlanning.table.taskDescription'), width: 260, value: taskDetail, truncate: true, className: 'text-gray-500' },
    {
      key: 'risk', header: t('pms.workPlanning.table.riskAssessment'), width: 140, align: 'center',
      value: task => (task.requireRiskAssessment ? 'Có' : 'Không'),
      render: task => (task.requireRiskAssessment ? <CheckCircle className="mx-auto h-4 w-4 text-green-500" /> : <span className="text-gray-300">-</span>),
    },
    {
      key: 'priority', header: t('pms.workPlanning.table.priority'), width: 120, align: 'center', value: task => getPriorityLabel(task.priority),
      render: task => {
        const pri = PRIORITY_LABELS[task.priority] || PRIORITY_LABELS.NORMAL;
        return <span className={`whitespace-nowrap rounded px-2 py-0.5 font-medium ${pri.bg} ${pri.text}`}>{getPriorityLabel(task.priority)}</span>;
      },
    },
    {
      key: 'status', header: t('pms.workPlanning.table.status'), width: 150, align: 'center', value: task => getStatusLabel(task.status),
      render: task => {
        const sts = STATUS_LABELS[task.status] || STATUS_LABELS.SCHEDULED;
        return (
          <>
            <span className={`whitespace-nowrap rounded px-2 py-0.5 font-medium ${sts.bg} ${sts.text}`}>{getStatusLabel(task.status)}</span>
            {task.hasPendingDeferral && (
              <span className="ml-1 whitespace-nowrap rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-700">{t('pms.workPlanning.table.deferralPending')}</span>
            )}
          </>
        );
      },
    },
    { key: 'type', header: t('pms.workPlanning.table.type'), width: 130, align: 'center', value: task => maintenanceCategoryLabel(task.taskType, t), className: 'text-gray-500' },
    {
      key: 'actions', header: 'Hành động', width: 130, align: 'center', exportable: false,
      render: task => (
        <TableActions>
          <button type="button" onClick={() => navigate(`/pms/work-report/${task.id}`)} className="rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600" title={t('pms.workPlanning.table.view')}>
            <Eye className="h-3.5 w-3.5" />
          </button>
          {['PERIODIC', 'CALENDAR', 'RUNNING_HOURS', 'HYBRID'].includes(task.taskType) && <button type="button" onClick={() => setHistoryTask(task)} title="Lịch sử bảo trì" aria-label="Lịch sử bảo trì" className="shrink-0 rounded p-1 text-gray-400 hover:bg-blue-50 hover:text-blue-600"><History size={14} /></button>}
          <PermissionGate permission="pms.config.update"><button type="button" disabled={!canPerform('pms.config.update')} onClick={() => handleEditTaskConfig(task)} className="rounded p-1 text-gray-400 hover:bg-green-50 hover:text-green-600" title={t('pms.workPlanning.table.editConfig')}>
            <Pencil className="h-3.5 w-3.5" />
          </button></PermissionGate>
          <PermissionGate permission={'pms.work.delete'}><button type="button" className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" title={t('pms.workPlanning.table.delete')} disabled={!canPerform('pms.work.delete')} onClick={() => handleTaskDelete(task.id)}>
            <Trash2 className="h-3.5 w-3.5" />
          </button></PermissionGate>
        </TableActions>
      ),
    },
  ];

  // === Calendar helpers ===
  const calendarDays = useMemo(() => {
    const start = startOfMonth(calendarDate);
    const end = endOfMonth(calendarDate);
    return eachDayOfInterval({ start, end });
  }, [calendarDate]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, MaintenanceTask[]>();
    if (activeTab !== 'calendar') return map;
    filteredTasks.forEach(task => {
      if (task.nextDueAt) {
        const dueDate = getCounterAwareDueDate(task);
        // RUNNING_HOURS: chỉ hiện 1 ngày (mốc ước tính, counter mới là trigger thực)
        // CALENDAR: span theo estimatedDuration (giờ → ngày làm việc)
        const durationDays = getTaskDurationDays(task.estimatedDuration);
        for (let d = 0; d < durationDays; d++) {
          const dateKey = format(addDays(dueDate, d), 'yyyy-MM-dd');
          const list = map.get(dateKey) || [];
          list.push(task);
          map.set(dateKey, list);
        }
      }
    });
    return map;
  }, [filteredTasks, getCounterAwareDueDate, activeTab]);

  // === Gantt helpers ===
  const ganttDays = useMemo(() => {
    const days: Date[] = [];
    const start = new Date();
    start.setMonth(start.getMonth() - 2);
    start.setDate(1);
    start.setHours(0,0,0,0);
    for (let i = 0; i < 365; i++) { const d = new Date(start); d.setDate(d.getDate() + i); days.push(d); }
    return days;
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="ml-3 text-gray-600">{t('pms.workPlanning.loading')}</p>
      </div>
    );
  }

  // ===================== RENDER =====================
  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-white">
      {/* === HEADER ROW 1: titles === */}
      <div className="flex flex-shrink-0 border-b border-gray-200">
        {/* Header trái: root tree */}
        <button
          onClick={() => activeTab === 'config' ? setCfgTreeSelectedIds(new Set()) : setSelectedAssetIds(new Set())}
          className={`w-64 flex-shrink-0 flex items-center gap-1.5 px-3 py-3 text-sm font-semibold border-r border-gray-200 ${
            (activeTab === 'config' ? cfgTreeSelectedIds.size === 0 : selectedAssetIds.size === 0)
              ? 'bg-blue-800 text-white'
              : 'text-gray-700 hover:bg-gray-50 bg-white'
          }`}
        >
          <FolderOpen className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1 text-left truncate">{t('pms.workPlanning.allEquipment')} ({assets.length})</span>
        </button>

        {/* Header phải: title + action buttons */}
        <div className="flex-1 flex items-center justify-between px-4 py-3 bg-white">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">
              {showHistory ? `≡ ${t('pms.workPlanning.taskHistory')}` : `≡ ${t('pms.workPlanning.myTaskList')}`}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${showHistory ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-700'}`}>{filteredTasks.length}</span>
            {historyTasks.length > 0 && !showHistory && (
              <span className="text-xs text-gray-400">+{historyTasks.length} {t('pms.workPlanning.archived')}</span>
            )}
            {isBackgroundRefreshing && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded text-xs text-blue-600">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                {t('pms.workPlanning.syncing')}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <PermissionGate permission={'pms.work.delete'}><button
              onClick={handleBulkTaskDelete}
              disabled={!canPerform('pms.work.delete') || selectedTaskCount === 0}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
              title={t('pms.workPlanning.table.bulkDelete')}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t('pms.workPlanning.table.bulkDelete')}
              {selectedTaskCount > 0 && <span className="font-semibold">({selectedTaskCount})</span>}
            </button></PermissionGate>
            <button onClick={() => loadData(true)} className="p-1.5 border border-gray-300 rounded text-gray-500 hover:bg-gray-50" title={t('pms.workPlanning.refresh')}>
              <RefreshCw className={`w-3.5 h-3.5 ${isBackgroundRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* === HEADER ROW 2: search + tab bar === */}
      <div className="flex flex-shrink-0 border-b border-gray-200">
        <div className="w-64 flex-shrink-0 border-r border-gray-200 bg-white flex items-center px-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder={t('pms.workPlanning.searchPlaceholder')}
              value={treeSearch}
              onChange={e => setTreeSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <div className="flex-1 flex items-center gap-1 px-4 bg-white">
          {([
            { key: 'table' as ViewTab, label: t('pms.workPlanning.tabs.table'), icon: Table2 },
            { key: 'calendar' as ViewTab, label: t('pms.workPlanning.tabs.calendar'), icon: Calendar },
            { key: 'gantt' as ViewTab, label: t('pms.workPlanning.tabs.gantt'), icon: BarChart3 },
            ...(SHOW_KANBAN_TAB ? [{ key: 'kanban' as ViewTab, label: t('pms.workPlanning.tabs.kanban'), icon: LayoutGrid }] : []),
            { key: 'counter' as ViewTab, label: t('pms.workPlanning.tabs.counter'), icon: Gauge },
            { key: 'config' as ViewTab, label: t('pms.workPlanning.tabs.config'), icon: Settings },
          ]).filter(tab => canPerform((tab.key === 'config' ? 'pms.config' : tab.key === 'counter' ? 'pms.counter' : 'pms.work') + '.view')).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative group flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
              {/* Tooltip for Counter & Config */}
              {tab.key === 'counter' && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 hidden group-hover:block w-64 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg shadow-lg leading-relaxed pointer-events-none">
                  {t('pms.workPlanning.counter.tooltip')}
                </div>
              )}
              {tab.key === 'config' && (
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 hidden group-hover:block w-64 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg shadow-lg leading-relaxed pointer-events-none">
                  {t('pms.workPlanning.config.tooltip')}
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* === BODY: LEFT PANEL + CONTENT === */}
      <div className="flex flex-1 overflow-hidden">
        {/* === LEFT PANEL: Equipment Tree + Filters === */}
        <div className="w-64 flex-shrink-0 border-r border-gray-200 flex flex-col bg-white">
          {/* Tree nodes - scrollable */}
          <div className="flex-1 overflow-y-auto text-xs">
            {tree.filter(node => matchesEquipmentTreeSearch(node, treeSearch)).map(node => (
              <TreeNode
                key={node.id}
                node={node}
                expanded={expandedNodes}
                selected={activeTab === 'config' ? cfgTreeSelectedIds : selectedAssetIds}
                onToggle={toggleExpand}
                onSelect={activeTab === 'config' ? toggleCfgAssetSelection : toggleAssetSelection}
                search={treeSearch}
                level={0}
              />
            ))}
          </div>
        </div>

        {/* === MAIN CONTENT === */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* ============ TAB: BẢNG ============ */}
          {activeTab === 'table' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <DataTable
                flush
                showCount={false}
                columns={taskColumns}
                data={filteredTasks}
                rowKey={task => task.id}
                itemLabel="công việc"
                emptyMessage={t('pms.workPlanning.table.noTasks')}
                searchPlaceholder="Tìm tên công việc, mã, thiết bị, mô tả..."
                exportOptions={{ fileName: 'danh-sach-cong-viec', title: 'DANH SÁCH CÔNG VIỆC BẢO DƯỠNG' }}
                selection={{ selected: selectedTaskIds, onChange: next => setSelectedTaskIds(new Set([...next].map(String))) }}
                minWidth={1600}
                toolbarActions={scheduleCodeFilter ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                    Lịch: {scheduleCodeFilter}
                    <button type="button" onClick={() => setScheduleCodeFilter('')} title="Bỏ lọc theo lịch" aria-label="Bỏ lọc theo lịch" className="rounded-full p-0.5 hover:bg-blue-200"><XIcon className="h-3 w-3" /></button>
                  </span>
                ) : undefined}
              />
            </div>
          )}

          {/* ============ TAB: LỊCH ============ */}
          {activeTab === 'calendar' && (
            <div className="p-4">
              {/* Calendar header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <button onClick={() => setCalendarDate(d => addMonths(d, -1))} className="p-2 hover:bg-gray-100 rounded-lg">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <h2 className="text-lg font-semibold text-gray-900">
                    {format(calendarDate, 'MMMM yyyy', { locale: vi })}
                  </h2>
                  <button onClick={() => setCalendarDate(d => addMonths(d, 1))} className="p-2 hover:bg-gray-100 rounded-lg">
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
                <button onClick={() => setCalendarDate(new Date())} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                  {t('pms.workPlanning.calendar.today')}
                </button>
              </div>

              {/* Calendar grid */}
              <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                {/* Day headers */}
                <div className="grid grid-cols-7 bg-blue-600 text-white text-sm font-medium">
                  {t('pms.workPlanning.calendar.weekDays').split(',').map(d => (
                    <div key={d} className="px-2 py-2 text-center">{d}</div>
                  ))}
                </div>

                {/* Calendar cells */}
                <div className="grid grid-cols-7">
                  {/* Padding for first day */}
                  {Array.from({ length: getDay(calendarDays[0]) }).map((_, i) => (
                    <div key={`pad-${i}`} className="min-h-[100px] border-b border-r border-gray-100 bg-gray-50/50" />
                  ))}
                  
                  {calendarDays.map(day => {
                    const dateKey = format(day, 'yyyy-MM-dd');
                    const dayTasks = tasksByDate.get(dateKey) || [];
                    const isToday = isSameDay(day, new Date());

                    return (
                      <div key={dateKey} className={`min-h-[100px] border-b border-r border-gray-100 p-1 ${isToday ? 'bg-blue-50' : 'bg-white'}`}>
                        <div className={`text-xs font-medium mb-1 ${isToday ? 'text-blue-600 font-bold' : 'text-gray-600'}`}>
                          {format(day, 'd')}
                        </div>
                        <div className="space-y-0.5">
                          {dayTasks.slice(0, 3).map(task => {
                            // Use status-based color for UPCOMING/OVERDUE, priority-based for others
                            const statusOverride: Record<string, { bg: string; text: string }> = {
                              UPCOMING: { bg: '#FEF3C7', text: '#92400E' },
                              OVERDUE: { bg: '#FEE2E2', text: '#991B1B' },
                            };
                            const isRunningHours = !!task.intervalHours && !task.intervalDays;
                            const override = statusOverride[task.status];
                            const colors = override || PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.NORMAL;
                            return (
                              <button
                                key={task.id}
                                onClick={() => navigate(`/pms/work-report/${task.id}`)}
                                className="w-full text-left px-1.5 py-0.5 rounded text-xs truncate hover:opacity-80 transition-opacity"
                                style={{ backgroundColor: colors.bg, color: colors.text }}
                                title={`${task.taskId} - ${task.taskDescription}${task.status === 'UPCOMING' ? ` ⚠️ ${t('pms.workPlanning.calendar.upcomingTooltip')}` : ''}${isRunningHours ? t('pms.workPlanning.calendar.rhTooltip') : ''}`}
                              >
                                {task.status === 'UPCOMING' ? '⚠️ ' : ''}{isRunningHours ? 'RH ' : ''}{task.taskId}
                              </button>
                            );
                          })}
                          {dayTasks.length > 3 && (
                            <div className="text-xs text-gray-400 text-center">{t('pms.workPlanning.calendar.moreItems', { count: dayTasks.length - 3 })}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-6 mt-3">
                {Object.entries(PRIORITY_COLORS).filter(([k]) => k !== 'NORMAL').map(([key, val]) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded" style={{ backgroundColor: val.bar }}></div>
                    <span className="text-xs text-gray-600">{getPriorityLabel(key)}</span>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-xs text-gray-500">
                {t('pms.workPlanning.calendar.rhNote')}
              </div>
            </div>
          )}

          {/* ============ TAB: GANTT ============ */}
          {activeTab === 'gantt' && (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Gantt toolbar */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 border-t border-b border-gray-200">
                <button
                  onClick={() => {
                    const wrapper = document.getElementById('gantt-right-wrapper');
                    if (!wrapper || ganttDays.length === 0) return;
                    const first = new Date(ganttDays[0]); first.setHours(0,0,0,0);
                    const td = new Date(); td.setHours(0,0,0,0);
                    const offset = Math.floor((td.getTime() - first.getTime()) / 86400000);
                    const scrollX = Math.max(0, offset * 40 - wrapper.clientWidth / 2);
                    wrapper.scrollTo({ left: scrollX, behavior: 'smooth' });
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  {t('pms.workPlanning.gantt.today')}
                </button>
              </div>
              {/* Gantt chart — fixed height, split scroll */}
              <div className="flex-1 flex overflow-hidden">
                {/* LEFT: Fixed table */}
                <div className="flex-shrink-0 flex flex-col border-r border-gray-300" style={{ width: `${ganttLeftWidth}px` }}>
                  {/* Left header */}
                  <div className="flex-shrink-0 flex bg-gray-50 border-b border-gray-300" style={{ height: '40px' }}>
                    <div className="w-[200px] px-3 flex items-center text-xs font-semibold text-gray-700 border-r border-gray-200">{t('pms.workPlanning.gantt.taskName')}</div>
                    <div className="w-[90px] px-2 flex items-center justify-center text-xs font-semibold text-gray-700 border-r border-gray-200">{t('pms.workPlanning.gantt.startDate')}</div>
                    <div className="w-[60px] px-2 flex items-center justify-center text-xs font-semibold text-gray-700 border-r border-gray-200">{t('pms.workPlanning.gantt.duration')}</div>
                    <div className="w-[160px] px-2 flex items-center text-xs font-semibold text-gray-700 border-r border-gray-200">{t('pms.workPlanning.gantt.equipment')}</div>
                    <div className="w-[80px] px-2 flex items-center justify-center text-xs font-semibold text-gray-700 border-r border-gray-200">{t('pms.workPlanning.gantt.taskType')}</div>
                    <div className="w-[90px] px-2 flex items-center justify-center text-xs font-semibold text-gray-700">{t('pms.workPlanning.gantt.assignee')}</div>
                  </div>
                  {/* Left body — scroll Y synced */}
                  <div className="flex-1 overflow-y-auto overflow-x-hidden" id="gantt-left-body" onScroll={(e) => {
                    const rightBody = document.getElementById('gantt-right-body');
                    if (rightBody) rightBody.scrollTop = e.currentTarget.scrollTop;
                  }}>
                    {ganttTasksFromFiltered.length === 0 ? (
                      <div className="text-center py-12 text-gray-400 text-sm">{t('pms.workPlanning.gantt.noTasks')}</div>
                    ) : (
                      ganttTasksFromFiltered.map((task, idx) => {
                        const srcTask = filteredTasks.find(t => t.id === task.id);
                        const taskName = srcTask?.taskDescription?.split('\n')[0] || task.name;
                        const startDateStr = format(task.dueDate, 'yyyy-MM-dd');
                        const durationStr = t('pms.workPlanning.gantt.daysUnit', { count: task.workDurationDays });
                        const equipName = task.groupName;
                        const isAdhoc = srcTask?.taskType === 'AD_HOC' || srcTask?.taskType === 'CORRECTIVE';
                        const taskTypeLabel = maintenanceCategoryLabel(srcTask?.taskType, t);
                        const assignee = srcTask?.assignedTo || '';
                        return (
                          <div key={task.id} className={`flex border-b border-gray-100 hover:bg-blue-50/40 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`} style={{ height: '36px' }}>
                            <div className="w-[200px] px-3 flex items-center text-xs text-gray-900 truncate border-r border-gray-100 gap-1.5">
                              <FileText className="w-3 h-3 text-gray-400 flex-shrink-0" />
                              <span className="truncate">{taskName}</span>
                            </div>
                            <div className="w-[90px] px-2 flex items-center justify-center text-xs text-gray-600 border-r border-gray-100">{startDateStr}</div>
                            <div className="w-[60px] px-2 flex items-center justify-center text-xs text-gray-600 border-r border-gray-100">{durationStr}</div>
                            <div className="w-[160px] px-2 flex items-center text-xs text-gray-700 truncate border-r border-gray-100">{equipName}</div>
                            <div className="w-[80px] px-2 flex items-center justify-center border-r border-gray-100">
                              <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${isAdhoc ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>{taskTypeLabel}</span>
                            </div>
                            <div className="w-[90px] px-2 flex items-center justify-center text-xs text-gray-600 truncate">{assignee}</div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Draggable divider */}
                <div
                  className="w-1 flex-shrink-0 bg-gray-300 hover:bg-blue-400 cursor-col-resize transition-colors relative z-20"
                  title={t('pms.workPlanning.gantt.dragToResize')}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    ganttDragging.current = true;
                    ganttStartX.current = e.clientX;
                    ganttStartW.current = ganttLeftWidth;
                    const onMouseMove = (ev: MouseEvent) => {
                      if (!ganttDragging.current) return;
                      const delta = ev.clientX - ganttStartX.current;
                      const newW = Math.max(300, Math.min(1200, ganttStartW.current + delta));
                      setGanttLeftWidth(newW);
                    };
                    const onMouseUp = () => {
                      ganttDragging.current = false;
                      document.removeEventListener('mousemove', onMouseMove);
                      document.removeEventListener('mouseup', onMouseUp);
                      document.body.style.cursor = '';
                      document.body.style.userSelect = '';
                    };
                    document.addEventListener('mousemove', onMouseMove);
                    document.addEventListener('mouseup', onMouseUp);
                    document.body.style.cursor = 'col-resize';
                    document.body.style.userSelect = 'none';
                  }}
                />

                {/* RIGHT: Scrollable timeline */}
                <div className="flex-1 flex flex-col overflow-hidden">
                  {/* Right header + body share horizontal scroll */}
                  <div className="flex-1 overflow-x-auto overflow-y-hidden" id="gantt-right-wrapper">
                    <div style={{ width: `${ganttDays.length * 40}px`, minWidth: '100%' }}>
                      {/* Timeline header */}
                      <div className="flex bg-gray-50 border-b border-gray-300 sticky top-0 z-10" style={{ height: '40px' }}>
                        {ganttDays.map((day, i) => {
                          const isToday = isSameDay(day, new Date());
                          const dow = day.getDay(); // 0=Sun
                          const isWeekend = dow === 0 || dow === 6;
                          const ganttWeekDays = t('pms.workPlanning.gantt.weekDays').split(',');
                          const shortDay = ganttWeekDays[dow];
                          return (
                            <div key={i} className={`flex flex-col items-center justify-center border-r border-gray-200 ${isToday ? 'bg-blue-50' : isWeekend ? 'bg-gray-100/50' : ''}`} style={{ width: '40px', flexShrink: 0 }}>
                              <div className="text-xs font-semibold text-gray-700 leading-none">{format(day, 'dd')}</div>
                              <div className={`text-xs leading-none mt-0.5 ${isWeekend ? 'text-red-400' : 'text-gray-400'}`}>{shortDay}</div>
                            </div>
                          );
                        })}
                      </div>
                      {/* Timeline body — scroll Y synced */}
                      <div className="overflow-y-auto" id="gantt-right-body" style={{ height: 'calc(100% - 40px)' }} onScroll={(e) => {
                        const leftBody = document.getElementById('gantt-left-body');
                        if (leftBody) leftBody.scrollTop = e.currentTarget.scrollTop;
                      }}>
                        {ganttTasksFromFiltered.length === 0 ? (
                          <div style={{ height: '200px' }} />
                        ) : (
                          ganttTasksFromFiltered.map((task, idx) => {
                            const dayWidth = 40;
                            const firstDay = ganttDays[0]; firstDay.setHours(0,0,0,0);
                            const taskDue = new Date(task.dueDate); taskDue.setHours(0,0,0,0);
                            const taskStart = new Date(task.startDate); taskStart.setHours(0,0,0,0);

                            const dueOffset = Math.floor((taskDue.getTime() - firstDay.getTime()) / 86400000);
                            const barLeft = dueOffset * dayWidth;
                            const barWidth = Math.max(task.workDurationDays * dayWidth, dayWidth);
                            const checklistLabel = task.checklistTotal > 0 ? `${task.checklistCompleted}/${task.checklistTotal}` : '';

                            return (
                              <div key={task.id} className={`relative border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`} style={{ height: '36px' }}>
                                {/* Today line */}
                                {(() => {
                                  const td = new Date(); td.setHours(0,0,0,0);
                                  const todayOffset = Math.floor((td.getTime() - firstDay.getTime()) / 86400000);
                                  if (todayOffset >= 0 && todayOffset < ganttDays.length) {
                                    return <div className="absolute top-0 bottom-0 w-0.5 bg-red-400 z-10" style={{ left: `${todayOffset * dayWidth + dayWidth / 2}px` }} />;
                                  }
                                  return null;
                                })()}
                                {/* Bar */}
                                {barLeft >= 0 && (
                                  <div className="absolute top-1/2 -translate-y-1/2 rounded-sm flex items-center justify-center text-xs font-bold text-white leading-none shadow-sm" style={{
                                    left: `${barLeft}px`,
                                    width: `${barWidth}px`,
                                    height: '20px',
                                    backgroundColor: '#5BC0DE',
                                  }}>
                                    {checklistLabel}
                                  </div>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ============ TAB: KANBAN ============ */}
          {SHOW_KANBAN_TAB && activeTab === 'kanban' && (
            <div className="p-4">
              <KanbanBoard
                tasks={filteredTasks}
              />
            </div>
          )}

          {/* ============ TAB: COUNTER ============ */}
          {activeTab === 'counter' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-auto">
                <table className="min-w-full text-sm border-collapse">
                  <thead className="sticky top-0 z-10">
                    {/* Row 1: headers */}
                    <tr className="bg-blue-50">
                      <th className="w-10 px-2 py-2 text-center text-xs font-semibold text-gray-600 border-b border-r border-gray-200">{t('pms.workPlanning.table.index')}</th>
                      <th className="min-w-[130px] px-3 py-2 text-left border-b border-r border-gray-200 cursor-pointer" onClick={() => handleCounterSort('assetCode')}>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-semibold text-gray-600">{t('pms.workPlanning.counter.assetCode')}</span>
                          <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        </div>
                      </th>
                      <th className="min-w-[200px] px-3 py-2 text-left border-b border-r border-gray-200 cursor-pointer" onClick={() => handleCounterSort('assetName')}>
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-semibold text-gray-600">{t('pms.workPlanning.counter.assetName')}</span>
                          <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        </div>
                      </th>
                      <th className="w-36 px-3 py-2 text-center border-b border-r border-gray-200 cursor-pointer" onClick={() => handleCounterSort('currentRunningHours')}>
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-xs font-semibold text-gray-600">{t('pms.workPlanning.counter.currentHours')}</span>
                          <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        </div>
                      </th>
                      <th className="w-36 px-3 py-2 text-center text-xs font-semibold text-gray-600 border-b border-r border-gray-200">{t('pms.workPlanning.counter.newHours')}</th>
                      <th className="w-44 px-3 py-2 text-center border-b border-r border-gray-200 cursor-pointer" onClick={() => handleCounterSort('lastRunningHoursUpdate')}>
                        <div className="flex items-center justify-center gap-1">
                          <span className="text-xs font-semibold text-gray-600">{t('pms.workPlanning.counter.lastUpdate')}</span>
                          <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        </div>
                      </th>
                      <th className="w-20 px-3 py-2 border-b border-gray-200">
                        <span className="text-xs font-semibold text-gray-600"></span>
                      </th>
                    </tr>
                    {/* Row 2: column filters */}
                    <tr className="bg-white border-b border-gray-200">
                      <th className="border-r border-gray-200"></th>
                      <th className="px-2 py-1 border-r border-gray-200">
                        <div className="flex items-center gap-0.5 border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                          <span className="text-gray-400 text-xs select-none">→</span>
                          <input type="text" value={counterFilterCode} onChange={e => setCounterFilterCode(e.target.value)} placeholder={t('pms.workPlanning.table.searchPlaceholder')} className="flex-1 text-xs outline-none min-w-0 bg-transparent" />
                          <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        </div>
                      </th>
                      <th className="px-2 py-1 border-r border-gray-200">
                        <div className="flex items-center gap-0.5 border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                          <span className="text-gray-400 text-xs select-none">→</span>
                          <input type="text" value={counterFilterName} onChange={e => setCounterFilterName(e.target.value)} placeholder={t('pms.workPlanning.table.searchPlaceholder')} className="flex-1 text-xs outline-none min-w-0 bg-transparent" />
                          <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        </div>
                      </th>
                      <th className="border-r border-gray-200"></th>
                      <th className="border-r border-gray-200"></th>
                      <th className="border-r border-gray-200"></th>
                      <th className="border-gray-200"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredCounterAssets.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">{t('pms.workPlanning.counter.noAssets')}</td></tr>
                    ) : (
                      pagedCounterAssets.map((asset, idx) => (
                        <tr key={asset.id} className={`hover:bg-blue-50 ${idx % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'}`}>
                          <td className="px-2 py-2 text-center text-xs text-gray-500 border-r border-gray-100">{counterOffset + idx + 1}</td>
                          <td className="px-3 py-2 text-xs font-medium text-gray-900 border-r border-gray-100">{asset.assetCode}</td>
                          <td className="px-3 py-2 text-xs text-gray-700 border-r border-gray-100">
                            <span className="truncate block max-w-[200px]" title={asset.assetName}>{asset.assetName}</span>
                          </td>
                          <td className="px-3 py-2 text-center text-xs font-semibold text-gray-900 border-r border-gray-100">
                            {asset.currentRunningHours?.toLocaleString() || '0'} <span className="text-gray-400 font-normal">{t('pms.workPlanning.counter.hoursAbbrev')}</span>
                          </td>
                          <td className="px-3 py-2 text-center border-r border-gray-100">
                            <input
                              type="number"
                              min={asset.currentRunningHours ?? 0}
                              disabled={!canPerform('pms.counter.update')} value={counterEditing[asset.id] ?? ''}
                              onChange={e => setCounterEditing(prev => {
                                const next = { ...prev };
                                if (e.target.value === '') {
                                  delete next[asset.id];
                                } else {
                                  next[asset.id] = Number(e.target.value);
                                }
                                return next;
                              })}
                              placeholder={String(asset.currentRunningHours || 0)}
                              className="w-full px-2 py-1 text-xs text-center border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-center text-xs text-gray-500 border-r border-gray-100">
                            {asset.lastRunningHoursUpdate ? format(new Date(asset.lastRunningHoursUpdate), 'dd/MM/yyyy HH:mm') : '—'}
                          </td>
                          <td className="px-2 py-2">
                            <div className="flex items-center justify-center">
                              <PermissionGate permission={'pms.counter.update'}><button
                                onClick={() => handleCounterSave(asset.id)}
                                disabled={!canPerform('pms.counter.update') || counterEditing[asset.id] === undefined || counterSaving.has(asset.id)}
                                className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                                title={t('pms.workPlanning.counter.saveHours')}
                              >
                                {counterSaving.has(asset.id) ? (
                                  <div className="w-3.5 h-3.5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <Save className="w-3.5 h-3.5" />
                                )}
                              </button></PermissionGate>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Counter pagination area */}
              <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 bg-white flex-shrink-0 text-xs text-gray-600">
                <select aria-label="Số thiết bị mỗi trang" value={counterPageSize} onChange={e => setCounterPageSize(Number(e.target.value))} className="rounded border border-gray-300 bg-white px-2 py-1">
                  {[25, 50, 100].map(size => <option key={size} value={size}>{size} / trang</option>)}
                </select>
                <div className="flex items-center gap-2">
                  <button type="button" aria-label="Trang trước" disabled={effectiveCounterPage === 1} onClick={() => setCounterPage(effectiveCounterPage - 1)} className="rounded border border-gray-200 p-1 hover:bg-gray-50 disabled:opacity-40"><ChevronLeft size={14} /></button>
                  <span>Trang {effectiveCounterPage} / {counterTotalPages}</span>
                  <button type="button" aria-label="Trang sau" disabled={effectiveCounterPage === counterTotalPages} onClick={() => setCounterPage(effectiveCounterPage + 1)} className="rounded border border-gray-200 p-1 hover:bg-gray-50 disabled:opacity-40"><ChevronRight size={14} /></button>
                </div>
                <span>{filteredCounterAssets.length > 0 ? `${counterOffset + 1}–${Math.min(counterOffset + counterPageSize, filteredCounterAssets.length)} / ` : ''}{t('pms.workPlanning.counter.totalAssets', { count: filteredCounterAssets.length })}</span>
              </div>
            </div>
          )}

          {/* ============ TAB: CẤU HÌNH ============ */}
          {activeTab === 'config' && (
            <div className="flex-1 flex flex-col overflow-hidden bg-white">
              {/* Header bar */}
              <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2.5">
                <h3 className="text-sm font-semibold text-gray-700">
                  {cfgEditingId ? t('pms.workPlanning.config.editTitle', { code: cfgForm.scheduleCode }) : t('pms.workPlanning.config.addNew')}
                </h3>
                <div className="flex items-center gap-2">
                  {cfgEditingId && (
                    <>
                      <button onClick={() => { const sch = schedules.find(s => s.id === cfgEditingId); if (sch) viewScheduleTasks(sch.scheduleCode); }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50">
                        <ExternalLink className="w-3.5 h-3.5" /> {t('pms.workPlanning.config.viewTasks')}
                      </button>
                      <PermissionGate permission="pms.config.delete"><button onClick={() => { if (cfgEditingId) { handleScheduleDelete(schedules.find(s => s.id === cfgEditingId)!); } }} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-red-300 rounded text-red-600 hover:bg-red-50">
                        <Trash2 className="w-3.5 h-3.5" /> {t('pms.workPlanning.config.deleteConfig')}
                      </button></PermissionGate>
                    </>
                  )}
                  <button type="button" onClick={cfgReset} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50">
                    <XIcon className="w-3.5 h-3.5" /> {cfgEditingId ? t('pms.workPlanning.config.cancel') : t('pms.workPlanning.config.reset')}
                  </button>
                  <PermissionGate permission="pms.config.import"><button type="button" disabled={!canPerform('pms.config.import')} onClick={() => setShowImportMaintenance(true)} className="px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50">Import Excel</button></PermissionGate>
                  <div className="relative">
                    <button type="button" onClick={() => setCfgShowHistory(!cfgShowHistory)} className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded ${cfgShowHistory ? 'border-blue-400 text-blue-700 bg-blue-50' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`}>
                      <History className="w-3.5 h-3.5" /> {t('pms.workPlanning.config.configHistory')}
                    </button>
                    {cfgShowHistory && createPortal(
                      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setCfgShowHistory(false)}>
                      <section ref={cfgHistoryDialog} role="dialog" aria-modal="true" aria-labelledby="config-list-title" className="w-full max-w-[1440px] max-h-[85vh] flex flex-col bg-white shadow-2xl rounded-xl overflow-hidden" onClick={event => event.stopPropagation()}>
                        <header className="flex items-center justify-between gap-4 px-6 py-4 border-b border-gray-200">
                          <h2 id="config-list-title" className="text-lg font-semibold text-gray-900">{t('pms.workPlanning.config.configList', { count: schedules.length })}</h2>
                          <button type="button" autoFocus aria-label="Đóng danh sách cấu hình" onClick={() => setCfgShowHistory(false)} className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><XIcon size={20} /></button>
                        </header>
                        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 bg-white border-b border-gray-200">
                          <div className="flex items-center gap-2 text-xs text-gray-600"><span>{cfgListItems.length} / {schedules.length} cấu hình</span>{cfgSelectedIds.size > 0 && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">Đã chọn: {cfgSelectedIds.size}</span>}</div>
                          <div className="flex items-center gap-2">
                          <PermissionGate permission="pms.config.delete"><button type="button" onClick={handleBulkScheduleDelete} disabled={cfgBulkDeleting || cfgSelectedIds.size === 0} className="flex items-center gap-1.5 rounded border border-gray-300 px-2.5 py-1.5 text-xs text-gray-600 hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={14} />{cfgBulkDeleting ? 'Đang xóa…' : 'Xóa nhiều'}</button></PermissionGate>
                          <div className="relative max-w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input type="text" aria-label="Tìm cấu hình" value={cfgListSearch} onChange={e => setCfgListSearch(e.target.value)} placeholder={t('pms.workPlanning.config.searchPlaceholder')} className="pl-9 pr-3 py-1.5 text-xs border border-gray-300 rounded w-64 max-w-full focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                          </div>
                          </div>
                        </div>
                        <div className="min-h-0 flex-1 overflow-auto">
                          {scheduleLoading ? (
                            <div className="flex items-center justify-center py-6"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div></div>
                          ) : (
                            <table className="w-full min-w-[1150px] table-fixed border-collapse text-xs [&_th]:px-2 [&_th]:py-2 [&_th]:font-medium [&_th]:border-r [&_th]:border-gray-200 [&_td]:px-2 [&_td]:py-1.5 [&_td]:border-r [&_td]:border-gray-100">
                              <colgroup><col className="w-9" /><col className="w-8" /><col className="w-28" /><col className="w-72" /><col className="w-60" /><col className="w-32" /><col className="w-28" /><col className="w-24" /><col className="w-28" /></colgroup>
                              <thead className="bg-blue-50 sticky top-0 z-10 text-xs text-gray-700 border-b border-gray-200">
                                <tr>
                                  <th className="text-center">TT</th>
                                  <th className="text-center"><input type="checkbox" aria-label="Chọn tất cả cấu hình đang hiển thị" checked={cfgAllVisibleSelected} disabled={cfgBulkDeleting || !cfgListItems.length} ref={element => { if (element) element.indeterminate = cfgSomeVisibleSelected && !cfgAllVisibleSelected; }} onChange={() => setCfgSelectedIds(previous => { const next = new Set(previous); cfgListItems.forEach(schedule => { if (cfgAllVisibleSelected) next.delete(schedule.id); else next.add(schedule.id); }); return next; })} className="h-3.5 w-3.5 rounded border-gray-300" /></th>
                                  <th className="px-2 py-1.5 text-left w-28">{t('pms.workPlanning.config.code')}</th>
                                  <th className="text-left min-w-48">Thiết bị</th>
                                  <th className="px-2 py-1.5 text-left">{t('pms.workPlanning.config.name')}</th>
                                  <th className="whitespace-nowrap text-center">{t('pms.workPlanning.config.type')}</th>
                                  <th className="whitespace-nowrap text-center">{t('pms.workPlanning.config.priorityCol')}</th>
                                  <th className="px-2 py-1.5 text-center w-24">Chu kỳ</th>
                                  <th className="sticky right-0 bg-blue-50 whitespace-nowrap text-center">Hành động</th>
                                </tr>
                                <tr className="bg-white border-t border-gray-200 [&_th]:py-1">
                                  <th /><th />
                                  {(['code', 'device', 'name'] as const).map((field, index) => <th key={field}><input aria-label={['Lọc mã cấu hình', 'Lọc thiết bị', 'Lọc tên công việc'][index]} placeholder="Tìm kiếm" value={cfgListFilters[field]} onChange={event => setCfgListFilters(previous => ({ ...previous, [field]: event.target.value }))} className="w-full rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs font-normal focus:border-blue-500 focus:outline-none" /></th>)}
                                  <th><select aria-label="Lọc loại bảo trì" value={cfgListFilters.type} onChange={event => setCfgListFilters(previous => ({ ...previous, type: event.target.value }))} className="w-full rounded border border-gray-200 bg-white px-1 py-0.5 text-xs font-normal"><option value="">Tất cả</option>{[...new Set(schedules.map(schedule => schedule.maintenanceCategory))].sort().map(category => <option key={category} value={category}>{maintenanceCategoryLabel(category, t)}</option>)}</select></th>
                                  <th><select aria-label="Lọc độ ưu tiên" value={cfgListFilters.priority} onChange={event => setCfgListFilters(previous => ({ ...previous, priority: event.target.value }))} className="w-full rounded border border-gray-200 bg-white px-1 py-0.5 text-xs font-normal"><option value="">Tất cả</option>{[...new Set(schedules.map(schedule => schedule.priority))].sort().map(priority => <option key={priority} value={priority}>{getPriorityLabel(priority)}</option>)}</select></th>
                                  <th><input aria-label="Lọc chu kỳ" placeholder="Tìm kiếm" value={cfgListFilters.cycle} onChange={event => setCfgListFilters(previous => ({ ...previous, cycle: event.target.value }))} className="w-full rounded border border-gray-200 bg-white px-1.5 py-0.5 text-xs font-normal focus:border-blue-500 focus:outline-none" /></th>
                                  <th className="sticky right-0 bg-white" />
                                </tr>
                              </thead>
                              <tbody>
                                {cfgListItems.length === 0 && <tr><td colSpan={9} className="h-24 text-center text-gray-400">{schedules.length === 0 ? t('pms.workPlanning.config.noConfig') : t('pms.workPlanning.config.notFound')}</td></tr>}
                                {cfgListItems.map((sch, index) => (
                                  <tr key={sch.id} className={`group border-b border-gray-100 hover:bg-blue-50 ${cfgSelectedIds.has(sch.id) || cfgEditingId === sch.id ? 'bg-blue-50' : 'bg-white'}`}>
                                    <td className="text-center text-gray-500">{index + 1}</td>
                                    <td className="text-center"><input type="checkbox" aria-label={`Chọn cấu hình ${sch.workCode || sch.scheduleCode}`} checked={cfgSelectedIds.has(sch.id)} disabled={cfgBulkDeleting || !canPerform('pms.config.delete')} onChange={() => cfgToggleSelected(sch.id)} className="h-3.5 w-3.5 rounded border-gray-300" /></td>
                                    <td title={sch.scheduleCode}><button type="button" disabled={cfgBulkDeleting} onClick={() => { cfgLoadForEdit(sch); setCfgShowHistory(false); }} className="font-medium text-blue-600 hover:underline disabled:opacity-40">{sch.workCode || sch.scheduleCode}</button></td>
                                    <td className="text-gray-700 truncate" title={sch.assetName}>{sch.assetName || '—'}</td>
                                    <td className="text-gray-700 truncate" title={sch.scheduleName}>{sch.scheduleName}</td>
                                    <td className="px-2 py-1.5 text-center">
                                      <span className={`inline-flex whitespace-nowrap px-2 py-1 text-xs font-medium rounded ${sch.maintenanceCategory === 'AD_HOC' ? 'bg-orange-50 text-orange-700' : 'bg-green-50 text-green-700'}`}>{maintenanceCategoryLabel(sch.maintenanceCategory, t)}</span>
                                    </td>
                                    <td className="px-2 py-1.5 text-center">
                                      <span className={`inline-flex whitespace-nowrap px-2 py-1 text-xs font-medium rounded ${sch.priority === 'CRITICAL' ? 'bg-red-50 text-red-700' : sch.priority === 'HIGH' ? 'bg-orange-50 text-orange-700' : sch.priority === 'MEDIUM' ? 'bg-yellow-50 text-yellow-700' : 'bg-blue-50 text-blue-700'}`}>{getPriorityLabel(sch.priority)}</span>
                                    </td>
                                    <td className="whitespace-nowrap px-2 py-1.5 text-center text-gray-500">{sch.intervalMonths ? `${sch.intervalMonths} tháng` : sch.intervalYears ? `${sch.intervalYears} năm` : sch.intervalHours ? `${sch.intervalHours} giờ` : sch.intervalDays ? `${sch.intervalDays} ngày` : '—'}</td>
                                    <td className={`sticky right-0 text-center group-hover:bg-blue-50 ${cfgSelectedIds.has(sch.id) || cfgEditingId === sch.id ? 'bg-blue-50' : 'bg-white'}`}><div className="flex items-center justify-center gap-1">
                                      <PermissionGate permission="pms.config.update"><button type="button" disabled={cfgBulkDeleting} title="Chỉnh sửa cấu hình" onClick={e => { e.stopPropagation(); cfgLoadForEdit(sch); setCfgShowHistory(false); }} className="rounded p-1 text-gray-400 hover:bg-blue-100 hover:text-blue-600 disabled:opacity-40"><Pencil size={14} /></button></PermissionGate>
                                      <PermissionGate permission="pms.config.create"><button type="button" disabled={cfgBulkDeleting} title={t('pms.workPlanning.config.copyAsTemplate')} onClick={e => { e.stopPropagation(); cfgCopyAsTemplate(sch); setCfgShowHistory(false); }} className="rounded p-1 text-gray-400 hover:bg-blue-100 hover:text-blue-600 disabled:opacity-40"><Copy size={14} /></button></PermissionGate>
                                      <PermissionGate permission="pms.config.delete"><button type="button" disabled={cfgBulkDeleting} title={t('pms.workPlanning.config.deleteConfig')} onClick={e => { e.stopPropagation(); handleScheduleDelete(sch); }} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"><Trash2 size={14} /></button></PermissionGate>
                                    </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                        <footer className="flex justify-end px-6 py-3 border-t border-gray-200 bg-gray-50"><button type="button" onClick={() => setCfgShowHistory(false)} className="rounded border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">Đóng</button></footer>
                      </section>
                      </div>, document.body
                    )}
                  </div>
                  <PermissionGate permission={cfgEditingId ? 'pms.config.update' : 'pms.config.create'}><button type="button" onClick={cfgSubmit} disabled={cfgSaving || !canPerform(cfgEditingId ? 'pms.config.update' : 'pms.config.create')} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                    {cfgSaving ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {cfgEditingId ? t('pms.workPlanning.config.update') : t('pms.workPlanning.config.saveConfig')}
                  </button></PermissionGate>
                </div>
              </div>

              <div className="flex-1 overflow-auto">
                {/* ═══ 2-COLUMN LAYOUT: LEFT (Thông tin + Thời gian) | RIGHT (Nhân lực + Vật tư + Hạng mục) ═══ */}
                <div className="grid grid-cols-2" style={{ minHeight: '100%' }}>

                  {/* ════════ LEFT COLUMN ════════ */}
                  <div className="border-r border-gray-200 flex flex-col">
                    {/* ── Thông tin chung ── */}
                    <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                      <span className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Settings size={14} /> {t('pms.workPlanning.config.generalInfo')}</span>
                    </div>
                    <div className="px-3 py-3 space-y-2.5 text-sm border-b border-gray-200">
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">{t('pms.workPlanning.config.configCode')} <span className="text-red-500">*</span></label>
                          <input type="text" value={cfgForm.scheduleCode} onChange={e => setCfgForm(f => ({ ...f, scheduleCode: e.target.value }))} placeholder="SCH-ME-001" className="w-full border border-gray-300 px-2.5 py-1.5 text-sm" />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">{t('pms.workPlanning.config.priority')}</label>
                          <select value={cfgForm.priority} onChange={e => setCfgForm(f => ({ ...f, priority: e.target.value }))} className="w-full border border-gray-300 px-2.5 py-1.5 bg-white text-sm">
                            <option value="CRITICAL">{t('pms.workPlanning.config.priorityCritical')}</option>
                            <option value="HIGH">{t('pms.workPlanning.config.priorityHigh')}</option>
                            <option value="MEDIUM">{t('pms.workPlanning.config.priorityMedium')}</option>
                            <option value="LOW">{t('pms.workPlanning.config.priorityLow')}</option>
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('pms.workPlanning.config.maintenanceType')}</label>
                        <div className="flex flex-wrap gap-x-4 gap-y-2">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="maintenanceCategory" value="PERIODIC" checked={cfgForm.maintenanceCategory === 'PERIODIC'} onChange={() => setCfgForm(f => ({ ...f, maintenanceCategory: 'PERIODIC' }))} className="w-3.5 h-3.5 text-blue-600" />
                            <span className="text-xs text-gray-700">{t('pms.workPlanning.config.periodicLabel')} <span className="text-xs text-gray-400">({t('pms.workPlanning.config.periodicDesc')})</span></span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="maintenanceCategory" value="AD_HOC" checked={cfgForm.maintenanceCategory === 'AD_HOC'} onChange={() => setCfgForm(f => ({ ...f, maintenanceCategory: 'AD_HOC' }))} className="w-3.5 h-3.5 text-orange-600" />
                            <span className="text-xs text-gray-700">{t('pms.workPlanning.config.adhocLabel')} <span className="text-xs text-gray-400">({t('pms.workPlanning.config.adhocDesc')})</span></span>
                          </label>
                          {(['DRY_DOCK', 'ON_DEMAND', 'VOYAGE'] as const).map(category => (
                            <label key={category} className="flex items-center gap-2 cursor-pointer">
                              <input type="radio" name="maintenanceCategory" value={category} checked={cfgForm.maintenanceCategory === category} onChange={() => setCfgForm(f => ({ ...f, maintenanceCategory: category }))} className="w-3.5 h-3.5 text-blue-600" />
                              <span className="text-xs text-gray-700">{maintenanceCategoryLabel(category, t)}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('pms.workPlanning.config.maintenanceName')} <span className="text-red-500">*</span></label>
                        <input type="text" value={cfgForm.scheduleName} onChange={e => setCfgForm(f => ({ ...f, scheduleName: e.target.value }))} placeholder={t('pms.workPlanning.config.namePlaceholder')} className="w-full border border-gray-300 px-2.5 py-1.5 text-sm" />
                      </div>
                      {/* Thiết bị */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('pms.workPlanning.config.equipment')} <span className="text-red-500">*</span> <span className="text-xs text-gray-400 font-normal">— {t('pms.workPlanning.config.selectFromTree')}</span></label>
                        {cfgSelectedEquipmentNames.length === 0 ? (
                          <div className="px-2.5 py-2 border border-dashed border-gray-300 rounded text-xs text-gray-400 text-center">
                            {t('pms.workPlanning.config.noEquipmentSelected')}
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {cfgSelectedEquipmentNames.slice(0, 8).map(eq => (
                              <span key={eq.id} className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                                {eq.code}
                                <button type="button" onClick={() => setCfgTreeSelectedIds(prev => { const n = new Set(prev); n.delete(eq.id); return n; })} className="text-blue-400 hover:text-red-500">
                                  <XIcon size={10} />
                                </button>
                              </span>
                            ))}
                            {cfgSelectedEquipmentNames.length > 8 && (
                              <span className="text-xs text-gray-500 self-center">+{cfgSelectedEquipmentNames.length - 8} {t('pms.workPlanning.config.more')}</span>
                            )}
                            {cfgSelectedEquipmentNames.length > 1 && (
                              <span className="text-xs bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded self-center">{t('pms.workPlanning.config.group', { count: cfgSelectedEquipmentNames.length })}</span>
                            )}
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('pms.workPlanning.config.technicalInstructions')}</label>
                        <textarea value={cfgForm.instructions || ''} onChange={e => setCfgForm(f => ({ ...f, instructions: e.target.value }))} placeholder={t('pms.workPlanning.config.instructionPlaceholder')} rows={2} className="w-full border border-gray-300 px-2.5 py-1.5 text-sm resize-none" />
                      </div>
                      <div className="flex items-center gap-6 pt-1">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={cfgIsCbm} onChange={e => setCfgIsCbm(e.target.checked)} className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300" />
                          <span className="text-xs text-gray-700">CBM <span className="text-xs text-gray-400">({t('pms.workPlanning.config.cbm')})</span></span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={cfgRequireRiskAssessment} onChange={e => setCfgRequireRiskAssessment(e.target.checked)} className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300" />
                          <span className="text-xs text-gray-700">{t('pms.workPlanning.config.requireRiskAssessment')}</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={cfgRequireInspectionReport} onChange={e => setCfgRequireInspectionReport(e.target.checked)} className="w-3.5 h-3.5 rounded text-blue-600 border-gray-300" />
                          <span className="text-xs text-gray-700">{t('pms.workPlanning.config.requireInspectionReport')}</span>
                        </label>
                      </div>
                    </div>

                    {/* ── Đánh giá rủi ro (ĐGRR) ── */}


                    {/* ── Cấu hình thời gian ── */}
                    {cfgForm.maintenanceCategory !== 'AD_HOC' && !isEventMaintenance(cfgForm.maintenanceCategory) && (<>
                    <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                      <span className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Clock size={14} /> {t('pms.workPlanning.config.timeConfig')}</span>
                    </div>
                    <div className="px-3 py-3 space-y-2.5 text-sm">
                      {/* Loại chu kỳ */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">{t('pms.workPlanning.config.intervalType')} <span className="text-red-500">*</span></label>
                        <select value={cfgForm.intervalType} onChange={e => {
                          const intervalType = e.target.value as CreateMaintenanceScheduleDto['intervalType'];
                          setCfgForm(f => ({
                            ...f,
                            intervalType,
                            ...(intervalType === 'CALENDAR'
                              ? { intervalHours: undefined, daysBeforeDue: 7 }
                              : { intervalDays: undefined, intervalMonths: undefined, intervalYears: undefined, daysBeforeDue: 70 })
                          }));
                        }} className="w-full border border-gray-300 px-2.5 py-1.5 text-sm bg-white">
                          <option value="RUNNING_HOURS">{t('pms.workPlanning.config.runningHours')}</option>
                          <option value="CALENDAR">{t('pms.workPlanning.config.calendarType')}</option>
                        </select>
                      </div>
                      {/* Dynamic: Running Hours hoặc Calendar Days */}
                      {cfgForm.intervalType === 'RUNNING_HOURS' ? (
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">{t('pms.workPlanning.config.runningHoursThreshold')} <span className="text-red-500">*</span></label>
                          <div className="flex items-center gap-1.5">
                            <input type="number" value={cfgForm.intervalHours ?? ''} onChange={e => setCfgForm(f => ({ ...f, intervalHours: parseInt(e.target.value) || undefined }))} min={1} placeholder="500" className="flex-1 border border-gray-300 px-2.5 py-1.5 text-sm" />
                            <span className="text-xs text-gray-500">{t('pms.workPlanning.config.hoursUnit')}</span>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">{t('pms.workPlanning.config.interval')} <span className="text-red-500">*</span></label>
                          <div className="flex items-center gap-1.5">
                            <input type="number" value={cfgForm.intervalMonths ?? cfgForm.intervalYears ?? cfgForm.intervalDays ?? ''} onChange={e => {
                              const value = parseInt(e.target.value) || undefined;
                              setCfgForm(f => f.intervalMonths != null ? { ...f, intervalMonths: value } : f.intervalYears != null ? { ...f, intervalYears: value } : { ...f, intervalDays: value });
                            }} min={1} className="min-w-0 flex-1 border border-gray-300 px-2.5 py-1.5 text-sm" />
                            <select aria-label="Đơn vị chu kỳ" value={cfgForm.intervalMonths != null ? 'months' : cfgForm.intervalYears != null ? 'years' : 'days'} onChange={e => {
                              const unit = e.target.value;
                              setCfgForm(f => {
                                const value = f.intervalMonths ?? f.intervalYears ?? f.intervalDays ?? 1;
                                return { ...f, intervalDays: unit === 'days' ? value : undefined, intervalMonths: unit === 'months' ? value : undefined, intervalYears: unit === 'years' ? value : undefined };
                              });
                            }} className="border border-gray-300 px-2 py-1.5 text-sm"><option value="days">Ngày</option><option value="months">Tháng</option><option value="years">Năm</option></select>
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">{t('pms.workPlanning.config.warningBefore')}</label>
                          <div className="flex items-center gap-1.5">
                            <input type="number" value={cfgForm.daysBeforeDue ?? ''} onChange={e => setCfgForm(f => ({ ...f, daysBeforeDue: parseInt(e.target.value) || (f.intervalType === 'RUNNING_HOURS' ? 70 : 7) }))} min={1} placeholder={cfgForm.intervalType === 'RUNNING_HOURS' ? '70' : '7'} className="flex-1 border border-gray-300 px-2.5 py-1.5 text-sm" />
                            <span className="text-xs text-gray-500">{cfgForm.intervalType === 'RUNNING_HOURS' ? t('pms.workPlanning.config.hoursUnit') : t('pms.workPlanning.config.daysUnit')}</span>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">{t('pms.workPlanning.config.estimatedDuration')}</label>
                          <div className="flex items-center gap-1.5">
                            <input type="number" value={cfgForm.estimatedDurationHours ?? ''} onChange={e => setCfgForm(f => ({ ...f, estimatedDurationHours: parseFloat(e.target.value) || undefined }))} min={1} step={1} placeholder="3" className="flex-1 border border-gray-300 px-2.5 py-1.5 text-sm" />
                            <span className="text-xs text-gray-500">{t('pms.workPlanning.config.hoursUnit')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    </>)}
                  </div>

                  {/* ════════ RIGHT COLUMN ════════ */}
                  <div className="flex flex-col overflow-hidden">
                    {/* ── Nhân lực ── */}
                    <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
                      <span className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Users size={14} /> {t('pms.workPlanning.config.crew')}</span>
                    </div>
                    <div className="px-4 py-3 space-y-4 border-b border-gray-200">
                      {/* PIC */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">PIC</span>
                          <span className="text-xs text-gray-500">{t('pms.workPlanning.config.picRole')}</span>
                        </div>
                        {(() => {
                          const picAssign = cfgCrewAssignments.find(a => a.role === 'PIC');
                          const picCrew = picAssign ? crewList.find(c => c.id === picAssign.crewId) : null;
                          if (picAssign && picCrew) {
                            return (
                              <div className="flex items-center gap-2 p-2 border border-blue-200 bg-blue-50/50 rounded text-sm">
                                <div className="flex-1 min-w-0">
                                  <span className="font-medium text-gray-900">{picCrew.fullName}</span>
                                  <span className="text-gray-400 ml-1.5 text-xs">{typeof picCrew.rank === 'string' ? picCrew.rank : picCrew.rank?.rankCode || ''}</span>
                                  {picCrew.department && <span className="text-gray-400 ml-1.5 text-xs">• {picCrew.department}</span>}
                                </div>
                                <button type="button" onClick={() => { const idx = cfgCrewAssignments.findIndex(a => a.role === 'PIC'); if (idx >= 0) cfgRemoveCrew(idx); }} className="text-red-400 hover:text-red-600 shrink-0">
                                  <XIcon size={14} />
                                </button>
                              </div>
                            );
                          }
                          return (
                            <div className="relative">
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                              <input type="text" value={cfgActiveCrewDrop === 'PIC' ? cfgCrewSearch : ''} onChange={e => { setCfgCrewSearch(e.target.value); setCfgActiveCrewDrop('PIC'); }} onFocus={() => { setCfgActiveCrewDrop('PIC'); setCfgCrewSearch(''); }} onBlur={() => setTimeout(() => setCfgActiveCrewDrop(null), 200)} placeholder={t('pms.workPlanning.config.searchPic')} className="w-full pl-8 border border-gray-300 py-2 text-sm rounded" />
                              {cfgActiveCrewDrop === 'PIC' && cfgFilteredCrew.length > 0 && (
                                <div className="absolute z-30 mt-1 w-full max-h-36 overflow-auto bg-white border border-gray-200 shadow-lg rounded">
                                  {cfgFilteredCrew.map(c => (
                                    <button key={c.id} type="button" onMouseDown={() => { cfgAddCrew(c.id, 'PIC'); setCfgActiveCrewDrop(null); }} className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm border-b border-gray-50">
                                      <span className="font-medium text-gray-900">{c.fullName}</span>
                                      <span className="text-gray-400 text-xs ml-1.5">{typeof c.rank === 'string' ? c.rank : c.rank?.rankCode || ''} • {c.department || ''}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                      {/* Support Team */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold bg-gray-100 text-gray-700 px-2 py-0.5 rounded">SUPPORT</span>
                            <span className="text-xs text-gray-500">{t('pms.workPlanning.config.supportMultiple')}</span>
                          </div>
                          <button type="button" onClick={() => { setCfgShowSupportPanel(!cfgShowSupportPanel); setCfgSupportSearch(''); }} className={`text-xs px-2.5 py-0.5 rounded border ${cfgShowSupportPanel ? 'border-blue-400 text-blue-700 bg-blue-50' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
                            {cfgShowSupportPanel ? t('pms.workPlanning.config.close') : t('pms.workPlanning.config.addMore')}
                          </button>
                        </div>
                        {cfgCrewAssignments.filter(a => a.role === 'SUPPORT').length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {cfgCrewAssignments.map((assign, i) => {
                              if (assign.role !== 'SUPPORT') return null;
                              const crew = crewList.find(c => c.id === assign.crewId);
                              return (
                                <span key={i} className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 border border-gray-200 rounded-full text-xs">
                                  <span className="font-medium text-gray-800">{crew?.fullName || '?'}</span>
                                  <span className="text-gray-400">{typeof crew?.rank === 'string' ? crew.rank : crew?.rank?.rankCode || ''}</span>
                                  <button type="button" onClick={() => cfgRemoveCrew(i)} className="text-red-400 hover:text-red-600 ml-0.5"><XIcon size={12} /></button>
                                </span>
                              );
                            })}
                          </div>
                        )}
                        {cfgShowSupportPanel && (
                          <div className="border border-gray-200 rounded bg-white">
                            <div className="px-2.5 py-2 border-b border-gray-100">
                              <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                <input type="text" value={cfgSupportSearch} onChange={e => setCfgSupportSearch(e.target.value)} placeholder={t('pms.workPlanning.config.searchCrew')} className="w-full pl-8 border border-gray-200 py-1.5 text-sm rounded" />
                              </div>
                            </div>
                            <div className="max-h-44 overflow-y-auto">
                              {Object.entries(cfgCrewByDept).length === 0 ? (
                                <div className="px-3 py-3 text-center text-gray-400 text-xs">{t('pms.workPlanning.config.noCrew')}</div>
                              ) : Object.entries(cfgCrewByDept).map(([dept, members]) => (
                                <div key={dept}>
                                  <div className="px-2.5 py-1 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 sticky top-0">{dept} <span className="text-gray-400 font-normal">({members.length})</span></div>
                                  {members.map(c => (
                                    <button key={c.id} type="button" onClick={() => cfgAddCrew(c.id, 'SUPPORT')} className="w-full text-left px-3 py-1.5 hover:bg-blue-50 text-sm border-b border-gray-50 flex items-center gap-2">
                                      <Plus size={12} className="text-blue-400 shrink-0" />
                                      <span className="font-medium text-gray-900">{c.fullName}</span>
                                      <span className="text-gray-400 text-xs">{typeof c.rank === 'string' ? c.rank : c.rank?.rankCode || ''}</span>
                                    </button>
                                  ))}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ── Vật tư tiêu dùng ── */}
                    <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 shrink-0">
                      <span className="text-sm font-semibold text-gray-700 flex items-center gap-2"><Package size={14} /> {t('pms.workPlanning.config.materials')}</span>
                    </div>
                    <div className="border-b border-gray-200 flex flex-col" style={{ maxHeight: '200px' }}>
                      <div className="overflow-auto flex-1">
                        <table className="w-full text-sm" style={{ tableLayout: 'fixed' }}>
                          <colgroup>
                            <col style={{ width: '28px' }} />
                            <col />
                            <col style={{ width: '60px' }} />
                            <col style={{ width: '70px' }} />
                            <col style={{ width: '28px' }} />
                            <col style={{ width: '28px' }} />
                            <col style={{ width: '28px' }} />
                          </colgroup>
                          <thead className="bg-blue-50 sticky top-0">
                            <tr>
                              <th className="px-1 py-1.5 text-left text-xs">{t('pms.workPlanning.config.index')}</th>
                              <th className="px-1.5 py-1.5 text-left text-xs">{t('pms.workPlanning.config.material')} <span className="text-red-500">*</span></th>
                              <th className="px-1 py-1.5 text-right text-xs">{t('pms.workPlanning.config.rob')}</th>
                              <th className="px-1 py-1.5 text-right text-xs">{t('pms.workPlanning.config.required')} <span className="text-red-500">*</span></th>
                              <th className="px-0.5 py-1.5 text-center text-xs"></th>
                              <th className="px-0.5 py-1.5 text-center text-xs" title={t('pms.workPlanning.config.assignEquipment')}><Link2 size={11} className="inline text-gray-400" /></th>
                              <th className="px-0.5 py-1.5"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {(!cfgForm.requiredSpareParts || cfgForm.requiredSpareParts.length === 0) ? (
                              <tr><td colSpan={7} className="text-center py-4 text-gray-400 text-xs">
                                {cfgTreeSelectedIds.size > 0 ? t('pms.workPlanning.config.noMaterialsAssigned') : t('pms.workPlanning.config.noMaterials')}
                              </td></tr>
                            ) : cfgForm.requiredSpareParts.map((part, i) => {
                              const mat = cfgMaterials.find(m => m.id.toString() === part.materialItemId);
                              const stock = mat ? cfgStockByItemCode[mat.itemCode] : undefined;
                              const rob = stock?.qty;
                              const hasStock = rob !== undefined;
                              // Tàu chưa có mã này coi như tồn 0 — vẫn phải cảnh báo thiếu.
                              const needsMore = mat && part.quantityRequired > (rob ?? 0);
                              const isLow = mat && hasStock && rob <= (stock?.minStock || 0);
                              const isLinked = part.materialItemId ? cfgLinkedMaterialIds.has(part.materialItemId) : false;
                              return (
                                <tr key={i} className={`border-b ${needsMore ? 'bg-red-50/50' : ''}`}>
                                  <td className="px-1.5 py-1 text-gray-500 text-xs">{i + 1}</td>
                                  <td className="px-1.5 py-1">
                                    <select value={part.materialItemId} onChange={e => cfgUpdateSparePart(i, 'materialItemId', e.target.value)} className="w-full border border-gray-300 px-1 py-0.5 text-xs truncate" style={{ maxWidth: '100%' }}>
                                      <option value="">{t('pms.workPlanning.config.selectOption')}</option>
                                      {cfgMaterials.map(m => <option key={m.id} value={m.id}>{m.itemCode} - {m.name}</option>)}
                                    </select>
                                  </td>
                                  <td className={`px-1.5 py-1 text-right text-xs ${isLow ? 'text-orange-600 font-medium' : mat && !hasStock ? 'text-amber-600' : 'text-gray-500'}`}
                                      title={mat && !hasStock ? t('pms.workPlanning.config.notOnBoard') : undefined}>
                                    {mat && hasStock ? rob : mat ? '0' : '-'}
                                  </td>
                                  <td className="px-1.5 py-1">
                                    <input type="number" value={part.quantityRequired} onChange={e => cfgUpdateSparePart(i, 'quantityRequired', parseFloat(e.target.value) || 1)} min={0.001} step={0.001} className={`w-full border px-1 py-0.5 text-xs text-right ${needsMore ? 'border-red-300 bg-red-50' : 'border-gray-300'}`} />
                                  </td>
                                  <td className="px-0.5 py-1 text-center">
                                    {needsMore ? (
                                      <span className="text-red-600" title={t('pms.workPlanning.config.shortage', { amount: (part.quantityRequired - (rob ?? 0)).toFixed(1), unit: stock?.unit || '' })}><AlertTriangle size={13} /></span>
                                    ) : mat && isLow ? (
                                      <span className="text-orange-500" title={t('pms.workPlanning.config.lowStock')}><AlertTriangle size={13} /></span>
                                    ) : mat && hasStock ? (
                                      <span className="text-green-500"><CheckCircle size={13} /></span>
                                    ) : null}
                                  </td>
                                  <td className="px-0.5 py-1 text-center">
                                    {part.materialItemId && cfgTreeSelectedIds.size > 0 && (
                                      isLinked ? (
                                        <span className="text-green-500" title={t('pms.workPlanning.config.assignedToEquipment')}><Link2 size={12} /></span>
                                      ) : (
                                        <PermissionGate permission={'pms.assets.assign'}><button type="button" onClick={() => cfgAssignMaterialToEquipment(part.materialItemId)} title={t('pms.workPlanning.config.assignMaterialToEquipment')} className="text-amber-500 hover:text-amber-700">
                                          <Save size={12} />
                                        </button></PermissionGate>
                                      )
                                    )}
                                  </td>
                                  <td className="px-0.5 py-1 text-center">
                                    <button type="button" onClick={() => cfgRemoveSparePart(i)} className="text-red-400 hover:text-red-600"><Trash2 size={13} /></button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="px-3 py-1.5 border-t border-gray-100 shrink-0">
                        <button type="button" onClick={cfgAddSparePart} className="flex items-center gap-1 text-blue-600 text-xs hover:text-blue-800">
                          <Plus size={12} /> {t('pms.workPlanning.config.addRow')}
                        </button>
                      </div>
                    </div>

                    {/* ── Hạng mục kiểm tra ── */}
                    <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between shrink-0">
                      <span className="text-sm font-semibold text-gray-700 flex items-center gap-2"><ClipboardList size={14} /> {t('pms.workPlanning.config.checklist')}</span>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <PermissionGate permission="pms.config.create"><button type="button" onClick={cfgSaveAsTemplate} className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-teal-300 rounded text-teal-700 hover:bg-teal-50">
                            <Plus size={12} /> {t('pms.workPlanning.config.createTemplate')}
                          </button></PermissionGate>
                          {cfgShowCreateTemplate && (
                            <div className="absolute right-0 z-40 mt-1 w-72 bg-white border border-gray-200 shadow-xl rounded-lg overflow-hidden">
                              <div className="flex items-center justify-between px-3 py-2 bg-teal-50 border-b border-teal-200">
                                <span className="text-xs font-semibold text-teal-800">{t('pms.workPlanning.config.saveChecklistTemplate')}</span>
                                <button type="button" onClick={() => setCfgShowCreateTemplate(false)} className="text-gray-400 hover:text-gray-600"><XIcon size={14} /></button>
                              </div>
                              <div className="px-3 py-3 space-y-2.5">
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('pms.workPlanning.config.templateName')} <span className="text-red-500">*</span></label>
                                  <input type="text" value={cfgTemplateName} onChange={e => setCfgTemplateName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') cfgConfirmSaveTemplate(); }} placeholder={t('pms.workPlanning.config.templateNamePlaceholder')} autoFocus className="w-full border border-gray-300 px-2.5 py-1.5 text-xs rounded" />
                                </div>
                                <div className="text-xs text-gray-500 bg-gray-50 px-2 py-1.5 rounded">
                                  {t('pms.workPlanning.config.templateStepCount', { count: cfgForm.checklistItemTemplates?.length || 0 })}
                                </div>
                                <div className="flex items-center justify-end gap-2">
                                  <button type="button" onClick={() => setCfgShowCreateTemplate(false)} className="px-3 py-1 text-xs text-gray-500 border border-gray-300 rounded hover:bg-gray-50">{t('pms.workPlanning.config.cancel')}</button>
                                  <PermissionGate permission="pms.config.create"><button type="button" onClick={cfgConfirmSaveTemplate} className="px-3 py-1 text-xs bg-teal-600 text-white rounded hover:bg-teal-700">{t('pms.workPlanning.config.saveTemplate')}</button></PermissionGate>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="relative">
                          <button type="button" onClick={() => setCfgShowChecklistTemplate(!cfgShowChecklistTemplate)} className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-gray-300 rounded text-gray-600 hover:bg-white">
                            <FileText size={12} /> {t('pms.workPlanning.config.selectFromTemplate')}
                          </button>
                          {cfgShowChecklistTemplate && (() => {
                            const customTemplates = (() => { try { return JSON.parse(localStorage.getItem('pms_custom_templates') || '{}'); } catch { return {}; } })();
                            const allTemplates = { ...CHECKLIST_TEMPLATES, ...customTemplates };
                            return (
                              <div className="absolute right-0 z-30 mt-1 w-64 bg-white border border-gray-200 shadow-lg rounded">
                                <div className="px-3 py-2 border-b border-gray-100 text-xs font-semibold text-gray-600">{t('pms.workPlanning.config.selectTemplate')}</div>
                                {Object.entries(allTemplates).map(([key, tpl]: [string, any]) => (
                                  <button key={key} type="button" onClick={() => cfgApplyChecklistTemplate(key)}
                                    className="w-full text-left px-3 py-2 hover:bg-blue-50 text-xs border-b border-gray-50 flex items-center justify-between">
                                    <span className="font-medium text-gray-900">{tpl.label}</span>
                                    <span className="flex items-center gap-1.5">
                                      {key.startsWith('CUSTOM_') && <span className="text-xs bg-teal-50 text-teal-600 px-1 rounded">{t('pms.workPlanning.config.custom')}</span>}
                                      <span className="text-gray-400">{t('pms.workPlanning.config.steps', { count: tpl.items.length })}</span>
                                    </span>
                                  </button>
                                ))}
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col" style={{ maxHeight: '250px' }}>
                      <div className="overflow-auto flex-1">
                        <table className="w-full text-sm">
                          <thead className="bg-blue-50 sticky top-0">
                            <tr>
                              <th className="px-2 py-2 text-left w-10">{t('pms.workPlanning.config.index')}</th>
                              <th className="px-2 py-2 text-left">{t('pms.workPlanning.config.stepDescription')} <span className="text-red-500">*</span></th>
                              <th className="px-2 py-2 text-center w-20">{t('pms.workPlanning.config.measureValue')}</th>
                              <th className="px-2 py-2 text-right w-16">Min</th>
                              <th className="px-2 py-2 text-right w-16">Max</th>
                              <th className="px-2 py-2 text-left w-16">{t('pms.workPlanning.config.unit')}</th>
                              <th className="px-2 py-2 w-8"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {(!cfgForm.checklistItemTemplates || cfgForm.checklistItemTemplates.length === 0) ? (
                              <tr><td colSpan={7} className="text-center py-6 text-gray-400 text-xs">{t('pms.workPlanning.config.noData')}</td></tr>
                            ) : cfgForm.checklistItemTemplates.map((item, i) => (
                              <tr key={i} className="border-b">
                                <td className="px-2 py-1.5 text-gray-500 text-xs">{item.sequenceOrder}</td>
                                <td className="px-2 py-1.5">
                                  <input type="text" value={item.checkpointDescription} onChange={e => cfgUpdateChecklist(i, 'checkpointDescription', e.target.value)} placeholder={t('pms.workPlanning.config.stepDescPlaceholder')} className="w-full border border-gray-300 px-1.5 py-1 text-xs" />
                                </td>
                                <td className="px-2 py-1.5 text-center">
                                  <input type="checkbox" checked={item.requiresReading || false} onChange={e => cfgUpdateChecklist(i, 'requiresReading', e.target.checked)} className="w-3.5 h-3.5 text-blue-600 border-gray-300 rounded" />
                                </td>
                                <td className="px-2 py-1.5">
                                  {item.requiresReading && <input type="number" value={item.normalRangeMin ?? ''} onChange={e => cfgUpdateChecklist(i, 'normalRangeMin', parseFloat(e.target.value) || undefined)} placeholder="—" step={0.01} className="w-full border border-gray-300 px-1 py-1 text-xs text-right" />}
                                </td>
                                <td className="px-2 py-1.5">
                                  {item.requiresReading && <input type="number" value={item.normalRangeMax ?? ''} onChange={e => cfgUpdateChecklist(i, 'normalRangeMax', parseFloat(e.target.value) || undefined)} placeholder="—" step={0.01} className="w-full border border-gray-300 px-1 py-1 text-xs text-right" />}
                                </td>
                                <td className="px-2 py-1.5">
                                  {item.requiresReading && <input type="text" value={item.unit ?? ''} onChange={e => cfgUpdateChecklist(i, 'unit', e.target.value)} placeholder="°C" className="w-full border border-gray-300 px-1 py-1 text-xs" />}
                                </td>
                                <td className="px-2 py-1.5 text-center">
                                  <button type="button" onClick={() => cfgRemoveChecklist(i)} className="text-red-400 hover:text-red-600"><Trash2 size={13} /></button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="px-3 py-1.5 border-t border-gray-100 shrink-0">
                        <button type="button" onClick={cfgAddChecklist} className="flex items-center gap-1 text-blue-600 text-xs hover:text-blue-800">
                          <Plus size={12} /> {t('pms.workPlanning.config.addStep')}
                        </button>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals - keep AddScheduleModal for the + button in other tabs */}
      {historyTask && <MaintenanceHistoryModal key={historyTask.id} task={historyTask} onClose={() => setHistoryTask(null)} />}
      {showImportMaintenance && <ImportMaintenanceModal
        onClose={() => setShowImportMaintenance(false)}
        onSuccess={async () => { await loadSchedules(); setActiveTab('config'); }}
      />}
      <AddScheduleModal
        isOpen={isAddScheduleModalOpen}
        onClose={() => setIsAddScheduleModalOpen(false)}
        onSuccess={() => {
          loadData(true);
          loadSchedules();
          setIsAddScheduleModalOpen(false);
        }}
      />

    </div>
  );
}

// === TREE NODE COMPONENT ===
function TreeNode({
  node, expanded, selected, onToggle, onSelect, search, level
}: {
  node: EquipmentAsset;
  expanded: Set<string>;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (node: EquipmentAsset) => void;
  search: string;
  level: number;
}) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expanded.has(node.id);

  const selectableIds = getSelectableEquipmentIds(node);
  const isFolder = isEquipmentFolder(node);
  const canSelect = selectableIds.size > 0;
  const allSelected = canSelect && [...selectableIds].every(id => selected.has(id));
  const someSelected = !allSelected && [...selectableIds].some(id => selected.has(id));

  // Filter children by search
  const filteredChildren = search
    ? node.children?.filter(child => matchesEquipmentTreeSearch(child, search))
    : node.children;

  return (
    <div>
      <div
        className="flex items-center gap-1 py-1 px-1 hover:bg-blue-50 rounded"
        style={{ paddingLeft: `${level * 16 + 4}px` }}
      >
        {hasChildren ? (
          <button onClick={(event) => { event.stopPropagation(); onToggle(node.id); }} className="p-0.5 hover:bg-gray-200 rounded" type="button">
            {isExpanded ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronRight className="w-3 h-3 text-gray-500" />}
          </button>
        ) : (
          <span className="w-4" />
        )}
        {isFolder ? (
          <FolderOpen className="w-3.5 h-3.5 flex-shrink-0 text-amber-500" />
        ) : (
          <Package className="w-3.5 h-3.5 flex-shrink-0 text-slate-400" />
        )}
        <input
          type="checkbox"
          checked={allSelected}
          ref={el => { if (el) el.indeterminate = someSelected; }}
          disabled={!canSelect}
          onChange={() => onSelect(node)}
          className="w-3.5 h-3.5 text-blue-600 rounded disabled:cursor-not-allowed disabled:opacity-40"
        />
        <span className="text-xs text-gray-700 truncate flex-1" title={`${node.assetCode} - ${node.assetName}`}>
          {node.assetCode} - {node.assetName}
        </span>
      </div>
      {hasChildren && (isExpanded || !!search.trim()) && filteredChildren?.map(child => (
        <TreeNode
          key={child.id}
          node={child}
          expanded={expanded}
          selected={selected}
          onToggle={onToggle}
          onSelect={onSelect}
          search={search}
          level={level + 1}
        />
      ))}
    </div>
  );
}
