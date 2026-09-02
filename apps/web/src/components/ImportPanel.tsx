'use client';

import { useRef, useState, type ReactNode } from 'react';
import { api, downloadApiFile, fileToBase64 } from '@/lib/api';

interface ImportPanelProps<TPlan> {
  /** Endpoint serving the blank starter workbook. */
  templatePath: string;
  templateFilename: string;
  /** Endpoint exporting current data in the same shape import accepts. */
  exportPath?: string;
  exportFilename?: string;
  /** Endpoint accepting `{ dataBase64, preview }`. */
  importPath: string;
  /** When false the import controls are shown disabled rather than hidden. */
  canEdit: boolean;
  /** Renders the diff the server returned for the chosen file. */
  renderPreview: (plan: TPlan) => ReactNode;
  /** One-line summary of what a committed import actually did. */
  summarize: (plan: TPlan) => string;
  /** Called after a successful commit so the page can refresh. */
  onApplied: () => void | Promise<void>;
}

/**
 * Template, export, and a preview-before-commit import.
 *
 * A price workbook is assembled by hand and a wrong one silently reprices the
 * whole shop, so the file is never written on the strength of its filename: the
 * server parses it and reports what would change, and only an explicit second
 * click applies it.
 */
export default function ImportPanel<TPlan>({
  templatePath,
  templateFilename,
  exportPath,
  exportFilename,
  importPath,
  canEdit,
  renderPreview,
  summarize,
  onApplied,
}: ImportPanelProps<TPlan>) {
  const [plan, setPlan] = useState<TPlan | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  function reset() {
    setPlan(null);
    setPending(null);
    setFileName(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function choose(file: File | undefined) {
    if (!file) return;
    setError(null);
    setMessage(null);
    setBusy(true);
    try {
      const dataBase64 = await fileToBase64(file);
      const preview = await api<TPlan>(importPath, {
        method: 'POST',
        body: { fileName: file.name, dataBase64, preview: true },
      });
      setPlan(preview);
      setPending(dataBase64);
      setFileName(file.name);
    } catch (err) {
      reset();
      setError(err instanceof Error ? err.message : 'Could not read that workbook');
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!pending) return;
    setError(null);
    setBusy(true);
    try {
      const applied = await api<TPlan>(importPath, {
        method: 'POST',
        body: { fileName, dataBase64: pending, preview: false },
      });
      setMessage(summarize(applied));
      reset();
      await onApplied();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="import-panel">
      <div className="toolbar">
        <button
          type="button"
          className="secondary"
          onClick={() => void downloadApiFile(templatePath, templateFilename)}
        >
          Download template
        </button>
        {exportPath && (
          <button
            type="button"
            className="secondary"
            onClick={() => void downloadApiFile(exportPath, exportFilename ?? 'export.xlsx')}
          >
            Export current
          </button>
        )}
        <label
          className={`file-button${canEdit && !busy ? '' : ' disabled'}`}
          title={canEdit ? undefined : 'You do not have permission to import here'}
        >
          {busy ? 'Reading…' : 'Import Excel…'}
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx"
            hidden
            disabled={!canEdit || busy}
            onChange={(e) => void choose(e.target.files?.[0])}
          />
        </label>
      </div>

      {message && <p className="settings-saved">{message}</p>}
      {error && <p className="error-text">{error}</p>}

      {plan && (
        <div className="import-preview">
          <h3>Review before importing</h3>
          <p className="muted">
            Nothing has changed yet. This is what {fileName} would do.
          </p>
          {renderPreview(plan)}
          <div className="toolbar">
            <button type="button" onClick={() => void apply()} disabled={busy}>
              {busy ? 'Importing…' : 'Apply import'}
            </button>
            <button type="button" className="secondary" onClick={reset} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
