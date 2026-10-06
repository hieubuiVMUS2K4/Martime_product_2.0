import { PermissionGate } from '@/components/auth/PermissionGate'
import { useEffect, useState, useMemo } from 'react'
import { toast } from 'sonner'
import { useParams, useNavigate } from 'react-router-dom'
import { 
  ArrowLeft, 
  Trash2,
  Upload,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Eye,
  FileDown,
  BookOpen,
  Pencil
} from 'lucide-react'
import { CrewMember } from '../../types/maritime.types'
import { maritimeService } from '../../services/maritime.service'
import { format, differenceInDays, parseISO } from 'date-fns'
import AddDocumentModal from '../../components/crew/AddDocumentModal'
import AddHealthDocumentModal from '../../components/crew/AddHealthDocumentModal'
import ImageViewerModal from '../../components/crew/ImageViewerModal'
import { AddCrewCertificateModal } from './AddCrewCertificateModal'
import { useTranslationSafe } from '@/contexts/I18nContext'
import jsPDF from 'jspdf' 
import 'jspdf-autotable'
import { CrewLogbookSection } from './CrewLogbookSection'

type TabType = 'basic-data' | 'documents' | 'logbook'

export function CrewDetailPage() {
  const { t } = useTranslationSafe()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  
  const [crew, setCrew] = useState<CrewMember | null>(null)
  const [loading, setLoading] = useState(true)
  const [editedCrew, setEditedCrew] = useState<Partial<CrewMember>>({})
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<TabType>('basic-data')
  const [certificates, setCertificates] = useState<any[]>([])
  const [loadingCertificates, setLoadingCertificates] = useState(false)
  const [travelDocuments, setTravelDocuments] = useState<any[]>([])
  const [seafarerDocuments, setSeafarerDocuments] = useState<any[]>([])
  const [employmentDocuments, setEmploymentDocuments] = useState<any[]>([])
  const [healthDocuments, setHealthDocuments] = useState<any[]>([])
  const [loadingDocuments, setLoadingDocuments] = useState(false)
  const [isIdentityExpanded, setIsIdentityExpanded] = useState(true)
  const [isHealthExpanded, setIsHealthExpanded] = useState(true)
  const [isCertificatesExpanded, setIsCertificatesExpanded] = useState(true)
  const [isAddDocumentModalOpen, setIsAddDocumentModalOpen] = useState(false)
  const [isAddHealthDocumentModalOpen, setIsAddHealthDocumentModalOpen] = useState(false)
  // Sua tai lieu / chung chi: giu ban ghi dang sua de modal dien san du lieu.
  const [editingDoc, setEditingDoc] = useState<any | null>(null)
  const [editingDocTable, setEditingDocTable] = useState<string | null>(null)
  const [editingCert, setEditingCert] = useState<any | null>(null)

  /** Mo modal sua tai lieu. Tai lieu suc khoe va giay to dinh danh dung hai modal khac nhau. */
  const openEditDoc = (doc: any, table: string) => {
    setEditingDoc(doc)
    setEditingDocTable(table)
    if (table === 'health_documents') setIsAddHealthDocumentModalOpen(true)
    else setIsAddDocumentModalOpen(true)
  }

  const openEditCert = (cert: any) => {
    setEditingCert(cert)
    setShowAddCertModal(true)
  }
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false)
  const [imageViewerUrl, setImageViewerUrl] = useState<string | null>(null)
  const [imageViewerDocId, setImageViewerDocId] = useState<string | null>(null)
  const [imageViewerTargetTable, setImageViewerTargetTable] = useState<string | null>(null)
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null)
  const [uploadingCertId, setUploadingCertId] = useState<number | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null)
  const [pendingAvatarPreview, setPendingAvatarPreview] = useState<string | null>(null)
  const [ranks, setRanks] = useState<any[]>([])
  const [countries, setCountries] = useState<any[]>([])

  const [showAddCertModal, setShowAddCertModal] = useState(false)

  // Section review checklist for pending crew verification
  const [sectionChecklist, setSectionChecklist] = useState<Record<string, boolean>>({
    personalInfo: false,
    physicalDetails: false,
    employmentDates: false,
    nextOfKin: false,
    education: false,
    contactInfo: false,
    documents: false,
  })
  const [reviewProcessing, setReviewProcessing] = useState(false)
  const [holdNotes, setHoldNotes] = useState('')
  const [showHoldNotesInput, setShowHoldNotesInput] = useState(false)

  const isPendingReview = crew?.onboardStatus === 'PendingReview' || crew?.onboardStatus === 'OnHold'

  // ─── Shore changes tracking (thông báo cập nhật từ bờ) ────────────────────
  interface ShoreFieldDiff { id: number; timestamp: string; action: string; message: string; newValues: string | null; oldValues: string | null }
  const [shoreChanges, setShoreChanges] = useState<ShoreFieldDiff[]>([])

  // Map: fieldName → { oldValue, newValue }
  const shoreChangeMap = useMemo(() => {
    const m: Record<string, { old: string; new: string }> = {}
    // Backend lưu key PascalCase (C# property), cần normalize về camelCase
    const toCamel = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
    for (const entry of shoreChanges) {
      try {
        const oldObj = entry.oldValues ? JSON.parse(entry.oldValues) : {}
        const newObj = entry.newValues ? JSON.parse(entry.newValues) : {}
        const fields = newObj.fields ?? {}
        for (const [k, v] of Object.entries(fields)) {
          const camelKey = toCamel(k)
          // oldValues cũng PascalCase
          const oldVal = (oldObj[k] as string) ?? (oldObj[camelKey] as string) ?? ''
          m[camelKey] = { old: oldVal, new: String(v ?? '') }
        }
      } catch { /* ignore */ }
    }
    return m
  }, [shoreChanges])

  const hasShoreChanges = Object.keys(shoreChangeMap).length > 0

  // Fetch unviewed shore changes khi mở trang
  const loadShoreChanges = async () => {
    if (!id) return
    try {
      const token = localStorage.getItem('maritime_token') ?? ''
      const res = await fetch(`/api/sync/notifications/crew/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) setShoreChanges(await res.json())
    } catch { /* silent */ }
  }

  // Đánh dấu đã xem khi nhấn nút "Đã xem"
  const handleMarkShoreChangesViewed = async () => {
    if (!id) return
    try {
      const token = localStorage.getItem('maritime_token') ?? ''
      await fetch(`/api/sync/notifications/crew/${id}/mark-viewed`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
      setShoreChanges([])
    } catch { /* silent */ }
  }

  // Helper: viền đỏ nếu field có diff từ bờ
  const fieldBorderClass = (fieldKey: string) =>
    shoreChangeMap[fieldKey]
      ? 'border-red-400 bg-red-50 focus:border-red-500'
      : 'border-gray-300 focus:border-blue-500'

  // Helper: indicator nhỏ hiển thị old → new
  const changeIndicator = (fieldKey: string) => {
    const c = shoreChangeMap[fieldKey]
    if (!c) return null
    return (
      <div className="flex items-center gap-1 mt-0.5">
        <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
        <span className="text-xs text-red-600">
          <s className="text-gray-400 mr-1">{c.old || '(trống)'}</s>→ <strong>{c.new}</strong>
        </span>
      </div>
    )
  }

  const toggleSectionCheck = (section: string) => {
    setSectionChecklist(prev => ({ ...prev, [section]: !prev[section] }))
  }

  const allSectionsChecked = Object.values(sectionChecklist).every(v => v)
  const checkedCount = Object.values(sectionChecklist).filter(v => v).length
  const totalSections = Object.keys(sectionChecklist).length

  const handleApproveReview = async () => {
    if (!crew) return
    setReviewProcessing(true)
    try {
      const result = await maritimeService.crew.approve(crew.id, JSON.stringify(sectionChecklist))
      toast.success(result.message)
      await loadCrewDetails()
    } catch (error: any) {
      toast.error(error.message || t('crew.edDetail.messages.approveFailed'))
    } finally {
      setReviewProcessing(false)
    }
  }

  const handleHoldReview = async () => {
    if (!crew) return
    setReviewProcessing(true)
    try {
      const uncheckedSections = Object.entries(sectionChecklist)
        .filter(([, checked]) => !checked)
        .map(([section]) => section)
      const autoNotes = `Missing/incomplete sections: ${uncheckedSections.join(', ')}${holdNotes ? `. Additional notes: ${holdNotes}` : ''}`
      const result = await maritimeService.crew.hold(crew.id, JSON.stringify(sectionChecklist), autoNotes)
      toast.success(result.message)
      setShowHoldNotesInput(false)
      setHoldNotes('')
      await loadCrewDetails()
    } catch (error: any) {
      toast.error(error.message || t('crew.edDetail.messages.holdFailed'))
    } finally {
      setReviewProcessing(false)
    }
  }

  useEffect(() => {
    loadCrewDetails()
    loadRanks()
    loadCountries()
    loadShoreChanges()
  }, [id])
  
  const loadRanks = async () => {
    try {
      const data = await maritimeService.ranks.getAll()
      setRanks(data)
    } catch (error) {
      console.error('Failed to load ranks:', error)
    }
  }

  const loadCountries = async () => {
    try {
      const data = await maritimeService.countries.getAll()
      setCountries(data)
    } catch (error) {
      console.error('Failed to load countries:', error)
    }
  }

  const loadCrewDetails = async () => {
    if (!id) return
    
    try {
      setLoading(true)
      const crewData = await maritimeService.crew.getById(id)
      setCrew(crewData)
      setEditedCrew(crewData)
      
      // Initialize review checklist from existing data
      if (crewData.reviewChecklist) {
        try {
          const parsed = JSON.parse(crewData.reviewChecklist)
          setSectionChecklist(prev => ({ ...prev, ...parsed }))
        } catch { /* ignore parse errors */ }
      }
      
      // Load certificates
      setLoadingCertificates(true)
      try {
        const certs = await maritimeService.certificates.getCrewCertificatesByCrewId(id)
        setCertificates(certs)
      } catch (certError) {
        console.error('❌ Failed to load certificates:', certError)
        setCertificates([])
      } finally {
        setLoadingCertificates(false)
      }
      
      await loadDocuments(id)
    } catch (error: any) {
      console.error('❌ Failed to load crew details:', error)
      setCrew(null)
    } finally {
      setLoading(false)
    }
  }

  const loadDocuments = async (crewMemberId: string) => {
    setLoadingDocuments(true)
    try {
      const [travel, seafarer, employment, health] = await Promise.all([
        maritimeService.crew.getTravelDocuments(crewMemberId).catch(() => []),
        maritimeService.crew.getSeafarerDocuments(crewMemberId).catch(() => []),
        maritimeService.crew.getEmploymentDocuments(crewMemberId).catch(() => []),
        maritimeService.crew.getHealthDocuments(crewMemberId).catch(() => [])
      ])
      setTravelDocuments(travel)
      setSeafarerDocuments(seafarer)
      setEmploymentDocuments(employment)
      setHealthDocuments(health)
    } catch (docError) {
      console.error('❌ Failed to load documents:', docError)
    } finally {
      setLoadingDocuments(false)
    }
  }

  const handleViewImage = (fileUrl: string, documentId: string, targetTable: string) => {
    setImageViewerUrl(fileUrl)
    setImageViewerDocId(documentId)
    setImageViewerTargetTable(targetTable)
    setIsImageViewerOpen(true)
  }

  // State to track if the image viewer is showing a certificate (for custom upload handler)
  const [viewingCertificateId, setViewingCertificateId] = useState<number | null>(null)

  const handleViewCertificateImage = (fileUrl: string, certId: number) => {
    setImageViewerUrl(fileUrl)
    setImageViewerDocId(String(certId))
    setViewingCertificateId(certId)
    setImageViewerTargetTable(null)
    setIsImageViewerOpen(true)
  }

  const handleCertificateUploadHandler = async (documentId: string, formData: FormData) => {
    const certId = parseInt(documentId)
    const result = await maritimeService.certificates.uploadCertificateFile(certId, formData)
    return result
  }

  const handleCertificateFileUpload = async (certId: number) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.jpg,.jpeg,.png,.gif,.pdf'
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        setUploadingCertId(certId)
        const formData = new FormData()
        formData.append('file', file)

        await maritimeService.certificates.uploadCertificateFile(certId, formData)
        
        // Reload certificates
        if (id) {
          const certs = await maritimeService.certificates.getCrewCertificatesByCrewId(id)
          setCertificates(certs)
        }
        
        toast.success(t('crew.edDetail.messages.fileUploaded'))
      } catch (error: any) {
        console.error('❌ Failed to upload certificate file:', error)
        toast.error(error.message || t('crew.edDetail.messages.uploadFailed'))
      } finally {
        setUploadingCertId(null)
      }
    }

    input.click()
  }

  const handleDocumentFileUpload = async (documentId: string, targetTable: string) => {
    // Create hidden file input
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      try {
        setUploadingDocId(documentId)
        const formData = new FormData()
        formData.append('targetTable', targetTable)
        formData.append('file', file)

        await maritimeService.crew.updateDocumentFile(documentId, formData)
        
        // Reload documents
        if (id) {
          await loadDocuments(id)
        }
        
        toast.success(t('crew.edDetail.messages.fileUploaded'))
      } catch (error: any) {
        console.error('❌ Failed to upload file:', error)
        toast.error(error.message || t('crew.edDetail.messages.uploadFailed'))
      } finally {
        setUploadingDocId(null)
      }
    }

    input.click()
  }

  const handleAvatarUpload = async () => {
    if (!id) return

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.warning(t('crew.edDetail.messages.fileSizeLimit'))
        return
      }

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif']
      if (!allowedTypes.includes(file.type)) {
        toast.warning(t('crew.edDetail.messages.imageOnly'))
        return
      }

      // Store file for later upload, generate preview
      setPendingAvatarFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setPendingAvatarPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }

    input.click()
  }

  const handleAvatarSave = async () => {
    if (!id || !pendingAvatarFile) return

    try {
      setUploadingAvatar(true)
      const formData = new FormData()
      formData.append('file', pendingAvatarFile)

      const response = await maritimeService.crew.uploadAvatar(id, formData)
      
      // Update crew member with new photo URL + cache-busting timestamp
      if (response.crewMember) {
        const bustCache = (url: string | undefined) =>
          url ? `${url.split('?')[0]}?t=${Date.now()}` : url
        response.crewMember.photoUrl = bustCache(response.crewMember.photoUrl)
        setCrew(response.crewMember)
        setEditedCrew(response.crewMember)
      }
      
      // Clear pending state
      setPendingAvatarFile(null)
      setPendingAvatarPreview(null)
      
      toast.success(t('crew.edDetail.messages.avatarUploaded'))
    } catch (error: any) {
      console.error('❌ Failed to upload avatar:', error)
      toast.error(error.message || t('crew.edDetail.messages.uploadFailed'))
    } finally {
      setUploadingAvatar(false)
    }
  }

  const handleCancelAvatarChange = () => {
    setPendingAvatarFile(null)
    setPendingAvatarPreview(null)
  }

  const handleDeleteAvatar = async () => {
    if (!id || !crew?.photoUrl) return

    toast(t('crew.edDetail.messages.deleteAvatarConfirm'), {
      action: {
        label: t('common.delete') || 'Xóa',
        onClick: async () => {
          try {
            setUploadingAvatar(true)
            
            // Update crew member with null photo URL
            const updated = await maritimeService.crew.update(id, { ...editedCrew, photoUrl: undefined })
            setCrew(updated)
            setEditedCrew(updated)
            
            toast.success(t('crew.edDetail.messages.avatarDeleted'))
          } catch (error: any) {
            console.error('❌ Failed to delete avatar:', error)
            toast.error(error.message || t('crew.edDetail.messages.uploadFailed'))
          } finally {
            setUploadingAvatar(false)
          }
        }
      }
    })
  }

  const exportToPDF = async () => {
    if (!crew) return
    
    try {
      const doc = new jsPDF('landscape', 'mm', 'a4') as any
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const ml = 8 // margin left
      const mr = 8 // margin right
      const tw = pageWidth - ml - mr // table width
      
      // Common table styles matching Excel template
      const headerStyle = { fillColor: [173, 216, 230] as [number, number, number], textColor: 0 as number, fontStyle: 'bold' as const, fontSize: 6, cellPadding: 1.2 }
      const bodyStyle = { fontSize: 6, cellPadding: 1.2, lineWidth: 0.1, lineColor: [0, 0, 0] as [number, number, number] }
      const certColumns = ['No.', 'Name', 'Issued by', 'Number', 'Date of issue', 'Date of expiry', 'Remark']
      const certColWidths = {
        0: { cellWidth: tw * 0.03 },  // No.
        1: { cellWidth: tw * 0.27 }, // Name
        2: { cellWidth: tw * 0.14 }, // Issued by
        3: { cellWidth: tw * 0.16 }, // Number
        4: { cellWidth: tw * 0.13 }, // Date of issue
        5: { cellWidth: tw * 0.13 }, // Date of expiry
        6: { cellWidth: tw * 0.14 }  // Remark
      }

      // Helper: check page break
      const checkPageBreak = (y: number, needed: number = 30) => {
        if (y > pageHeight - needed) { doc.addPage(); return 10 }
        return y
      }

      // ========== ROW 1-5: HEADER ==========
      doc.setDrawColor(180, 180, 180)
      doc.setLineWidth(0.3)
      doc.rect(ml, 6, 30, 16, 'S')
      doc.setFontSize(6)
      doc.setTextColor(150, 150, 150)
      doc.setFont('helvetica', 'italic')
      doc.text('LOGO', ml + 15, 15, { align: 'center' })
      
      doc.setFontSize(16)
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', 'bold')
      doc.text('BIO - DATA', pageWidth / 2, 14, { align: 'center' })
      
      const row4Y = 26
      doc.setFontSize(7)
      doc.setFont('helvetica', 'normal')
      doc.text('Crew code', ml, row4Y)
      doc.setFont('helvetica', 'bold')
      doc.text(crew.crewId || '', ml + 25, row4Y)
      doc.setFont('helvetica', 'normal')
      doc.text('Present Rank', ml + 60, row4Y)
      doc.setFont('helvetica', 'bold')
      doc.text(crew.rank?.rankName || '', ml + 85, row4Y)
      doc.setFont('helvetica', 'normal')
      doc.text('Prepared by', ml + 140, row4Y)
      doc.setFont('helvetica', 'normal')
      doc.text('Date Prepared', ml + 200, row4Y)
      doc.setFont('helvetica', 'bold')
      doc.text(format(new Date(), 'dd/MM/yyyy'), ml + 230, row4Y)
      
      let yPos = 31

      // ========== 1. Personal Particular ==========
      doc.setFillColor(173, 216, 230)
      doc.rect(ml, yPos, tw, 5, 'F')
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 0, 0)
      doc.text('1. Personal Particular', ml + 2, yPos + 3.5)
      yPos += 6
      
      const photoX = ml
      const photoY = yPos
      const photoW = 28
      const photoH = 38
      
      if (crew.photoUrl && crew.photoUrl.trim() !== '') {
        try {
          let imageUrl = crew.photoUrl
          if (imageUrl.startsWith('data:')) {
            doc.addImage(imageUrl, 'JPEG', photoX + 1, photoY + 1, photoW - 2, photoH - 2)
          } else {
            if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
              imageUrl = `/${imageUrl}`
            }
            doc.addImage(imageUrl, 'JPEG', photoX + 1, photoY + 1, photoW - 2, photoH - 2)
          }
        } catch (imgError) {
          console.warn('PDF: Could not add image:', imgError)
          doc.setDrawColor(180, 180, 180)
          doc.rect(photoX, photoY, photoW, photoH, 'S')
          doc.setFontSize(6)
          doc.setTextColor(150, 150, 150)
          doc.text('PHOTO', photoX + photoW / 2, photoY + photoH / 2, { align: 'center' })
        }
      } else {
        doc.setDrawColor(180, 180, 180)
        doc.rect(photoX, photoY, photoW, photoH, 'S')
        doc.setFontSize(6)
        doc.setTextColor(150, 150, 150)
        doc.text('PHOTO', photoX + photoW / 2, photoY + photoH / 2, { align: 'center' })
      }
      doc.setTextColor(0, 0, 0)
      
      const pdLeft = ml + photoW + 2
      const pdWidth = tw - photoW - 2
      
      const Lb = (text: string) => ({ content: text, styles: { fontStyle: 'bold' as const, fillColor: [245, 245, 245] as [number, number, number] } })
      const Va = (text: string) => ({ content: text, styles: {} as any })

      doc.autoTable({
        startY: yPos,
        head: [['', 'Full name', '', 'Date of Birth', '', 'Place of Birth', '', 'Nationality', '']],
        body: [
          [Lb('Name'), Va(crew.fullName || ''), Va(''), Va(crew.dateOfBirth ? format(new Date(crew.dateOfBirth), 'dd/MM/yyyy') : ''), Va(''), Va(crew.placeOfBirth || ''), Va(''), Va(crew.countryName || ''), Va('')],
          [Lb('ID No.'), Va(crew.idCardNumber || ''), Va(''), Lb('Address'), Va(crew.address || ''), Va(''), Va(''), Va(''), Va('')],
          [Lb('Home Tel'), Va(''), Lb('Hand phone'), Va(crew.phoneNumber || ''), Lb('Email'), Va(crew.emailAddress || ''), Va(''), Lb('Marital status'), Va(crew.maritalStatus || '')],
          [Lb('Height'), Va(crew.height ? `${crew.height} cm` : ''), Lb('Weight'), Va(crew.weight ? `${crew.weight} kg` : ''), Lb('Overall size'), Va(crew.clothingSize || ''), Lb("Shoe's size"), Va(crew.shoeSize || ''), Va('')],
          [Lb('Catering size'), Va(crew.cateringSize || ''), Lb('Blood Group'), Va(crew.bloodGroup || ''), Lb('Covid-19 Vaccinated'), Va(crew.isCovidVaccinated ? 'Yes' : 'No'), Lb('Smoker'), Va(crew.isSmoker ? 'Yes' : 'No'), Va('')],
          [Lb('Contact person/\nNext of Kin'), Lb('Name'), Va(crew.nextOfKinName || ''), Lb('Phone No.'), Va(crew.nextOfKinPhone || ''), Lb('Covid-19 Vaccinated'), Va(crew.isCovidVaccinated ? 'Yes' : 'No'), Lb('Smoker'), Va(crew.isSmoker ? 'Yes' : 'No')],
          [Va(''), Lb('Relation'), Va(crew.nextOfKinRelation || ''), Lb('Address'), Va(crew.nextOfKinAddress || ''), Va(''), Va(''), Va(''), Va('')]
        ],
        theme: 'grid',
        styles: { fontSize: 5.5, cellPadding: 1, lineWidth: 0.1, lineColor: [0, 0, 0], overflow: 'linebreak', valign: 'middle' },
        headStyles: { fillColor: [230, 240, 250], textColor: 0, fontStyle: 'bold', fontSize: 5.5 },
        margin: { left: pdLeft, right: mr },
        columnStyles: {
          0: { cellWidth: pdWidth * 0.08 },
          1: { cellWidth: pdWidth * 0.15 },
          2: { cellWidth: pdWidth * 0.09 },
          3: { cellWidth: pdWidth * 0.13 },
          4: { cellWidth: pdWidth * 0.10 },
          5: { cellWidth: pdWidth * 0.14 },
          6: { cellWidth: pdWidth * 0.08 },
          7: { cellWidth: pdWidth * 0.08 },
          8: { cellWidth: pdWidth * 0.15 }
        }
      })
      
      yPos = Math.max(doc.lastAutoTable.finalY, photoY + photoH) + 4
      
      // ========== 2. Education ==========
      doc.setFillColor(173, 216, 230)
      doc.rect(ml, yPos, tw, 5, 'F')
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.text('2. Education', ml + 2, yPos + 3.5)
      yPos += 6
      
      doc.autoTable({
        startY: yPos,
        head: [['University/College/School name', 'Course', 'Period', 'Year of graduation']],
        body: [[crew.educationInstitution || '', crew.educationCourse || '', crew.educationPeriodYears ? `${crew.educationPeriodYears} years` : '', crew.educationGraduationYear || '']],
        theme: 'grid',
        styles: bodyStyle,
        headStyles: headerStyle,
        margin: { left: ml, right: mr },
        columnStyles: {
          0: { cellWidth: tw * 0.4 },
          1: { cellWidth: tw * 0.25 },
          2: { cellWidth: tw * 0.15 },
          3: { cellWidth: tw * 0.2 }
        }
      })
      
      yPos = doc.lastAutoTable.finalY + 4
      
      // ========== 3. Immigration Documents — DYNAMIC ROWS ==========
      yPos = checkPageBreak(yPos)
      doc.setFillColor(173, 216, 230)
      doc.rect(ml, yPos, tw, 5, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text('3. Immigration Documents', ml + 2, yPos + 3.5)
      yPos += 6
      
      const immigDocsPdf = travelDocuments.map((d: any, i: number) => [
        `${i + 1}`, d.documentType || '', d.country?.countryName || 'Vietnam', d.documentNumber || '',
        d.issueDate ? format(new Date(d.issueDate), 'dd/MM/yyyy') : '',
        d.expiryDate ? format(new Date(d.expiryDate), 'dd/MM/yyyy') : '', d.notes || ''
      ])
      // Always +1 empty row
      immigDocsPdf.push(['', '', '', '', '', '', ''])
      
      doc.autoTable({
        startY: yPos,
        head: [['No.', 'Name of Document', 'Issued by', 'Number', 'Date of Issue', 'Date of expiry', 'Remark']],
        body: immigDocsPdf,
        theme: 'grid',
        styles: bodyStyle,
        headStyles: headerStyle,
        margin: { left: ml, right: mr },
        columnStyles: {
          0: { cellWidth: tw * 0.03 },
          1: { cellWidth: tw * 0.25 },
          2: { cellWidth: tw * 0.14 },
          3: { cellWidth: tw * 0.16 },
          4: { cellWidth: tw * 0.13 },
          5: { cellWidth: tw * 0.13 },
          6: { cellWidth: tw * 0.16 }
        }
      })
      
      yPos = doc.lastAutoTable.finalY + 4
      
      // ========== 4. Licenses ==========
      yPos = checkPageBreak(yPos)
      doc.setFillColor(173, 216, 230)
      doc.rect(ml, yPos, tw, 5, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text('4. Licenses', ml + 2, yPos + 3.5)
      yPos += 6
      
      // 4.1. National Licenses (Vietnam) — DYNAMIC ROWS
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.text('4.1. National Licenses (Vietnam)', ml + 2, yPos + 3)
      yPos += 5
      
      const cocPdf = (seafarerDocuments || []).filter((d: any) =>
        d.documentType?.toLowerCase() === 'coc' || d.documentType?.toLowerCase() === 'certificate of competency'
      ).map((d: any, i: number) => [
        `${i + 1}`, d.documentType || 'CoC', d.country?.countryName || 'Vietnam', d.documentNumber || '',
        d.issueDate ? format(new Date(d.issueDate), 'dd/MM/yyyy') : '',
        d.expiryDate ? format(new Date(d.expiryDate), 'dd/MM/yyyy') : '', d.notes || ''
      ])
      cocPdf.push(['', '', '', '', '', '', ''])
      
      doc.autoTable({
        startY: yPos,
        head: [certColumns],
        body: cocPdf,
        theme: 'grid',
        styles: bodyStyle,
        headStyles: headerStyle,
        margin: { left: ml, right: mr },
        columnStyles: certColWidths
      })
      
      yPos = doc.lastAutoTable.finalY + 4
      
      // ========== 5. Training Certificate ==========
      yPos = checkPageBreak(yPos)
      doc.setFillColor(173, 216, 230)
      doc.rect(ml, yPos, tw, 5, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text('5. Training Certificate', ml + 2, yPos + 3.5)
      yPos += 6
      
      // 5.1. Training Certificate (required by STCW) — DYNAMIC ROWS
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.text('5.1. Training Certificate (required by STCW)', ml + 2, yPos + 3)
      yPos += 5
      
      const stcwPdf = (certificates || []).map((c: any, i: number) => [
        `${i + 1}`,
        c.certificate?.certificateName || c.certificateName || '',
        c.issuingAuthority || c.country?.countryName || '',
        c.certificateNumber || '',
        c.issueDate ? format(new Date(c.issueDate), 'dd/MM/yyyy') : '',
        c.expiryDate ? format(new Date(c.expiryDate), 'dd/MM/yyyy') : '',
        c.notes || ''
      ])
      stcwPdf.push(['', '', '', '', '', '', ''])
      
      doc.autoTable({
        startY: yPos,
        head: [certColumns],
        body: stcwPdf,
        theme: 'grid',
        styles: bodyStyle,
        headStyles: headerStyle,
        margin: { left: ml, right: mr },
        columnStyles: certColWidths
      })
      
      yPos = doc.lastAutoTable.finalY + 3
      
      // 5.2. Training Certificate (required by Owner) — DYNAMIC ROWS
      yPos = checkPageBreak(yPos)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.text('5.2. Training Certificate (required by Owner)', ml + 2, yPos + 3)
      yPos += 5
      
      // Currently no data source for this, just empty row
      doc.autoTable({
        startY: yPos,
        head: [certColumns],
        body: [['', '', '', '', '', '', '']],
        theme: 'grid',
        styles: bodyStyle,
        headStyles: headerStyle,
        margin: { left: ml, right: mr },
        columnStyles: certColWidths
      })
      
      yPos = doc.lastAutoTable.finalY + 3
      
      // 5.3. In house training course — DYNAMIC ROWS
      yPos = checkPageBreak(yPos)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.text('5.3. In house training course', ml + 2, yPos + 3)
      yPos += 5
      
      const inHousePdf = (employmentDocuments || []).map((d: any, i: number) => [
        `${i + 1}`, d.documentType || '', d.country?.countryName || 'Vietnam', d.documentNumber || '',
        d.issueDate ? format(new Date(d.issueDate), 'dd/MM/yyyy') : '',
        d.expiryDate ? format(new Date(d.expiryDate), 'dd/MM/yyyy') : '', d.notes || ''
      ])
      inHousePdf.push(['', '', '', '', '', '', ''])
      
      doc.autoTable({
        startY: yPos,
        head: [certColumns],
        body: inHousePdf,
        theme: 'grid',
        styles: bodyStyle,
        headStyles: headerStyle,
        margin: { left: ml, right: mr },
        columnStyles: certColWidths
      })
      
      yPos = doc.lastAutoTable.finalY + 4
      
      // ========== 6. Other certificate — DYNAMIC ROWS ==========
      yPos = checkPageBreak(yPos)
      doc.setFillColor(173, 216, 230)
      doc.rect(ml, yPos, tw, 5, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text('6. Other certificate', ml + 2, yPos + 3.5)
      yPos += 6
      
      const otherPdf = (healthDocuments || []).map((d: any, i: number) => [
        `${i + 1}`, d.documentType || '', d.country?.countryName || 'Vietnam', d.documentNumber || '',
        d.issueDate ? format(new Date(d.issueDate), 'dd/MM/yyyy') : '',
        d.expiryDate ? format(new Date(d.expiryDate), 'dd/MM/yyyy') : '', d.notes || ''
      ])
      otherPdf.push(['', '', '', '', '', '', ''])
      
      doc.autoTable({
        startY: yPos,
        head: [certColumns],
        body: otherPdf,
        theme: 'grid',
        styles: bodyStyle,
        headStyles: headerStyle,
        margin: { left: ml, right: mr },
        columnStyles: certColWidths
      })
      
      yPos = doc.lastAutoTable.finalY + 4
      yPos = checkPageBreak(yPos, 20)
      
      // ========== 7. Remark ==========
      doc.setFillColor(173, 216, 230)
      doc.rect(ml, yPos, tw, 5, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text('7. Remark', ml + 2, yPos + 3.5)
      yPos += 7
      
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.text(crew.notes || '', ml + 2, yPos, { maxWidth: tw - 4 })
      
      doc.save(`BIO-DATA_${crew.crewId || crew.fullName}_${format(new Date(), 'yyyyMMdd')}.pdf`)
      
      toast.success(t('crew.edDetail.messages.pdfExported'))
    } catch (error: any) {
      console.error('Failed to export PDF:', error)
      toast.error(error.message || 'Failed to export PDF')
    }
  }

  const exportToExcel = async () => {
    if (!crew) return
    
    try {
      const ExcelJS = await import('exceljs')
      const workbook = new ExcelJS.Workbook()
      const ws = workbook.addWorksheet('BIO-DATA', {
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
      })
      
      // Column count A(1) to AR(44)
      const TC = 44
      const thin: any = { style: 'thin', color: { argb: 'FF000000' } }
      const border: any = { top: thin, bottom: thin, left: thin, right: thin }
      const noBorder: any = { top: undefined, bottom: undefined, left: undefined, right: undefined }
      const SEC_FILL = 'FF4BACC6'  // teal section header (matches template)
      const SUBSEC_FILL = 'FF92CDDC' // lighter teal sub-section header
      const LABEL_FILL = 'FFD9E2F3' // light blue-gray label bg
      const DATA_FILL = 'FFFDE9D0'  // light orange/peach for data cells
      const HDR_FILL = 'FFDAEEF3'   // column header bg
      const TN = 'Times New Roman'
      const boldFont = (sz = 10) => ({ bold: true, size: sz, name: TN })
      const normFont = (sz = 10) => ({ size: sz, name: TN })
      const cAlign: any = { horizontal: 'center', vertical: 'middle' }
      const lAlign: any = { horizontal: 'left', vertical: 'middle' }

      // Set column widths — wider so headers display fully without wrapping
      for (let c = 1; c <= TC; c++) ws.getColumn(c).width = 4.5

      // Helper: merge cells in a single row with border + styles
      const mSet = (r: number, c1: number, c2: number, val: any, font?: any, fill?: string, align?: any) => {
        if (c2 > c1) ws.mergeCells(r, c1, r, c2)
        const cell = ws.getCell(r, c1)
        cell.value = val
        if (font) cell.font = font
        if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
        if (align) cell.alignment = align
        for (let c = c1; c <= c2; c++) ws.getCell(r, c).border = border
      }

      // Helper: multi-row merge with border
      const mSetR = (r1: number, c1: number, r2: number, c2: number, val: any, font?: any, fill?: string, align?: any) => {
        ws.mergeCells(r1, c1, r2, c2)
        const cell = ws.getCell(r1, c1)
        cell.value = val
        if (font) cell.font = font
        if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
        if (align) cell.alignment = align
        for (let r = r1; r <= r2; r++)
          for (let c = c1; c <= c2; c++) ws.getCell(r, c).border = border
      }

      // Helper: merge WITHOUT border (for header area outside table)
      const mNoBorder = (r: number, c1: number, c2: number, val: any, font?: any, fill?: string, align?: any) => {
        if (c2 > c1) ws.mergeCells(r, c1, r, c2)
        const cell = ws.getCell(r, c1)
        cell.value = val
        if (font) cell.font = font
        if (fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }
        if (align) cell.alignment = align
        for (let c = c1; c <= c2; c++) ws.getCell(r, c).border = noBorder
      }

      // Section header (full-width, white bold text on teal)
      const secHead = (r: number, text: string) => mSet(r, 1, TC, text, { bold: true, size: 10, name: TN, color: { argb: 'FFFFFFFF' } }, SEC_FILL, lAlign)

      // Sub-section header (lighter teal)
      const subSecHead = (r: number, text: string) => mSet(r, 1, TC, text, boldFont(10), SUBSEC_FILL, lAlign)

      // Immigration data row with orange data fill
      const immigRow = (r: number, vals: string[], isHeader = false) => {
        const f = isHeader ? boldFont(10) : normFont(10)
        const bg = isHeader ? HDR_FILL : DATA_FILL
        mSet(r, 1, 15, vals[0], f, bg, lAlign)
        mSet(r, 16, 21, vals[1], f, bg, cAlign)
        mSet(r, 22, 26, vals[2], f, bg, cAlign)
        mSet(r, 27, 30, vals[3], f, bg, cAlign)
        mSet(r, 31, 33, vals[4], f, bg, cAlign)
        mSet(r, 34, TC, vals[5], f, bg, lAlign)
      }

      // Cert data row with orange data fill
      const certRow = (r: number, vals: string[], isHeader = false) => {
        const f = isHeader ? boldFont(10) : normFont(10)
        const bg = isHeader ? HDR_FILL : DATA_FILL
        mSet(r, 1, 3, vals[0], f, bg, cAlign)
        mSet(r, 4, 15, vals[1], f, bg, lAlign)
        mSet(r, 16, 21, vals[2], f, bg, cAlign)
        mSet(r, 22, 26, vals[3], f, bg, cAlign)
        mSet(r, 27, 30, vals[4], f, bg, cAlign)
        mSet(r, 31, 33, vals[5], f, bg, cAlign)
        mSet(r, 34, TC, vals[6], f, bg, lAlign)
      }

      const fmtDate = (d: string | null | undefined) => d ? new Date(d).toLocaleDateString('en-GB') : ''

      // =============== ROW 1-5: HEADER (no borders) ===============
      // Logo placeholder A1:D5
      mSetR(1, 1, 5, 4, 'LOGO', { italic: true, size: 8, name: TN, color: { argb: 'FF999999' } }, undefined, cAlign)
      // Remove border on logo area
      for (let r = 1; r <= 5; r++) for (let c = 1; c <= 4; c++) ws.getCell(r, c).border = noBorder
      // Title F2:AQ2 — no border
      ws.mergeCells(2, 6, 2, 43)
      const ttl = ws.getCell(2, 6)
      ttl.value = 'BIO - DATA'; ttl.font = boldFont(16); ttl.alignment = cAlign
      for (let c = 6; c <= 43; c++) ws.getCell(2, c).border = noBorder
      // Clear borders on empty header rows
      for (let r = 1; r <= 6; r++) for (let c = 5; c <= TC; c++) { if (r !== 2 && r !== 4) ws.getCell(r, c).border = noBorder }

      // Row 4 info — no borders, underline for data values
      let R = 4
      mNoBorder(R, 7, 10, 'Crew code', boldFont(10), undefined, lAlign)
      mNoBorder(R, 11, 16, crew.crewId || '', { ...normFont(10), underline: true }, undefined, lAlign)
      mNoBorder(R, 17, 20, 'Present Rank', boldFont(10), undefined, lAlign)
      mNoBorder(R, 21, 25, crew.rank?.rankName || '', { ...normFont(10), bold: true }, undefined, lAlign)
      mNoBorder(R, 26, 29, 'Prepared by', boldFont(10), undefined, lAlign)
      mNoBorder(R, 30, 35, '', normFont(10), undefined, lAlign)
      mNoBorder(R, 37, 40, 'Date Prepared', boldFont(10), undefined, lAlign)
      mNoBorder(R, 41, TC, format(new Date(), 'dd/MM/yyyy'), normFont(10), undefined, lAlign)

      // =============== 1. Personal Particular ===============
      R = 7
      secHead(R, '1. Personal Particular')
      R = 8

      // Photo area A8:G14
      const photoStartRow = R
      const photoEndRow = R + 6
      mSetR(photoStartRow, 1, photoEndRow, 7, '', undefined, undefined, cAlign)

      // Add photo image if available
      if (crew.photoUrl && crew.photoUrl.trim() !== '') {
        try {
          let imageUrl = crew.photoUrl
          let base64Data = ''
          if (imageUrl.startsWith('data:')) {
            base64Data = imageUrl.split(',')[1]
          } else {
            if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
              imageUrl = `/${imageUrl}`
            }
            const resp = await fetch(imageUrl)
            const blob = await resp.blob()
            const reader = new FileReader()
            await new Promise(resolve => { reader.onloadend = () => resolve(null); reader.readAsDataURL(blob) })
            if (reader.result) base64Data = reader.result.toString().split(',')[1]
          }
          if (base64Data) {
            const imgId = workbook.addImage({ base64: base64Data, extension: 'jpeg' })
            ws.addImage(imgId, { tl: { col: 0.2, row: photoStartRow - 0.8 }, br: { col: 6.8, row: photoEndRow - 0.2 } } as any)
          }
        } catch { /* photo not critical */ }
      }

      // Personal data rows (H8:AR14 area → cols 8..44)
      const pCol = 8 // start col for personal data (col H)
      // Row 8-9: labels + data header row
      mSetR(R, pCol, R + 1, pCol + 3, 'Name', boldFont(10), LABEL_FILL, lAlign)  // H8:K9
      mSet(R, pCol + 4, 26, 'Full name', boldFont(10), LABEL_FILL, lAlign) // L8:Z8
      mSet(R, 27, 30, 'Date of Birth', boldFont(10), LABEL_FILL, cAlign)
      mSet(R, 31, 38, 'Place of Birth', boldFont(10), LABEL_FILL, cAlign)
      mSet(R, 39, TC, 'Nationality', boldFont(10), LABEL_FILL, cAlign)
      R = 9
      // data row 9 (Name label spans 8-9)
      mSet(R, pCol + 4, 26, crew.fullName || '', normFont(10), DATA_FILL, lAlign)
      mSet(R, 27, 30, fmtDate(crew.dateOfBirth), normFont(10), DATA_FILL, cAlign)
      mSet(R, 31, 38, crew.placeOfBirth || '', normFont(10), DATA_FILL, cAlign)
      mSet(R, 39, TC, crew.countryName || '', normFont(10), DATA_FILL, cAlign)
      R = 10
      mSet(R, pCol, pCol + 3, 'ID No.', boldFont(10), LABEL_FILL, lAlign)
      mSet(R, pCol + 4, 21, crew.idCardNumber || '', normFont(10), DATA_FILL, lAlign)
      mSet(R, 22, 23, 'Address', boldFont(10), LABEL_FILL, lAlign)
      mSet(R, 24, TC, crew.address || '', normFont(10), DATA_FILL, lAlign)
      R = 11
      mSet(R, pCol, pCol + 3, 'Home Tel', boldFont(10), LABEL_FILL, lAlign)
      mSet(R, pCol + 4, 15, '', normFont(10), DATA_FILL, lAlign)
      mSet(R, 16, 18, 'Hand phone', boldFont(10), LABEL_FILL, lAlign)
      mSet(R, 19, 21, crew.phoneNumber || '', normFont(10), DATA_FILL, lAlign)
      mSet(R, 22, 23, 'Email', boldFont(10), LABEL_FILL, lAlign)
      mSet(R, 24, 33, crew.emailAddress || '', normFont(10), DATA_FILL, lAlign)
      mSet(R, 34, 38, 'Marital status', boldFont(10), LABEL_FILL, lAlign)
      mSet(R, 39, TC, crew.maritalStatus || '', normFont(10), DATA_FILL, lAlign)
      R = 12
      mSet(R, pCol, pCol + 3, 'Height', boldFont(10), LABEL_FILL, lAlign)
      mSet(R, pCol + 4, 15, crew.height ? `${crew.height} cm` : '', normFont(10), DATA_FILL, lAlign)
      mSet(R, 16, 18, 'Weight', boldFont(10), LABEL_FILL, lAlign)
      mSet(R, 19, 21, crew.weight ? `${crew.weight} kg` : '', normFont(10), DATA_FILL, lAlign)
      mSet(R, 22, 23, 'Overall size', boldFont(10), LABEL_FILL, lAlign)
      mSet(R, 24, 26, crew.clothingSize || '', normFont(10), DATA_FILL, cAlign)
      mSet(R, 27, 30, "Shoe's size", boldFont(10), LABEL_FILL, lAlign)
      mSet(R, 31, 32, crew.shoeSize || '', normFont(10), DATA_FILL, cAlign)
      mSet(R, 33, 36, 'Catering size', boldFont(10), LABEL_FILL, lAlign)
      mSet(R, 37, 38, crew.cateringSize || '', normFont(10), DATA_FILL, cAlign)
      mSet(R, 39, 41, 'Blood Group', boldFont(10), LABEL_FILL, lAlign)
      mSet(R, 42, TC, crew.bloodGroup || '', normFont(10), DATA_FILL, cAlign)
      R = 13
      mSetR(R, pCol, R + 1, pCol + 3, 'Contact person/\nNext of Kin', boldFont(10), LABEL_FILL, { ...lAlign, wrapText: true })
      mSet(R, pCol + 4, 15, 'Name', boldFont(10), LABEL_FILL, lAlign)
      mSet(R, 16, 21, crew.nextOfKinName || '', normFont(10), DATA_FILL, lAlign)
      mSet(R, 22, 23, 'Phone No.', boldFont(10), LABEL_FILL, lAlign)
      mSet(R, 24, 30, crew.nextOfKinPhone || '', normFont(10), DATA_FILL, lAlign)
      mSet(R, 31, 36, 'Covid-19 Vaccinated', boldFont(10), LABEL_FILL, lAlign)
      mSet(R, 37, 38, crew.isCovidVaccinated ? 'Yes' : 'No', normFont(10), DATA_FILL, cAlign)
      mSet(R, 39, 41, 'Smoker', boldFont(10), LABEL_FILL, lAlign)
      mSet(R, 42, TC, crew.isSmoker ? 'Yes' : 'No', normFont(10), DATA_FILL, cAlign)
      R = 14
      // H14:K14 is part of merge above
      mSet(R, pCol + 4, 15, 'Relation', boldFont(10), LABEL_FILL, lAlign)
      mSet(R, 16, 21, crew.nextOfKinRelation || '', normFont(10), DATA_FILL, lAlign)
      mSet(R, 22, 23, 'Address', boldFont(10), LABEL_FILL, lAlign)
      mSet(R, 24, TC, crew.nextOfKinAddress || '', normFont(10), DATA_FILL, lAlign)

      // =============== 2. Education ===============
      R = 15
      secHead(R, '2. Education')
      R = 16
      // Education: labels + data
      mSet(R, 1, 11, 'University / College / School name', boldFont(10), LABEL_FILL, lAlign)
      mSet(R, 12, 21, 'Course', boldFont(10), LABEL_FILL, lAlign)
      mSet(R, 22, 26, 'Period', boldFont(10), LABEL_FILL, cAlign)
      mSet(R, 27, 33, 'Year of graduation', boldFont(10), LABEL_FILL, cAlign)
      mSet(R, 34, TC, '', boldFont(10), LABEL_FILL, cAlign)
      R = 17
      mSet(R, 1, 11, crew.educationInstitution || '', normFont(10), DATA_FILL, lAlign)
      mSet(R, 12, 21, crew.educationCourse || '', normFont(10), DATA_FILL, lAlign)
      mSet(R, 22, 26, crew.educationPeriodYears ? `${crew.educationPeriodYears} years` : '', normFont(10), DATA_FILL, cAlign)
      mSet(R, 27, 33, crew.educationGraduationYear || '', normFont(10), DATA_FILL, cAlign)
      mSet(R, 34, TC, '', normFont(10), DATA_FILL, cAlign)

      // =============== 3. Immigration Documents — DYNAMIC ===============
      R++
      secHead(R, '3. Immigration Documents')
      R++
      // Column headers
      immigRow(R, ['Name of Document', 'Issued by', 'Number', 'Date of Issue', 'Date of expiry', 'Remark'], true)
      R++

      // Data rows
      for (const d of travelDocuments) {
        immigRow(R, [
          d.documentType || '', d.country?.countryName || 'Vietnam', d.documentNumber || '',
          fmtDate(d.issueDate), fmtDate(d.expiryDate), d.notes || ''
        ])
        R++
      }
      // +1 empty row
      immigRow(R, ['', '', '', '', '', ''])
      R++

      // =============== 4. Licenses ===============
      secHead(R, '4. Licenses')
      R++
      // Cert column headers
      certRow(R, ['No.', 'Name', 'Issued by', 'Number', 'Date of issue', 'Date of expiry', 'Remark'], true)
      R++

      // 4.1. National Licenses (Vietnam) — DYNAMIC
      subSecHead(R, '4.1. National Licenses (Vietnam)')
      R++

      const cocDocs = (seafarerDocuments || []).filter((d: any) =>
        d.documentType?.toLowerCase() === 'coc' || d.documentType?.toLowerCase() === 'certificate of competency'
      )
      cocDocs.forEach((d: any, i: number) => {
        certRow(R, [
          `${i + 1}`, d.documentType || 'CoC', d.country?.countryName || 'Vietnam',
          d.documentNumber || '', fmtDate(d.issueDate), fmtDate(d.expiryDate), d.notes || ''
        ])
        R++
      })
      // +1 empty row
      certRow(R, ['', '', '', '', '', '', ''])
      R++

      // =============== 5. Training Certificate ===============
      secHead(R, '5. Training Certificate')
      R++

      // 5.1. STCW — DYNAMIC
      subSecHead(R, '5.1. Training Certificate (required by STCW)')
      R++
      const crewCerts = certificates || []
      crewCerts.forEach((c: any, i: number) => {
        certRow(R, [
          `${i + 1}`,
          c.certificate?.certificateName || c.certificateName || '',
          c.issuingAuthority || c.country?.countryName || '',
          c.certificateNumber || '', fmtDate(c.issueDate), fmtDate(c.expiryDate), c.notes || ''
        ])
        R++
      })
      certRow(R, ['', '', '', '', '', '', ''])
      R++

      // 5.2. Owner — DYNAMIC
      subSecHead(R, '5.2. Training Certificate (required by Owner)')
      R++
      // No data source yet — just +1 empty row
      certRow(R, ['', '', '', '', '', '', ''])
      R++

      // 5.3. In house training — DYNAMIC
      subSecHead(R, '5.3. In house training course')
      R++
      employmentDocuments.forEach((d: any, i: number) => {
        certRow(R, [
          `${i + 1}`, d.documentType || '', d.country?.countryName || 'Vietnam',
          d.documentNumber || '', fmtDate(d.issueDate), fmtDate(d.expiryDate), d.notes || ''
        ])
        R++
      })
      certRow(R, ['', '', '', '', '', '', ''])
      R++

      // =============== 6. Other certificate — DYNAMIC ===============
      secHead(R, '6. Other certificate')
      R++
      healthDocuments.forEach((d: any, i: number) => {
        certRow(R, [
          `${i + 1}`, d.documentType || '', d.country?.countryName || 'Vietnam',
          d.documentNumber || '', fmtDate(d.issueDate), fmtDate(d.expiryDate), d.notes || ''
        ])
        R++
      })
      certRow(R, ['', '', '', '', '', '', ''])
      R++

      // =============== 7. Remark ===============
      secHead(R, '7. Remark')
      R++
      mSet(R, 1, TC, crew.notes || '', normFont(10), DATA_FILL, lAlign)
      ws.getRow(R).height = 30

      // Set minimum row height of 20 for all used rows
      for (let r = 1; r <= R; r++) {
        const row = ws.getRow(r)
        if (!row.height || row.height < 20) row.height = 20
      }

      // Export file
      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `BIO-DATA_${crew.crewId || crew.fullName}_${format(new Date(), 'dd-MM-yyyy')}.xlsx`
      link.click()
      URL.revokeObjectURL(url)
      
      toast.success(t('crew.edDetail.messages.excelExported'))
    } catch (error: any) {
      console.error('Failed to export Excel:', error)
      toast.error(error.message || t('crew.edDetail.messages.uploadFailed'))
    }
  }

  const handleSave = async () => {
    if (!crew) return
    
    try {
      setSaving(true)
      const updated = await maritimeService.crew.update(crew.id, editedCrew)
      setCrew(updated)
      setEditedCrew(updated)
      toast.success(t('crew.edDetail.messages.updateSuccess'))
    } catch (error: any) {
      console.error('❌ Failed to save crew:', error)
      toast.error(error.message || t('crew.edDetail.messages.updateFailed'))
    } finally {
      setSaving(false)
    }
  }

  const calculateAge = (dateOfBirth: string | undefined) => {
    if (!dateOfBirth) return ''
    const today = new Date()
    const birthDate = new Date(dateOfBirth)
    let age = today.getFullYear() - birthDate.getFullYear()
    const monthDiff = today.getMonth() - birthDate.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--
    }
    return age.toString()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (!crew) {
    return (
      <div className="p-8">
        <div className="bg-red-50 text-red-700 px-4 py-3 rounded">
          <p className="font-semibold">{t('crew.edDetail.error.loadingFailed')}</p>
          <p className="text-sm">{t('crew.edDetail.error.crewNotFound')}</p>
        </div>
      </div>
    )
  }

  const age = calculateAge(editedCrew.dateOfBirth)

  // Section verification checkbox component for pending review
  const SectionCheckbox = ({ section, label: _label }: { section: string; label: string }) => {
    if (!isPendingReview) return null
    return (
      <div className="flex items-center justify-end mt-3 pt-3 border-t border-gray-100">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <span className={`text-xs font-medium ${sectionChecklist[section] ? 'text-green-600' : 'text-gray-400'}`}>
            {sectionChecklist[section] ? '✓ ' + t('crew.edDetail.review.verified') : t('crew.edDetail.review.markVerified')}
          </span>
          <input
            type="checkbox"
            checked={sectionChecklist[section] || false}
            onChange={() => toggleSectionCheck(section)}
            className="w-5 h-5 text-green-600 border-2 border-gray-300 rounded focus:ring-green-500 cursor-pointer"
          />
        </label>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-gray-100 rounded"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              EDIT {crew.fullName.toUpperCase()} - {crew.rank?.rankName?.toUpperCase() || t('crew.edDetail.form.rank').toUpperCase()}
              {hasShoreChanges && (
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" title="Có thay đổi từ bờ chưa xem" />
              )}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={exportToPDF}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 flex items-center gap-2 transition-colors"
              title={t('crew.edDetail.messages.pdfExported').replace('!','')}
            >
              <FileDown className="w-4 h-4" />
              <span>PDF</span>
            </button>
            <button 
              onClick={exportToExcel}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-2 transition-colors"
              title={t('crew.edDetail.messages.excelExported').replace('!','')}
            >
              <FileDown className="w-4 h-4" />
              <span>Excel</span>
            </button>
            <PermissionGate permission="crew.update"><button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium disabled:opacity-50"
            >
              {saving ? t('crew.edDetail.messages.updateSuccess').replace('!','...') : t('common.save')}
            </button></PermissionGate>
          </div>
        </div>
      </div>

      {/* Shore Changes Banner */}
      {hasShoreChanges && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 24px', background: '#fef2f2', borderBottom: '2px solid #fca5a5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: '#991b1b' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 22, height: 22, padding: '0 6px', background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 700, borderRadius: 11 }}>{Object.keys(shoreChangeMap).length}</span>
            <span>Bờ đã chỉnh sửa <strong>{Object.keys(shoreChangeMap).length}</strong> trường. Các trường thay đổi được đánh dấu <span style={{ color: '#ef4444', fontWeight: 700 }}>MÀU ĐỎ</span> bên dưới.</span>
          </div>
          <PermissionGate permission="crew.update"><button onClick={handleMarkShoreChangesViewed} style={{ padding: '5px 14px', fontSize: 12, fontWeight: 600, color: '#fff', background: '#0d7377', border: 'none', borderRadius: 4, cursor: 'pointer' }}>✓ Đã xem</button></PermissionGate>
        </div>
      )}

      {/* Pending Review Banner */}
      {isPendingReview && (
        <div className="bg-amber-50 border-b-2 border-amber-300 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 text-sm font-bold rounded-full bg-amber-200 text-amber-800">
                {crew.onboardStatus === 'OnHold' ? t('crew.edDetail.review.onHold') : t('crew.edDetail.review.pendingReview')}
              </span>
              <span className="text-sm text-amber-700">
                {t('crew.edDetail.review.verifyHint').replace('{checked}', String(checkedCount)).replace('{total}', String(totalSections))}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {showHoldNotesInput ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={holdNotes}
                    onChange={(e) => setHoldNotes(e.target.value)}
                    placeholder={t('crew.edDetail.review.notesPlaceholder')}
                    className="px-3 py-1.5 border border-amber-300 rounded text-sm w-72 focus:ring-2 focus:ring-amber-500"
                  />
                  <PermissionGate permission="crew.reject"><button
                    onClick={handleHoldReview}
                    disabled={reviewProcessing}
                    className="px-4 py-1.5 bg-amber-600 text-white text-sm font-medium rounded hover:bg-amber-700 disabled:opacity-50"
                  >
                    {t('crew.edDetail.review.confirmHold')}
                  </button></PermissionGate>
                  <button
                    onClick={() => { setShowHoldNotesInput(false); setHoldNotes('') }}
                    className="px-3 py-1.5 text-gray-600 text-sm rounded hover:bg-gray-100"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              ) : (
                <>
                  <PermissionGate permission="crew.reject"><button
                    onClick={() => setShowHoldNotesInput(true)}
                    disabled={reviewProcessing || allSectionsChecked}
                    className="px-4 py-1.5 bg-amber-500 text-white text-sm font-medium rounded hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={allSectionsChecked ? 'All sections verified - no need to hold' : 'Put on hold and notify shore of missing information'}
                  >
                    ⏸ {t('crew.edDetail.review.holdNotify')}
                  </button></PermissionGate>
                  <PermissionGate permission="crew.approve"><button
                    onClick={handleApproveReview}
                    disabled={reviewProcessing}
                    className="px-4 py-1.5 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    ✓ {t('crew.edDetail.review.approveOnboard')}
                  </button></PermissionGate>
                </>
              )}
            </div>
          </div>
          {crew.reviewNotes && (
            <div className="mt-2 text-sm text-amber-700 bg-amber-100 px-3 py-2 rounded">
              <strong>{t('crew.edDetail.review.prevNotes')}</strong> {crew.reviewNotes}
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="bg-white border-b border-gray-300">
        <div className="px-6">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('basic-data')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'basic-data'
                  ? 'border-blue-600 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              {t('crew.edDetail.tabs.basicData')}
            </button>
            <button
              onClick={() => setActiveTab('documents')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'documents'
                  ? 'border-blue-600 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              {t('crew.edDetail.tabs.documents')}
            </button>

            <button
              onClick={() => setActiveTab('logbook')}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === 'logbook'
                  ? 'border-blue-600 text-blue-600 bg-blue-50'
                  : 'border-transparent text-gray-600 hover:text-gray-800'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              {t('crew.edDetail.tabs.logbook') || 'Sổ nhật ký'}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-3">
        {activeTab === 'basic-data' && (
          <div className="space-y-3">

            {/* Main Form */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              <div className="grid grid-cols-12 gap-6">
                {/* Left Column - Name & Position */}
                <div className="col-span-3 space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.fullName')}</label>
                    <input
                      type="text"
                      value={editedCrew.fullName || ''}
                      onChange={(e) => setEditedCrew({ ...editedCrew, fullName: e.target.value })}
                      className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('fullName')}`}
                    />
                    {changeIndicator('fullName')}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.rank')}</label>
                    <select
                      value={editedCrew.rankId || ''}
                      onChange={(e) => setEditedCrew({ ...editedCrew, rankId: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                    >
                      <option value="">{t('crew.edDetail.form.selectRank')}</option>
                      {ranks.map(rank => (
                        <option key={rank.id} value={rank.id}>
                          {rank.rankName} ({rank.rankCode})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.department')}</label>
                    <input
                      type="text"
                      value={editedCrew.department || ''}
                      onChange={(e) => setEditedCrew({ ...editedCrew, department: e.target.value })}
                      className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('department')}`}
                    />
                    {changeIndicator('department')}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.dateOfBirth')}</label>
                    <input
                      type="date"
                      value={editedCrew.dateOfBirth?.split('T')[0] || ''}
                      onChange={(e) => setEditedCrew({ ...editedCrew, dateOfBirth: e.target.value })}
                      className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('dateOfBirth')}`}
                    />
                    {changeIndicator('dateOfBirth')}
                  </div>
                </div>

                {/* Middle-Left Column - Personal Info */}
                <div className="col-span-3 space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.age')}</label>
                    <input
                      type="text"
                      value={age}
                      readOnly
                      className="w-full px-3 py-2 border border-gray-300 rounded bg-gray-50"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.placeOfBirth')}</label>
                    <input
                      type="text"
                      value={editedCrew.placeOfBirth || ''}
                      onChange={(e) => setEditedCrew({ ...editedCrew, placeOfBirth: e.target.value })}
                      className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('placeOfBirth')}`}
                    />
                    {changeIndicator('placeOfBirth')}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.country')}</label>
                    <select
                      value={editedCrew.countryId || ''}
                      onChange={(e) => setEditedCrew({ ...editedCrew, countryId: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                    >
                      <option value="">{t('crew.edDetail.form.selectCountry')}</option>
                      {countries.map((country) => (
                        <option key={country.id} value={country.id}>
                          {country.countryName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.idCard')}</label>
                    <input
                      type="text"
                      value={editedCrew.idCardNumber || ''}
                      onChange={(e) => setEditedCrew({ ...editedCrew, idCardNumber: e.target.value })}
                      className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('idCardNumber')}`}
                    />
                    {changeIndicator('idCardNumber')}
                  </div>
                </div>

                {/* Middle-Right Column - Contact & Dates */}
                <div className="col-span-3 space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.phone')}</label>
                    <input
                      type="text"
                      value={editedCrew.phoneNumber || ''}
                      onChange={(e) => setEditedCrew({ ...editedCrew, phoneNumber: e.target.value })}
                      className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('phoneNumber')}`}
                    />
                    {changeIndicator('phoneNumber')}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.email')}</label>
                    <input
                      type="email"
                      value={editedCrew.emailAddress || ''}
                      onChange={(e) => setEditedCrew({ ...editedCrew, emailAddress: e.target.value })}
                      className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('emailAddress')}`}
                    />
                    {changeIndicator('emailAddress')}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.maritalStatus')}</label>
                    <select
                      value={editedCrew.maritalStatus || ''}
                      onChange={(e) => setEditedCrew({ ...editedCrew, maritalStatus: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                    >
                      <option value="">{t('crew.edDetail.form.selectStatus')}</option>
                      <option value="Single">Single</option>
                      <option value="Married">{t('crew.edDetail.form.married')}</option>
                      <option value="Divorced">{t('crew.edDetail.form.divorced')}</option>
                      <option value="Widowed">{t('crew.edDetail.form.widowed')}</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.heightCm')}</label>
                      <input
                        type="number"
                        value={editedCrew.height || ''}
                        onChange={(e) => setEditedCrew({ ...editedCrew, height: e.target.value ? Number(e.target.value) : undefined })}
                        className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('height')}`}
                      />
                      {changeIndicator('height')}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.weightKg')}</label>
                      <input
                        type="number"
                        step="0.1"
                        value={editedCrew.weight || ''}
                        onChange={(e) => setEditedCrew({ ...editedCrew, weight: e.target.value ? Number(e.target.value) : undefined })}
                        className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('weight')}`}
                      />
                      {changeIndicator('weight')}
                    </div>
                  </div>
                </div>

                {/* Right Column - Avatar */}
                <div className="col-span-3 flex flex-col items-center">
                  <div className="mb-2">
                    <label className="block text-xs font-medium text-gray-500 uppercase mb-1 text-center">{t('crew.edDetail.form.companyId')}</label>
                    <input
                      type="text"
                      value={editedCrew.crewId || ''}
                      onChange={(e) => setEditedCrew({ ...editedCrew, crewId: e.target.value })}
                      className="w-32 px-3 py-2 border border-gray-300 rounded text-center focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div 
                    className="w-40 h-52 rounded-lg overflow-hidden bg-gray-200 mb-3 relative cursor-pointer hover:opacity-90 transition-opacity shadow-md"
                    onClick={() => {
                      if (!pendingAvatarPreview && editedCrew.photoUrl && editedCrew.photoUrl !== "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'%3E%3Ccircle cx='100' cy='100' r='100' fill='%23e5e7eb'/%3E%3Ccircle cx='100' cy='80' r='35' fill='%239ca3af'/%3E%3Cellipse cx='100' cy='160' rx='60' ry='45' fill='%239ca3af'/%3E%3C/svg%3E") {
                        handleViewImage(editedCrew.photoUrl, '', 'avatar')
                      }
                    }}
                    title={pendingAvatarPreview ? "New avatar (click Save to confirm)" : editedCrew.photoUrl ? "Click to view full size" : "Upload avatar"}
                  >
                    <img
                      src={pendingAvatarPreview || editedCrew.photoUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 260'%3E%3Crect width='200' height='260' fill='%23e5e7eb'/%3E%3Ccircle cx='100' cy='70' r='35' fill='%239ca3af'/%3E%3Cellipse cx='100' cy='180' rx='65' ry='50' fill='%239ca3af'/%3E%3C/svg%3E"}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                    {uploadingAvatar && (
                      <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-4 border-white border-t-transparent"></div>
                      </div>
                    )}
                    {pendingAvatarPreview && !uploadingAvatar && (
                      <div className="absolute top-1 right-1 bg-yellow-500 text-white text-xs px-1.5 py-0.5 rounded font-medium">
                        NEW
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {pendingAvatarFile ? (
                      <>
                        <PermissionGate permission="crew.update"><button
                          onClick={handleAvatarSave}
                          disabled={uploadingAvatar}
                          className={`px-4 py-2 text-white text-sm rounded flex items-center gap-1 ${
                            uploadingAvatar ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'
                          }`}
                        >
                          <Upload className="w-4 h-4" /> Save
                        </button></PermissionGate>
                        <button 
                          onClick={handleCancelAvatarChange}
                          disabled={uploadingAvatar}
                          className="px-4 py-2 text-white text-sm rounded bg-gray-500 hover:bg-gray-600 flex items-center gap-1"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <PermissionGate permission="crew.update"><button
                          onClick={handleAvatarUpload}
                          disabled={uploadingAvatar}
                          className={`px-4 py-2 text-white text-sm rounded flex items-center gap-1 ${
                            uploadingAvatar ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                          }`}
                        >
                          <Upload className="w-4 h-4" /> {t('crew.edDetail.avatar.choose')}
                        </button></PermissionGate>
                        <PermissionGate permission="crew.update"><button
                          onClick={handleDeleteAvatar}
                          disabled={uploadingAvatar || !editedCrew.photoUrl}
                          className={`px-4 py-2 text-white text-sm rounded ${
                            uploadingAvatar || !editedCrew.photoUrl 
                              ? 'bg-gray-400 cursor-not-allowed' 
                              : 'bg-red-600 hover:bg-red-700'
                          }`}
                          title={t('crew.edDetail.messages.deleteAvatarConfirm')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button></PermissionGate>
                      </>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2 text-center">
                    {uploadingAvatar ? t('crew.edDetail.avatar.uploading') : pendingAvatarFile ? t('crew.edDetail.avatar.clickSave') : t('crew.edDetail.avatar.clickChoose')}
                  </p>
                  <div className="mt-4 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={editedCrew.isOnboard}
                      onChange={(e) => setEditedCrew({ ...editedCrew, isOnboard: e.target.checked })}
                      className="w-4 h-4 text-blue-600"
                    />
                    <label className="text-sm font-medium text-gray-700">{t('crew.edDetail.form.onBoard')}</label>
                  </div>
                </div>
              </div>
              <SectionCheckbox section="personalInfo" label="Personal Information" />
            </div>

            {/* {t('crew.edDetail.sections.physicalDetails')} */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h3 className="text-sm font-bold text-gray-700 uppercase mb-4">{t('crew.edDetail.sections.physicalDetails')}</h3>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.bloodGroup')}</label>
                  <select
                    value={editedCrew.bloodGroup || ''}
                    onChange={(e) => setEditedCrew({ ...editedCrew, bloodGroup: e.target.value })}
                    className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('bloodGroup')}`}
                  >
                    <option value="">{t('crew.edDetail.form.select')}</option>
                    <option value="A+">A+</option>
                    <option value="A-">A-</option>
                    <option value="B+">B+</option>
                    <option value="B-">B-</option>
                    <option value="AB+">AB+</option>
                    <option value="AB-">AB-</option>
                    <option value="O+">O+</option>
                    <option value="O-">O-</option>
                  </select>
                  {changeIndicator('bloodGroup')}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.clothingSize')}</label>
                  <input
                    type="text"
                    value={editedCrew.clothingSize || ''}
                    onChange={(e) => setEditedCrew({ ...editedCrew, clothingSize: e.target.value })}
                    placeholder={t('crew.edDetail.form.select')}
                    className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('clothingSize')}`}
                  />
                  {changeIndicator('clothingSize')}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.shoeSize')}</label>
                  <input
                    type="text"
                    value={editedCrew.shoeSize || ''}
                    onChange={(e) => setEditedCrew({ ...editedCrew, shoeSize: e.target.value })}
                    placeholder={t('crew.edDetail.form.select')}
                    className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('shoeSize')}`}
                  />
                  {changeIndicator('shoeSize')}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.cateringSize')}</label>
                  <input
                    type="text"
                    value={editedCrew.cateringSize || ''}
                    onChange={(e) => setEditedCrew({ ...editedCrew, cateringSize: e.target.value })}
                    placeholder={t('crew.edDetail.form.select')}
                    className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('cateringSize')}`}
                  />
                  {changeIndicator('cateringSize')}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={editedCrew.isSmoker || false}
                    onChange={(e) => setEditedCrew({ ...editedCrew, isSmoker: e.target.checked })}
                    className="w-4 h-4 text-blue-600"
                  />
                  <label className="text-sm font-medium text-gray-700">{t('crew.edDetail.form.smoker')}</label>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={editedCrew.isCovidVaccinated || false}
                    onChange={(e) => setEditedCrew({ ...editedCrew, isCovidVaccinated: e.target.checked })}
                    className="w-4 h-4 text-blue-600"
                  />
                  <label className="text-sm font-medium text-gray-700">{t('crew.edDetail.form.covidVaccinated')}</label>
                </div>
              </div>
              <SectionCheckbox section="physicalDetails" label="Physical Details" />
            </div>

            {/* {t('crew.edDetail.sections.employmentDates')} */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h3 className="text-sm font-bold text-gray-700 uppercase mb-4">{t('crew.edDetail.sections.employmentDates')}</h3>
              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.joinDate')}</label>
                  <input
                    type="date"
                    value={editedCrew.joinDate?.split('T')[0] || ''}
                    onChange={(e) => setEditedCrew({ ...editedCrew, joinDate: e.target.value })}
                    className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('joinDate')}`}
                  />
                  {changeIndicator('joinDate')}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.embarkDate')}</label>
                  <input
                    type="date"
                    value={editedCrew.embarkDate?.split('T')[0] || ''}
                    onChange={(e) => setEditedCrew({ ...editedCrew, embarkDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.disembarkDate')}</label>
                  <input
                    type="date"
                    value={editedCrew.disembarkDate?.split('T')[0] || ''}
                    onChange={(e) => setEditedCrew({ ...editedCrew, disembarkDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.contractEnd')}</label>
                  <input
                    type="date"
                    value={editedCrew.contractEnd?.split('T')[0] || ''}
                    onChange={(e) => setEditedCrew({ ...editedCrew, contractEnd: e.target.value })}
                    className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('contractEnd')}`}
                  />
                  {changeIndicator('contractEnd')}
                </div>
              </div>
              <SectionCheckbox section="employmentDates" label="Employment Dates" />
            </div>

            {/* Next of Kin */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h3 className="text-sm font-bold text-gray-700 uppercase mb-4">{t('crew.edDetail.sections.nextOfKin')}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.fullName')}</label>
                  <input
                    type="text"
                    value={editedCrew.nextOfKinName || ''}
                    onChange={(e) => setEditedCrew({ ...editedCrew, nextOfKinName: e.target.value })}
                    className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('nextOfKinName')}`}
                  />
                  {changeIndicator('nextOfKinName')}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.relationship')}</label>
                  <select
                    value={editedCrew.nextOfKinRelation || ''}
                    onChange={(e) => setEditedCrew({ ...editedCrew, nextOfKinRelation: e.target.value })}
                    className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('nextOfKinRelation')}`}
                  >
                    <option value="">{t('crew.edDetail.form.select')}</option>
                    <option value="Father">{t('crew.edDetail.form.father')}</option>
                    <option value="Mother">{t('crew.edDetail.form.mother')}</option>
                    <option value="Spouse">{t('crew.edDetail.form.spouse')}</option>
                    <option value="Sibling">{t('crew.edDetail.form.sibling')}</option>
                    <option value="Child">{t('crew.edDetail.form.child')}</option>
                    <option value="Other">{t('crew.edDetail.form.other')}</option>
                  </select>
                  {changeIndicator('nextOfKinRelation')}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.phone')}</label>
                  <input
                    type="text"
                    value={editedCrew.nextOfKinPhone || ''}
                    onChange={(e) => setEditedCrew({ ...editedCrew, nextOfKinPhone: e.target.value })}
                    className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('nextOfKinPhone')}`}
                  />
                  {changeIndicator('nextOfKinPhone')}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.address')}</label>
                  <input
                    type="text"
                    value={editedCrew.nextOfKinAddress || ''}
                    onChange={(e) => setEditedCrew({ ...editedCrew, nextOfKinAddress: e.target.value })}
                    className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('nextOfKinAddress')}`}
                  />
                  {changeIndicator('nextOfKinAddress')}
                </div>
              </div>
              <SectionCheckbox section="nextOfKin" label="Next of Kin" />
            </div>

            {/* Education */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h3 className="text-sm font-bold text-gray-700 uppercase mb-4">{t('crew.edDetail.sections.education')}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.institution')}</label>
                  <input
                    type="text"
                    value={editedCrew.educationInstitution || ''}
                    onChange={(e) => setEditedCrew({ ...editedCrew, educationInstitution: e.target.value })}
                    placeholder={t('crew.edDetail.form.institution')}
                    className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('educationInstitution')}`}
                  />
                  {changeIndicator('educationInstitution')}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.course')}</label>
                  <input
                    type="text"
                    value={editedCrew.educationCourse || ''}
                    onChange={(e) => setEditedCrew({ ...editedCrew, educationCourse: e.target.value })}
                    placeholder={t('crew.edDetail.form.course')}
                    className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('educationCourse')}`}
                  />
                  {changeIndicator('educationCourse')}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.periodYears')}</label>
                  <input
                    type="number"
                    value={editedCrew.educationPeriodYears || ''}
                    onChange={(e) => setEditedCrew({ ...editedCrew, educationPeriodYears: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder={t('crew.edDetail.form.select')}
                    className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('educationPeriodYears')}`}
                  />
                  {changeIndicator('educationPeriodYears')}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.graduationYear')}</label>
                  <input
                    type="number"
                    value={editedCrew.educationGraduationYear || ''}
                    onChange={(e) => setEditedCrew({ ...editedCrew, educationGraduationYear: e.target.value ? Number(e.target.value) : undefined })}
                    placeholder={t('crew.edDetail.form.select')}
                    className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('educationGraduationYear')}`}
                  />
                  {changeIndicator('educationGraduationYear')}
                </div>
              </div>
              <SectionCheckbox section="education" label="Education Background" />
            </div>

            {/* {t('crew.edDetail.sections.contact')} */}
            <div className="bg-white rounded-lg shadow-sm p-4">
              <h3 className="text-sm font-bold text-gray-700 uppercase mb-4">{t('crew.edDetail.sections.contact')}</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.address')}</label>
                  <textarea
                    value={editedCrew.address || ''}
                    onChange={(e) => setEditedCrew({ ...editedCrew, address: e.target.value })}
                    rows={3}
                    className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('address')}`}
                  />
                  {changeIndicator('address')}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.emergencyLegacy')}</label>
                  <textarea
                    value={editedCrew.emergencyContact || ''}
                    onChange={(e) => setEditedCrew({ ...editedCrew, emergencyContact: e.target.value })}
                    rows={3}
                    className={`w-full px-3 py-2 border rounded focus:outline-none focus:border-blue-500 bg-gray-50 ${fieldBorderClass('emergencyContact')}`}
                    placeholder={t('crew.edDetail.form.emergencyPlaceholder')}
                  />
                  {changeIndicator('emergencyContact')}
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">{t('crew.edDetail.form.notes')}</label>
                <textarea
                  value={editedCrew.notes || ''}
                  onChange={(e) => setEditedCrew({ ...editedCrew, notes: e.target.value })}
                  rows={4}
                  className={`w-full px-3 py-2 border rounded focus:outline-none ${fieldBorderClass('notes')}`}
                />
                {changeIndicator('notes')}
              </div>
              <SectionCheckbox section="contactInfo" label="Contact Information" />
            </div>
          </div>
        )}

        {activeTab === 'documents' && (
          <div className="space-y-2">
            {/* {t('crew.edDetail.docs.identityDocs')} Section */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700 uppercase">
                  {t('crew.edDetail.docs.identityDocs')} ({travelDocuments.length + seafarerDocuments.length + employmentDocuments.length})
                </h3>
                <div className="flex items-center gap-2">
                  <PermissionGate permission="crew.update"><button
                    onClick={() => setIsAddDocumentModalOpen(true)}
                    className="w-6 h-6 rounded bg-green-600 hover:bg-green-700 text-white flex items-center justify-center text-lg font-bold transition-colors"
                    title={t('crew.edDetail.docs.addIdentityDoc')}
                  >
                    +
                  </button></PermissionGate>
                  <button onClick={() => setIsIdentityExpanded(!isIdentityExpanded)} className="w-6 h-6 rounded bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-all">
                    <span className="text-white text-xs transition-transform" style={{ transform: isIdentityExpanded ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}>
                      ▼
                    </span>
                  </button>
                </div>
              </div>
              {isIdentityExpanded && (
                loadingDocuments ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{tableLayout: 'fixed'}}>
                      <thead className="bg-white border-b-2 border-gray-300">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '20%'}}>{t('crew.edDetail.docs.name')}</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '8%'}}>{t('crew.edDetail.docs.files')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '12%'}}>{t('crew.edDetail.docs.number')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '12%'}}>{t('crew.edDetail.docs.dateOfIssue')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '12%'}}>{t('crew.edDetail.docs.country')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '16%'}}>{t('crew.edDetail.docs.expDate')}</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" style={{width: '12%'}}>{t('crew.edDetail.docs.actions')}</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {/* Travel Documents */}
                        {travelDocuments.map((doc) => (
                          <tr key={`travel-${doc.id}`} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200" style={{width: '20%'}}>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{doc.documentType}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center border-r border-gray-200" style={{width: '8%'}}>
                              <button 
                                onClick={() => doc.fileUrl ? handleViewImage(doc.fileUrl, doc.id, 'travel_documents') : handleDocumentFileUpload(doc.id, 'travel_documents')}
                                disabled={uploadingDocId === doc.id}
                                className={`inline-flex items-center justify-center w-8 h-8 rounded text-white transition-colors ${
                                  uploadingDocId === doc.id 
                                    ? 'bg-gray-400 cursor-not-allowed' 
                                    : doc.fileUrl 
                                      ? 'bg-blue-500 hover:bg-blue-600' 
                                      : 'bg-green-500 hover:bg-green-600'
                                }`}
                                title={doc.fileUrl ? t('crew.edDetail.docs.viewFile') : t('crew.edDetail.docs.uploadFile')}
                              >
                                {uploadingDocId === doc.id ? (
                                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                ) : doc.fileUrl ? (
                                  <Eye className="w-4 h-4" />
                                ) : (
                                  <Upload className="w-4 h-4" />
                                )}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200" style={{width: '12%'}}>
                              <div className="truncate">{doc.documentNumber}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200" style={{width: '12%'}}>
                              <div className="truncate">{doc.issueDate ? format(new Date(doc.issueDate), 'dd/MM/yyyy') : '-'}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200" style={{width: '12%'}}>
                              <div className="truncate">{doc.country?.name || doc.countryId === 1 ? 'Vietnam' : '-'}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200" style={{width: '16%'}}>
                              <div className="truncate">{doc.expiryDate ? format(new Date(doc.expiryDate), 'dd/MM/yyyy') : '-'}</div>
                            </td>
                            <td className="px-4 py-3 text-center" style={{width: '12%'}}>
                              <div className="flex items-center justify-center gap-1">
                                <PermissionGate permission="crew.update"><button onClick={() => openEditDoc(doc, 'travel_documents')} title={t('crew.edDetail.docs.edit')}
                                  className="inline-flex items-center justify-center w-8 h-8 rounded border border-gray-300 hover:bg-gray-50">
                                  <Pencil className="w-4 h-4 text-gray-500" />
                                </button></PermissionGate>
                              </div>
                            </td>
                          </tr>
                        ))}
                        
                        {/* Seafarer Documents */}
                        {seafarerDocuments.map((doc) => (
                          <tr key={`seafarer-${doc.id}`} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200" style={{width: '20%'}}>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{doc.documentType}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center border-r border-gray-200" style={{width: '8%'}}>
                              <button 
                                onClick={() => doc.fileUrl ? handleViewImage(doc.fileUrl, doc.id, 'seafarer_documents') : handleDocumentFileUpload(doc.id, 'seafarer_documents')}
                                disabled={uploadingDocId === doc.id}
                                className={`inline-flex items-center justify-center w-8 h-8 rounded text-white transition-colors ${
                                  uploadingDocId === doc.id 
                                    ? 'bg-gray-400 cursor-not-allowed' 
                                    : doc.fileUrl 
                                      ? 'bg-blue-500 hover:bg-blue-600' 
                                      : 'bg-green-500 hover:bg-green-600'
                                }`}
                                title={doc.fileUrl ? t('crew.edDetail.docs.viewFile') : t('crew.edDetail.docs.uploadFile')}
                              >
                                {uploadingDocId === doc.id ? (
                                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                ) : doc.fileUrl ? (
                                  <Eye className="w-4 h-4" />
                                ) : (
                                  <Upload className="w-4 h-4" />
                                )}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200" style={{width: '12%'}}>
                              <div className="truncate">{doc.documentNumber}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200" style={{width: '12%'}}>
                              <div className="truncate">{doc.issueDate ? format(new Date(doc.issueDate), 'dd/MM/yyyy') : '-'}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200" style={{width: '12%'}}>
                              <div className="truncate">{doc.country?.name || doc.countryId === 1 ? 'Vietnam' : '-'}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200" style={{width: '16%'}}>
                              <div className="truncate">{doc.expiryDate ? format(new Date(doc.expiryDate), 'dd/MM/yyyy') : '-'}</div>
                            </td>
                            <td className="px-4 py-3 text-center" style={{width: '12%'}}>
                              <div className="flex items-center justify-center gap-1">
                                <PermissionGate permission="crew.update"><button onClick={() => openEditDoc(doc, 'seafarer_documents')} title={t('crew.edDetail.docs.edit')}
                                  className="inline-flex items-center justify-center w-8 h-8 rounded border border-gray-300 hover:bg-gray-50">
                                  <Pencil className="w-4 h-4 text-gray-500" />
                                </button></PermissionGate>
                              </div>
                            </td>
                          </tr>
                        ))}
                        
                        {/* Employment Documents */}
                        {employmentDocuments.map((doc) => (
                          <tr key={`employment-${doc.id}`} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200" style={{width: '20%'}}>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{doc.documentType}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center border-r border-gray-200" style={{width: '8%'}}>
                              <button 
                                onClick={() => doc.fileUrl ? handleViewImage(doc.fileUrl, doc.id, 'employment_documents') : handleDocumentFileUpload(doc.id, 'employment_documents')}
                                disabled={uploadingDocId === doc.id}
                                className={`inline-flex items-center justify-center w-8 h-8 rounded text-white transition-colors ${
                                  uploadingDocId === doc.id 
                                    ? 'bg-gray-400 cursor-not-allowed' 
                                    : doc.fileUrl 
                                      ? 'bg-blue-500 hover:bg-blue-600' 
                                      : 'bg-green-500 hover:bg-green-600'
                                }`}
                                title={doc.fileUrl ? t('crew.edDetail.docs.viewFile') : t('crew.edDetail.docs.uploadFile')}
                              >
                                {uploadingDocId === doc.id ? (
                                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                ) : doc.fileUrl ? (
                                  <Eye className="w-4 h-4" />
                                ) : (
                                  <Upload className="w-4 h-4" />
                                )}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200" style={{width: '12%'}}>
                              <div className="truncate">{doc.documentNumber}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200" style={{width: '12%'}}>
                              <div className="truncate">{doc.issueDate ? format(new Date(doc.issueDate), 'dd/MM/yyyy') : '-'}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200" style={{width: '12%'}}>
                              <div className="truncate">{doc.country?.name || doc.countryId === 1 ? 'Vietnam' : '-'}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200" style={{width: '16%'}}>
                              <div className="truncate">{doc.expiryDate ? format(new Date(doc.expiryDate), 'dd/MM/yyyy') : '-'}</div>
                            </td>
                            <td className="px-4 py-3 text-center" style={{width: '12%'}}>
                              <div className="flex items-center justify-center gap-1">
                                <PermissionGate permission="crew.update"><button onClick={() => openEditDoc(doc, 'employment_documents')} title={t('crew.edDetail.docs.edit')}
                                  className="inline-flex items-center justify-center w-8 h-8 rounded border border-gray-300 hover:bg-gray-50">
                                  <Pencil className="w-4 h-4 text-gray-500" />
                                </button></PermissionGate>
                              </div>
                            </td>
                          </tr>
                        ))}
                        
                        {(travelDocuments.length + seafarerDocuments.length + employmentDocuments.length) === 0 && (
                          <tr className="border-b border-gray-100">
                            <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                              {t('crew.edDetail.docs.noIdentityDocs')}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>

            {/* {t('crew.edDetail.docs.healthDocs')} Section */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700 uppercase">{t('crew.edDetail.docs.healthDocs')} ({healthDocuments.length})</h3>
                <div className="flex items-center gap-2">
                  <PermissionGate permission="crew.update"><button
                    onClick={() => setIsAddHealthDocumentModalOpen(true)}
                    className="w-6 h-6 rounded bg-green-600 hover:bg-green-700 text-white flex items-center justify-center text-lg font-bold transition-colors"
                    title={t('crew.edDetail.docs.addHealthDoc')}
                  >
                    +
                  </button></PermissionGate>
                  <button onClick={() => setIsHealthExpanded(!isHealthExpanded)} className="w-6 h-6 rounded bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-all">
                    <span className="text-white text-xs transition-transform" style={{ transform: isHealthExpanded ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}>
                      ▼
                    </span>
                  </button>
                </div>
              </div>
              {isHealthExpanded && (
                loadingDocuments ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{tableLayout: 'fixed'}}>
                      <thead className="bg-white border-b-2 border-gray-300">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '20%'}}>{t('crew.edDetail.docs.name')}</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '8%'}}>{t('crew.edDetail.docs.files')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '12%'}}>{t('crew.edDetail.docs.number')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '12%'}}>{t('crew.edDetail.docs.dateOfIssue')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '16%'}}>{t('crew.edDetail.docs.expDate')}</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" style={{width: '12%'}}>{t('crew.edDetail.docs.actions')}</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {healthDocuments.map((doc) => (
                          <tr key={`health-${doc.id}`} className="border-b border-gray-100 hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200" style={{width: '20%'}}>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{doc.documentType}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center border-r border-gray-200" style={{width: '8%'}}>
                              <button 
                                onClick={() => doc.fileUrl ? handleViewImage(doc.fileUrl, doc.id, 'health_documents') : handleDocumentFileUpload(doc.id, 'health_documents')}
                                disabled={uploadingDocId === doc.id}
                                className={`inline-flex items-center justify-center w-8 h-8 rounded text-white transition-colors ${
                                  uploadingDocId === doc.id 
                                    ? 'bg-gray-400 cursor-not-allowed' 
                                    : doc.fileUrl 
                                      ? 'bg-blue-500 hover:bg-blue-600' 
                                      : 'bg-green-500 hover:bg-green-600'
                                }`}
                                title={doc.fileUrl ? t('crew.edDetail.docs.viewFile') : t('crew.edDetail.docs.uploadFile')}
                              >
                                {uploadingDocId === doc.id ? (
                                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                ) : doc.fileUrl ? (
                                  <Eye className="w-4 h-4" />
                                ) : (
                                  <Upload className="w-4 h-4" />
                                )}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200" style={{width: '12%'}}>
                              <div className="truncate">{doc.documentNumber}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200" style={{width: '12%'}}>
                              <div className="truncate">{doc.issueDate ? format(new Date(doc.issueDate), 'dd/MM/yyyy') : '-'}</div>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200" style={{width: '16%'}}>
                              <div className="truncate">{doc.expiryDate ? format(new Date(doc.expiryDate), 'dd/MM/yyyy') : '-'}</div>
                            </td>
                            <td className="px-4 py-3 text-center" style={{width: '12%'}}>
                              <div className="flex items-center justify-center gap-1">
                                <PermissionGate permission="crew.update"><button onClick={() => openEditDoc(doc, 'health_documents')} title={t('crew.edDetail.docs.edit')}
                                  className="inline-flex items-center justify-center w-8 h-8 rounded border border-gray-300 hover:bg-gray-50">
                                  <Pencil className="w-4 h-4 text-gray-500" />
                                </button></PermissionGate>
                              </div>
                            </td>
                          </tr>
                        ))}
                        
                        {healthDocuments.length === 0 && (
                          <tr className="border-b border-gray-100">
                            <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                              {t('crew.edDetail.docs.noHealthDocs')}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )
              )}
            </div>

            {/* CERTIFICATES Section */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700 uppercase">{t('crew.edDetail.docs.certificates')} ({certificates.length})</h3>
                <div className="flex items-center gap-2">
                  <PermissionGate permission={'certificates.create'}><button
                    onClick={() => setShowAddCertModal(true)}
                    className="w-6 h-6 rounded bg-green-600 hover:bg-green-700 text-white flex items-center justify-center text-lg font-bold transition-colors"
                    title={t('crew.edDetail.docs.addCertificate')}
                  >
                    +
                  </button></PermissionGate>
                  <button onClick={() => setIsCertificatesExpanded(!isCertificatesExpanded)} className="w-6 h-6 rounded bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center transition-all">
                    <span className="text-white text-xs transition-transform" style={{ transform: isCertificatesExpanded ? 'rotate(180deg)' : 'rotate(0deg)', display: 'inline-block' }}>
                      ▼
                    </span>
                  </button>
                </div>
              </div>
              {isCertificatesExpanded && (
                loadingCertificates ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : certificates && certificates.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{tableLayout: 'fixed'}}>
                      <thead className="bg-white border-b-2 border-gray-300">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '15%'}}>{t('crew.edDetail.docs.certName')}</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '6%'}}>{t('crew.edDetail.docs.files')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '7%'}}>{t('crew.edDetail.docs.coc')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '9%'}}>{t('crew.edDetail.docs.country')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '11%'}}>{t('crew.edDetail.docs.certNumber')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '9%'}}>{t('crew.edDetail.docs.issueDate')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '9%'}}>{t('crew.edDetail.docs.expiryDate')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '14%'}}>{t('crew.edDetail.docs.issuingAuth')}</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200" style={{width: '10%'}}>{t('crew.edDetail.docs.status')}</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider" style={{width: '10%'}}>{t('crew.edDetail.docs.actions')}</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {certificates.map((cert) => {
                          const getCertStatus = (expiryDate: string) => {
                            if (!expiryDate) return { icon: AlertTriangle, status: t('crew.edDetail.docs.na'), color: 'text-gray-500', bgColor: 'bg-gray-100' }
                            const daysLeft = differenceInDays(parseISO(expiryDate), new Date())
                            if (daysLeft < 0) {
                              return { icon: XCircle, status: t('crew.edDetail.docs.expired'), color: 'text-red-600', bgColor: 'bg-red-100' }
                            } else if (daysLeft < 90) {
                              return { icon: AlertTriangle, status: t('crew.edDetail.docs.expiring'), color: 'text-yellow-600', bgColor: 'bg-yellow-100' }
                            } else {
                              return { icon: CheckCircle, status: t('crew.edDetail.docs.valid'), color: 'text-green-600', bgColor: 'bg-green-100' }
                            }
                          }
                          
                          const status = getCertStatus(cert.expiryDate)
                          const StatusIcon = status.icon
                          const daysLeft = cert.expiryDate ? differenceInDays(parseISO(cert.expiryDate), new Date()) : null
                          
                          return (
                            <tr key={cert.id} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm border-r border-gray-200" style={{width: '15%'}}>
                                <div className="font-medium text-gray-900 truncate">
                                  {cert.certificate?.certificateName || cert.certificateName || t('crew.edDetail.docs.unknownCert')}
                                </div>
                                <div className="text-xs text-gray-500 truncate">
                                  {cert.certificate?.certificateCode || cert.certificateCode || ''}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center border-r border-gray-200" style={{width: '6%'}}>
                                <button 
                                  onClick={() => cert.documentFilePath ? handleViewCertificateImage(cert.documentFilePath, cert.id) : handleCertificateFileUpload(cert.id)}
                                  disabled={uploadingCertId === cert.id}
                                  className={`inline-flex items-center justify-center w-8 h-8 rounded text-white transition-colors ${
                                    uploadingCertId === cert.id 
                                      ? 'bg-gray-400 cursor-not-allowed' 
                                      : cert.documentFilePath 
                                        ? 'bg-blue-500 hover:bg-blue-600' 
                                        : 'bg-green-500 hover:bg-green-600'
                                  }`}
                                  title={cert.documentFilePath ? t('crew.edDetail.docs.viewFile') : t('crew.edDetail.docs.uploadFile')}
                                >
                                  {uploadingCertId === cert.id ? (
                                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                                  ) : cert.documentFilePath ? (
                                    <Eye className="w-4 h-4" />
                                  ) : (
                                    <Upload className="w-4 h-4" />
                                  )}
                                </button>
                              </td>
                              <td className="px-4 py-3 text-sm border-r border-gray-200" style={{width: '7%'}}>
                                {cert.certificateOfCompetency ? (
                                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                                    cert.certificateOfCompetency === 'National' 
                                      ? 'bg-blue-100 text-blue-800' 
                                      : 'bg-purple-100 text-purple-800'
                                  }`}>
                                    {cert.certificateOfCompetency}
                                  </span>
                                ) : '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200" style={{width: '9%'}}>
                                <div className="truncate">{cert.country?.countryName || cert.countryName || '-'}</div>
                              </td>
                              <td className="px-4 py-3 text-sm border-r border-gray-200" style={{width: '11%'}}>
                                <code className="text-xs font-mono text-gray-900 truncate block">
                                  {cert.certificateNumber || '-'}
                                </code>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200" style={{width: '9%'}}>
                                <div className="truncate">
                                  {cert.issueDate ? format(parseISO(cert.issueDate), 'dd MMM yyyy') : '-'}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm border-r border-gray-200" style={{width: '9%'}}>
                                <div className="text-gray-900 font-medium truncate">
                                  {cert.expiryDate ? format(parseISO(cert.expiryDate), 'dd MMM yyyy') : '-'}
                                </div>
                                {daysLeft !== null && (
                                  <div className={`text-xs ${status.color} truncate`}>
                                    {t('crew.edDetail.docs.daysLeft', { days: daysLeft })}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-700 border-r border-gray-200" style={{width: '14%'}}>
                                <div className="truncate">
                                  {cert.issuingAuthority || '-'}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-sm border-r border-gray-200" style={{width: '10%'}}>
                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold ${status.bgColor} ${status.color}`}>
                                  <StatusIcon className="w-3 h-3" />
                                  {status.status}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center" style={{width: '10%'}}>
                                <div className="flex items-center justify-center gap-1">
                                  <PermissionGate permission={'certificates.update'}><button onClick={() => openEditCert(cert)} title={t('crew.edDetail.docs.edit')}
                                    className="inline-flex items-center justify-center w-8 h-8 rounded border border-gray-300 hover:bg-gray-50">
                                    <Pencil className="w-4 h-4 text-gray-500" />
                                  </button></PermissionGate>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-500 mb-4">{t('crew.edDetail.docs.noCertificates')}</p>
                  </div>
                )
              )}
            </div>
            {isPendingReview && (
              <div className="bg-white rounded-lg shadow-sm p-4">
                <SectionCheckbox section="documents" label="Documents & Certificates" />
              </div>
            )}
          </div>
        )}



        {activeTab === 'logbook' && id && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <CrewLogbookSection crewMemberId={id} onSaved={loadCrewDetails} />
          </div>
        )}
      </div>

      <AddDocumentModal
        isOpen={isAddDocumentModalOpen}
        crewMemberId={id || ''}
        editingDocument={editingDoc}
        editingTable={editingDocTable}
        onClose={() => { setIsAddDocumentModalOpen(false); setEditingDoc(null); setEditingDocTable(null) }}
        onSuccess={() => {
          if (id) {
            loadDocuments(id)
          }
        }}
      />

      <AddHealthDocumentModal
        isOpen={isAddHealthDocumentModalOpen}
        crewMemberId={id || ''}
        editingDocument={editingDoc}
        onClose={() => { setIsAddHealthDocumentModalOpen(false); setEditingDoc(null); setEditingDocTable(null) }}
        onSuccess={() => {
          if (id) {
            loadDocuments(id)
          }
        }}
      />

      <ImageViewerModal
        isOpen={isImageViewerOpen}
        imageUrl={imageViewerUrl}
        documentId={imageViewerDocId || undefined}
        targetTable={imageViewerTargetTable || undefined}
        customUploadHandler={viewingCertificateId ? handleCertificateUploadHandler : undefined}
        onClose={() => {
          setIsImageViewerOpen(false)
          setImageViewerUrl(null)
          setImageViewerDocId(null)
          setImageViewerTargetTable(null)
          setViewingCertificateId(null)
        }}
        onFileChanged={() => {
          if (id) {
            loadDocuments(id)
            // Also reload certificates if we were viewing a certificate image
            if (viewingCertificateId) {
              maritimeService.certificates.getCrewCertificatesByCrewId(id)
                .then(certs => setCertificates(certs))
                .catch(() => {})
            }
          }
        }}
      />

      <AddCrewCertificateModal
        isOpen={showAddCertModal}
        editingCertificate={editingCert}
        onClose={() => { setShowAddCertModal(false); setEditingCert(null) }}
        onSave={() => {
          if (id) {
            // Reload certificates
            setLoadingCertificates(true)
            maritimeService.certificates.getCrewCertificatesByCrewId(id)
              .then(certs => setCertificates(certs))
              .catch(() => setCertificates([]))
              .finally(() => setLoadingCertificates(false))
          }
        }}
        crewId={id}
      />
    </div>
  )
}
     