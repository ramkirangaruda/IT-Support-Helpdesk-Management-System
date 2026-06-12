import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import LoginPage from './pages/LoginPage';
import TicketListPage from './pages/tickets/TicketListPage';
import NewTicketPage from './pages/tickets/NewTicketPage';
import TicketDetailPage from './pages/tickets/TicketDetailPage';
import AdminTicketQueuePage from './pages/admin/AdminTicketQueuePage';
import AssignTicketPage from './pages/admin/AssignTicketPage';
import AgentQueuePage from './pages/agent/AgentQueuePage';

const ADMIN_ROLES  = ['IT_ADMIN', 'SYS_ADMIN'];
const AGENT_ROLES  = ['AGENT', 'L2_L3', 'IT_ADMIN', 'SYS_ADMIN'];

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<LoginPage />} />

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

      {/* IT_ADMIN / SYS_ADMIN only */}
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

      {/* Catch-all → tickets (ProtectedRoute handles redirect to /login if unauthed) */}
      <Route path="*" element={<Navigate to="/tickets" replace />} />
    </Routes>
  );
}
