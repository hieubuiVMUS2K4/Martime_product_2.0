import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Pencil, Trash2, Loader2, ShieldCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { certificateApi } from '../../../services/crew.service';
import { useToast } from '../../../components/common/Toast';
import { useConfirmDialog } from '../../../components/common/ConfirmDialog';
import { CertificateFormModal } from './CertificateFormModal';
import type { CertificateType } from '../../../types/crew.types';
import '../Crew/CrewListPage.css';
import './CertificateCatalogTab.css';

/* ───────── constants ───────── */
const CATEGORY_OPTIONS = [
  { value: '', label: 'Tất cả' },
  { value: 'DOCUMENT', label: 'Giấy tờ' },
  { value: 'COMPETENCY', label: 'Năng lực' },
  { value: 'MEDICAL', label: 'Y tế' },
  { value: 'PROFICIENCY', label: 'Thành thạo' },
  { value: 'SAFETY', label: 'An toàn' },
];

const CATEGORY_LABELS: Record<string, string> = {
  DOCUMENT: 'Giấy tờ',
  COMPETENCY: 'Năng lực', MEDICAL: 'Y tế', PROFICIENCY: 'Thành thạo', SAFETY: 'An toàn',
};
const CATEGORY_COLORS: Record<string, { bg: string; color: string }> = {
  DOCUMENT: { bg: '#e0e7ff', color: '#3730a3' },
  COMPETENCY: { bg: '#dce9f8', color: '#1b4c7e' },
  MEDICAL:    { bg: '#d1fae5', color: '#065f46' },
  PROFICIENCY:{ bg: '#fef3c7', color: '#92400e' },
  SAFETY:     { bg: '#fee2e2', color: '#991b1b' },
};

/* ═══════════════════════════════════════════════════════════════ */
export const CertificateCatalogTab: React.FC = () => {
  const toast = useToast();
  const { confirm } = useConfirmDialog();

  const [certs, setCerts] = useState<CertificateType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  /* filters */
  const [searchCode, setSearchCode] = useState('');
  const [searchName, setSearchName] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [page, setPage] = useState(1);

  /* form modal */
  const [showForm, setShowForm] = useState(false);
  const [editingCert, setEditingCert] = useState<CertificateType | null>(null);

  /* context menu */
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; cert: CertificateType } | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);

  /* ── data ── */
  const fetchCerts = useCallback(async () => {
    setLoading(true);
    try { setCerts(await certificateApi.getTypes()); }
    catch { toast.error('Không thể tải danh sách chứng chỉ'); }
    finally { setLoading(false); }
  }, [toast]);

  useEffect(() => {
    fetchCerts();
  }, [fetchCerts]);

  const filtered = useMemo(() => certs.filter(c => {
    if (filterCategory && c.category !== filterCategory) return false;
    if (searchCode && !c.certificateCode.toLowerCase().includes(searchCode.toLowerCase())) return false;
    if (searchName && !c.certificateName.toLowerCase().includes(searchName.toLowerCase())) return false;
    return true;
  }), [certs, filterCategory, searchCode, searchName]);

  /* ── phân trang phía client, cùng cỡ trang với CrewListPage ── */
  const PAGE_SIZE = 15;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // Lọc xong mà đang đứng ở trang không còn tồn tại thì kéo về trang cuối hợp lệ,
  // nếu không bảng sẽ trống trơn dù vẫn có kết quả.
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  /* ── context menu ── */
  const handleContextMenu = useCallback((e: React.MouseEvent, cert: CertificateType) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, cert });
    setSelectedRowId(cert.id);
  }, []);
  const closeContextMenu = useCallback(() => { setContextMenu(null); setSelectedRowId(null); }, []);
  React.useEffect(() => {
    const h = () => closeContextMenu();
    window.addEventListener('click', h);
    return () => window.removeEventListener('click', h);
  }, [closeContextMenu]);

  /* ── form actions ── */
  const openCreate = useCallback(() => {
    setEditingCert(null);
    setShowForm(true);
  }, []);

  const openEdit = useCallback((c: CertificateType) => {
    setEditingCert(c);
    setShowForm(true);
  }, []);

  const handleDelete = useCallback(async (c: CertificateType) => {
    const { confirmed } = await confirm({
      title: 'Xóa loại chứng chỉ',
      message: `Bạn có chắc muốn xóa "${c.certificateName}"?`,
      confirmLabel: 'Xóa', cancelLabel: 'Hủy', variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await certificateApi.deleteType(c.id);
      toast.success('Đã xóa loại chứng chỉ');
      fetchCerts();
    } catch (err) {
      toast.error('Lỗi xóa', err instanceof Error ? err.message : 'Không thể xóa');
    }
  }, [confirm, toast, fetchCerts]);

  const handleSubmit = useCallback(async (payload: {
    certificateCode: string;
    certificateName: string;
    category?: string;
    validityPeriodMonths?: number;
    description?: string;
    issuingAuthority?: string;
    isMandatory: boolean;
    countryIds: number[];
    rankIds: number[];
  }) => {
    if (!payload.certificateCode.trim() || !payload.certificateName.trim()) {
      toast.error('Vui lòng nhập mã và tên chứng chỉ');
      return;
    }
    setSaving(true);
    try {
      if (editingCert) {
        await certificateApi.updateType(editingCert.id, payload);
        toast.success('Đã cập nhật loại chứng chỉ');
      } else {
        await certificateApi.createType(payload);
        toast.success('Đã tạo loại chứng chỉ mới');
      }
      setShowForm(false);
      fetchCerts();
    } catch (err) {
      toast.error('Lỗi lưu', err instanceof Error ? err.message : 'Không thể lưu');
    } finally {
      setSaving(false);
    }
  }, [editingCert, toast, fetchCerts]);

  /* ── loading ── */
  if (loading) {
    return (
      <div className="cl-loading"><Loader2 size={28} className="spin" /><p>Đang tải danh sách loại chứng chỉ...</p></div>
    );
  }

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <div className="cl-page" style={{ padding: 0, minHeight: 'auto' }}>
      {/* Header */}
      <div className="cl-header">
        <div className="cl-header-left">
          <ShieldCheck size={16} className="cl-header-icon" />
          <h1 className="cl-title">Loại chứng chỉ</h1>
          <span className="cl-count-badge">{certs.length}</span>
        </div>
        <div className="cl-header-right">
          <button className="cl-btn cl-btn--primary" onClick={openCreate}><Plus size={13} /> Thêm loại chứng chỉ</button>
        </div>
      </div>

      {/* Category filters */}
      <div className="cl-stats">
        {CATEGORY_OPTIONS.map(opt => (
          <button key={opt.value}
            className={`cl-stat${filterCategory === opt.value ? ' cl-stat--active' : ''}`}
            onClick={() => { setFilterCategory(opt.value); setPage(1); }}
          >
            <span className="cl-stat-val">{opt.value ? certs.filter(c => c.category === opt.value).length : certs.length}</span>
            <span className="cl-stat-lbl">{opt.label}</span>
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="cl-table-card certificate-catalog-card">
        <table className="cl-table certificate-catalog-table">
          <colgroup>
            <col style={{ width: '12%' }} /><col style={{ width: '29%' }} />
            <col style={{ width: '18%' }} /><col style={{ width: '11%' }} />
            <col style={{ width: '9%' }} /><col style={{ width: '10%' }} />
            <col style={{ width: '11%' }} />
          </colgroup>
          <thead>
            <tr className="cl-tr-labels">
              <th>Mã chứng chỉ</th>
              <th>Tên chứng chỉ</th>
              <th>Cấp bởi</th>
              <th>Phân loại</th>
              <th style={{ textAlign: 'center' }}>Thời hạn (tháng)</th>
              <th style={{ textAlign: 'center' }}>Bắt buộc</th>
              <th style={{ textAlign: 'center', borderRight: 'none' }}>Trạng thái</th>
            </tr>
            <tr className="cl-tr-filters">
              <th><div className="cl-search-wrap"><input className="cl-cf" placeholder="Tìm mã" value={searchCode} onChange={e => { setSearchCode(e.target.value); setPage(1); }} /></div></th>
              <th><div className="cl-search-wrap"><input className="cl-cf" placeholder="Tìm tên" value={searchName} onChange={e => { setSearchName(e.target.value); setPage(1); }} /></div></th>
              <th></th><th></th><th></th><th></th><th style={{ borderRight: 'none' }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="cl-empty">
                <ShieldCheck size={24} />
                <p>{certs.length === 0 ? 'Chưa có loại chứng chỉ nào' : 'Không tìm thấy loại chứng chỉ phù hợp'}</p>
              </td></tr>
            ) : paged.map((c, idx) => {
              const catStyle = CATEGORY_COLORS[c.category || ''];
              return (
                <tr key={c.id}
                  className={`cl-tr${idx % 2 === 1 ? ' cl-tr--alt' : ''}${selectedRowId === c.id ? ' cl-tr--selected' : ''}`}
                  onContextMenu={e => handleContextMenu(e, c)}
                >
                  <td ><span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 12 }}>{c.certificateCode}</span></td>
                  <td >{c.certificateName}</td>
                  <td>{c.issuingAuthority || '—'}</td>
                  <td >
                    {c.category && catStyle ? (
                      <span style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: 9999,
                        fontSize: 11, fontWeight: 600, background: catStyle.bg, color: catStyle.color,
                      }}>
                        {CATEGORY_LABELS[c.category] || c.category}
                      </span>
                    ) : '—'}
                  </td>
                  <td style={{ textAlign: 'center' }}>{c.validityPeriodMonths ?? '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    {c.isMandatory
                      ? <span style={{ color: '#dc2626', fontWeight: 600, fontSize: 12 }}>Bắt buộc</span>
                      : <span style={{ color: '#6b7c8f', fontSize: 12 }}>Tùy chọn</span>}
                  </td>
                  <td style={{ textAlign: 'center', borderRight: 'none' }}>
                    <span className={`cl-status-badge ${c.isActive ? 'cl-status-badge--on' : 'cl-status-badge--off'}`}>
                      <span className="cl-status-badge__dot" />
                      {c.isActive ? 'Hoạt động' : 'Ngưng'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Chân trang — cùng khuôn với CrewListPage */}
      <div className="cl-footer">
        <span className="cl-footer-info">
          Hiển thị {paged.length} / {filtered.length} loại chứng chỉ
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
          <button className="cl-ctx-item" onClick={() => { openEdit(contextMenu.cert); closeContextMenu(); }}>
            <Pencil size={13} /> Chỉnh sửa
          </button>
          <div className="cl-ctx-divider" />
          <button className="cl-ctx-item cl-ctx-item--danger" onClick={() => { handleDelete(contextMenu.cert); closeContextMenu(); }}>
            <Trash2 size={13} /> Xóa loại chứng chỉ
          </button>
        </div>
      )}

      {/* ═══════ Form Modal ═══════ */}
      {showForm && (
        <CertificateFormModal
          cert={editingCert}
          onClose={() => setShowForm(false)}
          onSubmit={handleSubmit}
          saving={saving}
        />
      )}
    </div>
  );
};
