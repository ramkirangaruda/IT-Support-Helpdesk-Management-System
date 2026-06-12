// All event types that trigger email notifications (Section 5.7.1)
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

// Distinguishes which audience receives the notification so templates can
// vary content for the same event (e.g. ticket.created goes to both the
// employee and IT_ADMIN, each with different copy).
export type RecipientRole = 'requester' | 'assignee' | 'admin' | 'manager';

export interface NotificationJob {
  // Links back to the persisted Notification row for status updates
  notificationId:       string;

  event:                NotificationEvent;
  ticketId:             string;
  ticketSubject:        string;
  ticketStatus?:        string;

  // Single target recipient for this job
  recipientEmail:       string;
  recipientName:        string;
  recipientRole:        RecipientRole;

  // Template context
  requesterName:        string;
  assigneeName?:        string | null;
  actorName?:           string;
  commentBody?:         string;
  slaRemainingMinutes?: number;
}
