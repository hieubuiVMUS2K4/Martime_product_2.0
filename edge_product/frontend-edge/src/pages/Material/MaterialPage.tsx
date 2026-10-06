import { MaterialCatalogTab } from './MaterialCatalogTab'
export function MaterialPage() {
  return <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
    <div className="border-b border-gray-200 px-4 pt-3"><div className="inline-block border-b-2 border-blue-600 pb-3 text-sm font-semibold text-blue-600">Danh mục vật tư từ công ty</div></div>
    <MaterialCatalogTab />
  </div>
}
