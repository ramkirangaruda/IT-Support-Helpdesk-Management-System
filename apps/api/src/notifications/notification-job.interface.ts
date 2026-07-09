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

// Optional context for building rich email bodies.
// All fields are strings (safe for JSON job payload).
export interface EmailMeta {
  toName?: string;
  // Auth events
  role?: string;
  reason?: string;
  applicantName?: string;
  applicantEmail?: string;
  tempPassword?: string;
  // Status-change context
  oldStatus?: string;
  newStatus?: string;
  actorName?: string;
  // Comment event
  commentPreview?: string;
  // SLA warning
  slaRemainingMinutes?: number;
  // Device events
  deviceType?: string;
  deviceCount?: string;
  maxDevices?: string;
  reminderCycle?: string;
  // Procurement events
  prId?: string;
  itemSpec?: string;
}

// Shape of each job pushed onto NOTIFICATION_EMAIL_QUEUE.
export interface EmailJobPayload {
  notificationId: string;
  to: string;
  event: string;
  // Present for ticket.* events so the processor can fetch full ticket data
  ticketId?: string;
  recipientRole?: RecipientRole;
  meta?: EmailMeta;
}
