"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EMAIL_RE = exports.ImportReport = void 0;
exports.parseCsv = parseCsv;
exports.readCsvFile = readCsvFile;
exports.parseArgs = parseArgs;
const fs = require("node:fs");
const path = require("node:path");
function parseCsv(content) {
    const records = [];
    let field = '';
    let row = [];
    let inQuotes = false;
    const pushField = () => { row.push(field); field = ''; };
    const pushRow = () => { records.push(row); row = []; };
    for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        if (inQuotes) {
            if (ch === '"') {
                if (content[i + 1] === '"') {
                    field += '"';
                    i++;
                }
                else
                    inQuotes = false;
            }
            else
                field += ch;
        }
        else if (ch === '"') {
            inQuotes = true;
        }
        else if (ch === ',') {
            pushField();
        }
        else if (ch === '\n') {
            pushField();
            pushRow();
        }
        else if (ch === '\r') {
            if (content[i + 1] !== '\n') {
                pushField();
                pushRow();
            }
        }
        else {
            field += ch;
        }
    }
    if (field.length > 0 || row.length > 0) {
        pushField();
        pushRow();
    }
    const nonEmpty = records.filter(r => r.some(c => c.trim() !== ''));
    if (nonEmpty.length === 0)
        return [];
    const header = nonEmpty[0].map(h => h.trim());
    return nonEmpty.slice(1).map(cols => {
        const obj = {};
        header.forEach((h, idx) => { obj[h] = (cols[idx] ?? '').trim(); });
        return obj;
    });
}
function readCsvFile(file) {
    const abs = path.resolve(file);
    if (!fs.existsSync(abs))
        throw new Error(`CSV file not found: ${abs}`);
    return parseCsv(fs.readFileSync(abs, 'utf8'));
}
class ImportReport {
    constructor(importer) {
        this.importer = importer;
        this.outcomes = [];
    }
    record(o) { this.outcomes.push(o); }
    counts() {
        return this.outcomes.reduce((acc, o) => { acc[o.status]++; return acc; }, { create: 0, update: 0, skip: 0, error: 0 });
    }
    hasErrors() { return this.outcomes.some(o => o.status === 'error'); }
    printSummary(commit) {
        const c = this.counts();
        console.log('\n──────── Import report ────────');
        console.log(`  mode:            ${commit ? 'COMMIT' : 'DRY-RUN (no writes)'}`);
        console.log(`  would create:    ${c.create}`);
        console.log(`  would update:    ${c.update}`);
        console.log(`  skip duplicates: ${c.skip}`);
        console.log(`  rows w/ errors:  ${c.error}`);
        if (this.hasErrors()) {
            console.log('\n  Errors:');
            for (const o of this.outcomes.filter(x => x.status === 'error'))
                console.log(`    line ${o.line} [${o.key || '?'}]: ${o.message}`);
        }
    }
    writeLog() {
        const dir = path.resolve(__dirname, 'logs');
        fs.mkdirSync(dir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const file = path.join(dir, `${this.importer}-${stamp}.log`);
        const lines = this.outcomes.map(o => `line=${o.line}\tstatus=${o.status}\tkey=${o.key}\t${o.message}`);
        fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
        return file;
    }
}
exports.ImportReport = ImportReport;
function parseArgs(argv) {
    let file = '';
    let commit = false;
    for (const a of argv.slice(2)) {
        if (a === '--commit')
            commit = true;
        else if (a.startsWith('--file='))
            file = a.slice('--file='.length);
        else if (!a.startsWith('--'))
            file = a;
    }
    if (!file) {
        console.error('Usage: ts-node <importer>.ts --file=<path.csv> [--commit]');
        process.exit(1);
    }
    return { file, commit };
}
exports.EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
//# sourceMappingURL=csv-utils.js.map