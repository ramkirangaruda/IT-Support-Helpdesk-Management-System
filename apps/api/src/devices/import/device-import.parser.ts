import * as XLSX from 'xlsx';
import { DeviceStatus } from '@prisma/client';
import { ParsedDeviceRow } from './device-import.types';

export interface SheetParseResult {
  sheetName: string;
  rows: ParsedDeviceRow[];
  blankRowsSkipped: number;
}

export class DeviceImportParser {
  parse(buffer: Buffer): SheetParseResult[] {
    const workbook = XLSX.read(buffer, { type: 'buffer', raw: true });
    return workbook.SheetNames.map(name =>
      this.parseSheet(name, workbook.Sheets[name]),
    );
  }

  // ─── Sheet dispatch ────────────────────────────────────────────────────────

  private parseSheet(sheetName: string, sheet: XLSX.WorkSheet): SheetParseResult {
    const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: '',
    });

    if (rawRows.length === 0) {
      return { sheetName, rows: [], blankRowsSkipped: 0 };
    }

    const headerIdx = this.findHeaderRow(rawRows, sheetName);
    if (headerIdx === -1) {
      return { sheetName, rows: [], blankRowsSkipped: 0 };
    }

    const headers = (rawRows[headerIdx] as unknown[]).map(h =>
      String(h ?? '').trim().toLowerCase(),
    );

    const isRented = sheetName.toLowerCase().includes('rent');
    const rows: ParsedDeviceRow[] = [];
    let blankRowsSkipped = 0;

    for (let i = headerIdx + 1; i < rawRows.length; i++) {
      const raw = rawRows[i] as unknown[];
      if (this.isBlankRow(raw)) { blankRowsSkipped++; continue; }

      const parsed = isRented
        ? this.parseRentedRow(raw, headers, i + 1, sheetName)
        : this.parseLaptopRow(raw, headers, i + 1, sheetName);

      if (parsed) rows.push(parsed);
      else blankRowsSkipped++;
    }

    return { sheetName, rows, blankRowsSkipped };
  }

  // ─── Header detection ──────────────────────────────────────────────────────

  private findHeaderRow(raw: unknown[][], sheetName: string): number {
    const isRented = sheetName.toLowerCase().includes('rent');
    const anchors = isRented
      ? ['asset id', 'asset type', 'service tag']
      : ['asset number', 'service tag', 'ram'];

    for (let i = 0; i < Math.min(raw.length, 12); i++) {
      const row = raw[i] as unknown[];
      const rowLower = row.map(c => String(c ?? '').trim().toLowerCase());
      const hits = anchors.filter(a => rowLower.some(h => h.includes(a))).length;
      if (hits >= 2) return i;
    }
    // fallback: first row with ≥ 5 non-empty cells
    for (let i = 0; i < Math.min(raw.length, 10); i++) {
      const row = raw[i] as unknown[];
      if (row.filter(c => c !== '' && c !== null && c !== undefined).length >= 5) return i;
    }
    return 0;
  }

  // ─── Column helpers ────────────────────────────────────────────────────────

  private col(row: unknown[], headers: string[], ...candidates: string[]): string {
    for (const c of candidates) {
      const lc = c.toLowerCase();
      const idx = headers.findIndex(h => h === lc || h.includes(lc));
      if (idx !== -1 && idx < row.length) {
        return String(row[idx] ?? '').trim();
      }
    }
    return '';
  }

  private rawCell(row: unknown[], headers: string[], ...candidates: string[]): unknown {
    for (const c of candidates) {
      const lc = c.toLowerCase();
      const idx = headers.findIndex(h => h === lc || h.includes(lc));
      if (idx !== -1 && idx < row.length) return row[idx];
    }
    return undefined;
  }

  private parseDate(val: unknown): Date | undefined {
    if (val === null || val === undefined || val === '') return undefined;
    if (val instanceof Date) return isNaN(val.getTime()) ? undefined : val;
    const n = Number(val);
    if (!isNaN(n) && n > 1000) {
      // Excel serial: days since Dec 30 1899
      return new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    }
    const d = new Date(String(val));
    return isNaN(d.getTime()) ? undefined : d;
  }

  private isBlankRow(row: unknown[]): boolean {
    return !row.some(c => c !== '' && c !== null && c !== undefined);
  }

  // ─── Status normalisation ──────────────────────────────────────────────────

  private classifyStatus(raw: string): {
    status: DeviceStatus;
    isProjectName: boolean;
    remarkNote?: string;
  } {
    const s = raw.trim().toLowerCase();
    if (!s) return { status: DeviceStatus.AVAILABLE, isProjectName: false };

    if (s.startsWith('instock') || s.startsWith('in stock')) {
      const note = raw.match(/\(([^)]+)\)/)?.[1];
      return { status: DeviceStatus.AVAILABLE, isProjectName: false, remarkNote: note };
    }
    if (s.startsWith('dead') || s === 'dead lt') {
      return { status: DeviceStatus.RETIRED, isProjectName: false };
    }
    if (s === 'bench' || s === 'vacant') {
      return { status: DeviceStatus.AVAILABLE, isProjectName: false };
    }
    if (s === 'assigned') {
      return { status: DeviceStatus.ALLOCATED, isProjectName: false };
    }
    // Any other value is treated as a project/department name → ALLOCATED
    return { status: DeviceStatus.ALLOCATED, isProjectName: true };
  }

  // ─── Type inference ────────────────────────────────────────────────────────

  private inferType(hint: string): string {
    const h = (hint ?? '').toLowerCase();
    if (h.includes('macbook') || h.includes('mac book')) return 'MacBook';
    if (h.includes('monitor') || h.includes('display')) return 'Monitor';
    if (h.includes('desktop')) return 'Desktop';
    if (h.includes('phone') || h.includes('mobile')) return 'Phone';
    if (h.includes('tablet') || h.includes('ipad')) return 'Tablet';
    if (h.includes('keyboard')) return 'Keyboard';
    if (h.includes('mouse')) return 'Mouse';
    if (h.includes('headset') || h.includes('headphone')) return 'Headset';
    return 'Laptop';
  }

  // ─── Laptop Inventory sheet ────────────────────────────────────────────────

  private parseLaptopRow(
    row: unknown[],
    headers: string[],
    rowIndex: number,
    sheetName: string,
  ): ParsedDeviceRow | null {
    const g = (...c: string[]) => this.col(row, headers, ...c);

    const assetNumber    = g('asset number', 'asset no', 'asset #');
    const serialNumber   = g('service tag', 'serial number', 'serial no');
    const assignedToName = g('user name/type', 'user name', 'username', 'user');
    const makeModel      = g('model', 'asset model', 'make/model', 'make model', 'laptop model');
    const statusRaw      = g('status');
    const cpu            = g('cpu', 'processor', 'cpu (processor)');
    const ram            = g('ram', 'memory', 'ram (gb)');
    const storage        = g('hdd', 'ssd', 'storage', 'hdd/ssd', 'disk');
    const macAddress     = g('mac', 'mac address', 'mac id', 'mac add');
    const osVersion      = g('windows version', 'os version', 'windows', 'operating system');
    const osKey          = g('windows key', 'windows product key', 'os key', 'win key');
    const antiVirus      = g('anti-virus name', 'antivirus', 'anti virus', 'av');
    const officeVersion  = g('ms office version', 'office version', 'ms office', 'office');
    const officeKey      = g('ms office key', 'office key', 'office product key');
    const assetCategory  = g('asset category', 'category');
    const remarksRaw     = g('remarks', 'notes', 'comment');

    if (!assetNumber && !serialNumber && !makeModel && !assignedToName) return null;

    const { status, isProjectName, remarkNote } = this.classifyStatus(statusRaw);
    const remarkParts = [remarksRaw, remarkNote ? `Damage: ${remarkNote}` : ''].filter(Boolean);
    const remarks = remarkParts.join('; ') || undefined;

    const type = this.inferType(assetCategory || makeModel);

    return {
      rowIndex,
      assetNumber:      assetNumber || undefined,
      type,
      makeModel:        makeModel || undefined,
      serialNumber:     serialNumber || undefined,
      status,
      cpu:              cpu || undefined,
      ram:              ram || undefined,
      storage:          storage || undefined,
      macAddress:       macAddress || undefined,
      osVersion:        osVersion || undefined,
      osKey:            osKey || undefined,
      antiVirus:        antiVirus || undefined,
      officeVersion:    officeVersion || undefined,
      officeKey:        officeKey || undefined,
      assignedToName:   assignedToName || undefined,
      assignedToProject: isProjectName ? statusRaw.trim() : undefined,
      assetCategory:    assetCategory || undefined,
      remarks,
      _sheetName:       sheetName,
    };
  }

  // ─── Rented Asset Inventory sheet ─────────────────────────────────────────

  private parseRentedRow(
    row: unknown[],
    headers: string[],
    rowIndex: number,
    sheetName: string,
  ): ParsedDeviceRow | null {
    const g = (...c: string[]) => this.col(row, headers, ...c);

    const assetNumber      = g('asset id', 'asset number', 'asset no');
    const assetType        = g('asset type');
    const assetMake        = g('asset make', 'make');
    const makeModel        = [assetMake, assetType].filter(Boolean).join(' ') || undefined;
    const serialNumber     = g('service tag', 'serial number', 'serial no');
    const rentedFrom       = g('tech connective', 'rental vendor', 'vendor', 'rented from', 'company');
    const statusRaw        = g('rental status', 'status');
    const assignedToName   = g('current user', 'user name', 'user', 'username');
    const assignedToProject = g('project', 'department', 'dept');
    const cpu              = g('cpu', 'processor');
    const ram              = g('ram', 'memory');
    const storage          = g('hdd', 'ssd', 'storage', 'hdd/ssd');
    const macAddress       = g('mac', 'mac address', 'mac id');
    const osVersion        = g('windows version', 'os version', 'windows');
    const osKey            = g('windows key', 'os key', 'win key');
    const warranty         = g('warranty');
    const other            = g('other');

    if (!assetNumber && !serialNumber && !makeModel) return null;

    const { status, remarkNote } = this.classifyStatus(statusRaw);
    const remarkParts = [
      warranty  ? `Warranty: ${warranty}`   : '',
      other     ? other                       : '',
      remarkNote ? `Note: ${remarkNote}`      : '',
    ].filter(Boolean);
    const remarks = remarkParts.join('; ') || undefined;

    return {
      rowIndex,
      assetNumber:      assetNumber || undefined,
      type:             'Laptop',
      makeModel,
      serialNumber:     serialNumber || undefined,
      status,
      cpu:              cpu || undefined,
      ram:              ram || undefined,
      storage:          storage || undefined,
      macAddress:       macAddress || undefined,
      osVersion:        osVersion || undefined,
      osKey:            osKey || undefined,
      assignedToName:   assignedToName || undefined,
      assignedToProject: assignedToProject || undefined,
      assetCategory:    'Rented',
      rentedFrom:       rentedFrom || undefined,
      rentedDate:       this.parseDate(this.rawCell(row, headers, 'rented date', 'rent date', 'date')),
      returnedDate:     this.parseDate(this.rawCell(row, headers, 'returned date', 'return date')),
      remarks,
      _sheetName:       sheetName,
    };
  }
}
