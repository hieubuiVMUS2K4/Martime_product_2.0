import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAuth } from './AuthContext'
import { apiClient } from '../services/api.client'

export const SHORE_MODULES = [
  { key: 'catalogs', name: 'Danh mục', description: 'Loại chứng chỉ, chức danh, quốc gia, cảng và vật tư công ty.', path: '/categories' },
  { key: 'crew', name: 'Thuyền viên', description: 'Hồ sơ, chứng chỉ và các quy trình quản lý thuyền viên.', path: '/crew' },
  { key: 'vessels', name: 'Danh sách tàu', description: 'Danh sách và thông tin tàu. Cần bật để mở các tab nghiệp vụ trong chi tiết tàu.', path: '/vessels' },
  { key: 'tracking', name: 'Theo dõi tàu', description: 'Bản đồ và thông tin theo dõi tàu.', path: '/vessels/tracking' },
  { key: 'weather-routing', name: 'Tối ưu tuyến', description: 'Lập và tối ưu tuyến hành trình.', path: '/weather-routing' },
  { key: 'sms', name: 'Hệ thống SMS', description: 'Tài liệu, biểu mẫu và quy trình SMS.', path: '/sms' },
  { key: 'sync', name: 'Đồng bộ', description: 'Màn hình theo dõi đồng bộ; tắt mục này không dừng dịch vụ đồng bộ nền.', path: '/sync' },
  { key: 'approval-evidence', name: 'Hồ sơ ký', description: 'Tra cứu hồ sơ xác nhận và lịch sử ký từ tàu.', path: '/approval-evidence' },
  { key: 'pms', name: 'Bảo dưỡng (PMS)', description: 'Thiết bị, Job List, Work Order và báo cáo công việc trên bờ.', path: '/pms/work-planning' },
  { key: 'materials', name: 'Vật tư và kho vận', description: 'Vật tư theo tàu, yêu cầu vật tư, phiếu nhập kho và tồn kho.', path: '/materials' },
  { key: 'reports', name: 'Báo cáo tàu', description: 'Danh sách, lịch và chi tiết báo cáo của tàu.', path: '/report' },
] as const
export interface ModuleState { version: number; disabledModules: string[]; updatedAt?: string; updatedBy?: string }
export function moduleForLocation(pathname: string, search = ''): string | null {
  pathname = pathname.toLowerCase().replace(/\/+$/, '') || '/'
  if (pathname === '/admin/modules') return null
  if (pathname === '/vessels/tracking') return 'tracking'
  if (/^\/vessels\/[^/]+/.test(pathname)) {
    if (/\/crew\//.test(pathname)) return 'crew'
    const tab = new URLSearchParams(search).get('tab') || ''
    if (tab.startsWith('pms-')) return 'pms'
    if (tab.startsWith('materials-')) return 'materials'
    if (tab.startsWith('reports')) return 'reports'
    if (tab === 'crew') return 'crew'
    return 'vessels'
  }
  if (pathname.startsWith('/categories')) return 'catalogs'
  if (pathname.startsWith('/pms')) return 'pms'
  if (pathname.startsWith('/materials')) return 'materials'
  if (pathname.startsWith('/report')) return 'reports'
  if (pathname.startsWith('/sms') || pathname.startsWith('/safety/hsqe')) return 'sms'
  if (pathname.startsWith('/voyages')) return 'vessels'
  if (pathname.startsWith('/weather-routing')) return 'weather-routing'
  if (pathname.startsWith('/approval-evidence')) return 'approval-evidence'
  if (pathname.startsWith('/sync')) return 'sync'
  if (pathname === '/vessels') return 'vessels'
  if (/^\/(crew|certificates|sign-off-requests|work-assignments|onboarding|verification-queue|compliance|assignments|external-requests|travel|onboard-events)(\/|$)/.test(pathname)) return 'crew'
  return null
}
interface ModulesContext {
  state: ModuleState; loading: boolean; error: string; reload: () => Promise<void>;
  enabled: (key: string | null) => boolean; save: (disabledModules: string[], version: number) => Promise<void>
}
const Context = createContext<ModulesContext | null>(null)
export function ShoreModulesProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  const [state, setState] = useState<ModuleState>({ version: 0, disabledModules: [] })
  const [loading, setLoading] = useState(true), [error, setError] = useState('')
  const reload = useCallback(async () => {
    setLoading(true); setError('')
    try { setState(await apiClient.get<ModuleState>('/shore-modules')) }
    catch (e) { setError(e instanceof Error ? e.message : 'Không tải được cấu hình module.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => {
    if (isAuthenticated) void reload()
    else { setState({ version: 0, disabledModules: [] }); setLoading(true); setError('') }
  }, [isAuthenticated, reload])
  const save = async (disabledModules: string[], version: number) => {
    const result = await apiClient.put<ModuleState>('/shore-modules', { disabledModules, version })
    setState(result)
  }
  return <Context.Provider value={{ state, loading, error, reload, save, enabled: key => !key || !state.disabledModules.includes(key) }}>{children}</Context.Provider>
}
export function useShoreModules() {
  const value = useContext(Context)
  if (!value) throw new Error('ShoreModulesProvider is required')
  return value
}
export const isShoreAdmin = (role?: string) => ['admin', 'systemadmin'].includes(role?.toLowerCase() || '')
