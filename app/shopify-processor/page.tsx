"use client";

import { useRef, useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import type { FileKey, OutputRow, WorkerResponse, BatchProgress } from "@/lib/types";
import { OUTPUT_COLUMNS, PRICE_COLUMNS, INTEGER_OUTPUT_COLUMNS } from "@/lib/types";
import { parseFileBuffer, previewFileBuffer, getXLSX } from "@/lib/parsers";
import { formatPrice, formatInteger, buildSearchMatcher } from "@/lib/utils";
import { FileDropzone } from "@/components/file-dropzone/file-dropzone";
import { DataTable } from "@/components/data-table/data-table";
import { PreviewTable } from "@/components/preview-table/preview-table";
import { StatChip } from "@/components/status-badge/status-badge";
import { ColumnToggle } from "@/components/column-toggle/column-toggle";
import { Button } from "@/components/ui/button";
import { Play, Download, FileSpreadsheet, Loader2, ChevronDown, X } from "lucide-react";

const FILE_KEYS: FileKey[] = ["shopify", "sales", "stock", "purchase", "items", "published"];

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

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
  const policyFilter = useAppStore((s) => s.policyFilter);
  const b2cFilter = useAppStore((s) => s.b2cFilter);
  const search = useAppStore((s) => s.search);
  const setSearch = useAppStore((s) => s.setSearch);
  const setStatusFilter = useAppStore((s) => s.setStatusFilter);
  const setEtaFilter = useAppStore((s) => s.setEtaFilter);
  const setDiscountFilter = useAppStore((s) => s.setDiscountFilter);
  const setPolicyFilter = useAppStore((s) => s.setPolicyFilter);
  const setB2cFilter = useAppStore((s) => s.setB2cFilter);
  const visibleColumns = useAppStore((s) => s.visibleColumns);
  const sortColumn = useAppStore((s) => s.sortColumn);
  const sortDirection = useAppStore((s) => s.sortDirection);
  const tableSize = useAppStore((s) => s.tableSize);
  const setTableSize = useAppStore((s) => s.setTableSize);
  const exportRowLimit = useAppStore((s) => s.exportRowLimit);
  const customRowLimit = useAppStore((s) => s.customRowLimit);
  const setExportRowLimit = useAppStore((s) => s.setExportRowLimit);
  const setCustomRowLimit = useAppStore((s) => s.setCustomRowLimit);

  const splitMode = useAppStore((s) => s.splitMode);
  const rowsPerFile = useAppStore((s) => s.rowsPerFile);
  const batchProgress = useAppStore((s) => s.batchProgress);
  const setSplitMode = useAppStore((s) => s.setSplitMode);
  const setRowsPerFile = useAppStore((s) => s.setRowsPerFile);
  const setBatchProgress = useAppStore((s) => s.setBatchProgress);

  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!exportSuccessMsg) return;
    const t = setTimeout(() => setExportSuccessMsg(null), 3000);
    return () => clearTimeout(t);
  }, [exportSuccessMsg]);

  const previewData = useAppStore((s) => s.previewData);
  const previewTab = useAppStore((s) => s.previewTab);
  const setPreviewData = useAppStore((s) => s.setPreviewData);
  const setPreviewTab = useAppStore((s) => s.setPreviewTab);

  const allReady = useAppStore((s) => s.allFilesReady);
  const canRun = allReady() && processingState !== "processing";

  // Debounced search: local input → store after 300ms
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(id);
  }, [searchInput, setSearch]);

  // Filtered rows (same logic as DataTable — derived for export)
  const filteredRows = useMemo(() => {
    let data = results;
    if (statusFilter !== "all") data = data.filter((r) => r.Status === statusFilter);
    if (etaFilter === "yes") data = data.filter((r) => r.ETA !== null && r.ETA !== "");
    else if (etaFilter === "no") data = data.filter((r) => r.ETA === null || r.ETA === "");
    if (discountFilter === "yes") data = data.filter((r) => r["Discount %"] !== null);
    else if (discountFilter === "no") data = data.filter((r) => r["Discount %"] === null);
    if (policyFilter !== "all") data = data.filter((r) => r["Variant Inventory Policy"] === policyFilter);
    if (b2cFilter === "yes") data = data.filter((r) => r.B2C === "Yes");
    else if (b2cFilter === "no") data = data.filter((r) => r.B2C === "No");
    const matcher = buildSearchMatcher(search);
    if (matcher) {
      data = data.filter((r) =>
        matcher([r["Variant SKU"], r.Title, r.Reference])
      );
    }
    return data;
  }, [results, statusFilter, etaFilter, discountFilter, policyFilter, b2cFilter, search]);

  // Sorted rows (for export — same sort as DataTable)
  const sortedRows = useMemo(() => {
    if (!sortColumn) return filteredRows;
    const col = sortColumn;
    const dir = sortDirection === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const av = a[col];
      const bv = b[col];
      const aEmpty = av === null || av === undefined || av === "";
      const bEmpty = bv === null || bv === undefined || bv === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { sensitivity: "base" }) * dir;
    });
  }, [filteredRows, sortColumn, sortDirection]);

  // Export row count
  const exportLimit = useMemo(() => {
    if (exportRowLimit === "all") return sortedRows.length;
    if (exportRowLimit === "custom") return Math.min(customRowLimit, sortedRows.length);
    return Math.min(exportRowLimit, sortedRows.length);
  }, [exportRowLimit, customRowLimit, sortedRows.length]);

  const isFiltered = statusFilter !== "all" || etaFilter !== "all" || discountFilter !== "all" || policyFilter !== "all" || b2cFilter !== "all" || search !== "";

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

  // Build export data: sorted+sliced rows × visible columns, with price formatting
  const buildExportData = useCallback(() => {
    const rows = sortedRows.slice(0, exportLimit);
    return rows.map((row) => {
      const obj: Record<string, unknown> = {};
      for (const key of visibleColumns) {
        if (PRICE_COLUMNS.has(key)) {
          obj[key] = formatPrice(row[key] as number | null) || null;
        } else if (INTEGER_OUTPUT_COLUMNS.has(key)) {
          obj[key] = formatInteger(row[key] as number | null) || null;
        } else {
          obj[key] = row[key];
        }
      }
      return obj;
    });
  }, [sortedRows, exportLimit, visibleColumns]);

  // Export functions
  const handleExportXlsx = useCallback(async () => {
    const date = new Date().toISOString().slice(0, 10);
    const XLSX = await getXLSX();

    if (!splitMode) {
      const data = buildExportData();
      if (data.length === 0) return;
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Shopify Output");
      const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shopify_processed_${date}_${data.length}rows.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const rows = sortedRows.slice(0, exportLimit);
    if (rows.length === 0) return;
    const { default: JSZip } = await import("jszip");
    const chunks = chunkArray(rows, rowsPerFile);
    const totalFiles = chunks.length;
    const totalRows = rows.length;
    const pd = Math.max(2, String(totalFiles).length);
    const rd = Math.max(3, String(totalRows).length);
    const zip = new JSZip();

    for (let i = 0; i < chunks.length; i++) {
      setBatchProgress({ current: i + 1, total: totalFiles, phase: "building" });
      await new Promise((r) => setTimeout(r, 0));
      const startRow = i * rowsPerFile + 1;
      const endRow = startRow + chunks[i].length - 1;
      const filename = `shopify_processed_${date}_part${String(i + 1).padStart(pd, "0")}of${String(totalFiles).padStart(pd, "0")}_rows${String(startRow).padStart(rd, "0")}-${String(endRow).padStart(rd, "0")}.xlsx`;
      const chunkData = chunks[i].map((row) => {
        const obj: Record<string, unknown> = {};
        for (const key of visibleColumns) {
          if (PRICE_COLUMNS.has(key)) obj[key] = formatPrice(row[key] as number | null) || null;
          else if (INTEGER_OUTPUT_COLUMNS.has(key)) obj[key] = formatInteger(row[key] as number | null) || null;
          else obj[key] = row[key];
        }
        return obj;
      });
      const ws = XLSX.utils.json_to_sheet(chunkData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Shopify Output");
      zip.file(filename, XLSX.write(wb, { bookType: "xlsx", type: "array" }));
    }

    const zipBlob = await zip.generateAsync(
      { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
      (meta) => setBatchProgress({ current: Math.round(meta.percent), total: 100, phase: "compressing" })
    );
    setBatchProgress(null);
    setExportSuccessMsg(`ZIP exported: ${totalFiles} files, ${totalRows} rows`);
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shopify_processed_${date}_${totalFiles}files_${totalRows}rows.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }, [splitMode, buildExportData, sortedRows, exportLimit, rowsPerFile, visibleColumns, setBatchProgress, setExportSuccessMsg]);

  const handleExportCsv = useCallback(async () => {
    const date = new Date().toISOString().slice(0, 10);
    const XLSX = await getXLSX();

    if (!splitMode) {
      const data = buildExportData();
      if (data.length === 0) return;
      const ws = XLSX.utils.json_to_sheet(data);
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `shopify_processed_${date}_${data.length}rows.csv`;
      a.click();
      URL.revokeObjectURL(url);
      return;
    }

    const rows = sortedRows.slice(0, exportLimit);
    if (rows.length === 0) return;
    const { default: JSZip } = await import("jszip");
    const chunks = chunkArray(rows, rowsPerFile);
    const totalFiles = chunks.length;
    const totalRows = rows.length;
    const pd = Math.max(2, String(totalFiles).length);
    const rd = Math.max(3, String(totalRows).length);
    const zip = new JSZip();

    for (let i = 0; i < chunks.length; i++) {
      setBatchProgress({ current: i + 1, total: totalFiles, phase: "building" });
      await new Promise((r) => setTimeout(r, 0));
      const startRow = i * rowsPerFile + 1;
      const endRow = startRow + chunks[i].length - 1;
      const filename = `shopify_processed_${date}_part${String(i + 1).padStart(pd, "0")}of${String(totalFiles).padStart(pd, "0")}_rows${String(startRow).padStart(rd, "0")}-${String(endRow).padStart(rd, "0")}.csv`;
      const chunkData = chunks[i].map((row) => {
        const obj: Record<string, unknown> = {};
        for (const key of visibleColumns) {
          if (PRICE_COLUMNS.has(key)) obj[key] = formatPrice(row[key] as number | null) || null;
          else if (INTEGER_OUTPUT_COLUMNS.has(key)) obj[key] = formatInteger(row[key] as number | null) || null;
          else obj[key] = row[key];
        }
        return obj;
      });
      zip.file(filename, XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(chunkData)));
    }

    const zipBlob = await zip.generateAsync(
      { type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } },
      (meta) => setBatchProgress({ current: Math.round(meta.percent), total: 100, phase: "compressing" })
    );
    setBatchProgress(null);
    setExportSuccessMsg(`ZIP exported: ${totalFiles} files, ${totalRows} rows`);
    const url = URL.createObjectURL(zipBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shopify_processed_${date}_${totalFiles}files_${totalRows}rows.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }, [splitMode, buildExportData, sortedRows, exportLimit, rowsPerFile, visibleColumns, setBatchProgress, setExportSuccessMsg]);

  // Count ready files
  const readyCount = useMemo(
    () => FILE_KEYS.filter((k) => files[k].status === "ready").length,
    [files]
  );

  // Read preview data when files are uploaded / removed
  const prevFilesRef = useRef<Record<FileKey, string | null>>({
    shopify: null, sales: null, stock: null, purchase: null, items: null, published: null,
  });

  useEffect(() => {
    for (const key of FILE_KEYS) {
      const file = files[key].file;
      const prevName = prevFilesRef.current[key];
      const curName = file?.name ?? null;

      if (curName === prevName) continue;
      prevFilesRef.current[key] = curName;

      if (!file) {
        setPreviewData(key, null);
        if (previewTab === key) {
          const next = FILE_KEYS.find((k) => k !== key && previewData[k] !== null);
          setPreviewTab(next ?? null);
        }
        continue;
      }

      (async () => {
        try {
          const buf = await file.arrayBuffer();
          const data = await previewFileBuffer(buf, file.name);
          setPreviewData(key, data);
          if (!previewTab) setPreviewTab(key);
        } catch {
          setPreviewData(key, {
            filename: file.name, headers: [], rows: [], totalRows: 0,
            encoding: "unknown", separator: "unknown", error: "Failed to read file",
          });
        }
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

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
              <ColumnToggle />
              <ExportDropdown
                onExportXlsx={handleExportXlsx}
                onExportCsv={handleExportCsv}
                rowCount={exportLimit}
                colCount={visibleColumns.length}
                exportRowLimit={exportRowLimit}
                customRowLimit={customRowLimit}
                filteredTotal={sortedRows.length}
                onSetExportRowLimit={setExportRowLimit}
                onSetCustomRowLimit={setCustomRowLimit}
                splitMode={splitMode}
                rowsPerFile={rowsPerFile}
                batchProgress={batchProgress}
                onSetSplitMode={setSplitMode}
                onSetRowsPerFile={setRowsPerFile}
              />
              {exportSuccessMsg && (
                <span className="text-[11px] text-green-600 font-mono">✓ {exportSuccessMsg}</span>
              )}
              <SizeToggle value={tableSize} onChange={setTableSize} />
            </>
          )}

          {/* Search */}
          {results.length > 0 && (
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search SKU or title... (comma = multi-SKU)"
              className="bg-white border border-edge rounded px-2.5 py-1 text-xs font-mono w-64 focus:outline-none focus:ring-1 focus:ring-accent/50"
            />
          )}

          {/* Row & column summary */}
          {results.length > 0 && (
            <div className="flex items-center gap-2 ml-auto">
              <span className="text-[11px] text-muted font-mono">
                {isFiltered
                  ? `${filteredRows.length.toLocaleString()} / ${results.length.toLocaleString()} rows (filtered)`
                  : `${results.length.toLocaleString()} rows`}
              </span>
              <span className="text-[11px] text-muted/60">·</span>
              <span className="text-[11px] text-muted font-mono">
                Columns: {visibleColumns.length}/{OUTPUT_COLUMNS.length}
              </span>
            </div>
          )}

          {results.length === 0 && (
            <span className="text-[11px] text-muted font-mono ml-auto">
              {readyCount}/5 files
            </span>
          )}
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

        {/* Batch export progress */}
        {batchProgress && (
          <div className="mt-2.5 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted font-mono">
                {batchProgress.phase === "building" ? "Export" : "Compressing"}
              </span>
              <span className="text-accent font-mono">
                {batchProgress.phase === "building"
                  ? `${Math.round((batchProgress.current / batchProgress.total) * 100)}%`
                  : `${batchProgress.current}%`}
              </span>
            </div>
            <div className="h-1 bg-edge rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all duration-300"
                style={{
                  width: batchProgress.phase === "building"
                    ? `${(batchProgress.current / batchProgress.total) * 100}%`
                    : `${batchProgress.current}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-muted/70">
              {batchProgress.phase === "building"
                ? `Building file ${batchProgress.current} of ${batchProgress.total}...`
                : `Compressing ZIP... ${batchProgress.current}%`}
            </p>
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
            <StatChip label="B2C" value={summary.b2cTotal} />
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
          {/* Output / Preview tabs */}
          <RightPanel
            isFiltered={isFiltered}
            statusFilter={statusFilter}
            etaFilter={etaFilter}
            discountFilter={discountFilter}
            policyFilter={policyFilter}
            b2cFilter={b2cFilter}
            setStatusFilter={setStatusFilter}
            setEtaFilter={setEtaFilter}
            setDiscountFilter={setDiscountFilter}
            setPolicyFilter={setPolicyFilter}
            setB2cFilter={setB2cFilter}
          />
        </div>
      </div>
    </div>
  );
}

function RightPanel({
  isFiltered,
  statusFilter,
  etaFilter,
  discountFilter,
  policyFilter,
  b2cFilter,
  setStatusFilter,
  setEtaFilter,
  setDiscountFilter,
  setPolicyFilter,
  setB2cFilter,
}: {
  isFiltered: boolean;
  statusFilter: string;
  etaFilter: string;
  discountFilter: string;
  policyFilter: string;
  b2cFilter: string;
  setStatusFilter: (v: "all" | "active" | "draft") => void;
  setEtaFilter: (v: "all" | "yes" | "no") => void;
  setDiscountFilter: (v: "all" | "yes" | "no") => void;
  setPolicyFilter: (v: "all" | "continue" | "deny") => void;
  setB2cFilter: (v: "all" | "yes" | "no") => void;
}) {
  const [tab, setTab] = useState<"output" | "preview">("output");
  const previewData = useAppStore((s) => s.previewData);
  const results = useAppStore((s) => s.results);
  const hasPreview = Object.values(previewData).some((d) => d !== null);

  return (
    <>
      {/* Tab bar */}
      <div className="shrink-0 flex items-center border-b border-edge bg-surface/50">
        <button
          onClick={() => setTab("output")}
          className={`px-4 py-2 text-[11px] font-semibold cursor-pointer transition-colors border-b-2 ${
            tab === "output"
              ? "border-accent text-primary bg-white"
              : "border-transparent text-muted hover:bg-slate-50"
          }`}
        >
          Output
          {results.length > 0 && (
            <span className="ml-1.5 text-[9px] font-mono text-accent bg-accent/10 rounded px-1">
              {results.length}
            </span>
          )}
        </button>
        <button
          onClick={() => { if (hasPreview) setTab("preview"); }}
          className={`px-4 py-2 text-[11px] font-semibold cursor-pointer transition-colors border-b-2 ${
            tab === "preview"
              ? "border-accent text-primary bg-white"
              : "border-transparent text-muted hover:bg-slate-50"
          } ${!hasPreview ? "opacity-40 pointer-events-none" : ""}`}
        >
          Preview
          {hasPreview && (
            <span className="ml-1.5 text-[9px] font-mono text-accent bg-accent/10 rounded px-1">
              {Object.values(previewData).filter((d) => d !== null).length}
            </span>
          )}
        </button>

      </div>

      {/* Filter bar — below tabs, only on Output tab */}
      {tab === "output" && results.length > 0 && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-edge bg-surface/50 flex-wrap">
          <span className="text-[11px] text-muted uppercase tracking-wider font-semibold">Filters</span>
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
          <FilterSelect
            label="Policy"
            value={policyFilter}
            options={[
              { value: "all", label: "All" },
              { value: "continue", label: "Continue" },
              { value: "deny", label: "Deny" },
            ]}
            onChange={(v) => setPolicyFilter(v as "all" | "continue" | "deny")}
          />
          <FilterSelect
            label="B2C"
            value={b2cFilter}
            options={[
              { value: "all", label: "All" },
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            onChange={(v) => setB2cFilter(v as "all" | "yes" | "no")}
          />
          {isFiltered && (
            <div className="flex items-center gap-1.5">
              {statusFilter !== "all" && (
                <FilterChip label={`Status: ${statusFilter}`} onRemove={() => setStatusFilter("all")} />
              )}
              {etaFilter !== "all" && (
                <FilterChip label={`ETA: ${etaFilter}`} onRemove={() => setEtaFilter("all")} />
              )}
              {discountFilter !== "all" && (
                <FilterChip label={`Discount: ${discountFilter}`} onRemove={() => setDiscountFilter("all")} />
              )}
              {policyFilter !== "all" && (
                <FilterChip label={`Policy: ${policyFilter}`} onRemove={() => setPolicyFilter("all")} />
              )}
              {b2cFilter !== "all" && (
                <FilterChip label={`B2C: ${b2cFilter}`} onRemove={() => setB2cFilter("all")} />
              )}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {tab === "output" ? (
        <DataTable />
      ) : (
        <div className="flex-1 min-h-0">
          <PreviewTable />
        </div>
      )}
    </>
  );
}

function LeftPanel() { return null; }

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

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 bg-accent/10 text-accent text-[11px] font-medium rounded-full px-2.5 py-0.5">
      {label}
      <button
        onClick={onRemove}
        className="hover:bg-accent/20 rounded-full p-0.5 transition-colors cursor-pointer"
      >
        <X size={10} />
      </button>
    </span>
  );
}

function ExportDropdown({
  onExportXlsx,
  onExportCsv,
  rowCount,
  colCount,
  exportRowLimit,
  customRowLimit,
  filteredTotal,
  onSetExportRowLimit,
  onSetCustomRowLimit,
  splitMode,
  rowsPerFile,
  batchProgress,
  onSetSplitMode,
  onSetRowsPerFile,
}: {
  onExportXlsx: () => void;
  onExportCsv: () => void;
  rowCount: number;
  colCount: number;
  exportRowLimit: import("@/lib/types").ExportRowLimit;
  customRowLimit: number;
  filteredTotal: number;
  onSetExportRowLimit: (l: import("@/lib/types").ExportRowLimit) => void;
  onSetCustomRowLimit: (n: number) => void;
  splitMode: boolean;
  rowsPerFile: number;
  batchProgress: BatchProgress | null;
  onSetSplitMode: (v: boolean) => void;
  onSetRowsPerFile: (n: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const ROW_OPTIONS: { value: import("@/lib/types").ExportRowLimit; label: string }[] = [
    { value: "all", label: "All rows" },
    { value: 10, label: "Top 10" },
    { value: 20, label: "Top 20" },
    { value: 50, label: "Top 50" },
    { value: 100, label: "Top 100" },
    { value: "custom", label: "Custom…" },
  ];

  const isBuilding = batchProgress?.phase === "building";

  return (
    <div className="relative">
      <Button
        ref={btnRef}
        variant="outline"
        size="sm"
        disabled={!!batchProgress}
        onClick={() => !batchProgress && setOpen((v) => !v)}
      >
        {batchProgress ? (
          <>
            <Loader2 size={14} className="animate-spin mr-1.5" />
            {isBuilding ? "Building ZIP..." : "Compressing..."}
          </>
        ) : (
          <>
            <Download size={12} className="mr-1.5" />
            Export
            <ChevronDown size={10} className="ml-1" />
          </>
        )}
      </Button>
      {open && (
        <div
          ref={ref}
          className="absolute top-full left-0 mt-1 z-50 w-60 bg-white border border-edge rounded-lg shadow-lg py-1"
        >
          <div className="px-3 py-1.5 border-b border-edge">
            <span className="text-[10px] text-muted font-mono">
              Exporting {rowCount.toLocaleString()} rows × {colCount} columns
            </span>
          </div>

          {/* Row limit selector */}
          <div className="px-3 py-2 border-b border-edge">
            <span className="text-[10px] text-muted uppercase tracking-wider font-semibold">Rows</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {ROW_OPTIONS.map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => onSetExportRowLimit(opt.value)}
                  className={`px-2 py-0.5 text-[10px] rounded border cursor-pointer transition-colors ${
                    exportRowLimit === opt.value
                      ? "bg-accent text-white border-accent"
                      : "bg-white text-primary border-edge hover:bg-slate-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {exportRowLimit === "custom" && (
              <input
                type="number"
                min={1}
                max={filteredTotal}
                value={customRowLimit}
                onChange={(e) => onSetCustomRowLimit(Math.max(1, Math.min(filteredTotal, Number(e.target.value) || 1)))}
                className="mt-1.5 w-full bg-white border border-edge rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            )}
          </div>

          {/* Split mode */}
          <div className="px-3 py-2 border-b border-edge">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted uppercase tracking-wider font-semibold">Split to ZIP</span>
              <button
                onClick={() => onSetSplitMode(!splitMode)}
                className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors cursor-pointer ${splitMode ? "bg-accent" : "bg-edge"}`}
              >
                <span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${splitMode ? "translate-x-3.5" : "translate-x-0.5"}`} />
              </button>
            </div>
            {splitMode && (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[10px] text-muted">Rows per file:</span>
                <input
                  type="number"
                  min={1}
                  value={rowsPerFile}
                  onChange={(e) => onSetRowsPerFile(Math.max(1, Number(e.target.value) || 1))}
                  className="w-16 bg-white border border-edge rounded px-2 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent/50"
                />
                {rowCount > 0 && (
                  <span className="text-[10px] text-muted">→ {Math.ceil(rowCount / rowsPerFile)} files</span>
                )}
              </div>
            )}
          </div>

          <button
            onClick={() => { onExportXlsx(); setOpen(false); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <FileSpreadsheet size={12} className="text-green-600" />
            {splitMode ? "Export ZIP of .xlsx files" : "Export to Excel (.xlsx)"}
          </button>
          <button
            onClick={() => { onExportCsv(); setOpen(false); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Download size={12} className="text-blue-600" />
            {splitMode ? "Export ZIP of .csv files" : "Export to CSV (.csv)"}
          </button>
        </div>
      )}
    </div>
  );
}

function SizeToggle({
  value,
  onChange,
}: {
  value: import("@/lib/types").TableSize;
  onChange: (s: import("@/lib/types").TableSize) => void;
}) {
  const sizes: import("@/lib/types").TableSize[] = ["S", "M", "L"];
  return (
    <div className="inline-flex border border-edge rounded overflow-hidden">
      {sizes.map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={`px-2 py-1 text-[10px] font-bold cursor-pointer transition-colors ${
            value === s
              ? "bg-amber-500 text-white"
              : "bg-white text-muted hover:bg-slate-50"
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}
