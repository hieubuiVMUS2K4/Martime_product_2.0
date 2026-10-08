import {
  Anchor, Award, FolderOpen, Globe, Package, RefreshCw, Route, Satellite, ShieldCheck, Ship, ShieldAlert, Users,
  type LucideIcon,
} from 'lucide-react';

/*
  Menu điều hướng của phân hệ bờ — NGUỒN DUY NHẤT.

  Thanh điều hướng (desktop + điện thoại) đều đọc từ đây. Thêm trang mới: khai <Route> trong
  routes/AppRoutes.tsx rồi thêm một mục ở đây; không khai menu ở nơi khác.
*/

export interface NavLeaf {
  path: string;
  label: string;
  icon: LucideIcon;
  /** Một dòng mô tả, hiện trong menu thả xuống. */
  description?: string;
}

export interface NavGroup {
  label: string;
  icon: LucideIcon;
  items: NavLeaf[];
}

export type NavEntry = ({ kind: 'link' } & NavLeaf) | ({ kind: 'group' } & NavGroup);

export const NAVIGATION: NavEntry[] = [
  {
    kind: 'group',
    label: 'Danh mục',
    icon: FolderOpen,
    items: [
      { path: '/categories?tab=certificate-types', label: 'Loại chứng chỉ', icon: ShieldCheck, description: 'Danh mục và yêu cầu theo chức danh' },
      { path: '/categories?tab=ranks', label: 'Chức danh', icon: Award, description: 'Chức danh theo bộ phận' },
      { path: '/categories?tab=countries', label: 'Quốc gia', icon: Globe, description: 'Quốc tịch, quốc gia của cảng' },
      { path: '/categories?tab=ports', label: 'Cảng', icon: Anchor, description: 'Danh mục cảng UN/LOCODE' },
      { path: '/categories?tab=materials', label: 'Vật tư', icon: Package, description: 'Vật tư công ty cung cấp được cho các tàu' },
    ],
  },
  { kind: 'link', path: '/crew', label: 'Thuyền viên', icon: Users },
  { kind: 'link', path: '/vessels', label: 'Danh sách tàu', icon: Ship },
  { kind: 'link', path: '/vessels/tracking', label: 'Theo dõi tàu', icon: Satellite },
  { kind: 'link', path: '/weather-routing', label: 'Tối ưu tuyến', icon: Route },
  { kind: 'link', path: '/sms', label: 'Hệ thống SMS', icon: ShieldAlert },
  { kind: 'link', path: '/sync', label: 'Đồng bộ', icon: RefreshCw },
];

/**
 * Mục có đang mở không. So cả query `tab` để các mục Danh mục (cùng /categories) không sáng cùng lúc.
 * `/vessels` không sáng khi đang ở `/vessels/tracking` (mục riêng).
 */
export function isLeafActive(path: string, location: { pathname: string; search: string }): boolean {
  const [p, query] = path.split('?');
  if (query) {
    const want = new URLSearchParams(query);
    const have = new URLSearchParams(location.search);
    if (location.pathname !== p) return false;
    // /categories không có tab = tab mặc định (loại chứng chỉ).
    return [...want.entries()].every(([k, v]) => (have.get(k) ?? (k === 'tab' ? 'certificate-types' : null)) === v);
  }
  if (p === '/vessels') {
    return location.pathname === '/vessels' || (/^\/vessels\/[^/]+/.test(location.pathname) && !location.pathname.startsWith('/vessels/tracking'));
  }
  return location.pathname === p || location.pathname.startsWith(`${p}/`);
}
