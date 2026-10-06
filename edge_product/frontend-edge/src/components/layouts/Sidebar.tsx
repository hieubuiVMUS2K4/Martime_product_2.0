import { useState, useMemo } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { usePermissionsStore, canOpen } from '@/stores/permissions.store'
import {
  LayoutDashboard,
  Navigation,
  Users,
  Ship,
  FileText,
  RefreshCw,
  Anchor,
  Boxes,
  ClipboardList,
  BookOpen,
  Droplets,
  Compass,
  Trash2,
  Waves,
  Clock,
  Calendar,
  Settings,
  ChevronDown,
  ChevronRight,
  MapPin,
  Shield,
  PanelLeftClose,
  PanelLeftOpen,
  Warehouse,
  PackageCheck,
  BarChart3,
  FolderOpen,
} from 'lucide-react'
import { useTranslationSafe } from '@/contexts/I18nContext'

// Navigation items with translation keys
const getNavigation = (t: (key: string) => string) => [
  { name: t('nav.dashboard'), to: '/dashboard', icon: LayoutDashboard },
  { name: t('nav.navigation'), to: '/navigation', icon: Navigation },
  { name: t('nav.shipData') || 'Ship Data', to: '/ship-data', icon: Anchor },
  { name: t('nav.crewManagement'), icon: Users, subItems: [
    { name: t('nav.crewMembersManagement'), to: '/crew/members', icon: Users },
    { name: t('nav.certificateManagement'), to: '/crew/certificates', icon: Shield },
  ] },
  { 
    name: t('nav.operationsManagement'),
    icon: Compass,
    subItems: [
      { name: t('nav.ports') || 'Ports', to: '/ports', icon: MapPin },
      { name: t('nav.voyage'), to: '/voyage', icon: Ship },
      { name: t('nav.reporting'), to: '/reporting', icon: ClipboardList },
    ]
  },
  { 
    name: t('nav.pms'), 
    icon: Calendar, 
    subItems: [
      { 
        name: t('nav.catalog'), 
        icon: FolderOpen, 
        children: [
          { name: t('nav.equipmentManagement'), to: '/pms/catalog/assets', icon: Settings },
          { name: t('nav.materialsManagement'), to: '/pms/catalog/materials', icon: Boxes },
          { name: t('nav.storeLocationsManagement'), to: '/pms/catalog/store-locations', icon: Warehouse },
        ]
      },
      {
        name: t('nav.warehouseManagement'),
        icon: Warehouse,
        children: [
          { name: t('nav.materialRequests'), to: '/pms/logistics/material-requests', icon: ClipboardList },
          { name: t('nav.stockReceipts'), to: '/pms/logistics/stock-receipts', icon: PackageCheck },
          { name: t('nav.inventory'), to: '/pms/logistics/inventory', icon: BarChart3 },
        ]
      },
      { name: t('nav.workPlanning') || 'Danh sách công việc', to: '/pms/work-planning', icon: ClipboardList },
    ]
  },
  // { name: t('nav.compliance'), to: '/compliance', icon: FileText }, // Temporarily hidden
  { name: t('nav.hsqe') || 'Quản lý tài liệu và tuân thủ', to: '/safety/hsqe', icon: Shield },
  { 
    name: t('nav.safety'), 
    icon: Shield, 
    subItems: [
      { name: t('nav.drillTraining'), to: '/safety/drills', icon: Calendar },
    ]
  },
  { name: t('nav.auditLog') || 'Audit Log', to: '/audit-log', icon: Shield, roles: ['ADMIN', 'CAPTAIN'] },
  { name: t('nav.sync'), to: '/sync', icon: RefreshCw },
]

// Logbooks submenu with translation keys
const getLogbooksMenu = (t: (key: string) => string) => [
  { name: t('nav.voyageLog'), to: '/logbooks/voyage', icon: MapPin },
  { name: t('nav.deckLog'), to: '/logbooks/deck', icon: Compass },
  { name: t('nav.engineLog'), to: '/logbooks/engine', icon: BookOpen },
  { name: t('nav.oilRecord'), to: '/logbooks/oil', icon: Droplets },
  { name: t('nav.garbageRecord'), to: '/logbooks/garbage', icon: Trash2 },
  { name: t('nav.ballastWater'), to: '/logbooks/ballast', icon: Waves },
  { name: t('nav.watchkeeping'), to: '/logbooks/watchkeeping', icon: Clock },
  { name: t('nav.abstractLog') || 'Abstract Log', to: '/logbooks/abstract', icon: FileText },
]

export function Sidebar() {
  const location = useLocation()
  const { t } = useTranslationSafe()
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('sidebar-collapsed') === 'true'; } catch { return false; }
  })
  const [logbooksOpen, setLogbooksOpen] = useState(location.pathname.startsWith('/logbooks'))
  const [expandedMenus, setExpandedMenus] = useState<string[]>(() => {
    const initial: string[] = [t('nav.pms')]
    if (location.pathname.startsWith('/crew')) initial.push(t('nav.crewManagement'))
    if (location.pathname.startsWith('/ports') || location.pathname.startsWith('/voyage') || location.pathname.startsWith('/reporting')) {
      initial.push(t('nav.operationsManagement'))
    }
    return initial
  })
  const permissionState = usePermissionsStore()

  // Get translated navigation items, filtered by user role
  const navigation = useMemo(() => {
    const items = getNavigation(t)
    return items.map(item => {
      if ('subItems' in item && item.subItems) {
        const subItems = item.subItems.map(sub => {
          if ('children' in sub && sub.children) return { ...sub, children: sub.children.filter(child => canOpen(child.to)) }
          return sub
        }).filter(sub => ('to' in sub && sub.to ? canOpen(sub.to) : 'children' in sub && !!sub.children?.length))
        return { ...item, subItems }
      }
      return item
    }).filter(item => 'to' in item && item.to ? canOpen(item.to) : 'subItems' in item && !!item.subItems?.length)
  }, [t, permissionState.grants, permissionState.isAdmin, permissionState.modules, permissionState.loaded])
  const logbooksMenu = getLogbooksMenu(t).filter(item => canOpen(item.to))

  const toggleMenu = (menuName: string) => {
    if (isCollapsed) {
      setIsCollapsed(false)
    }
    setExpandedMenus(prev => 
      prev.includes(menuName) 
        ? prev.filter(m => m !== menuName)
        : [...prev, menuName]
    )
  }

  const toggleSidebar = () => {
    const next = !isCollapsed;
    setIsCollapsed(next)
    try { localStorage.setItem('sidebar-collapsed', String(next)); } catch {}
    // Close all submenus when collapsing
    if (next) {
      setExpandedMenus([])
      setLogbooksOpen(false)
    }
  }

  return (
    <div className={`${isCollapsed ? 'w-16' : 'w-64'} bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col h-full transition-all duration-300`}>
      {/* Logo */}
      <div className={`flex items-center ${isCollapsed ? 'justify-center' : ''} h-16 px-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0`}>
        <Anchor className="w-8 h-8 text-blue-600 dark:text-blue-400 flex-shrink-0" />
        {!isCollapsed && (
          <span className="ml-2 text-xl font-bold text-gray-800 dark:text-white">
            {t('nav.edgeDashboard')}
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
        {navigation.map((item) => (
          item.subItems ? (
            <div key={item.name}>
              <button
                onClick={() => toggleMenu(item.name)}
                className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'} px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                  isCollapsed && item.subItems?.some(s => s.to ? location.pathname.startsWith(s.to.split('/').slice(0, 2).join('/')) : s.children?.some(c => location.pathname.startsWith(c.to.split('/').slice(0, 2).join('/'))))
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
                title={item.name}
              >
                <div className={`flex items-center ${isCollapsed ? 'justify-center' : ''}`}>
                  <item.icon className={`w-5 h-5 ${isCollapsed ? '' : 'mr-3'} flex-shrink-0 ${
                    isCollapsed && item.subItems?.some(s => s.to ? location.pathname.startsWith(s.to.split('/').slice(0,2).join('/')) : s.children?.some(c => location.pathname.startsWith(c.to.split('/').slice(0,2).join('/'))))
                      ? 'text-white' : ''
                  }`} />
                  {!isCollapsed && <span>{item.name}</span>}
                </div>
                {!isCollapsed && (
                  expandedMenus.includes(item.name) ? (
                    <ChevronDown className="w-4 h-4" />
                  ) : (
                    <ChevronRight className="w-4 h-4" />
                  )
                )}
              </button>
              {expandedMenus.includes(item.name) && !isCollapsed && (
                <div className="ml-4 mt-1 space-y-1">
                  {item.subItems.map((subItem) => (
                    'children' in subItem && subItem.children ? (
                      <div key={subItem.name}>
                        <button
                          onClick={() => toggleMenu(subItem.name)}
                          className={`w-full flex items-center justify-between px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                            subItem.children.some(c => location.pathname === c.to)
                              ? 'text-blue-600 dark:text-blue-400'
                              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`}
                        >
                          <div className="flex items-center">
                            <subItem.icon className="w-4 h-4 mr-2 flex-shrink-0" />
                            <span className="truncate">{subItem.name}</span>
                          </div>
                          {expandedMenus.includes(subItem.name) ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                        </button>
                        {expandedMenus.includes(subItem.name) && (
                          <div className="ml-4 mt-1 space-y-1">
                            {subItem.children.map((child) => (
                              <NavLink
                                key={child.to}
                                to={child.to}
                                className={({ isActive }) =>
                                  `flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                                    isActive
                                      ? 'bg-blue-600 text-white shadow-md'
                                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                  }`
                                }
                              >
                                {({ isActive }) => (
                                  <>
                                    <child.icon className={`w-4 h-4 mr-2 flex-shrink-0 ${isActive ? 'text-white' : ''}`} />
                                    <span className="truncate">{child.name}</span>
                                  </>
                                )}
                              </NavLink>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                    <NavLink
                      key={subItem.to}
                      to={subItem.to}
                      className={({ isActive }) =>
                        `flex items-center px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                          isActive
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <subItem.icon className={`w-4 h-4 mr-2 flex-shrink-0 ${isActive ? 'text-white' : ''}`} />
                          <span className="truncate">{subItem.name}</span>
                        </>
                      )}
                    </NavLink>
                    )
                  ))}
                </div>
              )}
            </div>
          ) : (
            <NavLink
              key={item.to}
              to={item.to!}
              className={({ isActive }) =>
                `flex items-center ${isCollapsed ? 'justify-center' : ''} px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                }`
              }
              title={item.name}
            >
              {({ isActive }) => (
                <>
                  <item.icon className={`w-5 h-5 ${isCollapsed ? '' : 'mr-3'} flex-shrink-0 ${isActive ? 'text-white' : ''}`} />
                  {!isCollapsed && <span className="truncate">{item.name}</span>}
                </>
              )}
            </NavLink>
          )
        ))}

        {/* Logbooks Section */}
        <div>
          <button
            onClick={() => {
              if (isCollapsed) {
                setIsCollapsed(false)
              }
              setLogbooksOpen(!logbooksOpen)
            }}
            className={`w-full flex items-center ${isCollapsed ? 'justify-center' : ''} px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
              location.pathname.startsWith('/logbooks')
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
            }`}
            title={isCollapsed ? t('nav.logbooks') : ''}
          >
            <FileText className={`w-5 h-5 ${isCollapsed ? '' : 'mr-3'} flex-shrink-0 ${location.pathname.startsWith('/logbooks') ? 'text-white' : ''}`} />
            {!isCollapsed && (
              <>
                <span className="truncate flex-1 text-left">{t('nav.logbooks')}</span>
                {logbooksOpen ? (
                  <ChevronDown className="w-4 h-4 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-4 h-4 flex-shrink-0" />
                )}
              </>
            )}
          </button>

          {/* Submenu */}
          {logbooksOpen && !isCollapsed && (
            <div className="ml-4 mt-2 space-y-1 border-l-2 border-gray-300 dark:border-gray-600 pl-2">
              {logbooksMenu.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      isActive
                        ? 'bg-blue-500 text-white'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-white'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon className={`w-4 h-4 mr-2 flex-shrink-0 ${isActive ? 'text-white' : ''}`} />
                      <span className="truncate">{item.name}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Toggle Button */}
      <div className="p-2 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
        <button
          onClick={toggleSidebar}
          className="w-full flex items-center justify-center p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="w-5 h-5" />
          ) : (
            <>
              <PanelLeftClose className="w-5 h-5 mr-2" />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </button>
      </div>


    </div>
  )
}
