import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, FileText, Loader2 } from 'lucide-react';
import { ENV } from '../../config/env';
import AIChatWidget from '../../components/Reports/AIChatWidget';
import { DataTable, QuickFilterBar, type Column } from '../../components/common';
import './VesselReportsTab.css';

/*
  Báo cáo của MỘT tàu — nhúng trong Chi tiết tàu (nhóm "Báo cáo").
  - list:     bảng chung, bấm một dòng mở chi tiết báo cáo (/report/:id).
  - calendar: lịch tháng, ngày tàu không gửi báo cáo tô đỏ.
*/

export type ReportsView = 'list' | 'calendar';

interface ReportItem {
  id: string;
  reportNumber: string;
  reportTypeId: number;
  typeCode: string;
  reportDateTime: string;
  status: string;
  originNode: string;
  remarks: string | null;
  isTransmitted: boolean;
}

interface CalendarEvent {
  id: string;
  reportNumber: string;
  typeCode: string;
  time: string;
  status: string;
}

interface CalendarData {
  events: Record<string, CalendarEvent[]>;
  noReportDays: string[];
  year: number;
  month: number;
}

const TYPE: Record<string, { label: string; tone: string }> = {
  NOON: { label: 'Báo cáo trưa', tone: 'bg-amber-50 text-amber-700' },
  DEPARTURE: { label: 'Khởi hành', tone: 'bg-sky-50 text-sky-700' },
  ARRIVAL: { label: 'Cập cảng', tone: 'bg-violet-50 text-violet-700' },
  BUNKER: { label: 'Nhận nhiên liệu', tone: 'bg-orange-50 text-orange-700' },
  POSITION: { label: 'Vị trí', tone: 'bg-sky-50 text-sky-700' },
  DAILY: { label: 'Hằng ngày', tone: 'bg-emerald-50 text-emerald-700' },
  NO_REPORT: { label: 'Không có báo cáo', tone: 'bg-red-50 text-red-700' },
};

const STATUS: Record<string, { label: string; tone: string }> = {
  APPROVED: { label: 'Đã duyệt', tone: 'bg-emerald-50 text-emerald-700' },
  SUBMITTED: { label: 'Chờ duyệt', tone: 'bg-sky-50 text-sky-700' },
  DRAFT: { label: 'Nháp', tone: 'bg-slate-100 text-slate-600' },
  REJECTED: { label: 'Từ chối', tone: 'bg-red-50 text-red-700' },
  TRANSMITTED: { label: 'Đã truyền', tone: 'bg-emerald-50 text-emerald-700' },
  NO_REPORT: { label: 'Không có báo cáo', tone: 'bg-red-50 text-red-700' },
};

const typeLabel = (code: string) => TYPE[code]?.label ?? code;
const statusLabel = (code: string) => STATUS[code]?.label ?? code;

const Pill: React.FC<{ map: Record<string, { label: string; tone: string }>; code: string }> = ({ map, code }) => (
  <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${map[code]?.tone ?? 'bg-slate-100 text-slate-600'}`}>
    {map[code]?.label ?? code}
  </span>
);

const DOW_VN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const MONTH_NAMES_VN = Array.from({ length: 12 }, (_, i) => `Tháng ${i + 1}`);

const fmtDate = (s: string) => new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtTime = (s: string) => new Date(s).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

/** API trả theo trang; tải hết theo lô để bảng tự tìm/lọc/phân trang. */
const FETCH_PAGE = 200;

export const VesselReportsTab: React.FC<{ vesselId: string; view: ReportsView }> = ({ vesselId, view }) => {
  const navigate = useNavigate();

  // ── Danh sách ──
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState('all');

  // ── Lịch ──
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1); // 1-based
  const [calData, setCalData] = useState<CalendarData | null>(null);
  const [calLoading, setCalLoading] = useState(false);

  const fetchReports = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const all: ReportItem[] = [];
      for (let page = 1; ; page++) {
        const res = await fetch(`${ENV.API_BASE_URL}/reports/vessel/${vesselId}?page=${page}&pageSize=${FETCH_PAGE}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const data: ReportItem[] = json.data ?? [];
        all.push(...data);
        if (all.length >= (json.total ?? 0) || data.length === 0) break;
      }
      setReports(all);
    } catch (e) {
      setListError(e instanceof Error ? `Không tải được báo cáo (${e.message})` : 'Không tải được báo cáo');
    } finally {
      setListLoading(false);
    }
  }, [vesselId]);

  const fetchCalendar = useCallback(async () => {
    setCalLoading(true);
    try {
      const res = await fetch(`${ENV.API_BASE_URL}/reports/vessel/${vesselId}/calendar?year=${calYear}&month=${calMonth}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCalData(await res.json());
    } catch {
      setCalData(null);
    } finally {
      setCalLoading(false);
    }
  }, [vesselId, calYear, calMonth]);

  useEffect(() => { if (view === 'list') fetchReports(); }, [view, fetchReports]);
  useEffect(() => { if (view === 'calendar') fetchCalendar(); }, [view, fetchCalendar]);

  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    reports.forEach(r => m.set(r.typeCode, (m.get(r.typeCode) ?? 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [reports]);

  const rows = useMemo(() => (typeFilter === 'all' ? reports : reports.filter(r => r.typeCode === typeFilter)), [reports, typeFilter]);

  const columns: Column<ReportItem>[] = [
    {
      key: 'number', header: 'Số báo cáo', width: 190, filter: false, value: r => r.reportNumber,
      render: r => <span className="font-mono text-xs font-semibold text-primary">{r.reportNumber}</span>,
    },
    { key: 'date', header: 'Ngày (UTC)', width: 120, align: 'center', filter: false, value: r => r.reportDateTime, exportValue: r => fmtDate(r.reportDateTime), render: r => fmtDate(r.reportDateTime) },
    { key: 'time', header: 'Giờ', width: 80, align: 'center', filter: false, value: r => fmtTime(r.reportDateTime) },
    { key: 'type', header: 'Loại báo cáo', width: 160, align: 'center', value: r => typeLabel(r.typeCode), render: r => <Pill map={TYPE} code={r.typeCode} /> },
    { key: 'status', header: 'Trạng thái', width: 140, align: 'center', value: r => statusLabel(r.status), render: r => <Pill map={STATUS} code={r.status} /> },
    {
      key: 'remarks', header: 'Ghi chú', filter: false, truncate: true, value: r => r.remarks ?? '',
      render: r => (r.remarks ? <span className="text-ink-muted" title={r.remarks}>{r.remarks}</span> : <span className="text-ink-light">—</span>),
    },
  ];

  // ── Lịch: 6 hàng × 7 cột ──
  const toDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const todayKey = toDateKey(new Date());
  const calendarCells = () => {
    const firstDay = new Date(calYear, calMonth - 1, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth, 0).getDate();
    const daysInPrev = new Date(calYear, calMonth - 1, 0).getDate();
    const cells: { date: Date; isCurrentMonth: boolean }[] = [];
    for (let i = firstDay - 1; i >= 0; i--) cells.push({ date: new Date(calYear, calMonth - 2, daysInPrev - i), isCurrentMonth: false });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(calYear, calMonth - 1, d), isCurrentMonth: true });
    for (let d = 1; cells.length < 42; d++) cells.push({ date: new Date(calYear, calMonth, d), isCurrentMonth: false });
    return cells;
  };
  const calPrev = () => { if (calMonth === 1) { setCalYear(y => y - 1); setCalMonth(12); } else setCalMonth(m => m - 1); };
  const calNext = () => { if (calMonth === 12) { setCalYear(y => y + 1); setCalMonth(1); } else setCalMonth(m => m + 1); };

  const navBtn = 'flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-muted hover:border-accent/40 hover:bg-primary-soft hover:text-primary';
  const selectCls = 'h-8 rounded-md border border-line bg-surface px-2 text-xs text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25';

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {view === 'list' ? (
        <>
          <div className="shrink-0 border-b border-line bg-surface px-3 pt-3">
            <QuickFilterBar<string>
              active={typeFilter}
              onChange={setTypeFilter}
              items={[
                { key: 'all', label: 'Tổng báo cáo', count: reports.length, icon: <FileText /> },
                ...typeCounts.map(([code, count]) => ({ key: code, label: typeLabel(code), count })),
              ]}
            />
          </div>
          <DataTable
            flush
            columns={columns}
            data={rows}
            rowKey={r => r.id}
            loading={listLoading}
            error={listError}
            itemLabel="báo cáo"
            emptyMessage="Tàu chưa gửi báo cáo nào."
            searchPlaceholder="Tìm số báo cáo, ghi chú..."
            exportOptions={{ fileName: 'bao-cao-tau', title: 'BÁO CÁO CỦA TÀU' }}
            onRowClick={r => navigate(`/report/${r.id}`)}
            minWidth={900}
          />
        </>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto bg-canvas p-4">
          <section className="overflow-hidden rounded-md border border-grid-strong bg-surface">
            <header className="flex flex-wrap items-center gap-3 border-b border-grid px-4 py-2.5">
              <h3 className="text-sm font-semibold text-ink">{MONTH_NAMES_VN[calMonth - 1]} · {calYear}</h3>
              {calData && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                  <i className="h-1.5 w-1.5 rounded-full bg-red-500" /> {calData.noReportDays?.length ?? 0} ngày không có báo cáo
                </span>
              )}
              {calLoading && <Loader2 className="h-4 w-4 animate-spin text-ink-muted" aria-label="Đang tải" />}
              <div className="ml-auto flex items-center gap-2">
                <select aria-label="Tháng" className={selectCls} value={calMonth} onChange={e => setCalMonth(Number(e.target.value))}>
                  {MONTH_NAMES_VN.map((name, i) => <option key={i + 1} value={i + 1}>{name}</option>)}
                </select>
                <select aria-label="Năm" className={selectCls} value={calYear} onChange={e => setCalYear(Number(e.target.value))}>
                  {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <button type="button" className={navBtn} onClick={calPrev} aria-label="Tháng trước"><ChevronLeft className="h-4 w-4" /></button>
                <button type="button" className={navBtn} onClick={calNext} aria-label="Tháng sau"><ChevronRight className="h-4 w-4" /></button>
              </div>
            </header>

            <div className="calendar-grid">
              {DOW_VN.map(d => <div key={d} className="calendar-dow">{d}</div>)}
              {calendarCells().map(({ date, isCurrentMonth }, idx) => {
                const key = toDateKey(date);
                const events = calData?.events?.[key] ?? [];
                const isNoReport = calData?.noReportDays?.includes(key) ?? false;
                let cellClass = 'calendar-cell';
                if (!isCurrentMonth) cellClass += ' calendar-cell--other-month';
                else if (key === todayKey) cellClass += ' calendar-cell--today';
                else if (isNoReport) cellClass += ' calendar-cell--no-report';
                return (
                  <div key={idx} className={cellClass}>
                    <div className="calendar-cell__day">{date.getDate()}</div>
                    {isNoReport && isCurrentMonth && events.length === 0 && <div className="calendar-no-report-dot">● Không có báo cáo</div>}
                    {events.map(ev => (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => navigate(`/report/${ev.id}`)}
                        className={`calendar-event calendar-event--${ev.typeCode in TYPE ? ev.typeCode : 'default'} block w-full border-0 text-left hover:opacity-80`}
                        title={`${ev.reportNumber} · ${ev.time} · ${typeLabel(ev.typeCode)} · ${statusLabel(ev.status)}`}
                      >
                        {ev.time} {typeLabel(ev.typeCode)}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
      <AIChatWidget vesselId={vesselId} />
    </div>
  );
};
