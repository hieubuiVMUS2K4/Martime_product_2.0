import { useEffect, useState } from 'react'
import { Boxes, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Button, FormAlert, PageHeader } from '../../components/common'
import { SHORE_MODULES, useShoreModules } from '../../contexts/ShoreModulesContext'

export default function ShoreModulesPage() {
  const { state, loading, error, reload, save } = useShoreModules()
  const [draft, setDraft] = useState<string[]>(state.disabledModules)
  const [version, setVersion] = useState(state.version)
  const [saving, setSaving] = useState(false), [saveError, setSaveError] = useState('')
  useEffect(() => { setDraft(state.disabledModules); setVersion(state.version) }, [state])
  const dirty = [...draft].sort().join() !== [...state.disabledModules].sort().join()
  const submit = async () => {
    setSaving(true); setSaveError('')
    try { await save(draft, version); toast.success('Đã cập nhật các module trên Shore.') }
    catch (e) { setSaveError(e instanceof Error ? e.message : 'Không thể lưu cấu hình.') }
    finally { setSaving(false) }
  }
  return <div className="mx-auto max-w-5xl p-4 sm:p-5">
    <PageHeader icon={<Boxes />} title="Quản lý module"
      description="Bật/tắt các phân hệ cho toàn bộ giao diện Shore. Cấu hình không thay đổi dữ liệu hay quyền trên tàu."
      actions={<><Button disabled={loading || saving || !dirty} onClick={() => { setDraft(state.disabledModules); setSaveError('') }}>Đặt lại</Button>
        <Button variant="primary" icon={<Save />} disabled={loading || !!error || !dirty} loading={saving} onClick={() => void submit()}>Lưu thay đổi</Button></>} />
    <FormAlert>{error || saveError}</FormAlert>
    {error && <Button onClick={() => void reload()}>Tải lại cấu hình</Button>}
    <div className="mb-3 rounded border border-line bg-primary-soft px-4 py-3 text-sm text-ink-muted">
      Module tắt sẽ ẩn khỏi menu và không mở được bằng đường dẫn trực tiếp. Admin luôn truy cập được trang này để bật lại.
      {state.updatedAt && <p className="mt-1 text-xs">Cập nhật lần cuối: {new Date(state.updatedAt).toLocaleString('vi-VN')}{state.updatedBy ? ` · ${state.updatedBy}` : ''}</p>}
    </div>
    {loading ? <p role="status" className="p-6 text-center text-sm text-ink-muted">Đang tải cấu hình...</p> : <div className="overflow-hidden rounded-md border border-grid-strong bg-surface">
      <div className="flex items-center justify-between border-b border-grid bg-canvas px-4 py-3 text-sm font-semibold text-ink">
        <span>Module trên bờ</span><span>{SHORE_MODULES.length - draft.length}/{SHORE_MODULES.length} đang bật</span>
      </div>
      {SHORE_MODULES.map(module => {
        const on = !draft.includes(module.key)
        return <div key={module.key} className="flex items-center justify-between gap-4 border-b border-line px-4 py-4 last:border-0">
          <div><label htmlFor={`module-${module.key}`} className="cursor-pointer text-sm font-semibold text-ink">{module.name}</label><p id={`module-${module.key}-description`} className="mt-1 text-xs text-ink-muted">{module.description}</p></div>
          <div className="flex shrink-0 items-center gap-3"><span className={`text-xs ${on ? 'text-emerald-700' : 'text-ink-muted'}`}>{on ? 'Đang bật' : 'Đã tắt'}</span>
            <button id={`module-${module.key}`} role="switch" aria-checked={on} aria-label={module.name} aria-describedby={`module-${module.key}-description`}
              disabled={saving || !!error} onClick={() => setDraft(previous => on ? [...previous, module.key] : previous.filter(key => key !== module.key))}
              className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-50 ${on ? 'bg-primary' : 'bg-slate-300'}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'left-0.5 translate-x-5' : 'left-0.5'}`} /></button>
          </div>
        </div>
      })}
    </div>}
  </div>
}
