import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './CrewDetailPage.css';
import {
  ArrowLeft, Upload, CheckCircle, XCircle, AlertTriangle,
  Ship, MapPin, Calendar, Eye, ClipboardList, FileCheck, History, ScrollText, Pencil, Trash2,
} from 'lucide-react';
import { useCrewDetail, useCrewCertificates, useVessels } from '../../hooks/useCrew';
import { useCrewOnboarding, useCrewDocumentSubmissions, useCrewStatusHistory, useCrewAuditLog } from '../../hooks/useCrewManagement';
import { crewApi, certificateApi, referenceApi } from '../../services/crew.service';
import { useToast } from '../../components/common/Toast';
import type { CrewDocument, ServiceRecord, Rank, Country, CrewCertificate } from '../../types/crew.types';
import type { UpdateCrewRequest } from '../../types/crew.types';
import { AddCrewCertificateModal } from './AddCrewCertificateModal';
import { AddDocumentModal } from './AddDocumentModal';
import { AddHealthDocumentModal } from './AddHealthDocumentModal';
import ImageViewerModal from '../../components/common/ImageViewerModal';
import ProtectedImage from '../../components/common/ProtectedImage';
import { openProtectedMediaInNewTab } from '../../services/protectedMedia';
import { CrewLogbookSection } from './CrewLogbookSection';
import { CrewProfileHeader } from './profile/CrewProfileHeader';
import { CrewBasicInfo } from './profile/CrewBasicInfo';
import { ALL_FIELD_KEYS } from './profile/crewProfileFields';
import { buildBioData } from './bio-data/bioData';
import { useAuth } from '../../contexts/AuthContext';
import { Button, DataTable, TableActions, TableIconButton, type Column } from '../../components/common';
import { toast } from 'sonner';
import { useConfirm } from '@/components/common/ConfirmDialog';

type TabType = 'basic-data' | 'documents' | 'voyage-history' | 'onboarding' | 'doc-workflow' | 'status-history' | 'audit' | 'logbook';

const fmt = (d?: string) => d ? new Date(d).toLocaleDateString('vi-VN') : '—';

/** Số ngày còn tới hạn (âm = đã quá hạn); không có ngày hết hạn thì undefined. */
const daysLeft = (d?: string) => d ? Math.floor((new Date(d).getTime() - Date.now()) / 86400000) : undefined;

const DOC_CATEGORY_LABEL: Record<string, string> = { travel: 'Đi lại', seafarer: 'Thuyền viên', employment: 'Lao động', health: 'Y tế' };

const calcAge = (dob?: string) => {
  if (!dob) return '';
  const diff = Date.now() - new Date(dob).getTime();
  return String(Math.floor(diff / (365.25 * 86400000)));
};

export const CrewDetailPage: React.FC = () => {
  const ask = useConfirm();
  const { id, vesselId } = useParams<{ id: string; vesselId?: string }>();
  const navigate = useNavigate();
  const { data: crew, loading, error, refetch } = useCrewDetail(id);
  const { data: certificates, setData: setCertificates, loading: certsLoading, refetch: refetchCerts } = useCrewCertificates(id);
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<TabType>('basic-data');
  const [edited, setEdited] = useState<UpdateCrewRequest>({});
  const [saving, setSaving] = useState(false);
  /** Chế độ xem là mặc định; bấm "Sửa hồ sơ" mới thành form. */
  const [editing, setEditing] = useState(false);
  /** Mở khóa ngày lên/xuống tàu và trạng thái trên tàu (bình thường do quy trình cập nhật). */
  const [manualOverride, setManualOverride] = useState(false);
  const editingRef = React.useRef(false);
  editingRef.current = editing;
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const { vessels } = useVessels();
  const { user } = useAuth();
  const [exporting, setExporting] = useState(false);

  // Edge changes tracking
  const edgeChanges: { field: string; oldValue: string; newValue: string; changedAt: string }[] = React.useMemo(() => {
    if (!crew?.edgeChanges) return [];
    try { return JSON.parse(crew.edgeChanges); } catch { return []; }
  }, [crew?.edgeChanges]);

  const changedFields = React.useMemo(() => new Set(edgeChanges.map(c => c.field)), [edgeChanges]);
  const changeMap = React.useMemo(() => {
    const m: Record<string, { oldValue: string; newValue: string }> = {};
    for (const c of edgeChanges) m[c.field] = { oldValue: c.oldValue, newValue: c.newValue };
    return m;
  }, [edgeChanges]);
  const hasUnviewedChanges = edgeChanges.length > 0;

  // Map fields to sections for tab badge counts
  const SECTION_FIELDS: Record<string, string[]> = {
    'basic-data': [
      'fullName', 'phoneNumber', 'emailAddress', 'department', 'address',
      'placeOfBirth', 'idCardNumber', 'maritalStatus', 'notes', 'dateOfBirth',
      'rankId', 'countryId', 'height', 'weight', 'bloodGroup', 'clothingSize',
      'shoeSize', 'cateringSize', 'isSmoker', 'isCovidVaccinated',
      'joinDate', 'embarkDate', 'disembarkDate', 'contractEnd', 'isOnboard',
      'nextOfKinName', 'nextOfKinRelation', 'nextOfKinPhone', 'nextOfKinAddress',
      'educationInstitution', 'educationCourse', 'educationPeriodYears', 'educationGraduationYear',
    ],
  };

  const getTabChangeCount = (tabKey: string) => {
    if (!hasUnviewedChanges) return 0;
    const fields = SECTION_FIELDS[tabKey];
    if (!fields) return 0;
    return edgeChanges.filter(c => fields.includes(c.field)).length;
  };

  const handleMarkViewed = async () => {
    if (!id) return;
    try {
      await crewApi.markChangesViewed(id);
      await refetch();
    } catch { /* ignore */ }
  };

  // Helper: inline style for changed fields (to ensure visibility)
  const fieldHighlight = (fieldName: string) =>
    changedFields.has(fieldName) ? ' cd-field--changed' : '';

  const fieldStyle = (fieldName: string): React.CSSProperties =>
    changedFields.has(fieldName)
      ? { borderColor: '#ef4444', background: '#fef2f2', boxShadow: '0 0 0 2px rgba(239,68,68,0.2)' }
      : {};

  // Helper: render change indicator next to a field
  const changeIndicator = (fieldName: string) => {
    const c = changeMap[fieldName];
    if (!c) return null;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
        <span style={{ fontSize: '0.8125rem', color: '#dc2626' }}>
          Modified from ship: <s style={{ color: '#9ca3af' }}>{c.oldValue || '(empty)'}</s> → <strong style={{ color: '#b91c1c' }}>{c.newValue}</strong>
        </span>
      </div>
    );
  };

  // Certificate management
  const [showAddCertModal, setShowAddCertModal] = useState(false);
  const [editingCert, setEditingCert] = useState<CrewCertificate | null>(null);
  const [uploadingCertId, setUploadingCertId] = useState<number | null>(null);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [imageViewerUrl, setImageViewerUrl] = useState<string | null>(null);
  const [imageViewerCertId, setImageViewerCertId] = useState<number | null>(null);
  const [imageViewerDocTarget, setImageViewerDocTarget] = useState<{ docId: string; category: string } | null>(null);

  // Avatar upload
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingAvatarPreview, setPendingAvatarPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Documents
  const [travelDocs, setTravelDocs] = useState<CrewDocument[]>([]);
  const [seafarerDocs, setSeafarerDocs] = useState<CrewDocument[]>([]);
  const [employmentDocs, setEmploymentDocs] = useState<CrewDocument[]>([]);
  const [healthDocs, setHealthDocs] = useState<CrewDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [isAddDocModalOpen, setIsAddDocModalOpen] = useState(false);
  const [isAddHealthDocModalOpen, setIsAddHealthDocModalOpen] = useState(false);
  const [docFileUploadTarget, setDocFileUploadTarget] = useState<{ docId: string; category: string } | null>(null);
  const [editingDoc, setEditingDoc] = useState<CrewDocument | null>(null);

  /** Mở modal sửa đúng loại: tài liệu y tế và giấy tờ định danh dùng hai modal khác nhau. */
  const openEditDoc = (doc: CrewDocument) => {
    setEditingDoc(doc);
    if (doc.category === 'health') setIsAddHealthDocModalOpen(true);
    else setIsAddDocModalOpen(true);
  };

  const handleDeleteDocument = async (doc: CrewDocument) => {
    if (!await ask('Bạn có chắc muốn xóa tài liệu này?')) return;
    try {
      await crewApi.deleteDocument(id!, doc.id, doc.category);
      await loadDocuments(true);
      toast.success('Xóa tài liệu thành công');
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) || 'Không thể xóa tài liệu');
    }
  };
  const [uploadingDocFile, setUploadingDocFile] = useState(false);
  const docFileInputRef = React.useRef<HTMLInputElement>(null);

  // Service records
  const [serviceRecords, setServiceRecords] = useState<ServiceRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);

  // Crew management workflow hooks (lazy - only fetch when tab is active)
  const { data: onboardingCase, loading: onbLoading } = useCrewOnboarding(
    activeTab === 'onboarding' ? id : undefined
  );
  const { data: docSubmissions, loading: docSubLoading } = useCrewDocumentSubmissions(
    activeTab === 'doc-workflow' ? id : undefined
  );
  const { data: statusHistory, loading: statusHistLoading } = useCrewStatusHistory(
    activeTab === 'status-history' ? id : undefined
  );
  const { data: auditLogs, loading: auditLoading } = useCrewAuditLog(
    activeTab === 'audit' ? id : undefined
  );

  useEffect(() => {
    if (crew && !editingRef.current) setEdited(crew);
  }, [crew]);

  /** Có thay đổi chưa lưu không: so từng trường của form, coi trống/null/undefined là như nhau. */
  const isDirty = React.useMemo(() => {
    if (!crew || !editing) return false;
    const norm = (v: unknown) => (v === undefined || v === null || v === '' ? '' : typeof v === 'string' ? v.split('T')[0] : String(v));
    const original = crew as unknown as Record<string, unknown>;
    const current = edited as Record<string, unknown>;
    return ALL_FIELD_KEYS.some(k => norm(original[k]) !== norm(current[k]));
  }, [crew, edited, editing]);

  // Đóng/tải lại trình duyệt khi còn thay đổi chưa lưu thì hỏi lại.
  useEffect(() => {
    if (!isDirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  /** Xuất "Hồ sơ thuyền viên" ra file PDF hoặc Excel (tải thẳng về). Thư viện xuất chỉ tải khi bấm. */
  const handleExport = async (format: 'pdf' | 'excel') => {
    if (!crew) return;
    setExporting(true);
    try {
      const data = await buildBioData({
        crew,
        rankName: ranks.find(r => r.id === crew.rankId)?.rankName,
        vesselName: vessels.find(v => v.id === crew.vesselId)?.name,
        certificates,
        preparedBy: user?.username ?? '',
      });
      if (format === 'pdf') {
        const { downloadBioDataPdf } = await import('./bio-data/bioDataPdf');
        await downloadBioDataPdf(data);
        toast.success('Đã xuất hồ sơ ra PDF', `${data.fileName}.pdf`);
      } else {
        const { exportBioDataExcel } = await import('./bio-data/bioDataExcel');
        await exportBioDataExcel(data);
        toast.success('Đã xuất hồ sơ ra Excel', `${data.fileName}.xlsx`);
      }
    } catch (e) {
      toast.error('Không xuất được hồ sơ', e instanceof Error ? e.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  const startEdit = () => { setActiveTab('basic-data'); setEditing(true); };

  const cancelEdit = async () => {
    if (isDirty && !(await ask('Bỏ các thay đổi chưa lưu?', { title: 'Hủy chỉnh sửa', confirmLabel: 'Bỏ thay đổi', variant: 'warning' }))) return;
    if (crew) setEdited(crew);
    setEditing(false);
    setManualOverride(false);
  };

  useEffect(() => {
    referenceApi.getRanks().then(setRanks).catch(() => {});
    referenceApi.getCountries().then(setCountries).catch(() => {});
  }, []);

  const loadDocuments = useCallback(async (force = false) => {
    if (!id || (!force && travelDocs.length > 0)) return;
    setDocsLoading(true);
    try {
      const [t, s, e, h] = await Promise.all([
        crewApi.getDocuments(id, 'travel'),
        crewApi.getDocuments(id, 'seafarer'),
        crewApi.getDocuments(id, 'employment'),
        crewApi.getDocuments(id, 'health'),
      ]);
      setTravelDocs(t); setSeafarerDocs(s); setEmploymentDocs(e); setHealthDocs(h);
    } catch { /* ignore */ } finally { setDocsLoading(false); }
  }, [id, travelDocs.length]);

  const loadServiceRecords = useCallback(async () => {
    if (!id || serviceRecords.length > 0) return;
    setRecordsLoading(true);
    try {
      setServiceRecords(await crewApi.getServiceRecords(id));
    } catch { /* ignore */ } finally { setRecordsLoading(false); }
  }, [id, serviceRecords.length]);

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    if (tab === 'documents') loadDocuments();
    if (tab === 'voyage-history') loadServiceRecords();
  };

  const set = (key: keyof UpdateCrewRequest, value: UpdateCrewRequest[keyof UpdateCrewRequest]) =>
    setEdited(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      await crewApi.update(id, edited);
      editingRef.current = false;
      setEditing(false);
      setManualOverride(false);
      await refetch();
      toast.success('Đã lưu hồ sơ', edited.fullName ?? crew?.fullName);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Không thể lưu dữ liệu');
    } finally { setSaving(false); }
  };

  // Avatar handlers
  const handleAvatarChoose = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/jpg,image/png,image/gif';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) { toast.error('Hình ảnh không được vượt quá 5MB'); return; }
      setPendingAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setPendingAvatarPreview(reader.result as string);
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleAvatarSave = async () => {
    if (!id || !pendingAvatarFile) return;
    try {
      setUploadingAvatar(true);
      const formData = new FormData();
      formData.append('file', pendingAvatarFile);
      const res = await crewApi.uploadAvatar(id, formData);
      if (res.crewMember) await refetch();
      setPendingAvatarFile(null);
      setPendingAvatarPreview(null);
      toast.success('Cập nhật ảnh thành công!');
    } catch (err: any) {
      toast.error(err.message || 'Tải lên thất bại');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarCancel = () => {
    setPendingAvatarFile(null);
    setPendingAvatarPreview(null);
  };

  // Certificate handlers
  const handleCertificateFileUpload = (certId: number) => {    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.jpg,.jpeg,.png,.gif,.pdf';
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        setUploadingCertId(certId);
        const formData = new FormData();
        formData.append('file', file);
        const result = await certificateApi.uploadCertificateFile(certId, formData);
        // Instant update: patch the local cert state so the image renders immediately
        setCertificates(prev => prev.map(c =>
          c.id === certId ? { ...c, documentFilePath: result.documentFilePath } : c
        ));
        toast.success('Tải file thành công!');
      } catch (err: any) {
        toast.error(err.message || 'Tải lên thất bại');
      } finally {
        setUploadingCertId(null);
      }
    };
    input.click();
  };

  const handleViewCertificateImage = (fileUrl: string, certId: number) => {
    setImageViewerUrl(fileUrl);
    setImageViewerCertId(certId);
    setIsImageViewerOpen(true);
  };

  const handleCertificateUploadHandler = async (documentId: string, formData: FormData) => {
    const certId = parseInt(documentId);
    const result = await certificateApi.uploadCertificateFile(certId, formData);
    // Instant update local state
    setCertificates(prev => prev.map(c =>
      c.id === certId ? { ...c, documentFilePath: result.documentFilePath } : c
    ));
    // Update the image viewer URL immediately
    setImageViewerUrl(result.documentFilePath);
    return result;
  };

  const handleDeleteCertificate = async (certId: number) => {
    if (!await ask('Bạn có chắc muốn xóa chứng chỉ này?')) return;
    try {
      await certificateApi.deleteCrewCertificate(certId);
      await refetchCerts();
      toast.success('Xóa chứng chỉ thành công');
    } catch (err: any) {
      toast.error(err.message || 'Không thể xóa chứng chỉ');
    }
  };

  const getCertStatus = (expiryDate?: string) => {
    if (!expiryDate) return { label: 'Không rõ', color: 'text-gray-500', bg: 'bg-gray-100', Icon: AlertTriangle };
    const days = Math.floor((new Date(expiryDate).getTime() - Date.now()) / 86400000);
    if (days < 0) return { label: 'Hết hạn', color: 'text-red-600', bg: 'bg-red-100', Icon: XCircle, days };
    if (days < 90) return { label: 'Sắp hết hạn', color: 'text-yellow-600', bg: 'bg-yellow-100', Icon: AlertTriangle, days };
    return { label: 'Còn hiệu lực', color: 'text-green-600', bg: 'bg-green-100', Icon: CheckCircle, days };
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent" />
    </div>
  );

  if (error || !crew) return (
    <div className="p-8">
      <div className="bg-red-50 text-red-700 px-4 py-3 rounded">
        <p className="font-semibold">Error loading crew details</p>
        <p className="text-sm">{error || 'Crew member not found'}</p>
      </div>
    </div>
  );

  const age = calcAge(edited.dateOfBirth ?? crew.dateOfBirth);

  const fieldCls = 'cd-field';
  const labelCls = 'cd-label';

  const handleDocFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!docFileUploadTarget || !id) return;
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadingDocFile(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await crewApi.uploadDocumentFile(id, docFileUploadTarget.category, docFileUploadTarget.docId, fd);
      toast.success('Document file uploaded successfully!');
      await loadDocuments(true);
    } catch (err: unknown) {
      toast.error((err instanceof Error ? err.message : null) || 'Failed to upload file');
    } finally {
      setUploadingDocFile(false);
      setDocFileUploadTarget(null);
    }
  };

  const triggerDocFileUpload = (docId: string, category: string) => {
    setDocFileUploadTarget({ docId, category });
    docFileInputRef.current?.click();
  };

  /** Ô "Tệp": xem tệp đã đính kèm hoặc tải tệp lên. */
  const docFileCell = (doc: CrewDocument) => (
    <TableActions>
      {doc.fileUrl ? (
        <TableIconButton label="Xem tệp" icon={<Eye />} onClick={() => {
          setImageViewerUrl(doc.fileUrl!);
          setImageViewerCertId(null);
          setImageViewerDocTarget({ docId: doc.id, category: doc.category });
          setIsImageViewerOpen(true);
        }} />
      ) : (
        <TableIconButton label="Tải tệp lên" icon={<Upload />} disabled={uploadingDocFile}
          onClick={() => triggerDocFileUpload(doc.id, doc.category)} />
      )}
    </TableActions>
  );

  /**
   * Cột bảng tài liệu — dùng chung cho giấy tờ định danh và tài liệu y tế.
   * `identity`: có cột Nhóm và Quốc gia (tài liệu y tế không gắn quốc gia, cột đó luôn rỗng).
   */
  const docColumns = (identity: boolean): Column<CrewDocument>[] => [
    ...(identity ? [{
      key: 'category', header: 'Nhóm', width: 110, align: 'center' as const,
      value: (d: CrewDocument) => DOC_CATEGORY_LABEL[d.category] ?? d.category,
    }] : []),
    { key: 'type', header: 'Loại giấy tờ', width: 200, value: d => d.documentType, className: 'font-semibold text-ink' },
    { key: 'number', header: 'Số', width: 150, value: d => d.documentNumber ?? '', render: d => d.documentNumber || '—', className: 'font-mono' },
    {
      key: 'issue', header: 'Ngày cấp', width: 110, align: 'center', value: d => d.issueDate ?? '',
      filter: d => fmt(d.issueDate), exportValue: d => fmt(d.issueDate), render: d => fmt(d.issueDate),
    },
    {
      key: 'expiry', header: 'Ngày hết hạn', width: 110, align: 'center', value: d => d.expiryDate ?? '',
      filter: d => fmt(d.expiryDate), exportValue: d => fmt(d.expiryDate), render: d => fmt(d.expiryDate),
    },
    {
      key: 'days', header: 'Còn (ngày)', width: 90, numeric: true, filter: false,
      value: d => daysLeft(d.expiryDate),
      render: d => {
        const n = daysLeft(d.expiryDate);
        return n === undefined ? '—' : <span className={n < 0 ? 'font-semibold text-red-600' : n < 90 ? 'font-semibold text-amber-600' : ''}>{n}</span>;
      },
    },
    ...(identity ? [{ key: 'country', header: 'Quốc gia', width: 130, value: (d: CrewDocument) => d.countryName ?? '' }] : []),
    { key: 'file', header: 'Tệp', width: 60, align: 'center', render: docFileCell },
    {
      key: 'actions', header: 'Thao tác', width: 90, align: 'center',
      render: d => (
        <TableActions>
          <TableIconButton label={`Sửa ${d.documentType}`} icon={<Pencil />} onClick={() => openEditDoc(d)} />
          <TableIconButton label={`Xóa ${d.documentType}`} icon={<Trash2 />} variant="danger" onClick={() => handleDeleteDocument(d)} />
        </TableActions>
      ),
    },
  ];

  const certColumns: Column<CrewCertificate>[] = [
    {
      key: 'name', header: 'Tên chứng chỉ', width: 220, value: c => c.certificateName || c.certificateCode || '',
      render: c => (
        <span className="block truncate">
          <span className="font-semibold text-ink">{c.certificateName || c.certificateCode}</span>
          {c.category && <span className="ml-1.5 text-xs text-ink-muted">· {c.category}</span>}
        </span>
      ),
    },
    { key: 'number', header: 'Số CC', width: 130, value: c => c.certificateNumber ?? '', render: c => c.certificateNumber || '—', className: 'font-mono' },
    {
      key: 'issue', header: 'Ngày cấp', width: 105, align: 'center', value: c => c.issueDate ?? '',
      filter: c => fmt(c.issueDate), exportValue: c => fmt(c.issueDate), render: c => fmt(c.issueDate),
    },
    {
      key: 'expiry', header: 'Ngày hết hạn', width: 105, align: 'center', value: c => c.expiryDate ?? '',
      filter: c => fmt(c.expiryDate), exportValue: c => fmt(c.expiryDate), render: c => fmt(c.expiryDate),
    },
    {
      key: 'days', header: 'Còn (ngày)', width: 85, numeric: true, filter: false,
      value: c => daysLeft(c.expiryDate),
      render: c => {
        const n = daysLeft(c.expiryDate);
        return n === undefined ? '—' : <span className={n < 0 ? 'font-semibold text-red-600' : n < 90 ? 'font-semibold text-amber-600' : ''}>{n}</span>;
      },
    },
    { key: 'authority', header: 'Cơ quan cấp', width: 150, value: c => c.issuingAuthority ?? '', render: c => c.issuingAuthority || '—' },
    {
      key: 'status', header: 'Trạng thái', width: 120, align: 'center', value: c => getCertStatus(c.expiryDate).label,
      render: c => {
        const st = getCertStatus(c.expiryDate);
        return (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${st.bg} ${st.color}`}>
            <st.Icon className="h-3 w-3" />{st.label}
          </span>
        );
      },
    },
    {
      key: 'file', header: 'Tệp', width: 60, align: 'center',
      render: c => {
        const fileUrl = c.documentFilePath || c.fileUrl;
        return (
          <TableActions>
            <TableIconButton
              label={fileUrl ? 'Xem tệp' : 'Tải tệp lên'}
              icon={fileUrl ? <Eye /> : <Upload />}
              disabled={uploadingCertId === c.id}
              onClick={() => fileUrl ? handleViewCertificateImage(fileUrl, c.id) : handleCertificateFileUpload(c.id)}
            />
          </TableActions>
        );
      },
    },
    {
      key: 'actions', header: 'Thao tác', width: 90, align: 'center',
      render: c => (
        <TableActions>
          <TableIconButton label="Sửa chứng chỉ" icon={<Pencil />} onClick={() => { setEditingCert(c); setShowAddCertModal(true); }} />
          <TableIconButton label="Xóa chứng chỉ" icon={<Trash2 />} variant="danger" onClick={() => handleDeleteCertificate(c.id)} />
        </TableActions>
      ),
    },
  ];

  const identityDocs = [...travelDocs, ...seafarerDocs, ...employmentDocs];
  const crewLabel = `${crew.crewId}-${crew.fullName}`;

  return (
    <div className="min-h-screen bg-gray-100">
      <CrewProfileHeader
        crew={crew}
        rankName={ranks.find(r => r.id === crew.rankId)?.rankName}
        vesselName={vessels.find(v => v.id === crew.vesselId)?.name}
        onBack={async () => {
          if (isDirty && !(await ask('Rời trang và bỏ các thay đổi chưa lưu?', { title: 'Chưa lưu', confirmLabel: 'Rời trang', variant: 'warning' }))) return;
          navigate(vesselId ? `/vessels/${vesselId}` : '/crew');
        }}
        editing={editing}
        onEdit={startEdit}
        avatarPreview={pendingAvatarPreview}
        avatarPending={!!pendingAvatarFile}
        avatarUploading={uploadingAvatar}
        onAvatarChoose={handleAvatarChoose}
        onAvatarSave={handleAvatarSave}
        onAvatarCancel={handleAvatarCancel}
        onExport={handleExport}
        exporting={exporting}
      />
      {/* Hold Notification Banner */}
      {crew.onboardStatus === 'OnHold' && (
        <div style={{
          background: '#fff7ed', border: '1px solid #fb923c', borderRadius: 0,
          padding: '12px 24px', display: 'flex', alignItems: 'flex-start', gap: 12
        }}>
          <AlertTriangle className="h-5 w-5 flex-shrink-0" style={{ color: '#ea580c', marginTop: 2 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '0.875rem', color: '#c2410c', marginBottom: 4 }}>
            Tàu yêu cầu bổ sung tài liệu cho thuyền viên này
            </div>
            {crew.reviewNotes && (
              <div style={{ fontSize: '0.8125rem', color: '#9a3412', background: '#ffedd5', borderRadius: 6, padding: '8px 12px', marginTop: 4 }}>
                <strong>Ghi chú từ tàu:</strong> {crew.reviewNotes}
              </div>
            )}
            {crew.onboardStatusChangedBy && (
              <div style={{ fontSize: '0.8125rem', color: '#94a3b8', marginTop: 6 }}>
                Bởi: {crew.onboardStatusChangedBy}
                {crew.onboardStatusChangedAt && ` • ${new Date(crew.onboardStatusChangedAt).toLocaleString('vi-VN')}`}
              </div>
            )}
          </div>
        </div>
      )}
      {/* Edge Changes Banner */}
      {hasUnviewedChanges && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 24px', background: '#fef2f2', borderBottom: '2px solid #fca5a5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.8125rem', color: '#991b1b' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 22, height: 22, padding: '0 6px', background: '#ef4444', color: '#fff', fontSize: '0.8125rem', fontWeight: 700, borderRadius: 11 }}>{edgeChanges.length}</span>
            <span>Tàu đã chỉnh sửa <strong>{edgeChanges.length}</strong> trường. Các trường thay đổi được tô <span style={{ color: '#ef4444', fontWeight: 700 }}>màu đỏ</span> trong tab Thông tin cơ bản.</span>
          </div>
          <button onClick={handleMarkViewed} style={{ padding: '5px 14px', fontSize: '0.8125rem', fontWeight: 600, color: '#fff', background: '#0b2545', border: 'none', borderRadius: 4, cursor: 'pointer' }}>✓ Đã xem</button>
        </div>
      )}
      {/* Tabs */}
      <div className="bg-white" style={{ borderBottom: '1px solid #d6dee8' }}>
        <div className="px-6 flex gap-1">
          {([
            { key: 'basic-data', label: 'Thông tin cơ bản' },
            { key: 'documents', label: 'Tài liệu' },
            { key: 'logbook', label: 'Sổ nhật ký', icon: <ClipboardList className="w-4 h-4" /> },
            /*{ key: 'voyage-history', label: 'Lịch sử đi tàu', icon: <Ship className="w-4 h-4" /> },
            { key: 'onboarding', label: 'Tiếp nhận', icon: <ClipboardList className="w-4 h-4" /> },
            { key: 'doc-workflow', label: 'Hồ sơ', icon: <FileCheck className="w-4 h-4" /> },
            { key: 'status-history', label: 'Trạng thái', icon: <History className="w-4 h-4" /> },
            { key: 'audit', label: 'Kiểm toán', icon: <ScrollText className="w-4 h-4" /> },*/
          ] as { key: TabType; label: string; icon?: React.ReactNode }[]).map(tab => (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-1.5 px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key ? '' : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
              style={activeTab === tab.key ? { borderBottomColor: '#0b2545', color: '#0b2545', background: '#dce9f8' } : {}}
            >
              {tab.icon}{tab.label}
              {(() => {
                const changeCount = getTabChangeCount(tab.key);
                return changeCount > 0 ? <span className="cd-tab-change-badge">{changeCount}</span> : null;
              })()}
              {tab.key === 'documents' && (travelDocs.length + seafarerDocs.length + healthDocs.length) > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-gray-200 text-gray-600">
                  {travelDocs.length + seafarerDocs.length + employmentDocs.length + healthDocs.length}
                </span>
              )}
              {tab.key === 'voyage-history' && serviceRecords.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-gray-200 text-gray-600">
                  {serviceRecords.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="space-y-4 px-6 py-5">

        {/* ════════ BASIC DATA ════════ */}
        {activeTab === 'basic-data' && (
          <CrewBasicInfo
            edited={edited}
            set={(key, value) => setEdited(prev => ({ ...prev, [key]: value }))}
            editing={editing}
            ranks={ranks}
            countries={countries}
            changeMap={changeMap}
            manualOverride={manualOverride}
            onManualOverrideChange={setManualOverride}
          />
        )}

        {/* ════════ DOCUMENTS ════════ */}
        {activeTab === 'documents' && (
          <>
            <section className="cd-section">
              <div className="cd-section-header">
                <h3 className="cd-section-title">Giấy tờ định danh ({identityDocs.length})</h3>
              </div>
              <DataTable
                flush
                columns={docColumns(true)}
                data={identityDocs}
                rowKey={d => d.id}
                loading={docsLoading}
                itemLabel="giấy tờ"
                emptyMessage="Chưa có giấy tờ định danh."
                searchPlaceholder="Tìm theo loại, số, quốc gia..."
                onAdd={() => setIsAddDocModalOpen(true)}
                addLabel="Thêm giấy tờ"
                exportOptions={{ fileName: `giay-to-${crewLabel}`, title: `GIẤY TỜ ĐỊNH DANH — ${crew.fullName.toUpperCase()}` }}
                pageSize={10}
              />
            </section>

            <section className="cd-section">
              <div className="cd-section-header">
                <h3 className="cd-section-title">Tài liệu y tế ({healthDocs.length})</h3>
              </div>
              <DataTable
                flush
                columns={docColumns(false)}
                data={healthDocs}
                rowKey={d => d.id}
                loading={docsLoading}
                itemLabel="tài liệu"
                emptyMessage="Chưa có tài liệu y tế."
                searchPlaceholder="Tìm theo loại, số..."
                onAdd={() => setIsAddHealthDocModalOpen(true)}
                addLabel="Thêm tài liệu y tế"
                exportOptions={{ fileName: `y-te-${crewLabel}`, title: `TÀI LIỆU Y TẾ — ${crew.fullName.toUpperCase()}` }}
                pageSize={10}
              />
            </section>

            <section className="cd-section">
              <div className="cd-section-header">
                <h3 className="cd-section-title">Chứng chỉ ({certificates?.length ?? 0})</h3>
              </div>
              <DataTable
                flush
                columns={certColumns}
                data={certificates ?? []}
                rowKey={c => c.id}
                loading={certsLoading}
                itemLabel="chứng chỉ"
                emptyMessage="Chưa có chứng chỉ nào."
                searchPlaceholder="Tìm theo tên, số, cơ quan cấp..."
                onAdd={() => { setEditingCert(null); setShowAddCertModal(true); }}
                addLabel="Thêm chứng chỉ"
                exportOptions={{ fileName: `chung-chi-${crewLabel}`, title: `CHỨNG CHỈ — ${crew.fullName.toUpperCase()}` }}
                pageSize={10}
              />
            </section>
          </>
        )}

        {/* ════════ VOYAGE HISTORY ════════ */}
        {activeTab === 'voyage-history' && (
          <div className="cd-section">
            <div className="cd-section-header">
              <div className="flex items-center gap-2">
                <Ship className="w-4 h-4" style={{ color: '#0b2545' }} />
                <h3 className="cd-section-title">Service Records</h3>
              </div>
              <span style={{ fontSize: '0.8125rem', color: '#64748b' }}>{serviceRecords.length} record(s)</span>
            </div>

            {recordsLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
              </div>
            ) : serviceRecords.length === 0 ? (
              <div className="text-center py-16">
                <Ship className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">No service records found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="cd-table-thead">
                    <tr>
                      <th>Vessel</th>
                      <th>IMO</th>
                      <th>Rank</th>
                      <th>Sign-On</th>
                      <th>Sign-Off</th>
                      <th>Trade Area</th>
                      <th>Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {serviceRecords.map(rec => {
                      const days = rec.signOnDate && rec.signOffDate
                        ? Math.floor((new Date(rec.signOffDate).getTime() - new Date(rec.signOnDate).getTime()) / 86400000)
                        : rec.signOnDate
                          ? Math.floor((Date.now() - new Date(rec.signOnDate).getTime()) / 86400000)
                          : null;
                      return (
                        <tr key={rec.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <Ship className="w-4 h-4 text-gray-400 flex-shrink-0" />
                              <div>
                                <div className="font-medium text-gray-800">{rec.vesselName}</div>
                                {days !== null && <div className="text-xs text-gray-400">{days} days</div>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-500 font-mono text-xs">{rec.vesselIMO || '�'}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-[#dce9f8] text-[#0b2545]">
                              {rec.rankDuringService || '�'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1 text-gray-700">
                              <Calendar className="w-3.5 h-3.5 text-[#64748b]" />
                              {fmt(rec.signOnDate)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {rec.signOffDate ? (
                              <div className="flex items-center gap-1 text-gray-700">
                                <Calendar className="w-3.5 h-3.5 text-red-400" />
                                {fmt(rec.signOffDate)}
                              </div>
                            ) : (
                              <span className="inline-flex px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                                <MapPin className="w-3 h-3 mr-1" />On Board
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{rec.tradingArea || '�'}</td>
                          <td className="px-4 py-3 text-gray-500 text-xs">{rec.remarks || '�'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* -- Onboarding Tab -- */}
        {activeTab === 'onboarding' && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Onboarding</h2>
            {onbLoading ? (
              <div className="text-center py-8 text-gray-400">Loading onboarding data...</div>
            ) : !onboardingCase ? (
              <div className="text-center py-8 text-gray-400">
                <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>No onboarding case found for this crew member</p>
                <button
                  onClick={() => navigate(`/onboarding/new?crewId=${id}`)}
                  className="mt-3 px-4 py-2 text-sm bg-[#0b2545] text-white rounded hover:bg-[#16375f]"
                >
                  Create Onboarding Case
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <span className={`inline-block px-2 py-1 rounded text-xs font-semibold ${
                    onboardingCase.status === 'Activated' ? 'bg-green-100 text-green-700' :
                    onboardingCase.status === 'InProgress' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>{onboardingCase.status}</span>
                  {onboardingCase.referenceVesselName && (
                    <span className="text-sm text-gray-500"><Ship className="w-3.5 h-3.5 inline mr-1" />{onboardingCase.referenceVesselName}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden" style={{ maxWidth: 300 }}>
                    <div
                      className="h-full bg-green-500 rounded-full"
                      style={{ width: `${onboardingCase.totalItems > 0 ? Math.round(onboardingCase.completedItems / onboardingCase.totalItems * 100) : 0}%` }}
                    />
                  </div>
                  <span className="text-sm text-gray-600">
                    {onboardingCase.completedItems}/{onboardingCase.totalItems} items
                  </span>
                </div>
                <div className="space-y-2">
                  {onboardingCase.checklistItems.sort((a, b) => a.sortOrder - b.sortOrder).map(item => (
                    <div key={item.id} className={`flex items-center gap-3 px-3 py-2 rounded border ${
                      item.status === 'Completed' ? 'border-green-200 bg-green-50' :
                      item.status === 'Waived' ? 'border-purple-200 bg-purple-50 opacity-75' :
                      'border-gray-200'
                    }`}>
                      {item.status === 'Completed' ? <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" /> :
                       item.status === 'Waived' ? <XCircle className="w-4 h-4 text-purple-400 flex-shrink-0" /> :
                       <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex-shrink-0" />}
                      <span className="flex-1 text-sm text-gray-700">{item.title}</span>
                      {item.isMandatory && <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">Required</span>}
                      <span className="text-xs text-gray-400">{item.status}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => navigate(`/onboarding/${onboardingCase.id}`)}
                  className="mt-4 px-4 py-2 text-sm border border-accent/40 text-[#0b2545] rounded hover:bg-[#eef2f7]"
                >
                  View Full Details
                </button>
              </div>
            )}
          </div>
        )}

        {/* -- Document Workflow Tab -- */}
        {activeTab === 'doc-workflow' && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Document Submissions</h2>
            {docSubLoading ? (
              <div className="text-center py-8 text-gray-400">Loading document submissions...</div>
            ) : docSubmissions.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <FileCheck className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>No document submissions yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead className="cd-table-thead">
                    <tr>
                      <th>Document</th>
                      <th>Number</th>
                      <th>Status</th>
                      <th>Submitted</th>
                      <th>Expiry</th>
                      <th>Verification</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {docSubmissions.map(doc => (
                      <tr key={doc.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-800">
                          {doc.documentTitle || doc.documentType}
                        </td>
                        <td className="px-4 py-2 text-gray-600">{doc.documentNumber || '�'}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                            doc.status === 'Verified' ? 'bg-green-100 text-green-700' :
                            doc.status === 'Rejected' ? 'bg-red-100 text-red-700' :
                            doc.status === 'Submitted' || doc.status === 'SentForVerification' ? 'bg-[#dce9f8] text-[#0b2545]' :
                            'bg-gray-100 text-gray-600'
                          }`}>{doc.status}</span>
                        </td>
                        <td className="px-4 py-2 text-gray-600">{fmt(doc.submittedAt)}</td>
                        <td className="px-4 py-2 text-gray-600">{fmt(doc.expiryDate)}</td>
                        <td className="px-4 py-2 text-gray-500 text-xs">{doc.verificationStatus || '�'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* -- Status History Tab -- */}
        {activeTab === 'status-history' && (
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Status History</h2>
            {statusHistLoading ? (
              <div className="text-center py-8 text-gray-400">Loading status history...</div>
            ) : statusHistory.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                <History className="w-10 h-10 mx-auto mb-2 opacity-50" />
                <p>No status changes recorded</p>
              </div>
            ) : (
              <div className="space-y-3">
                {statusHistory.map(entry => (
                  <div key={entry.id} className="flex items-start gap-3 px-4 py-3 border border-gray-200 rounded-lg">
                    <div className="mt-0.5">
                      <History className="w-4 h-4 text-gray-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-600">{entry.fromStatus}</span>
                        <span className="text-gray-400">?</span>
                        <span className="px-2 py-0.5 rounded text-xs font-semibold bg-[#dce9f8] text-[#0b2545]">{entry.toStatus}</span>
                      </div>
                      {entry.reason && <p className="text-sm text-gray-600 mt-1">{entry.reason}</p>}
                      <p className="text-xs text-gray-400 mt-1">by {entry.changedBy} � {fmt(entry.changedAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* -- Audit Tab -- */}
        {activeTab === 'audit' && (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ScrollText className="w-16 h-16 text-gray-300 mb-4" />
              <h2 className="text-xl font-semibold text-gray-700 mb-2">Audit Trail</h2>
              <p className="text-gray-400 mb-1">This feature is under development.</p>
              <p className="text-gray-400 text-sm">Audit logging will track all changes to crew records, documents, and certificates.</p>
              <span className="mt-4 px-4 py-1.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">Coming Soon</span>
            </div>
          </div>
        )}

        {/* -- Logbook Tab -- */}
        {activeTab === 'logbook' && id && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <CrewLogbookSection crewMemberId={id} onSaved={refetch} />
          </div>
        )}
      </div>

      {/* Certificate Modals */}
      {id && (
        <AddCrewCertificateModal
          isOpen={showAddCertModal}
          onClose={() => { setShowAddCertModal(false); setEditingCert(null); }}
          onSave={() => { refetchCerts(); }}
          crewMemberId={id}
          rankId={crew.rankId}
          editingCertificate={editingCert}
        />
      )}

      {/* Document Modals */}
      {id && (
        <>
          <AddDocumentModal
            isOpen={isAddDocModalOpen}
            crewMemberId={id}
            onClose={() => { setIsAddDocModalOpen(false); setEditingDoc(null); }}
            onSuccess={() => loadDocuments(true)}
            editingDocument={editingDoc}
          />
          <AddHealthDocumentModal
            isOpen={isAddHealthDocModalOpen}
            crewMemberId={id}
            onClose={() => { setIsAddHealthDocModalOpen(false); setEditingDoc(null); }}
            onSuccess={() => loadDocuments(true)}
            editingDocument={editingDoc}
          />
        </>
      )}

      {/* Thanh lưu dính dưới đáy khi đang sửa hồ sơ */}
      {editing && (
        <div className="sticky bottom-0 z-20 flex items-center justify-between gap-3 border-t border-line bg-surface/95 px-6 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.06)] backdrop-blur">
          <span className={`text-xs ${isDirty ? 'font-medium text-amber-700' : 'text-ink-muted'}`}>
            {isDirty ? '● Có thay đổi chưa lưu' : 'Đang sửa hồ sơ — chưa có thay đổi'}
          </span>
          <div className="flex gap-2">
            <Button onClick={cancelEdit} disabled={saving}>Hủy</Button>
            <Button variant="primary" loading={saving} disabled={!isDirty} onClick={handleSave}>
              {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </Button>
          </div>
        </div>
      )}

      {/* Hidden file input for document file upload */}
      <input
        ref={docFileInputRef}
        type="file"
        accept=".jpg,.jpeg,.png,.gif,.pdf"
        style={{ display: 'none' }}
        onChange={handleDocFileUpload}
      />

<ImageViewerModal
        isOpen={isImageViewerOpen}
        imageUrl={imageViewerUrl}
        documentId={
          imageViewerCertId != null
            ? String(imageViewerCertId)
            : imageViewerDocTarget != null
              ? imageViewerDocTarget.docId
              : undefined
        }
        customUploadHandler={
          imageViewerCertId != null
            ? handleCertificateUploadHandler
            : imageViewerDocTarget != null && id
              ? async (_docId: string, formData: FormData) => {
                  const result = await crewApi.uploadDocumentFile(id, imageViewerDocTarget.category, imageViewerDocTarget.docId, formData);
                  setImageViewerUrl(result.fileUrl);
                  await loadDocuments(true);
                  return result;
                }
              : undefined
        }
        onClose={() => {
          setIsImageViewerOpen(false);
          setImageViewerUrl(null);
          setImageViewerCertId(null);
          setImageViewerDocTarget(null);
        }}
        onFileChanged={() => {}}
      />
    </div>
  );
};



