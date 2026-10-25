import { lazy, Suspense } from 'react'
import WorkPlanningPage from '@/pages/PMS/WorkPlanningPage'
import { usePmsPermissions } from './data'
const Planning = lazy(() => import('./Planning'))
export default function PmsPlanningEntry() {
  const { enabled } = usePmsPermissions()
  return enabled ? <Suspense fallback={<p className="p-6 text-sm text-gray-500">Đang mở PMS…</p>}><Planning /></Suspense> : <WorkPlanningPage />
}
