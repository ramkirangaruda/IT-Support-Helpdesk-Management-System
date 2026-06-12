import { TicketStatus } from '@prisma/client';
import { TicketStateMachineService } from './ticket-state-machine.service';

// canTransition is a pure function — no DB calls, so we can pass nulls for deps.
const svc = new TicketStateMachineService(null as any, null as any);

// ── helpers ───────────────────────────────────────────────────────────────────
const S = TicketStatus;
const ALL_STATUSES = Object.values(S);

function allowed(from: TicketStatus, ...to: TicketStatus[]) {
  describe(`from ${from}`, () => {
    const allowed = new Set(to);
    for (const target of ALL_STATUSES) {
      if (allowed.has(target)) {
        it(`→ ${target} is allowed`, () => {
          expect(svc.canTransition(from, target)).toBe(true);
        });
      } else {
        it(`→ ${target} is blocked`, () => {
          expect(svc.canTransition(from, target)).toBe(false);
        });
      }
    }
  });
}

// ── Section 4.4 transition matrix ────────────────────────────────────────────
describe('TicketStateMachineService.canTransition — Section 4.4', () => {
  allowed(S.NEW,         S.ASSIGNED, S.CANCELLED);
  allowed(S.ASSIGNED,    S.IN_PROGRESS, S.ON_HOLD, S.ESCALATED, S.CANCELLED);
  allowed(S.IN_PROGRESS, S.ON_HOLD, S.RESOLVED, S.ESCALATED, S.CANCELLED);
  allowed(S.ON_HOLD,     S.IN_PROGRESS, S.RESOLVED, S.ESCALATED, S.CANCELLED);
  allowed(S.ESCALATED,   S.IN_PROGRESS, S.ON_HOLD, S.RESOLVED);
  allowed(S.RESOLVED,    S.CLOSED, S.REOPENED);
  allowed(S.REOPENED,    S.IN_PROGRESS, S.ASSIGNED, S.ESCALATED);
  allowed(S.CLOSED,      S.REOPENED);
  allowed(S.CANCELLED    /* no targets — terminal */);
});

// ── isTerminal ────────────────────────────────────────────────────────────────
describe('TicketStateMachineService.isTerminal', () => {
  it('CANCELLED is terminal', () => expect(svc.isTerminal(S.CANCELLED)).toBe(true));
  it('CLOSED is terminal (locked for edits even though CLOSED → REOPENED exists)', () =>
    expect(svc.isTerminal(S.CLOSED)).toBe(true));

  const nonTerminal = [S.NEW, S.ASSIGNED, S.IN_PROGRESS, S.ON_HOLD, S.ESCALATED, S.RESOLVED, S.REOPENED];
  for (const status of nonTerminal) {
    it(`${status} is not terminal`, () => expect(svc.isTerminal(status)).toBe(false));
  }
});

// ── allowedFrom ───────────────────────────────────────────────────────────────
describe('TicketStateMachineService.allowedFrom', () => {
  it('returns correct set for NEW', () =>
    expect(svc.allowedFrom(S.NEW)).toEqual([S.ASSIGNED, S.CANCELLED]));

  it('returns correct set for ESCALATED', () =>
    expect(svc.allowedFrom(S.ESCALATED)).toEqual([S.IN_PROGRESS, S.ON_HOLD, S.RESOLVED]));

  it('returns [REOPENED] for CLOSED (not empty)', () =>
    expect(svc.allowedFrom(S.CLOSED)).toEqual([S.REOPENED]));

  it('returns empty array for CANCELLED', () =>
    expect(svc.allowedFrom(S.CANCELLED)).toEqual([]));
});

// ── assertTransition ─────────────────────────────────────────────────────────
describe('TicketStateMachineService.assertTransition', () => {
  it('does not throw for a valid transition', () => {
    expect(() => svc.assertTransition(S.NEW, S.ASSIGNED)).not.toThrow();
  });

  it('throws BadRequestException for an invalid transition', () => {
    expect(() => svc.assertTransition(S.NEW, S.CLOSED)).toThrow(
      'Invalid transition: NEW → CLOSED',
    );
  });

  it('throws BadRequestException when CANCELLED (terminal)', () => {
    expect(() => svc.assertTransition(S.CANCELLED, S.NEW)).toThrow(
      'none — terminal state',
    );
  });
});
