import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Pencil, Trash2, Loader2, FolderTree, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { materialService, type MaterialCategoryResponseDto, type CreateMaterialCategoryDto } from '../../../services/materialService';
import { useToast } from '../../../components/common/Toast';
import { useConfirmDialog } from '../../../components/common/ConfirmDialog';

const emptyForm: CreateMaterialCategoryDto = { categoryCode: '', name: '', description: '', parentCategoryId: null };

/* ═══════════════ Tab: Loại vật tư (material categories) ═══════════════ */
export const MaterialCategoryTab: React.FC = () => {
  const toast = useToast();
  const { confirm } = useConfirmDialog();

  const [cats, setCats] = useState<MaterialCategoryResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /* filters */
  const [searchCode, setSearchCode] = useState('');
  const [searchName, setSearchName] = useState('');

  /* form modal */
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<MaterialCategoryResponseDto | null>(null);
  const [form, setForm] = useState<CreateMaterialCategoryDto>(emptyForm);

  /* context menu */
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; cat: MaterialCategoryResponseDto } | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);

  const catNameMap = useMemo(() => {
    const m = new Map<number, string>();
    cats.forEach(c => m.set(c.id, c.name));
    return m;
  }, [cats]);

  /* ── data ── */
  const fetchCats = useCallback(async () => {
    setLoading(true);
    try { setCats(await materialService.getCategoriesDetailed(true)); }
    catch { toast.error('Không thể tải danh sách loại vật tư'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { fetchCats(); }, [fetchCats]);

  const [page, setPage] = useState(1);

  const filtered = useMemo(() => cats.filter(c => {
    if (searchCode && !c.categoryCode.toLowerCase().includes(searchCode.toLowerCase())) return false;
    if (searchName && !c.name.toLowerCase().includes(searchName.toLowerCase())) return false;
    return true;
  }), [cats, searchCode, searchName]);

  /* ── phân trang phía client, cùng cỡ trang với CrewListPage ── */
  const PAGE_SIZE = 15;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  /* ── context menu ── */
  const handleContextMenu = useCallback((e: React.MouseEvent, cat: MaterialCategoryResponseDto) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, cat });
    setSelectedRowId(cat.id);
  }, []);
  const closeContextMenu = useCallback(() => { setContextMenu(null); setSelectedRowId(null); }, []);
  useEffect(() => {
    const h = () => closeContextMenu();
    window.addEventListener('click', h);
    return () => window.removeEventListener('click', h);
  }, [closeContextMenu]);

  /* ── form actions ── */
  const openCreate = useCallback(() => { setEditing(null); setForm(emptyForm); setShowForm(true); }, []);
  const openEdit = useCallback((c: MaterialCategoryResponseDto) => {
    setEditing(c);
    setForm({ categoryCode: c.categoryCode, name: c.name, description: c.description ?? '', parentCategoryId: c.parentCategoryId ?? null, isActive: c.isActive });
    setShowForm(true);
  }, []);

  const handleDelete = useCallback(async (c: MaterialCategoryResponseDto) => {
    const { confirmed } = await confirm({
      title: 'Xóa loại vật tư', message: `Bạn có chắc muốn xóa loại "${c.name}"?`,
      confirmLabel: 'Xóa', cancelLabel: 'Hủy', variant: 'danger',
    });
    if (!confirmed) return;
    try { await materialService.deleteCategory(c.id); toast.success('Đã xóa loại vật tư'); fetchCats(); }
    catch (err) { toast.error('Lỗi xóa', err instanceof Error ? err.message : 'Không thể xóa'); }
  }, [confirm, toast, fetchCats]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.categoryCode.trim() || !form.name.trim()) { toast.error('Vui lòng nhập mã và tên loại vật tư'); return; }
    setSaving(true);
    try {
      if (editing) {
        await materialService.updateCategory(editing.id, { ...form, isActive: form.isActive ?? true });
        toast.success('Đã cập nhật loại vật tư');
      } else {
        await materialService.createCategory(form);
        toast.success('Đã tạo loại vật tư mới');
      }
      setShowForm(false); fetchCats();
    } catch (err) { toast.error('Lỗi lưu', err instanceof Error ? err.message : 'Không thể lưu'); }
    finally { setSaving(false); }
  }, [editing, form, toast, fetchCats]);

  /* ── loading ── */
  if (loading) {
    return <div className="cl-loading"><Loader2 size={28} className="spin" /><p>Đang tải danh sách loại vật tư...</p></div>;
  }

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <div className="cl-page" style={{ padding: 0, minHeight: 'auto' }}>
      {/* Header */}
      <div className="cl-header">
        <div className="cl-header-left">
          <FolderTree size={16} className="cl-header-icon" />
          <h1 className="cl-title">Loại vật tư</h1>
          <span className="cl-count-badge">{cats.length}</span>
        </div>
        <div className="cl-header-right">
          <button className="cl-btn cl-btn--primary" onClick={openCreate}><Plus size={13} /> Thêm loại vật tư</button>
        </div>
      </div>

      {/* Table */}
      <div className="cl-table-card">
        <table className="cl-table">
          <thead>
            <tr className="cl-tr-labels">
              <th style={{ width: 44, textAlign: 'center' }}>STT</th>
              <th style={{ width: '16%' }}>Mã loại</th>
              <th>Tên loại</th>
              <th style={{ width: '16%' }}>Loại cha</th>
              <th style={{ width: '10%', textAlign: 'center' }}>Số vật tư</th>
              <th style={{ width: '12%', textAlign: 'center' }}>Trạng thái</th>
            </tr>
            <tr className="cl-tr-filters">
              <th></th>
              <th><div className="cl-search-wrap"><input className="cl-cf" placeholder="Tìm mã" value={searchCode} onChange={e => setSearchCode(e.target.value)} /></div></th>
              <th><div className="cl-search-wrap"><input className="cl-cf" placeholder="Tìm tên" value={searchName} onChange={e => setSearchName(e.target.value)} /></div></th>
              <th></th><th></th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="cl-empty">
                <FolderTree size={24} />
                <p>{cats.length === 0 ? 'Chưa có loại vật tư nào' : 'Không tìm thấy loại vật tư phù hợp'}</p>
              </td></tr>
            ) : paged.map((c, idx) => (
              <tr key={c.id}
                className={`cl-tr${idx % 2 === 1 ? ' cl-tr--alt' : ''}${selectedRowId === c.id ? ' cl-tr--selected' : ''}`}
                onContextMenu={e => handleContextMenu(e, c)}
              >
                <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                <td><span className="cl-code">{c.categoryCode}</span></td>
                <td>{c.name}</td>
                <td>{c.parentCategoryId ? (c.parentCategoryName || catNameMap.get(c.parentCategoryId) || '—') : '—'}</td>
                <td style={{ textAlign: 'center' }}>{c.itemCount ?? 0}</td>
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
          Hiển thị {paged.length} / {filtered.length} nhóm vật tư
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
          <button className="cl-ctx-item" onClick={() => { openEdit(contextMenu.cat); closeContextMenu(); }}>
            <Pencil size={13} /> Chỉnh sửa
          </button>
          <div className="cl-ctx-divider" />
          <button className="cl-ctx-item cl-ctx-item--danger" onClick={() => { handleDelete(contextMenu.cat); closeContextMenu(); }}>
            <Trash2 size={13} /> Xóa loại vật tư
          </button>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="cert-form-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="cfm-header">
              <span className="cfm-title">{editing ? 'Chỉnh sửa loại vật tư' : 'Thêm loại vật tư mới'}</span>
              <button className="cfm-close" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="cfm-body">
                <div className="cfm-grid">
                  <div className="cfm-field cfm-field--required">
                    <label>Mã loại</label>
                    <input value={form.categoryCode} onChange={e => setForm(f => ({ ...f, categoryCode: e.target.value }))} placeholder="VD: SPARE" style={{ fontVariantNumeric: 'tabular-nums' }} />
                  </div>
                  <div className="cfm-field cfm-field--required">
                    <label>Tên loại</label>
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="VD: Phụ tùng thay thế" />
                  </div>
                  <div className="cfm-field">
                    <label>Loại cha</label>
                    <select value={form.parentCategoryId ?? ''} onChange={e => setForm(f => ({ ...f, parentCategoryId: e.target.value ? Number(e.target.value) : null }))}>
                      <option value="">-- Không có --</option>
                      {cats.filter(c => !editing || c.id !== editing.id).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="cfm-field cfm-field--full">
                    <label>Mô tả</label>
                    <input value={form.description ?? ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Mô tả ngắn (tùy chọn)" />
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
