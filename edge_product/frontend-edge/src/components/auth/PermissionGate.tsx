import type { ReactNode } from 'react'
import { usePermission } from '@/stores/permissions.store'

export function PermissionGate({ permission, children }: { permission: string; children: ReactNode }) {
  return usePermission(permission) ? <>{children}</> : null
}
