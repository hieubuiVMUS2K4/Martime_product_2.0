import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import { certificateApi, rankApi } from '../../../services/crew.service';
import type { CertificateType, Rank } from '../../../types/crew.types';
import { useToast } from '../../../components/common/Toast';
import { useConfirmDialog } from '../../../components/common/ConfirmDialog';
import './RankRequirementsTab.css';

type Mapping = { id: number; rankId: number; certificateId: number };

export function RankRequirementsTab() {
  const toast = useToast();
  const { confirm } = useConfirmDialog();
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [certificates, setCertificates] = useState<CertificateType[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [editing, setEditing] = useState<Rank | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [certSearch, setCertSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [rankList, certList, rows] = await Promise.all([
        rankApi.getAll(),
        certificateApi.getTypes(),
        rankApi.getCertificateMappings(),
      ]);
      setRanks(rankList);
      setCertificates(certList);
      setMappings(rows);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Không tải được yêu cầu chứng chỉ',
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!editing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) setEditing(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [editing, saving]);
  const certMap = useMemo(
    () => new Map(certificates.map((c) => [c.id, c])),
    [certificates],
  );
  const filteredRanks = ranks.filter((r) =>
    `${r.rankCode} ${r.rankName}`.toLowerCase().includes(search.toLowerCase()),
  );
  const openEditor = (rank: Rank) => {
    setSelected(
      new Set(
        mappings
          .filter((m) => m.rankId === rank.id)
          .map((m) => m.certificateId),
      ),
    );
    setCertSearch('');
    setEditing(rank);
  };
  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const result = await rankApi.updateCertificateRequirements(editing.id, [
        ...selected,
      ]);
      toast.success(
        `Đã cập nhật: thêm ${result.added}, gỡ ${result.removed} yêu cầu chứng chỉ. Thay đổi đã vào hàng chờ đồng bộ xuống tàu.`,
      );
      setExpanded(editing.id);
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(
        'Không lưu được',
        err instanceof Error ? err.message : 'Lỗi cập nhật',
      );
    } finally {
      setSaving(false);
    }
  };
  const remove = async (rank: Rank, mapping: Mapping) => {
    const { confirmed } = await confirm({
      title: 'Gỡ yêu cầu chứng chỉ',
      message: `Gỡ "${certMap.get(mapping.certificateId)?.certificateName || mapping.certificateId}" khỏi chức danh ${rank.rankName}?`,
      confirmLabel: 'Gỡ yêu cầu',
      cancelLabel: 'Hủy',
      variant: 'danger',
    });
    if (!confirmed) return;
    setSaving(true);
    try {
      await rankApi.updateCertificateRequirements(
        rank.id,
        mappings
          .filter((m) => m.rankId === rank.id && m.id !== mapping.id)
          .map((m) => m.certificateId),
      );
      toast.success('Đã gỡ yêu cầu và tạo hàng chờ đồng bộ xuống tàu');
      await load();
    } catch (err) {
      toast.error(
        'Không gỡ được',
        err instanceof Error ? err.message : 'Lỗi cập nhật',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rank-requirements">
      <div className="rr-toolbar">
        <div>
          <h2>Chứng chỉ bắt buộc theo chức danh</h2>
          <p>
            Quản lý yêu cầu tại bờ; thêm, sửa hoặc gỡ yêu cầu sẽ đồng bộ xuống
            các tàu.
          </p>
        </div>
        <button onClick={load} disabled={loading || saving}>
          <RefreshCw size={14} /> Làm mới
        </button>
      </div>
      <input
        className="rr-search"
        aria-label="Tìm chức danh"
        placeholder="Tìm mã hoặc tên chức danh..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {error && (
        <p className="rr-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <div className="rr-empty">
          <Loader2 size={20} className="spin" /> Đang tải...
        </div>
      ) : (
        <div className="rr-list">
          {filteredRanks.map((rank) => {
            const required = mappings.filter((m) => m.rankId === rank.id);
            return (
              <section key={rank.id} className="rr-rank">
                <div className="rr-rank-header">
                  <button
                    className="rr-expand"
                    onClick={() =>
                      setExpanded(expanded === rank.id ? null : rank.id)
                    }
                    aria-expanded={expanded === rank.id}
                  >
                    {expanded === rank.id ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronRight size={14} />
                    )}
                    <strong>{rank.rankCode}</strong>
                    <span>{rank.rankName}</span>
                  </button>
                  <span className="rr-count">{required.length} chứng chỉ</span>
                  <button onClick={() => openEditor(rank)} disabled={saving}>
                    <Pencil size={13} /> Chỉnh yêu cầu
                  </button>
                </div>
                {expanded === rank.id && (
                  <div className="rr-required">
                    {required.map((mapping) => {
                      const cert = certMap.get(mapping.certificateId);
                      return (
                        <div key={mapping.id}>
                          <span>
                            <strong>
                              {cert?.certificateName ||
                                `Chứng chỉ #${mapping.certificateId}`}
                            </strong>
                            <small>
                              {cert?.certificateCode || '—'} ·{' '}
                              {cert?.category || '—'} ·{' '}
                              {cert?.validityPeriodMonths
                                ? `${cert.validityPeriodMonths} tháng`
                                : 'Không quy định thời hạn'}
                            </small>
                          </span>
                          <button
                            className="rr-remove"
                            disabled={saving}
                            onClick={() => remove(rank, mapping)}
                            aria-label={`Gỡ ${cert?.certificateName || mapping.certificateId}`}
                          >
                            <Trash2 size={14} /> Gỡ
                          </button>
                        </div>
                      );
                    })}
                    {!required.length && (
                      <p>Chưa có yêu cầu chứng chỉ cho chức danh này.</p>
                    )}
                    <button onClick={() => openEditor(rank)} disabled={saving}>
                      <Plus size={14} /> Thêm yêu cầu chứng chỉ
                    </button>
                  </div>
                )}
              </section>
            );
          })}
          {!filteredRanks.length && (
            <p className="rr-empty">Không tìm thấy chức danh.</p>
          )}
        </div>
      )}
      {editing && (
        <div className="rr-backdrop">
          <section
            className="rr-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rr-editor-title"
          >
            <header>
              <div>
                <h2 id="rr-editor-title">
                  Yêu cầu chứng chỉ · {editing.rankCode}
                </h2>
                <p>{editing.rankName}</p>
              </div>
              <button
                disabled={saving}
                onClick={() => setEditing(null)}
                aria-label="Đóng"
              >
                <X size={18} />
              </button>
            </header>
            <div className="rr-editor-body">
              <p>
                Chọn để thêm yêu cầu, bỏ chọn để gỡ. Các loại chứng chỉ vẫn được
                giữ trong danh mục.
              </p>
              <input
                autoFocus
                className="rr-search"
                placeholder="Tìm mã hoặc tên chứng chỉ..."
                aria-label="Tìm chứng chỉ"
                value={certSearch}
                onChange={(e) => setCertSearch(e.target.value)}
              />
              <div className="rr-options">
                {certificates
                  .filter((c) =>
                    `${c.certificateCode} ${c.certificateName}`
                      .toLowerCase()
                      .includes(certSearch.toLowerCase()),
                  )
                  .map((c) => (
                    <label key={c.id}>
                      <input
                        type="checkbox"
                        disabled={
                          saving || (!c.isActive && !selected.has(c.id))
                        }
                        checked={selected.has(c.id)}
                        onChange={(e) =>
                          setSelected((previous) => {
                            const next = new Set(previous);
                            if (e.target.checked) next.add(c.id);
                            else next.delete(c.id);
                            return next;
                          })
                        }
                      />
                      <span>
                        <strong>{c.certificateName}</strong>
                        <small>
                          {c.certificateCode} · {c.category || '—'}
                          {!c.isActive ? ' · Ngừng sử dụng' : ''}
                        </small>
                      </span>
                    </label>
                  ))}
              </div>
            </div>
            <footer>
              <span>{selected.size} chứng chỉ được chọn</span>
              <button disabled={saving} onClick={() => setEditing(null)}>
                Hủy
              </button>
              <button className="rr-primary" disabled={saving} onClick={save}>
                {saving ? 'Đang lưu...' : 'Lưu yêu cầu'}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
