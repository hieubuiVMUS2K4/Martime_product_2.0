import { prepareApproval } from "./approval";
/**
 * Maintenance Task Service
 * ISM Code - Planned Maintenance System API Client
 */

import axios from 'axios';
import { API_CONFIG } from '@/config/app.config';
import { getAuthToken } from './api.client';
import type {
  MaintenanceTask,
  TaskListResponse,
  GetCompletedTasksParams,
  DailyTasksSummary,
  TaskSummary
} from '../types/maintenance.types';

// Create axios instance with proper base URL
const api = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT
});

// Add auth token to all requests
api.interceptors.request.use(async (config) => {
  config.headers['X-Device-Type'] = 'WEB';
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (config.method !== "get") {
    const proof = await prepareApproval(config.url || "", config.data, token);
    Object.entries(proof).forEach(([key, value]) => { config.headers[key] = value });
  }
  return config;
});

const BASE_URL = '/maintenance';

/**
 * Get completed tasks within date range
 */
export const getCompletedTasks = async (
  params: GetCompletedTasksParams
): Promise<MaintenanceTask[]> => {
  try {
    const response = await api.get<TaskListResponse>(`${BASE_URL}/tasks`, {
      params: {
        status: 'COMPLETED',
        page: params.page || 1,
        pageSize: params.pageSize || 100
      }
    });
    
    // Check if response.data and response.data.data exist
    if (!response.data || !Array.isArray(response.data.data)) {
      console.warn('Invalid response format from maintenance API:', response.data);
      return [];
    }
    
    // Filter by date range on client side (backend doesn't have date filter yet)
    const fromDate = new Date(params.fromDate);
    const toDate = new Date(params.toDate);
    
    return response.data.data.filter(task => {
      if (!task.completedAt) return false;
      const completedDate = new Date(task.completedAt);
      return completedDate >= fromDate && completedDate <= toDate;
    });
  } catch (error) {
    console.error('Failed to fetch completed tasks:', error);
    return []; // Return empty array instead of throwing
  }
};

/**
 * Get tasks completed in last 24 hours
 */
export const getTasksCompletedLast24Hours = async (): Promise<MaintenanceTask[]> => {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  return getCompletedTasks({
    fromDate: yesterday.toISOString(),
    toDate: now.toISOString()
  });
};

/**
 * Calculate total man-hours from completed tasks
 */
export const calculateManHours = (tasks: MaintenanceTask[]): number => {
  return tasks.reduce((total, task) => {
    if (!task.startedAt || !task.completedAt) return total;
    
    const startTime = new Date(task.startedAt).getTime();
    const endTime = new Date(task.completedAt).getTime();
    const hours = (endTime - startTime) / (1000 * 60 * 60);
    
    return total + hours;
  }, 0);
};

/**
 * Convert MaintenanceTask to TaskSummary for display
 */
export const toTaskSummary = (task: MaintenanceTask): TaskSummary => {
  let duration = 0;
  if (task.startedAt && task.completedAt) {
    const startTime = new Date(task.startedAt).getTime();
    const endTime = new Date(task.completedAt).getTime();
    duration = (endTime - startTime) / (1000 * 60 * 60);
  }
  
  return {
    taskId: task.taskId,
    equipmentName: task.equipmentGroupName || task.equipmentName || 'Unknown Equipment',
    taskDescription: task.taskDescription,
    completedAt: task.completedAt || '',
    completedBy: task.completedBy || 'Unknown',
    duration: parseFloat(duration.toFixed(1)),
    sparePartsUsed: task.sparePartsUsed,
    priority: task.priority
  };
};

/**
 * Get daily tasks summary
 */
export const getDailyTasksSummary = async (date: Date): Promise<DailyTasksSummary> => {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);
  
  const tasks = await getCompletedTasks({
    fromDate: startOfDay.toISOString(),
    toDate: endOfDay.toISOString()
  });
  
  const taskSummaries = tasks.map(toTaskSummary);
  const totalManHours = calculateManHours(tasks);
  
  // Group by department (based on taskType)
  const tasksByDepartment = {
    ENGINE: tasks.filter(t => t.taskType.includes('ENGINE')).length,
    DECK: tasks.filter(t => t.taskType.includes('DECK') || t.taskType.includes('HULL')).length,
    ELECTRICAL: tasks.filter(t => t.taskType.includes('ELECTRICAL') || t.taskType.includes('GENERATOR')).length,
    SAFETY: tasks.filter(t => t.taskType.includes('SAFETY') || t.taskType.includes('LIFEBOAT')).length,
    OTHER: tasks.filter(t => 
      !t.taskType.includes('ENGINE') && 
      !t.taskType.includes('DECK') && 
      !t.taskType.includes('ELECTRICAL') && 
      !t.taskType.includes('SAFETY')
    ).length
  };
  
  return {
    date: date.toISOString(),
    totalTasks: tasks.length,
    totalManHours: parseFloat(totalManHours.toFixed(1)),
    tasks: taskSummaries,
    tasksByDepartment
  };
};

/**
 * Get all pending tasks
 */
export const getPendingTasks = async (): Promise<MaintenanceTask[]> => {
  const response = await api.get<MaintenanceTask[]>(`${BASE_URL}/tasks/pending`);
  return response.data;
};

/**
 * Get overdue tasks
 */
export const getOverdueTasks = async (): Promise<MaintenanceTask[]> => {
  const response = await api.get<MaintenanceTask[]>(`${BASE_URL}/tasks/overdue`);
  return response.data;
};

/**
 * Get tasks pending approval (HIGH/CRITICAL tasks awaiting C/E approval)
 */
export const getTasksPendingApproval = async (): Promise<MaintenanceTask[]> => {
  try {
    const response = await api.get<TaskListResponse>(`${BASE_URL}/tasks`, {
      params: {
        status: 'PENDING_APPROVAL',
        page: 1,
        pageSize: 100
      }
    });
    
    if (!response.data || !Array.isArray(response.data.data)) {
      console.warn('Invalid response format from maintenance API:', response.data);
      return [];
    }
    
    return response.data.data;
  } catch (error) {
    console.error('Failed to fetch tasks pending approval:', error);
    return [];
  }
};

/**
 * Approve a task (C/E or Master only)
 */
export const approveTask = async (
  taskId: string,
  approvedBy: string
): Promise<void> => {
  await api.post(`${BASE_URL}/tasks/${taskId}/approve`, {
    isApproved: true,
    approvedBy
  });
};/**
 * Reject a task with reason (C/E or Master only)
 */
export const rejectTask = async (
  taskId: string, 
  approvedBy: string,
  rejectionReason: string
): Promise<void> => {
  await api.post(`${BASE_URL}/tasks/${taskId}/approve`, {
    isApproved: false,
    approvedBy,
    rejectionReason
  });
};

// ============================================================
// PMS WORKFLOW v2.0 API FUNCTIONS
// ============================================================

const WORKFLOW_BASE = '/tasks';

/**
 * Start working on a task (Crew starts execution)
 * DUE/OVERDUE/RECTIFY → IN_PROGRESS
 */
export interface StartTaskDto {
  currentRunningHours?: number;
  notes?: string;
}

export const startTask = async (taskId: string, dto: StartTaskDto = {}): Promise<{
  message: string;
  taskId: string;
  status: string;
  startedAt: string;
}> => {
  const response = await api.post(`${WORKFLOW_BASE}/${taskId}/start`, dto);
  return response.data;
};

/**
 * Submit task for approval (Crew completes work)
 * IN_PROGRESS → PENDING_APPROVAL
 */
export interface SubmitTaskDto {
  notes?: string;
  sparePartsUsed?: string;
  photoUrls?: string[];
  completedRunningHours?: number;
  actualDurationMinutes?: number;
}

export const saveTaskProgress = async (taskId: string, dto: SubmitTaskDto): Promise<void> => {
  await api.put(`${WORKFLOW_BASE}/${taskId}/progress`, dto);
};

export const submitTask = async (taskId: string, dto: SubmitTaskDto = {}): Promise<{
  message: string;
  taskId: string;
  status: string;
  submittedAt: string;
  actualDuration: number;
}> => {
  const response = await api.post(`${WORKFLOW_BASE}/${taskId}/submit`, dto);
  return response.data;
};

/**
 * Verify task (C/E or Master approves/rejects)
 * PENDING_APPROVAL → COMPLETED or RECTIFY
 */
export interface VerifyTaskDto {
  action: 'APPROVE' | 'REJECT';
  notes?: string;
  rejectionReason?: string;
}

export const verifyTask = async (taskId: string, dto: VerifyTaskDto): Promise<{
  message: string;
  taskId: string;
  status: string;
  verifiedAt: string;
  rejectionCount?: number;
}> => {
  const response = await api.post(`${WORKFLOW_BASE}/${taskId}/verify`, dto);
  return response.data;
};

/**
 * Get task details with full workflow info
 */
export interface TaskStatusHistoryDto {
  id: string;
  fromStatus: string;
  toStatus: string;
  changedBy: string;
  changedByName?: string;
  changedAt: string;
  reason?: string;
  notes?: string;
  deviceType?: string;
}

export interface MaintenanceTaskDetailDto extends MaintenanceTask {
  startedBy?: string;
  estimatedDuration?: number;
  actualDuration?: number;
  checklistCompleted: boolean;
  photosUploaded: number;
  requiredPhotos: number;
  submittedAt?: string;
  submittedBy?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  verificationResult?: string;
  verificationNotes?: string;
  rejectionReason?: string;
  rejectionCount: number;
  isCms: boolean;
  statusHistory: TaskStatusHistoryDto[];
}

export const getTaskDetails = async (taskId: string): Promise<MaintenanceTaskDetailDto> => {
  const response = await api.get(`${WORKFLOW_BASE}/${taskId}/details`);
  return response.data;
};

/**
 * Get tasks pending approval with pagination
 */
export interface PendingApprovalResponse {
  items: MaintenanceTask[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const getPendingApprovalTasks = async (
  page: number = 1, 
  pageSize: number = 20
): Promise<PendingApprovalResponse> => {
  const response = await api.get(`${WORKFLOW_BASE}/pending-approval`, {
    params: { page, pageSize }
  });
  return response.data;
};

/**
 * Get rectify tasks with pagination
 */
export interface RectifyTaskDto {
  id: string;
  taskId: string;
  taskDescription: string;
  equipmentName?: string;
  priority: string;
  status: string;
  nextDueAt: string;
  assignedTo?: string;
  assignedDepartment?: string;
  rejectionReason?: string;
  rejectionCount: number;
  lastRejectedAt?: string;
}

export interface RectifyTasksResponse {
  items: RectifyTaskDto[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const getRectifyTasks = async (
  page: number = 1, 
  pageSize: number = 20
): Promise<RectifyTasksResponse> => {
  const response = await api.get(`${WORKFLOW_BASE}/rectify`, {
    params: { page, pageSize }
  });
  return response.data;
};

/**
 * Get approval dashboard summary
 */
export interface ApprovalDashboardSummary {
  pendingApprovalCount: number;
  pendingDeferralCount: number;
  rectifyTaskCount: number;
  overdueTaskCount: number;
  todayDueCount: number;
  thisWeekDueCount: number;
}

export const getApprovalDashboardSummary = async (): Promise<ApprovalDashboardSummary> => {
  const response = await api.get(`${WORKFLOW_BASE}/dashboard/summary`);
  return response.data;
};

/**
 * Get morning briefing data
 */
export interface MorningBriefingDto {
  date: string;
  overdueTasksEngine: number;
  overdueTasksDeck: number;
  dueToday: number;
  pendingApproval: number;
  pendingDeferral: number;
  tasksInProgress: number;
  completedYesterday: number;
  topPriorityTasks: Array<{
    id: string;
    taskId: string;
    taskDescription: string;
    equipmentName?: string;
    priority: string;
    status: string;
    nextDueAt: string;
    assignedDepartment?: string;
    daysOverdue?: number;
  }>;
}

export const getMorningBriefing = async (): Promise<MorningBriefingDto> => {
  const response = await api.get(`${WORKFLOW_BASE}/morning-briefing`);
  return response.data;
};

/**
 * Bulk verify tasks (approve/reject multiple tasks at once)
 * PENDING_APPROVAL → COMPLETED or RECTIFY
 */
export interface BulkVerifyTaskDto {
  taskIds: string[];
  action: 'APPROVE' | 'REJECT';
  notes?: string;
  rejectionReason?: string;
}

export interface BulkVerifyResult {
  message: string;
  successCount: number;
  failCount: number;
  results: Array<{
    taskId: string;
    success: boolean;
    status?: string;
    error?: string;
  }>;
}

export const bulkVerifyTasks = async (dto: BulkVerifyTaskDto): Promise<BulkVerifyResult> => {
  const response = await api.post(`${WORKFLOW_BASE}/bulk-verify`, dto);
  return response.data;
};

// ============================================================
// DEFERRAL REQUEST API FUNCTIONS
// ============================================================

const DEFERRAL_BASE = '/deferral-requests';

export interface DeferralRequest {
  id: string;
  taskId: string;
  taskCode: string;
  requestedBy: string;
  requestedByName?: string;
  requestedAt: string;
  reason: string;
  currentDueDate: string;
  proposedDueDate: string;
  deferralDays: number;
  status: string;
  priority: string;
  isCmsItem: boolean;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  // OVERDUE deferral fields
  isOverdueDeferral?: boolean;
  rootCause?: string;
  preventiveMeasures?: string;
  attachments?: string[];
  taskStatusAtRequest?: string;
}

// ============================================================
// DEFERRAL REQUEST DTOs
// ============================================================

export interface CreateDeferralDto {
  taskId: string;
  reason: string;
  proposedDueDate: string;
  rootCause?: string;              // Required for OVERDUE deferrals
  preventiveMeasures?: string;     // Required for OVERDUE deferrals
  attachments?: string[];          // Required for OVERDUE deferrals
  classPermissionLetter?: string;
}

export interface ReviewDeferralDto {
  action: 'APPROVE' | 'REJECT';
  notes?: string;
}

/**
 * Get all deferral requests with optional filters
 */
export interface DeferralListResponse {
  items: DeferralRequest[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export const getDeferralRequests = async (params?: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<DeferralListResponse> => {
  const response = await api.get(DEFERRAL_BASE, { params });
  return response.data;
};

/**
 * Get pending deferral requests
 */
export const getPendingDeferrals = async (): Promise<DeferralRequest[]> => {
  const response = await api.get(`${DEFERRAL_BASE}/pending`);
  return response.data;
};

/**
 * Create a new deferral request
 */
export const createDeferralRequest = async (dto: CreateDeferralDto): Promise<DeferralRequest> => {
  const response = await api.post(DEFERRAL_BASE, dto);
  return response.data;
};

/**
 * Review a deferral request (approve/reject)
 */
export const reviewDeferralRequest = async (
  deferralId: string, 
  dto: ReviewDeferralDto
): Promise<{ message: string; status: string }> => {
  const response = await api.put(`${DEFERRAL_BASE}/${deferralId}/review`, dto);
  return response.data;
};

/**
 * Get deferral request by ID
 */
export const getDeferralById = async (deferralId: string): Promise<DeferralRequest> => {
  const response = await api.get(`${DEFERRAL_BASE}/${deferralId}`);
  return response.data;
};
