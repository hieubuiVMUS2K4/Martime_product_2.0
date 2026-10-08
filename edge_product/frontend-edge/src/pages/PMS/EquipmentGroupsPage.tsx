/**
 * Equipment Groups Management - Full CRUD
 * Manage equipment groups with Department and PIC assignments
 */

import { useState, useEffect, useMemo } from 'react';
import { Package, Plus, Edit2, Trash2, X, Search, ChevronLeft, ChevronRight, MoveRight } from 'lucide-react';
import { equipmentGroupService } from '@/services/equipment-group.service';
import { equipmentAssetService } from '@/services/equipment-asset.service';
import { maritimeService } from '@/services/maritime.service';
import { ViewGroupModal } from '@/components/pms/ViewGroupModal';
import { useTranslationSafe } from '@/contexts/I18nContext';
import type { EquipmentGroup } from '@/types/pms.types';
import { toast } from 'sonner';

interface GroupFormData {
  groupCode: string;
  groupName: string;
  category: string;
  department: string;
  picRole: string;
  picCrewId: string;
  description: string;
  isActive: boolean;
}

const DEPARTMENTS_BASE = [
  { value: 'ENGINE', labelKey: 'deptEngine', color: 'bg-red-100 text-red-800' },
  { value: 'DECK', labelKey: 'deptDeck', color: 'bg-blue-100 text-blue-800' },
  { value: 'NAVIGATION', labelKey: 'deptNavigation', color: 'bg-cyan-100 text-cyan-800' },
  { value: 'ELECTRICAL', labelKey: 'deptElectrical', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'MANAGEMENT', labelKey: 'deptManagement', color: 'bg-gray-100 text-gray-800' },
  { value: 'CATERING', labelKey: 'deptCatering', color: 'bg-green-100 text-green-800' },
];

const PIC_ROLES_BASE = [
  { value: 'MASTER', labelKey: 'roleMaster', departments: ['MANAGEMENT', 'DECK', 'NAVIGATION'] },
  { value: 'C/E', labelKey: 'roleCE', departments: ['ENGINE', 'MANAGEMENT'] },
  { value: 'C/O', labelKey: 'roleCO', departments: ['DECK', 'NAVIGATION', 'MANAGEMENT'] },
  { value: '2/E', labelKey: 'role2E', departments: ['ENGINE'] },
  { value: '3/E', labelKey: 'role3E', departments: ['ENGINE'] },
  { value: '4/E', labelKey: 'role4E', departments: ['ENGINE'] },
  { value: 'E/O', labelKey: 'roleEO', departments: ['ENGINE'] },
  { value: '2/O', labelKey: 'role2O', departments: ['DECK', 'NAVIGATION'] },
  { value: '3/O', labelKey: 'role3O', departments: ['DECK', 'NAVIGATION'] },
  { value: 'BOSUN', labelKey: 'roleBosun', departments: ['DECK'] },
  { value: 'FITTER', labelKey: 'roleFitter', departments: ['ENGINE'] },
  { value: 'OILER', labelKey: 'roleOiler', departments: ['ENGINE'] },
  { value: 'AB', labelKey: 'roleAB', departments: ['DECK'] },
  { value: 'OS', labelKey: 'roleOS', departments: ['DECK'] },
  { value: 'COOK', labelKey: 'roleCook', departments: ['CATERING'] },
];

const CATEGORIES = [
  'ENGINE',
  'GENERATOR',
  'PUMP',
  'COMPRESSOR',
  'BOILER',
  'DECK_MACHINERY',
  'SAFETY_EQUIPMENT',
  'NAVIGATION_EQUIPMENT',
  'FIRE_FIGHTING',
  'LIFE_SAVING',
  'ELECTRICAL',
  'HVAC',
  'OTHER'
];

export default function EquipmentGroupsPage() {
  const { t } = useTranslationSafe();

  const DEPARTMENTS = useMemo(() => DEPARTMENTS_BASE.map(d => ({ ...d, label: t(`pms.groups.${d.labelKey}`) })), [t]);
  const PIC_ROLES = useMemo(() => PIC_ROLES_BASE.map(r => ({ ...r, label: t(`pms.groups.${r.labelKey}`) })), [t]);

  const [groups, setGroups] = useState<EquipmentGroup[]>([]);
  const [crewList, setCrewList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<EquipmentGroup | null>(null);
  const [viewingGroup, setViewingGroup] = useState<EquipmentGroup | null>(null);
  
  // Assets management states
  const [allAssets, setAllAssets] = useState<any[]>([]);
  const [groupAssets, setGroupAssets] = useState<any[]>([]);
  const [availableAssets, setAvailableAssets] = useState<any[]>([]);
  const [selectedAvailable, setSelectedAvailable] = useState<string[]>([]);
  const [selectedAssigned, setSelectedAssigned] = useState<string[]>([]);
  const [assetSearchAvailable, setAssetSearchAvailable] = useState('');
  const [assetSearchAssigned, setAssetSearchAssigned] = useState('');
  const [assetCategoryFilterAvailable, setAssetCategoryFilterAvailable] = useState('');
  const [assetCategoryFilterAssigned, setAssetCategoryFilterAssigned] = useState('');
  
  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  const [formData, setFormData] = useState<GroupFormData>({
    groupCode: '',
    groupName: '',
    category: '',
    department: '',
    picRole: '',
    picCrewId: '',
    description: '',
    isActive: true,
  });

  useEffect(() => {
    loadData();
  }, []);

  // Filtered and paginated groups
  const filteredGroups = useMemo(() => {
    return groups.filter(group => {
      const matchesSearch = 
        group.groupCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        group.groupName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (group.description?.toLowerCase() || '').includes(searchQuery.toLowerCase());
      
      const matchesDepartment = !selectedDepartment || group.department === selectedDepartment;
      const matchesCategory = !selectedCategory || group.category === selectedCategory;
      
      return matchesSearch && matchesDepartment && matchesCategory;
    });
  }, [groups, searchQuery, selectedDepartment, selectedCategory]);

  const totalPages = Math.ceil(filteredGroups.length / itemsPerPage);
  const paginatedGroups = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredGroups.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredGroups, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, selectedDepartment, selectedCategory]);

  const fetchGroups = async () => {
    try {
      const groupsData = await equipmentGroupService.getAll();
      setGroups(groupsData);
    } catch (err) {
      console.error('Error fetching groups:', err);
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [groupsData, crewData, assetsData] = await Promise.all([
        equipmentGroupService.getAll(),
        maritimeService.crew.getAll({ pageSize: 100, isOnboard: true }),
        equipmentAssetService.getAll()
      ]);
      setGroups(groupsData);
      setCrewList(crewData.data || []);
      setAllAssets(assetsData);
      setAvailableAssets(assetsData);
    } catch (err) {
      console.error('Error loading data:', err);
      toast.error(t('pms.groups.failedToLoad'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (group?: EquipmentGroup) => {
    if (group) {
      setEditingGroup(group);
      setFormData({
        groupCode: group.groupCode,
        groupName: group.groupName,
        category: group.category || '',
        department: group.department || '',
        picRole: group.picRole || '',
        picCrewId: group.picCrewId || '',
        description: group.description || '',
        isActive: group.isActive,
      });
      loadGroupAssets(group.id);
    } else {
      setEditingGroup(null);
      setFormData({
        groupCode: '',
        groupName: '',
        category: '',
        department: '',
        picRole: '',
        picCrewId: '',
        description: '',
        isActive: true,
      });
      setGroupAssets([]);
      setAvailableAssets(allAssets);
    }
    setSelectedAvailable([]);
    setSelectedAssigned([]);
    setAssetSearchAvailable('');
    setAssetSearchAssigned('');
    setAssetCategoryFilterAvailable('');
    setAssetCategoryFilterAssigned('');
    setShowModal(true);
  };

  const loadGroupAssets = async (groupId: string) => {
    try {
      // Use equipment-group service to get members (same as View modal)
      const assets = await equipmentGroupService.getGroupMembers(groupId);
      setGroupAssets(assets);
      
      // Filter available assets (exclude already assigned)
      const assignedIds = assets.map((a: any) => a.id);
      setAvailableAssets(allAssets.filter((a: any) => !assignedIds.includes(a.id)));
    } catch (error) {
      console.error('Error loading group assets:', error);
      toast.error(t('pms.groups.failedToLoadAssets'));
    }
  };

  // View group functionality - can be enabled via edit modal or dedicated view
  
  const handleAddAssets = async () => {
    if (!editingGroup || selectedAvailable.length === 0) return;
    
    try {
      await Promise.all(
        selectedAvailable.map(assetId =>
          equipmentGroupService.addAsset(editingGroup.id, assetId)
        )
      );
      
      // Move selected assets from available to assigned
      const assetsToMove = allAssets.filter((a: any) => selectedAvailable.includes(a.id));
      setGroupAssets([...groupAssets, ...assetsToMove]);
      setAvailableAssets(availableAssets.filter((a: any) => !selectedAvailable.includes(a.id)));
      setSelectedAvailable([]);
      
      // Refresh groups to update memberCount
      await fetchGroups();
      
      toast.success(t('pms.groups.addedAssets', { count: selectedAvailable.length }));
    } catch (error) {
      console.error('Error adding assets:', error);
      toast.error(t('pms.groups.saveFailed'));
    }
  };

  const handleRemoveAssets = async () => {
    if (!editingGroup || selectedAssigned.length === 0) return;
    
    try {
      await Promise.all(
        selectedAssigned.map(assetId =>
          equipmentGroupService.removeAsset(editingGroup.id, assetId)
        )
      );
      
      // Move selected assets from assigned to available
      const assetsToMove = allAssets.filter((a: any) => selectedAssigned.includes(a.id));
      setAvailableAssets([...availableAssets, ...assetsToMove]);
      setGroupAssets(groupAssets.filter((a: any) => !selectedAssigned.includes(a.id)));
      setSelectedAssigned([]);
      
      // Refresh groups to update memberCount
      await fetchGroups();
      
      toast.success(t('pms.groups.removedAssets', { count: selectedAssigned.length }));
    } catch (error) {
      console.error('Error removing assets:', error);
      toast.error(t('pms.groups.saveFailed'));
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingGroup(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.groupCode || !formData.groupName) {
      toast.error(t('pms.groups.codeNameRequired'));
      return;
    }

    try {
      if (editingGroup) {
        await equipmentGroupService.update(editingGroup.id, formData);
        toast.success(t('pms.groups.updateSuccess'));
      } else {
        await equipmentGroupService.create(formData);
        toast.success(t('pms.groups.createSuccess'));
      }
      handleCloseModal();
      await loadData();
    } catch (err: any) {
      console.error('Error saving group:', err);
      toast.error(err.message || t('pms.groups.saveFailed'));
    }
  };

  const handleDelete = async (group: EquipmentGroup) => {
    toast(t('pms.groups.confirmDelete', { name: group.groupName }), {
      action: {
        label: t('common.delete') || 'Delete',
        onClick: async () => {
          try {
            await equipmentGroupService.delete(group.id);
            toast.success(t('pms.groups.deleteSuccess'));
            await loadData();
          } catch (err: any) {
            console.error('Error deleting group:', err);
            toast.error(err.message || t('pms.groups.deleteFailed'));
          }
        }
      }
    });
  };

  const getDepartmentColor = (dept?: string) => {
    const deptObj = DEPARTMENTS.find(d => d.value === dept);
    return deptObj?.color || 'bg-gray-100 text-gray-600';
  };

  // Filter crew by department
  const filteredCrew = formData.department 
    ? crewList.filter(c => c.department === formData.department)
    : crewList;

  // Filter PIC roles by department
  const filteredPicRoles = formData.department
    ? PIC_ROLES.filter(role => role.departments.includes(formData.department))
    : PIC_ROLES;

  // Check if selected PIC Role has actual crew in the department
  const picRoleHasCrew = formData.picRole && formData.department
    ? crewList.some(c => c.rank === formData.picRole && c.department === formData.department && c.isOnboard)
    : true;

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="ml-3 text-gray-600">{t('pms.groups.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Package className="w-8 h-8 text-blue-500" />
            <h1 className="text-2xl font-bold text-gray-900">{t('pms.groups.title')}</h1>
          </div>
          <p className="text-gray-600">
            {t('pms.groups.subtitle')}
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          {t('pms.groups.addGroup')}
        </button>
      </div>

      {/* Search & Filters */}
      <div className="mb-4 bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder={t('pms.groups.searchPlaceholder')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
        </div>

        {/* Filter Options */}
        <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('pms.groups.department')}</label>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t('pms.groups.allDepartments')}</option>
                {DEPARTMENTS.map(dept => (
                  <option key={dept.value} value={dept.value}>{dept.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('pms.groups.category')}</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">{t('pms.groups.allCategories')}</option>
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

        {/* Results Count */}
        <div className="mt-3 text-sm text-gray-600">
          {t('pms.groups.showing', { current: paginatedGroups.length, total: filteredGroups.length })}
          {filteredGroups.length !== groups.length && ` ${t('pms.groups.filteredFrom', { total: groups.length })}`}
        </div>
      </div>

      {/* Groups Table */}
      {filteredGroups.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">
            {t('pms.groups.noGroups')}
          </h3>
          <p className="text-gray-600 mb-4">
            {t('pms.groups.noGroupsDesc')}
          </p>
          <button
            onClick={() => handleOpenModal()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-5 h-5" />
            {t('pms.groups.addFirstGroup')}
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="min-w-full w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32">{t('pms.groups.code')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('pms.groups.name')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-40">{t('pms.groups.category')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-40">{t('pms.groups.department')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-32">{t('pms.groups.pic')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">{t('pms.groups.assets')}</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-28">{t('pms.groups.status')}</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-24">{t('pms.groups.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedGroups.map((group) => (
                <tr key={group.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className="font-mono text-sm font-medium text-gray-900">{group.groupCode}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900 break-words max-w-xs">{group.groupName}</div>
                  </td>
                  <td className="px-4 py-3">
                    {group.category ? (
                      <span className="text-sm text-gray-900">{group.category}</span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {group.department ? (
                      <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${getDepartmentColor(group.department)}`}>
                        {group.department}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {group.picRole || group.picCrewId ? (
                      <div>
                        {group.picRole && (
                          <span className="text-sm font-medium text-gray-900">{group.picRole}</span>
                        )}
                        {group.picCrewId && (
                          <span className="text-xs text-gray-500 block">{group.picCrewId}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-gray-900">
                      {group.memberCount || 0}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded-md text-xs font-medium ${
                      group.isActive 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {group.isActive ? t('pms.groups.active') : t('pms.groups.inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleOpenModal(group)}
                        className="p-1 text-green-600 hover:bg-green-50 rounded"
                        title={t('pms.groups.edit')}
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(group)}
                        className="p-1 text-red-600 hover:bg-red-50 rounded"
                        title={t('pms.groups.delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
              <div className="text-sm text-gray-600">
                {t('pms.groups.page', { current: currentPage, total: totalPages })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {t('pms.groups.previous')}
                </button>
                <div className="flex items-center gap-1">
                  {[...Array(totalPages)].map((_, i) => {
                    const page = i + 1;
                    if (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    ) {
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-3 py-1 border rounded ${
                            currentPage === page
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    } else if (page === currentPage - 2 || page === currentPage + 2) {
                      return <span key={page} className="px-2">...</span>;
                    }
                    return null;
                  })}
                </div>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  {t('pms.groups.next')}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {editingGroup ? t('pms.groups.editGroup') : t('pms.groups.addGroupTitle')}
              </h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Group Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('pms.groups.groupCode')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.groupCode}
                  onChange={(e) => setFormData({ ...formData, groupCode: e.target.value.toUpperCase() })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={t('pms.groups.groupCodePlaceholder')}
                  required
                />
              </div>

              {/* Group Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('pms.groups.groupName')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.groupName}
                  onChange={(e) => setFormData({ ...formData, groupName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder={t('pms.groups.groupNamePlaceholder')}
                  required
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('pms.groups.category')}
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">{t('pms.groups.selectCategory')}</option>
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Department */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('pms.groups.department')}
                </label>
                <select
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value, picRole: '', picCrewId: '' })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">{t('pms.groups.selectDepartment')}</option>
                  {DEPARTMENTS.map(dept => (
                    <option key={dept.value} value={dept.value}>{dept.label}</option>
                  ))}
                </select>
              </div>

              {/* PIC Role */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('pms.groups.picRole')}
                </label>
                <select
                  value={formData.picRole}
                  onChange={(e) => setFormData({ ...formData, picRole: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={!formData.department}
                >
                  <option value="">{t('pms.groups.selectPicRole')}</option>
                  {filteredPicRoles.map(role => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
                {formData.department && formData.picRole && !picRoleHasCrew && (
                  <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <svg className="w-5 h-5 text-amber-600 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-amber-800">
                          ⚠️ {t('pms.groups.noCrewFound')}
                        </p>
                        <p className="text-xs text-amber-700 mt-1">
                          There is no onboard crew with rank <strong>{formData.picRole}</strong> in department <strong>{formData.department}</strong>.
                          Tasks will not be auto-assigned. Consider:
                        </p>
                        <ul className="text-xs text-amber-700 mt-1 ml-4 list-disc space-y-0.5">
                          <li>Changing department to match crew's actual department</li>
                          <li>Using "PIC Crew" field to assign specific person</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  {formData.department 
                    ? t('pms.groups.showingRoles', { department: formData.department })
                    : t('pms.groups.selectDeptFirst')}
                </p>
              </div>

              {/* PIC Crew ID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('pms.groups.picCrew')}
                </label>
                <select
                  value={formData.picCrewId}
                  onChange={(e) => setFormData({ ...formData, picCrewId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={!formData.department}
                >
                  <option value="">{t('pms.groups.selectCrew')}</option>
                  {filteredCrew.map(crew => (
                    <option key={crew.crewId} value={crew.crewId}>
                      {crew.fullName} ({typeof crew.rank === 'object' ? crew.rank?.rankName : crew.rank}) - {crew.crewId}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {formData.department 
                    ? t('pms.groups.showingCrew', { department: formData.department })
                    : t('pms.groups.selectDeptForCrew')}
                </p>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('pms.groups.description')}
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows={3}
                  placeholder={t('pms.groups.descriptionPlaceholder')}
                />
              </div>

              {/* Is Active */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                />
                <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
                  {t('pms.groups.isActiveLabel')}
                </label>
              </div>

              {/* Equipment Assets Management (Only for Edit mode) */}
              {editingGroup && (
                <div className="pt-4 border-t border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('pms.groups.equipmentAssets')}</h3>
                  
                  <div className="flex gap-6">
                    {/* Available Assets */}
                    <div className="flex-1 border border-gray-300 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 px-4 py-3 border-b border-gray-300">
                        <h4 className="text-sm font-semibold text-gray-900">
                          Available ({availableAssets.filter((a: any) => {
                            const matchesSearch = a.assetCode.toLowerCase().includes(assetSearchAvailable.toLowerCase()) ||
                              a.assetName.toLowerCase().includes(assetSearchAvailable.toLowerCase());
                            const matchesCategory = !assetCategoryFilterAvailable || a.category === assetCategoryFilterAvailable;
                            return matchesSearch && matchesCategory;
                          }).length})
                        </h4>
                        <div className="mt-2 flex gap-2">
                          <input
                            type="text"
                            placeholder={t('pms.groups.searchAssets')}
                            value={assetSearchAvailable}
                            onChange={(e) => setAssetSearchAvailable(e.target.value)}
                            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                          />
                          <select
                            value={assetCategoryFilterAvailable}
                            onChange={(e) => setAssetCategoryFilterAvailable(e.target.value)}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 bg-white"
                          >
                            <option value="">{t('pms.groups.allCategoriesAssets')}</option>
                            {CATEGORIES.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="h-64 overflow-y-auto p-2 space-y-1">
                        {availableAssets
                          .filter((a: any) => {
                            const matchesSearch = a.assetCode.toLowerCase().includes(assetSearchAvailable.toLowerCase()) ||
                              a.assetName.toLowerCase().includes(assetSearchAvailable.toLowerCase());
                            const matchesCategory = !assetCategoryFilterAvailable || a.category === assetCategoryFilterAvailable;
                            return matchesSearch && matchesCategory;
                          })
                          .map((asset: any) => (
                            <label
                              key={asset.id}
                              className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-blue-50 ${
                                selectedAvailable.includes(asset.id) ? 'bg-blue-50' : ''
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedAvailable.includes(asset.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedAvailable([...selectedAvailable, asset.id]);
                                  } else {
                                    setSelectedAvailable(selectedAvailable.filter(id => id !== asset.id));
                                  }
                                }}
                                className="rounded text-blue-600"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{asset.assetName}</p>
                                <p className="text-xs text-gray-500">{asset.assetCode}</p>
                                {asset.category && (
                                  <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">
                                    {asset.category}
                                  </span>
                                )}
                              </div>
                            </label>
                          ))}
                        {availableAssets.filter((a: any) => {
                          const matchesSearch = a.assetCode.toLowerCase().includes(assetSearchAvailable.toLowerCase()) ||
                            a.assetName.toLowerCase().includes(assetSearchAvailable.toLowerCase());
                          const matchesCategory = !assetCategoryFilterAvailable || a.category === assetCategoryFilterAvailable;
                          return matchesSearch && matchesCategory;
                        }).length === 0 && (
                          <div className="text-center py-8 text-sm text-gray-500">
                            {t('pms.groups.noAssetsAvailable')}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Control Buttons */}
                    <div className="flex flex-col items-center justify-center gap-3">
                      <button
                        type="button"
                        onClick={handleAddAssets}
                        disabled={selectedAvailable.length === 0}
                        className="p-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                        title={t('pms.groups.addToGroup')}
                      >
                        <MoveRight className="w-5 h-5" />
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveAssets}
                        disabled={selectedAssigned.length === 0}
                        className="p-2.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rotate-180 shadow-sm"
                        title={t('pms.groups.removeFromGroup')}
                      >
                        <MoveRight className="w-5 h-5" />
                      </button>
                    </div>

                    {/* Assigned Assets */}
                    <div className="flex-1 border border-green-300 rounded-lg overflow-hidden">
                      <div className="bg-green-50 px-4 py-3 border-b border-green-300">
                        <h4 className="text-sm font-semibold text-gray-900">
                          Selected ({groupAssets.filter((a: any) => {
                            const matchesSearch = a.assetCode.toLowerCase().includes(assetSearchAssigned.toLowerCase()) ||
                              a.assetName.toLowerCase().includes(assetSearchAssigned.toLowerCase());
                            const matchesCategory = !assetCategoryFilterAssigned || a.category === assetCategoryFilterAssigned;
                            return matchesSearch && matchesCategory;
                          }).length})
                        </h4>
                        <div className="mt-2 flex gap-2">
                          <input
                            type="text"
                            placeholder={t('pms.groups.searchAssets')}
                            value={assetSearchAssigned}
                            onChange={(e) => setAssetSearchAssigned(e.target.value)}
                            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-green-500"
                          />
                          <select
                            value={assetCategoryFilterAssigned}
                            onChange={(e) => setAssetCategoryFilterAssigned(e.target.value)}
                            className="px-3 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-green-500 bg-white"
                          >
                            <option value="">{t('pms.groups.allCategoriesAssets')}</option>
                            {CATEGORIES.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="h-64 overflow-y-auto p-2 space-y-1">
                        {groupAssets
                          .filter((a: any) => {
                            const matchesSearch = a.assetCode.toLowerCase().includes(assetSearchAssigned.toLowerCase()) ||
                              a.assetName.toLowerCase().includes(assetSearchAssigned.toLowerCase());
                            const matchesCategory = !assetCategoryFilterAssigned || a.category === assetCategoryFilterAssigned;
                            return matchesSearch && matchesCategory;
                          })
                          .map((asset: any) => (
                            <label
                              key={asset.id}
                              className={`flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-green-100 ${
                                selectedAssigned.includes(asset.id) ? 'bg-green-100' : ''
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={selectedAssigned.includes(asset.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedAssigned([...selectedAssigned, asset.id]);
                                  } else {
                                    setSelectedAssigned(selectedAssigned.filter(id => id !== asset.id));
                                  }
                                }}
                                className="rounded text-green-600"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 truncate">{asset.assetName}</p>
                                <p className="text-xs text-gray-500">{asset.assetCode}</p>
                                {asset.category && (
                                  <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-gray-100 text-gray-700 rounded">
                                    {asset.category}
                                  </span>
                                )}
                              </div>
                            </label>
                          ))}
                        {groupAssets.filter((a: any) => {
                          const matchesSearch = a.assetCode.toLowerCase().includes(assetSearchAssigned.toLowerCase()) ||
                            a.assetName.toLowerCase().includes(assetSearchAssigned.toLowerCase());
                          const matchesCategory = !assetCategoryFilterAssigned || a.category === assetCategoryFilterAssigned;
                          return matchesSearch && matchesCategory;
                        }).length === 0 && (
                          <div className="text-center py-8 text-sm text-gray-500">
                            {t('pms.groups.noAssetsInGroup')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  {t('pms.groups.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  {editingGroup ? t('pms.groups.updateGroup') : t('pms.groups.createGroup')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Group Modal */}
      <ViewGroupModal
        isOpen={showViewModal}
        group={viewingGroup}
        onClose={() => {
          setShowViewModal(false);
          setViewingGroup(null);
        }}
      />
    </div>
  );
}
