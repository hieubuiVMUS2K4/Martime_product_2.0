import React from 'react';

interface MaritimeInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const MaritimeInput: React.FC<MaritimeInputProps> = ({ label, error, className, ...props }) => {
  return (
    <div className="maritime-field flex flex-col gap-2">
      {label && (
        <label className="text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <input
        className={`
          w-full px-3 py-2 
          border border-gray-300 rounded-lg
          focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-50
          ${error ? 'border-red-500' : ''}
          ${className || ''}
        `}
        {...props}
      />
      {error && (
        <span className="text-red-600 text-sm">{error}</span>
      )}
    </div>
  );
};
