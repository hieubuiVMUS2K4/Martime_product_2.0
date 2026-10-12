import { useState } from 'react'
import { CompanyMaterialCatalogTab } from './CompanyMaterialCatalogTab'
import { MaterialCatalogTab } from './MaterialCatalogTab'

type Tab = 'company' | 'ship'

/**
 * Vật tư:
 * - Danh mục công ty: bờ làm chủ, đồng bộ xuống tàu, chỉ đọc (như danh mục cảng/quốc gia/loại chứng chỉ).
 * - Vật tư của tàu: vật tư tàu dùng (mã riêng của tàu, gán vào thiết bị).
 */
export function MaterialPage() {
  const [tab, setTab] = useState<Tab>('company')
  const tabs: { key: Tab; label: string }[] = [
    { key: 'company', label: 'Danh mục công ty' },
    { key: 'ship', label: 'Vật tư của tàu' },
  ]
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <nav className="flex shrink-0 border-b border-gray-200 px-4" aria-label="Vật tư">
        {tabs.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </nav>
      {tab === 'company' ? <CompanyMaterialCatalogTab /> : <MaterialCatalogTab />}
    </div>
  )
}
