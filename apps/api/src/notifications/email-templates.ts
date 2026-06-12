import { NotificationJob } from './notification-job.interface';

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:5173';

function ticketLink(id: string) {
  return `${FRONTEND_URL}/tickets/${id}`;
}

function layout(title: string, body: string, borderColor = '#1d4ed8') {
  return `
    <div style="font-family:sans-serif;max-width:600px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
      <h2 style="color:${borderColor}">${title}</h2>
      ${body}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin-top:24px"/>
      <p style="color:#6b7280;font-size:12px">TicketZilla IT Help Desk</p>
    </div>`;
}

export function renderSubject(job: NotificationJob): string {
  switch (job.event) {
    case 'ticket.created':
      return `[${job.ticketId}] Your ticket has been received`;
    case 'ticket.assigned':
      return `[${job.ticketId}] Your ticket has been assigned`;
    case 'ticket.status_changed':
      return `[${job.ticketId}] Ticket status updated to ${job.ticketStatus}`;
    case 'ticket.comment_added':
      return `[${job.ticketId}] New comment on your ticket`;
    case 'ticket.sla_warning':
      return `[${job.ticketId}] ⚠ SLA Warning — ${job.slaRemainingMinutes ?? '?'} minutes remaining`;
    case 'ticket.escalated':
      return `[${job.ticketId}] 🚨 Ticket Escalated — SLA Breach`;
  }
}

export function renderHtml(job: NotificationJob): string {
  const link = ticketLink(job.ticketId);
  const btn  = `<a href="${link}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#1d4ed8;color:#fff;border-radius:6px;text-decoration:none">View Ticket</a>`;

  switch (job.event) {
    case 'ticket.created':
      return layout('Ticket Received', `
        <p>Hi ${job.requesterName},</p>
        <p>We've received your support request:</p>
        <blockquote style="border-left:4px solid #1d4ed8;padding:8px 16px;background:#eff6ff">
          <strong>${job.ticketId}</strong> — ${job.ticketSubject}
        </blockquote>
        <p>Our team will review it shortly. You'll receive updates as the status changes.</p>
        ${btn}`);

    case 'ticket.assigned':
      return layout('Ticket Assigned', `
        <p>Hi ${job.requesterName},</p>
        <p>Your ticket <strong>${job.ticketId}</strong> has been assigned to <strong>${job.assigneeName ?? 'an agent'}</strong> and is being worked on.</p>
        ${btn}`);

    case 'ticket.status_changed':
      return layout(`Status Updated: ${job.ticketStatus}`, `
        <p>Hi ${job.requesterName},</p>
        <p>The status of your ticket <strong>${job.ticketId}</strong> has changed to <strong>${job.ticketStatus}</strong>.</p>
        ${btn}`);

    case 'ticket.comment_added':
      return layout('New Comment on Your Ticket', `
        <p>Hi ${job.requesterName},</p>
        <p>A new comment was added to ticket <strong>${job.ticketId}</strong>:</p>
        <blockquote style="border-left:4px solid #6b7280;padding:8px 16px;background:#f9fafb">
          ${job.commentBody ?? ''}
        </blockquote>
        ${btn}`);

    case 'ticket.sla_warning':
      return layout('⚠ SLA Warning', `
        <p>Hi ${job.assigneeName ?? job.requesterName},</p>
        <p>Ticket <strong>${job.ticketId}</strong> — <em>${job.ticketSubject}</em> — is approaching its SLA deadline.</p>
        <p style="color:#d97706;font-weight:bold">Only ${job.slaRemainingMinutes ?? '?'} minutes of effective SLA time remaining.</p>
        <p>Please take action to resolve this ticket before the SLA is breached.</p>
        ${btn}`, '#d97706');

    case 'ticket.escalated':
      return layout('🚨 Ticket Escalated', `
        <p>Hi ${job.assigneeName ?? job.requesterName},</p>
        <p>Ticket <strong>${job.ticketId}</strong> — <em>${job.ticketSubject}</em> — has been <strong>automatically escalated</strong> due to an SLA breach.</p>
        <p style="color:#dc2626">Immediate attention is required.</p>
        ${btn}`, '#dc2626');
  }
}
