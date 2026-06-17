// All event types that trigger in-app notifications
export type NotificationEvent =
  | 'ticket.created'
  | 'ticket.assigned'
  | 'ticket.status_changed'
  | 'ticket.comment_added'
  | 'ticket.sla_warning'
  | 'ticket.escalated'
  | 'ticket.resolved'
  | 'ticket.closed'
  | 'ticket.reopened';

// Distinguishes which audience receives the notification so display logic
// can vary content for the same event.
export type RecipientRole = 'requester' | 'assignee' | 'admin' | 'manager';
