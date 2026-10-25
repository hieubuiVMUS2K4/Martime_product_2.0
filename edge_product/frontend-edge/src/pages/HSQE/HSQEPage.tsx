/**
 * HSQE Management Dashboard Page
 * ISM Code / SOLAS Compliance
 */

import { useState } from 'react';
import '@/styles/OperationalTheme.css';
import { FileText, AlertOctagon, Activity } from 'lucide-react';
import { DocumentControl } from './components/DocumentControl';
import { IncidentManagement } from './components/IncidentManagement';
import { RiskWorkPermits } from './components/RiskWorkPermits';

type TabType = 'documents' | 'incidents' | 'permits';

export function HSQEPage() {
  const [activeTab, setActiveTab] = useState<TabType>('documents');

  return (
    <div className="operations-page flex h-full min-h-0 flex-col bg-white dark:bg-slate-800 transition-colors duration-200">
      <div className="operations-toolbar bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
        <div className="flex w-full flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <h1 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Quản lý tài liệu và tuân thủ
          </h1>

          <div className="flex w-full flex-wrap items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-800 sm:w-auto">
            <button
              onClick={() => setActiveTab('documents')}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                activeTab === 'documents'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-slate-200'
              }`}
            >
              <FileText className="h-3.5 w-3.5" />
              Kiểm soát Tài liệu
            </button>
            <button
              onClick={() => setActiveTab('incidents')}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                activeTab === 'incidents'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-slate-200'
              }`}
            >
              <AlertOctagon className="h-3.5 w-3.5" />
              Sự cố & CAPA
            </button>
            <button
              onClick={() => setActiveTab('permits')}
              className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-semibold transition-colors duration-150 ${
                activeTab === 'permits'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700/50 dark:hover:text-slate-200'
              }`}
            >
              <Activity className="h-3.5 w-3.5" />
              Đánh giá Rủi ro & Giấy phép
            </button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 p-0">
        <div className="min-h-0 flex-1 overflow-auto transition-all duration-300">
          {activeTab === 'documents' && <DocumentControl />}
          {activeTab === 'incidents' && <IncidentManagement />}
          {activeTab === 'permits' && <RiskWorkPermits />}
        </div>
      </div>
    </div>
  );
}
