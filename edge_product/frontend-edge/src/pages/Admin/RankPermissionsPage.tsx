import { useCallback, useEffect, useMemo, useState } from 'react'
import { Save, Search, RotateCcw, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { apiClient } from '@/services/api.client'
import { usePermissionsStore } from '@/stores/permissions.store'

interface Rank { id: number; rankName: string; rankCode: string; department: string; isConfigured: boolean }
interface Config { version: number; grants: string[] }
const labels: Record<string, string> = { view: 'Xem', create: 'Thêm', update: 'Sửa / cập nhật', delete: 'Xóa', import: 'Import', export: 'Xuất / tải file', assign: 'Phân công / liên kết', execute: 'Thực hiện', approve: 'Duyệt / ký', reject: 'Từ chối' }
const actionOrder = ['view', 'create', 'update', 'delete', 'import', 'export', 'assign', 'execute', 'approve', 'reject']
const departments: Record<string, string> = { DECK: 'Bộ phận boong', ENGINE: 'Bộ phận máy', CATERING: 'Bộ phận phục vụ', OTHER: 'Khác' }
function AccessToggle({ checked, disabled, label, onChange }: { checked: boolean; disabled?: boolean; label: string; onChange: () => void }) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange}
    className="inline-flex items-center gap-2 rounded px-1 py-1 text-xs text-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-40">
    <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-blue-600' : 'bg-gray-300'}`}>
      <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </span>
    <span>Truy cập</span>
  </button>
}
function PermissionCheckbox({ checked, partial = false, disabled, label, onChange }: { checked: boolean; partial?: boolean; disabled?: boolean; label: string; onChange: () => void }) {
  return <input type="checkbox" aria-label={label} checked={checked} disabled={disabled}
    ref={element => { if (element) element.indeterminate = partial }} onChange={onChange}
    className="h-4 w-4 cursor-pointer rounded border-gray-300 accent-blue-600 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-40" />
}
export default function RankPermissionsPage() {
  const { modules, isAdmin } = usePermissionsStore()
  const [ranks, setRanks] = useState<Rank[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [rankSearch, setRankSearch] = useState('')
  const [search, setSearch] = useState('')
  const [config, setConfig] = useState<Config>({ version: 0, grants: [] })
  const [grants, setGrants] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const dirty = JSON.stringify([...grants].sort()) !== JSON.stringify([...config.grants].sort())
  const loadRanks = useCallback(async () => {
    try { setRanks(await apiClient.get<Rank[]>('/permissions/ranks')) }
    catch { toast.error('Không thể tải chức danh') }
  }, [])
  useEffect(() => {
    void loadRanks()
    const timer = window.setInterval(() => void loadRanks(), 30000)
    window.addEventListener('focus', loadRanks)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', loadRanks) }
  }, [loadRanks])
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])
  const choose = async (id: number) => {
    if (dirty && !window.confirm('Bỏ các thay đổi chưa lưu để tải cấu hình chức danh?')) return
    setSelected(id); setLoading(true); setError(null)
    try {
      const data = await apiClient.get<Config>(`/permissions/ranks/${id}`)
      setConfig(data); setGrants(new Set(data.grants))
    } catch { setError('Không thể tải cấu hình. Vui lòng chọn lại chức danh.') }
    finally { setLoading(false) }
  }
  const toggle = (code: string) => setGrants(prev => { const next = new Set(prev); if (next.has(code)) next.delete(code); else next.add(code); return next })
  const toggleModule = (code: string) => setGrants(prev => {
    const next = new Set(prev)
    if (next.has(code + '.access')) next.delete(code + '.access')
    else { next.add(code + '.access'); next.add(code + '.view') }
    return next
  })
  const save = async () => {
    if (selected === null) return
    setSaving(true)
    try {
      const data = await apiClient.put<Config>(`/permissions/ranks/${selected}`, { version: config.version, grants: [...grants] })
      setConfig(data); setGrants(new Set(data.grants))
      toast.success('Đã lưu quyền cho chức danh')
      await loadRanks(); await usePermissionsStore.getState().load()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Không thể lưu quyền') }
    finally { setSaving(false) }
  }
  const groups = useMemo(() => [...new Set(modules.map(m => m.group))], [modules])
  const rank = ranks.find(r => r.id === selected)
  if (!isAdmin) return <div className="p-6">Chỉ quản trị viên được cấu hình phân quyền.</div>
  return <div className="flex h-full min-h-0 flex-col bg-white text-sm">
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white lg:w-64">
        <div className="border-b border-gray-200 p-3">
          <div className="relative"><Search size={15} className="absolute left-3 top-2.5 text-gray-400" /><input aria-label="Tìm chức danh" value={rankSearch} onChange={e => setRankSearch(e.target.value)} placeholder="Tìm chức danh…" className="h-9 w-full rounded border border-gray-300 pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">{ranks.filter(r => (r.rankName + r.rankCode).toLowerCase().includes(rankSearch.toLowerCase())).map(r =>
          <button key={r.id} disabled={loading || saving} onClick={() => void choose(r.id)} className={`mb-1 w-full rounded px-3 py-3 text-left disabled:opacity-50 ${selected === r.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}>
            <span className="block font-medium">{r.rankName}</span><span className="mt-1 block text-xs text-gray-500">{departments[r.department] || r.department}{!r.isConfigured ? ' · Chưa cấu hình' : ''}</span>
          </button>)}{!ranks.length && <p className="p-3 text-xs leading-5 text-gray-500">Chưa có chức danh. Chức danh sẽ xuất hiện sau khi đồng bộ từ công ty.</p>}</div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <div><div className="font-semibold text-gray-900">{rank?.rankName || 'Chọn chức danh để cấu hình'}</div>{rank && <div className={`mt-1 text-xs ${dirty ? 'text-amber-600' : 'text-gray-500'}`}>{dirty ? 'Có thay đổi chưa lưu' : 'Quyền áp dụng cho thuyền viên mang chức danh này'}</div>}</div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative"><Search size={15} className="absolute left-3 top-2.5 text-gray-400" /><input aria-label="Tìm module" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm module…" className="h-9 w-52 rounded border border-gray-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></div>
            <button type="button" disabled={loading || saving} onClick={() => void loadRanks()} className="inline-flex h-9 items-center gap-2 rounded border border-gray-300 px-3 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"><RefreshCw size={15} />Làm mới</button>
            <button type="button" disabled={!dirty || loading || saving} onClick={() => setGrants(new Set(config.grants))} className="inline-flex h-9 items-center gap-2 rounded border border-gray-300 bg-white px-3 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"><RotateCcw size={15} />Đặt lại</button>
            <button type="button" disabled={!dirty || !rank || loading || saving || !!error} onClick={() => void save()} className="inline-flex h-9 items-center gap-2 rounded bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"><Save size={15} />{saving ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50/60 p-4 lg:p-5">
          {error && <p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">{error}</p>}
          {loading ? <p className="p-2 text-gray-500">Đang tải cấu hình…</p> : !rank ? <p className="p-2 text-gray-500">Chọn một chức danh bên trái để xem và điều chỉnh quyền.</p> : !error && <div className="mx-auto max-w-6xl space-y-5">
            {groups.map(group => {
              const rows = modules.filter(m => m.group === group && m.name.toLowerCase().includes(search.toLowerCase()))
              if (!rows.length) return null
              const groupModules = modules.filter(m => m.group === group)
              const allEnabled = groupModules.every(m => grants.has(m.code + '.access'))
              const someEnabled = groupModules.some(m => grants.has(m.code + '.access'))
              return <section key={group} aria-label={group}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                  <h2 className="text-sm font-semibold text-gray-800">{group}</h2>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-gray-500">
                    <PermissionCheckbox checked={allEnabled} partial={someEnabled && !allEnabled} disabled={saving} label={`Truy cập tất cả module trong ${group}`} onChange={() => setGrants(prev => {
                      const next = new Set(prev)
                      for (const m of groupModules) {
                        if (allEnabled) next.delete(m.code + '.access')
                        else { next.add(m.code + '.access'); next.add(m.code + '.view') }
                      }
                      return next
                    })} />Truy cập cả nhóm
                  </label>
                </div>
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                  {rows.map(m => {
                    const enabled = grants.has(m.code + '.access')
                    return <div key={m.code} className="flex flex-col gap-4 border-b border-gray-100 px-4 py-4 last:border-b-0 lg:flex-row lg:gap-6 lg:px-5">
                      <div className="flex shrink-0 items-center justify-between gap-3 lg:w-52 lg:flex-col lg:items-start lg:justify-center lg:gap-2">
                        <h3 className="text-sm font-medium text-gray-900">{m.name}</h3>
                        <AccessToggle checked={enabled} disabled={saving} label={`Truy cập ${m.name}`} onChange={() => toggleModule(m.code)} />
                      </div>
                      <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3 xl:grid-cols-4">
                        {actionOrder.filter(action => m.actions.includes(action)).map(action => {
                          const checked = enabled && grants.has(m.code + '.' + action)
                          return <label key={action} className={`inline-flex min-w-0 items-center gap-2.5 text-sm ${!enabled || saving ? 'cursor-not-allowed text-gray-400' : checked ? 'cursor-pointer text-blue-700' : 'cursor-pointer text-gray-600'}`}>
                            <PermissionCheckbox checked={checked} disabled={!enabled || saving} label={`${labels[action]}: ${m.name}`} onChange={() => toggle(m.code + '.' + action)} />
                            <span>{labels[action]}</span>
                          </label>
                        })}
                      </div>
                    </div>
                  })}
                </div>
              </section>
            })}
          </div>}
          {rank && !loading && !error && !modules.some(m => m.name.toLowerCase().includes(search.toLowerCase())) && <p className="p-2 text-gray-500">Không tìm thấy module phù hợp.</p>}
        </div>
      </section>
    </div>
  </div>
}
