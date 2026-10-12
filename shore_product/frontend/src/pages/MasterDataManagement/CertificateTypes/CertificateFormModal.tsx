import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Globe, Award, X, Loader2 } from 'lucide-react';
import { certificateApi, referenceApi } from '../../../services/crew.service';
import type { CertificateType, Country, Rank } from '../../../types/crew.types';
import './CertificateFormModal.css';
import '../Crew/CrewFormModal.css';

/* ───────── types ───────── */
interface FormData {
  certificateCode: string;
  certificateName: string;
  category: string;
  validityPeriodMonths: number | '';
  description: string;
  issuingAuthority: string;
  isMandatory: boolean;
  countryIds: number[];
  rankIds: number[];
}

const EMPTY_FORM: FormData = {
  certificateCode: '', certificateName: '', category: 'SAFETY',
  validityPeriodMonths: '', description: '', issuingAuthority: '', isMandatory: false,
  countryIds: [], rankIds: [],
};

type FormSection = 'basic' | 'countries' | 'ranks';

const SECTIONS: { key: FormSection; label: string; icon: React.ReactNode }[] = [
  { key: 'basic',     label: 'Thông tin chung', icon: <ShieldCheck size={14} /> },
  { key: 'countries', label: 'Quốc gia',        icon: <Globe size={14} /> },
  { key: 'ranks',     label: 'Chức danh',       icon: <Award size={14} /> },
];

/* ───────── props ───────── */
interface Props {
  cert: CertificateType | null;
  onClose: () => void;
  onSubmit: (data: {
    certificateCode: string;
    certificateName: string;
    category?: string;
    validityPeriodMonths?: number;
    description?: string;
    issuingAuthority?: string;
    isMandatory: boolean;
    countryIds: number[];
    rankIds: number[];
  }) => Promise<void>;
  saving: boolean;
}

/* ═══════════════════════════════════════════════════════════════ */
export const CertificateFormModal: React.FC<Props> = ({ cert, onClose, onSubmit, saving }) => {
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [activeSection, setActiveSection] = useState<FormSection>('basic');
  const [countries, setCountries] = useState<Country[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);

  /* load reference data */
  useEffect(() => {
    referenceApi.getCountries().then(setCountries).catch(() => {});
    referenceApi.getRanks().then(setRanks).catch(() => {});
  }, []);

  /* populate form when editing */
  useEffect(() => {
    if (!cert) { setForm(EMPTY_FORM); return; }
    setForm({
      certificateCode: cert.certificateCode,
      certificateName: cert.certificateName,
      category: cert.category || 'SAFETY',
      validityPeriodMonths: cert.validityPeriodMonths ?? '',
      description: cert.description || '',
      issuingAuthority: cert.issuingAuthority || '',
      isMandatory: cert.isMandatory,
      countryIds: [], rankIds: [],
    });
    Promise.all([
      certificateApi.getCertificateCountries(cert.id),
      certificateApi.getCertificateRanks(cert.id),
    ]).then(([cIds, rIds]) => {
      setForm(p => ({ ...p, countryIds: cIds, rankIds: rIds }));
    }).catch(() => {});
  }, [cert]);

  /* escape to close */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', h); document.body.style.overflow = ''; };
  }, [onClose]);

  /* toggle helpers */
  const toggleCountry = useCallback((id: number) => {
    setForm(p => ({
      ...p,
      countryIds: p.countryIds.includes(id)
        ? p.countryIds.filter(x => x !== id)
        : [...p.countryIds, id],
    }));
  }, []);

  const toggleRank = useCallback((id: number) => {
    setForm(p => ({
      ...p,
      rankIds: p.rankIds.includes(id)
        ? p.rankIds.filter(x => x !== id)
        : [...p.rankIds, id],
    }));
  }, []);

  /* submit */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit({
      certificateCode: form.certificateCode.trim(),
      certificateName: form.certificateName.trim(),
      category: form.category || undefined,
      validityPeriodMonths: form.validityPeriodMonths === '' ? undefined : Number(form.validityPeriodMonths),
      description: form.description.trim() || undefined,
      issuingAuthority: form.issuingAuthority.trim() || undefined,
      isMandatory: form.isMandatory,
      countryIds: form.countryIds,
      rankIds: form.rankIds,
    });
  };

  /* section label with count */
  const sectionLabel = (s: typeof SECTIONS[number]) => {
    if (s.key === 'countries' && form.countryIds.length) return `${s.label} (${form.countryIds.length})`;
    if (s.key === 'ranks' && form.rankIds.length) return `${s.label} (${form.rankIds.length})`;
    return s.label;
  };

  /* ═══════════════════════ RENDER ═══════════════════════ */
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="cert-form-modal" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="cfm-header">
          <span className="cfm-title">{cert ? 'Chỉnh sửa loại chứng chỉ' : 'Thêm loại chứng chỉ mới'}</span>
          <button className="cfm-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Section Nav */}
        <nav className="cfm-sections">
          {SECTIONS.map(s => (
            <button key={s.key} type="button"
              className={`cfm-section-btn${activeSection === s.key ? ' cfm-section-btn--active' : ''}`}
              onClick={() => setActiveSection(s.key)}
            >
              {s.icon} {sectionLabel(s)}
            </button>
          ))}
        </nav>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
          <div className="cfm-body">

            {/* ── Basic ── */}
            {activeSection === 'basic' && (
              <div className="cfm-grid">
                <div className="cfm-field cfm-field--required">
                  <label>Mã chứng chỉ</label>
                  <input
                    value={form.certificateCode}
                    onChange={e => setForm(p => ({ ...p, certificateCode: e.target.value }))}
                    placeholder="VD: BST, COC_II_1..."
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  />
                  <span className="cfl-hint">Mã định danh duy nhất cho loại chứng chỉ</span>
                </div>

                <div className="cfm-field cfm-field--required">
                  <label>Tên chứng chỉ</label>
                  <input
                    value={form.certificateName}
                    onChange={e => setForm(p => ({ ...p, certificateName: e.target.value }))}
                    placeholder="VD: Basic Safety Training"
                  />
                </div>

                <div className="cfm-field">
                  <label>Phân loại</label>
                  <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                    <option value="SAFETY">An toàn</option>
                    <option value="COMPETENCY">Năng lực</option>
                    <option value="DOCUMENT">Giấy tờ</option>
                    <option value="MEDICAL">Y tế</option>
                    <option value="PROFICIENCY">Thành thạo</option>
                  </select>
                </div>

                <div className="cfm-field">
                  <label>Cấp bởi</label>
                  <input value={form.issuingAuthority} maxLength={200} onChange={e => setForm(p => ({ ...p, issuingAuthority: e.target.value }))} />
                </div>
                <div className="cfm-field">
                  <label>Thời hạn (tháng)</label>
                  <input
                    type="number" min={0}
                    value={form.validityPeriodMonths}
                    onChange={e => setForm(p => ({ ...p, validityPeriodMonths: e.target.value === '' ? '' : Number(e.target.value) }))}
                    placeholder="VD: 60"
                  />
                </div>

                <div className="cfm-field cfm-field--full">
                  <label>Mô tả</label>
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                    placeholder="Mô tả về loại chứng chỉ..."
                  />
                </div>

                <div className="cfm-field cfm-field--full">
                  <label className="cfl-check-row">
                    <input
                      type="checkbox"
                      checked={form.isMandatory}
                      onChange={e => setForm(p => ({ ...p, isMandatory: e.target.checked }))}
                    />
                    Bắt buộc cho tất cả thuyền viên
                  </label>
                </div>
              </div>
            )}

            {/* ── Countries ── */}
            {activeSection === 'countries' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <p className="cfl-list-hint">Chọn các quốc gia áp dụng cho loại chứng chỉ này.</p>

                {countries.length === 0 ? (
                  <div className="cfl-empty">Không có dữ liệu quốc gia</div>
                ) : (
                  <>
                    <div className="cfl-list-header">
                      <span className="cfl-list-count">
                        Đã chọn: <strong>{form.countryIds.length}</strong> / {countries.length}
                      </span>
                      <div className="cfl-list-actions">
                        <button type="button" className="cfl-select-all"
                          onClick={() => setForm(p => ({ ...p, countryIds: countries.map(c => c.id) }))}>
                          Chọn tất cả
                        </button>
                        <button type="button" className="cfl-deselect-all"
                          onClick={() => setForm(p => ({ ...p, countryIds: [] }))}>
                          Bỏ chọn tất cả
                        </button>
                      </div>
                    </div>

                    <div className="cfl-scroll-list">
                      {countries.map(c => {
                        const on = form.countryIds.includes(c.id);
                        return (
                          <div key={c.id}
                            className={`cfl-item${on ? ' cfl-item--on' : ''}`}
                            onClick={() => toggleCountry(c.id)}
                          >
                            <span className="cfl-checkbox">{on && '✓'}</span>
                            <span className="cfl-code">{c.countryCode}</span>
                            <span className="cfl-name">{c.countryName}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Ranks ── */}
            {activeSection === 'ranks' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <p className="cfl-list-hint">Chọn các chức danh yêu cầu loại chứng chỉ này.</p>

                {ranks.length === 0 ? (
                  <div className="cfl-empty">Không có dữ liệu chức danh</div>
                ) : (
                  <>
                    <div className="cfl-list-header">
                      <span className="cfl-list-count">
                        Đã chọn: <strong>{form.rankIds.length}</strong> / {ranks.length}
                      </span>
                      <div className="cfl-list-actions">
                        <button type="button" className="cfl-select-all"
                          onClick={() => setForm(p => ({ ...p, rankIds: ranks.map(r => r.id) }))}>
                          Chọn tất cả
                        </button>
                        <button type="button" className="cfl-deselect-all"
                          onClick={() => setForm(p => ({ ...p, rankIds: [] }))}>
                          Bỏ chọn tất cả
                        </button>
                      </div>
                    </div>

                    <div className="cfl-scroll-list">
                      {ranks.map(r => {
                        const on = form.rankIds.includes(r.id);
                        return (
                          <div key={r.id}
                            className={`cfl-item${on ? ' cfl-item--on' : ''}`}
                            onClick={() => toggleRank(r.id)}
                          >
                            <span className="cfl-checkbox">{on && '✓'}</span>
                            <span className="cfl-name">{r.rankName}</span>
                            {r.department && <span className="cfl-dept">({r.department})</span>}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="cfm-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving
                ? <><Loader2 size={14} className="spin" /> Đang lưu...</>
                : cert ? 'Cập nhật' : 'Tạo mới'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
