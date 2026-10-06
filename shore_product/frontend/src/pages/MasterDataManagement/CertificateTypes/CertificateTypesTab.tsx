import React, { useState } from 'react';
import { ShieldCheck, Users } from 'lucide-react';
import { CertificateCatalogTab } from './CertificateCatalogTab';
import { RankComplianceTab } from './RankComplianceTab';
import { RankRequirementsTab } from './RankRequirementsTab';
import '../Crew/CrewListPage.css';

type SubTab = 'catalog' | 'requirements' | 'compliance';

const TABS: { id: SubTab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'catalog', label: 'Danh mục loại chứng chỉ', icon: ShieldCheck },
  { id: 'requirements', label: 'Chứng chỉ theo chức danh', icon: ShieldCheck },
  { id: 'compliance', label: 'Tuân thủ theo chức danh', icon: Users },
];

/**
 * Quản lý loại chứng chỉ ở bờ, hai góc nhìn:
 *  - Danh mục: CRUD loại chứng chỉ (bờ làm chủ, phát xuống mọi tàu).
 *  - Tuân thủ theo chức danh: mỗi chức danh một bảng thuyền viên × chứng chỉ bắt buộc,
 *    hiện TOÀN BỘ và tô sáng chỗ hụt. Loại chứng chỉ chỉ đóng vai trò bộ lọc.
 */
export const CertificateTypesTab: React.FC = () => {
  const [tab, setTab] = useState<SubTab>('catalog');

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, borderBottom: '2px solid #e2eaf2', marginBottom: 12 }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', fontSize: 13, fontWeight: 600,
              border: 'none', background: 'none', cursor: 'pointer', marginBottom: -2,
              borderBottom: tab === id ? '2px solid #0b2545' : '2px solid transparent',
              color: tab === id ? '#0b2545' : '#6b7c8f',
            }}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'catalog' && <CertificateCatalogTab />}
      {tab === 'requirements' && <RankRequirementsTab />}
      {tab === 'compliance' && <RankComplianceTab />}
    </div>
  );
};
