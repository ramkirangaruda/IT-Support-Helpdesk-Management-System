/**
 * Import devices from a CSV into the asset register.
 *
 * CSV columns (header required): type,makeModel,serialNumber,status,condition,purchasedOn,cost
 *   - status     optional, one of AVAILABLE|ALLOCATED|IN_REPAIR|RETIRED (default AVAILABLE)
 *   - condition  optional free text
 *   - purchasedOn optional ISO date (YYYY-MM-DD)
 *   - cost       optional decimal
 *
 *   Dry run:  ts-node scripts/import/import-devices.ts --file=devices.csv
 *   Commit:   ts-node scripts/import/import-devices.ts --file=devices.csv --commit
 *
 * Behaviour:
 *   - Dedupe by serialNumber (unique). Existing serial → skip (devices are not updated here).
 *   - Device id is generated as DEV-<TYPE_SLUG>-NNNNNN, matching DevicesService.
 *   - Any malformed row aborts the COMMIT entirely (no partial import).
 */
import { DeviceStatus, Prisma, PrismaClient } from '@prisma/client';
import { CsvRow, ImportReport, parseArgs, readCsvFile } from './csv-utils';

const prisma = new PrismaClient();
const VALID_STATUS = new Set(Object.values(DeviceStatus));

interface DeviceRow {
  type: string; makeModel: string; serialNumber: string;
  status: DeviceStatus; condition: string | null;
  purchasedOn: Date | null; cost: string | null;
}

function validate(row: CsvRow, line: number, report: ImportReport, seen: Set<string>): DeviceRow | null {
  const key = row['serialNumber'] || `(line ${line})`;
  for (const c of ['type', 'makeModel', 'serialNumber'] as const) {
    if (!row[c] || row[c].trim() === '') {
      report.record({ line, status: 'error', key, message: `missing required column: ${c}` });
      return null;
    }
  }
  if (seen.has(row['serialNumber'])) {
    report.record({ line, status: 'error', key, message: 'duplicate serialNumber within file' });
    return null;
  }
  seen.add(row['serialNumber']);

  const status = (row['status'] || 'AVAILABLE').toUpperCase() as DeviceStatus;
  if (!VALID_STATUS.has(status)) {
    report.record({ line, status: 'error', key, message: `invalid status: ${row['status']} (expected ${[...VALID_STATUS].join('|')})` });
    return null;
  }

  let purchasedOn: Date | null = null;
  if (row['purchasedOn']) {
    const d = new Date(row['purchasedOn']);
    if (isNaN(d.getTime())) {
      report.record({ line, status: 'error', key, message: `invalid purchasedOn date: ${row['purchasedOn']}` });
      return null;
    }
    purchasedOn = d;
  }
  if (row['cost'] && isNaN(Number(row['cost']))) {
    report.record({ line, status: 'error', key, message: `invalid cost: ${row['cost']}` });
    return null;
  }

  return {
    type: row['type'], makeModel: row['makeModel'], serialNumber: row['serialNumber'],
    status, condition: row['condition'] || null, purchasedOn,
    cost: row['cost'] ? row['cost'] : null,
  };
}

// Mirror of DevicesService.generateDeviceId, but counter is advanced in-memory
// across the batch so a single commit run does not collide with itself.
const slugOf = (type: string) => type.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 10);
const seqCache = new Map<string, number>();

async function nextDeviceId(type: string): Promise<string> {
  const prefix = `DEV-${slugOf(type)}-`;
  if (!seqCache.has(prefix)) {
    const last = await prisma.device.findFirst({
      where: { id: { startsWith: prefix } }, orderBy: { id: 'desc' }, select: { id: true },
    });
    seqCache.set(prefix, last ? parseInt(last.id.slice(prefix.length), 10) : 0);
  }
  const next = seqCache.get(prefix)! + 1;
  seqCache.set(prefix, next);
  return `${prefix}${String(next).padStart(6, '0')}`;
}

async function main() {
  const { file, commit } = parseArgs(process.argv);
  const report = new ImportReport('devices');
  const rows = readCsvFile(file);
  console.log(`Read ${rows.length} data row(s) from ${file}`);

  const seen = new Set<string>();
  const planned: { row: DeviceRow; line: number }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const line = i + 1;
    const parsed = validate(rows[i], line, report, seen);
    if (!parsed) continue;
    const existing = await prisma.device.findUnique({ where: { serialNumber: parsed.serialNumber }, select: { id: true } });
    if (existing) {
      report.record({ line, status: 'skip', key: parsed.serialNumber, message: `serial already registered as ${existing.id}` });
      continue;
    }
    planned.push({ row: parsed, line });
    report.record({ line, status: 'create', key: parsed.serialNumber, message: `new ${parsed.type}` });
  }

  if (commit && report.hasErrors()) {
    report.printSummary(commit);
    console.error('\nABORTED: fix the row errors above before committing. No rows were written.');
    console.log(`Audit log: ${report.writeLog()}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  if (commit) {
    for (const p of planned) {
      const id = await nextDeviceId(p.row.type);
      await prisma.device.create({
        data: {
          id,
          type: p.row.type, makeModel: p.row.makeModel, serialNumber: p.row.serialNumber,
          status: p.row.status, condition: p.row.condition, purchasedOn: p.row.purchasedOn,
          cost: p.row.cost !== null ? new Prisma.Decimal(p.row.cost) : null,
        },
      });
    }
    console.log(`\nCommitted ${planned.length} device(s).`);
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
