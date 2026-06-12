// Client-side mirror of apps/api/src/tickets/ticket-state-machine.service.ts Section 4.4
const ALLOWED: Record<string, string[]> = {
  NEW:         ['ASSIGNED', 'CANCELLED'],
  ASSIGNED:    ['IN_PROGRESS', 'ON_HOLD', 'ESCALATED', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'RESOLVED', 'ESCALATED', 'CANCELLED'],
  ON_HOLD:     ['IN_PROGRESS', 'RESOLVED', 'ESCALATED', 'CANCELLED'],
  ESCALATED:   ['IN_PROGRESS', 'ON_HOLD', 'RESOLVED'],
  RESOLVED:    ['CLOSED', 'REOPENED'],
  REOPENED:    ['IN_PROGRESS', 'ASSIGNED', 'ESCALATED'],
  CLOSED:      ['REOPENED'],
  CANCELLED:   [],
};

export function allowedTransitions(status: string): string[] {
  return ALLOWED[status] ?? [];
}

export function isTerminal(status: string): boolean {
  return status === 'CANCELLED' || status === 'CLOSED';
}

export const STATUS_LABEL: Record<string, string> = {
  NEW: 'New',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress',
  ON_HOLD: 'On Hold',
  ESCALATED: 'Escalated',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  CANCELLED: 'Cancelled',
  REOPENED: 'Reopened',
};
