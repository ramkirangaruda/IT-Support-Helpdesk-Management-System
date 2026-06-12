import { BadRequestException, Injectable } from '@nestjs/common';
import { TicketStatus } from '@prisma/client';

const ALLOWED: Record<TicketStatus, TicketStatus[]> = {
  [TicketStatus.NEW]:         [TicketStatus.ASSIGNED, TicketStatus.CANCELLED],
  [TicketStatus.ASSIGNED]:    [TicketStatus.IN_PROGRESS, TicketStatus.ON_HOLD, TicketStatus.CANCELLED],
  [TicketStatus.IN_PROGRESS]: [TicketStatus.ON_HOLD, TicketStatus.RESOLVED, TicketStatus.ESCALATED, TicketStatus.CANCELLED],
  [TicketStatus.ON_HOLD]:     [TicketStatus.IN_PROGRESS, TicketStatus.CANCELLED],
  [TicketStatus.ESCALATED]:   [TicketStatus.IN_PROGRESS, TicketStatus.ASSIGNED, TicketStatus.RESOLVED, TicketStatus.CANCELLED],
  [TicketStatus.RESOLVED]:    [TicketStatus.CLOSED, TicketStatus.REOPENED],
  [TicketStatus.REOPENED]:    [TicketStatus.ASSIGNED, TicketStatus.IN_PROGRESS],
  [TicketStatus.CLOSED]:      [],
  [TicketStatus.CANCELLED]:   [],
};

@Injectable()
export class TicketStateMachineService {
  assertTransition(from: TicketStatus, to: TicketStatus): void {
    const allowed = ALLOWED[from];
    if (!allowed.includes(to)) {
      throw new BadRequestException(
        `Invalid transition: ${from} → ${to}. Allowed: [${allowed.join(', ') || 'none — terminal state'}]`,
      );
    }
  }

  allowedFrom(status: TicketStatus): TicketStatus[] {
    return ALLOWED[status];
  }

  isTerminal(status: TicketStatus): boolean {
    return ALLOWED[status].length === 0;
  }
}
