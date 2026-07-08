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
  UserCog,
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
      { label: 'Dashboard', to: '/dashboard', icon: <LayoutDashboard size={16} />, exact: true },
    ],
  },
  {
    title: 'TICKETS',
    items: [
      { label: 'My Tickets',    to: '/tickets',        icon: <Ticket size={16} />,        exact: true },
      { label: 'My Queue',      to: '/agent/tickets',  icon: <ListTodo size={16} />,      roles: ['AGENT', 'L2_L3', 'IT_ADMIN', 'SYS_ADMIN'] },
      { label: 'Triage Queue',  to: '/admin/tickets',  icon: <ClipboardList size={16} />, roles: ['IT_ADMIN', 'SYS_ADMIN', 'MANAGER'] },
      { label: 'New Ticket',    to: '/tickets/new',    icon: <Plus size={16} /> },
    ],
  },
  {
    title: 'DEVICES',
    items: [
      { label: 'My Devices',       to: '/devices/my-requests',   icon: <Monitor size={16} /> },
      { label: 'Request Device',   to: '/devices/request',       icon: <Package size={16} /> },
      { label: 'Device Register',  to: '/admin/devices',         icon: <Server size={16} />,        roles: ['IT_ADMIN', 'SYS_ADMIN'] },
      { label: 'Import Devices',   to: '/admin/devices/import',  icon: <Package size={16} />,       roles: ['IT_ADMIN', 'SYS_ADMIN'] },
      { label: 'Device Requests',  to: '/admin/device-requests', icon: <ClipboardList size={16} />, roles: ['IT_ADMIN', 'SYS_ADMIN'] },
      { label: 'Approvals',        to: '/manager/approvals',     icon: <CheckSquare size={16} />,   roles: ['MANAGER', 'IT_ADMIN', 'SYS_ADMIN'] },
    ],
  },
  {
    title: 'PROCUREMENT',
    sectionRoles: ['IT_ADMIN', 'SYS_ADMIN', 'FINANCE'],
    items: [
      { label: 'Pipeline',          to: '/admin/procurement',  icon: <ShoppingCart size={16} />, roles: ['IT_ADMIN', 'SYS_ADMIN'] },
      { label: 'Finance Approvals', to: '/finance/approvals',  icon: <CreditCard size={16} />,   roles: ['FINANCE'] },
    ],
  },
  {
    title: 'KNOWLEDGE BASE',
    items: [
      { label: 'Browse Articles', to: '/kb',     icon: <BookOpen size={16} />, exact: true },
      { label: 'Manage Articles', to: '/kb/new', icon: <PenLine size={16} />,  roles: ['AGENT', 'L2_L3', 'IT_ADMIN', 'SYS_ADMIN'] },
    ],
  },
  {
    title: 'ADMINISTRATION',
    sectionRoles: ['IT_ADMIN', 'SYS_ADMIN'],
    items: [
      { label: 'Pending Users',    to: '/admin/pending-users',  icon: <Users size={16} /> },
      { label: 'User Management',  to: '/admin/users',          icon: <UserCog size={16} /> },
      { label: 'Reports',          to: '/admin/reports',        icon: <BarChart2 size={16} /> },
      { label: 'Notification Log', to: '/admin/notifications',  icon: <Bell size={16} /> },
    ],
  },
];

// ── Role labels ───────────────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  EMPLOYEE:  'Employee',
  AGENT:     'Support Agent',
  L2_L3:     'L2/L3 Engineer',
  IT_ADMIN:  'IT Administrator',
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

// ── Nav item class ────────────────────────────────────────────────────────────

function itemClass(isActive: boolean, collapsed: boolean) {
  const base = `flex items-center rounded-lg group relative ${
    collapsed ? 'justify-center px-0 py-2.5 mx-auto w-10 h-10' : 'gap-3 px-3 py-2 w-full'
  }`;
  // Active state: accent color text + semibold weight. No background fill.
  const state = isActive
    ? 'text-indigo-600 font-semibold'
    : 'text-ink-muted font-medium hover:bg-black/[0.04] hover:text-ink';
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

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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
        className={`flex items-center rounded-lg text-[13px] font-medium text-ink-muted
                    hover:bg-black/[0.04] hover:text-ink transition-colors w-full relative
                    ${collapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'}`}
      >
        <span className="relative flex-shrink-0">
          <Bell size={15} />
          {count > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-3.5 px-0.5
                             rounded-full bg-indigo-600 text-white text-[9px] font-bold
                             flex items-center justify-center leading-none">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </span>
        {!collapsed && <span className="truncate">Notifications</span>}
        {!collapsed && count > 0 && (
          <span className="ml-auto text-xs text-indigo-600 font-semibold tabular-nums">{count}</span>
        )}
      </button>

      {collapsed && (
        <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap
                         rounded-md bg-ink px-2 py-1 text-xs text-white opacity-0
                         group-hover:opacity-100 transition-opacity z-50 top-1/2 -translate-y-1/2">
          Notifications
        </span>
      )}

      {open && (
        <div className={`absolute z-50 bg-white border border-hair rounded-xl
                         w-80 max-h-96 overflow-y-auto
                         ${collapsed ? 'left-full ml-2 bottom-0' : 'left-0 bottom-full mb-2'}`}>
          <div className="px-4 py-2.5 border-b border-hair flex items-center justify-between">
            <p className="text-[10px] font-semibold text-ink-muted uppercase tracking-[0.08em]">
              Recent
            </p>
            <span className="text-[11px] text-ink-muted tabular-nums">{count} unread</span>
          </div>
          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-ink-muted">
              No notifications yet
            </div>
          ) : (
            <ul className="divide-y divide-[#f2f2f7]">
              {notifications.map(n => (
                <li key={n.id} className="px-4 py-3 hover:bg-[#fafafa] transition-colors">
                  <div className="flex items-start gap-2">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-ink leading-snug">
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
                      <p className="text-[10px] text-ink-muted mt-0.5">{relativeTime(n.createdAt)}</p>
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
  const initials  = (user?.email ?? '?').charAt(0).toUpperCase();

  return (
    <aside
      className={`flex flex-col flex-shrink-0 h-screen bg-white border-r border-hair z-30
                  transition-all duration-200 ease-apple
                  ${collapsed ? 'w-16' : 'w-[240px]'}`}
    >
      {/* ── Logo + toggle ───────────────────────────────────────────────── */}
      <div className={`flex items-center h-14 flex-shrink-0 border-b border-hair
                       ${collapsed ? 'justify-center px-0' : 'justify-between px-4'}`}>
        {!collapsed && (
          <span className="font-semibold text-ink text-[16px] tracking-tight select-none">
            Ticket<span className="text-indigo-600">Zilla</span>
          </span>
        )}
        <button
          onClick={toggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="p-1.5 rounded-md text-ink-muted hover:bg-black/[0.04] hover:text-ink"
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* ── Nav sections (scrollable) ───────────────────────────────────── */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4">
        {visibleSections.map(section => (
          <div key={section.title} className={collapsed ? 'mb-4' : 'mb-5'}>
            {!collapsed && (
              <p className="px-4 mb-1 text-[10px] font-semibold text-ink-muted uppercase
                            tracking-[0.08em] select-none">
                {section.title}
              </p>
            )}
            <div className={`space-y-0.5 ${collapsed ? 'flex flex-col items-center px-1.5' : 'px-2'}`}>
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
                    <span className="text-[13px] truncate">{item.label}</span>
                  )}
                  {collapsed && (
                    <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap
                                     rounded-md bg-ink px-2 py-1 text-xs text-white opacity-0
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

      {/* ── Notification bell + user info + sign out ────────────────────── */}
      <div className={`flex-shrink-0 border-t border-hair ${collapsed ? 'py-2 px-1.5' : 'py-3 px-2'}`}>
        <NotificationBell collapsed={collapsed} />

        {!collapsed && (
          <div className="mt-3 mb-1 flex items-center gap-2.5 px-1">
            <div className="w-7 h-7 rounded-full bg-indigo-50 text-indigo-600 flex items-center
                            justify-center text-xs font-semibold flex-shrink-0 select-none">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold text-ink truncate">{user?.email}</p>
              <p className="text-[11px] text-ink-muted truncate">{roleLabel}</p>
            </div>
          </div>
        )}

        <button
          onClick={handleLogout}
          title={collapsed ? 'Sign out' : undefined}
          className={`flex items-center rounded-lg text-[13px] font-medium text-ink-muted
                       hover:bg-black/[0.04] hover:text-red-500 w-full mt-1
                       ${collapsed ? 'justify-center p-2.5' : 'gap-2.5 px-3 py-2'}`}
        >
          <LogOut size={15} />
          {!collapsed && <span>Sign out</span>}
        </button>
      </div>
    </aside>
  );
}
