import React from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { CertificateTypesTab } from './CertificateTypes/CertificateTypesTab';
import { RankPage } from './Ranks/RankPage';
import { CountryPage } from './Countries/CountryPage';
import { PortPage } from './Ports/PortPage';
import './CategoryManagementPage.css';

type TabId = 'certificate-types' | 'ranks' | 'countries' | 'ports';

const VALID_TABS: TabId[] = ['certificate-types', 'ranks', 'countries', 'ports'];

export const CategoryManagementPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TabId | null;
  const activeTab: TabId = tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'certificate-types';

  // Thuyền viên đã chuyển sang trang Quản lý thuyền viên (/crew).
  if ((tabParam as string | null) === 'crew') return <Navigate to="/crew" replace />;

  return (
    <div className="cat-page">
      {/* Content */}
      <div className="cat-content">
        {activeTab === 'certificate-types' && <CertificateTypesTab />}
        {activeTab === 'ranks' && <RankPage />}
        {activeTab === 'countries' && <CountryPage />}
        {activeTab === 'ports' && <PortPage />}
      </div>
    </div>
  );
};
