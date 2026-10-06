import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Anchor,
  ArrowLeft,
  Bell,
  CheckCircle,
  Clock,
  Compass,
  Droplets,
  FileText,
  Fuel,
  History,
  MapPin,
  RotateCcw,
  Send,
  Ship,
  Users,
  Waves,
  Wrench,
  XCircle,
} from 'lucide-react';
import { ReportingService } from '../../services/reporting.service';
import { useCurrentAccountName } from '../../hooks/useCurrentAccountName';
import './ReportingTheme.css';
import type {
  ReportDetailDto,
  ReportStatus,
  WorkflowHistoryDto,
} from '../../types/reporting.types';

const STATUS_CONFIG: Record<ReportStatus, { badge: string; dot: string; icon: ReactNode; label: string }> = {
  DRAFT: {
    badge: 'bg-slate-100 text-slate-700',
    dot: 'bg-slate-400',
    icon: <FileText className="h-4 w-4" />,
    label: 'Draft',
  },
  SUBMITTED: {
    badge: 'bg-yellow-100 text-yellow-700',
    dot: 'bg-amber-500',
    icon: <Clock className="h-4 w-4" />,
    label: 'Pending approval',
  },
  APPROVED: {
    badge: 'bg-blue-100 text-blue-700',
    dot: 'bg-blue-500',
    icon: <CheckCircle className="h-4 w-4" />,
    label: 'Approved',
  },
  REJECTED: {
    badge: 'bg-red-100 text-red-700',
    dot: 'bg-rose-500',
    icon: <XCircle className="h-4 w-4" />,
    label: 'Rejected',
  },
  TRANSMITTED: {
    badge: 'bg-green-100 text-green-700',
    dot: 'bg-emerald-500',
    icon: <Send className="h-4 w-4" />,
    label: 'Transmitted',
  },
};

const REPORT_TYPE_CONFIG: Record<ReportDetailDto['reportTypeCode'], { title: string; icon: ReactNode }> = {
  NOON: { title: 'Noon Report', icon: <Ship className="h-4 w-4" /> },
  DEPARTURE: { title: 'Departure Report', icon: <Anchor className="h-4 w-4" /> },
  ARRIVAL: { title: 'Arrival Report', icon: <Waves className="h-4 w-4" /> },
  BUNKER: { title: 'Bunker Report', icon: <Fuel className="h-4 w-4" /> },
  POSITION: { title: 'Position Report', icon: <MapPin className="h-4 w-4" /> },
};

type KeyValueItem = {
  label: string;
  value: string;
  tone?: 'default' | 'blue' | 'green' | 'amber' | 'red';
};

const toneClasses: Record<NonNullable<KeyValueItem['tone']>, string> = {
  default: 'text-slate-800',
  blue: 'text-blue-700',
  green: 'text-emerald-700 dark:text-emerald-300',
  amber: 'text-amber-700 dark:text-amber-300',
  red: 'text-rose-700 dark:text-rose-300',
};

function formatDateTime(value?: string) {
  if (!value) {
    return 'N/A';
  }

  return new Date(value).toLocaleString('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateOnly(value?: string) {
  if (!value) {
    return 'N/A';
  }

  return new Date(value).toLocaleDateString('en-GB');
}

function formatNumber(value?: number, suffix = '', digits = 1) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'N/A';
  }

  return `${value.toFixed(digits)}${suffix}`;
}

function toText(value?: string | number | null) {
  if (value === undefined || value === null || value === '') {
    return 'N/A';
  }

  return String(value);
}

function getReportDateTime(report: ReportDetailDto) {
  switch (report.reportTypeCode) {
    case 'NOON':
      return report.reportDate;
    case 'DEPARTURE':
      return report.departureDateTime;
    case 'ARRIVAL':
      return report.arrivalDateTime;
    case 'BUNKER':
      return report.bunkerDate;
    case 'POSITION':
      return report.reportDateTime;
  }
}

function getEditRoute(report: ReportDetailDto) {
  switch (report.reportTypeCode) {
    case 'NOON':
      return `/reporting/noon/edit/${report.maritimeReportId}`;
    case 'DEPARTURE':
      return `/reporting/departure/edit/${report.maritimeReportId}`;
    case 'ARRIVAL':
      return `/reporting/arrival/edit/${report.maritimeReportId}`;
    case 'BUNKER':
      return `/reporting/bunker/edit/${report.maritimeReportId}`;
    case 'POSITION':
      return `/reporting/position/edit/${report.maritimeReportId}`;
  }
}

function DetailGrid({ title, icon, items }: { title: string; icon: ReactNode; items: KeyValueItem[] }) {
  const visibleItems = items.filter((item) => item.value !== 'N/A');

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-gray-200 bg-blue-50 px-4 py-2.5">
        <h2 className="flex items-center gap-2 text-xs font-semibold text-gray-600">
          {icon}
          {title}
        </h2>
      </div>
      <div className="grid gap-px bg-slate-100 md:grid-cols-2">
        {visibleItems.map((item) => (
          <div key={item.label} className="bg-white px-4 py-3">
            <p className="text-xs text-slate-500">{item.label}</p>
            <p className={`mt-0.5 text-sm font-semibold ${toneClasses[item.tone ?? 'default']}`}>{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function RemarksCard({ items }: { items: Array<{ label: string; value?: string; tone: string }> }) {
  const visibleItems = items.filter((item) => item.value?.trim());

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">Remarks and notes</h2>
      </div>
      <div className="divide-y divide-slate-100">
        {visibleItems.map((item) => (
          <div key={item.label} className="px-4 py-3">
            <p className="text-xs font-medium text-slate-500">{item.label}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-800">{item.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function getPrimaryMetrics(report: ReportDetailDto): KeyValueItem[] {
  switch (report.reportTypeCode) {
    case 'NOON':
      return [
        { label: 'Speed over ground', value: formatNumber(report.speedOverGround, ' kts', 1), tone: 'blue' },
        { label: 'Distance travelled', value: formatNumber(report.distanceTraveled, ' nm', 1), tone: 'blue' },
        { label: 'Fuel oil consumed', value: formatNumber(report.fuelOilConsumed, ' MT', 1), tone: 'amber' },
        { label: 'Crew on board', value: toText(report.crewOnBoard), tone: 'green' },
      ];
    case 'DEPARTURE':
      return [
        { label: 'Destination port', value: toText(report.destinationPort), tone: 'blue' },
        { label: 'Distance to next port', value: formatNumber(report.distanceToNextPort, ' nm', 1), tone: 'blue' },
        { label: 'Fuel oil ROB', value: formatNumber(report.fuelOilROB, ' MT', 1), tone: 'amber' },
        { label: 'Cargo on board', value: formatNumber(report.cargoOnBoard, ' MT', 1), tone: 'green' },
      ];
    case 'ARRIVAL':
      return [
        { label: 'Voyage distance', value: formatNumber(report.voyageDistance, ' nm', 1), tone: 'blue' },
        { label: 'Average speed', value: formatNumber(report.averageSpeed, ' kts', 1), tone: 'blue' },
        { label: 'Total fuel consumed', value: formatNumber(report.totalFuelConsumed, ' MT', 1), tone: 'amber' },
        { label: 'Crew on board', value: toText(report.crewOnBoard), tone: 'green' },
      ];
    case 'BUNKER':
      return [
        { label: 'Supplier', value: toText(report.supplierName), tone: 'blue' },
        { label: 'Quantity received', value: formatNumber(report.quantityReceived, ' MT', 3), tone: 'green' },
        { label: 'Sulphur content', value: formatNumber(report.sulphurContent, '%', 2), tone: 'amber' },
        { label: 'Total cost', value: formatNumber(report.totalCost, '', 2), tone: 'green' },
      ];
    case 'POSITION':
      return [
        { label: 'Latitude', value: formatNumber(report.latitude, '°', 6), tone: 'blue' },
        { label: 'Longitude', value: formatNumber(report.longitude, '°', 6), tone: 'blue' },
        { label: 'Speed over ground', value: formatNumber(report.speedOverGround, ' kts', 1), tone: 'amber' },
        { label: 'Report reason', value: toText(report.reportReason), tone: 'green' },
      ];
  }
}

export function ReportDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const currentAccountName = useCurrentAccountName();

  const [report, setReport] = useState<ReportDetailDto | null>(null);
  const [history, setHistory] = useState<WorkflowHistoryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showTransmitModal, setShowTransmitModal] = useState(false);
  const [approvalData, setApprovalData] = useState({ masterSignature: '', approvalRemarks: '' });
  const [rejectionReason, setRejectionReason] = useState('');
  const [transmitData, setTransmitData] = useState({ transmissionMethod: 'EMAIL', recipientEmails: '' });

  useEffect(() => {
    if (!id) {
      return;
    }

    void loadReportDetails();
    void loadWorkflowHistory();
  }, [id]);

  useEffect(() => {
    if (!showApproveModal || !currentAccountName) {
      return;
    }

    setApprovalData((prev) => ({
      ...prev,
      masterSignature: prev.masterSignature.trim() ? prev.masterSignature : currentAccountName,
    }));
  }, [currentAccountName, showApproveModal]);

  const loadReportDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await ReportingService.getReportById(id!);
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report.');
    } finally {
      setLoading(false);
    }
  };

  const loadWorkflowHistory = async () => {
    try {
      const data = await ReportingService.getWorkflowHistory(id!);
      setHistory(data.history);
    } catch (err) {
      console.error('Failed to load workflow history', err);
    }
  };

  const reloadAll = async () => {
    await loadReportDetails();
    await loadWorkflowHistory();
  };

  const handleApprove = async () => {
    try {
      await ReportingService.approveReport(id!, approvalData);
      setShowApproveModal(false);
      setApprovalData({ masterSignature: currentAccountName, approvalRemarks: '' });
      toast.success('Report approved successfully');
      await reloadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve report');
    }
  };

  const handleReject = async () => {
    try {
      await ReportingService.rejectReport(id!, rejectionReason);
      setShowRejectModal(false);
      setRejectionReason('');
      toast.success('Report rejected');
      await reloadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject report');
    }
  };

  const handleTransmit = async () => {
    try {
      await ReportingService.transmitReport(id!, {
        transmissionMethod: transmitData.transmissionMethod,
        recipientEmails: transmitData.recipientEmails.split(';').map((email) => email.trim()).filter(Boolean),
        includeAttachments: false,
      });
      setShowTransmitModal(false);
      setTransmitData({ transmissionMethod: 'EMAIL', recipientEmails: '' });
      toast.success('Report transmitted successfully');
      await reloadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to transmit report');
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-blue-600" />
          <p className="mt-4 text-sm font-medium text-slate-600">Loading report detail...</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-slate-50 px-4 py-8 md:px-6">
        <div className="mx-auto max-w-4xl rounded-lg border border-rose-200 bg-rose-50 p-5">
          <div className="flex items-start gap-3">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div>
              <p className="font-semibold text-rose-900">Unable to open report</p>
              <p className="mt-1 text-sm text-rose-700">{error || 'Report not found.'}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[report.status] || {
    badge: 'bg-slate-100 text-slate-700',
    dot: 'bg-slate-400',
    icon: <FileText className="h-4 w-4" />,
    label: report.status || 'Unknown',
  };
  const typeConfig = REPORT_TYPE_CONFIG[report.reportTypeCode] || {
    title: report.reportTypeCode || 'Unknown Report',
    icon: <FileText className="h-4 w-4" />,
  };
  const editRoute = getEditRoute(report);

  const commonItems: KeyValueItem[] = [
    { label: 'Report date/time', value: report.reportTypeCode === 'BUNKER' ? formatDateOnly(getReportDateTime(report)) : formatDateTime(getReportDateTime(report)), tone: 'blue' },
    { label: 'Prepared by', value: toText(report.preparedBy) },
    { label: 'Voyage ID', value: 'voyageId' in report ? toText(report.voyageId) : 'N/A' },
    { label: 'Created at', value: formatDateTime(report.createdAt) },
  ];

  let mainSections: ReactNode[] = [];
  let remarksSection: ReactNode | null = null;
  const sideNotes: ReactNode[] = [];

  switch (report.reportTypeCode) {
    case 'NOON': {
      mainSections = [
        <DetailGrid
          key="noon-nav"
          title="Position and navigation"
          icon={<Compass className="h-5 w-5 text-sky-600" />}
          items={[
            { label: 'Latitude', value: formatNumber(report.latitude, '°', 6) },
            { label: 'Longitude', value: formatNumber(report.longitude, '°', 6) },
            { label: 'Course over ground', value: formatNumber(report.courseOverGround, '°', 1) },
            { label: 'Speed over ground', value: formatNumber(report.speedOverGround, ' kts', 1) },
            { label: 'Distance travelled', value: formatNumber(report.distanceTraveled, ' nm', 1), tone: 'blue' },
            { label: 'Distance to go', value: formatNumber(report.distanceToGo, ' nm', 1), tone: 'blue' },
            { label: 'ETA', value: formatDateTime(report.estimatedTimeOfArrival) },
          ]}
        />,
        <DetailGrid
          key="noon-weather"
          title="Weather conditions"
          icon={<Waves className="h-5 w-5 text-cyan-600" />}
          items={[
            { label: 'Weather', value: toText(report.weatherConditions) },
            { label: 'Sea state', value: toText(report.seaState) },
            { label: 'Wind', value: `${report.windDirection || ''} ${report.windSpeed !== undefined ? `${report.windSpeed} kts` : ''}`.trim() || 'N/A' },
            { label: 'Air temperature', value: formatNumber(report.airTemperature, '°C', 1) },
            { label: 'Sea temperature', value: formatNumber(report.seaTemperature, '°C', 1) },
            { label: 'Pressure', value: formatNumber(report.barometricPressure, ' hPa', 1) },
            { label: 'Visibility', value: toText(report.visibility) },
          ]}
        />,
        <DetailGrid
          key="noon-engine"
          title="Fuel and engine"
          icon={<Fuel className="h-5 w-5 text-amber-600" />}
          items={[
            { label: 'Fuel oil ROB', value: formatNumber(report.fuelOilROB, ' MT', 1), tone: 'amber' },
            { label: 'Diesel oil ROB', value: formatNumber(report.dieselOilROB, ' MT', 1), tone: 'amber' },
            { label: 'Fuel oil consumed', value: formatNumber(report.fuelOilConsumed, ' MT', 1), tone: 'red' },
            { label: 'Diesel oil consumed', value: formatNumber(report.dieselOilConsumed, ' MT', 1), tone: 'red' },
            { label: 'Main engine hours', value: toText(report.mainEngineRunningHours), tone: 'blue' },
            { label: 'Aux engine hours', value: toText(report.auxEngineRunningHours), tone: 'blue' },
            { label: 'Main engine RPM', value: formatNumber(report.mainEngineRPM, '', 0) },
            { label: 'Main engine power', value: formatNumber(report.mainEnginePower, ' kW', 0) },
          ]}
        />,
        <DetailGrid
          key="noon-crew"
          title="Crew, cargo and safety"
          icon={<Users className="h-5 w-5 text-emerald-600" />}
          items={[
            { label: 'Crew on board', value: toText(report.crewOnBoard), tone: 'green' },
            { label: 'Passengers on board', value: toText(report.passengersOnBoard), tone: 'green' },
            { label: 'Cargo on board', value: formatNumber(report.cargoOnBoard, ' MT', 1) },
            { label: 'Cargo description', value: toText(report.cargoDescription) },
            { label: 'Safety drills', value: toText(report.safetyDrillsConducted) },
            { label: 'Certificates expiring soon', value: toText(report.certificatesExpiringSoon) },
          ]}
        />,
      ];

      remarksSection = (
        <RemarksCard
          items={[
            { label: 'Operational', value: report.operationalRemarks, tone: 'border-sky-500 bg-sky-50 text-sky-900' },
            { label: 'Machinery', value: report.machineryRemarks, tone: 'border-violet-500 bg-violet-50 text-violet-900' },
            { label: 'Cargo', value: report.cargoRemarks, tone: 'border-teal-500 bg-teal-50 text-teal-900' },
            { label: 'Maintenance', value: report.maintenanceRemarks, tone: 'border-emerald-500 bg-emerald-50 text-emerald-900' },
            { label: 'Safety incidents', value: report.safetyIncidents, tone: 'border-rose-500 bg-rose-50 text-rose-900' },
            { label: 'General', value: report.generalRemarks, tone: 'border-slate-400 bg-slate-50 text-slate-800' },
          ]}
        />
      );

      if (report.maintenanceSummary) {
        sideNotes.push(
          <div key="maintenance-summary" className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Wrench className="h-4 w-4 text-emerald-600" />
              PMS summary
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Completed (24h)</span><span className="font-semibold">{report.maintenanceSummary.tasksCompletedLast24h}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">In progress</span><span className="font-semibold">{report.maintenanceSummary.tasksInProgress}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Overdue</span><span className="font-semibold text-rose-600">{report.maintenanceSummary.overdueTasks}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Critical due soon</span><span className="font-semibold">{report.maintenanceSummary.criticalTasksDueSoon}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Pending deferrals</span><span className="font-semibold">{report.maintenanceSummary.pendingDeferrals}</span></div>
            </div>
            {report.maintenanceSummary.criticalMaintenanceNotes && (
              <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">{report.maintenanceSummary.criticalMaintenanceNotes}</p>
            )}
          </div>,
        );
      }

      if (report.alarmSummary) {
        sideNotes.push(
          <div key="alarm-summary" className="rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Bell className="h-4 w-4 text-amber-600" />
              Alarm summary
            </h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Active</span><span className="font-semibold">{report.alarmSummary.activeAlarms}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Acknowledged</span><span className="font-semibold">{report.alarmSummary.acknowledgedAlarms}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Critical</span><span className="font-semibold text-rose-600">{report.alarmSummary.criticalAlarms}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Warnings</span><span className="font-semibold text-amber-600">{report.alarmSummary.warningAlarms}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Resolved (24h)</span><span className="font-semibold text-emerald-600">{report.alarmSummary.resolvedLast24h}</span></div>
            </div>
            {report.alarmSummary.safetyNotes && (
              <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-slate-600">{report.alarmSummary.safetyNotes}</p>
            )}
          </div>,
        );
      }
      break;
    }
    case 'DEPARTURE': {
      mainSections = [
        <DetailGrid key="dep-port" title="Port and pilot" icon={<Anchor className="h-5 w-5 text-sky-600" />} items={[
          { label: 'Port name', value: toText(report.portName), tone: 'blue' },
          { label: 'Port code', value: toText(report.portCode) },
          { label: 'Pilot off time', value: formatDateTime(report.pilotOffTime) },
          { label: 'Last line let go', value: formatDateTime(report.lastLineLetGoTime) },
          { label: 'Departure latitude', value: formatNumber(report.departureLatitude, '°', 6) },
          { label: 'Departure longitude', value: formatNumber(report.departureLongitude, '°', 6) },
        ]} />,
        <DetailGrid key="dep-draft" title="Draft and ROB" icon={<Droplets className="h-5 w-5 text-cyan-600" />} items={[
          { label: 'Draft forward', value: formatNumber(report.draftForward, ' m', 2) },
          { label: 'Draft aft', value: formatNumber(report.draftAft, ' m', 2) },
          { label: 'Draft midship', value: formatNumber(report.draftMidship, ' m', 2) },
          { label: 'Fuel oil ROB', value: formatNumber(report.fuelOilROB, ' MT', 1), tone: 'amber' },
          { label: 'Diesel oil ROB', value: formatNumber(report.dieselOilROB, ' MT', 1), tone: 'amber' },
          { label: 'Lub oil ROB', value: formatNumber(report.lubOilROB, '', 1) },
          { label: 'Fresh water ROB', value: formatNumber(report.freshWaterROB, '', 1) },
        ]} />,
        <DetailGrid key="dep-voyage" title="Cargo and voyage" icon={<Ship className="h-5 w-5 text-emerald-600" />} items={[
          { label: 'Cargo on board', value: formatNumber(report.cargoOnBoard, ' MT', 1), tone: 'green' },
          { label: 'Cargo description', value: toText(report.cargoDescription) },
          { label: 'Crew on board', value: toText(report.crewOnBoard), tone: 'green' },
          { label: 'Passengers on board', value: toText(report.passengersOnBoard), tone: 'green' },
          { label: 'Destination port', value: toText(report.destinationPort), tone: 'blue' },
          { label: 'Next port code', value: toText(report.nextPortCode) },
          { label: 'Distance to next port', value: formatNumber(report.distanceToNextPort, ' nm', 1), tone: 'blue' },
          { label: 'Estimated arrival', value: formatDateTime(report.estimatedArrival) },
        ]} />,
      ];
      remarksSection = <RemarksCard items={[{ label: 'Departure remarks', value: report.remarks, tone: 'border-slate-400 bg-slate-50 text-slate-800' }]} />;
      break;
    }
    case 'ARRIVAL': {
      mainSections = [
        <DetailGrid key="arr-port" title="Arrival port and pilot" icon={<Anchor className="h-5 w-5 text-emerald-600" />} items={[
          { label: 'Port name', value: toText(report.portName), tone: 'green' },
          { label: 'Port code', value: toText(report.portCode) },
          { label: 'Pilot on board', value: formatDateTime(report.pilotOnBoardTime) },
          { label: 'First line ashore', value: formatDateTime(report.firstLineAshoreTime) },
          { label: 'Arrival latitude', value: formatNumber(report.arrivalLatitude, '°', 6) },
          { label: 'Arrival longitude', value: formatNumber(report.arrivalLongitude, '°', 6) },
        ]} />,
        <DetailGrid key="arr-voyage" title="Voyage statistics" icon={<Compass className="h-5 w-5 text-sky-600" />} items={[
          { label: 'Voyage distance', value: formatNumber(report.voyageDistance, ' nm', 1), tone: 'blue' },
          { label: 'Voyage duration', value: formatNumber(report.voyageDuration, ' h', 1), tone: 'blue' },
          { label: 'Average speed', value: formatNumber(report.averageSpeed, ' kts', 1) },
          { label: 'Draft forward', value: formatNumber(report.draftForward, ' m', 2) },
          { label: 'Draft aft', value: formatNumber(report.draftAft, ' m', 2) },
          { label: 'Draft midship', value: formatNumber(report.draftMidship, ' m', 2) },
        ]} />,
        <DetailGrid key="arr-cargo" title="ROB, cargo and crew" icon={<Users className="h-5 w-5 text-amber-600" />} items={[
          { label: 'Fuel oil ROB', value: formatNumber(report.fuelOilROB, ' MT', 1), tone: 'amber' },
          { label: 'Diesel oil ROB', value: formatNumber(report.dieselOilROB, ' MT', 1), tone: 'amber' },
          { label: 'Lub oil ROB', value: formatNumber(report.lubOilROB, '', 1) },
          { label: 'Fresh water ROB', value: formatNumber(report.freshWaterROB, '', 1) },
          { label: 'Total fuel consumed', value: formatNumber(report.totalFuelConsumed, ' MT', 1), tone: 'red' },
          { label: 'Total diesel consumed', value: formatNumber(report.totalDieselConsumed, ' MT', 1), tone: 'red' },
          { label: 'Cargo on board', value: formatNumber(report.cargoOnBoard, ' MT', 1), tone: 'green' },
          { label: 'Cargo description', value: toText(report.cargoDescription) },
          { label: 'Crew on board', value: toText(report.crewOnBoard), tone: 'green' },
          { label: 'Passengers on board', value: toText(report.passengersOnBoard), tone: 'green' },
        ]} />,
      ];
      remarksSection = <RemarksCard items={[{ label: 'Arrival remarks', value: report.remarks, tone: 'border-slate-400 bg-slate-50 text-slate-800' }]} />;
      break;
    }
    case 'BUNKER': {
      mainSections = [
        <DetailGrid key="bnk-supplier" title="Supplier and delivery" icon={<Fuel className="h-5 w-5 text-amber-600" />} items={[
          { label: 'Port name', value: toText(report.portName), tone: 'blue' },
          { label: 'Port code', value: toText(report.portCode) },
          { label: 'Supplier name', value: toText(report.supplierName), tone: 'green' },
          { label: 'BDN number', value: toText(report.bdnNumber), tone: 'amber' },
          { label: 'Delivery method', value: toText(report.deliveryMethod) },
        ]} />,
        <DetailGrid key="bnk-fuel" title="Fuel specification" icon={<Droplets className="h-5 w-5 text-cyan-600" />} items={[
          { label: 'Fuel type', value: toText(report.fuelType) },
          { label: 'Fuel grade', value: toText(report.fuelGrade) },
          { label: 'Quantity received', value: formatNumber(report.quantityReceived, ' MT', 3), tone: 'green' },
          { label: 'Density', value: formatNumber(report.density, '', 1) },
          { label: 'Sulphur content', value: formatNumber(report.sulphurContent, '%', 2), tone: 'amber' },
          { label: 'Viscosity', value: formatNumber(report.viscosity, ' cSt', 1) },
          { label: 'Flash point', value: formatNumber(report.flashPoint, '°C', 1) },
        ]} />,
        <DetailGrid key="bnk-commercial" title="ROB and cost" icon={<FileText className="h-5 w-5 text-violet-600" />} items={[
          { label: 'ROB before', value: formatNumber(report.robBefore, ' MT', 1) },
          { label: 'ROB after', value: formatNumber(report.robAfter, ' MT', 1) },
          { label: 'Tanks loaded', value: toText(report.tanksLoaded) },
          { label: 'Seal numbers', value: toText(report.sealNumbers) },
          { label: 'Chief engineer signature', value: toText(report.chiefEngineerSignature) },
          { label: 'Unit price', value: formatNumber(report.unitPrice, '', 2), tone: 'blue' },
          { label: 'Total cost', value: formatNumber(report.totalCost, '', 2), tone: 'green' },
        ]} />,
      ];
      remarksSection = <RemarksCard items={[{ label: 'Bunker remarks', value: report.remarks, tone: 'border-slate-400 bg-slate-50 text-slate-800' }]} />;
      break;
    }
    case 'POSITION': {
      mainSections = [
        <DetailGrid key="pos-nav" title="Reported position" icon={<MapPin className="h-5 w-5 text-violet-600" />} items={[
          { label: 'Latitude', value: formatNumber(report.latitude, '°', 6), tone: 'blue' },
          { label: 'Longitude', value: formatNumber(report.longitude, '°', 6), tone: 'blue' },
          { label: 'Course over ground', value: formatNumber(report.courseOverGround, '°', 1) },
          { label: 'Speed over ground', value: formatNumber(report.speedOverGround, ' kts', 1) },
          { label: 'Report reason', value: toText(report.reportReason), tone: 'amber' },
        ]} />,
        <DetailGrid key="pos-route" title="Route context" icon={<Ship className="h-5 w-5 text-sky-600" />} items={[
          { label: 'Last port', value: toText(report.lastPort) },
          { label: 'Next port', value: toText(report.nextPort) },
          { label: 'ETA', value: formatDateTime(report.eta) },
          { label: 'Cargo on board', value: formatNumber(report.cargoOnBoard, ' MT', 1) },
          { label: 'Crew on board', value: toText(report.crewOnBoard) },
        ]} />,
      ];
      remarksSection = <RemarksCard items={[{ label: 'Position remarks', value: report.remarks, tone: 'border-slate-400 bg-slate-50 text-slate-800' }]} />;
      break;
    }
  }

  const primaryMetrics = getPrimaryMetrics(report).filter((item) => item.value !== 'N/A');

  return (
    <div className="reporting-page h-full w-full overflow-y-auto bg-gray-50">
      <div className="px-4 py-4">

        {/* ── Page header ─────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start gap-3 border-b border-gray-200 pb-4">
          <button
            onClick={() => navigate('/reporting/reports')}
            className="mt-0.5 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              {typeConfig.icon}
              <span>{typeConfig.title}</span>
            </div>
            <h1 className="mt-0.5 text-lg font-semibold text-gray-900">{report.reportNumber}</h1>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-slate-500">
              <span>
                {report.reportTypeCode === 'BUNKER'
                  ? formatDateOnly(getReportDateTime(report))
                  : formatDateTime(getReportDateTime(report))}
              </span>
              <span>{report.preparedBy || 'Unknown'}</span>
              {'voyageId' in report && report.voyageId && <span>Voyage {report.voyageId}</span>}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold ${statusConfig.badge}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${statusConfig.dot}`} />
              {statusConfig.label}
            </span>

            {report.status === 'DRAFT' && (
              <>
                {editRoute && (
                  <button
                    onClick={() => navigate(editRoute)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <FileText className="h-4 w-4" />
                    Edit
                  </button>
                )}
                <button
                  onClick={() => {
                    toast('Submit this report for approval?', {
                      action: {
                        label: 'Submit',
                        onClick: async () => {
                          try {
                            await ReportingService.submitReport(id!);
                            toast.success('Report submitted');
                            await reloadAll();
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : 'Failed to submit report');
                          }
                        }
                      }
                    });
                  }}
                  className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  <Send className="h-4 w-4" />
                  Submit
                </button>
              </>
            )}

            {report.status === 'SUBMITTED' && (
              <>
                <button
                  onClick={() => setShowRejectModal(true)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-100"
                >
                  <XCircle className="h-4 w-4" />
                  Reject
                </button>
                <button
                  onClick={() => setShowApproveModal(true)}
                  className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  <CheckCircle className="h-4 w-4" />
                  Approve
                </button>
              </>
            )}

            {report.status === 'APPROVED' && !report.isTransmitted && (
              <button
                onClick={() => setShowTransmitModal(true)}
                className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                <Send className="h-4 w-4" />
                Transmit
              </button>
            )}

            {report.status === 'REJECTED' && (
              <button
                onClick={async () => {
                  const corrections = window.prompt('What corrections will be made before resubmission?');
                  if (!corrections) return;
                  try {
                    await ReportingService.reopenReport(id!, corrections);
                    toast.success('Report reopened');
                    await reloadAll();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : 'Failed to reopen report');
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                <RotateCcw className="h-4 w-4" />
                Reopen
              </button>
            )}
          </div>
        </div>

        {/* ── Key metrics strip ────────────────────────────────────── */}
        {primaryMetrics.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {primaryMetrics.map((metric) => (
              <div key={metric.label} className="rounded-md border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-500">{metric.label}</p>
                <p className={`mt-0.5 text-lg font-semibold ${toneClasses[metric.tone ?? 'default']}`}>{metric.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Main content ─────────────────────────────────────────── */}
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <DetailGrid title="Report metadata" icon={<FileText className="h-4 w-4 text-slate-400" />} items={commonItems} />
            {mainSections}
            {remarksSection}
          </div>

          <div className="space-y-4">
            {report.masterSignature && (
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  Master signature
                </h3>
                <p className="text-sm font-medium text-slate-800">{report.masterSignature}</p>
                {report.signedAt && (
                  <p className="mt-1 text-xs text-slate-400">Signed {formatDateTime(report.signedAt)}</p>
                )}
              </div>
            )}

            {report.isTransmitted && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-emerald-800">
                  <Send className="h-4 w-4" />
                  Transmission complete
                </h3>
                <p className="text-xs text-emerald-700">
                  {report.transmittedAt ? formatDateTime(report.transmittedAt) : 'Timestamp unavailable'}
                </p>
              </div>
            )}

            {sideNotes}

            <div className="rounded-lg border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-4 py-3">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <History className="h-4 w-4 text-slate-400" />
                  Workflow history
                </h3>
              </div>
              <div className="divide-y divide-slate-100">
                {history.length === 0 ? (
                  <p className="px-4 py-4 text-xs italic text-slate-400">No workflow events yet.</p>
                ) : (
                  history.map((entry, index) => (
                    <div key={`${entry.changedAt}-${index}`} className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <span className="font-medium text-slate-700">{entry.fromStatus}</span>
                        <span>→</span>
                        <span className="font-semibold text-slate-900">{entry.toStatus}</span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-slate-800">{entry.changedBy}</p>
                      <p className="text-xs text-slate-400">{formatDateTime(entry.changedAt)}</p>
                      {entry.remarks && (
                        <p className="mt-1 text-sm leading-5 text-slate-600">{entry.remarks}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Approval modal ───────────────────────────────────────── */}
      {showApproveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <CheckCircle className="h-4 w-4 text-blue-600" />
              Approve report
            </h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Master signature</label>
                <input
                  type="text"
                  value={approvalData.masterSignature}
                  onChange={(event) => setApprovalData({ ...approvalData, masterSignature: event.target.value })}
                  className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Remarks (optional)</label>
                <textarea
                  value={approvalData.approvalRemarks}
                  onChange={(event) => setApprovalData({ ...approvalData, approvalRemarks: event.target.value })}
                  rows={3}
                  className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:bg-white"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => {
                  setShowApproveModal(false);
                  setApprovalData({ masterSignature: currentAccountName, approvalRemarks: '' });
                }}
                className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleApprove}
                disabled={!approvalData.masterSignature.trim()}
                className="flex-1 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Confirm approval
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Rejection modal ──────────────────────────────────────── */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <XCircle className="h-4 w-4 text-rose-600" />
              Reject report
            </h3>
            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-slate-700">Rejection reason</label>
              <textarea
                value={rejectionReason}
                onChange={(event) => setRejectionReason(event.target.value)}
                rows={4}
                className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-rose-400 focus:bg-white"
              />
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowRejectModal(false)}
                className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectionReason.trim()}
                className="flex-1 rounded-md bg-rose-600 px-3 py-2 text-sm font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Confirm rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Transmit modal ───────────────────────────────────────── */}
      {showTransmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
            <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <Send className="h-4 w-4 text-emerald-600" />
              Transmit report
            </h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Method</label>
                <select
                  value={transmitData.transmissionMethod}
                  onChange={(event) => setTransmitData({ ...transmitData, transmissionMethod: event.target.value })}
                  className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:bg-white"
                >
                  <option value="EMAIL">Email</option>
                  <option value="TELEX">Telex</option>
                  <option value="INMARSAT">Inmarsat</option>
                  <option value="VSAT">VSAT</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Recipient emails</label>
                <input
                  type="text"
                  value={transmitData.recipientEmails}
                  onChange={(event) => setTransmitData({ ...transmitData, recipientEmails: event.target.value })}
                  placeholder="ops@example.com; fleet@example.com"
                  className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-400 focus:bg-white"
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setShowTransmitModal(false)}
                className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleTransmit}
                className="flex-1 rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-800"
              >
                Send transmission
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
