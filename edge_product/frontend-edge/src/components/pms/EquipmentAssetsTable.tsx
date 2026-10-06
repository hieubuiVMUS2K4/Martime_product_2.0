import { PermissionGate } from '@/components/auth/PermissionGate'
import { Link2, Pencil, Search, Trash2 } from 'lucide-react';
import type { EquipmentAsset } from '@/types/pms.types';
import type { EquipmentFilters } from './equipment-assets-filters';

interface Props {
  assets: EquipmentAsset[];
  allAssets: EquipmentAsset[];
  selectedRows: Set<string>;
  rowOffset: number;
  filters: EquipmentFilters;
  onFilter: (key: keyof EquipmentFilters, value: string) => void;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  onMaterials: (asset: EquipmentAsset) => void;
  onEdit: (asset: EquipmentAsset) => void;
  onDelete: (asset: EquipmentAsset) => void;
}

const statuses: Record<string, string> = {
  ACTIVE: 'Đang hoạt động', STANDBY: 'Dự phòng', UNDER_MAINTENANCE: 'Đang bảo trì',
  DECOMMISSIONED: 'Ngừng sử dụng', IN_STORAGE: 'Trong kho',
};
const date = (value?: string) => value ? new Date(value).toLocaleString('vi-VN') : '—';

// Keep operational columns visible; internal IDs and audit fields remain available in the API.
const columns: Array<{ key: keyof EquipmentAsset; label: string; width: number; format?: (asset: EquipmentAsset) => string }> = [
  { key: 'assetName', label: 'Tiêu đề', width: 260 },
  { key: 'assetCode', label: 'Mã thiết bị', width: 150 },
  { key: 'category', label: 'Phân loại', width: 150 },
  { key: 'status', label: 'Trạng thái', width: 170, format: a => statuses[a.status] || a.status },
  { key: 'manufacturer', label: 'Hãng sản xuất', width: 180 },
  { key: 'model', label: 'Model', width: 160 },
  { key: 'serialNumber', label: 'Serial', width: 170 },
  { key: 'installationDate', label: 'Ngày lắp đặt', width: 230, format: a => date(a.installationDate) },
  { key: 'currentRunningHours', label: 'Giờ chạy hiện tại', width: 170 },
  { key: 'lastRunningHoursUpdate', label: 'Cập nhật giờ chạy', width: 230, format: a => date(a.lastRunningHoursUpdate) },
  { key: 'technicalSpecs', label: 'Thông số kỹ thuật', width: 260 },
  { key: 'picCrewName', label: 'Người phụ trách', width: 220, format: a => a.picCrewName || (a.picCrewId ? 'Không tìm thấy thuyền viên' : 'Chưa có người phụ trách') },
];

export function EquipmentAssetsTable(props: Props) {
  const { assets, selectedRows, filters } = props;
  const cellBorder = (key: string) => key === columns[columns.length - 1].key ? 'border-b' : 'border-b border-r';
  const pinned = (key: string) => key === 'assetName' ? 'sticky left-20 z-20' : '';
  const value = (asset: EquipmentAsset, column: typeof columns[number]) => {
    const raw = column.format ? column.format(asset) : asset[column.key];
    return raw == null || raw === '' ? '—' : String(raw);
  };

  return <div className="min-h-0 min-w-0 flex-1 overflow-x-scroll overflow-y-auto" aria-label="Danh sách thiết bị">
    <table className="table-fixed border-separate border-spacing-0 text-sm" style={{ width: columns.reduce((sum, c) => sum + c.width, 200) }}>
      <colgroup><col style={{ width: 40 }} /><col style={{ width: 40 }} />{columns.map(c => <col key={c.key} style={{ width: c.width }} />)}<col style={{ width: 120 }} /></colgroup>
      <thead className="sticky top-0 z-30">
        <tr>
          <th className="sticky left-0 z-40 border-b border-r border-gray-200 bg-blue-50 px-2 py-2 text-xs text-gray-600">TT</th>
          <th className="sticky left-10 z-40 border-b border-r border-gray-200 bg-blue-50 px-2 py-2"><input aria-label="Chọn tất cả thiết bị trên trang" type="checkbox" checked={assets.length > 0 && assets.every(a => selectedRows.has(a.id))} onChange={props.onToggleAll} /></th>
          {columns.map(c => <th key={c.key} title={c.label} className={`${cellBorder(c.key)} border-gray-200 bg-blue-50 px-3 py-2 text-left text-xs font-semibold text-gray-600 ${pinned(c.key)}`}><span className="block truncate">{c.label}</span></th>)}
          <th className="sticky right-0 z-40 border-b border-l border-gray-200 bg-blue-50 px-2 py-2 text-xs text-gray-600">Hành động</th>
        </tr>
        <tr>
          <th className="sticky left-0 z-40 border-b border-r border-gray-200 bg-white" />
          <th className="sticky left-10 z-40 border-b border-r border-gray-200 bg-white" />
          {columns.map(c => <th key={c.key} className={`${cellBorder(c.key)} border-gray-200 bg-white px-2 py-1 ${pinned(c.key)}`}>
            {c.key === 'status' || c.key === 'category' ? (
              <select aria-label={'Lọc ' + c.label} value={filters[c.key]} onChange={e => props.onFilter(c.key as 'status' | 'category', e.target.value)} className="w-full rounded border border-gray-200 bg-white py-0.5 text-xs font-normal">
                <option value="">Tất cả</option>
                {c.key === 'status' ? Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>) : [...new Set(props.allAssets.filter(a => a.category !== 'SYSTEM').map(a => a.category))].sort().map(key => <option key={key} value={key}>{key === 'UNCLASSIFIED' ? 'Chưa phân loại' : key}</option>)}
              </select>
            ) : c.key in filters && (
              <div className="flex items-center gap-1 rounded border border-gray-200 px-1.5 py-0.5"><input aria-label={'Tìm theo ' + c.label} value={filters[c.key as keyof EquipmentFilters]} onChange={e => props.onFilter(c.key as keyof EquipmentFilters, e.target.value)} placeholder="Tìm kiếm" className="min-w-0 flex-1 bg-transparent text-xs font-normal outline-none" /><Search className="h-3 w-3 shrink-0 text-gray-400" /></div>
            )}
          </th>)}
          <th className="sticky right-0 z-40 border-b border-l border-gray-200 bg-white" />
        </tr>
      </thead>
      <tbody>
        {!assets.length && <tr><td colSpan={columns.length + 3} className="p-8 text-sm text-gray-400">Không có thiết bị trong nhánh đã chọn.</td></tr>}
        {assets.map((asset, index) => {
          const background = selectedRows.has(asset.id) ? 'bg-blue-50' : index % 2 ? 'bg-slate-50' : 'bg-white';
          return <tr key={asset.id}>
            <td className={`sticky left-0 z-10 border-b border-r border-gray-100 px-2 py-2 text-center text-xs text-gray-500 ${background}`}>{props.rowOffset + index + 1}</td>
            <td className={`sticky left-10 z-10 border-b border-r border-gray-100 px-2 py-2 text-center ${background}`}><input aria-label={`Chọn ${asset.assetName}`} type="checkbox" checked={selectedRows.has(asset.id)} onChange={() => props.onToggleRow(asset.id)} /></td>
            {columns.map(c => <td key={c.key} title={value(asset, c)} className={`${cellBorder(c.key)} border-gray-100 px-3 py-2 text-xs ${c.key === 'assetName' ? 'font-medium text-blue-700' : 'text-gray-600'} ${pinned(c.key)} ${background}`}><span className="block truncate">{value(asset, c)}</span></td>)}
            <td className={`sticky right-0 z-20 border-b border-l border-gray-100 px-2 py-2 ${background}`}>
              <div className="flex justify-center gap-1">
                <button type="button" onClick={() => props.onMaterials(asset)} title="Vật tư liên kết" aria-label={`Vật tư liên kết của ${asset.assetName}`} className="rounded p-1 text-blue-600 hover:bg-blue-100"><Link2 className="h-4 w-4" /></button>
                <PermissionGate permission="pms.assets.update"><button type="button" onClick={() => props.onEdit(asset)} title="Chỉnh sửa thiết bị" aria-label={`Chỉnh sửa ${asset.assetName}`} className="rounded p-1 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button></PermissionGate>
                <PermissionGate permission="pms.assets.delete"><button type="button" onClick={() => props.onDelete(asset)} title="Xóa thiết bị" aria-label={`Xóa ${asset.assetName}`} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></PermissionGate>
              </div>
            </td>
          </tr>;
        })}
      </tbody>
    </table>
  </div>;
}
