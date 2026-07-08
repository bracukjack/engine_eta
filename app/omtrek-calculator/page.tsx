"use client";

import { useState, useCallback, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseFileBuffer } from "@/lib/parsers";
import { exportToCsv } from "@/lib/utils";
import {
  Ruler,
  Upload,
  Download,
  X,
  AlertTriangle,
} from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { VirtualDataTable, type VDTColumnMeta } from "@/components/data-table/virtual-data-table";

// ── Types ─────────────────────────────────────────────────────────────────────

type ActiveTab = "single" | "bulk";
type FilterMode = "all" | "over" | "under";
type SortCol = "code" | "description" | "class04" | "l" | "w" | "h" | "omtrek";
type SortDir = "asc" | "desc";

interface OmtrekResult {
  code: string;
  description: string;
  class04: string;
  l: number;
  w: number;
  h: number;
  omtrek: number;
  overLimit: boolean;
}

// ── Logic ─────────────────────────────────────────────────────────────────────

function hitungOmtrek(l: number, w: number, h: number): number {
  const vals = [l, w, h];
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const median = vals.reduce((a, b) => a + b, 0) - max - min;
  return max + (2 * median) + (2 * min);
}

function parseNilai(val: unknown): number {
  if (val === null || val === undefined || val === "") return NaN;
  const s = String(val).trim().replace(",", ".");
  return parseFloat(s);
}

function getBreakdown(l: number, w: number, h: number) {
  const pairs = [
    { label: "L", val: l },
    { label: "W", val: w },
    { label: "H", val: h },
  ].sort((a, b) => b.val - a.val) as [{ label: string; val: number }, { label: string; val: number }, { label: string; val: number }];
  return { max: pairs[0], median: pairs[1], min: pairs[2] };
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function OmtrekCalculatorPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("single");

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-edge bg-surface px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-sm font-semibold text-primary tracking-tight mr-2">
            Omtrek Calculator
          </h1>
          <div className="flex items-center gap-1 bg-panel border border-edge rounded-md p-0.5">
            {(["single", "bulk"] as ActiveTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 h-6 text-[11px] font-semibold rounded transition-colors",
                  activeTab === t
                    ? "bg-white text-primary shadow-sm border border-edge"
                    : "text-muted hover:text-primary"
                )}
              >
                {t === "single" ? "Single Item" : "Bulk CSV"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "single" ? <SingleTab /> : <BulkTab />}
      </div>
    </div>
  );
}

// ── Single Tab ────────────────────────────────────────────────────────────────

function SingleTab() {
  const [l, setL] = useState("");
  const [w, setW] = useState("");
  const [h, setH] = useState("");
  const [threshold, setThreshold] = useState("250");

  const lv = parseNilai(l);
  const wv = parseNilai(w);
  const hv = parseNilai(h);
  const tv = parseNilai(threshold);

  const valid = !isNaN(lv) && !isNaN(wv) && !isNaN(hv) && lv > 0 && wv > 0 && hv > 0;
  const omtrek = valid ? hitungOmtrek(lv, wv, hv) : null;
  const over = omtrek !== null && !isNaN(tv) ? omtrek > tv : null;
  const breakdown = valid ? getBreakdown(lv, wv, hv) : null;

  const inputCls =
    "w-full h-8 px-3 text-sm font-mono bg-white border border-edge rounded focus:outline-none focus:ring-2 focus:ring-accent/30";

  return (
    <div className="max-w-sm">
      <div className="bg-surface border border-edge rounded-lg overflow-hidden">
        <div className="px-4 py-2 border-b border-edge bg-panel">
          <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">
            Dimensions
          </span>
        </div>

        <div className="px-4 py-4 space-y-3">
          {(
            [
              { label: "L (cm)", val: l, set: setL },
              { label: "W (cm)", val: w, set: setW },
              { label: "H (cm)", val: h, set: setH },
            ] as { label: string; val: string; set: (v: string) => void }[]
          ).map(({ label, val, set }) => (
            <div key={label} className="flex items-center gap-3">
              <label className="text-xs font-mono text-muted w-16 shrink-0">
                {label}
              </label>
              <input
                type="text"
                value={val}
                onChange={(e) => set(e.target.value)}
                placeholder="0"
                className={inputCls}
              />
            </div>
          ))}

          <div className="pt-2 border-t border-edge">
            <div className="flex items-center gap-3">
              <label className="text-xs font-mono text-muted w-16 shrink-0">
                Limit (cm)
              </label>
              <input
                type="text"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* Result */}
        {omtrek !== null && breakdown && (
          <div className="border-t border-edge px-4 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted font-mono">Omtrek</span>
              <span className="text-2xl font-bold font-mono text-primary">
                {omtrek.toFixed(1)} cm
              </span>
            </div>

            {over !== null && (
              <div
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded text-xs font-semibold",
                  over
                    ? "bg-red-50 text-red-600 border border-red-200"
                    : "bg-green-50 text-green-700 border border-green-200"
                )}
              >
                {over ? "✗ Over limit" : "✓ Under limit"}
                {!isNaN(tv) && (
                  <span className="font-normal ml-auto text-[11px]">
                    {over
                      ? `+${(omtrek - tv).toFixed(1)}`
                      : `-${(tv - omtrek).toFixed(1)}`}{" "}
                    cm
                  </span>
                )}
              </div>
            )}

            {/* Breakdown */}
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted font-mono uppercase tracking-wide">
                Breakdown
              </p>
              <div className="text-[11px] font-mono space-y-1 text-muted">
                <div className="flex justify-between">
                  <span className="text-primary font-semibold">
                    MAX ({breakdown.max.label})
                  </span>
                  <span>{breakdown.max.val.toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span>2 × MEDIAN ({breakdown.median.label})</span>
                  <span>{(2 * breakdown.median.val).toFixed(1)}</span>
                </div>
                <div className="flex justify-between">
                  <span>2 × MIN ({breakdown.min.label})</span>
                  <span>{(2 * breakdown.min.val).toFixed(1)}</span>
                </div>
                <div className="flex justify-between border-t border-edge pt-1 text-primary font-semibold">
                  <span>Total</span>
                  <span>{omtrek.toFixed(1)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {!valid && (l || w || h) && (
          <div className="border-t border-edge px-4 py-3">
            <p className="text-xs text-muted">
              Enter valid L, W, and H values (&gt; 0).
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Bulk Tab ──────────────────────────────────────────────────────────────────

function BulkTab() {
  const [rawResults, setRawResults] = useState<OmtrekResult[]>([]);
  const [totalFileRows, setTotalFileRows] = useState<number>(0);
  const [threshold, setThreshold] = useState("250");
  const [filter, setFilter] = useState<FilterMode>("all");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<SortCol>("omtrek");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [skuQuery, setSkuQuery] = useState("");

  const tv = parseNilai(threshold);

  const results = useMemo<OmtrekResult[]>(
    () =>
      rawResults.map((r) => ({
        ...r,
        overLimit: !isNaN(tv) ? r.omtrek > tv : false,
      })),
    [rawResults, tv]
  );

  const summary = useMemo(() => {
    const total = results.length;
    const over = results.filter((r) => r.overLimit).length;
    return { total, over, under: total - over };
  }, [results]);

  const filtered = useMemo(() => {
    let data = results;
    if (filter === "over") data = data.filter((r) => r.overLimit);
    else if (filter === "under") data = data.filter((r) => !r.overLimit);
    return [...data].sort((a, b) => {
      const av = a[sortCol];
      const bv = b[sortCol];
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [results, filter, sortCol, sortDir]);

  const lookup = useMemo(() => {
    const tokens = skuQuery.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (tokens.length === 0) return null;
    const map = new Map(results.map((r) => [r.code.toLowerCase(), r]));
    const seen = new Set<string>();
    const rows: { sku: string; result: OmtrekResult | null }[] = [];
    for (const s of tokens) {
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ sku: s, result: map.get(key) ?? null });
    }
    const over = rows.filter((r) => r.result?.overLimit).length;
    const under = rows.filter((r) => r.result && !r.result.overLimit).length;
    const notFound = rows.filter((r) => !r.result).length;
    return { rows, over, under, notFound };
  }, [skuQuery, results]);

  const handleExportLookup = useCallback(() => {
    if (!lookup) return;
    exportToCsv(
      ["SKU", "Description", "Omtrek (cm)", "Status"],
      lookup.rows.map(({ sku, result }) => [
        sku,
        result?.description ?? "",
        result ? result.omtrek : "",
        result ? (result.overLimit ? "Over Limit" : "Under Limit") : "Not Found",
      ]),
      `omtrek-sku-lookup-${new Date().toISOString().slice(0, 10)}`
    );
  }, [lookup]);

  const handleSort = useCallback(
    (col: SortCol) => {
      if (sortCol === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortCol(col);
        setSortDir("asc");
      }
    },
    [sortCol]
  );

  const onDrop = useCallback(
    async (accepted: File[]) => {
      const file = accepted[0];
      if (!file) return;
      setError(null);
      setWarning(null);
      setFileName(file.name);

      try {
        const buf = await file.arrayBuffer();
        const rows = await parseFileBuffer(buf);

        setTotalFileRows(rows.length);
        const parsed: OmtrekResult[] = [];
        let skipped = 0;

        // Locate Class_04Description column (case-insensitive key match)
        const allKeys = rows.length > 0 ? Object.keys(rows[0]!) : [];
        const class04Col =
          allKeys.find((k) => k.trim().toLowerCase() === "class_04description") ??
          "Class_04Description";

        // Required filter: only rows where Class_04Description matches "BB_Living" (case-insensitive)
        const bb_living = rows.filter(
          (r) => String(r[class04Col] ?? "").trim().toLowerCase() === "bb_living"
        );

        if (bb_living.length === 0) {
          const sample = rows.length > 0
            ? `(sample value: "${String(rows[0]![class04Col] ?? "—").trim()}")`
            : "";
          setError(
            `No BB_Living rows found in this file. ` +
            `Detected column: "${class04Col}" ${sample}.`
          );
          return;
        }

        for (const row of bb_living) {
          const lRaw =
            row["Extra field:  Packaging - L (cm)"] ??
            row["Extra field: Packaging - L (cm)"] ??
            row["L (cm)"] ??
            row["L"] ??
            null;
          const wRaw =
            row["Extra field: Packaging - W (cm)"] ??
            row["Extra field:  Packaging - W (cm)"] ??
            row["W (cm)"] ??
            row["W"] ??
            null;
          const hRaw =
            row["Extra field:  Packaging - H (cm)"] ??
            row["Extra field: Packaging - H (cm)"] ??
            row["H (cm)"] ??
            row["H"] ??
            null;

          const lv = parseNilai(lRaw);
          const wv = parseNilai(wRaw);
          const hv = parseNilai(hRaw);

          if (isNaN(lv) || isNaN(wv) || isNaN(hv)) {
            skipped++;
            continue;
          }

          const omtrek = hitungOmtrek(lv, wv, hv);
          const thresholdVal = parseNilai(threshold);
          parsed.push({
            code: String(row["Code"] ?? row["SKU"] ?? row["ItemCode"] ?? "").trim(),
            description: String(row["Description"] ?? row["Name"] ?? row["Title"] ?? "").trim(),
            class04: String(row[class04Col] ?? "").trim(),
            l: lv,
            w: wv,
            h: hv,
            omtrek,
            overLimit: !isNaN(thresholdVal) ? omtrek > thresholdVal : false,
          });
        }

        if (parsed.length === 0) {
          setError(
            `No valid rows from ${bb_living.length} BB_Living rows.` +
            (skipped > 0 ? ` ${skipped} rows skipped (Packaging dimensions empty or invalid).` : "")
          );
        } else {
          setRawResults(parsed);
          if (skipped > 0)
            setWarning(`${skipped} BB_Living rows skipped due to invalid Packaging dimensions.`);
        }
      } catch (err) {
        setError(
          `Failed to read file: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    },
    [threshold]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
    },
    multiple: false,
  });

  const handleExport = useCallback(() => {
    const overRows = results.filter((r) => r.overLimit);
    if (overRows.length === 0) return;
    exportToCsv(
      ["Code", "Description", "Class_04Description", "L (cm)", "W (cm)", "H (cm)", "Omtrek (cm)", "Status"],
      overRows.map((r) => [
        r.code,
        r.description,
        r.class04,
        r.l,
        r.w,
        r.h,
        r.omtrek,
        "Over Limit",
      ]),
      `omtrek-over-limit-${new Date().toISOString().slice(0, 10)}`
    );
  }, [results]);

  const handleClear = useCallback(() => {
    setRawResults([]);
    setTotalFileRows(0);
    setFileName(null);
    setError(null);
    setWarning(null);
    setSkuQuery("");
  }, []);

  const columns = useMemo<ColumnDef<OmtrekResult>[]>(() => [
    { id: "code", header: "Code", size: 130, meta: { cellClassName: "font-mono text-primary" } as VDTColumnMeta, cell: ({ row }) => row.original.code || "—" },
    { id: "description", header: "Description", size: 220, meta: { cellClassName: "text-primary" } as VDTColumnMeta, cell: ({ row }) => row.original.description || "—" },
    { id: "class04", header: "Class_04Description", size: 180, meta: { cellClassName: "font-mono text-muted" } as VDTColumnMeta, cell: ({ row }) => row.original.class04 },
    { id: "l", header: "L (cm)", size: 90, meta: { cellClassName: "font-mono text-right" } as VDTColumnMeta, cell: ({ row }) => row.original.l.toFixed(1) },
    { id: "w", header: "W (cm)", size: 90, meta: { cellClassName: "font-mono text-right" } as VDTColumnMeta, cell: ({ row }) => row.original.w.toFixed(1) },
    { id: "h", header: "H (cm)", size: 90, meta: { cellClassName: "font-mono text-right" } as VDTColumnMeta, cell: ({ row }) => row.original.h.toFixed(1) },
    { id: "omtrek", header: "Omtrek (cm)", size: 120, meta: { cellClassName: "font-mono font-semibold text-right" } as VDTColumnMeta, cell: ({ row }) => row.original.omtrek.toFixed(1) },
    {
      id: "__status", header: "Status", size: 100, meta: { sortable: false } as VDTColumnMeta,
      cell: ({ row }) => (
        <span className={cn("inline-block px-2 py-0.5 rounded text-[10px] font-semibold", row.original.overLimit ? "bg-red-100 text-red-600" : "bg-green-100 text-green-700")}>
          {row.original.overLimit ? "Over" : "Under"}
        </span>
      ),
    },
  ], []);

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs font-mono text-muted whitespace-nowrap">
            Omtrek Limit (cm)
          </label>
          <input
            type="text"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className="w-24 h-7 px-2.5 text-xs font-mono bg-white border border-edge rounded focus:outline-none focus:ring-2 focus:ring-accent/30"
          />
        </div>

        {results.length > 0 && (
          <>
            <div className="flex items-center gap-1 bg-panel border border-edge rounded-md p-0.5">
              {(
                [
                  ["all", "All"],
                  ["over", "Over"],
                  ["under", "Under"],
                ] as [FilterMode, string][]
              ).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFilter(val)}
                  className={cn(
                    "px-2.5 h-6 text-[11px] font-semibold rounded transition-colors",
                    filter === val
                      ? "bg-white text-primary shadow-sm border border-edge"
                      : "text-muted hover:text-primary"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <Button
              variant="default"
              size="sm"
              onClick={handleExport}
              disabled={summary.over === 0}
            >
              <Download size={12} className="mr-1.5" />
              Export Over ({summary.over})
            </Button>

            <button
              onClick={handleClear}
              className="flex items-center gap-1 text-[11px] text-muted hover:text-red-500 transition-colors"
            >
              <X size={11} />
              Reset
            </button>
          </>
        )}
      </div>

      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 cursor-pointer transition-all duration-200 text-center select-none",
          isDragActive
            ? "border-accent bg-blue-50"
            : "border-edge hover:border-accent/40 bg-surface"
        )}
      >
        <input {...getInputProps()} />
        <Upload
          size={22}
          className={cn(
            "mx-auto mb-2.5",
            isDragActive ? "text-accent" : "text-muted"
          )}
        />
        <p className="text-sm font-medium text-primary">
          {isDragActive
            ? "Drop file here"
            : fileName
              ? `File: ${fileName}`
              : "Drag & drop CSV/XLSX, or click to browse"}
        </p>
        <p className="text-[11px] text-muted mt-1 font-mono">.csv · .xlsx</p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          <AlertTriangle size={12} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Warning */}
      {warning && !error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
          <AlertTriangle size={12} className="shrink-0" />
          {warning}
        </div>
      )}

      {/* BB_Living filter info */}
      {results.length > 0 && totalFileRows > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 bg-panel border border-edge rounded text-[11px] font-mono text-muted">
          <span>
            From <span className="text-primary font-semibold">{totalFileRows.toLocaleString("en-US")}</span> total rows,{" "}
            <span className="text-primary font-semibold">{results.length.toLocaleString("en-US")}</span> processed
            {" "}(<span className="text-accent">BB_Living</span>)
          </span>
        </div>
      )}

      {/* Summary cards */}
      {results.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              { label: "Total", val: summary.total, variant: "neutral" },
              { label: "Under", val: summary.under, variant: "green" },
              { label: "Over", val: summary.over, variant: "red" },
            ] as { label: string; val: number; variant: string }[]
          ).map(({ label, val, variant }) => (
            <div
              key={label}
              className={cn(
                "border rounded-lg px-4 py-3 text-center",
                variant === "green"
                  ? "border-green-200 bg-green-50/50"
                  : variant === "red"
                    ? "border-red-200 bg-red-50/50"
                    : "border-edge bg-surface"
              )}
            >
              <p className="text-[11px] text-muted font-mono uppercase tracking-wide">
                {label}
              </p>
              <p
                className={cn(
                  "text-2xl font-bold font-mono mt-0.5",
                  variant === "green"
                    ? "text-green-700"
                    : variant === "red"
                      ? "text-red-600"
                      : "text-primary"
                )}
              >
                {val.toLocaleString("en-US")}
              </p>
              <p className="text-[11px] text-muted font-mono mt-0.5">
                {((val / results.length) * 100).toFixed(1)}%
              </p>
            </div>
          ))}
        </div>
      )}

      {/* SKU Lookup */}
      {results.length > 0 && (
        <div className="bg-surface border border-edge rounded-lg overflow-hidden">
          <div className="px-4 py-2 border-b border-edge bg-panel flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted uppercase tracking-wide">
              SKU Lookup
            </span>
            <div className="flex items-center gap-3">
              {lookup && (
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleExportLookup}
                >
                  <Download size={12} className="mr-1.5" />
                  Export
                </Button>
              )}
              {skuQuery && (
                <button
                  onClick={() => setSkuQuery("")}
                  className="flex items-center gap-1 text-[11px] text-muted hover:text-red-500 transition-colors"
                >
                  <X size={11} />
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="px-4 py-3 space-y-3">
            <textarea
              value={skuQuery}
              onChange={(e) => setSkuQuery(e.target.value)}
              placeholder="Paste SKUs here (separated by comma, space, or newline)…"
              rows={3}
              className="w-full px-3 py-2 text-xs font-mono bg-white border border-edge rounded resize-y focus:outline-none focus:ring-2 focus:ring-accent/30"
            />

            {lookup && (
              <>
                <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono">
                  <span className="px-2 py-0.5 rounded bg-panel border border-edge text-muted">
                    {lookup.rows.length} SKU
                  </span>
                  <span className="px-2 py-0.5 rounded bg-red-100 text-red-600 font-semibold">
                    {lookup.over} Over
                  </span>
                  <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 font-semibold">
                    {lookup.under} Under
                  </span>
                  {lookup.notFound > 0 && (
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">
                      {lookup.notFound} Not found
                    </span>
                  )}
                </div>

                <div className="border border-edge rounded overflow-hidden divide-y divide-edge max-h-72 overflow-y-auto">
                  {lookup.rows.map(({ sku, result }) => (
                    <div
                      key={sku}
                      className="flex items-center gap-3 px-3 py-1.5 text-[11px] font-mono"
                    >
                      <span className="text-primary flex-1 truncate">{sku}</span>
                      {result ? (
                        <>
                          {result.description && (
                            <span className="text-muted truncate max-w-[220px] hidden sm:block">
                              {result.description}
                            </span>
                          )}
                          <span className="text-muted tabular-nums w-20 text-right">
                            {result.omtrek.toFixed(1)} cm
                          </span>
                          <span
                            className={cn(
                              "inline-block px-2 py-0.5 rounded text-[10px] font-semibold w-14 text-center shrink-0",
                              result.overLimit
                                ? "bg-red-100 text-red-600"
                                : "bg-green-100 text-green-700"
                            )}
                          >
                            {result.overLimit ? "Over" : "Under"}
                          </span>
                        </>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold w-14 text-center shrink-0 bg-amber-100 text-amber-700">
                          N/A
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Table */}
      {filtered.length > 0 && (
        <div className="bg-surface border border-edge rounded-lg overflow-hidden">
          <VirtualDataTable<OmtrekResult>
            maxHeight={560}
            data={filtered}
            columns={columns}
            rowHeight={32}
            fontSize="11px"
            cellPadding="6px 12px"
            headerPadding="0 12px"
            rowNumber
            sortColumnId={sortCol}
            sortDir={sortDir}
            onSort={(id) => handleSort(id as SortCol)}
            getRowClassName={(r) => cn(r.overLimit && "bg-red-50/30")}
          />
        </div>
      )}

      {/* Empty state */}
      {/* {results.length === 0 && !error && (
        <div className="text-center py-12">
          <Ruler size={28} className="mx-auto text-muted/40 mb-3" />
          <p className="text-sm text-muted">Upload a CSV/XLSX file to get started</p>
          <p className="text-[11px] text-muted/60 mt-1 font-mono">
            Required columns: Code, Description, L (cm), W (cm), H (cm)
          </p>
        </div>
      )} */}
    </div>
  );
}
