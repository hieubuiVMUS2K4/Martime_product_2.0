/**
 * Weekly Report Details Modal
 * Full details view of a weekly performance report
 */

import React, { useEffect } from 'react';
import { 
  X, Calendar, TrendingUp, Fuel, Anchor, Ship, Settings, Edit2, Trash2
} from 'lucide-react';
import { WeeklyReportDto } from '../../types/aggregate-reports.types';

interface WeeklyReportModalProps {
  report: WeeklyReportDto;
  onClose: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

export const WeeklyReportModal: React.FC<WeeklyReportModalProps> = ({ report, onClose, onEdit, onDelete }) => {
  const totalFuel = (report.totalFuelOilConsumed || 0) + (report.totalDieselOilConsumed || 0);

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
        <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-5">
          <div className="flex justify-between items-start mb-3">
            <div>
              <h2 className="text-2xl font-bold">{report.reportNumber}</h2>
              <p className="text-green-100 mt-1">
                Week {report.weekNumber}, {report.year} • 
                {new Date(report.weekStartDate).toLocaleDateString()} - {new Date(report.weekEndDate).toLocaleDateString()}
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
              title="Port Calls" 
              value={report.portCalls || 0} 
              unit="ports"
              icon={<Ship className="w-6 h-6" />}
              color="purple"
            />
          </div>

          {/* Detailed Sections */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Performance Section */}
            <Section title="Performance Metrics" icon={<TrendingUp className="w-5 h-5" />}>
              <DetailRow label="Total Steaming Hours" value={`${report.totalSteamingHours || 0} hrs`} />
              <DetailRow label="Total Port Hours" value={`${report.totalPortHours || 0} hrs`} />
              <DetailRow label="Average Speed" value={`${report.averageSpeed?.toFixed(2) || 0} knots`} />
              <DetailRow label="Distance Covered" value={`${report.totalDistance?.toFixed(1) || 0} nm`} />
            </Section>

            {/* Fuel Section */}
            <Section title="Fuel Consumption" icon={<Fuel className="w-5 h-5" />}>
              <DetailRow label="Fuel Oil (HFO)" value={`${report.totalFuelOilConsumed?.toFixed(2) || 0} MT`} />
              <DetailRow label="Diesel Oil (MDO)" value={`${report.totalDieselOilConsumed?.toFixed(2) || 0} MT`} />
              <DetailRow label="Average Fuel/Day" value={`${report.averageFuelPerDay?.toFixed(2) || 0} MT`} />
              <DetailRow label="Fuel Efficiency" value={`${report.fuelEfficiency?.toFixed(2) || 0} nm/MT`} />
              <DetailRow label="FO ROB" value={`${report.fuelOilROB?.toFixed(1) || 0} MT`} />
              <DetailRow label="DO ROB" value={`${report.dieselOilROB?.toFixed(1) || 0} MT`} />
            </Section>

            {/* Maintenance Section */}
            <Section title="Maintenance & Safety" icon={<Settings className="w-5 h-5" />}>
              <DetailRow label="Tasks Completed" value={report.totalMaintenanceTasksCompleted || 0} />
              <DetailRow label="Maintenance Hours" value={`${report.totalMaintenanceHours?.toFixed(1) || 0} hrs`} />
              <DetailRow 
                label="Critical Issues" 
                value={report.criticalIssues || 0} 
                highlight={report.criticalIssues > 0} 
              />
              <DetailRow 
                label="Safety Incidents" 
                value={report.safetyIncidents || 0} 
                highlight={report.safetyIncidents > 0} 
              />
            </Section>

            {/* Operations Section */}
            <Section title="Operations" icon={<Ship className="w-5 h-5" />}>
              <DetailRow label="Port Calls" value={report.portCalls || 0} />
              <DetailRow label="Cargo Loaded" value={`${report.totalCargoLoaded?.toFixed(0) || 0} MT`} />
              <DetailRow label="Cargo Discharged" value={`${report.totalCargoDischarged?.toFixed(0) || 0} MT`} />
            </Section>
          </div>

          {/* Status & Metadata */}
          <Section title="Report Information" icon={<Calendar className="w-5 h-5" />} className="mt-6">
            <DetailRow label="Status" value={<StatusBadge status={report.status} />} />
            <DetailRow label="Prepared By" value={report.preparedBy || 'System'} />
            <DetailRow label="Master Signature" value={report.masterSignature || 'Pending'} />
            <DetailRow label="Signed At" value={report.signedAt ? new Date(report.signedAt).toLocaleString() : 'Not signed'} />
            <DetailRow label="Transmitted" value={report.isTransmitted ? '✓ Yes' : '✗ No'} />
            <DetailRow label="Created At" value={new Date(report.createdAt).toLocaleString()} />
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
