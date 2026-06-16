/**
 * Shared CSV import utilities — dependency-free so the importers run under
 * `ts-node` with no extra install.
 *
 * Pattern for all importers in this folder:
 *   1. Parse the CSV (header row → object keys).
 *   2. Validate EVERY row first, collecting all errors before any DB write.
 *   3. Print a dry-run report (would-create / would-skip-duplicate / errors).
 *   4. Only write when invoked with --commit; abort the commit if any row is
 *      malformed (no partial imports), but treat existing rows as skips.
 *   5. Write a per-row audit log file to scripts/import/logs/.
 *
 * To add a new importer (e.g. import-tickets.ts), copy import-devices.ts and
 * swap the row type, validation, dedupe key, and create call.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

export type CsvRow = Record<string, string>;

/**
 * Minimal RFC-4180-ish parser: handles quoted fields, escaped quotes (""),
 * commas and newlines inside quotes, and CRLF/LF line endings. The first
 * non-empty line is treated as the header.
 */
export function parseCsv(content: string): CsvRow[] {
  const records: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { records.push(row); row = []; };

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      pushField();
    } else if (ch === '\n') {
      pushField(); pushRow();
    } else if (ch === '\r') {
      // swallow — handled by the following \n (or treat lone \r as line end)
      if (content[i + 1] !== '\n') { pushField(); pushRow(); }
    } else {
      field += ch;
    }
  }
  // flush trailing field/row if the file does not end with a newline
  if (field.length > 0 || row.length > 0) { pushField(); pushRow(); }

  // Drop fully empty trailing rows
  const nonEmpty = records.filter(r => r.some(c => c.trim() !== ''));
  if (nonEmpty.length === 0) return [];

  const header = nonEmpty[0].map(h => h.trim());
  return nonEmpty.slice(1).map(cols => {
    const obj: CsvRow = {};
    header.forEach((h, idx) => { obj[h] = (cols[idx] ?? '').trim(); });
    return obj;
  });
}

export function readCsvFile(file: string): CsvRow[] {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) throw new Error(`CSV file not found: ${abs}`);
  return parseCsv(fs.readFileSync(abs, 'utf8'));
}

export type OutcomeStatus = 'create' | 'update' | 'skip' | 'error';

export interface RowOutcome {
  line: number;          // 1-based data row number (excludes header)
  status: OutcomeStatus;
  key: string;           // natural key (email / serialNumber) for traceability
  message: string;
}

export class ImportReport {
  readonly outcomes: RowOutcome[] = [];
  constructor(private readonly importer: string) {}

  record(o: RowOutcome) { this.outcomes.push(o); }

  counts() {
    return this.outcomes.reduce(
      (acc, o) => { acc[o.status]++; return acc; },
      { create: 0, update: 0, skip: 0, error: 0 },
    );
  }

  hasErrors() { return this.outcomes.some(o => o.status === 'error'); }

  printSummary(commit: boolean) {
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

  /** Persist a timestamped per-row audit log; returns the file path. */
  writeLog(): string {
    const dir = path.resolve(__dirname, 'logs');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = path.join(dir, `${this.importer}-${stamp}.log`);
    const lines = this.outcomes.map(
      o => `line=${o.line}\tstatus=${o.status}\tkey=${o.key}\t${o.message}`,
    );
    fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8');
    return file;
  }
}

export interface ImportArgs { file: string; commit: boolean; }

export function parseArgs(argv: string[]): ImportArgs {
  let file = '';
  let commit = false;
  for (const a of argv.slice(2)) {
    if (a === '--commit') commit = true;
    else if (a.startsWith('--file=')) file = a.slice('--file='.length);
    else if (!a.startsWith('--')) file = a; // allow positional path
  }
  if (!file) {
    console.error('Usage: ts-node <importer>.ts --file=<path.csv> [--commit]');
    process.exit(1);
  }
  return { file, commit };
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
