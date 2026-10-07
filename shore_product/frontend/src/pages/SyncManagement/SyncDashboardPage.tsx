import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity, AlertTriangle, ArrowDownLeft, ArrowUpRight, CheckCircle2, Eye, Inbox, Loader2,
  RefreshCw, Search, Send, ServerCog, Ship, ShieldCheck, WifiOff, X, XCircle,
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
import { Button, DataTable, Modal, PageHeader, TableActions, TableIconButton, type Column } from '../../components/common';

// ============================================================
// Nhãn tiếng Việt
// ============================================================
const TABLE_TO_LABEL: Record<string, string> = {
  crew_member: 'Thuyền viên',
  crew_members: 'Thuyền viên',
  crew_certificate: 'Chứng chỉ thuyền viên',
  crew_certificates: 'Chứng chỉ thuyền viên',
  crew_logbook_entry: 'Sổ thuyền viên',
  certificate: 'Loại chứng chỉ',
  certificates: 'Loại chứng chỉ',
  rank: 'Chức danh',
  ranks: 'Chức danh',
  rank_certificate: 'Chứng chỉ theo chức danh',
  country: 'Quốc gia',
  countries: 'Quốc gia',
  country_certificate: 'Chứng chỉ theo quốc gia',
  service_record: 'Lý lịch công tác',
  service_records: 'Lý lịch công tác',
  travel_document: 'Giấy tờ đi lại',
  travel_documents: 'Giấy tờ đi lại',
  seafarer_document: 'Sổ thuyền viên',
  seafarer_documents: 'Sổ thuyền viên',
  employment_document: 'Hợp đồng lao động',
  employment_documents: 'Hợp đồng lao động',
  health_document: 'Giấy sức khỏe',
  health_documents: 'Giấy sức khỏe',
  voyage_record: 'Chuyến đi',
  noon_report: 'Báo cáo trưa',
  maritime_report: 'Báo cáo hải hành',
  maintenance_task: 'Công việc bảo dưỡng',
  ship_data: 'Thông số tàu',
  port: 'Cảng',
  report_type: 'Loại báo cáo',
  equipment_asset: 'Thiết bị',
  equipment_group: 'Nhóm thiết bị',
  maintenance_schedule: 'Lịch bảo dưỡng',
  material_item_catalog: 'Danh mục vật tư',
  material_category: 'Nhóm vật tư',
  vessel_material_definition: 'Vật tư của tàu',
  position_data: 'Vị trí tàu',
  engine_data: 'Dữ liệu máy',
  engine_event: 'Sự kiện máy',
  safety_alarm: 'Cảnh báo an toàn',
  deferral_request: 'Đề nghị hoãn bảo dưỡng',
  task_deferral_request: 'Đề nghị hoãn bảo dưỡng',
};

const getVietLabel = (t: string) => TABLE_TO_LABEL[t] ?? t;

const ACTION_LABEL: Record<string, string> = {
  CREATE: 'Tạo mới', UPDATE: 'Cập nhật', DELETE: 'Xóa', SNAPSHOT: 'Bản chụp', CLEAR_EDGE_CHANGES: 'Xác nhận thay đổi',
  '0': 'Tạo mới', '1': 'Cập nhật', '2': 'Xóa', '3': 'Bản chụp',
};
const actionLabel = (a: string) => ACTION_LABEL[String(a).toUpperCase()] ?? a;

const formatTime = (value?: string) =>
  value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—';

const fmtRelative = (d?: string) => {
  if (!d) return '—';
  const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (mins < 1) return 'vừa xong';
  if (mins < 60) return `${mins} phút trước`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h} giờ trước` : `${Math.floor(h / 24)} ngày trước`;
};

const isIncoming = (value: string) => ['EDGE_TO_SHORE', 'EdgeToShore', 'Incoming'].includes(value);
const isOutgoing = (value: string) => ['SHORE_TO_EDGE', 'ShoreToEdge', 'Outgoing'].includes(value);
const directionLabel = (value: string) => (isIncoming(value) ? 'Tàu → Bờ' : isOutgoing(value) ? 'Bờ → Tàu' : value);

const STATUS: Record<string, { label: string; tone: string }> = {
  SUCCESS: { label: 'Thành công', tone: 'bg-emerald-50 text-emerald-700' },
  APPLIED: { label: 'Đã áp dụng', tone: 'bg-emerald-50 text-emerald-700' },
  CONFLICT: { label: 'Xung đột', tone: 'bg-amber-50 text-amber-700' },
  FAILED: { label: 'Thất bại', tone: 'bg-red-50 text-red-700' },
  ERROR: { label: 'Lỗi', tone: 'bg-red-50 text-red-700' },
  QUEUED: { label: 'Chờ xử lý', tone: 'bg-slate-100 text-slate-600' },
};
const statusLabel = (value: string) => STATUS[value.toUpperCase()]?.label ?? value;
const StatusPill: React.FC<{ value: string }> = ({ value }) => (
  <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS[value.toUpperCase()]?.tone ?? 'bg-amber-50 text-amber-700'}`}>
    {statusLabel(value)}
  </span>
);

const DirectionPill: React.FC<{ value: string }> = ({ value }) => (
  <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${
    isIncoming(value) ? 'bg-sky-50 text-sky-700' : isOutgoing(value) ? 'bg-violet-50 text-violet-700' : 'bg-slate-100 text-slate-600'
  }`}>
    {isIncoming(value) ? <ArrowDownLeft className="h-3 w-3" aria-hidden="true" /> : isOutgoing(value) ? <ArrowUpRight className="h-3 w-3" aria-hidden="true" /> : null}
    {directionLabel(value)}
  </span>
);

const filterCls = 'h-9 rounded-md border border-line bg-surface px-2.5 text-sm text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25';

const Card: React.FC<{ title: string; icon: React.ReactNode; aside?: React.ReactNode; children: React.ReactNode }> = ({ title, icon, aside, children }) => (
  <section className="overflow-hidden rounded-md border border-grid-strong bg-surface">
    <header className="flex items-center gap-2 border-b border-grid px-4 py-2.5">
      <span className="text-primary [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      {aside && <span className="ml-auto text-[13px] text-ink-muted">{aside}</span>}
    </header>
    {children}
  </section>
);

// ============================================================
// Hộp xác nhận: tạo lại hàng chờ bờ → tàu
// ============================================================
function ShoreConfirmModal({
  data, queue, syncing, onConfirm, onClose,
}: {
  data: SyncStatusResponse | null;
  queue: SyncOutboxPage | null;
  syncing: boolean;
  onConfirm: (target: string) => void;
  onClose: () => void;
}) {
  const allNodes = data?.nodes ?? [];
  const onlineNodes = allNodes.filter(n => n.isOnline);
  const [selected, setSelected] = useState<string>('ALL');

  const groups = (queue?.groups ?? []).map(g => ({
    label: getVietLabel(g.tableName),
    target: g.node === '*' ? 'Mọi tàu' : g.node,
    total: g.pending,
  }));
  const totalPending = queue?.total ?? 0;
  const maxGroup = Math.max(1, ...groups.map(g => g.total));
  const targetNode = selected === 'ALL' ? undefined : allNodes.find(n => n.nodeId === selected);
  const targetOnline = selected === 'ALL' ? onlineNodes.length > 0 : (targetNode?.isOnline ?? false);

  const option = (key: string, title: string, sub: string, online: boolean | null) => {
    const on = selected === key;
    return (
      <button
        key={key}
        type="button"
        disabled={syncing}
        onClick={() => setSelected(key)}
        aria-pressed={on}
        className={`flex w-full items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors ${
          on ? 'border-primary bg-primary-soft' : 'border-line hover:border-accent/40 hover:bg-primary-soft/50'
        }`}
      >
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-white">
          {key === 'ALL' ? <ServerCog className="h-4 w-4" aria-hidden="true" /> : <Ship className="h-4 w-4" aria-hidden="true" />}
          {online !== null && (
            <i className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface ${online ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-ink">{title}</span>
          <span className="block truncate text-[13px] text-ink-muted">{sub}</span>
        </span>
        {on && <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
      </button>
    );
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      icon={<Send />}
      title="Gửi lại dữ liệu xuống tàu"
      subtitle="Tạo lại bản chụp thuyền viên, chứng chỉ và danh mục liên quan cho tàu nhận."
      busy={syncing}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={syncing}>Hủy</Button>
          <Button icon={<Send className="h-4 w-4" />} loading={syncing} onClick={() => onConfirm(selected)}>
            {selected === 'ALL' ? `Gửi cho ${allNodes.length} tàu` : `Gửi cho ${targetNode?.shipName ?? selected}`}
          </Button>
        </>
      }
    >
      {!targetOnline && (
        <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          {selected === 'ALL'
            ? 'Hiện không có tàu nào trực tuyến. Dữ liệu sẽ chờ trong hàng đợi tới khi tàu kết nối.'
            : `Tàu ${targetNode?.shipName ?? selected} đang ngoại tuyến. Dữ liệu sẽ chờ tới khi tàu kết nối.`}
        </div>
      )}

      <div className="grid grid-cols-2 gap-5">
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Chọn tàu nhận</p>
          <div className="space-y-2">
            {option('ALL', 'Tất cả tàu', `${onlineNodes.length} trực tuyến / ${allNodes.length} tàu`, null)}
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {allNodes.length === 0
                ? <p className="py-4 text-center text-[13px] text-ink-muted">Chưa có tàu nào kết nối.</p>
                : allNodes.map(n => option(
                  n.nodeId,
                  n.shipName ?? n.nodeId,
                  `${n.isOnline ? `Liên lạc ${fmtRelative(n.lastHeartbeatAt)}` : 'Ngoại tuyến'}${n.pendingOutboxCount > 0 ? ` · ${n.pendingOutboxCount} chờ gửi` : ''}`,
                  n.isOnline,
                ))}
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <p className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-ink-muted">
            Hàng chờ hiện tại của bờ
            <span className="normal-case tracking-normal text-ink">{totalPending.toLocaleString('vi-VN')} bản ghi</span>
          </p>
          {groups.length === 0 ? (
            <div className="flex flex-col items-center gap-1 rounded-md border border-dashed border-grid-strong py-8 text-[13px] text-ink-muted">
              <CheckCircle2 className="h-6 w-6 text-emerald-500" aria-hidden="true" />
              Hàng chờ trống
            </div>
          ) : (
            <ul className="space-y-2.5">
              {groups.map(g => (
                <li key={`${g.label}:${g.target}`}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-[13px]">
                    <span className="truncate text-ink">{g.label} <span className="text-ink-muted">· {g.target}</span></span>
                    <strong className="tabular-nums text-ink">{g.total}</strong>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-canvas">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, Math.round((g.total / maxGroup) * 100))}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="mt-4 border-t border-grid pt-3 text-[13px] text-ink-muted">
        Tàu lấy dữ liệu ở lần kết nối tới. Việc gửi chỉ được tính là hoàn tất khi tàu xác nhận đã nhận.
      </p>
    </Modal>
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

  const shipName = (node: string) => nodes.find(n => n.nodeId === node)?.shipName || node;
  const hasLogFilter = !!(nodeId || status || direction || tableName || search || from || to);
  const clearLogFilters = () => {
    selectNode('');
    setStatus('');
    setDirection('');
    setTableName('');
    setSearch('');
    setFrom('');
    setTo('');
  };

  const logColumns: Column<SyncLogEntry>[] = [
    { key: 'direction', header: 'Hướng', width: 110, align: 'center', filter: false, value: l => directionLabel(l.direction), render: l => <DirectionPill value={l.direction} /> },
    { key: 'origin', header: 'Nguồn', width: 170, filter: false, value: l => shipName(l.originNode), render: l => <span title={l.originNode}>{shipName(l.originNode)}</span> },
    { key: 'table', header: 'Loại dữ liệu', filter: false, value: l => getVietLabel(l.tableName), render: l => <span title={l.tableName}>{getVietLabel(l.tableName)}</span> },
    { key: 'action', header: 'Thao tác', width: 110, align: 'center', filter: false, value: l => actionLabel(l.actionType) },
    { key: 'key', header: 'ID bản ghi', width: 170, filter: false, truncate: true, value: l => l.recordKey, render: l => <span className="font-mono text-xs" title={l.recordKey}>{l.recordKey}</span> },
    { key: 'status', header: 'Trạng thái', width: 120, align: 'center', filter: false, value: l => statusLabel(l.status), render: l => <StatusPill value={l.status} /> },
    { key: 'time', header: 'Thời gian', width: 160, align: 'center', filter: false, value: l => l.processedAt, exportValue: l => formatTime(l.processedAt), render: l => formatTime(l.processedAt) },
    {
      key: 'actions', header: 'Chi tiết', width: 80, align: 'center', exportable: false,
      render: l => <TableActions><TableIconButton label={`Xem chi tiết ${l.recordKey}`} icon={<Eye />} onClick={() => setDetail(l)} /></TableActions>,
    },
  ];

  type QueueItem = SyncOutboxPage['items'][number];
  const queueColumns: Column<QueueItem>[] = [
    { key: 'target', header: 'Tàu nhận', width: 200, filter: false, value: o => (o.targetNode === '*' ? 'Mọi tàu' : shipName(o.targetNode)) },
    { key: 'table', header: 'Loại dữ liệu', filter: false, value: o => getVietLabel(o.tableName), render: o => <span title={o.tableName}>{getVietLabel(o.tableName)}</span> },
    { key: 'action', header: 'Thao tác', width: 110, align: 'center', filter: false, value: o => actionLabel(o.actionType) },
    { key: 'key', header: 'ID bản ghi', width: 260, filter: false, truncate: true, value: o => o.recordKey, render: o => <span className="font-mono text-xs" title={o.recordKey}>{o.recordKey}</span> },
    { key: 'created', header: 'Chờ từ', width: 160, align: 'center', filter: false, value: o => o.createdAt, exportValue: o => formatTime(o.createdAt), render: o => formatTime(o.createdAt) },
  ];

  const onlineCount = nodes.filter(n => n.isOnline).length;
  const metric = (icon: React.ReactNode, tone: string, value: React.ReactNode, label: string) => (
    <div className="flex min-w-0 items-center gap-3 px-4 py-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md [&>svg]:h-[18px] [&>svg]:w-[18px] ${tone}`}>{icon}</span>
      <div className="min-w-0">
        <p className="text-lg font-bold tabular-nums leading-6 text-ink">{value}</p>
        <p className="truncate text-[13px] text-ink-muted">{label}</p>
      </div>
    </div>
  );

  const nodeSelect = (
    <select aria-label={tab === 'logs' ? 'Tàu / nguồn' : 'Tàu nhận'} value={nodeId} onChange={e => selectNode(e.target.value)} className={filterCls}>
      <option value="">{tab === 'logs' ? 'Mọi nguồn' : 'Mọi tàu'}</option>
      {tab === 'logs' && <option value="SHORE">Bờ</option>}
      {nodes.map(n => <option key={n.nodeId} value={n.nodeId}>{n.shipName || n.nodeId}</option>)}
    </select>
  );

  return (
    <div className="px-6 py-5">
      <PageHeader
        icon={<RefreshCw />}
        title="Đồng bộ dữ liệu"
        description={<>Bờ ↔ đội tàu · cập nhật lúc {formatTime(data?.serverTime)}</>}
        actions={
          <>
            <label className="inline-flex items-center gap-2 text-[13px] text-ink">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={autoRefresh} onChange={e => setAutoRefresh(e.target.checked)} />
              Tự làm mới
            </label>
            <select aria-label="Chu kỳ làm mới màn hình" value={interval} onChange={e => setIntervalSeconds(Number(e.target.value))} disabled={!autoRefresh} className={`${filterCls} disabled:opacity-50`}>
              {[10, 15, 30, 60].map(n => <option key={n} value={n}>mỗi {n} giây</option>)}
            </select>
            <Button variant="secondary" icon={<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />} onClick={() => setRefresh(n => n + 1)}>Làm mới</Button>
            <Button icon={<Send className="h-4 w-4" />} disabled={syncing || !data || nodes.length === 0} onClick={() => setShowSyncModal(true)}>
              Gửi lại dữ liệu xuống tàu
            </Button>
          </>
        }
      />

      {error && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-700" role="alert">
          <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{error}</span>
          <Button size="sm" variant="secondary" onClick={() => setRefresh(n => n + 1)}>Thử lại</Button>
        </div>
      )}
      {notice && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800" role="status">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label="Đóng thông báo" className="rounded p-0.5 hover:bg-emerald-100"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Chỉ số nhanh */}
      <div className="mb-4 grid grid-cols-4 divide-x divide-grid overflow-hidden rounded-md border border-grid-strong bg-surface">
        {metric(<Ship />, 'bg-sky-50 text-sky-600', loading && !nodes.length ? '—' : `${onlineCount}/${nodes.length}`, 'Tàu đang trực tuyến')}
        {metric(<Inbox />, 'bg-primary-soft text-primary', allQueue?.total?.toLocaleString('vi-VN') ?? '—', 'Bản ghi bờ đang chờ gửi')}
        {metric(<CheckCircle2 />, 'bg-emerald-50 text-emerald-600', logs && !logsError ? totalStatus(['SUCCESS', 'APPLIED']).toLocaleString('vi-VN') : '—', 'Thành công (theo bộ lọc)')}
        {metric(<AlertTriangle />, 'bg-amber-50 text-amber-600',
          logs && !logsError ? `${totalStatus(['CONFLICT'])} / ${totalStatus(['FAILED', 'ERROR'])}` : '—', 'Xung đột / lỗi (theo bộ lọc)')}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-4">
        {/* ── Nhật ký / hàng chờ ── */}
        <div className="min-w-0">
          <div className="mb-3 flex gap-1 border-b border-line" role="tablist" aria-label="Nội dung đồng bộ">
            {([
              { id: 'logs' as const, label: 'Nhật ký đồng bộ', icon: <Activity />, count: logs?.total },
              { id: 'queue' as const, label: 'Hàng chờ gửi xuống', icon: <Inbox />, count: queue?.total },
            ]).map(t => {
              const on = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => { setTab(t.id); if (t.id === 'queue' && nodeId === 'SHORE') selectNode(''); }}
                  className={`-mb-px inline-flex h-10 items-center gap-2 border-b-2 px-3.5 text-sm transition-colors [&>svg]:h-4 [&>svg]:w-4 ${
                    on ? 'border-primary font-semibold text-primary' : 'border-transparent text-ink-muted hover:border-line hover:text-ink'
                  }`}
                >
                  {t.icon}{t.label}
                  {t.count !== undefined && (
                    <span className={`rounded-full px-1.5 text-xs tabular-nums ${on ? 'bg-primary-soft text-primary' : 'bg-canvas text-ink-light'}`}>
                      {t.count.toLocaleString('vi-VN')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {tab === 'logs' ? (
            <DataTable
              columns={logColumns}
              data={logs?.items ?? []}
              rowKey={l => l.id ?? `${l.tableName}:${l.recordKey}:${l.processedAt}`}
              loading={logsLoading && !logs}
              error={logsError || null}
              searchable={false}
              itemLabel="bản ghi"
              emptyMessage="Không có nhật ký phù hợp với bộ lọc."
              exportOptions={{ fileName: `nhat-ky-dong-bo-trang-${logPage}`, title: 'NHẬT KÝ ĐỒNG BỘ' }}
              onRowClick={setDetail}
              minWidth={1000}
              pageSizeOptions={[25, 50, 100]}
              serverPagination={{
                page: logs?.page ?? logPage,
                pageSize,
                total: logs?.total ?? 0,
                onPageChange: setLogPage,
                onPageSizeChange: size => { setPageSize(size); setLogPage(1); setQueuePage(1); },
              }}
              toolbarLeft={
                <div className="flex flex-wrap items-center gap-2">
                  <label className="relative w-[260px]">
                    <span className="sr-only">Tìm bản ghi</span>
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-light" aria-hidden="true" />
                    <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm ID, nguồn, nội dung lỗi..."
                      className="h-9 w-full rounded-md border border-line bg-surface pl-8 pr-3 text-sm text-ink placeholder:text-ink-light focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25" />
                  </label>
                  {nodeSelect}
                  <select aria-label="Trạng thái" value={status} onChange={e => { setStatus(e.target.value); setLogPage(1); }} className={filterCls}>
                    <option value="">Mọi trạng thái</option>
                    {['SUCCESS', 'APPLIED', 'CONFLICT', 'FAILED', 'ERROR'].map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
                  </select>
                  <select aria-label="Hướng" value={direction} onChange={e => { setDirection(e.target.value); setLogPage(1); }} className={filterCls}>
                    <option value="">Cả hai hướng</option>
                    <option value="EDGE_TO_SHORE">Tàu → Bờ</option>
                    <option value="SHORE_TO_EDGE">Bờ → Tàu</option>
                  </select>
                  <input aria-label="Bảng dữ liệu" placeholder="Bảng, vd. crew_member" value={tableName} onChange={e => setTableName(e.target.value)} className={`${filterCls} w-44`} />
                  <input aria-label="Từ thời điểm" title="Từ thời điểm" type="datetime-local" value={from} onChange={e => { setFrom(e.target.value); setLogPage(1); }} className={filterCls} />
                  <input aria-label="Đến thời điểm" title="Đến thời điểm" type="datetime-local" value={to} onChange={e => { setTo(e.target.value); setLogPage(1); }} className={filterCls} />
                  {hasLogFilter && <button type="button" onClick={clearLogFilters} className="text-[13px] font-medium text-primary hover:underline">Bỏ lọc</button>}
                </div>
              }
            />
          ) : (
            <DataTable
              columns={queueColumns}
              data={queue?.items ?? []}
              rowKey={o => o.id}
              loading={queueLoading && !queue}
              error={queueError || null}
              searchable={false}
              itemLabel="bản ghi"
              emptyMessage="Không có bản ghi nào đang chờ gửi cho phạm vi này."
              exportOptions={{ fileName: `hang-cho-trang-${queuePage}`, title: 'HÀNG CHỜ GỬI XUỐNG TÀU' }}
              minWidth={900}
              pageSizeOptions={[25, 50, 100]}
              serverPagination={{
                page: queue?.page ?? queuePage,
                pageSize,
                total: queue?.total ?? 0,
                onPageChange: setQueuePage,
                onPageSizeChange: size => { setPageSize(size); setLogPage(1); setQueuePage(1); },
              }}
              toolbarLeft={
                <div className="flex flex-wrap items-center gap-2">
                  {nodeSelect}
                  <span className="text-[13px] text-ink-muted">Bản ghi gửi cho mọi tàu được tính theo xác nhận của từng tàu.</span>
                </div>
              }
            />
          )}
        </div>

        {/* ── Cột phải ── */}
        <aside className="flex min-w-0 flex-col gap-4">
          <Card title="Đội tàu" icon={<Ship />} aside={`${nodes.length} tàu`}>
            <ul className="divide-y divide-grid">
              {nodes.map(n => {
                const on = nodeId === n.nodeId;
                return (
                  <li key={n.nodeId}>
                    <button
                      type="button"
                      onClick={() => selectNode(on ? '' : n.nodeId)}
                      aria-pressed={on}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors ${on ? 'bg-primary-soft' : 'hover:bg-primary-soft/50'}`}
                    >
                      <i className={`h-2.5 w-2.5 shrink-0 rounded-full ${n.isOnline ? 'bg-emerald-500' : 'bg-slate-300'}`} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{n.shipName || n.nodeId}</span>
                        <span className="block truncate text-[13px] text-ink-muted">
                          {n.isOnline ? 'Trực tuyến' : 'Ngoại tuyến'} · {n.currentNetworkType || 'chưa báo mạng'}
                        </span>
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${n.health.consecutiveFailures ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                        {n.health.consecutiveFailures ? `${n.health.consecutiveFailures} lỗi` : 'Ổn định'}
                      </span>
                    </button>
                  </li>
                );
              })}
              {!nodes.length && <li className="px-4 py-6 text-center text-[13px] text-ink-muted">Chưa có tàu nào kết nối.</li>}
            </ul>
            {selectedNode && (
              <div className="border-t border-grid bg-canvas/60 px-4 py-3">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
                  <dt className="text-ink-muted">Mã node</dt><dd className="truncate font-mono text-xs text-ink" title={selectedNode.nodeId}>{selectedNode.nodeId}</dd>
                  <dt className="text-ink-muted">Liên lạc cuối</dt><dd className="text-ink">{formatTime(selectedNode.health.lastHeartbeat)}</dd>
                  <dt className="text-ink-muted">Tàu gửi lên</dt><dd className="text-ink">{formatTime(selectedNode.push.lastAt)}</dd>
                  <dt className="text-ink-muted">Tàu lấy xuống</dt><dd className="text-ink">{formatTime(selectedNode.pull.lastAt)}</dd>
                  <dt className="text-ink-muted">Đã nhận / đã giao</dt><dd className="tabular-nums text-ink">{selectedNode.push.totalReceived} / {selectedNode.pull.totalDelivered}</dd>
                  <dt className="text-ink-muted">Chờ gửi xuống</dt><dd className="tabular-nums text-ink">{queue?.total ?? '—'}</dd>
                  <dt className="text-ink-muted">Đăng ký</dt>
                  <dd className="text-ink">{selectedNode.security.isRevoked ? 'Đã thu hồi' : selectedNode.security.isRegistered ? 'Đã đăng ký' : 'Chưa đăng ký'}</dd>
                </dl>
                {selectedNode.health.lastError && (
                  <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-[13px] text-red-700">
                    {selectedNode.health.lastError}
                    <span className="mt-0.5 block text-xs text-red-600/80">{formatTime(selectedNode.health.lastErrorAt)}</span>
                  </p>
                )}
              </div>
            )}
          </Card>

          <Card title="Phân bố hàng chờ" icon={<Inbox />}>
            <ul className="divide-y divide-grid">
              {(queue?.groups ?? []).map(g => (
                <li key={`${g.node}:${g.tableName}`} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-ink">{getVietLabel(g.tableName)}</span>
                    <span className="block truncate text-[13px] text-ink-muted">
                      {g.node === '*' ? 'Mọi tàu' : shipName(g.node)} · từ {fmtRelative(g.oldestAt)}
                    </span>
                  </span>
                  <strong className="tabular-nums text-ink">{g.pending}</strong>
                </li>
              ))}
              {!queue?.groups.length && (
                <li className="px-4 py-6 text-center text-[13px] text-ink-muted">
                  {queueError || (queueLoading ? 'Đang tải...' : 'Hàng chờ trống')}
                </li>
              )}
            </ul>
          </Card>

          <Card title="Kiểm tra dữ liệu" icon={<ShieldCheck />}>
            <div className="space-y-2 px-4 py-3">
              <Button variant="secondary" fullWidth icon={checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />} onClick={checkIntegrity} disabled={checking}>
                {checking ? 'Đang kiểm tra...' : 'Kiểm tra dữ liệu bờ'}
              </Button>
              <Button variant="secondary" fullWidth icon={<RefreshCw className={`h-4 w-4 ${reconciling ? 'animate-spin' : ''}`} />} onClick={reconcile} disabled={reconciling}>
                {reconciling ? 'Đang đối soát...' : 'Đưa dữ liệu chưa đồng bộ vào hàng chờ'}
              </Button>
              <p className="text-[13px] text-ink-muted">Áp dụng cho thuyền viên và chứng chỉ ở bờ.</p>
              {integrity && (
                <div className={`rounded-md border px-3 py-2.5 ${integrity.healthy ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
                  <p className={`flex items-center gap-1.5 text-sm font-semibold ${integrity.healthy ? 'text-emerald-800' : 'text-amber-800'}`}>
                    {integrity.healthy ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                    {integrity.healthy ? 'Dữ liệu ổn' : 'Cần kiểm tra thêm'}
                    <span className="ml-auto text-xs font-normal text-ink-muted">{formatTime(integrity.timestamp)}</span>
                  </p>
                  <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-[13px]">
                    <dt className="text-ink-muted">Thuyền viên chưa đồng bộ</dt><dd className="font-semibold tabular-nums text-ink">{integrity.syncGaps.unsyncedCrew}</dd>
                    <dt className="text-ink-muted">Chứng chỉ chưa đồng bộ</dt><dd className="font-semibold tabular-nums text-ink">{integrity.syncGaps.unsyncedCerts}</dd>
                    <dt className="text-ink-muted">Chứng chỉ không có thuyền viên</dt><dd className="font-semibold tabular-nums text-ink">{integrity.syncGaps.orphanCertificates}</dd>
                    <dt className="text-ink-muted">Hàng chờ quá 7 ngày</dt><dd className="font-semibold tabular-nums text-ink">{integrity.syncGaps.staleOutboxItems}</dd>
                  </dl>
                </div>
              )}
            </div>
          </Card>
        </aside>
      </div>

      {showSyncModal && (
        <ShoreConfirmModal data={data} queue={allQueue} syncing={syncing} onConfirm={handleForcePush} onClose={() => setShowSyncModal(false)} />
      )}

      <Modal
        isOpen={!!detail}
        onClose={() => setDetail(null)}
        size="md"
        icon={<Activity />}
        title="Chi tiết đồng bộ"
        subtitle={detail ? `${getVietLabel(detail.tableName)} · ${formatTime(detail.processedAt)}` : undefined}
        footer={<Button variant="secondary" onClick={() => setDetail(null)}>Đóng</Button>}
      >
        {detail && (
          <div className="space-y-4">
            <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-ink-muted">Hướng</dt><dd><DirectionPill value={detail.direction} /></dd>
              <dt className="text-ink-muted">Nguồn</dt><dd className="text-ink">{shipName(detail.originNode)} <span className="font-mono text-xs text-ink-muted">({detail.originNode})</span></dd>
              <dt className="text-ink-muted">Loại dữ liệu</dt><dd className="text-ink">{getVietLabel(detail.tableName)} <span className="font-mono text-xs text-ink-muted">({detail.tableName})</span></dd>
              <dt className="text-ink-muted">ID bản ghi</dt><dd className="break-all font-mono text-xs text-ink">{detail.recordKey}</dd>
              <dt className="text-ink-muted">Thao tác</dt><dd className="text-ink">{actionLabel(detail.actionType)}</dd>
              <dt className="text-ink-muted">Trạng thái</dt><dd><StatusPill value={detail.status} /></dd>
              <dt className="text-ink-muted">Thời gian</dt><dd className="text-ink">{formatTime(detail.processedAt)}</dd>
            </dl>
            <div>
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-muted">Nội dung xử lý / xung đột</p>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-grid bg-canvas px-3 py-2.5 font-mono text-xs text-ink">
                {detail.conflictDetail || 'Máy chủ không ghi nội dung chi tiết cho bản ghi này.'}
              </pre>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
