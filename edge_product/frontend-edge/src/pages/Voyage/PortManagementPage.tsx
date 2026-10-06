import { PermissionGate } from '@/components/auth/PermissionGate'
import { useState, useEffect, useCallback } from 'react'
import { Search, Plus, Edit2, Trash2, MapPin, Globe, X, Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { voyageMgmtService } from '@/services/voyage.service'
import type { Port, CreatePortDto, UpdatePortDto, PortSearchQuery } from '@/types/voyage.types'
import { useTranslationSafe } from '@/contexts/I18nContext'

export function PortManagementPage() {
  const { t } = useTranslationSafe()
  const [ports, setPorts] = useState<Port[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCountry, setFilterCountry] = useState('')
  const [countries, setCountries] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const pageSize = 20

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingPort, setEditingPort] = useState<Port | null>(null)
  const [formData, setFormData] = useState<CreatePortDto>({
    portCode: '',
    portName: '',
    country: '',
    countryCode: '',
    latitude: undefined,
    longitude: undefined,
    timeZone: '',
  })
  const [saving, setSaving] = useState(false)

  const loadPorts = useCallback(async () => {
    try {
      setLoading(true)
      const query: PortSearchQuery = {
        search: searchQuery || undefined,
        countryCode: filterCountry || undefined,
        isActive: true,
        page,
        pageSize,
      }
      const result = await voyageMgmtService.ports.search(query)
      setPorts(result.data)
      setTotalPages(result.pagination.totalPages)
      setTotalCount(result.pagination.totalCount)
    } catch (err: any) {
      toast.error('Failed to load ports: ' + (err.message || 'Unknown error'))
    } finally {
      setLoading(false)
    }
  }, [searchQuery, filterCountry, page])

  const loadCountries = useCallback(async () => {
    try {
      const list = await voyageMgmtService.ports.getCountries()
      setCountries(list)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    loadPorts()
  }, [loadPorts])

  useEffect(() => {
    loadCountries()
  }, [loadCountries])

  // Debounced search
  useEffect(() => {
    setPage(1)
  }, [searchQuery, filterCountry])

  const openCreateModal = () => {
    setEditingPort(null)
    setFormData({
      portCode: '',
      portName: '',
      country: '',
      countryCode: '',
      latitude: undefined,
      longitude: undefined,
      timeZone: '',
    })
    setShowModal(true)
  }

  const openEditModal = (port: Port) => {
    setEditingPort(port)
    setFormData({
      portCode: port.portCode,
      portName: port.portName,
      country: port.country || '',
      countryCode: port.countryCode || '',
      latitude: port.latitude,
      longitude: port.longitude,
      timeZone: port.timeZone || '',
    })
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!formData.portCode || !formData.portName) {
      toast.error(t('voyage.portMgmt.portCodeRequired'))
      return
    }

    if (formData.portCode.length !== 5) {
      toast.error(t('voyage.portMgmt.portCodeLength'))
      return
    }

    try {
      setSaving(true)
      if (editingPort) {
        const updateData: UpdatePortDto = {
          portName: formData.portName,
          country: formData.country || undefined,
          countryCode: formData.countryCode || undefined,
          latitude: formData.latitude,
          longitude: formData.longitude,
          timeZone: formData.timeZone || undefined,
        }
        await voyageMgmtService.ports.update(editingPort.id, updateData)
        toast.success(t('voyage.portMgmt.portUpdated', { code: editingPort.portCode }))
      } else {
        await voyageMgmtService.ports.create(formData)
        toast.success(t('voyage.portMgmt.portCreated', { code: formData.portCode }))
      }
      setShowModal(false)
      loadPorts()
    } catch (err: any) {
      toast.error(err.message || t('voyage.portMgmt.failedSave'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (port: Port) => {
    toast(t('voyage.portMgmt.deactivateConfirm', { code: port.portCode, name: port.portName }), {
      action: {
        label: t('common.deactivate') || 'Deactivate',
        onClick: async () => {
          try {
            await voyageMgmtService.ports.delete(port.id)
            toast.success(t('voyage.portMgmt.portDeactivated', { code: port.portCode }))
            loadPorts()
          } catch (err: any) {
            toast.error(err.message || t('voyage.portMgmt.failedDelete'))
          }
        }
      }
    })
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-gradient-to-br from-slate-50 via-blue-50 to-slate-100">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <MapPin className="w-7 h-7 text-blue-600" />
              {t('voyage.portMgmt.title')}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {t('voyage.portMgmt.subtitle', { count: totalCount })}
            </p>
          </div>
          <PermissionGate permission="ports.create"><button
            onClick={openCreateModal}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            {t('voyage.portMgmt.addPort')}
          </button></PermissionGate>
        </div>

        {/* Search & Filter */}
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={t('voyage.portMgmt.searchPlaceholder')}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={filterCountry}
            onChange={e => setFilterCountry(e.target.value)}
            className="px-3 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[160px]"
          >
            <option value="">{t('voyage.portMgmt.allCountries')}</option>
            {countries.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 w-[100px]">{t('voyage.portMgmt.code')}</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700">{t('voyage.portMgmt.portName')}</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 w-[160px]">{t('voyage.portMgmt.country')}</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 w-[80px]">{t('voyage.portMgmt.code')}</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 w-[100px]">{t('voyage.portMgmt.lat')}</th>
                  <th className="text-right px-4 py-3 font-semibold text-gray-700 w-[100px]">{t('voyage.portMgmt.lng')}</th>
                  <th className="text-left px-4 py-3 font-semibold text-gray-700 w-[120px]">{t('voyage.portMgmt.timeZone')}</th>
                  <th className="text-center px-4 py-3 font-semibold text-gray-700 w-[90px]">{t('voyage.portMgmt.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400">
                      {t('voyage.portMgmt.loading')}
                    </td>
                  </tr>
                ) : ports.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-gray-400">
                      <Globe className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      {t('voyage.portMgmt.noPortsFound')}
                    </td>
                  </tr>
                ) : (
                  ports.map(port => (
                    <tr key={port.id} className="hover:bg-blue-50/50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="font-mono font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                          {port.portCode}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{port.portName}</td>
                      <td className="px-4 py-3 text-gray-600">{port.country || '-'}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono">{port.countryCode || '-'}</td>
                      <td className="px-4 py-3 text-right text-gray-500 font-mono text-xs">
                        {port.latitude != null ? port.latitude.toFixed(4) : '-'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-500 font-mono text-xs">
                        {port.longitude != null ? port.longitude.toFixed(4) : '-'}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{port.timeZone || '-'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <PermissionGate permission="ports.update"><button
                            onClick={() => openEditModal(port)}
                            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                            title={t('voyage.portMgmt.edit')}
                          >
                            <Edit2 className="w-4 h-4" />
                          </button></PermissionGate>
                          <PermissionGate permission="ports.delete"><button
                            onClick={() => handleDelete(port)}
                            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title={t('voyage.portMgmt.deactivate')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button></PermissionGate>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
              <span className="text-sm text-gray-500">
                {t('voyage.portMgmt.page', { page, totalPages, totalCount })}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded border border-gray-300 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded border border-gray-300 hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingPort ? t('voyage.portMgmt.editPort', { code: editingPort.portCode }) : t('voyage.portMgmt.addNewPort')}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-4">
              {/* Port Code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('voyage.portMgmt.portCodeLabel')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.portCode}
                  onChange={e => setFormData({ ...formData, portCode: e.target.value.toUpperCase() })}
                  disabled={!!editingPort}
                  placeholder="e.g. VNSGN"
                  maxLength={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 font-mono uppercase"
                />
                <p className="text-xs text-gray-400 mt-1">{t('voyage.portMgmt.portCodeHint')}</p>
              </div>

              {/* Port Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t('voyage.portMgmt.portNameLabel')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.portName}
                  onChange={e => setFormData({ ...formData, portName: e.target.value })}
                  placeholder="e.g. Ho Chi Minh City"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Country / Code */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('voyage.portMgmt.country')}</label>
                  <input
                    type="text"
                    value={formData.country || ''}
                    onChange={e => setFormData({ ...formData, country: e.target.value })}
                    placeholder="Vietnam"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('voyage.portMgmt.countryCode')}</label>
                  <input
                    type="text"
                    value={formData.countryCode || ''}
                    onChange={e => setFormData({ ...formData, countryCode: e.target.value.toUpperCase() })}
                    placeholder="VN"
                    maxLength={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase"
                  />
                </div>
              </div>

              {/* Lat / Lng */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('voyage.portMgmt.latitude')}</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formData.latitude ?? ''}
                    onChange={e => setFormData({ ...formData, latitude: e.target.value ? parseFloat(e.target.value) : undefined })}
                    placeholder="10.7756"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('voyage.portMgmt.longitude')}</label>
                  <input
                    type="number"
                    step="0.0001"
                    value={formData.longitude ?? ''}
                    onChange={e => setFormData({ ...formData, longitude: e.target.value ? parseFloat(e.target.value) : undefined })}
                    placeholder="106.7019"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* TimeZone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('voyage.portMgmt.timeZone')}</label>
                <input
                  type="text"
                  value={formData.timeZone || ''}
                  onChange={e => setFormData({ ...formData, timeZone: e.target.value })}
                  placeholder="UTC+7"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t bg-gray-50 rounded-b-xl">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100"
              >
                {t('voyage.portMgmt.cancel')}
              </button>
              <PermissionGate permission={editingPort ? 'ports.update' : 'ports.create'}><button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Check className="w-4 h-4" />
                {saving ? t('voyage.portMgmt.saving') : editingPort ? t('voyage.portMgmt.updatePort') : t('voyage.portMgmt.createPort')}
              </button></PermissionGate>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
