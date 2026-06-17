import { useEffect, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Ticket,
  ListTodo,
  ClipboardList,
  Plus,
  Monitor,
  Package,
  Server,
  CheckSquare,
  ShoppingCart,
  CreditCard,
  BookOpen,
  PenLine,
  Users,
  BarChart2,
  Bell,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../auth/useAuth';

// ── Types ─────────────────────────────────────────────────────────────────────

interface NavItem {
  label: string;
  to: string;
  icon: React.ReactNode;
  roles?: string[];
  exact?: boolean;
}

interface NavSection {
  title: string;
  sectionRoles?: string[]; // hide section entirely if user has none of these
  items: NavItem[];
}

// ── Navigation definition ─────────────────────────────────────────────────────

const NAV: NavSection[] = [
  {
    title: 'DASHBOARD',
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: <LayoutDashboard size={18} />, exact: true },
    ],
  },
  {
    title: 'TICKETS',
    items: [
      { label: 'My Tickets',    to: '/tickets',        icon: <Ticket size={18} />,      exact: true },
      { label: 'My Queue',      to: '/agent/tickets',  icon: <ListTodo size={18} />,    roles: ['AGENT', 'L2_L3', 'IT_ADMIN', 'SYS_ADMIN'] },
      { label: 'Triage Queue',  to: '/admin/tickets',  icon: <ClipboardList size={18} />, roles: ['IT_ADMIN', 'SYS_ADMIN', 'MANAGER'] },
      { label: 'New Ticket',    to: '/tickets/new',    icon: <Plus size={18} /> },
    ],
  },
  {
    title: 'DEVICES',
    items: [
      { label: 'My Devices',       to: '/devices/my-requests',     icon: <Monitor size={18} /> },
      { label: 'Request Device',   to: '/devices/request',         icon: <Package size={18} /> },
      { label: 'Device Register',  to: '/admin/devices',           icon: <Server size={18} />,        roles: ['IT_ADMIN', 'SYS_ADMIN'] },
      { label: 'Device Requests',  to: '/admin/device-requests',   icon: <ClipboardList size={18} />, roles: ['IT_ADMIN', 'SYS_ADMIN'] },
      { label: 'Approvals',        to: '/manager/approvals',       icon: <CheckSquare size={18} />,   roles: ['MANAGER', 'IT_ADMIN', 'SYS_ADMIN'] },
    ],
  },
  {
    title: 'PROCUREMENT',
    sectionRoles: ['IT_ADMIN', 'SYS_ADMIN', 'FINANCE'],
    items: [
      { label: 'Pipeline',          to: '/admin/procurement',   icon: <ShoppingCart size={18} />, roles: ['IT_ADMIN', 'SYS_ADMIN'] },
      { label: 'Finance Approvals', to: '/finance/approvals',  icon: <CreditCard size={18} />,   roles: ['FINANCE'] },
    ],
  },
  {
    title: 'KNOWLEDGE BASE',
    items: [
      { label: 'Browse Articles',  to: '/kb',     icon: <BookOpen size={18} />, exact: true },
      { label: 'Manage Articles',  to: '/kb/new', icon: <PenLine size={18} />,  roles: ['AGENT', 'L2_L3', 'IT_ADMIN', 'SYS_ADMIN'] },
    ],
  },
  {
    title: 'ADMINISTRATION',
    sectionRoles: ['IT_ADMIN', 'SYS_ADMIN'],
    items: [
      { label: 'Pending Users',        to: '/admin/pending-users',    icon: <Users size={18} /> },
      { label: 'Reports',              to: '/dashboard',              icon: <BarChart2 size={18} />, exact: true },
      { label: 'Failed Notifications', to: '/admin/notifications',    icon: <Bell size={18} /> },
    ],
  },
];

// ── Role labels ───────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE:  'Employee',
  AGENT:     'Agent',
  L2_L3:     'L2/L3 Engineer',
  IT_ADMIN:  'IT Admin',
  SYS_ADMIN: 'System Admin',
  MANAGER:   'Manager',
  FINANCE:   'Finance',
};

// ── NavLink classes ───────────────────────────────────────────────────────────

function itemClass(isActive: boolean, collapsed: boolean) {
  const base = `flex items-center rounded-lg transition-colors group relative ${
    collapsed ? 'justify-center px-0 py-2.5 mx-auto w-10 h-10' : 'gap-3 px-3 py-2 w-full'
  }`;
  const state = isActive
    ? 'bg-indigo-50 text-indigo-700'
    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900';
  return `${base} ${state}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window !== 'undefined') {
      if (window.innerWidth < 768) return true;
      return localStorage.getItem('sidebar-collapsed') === 'true';
    }
    return false;
  });

  // Auto-collapse on narrow viewports
  useEffect(() => {
    function onResize() {
      if (window.innerWidth < 768) setCollapsed(true);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function toggle() {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', String(next));
      return next;
    });
  }

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  const userRoles = user?.roles ?? [];

  function canSee(roles?: string[]) {
    if (!roles || roles.length === 0) return true;
    return roles.some(r => userRoles.includes(r));
  }

  const visibleSections = NAV.map(section => {
    // Drop section entirely if user has none of the required section-level roles
    if (section.sectionRoles && !canSee(section.sectionRoles)) return null;
    // Filter items by role
    const items = section.items.filter(item => canSee(item.roles));
    if (items.length === 0) return null;
    return { ...section, items };
  }).filter(Boolean) as NavSection[];

  const roleLabel = userRoles.map(r => ROLE_LABELS[r] ?? r).join(', ');

  return (
    <aside
      className={`flex flex-col flex-shrink-0 h-screen bg-white border-r border-gray-200
                  transition-all duration-200 ease-in-out z-30
                  ${collapsed ? 'w-16' : 'w-60'}`}
    >
      {/* ── Logo + toggle ───────────────────────────────────────────────── */}
      <div className={`flex items-center h-14 border-b border-gray-100 flex-shrink-0
                       ${collapsed ? 'justify-center px-0' : 'justify-between px-4'}`}>
        {!collapsed && (
          <span className="font-bold text-indigo-600 text-base tracking-tight select-none">
            TicketZilla
          </span>
        )}
        <button
          onClick={toggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* ── Nav sections (scrollable) ───────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-0.5">
        {visibleSections.map(section => (
          <div key={section.title} className={collapsed ? 'mb-3' : 'mb-4'}>
            {/* Section header — hidden when collapsed */}
            {!collapsed && (
              <p className="px-3 mb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest select-none">
                {section.title}
              </p>
            )}

            <div className={`space-y-0.5 ${collapsed ? 'flex flex-col items-center px-1' : 'px-2'}`}>
              {section.items.map(item => (
                <NavLink
                  key={item.to + item.label}
                  to={item.to}
                  end={item.exact}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) => itemClass(isActive, collapsed)}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  {!collapsed && (
                    <span className="text-sm font-medium truncate">{item.label}</span>
                  )}
                  {/* Tooltip for collapsed state */}
                  {collapsed && (
                    <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap
                                     rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0
                                     group-hover:opacity-100 transition-opacity z-50">
                      {item.label}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      {/* ── User info + logout (pinned bottom) ─────────────────────────── */}
      <div className={`flex-shrink-0 border-t border-gray-100 ${collapsed ? 'py-3 px-1' : 'py-3 px-3'}`}>
        {!collapsed && (
          <div className="mb-2 px-1">
            <p className="text-xs font-semibold text-gray-800 truncate">{user?.email}</p>
            <p className="text-[10px] text-gray-400 truncate mt-0.5">{roleLabel}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          title={collapsed ? 'Logout' : undefined}
          className={`flex items-center rounded-lg text-sm text-gray-500
                       hover:bg-red-50 hover:text-red-600 transition-colors w-full
                       ${collapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'}`}
        >
          <LogOut size={16} />
          {!collapsed && <span className="font-medium">Logout</span>}
        </button>
      </div>
    </aside>
  );
}
