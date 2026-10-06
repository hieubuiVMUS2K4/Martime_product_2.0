import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { PermissionGuard } from '../auth/PermissionGuard'

export function MainLayout() {
  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900 overflow-hidden">
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content */}
      <div className="min-w-0 flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header />

        {/* Page Content */}
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-gray-50 dark:bg-gray-900 p-0">
          <div className="h-full w-full min-w-0">
            <PermissionGuard><Outlet /></PermissionGuard>
          </div>
        </main>
      </div>
    </div>
  )
}
