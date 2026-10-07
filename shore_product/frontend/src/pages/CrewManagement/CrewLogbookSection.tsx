import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, Pencil, Trash2, X, RefreshCw, Send, 
  Book, Edit3, Check, AlertTriangle
} from 'lucide-react';
import { logbookApi, crewApi } from '../../services/crew.service';
import type { CrewLogbookEntry } from '../../types/crew.types';
import { useToast } from '../../components/common/Toast';
import { toast } from 'sonner';
import { useConfirm } from '@/components/common/ConfirmDialog';

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

  return (
    <div className="space-y-4 select-none">
      {/* DIGITAL CREW LOGBOOK MODERN DASHBOARD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 select-text">
        {/* Left 2 Columns: Bio-data & Issuing Authority */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Card 1: Hồ sơ số hóa (Digital Particulars) */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
            {/* Card Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-[#eef2f7] text-[#0b2545] rounded-xl">
                  <Book className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Thông tin định danh Sổ Thuyền Viên / Particulars</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5 font-medium uppercase tracking-wider">SEAFARER'S PARTICULARS & CORE IDENTITY DATA</p>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase font-sans">Số sổ / Book No:</span>
                <span className="px-3 py-1 bg-red-50 text-red-650 font-mono font-bold rounded-lg text-xs tracking-wider border border-red-100">
                  {displayBookNo || '----------'}
                </span>
              </div>
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Avatar Column */}
              <div className="md:col-span-4 flex flex-col items-center gap-4">
                <div className="w-32 h-44 rounded-2xl border border-slate-200/60 bg-slate-50 shadow-inner relative overflow-hidden group">
                  <img 
                    src={crew.photoUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 260'%3E%3Crect width='200' height='260' fill='%23e5e7eb'/%3E%3Ccircle cx='100' cy='70' r='35' fill='%239ca3af'/%3E%3Cellipse cx='100' cy='180' rx='65' ry='50' fill='%239ca3af'/%3E%3C/svg%3E"}
                    alt="Bearer"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {/* Digital giáp lai watermark overlay */}
                  <div className="absolute -bottom-2 -right-2 w-14 h-14 rounded-full border border-dashed border-red-500/20 flex items-center justify-center rotate-12 pointer-events-none select-none">
                    <span className="text-[4px] font-bold text-red-500/30 text-center uppercase tracking-tighter">SECURED<br/>VINAMARINE</span>
                  </div>
                </div>
              </div>

              {/* Particulars Fields Column */}
              <div className="md:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
                <div className="md:col-span-2 bg-slate-50/50 rounded-xl p-3 border border-slate-100/50">
                  <span className="text-slate-400 block text-[9px] font-bold uppercase tracking-wider">Họ và tên / Full Name</span>
                  <span className="text-sm font-bold text-slate-800 uppercase tracking-wider block mt-0.5">
                    {displayFullName || '---'}
                  </span>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100/50">
                  <span className="text-slate-400 block text-[9px] font-bold uppercase tracking-wider">Ngày sinh / Date of Birth</span>
                  <span className="font-semibold text-slate-700 block mt-0.5">
                    {displayDateOfBirth ? new Date(displayDateOfBirth).toLocaleDateString('vi-VN') : '---'}
                  </span>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100/50">
                  <span className="text-slate-400 block text-[9px] font-bold uppercase tracking-wider">Giới tính / Sex</span>
                  <span className="font-semibold text-slate-700 block mt-0.5">{displaySex}</span>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100/50">
                  <span className="text-slate-400 block text-[9px] font-bold uppercase tracking-wider">Nơi sinh / Place of Birth</span>
                  <span className="font-semibold text-slate-700 block mt-0.5">{displayPlaceOfBirth || '---'}</span>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100/50">
                  <span className="text-slate-400 block text-[9px] font-bold uppercase tracking-wider">Quốc tịch / Nationality</span>
                  <span className="font-semibold text-slate-700 block mt-0.5 uppercase">{displayNationality}</span>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100/50">
                  <span className="text-slate-400 block text-[9px] font-bold uppercase tracking-wider">Số CMND/CCCD/Hộ chiếu / ID Card or Passport No.</span>
                  <span className="font-mono font-semibold text-slate-700 block mt-0.5">{displayIdCardNo || '----------'}</span>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100/50">
                  <span className="text-slate-400 block text-[9px] font-bold uppercase tracking-wider">Chiều cao / Height</span>
                  <span className="font-semibold text-slate-700 block mt-0.5">{displayHeight ? `${displayHeight} cm` : '---'}</span>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100/50">
                  <span className="text-slate-400 block text-[9px] font-bold uppercase tracking-wider">Màu mắt / Eye Color</span>
                  <span className="font-semibold text-slate-700 block mt-0.5">{displayEyeColor}</span>
                </div>

                <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100/50">
                  <span className="text-slate-400 block text-[9px] font-bold uppercase tracking-wider">Đặc điểm dị hình / Distinguishing Marks</span>
                  <span className="font-semibold text-slate-700 block mt-0.5 truncate" title={displayMarks}>
                    {displayMarks || '---'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Cơ quan cấp & Ghi chú (Issuing Authority & Remarks) */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-[#eef2f7] text-[#0b2545] rounded-xl">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Cơ quan cấp & Ghi chú / Issuing Authority</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5 font-medium uppercase tracking-wider">ISSUING DETAILS & ADMINISTRATIVE REMARKS</p>
                </div>
              </div>
              
              <button
                onClick={() => setIsEditingMeta(true)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-[#eef2f7] text-[#0b2545] hover:bg-[#dce9f8] text-xs font-bold rounded-lg transition-all"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Chỉnh sửa sổ / Edit Seaman's Book</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
              <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100/50">
                <span className="text-slate-400 block text-[9px] font-bold uppercase tracking-wider">Cơ quan cấp / Issuing Authority</span>
                <span className="font-bold text-slate-800 block mt-0.5 uppercase">{bookMeta.issuingAuthority}</span>
              </div>

              <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100/50">
                <span className="text-slate-400 block text-[9px] font-bold uppercase tracking-wider">Nơi cấp / Place of Issue</span>
                <span className="font-semibold text-slate-700 block mt-0.5">{bookMeta.placeOfIssue}</span>
              </div>

              <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100/50">
                <span className="text-slate-400 block text-[9px] font-bold uppercase tracking-wider">Ngày cấp / Date of Issue</span>
                <span className="font-semibold text-slate-700 block mt-0.5">
                  {bookMeta.issueDate ? new Date(bookMeta.issueDate).toLocaleDateString('vi-VN') : '---'}
                </span>
              </div>

              <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100/50">
                <span className="text-slate-400 block text-[9px] font-bold uppercase tracking-wider">Ngày hết hạn / Date of Expiry</span>
                <span className="font-bold text-red-600 block mt-0.5">
                  {bookMeta.expiryDate ? new Date(bookMeta.expiryDate).toLocaleDateString('vi-VN') : '---'}
                </span>
              </div>

              <div className="md:col-span-2 bg-slate-50/50 rounded-xl p-3 border border-slate-100/50 flex justify-between items-center gap-4">
                <div>
                  <span className="text-slate-400 block text-[9px] font-bold uppercase tracking-wider">Người có thẩm quyền / Authority Signer</span>
                  <span className="font-bold text-slate-800 block mt-0.5">{bookMeta.authoritySignerName}</span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">{bookMeta.authoritySignerTitle}</span>
                </div>
                
                {/* Modernized official stamp avatar */}
                <div className="w-16 h-16 rounded-full border-2 border-red-500/50 border-double flex flex-col items-center justify-center text-[5px] font-bold text-red-500/60 rotate-6 select-none pointer-events-none p-1 bg-red-50/10 shadow-sm flex-shrink-0">
                  <span className="scale-90 leading-none text-center">VINAMARINE<br/>APPROVED</span>
                </div>
              </div>
            </div>

            {/* Remarks content */}
            {bookMeta.extensionsAndRemarks && (
              <div className="bg-amber-50/10 border border-amber-100 rounded-xl p-4 mt-2">
                <span className="text-[9px] font-bold text-amber-600/80 uppercase tracking-wider block mb-1">Gia hạn & Ghi chú / Remarks & Extensions</span>
                <p className="text-xs text-slate-600 italic font-serif leading-relaxed whitespace-pre-line">
                  {bookMeta.extensionsAndRemarks}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right 1 Column: Next of Kin */}
        <div className="space-y-6">
          {/* Card 3: Thân nhân / Emergency Contact */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
              <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Liên hệ khẩn cấp / Next of Kin</h3>
                <p className="text-[10px] text-slate-400 mt-0.5 font-medium uppercase tracking-wider">EMERGENCY NOTIFICATION DETAILS</p>
              </div>
            </div>

            <div className="space-y-3.5 text-xs font-sans">
              <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100/50">
                <span className="text-slate-400 block text-[9px] font-bold uppercase tracking-wider">Họ và tên người liên hệ / Next of Kin Name</span>
                <span className="font-bold text-slate-800 block mt-0.5 uppercase">{displayNokName || '---'}</span>
              </div>

              <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100/50">
                <span className="text-slate-400 block text-[9px] font-bold uppercase tracking-wider">Mối quan hệ / Relationship</span>
                <span className="font-semibold text-slate-700 block mt-0.5">{displayNokRelation || '---'}</span>
              </div>

              <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100/50">
                <span className="text-slate-400 block text-[9px] font-bold uppercase tracking-wider">Số điện thoại liên hệ / Contact Phone</span>
                <span className="font-mono font-bold text-slate-700 block mt-0.5">{displayNokPhone || '---'}</span>
              </div>

              <div className="bg-slate-50/50 rounded-xl p-3 border border-slate-100/50">
                <span className="text-slate-400 block text-[9px] font-bold uppercase tracking-wider">Địa chỉ thường trú / Contact Address</span>
                <span className="font-medium text-slate-600 block mt-0.5 leading-relaxed">{displayNokAddress || '---'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MODERN SEA SERVICE RECORD LIST SECTION */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mt-6 select-text">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 mb-6 gap-2">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-[#eef2f7] text-[#0b2545] rounded-xl">
              <Book className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Lý lịch đi biển (Record of Employment / Sea Service)</h3>
              <p className="text-[10px] text-slate-400 mt-0.5">CHRONOLOGICAL RECORD OF VESSEL ASSIGNMENTS</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3 self-start sm:self-center">
            <span className="px-3 py-1.5 bg-slate-100 text-slate-600 text-xs font-bold rounded-lg whitespace-nowrap">
              Tổng số: {seaServices.length} quá trình
            </span>
          </div>
        </div>

        {seaServices.length === 0 ? (
          <div className="text-center py-16 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
            <Book className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium text-xs">Chưa có quá trình đi biển nào được khai báo.</p>
            <button
              onClick={handleOpenAddService}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-[#0b2545] hover:bg-[#16375f] text-white font-bold rounded-xl text-xs transition-all shadow-md active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Khai báo quá trình đầu tiên</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-x-auto border border-slate-100 rounded-xl shadow-sm">
              <table className="min-w-full divide-y divide-slate-100 text-[11px] font-sans text-left">
                <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-[9px] font-bold">
                  <tr>
                    <th scope="col" className="px-4 py-3">Trạng thái / Status</th>
                    <th scope="col" className="px-4 py-3">Tàu biển / Vessel</th>
                    <th scope="col" className="px-4 py-3">Thông tin tàu / Vessel Details</th>
                    <th scope="col" className="px-4 py-3">Chức danh / Capacity</th>
                    <th scope="col" className="px-4 py-3">Ngày & Cảng lên / Sign-on</th>
                    <th scope="col" className="px-4 py-3">Ngày & Cảng rời / Sign-off</th>
                    <th scope="col" className="px-4 py-3">Đánh giá / Ability</th>
                    <th scope="col" className="px-4 py-3 text-right">Thao tác / Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {seaServices.map(({ entry, details }) => (
                    <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3.5 whitespace-nowrap">
                        {entry.isSynced ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-green-50 text-green-700 border border-green-150">
                            <Check className="w-2.5 h-2.5" />
                            <span>Đã đồng bộ</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-150 animate-pulse">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span>Chờ đồng bộ</span>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-800 uppercase tracking-wider text-xs">{entry.vesselName || entry.title}</div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {details.imoNumber ? `IMO ${details.imoNumber}` : 'IMO ---'}
                          {details.callSign && <span className="ml-2">{details.callSign}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="text-slate-650 font-semibold">{details.flagState || '---'}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {[details.grossTonnage, details.enginePower, entry.vesselType].filter(Boolean).join(' · ') || '---'}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        {details.rank
                          ? <span className="inline-flex px-2 py-0.5 rounded bg-[#eef2f7] text-[#0b2545] font-semibold border border-[#d6dee8]">{details.rank}</span>
                          : <span className="text-slate-300">---</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-green-700">{details.signOnDate ? new Date(details.signOnDate).toLocaleDateString('vi-VN') : '---'}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5">{details.signOnPort}</div>
                      </td>
                      <td className="px-4 py-3.5">
                        {details.signOffDate ? (
                          <>
                            <div className="font-bold text-rose-700">{new Date(details.signOffDate).toLocaleDateString('vi-VN')}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">{details.signOffPort}</div>
                          </>
                        ) : entry.recordStatus === 'DRAFT' ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 text-amber-700 border border-amber-100">
                            Đã phân công / Assigned
                          </span>
                        ) : entry.recordStatus === 'PENDING_APPROVAL' ? (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold bg-orange-50 text-orange-700 border border-orange-100">
                            Chờ bờ duyệt / Pending
                          </span>
                        ) : entry.recordStatus === 'REJECTED' ? (
                          <div>
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold bg-red-50 text-red-700 border border-red-200">
                              Bờ từ chối / Rejected
                            </span>
                            <div className="text-[10px] text-red-600 mt-0.5 max-w-[180px]" title={entry.rejectionReason ?? ''}>
                              {entry.rejectionReason}
                            </div>
                          </div>
                        ) : (
                          <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-100">
                            Đang đi tàu / Onboard
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="font-bold text-slate-700">{details.conduct}</div>
                        {entry.notes && <div className="text-[10px] text-slate-400 italic max-w-xs truncate mt-0.5" title={entry.notes}>{entry.notes}</div>}
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap">
                        <div className="inline-flex gap-1.5">
                          <button
                            onClick={() => handleOpenEditService({ entry, details })}
                            className="p-1.5 rounded-lg bg-white hover:bg-[#eef2f7] hover:text-[#0b2545] border border-slate-200 shadow-sm transition-colors"
                            title="Sửa quá trình"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteService(entry.id)}
                            className="p-1.5 rounded-lg bg-white hover:bg-rose-50 hover:text-rose-600 border border-slate-200 shadow-sm transition-colors"
                            title="Xóa quá trình"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                onClick={handleOpenAddService}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-[#0b2545] hover:bg-[#16375f] text-white font-bold rounded-lg text-xs transition-all shadow-md active:scale-95 border border-[#0b2545]/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Khai báo đi tàu / Declare Sea Service</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* METADATA EDIT MODAL */}
      {isEditingMeta && (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-gray-150 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 bg-[#0b2545] text-white rounded-t-2xl flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Chỉnh sửa Sổ Thuyền Viên 3D</h3>
                <p className="text-[10px] text-[#dce9f8] mt-0.5">Dữ liệu sẽ tự động đồng bộ hóa lên hệ thống Shore (Bờ) và hồ sơ gốc</p>
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
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Số sổ thuyền viên (Book No.) *</label>
                      <input
                        type="text"
                        value={bookMeta.bookNo}
                        onChange={(e) => setBookMeta({ ...bookMeta, bookNo: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545] font-mono font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Họ và tên (Full Name) *</label>
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
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Ngày sinh (Date of Birth)</label>
                      <input
                        type="date"
                        value={bookMeta.dateOfBirth}
                        onChange={(e) => setBookMeta({ ...bookMeta, dateOfBirth: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Giới tính (Sex)</label>
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
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Chiều cao (Height cm)</label>
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
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Nơi sinh (Place of Birth)</label>
                      <input
                        type="text"
                        value={bookMeta.placeOfBirth}
                        onChange={(e) => setBookMeta({ ...bookMeta, placeOfBirth: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Quốc tịch (Nationality)</label>
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
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">CMND/CCCD/Hộ chiếu (ID No.)</label>
                      <input
                        type="text"
                        value={bookMeta.idCardNo}
                        onChange={(e) => setBookMeta({ ...bookMeta, idCardNo: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545] font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Màu mắt (Eyes Color)</label>
                      <input
                        type="text"
                        value={bookMeta.eyeColor}
                        onChange={(e) => setBookMeta({ ...bookMeta, eyeColor: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Đặc điểm nhận dạng (Marks)</label>
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
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Cơ quan cấp (Issuing Authority)</label>
                    <input
                      type="text"
                      value={bookMeta.issuingAuthority}
                      onChange={(e) => setBookMeta({ ...bookMeta, issuingAuthority: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545] uppercase font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Nơi cấp (Place of Issue)</label>
                      <input
                        type="text"
                        value={bookMeta.placeOfIssue}
                        onChange={(e) => setBookMeta({ ...bookMeta, placeOfIssue: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Ngày cấp (Date of Issue)</label>
                      <input
                        type="date"
                        value={bookMeta.issueDate}
                        onChange={(e) => setBookMeta({ ...bookMeta, issueDate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Ngày hết hạn (Date of Expiry)</label>
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
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Họ tên người ký (Authority Signer)</label>
                      <input
                        type="text"
                        value={bookMeta.authoritySignerName}
                        onChange={(e) => setBookMeta({ ...bookMeta, authoritySignerName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Chức vụ người ký (Signer Title)</label>
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
                  <p className="text-[10px] text-yellow-700 bg-yellow-50 border border-yellow-250 p-2.5 rounded-lg italic">
                    * Thông tin này sẽ tự động cập nhật vào mục "Người liên hệ khẩn cấp" trong hồ sơ nhân viên để bờ liên lạc khi có sự cố khẩn cấp trên biển.
                  </p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Họ tên người liên hệ khẩn cấp *</label>
                      <input
                        type="text"
                        value={bookMeta.nokName}
                        onChange={(e) => setBookMeta({ ...bookMeta, nokName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545] uppercase font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Mối quan hệ *</label>
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
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Số điện thoại khẩn cấp *</label>
                    <input
                      type="text"
                      value={bookMeta.nokPhone}
                      onChange={(e) => setBookMeta({ ...bookMeta, nokPhone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545] font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Địa chỉ người liên hệ *</label>
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
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Thông tin gia hạn và ghi chú hành chính (Remarks)</label>
                  <textarea
                    value={bookMeta.extensionsAndRemarks}
                    onChange={(e) => setBookMeta({ ...bookMeta, extensionsAndRemarks: e.target.value })}
                    rows={8}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545] resize-none font-serif text-sm italic leading-relaxed text-[#0b2545] bg-stone-50"
                  />
                </div>
              )}

              <div className="border-t border-gray-100 pt-4 flex justify-between items-center">
                <div className="text-[10px] text-gray-400 italic">
                  * Vui lòng điền đủ các trường bắt buộc để đảm bảo an toàn hành hải.
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingMeta(false)}
                    className="px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-600 hover:bg-gray-50 text-[11px]"
                    disabled={savingMeta}
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-[#0b2545] hover:bg-[#16375f] text-white font-semibold rounded-lg shadow flex items-center gap-1.5 text-[11px]"
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
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Tên tàu biển *</label>
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
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Hô hiệu (Call Sign)</label>
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
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Số IMO tàu</label>
                  <input
                    type="text"
                    placeholder="VD: IMO 9568762"
                    value={serviceFormData.imoNumber}
                    onChange={(e) => setServiceFormData({ ...serviceFormData, imoNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Quốc tịch tàu</label>
                  <input
                    type="text"
                    value={serviceFormData.flagState}
                    onChange={(e) => setServiceFormData({ ...serviceFormData, flagState: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545] uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Tổng dung tích (GT)</label>
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
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Công suất máy chính (kW)</label>
                  <input
                    type="text"
                    placeholder="VD: 6,480 kW"
                    value={serviceFormData.enginePower}
                    onChange={(e) => setServiceFormData({ ...serviceFormData, enginePower: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Chức danh đảm nhiệm *</label>
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
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Ngày Sign-on *</label>
                    <input
                      type="date"
                      value={serviceFormData.signOnDate}
                      onChange={(e) => setServiceFormData({ ...serviceFormData, signOnDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Cảng Sign-on *</label>
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
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Ngày Sign-off</label>
                    <input
                      type="date"
                      value={serviceFormData.signOffDate}
                      onChange={(e) => setServiceFormData({ ...serviceFormData, signOffDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-[#0b2545]"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Cảng Sign-off</label>
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
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Nhận xét năng lực</label>
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
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Ghi chú hành trình / Nhận xét khác</label>
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
