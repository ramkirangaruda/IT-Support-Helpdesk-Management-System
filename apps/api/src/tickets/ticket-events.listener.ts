import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { NotificationsService } from '../notifications/notifications.service';
import { TICKET_COMMENT_ADDED, TicketCommentAddedEvent } from './ticket-events';

@Injectable()
export class TicketEventsListener {
  private readonly logger = new Logger(TicketEventsListener.name);

  constructor(private readonly notifications: NotificationsService) {}

  @OnEvent(TICKET_COMMENT_ADDED)
  onCommentAdded(event: TicketCommentAddedEvent): void {
    if (event.isInternal) return;

    // Fire-and-forget: emit() is async but we don't await inside a sync handler.
    // Errors are caught and logged inside NotificationsService.emit().
    this.notifications
      .emit('ticket.comment_added', event.ticketId, {
        commentBody: event.commentBody,
        actorEmail:  event.authorEmail,
      })
      .catch((err: Error) =>
        this.logger.error(`Failed to emit comment notification for ${event.ticketId}: ${err.message}`),
      );
  }
}
