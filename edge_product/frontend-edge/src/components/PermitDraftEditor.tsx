import { useState } from 'react'
import { toast } from 'sonner'
import { apiClient } from '@/services/api.client'
import { PermissionGate } from './auth/PermissionGate'

export function PermitDraftEditor({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [draft, setDraft] = useState<any>()
  const [risks, setRisks] = useState<any[]>([])
  const [device, setDevice] = useState('')
  const open = async () => {
    try { const permits = await apiClient.get<any[]>('/hsqe/permits'); const selected = permits.find(p => p.id === id); const date = new Date(selected.startTime); selected.startTime = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); setDraft(selected); setRisks(await apiClient.get<any[]>('/hsqe/risks')) }
    catch (error: any) { toast.error(error.message) }
  }
  const save = async () => {
    try {
      await apiClient.put(`/hsqe/permits/${id}`, { ...draft, startTime: new Date(draft.startTime).toISOString() })
      if (device.trim()) await apiClient.post(`/hsqe/permits/${id}/gas-test`, { gasTestO2: Number(draft.gasTestO2), gasTestLEL: Number(draft.gasTestLEL), gasTestCO: Number(draft.gasTestCO), gasTestH2S: Number(draft.gasTestH2S), device })
      setDraft(undefined); onChanged(); toast.success('Đã lưu nháp')
    } catch (error: any) { toast.error(error.message) }
  }
  return <PermissionGate permission="hsqe.update"><button onClick={open} className="border rounded px-3 py-2">Sửa nội dung / đo khí</button>
    {draft && <div className="border rounded p-3 space-y-2">
      <label className="block">Công việc<input className="border rounded w-full p-2" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} /></label>
      <label className="block">Địa điểm<input className="border rounded w-full p-2" value={draft.location} onChange={e => setDraft({ ...draft, location: e.target.value })} /></label>
      <label className="block">Bắt đầu<input type="datetime-local" className="border rounded p-2" value={draft.startTime?.slice(0, 16)} onChange={e => setDraft({ ...draft, startTime: e.target.value })} /></label>
      <label className="block">Thời hạn (giờ)<input type="number" min={1} max={24} value={draft.durationHours} onChange={e => setDraft({ ...draft, durationHours: Number(e.target.value) })} /></label>
      <label className="block">Đánh giá rủi ro<select value={draft.riskAssessmentId || ''} onChange={e => setDraft({ ...draft, riskAssessmentId: e.target.value })}><option value="">Chọn đánh giá</option>{risks.map(r => <option key={r.id} value={r.id}>{r.jobTitle}</option>)}</select></label>
      <fieldset><legend>Biện pháp an toàn</legend>{JSON.parse(draft.precautionsJson || '[]').filter((p: any) => p.label !== '__prepared_by__').map((p: any, index: number) => <label className="block" key={index}><input type="checkbox" checked={p.checked} onChange={e => { const precautions = JSON.parse(draft.precautionsJson || '[]'); const item = precautions.find((item: any) => item.label === p.label); item.checked = e.target.checked; setDraft({ ...draft, precautionsJson: JSON.stringify(precautions) }) }} /> {p.label}</label>)}</fieldset>
      <label className="block">Mã thiết bị đo khí<input className="border rounded p-2" value={device} onChange={e => setDevice(e.target.value)} /></label>
      {Object.entries({ gasTestO2: 'O₂ (%)', gasTestLEL: 'LEL (%)', gasTestCO: 'CO (ppm)', gasTestH2S: 'H₂S (ppm)' }).map(([field, label]) => <label className="block" key={field}>{label}<input type="number" step="any" value={draft[field]} onChange={e => setDraft({ ...draft, [field]: e.target.value })} /></label>)}
      <button onClick={save} className="bg-blue-600 text-white rounded px-3 py-2">Lưu nháp</button><button onClick={() => setDraft(undefined)} className="ml-3">Hủy</button>
    </div>}
  </PermissionGate>
}
