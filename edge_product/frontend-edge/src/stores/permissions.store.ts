import { create } from 'zustand'
import { apiClient } from '@/services/api.client'

export interface PermissionModule { code: string; name: string; group: string; routes: string[]; actions: string[] }
let generation = 0
interface PermissionsState {
  modules: PermissionModule[]; grants: string[]; isAdmin: boolean; rankName: string | null;
  loaded: boolean; error: string | null;
  load: () => Promise<void>; reset: () => void;
}
export const usePermissionsStore = create<PermissionsState>((set) => ({
  modules: [], grants: [], isAdmin: false, rankName: null, loaded: false, error: null,
  reset: () => { generation++; set({ modules: [], grants: [], isAdmin: false, rankName: null, loaded: false, error: null }) },
  load: async () => {
    const currentGeneration = generation
    try {
      const [current, modules] = await Promise.all([
        apiClient.get<{ isAdmin: boolean; rankName: string | null; grants: string[] }>('/permissions/me'),
        apiClient.get<PermissionModule[]>('/permissions/catalog'),
      ])
      if (generation === currentGeneration) set({ ...current, modules, loaded: true, error: null })
    } catch {
      if (generation === currentGeneration) set({ grants: [], isAdmin: false, loaded: true, error: 'Không thể tải quyền truy cập. Vui lòng thử lại.' })
    }
  },
}))
export function canPerform(code: string) {
  const { isAdmin, grants, loaded, error } = usePermissionsStore.getState()
  return loaded && !error && (isAdmin || (grants.includes(code) && grants.includes(code.slice(0, code.lastIndexOf('.')) + '.access')))
}
export function canOpen(path: string) {
  const { modules, isAdmin, loaded, error } = usePermissionsStore.getState()
  if (!loaded || error) return false
  if (isAdmin) return true
  if (path.startsWith('/admin/')) return false
  if (path === '/pms/work-planning') return ['pms.work', 'pms.config', 'pms.counter'].some(m => canPerform(m + '.view'))
  const matches = modules.flatMap(m => m.routes.map(route => ({ m, route })))
    .filter(({ route }) => path === route || path.startsWith(route.endsWith('/') ? route : route + '/'))
    .sort((a, b) => b.route.length - a.route.length)
  return !!matches[0] && canPerform(matches[0].m.code + '.view')
}
