import React, { useEffect, useRef, useState } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Anchor, ChevronDown, Menu, X } from 'lucide-react';
import { UserMenu } from '../UserMenu';
import { NotificationBell } from '../NotificationBell';
import { NAVIGATION, isLeafActive, type NavGroup } from '../navigation';
import './TopNavLayout.css';

/*
  Khung của mọi trang sau đăng nhập: thanh điều hướng trên cùng + vùng nội dung.

  Menu đọc từ components/layout/navigation.ts (nguồn duy nhất). Tên mục LUÔN hiện:
  - ≥ 1280px (xl): biểu tượng + chữ.
  - 1024–1279px: chỉ chữ (bỏ biểu tượng cho đủ chỗ).
  - < 1024px: nút ☰ mở menu dọc.
*/

const linkBase =
  'flex h-9 items-center gap-2 rounded-md px-2 text-[13px] font-medium transition-colors whitespace-nowrap xl:px-2.5 xl:text-sm 2xl:px-3';
const linkIdle = 'text-white/75 hover:bg-white/10 hover:text-white';
const linkActive = 'bg-white/15 text-white shadow-[inset_0_-2px_0_0_#e0b53a]';

/** Menu thả xuống của một nhóm (ví dụ "Danh mục"). Tự đóng khi bấm ra ngoài, chọn mục, đổi trang, Esc. */
const NavDropdown: React.FC<{ group: NavGroup }> = ({ group }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = group.items.some(i => isLeafActive(i.path, location));
  const Icon = group.icon;

  // Đổi trang (kể cả bấm mục khác trên thanh menu) thì đóng.
  useEffect(() => { setOpen(false); }, [location.pathname, location.search]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`${linkBase} ${active || open ? linkActive : linkIdle}`}
      >
        <Icon className="hidden h-[18px] w-[18px] shrink-0 xl:block" aria-hidden="true" />
        <span>{group.label}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 opacity-70 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {open && (
        <div role="menu" className="absolute left-0 top-full z-[1200] mt-2 w-72 rounded-lg border border-line bg-surface p-1.5 shadow-2xl">
          {group.items.map(item => {
            const on = isLeafActive(item.path, location);
            const ItemIcon = item.icon;
            return (
              <button
                key={item.path}
                type="button"
                role="menuitem"
                onClick={() => { setOpen(false); navigate(item.path); }}
                className={`flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors ${on ? 'bg-primary-soft' : 'hover:bg-primary-soft'}`}
              >
                <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${on ? 'bg-primary text-white' : 'bg-accent-soft text-accent'}`}>
                  <ItemIcon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm ${on ? 'font-semibold text-primary' : 'font-medium text-ink'}`}>{item.label}</span>
                  {item.description && <span className="block text-xs text-ink-muted">{item.description}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const TopNavLayout: React.FC = () => {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { setMobileOpen(false); }, [location.pathname, location.search]);

  return (
    <div className="app-shell">
      {/* Leaflet (trang Theo dõi tàu) xếp lớp tới 1000 nên thanh menu và menu thả xuống phải cao hơn. */}
      <header className="sticky top-0 z-[1100] bg-primary shadow-[0_2px_8px_rgba(11,37,69,0.35)]">
        <div className="flex h-14 items-center gap-3 px-4">
          {/* Thương hiệu */}
          <NavLink to="/crew" className="flex shrink-0 items-center gap-2.5 rounded-md pr-2 text-white" aria-label="Trang chủ Maritime">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20">
              <Anchor className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <span className="leading-tight">
              <span className="block text-[15px] font-bold tracking-wide">MARITIME</span>
              <span className="hidden text-[10px] font-medium uppercase tracking-[0.18em] text-white/55 xl:block">Trung tâm bờ</span>
            </span>
          </NavLink>

          <span className="mx-1 hidden h-7 w-px bg-white/15 lg:block" aria-hidden="true" />

          {/* Menu chính (desktop) */}
          <nav className="hidden min-w-0 flex-1 items-center gap-0.5 lg:flex xl:gap-1" aria-label="Điều hướng chính">
            {NAVIGATION.map(entry => {
              if (entry.kind === 'group') return <NavDropdown key={entry.label} group={entry} />;
              const Icon = entry.icon;
              const on = isLeafActive(entry.path, location);
              return (
                <NavLink key={entry.path} to={entry.path} aria-current={on ? 'page' : undefined}
                  className={`${linkBase} ${on ? linkActive : linkIdle}`}>
                  <Icon className="hidden h-[18px] w-[18px] shrink-0 xl:block" aria-hidden="true" />
                  <span>{entry.label}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <NotificationBell />
            <span className="mx-1 h-7 w-px bg-white/15" aria-hidden="true" />
            <UserMenu />
            <button
              type="button"
              onClick={() => setMobileOpen(o => !o)}
              aria-label={mobileOpen ? 'Đóng menu' : 'Mở menu'}
              aria-expanded={mobileOpen}
              className="flex h-9 w-9 items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white lg:hidden"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Menu dọc cho màn hình hẹp */}
        {mobileOpen && (
          <nav className="max-h-[75vh] overflow-y-auto border-t border-white/10 bg-primary px-3 pb-3 pt-2 lg:hidden" aria-label="Điều hướng">
            {NAVIGATION.map(entry => {
              const leaves = entry.kind === 'group' ? entry.items : [entry];
              return (
                <div key={entry.label} className="py-1">
                  {entry.kind === 'group' && (
                    <div className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-white/50">{entry.label}</div>
                  )}
                  {leaves.map(leaf => {
                    const Icon = leaf.icon;
                    const on = isLeafActive(leaf.path, location);
                    return (
                      <NavLink key={leaf.path} to={leaf.path}
                        className={`flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium ${on ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/10'}`}>
                        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                        {leaf.label}
                      </NavLink>
                    );
                  })}
                </div>
              );
            })}
          </nav>
        )}
      </header>

      <main className="main-area">
        <div className="main-area-inner">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
