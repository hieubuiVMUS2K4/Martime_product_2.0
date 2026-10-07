import React, { useState } from 'react';
import { ListChecks, ShieldCheck } from 'lucide-react';
import { CertificateCatalogTab } from './CertificateCatalogTab';
import { RankRequirementsTab } from './RankRequirementsTab';
import '../Crew/CrewListPage.css';

type SubTab = 'catalog' | 'requirements';

const TABS: { id: SubTab; label: string; icon: React.ReactNode }[] = [
  { id: 'catalog', label: 'Danh mục loại chứng chỉ', icon: <ShieldCheck /> },
  { id: 'requirements', label: 'Chứng chỉ theo chức danh', icon: <ListChecks /> },
];

/**
 * Quản lý loại chứng chỉ ở bờ:
 *  - Danh mục: CRUD loại chứng chỉ (bờ làm chủ, phát xuống mọi tàu).
 *  - Chứng chỉ theo chức danh: chức danh nào cần những loại chứng chỉ nào.
 * Đối chiếu chứng chỉ của từng thuyền viên nằm ở Thuyền viên → Chứng chỉ thuyền viên.
 */
export const CertificateTypesTab: React.FC = () => {
  const [tab, setTab] = useState<SubTab>('catalog');

  return (
    <div>
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Loại chứng chỉ">
        {TABS.map(({ id, label, icon }) => {
          const on = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setTab(id)}
              className={`-mb-px inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-3.5 text-sm transition-colors [&>svg]:h-4 [&>svg]:w-4 ${
                on ? 'border-primary font-semibold text-primary' : 'border-transparent text-ink-muted hover:border-line hover:text-ink'
              }`}
            >
              {icon}
              {label}
            </button>
          );
        })}
      </div>

      {tab === 'catalog' && <CertificateCatalogTab />}
      {tab === 'requirements' && <RankRequirementsTab />}
    </div>
  );
};
