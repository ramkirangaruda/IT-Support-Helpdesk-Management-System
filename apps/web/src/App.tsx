import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/useAuth';
import Sidebar from './components/Sidebar';
import ChatDrawer from './components/ChatDrawer';
import ProtectedRoute from './components/ProtectedRoute';

// Auth entry points are eager (needed for first paint); everything else is route
// code-split so the initial bundle stays small and heavy deps (e.g. recharts on the
// dashboard) load only when their route is visited.
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

const DashboardPage             = lazy(() => import('./pages/admin/DashboardPage'));
const TicketListPage            = lazy(() => import('./pages/tickets/TicketListPage'));
const NewTicketPage             = lazy(() => import('./pages/tickets/NewTicketPage'));
const TicketDetailPage          = lazy(() => import('./pages/tickets/TicketDetailPage'));
const AdminTicketQueuePage      = lazy(() => import('./pages/admin/AdminTicketQueuePage'));
const AssignTicketPage          = lazy(() => import('./pages/admin/AssignTicketPage'));
const AgentQueuePage            = lazy(() => import('./pages/agent/AgentQueuePage'));
const KBListPage                = lazy(() => import('./pages/kb/KBListPage'));
const KBArticlePage             = lazy(() => import('./pages/kb/KBArticlePage'));
const KBEditorPage              = lazy(() => import('./pages/kb/KBEditorPage'));
const DeviceRequestPage         = lazy(() => import('./pages/devices/DeviceRequestPage'));
const MyDeviceRequestsPage      = lazy(() => import('./pages/devices/MyDeviceRequestsPage'));
const DeviceRegisterPage        = lazy(() => import('./pages/admin/DeviceRegisterPage'));
const DeviceRequestQueuePage    = lazy(() => import('./pages/admin/DeviceRequestQueuePage'));
const ManagerApprovalsPage      = lazy(() => import('./pages/manager/ManagerApprovalsPage'));
const PurchaseRequestsPage      = lazy(() => import('./pages/admin/PurchaseRequestsPage'));
const ProcurementPipelinePage   = lazy(() => import('./pages/admin/ProcurementPipelinePage'));
const FinancePurchaseRequestsPage = lazy(() => import('./pages/finance/FinancePurchaseRequestsPage'));
const FinanceApprovalsPage      = lazy(() => import('./pages/finance/FinanceApprovalsPage'));
const AdminPendingUsersPage     = lazy(() => import('./pages/admin/AdminPendingUsersPage'));
const AdminNotificationsPage    = lazy(() => import('./pages/admin/AdminNotificationsPage'));

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
        <Suspense fallback={<div className="p-8 text-sm text-gray-400">Loading…</div>}>
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
        </Suspense>

        {/* Chat widget — floats bottom-right, unchanged */}
        {isAuthenticated && <ChatDrawer />}
      </div>
    </div>
  );
}
