import React, { useState, useEffect, useRef } from 'react';
import { Award, Save, Upload, Trash2, X } from 'lucide-react';
import { certificateApi, referenceApi } from '../../services/crew.service';
import type { CertificateType, Country, CrewCertificate, CrewCertificateRequest } from '../../types/crew.types';
import './CrewModalShell.css';
import './AddCrewCertificateModal.css';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  crewMemberId: string;
  rankId?: number;
  editingCertificate?: CrewCertificate | null;
  /** Đặt sẵn loại chứng chỉ khi thêm mới (bấm từ ô trống của ma trận tuân thủ). */
  presetCertificateId?: number;
  /** Tên thuyền viên hiện trên tiêu đề để biết đang thao tác cho ai. */
  crewMemberName?: string;
}

export const AddCrewCertificateModal: React.FC<Props> = ({
  isOpen, onClose, onSave, crewMemberId, rankId, editingCertificate, presetCertificateId, crewMemberName,
}) => {
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [certTypes, setCertTypes] = useState<CertificateType[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [certificateFile, setCertificateFile] = useState<File | null>(null);
  const [certificatePreview, setCertificatePreview] = useState<string | null>(null);
  /** Ảnh đã lưu trên máy chủ — hiện lên khi sửa để soát trước, thay được ngay nếu sai. */
  const [savedFileUrl, setSavedFileUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    certificateId: '',
    certificateNumber: '',
    issueDate: '',
    expiryDate: '',
    issuingAuthority: '',
    certificateOfCompetency: 'National',
    countryId: null as number | null,
    notes: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const isEditMode = !!editingCertificate;

  /**
   * Khoá ô chọn loại chứng chỉ khi mở từ ma trận tuân thủ hoặc khi đang sửa:
   * loại chứng chỉ đã được xác định từ chính ô vừa bấm, đổi ở đây là sai đối tượng.
   */
  const certLocked = isEditMode || presetCertificateId != null;

  /**
   * Chỉ hiện các loại chứng chỉ mà chức danh của thuyền viên này yêu cầu.
   * API trả kèm cờ isRequiredForRank khi có rankId; không truyền rankId thì hiện tất cả.
   * Loại đang được chọn luôn giữ lại trong danh sách, kể cả khi nó không thuộc chức danh
   * (dữ liệu cũ), nếu không ô select sẽ trống trơn và người dùng tưởng mất dữ liệu.
   */
  const visibleCertTypes = certTypes.filter(c => {
    if (!c.isActive && c.id.toString() !== form.certificateId) return false;
    if (c.id.toString() === form.certificateId) return true;
    return rankId ? c.isRequiredForRank === true : true;
  });

  useEffect(() => {
    if (!isOpen) return;
    setForm({
      certificateId: editingCertificate?.certificateId?.toString() || presetCertificateId?.toString() || '',
      certificateNumber: editingCertificate?.certificateNumber || '',
      issueDate: (editingCertificate?.issueDate || '').split('T')[0],
      expiryDate: (editingCertificate?.expiryDate || '').split('T')[0],
      issuingAuthority: editingCertificate?.issuingAuthority || '',
      certificateOfCompetency: editingCertificate?.certificateOfCompetency || 'National',
      countryId: editingCertificate?.countryId ?? null,
      notes: editingCertificate?.notes || '',
    });
    setErrors({});
    setCertificateFile(null);
    setCertificatePreview(null);
    setSavedFileUrl(editingCertificate?.documentFilePath || editingCertificate?.fileUrl || null);
    loadData();
  }, [isOpen, editingCertificate, presetCertificateId]);

  const loadData = async () => {
    setLoadingData(true);
    try {
      const [types, ctrs] = await Promise.all([
        certificateApi.getTypes(rankId ? { rankId } : undefined),
        referenceApi.getCountries(),
      ]);
      setCertTypes(types);
      setCountries(ctrs);
    } catch { /* ignore */ }
    finally { setLoadingData(false); }
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.certificateId) e.certificateId = 'Chọn loại chứng chỉ';
    if (!form.certificateNumber) e.certificateNumber = 'Nhập số chứng chỉ';
    if (!form.issueDate) e.issueDate = 'Nhập ngày cấp';
    if (!form.expiryDate) e.expiryDate = 'Nhập ngày hết hạn';
    if (form.issueDate && form.expiryDate && new Date(form.expiryDate) <= new Date(form.issueDate)) {
      e.expiryDate = 'Ngày hết hạn phải sau ngày cấp';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const data: CrewCertificateRequest = {
        crewMemberId,
        certificateId: parseInt(form.certificateId),
        certificateNumber: form.certificateNumber,
        issueDate: form.issueDate,
        expiryDate: form.expiryDate,
        issuingAuthority: form.issuingAuthority || undefined,
        certificateOfCompetency: form.certificateOfCompetency,
        countryId: form.countryId ?? undefined,
        notes: form.notes || undefined,
      };

      let certId: number;
      if (isEditMode && editingCertificate) {
        const res = await certificateApi.updateCrewCertificate(editingCertificate.id, data);
        certId = res.id;
      } else {
        const res = await certificateApi.addCrewCertificate(data);
        certId = res.id;
      }

      if (certificateFile) {
        const fd = new FormData();
        fd.append('file', certificateFile);
        await certificateApi.uploadCertificateFile(certId, fd);
      }

      onSave();
      onClose();
    } catch (err) {
      setErrors({ _form: err instanceof Error ? err.message : 'Lỗi khi lưu chứng chỉ' });
    } finally { setLoading(false); }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setErrors(p => ({ ...p, file: 'Tệp không được vượt quá 10MB' })); return; }
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf'];
    if (!allowed.includes(file.type)) { setErrors(p => ({ ...p, file: 'Chỉ chấp nhận ảnh (JPG, PNG, GIF) hoặc PDF' })); return; }
    setCertificateFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => setCertificatePreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setCertificatePreview(null);
    }
  };

  const handleCertChange = (certId: string) => {
    setForm(p => ({ ...p, certificateId: certId }));
    if (form.issueDate && certId) {
      const ct = certTypes.find(c => c.id === parseInt(certId));
      if (ct?.validityPeriodMonths) {
        const issue = new Date(form.issueDate);
        const expiry = new Date(issue);
        expiry.setMonth(expiry.getMonth() + ct.validityPeriodMonths);
        setForm(p => ({ ...p, certificateId: certId, expiryDate: expiry.toISOString().split('T')[0] }));
      }
    }
    if (errors.certificateId) setErrors(p => ({ ...p, certificateId: '' }));
  };

  const handleIssueDateChange = (issueDate: string) => {
    setForm(p => ({ ...p, issueDate }));
    if (issueDate && form.certificateId) {
      const ct = certTypes.find(c => c.id === parseInt(form.certificateId));
      if (ct?.validityPeriodMonths) {
        const d = new Date(issueDate);
        d.setMonth(d.getMonth() + ct.validityPeriodMonths);
        setForm(p => ({ ...p, issueDate, expiryDate: d.toISOString().split('T')[0] }));
      }
    }
    if (errors.issueDate) setErrors(p => ({ ...p, issueDate: '' }));
  };

  if (!isOpen) return null;

  return (
    <div className="acm-overlay" onClick={onClose}>
      <div className="acm-modal" onClick={e => e.stopPropagation()}>
        <div className="acm-header">
          <Award size={18} />
          <h2>{isEditMode ? 'Sửa chứng chỉ' : 'Thêm chứng chỉ'}{crewMemberName ? ` — ${crewMemberName}` : ''}</h2>
          <button className="acm-close" onClick={onClose}><X size={18} /></button>
        </div>

        {loadingData ? (
          <div className="acm-loading">Đang tải dữ liệu...</div>
        ) : (
          <form onSubmit={handleSubmit} className="acm-body">
            {errors._form && <div className="acm-error">{errors._form}</div>}

            <div className="acm-grid">
              <div className="acm-field acm-field--full">
                <label>Loại chứng chỉ *</label>
                <select
                  value={form.certificateId}
                  onChange={e => handleCertChange(e.target.value)}
                  disabled={certLocked}
                  style={certLocked ? { background: '#eef2f7', cursor: 'not-allowed' } : undefined}
                >
                  <option value="">Chọn loại chứng chỉ</option>
                  {visibleCertTypes.map(c => (
                    <option key={c.id} value={c.id}>{c.certificateName} ({c.certificateCode})</option>
                  ))}
                </select>
                {errors.certificateId && <span className="acm-err">{errors.certificateId}</span>}
              </div>

              <div className="acm-field">
                <label>Số chứng chỉ *</label>
                <input value={form.certificateNumber} onChange={e => { setForm(p => ({ ...p, certificateNumber: e.target.value })); if (errors.certificateNumber) setErrors(p => ({ ...p, certificateNumber: '' })); }} />
                {errors.certificateNumber && <span className="acm-err">{errors.certificateNumber}</span>}
              </div>

              <div className="acm-field">
                <label>Loại CoC</label>
                <select value={form.certificateOfCompetency} onChange={e => setForm(p => ({ ...p, certificateOfCompetency: e.target.value }))}>
                  <option value="National">Quốc gia</option>
                  <option value="Flag State">Cờ quốc tịch</option>
                </select>
              </div>

              <div className="acm-field">
                <label>Ngày cấp *</label>
                <input type="date" value={form.issueDate} onChange={e => handleIssueDateChange(e.target.value)} />
                {errors.issueDate && <span className="acm-err">{errors.issueDate}</span>}
              </div>

              <div className="acm-field">
                <label>Ngày hết hạn *</label>
                <input type="date" value={form.expiryDate} onChange={e => { setForm(p => ({ ...p, expiryDate: e.target.value })); if (errors.expiryDate) setErrors(p => ({ ...p, expiryDate: '' })); }} />
                {errors.expiryDate && <span className="acm-err">{errors.expiryDate}</span>}
              </div>

              <div className="acm-field">
                <label>Cơ quan cấp</label>
                <input value={form.issuingAuthority} onChange={e => setForm(p => ({ ...p, issuingAuthority: e.target.value }))} />
              </div>

              <div className="acm-field">
                <label>Quốc gia</label>
                <select value={form.countryId ?? ''} onChange={e => setForm(p => ({ ...p, countryId: e.target.value ? parseInt(e.target.value) : null }))}>
                  <option value="">Chọn quốc gia</option>
                  {countries.map(c => <option key={c.id} value={c.id}>{c.countryName}</option>)}
                </select>
              </div>

              <div className="acm-field acm-field--full">
                <label>Ghi chú</label>
                <textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
              </div>

              {/* File upload */}
              <div className="acm-field acm-field--full">
                <label>Ảnh / File chứng chỉ</label>
                <input type="file" ref={fileInputRef} accept=".jpg,.jpeg,.png,.gif,.pdf" onChange={handleFileSelect} style={{ display: 'none' }} />
                <div className="acm-file-area">
                  {certificatePreview ? (
                    <div className="acm-file-preview">
                      <img src={certificatePreview} alt="Preview" />
                      <button type="button" className="acm-file-remove" onClick={() => { setCertificateFile(null); setCertificatePreview(null); }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : certificateFile ? (
                    <div className="acm-file-info">
                      <span>📄 {certificateFile.name}</span>
                      <button type="button" className="acm-file-remove" onClick={() => { setCertificateFile(null); setCertificatePreview(null); }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : savedFileUrl ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      {/^.+\.(jpe?g|png|gif)$/i.test(savedFileUrl) ? (
                        <img src={savedFileUrl} alt="Ảnh đã lưu"
                          style={{ maxHeight: 150, maxWidth: '100%', borderRadius: 4, objectFit: 'contain', border: '1px solid #d6dee8' }} />
                      ) : (
                        <a href={savedFileUrl} target="_blank" rel="noreferrer" style={{ fontSize: '0.8125rem', color: '#0b2545' }}>
                          Xem tệp đã lưu
                        </a>
                      )}
                      <button type="button" className="acm-upload-btn" onClick={() => fileInputRef.current?.click()}>
                        <Upload size={16} /> Thay tệp khác
                      </button>
                    </div>
                  ) : (
                    <button type="button" className="acm-upload-btn" onClick={() => fileInputRef.current?.click()}>
                      <Upload size={16} /> Chọn tệp (JPG, PNG, PDF, max 10MB)
                    </button>
                  )}
                </div>
                {errors.file && <span className="acm-err">{errors.file}</span>}
              </div>
            </div>

            <div className="acm-footer">
              <button type="button" className="acm-btn-cancel" onClick={onClose}>Hủy</button>
              <button type="submit" className="acm-btn-save" disabled={loading}>
                <Save size={14} /> {loading ? 'Đang lưu...' : isEditMode ? 'Cập nhật' : 'Thêm mới'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
