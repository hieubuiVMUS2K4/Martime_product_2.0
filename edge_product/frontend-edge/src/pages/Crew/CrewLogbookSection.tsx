import { PermissionGate } from '@/components/auth/PermissionGate'
import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, Pencil, Trash2, X, RefreshCw, Send, CloudLightning,
  Cloud, Book, Edit3, Check, AlertTriangle
} from 'lucide-react';
import { maritimeService } from '../../services/maritime.service';
import { shipDataService } from '../../services/ship-data.service';
import { PortCombobox } from '../../components/common/PortCombobox';
import type { CrewLogbookEntry } from '@/types/maritime.types';
import type { ShipData } from '@/types/ship-data.types';
import { toast } from 'sonner';

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
  bearerSignature: string;
  
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
  const [crew, setCrew] = useState<any>(null);
  // Thông số con tàu THẬT của node này. Trước đây form điền bằng hằng số viết cứng
  // ("MV VINALINES VIGOR", IMO 9568762...) nên mọi mục sổ lưu xuống đều sai tàu.
  const [ship, setShip] = useState<ShipData | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);



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
    bearerSignature: '',
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

  // ── Đề nghị cho xuống tàu (chờ bờ duyệt) ──────────────────
  const [signOffTarget, setSignOffTarget] = useState<CrewLogbookEntry | null>(null);
  const [signOffForm, setSignOffForm] = useState({
    signOffDate: new Date().toISOString().split('T')[0],
    portName: '',
    portCode: '',
    reason: '',
    requestedBy: '',
  });
  const [submittingSignOff, setSubmittingSignOff] = useState(false);
  const [editingService, setEditingService] = useState<CrewLogbookEntry | null>(null);
  const [submittingService, setSubmittingService] = useState(false);

  // Sea Service Form State
  const [serviceFormData, setServiceFormData] = useState<Partial<SeaServiceDetails> & { title: string; description: string }>({
    // Giá trị khởi tạo để TRỐNG — sẽ được điền từ hồ sơ tàu thật khi mở form
    // (xem handleOpenAddService). Không đặt số liệu mẫu ở đây: người dùng bấm lưu
    // là số liệu mẫu trở thành dữ liệu thật trong giấy tờ pháp lý.
    title: '',
    description: '',
    callSign: '',
    imoNumber: '',
    flagState: '',
    grossTonnage: '',
    enginePower: '',
    rank: '',
    signOnDate: new Date().toISOString().split('T')[0],
    signOnPort: '',
    signOffDate: '',
    signOffPort: '',
    conduct: 'Tốt / Good'
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      
      // Load crew member basic info to prefill
      const crewData = await maritimeService.crew.getById(crewMemberId);
      setCrew(crewData);

      // Thông số tàu thật — nguồn duy nhất cho phần định danh tàu của mục sổ
      try {
        const shipRes = await shipDataService.get();
        setShip(shipRes.exists ? shipRes.data : null);
      } catch {
        setShip(null); // không chặn việc mở sổ nếu chưa khai báo hồ sơ tàu
      }

      // Load all logbook entries
      const allEntries = await maritimeService.logbook.getEntries(crewMemberId);

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

      // Pending sync count
      const pendingSyncs = await maritimeService.logbook.getPendingSync(crewMemberId);
      setPendingCount(pendingSyncs.length);

    } catch (err: any) {
      toast.error(err.message || 'Không thể tải dữ liệu sổ thuyền viên');
    } finally {
      setLoading(false);
    }
  }, [crewMemberId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sync Outbox Manual trigger
  const handleSyncNow = async () => {
    try {
      setSyncing(true);
      toast.loading('Đang đồng bộ Sổ thuyền viên lên Shore...');
      const res = await maritimeService.logbook.triggerSync(crewMemberId);
      toast.dismiss();
      toast.success(res.message || 'Đồng bộ hoàn tất!');
      loadData();
    } catch (err: any) {
      toast.dismiss();
      toast.error(err.message || 'Đồng bộ thất bại');
    } finally {
      setSyncing(false);
    }
  };

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
        await maritimeService.logbook.updateEntry(crewMemberId, bookMetadataEntry.id, payload);
      } else {
        await maritimeService.logbook.createEntry(crewMemberId, payload);
      }

      // Proactively update the crew member's profile fields
      if (crew) {
        await maritimeService.crew.update(crewMemberId, {
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

      toast.success('Lưu thông tin Sổ thuyền viên thành công (Chờ đồng bộ)');
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
    // Điền từ hồ sơ tàu thật, KHÔNG dùng hằng số. Để trống nếu chưa khai báo hồ sơ tàu —
    // thà để trống còn hơn ghi số liệu của một con tàu khác vào giấy tờ pháp lý.
    const engine = ship?.mainEngines?.[0];
    const summerLine = ship?.loadLines?.find(l => l.loadLineType === 'S');
    setServiceFormData({
      title: ship?.shipName ? `Tàu ${ship.shipName}` : '',
      callSign: ship?.callSign ?? '',
      imoNumber: ship?.imoNumber ?? '',
      flagState: ship?.flag ?? '',
      grossTonnage: ship?.grossTonnageInternational != null
        ? `${ship.grossTonnageInternational.toLocaleString('en-US')} GT` : '',
      enginePower: engine?.mePowerKW != null
        ? `${engine.mePowerKW.toLocaleString('en-US')} kW` : '',
      rank: crew?.rank?.rankName || '',
      signOnDate: new Date().toISOString().split('T')[0],
      signOnPort: '',
      signOffDate: '',
      signOffPort: '',
      conduct: 'Tốt / Good',
      description: summerLine?.deadweightMt != null
        ? `DWT ${summerLine.deadweightMt.toLocaleString('en-US')} mt` : ''
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

  const handleSubmitSignOffRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signOffTarget) return;
    if (!signOffForm.reason.trim()) {
      toast.error('Phải ghi lý do cho xuống tàu');
      return;
    }
    try {
      setSubmittingSignOff(true);
      const isResubmit = signOffTarget.recordStatus === 'REJECTED';
      const payload = {
        signOffDate: new Date(signOffForm.signOffDate).toISOString(),
        portCode: signOffForm.portCode || undefined,
        portName: signOffForm.portName || undefined,
        reason: signOffForm.reason.trim(),
        requestedBy: signOffForm.requestedBy || undefined,
      };
      if (isResubmit) {
        await maritimeService.logbook.signOffFollowUp(crewMemberId, signOffTarget.id, {
          resubmit: true, ...payload,
        });
        toast.success('Đã gửi lại đề nghị lên bờ');
      } else {
        await maritimeService.logbook.requestSignOff(crewMemberId, signOffTarget.id, payload);
        toast.success('Đã gửi đề nghị lên bờ, chờ duyệt');
      }
      setSignOffTarget(null);
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Gửi đề nghị thất bại');
    } finally {
      setSubmittingSignOff(false);
    }
  };

  /** Bờ đã từ chối và tàu chấp nhận bỏ ý định — kỳ quay lại đang phục vụ bình thường. */
  const handleCancelSignOff = async (entry: CrewLogbookEntry) => {
    if (!window.confirm('Huỷ hẳn việc cho xuống tàu? Thuyền viên tiếp tục phục vụ bình thường.')) return;
    try {
      await maritimeService.logbook.signOffFollowUp(crewMemberId, entry.id, { resubmit: false });
      toast.success('Đã huỷ đề nghị xuống tàu');
      loadData();
    } catch (err: any) {
      toast.error(err.message || 'Huỷ thất bại');
    }
  };

  const handleSaveService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!serviceFormData.title?.trim()) {
      toast.error('Tên tàu là bắt buộc');
      return;
    }

    try {
      setSubmittingService(true);

      // "20,854 GT" / "6,480 kW" → 20854 / 6480. Người dùng gõ có dấu phẩy và đơn vị,
      // còn cột trong DB là số.
      const toNumber = (s?: string) => {
        const n = parseFloat((s ?? '').replace(/[^0-9.]/g, ''));
        return Number.isFinite(n) ? n : null;
      };

      const payload = {
        title: serviceFormData.title,
        entryType: "SEA_SERVICE",
        entryDate: new Date(serviceFormData.signOnDate || Date.now()).toISOString(),
        // description giờ là ghi chú người đọc được, KHÔNG còn là kho chứa JSON
        description: serviceFormData.description || `Kỳ phục vụ ${serviceFormData.title}`,
        notes: serviceFormData.description,
        status: "Approved",

        // Ghi thẳng vào cột thật
        vesselName: serviceFormData.title?.replace(/^Tàu\s+/i, '') || null,
        imoNumber: serviceFormData.imoNumber || null,
        callSign: serviceFormData.callSign || null,
        vesselFlag: serviceFormData.flagState || null,
        grossTonnage: toNumber(serviceFormData.grossTonnage),
        mainEnginePowerKw: toNumber(serviceFormData.enginePower),
        rankAtTime: serviceFormData.rank || null,
        signOnDate: serviceFormData.signOnDate ? new Date(serviceFormData.signOnDate).toISOString() : null,
        signOnPortName: serviceFormData.signOnPort || null,
        signOffDate: serviceFormData.signOffDate ? new Date(serviceFormData.signOffDate).toISOString() : null,
        signOffPortName: serviceFormData.signOffPort || null,
        conduct: serviceFormData.conduct || null,
        recordStatus: serviceFormData.signOffDate ? 'CLOSED' : 'OPEN',
        // Nhập tay: đánh dấu để phân biệt với mục sinh tự động từ phân công
        entrySource: 'MANUAL',
        isManuallyEdited: true,
      };

      if (editingService) {
        await maritimeService.logbook.updateEntry(crewMemberId, editingService.id, payload);
        toast.success('Cập nhật quá trình công tác thành công (Chờ đồng bộ)');
      } else {
        await maritimeService.logbook.createEntry(crewMemberId, payload);
        toast.success('Thêm quá trình công tác thành công (Chờ đồng bộ)');
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
    toast('Xóa quá trình đi biển này?', {
      action: {
        label: 'Xóa',
        onClick: async () => {
          try {
            await maritimeService.logbook.deleteEntry(crewMemberId, entryId);
            toast.success('Xóa quá trình đi biển thành công');
            loadData();
          } catch (err: any) {
            toast.error(err.message || 'Không thể xóa');
          }
        }
      }
    });
  };

  if (loading || !crew) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white/60 backdrop-blur-sm rounded-xl border border-gray-200/50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-3" />
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
      
      {/* Edge Sync Banner */}
      {pendingCount > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500 text-white rounded-lg shadow-md">
              <Cloud className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Đồng bộ Sổ thuyền viên (ISM Code Chapter 6.2)</h4>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Có {pendingCount} thay đổi (quá trình công tác, chữ ký, con dấu) chưa gửi lên Shore.
              </p>
            </div>
          </div>

          <PermissionGate permission="crew.update"><button
            onClick={handleSyncNow}
            disabled={syncing}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg transition-all shadow-md bg-blue-600 hover:bg-blue-700 text-white shadow-blue-500/20 active:scale-95"
          >
            {syncing ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CloudLightning className="w-3.5 h-3.5" />
            )}
            <span>Đồng bộ Sổ ({pendingCount})</span>
          </button></PermissionGate>
        </div>
      )}

      {/* DIGITAL CREW LOGBOOK MODERN DASHBOARD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 select-text">
        {/* Left 2 Columns: Bio-data & Issuing Authority */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Card 1: Hồ sơ số hóa (Digital Particulars) */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-6">
            {/* Card Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-slate-100 gap-2">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl">
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
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Cơ quan cấp & Ghi chú / Issuing Authority</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5 font-medium uppercase tracking-wider">ISSUING DETAILS & ADMINISTRATIVE REMARKS</p>
                </div>
              </div>
              
              <PermissionGate permission="crew.update"><button
                onClick={() => setIsEditingMeta(true)}
                className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 text-xs font-bold rounded-lg transition-all"
              >
                <Pencil className="w-3.5 h-3.5" />
                <span>Chỉnh sửa sổ / Edit Seaman's Book</span>
              </button></PermissionGate>
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
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl">
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
            <PermissionGate permission="crew.update"><button
              onClick={handleOpenAddService}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-all shadow-md active:scale-95"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Khai báo quá trình đầu tiên</span>
            </button></PermissionGate>
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
                          ? <span className="inline-flex px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold border border-blue-100">{details.rank}</span>
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
                          <div>
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold bg-orange-50 text-orange-700 border border-orange-100">
                              Chờ bờ duyệt / Pending
                            </span>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              Đề nghị {details.signOffDate ? new Date(details.signOffDate).toLocaleDateString('vi-VN') : ''}
                            </div>
                          </div>
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
                          {/* Đề nghị cho xuống tàu — chỉ khi kỳ còn mở và chưa gửi đề nghị nào */}
                          {(entry.recordStatus === 'OPEN' || entry.recordStatus === 'DRAFT') && !details.signOffDate && (
                            <PermissionGate permission="crew.update"><button
                              onClick={() => {
                                setSignOffTarget(entry);
                                setSignOffForm({
                                  signOffDate: new Date().toISOString().split('T')[0],
                                  portName: '', portCode: '', reason: '', requestedBy: '',
                                });
                              }}
                              className="px-2 py-1 rounded-lg bg-white hover:bg-orange-50 hover:text-orange-700 border border-slate-200 shadow-sm transition-colors text-[10px] font-semibold"
                              title="Đề nghị bờ cho thuyền viên này xuống tàu"
                            >
                              Đề nghị xuống tàu
                            </button></PermissionGate>
                          )}
                          {/* Bờ đã từ chối — sửa gửi lại, hoặc bỏ hẳn ý định */}
                          {entry.recordStatus === 'REJECTED' && (
                            <>
                              <PermissionGate permission="crew.update"><button
                                onClick={() => {
                                  setSignOffTarget(entry);
                                  setSignOffForm({
                                    signOffDate: entry.signOffDate
                                      ? new Date(entry.signOffDate).toISOString().split('T')[0]
                                      : new Date().toISOString().split('T')[0],
                                    portName: entry.signOffPortName ?? '',
                                    portCode: entry.signOffPortCode ?? '',
                                    reason: entry.signOffRequestReason ?? '',
                                    requestedBy: entry.signOffRequestedBy ?? '',
                                  });
                                }}
                                className="px-2 py-1 rounded-lg bg-white hover:bg-orange-50 hover:text-orange-700 border border-orange-200 shadow-sm text-[10px] font-semibold"
                                title="Sửa theo góp ý của bờ rồi gửi lại"
                              >
                                Gửi lại
                              </button></PermissionGate>
                              <PermissionGate permission="crew.update"><button
                                onClick={() => handleCancelSignOff(entry)}
                                className="px-2 py-1 rounded-lg bg-white hover:bg-slate-50 border border-slate-200 shadow-sm text-[10px] font-semibold text-slate-600"
                                title="Đồng ý huỷ việc cho xuống tàu"
                              >
                                Huỷ
                              </button></PermissionGate>
                            </>
                          )}
                          <PermissionGate permission="crew.update"><button
                            onClick={() => handleOpenEditService({ entry, details })}
                            className="p-1.5 rounded-lg bg-white hover:bg-blue-50 hover:text-blue-600 border border-slate-200 shadow-sm transition-colors"
                            title="Sửa quá trình"
                          >
                            <Pencil className="w-3 h-3" />
                          </button></PermissionGate>
                          <PermissionGate permission="crew.update"><button
                            onClick={() => handleDeleteService(entry.id)}
                            className="p-1.5 rounded-lg bg-white hover:bg-rose-50 hover:text-rose-600 border border-slate-200 shadow-sm transition-colors"
                            title="Xóa quá trình"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button></PermissionGate>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <PermissionGate permission="crew.update"><button
                onClick={handleOpenAddService}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs transition-all shadow-md active:scale-95 border border-blue-500/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Khai báo đi tàu / Declare Sea Service</span>
              </button></PermissionGate>
            </div>
          </div>
        )}
      </div>


      {/* METADATA EDIT MODAL */}
      {isEditingMeta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-gray-150 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 bg-blue-600 text-white rounded-t-2xl flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Chỉnh sửa Sổ Thuyền Viên 3D</h3>
                <p className="text-[10px] text-blue-100 mt-0.5">Dữ liệu sẽ tự động đồng bộ hóa lên hệ thống Shore (Bờ) và hồ sơ gốc</p>
              </div>
              <button onClick={() => setIsEditingMeta(false)} className="text-white hover:bg-white/10 p-1.5 rounded-lg"><X className="w-5 h-5" /></button>
            </div>
            
            {/* Tab selection in Modal */}
            <div className="flex border-b border-gray-200 bg-gray-50 px-4 pt-2">
              <button
                type="button"
                onClick={() => setMetaFormTab('trang1')}
                className={`px-4 py-2 text-xs font-bold border-b-2 transition-all ${metaFormTab === 'trang1' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                Trang 1: Lý lịch cá nhân
              </button>
              <button
                type="button"
                onClick={() => setMetaFormTab('trang2')}
                className={`px-4 py-2 text-xs font-bold border-b-2 transition-all ${metaFormTab === 'trang2' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                Trang 2: Cơ quan cấp
              </button>
              <button
                type="button"
                onClick={() => setMetaFormTab('trang3')}
                className={`px-4 py-2 text-xs font-bold border-b-2 transition-all ${metaFormTab === 'trang3' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
              >
                Trang 3: Liên hệ khẩn cấp
              </button>
              <button
                type="button"
                onClick={() => setMetaFormTab('trang4')}
                className={`px-4 py-2 text-xs font-bold border-b-2 transition-all ${metaFormTab === 'trang4' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 font-mono font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Họ và tên (Full Name) *</label>
                      <input
                        type="text"
                        value={bookMeta.fullName}
                        onChange={(e) => setBookMeta({ ...bookMeta, fullName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 uppercase font-bold"
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Giới tính (Sex)</label>
                      <select
                        value={bookMeta.sex}
                        onChange={(e) => setBookMeta({ ...bookMeta, sex: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Quốc tịch (Nationality)</label>
                      <input
                        type="text"
                        value={bookMeta.nationality}
                        onChange={(e) => setBookMeta({ ...bookMeta, nationality: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Màu mắt (Eyes Color)</label>
                      <input
                        type="text"
                        value={bookMeta.eyeColor}
                        onChange={(e) => setBookMeta({ ...bookMeta, eyeColor: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Đặc điểm nhận dạng (Marks)</label>
                    <input
                      type="text"
                      value={bookMeta.distinguishingMarks}
                      onChange={(e) => setBookMeta({ ...bookMeta, distinguishingMarks: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 uppercase font-bold"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Nơi cấp (Place of Issue)</label>
                      <input
                        type="text"
                        value={bookMeta.placeOfIssue}
                        onChange={(e) => setBookMeta({ ...bookMeta, placeOfIssue: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Ngày cấp (Date of Issue)</label>
                      <input
                        type="date"
                        value={bookMeta.issueDate}
                        onChange={(e) => setBookMeta({ ...bookMeta, issueDate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Ngày hết hạn (Date of Expiry)</label>
                      <input
                        type="date"
                        value={bookMeta.expiryDate}
                        onChange={(e) => setBookMeta({ ...bookMeta, expiryDate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Chức vụ người ký (Signer Title)</label>
                      <input
                        type="text"
                        value={bookMeta.authoritySignerTitle}
                        onChange={(e) => setBookMeta({ ...bookMeta, authoritySignerTitle: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {metaFormTab === 'trang3' && (
                <div className="space-y-4">
                  <p className="text-[10px] text-yellow-700 bg-yellow-50 border border-yellow-250 p-2.5 rounded-lg italic">
                    * Thông tin này sẽ tự động cập nhật vào mục "Người liên hệ khẩn cấp" trong hồ sơ nhân viên để thuyền trưởng liên lạc khi có sự cố khẩn cấp trên biển.
                  </p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Họ tên người liên hệ khẩn cấp / Next of Kin Name *</label>
                      <input
                        type="text"
                        value={bookMeta.nokName}
                        onChange={(e) => setBookMeta({ ...bookMeta, nokName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 uppercase font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Mối quan hệ / Relationship *</label>
                      <input
                        type="text"
                        placeholder="Vợ, Chồng, Bố, Mẹ, Con / Wife, Husband, Father..."
                        value={bookMeta.nokRelation}
                        onChange={(e) => setBookMeta({ ...bookMeta, nokRelation: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Số điện thoại khẩn cấp / Emergency Phone *</label>
                    <input
                      type="text"
                      value={bookMeta.nokPhone}
                      onChange={(e) => setBookMeta({ ...bookMeta, nokPhone: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Địa chỉ người liên hệ / Contact Address *</label>
                    <textarea
                      value={bookMeta.nokAddress}
                      onChange={(e) => setBookMeta({ ...bookMeta, nokAddress: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 resize-none font-medium"
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
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 resize-none font-serif text-sm italic leading-relaxed text-blue-950 bg-stone-50"
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
                  <PermissionGate permission={'crew.update'}><button
                    type="submit"
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow flex items-center gap-1.5 text-[11px]"
                    disabled={savingMeta}
                  >
                    {savingMeta ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>Lưu Sổ Thuyền Viên</span>
                  </button></PermissionGate>
                </div>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* SEA SERVICE CRUD MODAL */}
      {isServiceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl border border-gray-150 flex flex-col max-h-[90vh]">
            
            <div className="px-6 py-4 border-b border-gray-100 bg-blue-600 text-white rounded-t-2xl flex items-center justify-between">
              <h3 className="text-base font-bold text-white">
                {editingService ? 'Cập nhật Quá trình công tác / Update Sea Service' : 'Khai báo Quá trình đi biển (Record of Sea Service)'}
              </h3>
              <button onClick={() => setIsServiceModalOpen(false)} className="text-white hover:bg-white/10 p-1.5 rounded-lg"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleSaveService} className="p-6 overflow-y-auto space-y-4 text-xs">
              
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Tên tàu biển / Vessel Name *</label>
                  <input
                    type="text"
                    placeholder="VD: Tàu MV VINALINES VIGOR"
                    value={serviceFormData.title}
                    onChange={(e) => setServiceFormData({ ...serviceFormData, title: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 uppercase font-bold"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Hô hiệu / Call Sign</label>
                  <input
                    type="text"
                    placeholder="VD: 3WKD9"
                    value={serviceFormData.callSign}
                    onChange={(e) => setServiceFormData({ ...serviceFormData, callSign: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 uppercase font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Số IMO tàu / IMO Number</label>
                  <input
                    type="text"
                    placeholder="VD: IMO 9568762"
                    value={serviceFormData.imoNumber}
                    onChange={(e) => setServiceFormData({ ...serviceFormData, imoNumber: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Quốc tịch tàu / Vessel Flag</label>
                  <input
                    type="text"
                    value={serviceFormData.flagState}
                    onChange={(e) => setServiceFormData({ ...serviceFormData, flagState: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500 uppercase"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Tổng dung tích / GT</label>
                  <input
                    type="text"
                    placeholder="VD: 20,854 GT"
                    value={serviceFormData.grossTonnage}
                    onChange={(e) => setServiceFormData({ ...serviceFormData, grossTonnage: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Công suất máy chính / Engine Power kW</label>
                  <input
                    type="text"
                    placeholder="VD: 6,480 kW"
                    value={serviceFormData.enginePower}
                    onChange={(e) => setServiceFormData({ ...serviceFormData, enginePower: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Chức danh đảm nhiệm / Capacity *</label>
                  <input
                    type="text"
                    placeholder="VD: Thủy thủ trực ca / OS"
                    value={serviceFormData.rank}
                    onChange={(e) => setServiceFormData({ ...serviceFormData, rank: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <span className="font-bold text-blue-700 block mb-2">Thông tin Sign-on / Boarding Details</span>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Ngày Sign-on / Sign-on Date *</label>
                    <input
                      type="date"
                      value={serviceFormData.signOnDate}
                      onChange={(e) => setServiceFormData({ ...serviceFormData, signOnDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <PortCombobox
                      label="Cảng Sign-on / Sign-on Port"
                      required
                      portName={serviceFormData.signOnPort ?? ''}
                      portCode=""
                      onChange={(name) => setServiceFormData({ ...serviceFormData, signOnPort: name })}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <span className="font-bold text-red-700 block mb-2">Thông tin Sign-off / Disembarkation Details (Leave blank if currently onboard)</span>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Ngày Sign-off / Sign-off Date</label>
                    <input
                      type="date"
                      value={serviceFormData.signOffDate}
                      onChange={(e) => setServiceFormData({ ...serviceFormData, signOffDate: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <PortCombobox
                      label="Cảng Sign-off / Sign-off Port"
                      portName={serviceFormData.signOffPort ?? ''}
                      portCode=""
                      onChange={(name) => setServiceFormData({ ...serviceFormData, signOffPort: name })}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-1">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Nhận xét năng lực / Conduct</label>
                    <select
                      value={serviceFormData.conduct}
                      onChange={(e) => setServiceFormData({ ...serviceFormData, conduct: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
                    >
                      <option value="Xuất sắc / Excellent">Xuất sắc / Excellent</option>
                      <option value="Tốt / Good">Tốt / Good</option>
                      <option value="Khá / Fair">Khá / Fair</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Ghi chú hành trình / Remarks</label>
                    <input
                      type="text"
                      placeholder="VD: Hoàn thành tốt hợp đồng đi ca / Thuyền trưởng đánh giá cao"
                      value={serviceFormData.description}
                      onChange={(e) => setServiceFormData({ ...serviceFormData, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
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
                <PermissionGate permission={'crew.update'}><button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow flex items-center gap-1.5"
                  disabled={submittingService}
                >
                  {submittingService ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                  <span>Lưu quá trình</span>
                </button></PermissionGate>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* Đề nghị cho xuống tàu — gửi lên bờ chờ duyệt */}
      {signOffTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setSignOffTarget(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
              <h2 className="font-bold text-slate-800">
                {signOffTarget.recordStatus === 'REJECTED' ? 'Gửi lại đề nghị xuống tàu' : 'Đề nghị cho xuống tàu'}
              </h2>
              <button onClick={() => setSignOffTarget(null)} className="p-1 rounded hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 text-sm">
              <div className="font-semibold text-slate-800">{signOffTarget.vesselName ?? signOffTarget.title}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Lên tàu {signOffTarget.signOnDate ? new Date(signOffTarget.signOnDate).toLocaleDateString('vi-VN') : '—'}
                {signOffTarget.rankAtTime && ` · ${signOffTarget.rankAtTime}`}
              </div>
            </div>

            {signOffTarget.recordStatus === 'REJECTED' && signOffTarget.rejectionReason && (
              <div className="mx-5 mt-3 rounded bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                <div className="font-semibold text-xs mb-0.5">Bờ đã từ chối vì:</div>
                {signOffTarget.rejectionReason}
              </div>
            )}

            <form onSubmit={handleSubmitSignOffRequest} className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">Ngày rời tàu <span className="text-red-500">*</span></span>
                  <input type="date" required value={signOffForm.signOffDate}
                    onChange={e => setSignOffForm({ ...signOffForm, signOffDate: e.target.value })}
                    className="mt-1 w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm" />
                </label>
                <label className="block">
                  <span className="text-xs font-semibold text-slate-600">Người đề nghị</span>
                  <input value={signOffForm.requestedBy}
                    onChange={e => setSignOffForm({ ...signOffForm, requestedBy: e.target.value })}
                    placeholder="Thuyền trưởng"
                    className="mt-1 w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm" />
                </label>
              </div>

              <PortCombobox
                label="Cảng rời tàu"
                portName={signOffForm.portName}
                portCode={signOffForm.portCode}
                onChange={(name, code) => setSignOffForm({ ...signOffForm, portName: name, portCode: code })}
              />

              <label className="block">
                <span className="text-xs font-semibold text-slate-600">Lý do <span className="text-red-500">*</span></span>
                <textarea required rows={3} value={signOffForm.reason}
                  onChange={e => setSignOffForm({ ...signOffForm, reason: e.target.value })}
                  placeholder="Bờ cần biết vì sao để quyết định — VD: hết hợp đồng, lý do sức khoẻ..."
                  className="mt-1 w-full border border-slate-300 rounded px-2.5 py-1.5 text-sm" />
              </label>

              <div className="rounded bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-800">
                Đề nghị sẽ được gửi lên bờ chờ duyệt. Trong lúc chờ, thuyền viên
                <strong> vẫn đang phục vụ bình thường</strong> — chỉ khi bờ duyệt thì kỳ phục vụ mới đóng lại.
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={() => setSignOffTarget(null)}
                  className="px-3.5 py-1.5 text-sm rounded border border-slate-300 hover:bg-slate-50">Hủy</button>
                <PermissionGate permission={'crew.update'}><button type="submit" disabled={submittingSignOff || !signOffForm.reason.trim()}
                  className="px-3.5 py-1.5 text-sm rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 inline-flex items-center gap-1.5">
                  {submittingSignOff && <RefreshCw className="w-3 h-3 animate-spin" />}
                  {signOffTarget.recordStatus === 'REJECTED' ? 'Gửi lại' : 'Gửi đề nghị lên bờ'}
                </button></PermissionGate>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
