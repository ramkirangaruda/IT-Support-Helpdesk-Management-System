import { DeviceStatus } from '@prisma/client';

export interface ParsedDeviceRow {
  rowIndex: number;
  assetNumber?: string;
  type: string;
  makeModel?: string;
  serialNumber?: string;
  status: DeviceStatus;
  condition?: string;
  cpu?: string;
  ram?: string;
  storage?: string;
  macAddress?: string;
  osVersion?: string;
  osKey?: string;
  antiVirus?: string;
  officeVersion?: string;
  officeKey?: string;
  assignedToName?: string;
  assignedToProject?: string;
  assetCategory?: string;
  rentedFrom?: string;
  rentedDate?: Date;
  returnedDate?: Date;
  remarks?: string;
  _sheetName: string;
  _existingId?: string; // set during dedup check
}

export interface ImportError {
  row: number;
  field: string;
  message: string;
}

export interface ImportSkipped {
  row: number;
  assetNumber: string;
  reason: string;
}

export interface DevicePreviewRow {
  assetNumber?: string;
  makeModel?: string;
  type: string;
  status: string;
  assignedToName?: string;
  cpu?: string;
  ram?: string;
  storage?: string;
  osVersion?: string;
}

export interface SheetResult {
  name: string;
  rowsFound: number;
  rowsValid: number;   // will be created
  rowsSkipped: number; // already exist (will update)
  rowsErrored: number;
  preview: DevicePreviewRow[];
  errors: ImportError[];
  skipped: ImportSkipped[];
}

export interface ImportResult {
  mode: 'preview' | 'commit';
  totalRows: number;
  sheets: SheetResult[];
  devicesCreated?: number;
  devicesUpdated?: number;
  devicesSkipped?: number;
}
