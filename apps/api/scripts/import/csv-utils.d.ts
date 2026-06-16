export type CsvRow = Record<string, string>;
export declare function parseCsv(content: string): CsvRow[];
export declare function readCsvFile(file: string): CsvRow[];
export type OutcomeStatus = 'create' | 'update' | 'skip' | 'error';
export interface RowOutcome {
    line: number;
    status: OutcomeStatus;
    key: string;
    message: string;
}
export declare class ImportReport {
    private readonly importer;
    readonly outcomes: RowOutcome[];
    constructor(importer: string);
    record(o: RowOutcome): void;
    counts(): {
        create: number;
        update: number;
        skip: number;
        error: number;
    };
    hasErrors(): boolean;
    printSummary(commit: boolean): void;
    writeLog(): string;
}
export interface ImportArgs {
    file: string;
    commit: boolean;
}
export declare function parseArgs(argv: string[]): ImportArgs;
export declare const EMAIL_RE: RegExp;
