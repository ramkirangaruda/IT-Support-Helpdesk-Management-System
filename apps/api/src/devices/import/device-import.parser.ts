import * as XLSX from 'xlsx';
import { DeviceStatus } from '@prisma/client';
import { ParsedDeviceRow } from './device-import.types';

export interface SheetParseResult {
  sheetName: string;
  rows: ParsedDeviceRow[];
  blankRowsSkipped: number;
}

type SheetType = 'laptop' | 'rented' | 'smart' | 'tv';

export class DeviceImportParser {
  parse(buffer: Buffer): SheetParseResult[] {
    const workbook = XLSX.read(buffer, { type: 'buffer', raw: true });
    return workbook.SheetNames.map(name =>
      this.parseSheet(name, workbook.Sheets[name]),
    );
  }

  // ─── Sheet dispatch ────────────────────────────────────────────────────────

  private getSheetType(sheetName: string): SheetType {
    const n = sheetName.toLowerCase();
    if (n.includes('rent')) return 'rented';
    if (n.includes('smart') || n.includes('mobile')) return 'smart';
    if (n.includes('tv') || n.includes('television')) return 'tv';
    return 'laptop';
  }

  private parseSheet(sheetName: string, sheet: XLSX.WorkSheet): SheetParseResult {
    const rawRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: true,
      defval: '',
    });

    if (rawRows.length === 0) {
      return { sheetName, rows: [], blankRowsSkipped: 0 };
    }

    const sheetType = this.getSheetType(sheetName);
    const headerIdx = this.findHeaderRow(rawRows, sheetType);
    if (headerIdx === -1) {
      return { sheetName, rows: [], blankRowsSkipped: 0 };
    }

    const headers = (rawRows[headerIdx] as unknown[]).map(h =>
      String(h ?? '').trim().toLowerCase(),
    );

    const rows: ParsedDeviceRow[] = [];
    let blankRowsSkipped = 0;

    for (let i = headerIdx + 1; i < rawRows.length; i++) {
      const raw = rawRows[i] as unknown[];
      if (this.isBlankRow(raw)) { blankRowsSkipped++; continue; }

      let parsed: ParsedDeviceRow | null = null;
      switch (sheetType) {
        case 'rented': parsed = this.parseRentedRow(raw, headers, i + 1, sheetName); break;
        case 'smart':  parsed = this.parseSmartDeviceRow(raw, headers, i + 1, sheetName); break;
        case 'tv':     parsed = this.parseTVRow(raw, headers, i + 1, sheetName); break;
        default:       parsed = this.parseLaptopRow(raw, headers, i + 1, sheetName); break;
      }

      if (parsed) rows.push(parsed);
      else blankRowsSkipped++;
    }

    return { sheetName, rows, blankRowsSkipped };
  }

  // ─── Header detection ──────────────────────────────────────────────────────

  private findHeaderRow(raw: unknown[][], sheetType: SheetType): number {
    const anchorSets: Record<SheetType, string[][]> = {
      laptop: [['asset number', 'ram'], ['service tag', 'ram'], ['asset number', 'service tag']],
      rented: [['asset id', 'asset type'], ['asset id', 'service tag'], ['asset type', 'service tag']],
      smart:  [['asst id', 'asset status'], ['asst id', 'device'], ['asset status', 'project'], ['apple id', 'project']],
      tv:     [['asst id', 'asset status'], ['asst id', 'asset owner'], ['asst id', 'device']],
    };

    const sets = anchorSets[sheetType];
    for (let i = 0; i < Math.min(raw.length, 12); i++) {
      const rowLower = (raw[i] as unknown[]).map(c => String(c ?? '').trim().toLowerCase());
      for (const anchors of sets) {
        const hits = anchors.filter(a => rowLower.some(h => h === a || h.includes(a))).length;
        if (hits >= anchors.length) return i;
      }
    }
    // fallback: first row with ≥ 5 non-empty cells
    for (let i = 0; i < Math.min(raw.length, 10); i++) {
      const row = raw[i] as unknown[];
      if (row.filter(c => c !== '' && c !== null && c !== undefined).length >= 5) return i;
    }
    return 0;
  }

  // ─── Column helpers ────────────────────────────────────────────────────────

  /** Find first column whose header contains any of the candidates (substring match). */
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

  /** Exact-match header — useful when two columns share a substring (e.g. "status" vs "asset status"). */
  private exactCol(row: unknown[], headers: string[], name: string): string {
    const lc = name.toLowerCase();
    const idx = headers.findIndex(h => h === lc);
    if (idx !== -1 && idx < row.length) return String(row[idx] ?? '').trim();
    return '';
  }

  /** All non-empty values from columns whose header contains `contains`. */
  private allCols(row: unknown[], headers: string[], contains: string): string[] {
    const lc = contains.toLowerCase();
    const values: string[] = [];
    headers.forEach((h, i) => {
      if (h.includes(lc) && i < row.length) {
        const v = String(row[i] ?? '').trim();
        if (v) values.push(v);
      }
    });
    return values;
  }

  /** Find a column whose header looks like a display-size (contains `"` or `inch`). */
  private inchCol(row: unknown[], headers: string[]): string {
    const idx = headers.findIndex(h => /\d/.test(h) && (h.includes('"') || h.includes('inch')));
    if (idx !== -1 && idx < row.length) return String(row[idx] ?? '').trim();
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
      return new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    }
    const d = new Date(String(val));
    return isNaN(d.getTime()) ? undefined : d;
  }

  private isBlankRow(row: unknown[]): boolean {
    return !row.some(c => c !== '' && c !== null && c !== undefined);
  }

  // ─── Status normalisation — Laptop/Rented ─────────────────────────────────

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
    return { status: DeviceStatus.ALLOCATED, isProjectName: true };
  }

  // ─── Status normalisation — Smart Device / TV ─────────────────────────────

  private classifySmartStatus(raw: string): DeviceStatus {
    const s = raw.trim().toLowerCase();
    if (!s) return DeviceStatus.AVAILABLE;
    if (s === 'in use' || s === 'inuse') return DeviceStatus.ALLOCATED;
    if (s.startsWith('exchange') || s.startsWith('dead') || s.startsWith('retired') || s === 'retired') {
      return DeviceStatus.RETIRED;
    }
    // "inactive", "available", "idle", blank → AVAILABLE
    return DeviceStatus.AVAILABLE;
  }

  // ─── Category inference — Smart Device ────────────────────────────────────

  /** Returns null when the row belongs to a different sheet (TV, MacBook). */
  private inferSmartCategory(makeModel: string): string | null {
    const m = (makeModel ?? '').toLowerCase();
    if (!m) return 'Mobile';
    if (m.includes('macbook') || m.includes('mac book')) return null; // sheet 1
    if (m.includes('apple tv') || m.includes('fire tv') || m.includes('chromecast')) return null; // sheet 4
    if (m.includes('iphone')) return 'iPhone';
    if (m.includes('ipad')) return 'iPad';
    if (m.includes('apple watch') || (m.includes('apple') && m.includes('watch'))) return 'Smartwatch';
    if (m.includes('samsung watch') || m.includes('galaxy watch')) return 'Smartwatch';
    if (m.includes(' tv') && !m.includes('connectivity')) return null; // sheet 4
    if (m.includes('tab') || m.includes('tablet')) return 'Tablet';
    return 'Mobile';
  }

  // ─── Category inference — TV sheet ────────────────────────────────────────

  private inferTVCategory(assetNumber: string, makeModel: string): string {
    const an = (assetNumber ?? '').toUpperCase();
    const m  = (makeModel ?? '').toLowerCase();
    if (an.startsWith('IFOCUS-TV') || an.startsWith('VIACOM-TV')) return 'TV';
    if (an.startsWith('IFOCUS-PROJ')) return 'Projector';
    if (m.includes('fire tv') || m.includes('roku') || m.includes('chromecast') || m.includes('apple tv')) return 'Streaming Device';
    if (m.includes('verifone')) return 'Payment Terminal';
    if (m.includes('essl')) return 'Access Control';
    if (m.includes('monitor') || m.includes('lg 27')) return 'Monitor';
    return 'AV Equipment';
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

  // ─── Smart Device Inventory sheet ─────────────────────────────────────────

  private parseSmartDeviceRow(
    row: unknown[],
    headers: string[],
    rowIndex: number,
    sheetName: string,
  ): ParsedDeviceRow | null {
    const g  = (...c: string[]) => this.col(row, headers, ...c);
    const ex = (name: string)   => this.exactCol(row, headers, name);

    const assetNumber       = g('asst id', 'asset id', 'asset number');
    const makeModelRaw      = g('device');
    // Model No. → serialNumber (as per spec)
    const serialNumber      = g('model no', 'model no.');
    // Serial No. → dedicated imei field (second serial for mobiles)
    const imeiField         = g('serial no', 'serial no.');
    const newAssetNo        = g('new asset no', 'new asset number');
    const assignedToProject = g('project');
    const assignedToName    = g('asset owner');
    const statusRaw         = g('asset status');
    const displaySize       = g('display size', 'display') || this.inchCol(row, headers);
    const macAddress        = g('mac id', 'mac address', 'mac add');
    const additionalAcc     = g('additional accessories', 'accessories');
    // "Status" column (OS version — confusingly named in the Excel)
    const osVersion         = ex('status') || g('os version', 'ios', 'android version');
    const appleId           = g('apple id');
    // PWS / PWD columns — Apple password(s)
    const applePass         = this.allCols(row, headers, 'pws').concat(this.allCols(row, headers, 'pwd'))
                                .filter(v => v && v.toLowerCase() !== 'n/a');
    const regMobNo          = g('reg mob no', 'registered mobile', 'mobile no', 'mob no');

    const makeModel = makeModelRaw || undefined;

    if (!assetNumber && !makeModel) return null;

    // Skip rows that belong to other sheets
    const category = this.inferSmartCategory(makeModel ?? '');
    if (category === null) return null;

    const status = this.classifySmartStatus(statusRaw);

    // IMEI columns (any header containing 'imei')
    const imeiCols = this.allCols(row, headers, 'imei');

    // Build remarks
    const remarkParts: string[] = [];
    if (newAssetNo && newAssetNo !== assetNumber) remarkParts.push(`New Asset No: ${newAssetNo}`);
    if (displaySize) remarkParts.push(`Display: ${displaySize}`);
    if (additionalAcc && additionalAcc.toLowerCase() !== 'n/a') remarkParts.push(additionalAcc);
    imeiCols.forEach((v, i) => remarkParts.push(`IMEI${i + 1}: ${v}`));
    if (applePass.length > 0) remarkParts.push(`Apple PWD: ${applePass.join(' / ')}`);
    if (regMobNo && regMobNo.toLowerCase() !== 'n/a') remarkParts.push(`Registered Mobile: ${regMobNo}`);

    return {
      rowIndex,
      assetNumber:       assetNumber || undefined,
      type:              category,
      makeModel,
      serialNumber:      serialNumber || undefined,
      imei:              imeiField   || undefined,
      status,
      macAddress:        macAddress  || undefined,
      osVersion:         osVersion   || undefined,
      assignedToName:    assignedToName    || undefined,
      assignedToProject: assignedToProject || undefined,
      assetCategory:     category,
      appleId:           appleId || undefined,
      remarks:           remarkParts.join('; ') || undefined,
      _sheetName:        sheetName,
    };
  }

  // ─── TV's sheet ───────────────────────────────────────────────────────────

  private parseTVRow(
    row: unknown[],
    headers: string[],
    rowIndex: number,
    sheetName: string,
  ): ParsedDeviceRow | null {
    const g = (...c: string[]) => this.col(row, headers, ...c);

    const assetNumber       = g('asst id', 'asset id', 'asset number');
    const makeModel         = g('device');
    // Model No. → serialNumber
    const serialNumber      = g('model no', 'model no.');
    // Serial No. → remarks (TVs don't have IMEI; this is a secondary reference)
    const serialNoRaw       = g('serial no', 'serial no.');
    const assignedToProject = g('project');
    const assignedToName    = g('asset owner');
    const statusRaw         = g('asset status');
    // Display size: look for inch-like header first, then explicit column names
    const displaySize       = this.inchCol(row, headers) || g('display size', 'display', 'screen size');

    if (!assetNumber && !makeModel) return null;

    // Skip rows that are just header repeats or totals
    if (!assetNumber && makeModel && /^total|^count/i.test(makeModel)) return null;

    const category = this.inferTVCategory(assetNumber, makeModel ?? '');
    const status   = this.classifySmartStatus(statusRaw);

    // Type for device ID generation
    const type = category === 'Projector'       ? 'Projector'
               : category === 'Streaming Device' ? 'StreamingDevice'
               : category === 'Payment Terminal' ? 'PaymentTerminal'
               : category === 'Access Control'   ? 'AccessControl'
               : category === 'Monitor'          ? 'Monitor'
               : 'TV';

    // Build remarks
    const remarkParts: string[] = [];
    if (serialNoRaw) remarkParts.push(`Serial: ${serialNoRaw}`);
    if (displaySize) remarkParts.push(`Display: ${displaySize}`);

    // Any extra columns not yet captured — look for non-empty values in columns
    // whose headers don't match known fields (Column 3, Column 4 pattern)
    const knownHeaders = ['asst id', 'asset id', 'asset number', 'device', 'model no',
      'serial no', 'project', 'asset owner', 'asset status', 'ifocus', 'inhouse'];
    headers.forEach((h, i) => {
      const isKnown = knownHeaders.some(k => h.includes(k));
      const isInch  = /\d/.test(h) && (h.includes('"') || h.includes('inch'));
      if (!isKnown && !isInch && i < row.length) {
        const v = String(row[i] ?? '').trim();
        if (v && v.toLowerCase() !== 'n/a' && !/^\d+$/.test(v)) {
          remarkParts.push(v);
        }
      }
    });

    return {
      rowIndex,
      assetNumber:       assetNumber || undefined,
      type,
      makeModel:         makeModel   || undefined,
      serialNumber:      serialNumber || undefined,
      status,
      assignedToName:    assignedToName    || undefined,
      assignedToProject: assignedToProject || undefined,
      assetCategory:     category,
      remarks:           remarkParts.join('; ') || undefined,
      _sheetName:        sheetName,
    };
  }
}
