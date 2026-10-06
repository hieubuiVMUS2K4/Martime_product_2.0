import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Pencil, Trash2, Loader2, Award, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { rankApi, type RankPayload } from '../../../services/crew.service';
import { useToast } from '../../../components/common/Toast';
import { useConfirmDialog } from '../../../components/common/ConfirmDialog';
import type { Rank } from '../../../types/crew.types';
import '../Crew/CrewListPage.css';
import '../CertificateTypes/CertificateFormModal.css';

/* ───────── constants ───────── */
const DEPARTMENTS = ['DECK', 'ENGINE', 'CATERING', 'OTHER'];
const DEPT_OPTIONS = [{ value: '', label: 'Tất cả' }, ...DEPARTMENTS.map(d => ({ value: d, label: d }))];

const emptyForm: RankPayload = { rankCode: '', rankName: '', department: 'DECK', level: '', sortOrder: 0 };

/* ═══════════════════════════════════════════════════════════════ */
export const RankPage: React.FC = () => {
  const toast = useToast();
  const { confirm } = useConfirmDialog();

  const [ranks, setRanks] = useState<Rank[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /* filters */
  const [searchCode, setSearchCode] = useState('');
  const [searchName, setSearchName] = useState('');
  const [filterDept, setFilterDept] = useState('');

  /* form modal */
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Rank | null>(null);
  const [form, setForm] = useState<RankPayload>(emptyForm);

  /* context menu */
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; rank: Rank } | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);

  /* ── data ── */
  const fetchRanks = useCallback(async () => {
    setLoading(true);
    try { setRanks(await rankApi.getAll()); }
    catch { toast.error('Không thể tải danh sách chức danh'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { fetchRanks(); }, [fetchRanks]);

  const [page, setPage] = useState(1);

  const filtered = useMemo(() => ranks.filter(r => {
    if (filterDept && (r.department || '') !== filterDept) return false;
    if (searchCode && !r.rankCode.toLowerCase().includes(searchCode.toLowerCase())) return false;
    if (searchName && !r.rankName.toLowerCase().includes(searchName.toLowerCase())) return false;
    return true;
  }), [ranks, filterDept, searchCode, searchName]);

  /* ── phân trang phía client, cùng cỡ trang với CrewListPage ── */
  const PAGE_SIZE = 15;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  /* ── context menu ── */
  const handleContextMenu = useCallback((e: React.MouseEvent, rank: Rank) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, rank });
    setSelectedRowId(rank.id);
  }, []);
  const closeContextMenu = useCallback(() => { setContextMenu(null); setSelectedRowId(null); }, []);
  useEffect(() => {
    const h = () => closeContextMenu();
    window.addEventListener('click', h);
    return () => window.removeEventListener('click', h);
  }, [closeContextMenu]);

  /* ── form actions ── */
  const openCreate = useCallback(() => { setEditing(null); setForm(emptyForm); setShowForm(true); }, []);
  const openEdit = useCallback((r: Rank) => {
    setEditing(r);
    setForm({ rankCode: r.rankCode, rankName: r.rankName, department: r.department || 'DECK', level: r.level || '', sortOrder: r.sortOrder ?? 0 });
    setShowForm(true);
  }, []);

  const handleDelete = useCallback(async (r: Rank) => {
    const { confirmed } = await confirm({
      title: 'Xóa chức danh', message: `Bạn có chắc muốn xóa "${r.rankName}"?`,
      confirmLabel: 'Xóa', cancelLabel: 'Hủy', variant: 'danger',
    });
    if (!confirmed) return;
    try { await rankApi.remove(r.id); toast.success('Đã xóa chức danh'); fetchRanks(); }
    catch (err) { toast.error('Lỗi xóa', err instanceof Error ? err.message : 'Không thể xóa'); }
  }, [confirm, toast, fetchRanks]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.rankCode.trim() || !form.rankName.trim()) { toast.error('Vui lòng nhập mã và tên chức danh'); return; }
    setSaving(true);
    try {
      if (editing) { await rankApi.update(editing.id, form); toast.success('Đã cập nhật chức danh'); }
      else { await rankApi.create(form); toast.success('Đã tạo chức danh mới'); }
      setShowForm(false); fetchRanks();
    } catch (err) { toast.error('Lỗi lưu', err instanceof Error ? err.message : 'Không thể lưu'); }
    finally { setSaving(false); }
  }, [editing, form, toast, fetchRanks]);

  /* ── loading ── */
  if (loading) {
    return <div className="cl-loading"><Loader2 size={28} className="spin" /><p>Đang tải danh sách chức danh...</p></div>;
  }

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <div className="cl-page" style={{ padding: 0, minHeight: 'auto' }}>
      {/* Header */}
      <div className="cl-header">
        <div className="cl-header-left">
          <Award size={16} className="cl-header-icon" />
          <h1 className="cl-title">Chức danh</h1>
          <span className="cl-count-badge">{ranks.length}</span>
        </div>
        <div className="cl-header-right">
          <button className="cl-btn cl-btn--primary" onClick={openCreate}><Plus size={13} /> Thêm chức danh</button>
        </div>
      </div>

      {/* Department filters */}
      <div className="cl-stats">
        {DEPT_OPTIONS.map(opt => (
          <button key={opt.value}
            className={`cl-stat${filterDept === opt.value ? ' cl-stat--active' : ''}`}
            onClick={() => setFilterDept(opt.value)}
          >
            <span className="cl-stat-val">{opt.value ? ranks.filter(r => (r.department || '') === opt.value).length : ranks.length}</span>
            <span className="cl-stat-lbl">{opt.label}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="cl-table-card">
        <table className="cl-table">
          <thead>
            <tr className="cl-tr-labels">
              <th style={{ width: 44, textAlign: 'center' }}>STT</th>
              <th style={{ width: '18%' }}>Mã chức danh</th>
              <th>Tên chức danh</th>
              <th style={{ width: '16%' }}>Bộ phận</th>
              <th>Cấp bậc</th>
              <th style={{ width: '10%', textAlign: 'center' }}>Thứ tự</th>
              <th style={{ width: '12%', textAlign: 'center' }}>Trạng thái</th>
            </tr>
            <tr className="cl-tr-filters">
              <th></th>
              <th><div className="cl-search-wrap"><input className="cl-cf" placeholder="Tìm mã" value={searchCode} onChange={e => setSearchCode(e.target.value)} /></div></th>
              <th><div className="cl-search-wrap"><input className="cl-cf" placeholder="Tìm tên" value={searchName} onChange={e => setSearchName(e.target.value)} /></div></th>
              <th></th><th></th><th></th><th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="cl-empty">
                <Award size={24} />
                <p>{ranks.length === 0 ? 'Chưa có chức danh nào' : 'Không tìm thấy chức danh phù hợp'}</p>
              </td></tr>
            ) : paged.map((r, idx) => (
              <tr key={r.id}
                className={`cl-tr${idx % 2 === 1 ? ' cl-tr--alt' : ''}${selectedRowId === r.id ? ' cl-tr--selected' : ''}`}
                onContextMenu={e => handleContextMenu(e, r)}
              >
                <td style={{ textAlign: 'center' }}>{idx + 1}</td>
                <td><span className="cl-code">{r.rankCode}</span></td>
                <td>{r.rankName}</td>
                <td>{r.department || '—'}</td>
                <td>{r.level || '—'}</td>
                <td style={{ textAlign: 'center' }}>{r.sortOrder ?? 0}</td>
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
          Hiển thị {paged.length} / {filtered.length} chức danh
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
          <button className="cl-ctx-item" onClick={() => { openEdit(contextMenu.rank); closeContextMenu(); }}>
            <Pencil size={13} /> Chỉnh sửa
          </button>
          <div className="cl-ctx-divider" />
          <button className="cl-ctx-item cl-ctx-item--danger" onClick={() => { handleDelete(contextMenu.rank); closeContextMenu(); }}>
            <Trash2 size={13} /> Xóa chức danh
          </button>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="cert-form-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div className="cfm-header">
              <span className="cfm-title">{editing ? 'Chỉnh sửa chức danh' : 'Thêm chức danh mới'}</span>
              <button className="cfm-close" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="cfm-body">
                <div className="cfm-grid">
                  <div className="cfm-field cfm-field--required">
                    <label>Mã chức danh</label>
                    <input value={form.rankCode} onChange={e => setForm(f => ({ ...f, rankCode: e.target.value }))} placeholder="VD: CAPT" style={{ fontFamily: 'monospace' }} />
                  </div>
                  <div className="cfm-field cfm-field--required">
                    <label>Tên chức danh</label>
                    <input value={form.rankName} onChange={e => setForm(f => ({ ...f, rankName: e.target.value }))} placeholder="VD: Thuyền trưởng" />
                  </div>
                  <div className="cfm-field">
                    <label>Bộ phận</label>
                    <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
                      {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  <div className="cfm-field">
                    <label>Cấp bậc</label>
                    <input value={form.level || ''} onChange={e => setForm(f => ({ ...f, level: e.target.value }))} />
                  </div>
                  <div className="cfm-field">
                    <label>Thứ tự hiển thị</label>
                    <input type="number" value={form.sortOrder} onChange={e => setForm(f => ({ ...f, sortOrder: Number(e.target.value) }))} />
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
