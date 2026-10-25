import { CatalogSelect } from '@/components/common/CatalogSelect';
import { CARGO_TYPES } from '@/config/catalogs';
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, Plus, X } from 'lucide-react';
import { voyageApi } from '../../services/voyage.service';
import type {
  CreateBunkerPlanRequest, CreateCargoPlanRequest, CreateCrewChangePlanRequest,
  CreateVoyageRequest, CreatePlanLegRequest, CreatePortCallRequest,
  CreateCostEstimateRequest, CreateRevenueEstimateRequest,
  CreateVoyageExpenseRequest, CreateVoyageAdvancePaymentRequest,
  CreateVoyageDisbursementRequest, CreateVoyageActualRevenueRequest,
  CreateVoyageSettlementRequest, VoyageDetail,
} from '../../types/voyage.types';
import { PortSelect } from '../../components/common/PortSelect';
import './VoyageManagement.css';

const STATUSES = ['PLANNING', 'APPROVED', 'READY', 'UNDERWAY', 'ARRIVED', 'COMPLETED', 'CANCELLED'];
const CHARTER_TYPES = ['Time Charter', 'Voyage Charter', 'Bareboat Charter', 'Contract of Affreightment', 'Spot Charter'];
const LEG_TYPES = ['PASSAGE', 'PORT_STAY', 'ANCHORAGE', 'CANAL_TRANSIT', 'BUNKERING'];
const CALL_TYPES = ['LOADING', 'DISCHARGE', 'BUNKERING', 'CREW_CHANGE', 'MAINTENANCE', 'INSPECTION', 'TRANSIT'];
const COST_CATS = ['BUNKER', 'PORT_CHARGES', 'CANAL_DUES', 'CREW_WAGES', 'INSURANCE', 'MAINTENANCE', 'PROVISIONS', 'OTHER'];
const REV_CATS = ['FREIGHT', 'DEMURRAGE', 'CHARTER_HIRE', 'OTHER'];
const ADV_TYPES = ['PORT_ADVANCE', 'CREW_WAGES', 'BUNKER', 'OTHER'];
const EXP_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED'];
const ADV_STATUSES = ['PENDING', 'PAID', 'SETTLED'];
const DISB_STATUSES = ['RECORDED', 'VERIFIED', 'PAID'];
const AREV_STATUSES = ['INVOICED', 'RECEIVED', 'CANCELLED'];
const SETT_STATUSES = ['DRAFT', 'PREPARED', 'REVIEWED', 'APPROVED', 'CLOSED'];
const CARGO_OPS = ['LOADING', 'DISCHARGING', 'TRANSSHIPMENT'];
const FUEL_TYPES = ['HFO', 'VLSFO', 'MGO', 'MDO', 'LNG'];
const BUNKER_OPS = ['SUPPLY', 'TRANSFER'];
const CREW_CHANGES = ['EMBARK', 'DISEMBARK', 'ROTATION'];

interface Form {
  voyageNumber: string; vesselIMO: string; vesselName: string; vesselFlag: string;
  callSign: string; charterType: string; departurePort: string; departurePortCode: string;
  departureTime: string; arrivalPort: string; arrivalPortCode: string; arrivalTime: string;
  previousPortCode: string; previousPortName: string; cargoType: string; cargoWeight: string;
  plannedDistance: string; plannedDurationHours: string; plannedAverageSpeed: string;
  plannedFuelConsumption: string; voyageInstructions: string; voyageStatus: string;
}

const emptyForm: Form = {
  voyageNumber: '', vesselIMO: '', vesselName: '', vesselFlag: '', callSign: '',
  charterType: '', departurePort: '', departurePortCode: '', departureTime: '',
  arrivalPort: '', arrivalPortCode: '', arrivalTime: '', previousPortCode: '',
  previousPortName: '', cargoType: '', cargoWeight: '', plannedDistance: '',
  plannedDurationHours: '', plannedAverageSpeed: '', plannedFuelConsumption: '',
  voyageInstructions: '', voyageStatus: 'PLANNING',
};

const mkLeg = (seq: number): CreatePlanLegRequest => ({ sequence: seq, legType: 'PASSAGE', fromPortCode: '', fromPortName: '', toPortCode: '', toPortName: '' });
const mkPort = (seq: number): CreatePortCallRequest => ({ sequence: seq, callType: 'LOADING', portCode: '', portName: '' });
const mkCost = (seq: number): CreateCostEstimateRequest => ({ sequence: seq, costCategory: '', estimatedAmount: 0, currency: 'USD' });
const mkRev = (seq: number): CreateRevenueEstimateRequest => ({ sequence: seq, revenueCategory: '', estimatedAmount: 0, currency: 'USD' });
const mkCargo = (seq: number): CreateCargoPlanRequest => ({ sequence: seq, operationType: 'LOADING', cargoType: '', plannedQuantity: 0, unit: 'MT' });
const mkBunker = (seq: number): CreateBunkerPlanRequest => ({ sequence: seq, fuelType: 'VLSFO', plannedQuantity: 0, operationType: 'SUPPLY' });
const mkCrew = (seq: number): CreateCrewChangePlanRequest => ({ sequence: seq, changeType: 'ROTATION' });
const mkExp = (): CreateVoyageExpenseRequest => ({ costCategory: '', requestedAmount: 0, currency: 'USD', exchangeRate: 1, allocationScope: 'VOYAGE', status: 'DRAFT' });
const mkAdv = (): CreateVoyageAdvancePaymentRequest => ({ advanceType: '', amount: 0, currency: 'USD', exchangeRate: 1, status: 'PENDING' });
const mkDisb = (): CreateVoyageDisbursementRequest => ({ costCategory: '', amount: 0, currency: 'USD', exchangeRate: 1, allocationScope: 'VOYAGE', status: 'RECORDED' });
const mkARev = (): CreateVoyageActualRevenueRequest => ({ revenueCategory: '', amount: 0, currency: 'USD', exchangeRate: 1, status: 'INVOICED' });
const mkSett = (): CreateVoyageSettlementRequest => ({ status: 'DRAFT' });

/* Helper: compact form group */
function G({ l, children, full }: { l: string; children: React.ReactNode; full?: boolean }) {
  return <div className={`vf-group${full ? ' vf-group--full' : ''}`}><label>{l}</label>{children}</div>;
}

/* Helper: remove item from array and resequence */
function removeSeq<T extends { sequence?: number }>(arr: T[], idx: number): T[] {
  return arr.filter((_, i) => i !== idx).map((item, i) => ({ ...item, sequence: i + 1 }));
}

export const VoyageFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  // Vessel context from URL params (passed from vessel list/detail page)
  const vesselIMOParam = searchParams.get('vesselIMO') || '';
  const vesselNameParam = searchParams.get('vesselName') || '';
  const vesselLocked = !!(vesselIMOParam || vesselNameParam);

  const [form, setForm] = useState<Form>({
    ...emptyForm,
    ...(!isEdit && vesselIMOParam ? { vesselIMO: vesselIMOParam } : {}),
    ...(!isEdit && vesselNameParam ? { vesselName: vesselNameParam } : {}),
  });
  const [planLegs, setPlanLegs] = useState<CreatePlanLegRequest[]>([]);
  const [portCalls, setPortCalls] = useState<CreatePortCallRequest[]>([]);
  const [cargoPlans, setCargoPlans] = useState<CreateCargoPlanRequest[]>([]);
  const [bunkerPlans, setBunkerPlans] = useState<CreateBunkerPlanRequest[]>([]);
  const [crewChangePlans, setCrewChangePlans] = useState<CreateCrewChangePlanRequest[]>([]);
  const [costEstimates, setCostEstimates] = useState<CreateCostEstimateRequest[]>([]);
  const [revenueEstimates, setRevenueEstimates] = useState<CreateRevenueEstimateRequest[]>([]);
  const [expenseRequests, setExpenseRequests] = useState<CreateVoyageExpenseRequest[]>([]);
  const [advancePayments, setAdvancePayments] = useState<CreateVoyageAdvancePaymentRequest[]>([]);
  const [disbursements, setDisbursements] = useState<CreateVoyageDisbursementRequest[]>([]);
  const [actualRevenues, setActualRevenues] = useState<CreateVoyageActualRevenueRequest[]>([]);
  const [settlements, setSettlements] = useState<CreateVoyageSettlementRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState('basic');

  useEffect(() => { if (isEdit) loadVoyage(); }, [id]);

  async function loadVoyage() {
    if (!id) return;
    setLoading(true);
    try {
      const d: VoyageDetail = await voyageApi.getVoyageDetail(id);
      setForm({
        voyageNumber: d.voyageNumber || '', vesselIMO: d.vesselIMO || '',
        vesselName: d.vesselName || '', vesselFlag: d.vesselFlag || '',
        callSign: d.callSign || '', charterType: d.charterType || '',
        departurePort: d.departurePort || '', departurePortCode: d.departurePortCode || '',
        departureTime: d.departureTime ? d.departureTime.slice(0, 16) : '',
        arrivalPort: d.arrivalPort || '', arrivalPortCode: d.arrivalPortCode || '',
        arrivalTime: d.arrivalTime ? d.arrivalTime.slice(0, 16) : '',
        previousPortCode: d.previousPortCode || '', previousPortName: d.previousPortName || '',
        cargoType: d.cargoType || '', cargoWeight: d.cargoWeight?.toString() || '',
        plannedDistance: d.plannedDistance?.toString() || '',
        plannedDurationHours: d.plannedDurationHours?.toString() || '',
        plannedAverageSpeed: d.plannedAverageSpeed?.toString() || '',
        plannedFuelConsumption: d.plannedFuelConsumption?.toString() || '',
        voyageInstructions: d.voyageInstructions || '', voyageStatus: d.voyageStatus || 'PLANNING',
      });
      setPlanLegs(d.planLegs.map(l => ({
        sequence: l.sequence, legType: l.legType, fromPortCode: l.fromPortCode,
        fromPortName: l.fromPortName, toPortCode: l.toPortCode, toPortName: l.toPortName,
        plannedDepartureTime: l.plannedDepartureTime, plannedArrivalTime: l.plannedArrivalTime,
        plannedDistance: l.plannedDistance, plannedDurationHours: l.plannedDurationHours,
        plannedAverageSpeed: l.plannedAverageSpeed, cargoActivity: l.cargoActivity,
        crewChangePlanned: l.crewChangePlanned, bunkerSupplyPlanned: l.bunkerSupplyPlanned,
        plannedFuelConsumption: l.plannedFuelConsumption, weatherRoutingNotes: l.weatherRoutingNotes,
        notes: l.notes,
      })));
      setPortCalls(d.portCalls.map(p => ({
        sequence: p.sequence, callType: p.callType, portCode: p.portCode, portName: p.portName,
        country: p.country, arrivalTime: p.arrivalTime, departureTime: p.departureTime,
        berthNumber: p.berthNumber, remarks: p.remarks,
      })));
      setCargoPlans((d.cargoPlans || []).map((cp, i) => ({
        planLegId: cp.planLegId, sequence: cp.sequence ?? i + 1, operationType: cp.operationType,
        cargoType: cp.cargoType, cargoDescription: cp.cargoDescription, plannedQuantity: cp.plannedQuantity,
        unit: cp.unit, portCode: cp.portCode, portName: cp.portName, shipperName: cp.shipperName,
        consigneeName: cp.consigneeName, specialRequirements: cp.specialRequirements, notes: cp.notes,
      })));
      setBunkerPlans((d.bunkerPlans || []).map((bp, i) => ({
        planLegId: bp.planLegId, sequence: bp.sequence ?? i + 1, fuelType: bp.fuelType,
        plannedQuantity: bp.plannedQuantity, operationType: bp.operationType, portCode: bp.portCode,
        portName: bp.portName, estimatedCostUsd: bp.estimatedCostUsd, supplierName: bp.supplierName,
        notes: bp.notes,
      })));
      setCrewChangePlans((d.crewChangePlans || []).map((c, i) => ({
        planLegId: c.planLegId, sequence: c.sequence ?? i + 1, crewMemberId: c.crewMemberId,
        rankId: c.rankId, changeType: c.changeType, portCode: c.portCode, portName: c.portName,
        plannedDate: c.plannedDate, replacementReason: c.replacementReason, notes: c.notes,
      })));
      setCostEstimates((d.costEstimates || []).map((c, i) => ({
        sequence: c.sequence ?? i + 1, costCategory: c.costCategory || '', description: c.description,
        estimatedAmount: c.estimatedAmount || 0, currency: c.currency || 'USD', notes: c.notes,
      })));
      setRevenueEstimates((d.revenueEstimates || []).map((r, i) => ({
        sequence: r.sequence ?? i + 1, revenueCategory: r.revenueCategory || '', description: r.description,
        estimatedAmount: r.estimatedAmount || 0, currency: r.currency || 'USD', notes: r.notes,
      })));
      setExpenseRequests((d.expenseRequests || []).map(e => ({
        requestNumber: e.requestNumber, costCategory: e.costCategory || '', allocationScope: e.allocationScope,
        description: e.description, requestedAmount: e.requestedAmount || 0, currency: e.currency || 'USD',
        exchangeRate: e.exchangeRate ?? 1, vendorName: e.vendorName, portCode: e.portCode,
        portName: e.portName, status: e.status || 'DRAFT', requestedBy: e.requestedBy,
        approvedBy: e.approvedBy, approvedAmount: e.approvedAmount, notes: e.notes,
      })));
      setAdvancePayments((d.advancePayments || []).map(a => ({
        advanceNumber: a.advanceNumber, advanceType: a.advanceType || '', description: a.description,
        amount: a.amount || 0, currency: a.currency || 'USD', exchangeRate: a.exchangeRate ?? 1,
        recipientName: a.recipientName, portCode: a.portCode, portName: a.portName,
        status: a.status || 'PENDING', paidBy: a.paidBy, settledAmount: a.settledAmount, notes: a.notes,
      })));
      setDisbursements((d.disbursements || []).map(x => ({
        disbursementNumber: x.disbursementNumber, costCategory: x.costCategory || '',
        allocationScope: x.allocationScope, description: x.description, amount: x.amount || 0,
        currency: x.currency || 'USD', exchangeRate: x.exchangeRate ?? 1, vendorName: x.vendorName,
        invoiceNumber: x.invoiceNumber, portCode: x.portCode, portName: x.portName,
        status: x.status || 'RECORDED', notes: x.notes,
      })));
      setActualRevenues((d.actualRevenues || []).map(a => ({
        revenueNumber: a.revenueNumber, revenueCategory: a.revenueCategory || '', description: a.description,
        amount: a.amount || 0, currency: a.currency || 'USD', exchangeRate: a.exchangeRate ?? 1,
        payerName: a.payerName, invoiceNumber: a.invoiceNumber, status: a.status || 'INVOICED', notes: a.notes,
      })));
      setSettlements((d.settlements || []).map(s => ({
        settlementNumber: s.settlementNumber, status: s.status || 'DRAFT',
        totalExpenseApproved: s.totalExpenseApproved, totalAdvanced: s.totalAdvanced,
        totalDisbursed: s.totalDisbursed, totalRevenue: s.totalRevenue, netResult: s.netResult,
        advanceBalance: s.advanceBalance, finalSettlementAmount: s.finalSettlementAmount,
        summary: s.summary, preparedBy: s.preparedBy, reviewedBy: s.reviewedBy,
        approvedBy: s.approvedBy, notes: s.notes,
      })));
    } catch { setError('Không thể tải dữ liệu hải trình'); }
    finally { setLoading(false); }
  }

  const up = (f: keyof Form, v: string) => setForm(p => ({ ...p, [f]: v }));
  const toNum = (v: string) => { const n = parseFloat(v); return isNaN(n) ? undefined : n; };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.voyageNumber.trim()) { setError('Số hải trình là bắt buộc'); return; }
    setSaving(true); setError(null);
    try {
      const payload: CreateVoyageRequest = {
        voyageNumber: form.voyageNumber.trim(),
        vesselIMO: form.vesselIMO || undefined, vesselName: form.vesselName || undefined,
        vesselFlag: form.vesselFlag || undefined, callSign: form.callSign || undefined,
        charterType: form.charterType || undefined,
        departurePort: form.departurePort || undefined, departurePortCode: form.departurePortCode || undefined,
        departureTime: form.departureTime || undefined,
        arrivalPort: form.arrivalPort || undefined, arrivalPortCode: form.arrivalPortCode || undefined,
        arrivalTime: form.arrivalTime || undefined,
        previousPortCode: form.previousPortCode || undefined, previousPortName: form.previousPortName || undefined,
        cargoType: form.cargoType || undefined, cargoWeight: toNum(form.cargoWeight),
        plannedDistance: toNum(form.plannedDistance), plannedDurationHours: toNum(form.plannedDurationHours),
        plannedAverageSpeed: toNum(form.plannedAverageSpeed), plannedFuelConsumption: toNum(form.plannedFuelConsumption),
        voyageInstructions: form.voyageInstructions || undefined, voyageStatus: form.voyageStatus,
        planLegs: planLegs.length > 0 ? planLegs : undefined,
        portCalls: portCalls.length > 0 ? portCalls : undefined,
        cargoPlans: cargoPlans.length > 0 ? cargoPlans : undefined,
        bunkerPlans: bunkerPlans.length > 0 ? bunkerPlans : undefined,
        crewChangePlans: crewChangePlans.length > 0 ? crewChangePlans : undefined,
        costEstimates: costEstimates.length > 0 ? costEstimates : undefined,
        revenueEstimates: revenueEstimates.length > 0 ? revenueEstimates : undefined,
        expenseRequests: expenseRequests.length > 0 ? expenseRequests : undefined,
        advancePayments: advancePayments.length > 0 ? advancePayments : undefined,
        disbursements: disbursements.length > 0 ? disbursements : undefined,
        actualRevenues: actualRevenues.length > 0 ? actualRevenues : undefined,
        settlements: settlements.length > 0 ? settlements : undefined,
      };
      if (isEdit) {
        await voyageApi.updateVoyage(id!, payload);
        navigate('/voyages/' + id);
      } else {
        const result = await voyageApi.createVoyage(payload);
        navigate('/voyages/' + result.id);
      }
    } catch (err: unknown) { setError(err instanceof Error ? err.message : 'Lỗi khi lưu'); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="vf-page"><div className="vm-loading">Đang tải...</div></div>;

  const sections = [
    { key: 'basic', label: 'Thông tin chung' },
    { key: 'route', label: 'Tuyến đường' },
    { key: 'legs', label: 'Kế hoạch chặng' },
    { key: 'ports', label: 'Cảng ghé' },
    { key: 'cargo', label: 'Hàng hóa & Bunker' },
    { key: 'est_fin', label: 'Tài chính ước tính' },
    { key: 'act_fin', label: 'Tài chính thực tế' },
  ];

  return (
    <div className="vf-page">
      {/* Header */}
      <div className="vf-header">
        <div className="vf-header-left">
          <button type="button" className="vm-btn vm-btn--ghost" onClick={() => navigate(isEdit ? '/voyages/' + id : (form.vesselIMO ? '/voyages?vessel=' + encodeURIComponent(form.vesselIMO) : '/voyages'))}>
            <ArrowLeft size={14} /> Quay lại
          </button>
          <h1>{isEdit ? 'Chỉnh sửa hải trình' : 'Tạo hải trình mới'}</h1>
          {(form.vesselName || form.vesselIMO) && <span className="vm-subtitle" style={{ marginLeft: 8 }}>— {form.vesselName}{form.vesselIMO ? ` (IMO: ${form.vesselIMO})` : ''}</span>}
        </div>
        <button type="button" className="vm-btn vm-btn--primary" onClick={handleSubmit} disabled={saving}>
          <Save size={13} /> {saving ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo mới'}
        </button>
      </div>

      {error && <div className="vf-error">{error}</div>}

      {/* Section tabs */}
      <div className="vf-sections">
        {sections.map(s => (
          <button type="button" key={s.key} className={'vf-section-btn' + (section === s.key ? ' active' : '')} onClick={() => setSection(s.key)}>
            {s.label}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {/* === Thông tin chung === */}
        {section === 'basic' && (
          <div className="vf-form">
            <h2>Thông tin chung</h2>
            <div className="vf-grid">
              <G l="Số hải trình *"><input type="text" value={form.voyageNumber} onChange={e => up('voyageNumber', e.target.value)} required /></G>
              <G l="Trạng thái"><select value={form.voyageStatus} onChange={e => up('voyageStatus', e.target.value)}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></G>
              <G l="Tên tàu"><input value={form.vesselName} onChange={e => up('vesselName', e.target.value)} readOnly={vesselLocked || isEdit} style={(vesselLocked || isEdit) ? { background: '#f0f0f0', cursor: 'not-allowed' } : undefined} /></G>
              <G l="IMO"><input value={form.vesselIMO} onChange={e => up('vesselIMO', e.target.value)} maxLength={10} readOnly={vesselLocked || isEdit} style={(vesselLocked || isEdit) ? { background: '#f0f0f0', cursor: 'not-allowed' } : undefined} /></G>
              <G l="Quốc tịch"><input value={form.vesselFlag} onChange={e => up('vesselFlag', e.target.value)} /></G>
              <G l="Hô hiệu"><input value={form.callSign} onChange={e => up('callSign', e.target.value)} /></G>
              <G l="Loại thuê tàu">
                <select value={form.charterType} onChange={e => up('charterType', e.target.value)}>
                  <option value="">-- Chọn --</option>
                  {CHARTER_TYPES.map(t => <option key={t}>{t}</option>)}
                </select>
              </G>
              <G l="Loại hàng"><CatalogSelect options={CARGO_TYPES} value={form.cargoType} onChange={e => up('cargoType', e.target.value)} /></G>
              <G l="Trọng lượng (MT)"><input type="number" step="0.1" value={form.cargoWeight} onChange={e => up('cargoWeight', e.target.value)} /></G>
              <G l="Chỉ thị hải trình" full><textarea value={form.voyageInstructions} onChange={e => up('voyageInstructions', e.target.value)} rows={2} /></G>
            </div>
          </div>
        )}

        {/* === Tuyến đường === */}
        {section === 'route' && (
          <div className="vf-form">
            <h2>Tuyến đường</h2>
            <div className="vf-grid">
              <G l="Cảng đi">
                <PortSelect
                  value={form.departurePortCode ? (form.departurePortCode + ' - ' + form.departurePort) : form.departurePort}
                  onChange={p => setForm(prev => ({ ...prev, departurePort: p.portName, departurePortCode: p.portCode }))}
                  placeholder="Tìm cảng đi..."
                />
              </G>
              <G l="TG khởi hành"><input type="datetime-local" value={form.departureTime} onChange={e => up('departureTime', e.target.value)} /></G>
              <G l="Cảng đến">
                <PortSelect
                  value={form.arrivalPortCode ? (form.arrivalPortCode + ' - ' + form.arrivalPort) : form.arrivalPort}
                  onChange={p => setForm(prev => ({ ...prev, arrivalPort: p.portName, arrivalPortCode: p.portCode }))}
                  placeholder="Tìm cảng đến..."
                />
              </G>
              <G l="TG đến"><input type="datetime-local" value={form.arrivalTime} onChange={e => up('arrivalTime', e.target.value)} /></G>
              <G l="Cảng trước đó">
                <PortSelect
                  value={form.previousPortCode ? (form.previousPortCode + ' - ' + form.previousPortName) : form.previousPortName}
                  onChange={p => setForm(prev => ({ ...prev, previousPortName: p.portName, previousPortCode: p.portCode }))}
                  placeholder="Tìm cảng trước..."
                />
              </G>
              <G l="Quãng đường (NM)"><input type="number" step="0.1" value={form.plannedDistance} onChange={e => up('plannedDistance', e.target.value)} /></G>
              <G l="Thời gian (giờ)"><input type="number" step="0.1" value={form.plannedDurationHours} onChange={e => up('plannedDurationHours', e.target.value)} /></G>
              <G l="Tốc độ TB (kn)"><input type="number" step="0.1" value={form.plannedAverageSpeed} onChange={e => up('plannedAverageSpeed', e.target.value)} /></G>
              <G l="Nhiên liệu DK (MT)"><input type="number" step="0.1" value={form.plannedFuelConsumption} onChange={e => up('plannedFuelConsumption', e.target.value)} /></G>
            </div>
          </div>
        )}

        {/* === Kế hoạch chặng === */}
        {section === 'legs' && (
          <div className="vf-form">
            <div className="vf-section-head">
              <h2>Kế hoạch chặng ({planLegs.length})</h2>
              <button type="button" className="vm-btn vm-btn--primary" onClick={() => setPlanLegs(prev => [...prev, mkLeg(prev.length + 1)])}>
                <Plus size={13} /> Thêm chặng
              </button>
            </div>
            {planLegs.length === 0 && <p className="vf-empty">Chưa có chặng nào. Bấm "Thêm chặng" để bắt đầu.</p>}
            {planLegs.map((leg, i) => (
              <div key={i} className="vf-sub-card">
                <div className="vf-sub-header">
                  <span>Chặng #{leg.sequence}</span>
                  <button type="button" className="vm-btn vm-btn--danger" onClick={() => setPlanLegs(prev => removeSeq(prev, i))}><X size={12} /> Xóa</button>
                </div>
                <div className="vf-grid">
                  <G l="Loại">
                    <select value={leg.legType} onChange={e => setPlanLegs(prev => prev.map((l, j) => j === i ? { ...l, legType: e.target.value } : l))}>
                      {LEG_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </G>
                  <G l="Từ cảng">
                    <PortSelect
                      value={leg.fromPortCode ? (leg.fromPortCode + ' - ' + leg.fromPortName) : (leg.fromPortName || '')}
                      onChange={p => setPlanLegs(prev => prev.map((l, j) => j === i ? { ...l, fromPortCode: p.portCode, fromPortName: p.portName } : l))}
                      placeholder="Cảng đi..."
                    />
                  </G>
                  <G l="Đến cảng">
                    <PortSelect
                      value={leg.toPortCode ? (leg.toPortCode + ' - ' + leg.toPortName) : (leg.toPortName || '')}
                      onChange={p => setPlanLegs(prev => prev.map((l, j) => j === i ? { ...l, toPortCode: p.portCode, toPortName: p.portName } : l))}
                      placeholder="Cảng đến..."
                    />
                  </G>
                  <G l="Khoảng cách (NM)"><input type="number" step="0.1" value={leg.plannedDistance ?? ''} onChange={e => setPlanLegs(prev => prev.map((l, j) => j === i ? { ...l, plannedDistance: parseFloat(e.target.value) || undefined } : l))} /></G>
                  <G l="Thời gian (h)"><input type="number" step="0.1" value={leg.plannedDurationHours ?? ''} onChange={e => setPlanLegs(prev => prev.map((l, j) => j === i ? { ...l, plannedDurationHours: parseFloat(e.target.value) || undefined } : l))} /></G>
                  <G l="Tốc độ (kn)"><input type="number" step="0.1" value={leg.plannedAverageSpeed ?? ''} onChange={e => setPlanLegs(prev => prev.map((l, j) => j === i ? { ...l, plannedAverageSpeed: parseFloat(e.target.value) || undefined } : l))} /></G>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* === Cảng ghé === */}
        {section === 'ports' && (
          <div className="vf-form">
            <div className="vf-section-head">
              <h2>Cảng ghé ({portCalls.length})</h2>
              <button type="button" className="vm-btn vm-btn--primary" onClick={() => setPortCalls(prev => [...prev, mkPort(prev.length + 1)])}>
                <Plus size={13} /> Thêm cảng
              </button>
            </div>
            {portCalls.length === 0 && <p className="vf-empty">Chưa có cảng ghé nào.</p>}
            {portCalls.map((pc, i) => (
              <div key={i} className="vf-sub-card">
                <div className="vf-sub-header">
                  <span>Cảng #{pc.sequence}</span>
                  <button type="button" className="vm-btn vm-btn--danger" onClick={() => setPortCalls(prev => removeSeq(prev, i))}><X size={12} /> Xóa</button>
                </div>
                <div className="vf-grid">
                  <G l="Loại">
                    <select value={pc.callType} onChange={e => setPortCalls(prev => prev.map((p, j) => j === i ? { ...p, callType: e.target.value } : p))}>
                      {CALL_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </G>
                  <G l="Cảng">
                    <PortSelect
                      value={pc.portCode ? (pc.portCode + ' - ' + pc.portName) : pc.portName}
                      onChange={p => setPortCalls(prev => prev.map((x, j) => j === i ? { ...x, portCode: p.portCode, portName: p.portName, country: p.country } : x))}
                      placeholder="Tìm cảng..."
                    />
                  </G>
                  <G l="TG đến"><input type="datetime-local" value={pc.arrivalTime ? pc.arrivalTime.slice(0, 16) : ''} onChange={e => setPortCalls(prev => prev.map((p, j) => j === i ? { ...p, arrivalTime: e.target.value || undefined } : p))} /></G>
                  <G l="TG rời"><input type="datetime-local" value={pc.departureTime ? pc.departureTime.slice(0, 16) : ''} onChange={e => setPortCalls(prev => prev.map((p, j) => j === i ? { ...p, departureTime: e.target.value || undefined } : p))} /></G>
                  <G l="Bến"><input value={pc.berthNumber || ''} onChange={e => setPortCalls(prev => prev.map((p, j) => j === i ? { ...p, berthNumber: e.target.value } : p))} /></G>
                  <G l="Ghi chú"><input value={pc.remarks || ''} onChange={e => setPortCalls(prev => prev.map((p, j) => j === i ? { ...p, remarks: e.target.value } : p))} /></G>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* === Hàng hóa & Bunker === */}
        {section === 'cargo' && (
          <div className="vf-form">
            {/* Cargo Plans */}
            <div className="vf-section-head">
              <h2>Kế hoạch hàng hóa ({cargoPlans.length})</h2>
              <button type="button" className="vm-btn vm-btn--primary" onClick={() => setCargoPlans(prev => [...prev, mkCargo(prev.length + 1)])}>
                <Plus size={13} /> Thêm
              </button>
            </div>
            {cargoPlans.length === 0 && <p className="vf-empty">Chưa có cargo plan.</p>}
            {cargoPlans.map((cp, i) => (
              <div key={i} className="vf-sub-card">
                <div className="vf-sub-header">
                  <span>Cargo #{cp.sequence}</span>
                  <button type="button" className="vm-btn vm-btn--danger" onClick={() => setCargoPlans(prev => removeSeq(prev, i))}><X size={12} /></button>
                </div>
                <div className="vf-grid vf-grid--4">
                  <G l="Nghiệp vụ">
                    <select value={cp.operationType} onChange={e => setCargoPlans(prev => prev.map((x, j) => j === i ? { ...x, operationType: e.target.value } : x))}>
                      {CARGO_OPS.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </G>
                  <G l="Loại hàng"><CatalogSelect options={CARGO_TYPES} value={cp.cargoType} onChange={e => setCargoPlans(prev => prev.map((x, j) => j === i ? { ...x, cargoType: e.target.value } : x))} /></G>
                  <G l="Số lượng"><input type="number" step="0.01" value={cp.plannedQuantity} onChange={e => setCargoPlans(prev => prev.map((x, j) => j === i ? { ...x, plannedQuantity: parseFloat(e.target.value) || 0 } : x))} /></G>
                  <G l="Đơn vị"><input value={cp.unit || 'MT'} onChange={e => setCargoPlans(prev => prev.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))} /></G>
                  <G l="Cảng"><input value={cp.portName || ''} onChange={e => setCargoPlans(prev => prev.map((x, j) => j === i ? { ...x, portName: e.target.value } : x))} /></G>
                  <G l="Shipper"><input value={cp.shipperName || ''} onChange={e => setCargoPlans(prev => prev.map((x, j) => j === i ? { ...x, shipperName: e.target.value } : x))} /></G>
                  <G l="Consignee"><input value={cp.consigneeName || ''} onChange={e => setCargoPlans(prev => prev.map((x, j) => j === i ? { ...x, consigneeName: e.target.value } : x))} /></G>
                  <G l="Mô tả"><input value={cp.cargoDescription || ''} onChange={e => setCargoPlans(prev => prev.map((x, j) => j === i ? { ...x, cargoDescription: e.target.value } : x))} /></G>
                </div>
              </div>
            ))}

            {/* Bunker Plans */}
            <div className="vf-section-head" style={{ marginTop: 16 }}>
              <h2>Kế hoạch Bunker ({bunkerPlans.length})</h2>
              <button type="button" className="vm-btn vm-btn--primary" onClick={() => setBunkerPlans(prev => [...prev, mkBunker(prev.length + 1)])}>
                <Plus size={13} /> Thêm
              </button>
            </div>
            {bunkerPlans.length === 0 && <p className="vf-empty">Chưa có bunker plan.</p>}
            {bunkerPlans.map((bp, i) => (
              <div key={i} className="vf-sub-card">
                <div className="vf-sub-header">
                  <span>Bunker #{bp.sequence}</span>
                  <button type="button" className="vm-btn vm-btn--danger" onClick={() => setBunkerPlans(prev => removeSeq(prev, i))}><X size={12} /></button>
                </div>
                <div className="vf-grid vf-grid--4">
                  <G l="Loại NL">
                    <select value={bp.fuelType} onChange={e => setBunkerPlans(prev => prev.map((x, j) => j === i ? { ...x, fuelType: e.target.value } : x))}>
                      {FUEL_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </G>
                  <G l="Nghiệp vụ">
                    <select value={bp.operationType} onChange={e => setBunkerPlans(prev => prev.map((x, j) => j === i ? { ...x, operationType: e.target.value } : x))}>
                      {BUNKER_OPS.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </G>
                  <G l="Số lượng"><input type="number" step="0.01" value={bp.plannedQuantity} onChange={e => setBunkerPlans(prev => prev.map((x, j) => j === i ? { ...x, plannedQuantity: parseFloat(e.target.value) || 0 } : x))} /></G>
                  <G l="Chi phí ước tính"><input type="number" step="0.01" value={bp.estimatedCostUsd ?? ''} onChange={e => setBunkerPlans(prev => prev.map((x, j) => j === i ? { ...x, estimatedCostUsd: parseFloat(e.target.value) || undefined } : x))} /></G>
                  <G l="Cảng"><input value={bp.portName || ''} onChange={e => setBunkerPlans(prev => prev.map((x, j) => j === i ? { ...x, portName: e.target.value } : x))} /></G>
                  <G l="Nhà cung cấp"><input value={bp.supplierName || ''} onChange={e => setBunkerPlans(prev => prev.map((x, j) => j === i ? { ...x, supplierName: e.target.value } : x))} /></G>
                </div>
              </div>
            ))}

            {/* Crew Change Plans */}
            <div className="vf-section-head" style={{ marginTop: 16 }}>
              <h2>Kế hoạch đổi crew ({crewChangePlans.length})</h2>
              <button type="button" className="vm-btn vm-btn--primary" onClick={() => setCrewChangePlans(prev => [...prev, mkCrew(prev.length + 1)])}>
                <Plus size={13} /> Thêm
              </button>
            </div>
            {crewChangePlans.length === 0 && <p className="vf-empty">Chưa có crew change plan.</p>}
            {crewChangePlans.map((ccp, i) => (
              <div key={i} className="vf-sub-card">
                <div className="vf-sub-header">
                  <span>Crew #{ccp.sequence}</span>
                  <button type="button" className="vm-btn vm-btn--danger" onClick={() => setCrewChangePlans(prev => removeSeq(prev, i))}><X size={12} /></button>
                </div>
                <div className="vf-grid vf-grid--4">
                  <G l="Loại">
                    <select value={ccp.changeType} onChange={e => setCrewChangePlans(prev => prev.map((x, j) => j === i ? { ...x, changeType: e.target.value } : x))}>
                      {CREW_CHANGES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </G>
                  <G l="Cảng"><input value={ccp.portName || ''} onChange={e => setCrewChangePlans(prev => prev.map((x, j) => j === i ? { ...x, portName: e.target.value } : x))} /></G>
                  <G l="Ngày dự kiến"><input type="datetime-local" value={ccp.plannedDate ? ccp.plannedDate.slice(0, 16) : ''} onChange={e => setCrewChangePlans(prev => prev.map((x, j) => j === i ? { ...x, plannedDate: e.target.value || undefined } : x))} /></G>
                  <G l="Lý do"><input value={ccp.replacementReason || ''} onChange={e => setCrewChangePlans(prev => prev.map((x, j) => j === i ? { ...x, replacementReason: e.target.value } : x))} /></G>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* === Tài chính ước tính === */}
        {section === 'est_fin' && (
          <div className="vf-form">
            {/* Cost Estimates */}
            <div className="vf-section-head">
              <h2>Chi phí ước tính ({costEstimates.length})</h2>
              <button type="button" className="vm-btn vm-btn--primary" onClick={() => setCostEstimates(prev => [...prev, mkCost(prev.length + 1)])}>
                <Plus size={13} /> Thêm
              </button>
            </div>
            {costEstimates.length === 0 && <p className="vf-empty">Chưa có chi phí ước tính.</p>}
            {costEstimates.map((ce, i) => (
              <div key={i} className="vf-sub-card">
                <div className="vf-grid vf-grid--4">
                  <G l="Danh mục">
                    <select value={ce.costCategory} onChange={e => setCostEstimates(prev => prev.map((c, j) => j === i ? { ...c, costCategory: e.target.value } : c))}>
                      <option value="">-- Chọn --</option>
                      {COST_CATS.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </G>
                  <G l="Mô tả"><input value={ce.description || ''} onChange={e => setCostEstimates(prev => prev.map((c, j) => j === i ? { ...c, description: e.target.value } : c))} /></G>
                  <G l="Số tiền (USD)"><input type="number" step="0.01" value={ce.estimatedAmount} onChange={e => setCostEstimates(prev => prev.map((c, j) => j === i ? { ...c, estimatedAmount: parseFloat(e.target.value) || 0 } : c))} /></G>
                  <G l=""><button type="button" className="vm-btn vm-btn--danger" style={{ marginTop: 18 }} onClick={() => setCostEstimates(prev => removeSeq(prev, i))}><X size={12} /> Xóa</button></G>
                </div>
              </div>
            ))}

            {/* Revenue Estimates */}
            <div className="vf-section-head" style={{ marginTop: 16 }}>
              <h2>Doanh thu ước tính ({revenueEstimates.length})</h2>
              <button type="button" className="vm-btn vm-btn--primary" onClick={() => setRevenueEstimates(prev => [...prev, mkRev(prev.length + 1)])}>
                <Plus size={13} /> Thêm
              </button>
            </div>
            {revenueEstimates.length === 0 && <p className="vf-empty">Chưa có doanh thu ước tính.</p>}
            {revenueEstimates.map((re, i) => (
              <div key={i} className="vf-sub-card">
                <div className="vf-grid vf-grid--4">
                  <G l="Danh mục">
                    <select value={re.revenueCategory} onChange={e => setRevenueEstimates(prev => prev.map((r, j) => j === i ? { ...r, revenueCategory: e.target.value } : r))}>
                      <option value="">-- Chọn --</option>
                      {REV_CATS.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </G>
                  <G l="Mô tả"><input value={re.description || ''} onChange={e => setRevenueEstimates(prev => prev.map((r, j) => j === i ? { ...r, description: e.target.value } : r))} /></G>
                  <G l="Số tiền (USD)"><input type="number" step="0.01" value={re.estimatedAmount} onChange={e => setRevenueEstimates(prev => prev.map((r, j) => j === i ? { ...r, estimatedAmount: parseFloat(e.target.value) || 0 } : r))} /></G>
                  <G l=""><button type="button" className="vm-btn vm-btn--danger" style={{ marginTop: 18 }} onClick={() => setRevenueEstimates(prev => removeSeq(prev, i))}><X size={12} /> Xóa</button></G>
                </div>
              </div>
            ))}

            {/* Summary */}
            {(costEstimates.length > 0 || revenueEstimates.length > 0) && (
              <div className="vf-financial-summary">
                <div className="vf-fin-row"><span>Tổng chi phí ước tính:</span><strong>${costEstimates.reduce((s, c) => s + c.estimatedAmount, 0).toLocaleString()}</strong></div>
                <div className="vf-fin-row"><span>Tổng doanh thu ước tính:</span><strong>${revenueEstimates.reduce((s, r) => s + r.estimatedAmount, 0).toLocaleString()}</strong></div>
                <div className="vf-fin-row total"><span>Lợi nhuận ước tính:</span><strong>${(revenueEstimates.reduce((s, r) => s + r.estimatedAmount, 0) - costEstimates.reduce((s, c) => s + c.estimatedAmount, 0)).toLocaleString()}</strong></div>
              </div>
            )}
          </div>
        )}

        {/* === Tài chính thực tế === */}
        {section === 'act_fin' && (
          <div className="vf-form">
            {/* Expense Requests */}
            <div className="vf-section-head">
              <h2>Yêu cầu chi phí ({expenseRequests.length})</h2>
              <button type="button" className="vm-btn vm-btn--primary" onClick={() => setExpenseRequests(prev => [...prev, mkExp()])}>
                <Plus size={13} /> Thêm
              </button>
            </div>
            {expenseRequests.map((er, i) => (
              <div key={i} className="vf-sub-card">
                <div className="vf-grid vf-grid--4">
                  <G l="Danh mục">
                    <select value={er.costCategory} onChange={e => setExpenseRequests(prev => prev.map((x, j) => j === i ? { ...x, costCategory: e.target.value } : x))}>
                      <option value="">-- Chọn --</option>
                      {COST_CATS.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </G>
                  <G l="Số tiền"><input type="number" step="0.01" value={er.requestedAmount} onChange={e => setExpenseRequests(prev => prev.map((x, j) => j === i ? { ...x, requestedAmount: parseFloat(e.target.value) || 0 } : x))} /></G>
                  <G l="NCC"><input value={er.vendorName || ''} onChange={e => setExpenseRequests(prev => prev.map((x, j) => j === i ? { ...x, vendorName: e.target.value } : x))} /></G>
                  <G l="Trạng thái">
                    <select value={er.status} onChange={e => setExpenseRequests(prev => prev.map((x, j) => j === i ? { ...x, status: e.target.value } : x))}>
                      {EXP_STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </G>
                  <G l="Ghi chú"><input value={er.notes || ''} onChange={e => setExpenseRequests(prev => prev.map((x, j) => j === i ? { ...x, notes: e.target.value } : x))} /></G>
                  <G l=""><button type="button" className="vm-btn vm-btn--danger" style={{ marginTop: 18 }} onClick={() => setExpenseRequests(prev => prev.filter((_, j) => j !== i))}><X size={12} /> Xóa</button></G>
                </div>
              </div>
            ))}

            {/* Advance Payments */}
            <div className="vf-section-head" style={{ marginTop: 16 }}>
              <h2>Tạm ứng ({advancePayments.length})</h2>
              <button type="button" className="vm-btn vm-btn--primary" onClick={() => setAdvancePayments(prev => [...prev, mkAdv()])}>
                <Plus size={13} /> Thêm
              </button>
            </div>
            {advancePayments.map((ap, i) => (
              <div key={i} className="vf-sub-card">
                <div className="vf-grid vf-grid--4">
                  <G l="Loại">
                    <select value={ap.advanceType} onChange={e => setAdvancePayments(prev => prev.map((x, j) => j === i ? { ...x, advanceType: e.target.value } : x))}>
                      <option value="">-- Chọn --</option>
                      {ADV_TYPES.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </G>
                  <G l="Số tiền"><input type="number" step="0.01" value={ap.amount} onChange={e => setAdvancePayments(prev => prev.map((x, j) => j === i ? { ...x, amount: parseFloat(e.target.value) || 0 } : x))} /></G>
                  <G l="Người nhận"><input value={ap.recipientName || ''} onChange={e => setAdvancePayments(prev => prev.map((x, j) => j === i ? { ...x, recipientName: e.target.value } : x))} /></G>
                  <G l="Trạng thái">
                    <select value={ap.status} onChange={e => setAdvancePayments(prev => prev.map((x, j) => j === i ? { ...x, status: e.target.value } : x))}>
                      {ADV_STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </G>
                  <G l="Ghi chú"><input value={ap.notes || ''} onChange={e => setAdvancePayments(prev => prev.map((x, j) => j === i ? { ...x, notes: e.target.value } : x))} /></G>
                  <G l=""><button type="button" className="vm-btn vm-btn--danger" style={{ marginTop: 18 }} onClick={() => setAdvancePayments(prev => prev.filter((_, j) => j !== i))}><X size={12} /> Xóa</button></G>
                </div>
              </div>
            ))}

            {/* Disbursements */}
            <div className="vf-section-head" style={{ marginTop: 16 }}>
              <h2>Giải ngân ({disbursements.length})</h2>
              <button type="button" className="vm-btn vm-btn--primary" onClick={() => setDisbursements(prev => [...prev, mkDisb()])}>
                <Plus size={13} /> Thêm
              </button>
            </div>
            {disbursements.map((d, i) => (
              <div key={i} className="vf-sub-card">
                <div className="vf-grid vf-grid--4">
                  <G l="Danh mục">
                    <select value={d.costCategory} onChange={e => setDisbursements(prev => prev.map((x, j) => j === i ? { ...x, costCategory: e.target.value } : x))}>
                      <option value="">-- Chọn --</option>
                      {COST_CATS.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </G>
                  <G l="Số tiền"><input type="number" step="0.01" value={d.amount} onChange={e => setDisbursements(prev => prev.map((x, j) => j === i ? { ...x, amount: parseFloat(e.target.value) || 0 } : x))} /></G>
                  <G l="NCC"><input value={d.vendorName || ''} onChange={e => setDisbursements(prev => prev.map((x, j) => j === i ? { ...x, vendorName: e.target.value } : x))} /></G>
                  <G l="Số hóa đơn"><input value={d.invoiceNumber || ''} onChange={e => setDisbursements(prev => prev.map((x, j) => j === i ? { ...x, invoiceNumber: e.target.value } : x))} /></G>
                  <G l="Trạng thái">
                    <select value={d.status} onChange={e => setDisbursements(prev => prev.map((x, j) => j === i ? { ...x, status: e.target.value } : x))}>
                      {DISB_STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </G>
                  <G l=""><button type="button" className="vm-btn vm-btn--danger" style={{ marginTop: 18 }} onClick={() => setDisbursements(prev => prev.filter((_, j) => j !== i))}><X size={12} /> Xóa</button></G>
                </div>
              </div>
            ))}

            {/* Actual Revenues */}
            <div className="vf-section-head" style={{ marginTop: 16 }}>
              <h2>Doanh thu thực tế ({actualRevenues.length})</h2>
              <button type="button" className="vm-btn vm-btn--primary" onClick={() => setActualRevenues(prev => [...prev, mkARev()])}>
                <Plus size={13} /> Thêm
              </button>
            </div>
            {actualRevenues.map((ar, i) => (
              <div key={i} className="vf-sub-card">
                <div className="vf-grid vf-grid--4">
                  <G l="Danh mục">
                    <select value={ar.revenueCategory} onChange={e => setActualRevenues(prev => prev.map((x, j) => j === i ? { ...x, revenueCategory: e.target.value } : x))}>
                      <option value="">-- Chọn --</option>
                      {REV_CATS.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </G>
                  <G l="Số tiền"><input type="number" step="0.01" value={ar.amount} onChange={e => setActualRevenues(prev => prev.map((x, j) => j === i ? { ...x, amount: parseFloat(e.target.value) || 0 } : x))} /></G>
                  <G l="Người trả"><input value={ar.payerName || ''} onChange={e => setActualRevenues(prev => prev.map((x, j) => j === i ? { ...x, payerName: e.target.value } : x))} /></G>
                  <G l="Trạng thái">
                    <select value={ar.status} onChange={e => setActualRevenues(prev => prev.map((x, j) => j === i ? { ...x, status: e.target.value } : x))}>
                      {AREV_STATUSES.map(s => <option key={s}>{s}</option>)}
                    </select>
                  </G>
                  <G l="Ghi chú"><input value={ar.notes || ''} onChange={e => setActualRevenues(prev => prev.map((x, j) => j === i ? { ...x, notes: e.target.value } : x))} /></G>
                  <G l=""><button type="button" className="vm-btn vm-btn--danger" style={{ marginTop: 18 }} onClick={() => setActualRevenues(prev => prev.filter((_, j) => j !== i))}><X size={12} /> Xóa</button></G>
                </div>
              </div>
            ))}

            {/* Settlements */}
            <div className="vf-section-head" style={{ marginTop: 16 }}>
              <h2>Quyết toán ({settlements.length})</h2>
              <button type="button" className="vm-btn vm-btn--primary" onClick={() => setSettlements(prev => [...prev, mkSett()])}>
                <Plus size={13} /> Thêm
              </button>
            </div>
            {settlements.map((s, i) => (
              <div key={i} className="vf-sub-card">
                <div className="vf-grid vf-grid--4">
                  <G l="Trạng thái">
                    <select value={s.status} onChange={e => setSettlements(prev => prev.map((x, j) => j === i ? { ...x, status: e.target.value } : x))}>
                      {SETT_STATUSES.map(st => <option key={st}>{st}</option>)}
                    </select>
                  </G>
                  <G l="Tổng CP duyệt"><input type="number" step="0.01" value={s.totalExpenseApproved || 0} onChange={e => setSettlements(prev => prev.map((x, j) => j === i ? { ...x, totalExpenseApproved: parseFloat(e.target.value) || 0 } : x))} /></G>
                  <G l="Tổng tạm ứng"><input type="number" step="0.01" value={s.totalAdvanced || 0} onChange={e => setSettlements(prev => prev.map((x, j) => j === i ? { ...x, totalAdvanced: parseFloat(e.target.value) || 0 } : x))} /></G>
                  <G l="Tổng giải ngân"><input type="number" step="0.01" value={s.totalDisbursed || 0} onChange={e => setSettlements(prev => prev.map((x, j) => j === i ? { ...x, totalDisbursed: parseFloat(e.target.value) || 0 } : x))} /></G>
                  <G l="Tổng doanh thu"><input type="number" step="0.01" value={s.totalRevenue || 0} onChange={e => setSettlements(prev => prev.map((x, j) => j === i ? { ...x, totalRevenue: parseFloat(e.target.value) || 0 } : x))} /></G>
                  <G l="Ghi chú"><input value={s.notes || ''} onChange={e => setSettlements(prev => prev.map((x, j) => j === i ? { ...x, notes: e.target.value } : x))} /></G>
                  <G l=""><button type="button" className="vm-btn vm-btn--danger" style={{ marginTop: 18 }} onClick={() => setSettlements(prev => prev.filter((_, j) => j !== i))}><X size={12} /> Xóa</button></G>
                </div>
              </div>
            ))}

            {/* Actual Financial Summary */}
            {(disbursements.length > 0 || actualRevenues.length > 0) && (
              <div className="vf-financial-summary" style={{ marginTop: 16 }}>
                <div className="vf-fin-row"><span>Tổng giải ngân:</span><strong>${disbursements.reduce((s, d) => s + d.amount * (d.exchangeRate || 1), 0).toLocaleString()}</strong></div>
                <div className="vf-fin-row"><span>Tổng doanh thu thực:</span><strong>${actualRevenues.reduce((s, r) => s + r.amount * (r.exchangeRate || 1), 0).toLocaleString()}</strong></div>
                <div className="vf-fin-row total"><span>Lợi nhuận thực tế:</span><strong>${(actualRevenues.reduce((s, r) => s + r.amount * (r.exchangeRate || 1), 0) - disbursements.reduce((s, d) => s + d.amount * (d.exchangeRate || 1), 0)).toLocaleString()}</strong></div>
              </div>
            )}
          </div>
        )}

        {/* Bottom Actions */}
        <div className="vf-actions">
          <button type="button" className="vm-btn" onClick={() => navigate(isEdit ? '/voyages/' + id : '/voyages')}>Hủy</button>
          <button type="submit" className="vm-btn vm-btn--primary" disabled={saving}>
            <Save size={13} /> {saving ? 'Đang lưu...' : isEdit ? 'Cập nhật hải trình' : 'Tạo hải trình'}
          </button>
        </div>
      </form>
    </div>
  );
};
