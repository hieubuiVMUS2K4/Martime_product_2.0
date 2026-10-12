import { PermissionGate } from '@/components/auth/PermissionGate'
import { useEffect, useState, useMemo } from 'react'
import { toast } from 'sonner'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Upload,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Eye,
  BookOpen,
  Pencil
} from 'lucide-react'
import { CrewMember } from '../../types/maritime.types'
import { maritimeService } from '../../services/maritime.service'
import { format } from 'date-fns'
import AddDocumentModal from '../../components/crew/AddDocumentModal'
import AddHealthDocumentModal from '../../components/crew/AddHealthDocumentModal'
import ImageViewerModal from '../../components/crew/ImageViewerModal'
import { AddCrewCertificateModal } from './AddCrewCertificateModal'
import { useTranslationSafe } from '@/contexts/I18nContext'
import jsPDF from 'jspdf' 
import 'jspdf-autotable'
import { CrewLogbookSection } from './CrewLogbookSection'
import { CrewProfileHeader } from './profile/CrewProfileHeader'
import { CrewBasicInfo } from './profile/CrewBasicInfo'
import { ALL_FIELD_KEYS } from './profile/crewProfileFields'
import { DataTable, TableActions, TableIconButton, type Column } from '@/components/common/DataTable'
import { usePermission } from '@/stores/permissions.store'

type TabType = 'basic-data' | 'documents' | 'logbook'

export function CrewDetailPage() {
  const { t } = useTranslationSafe()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  
  const [crew, setCrew] = useState<CrewMember | null>(null)
  const [loading, setLoading] = useState(true)
  const [editedCrew, setEditedCrew] = useState<Partial<CrewMember>>({})
  const [saving, setSaving] = useState(false)
  /** Hồ sơ mở ở chế độ XEM; bấm "Sửa hồ sơ" mới sửa được (giống bờ). */
  const [editing, setEditing] = useState(false)
  const [manualOverride, setManualOverride] = useState(false)
  const canUpdate = usePermission('crew.update')
  const [activeTab, setActiveTab] = useState<TabType>('basic-data')
  const [certificates, setCertificates] = useState<any[]>([])
  const [loadingCertificates, setLoadingCertificates] = useState(false)
  const [travelDocuments, setTravelDocuments] = useState<any[]>([])
  const [seafarerDocuments, setSeafarerDocuments] = useState<any[]>([])
  const [employmentDocuments, setEmploymentDocuments] = useState<any[]>([])
  const [healthDocuments, setHealthDocuments] = useState<any[]>([])
  const [loadingDocuments, setLoadingDocuments] = useState(false)
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
      setEditing(false)
      setManualOverride(false)
      toast.success(t('crew.edDetail.messages.updateSuccess'))
    } catch (error: any) {
      console.error('❌ Failed to save crew:', error)
      toast.error(error.message || t('crew.edDetail.messages.updateFailed'))
    } finally {
      setSaving(false)
    }
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


  const isDirty = ALL_FIELD_KEYS.some(k => String((editedCrew as Record<string, unknown>)[k] ?? '') !== String((crew as unknown as Record<string, unknown>)[k] ?? ''))
  const cancelEdit = () => {
    if (isDirty && !window.confirm('Bỏ các thay đổi chưa lưu?')) return
    setEditedCrew(crew)
    setEditing(false)
    setManualOverride(false)
  }

  // ── Bảng tài liệu (cùng cột với bờ) ──
  type DocRow = { id: string; documentType?: string; documentNumber?: string; issueDate?: string; expiryDate?: string; fileUrl?: string; country?: { countryName?: string }; countryName?: string; _table: string }
  const tag = (rows: any[], table: string): DocRow[] => rows.map(r => ({ ...r, _table: table }))
  const identityDocs: DocRow[] = [...tag(travelDocuments, 'travel_documents'), ...tag(seafarerDocuments, 'seafarer_documents'), ...tag(employmentDocuments, 'employment_documents')]
  const healthRows: DocRow[] = tag(healthDocuments, 'health_documents')
  const DOC_GROUP: Record<string, string> = { travel_documents: 'Đi lại', seafarer_documents: 'Thuyền viên', employment_documents: 'Lao động', health_documents: 'Y tế' }
  const daysLeftOf = (d?: string) => (d ? Math.floor((new Date(d).getTime() - Date.now()) / 86400000) : undefined)
  const dateVi = (d?: string) => (d ? new Date(d).toLocaleDateString('vi-VN') : '')
  const daysCell = (d?: string) => {
    const n = daysLeftOf(d)
    return n === undefined ? '—' : <span className={n < 0 ? 'font-semibold text-red-600' : n < 90 ? 'font-semibold text-amber-600' : ''}>{n}</span>
  }
  const dateColumn = <T,>(key: string, header: string, get: (r: T) => string | undefined): Column<T> => ({
    key, header, width: 105, align: 'center', value: r => get(r) ?? '',
    filter: r => dateVi(get(r)), exportValue: r => dateVi(get(r)), render: r => dateVi(get(r)) || '—',
  })

  const docColumns = (identity: boolean): Column<DocRow>[] => [
    ...(identity ? [{ key: 'group', header: 'Nhóm', width: 100, align: 'center' as const, value: (d: DocRow) => DOC_GROUP[d._table] ?? '' }] : []),
    { key: 'type', header: 'Loại giấy tờ', width: 190, value: d => d.documentType ?? '', className: 'font-semibold text-gray-900' },
    { key: 'number', header: 'Số', width: 140, value: d => d.documentNumber ?? '', render: d => d.documentNumber || '—', className: 'font-mono' },
    dateColumn<DocRow>('issue', 'Ngày cấp', d => d.issueDate),
    dateColumn<DocRow>('expiry', 'Ngày hết hạn', d => d.expiryDate),
    { key: 'days', header: 'Còn (ngày)', width: 85, numeric: true, filter: false, value: d => daysLeftOf(d.expiryDate), render: d => daysCell(d.expiryDate) },
    ...(identity ? [{ key: 'country', header: 'Quốc gia', width: 120, value: (d: DocRow) => d.country?.countryName ?? d.countryName ?? '' }] : []),
    {
      key: 'file', header: 'Tệp', width: 60, align: 'center',
      render: d => (
        <TableActions>
          <TableIconButton
            label={d.fileUrl ? 'Xem tệp' : 'Tải tệp lên'}
            icon={d.fileUrl ? <Eye /> : <Upload />}
            disabled={uploadingDocId === d.id || (!d.fileUrl && !canUpdate)}
            onClick={() => (d.fileUrl ? handleViewImage(d.fileUrl, d.id, d._table) : handleDocumentFileUpload(d.id, d._table))}
          />
        </TableActions>
      ),
    },
    ...(canUpdate ? [{
      key: 'actions', header: 'Thao tác', width: 70, align: 'center' as const,
      render: (d: DocRow) => (
        <TableActions>
          <TableIconButton label={`Sửa ${d.documentType ?? ''}`} icon={<Pencil />} onClick={() => openEditDoc(d, d._table)} />
        </TableActions>
      ),
    }] : []),
  ]

  const certStatusOf = (expiry?: string) => {
    const n = daysLeftOf(expiry)
    if (n === undefined) return { label: 'Không rõ', tone: 'bg-gray-100 text-gray-600', Icon: AlertTriangle }
    if (n < 0) return { label: 'Hết hạn', tone: 'bg-red-100 text-red-700', Icon: XCircle }
    if (n < 90) return { label: 'Sắp hết hạn', tone: 'bg-yellow-100 text-yellow-700', Icon: AlertTriangle }
    return { label: 'Còn hiệu lực', tone: 'bg-green-100 text-green-700', Icon: CheckCircle }
  }
  const certColumns: Column<any>[] = [
    {
      key: 'name', header: 'Tên chứng chỉ', width: 210, value: c => c.certificate?.certificateName || c.certificateName || '',
      render: c => (
        <span className="block truncate">
          <span className="font-semibold text-gray-900">{c.certificate?.certificateName || c.certificateName || '—'}</span>
          {(c.certificate?.certificateCode || c.certificateCode) && <span className="ml-1.5 text-xs text-gray-500">· {c.certificate?.certificateCode || c.certificateCode}</span>}
        </span>
      ),
    },
    { key: 'coc', header: 'Loại', width: 90, align: 'center', value: c => c.certificateOfCompetency ?? '', render: c => c.certificateOfCompetency || '—' },
    { key: 'number', header: 'Số CC', width: 120, value: c => c.certificateNumber ?? '', render: c => c.certificateNumber || '—', className: 'font-mono' },
    { key: 'country', header: 'Quốc gia', width: 110, value: c => c.country?.countryName || c.countryName || '' },
    dateColumn<any>('issue', 'Ngày cấp', c => c.issueDate),
    dateColumn<any>('expiry', 'Ngày hết hạn', c => c.expiryDate),
    { key: 'days', header: 'Còn (ngày)', width: 85, numeric: true, filter: false, value: c => daysLeftOf(c.expiryDate), render: c => daysCell(c.expiryDate) },
    { key: 'authority', header: 'Cơ quan cấp', width: 140, value: c => c.issuingAuthority ?? '', render: c => c.issuingAuthority || '—' },
    {
      key: 'status', header: 'Trạng thái', width: 115, align: 'center', value: c => certStatusOf(c.expiryDate).label,
      render: c => {
        const st = certStatusOf(c.expiryDate)
        return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${st.tone}`}><st.Icon className="h-3 w-3" />{st.label}</span>
      },
    },
    {
      key: 'file', header: 'Tệp', width: 60, align: 'center',
      render: c => (
        <TableActions>
          <TableIconButton
            label={c.documentFilePath ? 'Xem tệp' : 'Tải tệp lên'}
            icon={c.documentFilePath ? <Eye /> : <Upload />}
            disabled={uploadingCertId === c.id || (!c.documentFilePath && !canUpdate)}
            onClick={() => (c.documentFilePath ? handleViewCertificateImage(c.documentFilePath, c.id) : handleCertificateFileUpload(c.id))}
          />
        </TableActions>
      ),
    },
    ...(canUpdate ? [{
      key: 'actions', header: 'Thao tác', width: 70, align: 'center' as const,
      render: (c: any) => (
        <TableActions>
          <TableIconButton label="Sửa chứng chỉ" icon={<Pencil />} onClick={() => openEditCert(c)} />
        </TableActions>
      ),
    }] : []),
  ]

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Phần đầu hồ sơ — cùng bố cục với bờ */}
      <CrewProfileHeader
        crew={crew}
        onBack={async () => {
          if (editing && isDirty && !window.confirm('Rời trang và bỏ các thay đổi chưa lưu?')) return
          navigate(-1)
        }}
        editing={editing}
        onEdit={() => { setActiveTab('basic-data'); setEditing(true) }}
        hasShoreChanges={hasShoreChanges}
        avatarSrc={pendingAvatarPreview || editedCrew.photoUrl || undefined}
        avatarPending={!!pendingAvatarFile}
        avatarUploading={uploadingAvatar}
        onAvatarClick={() => { if (!pendingAvatarPreview && editedCrew.photoUrl) handleViewImage(editedCrew.photoUrl, '', 'avatar') }}
        onAvatarChoose={handleAvatarUpload}
        onAvatarSave={handleAvatarSave}
        onAvatarCancel={handleCancelAvatarChange}
        onAvatarDelete={handleDeleteAvatar}
        onExport={format => (format === 'pdf' ? exportToPDF() : exportToExcel())}
      />

      {/* Shore Changes Banner */}
      {hasShoreChanges && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 24px', background: '#fef2f2', borderBottom: '2px solid #fca5a5' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: '0.875rem', color: '#991b1b' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 22, height: 22, padding: '0 6px', background: '#ef4444', color: '#fff', fontSize: '0.875rem', fontWeight: 700, borderRadius: 11 }}>{Object.keys(shoreChangeMap).length}</span>
            <span>Bờ đã chỉnh sửa <strong>{Object.keys(shoreChangeMap).length}</strong> trường. Các trường thay đổi được đánh dấu <span style={{ color: '#ef4444', fontWeight: 700 }}>MÀU ĐỎ</span> bên dưới.</span>
          </div>
          <PermissionGate permission="crew.update"><button onClick={handleMarkShoreChangesViewed} style={{ padding: '5px 14px', fontSize: '0.875rem', fontWeight: 600, color: '#fff', background: '#0d7377', border: 'none', borderRadius: 4, cursor: 'pointer' }}>✓ Đã xem</button></PermissionGate>
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

      {/* Tab — cùng thứ tự với bờ */}
      <nav className="flex overflow-x-auto border-b border-gray-200 bg-white px-6" aria-label="Hồ sơ thuyền viên">
        {([
          { key: 'basic-data', label: 'Thông tin cơ bản', count: Object.keys(shoreChangeMap).filter(k => (ALL_FIELD_KEYS as string[]).includes(k)).length },
          { key: 'documents', label: 'Tài liệu', count: 0, badge: identityDocs.length + healthDocuments.length + certificates.length },
          { key: 'logbook', label: 'Sổ nhật ký', count: 0 },
        ] as { key: TabType; label: string; count: number; badge?: number }[]).map(tab => (
          <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
            className={`-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            }`}>
            {tab.key === 'logbook' && <BookOpen className="h-4 w-4" />}
            {tab.label}
            {tab.count > 0 && <span className="rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">{tab.count}</span>}
            {!!tab.badge && <span className="rounded-full bg-gray-200 px-1.5 text-xs font-semibold text-gray-600">{tab.badge}</span>}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex flex-col gap-4 bg-gray-50 p-4">
        {activeTab === 'basic-data' && (
          <CrewBasicInfo
            edited={editedCrew}
            set={(key, value) => setEditedCrew(prev => ({ ...prev, [key]: value }))}
            editing={editing}
            ranks={ranks}
            countries={countries}
            changeMap={shoreChangeMap}
            manualOverride={manualOverride}
            onManualOverrideChange={setManualOverride}
            reviewing={isPendingReview}
            checklist={sectionChecklist}
            onToggleCheck={(keys, checked) => setSectionChecklist(prev => ({ ...prev, ...Object.fromEntries(keys.map(k => [k, checked])) }))}
          />
        )}

        {activeTab === 'documents' && (
          <>
            {isPendingReview && (
              <label className={`flex cursor-pointer select-none items-center justify-end gap-2 rounded-lg border bg-white px-4 py-2 text-xs font-medium ${
                sectionChecklist.documents ? 'border-green-300 text-green-700' : 'border-gray-200 text-gray-500'}`}>
                <input type="checkbox" className="h-4 w-4 accent-green-600" checked={!!sectionChecklist.documents}
                  onChange={e => setSectionChecklist(prev => ({ ...prev, documents: e.target.checked }))} />
                {sectionChecklist.documents ? '✓ Đã kiểm tra tài liệu' : 'Đánh dấu đã kiểm tra tài liệu'}
              </label>
            )}

            <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <header className="border-b border-gray-200 bg-blue-50 px-4 py-2.5">
                <h2 className="text-sm font-semibold text-blue-700">Giấy tờ định danh ({identityDocs.length})</h2>
              </header>
              <DataTable
                flush
                columns={docColumns(true)}
                data={identityDocs}
                rowKey={d => d.id}
                loading={loadingDocuments}
                itemLabel="giấy tờ"
                emptyMessage="Chưa có giấy tờ định danh."
                searchPlaceholder="Tìm theo loại, số, quốc gia..."
                onAdd={canUpdate ? () => setIsAddDocumentModalOpen(true) : undefined}
                addLabel="Thêm giấy tờ"
                exportOptions={{ fileName: `giay-to-${crew.crewId}`, title: `GIẤY TỜ ĐỊNH DANH — ${crew.fullName.toUpperCase()}` }}
                pageSize={10}
              />
            </section>

            <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <header className="border-b border-gray-200 bg-blue-50 px-4 py-2.5">
                <h2 className="text-sm font-semibold text-blue-700">Tài liệu y tế ({healthDocuments.length})</h2>
              </header>
              <DataTable
                flush
                columns={docColumns(false)}
                data={healthRows}
                rowKey={d => d.id}
                loading={loadingDocuments}
                itemLabel="tài liệu"
                emptyMessage="Chưa có tài liệu y tế."
                searchPlaceholder="Tìm theo loại, số..."
                onAdd={canUpdate ? () => setIsAddHealthDocumentModalOpen(true) : undefined}
                addLabel="Thêm tài liệu y tế"
                exportOptions={{ fileName: `y-te-${crew.crewId}`, title: `TÀI LIỆU Y TẾ — ${crew.fullName.toUpperCase()}` }}
                pageSize={10}
              />
            </section>

            <section className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <header className="border-b border-gray-200 bg-blue-50 px-4 py-2.5">
                <h2 className="text-sm font-semibold text-blue-700">Chứng chỉ ({certificates.length})</h2>
              </header>
              <DataTable
                flush
                columns={certColumns}
                data={certificates}
                rowKey={c => c.id}
                loading={loadingCertificates}
                itemLabel="chứng chỉ"
                emptyMessage="Chưa có chứng chỉ nào."
                searchPlaceholder="Tìm theo tên, số, cơ quan cấp..."
                onAdd={canUpdate ? () => setShowAddCertModal(true) : undefined}
                addLabel="Thêm chứng chỉ"
                exportOptions={{ fileName: `chung-chi-${crew.crewId}`, title: `CHỨNG CHỈ — ${crew.fullName.toUpperCase()}` }}
                pageSize={10}
              />
            </section>
          </>
        )}

        {activeTab === 'logbook' && id && (
          <CrewLogbookSection crewMemberId={id} onSaved={loadCrewDetails} />
        )}
      </div>

      {/* Thanh lưu khi đang sửa — giống bờ */}
      {editing && (
        <div className="sticky bottom-0 z-20 flex items-center justify-between gap-3 border-t border-gray-200 bg-white/95 px-6 py-3 shadow-[0_-4px_12px_rgba(15,23,42,0.06)] backdrop-blur">
          <span className={`text-xs ${isDirty ? 'font-medium text-amber-700' : 'text-gray-500'}`}>
            {isDirty ? '● Có thay đổi chưa lưu' : 'Đang sửa hồ sơ — chưa có thay đổi'}
          </span>
          <div className="flex gap-2">
            <button type="button" onClick={cancelEdit} disabled={saving}
              className="rounded border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50">Hủy</button>
            <button type="button" onClick={handleSave} disabled={saving || !isDirty}
              className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
            </button>
          </div>
        </div>
      )}

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
     