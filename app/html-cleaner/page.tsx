"use client";

import { useState, useCallback, Fragment } from "react";
import { useDropzone } from "react-dropzone";
import he from "he";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Upload,
  X,
  FileText,
  ChevronDown,
  ChevronUp,
  Download,
  AlertTriangle,
  Wand2,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type FileExt = "csv" | "xlsx";
type ExportFormat = "csv" | "xlsx";

interface FileState {
  id: string;
  file: File;
  ext: FileExt;
  rows: Record<string, string>[];
  columns: string[];
  htmlColumns: Set<string>;
  selectedColumns: Set<string>;
  showPreview: boolean;
  columnSearch: string;
}

// ── HTML Cleaning ─────────────────────────────────────────────────────────────

function stripHtmlTags(str: string): string {
  return str.replace(/<[^>]*>/g, "");
}

export function cleanHtml(str: string): string {
  if (!str) return str;
  const stripped = stripHtmlTags(str);
  const decoded = he.decode(stripped);
  return decoded.replace(/\s+/g, " ").trim();
}

/**
 * Returns true if a sample of values contains HTML tags OR HTML entities.
 * Catches columns from Rich Text Editors that may have tags, encoded
 * characters like &eacute;, or both.
 */
function looksLikeHtml(values: string[]): boolean {
  const sample = values.slice(0, 100).filter(Boolean);
  if (sample.length === 0) return false;

  const hasTag = (v: string) => /<[a-zA-Z/][^>]*>/.test(v);
  const hasEntity = (v: string) =>
    /&[a-zA-Z]{2,8};|&#\d{1,6};|&#x[0-9a-fA-F]{1,6};/.test(v);

  const count = sample.filter((v) => hasTag(v) || hasEntity(v)).length;
  return count / sample.length >= 0.05;
}

// ── File Parsing ──────────────────────────────────────────────────────────────

async function parseUploadedFile(
  file: File
): Promise<{ rows: Record<string, string>[]; ext: FileExt }> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const isXlsx = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isXls = bytes[0] === 0xd0 && bytes[1] === 0xcf;
  const ext: FileExt =
    file.name.toLowerCase().endsWith(".xlsx") || isXlsx || isXls
      ? "xlsx"
      : "csv";

  if (ext === "xlsx") {
    const mod = await import("xlsx");
    const XLSX = ((mod as Record<string, unknown>).default ??
      mod) as typeof import("xlsx");
    const wb = XLSX.read(bytes, { type: "array" });
    if (!wb.SheetNames.length) return { rows: [], ext };
    const ws = wb.Sheets[wb.SheetNames[0]!]!;
    const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, {
      defval: "",
    });
    return { rows, ext };
  }

  const Papa = (await import("papaparse")).default;
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder("iso-8859-1").decode(buffer);
  }
  // Strip UTF-8 BOM (\uFEFF) which causes ï»¿ prefix on column names
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,
  });
  return { rows: result.data, ext };
}

// ── Export ────────────────────────────────────────────────────────────────────

function buildCleanedRows(
  rows: Record<string, string>[],
  selectedColumns: Set<string>
): Record<string, string>[] {
  return rows.map((row) => {
    const out: Record<string, string> = { ...row };
    for (const col of selectedColumns) {
      if (col in out) out[col] = cleanHtml(out[col] ?? "");
    }
    return out;
  });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadCleaned(fState: FileState, format: ExportFormat) {
  const cleaned = buildCleanedRows(fState.rows, fState.selectedColumns);
  const baseName = fState.file.name.replace(/\.(csv|xlsx)$/i, "");
  const outName = `${baseName}_cleaned`;

  if (format === "csv") {
    const Papa = (await import("papaparse")).default;
    // Semicolon delimiter + UTF-8 BOM → Excel opens columns correctly in all locales
    const csv = Papa.unparse(cleaned, {
      columns: fState.columns,
      delimiter: ";",
    });
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    triggerDownload(blob, `${outName}.csv`);
  } else {
    const mod = await import("xlsx");
    const XLSX = ((mod as Record<string, unknown>).default ??
      mod) as typeof import("xlsx");
    const ws = XLSX.utils.json_to_sheet(cleaned, { header: fState.columns });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, `${outName}.xlsx`);
  }
}

// ── Format Toggle ─────────────────────────────────────────────────────────────

function FormatToggle({
  value,
  onChange,
}: {
  value: ExportFormat;
  onChange: (f: ExportFormat) => void;
}) {
  return (
    <div className="flex items-center gap-1 bg-panel border border-edge rounded-md p-0.5">
      {(["xlsx", "csv"] as ExportFormat[]).map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={cn(
            "px-2.5 h-6 text-[11px] font-mono font-semibold rounded transition-colors",
            value === f
              ? "bg-white text-primary shadow-sm border border-edge"
              : "text-muted hover:text-primary"
          )}
        >
          {f.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// ── ID generator ──────────────────────────────────────────────────────────────

let _id = 0;
const genId = () => `hc-${++_id}`;

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HtmlCleanerPage() {
  const [files, setFiles] = useState<FileState[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [format, setFormat] = useState<ExportFormat>("xlsx");

  const onDrop = useCallback(
    async (accepted: File[]) => {
      setUploadError(null);
      const slots = 10 - files.length;
      if (slots <= 0) {
        setUploadError("Maximum 10 files already loaded.");
        return;
      }
      const toAdd = accepted.slice(0, slots);
      if (accepted.length > slots) {
        setUploadError(
          `Only ${slots} slot${slots !== 1 ? "s" : ""} remaining — added the first ${slots}.`
        );
      }

      const newStates: FileState[] = [];
      for (const file of toAdd) {
        try {
          const { rows, ext } = await parseUploadedFile(file);
          const columns = rows.length > 0 ? Object.keys(rows[0]!) : [];
          const htmlCols = new Set(
            columns.filter((col) =>
              looksLikeHtml(rows.map((r) => r[col] ?? ""))
            )
          );
          newStates.push({
            id: genId(),
            file,
            ext,
            rows,
            columns,
            htmlColumns: htmlCols,
            selectedColumns: new Set(htmlCols),
            showPreview: htmlCols.size > 0,
            columnSearch: "",
          });
        } catch (err) {
          setUploadError(
            `Failed to parse "${file.name}": ${err instanceof Error ? err.message : "unknown error"}`
          );
        }
      }
      if (newStates.length > 0) setFiles((prev) => [...prev, ...newStates]);
    },
    [files]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
    },
    multiple: true,
  });

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
    setUploadError(null);
  }, []);

  const patchFile = useCallback((id: string, patch: Partial<FileState>) => {
    setFiles((prev) =>
      prev.map((f) => (f.id === id ? { ...f, ...patch } : f))
    );
  }, []);

  const toggleColumn = useCallback((id: string, col: string) => {
    setFiles((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const next = new Set(f.selectedColumns);
        next.has(col) ? next.delete(col) : next.add(col);
        return { ...f, selectedColumns: next };
      })
    );
  }, []);

  const selectAll = useCallback((id: string) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, selectedColumns: new Set(f.columns) } : f
      )
    );
  }, []);

  const deselectAll = useCallback((id: string) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, selectedColumns: new Set<string>() } : f
      )
    );
  }, []);

  const anySelected = files.some((f) => f.selectedColumns.size > 0);

  const handleDownloadAll = useCallback(async () => {
    setDownloading(true);
    try {
      for (const f of files) {
        if (f.selectedColumns.size === 0) continue;
        await downloadCleaned(f, format);
        await new Promise((r) => setTimeout(r, 250));
      }
    } finally {
      setDownloading(false);
    }
  }, [files, format]);

  return (
    <div className="flex flex-col h-full">
      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-edge bg-surface px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-sm font-semibold text-primary tracking-tight mr-2">
            HTML Tag Cleaner
          </h1>

          <Button
            variant="accent"
            size="sm"
            onClick={handleDownloadAll}
            disabled={!anySelected || downloading}
          >
            <Wand2 size={12} className="mr-1.5" />
            {downloading ? "Downloading…" : "Clean & Download All"}
          </Button>

          <FormatToggle value={format} onChange={setFormat} />

          {format === "csv" && (
            <span className="text-[11px] text-muted font-mono">
              semicolon-separated · Excel-ready
            </span>
          )}

          {files.length > 0 && (
            <span className="text-xs text-muted font-mono ml-auto">
              {files.length} file{files.length !== 1 ? "s" : ""}
              {anySelected && (
                <span className="ml-1 text-accent">
                  ·{" "}
                  {files.reduce((n, f) => n + f.selectedColumns.size, 0)} col
                  {files.reduce((n, f) => n + f.selectedColumns.size, 0) !== 1
                    ? "s"
                    : ""}{" "}
                  selected
                </span>
              )}
            </span>
          )}
        </div>
      </div>

      {/* ── Scrollable Body ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Upload Zone */}
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-lg p-8 cursor-pointer transition-all duration-200 text-center select-none",
            isDragActive
              ? "border-accent bg-blue-50 animate-drop scale-[1.005]"
              : files.length >= 10
                ? "border-edge bg-panel opacity-50 cursor-not-allowed"
                : "border-edge hover:border-accent/40 bg-surface"
          )}
        >
          <input {...getInputProps()} disabled={files.length >= 10} />
          <Upload
            size={22}
            className={cn(
              "mx-auto mb-2.5 transition-colors",
              isDragActive ? "text-accent" : "text-muted"
            )}
          />
          <p className="text-sm font-medium text-primary">
            {isDragActive
              ? "Drop to add files"
              : files.length >= 10
                ? "Maximum 10 files reached"
                : "Drag & drop files, or click to browse"}
          </p>
          <p className="text-[11px] text-muted mt-1 font-mono">
            .csv · .xlsx — up to 10 files
          </p>
        </div>

        {/* Inline error */}
        {uploadError && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-700">
            <AlertTriangle size={12} className="shrink-0" />
            {uploadError}
          </div>
        )}

        {/* Uploaded file list */}
        {files.length > 0 && (
          <div className="bg-surface border border-edge rounded-lg overflow-hidden">
            <div className="px-4 py-2 border-b border-edge bg-panel">
              <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">
                Uploaded Files
              </span>
            </div>
            {files.map((f, i) => (
              <div
                key={f.id}
                className={cn(
                  "px-4 py-2.5 flex items-center gap-2.5",
                  i < files.length - 1 && "border-b border-edge"
                )}
              >
                <FileText size={14} className="text-muted shrink-0" />
                <span className="text-xs font-mono text-primary flex-1 truncate">
                  {f.file.name}
                </span>
                <Badge variant="muted">
                  {f.rows.length.toLocaleString()} rows
                </Badge>
                <Badge variant="default">
                  {f.columns.length} col{f.columns.length !== 1 ? "s" : ""}
                </Badge>
                {f.htmlColumns.size > 0 && (
                  <Badge variant="continue">
                    {f.htmlColumns.size} HTML detected
                  </Badge>
                )}
                <button
                  onClick={() => removeFile(f.id)}
                  className="p-1 rounded text-muted hover:text-red-500 transition-colors shrink-0"
                  data-tooltip="Remove file"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Per-file column selectors */}
        {files.map((fState) => (
          <FilePanel
            key={fState.id}
            fState={fState}
            format={format}
            onToggleColumn={toggleColumn}
            onSelectAll={selectAll}
            onDeselectAll={deselectAll}
            onSearchChange={(id, q) => patchFile(id, { columnSearch: q })}
            onTogglePreview={(id) =>
              patchFile(id, { showPreview: !fState.showPreview })
            }
            onDownload={downloadCleaned}
          />
        ))}

        {/* Empty state */}
        {files.length === 0 && (
          <div className="text-center py-12">
            <p className="text-sm text-muted">
              Upload CSV or XLSX files to get started.
            </p>
            <p className="text-xs text-muted/60 mt-1">
              HTML tags and entities will be stripped from selected columns.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── FilePanel ─────────────────────────────────────────────────────────────────

interface FilePanelProps {
  fState: FileState;
  format: ExportFormat;
  onToggleColumn: (id: string, col: string) => void;
  onSelectAll: (id: string) => void;
  onDeselectAll: (id: string) => void;
  onSearchChange: (id: string, q: string) => void;
  onTogglePreview: (id: string) => void;
  onDownload: (fState: FileState, format: ExportFormat) => Promise<void>;
}

function FilePanel({
  fState,
  format,
  onToggleColumn,
  onSelectAll,
  onDeselectAll,
  onSearchChange,
  onTogglePreview,
  onDownload,
}: FilePanelProps) {
  const [downloading, setDownloading] = useState(false);

  const filteredCols = fState.columns.filter((c) =>
    c.toLowerCase().includes(fState.columnSearch.toLowerCase())
  );

  const handleDownload = async (fmt: ExportFormat) => {
    setDownloading(true);
    try {
      await onDownload(fState, fmt);
    } finally {
      setDownloading(false);
    }
  };

  const canPreview =
    fState.showPreview &&
    fState.selectedColumns.size > 0 &&
    fState.rows.length > 0;

  return (
    <div className="bg-surface border border-edge rounded-lg overflow-hidden">
      {/* Section header */}
      <div className="px-4 py-3 border-b border-edge bg-panel flex items-center gap-2 flex-wrap">
        <FileText size={13} className="text-muted shrink-0" />
        <span className="text-xs font-semibold text-primary flex-1 truncate font-mono">
          {fState.file.name}
        </span>
        <span className="text-[11px] text-muted shrink-0">
          {fState.selectedColumns.size}/{fState.columns.length} selected
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onTogglePreview(fState.id)}
          className="gap-1 shrink-0"
        >
          {fState.showPreview ? (
            <ChevronUp size={12} />
          ) : (
            <ChevronDown size={12} />
          )}
          Preview
        </Button>

        <div className="flex items-center gap-1 shrink-0">
          {(["xlsx", "csv"] as ExportFormat[]).map((fmt) => (
            <button
              key={fmt}
              disabled={fState.selectedColumns.size === 0 || downloading}
              onClick={() => handleDownload(fmt)}
              className={cn(
                "inline-flex items-center gap-1 h-7 px-2.5 text-[11px] font-mono font-semibold rounded border transition-colors",
                fmt === format
                  ? "bg-accent text-white border-accent hover:bg-accent-hover"
                  : "bg-white text-muted border-edge hover:text-primary hover:bg-slate-50",
                (fState.selectedColumns.size === 0 || downloading) &&
                  "opacity-40 pointer-events-none"
              )}
            >
              <Download size={10} />
              {downloading && fmt === format ? "…" : fmt.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Column selector */}
      <div className="px-4 py-3 space-y-2.5">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search columns…"
            value={fState.columnSearch}
            onChange={(e) => onSearchChange(fState.id, e.target.value)}
            className="flex-1 h-7 px-2.5 text-xs bg-white border border-edge rounded focus:outline-none focus:ring-2 focus:ring-accent/30 placeholder:text-muted font-mono"
          />
          <button
            onClick={() => onSelectAll(fState.id)}
            className="text-[11px] text-accent hover:text-accent-hover font-medium transition-colors whitespace-nowrap"
          >
            Select All
          </button>
          <span className="text-[11px] text-muted">·</span>
          <button
            onClick={() => onDeselectAll(fState.id)}
            className="text-[11px] text-muted hover:text-primary transition-colors whitespace-nowrap"
          >
            Deselect All
          </button>
        </div>

        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          }}
        >
          {filteredCols.map((col) => {
            const isHtml = fState.htmlColumns.has(col);
            const isChecked = fState.selectedColumns.has(col);
            return (
              <label
                key={col}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1.5 rounded cursor-pointer transition-colors text-[11px] font-mono",
                  isChecked
                    ? "bg-blue-50 text-primary"
                    : "text-muted hover:bg-surface-hover hover:text-primary"
                )}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => onToggleColumn(fState.id, col)}
                  className="shrink-0 accent-accent"
                />
                <span className="truncate flex-1">{col}</span>
                {isHtml && (
                  <AlertTriangle
                    size={10}
                    className="text-amber-500 shrink-0"
                    data-tooltip="HTML detected"
                  />
                )}
              </label>
            );
          })}
          {filteredCols.length === 0 && (
            <p className="col-span-full text-xs text-muted py-2 text-center">
              No columns match &ldquo;{fState.columnSearch}&rdquo;
            </p>
          )}
        </div>
      </div>

      {/* Preview hint when closed or no selection */}
      {fState.showPreview && !canPreview && (
        <div className="border-t border-edge px-4 py-3 text-xs text-muted">
          {fState.selectedColumns.size === 0
            ? "Select at least one column to see the preview."
            : "No rows to preview."}
        </div>
      )}

      {canPreview && <PreviewPanel fState={fState} />}
    </div>
  );
}

// ── PreviewPanel ──────────────────────────────────────────────────────────────

function PreviewPanel({ fState }: { fState: FileState }) {
  const previewRows = fState.rows.slice(0, 3);
  const cols = [...fState.selectedColumns];

  return (
    <div className="border-t border-edge overflow-x-auto">
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr className="bg-panel border-b border-edge">
            <th className="px-3 py-2 text-left font-semibold text-muted font-mono w-10 whitespace-nowrap">
              #
            </th>
            <th className="px-3 py-2 text-left font-semibold text-muted w-16 whitespace-nowrap">
              State
            </th>
            {cols.map((col) => (
              <th
                key={col}
                className="px-3 py-2 text-left font-semibold text-primary font-mono whitespace-nowrap"
              >
                <span className="flex items-center gap-1">
                  {col}
                  {fState.htmlColumns.has(col) && (
                    <AlertTriangle size={9} className="text-amber-500" />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {previewRows.map((row, i) => {
            const isLast = i === previewRows.length - 1;
            return (
              <Fragment key={i}>
                <tr className={cn("border-b border-edge/60", "bg-red-50/30")}>
                  <td
                    className="px-3 py-1.5 text-muted font-mono align-middle"
                    rowSpan={2}
                  >
                    {i + 1}
                  </td>
                  <td className="px-3 py-1.5 align-middle">
                    <Badge variant="continue">before</Badge>
                  </td>
                  {cols.map((col) => (
                    <td
                      key={col}
                      className="px-3 py-1.5 font-mono text-red-700 max-w-xs"
                    >
                      <span
                        className="block truncate"
                        data-tooltip={row[col] ?? ""}
                      >
                        {row[col] ?? ""}
                      </span>
                    </td>
                  ))}
                </tr>
                <tr
                  className={cn(
                    !isLast && "border-b border-edge",
                    "bg-emerald-50/30"
                  )}
                >
                  <td className="px-3 py-1.5 align-middle">
                    <Badge variant="active">after</Badge>
                  </td>
                  {cols.map((col) => (
                    <td
                      key={col}
                      className="px-3 py-1.5 font-mono text-emerald-800 max-w-xs"
                    >
                      <span className="block truncate">
                        {cleanHtml(row[col] ?? "")}
                      </span>
                    </td>
                  ))}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
