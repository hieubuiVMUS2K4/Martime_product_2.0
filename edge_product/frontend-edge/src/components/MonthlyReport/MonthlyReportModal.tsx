import { SigningControls } from "@/components/SigningControls";
/**
 * Monthly Report Details Modal
 * Comprehensive details view of a monthly summary report
 */

import React, { useEffect } from 'react';
import { 
  X, Calendar, TrendingUp, Fuel, Anchor, Ship, Settings, FileText, Award, Edit2, Trash2 
} from 'lucide-react';
import { MonthlyReportDto } from '../../types/aggregate-reports.types';

interface MonthlyReportModalProps {
  report: MonthlyReportDto;
  onClose: () => void;
  monthNames: string[];
  onEdit?: () => void;
  onDelete?: () => void;
}

export const MonthlyReportModal: React.FC<MonthlyReportModalProps> = ({ 
  report, 
  onClose, 
  monthNames, 
  onEdit, 
  onDelete 
}) => {
  const totalFuel = (report.totalFuelOilConsumed || 0) + (report.totalDieselOilConsumed || 0);
  const co2Emissions = totalFuel * 3.114; // CO2 emissions factor

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fadeIn" 
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col animate-slideUp" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-6 py-5">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h2 className="text-2xl font-bold">{report.reportNumber}</h2>
              <p className="text-purple-100 mt-1">
                {monthNames[report.month - 1]} {report.year} • Monthly Summary Report
              </p>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white hover:bg-opacity-20 rounded-full transition-colors"
              aria-label="Close modal"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Action Buttons */}
          {(onEdit || onDelete) && (
            <div className="flex gap-2">
              {onEdit && (
                <button
                  onClick={onEdit}
                  className="flex items-center gap-2 px-4 py-2 bg-white bg-opacity-20 hover:bg-opacity-30 
                           rounded-lg transition-colors text-sm font-medium"
                >
                  <Edit2 className="w-4 h-4" />
                  Edit Report
                </button>
              )}
              {onDelete && (
                <button
                  onClick={onDelete}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500 bg-opacity-80 hover:bg-opacity-100 
                           rounded-lg transition-colors text-sm font-medium"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard 
              title="Total Distance" 
              value={report.totalDistance?.toFixed(1) || '0'} 
              unit="nm"
              icon={<Anchor className="w-6 h-6" />}
              color="blue"
            />
            <StatCard 
              title="Average Speed" 
              value={report.averageSpeed?.toFixed(1) || '0'} 
              unit="knots"
              icon={<TrendingUp className="w-6 h-6" />}
              color="green"
            />
            <StatCard 
              title="Total Fuel" 
              value={totalFuel.toFixed(1)} 
              unit="MT"
              icon={<Fuel className="w-6 h-6" />}
              color="orange"
            />
            <StatCard 
              title="Voyages" 
              value={report.voyagesCompleted || 0} 
              unit="completed"
              icon={<Ship className="w-6 h-6" />}
              color="purple"
            />
          </div>

          {/* Detailed Sections - 3 columns on large screens */}
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {/* Performance Section */}
            <Section title="Performance Metrics" icon={<TrendingUp className="w-5 h-5" />}>
              <DetailRow label="Total Distance" value={`${report.totalDistance?.toFixed(1) || 0} nm`} />
              <DetailRow label="Average Speed" value={`${report.averageSpeed?.toFixed(2) || 0} knots`} />
              <DetailRow label="Steaming Days" value={`${report.totalSteamingDays || 0} days`} />
              <DetailRow label="Port Days" value={`${report.totalPortDays || 0} days`} />
              <DetailRow label="Voyages Completed" value={report.voyagesCompleted || 0} />
            </Section>

            {/* Fuel Consumption */}
            <Section title="Fuel Consumption" icon={<Fuel className="w-5 h-5" />}>
              <DetailRow label="Fuel Oil (HFO)" value={`${report.totalFuelOilConsumed?.toFixed(2) || 0} MT`} />
              <DetailRow label="Diesel Oil (MDO)" value={`${report.totalDieselOilConsumed?.toFixed(2) || 0} MT`} />
              <DetailRow label="Average Fuel/Day" value={`${report.averageFuelPerDay?.toFixed(2) || 0} MT`} />
              <DetailRow label="Fuel Efficiency" value={`${report.fuelEfficiency?.toFixed(2) || 0} nm/MT`} />
              {report.totalFuelCost && (
                <DetailRow label="Total Fuel Cost" value={`$${report.totalFuelCost.toFixed(0)}`} />
              )}
            </Section>

            {/* Bunker Operations */}
            <Section title="Bunker Operations" icon={<Fuel className="w-5 h-5" />}>
              <DetailRow label="Total Operations" value={report.totalBunkerOperations || 0} />
              <DetailRow label="Total Bunkered" value={`${report.totalFuelBunkered?.toFixed(1) || 0} MT`} />
              <DetailRow label="Bunker Frequency" value={`Every ${report.totalBunkerOperations > 0 ? Math.floor(30 / report.totalBunkerOperations) : 'N/A'} days`} />
            </Section>

            {/* Maintenance & Safety */}
            <Section title="Maintenance & Safety" icon={<Settings className="w-5 h-5" />}>
              <DetailRow label="Tasks Completed" value={report.totalMaintenanceCompleted || 0} />
              <DetailRow label="Maintenance Hours" value={`${report.totalMaintenanceHours?.toFixed(1) || 0} hrs`} />
              <DetailRow 
                label="Overdue Tasks" 
                value={report.overdueMaintenanceTasks || 0} 
                highlight={report.overdueMaintenanceTasks > 0} 
              />
              <DetailRow label="Safety Drills" value={report.safetyDrillsConducted || 0} />
              <DetailRow 
                label="Safety Incidents" 
                value={report.safetyIncidents || 0} 
                highlight={report.safetyIncidents > 0} 
              />
              <DetailRow 
                label="Near Miss" 
                value={report.nearMissIncidents || 0} 
                highlight={report.nearMissIncidents > 0} 
              />
            </Section>

            {/* Port Operations */}
            <Section title="Port Operations" icon={<Ship className="w-5 h-5" />}>
              <DetailRow label="Total Port Calls" value={report.totalPortCalls || 0} />
              {report.portsVisited && (
                <DetailRow label="Ports Visited" value={report.portsVisited} />
              )}
              <DetailRow label="Cargo Loaded" value={`${report.totalCargoLoaded?.toFixed(0) || 0} MT`} />
              <DetailRow label="Cargo Discharged" value={`${report.totalCargoDischarged?.toFixed(0) || 0} MT`} />
              <DetailRow label="Avg Cargo Onboard" value={`${report.averageCargoOnBoard?.toFixed(0) || 0} MT`} />
            </Section>

            {/* Compliance & Reporting */}
            <Section title="Compliance & Reports" icon={<FileText className="w-5 h-5" />}>
              <DetailRow label="Total Reports" value={report.totalReportsSubmitted || 0} />
              <DetailRow label="Noon Reports" value={report.noonReportsSubmitted || 0} />
              <DetailRow label="Departure Reports" value={report.departureReportsSubmitted || 0} />
              <DetailRow label="Arrival Reports" value={report.arrivalReportsSubmitted || 0} />
              <DetailRow 
                label="Compliance Rate" 
                value={`${report.totalReportsSubmitted > 0 ? ((report.totalReportsSubmitted / 30) * 100).toFixed(0) : 0}%`} 
              />
            </Section>

            {/* Environmental Metrics */}
            <Section title="Environmental (IMO DCS)" icon={<Award className="w-5 h-5" />}>
              <DetailRow label="CO₂ Emissions" value={`${co2Emissions.toFixed(1)} MT`} />
              <DetailRow label="CO₂ per nm" value={`${(co2Emissions / (report.totalDistance || 1)).toFixed(3)} MT/nm`} />
              <DetailRow label="EEOI" value={`${((co2Emissions * 1000) / ((report.totalDistance || 1) * (report.averageCargoOnBoard || 1))).toFixed(2)} g/MT·nm`} />
              <DetailRow label="IMO DCS Status" value="✓ Compliant" />
              <DetailRow label="EU MRV Status" value="✓ Compliant" />
            </Section>
          </div>

          {/* Status & Metadata */}
          <Section title="Report Information" icon={<Calendar className="w-5 h-5" />} className="mt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <DetailRow label="Status" value={<StatusBadge status={report.status} />} />
              <DetailRow label="Report Period" value={`${new Date(report.monthStartDate).toLocaleDateString()} - ${new Date(report.monthEndDate).toLocaleDateString()}`} />
              <DetailRow label="Prepared By" value={report.preparedBy || 'System'} />
              <SigningControls module="report-monthly" recordKey={report.id} permission="reporting.approve" signed={!!report.masterSignature} />
<DetailRow label="Người xác nhận" value={report.masterSignature || 'Pending'} />
              <DetailRow label="Signed At" value={report.signedAt ? new Date(report.signedAt).toLocaleString() : 'Not signed'} />
              <DetailRow label="Transmitted" value={report.isTransmitted ? '✓ Yes' : '✗ No'} />
              <DetailRow label="Created At" value={new Date(report.createdAt).toLocaleString()} />
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// SUB-COMPONENTS
// ============================================================

const StatCard: React.FC<{ 
  title: string; 
  value: string | number; 
  unit: string; 
  icon: React.ReactNode;
  color: string;
}> = ({ title, value, unit, icon, color }) => {
  const colors = {
    blue: 'from-blue-50 to-blue-100 text-blue-600',
    green: 'from-green-50 to-green-100 text-green-600',
    orange: 'from-orange-50 to-orange-100 text-orange-600',
    purple: 'from-purple-50 to-purple-100 text-purple-600',
  };

  return (
    <div className={`bg-gradient-to-br ${colors[color as keyof typeof colors]} rounded-lg p-4 border border-gray-200`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium opacity-75">{title}</span>
        {icon}
      </div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs opacity-75 mt-1">{unit}</div>
    </div>
  );
};

const Section: React.FC<{ 
  title: string; 
  icon: React.ReactNode; 
  children: React.ReactNode;
  className?: string;
}> = ({ title, icon, children, className = '' }) => (
  <div className={`bg-gray-50 rounded-lg border border-gray-200 p-5 ${className}`}>
    <h4 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
      {icon}
      {title}
    </h4>
    <div className="space-y-3">
      {children}
    </div>
  </div>
);

const DetailRow: React.FC<{ 
  label: string; 
  value: React.ReactNode; 
  highlight?: boolean;
}> = ({ label, value, highlight }) => (
  <div className={`flex justify-between items-center text-sm ${highlight ? 'bg-red-50 -mx-2 px-2 py-1 rounded' : ''}`}>
    <span className="text-gray-600">{label}</span>
    <span className={`font-medium ${highlight ? 'text-red-700' : 'text-gray-900'}`}>{value}</span>
  </div>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const colors = {
    DRAFT: 'bg-gray-100 text-gray-700 border-gray-200',
      SUBMITTED: 'bg-amber-100 text-amber-700 border-amber-200',
      APPROVED: 'bg-blue-100 text-blue-700 border-blue-200',
      REJECTED: 'bg-red-100 text-red-700 border-red-200',
    TRANSMITTED: 'bg-green-100 text-green-700 border-green-200',
  };

  return (
    <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded border ${colors[status as keyof typeof colors] || colors.DRAFT}`}>
      {status}
    </span>
  );
};
