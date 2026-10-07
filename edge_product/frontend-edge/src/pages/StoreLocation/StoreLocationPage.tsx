import { PermissionGate } from '@/components/auth/PermissionGate'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Plus, Trash2, Edit2, Save, X, FolderOpen, ChevronDown, ChevronRight } from 'lucide-react';
import { DataTable, TableActions, type Column } from '@/components/common/DataTable';
import { toast } from 'sonner';
import { storeLocationService } from '@/services/store-location.service';
import { useTranslationSafe } from '@/contexts/I18nContext';
import type { StoreLocation } from '@/types/pms.types';


export default function StoreLocationPage() {
  const { t } = useTranslationSafe();

  const [locations, setLocations] = useState<StoreLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [collapsedLocations, setCollapsedLocations] = useState<Set<string>>(new Set());

  const [selectedRows, setSelectedRows] = useState<Set<string | number>>(new Set());

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; nodeId: string | null } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const [modal, setModal] = useState<{ mode: 'add' | 'edit'; item?: StoreLocation } | null>(null);
  const [modalForm, setModalForm] = useState({
    locationCode: '',
    name: '',
    description: '',
    parentId: '' as string | null,
    address: '',
    managerName: '',
    phone: '',
    email: '',
  });
  const [modalSaving, setModalSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await storeLocationService.getAll();
      setLocations(data);
    } catch (error) {
      console.error('Error loading store locations:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    setSelectedRows(new Set());
    if (selectedLocationId && !locations.some(l => l.id === selectedLocationId)) setSelectedLocationId(null);
  }, [locations, selectedLocationId]);

  const renderLocation = (location: StoreLocation, depth: number, ancestors: Set<string> = new Set()): React.ReactNode => {
    if (ancestors.has(location.id)) return null;
    const path = new Set(ancestors).add(location.id);
    const children = locations.filter(l => l.parentId === location.id);
    const collapsed = collapsedLocations.has(location.id);
    return <div key={location.id}>
      <div className={'w-full flex items-center gap-1.5 pr-3 py-1.5 text-xs select-none ' + (selectedLocationId === location.id ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50')} style={{ paddingLeft: 12 + depth * 14 }}>
        <button type="button" aria-label={collapsed ? 'Mở nhánh kho' : 'Thu gọn nhánh kho'} aria-expanded={children.length ? !collapsed : undefined} disabled={!children.length} onClick={() => setCollapsedLocations(prev => { const next = new Set(prev); next.has(location.id) ? next.delete(location.id) : next.add(location.id); return next; })} className="h-3 w-3 shrink-0 text-blue-500 disabled:opacity-0">{collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}</button>
        <button type="button" onClick={() => setSelectedLocationId(location.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left"><FolderOpen className="h-3 w-3 shrink-0 text-amber-500" /><span className="flex-1 truncate leading-snug" title={location.name}>{location.name}</span>{children.length > 0 && <span className="shrink-0 text-[10px] font-normal text-gray-400">{children.length}</span>}</button>
      </div>
      {!collapsed && children.map(child => renderLocation(child, depth + 1, path))}
    </div>;
  };

  const locationMap = useMemo(() => {
    const m = new Map<string, StoreLocation>();
    locations.forEach(l => m.set(l.id, l));
    return m;
  }, [locations]);

  const filteredLocations = useMemo(() => {
    let data = locations;
    if (selectedLocationId) {
      const ids = new Set<string>();
      const pending = [selectedLocationId];
      while (pending.length) {
        const id = pending.pop()!;
        if (ids.has(id)) continue;
        ids.add(id);
        locations.filter(l => l.parentId === id).forEach(l => pending.push(l.id));
      }
      data = data.filter(l => ids.has(l.id));
    }


    return data;
  }, [locations, selectedLocationId]);

  useEffect(() => {
    if (!contextMenu) return;
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [contextMenu]);

  const handleBulkDelete = async () => {
    if (selectedRows.size === 0) return;
    toast(t('storeLocations.confirmBulkDelete', { count: selectedRows.size }), {
      action: {
        label: t('storeLocations.delete') || 'Xóa',
        onClick: async () => {
          try {
            await Promise.all([...selectedRows].map(id => storeLocationService.delete(String(id))));
            setSelectedRows(new Set());
            await loadData();
            toast.success('Xóa các vị trí kho thành công');
          } catch (err: any) {
            toast.error(err?.response?.data?.error || 'Delete failed');
          }
        }
      },
      cancel: { label: 'Hủy', onClick: () => {} },
      duration: 8000,
    });
  };

  const handleDelete = async (item: StoreLocation) => {
    toast(t('storeLocations.confirmDelete', { name: item.name }), {
      action: {
        label: t('storeLocations.delete') || 'Xóa',
        onClick: async () => {
          try {
            await storeLocationService.delete(item.id);
            await loadData();
            toast.success('Xóa vị trí kho thành công');
          } catch (err: any) {
            toast.error(err?.response?.data?.error || 'Delete failed');
          }
        }
      },
      cancel: { label: 'Hủy', onClick: () => {} },
      duration: 8000,
    });
  };

  const openAddModal = () => {
    setModal({ mode: 'add' });
    setModalForm({ locationCode: '', name: '', description: '', parentId: selectedLocationId, address: '', managerName: '', phone: '', email: '' });
  };

  const openEditModal = (item: StoreLocation) => {
    setModal({ mode: 'edit', item });
    setModalForm({
      locationCode: item.locationCode || '',
      name: item.name || '',
      description: item.description ?? '',
      parentId: item.parentId ?? null,
      address: item.address ?? '',
      managerName: item.managerName ?? '',
      phone: item.phone ?? '',
      email: item.email ?? '',
    });
  };

  const closeModal = () => { setModal(null); setModalSaving(false); };

  const handleModalSave = async () => {
    if (!modalForm.locationCode.trim() || !modalForm.name.trim()) {
      toast.warning('Vui lòng nhập mã kho và tên kho');
      return;
    }
    setModalSaving(true);
    try {
      if (modal?.mode === 'add') {
        await storeLocationService.create({
          locationCode: modalForm.locationCode.trim(),
          name: modalForm.name.trim(),
          description: modalForm.description || undefined,
          parentId: modalForm.parentId || undefined,
          address: modalForm.address || undefined,
          managerName: modalForm.managerName || undefined,
          phone: modalForm.phone || undefined,
          email: modalForm.email || undefined,
        });
        toast.success('Tạo vị trí kho thành công');
      } else if (modal?.item) {
        await storeLocationService.update(modal.item.id, {
          locationCode: modalForm.locationCode.trim(),
          name: modalForm.name.trim(),
          description: modalForm.description || null,
          parentId: modalForm.parentId || null,
          address: modalForm.address || null,
          managerName: modalForm.managerName || null,
          phone: modalForm.phone || null,
          email: modalForm.email || null,
        });
        toast.success('Lưu vị trí kho thành công');
      }
      await loadData();
      closeModal();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Lưu thất bại');
    } finally {
      setModalSaving(false);
    }
  };

  const excludeIds = modal?.mode === 'edit' && modal.item ? (() => {
    const ids = new Set<string>();
    const stack = [modal.item.id];
    while (stack.length) {
      const current = stack.pop()!;
      ids.add(current);
      locations.filter(l => l.parentId === current).forEach(c => stack.push(c.id));
    }
    return ids;
  })() : new Set<string>();



  const childCount = (id: string) => locations.filter(l => l.parentId === id).length;
  const muted = (v?: string | null) => v || <span className="text-gray-400">—</span>;

  const columns: Column<StoreLocation>[] = [
    {
      key: 'name', header: t('storeLocations.colName'), width: 240, value: l => l.name,
      render: l => (
        <button type="button" onClick={() => setSelectedLocationId(l.id)} title={l.name}
          className="flex w-full min-w-0 items-center gap-1.5 text-left font-medium text-blue-600 hover:underline">
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
          <span className="truncate">{l.name}</span>
          {childCount(l.id) > 0 && <span className="shrink-0 text-[11px] font-normal text-gray-400">({childCount(l.id)})</span>}
        </button>
      ),
    },
    { key: 'code', header: t('storeLocations.colCode'), width: 140, value: l => l.locationCode, className: 'font-mono' },
    { key: 'description', header: t('storeLocations.colDescription'), value: l => l.description ?? '', render: l => muted(l.description) },
    { key: 'address', header: t('storeLocations.colAddress'), width: 180, value: l => l.address ?? '', render: l => muted(l.address) },
    { key: 'manager', header: t('storeLocations.colManager'), width: 160, value: l => l.managerName ?? '', render: l => muted(l.managerName) },
    { key: 'phone', header: t('storeLocations.colPhone'), width: 130, value: l => l.phone ?? '', render: l => muted(l.phone) },
    { key: 'email', header: t('storeLocations.colEmail'), width: 190, value: l => l.email ?? '', render: l => muted(l.email) },
    {
      key: 'updatedAt', header: t('storeLocations.colUpdatedAt'), width: 110, align: 'center', value: l => l.updatedAt ?? '', filter: l => (l.updatedAt ? new Date(l.updatedAt).toLocaleDateString('vi-VN') : ''),
      exportValue: l => (l.updatedAt ? new Date(l.updatedAt).toLocaleDateString('vi-VN') : ''),
      render: l => (l.updatedAt ? new Date(l.updatedAt).toLocaleDateString('vi-VN') : '—'),
    },
    {
      key: 'actions', header: 'Hành động', width: 90, align: 'center', exportable: false,
      render: l => (
        <TableActions>
          <PermissionGate permission="pms.locations.update">
            <button type="button" onClick={() => openEditModal(l)} className="rounded p-1 text-gray-400 hover:bg-green-50 hover:text-green-600" title={t('storeLocations.edit')} aria-label={`${t('storeLocations.edit')} ${l.name}`}><Edit2 className="h-3.5 w-3.5" /></button>
          </PermissionGate>
          <PermissionGate permission="pms.locations.delete">
            <button type="button" onClick={() => handleDelete(l)} className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600" title={t('storeLocations.delete')} aria-label={`${t('storeLocations.delete')} ${l.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
          </PermissionGate>
        </TableActions>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 w-full min-w-0 flex flex-col overflow-hidden bg-white">
      <div className="flex flex-shrink-0 border-b border-gray-200">
        <button type="button" onClick={() => setSelectedLocationId(null)} className={'flex w-64 shrink-0 items-center gap-1.5 border-r border-gray-200 px-3 py-3 text-left text-sm font-semibold ' + (!selectedLocationId ? 'bg-blue-800 text-white' : 'bg-white text-gray-700')}>
          <FolderOpen className="h-4 w-4 shrink-0" /><span className="flex-1 truncate text-left">Tất cả kho</span>
        </button>
        <div className="min-w-0 flex-1 flex items-center justify-between gap-3 px-4 py-3 bg-white">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">
              ≡ {t('storeLocations.locationList')}
            </span>
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
              {filteredLocations.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <PermissionGate permission="pms.locations.delete"><button
              onClick={handleBulkDelete}
              disabled={selectedRows.size === 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border rounded ${selectedRows.size > 0 ? 'text-red-600 hover:bg-red-50 border-red-300' : 'text-gray-400 cursor-not-allowed border-gray-300'}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t('storeLocations.deleteMany')}{selectedRows.size > 0 ? ` (${selectedRows.size})` : ''}
            </button></PermissionGate>
            <PermissionGate permission="pms.locations.create"><button
              onClick={openAddModal}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white border border-blue-600 rounded font-medium hover:bg-blue-700"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm mới
            </button></PermissionGate>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex min-h-0 w-64 shrink-0 flex-col border-r border-gray-200 bg-white">
          <div className="min-h-0 flex-1 overflow-y-auto py-1">{locations.filter(l => !l.parentId || !locationMap.has(l.parentId)).map(l => renderLocation(l, 0))}</div>
        </aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <DataTable
            flush
            showCount={false}
            columns={columns}
            data={filteredLocations}
            rowKey={l => l.id}
            itemLabel="kho"
            emptyMessage={t('storeLocations.noLocations')}
            searchPlaceholder="Tìm tên kho, mã kho, địa chỉ, người phụ trách..."
            exportOptions={{ fileName: 'danh-sach-kho', title: 'DANH SÁCH VỊ TRÍ KHO' }}
            selection={{ selected: selectedRows, onChange: setSelectedRows }}
            minWidth={1300}
          />
        </div>
      </div>

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-blue-600" />
                <span className="font-semibold text-sm text-gray-800">
                  {modal.mode === 'add' ? 'Thêm vị trí kho mới' : `Chỉnh sửa: ${modal.item?.name}`}
                </span>
              </div>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"><X size={16} /></button>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Mã kho <span className="text-red-400">*</span></label>
                  <input autoFocus value={modalForm.locationCode} onChange={e => setModalForm(f => ({ ...f, locationCode: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tên kho <span className="text-red-400">*</span></label>
                  <input value={modalForm.name} onChange={e => setModalForm(f => ({ ...f, name: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Kho cha</label>
                  <select value={modalForm.parentId ?? ''} onChange={e => setModalForm(f => ({ ...f, parentId: e.target.value || null }))} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white">
                    <option value="">— Không (gốc) —</option>
                    {locations.filter(loc => !excludeIds.has(loc.id)).map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name} ({loc.locationCode})</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Mô tả</label>
                  <textarea value={modalForm.description} onChange={e => setModalForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Địa chỉ / Vị trí</label>
                  <input value={modalForm.address} onChange={e => setModalForm(f => ({ ...f, address: e.target.value }))} placeholder="Engine Room, Deck A..." className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Người phụ trách</label>
                  <input value={modalForm.managerName} onChange={e => setModalForm(f => ({ ...f, managerName: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Số điện thoại</label>
                  <input value={modalForm.phone} onChange={e => setModalForm(f => ({ ...f, phone: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input type="email" value={modalForm.email} onChange={e => setModalForm(f => ({ ...f, email: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50 rounded-b-lg">
              {modal.mode === 'edit' && modal.item && (
                <PermissionGate permission="pms.locations.delete"><button onClick={() => { handleDelete(modal.item!); closeModal(); }} className="mr-auto px-3 py-1.5 text-xs border border-red-200 text-red-600 rounded hover:bg-red-50 flex items-center gap-1">
                  <Trash2 size={13} /> Xóa kho
                </button></PermissionGate>
              )}
              <button onClick={closeModal} className="px-4 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50">Hủy</button>
              <PermissionGate permission={modal.mode === 'add' ? 'pms.locations.create' : 'pms.locations.update'}><button onClick={handleModalSave} disabled={modalSaving} className="px-4 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
                <Save size={13} /> {modalSaving ? 'Đang lưu...' : (modal.mode === 'add' ? 'Tạo mới' : 'Lưu')}
              </button></PermissionGate>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
