"use client";

import { useState, useCallback, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { parseFileBuffer, getXLSX } from "@/lib/parsers";
import { cn } from "@/lib/utils";
import {
  transformToShopify,
  collectStudioSkus,
  generateCsv,
  SHOPIFY_COLUMNS,
  DISPLAY_COLUMNS,
  type MappingResult,
  type MappedProduct,
} from "@/lib/mapping/shopify-mapping";
import type { TableSize } from "@/lib/types";
import { TABLE_SIZE_CONFIG } from "@/lib/types";
import { SizeToggle } from "./shared";
import {
  Upload, CheckCircle2, Play, Loader2, Download, X, FileSpreadsheet,
  ArrowUp, ArrowDown, ArrowUpDown, Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

type StatusFilter = "all" | "active" | "draft";
type ImageFilter = "all" | "yes" | "no";

// ── Single dropzone ────────────────────────────────────────────────────────
function FileSlot({
  file,
  label,
  hint,
  accept,
  onPick,
  onClear,
}: {
  file: File | null;
  label: string;
  hint: string;
  accept: Record<string, string[]>;
  onPick: (f: File) => void;
  onClear: () => void;
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (a) => a.length > 0 && onPick(a[0]),
    accept,
    multiple: false,
  });
  return (
    <div
      {...getRootProps()}
      className={cn(
        "border rounded-md p-3 cursor-pointer transition-all duration-200 min-w-[210px]",
        isDragActive && "border-accent bg-blue-50 scale-[1.02]",
        file ? "border-emerald-300 bg-emerald-50" : "border-edge hover:border-muted bg-white"
      )}
    >
      <input {...getInputProps()} />
      <div className="flex items-center gap-2">
        {file ? (
          <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
        ) : (
          <Upload size={14} className="text-muted shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-xs font-medium text-primary truncate max-w-[160px]">
            {file ? file.name : label}
          </p>
          <p className="text-[10px] text-muted mt-0.5">{file ? "Click to replace" : hint}</p>
        </div>
        {file && (
          <button
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="ml-1 text-muted hover:text-red-500 transition-colors cursor-pointer"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

export function MasterMappingTab() {
  const [masterFile, setMasterFile] = useState<File | null>(null);
  const [itemsFile, setItemsFile] = useState<File | null>(null);
  const [result, setResult] = useState<MappingResult | null>(null);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Table controls
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [imageFilter, setImageFilter] = useState<ImageFilter>("all");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [size, setSize] = useState<TableSize>("M");

  const reset = (m: File | null, it: File | null) => {
    setResult(null);
    setError(null);
    setMasterFile(m);
    setItemsFile(it);
  };

  const handleProcess = useCallback(async () => {
    if (!masterFile) return;
    setProcessing(true);
    setError(null);
    try {
      const masterRows = await parseFileBuffer(await masterFile.arrayBuffer());
      if (masterRows.length === 0) throw new Error("No rows found in the master file.");

      let allowed: Set<string> | null = null;
      if (itemsFile) {
        const itemRows = await parseFileBuffer(await itemsFile.arrayBuffer());
        allowed = collectStudioSkus(itemRows);
        if (allowed.size === 0)
          throw new Error("No item codes found in the studio items file (expected a 'Code' column).");
      }

      const mapped = transformToShopify(masterRows, allowed);
      if (mapped.products.length === 0)
        throw new Error(
          allowed
            ? "No master products matched the studio item list."
            : "No products with an Sku were found in the master file."
        );
      setResult(mapped);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessing(false);
    }
  }, [masterFile, itemsFile]);

  const toggleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev !== key) { setSortDir("asc"); return key; }
      if (sortDir === "asc") { setSortDir("desc"); return key; }
      return null;
    });
  }, [sortDir]);

  // ── Filter + sort products ───────────────────────────────────────────────
  const visible = useMemo(() => {
    if (!result) return [];
    let data: MappedProduct[] = result.products;
    if (statusFilter !== "all") data = data.filter((p) => p.status === statusFilter);
    if (imageFilter === "yes") data = data.filter((p) => p.imageCount > 0);
    else if (imageFilter === "no") data = data.filter((p) => p.imageCount === 0);
    const q = search.trim().toLowerCase();
    if (q) {
      const terms = q.split(",").map((t) => t.trim()).filter(Boolean);
      data = data.filter((p) =>
        terms.some((t) =>
          p.sku.toLowerCase().includes(t) ||
          p.title.toLowerCase().includes(t) ||
          p.handle.toLowerCase().includes(t)
        )
      );
    }
    if (sortKey) {
      const dir = sortDir === "asc" ? 1 : -1;
      const num = DISPLAY_COLUMNS.find((c) => c.key === sortKey)?.numeric;
      data = [...data].sort((a, b) => {
        const av = a.main[sortKey] ?? "";
        const bv = b.main[sortKey] ?? "";
        if (av === "" && bv === "") return 0;
        if (av === "") return 1;
        if (bv === "") return -1;
        if (num) return (parseFloat(av) - parseFloat(bv)) * dir;
        return av.localeCompare(bv, undefined, { sensitivity: "base" }) * dir;
      });
    }
    return data;
  }, [result, statusFilter, imageFilter, search, sortKey, sortDir]);

  const isFiltered = statusFilter !== "all" || imageFilter !== "all" || search.trim() !== "";

  // Rows for export honour the current filter (main + extra image rows)
  const exportRows = useMemo(() => visible.flatMap((p) => p.rows), [visible]);

  const handleDownloadCsv = useCallback(() => {
    if (exportRows.length === 0) return;
    const date = new Date().toISOString().slice(0, 10);
    const blob = new Blob([generateCsv(exportRows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shopify-import-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportRows]);

  const handleDownloadXlsx = useCallback(async () => {
    if (exportRows.length === 0) return;
    const XLSX = await getXLSX();
    const date = new Date().toISOString().slice(0, 10);
    const ws = XLSX.utils.json_to_sheet(exportRows, { header: SHOPIFY_COLUMNS });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Shopify Import");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shopify-import-${date}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportRows]);

  const cfg = TABLE_SIZE_CONFIG[size];

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-edge bg-surface/50 px-4 py-3 flex flex-col gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <FileSlot
            file={masterFile}
            label="Master Data File"
            hint="KATANAPIM .xlsx"
            accept={{
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
              "application/vnd.ms-excel": [".xls"],
            }}
            onPick={(f) => reset(f, itemsFile)}
            onClear={() => reset(null, itemsFile)}
          />
          <FileSlot
            file={itemsFile}
            label="Studio Items File"
            hint="LogItemSearch .csv (studio SKUs)"
            accept={{
              "text/csv": [".csv"],
              "application/vnd.ms-excel": [".csv", ".xls"],
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
            }}
            onPick={(f) => reset(masterFile, f)}
            onClear={() => reset(masterFile, null)}
          />

          <Button variant="accent" size="sm" onClick={handleProcess} disabled={!masterFile || processing}>
            {processing ? <Loader2 size={14} className="animate-spin mr-1.5" /> : <Play size={12} className="mr-1.5" />}
            {processing ? "Mapping..." : "Map to Shopify"}
          </Button>

          {result && (
            <>
              <div className="w-px h-5 bg-edge shrink-0" />
              <Button variant="accent" size="sm" onClick={handleDownloadCsv}>
                <Download size={12} className="mr-1.5" />
                Download Shopify CSV
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadXlsx}>
                <FileSpreadsheet size={12} className="mr-1.5 text-green-600" />
                XLSX
              </Button>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search SKU / title / handle..."
                className="bg-white border border-edge rounded px-2.5 py-1 text-xs font-mono w-56 focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
              <SizeToggle value={size} onChange={setSize} />
              <span className="text-[11px] text-muted font-mono ml-auto">
                {isFiltered
                  ? `${visible.length.toLocaleString()} / ${result.stats.products.toLocaleString()} products (filtered)`
                  : `${result.stats.products.toLocaleString()} products`}
              </span>
            </>
          )}

          {!result && (
            <span className="text-[11px] text-muted font-mono ml-auto">
              {itemsFile ? "studio filter ON" : "no studio filter — maps all products"}
            </span>
          )}
        </div>

        {/* Summary chips */}
        {result && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Stat label="Products" value={result.stats.products} accent />
            <Stat label="Master" value={result.stats.masterTotal} />
            {result.stats.skippedNotStudio > 0 && (
              <Stat label="Skipped (non-studio)" value={result.stats.skippedNotStudio} warn />
            )}
            <Stat label="Images" value={result.stats.totalImages} />
            <Stat label="CSV Rows" value={result.stats.totalRows} />
            <Stat label="Published" value={result.stats.publishedTrue} />
            {result.stats.missingRequired > 0 && (
              <Stat label="Missing required" value={result.stats.missingRequired} warn />
            )}
          </div>
        )}

        {/* Filters */}
        {result && (
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[11px] text-muted uppercase tracking-wider font-semibold">Filters</span>
            <Select label="Status" value={statusFilter} onChange={(v) => setStatusFilter(v as StatusFilter)}
              options={[["all", "All"], ["active", "Active"], ["draft", "Draft"]]} />
            <Select label="Images" value={imageFilter} onChange={(v) => setImageFilter(v as ImageFilter)}
              options={[["all", "All"], ["yes", "Has images"], ["no", "No images"]]} />
            {isFiltered && (
              <button
                onClick={() => { setStatusFilter("all"); setImageFilter("all"); setSearch(""); }}
                className="text-[11px] text-muted hover:text-red-500 transition-colors cursor-pointer flex items-center gap-1"
              >
                <X size={11} /> Clear
              </button>
            )}
          </div>
        )}

        {error && (
          <div className="px-3 py-2 rounded bg-red-50 border border-red-200 text-red-600 text-xs font-mono">
            {error}
          </div>
        )}
      </div>

      {/* ── Table ───────────────────────────────────────────────────── */}
      {result ? (
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="border-collapse" style={{ minWidth: "100%" }}>
            <thead className="sticky top-0 z-10">
              <tr className="bg-surface border-b border-edge">
                <th
                  className="px-2 text-left text-[11px] text-muted font-semibold sticky left-0 bg-surface z-20"
                  style={{ width: 44, height: 36 }}
                >
                  No
                </th>
                {DISPLAY_COLUMNS.map((c) => {
                  const sorted = sortKey === c.key;
                  return (
                    <th
                      key={c.key}
                      onClick={() => toggleSort(c.key)}
                      className={cn(
                        "px-2 text-left text-[11px] font-semibold uppercase tracking-wider cursor-pointer select-none hover:text-primary transition-colors whitespace-nowrap",
                        sorted ? "text-amber-600" : "text-muted"
                      )}
                      style={{ minWidth: c.width }}
                    >
                      <span className="inline-flex items-center gap-1">
                        {c.label}
                        {sorted ? (
                          sortDir === "asc" ? <ArrowUp size={10} /> : <ArrowDown size={10} />
                        ) : (
                          <ArrowUpDown size={10} className="opacity-20" />
                        )}
                      </span>
                    </th>
                  );
                })}
                <th className="px-2 text-left text-[11px] text-muted font-semibold whitespace-nowrap" style={{ width: 70 }}>
                  Images
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p, i) => (
                <tr
                  key={p.handle + i}
                  className={cn(
                    "border-b border-edge/60",
                    p.status === "draft" ? "bg-zinc-50/60" : i % 2 === 0 ? "bg-white" : "bg-surface/30",
                    "hover:bg-blue-50/40"
                  )}
                  style={{ height: cfg.rowHeight }}
                >
                  <td className="px-2 text-muted font-mono sticky left-0 bg-inherit" style={{ fontSize: cfg.fontSize }}>
                    {i + 1}
                  </td>
                  {DISPLAY_COLUMNS.map((c) => (
                    <td
                      key={c.key}
                      className={cn("px-2", c.numeric ? "font-mono text-right" : "")}
                      style={{ fontSize: cfg.fontSize, maxWidth: c.width }}
                    >
                      <CellValue colKey={c.key} value={p.main[c.key] ?? ""} />
                    </td>
                  ))}
                  <td className="px-2" style={{ fontSize: cfg.fontSize }}>
                    <span className={cn("inline-flex items-center gap-1", p.imageCount > 0 ? "text-primary" : "text-amber-600")}>
                      <ImageIcon size={11} />{p.imageCount}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 && (
            <div className="py-12 text-center text-muted text-xs">No products match the current filters.</div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted">
            <p className="text-sm font-medium">No mapping yet</p>
            <p className="text-[11px] mt-1 max-w-sm">
              Upload the KATANAPIM master XLSX and the studio items file, then click
              &ldquo;Map to Shopify&rdquo;. Only SKUs present in the studio items file are exported.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Cell rendering ──────────────────────────────────────────────────────────
function CellValue({ colKey, value }: { colKey: string; value: string }) {
  if (value === "") return <span className="text-muted/40">—</span>;
  if (colKey === "Status") {
    return (
      <span className={cn(
        "px-1.5 py-0.5 rounded text-[10px] font-semibold",
        value === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
      )}>
        {value}
      </span>
    );
  }
  if (colKey === "Published") {
    return (
      <span className={cn("text-[10px] font-semibold", value === "TRUE" ? "text-emerald-600" : "text-slate-400")}>
        {value}
      </span>
    );
  }
  return <span className="block truncate" title={value}>{value}</span>;
}

function Stat({ label, value, accent, warn }: { label: string; value: number; accent?: boolean; warn?: boolean }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 text-[11px] font-mono rounded px-2 py-0.5 border",
      warn ? "bg-amber-50 text-amber-700 border-amber-200"
        : accent ? "bg-accent/10 text-accent border-accent/20"
        : "bg-surface text-muted border-edge"
    )}>
      <span className="uppercase tracking-wider">{label}</span>
      <span className="font-semibold">{value.toLocaleString()}</span>
    </span>
  );
}

function Select({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-muted">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-white border border-edge rounded px-2 py-1 text-xs text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent/50 cursor-pointer"
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
