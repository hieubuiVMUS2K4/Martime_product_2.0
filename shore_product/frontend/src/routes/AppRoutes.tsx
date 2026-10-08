import React from 'react';
import { Routes, Route, Navigate, Outlet, useLocation, useParams } from 'react-router-dom';
import { TopNavLayout } from '../components/layout';
import { CategoryManagementPage, CrewHubPage, CrewDetailPage, MasterSchedulePage, VesselsPage, ReportDetailPage, VoyageListPage, VoyageDetailPage, VoyageFormPage } from '../pages';
import { VesselDetailPage, VesselTrackingPage } from '../pages/VesselManagement';
import { SyncDashboardPage } from '../pages/SyncManagement';
import { WorkAssignmentPage } from '../pages/WorkAssignment';
import { OnboardingDashboardPage, OnboardingDetailPage } from '../pages/OnboardingManagement';
import { VerificationQueuePage } from '../pages/DocumentWorkflow';
import { ComplianceDashboardPage, RuleSetsPage, CrewEvaluationPage } from '../pages/ComplianceManagement';
import { AssignmentListPage, AssignmentDetailPage, PlanningBoardPage } from '../pages/AssignmentManagement';
import { ExternalRequestListPage, ExternalRequestDetailPage } from '../pages/ExternalRequestManagement';
import { TravelListPage, TravelDetailPage } from '../pages/TravelManagement';
import { OnboardDashboardPage } from '../pages/OnboardManagement';
import AssetsPage from '../pages/PMS/AssetsPage';
import WorkPlanningPage from '../pages/PMS/WorkPlanningPage';
import WorkReportPage from '../pages/PMS/WorkReportPage';
import { MaterialPage } from '../pages/Materials/MaterialPage';
import StoreLocationPage from '../pages/Materials/StoreLocationPage';
import MaterialRequestPage from '../pages/Materials/MaterialRequestPage';
import StockReceiptPage from '../pages/Materials/StockReceiptPage';
import InventoryPage from '../pages/Materials/InventoryPage';
import LoginPage from '../pages/Auth/LoginPage';
import { SmsDocumentPage } from '../pages/SMS/SmsDocumentPage';
import { WeatherRoutingPage } from '../pages/WeatherRouting/WeatherRoutingPage';
import { useAuth } from '../contexts/AuthContext';

/**
 * Auth guard — redirects to /login if not authenticated
 */
/** Địa chỉ cũ /report/vessel/:id → tab Báo cáo của tàu đó. */
function ReportVesselRedirect() {
  const { vesselId } = useParams<{ vesselId: string }>();
  return <Navigate to={`/vessels/${vesselId}?tab=reports`} replace />;
}

function RequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#0f172a' }}>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.875rem' }}>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}

/**
 * Main application routes
 * 
 * Cấu trúc:
 * - / -> redirect to /report
 * - TopNavLayout bao bọc tất cả các page với thanh điều hướng ngang
 * - Các route con render trong <Outlet /> của TopNavLayout
 */
export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public route */}
      <Route path="/login" element={<LoginPage />} />

      {/* Protected routes */}
      <Route element={<RequireAuth />}>
        <Route path="/" element={<Navigate to="/vessels" replace />} />
        
        <Route element={<TopNavLayout />}>
        {/* Báo cáo nay là nhóm "Báo cáo" trong Chi tiết tàu */}
        <Route path="/report" element={<Navigate to="/vessels" replace />} />
        <Route path="/report/vessel/:vesselId" element={<ReportVesselRedirect />} />
        <Route path="/report/:reportId" element={<ReportDetailPage />} />
        <Route path="/categories" element={<CategoryManagementPage />} />
        <Route path="/crew" element={<CrewHubPage />} />
        <Route path="/crew/:id" element={<CrewDetailPage />} />
        {/* Địa chỉ cũ, nay là tab của trang Quản lý thuyền viên */}
        <Route path="/certificates" element={<Navigate to="/crew?tab=certificates" replace />} />
        <Route path="/sign-off-requests" element={<Navigate to="/crew?tab=sign-off" replace />} />
        <Route path="/sync" element={<SyncDashboardPage />} />
        <Route path="/work-assignments" element={<WorkAssignmentPage />} />
        <Route path="/vessels" element={<VesselsPage />} />
        <Route path="/vessels/tracking" element={<VesselTrackingPage />} />
        <Route path="/weather-routing" element={<WeatherRoutingPage />} />
        <Route path="/vessels/:id" element={<VesselDetailPage />} />
        <Route path="/vessels/:vesselId/crew/:id" element={<CrewDetailPage />} />
        <Route path="/pms/master-schedule" element={<MasterSchedulePage />} />
        <Route path="/onboarding" element={<OnboardingDashboardPage />} />
        <Route path="/onboarding/:caseId" element={<OnboardingDetailPage />} />
        <Route path="/verification-queue" element={<VerificationQueuePage />} />
        <Route path="/compliance" element={<ComplianceDashboardPage />} />
        <Route path="/compliance/rule-sets" element={<RuleSetsPage />} />
        <Route path="/compliance/evaluate/:crewId" element={<CrewEvaluationPage />} />
        <Route path="/assignments" element={<AssignmentListPage />} />
        <Route path="/assignments/:id" element={<AssignmentDetailPage />} />
        <Route path="/assignments/planning/:vesselId" element={<PlanningBoardPage />} />
        <Route path="/external-requests" element={<ExternalRequestListPage />} />
        <Route path="/external-requests/:id" element={<ExternalRequestDetailPage />} />
        <Route path="/travel" element={<TravelListPage />} />
        <Route path="/travel/:id" element={<TravelDetailPage />} />
        <Route path="/onboard-events" element={<OnboardDashboardPage />} />
        <Route path="/pms/assets" element={<AssetsPage />} />
        <Route path="/pms/work-planning" element={<WorkPlanningPage />} />
        <Route path="/pms/work-report/:id" element={<WorkReportPage />} />
        <Route path="/materials" element={<MaterialPage />} />
        <Route path="/materials/store-locations" element={<StoreLocationPage />} />
        <Route path="/materials/requests" element={<MaterialRequestPage />} />
        <Route path="/materials/receipts" element={<StockReceiptPage />} />
        <Route path="/materials/inventory" element={<InventoryPage />} />
        <Route path="/voyages" element={<VoyageListPage />} />
        <Route path="/voyages/new" element={<VoyageFormPage />} />
        <Route path="/voyages/:id/edit" element={<VoyageFormPage />} />
        <Route path="/voyages/:id" element={<VoyageDetailPage />} />
        <Route path="/sms" element={<SmsDocumentPage />} />
        <Route path="/sms/form/:templateId" element={<SmsDocumentPage />} />
        <Route path="/safety/hsqe" element={<SmsDocumentPage />} />
        <Route path="/safety/hsqe/form/:templateId" element={<SmsDocumentPage />} />
        </Route>
      </Route>
      
      {/* 404 */}
      <Route path="*" element={<div>404 - Page Not Found</div>} />
    </Routes>
  );
};
