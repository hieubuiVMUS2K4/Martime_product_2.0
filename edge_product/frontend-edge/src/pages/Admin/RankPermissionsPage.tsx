import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SetStateAction } from 'react'
import { Save, Search, RotateCcw, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'
import { toast } from 'sonner'
import { apiClient } from '@/services/api.client'
import { usePermissionsStore } from '@/stores/permissions.store'

interface Rank extends Config { id: number; rankName: string; rankCode: string; department: string; isConfigured: boolean }
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
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const configCache = useRef(new Map<number, Config>())
  const listRequest = useRef(0)
  const editRevision = useRef(0)
  const selectedRef = useRef<number | null>(null)
  const dirty = JSON.stringify([...grants].sort()) !== JSON.stringify([...config.grants].sort())
  const dirtyRef = useRef(dirty)
  selectedRef.current = selected
  dirtyRef.current = dirty
  useEffect(() => () => { listRequest.current++ }, [])
  const changeGrants = (next: SetStateAction<Set<string>>) => {
    editRevision.current++
    dirtyRef.current = true
    setGrants(next)
  }
  const loadRanks = useCallback(async () => {
    const request = ++listRequest.current
    const revision = editRevision.current
    try {
      const data = await apiClient.get<Rank[]>('/permissions/ranks')
      if (listRequest.current !== request) return
      if (data.some(r => typeof r.version !== 'number' || !Array.isArray(r.grants)))
        throw new Error('Backend chưa hỗ trợ tải cấu hình quyền theo danh sách.')
      for (const r of data) {
        const current = configCache.current.get(r.id)
        if (!current || r.version >= current.version)
          configCache.current.set(r.id, { version: r.version, grants: r.grants })
      }
      setRanks(data)
      if (editRevision.current === revision && !dirtyRef.current) {
        const id = data.some(r => r.id === selectedRef.current) ? selectedRef.current : data[0]?.id ?? null
        const current = id == null ? undefined : configCache.current.get(id)
        setSelected(id); selectedRef.current = id
        if (current) { setConfig(current); setGrants(new Set(current.grants)) }
      }
      setError(null)
    } catch {
      if (listRequest.current === request) toast.error('Không thể tải danh sách chức danh và cấu hình quyền. Vui lòng thử lại.')
    } finally {
      if (listRequest.current === request) setLoading(false)
    }
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
  const choose = (id: number) => {
    const cached = configCache.current.get(id)
    if (id === selected && cached && !error) return
    if (dirty && !window.confirm('Bỏ các thay đổi chưa lưu để chọn chức danh khác?')) return
    editRevision.current++
    dirtyRef.current = false
    selectedRef.current = id
    setSelected(id); setError(null)
    if (cached) {
      setConfig(cached); setGrants(new Set(cached.grants))
    } else {
      setLoading(true)
      void loadRanks()
    }
  }
  const toggle = (code: string) => changeGrants(prev => { const next = new Set(prev); if (next.has(code)) next.delete(code); else next.add(code); return next })
  const toggleModule = (code: string) => changeGrants(prev => {
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
      configCache.current.set(selected, data)
      setConfig(data); setGrants(new Set(data.grants))
      toast.success('Đã lưu quyền cho chức danh')
      await loadRanks(); await usePermissionsStore.getState().load()
    } catch (e) {
      configCache.current.delete(selected)
      toast.error(e instanceof Error ? e.message : 'Không thể lưu quyền')
    }
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
          <button key={r.id} disabled={saving} onClick={() => void choose(r.id)} className={`mb-1 w-full rounded px-3 py-3 text-left disabled:opacity-50 ${selected === r.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}>
            <span className="block font-medium">{r.rankName}</span><span className="mt-1 block text-xs text-gray-500">{departments[r.department] || r.department}{!r.isConfigured ? ' · Chưa cấu hình' : ''}</span>
          </button>)}{!ranks.length && <p className="p-3 text-xs leading-5 text-gray-500">Chưa có chức danh. Chức danh sẽ xuất hiện sau khi đồng bộ từ công ty.</p>}</div>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <div><div className="font-semibold text-gray-900">{rank?.rankName || 'Chọn chức danh để cấu hình'}</div>{rank && <div className={`mt-1 text-xs ${dirty ? 'text-amber-600' : 'text-gray-500'}`}>{dirty ? 'Có thay đổi chưa lưu' : 'Quyền áp dụng cho thuyền viên mang chức danh này'}</div>}</div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative"><Search size={15} className="absolute left-3 top-2.5 text-gray-400" /><input aria-label="Tìm module" value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm module…" className="h-9 w-52 rounded border border-gray-300 bg-white pl-9 pr-3 text-sm outline-none focus:border-blue-500" /></div>
            <button type="button" disabled={loading || saving} onClick={() => void loadRanks()} className="inline-flex h-9 items-center gap-2 rounded border border-gray-300 px-3 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"><RefreshCw size={15} />Làm mới</button>
            <button type="button" disabled={!dirty || loading || saving} onClick={() => changeGrants(new Set(config.grants))} className="inline-flex h-9 items-center gap-2 rounded border border-gray-300 bg-white px-3 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"><RotateCcw size={15} />Đặt lại</button>
            <button type="button" disabled={!dirty || !rank || loading || saving || !!error} onClick={() => void save()} className="inline-flex h-9 items-center gap-2 rounded bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40"><Save size={15} />{saving ? 'Đang lưu…' : 'Lưu thay đổi'}</button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50/60 p-4 lg:p-5">
          {error && <p className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-red-700">{error}</p>}
          {loading ? <p className="p-2 text-gray-500">Đang tải cấu hình…</p> : !rank ? <p className="p-2 text-gray-500">Chọn một chức danh bên trái để xem và điều chỉnh quyền.</p> : !error && <div className="mx-auto max-w-6xl space-y-5">
            {groups.map(group => {
              const rows = modules.filter(m => m.group === group && m.name.toLowerCase().includes(search.toLowerCase()))
              if (!rows.length) return null
              return <section key={group} aria-label={group}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                  <h2 className="text-sm font-semibold text-gray-800">{group}</h2>
                </div>
                <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                  {rows.map(m => {
                    const enabled = grants.has(m.code + '.access')
                    const allActionsSelected = enabled && m.actions.length > 0 && m.actions.every(action => grants.has(m.code + '.' + action))
                    const someActionsSelected = enabled && m.actions.some(action => grants.has(m.code + '.' + action))
                    const expanded = expandedModules.has(m.code)
                    return <div key={m.code} className="border-b border-gray-100 last:border-b-0">
                      <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-5">
                          <button type="button" aria-expanded={expanded} aria-controls={`module-actions-${m.code}`} aria-label={`${expanded ? 'Thu gọn' : 'Mở'} quyền thao tác: ${m.name}`} onClick={() => setExpandedModules(previous => {
                            const next = new Set(previous)
                            if (next.has(m.code)) next.delete(m.code)
                            else next.add(m.code)
                            return next
                          })} className="inline-flex min-w-0 items-center gap-3 rounded py-1 text-left text-sm font-medium text-gray-900 hover:text-blue-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
                            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            <span>{m.name}</span>
                          </button>
                          <div className="shrink-0"><AccessToggle checked={enabled} disabled={saving} label={`Truy cập ${m.name}`} onChange={() => toggleModule(m.code)} /></div>
                      </div>
                      <div id={`module-actions-${m.code}`} hidden={!expanded} className={expanded ? 'grid grid-cols-2 gap-x-5 gap-y-3 border-t border-gray-100 bg-gray-50/50 px-4 py-4 sm:grid-cols-3 lg:px-5 xl:grid-cols-4' : 'hidden'}>
                        <label className="inline-flex cursor-pointer items-center gap-2.5 text-sm font-medium text-gray-600">
                          <PermissionCheckbox checked={allActionsSelected} partial={someActionsSelected && !allActionsSelected} disabled={saving || !m.actions.length} label={`Tất cả quyền thao tác: ${m.name}`} onChange={() => changeGrants(prev => {
                            const next = new Set(prev)
                            if (!allActionsSelected) next.add(m.code + '.access')
                            for (const action of m.actions) {
                              if (allActionsSelected) next.delete(m.code + '.' + action)
                              else next.add(m.code + '.' + action)
                            }
                            return next
                          })} />Tất cả
                        </label>
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
