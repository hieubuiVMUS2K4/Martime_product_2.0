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
      {/* Tab bar (kiểu CrewPage của edge, màu theo theme shore) */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e5e7eb', padding: '0 4px' }}>
        {TABS.map(t => {
          const active = activeTab === t.key;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px',
                fontSize: 13, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer',
                color: active ? 'var(--moc-blue)' : '#64748b',
                borderBottom: active ? '2px solid var(--moc-blue)' : '2px solid transparent',
                marginBottom: -1, transition: 'color 0.15s',
              }}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'categories' ? <MaterialCategoryTab /> : <MaterialItemsTab />}
    </div>
  );
};
