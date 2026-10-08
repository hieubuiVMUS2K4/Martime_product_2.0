import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { downloadMaterialCatalogTemplate } from './materialCatalogTemplate';
import { Plus, Pencil, Trash2, Loader2, Package, X, ChevronLeft, ChevronRight, Upload, Download } from 'lucide-react';
import { ImportMaterialCatalogModal } from './ImportMaterialCatalogModal';
import { materialCatalogService, materialService, type MaterialCatalogItem, type MaterialCatalogPayload } from '../../../services/materialService';
import { useToast } from '../../../components/common/Toast';
import { useConfirmDialog } from '../../../components/common/ConfirmDialog';

interface CategoryOption { id: number; name: string; categoryCode: string; }

const emptyForm: MaterialCatalogPayload = { itemCode: '', name: '', categoryId: 0, unitPrice: null };

/* ═══════════════ Tab: Vật tư (material catalog items) ═══════════════ */
export const MaterialItemsTab: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const { confirm } = useConfirmDialog();

  const [items, setItems] = useState<MaterialCatalogItem[]>([]);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showImport, setShowImport] = useState(false);

  /* filters */
  const [searchCode, setSearchCode] = useState('');
  const [searchName, setSearchName] = useState('');
  const [filterCategory, setFilterCategory] = useState<number | ''>('');

  /* form modal */
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MaterialCatalogItem | null>(null);
  const [form, setForm] = useState<MaterialCatalogPayload>(emptyForm);

  /* context menu */
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: MaterialCatalogItem } | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);

  const categoryMap = useMemo(() => {
    const m = new Map<number, string>();
    categories.forEach(c => m.set(c.id, c.name));
    return m;
  }, [categories]);

  /* ── data ── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [its, cats] = await Promise.all([
        materialCatalogService.getAll(),
        materialService.getCategories(true).catch(() => []),
      ]);
      setItems(its);
      setCategories((cats as CategoryOption[]) ?? []);
    } catch { toast.error('Không thể tải danh mục vật tư'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const [page, setPage] = useState(1);

  const filtered = useMemo(() => items.filter(i => {
    if (filterCategory && i.categoryId !== filterCategory) return false;
    if (searchCode && !i.itemCode.toLowerCase().includes(searchCode.toLowerCase())) return false;
    if (searchName && !i.name.toLowerCase().includes(searchName.toLowerCase())) return false;
    return true;
  }), [items, filterCategory, searchCode, searchName]);

  /* ── phân trang phía client, cùng cỡ trang với CrewListPage ── */
  const PAGE_SIZE = 15;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  /* ── context menu ── */
  const handleContextMenu = useCallback((e: React.MouseEvent, item: MaterialCatalogItem) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, item });
    setSelectedRowId(item.id);
  }, []);
  const closeContextMenu = useCallback(() => { setContextMenu(null); setSelectedRowId(null); }, []);
  useEffect(() => {
    const h = () => closeContextMenu();
    window.addEventListener('click', h);
    return () => window.removeEventListener('click', h);
  }, [closeContextMenu]);

  /* ── form actions ── */
  const openCreate = useCallback(() => {
    setEditing(null);
    setForm({ ...emptyForm, categoryId: categories[0]?.id ?? 0 });
    setShowForm(true);
  }, [categories]);
  useEffect(() => {
    if (loading || searchParams.get('action') !== 'create') return;
    openCreate();
    const next = new URLSearchParams(searchParams);
    next.delete('action');
    setSearchParams(next, { replace: true });
  }, [loading, searchParams, setSearchParams, openCreate]);

  const openEdit = useCallback((i: MaterialCatalogItem) => {
    setEditing(i);
    setForm({ itemCode: i.itemCode, name: i.name, categoryId: i.categoryId, unitPrice: i.unitPrice ?? null });
    setShowForm(true);
  }, []);

  const handleDelete = useCallback(async (i: MaterialCatalogItem) => {
    const { confirmed } = await confirm({
      title: 'Xóa vật tư', message: `Bạn có chắc muốn xóa "${i.name}" khỏi danh mục?`,
      confirmLabel: 'Xóa', cancelLabel: 'Hủy', variant: 'danger',
    });
    if (!confirmed) return;
    try { await materialCatalogService.remove(i.id); toast.success('Đã xóa vật tư'); fetchData(); }
    catch (err) { toast.error('Lỗi xóa', err instanceof Error ? err.message : 'Không thể xóa'); }
  }, [confirm, toast, fetchData]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.itemCode.trim() || !form.name.trim()) { toast.error('Vui lòng nhập mã và tên vật tư'); return; }
    if (!form.categoryId) { toast.error('Vui lòng chọn loại vật tư'); return; }
    setSaving(true);
    try {
      if (editing) { await materialCatalogService.update(editing.id, form); toast.success('Đã cập nhật vật tư'); }
      else { await materialCatalogService.create(form); toast.success('Đã tạo vật tư mới'); }
      setShowForm(false); fetchData();
    } catch (err) { toast.error('Lỗi lưu', err instanceof Error ? err.message : 'Không thể lưu'); }
    finally { setSaving(false); }
  }, [editing, form, toast, fetchData]);

  /* ── loading ── */
  if (loading) {
    return <div className="cl-loading"><Loader2 size={28} className="spin" /><p>Đang tải danh mục vật tư...</p></div>;
  }

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <div className="cl-page" style={{ padding: 0, minHeight: 'auto' }}>
      {/* Header */}
      <div className="cl-header">
        <div className="cl-header-left">
          <Package size={16} className="cl-header-icon" />
          <h1 className="cl-title">Vật tư</h1>
          <span className="cl-count-badge">{items.length}</span>
        </div>
        <div className="cl-header-right">
          <button className="cl-btn" onClick={downloadMaterialCatalogTemplate}><Download size={13} /> Tải mẫu import</button>
          <button className="cl-btn" onClick={() => setShowImport(true)}><Upload size={13} /> Import vật tư</button>
          <button className="cl-btn cl-btn--primary" onClick={openCreate}><Plus size={13} /> Thêm vật tư</button>
        </div>
      </div>

      {showImport && <ImportMaterialCatalogModal onClose={() => setShowImport(false)} onSuccess={() => { toast.success('Đã import danh mục vật tư'); fetchData(); }} />}
      {/* Table */}
      <div className="cl-table-card">
        <table className="cl-table">
          <thead>
            <tr className="cl-tr-labels">
              <th style={{ width: 44, textAlign: 'center' }}>STT</th>
              <th style={{ width: '18%' }}>Mã vật tư</th>
              <th>Tên vật tư</th>
              <th style={{ width: '20%' }}>Loại vật tư</th>
              <th style={{ width: '14%', textAlign: 'right' }}>Đơn giá</th>
              <th style={{ width: '12%', textAlign: 'center' }}>Trạng thái</th>
            </tr>
            <tr className="cl-tr-filters">
              <th></th>
              <th><div className="cl-search-wrap"><input className="cl-cf" placeholder="Tìm mã" value={searchCode} onChange={e => setSearchCode(e.target.value)} /></div></th>
              <th><div className="cl-search-wrap"><input className="cl-cf" placeholder="Tìm tên" value={searchName} onChange={e => setSearchName(e.target.value)} /></div></th>
              <th>
                <select className="cl-cf" value={filterCategory} onChange={e => setFilterCategory(e.target.value ? Number(e.target.value) : '')}>
                  <option value="">Tất cả loại</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </th>
              <th></th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="cl-empty">
                <Package size={24} />
                <p>{items.length === 0 ? 'Chưa có vật tư nào trong danh mục' : 'Không tìm thấy vật tư phù hợp'}</p>
              </td></tr>
            ) : paged.map((i, idx) => (
              <tr key={i.id}
                className={`cl-tr${idx % 2 === 1 ? ' cl-tr--alt' : ''}${selectedRowId === i.id ? ' cl-tr--selected' : ''}`}
                onContextMenu={e => handleContextMenu(e, i)}
              >
                <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                <td><span className="cl-code">{i.itemCode}</span></td>
                <td>{i.name}</td>
                <td>{categoryMap.get(i.categoryId) || '—'}</td>
                <td style={{ textAlign: 'right' }}>{i.unitPrice != null ? i.unitPrice.toLocaleString('vi-VN') : '—'}</td>
                <td style={{ textAlign: 'center' }}>
                  <span className="cl-status-badge cl-status-badge--on"><span className="cl-status-badge__dot" /> Hoạt động</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Chân trang — cùng khuôn với CrewListPage */}
      <div className="cl-footer">
        <span className="cl-footer-info">
          Hiển thị {paged.length} / {filtered.length} vật tư
        </span>
        {totalPages > 1 && (
          <div className="cl-pagi-btns">
            <button className="cl-pagi-btn" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeft size={14} /></button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let p: number;
              if (totalPages <= 7) p = i + 1;
              else if (page <= 4) p = i + 1;
              else if (page >= totalPages - 3) p = totalPages - 6 + i;
              else p = page - 3 + i;
              return <button key={p} className={`cl-pagi-btn${p === page ? ' cl-pagi-btn--cur' : ''}`} onClick={() => setPage(p)}>{p}</button>;
            })}
            <button className="cl-pagi-btn" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}><ChevronRight size={14} /></button>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div className="cl-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }} onClick={e => e.stopPropagation()}>
          <button className="cl-ctx-item" onClick={() => { openEdit(contextMenu.item); closeContextMenu(); }}>
            <Pencil size={13} /> Chỉnh sửa
          </button>
          <div className="cl-ctx-divider" />
          <button className="cl-ctx-item cl-ctx-item--danger" onClick={() => { handleDelete(contextMenu.item); closeContextMenu(); }}>
            <Trash2 size={13} /> Xóa vật tư
          </button>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="cert-form-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="cfm-header">
              <span className="cfm-title">{editing ? 'Chỉnh sửa vật tư' : 'Thêm vật tư mới'}</span>
              <button className="cfm-close" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="cfm-body">
                <div className="cfm-grid">
                  <div className="cfm-field cfm-field--required">
                    <label>Mã vật tư</label>
                    <input value={form.itemCode} onChange={e => setForm(f => ({ ...f, itemCode: e.target.value }))} disabled={!!editing} placeholder="VD: IMPA-370101" style={{ fontVariantNumeric: 'tabular-nums' }} />
                  </div>
                  <div className="cfm-field cfm-field--required">
                    <label>Tên vật tư</label>
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="VD: Bơm dầu bôi trơn" />
                  </div>
                  <div className="cfm-field cfm-field--required">
                    <label>Loại vật tư</label>
                    <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: Number(e.target.value) }))}>
                      <option value={0}>-- Chọn loại --</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="cfm-field">
                    <label>Đơn giá</label>
                    <input type="number" step="0.01" value={form.unitPrice ?? ''} onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value === '' ? null : Number(e.target.value) }))} placeholder="0" />
                  </div>
                </div>
              </div>
              <div className="cfm-footer">
                <button type="button" className="cl-btn cl-btn--ghost" onClick={() => setShowForm(false)}>Hủy</button>
                <button type="submit" className="cl-btn cl-btn--primary" disabled={saving}>
                  {saving ? <><Loader2 size={14} className="spin" /> Đang lưu...</> : editing ? 'Cập nhật' : 'Tạo mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
