import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RefreshCw,
  Activity,
  CheckCircle2,
  XCircle,
  Server,
  Database,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Ship,
  Send,
  Loader2,
  ArrowDown,
  WifiOff,
  Settings,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Search,
  Download,
  X,
  AlertTriangle,
} from 'lucide-react';
import { syncApi } from '../../services/sync.service';
import type {
  SyncStatusResponse,
  SyncLogPage,
  SyncOutboxPage,
  SyncNodeDetail,
  SyncLogEntry,
  SyncIntegrity,
} from '../../services/sync.service';
import './SyncDashboardPage.css';

// ============================================================
// TABLE → VIETNAMESE LABEL MAP
// ============================================================
const TABLE_TO_LABEL: Record<string, string> = {
  crew_member: 'Thuyền viên',
  crew_members: 'Thuyền viên',
  crew_certificate: 'Chứng chỉ TV',
  crew_certificates: 'Chứng chỉ TV',
  certificate: 'Loại chứng chỉ',
  certificates: 'Loại chứng chỉ',
  rank: 'Chức danh',
  ranks: 'Chức danh',
  rank_certificate: 'CC chức danh',
  country: 'Quốc gia',
  countries: 'Quốc gia',
  country_certificate: 'CC quốc gia',
  service_record: 'Lý lịch công tác',
  service_records: 'Lý lịch công tác',
  travel_document: 'Giấy tờ du lịch',
  travel_documents: 'Giấy tờ du lịch',
  seafarer_document: 'Hồ sơ TV',
  seafarer_documents: 'Hồ sơ TV',
  employment_document: 'Hợp đồng LĐ',
  employment_documents: 'Hợp đồng LĐ',
  health_document: 'Sức khỏe',
  health_documents: 'Sức khỏe',
  voyage_record: 'Chuyến đi',
  noon_report: 'Báo cáo Noon',
  maritime_report: 'Báo cáo hải hành',
  maintenance_task: 'Bảo trì thiết bị',
  ship_data: 'Dữ liệu tàu',
  port: 'Cảng',
  equipment_asset: 'Thiết bị',
  equipment_group: 'Nhóm thiết bị',
  maintenance_schedule: 'Lịch bảo trì',
  material_item_catalog: 'Danh mục vật tư',
  material_category: 'Nhóm vật tư',
  position_data: 'Vị trí tàu',
  engine_data: 'Dữ liệu máy',
  engine_event: 'Sự kiện máy',
  safety_alarm: 'Cảnh báo an toàn',
  deferral_request: 'Đề nghị hoãn bảo trì',
};

const getVietLabel = (t: string) => TABLE_TO_LABEL[t] ?? t;

// ============================================================
// SHORE SYNC CONFIRM MODAL
// ============================================================
function ShoreConfirmModal({
  data,
  queue,
  syncing,
  onConfirm,
  onClose,
}: {
  data: SyncStatusResponse | null;
  queue: SyncOutboxPage | null;
  syncing: boolean;
  onConfirm: (target: string) => void;
  onClose: () => void;
}) {
  const allNodes = data?.nodes ?? [];
  const onlineNodes = allNodes.filter((n) => n.isOnline);
  const [selected, setSelected] = useState<string>('ALL');

  const groups = useMemo(
    () =>
      (queue?.groups ?? []).map((g) => ({
        label: `${getVietLabel(g.tableName)} · ${g.node === '*' ? 'Mọi tàu' : g.node}`,
        total: g.pending,
        errors: 0,
      })),
    [queue],
  );
  const totalPending = queue?.total ?? 0;
  const targetNode =
    selected === 'ALL'
      ? undefined
      : allNodes.find((n) => n.nodeId === selected);
  const targetOnline =
    selected === 'ALL'
      ? onlineNodes.length > 0
      : (targetNode?.isOnline ?? false);
  const groupTotal = groups.reduce((s, g) => s + g.total, 0);

  const fmtRelative = (d?: string) => {
    if (!d) return '—';
    const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (mins < 1) return 'Vừa xong';
    if (mins < 60) return `${mins} phút trước`;
    const h = Math.floor(mins / 60);
    return h < 24 ? `${h} giờ trước` : `${Math.floor(h / 24)} ngày trước`;
  };

  const confirmLabel = syncing
    ? 'Đang tạo hàng chờ...'
    : selected === 'ALL'
      ? `Tạo hàng chờ cho ${allNodes.length} tàu`
      : `Tạo hàng chờ: ${targetNode?.shipName ?? selected}`;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !syncing) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [syncing, onClose]);

  return (
    <div
      className="sync-confirm fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-confirm-title"
    >
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={!syncing ? onClose : undefined}
      />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-[#0b2545] to-[#16375f]">
          <div className="flex items-center gap-3 text-white">
            <Send className="w-5 h-5" />
            <span id="sync-confirm-title" className="font-semibold text-lg">
              Tạo hàng chờ đồng bộ Shore → Tàu
            </span>
            {totalPending > 0 && (
              <span className="bg-white/20 text-white text-xs px-2.5 py-1 rounded-full">
                {totalPending} bản ghi
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={syncing}
            aria-label="Đóng xác nhận"
            className="sync-confirm-close"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Offline warning */}
        {!targetOnline && (
          <div className="flex items-center gap-3 bg-amber-50 border-b border-amber-200 px-6 py-2.5">
            <WifiOff className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <span className="text-amber-700 text-sm">
              {selected === 'ALL'
                ? 'Không có tàu nào online. Dữ liệu sẽ đợi trong hàng đợi.'
                : `Tàu ${targetNode?.shipName ?? selected} hiện offline.`}
            </span>
          </div>
        )}

        {/* Two-panel body */}
        <div className="flex" style={{ minHeight: 320 }}>
          {/* LEFT — Shore outbox */}
          <div className="flex-1 px-6 py-5 border-r border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-[#dce9f8] flex items-center justify-center">
                <Server className="w-4 h-4 text-[#0b2545]" />
              </div>
              <div>
                <div className="text-xs font-bold text-gray-700 tracking-wide">
                  BỜC (SHORE)
                </div>
                <div className="text-xs text-gray-400">
                  Hàng chờ hiện tại của bờ
                </div>
              </div>
            </div>

            {groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-2" />
                <p className="text-sm text-gray-500 font-medium">
                  Hàng đợi trống
                </p>
                <p className="text-xs text-gray-400">
                  Không có dữ liệu chờ gửi
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {groups.map((g) => (
                  <div key={g.label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm text-gray-700">{g.label}</span>
                      <div className="flex items-center gap-2">
                        {g.errors > 0 && (
                          <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
                            {g.errors} lỗi
                          </span>
                        )}
                        <span className="text-xs font-semibold text-gray-600 tabular-nums w-5 text-right">
                          {g.total}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          syncing
                            ? 'bg-[#4c6a8f] animate-pulse'
                            : g.errors > 0
                              ? 'bg-amber-400'
                              : 'bg-[#1b4c7e]'
                        }`}
                        style={{
                          width: `${Math.max(4, Math.round((g.total / Math.max(1, groupTotal)) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
                <div className="border-t border-gray-100 pt-3 flex items-center justify-between">
                  <span className="text-xs text-gray-400">Tổng cộng</span>
                  <span className="text-sm font-bold text-[#16375f]">
                    {totalPending} bản ghi
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* MIDDLE — arrow */}
          <div className="flex flex-col items-center justify-center px-3 py-5 bg-gray-50/50 gap-2">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center shadow ${
                syncing
                  ? 'bg-[#1b4c7e]'
                  : targetOnline
                    ? 'bg-emerald-500'
                    : 'bg-gray-400'
              }`}
            >
              {syncing ? (
                <Loader2 className="w-4 h-4 text-white animate-spin" />
              ) : (
                <ArrowDown className="w-4 h-4 text-white" />
              )}
            </div>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={`w-0.5 h-3 rounded-full ${
                  syncing
                    ? 'bg-[#a9bdd6] animate-pulse'
                    : targetOnline
                      ? 'bg-emerald-200'
                      : 'bg-gray-200'
                }`}
                style={{ opacity: 1 - i * 0.3 }}
              />
            ))}
          </div>

          {/* RIGHT — Ship selector */}
          <div className="flex-1 px-5 py-5 flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-[#dce9f8] flex items-center justify-center">
                <Ship className="w-4 h-4 text-[#0b2545]" />
              </div>
              <div>
                <div className="text-xs font-bold text-gray-700 tracking-wide">
                  CHỌN TÀU NHẬN
                </div>
                <div className="text-xs text-gray-400">
                  Click để chọn mục tiêu
                </div>
              </div>
            </div>

            {/* "All ships" option */}
            <div
              onClick={() => !syncing && setSelected('ALL')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all mb-2 ${
                selected === 'ALL'
                  ? 'border-[#1b4c7e] bg-[#eef2f7] shadow-sm'
                  : 'border-gray-200 hover:border-[#d6dee8] hover:bg-gray-50'
              }`}
            >
              <div className="w-6 h-6 rounded-full bg-[#dce9f8] flex items-center justify-center flex-shrink-0">
                <span className="text-xs">📡</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-gray-800">
                  Tất cả tàu
                </div>
                <div className="text-xs text-gray-400">
                  {onlineNodes.length} online / {allNodes.length} tổng
                </div>
              </div>
              {selected === 'ALL' && (
                <CheckCircle2 className="w-4 h-4 text-[#1b4c7e] flex-shrink-0" />
              )}
            </div>

            {/* Individual ship cards */}
            <div
              className="flex-1 overflow-y-auto space-y-1.5"
              style={{ maxHeight: 220 }}
            >
              {allNodes.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-4">
                  Chưa có tàu nào kết nối
                </p>
              ) : (
                allNodes.map((node) => (
                  <div
                    key={node.nodeId}
                    onClick={() => !syncing && setSelected(node.nodeId)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
                      selected === node.nodeId
                        ? 'border-[#1b4c7e] bg-[#eef2f7] shadow-sm'
                        : 'border-gray-200 hover:border-[#d6dee8] hover:bg-gray-50'
                    }`}
                  >
                    <div className="relative flex-shrink-0">
                      <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center">
                        <Ship className="w-3 h-3 text-gray-500" />
                      </div>
                      <div
                        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                          node.isOnline ? 'bg-emerald-400' : 'bg-gray-300'
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-gray-800 truncate">
                        {node.shipName ?? node.nodeId}
                      </div>
                      <div className="text-xs text-gray-400">
                        {node.isOnline
                          ? `HB: ${fmtRelative(node.lastHeartbeatAt)}`
                          : 'Offline'}
                        {node.pendingOutboxCount > 0
                          ? ` • ${node.pendingOutboxCount} chờ`
                          : ''}
                      </div>
                    </div>
                    {selected === node.nodeId && (
                      <CheckCircle2 className="w-4 h-4 text-[#1b4c7e] flex-shrink-0" />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-3 text-xs text-slate-600 bg-primary-soft border-t border-accent-soft">
          Thao tác này tạo lại bản chụp dữ liệu thuyền viên, chứng chỉ và danh
          mục liên quan cho tàu nhận. Tàu sẽ lấy dữ liệu khi kết nối; hoàn tất
          chỉ được xác nhận sau khi tàu phản hồi.
        </div>
        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={syncing}
            className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50 transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={() => onConfirm(selected)}
            disabled={syncing}
            className="primary flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-medium disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {syncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

const formatTime = (value?: string) =>
  value
    ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
    : '—';
const directionLabel = (value: string) =>
  ['EDGE_TO_SHORE', 'EdgeToShore', 'Incoming'].includes(value)
    ? 'Tàu → Bờ'
    : ['SHORE_TO_EDGE', 'ShoreToEdge', 'Outgoing'].includes(value)
      ? 'Bờ → Tàu'
      : value;
const statusClass = (value: string) =>
  ['SUCCESS', 'APPLIED'].includes(value.toUpperCase())
    ? 'ok'
    : ['FAILED', 'ERROR'].includes(value.toUpperCase())
      ? 'error'
      : 'warn';
const statusLabel = (value: string) =>
  ({
    SUCCESS: 'Thành công',
    APPLIED: 'Đã áp dụng',
    CONFLICT: 'Xung đột',
    FAILED: 'Thất bại',
    ERROR: 'Lỗi',
    QUEUED: 'Chờ xử lý',
  })[value.toUpperCase()] ?? value;

function Pagination({
  page,
  totalPages,
  total,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="sync-pagination">
      <span>
        {total.toLocaleString('vi-VN')} bản ghi · Trang {page}/{totalPages}
      </span>
      <div>
        <button
          aria-label="Trang trước"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          aria-label="Trang sau"
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export const SyncDashboardPage: React.FC = () => {
  const [data, setData] = useState<SyncStatusResponse | null>(null);
  const [nodes, setNodes] = useState<SyncNodeDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [interval, setIntervalSeconds] = useState(15);
  const [refresh, setRefresh] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [tab, setTab] = useState<'logs' | 'queue'>('logs');
  const [nodeId, setNodeId] = useState('');
  const [status, setStatus] = useState('');
  const [direction, setDirection] = useState('');
  const [tableName, setTableName] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [debouncedTable, setDebouncedTable] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [logPage, setLogPage] = useState(1);
  const [queuePage, setQueuePage] = useState(1);
  const [logs, setLogs] = useState<SyncLogPage | null>(null);
  const [queue, setQueue] = useState<SyncOutboxPage | null>(null);
  const [allQueue, setAllQueue] = useState<SyncOutboxPage | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [queueLoading, setQueueLoading] = useState(false);
  const [logsError, setLogsError] = useState('');
  const [queueError, setQueueError] = useState('');
  const [detail, setDetail] = useState<SyncLogEntry | null>(null);
  const [integrity, setIntegrity] = useState<SyncIntegrity | null>(null);
  const [checking, setChecking] = useState(false);
  const [reconciling, setReconciling] = useState(false);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    try {
      const [snapshot, fleet, pending] = await Promise.all([
        syncApi.getStatus(signal),
        syncApi.getNodes(signal),
        syncApi.getOutbox('', 1, 1, signal),
      ]);
      if (signal?.aborted) return;
      setData(snapshot);
      setNodes(fleet);
      setAllQueue(pending);
      setError(null);
    } catch (err) {
      if (!signal?.aborted)
        setError(
          err instanceof Error
            ? err.message
            : 'Không tải được trạng thái đồng bộ',
        );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData, refresh]);
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(
      () => setRefresh((n) => n + 1),
      interval * 1000,
    );
    return () => window.clearInterval(timer);
  }, [autoRefresh, interval]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      setDebouncedTable(tableName);
      setLogPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search, tableName]);
  const filters = useMemo(
    () => ({
      nodeId,
      status,
      direction,
      tableName: debouncedTable,
      search: debouncedSearch,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
      page: logPage,
      pageSize,
    }),
    [
      nodeId,
      status,
      direction,
      debouncedTable,
      debouncedSearch,
      from,
      to,
      logPage,
      pageSize,
    ],
  );
  useEffect(() => {
    const controller = new AbortController();
    setLogsLoading(true);
    setLogsError('');
    syncApi
      .getLogs(filters, controller.signal)
      .then((result) => {
        setLogs(result);
        setLogPage(result.page);
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setLogsError(err.message || 'Không tải được nhật ký');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLogsLoading(false);
      });
    return () => controller.abort();
  }, [filters, refresh]);
  useEffect(() => {
    const controller = new AbortController();
    setQueueLoading(true);
    setQueueError('');
    syncApi
      .getOutbox(nodeId, queuePage, pageSize, controller.signal)
      .then((result) => {
        setQueue(result);
        setQueuePage(result.page);
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setQueueError(err.message || 'Không tải được hàng chờ');
      })
      .finally(() => {
        if (!controller.signal.aborted) setQueueLoading(false);
      });
    return () => controller.abort();
  }, [nodeId, queuePage, pageSize, refresh]);
  useEffect(() => {
    if (!detail) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDetail(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [detail]);

  const selectNode = (id: string) => {
    setNodeId(id);
    setLogPage(1);
    setQueuePage(1);
  };
  const selectedNode = nodes.find((n) => n.nodeId === nodeId);
  const totalStatus = (values: string[]) =>
    (logs?.summary ?? [])
      .filter((s) => values.includes(s.status.toUpperCase()))
      .reduce((sum, s) => sum + s.count, 0);
  const handleForcePush = async (target: string) => {
    setSyncing(true);
    setError(null);
    setNotice('');
    try {
      if (target === 'ALL') {
        const result = await syncApi.forcePushAll();
        setNotice(
          `Đã tạo hàng chờ ${result.totalQueuedItems ?? result.queuedItems ?? 0} bản ghi cho ${result.nodeCount ?? 0} tàu. Chờ tàu nhận và xác nhận.`,
        );
      } else {
        const result = await syncApi.forcePush(target);
        setNotice(
          `Đã tạo hàng chờ ${result.queuedItems} bản ghi cho ${nodes.find((n) => n.nodeId === target)?.shipName || target}. Chờ tàu nhận và xác nhận.`,
        );
      }
      setShowSyncModal(false);
      setRefresh((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tạo được hàng chờ');
    } finally {
      setSyncing(false);
    }
  };
  const checkIntegrity = async () => {
    setChecking(true);
    try {
      setIntegrity(await syncApi.getIntegrity());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kiểm tra thất bại');
    } finally {
      setChecking(false);
    }
  };
  const reconcile = async () => {
    setReconciling(true);
    setError(null);
    try {
      const result = await syncApi.reconcile();
      setNotice(
        `Đã đưa ${result.count} bản ghi thuyền viên/chứng chỉ chưa đồng bộ vào hàng chờ.`,
      );
      setIntegrity(null);
      setRefresh((n) => n + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đối soát thất bại');
    } finally {
      setReconciling(false);
    }
  };
  const exportPage = () => {
    const rows =
      tab === 'logs'
        ? [
            [
              'Hướng',
              'Nguồn',
              'Bảng',
              'Thao tác',
              'ID',
              'Trạng thái',
              'Thời gian',
              'Chi tiết',
            ],
            ...(logs?.items ?? []).map((l) => [
              directionLabel(l.direction),
              l.originNode,
              l.tableName,
              l.actionType,
              l.recordKey,
              l.status,
              formatTime(l.processedAt),
              l.conflictDetail || '',
            ]),
          ]
        : [
            ['Đích', 'Bảng', 'Thao tác', 'ID', 'Tạo lúc'],
            ...(queue?.items ?? []).map((o) => [
              o.targetNode,
              o.tableName,
              o.actionType,
              o.recordKey,
              formatTime(o.createdAt),
            ]),
          ];
    const csv = rows
      .map((row) =>
        row
          .map((value) => {
            const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
            return `"${text.replace(/"/g, '""')}"`;
          })
          .join(','),
      )
      .join('\r\n');
    const url = URL.createObjectURL(
      new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `sync-${tab}-page-${tab === 'logs' ? logPage : queuePage}.csv`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="sync-workspace">
      <header className="sync-toolbar">
        <div className="sync-heading">
          <Database size={19} />
          <div>
            <h1>Điều hành đồng bộ</h1>
            <p>Bờ ↔ Đội tàu · Cập nhật: {formatTime(data?.serverTime)}</p>
          </div>
        </div>
        <div className="sync-actions">
          <label className="sync-auto">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />{' '}
            Tự làm mới
          </label>
          <select
            aria-label="Chu kỳ làm mới màn hình"
            value={interval}
            onChange={(e) => setIntervalSeconds(Number(e.target.value))}
            disabled={!autoRefresh}
          >
            {[10, 15, 30, 60].map((n) => (
              <option key={n} value={n}>
                {n}s
              </option>
            ))}
          </select>
          <button onClick={() => setRefresh((n) => n + 1)}>
            <RefreshCw size={14} /> Làm mới
          </button>
          <button
            className="primary"
            disabled={syncing || !data || nodes.length === 0}
            onClick={() => setShowSyncModal(true)}
          >
            <Send size={14} /> Tạo hàng chờ gửi xuống
          </button>
        </div>
      </header>
      {error && (
        <div className="sync-banner error" role="alert">
          <XCircle size={16} />
          <span>{error}</span>
          <button onClick={() => setRefresh((n) => n + 1)}>Thử lại</button>
        </div>
      )}
      {notice && (
        <div className="sync-banner ok" role="status">
          <CheckCircle2 size={16} />
          <span>{notice}</span>
          <button onClick={() => setNotice('')} aria-label="Đóng thông báo">
            <X size={14} />
          </button>
        </div>
      )}
      {loading && (
        <div className="sync-banner">
          <Loader2 size={16} className="animate-spin" /> Đang tải trạng thái...
        </div>
      )}
      <div className="sync-metrics">
        <div>
          <Ship size={20} />
          <span>
            <strong>
              {nodes.filter((n) => n.isOnline).length}/{nodes.length}
            </strong>
            <small>Tàu đang kết nối</small>
          </span>
        </div>
        <div>
          <Inbox size={20} />
          <span>
            <strong>{allQueue?.total ?? '—'}</strong>
            <small>Bản ghi bờ đang chờ gửi</small>
          </span>
        </div>
        <div>
          <CheckCircle2 size={20} className="text-emerald-600" />
          <span>
            <strong>
              {logs && !logsError ? totalStatus(['SUCCESS', 'APPLIED']) : '—'}
            </strong>
            <small>Thành công theo bộ lọc</small>
          </span>
        </div>
        <div>
          <AlertTriangle size={20} className="text-amber-600" />
          <span>
            <strong>
              {logs && !logsError ? totalStatus(['CONFLICT']) : '—'} /{' '}
              {logs && !logsError ? totalStatus(['FAILED', 'ERROR']) : '—'}
            </strong>
            <small>Xung đột / Lỗi theo bộ lọc</small>
          </span>
        </div>
      </div>
      <div className="sync-layout">
        <main className="sync-panel">
          <div className="sync-panel-head">
            <div className="sync-tabs">
              <button
                className={tab === 'logs' ? 'active' : ''}
                onClick={() => setTab('logs')}
              >
                <Activity size={15} /> Nhật ký
              </button>
              <button
                className={tab === 'queue' ? 'active' : ''}
                onClick={() => {
                  setTab('queue');
                  if (nodeId === 'SHORE') selectNode('');
                }}
              >
                <Inbox size={15} /> Hàng chờ {queue ? `(${queue.total})` : ''}
              </button>
            </div>
            <button
              onClick={exportPage}
              disabled={
                tab === 'logs'
                  ? logsLoading || !!logsError || !logs?.items.length
                  : queueLoading || !!queueError || !queue?.items.length
              }
            >
              <Download size={14} /> CSV trang này
            </button>
          </div>
          <div className="sync-filters">
            <label>
              {tab === 'logs' ? 'Tàu / nguồn' : 'Tàu nhận'}
              <select
                value={nodeId}
                onChange={(e) => selectNode(e.target.value)}
              >
                <option value="">
                  {tab === 'logs' ? 'Tất cả nguồn' : 'Tất cả tàu'}
                </option>
                {tab === 'logs' && <option value="SHORE">Bờ (SHORE)</option>}
                {nodes.map((n) => (
                  <option key={n.nodeId} value={n.nodeId}>
                    {n.shipName || n.nodeId}
                  </option>
                ))}
              </select>
            </label>
            {tab === 'logs' && (
              <>
                <label>
                  Trạng thái
                  <select
                    value={status}
                    onChange={(e) => {
                      setStatus(e.target.value);
                      setLogPage(1);
                    }}
                  >
                    <option value="">Tất cả</option>
                    {['SUCCESS', 'APPLIED', 'CONFLICT', 'FAILED', 'ERROR'].map(
                      (s) => (
                        <option key={s} value={s}>
                          {statusLabel(s)}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Hướng
                  <select
                    value={direction}
                    onChange={(e) => {
                      setDirection(e.target.value);
                      setLogPage(1);
                    }}
                  >
                    <option value="">Cả hai hướng</option>
                    <option value="EDGE_TO_SHORE">Tàu → Bờ</option>
                    <option value="SHORE_TO_EDGE">Bờ → Tàu</option>
                  </select>
                </label>
                <label>
                  Bảng dữ liệu
                  <input
                    placeholder="VD: crew_certificate"
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value)}
                  />
                </label>
                <label>
                  Từ thời điểm
                  <input
                    type="datetime-local"
                    value={from}
                    onChange={(e) => {
                      setFrom(e.target.value);
                      setLogPage(1);
                    }}
                  />
                </label>
                <label>
                  Đến thời điểm
                  <input
                    type="datetime-local"
                    value={to}
                    onChange={(e) => {
                      setTo(e.target.value);
                      setLogPage(1);
                    }}
                  />
                </label>
                <label className="sync-search">
                  Tìm bản ghi
                  <div>
                    <Search size={14} />
                    <input
                      placeholder="ID, nguồn, bảng hoặc nội dung lỗi..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>
                </label>
                <button
                  onClick={() => {
                    selectNode('');
                    setStatus('');
                    setDirection('');
                    setTableName('');
                    setSearch('');
                    setFrom('');
                    setTo('');
                  }}
                >
                  Xóa bộ lọc
                </button>
              </>
            )}
            <label>
              Số dòng
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setLogPage(1);
                  setQueuePage(1);
                }}
              >
                {[25, 50, 100].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
          </div>
          {tab === 'logs' ? (
            <>
              <p className="sync-help">
                Bấm “Chi tiết” để xem đầy đủ ID và nội dung xử lý. Xung đột được
                thống kê riêng với lỗi. Bộ lọc tàu sử dụng nguồn ghi trong nhật
                ký.
              </p>
              {logsError ? (
                <div className="sync-empty text-red-600" role="alert">
                  {logsError}
                </div>
              ) : (
                <div className="sync-table-wrap" aria-busy={logsLoading}>
                  <table className="sync-table">
                    <thead>
                      <tr>
                        <th>Hướng</th>
                        <th>Nguồn</th>
                        <th>Loại dữ liệu</th>
                        <th>Thao tác</th>
                        <th>ID bản ghi</th>
                        <th>Trạng thái</th>
                        <th>Thời gian</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {(logs?.items ?? []).map((l, index) => (
                        <tr key={l.id ?? index}>
                          <td>{directionLabel(l.direction)}</td>
                          <td title={l.originNode}>
                            {nodes.find((n) => n.nodeId === l.originNode)
                              ?.shipName || l.originNode}
                          </td>
                          <td title={l.tableName}>
                            {getVietLabel(l.tableName)}
                          </td>
                          <td>{l.actionType}</td>
                          <td className="mono" title={l.recordKey}>
                            {l.recordKey.length > 16
                              ? `${l.recordKey.slice(0, 16)}…`
                              : l.recordKey}
                          </td>
                          <td>
                            <span
                              className={`sync-badge ${statusClass(l.status)}`}
                            >
                              {statusLabel(l.status)}
                            </span>
                          </td>
                          <td>{formatTime(l.processedAt)}</td>
                          <td>
                            <button onClick={() => setDetail(l)}>
                              Chi tiết
                            </button>
                          </td>
                        </tr>
                      ))}
                      {!logs?.items.length && (
                        <tr>
                          <td colSpan={8} className="sync-empty">
                            {logsLoading
                              ? 'Đang tải nhật ký...'
                              : 'Không có nhật ký phù hợp với bộ lọc.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              {logs && !logsError && (
                <Pagination
                  page={logs.page}
                  totalPages={logs.totalPages}
                  total={logs.total}
                  onChange={setLogPage}
                />
              )}
            </>
          ) : (
            <>
              <p className="sync-help">
                Hàng chờ bờ → tàu. Bản ghi phát cho mọi tàu được tính riêng theo
                xác nhận của từng tàu; danh sách toàn đội chỉ đếm mỗi bản ghi
                một lần.
              </p>
              {queueError ? (
                <div className="sync-empty text-red-600" role="alert">
                  {queueError}
                </div>
              ) : (
                <div className="sync-table-wrap" aria-busy={queueLoading}>
                  <table className="sync-table">
                    <thead>
                      <tr>
                        <th>Đích nhận</th>
                        <th>Loại dữ liệu</th>
                        <th>Thao tác</th>
                        <th>ID đầy đủ</th>
                        <th>Chờ từ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(queue?.items ?? []).map((o) => (
                        <tr key={o.id}>
                          <td>
                            {o.targetNode === '*'
                              ? 'Mọi tàu (broadcast)'
                              : nodes.find((n) => n.nodeId === o.targetNode)
                                  ?.shipName || o.targetNode}
                          </td>
                          <td>{getVietLabel(o.tableName)}</td>
                          <td>{o.actionType}</td>
                          <td className="mono">{o.recordKey}</td>
                          <td>{formatTime(o.createdAt)}</td>
                        </tr>
                      ))}
                      {!queue?.items.length && (
                        <tr>
                          <td colSpan={5} className="sync-empty">
                            {queueLoading
                              ? 'Đang tải hàng chờ...'
                              : 'Không có bản ghi đang chờ cho phạm vi này.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              {queue && !queueError && (
                <Pagination
                  page={queue.page}
                  totalPages={queue.totalPages}
                  total={queue.total}
                  onChange={setQueuePage}
                />
              )}
            </>
          )}
        </main>
        <aside className="sync-sidebar">
          <section className="sync-panel">
            <div className="sync-panel-head">
              <h2>
                <Ship size={15} /> Đội tàu
              </h2>
              <span>{nodes.length} tàu</span>
            </div>
            <div className="sync-fleet">
              {nodes.map((n) => (
                <button
                  key={n.nodeId}
                  className={`sync-vessel ${nodeId === n.nodeId ? 'selected' : ''}`}
                  onClick={() =>
                    selectNode(nodeId === n.nodeId ? '' : n.nodeId)
                  }
                >
                  <span className={`sync-dot ${n.isOnline ? 'online' : ''}`} />
                  <span>
                    <strong>{n.shipName || n.nodeId}</strong>
                    <small>
                      {n.currentNetworkType || 'Chưa báo mạng'} ·{' '}
                      {n.isOnline ? 'Online' : 'Offline'}
                    </small>
                  </span>
                  <span
                    className={`sync-badge ${n.health.consecutiveFailures ? 'error' : 'ok'}`}
                  >
                    {n.health.consecutiveFailures
                      ? `${n.health.consecutiveFailures} lỗi`
                      : 'Ổn định'}
                  </span>
                </button>
              ))}
              {!nodes.length && (
                <p className="sync-help">Chưa có tàu kết nối.</p>
              )}
            </div>
            {selectedNode && (
              <div className="sync-node-detail">
                <strong>{selectedNode.shipName || selectedNode.nodeId}</strong>
                <dl>
                  <dt>Node</dt>
                  <dd className="mono">{selectedNode.nodeId}</dd>
                  <dt>Heartbeat</dt>
                  <dd>{formatTime(selectedNode.health.lastHeartbeat)}</dd>
                  <dt>Tàu gửi lên</dt>
                  <dd>{formatTime(selectedNode.push.lastAt)}</dd>
                  <dt>Tàu lấy xuống</dt>
                  <dd>{formatTime(selectedNode.pull.lastAt)}</dd>
                  <dt>Tổng nhận / giao</dt>
                  <dd>
                    {selectedNode.push.totalReceived} /{' '}
                    {selectedNode.pull.totalDelivered}
                  </dd>
                  <dt>Chờ gửi xuống</dt>
                  <dd>{queue?.total ?? '—'}</dd>
                  <dt>Đăng ký</dt>
                  <dd>
                    {selectedNode.security.isRevoked
                      ? 'Đã thu hồi'
                      : selectedNode.security.isRegistered
                        ? 'Đã đăng ký'
                        : 'Chưa đăng ký'}
                  </dd>
                </dl>
                {selectedNode.health.lastError && (
                  <p className="sync-node-error">
                    {selectedNode.health.lastError}
                    <br />
                    <small>{formatTime(selectedNode.health.lastErrorAt)}</small>
                  </p>
                )}
              </div>
            )}
          </section>
          <section className="sync-panel">
            <div className="sync-panel-head">
              <h2>
                <Inbox size={15} /> Phân bố hàng chờ
              </h2>
            </div>
            <div className="sync-queue-summary">
              {(queue?.groups ?? []).map((g) => (
                <div key={`${g.node}:${g.tableName}`}>
                  <span>
                    {getVietLabel(g.tableName)}
                    <small>
                      {g.node === '*'
                        ? 'Mọi tàu'
                        : nodes.find((n) => n.nodeId === g.node)?.shipName ||
                          g.node}{' '}
                      · Từ {formatTime(g.oldestAt)}
                    </small>
                  </span>
                  <strong>{g.pending}</strong>
                </div>
              ))}
              {!queue?.groups.length && (
                <p>
                  {queueError ||
                    (queueLoading ? 'Đang tải...' : 'Hàng chờ trống')}
                </p>
              )}
            </div>
          </section>
          <section className="sync-panel">
            <div className="sync-panel-head">
              <h2>
                <Settings size={15} /> Kiểm tra dữ liệu
              </h2>
            </div>
            <div className="sync-tools">
              <button onClick={checkIntegrity} disabled={checking}>
                <Activity size={14} />{' '}
                {checking ? 'Đang kiểm tra...' : 'Kiểm tra dữ liệu bờ'}
              </button>
              <button onClick={reconcile} disabled={reconciling}>
                <RefreshCw size={14} />{' '}
                {reconciling
                  ? 'Đang đối soát...'
                  : 'Đưa dữ liệu chưa đồng bộ vào hàng chờ'}
              </button>
              <p className="sync-help">
                Áp dụng cho thuyền viên và chứng chỉ tại bờ. Chu kỳ làm mới chỉ
                cập nhật màn hình.
              </p>
              {integrity && (
                <div className="sync-integrity">
                  <strong>
                    {integrity.healthy ? 'Kiểm tra đạt' : 'Cần kiểm tra thêm'}
                  </strong>
                  <small>{formatTime(integrity.timestamp)}</small>
                  <dl>
                    <dt>Thuyền viên chưa đồng bộ</dt>
                    <dd>{integrity.syncGaps.unsyncedCrew}</dd>
                    <dt>Chứng chỉ chưa đồng bộ</dt>
                    <dd>{integrity.syncGaps.unsyncedCerts}</dd>
                    <dt>Chứng chỉ thiếu thuyền viên</dt>
                    <dd>{integrity.syncGaps.orphanCertificates}</dd>
                    <dt>Hàng chờ quá 7 ngày</dt>
                    <dd>{integrity.syncGaps.staleOutboxItems}</dd>
                  </dl>
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
      {showSyncModal && (
        <ShoreConfirmModal
          data={data}
          queue={allQueue}
          syncing={syncing}
          onConfirm={handleForcePush}
          onClose={() => setShowSyncModal(false)}
        />
      )}
      {detail && (
        <div className="sync-dialog-backdrop" onClick={() => setDetail(null)}>
          <section
            className="sync-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="sync-log-detail"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sync-panel-head">
              <h2 id="sync-log-detail">Chi tiết đồng bộ</h2>
              <button
                autoFocus
                aria-label="Đóng chi tiết"
                onClick={() => setDetail(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="sync-dialog-body">
              <dl>
                <dt>Hướng</dt>
                <dd>{directionLabel(detail.direction)}</dd>
                <dt>Nguồn</dt>
                <dd>{detail.originNode}</dd>
                <dt>Bảng</dt>
                <dd>{detail.tableName}</dd>
                <dt>ID bản ghi</dt>
                <dd className="mono">{detail.recordKey}</dd>
                <dt>Thao tác</dt>
                <dd>{detail.actionType}</dd>
                <dt>Trạng thái</dt>
                <dd>
                  {statusLabel(detail.status)} ({detail.status})
                </dd>
                <dt>Thời gian</dt>
                <dd>{formatTime(detail.processedAt)}</dd>
              </dl>
              <h3>Nội dung xử lý / xung đột</h3>
              <pre>
                {detail.conflictDetail ||
                  'Máy chủ không ghi nội dung chi tiết cho bản ghi này.'}
              </pre>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
