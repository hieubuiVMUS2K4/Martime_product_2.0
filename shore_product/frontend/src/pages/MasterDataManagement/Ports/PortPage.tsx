import React, { useState, useEffect, useCallback } from 'react';
import { Anchor, Plus, Pencil, RefreshCw, Loader2, AlertTriangle, X, Ban, ChevronLeft, ChevronRight } from 'lucide-react';
// Dung chung he lop cl-* voi cac muc danh muc khac
import '../Crew/CrewListPage.css';
import { portApi } from '../../../services/crew.service';
import type { Port, PortPayload } from '../../../services/crew.service';
import { useConfirm } from '@/components/common/ConfirmDialog';

const EMPTY: PortPayload = {
  portCode: '', portName: '', country: '', countryCode: '',
  latitude: undefined, longitude: undefined, timeZone: '', isActive: true,
};

/**
 * Danh mục cảng — bờ làm chủ, phát xuống mọi tàu.
 *
 * Thêm/sửa ở đây sẽ tự đồng bộ tới tất cả các tàu, giống cách làm với chức danh,
 * quốc gia và loại chứng chỉ. Ngừng sử dụng là đặt cờ, KHÔNG xoá cứng — các chuyến đi
 * và mục sổ thuyền viên cũ còn tham chiếu tới cảng.
 */
export const PortPage: React.FC = () => {
  const ask = useConfirm();
  const [ports, setPorts] = useState<Port[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fCode, setFCode] = useState('');
  const [fName, setFName] = useState('');
  const [fCountry, setFCountry] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Port | null>(null);
  const [form, setForm] = useState<PortPayload>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      const res = await portApi.search({
        code: fCode || undefined,
        name: fName || undefined,
        country: fCountry || undefined,
        // Chỉ lấy cảng đang dùng. Cảng đã ngừng vẫn nằm trong CSDL để dữ liệu cũ
        // (chuyến đi, sổ thuyền viên) còn tham chiếu được, chỉ không hiện ở danh mục.
        isActive: true,
        page,
        pageSize: PAGE_SIZE,
      });
      setPorts(res.data);
      setTotal(res.pagination.totalCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được danh mục cảng');
    } finally {
      setLoading(false);
    }
  }, [fCode, fName, fCountry, page]);

  // Hoãn 300ms để không bắn request theo từng phím gõ
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Ngừng dùng dòng cuối cùng của trang cuối → trang hiện tại thành rỗng, tự lùi lại
  useEffect(() => {
    if (!loading && ports.length === 0 && page > 1) setPage(p => p - 1);
  }, [loading, ports.length, page]);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setFormError(null); setModalOpen(true); };
  const openEdit = (p: Port) => {
    setEditing(p);
    setForm({
      portCode: p.portCode, portName: p.portName,
      country: p.country ?? '', countryCode: p.countryCode ?? '',
      latitude: p.latitude ?? undefined, longitude: p.longitude ?? undefined,
      timeZone: p.timeZone ?? '', isActive: p.isActive,
    });
    setFormError(null);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true); setFormError(null);
    try {
      if (editing) await portApi.update(editing.id, form);
      else await portApi.create(form);
      setModalOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (p: Port) => {
    if (!await ask(`Ngừng sử dụng cảng "${p.portName}"?\nCảng vẫn được giữ lại trong dữ liệu cũ.`, { title: 'Ngừng sử dụng cảng', confirmLabel: 'Ngừng sử dụng', variant: 'warning' })) return;
    try { await portApi.deactivate(p.id); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Thao tác thất bại'); }
  };

  return (
    <div className="cl-page">
      {/* Toolbar — cùng khuôn cl-header với các mục danh mục khác */}
      <div className="cl-header">
        <div className="cl-header-left">
          <Anchor size={16} className="cl-header-icon" />
          <h1 className="cl-title">Danh mục cảng</h1>
          <span className="cl-count-badge">{total}</span>
        </div>
        <div className="cl-header-right">
          <button className="cl-btn cl-btn--ghost" onClick={load} title="Làm mới"><RefreshCw size={13} /></button>
          <button className="cl-btn cl-btn--primary" onClick={openCreate}><Plus size={13} /> Thêm cảng</button>
        </div>
      </div>

      {error && (
        <div className="cl-error">
          <AlertTriangle size={13} /> {error}
        </div>
      )}

      {/* Lớp phủ mờ thay vì tháo bảng ra: hàng lọc nằm TRONG bảng, tháo đi thì ô nhập
          biến mất giữa chừng, mất con trỏ và không gõ tiếp được chữ thứ hai. */}
      <div className="cl-table-card" style={{ position: 'relative' }}>
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.55)',
            zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Loader2 size={24} className="spin" style={{ color: 'var(--moc-blue)' }} />
          </div>
        )}
        <table className="cl-table">
          <thead>
            <tr className="cl-tr-labels">
              <th style={{ width: '11%' }}>Mã</th>
              <th style={{ width: '28%' }}>Tên cảng</th>
              <th style={{ width: '18%' }}>Quốc gia</th>
              <th style={{ width: '17%' }}>Toạ độ</th>
              <th style={{ width: '12%' }}>Múi giờ</th>
              <th style={{ width: '9%', textAlign: 'center' }}>Trạng thái</th>
              <th style={{ width: '9%', textAlign: 'center' }}>Thao tác</th>
            </tr>
            <tr className="cl-tr-filters">
              <th>
                <div className="cl-search-wrap">
                  <input className="cl-cf" placeholder="Tìm mã" value={fCode}
                    onChange={e => { setFCode(e.target.value); setPage(1); }} />
                </div>
              </th>
              <th>
                <div className="cl-search-wrap">
                  <input className="cl-cf" placeholder="Tìm tên cảng" value={fName}
                    onChange={e => { setFName(e.target.value); setPage(1); }} />
                </div>
              </th>
              <th>
                <div className="cl-search-wrap">
                  <input className="cl-cf" placeholder="Tìm quốc gia" value={fCountry}
                    onChange={e => { setFCountry(e.target.value); setPage(1); }} />
                </div>
              </th>
              <th></th><th></th><th></th><th></th>
            </tr>
          </thead>
          <tbody>
            {ports.length === 0 && !loading ? (
              <tr><td colSpan={7} className="cl-empty">
                <Anchor size={24} />
                <p>Chưa có cảng nào</p>
                <p>Danh mục cảng được đẩy lên từ tàu, hoặc thêm tay tại đây</p>
              </td></tr>
            ) : ports.map((p, idx) => (
              <tr key={p.id} className={`cl-tr${idx % 2 === 1 ? ' cl-tr--alt' : ''}`}
                style={!p.isActive ? { opacity: 0.55 } : undefined}>
                <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{p.portCode}</td>
                <td>{p.portName}</td>
                <td>
                  {p.country ?? '—'}
                  {p.countryCode && <span className="cl-muted" style={{ marginLeft: 6, fontFamily: 'monospace' }}>{p.countryCode}</span>}
                </td>
                <td className="cl-muted" style={{ fontFamily: 'monospace', fontSize: 11.5 }}>
                  {p.latitude != null && p.longitude != null
                    ? `${p.latitude.toFixed(4)}, ${p.longitude.toFixed(4)}` : '—'}
                </td>
                <td className="cl-muted">{p.timeZone ?? '—'}</td>
                <td style={{ textAlign: 'center' }}>
                  <span className={`cl-status-badge ${p.isActive ? 'cl-status-badge--on' : 'cl-status-badge--off'}`}>
                    <span className="cl-status-badge__dot" />
                    {p.isActive ? 'Đang dùng' : 'Đã ngừng'}
                  </span>
                </td>
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button className="cl-icon-btn" onClick={() => openEdit(p)} title="Sửa"><Pencil size={13} /></button>
                  {p.isActive && (
                    <button className="cl-icon-btn" onClick={() => handleDeactivate(p)} title="Ngừng sử dụng"><Ban size={13} /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Chân trang — cùng khuôn với CrewListPage */}
      <div className="cl-footer">
        <span className="cl-footer-info">
          Hiển thị {ports.length} / {total} cảng
        </span>
        {totalPages > 1 && (
          <div className="cl-pagi-btns">
            <button className="cl-pagi-btn" disabled={page <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}><ChevronLeft size={14} /></button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let n: number;
              if (totalPages <= 7) n = i + 1;
              else if (page <= 4) n = i + 1;
              else if (page >= totalPages - 3) n = totalPages - 6 + i;
              else n = page - 3 + i;
              return <button key={n} className={`cl-pagi-btn${n === page ? ' cl-pagi-btn--cur' : ''}`} onClick={() => setPage(n)}>{n}</button>;
            })}
            <button className="cl-pagi-btn" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}><ChevronRight size={14} /></button>
          </div>
        )}
      </div>


      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setModalOpen(false)}>
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-200">
              <h2 className="font-bold text-gray-800">{editing ? 'Sửa cảng' : 'Thêm cảng mới'}</h2>
              <button onClick={() => setModalOpen(false)} className="p-1 rounded hover:bg-gray-100"><X size={16} /></button>
            </div>

            {formError && (
              <div className="mx-5 mt-3 flex items-start gap-2 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {formError}
              </div>
            )}

            <form onSubmit={handleSave} className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Mã UN/LOCODE <span className="text-red-500">*</span></span>
                  <input required maxLength={5} value={form.portCode}
                    onChange={e => setForm({ ...form, portCode: e.target.value.toUpperCase() })}
                    placeholder="VNSGN"
                    className="mt-1 w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm font-mono" />
                </label>
                <label className="block col-span-2">
                  <span className="text-xs font-semibold text-gray-600">Tên cảng <span className="text-red-500">*</span></span>
                  <input required value={form.portName}
                    onChange={e => setForm({ ...form, portName: e.target.value })}
                    placeholder="Ho Chi Minh City (Saigon)"
                    className="mt-1 w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm" />
                </label>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <label className="block col-span-2">
                  <span className="text-xs font-semibold text-gray-600">Quốc gia</span>
                  <input value={form.country ?? ''}
                    onChange={e => setForm({ ...form, country: e.target.value })}
                    placeholder="Vietnam"
                    className="mt-1 w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Mã quốc gia</span>
                  <input maxLength={2} value={form.countryCode ?? ''}
                    onChange={e => setForm({ ...form, countryCode: e.target.value.toUpperCase() })}
                    placeholder="VN"
                    className="mt-1 w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm font-mono" />
                </label>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Vĩ độ</span>
                  <input type="number" step="0.0001" value={form.latitude ?? ''}
                    onChange={e => setForm({ ...form, latitude: e.target.value === '' ? undefined : Number(e.target.value) })}
                    className="mt-1 w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Kinh độ</span>
                  <input type="number" step="0.0001" value={form.longitude ?? ''}
                    onChange={e => setForm({ ...form, longitude: e.target.value === '' ? undefined : Number(e.target.value) })}
                    className="mt-1 w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-gray-600">Múi giờ</span>
                  <input value={form.timeZone ?? ''}
                    onChange={e => setForm({ ...form, timeZone: e.target.value })}
                    placeholder="Asia/Ho_Chi_Minh"
                    className="mt-1 w-full border border-gray-300 rounded px-2.5 py-1.5 text-sm" />
                </label>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.isActive}
                  onChange={e => setForm({ ...form, isActive: e.target.checked })} />
                Đang sử dụng
              </label>

              <div className="rounded bg-primary-soft border border-accent/30 px-3 py-2 text-xs text-primary">
                Cảng lưu tại đây sẽ tự động được phát xuống <strong>tất cả các tàu</strong>.
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setModalOpen(false)}
                  className="px-3.5 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50">Hủy</button>
                <button type="submit" disabled={saving}
                  className="cl-btn cl-btn--primary" style={{ padding: '6px 14px' }}>
                  {saving && <Loader2 size={13} className="animate-spin" />}
                  {editing ? 'Lưu thay đổi' : 'Thêm cảng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
