"use client";

/**
 * RFMUploader
 * - Drag & drop or browse to select a CSV/TSV file
 * - Preview first 5 data rows with column headers
 * - Validate required columns exist before allowing "Run Analysis"
 * - Calls onRun(file) when the user confirms
 */

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Upload, CheckCircle2, XCircle, FileText, Loader2, X } from "lucide-react";

const REQUIRED_COLS = [
  "Header",
  "Ordered byCode",
  "Order date",
  "Net price",
];

const SEGMENT_TOOLTIPS: Record<string, string> = {
  "VIP Champions":   "Pelanggan dengan pembelian terbaru, sering, dan bernilai tinggi",
  "At Risk":         "Dulu aktif tapi sudah lama tidak memesan — perlu segera diaktifkan kembali",
  "New / Potential": "Baru bergabung atau masih jarang beli — prospek yang perlu dikembangkan",
  "One-time Buyers": "Hanya pernah memesan satu kali — belum menunjukkan loyalitas",
  "Loyal Customers": "Rutin memesan dengan nilai konsisten — tulang punggung bisnis",
};
// Export so other components can reuse
export { SEGMENT_TOOLTIPS };

interface Props {
  onRun: (file: File) => void;
  isProcessing: boolean;
}

interface PreviewState {
  file: File;
  headers: string[];
  rows: Record<string, string>[];
  missingCols: string[];
}

export function RFMUploader({ onRun, isProcessing }: Props) {
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const processFile = useCallback(async (file: File) => {
    setParseError(null);
    setPreview(null);

    try {
      const { default: Papa } = await import("papaparse");
      // Read raw text — handle UTF-16 LE (Exact Online export)
      const buffer  = await file.arrayBuffer();
      const bytes   = new Uint8Array(buffer);
      const isUtf16 = bytes[0] === 0xff && bytes[1] === 0xfe;
      let text      = isUtf16
        ? new TextDecoder("utf-16le").decode(buffer)
        : new TextDecoder("utf-8").decode(buffer);
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

      const result = Papa.parse<Record<string, string>>(text, {
        header:        true,
        skipEmptyLines: true,
        preview:       6, // header + 5 data rows
        dynamicTyping: false,
        delimiter:     isUtf16 ? "\t" : "",
      });

      const headers     = result.meta.fields ?? [];
      const rows        = result.data.slice(0, 5);
      const missingCols = REQUIRED_COLS.filter((c) => !headers.includes(c));

      setPreview({ file, headers, rows, missingCols });
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to read file");
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => { if (files[0]) processFile(files[0]); },
    accept: {
      "text/csv":                 [".csv"],
      "text/plain":               [".txt"],
      "application/vnd.ms-excel": [".csv"],
    },
    multiple: false,
  });

  if (isProcessing) {
    return (
      <div className="flex items-center justify-center py-16 text-center space-y-2">
        <div className="space-y-3">
          <Loader2 size={32} className="mx-auto text-accent animate-spin" />
          <p className="text-sm text-muted font-mono">Running RFM analysis…</p>
        </div>
      </div>
    );
  }

  // ── Preview state ────────────────────────────────────────────────────────
  if (preview) {
    const canRun = preview.missingCols.length === 0;
    return (
      <div className="space-y-4">
        {/* File info bar */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-edge">
          <FileText size={16} className="text-muted shrink-0" />
          <span className="text-[12px] text-primary font-mono truncate flex-1">
            {preview.file.name}
          </span>
          <span className="text-[11px] text-muted font-mono shrink-0">
            {(preview.file.size / 1024).toFixed(0)} KB
          </span>
          <button
            onClick={() => { setPreview(null); setParseError(null); }}
            className="text-muted hover:text-red-500 transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        </div>

        {/* Column validation */}
        <div className="space-y-1">
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">
            Column Validation
          </p>
          <div className="flex flex-wrap gap-2">
            {REQUIRED_COLS.map((col) => {
              const ok = preview.headers.includes(col);
              return (
                <div
                  key={col}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-mono border",
                    ok
                      ? "bg-green-50 border-green-200 text-green-700"
                      : "bg-red-50 border-red-200 text-red-600"
                  )}
                >
                  {ok
                    ? <CheckCircle2 size={11} className="shrink-0" />
                    : <XCircle     size={11} className="shrink-0" />}
                  {col}
                </div>
              );
            })}
          </div>
          {!canRun && (
            <p className="text-[11px] text-red-600 font-mono mt-1">
              Missing: {preview.missingCols.join(", ")}
            </p>
          )}
        </div>

        {/* 5-row preview table */}
        <div>
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-1">
            Data Preview (first 5 rows)
          </p>
          <div className="overflow-x-auto border border-edge rounded-lg">
            <table className="text-[11px] w-full border-collapse">
              <thead className="bg-slate-50 border-b border-edge">
                <tr>
                  {preview.headers.map((h) => (
                    <th
                      key={h}
                      className={cn(
                        "px-2.5 py-1.5 text-left font-semibold whitespace-nowrap",
                        REQUIRED_COLS.includes(h) ? "text-accent" : "text-muted"
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, i) => (
                  <tr key={i} className="border-b border-edge/50 hover:bg-slate-50">
                    {preview.headers.map((h) => (
                      <td key={h} className="px-2.5 py-1 text-primary font-mono max-w-[140px] truncate">
                        {String(row[h] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <Button
            variant={canRun ? "default" : "outline"}
            size="sm"
            disabled={!canRun}
            onClick={() => onRun(preview.file)}
            className={cn(canRun && "bg-accent text-white hover:bg-accent-hover")}
          >
            Run RFM Analysis
          </Button>
          {/* Replace file trigger */}
          <div {...getRootProps()} className="cursor-pointer">
            <input {...getInputProps()} />
            <Button variant="outline" size="sm">
              <Upload size={12} className="mr-1.5" />
              Replace File
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Drop zone (no file selected yet) ────────────────────────────────────
  return (
    <div className="space-y-4">
      {parseError && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[12px] text-red-600">
          <XCircle size={14} className="shrink-0" />
          {parseError}
        </div>
      )}

      <div
        {...getRootProps()}
        className={cn(
          "flex flex-col items-center justify-center py-16 rounded-2xl border-2 border-dashed cursor-pointer transition-all",
          isDragActive
            ? "border-accent bg-accent/5 animate-drop"
            : "border-edge hover:border-accent/40 hover:bg-surface-hover"
        )}
      >
        <input {...getInputProps()} />
        <div className={cn(
          "w-16 h-16 rounded-2xl flex items-center justify-center mb-5 transition-colors",
          isDragActive ? "bg-accent/10" : "bg-surface border border-edge"
        )}>
          <Upload size={28} className={isDragActive ? "text-accent" : "text-muted/60"} />
        </div>
        <p className="text-sm font-semibold text-primary mb-1">
          {isDragActive ? "Drop the file here" : "Upload Sales Orders CSV"}
        </p>
        <p className="text-[12px] text-muted text-center max-w-xs">
          Drag & drop or <span className="text-accent font-medium">browse</span>
        </p>
        <p className="text-[11px] text-muted/50 mt-3 font-mono">
          .csv · .txt · tab or comma separated · UTF-8 / UTF-16
        </p>

        {/* Required columns hint */}
        <div className="mt-5 text-[10px] font-mono text-muted/60 text-center space-y-0.5">
          <div>Required columns:</div>
          <div>{REQUIRED_COLS.join(" · ")}</div>
          <div className="mt-1">Date format: DD-MM-YYYY</div>
        </div>
      </div>
    </div>
  );
}
