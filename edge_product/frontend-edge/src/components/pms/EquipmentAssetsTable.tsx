import { PermissionGate } from '@/components/auth/PermissionGate'
import type { ReactNode } from 'react';
import { Link2, Pencil, Trash2 } from 'lucide-react';
import type { EquipmentAsset } from '@/types/pms.types';
import { DataTable, TableActions, type Column } from '@/components/common/DataTable';

interface Props {
  /** Thiết bị đã lọc theo nhánh cây đang chọn (bảng tự tìm / lọc cột / phân trang). */
  assets: EquipmentAsset[];
  selectedRows: Set<string | number>;
  onSelectionChange: (next: Set<string | number>) => void;
  onMaterials: (asset: EquipmentAsset) => void;
  onEdit: (asset: EquipmentAsset) => void;
  onDelete: (asset: EquipmentAsset) => void;
  /** Nút riêng đặt trên thanh công cụ của bảng. */
  toolbarActions?: ReactNode;
}

const statuses: Record<string, string> = {
  ACTIVE: 'Đang hoạt động', STANDBY: 'Dự phòng', UNDER_MAINTENANCE: 'Đang bảo trì',
  DECOMMISSIONED: 'Ngừng sử dụng', IN_STORAGE: 'Trong kho',
};
const categoryLabel = (c?: string) => (c === 'UNCLASSIFIED' ? 'Chưa phân loại' : c ?? '');
const dateTime = (value?: string) => (value ? new Date(value).toLocaleString('vi-VN') : '');
const picOf = (a: EquipmentAsset) => a.picCrewName || (a.picCrewId ? 'Không tìm thấy thuyền viên' : 'Chưa có người phụ trách');
const dash = (v?: string | number | null) => (v == null || v === '' ? <span className="text-gray-400">—</span> : v);

// Giữ các cột vận hành; mã nội bộ và trường kiểm toán vẫn có trong API.
const columns = (props: Props): Column<EquipmentAsset>[] => [
  { key: 'assetName', header: 'Tiêu đề', width: 240, value: a => a.assetName, className: 'font-medium text-blue-700' },
  { key: 'assetCode', header: 'Mã thiết bị', width: 150, value: a => a.assetCode, className: 'font-mono' },
  { key: 'category', header: 'Phân loại', width: 140, value: a => categoryLabel(a.category) },
  { key: 'status', header: 'Trạng thái', width: 150, align: 'center', value: a => statuses[a.status] || a.status },
  { key: 'manufacturer', header: 'Hãng sản xuất', width: 160, value: a => a.manufacturer ?? '', render: a => dash(a.manufacturer) },
  { key: 'model', header: 'Model', width: 150, value: a => a.model ?? '', render: a => dash(a.model) },
  { key: 'serialNumber', header: 'Serial', width: 150, value: a => a.serialNumber ?? '', className: 'font-mono', render: a => dash(a.serialNumber) },
  { key: 'installationDate', header: 'Ngày lắp đặt', width: 170, align: 'center', value: a => a.installationDate ?? '', filter: a => dateTime(a.installationDate),
    exportValue: a => dateTime(a.installationDate), render: a => dash(dateTime(a.installationDate)) },
  { key: 'currentRunningHours', header: 'Giờ chạy hiện tại', width: 130, numeric: true, value: a => a.currentRunningHours ?? null,
    render: a => dash(a.currentRunningHours?.toLocaleString('vi-VN')) },
  { key: 'lastRunningHoursUpdate', header: 'Cập nhật giờ chạy', width: 170, align: 'center', value: a => a.lastRunningHoursUpdate ?? '', filter: a => dateTime(a.lastRunningHoursUpdate),
    exportValue: a => dateTime(a.lastRunningHoursUpdate), render: a => dash(dateTime(a.lastRunningHoursUpdate)) },
  { key: 'technicalSpecs', header: 'Thông số kỹ thuật', width: 220, value: a => a.technicalSpecs ?? '', render: a => dash(a.technicalSpecs) },
  { key: 'picCrewName', header: 'Người phụ trách', width: 190, value: picOf },
  {
    key: 'actions', header: 'Hành động', width: 110, align: 'center', exportable: false,
    render: asset => (
      <TableActions>
        <button type="button" onClick={() => props.onMaterials(asset)} title="Vật tư liên kết" aria-label={`Vật tư liên kết của ${asset.assetName}`} className="rounded p-1 text-blue-600 hover:bg-blue-100"><Link2 className="h-4 w-4" /></button>
        <PermissionGate permission="pms.assets.update"><button type="button" onClick={() => props.onEdit(asset)} title="Chỉnh sửa thiết bị" aria-label={`Chỉnh sửa ${asset.assetName}`} className="rounded p-1 text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button></PermissionGate>
        <PermissionGate permission="pms.assets.delete"><button type="button" onClick={() => props.onDelete(asset)} title="Xóa thiết bị" aria-label={`Xóa ${asset.assetName}`} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></PermissionGate>
      </TableActions>
    ),
  },
];

export function EquipmentAssetsTable(props: Props) {
  return (
    <DataTable
      flush
      showCount={false}
      columns={columns(props)}
      data={props.assets}
      rowKey={a => a.id}
      itemLabel="thiết bị"
      emptyMessage="Không có thiết bị trong nhánh đã chọn."
      searchPlaceholder="Tìm tên, mã thiết bị, hãng, model, serial..."
      exportOptions={{ fileName: 'danh-sach-thiet-bi', title: 'DANH SÁCH THIẾT BỊ' }}
      selection={{ selected: props.selectedRows, onChange: props.onSelectionChange }}
      toolbarActions={props.toolbarActions}
      minWidth={2000}
    />
  );
}
