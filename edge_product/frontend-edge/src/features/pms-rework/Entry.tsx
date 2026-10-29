import { translateMessage as tx, useMessageLocale } from '@/i18n/messages'
import { lazy, Suspense } from 'react'
import WorkPlanningPage from '@/pages/PMS/WorkPlanningPage'
import { usePmsPermissions } from './data'
const Planning = lazy(() => import('./Planning'))
export default function PmsPlanningEntry() {
  useMessageLocale()

  const { enabled } = usePmsPermissions()
  return enabled ? <Suspense fallback={<p className="p-6 text-sm text-gray-500">{tx("pmsRework.openingPMS")}</p>}><Planning /></Suspense> : <WorkPlanningPage />
}
