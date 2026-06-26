"use client";

import { useRef, useCallback, useEffect, useMemo, useState, Suspense, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { FileKey, OutputRow } from "@/lib/types";
import { OUTPUT_COLUMNS, PRICE_COLUMNS, INTEGER_OUTPUT_COLUMNS } from "@/lib/types";
import { parseFileBuffer, previewFileBuffer, getXLSX } from "@/lib/parsers";
import { formatPriceExport, buildSearchMatcher } from "@/lib/utils";
import { FileDropzone } from "@/components/file-dropzone/file-dropzone";
import { StatChip } from "@/components/status-badge/status-badge";
import { ColumnToggle } from "@/components/column-toggle/column-toggle";
import { Button } from "@/components/ui/button";
import { Play, Loader2, X } from "lucide-react";
import { ExportDropdown, SizeToggle, RightPanel } from "./components/shared";

const FILE_KEYS: FileKey[] = ["shopify", "sales", "stock", "purchase", "items", "published"];

/** Maps OutputRow column keys to their Shopify export header names. */
const EXPORT_KEY_MAP: Partial<Record<string, string>> = {
  ETA: "ETA (product.metafields.custom.eta)",
  "Variant Quantity": "Inventory Quantity",
  B2C: "b2c (product.metafields.custom.b2c)",
};

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

export default function ShopifyProcessorPage() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <ShopifyProcessorInner />
    </Suspense>
  );
}

function ShopifyProcessorInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlTab = (searchParams.get("tab") ?? "output") as "output" | "preview" | "best-seller" | "mapping";
  const [isPending, startTransition] = useTransition();

  const setUrlTab = useCallback((t: "output" | "preview" | "best-seller" | "mapping") => {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("tab", t);
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  }, [searchParams, router]);

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
  const reset      = useAppStore((s) => s.reset);
  const setError = useAppStore((s) => s.setError);

  const statusFilter = useAppStore((s) => s.statusFilter);
  const etaFilter = useAppStore((s) => s.etaFilter);
  const discountFilter = useAppStore((s) => s.discountFilter);
  const policyFilter = useAppStore((s) => s.policyFilter);
  const b2cFilter = useAppStore((s) => s.b2cFilter);
  const dupSkuFilter = useAppStore((s) => s.dupSkuFilter);
  const tagsFilter = useAppStore((s) => s.tagsFilter);
  const setTagsFilter = useAppStore((s) => s.setTagsFilter);
  const search = useAppStore((s) => s.search);
  const setSearch = useAppStore((s) => s.setSearch);
  const setStatusFilter = useAppStore((s) => s.setStatusFilter);
  const setEtaFilter = useAppStore((s) => s.setEtaFilter);
  const setDiscountFilter = useAppStore((s) => s.setDiscountFilter);
  const setPolicyFilter = useAppStore((s) => s.setPolicyFilter);
  const setB2cFilter = useAppStore((s) => s.setB2cFilter);
  const setDupSkuFilter = useAppStore((s) => s.setDupSkuFilter);
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

  const excludeSkus = useAppStore((s) => s.excludeSkus);
  const setExcludeSkus = useAppStore((s) => s.setExcludeSkus);

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

  // Debounced search
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(id);
  }, [searchInput, setSearch]);

  const dupSkuSet = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of results) {
      const sku = r["Variant SKU"].toUpperCase();
      counts.set(sku, (counts.get(sku) ?? 0) + 1);
    }
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([s]) => s));
  }, [results]);

  // Unique tags present across all output rows (case-insensitive dedup, original casing kept)
  const availableTags = useMemo(() => {
    const seen = new Map<string, string>();
    for (const r of results) {
      if (!r.Tags) continue;
      for (const raw of r.Tags.split(",")) {
        const tag = raw.trim();
        if (!tag) continue;
        const key = tag.toLowerCase();
        if (!seen.has(key)) seen.set(key, tag);
      }
    }
    return [...seen.values()].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [results]);

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
    if (dupSkuFilter) data = data.filter((r) => dupSkuSet.has(r["Variant SKU"].toUpperCase()));
    if (tagsFilter.length > 0) {
      // OR semantics: keep rows that contain at least one of the selected tags
      const wanted = new Set(tagsFilter.map((t) => t.toLowerCase()));
      data = data.filter((r) => {
        if (!r.Tags) return false;
        return r.Tags.split(",").some((t) => wanted.has(t.trim().toLowerCase()));
      });
    }
    const matcher = buildSearchMatcher(search);
    if (matcher) {
      data = data.filter((r) =>
        matcher([r["Variant SKU"], r.Title, r.Reference])
      );
    }
    return data;
  }, [results, statusFilter, etaFilter, discountFilter, policyFilter, b2cFilter, dupSkuFilter, dupSkuSet, tagsFilter, search]);

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

  const exportLimit = useMemo(() => {
    if (exportRowLimit === "all") return sortedRows.length;
    if (exportRowLimit === "custom") return Math.min(customRowLimit, sortedRows.length);
    return Math.min(exportRowLimit, sortedRows.length);
  }, [exportRowLimit, customRowLimit, sortedRows.length]);

  const isFiltered = statusFilter !== "all" || etaFilter !== "all" || discountFilter !== "all" || policyFilter !== "all" || b2cFilter !== "all" || dupSkuFilter || tagsFilter.length > 0 || search !== "";

  useEffect(() => {
    workerRef.current = new Worker(
      new URL("../../workers/shopify.worker.ts", import.meta.url)
    );

    workerRef.current.onmessage = (e: MessageEvent<import("@/lib/types").WorkerResponse>) => {
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

  const buildExportData = useCallback(() => {
    const excludeSet = new Set(
      excludeSkus.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
    );
    const rows = sortedRows
      .filter((r) => !excludeSet.has(r["Variant SKU"].toUpperCase()))
      .slice(0, exportLimit);
    return rows.map((row, i) => {
      const obj: Record<string, unknown> = {};
      for (const key of visibleColumns) {
        const exportKey = EXPORT_KEY_MAP[key] ?? key;
        if (key === "No") {
          obj[exportKey] = i + 1;
        } else if (key === "B2C") {
          obj[exportKey] = row[key] === "Yes" ? "TRUE" : "FALSE";
        } else if (PRICE_COLUMNS.has(key)) {
          obj[exportKey] = formatPriceExport(row[key] as number | null) || 0;
        } else if (INTEGER_OUTPUT_COLUMNS.has(key)) {
          const n = row[key] as number | null;
          obj[exportKey] = n !== null && n !== undefined ? Math.round(n) : 0;
        } else {
          obj[exportKey] = row[key];
        }
      }
      return obj;
    });
  }, [sortedRows, exportLimit, visibleColumns, excludeSkus]);

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

    const rows = sortedRows
      .filter((r) => !new Set(excludeSkus.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)).has(r["Variant SKU"].toUpperCase()))
      .slice(0, exportLimit);
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
      const chunkData = chunks[i].map((row, j) => {
        const obj: Record<string, unknown> = {};
        for (const key of visibleColumns) {
          const exportKey = EXPORT_KEY_MAP[key] ?? key;
          if (key === "No") obj[exportKey] = startRow + j;
          else if (key === "B2C") obj[exportKey] = row[key] === "Yes" ? "TRUE" : "FALSE";
          else if (PRICE_COLUMNS.has(key)) obj[exportKey] = formatPriceExport(row[key] as number | null) || 0;
          else if (INTEGER_OUTPUT_COLUMNS.has(key)) { const n = row[key] as number | null; obj[exportKey] = n !== null && n !== undefined ? Math.round(n) : 0; }
          else obj[exportKey] = row[key];
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
  }, [splitMode, buildExportData, sortedRows, exportLimit, rowsPerFile, visibleColumns, setBatchProgress, setExportSuccessMsg, excludeSkus]);

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

    const rows = sortedRows
      .filter((r) => !new Set(excludeSkus.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)).has(r["Variant SKU"].toUpperCase()))
      .slice(0, exportLimit);
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
      const chunkData = chunks[i].map((row, j) => {
        const obj: Record<string, unknown> = {};
        for (const key of visibleColumns) {
          const exportKey = EXPORT_KEY_MAP[key] ?? key;
          if (key === "No") obj[exportKey] = startRow + j;
          else if (key === "B2C") obj[exportKey] = row[key] === "Yes" ? "TRUE" : "FALSE";
          else if (PRICE_COLUMNS.has(key)) obj[exportKey] = formatPriceExport(row[key] as number | null) || 0;
          else if (INTEGER_OUTPUT_COLUMNS.has(key)) { const n = row[key] as number | null; obj[exportKey] = n !== null && n !== undefined ? Math.round(n) : 0; }
          else obj[exportKey] = row[key];
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
  }, [splitMode, buildExportData, sortedRows, exportLimit, rowsPerFile, visibleColumns, setBatchProgress, setExportSuccessMsg, excludeSkus]);

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
    <div className="flex flex-col flex-1 min-h-0">
      {/* Top Bar */}
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
              <button
                onClick={reset}
                className="flex items-center gap-1.5 text-[11px] text-muted hover:text-red-500 transition-colors cursor-pointer ml-1"
              >
                <X size={12} />
                Reset Data
              </button>
              <div className="w-px h-5 bg-edge shrink-0" />
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
                excludeSkus={excludeSkus}
                onSetExcludeSkus={setExcludeSkus}
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

      {/* Main Content */}
      <div className="flex flex-1 min-h-0">
        <div className="w-[260px] shrink-0 border-r border-edge bg-surface/50 p-3 overflow-y-auto">
          <FileDropzone />
        </div>

        <div className={cn("flex-1 flex flex-col min-w-0 transition-opacity duration-300", isPending ? "opacity-50" : "opacity-100 animate-in fade-in slide-in-from-bottom-2 duration-500")}>
          <RightPanel
            isFiltered={isFiltered}
            statusFilter={statusFilter}
            etaFilter={etaFilter}
            discountFilter={discountFilter}
            policyFilter={policyFilter}
            b2cFilter={b2cFilter}
            dupSkuFilter={dupSkuFilter}
            dupSkuCount={dupSkuSet.size}
            tagsFilter={tagsFilter}
            availableTags={availableTags}
            setStatusFilter={setStatusFilter}
            setEtaFilter={setEtaFilter}
            setDiscountFilter={setDiscountFilter}
            setPolicyFilter={setPolicyFilter}
            setB2cFilter={setB2cFilter}
            setDupSkuFilter={setDupSkuFilter}
            setTagsFilter={setTagsFilter}
            activeTab={urlTab}
            onTabChange={setUrlTab}
          />
        </div>
      </div>
    </div>
  );
}
