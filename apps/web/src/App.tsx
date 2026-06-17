import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import ChatDrawer from './components/ChatDrawer';
import { useAuth } from './auth/useAuth';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import AdminPendingUsersPage from './pages/admin/AdminPendingUsersPage';
import TicketListPage from './pages/tickets/TicketListPage';
import NewTicketPage from './pages/tickets/NewTicketPage';
import TicketDetailPage from './pages/tickets/TicketDetailPage';
import AdminTicketQueuePage from './pages/admin/AdminTicketQueuePage';
import AssignTicketPage from './pages/admin/AssignTicketPage';
import DashboardPage from './pages/admin/DashboardPage';
import DeviceRegisterPage from './pages/admin/DeviceRegisterPage';
import DeviceRequestQueuePage from './pages/admin/DeviceRequestQueuePage';
import AgentQueuePage from './pages/agent/AgentQueuePage';
import KBListPage from './pages/kb/KBListPage';
import KBArticlePage from './pages/kb/KBArticlePage';
import KBEditorPage from './pages/kb/KBEditorPage';
import DeviceRequestPage from './pages/devices/DeviceRequestPage';
import MyDeviceRequestsPage from './pages/devices/MyDeviceRequestsPage';
import ManagerApprovalsPage from './pages/manager/ManagerApprovalsPage';
import PurchaseRequestsPage from './pages/admin/PurchaseRequestsPage';
import ProcurementPipelinePage from './pages/admin/ProcurementPipelinePage';
import FinancePurchaseRequestsPage from './pages/finance/FinancePurchaseRequestsPage';
import FinanceApprovalsPage from './pages/finance/FinanceApprovalsPage';

const ADMIN_ROLES    = ['IT_ADMIN', 'SYS_ADMIN', 'MANAGER'];
const IT_ADMIN_ROLES = ['IT_ADMIN', 'SYS_ADMIN'];
const AGENT_ROLES    = ['AGENT', 'L2_L3', 'IT_ADMIN', 'SYS_ADMIN', 'MANAGER'];
const MANAGER_ROLES  = ['MANAGER', 'IT_ADMIN', 'SYS_ADMIN'];
const FINANCE_ROLES  = ['FINANCE'];

export default function App() {
  const { user } = useAuth();
  const isAuthenticated = !!user;

  return (
    <>
      <Routes>
        {/* Public */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Any authenticated user */}
        <Route
          path="/tickets"
          element={<ProtectedRoute><TicketListPage /></ProtectedRoute>}
        />
        <Route
          path="/tickets/new"
          element={<ProtectedRoute><NewTicketPage /></ProtectedRoute>}
        />
        <Route
          path="/tickets/:id"
          element={<ProtectedRoute><TicketDetailPage /></ProtectedRoute>}
        />

        {/* IT_ADMIN / SYS_ADMIN only — pending user approvals */}
        <Route
          path="/admin/pending-users"
          element={
            <ProtectedRoute roles={IT_ADMIN_ROLES}>
              <AdminPendingUsersPage />
            </ProtectedRoute>
          }
        />

        {/* IT_ADMIN / SYS_ADMIN / MANAGER only */}
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute roles={ADMIN_ROLES}>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/tickets"
          element={
            <ProtectedRoute roles={ADMIN_ROLES}>
              <AdminTicketQueuePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/assign/:id"
          element={
            <ProtectedRoute roles={ADMIN_ROLES}>
              <AssignTicketPage />
            </ProtectedRoute>
          }
        />

        {/* Agent / L2-L3 / Admin */}
        <Route
          path="/agent/tickets"
          element={
            <ProtectedRoute roles={AGENT_ROLES}>
              <AgentQueuePage />
            </ProtectedRoute>
          }
        />

        {/* Knowledge Base — any authenticated user can read; editors can create/edit */}
        <Route path="/kb" element={<ProtectedRoute><KBListPage /></ProtectedRoute>} />
        {/* /kb/new must come before /kb/:id */}
        <Route
          path="/kb/new"
          element={
            <ProtectedRoute roles={[...AGENT_ROLES]}>
              <KBEditorPage />
            </ProtectedRoute>
          }
        />
        <Route path="/kb/:id" element={<ProtectedRoute><KBArticlePage /></ProtectedRoute>} />
        <Route
          path="/kb/:id/edit"
          element={
            <ProtectedRoute roles={[...AGENT_ROLES]}>
              <KBEditorPage />
            </ProtectedRoute>
          }
        />

        {/* Employee device requests */}
        <Route
          path="/devices/request"
          element={<ProtectedRoute><DeviceRequestPage /></ProtectedRoute>}
        />
        <Route
          path="/devices/my-requests"
          element={<ProtectedRoute><MyDeviceRequestsPage /></ProtectedRoute>}
        />

        {/* IT Admin device management */}
        <Route
          path="/admin/devices"
          element={
            <ProtectedRoute roles={IT_ADMIN_ROLES}>
              <DeviceRegisterPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/device-requests"
          element={
            <ProtectedRoute roles={IT_ADMIN_ROLES}>
              <DeviceRequestQueuePage />
            </ProtectedRoute>
          }
        />

        {/* Manager approvals */}
        <Route
          path="/manager/approvals"
          element={
            <ProtectedRoute roles={MANAGER_ROLES}>
              <ManagerApprovalsPage />
            </ProtectedRoute>
          }
        />

        {/* IT Admin purchase requests (legacy) */}
        <Route
          path="/admin/purchase-requests"
          element={
            <ProtectedRoute roles={IT_ADMIN_ROLES}>
              <PurchaseRequestsPage />
            </ProtectedRoute>
          }
        />

        {/* IT Admin procurement pipeline */}
        <Route
          path="/admin/procurement"
          element={
            <ProtectedRoute roles={IT_ADMIN_ROLES}>
              <ProcurementPipelinePage />
            </ProtectedRoute>
          }
        />

        {/* Finance approval queue (legacy) */}
        <Route
          path="/finance/purchase-requests"
          element={
            <ProtectedRoute roles={FINANCE_ROLES}>
              <FinancePurchaseRequestsPage />
            </ProtectedRoute>
          }
        />

        {/* Finance approvals */}
        <Route
          path="/finance/approvals"
          element={
            <ProtectedRoute roles={FINANCE_ROLES}>
              <FinanceApprovalsPage />
            </ProtectedRoute>
          }
        />

        {/* Catch-all → tickets (ProtectedRoute handles redirect to /login if unauthed) */}
        <Route path="*" element={<Navigate to="/tickets" replace />} />
      </Routes>

      {/* Chat drawer — mounted outside Routes so state persists across navigation */}
      {isAuthenticated && <ChatDrawer />}
    </>
  );
}
