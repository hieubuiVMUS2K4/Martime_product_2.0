import { useEffect, useState, useRef, useMemo } from 'react'
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslationSafe } from '@/contexts/I18nContext'
// Pencil, Copy, XCircle, CheckCircle, Trash2 đã bỏ cùng các mục Sửa / Nhân bản /
// Vô hiệu hoá / Xoá trong menu chuột phải của tab Loại chứng chỉ. Bật lại thì import lại.
// Plus đã bỏ cùng ô thêm chứng chỉ vào chức danh — danh mục nay do bờ làm chủ.
import { Users, FileText, Award, User, Search, Download, Shield, ChevronsUpDown, ExternalLink, FileSpreadsheet, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { CrewMember, CrewCertificate } from '../../types/maritime.types'
import { maritimeService } from '../../services/maritime.service'
import { getAuthToken } from '../../services/api.client'
import { format, parseISO } from 'date-fns'
import { AddCrewCertificateModal } from './AddCrewCertificateModal'

export function CrewCertificatePage() {
  const navigate = useNavigate()
  const { t } = useTranslationSafe()

  // ── PAGE STATE ───────────────────────────────────────────────────────────
  const [rawCrewMembers, setRawCrewMembers] = useState<CrewMember[]>([])
  const [sortType, setSortType] = useState<{ col: string; dir: 'asc'|'desc' } | null>({ col: 'crewId', dir: 'asc' })
  const [sortMenu, setSortMenu] = useState<string | null>(null)
  const [certificateCache, setCertificateCache] = useState<any[] | null>(null)
  const [certificateLoading, setCertificateLoading] = useState(false)
  const [activeTab, setActiveTab] = useState<'crew' | 'certTypes' | 'ranks'>('crew')
  const [reloadTrigger, setReloadTrigger] = useState(0)
  const [countries, setCountries] = useState<any[]>([])
  const [selectedCountry, setSelectedCountry] = useState<string>(() =>
    localStorage.getItem('crewPage_selectedCountry') || 'all'
  )

  useEffect(() => {
    loadCrewData()
    loadCertificates()
    loadCountries()
  }, [])

  const loadCrewData = async () => {
    try { setRawCrewMembers(await maritimeService.crew.getOnboard()) }
    catch (e) { console.error('Failed to load crew data:', e) }
  }

  const loadCertificates = async () => {
    if (certificateCache !== null) return
    try {
      setCertificateLoading(true)
      const raw = await maritimeService.certificates.getWithCrewCount()
      setCertificateCache(raw.map((cert: any) => ({
        ...cert, totalCrew: cert.crewCount || 0, validCount: cert.validCount || 0,
        expiringCount: cert.expiringCount || 0, expiredCount: cert.expiredCount || 0, statsLoaded: true,
      })))
    } catch (e) { console.error('Failed to load certificates:', e) }
    finally { setCertificateLoading(false) }
  }

  const loadCountries = async () => {
    try { setCountries(await maritimeService.countries.getAll()) }
    catch (e) { console.error('Failed to load countries:', e) }
  }

  const handleReloadCertificates = async () => {
    setCertificateLoading(true)
    setCertificateCache(null)
    try {
      const raw = await maritimeService.certificates.getWithCrewCount()
      setCertificateCache(raw.map((cert: any) => ({
        ...cert, totalCrew: cert.crewCount || 0, validCount: cert.validCount || 0,
        expiringCount: cert.expiringCount || 0, expiredCount: cert.expiredCount || 0, statsLoaded: true,
      })))
      setReloadTrigger(prev => prev + 1)
    } catch (e) { console.error('Failed to reload certificates:', e) }
    finally { setCertificateLoading(false) }
  }

  const crewMembers = useMemo(() => {
    if (!sortType) return rawCrewMembers
    const sorted = [...rawCrewMembers]
    if (sortType.col === 'fullName')
      sorted.sort((a, b) => sortType.dir === 'asc' ? a.fullName.localeCompare(b.fullName) : b.fullName.localeCompare(a.fullName))
    else if (sortType.col === 'crewId')
      sorted.sort((a, b) => sortType.dir === 'asc' ? a.crewId.localeCompare(b.crewId) : b.crewId.localeCompare(a.crewId))
    return sorted
  }, [rawCrewMembers, sortType])

  // Helper to inject auth headers into fetch calls
  const authFetch = (url: string, options?: RequestInit): Promise<Response> => {
    const token = getAuthToken()
    const headers: Record<string, string> = {
      ...(options?.headers as Record<string, string> || {}),
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    return fetch(url, { ...options, headers })
  }

  const [currentPage, setCurrentPage] = useState(1)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; cert: any } | null>(null)
  const [selectedCert, setSelectedCert] = useState<string | null>(null)
  const [expandedCrewId, setExpandedCrewId] = useState<string | null>(null)
  const [crewCertificatesMap, setCrewCertificatesMap] = useState<Map<string, CrewCertificate[]>>(new Map())
  const [loadingCrewCerts, setLoadingCrewCerts] = useState<Record<string, boolean>>({})
  const ITEMS_PER_PAGE = 15
  const [crewCertsPage, setCrewCertsPage] = useState(1)

  // Search filters for tables
  const [crewSearchId, setCrewSearchId] = useState('')
  const [crewSearchName, setCrewSearchName] = useState('')
  const [certSearchName, setCertSearchName] = useState('')
  const [certSearchCode, setCertSearchCode] = useState('')

  // Context menu for crew rows (crew certs section & rank section)
  const [crewContextMenu, setCrewContextMenu] = useState<{ x: number; y: number; crew: CrewMember } | null>(null)

  // Add Crew Certificate Modal state
  const [showAddCrewCertModal, setShowAddCrewCertModal] = useState(false)
  const [addCertCrewId, setAddCertCrewId] = useState<string | undefined>(undefined)
  const [addCertCertificateId, setAddCertCertificateId] = useState<string | undefined>(undefined)

  // Ranks section states
  const [ranks, setRanks] = useState<any[]>([])
  const [rankCertificates, setRankCertificates] = useState<any[]>([])
  const [loadingRankCerts, setLoadingRankCerts] = useState(false)
  const [crewByRank, setCrewByRank] = useState<CrewMember[]>([])
  const [expandedRankId, setExpandedRankId] = useState<number | null>(null)
  const [expandedRankCrewId, setExpandedRankCrewId] = useState<string | null>(null)
  const [rankCertsCache, setRankCertsCache] = useState<Map<number, any[]>>(new Map())
  const [crewByRankCache, setCrewByRankCache] = useState<Map<number, CrewMember[]>>(new Map())
  const lastReloadTriggerRef = useRef(0)

  // Right-click context menu for cert status icons in crew compliance
  const [certIconMenu, setCertIconMenu] = useState<{ x: number; y: number; crewId: string; crewName: string; certificateId: number; certName: string; certCode: string; has: boolean } | null>(null)

  const getCrewCertificates = (crewId: string) => crewCertificatesMap.get(crewId) || []
  const hasCrewCertificatesLoaded = (crewId: string) => crewCertificatesMap.has(crewId)
  const setCrewCertificatesFor = (crewId: string, certs: CrewCertificate[]) => {
    setCrewCertificatesMap(prev => {
      const updated = new Map(prev)
      updated.set(crewId, certs)
      return updated
    })
  }

  // Use cached data from parent and filter by country
  let certificateStats = certificateCache || []
  let otherCertificateStats: any[] = []
  
  // Filter by country if selected
  if (selectedCountry !== 'all') {
    // Certificates WITH selected country
    certificateStats = certificateStats.filter((cert: any) => {
      // Check if certificate has countries array and includes selected country
      if (cert.countries && Array.isArray(cert.countries)) {
        return cert.countries.some((c: any) => c.id?.toString() === selectedCountry || c.countryId?.toString() === selectedCountry)
      }
      return false
    })
    
    // Certificates WITHOUT selected country
    otherCertificateStats = (certificateCache || []).filter((cert: any) => {
      // Check if certificate does NOT have the selected country
      if (cert.countries && Array.isArray(cert.countries)) {
        return !cert.countries.some((c: any) => c.id?.toString() === selectedCountry || c.countryId?.toString() === selectedCountry)
      }
      // If no countries array, include in "other" certificates
      return true
    })
  }

  // Apply sorting
  const applySorting = (certs: any[]) => {
    if (!sortType) return certs
    const sorted = [...certs]
    switch (sortType.col) {
      case 'certificateName':
        sorted.sort((a, b) => sortType.dir === 'asc'
          ? a.certificateName.localeCompare(b.certificateName)
          : b.certificateName.localeCompare(a.certificateName))
        break
      case 'certificateCode':
        sorted.sort((a, b) => sortType.dir === 'asc'
          ? a.certificateCode.localeCompare(b.certificateCode)
          : b.certificateCode.localeCompare(a.certificateCode))
        break
      case 'category':
        sorted.sort((a, b) => {
          const aCat = a.category || ''
          const bCat = b.category || ''
          return sortType.dir === 'asc' ? aCat.localeCompare(bCat) : bCat.localeCompare(aCat)
        })
        break
      case 'validity':
        sorted.sort((a, b) => {
          const aVal = a.validityPeriodMonths || 0
          const bVal = b.validityPeriodMonths || 0
          return sortType.dir === 'asc' ? aVal - bVal : bVal - aVal
        })
        break
      case 'totalCrew':
        sorted.sort((a, b) => {
          const aTotal = a.totalCrew || 0
          const bTotal = b.totalCrew || 0
          return sortType.dir === 'asc' ? aTotal - bTotal : bTotal - aTotal
        })
        break
      case 'crewId':
        sorted.sort((a, b) => {
          const aId = a.crewId || ''
          const bId = b.crewId || ''
          return sortType.dir === 'asc' ? aId.localeCompare(bId) : bId.localeCompare(aId)
        })
        break
      case 'fullName':
        sorted.sort((a, b) => {
          const aName = a.fullName || ''
          const bName = b.fullName || ''
          return sortType.dir === 'asc' ? aName.localeCompare(bName) : bName.localeCompare(aName)
        })
        break
      case 'position':
        sorted.sort((a, b) => {
          const aPos = a.rank?.rankName || ''
          const bPos = b.rank?.rankName || ''
          return sortType.dir === 'asc' ? aPos.localeCompare(bPos) : bPos.localeCompare(aPos)
        })
        break
      case 'totalCerts':
        sorted.sort((a, b) => {
          const aTotal = a.totalCerts || 0
          const bTotal = b.totalCerts || 0
          return sortType.dir === 'asc' ? aTotal - bTotal : bTotal - aTotal
        })
        break
    }
    return sorted
  }

  certificateStats = applySorting(certificateStats)
  otherCertificateStats = applySorting(otherCertificateStats)

  // SortDropdown component
  function SortDropdown({ col, options }: {
    col: string;
    options: Array<{ label: string; dir: 'asc'|'desc' }>;
  }) {
    if (!setSortType || !setSortMenu) return null
    return (
      <div className="absolute top-1/2 right-2 -translate-y-1/2" style={{zIndex:10}}>
        <button
          className="text-gray-400 hover:text-blue-600 text-xs p-1"
          onClick={e => { e.stopPropagation(); setSortMenu(sortMenu === col ? null : col) }}
          style={{lineHeight:0}}
        >
          <ChevronsUpDown size={14} />
        </button>
        {sortMenu === col && (
          <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded shadow-lg z-50">
            {options.map(opt => (
              <button
                key={opt.label}
                className={`block w-full text-left px-3 py-2 text-sm hover:bg-blue-50 ${
                  sortType?.col === col && sortType?.dir === opt.dir 
                    ? 'text-blue-600 font-bold' 
                    : 'text-gray-700'
                }`}
                onClick={e => { 
                  e.stopPropagation(); 
                  setSortType({col, dir: opt.dir}); 
                  setSortMenu(null) 
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  const getCategoryBadge = (category?: string) => {
    const colors: Record<string, string> = {
      COMPETENCY: 'bg-blue-100 text-blue-800 border-blue-300',
      MEDICAL: 'bg-red-100 text-red-800 border-red-300',
      PROFICIENCY: 'bg-green-100 text-green-800 border-green-300',
      SAFETY: 'bg-yellow-100 text-yellow-800 border-yellow-300'
    }
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${colors[category || ''] || 'bg-gray-100 text-gray-800'}`}>
        {category || t('crew.edDetail.other')}
      </span>
    )
  }

  const handleCertificateClick = (certId: string) => {
    navigate(`/crew/certificates/${certId}`)
  }

  const handleContextMenu = (e: React.MouseEvent, cert: any) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, cert })
    setSelectedCert(cert.id)
    setCrewContextMenu(null)
  }

  const handleCrewContextMenu = (e: React.MouseEvent, crew: CrewMember) => {
    e.preventDefault()
    e.stopPropagation()
    setCrewContextMenu({ x: e.clientX, y: e.clientY, crew })
    setContextMenu(null)
  }

  const closeContextMenu = () => {
    setContextMenu(null)
    setSelectedCert(null)
    setCrewContextMenu(null)
    setCertIconMenu(null)
  }

  useEffect(() => {
    const handleClick = () => { closeContextMenu() }
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])

  // Close expanded rows when switching tabs
  useEffect(() => {
    setExpandedCrewId(null)
    setExpandedRankId(null)
    setExpandedRankCrewId(null)
  }, [activeTab])

  // Load ranks when component mounts
  useEffect(() => {
    loadRanks()
  }, [])

  const loadRanks = async () => {
    try {
      const data = await maritimeService.ranks.getAll()
      setRanks(data)
    } catch (error) {
      console.error('Failed to load ranks:', error)
    }
  }

  const loadRankCertificates = async (rankId: number) => {
    // Check cache first
    if (rankCertsCache.has(rankId)) {
      return rankCertsCache.get(rankId)!
    }

    try {
      const response = await authFetch(`/api/rank-certificates/rank/${rankId}`)
      if (response.ok) {
        const data = await response.json()
        // Cache the result
        setRankCertsCache(prev => new Map(prev).set(rankId, data))
        return data
      }
      return []
    } catch (error) {
      console.error('Failed to load rank certificates:', error)
      return []
    }
  }

  const loadCrewByRank = async (rankId: number) => {
    // Check cache first
    if (crewByRankCache.has(rankId)) {
      return crewByRankCache.get(rankId)!
    }

    // Filter from already-loaded crewMembers instead of a new API call
    const crewWithRank = crewMembers.filter((crew: CrewMember) => crew.rankId === rankId && crew.isOnboard)
    
    // Cache the result
    setCrewByRankCache(prev => new Map(prev).set(rankId, crewWithRank))
    
    return crewWithRank
  }

  const handleRankClick = async (rankId: number) => {
    // Toggle expand/collapse
    if (expandedRankId === rankId) {
      setExpandedRankId(null)
      setExpandedRankCrewId(null) // Reset expanded crew when collapsing rank
      return
    }

    setExpandedRankId(rankId)
    setExpandedRankCrewId(null) // Reset expanded crew when switching ranks
    setLoadingRankCerts(true)

    try {
      // Load rank certificates and crew data in parallel
      const [rankCerts, crewList] = await Promise.all([
        loadRankCertificates(rankId),
        loadCrewByRank(rankId)
      ])

      console.log(`🔍 Loading certificates for rank ${rankId}:`)
      console.log('   - Rank certificates:', rankCerts.length)
      console.log('   - Crew members:', crewList.length)

      setRankCertificates(rankCerts)
      setCrewByRank(crewList)

      // Bulk load certificates for all crew in this rank
      const crewIds = crewList.map(c => c.id)
      if (crewIds.length > 0) {
        try {
          const grouped = await maritimeService.certificates.getCrewCertificatesBulk(crewIds)
          setCrewCertificatesMap(prev => {
            const updated = new Map(prev)
            crewIds.forEach(crewId => {
              updated.set(crewId, grouped[crewId] || [])
            })
            return updated
          })
          console.log('✅ All certificates loaded for rank (bulk)')
        } catch (error) {
          console.error('Failed to bulk load certificates for rank:', error)
        }
      }
    } catch (error) {
      console.error('Failed to load rank data:', error)
    } finally {
      setLoadingRankCerts(false)
    }
  }

  // Helper function to check if crew member has a specific certificate
  const crewHasCertificate = (crewId: string, certificateId: number): { has: boolean; status?: string; expiryDate?: string } => {
    const crewCerts = getCrewCertificates(crewId)
    const cert = crewCerts.find(c => c.certificateId === certificateId)
    if (cert) {
      // Log for debugging certificate status display
      if (cert.status !== 'VALID') {
        console.log(`Certificate ${certificateId} for crew ${crewId}: status=${cert.status}, number=${cert.certificateNumber}`)
      }
      return {
        has: true,
        status: cert.status,
        expiryDate: cert.expiryDate
      }
    }
    return { has: false }
  }

  // Calculate compliance summary for a rank
  const getComplianceSummary = (rankId: number) => {
    const rankCerts = rankCertsCache.get(rankId) || []
    const crewList = crewByRankCache.get(rankId) || []
    
    if (rankCerts.length === 0 || crewList.length === 0) {
      return { fullyCompliant: 0, partiallyCompliant: 0, nonCompliant: 0 }
    }

    const summary = { fullyCompliant: 0, partiallyCompliant: 0, nonCompliant: 0 }
    
    crewList.forEach(crew => {
      const requiredCertIds = rankCerts.map(rc => rc.certificateId)
      const crewCerts = getCrewCertificates(crew.id)
      
      // Count valid certificates
      const validCertCount = requiredCertIds.filter(certId => {
        const cert = crewCerts.find(c => c.certificateId === certId && c.status === 'VALID')
        return !!cert
      }).length
      
      if (validCertCount === requiredCertIds.length) {
        summary.fullyCompliant++
      } else if (validCertCount > 0) {
        summary.partiallyCompliant++
      } else {
        summary.nonCompliant++
      }
    })
    
    return summary
  }

  // Không còn hàm thêm/gỡ chứng chỉ theo chức danh ở tàu: bảng nối rank_certificates
  // do bờ làm chủ và phát xuống. Tàu chỉ xem để biết chức danh nào cần chứng chỉ gì.

  // Load all crew certificates when crew tab is active - BULK load
  useEffect(() => {
    if (activeTab === 'crew' && crewMembers.length > 0) {
      const onboardCrew = crewMembers.filter(c => c.isOnboard)
      const unloadedIds = onboardCrew
        .filter(crew => !hasCrewCertificatesLoaded(crew.id))
        .map(crew => crew.id)
      
      if (unloadedIds.length > 0) {
        // Single bulk API call instead of N individual calls
        maritimeService.certificates.getCrewCertificatesBulk(unloadedIds)
          .then(grouped => {
            setCrewCertificatesMap(prev => {
              const updated = new Map(prev)
              unloadedIds.forEach(crewId => {
                updated.set(crewId, grouped[crewId] || [])
              })
              return updated
            })
          })
          .catch(err => console.error('Failed to bulk load crew certificates:', err))
      }
    }
  }, [activeTab, crewMembers])

  // Preload rank certificates and crew counts when ranks tab is active
  useEffect(() => {
    if (activeTab === 'ranks' && ranks.length > 0) {
      console.log('🔵 Preloading rank data for collapsed rows...')
      ranks.forEach(async (rank) => {
        // Load rank certificates if not cached
        if (!rankCertsCache.has(rank.id)) {
          try {
            const response = await authFetch(`/api/rank-certificates/rank/${rank.id}`)
            if (response.ok) {
              const data = await response.json()
              setRankCertsCache(prev => new Map(prev).set(rank.id, data))
            }
          } catch (error) {
            console.error(`Failed to preload certificates for rank ${rank.rankCode}:`, error)
          }
        }
        
        // Load crew by rank if not cached
        if (!crewByRankCache.has(rank.id)) {
          const crewList = crewMembers.filter(c => c.rankId === rank.id && c.isOnboard)
          setCrewByRankCache(prev => new Map(prev).set(rank.id, crewList))
        }
      })
      console.log('✅ Rank data preload initiated')
    }
  }, [activeTab, ranks, crewMembers])

  // Reload cached crew certificates AND rank certificates after add/edit actions
  useEffect(() => {
    if (reloadTrigger === 0 || lastReloadTriggerRef.current === reloadTrigger) {
      return
    }

    lastReloadTriggerRef.current = reloadTrigger
    const crewIdsToReload = new Set<string>()

    crewCertificatesMap.forEach((_, crewId) => crewIdsToReload.add(crewId))
    if (expandedRankId && crewByRank.length > 0) {
      crewByRank.forEach(crew => crewIdsToReload.add(crew.id))
    }

    // Also reload rank certificates cache for all cached ranks
    const reloadRankCerts = async () => {
      const rankIds = Array.from(rankCertsCache.keys())
      if (rankIds.length > 0) {
        console.log('🔁 Refreshing rank certificates cache...')
        const rankEntries = await Promise.all(
          rankIds.map(async (rankId) => {
            try {
              const response = await authFetch(`/api/rank-certificates/rank/${rankId}`)
              if (response.ok) {
                const data = await response.json()
                return { rankId, data }
              }
              return { rankId, data: rankCertsCache.get(rankId) || [] }
            } catch {
              return { rankId, data: rankCertsCache.get(rankId) || [] }
            }
          })
        )
        setRankCertsCache(prev => {
          const updated = new Map(prev)
          rankEntries.forEach(({ rankId, data }) => updated.set(rankId, data))
          return updated
        })
        // If expanded rank is in the list, update rankCertificates state too
        if (expandedRankId) {
          const expandedData = rankEntries.find(e => e.rankId === expandedRankId)
          if (expandedData) {
            setRankCertificates(expandedData.data)
          }
        }
        console.log('✅ Rank certificates cache refreshed for', rankIds.length, 'ranks')
      }
    }

    const reloadCrewCerts = async () => {
      const idsArray = Array.from(crewIdsToReload)
      if (idsArray.length === 0) return
      console.log('🔁 Refreshing cached crew certificates after update (bulk)...')
      try {
        const grouped = await maritimeService.certificates.getCrewCertificatesBulk(idsArray)
        setCrewCertificatesMap(prev => {
          const updated = new Map(prev)
          idsArray.forEach(crewId => {
            updated.set(crewId, grouped[crewId] || [])
          })
          return updated
        })
        console.log('✅ Crew certificate cache refreshed for', idsArray.length, 'crew members (bulk)')
      } catch (error) {
        console.error('Failed to bulk reload crew certificates:', error)
      }
    }

    // Reload both in parallel
    Promise.all([reloadCrewCerts(), reloadRankCerts()])
  }, [reloadTrigger])

  const filteredCerts = certificateStats.filter(cert => {
    if (certSearchName && !cert.certificateName?.toLowerCase().includes(certSearchName.toLowerCase())) return false
    if (certSearchCode && !cert.certificateCode?.toLowerCase().includes(certSearchCode.toLowerCase())) return false
    return true
  })
  const certTotalPages = Math.ceil(filteredCerts.length / ITEMS_PER_PAGE)
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
  const endIndex = startIndex + ITEMS_PER_PAGE
  const paginatedCerts = filteredCerts.slice(startIndex, endIndex)

  // Load certificates for a specific crew member
  const loadCrewCertificates = async (crewId: string) => {
    if (hasCrewCertificatesLoaded(crewId)) {
      // Already loaded, just toggle
      setExpandedCrewId(expandedCrewId === crewId ? null : crewId)
      return
    }

    try {
      setLoadingCrewCerts(prev => ({ ...prev, [crewId]: true }))
      const certs = await maritimeService.certificates.getCrewCertificatesByCrewId(crewId)
      setCrewCertificatesFor(crewId, certs)
      // Only expand when user clicks, not when auto-loading
      setExpandedCrewId(crewId)
    } catch (error) {
      console.error('Failed to load crew certificates:', error)
    } finally {
      setLoadingCrewCerts(prev => ({ ...prev, [crewId]: false }))
    }
  }

  // Load certificates in background without expanding
  // Calculate crew certificate stats
  const crewWithCertStats = crewMembers
    .filter(c => c.isOnboard)
    .map(crew => {
      let certs = getCrewCertificates(crew.id)
      
      // Filter by country if selected
      if (selectedCountry !== 'all') {
        certs = certs.filter((cert: any) => {
          return cert.countryId?.toString() === selectedCountry || cert.country?.id?.toString() === selectedCountry
        })
      }
      
      const now = new Date()
      const threeMonthsFromNow = new Date()
      threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3)

      let valid = 0, expiring = 0, expired = 0

      certs.forEach((cert: any) => {
        if (!cert.expiryDate) return
        const expiryDate = new Date(cert.expiryDate)
        if (expiryDate < now) {
          expired++
        } else if (expiryDate < threeMonthsFromNow) {
          expiring++
        } else {
          valid++
        }
      })

      return {
        ...crew,
        totalCerts: certs.length,
        validCount: valid,
        expiringCount: expiring,
        expiredCount: expired,
        // Mark if we have loaded certs for display purposes
        certsLoaded: certs.length > 0
      }
    })

  const filteredCrewCerts = crewWithCertStats.filter(crew => {
    if (crewSearchId && !crew.crewId?.toLowerCase().includes(crewSearchId.toLowerCase())) return false
    if (crewSearchName && !crew.fullName?.toLowerCase().includes(crewSearchName.toLowerCase())) return false
    return true
  })
  const crewCertsTotalPages = Math.ceil(filteredCrewCerts.length / ITEMS_PER_PAGE)
  const crewCertsStartIndex = (crewCertsPage - 1) * ITEMS_PER_PAGE
  const crewCertsEndIndex = crewCertsStartIndex + ITEMS_PER_PAGE
  const paginatedCrewCerts = filteredCrewCerts.slice(crewCertsStartIndex, crewCertsEndIndex)

  const getCertificateStatus = (cert: any) => {
    if (!cert.expiryDate) return { label: t('crew.monitor.na'), color: 'text-gray-500' }
    const now = new Date()
    const expiryDate = new Date(cert.expiryDate)
    const threeMonthsFromNow = new Date()
    threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3)

    if (expiryDate < now) {
      return { label: t('crew.monitor.expired'), color: 'text-red-600 font-semibold' }
    } else if (expiryDate < threeMonthsFromNow) {
      return { label: t('crew.monitor.expiring'), color: 'text-yellow-600 font-semibold' }
    } else {
      return { label: t('crew.monitor.valid'), color: 'text-green-600 font-semibold' }
    }
  }

  // === Rank priority for sorting (highest rank first) ===
  const RANK_PRIORITY: Record<string, number> = {
    'MAST': 1, 'CAPT': 1, 'MASTER': 1,
    'C/O': 2, 'CO': 2,
    '2/O': 3, '2O': 3,
    '3/O': 4, '3O': 4,
    'C/E': 5, 'CE': 5,
    '2/E': 6, '2E': 6,
    '3/E': 7, '3E': 7,
    '4/E': 8, '4E': 8,
    'BOSN': 9, 'BSN': 9,
    'AB': 10,
    'OS': 11, 'O/S': 11,
    'DB': 12, 'D/B': 12,
    'OILR': 13, '#1OLR': 13, 'OLR': 14,
    'WPR': 15, 'WIPER': 15,
    'COOK': 16, 'C/C': 16, 'CC': 16,
    '2/C': 17, '2C': 17,
    'M/M': 18, 'MM': 18, 'MESSMAN': 18,
  }
  const getRankOrder = (rankCode?: string) => {
    if (!rankCode) return 999
    const code = rankCode.toUpperCase()
    return RANK_PRIORITY[code] ?? 500
  }

  // Get selected country name
  const getSelectedCountryName = () => {
    if (selectedCountry === 'all') return t('crew.monitor.allCountries')
    const c = countries.find((ct: any) => ct.id?.toString() === selectedCountry)
    return c?.countryName || selectedCountry
  }

  // === Export Crew Roll to Excel ===
  const exportCrewRollToExcel = async () => {
    try {
      const ExcelJS = await import('exceljs')
      const wb = new ExcelJS.Workbook()
      wb.creator = 'Maritime Edge System'
      wb.created = new Date()

      const countryName = getSelectedCountryName()
      const certs = certificateStats // already filtered by country
      const exportDate = format(new Date(), 'yyyy/MM/dd')

      // Get onboard crew sorted by rank priority
      const onboardCrew = crewMembers
        .filter(c => c.isOnboard)
        .sort((a, b) => getRankOrder(a.rank?.rankCode) - getRankOrder(b.rank?.rankCode))

      // Fixed columns: No, Rank, Name, Nationality = 4 cols
      // Then each cert type = 2 cols (Cert.No, Expire)
      const fixedCols = 4
      const totalCols = fixedCols + certs.length * 2

      const ws = wb.addWorksheet('Crew Roll', {
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
      })

      const thinBorder = {
        top: { style: 'thin' as const }, bottom: { style: 'thin' as const },
        left: { style: 'thin' as const }, right: { style: 'thin' as const }
      }
      const headerFont = { name: 'Times New Roman', size: 10, bold: true }
      const dataFont = { name: 'Times New Roman', size: 10 }
      const centerAlign = { horizontal: 'center' as const, vertical: 'middle' as const }
      const leftAlign = { horizontal: 'left' as const, vertical: 'middle' as const }

      // ===== ROW 1: Title row =====
      let R = 1
      ws.mergeCells(R, 1, R, fixedCols)
      const titleCell = ws.getCell(R, 1)
      titleCell.value = 'Crew Roll for Certificate'
      titleCell.font = { name: 'Times New Roman', size: 14, bold: true }
      titleCell.alignment = leftAlign

      // "Form 1" on the right
      if (totalCols > fixedCols + 2) {
        ws.mergeCells(R, totalCols - 1, R, totalCols)
        const formCell = ws.getCell(R, totalCols - 1)
        formCell.value = '"Form 1"'
        formCell.font = headerFont
        formCell.alignment = { horizontal: 'right', vertical: 'middle' }
      }
      ws.getRow(R).height = 24

      // ===== ROW 2: Vessel / Registry / Date =====
      R++
      // Name of vessel
      ws.mergeCells(R, 1, R, 2)
      ws.getCell(R, 1).value = 'Name of vessel :'
      ws.getCell(R, 1).font = dataFont
      ws.getCell(R, 1).alignment = leftAlign

      // Registry label + country name
      const regLabelCol = Math.max(fixedCols, Math.floor(totalCols * 0.35))
      ws.getCell(R, regLabelCol).value = 'Registry :'
      ws.getCell(R, regLabelCol).font = dataFont
      ws.getCell(R, regLabelCol).alignment = { horizontal: 'right', vertical: 'middle' }
      ws.getCell(R, regLabelCol + 1).value = countryName.toUpperCase()
      ws.getCell(R, regLabelCol + 1).font = { name: 'Times New Roman', size: 12, bold: true }
      ws.getCell(R, regLabelCol + 1).alignment = centerAlign

      // Date on the right
      ws.getCell(R, totalCols - 1).value = 'Date :'
      ws.getCell(R, totalCols - 1).font = dataFont
      ws.getCell(R, totalCols - 1).alignment = { horizontal: 'right', vertical: 'middle' }
      ws.getCell(R, totalCols).value = exportDate
      ws.getCell(R, totalCols).font = { name: 'Times New Roman', size: 10, bold: true }
      ws.getCell(R, totalCols).alignment = centerAlign
      ws.getRow(R).height = 22

      // ===== ROW 3: Column group numbers =====
      R++
      const fixedLabels = ['1-1', '1-2', '1-3', '1-4']
      fixedLabels.forEach((label, i) => {
        ws.getCell(R, i + 1).value = label
        ws.getCell(R, i + 1).font = headerFont
        ws.getCell(R, i + 1).alignment = centerAlign
        ws.getCell(R, i + 1).border = thinBorder
      })
      certs.forEach((_: any, idx: number) => {
        const startCol = fixedCols + 1 + idx * 2
        ws.mergeCells(R, startCol, R, startCol + 1)
        ws.getCell(R, startCol).value = `1-${idx + 5}`
        ws.getCell(R, startCol).font = headerFont
        ws.getCell(R, startCol).alignment = centerAlign
        ws.getCell(R, startCol).border = thinBorder
        ws.getCell(R, startCol + 1).border = thinBorder
      })
      ws.getRow(R).height = 18

      // ===== ROW 4: Column headers + certificate type names (merged vertically 2 rows) =====
      R++
      ws.getCell(R, 1).value = 'No.'
      ws.getCell(R, 1).font = headerFont
      ws.getCell(R, 1).alignment = centerAlign
      ws.getCell(R, 1).border = thinBorder
      ws.mergeCells(R, 1, R + 1, 1)

      ws.getCell(R, 2).value = 'RANK'
      ws.getCell(R, 2).font = headerFont
      ws.getCell(R, 2).alignment = centerAlign
      ws.getCell(R, 2).border = thinBorder
      ws.mergeCells(R, 2, R + 1, 2)

      ws.getCell(R, 3).value = 'FULL NAME'
      ws.getCell(R, 3).font = headerFont
      ws.getCell(R, 3).alignment = centerAlign
      ws.getCell(R, 3).border = thinBorder
      ws.mergeCells(R, 3, R + 1, 3)

      ws.getCell(R, 4).value = 'NATIONALITY'
      ws.getCell(R, 4).font = headerFont
      ws.getCell(R, 4).alignment = centerAlign
      ws.getCell(R, 4).border = thinBorder
      ws.mergeCells(R, 4, R + 1, 4)

      // Certificate type names (merged across 2 rows, spanning 2 cols each)
      certs.forEach((cert: any, idx: number) => {
        const startCol = fixedCols + 1 + idx * 2
        ws.mergeCells(R, startCol, R, startCol + 1)
        const cell = ws.getCell(R, startCol)
        cell.value = cert.certificateName || cert.certificateCode || `Cert ${idx + 1}`
        cell.font = { name: 'Times New Roman', size: 9, bold: true }
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        cell.border = thinBorder
        ws.getCell(R, startCol + 1).border = thinBorder
      })
      ws.getRow(R).height = 28

      // ===== ROW 5: Cert.No / Expire sub-headers =====
      R++
      // Fixed cols already merged from above
      ws.getCell(R, 1).border = thinBorder
      ws.getCell(R, 2).border = thinBorder
      ws.getCell(R, 3).border = thinBorder
      ws.getCell(R, 4).border = thinBorder

      certs.forEach((_cert: any, idx: number) => {
        const startCol = fixedCols + 1 + idx * 2
        ws.getCell(R, startCol).value = 'Cert. No.'
        ws.getCell(R, startCol).font = { name: 'Times New Roman', size: 8, bold: true }
        ws.getCell(R, startCol).alignment = centerAlign
        ws.getCell(R, startCol).border = thinBorder

        ws.getCell(R, startCol + 1).value = 'Expire'
        ws.getCell(R, startCol + 1).font = { name: 'Times New Roman', size: 8, bold: true }
        ws.getCell(R, startCol + 1).alignment = centerAlign
        ws.getCell(R, startCol + 1).border = thinBorder
      })
      ws.getRow(R).height = 18

      // Fill header background
      const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE8E8E8' } }
      for (let hr = 3; hr <= R; hr++) {
        for (let hc = 1; hc <= totalCols; hc++) {
          const cell = ws.getCell(hr, hc)
          if (!cell.fill || !(cell.fill as any).fgColor) {
            cell.fill = headerFill
          }
        }
      }

      // Track max content width per column for autofit
      const colMaxLen: number[] = new Array(totalCols + 1).fill(0)
      // Seed with header label lengths
      colMaxLen[1] = 4   // "No."
      colMaxLen[2] = 6   // "RANK"
      colMaxLen[3] = 10  // "FULL NAME"
      colMaxLen[4] = 13  // "NATIONALITY"
      // Cert header names
      certs.forEach((cert: any, idx: number) => {
        const sc = fixedCols + 1 + idx * 2
        const certNameLen = (cert.certificateName || cert.certificateCode || '').length
        colMaxLen[sc]     = Math.max(colMaxLen[sc]     || 0, Math.ceil(certNameLen / 2), 10) // split across 2 cols
        colMaxLen[sc + 1] = Math.max(colMaxLen[sc + 1] || 0, Math.ceil(certNameLen / 2), 10)
      })

      // ===== DATA ROWS =====
      onboardCrew.forEach((crew, idx) => {
        R++
        const crewCerts = getCrewCertificates(crew.id)

        // No
        ws.getCell(R, 1).value = idx + 1
        ws.getCell(R, 1).font = dataFont
        ws.getCell(R, 1).alignment = centerAlign
        ws.getCell(R, 1).border = thinBorder

        // Rank
        ws.getCell(R, 2).value = crew.rank?.rankCode || ''
        ws.getCell(R, 2).font = dataFont
        ws.getCell(R, 2).alignment = centerAlign
        ws.getCell(R, 2).border = thinBorder

        // Full Name
        ws.getCell(R, 3).value = crew.fullName || ''
        ws.getCell(R, 3).font = dataFont
        ws.getCell(R, 3).alignment = leftAlign
        ws.getCell(R, 3).border = thinBorder

        // Nationality
        ws.getCell(R, 4).value = crew.countryName || ''
        ws.getCell(R, 4).font = dataFont
        ws.getCell(R, 4).alignment = centerAlign
        ws.getCell(R, 4).border = thinBorder

        // Certificate data
        certs.forEach((certType: any, cIdx: number) => {
          const startCol = fixedCols + 1 + cIdx * 2
          const crewCert = crewCerts.find((cc: CrewCertificate) => cc.certificateId === certType.id)

          ws.getCell(R, startCol).value = crewCert?.certificateNumber || ''
          ws.getCell(R, startCol).font = dataFont
          ws.getCell(R, startCol).alignment = centerAlign
          ws.getCell(R, startCol).border = thinBorder

          const expiryVal = crewCert?.expiryDate
            ? format(parseISO(crewCert.expiryDate), 'yyyy/MM/dd')
            : ''
          ws.getCell(R, startCol + 1).value = expiryVal
          ws.getCell(R, startCol + 1).font = dataFont
          ws.getCell(R, startCol + 1).alignment = centerAlign
          ws.getCell(R, startCol + 1).border = thinBorder

          // Highlight expired in red
          if (crewCert?.expiryDate && new Date(crewCert.expiryDate) < new Date()) {
            ws.getCell(R, startCol).font = { ...dataFont, color: { argb: 'FFFF0000' } }
            ws.getCell(R, startCol + 1).font = { ...dataFont, color: { argb: 'FFFF0000' } }
          }
        })

        ws.getRow(R).height = 20

        // Track content widths for autofit
        colMaxLen[2] = Math.max(colMaxLen[2] || 0, (crew.rank?.rankCode || '').length)
        colMaxLen[3] = Math.max(colMaxLen[3] || 0, (crew.fullName || '').length)
        colMaxLen[4] = Math.max(colMaxLen[4] || 0, (crew.countryName || '').length)
        certs.forEach((certType: any, cIdx: number) => {
          const sc = fixedCols + 1 + cIdx * 2
          const cc = crewCerts.find((c: CrewCertificate) => c.certificateId === certType.id)
          colMaxLen[sc] = Math.max(colMaxLen[sc] || 0, (cc?.certificateNumber || '').length)
          colMaxLen[sc + 1] = Math.max(colMaxLen[sc + 1] || 0, 10) // date length
        })
      })

      // Autofit columns based on content
      ws.getColumn(1).width = 5 // No
      for (let c = 2; c <= totalCols; c++) {
        const contentW = (colMaxLen[c] || 8) * 1.2 + 2
        ws.getColumn(c).width = Math.max(contentW, c <= fixedCols ? 10 : 14)
      }

      // Set minimum row height for all rows
      for (let r = 1; r <= R; r++) {
        const row = ws.getRow(r)
        if (!row.height || row.height < 18) row.height = 18
      }

      // Export file
      const buf = await wb.xlsx.writeBuffer()
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Crew_Roll_Certificate_${countryName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.xlsx`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(t('crew.monitor.excelExportSuccess'))
    } catch (error) {
      console.error('Failed to export Excel:', error)
      toast.error(t('crew.monitor.excelExportFailed'))
    }
  }

  // === Export Crew Roll to PDF ===
  const exportCrewRollToPDF = () => {
    try {
      const countryName = getSelectedCountryName()
      const certs = certificateStats
      const exportDate = format(new Date(), 'yyyy/MM/dd')

      const onboardCrew = crewMembers
        .filter(c => c.isOnboard)
        .sort((a, b) => getRankOrder(a.rank?.rankCode) - getRankOrder(b.rank?.rankCode))

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pageW = doc.internal.pageSize.getWidth()

      // Title
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.text('Crew Roll for Certificate', 14, 15)

      doc.setFontSize(9)
      doc.text(`Registry: ${countryName.toUpperCase()}`, 14, 22)
      doc.text(`Date: ${exportDate}`, pageW - 14, 22, { align: 'right' })

      // Build columns: No, Rank, Name, Nationality, [Cert.No, Expire] x N
      const head: any[][] = [[], []]
      // First header row
      head[0].push({ content: 'No', rowSpan: 2, styles: { halign: 'center', valign: 'middle', fontSize: 7, fontStyle: 'bold' } })
      head[0].push({ content: 'Rank', rowSpan: 2, styles: { halign: 'center', valign: 'middle', fontSize: 7, fontStyle: 'bold' } })
      head[0].push({ content: 'Full Name', rowSpan: 2, styles: { halign: 'center', valign: 'middle', fontSize: 7, fontStyle: 'bold' } })
      head[0].push({ content: 'Nationality', rowSpan: 2, styles: { halign: 'center', valign: 'middle', fontSize: 7, fontStyle: 'bold' } })

      certs.forEach((cert: any) => {
        head[0].push({
          content: cert.certificateName || cert.certificateCode || 'Cert',
          colSpan: 2,
          styles: { halign: 'center', valign: 'middle', fontSize: 6, fontStyle: 'bold' }
        })
      })

      // Second header row (sub-headers for certs)
      certs.forEach(() => {
        head[1].push({ content: 'Cert.No', styles: { halign: 'center', fontSize: 6, fontStyle: 'bold' } })
        head[1].push({ content: 'Expire', styles: { halign: 'center', fontSize: 6, fontStyle: 'bold' } })
      })

      // Body
      const body: any[][] = onboardCrew.map((crew, idx) => {
        const crewCerts = getCrewCertificates(crew.id)
        const row: any[] = [
          idx + 1,
          crew.rank?.rankCode || '',
          crew.fullName || '',
          crew.countryName || '',
        ]
        certs.forEach((certType: any) => {
          const cc = crewCerts.find((c: CrewCertificate) => c.certificateId === certType.id)
          row.push(cc?.certificateNumber || '')
          row.push(cc?.expiryDate ? format(parseISO(cc.expiryDate), 'yyyy/MM/dd') : '')
        })
        return row
      })

      // Column widths
      const fixedW = [8, 12, 35, 18]
      const remaining = pageW - 28 - fixedW.reduce((s, w) => s + w, 0) // 14mm margin each side
      const certColW = certs.length > 0 ? remaining / (certs.length * 2) : 10
      const colStyles: Record<number, any> = {}
      fixedW.forEach((w, i) => { colStyles[i] = { cellWidth: w } })
      for (let i = 0; i < certs.length * 2; i++) {
        colStyles[fixedW.length + i] = { cellWidth: certColW }
      }

      ;(doc as any).autoTable({
        startY: 26,
        head,
        body,
        theme: 'grid',
        styles: {
          font: 'helvetica',
          fontSize: 7,
          cellPadding: 1.5,
          lineWidth: 0.2,
          lineColor: [0, 0, 0],
          valign: 'middle',
        },
        headStyles: {
          fillColor: [220, 220, 220],
          textColor: [0, 0, 0],
          fontStyle: 'bold',
        },
        columnStyles: colStyles,
        didParseCell: (data: any) => {
          // Highlight expired dates in red
          if (data.section === 'body' && data.column.index >= fixedW.length) {
            const colOffset = data.column.index - fixedW.length
            if (colOffset % 2 === 1) { // expire column
              const val = data.cell.raw
              if (val && new Date(val.replace(/\//g, '-')) < new Date()) {
                data.cell.styles.textColor = [255, 0, 0]
              }
            }
          }
        }
      })

      doc.save(`Crew_Roll_Certificate_${countryName.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`)
      toast.success(t('crew.monitor.pdfExportSuccess'))
    } catch (error) {
      console.error('Failed to export PDF:', error)
      toast.error(t('crew.monitor.pdfExportFailed'))
    }
  }

  if (certificateLoading && !certificateCache) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="ml-3 text-gray-600">{t('crew.monitor.loadingCertificates')}</p>
      </div>
    )
  }

  // ===================== RENDER =====================
  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-white">
      {/* === HEADER ROW 1: Title + actions === */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">≡ {t('crew.monitor.title')}</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700">
            {crewWithCertStats.length} {t('crew.monitor.totalCrew')}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-gray-100 text-gray-600">
            {certificateStats.length} {t('crew.monitor.totalCerts')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedCountry}
            onChange={(e) => {
              setSelectedCountry(e.target.value)
              localStorage.setItem('crewPage_selectedCountry', e.target.value)
            }}
            className="px-3 py-1.5 text-xs border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="all">{t('crew.monitor.allCountries')}</option>
            {countries.map(country => (
              <option key={country.id} value={country.id}>{country.countryName}</option>
            ))}
          </select>
          {activeTab === 'certTypes' && selectedCountry !== 'all' && (
            <>
              <button
                onClick={exportCrewRollToExcel}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-white text-gray-600 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                title={t('crew.monitor.exportExcelTitle')}
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={exportCrewRollToPDF}
                className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-white text-red-600 border border-red-300 rounded hover:bg-red-50 transition-colors"
                title={t('crew.monitor.exportPdfTitle')}
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {/* Đã bỏ nút "Thêm CC": loại chứng chỉ là danh mục của bờ, tàu chỉ được xem.
              Tạo dưới tàu sẽ lệch với danh mục gốc và bị ghi đè ở lần đồng bộ sau. */}
          <button
            onClick={handleReloadCertificates}
            className="p-1.5 border border-gray-300 rounded text-gray-500 hover:bg-gray-50"
            title={t('crew.monitor.refreshTitle')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${certificateLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* === HEADER ROW 2: Tab bar === */}
      <div className="flex items-center gap-1 px-4 border-b border-gray-200 flex-shrink-0 bg-white">
        {([
          { key: 'crew' as const, label: `${t('crew.monitor.crewCertificates')} (${crewWithCertStats.length})`, icon: Users },
          { key: 'certTypes' as const, label: `${t('crew.monitor.certificateTypes')} (${certificateStats.length})`, icon: FileText },
          { key: 'ranks' as const, label: `${t('crew.monitor.rankCertificates')} (${ranks.length})`, icon: Shield },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative flex items-center gap-1.5 px-4 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* === MAIN CONTENT === */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ============ TAB: CREW CERTIFICATES ============ */}
        {activeTab === 'crew' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto">
              <table className="min-w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-blue-50">
                    <th className="w-52 px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-r border-gray-200 relative">
                      <div className="flex items-center justify-between">
                        {t('crew.table.crewId')}
                        <SortDropdown col="crewId" options={[{label:'A → Z', dir:'asc'},{label:'Z → A', dir:'desc'}]} />
                      </div>
                    </th>
                    <th className="min-w-[200px] px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-r border-gray-200 relative">
                      <div className="flex items-center justify-between">
                        {t('crew.table.name')}
                        <SortDropdown col="fullName" options={[{label:'A → Z', dir:'asc'},{label:'Z → A', dir:'desc'}]} />
                      </div>
                    </th>
                    <th className="w-44 px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-r border-gray-200 relative">
                      <div className="flex items-center justify-between">
                        {t('crew.table.rank')}
                        <SortDropdown col="position" options={[{label:'A → Z', dir:'asc'},{label:'Z → A', dir:'desc'}]} />
                      </div>
                    </th>
                    <th className="w-36 px-3 py-2 text-center text-xs font-semibold text-gray-600 border-b border-r border-gray-200 relative">
                      <div className="flex items-center justify-center">
                        {t('crew.monitor.totalCerts')}
                        <SortDropdown col="totalCerts" options={[{label:t('crew.monitor.ascending'), dir:'asc'},{label:t('crew.monitor.descending'), dir:'desc'}]} />
                      </div>
                    </th>
                    <th className="w-96 px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-gray-200">
                      {t('crew.table.status')}
                    </th>
                  </tr>
                  {/* Search row */}
                  <tr className="bg-white border-b border-gray-200">
                    <th className="px-2 py-1.5 border-r border-gray-200">
                      <div className="flex items-center border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                        <Search className="w-3 h-3 text-gray-400 mr-1 flex-shrink-0" />
                        <input type="text" value={crewSearchId} onChange={e => { setCrewSearchId(e.target.value); setCrewCertsPage(1) }} placeholder={t('crew.monitor.search')} className="w-full text-xs outline-none bg-transparent" />
                      </div>
                    </th>
                    <th className="px-2 py-1.5 border-r border-gray-200">
                      <div className="flex items-center border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                        <Search className="w-3 h-3 text-gray-400 mr-1 flex-shrink-0" />
                        <input type="text" value={crewSearchName} onChange={e => { setCrewSearchName(e.target.value); setCrewCertsPage(1) }} placeholder={t('crew.monitor.search')} className="w-full text-xs outline-none bg-transparent" />
                      </div>
                    </th>
                    <th className="px-2 py-1.5 border-r border-gray-200"></th>
                    <th className="px-2 py-1.5 border-r border-gray-200"></th>
                    <th className="px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {paginatedCrewCerts.map((crew, idx) => {
                    const crewCerts = getCrewCertificates(crew.id)
                    const isLoaded = hasCrewCertificatesLoaded(crew.id)
                    return (
                      <React.Fragment key={crew.id}>
                        <tr
                          onClick={() => loadCrewCertificates(crew.id)}
                          onContextMenu={(e) => handleCrewContextMenu(e, crew)}
                          className={`cursor-pointer hover:bg-blue-50 transition-colors ${expandedCrewId === crew.id ? 'bg-blue-50' : idx % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'}`}
                        >
                          <td className="w-32 px-3 py-2 text-xs text-gray-900 border-r border-gray-200">
                            <div className="truncate flex items-center gap-2">
                              <span className={`text-xs transition-transform ${expandedCrewId === crew.id ? 'rotate-90' : ''}`}>▶</span>
                              {crew.crewId}
                            </div>
                          </td>
                          <td className="min-w-[200px] px-3 py-2 text-xs text-gray-900 border-r border-gray-200">
                            <div className="truncate">{crew.fullName}</div>
                          </td>
                          <td className="w-44 px-3 py-2 text-xs text-gray-900 border-r border-gray-200">
                            <div className="truncate">{crew.rank?.rankName || '-'}</div>
                          </td>
                          <td className="w-20 px-3 py-2 text-xs text-gray-700 text-center border-r border-gray-200">
                            {isLoaded ? crew.totalCerts : '-'}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {isLoaded ? (
                              <div className="flex gap-2">
                                <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-800">{crew.validCount} {t('crew.monitor.valid')}</span>
                                <span className="px-2 py-0.5 text-xs rounded bg-yellow-100 text-yellow-800">{crew.expiringCount} {t('crew.monitor.expiring')}</span>
                                <span className="px-2 py-0.5 text-xs rounded bg-red-100 text-red-800">{crew.expiredCount} {t('crew.monitor.expired')}</span>
                              </div>
                            ) : (
                              <span className="text-gray-400 italic text-xs">{t('crew.monitor.clickToLoad')}</span>
                            )}
                          </td>
                        </tr>
                        {/* Expanded row showing crew certificates */}
                        {expandedCrewId === crew.id && (
                          <tr>
                            <td colSpan={5} className="px-4 py-2 bg-gray-50">
                              {loadingCrewCerts[crew.id] ? (
                                <div className="text-center py-4">
                                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                                  <p className="text-gray-600 text-sm mt-2">{t('crew.monitor.loadingCerts')}</p>
                                </div>
                              ) : isLoaded && crewCerts.length > 0 ? (
                                <div className="overflow-x-auto">
                                  <table className="w-full border border-gray-300 rounded text-xs">
                                    <thead className="bg-gray-100">
                                      <tr>
                                        <th className="px-3 py-2 text-left font-medium text-gray-600 border-r border-gray-300">{t('crew.monitor.certNameHeader')}</th>
                                        <th className="px-3 py-2 text-left font-medium text-gray-600 border-r border-gray-300">{t('crew.monitor.cocHeader')}</th>
                                        <th className="px-3 py-2 text-left font-medium text-gray-600 border-r border-gray-300">{t('crew.monitor.countryHeader')}</th>
                                        <th className="px-3 py-2 text-left font-medium text-gray-600 border-r border-gray-300">{t('crew.monitor.certNumberHeader')}</th>
                                        <th className="px-3 py-2 text-left font-medium text-gray-600 border-r border-gray-300">{t('crew.monitor.issueDateHeader')}</th>
                                        <th className="px-3 py-2 text-left font-medium text-gray-600 border-r border-gray-300">{t('crew.monitor.expiryDateHeader')}</th>
                                        <th className="px-3 py-2 text-left font-medium text-gray-600 border-r border-gray-300">{t('crew.monitor.issuingAuthorityHeader')}</th>
                                        <th className="px-3 py-2 text-left font-medium text-gray-600">{t('crew.monitor.statusHeader')}</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {crewCerts
                                        .slice()
                                        .filter((cert: any) => {
                                          if (selectedCountry === 'all') return true
                                          return cert.countryId?.toString() === selectedCountry || cert.country?.id?.toString() === selectedCountry
                                        })
                                        .sort((a: any, b: any) => {
                                          const getStatusPriority = (cert: any) => {
                                            if (!cert.expiryDate) return 4
                                            const now = new Date()
                                            const expiryDate = new Date(cert.expiryDate)
                                            const threeMonthsFromNow = new Date()
                                            threeMonthsFromNow.setMonth(threeMonthsFromNow.getMonth() + 3)
                                            if (expiryDate < now) return 1
                                            if (expiryDate < threeMonthsFromNow) return 2
                                            return 3
                                          }
                                          return getStatusPriority(a) - getStatusPriority(b)
                                        })
                                        .map((cert: any, idx: number) => {
                                          const status = getCertificateStatus(cert)
                                          return (
                                            <tr key={idx} className="border-t border-gray-200 hover:bg-white">
                                              <td className="px-3 py-1.5 text-gray-900 border-r border-gray-200 truncate">{cert.certificate?.certificateName || cert.Certificate?.CertificateName || t('crew.monitor.na')}</td>
                                              <td className="px-3 py-1.5 border-r border-gray-200">
                                                {cert.certificateOfCompetency ? (
                                                  <span className={`px-2 py-0.5 font-medium rounded ${cert.certificateOfCompetency === 'National' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                                                    {cert.certificateOfCompetency}
                                                  </span>
                                                ) : <span className="text-gray-400">-</span>}
                                              </td>
                                              <td className="px-3 py-1.5 text-gray-700 border-r border-gray-200 truncate">{cert.country?.countryName || cert.countryName || t('crew.monitor.na')}</td>
                                              <td className="px-3 py-1.5 text-gray-700 border-r border-gray-200 truncate">{cert.certificateNumber || t('crew.monitor.na')}</td>
                                              <td className="px-3 py-1.5 text-gray-700 border-r border-gray-200">{cert.issueDate ? format(parseISO(cert.issueDate), 'dd MMM yyyy') : 'N/A'}</td>
                                              <td className="px-3 py-1.5 text-gray-700 border-r border-gray-200">{cert.expiryDate ? format(parseISO(cert.expiryDate), 'dd MMM yyyy') : 'N/A'}</td>
                                              <td className="px-3 py-1.5 text-gray-700 border-r border-gray-200 truncate">{cert.issuingAuthority || t('crew.monitor.na')}</td>
                                              <td className="px-3 py-1.5"><span className={status.color}>{status.label}</span></td>
                                            </tr>
                                          )
                                        })}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="text-center py-4 text-sm text-gray-500">{t('crew.monitor.noCertsForCrew')}</div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {crewCertsTotalPages > 1 && (
              <div className="flex-shrink-0 bg-gray-50 px-4 py-2.5 flex items-center justify-between border-t border-gray-200">
                <div className="text-xs text-gray-600">
                  {t('crew.monitor.showingRange', { start: crewCertsStartIndex + 1, end: Math.min(crewCertsEndIndex, filteredCrewCerts.length), total: filteredCrewCerts.length })}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setCrewCertsPage(Math.max(1, crewCertsPage - 1))} disabled={crewCertsPage === 1}
                    className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed">{t('crew.table.previous')}</button>
                  <span className="text-xs text-gray-600">{t('crew.monitor.pageInfo', { current: crewCertsPage, total: crewCertsTotalPages })}</span>
                  <button onClick={() => setCrewCertsPage(Math.min(crewCertsTotalPages, crewCertsPage + 1))} disabled={crewCertsPage === crewCertsTotalPages}
                    className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed">{t('crew.table.next')}</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============ TAB: CERTIFICATE TYPES ============ */}
        {activeTab === 'certTypes' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto">
              <table className="min-w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-blue-50">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-r border-gray-200 relative" style={{width: '25%'}}>
                      <div className="flex items-center justify-between">
                        {t('crew.monitor.certName')}
                        <SortDropdown col="certificateName" options={[{label:'A → Z', dir:'asc'},{label:'Z → A', dir:'desc'}]} />
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-r border-gray-200 relative" style={{width: '15%'}}>
                      <div className="flex items-center justify-between">
                        {t('crew.monitor.code')}
                        <SortDropdown col="certificateCode" options={[{label:'A → Z', dir:'asc'},{label:'Z → A', dir:'desc'}]} />
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-r border-gray-200 relative" style={{width: '12%'}}>
                      <div className="flex items-center justify-between">
                        {t('crew.monitor.category')}
                        <SortDropdown col="category" options={[{label:'A → Z', dir:'asc'},{label:'Z → A', dir:'desc'}]} />
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-r border-gray-200 relative" style={{width: '10%'}}>
                      <div className="flex items-center justify-between">
                        {t('crew.monitor.validity')}
                        <SortDropdown col="validity" options={[{label:t('crew.monitor.ascending'), dir:'asc'},{label:t('crew.monitor.descending'), dir:'desc'}]} />
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-r border-gray-200 relative" style={{width: '10%'}}>
                      <div className="flex items-center justify-between">
                        {t('crew.monitor.totalCrew')}
                        <SortDropdown col="totalCrew" options={[{label:t('crew.monitor.ascending'), dir:'asc'},{label:t('crew.monitor.descending'), dir:'desc'}]} />
                      </div>
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-gray-200" style={{width: '28%'}}>
                      {t('crew.table.status')}
                    </th>
                  </tr>
                  {/* Search row */}
                  <tr className="bg-white border-b border-gray-200">
                    <th className="px-2 py-1.5 border-r border-gray-200">
                      <div className="flex items-center border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                        <Search className="w-3 h-3 text-gray-400 mr-1 flex-shrink-0" />
                        <input type="text" value={certSearchName} onChange={e => { setCertSearchName(e.target.value); setCurrentPage(1) }} placeholder={t('crew.monitor.search')} className="w-full text-xs outline-none bg-transparent" />
                      </div>
                    </th>
                    <th className="px-2 py-1.5 border-r border-gray-200">
                      <div className="flex items-center border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                        <Search className="w-3 h-3 text-gray-400 mr-1 flex-shrink-0" />
                        <input type="text" value={certSearchCode} onChange={e => { setCertSearchCode(e.target.value); setCurrentPage(1) }} placeholder={t('crew.monitor.search')} className="w-full text-xs outline-none bg-transparent" />
                      </div>
                    </th>
                    <th className="px-2 py-1.5 border-r border-gray-200"></th>
                    <th className="px-2 py-1.5 border-r border-gray-200"></th>
                    <th className="px-2 py-1.5 border-r border-gray-200"></th>
                    <th className="px-2 py-1.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {/* Main country certs */}
                  {paginatedCerts.map((cert, idx) => (
                    <tr
                      key={cert.id}
                      onContextMenu={(e) => handleContextMenu(e, cert)}
                      className={`cursor-pointer hover:bg-blue-50 transition-colors ${selectedCert === cert.id ? 'bg-blue-50' : idx % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'}`}
                    >
                      <td className="px-3 py-2 text-xs text-gray-900 border-r border-gray-200"><div className="truncate">{cert.certificateName}</div></td>
                      <td className="px-3 py-2 text-xs text-gray-900 border-r border-gray-200"><div className="truncate">{cert.certificateCode}</div></td>
                      <td className="px-3 py-2 text-xs border-r border-gray-200">{getCategoryBadge(cert.category)}</td>
                      <td className="px-3 py-2 text-xs text-gray-700 border-r border-gray-200"><div className="truncate">{cert.validityPeriodMonths}m</div></td>
                      <td className="px-3 py-2 text-xs text-gray-700 border-r border-gray-200"><div className="truncate">{cert.totalCrew}</div></td>
                      <td className="px-3 py-2 text-xs">
                        <div className="flex gap-2">
                          <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-800">{cert.validCount || 0} {t('crew.monitor.valid')}</span>
                          <span className="px-2 py-0.5 text-xs rounded bg-yellow-100 text-yellow-800">{cert.expiringCount || 0} {t('crew.monitor.expiring')}</span>
                          <span className="px-2 py-0.5 text-xs rounded bg-red-100 text-red-800">{cert.expiredCount || 0} {t('crew.monitor.expired')}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {/* Other countries separator + certs */}
                  {selectedCountry !== 'all' && otherCertificateStats.length > 0 && (
                    <>
                      <tr>
                        <td colSpan={6} className="px-4 py-2 bg-orange-50 border-y border-orange-200">
                          <span className="text-xs font-semibold text-orange-700 uppercase">{t('crew.monitor.otherCountries')} ({otherCertificateStats.length})</span>
                        </td>
                      </tr>
                      {otherCertificateStats.slice(0, ITEMS_PER_PAGE).map((cert, idx) => (
                        <tr
                          key={`other-${cert.id}`}
                          onContextMenu={(e) => handleContextMenu(e, cert)}
                          className={`cursor-pointer hover:bg-blue-50 transition-colors ${selectedCert === cert.id ? 'bg-blue-50' : idx % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'}`}
                        >
                          <td className="px-3 py-2 text-xs text-gray-900 border-r border-gray-200"><div className="truncate">{cert.certificateName}</div></td>
                          <td className="px-3 py-2 text-xs text-gray-900 border-r border-gray-200"><div className="truncate">{cert.certificateCode}</div></td>
                          <td className="px-3 py-2 text-xs border-r border-gray-200">{getCategoryBadge(cert.category)}</td>
                          <td className="px-3 py-2 text-xs text-gray-700 border-r border-gray-200"><div className="truncate">{cert.validityPeriodMonths ? `${cert.validityPeriodMonths}m` : 'N/A'}</div></td>
                          <td className="px-3 py-2 text-xs text-gray-700 border-r border-gray-200"><div className="truncate">{cert.totalCrew || 0}</div></td>
                          <td className="px-3 py-2 text-xs">
                            <div className="flex gap-2">
                              <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-800">{cert.validCount || 0} {t('crew.monitor.valid')}</span>
                              <span className="px-2 py-0.5 text-xs rounded bg-yellow-100 text-yellow-800">{cert.expiringCount || 0} {t('crew.monitor.expiring')}</span>
                              <span className="px-2 py-0.5 text-xs rounded bg-red-100 text-red-800">{cert.expiredCount || 0} {t('crew.monitor.expired')}</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </>
                  )}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {certTotalPages > 1 && (
              <div className="flex-shrink-0 bg-gray-50 px-4 py-2.5 flex items-center justify-between border-t border-gray-200">
                <div className="text-xs text-gray-600">
                  {t('crew.monitor.showingRange', { start: startIndex + 1, end: Math.min(endIndex, filteredCerts.length), total: filteredCerts.length })}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1}
                    className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed">{t('crew.table.previous')}</button>
                  <span className="text-xs text-gray-600">{t('crew.monitor.pageInfo', { current: currentPage, total: certTotalPages })}</span>
                  <button onClick={() => setCurrentPage(Math.min(certTotalPages, currentPage + 1))} disabled={currentPage === certTotalPages}
                    className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed">{t('crew.table.next')}</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ============ TAB: RANK CERTIFICATES ============ */}
        {activeTab === 'ranks' && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-shrink-0 px-4 py-2 text-xs text-blue-800 bg-blue-50 border-b border-blue-100">
              {t('crew.monitor.rankRequirementsManagedOnShore')}
            </div>
            <div className="flex-1 overflow-auto">
              <table className="min-w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-blue-50">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-r border-gray-200" style={{width: '20%'}}>
                      {t('crew.monitor.rankCode')}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-r border-gray-200" style={{width: '25%'}}>
                      {t('crew.monitor.rankName')}
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 border-b border-r border-gray-200" style={{width: '15%'}}>
                      {t('crew.monitor.requiredCerts')}
                    </th>
                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-600 border-b border-r border-gray-200" style={{width: '10%'}}>
                      {t('crew.monitor.crewCount')}
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-gray-200" style={{width: '30%'}}>
                      {t('crew.monitor.compliance')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {ranks.map((rank, idx) => {
                    const rCerts = rankCertsCache.get(rank.id) || []
                    const crewList = crewByRankCache.get(rank.id) || []
                    const hasData = crewList.length > 0 && rCerts.length > 0
                    const compliance = hasData ? getComplianceSummary(rank.id) : { fullyCompliant: 0, partiallyCompliant: 0, nonCompliant: 0 }

                    return (
                      <React.Fragment key={rank.id}>
                        <tr
                          onClick={() => handleRankClick(rank.id)}
                          className={`cursor-pointer hover:bg-blue-50 transition-colors ${expandedRankId === rank.id ? 'bg-blue-50' : idx % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'}`}
                        >
                          <td className="px-3 py-2 text-xs text-gray-900 border-r border-gray-200">
                            <div className="truncate flex items-center gap-2">
                              <span className={`text-xs transition-transform ${expandedRankId === rank.id ? 'rotate-90' : ''}`}>▶</span>
                              {rank.rankCode}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-900 border-r border-gray-200"><div className="truncate">{rank.rankName}</div></td>
                          <td className="px-3 py-2 text-xs text-gray-700 text-center border-r border-gray-200">{rCerts.length > 0 ? rCerts.length : '-'}</td>
                          <td className="px-3 py-2 text-xs text-gray-700 text-center border-r border-gray-200">{crewList.length > 0 ? crewList.length : '-'}</td>
                          <td className="px-3 py-2 text-xs">
                            {hasData ? (
                              <div className="flex gap-2">
                                <span className="px-2 py-0.5 text-xs rounded bg-green-100 text-green-800">{compliance.fullyCompliant} {t('crew.monitor.compliant')}</span>
                                <span className="px-2 py-0.5 text-xs rounded bg-yellow-100 text-yellow-800">{compliance.partiallyCompliant} {t('crew.monitor.partial')}</span>
                                <span className="px-2 py-0.5 text-xs rounded bg-red-100 text-red-800">{compliance.nonCompliant} {t('crew.monitor.missing')}</span>
                              </div>
                            ) : (
                              <span className="text-gray-400 italic text-xs">{t('crew.monitor.clickToLoad')}</span>
                            )}
                          </td>
                        </tr>
                        {/* Expanded row */}
                        {expandedRankId === rank.id && (
                          <tr>
                            <td colSpan={5} className="px-4 py-2 bg-gray-50">
                              {loadingRankCerts ? (
                                <div className="text-center py-4">
                                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                                  <p className="text-gray-600 text-sm mt-2">{t('crew.monitor.loadingRequirements')}</p>
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  {/* Required Certificates */}
                                  <div className="border border-gray-300 rounded">
                                    <div className="bg-gray-100 px-3 py-2 border-b border-gray-300">
                                      <h5 className="text-xs font-semibold text-gray-700 uppercase">{t('crew.monitor.requiredCertificatesTitle')} ({rankCertificates.length})</h5>
                                    </div>
                                    <div className="p-3">
                                      {rankCertificates.length > 0 ? (
                                        <div className="space-y-2">
                                          {rankCertificates.map((rc) => (
                                            <div key={rc.id} className="flex items-center justify-between p-2 bg-white rounded border border-gray-200 text-xs">
                                              <div className="flex-1">
                                                <div className="font-medium text-gray-900">{rc.certificate?.certificateName}</div>
                                                <div className="text-gray-500">{rc.certificate?.certificateCode} • {rc.certificate?.category}{rc.certificate?.validityPeriodMonths && ` • ${rc.certificate.validityPeriodMonths}m`}</div>
                                              </div>
                                              {crewByRank.length > 0 && (
                                                <div className="ml-4 text-xs">
                                                  <span className="font-medium text-green-600">
                                                    {crewByRank.filter(c => crewHasCertificate(c.id, rc.certificateId).has && crewHasCertificate(c.id, rc.certificateId).status === 'VALID').length}
                                                  </span>
                                                  <span className="text-gray-500"> / {crewByRank.length}</span>
                                                </div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="text-center py-3 text-gray-500 text-xs">{t('crew.monitor.noCertsRequired')}</div>
                                      )}
                                      {/* Danh sách chứng chỉ bắt buộc theo chức danh do bờ quản lý — tàu chỉ xem. */}
                                    </div>
                                  </div>
                                  {/* Crew Compliance List */}
                                  {crewByRank.length > 0 && rankCertificates.length > 0 && (
                                    <div className="border border-gray-300 rounded">
                                      <div className="bg-gray-100 px-3 py-2 border-b border-gray-300 flex items-center justify-between">
                                        <h5 className="text-xs font-semibold text-gray-700 uppercase">{t('crew.monitor.crewMembersTitle')} ({crewByRank.length})</h5>
                                        <span className="text-xs text-gray-500 italic">{t('crew.monitor.clickToViewCerts')}</span>
                                      </div>
                                      <div className="divide-y divide-gray-200">
                                        {crewByRank.map((crew) => {
                                          const requiredCertIds = rankCertificates.map(rc => rc.certificateId)
                                          const crewCrts = getCrewCertificates(crew.id)
                                          const validCertCount = requiredCertIds.filter(certId => crewCrts.find(c => c.certificateId === certId && c.status === 'VALID')).length
                                          const totalRequired = requiredCertIds.length
                                          const isExpanded = expandedRankCrewId === crew.id
                                          return (
                                            <div key={`${crew.id}-${reloadTrigger}`} className="bg-white">
                                              <div
                                                onClick={() => setExpandedRankCrewId(isExpanded ? null : crew.id)}
                                                onContextMenu={(e) => handleCrewContextMenu(e, crew)}
                                                className="px-3 py-2 hover:bg-gray-50 cursor-pointer flex items-center justify-between"
                                              >
                                                <div className="flex items-center gap-3 flex-1">
                                                  <span className={`text-xs transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                                                  <div>
                                                    <div className="text-sm font-medium text-gray-900">{crew.fullName}</div>
                                                    <div className="text-xs text-gray-500">{crew.crewId}</div>
                                                  </div>
                                                </div>
                                                <div className="text-xs">
                                                  {validCertCount === totalRequired ? (
                                                    <span className="px-2 py-1 rounded-full font-medium bg-green-100 text-green-800">{validCertCount}/{totalRequired} {t('crew.monitor.compliant')}</span>
                                                  ) : validCertCount > 0 ? (
                                                    <span className="px-2 py-1 rounded-full font-medium bg-yellow-100 text-yellow-800">{validCertCount}/{totalRequired} {t('crew.monitor.partial')}</span>
                                                  ) : (
                                                    <span className="px-2 py-1 rounded-full font-medium bg-red-100 text-red-800">0/{totalRequired} {t('crew.monitor.missing')}</span>
                                                  )}
                                                </div>
                                              </div>
                                              {isExpanded && (
                                                <div className="px-3 py-2 bg-gray-50 border-t border-gray-200">
                                                  <div className="space-y-2">
                                                    {rankCertificates.map((rc) => {
                                                      const certStatus = crewHasCertificate(crew.id, rc.certificateId)
                                                      return (
                                                        <div key={rc.id}
                                                          className="flex items-center justify-between p-2 bg-white rounded border border-gray-200 text-xs cursor-context-menu hover:bg-gray-50 transition-colors"
                                                          onContextMenu={(e) => {
                                                            e.preventDefault(); e.stopPropagation()
                                                            setCertIconMenu({ x: e.clientX, y: e.clientY, crewId: crew.id, crewName: crew.fullName, certificateId: rc.certificateId, certName: rc.certificate?.certificateName || '', certCode: rc.certificate?.certificateCode || '', has: certStatus.has })
                                                            setContextMenu(null); setCrewContextMenu(null)
                                                          }}
                                                          title={t('crew.monitor.rightClickHint')}
                                                        >
                                                          <div className="flex-1">
                                                            <div className="font-medium text-gray-900">{rc.certificate?.certificateName}</div>
                                                            <div className="text-gray-500">{rc.certificate?.certificateCode}</div>
                                                          </div>
                                                          <div className="ml-4 flex items-center gap-2">
                                                            {certStatus.has ? (
                                                              certStatus.status === 'VALID' ? (
                                                                <><span className="text-green-600 text-lg">✓</span>{certStatus.expiryDate && <span className="text-gray-500">{t('crew.monitor.expPrefix')} {format(parseISO(certStatus.expiryDate), 'dd/MM/yyyy')}</span>}</>
                                                              ) : certStatus.status === 'EXPIRED' ? (
                                                                <><span className="text-red-600 text-lg">✗</span><span className="text-red-600">{t('crew.monitor.expired')}</span></>
                                                              ) : (
                                                                <><span className="text-yellow-600 text-lg">⚠</span><span className="text-yellow-600">{t('crew.monitor.suspended')}</span></>
                                                              )
                                                            ) : (
                                                              <><span className="text-gray-300 text-lg">—</span><span className="text-gray-500">{t('crew.monitor.notHeld')}</span></>
                                                            )}
                                                          </div>
                                                        </div>
                                                      )
                                                    })}
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          )
                                        })}
                                      </div>
                                    </div>
                                  )}
                                  {crewByRank.length === 0 && (
                                    <div className="text-center py-4 text-gray-500 text-sm">{t('crew.monitor.noCrewWithRank')}</div>
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Context Menu for Certificate Types */}
      {contextMenu && (
        <div className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50" style={{ left: contextMenu.x, top: contextMenu.y, minWidth: '200px' }}>
          <button onClick={() => { handleCertificateClick(contextMenu.cert.id); closeContextMenu() }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-500" /> {t('crew.monitor.openDetails')}
          </button>
          <button onClick={() => { window.open(`/crew/certificates/${contextMenu.cert.id}`, '_blank'); closeContextMenu() }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2">
            <ExternalLink className="w-4 h-4 text-gray-500" /> {t('crew.monitor.openInNewTab')}
          </button>
          {/* Loại chứng chỉ là DANH MỤC của bờ, tàu chỉ được xem. Đã bỏ Sửa, Nhân bản,
              Vô hiệu hoá và Xoá — sửa dưới tàu sẽ lệch với danh mục gốc trên bờ và bị
              ghi đè ở lần đồng bộ sau. */}
        </div>
      )}

      {/* Context Menu for Crew Members */}
      {crewContextMenu && (
        <div className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50" style={{ left: crewContextMenu.x, top: crewContextMenu.y, minWidth: '220px' }}>
          <div className="px-4 py-2 border-b border-gray-200">
            <div className="text-sm font-medium text-gray-900">{crewContextMenu.crew.fullName}</div>
            <div className="text-xs text-gray-500">{crewContextMenu.crew.crewId} • {crewContextMenu.crew.rank?.rankName || '-'}</div>
          </div>
          <button onClick={() => { setAddCertCrewId(crewContextMenu.crew.id); setShowAddCrewCertModal(true); closeContextMenu() }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2">
            <Award className="w-4 h-4 text-blue-500" /> {t('crew.monitor.addCertificate')}
          </button>
          <button onClick={() => { navigate(`/crew/${crewContextMenu.crew.id}`); closeContextMenu() }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2">
            <User className="w-4 h-4 text-gray-500" /> {t('crew.monitor.viewCrewDetails')}
          </button>
          <button onClick={() => { window.open(`/crew/${crewContextMenu.crew.id}/standalone`, '_blank'); closeContextMenu() }} className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2">
            <ExternalLink className="w-4 h-4 text-gray-500" /> {t('crew.monitor.openInNewTab')}
          </button>
        </div>
      )}

      {/* Context Menu for Cert Status Icons */}
      {certIconMenu && (
        <div className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50" style={{ left: certIconMenu.x, top: certIconMenu.y, minWidth: '240px' }}>
          <div className="px-4 py-2 border-b border-gray-200">
            <div className="text-xs font-medium text-gray-900 truncate">{certIconMenu.certName}</div>
            <div className="text-xs text-gray-500">{certIconMenu.certCode} • {certIconMenu.crewName}</div>
          </div>
          {!certIconMenu.has ? (
            <button onClick={() => { setAddCertCrewId(certIconMenu.crewId); setAddCertCertificateId(certIconMenu.certificateId.toString()); setShowAddCrewCertModal(true); setCertIconMenu(null) }}
              className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-green-50 flex items-center gap-2">
              <Award className="w-4 h-4 text-green-600" /> {t('crew.monitor.addThisCert')}
            </button>
          ) : (
            <>
              <button onClick={() => { navigate(`/crew/${certIconMenu.crewId}`); setCertIconMenu(null) }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-500" /> {t('crew.monitor.viewCertDetails')}
              </button>
              <button onClick={() => { setAddCertCrewId(certIconMenu.crewId); setAddCertCertificateId(certIconMenu.certificateId.toString()); setShowAddCrewCertModal(true); setCertIconMenu(null) }}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-green-50 flex items-center gap-2">
                <Award className="w-4 h-4 text-green-600" /> {t('crew.monitor.renewAddCert')}
              </button>
            </>
          )}
          <button onClick={() => { navigate(`/crew/${certIconMenu.crewId}`); setCertIconMenu(null) }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2">
            <User className="w-4 h-4 text-gray-500" /> {t('crew.monitor.viewCrewDetailsShort')}
          </button>
        </div>
      )}

      {/* Modals */}
      <AddCrewCertificateModal
        isOpen={showAddCrewCertModal}
        onClose={() => { setShowAddCrewCertModal(false); setAddCertCrewId(undefined); setAddCertCertificateId(undefined) }}
        onSave={() => { setReloadTrigger(prev => prev + 1); setCertificateCache(null) }}
        crewId={addCertCrewId}
        certificateId={addCertCertificateId}
      />

    </div>
  )
}

