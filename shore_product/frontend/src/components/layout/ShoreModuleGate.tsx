import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { isShoreAdmin, moduleForLocation, SHORE_MODULES, useShoreModules } from '../../contexts/ShoreModulesContext'
import { Button } from '../common'
import type { ReactNode } from 'react'

export function ShoreModuleHome() {
  const { enabled, loading, error } = useShoreModules()
  const { user } = useAuth()
  if (loading) return <p className="p-5 text-sm text-ink-muted">Đang tải cấu hình...</p>
  if (error) return <Navigate to="/home" replace />
  const first = enabled('vessels') ? '/vessels' : SHORE_MODULES.find(module => enabled(module.key))?.path
  return <Navigate to={first || (isShoreAdmin(user?.role) ? '/admin/modules' : '/home')} replace />
}
export function ShoreModuleGate({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { loading, error, reload, enabled } = useShoreModules()
  const location = useLocation()
  const pathname = location.pathname.toLowerCase().replace(/\/+$/, '') || '/'
  const management = pathname === '/admin/modules'
  if (management && !isShoreAdmin(user?.role)) return <div className="p-5 text-sm text-ink">Chỉ quản trị viên được quản lý module.</div>
  if (management) return children
  if (loading) return <p role="status" className="p-5 text-sm text-ink-muted">Đang tải cấu hình module...</p>
  if (error) return <div className="space-y-3 p-5"><p role="alert" className="text-sm text-red-600">Không tải được cấu hình module. Phiên đăng nhập vẫn được giữ.</p><Button onClick={() => void reload()}>Thử lại</Button></div>
  const key = moduleForLocation(pathname, location.search)
  const vesselDetail = /^\/vessels\/[^/]+/.test(pathname) && pathname !== '/vessels/tracking'
  if (!enabled(key) || (vesselDetail && !enabled('vessels'))) return <div className="space-y-3 p-5">
    <h1 className="text-lg font-bold text-ink">Module đang tắt</h1><p className="text-sm text-ink-muted">Quản trị viên đã tắt module này trên Shore. Dữ liệu hiện có vẫn được giữ nguyên.</p>
    <Link to="/" className="inline-block text-sm text-primary hover:underline">Về trang chính</Link>
    {isShoreAdmin(user?.role) && <Link to="/admin/modules" className="ml-4 inline-block text-sm text-primary hover:underline">Quản lý module</Link>}
  </div>
  return children
}
