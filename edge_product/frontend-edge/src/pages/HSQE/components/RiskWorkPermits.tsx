import { useState, useEffect } from 'react';
import { 
  Plus, Activity, ArrowRight, ArrowLeft, ShieldAlert, ShieldCheck, Trash2, Eye,
  Lock, Sparkles, Award
} from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/services/api.client';

// Interfaces
interface RiskStep {
  id: string;
  stepDescription: string;
  hazards: string;
  initialL: number; // 1-5
  initialS: number; // 1-5
  initialScore: number;
  mitigations: string;
  residualL: number;
  residualS: number;
  residualScore: number;
}

interface RiskAssessmentReport {
  id: string;
  code: string;
  jobTitle: string;
  department: 'Deck' | 'Engine' | 'Galley';
  pic: string;
  date: string;
  steps: RiskStep[];
}

interface WorkPermit {
  id: string;
  code: string;
  type: 'Hot' | 'Enclosed' | 'Aloft' | 'Cold';
  title: string;
  vessel: string;
  location: string;
  status: 'Active' | 'Suspended' | 'Closed';
  durationHours: number;
  startTime: string;
  riskAssessmentId?: string;
  gasO2: number;
  gasLEL: number;
  gasCO: number;
  gasH2S: number;
  precautions: {
    label: string;
    checked: boolean;
    value?: string;
  }[];
  preparedBy?: string;
  chiefOfficerSigned: boolean;
  captainApproved: boolean;
  digitalSignatures: { name: string; rank: string; timestamp: string; sigCode: string }[];
}

export function RiskWorkPermits() {
  const [risks, setRisks] = useState<RiskAssessmentReport[]>([]);
  const [permits, setPermits] = useState<WorkPermit[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);

  const [selectedRiskId, setSelectedRiskId] = useState<string>(() => localStorage.getItem('hsqe_selected_risk_id') || 'risk-1');
  const [selectedPermitId, setSelectedPermitId] = useState<string>(() => localStorage.getItem('hsqe_selected_permit_id') || 'perm-1');
  const [activeSubTab, setActiveSubTab] = useState<'permits' | 'risks'>(() => (localStorage.getItem('hsqe_active_subtab') as 'permits' | 'risks') || 'permits');
  
  const [viewMode, setViewMode] = useState<'list' | 'create_risk' | 'create_permit'>('list');
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);

  const isNewRiskModalOpen = false;
  const isNewPermitModalOpen = false;
  const setIsNewRiskModalOpen = (_val: boolean) => {};
  const setIsNewPermitModalOpen = (_val: boolean) => {};

  // New Risk Form State
  const [riskTitle, setRiskTitle] = useState('');
  const [riskDept, setRiskDept] = useState<'Deck' | 'Engine' | 'Galley'>('Engine');
  const [riskPic, setRiskPic] = useState('Máy trưởng Lê Văn C');
  const [riskSteps, setRiskSteps] = useState<RiskStep[]>([
    {
      id: 'step-1',
      stepDescription: '',
      hazards: '',
      initialL: 3,
      initialS: 3,
      initialScore: 9,
      mitigations: '',
      residualL: 2,
      residualS: 2,
      residualScore: 4
    }
  ]);

  // New Permit Form State
  const [permitType, setPermitType] = useState<'Hot' | 'Enclosed' | 'Aloft' | 'Cold'>('Enclosed');
  const [permitTitle, setPermitTitle] = useState('');
  const [permitVessel, setPermitVessel] = useState('M/V Green Star');
  const [permitLocation, setPermitLocation] = useState('');
  const [permitDuration, setPermitDuration] = useState(4);
  const [permitRiskId, setPermitRiskId] = useState('');
  const [permitPreparedBy, setPermitPreparedBy] = useState('Đại phó Trần Văn D');
  
  // Gas test inputs
  const [gasO2, setGasO2] = useState<number>(20.9);
  const [gasLEL, setGasLEL] = useState<number>(0.0);
  const [gasCO, setGasCO] = useState<number>(0);
  const [gasH2S, setGasH2S] = useState<number>(0);

  // Precautions checkboxes simulation
  const [precautionList, setPrecautionList] = useState<{ label: string; checked: boolean }[]>([]);

  // PIN Digital Signature State (matching SMS Dashboard pattern)
  const [permitSigningName, setPermitSigningName] = useState('Đại phó Trần Văn D');
  const [permitSigningRank, setPermitSigningRank] = useState('Chief Officer');
  const [permitSigningPin, setPermitSigningPin] = useState('');
  const [permitSignStep, setPermitSignStep] = useState<'draft' | 'co_signed' | 'approved'>('draft');
  const [permitCreatedId, setPermitCreatedId] = useState<string | null>(null);
  const [permitSignatures, setPermitSignatures] = useState<{ name: string; rank: string; timestamp: string; sigCode: string }[]>([]);

  const fetchRisksAndPermits = async () => {
    setLoading(true);
    try {
      // 1. Fetch risks
      const risksData = await apiClient.get<any[]>('/hsqe/risks');

      // 2. Fetch permits
      const permitsData = await apiClient.get<any[]>('/hsqe/permits');

      const mappedRisks: RiskAssessmentReport[] = risksData.map((r: any) => ({
        id: r.id,
        code: r.assessmentCode,
        jobTitle: r.jobTitle,
        department: r.department,
        pic: r.pic,
        date: r.assessmentDate ? r.assessmentDate.split('T')[0] : '',
        steps: JSON.parse(r.stepsJson || '[]')
      }));

      const mappedPermits: WorkPermit[] = permitsData.map((p: any) => {
        const precautionsList = JSON.parse(p.precautionsJson || '[]');
        let preparedBy = '';
        let cleanPrecautions = precautionsList;
        if (Array.isArray(precautionsList)) {
          cleanPrecautions = precautionsList.filter((item: any) => item.label !== '__prepared_by__');
          const preparedByItem = precautionsList.find((item: any) => item.label === '__prepared_by__');
          preparedBy = preparedByItem ? (preparedByItem.value || preparedByItem.label) : '';
        }
        return {
          id: p.id,
          code: p.permitCode,
          type: p.permitType,
          title: p.title,
          vessel: p.vessel,
          location: p.location,
          status: p.status,
          durationHours: p.durationHours,
          startTime: p.startTime ? p.startTime.slice(0, 16) : '',
          riskAssessmentId: p.riskAssessmentId || undefined,
          gasO2: p.gasTestO2,
          gasLEL: p.gasTestLEL,
          gasCO: p.gasTestCO,
          gasH2S: p.gasTestH2S,
          precautions: cleanPrecautions,
          preparedBy: preparedBy,
          chiefOfficerSigned: p.chiefOfficerSigned,
          captainApproved: p.captainApproved,
          digitalSignatures: (() => {
            try { return JSON.parse(p.digitalSignatures || '[]'); } catch { return []; }
          })()
        };
      });

      setRisks(mappedRisks);
      setPermits(mappedPermits);
    } catch (err) {
      toast.error('Không thể tải thông tin rủi ro & cấp phép từ API');
    } finally {
      setLoading(false);
    }
  };

  const handleSeedData = async () => {
    setIsSeeding(true);
    try {
      await apiClient.post('/hsqe/seed', {});
      toast.success('Khởi tạo dữ liệu mẫu HSQE thành công!');
      await fetchRisksAndPermits();
    } catch (err) {
      toast.error('Không thể khởi tạo dữ liệu mẫu');
    } finally {
      setIsSeeding(false);
    }
  };

  useEffect(() => {
    fetchRisksAndPermits();
  }, []);

  useEffect(() => {
    localStorage.setItem('hsqe_selected_risk_id', selectedRiskId);
  }, [selectedRiskId]);

  useEffect(() => {
    localStorage.setItem('hsqe_selected_permit_id', selectedPermitId);
  }, [selectedPermitId]);

  useEffect(() => {
    localStorage.setItem('hsqe_active_subtab', activeSubTab);
  }, [activeSubTab]);

  useEffect(() => {
    if (permitRiskId) {
      const linkedRisk = risks.find(r => r.id === permitRiskId);
      if (linkedRisk && linkedRisk.pic) {
        setPermitPreparedBy(linkedRisk.pic);
      }
    }
  }, [permitRiskId, risks]);

  const selectedRisk = risks.find(r => r.id === selectedRiskId) || risks[0];
  const selectedPermit = permits.find(p => p.id === selectedPermitId) || permits[0];

  // Set default precautions when permit type changes in form
  useEffect(() => {
    const list = 
      permitType === 'Enclosed' ? [
        { label: 'Đã thông gió cưỡng bức hầm hàng/không gian kín liên tục', checked: false },
        { label: 'EEBD và bình thở cứu hộ đã sẵn sàng tại miệng lối vào', checked: false },
        { label: 'Bố trí người trực gác (Watchkeeper) có bảng theo dõi tên', checked: false },
        { label: 'Thiết bị đo khí cá nhân đã hiệu chuẩn đạt yêu cầu', checked: false }
      ] :
      permitType === 'Hot' ? [
        { label: 'Dọn sạch vật tư dễ cháy trong bán kính 10 mét', checked: false },
        { label: 'Phủ bạt chống cháy lên cáp điện, đường ống mềm', checked: false },
        { label: 'Bố trí người cảnh giới cứu hỏa mang sẵn bình chữa cháy', checked: false },
        { label: 'Kiểm tra máy hàn và dây cáp nối đất an toàn buồng vỏ', checked: false }
      ] :
      permitType === 'Aloft' ? [
        { label: 'Đeo đai an toàn toàn thân có dây chống rơi độc lập', checked: false },
        { label: 'Đặt biển cảnh báo khu vực rơi đồ phía dưới boong', checked: false },
        { label: 'Kiểm tra giàn giáo hoặc rổ nâng cẩu đã được thử tải', checked: false }
      ] : [
        { label: 'Cô lập điện và áp dụng quy tắc khóa thẻ (LOTO)', checked: false },
        { label: 'Xả áp suất đường ống hoàn toàn', checked: false }
      ];
    setPrecautionList(list);
  }, [permitType]);

  // Gas safety verification logic (mirroring backend validator)
  const isGasSafe = (o2: number, lel: number, co: number, h2s: number) => {
    return o2 >= 20.9 && o2 <= 22.0 && lel < 1 && co < 25 && h2s === 0;
  };

  const gasSafetyStatus = isGasSafe(gasO2, gasLEL, gasCO, gasH2S);

  // Compute Risk level color code
  const getRiskLevel = (score: number) => {
    if (score >= 15) return { text: 'Nguy cơ Cao (Chặn)', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 font-extrabold border-red-200' };
    if (score >= 5) return { text: 'Nguy cơ Trung bình (Kiểm soát)', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 font-bold border-amber-200' };
    return { text: 'Chấp nhận được (Thấp)', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 font-medium border-green-200' };
  };

  const handleScoreChange = (stepIdx: number, matrixType: 'initial' | 'residual', field: 'L' | 'S', val: number) => {
    setRiskSteps(prev => prev.map((step, idx) => {
      if (idx !== stepIdx) return step;

      const nextStep = { ...step };
      if (matrixType === 'initial') {
        if (field === 'L') nextStep.initialL = val;
        else nextStep.initialS = val;
        nextStep.initialScore = nextStep.initialL * nextStep.initialS;
      } else {
        if (field === 'L') nextStep.residualL = val;
        else nextStep.residualS = val;
        nextStep.residualScore = nextStep.residualL * nextStep.residualS;
      }
      return nextStep;
    }));
  };

  const handleAddRiskStep = () => {
    const newStep: RiskStep = {
      id: `step-${Date.now()}-${riskSteps.length}`,
      stepDescription: '',
      hazards: '',
      initialL: 3,
      initialS: 3,
      initialScore: 9,
      mitigations: '',
      residualL: 2,
      residualS: 2,
      residualScore: 4
    };
    setRiskSteps(prev => [...prev, newStep]);
  };

  const handleSaveRiskAssessment = async () => {
    if (!riskTitle.trim()) {
      toast.error('Vui lòng nhập tên công việc!');
      return;
    }

    if (riskSteps.some(s => !s.stepDescription.trim() || !s.hazards.trim())) {
      toast.error('Vui lòng điền đủ Mô tả bước và Mối nguy hại!');
      return;
    }

    try {
      const created = await apiClient.post<any>('/hsqe/risks', {
        jobTitle: riskTitle,
        department: riskDept,
        pic: riskPic,
        stepsJson: JSON.stringify(riskSteps)
      });

      toast.success(`Đã phát hành bản đánh giá rủi ro ${created.assessmentCode} và JSA TL-32-01.`);
      
      setViewMode('list');
      setRiskTitle('');
      setRiskSteps([
        {
          id: 'step-1',
          stepDescription: '',
          hazards: '',
          initialL: 3,
          initialS: 3,
          initialScore: 9,
          mitigations: '',
          residualL: 2,
          residualS: 2,
          residualScore: 4
        }
      ]);
      await fetchRisksAndPermits();
      setSelectedRiskId(created.id);
    } catch (err) {
      toast.error('Không thể lưu bản đánh giá rủi ro');
    }
  };

  const handleCreatePermit = async () => {
    if (!permitTitle.trim() || !permitLocation.trim()) {
      toast.error('Vui lòng nhập tiêu đề giấy phép và vị trí làm việc!');
      return;
    }

    if (precautionList.some(p => !p.checked)) {
      toast.error('BẮT BUỘC: Thuyền viên phải kiểm soát check đầy đủ toàn bộ biện pháp phòng ngừa phòng chống tai nạn!');
      return;
    }

    if (permitType === 'Enclosed' && !gasSafetyStatus) {
      toast.error('⚠️ Nồng độ khí chưa an toàn! Không thể cấp giấy phép vào không gian kín.');
      return;
    }

    try {
      // 1. Create Permit
      const finalPrecautions = [
        ...precautionList,
        { label: '__prepared_by__', value: permitPreparedBy, checked: true }
      ];

      const created = await apiClient.post<any>('/hsqe/permits', {
        permitType,
        title: permitTitle,
        vessel: permitVessel,
        location: permitLocation,
        durationHours: permitDuration,
        riskAssessmentId: permitRiskId || null,
        precautionsJson: JSON.stringify(finalPrecautions)
      });

      // 2. Perform Gas Test
      await apiClient.post(`/hsqe/permits/${created.id}/gas-test`, {
        gasTestO2: gasO2,
        gasTestLEL: gasLEL,
        gasTestCO: gasCO,
        gasTestH2S: gasH2S
      });

      // 3. Set permit created, ready for PIN signing
      setPermitCreatedId(created.id);
      setPermitSignStep('draft');
      setPermitSignatures([]);
      setPermitSigningPin('');
      toast.success(`Đã tạo Giấy phép ${created.permitCode}. Vui lòng ký duyệt bằng mã PIN.`);
    } catch (err) {
      toast.error('Không thể tạo giấy phép nguy hiểm');
    }
  };

  const handlePermitSign = async () => {
    if (!permitCreatedId) return;

    if (!permitSigningName.trim() || !permitSigningRank.trim() || !permitSigningPin.trim()) {
      toast.error('Vui lòng điền tên, chức danh và mã PIN ký số.');
      return;
    }

    try {
      const res = await apiClient.post<any>(`/hsqe/permits/${permitCreatedId}/sign`, {
        role: 'ChiefOfficer',
        pin: permitSigningPin,
        name: permitSigningName,
        rank: permitSigningRank
      });

      const sigs = (() => { try { return JSON.parse(res.digitalSignatures || '[]'); } catch { return []; } })();
      setPermitSignatures(sigs);
      setPermitSignStep('co_signed');
      setPermitSigningPin('');
      setPermitSigningName('Thuyền trưởng');
      setPermitSigningRank('Captain (Master)');
      toast.success('Đại phó đã ký duyệt thành công! Chờ Thuyền trưởng phê duyệt.');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Mã PIN không chính xác hoặc lỗi ký số');
    }
  };

  const handlePermitCaptainApprove = async () => {
    if (!permitCreatedId) return;

    if (!permitSigningPin.trim()) {
      toast.error('Vui lòng nhập mã PIN Thuyền trưởng.');
      return;
    }

    try {
      const res = await apiClient.post<any>(`/hsqe/permits/${permitCreatedId}/sign`, {
        role: 'Captain',
        pin: permitSigningPin,
        name: permitSigningName,
        rank: permitSigningRank
      });

      const sigs = (() => { try { return JSON.parse(res.digitalSignatures || '[]'); } catch { return []; } })();
      setPermitSignatures(sigs);
      setPermitSignStep('approved');
      setPermitSigningPin('');
      toast.success('Thuyền trưởng đã phê duyệt cấp giấy phép thành công!');

      // Reset and go back to list
      setTimeout(async () => {
        setViewMode('list');
        setPermitTitle('');
        setPermitLocation('');
        setPermitCreatedId(null);
        setPermitSignStep('draft');
        setPermitSignatures([]);
        await fetchRisksAndPermits();
      }, 1500);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'PIN Thuyền trưởng không đúng (Mặc định: 1111)');
    }
  };

  const togglePrecaution = (index: number) => {
    setPrecautionList(prev => prev.map((item, idx) => {
      if (idx !== index) return item;
      return { ...item, checked: !item.checked };
    }));
  };

  const closePermit = async (id: string) => {
    try {
      await apiClient.post(`/hsqe/permits/${id}/close`, {});
      toast.info('Đã đóng giấy phép làm việc an toàn.');
      await fetchRisksAndPermits();
    } catch (err) {
      toast.error('Không thể đóng giấy phép');
    }
  };

  const deletePermit = async (id: string) => {
    toast('Xóa giấy phép làm việc này khỏi danh sách?', {
      action: {
        label: 'Xóa',
        onClick: async () => {
          try {
            await apiClient.delete(`/hsqe/permits/${id}`);
            toast.success('Đã xóa giấy phép.');
            await fetchRisksAndPermits();
            setSelectedPermitId('perm-1');
          } catch (err) {
            toast.error('Không thể xóa giấy phép');
          }
        }
      }
    });
  };

  const deleteRisk = async (id: string) => {
    toast('Xóa bản đánh giá rủi ro và JSA này?', {
      action: {
        label: 'Xóa',
        onClick: async () => {
          try {
            await apiClient.delete(`/hsqe/risks/${id}`);
            toast.success('Đã xóa đánh giá rủi ro.');
            await fetchRisksAndPermits();
            setSelectedRiskId('risk-1');
          } catch (err) {
            toast.error('Không thể xóa đánh giá rủi ro');
          }
        }
      }
    });
  };

  if (loading) {
    return (
      <div className="w-full h-96 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400">
        <Activity className="w-8 h-8 animate-spin text-blue-500 mb-2" />
        <span className="text-sm font-semibold">Đang tải thông tin đánh giá rủi ro & cấp phép...</span>
      </div>
    );
  }

  if (risks.length === 0 || permits.length === 0) {
    return (
      <div className="operations-surface w-full min-h-[500px] flex flex-col items-center justify-center p-8 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-full text-blue-600 dark:text-blue-400 mb-4 animate-pulse">
          <Activity className="w-12 h-12" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Chưa có thông tin đánh giá rủi ro & cấp phép</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md text-center mb-6">
          Hệ thống Đánh giá Rủi ro & Giấy phép làm việc (Risk & Work Permits) chưa có dữ liệu nào trong cơ sở dữ liệu.
        </p>
        <div className="flex flex-wrap gap-4 justify-center">
          <button
            onClick={handleSeedData}
            disabled={isSeeding}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition flex items-center gap-2 shadow-sm disabled:opacity-50"
          >
            {isSeeding ? <Activity className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Khởi tạo dữ liệu mẫu
          </button>
          <button
            onClick={() => setViewMode('create_risk')}
            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-xl font-semibold transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Tạo Đánh giá rủi ro mới
          </button>
          <button
            onClick={() => setViewMode('create_permit')}
            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-xl font-semibold transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Cấp Giấy phép mới
          </button>
        </div>
      </div>
    );
  }

  if (viewMode === 'create_risk') {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-200">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setViewMode('list')}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Lập Đánh giá Rủi ro (TL-24-01) & Phân tích JSA (TL-32-01)
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Lập ma trận rủi ro 5x5: Lập danh sách công việc, xác định các bước mối nguy ban đầu và biện pháp giảm thiểu để đưa rủi ro về mức chấp nhận được.
              </p>
            </div>
          </div>
          <button
            onClick={() => setViewMode('list')}
            className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-xs font-bold transition"
          >
            Quay lại danh sách
          </button>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Tên công việc chính</label>
              <input 
                type="text" 
                value={riskTitle}
                onChange={(e) => setRiskTitle(e.target.value)}
                placeholder="Ví dụ: Sơn mạn tàu ngoài neo đậu..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none"
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Bộ phận phụ trách</label>
              <select
                value={riskDept}
                onChange={(e) => setRiskDept(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none"
              >
                <option value="Deck">Bộ phận boong (Deck)</option>
                <option value="Engine">Bộ phận máy (Engine)</option>
                <option value="Galley">Bộ phận phục vụ (Galley)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Người giám sát chính (PIC)</label>
              <input 
                type="text" 
                value={riskPic}
                onChange={(e) => setRiskPic(e.target.value)}
                placeholder="Ví dụ: Máy trưởng Lê Văn C"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none"
              />
            </div>
          </div>

          <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-bold text-slate-800 dark:text-slate-200">Các bước phân tích an toàn (JSA)</span>
              <button
                onClick={handleAddRiskStep}
                className="px-3 py-1.5 rounded-lg border border-slate-250 dark:border-slate-700 text-xs font-bold bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-850 transition"
              >
                + Thêm bước JSA
              </button>
            </div>

            <div className="space-y-4">
              {riskSteps.map((step, idx) => (
                <div key={idx} className="p-5 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex justify-between items-center">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-350">Bước số {idx + 1}:</p>
                    {riskSteps.length > 1 && (
                      <button 
                        onClick={() => setRiskSteps(prev => prev.filter((_, i) => i !== idx))}
                        className="text-[10px] text-red-500 hover:underline"
                      >
                        Xóa bước này
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-1.5">Mô tả bước công việc</label>
                      <input
                        type="text"
                        value={step.stepDescription}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRiskSteps(prev => prev.map((s, i) => i === idx ? { ...s, stepDescription: val } : s));
                        }}
                        placeholder="Ví dụ: Lắp ráp giàn giáo dây treo ngoài mạn..."
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white dark:bg-slate-900 text-xs focus:outline-none"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-1.5">Mối nguy hiểm tiềm tàng</label>
                      <input
                        type="text"
                        value={step.hazards}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRiskSteps(prev => prev.map((s, i) => i === idx ? { ...s, hazards: val } : s));
                        }}
                        placeholder="Ví dụ: Dây treo mòn đứt gây rơi ngã thuyền viên xuống biển..."
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white dark:bg-slate-900 text-xs focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-200 dark:border-slate-800 pt-3">
                    <div>
                      <span className="block text-[10px] font-bold text-slate-400 mb-2">Đánh giá ban đầu (Initial Risk):</span>
                      <div className="flex gap-4 text-xs">
                        <label className="flex items-center gap-1">
                          <span>Khả năng (L:1-5)</span>
                          <select
                            value={step.initialL}
                            onChange={(e) => handleScoreChange(idx, 'initial', 'L', Number(e.target.value))}
                            className="border rounded px-1.5 py-0.5 bg-white dark:bg-slate-800 text-xs"
                          >
                            {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </label>
                        <label className="flex items-center gap-1">
                          <span>Hậu quả (S:1-5)</span>
                          <select
                            value={step.initialS}
                            onChange={(e) => handleScoreChange(idx, 'initial', 'S', Number(e.target.value))}
                            className="border rounded px-1.5 py-0.5 bg-white dark:bg-slate-800 text-xs"
                          >
                            {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </label>
                        <span className="font-bold flex items-center">Điểm rủi ro: {step.initialScore}</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-1.5">Biện pháp giảm thiểu rủi ro đề xuất</label>
                      <input
                        type="text"
                        value={step.mitigations}
                        onChange={(e) => {
                          const val = e.target.value;
                          setRiskSteps(prev => prev.map((s, i) => i === idx ? { ...s, mitigations: val } : s));
                        }}
                        placeholder="Ví dụ: Sử dụng đai an toàn kép cứu hộ độc lập, mặc áo phao cứu sinh..."
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white dark:bg-slate-900 text-xs focus:outline-none"
                      />
                      
                      <div className="flex gap-4 text-xs mt-3">
                        <label className="flex items-center gap-1">
                          <span>Residual L:</span>
                          <select
                            value={step.residualL}
                            onChange={(e) => handleScoreChange(idx, 'residual', 'L', Number(e.target.value))}
                            className="border rounded px-1.5 py-0.5 bg-white dark:bg-slate-800 text-xs"
                          >
                            {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </label>
                        <label className="flex items-center gap-1">
                          <span>Residual S:</span>
                          <select
                            value={step.residualS}
                            onChange={(e) => handleScoreChange(idx, 'residual', 'S', Number(e.target.value))}
                            className="border rounded px-1.5 py-0.5 bg-white dark:bg-slate-800 text-xs"
                          >
                            {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}
                          </select>
                        </label>
                        <span className="font-bold flex items-center">Residual Score: {step.residualScore}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-700 pt-6">
            <button
              onClick={() => setViewMode('list')}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 transition"
            >
              Hủy bỏ
            </button>
            <button
              onClick={handleSaveRiskAssessment}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition"
            >
              Phê duyệt & Lưu Đánh giá
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (viewMode === 'create_permit') {
    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-200">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setViewMode('list')}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white transition"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                Đăng ký Giấy phép làm việc Nguy hiểm điện tử (TL-13)
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Lưu ý: Mọi khai báo nồng độ khí gas phải được đo bằng thiết bị hiệu chuẩn trước khi tiến hành ký duyệt Giấy phép làm việc.
              </p>
            </div>
          </div>
          <button
            onClick={() => setViewMode('list')}
            className="px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-xs font-bold transition"
          >
            Quay lại danh sách
          </button>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 md:p-8 border border-slate-200 dark:border-slate-700 shadow-sm space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Loại Giấy phép</label>
              <select
                value={permitType}
                onChange={(e) => setPermitType(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none"
              >
                <option value="Enclosed">Không gian kín (Enclosed Space Permit - TL-13-03)</option>
                <option value="Hot">Làm việc Nóng (Hot Work Permit - TL-13-01)</option>
                <option value="Aloft">Làm việc Trên cao (Aloft Permit - TL-13-04)</option>
                <option value="Cold">Làm việc Nguội (Cold Work Permit - TL-13-02)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Tên tàu thực thi</label>
              <select
                value={permitVessel}
                onChange={(e) => setPermitVessel(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none"
              >
                <option value="M/V Green Star">M/V Green Star</option>
                <option value="M/V Sunrise">M/V Sunrise</option>
                <option value="M/V Orion">M/V Orion</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Vị trí thực hiện</label>
              <input
                type="text"
                value={permitLocation}
                onChange={(e) => setPermitLocation(e.target.value)}
                placeholder="Ví dụ: Két ballast mạn trái, hầm xích neo..."
                className="w-full px-3 py-2 border rounded-xl bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Thời hạn (Giờ)</label>
              <input
                type="number"
                value={permitDuration}
                onChange={(e) => setPermitDuration(Number(e.target.value))}
                min={1}
                max={24}
                className="w-full px-3 py-2 border rounded-xl bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Tiêu đề công việc cấp phép</label>
              <input
                type="text"
                value={permitTitle}
                onChange={(e) => setPermitTitle(e.target.value)}
                placeholder="Ví dụ: Vào két ballast 2S vệ sinh và kiểm tra..."
                className="w-full px-3 py-2 border rounded-xl bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Liên kết Đánh giá rủi ro (JSA)</label>
              <select
                value={permitRiskId}
                onChange={(e) => setPermitRiskId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none"
              >
                <option value="">-- Chọn đánh giá rủi ro có sẵn --</option>
                {risks.map(r => (
                  <option key={r.id} value={r.id}>{r.code}: {r.jobTitle}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Người chuẩn bị (Prepared By)</label>
              <input
                type="text"
                value={permitPreparedBy}
                onChange={(e) => setPermitPreparedBy(e.target.value)}
                placeholder="Ví dụ: Máy trưởng Lê Văn C"
                className="w-full px-3 py-2 border rounded-xl bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none"
              />
            </div>
          </div>

          {/* Gas Input Form section - Only relevant for Enclosed spaces */}
          {permitType === 'Enclosed' && (
            <div className="p-4 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
              <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                Bản khai báo nồng độ khí đo hiện trường (Khóa an toàn):
              </span>
              
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">O2 (%) - Hạn 20.9%</label>
                  <input
                    type="number"
                    step="0.1"
                    value={gasO2}
                    onChange={(e) => setGasO2(Number(e.target.value))}
                    className="w-full p-2 border rounded bg-white dark:bg-slate-900 text-xs font-mono text-center"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">LEL (%) - Hạn &lt; 1%</label>
                  <input
                    type="number"
                    step="0.1"
                    value={gasLEL}
                    onChange={(e) => setGasLEL(Number(e.target.value))}
                    className="w-full p-2 border rounded bg-white dark:bg-slate-900 text-xs font-mono text-center"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">CO (ppm) - Hạn &lt; 25</label>
                  <input
                    type="number"
                    value={gasCO}
                    onChange={(e) => setGasCO(Number(e.target.value))}
                    className="w-full p-2 border rounded bg-white dark:bg-slate-900 text-xs font-mono text-center"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">H2S (ppm) - Hạn 0</label>
                  <input
                    type="number"
                    value={gasH2S}
                    onChange={(e) => setGasH2S(Number(e.target.value))}
                    className="w-full p-2 border rounded bg-white dark:bg-slate-900 text-xs font-mono text-center"
                  />
                </div>
              </div>

              {/* Visual safety indicator */}
              {gasSafetyStatus ? (
                <div className="p-3 bg-green-50 dark:bg-green-950/20 text-green-800 dark:text-green-400 rounded-xl border border-green-200 dark:border-green-850 text-xs font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" /> NỒNG ĐỘ KHÍ AN TOÀN. Đủ điều kiện cấp phép vào không gian kín.
                </div>
              ) : (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-850 text-xs font-bold flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 animate-bounce" /> NỒNG ĐỘ KHÍ NGUY HIỂM! Hệ thống tự động khóa nút phê duyệt cấp phép.
                </div>
              )}
            </div>
          )}

          {/* Checklist list */}
          <div className="space-y-2 border-t border-slate-200 dark:border-slate-700 pt-4">
            <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">Biện pháp an toàn phòng ngừa tối thiểu bắt buộc:</span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {precautionList.map((item, idx) => (
                <label key={idx} className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800 hover:bg-slate-100/50 cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => togglePrecaution(idx)}
                    className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                  />
                  <span className="text-slate-700 dark:text-slate-300">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* PIN DIGITAL SIGNATURE SECTION */}
          <div className="bg-slate-50 dark:bg-slate-850 p-5 rounded-2xl border border-slate-250 dark:border-slate-800 space-y-4 border-t border-slate-100 dark:border-slate-700">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 dark:text-white">
              <Lock className="w-4 h-4 text-blue-500" />
              <span>MÃ PIN XÁC THỰC CHỮ KÝ SỐ</span>
            </div>

            <p className="text-[10px] text-slate-450 leading-relaxed">
              Đóng dấu số điện tử trực tiếp lên giấy phép làm việc. Officers sử dụng mã PIN cá nhân của mình (4 chữ số bất kỳ). <br />
              <strong>Thuyền trưởng duyệt cấp phép sử dụng mã PIN: 1111</strong>
            </p>

            {/* Show signatures already made */}
            {permitSignatures.length > 0 && (
              <div className="space-y-1.5">
                {permitSignatures.map((sig, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-[10px] bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-400 px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800">
                    <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="font-bold">{sig.name}</span>
                    <span className="text-emerald-600 dark:text-emerald-500">({sig.rank})</span>
                    <span className="ml-auto font-mono text-[9px] text-emerald-500">{sig.sigCode}</span>
                  </div>
                ))}
              </div>
            )}

            {permitSignStep !== 'approved' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {permitSignStep === 'draft' && (
                    <>
                      <input
                        type="text"
                        placeholder="Họ tên người ký"
                        value={permitSigningName}
                        onChange={(e) => setPermitSigningName(e.target.value)}
                        className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-850 dark:text-white outline-none focus:ring-1 focus:ring-blue-500"
                      />
                      <input
                        type="text"
                        placeholder="Chức danh ký"
                        value={permitSigningRank}
                        onChange={(e) => setPermitSigningRank(e.target.value)}
                        className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-850 dark:text-white outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </>
                  )}
                  <input
                    type="password"
                    maxLength={4}
                    placeholder="PIN (4 số)"
                    value={permitSigningPin}
                    onChange={(e) => setPermitSigningPin(e.target.value)}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-250 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-850 dark:text-white font-mono text-center outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="flex gap-2 justify-end pt-1">
                  <button
                    onClick={() => { setViewMode('list'); setPermitCreatedId(null); setPermitSignStep('draft'); setPermitSignatures([]); }}
                    className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-50 transition"
                  >
                    Hủy bỏ
                  </button>

                  {!permitCreatedId ? (
                    <button
                      onClick={handleCreatePermit}
                      disabled={permitType === 'Enclosed' && !gasSafetyStatus}
                      className={`px-5 py-2 rounded-xl text-white text-xs font-semibold transition shadow flex items-center gap-1.5 ${
                        permitType === 'Enclosed' && !gasSafetyStatus
                          ? 'bg-slate-350 cursor-not-allowed opacity-50'
                          : 'bg-blue-600 hover:bg-blue-700'
                      }`}
                    >
                      <Plus className="w-3.5 h-3.5" /> Tạo Giấy phép
                    </button>
                  ) : permitSignStep === 'draft' ? (
                    <button
                      onClick={handlePermitSign}
                      className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow"
                    >
                      <Sparkles className="w-3.5 h-3.5" /> Ký & Đệ trình (Chief Officer)
                    </button>
                  ) : (
                    <button
                      onClick={handlePermitCaptainApprove}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-600/10"
                    >
                      <Award className="w-4 h-4" /> Captain Duyệt & Cấp phép
                    </button>
                  )}
                </div>
              </>
            )}

            {permitSignStep === 'approved' && (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-400 rounded-xl border border-emerald-200 dark:border-emerald-800 text-xs font-bold flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" />
                GIẤY PHÉP ĐÃ ĐƯỢC PHÊ DUYỆT ĐIỆN TỬ THÀNH CÔNG — Đang chuyển về danh sách...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="operations-surface space-y-4 p-4">
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-permit-document,
          #printable-permit-document * {
            visibility: visible !important;
          }
          #printable-permit-document {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            border: none !important;
            box-shadow: none !important;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
            margin: 0 !important;
            padding: 2cm !important;
          }
        }
      `}</style>
      
      {/* Sub tabs selector */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 pb-px">
        <button
          onClick={() => setActiveSubTab('permits')}
          className={`px-3 py-2 font-semibold text-xs border-b-2 transition-all ${
            activeSubTab === 'permits'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Giấy phép làm việc (Permits Board)
        </button>
        <button
          onClick={() => setActiveSubTab('risks')}
          className={`px-3 py-2 font-semibold text-xs border-b-2 transition-all ${
            activeSubTab === 'risks'
              ? 'border-blue-600 text-blue-600 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Đánh giá rủi ro & JSA
        </button>
      </div>

      {activeSubTab === 'permits' ? (
        <div className="space-y-6">
          
          {/* Live Permits Status Board */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Activity className="w-5 h-5 text-green-500 animate-pulse" /> Live Board: Giấy phép đang hoạt động dưới tàu
              </h3>
              
              <button
                onClick={() => setViewMode('create_permit')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow"
              >
                <Plus className="w-4 h-4" /> Cấp giấy phép mới
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {permits.filter(p => p.status === 'Active').map(p => (
                <div key={p.id} className="bg-white dark:bg-slate-800 border-l-4 border-green-500 rounded-2xl p-5 shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-4">
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-mono text-slate-400">{p.code}</span>
                      <span className="bg-green-100 text-green-800 text-[8px] font-extrabold px-1.5 py-0.5 rounded uppercase tracking-wider animate-pulse">
                        Đang hoạt động (Active)
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-1">{p.title}</h4>
                    <p className="text-[10.5px] text-slate-400 mt-1">Vị trí: {p.location}</p>
                    
                    {p.type === 'Enclosed' && (
                      <div className="mt-3 bg-slate-50 dark:bg-slate-900 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 flex justify-between items-center text-[10px]">
                        <span className="font-bold text-slate-500">O2: {p.gasO2}%</span>
                        <span className="text-slate-400">|</span>
                        <span className="font-bold text-slate-500">LEL: {p.gasLEL}%</span>
                        <span className="text-slate-400">|</span>
                        <span className="font-bold text-slate-500">CO: {p.gasCO}ppm</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-700 pt-3 text-[10.5px]">
                    <span className="text-slate-400">Thời hạn: {p.durationHours} giờ</span>
                    <button
                      onClick={() => closePermit(p.id)}
                      className="px-2 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded font-bold shadow-sm"
                    >
                      Đóng Giấy phép
                    </button>
                  </div>
                </div>
              ))}

              {permits.filter(p => p.status === 'Active').length === 0 && (
                <div className="col-span-3 bg-slate-100/50 dark:bg-slate-800/20 py-8 border border-dashed rounded-2xl flex flex-col items-center justify-center text-slate-400">
                  <ShieldCheck className="w-8 h-8 mb-2" />
                  <span className="text-xs">Hiện tại không có giấy phép nào đang hoạt động trên tàu.</span>
                </div>
              )}
            </div>
          </div>

          {/* Sổ lưu trữ giấy phép cũ */}
          <div className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-slate-200 dark:border-slate-700">
            <h3 className="operations-section-title mb-3">Nhật ký Giấy phép làm việc (TL-13)</h3>
            
            <div className="overflow-x-auto">
              <table className="operations-table w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-400 font-semibold bg-slate-50 dark:bg-slate-900">
                    <th className="p-3">Mã giấy phép</th>
                    <th className="p-3">Loại công việc</th>
                    <th className="p-3">Tên giấy phép</th>
                    <th className="p-3">Vị trí</th>
                    <th className="p-3">Đo khí (O2)</th>
                    <th className="p-3">Trạng thái</th>
                    <th className="p-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {permits.map(p => (
                    <tr key={p.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/20">
                      <td className="p-3 font-mono font-bold text-slate-500">{p.code}</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded font-extrabold uppercase text-[9px] ${
                          p.type === 'Hot' ? 'bg-red-100 text-red-800' :
                          p.type === 'Enclosed' ? 'bg-amber-100 text-amber-800' :
                          p.type === 'Aloft' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'
                        }`}>
                          {p.type === 'Hot' ? 'Làm việc nóng' :
                           p.type === 'Enclosed' ? 'Không gian kín' :
                           p.type === 'Aloft' ? 'Làm việc trên cao' : 'Làm việc nguội'}
                        </span>
                      </td>
                      <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">{p.title}</td>
                      <td className="p-3 text-slate-500">{p.location}</td>
                      <td className="p-3 font-mono text-slate-500">{p.gasO2}%</td>
                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          p.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {p.status === 'Active' ? 'Active' : 'Closed'}
                        </span>
                      </td>
                      <td className="p-3 text-right space-x-2">
                        <button
                          onClick={() => {
                            setSelectedPermitId(p.id);
                            setIsPreviewModalOpen(true);
                          }}
                          className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 rounded"
                          title="Xem trước mẫu biểu"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => deletePermit(p.id)}
                          className="p-1 hover:bg-red-50 text-red-500 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          
          {/* Left: Risks & JSA Registers list */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col h-[600px]">
            <div className="flex justify-between items-center mb-4">
              <h3 className="operations-section-title">Báo cáo đánh giá rủi ro (TL-24-01)</h3>
              <button
                onClick={() => setViewMode('create_risk')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 shadow"
              >
                <Plus className="w-4 h-4" /> Đánh giá mới
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-2">
              {risks.map(r => {
                const isSelected = selectedRisk.id === r.id;
                return (
                  <div
                    key={r.id}
                    onClick={() => setSelectedRiskId(r.id)}
                    className={`p-4 rounded-xl border cursor-pointer transition ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/25 border-blue-200 dark:border-blue-800'
                        : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-mono text-slate-400">{r.code}</span>
                      <span className="text-[10px] text-slate-400">{r.date}</span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-1">{r.jobTitle}</h4>
                    <div className="flex justify-between items-center mt-3 text-[10px] text-slate-400">
                      <span>BP: {r.department} • PIC: {r.pic}</span>
                      <span className="text-blue-600 hover:underline flex items-center gap-0.5">
                        {r.steps.length} Bước JSA <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: JSA Steps Details View */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col h-[600px] overflow-y-auto">
            {selectedRisk ? (
              <>
                <div className="flex justify-between items-start border-b border-slate-200 dark:border-slate-700 pb-3 mb-4">
                  <div>
                    <span className="text-[10px] font-mono text-slate-400">{selectedRisk.code} • Phân tích an toàn công việc JSA (TL-32-01)</span>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-1">{selectedRisk.jobTitle}</h3>
                  </div>
                  <button
                    onClick={() => deleteRisk(selectedRisk.id)}
                    className="p-1 hover:bg-red-50 text-red-500 rounded"
                  >
                    <Trash2 className="w-4.5 h-4.5" />
                  </button>
                </div>

                {/* SMS Document Control Header Info */}
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-6 text-xs bg-slate-50/50 dark:bg-slate-900/30">
                  <div className="grid grid-cols-2 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-200 dark:divide-slate-700">
                    <div className="p-3">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Mã Tài Liệu / Doc Code</p>
                      <p className="font-mono font-semibold text-slate-700 dark:text-slate-200 mt-0.5">{selectedRisk.code || 'TL-24-01'}</p>
                    </div>
                    <div className="p-3">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Tàu / Vessel</p>
                      <p className="font-semibold text-slate-700 dark:text-slate-200 mt-0.5">M/V Green Star</p>
                    </div>
                    <div className="p-3">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Bộ Phận / Dept</p>
                      <p className="font-semibold text-slate-700 dark:text-slate-200 mt-0.5">
                        {selectedRisk.department === 'Deck' ? 'Bộ phận Boong (Deck)' :
                         selectedRisk.department === 'Engine' ? 'Bộ phận Máy (Engine)' : 'Phục vụ (Galley)'}
                      </p>
                    </div>
                    <div className="p-3">
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Ngày Khai Báo / Date</p>
                      <p className="font-semibold text-slate-700 dark:text-slate-200 mt-0.5">{selectedRisk.date}</p>
                    </div>
                  </div>
                </div>

                {/* Required PPE badges */}
                <div className="mb-6">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-2.5 uppercase tracking-wider">Trang thiết bị bảo hộ tối thiểu (Minimum Required PPE)</h4>
                  <div className="flex flex-wrap gap-2">
                    <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 rounded-lg text-[10px] font-bold border border-blue-100 dark:border-blue-900/30 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Mũ Bảo Hộ (Helmet)
                    </span>
                    <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 rounded-lg text-[10px] font-bold border border-blue-100 dark:border-blue-900/30 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Giày Mũi Sắt (Safety Boots)
                    </span>
                    <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 rounded-lg text-[10px] font-bold border border-blue-100 dark:border-blue-900/30 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Găng Tay Bảo Hộ (Gloves)
                    </span>
                    <span className="px-2.5 py-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 rounded-lg text-[10px] font-bold border border-blue-100 dark:border-blue-900/30 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Kính Bảo Hộ (Goggles)
                    </span>
                    {(selectedRisk.jobTitle.toLowerCase().includes('sơn') || selectedRisk.jobTitle.toLowerCase().includes('hàn') || selectedRisk.jobTitle.toLowerCase().includes('khí')) && (
                      <span className="px-2.5 py-1 bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 rounded-lg text-[10px] font-bold border border-orange-100 dark:border-orange-900/30 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span> Mặt Nạ Hàn (Welding Shield)
                      </span>
                    )}
                    {(selectedRisk.jobTitle.toLowerCase().includes('cao') || selectedRisk.jobTitle.toLowerCase().includes('aloft')) && (
                      <span className="px-2.5 py-1 bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 rounded-lg text-[10px] font-bold border border-orange-100 dark:border-orange-900/30 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span> Đai An Toàn (Safety Harness)
                      </span>
                    )}
                  </div>
                </div>

                {/* JSA Step List */}
                <div className="space-y-4 flex-1">
                  {selectedRisk.steps.map((step, idx) => {
                    const initLevel = getRiskLevel(step.initialScore);
                    const resLevel = getRiskLevel(step.residualScore);

                    return (
                      <div key={step.id} className="p-5 bg-white dark:bg-slate-800 border border-slate-150 dark:border-slate-700 rounded-2xl shadow-sm hover:shadow transition duration-200 space-y-4">
                        <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-700/50 pb-2">
                          <span className="text-xs font-bold text-blue-600 dark:text-blue-400">Bước {idx + 1}: {step.stepDescription}</span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          {/* Hazard Box (Grey background, borderless) */}
                          <div className="bg-slate-50 dark:bg-slate-900/40 p-5 rounded-xl flex flex-col justify-between space-y-3">
                            <div>
                              <span className="text-slate-400 font-bold uppercase text-[9px] tracking-wider block">Mối nguy hiểm tiềm ẩn:</span>
                              <p className="text-slate-800 dark:text-slate-200 mt-1 font-medium leading-relaxed">{step.hazards}</p>
                            </div>
                            
                            <div className="flex items-center justify-between border-t border-slate-200/55 dark:border-slate-700/50 pt-3 mt-3">
                              <span className="text-[10px] text-slate-500 dark:text-slate-400">Rủi ro ban đầu (Initial Risk):</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${initLevel.color} flex items-center`}>
                                {step.initialL}x{step.initialS} = {step.initialScore} ({initLevel.text})
                              </span>
                            </div>
                          </div>

                          {/* Mitigations Box (Emerald background, borderless) */}
                          <div className="bg-emerald-50/40 dark:bg-emerald-950/10 p-5 rounded-xl flex flex-col justify-between space-y-3">
                            <div>
                              <span className="text-emerald-600 dark:text-emerald-400 font-bold uppercase text-[9px] tracking-wider block">Biện pháp kiểm soát đề xuất:</span>
                              <p className="text-slate-800 dark:text-slate-200 mt-1 font-medium leading-relaxed">{step.mitigations}</p>
                            </div>
                            
                            <div className="flex items-center justify-between border-t border-emerald-100/50 dark:border-emerald-900/30 pt-3 mt-3">
                              <span className="text-[10px] text-slate-500 dark:text-slate-400">Rủi ro còn lại (Residual Risk):</span>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border ${resLevel.color} flex items-center`}>
                                {step.residualL}x{step.residualS} = {step.residualScore} ({resLevel.text})
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Simplified digital sign-off */}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-6 mt-6 flex justify-end">
                  <div className="text-right">
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">Người chuẩn bị (Prepared By)</p>
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-1">{selectedRisk.pic}</p>
                    <p className="text-[10px] text-green-600 dark:text-green-400 mt-1 flex items-center gap-1 justify-end">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-600 dark:bg-green-400 inline-block animate-pulse"></span>
                      Đã xác nhận điện tử (Digitally Signed)
                    </p>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500">
                <ShieldAlert className="w-12 h-12 mb-3 stroke-1" />
                <p className="text-sm font-medium">Chưa chọn báo cáo đánh giá rủi ro nào</p>
                <p className="text-xs mt-1">Chọn từ danh sách bên trái hoặc lập đánh giá mới</p>
              </div>
            )}
          </div>

        </div>
      )}

      {/* New Risk Assessment / JSA Modal */}
      {isNewRiskModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 md:p-8 w-[96vw] h-[92vh] max-h-[95vh] border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col justify-between animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
            <div className="flex-shrink-0 flex justify-between items-start border-b border-slate-250 dark:border-slate-700 pb-3">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  Báo cáo Đánh giá Rủi ro (TL-24-01) & Phân tích JSA (TL-32-01)
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Lập ma trận rủi ro 5x5: Lập danh sách công việc, xác định các bước mối nguy ban đầu và biện pháp giảm thiểu để đưa rủi ro về mức chấp nhận được.
                </p>
              </div>
              <button 
                onClick={() => setIsNewRiskModalOpen(false)} 
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white transition text-lg"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 my-4 space-y-6 scrollbar-thin">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Tên công việc chính</label>
                  <input 
                    type="text" 
                    value={riskTitle}
                    onChange={(e) => setRiskTitle(e.target.value)}
                    placeholder="Ví dụ: Sơn mạn tàu ngoài neo đậu..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Bộ phận phụ trách</label>
                  <select
                    value={riskDept}
                    onChange={(e) => setRiskDept(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none"
                  >
                    <option value="Deck">Bộ phận boong (Deck)</option>
                    <option value="Engine">Bộ phận máy (Engine)</option>
                    <option value="Galley">Bộ phận phục vụ (Galley)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Người giám sát chính (PIC)</label>
                  <input 
                    type="text" 
                    value={riskPic}
                    onChange={(e) => setRiskPic(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none"
                  />
                </div>
              </div>

              {/* JSA Steps Editor list */}
              <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-805 dark:text-slate-200">Các bước phân tích an toàn (JSA)</span>
                  <button
                    onClick={handleAddRiskStep}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold bg-slate-50 hover:bg-slate-100 transition"
                  >
                    + Thêm bước JSA
                  </button>
                </div>

                {riskSteps.map((step, idx) => (
                  <div key={idx} className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Bước số {idx + 1}:</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-1.5">Mô tả bước công việc</label>
                        <input
                          type="text"
                          value={step.stepDescription}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRiskSteps(prev => prev.map((s, i) => i === idx ? { ...s, stepDescription: val } : s));
                          }}
                          placeholder="Ví dụ: Lắp ráp giàn giáo dây treo ngoài mạn..."
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white dark:bg-slate-900 text-xs focus:outline-none"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-1.5">Mối nguy hiểm tiềm tàng</label>
                        <input
                          type="text"
                          value={step.hazards}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRiskSteps(prev => prev.map((s, i) => i === idx ? { ...s, hazards: val } : s));
                          }}
                          placeholder="Ví dụ: Dây treo mòn đứt gây rơi ngã thuyền viên xuống biển..."
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white dark:bg-slate-900 text-xs focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Matrix input values */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-200 dark:border-slate-850 pt-3">
                      <div>
                        <span className="block text-[10px] font-bold text-slate-400 mb-2">Đánh giá ban đầu (Initial Risk):</span>
                        <div className="flex gap-4 text-xs">
                          <label className="flex items-center gap-1">
                            <span>Khả năng (L:1-5)</span>
                            <select
                              value={step.initialL}
                              onChange={(e) => handleScoreChange(idx, 'initial', 'L', Number(e.target.value))}
                              className="border rounded px-1.5 py-0.5 bg-white dark:bg-slate-800 text-xs"
                            >
                              {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                          </label>
                          <label className="flex items-center gap-1">
                            <span>Hậu quả (S:1-5)</span>
                            <select
                              value={step.initialS}
                              onChange={(e) => handleScoreChange(idx, 'initial', 'S', Number(e.target.value))}
                              className="border rounded px-1.5 py-0.5 bg-white dark:bg-slate-800 text-xs"
                            >
                              {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                          </label>
                          <span className="font-bold flex items-center">Điểm rủi ro: {step.initialScore}</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 mb-1.5">Biện pháp giảm thiểu rủi ro đề xuất</label>
                        <input
                          type="text"
                          value={step.mitigations}
                          onChange={(e) => {
                            const val = e.target.value;
                            setRiskSteps(prev => prev.map((s, i) => i === idx ? { ...s, mitigations: val } : s));
                          }}
                          placeholder="Ví dụ: Sử dụng đai an toàn kép cứu hộ độc lập, mặc áo phao cứu sinh..."
                          className="w-full px-3 py-1.5 rounded-lg border border-slate-200 bg-white dark:bg-slate-900 text-xs focus:outline-none"
                        />
                        
                        {/* Residual calculation */}
                        <div className="flex gap-4 text-xs mt-3">
                          <label className="flex items-center gap-1">
                            <span>Residual L:</span>
                            <select
                              value={step.residualL}
                              onChange={(e) => handleScoreChange(idx, 'residual', 'L', Number(e.target.value))}
                              className="border rounded px-1.5 py-0.5 bg-white dark:bg-slate-800 text-xs"
                            >
                              {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                          </label>
                          <label className="flex items-center gap-1">
                            <span>Residual S:</span>
                            <select
                              value={step.residualS}
                              onChange={(e) => handleScoreChange(idx, 'residual', 'S', Number(e.target.value))}
                              className="border rounded px-1.5 py-0.5 bg-white dark:bg-slate-800 text-xs"
                            >
                              {[1, 2, 3, 4, 5].map(v => <option key={v} value={v}>{v}</option>)}
                            </select>
                          </label>
                          <span className="font-bold flex items-center">Residual Score: {step.residualScore}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex-shrink-0 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-700 pt-4">
              <button
                onClick={() => setIsNewRiskModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleSaveRiskAssessment}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition"
              >
                Phê duyệt & Lưu Đánh giá
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Permit Modal with Gas input verification */}
      {isNewPermitModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 md:p-8 w-[96vw] h-[92vh] max-h-[95vh] border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col justify-between animate-in fade-in zoom-in-95 duration-150 overflow-hidden">
            <div className="flex-shrink-0 flex justify-between items-start border-b border-slate-200 dark:border-slate-700 pb-3">
              <div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                  Đăng ký Giấy phép làm việc Nguy hiểm điện tử (TL-13)
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Lưu ý: Mọi khai báo nồng độ khí gas phải được đo bằng thiết bị hiệu chuẩn trước khi tiến hành ký duyệt Giấy phép làm việc.
                </p>
              </div>
              <button 
                onClick={() => setIsNewPermitModalOpen(false)} 
                className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white transition text-lg"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 my-4 space-y-6 scrollbar-thin">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Loại Giấy phép</label>
                  <select
                    value={permitType}
                    onChange={(e) => setPermitType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none"
                  >
                    <option value="Enclosed">Không gian kín (Enclosed Space Permit - TL-13-03)</option>
                    <option value="Hot">Làm việc Nóng (Hot Work Permit - TL-13-01)</option>
                    <option value="Aloft">Làm việc Trên cao (Aloft Permit - TL-13-04)</option>
                    <option value="Cold">Làm việc Nguội (Cold Work Permit - TL-13-02)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Tên tàu thực thi</label>
                  <select
                    value={permitVessel}
                    onChange={(e) => setPermitVessel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none"
                  >
                    <option value="M/V Green Star">M/V Green Star</option>
                    <option value="M/V Sunrise">M/V Sunrise</option>
                    <option value="M/V Orion">M/V Orion</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Vị trí thực hiện</label>
                  <input
                    type="text"
                    value={permitLocation}
                    onChange={(e) => setPermitLocation(e.target.value)}
                    placeholder="Ví dụ: Két ballast mạn trái, hầm xích neo..."
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Thời hạn (Giờ)</label>
                  <input
                    type="number"
                    value={permitDuration}
                    onChange={(e) => setPermitDuration(Number(e.target.value))}
                    min={1}
                    max={24}
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Tiêu đề công việc cấp phép</label>
                  <input
                    type="text"
                    value={permitTitle}
                    onChange={(e) => setPermitTitle(e.target.value)}
                    placeholder="Ví dụ: Vào két ballast 2S vệ sinh và kiểm tra..."
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Liên kết Đánh giá rủi ro (JSA)</label>
                  <select
                    value={permitRiskId}
                    onChange={(e) => setPermitRiskId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none"
                  >
                    <option value="">-- Chọn đánh giá rủi ro có sẵn --</option>
                    {risks.map(r => (
                      <option key={r.id} value={r.id}>{r.code}: {r.jobTitle}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Người chuẩn bị (Prepared By)</label>
                  <input
                    type="text"
                    value={permitPreparedBy}
                    onChange={(e) => setPermitPreparedBy(e.target.value)}
                    placeholder="Ví dụ: Máy trưởng Lê Văn C"
                    className="w-full px-3 py-2 border rounded-xl bg-slate-50 dark:bg-slate-900 text-sm focus:outline-none"
                  />
                </div>
              </div>

              {/* Gas Input Form section - Only relevant for Enclosed spaces */}
              {permitType === 'Enclosed' && (
                <div className="p-4 bg-slate-50 dark:bg-slate-950/40 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                    Bản khai báo nồng độ khí đo hiện trường (Khóa an toàn):
                  </span>
                  
                  <div className="grid grid-cols-4 gap-3">
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">O2 (%) - Hạn 20.9%</label>
                      <input
                        type="number"
                        step="0.1"
                        value={gasO2}
                        onChange={(e) => setGasO2(Number(e.target.value))}
                        className="w-full p-2 border rounded bg-white text-xs font-mono text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">LEL (%) - Hạn &lt; 1%</label>
                      <input
                        type="number"
                        step="0.1"
                        value={gasLEL}
                        onChange={(e) => setGasLEL(Number(e.target.value))}
                        className="w-full p-2 border rounded bg-white text-xs font-mono text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">CO (ppm) - Hạn &lt; 25</label>
                      <input
                        type="number"
                        value={gasCO}
                        onChange={(e) => setGasCO(Number(e.target.value))}
                        className="w-full p-2 border rounded bg-white text-xs font-mono text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-400 mb-1">H2S (ppm) - Hạn 0</label>
                      <input
                        type="number"
                        value={gasH2S}
                        onChange={(e) => setGasH2S(Number(e.target.value))}
                        className="w-full p-2 border rounded bg-white text-xs font-mono text-center"
                      />
                    </div>
                  </div>

                  {/* Visual safety indicator */}
                  {gasSafetyStatus ? (
                    <div className="p-3 bg-green-50 dark:bg-green-950/20 text-green-800 dark:text-green-400 rounded-xl border border-green-200 dark:border-green-850 text-xs font-semibold flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4" /> NỒNG ĐỘ KHÍ AN TOÀN. Đủ điều kiện cấp phép vào không gian kín.
                    </div>
                  ) : (
                    <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-850 text-xs font-bold flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 animate-bounce" /> NỒNG ĐỘ KHÍ NGUY HIỂM! Hệ thống tự động khóa nút phê duyệt cấp phép.
                    </div>
                  )}
                </div>
              )}

              {/* Checklist list */}
              <div className="space-y-2 border-t border-slate-200 dark:border-slate-700 pt-4">
                <span className="block text-xs font-bold text-slate-700 dark:text-slate-300">Biện pháp an toàn phòng ngừa tối thiểu bắt buộc:</span>
                <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1 text-xs">
                  {precautionList.map((item, idx) => (
                    <label key={idx} className="flex items-start gap-2.5 p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 hover:bg-slate-100/50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={item.checked}
                        onChange={() => togglePrecaution(idx)}
                        className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                      />
                      <span className="text-slate-700 dark:text-slate-300">{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex-shrink-0 flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-700 pt-4">
              <button
                onClick={() => setIsNewPermitModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleCreatePermit}
                disabled={permitType === 'Enclosed' && !gasSafetyStatus}
                className={`px-5 py-2.5 rounded-xl text-white text-sm font-semibold transition shadow ${
                  permitType === 'Enclosed' && !gasSafetyStatus
                    ? 'bg-slate-350 cursor-not-allowed opacity-50'
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                Ký duyệt & Cấp giấy phép
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permit Export Preview Modal */}
      {isPreviewModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 max-w-2xl w-full border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-hidden">
            
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Xem văn bản Giấy phép làm việc an toàn
                </h3>
                <p className="text-xs text-slate-400">
                  Văn bản pháp lý chứng nhận cấp phép được lưu vết số hóa.
                </p>
              </div>
              <button onClick={() => setIsPreviewModalOpen(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-655">✕</button>
            </div>

            {/* Document sheet */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-100 dark:bg-slate-900 rounded-2xl flex justify-center py-6">
              <div id="printable-permit-document" className="bg-white text-slate-900 w-full max-w-[500px] shadow border border-slate-200 p-8 flex flex-col justify-between relative font-sans text-xs">
                
                {/* Diagonal Watermark for Active status */}
                {selectedPermit.status === 'Active' && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-10 opacity-[0.05] transform -rotate-45">
                    <span className="text-4xl font-extrabold tracking-widest text-green-600 border-8 border-green-600 p-3 uppercase">
                      GIẤY PHÉP HIỆU LỰC
                    </span>
                  </div>
                )}

                {/* Header */}
                <div className="border-b-2 border-slate-950 pb-3 flex justify-between items-start">
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-950 uppercase tracking-wide">MARITIME SHIPBOARD SMS</h4>
                    <p className="text-[8px] text-slate-400">Vessel Safety Board</p>
                  </div>
                  <div className="text-right text-[8px] text-slate-500 space-y-0.5">
                    <p>Mã số kiểm soát: <strong>{selectedPermit.code}</strong></p>
                    <p>Tàu thực thi: {selectedPermit.vessel}</p>
                    <p>Ngày/Giờ bắt đầu: {selectedPermit.startTime.replace('T', ' ')}</p>
                  </div>
                </div>

                <div className="my-5 space-y-4">
                  <h2 className="text-center font-bold text-sm uppercase tracking-wide border-b border-slate-200 pb-2">
                    {selectedPermit.type === 'Enclosed' ? 'GIẤY PHÉP VÀO KHÔNG GIAN KÍN (TL-13-03)' :
                     selectedPermit.type === 'Hot' ? 'GIẤY PHÉP LÀM CÔNG VIỆC NÓNG (TL-13-01)' :
                     selectedPermit.type === 'Aloft' ? 'GIẤY PHÉP LÀM VIỆC TRÊN CAO (TL-13-04)' :
                     'GIẤY PHÉP LÀM CÔNG VIỆC NGUỘI (TL-13-02)'}
                  </h2>

                  <div className="grid grid-cols-2 gap-3 text-[10px] text-slate-800">
                    <p><strong>Tiêu đề cấp phép:</strong> {selectedPermit.title}</p>
                    <p><strong>Vị trí khu vực:</strong> {selectedPermit.location}</p>
                    <p><strong>Thời hạn cấp phép:</strong> {selectedPermit.durationHours} Giờ</p>
                    <p><strong>Trạng thái:</strong> {selectedPermit.status === 'Active' ? 'Đang hoạt động' : 'Đã đóng'}</p>
                  </div>

                  {selectedPermit.type === 'Enclosed' && (
                    <div className="space-y-1">
                      <p className="font-bold text-[10px]">1. Nhật ký đo nồng độ khí quyển tại hiện trường:</p>
                      <div className="bg-slate-50 p-2.5 rounded text-[10px] grid grid-cols-4 text-center font-mono">
                        <div>
                          <p className="text-[8px] text-slate-500">O2 (Oxy)</p>
                          <p className="font-bold text-slate-850">{selectedPermit.gasO2}%</p>
                          <p className="text-[7px] text-green-600">Đạt (20.9%)</p>
                        </div>
                        <div>
                          <p className="text-[8px] text-slate-500">LEL (Cháy)</p>
                          <p className="font-bold text-slate-850">{selectedPermit.gasLEL}%</p>
                          <p className="text-[7px] text-green-600">Đạt (&lt;1%)</p>
                        </div>
                        <div>
                          <p className="text-[8px] text-slate-500">CO (Độc)</p>
                          <p className="font-bold text-slate-850">{selectedPermit.gasCO} ppm</p>
                          <p className="text-[7px] text-green-600">Đạt (&lt;25)</p>
                        </div>
                        <div>
                          <p className="text-[8px] text-slate-500">H2S (Độc)</p>
                          <p className="font-bold text-slate-850">{selectedPermit.gasH2S} ppm</p>
                          <p className="text-[7px] text-green-600">Đạt (0)</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <p className="font-bold text-[10px]">2. Danh mục biện pháp an toàn đã kiểm tra (Checklist):</p>
                    <div className="bg-slate-50 p-2.5 rounded text-[9px] space-y-1">
                      {selectedPermit.precautions.map((prec, i) => (
                        <p key={i} className="flex items-center gap-1.5 text-slate-700">
                          <span className="text-green-600 font-bold">✓</span> {prec.label}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Footer signatures */}
                <div className="border-t border-slate-200 pt-4 space-y-3">
                  <div className="flex justify-center items-center text-[9px] text-slate-500">
                    <div className="text-center">
                      <p className="text-[8px] text-slate-400 uppercase tracking-wider font-bold">Người chuẩn bị / Prepared By</p>
                      <p className="font-bold text-slate-800 text-xs mt-1">{selectedPermit.preparedBy || 'Đại phó Trần Văn D'}</p>
                    </div>
                  </div>

                  {/* Digital Signatures Log */}
                  {selectedPermit.digitalSignatures && selectedPermit.digitalSignatures.length > 0 && (
                    <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                      <p className="text-[8px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        🔐 NHẬT KÝ CHỮ KÝ SỐ ĐIỆN TỬ
                      </p>
                      {selectedPermit.digitalSignatures.map((sig, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-[9px] bg-emerald-50 text-emerald-800 px-2.5 py-1.5 rounded border border-emerald-200">
                          <span className="text-emerald-600 font-bold">✓</span>
                          <span className="font-bold">{sig.name}</span>
                          <span className="text-emerald-600">({sig.rank})</span>
                          <span className="ml-auto font-mono text-[8px] text-emerald-500">{sig.sigCode}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-700 pt-4">
              <span className="text-xs text-slate-400">Nhấp chuột ngoài hoặc ấn Đóng để thoát.</span>
              <div className="flex gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Tải PDF / In giấy phép
                </button>
                <button
                  onClick={() => setIsPreviewModalOpen(false)}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition"
                >
                  Đóng
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
