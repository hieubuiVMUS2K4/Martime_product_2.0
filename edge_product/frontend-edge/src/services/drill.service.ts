/**
 * Drill Training Management Service
 * SOLAS/ISPS Compliance - ISM Code 10
 * API Client for drill management endpoints
 */

import axios from 'axios';
import { API_CONFIG } from '@/config/app.config';
import { prepareApproval } from './approval';
import { getAuthToken } from './api.client';
import type {
  DrillType,
  DrillSchedule,
  DrillLog,
  CreateUpdateDrillScheduleDto,
  CreateDrillLogDto,
  ApproveDrillLogDto,
  DrillTimelineQueryDto,
  DrillTimelineGroupDto,
  DrillStatistics,
} from '@/types/drill.types';

// Create axios instance with proper base URL
const api = axios.create({
  baseURL: API_CONFIG.BASE_URL,
  timeout: API_CONFIG.TIMEOUT
});

// Inject auth token into all requests
api.interceptors.request.use(async (config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const proof = await prepareApproval(config.url || "", config.data, token);
  Object.entries(proof).forEach(([key, value]) => config.headers.set(key, value));
  return config;
});

const BASE_URL = '/drill';

// ============================================================
// DRILL TYPES API (Master Data)
// ============================================================

/**
 * Get all drill types with optional filters
 */
export const getDrillTypes = async (
  category?: string,
  isActive?: boolean
): Promise<DrillType[]> => {
  try {
    const response = await api.get<DrillType[]>(`${BASE_URL}/types`, {
      params: { category, isActive }
    });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch drill types:', error);
    throw error;
  }
};

/**
 * Get single drill type by ID
 */
export const getDrillTypeById = async (id: string): Promise<DrillType> => {
  try {
    const response = await api.get<DrillType>(`${BASE_URL}/types/${id}`);
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch drill type ${id}:`, error);
    throw error;
  }
};

// ============================================================
// TIMELINE API (for Ảnh 2 Gantt View)
// ============================================================

/**
 * Get timeline grouped by category (tree structure for Ảnh 2)
 * Returns: DrillTimelineGroupDto[] with collapsible categories
 */
export const getDrillTimeline = async (
  query?: DrillTimelineQueryDto
): Promise<DrillTimelineGroupDto[]> => {
  try {
    const response = await api.get<DrillTimelineGroupDto[]>(`${BASE_URL}/timeline`, {
      params: query
    });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch drill timeline:', error);
    throw error;
  }
};

/**
 * Get flat list of drill schedules (alternative to grouped view)
 */
export const getDrillSchedules = async (
  query?: DrillTimelineQueryDto
): Promise<DrillSchedule[]> => {
  try {
    const response = await api.get<DrillSchedule[]>(`${BASE_URL}/schedules`, {
      params: query
    });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch drill schedules:', error);
    throw error;
  }
};

/**
 * Get single drill schedule by ID (for Edit Modal - Ảnh 3)
 */
export const getDrillScheduleById = async (id: string): Promise<DrillSchedule> => {
  try {
    const response = await api.get<DrillSchedule>(`${BASE_URL}/schedules/${id}`);
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch drill schedule ${id}:`, error);
    throw error;
  }
};

// ============================================================
// SCHEDULE MANAGEMENT API (for Ảnh 3 Edit Modal)
// ============================================================

/**
 * Create new drill schedule (from Edit Modal Save button)
 */
export const createDrillSchedule = async (
  dto: CreateUpdateDrillScheduleDto
): Promise<DrillSchedule> => {
  try {
    const response = await api.post<DrillSchedule>(`${BASE_URL}/schedules`, dto);
    return response.data;
  } catch (error) {
    console.error('Failed to create drill schedule:', error);
    throw error;
  }
};

/**
 * Update existing drill schedule (from Edit Modal Save button)
 */
export const updateDrillSchedule = async (
  id: string,
  dto: CreateUpdateDrillScheduleDto
): Promise<DrillSchedule> => {
  try {
    const response = await api.put<DrillSchedule>(`${BASE_URL}/schedules/${id}`, dto);
    return response.data;
  } catch (error) {
    console.error(`Failed to update drill schedule ${id}:`, error);
    throw error;
  }
};

// ============================================================
// DRILL LOG API (Execution Records)
// ============================================================

/**
 * Record drill execution (mark drill as completed)
 */
export const createDrillLog = async (
  dto: CreateDrillLogDto
): Promise<DrillLog> => {
  try {
    const response = await api.post<DrillLog>(`${BASE_URL}/logs`, dto);
    return response.data;
  } catch (error) {
    console.error('Failed to create drill log:', error);
    throw error;
  }
};

/**
 * Get single drill log by ID
 */
export const getDrillLogById = async (id: string): Promise<DrillLog> => {
  try {
    const response = await api.get<DrillLog>(`${BASE_URL}/logs/${id}`);
    return response.data;
  } catch (error) {
    console.error(`Failed to fetch drill log ${id}:`, error);
    throw error;
  }
};

/**
 * Master approval for drill log (locks the record)
 * Requirement: "EVERY DRILL REPORT NEEDS TO BE APPROVED BY THE MASTER BEFORE SIGNING OFF"
 */
export const approveDrillLog = async (
  id: string,
  dto: ApproveDrillLogDto
): Promise<DrillLog> => {
  try {
    const response = await api.put<DrillLog>(`${BASE_URL}/logs/${id}/approve`, dto);
    return response.data;
  } catch (error) {
    console.error(`Failed to approve drill log ${id}:`, error);
    throw error;
  }
};

// ============================================================
// STATISTICS & DASHBOARD API
// ============================================================

/**
 * Get drill statistics for dashboard summary
 */
export const getDrillStatistics = async (
  year?: number,
  month?: number
): Promise<DrillStatistics> => {
  try {
    const response = await api.get<DrillStatistics>(`${BASE_URL}/statistics`, {
      params: { year, month }
    });
    return response.data;
  } catch (error) {
    console.error('Failed to fetch drill statistics:', error);
    throw error;
  }
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Calculate timeline bar color based on status and expiry
 * Maps to Ảnh 2 color scheme:
 * - RED: Overdue
 * - GREEN: Completed
 * - YELLOW: No expiry / Due
 * - BLUE: Scheduled
 */
export const getTimelineBarColor = (
  status: string,
  hasNoExpiry: boolean
): 'red' | 'green' | 'yellow' | 'blue' => {
  if (status === 'OVERDUE') return 'red';
  if (status === 'COMPLETED') return 'green';
  if (hasNoExpiry || status === 'DUE') return 'yellow';
  return 'blue'; // SCHEDULED
};

/**
 * Parse timeline label format ("2 w", "3 m", "-2 d", "6 d")
 * Returns: { value: number, unit: 'd' | 'w' | 'm' | 'y', isOverdue: boolean }
 */
export const parseTimelineLabel = (label: string): {
  value: number;
  unit: 'd' | 'w' | 'm' | 'y';
  isOverdue: boolean;
} | null => {
  if (!label || label === '✓') return null;
  
  const match = label.match(/^(-?)(\d+)\s*([dwmy])$/);
  if (!match) return null;
  
  const [, minus, valueStr, unit] = match;
  return {
    value: parseInt(valueStr, 10),
    unit: unit as 'd' | 'w' | 'm' | 'y',
    isOverdue: minus === '-'
  };
};

/**
 * Calculate bar position and width for Gantt chart
 * @param startDate ISO date string
 * @param dueDate ISO date string
 * @param timelineStart Start date of visible timeline (e.g., Jan 1, 2025)
 * @param timelineEnd End date of visible timeline (e.g., Dec 31, 2025)
 * @param timelineWidth Total width of timeline in pixels
 */
export const calculateBarPosition = (
  startDate: string,
  dueDate: string,
  timelineStart: Date,
  timelineEnd: Date,
  timelineWidth: number
): { left: number; width: number } => {
  const start = new Date(startDate);
  const due = new Date(dueDate);
  
  const timelineSpanMs = timelineEnd.getTime() - timelineStart.getTime();
  const startOffsetMs = start.getTime() - timelineStart.getTime();
  const durationMs = due.getTime() - start.getTime();
  
  const left = (startOffsetMs / timelineSpanMs) * timelineWidth;
  const width = (durationMs / timelineSpanMs) * timelineWidth;
  
  return {
    left: Math.max(0, left), // Don't overflow left
    width: Math.max(10, width) // Minimum 10px visible
  };
};

/**
 * Format date to DD/MM/YYYY format (matching Ảnh 3 date picker format)
 */
export const formatDateDMY = (isoDate: string): string => {
  const date = new Date(isoDate);
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

/**
 * Parse DD/MM/YYYY to ISO date string (for API submission)
 */
export const parseDateDMY = (dmyDate: string): string => {
  const [day, month, year] = dmyDate.split('/').map(Number);
  return new Date(year, month - 1, day).toISOString();
};

// ============================================================
// DRILL DELETE API (Soft Delete with Audit Trail)
// ============================================================

/**
 * Soft delete a single drill schedule
 * @param scheduleId - ID of schedule to delete
 * @param reason - Optional reason for deletion
 */
export const deleteDrillSchedule = async (
  scheduleId: string,
  reason?: string
): Promise<{ message: string; deletedAt: string; deletedBy: string }> => {
  try {
    const response = await api.delete(`${BASE_URL}/schedules/${scheduleId}`, {
      params: { reason }
    });
    return response.data;
  } catch (error: any) {
    if (error.response?.data?.isProtected) {
      throw new Error(error.response.data.message);
    }
    console.error('Failed to delete drill schedule:', error);
    throw error;
  }
};

/**
 * Bulk delete drill schedules (soft delete with audit trail)
 * @param scheduleIds - Array of schedule IDs to delete
 * @param reason - Optional reason for bulk deletion
 */
export const bulkDeleteDrillSchedules = async (
  scheduleIds: string[],
  reason?: string
): Promise<{ message: string; deletedCount: number; deletedBy: string; deletedAt: string }> => {
  try {
    const response = await api.post(`${BASE_URL}/schedules/bulk-delete`, {
      scheduleIds,
      reason
    });
    return response.data;
  } catch (error: any) {
    if (error.response?.data?.isProtected) {
      const protectedCount = error.response.data.protectedIds?.length || 0;
      throw new Error(`${error.response.data.message}\n\n${protectedCount} drill(s) have secure history enabled and cannot be deleted (SOLAS/ISM compliance).`);
    }
    console.error('Failed to bulk delete drill schedules:', error);
    throw error;
  }
};

// ============================================================
// DOCUMENT UPLOAD API
// ============================================================

/**
 * Upload a document file for a drill and return a persistent DocumentAttachment
 */
export const uploadDrillDocument = async (file: File): Promise<{
  name: string;
  url: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: string;
}> => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post(`${BASE_URL}/upload-document`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};
