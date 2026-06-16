/**
 * Import / upsert employees from a CSV.
 *
 * CSV columns (header required): name,email,department,ssoSubject
 *
 *   Dry run:  ts-node scripts/import/import-employees.ts --file=employees.csv
 *   Commit:   ts-node scripts/import/import-employees.ts --file=employees.csv --commit
 *
 * Behaviour:
 *   - Upserts by email. Existing user → update (name/department) = "update".
 *   - Assigns the EMPLOYEE role (additive; never removes existing roles).
 *   - Any malformed row aborts the COMMIT entirely (no partial import).
 */
import { PrismaClient, RoleName } from '@prisma/client';
import { CsvRow, EMAIL_RE, ImportReport, parseArgs, readCsvFile } from './csv-utils';

const prisma = new PrismaClient();
const REQUIRED = ['name', 'email', 'department', 'ssoSubject'] as const;

interface EmployeeRow { name: string; email: string; department: string; ssoSubject: string; }

function validate(row: CsvRow, line: number, report: ImportReport, seenEmails: Set<string>): EmployeeRow | null {
  const key = row['email'] || `(line ${line})`;
  const missing = REQUIRED.filter(c => !row[c] || row[c].trim() === '');
  if (missing.length) {
    report.record({ line, status: 'error', key, message: `missing column(s): ${missing.join(', ')}` });
    return null;
  }
  if (!EMAIL_RE.test(row['email'])) {
    report.record({ line, status: 'error', key, message: `invalid email: ${row['email']}` });
    return null;
  }
  if (seenEmails.has(row['email'].toLowerCase())) {
    report.record({ line, status: 'error', key, message: `duplicate email within file` });
    return null;
  }
  seenEmails.add(row['email'].toLowerCase());
  return {
    name: row['name'], email: row['email'],
    department: row['department'], ssoSubject: row['ssoSubject'],
  };
}

async function main() {
  const { file, commit } = parseArgs(process.argv);
  const report = new ImportReport('employees');
  const rows = readCsvFile(file);
  console.log(`Read ${rows.length} data row(s) from ${file}`);

  // ── Pass 1: validate everything, decide create vs update vs skip ────────────
  const seen = new Set<string>();
  const planned: { row: EmployeeRow; line: number; isUpdate: boolean }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const line = i + 1;
    const parsed = validate(rows[i], line, report, seen);
    if (!parsed) continue;
    const existing = await prisma.user.findUnique({ where: { email: parsed.email }, select: { id: true } });
    planned.push({ row: parsed, line, isUpdate: !!existing });
    report.record({
      line, key: parsed.email,
      status: existing ? 'update' : 'create',
      message: existing ? 'existing user — will update + ensure EMPLOYEE role' : 'new user',
    });
  }

  // ── Abort commit if any row is malformed ────────────────────────────────────
  if (commit && report.hasErrors()) {
    report.printSummary(commit);
    console.error('\nABORTED: fix the row errors above before committing. No rows were written.');
    console.log(`Audit log: ${report.writeLog()}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // ── Pass 2: write (only with --commit) ──────────────────────────────────────
  if (commit) {
    const employeeRole = await prisma.role.findUnique({ where: { name: RoleName.EMPLOYEE } });
    if (!employeeRole) throw new Error('EMPLOYEE role missing — run the seed first');

    for (const p of planned) {
      const user = await prisma.user.upsert({
        where: { email: p.row.email },
        update: { name: p.row.name, department: p.row.department },
        create: {
          email: p.row.email, name: p.row.name,
          department: p.row.department, ssoSubject: p.row.ssoSubject,
        },
      });
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: employeeRole.id } },
        update: {},
        create: { userId: user.id, roleId: employeeRole.id },
      });
    }
    console.log(`\nCommitted ${planned.length} user(s).`);
  }

  report.printSummary(commit);
  console.log(`Audit log: ${report.writeLog()}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('Import failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
