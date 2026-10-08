import { PermissionGate } from '@/components/auth/PermissionGate'
import { useEffect, useState } from 'react'
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslationSafe } from '@/contexts/I18nContext'
import { Users, FileText, ExternalLink, ArrowDownCircle, User, Plus, Download, FileSpreadsheet, Clock, UserCheck } from 'lucide-react'
import { DataTable, toolbarButtonClass, type Column } from '@/components/common/DataTable'
import { toast } from 'sonner'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { CrewMember } from '../../types/maritime.types'
import { maritimeService } from '../../services/maritime.service'
import { format, parseISO } from 'date-fns'
import { AddCrewModal } from '../../components/crew/AddCrewModal'

export function CrewPage() {
  const navigate = useNavigate()
  const [crewMembers, setCrewMembers] = useState<CrewMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)

  // Pending crew review state
  const [pendingCrew, setPendingCrew] = useState<CrewMember[]>([])
  const [pendingLoading, setPendingLoading] = useState(false)

  // Cache for crew data to avoid reloading
  const [crewOnboardCache, setCrewOnboardCache] = useState<CrewMember[] | null>(null)

  // Shore notification summary: crewId → changed field count
  const [shoreChangeSummary, setShoreChangeSummary] = useState<Record<string, number>>({})

  useEffect(() => {
    loadCrewData()
    loadPendingCrew()
    loadShoreChangeSummary()
    const refreshPending = () => { if (!document.hidden) void loadPendingCrew(false) }
    const interval = window.setInterval(refreshPending, 15000)
    window.addEventListener('focus', refreshPending)
    document.addEventListener('visibilitychange', refreshPending)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', refreshPending)
      document.removeEventListener('visibilitychange', refreshPending)
    }
  }, [])

  const loadShoreChangeSummary = async () => {
    try {
      const token = localStorage.getItem('maritime_token') ?? ''
      const res = await fetch('/api/sync/notifications/crew-summary', {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (res.ok) setShoreChangeSummary(await res.json())
    } catch { /* silent */ }
  }

  const loadCrewData = async () => {
    try {
      setLoading(true)
      
      // Use cache if available
      if (crewOnboardCache !== null) {
        console.log('✅ Using cached onboard crew:', crewOnboardCache.length)
        setCrewMembers(crewOnboardCache)
        setLoading(false)
        return
      }
      
      const data = await maritimeService.crew.getOnboard()
      setCrewOnboardCache(data) // Cache for future use
      setCrewMembers(data)
    } catch (error) {
      console.error('Failed to load crew data:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadPendingCrew = async (showSpinner = true) => {
    try {
      if (showSpinner) setPendingLoading(true)
      const data = await maritimeService.crew.getPending()
      setPendingCrew(data)
    } catch (error) {
      console.error('Failed to load pending crew:', error)
    } finally {
      if (showSpinner) setPendingLoading(false)
    }
  }

  const handleApproveCrew = async (id: string) => {
    try {
      const result = await maritimeService.crew.approve(id)
      toast.success(result.message)
      await loadPendingCrew()
      // Invalidate onboard cache since crew moved to onboard
      setCrewOnboardCache(null)
    } catch (error: any) {
      toast.error(error.message || t('crew.page.approveFailed'))
    }
  }

  const handleRejectCrew = async (id: string, reason?: string) => {
    try {
      const result = await maritimeService.crew.reject(id, reason)
      toast.success(result.message)
      await loadPendingCrew()
    } catch (error: any) {
      toast.error(error.message || t('crew.page.rejectFailed'))
    }
  }

  // Tab state
  const [activeTab, setActiveTab] = useState<'onboard' | 'pending'>('onboard')
  const { t } = useTranslationSafe()

  const handleAddCrew = async (newCrew: Partial<CrewMember>) => {
    try {
      await maritimeService.crew.add(newCrew)
      // Force reload - directly fetch and update without checking cache
      setLoading(true)
      const data = await maritimeService.crew.getOnboard()
      setCrewOnboardCache(data) // Update cache with new data
      setCrewMembers(data)
      setLoading(false)
      console.log('✅ Crew list reloaded after adding new member')
    } catch (error) {
      console.error('Failed to add crew member:', error)
      setLoading(false)
    }
  }

  return (
    <div className="h-full w-full flex flex-col overflow-hidden bg-white">
      {/* === HEADER ROW: Title + actions === */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">≡ {t('crew.title')}</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700">
            {crewMembers.filter(c => c.isOnboard).length} {t('crew.page.crewBadge')}
          </span>
          {pendingCrew.length > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700">
              {pendingCrew.length} {t('crew.page.pending')}
            </span>
          )}
        </div>
        <span className="text-xs italic text-gray-500">
          Thuyền viên được tạo và gán chức danh trên bờ, sau đó đồng bộ xuống tàu
        </span>
      </div>

      {/* === TAB BAR === */}
      <div className="flex items-center gap-6 px-4 border-b border-gray-200 flex-shrink-0">
        <button
          onClick={() => setActiveTab('onboard')}
          className={`flex items-center gap-1.5 px-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'onboard'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users className="w-4 h-4" />
          {t('crew.onboardSection')} ({crewMembers.filter(c => c.isOnboard).length})
        </button>
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex items-center gap-1.5 px-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'pending'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Clock className="w-4 h-4" />
          {t('crew.pendingSection')} ({pendingCrew.length})
        </button>
      </div>

      {/* === TAB CONTENT === */}
      <div className="flex min-h-0 flex-1 flex-col">
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="text-gray-600 mt-4">{t('crew.page.loadingCrew')}</p>
          </div>
        ) : (
          <SectionedCrewView
            crewMembers={crewMembers}
            onViewCrew={(id) => navigate(`/crew/${id}`)}
            onAddCrew={() => setShowAddModal(true)}
            pendingCrew={pendingCrew}
            pendingLoading={pendingLoading}
            onApproveCrew={handleApproveCrew}
            onRejectCrew={handleRejectCrew}
            onPendingChanged={() => { loadPendingCrew(); setCrewOnboardCache(null); loadCrewData() }}
            activeTab={activeTab}
            shoreChangeSummary={shoreChangeSummary}
          />
        )}
      </div>

      <AddCrewModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleAddCrew}
      />
    </div>
  )
}

// Sectioned Crew View Component - Displays crew in sections like the reference image
function SectionedCrewView({ 
  crewMembers, 
  onViewCrew,
  onAddCrew,
  pendingCrew,
  pendingLoading,
  onApproveCrew,
  onRejectCrew,
  onPendingChanged,
  activeTab,
  shoreChangeSummary
}: { 
  crewMembers: CrewMember[]; 
  onViewCrew: (id: string) => void;
  onAddCrew: () => void;
  pendingCrew: CrewMember[];
  pendingLoading: boolean;
  onApproveCrew: (id: string) => Promise<void>;
  onRejectCrew: (id: string, reason?: string) => Promise<void>;
  onPendingChanged: () => void;
  activeTab: 'onboard' | 'pending';
  shoreChangeSummary: Record<string, number>;
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; crew: CrewMember } | null>(null)
  const [selectedCrew, setSelectedCrew] = useState<string | null>(null)
  const { t } = useTranslationSafe()

  // Helper: get sorted onboard crew by crewId
  const getSortedOnboardCrew = () => {
    return crewMembers
      .filter(c => c.isOnboard)
      .sort((a, b) => a.crewId.localeCompare(b.crewId))
  }

  // Export crew list to Excel (ExcelJS with full formatting)
  const exportCrewListToExcel = async () => {
    try {
      const ExcelJS = await import('exceljs')
      const wb = new ExcelJS.Workbook()
      wb.creator = 'Maritime Edge System'
      wb.created = new Date()

      const ws = wb.addWorksheet('Crew List', {
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 }
      })

      const onboard = getSortedOnboardCrew()
      const exportDate = format(new Date(), 'dd/MM/yyyy HH:mm')

      // --- Title row ---
      ws.mergeCells('A1:N1')
      const titleCell = ws.getCell('A1')
      titleCell.value = 'CREW LIST REPORT'
      titleCell.font = { name: 'Arial', size: 16, bold: true, color: { argb: 'FF1A3C6E' } }
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getRow(1).height = 30

      // --- Subtitle row ---
      ws.mergeCells('A2:N2')
      const subCell = ws.getCell('A2')
      subCell.value = `Generated: ${exportDate}  |  Total Crew Onboard: ${onboard.length}`
      subCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FF666666' } }
      subCell.alignment = { horizontal: 'center', vertical: 'middle' }
      ws.getRow(2).height = 20

      // --- Empty separator row ---
      ws.getRow(3).height = 8

      // --- Header row (row 4) ---
      const headers = [
        'No.', 'Crew ID', 'Full Name', 'Rank', 'Nationality',
        'Date of Birth', 'Embark Date', 'Contract End',
        'Passport No.', 'Passport Expiry', 'Seaman Book No.',
        'Phone', 'Emergency Contact', 'Status'
      ]
      const headerRow = ws.getRow(4)
      headerRow.height = 22
      headers.forEach((h, i) => {
        const cell = headerRow.getCell(i + 1)
        cell.value = h
        cell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FFFFFFFF' } }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A3C6E' } }
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF1A3C6E' } },
          bottom: { style: 'thin', color: { argb: 'FF1A3C6E' } },
          left: { style: 'thin', color: { argb: 'FF1A3C6E' } },
          right: { style: 'thin', color: { argb: 'FF1A3C6E' } }
        }
      })

      // --- Data rows ---
      const thinBorder = {
        top: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } },
        bottom: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } },
        left: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } },
        right: { style: 'thin' as const, color: { argb: 'FFD0D0D0' } }
      }
      const evenFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF5F8FC' } }
      const oddFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFFFF' } }

      onboard.forEach((crew, idx) => {
        const rowNum = 5 + idx
        const row = ws.getRow(rowNum)
        row.height = 18
        const isEven = idx % 2 === 0
        const values = [
          idx + 1,
          crew.crewId || '',
          crew.fullName || '',
          crew.rank?.rankName || '',
          crew.countryName || '',
          crew.dateOfBirth ? format(parseISO(crew.dateOfBirth), 'dd/MM/yyyy') : '',
          crew.embarkDate ? format(parseISO(crew.embarkDate), 'dd/MM/yyyy') : '',
          crew.contractEnd ? format(parseISO(crew.contractEnd), 'dd/MM/yyyy') : '',
          crew.passportNumber || '',
          crew.passportExpiry ? format(parseISO(crew.passportExpiry), 'dd/MM/yyyy') : '',
          crew.seamanBookNumber || '',
          crew.phoneNumber || '',
          crew.emergencyContact || '',
          crew.isOnboard ? t('crew.page.onboard') : t('crew.page.ashore')
        ]
        values.forEach((v, i) => {
          const cell = row.getCell(i + 1)
          cell.value = v
          cell.font = { name: 'Arial', size: 9, color: { argb: 'FF333333' } }
          cell.border = thinBorder
          cell.fill = isEven ? evenFill : oddFill
          // Center for No., dates, status
          if (i === 0 || i === 5 || i === 6 || i === 7 || i === 9 || i === 13) {
            cell.alignment = { horizontal: 'center', vertical: 'middle' }
          } else {
            cell.alignment = { vertical: 'middle' }
          }
        })
        // Status styling
        const statusCell = row.getCell(14)
        if (crew.isOnboard) {
          statusCell.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF16A34A' } }
        }
      })

      // --- Footer summary row ---
      const footerRow = 5 + onboard.length + 1
      ws.mergeCells(`A${footerRow}:N${footerRow}`)
      const footerCell = ws.getCell(`A${footerRow}`)
      footerCell.value = `Total: ${onboard.length} crew members onboard`
      footerCell.font = { name: 'Arial', size: 10, bold: true, italic: true, color: { argb: 'FF1A3C6E' } }
      footerCell.alignment = { horizontal: 'right', vertical: 'middle' }
      ws.getRow(footerRow).height = 20

      // --- Column widths ---
      const colWidths = [6, 14, 28, 22, 16, 14, 14, 14, 20, 16, 20, 16, 22, 12]
      colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

      // --- Auto-filter on header ---
      ws.autoFilter = { from: 'A4', to: `N${4 + onboard.length}` }

      // Export
      const buffer = await wb.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `Crew_List_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`
      link.click()
      URL.revokeObjectURL(url)

      toast.success(t('crew.page.exportExcelSuccess'))
    } catch (error) {
      console.error('Failed to export crew list:', error)
      toast.error(t('crew.page.exportFailed'))
    }
  }

  // Export crew list to PDF (jsPDF + autoTable, professional report layout)
  const exportCrewListToPDF = () => {
    try {
      const onboard = getSortedOnboardCrew()
      const doc = new jsPDF('landscape', 'mm', 'a4') as any
      const pageWidth = doc.internal.pageSize.getWidth()
      const pageHeight = doc.internal.pageSize.getHeight()
      const ml = 10
      const mr = 10
      const tw = pageWidth - ml - mr
      const exportDate = format(new Date(), 'dd/MM/yyyy HH:mm')

      // ===== HEADER BAND =====
      doc.setFillColor(26, 60, 110) // Navy blue
      doc.rect(0, 0, pageWidth, 22, 'F')

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(18)
      doc.setTextColor(255, 255, 255)
      doc.text('CREW LIST REPORT', pageWidth / 2, 10, { align: 'center' })

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(200, 215, 240)
      doc.text(`Generated: ${exportDate}`, pageWidth / 2, 17, { align: 'center' })

      // ===== SUMMARY BAR =====
      doc.setFillColor(240, 245, 250)
      doc.rect(ml, 26, tw, 10, 'F')
      doc.setDrawColor(26, 60, 110)
      doc.setLineWidth(0.3)
      doc.line(ml, 26, ml + tw, 26)
      doc.line(ml, 36, ml + tw, 36)

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(26, 60, 110)
      doc.text(`Total Crew Onboard: ${onboard.length}`, ml + 5, 32.5)

      // Count nationalities
      const natMap = new Map<string, number>()
      onboard.forEach(c => {
        const nat = c.countryName || 'Unknown'
        natMap.set(nat, (natMap.get(nat) || 0) + 1)
      })
      const natSummary = Array.from(natMap.entries()).map(([n, c]) => `${n}: ${c}`).join('  |  ')
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(80, 80, 80)
      doc.text(`Nationality: ${natSummary}`, pageWidth - mr - 5, 32.5, { align: 'right' })

      // ===== TABLE =====
      const tableHeaders = [
        'No.', 'Crew ID', 'Full Name', 'Rank', 'Nationality',
        'Date of Birth', 'Embark Date', 'Contract End',
        'Passport No.', 'Passport Expiry', 'Seaman Book No.', 'Status'
      ]

      const tableBody = onboard.map((crew, idx) => [
        String(idx + 1),
        crew.crewId || '',
        crew.fullName || '',
        crew.rank?.rankName || '',
        crew.countryName || '',
        crew.dateOfBirth ? format(parseISO(crew.dateOfBirth), 'dd/MM/yyyy') : '',
        crew.embarkDate ? format(parseISO(crew.embarkDate), 'dd/MM/yyyy') : '',
        crew.contractEnd ? format(parseISO(crew.contractEnd), 'dd/MM/yyyy') : '',
        crew.passportNumber || '',
        crew.passportExpiry ? format(parseISO(crew.passportExpiry), 'dd/MM/yyyy') : '',
        crew.seamanBookNumber || '',
        crew.isOnboard ? t('crew.page.onboard') : t('crew.page.ashore')
      ])

      doc.autoTable({
        startY: 40,
        head: [tableHeaders],
        body: tableBody,
        theme: 'grid',
        styles: {
          fontSize: 7,
          cellPadding: 2,
          lineWidth: 0.2,
          lineColor: [200, 200, 200],
          textColor: [40, 40, 40],
          valign: 'middle'
        },
        headStyles: {
          fillColor: [26, 60, 110],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: 7.5,
          cellPadding: 2.5,
          halign: 'center',
          lineWidth: 0.2,
          lineColor: [26, 60, 110]
        },
        alternateRowStyles: {
          fillColor: [245, 248, 252]
        },
        columnStyles: {
          0: { cellWidth: tw * 0.03, halign: 'center' },     // No.
          1: { cellWidth: tw * 0.07, halign: 'center' },     // Crew ID
          2: { cellWidth: tw * 0.14 },                        // Full Name
          3: { cellWidth: tw * 0.10 },                        // Rank
          4: { cellWidth: tw * 0.08 },                        // Nationality
          5: { cellWidth: tw * 0.08, halign: 'center' },     // DOB
          6: { cellWidth: tw * 0.08, halign: 'center' },     // Embark
          7: { cellWidth: tw * 0.08, halign: 'center' },     // Contract End
          8: { cellWidth: tw * 0.11 },                        // Passport No.
          9: { cellWidth: tw * 0.08, halign: 'center' },     // Passport Expiry
          10: { cellWidth: tw * 0.10 },                       // Seaman Book
          11: { cellWidth: tw * 0.05, halign: 'center' },    // Status
        },
        margin: { left: ml, right: mr },
        didParseCell: (data: any) => {
          // Green bold for "Onboard" status
          if (data.section === 'body' && data.column.index === 11) {
            if (data.cell.raw === 'Onboard') {
              data.cell.styles.textColor = [22, 163, 74]
              data.cell.styles.fontStyle = 'bold'
            }
          }
        },
        didDrawPage: (data: any) => {
          // Footer on every page
          doc.setFillColor(26, 60, 110)
          doc.rect(0, pageHeight - 10, pageWidth, 10, 'F')
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(7)
          doc.setTextColor(200, 215, 240)
          doc.text('Maritime Edge System â€” Crew List Report', ml, pageHeight - 4)
          doc.text(`Page ${data.pageNumber}`, pageWidth - mr, pageHeight - 4, { align: 'right' })
        }
      })

      doc.save(`Crew_List_${format(new Date(), 'yyyyMMdd_HHmmss')}.pdf`)
      toast.success(t('crew.page.exportPdfSuccess'))
    } catch (error) {
      console.error('Failed to export crew list to PDF:', error)
      toast.error(t('crew.page.exportPdfFailed'))
    }
  }

  const crewOnBoard = crewMembers
    .filter(c => c.isOnboard)
    .sort((a, b) => a.crewId.localeCompare(b.crewId))

  const columns: Column<CrewMember>[] = [
    { key: 'crewId', header: t('crew.table.crewId'), width: 130, value: c => c.crewId, className: 'font-medium' },
    {
      key: 'fullName', header: t('crew.table.name'), value: c => c.fullName,
      render: c => <span className="inline-flex items-center gap-1.5"><User className="h-3.5 w-3.5 shrink-0 text-gray-400" />{c.fullName}</span>,
    },
    { key: 'rank', header: t('crew.table.rank'), width: 200, value: c => c.rank?.rankName || '' },
    { key: 'nationality', header: t('crew.fields.nationality'), width: 150, value: c => c.countryName || '', render: c => c.countryName || t('crew.page.na') },
    {
      key: 'embarkDate', header: t('crew.table.embarkDate'), width: 130, align: 'center',
      // Giá trị ISO để sắp xếp đúng thứ tự ngày; lọc và xuất theo dd/MM/yyyy
      value: c => c.embarkDate ? c.embarkDate.slice(0, 10) : '',
      filter: c => c.embarkDate ? format(parseISO(c.embarkDate), 'dd/MM/yyyy') : '',
      exportValue: c => c.embarkDate ? format(parseISO(c.embarkDate), 'dd/MM/yyyy') : '',
      searchable: false,
      render: c => c.embarkDate ? format(parseISO(c.embarkDate), 'dd/MM/yyyy') : '—',
    },
    {
      key: 'status', header: t('crew.table.status'), width: 130, align: 'center',
      value: c => c.isOnboard ? t('crew.page.onboard') : t('crew.page.ashore'),
      render: c => (
        <span className="inline-flex items-center gap-1.5">
          {c.isOnboard
            ? <span className="rounded-full bg-green-100 px-2 py-0.5 font-semibold text-green-700">{t('crew.page.onboard')}</span>
            : <span className="rounded-full bg-gray-100 px-2 py-0.5 font-semibold text-gray-600">{t('crew.page.ashore')}</span>}
          {shoreChangeSummary[String(c.id)] > 0 && (
            <span
              title={`${shoreChangeSummary[String(c.id)]} thay đổi từ bờ`}
              className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white"
            >{shoreChangeSummary[String(c.id)]}</span>
          )}
        </span>
      ),
    },
  ]

  const handleContextMenu = (e: React.MouseEvent, crew: CrewMember) => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, crew })
    setSelectedCrew(crew.id)
  }

  const closeContextMenu = () => {
    setContextMenu(null)
    setSelectedCrew(null)
  }

  useEffect(() => {
    const handleClick = () => closeContextMenu()
    window.addEventListener('click', handleClick)
    return () => window.removeEventListener('click', handleClick)
  }, [])

  const renderCrewTable = () => (
    <DataTable
      flush
      columns={columns}
      data={crewOnBoard}
      rowKey={c => c.id}
      itemLabel="thuyền viên"
      pageSize={15}
      emptyMessage={t('crew.page.noCrewMembers')}
      searchPlaceholder={t('crew.searchPlaceholder')}
      exportOptions={false}
      onRowClick={c => onViewCrew(c.id)}
      onRowContextMenu={handleContextMenu}
      rowClassName={c => selectedCrew === c.id ? '!bg-blue-100' : undefined}
      minWidth={860}
      toolbarActions={
        <>
          <button type="button" onClick={exportCrewListToExcel} disabled={crewOnBoard.length === 0} className={toolbarButtonClass}>
            <FileSpreadsheet className="h-4 w-4 text-emerald-700" /> {t('crew.actions.exportExcel')}
          </button>
          <button type="button" onClick={exportCrewListToPDF} disabled={crewOnBoard.length === 0} className={toolbarButtonClass}>
            <Download className="h-4 w-4 text-red-600" /> {t('crew.actions.exportPdf')}
          </button>
          <PermissionGate permission="crew.create"><button
            type="button"
            disabled
            title="Tạo thuyền viên và gán chức danh trên bờ, sau đó đồng bộ xuống tàu"
            onClick={onAddCrew}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-blue-600 px-3.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> {t('crew.addMember')}
          </button></PermissionGate>
        </>
      }
    />
  )

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Crew On Board Tab */}
      {activeTab === 'onboard' && renderCrewTable()}

      {/* Pending Crew Review Tab */}
      {activeTab === 'pending' && (
        <InlinePendingReviewSection
          pendingCrew={pendingCrew}
          pendingLoading={pendingLoading}
          onApprove={async (id) => { await onApproveCrew(id); onPendingChanged() }}
          onReject={async (id, reason) => { await onRejectCrew(id, reason); onPendingChanged() }}
          onViewCrew={onViewCrew}
        />
      )}


      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-50"
          style={{ left: contextMenu.x, top: contextMenu.y, minWidth: '200px' }}
        >
          <button
            onClick={() => {
              onViewCrew(contextMenu.crew.id)
              closeContextMenu()
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"
          >
            <FileText className="w-4 h-4 text-gray-500" /> {t('crew.page.openDetails')}
          </button>
          <button
            onClick={() => {
              window.open(`/crew/${contextMenu.crew.id}/standalone`, '_blank')
              closeContextMenu()
            }}
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"
          >
            <ExternalLink className="w-4 h-4 text-gray-500" /> {t('crew.page.openInNewTab')}
          </button>
          <div className="border-t border-gray-200 my-1"></div>
          {/* <button
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"
          >
            <ArrowDownCircle className="w-4 h-4 text-gray-500" /> {t('crew.page.moveToTemp')}
          </button> */}
          <button
            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"
          >
            <ArrowDownCircle className="w-4 h-4 text-gray-500" /> {t('crew.page.moveToSignedOff')}
          </button>

        </div>
      )}
    </div>
  )
}


function InlinePendingReviewSection({
  pendingCrew,
  pendingLoading,
  onApprove,
  onReject: _onReject,
  onViewCrew,
}: {
  pendingCrew: CrewMember[]
  pendingLoading: boolean
  onApprove: (id: string) => Promise<void>
  onReject: (id: string, reason?: string) => Promise<void>
  onViewCrew: (id: string) => void
}) {
  const [processingId, setProcessingId] = useState<string | null>(null)
  const { t } = useTranslationSafe()

  const handleApprove = async (id: string) => {
    setProcessingId(id)
    try { await onApprove(id) } finally { setProcessingId(null) }
  }

  const columns: Column<CrewMember>[] = [
    { key: 'crewId', header: t('crew.table.crewId'), width: 130, value: c => c.crewId, className: 'font-medium' },
    {
      key: 'fullName', header: t('crew.table.name'), value: c => c.fullName,
      render: c => <span className="inline-flex items-center gap-1.5"><User className="h-3.5 w-3.5 shrink-0 text-amber-500" />{c.fullName}</span>,
    },
    { key: 'rank', header: t('crew.table.rank'), width: 180, value: c => c.rank?.rankName || '' },
    { key: 'nationality', header: t('crew.fields.nationality'), width: 150, value: c => c.countryName || '' },
    {
      key: 'status', header: t('crew.table.status'), width: 130, align: 'center',
      value: c => c.onboardStatus === 'OnHold' ? t('crew.page.onHold') : t('crew.page.pending'),
      render: c => c.onboardStatus === 'OnHold'
        ? <span className="rounded-full bg-orange-100 px-2 py-0.5 font-semibold text-orange-700">{t('crew.page.onHold')}</span>
        : <span className="rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">{t('crew.page.pending')}</span>,
    },
    {
      key: 'actions', header: t('crew.page.actions'), width: 190, align: 'center',
      render: c => (
        <div className="flex items-center justify-center gap-2">
          <PermissionGate permission="crew.approve"><button
            type="button"
            onClick={() => handleApprove(c.id)}
            disabled={processingId === c.id}
            className="inline-flex items-center gap-1 rounded bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            <UserCheck className="h-3 w-3" /> {t('crew.page.approve')}
          </button></PermissionGate>
          <button
            type="button"
            onClick={() => onViewCrew(c.id)}
            className="inline-flex items-center gap-1 rounded bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-100"
          >
            <ExternalLink className="h-3 w-3" /> {t('crew.page.review')}
          </button>
        </div>
      ),
    },
  ]

  return (
    <DataTable
      flush
      loading={pendingLoading}
      columns={columns}
      data={pendingCrew}
      rowKey={c => c.id}
      itemLabel="thuyền viên"
      emptyMessage={`${t('crew.pendingSection')}: 0`}
      searchPlaceholder={t('crew.searchPlaceholder')}
      exportOptions={{ fileName: 'thuyen-vien-cho-duyet', title: 'THUYỀN VIÊN CHỜ DUYỆT' }}
      minWidth={860}
    />
  )
}
