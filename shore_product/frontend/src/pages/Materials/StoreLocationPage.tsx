import { useState, useEffect, useMemo, useCallback } from 'react';
import { Plus, Search, Trash2, Copy, Edit2, ChevronDown, ChevronRight, FolderOpen, ChevronsUpDown, Warehouse } from 'lucide-react';
import { storeLocationService } from '@/services/store-location.service';
import { StoreLocationFormModal } from './StoreLocationFormModal';
import { useTranslationSafe } from '@/contexts/I18nContext';
import type { StoreLocation } from '@/types/pms.types';
import { toast } from 'sonner';
import { useConfirm } from '@/components/common/ConfirmDialog';

const ITEMS_PER_PAGE_OPTIONS = [10, 15, 20, 25];

/** Build tree from flat list with parentId */
function buildTree(items: StoreLocation[]): StoreLocation[] {
  const map = new Map<string, StoreLocation>();
  items.forEach(i => map.set(i.id, { ...i, children: [] }));
  const roots: StoreLocation[] = [];
  map.forEach(item => {
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children!.push(item);
    } else {
      roots.push(item);
    }
  });
  return roots;
}

/** Get all descendant IDs of a node (including itself) */
function getDescendantIds(node: StoreLocation): Set<string> {
  const ids = new Set<string>();
  const stack = [node];
  while (stack.length) {
    const n = stack.pop()!;
    ids.add(n.id);
    n.children?.forEach(c => stack.push(c));
  }
  return ids;
}

export default function StoreLocationPage() {
  const ask = useConfirm();
  const { t } = useTranslationSafe();

  const [locations, setLocations] = useState<StoreLocation[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchName, setSearchName] = useState('');
  const [searchCode, setSearchCode] = useState('');
  const [searchDesc, setSearchDesc] = useState('');
  const [searchAddress, setSearchAddress] = useState('');
  const [searchManager, setSearchManager] = useState('');
  const [searchPhone, setSearchPhone] = useState('');
  const [searchEmail, setSearchEmail] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Tree + table selection
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('store-locations-expanded');
      return saved ? new Set<string>(JSON.parse(saved)) : new Set<string>();
    } catch { return new Set<string>(); }
  });
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  // Modals
  const [showFormModal, setShowFormModal] = useState(false);
  const [editItem, setEditItem] = useState<StoreLocation | null>(null);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await storeLocationService.getAll();
      setLocations(data);
    } catch (error) {
      console.error('Error loading store locations:', error);
    } finally {
      setLoading(false);
    }
  };

  const treeRoots = useMemo(() => buildTree(locations), [locations]);

  const locationMap = useMemo(() => {
    const m = new Map<string, StoreLocation>();
    locations.forEach(l => m.set(l.id, l));
    return m;
  }, [locations]);

  const toggleNode = useCallback((id: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      try { localStorage.setItem('store-locations-expanded', JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  /** Filtered locations based on selected tree node + column searches */
  const filteredLocations = useMemo(() => {
    let data = locations;

    if (selectedNodeId) {
      const buildFromFlat = (id: string): StoreLocation => {
        const node = { ...locationMap.get(id)!, children: [] as StoreLocation[] };
        locations.filter(l => l.parentId === id).forEach(child => {
          node.children!.push(buildFromFlat(child.id));
        });
        return node;
      };
      const subtree = buildFromFlat(selectedNodeId);
      const ids = getDescendantIds(subtree);
      data = data.filter(l => ids.has(l.id));
    }

    if (searchName) {
      const q = searchName.toLowerCase();
      data = data.filter(l => l.name.toLowerCase().includes(q));
    }
    if (searchCode) {
      const q = searchCode.toLowerCase();
      data = data.filter(l => l.locationCode.toLowerCase().includes(q));
    }
    if (searchDesc) {
      const q = searchDesc.toLowerCase();
      data = data.filter(l => l.description?.toLowerCase().includes(q));
    }
    if (searchAddress) {
      const q = searchAddress.toLowerCase();
      data = data.filter(l => l.address?.toLowerCase().includes(q));
    }
    if (searchManager) {
      const q = searchManager.toLowerCase();
      data = data.filter(l => l.managerName?.toLowerCase().includes(q));
    }
    if (searchPhone) {
      const q = searchPhone.toLowerCase();
      data = data.filter(l => l.phone?.toLowerCase().includes(q));
    }
    if (searchEmail) {
      const q = searchEmail.toLowerCase();
      data = data.filter(l => l.email?.toLowerCase().includes(q));
    }

    return data;
  }, [locations, selectedNodeId, searchName, searchCode, searchDesc, searchAddress, searchManager, searchPhone, searchEmail, locationMap]);

  const totalPages = Math.ceil(filteredLocations.length / itemsPerPage);
  const paginatedLocations = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredLocations.slice(start, start + itemsPerPage);
  }, [filteredLocations, currentPage, itemsPerPage]);

  useEffect(() => { setCurrentPage(1); }, [searchName, searchCode, searchDesc, searchAddress, searchManager, searchPhone, searchEmail, selectedNodeId]);

  const toggleRow = (id: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAllRows = () => {
    if (selectedRows.size === paginatedLocations.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(paginatedLocations.map(l => l.id)));
  };

  const handleDelete = async (item: StoreLocation) => {
    if (!await ask(t('storeLocations.confirmDelete', { name: item.name }))) return;
    try {
      await storeLocationService.delete(item.id);
      await loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Delete failed');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedRows.size === 0) return;
    if (!await ask(t('storeLocations.confirmBulkDelete', { count: selectedRows.size }))) return;
    try {
      await Promise.all([...selectedRows].map(id => storeLocationService.delete(id)));
      setSelectedRows(new Set());
      await loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Delete failed');
    }
  };

  const handleEdit = (item: StoreLocation) => {
    setEditItem(item);
    setShowFormModal(true);
  };

  const handleAdd = () => {
    setEditItem(null);
    setShowFormModal(true);
  };

  const selectedNodeName = selectedNodeId ? locationMap.get(selectedNodeId)?.name : null;

  /** Render tree node recursively */
  const renderTreeNode = (node: StoreLocation, depth = 0): React.ReactNode => {
    const hasChildren = (node.children?.length ?? 0) > 0;
    const isExpanded = expandedNodes.has(node.id);
    const isSelected = selectedNodeId === node.id;
    const childCount = node.children?.length ?? 0;

    return (
      <div key={node.id}>
        <button
          onClick={() => {
            setSelectedNodeId(node.id);
            if (hasChildren) toggleNode(node.id);
          }}
          style={{ paddingLeft: `${12 + depth * 14}px` }}
          className={`w-full flex items-center gap-1.5 pr-3 py-1.5 text-xs ${
            isSelected ? 'bg-[#eef2f7] text-[#16375f] font-semibold' : 'text-gray-700 hover:bg-gray-50'
          }`}
        >
          {hasChildren ? (
            isExpanded
              ? <ChevronDown className="w-3 h-3 flex-shrink-0 text-[#1b4c7e]" />
              : <ChevronRight className="w-3 h-3 flex-shrink-0 text-[#1b4c7e]" />
          ) : (
            <span className="w-3 flex-shrink-0" />
          )}
          <FolderOpen className="w-3 h-3 flex-shrink-0 text-gray-400" />
          <span className="flex-1 text-left leading-snug marquee-cell">
            <span className="marquee-text">{node.name}</span>
          </span>
          <span className="text-gray-400 text-xs flex-shrink-0">(SL:{childCount})</span>
        </button>
        {isExpanded && node.children?.map(child => renderTreeNode(child, depth + 1))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent mx-auto" />
          <p className="mt-4 text-gray-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-white">

      {/* ── HEADER ROW ── */}
      <div className="flex flex-shrink-0 border-b border-gray-200">

        {/* Header left: root node */}
        <button
          onClick={() => setSelectedNodeId(null)}
          className={`w-64 flex-shrink-0 flex items-center gap-1.5 px-3 py-3 text-sm font-semibold border-r border-gray-200 ${
            selectedNodeId === null
              ? 'bg-primary-hover text-white'
              : 'text-gray-700 hover:bg-gray-50 bg-white'
          }`}
        >
          <FolderOpen className="w-4 h-4 flex-shrink-0" />
          <span className="flex-1 text-left truncate">
            {t('storeLocations.allLocations')} (SL:{locations.length})
          </span>
        </button>

        {/* Header right: title + actions */}
        <div className="flex-1 flex items-center justify-between px-4 py-3 bg-white">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">
              ≡ {t('storeLocations.locationList')}{selectedNodeName ? ` - ${selectedNodeName}` : ''}
            </span>
            <span className="text-xs bg-[#dce9f8] text-[#16375f] px-2 py-0.5 rounded-full font-semibold">
              {filteredLocations.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkDelete}
              disabled={selectedRows.size === 0}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded ${selectedRows.size > 0 ? 'text-red-600 hover:bg-red-50 border-red-300' : 'text-gray-400 cursor-not-allowed'}`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t('storeLocations.deleteMany')}{selectedRows.size > 0 ? ` (${selectedRows.size})` : ''}
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50">
              <Copy className="w-3.5 h-3.5" />
              {t('storeLocations.copy')}
            </button>
            <button
              onClick={handleAdd}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#0b2545] text-white rounded hover:bg-[#16375f]"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('storeLocations.addNew')}
            </button>
          </div>
        </div>
      </div>

      {/* ── BODY: tree left + table right ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: tree */}
        <div className="w-64 flex-shrink-0 border-r border-gray-200 overflow-y-auto bg-white">
          {treeRoots.length === 0 ? (
            <div className="px-4 py-6 text-xs text-gray-400 text-center">{t('storeLocations.noTree')}</div>
          ) : (
            treeRoots.map(node => renderTreeNode(node, 0))
          )}
        </div>

        {/* RIGHT: table panel */}
        <div className="flex-1 flex flex-col overflow-hidden">

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="min-w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">

              {/* Row 1: Column headers */}
              <tr className="bg-[#eef2f7]">
                <th className="w-10 px-2 py-2 text-center text-xs font-semibold text-gray-600 border-b border-r border-gray-200">TT</th>
                <th className="w-10 px-2 py-2 text-center text-xs font-semibold text-gray-600 border-b border-r border-gray-200">
                  <input
                    type="checkbox"
                    checked={selectedRows.size === paginatedLocations.length && paginatedLocations.length > 0}
                    onChange={toggleAllRows}
                    className="rounded text-[#0b2545]"
                  />
                </th>
                {[
                  { key: 'colName', minW: 'min-w-[200px]' },
                  { key: 'colCode', minW: 'w-32' },
                  { key: 'colDescription', minW: 'min-w-[160px]' },
                  { key: 'colAddress', minW: 'min-w-[140px]' },
                  { key: 'colManager', minW: 'w-36' },
                  { key: 'colPhone', minW: 'w-32' },
                  { key: 'colEmail', minW: 'w-36' },
                  { key: 'colUpdatedAt', minW: 'w-28' },
                ].map(col => (
                  <th key={col.key} className={`${col.minW} px-3 py-2 text-left border-b border-r border-gray-200`}>
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-gray-600">{t(`storeLocations.${col.key}`)}</span>
                      <ChevronsUpDown className="w-3 h-3 text-gray-400 flex-shrink-0" />
                    </div>
                  </th>
                ))}
                <th className="w-20 px-3 py-2 border-b border-gray-200" />
              </tr>

              {/* Row 2: Column search inputs */}
              <tr className="bg-white border-b border-gray-200">
                <th className="border-r border-gray-200" />
                <th className="border-r border-gray-200" />

                {/* Name */}
                <th className="px-2 py-1 border-r border-gray-200">
                  <div className="flex items-center gap-0.5 border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                    <span className="text-gray-400 text-xs select-none">→</span>
                    <input type="text" placeholder={t('common.search')} value={searchName} onChange={e => setSearchName(e.target.value)} className="flex-1 text-xs outline-none min-w-0 bg-transparent" />
                    <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                {/* Code */}
                <th className="px-2 py-1 border-r border-gray-200">
                  <div className="flex items-center gap-0.5 border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                    <span className="text-gray-400 text-xs select-none">→</span>
                    <input type="text" placeholder={t('common.search')} value={searchCode} onChange={e => setSearchCode(e.target.value)} className="flex-1 text-xs outline-none min-w-0 bg-transparent" />
                    <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                {/* Description */}
                <th className="px-2 py-1 border-r border-gray-200">
                  <div className="flex items-center gap-0.5 border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                    <span className="text-gray-400 text-xs select-none">→</span>
                    <input type="text" placeholder={t('common.search')} value={searchDesc} onChange={e => setSearchDesc(e.target.value)} className="flex-1 text-xs outline-none min-w-0 bg-transparent" />
                    <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                {/* Address */}
                <th className="px-2 py-1 border-r border-gray-200">
                  <div className="flex items-center gap-0.5 border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                    <span className="text-gray-400 text-xs select-none">→</span>
                    <input type="text" placeholder={t('common.search')} value={searchAddress} onChange={e => setSearchAddress(e.target.value)} className="flex-1 text-xs outline-none min-w-0 bg-transparent" />
                    <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                {/* Manager */}
                <th className="px-2 py-1 border-r border-gray-200">
                  <div className="flex items-center gap-0.5 border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                    <span className="text-gray-400 text-xs select-none">→</span>
                    <input type="text" placeholder={t('common.search')} value={searchManager} onChange={e => setSearchManager(e.target.value)} className="flex-1 text-xs outline-none min-w-0 bg-transparent" />
                    <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                {/* Phone */}
                <th className="px-2 py-1 border-r border-gray-200">
                  <div className="flex items-center gap-0.5 border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                    <span className="text-gray-400 text-xs select-none">→</span>
                    <input type="text" placeholder={t('common.search')} value={searchPhone} onChange={e => setSearchPhone(e.target.value)} className="flex-1 text-xs outline-none min-w-0 bg-transparent" />
                    <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                {/* Email */}
                <th className="px-2 py-1 border-r border-gray-200">
                  <div className="flex items-center gap-0.5 border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                    <span className="text-gray-400 text-xs select-none">→</span>
                    <input type="text" placeholder={t('common.search')} value={searchEmail} onChange={e => setSearchEmail(e.target.value)} className="flex-1 text-xs outline-none min-w-0 bg-transparent" />
                    <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                {/* Updated at - date filter placeholder */}
                <th className="px-2 py-1 border-r border-gray-200">
                  <div className="flex items-center gap-0.5 border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                    <span className="text-gray-400 text-xs select-none">=</span>
                    <input type="text" placeholder="mm/dd/yyyy" className="flex-1 text-xs outline-none min-w-0 bg-transparent" readOnly />
                  </div>
                </th>
                {/* Actions */}
                <th className="border-gray-200" />
              </tr>

            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedLocations.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-gray-400">
                    <Warehouse className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p>{t('storeLocations.noLocations')}</p>
                  </td>
                </tr>
              ) : (
                paginatedLocations.map((loc, idx) => (
                  <tr
                    key={loc.id}
                    className={`hover:bg-[#eef2f7] ${
                      selectedRows.has(loc.id) ? 'bg-[#eef2f7]' : idx % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'
                    }`}
                  >
                    <td className="px-2 py-2 text-center text-xs text-gray-500 border-r border-gray-100">
                      {(currentPage - 1) * itemsPerPage + idx + 1}
                    </td>
                    <td className="px-2 py-2 text-center border-r border-gray-100">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(loc.id)}
                        onChange={() => toggleRow(loc.id)}
                        className="rounded text-[#0b2545]"
                      />
                    </td>

                    {/* Name (with folder icon + link style) */}
                    <td className="px-3 py-2 border-r border-gray-100">
                      <button
                        onClick={() => handleEdit(loc)}
                        className="flex items-center gap-1 text-[#0b2545] hover:underline font-medium text-xs text-left w-full"
                      >
                        <FolderOpen className="w-3 h-3 flex-shrink-0 text-gray-400" />
                        <span className="marquee-cell flex-1 min-w-0">
                          <span className="marquee-text">{loc.name} (SL:{locations.filter(l => l.parentId === loc.id).length})</span>
                        </span>
                      </button>
                    </td>

                    {/* Code */}
                    <td className="px-3 py-2 text-xs text-gray-600 border-r border-gray-100 font-mono">
                      {loc.locationCode}
                    </td>

                    {/* Description */}
                    <td className="px-3 py-2 text-xs text-gray-500 border-r border-gray-100">
                      <div className="marquee-cell">
                        <span className="marquee-text">{loc.description || ''}</span>
                      </div>
                    </td>

                    {/* Address */}
                    <td className="px-3 py-2 text-xs text-gray-500 border-r border-gray-100">
                      <div className="marquee-cell">
                        <span className="marquee-text">{loc.address || ''}</span>
                      </div>
                    </td>

                    {/* Manager */}
                    <td className="px-3 py-2 text-xs text-gray-600 border-r border-gray-100">
                      <div className="marquee-cell">
                        <span className="marquee-text">{loc.managerName || ''}</span>
                      </div>
                    </td>

                    {/* Phone */}
                    <td className="px-3 py-2 text-xs text-gray-600 border-r border-gray-100">
                      {loc.phone || ''}
                    </td>

                    {/* Email */}
                    <td className="px-3 py-2 text-xs text-gray-600 border-r border-gray-100">
                      <div className="marquee-cell">
                        <span className="marquee-text">{loc.email || ''}</span>
                      </div>
                    </td>

                    {/* Updated at */}
                    <td className="px-3 py-2 text-xs text-gray-500 border-r border-gray-100 whitespace-nowrap">
                      {loc.updatedAt ? new Date(loc.updatedAt).toLocaleDateString() : ''}
                    </td>

                    {/* Actions */}
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-center gap-0.5">
                        <button
                          onClick={() => handleEdit(loc)}
                          className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded"
                          title={t('storeLocations.edit')}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(loc)}
                          className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                          title={t('storeLocations.delete')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 bg-white flex-shrink-0 text-xs text-gray-600">
          {/* Left: per-page */}
          <div>
            <select
              value={itemsPerPage}
              onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="border border-gray-300 rounded px-2 py-1 text-xs"
            >
              {ITEMS_PER_PAGE_OPTIONS.map(n => (
                <option key={n} value={n}>{t('storeLocations.perPage', { n })}</option>
              ))}
            </select>
          </div>

          {/* Center: page info + page buttons */}
          <div className="flex items-center gap-1">
            <span className="mr-2">
              {t('storeLocations.pageInfo', { current: currentPage, total: totalPages, records: filteredLocations.length })}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
            >‹</button>
            {[...Array(Math.min(5, totalPages))].map((_, i) => {
              let page: number;
              if (totalPages <= 5) page = i + 1;
              else if (currentPage <= 3) page = i + 1;
              else if (currentPage >= totalPages - 2) page = totalPages - 4 + i;
              else page = currentPage - 2 + i;
              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-7 h-7 flex items-center justify-center border rounded text-xs ${
                    currentPage === page
                      ? 'bg-[#0b2545] text-white border-accent'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {page}
                </button>
              );
            })}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
            >›</button>
          </div>

          {/* Right: go-to-page */}
          <div className="flex items-center gap-2">
            <span>{t('storeLocations.goToPage')}</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={currentPage}
              onChange={e => {
                const v = Number(e.target.value);
                if (v >= 1 && v <= totalPages) setCurrentPage(v);
              }}
              className="w-12 border border-gray-300 rounded px-1 py-1 text-center text-xs"
            />
          </div>
        </div>
      </div>{/* end RIGHT table panel */}
      </div>{/* end BODY row */}

      {/* Modal */}
      <StoreLocationFormModal
        isOpen={showFormModal}
        onClose={() => { setShowFormModal(false); setEditItem(null); }}
        onSuccess={loadData}
        locations={locations}
        editItem={editItem}
      />
    </div>
  );
}

