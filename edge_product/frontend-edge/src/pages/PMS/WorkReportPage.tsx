import { usePermission } from '@/stores/permissions.store'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Save,
  CheckCircle,
  ChevronRight,
  X,
  FileText,
  Send,
  AlertTriangle,
  PlayCircle,
  ShieldCheck,
  RotateCcw,
  Clock,
} from 'lucide-react'
import { materialService } from '../../services/materialService'
import { MaintenanceTask, TaskStatusHistory, TaskChecklistItem, MaterialItem } from '../../types/maritime.types'
import type { TaskRiskAssessment, TaskInspectionReport, InspectionJobItem } from '../../types/pms.types'
import { maritimeService } from '../../services/maritime.service'
import { verifyTask, submitTask, startTask, type VerifyTaskDto, type SubmitTaskDto } from '../../services/maintenance.service'
import { equipmentAssetService } from '../../services/equipment-asset.service'
import DeferralReviewModal from '@/components/pms/DeferralReviewModal'
import { format, parseISO } from 'date-fns'
import { vi } from 'date-fns/locale'
import { toast } from 'sonner'
import { useTranslationSafe } from '@/contexts/I18nContext'

const STATUS_KEY_MAP: Record<string, string> = {
  SCHEDULED: 'scheduled', DUE: 'due', OVERDUE: 'overdue',
  IN_PROGRESS: 'inProgress', PENDING_APPROVAL: 'pendingApproval',
  RECTIFY: 'rectify', COMPLETED: 'completed', CANCELLED: 'cancelled',
}

const PRIORITY_KEY_MAP: Record<string, string> = {
  CRITICAL: 'critical', HIGH: 'high', NORMAL: 'normal', MEDIUM: 'medium', LOW: 'low',
}

type BottomTab = 'checklist' | 'materials' | 'risk' | 'inspection'

// Work execution is temporarily handled on mobile; web keeps review actions.
const WEB_WORK_EXECUTION_ACTIONS_ENABLED = false

export default function WorkReportPage() {
  const canExecute = usePermission('pms.work.execute')
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { t } = useTranslationSafe()
  const getStatusLabel = (status: string) => t(`pms.workReport.status.${STATUS_KEY_MAP[status] || 'scheduled'}`)
  const getPriorityLabel = (priority: string) => t(`pms.workReport.priority.${PRIORITY_KEY_MAP[priority] || 'normal'}`)
  const getApiErrorMessage = (error: any, fallbackKey: string) => {
    const data = error?.response?.data
    if (data?.code === 'INSUFFICIENT_STOCK') {
      return t('pms.workReport.toast.insufficientStock', {
        material: data.materialName || data.materialCode || '',
        available: String(data.available ?? '-'),
        required: String(data.required ?? '-'),
      })
    }
    if (data?.code === 'RUNNING_HOURS_BELOW_CURRENT') {
      return t('pms.workReport.toast.runningHoursBelowCurrent', {
        current: String(data.current ?? '-'),
        requested: String(data.requested ?? '-'),
      })
    }
    return data?.error || data?.message || t(fallbackKey)
  }

  const [task, setTask] = useState<MaintenanceTask | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [description, setDescription] = useState('')
  const [reportCompleted, setReportCompleted] = useState(false)
  const [assignedTo, setAssignedTo] = useState('')

  const [equipmentDescription, setEquipmentDescription] = useState('')
  const [equipmentRunningHours, setEquipmentRunningHours] = useState<number>(0)
  const [currentEquipmentHours, setCurrentEquipmentHours] = useState<number>(0)
  const [actualDuration, setActualDuration] = useState<number>(0)
  const [reportText, setReportText] = useState('')

  const [sparePartsUsed, setSparePartsUsed] = useState('')

  // ── ĐGRR (Risk Assessment) form state ──
  const [riskForm, setRiskForm] = useState<Partial<TaskRiskAssessment>>({
    hazardMechanical: false, hazardElectrical: false, hazardChemical: false, hazardEnvironmental: false,
    controlLOTO: false, controlPTW: false, controlPPE: false, controlVentilation: false,
    isApprovedToProceed: true,
  })
  const [riskFilled, setRiskFilled] = useState(false)
  const [savingRisk, setSavingRisk] = useState(false)
  const [riskPdfLoading, setRiskPdfLoading] = useState(false)

  // ── BBKT (Inspection Report) form state ──
  const [bbktForm, setBbktForm] = useState<Partial<TaskInspectionReport>>({})
  const [bbktJobItems, setBbktJobItems] = useState<InspectionJobItem[]>([])
  const [bbktFilled, setBbktFilled] = useState(false)
  const [savingBbkt, setSavingBbkt] = useState(false)
  const [bbktPdfLoading, setBbktPdfLoading] = useState(false)
  const [showDeferralModal, setShowDeferralModal] = useState(false)

  // Comment state

  // Bottom tab
  const [activeTab, setActiveTab] = useState<BottomTab>('checklist')

  // Checklist items (mapped from config, status pushed from mobile)
  const [checklistItems, setChecklistItems] = useState<TaskChecklistItem[]>([])
  const [togglingChecklist, setTogglingChecklist] = useState<string | null>(null)

  // Materials state
  const [materialItems, setMaterialItems] = useState<MaterialItem[]>([])
  const [usedSpareParts, setUsedSpareParts] = useState<Array<{materialItemId: string; materialCode: string; materialName: string; quantityUsed: number; unit: string; onHandQuantity: number}>>([])
  const [materialSearch, setMaterialSearch] = useState('')

  // Approval state
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [verifying, setVerifying] = useState(false)

  // ============================================================
  // DATA LOADING
  // ============================================================
  useEffect(() => {
    if (id) {
      loadTask()      // also sets checklistItems via getById (includes nav property)
      loadCrew()
      // NOTE: loadChecklist() removed – getById in loadTask already loads checklistItems correctly
      loadMaterials()
      loadRiskAssessment()
      loadInspectionReport()
    }
  }, [id])

  // ── Real-time polling: refresh checklist & spare-parts when those tabs are active ──
  // Polls every 8 seconds so web users see mobile updates without F5.
  // Only runs while the page is visible (document not hidden).
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refreshActiveTab = useCallback(async () => {
    if (document.hidden || !id) return
    // Use getById for both tabs: checklist items are included via EF navigation
    // (getChecklist endpoint uses string taskId code, not UUID route param)
    try {
      const data = await maritimeService.maintenance.getById(id)
      if (activeTab === 'checklist') {
        setChecklistItems(data.checklistItems || [])
      } else if (activeTab === 'materials') {
        setTask(data)
        const items = await materialService.getItems()
        setMaterialItems(items || [])
      }
    } catch { /* silent */ }
  }, [id, activeTab])

  const refreshTaskSnapshot = async () => {
    if (!id) return
    try {
      const data = await maritimeService.maintenance.getById(id)
      setTask(data)
      setSparePartsUsed(data.sparePartsUsed || '')
      const items = await materialService.getItems()
      setMaterialItems(items || [])
    } catch { /* silent */ }
  }

  useEffect(() => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    if (activeTab === 'checklist' || activeTab === 'materials') {
      pollingRef.current = setInterval(refreshActiveTab, 5000)
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [activeTab, refreshActiveTab])

  const loadTask = async (showPageLoading = true) => {
    if (!id) return
    try {
      if (showPageLoading) setLoading(true)
      const data = await maritimeService.maintenance.getById(id)
      setTask(data)
      // Populate checklistItems state from initial load so polling updates are reflected
      setChecklistItems(data.checklistItems || [])

      // Populate form from existing task data
      setDescription((data.taskDescription?.split('\n').slice(1).join('\n') || '').replace(/<!--(META|CREW):.*?-->/gs, '').trim())
      setStartDate(data.startedAt ? data.startedAt.substring(0, 16) : '')
      setEndDate(data.completedAt ? data.completedAt.substring(0, 16) : '')
      setAssignedTo(data.assignedTo || '')
      setReportText(data.notes || '')

      // Load receiver from schedule's crew config (no-op, field removed)
      setSparePartsUsed(data.sparePartsUsed || '')
      setEquipmentRunningHours(data.actualRunningHours || data.runningHoursAtLastDone || 0)

      // Auto-fill "Thời gian hiện tại của thiết bị" và "Mô tả thiết bị" từ equipment asset
      if (data.equipmentAssetId) {
        try {
          const asset = await equipmentAssetService.getById(data.equipmentAssetId)
          if (!data.runningHoursAtLastDone) {
            setCurrentEquipmentHours(asset.currentRunningHours ?? 0)
          }
          setEquipmentDescription(asset.notes || '')
        } catch {
          if (!data.runningHoursAtLastDone) {
            setCurrentEquipmentHours(0)
          }
        }
      } else {
        setCurrentEquipmentHours(data.runningHoursAtLastDone || 0)
      }
      setActualDuration(data.actualDuration || 0)
      setReportCompleted(data.checklistCompleted || false)

      // Load status history
      if (data.statusHistory && data.statusHistory.length > 0) {
        // Already loaded
      }
    } catch (error) {
      console.error('Failed to load task:', error)
      toast.error(t('pms.workReport.toast.loadFailed'))
      navigate('/pms/work-planning')
    } finally {
      if (showPageLoading) setLoading(false)
    }
  }

  const loadChecklist = async () => {
    if (!id) return
    try {
      const items = await maritimeService.maintenance.getChecklist(id)
      setChecklistItems(items || [])
    } catch {
      // Checklist may not exist for this task
      setChecklistItems([])
    }
  }

  const loadRiskAssessment = async () => {
    if (!id) return
    try {
      // id here is the UUID of the task record; the API expects taskId (string code)
      // We call after task is loaded but ID is the route param UUID
      const data = await maritimeService.maintenance.getRiskAssessment(id)
      setRiskFilled(data.isFilled)
      setRiskForm(data)
    } catch { /* no-op */ }
  }

  const loadInspectionReport = async () => {
    if (!id) return
    try {
      const data = await maritimeService.maintenance.getInspectionReport(id)
      setBbktFilled(data.isFilled)
      setBbktForm(data)
      if (data.jobItemsJson) {
        try {
          const parsed: InspectionJobItem[] = JSON.parse(data.jobItemsJson)
          setBbktJobItems(Array.isArray(parsed) ? parsed : [])
        } catch { setBbktJobItems([]) }
      }
    } catch { /* no-op */ }
  }

  const loadCrew = async () => {
    try {
      await maritimeService.crew.getAll({ isOnboard: true })
    } catch (error) {
      console.error('Failed to load crew:', error)
    }
  }

  const loadMaterials = async () => {
    try {
      const items = await materialService.getItems()
      setMaterialItems(items || [])
    } catch {
      setMaterialItems([])
    }
  }

  // Parse existing spare parts used from task
  useEffect(() => {
    if (task?.sparePartsUsed) {
      try {
        const parsed = typeof task.sparePartsUsed === 'string' ? JSON.parse(task.sparePartsUsed) : task.sparePartsUsed
        if (Array.isArray(parsed) && parsed.length > 0) {
          setUsedSpareParts(parsed.map((p: any) => ({
            ...p,
            materialItemId: p.materialItemId || '',
            materialCode: p.materialCode || '',
            materialName: p.materialName || '',
            quantityUsed: p.quantityUsed || 0,
            unit: p.unit || 'PCS',
            onHandQuantity: materialItems.find(m => m.id === p.materialItemId)?.onHandQuantity ?? p.onHandQuantity ?? 0,
          })))
        }
      } catch {}
    }
  }, [task?.sparePartsUsed, materialItems])

  useEffect(() => {
    if (!materialItems.length) return
    setUsedSpareParts(prev => prev.map(sp => {
      const live = materialItems.find(m => m.id === sp.materialItemId)
      return live ? { ...sp, onHandQuantity: live.onHandQuantity } : sp
    }))
  }, [materialItems])

  // Checklist toggle handler
  const handleToggleChecklist = async (item: TaskChecklistItem) => {
    if (!task) return
    setTogglingChecklist(item.id)
    try {
      await maritimeService.maintenance.updateChecklistItem(task.taskId, item.id, {
        isCompleted: !item.isCompleted,
        readingValue: item.readingValue,
        remarks: item.remarks,
        isAbnormal: item.isAbnormal,
      })
      setChecklistItems(prev => prev.map(ci =>
        ci.id === item.id ? { ...ci, isCompleted: !ci.isCompleted, completedAt: !ci.isCompleted ? new Date().toISOString() : undefined } : ci
      ))
    } catch (err) {
      console.error('Toggle checklist failed:', err)
      toast.error(t('pms.workReport.toast.checklistUpdateFailed'))
    } finally {
      setTogglingChecklist(null)
    }
  }

  // Checklist inline edit
  const handleChecklistFieldUpdate = async (item: TaskChecklistItem, field: 'readingValue' | 'remarks' | 'isAbnormal', value: any) => {
    if (!task) return
    const update: any = { isCompleted: item.isCompleted }
    update[field] = value
    try {
      await maritimeService.maintenance.updateChecklistItem(task.taskId, item.id, update)
      setChecklistItems(prev => prev.map(ci =>
        ci.id === item.id ? { ...ci, [field]: value } : ci
      ))
    } catch {
      toast.error(t('pms.workReport.toast.updateFailed'))
    }
  }

  // Spare parts management
  const handleAddSparePart = (mat: MaterialItem) => {
    if (usedSpareParts.find(p => p.materialItemId === mat.id)) {
      toast.error(t('pms.workReport.toast.materialAlreadyAdded'))
      return
    }
    setUsedSpareParts(prev => [...prev, {
      materialItemId: mat.id,
      materialCode: mat.itemCode,
      materialName: mat.name,
      quantityUsed: 1,
      unit: mat.unit,
      onHandQuantity: mat.onHandQuantity,
    }])
    setMaterialSearch('')
  }

  const handleRemoveSparePart = (materialItemId: string) => {
    setUsedSpareParts(prev => prev.filter(p => p.materialItemId !== materialItemId))
  }

  const handleSparePartQtyChange = (materialItemId: string, qty: number) => {
    setUsedSpareParts(prev => prev.map(p =>
      p.materialItemId === materialItemId ? { ...p, quantityUsed: Math.max(0, qty) } : p
    ))
  }

  // Sync spare parts to sparePartsUsed string for save
  useEffect(() => {
    if (usedSpareParts.length > 0) {
      setSparePartsUsed(JSON.stringify(usedSpareParts))
    } else {
      setSparePartsUsed('')
    }
  }, [usedSpareParts])

  // Filtered materials for dropdown
  const filteredMaterials = useMemo(() => {
    if (!materialSearch.trim()) return []
    const q = materialSearch.toLowerCase()
    return materialItems.filter(m =>
      (m.itemCode?.toLowerCase().includes(q) || m.name?.toLowerCase().includes(q)) &&
      !usedSpareParts.find(p => p.materialItemId === m.id)
    ).slice(0, 10)
  }, [materialSearch, materialItems, usedSpareParts])

  // ============================================================
  // STATUS HISTORY (from task data)
  // ============================================================
  const statusHistory = useMemo<TaskStatusHistory[]>(() => {
    return task?.statusHistory || []
  }, [task])

  // ============================================================
  // ACTIONS
  // ============================================================
  const handleSave = async () => {
    if (!task) return
    try {
      setSaving(true)
      await maritimeService.maintenance.patch(task.id, {
        taskDescription: description ? `${task.taskDescription?.split('\n')[0] || ''}\n${description}` : task.taskDescription,
        notes: reportText,
        sparePartsUsed,
        assignedTo,
        actualRunningHours: equipmentRunningHours,
        actualDuration,
        checklistCompleted: reportCompleted,
      })
      toast.success(t('pms.workReport.toast.savedSuccess'))
      await loadTask()
    } catch (error: any) {
      console.error('Save failed:', error)
      const msg = error?.response?.data?.error || error?.message || t('pms.workReport.toast.saveFailed')
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveRisk = async () => {
    if (!task) return
    try {
      setSavingRisk(true)
      await maritimeService.maintenance.saveRiskAssessment(task.taskId || id!, riskForm)
      setRiskFilled(true)
      toast.success(t('pms.workReport.toast.riskSaved'))
    } catch (error: any) {
      toast.error(error?.response?.data?.error || t('pms.workReport.toast.riskSaveFailed'))
    } finally {
      setSavingRisk(false)
    }
  }

  const handleSaveBbkt = async () => {
    if (!task) return
    try {
      setSavingBbkt(true)
      const payload: Partial<TaskInspectionReport> = {
        ...bbktForm,
        jobItemsJson: JSON.stringify(bbktJobItems),
      }
      await maritimeService.maintenance.saveInspectionReport(task.taskId || id!, payload)
      setBbktFilled(true)
      toast.success(t('pms.workReport.toast.inspectionSaved'))
    } catch (error: any) {
      toast.error(error?.response?.data?.error || t('pms.workReport.toast.inspectionSaveFailed'))
    } finally {
      setSavingBbkt(false)
    }
  }

  const handleOpenRiskPdf = async () => {
    if (!task) return
    try {
      setRiskPdfLoading(true)
      const blobUrl = await maritimeService.maintenance.downloadRiskAssessmentPdf(task.taskId || id!)
      const a = document.createElement('a')
      a.href = blobUrl
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.click()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000)
    } catch {
      toast.error(t('pms.workReport.toast.riskPdfFailed'))
    } finally {
      setRiskPdfLoading(false)
    }
  }

  const handleOpenBbktPdf = async () => {
    if (!task) return
    try {
      setBbktPdfLoading(true)
      const blobUrl = await maritimeService.maintenance.downloadInspectionReportPdf(task.taskId || id!)
      const a = document.createElement('a')
      a.href = blobUrl
      a.target = '_blank'
      a.rel = 'noopener noreferrer'
      a.click()
      setTimeout(() => URL.revokeObjectURL(blobUrl), 10000)
    } catch {
      toast.error(t('pms.workReport.toast.inspectionPdfFailed'))
    } finally {
      setBbktPdfLoading(false)
    }
  }

  const handleComplete = async () => {
    if (!task) return
    // Validate required forms before submitting
    if (task.requireRiskAssessment && !riskFilled) {
      toast.error(t('pms.workReport.toast.requireRisk'))
      setActiveTab('risk')
      return
    }
    if (task.requireInspectionReport && !bbktFilled) {
      toast.error(t('pms.workReport.toast.requireInspection'))
      setActiveTab('inspection')
      return
    }
    try {
      setSaving(true)
      const dto: SubmitTaskDto = {
        notes: reportText || undefined,
        sparePartsUsed: sparePartsUsed || undefined,
        completedRunningHours: equipmentRunningHours || undefined,
        actualDurationMinutes: actualDuration || undefined,
      }
      await submitTask(task.id, dto)
      toast.success(t('pms.workReport.toast.submitted'))
      await loadTask()
    } catch (error: any) {
      console.error('Submit failed:', error)
      toast.error(getApiErrorMessage(error, 'pms.workReport.toast.submitFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleStartTask = async () => {
    if (!task) return
    try {
      setSaving(true)
      await startTask(task.id)
      toast.success(t('pms.workReport.toast.started'))
      await loadTask()
    } catch (error: any) {
      console.error('Start failed:', error)
      const msg = error?.response?.data?.error || t('pms.workReport.toast.startFailed')
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    navigate('/pms/work-planning')
  }

  const handleApprove = async () => {
    if (!task) return
    // Kiểm tra biểu mẫu bắt buộc trước khi phê duyệt
    if (task.requireRiskAssessment && !riskFilled) {
      toast.error(t('pms.workReport.toast.cannotApproveRisk'))
      setActiveTab('risk')
      return
    }
    if (task.requireInspectionReport && !bbktFilled) {
      toast.error(t('pms.workReport.toast.cannotApproveInsp'))
      setActiveTab('inspection')
      return
    }
    try {
      setVerifying(true)
      const dto: VerifyTaskDto = { action: 'APPROVE', notes: reportText || undefined }
      await verifyTask(task.id, dto)
      toast.success(t('pms.workReport.toast.approved'))
      await loadTask()
    } catch (error: any) {
      console.error('Approve failed:', error)
      toast.error(getApiErrorMessage(error, 'pms.workReport.toast.approveFailed'))
    } finally {
      setVerifying(false)
    }
  }

  const handleReject = async () => {
    if (!task || !rejectionReason.trim()) {
      toast.error(t('pms.workReport.toast.rejectReasonRequired'))
      return
    }
    try {
      setVerifying(true)
      const dto: VerifyTaskDto = { action: 'REJECT', rejectionReason }
      await verifyTask(task.id, dto)
      toast.success(t('pms.workReport.toast.rejected'))
      setShowRejectModal(false)
      setRejectionReason('')
      await loadTask()
    } catch (error) {
      console.error('Reject failed:', error)
      toast.error(t('pms.workReport.toast.rejectFailed'))
    } finally {
      setVerifying(false)
    }
  }

  // ============================================================
  // RENDER
  // ============================================================
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-3 text-gray-500">{t('pms.workReport.loading')}</p>
        </div>
      </div>
    )
  }

  if (!task) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-3" />
          <p className="text-gray-600">{t('pms.workReport.notFound')}</p>
          <button onClick={() => navigate('/pms/work-planning')} className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            {t('pms.workReport.goBack')}
          </button>
        </div>
      </div>
    )
  }

  const statusLabel = getStatusLabel(task.status)
  const priorityLabel = getPriorityLabel(task.priority)
  const taskTitle = (task.taskDescription?.split('\n')[0] || '').replace(/<!--(META|CREW):.*?-->/gs, '').trim()

  // common input class
  const inp = 'w-full px-3 py-1.5 border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm'
  const inpRo = 'w-full px-3 py-1.5 border border-gray-300 bg-gray-50 text-gray-600 text-sm'
  const lbl = 'text-sm font-medium text-gray-700 text-right pr-3 shrink-0 whitespace-nowrap'

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-white">
      {/* ── Header: breadcrumb + action buttons ── */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2.5">
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <button onClick={() => navigate('/pms/work-planning')} className="text-blue-600 hover:underline">
            {taskTitle || t('pms.workReport.breadcrumbReport')}
          </button>
          <ChevronRight size={14} className="text-gray-300" />
          <span className="text-gray-700 font-medium">{t('pms.workReport.breadcrumbWorkReport')}</span>
        </div>
        <div className="flex items-center gap-2">
          {WEB_WORK_EXECUTION_ACTIONS_ENABLED && <>
          <button onClick={handleCancel} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50">
            <X className="w-3.5 h-3.5" /> {t('pms.workReport.cancelBtn')}
          </button>
          <PermissionGate permission="pms.work.execute"><button onClick={handleStartTask} disabled={!(['SCHEDULED', 'UPCOMING', 'DUE', 'OVERDUE', 'RECTIFY', 'MISSING_PIC', 'MISSING_CHECKLIST', 'MISSING_BOTH'].includes(task.status)) || saving} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed">
            <PlayCircle className="w-3.5 h-3.5" /> {t('pms.workReport.startBtn')}
          </button></PermissionGate>
          <PermissionGate permission="pms.work.update"><button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-800 text-white rounded hover:bg-gray-900 disabled:opacity-50">
            <Save className="w-3.5 h-3.5" /> {saving ? t('pms.workReport.saving') : t('pms.workReport.saveBtn')}
          </button></PermissionGate>
          <PermissionGate permission="pms.work.execute"><button onClick={handleComplete} disabled={task.status !== 'IN_PROGRESS' || saving} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
            <Send className="w-3.5 h-3.5" /> {t('pms.workReport.completeBtn')}
          </button></PermissionGate>
          </>}
          <PermissionGate permission="pms.work.reject"><button onClick={() => setShowRejectModal(true)} disabled={task.status !== 'PENDING_APPROVAL' || verifying} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed">
            <RotateCcw className="w-3.5 h-3.5" /> {t('pms.workReport.rejectBtn')}
          </button></PermissionGate>
          <PermissionGate permission="pms.work.approve"><button onClick={handleApprove} disabled={task.status !== 'PENDING_APPROVAL' || verifying} className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed">
            <ShieldCheck className="w-3.5 h-3.5" /> {verifying ? t('pms.workReport.processing') : t('pms.workReport.approveBtn')}
          </button></PermissionGate>
        </div>
      </div>

      {/* ── Deferral Banner ── */}
      {task.hasPendingDeferral && (
        <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-3">
          <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
          <div className="text-sm text-amber-800 flex-1">
            <span className="font-semibold">{t('pms.workReport.deferralPending')}</span>
            {task.pendingDeferral && (
              <span className="ml-2 text-amber-700">
                — {t('pms.workReport.deferralReason', { reason: task.pendingDeferral.reason?.substring(0, 80) })}{(task.pendingDeferral.reason?.length || 0) > 80 ? '...' : ''}
                {task.pendingDeferral.proposedDueDate && (
                  <> · {t('pms.workReport.deferralProposedDate', { date: format(parseISO(task.pendingDeferral.proposedDueDate), 'dd/MM/yyyy') })}</>
                )}
              </span>
            )}
          </div>
          <PermissionGate permission="pms.work.update"><button onClick={() => setShowDeferralModal(true)} className="px-2.5 py-1 text-xs font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded whitespace-nowrap">
            {t('pms.workReport.deferralViewDetails')}
          </button></PermissionGate>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ════════ LEFT: Thông tin công việc + Bottom Tabs (60%) ════════ */}
        <div className="w-[60%] min-w-0 flex flex-col overflow-y-auto">

          {/* Thông tin công việc */}
          <div className="flex-shrink-0">
            <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50">
              <span className="text-sm font-semibold text-gray-700">{t('pms.workReport.taskInfo')}</span>
            </div>
            <div className="px-4 py-4 space-y-3 text-sm border-b border-gray-200">
              {/* Row 1: Mã CV + Tên CV */}
              <div className="flex gap-4">
                <div className="flex items-center flex-1">
                  <label className={lbl} style={{ width: 110 }}>{t('pms.workReport.taskCode')}</label>
                  <input type="text" readOnly value={task.taskId} className={inpRo} />
                </div>
                <div className="flex items-center flex-1">
                  <label className={lbl} style={{ width: 110 }}>{t('pms.workReport.taskName')}</label>
                  <input type="text" readOnly value={taskTitle} className={inpRo} />
                </div>
              </div>
              {/* Row 3: Mô tả công việc */}
              <div className="flex items-start">
                <label className={`${lbl} pt-1.5`} style={{ width: 110 }}>{t('pms.workReport.taskDescription')}</label>
                <textarea rows={4} readOnly value={description} className={`${inpRo} resize-none`} />
              </div>
              {/* Row 4: Mã thiết bị + Tên thiết bị */}
              <div className="flex gap-4">
                <div className="flex items-center flex-1">
                  <label className={lbl} style={{ width: 110 }}>{t('pms.workReport.equipmentCode')}</label>
                  <input type="text" readOnly value={task.equipmentId || task.equipmentAssetId || ''} className={inpRo} />
                </div>
                <div className="flex items-center flex-1">
                  <label className={lbl} style={{ width: 110 }}>{t('pms.workReport.equipmentName')}</label>
                  <input type="text" readOnly value={task.equipmentName || task.equipmentAssetName || task.equipmentGroupName || ''} className={inpRo} />
                </div>
              </div>
              {/* Row 4b: Giờ chạy thiết bị + Giờ hiện tại */}
              <div className="flex gap-4">
                <div className="flex items-center flex-1">
                  <label className={lbl}>{t('pms.workReport.equipRunningHours')}</label>
                  <input type="number" readOnly value={equipmentRunningHours} className={inpRo} />
                  <span className="text-gray-500 text-sm ml-2 shrink-0">{t('pms.workReport.hoursUnit')}</span>
                </div>
                <div className="flex items-center flex-1">
                  <label className={lbl}>{t('pms.workReport.currentEquipHours')}</label>
                  <input type="number" readOnly value={currentEquipmentHours} className={inpRo} />
                  <span className="text-gray-500 text-sm ml-2 shrink-0">{t('pms.workReport.hoursUnit')}</span>
                </div>
              </div>
              {/* Row 5: Mô tả thiết bị */}
              <div className="flex items-start">
                <label className={`${lbl} pt-1.5`} style={{ width: 110 }}>{t('pms.workReport.equipmentDescription')}</label>
                <textarea rows={2} readOnly value={equipmentDescription} className={`${inpRo} resize-none`} />
              </div>
              {/* Row 6: Đánh giá rủi ro + Biên bản kiểm tra */}
              <div className="flex gap-4">
                <div className="flex items-center flex-1">
                  <label className={lbl} style={{ width: 110 }}>{t('pms.workReport.riskAssessmentLabel')}</label>
                  <div className="flex items-center gap-1 flex-1">
                    <input
                      type="text"
                      readOnly
                      value={riskFilled ? `DGRR-${task.taskId}.pdf` : ''}
                      placeholder={riskFilled ? '' : t('pms.workReport.noRiskForm')}
                      className={inpRo}
                    />
                    <button
                      onClick={handleOpenRiskPdf}
                      disabled={!riskFilled || riskPdfLoading}
                      title={riskFilled ? t('pms.workReport.viewRiskPdf') : t('pms.workReport.noData')}
                      className={`p-1.5 shrink-0 transition-colors ${riskFilled ? 'text-red-600 hover:text-red-800' : 'text-gray-300 cursor-not-allowed'}`}
                    >
                      <FileText size={14} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center flex-1">
                  <label className={lbl} style={{ width: 110 }}>{t('pms.workReport.inspectionReportLabel')}</label>
                  <div className="flex items-center gap-1 flex-1">
                    <input
                      type="text"
                      readOnly
                      value={bbktFilled ? `BBKT-${task.taskId}.pdf` : ''}
                      placeholder={bbktFilled ? '' : t('pms.workReport.noInspectionForm')}
                      className={inpRo}
                    />
                    <button
                      onClick={handleOpenBbktPdf}
                      disabled={!bbktFilled || bbktPdfLoading}
                      title={bbktFilled ? t('pms.workReport.viewInspectionPdf') : t('pms.workReport.noData')}
                      className={`p-1.5 shrink-0 transition-colors ${bbktFilled ? 'text-red-600 hover:text-red-800' : 'text-gray-300 cursor-not-allowed'}`}
                    >
                      <FileText size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Bottom tabs: Báo cáo / Vật tư / ĐGRR / BBKT ── */}
          <div className="flex-shrink-0">
            <div className="flex border-b border-gray-200 text-sm">
              {([
                { key: 'checklist' as BottomTab, label: t('pms.workReport.tabChecklist') },
                { key: 'materials' as BottomTab, label: t('pms.workReport.tabMaterials') },
                { key: 'risk' as BottomTab, label: t('pms.workReport.tabRisk') },
                { key: 'inspection' as BottomTab, label: t('pms.workReport.tabInspection') },
              ]).map(tab => (
                <button
                  type="button"
                  key={tab.key}
                  onClick={() => {
                    setActiveTab(tab.key)
                    // Immediately refresh data when switching to live tabs
                    if (tab.key === 'checklist') loadChecklist()
                    else if (tab.key === 'materials') refreshTaskSnapshot()
                  }}
                  className={`px-4 py-2.5 font-medium border-b-2 transition-colors ${
                    activeTab === tab.key ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="px-4 py-4 text-sm">
              {/* Hạng mục kiểm tra tab */}
              {activeTab === 'checklist' && (() => {
                const items = checklistItems.length > 0 ? checklistItems : (task.checklistItems || [])
                const canEdit = canExecute && ['IN_PROGRESS', 'RECTIFY'].includes(task.status)
                return (
                <div>
                  {items.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">{t('pms.workReport.noChecklistItems')}</p>
                  ) : (
                    <table className="w-full text-xs border border-gray-200 rounded">
                      <thead className="bg-blue-50">
                        <tr>
                          <th className="w-10 px-2 py-1.5 text-center border-b border-r border-gray-200">{t('pms.workReport.clIndex')}</th>
                          <th className="px-2 py-1.5 text-left border-b border-r border-gray-200">{t('pms.workReport.clAssetCode')}</th>
                          <th className="px-2 py-1.5 text-left border-b border-r border-gray-200">{t('pms.workReport.clAssetName')}</th>
                          <th className="w-24 px-2 py-1.5 text-center border-b border-r border-gray-200">{t('pms.workReport.clReadingValue')}</th>
                          <th className="w-20 px-2 py-1.5 text-center border-b border-r border-gray-200">{t('pms.workReport.clCompleted')}</th>
                          <th className="w-20 px-2 py-1.5 text-center border-b border-r border-gray-200">{t('pms.workReport.clAbnormal')}</th>
                          <th className="px-2 py-1.5 text-left border-b border-gray-200">{t('pms.workReport.clRemarks')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, i) => (
                          <tr key={item.id} className={`border-b border-gray-100 ${item.isAbnormal ? 'bg-red-50' : ''}`}>
                            <td className="px-2 py-1.5 text-center text-gray-500 border-r border-gray-200">{i + 1}</td>
                            <td className="px-2 py-1.5 text-gray-600 border-r border-gray-200">{item.assetCode}</td>
                            <td className="px-2 py-1.5 border-r border-gray-200">{item.assetName}</td>
                            <td className="px-2 py-1.5 text-center border-r border-gray-200">
                              {canEdit ? (
                                <input
                                  type="number"
                                  className="w-20 px-1 py-0.5 text-xs border border-gray-300 rounded text-center"
                                  value={item.readingValue ?? ''}
                                  onChange={e => {
                                    const val = e.target.value ? parseFloat(e.target.value) : undefined
                                    setChecklistItems(prev => prev.map(ci => ci.id === item.id ? { ...ci, readingValue: val } : ci))
                                  }}
                                  onBlur={e => {
                                    const val = e.target.value ? parseFloat(e.target.value) : undefined
                                    handleChecklistFieldUpdate(item, 'readingValue', val)
                                  }}
                                />
                              ) : (
                                <span>{item.readingValue ?? '—'}</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-center border-r border-gray-200">
                              {canEdit ? (
                                <PermissionGate permission="pms.work.execute"><button
                                  onClick={() => handleToggleChecklist(item)}
                                  disabled={togglingChecklist === item.id}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                                    item.isCompleted
                                      ? 'bg-green-100 text-green-700 hover:bg-green-200'
                                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                  } ${togglingChecklist === item.id ? 'opacity-50' : ''}`}
                                >
                                  <CheckCircle size={12} /> {item.isCompleted ? t('pms.workReport.clPass') : t('pms.workReport.clNotYet')}
                                </button></PermissionGate>
                              ) : (
                                item.isCompleted ? (
                                  <span className="inline-flex items-center gap-1 text-green-600"><CheckCircle size={12} /> {t('pms.workReport.clPass')}</span>
                                ) : (
                                  <span className="text-gray-400">{t('pms.workReport.clNotYet')}</span>
                                )
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-center border-r border-gray-200">
                              {canEdit ? (
                                <PermissionGate permission="pms.work.execute"><button
                                  onClick={() => handleChecklistFieldUpdate(item, 'isAbnormal', !item.isAbnormal)}
                                  className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    item.isAbnormal ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                                  }`}
                                >
                                  {item.isAbnormal ? t('pms.workReport.clYes') : t('pms.workReport.clNo')}
                                </button></PermissionGate>
                              ) : (
                                item.isAbnormal ? (
                                  <span className="text-red-600 font-medium">{t('pms.workReport.clYes')}</span>
                                ) : item.isCompleted ? (
                                  <span className="text-green-600">{t('pms.workReport.clNo')}</span>
                                ) : '—'
                              )}
                            </td>
                            <td className="px-2 py-1.5 border-gray-200">
                              {canEdit ? (
                                <input
                                  type="text"
                                  className="w-full px-1 py-0.5 text-xs border border-gray-300 rounded"
                                  value={item.remarks || ''}
                                  onChange={e => {
                                    setChecklistItems(prev => prev.map(ci => ci.id === item.id ? { ...ci, remarks: e.target.value } : ci))
                                  }}
                                  onBlur={e => handleChecklistFieldUpdate(item, 'remarks', e.target.value)}
                                  placeholder={t('pms.workReport.clEnterRemarks')}
                                />
                              ) : (
                                <span className="text-gray-600">{item.remarks || '—'}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {items.length > 0 && (
                    <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                      <span>{t('pms.workReport.clPassCount')} <strong className="text-green-600">{items.filter(i => i.isCompleted).length}</strong></span>
                      <span>{t('pms.workReport.clPendingCount')} <strong className="text-gray-600">{items.filter(i => !i.isCompleted).length}</strong></span>
                      <span>{t('pms.workReport.clAbnormalCount')} <strong className="text-red-600">{items.filter(i => i.isAbnormal).length}</strong></span>
                    </div>
                  )}
                </div>
                )
              })()}

              {/* Vật tư tab */}
              {activeTab === 'materials' && (() => {
                const canEdit = canExecute && ['IN_PROGRESS', 'RECTIFY'].includes(task.status)
                return (
                <div className="space-y-3">
                  {/* Required spare parts from schedule (read-only) */}
                  {task.requiredSpareParts && (() => {
                    let parts: Array<{materialName?: string; materialCode?: string; quantityRequired?: number; isMandatory?: boolean}> = []
                    if (typeof task.requiredSpareParts === 'string') {
                      try { parts = JSON.parse(task.requiredSpareParts) } catch { parts = [] }
                    } else {
                      parts = task.requiredSpareParts as any[]
                    }
                    return parts.length > 0 ? (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 mb-1">{t('pms.workReport.requiredMaterials')}</p>
                        <table className="w-full text-xs border border-gray-200 rounded">
                          <thead className="bg-blue-50">
                            <tr>
                              <th className="px-2 py-1 text-left border-b">{t('pms.workReport.materialCode')}</th>
                              <th className="px-2 py-1 text-left border-b">{t('pms.workReport.materialName')}</th>
                              <th className="px-2 py-1 text-center border-b">{t('pms.workReport.qty')}</th>
                              <th className="px-2 py-1 text-center border-b">{t('pms.workReport.mandatory')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {parts.map((sp, i) => (
                              <tr key={i} className="border-b border-gray-100">
                                <td className="px-2 py-1 text-gray-600">{sp.materialCode || '—'}</td>
                                <td className="px-2 py-1">{sp.materialName || 'Item'}</td>
                                <td className="px-2 py-1 text-center">{sp.quantityRequired || 1}</td>
                                <td className="px-2 py-1 text-center">{sp.isMandatory ? '✓' : ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : null
                  })()}

                  {/* Used spare parts - interactive */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-xs font-semibold text-gray-500">{t('pms.workReport.usedMaterials')}</p>
                      {canEdit && (
                        <div className="relative">
                          <input
                            type="text"
                            className="w-56 px-2 py-1 text-xs border border-gray-300 rounded"
                            placeholder={t('pms.workReport.searchMaterial')}
                            value={materialSearch}
                            onChange={e => setMaterialSearch(e.target.value)}
                          />
                          {filteredMaterials.length > 0 && (
                            <div className="absolute z-10 top-full left-0 w-80 mt-1 bg-white border border-gray-200 rounded shadow-lg max-h-48 overflow-auto">
                              {filteredMaterials.map(mat => (
                                <PermissionGate permission="pms.work.execute"><button
                                  key={mat.id}
                                  className="w-full text-left px-2 py-1.5 text-xs hover:bg-blue-50 border-b border-gray-100 last:border-0"
                                  onClick={() => handleAddSparePart(mat)}
                                >
                                  <span className="font-medium text-gray-700">{mat.itemCode}</span>
                                  <span className="ml-2 text-gray-600">{mat.name}</span>
                                  <span className="ml-2 text-gray-400">({t('pms.workReport.stockInfo', { qty: mat.onHandQuantity, unit: mat.unit })})</span>
                                </button></PermissionGate>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {usedSpareParts.length > 0 ? (
                      <table className="w-full text-xs border border-gray-200 rounded">
                        <thead className="bg-green-50">
                          <tr>
                            <th className="px-2 py-1 text-left border-b">{t('pms.workReport.materialCode')}</th>
                            <th className="px-2 py-1 text-left border-b">{t('pms.workReport.materialName')}</th>
                            <th className="w-24 px-2 py-1 text-center border-b">{t('pms.workReport.qtyUsed')}</th>
                            <th className="px-2 py-1 text-center border-b">{t('pms.workReport.unit')}</th>
                            <th className="px-2 py-1 text-center border-b">{t('pms.workReport.stock')}</th>
                            {canEdit && <th className="w-16 px-2 py-1 text-center border-b"></th>}
                          </tr>
                        </thead>
                        <tbody>
                          {usedSpareParts.map((sp) => (
                            <tr key={sp.materialItemId} className="border-b border-gray-100">
                              <td className="px-2 py-1 text-gray-600">{sp.materialCode || '—'}</td>
                              <td className="px-2 py-1">{sp.materialName || 'Item'}</td>
                              <td className="px-2 py-1 text-center">
                                {canEdit ? (
                                  <input
                                    type="number"
                                    min={0}
                                    className="w-16 px-1 py-0.5 text-xs border border-gray-300 rounded text-center"
                                    value={sp.quantityUsed}
                                    onChange={e => handleSparePartQtyChange(sp.materialItemId, Number(e.target.value))}
                                  />
                                ) : (
                                  sp.quantityUsed ?? 0
                                )}
                              </td>
                              <td className="px-2 py-1 text-center">{sp.unit || 'PCS'}</td>
                              <td className="px-2 py-1 text-center">{sp.onHandQuantity ?? '—'}</td>
                              {canEdit && (
                                <td className="px-2 py-1 text-center">
                                  <PermissionGate permission="pms.work.execute"><button
                                    onClick={() => handleRemoveSparePart(sp.materialItemId)}
                                    className="text-red-500 hover:text-red-700"
                                    title={t('pms.workReport.delete')}
                                  >
                                    <X size={14} />
                                  </button></PermissionGate>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-xs text-gray-400 italic">{t('pms.workReport.noUsedMaterials')}</p>
                    )}
                  </div>
                </div>
                )
              })()}

              {/* Biểu mẫu ĐGRR tab */}
              {activeTab === 'risk' && (
                <div className="space-y-4 text-sm">
                  {/* Header bar */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={14} className="text-orange-500" />
                      <span className="font-semibold text-orange-700">{t('pms.workReport.riskTitle')}</span>
                      {riskFilled && <span className="px-1.5 py-0.5 text-[10px] bg-green-100 text-green-700 rounded-full font-medium">{t('pms.workReport.riskFilled')}</span>}
                      {!riskFilled && task?.requireRiskAssessment && <span className="px-1.5 py-0.5 text-[10px] bg-red-100 text-red-600 rounded-full font-medium">{t('pms.workReport.riskRequired')}</span>}
                    </div>
                    <PermissionGate permission="pms.work.execute"><button onClick={handleSaveRisk} disabled={savingRisk} className="flex items-center gap-1 px-3 py-1 text-xs bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50">
                      <Save size={12} /> {savingRisk ? t('pms.workReport.savingRisk') : t('pms.workReport.saveRisk')}
                    </button></PermissionGate>
                  </div>

                  {/* I. Thông tin chung */}
                  <div className="border border-gray-200 rounded">
                    <div className="px-3 py-1.5 bg-gray-50 border-b text-xs font-semibold text-gray-600">{t('pms.workReport.riskSection1')}</div>
                    <div className="p-3 grid grid-cols-2 gap-2">
                      {[
                        { label: t('pms.workReport.riskJobName'), key: 'jobName' },
                        { label: t('pms.workReport.riskEquipment'), key: 'equipmentName' },
                        { label: t('pms.workReport.riskLocation'), key: 'location' },
                        { label: t('pms.workReport.riskPersonnel'), key: 'personnel' },
                      ].map(({ label, key }) => (
                        <div key={key}>
                          <label className="text-xs text-gray-500 block mb-0.5">{label}</label>
                          <input type="text" value={(riskForm as any)[key] || ''} onChange={e => setRiskForm(f => ({ ...f, [key]: e.target.value }))} className={inp} />
                        </div>
                      ))}
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">{t('pms.workReport.riskDate')}</label>
                        <input type="date" value={riskForm.assessmentDate ? riskForm.assessmentDate.substring(0, 10) : ''} onChange={e => setRiskForm(f => ({ ...f, assessmentDate: e.target.value }))} className={inp} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">{t('pms.workReport.riskFormNumber')}</label>
                        <input type="text" value={riskForm.raNumber || ''} onChange={e => setRiskForm(f => ({ ...f, raNumber: e.target.value }))} placeholder={t('pms.workReport.riskFormPlaceholder')} className={inp} />
                      </div>
                    </div>
                  </div>

                  {/* II. Nhận diện mối nguy */}
                  <div className="border border-gray-200 rounded">
                    <div className="px-3 py-1.5 bg-gray-50 border-b text-xs font-semibold text-gray-600">{t('pms.workReport.riskSection2')}</div>
                    <div className="p-3 space-y-2">
                      {[
                        { key: 'hazardMechanical', label: t('pms.workReport.riskHazardMechanical') },
                        { key: 'hazardElectrical', label: t('pms.workReport.riskHazardElectrical') },
                        { key: 'hazardChemical', label: t('pms.workReport.riskHazardChemical') },
                        { key: 'hazardEnvironmental', label: t('pms.workReport.riskHazardEnvironmental') },
                      ].map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={!!(riskForm as any)[key]} onChange={e => setRiskForm(f => ({ ...f, [key]: e.target.checked }))} className="w-3.5 h-3.5 rounded text-orange-600" />
                          <span className="text-xs text-gray-700">{label}</span>
                        </label>
                      ))}
                      <div>
                        <label className="text-xs text-gray-500">{t('pms.workReport.riskHazardNotes')}</label>
                        <textarea rows={2} value={riskForm.hazardNotes || ''} onChange={e => setRiskForm(f => ({ ...f, hazardNotes: e.target.value }))} className={`${inp} resize-none mt-0.5`} />
                      </div>
                    </div>
                  </div>

                  {/* III. Đánh giá rủi ro trước biện pháp */}
                  <div className="border border-gray-200 rounded">
                    <div className="px-3 py-1.5 bg-gray-50 border-b text-xs font-semibold text-gray-600">{t('pms.workReport.riskSection3')}</div>
                    <div className="p-3 grid grid-cols-3 gap-2">
                      {[
                        { label: t('pms.workReport.riskSeverity'), key: 'initialSeverity', opts: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
                        { label: t('pms.workReport.riskLikelihood'), key: 'initialLikelihood', opts: ['LOW', 'MEDIUM', 'HIGH'] },
                        { label: t('pms.workReport.riskLevel'), key: 'initialRiskLevel', opts: ['LOW', 'MEDIUM', 'HIGH'] },
                      ].map(({ label, key, opts }) => (
                        <div key={key}>
                          <label className="text-xs text-gray-500 block mb-0.5">{label}</label>
                          <select value={(riskForm as any)[key] || ''} onChange={e => setRiskForm(f => ({ ...f, [key]: e.target.value }))} className={inp}>
                            <option value="">--</option>
                            {opts.map(o => <option key={o} value={o}>{o === 'LOW' ? t('pms.workReport.riskLow') : o === 'MEDIUM' ? t('pms.workReport.riskMedium') : o === 'HIGH' ? t('pms.workReport.riskHigh') : t('pms.workReport.riskCritical')}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* IV. Biện pháp kiểm soát */}
                  <div className="border border-gray-200 rounded">
                    <div className="px-3 py-1.5 bg-gray-50 border-b text-xs font-semibold text-gray-600">{t('pms.workReport.riskSection4')}</div>
                    <div className="p-3 space-y-2">
                      {[
                        { key: 'controlLOTO', label: t('pms.workReport.riskControlLOTO') },
                        { key: 'controlPTW', label: t('pms.workReport.riskControlPTW') },
                        { key: 'controlPPE', label: t('pms.workReport.riskControlPPE') },
                        { key: 'controlVentilation', label: t('pms.workReport.riskControlVentilation') },
                      ].map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={!!(riskForm as any)[key]} onChange={e => setRiskForm(f => ({ ...f, [key]: e.target.checked }))} className="w-3.5 h-3.5 rounded text-blue-600" />
                          <span className="text-xs text-gray-700">{label}</span>
                        </label>
                      ))}
                      <div>
                        <label className="text-xs text-gray-500">{t('pms.workReport.riskControlNotes')}</label>
                        <textarea rows={2} value={riskForm.controlNotes || ''} onChange={e => setRiskForm(f => ({ ...f, controlNotes: e.target.value }))} className={`${inp} resize-none mt-0.5`} />
                      </div>
                    </div>
                  </div>

                  {/* V. Rủi ro dư thừa */}
                  <div className="border border-gray-200 rounded">
                    <div className="px-3 py-1.5 bg-gray-50 border-b text-xs font-semibold text-gray-600">{t('pms.workReport.riskSection5')}</div>
                    <div className="p-3 grid grid-cols-3 gap-2">
                      {[
                        { label: t('pms.workReport.riskResidualSeverity'), key: 'residualSeverity', opts: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
                        { label: t('pms.workReport.riskResidualLikelihood'), key: 'residualLikelihood', opts: ['LOW', 'MEDIUM', 'HIGH'] },
                        { label: t('pms.workReport.riskResidualLevel'), key: 'residualRiskLevel', opts: ['LOW', 'MEDIUM', 'HIGH'] },
                      ].map(({ label, key, opts }) => (
                        <div key={key}>
                          <label className="text-xs text-gray-500 block mb-0.5">{label}</label>
                          <select value={(riskForm as any)[key] || ''} onChange={e => setRiskForm(f => ({ ...f, [key]: e.target.value }))} className={inp}>
                            <option value="">--</option>
                            {opts.map(o => <option key={o} value={o}>{o === 'LOW' ? t('pms.workReport.riskLow') : o === 'MEDIUM' ? t('pms.workReport.riskMedium') : o === 'HIGH' ? t('pms.workReport.riskHigh') : t('pms.workReport.riskCritical')}</option>)}
                          </select>
                        </div>
                      ))}
                    </div>
                    <div className="px-3 pb-3 space-y-2">
                      <textarea rows={2} value={riskForm.residualRiskNotes || ''} onChange={e => setRiskForm(f => ({ ...f, residualRiskNotes: e.target.value }))} placeholder={t('pms.workReport.riskResidualNotes')} className={`${inp} resize-none`} />
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={riskForm.isApprovedToProceed ?? true} onChange={e => setRiskForm(f => ({ ...f, isApprovedToProceed: e.target.checked }))} className="w-3.5 h-3.5 rounded text-green-600" />
                        <span className="text-xs font-medium text-gray-700">{t('pms.workReport.riskAcceptable')}</span>
                      </label>
                    </div>
                  </div>

                  {/* VI. Phê duyệt */}
                  <div className="border border-gray-200 rounded">
                    <div className="px-3 py-1.5 bg-gray-50 border-b text-xs font-semibold text-gray-600">{t('pms.workReport.riskSection6')}</div>
                    <div className="p-3 grid grid-cols-3 gap-2">
                      {[
                        { label: t('pms.workReport.riskWorker'), key: 'workerSignature' },
                        { label: t('pms.workReport.riskSupervisor'), key: 'supervisorSignature' },
                        { label: t('pms.workReport.riskChiefEngineer'), key: 'chiefEngineerApproval' },
                      ].map(({ label, key }) => (
                        <div key={key}>
                          <label className="text-xs text-gray-500 block mb-0.5">{label}</label>
                          <input type="text" value={(riskForm as any)[key] || ''} onChange={e => setRiskForm(f => ({ ...f, [key]: e.target.value }))} placeholder={t('pms.workReport.riskSignPlaceholder')} className={inp} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Biểu mẫu BBKT tab */}
              {activeTab === 'inspection' && (
                <div className="space-y-4 text-sm">
                  {/* Header bar */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText size={14} className="text-blue-500" />
                      <span className="font-semibold text-blue-700">{t('pms.workReport.inspTitle')}</span>
                      {bbktFilled && <span className="px-1.5 py-0.5 text-[10px] bg-green-100 text-green-700 rounded-full font-medium">{t('pms.workReport.inspFilled')}</span>}
                      {!bbktFilled && task?.requireInspectionReport && <span className="px-1.5 py-0.5 text-[10px] bg-red-100 text-red-600 rounded-full font-medium">{t('pms.workReport.inspRequired')}</span>}
                    </div>
                    <PermissionGate permission="pms.work.execute"><button onClick={handleSaveBbkt} disabled={savingBbkt} className="flex items-center gap-1 px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                      <Save size={12} /> {savingBbkt ? t('pms.workReport.savingInsp') : t('pms.workReport.saveInsp')}
                    </button></PermissionGate>
                  </div>

                  {/* I. Thông tin chung */}
                  <div className="border border-gray-200 rounded">
                    <div className="px-3 py-1.5 bg-gray-50 border-b text-xs font-semibold text-gray-600">{t('pms.workReport.inspSection1')}</div>
                    <div className="p-3 grid grid-cols-2 gap-2">
                      {[
                        { label: t('pms.workReport.inspShipName'), key: 'shipName' },
                        { label: t('pms.workReport.inspEquipment'), key: 'equipmentName' },
                        { label: t('pms.workReport.inspEquipmentCode'), key: 'equipmentCode' },
                      ].map(({ label, key }) => (
                        <div key={key}>
                          <label className="text-xs text-gray-500 block mb-0.5">{label}</label>
                          <input type="text" value={(bbktForm as any)[key] || ''} onChange={e => setBbktForm(f => ({ ...f, [key]: e.target.value }))} className={inp} />
                        </div>
                      ))}
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">{t('pms.workReport.inspDate')}</label>
                        <input type="date" value={bbktForm.maintenanceDate ? bbktForm.maintenanceDate.substring(0, 10) : ''} onChange={e => setBbktForm(f => ({ ...f, maintenanceDate: e.target.value }))} className={inp} />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500 block mb-0.5">{t('pms.workReport.inspMaintenanceType')}</label>
                        <div className="flex flex-wrap gap-3 mt-1">
                          {[['DAILY', t('pms.workReport.inspDaily')], ['WEEKLY', t('pms.workReport.inspWeekly')], ['MONTHLY', t('pms.workReport.inspMonthly')], ['ANNUAL', t('pms.workReport.inspAnnual')], ['RUNNING_HOURS', t('pms.workReport.inspRunningHours')]].map(([val, lbl]) => (
                            <label key={val} className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-700">
                              <input type="radio" name="maintenanceType" value={val} checked={bbktForm.maintenanceType === val} onChange={() => setBbktForm(f => ({ ...f, maintenanceType: val }))} className="w-3 h-3" />
                              {lbl}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* II. Nội dung công việc */}
                  <div className="border border-gray-200 rounded">
                    <div className="px-3 py-1.5 bg-gray-50 border-b text-xs font-semibold text-gray-600 flex items-center justify-between">
                      <span>{t('pms.workReport.inspSection2')}</span>
                      <button type="button" onClick={() => setBbktJobItems(f => [...f, { seq: f.length + 1, description: '', status: '', notes: '' }])} className="text-xs text-blue-600 hover:underline">{t('pms.workReport.inspAddRow')}</button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-50 border-b">
                            <th className="px-2 py-1.5 text-left w-8">{t('pms.workReport.inspSeq')}</th>
                            <th className="px-2 py-1.5 text-left">{t('pms.workReport.inspJobDescription')}</th>
                            <th className="px-2 py-1.5 text-left w-28">{t('pms.workReport.inspJobStatus')}</th>
                            <th className="px-2 py-1.5 text-left">{t('pms.workReport.inspJobNotes')}</th>
                            <th className="w-6"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {bbktJobItems.map((item, i) => (
                            <tr key={i} className="border-b border-gray-100">
                              <td className="px-2 py-1 text-gray-500">{item.seq}</td>
                              <td className="px-2 py-1">
                                <input type="text" value={item.description} onChange={e => setBbktJobItems(arr => arr.map((it, j) => j === i ? { ...it, description: e.target.value } : it))} className="w-full border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1" />
                              </td>
                              <td className="px-2 py-1">
                                <select value={item.status} onChange={e => setBbktJobItems(arr => arr.map((it, j) => j === i ? { ...it, status: e.target.value as InspectionJobItem['status'] } : it))} className="w-full border border-gray-200 rounded text-xs px-1 py-0.5 bg-white">
                                  <option value="">--</option>
                                  <option value="GOOD">{t('pms.workReport.inspGood')}</option>
                                  <option value="BAD">{t('pms.workReport.inspBad')}</option>
                                  <option value="REPLACED">{t('pms.workReport.inspReplaced')}</option>
                                </select>
                              </td>
                              <td className="px-2 py-1">
                                <input type="text" value={item.notes} onChange={e => setBbktJobItems(arr => arr.map((it, j) => j === i ? { ...it, notes: e.target.value } : it))} className="w-full border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-1" />
                              </td>
                              <td className="px-1">
                                <button type="button" onClick={() => setBbktJobItems(arr => arr.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600"><X size={12} /></button>
                              </td>
                            </tr>
                          ))}
                          {bbktJobItems.length === 0 && (
                            <tr><td colSpan={5} className="px-3 py-3 text-center text-gray-400 italic">{t('pms.workReport.inspNoItems')}</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* III. Kết luận */}
                  <div className="border border-gray-200 rounded">
                    <div className="px-3 py-1.5 bg-gray-50 border-b text-xs font-semibold text-gray-600">{t('pms.workReport.inspSection3')}</div>
                    <div className="p-3 space-y-2">
                      <div>
                        <label className="text-xs text-gray-500 block mb-1">{t('pms.workReport.inspPostStatus')}</label>
                        <div className="flex gap-4">
                          {[['NORMAL', t('pms.workReport.inspNormal')], ['MONITOR', t('pms.workReport.inspMonitor')], ['NEEDS_REPAIR', t('pms.workReport.inspNeedsRepair')]].map(([val, lbl]) => (
                            <label key={val} className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-700">
                              <input type="radio" name="postStatus" value={val} checked={bbktForm.postMaintenanceStatus === val} onChange={() => setBbktForm(f => ({ ...f, postMaintenanceStatus: val }))} className="w-3 h-3" />
                              {lbl}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">{t('pms.workReport.inspRecommendations')}</label>
                        <textarea rows={2} value={bbktForm.recommendations || ''} onChange={e => setBbktForm(f => ({ ...f, recommendations: e.target.value }))} className={`${inp} resize-none`} />
                      </div>
                    </div>
                  </div>

                  {/* IV. Xác nhận */}
                  <div className="border border-gray-200 rounded">
                    <div className="px-3 py-1.5 bg-gray-50 border-b text-xs font-semibold text-gray-600">{t('pms.workReport.inspSection4')}</div>
                    <div className="p-3 grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">{t('pms.workReport.inspOperator')}</label>
                        <input type="text" value={bbktForm.operatorSignature || ''} onChange={e => setBbktForm(f => ({ ...f, operatorSignature: e.target.value }))} placeholder={t('pms.workReport.inspSignPlaceholder')} className={inp} />
                      </div>
                      <div>
                        <label className="text-xs text-gray-500 block mb-0.5">{t('pms.workReport.inspChiefEngineer')}</label>
                        <input type="text" value={bbktForm.chiefEngineerSignature || ''} onChange={e => setBbktForm(f => ({ ...f, chiefEngineerSignature: e.target.value }))} placeholder={t('pms.workReport.inspSignPlaceholder')} className={inp} />
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-gray-500 block mb-1">{t('pms.workReport.inspOverallResult')}</label>
                        <div className="flex gap-4">
                          {[['PASS', t('pms.workReport.inspPass')], ['FAIL', t('pms.workReport.inspFail')]].map(([val, lbl]) => (
                            <label key={val} className={`flex items-center gap-1.5 px-3 py-1 rounded border cursor-pointer text-xs font-medium ${bbktForm.overallResult === val ? (val === 'PASS' ? 'bg-green-100 border-green-400 text-green-700' : 'bg-red-100 border-red-400 text-red-700') : 'border-gray-200 text-gray-600'}`}>
                              <input type="radio" name="overallResult" value={val} checked={bbktForm.overallResult === val} onChange={() => setBbktForm(f => ({ ...f, overallResult: val }))} className="hidden" />
                              {lbl}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ════════ RIGHT: Thông tin chung + Bình luận + Lịch sử (40%) ════════ */}
        <div className="w-[40%] shrink-0 border-l border-gray-200 overflow-y-auto">

          {/* Thông tin chung */}
          <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50">
            <span className="text-sm font-semibold text-gray-700">{t('pms.workReport.generalInfo')}</span>
          </div>
          <div className="px-4 py-3 space-y-3 text-sm border-b border-gray-200">
            <div className="flex items-center">
              <label className="text-gray-500 w-28 text-right pr-3 shrink-0 text-sm">{t('pms.workReport.startDate')}</label>
              <input type="datetime-local" readOnly value={startDate} className={inpRo} />
            </div>
            <div className="flex items-center">
              <label className="text-gray-500 w-28 text-right pr-3 shrink-0 text-sm">{t('pms.workReport.endDate')}</label>
              <input type="datetime-local" readOnly value={endDate} className={inpRo} />
            </div>
            <div className="flex items-center">
              <label className="text-gray-500 w-28 text-right pr-3 shrink-0 text-sm">{t('pms.workReport.statusLabel')}</label>
              <input type="text" readOnly value={statusLabel} className={inpRo} />
              {task.hasPendingDeferral && (
                <span className="ml-2 px-2 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-700 whitespace-nowrap">{t('pms.workReport.deferralTag')}</span>
              )}
            </div>
            <div className="flex items-center">
              <label className="text-gray-500 w-28 text-right pr-3 shrink-0 text-sm">{t('pms.workReport.priorityLabel')}</label>
              <input type="text" readOnly value={priorityLabel} className={inpRo} />
            </div>
            <div className="flex items-center">
              <label className="text-gray-500 w-28 text-right pr-3 shrink-0 text-sm">{t('pms.workReport.assigneeLabel')}</label>
              <input type="text" readOnly value={assignedTo} className={inpRo} />
            </div>
          </div>

          {/* Lịch sử công việc */}
          <div className="px-4 py-2.5 border-b border-gray-200 bg-gray-50">
            <span className="text-sm font-semibold text-gray-700">{t('pms.workReport.historySection')}</span>
          </div>
          <div className="px-4 py-3">
            {statusHistory.length === 0 ? (
              <p className="text-sm text-gray-400 italic">{t('pms.workReport.noHistory')}</p>
            ) : (
              <div className="space-y-2.5 relative pl-4">
                <div className="absolute left-[5px] top-1 bottom-1 w-px bg-gray-200" />
                {statusHistory.map((entry, i) => (
                  <div key={i} className="relative flex items-start gap-2.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-gray-400 border-2 border-white z-10 shrink-0 mt-1" />
                    <div className="text-sm">
                      <span className="text-gray-700">{entry.changedByName || entry.changedBy}</span>
                      <span className="text-gray-400 ml-1.5">
                        {format(parseISO(entry.changedAt), 'dd/MM/yyyy HH:mm:ss', { locale: vi })}
                      </span>
                      {entry.notes && <p className="text-xs text-gray-400 mt-0.5">{entry.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Rejection Modal ── */}
      {showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-800">{t('pms.workReport.rejectModalTitle')}</h3>
              <button onClick={() => setShowRejectModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>
            <div className="px-4 py-4">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('pms.workReport.rejectReasonLabel')} <span className="text-red-500">*</span></label>
              <textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder={t('pms.workReport.rejectPlaceholder')}
                rows={4}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
              />
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-lg">
              <button onClick={() => setShowRejectModal(false)} className="px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-100">
                {t('pms.workReport.rejectCancel')}
              </button>
              <PermissionGate permission="pms.work.reject"><button onClick={handleReject} disabled={verifying || !rejectionReason.trim()} className="px-3 py-1.5 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-50">
                {verifying ? t('pms.workReport.processing') : t('pms.workReport.rejectConfirm')}
              </button></PermissionGate>
            </div>
          </div>
        </div>
      )}

      <DeferralReviewModal
        open={showDeferralModal}
        onClose={() => setShowDeferralModal(false)}
        taskId={id}
        onReviewed={() => loadTask()}
      />
    </div>
  )
}
