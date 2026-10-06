import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, X } from 'lucide-react';
import { apiClient } from '@/services/api.client';

interface Entry { id: string; executedAt: string; executedRunningHours?: number; completedBy?: string;
  completedByName?: string; actualDurationHours?: number; notes?: string; hasReport: boolean }
interface Report { task: Record<string, unknown>; checklist: Record<string, unknown>[];
  riskAssessment?: Record<string, unknown>; inspectionReport?: Record<string, unknown>; details?: Record<string, unknown>[] }
interface Detail { id: string; executedAt: string; notes?: string; sparePartsUsed?: string; report?: Report }
const date = (value?: string) => value ? new Date(value).toLocaleString('vi-VN') : '—';
const labels: Record<string, string> = {
  jobName: 'Công việc', equipmentName: 'Thiết bị', location: 'Vị trí', assessmentDate: 'Ngày đánh giá',
  personnel: 'Nhân sự', raNumber: 'Số đánh giá', shipName: 'Tên tàu', equipmentCode: 'Mã thiết bị',
  maintenanceType: 'Loại bảo trì', maintenanceDate: 'Ngày bảo trì', jobItemsJson: 'Nội dung kiểm tra',
  hazardsJson: 'Mối nguy', riskItemsJson: 'Đánh giá rủi ro', notes: 'Ghi chú', status: 'Trạng thái',
  preparedBy: 'Người lập', checkedBy: 'Người kiểm tra', approvedBy: 'Người duyệt',
};
function parseArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
}
function FormValues({ values }: { values?: Record<string, unknown> }) {
  if (!values) return <p className="text-xs text-gray-400">Không có biểu mẫu</p>;
  return <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs">{Object.entries(values)
    .filter(([key, value]) => !/^(id|taskId|isSynced|createdAt|updatedAt|originNode)$/i.test(key) && value != null && value !== '')
    .map(([key, value]) => <div key={key} className="min-w-0 border-b border-gray-100 pb-2">
      <dt className="mb-1 text-gray-500">{labels[key] || key.replace(/([A-Z])/g, ' $1')}</dt>
      <dd className="whitespace-pre-wrap break-words text-gray-800">{String(value)}</dd>
    </div>)}</dl>;
}

export function MaintenanceHistoryModal({ task, onClose }: {
  task: { id: string; taskId: string; taskDescription: string }; onClose: () => void;
}) {
  const [page, setPage] = useState(1);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setDetail(null);
    apiClient.get<{ items: Entry[]; total: number }>(`/maintenance/tasks/${task.id}/history?page=${page}&pageSize=10`)
      .then(data => { if (active) { setEntries(data.items); setTotal(data.total); } })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : 'Không thể tải lịch sử bảo trì'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [task.id, page, retry]);
  const viewReport = async (id: string) => {
    setDetailLoading(true); setError('');
    try { setDetail(await apiClient.get<Detail>(`/maintenance/tasks/${task.id}/history/${id}`)); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không thể tải báo cáo'); }
    finally { setDetailLoading(false); }
  };
  const report = detail?.report;
  const usedMaterials = parseArray(report?.task.sparePartsUsed || detail?.sparePartsUsed);
  let photos: string[] = [];
  try {
    const parsed = JSON.parse(String(report?.task.completionPhotos || '[]'));
    if (Array.isArray(parsed)) photos = parsed.filter((url): url is string => typeof url === 'string' && /^(https?:\/\/|\/|data:image\/)/i.test(url));
  } catch { /* Old reports may contain no photo list. */ }
  return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-label="Lịch sử bảo trì" className="flex max-h-[85vh] w-full max-w-[1440px] flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
      <div className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-200 px-6 py-4">
        <div className="min-w-0"><h2 className="text-lg font-semibold text-gray-900">Lịch sử bảo trì</h2>
          <p className="mt-1 text-xs text-gray-500">{task.taskId} · {task.taskDescription.split('\n')[0]}</p></div>
        <button onClick={onClose} aria-label="Đóng lịch sử bảo trì" title="Đóng" className="shrink-0 rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"><X size={20} /></button>
      </div>
      <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-2 text-xs text-gray-600">{loading ? 'Đang tải…' : `${entries.length} / ${total} lần bảo trì`}</div>
      <div className="min-h-0 flex-1 overflow-auto">
        {error && <div className="m-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error} <button onClick={() => setRetry(n => n + 1)} className="ml-3 underline">Thử lại</button></div>}
        <table className="w-full min-w-[800px] table-fixed border-collapse text-xs [&_th]:border-r [&_th]:border-gray-200 [&_th]:px-2 [&_th]:py-2 [&_th]:font-medium [&_td]:border-r [&_td]:border-gray-100 [&_td]:px-2 [&_td]:py-1.5">
          <colgroup><col className="w-14" /><col className="w-56" /><col /><col className="w-32" /><col className="w-40" /><col className="w-28" /></colgroup>
          <thead className="sticky top-0 z-10 border-b border-gray-200 bg-blue-50 text-gray-700"><tr>
            {['Lần', 'Ngày thực hiện', 'Người thực hiện', 'Giờ chạy', 'Thời lượng (giờ)', 'Hành động'].map((name, index) => <th key={name} className={index === 5 ? 'sticky right-0 bg-blue-50 text-center' : index === 0 || index >= 3 ? 'text-center' : 'text-left'}>{name}</th>)}
          </tr></thead>
          <tbody>{loading ? <tr><td colSpan={6} className="py-8 text-center text-gray-400">Đang tải…</td></tr>
            : entries.length === 0 ? <tr><td colSpan={6} className="py-8 text-center text-gray-400">Chưa có lần bảo trì hoàn thành</td></tr>
            : entries.map((entry, index) => <tr key={entry.id} className="group border-b border-gray-100 bg-white text-gray-700 hover:bg-blue-50">
              <td className="text-center text-gray-500">{total - ((page - 1) * 10 + index)}</td>
              <td className="whitespace-nowrap">{date(entry.executedAt)}</td>
              <td className="truncate" title={entry.completedByName || entry.completedBy}>{entry.completedByName || entry.completedBy || '—'}</td>
              <td className="text-center tabular-nums">{entry.executedRunningHours ?? '—'}</td>
              <td className="text-center tabular-nums">{entry.actualDurationHours?.toFixed(2) ?? '—'}</td>
              <td className="sticky right-0 bg-white text-center group-hover:bg-blue-50"><button disabled={detailLoading} onClick={() => void viewReport(entry.id)} aria-label="Xem báo cáo lần bảo trì" title="Xem báo cáo lần bảo trì" className="inline-flex rounded p-1 text-gray-400 hover:bg-blue-100 hover:text-blue-600 disabled:cursor-not-allowed disabled:opacity-40"><Eye size={15} /></button></td>
            </tr>)}</tbody>
        </table>
        {detailLoading && <p className="p-4 text-sm text-gray-500">Đang tải báo cáo…</p>}
        {detail && !detailLoading && <div className="space-y-5 border-t border-gray-200 p-5">
          <h3 className="text-sm font-semibold">Báo cáo bảo trì · {date(detail.executedAt)}</h3>
          {!report && <p className="text-xs text-gray-500">Lần bảo trì cũ chưa có bản lưu đầy đủ báo cáo.</p>}
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div><span className="text-gray-500">Người duyệt: </span>{String(report?.task.verifiedBy || report?.task.approvedBy || '—')}</div>
            <div><span className="text-gray-500">Ngày duyệt: </span>{date(report?.task.verifiedAt as string)}</div>
            <div className="col-span-2 whitespace-pre-wrap"><span className="text-gray-500">Kết quả / ghi chú: </span>{String(report?.task.notes || detail.notes || '—')}</div>
            <div className="col-span-2 whitespace-pre-wrap"><span className="text-gray-500">Ý kiến phê duyệt: </span>{String(report?.task.verificationNotes || '—')}</div>
          </div>
          <section><h4 className="mb-2 text-sm font-medium">Checklist</h4>
            <table className="w-full text-xs"><thead className="bg-blue-50"><tr>{['Nội dung', 'Kết quả', 'Giá trị đo', 'Ghi chú'].map(label => <th key={label} className="border border-gray-200 p-2 text-left">{label}</th>)}</tr></thead>
              <tbody>{(report?.checklist || []).map((item, index) => <tr key={index}>{[item.checkpointDescription || item.description || item.equipmentAssetName || '—', item.isCompleted ? 'Hoàn thành' : 'Chưa hoàn thành', item.readingValue ?? '—', item.remarks || '—'].map((value, i) => <td key={i} className="border border-gray-100 p-2">{String(value)}</td>)}</tr>)}</tbody></table>
          </section>
          <section><h4 className="mb-2 text-sm font-medium">Vật tư đã sử dụng</h4>
            {usedMaterials.length === 0 ? <p className="text-xs text-gray-400">Không có vật tư sử dụng</p> : <table className="w-full text-xs"><tbody>{usedMaterials.map((item, index) => <tr key={index}><td className="border border-gray-100 p-2">{String(item.materialCode || item.materialName || '—')}</td><td className="border border-gray-100 p-2">{String(item.quantityUsed ?? item.quantity ?? item.quantityRequired ?? '—')}</td></tr>)}</tbody></table>}
          </section>
          {!!report?.details?.length && <section><h4 className="mb-2 text-sm font-medium">Chi tiết kiểm tra</h4>
            <div className="space-y-3">{report.details.map((item, index) => <FormValues key={index} values={item} />)}</div>
          </section>}
          {!!photos.length && <section><h4 className="mb-2 text-sm font-medium">Ảnh bảo trì</h4>
            <div className="grid grid-cols-3 gap-3">{photos.map((url, index) => <a key={index} href={url} target="_blank" rel="noreferrer"><img src={url} alt={`Ảnh bảo trì ${index + 1}`} loading="lazy" className="h-40 w-full rounded border border-gray-200 object-contain" /></a>)}</div>
          </section>}
          <details className="rounded border border-gray-200 p-3"><summary className="cursor-pointer text-sm font-medium">Đánh giá rủi ro</summary><div className="mt-3"><FormValues values={report?.riskAssessment} /></div></details>
          <details className="rounded border border-gray-200 p-3"><summary className="cursor-pointer text-sm font-medium">Biên bản kiểm tra</summary><div className="mt-3"><FormValues values={report?.inspectionReport} /></div></details>
        </div>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-6 py-3 text-xs text-gray-600">
        <span>{total} lần bảo trì</span><div className="flex items-center gap-2">
          <button disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40">Trước</button>
          <span>{page} / {Math.max(1, Math.ceil(total / 10))}</span>
          <button disabled={page * 10 >= total || loading} onClick={() => setPage(p => p + 1)} className="rounded border border-gray-300 px-3 py-1.5 disabled:opacity-40">Sau</button>
          <button onClick={onClose} className="ml-2 rounded border border-gray-300 bg-white px-4 py-2 text-sm hover:bg-gray-100">Đóng</button>
        </div></div>
    </div>
  </div>, document.body);
}
