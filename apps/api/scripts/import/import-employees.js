"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("@prisma/client");
const csv_utils_1 = require("./csv-utils");
const prisma = new client_1.PrismaClient();
const REQUIRED = ['name', 'email', 'department', 'ssoSubject'];
function validate(row, line, report, seenEmails) {
    const key = row['email'] || `(line ${line})`;
    const missing = REQUIRED.filter(c => !row[c] || row[c].trim() === '');
    if (missing.length) {
        report.record({ line, status: 'error', key, message: `missing column(s): ${missing.join(', ')}` });
        return null;
    }
    if (!csv_utils_1.EMAIL_RE.test(row['email'])) {
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
    const { file, commit } = (0, csv_utils_1.parseArgs)(process.argv);
    const report = new csv_utils_1.ImportReport('employees');
    const rows = (0, csv_utils_1.readCsvFile)(file);
    console.log(`Read ${rows.length} data row(s) from ${file}`);
    const seen = new Set();
    const planned = [];
    for (let i = 0; i < rows.length; i++) {
        const line = i + 1;
        const parsed = validate(rows[i], line, report, seen);
        if (!parsed)
            continue;
        const existing = await prisma.user.findUnique({ where: { email: parsed.email }, select: { id: true } });
        planned.push({ row: parsed, line, isUpdate: !!existing });
        report.record({
            line, key: parsed.email,
            status: existing ? 'update' : 'create',
            message: existing ? 'existing user — will update + ensure EMPLOYEE role' : 'new user',
        });
    }
    if (commit && report.hasErrors()) {
        report.printSummary(commit);
        console.error('\nABORTED: fix the row errors above before committing. No rows were written.');
        console.log(`Audit log: ${report.writeLog()}`);
        await prisma.$disconnect();
        process.exit(1);
    }
    if (commit) {
        const employeeRole = await prisma.role.findUnique({ where: { name: client_1.RoleName.EMPLOYEE } });
        if (!employeeRole)
            throw new Error('EMPLOYEE role missing — run the seed first');
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
//# sourceMappingURL=import-employees.js.map