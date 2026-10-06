import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Anchor, Bell, Menu, X, ChevronDown, RefreshCw, Ship } from 'lucide-react';
import { crewApi } from '../../../services/crew.service';
import type { HoldNotification } from '../../../services/crew.service';
import { notificationApi } from '../../../services/notification.service';
import type { ShoreNotification } from '../../../services/notification.service';
import { UserMenu } from '../UserMenu';
import './TopNavLayout.css';

const LAST_SEEN_KEY = 'hold_notifications_last_seen';

function getLastSeenDate(): Date {
  const stored = localStorage.getItem(LAST_SEEN_KEY);
  return stored ? new Date(stored) : new Date(0);
}

function markAllSeen() {
  localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
}

type DropdownItem = { path: string; label: string; };
type DropdownGroup = { title?: string; items: DropdownItem[]; };
type NavDropdown = { type: 'dropdown'; label: string; groups: DropdownGroup[]; };
type NavPlainLink = { type: 'link'; path: string; label: string; };
type NavItemDef = NavPlainLink | NavDropdown;

const navItems: NavItemDef[] = [
  {
    type: 'dropdown',
    label: 'Danh mục',
    groups: [
      {
        items: [
          { path: '/categories?tab=crew', label: 'Thuyền viên' },
          { path: '/categories?tab=certificate-types', label: 'Loại chứng chỉ' },
          { path: '/categories?tab=ranks', label: 'Chức danh' },
          { path: '/categories?tab=countries', label: 'Quốc gia' },
          { path: '/categories?tab=ports', label: 'Cảng' },
        ]
      }
    ]
  },
  { type: 'link', path: '/vessels', label: 'Danh sách tàu' },
  { type: 'link', path: '/vessels/tracking', label: '🛰️ Tracking' },
  { type: 'link', path: '/weather-routing', label: 'Tối ưu tuyến' },
  // {
  //   type: 'dropdown',
  //   label: 'Thông tin',
  //   groups: [
  //     {
  //       title: 'QUY TRÌNH',
  //       items: [
  //         { path: '/onboarding', label: 'Onboarding' },
  //         { path: '/verification-queue', label: 'Xác minh' },
  //         { path: '/compliance', label: 'Tuân thủ' },
  //       ]
  //     },
  //     {
  //       title: 'ĐIỀU PHỐI',
  //       items: [
  //         { path: '/assignments', label: 'Phân công' },
  //         { path: '/external-requests', label: 'Tuyển ngoài' },
  //         { path: '/travel', label: 'Di chuyển' },
  //         { path: '/onboard-events', label: 'Onboard' },
  //       ]
  //     }
  //   ]
  // },
  { type: 'link', path: '/sign-off-requests', label: 'Duyệt xuống tàu' },
  { type: 'link', path: '/report', label: 'Báo cáo' },
  { type: 'link', path: '/sms',    label: '🛡️ SMS System' },
  { type: 'link', path: '/sync',   label: 'Đồng bộ' },
];

export const TopNavLayout: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [holdNotifications, setHoldNotifications] = useState<HoldNotification[]>([]);
  const [syncNotifications, setSyncNotifications] = useState<ShoreNotification[]>([]);
  const [bellOpen, setBellOpen] = useState(false);
  const [openDropdownIdx, setOpenDropdownIdx] = useState<number | null>(null);
  const bellRef = useRef<HTMLDivElement>(null);
  const navLinksRef = useRef<HTMLDivElement>(null);

  const holdUnread = holdNotifications.filter(
    n => new Date(n.onboardStatusChangedAt) > getLastSeenDate()
  ).length;
  const syncUnread = syncNotifications.filter(n => !n.isRead).length;
  const unreadCount = holdUnread + syncUnread;

  const loadNotifications = useCallback(async () => {
    try {
      const [holds, syncs] = await Promise.all([
        crewApi.holdNotifications().catch(() => [] as HoldNotification[]),
        notificationApi.getRecent(30).catch(() => [] as ShoreNotification[]),
      ]);
      setHoldNotifications(holds);
      setSyncNotifications(syncs);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30_000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  // Close bell dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close nav dropdowns when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (navLinksRef.current && !navLinksRef.current.contains(e.target as Node)) {
        setOpenDropdownIdx(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleBellClick = () => {
    setBellOpen(prev => !prev);
    if (!bellOpen) {
      markAllSeen();
      notificationApi.markAllRead().catch(() => {});
      setSyncNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setHoldNotifications(prev => [...prev]); // force re-render to clear badge
    }
  };

  const handleHoldClick = (n: HoldNotification) => {
    setBellOpen(false);
    navigate(`/vessels/${n.vesselId}`);
  };

  const handleSyncClick = (n: ShoreNotification) => {
    setBellOpen(false);
    if (n.vesselId) {
      navigate(`/vessels/${n.vesselId}`);
    } else {
      navigate('/sync');
    }
  };

  const isDropdownActive = (item: NavDropdown) =>
    item.groups.some(g =>
      g.items.some(di => location.pathname === di.path.split('?')[0])
    );

  const handleDropdownItemClick = (path: string) => {
    setOpenDropdownIdx(null);
    navigate(path);
  };

  // Flatten all items for mobile menu
  const mobileItems: { path: string; label: string }[] = [];
  navItems.forEach(item => {
    if (item.type === 'link') {
      mobileItems.push({ path: item.path, label: item.label });
    } else {
      item.groups.forEach(g =>
        g.items.forEach(di => mobileItems.push({ path: di.path, label: di.label }))
      );
    }
  });

  return (
    <div className="app-shell">
      {/* ===== Top Navigation ===== */}
      <header className="topnav">
        <div className="topnav-inner">
          {/* Brand */}
          <NavLink to="/crew" className="topnav-brand">
            <Anchor size={15} />
            <span className="brand-text">Maritime</span>
          </NavLink>

          {/* Desktop Nav Links */}
          <div ref={navLinksRef} className="topnav-links">
            {navItems.map((item, idx) => {
              if (item.type === 'link') {
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    className={({ isActive }) =>
                      `topnav-link ${isActive ? 'topnav-link--active' : ''}`
                    }
                  >
                    {item.label}
                  </NavLink>
                );
              }
              const active = isDropdownActive(item);
              const isOpen = openDropdownIdx === idx;
              return (
                <div key={idx} className="topnav-dropdown-wrap">
                  <button
                    className={`topnav-link topnav-dropdown-btn${active ? ' topnav-link--active' : ''}`}
                    onClick={() => setOpenDropdownIdx(isOpen ? null : idx)}
                  >
                    {item.label}
                    <ChevronDown
                      size={12}
                      style={{
                        marginLeft: 4,
                        transition: 'transform 0.15s',
                        transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      }}
                    />
                  </button>
                  {isOpen && (
                    <div className="topnav-dropdown">
                      {item.groups.map((group, gi) => (
                        <div key={gi}>
                          {group.title && (
                            <div className="topnav-dropdown-section">{group.title}</div>
                          )}
                          {group.items.map(di => (
                            <button
                              key={di.path}
                              className={`topnav-dropdown-item${
                                location.pathname === di.path.split('?')[0]
                                  ? ' topnav-dropdown-item--active'
                                  : ''
                              }`}
                              onClick={() => handleDropdownItemClick(di.path)}
                            >
                              {di.label}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right side actions */}
          <div className="topnav-actions">
            {/* Notification Bell */}
            <div ref={bellRef} style={{ position: 'relative' }}>
              <button
                className="topnav-icon-btn"
                title="Thông báo"
                onClick={handleBellClick}
                style={{ position: 'relative' }}
              >
                <Bell size={15} />
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: 0, right: 0,
                    background: '#ef4444', color: '#fff',
                    borderRadius: '50%', width: 16, height: 16,
                    fontSize: 10, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    lineHeight: 1,
                  }}>{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
              </button>

              {/* Dropdown */}
              {bellOpen && (
                <div style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                  width: 370, background: '#fff',
                  border: '1px solid #e5e7eb', borderRadius: 10,
                  // Leaflet xếp lớp tới 1000 (.leaflet-control), nên bảng thông báo phải cao
                  // hơn mức đó, không thì bản đồ trang Tracking đè lên và che mất nội dung.
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 1200,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    padding: '10px 14px', borderBottom: '1px solid #f3f4f6',
                    fontWeight: 700, fontSize: 13, color: '#1e293b',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <span>Thông báo</span>
                    {(syncUnread + holdUnread) > 0 && (
                      <span style={{ fontSize: 11, color: '#64748b', fontWeight: 400 }}>
                        {syncUnread + holdUnread} chưa đọc
                      </span>
                    )}
                  </div>

                  {syncNotifications.length === 0 && holdNotifications.length === 0 ? (
                    <div style={{ padding: '20px 14px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                      Không có thông báo mới
                    </div>
                  ) : (
                    <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                      {/* === Sync Notifications === */}
                      {syncNotifications.length > 0 && (
                        <>
                          <div style={{
                            padding: '6px 14px', background: '#f8fafc',
                            fontSize: 11, fontWeight: 700, color: '#64748b',
                            textTransform: 'uppercase', letterSpacing: '0.04em',
                            borderBottom: '1px solid #f3f4f6',
                          }}>
                            Đồng bộ
                          </div>
                          {syncNotifications.map(n => (
                            <button
                              key={`sync-${n.id}`}
                              onClick={() => handleSyncClick(n)}
                              style={{
                                display: 'block', width: '100%', textAlign: 'left',
                                padding: '10px 14px', border: 'none', cursor: 'pointer',
                                background: !n.isRead ? '#eff6ff' : '#fff',
                                borderBottom: '1px solid #f3f4f6',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                <RefreshCw size={14} style={{
                                  color: '#0d7377', flexShrink: 0, marginTop: 2
                                }} />
                                <div style={{ flex: 1 }}>
                                  <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>
                                    {n.title}
                                  </div>
                                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                                    {n.message}
                                  </div>
                                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 3 }}>
                                    {new Date(n.createdAt).toLocaleString('vi-VN', {
                                      day: '2-digit', month: '2-digit', year: 'numeric',
                                      hour: '2-digit', minute: '2-digit'
                                    })}
                                  </div>
                                </div>
                                {!n.isRead && (
                                  <span style={{
                                    width: 8, height: 8, borderRadius: '50%',
                                    background: '#3b82f6', flexShrink: 0, marginTop: 4
                                  }} />
                                )}
                              </div>
                            </button>
                          ))}
                        </>
                      )}

                      {/* === Hold Notifications === */}
                      {holdNotifications.length > 0 && (
                        <>
                          <div style={{
                            padding: '6px 14px', background: '#f8fafc',
                            fontSize: 11, fontWeight: 700, color: '#64748b',
                            textTransform: 'uppercase', letterSpacing: '0.04em',
                            borderBottom: '1px solid #f3f4f6',
                          }}>
                            Tạm giữ thuyền viên
                          </div>
                          {holdNotifications.map(n => {
                            const isNew = new Date(n.onboardStatusChangedAt) > getLastSeenDate();
                            return (
                              <button
                                key={`hold-${n.id}`}
                                onClick={() => handleHoldClick(n)}
                                style={{
                                  display: 'block', width: '100%', textAlign: 'left',
                                  padding: '10px 14px', border: 'none', cursor: 'pointer',
                                  background: isNew ? '#fff7ed' : '#fff',
                                  borderBottom: '1px solid #f3f4f6',
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                  <Ship size={14} style={{
                                    color: '#c2410c', flexShrink: 0, marginTop: 2
                                  }} />
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1e293b' }}>
                                      {n.fullName}
                                      <span style={{
                                        marginLeft: 6, background: '#fed7aa', color: '#c2410c',
                                        fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 6
                                      }}>Tạm giữ</span>
                                    </div>
                                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                                      Tàu: <strong>{n.vesselName}</strong>
                                      {n.onboardStatusChangedBy && ` • Bởi: ${n.onboardStatusChangedBy}`}
                                    </div>
                                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                                      {new Date(n.onboardStatusChangedAt).toLocaleString('vi-VN', {
                                        day: '2-digit', month: '2-digit', year: 'numeric',
                                        hour: '2-digit', minute: '2-digit'
                                      })}
                                    </div>
                                  </div>
                                  {isNew && (
                                    <span style={{
                                      width: 8, height: 8, borderRadius: '50%',
                                      background: '#ef4444', flexShrink: 0, marginTop: 4
                                    }} />
                                  )}
                                </div>
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

            {/* User Menu */}
            <UserMenu />

            {/* Mobile menu toggle */}
            <button
              className="topnav-mobile-toggle"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="topnav-mobile-menu">
            {mobileItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `topnav-mobile-link ${isActive ? 'topnav-mobile-link--active' : ''}`
                }
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        )}
      </header>

      {/* ===== Main Content ===== */}
      <main className="main-area">
        <div className="main-area-inner">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
