import { ENV } from '../config/env';
import { buildAuthHeaders } from './api.client';

const BASE = ENV.API_BASE_URL;

// ============================================================
// Types
// ============================================================

export interface SyncOutboxStat {
  node: string;
  pending: number;
}

export interface SyncLogEntry {
  id?: number;
  conflictDetail?: string;
  direction: string;
  originNode: string;
  tableName: string;
  recordKey: string;
  actionType: string;
  status: string;
  processedAt: string;
}

export interface SyncLogFilters {
  /** Mỗi bộ lọc nhận một hoặc nhiều giá trị, phân cách bằng dấu phẩy. */
  nodeId?: string; status?: string; tableName?: string; direction?: string; actionType?: string;
  /** Ô tìm nhanh: tên bảng / mã node khớp từ khóa tiếng Việt (nối dấu phẩy). */
  searchTables?: string; searchNodes?: string;
  search?: string; from?: string; to?: string; page?: number; pageSize?: number;
}
export interface SyncLogPage {
  items: SyncLogEntry[]; total: number; page: number; pageSize: number; totalPages: number;
  summary: { status: string; count: number }[];
  /** Giá trị có thật trong nhật ký, làm lựa chọn cho menu lọc theo cột. */
  facets?: { origins: string[]; tables: string[]; actions: string[]; directions: string[]; statuses: string[] };
}
export interface SyncOutboxPage {
  total: number; page: number; pageSize: number; totalPages: number;
  groups: { node: string; tableName: string; pending: number; oldestAt: string }[];
  items: { id: number; targetNode: string; tableName: string; recordKey: string; actionType: string; createdAt: string }[];
}
export interface SyncNodeDetail {
  nodeId: string; shipName?: string; imoNumber?: string; isOnline: boolean; currentNetworkType?: string;
  push: { lastAt?: string; totalReceived: number; lastBatchSize: number; lastVersion: number };
  pull: { lastAt?: string; totalDelivered: number; pending: number; lastAckedId: number };
  health: { lastHeartbeat?: string; consecutiveFailures: number; lastError?: string; lastErrorAt?: string };
  security: { isRegistered: boolean; isRevoked: boolean; keyVersion: number };
}
export interface SyncIntegrity {
  timestamp: string; healthy: boolean;
  counts: Record<string, number>;
  syncGaps: { unsyncedCrew: number; unsyncedCerts: number; orphanCertificates: number; staleOutboxItems: number };
}

function queryString(params: object): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== '') query.set(key, String(value)); });
  return query.toString();
}

export interface NodeInfo {
  id: string;
  name: string;
  isOnline: boolean;
}

export interface SyncStatusResponse {
  outboxStats: SyncOutboxStat[];
  recentLogs: SyncLogEntry[];
  serverTime: string;
  nodes?: NodeTracker[];
}

export interface SyncHealthCheck {
  status: 'healthy' | 'unhealthy';
  service: string;
  version: string;
  timestamp: string;
  checks: Record<string, {
    status: string;
    [key: string]: unknown;
  }>;
}

/** Nhóm dữ liệu bờ gửi xuống tàu (khớp enum SyncScope ở backend). */
export type SyncScope = 'Catalog' | 'Crew' | 'Vessel' | 'Equipment' | 'Voyages' | 'Reports' | 'Sms';

export interface SyncPushNodeResult {
  nodeId: string;
  shipName?: string;
  imo?: string;
  queued: Partial<Record<SyncScope, number>>;
  total: number;
}

export interface SyncPushResult {
  nodes: SyncPushNodeResult[];
  total: number;
}

export interface ForcePushResponse {
  message: string;
  nodeId?: string;
  queuedItems: number;
  status: string;
  note?: string;
  nodeCount?: number;
  totalQueuedItems?: number;
  nodes?: string[];
}

export interface NodeTracker {
  nodeId: string;
  shipName?: string;
  isOnline: boolean;
  lastPushAt?: string;
  lastPullAt?: string;
  lastHeartbeatAt?: string;
  pendingOutboxCount: number;
  totalReceivedCount: number;
  totalDeliveredCount: number;
  consecutiveFailures: number;
  currentNetworkType?: string;
}

// ============================================================
// API calls
// ============================================================

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: buildAuthHeaders({ 'Content-Type': 'application/json', ...options?.headers }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API Error ${res.status}: ${body || res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const syncApi = {
  getLogs: (filters: SyncLogFilters, signal?: AbortSignal): Promise<SyncLogPage> =>
    request(`${BASE}/sync/dashboard/logs?${queryString(filters)}`, { signal }),
  getOutbox: (nodeId = '', page = 1, pageSize = 25, signal?: AbortSignal): Promise<SyncOutboxPage> =>
    request(`${BASE}/sync/dashboard/outbox?${queryString({ nodeId, page, pageSize })}`, { signal }),
  getNodes: (signal?: AbortSignal): Promise<SyncNodeDetail[]> => request(`${BASE}/sync/dashboard/nodes`, { signal }),
  getIntegrity: (): Promise<SyncIntegrity> => request(`${BASE}/sync/dashboard/integrity`),
  /** Get sync status (outbox stats + recent logs) */
  getStatus: (signal?: AbortSignal): Promise<SyncStatusResponse> =>
    request(`${BASE}/sync/status`, { signal }),

  /** Get health (if available) */
  getHealth: async (): Promise<SyncHealthCheck | null> => {
    try {
      return await request(`${BASE}/health/ready`);
    } catch {
      return null;
    }
  },

  /** Gửi các nhóm dữ liệu cho một tàu (nodeId) hoặc mọi tàu ('ALL'). Mỗi tàu chỉ nhận dữ liệu của chính nó. */
  push: (target: string, scopes: SyncScope[]): Promise<SyncPushResult> =>
    request(`${BASE}/sync/push`, { method: 'POST', body: JSON.stringify({ target, scopes }) }),

  /** Force push to specific ship node */
  forcePush: (nodeId: string): Promise<ForcePushResponse> =>
    request(`${BASE}/sync/force-push/${encodeURIComponent(nodeId)}`, { method: 'POST' }),

  /** Force push to all connected ships */
  forcePushAll: (): Promise<ForcePushResponse> =>
    request(`${BASE}/sync/force-push-all`, { method: 'POST' }),

  /** Trigger reconciliation of unsynced records */
  reconcile: (): Promise<{ message: string; count: number }> =>
    request(`${BASE}/sync/reconcile`, { method: 'POST' }),
};
