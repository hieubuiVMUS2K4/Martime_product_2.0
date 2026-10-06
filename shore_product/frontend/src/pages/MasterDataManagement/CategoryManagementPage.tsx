import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { CrewListPage } from './Crew/CrewListPage';
import { CertificateTypesTab } from './CertificateTypes/CertificateTypesTab';
import { RankPage } from './Ranks/RankPage';
import { CountryPage } from './Countries/CountryPage';
import { PortPage } from './Ports/PortPage';
import './CategoryManagementPage.css';

type TabId = 'crew' | 'certificate-types' | 'ranks' | 'countries' | 'ports';

const VALID_TABS: TabId[] = ['crew', 'certificate-types', 'ranks', 'countries', 'ports'];

export const CategoryManagementPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TabId | null;
  const activeTab: TabId = tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'crew';

  return (
    <div className="cat-page">
      {/* Content */}
      <div className="cat-content">
        {activeTab === 'crew' && <CrewListPage />}
        {activeTab === 'certificate-types' && <CertificateTypesTab />}
        {activeTab === 'ranks' && <RankPage />}
        {activeTab === 'countries' && <CountryPage />}
        {activeTab === 'ports' && <PortPage />}
      </div>
    </div>
  );
};
