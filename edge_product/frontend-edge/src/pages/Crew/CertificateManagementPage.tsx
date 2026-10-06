import { PermissionGate } from '@/components/auth/PermissionGate'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Award,
  Plus,
  Users,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Pencil,
  User,
  Flag,
  Trash2,
  Info,
  Globe,
  Briefcase,
} from 'lucide-react'
import { Certificate, CrewCertificate, CrewMember } from '../../types/maritime.types'
import { format, differenceInDays, parseISO } from 'date-fns'
import { maritimeService } from '../../services/maritime.service'
import { AddCrewCertificateModal } from './AddCrewCertificateModal'
import { useTranslationSafe } from '@/contexts/I18nContext'

/** Nhãn tiếng Việt cho bộ phận của chức danh. */
const DEPARTMENT_LABELS: Record<string, string> = {
  DECK: 'Boong',
  ENGINE: 'Máy',
  CATERING: 'Phục vụ',
}

/** Một dòng "nhãn — giá trị" trong thẻ thông tin, cùng khuôn với trang chi tiết thiết bị. */
function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-gray-100 last:border-b-0">
      <span className="text-sm text-gray-500 shrink-0">{label}</span>
      <div className="text-sm font-medium text-gray-900 text-right min-w-0">{children}</div>
    </div>
  )
}

/** Thẻ có tiêu đề, dùng chung cho toàn bộ tab Thông tin. */
function SectionCard({ title, icon: Icon, count, children, className = '' }: {
  title: string
  icon?: React.ComponentType<{ className?: string }>
  count?: number
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`bg-white rounded-lg border border-gray-200 flex flex-col ${className}`}>
      <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50 rounded-t-lg flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-gray-400" />}
        <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{title}</h3>
        {count !== undefined && (
          <span className="ml-auto px-1.5 py-0.5 bg-gray-200 text-gray-700 text-xs font-semibold rounded">{count}</span>
        )}
      </div>
      <div className="px-4 py-2 flex-1">{children}</div>
    </div>
  )
}

export function CertificateManagementPage() {
  const { t } = useTranslationSafe()
  const navigate = useNavigate()
  const { certificateId } = useParams<{ certificateId: string }>()
  const [certificates, setCertificates] = useState<Certificate[]>([])
  const [selectedCertificate, setSelectedCertificate] = useState<Certificate | null>(null)
  const [crewWithCertificate, setCrewWithCertificate] = useState<(CrewCertificate & { crewMember: CrewMember })[]>([])
  const [countries, setCountries] = useState<any[]>([])
  const [ranks, setRanks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; crewCert: any } | null>(null)
  const [selectedRow, setSelectedRow] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<'crew' | 'info'>('crew')

  // Add Crew Certificate Modal state
  const [showAddCertModal, setShowAddCertModal] = useState(false)
  const [modalEditingCert, setModalEditingCert] = useState<any>(undefined)
  const [modalIsFlagState, setModalIsFlagState] = useState(false)

  useEffect(() => {
    console.log('🔷 CertificateManagementPage mounted, loading certificates...')
    loadCertificates()
  }, [])

  useEffect(() => {
    // Load certificate details when certificateId is available
    console.log('🔷 URL certificateId changed:', certificateId, 'Certificates count:', certificates.length)
    if (certificateId && certificates.length > 0) {
      const certId = parseInt(certificateId, 10)
      console.log('🔷 Parsed certId:', certId)
      const cert = certificates.find(c => c.id === certId)
      console.log('🔷 Found certificate:', cert)
      if (cert) {
        setSelectedCertificate(cert)
        console.log('🔷 Loading crew with certificate:', cert.id)
        loadCrewWithCertificate(cert.id)
      }
    }
  }, [certificateId, certificates])

  const loadCertificates = async () => {
    try {
      setLoading(true)
      console.log('🔵 Calling API: /api/certificates')
      const data = await maritimeService.certificates.getAll()
      console.log('✅ Certificates loaded:', data?.length, 'items')
      console.log('📋 Certificate data:', data)
      setCertificates(data)
    } catch (error) {
      console.error('❌ Failed to load certificates:', error)
      console.error('Error details:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadCountries = async (certificateId: number) => {
    try {
      const data = await maritimeService.certificates.getCertificateCountries(certificateId)
      setCountries(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('❌ Failed to load countries:', error)
      setCountries([])
    }
  }

  /** Chức danh (STCW) bắt buộc phải có loại chứng chỉ này — bảng nối rank_certificates. */
  const loadRanks = async (certificateId: number) => {
    try {
      const data = await maritimeService.certificates.getCertificateRanks(certificateId)
      setRanks(Array.isArray(data) ? data : [])
    } catch (error) {
      console.error('❌ Failed to load ranks:', error)
      setRanks([])
    }
  }

  const loadCrewWithCertificate = async (certificateId: number) => {
    try {
      console.log('🔵 Calling API: /api/certificates/' + certificateId + '/crew-certificates')
      const data = await maritimeService.certificates.getCrewCertificates(certificateId)
      console.log('✅ Raw data from API:', data)
      console.log('📊 Data type:', typeof data, 'Is array:', Array.isArray(data), 'Length:', data?.length)
      // Backend returns PascalCase properties, map to camelCase for consistency
      const mapped = data.map((item: any) => ({
        id: item.Id || item.id,
        certificateId: item.CertificateId || item.certificateId,
        crewMemberId: item.CrewMemberId || item.crewMemberId,
        certificateNumber: item.CertificateNumber || item.certificateNumber,
        issueDate: item.IssueDate || item.issueDate,
        expiryDate: item.ExpiryDate || item.expiryDate,
        issuingAuthority: item.IssuingAuthority || item.issuingAuthority,
        certificateOfCompetency: item.CertificateOfCompetency || item.certificateOfCompetency,
        countryId: item.CountryId || item.countryId,
        status: item.Status || item.status,
        notes: item.Notes || item.notes,
        crewMember: item.CrewMember ? {
          id: item.CrewMember.Id || item.CrewMember.id,
          fullName: item.CrewMember.FullName || item.CrewMember.fullName,
          rankId: item.CrewMember.RankId || item.CrewMember.rankId,
          rank: item.CrewMember.Rank || item.CrewMember.rank,
          countryId: item.CrewMember.CountryId || item.CrewMember.countryId,
          crewId: item.CrewMember.CrewId || item.CrewMember.crewId
        } : item.crewMember,
        country: item.Country ? {
          id: item.Country.Id || item.Country.id,
          countryCode: item.Country.CountryCode || item.Country.countryCode,
          countryName: item.Country.CountryName || item.Country.countryName
        } : item.country
      }))
      console.log('✅ Mapped data:', mapped)
      console.log('📊 Mapped count:', mapped.length)
      console.log('🔍 First record details:', JSON.stringify(mapped[0], null, 2))
      setCrewWithCertificate(mapped as any)

      // Quốc gia áp dụng + chức danh yêu cầu cho tab Thông tin
      await Promise.all([loadCountries(certificateId), loadRanks(certificateId)])
    } catch (error: any) {
      console.error('❌ Failed to load crew with certificate:', error)
      console.error('❌ Error type:', error?.constructor?.name)
      console.error('❌ Error message:', error?.message)
      console.error('❌ Error status:', error?.status)
      console.error('❌ Full error:', error)
      setCrewWithCertificate([])
    }
  }

  const handleContextMenu = (e: React.MouseEvent, crewCert: any) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, crewCert })
    setSelectedRow(crewCert.id)
  }

  const closeContextMenu = () => {
    setContextMenu(null)
    setSelectedRow(null)
  }

  useEffect(() => {
    const handleClick = () => closeContextMenu()
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])

  const handleEditCertificate = (crewCert: any) => {
    setModalEditingCert(crewCert)
    setModalIsFlagState(false)
    setShowAddCertModal(true)
    closeContextMenu()
  }

  const handleCreateFlagStateCertificate = (crewCert: any) => {
    const flagStateCertificate = {
      ...crewCert,
      certificateOfCompetency: 'Flag State',
      excludeCountryId: crewCert.certificateOfCompetency === 'National' ? crewCert.countryId : null
    }
    setModalEditingCert(flagStateCertificate)
    setModalIsFlagState(true)
    setShowAddCertModal(true)
    closeContextMenu()
  }

  const getCategoryBadge = (category?: string) => {
    const colors: Record<string, string> = {
      COMPETENCY: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
      MEDICAL: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
      PROFICIENCY: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
      SAFETY: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
    }
    
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${colors[category || ''] || 'bg-gray-100 text-gray-800'}`}>
        {category || t('crew.certMgmt.other')}
      </span>
    )
  }

  const getCertificateStatus = (expiryDate: string) => {
    const daysLeft = differenceInDays(parseISO(expiryDate), new Date())
    
    if (daysLeft < 0) {
      return { status: t('crew.certMgmt.expired'), color: 'text-red-600', bgColor: 'bg-red-50', icon: XCircle }
    } else if (daysLeft <= 30) {
      return { status: t('crew.certMgmt.critical'), color: 'text-red-600', bgColor: 'bg-red-50', icon: AlertTriangle }
    } else if (daysLeft <= 90) {
      return { status: t('crew.certMgmt.warning'), color: 'text-yellow-600', bgColor: 'bg-yellow-50', icon: Clock }
    } else {
      return { status: t('crew.certMgmt.valid'), color: 'text-green-600', bgColor: 'bg-green-50', icon: CheckCircle }
    }
  }

  /** Thống kê tình trạng hiệu lực của các chứng chỉ thuộc loại này đang có trên tàu. */
  const stats = useMemo(() => {
    const now = new Date()
    let valid = 0, expiring = 0, expired = 0
    for (const cc of crewWithCertificate) {
      if (!cc.expiryDate) continue
      const d = differenceInDays(parseISO(cc.expiryDate), now)
      if (d < 0) expired++
      else if (d <= 90) expiring++
      else valid++
    }
    return { total: crewWithCertificate.length, valid, expiring, expired }
  }, [crewWithCertificate])

  /** Gom chức danh theo bộ phận để bảng chức danh đọc được theo nhóm thay vì một rừng thẻ. */
  const ranksByDepartment = useMemo(() => {
    const groups = new Map<string, any[]>()
    for (const rc of ranks) {
      const rank = rc.rank ?? rc.Rank
      if (!rank) continue
      const dept = rank.department ?? rank.Department ?? 'OTHER'
      if (!groups.has(dept)) groups.set(dept, [])
      groups.get(dept)!.push(rank)
    }
    for (const list of groups.values()) {
      list.sort((a, b) => (a.sortOrder ?? a.SortOrder ?? 0) - (b.sortOrder ?? b.SortOrder ?? 0))
    }
    // Boong → Máy → Phục vụ → còn lại, cho khớp thứ tự quen thuộc trên tàu.
    const order = ['DECK', 'ENGINE', 'CATERING']
    return [...groups.entries()].sort(
      (a, b) => (order.indexOf(a[0]) + 1 || 99) - (order.indexOf(b[0]) + 1 || 99)
    )
  }, [ranks])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/crew/certificates')}
            className="p-2 hover:bg-gray-100 rounded transition-colors"
          >
            <span className="text-xl">←</span>
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-100 rounded flex items-center justify-center">
              <Award className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                {selectedCertificate?.certificateName || t('crew.certificateManagement.title')}
              </h1>
              {selectedCertificate && (
                <p className="text-xs text-gray-500">
                  {t('crew.certificateManagement.code')}: {selectedCertificate.certificateCode}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Certificate Details View */}
      {selectedCertificate ? (
          <div className="p-4 space-y-3">
            {/* Tab switcher */}
            <div className="flex border-b border-gray-200 bg-white rounded-t-lg px-2">
              <button
                onClick={() => setActiveTab('crew')}
                className={`px-4 py-2.5 text-sm font-medium flex items-center gap-2 border-b-2 -mb-px transition-colors ${
                  activeTab === 'crew'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Users className="w-4 h-4" />
                {t('crew.certMgmt.tabCrew')}
                <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
                  activeTab === 'crew' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'
                }`}>{crewWithCertificate.length}</span>
              </button>
              <button
                onClick={() => setActiveTab('info')}
                className={`px-4 py-2.5 text-sm font-medium flex items-center gap-2 border-b-2 -mb-px transition-colors ${
                  activeTab === 'info'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                <Info className="w-4 h-4" />
                {t('crew.certMgmt.tabInfo')}
              </button>
            </div>

            {/* ── TAB 2: Thông tin loại chứng chỉ ── */}
            {activeTab === 'info' && (
              <div className="space-y-3">
                {/* Hàng 1: ba thẻ thông tin — cùng khuôn với trang chi tiết thiết bị */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  <SectionCard title={t('crew.certMgmt.basicInfo')} icon={Info}>
                    <InfoRow label={t('crew.certificateManagement.code')}>
                      <code className="font-mono text-xs">{selectedCertificate.certificateCode}</code>
                    </InfoRow>
                    <InfoRow label={t('crew.certificateManagement.certificateName')}>
                      {selectedCertificate.certificateName}
                    </InfoRow>
                    <InfoRow label={t('crew.certificateManagement.category')}>
                      {getCategoryBadge(selectedCertificate.category)}
                    </InfoRow>
                    <InfoRow label={t('crew.certificateManagement.status')}>
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        selectedCertificate.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {selectedCertificate.isActive ? t('crew.certificateManagement.active') : t('crew.certificateManagement.inactive')}
                      </span>
                    </InfoRow>
                  </SectionCard>

                  <SectionCard title={t('crew.certMgmt.validityRequirements')} icon={Clock}>
                    <InfoRow label={t('crew.certificateManagement.validityPeriod')}>
                      {selectedCertificate.validityPeriodMonths
                        ? `${selectedCertificate.validityPeriodMonths} ${t('crew.certificateManagement.months')}`
                        : t('crew.certMgmt.na')}
                    </InfoRow>
                    <InfoRow label={t('crew.certificateManagement.mandatory')}>
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        selectedCertificate.isMandatory ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                      }`}>
                        {selectedCertificate.isMandatory ? t('crew.certificateManagement.yes') : t('crew.certificateManagement.no')}
                      </span>
                    </InfoRow>
                    <InfoRow label={t('crew.certMgmt.countryCount')}>{countries.length}</InfoRow>
                    <InfoRow label={t('crew.certMgmt.rankCount')}>{ranks.length}</InfoRow>
                  </SectionCard>

                  <SectionCard title={t('crew.certMgmt.onboardStatus')} icon={Users}>
                    <InfoRow label={t('crew.certMgmt.holdersOnboard')}>{stats.total}</InfoRow>
                    <InfoRow label={t('crew.certMgmt.valid')}>
                      <span className="text-green-600 font-semibold">{stats.valid}</span>
                    </InfoRow>
                    <InfoRow label={t('crew.certificateManagement.expiringSoon')}>
                      <span className={stats.expiring > 0 ? 'text-yellow-600 font-semibold' : ''}>{stats.expiring}</span>
                    </InfoRow>
                    <InfoRow label={t('crew.certMgmt.expired')}>
                      <span className={stats.expired > 0 ? 'text-red-600 font-semibold' : ''}>{stats.expired}</span>
                    </InfoRow>
                  </SectionCard>
                </div>

                {/* Hàng 2: quốc gia + chức danh, hai cột cho đỡ trống bên phải */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-start">
                  <SectionCard title={t('crew.certMgmt.applicableCountriesTitle')} icon={Globe} count={countries.length}>
                    {countries.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 py-1">
                        {countries.map((c: any, idx: number) => (
                          <span
                            key={c.id || idx}
                            className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 text-blue-800 text-xs rounded border border-blue-200"
                          >
                            {c.countryCode && (
                              <code className="font-mono text-[10px] text-blue-500">{c.countryCode}</code>
                            )}
                            {c.countryName}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 py-3 text-center">{t('crew.certMgmt.noCountries')}</p>
                    )}
                  </SectionCard>

                  <SectionCard title={t('crew.certMgmt.requiredRanksTitle')} icon={Briefcase} count={ranks.length}>
                    {ranksByDepartment.length > 0 ? (
                      <div className="space-y-2 py-1">
                        {ranksByDepartment.map(([dept, list]) => (
                          <div key={dept}>
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                              {DEPARTMENT_LABELS[dept] || dept} ({list.length})
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {list.map((r: any, idx: number) => (
                                <span
                                  key={r.id || idx}
                                  className="inline-flex items-center gap-1.5 px-2 py-1 bg-slate-50 text-slate-800 text-xs rounded border border-slate-200"
                                >
                                  <code className="font-mono text-[10px] text-slate-500">
                                    {r.rankCode ?? r.RankCode}
                                  </code>
                                  {r.rankName ?? r.RankName}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 py-3 text-center">{t('crew.certMgmt.noRanks')}</p>
                    )}
                  </SectionCard>
                </div>

                {/* Hàng 3: mô tả — chỉ hiện khi có, tránh để lại thẻ rỗng */}
                {selectedCertificate.description && (
                  <SectionCard title={t('crew.certMgmt.description')} icon={Award}>
                    <p className="text-sm text-gray-700 py-1 whitespace-pre-line">
                      {selectedCertificate.description}
                    </p>
                  </SectionCard>
                )}

                <p className="text-xs text-gray-400 flex items-center gap-1.5 px-1">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  {t('crew.certMgmt.managedByShore')}
                </p>
              </div>
            )}

            {/* ── TAB 1: Thuyền viên có chứng chỉ ── */}
            <div className={`bg-white rounded-lg border border-gray-200 ${activeTab === 'crew' ? '' : 'hidden'}`}>
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  {t('crew.certMgmt.crewWithCert', { count: crewWithCertificate.length })}
                </h3>
                <PermissionGate permission="certificates.create"><button
                  onClick={() => {
                    setModalEditingCert(undefined)
                    setModalIsFlagState(false)
                    setShowAddCertModal(true)
                  }}
                  className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 transition-colors flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t('crew.certMgmt.addCertificate')}
                </button></PermissionGate>
              </div>

              {crewWithCertificate.length === 0 ? (
                <div className="text-center py-12">
                  <AlertTriangle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-900 font-medium">{t('crew.certificateManagement.noCrew')}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    {t('crew.certificateManagement.noCrewMessage')}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse" style={{tableLayout: 'fixed'}}>
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '12%'}}>
                          {t('crew.certMgmt.crewMember')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '10%'}}>
                          {t('crew.certMgmt.position')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '8%'}}>
                          {t('crew.certMgmt.coc')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '10%'}}>
                          {t('crew.certMgmt.country')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '10%'}}>
                          {t('crew.certMgmt.certNumber')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '10%'}}>
                          {t('crew.certMgmt.issueDate')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '10%'}}>
                          {t('crew.certMgmt.expiryDate')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '12%'}}>
                          {t('crew.certMgmt.issuingAuth')}
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{width: '10%'}}>
                          {t('crew.certMgmt.status')}
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {crewWithCertificate.map((crewCert) => {
                        const status = getCertificateStatus(crewCert.expiryDate)
                        const StatusIcon = status.icon
                        const daysLeft = differenceInDays(parseISO(crewCert.expiryDate), new Date())
                        
                        return (
                          <tr
                            key={crewCert.id}
                            onContextMenu={(e) => handleContextMenu(e, crewCert)}
                            className={`border-b border-gray-100 transition-colors cursor-pointer ${
                              selectedRow === crewCert.id ? 'bg-blue-100' : 'hover:bg-gray-50'
                            }`}
                          >
                            <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200" style={{width: '12%'}}>
                              <div className="truncate font-medium">{crewCert.crewMember.fullName}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200" style={{width: '10%'}}>
                              <div className="truncate">{crewCert.crewMember.rank?.rankName || '-'}</div>
                            </td>
                            <td className="px-4 py-3 text-sm border-r border-gray-200" style={{width: '8%'}}>
                              {(crewCert as any).certificateOfCompetency ? (
                                <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                                  (crewCert as any).certificateOfCompetency === 'National' 
                                    ? 'bg-blue-100 text-blue-800' 
                                    : 'bg-purple-100 text-purple-800'
                                }`}>
                                  {(crewCert as any).certificateOfCompetency}
                                </span>
                              ) : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200" style={{width: '10%'}}>
                              <div className="truncate">{(crewCert as any).country?.countryName || '-'}</div>
                            </td>
                            <td className="px-4 py-3 text-sm border-r border-gray-200" style={{width: '10%'}}>
                              <code className="text-xs font-mono text-gray-900">
                                {crewCert.certificateNumber}
                              </code>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200" style={{width: '10%'}}>
                              <div className="truncate">
                                {format(parseISO(crewCert.issueDate), 'dd MMM yyyy')}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm border-r border-gray-200" style={{width: '10%'}}>
                              <div className="text-gray-900 font-medium truncate">
                                {format(parseISO(crewCert.expiryDate), 'dd MMM yyyy')}
                              </div>
                              <div className={`text-xs ${status.color} truncate`}>
                                {t('crew.certMgmt.daysLeft', { days: daysLeft })}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200" style={{width: '12%'}}>
                              <div className="truncate">
                                {crewCert.issuingAuthority || t('crew.certMgmt.na')}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-sm" style={{width: '10%'}}>
                              <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${status.bgColor} ${status.color}`}>
                                <StatusIcon className="w-3 h-3" />
                                {status.status}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
      ) : (
        // No certificate selected
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Award className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {t('crew.certificateManagement.noCertificateSelected')}
          </h3>
          <p className="text-sm text-gray-500 mb-6">
            {t('crew.certificateManagement.selectCertificateMessage')}
          </p>
          <button
            onClick={() => navigate('/crew/certificates')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            {t('crew.certificateManagement.goToCertificateMonitor')}
          </button>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50"
          style={{ left: contextMenu.x, top: contextMenu.y, minWidth: '240px' }}
        >
          <PermissionGate permission="certificates.update"><button
            onClick={() => handleEditCertificate(contextMenu.crewCert)}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"
          >
            <Pencil className="w-4 h-4 text-gray-500" /> {t('crew.certMgmt.editCert')}
          </button></PermissionGate>
          <button
            onClick={() => {
              navigate(`/crew/${contextMenu.crewCert.crewMemberId}`)
              closeContextMenu()
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"
          >
            <User className="w-4 h-4 text-gray-500" /> {t('crew.certMgmt.viewProfile')}
          </button>
          <div className="border-t border-gray-200 my-1"></div>
          <PermissionGate permission="certificates.create"><button
            onClick={() => handleCreateFlagStateCertificate(contextMenu.crewCert)}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"
          >
            <Flag className="w-4 h-4 text-gray-500" /> {t('crew.certMgmt.createFlagState')}
          </button></PermissionGate>
          <div className="border-t border-gray-200 my-1"></div>
          <button
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" /> {t('crew.certMgmt.deleteCert')}
          </button>
        </div>
      )}

      {/* Add/Edit Crew Certificate Modal */}
      <AddCrewCertificateModal
        isOpen={showAddCertModal}
        onClose={() => {
          setShowAddCertModal(false)
          setModalEditingCert(undefined)
          setModalIsFlagState(false)
        }}
        onSave={() => {
          if (selectedCertificate) {
            loadCrewWithCertificate(selectedCertificate.id)
          }
        }}
        certificateId={selectedCertificate?.id?.toString()}
        editingCertificate={modalEditingCert}
        isFlagStateCreation={modalIsFlagState}
      />
    </div>
  )
}
