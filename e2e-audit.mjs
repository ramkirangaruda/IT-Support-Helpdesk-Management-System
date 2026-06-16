// E2E audit harness — TEST 1-3 (ticket lifecycle, SLA escalation, RBAC).
// Run: node e2e-audit.mjs
import { execSync } from 'node:child_process';

const API = 'http://localhost:3007/api';
const PG = 'docker exec ticketzilla-postgres-1 psql -U postgres -d ticketzilla -t -A -c';
const sql = (q) => execSync(`${PG} "${q.replace(/"/g, '\\"')}"`).toString().trim();

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  (cond ? (pass++, console.log(`  PASS  ${name}${detail ? ' — ' + detail : ''}`))
        : (fail++, console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`)));
};

async function login(email) {
  const r = await fetch(`${API}/auth/dev-login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return (await r.json()).access_token;
}
const H = (t) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
async function req(method, path, token, body) {
  const r = await fetch(`${API}${path}`, {
    method, headers: H(token), body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

const main = async () => {
  const tok = {};
  for (const e of ['employee', 'agent', 'admin', 'l2', 'manager', 'finance', 'sysadmin'])
    tok[e] = await login(`${e}@test.com`);
  const cats = await req('GET', '/categories', tok.admin);
  const catId = cats.data[0].id;
  const adminId = JSON.parse(Buffer.from(tok.admin.split('.')[1], 'base64').toString()).sub;
  const agentId = JSON.parse(Buffer.from(tok.agent.split('.')[1], 'base64').toString()).sub;

  // ───────────────────────── TEST 1 — full lifecycle ─────────────────────────
  console.log('\n=== TEST 1 — Full ticket lifecycle (HIGH) ===');
  const c = await req('POST', '/tickets', tok.employee, {
    subject: 'Laptop will not boot', description: 'Black screen on power',
    priority: 'HIGH', source: 'FORM', categoryId: catId,
  });
  ok('create ticket', c.status === 201, `status=${c.status} id=${c.data?.id}`);
  const id = c.data.id;
  ok('id format INC-YYYY-NNNNNN', /^INC-\d{4}-\d{6}$/.test(id), id);

  // SLA: HIGH = response 2h, resolution 8h from createdAt
  const created = new Date(c.data.createdAt).getTime();
  const respDue = new Date(c.data.slaResponseDue).getTime();
  const resoDue = new Date(c.data.slaResolutionDue).getTime();
  ok('slaResponseDue = +2h', Math.abs(respDue - (created + 2 * 3600e3)) < 2000,
    `Δ=${(respDue - created) / 3600e3}h`);
  ok('slaResolutionDue = +8h', Math.abs(resoDue - (created + 8 * 3600e3)) < 2000,
    `Δ=${(resoDue - created) / 3600e3}h`);

  // assign as admin → ASSIGNED
  const asg = await req('POST', `/tickets/${id}/assign`, tok.admin, { assigneeId: agentId });
  ok('assign → ASSIGNED', asg.status === 201 && asg.data.status === 'ASSIGNED', `status=${asg.data?.status}`);

  const trans = async (to, who = tok.admin, extra = {}) =>
    req('POST', `/tickets/${id}/transition`, who, { toStatus: to, reason: `to ${to}`, ...extra });

  ok('→ IN_PROGRESS', (await trans('IN_PROGRESS')).data.status === 'IN_PROGRESS');
  const onhold = await trans('ON_HOLD');
  ok('→ ON_HOLD', onhold.data.status === 'ON_HOLD');
  await new Promise(r => setTimeout(r, 2200)); // accrue pause time
  const resume = await trans('IN_PROGRESS');
  ok('→ IN_PROGRESS (resume)', resume.data.status === 'IN_PROGRESS');
  ok('slaPausedMs accrued (~2s)', resume.data.slaPausedMs >= 1500,
    `slaPausedMs=${resume.data.slaPausedMs}`);

  const res = await req('POST', `/tickets/${id}/resolve`, tok.admin, { resolutionSummary: 'Replaced RAM module' });
  ok('→ RESOLVED', res.status === 201 && res.data.status === 'RESOLVED', `status=${res.data?.status}`);
  const closed = await trans('CLOSED', tok.employee); // employee closes own resolved
  ok('→ CLOSED (by employee)', closed.data.status === 'CLOSED', `status=${closed.data?.status}`);

  // reopen
  const reo = await trans('REOPENED');
  ok('CLOSED → REOPENED', reo.data.status === 'REOPENED', `status=${reo.data?.status}`);
  const reoProg = await trans('IN_PROGRESS');
  ok('REOPENED → IN_PROGRESS', reoProg.data.status === 'IN_PROGRESS');

  // StatusHistory + AuditLog
  const detail = await req('GET', `/tickets/${id}`, tok.admin);
  const sh = detail.data.statusHistory.length;
  ok('StatusHistory recorded', sh >= 8, `${sh} entries`);
  const auditCount = parseInt(sql(`SELECT COUNT(*) FROM "AuditLog" WHERE "entityId"='${id}'`), 10);
  ok('AuditLog recorded', auditCount >= 5, `${auditCount} audit rows`);
  const notif = parseInt(sql(`SELECT COUNT(*) FROM "Notification" WHERE "ticketId"='${id}'`), 10);
  ok('Notifications created', notif >= 1, `${notif} notifications`);

  // ───────────────────────── TEST 2 — SLA escalation ─────────────────────────
  console.log('\n=== TEST 2 — SLA breach & escalation ===');
  const c2 = await req('POST', '/tickets', tok.employee, {
    subject: 'Breach test', description: 'x', priority: 'LOW', source: 'FORM', categoryId: catId,
  });
  const id2 = c2.data.id;
  await req('POST', `/tickets/${id2}/assign`, tok.admin, { assigneeId: agentId }); // → ASSIGNED (escalatable)
  // backdate resolution due into the past
  sql(`UPDATE "Ticket" SET "slaResolutionDue"=NOW() - INTERVAL '1 hour' WHERE id='${id2}'`);
  const esc1 = await req('POST', '/admin/trigger-escalation-check', tok.admin);
  ok('escalation job ran', esc1.status === 201, `status=${esc1.status}`);
  const t2a = await req('GET', `/tickets/${id2}`, tok.admin);
  ok('status → ESCALATED', t2a.data.status === 'ESCALATED', `status=${t2a.data.status}`);
  ok('escalationLevel = 1', t2a.data.escalationLevel === 1, `level=${t2a.data.escalationLevel}`);
  // idempotency: run again
  await req('POST', '/admin/trigger-escalation-check', tok.admin);
  const t2b = await req('GET', `/tickets/${id2}`, tok.admin);
  ok('idempotent (no double-escalate)', t2b.data.escalationLevel === 1, `level=${t2b.data.escalationLevel}`);

  // ───────────────────────── TEST 3 — RBAC boundaries ────────────────────────
  console.log('\n=== TEST 3 — RBAC boundary testing ===');
  // admin-owned ticket (requester = admin)
  const adminTicket = await req('POST', '/tickets', tok.admin, {
    subject: 'admin private', description: 'x', priority: 'MEDIUM', source: 'FORM', categoryId: catId,
  });
  const aid = adminTicket.data.id;
  const empGet = await req('GET', `/tickets/${aid}`, tok.employee);
  ok('EMPLOYEE cannot read others ticket (404)', empGet.status === 404, `status=${empGet.status}`);
  const empStats = await req('GET', '/tickets/stats', tok.employee);
  ok('EMPLOYEE blocked from /stats (403)', empStats.status === 403, `status=${empStats.status}`);
  const empAssign = await req('POST', `/tickets/${aid}/assign`, tok.employee, { assigneeId: agentId });
  ok('EMPLOYEE blocked from assign (403)', empAssign.status === 403, `status=${empAssign.status}`);
  const agentGet = await req('GET', `/tickets/${aid}`, tok.agent);
  ok('AGENT cannot read unassigned ticket (404)', agentGet.status === 404, `status=${agentGet.status}`);

  console.log(`\n──────── TEST 1-3 RESULT: ${pass} passed, ${fail} failed ────────`);
  process.exit(fail ? 1 : 0);
};
main().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
