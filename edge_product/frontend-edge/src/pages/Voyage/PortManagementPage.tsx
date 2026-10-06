import { useState, useEffect, useCallback } from 'react'
import { Search, RefreshCw, MapPin, Globe, ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { voyageMgmtService } from '@/services/voyage.service'
import type { Port, PortSearchQuery } from '@/types/voyage.types'
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
              {t('voyage.portMgmt.subtitle', { count: totalCount })} · {t('voyage.portMgmt.managedOnShore')}
            </p>
          </div>
          <button
            onClick={() => { void loadPorts(); void loadCountries() }}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <RefreshCw className="w-4 h-4" />
            {t('common.refresh')}
          </button>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400">
                      {t('voyage.portMgmt.loading')}
                    </td>
                  </tr>
                ) : ports.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-gray-400">
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

    </div>
  )
}
