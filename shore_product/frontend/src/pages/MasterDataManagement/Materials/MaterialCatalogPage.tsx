import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { Package, FolderTree } from 'lucide-react';
import { MaterialItemsTab } from './MaterialItemsTab';
import { MaterialCategoryTab } from './MaterialCategoryTab';
import '../Crew/CrewListPage.css';
import '../CertificateTypes/CertificateFormModal.css';

type TabKey = 'categories' | 'items';

const TABS: { key: TabKey; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { key: 'categories', label: 'Loại vật tư', icon: FolderTree },
  { key: 'items', label: 'Vật tư', icon: Package },
];

/* ═══════════════ Danh mục vật tư — shell 2 tab ═══════════════ */
export const MaterialCatalogPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: TabKey = searchParams.get('materialTab') === 'categories' ? 'categories' : 'items';
  const setActiveTab = (tab: TabKey) => {
    const next = new URLSearchParams(searchParams);
    next.set('materialTab', tab);
    next.delete('action');
    setSearchParams(next);
  };

  return (
    <div className="cl-page" style={{ padding: 0, minHeight: 'auto' }}>
      {/* Tab bar: Loại vật tư / Vật tư */}
      <div className="flex gap-1 border-b border-line px-1">
        {TABS.map(t => {
          const active = activeTab === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3.5 py-2.5 text-[0.9375rem] transition-colors ${
                active ? 'border-primary font-semibold text-primary' : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              <Icon size={16} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'categories' ? <MaterialCategoryTab /> : <MaterialItemsTab />}
    </div>
  );
};
