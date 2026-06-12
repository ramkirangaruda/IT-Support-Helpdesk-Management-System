export const TICKET_COMMENT_ADDED = 'ticket.comment.added';

export class TicketCommentAddedEvent {
  ticketId: string;
  ticketSubject: string;
  commentBody: string;
  isInternal: boolean;
  authorEmail: string;
  requesterEmail: string;
  requesterName: string;
}
