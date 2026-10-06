import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Ship } from 'lucide-react';
import { ENV } from '../../config/env';
import { crewApi } from '../../services/crew.service';
import { AssignCrewToVesselModal } from './AssignCrewToVesselModal';
import { SignOffCrewModal } from './SignOffCrewModal';
import '../../pages/MasterDataManagement/Crew/CrewListPage.css';
import { toast } from 'sonner';
import { useConfirm } from '@/components/common/ConfirmDialog';

interface VesselCrewTabProps {
  vesselId: string;
  vesselName: string;
}

interface CrewMember {
  id: string;
  crewId: string;
  fullName: string;
  rank?: { name: string; rankName?: string };
  countryName?: string;
  isOnboard: boolean;
  onboardStatus?: string;
  joinDate?: string;
  embarkDate?: string;
  disembarkDate?: string;
  contractEnd?: string;
  edgeChanges?: string;
  edgeChangesViewed?: boolean;
  reviewNotes?: string;
}

const BASE = ENV.API_BASE_URL;

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export function VesselCrewTab({ vesselId, vesselName }: VesselCrewTabProps) {
  const ask = useConfirm();
  const navigate = useNavigate();
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCrew, setSelectedCrew] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; crew: CrewMember } | null>(null);

  // Modal gán thuyền viên lên tàu (chuyển từ tab Danh mục → Thuyền viên sang đây)
  const [assignOpen, setAssignOpen] = useState(false);
  /** Thuyền viên đang được chọn để cho xuống tàu (null = modal đóng) */
  const [signOffTarget, setSignOffTarget] = useState<CrewMember | null>(null);
  
  // Sorting state
  const [sortType, setSortType] = useState<{ col: string; dir: 'asc' | 'desc' } | null>({ col: 'crewId', dir: 'asc' });
  const [sortMenu, setSortMenu] = useState<string | null>(null);

  // Search / filter state
  const [filterCrewId, setFilterCrewId] = useState('');
  const [filterFullName, setFilterFullName] = useState('');
  const [filterRank, setFilterRank] = useState('');
  const [filterNationality, setFilterNationality] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  // Count of crew with unviewed edge changes
  const unviewedChangesCount = crew.filter(c => c.edgeChanges && !c.edgeChangesViewed).length;

  useEffect(() => {
    loadCrew();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vesselId]);

  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const loadCrew = async () => {
    try {
      setLoading(true);
      const response = await apiFetch<{ data: CrewMember[] }>(
        `${BASE}/crew?shipId=${vesselId}&pageSize=100`
      );
      setCrew(response.data || []);
    } catch (error) {
      console.error('Failed to load crew:', error);
    } finally {
      setLoading(false);
    }
  };

  // All crew assigned to this vessel
  let filteredCrew = [...crew];

  // Apply column filters
  if (filterCrewId)     filteredCrew = filteredCrew.filter(c => (c.crewId || '').toLowerCase().includes(filterCrewId.toLowerCase()));
  if (filterFullName)   filteredCrew = filteredCrew.filter(c => c.fullName.toLowerCase().includes(filterFullName.toLowerCase()));
  if (filterRank)       filteredCrew = filteredCrew.filter(c => (c.rank?.rankName || c.rank?.name || '').toLowerCase().includes(filterRank.toLowerCase()));
  if (filterNationality) filteredCrew = filteredCrew.filter(c => (c.countryName || '').toLowerCase().includes(filterNationality.toLowerCase()));

  // Apply sorting
  const applySorting = (crews: CrewMember[]) => {
    if (!sortType) return crews;
    const sorted = [...crews];
    switch (sortType.col) {
      case 'crewId':
        sorted.sort((a, b) => sortType.dir === 'asc'
          ? a.crewId.localeCompare(b.crewId)
          : b.crewId.localeCompare(a.crewId));
        break;
      case 'fullName':
        sorted.sort((a, b) => sortType.dir === 'asc' 
          ? a.fullName.localeCompare(b.fullName) 
          : b.fullName.localeCompare(a.fullName));
        break;
      case 'position':
      case 'rank':
        sorted.sort((a, b) => {
          const aRank = a.rank?.name || a.rank?.rankName || '';
          const bRank = b.rank?.name || b.rank?.rankName || '';
          return sortType.dir === 'asc' ? aRank.localeCompare(bRank) : bRank.localeCompare(aRank);
        });
        break;
      case 'nationality':
        sorted.sort((a, b) => {
          const aNat = a.countryName || '';
          const bNat = b.countryName || '';
          return sortType.dir === 'asc' ? aNat.localeCompare(bNat) : bNat.localeCompare(aNat);
        });
        break;
      case 'embarkDate':
        sorted.sort((a, b) => {
          const aDate = a.embarkDate ? new Date(a.embarkDate).getTime() : 0;
          const bDate = b.embarkDate ? new Date(b.embarkDate).getTime() : 0;
          return sortType.dir === 'asc' ? aDate - bDate : bDate - aDate;
        });
        break;
    }
    return sorted;
  };

  filteredCrew = applySorting(filteredCrew);

  // Pagination
  const totalPages = Math.ceil(filteredCrew.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedCrews = filteredCrew.slice(startIndex, endIndex);

  const handleContextMenu = (e: React.MouseEvent, crew: CrewMember) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, crew });
    setSelectedCrew(crew.id);
  };

  const handleDelete = async (crew: CrewMember) => {
    if (!await ask(`Xóa thuyền viên "${crew.fullName}"?\nHành động này không thể hoàn tác.`)) return;
    try {
      await crewApi.delete(crew.id);
      await loadCrew();
    } catch {
      toast.error('Xóa thất bại. Vui lòng thử lại.');
    }
  };

  const handleViewCrew = (crewMember: CrewMember) => {
    // Navigate directly — do NOT auto-mark as viewed here.
    // User must click "✓ Đã xem" on the detail page to acknowledge changes.
    navigate(`/vessels/${vesselId}/crew/${crewMember.id}`);
  };

  // Sort Dropdown Component
  function SortDropdown({ col, options }: {
    col: string;
    options: Array<{ label: string; dir: 'asc' | 'desc' }>;
  }) {
    return (
      <div className="absolute top-1/2 right-2 -translate-y-1/2 z-10">
        <button
          className="text-gray-400 hover:text-blue-900 text-xs p-1 leading-none"
          onClick={e => { e.stopPropagation(); setSortMenu(sortMenu === col ? null : col); }}
        >
          ▼
        </button>
        {sortMenu === col && (
          <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded shadow-lg z-50">
            {options.map(opt => (
              <button
                key={opt.label}
                className={`block w-full text-left px-3 py-2 text-sm hover:bg-slate-100 ${
                  sortType?.col === col && sortType?.dir === opt.dir 
                    ? 'text-primary font-bold' 
                    : 'text-gray-700'
                }`}
                onClick={e => { 
                  e.stopPropagation(); 
                  setSortType({ col, dir: opt.dir }); 
                  setSortMenu(null);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 size={32} className="vd-spin mr-3" />
        <span className="text-sm text-gray-600">Đang tải danh sách thuyền viên...</span>
      </div>
    );
  }

  return (
    <div className="cl-page relative">
      {/* Toolbar */}
      <div className="cl-header">
        <div className="cl-header-left">
          <h1 className="cl-title">Thuyền viên trên tàu</h1>
          <span className="cl-count-badge">{crew.length}</span>
        </div>
        <div className="cl-header-right">
          <button className="cl-btn cl-btn--primary" onClick={() => setAssignOpen(true)}>
            <Ship size={13} /> Gán thuyền viên lên tàu
          </button>
        </div>
      </div>

      {/* Edge Changes Notification Banner */}
      {unviewedChangesCount > 0 && (
        <div style={{
          background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 8, padding: '10px 16px',
          marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8
        }}>
          <span style={{
            background: '#ef4444', color: '#fff', borderRadius: '50%', width: 22, height: 22,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700
          }}>{unviewedChangesCount}</span>
          <span style={{ fontSize: 13, color: '#92400e', fontWeight: 600 }}>
            {unviewedChangesCount} thuyền viên đã được chỉnh sửa bởi tàu. Nhấn vào tên để xem thay đổi.
          </span>
        </div>
      )}

      {/* Table */}
      {filteredCrew.length > 0 ? (
        <>
          <div className="cl-table-card">
            <table className="cl-table">
                <thead>
                  {/* Label row */}
                  <tr className="cl-tr-labels">
                    <th style={{ width: '10%', position: 'relative' }}>Mã TV
                      <SortDropdown col="crewId" options={[{ label: 'A → Z', dir: 'asc' }, { label: 'Z → A', dir: 'desc' }]} />
                    </th>
                    <th style={{ width: '22%', position: 'relative' }}>Họ và tên
                      <SortDropdown col="fullName" options={[{ label: 'A → Z', dir: 'asc' }, { label: 'Z → A', dir: 'desc' }]} />
                    </th>
                    <th style={{ width: '20%', position: 'relative' }}>Chức danh
                      <SortDropdown col="position" options={[{ label: 'A → Z', dir: 'asc' }, { label: 'Z → A', dir: 'desc' }]} />
                    </th>
                    <th style={{ width: '14%', position: 'relative' }}>Quốc tịch
                      <SortDropdown col="nationality" options={[{ label: 'A → Z', dir: 'asc' }, { label: 'Z → A', dir: 'desc' }]} />
                    </th>
                    <th style={{ width: '16%', position: 'relative' }}>Ngày lên tàu
                      <SortDropdown col="embarkDate" options={[{ label: 'Mới nhất', dir: 'desc' }, { label: 'Cũ nhất', dir: 'asc' }]} />
                    </th>
                    <th style={{ width: '13%', borderRight: 'none' }}>Trạng thái</th>
                  </tr>
                  {/* Filter row */}
                  <tr className="cl-tr-filters">
                    <th>
                      <div className="cl-search-wrap">
                        <input className="cl-cf" placeholder="Tìm kiếm" value={filterCrewId} onChange={e => { setFilterCrewId(e.target.value); setCurrentPage(1); }} />
                      </div>
                    </th>
                    <th>
                      <div className="cl-search-wrap">
                        <input className="cl-cf" placeholder="Tìm kiếm" value={filterFullName} onChange={e => { setFilterFullName(e.target.value); setCurrentPage(1); }} />
                      </div>
                    </th>
                    <th>
                      <div className="cl-search-wrap">
                        <input className="cl-cf" placeholder="Tìm kiếm" value={filterRank} onChange={e => { setFilterRank(e.target.value); setCurrentPage(1); }} />
                      </div>
                    </th>
                    <th>
                      <div className="cl-search-wrap">
                        <input className="cl-cf" placeholder="Tìm kiếm" value={filterNationality} onChange={e => { setFilterNationality(e.target.value); setCurrentPage(1); }} />
                      </div>
                    </th>
                    <th></th>
                    <th style={{ borderRight: 'none' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCrews.map((crewMember, idx) => (
                    <tr
                      key={crewMember.id}
                      onContextMenu={(e) => handleContextMenu(e, crewMember)}
                      className={`cl-tr${idx % 2 === 1 ? ' cl-tr--alt' : ''}${selectedCrew === crewMember.id ? ' cl-tr--selected' : ''}`}
                    >
                      <td >
                        <span style={{ fontFamily: 'monospace', fontSize: '12px', color: 'var(--moc-muted)' }}>{crewMember.crewId}</span>
                      </td>
                      <td >
                        <span style={{ fontWeight: 600, color: 'var(--moc-blue)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                          onClick={() => handleViewCrew(crewMember)}>
                          {crewMember.fullName}
                          {crewMember.edgeChanges && !crewMember.edgeChangesViewed && (
                            <span title="Đã chỉnh sửa bởi tàu — nhấn để xem" style={{
                              background: '#ef4444', borderRadius: '50%', width: 8, height: 8,
                              display: 'inline-block', flexShrink: 0, animation: 'pulse 2s infinite'
                            }} />
                          )}
                        </span>
                      </td>
                      <td >
                        {crewMember.rank?.rankName || crewMember.rank?.name || '-'}
                      </td>
                      <td style={{ color: 'var(--moc-muted)' }}>
                        {crewMember.countryName || 'N/A'}
                      </td>
                      <td style={{ color: 'var(--moc-muted)' }}>
                        {crewMember.embarkDate
                          ? new Date(crewMember.embarkDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                          : '-'}
                      </td>
                      <td>
                        {crewMember.isOnboard ? (
                          <span style={{ background: '#dcfce7', color: '#16a34a', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                            • Trên tàu
                          </span>
                        ) : crewMember.onboardStatus === 'PendingReview' ? (
                          <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                            • Đang duyệt
                          </span>
                        ) : crewMember.onboardStatus === 'OnHold' ? (
                          <span style={{ background: '#fed7aa', color: '#c2410c', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                            • Tạm giữ
                          </span>
                        ) : crewMember.onboardStatus === 'Rejected' ? (
                          <span style={{ background: '#fee2e2', color: '#991b1b', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                            • Từ chối
                          </span>
                        ) : (
                          <span style={{ background: '#f1f5f9', color: '#64748b', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                            Trên bờ
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
          </div>

          {/* Pagination */}
            {totalPages > 1 && (
              <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200">
                <div className="text-sm text-gray-600">
                  Hiển thị {startIndex + 1} - {Math.min(endIndex, filteredCrew.length)} / {filteredCrew.length}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ← Trước
                  </button>
                  <span className="text-sm text-gray-600">
                    Trang {currentPage} / {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Tiếp →
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="px-4 py-12 text-center text-gray-500">
            <p>Không có thuyền viên nào trên tàu này</p>
          </div>
        )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-white border border-gray-200 rounded shadow-lg z-50 min-w-[160px]"
          style={{ 
            left: `${contextMenu.x}px`, 
            top: `${contextMenu.y}px`
          }}
        >
          <button
            onClick={() => {
              handleViewCrew(contextMenu.crew);
              setContextMenu(null);
            }}
            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-slate-100"
          >
            Xem chi tiết
          </button>
          <div className="border-t border-gray-100" />
          <button
            onClick={() => {
              const target = contextMenu.crew;
              setContextMenu(null);
              setSignOffTarget(target);
            }}
            className="block w-full text-left px-4 py-2 text-sm text-rose-600 hover:bg-rose-50"
          >
            Cho xuống tàu
          </button>
          <div className="border-t border-gray-100" />
          <button
            onClick={() => {
              const target = contextMenu.crew;
              setContextMenu(null);
              setSelectedCrew(null);
              handleDelete(target);
            }}
            className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            Xóa
          </button>
        </div>
      )}

      {/* Modal gán thuyền viên lên tàu */}
      {assignOpen && (
        <AssignCrewToVesselModal
          vesselId={vesselId}
          vesselName={vesselName}
          onClose={() => setAssignOpen(false)}
          onAssigned={loadCrew}
        />
      )}

      {/* Modal cho xuống tàu — đóng kỳ phục vụ trong sổ thuyền viên */}
      {signOffTarget && (
        <SignOffCrewModal
          crew={signOffTarget}
          vesselName={vesselName}
          onClose={() => setSignOffTarget(null)}
          onDone={loadCrew}
        />
      )}
    </div>
  );
}


