import React from 'react';
import '@/styles/OperationalTheme.css';

interface LogbookGridProps {
  children: React.ReactNode;
  title?: string;
  actions?: React.ReactNode;
}

export const LogbookGrid: React.FC<LogbookGridProps> = ({ children, title, actions }) => {
  return (
    <div className="operations-page operations-surface bg-white dark:bg-gray-800 min-h-full w-full">
      <div className="operations-toolbar">
        {title && (
          <h1 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {title}
          </h1>
        )}
        <div className="operations-actions">
          {actions}
        </div>
      </div>
      <div className="grid gap-4 p-4 min-w-0">
        {children}
      </div>
    </div>
  );
};
