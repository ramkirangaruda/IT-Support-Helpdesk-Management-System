import { NotificationJob, RecipientRole } from './notification-job.interface';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

// ── Helpers ───────────────────────────────────────────────────────────────────

function ticketUrl(id: string): string {
  return `${FRONTEND_URL}/tickets/${id}`;
}

function greet(name: string): string {
  return `Hi ${name},`;
}

const FOOTER = `
  <hr style="border:none;border-top:1px solid #e5e7eb;margin-top:24px"/>
  <p style="color:#6b7280;font-size:12px">TicketZilla IT Help Desk — automated notification</p>`;

function layout(accentColor: string, title: string, body: string): string {
  return `
<div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;
            border:1px solid #e5e7eb;border-radius:8px;border-top:4px solid ${accentColor}">
  <h2 style="color:${accentColor};margin-top:0">${title}</h2>
  ${body}
  ${FOOTER}
</div>`;
}

function btn(url: string, label = 'View Ticket'): string {
  return `<p><a href="${url}"
    style="display:inline-block;padding:10px 20px;background:#1d4ed8;
           color:#fff;border-radius:6px;text-decoration:none;font-weight:600"
  >${label}</a></p>`;
}

function ticketBadge(id: string, subject: string): string {
  return `<blockquote style="border-left:4px solid #e5e7eb;padding:8px 16px;
           background:#f9fafb;margin:12px 0;color:#374151">
    <strong>${id}</strong> — ${subject}
  </blockquote>`;
}

// Subject format: [TicketZilla] {description} - {ticketId}
const SUBJECT_PREFIX = '[TicketZilla]';

// ── Subject lines ─────────────────────────────────────────────────────────────

export function renderSubject(job: NotificationJob): string {
  const id = job.ticketId;
  switch (job.event) {
    case 'ticket.created':
      return job.recipientRole === 'admin'
        ? `${SUBJECT_PREFIX} New Ticket Requires Triage - ${id}`
        : `${SUBJECT_PREFIX} Ticket Created - ${id}`;
    case 'ticket.assigned':
      return `${SUBJECT_PREFIX} Ticket Assigned to You - ${id}`;
    case 'ticket.status_changed':
      return `${SUBJECT_PREFIX} Status Updated: ${job.ticketStatus ?? 'changed'} - ${id}`;
    case 'ticket.comment_added':
      return `${SUBJECT_PREFIX} New Comment on Your Ticket - ${id}`;
    case 'ticket.sla_warning':
      return `${SUBJECT_PREFIX} SLA Warning - ${id}`;
    case 'ticket.escalated':
      return `${SUBJECT_PREFIX} Ticket Escalated - ${id}`;
    case 'ticket.resolved':
      return `${SUBJECT_PREFIX} Ticket Resolved - ${id}`;
    case 'ticket.closed':
      return `${SUBJECT_PREFIX} Ticket Closed - ${id}`;
    case 'ticket.reopened':
      return `${SUBJECT_PREFIX} Ticket Reopened - ${id}`;
  }
}

// ── HTML bodies ───────────────────────────────────────────────────────────────

export function renderHtml(job: NotificationJob): string {
  const url  = ticketUrl(job.ticketId);
  const link = btn(url);
  const badge = ticketBadge(job.ticketId, job.ticketSubject);

  switch (job.event) {

    // ── TICKET_CREATED ──────────────────────────────────────────────────────
    case 'ticket.created':
      if (job.recipientRole === 'admin') {
        return layout('#1d4ed8', 'New Ticket Requires Triage', `
          <p>${greet(job.recipientName)}</p>
          <p>A new support ticket has been submitted and is waiting for assignment.</p>
          ${badge}
          <p><strong>Status:</strong> NEW &nbsp;|&nbsp;
             <strong>Requester:</strong> ${job.requesterName}</p>
          ${link}`);
      }
      return layout('#1d4ed8', 'Your Ticket Has Been Received', `
        <p>${greet(job.recipientName)}</p>
        <p>We've received your support request. Our IT team will review it shortly.</p>
        ${badge}
        <p>You'll receive email updates whenever the status changes.</p>
        ${link}`);

    // ── TICKET_ASSIGNED ─────────────────────────────────────────────────────
    case 'ticket.assigned':
      return layout('#0369a1', 'Ticket Assigned to You', `
        <p>${greet(job.recipientName)}</p>
        <p>A ticket has been assigned to you for resolution.</p>
        ${badge}
        <p><strong>Requester:</strong> ${job.requesterName}</p>
        <p>Please review and begin working on this ticket at your earliest convenience.</p>
        ${link}`);

    // ── STATUS_UPDATED ──────────────────────────────────────────────────────
    case 'ticket.status_changed':
      return layout('#4f46e5', `Status Updated: ${job.ticketStatus ?? ''}`, `
        <p>${greet(job.recipientName)}</p>
        <p>The status of your ticket has been updated.</p>
        ${badge}
        <p><strong>New Status:</strong> ${job.ticketStatus ?? 'updated'}
          ${job.actorName ? ` &nbsp;|&nbsp; <strong>Updated by:</strong> ${job.actorName}` : ''}</p>
        ${link}`);

    // ── COMMENT_ADDED ───────────────────────────────────────────────────────
    case 'ticket.comment_added':
      return layout('#6b7280', 'New Comment on Your Ticket', `
        <p>${greet(job.recipientName)}</p>
        <p>A new comment has been added to your support ticket.</p>
        ${badge}
        <blockquote style="border-left:4px solid #6b7280;padding:8px 16px;
          background:#f9fafb;margin:12px 0;white-space:pre-wrap">${job.commentBody ?? ''}</blockquote>
        ${link}`);

    // ── SLA_WARNING ─────────────────────────────────────────────────────────
    case 'ticket.sla_warning':
      return layout('#d97706', 'SLA Deadline Approaching', `
        <p>${greet(job.recipientName)}</p>
        <p>The following ticket is approaching its SLA resolution deadline.</p>
        ${badge}
        <p style="color:#d97706;font-size:16px;font-weight:bold">
          ⚠ ${job.slaRemainingMinutes ?? '?'} minutes of effective SLA time remaining
        </p>
        <p><strong>Requester:</strong> ${job.requesterName}</p>
        <p>Please take immediate action to resolve this ticket.</p>
        ${link}`);

    // ── ESCALATED ───────────────────────────────────────────────────────────
    case 'ticket.escalated': {
      const roleLabel = job.recipientRole === 'manager' ? 'Manager' : 'IT Admin';
      return layout('#dc2626', 'Ticket Escalated — SLA Breach', `
        <p>${greet(job.recipientName)},</p>
        <p>A ticket has been <strong>automatically escalated</strong> due to an SLA breach.
           As ${roleLabel}, your attention is required.</p>
        ${badge}
        <p><strong>Requester:</strong> ${job.requesterName}
          ${job.assigneeName ? ` &nbsp;|&nbsp; <strong>Assignee:</strong> ${job.assigneeName}` : ''}</p>
        <p style="color:#dc2626">Immediate action required.</p>
        ${link}`);
    }

    // ── RESOLVED ────────────────────────────────────────────────────────────
    case 'ticket.resolved':
      return layout('#16a34a', 'Your Ticket Has Been Resolved', `
        <p>${greet(job.recipientName)}</p>
        <p>Great news — your support ticket has been resolved.</p>
        ${badge}
        <p>If the issue is fully addressed, no further action is needed. If you still
           experience problems, you can reopen the ticket via the link below.</p>
        ${btn(url, 'View / Reopen Ticket')}`);

    // ── CLOSED ──────────────────────────────────────────────────────────────
    case 'ticket.closed':
      return layout('#374151', 'Ticket Closed', `
        <p>${greet(job.recipientName)}</p>
        <p>Your support ticket has been officially closed.</p>
        ${badge}
        <p>If you encounter the same issue in the future, please raise a new ticket.</p>
        ${link}`);

    // ── REOPENED ────────────────────────────────────────────────────────────
    case 'ticket.reopened':
      return layout('#7c3aed', 'Ticket Reopened', `
        <p>${greet(job.recipientName)}</p>
        <p>A previously resolved ticket has been reopened and assigned back to you.</p>
        ${badge}
        <p><strong>Requester:</strong> ${job.requesterName}</p>
        <p>Please investigate and resolve the outstanding issue.</p>
        ${link}`);
  }
}

// ── Plain-text fallback ───────────────────────────────────────────────────────

export function renderText(job: NotificationJob): string {
  const url = ticketUrl(job.ticketId);
  const lines: string[] = [
    renderSubject(job),
    '',
    `Ticket:  ${job.ticketId} — ${job.ticketSubject}`,
    `Link:    ${url}`,
  ];

  switch (job.event) {
    case 'ticket.created':
      lines.push(job.recipientRole === 'admin'
        ? `A new ticket requires triage. Requester: ${job.requesterName}`
        : 'Your support request has been received. We will be in touch shortly.');
      break;
    case 'ticket.assigned':
      lines.push(`This ticket has been assigned to you. Requester: ${job.requesterName}`);
      break;
    case 'ticket.status_changed':
      lines.push(`Ticket status updated to: ${job.ticketStatus ?? 'unknown'}`);
      break;
    case 'ticket.comment_added':
      lines.push(`New comment: ${job.commentBody ?? ''}`);
      break;
    case 'ticket.sla_warning':
      lines.push(`WARNING: Only ${job.slaRemainingMinutes ?? '?'} minutes of SLA time remaining. Take immediate action.`);
      break;
    case 'ticket.escalated':
      lines.push(`This ticket has been auto-escalated due to SLA breach. Immediate action required.`);
      break;
    case 'ticket.resolved':
      lines.push('Your ticket has been resolved. Visit the link to reopen if the issue persists.');
      break;
    case 'ticket.closed':
      lines.push('Your ticket has been closed. Open a new ticket if the issue recurs.');
      break;
    case 'ticket.reopened':
      lines.push(`Ticket reopened and assigned back to you. Requester: ${job.requesterName}`);
      break;
  }

  return lines.join('\n');
}
