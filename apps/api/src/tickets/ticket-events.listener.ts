import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TICKET_COMMENT_ADDED, TicketCommentAddedEvent } from './ticket-events';

@Injectable()
export class TicketEventsListener {
  private readonly logger = new Logger(TicketEventsListener.name);

  @OnEvent(TICKET_COMMENT_ADDED)
  onCommentAdded(event: TicketCommentAddedEvent): void {
    if (event.isInternal) return;
    this.logger.log(
      `[notify] ticket.comment.added → ${event.requesterEmail} | ticket=${event.ticketId}`,
    );
    // TODO Phase 2: replace with NotificationsService.enqueue for email delivery
  }
}
