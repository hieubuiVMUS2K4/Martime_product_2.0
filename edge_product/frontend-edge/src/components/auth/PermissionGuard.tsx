import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { usePermissionsStore, canOpen } from '@/stores/permissions.store'
import { useAuthStore } from '@/stores/auth.store'

export function PermissionGuard({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.accessToken)
  const location = useLocation()
  const permissions = usePermissionsStore()
  useEffect(() => {
    permissions.reset()
    void permissions.load()
    const refresh = () => { if (document.visibilityState === 'visible') void usePermissionsStore.getState().load() }
    const timer = window.setInterval(refresh, 30000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', refresh) }
  }, [token])
  if (!permissions.loaded) return <div className="p-8 text-sm text-gray-500">Đang tải quyền truy cập…</div>
  if (!canOpen(location.pathname)) return <div className="p-8 text-sm">
    <h1 className="mb-2 text-lg font-semibold">{permissions.error ? 'Không thể tải quyền' : 'Chưa có quyền truy cập'}</h1>
    <p className="text-gray-500">{permissions.error || (permissions.rankName ? 'Liên hệ quản trị viên để được cấp quyền cho chức danh của bạn.' : 'Tài khoản chưa được gán chức danh hoặc chức danh chưa được cấp quyền.')}</p>
    <button className="mt-4 rounded border px-3 py-2" onClick={() => void permissions.load()}>Tải lại quyền</button>
  </div>
  return <>{children}</>
}
