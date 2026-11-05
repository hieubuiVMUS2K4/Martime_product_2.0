import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/services/api.client'

interface CrewNameOption { crewId: string; fullName: string; rankName?: string }

export function CrewNameSelect({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const query = useQuery({ queryKey: ['crew-name-options'], queryFn: () => apiClient.get<CrewNameOption[]>('/crew/options'), staleTime: 60_000 })
  const options = query.data || []
  return <div className="min-w-0 flex-1">
    <select aria-label={label} value={value} onChange={event => onChange(event.target.value)} disabled={query.isLoading}
      className="w-full min-w-0 border border-gray-300 bg-white px-2 py-1.5 text-sm disabled:bg-gray-50">
      <option value="">{query.isLoading ? 'Đang tải thuyền viên...' : '-- Chọn thuyền viên --'}</option>
      {value && !options.some(crew => crew.fullName === value) && <option value={value}>{value}</option>}
      {options.map(crew => <option key={crew.crewId} value={crew.fullName}>{crew.fullName}{crew.rankName ? ` · ${crew.rankName}` : ''} · {crew.crewId}</option>)}
    </select>
    {query.error && <button type="button" className="mt-1 text-xs text-red-600 hover:underline" onClick={() => void query.refetch()}>Không tải được thuyền viên. Thử lại</button>}
  </div>
}
