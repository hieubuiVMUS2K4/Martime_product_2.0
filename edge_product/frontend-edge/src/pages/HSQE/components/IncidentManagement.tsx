import { useState, useEffect } from 'react';
import { 
  AlertTriangle, Plus, Search, 
  Trash2, ClipboardList, TrendingUp, CheckCircle2, 
  FileText, Activity
} from 'lucide-react';
import { toast } from 'sonner';
import { apiClient } from '@/services/api.client';
import { printSmsDocument } from '@/lib/printUtils';

// Define Incident Interface
interface CAPAItem {
  id: string;
  type: 'Corrective' | 'Preventive';
  description: string;
  assignee: string;
  dueDate: string;
  completed: boolean;
}

interface IncidentReport {
  id: string;
  code: string;
  title: string;
  type: 'Accident' | 'Incident' | 'Near-Miss' | 'Non-Conformity' | 'PSC-Deficiency';
  vessel: string;
  date: string;
  location: string;
  severity: 'Low' | 'Medium' | 'High' | 'Critical';
  status: 'Reported' | 'Investigating' | 'CAPA_Open' | 'Closed';
  description: string;
  immediateActions: string;
  whys: string[]; // 5 Whys Root Cause Analysis
  rootCause: string;
  capas: CAPAItem[];
}

export function IncidentManagement() {
  const [incidents, setIncidents] = useState<IncidentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSeeding, setIsSeeding] = useState(false);

  const [selectedIncidentId, setSelectedIncidentId] = useState<string>('inc-1');
  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  
  // New Incident Form State
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<'Accident' | 'Incident' | 'Near-Miss' | 'Non-Conformity' | 'PSC-Deficiency'>('Near-Miss');
  const [newVessel, setNewVessel] = useState('M/V Green Star');
  const [newLocation, setNewLocation] = useState('');
  const [newSeverity, setNewSeverity] = useState<'Low' | 'Medium' | 'High' | 'Critical'>('Medium');
  const [newDescription, setNewDescription] = useState('');
  const [newImmediateActions, setNewImmediateActions] = useState('');

  // Investigation Form State
  const [why1, setWhy1] = useState('');
  const [why2, setWhy2] = useState('');
  const [why3, setWhy3] = useState('');
  const [why4, setWhy4] = useState('');
  const [why5, setWhy5] = useState('');
  const [rootCauseInput, setRootCauseInput] = useState('');

  // CAPA Form State
  const [capaType, setCapaType] = useState<'Corrective' | 'Preventive'>('Corrective');
  const [capaDesc, setCapaDesc] = useState('');
  const [capaAssignee, setCapaAssignee] = useState('');
  const [capaDueDate, setCapaDueDate] = useState('');

  // Heinrich pyramid stats state
  const [pyramidStats, setPyramidStats] = useState({
    critical: 0,
    major: 1,
    minor: 28,
    nearMiss: 298,
    unsafeAct: 2998
  });

  const handlePrintIncident = () => {
    if (!selectedIncident) return;
    
    const title = selectedIncident.type === 'Near-Miss' ? 'PHIẾU KHAI BÁO TÌNH HUỐNG CẬN NGUY (TL-04-08)' :
                 selectedIncident.type === 'Non-Conformity' ? 'PHIẾU BÁO CÁO SỰ KHÔNG PHÙ HỢP (TL-04-03)' :
                 selectedIncident.type === 'PSC-Deficiency' ? 'BÁO CÁO KHẮC PHỤC KHIẾM KHUYẾT (TL-04-07)' :
                 'BÁO CÁO TAI NẠN, SỰ CỐ AN TOÀN (TL-04-02)';

    let contentHtml = `
      <h3 style="font-size: 13px; font-weight: bold; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 4px; margin-top: 15px;">I. CHI TIẾT SỰ VIỆC (INCIDENT DETAILS)</h3>
      <table style="width: 100%; border-collapse: collapse; margin-top: 8px; border: none;">
        <tr style="border: none;">
          <td style="border: none; padding: 4px 0; width: 50%;"><strong>Tên tàu báo cáo:</strong> ${selectedIncident.vessel}</td>
          <td style="border: none; padding: 4px 0; width: 50%;"><strong>Vị trí xảy ra:</strong> ${selectedIncident.location}</td>
        </tr>
        <tr style="border: none;">
          <td style="border: none; padding: 4px 0; width: 50%;"><strong>Mức độ nghiêm trọng:</strong> ${selectedIncident.severity}</td>
          <td style="border: none; padding: 4px 0; width: 50%;"><strong>Trạng thái xử lý:</strong> ${selectedIncident.status}</td>
        </tr>
      </table>

      <h3 style="font-size: 12.5px; font-weight: bold; margin-top: 20px; margin-bottom: 5px;">1. Mô tả chi tiết sự việc:</h3>
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 12px; border-radius: 6px; text-align: justify; font-style: italic; font-size: 12.5px;">
        ${selectedIncident.description}
      </div>

      <h3 style="font-size: 12.5px; font-weight: bold; margin-top: 20px; margin-bottom: 5px;">2. Hành động khắc phục tức thời:</h3>
      <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 12px; border-radius: 6px; text-align: justify; font-style: italic; font-size: 12.5px;">
        ${selectedIncident.immediateActions}
      </div>
    `;

    if (selectedIncident.whys && selectedIncident.whys.filter(Boolean).length > 0) {
      contentHtml += `
        <h3 style="font-size: 12.5px; font-weight: bold; margin-top: 20px; margin-bottom: 5px;">3. Phân tích nguyên nhân gốc rễ (5 Whys - TL-04-04):</h3>
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 12px; border-radius: 6px; font-family: monospace; font-size: 12px;">
          ${selectedIncident.whys.filter(Boolean).map((w, i) => `<p style="margin: 4px 0;">Why ${i+1}: ${w}</p>`).join('')}
          <p style="margin-top: 10px; border-top: 1px solid #cbd5e1; padding-top: 6px; font-family: Georgia, serif; color: #047857; font-weight: bold; font-size: 12.5px;">
            👉 Nguyên nhân gốc rễ: ${selectedIncident.rootCause}
          </p>
        </div>
      `;
    }

    if (selectedIncident.capas && selectedIncident.capas.length > 0) {
      contentHtml += `
        <h3 style="font-size: 12.5px; font-weight: bold; margin-top: 20px; margin-bottom: 5px;">4. Kế hoạch hành động CAPA (TL-04-05 / TL-04-07):</h3>
        <table style="width: 100%; border-collapse: collapse; margin-top: 8px;">
          <thead>
            <tr style="background-color: #f1f5f9;">
              <th style="border: 1px solid #94a3b8; padding: 6px; font-weight: bold; text-align: left;">Nội dung hành động khắc phục/phòng ngừa</th>
              <th style="border: 1px solid #94a3b8; padding: 6px; font-weight: bold; text-align: left; width: 120px;">PIC</th>
              <th style="border: 1px solid #94a3b8; padding: 6px; font-weight: bold; text-align: left; width: 100px;">Hạn hoàn thành</th>
              <th style="border: 1px solid #94a3b8; padding: 6px; font-weight: bold; text-align: center; width: 110px;">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            ${selectedIncident.capas.map(c => `
              <tr>
                <td style="border: 1px solid #94a3b8; padding: 6px;">${c.description}</td>
                <td style="border: 1px solid #94a3b8; padding: 6px;">${c.assignee}</td>
                <td style="border: 1px solid #94a3b8; padding: 6px;">${c.dueDate}</td>
                <td style="border: 1px solid #94a3b8; padding: 6px; text-align: center; font-weight: bold; color: ${c.completed ? '#047857' : '#d97706'}">
                  ${c.completed ? 'Hoàn thành' : 'Đang thực hiện'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    printSmsDocument({
      title,
      subtitle: 'BÁO CÁO AN TOÀN & SỰ CỐ - HSQE DEPARTMENT',
      code: selectedIncident.code,
      version: 'Rev 1.0',
      date: selectedIncident.date,
      contentHtml,
      watermark: selectedIncident.status === 'Closed' ? 'ĐÃ ĐÓNG HS' : 'BẢN PHÁT HÀNH',
      signatures: [
        { name: 'Thuyền trưởng', rank: 'Người báo cáo', sigCode: 'SIG-INC-' + selectedIncident.code + '-CAPT', timestamp: selectedIncident.date },
        { name: 'DPA Hải', rank: 'Người kiểm tra', sigCode: 'SIG-INC-' + selectedIncident.code + '-DPA', timestamp: selectedIncident.date },
        { name: 'Giám đốc', rank: 'Phê duyệt đóng HS', sigCode: 'SIG-INC-' + selectedIncident.code + '-DIR', timestamp: selectedIncident.date }
      ]
    });
  };

  const fetchIncidents = async () => {
    setLoading(true);
    try {
      const data = await apiClient.get<any>('/hsqe/incidents');

      const mapped: IncidentReport[] = data.incidents.map((i: any) => ({
        id: i.id,
        code: i.incidentCode,
        title: i.title,
        type: i.incidentType,
        vessel: i.vessel,
        date: i.occurrenceDate ? i.occurrenceDate.split('T')[0] : '',
        location: i.location,
        severity: i.severity,
        status: i.status,
        description: i.description,
        immediateActions: i.immediateActions,
        whys: [i.why1 || '', i.why2 || '', i.why3 || '', i.why4 || '', i.why5 || ''],
        rootCause: i.rootCause || '',
        capas: (i.capas || []).map((c: any) => ({
          id: c.id,
          type: c.actionType,
          description: c.description,
          assignee: c.assignee,
          dueDate: c.dueDate ? c.dueDate.split('T')[0] : '',
          completed: c.completed
        }))
      }));

      setIncidents(mapped);

      if (data.stats && data.stats.heinrich) {
        setPyramidStats({
          critical: data.stats.heinrich.major,
          major: data.stats.heinrich.major,
          minor: data.stats.heinrich.minor + 28,
          nearMiss: data.stats.heinrich.nearMiss + 298,
          unsafeAct: data.stats.heinrich.nearMiss + 2998
        });
      }
    } catch (err) {
      toast.error('Không thể kết nối đến API sự cố');
    } finally {
      setLoading(false);
    }
  };

  const handleSeedData = async () => {
    setIsSeeding(true);
    try {
      await apiClient.post('/hsqe/seed', {});
      toast.success('Khởi tạo dữ liệu mẫu HSQE thành công!');
      await fetchIncidents();
    } catch (err) {
      toast.error('Không thể khởi tạo dữ liệu mẫu');
    } finally {
      setIsSeeding(false);
    }
  };

  useEffect(() => {
    fetchIncidents();
  }, []);

  const selectedIncident = incidents.find(i => i.id === selectedIncidentId) || incidents[0];

  // Set Whys inputs when selected incident changes
  useEffect(() => {
    if (selectedIncident) {
      setWhy1(selectedIncident.whys?.[0] || '');
      setWhy2(selectedIncident.whys?.[1] || '');
      setWhy3(selectedIncident.whys?.[2] || '');
      setWhy4(selectedIncident.whys?.[3] || '');
      setWhy5(selectedIncident.whys?.[4] || '');
      setRootCauseInput(selectedIncident.rootCause || '');
    }
  }, [selectedIncidentId, incidents]);

  const handleAddIncident = async () => {
    if (!newTitle.trim() || !newDescription.trim()) {
      toast.error('Vui lòng điền đầy đủ Tiêu đề và Mô tả sự cố!');
      return;
    }

    try {
      const created = await apiClient.post<any>('/hsqe/incidents', {
        title: newTitle,
        incidentType: newType,
        vessel: newVessel,
        occurrenceDate: new Date().toISOString(),
        location: newLocation,
        severity: newSeverity,
        description: newDescription,
        immediateActions: newImmediateActions
      });
      toast.success(`Đã đăng ký báo cáo mới: ${created.incidentCode}`);
      setIsNewModalOpen(false);

      // Reset form
      setNewTitle('');
      setNewDescription('');
      setNewLocation('');
      setNewImmediateActions('');

      await fetchIncidents();
      setSelectedIncidentId(created.id);
    } catch (err) {
      toast.error('Không thể lưu báo cáo sự cố');
    }
  };

  const saveInvestigation = async () => {
    try {
      await apiClient.put(`/hsqe/incidents/${selectedIncident.id}/investigate`, {
        why1,
        why2,
        why3,
        why4,
        why5,
        rootCause: rootCauseInput
      });

      toast.success('Đã lưu nội dung Phân tích Nguyên nhân Gốc rễ (5 Whys).');
      await fetchIncidents();
    } catch (err) {
      toast.error('Không thể lưu phân tích nguyên nhân');
    }
  };

  const addCAPAItem = async () => {
    if (!capaDesc.trim() || !capaAssignee.trim() || !capaDueDate) {
      toast.error('Vui lòng điền đủ thông tin CAPA!');
      return;
    }

    try {
      await apiClient.post(`/hsqe/incidents/${selectedIncident.id}/capas`, {
        actionType: capaType,
        description: capaDesc,
        assignee: capaAssignee,
        dueDate: new Date(capaDueDate).toISOString()
      });

      setCapaDesc('');
      setCapaAssignee('');
      setCapaDueDate('');
      toast.success('Đã thêm hành động khắc phục phòng ngừa CAPA mới.');
      await fetchIncidents();
    } catch (err) {
      toast.error('Không thể thêm hành động CAPA');
    }
  };

  const toggleCAPACompleted = async (capaId: string) => {
    try {
      await apiClient.put(`/hsqe/incidents/capas/${capaId}/toggle`, {
        verificationDetails: 'Đã xác minh và nghiệm thu thực tế tại hiện trường.'
      });

      toast.success('Đã cập nhật trạng thái thực hiện CAPA.');
      await fetchIncidents();
    } catch (err) {
      toast.error('Không thể cập nhật trạng thái CAPA');
    }
  };

  const deleteIncident = async (id: string) => {
    toast('Bạn chắc chắn muốn xóa báo cáo sự cố này?', {
      action: {
        label: 'Xóa',
        onClick: async () => {
          try {
            await apiClient.delete(`/hsqe/incidents/${id}`);
            toast.success('Đã xóa báo cáo sự cố.');
            await fetchIncidents();
            setSelectedIncidentId('inc-1');
          } catch (err) {
            toast.error('Không thể xóa sự cố');
          }
        }
      }
    });
  };

  // Filter logic
  const filteredIncidents = incidents.filter(inc => {
    const matchesSearch = 
      inc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inc.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      inc.description.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = typeFilter === 'all' || inc.type === typeFilter;
    return matchesSearch && matchesType;
  });

  if (loading) {
    return (
      <div className="w-full h-96 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400">
        <Activity className="w-8 h-8 animate-spin text-blue-500 mb-2" />
        <span className="text-sm font-semibold">Đang tải báo cáo sự cố...</span>
      </div>
    );
  }

  if (incidents.length === 0) {
    return (
      <div className="operations-surface w-full min-h-[500px] flex flex-col items-center justify-center p-8 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-full text-amber-600 dark:text-amber-400 mb-4 animate-pulse">
          <AlertTriangle className="w-12 h-12" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Chưa có báo cáo sự cố nào</h3>
        <p className="text-slate-500 dark:text-slate-400 text-sm max-w-md text-center mb-6">
          Bảng Quản lý Sự cố, Tai nạn & Không phù hợp chưa nhận được thông tin báo cáo nào trong cơ sở dữ liệu.
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
            onClick={() => setIsNewModalOpen(true)}
            className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 rounded-xl font-semibold transition flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Tạo báo cáo sự cố mới
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="operations-surface space-y-4 p-4">
      
      {/* Top Section: Dashboard Analytics with Safety Pyramid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Heinrich Safety Pyramid (Glassmorphic Styled Container) */}
        <div className="lg:col-span-6 bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col items-center">
          <div className="w-full flex justify-between items-center mb-6">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-blue-500" /> Mô hình Kim tự tháp An toàn (Heinrich Pyramid)
            </h3>
            <span className="text-[10px] bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded">
              Dữ liệu mô phỏng tàu + hạm đội
            </span>
          </div>

          {/* Pyramid Render */}
          <div className="w-full max-w-[400px] flex flex-col items-center gap-1.5 font-sans my-4">
            
            {/* Level 1: Major Accidents */}
            <div 
              className="bg-red-600 hover:bg-red-700 text-white w-[15%] h-8 rounded flex items-center justify-center text-xs font-bold transition-all relative group cursor-pointer"
              title="Tai nạn nghiêm trọng (Major Incident)"
            >
              <span>{pyramidStats.major}</span>
              <div className="absolute left-full ml-3 px-2 py-1 bg-slate-900 text-white rounded text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition duration-150 z-10 shadow">
                Tai nạn nghiêm trọng / Tử vong: {pyramidStats.major} vụ
              </div>
            </div>

            {/* Level 2: Minor Accidents */}
            <div 
              className="bg-orange-500 hover:bg-orange-600 text-white w-[35%] h-9 rounded flex items-center justify-center text-xs font-bold transition-all relative group cursor-pointer"
              title="Sự cố nhẹ (Minor Incident)"
            >
              <span>{pyramidStats.minor}</span>
              <div className="absolute left-full ml-3 px-2 py-1 bg-slate-900 text-white rounded text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition duration-150 z-10 shadow">
                Sự cố thương tật nhẹ / Hư hỏng thiết bị: {pyramidStats.minor} vụ
              </div>
            </div>

            {/* Level 3: Near Misses */}
            <div 
              className="bg-yellow-500 hover:bg-yellow-600 text-slate-900 w-[55%] h-10 rounded flex items-center justify-center text-sm font-bold transition-all relative group cursor-pointer"
              title="Tình huống cận nguy (Near Miss)"
            >
              <span>{pyramidStats.nearMiss}</span>
              <div className="absolute left-full ml-3 px-2 py-1 bg-slate-900 text-white rounded text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition duration-150 z-10 shadow">
                Tình huống cận nguy (Near-Miss TL-04-08): {pyramidStats.nearMiss} lỗi
              </div>
            </div>

            {/* Level 4: Unsafe acts/conditions */}
            <div 
              className="bg-sky-500 hover:bg-sky-600 text-white w-[80%] h-11 rounded flex items-center justify-center text-sm font-bold transition-all relative group cursor-pointer"
              title="Hành vi không an toàn (Unsafe Acts)"
            >
              <span>{pyramidStats.unsafeAct}</span>
              <div className="absolute left-full ml-3 px-2 py-1 bg-slate-900 text-white rounded text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition duration-150 z-10 shadow">
                Hành vi / Điều kiện không an toàn: {pyramidStats.unsafeAct} lần phát hiện
              </div>
            </div>

          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center mt-3">
            * Nguyên lý Heinrich: Cứ 1 tai nạn nghiêm trọng sẽ có 29 tai nạn nhẹ và 300 tình huống cận nguy. Số hóa giúp tăng cường báo cáo cận nguy để phòng ngừa tai nạn lớn.
          </p>
        </div>

        {/* Quick analytics metrics */}
        <div className="lg:col-span-6 grid grid-cols-2 gap-4">
          <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Tổng Sự cố & Khiếu nại</span>
              <span className="p-2 bg-blue-50 dark:bg-blue-900/30 text-blue-600 rounded-lg"><ClipboardList className="w-5 h-5" /></span>
            </div>
            <div>
              <p className="text-3xl font-extrabold text-slate-900 dark:text-white mt-4">{incidents.length}</p>
              <p className="text-xs text-slate-500 mt-1">Được theo dõi trên tàu hiện hành</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Hành động CAPA quá hạn</span>
              <span className="p-2 bg-red-50 dark:bg-red-900/30 text-red-600 rounded-lg"><AlertTriangle className="w-5 h-5" /></span>
            </div>
            <div>
              <p className="text-3xl font-extrabold text-red-600 mt-4">0</p>
              <p className="text-xs text-slate-500 mt-1">Hành động khắc phục trễ hạn</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Đang điều tra (RCA)</span>
              <span className="p-2 bg-amber-50 dark:bg-amber-900/30 text-amber-600 rounded-lg"><Activity className="w-5 h-5" /></span>
            </div>
            <div>
              <p className="text-3xl font-extrabold text-amber-600 mt-4">
                {incidents.filter(i => i.status === 'Investigating').length}
              </p>
              <p className="text-xs text-slate-500 mt-1">Yêu cầu hoàn tất phân tích 5 Whys</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start">
              <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Đã khắc phục hoàn tất</span>
              <span className="p-2 bg-green-50 dark:bg-green-900/30 text-green-600 rounded-lg"><CheckCircle2 className="w-5 h-5" /></span>
            </div>
            <div>
              <p className="text-3xl font-extrabold text-green-600 mt-4">
                {incidents.filter(i => i.status === 'Closed').length}
              </p>
              <p className="text-xs text-slate-500 mt-1">Đã đóng hồ sơ sự cố an toàn</p>
            </div>
          </div>
        </div>

      </div>

      {/* Bottom Section: Incident Register and CAPA Investigator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        
        {/* Left Side: Sổ nhật ký sự cố */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col h-[650px]">
          <div className="flex justify-between items-center mb-4">
            <h3 className="operations-section-title">Sổ theo dõi sự cố & điểm KPH</h3>
            <button 
              onClick={() => setIsNewModalOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition"
            >
              <Plus className="w-4 h-4" /> Báo cáo mới
            </button>
          </div>

          {/* Filters and search */}
          <div className="flex gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm kiếm sự cố..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-xs px-2 focus:outline-none"
            >
              <option value="all">Tất cả loại</option>
              <option value="Accident">Tai nạn (Accident)</option>
              <option value="Incident">Sự cố (Incident)</option>
              <option value="Near-Miss">Cận nguy (Near-Miss)</option>
              <option value="Non-Conformity">Không phù hợp (NC)</option>
              <option value="PSC-Deficiency">Khiếm khuyết PSC</option>
            </select>
          </div>

          {/* List items */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {filteredIncidents.map(inc => {
              const isSelected = selectedIncident.id === inc.id;
              
              const typeLabels = {
                'Accident': { text: 'Tai nạn', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
                'Incident': { text: 'Sự cố', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
                'Near-Miss': { text: 'Cận nguy', color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
                'Non-Conformity': { text: 'Không phù hợp', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
                'PSC-Deficiency': { text: 'Khiếm khuyết PSC', color: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400' }
              };

              const statusLabels = {
                'Reported': { text: 'Mới báo cáo', color: 'bg-slate-100 text-slate-700' },
                'Investigating': { text: 'Đang điều tra', color: 'bg-amber-100 text-amber-700' },
                'CAPA_Open': { text: 'CAPA đang chạy', color: 'bg-blue-100 text-blue-700' },
                'Closed': { text: 'Đã hoàn thành', color: 'bg-green-100 text-green-700' }
              };

              const label = typeLabels[inc.type];
              const statLabel = statusLabels[inc.status];

              return (
                <div
                  key={inc.id}
                  onClick={() => setSelectedIncidentId(inc.id)}
                  className={`p-4 rounded-xl border cursor-pointer transition-all duration-150 ${
                    isSelected
                      ? 'bg-blue-50 dark:bg-blue-900/25 border-blue-200 dark:border-blue-800'
                      : 'bg-white dark:bg-slate-800/40 border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/30'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <span className="text-[10px] font-mono font-bold text-slate-400 dark:text-slate-500">{inc.code}</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold uppercase ${label.color}`}>
                        {label.text}
                      </span>
                    </div>
                  </div>
                  
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate">{inc.title}</h4>
                  
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-[10px] text-slate-400">{inc.vessel} • {inc.date}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${statLabel.color}`}>
                      {statLabel.text}
                    </span>
                  </div>
                </div>
              );
            })}

            {filteredIncidents.length === 0 && (
              <div className="h-64 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                <AlertTriangle className="w-8 h-8 mb-2" />
                <span className="text-xs">Không tìm thấy báo cáo sự cố nào</span>
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Chi tiết sự cố, Điều tra 5 Whys & CAPA */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm border border-slate-200 dark:border-slate-700 flex flex-col h-[650px] overflow-y-auto">
          
          <div className="flex justify-between items-start border-b border-slate-200 dark:border-slate-700 pb-4 mb-4">
            <div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="font-mono">{selectedIncident.code}</span>
                <span>•</span>
                <span>Vị trí: {selectedIncident.location}</span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-1">
                {selectedIncident.title}
              </h3>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPreviewModalOpen(true)}
                className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-1 font-semibold transition"
              >
                <FileText className="w-3.5 h-3.5" /> Xuất Mẫu biểu
              </button>
              <button
                onClick={() => deleteIncident(selectedIncident.id)}
                className="p-1.5 hover:bg-red-50 text-red-500 hover:text-red-700 rounded-lg transition"
                title="Xóa báo cáo"
              >
                <Trash2 className="w-4.5 h-4.5" />
              </button>
            </div>
          </div>

          {/* Incident Info */}
          <div className="space-y-4 text-sm text-slate-700 dark:text-slate-300">
            <div>
              <span className="block text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Mô tả sự việc:</span>
              <p className="bg-slate-50 dark:bg-slate-900 p-3.5 rounded-xl text-xs leading-relaxed border border-slate-100 dark:border-slate-800 mt-1">
                {selectedIncident.description}
              </p>
            </div>

            <div>
              <span className="block text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Hành động khắc phục ngay lập tức:</span>
              <p className="bg-emerald-50/50 dark:bg-emerald-950/10 text-emerald-800 dark:text-emerald-400 p-3.5 rounded-xl text-xs leading-relaxed border border-emerald-100 dark:border-emerald-950/30 mt-1">
                {selectedIncident.immediateActions}
              </p>
            </div>

            {/* RCA 5 Whys section */}
            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
              <span className="block text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                Phân tích nguyên nhân gốc rễ (Root Cause Analysis - 5 Whys) - TL-04-04
              </span>
              
              <div className="space-y-2 bg-slate-50 dark:bg-slate-950/30 p-4 rounded-2xl border border-slate-150 dark:border-slate-850">
                <div className="flex gap-2 items-center">
                  <span className="text-[10px] font-bold text-slate-400 shrink-0 w-12">Tại sao 1:</span>
                  <input
                    type="text"
                    value={why1}
                    onChange={(e) => setWhy1(e.target.value)}
                    placeholder="Tại sao sự việc xảy ra?"
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-[10px] font-bold text-slate-400 shrink-0 w-12">Tại sao 2:</span>
                  <input
                    type="text"
                    value={why2}
                    onChange={(e) => setWhy2(e.target.value)}
                    placeholder="Tại sao của nguyên nhân 1?"
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-[10px] font-bold text-slate-400 shrink-0 w-12">Tại sao 3:</span>
                  <input
                    type="text"
                    value={why3}
                    onChange={(e) => setWhy3(e.target.value)}
                    placeholder="Tại sao của nguyên nhân 2?"
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-[10px] font-bold text-slate-400 shrink-0 w-12">Tại sao 4:</span>
                  <input
                    type="text"
                    value={why4}
                    onChange={(e) => setWhy4(e.target.value)}
                    placeholder="Tại sao của nguyên nhân 3?"
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div className="flex gap-2 items-center">
                  <span className="text-[10px] font-bold text-slate-400 shrink-0 w-12">Tại sao 5:</span>
                  <input
                    type="text"
                    value={why5}
                    onChange={(e) => setWhy5(e.target.value)}
                    placeholder="Tại sao của nguyên nhân 4 (Nguyên nhân gốc rễ)?"
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800 flex gap-2 items-center">
                  <span className="text-xs font-bold text-blue-900 dark:text-blue-300 w-32">Nguyên nhân gốc rễ:</span>
                  <input
                    type="text"
                    value={rootCauseInput}
                    onChange={(e) => setRootCauseInput(e.target.value)}
                    placeholder="Nhập kết luận nguyên nhân cốt lõi..."
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    onClick={saveInvestigation}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm"
                  >
                    Lưu
                  </button>
                </div>
              </div>
            </div>

            {/* CAPA action list */}
            <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
              <span className="block text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">
                Hành động Khắc phục & Phòng ngừa (CAPA) - TL-04-05
              </span>

              {/* CAPA items list */}
              <div className="space-y-2 mb-4">
                {selectedIncident.capas && selectedIncident.capas.map((capa) => (
                  <div 
                    key={capa.id}
                    className={`flex items-start justify-between p-3.5 rounded-xl border text-xs ${
                      capa.completed 
                        ? 'bg-slate-50/50 dark:bg-slate-900/10 border-slate-100 dark:border-slate-800 text-slate-450 line-through' 
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    <div className="flex gap-3">
                      <input
                        type="checkbox"
                        checked={capa.completed}
                        onChange={() => toggleCAPACompleted(capa.id)}
                        className="mt-0.5 rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                      />
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${
                            capa.type === 'Corrective' 
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30' 
                              : 'bg-teal-100 text-teal-800 dark:bg-teal-900/30'
                          }`}>
                            {capa.type === 'Corrective' ? 'Khắc phục ngay' : 'Phòng ngừa lâu dài'}
                          </span>
                          <span className="text-slate-400">• PIC: {capa.assignee}</span>
                        </div>
                        <p className="mt-1 text-slate-800 dark:text-slate-200 font-semibold">{capa.description}</p>
                      </div>
                    </div>
                    
                    <span className="text-[10px] text-slate-400 shrink-0">Hạn: {capa.dueDate}</span>
                  </div>
                ))}

                {(!selectedIncident.capas || selectedIncident.capas.length === 0) && (
                  <p className="text-slate-400 text-xs italic text-center py-2">Chưa lập kế hoạch hành động khắc phục phòng ngừa CAPA.</p>
                )}
              </div>

              {/* Add CAPA inline form */}
              <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-2xl border border-slate-150 dark:border-slate-700 space-y-3">
                <p className="text-xs font-bold text-slate-600 dark:text-slate-400">Thêm hành động CAPA mới:</p>
                
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <select
                    value={capaType}
                    onChange={(e) => setCapaType(e.target.value as any)}
                    className="md:col-span-3 px-2 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-xs focus:outline-none"
                  >
                    <option value="Corrective">Khắc phục</option>
                    <option value="Preventive">Phòng ngừa</option>
                  </select>
                  
                  <input
                    type="text"
                    value={capaDesc}
                    onChange={(e) => setCapaDesc(e.target.value)}
                    placeholder="Mô tả hành động cần làm..."
                    className="md:col-span-9 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={capaAssignee}
                    onChange={(e) => setCapaAssignee(e.target.value)}
                    placeholder="Người chịu trách nhiệm thực hiện..."
                    className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  
                  <div className="flex gap-2">
                    <input
                      type="date"
                      value={capaDueDate}
                      onChange={(e) => setCapaDueDate(e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none"
                    />
                    <button
                      onClick={addCAPAItem}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-1.5 rounded-xl flex items-center gap-1 shadow"
                    >
                      Thêm
                    </button>
                  </div>
                </div>

              </div>

            </div>
          </div>

        </div>

      </div>

      {/* New Incident Modal */}
      {isNewModalOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 max-w-xl w-full border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-150">
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                Báo cáo Sự cố / Tai nạn / Tình huống cận nguy mới (TL-04)
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Lưu ý: Mọi khai báo phải trung thực, chính xác nhằm đảm bảo an toàn vận hành chung của đội tàu.
              </p>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Loại Báo cáo</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none"
                  >
                    <option value="Accident">Tai nạn (Accident - TL-04-02)</option>
                    <option value="Incident">Sự cố (Incident - TL-04-02)</option>
                    <option value="Near-Miss">Tình huống cận nguy (Near-Miss - TL-04-08)</option>
                    <option value="Non-Conformity">Sự không phù hợp (Non-Conformity - TL-04-03)</option>
                    <option value="PSC-Deficiency">Khiếm khuyết PSC / Đăng kiểm (TL-04-07)</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Độ nghiêm trọng ban đầu</label>
                  <select
                    value={newSeverity}
                    onChange={(e) => setNewSeverity(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none"
                  >
                    <option value="Low">Thấp (Không nguy hiểm)</option>
                    <option value="Medium">Vừa (Hư hỏng nhẹ / Trầy xước)</option>
                    <option value="High">Cao (Tai nạn nhẹ / Hỏng thiết bị chính)</option>
                    <option value="Critical">Nghiêm trọng (Tai nạn lớn / Đe dọa tính mạng)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Tên sự việc</label>
                <input 
                  type="text" 
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ví dụ: Rò rỉ dầu thủy lực tời neo boong mũi..."
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Tên tàu báo cáo</label>
                  <select
                    value={newVessel}
                    onChange={(e) => setNewVessel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none"
                  >
                    <option value="M/V Green Star">M/V Green Star</option>
                    <option value="M/V Sunrise">M/V Sunrise</option>
                    <option value="M/V Orion">M/V Orion</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Vị trí xảy ra</label>
                  <input 
                    type="text" 
                    value={newLocation}
                    onChange={(e) => setNewLocation(e.target.value)}
                    placeholder="Ví dụ: Cabin A3, Buồng máy chính..."
                    className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Mô tả chi tiết sự việc</label>
                <textarea 
                  rows={4}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Mô tả diễn biến sự việc, hành động mất an toàn hoặc hư hỏng cụ thể..."
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Hành động khắc phục ngay tức khắc</label>
                <input 
                  type="text" 
                  value={newImmediateActions}
                  onChange={(e) => setNewImmediateActions(e.target.value)}
                  placeholder="Ví dụ: Đóng van cách ly dầu, đưa thuyền viên đi sơ cứu..."
                  className="w-full px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-100 dark:border-slate-700 pt-5">
              <button
                onClick={() => setIsNewModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleAddIncident}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition"
              >
                Gửi Báo cáo sự cố
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Export Preview Modal */}
      {isPreviewModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 max-w-2xl w-full border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col gap-6 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-hidden">
            
            <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Xuất Mẫu biểu Báo cáo An toàn
                </h3>
                <p className="text-xs text-slate-400">
                  Xuất văn bản chính thức theo quy định Quản lý An toàn hàng hải.
                </p>
              </div>
              <button onClick={() => setIsPreviewModalOpen(false)} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-655">✕</button>
            </div>

            {/* Document sheet */}
            <div className="flex-1 overflow-y-auto p-4 bg-slate-100 dark:bg-slate-900 rounded-2xl flex justify-center py-6">
              <div className="bg-white text-slate-900 w-full max-w-[500px] shadow border border-slate-200 p-8 flex flex-col justify-between relative font-sans text-xs">
                
                {/* Header */}
                <div className="border-b-2 border-slate-950 pb-3 flex justify-between items-start">
                  <div>
                    <h4 className="font-extrabold text-xs text-slate-950 uppercase tracking-wide">MARITIME FLT SYSTEM</h4>
                    <p className="text-[8px] text-slate-400">HSQE Safety Department</p>
                  </div>
                  <div className="text-right text-[8px] text-slate-500 space-y-0.5">
                    <p>Mã mẫu biểu: <strong>{selectedIncident.code}</strong></p>
                    <p>Ngày báo cáo: {selectedIncident.date}</p>
                    <p>Quy trình: <strong>TL-04</strong></p>
                  </div>
                </div>

                <div className="my-5 space-y-4">
                  <h2 className="text-center font-bold text-sm uppercase tracking-wide border-b border-slate-200 pb-2">
                    {selectedIncident.type === 'Near-Miss' ? 'PHIẾU KHAI BÁO TÌNH HUỐNG CẬN NGUY (TL-04-08)' :
                     selectedIncident.type === 'Non-Conformity' ? 'PHIẾU BÁO CÁO SỰ KHÔNG PHÙ HỢP (TL-04-03)' :
                     selectedIncident.type === 'PSC-Deficiency' ? 'BÁO CÁO KHẮC PHỤC KHIẾM KHUYẾT (TL-04-07)' :
                     'BÁO CÁO TAI NẠN, SỰ CỐ AN TOÀN (TL-04-02)'}
                  </h2>

                  <div className="grid grid-cols-2 gap-3 text-[10px] text-slate-800">
                    <p><strong>Tên tàu báo cáo:</strong> {selectedIncident.vessel}</p>
                    <p><strong>Vị trí xảy ra:</strong> {selectedIncident.location}</p>
                    <p><strong>Mức độ nghiêm trọng:</strong> {selectedIncident.severity}</p>
                    <p><strong>Trạng thái:</strong> {selectedIncident.status}</p>
                  </div>

                  <div className="border-t border-slate-100 pt-2 space-y-1">
                    <p className="font-bold text-[10px]">1. Mô tả chi tiết sự việc:</p>
                    <p className="text-slate-650 bg-slate-50 p-2 rounded leading-relaxed">{selectedIncident.description}</p>
                  </div>

                  <div className="space-y-1">
                    <p className="font-bold text-[10px]">2. Hành động khắc phục tức thời:</p>
                    <p className="text-slate-650 bg-slate-50 p-2 rounded leading-relaxed">{selectedIncident.immediateActions}</p>
                  </div>

                  {selectedIncident.whys && selectedIncident.whys[0] && (
                    <div className="space-y-1">
                      <p className="font-bold text-[10px]">3. Phân tích nguyên nhân gốc rễ (5 Whys - TL-04-04):</p>
                      <div className="bg-slate-50 p-2.5 rounded text-[9.5px] space-y-1 font-mono text-slate-700">
                        {selectedIncident.whys.filter(Boolean).map((w, i) => (
                          <p key={i}>{w}</p>
                        ))}
                        <p className="mt-2 border-t border-slate-200 pt-1 font-sans text-[10px] text-blue-900 font-bold">
                          👉 Nguyên nhân gốc rễ: {selectedIncident.rootCause}
                        </p>
                      </div>
                    </div>
                  )}

                  {selectedIncident.capas && selectedIncident.capas.length > 0 && (
                    <div className="space-y-1">
                      <p className="font-bold text-[10px]">4. Kế hoạch hành động CAPA (TL-04-05 / TL-04-07):</p>
                      <div className="border border-slate-200 rounded overflow-hidden">
                        <table className="w-full text-left border-collapse text-[9.5px]">
                          <thead>
                            <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                              <th className="p-1 px-2">Hành động</th>
                              <th className="p-1">PIC</th>
                              <th className="p-1">Hạn</th>
                              <th className="p-1">Trạng thái</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedIncident.capas.map((c, i) => (
                              <tr key={i} className="border-b border-slate-150 last:border-b-0">
                                <td className="p-1 px-2 font-medium">{c.description}</td>
                                <td className="p-1 text-slate-500">{c.assignee}</td>
                                <td className="p-1 text-slate-500">{c.dueDate}</td>
                                <td className="p-1 font-bold text-slate-650">{c.completed ? 'Hoàn thành' : 'Đang thực hiện'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer signatures */}
                <div className="border-t border-slate-200 pt-4 flex justify-between items-center text-[9px] text-slate-500">
                  <div className="text-center w-24">
                    <p>Người báo cáo</p>
                    <p className="mt-8 font-bold text-slate-800">Thuyền trưởng</p>
                  </div>
                  <div className="text-center w-24">
                    <p>Người kiểm tra</p>
                    <div className="text-[10px] text-blue-950 font-serif rotate-6 select-none my-1 font-bold">N.V.Hải</div>
                    <p className="font-bold text-slate-800">DPA Hải</p>
                  </div>
                  <div className="text-center w-24">
                    <p>Phê duyệt đóng HS</p>
                    <div className="text-[10px] text-red-600 font-serif rotate-6 select-none my-1 font-bold">T.Q.Tuấn</div>
                    <p className="font-bold text-slate-800">Giám đốc</p>
                  </div>
                </div>

              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-700 pt-4">
              <span className="text-xs text-slate-400">Ấn nút In để lưu bản cứng hoặc đóng file.</span>
              <div className="flex gap-2">
                <button
                  onClick={handlePrintIncident}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Tải PDF / In báo cáo
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
