// E2E audit harness — TEST 4 (device + procurement full chain + reminder cycles)
import { execSync } from 'node:child_process';
const API = 'http://localhost:3000/api';
const PG = 'docker exec ticketzilla-postgres-1 psql -U postgres -d ticketzilla -t -A -c';
const sql = (q) => execSync(`${PG} "${q.replace(/"/g, '\\"')}"`).toString().trim();
let pass = 0, fail = 0;
const ok = (n, c, d = '') => (c ? (pass++, console.log(`  PASS  ${n}${d ? ' — ' + d : ''}`))
                                : (fail++, console.log(`  FAIL  ${n}${d ? ' — ' + d : ''}`)));
async function login(e) {
  const r = await fetch(`${API}/auth/dev-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: e }) });
  return (await r.json()).access_token;
}
const H = (t) => ({ Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' });
async function req(m, p, t, b) {
  const r = await fetch(`${API}${p}`, { method: m, headers: H(t), body: b ? JSON.stringify(b) : undefined });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}
const sub = (t) => JSON.parse(Buffer.from(t.split('.')[1], 'base64').toString()).sub;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitForRaisedPr(drId) {
  for (let i = 0; i < 20; i++) {
    const id = sql(`SELECT id FROM "PurchaseRequest" WHERE "deviceRequestId"='${drId}' AND status='RAISED'`);
    if (id) return id;
    await sleep(150);
  }
  return '';
}

const main = async () => {
  const tok = {};
  for (const e of ['employee', 'admin', 'manager', 'finance']) tok[e] = await login(`${e}@test.com`);
  const empId = sub(tok.employee);
  const dtype = `Laptop-E2E-${Date.now()}`;

  console.log('\n=== TEST 4 — Device + procurement full chain ===');
  // 1. employee requests device
  const dr = await req('POST', '/device-requests', tok.employee, { deviceType: dtype, justification: 'Need a dev laptop for E2E' });
  ok('device request created', dr.status === 201 && dr.data.status === 'SUBMITTED', `status=${dr.data?.status}`);
  const drId = dr.data.id;

  // 2. manager approves → PENDING_FULFILMENT, auto-PR created (no stock of dtype)
  const dec = await req('POST', `/device-requests/${drId}/decision`, tok.manager, { decision: 'APPROVED' });
  ok('manager approve → PENDING_FULFILMENT', dec.data.status === 'PENDING_FULFILMENT', `status=${dec.data?.status}`);

  // 3. find auto-created PR (RAISED) linked to this device request
  const prId = await waitForRaisedPr(drId);
  ok('auto-PR created in RAISED', !!prId, `prId=${prId}`);

  // 4. admin edits draft + submits  [THE FIX]
  const patch = await req('PATCH', `/purchase-requests/${prId}`, tok.admin, { estCost: '1200.00', budgetCode: 'IT-CAPEX-2026' });
  ok('PATCH draft PR (edit cost/budget)', patch.status === 200 && patch.data.budgetCode === 'IT-CAPEX-2026', `status=${patch.status}`);
  const submit = await req('POST', `/purchase-requests/${prId}/submit`, tok.admin);
  ok('submit RAISED → PENDING_MANAGER_APPROVAL', submit.data?.status === 'PENDING_MANAGER_APPROVAL', `status=${submit.data?.status}`);

  // 5. manager approve → PENDING_FINANCE_APPROVAL
  const ma = await req('POST', `/purchase-requests/${prId}/approve`, tok.manager, { decision: 'APPROVED' });
  ok('manager approve → PENDING_FINANCE_APPROVAL', ma.data?.status === 'PENDING_FINANCE_APPROVAL', `status=${ma.data?.status}`);
  // 6. finance approve → FINANCE_APPROVED
  const fa = await req('POST', `/purchase-requests/${prId}/approve`, tok.finance, { decision: 'APPROVED' });
  ok('finance approve → FINANCE_APPROVED', fa.data?.status === 'FINANCE_APPROVED', `status=${fa.data?.status}`);

  // no-skipping guard: a fresh manual PR sits at PENDING_MANAGER_APPROVAL;
  // finance must NOT be able to approve at the manager stage (must go manager first).
  const manualPr = await req('POST', '/purchase-requests', tok.admin, {
    itemSpec: 'No-skip test item', quantity: 1, estCost: '500.00', budgetCode: 'IT-OPEX',
  });
  ok('manual PR starts at PENDING_MANAGER_APPROVAL', manualPr.data?.status === 'PENDING_MANAGER_APPROVAL', `status=${manualPr.data?.status}`);
  const financeEarly = await req('POST', `/purchase-requests/${manualPr.data.id}/approve`, tok.finance, { decision: 'APPROVED' });
  ok('finance cannot approve at manager stage (no skipping)', financeEarly.status === 403, `status=${financeEarly.status}`);

  // 7. vendor + PO
  const vend = await req('POST', '/vendors', tok.admin, { name: 'E2E Vendor', category: 'Hardware', leadTimeDays: 5 });
  const po = await req('POST', `/purchase-requests/${prId}/po`, tok.admin, { poNumber: 'PO-E2E-1', vendorId: vend.data.id, actualCost: '1150.00' });
  ok('record PO → PO_RAISED', po.data?.status === 'PO_RAISED', `status=${po.data?.status}`);

  // 8. receive → RECEIVED + device created AVAILABLE
  const serial = `SN-E2E-${Date.now()}`;
  const rec = await req('POST', `/purchase-requests/${prId}/receive`, tok.admin, { type: dtype, makeModel: 'Dell E2E', serialNumber: serial });
  ok('record receipt → RECEIVED', rec.data?.status === 'RECEIVED', `status=${rec.data?.status}`);
  const newDevId = rec.data?.device?.id;
  ok('device created from purchase', !!newDevId, `deviceId=${newDevId}`);
  const devStatus = sql(`SELECT status FROM "Device" WHERE id='${newDevId}'`);
  ok('new device is AVAILABLE', devStatus === 'AVAILABLE', `status=${devStatus}`);

  // 9. allocate to requester via the still-open device request
  const alloc = await req('POST', `/device-requests/${drId}/allocate`, tok.admin, { deviceId: newDevId, conditionAtIssue: 'New' });
  ok('allocate device → request ALLOCATED', alloc.status === 201, `status=${alloc.status}`);
  const drFinal = sql(`SELECT status FROM "DeviceRequest" WHERE id='${drId}'`);
  ok('device request now ALLOCATED', drFinal === 'ALLOCATED', `status=${drFinal}`);
  const devFinal = sql(`SELECT status FROM "Device" WHERE id='${newDevId}'`);
  ok('device now ALLOCATED', devFinal === 'ALLOCATED', `status=${devFinal}`);

  // ── Reminder cycle escalation ──────────────────────────────────────────────
  console.log('\n=== TEST 4b — Device limit reminder cycles ===');
  // Ensure employee holds 3 active devices: insert 2 extra synthetic allocations
  const ts = Date.now();
  sql(`INSERT INTO "Device" (id,type,"makeModel","serialNumber",status,"createdAt","updatedAt") VALUES ('DEV-E2E-X1','Monitor','M1','SNX1-${ts}','ALLOCATED',NOW(),NOW()),('DEV-E2E-X2','Monitor','M2','SNX2-${ts}','ALLOCATED',NOW(),NOW()) ON CONFLICT (id) DO NOTHING`);
  sql(`INSERT INTO "DeviceAllocation" (id,"deviceId","employeeId","allocatedOn","conditionAtIssue") VALUES ('ALLOC-E2E-X1','DEV-E2E-X1','${empId}',NOW(),'New'),('ALLOC-E2E-X2','DEV-E2E-X2','${empId}',NOW(),'New') ON CONFLICT (id) DO NOTHING`);
  const hold = parseInt(sql(`SELECT COUNT(*) FROM "DeviceAllocation" WHERE "employeeId"='${empId}' AND "returnedOn" IS NULL`), 10);
  ok('employee holds > 2 devices', hold >= 3, `holds=${hold}`);
  // clear prior reminders for a clean cycle count
  sql(`DELETE FROM "DeviceReminder" WHERE "employeeId"='${empId}'`);

  for (let expectCycle = 1; expectCycle <= 3; expectCycle++) {
    await req('POST', '/admin/trigger-device-reminder-check', tok.admin);
    const cyc = parseInt(sql(`SELECT COALESCE(MAX(cycle),0) FROM "DeviceReminder" WHERE "employeeId"='${empId}'`), 10);
    ok(`reminder cycle ${expectCycle} created`, cyc === expectCycle, `maxCycle=${cyc}`);
    // backdate so cadence (3d) allows the next cycle
    sql(`UPDATE "DeviceReminder" SET "sentAt"=NOW() - INTERVAL '4 days' WHERE "employeeId"='${empId}'`);
  }
  const cycleEvents = sql(`SELECT DISTINCT event FROM "Notification" WHERE event LIKE 'device.reminder.cycle%' ORDER BY event`);
  ok('distinct cycle notification events exist', cycleEvents.includes('cycle1') && cycleEvents.includes('cycle3'),
    cycleEvents.replace(/\n/g, ','));

  console.log(`\n──────── TEST 4 RESULT: ${pass} passed, ${fail} failed ────────`);
  process.exit(fail ? 1 : 0);
};
main().catch(e => { console.error('HARNESS ERROR', e); process.exit(2); });
