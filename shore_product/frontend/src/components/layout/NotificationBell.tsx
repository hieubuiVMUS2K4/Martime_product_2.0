import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, RefreshCw, Ship } from 'lucide-react';
import { crewApi } from '../../services/crew.service';
import type { HoldNotification } from '../../services/crew.service';
import { notificationApi } from '../../services/notification.service';
import type { ShoreNotification } from '../../services/notification.service';

/*
  Chuông thông báo trên thanh điều hướng: thông báo đồng bộ và thuyền viên bị tàu tạm giữ.
  Tải lại mỗi 30 giây. Mở chuông là đánh dấu đã đọc hết.
*/

const LAST_SEEN_KEY = 'hold_notifications_last_seen';

function getLastSeenDate(): Date {
  try {
    const stored = localStorage.getItem(LAST_SEEN_KEY);
    return stored ? new Date(stored) : new Date(0);
  } catch {
    return new Date(0);
  }
}

function markAllSeen() {
  try { localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString()); } catch { /* bỏ qua */ }
}

const fmtTime = (iso: string) =>
  new Date(iso).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const NotificationBell: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [holds, setHolds] = useState<HoldNotification[]>([]);
  const [syncs, setSyncs] = useState<ShoreNotification[]>([]);
  const [lastSeen, setLastSeen] = useState(getLastSeenDate);
  const ref = useRef<HTMLDivElement>(null);

  const holdUnread = holds.filter(n => new Date(n.onboardStatusChangedAt) > lastSeen).length;
  const syncUnread = syncs.filter(n => !n.isRead).length;
  const unread = holdUnread + syncUnread;

  const load = useCallback(async () => {
    const [h, s] = await Promise.all([
      crewApi.holdNotifications().catch(() => [] as HoldNotification[]),
      notificationApi.getRecent(30).catch(() => [] as ShoreNotification[]),
    ]);
    setHolds(h);
    setSyncs(s);
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const toggle = () => {
    if (!open) {
      // Mở chuông = đã xem: ghi mốc cho thông báo tạm giữ, báo máy chủ cho thông báo đồng bộ.
      markAllSeen();
      notificationApi.markAllRead().catch(() => {});
      setSyncs(prev => prev.map(n => ({ ...n, isRead: true })));
      setLastSeen(getLastSeenDate());
    }
    setOpen(o => !o);
  };

  const go = (path: string) => { setOpen(false); navigate(path); };

  const groupTitle = 'sticky top-0 border-b border-line bg-canvas px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted';

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={unread > 0 ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}
        aria-expanded={open}
        title="Thông báo"
        className={`relative flex h-9 w-9 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10 hover:text-white ${open ? 'bg-white/15 text-white' : ''}`}
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-primary">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        // Bản đồ Leaflet ở trang Theo dõi tàu xếp lớp tới 1000, nên bảng thông báo phải cao hơn.
        <div className="absolute right-0 top-full z-[1200] mt-2 w-[380px] overflow-hidden rounded-lg border border-line bg-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold text-ink">Thông báo</span>
            {unread > 0 && <span className="text-xs text-ink-muted">{unread} chưa đọc</span>}
          </div>

          {syncs.length === 0 && holds.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ink-muted">
              <Bell className="mx-auto mb-2 h-6 w-6 text-ink-light" aria-hidden="true" />
              Không có thông báo mới
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto">
              {syncs.length > 0 && (
                <>
                  <div className={groupTitle}>Đồng bộ</div>
                  {syncs.map(n => (
                    <button key={`sync-${n.id}`} type="button" onClick={() => go(n.vesselId ? `/vessels/${n.vesselId}` : '/sync')}
                      className={`flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left hover:bg-primary-soft ${!n.isRead ? 'bg-accent-soft/50' : ''}`}>
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-ink">{n.title}</span>
                        <span className="mt-0.5 block text-xs text-ink-muted">{n.message}</span>
                        <span className="mt-1 block text-[11px] text-ink-light">{fmtTime(n.createdAt)}</span>
                      </span>
                    </button>
                  ))}
                </>
              )}
              {holds.length > 0 && (
                <>
                  <div className={groupTitle}>Thuyền viên bị tạm giữ</div>
                  {holds.map(n => {
                    const isNew = new Date(n.onboardStatusChangedAt) > lastSeen;
                    return (
                      <button key={`hold-${n.id}`} type="button" onClick={() => go(`/vessels/${n.vesselId}`)}
                        className={`flex w-full items-start gap-3 border-b border-line px-4 py-3 text-left hover:bg-primary-soft ${isNew ? 'bg-orange-50' : ''}`}>
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-700">
                          <Ship className="h-3.5 w-3.5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold text-ink">
                            {n.fullName}
                            <span className="ml-1.5 rounded bg-orange-100 px-1.5 py-px text-[10px] font-bold text-orange-700">Tạm giữ</span>
                          </span>
                          <span className="mt-0.5 block text-xs text-ink-muted">
                            Tàu <strong className="font-medium text-ink">{n.vesselName}</strong>
                            {n.onboardStatusChangedBy && ` · Bởi ${n.onboardStatusChangedBy}`}
                          </span>
                          <span className="mt-1 block text-[11px] text-ink-light">{fmtTime(n.onboardStatusChangedAt)}</span>
                        </span>
                        {isNew && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label="Mới" />}
                      </button>
                    );
                  })}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
