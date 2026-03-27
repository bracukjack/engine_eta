"use client";

import { useRef, useCallback, useEffect, useMemo } from "react";
import { useAppStore } from "@/lib/store";
import type { FileKey, OutputRow, WorkerResponse } from "@/lib/types";
import { parseFileBuffer, getXLSX } from "@/lib/parsers";
import { FileDropzone } from "@/components/file-dropzone/file-dropzone";
import { DataTable } from "@/components/data-table/data-table";
import { StatChip } from "@/components/status-badge/status-badge";
import { Button } from "@/components/ui/button";
import { Play, Download, FileSpreadsheet, Loader2 } from "lucide-react";

const FILE_KEYS: FileKey[] = ["shopify", "sales", "stock", "purchase", "items"];

export default function ShopifyProcessorPage() {
  const workerRef = useRef<Worker | null>(null);

  const files = useAppStore((s) => s.files);
  const processingState = useAppStore((s) => s.processingState);
  const progress = useAppStore((s) => s.progress);
  const error = useAppStore((s) => s.error);
  const results = useAppStore((s) => s.results);
  const summary = useAppStore((s) => s.summary);

  const startProcessing = useAppStore((s) => s.startProcessing);
  const setProgress = useAppStore((s) => s.setProgress);
  const setResults = useAppStore((s) => s.setResults);
  const setError = useAppStore((s) => s.setError);

  const statusFilter = useAppStore((s) => s.statusFilter);
  const etaFilter = useAppStore((s) => s.etaFilter);
  const discountFilter = useAppStore((s) => s.discountFilter);
  const setStatusFilter = useAppStore((s) => s.setStatusFilter);
  const setEtaFilter = useAppStore((s) => s.setEtaFilter);
  const setDiscountFilter = useAppStore((s) => s.setDiscountFilter);

  const allReady = useAppStore((s) => s.allFilesReady);
  const canRun = allReady() && processingState !== "processing";

  // Initialize worker
  useEffect(() => {
    workerRef.current = new Worker(
      new URL("../../workers/shopify.worker.ts", import.meta.url)
    );

    workerRef.current.onmessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        setProgress(msg.step, msg.progress, msg.message);
      } else if (msg.type === "result") {
        setResults(msg.data as OutputRow[], msg.summary);
      } else if (msg.type === "error") {
        setError(msg.message);
      }
    };

    workerRef.current.onerror = (err) => {
      setError(err.message || "Worker encountered an error");
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, [setProgress, setResults, setError]);

  // Run processor
  const handleRun = useCallback(async () => {
    if (!canRun || !workerRef.current) return;
    startProcessing();

    const parsed: Partial<Record<FileKey, Record<string, unknown>[]>> = {};
    for (const key of FILE_KEYS) {
      const f = files[key].file;
      if (!f) {
        setError(`Missing file: ${key}`);
        return;
      }
      try {
        const buffer = await f.arrayBuffer();
        parsed[key] = await parseFileBuffer(buffer);
      } catch (err) {
        setError(`Failed to parse ${f.name}: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }
    }

    workerRef.current.postMessage({ type: "process", files: parsed });
  }, [canRun, files, startProcessing, setError]);

  // Export functions
  const handleExportXlsx = useCallback(async () => {
    if (results.length === 0) return;
    const XLSX = await getXLSX();
    const ws = XLSX.utils.json_to_sheet(results);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Shopify Output");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buf], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shopify_final.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }, [results]);

  const handleExportCsv = useCallback(async () => {
    if (results.length === 0) return;
    const XLSX = await getXLSX();
    const ws = XLSX.utils.json_to_sheet(results);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shopify_final.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [results]);

  // Count ready files
  const readyCount = useMemo(
    () => FILE_KEYS.filter((k) => files[k].status === "ready").length,
    [files]
  );

  return (
    <div className="flex flex-col h-full">
      {/* ── Top Bar ───────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-edge bg-surface px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-sm font-semibold text-primary tracking-tight mr-2">
            Shopify Processor
          </h1>

          <Button
            variant="accent"
            size="sm"
            onClick={handleRun}
            disabled={!canRun}
          >
            {processingState === "processing" ? (
              <Loader2 size={14} className="animate-spin mr-1.5" />
            ) : (
              <Play size={12} className="mr-1.5" />
            )}
            {processingState === "processing" ? "Processing..." : "Run"}
          </Button>

          {results.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={handleExportXlsx}>
                <FileSpreadsheet size={12} className="mr-1.5" />
                Export .xlsx
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportCsv}>
                <Download size={12} className="mr-1.5" />
                Export .csv
              </Button>
            </>
          )}

          <span className="text-[11px] text-muted font-mono ml-auto">
            {readyCount}/5 files
          </span>
        </div>

        {/* Progress bar */}
        {processingState === "processing" && progress && (
          <div className="mt-2.5 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted font-mono">{progress.step}</span>
              <span className="text-accent font-mono">{progress.progress}%</span>
            </div>
            <div className="h-1 bg-edge rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-300 animate-progress"
                style={{ width: `${progress.progress}%` }}
              />
            </div>
            <p className="text-[11px] text-muted/70">{progress.message}</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-2 px-3 py-2 rounded bg-red-50 border border-red-200 text-red-600 text-xs font-mono">
            {error}
          </div>
        )}

        {/* Summary stats */}
        {summary && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
            <StatChip label="Total" value={summary.total} accent />
            <StatChip label="Active" value={summary.active} />
            <StatChip label="Draft" value={summary.draft} />
            <StatChip label="Continue" value={summary.continueCount} />
            <StatChip label="Deny" value={summary.deny} />
            <StatChip label="ETA" value={summary.etaFilled} />
            <StatChip label="Discount" value={summary.hasDiscount} />
            <StatChip label="Cost" value={summary.costFilled} />
            <StatChip label="Ref" value={summary.referenceFilled} />
          </div>
        )}
      </div>

      {/* ── Main Content ──────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel: File uploads */}
        <div className="w-[260px] shrink-0 border-r border-edge bg-surface/50 p-3 overflow-y-auto">
          <FileDropzone />
        </div>

        {/* Right panel: Data table + filters */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Filter bar */}
          {results.length > 0 && (
            <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-edge bg-surface/50">
              <span className="text-[11px] text-muted uppercase tracking-wider font-semibold">
                Filters
              </span>
              <FilterSelect
                label="Status"
                value={statusFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "active", label: "Active" },
                  { value: "draft", label: "Draft" },
                ]}
                onChange={(v) => setStatusFilter(v as "all" | "active" | "draft")}
              />
              <FilterSelect
                label="ETA"
                value={etaFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                ]}
                onChange={(v) => setEtaFilter(v as "all" | "yes" | "no")}
              />
              <FilterSelect
                label="Discount"
                value={discountFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "yes", label: "Yes" },
                  { value: "no", label: "No" },
                ]}
                onChange={(v) => setDiscountFilter(v as "all" | "yes" | "no")}
              />
            </div>
          )}

          {/* Table */}
          <DataTable />
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-muted">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-white border border-edge rounded px-2 py-1 text-xs text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent/50 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
