import { useState, useMemo, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { usePermissionsStore, canOpen } from '@/stores/permissions.store'
import {
  LayoutDashboard, Navigation, Users, Ship, FileText, RefreshCw, Anchor, Boxes, ClipboardList, BookOpen,
  Droplets, Compass, Trash2, Waves, Clock, Calendar, Settings, ChevronDown, MapPin, Shield, PanelLeftClose,
  PanelLeftOpen, Warehouse, PackageCheck, BarChart3, Award, FileCheck, History, ListChecks, LifeBuoy,
  type LucideIcon,
} from 'lucide-react'
import { useTranslationSafe } from '@/contexts/I18nContext'

/*
  Menu bên trái của phân hệ tàu.
  - Tối đa 2 tầng: nhóm → mục. Trong nhóm có thể chia "phân đoạn" bằng tiêu đề nhỏ (Danh mục, Kho vận)
    thay vì lồng thêm một tầng bấm mở.
  - Chỉ tự mở nhóm chứa trang đang xem; mục đang chọn tô xanh nhạt, nhóm cha cũng sáng theo.
*/

interface Leaf { name: string; to: string; icon: LucideIcon }
interface Section { label: string; items: Leaf[] }
interface Group { id: string; name: string; icon: LucideIcon; children: (Leaf | Section)[] }
type Entry = Leaf | Group

const isGroup = (e: Entry): e is Group => 'children' in e
const isSection = (c: Leaf | Section): c is Section => 'items' in c
const leavesOf = (g: Group): Leaf[] => g.children.flatMap(c => (isSection(c) ? c.items : [c]))

const getNavigation = (t: (key: string) => string): Entry[] => [
  { name: t('nav.dashboard'), to: '/dashboard', icon: LayoutDashboard },
  { name: t('nav.navigation'), to: '/navigation', icon: Navigation },
  { name: t('nav.shipData') || 'Dữ liệu tàu', to: '/ship-data', icon: Anchor },
  {
    id: 'crew', name: t('nav.crewManagement'), icon: Users,
    children: [
      { name: t('nav.crewMembersManagement'), to: '/crew/members', icon: Users },
      { name: t('nav.certificateManagement'), to: '/crew/certificates', icon: Award },
    ],
  },
  {
    id: 'operations', name: t('nav.operationsManagement'), icon: Compass,
    children: [
      { name: t('nav.ports') || 'Cảng', to: '/ports', icon: MapPin },
      { name: t('nav.voyage'), to: '/voyage', icon: Ship },
      { name: t('nav.reporting'), to: '/reporting', icon: ClipboardList },
    ],
  },
  {
    id: 'logbooks', name: t('nav.logbooks'), icon: BookOpen,
    children: [
      { name: t('nav.voyageLog'), to: '/logbooks/voyage', icon: MapPin },
      { name: t('nav.deckLog'), to: '/logbooks/deck', icon: Compass },
      { name: t('nav.engineLog'), to: '/logbooks/engine', icon: Settings },
      { name: t('nav.oilRecord'), to: '/logbooks/oil', icon: Droplets },
      { name: t('nav.garbageRecord'), to: '/logbooks/garbage', icon: Trash2 },
      { name: t('nav.ballastWater'), to: '/logbooks/ballast', icon: Waves },
      { name: t('nav.watchkeeping'), to: '/logbooks/watchkeeping', icon: Clock },
      { name: t('nav.abstractLog') || 'Nhật ký chung', to: '/logbooks/abstract', icon: FileText },
    ],
  },
  {
    id: 'pms', name: t('nav.pms'), icon: Calendar,
    children: [
      { name: t('nav.workPlanning') || 'Danh sách công việc', to: '/pms/work-planning', icon: ListChecks },
      {
        label: t('nav.catalog'),
        items: [
          { name: t('nav.equipmentManagement'), to: '/pms/catalog/assets', icon: Settings },
          { name: t('nav.materialsManagement'), to: '/pms/catalog/materials', icon: Boxes },
          { name: t('nav.storeLocationsManagement'), to: '/pms/catalog/store-locations', icon: Warehouse },
        ],
      },
      {
        label: t('nav.warehouseManagement'),
        items: [
          { name: t('nav.materialRequests'), to: '/pms/logistics/material-requests', icon: ClipboardList },
          { name: t('nav.stockReceipts'), to: '/pms/logistics/stock-receipts', icon: PackageCheck },
          { name: t('nav.inventory'), to: '/pms/logistics/inventory', icon: BarChart3 },
        ],
      },
    ],
  },
  { name: t('nav.hsqe') || 'Tài liệu & tuân thủ', to: '/safety/hsqe', icon: FileCheck },
  {
    id: 'safety', name: t('nav.safety'), icon: Shield,
    children: [{ name: t('nav.drillTraining'), to: '/safety/drills', icon: LifeBuoy }],
  },
  { name: t('nav.auditLog') || 'Nhật ký kiểm toán', to: '/audit-log', icon: History },
  { name: t('nav.sync'), to: '/sync', icon: RefreshCw },
]

const isUnder = (pathname: string, to: string) => pathname === to || pathname.startsWith(`${to}/`)

export function Sidebar() {
  const location = useLocation()
  const { t } = useTranslationSafe()
  const permissionState = usePermissionsStore()
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true' } catch { return false }
  })

  // Chỉ giữ mục người dùng được mở; nhóm/phân đoạn rỗng thì ẩn.
  const navigation = useMemo(() => getNavigation(t).flatMap<Entry>(entry => {
    if (!isGroup(entry)) return canOpen(entry.to) ? [entry] : []
    const children = entry.children.flatMap<Leaf | Section>(c => {
      if (!isSection(c)) return canOpen(c.to) ? [c] : []
      const items = c.items.filter(i => canOpen(i.to))
      return items.length ? [{ ...c, items }] : []
    })
    return children.length ? [{ ...entry, children }] : []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [t, permissionState.grants, permissionState.isAdmin, permissionState.modules, permissionState.loaded])

  const activeGroupId = navigation.find(e => isGroup(e) && leavesOf(e).some(l => isUnder(location.pathname, l.to)))
  const activeId = activeGroupId && isGroup(activeGroupId) ? activeGroupId.id : null

  const [expanded, setExpanded] = useState<string[]>(() => (activeId ? [activeId] : []))
  // Chuyển trang sang nhóm khác thì tự mở nhóm đó.
  useEffect(() => {
    if (activeId) setExpanded(prev => (prev.includes(activeId) ? prev : [...prev, activeId]))
  }, [activeId])

  const toggleGroup = (id: string) => {
    if (isCollapsed) { setIsCollapsed(false); setExpanded([id]); return }
    setExpanded(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }

  // Màn hẹp (< 1024px) tự thu gọn để nội dung không bị ép; rộng lại thì trả về lựa chọn đã lưu.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const apply = () => {
      if (mq.matches) setIsCollapsed(true)
      else {
        try { setIsCollapsed(localStorage.getItem('sidebar-collapsed') === 'true') } catch { /* bỏ qua */ }
      }
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  const toggleSidebar = () => {
    const next = !isCollapsed
    setIsCollapsed(next)
    try { localStorage.setItem('sidebar-collapsed', String(next)) } catch { /* bỏ qua */ }
  }

  const rowBase = 'flex w-full items-center gap-3 rounded-lg text-sm transition-colors'
  const idle = 'text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700/60 dark:hover:text-white'
  const selected = 'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'

  const renderLeaf = (leaf: Leaf, child = false) => (
    <NavLink
      key={leaf.to}
      to={leaf.to}
      title={isCollapsed ? leaf.name : undefined}
      className={({ isActive }) =>
        `${rowBase} ${child ? 'py-1.5 pl-3 pr-2' : isCollapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'} ${
          isActive ? selected : child ? 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700/60 dark:hover:text-white' : idle
        }`
      }
    >
      <leaf.icon className={`${child ? 'h-4 w-4' : 'h-5 w-5'} shrink-0`} aria-hidden="true" />
      {!isCollapsed && <span className="min-w-0 flex-1 truncate" title={leaf.name}>{leaf.name}</span>}
    </NavLink>
  )

  return (
    <div className={`${isCollapsed ? 'w-16' : 'w-64'} flex h-full shrink-0 flex-col border-r border-gray-200 bg-white transition-all duration-300 dark:border-gray-700 dark:bg-gray-800`}>
      {/* Logo */}
      <div className={`flex h-16 shrink-0 items-center gap-2.5 border-b border-gray-200 px-4 dark:border-gray-700 ${isCollapsed ? 'justify-center' : ''}`}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white">
          <Anchor className="h-5 w-5" aria-hidden="true" />
        </span>
        {!isCollapsed && <span className="truncate text-base font-bold text-gray-900 dark:text-white">{t('nav.edgeDashboard')}</span>}
      </div>

      {/* Menu */}
      <nav className={`flex-1 space-y-0.5 overflow-y-auto py-4 ${isCollapsed ? 'px-2' : 'px-3'}`} aria-label="Menu chính">
        {navigation.map(entry => {
          if (!isGroup(entry)) return renderLeaf(entry)

          const open = expanded.includes(entry.id) && !isCollapsed
          const containsActive = entry.id === activeId
          return (
            <div key={entry.id}>
              <button
                type="button"
                onClick={() => toggleGroup(entry.id)}
                aria-expanded={open}
                title={isCollapsed ? entry.name : undefined}
                className={`${rowBase} ${isCollapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5'} ${
                  containsActive ? (isCollapsed ? selected : 'font-semibold text-blue-700 hover:bg-gray-100 dark:text-blue-300 dark:hover:bg-gray-700/60') : idle
                }`}
              >
                <entry.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                {!isCollapsed && (
                  <>
                    <span className="min-w-0 flex-1 truncate text-left">{entry.name}</span>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`} aria-hidden="true" />
                  </>
                )}
              </button>

              {open && (
                <div className="mb-1 ml-[22px] mt-0.5 space-y-0.5 border-l border-gray-200 pl-2 dark:border-gray-700">
                  {entry.children.map(c =>
                    isSection(c) ? (
                      <div key={c.label} className="pt-1.5">
                        <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{c.label}</p>
                        <div className="space-y-0.5">{c.items.map(i => renderLeaf(i, true))}</div>
                      </div>
                    ) : renderLeaf(c, true),
                  )}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Thu gọn / mở rộng */}
      <div className="shrink-0 border-t border-gray-200 p-2 dark:border-gray-700">
        <button
          type="button"
          onClick={toggleSidebar}
          title={isCollapsed ? 'Mở rộng menu' : 'Thu gọn menu'}
          className="flex w-full items-center justify-center gap-2 rounded-lg p-2 text-sm text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
        >
          {isCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <><PanelLeftClose className="h-5 w-5" /> Thu gọn</>}
        </button>
      </div>
    </div>
  )
}
