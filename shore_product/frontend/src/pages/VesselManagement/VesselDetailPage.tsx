import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, ArrowLeftRight, BarChart3, FileText, LayoutDashboard, Loader2, Package, Ship, Users, Wrench,
} from 'lucide-react';
import { ENV } from '../../config/env';
import { Button, useConfirm } from '../../components/common';
import { VesselCrewTab } from '../../components/vessel-detail/VesselCrewTab';
import { VesselParticularsPanel } from '../../components/vessel-detail/VesselParticularsPanel';
import { isParticularsTab } from '../../components/vessel-detail/vesselParticularsFields';
import { VesselCertificateTab } from '../../components/vessel-detail/VesselCertificateTab';
import { VesselOverviewTab } from '../../components/vessel-detail/VesselOverviewTab';
import AssetsPage from '../PMS/AssetsPage';
import WorkPlanningPage from '../PMS/WorkPlanningPage';
import { MaterialPage } from '../Materials/MaterialPage';
import MaterialRequestPage from '../Materials/MaterialRequestPage';
import StockReceiptPage from '../Materials/StockReceiptPage';
import InventoryPage from '../Materials/InventoryPage';
import { VesselReportsTab } from '../Report/VesselReportsTab';

// ============================================================
// EXTENDED VESSEL TYPE with all fields from backend
// ============================================================
interface Vessel {
  id: string;
  imo: string;
  name: string;
  callSign: string;
  vesselType: string;
  grossTonnage: number;
  deadWeight: number;
  buildDate: string;
  flag: string;
  isActive: boolean;
  
  // Extended Basic Data
  officialNumber?: string;
  portOfRegistry?: string;
  previousName?: string;
  previousFlag?: string;
  mmsiNumber?: string;
  classNotation?: string;
  classRegisterNumber?: string;
  shipyardCountry?: string;
  shipyardName?: string;
  yardNo?: string;
  companyImoNumber?: string;
  suezCanalIdNumber?: string;
  keelLaidDate?: string;
  yearBuilt?: number;
  dateOfRegistry?: string;
  ownerImoNumber?: string;
  panamaCanalIdNumber?: string;
  maxPersonsAllowedOB?: number;
  serviceSpeedKts?: number;
  vrpNumber?: string;
  vrpType?: string;
  noOfCrewSafeManning?: number;
  maxPassengersAllowedOB?: number;
  
  // Dimensions
  loa?: number;
  lbp?: number;
  breadthMoulded?: number;
  depthMoulded?: number;
  draftMoulded?: number;
  draftScantling?: number;
  draftFullBallast?: number;
  hMaxAirdraft?: number;
  lightShip?: number;
  blockCoefficient?: number;
  tpcAtSummerDraft?: number;
  grossTonnageInternational?: number;
  grossTonnageSuezCanal?: number;
  grossTonnagePanamaCanal?: number;
  nettTonnageInternational?: number;
  
  // Machinery
  anchorChainPort?: number;
  anchorChainStarboard?: number;
  anchorChainStern?: number;
  harbourGeneratorMaker?: string;
  harbourGeneratorMaxPowerKW?: number;
  azimuthEngFwdCount?: number;
  azimuthEngFwdMaxPowerKW?: number;
  
  // Shipowner (Shore Master - Editable)
  shipownerName?: string;
  shipownerStreet?: string;
  shipownerCountry?: string;
  shipownerZip?: string;
  shipownerCity?: string;
  shipownerPhone?: string;
  shipownerFax?: string;
  shipownerEmail?: string;
  shipownerContactPerson?: string;
  
  managingOwnerName?: string;
  managingOwnerEmail?: string;
  managingOwnerContactPerson?: string;
  
  operatorName?: string;
  operatorEmail?: string;
  operatorContactPerson?: string;
  
  csoFirstName?: string;
  csoLastName?: string;
  csoEmail?: string;
  csoPhone24h?: string;
  
  dpaFirstName?: string;
  dpaLastName?: string;
  dpaEmail?: string;
  dpaPhone24h?: string;
  
  // Charterer (Shore Master - Editable)
  chartererName?: string;
  chartererStreet?: string;
  chartererCountry?: string;
  chartererZip?: string;
  chartererCity?: string;
  chartererPhone?: string;
  chartererEmail?: string;
  chartererContactPerson?: string;
  
  bareboatChartererName?: string;
  bareboatChartererEmail?: string;
  bareboatChartererContactPerson?: string;
  
  // Class / Flag State
  classSocietyName?: string;
  classSocietyCountry?: string;
  classSocietyEmail?: string;
  classSocietyContactPerson?: string;
  
  flagStateName?: string;
  flagStateCountry?: string;
  flagStateEmail?: string;
  flagStateContactPerson?: string;
  
  // Insurance (Shore Master - Editable)
  piClubName?: string;
  piClubStreet?: string;
  piClubCountry?: string;
  piClubZip?: string;
  piClubCity?: string;
  piClubPhone?: string;
  piClubEmail?: string;
  piClubContactPerson?: string;
  
  hmClubName?: string;
  hmClubEmail?: string;
  hmClubContactPerson?: string;
  
  // Radio Communication
  inmarsatPhone1?: string;
  inmarsatPhone2?: string;
  inmarsatFax1?: string;
  emailAddress1?: string;
  emailAddress2?: string;
  gsmPhone?: string;
  seaAreaA1?: boolean;
  seaAreaA2?: boolean;
  seaAreaA3?: boolean;
  seaAreaA4?: boolean;
  ais?: boolean;
  navtex?: boolean;
  epirbNumber?: string;
  epirbMaker?: string;
  
  // Tanks & Cargo
  hfoCbm?: number;
  mdoCbm?: number;
  lubOilCbm?: number;
  freshWaterCbm?: number;
  ballastWaterCbm?: number;
  noOfBallastTanks?: number;
  teuTotal?: number;
  teuOnDeck?: number;
  teuUnderDeck?: number;
  grainCbm?: number;
  balesCbm?: number;
  noOfCargoHolds?: number;
  noOfHatches?: number;
  
  // Sync metadata
  lastEdgeSyncAt?: string;
  lastShoreSyncAt?: string;
  
  // Thông tin thuyền trưởng
  masterName?: string;
}

type TabId = 'overview' | 'basic-data' | 'dimensions' | 'machinery' | 'shipowner' | 'charterer' | 'class-flag-state' | 'insurance' | 'radio-comm' | 'tanks-cargo' | 'certificates' | 'crew' | 'reports-list' | 'reports-calendar' | 'pms-assets' | 'pms-work-planning' | 'materials-list' | 'materials-requests' | 'materials-receipts' | 'materials-inventory';

/** Thông số tàu (basic-data … insurance) đồng bộ hai chiều: bờ sửa được, tàu sửa được. */
const TABS: Record<TabId, { label: string }> = {
  'overview':            { label: 'Tổng quan' },
  'crew':                { label: 'Thuyền viên' },
  'basic-data':          { label: 'Thông tin chung' },
  'dimensions':          { label: 'Kích thước' },
  'class-flag-state':    { label: 'Đăng kiểm & cờ' },
  'machinery':           { label: 'Máy móc' },
  'radio-comm':          { label: 'Thông tin liên lạc' },
  'tanks-cargo':         { label: 'Két & hầm hàng' },
  'shipowner':           { label: 'Chủ tàu' },
  'charterer':           { label: 'Người thuê tàu' },
  'insurance':           { label: 'Bảo hiểm' },
  'certificates':        { label: 'Chứng chỉ tàu' },
  'reports-list':        { label: 'Danh sách báo cáo' },
  'reports-calendar':    { label: 'Lịch báo cáo' },
  'pms-assets':          { label: 'Thiết bị' },
  'pms-work-planning':   { label: 'Kế hoạch công việc' },
  'materials-list':      { label: 'Danh sách vật tư' },
  'materials-requests':  { label: 'Yêu cầu vật tư' },
  'materials-receipts':  { label: 'Phiếu nhập kho' },
  'materials-inventory': { label: 'Tồn kho' },
};

/** Tầng 1: nhóm. Nhóm có nhiều mục thì hiện thêm hàng mục con (tầng 2). */
const TAB_GROUPS: { id: string; label: string; icon: React.ReactNode; items: TabId[] }[] = [
  { id: 'overview', label: 'Tổng quan', icon: <LayoutDashboard />, items: ['overview'] },
  { id: 'crew', label: 'Thuyền viên', icon: <Users />, items: ['crew'] },
  {
    id: 'ship-data', label: 'Thông số tàu', icon: <FileText />,
    items: ['basic-data', 'dimensions', 'class-flag-state', 'machinery', 'radio-comm', 'tanks-cargo', 'shipowner', 'charterer', 'insurance', 'certificates'],
  },
  { id: 'reports', label: 'Báo cáo', icon: <BarChart3 />, items: ['reports-list', 'reports-calendar'] },
  { id: 'pms', label: 'Bảo dưỡng (PMS)', icon: <Wrench />, items: ['pms-assets', 'pms-work-planning'] },
  { id: 'materials', label: 'Vật tư', icon: <Package />, items: ['materials-list', 'materials-requests', 'materials-receipts', 'materials-inventory'] },
];

const groupOf = (tab: TabId) => TAB_GROUPS.find(g => g.items.includes(tab))!;

// ============================================================
// API Helper
// ============================================================
const BASE = ENV.API_BASE_URL;

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

interface TelemetryRealtime {
  latest?: { latitude: number; longitude: number; speedOverGround?: number | null; courseOverGround?: number | null; timestamp: string };
  engine?: { isRunning: boolean };
}

interface CrewLite {
  fullName?: string; name?: string; firstName?: string; lastName?: string;
  rank?: string; rankName?: string; position?: string;
}

interface VesselStatus {
  latitude?: number;
  longitude?: number;
  speedOverGround?: number;
  courseOverGround?: number;
  timestamp?: string;
  captainName?: string;
  engineRunning?: boolean;
  crewCount?: number;
  lastReport?: string;
}

const applyTelemetry = (prev: VesselStatus | null, t: TelemetryRealtime | null): VesselStatus | null => {
  if (!t?.latest && !t?.engine) return prev;
  const next = { ...prev };
  if (t.latest) {
    next.latitude = t.latest.latitude;
    next.longitude = t.latest.longitude;
    next.speedOverGround = t.latest.speedOverGround ?? undefined;
    next.courseOverGround = t.latest.courseOverGround ?? undefined;
    next.timestamp = t.latest.timestamp;
  }
  if (t.engine) next.engineRunning = t.engine.isRunning;
  return next;
};

// ============================================================
// Main Component
// ============================================================
export const VesselDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Mở thẳng một tab qua ?tab= (vd. từ địa chỉ cũ /report/vessel/:id → ?tab=reports)
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const t = searchParams.get('tab');
    if (t === 'reports') return 'reports-list';
    return t && t in TABS ? (t as TabId) : 'overview';
  });
  /** Mục con mở gần nhất của từng nhóm, để quay lại nhóm thì về đúng chỗ cũ. */
  const [lastInGroup, setLastInGroup] = useState<Record<string, TabId>>({});
  const [vessel, setVessel] = useState<Vessel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Đang sửa dở thông số tàu (để hỏi trước khi rời nhóm Thông số tàu). */
  const [particularsDirty, setParticularsDirty] = useState(false);
  const ask = useConfirm();

  const [vesselStatus, setVesselStatus] = useState<VesselStatus | null>(null);

  // Tải tàu + vị trí/động cơ + thuyền viên
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);

    const loadAll = async () => {
      try {
        const [vData, posRes, crewRes] = await Promise.all([
          apiFetch<Vessel>(`${BASE}/vessels/${id}`),
          apiFetch<TelemetryRealtime>(`${BASE}/vessel-telemetry/vessel/${id}/realtime?hours=1`).catch(() => null),
          apiFetch<CrewLite[] | { data?: CrewLite[] }>(`${BASE}/crew/vessel/${id}`).catch(() => null),
        ]);

        setVessel(vData);
        setVesselStatus(prev => applyTelemetry(prev, posRes));

        if (crewRes) {
          const crewList = Array.isArray(crewRes) ? crewRes : crewRes.data ?? [];
          const captain = crewList.find(c =>
            c.rank?.toLowerCase()?.includes('captain') ||
            c.position?.toLowerCase()?.includes('master') ||
            c.rankName?.toLowerCase()?.includes('thuyền trưởng')
          );
          setVesselStatus(prev => ({
            ...prev,
            captainName: captain
              ? (captain.fullName || captain.name || `${captain.firstName || ''} ${captain.lastName || ''}`.trim())
              : undefined,
            crewCount: crewList.length,
          }));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Không tải được dữ liệu tàu');
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [id]);

  // Cập nhật vị trí + động cơ mỗi 10s
  useEffect(() => {
    if (!id) return;
    const interval = setInterval(async () => {
      const posRes = await apiFetch<TelemetryRealtime>(`${BASE}/vessel-telemetry/vessel/${id}/realtime?hours=1`).catch(() => null);
      setVesselStatus(prev => applyTelemetry(prev, posRes));
    }, 10000);
    return () => clearInterval(interval);
  }, [id]);

  const selectTab = async (tabId: TabId) => {
    if (particularsDirty && !isParticularsTab(tabId) &&
        !await ask('Thông số tàu còn thay đổi chưa lưu. Rời đi sẽ mất các thay đổi này.', { title: 'Bỏ thay đổi?', confirmLabel: 'Bỏ thay đổi' })) return;
    if (!isParticularsTab(tabId)) setParticularsDirty(false);
    setActiveTab(tabId);
    setLastInGroup(prev => ({ ...prev, [groupOf(tabId).id]: tabId }));

    // Ghi tab lên địa chỉ: F5, gửi link hay "Quay lại" từ một báo cáo đều mở đúng tab.
    // Trang PMS/Vật tư nhúng vẫn đọc vesselId từ địa chỉ như trước.
    const params: Record<string, string> = { tab: tabId };
    if ((tabId.startsWith('pms-') || tabId.startsWith('materials-')) && id) params.vesselId = id;
    setSearchParams(params, { replace: true });
  };

  const selectGroup = (group: typeof TAB_GROUPS[number]) => selectTab(lastInGroup[group.id] ?? group.items[0]);

  const renderTabContent = () => {
    if (!vessel) return null;

    switch (activeTab) {
      case 'overview':
        return <VesselOverviewTab vessel={vessel} vesselStatus={vesselStatus} />;
      case 'basic-data':
      case 'dimensions':
      case 'machinery':
      case 'shipowner':
      case 'charterer':
      case 'class-flag-state':
      case 'insurance':
      case 'radio-comm':
      case 'tanks-cargo':
        return (
          <VesselParticularsPanel
            vesselId={id!}
            tab={activeTab}
            onDirtyChange={setParticularsDirty}
            onSaved={data => setVessel(prev => (prev ? { ...prev, ...(data as Partial<Vessel>) } : prev))}
          />
        );
      case 'certificates':
        return <VesselCertificateTab vesselId={id!} vesselName={vessel.name || 'Vessel'} />;
      case 'crew':
        return <VesselCrewTab vesselId={id!} vesselName={vessel.name || 'Vessel'} />;
      // Bờ chỉ xem hoạt động dưới tàu — lọc theo tàu đang mở, không cho sửa.
      case 'pms-assets':
        return <AssetsPage vesselId={id!} readOnly />;
      case 'pms-work-planning':
        return <WorkPlanningPage vesselId={id!} readOnly />;
      case 'materials-list':
        return <MaterialPage vesselId={id!} />;
      case 'materials-requests':
        return <MaterialRequestPage vesselId={id!} readOnly />;
      case 'materials-receipts':
        return <StockReceiptPage vesselId={id!} readOnly />;
      case 'materials-inventory':
        return <InventoryPage vesselId={id!} readOnly />;
      case 'reports-list':
        return <VesselReportsTab vesselId={id!} view="list" />;
      case 'reports-calendar':
        return <VesselReportsTab vesselId={id!} view="calendar" />;
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-[13px] text-ink-muted">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> Đang tải dữ liệu tàu...
      </div>
    );
  }

  if (error || !vessel) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[13px] text-ink-muted">
        <AlertCircle className="h-7 w-7 text-red-600" aria-hidden="true" />
        <span>{error ?? 'Không tìm thấy tàu'}</span>
        <Button variant="secondary" icon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/vessels')}>Về danh sách tàu</Button>
      </div>
    );
  }

  const isWorkspaceTab = activeTab.startsWith('pms-') || activeTab.startsWith('materials-') || activeTab.startsWith('reports-');
  const activeGroup = groupOf(activeTab);
  const meta = [vessel.imo && `IMO ${vessel.imo}`, vessel.callSign, vessel.vesselType, vessel.flag].filter(Boolean);

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      {/* ── Đầu trang + thanh tab ── */}
      <div className="shrink-0 border-b border-line bg-surface">
        <header className="flex items-center gap-3 px-6 pb-2 pt-4">
          <button
            type="button"
            onClick={() => navigate('/vessels')}
            aria-label="Về danh sách tàu"
            title="Về danh sách tàu"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-line text-ink-muted transition-colors hover:border-accent/40 hover:bg-primary-soft hover:text-primary"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-white">
            <Ship className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2.5 text-lg font-bold leading-7 text-ink">
              <span className="truncate">{vessel.name}</span>
              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                vessel.isActive ? 'bg-emerald-50 text-emerald-700 [&>i]:bg-emerald-500' : 'bg-slate-100 text-slate-600 [&>i]:bg-slate-400'
              }`}>
                <i className="h-1.5 w-1.5 rounded-full" />{vessel.isActive ? 'Đang hoạt động' : 'Ngừng hoạt động'}
              </span>
            </h1>
            <p className="truncate text-[13px] text-ink-muted">
              {meta.map((m, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="mx-1.5 text-ink-light">·</span>}
                  <span className={i <= 1 ? 'font-mono' : ''}>{m}</span>
                </React.Fragment>
              ))}
            </p>
          </div>
        </header>

        {/* Tầng 1: nhóm */}
        <nav className="flex gap-1 overflow-x-auto px-6" role="tablist" aria-label="Nhóm thông tin tàu">
          {TAB_GROUPS.map(group => {
            const on = group.id === activeGroup.id;
            return (
              <button
                key={group.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => selectGroup(group)}
                className={`-mb-px inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-3.5 text-sm transition-colors [&>svg]:h-4 [&>svg]:w-4 ${
                  on ? 'border-primary font-semibold text-primary' : 'border-transparent text-ink-muted hover:border-line hover:text-ink'
                }`}
              >
                {group.icon}
                {group.label}
                {group.items.length > 1 && (
                  <span className={`rounded-full px-1.5 text-xs tabular-nums ${on ? 'bg-primary-soft text-primary' : 'bg-canvas text-ink-light'}`}>
                    {group.items.length}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tầng 2: mục con của nhóm đang mở */}
      {activeGroup.items.length > 1 && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-surface/70 px-6 py-2" role="tablist" aria-label={activeGroup.label}>
          {activeGroup.items.map(tabId => {
            const tab = TABS[tabId];
            const on = tabId === activeTab;
            return (
              <button
                key={tabId}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => selectTab(tabId)}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[13px] transition-colors ${
                  on ? 'bg-primary text-white font-semibold' : 'text-ink-muted hover:bg-primary-soft hover:text-ink'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
          {isParticularsTab(activeTab) && (
            <span className="ml-auto hidden shrink-0 items-center gap-1.5 pl-4 text-[13px] text-ink-muted md:inline-flex">
              <ArrowLeftRight className="h-4 w-4" aria-hidden="true" /> Bờ và tàu cùng sửa được, tự đồng bộ hai chiều
            </span>
          )}
        </div>
      )}

      {/* ── Nội dung tab ── */}
      <div className={isWorkspaceTab ? 'flex min-h-0 flex-1 overflow-hidden bg-surface [&>*]:min-h-0 [&>*]:min-w-0 [&>*]:flex-1' : 'min-h-0 flex-1 overflow-y-auto px-6 py-5'}>
        {renderTabContent()}
      </div>

    </div>
  );
};
