/**
 * Verification script — device import (Tests A-F, optional real-file).
 * Run: node scripts/verify-import.mjs ["path/to/real-file.xlsx"] [--commit]
 * Uses only Node 20 built-ins + xlsx (already installed in apps/api).
 */

import * as XLSX from 'xlsx';
import { readFileSync } from 'fs';
import { execSync } from 'child_process';

const API = 'http://localhost:3007/api';

// ── Auth ─────────────────────────────────────────────────────────────────────

async function getToken(email) {
  const res = await fetch(`${API}/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(`Login failed for ${email}: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

// ── Multipart upload using Node 20 built-in FormData + Blob ──────────────────

async function callImport(token, buffer, filename, mode) {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const form = new FormData();
  form.append('file', blob, filename);

  const res = await fetch(`${API}/devices/import?mode=${mode}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  let body;
  try { body = await res.json(); } catch { body = await res.text(); }
  return { status: res.status, body };
}

// ── Build deterministic test Excel ────────────────────────────────────────────

function buildTestExcel() {
  const wb = XLSX.utils.book_new();
  const rows = [
    // Header row
    ['Asset Number','Model','Status','Service Tag','Asset Category','Asset Model',
     'CPU','RAM','HDD','Windows Version','Anti-Virus Name','MS Office version',
     'User Name/Type','Remarks'],
    // Row 1 — Instock → AVAILABLE
    ['IFOCUS-TEST01','Dell Latitude 7480','Instock','TEST-SVC-001','Laptop',
     'Dell Latitude 7480','i5','8GB','256GB','Windows 10 Pro','Windows Defender',
     'MS OFFICE 2013','Kumar','IT'],
    // Row 2 — Dead → RETIRED
    ['IFOCUS-TEST02','MacBook Air','Dead','TEST-SVC-002','MACBOOK AIR',
     'Mac Book Air A1466','i5','8GB','128GB','MAC OS','Windows Defender',
     'Open Source Office','Priya','Media Corp'],
    // Row 3 — Instock → AVAILABLE, RAM as expression
    ['IFOCUS-TEST03','HP EliteBook','Instock','TEST-SVC-003','Laptop',
     'HP EliteBook 840 G2','i5','8*8=16GB','512GB','Windows 11 Pro','Windows Defender',
     'MS OFFICE 365','Instock','Vacant'],
    // Row 4 — INSTOCK(Hinges damage) → AVAILABLE with damage note
    ['IFOCUS-TEST04','Dell Vostro','INSTOCK(Hinges damage)','TEST-SVC-004','Laptop',
     'Dell Vostro 14','i3','4GB','500GB','Windows 10 Home','Windows Defender',
     'Not Installed','Bench','Bench'],
    // Row 5 — completely empty
    ['','','','','','','','','','','','','',''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Test Inventory');
  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

// ── Assertions ────────────────────────────────────────────────────────────────

let passed = 0, failed = 0;

function check(label, condition, actual) {
  if (condition) { console.log(`  ✅ ${label}`); passed++; }
  else           { console.log(`  ❌ ${label} — got: ${JSON.stringify(actual)}`); failed++; }
}

function section(title) {
  console.log(`\n${'─'.repeat(65)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(65));
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const realFilePath = process.argv[2];
  const doCommit = process.argv.includes('--commit');

  // Clean up test devices from any previous run
  section('Setup — delete IFOCUS-TEST* devices');
  try {
    const out = execSync(
      `docker exec ticketzilla-postgres-1 psql -U postgres -d ticketzilla -c "DELETE FROM \\"Device\\" WHERE \\"assetNumber\\" LIKE 'IFOCUS-TEST%';"`,
      { encoding: 'utf8' }
    );
    const m = out.match(/DELETE (\d+)/);
    console.log(`  Deleted ${m ? m[1] : '?'} stale test device(s)`);
  } catch (e) {
    console.log(`  Warning: cleanup failed (${e.message.slice(0, 80)}) — first run is fine`);
  }

  // Tokens
  section('Auth');
  const adminToken    = await getToken('admin@test.com');
  const employeeToken = await getToken('employee@test.com');
  console.log('  IT_ADMIN token ✓');
  console.log('  EMPLOYEE token ✓');

  // Build test buffer
  const testBuf = buildTestExcel();
  console.log(`\n  Test Excel: ${testBuf.length} bytes, sheet "Test Inventory", 5 rows (4 data + 1 empty)`);

  // ── TEST A — Preview ─────────────────────────────────────────────────────
  section('TEST A — Preview mode (no DB writes)');
  const { status: pStatus, body: pr } = await callImport(adminToken, testBuf, 'test.xlsx', 'preview');

  console.log('\n  Response JSON:');
  console.log(JSON.stringify(pr, null, 2).replace(/^/gm, '    '));

  const sh = pr?.sheets?.[0];
  check('HTTP 201',                          pStatus === 201, pStatus);
  check('mode = "preview"',                  pr?.mode === 'preview', pr?.mode);
  check('totalRows >= 4',                    pr?.totalRows >= 4, pr?.totalRows);
  check('devicesCreated not in response',    pr?.devicesCreated === undefined, pr?.devicesCreated);

  const pvRows = sh?.preview ?? [];
  const r1 = pvRows.find(r => r.assetNumber === 'IFOCUS-TEST01');
  const r2 = pvRows.find(r => r.assetNumber === 'IFOCUS-TEST02');
  const r3 = pvRows.find(r => r.assetNumber === 'IFOCUS-TEST03');
  const r4 = pvRows.find(r => r.assetNumber === 'IFOCUS-TEST04');

  check('Row1 Instock → AVAILABLE',         r1?.status === 'AVAILABLE', r1?.status);
  check('Row2 Dead    → RETIRED',            r2?.status === 'RETIRED',   r2?.status);
  check('Row3 Instock → AVAILABLE',         r3?.status === 'AVAILABLE', r3?.status);
  check('Row4 INSTOCK(damage) → AVAILABLE', r4?.status === 'AVAILABLE', r4?.status);

  // ── TEST B — Commit ──────────────────────────────────────────────────────
  section('TEST B — Commit mode (writes to DB)');
  const { status: cStatus, body: cr } = await callImport(adminToken, testBuf, 'test.xlsx', 'commit');

  console.log('\n  Response JSON:');
  console.log(JSON.stringify(cr, null, 2).replace(/^/gm, '    '));

  const totalProcessed = (cr?.devicesCreated ?? 0) + (cr?.devicesUpdated ?? 0);
  check('HTTP 201',                              cStatus === 201, cStatus);
  check('mode = "commit"',                       cr?.mode === 'commit', cr?.mode);
  check('4 total processed (create or update)',  totalProcessed === 4, totalProcessed);
  check('devicesSkipped = 0',                    cr?.devicesSkipped === 0, cr?.devicesSkipped);
  console.log(`  → devicesCreated=${cr?.devicesCreated}, devicesUpdated=${cr?.devicesUpdated}`);

  // Verify in GET /devices
  const devRes = await fetch(`${API}/devices?q=IFOCUS-TEST&limit=20`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const devData = await devRes.json();
  const importedDevices = (devData?.data ?? []).filter(d =>
    ['IFOCUS-TEST01','IFOCUS-TEST02','IFOCUS-TEST03','IFOCUS-TEST04'].includes(d.assetNumber)
  );
  check('GET /devices returns all 4 imported', importedDevices.length === 4, importedDevices.length);

  // AuditLog check via admin notifications (indirect)
  console.log('\n  [AuditLog entries will be verified directly in Verification 5 DB query]');

  // ── TEST C — Idempotency ─────────────────────────────────────────────────
  section('TEST C — Idempotency (same file, commit again)');
  const { body: ir } = await callImport(adminToken, testBuf, 'test.xlsx', 'commit');

  console.log('\n  Response JSON:');
  console.log(JSON.stringify(ir, null, 2).replace(/^/gm, '    '));

  check('devicesCreated = 0', ir?.devicesCreated === 0, ir?.devicesCreated);
  check('devicesUpdated = 4', ir?.devicesUpdated === 4, ir?.devicesUpdated);

  const devRes2 = await fetch(`${API}/devices?q=IFOCUS-TEST&limit=20`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const devData2 = await devRes2.json();
  const testDevices2 = (devData2?.data ?? []).filter(d =>
    ['IFOCUS-TEST01','IFOCUS-TEST02','IFOCUS-TEST03','IFOCUS-TEST04'].includes(d.assetNumber)
  );
  check('No duplicates: still exactly 4 test devices', testDevices2.length === 4, testDevices2.length);

  // ── TEST D — Auth boundary ───────────────────────────────────────────────
  section('TEST D — Auth boundary (EMPLOYEE → 403)');
  const { status: dStatus, body: db } = await callImport(employeeToken, testBuf, 'test.xlsx', 'preview');
  console.log(`\n  Response: ${dStatus} — ${JSON.stringify(db)}`);
  check('Returns 403 Forbidden', dStatus === 403, dStatus);

  // ── TEST E — Invalid file type ───────────────────────────────────────────
  section('TEST E — Invalid file type (.pdf → 400)');
  const fakePdf = Buffer.from('%PDF-1.4 fake pdf content here');
  const { status: eStatus, body: eb } = await callImport(adminToken, fakePdf, 'document.pdf', 'preview');
  console.log(`\n  Response: ${eStatus} — ${JSON.stringify(eb)}`);
  check('Returns 400 Bad Request', eStatus === 400, eStatus);
  check('Error message mentions xlsx',
    typeof eb?.message === 'string' && eb.message.toLowerCase().includes('xlsx'),
    eb?.message
  );

  // ── TEST F — RAM expression stored as-is ────────────────────────────────
  section('TEST F — RAM expression stored as raw string');
  const fRes = await fetch(`${API}/devices?q=IFOCUS-TEST03&limit=10`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const fData = await fRes.json();
  const test03 = (fData?.data ?? []).find(d => d.assetNumber === 'IFOCUS-TEST03');
  console.log(`\n  IFOCUS-TEST03.ram  = ${JSON.stringify(test03?.ram)}`);
  check('ram = "8*8=16GB" stored as-is (no arithmetic)',
    test03?.ram === '8*8=16GB', test03?.ram);

  // Check damage note in remarks
  const fRes4 = await fetch(`${API}/devices?q=IFOCUS-TEST04&limit=10`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const fData4 = await fRes4.json();
  const test04 = (fData4?.data ?? []).find(d => d.assetNumber === 'IFOCUS-TEST04');
  console.log(`  IFOCUS-TEST04.remarks = ${JSON.stringify(test04?.remarks)}`);
  check('"Hinges damage" note captured in remarks',
    typeof test04?.remarks === 'string' &&
    (test04.remarks.toLowerCase().includes('hinge') || test04.remarks.toLowerCase().includes('damage')),
    test04?.remarks
  );

  // ── VERIFICATION 3 — Real file ───────────────────────────────────────────
  if (realFilePath) {
    section(`VERIFICATION 3 — Real file: ${realFilePath.split(/[\\/]/).pop()}`);
    let realBuf;
    try {
      realBuf = readFileSync(realFilePath);
      console.log(`  File size: ${(realBuf.length / 1024).toFixed(1)} KB`);
    } catch (e) {
      console.log(`  ❌ Cannot read: ${e.message}`);
      realBuf = null;
    }

    if (realBuf) {
      const fname = realFilePath.split(/[\\/]/).pop();

      console.log('\n  → Preview…');
      const { body: rp } = await callImport(adminToken, realBuf, fname, 'preview');

      if (rp?.sheets) {
        console.log(`\n  Total rows across all sheets: ${rp.totalRows}`);
        for (const s of rp.sheets) {
          console.log(`\n  Sheet: "${s.name}"`);
          console.log(`    Rows found:   ${s.rowsFound}`);
          console.log(`    Will create:  ${s.rowsValid}`);
          console.log(`    Will update:  ${s.rowsSkipped}`);
          console.log(`    Errors:       ${s.rowsErrored}`);
          if (s.errors.length > 0) {
            console.log('    Error detail:');
            s.errors.forEach(e => console.log(`      Row ${e.row} [${e.field}]: ${e.message}`));
          }
        }

        // Spot-check specific rows
        const allPreview = rp.sheets.flatMap(s => s.preview ?? []);
        const lt03 = allPreview.find(r => r.assetNumber === 'IFOCUS-LT03');
        const rent100 = allPreview.find(r =>
          r.assetNumber === 'Rent 100' || String(r.assetNumber ?? '').includes('100')
        );

        console.log('\n  Spot checks on preview rows:');
        if (lt03) {
          console.log(`  IFOCUS-LT03: assignedToName=${lt03.assignedToName}, makeModel=${lt03.makeModel}`);
          check('IFOCUS-LT03 found in preview', true, 'present');
        } else {
          console.log('  IFOCUS-LT03: not in first-10 preview (it will still be imported)');
        }
        if (rent100) {
          console.log(`  Rent 100: assetCategory=${rent100.assetCategory}, status=${rent100.status}`);
        }

        if (doCommit) {
          console.log('\n  → Commit…');
          const { body: rc } = await callImport(adminToken, realBuf, fname, 'commit');
          console.log(`\n  devicesCreated: ${rc?.devicesCreated}`);
          console.log(`  devicesUpdated: ${rc?.devicesUpdated}`);
          console.log(`  devicesSkipped: ${rc?.devicesSkipped}`);
          if (rc?.sheets) {
            for (const s of rc.sheets) {
              if (s.errors.length > 0) {
                console.log(`\n  Errors in "${s.name}":`);
                s.errors.forEach(e => console.log(`    Row ${e.row}: ${e.message}`));
              }
            }
          }

          // Idempotency
          console.log('\n  → Commit again (idempotency)…');
          const { body: ri } = await callImport(adminToken, realBuf, fname, 'commit');
          console.log(`  devicesCreated: ${ri?.devicesCreated} (expect 0)`);
          console.log(`  devicesUpdated: ${ri?.devicesUpdated} (expect = first commit total)`);
          check('Idempotency: 0 new devices on re-run', ri?.devicesCreated === 0, ri?.devicesCreated);
        } else {
          console.log('\n  → Preview only. Add --commit flag to write to DB.');
          console.log('    node scripts/verify-import.mjs "path/to/file.xlsx" --commit');
        }
      } else {
        console.log('  ❌ Unexpected response:', JSON.stringify(rp).slice(0, 500));
      }
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(65)}`);
  console.log(`  FINAL: ${passed} passed, ${failed} failed`);
  if (failed === 0) console.log('  ✅ ALL TESTS PASSED');
  else              console.log('  ❌ FAILURES — see above');
  console.log('═'.repeat(65));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('\nFatal:', e.message); process.exit(1); });
