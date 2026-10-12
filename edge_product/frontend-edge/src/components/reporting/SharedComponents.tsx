/**
 * Reporting Module - Shared Components
 * Reusable UI components for maritime reporting
 */

import { FileText, Send, CheckCircle, XCircle, Clock } from 'lucide-react';
import type { ReportStatus } from '../../types/reporting.types';

// Status Badge Component
interface StatusBadgeProps {
  status: ReportStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const configs: Record<ReportStatus, { color: string; icon: React.ReactNode; label: string }> = {
    DRAFT: {
      color: 'bg-gray-100 text-gray-700 border-gray-300',
      icon: <FileText className="h-4 w-4" />,
      label: 'Draft'
    },
    SUBMITTED: {
      color: 'bg-yellow-100 text-yellow-700 border-yellow-300',
      icon: <Clock className="h-4 w-4" />,
      label: 'Submitted'
    },
    APPROVED: {
      color: 'bg-blue-100 text-blue-700 border-blue-300',
      icon: <CheckCircle className="h-4 w-4" />,
      label: 'Approved'
    },
    REJECTED: {
      color: 'bg-red-100 text-red-700 border-red-300',
      icon: <XCircle className="h-4 w-4" />,
      label: 'Rejected'
    },
    TRANSMITTED: {
      color: 'bg-green-100 text-green-700 border-green-300',
      icon: <Send className="h-4 w-4" />,
      label: 'Transmitted'
    }
  };

  const config = configs[status];

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${config.color}`}>
      {config.icon}
      {config.label}
    </span>
  );
}

// Loading Spinner
export function LoadingSpinner({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 'h-4 w-4',
    md: 'h-12 w-12',
    lg: 'h-16 w-16'
  };

  return (
    <div className="flex items-center justify-center py-12">
      <div className={`animate-spin rounded-full border-b-2 border-blue-600 ${sizes[size]}`}></div>
    </div>
  );
}

// Error Alert
interface ErrorAlertProps {
  title?: string;
  message: string;
  onDismiss?: () => void;
}

export function ErrorAlert({ title = 'Error', message, onDismiss }: ErrorAlertProps) {
  return (
    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-semibold">{title}</p>
          <p className="text-sm mt-1">{message}</p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-red-500 hover:text-red-700 ml-4"
          >
            <XCircle className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}

// Success Alert
interface SuccessAlertProps {
  message: string;
  onDismiss?: () => void;
}

export function SuccessAlert({ message, onDismiss }: SuccessAlertProps) {
  return (
    <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5" />
          <p className="font-semibold">{message}</p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-green-500 hover:text-green-700 ml-4"
          >
            <XCircle className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}

// Empty State
interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-12">
      {icon && <div className="flex justify-center mb-4">{icon}</div>}
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      {description && <p className="text-gray-600 mb-4">{description}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

// Confirm Modal
interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: 'danger' | 'warning' | 'info';
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'info'
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const colors = {
    danger: 'bg-red-600 hover:bg-red-700',
    warning: 'bg-orange-600 hover:bg-orange-700',
    info: 'bg-blue-600 hover:bg-blue-700'
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-xl w-full mx-4">
        <h3 className="text-lg font-semibold mb-3">{title}</h3>
        <p className="text-gray-700 mb-6">{message}</p>
        
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-white rounded-lg ${colors[variant]}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Page Header
interface PageHeaderProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ icon, title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
            {icon}
            {title}
          </h1>
          {subtitle && <p className="text-gray-600 mt-2">{subtitle}</p>}
        </div>
        {actions && <div className="flex gap-3">{actions}</div>}
      </div>
    </div>
  );
}

// Form Section
interface FormSectionProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}

export function FormSection({ title, icon, children }: FormSectionProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-6 border border-gray-200">
      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {children}
    </div>
  );
}

// Data Card
interface DataCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  valueClass?: string;
}

export function DataCard({ label, value, icon, valueClass = '' }: DataCardProps) {
  return (
    <div>
      <p className="text-sm text-gray-600">{label}</p>
      <p className={`font-semibold flex items-center gap-2 ${valueClass}`}>
        {icon}
        {value}
      </p>
    </div>
  );
}
