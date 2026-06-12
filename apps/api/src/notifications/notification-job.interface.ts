export type NotificationEvent =
  | 'ticket.created'
  | 'ticket.assigned'
  | 'ticket.status_changed'
  | 'ticket.comment_added'
  | 'ticket.sla_warning'
  | 'ticket.escalated';

export interface NotificationJob {
  event: NotificationEvent;
  ticketId: string;
  ticketSubject: string;
  ticketStatus?: string;
  actorName?: string;
  commentBody?: string;
  slaRemainingMinutes?: number;
  requesterEmail: string;
  requesterName: string;
  assigneeEmail?: string | null;
  assigneeName?: string | null;
}
