import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Loader2, RefreshCw, Search, UserX, Users } from 'lucide-react';
import { toast } from 'sonner';
import { certificateApi } from '../../services/crew.service';
import { Button, QuickFilterBar } from '../../components/common';
import { MultiSelectFilter } from './MultiSelectFilter';
import { AddCrewCertificateModal } from './AddCrewCertificateModal';
import type { ComplianceMatrix, ComplianceStatus, CrewCertificate, CrewCertStatus } from '../../types/crew.types';

type View = 'all' | 'gaps';

const DEPARTMENT_LABELS: Record<string, string> = {
  DECK: 'Boong', ENGINE: 'Máy', CATERING: 'Phục vụ', OTHER: 'Khác',
};

/** Màu và nhãn cho từng trạng thái ô. Thiếu và hết hạn tô đỏ để đập vào mắt. */
const STATUS_STYLE: Record<ComplianceStatus, { tone: string; short: string; label: string }> = {
  VALID:         { tone: 'border-emerald-200 bg-emerald-50 text-emerald-700', short: '✓', label: 'Còn hiệu lực' },
  EXPIRING_SOON: { tone: 'border-amber-200 bg-amber-50 text-amber-700',       short: '!', label: 'Sắp hết hạn' },
  EXPIRED:       { tone: 'border-red-200 bg-red-50 text-red-700',             short: '✕', label: 'Hết hạn' },
  MISSING:       { tone: 'border-red-300 bg-red-50 text-red-700',             short: '—', label: 'Chưa có' },
};

/* Bề rộng hai cột ghim và số cột chứng chỉ tối đa hiện cùng lúc. */
const NAME_W = 220;
const GAP_W = 80;
const MAX_VISIBLE_CERTS = 10;
const MIN_CERT_W = 76;

const thBase = 'h-10 border-b border-r border-b-grid-strong border-r-grid bg-canvas px-2 text-xs font-semibold text-ink';
const tdBase = 'border-b border-r border-grid px-2 py-1.5';

/**
 * Tuân thủ chứng chỉ theo chức danh: mỗi chức danh một bảng thuyền viên × chứng chỉ yêu cầu,
 * hiện TOÀN BỘ và tô đỏ chỗ thiếu / hết hạn. Bấm vào ô để thêm, gia hạn hoặc sửa ngay.
 */
export const RankComplianceTab: React.FC = () => {
  const [data, setData] = useState<ComplianceMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const [view, setView] = useState<View>('all');
  const [selRanks, setSelRanks] = useState<Set<number>>(new Set());
  const [searchCrew, setSearchCrew] = useState('');

  /* Bấm vào một ô của lưới để thao tác thẳng trên đúng chứng chỉ của đúng người. */
  const [modalCrew, setModalCrew] = useState<{ id: string; name: string; rankId?: number } | null>(null);
  const [modalCertId, setModalCertId] = useState<number | undefined>();
  const [modalEditing, setModalEditing] = useState<CrewCertificate | null>(null);

  /**
   * Ô trống  -> thêm mới, đặt sẵn loại chứng chỉ và thuyền viên.
   * Ô đã có  -> sửa/gia hạn ngay trên bản ghi đó, không tạo bản mới.
   */
  const openCell = async (
    crew: { crewMemberId: string; crewName: string; rankId?: number },
    certificateId: number,
    crewCertificateId?: number,
  ) => {
    let editing: CrewCertificate | null = null;
    if (crewCertificateId) {
      try {
        editing = await certificateApi.getCrewCertificateById(crewCertificateId);
      } catch {
        toast.error('Không tải được chứng chỉ để sửa');
        return;
      }
    }
    setModalEditing(editing);
    setModalCertId(certificateId);
    setModalCrew({ id: crew.crewMemberId, name: crew.crewName, rankId: crew.rankId });
  };
  const closeModal = () => { setModalCrew(null); setModalEditing(null); };

  /* Đo bề rộng vùng bảng để chia cột cho vừa khít. */
  const areaRef = useRef<HTMLDivElement>(null);
  const [areaWidth, setAreaWidth] = useState(0);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => setAreaWidth(entries[0].contentRect.width));
    ro.observe(el);
    setAreaWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [loading]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await certificateApi.getComplianceMatrix(false);
      setData(res);
      setSelRanks(new Set(res.ranks.map(r => r.rankId)));
      // Mở sẵn các chức danh đang có vấn đề để không phải bấm từng cái.
      setExpanded(new Set(res.ranks.filter(r => r.gapCount > 0).map(r => r.rankId)));
    } catch {
      toast.error('Không tải được dữ liệu tuân thủ chứng chỉ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  /** Tra trạng thái theo (chứng chỉ, thuyền viên) — dựng một lần thay vì tìm tuyến tính mỗi ô. */
  const statusIndex = useMemo(() => {
    const map = new Map<string, CrewCertStatus>();
    data?.certificates.forEach(cert =>
      cert.crew.forEach(c => map.set(`${cert.certificateId}|${c.crewMemberId}`, c))
    );
    return map;
  }, [data]);

  /**
   * Mỗi chức danh một khối: cột là đúng bộ chứng chỉ khai báo cho chức danh đó
   * (người cùng chức danh có chung bộ yêu cầu), hàng là thuyền viên.
   */
  const blocks = useMemo(() => {
    if (!data) return [];
    const q = searchCrew.trim().toLowerCase();

    return data.ranks
      .filter(rank => selRanks.has(rank.rankId))
      .map(rank => {
        let crew = data.crew.filter(c => c.rankId === rank.rankId);
        if (q) crew = crew.filter(c =>
          c.crewName.toLowerCase().includes(q) || (c.crewCode ?? '').toLowerCase().includes(q)
        );
        if (view === 'gaps') crew = crew.filter(c => c.gapCount > 0);

        const crewIds = new Set(crew.map(c => c.crewMemberId));
        const certs = data.certificates.filter(cert => cert.crew.some(x => crewIds.has(x.crewMemberId)));

        return { rank, crew, certs };
      })
      .filter(b => b.crew.length > 0 && b.certs.length > 0);
  }, [data, searchCrew, view, selRanks]);

  const toggle = (rankId: number) => setExpanded(prev => {
    const s = new Set(prev);
    if (s.has(rankId)) s.delete(rankId); else s.add(rankId);
    return s;
  });

  /**
   * Bề rộng một cột chứng chỉ. Từ 10 loại trở xuống thì chia đều cho vừa khít khung;
   * nhiều hơn thì khoá ở bề rộng của 10 cột, phần dư đẩy ra thanh cuộn ngang.
   */
  const certColWidth = (n: number) => {
    const usable = areaWidth - NAME_W - GAP_W - 2;
    if (usable <= 0) return MIN_CERT_W;
    return Math.max(MIN_CERT_W, usable / Math.min(n, MAX_VISIBLE_CERTS));
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-xs text-ink-muted">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Đang tính tuân thủ chứng chỉ...
      </div>
    );
  }
  if (!data) return null;

  const crewWithGaps = data.crew.filter(c => c.gapCount > 0).length;

  return (
    <div>
      <QuickFilterBar<View>
        active={view}
        onChange={setView}
        items={[
          { key: 'all', label: 'Thuyền viên', count: data.crewTotal, icon: <Users /> },
          { key: 'gaps', label: 'Đang thiếu chứng chỉ', count: crewWithGaps, icon: <UserX />, tone: 'text-red-600' },
        ]}
      />

      {/* Thanh công cụ */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative w-full max-w-[300px]">
          <span className="sr-only">Tìm thuyền viên</span>
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-ink-light" aria-hidden="true" />
          <input
            type="search"
            value={searchCrew}
            onChange={e => setSearchCrew(e.target.value)}
            placeholder="Tìm thuyền viên theo tên, mã..."
            className="h-9 w-full rounded-md border border-line bg-surface pl-8 pr-3 text-sm text-ink placeholder:text-ink-light focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
          />
        </label>
        <MultiSelectFilter
          label="Chức danh"
          options={data.ranks.map(r => ({ id: r.rankId, label: r.rankName, hint: r.rankCode }))}
          selected={selRanks}
          onChange={setSelRanks}
        />

        <div className="ml-auto flex flex-wrap items-center gap-3">
          {(Object.keys(STATUS_STYLE) as ComplianceStatus[]).map(k => (
            <span key={k} className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
              <span className={`inline-flex h-5 w-5 items-center justify-center rounded border text-xs font-bold ${STATUS_STYLE[k].tone}`}>
                {STATUS_STYLE[k].short}
              </span>
              {STATUS_STYLE[k].label}
            </span>
          ))}
          <Button variant="secondary" icon={<RefreshCw className="h-4 w-4" />} loading={loading} onClick={fetchData}>
            Làm mới
          </Button>
        </div>
      </div>

      <div ref={areaRef} className="space-y-3">
        {blocks.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-md border border-grid-strong bg-surface py-14 text-xs text-ink-muted">
            <Users className="h-6 w-6 text-ink-light" aria-hidden="true" />
            {selRanks.size === 0 ? 'Chưa chọn chức danh nào để hiển thị.'
              : view === 'gaps' ? 'Không có thuyền viên nào đang thiếu chứng chỉ.'
                : 'Không có dữ liệu khớp bộ lọc.'}
          </div>
        ) : blocks.map(({ rank, crew, certs }) => {
          const open = expanded.has(rank.rankId);
          const colW = certColWidth(certs.length);
          const scrolls = certs.length > MAX_VISIBLE_CERTS;
          const stickyShadow = scrolls ? 'shadow-[4px_0_6px_-4px_rgba(11,37,69,.18)]' : '';
          const stickyShadowR = scrolls ? 'shadow-[-4px_0_6px_-4px_rgba(11,37,69,.18)]' : '';

          return (
            <section key={rank.rankId} className="overflow-hidden rounded-md border border-grid-strong bg-surface">
              <button
                type="button"
                aria-expanded={open}
                onClick={() => toggle(rank.rankId)}
                className={`flex w-full flex-wrap items-center gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-primary-soft ${
                  open ? 'border-b border-grid' : ''
                } ${rank.gapCount > 0 ? 'bg-red-50/40' : 'bg-canvas'}`}
              >
                {open ? <ChevronDown className="h-4 w-4 text-ink-muted" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 text-ink-muted" aria-hidden="true" />}
                <span className="font-mono text-xs font-bold text-primary">{rank.rankCode}</span>
                <span className="text-sm font-semibold text-ink">{rank.rankName}</span>
                {rank.department && (
                  <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs text-ink-muted">
                    {DEPARTMENT_LABELS[rank.department] || rank.department}
                  </span>
                )}
                <span className="ml-auto flex items-center gap-4 text-xs">
                  <span className="text-ink-muted">
                    {crew.length} người · {certs.length} loại chứng chỉ{scrolls ? ' (kéo ngang để xem thêm)' : ''}
                  </span>
                  {rank.gapCount > 0 ? (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-red-700">
                      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                      {rank.crewWithGaps} người thiếu · {rank.gapCount} lượt
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Đủ chứng chỉ
                    </span>
                  )}
                </span>
              </button>

              {open && (
                <div className={scrolls ? 'overflow-x-auto' : 'overflow-hidden'}>
                  {/* border-separate: ô ghim (sticky) mới giữ được nền và viền khi cuộn ngang. */}
                  <table
                    className="table-fixed border-separate border-spacing-0 text-xs text-ink"
                    style={{ width: NAME_W + GAP_W + certs.length * colW }}
                  >
                    <colgroup>
                      <col style={{ width: NAME_W }} />
                      {certs.map(c => <col key={c.certificateId} style={{ width: colW }} />)}
                      <col style={{ width: GAP_W }} />
                    </colgroup>
                    <thead>
                      <tr>
                        <th scope="col" className={`${thBase} sticky left-0 z-[2] text-left ${stickyShadow}`}>Thuyền viên</th>
                        {certs.map(c => (
                          <th key={c.certificateId} scope="col" className={`${thBase} text-center`} title={c.certificateName}>
                            <span className="font-mono text-xs">{c.certificateCode}</span>
                            {c.isMandatory && <span className="ml-0.5 text-red-600">*</span>}
                          </th>
                        ))}
                        <th scope="col" className={`${thBase} sticky right-0 z-[2] border-r-0 text-center ${stickyShadowR}`}>Thiếu</th>
                      </tr>
                    </thead>
                    <tbody>
                      {crew.map((m, idx) => {
                        const last = idx === crew.length - 1 ? 'border-b-0' : '';
                        return (
                          <tr key={m.crewMemberId}>
                            <td className={`${tdBase} ${last} sticky left-0 z-[1] bg-surface ${stickyShadow}`}>
                              <span className="block truncate font-semibold">{m.crewName}</span>
                              {m.crewCode && <span className="block font-mono text-xs text-ink-muted">{m.crewCode}</span>}
                            </td>

                            {certs.map(c => {
                              const cell = statusIndex.get(`${c.certificateId}|${m.crewMemberId}`);
                              if (!cell) {
                                // Loại này không bắt buộc với người đó — để trống, không phải lỗi.
                                return <td key={c.certificateId} className={`${tdBase} ${last} text-center text-ink-light`}>·</td>;
                              }
                              const st = STATUS_STYLE[cell.status];
                              const tip = `${c.certificateName} — ${st.label}`
                                + (cell.expiryDate ? `\nHết hạn: ${new Date(cell.expiryDate).toLocaleDateString('vi-VN')}` : '')
                                + (cell.status !== 'MISSING' && cell.daysUntilExpiry != null ? `\nCòn ${cell.daysUntilExpiry} ngày` : '');
                              const action = cell.status === 'MISSING' ? 'Bấm để thêm chứng chỉ này'
                                : cell.status === 'EXPIRED' ? 'Bấm để gia hạn'
                                  : 'Bấm để sửa thông tin';
                              return (
                                <td key={c.certificateId} className={`${tdBase} ${last} text-center`}>
                                  <button
                                    type="button"
                                    title={`${tip}\n${action}`}
                                    aria-label={`${m.crewName}: ${tip.replace(/\n/g, ', ')}. ${action}`}
                                    onClick={() => openCell(m, c.certificateId, cell.crewCertificateId)}
                                    className={`inline-flex h-6 min-w-[28px] items-center justify-center rounded border px-1.5 text-xs font-bold transition hover:scale-110 hover:shadow focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${st.tone}`}
                                  >
                                    {st.short}
                                  </button>
                                </td>
                              );
                            })}

                            <td className={`${tdBase} ${last} sticky right-0 z-[1] border-r-0 bg-surface text-center ${stickyShadowR}`}>
                              <span className={m.gapCount > 0 ? 'font-bold text-red-700' : 'text-emerald-700'}>{m.gapCount}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-ink-muted">
        Bấm vào một ô để thao tác ngay: ô trống thì thêm chứng chỉ, ô hết hạn thì gia hạn trên chính bản ghi đó,
        ô còn hiệu lực thì sửa thông tin. Cột là bộ chứng chỉ khai báo cho chức danh ở <strong>Danh mục → Loại chứng chỉ</strong>.
        Dấu <span className="text-red-600">*</span> là loại bắt buộc theo luật.
      </p>

      {modalCrew && (
        <AddCrewCertificateModal
          isOpen
          crewMemberId={modalCrew.id}
          crewMemberName={modalCrew.name}
          rankId={modalCrew.rankId}
          presetCertificateId={modalCertId}
          editingCertificate={modalEditing}
          onClose={closeModal}
          onSave={() => { closeModal(); fetchData(); }}
        />
      )}
    </div>
  );
};
