import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ShieldCheck, Users } from 'lucide-react'
import { AccountManagementPage } from './AccountManagementPage'
import RankPermissionsPage from './RankPermissionsPage'

export function AdminManagementPage() {
  const [params, setParams] = useSearchParams()
  const activeTab = params.get('tab') === 'permissions' ? 'permissions' : 'accounts'
  const [permissionsOpened, setPermissionsOpened] = useState(activeTab === 'permissions')

  useEffect(() => {
    if (activeTab === 'permissions') setPermissionsOpened(true)
  }, [activeTab])

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div role="tablist" aria-label="Quản lý tài khoản và phân quyền" className="flex shrink-0 items-center border-b border-gray-200 px-4">
        {[
          { key: 'accounts', label: 'Tài khoản', icon: Users },
          { key: 'permissions', label: 'Phân quyền', icon: ShieldCheck },
        ].map(tab => (
          <button
            key={tab.key}
            id={`admin-tab-${tab.key}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`admin-panel-${tab.key}`}
            onClick={() => setParams(previous => {
              const next = new URLSearchParams(previous)
              if (tab.key === 'permissions') next.set('tab', 'permissions')
              else next.delete('tab')
              return next
            })}
            className={`flex items-center gap-2 border-b-2 px-5 py-3 text-sm font-medium transition-colors ${activeTab === tab.key
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'}`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>
      <div id="admin-panel-accounts" role="tabpanel" aria-labelledby="admin-tab-accounts" hidden={activeTab !== 'accounts'} className={activeTab === 'accounts' ? 'min-h-0 flex-1' : 'hidden'}>
        <AccountManagementPage />
      </div>
      <div id="admin-panel-permissions" role="tabpanel" aria-labelledby="admin-tab-permissions" hidden={activeTab !== 'permissions'} className={activeTab === 'permissions' ? 'min-h-0 flex-1' : 'hidden'}>
        {permissionsOpened && <RankPermissionsPage />}
      </div>
    </div>
  )
}
