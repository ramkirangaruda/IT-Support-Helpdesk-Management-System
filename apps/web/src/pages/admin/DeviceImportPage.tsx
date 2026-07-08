import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../api/api';
import Layout from '../../components/Layout';

// ── Types mirroring backend ImportResult ────────────────────────────────────

interface DevicePreviewRow {
  assetNumber?: string;
  makeModel?:   string;
  type:         string;
  status:       string;
  assignedToName?: string;
  cpu?:         string;
  ram?:         string;
  storage?:     string;
  osVersion?:   string;
}

interface ImportError  { row: number; field: string; message: string }
interface ImportSkipped{ row: number; assetNumber: string; reason: string }

interface SheetResult {
  name:         string;
  rowsFound:    number;
  rowsValid:    number;
  rowsSkipped:  number;
  rowsErrored:  number;
  preview:      DevicePreviewRow[];
  errors:       ImportError[];
  skipped:      ImportSkipped[];
}

interface ImportResult {
  mode:            'preview' | 'commit';
  totalRows:       number;
  sheets:          SheetResult[];
  devicesCreated?: number;
  devicesUpdated?: number;
  devicesSkipped?: number;
}

type Step = 'upload' | 'preview' | 'result';

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CLS: Record<string, string> = {
  AVAILABLE: 'bg-[#eafaf3] text-[#1a7f4b] border-[#a3d9b8]',
  ALLOCATED: 'bg-[#e0f0fe] text-[#0071e3] border-[#b6d8ff]',
  IN_REPAIR: 'bg-[#fef9ec] text-[#b07800] border-[#f0d870]',
  RETIRED:   'bg-[#f2f2f7] text-[#6e6e73] border-hair',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border
      ${STATUS_CLS[status] ?? 'bg-[#f2f2f7] text-ink-muted border-hair'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

// ── Upload step ──────────────────────────────────────────────────────────────

function UploadStep({
  file, setFile, onPreview, loading, error,
}: {
  file: File | null;
  setFile: (f: File | null) => void;
  onPreview: () => void;
  loading: boolean;
  error: string | null;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const f = files[0];
    if (!f.name.match(/\.(xlsx|xls)$/i)) return;
    setFile(f);
  }

  return (
    <div className="max-w-xl mx-auto">
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-2xl border-2 border-dashed p-14 text-center transition-colors
          ${dragging ? 'border-indigo-400 bg-indigo-50/60' : 'border-hair hover:border-indigo-300 hover:bg-[#fafafa]'}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={e => handleFiles(e.target.files)}
        />
        <div className="mx-auto mb-4 h-12 w-12 rounded-xl bg-indigo-50 flex items-center justify-center">
          <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414A1 1 0 0119 9.414V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        {file ? (
          <div>
            <p className="text-sm font-semibold text-ink">{file.name}</p>
            <p className="text-xs text-ink-muted mt-1">{(file.size / 1024).toFixed(1)} KB — click to change</p>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium text-ink">Drop your Excel file here</p>
            <p className="text-xs text-ink-muted mt-1">or click to browse — .xlsx or .xls, max 10 MB</p>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg bg-[#fff1f2] border border-[#fecdd3] px-4 py-3">
          <p className="text-sm text-[#c0392b]">{error}</p>
        </div>
      )}

      <div className="mt-6 flex gap-3 justify-end">
        <Link
          to="/admin/devices"
          className="px-4 py-2 rounded-lg border border-hair text-sm text-ink-soft hover:bg-[#fafafa]"
        >
          Cancel
        </Link>
        <button
          onClick={onPreview}
          disabled={!file || loading}
          className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                     hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Analysing…' : 'Preview Import'}
        </button>
      </div>
    </div>
  );
}

// ── Preview step ─────────────────────────────────────────────────────────────

function PreviewStep({
  result, onBack, onCommit, loading, error,
}: {
  result: ImportResult;
  onBack: () => void;
  onCommit: () => void;
  loading: boolean;
  error: string | null;
}) {
  const [activeSheet, setActiveSheet] = useState(0);
  const sheet = result.sheets[activeSheet];

  const totalNew     = result.sheets.reduce((s, sh) => s + sh.rowsValid, 0);
  const totalUpdate  = result.sheets.reduce((s, sh) => s + sh.rowsSkipped, 0);
  const totalErrors  = result.sheets.reduce((s, sh) => s + sh.rowsErrored, 0);

  return (
    <div>
      {/* Summary bar */}
      <div className="bg-white rounded-xl border border-hair p-5 mb-5 flex flex-wrap gap-6 items-center">
        <div>
          <p className="text-xs text-ink-muted uppercase tracking-[0.06em] font-medium">Total rows</p>
          <p className="text-2xl font-semibold text-ink tabular-nums">{result.totalRows}</p>
        </div>
        <div className="h-8 w-px bg-hair" />
        <div>
          <p className="text-xs text-ink-muted uppercase tracking-[0.06em] font-medium">Will create</p>
          <p className="text-2xl font-semibold text-[#1a7f4b] tabular-nums">{totalNew}</p>
        </div>
        <div className="h-8 w-px bg-hair" />
        <div>
          <p className="text-xs text-ink-muted uppercase tracking-[0.06em] font-medium">Will update</p>
          <p className="text-2xl font-semibold text-[#0071e3] tabular-nums">{totalUpdate}</p>
        </div>
        {totalErrors > 0 && (
          <>
            <div className="h-8 w-px bg-hair" />
            <div>
              <p className="text-xs text-ink-muted uppercase tracking-[0.06em] font-medium">Errors</p>
              <p className="text-2xl font-semibold text-[#c0392b] tabular-nums">{totalErrors}</p>
            </div>
          </>
        )}
      </div>

      {/* Sheet tabs */}
      {result.sheets.length > 1 && (
        <div className="flex gap-1 mb-4 border-b border-hair">
          {result.sheets.map((sh, i) => (
            <button
              key={sh.name}
              onClick={() => setActiveSheet(i)}
              className={`px-4 py-2 text-sm font-medium rounded-t transition-colors
                ${i === activeSheet
                  ? 'border-b-2 border-indigo-600 text-indigo-600 -mb-px bg-white'
                  : 'text-ink-muted hover:text-ink'}`}
            >
              {sh.name}
              <span className="ml-2 text-xs tabular-nums text-ink-muted">
                {sh.rowsFound}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Per-sheet stats */}
      <div className="flex gap-4 mb-4 text-sm">
        <span className="text-[#1a7f4b]">{sheet.rowsValid} new</span>
        <span className="text-[#0071e3]">{sheet.rowsSkipped} will update</span>
        {sheet.rowsErrored > 0 && <span className="text-[#c0392b]">{sheet.rowsErrored} errors</span>}
      </div>

      {/* Preview table */}
      {sheet.preview.length > 0 && (
        <div className="bg-white rounded-xl border border-hair overflow-hidden mb-5">
          <p className="px-4 py-2.5 text-[11px] font-semibold text-ink-muted uppercase tracking-[0.06em]
                        border-b border-hair">
            First {sheet.preview.length} rows to create
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-hair">
                  {['Asset #', 'Make / Model', 'Type', 'Status', 'Assigned To', 'CPU', 'RAM', 'Storage'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-[11px] font-medium text-ink-muted
                                           uppercase tracking-[0.06em] whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f2f2f7]">
                {sheet.preview.map((row, i) => (
                  <tr key={i} className="hover:bg-[#fafafa]">
                    <td className="px-3 py-2.5 font-mono text-xs text-indigo-600">{row.assetNumber ?? '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-ink">{row.makeModel ?? '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-ink-muted">{row.type}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={row.status} /></td>
                    <td className="px-3 py-2.5 text-xs text-ink-muted">{row.assignedToName ?? '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-ink-muted">{row.cpu ?? '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-ink-muted">{row.ram ?? '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-ink-muted">{row.storage ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Will-update section */}
      {sheet.skipped.length > 0 && (
        <div className="bg-[#f0f8ff] border border-[#b6d8ff] rounded-xl p-4 mb-5">
          <p className="text-xs font-semibold text-[#0071e3] mb-2">
            {sheet.skipped.length} device{sheet.skipped.length !== 1 ? 's' : ''} already exist — will be updated
          </p>
          <ul className="space-y-1 text-xs text-ink-muted max-h-32 overflow-y-auto">
            {sheet.skipped.map((s, i) => (
              <li key={i}>Row {s.row}: <span className="font-mono text-ink">{s.assetNumber}</span> — {s.reason}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Errors section */}
      {sheet.errors.length > 0 && (
        <div className="bg-[#fff1f2] border border-[#fecdd3] rounded-xl p-4 mb-5">
          <p className="text-xs font-semibold text-[#c0392b] mb-2">
            {sheet.errors.length} row{sheet.errors.length !== 1 ? 's' : ''} with errors (will be skipped)
          </p>
          <ul className="space-y-1 text-xs text-[#c0392b] max-h-32 overflow-y-auto">
            {sheet.errors.map((e, i) => (
              <li key={i}>Row {e.row} [{e.field}]: {e.message}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-[#fff1f2] border border-[#fecdd3] px-4 py-3 mb-4">
          <p className="text-sm text-[#c0392b]">{error}</p>
        </div>
      )}

      <div className="flex gap-3 justify-end">
        <button
          onClick={onBack}
          disabled={loading}
          className="px-4 py-2 rounded-lg border border-hair text-sm text-ink-soft hover:bg-[#fafafa]"
        >
          Back
        </button>
        <button
          onClick={onCommit}
          disabled={loading || totalNew + totalUpdate === 0}
          className="px-5 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium
                     hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Importing…' : `Confirm Import (${totalNew + totalUpdate} devices)`}
        </button>
      </div>
    </div>
  );
}

// ── Result step ──────────────────────────────────────────────────────────────

function ResultStep({ result, allErrors }: { result: ImportResult; allErrors: string }) {
  function downloadErrors() {
    const blob = new Blob([allErrors], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'import-errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalErrors = (result.sheets ?? []).reduce((s, sh) => s + sh.rowsErrored, 0);

  return (
    <div className="max-w-md mx-auto text-center">
      <div className="mx-auto mb-6 h-14 w-14 rounded-full bg-[#eafaf3] flex items-center justify-center">
        <svg className="w-7 h-7 text-[#1a7f4b]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <h2 className="text-xl font-semibold text-ink mb-2">Import complete</h2>

      <div className="bg-white rounded-xl border border-hair p-5 mb-6 text-left space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-ink-muted">Devices created</span>
          <span className="font-semibold text-[#1a7f4b] tabular-nums">{result.devicesCreated ?? 0}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-ink-muted">Devices updated</span>
          <span className="font-semibold text-[#0071e3] tabular-nums">{result.devicesUpdated ?? 0}</span>
        </div>
        {totalErrors > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-ink-muted">Rows skipped (errors)</span>
            <span className="font-semibold text-[#c0392b] tabular-nums">{result.devicesSkipped ?? 0}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Link
          to="/admin/devices"
          className="px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-sm font-medium
                     hover:bg-indigo-700 text-center"
        >
          View Device Register
        </Link>
        {totalErrors > 0 && (
          <button
            onClick={downloadErrors}
            className="px-4 py-2 rounded-lg border border-hair text-sm text-ink-soft hover:bg-[#fafafa]"
          >
            Download error report
          </button>
        )}
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function DeviceImportPage() {
  const [step,          setStep]          = useState<Step>('upload');
  const [file,          setFile]          = useState<File | null>(null);
  const [previewResult, setPreviewResult] = useState<ImportResult | null>(null);
  const [commitResult,  setCommitResult]  = useState<ImportResult | null>(null);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  async function callImport(mode: 'preview' | 'commit'): Promise<ImportResult> {
    const formData = new FormData();
    formData.append('file', file!);
    const res = await api.post<ImportResult>(`/devices/import?mode=${mode}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  }

  async function handlePreview() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const result = await callImport('preview');
      setPreviewResult(result);
      setStep('preview');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'Preview failed. Check the file format and try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleCommit() {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const result = await callImport('commit');
      setCommitResult(result);
      setStep('result');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setError(typeof msg === 'string' ? msg : 'Import failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Build error CSV for download
  const errorCsv = previewResult?.sheets
    .flatMap(sh => sh.errors.map(e => `${sh.name},${e.row},${e.field},"${e.message}"`))
    .join('\n') ?? '';
  const errorCsvFull = 'Sheet,Row,Field,Error\n' + errorCsv;

  const stepLabels = ['Upload', 'Preview', 'Complete'];
  const stepIndex  = step === 'upload' ? 0 : step === 'preview' ? 1 : 2;

  return (
    <Layout>
      {/* Header */}
      <div className="mb-8">
        <Link to="/admin/devices" className="text-sm text-indigo-600 hover:underline">
          ← Device Register
        </Link>
        <h1 className="text-[22px] font-semibold text-ink mt-3">Import Devices from Excel</h1>
        <p className="text-sm text-ink-muted mt-0.5">
          Supports the iFocus WIP_Asset Excel format — Laptop Inventory and Rented Asset Inventory sheets.
        </p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-3 mb-8">
        {stepLabels.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold
              ${i < stepIndex
                ? 'bg-[#eafaf3] text-[#1a7f4b]'
                : i === stepIndex
                  ? 'bg-indigo-600 text-white'
                  : 'bg-[#f2f2f7] text-ink-muted'}`}>
              {i < stepIndex ? '✓' : i + 1}
            </div>
            <span className={`text-sm font-medium ${i === stepIndex ? 'text-ink' : 'text-ink-muted'}`}>
              {label}
            </span>
            {i < stepLabels.length - 1 && <div className="w-8 h-px bg-hair ml-1" />}
          </div>
        ))}
      </div>

      {step === 'upload' && (
        <UploadStep
          file={file}
          setFile={f => { setFile(f); setError(null); }}
          onPreview={handlePreview}
          loading={loading}
          error={error}
        />
      )}

      {step === 'preview' && previewResult && (
        <PreviewStep
          result={previewResult}
          onBack={() => setStep('upload')}
          onCommit={handleCommit}
          loading={loading}
          error={error}
        />
      )}

      {step === 'result' && commitResult && (
        <ResultStep result={commitResult} allErrors={errorCsvFull} />
      )}
    </Layout>
  );
}
