import type { EmailMeta, RecipientRole } from './notification-job.interface';

// Full ticket data fetched by the processor for ticket.* events
export interface TicketEmailData {
  id: string;
  subject: string;
  status: string;
  priority: string;
  escalationLevel: number;
  slaResolutionDue: Date | null;
  category: { name: string } | null;
  requester: { name: string; email: string };
  assignee: { name: string; email: string } | null;
}

export interface BuildEmailCtx {
  ticket?: TicketEmailData;
  recipientRole?: RecipientRole;
  meta: EmailMeta;
}

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

// ── Layout helpers ────────────────────────────────────────────────────────────

function layout(inner: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
<tr><td align="center" style="padding:32px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
  <tr>
    <td style="background:#4f46e5;padding:24px 32px;">
      <div style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.5px;">TicketZilla</div>
      <div style="color:#c7d2fe;font-size:12px;margin-top:3px;">iFocus Systec</div>
    </td>
  </tr>
  <tr><td style="padding:32px 32px 24px;">${inner}</td></tr>
  <tr>
    <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;text-align:center;">
      <p style="margin:0;color:#94a3b8;font-size:12px;">This is an automated message from TicketZilla. Do not reply to this email.</p>
    </td>
  </tr>
</table>
</td></tr>
</table>
</body></html>`;
}

function btn(url: string, label: string): string {
  return `<a href="${url}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:6px;font-size:14px;font-weight:600;margin:20px 0 4px;">${label}</a>`;
}

function idBadge(id: string): string {
  return `<div style="display:inline-block;background:#eef2ff;border-radius:5px;padding:6px 12px;margin:12px 0;">
    <span style="font-family:monospace;font-size:15px;font-weight:700;color:#4f46e5;">${id}</span>
  </div>`;
}

function kv(label: string, value: string): string {
  return `<tr>
    <td style="padding:4px 16px 4px 0;color:#6b7280;font-size:13px;white-space:nowrap;vertical-align:top;">${label}</td>
    <td style="padding:4px 0;color:#111827;font-size:13px;font-weight:500;">${value}</td>
  </tr>`;
}

function kvTable(rows: [string, string][]): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:16px 0;">${rows.map(([l, v]) => kv(l, v)).join('')}</table>`;
}

function heading(text: string): string {
  return `<h2 style="margin:0 0 8px;font-size:18px;font-weight:700;color:#111827;">${text}</h2>`;
}

function para(text: string): string {
  return `<p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.6;">${text}</p>`;
}

function warningBanner(text: string): string {
  return `<div style="background:#fef3c7;border-left:4px solid #f59e0b;border-radius:4px;padding:12px 16px;margin:16px 0;">
    <p style="margin:0;color:#92400e;font-size:13px;font-weight:600;">${text}</p>
  </div>`;
}

function alertBanner(text: string): string {
  return `<div style="background:#fee2e2;border-left:4px solid #ef4444;border-radius:4px;padding:12px 16px;margin:16px 0;">
    <p style="margin:0;color:#991b1b;font-size:13px;font-weight:600;">${text}</p>
  </div>`;
}

function successBanner(text: string): string {
  return `<div style="background:#d1fae5;border-left:4px solid #10b981;border-radius:4px;padding:12px 16px;margin:16px 0;">
    <p style="margin:0;color:#065f46;font-size:13px;font-weight:600;">${text}</p>
  </div>`;
}

function fmtPriority(p: string): string {
  const map: Record<string, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High', CRITICAL: 'Critical' };
  return map[p] ?? p;
}

function fmtStatus(s: string): string {
  return s.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function fmtSla(d: Date | null): string {
  if (!d) return 'Not set';
  return new Date(d).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

// ── Ticket event templates ────────────────────────────────────────────────────

function ticketCreated(ctx: BuildEmailCtx, frontendUrl: string): EmailContent | null {
  const { ticket, recipientRole, meta } = ctx;
  if (!ticket) return null;
  const url = `${frontendUrl}/tickets/${ticket.id}`;

  if (recipientRole === 'requester') {
    const html = layout(`
      ${heading('Your ticket has been submitted')}
      ${para(`Hi ${meta.toName ?? ticket.requester.name},`)}
      ${para("We've received your support request and it will be reviewed shortly.")}
      ${idBadge(ticket.id)}
      ${kvTable([
        ['Subject',  ticket.subject],
        ['Category', ticket.category?.name ?? '—'],
        ['Priority', fmtPriority(ticket.priority)],
        ['SLA Due',  fmtSla(ticket.slaResolutionDue)],
      ])}
      ${btn(url, 'View Ticket')}
    `);
    return {
      subject: `[TicketZilla] Ticket Created — ${ticket.id}`,
      html,
      text: `Your ticket has been submitted.\n\nTicket ID: ${ticket.id}\nSubject: ${ticket.subject}\nCategory: ${ticket.category?.name ?? '—'}\nPriority: ${fmtPriority(ticket.priority)}\nSLA Due: ${fmtSla(ticket.slaResolutionDue)}\n\nView: ${url}`,
    };
  }

  // admin
  const html = layout(`
    ${heading('New support ticket submitted')}
    ${para(`A new ticket has been submitted and requires attention.`)}
    ${idBadge(ticket.id)}
    ${kvTable([
      ['Subject',   ticket.subject],
      ['Requester', ticket.requester.name],
      ['Category',  ticket.category?.name ?? '—'],
      ['Priority',  fmtPriority(ticket.priority)],
      ['SLA Due',   fmtSla(ticket.slaResolutionDue)],
    ])}
    ${btn(url, 'View Ticket')}
  `);
  return {
    subject: `[TicketZilla] New Ticket — ${ticket.id}`,
    html,
    text: `New ticket submitted.\n\nTicket ID: ${ticket.id}\nSubject: ${ticket.subject}\nRequester: ${ticket.requester.name}\nPriority: ${fmtPriority(ticket.priority)}\n\nView: ${url}`,
  };
}

function ticketAssigned(ctx: BuildEmailCtx, frontendUrl: string): EmailContent | null {
  const { ticket, meta } = ctx;
  if (!ticket) return null;
  const url = `${frontendUrl}/tickets/${ticket.id}`;
  const html = layout(`
    ${heading('A ticket has been assigned to you')}
    ${para(`Hi ${meta.toName ?? ticket.assignee?.name ?? 'Agent'},`)}
    ${para('The following ticket has been assigned to you and requires your attention.')}
    ${idBadge(ticket.id)}
    ${kvTable([
      ['Subject',   ticket.subject],
      ['Requester', ticket.requester.name],
      ['Priority',  fmtPriority(ticket.priority)],
      ['SLA Due',   fmtSla(ticket.slaResolutionDue)],
    ])}
    ${btn(url, 'View Ticket')}
  `);
  return {
    subject: `[TicketZilla] Ticket Assigned — ${ticket.id}`,
    html,
    text: `A ticket has been assigned to you.\n\nTicket ID: ${ticket.id}\nSubject: ${ticket.subject}\nRequester: ${ticket.requester.name}\nPriority: ${fmtPriority(ticket.priority)}\nSLA Due: ${fmtSla(ticket.slaResolutionDue)}\n\nView: ${url}`,
  };
}

function ticketStatusChanged(ctx: BuildEmailCtx, frontendUrl: string): EmailContent | null {
  const { ticket, meta } = ctx;
  if (!ticket) return null;
  const url = `${frontendUrl}/tickets/${ticket.id}`;
  const oldFmt = meta.oldStatus ? fmtStatus(meta.oldStatus) : '—';
  const newFmt = meta.newStatus ? fmtStatus(meta.newStatus) : fmtStatus(ticket.status);
  const updatedBy = meta.actorName ?? 'the support team';
  const html = layout(`
    ${heading('Ticket status updated')}
    ${para(`Hi ${meta.toName ?? ticket.requester.name},`)}
    ${para(`The status of your ticket has been updated by ${updatedBy}.`)}
    ${idBadge(ticket.id)}
    ${kvTable([
      ['Subject', ticket.subject],
      ['Status',  `${oldFmt} → ${newFmt}`],
    ])}
    ${btn(url, 'View Ticket')}
  `);
  return {
    subject: `[TicketZilla] Status Updated — ${ticket.id}`,
    html,
    text: `Ticket status updated.\n\nTicket: ${ticket.id} — ${ticket.subject}\nStatus: ${oldFmt} → ${newFmt}\nUpdated by: ${updatedBy}\n\nView: ${url}`,
  };
}

function ticketCommentAdded(ctx: BuildEmailCtx, frontendUrl: string): EmailContent | null {
  const { ticket, meta } = ctx;
  if (!ticket) return null;
  const url = `${frontendUrl}/tickets/${ticket.id}`;
  const commenter = meta.actorName ?? 'Someone';
  const preview   = meta.commentPreview ? `<blockquote style="margin:12px 0;border-left:3px solid #e5e7eb;padding:8px 16px;color:#6b7280;font-size:13px;font-style:italic;">${meta.commentPreview}${meta.commentPreview.length >= 200 ? '…' : ''}</blockquote>` : '';
  const html = layout(`
    ${heading('New comment on your ticket')}
    ${para(`Hi ${meta.toName ?? ticket.requester.name},`)}
    ${para(`${commenter} has added a comment on ticket ${ticket.id}.`)}
    ${preview}
    ${idBadge(ticket.id)}
    ${btn(url, 'View Comment')}
  `);
  return {
    subject: `[TicketZilla] Comment Added — ${ticket.id}`,
    html,
    text: `${commenter} commented on ticket ${ticket.id}.\n\n${meta.commentPreview ?? ''}\n\nView: ${url}`,
  };
}

function ticketSlaWarning(ctx: BuildEmailCtx, frontendUrl: string): EmailContent | null {
  const { ticket, meta } = ctx;
  if (!ticket) return null;
  const url = `${frontendUrl}/tickets/${ticket.id}`;
  const remaining = meta.slaRemainingMinutes != null
    ? `${meta.slaRemainingMinutes} minutes`
    : 'under 25%';
  const html = layout(`
    ${heading('SLA Warning — action required')}
    ${warningBanner(`⚠️  Only ${remaining} remaining to resolve this ticket within SLA.`)}
    ${idBadge(ticket.id)}
    ${kvTable([
      ['Subject',  ticket.subject],
      ['Priority', fmtPriority(ticket.priority)],
      ['SLA Due',  fmtSla(ticket.slaResolutionDue)],
      ['Status',   fmtStatus(ticket.status)],
    ])}
    ${btn(url, 'View Ticket')}
  `);
  return {
    subject: `[TicketZilla] ⚠️ SLA Warning — ${ticket.id}`,
    html,
    text: `SLA Warning: only ${remaining} remaining for ticket ${ticket.id}.\n\nSubject: ${ticket.subject}\nSLA Due: ${fmtSla(ticket.slaResolutionDue)}\n\nView: ${url}`,
  };
}

function ticketEscalated(ctx: BuildEmailCtx, frontendUrl: string): EmailContent | null {
  const { ticket } = ctx;
  if (!ticket) return null;
  const url = `${frontendUrl}/tickets/${ticket.id}`;
  const html = layout(`
    ${heading('Ticket escalated — SLA breach')}
    ${alertBanner(`🚨  This ticket has breached its SLA and been escalated to Level ${ticket.escalationLevel}.`)}
    ${idBadge(ticket.id)}
    ${kvTable([
      ['Subject',           ticket.subject],
      ['Requester',         ticket.requester.name],
      ['Priority',          fmtPriority(ticket.priority)],
      ['Escalation Level',  String(ticket.escalationLevel)],
      ['SLA Due',           fmtSla(ticket.slaResolutionDue)],
    ])}
    ${btn(url, 'View Ticket')}
  `);
  return {
    subject: `[TicketZilla] 🚨 Escalated — ${ticket.id}`,
    html,
    text: `Ticket escalated (SLA breach): ${ticket.id}\n\nSubject: ${ticket.subject}\nRequester: ${ticket.requester.name}\nEscalation Level: ${ticket.escalationLevel}\n\nView: ${url}`,
  };
}

function ticketResolved(ctx: BuildEmailCtx, frontendUrl: string): EmailContent | null {
  const { ticket, meta } = ctx;
  if (!ticket) return null;
  const url = `${frontendUrl}/tickets/${ticket.id}`;
  const html = layout(`
    ${heading('Your ticket has been resolved')}
    ${para(`Hi ${meta.toName ?? ticket.requester.name},`)}
    ${successBanner('✓  Your support ticket has been resolved.')}
    ${idBadge(ticket.id)}
    ${kvTable([['Subject', ticket.subject]])}
    ${para('If your issue has been resolved, please confirm closure. If not, you can reopen the ticket within 7 days.')}
    ${btn(url, 'View Ticket & Confirm')}
  `);
  return {
    subject: `[TicketZilla] Ticket Resolved — ${ticket.id}`,
    html,
    text: `Your ticket has been resolved.\n\nTicket: ${ticket.id} — ${ticket.subject}\n\nPlease confirm resolution or reopen if needed.\nView: ${url}`,
  };
}

function ticketClosed(ctx: BuildEmailCtx, frontendUrl: string): EmailContent | null {
  const { ticket, meta } = ctx;
  if (!ticket) return null;
  const url = `${frontendUrl}/tickets/${ticket.id}`;
  const html = layout(`
    ${heading('Ticket closed')}
    ${para(`Hi ${meta.toName ?? ticket.requester.name},`)}
    ${para('Your support ticket has been closed. Thank you for using TicketZilla.')}
    ${idBadge(ticket.id)}
    ${kvTable([['Subject', ticket.subject]])}
    ${btn(url, 'View Ticket')}
  `);
  return {
    subject: `[TicketZilla] Ticket Closed — ${ticket.id}`,
    html,
    text: `Ticket closed: ${ticket.id} — ${ticket.subject}\n\nView: ${url}`,
  };
}

function ticketReopened(ctx: BuildEmailCtx, frontendUrl: string): EmailContent | null {
  const { ticket, meta } = ctx;
  if (!ticket) return null;
  const url = `${frontendUrl}/tickets/${ticket.id}`;
  const html = layout(`
    ${heading('Ticket reopened')}
    ${para(`Hi ${meta.toName ?? ticket.assignee?.name ?? 'Agent'},`)}
    ${para('A ticket assigned to you has been reopened and requires your attention.')}
    ${idBadge(ticket.id)}
    ${kvTable([
      ['Subject', ticket.subject],
      ['Reopened by', meta.actorName ?? 'requester'],
    ])}
    ${btn(url, 'View Ticket')}
  `);
  return {
    subject: `[TicketZilla] Ticket Reopened — ${ticket.id}`,
    html,
    text: `Ticket reopened: ${ticket.id} — ${ticket.subject}\nReopened by: ${meta.actorName ?? 'requester'}\n\nView: ${url}`,
  };
}

// ── Auth / user management templates ─────────────────────────────────────────

function accountApproved(ctx: BuildEmailCtx, frontendUrl: string): EmailContent | null {
  const { meta } = ctx;
  const loginUrl = `${frontendUrl}/login`;
  const html = layout(`
    ${heading('Your account has been approved')}
    ${para(`Hi ${meta.toName ?? 'there'},`)}
    ${successBanner('✓  Your TicketZilla account has been approved.')}
    ${meta.role ? kvTable([['Assigned Role', meta.role]]) : ''}
    ${para('You can now sign in using your email address and password.')}
    ${btn(loginUrl, 'Sign In')}
  `);
  return {
    subject: '[TicketZilla] Account Approved',
    html,
    text: `Your TicketZilla account has been approved.\n${meta.role ? `Role: ${meta.role}\n` : ''}Sign in: ${loginUrl}`,
  };
}

function accountRejected(ctx: BuildEmailCtx, frontendUrl: string): EmailContent | null {
  const { meta } = ctx;
  void frontendUrl;
  const html = layout(`
    ${heading('Account registration not approved')}
    ${para(`Hi ${meta.toName ?? 'there'},`)}
    ${alertBanner('Your TicketZilla account registration has not been approved.')}
    ${meta.reason ? `<div style="background:#f9fafb;border-radius:6px;padding:12px 16px;margin:12px 0;"><p style="margin:0;color:#374151;font-size:13px;"><strong>Reason:</strong> ${meta.reason}</p></div>` : ''}
    ${para('If you believe this is an error, please contact your IT administrator.')}
  `);
  return {
    subject: '[TicketZilla] Account Registration Not Approved',
    html,
    text: `Your TicketZilla account registration was not approved.\n${meta.reason ? `Reason: ${meta.reason}\n` : ''}Contact your IT administrator if you believe this is an error.`,
  };
}

function registrationPending(ctx: BuildEmailCtx, frontendUrl: string): EmailContent | null {
  const { meta } = ctx;
  const pendingUrl = `${frontendUrl}/admin/pending-users`;
  const html = layout(`
    ${heading('New user registration pending approval')}
    ${para('A new user has registered and is awaiting your approval.')}
    ${kvTable([
      ['Name',  meta.applicantName  ?? '—'],
      ['Email', meta.applicantEmail ?? '—'],
    ])}
    ${btn(pendingUrl, 'Review Pending Users')}
  `);
  return {
    subject: '[TicketZilla] New Registration Pending Approval',
    html,
    text: `New user registration pending approval.\n\nName: ${meta.applicantName ?? '—'}\nEmail: ${meta.applicantEmail ?? '—'}\n\nReview: ${pendingUrl}`,
  };
}

function registrationConfirmation(ctx: BuildEmailCtx, frontendUrl: string): EmailContent | null {
  const { meta } = ctx;
  void frontendUrl;
  const html = layout(`
    ${heading('Registration received')}
    ${para(`Hi ${meta.toName ?? 'there'},`)}
    ${para('Thank you for registering with TicketZilla. Your account is pending approval by an administrator.')}
    ${para('You will receive an email once your account has been reviewed. Once approved, you can sign in using your email and password.')}
    ${para('If you have any questions, please contact your IT support team.')}
  `);
  return {
    subject: '[TicketZilla] Registration Received',
    html,
    text: `Hi ${meta.toName ?? 'there'},\n\nThank you for registering. Your account is pending approval. You will be notified once an administrator reviews your request.`,
  };
}

// ── Device request templates ──────────────────────────────────────────────────

function deviceRequestApproved(ctx: BuildEmailCtx, frontendUrl: string): EmailContent | null {
  const { meta } = ctx;
  const requestsUrl = `${frontendUrl}/devices/my-requests`;
  const html = layout(`
    ${heading('Device request approved')}
    ${para(`Hi ${meta.toName ?? 'there'},`)}
    ${successBanner('✓  Your device request has been approved.')}
    ${meta.deviceType ? kvTable([['Device Type', meta.deviceType]]) : ''}
    ${para('IT will arrange fulfilment. You will be notified when your device is ready.')}
    ${btn(requestsUrl, 'View My Requests')}
  `);
  return {
    subject: '[TicketZilla] Device Request Approved',
    html,
    text: `Your device request has been approved.\n${meta.deviceType ? `Device Type: ${meta.deviceType}\n` : ''}IT will contact you regarding fulfilment.`,
  };
}

function deviceRequestRejected(ctx: BuildEmailCtx, frontendUrl: string): EmailContent | null {
  const { meta } = ctx;
  const requestsUrl = `${frontendUrl}/devices/my-requests`;
  const html = layout(`
    ${heading('Device request not approved')}
    ${para(`Hi ${meta.toName ?? 'there'},`)}
    ${alertBanner('Your device request has not been approved.')}
    ${meta.deviceType ? kvTable([['Device Type', meta.deviceType]]) : ''}
    ${para('If you have questions, please contact your manager or raise a new support ticket.')}
    ${btn(requestsUrl, 'View My Requests')}
  `);
  return {
    subject: '[TicketZilla] Device Request Not Approved',
    html,
    text: `Your device request has not been approved.\n${meta.deviceType ? `Device Type: ${meta.deviceType}\n` : ''}Contact your manager if you have questions.`,
  };
}

function deviceRequestPendingFulfilment(ctx: BuildEmailCtx, frontendUrl: string): EmailContent | null {
  const { meta } = ctx;
  const queueUrl = `${frontendUrl}/admin/device-requests`;
  const html = layout(`
    ${heading('Device request approved — fulfilment required')}
    ${para('A device request has been approved by the manager and is awaiting fulfilment.')}
    ${meta.deviceType ? kvTable([['Device Type', meta.deviceType]]) : ''}
    ${para('Please allocate a device from stock or raise a purchase request if none are available.')}
    ${btn(queueUrl, 'View Device Request Queue')}
  `);
  return {
    subject: '[TicketZilla] Device Request Ready for Fulfilment',
    html,
    text: `A device request is awaiting fulfilment.\n${meta.deviceType ? `Device Type: ${meta.deviceType}\n` : ''}\nView queue: ${queueUrl}`,
  };
}

function devicePurchasedAvailable(ctx: BuildEmailCtx, frontendUrl: string): EmailContent | null {
  const { meta } = ctx;
  const requestsUrl = `${frontendUrl}/devices/my-requests`;
  const html = layout(`
    ${heading('Your device is now available')}
    ${para(`Hi ${meta.toName ?? 'there'},`)}
    ${successBanner('✓  The device you requested has been procured and is now available.')}
    ${meta.deviceType ? kvTable([['Device Type', meta.deviceType]]) : ''}
    ${para('IT will be in touch to arrange delivery or collection.')}
    ${btn(requestsUrl, 'View My Requests')}
  `);
  return {
    subject: '[TicketZilla] Device Now Available',
    html,
    text: `Your requested device is now available.\n${meta.deviceType ? `Device Type: ${meta.deviceType}\n` : ''}IT will contact you shortly.`,
  };
}

// ── Device reminder templates ─────────────────────────────────────────────────

function deviceReminder(ctx: BuildEmailCtx, frontendUrl: string): EmailContent | null {
  const { meta } = ctx;
  const devicesUrl = `${frontendUrl}/devices`;
  const count    = meta.deviceCount ?? '?';
  const max      = meta.maxDevices  ?? '2';
  const cycle    = meta.reminderCycle ?? '1';
  const html = layout(`
    ${heading('Please return a device')}
    ${para(`Hi ${meta.toName ?? 'there'},`)}
    ${warningBanner(`⚠️  You currently hold ${count} device(s), which exceeds the maximum of ${max} allowed per employee.`)}
    ${para(`This is reminder #${cycle}. Please arrange to return a device at your earliest convenience.`)}
    ${para('If you believe this is an error, please contact IT support.')}
    ${btn(devicesUrl, 'View My Devices')}
  `);
  return {
    subject: `[TicketZilla] Please Return a Device — You Hold ${count} Device(s)`,
    html,
    text: `Reminder #${cycle}: You hold ${count} device(s), exceeding the maximum of ${max}. Please return a device.\n\nView devices: ${devicesUrl}`,
  };
}

function deviceReminderEscalation(ctx: BuildEmailCtx, frontendUrl: string): EmailContent | null {
  const { meta } = ctx;
  void frontendUrl;
  const count = meta.deviceCount ?? '?';
  const max   = meta.maxDevices  ?? '2';
  const cycle = meta.reminderCycle ?? '1';
  const name  = meta.toName ?? 'An employee';
  const html = layout(`
    ${heading('Device limit exceeded — escalation notice')}
    ${para('This is an escalation notice for your records.')}
    ${warningBanner(`⚠️  ${name} holds ${count} device(s), exceeding the limit of ${max}. Reminder #${cycle} has been sent.`)}
    ${para('Please follow up if the device has not been returned within the expected timeframe.')}
  `);
  return {
    subject: `[TicketZilla] Device Limit Escalation — ${name} (Cycle ${cycle})`,
    html,
    text: `Escalation notice: ${name} holds ${count} device(s) (max ${max}). Reminder #${cycle} has been sent.`,
  };
}

// ── Procurement templates ─────────────────────────────────────────────────────

function prPendingManager(ctx: BuildEmailCtx, frontendUrl: string): EmailContent | null {
  const { meta } = ctx;
  const prUrl = `${frontendUrl}/admin/procurement`;
  const html = layout(`
    ${heading('Purchase request pending your approval')}
    ${para('A purchase request has been submitted and requires manager approval.')}
    ${kvTable([
      ['PR ID',    meta.prId    ?? '—'],
      ['Item',     meta.itemSpec ?? '—'],
    ])}
    ${btn(prUrl, 'Review Purchase Request')}
  `);
  return {
    subject: '[TicketZilla] Purchase Request Pending Your Approval',
    html,
    text: `A purchase request requires your approval.\n\nPR ID: ${meta.prId ?? '—'}\nItem: ${meta.itemSpec ?? '—'}\n\nReview: ${prUrl}`,
  };
}

function prPendingFinance(ctx: BuildEmailCtx, frontendUrl: string): EmailContent | null {
  const { meta } = ctx;
  const prUrl = `${frontendUrl}/finance/approvals`;
  const html = layout(`
    ${heading('Purchase request pending finance approval')}
    ${para('A purchase request has been approved by the manager and now requires finance approval.')}
    ${kvTable([
      ['PR ID', meta.prId    ?? '—'],
      ['Item',  meta.itemSpec ?? '—'],
    ])}
    ${btn(prUrl, 'Review Purchase Request')}
  `);
  return {
    subject: '[TicketZilla] Purchase Request Pending Finance Approval',
    html,
    text: `A purchase request requires finance approval.\n\nPR ID: ${meta.prId ?? '—'}\nItem: ${meta.itemSpec ?? '—'}\n\nReview: ${prUrl}`,
  };
}

function prFinanceApproved(ctx: BuildEmailCtx, frontendUrl: string): EmailContent | null {
  const { meta } = ctx;
  const prUrl = `${frontendUrl}/admin/procurement`;
  const html = layout(`
    ${heading('Purchase request finance-approved — raise PO')}
    ${successBanner('✓  Finance has approved this purchase request.')}
    ${kvTable([
      ['PR ID', meta.prId    ?? '—'],
      ['Item',  meta.itemSpec ?? '—'],
    ])}
    ${para('Please raise a purchase order with the vendor to proceed.')}
    ${btn(prUrl, 'View Procurement Pipeline')}
  `);
  return {
    subject: '[TicketZilla] Purchase Request Finance-Approved — Raise PO',
    html,
    text: `Finance has approved the purchase request.\n\nPR ID: ${meta.prId ?? '—'}\nItem: ${meta.itemSpec ?? '—'}\n\nPlease raise a PO. View: ${prUrl}`,
  };
}

function prRejected(ctx: BuildEmailCtx, frontendUrl: string): EmailContent | null {
  const { meta } = ctx;
  const prUrl = `${frontendUrl}/admin/procurement`;
  const html = layout(`
    ${heading('Purchase request rejected')}
    ${para(`Hi ${meta.toName ?? 'there'},`)}
    ${alertBanner('A purchase request you raised has been rejected.')}
    ${kvTable([
      ['PR ID', meta.prId    ?? '—'],
      ['Item',  meta.itemSpec ?? '—'],
      ...(meta.reason ? [['Reason', meta.reason] as [string, string]] : []),
    ])}
    ${btn(prUrl, 'View Procurement Pipeline')}
  `);
  return {
    subject: '[TicketZilla] Purchase Request Rejected',
    html,
    text: `A purchase request you raised has been rejected.\n\nPR ID: ${meta.prId ?? '—'}\nItem: ${meta.itemSpec ?? '—'}\n${meta.reason ? `Reason: ${meta.reason}\n` : ''}\nView: ${prUrl}`,
  };
}

function prAutoCreated(ctx: BuildEmailCtx, frontendUrl: string): EmailContent | null {
  const { meta } = ctx;
  const prUrl = `${frontendUrl}/admin/procurement`;
  const html = layout(`
    ${heading('Auto-raised purchase request requires review')}
    ${warningBanner('⚠️  A purchase request was auto-raised because approved device stock is unavailable.')}
    ${kvTable([
      ['PR ID',        meta.prId      ?? '—'],
      ['Device Type',  meta.deviceType ?? '—'],
    ])}
    ${para('Please review, update cost and budget code, then submit for approval.')}
    ${btn(prUrl, 'View Procurement Pipeline')}
  `);
  return {
    subject: '[TicketZilla] Auto-Raised Purchase Request — Review Required',
    html,
    text: `A purchase request was auto-raised.\n\nPR ID: ${meta.prId ?? '—'}\nDevice Type: ${meta.deviceType ?? '—'}\n\nPlease review and submit for approval.\nView: ${prUrl}`,
  };
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

export function buildEmail(
  event: string,
  ctx: BuildEmailCtx,
  frontendUrl: string,
): EmailContent | null {
  switch (event) {
    // Ticket events
    case 'ticket.created':       return ticketCreated(ctx, frontendUrl);
    case 'ticket.assigned':      return ticketAssigned(ctx, frontendUrl);
    case 'ticket.status_changed':
    case 'ticket.resolved':
    case 'ticket.closed':
    case 'ticket.reopened':
      if (event === 'ticket.resolved') return ticketResolved(ctx, frontendUrl);
      if (event === 'ticket.closed')   return ticketClosed(ctx, frontendUrl);
      if (event === 'ticket.reopened') return ticketReopened(ctx, frontendUrl);
      return ticketStatusChanged(ctx, frontendUrl);
    case 'ticket.comment_added': return ticketCommentAdded(ctx, frontendUrl);
    case 'ticket.sla_warning':   return ticketSlaWarning(ctx, frontendUrl);
    case 'ticket.escalated':     return ticketEscalated(ctx, frontendUrl);

    // Auth events
    case 'auth.account_approved':          return accountApproved(ctx, frontendUrl);
    case 'auth.account_rejected':          return accountRejected(ctx, frontendUrl);
    case 'auth.registration_pending':      return registrationPending(ctx, frontendUrl);
    case 'auth.registration_confirmation': return registrationConfirmation(ctx, frontendUrl);

    // Device events
    case 'device.request.approved':           return deviceRequestApproved(ctx, frontendUrl);
    case 'device.request.rejected':           return deviceRequestRejected(ctx, frontendUrl);
    case 'device.request.pending_fulfilment': return deviceRequestPendingFulfilment(ctx, frontendUrl);
    case 'device.purchased_available':        return devicePurchasedAvailable(ctx, frontendUrl);

    // Procurement events
    case 'purchase.request.pending_manager':  return prPendingManager(ctx, frontendUrl);
    case 'purchase.request.pending_finance':  return prPendingFinance(ctx, frontendUrl);
    case 'purchase.request.finance_approved': return prFinanceApproved(ctx, frontendUrl);
    case 'purchase.request.rejected':         return prRejected(ctx, frontendUrl);
    case 'purchase.request.auto_created':     return prAutoCreated(ctx, frontendUrl);

    default:
      // Device reminder cycles use dynamic event names: device.reminder.cycle1, etc.
      if (/^device\.reminder\.cycle\d+$/.test(event))           return deviceReminder(ctx, frontendUrl);
      if (/^device\.reminder\.escalation_cycle\d+$/.test(event)) return deviceReminderEscalation(ctx, frontendUrl);
      return null;
  }
}
