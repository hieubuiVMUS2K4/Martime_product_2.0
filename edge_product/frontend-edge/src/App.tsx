import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'sonner'
import { MainLayout } from './components/layouts/MainLayout'
import { SettingsDialog } from './components/settings'
import { AuthGuard } from './components/auth/AuthGuard'
import { LoginPage } from './pages/Auth/LoginPage'

// Pages
import { DashboardPage } from './pages/Dashboard/DashboardPage'
import { CrewPage } from './pages/Crew/CrewPage'
import { CrewCertificatePage } from './pages/Crew/CertificateMonitorView'
import { CrewDetailPage } from './pages/Crew/CrewDetailPage'
import { CertificateManagementPage } from './pages/Crew/CertificateManagementPage'
import { MaintenancePage } from './pages/Maintenance/MaintenancePage'
import { MaintenanceDetailPage } from './pages/Maintenance/MaintenanceDetailPage'
import { VoyagePage } from './pages/Voyage/VoyagePage'
import { PortManagementPage } from './pages/Voyage/PortManagementPage'
import { SyncPage } from './pages/Sync/SyncPage'
import { MaterialPage } from './pages/Material/MaterialPage'

// PMS Pages
import AssetsPage from './pages/PMS/AssetsPage'
import MasterSchedulePage from './pages/PMS/MasterSchedulePage'
import UnassignedTasksPage from './pages/PMS/UnassignedTasksPage'
import ApprovalDashboardPage from './pages/PMS/ApprovalDashboardPage'
import WorkPlanningPage from './pages/PMS/WorkPlanningPage'
import WorkReportPage from './pages/PMS/WorkReportPage'
import { MaintenanceHistoryPage } from './pages/PMS/MaintenanceHistoryPage'
import StoreLocationPage from './pages/StoreLocation/StoreLocationPage'
import MaterialRequestPage from './pages/MaterialRequest/MaterialRequestPage'
import StockReceiptPage from './pages/StockReceipt/StockReceiptPage'
import InventoryPage from './pages/Inventory/InventoryPage'

// Reporting Pages
import { ReportingDashboard } from './pages/Reporting/ReportingDashboard'
import { ReportsPage } from './pages/Reporting/ReportsPage'
import { ReportDetailPage } from './pages/Reporting/ReportDetailPage'
import { NoonReportForm } from './pages/Reporting/NoonReportForm'
import { DepartureReportForm } from './pages/Reporting/DepartureReportForm'
import { ArrivalReportForm } from './pages/Reporting/ArrivalReportForm'
import { BunkerReportForm } from './pages/Reporting/BunkerReportForm'
import { PositionReportForm } from './pages/Reporting/PositionReportForm'

// Ship Data
import { ShipDataPage } from './pages/ShipData/ShipDataPage'

// Navigation Pages
import { NavigationPage } from './pages/Navigation/NavigationPage'

// Logbook Pages
import { DeckLogPage } from './pages/logbooks/DeckLogPage'
import { EngineLogPage } from './pages/logbooks/EngineLogPage'
import { OilRecordPage } from './pages/logbooks/OilRecordPage'
import { GarbageRecordPage } from './pages/logbooks/GarbageRecordPage'
import { GarbageManagementPage } from './pages/logbooks/GarbageManagementPage'
import { BallastWaterPage } from './pages/logbooks/BallastWaterPage'
import { WatchkeepingPage } from './pages/logbooks/WatchkeepingPage'
import { VoyageLogPage } from './pages/logbooks/VoyageLogPage'
import { VoyageLogDetailPage } from './pages/logbooks/VoyageLogDetailPage'
import { AbstractLogPage } from './pages/logbooks/AbstractLogPage'

// Safety Pages
import { DrillTimelinePage } from './pages/Safety/DrillTimelinePage'
import { HSQEPage } from './pages/HSQE/HSQEPage'
import { SmsDocumentPage } from './pages/HSQE/components/SmsDocumentPage'

// System Pages
import { AuditLogPage } from './pages/AuditLog/AuditLogPage'
import { AccountManagementPage } from './pages/Admin/AccountManagementPage'

function App() {
  return (
    <>
      {/* Global toast provider (sonner).
          Máº·c Ä‘á»‹nh sonner chá»‰ hiá»‡n ~4s vÃ  trÆ°á»£t vÃ o ráº¥t nhanh nÃªn thÃ´ng bÃ¡o thÃªm/sá»­a/xoÃ¡
          nhÃ¡y má»™t cÃ¡i lÃ  máº¥t. KÃ©o dÃ i thá»i gian hiá»‡n vÃ  báº­t nÃºt Ä‘Ã³ng Ä‘á»ƒ Ä‘á»c ká»‹p. */}
      <Toaster
        position="top-right"
        duration={6000}
        closeButton
        richColors
        visibleToasts={4}
        toastOptions={{ style: { transition: 'all 320ms cubic-bezier(0.16, 1, 0.3, 1)' } }}
      />
      {/* Hai modal tÃ i liá»‡u dÃ¹ng react-toastify, Ä‘á»ƒ cÃ¹ng thá»i lÆ°á»£ng vá»›i sonner cho Ä‘á»“ng nháº¥t. */}
      <ToastContainer position="top-right" autoClose={6000} hideProgressBar={false} newestOnTop closeOnClick pauseOnHover draggable theme="colored" transition={Slide} />
      
      {/* Settings Dialog (renders as portal, controlled by zustand store) */}
      <SettingsDialog />

      <Routes>
      {/* Public: Login Page */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected: All app routes wrapped with AuthGuard */}
      <Route path="/" element={<AuthGuard><MainLayout /></AuthGuard>}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="navigation" element={<NavigationPage />} />
        {/* <Route path="engine" element={<EnginePage />} /> */} {/* Temporarily hidden */}
        {/* <Route path="alarms" element={<AlarmsPage />} /> */} {/* Temporarily hidden */}
        <Route path="crew" element={<Navigate to="/crew/members" replace />} />
        <Route path="crew/members" element={<CrewPage />} />
        <Route path="crew/certificates" element={<CrewCertificatePage />} />
        <Route path="crew/certificates/:certificateId" element={<CertificateManagementPage />} />
        <Route path="crew/:id" element={<CrewDetailPage />} />
        <Route path="pms/maintenance" element={<MaintenancePage />} />
        <Route path="voyage" element={<VoyagePage />} />
        <Route path="ports" element={<PortManagementPage />} />
        <Route path="ship-data" element={<ShipDataPage />} />
        {/* <Route path="compliance" element={<CompliancePage />} /> */} {/* Temporarily hidden */}
        <Route path="sync" element={<SyncPage />} />

        {/* <Route path="fuel-analytics" element={<FuelAnalyticsPage />} /> */} {/* Temporarily hidden */}
        
        {/* Logbook Routes */}
        <Route path="logbooks/deck" element={<DeckLogPage />} />
        <Route path="logbooks/engine" element={<EngineLogPage />} />
        <Route path="logbooks/oil" element={<OilRecordPage />} />
        <Route path="logbooks/garbage" element={<GarbageManagementPage />} />
        <Route path="logbooks/garbage-old" element={<GarbageRecordPage />} />
        <Route path="logbooks/ballast" element={<BallastWaterPage />} />
        <Route path="logbooks/watchkeeping" element={<WatchkeepingPage />} />
        <Route path="logbooks/voyage" element={<VoyageLogPage />} />
        <Route path="logbooks/voyage/:id" element={<VoyageLogDetailPage />} />
        <Route path="logbooks/abstract" element={<AbstractLogPage />} />
        <Route path="logbooks/abstract/:id" element={<AbstractLogPage />} />
        
        {/* Safety Routes */}
        <Route path="safety/drills" element={<DrillTimelinePage />} />
        <Route path="safety/hsqe" element={<HSQEPage />} />

        {/* PMS Routes */}
        <Route path="pms/catalog/assets" element={<AssetsPage />} />
        <Route path="pms/catalog/materials" element={<MaterialPage />} />
        <Route path="pms/catalog/store-locations" element={<StoreLocationPage />} />
        <Route path="pms/logistics/material-requests" element={<MaterialRequestPage />} />
        <Route path="pms/logistics/stock-receipts" element={<StockReceiptPage />} />
        <Route path="pms/logistics/inventory" element={<InventoryPage />} />
        {/* Schedule Config is now integrated into Work Planning page as "Cáº¥u hÃ¬nh" tab */}
        <Route path="pms/master-schedule" element={<MasterSchedulePage />} />
        <Route path="pms/unassigned-tasks" element={<UnassignedTasksPage />} />
        <Route path="pms/approval-dashboard" element={<ApprovalDashboardPage />} />
        <Route path="pms/maintenance-history" element={<MaintenanceHistoryPage />} />
        <Route path="pms/work-planning" element={<WorkPlanningPage />} />
        <Route path="pms/work-report/:id" element={<WorkReportPage />} />
        
        {/* Reporting Routes */}
        {/* System Routes */}
        <Route path="audit-log" element={<AuditLogPage />} />
        <Route path="admin/accounts" element={<AccountManagementPage />} />

        <Route path="reporting" element={<ReportingDashboard />} />
        <Route path="reporting/reports" element={<ReportsPage />} />
        <Route path="reporting/reports/:id" element={<ReportDetailPage />} />
        <Route path="reporting/noon/new" element={<NoonReportForm />} />
        <Route path="reporting/noon/edit/:id" element={<NoonReportForm />} />
        <Route path="reporting/departure/new" element={<DepartureReportForm />} />
        <Route path="reporting/departure/edit/:id" element={<DepartureReportForm />} />
        <Route path="reporting/arrival/new" element={<ArrivalReportForm />} />
        <Route path="reporting/arrival/edit/:id" element={<ArrivalReportForm />} />
        <Route path="reporting/bunker/new" element={<BunkerReportForm />} />
        <Route path="reporting/bunker/edit/:id" element={<BunkerReportForm />} />
        <Route path="reporting/position/new" element={<PositionReportForm />} />
        <Route path="reporting/position/edit/:id" element={<PositionReportForm />} />
      </Route>
      
      {/* Full-screen pages outside MainLayout (still protected) */}
      <Route path="/crew/:id/standalone" element={<AuthGuard><CrewDetailPage /></AuthGuard>} />
      <Route path="/pms/maintenance/:id" element={<AuthGuard><MaintenanceDetailPage /></AuthGuard>} />
      <Route path="/safety/hsqe/form/:templateId" element={<AuthGuard><SmsDocumentPage /></AuthGuard>} />

      {/* Catch-all: redirect unknown routes to dashboard */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  )
}

export default App

