import { useEffect, useState, useRef } from 'react'
import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslationSafe } from '@/contexts/I18nContext'
import { Users, FileText, ExternalLink, ArrowDownCircle, User, Search, Plus, Download, FileSpreadsheet, Clock, UserCheck, ChevronsUpDown } from 'lucide-react'
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

  // Sorting states
  const [sortType, setSortType] = useState<{ col: string; dir: 'asc'|'desc' } | null>({ col: 'crewId', dir: 'asc' })
  const [sortMenu, setSortMenu] = useState<string | null>(null)

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
  const exportRef = useRef<{ exportExcel: () => void; exportPDF: () => void }>({ exportExcel: () => {}, exportPDF: () => {} })

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
        <div className="flex items-center gap-2 min-h-[32px]">
          {activeTab === 'onboard' && (
            <>
              <button
                onClick={() => exportRef.current.exportExcel()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" /> {t('crew.actions.exportExcel')}
              </button>
              <button
                onClick={() => exportRef.current.exportPDF()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-red-300 rounded text-red-600 hover:bg-red-50"
              >
                <Download className="w-3.5 h-3.5" /> {t('crew.actions.exportPdf')}
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                <Plus className="w-3.5 h-3.5" /> {t('crew.addMember')}
              </button>
            </>
          )}
        </div>
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
      <div className="flex-1 overflow-auto">
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
            sortType={sortType}
            setSortType={setSortType}
            sortMenu={sortMenu}
            setSortMenu={setSortMenu}
            pendingCrew={pendingCrew}
            pendingLoading={pendingLoading}
            onApproveCrew={handleApproveCrew}
            onRejectCrew={handleRejectCrew}
            onPendingChanged={() => { loadPendingCrew(); setCrewOnboardCache(null); loadCrewData() }}
            activeTab={activeTab}
            exportRef={exportRef}
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
  onAddCrew: _onAddCrew,
  sortType,
  setSortType,
  sortMenu,
  setSortMenu,
  pendingCrew,
  pendingLoading,
  onApproveCrew,
  onRejectCrew,
  onPendingChanged,
  activeTab,
  exportRef,
  shoreChangeSummary
}: { 
  crewMembers: CrewMember[]; 
  onViewCrew: (id: string) => void;
  onAddCrew: () => void;
  sortType?: { col: string; dir: 'asc'|'desc' } | null;
  setSortType?: (sortType: { col: string; dir: 'asc'|'desc' } | null) => void;
  sortMenu?: string | null;
  setSortMenu?: (sortMenu: string | null) => void;
  pendingCrew: CrewMember[];
  pendingLoading: boolean;
  onApproveCrew: (id: string) => Promise<void>;
  onRejectCrew: (id: string, reason?: string) => Promise<void>;
  onPendingChanged: () => void;
  activeTab: 'onboard' | 'pending';
  exportRef: React.MutableRefObject<{ exportExcel: () => void; exportPDF: () => void }>;
  shoreChangeSummary: Record<string, number>;
}) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; crew: CrewMember } | null>(null)
  const [selectedCrew, setSelectedCrew] = useState<string | null>(null)
  const { t } = useTranslationSafe()

  // Pagination state
  const [onboardPage, setOnboardPage] = useState(1)
  const ITEMS_PER_PAGE = 15

  // Search / filter states
  const [searchCrewId, setSearchCrewId] = useState('')
  const [searchName, setSearchName] = useState('')
  const [filterRankVal, setFilterRankVal] = useState('')
  const [filterNationality, setFilterNationality] = useState('')

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

  // Get only onboard crew
  let crewOnBoard = crewMembers.filter(c => c.isOnboard)

  // Apply sorting
  const applySorting = (crews: CrewMember[]) => {
    if (!sortType) return crews
    const sorted = [...crews]
    switch (sortType.col) {
      case 'crewId':
        sorted.sort((a, b) => sortType.dir === 'asc'
          ? a.crewId.localeCompare(b.crewId)
          : b.crewId.localeCompare(a.crewId))
        break
      case 'fullName':
        sorted.sort((a, b) => sortType.dir === 'asc' 
          ? a.fullName.localeCompare(b.fullName) 
          : b.fullName.localeCompare(a.fullName))
        break
      case 'position':
        sorted.sort((a, b) => sortType.dir === 'asc'
          ? (a.rank?.rankName || '').localeCompare(b.rank?.rankName || '')
          : (b.rank?.rankName || '').localeCompare(a.rank?.rankName || ''))
        break
      case 'rank':
        sorted.sort((a, b) => {
          const aRank = a.rank?.rankName || ''
          const bRank = b.rank?.rankName || ''
          return sortType.dir === 'asc' ? aRank.localeCompare(bRank) : bRank.localeCompare(aRank)
        })
        break
      case 'nationality':
        sorted.sort((a, b) => {
          const aNat = a.countryName || ''
          const bNat = b.countryName || ''
          return sortType.dir === 'asc' ? aNat.localeCompare(bNat) : bNat.localeCompare(aNat)
        })
        break
      case 'embarkDate':
        sorted.sort((a, b) => {
          const aDate = a.embarkDate ? new Date(a.embarkDate).getTime() : 0
          const bDate = b.embarkDate ? new Date(b.embarkDate).getTime() : 0
          return sortType.dir === 'asc' ? aDate - bDate : bDate - aDate
        })
        break
    }
    return sorted
  }

  crewOnBoard = applySorting(crewOnBoard)

  // Expose export functions to parent via ref
  exportRef.current = { exportExcel: exportCrewListToExcel, exportPDF: exportCrewListToPDF }

  // SortDropdown component
  function SortDropdown({ col, options }: {
    col: string;
    options: Array<{ label: string; dir: 'asc'|'desc' }>;
  }) {
    if (!setSortType || !setSortMenu) return null
    return (
      <div className="relative flex-shrink-0">
        <button
          className="text-gray-400 hover:text-blue-600"
          onClick={e => { e.stopPropagation(); setSortMenu(sortMenu === col ? null : col) }}
        >
          <ChevronsUpDown className="w-3 h-3" />
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

  const renderCrewTable = () => {
    // Normalize Vietnamese text for search
    const removeAccents = (str: string) => str
      ? str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/Ä‘/g, 'd').replace(/Ä/g, 'D')
      : ''

    // Apply filters
    let displayedCrew = [...crewOnBoard]
    if (searchCrewId) {
      const q = removeAccents(searchCrewId).toLowerCase()
      displayedCrew = displayedCrew.filter(c => removeAccents(c.crewId || '').toLowerCase().includes(q))
    }
    if (searchName) {
      const q = removeAccents(searchName).toLowerCase()
      displayedCrew = displayedCrew.filter(c => removeAccents(c.fullName || '').toLowerCase().includes(q))
    }
    if (filterRankVal) {
      displayedCrew = displayedCrew.filter(c => (c.rank?.rankName || '') === filterRankVal)
    }
    if (filterNationality) {
      displayedCrew = displayedCrew.filter(c => (c.countryName || '') === filterNationality)
    }

    const uniqueRanks = [...new Set(crewOnBoard.map(c => c.rank?.rankName || '').filter(Boolean))].sort()
    const uniqueNationalities = [...new Set(crewOnBoard.map(c => c.countryName || '').filter(Boolean))].sort()

    const totalPages = Math.max(1, Math.ceil(displayedCrew.length / ITEMS_PER_PAGE))
    const startIndex = (onboardPage - 1) * ITEMS_PER_PAGE
    const paginatedCrews = displayedCrew.slice(startIndex, startIndex + ITEMS_PER_PAGE)

    return (
      <div className="bg-white">
        {/* ── TABLE ── */}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              {/* Row 1: Column headers */}
              <tr className="bg-blue-50 dark:bg-gray-800">
                <th className="w-10 px-2 py-2 text-center text-xs font-semibold text-gray-600 dark:text-gray-400 border-b border-r border-gray-200 dark:border-gray-700">{t('crew.table.no')}</th>
                <th className="w-32 px-3 py-2 text-left border-b border-r border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">{t('crew.table.crewId')}</span>
                    <SortDropdown col="crewId" options={[{label:'A → Z', dir:'asc'},{label:'Z → A', dir:'desc'}]} />
                  </div>
                </th>
                <th className="min-w-[200px] px-3 py-2 text-left border-b border-r border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">{t('crew.table.name')}</span>
                    <SortDropdown col="fullName" options={[{label:'A → Z', dir:'asc'},{label:'Z → A', dir:'desc'}]} />
                  </div>
                </th>
                <th className="w-96  px-3 py-2 text-left border-b border-r border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">{t('crew.table.rank')}</span>
                    <SortDropdown col="position" options={[{label:'A → Z', dir:'asc'},{label:'Z → A', dir:'desc'}]} />
                  </div>
                </th>
                <th className="w-36 px-3 py-2 text-left border-b border-r border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">{t('crew.fields.nationality')}</span>
                    <SortDropdown col="nationality" options={[{label:'A → Z', dir:'asc'},{label:'Z → A', dir:'desc'}]} />
                  </div>
                </th>
                <th className="w-32 px-3 py-2 text-left border-b border-r border-gray-200 dark:border-gray-700">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">{t('crew.table.embarkDate')}</span>
                    <SortDropdown col="embarkDate" options={[{label:t('crew.page.newest'), dir:'desc'},{label:t('crew.page.oldest'), dir:'asc'}]} />
                  </div>
                </th>
                <th className="w-24 px-3 py-2 text-left border-b border-gray-200 dark:border-gray-700">
                  <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">{t('crew.table.status')}</span>
                </th>
              </tr>

              {/* Row 2: Search inputs */}
              <tr className="bg-white border-b border-gray-200">
                <th className="border-r border-gray-200"></th>
                {/* Crew ID search */}
                <th className="px-2 py-1 border-r border-gray-200">
                  <div className="flex items-center gap-0.5 border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                    <input
                      type="text"
                      placeholder={t('crew.page.searchPlaceholder')}
                      value={searchCrewId}
                      onChange={e => { setSearchCrewId(e.target.value); setOnboardPage(1) }}
                      className="flex-1 text-xs outline-none min-w-0 bg-transparent"
                    />
                    <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                {/* Name search */}
                <th className="px-2 py-1 border-r border-gray-200">
                  <div className="flex items-center gap-0.5 border border-gray-200 rounded px-1.5 py-0.5 bg-white">
                    <input
                      type="text"
                      placeholder={t('crew.page.searchPlaceholder')}
                      value={searchName}
                      onChange={e => { setSearchName(e.target.value); setOnboardPage(1) }}
                      className="flex-1 text-xs outline-none min-w-0 bg-transparent"
                    />
                    <Search className="w-3 h-3 text-gray-400 flex-shrink-0" />
                  </div>
                </th>
                {/* Rank filter */}
                <th className="px-2 py-1 border-r border-gray-200">
                  <select
                    value={filterRankVal}
                    onChange={e => { setFilterRankVal(e.target.value); setOnboardPage(1) }}
                    className="w-full py-0.5 text-xs border border-gray-200 rounded outline-none bg-white"
                  >
                    <option value="">{t('crew.allRanks')}</option>
                    {uniqueRanks.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </th>
                {/* Nationality filter */}
                <th className="px-2 py-1 border-r border-gray-200">
                  <select
                    value={filterNationality}
                    onChange={e => { setFilterNationality(e.target.value); setOnboardPage(1) }}
                    className="w-full py-0.5 text-xs border border-gray-200 rounded outline-none bg-white"
                  >
                    <option value="">{t('crew.allNationalities')}</option>
                    {uniqueNationalities.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </th>
                {/* Embark Date - no filter */}
                <th className="border-r border-gray-200"></th>
                {/* Status - no filter */}
                <th className="border-gray-200"></th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100">
              {paginatedCrews.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-400">
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-40" />
                    <p>{t('crew.page.noCrewMembers')}</p>
                  </td>
                </tr>
              ) : (
                paginatedCrews.map((crew, idx) => {
                  const globalIndex = startIndex + idx + 1
                  return (
                    <tr
                      key={crew.id}
                      onContextMenu={(e) => handleContextMenu(e, crew)}
                      onClick={() => onViewCrew(crew.id)}
                      className={`cursor-pointer hover:bg-yellow-50 ${
                        selectedCrew === crew.id ? 'bg-blue-50' : idx % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'
                      }`}
                    >
                      <td className="w-10 px-2 py-2 text-center text-xs text-gray-500 border-r border-gray-200">{globalIndex}</td>
                      <td className="w-32 px-3 py-2 text-xs font-medium text-gray-900 border-r border-gray-200">
                        <div className="truncate">{crew.crewId}</div>
                      </td>
                      <td className="min-w-[200px] px-3 py-2 text-xs text-gray-900 border-r border-gray-200">
                        <div className="flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                          <span className="truncate">{crew.fullName}</span>
                        </div>
                      </td>
                      <td className="w-44 px-3 py-2 text-xs text-gray-700 border-r border-gray-200">
                        <div className="truncate">{crew.rank?.rankName || '-'}</div>
                      </td>
                      <td className="w-36 px-3 py-2 text-xs text-gray-700 border-r border-gray-200">
                        <div className="truncate">{crew.countryName || t('crew.page.na')}</div>
                      </td>
                      <td className="w-32 px-3 py-2 text-xs text-gray-700 border-r border-gray-200">
                        {crew.embarkDate ? format(parseISO(crew.embarkDate), 'dd/MM/yyyy') : '-'}
                      </td>
                      <td className="w-24 px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          {crew.isOnboard ? (
                            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-700">{t('crew.page.onboard')}</span>
                          ) : (
                            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-gray-100 text-gray-600">{t('crew.page.ashore')}</span>
                          )}
                          {shoreChangeSummary[String(crew.id)] > 0 && (
                            <span
                              title={`${shoreChangeSummary[String(crew.id)]} thay đổi từ bờ`}
                              style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, padding: '0 4px', background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 9 }}
                            >{shoreChangeSummary[String(crew.id)]}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {/* a */}
        <div className="flex items-center justify-between px-4 py-2 border-t border-gray-200 bg-white flex-shrink-0 text-xs text-gray-600">
          <div>
            <span className="border border-gray-300 rounded px-2 py-1 text-xs">{ITEMS_PER_PAGE} / {t('crew.page.perPage')}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="mr-2">
              {t('crew.page.pageInfo', { current: onboardPage, total: totalPages, count: displayedCrew.length })}
            </span>
            <button
              onClick={() => setOnboardPage(p => Math.max(1, p - 1))}
              disabled={onboardPage === 1}
              className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
            >&lsaquo;</button>
            {[...Array(Math.min(5, totalPages))].map((_, i) => {
              let page: number
              if (totalPages <= 5) page = i + 1
              else if (onboardPage <= 3) page = i + 1
              else if (onboardPage >= totalPages - 2) page = totalPages - 4 + i
              else page = onboardPage - 2 + i
              return (
                <button
                  key={page}
                  onClick={() => setOnboardPage(page)}
                  className={`w-7 h-7 flex items-center justify-center border rounded text-xs ${
                    onboardPage === page
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-300 hover:bg-gray-50'
                  }`}
                >{page}</button>
              )
            })}
            <button
              onClick={() => setOnboardPage(p => Math.min(totalPages, p + 1))}
              disabled={onboardPage === totalPages}
              className="w-7 h-7 flex items-center justify-center border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-40"
            >&rsaquo;</button>
          </div>
          <div className="flex items-center gap-2">
            <span>{t('crew.page.pagination')}</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={onboardPage}
              onChange={e => {
                const v = Number(e.target.value)
                if (v >= 1 && v <= totalPages) setOnboardPage(v)
              }}
              className="w-12 border border-gray-300 rounded px-1 py-1 text-center text-xs"
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative">
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

  if (pendingCrew.length === 0 && !pendingLoading) return (
    <div className="text-center py-12 bg-white">
      <Clock className="w-10 h-10 mx-auto mb-2 text-gray-300" />
      <p className="text-gray-400 text-sm">{t('crew.pendingSection')}: 0</p>
    </div>
  )

  return (
    <div className="bg-white">
      {pendingLoading ? (
        <div className="text-center py-6 bg-white">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-600 mx-auto"></div>
          <p className="text-gray-500 mt-2 text-sm">{t('crew.page.loadingPending')}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm border-collapse">
            <thead className="sticky top-0 z-10">
              <tr className="bg-blue-50">
                <th className="w-10 px-2 py-2 text-center text-xs font-semibold text-gray-600 border-b border-r border-gray-200">{t('crew.table.no')}</th>
                <th className="w-32 px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-r border-gray-200">{t('crew.table.crewId')}</th>
                <th className="min-w-[200px] px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-r border-gray-200">{t('crew.table.name')}</th>
                <th className="w-44 px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-r border-gray-200">{t('crew.table.rank')}</th>
                <th className="w-36 px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-r border-gray-200">{t('crew.fields.nationality')}</th>
                <th className="w-24 px-3 py-2 text-left text-xs font-semibold text-gray-600 border-b border-r border-gray-200">{t('crew.table.status')}</th>
                <th className="w-40 px-3 py-2 text-center text-xs font-semibold text-gray-600 border-b border-gray-200">{t('crew.page.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {pendingCrew.map((crew, idx) => (
                <tr key={crew.id} className={`hover:bg-blue-50 transition-colors ${idx % 2 === 1 ? 'bg-gray-50/50' : 'bg-white'}`}>
                  <td className="w-10 px-2 py-2 text-center text-xs text-gray-500 border-r border-gray-200">{idx + 1}</td>
                  <td className="w-32 px-3 py-2 text-xs font-medium text-gray-900 border-r border-gray-200">
                    <div className="truncate">{crew.crewId}</div>
                  </td>
                  <td className="min-w-[200px] px-3 py-2 text-xs text-gray-900 border-r border-gray-200">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                      <span className="truncate">{crew.fullName}</span>
                    </div>
                  </td>
                  <td className="w-44 px-3 py-2 text-xs text-gray-700 border-r border-gray-200">
                    <div className="truncate">{crew.rank?.rankName || '-'}</div>
                  </td>
                  <td className="w-36 px-3 py-2 text-xs text-gray-700 border-r border-gray-200">
                    <div className="truncate">{crew.countryName || t('crew.page.na')}</div>
                  </td>
                  <td className="w-24 px-3 py-2 text-xs border-r border-gray-200">
                    {crew.onboardStatus === 'OnHold' ? (
                      <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-orange-100 text-orange-700">{t('crew.page.onHold')}</span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-700">{t('crew.page.pending')}</span>
                    )}
                  </td>
                  <td className="w-40 px-3 py-2 text-xs">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => handleApprove(crew.id)}
                        disabled={processingId === crew.id}
                        className="flex items-center gap-1 px-2.5 py-1 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                      >
                        <UserCheck className="w-3 h-3" />
                        {t('crew.page.approve')}
                      </button>
                      <button
                        onClick={() => onViewCrew(crew.id)}
                        className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-600 text-xs font-medium rounded hover:bg-blue-100 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                        {t('crew.page.review')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

