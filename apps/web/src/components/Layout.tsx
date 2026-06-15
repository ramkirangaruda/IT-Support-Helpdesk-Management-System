import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';

const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE:  'Employee',
  AGENT:     'Agent',
  L2_L3:     'L2/L3 Engineer',
  IT_ADMIN:  'IT Admin',
  SYS_ADMIN: 'System Admin',
  MANAGER:   'Manager',
  FINANCE:   'Finance',
};

function navClass({ isActive }: { isActive: boolean }) {
  return isActive
    ? 'px-3 py-2 rounded-md text-sm font-medium bg-indigo-700 text-white'
    : 'px-3 py-2 rounded-md text-sm font-medium text-indigo-100 hover:bg-indigo-600 hover:text-white';
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const isAdmin   = user?.roles.some(r => ['IT_ADMIN', 'SYS_ADMIN', 'MANAGER'].includes(r));
  const isItAdmin = user?.roles.some(r => ['IT_ADMIN', 'SYS_ADMIN'].includes(r));
  const isManager = user?.roles.some(r => ['MANAGER', 'IT_ADMIN', 'SYS_ADMIN'].includes(r));
  const isFinance = user?.roles.some(r => r === 'FINANCE');
  const isAgent   = user?.roles.some(r => ['AGENT', 'L2_L3', 'IT_ADMIN', 'SYS_ADMIN', 'MANAGER'].includes(r));
  const roleLabel = user?.roles.map(r => ROLE_LABELS[r] ?? r).join(', ');

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top nav */}
      <nav className="bg-indigo-600 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14">
            {/* Brand */}
            <Link to="/tickets" className="flex items-center gap-2">
              <span className="text-white font-bold text-lg tracking-tight">TicketZilla</span>
              <span className="text-indigo-300 text-xs font-medium hidden sm:block">IT Help Desk</span>
            </Link>

            {/* Nav links */}
            <div className="flex items-center gap-1">
              <NavLink to="/tickets" end className={navClass}>
                My Tickets
              </NavLink>
              <NavLink to="/devices/my-requests" className={navClass}>
                My Devices
              </NavLink>
              {isAgent && (
                <NavLink to="/agent/tickets" className={navClass}>
                  Agent Queue
                </NavLink>
              )}
              {isManager && (
                <NavLink to="/manager/approvals" className={navClass}>
                  Approvals
                </NavLink>
              )}
              {isAdmin && (
                <>
                  <NavLink to="/admin/dashboard" className={navClass}>
                    Dashboard
                  </NavLink>
                  <NavLink to="/admin/tickets" className={navClass}>
                    Admin Queue
                  </NavLink>
                </>
              )}
              {isItAdmin && (
                <>
                  <NavLink to="/admin/devices" className={navClass}>
                    Devices
                  </NavLink>
                  <NavLink to="/admin/device-requests" className={navClass}>
                    Device Requests
                  </NavLink>
                  <NavLink to="/admin/purchase-requests" className={navClass}>
                    Procurement
                  </NavLink>
                </>
              )}
              {isFinance && (
                <NavLink to="/finance/purchase-requests" className={navClass}>
                  Finance Queue
                </NavLink>
              )}
              <NavLink to="/kb" className={navClass}>
                Knowledge Base
              </NavLink>
            </div>

            {/* User info + logout */}
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <p className="text-white text-sm font-medium leading-tight">{user?.email}</p>
                <p className="text-indigo-200 text-xs leading-tight">{roleLabel}</p>
              </div>
              <button
                onClick={handleLogout}
                className="px-3 py-1.5 text-sm text-indigo-100 border border-indigo-400
                           rounded-md hover:bg-indigo-700 hover:text-white transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Page content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>
    </div>
  );
}
