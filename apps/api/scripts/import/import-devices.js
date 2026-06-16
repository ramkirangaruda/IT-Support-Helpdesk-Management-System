"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const csv_utils_1 = require("./csv-utils");
const prisma = new client_1.PrismaClient();
const VALID_STATUS = new Set(Object.values(client_1.DeviceStatus));
function validate(row, line, report, seen) {
    const key = row['serialNumber'] || `(line ${line})`;
    for (const c of ['type', 'makeModel', 'serialNumber']) {
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
    const status = (row['status'] || 'AVAILABLE').toUpperCase();
    if (!VALID_STATUS.has(status)) {
        report.record({ line, status: 'error', key, message: `invalid status: ${row['status']} (expected ${[...VALID_STATUS].join('|')})` });
        return null;
    }
    let purchasedOn = null;
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
const slugOf = (type) => type.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 10);
const seqCache = new Map();
async function nextDeviceId(type) {
    const prefix = `DEV-${slugOf(type)}-`;
    if (!seqCache.has(prefix)) {
        const last = await prisma.device.findFirst({
            where: { id: { startsWith: prefix } }, orderBy: { id: 'desc' }, select: { id: true },
        });
        seqCache.set(prefix, last ? parseInt(last.id.slice(prefix.length), 10) : 0);
    }
    const next = seqCache.get(prefix) + 1;
    seqCache.set(prefix, next);
    return `${prefix}${String(next).padStart(6, '0')}`;
}
async function main() {
    const { file, commit } = (0, csv_utils_1.parseArgs)(process.argv);
    const report = new csv_utils_1.ImportReport('devices');
    const rows = (0, csv_utils_1.readCsvFile)(file);
    console.log(`Read ${rows.length} data row(s) from ${file}`);
    const seen = new Set();
    const planned = [];
    for (let i = 0; i < rows.length; i++) {
        const line = i + 1;
        const parsed = validate(rows[i], line, report, seen);
        if (!parsed)
            continue;
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
                    cost: p.row.cost !== null ? new client_1.Prisma.Decimal(p.row.cost) : null,
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
//# sourceMappingURL=import-devices.js.map