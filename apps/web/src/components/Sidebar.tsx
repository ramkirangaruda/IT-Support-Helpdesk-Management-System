import { useEffect, useRef, useState } from 'react';
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
  ExternalLink,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/useAuth';
import api from '../api/api';

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
  sectionRoles?: string[];
  items: NavItem[];
}

interface NotificationRecord {
  id:             string;
  event:          string;
  recipientEmail: string;
  status:         string;
  createdAt:      string;
  ticket:         { id: string; subject: string } | null;
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
      { label: 'My Tickets',    to: '/tickets',        icon: <Ticket size={18} />,        exact: true },
      { label: 'My Queue',      to: '/agent/tickets',  icon: <ListTodo size={18} />,      roles: ['AGENT', 'L2_L3', 'IT_ADMIN', 'SYS_ADMIN'] },
      { label: 'Triage Queue',  to: '/admin/tickets',  icon: <ClipboardList size={18} />, roles: ['IT_ADMIN', 'SYS_ADMIN', 'MANAGER'] },
      { label: 'New Ticket',    to: '/tickets/new',    icon: <Plus size={18} /> },
    ],
  },
  {
    title: 'DEVICES',
    items: [
      { label: 'My Devices',       to: '/devices/my-requests',   icon: <Monitor size={18} /> },
      { label: 'Request Device',   to: '/devices/request',       icon: <Package size={18} /> },
      { label: 'Device Register',  to: '/admin/devices',         icon: <Server size={18} />,        roles: ['IT_ADMIN', 'SYS_ADMIN'] },
      { label: 'Device Requests',  to: '/admin/device-requests', icon: <ClipboardList size={18} />, roles: ['IT_ADMIN', 'SYS_ADMIN'] },
      { label: 'Approvals',        to: '/manager/approvals',     icon: <CheckSquare size={18} />,   roles: ['MANAGER', 'IT_ADMIN', 'SYS_ADMIN'] },
    ],
  },
  {
    title: 'PROCUREMENT',
    sectionRoles: ['IT_ADMIN', 'SYS_ADMIN', 'FINANCE'],
    items: [
      { label: 'Pipeline',          to: '/admin/procurement',  icon: <ShoppingCart size={18} />, roles: ['IT_ADMIN', 'SYS_ADMIN'] },
      { label: 'Finance Approvals', to: '/finance/approvals',  icon: <CreditCard size={18} />,   roles: ['FINANCE'] },
    ],
  },
  {
    title: 'KNOWLEDGE BASE',
    items: [
      { label: 'Browse Articles', to: '/kb',     icon: <BookOpen size={18} />, exact: true },
      { label: 'Manage Articles', to: '/kb/new', icon: <PenLine size={18} />,  roles: ['AGENT', 'L2_L3', 'IT_ADMIN', 'SYS_ADMIN'] },
    ],
  },
  {
    title: 'ADMINISTRATION',
    sectionRoles: ['IT_ADMIN', 'SYS_ADMIN'],
    items: [
      { label: 'Pending Users',    to: '/admin/pending-users',  icon: <Users size={18} /> },
      { label: 'Reports',          to: '/dashboard',            icon: <BarChart2 size={18} />, exact: true },
      { label: 'Notification Log', to: '/admin/notifications',  icon: <Bell size={18} /> },
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

// ── Event label map ───────────────────────────────────────────────────────────

function eventLabel(event: string): string {
  const map: Record<string, string> = {
    'ticket.created':              'New ticket submitted',
    'ticket.assigned':             'Ticket assigned to you',
    'ticket.status_changed':       'Ticket status updated',
    'ticket.comment_added':        'New comment on your ticket',
    'ticket.sla_warning':          'SLA deadline approaching',
    'ticket.escalated':            'Ticket escalated',
    'ticket.resolved':             'Ticket resolved',
    'ticket.closed':               'Ticket closed',
    'ticket.reopened':             'Ticket reopened',
    'auth.account_approved':       'Your account has been approved',
    'auth.account_rejected':       'Account registration not approved',
    'auth.registration_pending':   'New account pending approval',
    'auth.registration_confirmation': 'Registration received — pending approval',
    'device.request.approved':     'Device request approved',
    'device.request.rejected':     'Device request rejected',
    'device.request.pending_fulfilment': 'Device request needs fulfilment',
    'device.purchased_available':  'Your requested device is available',
    'purchase.request.pending_manager': 'Purchase request needs your approval',
    'purchase.request.pending_finance': 'Purchase request needs finance approval',
    'purchase.request.finance_approved': 'PR finance-approved — raise PO',
    'purchase.request.rejected':   'Purchase request rejected',
    'purchase.request.auto_created': 'Auto-created purchase request needs review',
  };
  if (map[event]) return map[event];
  if (event.startsWith('device.reminder')) return 'Device return reminder';
  return event;
}

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

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ── Notification bell ─────────────────────────────────────────────────────────

function NotificationBell({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: notifications = [] } = useQuery<NotificationRecord[]>({
    queryKey: ['notifications-me'],
    queryFn: () => api.get<NotificationRecord[]>('/notifications/me?limit=15').then(r => r.data),
    refetchInterval: 30_000,
  });

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const count = notifications.length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        title={collapsed ? 'Notifications' : undefined}
        className={`flex items-center rounded-lg text-sm text-gray-500 hover:bg-gray-100
                    hover:text-gray-800 transition-colors w-full relative
                    ${collapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'}`}
      >
        <span className="relative flex-shrink-0">
          <Bell size={16} />
          {count > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5
                             rounded-full bg-indigo-600 text-white text-[9px] font-bold
                             flex items-center justify-center leading-none">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </span>
        {!collapsed && <span className="font-medium truncate">Notifications</span>}
        {!collapsed && count > 0 && (
          <span className="ml-auto text-xs text-indigo-600 font-semibold">{count}</span>
        )}
      </button>

      {/* Tooltip when collapsed */}
      {collapsed && (
        <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap
                         rounded bg-gray-800 px-2 py-1 text-xs text-white opacity-0
                         group-hover:opacity-100 transition-opacity z-50 top-1/2 -translate-y-1/2">
          Notifications
        </span>
      )}

      {/* Dropdown panel */}
      {open && (
        <div className={`absolute z-50 bg-white border border-gray-200 rounded-xl shadow-lg
                         w-80 max-h-96 overflow-y-auto
                         ${collapsed ? 'left-full ml-2 bottom-0' : 'left-0 bottom-full mb-2'}`}>
          <div className="px-4 py-2.5 border-b border-gray-100 flex items-center justify-between">
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Recent Notifications
            </p>
            <span className="text-xs text-gray-400">{count} recent</span>
          </div>
          {notifications.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              No notifications yet
            </div>
          ) : (
            <ul className="divide-y divide-gray-50">
              {notifications.map(n => (
                <li key={n.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-gray-800 leading-snug">
                        {eventLabel(n.event)}
                      </p>
                      {n.ticket && (
                        <NavLink
                          to={`/tickets/${n.ticket.id}`}
                          onClick={() => setOpen(false)}
                          className="flex items-center gap-1 mt-0.5 text-[11px] text-indigo-600
                                     hover:underline truncate"
                        >
                          <ExternalLink size={10} />
                          <span className="truncate">{n.ticket.subject}</span>
                        </NavLink>
                      )}
                      <p className="text-[10px] text-gray-400 mt-0.5">{relativeTime(n.createdAt)}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
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
    if (section.sectionRoles && !canSee(section.sectionRoles)) return null;
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

      {/* ── Notification bell + user info + logout (pinned bottom) ─────── */}
      <div className={`flex-shrink-0 border-t border-gray-100 ${collapsed ? 'py-2 px-1' : 'py-2 px-3'}`}>
        <NotificationBell collapsed={collapsed} />

        {!collapsed && (
          <div className="mt-2 mb-1 px-1">
            <p className="text-xs font-semibold text-gray-800 truncate">{user?.email}</p>
            <p className="text-[10px] text-gray-400 truncate mt-0.5">{roleLabel}</p>
          </div>
        )}

        <button
          onClick={handleLogout}
          title={collapsed ? 'Logout' : undefined}
          className={`flex items-center rounded-lg text-sm text-gray-500
                       hover:bg-red-50 hover:text-red-600 transition-colors w-full
                       ${collapsed ? 'justify-center p-2.5 mt-1' : 'gap-2.5 px-3 py-2'}`}
        >
          <LogOut size={16} />
          {!collapsed && <span className="font-medium">Logout</span>}
        </button>
      </div>
    </aside>
  );
}
