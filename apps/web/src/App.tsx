import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/useAuth';
import Sidebar from './components/Sidebar';
import ChatDrawer from './components/ChatDrawer';
import ProtectedRoute from './components/ProtectedRoute';

import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/admin/DashboardPage';
import TicketListPage from './pages/tickets/TicketListPage';
import NewTicketPage from './pages/tickets/NewTicketPage';
import TicketDetailPage from './pages/tickets/TicketDetailPage';
import AdminTicketQueuePage from './pages/admin/AdminTicketQueuePage';
import AssignTicketPage from './pages/admin/AssignTicketPage';
import AgentQueuePage from './pages/agent/AgentQueuePage';
import KBListPage from './pages/kb/KBListPage';
import KBArticlePage from './pages/kb/KBArticlePage';
import KBEditorPage from './pages/kb/KBEditorPage';
import DeviceRequestPage from './pages/devices/DeviceRequestPage';
import MyDeviceRequestsPage from './pages/devices/MyDeviceRequestsPage';
import DeviceRegisterPage from './pages/admin/DeviceRegisterPage';
import DeviceRequestQueuePage from './pages/admin/DeviceRequestQueuePage';
import ManagerApprovalsPage from './pages/manager/ManagerApprovalsPage';
import PurchaseRequestsPage from './pages/admin/PurchaseRequestsPage';
import ProcurementPipelinePage from './pages/admin/ProcurementPipelinePage';
import FinancePurchaseRequestsPage from './pages/finance/FinancePurchaseRequestsPage';
import FinanceApprovalsPage from './pages/finance/FinanceApprovalsPage';
import AdminPendingUsersPage from './pages/admin/AdminPendingUsersPage';
import AdminNotificationsPage from './pages/admin/AdminNotificationsPage';

const IT_ADMIN_ROLES = ['IT_ADMIN', 'SYS_ADMIN'];
const AGENT_ROLES    = ['AGENT', 'L2_L3', 'IT_ADMIN', 'SYS_ADMIN', 'MANAGER'];
const ADMIN_ROLES    = ['IT_ADMIN', 'SYS_ADMIN', 'MANAGER'];
const MANAGER_ROLES  = ['MANAGER', 'IT_ADMIN', 'SYS_ADMIN'];
const FINANCE_ROLES  = ['FINANCE'];

export default function App() {
  const { user } = useAuth();
  const isAuthenticated = !!user;

  return (
    // Authenticated users get sidebar + scrollable content pane.
    // Unauthenticated pages (login, register) render full-screen without sidebar.
    <div className={isAuthenticated ? 'flex h-screen overflow-hidden bg-gray-50' : ''}>
      {isAuthenticated && <Sidebar />}

      <div className={isAuthenticated ? 'flex-1 overflow-y-auto' : 'w-full'}>
        <Routes>
          {/* ── Public ──────────────────────────────────────────────────── */}
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* ── Universal landing — dashboard for all roles ──────────────── */}
          <Route
            path="/dashboard"
            element={<ProtectedRoute><DashboardPage /></ProtectedRoute>}
          />

          {/* ── Tickets ─────────────────────────────────────────────────── */}
          <Route path="/tickets"     element={<ProtectedRoute><TicketListPage /></ProtectedRoute>} />
          <Route path="/tickets/new" element={<ProtectedRoute><NewTicketPage /></ProtectedRoute>} />
          <Route path="/tickets/:id" element={<ProtectedRoute><TicketDetailPage /></ProtectedRoute>} />

          {/* ── Admin ticket management ──────────────────────────────────── */}
          <Route
            path="/admin/tickets"
            element={<ProtectedRoute roles={ADMIN_ROLES}><AdminTicketQueuePage /></ProtectedRoute>}
          />
          <Route
            path="/admin/assign/:id"
            element={<ProtectedRoute roles={ADMIN_ROLES}><AssignTicketPage /></ProtectedRoute>}
          />

          {/* ── Agent queue ──────────────────────────────────────────────── */}
          <Route
            path="/agent/tickets"
            element={<ProtectedRoute roles={AGENT_ROLES}><AgentQueuePage /></ProtectedRoute>}
          />

          {/* ── Knowledge Base ───────────────────────────────────────────── */}
          <Route path="/kb"         element={<ProtectedRoute><KBListPage /></ProtectedRoute>} />
          <Route path="/kb/new"     element={<ProtectedRoute roles={[...AGENT_ROLES]}><KBEditorPage /></ProtectedRoute>} />
          <Route path="/kb/:id"     element={<ProtectedRoute><KBArticlePage /></ProtectedRoute>} />
          <Route path="/kb/:id/edit" element={<ProtectedRoute roles={[...AGENT_ROLES]}><KBEditorPage /></ProtectedRoute>} />

          {/* ── Devices ─────────────────────────────────────────────────── */}
          <Route path="/devices/request"     element={<ProtectedRoute><DeviceRequestPage /></ProtectedRoute>} />
          <Route path="/devices/my-requests" element={<ProtectedRoute><MyDeviceRequestsPage /></ProtectedRoute>} />
          <Route
            path="/admin/devices"
            element={<ProtectedRoute roles={IT_ADMIN_ROLES}><DeviceRegisterPage /></ProtectedRoute>}
          />
          <Route
            path="/admin/device-requests"
            element={<ProtectedRoute roles={IT_ADMIN_ROLES}><DeviceRequestQueuePage /></ProtectedRoute>}
          />

          {/* ── Manager approvals ────────────────────────────────────────── */}
          <Route
            path="/manager/approvals"
            element={<ProtectedRoute roles={MANAGER_ROLES}><ManagerApprovalsPage /></ProtectedRoute>}
          />

          {/* ── Procurement ─────────────────────────────────────────────── */}
          <Route
            path="/admin/purchase-requests"
            element={<ProtectedRoute roles={IT_ADMIN_ROLES}><PurchaseRequestsPage /></ProtectedRoute>}
          />
          <Route
            path="/admin/procurement"
            element={<ProtectedRoute roles={IT_ADMIN_ROLES}><ProcurementPipelinePage /></ProtectedRoute>}
          />
          <Route
            path="/finance/purchase-requests"
            element={<ProtectedRoute roles={FINANCE_ROLES}><FinancePurchaseRequestsPage /></ProtectedRoute>}
          />
          <Route
            path="/finance/approvals"
            element={<ProtectedRoute roles={FINANCE_ROLES}><FinanceApprovalsPage /></ProtectedRoute>}
          />

          {/* ── Administration ───────────────────────────────────────────── */}
          <Route
            path="/admin/pending-users"
            element={<ProtectedRoute roles={IT_ADMIN_ROLES}><AdminPendingUsersPage /></ProtectedRoute>}
          />
          <Route
            path="/admin/notifications"
            element={<ProtectedRoute roles={IT_ADMIN_ROLES}><AdminNotificationsPage /></ProtectedRoute>}
          />

          {/* ── Root + catch-all ─────────────────────────────────────────── */}
          <Route
            path="/"
            element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />}
          />
          <Route
            path="*"
            element={<Navigate to={isAuthenticated ? '/dashboard' : '/login'} replace />}
          />
        </Routes>

        {/* Chat widget — floats bottom-right, unchanged */}
        {isAuthenticated && <ChatDrawer />}
      </div>
    </div>
  );
}
