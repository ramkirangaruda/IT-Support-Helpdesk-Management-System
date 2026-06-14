export interface SlaFields {
  slaResolutionDue: string | null;
  slaPausedMs: number;
  pausedAt: string | null;
  createdAt: string;
}

/** Returns 0–100 (% of SLA window remaining), or null if no SLA set. <0 = breached. */
export function computeSlaPercent(ticket: SlaFields): number | null {
  if (!ticket.slaResolutionDue) return null;
  const now = Date.now();
  const created = new Date(ticket.createdAt).getTime();
  const due = new Date(ticket.slaResolutionDue).getTime();
  const totalMs = due - created;
  if (totalMs <= 0) return null;
  const currentPauseMs = ticket.pausedAt
    ? now - new Date(ticket.pausedAt).getTime()
    : 0;
  const effectiveDue = due + (ticket.slaPausedMs ?? 0) + currentPauseMs;
  const remainingMs = effectiveDue - now;
  return Math.min(100, (remainingMs / totalMs) * 100);
}

export function slaColor(pct: number | null): 'green' | 'yellow' | 'red' | 'none' {
  if (pct === null) return 'none';
  if (pct > 50) return 'green';
  if (pct > 25) return 'yellow';
  return 'red';
}

export function formatSlaRemaining(iso: string | null): string {
  if (!iso) return '—';
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return 'Breached';
  const hrs = Math.floor(diff / 3_600_000);
  if (hrs < 24) return `${hrs}h left`;
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) +
    ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}
