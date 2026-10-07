import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LogOut, ShieldCheck, Users } from 'lucide-react';
import { PageHeader } from '../../components/common';
import { crewApi } from '../../services/crew.service';
import { CrewListPage } from '../MasterDataManagement/Crew/CrewListPage';
import { PendingSignOffsPage } from './PendingSignOffsPage';
import { RankComplianceTab } from './RankComplianceTab';

type TabId = 'profiles' | 'sign-off' | 'certificates';

const TABS: { id: TabId; label: string; icon: React.ReactNode; description: string }[] = [
  { id: 'profiles', label: 'Hồ sơ thuyền viên', icon: <Users />, description: 'Hồ sơ thuyền viên toàn đội tàu. Bấm vào một dòng để mở hồ sơ chi tiết.' },
  { id: 'sign-off', label: 'Phê duyệt rời tàu', icon: <LogOut />, description: 'Đề nghị cho thuyền viên rời tàu do tàu gửi lên. Thuyền viên vẫn phục vụ bình thường cho đến khi bờ phê duyệt.' },
  { id: 'certificates', label: 'Chứng chỉ thuyền viên', icon: <ShieldCheck />, description: 'Đối chiếu chứng chỉ của từng thuyền viên với yêu cầu theo chức danh: còn hiệu lực, sắp hết hạn, hết hạn hay còn thiếu.' },
];

/**
 * Quản lý thuyền viên: hồ sơ, phê duyệt rời tàu, chứng chỉ thuyền viên trên cùng một trang, chọn bằng `?tab=`.
 * Chi tiết một thuyền viên vẫn ở /crew/:id.
 */
export const CrewHubPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab: TabId = TABS.some(t => t.id === tabParam) ? (tabParam as TabId) : 'profiles';
  const current = TABS.find(t => t.id === activeTab)!;

  // Số đề nghị chờ duyệt hiện trên tab, kể cả khi đang ở tab khác.
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const loadPendingCount = useCallback(() => {
    crewApi.getPendingSignOffs().then(items => setPendingCount(items.length)).catch(() => setPendingCount(null));
  }, []);
  useEffect(() => { loadPendingCount(); }, [loadPendingCount]);

  const selectTab = (id: TabId) => setSearchParams(id === 'profiles' ? {} : { tab: id });

  return (
    <div className="px-6 py-5">
      <PageHeader icon={<Users />} title="Quản lý thuyền viên" description={current.description} />

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-line" role="tablist" aria-label="Quản lý thuyền viên">
        {TABS.map(tab => {
          const on = tab.id === activeTab;
          const badge = tab.id === 'sign-off' ? pendingCount : null;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => selectTab(tab.id)}
              className={`-mb-px inline-flex h-10 shrink-0 items-center gap-2 border-b-2 px-3.5 text-sm transition-colors [&>svg]:h-4 [&>svg]:w-4 ${
                on ? 'border-primary font-semibold text-primary' : 'border-transparent text-ink-muted hover:border-line hover:text-ink'
              }`}
            >
              {tab.icon}
              {tab.label}
              {!!badge && (
                <span className="min-w-[20px] rounded-full bg-danger px-1.5 text-center text-xs font-bold leading-5 text-white tabular-nums">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {activeTab === 'profiles' && <CrewListPage />}
      {activeTab === 'sign-off' && <PendingSignOffsPage onCountChange={setPendingCount} />}
      {activeTab === 'certificates' && <RankComplianceTab />}
    </div>
  );
};
