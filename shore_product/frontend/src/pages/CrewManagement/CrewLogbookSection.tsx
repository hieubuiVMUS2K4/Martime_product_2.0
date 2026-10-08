import React, { useState, useEffect, useCallback } from 'react';
import { Pencil, Trash2, X, RefreshCw, Send, Check, AlertTriangle } from 'lucide-react';
import { logbookApi, crewApi } from '../../services/crew.service';
import type { CrewLogbookEntry } from '../../types/crew.types';
import { useToast } from '../../components/common/Toast';
import { toast } from 'sonner';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { Button, DataTable, TableActions, TableIconButton, type Column } from '@/components/common';
import ProtectedImage from '@/components/common/ProtectedImage';

const PHOTO_FALLBACK = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 260'%3E%3Crect width='200' height='260' fill='%23e5e7eb'/%3E%3Ccircle cx='100' cy='70' r='35' fill='%239ca3af'/%3E%3Cellipse cx='100' cy='180' rx='65' ry='50' fill='%239ca3af'/%3E%3C/svg%3E";

interface CrewLogbookSectionProps {
  crewMemberId: string;
  onSaved?: () => void;
}

interface SeamanBookMetadata {
  bookNo: string;
  fullName: string;
  dateOfBirth: string;
  placeOfBirth: string;
  nationality: string;
  sex: string;
  idCardNo: string;
  height: string;
  eyeColor: string;
  distinguishingMarks: string;
  bearerSignature?: string;
  
  issuingAuthority: string;
  placeOfIssue: string;
  issueDate: string;
  expiryDate: string;
  authoritySignerName: string;
  authoritySignerTitle: string;
  
  nokName: string;
  nokRelation: string;
  nokPhone: string;
  nokAddress: string;
  
  extensionsAndRemarks: string;
}

interface SeaServiceDetails {
  callSign: string;
  imoNumber: string;
  flagState: string;
  grossTonnage: string;
  enginePower: string;
  rank: string;
  signOnDate: string;
  signOnPort: string;
  signOffDate: string;
  signOffPort: string;
  conduct: string;
}

/** Ô thông tin chỉ đọc: nhãn nhỏ phía trên, giá trị phía dưới. */
const BookField: React.FC<{ label: string; value?: React.ReactNode; mono?: boolean; wide?: boolean }> = ({ label, value, mono, wide }) => (
  <div className={wide ? 'md:col-span-2' : undefined}>
    <dt className="text-xs font-medium text-ink-muted">{label}</dt>
    <dd className={`mt-0.5 truncate text-sm font-semibold text-ink ${mono ? 'font-mono' : ''}`} title={typeof value === 'string' ? value : undefined}>
      {value || '—'}
    </dd>
  </div>
);

export const CrewLogbookSection: React.FC<CrewLogbookSectionProps> = ({ crewMemberId, onSaved }) => {
  const ask = useConfirm();
  const [crew, setCrew] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();



  // Edit metadata subtab state
  const [metaFormTab, setMetaFormTab] = useState<'trang1' | 'trang2' | 'trang3' | 'trang4'>('trang1');

  // Sổ thuyền viên Metadata
  const [bookMetadataEntry, setBookMetadataEntry] = useState<CrewLogbookEntry | null>(null);
  const [bookMeta, setBookMeta] = useState<SeamanBookMetadata>({
    bookNo: '',
    fullName: '',
    dateOfBirth: '',
    placeOfBirth: '',
    nationality: 'VIỆT NAM / VIETNAMESE',
    sex: 'Nam / Male',
    idCardNo: '',
    height: '',
    eyeColor: 'Nâu / Brown',
    distinguishingMarks: 'Sẹo thẳng 2cm trán trái / Straight scar 2cm on left forehead',
    issuingAuthority: 'CỤC HÀNG HẢI VIỆT NAM / VINAMARINE',
    placeOfIssue: 'Hải Phòng',
    issueDate: new Date(Date.now() - 365 * 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    expiryDate: new Date(Date.now() + 365 * 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    authoritySignerName: 'Nguyễn Văn Thuấn',
    authoritySignerTitle: 'Giám đốc Cảng vụ Hàng hải',
    nokName: '',
    nokRelation: '',
    nokPhone: '',
    nokAddress: '',
    extensionsAndRemarks: 'Không có ghi chú đặc biệt / No special remarks'
  });

  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);

  // Sea Service List
  const [seaServices, setSeaServices] = useState<Array<{ entry: CrewLogbookEntry; details: SeaServiceDetails }>>([]);
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<CrewLogbookEntry | null>(null);
  const [submittingService, setSubmittingService] = useState(false);

  // Sea Service Form State
  const [serviceFormData, setServiceFormData] = useState<Partial<SeaServiceDetails> & { title: string; description: string }>({
    title: '',
    description: '',
    callSign: '',
    imoNumber: '',
    flagState: 'VIỆT NAM / VIETNAM',
    grossTonnage: '9,980 GT',
    enginePower: '4,200 kW',
    rank: 'Thủy thủ trực ca / OS',
    signOnDate: new Date().toISOString().split('T')[0],
    signOnPort: 'Hải Phòng, Việt Nam',
    signOffDate: '',
    signOffPort: '',
    conduct: 'Tốt / Good'
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Load crew member basic info to prefill
      const crewData = await crewApi.getById(crewMemberId);
      setCrew(crewData);

      // Load all logbook entries
      const allEntries = await logbookApi.getEntries(crewMemberId);

      // Setup default meta
      const defaultMeta: SeamanBookMetadata = {
        bookNo: crewData.seamanBookNumber || '',
        fullName: crewData.fullName || '',
        dateOfBirth: crewData.dateOfBirth ? crewData.dateOfBirth.split('T')[0] : '',
        placeOfBirth: crewData.placeOfBirth || '',
        nationality: crewData.countryName || 'VIỆT NAM / VIETNAMESE',
        sex: 'Nam / Male',
        idCardNo: crewData.idCardNumber || '',
        height: crewData.height ? String(crewData.height) : '',
        eyeColor: 'Nâu / Brown',
        distinguishingMarks: 'Sẹo thẳng 2cm trán trái / Straight scar 2cm on left forehead',
        bearerSignature: crewData.fullName || '',
        issuingAuthority: 'CỤC HÀNG HẢI VIỆT NAM / VINAMARINE',
        placeOfIssue: 'Hải Phòng',
        issueDate: new Date(Date.now() - 365 * 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        expiryDate: new Date(Date.now() + 365 * 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        authoritySignerName: 'Nguyễn Văn Thuấn',
        authoritySignerTitle: 'Giám đốc Cảng vụ Hàng hải',
        nokName: crewData.nextOfKinName || '',
        nokRelation: crewData.nextOfKinRelation || '',
        nokPhone: crewData.nextOfKinPhone || '',
        nokAddress: crewData.nextOfKinAddress || '',
        extensionsAndRemarks: 'Không có ghi chú đặc biệt / No special remarks'
      };

      // Parse metadata
      const meta = allEntries.find(e => e.entryType === 'BOOK_METADATA');
      if (meta) {
        setBookMetadataEntry(meta);
        try {
          const parsed = JSON.parse(meta.description);
          setBookMeta({
            ...defaultMeta,
            ...parsed,
            // Keep fallbacks in case parsed fields are empty
            bookNo: parsed.bookNo || crewData.seamanBookNumber || '',
            fullName: parsed.fullName || crewData.fullName || '',
            dateOfBirth: parsed.dateOfBirth || (crewData.dateOfBirth ? crewData.dateOfBirth.split('T')[0] : ''),
            placeOfBirth: parsed.placeOfBirth || crewData.placeOfBirth || '',
            nationality: parsed.nationality || crewData.countryName || 'VIỆT NAM / VIETNAMESE',
            idCardNo: parsed.idCardNo || crewData.idCardNumber || '',
            height: parsed.height || (crewData.height ? String(crewData.height) : ''),
            bearerSignature: parsed.bearerSignature || crewData.fullName || '',
            nokName: parsed.nokName || crewData.nextOfKinName || '',
            nokRelation: parsed.nokRelation || crewData.nextOfKinRelation || '',
            nokPhone: parsed.nokPhone || crewData.nextOfKinPhone || '',
            nokAddress: parsed.nokAddress || crewData.nextOfKinAddress || ''
          });
        } catch (e) {
          console.error("Failed to parse book metadata", e);
          setBookMeta(defaultMeta);
        }
      } else {
        setBookMeta(defaultMeta);
      }

      // Sea Service entries — đọc từ CỘT THẬT trước.
      // Mục cũ (tạo trước khi tách cột) vẫn giữ dữ liệu trong chuỗi JSON ở `description`,
      // nên vẫn thử parse để chúng hiển thị được; cột thật luôn thắng khi có giá trị.
      const serviceEntries = allEntries.filter(e => e.entryType === 'SEA_SERVICE');
      const parsedServices = serviceEntries.map(e => {
        let legacy: Partial<SeaServiceDetails> = {};
        try {
          legacy = JSON.parse(e.description) ?? {};
        } catch { /* mục mới: description là câu chữ thường, không phải JSON */ }

        const details: SeaServiceDetails = {
          callSign: e.callSign ?? legacy.callSign ?? '',
          imoNumber: e.imoNumber ?? legacy.imoNumber ?? '',
          flagState: e.vesselFlag ?? legacy.flagState ?? '',
          grossTonnage: e.grossTonnage != null
            ? `${e.grossTonnage.toLocaleString('en-US')} GT`
            : (legacy.grossTonnage ?? ''),
          enginePower: e.mainEnginePowerKw != null
            ? `${e.mainEnginePowerKw.toLocaleString('en-US')} kW`
            : (legacy.enginePower ?? ''),
          rank: e.rankAtTime ?? legacy.rank ?? '',
          signOnDate: e.signOnDate ?? legacy.signOnDate ?? '',
          signOnPort: e.signOnPortName ?? legacy.signOnPort ?? '',
          signOffDate: e.signOffDate ?? legacy.signOffDate ?? '',
          signOffPort: e.signOffPortName ?? legacy.signOffPort ?? '',
          conduct: e.conduct ?? legacy.conduct ?? '',
        };
        return { entry: e, details };
      });

      setSeaServices(parsedServices);

    } catch (err: any) {
      toast.error(err.message || 'Không thể tải dữ liệu sổ thuyền viên');
    } finally {
      setLoading(false);
    }
  }, [crewMemberId, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Save Book Metadata Page
  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSavingMeta(true);
      const payload = {
        title: "Sổ thuyền viên - Metadata",
        entryType: "BOOK_METADATA",
        entryDate: new Date().toISOString(),
        description: JSON.stringify(bookMeta),
        status: "Approved"
      };

      if (bookMetadataEntry) {
        await logbookApi.updateEntry(crewMemberId, bookMetadataEntry.id, payload);
      } else {
        await logbookApi.createEntry(crewMemberId, payload);
      }

      // Proactively update the crew member's profile fields
      if (crew) {
        await crewApi.update(crewMemberId, {
          crewId: crew.crewId,
          rankId: crew.rankId,
          seamanBookNumber: bookMeta.bookNo,
          fullName: bookMeta.fullName,
          dateOfBirth: bookMeta.dateOfBirth,
          placeOfBirth: bookMeta.placeOfBirth,
          idCardNumber: bookMeta.idCardNo,
          height: Number(bookMeta.height) || undefined,
          nextOfKinName: bookMeta.nokName,
          nextOfKinRelation: bookMeta.nokRelation,
          nextOfKinPhone: bookMeta.nokPhone,
          nextOfKinAddress: bookMeta.nokAddress
        });
      }

      toast.success('Lưu thông tin Sổ thuyền viên thành công');
      setIsEditingMeta(false);
      loadData();
      if (onSaved) onSaved();
    } catch (err: any) {
      toast.error(err.message || 'Không thể lưu thông tin sổ');
    } finally {
      setSavingMeta(false);
    }
  };

  // Sea Service CRUD handlers
  const handleOpenAddService = () => {
    setEditingService(null);
    setServiceFormData({
      title: 'Tàu MV VINALINES VIGOR',
      callSign: '3WKD9',
      imoNumber: 'IMO 9568762',
      flagState: 'VIỆT NAM / VIETNAM',
      grossTonnage: '20,854 GT',
      enginePower: '6,480 kW',
      rank: crew?.rankName || 'Thủy thủ trực ca / OS',
      signOnDate: new Date().toISOString().split('T')[0],
      signOnPort: 'Hải Phòng, Việt Nam',
      signOffDate: '',
      signOffPort: '',
      conduct: 'Tốt / Good',
      description: ''
    });
    setIsServiceModalOpen(true);
  };

  const handleOpenEditService = (record: { entry: CrewLogbookEntry; details: SeaServiceDetails }) => {
    setEditingService(record.entry);
    setServiceFormData({
      title: record.entry.title,
      callSign: record.details.callSign,
      imoNumber: record.details.imoNumber,
      flagState: record.details.flagState,
      grossTonnage: record.details.grossTonnage,
      enginePower: record.details.enginePower,
      rank: record.details.rank,
      signOnDate: record.details.signOnDate,
      signOnPort: record.details.signOnPort,
      signOffDate: record.details.signOffDate,
      signOffPort: record.details.signOffPort,
      conduct: record.details.conduct,
      description: record.entry.notes || ''
    });
    setIsServiceModalOpen(true);
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceFormData.title?.trim()) {
      toast.error('Tên tàu là bắt buộc');
      return;
    }

    try {
      setSubmittingService(true);
      const jsonDetails = {
        callSign: serviceFormData.callSign,
        imoNumber: serviceFormData.imoNumber,
        flagState: serviceFormData.flagState,
        grossTonnage: serviceFormData.grossTonnage,
        enginePower: serviceFormData.enginePower,
        rank: serviceFormData.rank,
        signOnDate: serviceFormData.signOnDate,
        signOnPort: serviceFormData.signOnPort,
        signOffDate: serviceFormData.signOffDate,
        signOffPort: serviceFormData.signOffPort,
        conduct: serviceFormData.conduct
      };

      const payload = {
        title: serviceFormData.title,
        entryType: "SEA_SERVICE",
        entryDate: new Date(serviceFormData.signOnDate || Date.now()).toISOString(),
        description: JSON.stringify(jsonDetails),
        notes: serviceFormData.description, // general remarks
        status: "Approved"
      };

      if (editingService) {
        await logbookApi.updateEntry(crewMemberId, editingService.id, payload);
        toast.success('Cập nhật quá trình công tác thành công');
      } else {
        await logbookApi.createEntry(crewMemberId, payload);
        toast.success('Thêm quá trình công tác thành công');
      }

      setIsServiceModalOpen(false);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Lưu quá trình công tác thất bại');
    } finally {
      setSubmittingService(false);
    }
  };

  const handleDeleteService = async (entryId: string) => {
    if (!await ask('Xóa quá trình đi biển này?')) return;
    try {
      await logbookApi.deleteEntry(crewMemberId, entryId);
      toast.success('Xóa quá trình đi biển thành công');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Không thể xóa');
    }
  };

  if (loading || !crew) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white/60 backdrop-blur-sm rounded-xl border border-gray-200/50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#0b2545] mb-3" />
        <span className="text-sm text-gray-500">Đang thiết lập Sổ thuyền viên...</span>
      </div>
    );
  }

  // Unified display variables to ensure 100% synchronization between basic info and the seaman's book
  const displayBookNo = crew.seamanBookNumber || bookMeta.bookNo || '';
  const displayFullName = (crew.fullName || bookMeta.fullName || '').toUpperCase();
  const displayDateOfBirth = crew.dateOfBirth ? crew.dateOfBirth.split('T')[0] : (bookMeta.dateOfBirth || '');
  const displayPlaceOfBirth = crew.placeOfBirth || bookMeta.placeOfBirth || '';
  const displayNationality = crew.countryName || bookMeta.nationality || 'VIỆT NAM / VIETNAMESE';
  const displayIdCardNo = crew.idCardNumber || bookMeta.idCardNo || '';
  const displayHeight = crew.height ? String(crew.height) : (bookMeta.height || '');
  const displaySex = bookMeta.sex || 'Nam / Male';
  const displayEyeColor = bookMeta.eyeColor || 'Nâu / Brown';
  const displayMarks = bookMeta.distinguishingMarks || '';
  const displayNokName = crew.nextOfKinName || bookMeta.nokName || '';
  const displayNokRelation = crew.nextOfKinRelation || bookMeta.nokRelation || '';
  const displayNokPhone = crew.nextOfKinPhone || bookMeta.nokPhone || '';
  const displayNokAddress = crew.nextOfKinAddress || bookMeta.nokAddress || '';

  type SeaServiceRow = { entry: CrewLogbookEntry; details: SeaServiceDetails };
  const dateVi = (d?: string) => (d ? new Date(d).toLocaleDateString('vi-VN') : '');
  const serviceStatus = ({ entry, details }: SeaServiceRow) =>
    details.signOffDate ? 'Đã rời tàu'
      : entry.recordStatus === 'DRAFT' ? 'Đã phân công'
      : entry.recordStatus === 'PENDING_APPROVAL' ? 'Chờ bờ duyệt'
      : entry.recordStatus === 'REJECTED' ? 'Bờ từ chối'
      : 'Đang đi tàu';
  const STATUS_TONE: Record<string, string> = {
    'Đã rời tàu': 'bg-slate-100 text-slate-700',
    'Đã phân công': 'bg-amber-50 text-amber-700',
    'Chờ bờ duyệt': 'bg-orange-50 text-orange-700',
    'Bờ từ chối': 'bg-red-50 text-red-700',
    'Đang đi tàu': 'bg-indigo-50 text-indigo-700',
  };

  const serviceColumns: Column<SeaServiceRow>[] = [
    { key: 'vessel', header: 'Tàu', width: 170, value: r => r.entry.vesselName || r.entry.title || '', className: 'font-semibold text-ink' },
    { key: 'imo', header: 'IMO', width: 90, value: r => r.details.imoNumber, render: r => r.details.imoNumber || '—', className: 'font-mono' },
    { key: 'flag', header: 'Cờ', width: 100, value: r => r.details.flagState, render: r => r.details.flagState || '—' },
    { key: 'gt', header: 'GT', width: 80, numeric: true, filter: false, value: r => Number(r.details.grossTonnage) || undefined, render: r => r.details.grossTonnage || '—' },
    { key: 'rank', header: 'Chức danh', width: 130, value: r => r.details.rank, render: r => r.details.rank || '—' },
    {
      key: 'signOn', header: 'Ngày lên tàu', width: 105, align: 'center', value: r => r.details.signOnDate,
      filter: r => dateVi(r.details.signOnDate), exportValue: r => dateVi(r.details.signOnDate), render: r => dateVi(r.details.signOnDate) || '—',
    },
    { key: 'signOnPort', header: 'Cảng lên', width: 110, value: r => r.details.signOnPort, render: r => r.details.signOnPort || '—' },
    {
      key: 'signOff', header: 'Ngày rời tàu', width: 105, align: 'center', value: r => r.details.signOffDate,
      filter: r => dateVi(r.details.signOffDate), exportValue: r => dateVi(r.details.signOffDate), render: r => dateVi(r.details.signOffDate) || '—',
    },
    { key: 'signOffPort', header: 'Cảng rời', width: 110, value: r => r.details.signOffPort, render: r => r.details.signOffPort || '—' },
    {
      key: 'status', header: 'Trạng thái', width: 120, align: 'center', value: serviceStatus,
      render: r => (
        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[serviceStatus(r)]}`}
          title={r.entry.recordStatus === 'REJECTED' ? r.entry.rejectionReason ?? '' : undefined}>
          {serviceStatus(r)}
        </span>
      ),
    },
    { key: 'conduct', header: 'Đánh giá', width: 100, value: r => r.details.conduct, render: r => r.details.conduct || '—' },
    {
      key: 'sync', header: 'Đồng bộ', width: 105, align: 'center', value: r => (r.entry.isSynced ? 'Đã đồng bộ' : 'Chờ đồng bộ'),
      render: r => r.entry.isSynced
        ? <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700"><Check className="h-3 w-3" />Đã đồng bộ</span>
        : <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700"><AlertTriangle className="h-3 w-3" />Chờ đồng bộ</span>,
    },
    {
      key: 'actions', header: 'Thao tác', width: 90, align: 'center',
      render: r => (
        <TableActions>
          <TableIconButton label="Sửa quá trình" icon={<Pencil />} onClick={() => handleOpenEditService(r)} />
          <TableIconButton label="Xóa quá trình" icon={<Trash2 />} variant="danger" onClick={() => handleDeleteService(r.entry.id)} />
        </TableActions>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Thông tin định danh sổ */}
        <section className="cd-section lg:col-span-2">
          <div className="cd-section-header">
            <h3 className="cd-section-title">Thông tin sổ thuyền viên</h3>
            <span className="text-sm text-ink-muted">
              Số sổ: <span className="font-mono font-semibold text-ink">{displayBookNo || '—'}</span>
            </span>
          </div>
          <div className="flex flex-col gap-5 p-4 sm:flex-row">
            {/* Ảnh hồ sơ là tệp cần đăng nhập — tải qua ProtectedImage như ảnh ở đầu trang. */}
            <ProtectedImage
              src={crew.avatarUrl || crew.photoUrl || undefined}
              fallbackSrc={PHOTO_FALLBACK}
              alt={`Ảnh ${crew.fullName ?? 'thuyền viên'}`}
              className="h-36 w-28 shrink-0 rounded border border-line object-cover"
            />
            <dl className="grid flex-1 grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2">
              <BookField label="Họ và tên" value={displayFullName} wide />
              <BookField label="Ngày sinh" value={displayDateOfBirth ? new Date(displayDateOfBirth).toLocaleDateString('vi-VN') : ''} />
              <BookField label="Giới tính" value={displaySex} />
              <BookField label="Nơi sinh" value={displayPlaceOfBirth} />
              <BookField label="Quốc tịch" value={displayNationality} />
              <BookField label="Số CMND/CCCD/Hộ chiếu" value={displayIdCardNo} mono />
              <BookField label="Chiều cao" value={displayHeight ? `${displayHeight} cm` : ''} />
              <BookField label="Màu mắt" value={displayEyeColor} />
              <BookField label="Đặc điểm nhận dạng" value={displayMarks} />
            </dl>
          </div>
        </section>

        {/* Liên hệ khẩn cấp */}
        <section className="cd-section">
          <div className="cd-section-header">
            <h3 className="cd-section-title">Liên hệ khẩn cấp</h3>
          </div>
          <dl className="grid grid-cols-1 gap-y-3 p-4">
            <BookField label="Họ và tên" value={displayNokName} />
            <BookField label="Mối quan hệ" value={displayNokRelation} />
            <BookField label="Số điện thoại" value={displayNokPhone} mono />
            <BookField label="Địa chỉ" value={displayNokAddress} />
          </dl>
        </section>

        {/* Cơ quan cấp & ghi chú */}
        <section className="cd-section lg:col-span-3">
          <div className="cd-section-header">
            <h3 className="cd-section-title">Cơ quan cấp & ghi chú</h3>
            <Button size="sm" variant="secondary" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setIsEditingMeta(true)}>
              Chỉnh sửa sổ
            </Button>
          </div>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 p-4 md:grid-cols-3">
            <BookField label="Cơ quan cấp" value={bookMeta.issuingAuthority} />
            <BookField label="Nơi cấp" value={bookMeta.placeOfIssue} />
            <BookField label="Người ký" value={[bookMeta.authoritySignerName, bookMeta.authoritySignerTitle].filter(Boolean).join(' — ')} />
            <BookField label="Ngày cấp" value={bookMeta.issueDate ? new Date(bookMeta.issueDate).toLocaleDateString('vi-VN') : ''} />
            <BookField label="Ngày hết hạn" value={bookMeta.expiryDate ? new Date(bookMeta.expiryDate).toLocaleDateString('vi-VN') : ''} />
            <BookField label="Gia hạn & ghi chú" value={bookMeta.extensionsAndRemarks} />
          </dl>
        </section>
      </div>

      {/* Lý lịch đi biển */}
      <section className="cd-section">
        <div className="cd-section-header">
          <h3 className="cd-section-title">Lý lịch đi biển ({seaServices.length})</h3>
        </div>
        <DataTable
          flush
          columns={serviceColumns}
          data={seaServices}
          rowKey={r => r.entry.id}
          itemLabel="quá trình"
          emptyMessage="Chưa có quá trình đi biển nào được khai báo."
          searchPlaceholder="Tìm theo tàu, IMO, chức danh, cảng..."
          onAdd={handleOpenAddService}
          addLabel="Khai báo đi tàu"
          exportOptions={{ fileName: `ly-lich-di-bien-${crew.crewId ?? ''}`, title: `LÝ LỊCH ĐI BIỂN — ${displayFullName}` }}
          pageSize={10}
        />
      </section>

      {/* METADATA EDIT MODAL */}
      {isEditingMeta && (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-gray-150 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 bg-[#0b2545] text-white rounded-t-2xl flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Chỉnh sửa Sổ Thuyền Viên 3D</h3>
                <p className="text-xs text-[#dce9f8] mt-0.5">Dữ liệu sẽ tự động đồng bộ hóa lên hệ thống Shore (Bờ) và hồ sơ gốc</p>
              </div>
              <button onClick={() => setIsEditingMeta(false)} className="text-white hover:bg-white/10 p-1.5 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            
            {/* Tab selection in Modal */}
            <div className="flex border-b border-gray-200 bg-gray-50 px-4 pt-2">
              <button
                type="button"
                onClick={() => setMetaFormTab('trang1')}
                className={`px-4 py-2 text-xs font-bold border-b-2 transition-all ${metaFormTab === 'trang1' ? 'border-[#0b2545] text-[#0b2545]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                Trang 1: Lý lịch cá nhân
              </button>
              <button
                type="button"
                onClick={() => setMetaFormTab('trang2')}
                className={`px-4 py-2 text-xs font-bold border-b-2 transition-all ${metaFormTab === 'trang2' ? 'border-[#0b2545] text-[#0b2545]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                Trang 2: Cơ quan cấp
              </button>
              <button
                type="button"
                onClick={() => setMetaFormTab('trang3')}
                className={`px-4 py-2 text-xs font-bold border-b-2 transition-all ${metaFormTab === 'trang3' ? 'border-[#0b2545] text-[#0b2545]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                Trang 3: Liên hệ khẩn cấp
              </button>
              <button
                type="button"
                onClick={() => setMetaFormTab('trang4')}
                className={`px-4 py-2 text-xs font-bold border-b-2 transition-all ${metaFormTab === 'trang4' ? 'border-[#0b2545] text-[#0b2545]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                Trang 4: Ghi chú khác
              </button>
            </div>

            <form onSubmit={handleSaveMeta} className="p-6 overflow-y-auto space-y-4 text-xs flex-1">
              {metaFormTab === 'trang1' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Số sổ thuyền viên (Book No.) *</label>
                      <input
                        type="text"
                        value={bookMeta.bookNo}
                        onChange={(e) => setBookMeta({ ...bookMeta, bookNo: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545] font-mono font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Họ và tên (Full Name) *</label>
                      <input
                        type="text"
                        value={bookMeta.fullName}
                        onChange={(e) => setBookMeta({ ...bookMeta, fullName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545] uppercase font-bold"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ngày sinh (Date of Birth)</label>
                      <input
                        type="date"
                        value={bookMeta.dateOfBirth}
                        onChange={(e) => setBookMeta({ ...bookMeta, dateOfBirth: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Giới tính (Sex)</label>
                      <select
                        value={bookMeta.sex}
                        onChange={(e) => setBookMeta({ ...bookMeta, sex: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                      >
                        <option value="Nam / Male">Nam / Male</option>
                        <option value="Nữ / Female">Nữ / Female</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Chiều cao (Height cm)</label>
                      <input
                        type="number"
                        placeholder="cm"
                        value={bookMeta.height}
                        onChange={(e) => setBookMeta({ ...bookMeta, height: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nơi sinh (Place of Birth)</label>
                      <input
                        type="text"
                        value={bookMeta.placeOfBirth}
                        onChange={(e) => setBookMeta({ ...bookMeta, placeOfBirth: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Quốc tịch (Nationality)</label>
                      <input
                        type="text"
                        value={bookMeta.nationality}
                        onChange={(e) => setBookMeta({ ...bookMeta, nationality: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">CMND/CCCD/Hộ chiếu (ID No.)</label>
                      <input
                        type="text"
                        value={bookMeta.idCardNo}
                        onChange={(e) => setBookMeta({ ...bookMeta, idCardNo: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545] font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Màu mắt (Eyes Color)</label>
                      <input
                        type="text"
                        value={bookMeta.eyeColor}
                        onChange={(e) => setBookMeta({ ...bookMeta, eyeColor: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Đặc điểm nhận dạng (Marks)</label>
                    <input
                      type="text"
                      value={bookMeta.distinguishingMarks}
                      onChange={(e) => setBookMeta({ ...bookMeta, distinguishingMarks: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                    />
                  </div>
                </div>
              )}

              {metaFormTab === 'trang2' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Cơ quan cấp (Issuing Authority)</label>
                    <input
                      type="text"
                      value={bookMeta.issuingAuthority}
                      onChange={(e) => setBookMeta({ ...bookMeta, issuingAuthority: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545] uppercase font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nơi cấp (Place of Issue)</label>
                      <input
                        type="text"
                        value={bookMeta.placeOfIssue}
                        onChange={(e) => setBookMeta({ ...bookMeta, placeOfIssue: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ngày cấp (Date of Issue)</label>
                      <input
                        type="date"
                        value={bookMeta.issueDate}
                        onChange={(e) => setBookMeta({ ...bookMeta, issueDate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ngày hết hạn (Date of Expiry)</label>
                      <input
                        type="date"
                        value={bookMeta.expiryDate}
                        onChange={(e) => setBookMeta({ ...bookMeta, expiryDate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t border-gray-100 pt-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Họ tên người ký (Authority Signer)</label>
                      <input
                        type="text"
                        value={bookMeta.authoritySignerName}
                        onChange={(e) => setBookMeta({ ...bookMeta, authoritySignerName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Chức vụ người ký (Signer Title)</label>
                      <input
                        type="text"
                        value={bookMeta.authoritySignerTitle}
                        onChange={(e) => setBookMeta({ ...bookMeta, authoritySignerTitle: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                      />
                    </div>
                  </div>
                </div>
              )}

              {metaFormTab === 'trang3' && (
                <div className="space-y-4">
                  <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-250 p-2.5 rounded-lg italic">
                    * Thông tin này sẽ tự động cập nhật vào mục "Người liên hệ khẩn cấp" trong hồ sơ nhân viên để bờ liên lạc khi có sự cố khẩn cấp trên biển.
                  </p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Họ tên người liên hệ khẩn cấp *</label>
                      <input
                        type="text"
                        value={bookMeta.nokName}
                        onChange={(e) => setBookMeta({ ...bookMeta, nokName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545] uppercase font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Mối quan hệ *</label>
                      <input
                        type="text"
                        placeholder="Vợ, Chồng, Bố, Mẹ, Con..."
                        value={bookMeta.nokRelation}
                        onChange={(e) => setBookMeta({ ...bookMeta, nokRelation: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Số điện thoại khẩn cấp *</label>
                    <input
                      type="text"
                      value={bookMeta.nokPhone}
                      onChange={(e) => setBookMeta({ ...bookMeta, nokPhone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545] font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Địa chỉ người liên hệ *</label>
                    <textarea
                      value={bookMeta.nokAddress}
                      onChange={(e) => setBookMeta({ ...bookMeta, nokAddress: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545] resize-none font-medium"
                    />
                  </div>
                </div>
              )}

              {metaFormTab === 'trang4' && (
                <div className="space-y-4">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Thông tin gia hạn và ghi chú hành chính (Remarks)</label>
                  <textarea
                    value={bookMeta.extensionsAndRemarks}
                    onChange={(e) => setBookMeta({ ...bookMeta, extensionsAndRemarks: e.target.value })}
                    rows={8}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545] resize-none font-serif text-sm italic leading-relaxed text-[#0b2545] bg-stone-50"
                  />
                </div>
              )}

              <div className="border-t border-gray-100 pt-4 flex justify-between items-center">
                <div className="text-xs text-gray-400 italic">
                  * Vui lòng điền đủ các trường bắt buộc để đảm bảo an toàn hành hải.
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingMeta(false)}
                    className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-600 hover:bg-gray-50 text-xs"
                    disabled={savingMeta}
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[#0b2545] hover:bg-[#16375f] text-white font-semibold rounded-lg shadow flex items-center gap-1.5 text-xs"
                    disabled={savingMeta}
                  >
                    {savingMeta ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>Lưu Sổ Thuyền Viên</span>
                  </button>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* SEA SERVICE CRUD MODAL */}
      {isServiceModalOpen && (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl border border-gray-150 flex flex-col max-h-[90vh]">
            
            <div className="px-6 py-4 border-b border-gray-100 bg-[#0b2545] text-white rounded-t-2xl flex items-center justify-between">
              <h3 className="text-base font-bold">
                {editingService ? 'Cập nhật Quá trình công tác' : 'Khai báo Quá trình đi biển (Record of Sea Service)'}
              </h3>
              <button onClick={() => setIsServiceModalOpen(false)} className="text-white hover:bg-white/10 p-1.5 rounded-lg"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSaveService} className="p-6 overflow-y-auto space-y-4 text-xs">
              
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tên tàu biển *</label>
                  <input
                    type="text"
                    placeholder="VD: Tàu MV VINALINES VIGOR"
                    value={serviceFormData.title}
                    onChange={(e) => setServiceFormData({ ...serviceFormData, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545] uppercase font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Hô hiệu (Call Sign)</label>
                  <input
                    type="text"
                    placeholder="VD: 3WKD9"
                    value={serviceFormData.callSign}
                    onChange={(e) => setServiceFormData({ ...serviceFormData, callSign: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545] uppercase font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Số IMO tàu</label>
                  <input
                    type="text"
                    placeholder="VD: IMO 9568762"
                    value={serviceFormData.imoNumber}
                    onChange={(e) => setServiceFormData({ ...serviceFormData, imoNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Quốc tịch tàu</label>
                  <input
                    type="text"
                    value={serviceFormData.flagState}
                    onChange={(e) => setServiceFormData({ ...serviceFormData, flagState: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545] uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Tổng dung tích (GT)</label>
                  <input
                    type="text"
                    placeholder="VD: 20,854 GT"
                    value={serviceFormData.grossTonnage}
                    onChange={(e) => setServiceFormData({ ...serviceFormData, grossTonnage: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Công suất máy chính (kW)</label>
                  <input
                    type="text"
                    placeholder="VD: 6,480 kW"
                    value={serviceFormData.enginePower}
                    onChange={(e) => setServiceFormData({ ...serviceFormData, enginePower: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Chức danh đảm nhiệm *</label>
                  <input
                    type="text"
                    placeholder="VD: Thủy thủ trực ca / OS"
                    value={serviceFormData.rank}
                    onChange={(e) => setServiceFormData({ ...serviceFormData, rank: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                    required
                  />
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <span className="font-bold text-[#0b2545] block mb-2">Thông tin Sign-on (Lên tàu)</span>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ngày Sign-on *</label>
                    <input
                      type="date"
                      value={serviceFormData.signOnDate}
                      onChange={(e) => setServiceFormData({ ...serviceFormData, signOnDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Cảng Sign-on *</label>
                    <input
                      type="text"
                      placeholder="VD: Hải Phòng, Việt Nam"
                      value={serviceFormData.signOnPort}
                      onChange={(e) => setServiceFormData({ ...serviceFormData, signOnPort: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <span className="font-bold text-red-700 block mb-2">Thông tin Sign-off (Rời tàu) (Bỏ trống nếu đang đi tàu)</span>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ngày Sign-off</label>
                    <input
                      type="date"
                      value={serviceFormData.signOffDate}
                      onChange={(e) => setServiceFormData({ ...serviceFormData, signOffDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Cảng Sign-off</label>
                    <input
                      type="text"
                      placeholder="VD: Rotterdam, Hà Lan"
                      value={serviceFormData.signOffPort}
                      onChange={(e) => setServiceFormData({ ...serviceFormData, signOffPort: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Nhận xét năng lực</label>
                    <select
                      value={serviceFormData.conduct}
                      onChange={(e) => setServiceFormData({ ...serviceFormData, conduct: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                    >
                      <option value="Xuất sắc / Excellent">Xuất sắc / Excellent</option>
                      <option value="Tốt / Good">Tốt / Good</option>
                      <option value="Khá / Fair">Khá / Fair</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Ghi chú hành trình / Nhận xét khác</label>
                    <input
                      type="text"
                      placeholder="VD: Hoàn thành tốt hợp đồng đi ca / Thuyền trưởng đánh giá cao"
                      value={serviceFormData.description}
                      onChange={(e) => setServiceFormData({ ...serviceFormData, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsServiceModalOpen(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-600 hover:bg-gray-50"
                  disabled={submittingService}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#0b2545] hover:bg-[#16375f] text-white font-semibold rounded-lg shadow flex items-center gap-1.5"
                  disabled={submittingService}
                >
                  {submittingService ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Lưu quá trình</span>
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
};
