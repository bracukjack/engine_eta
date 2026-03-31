"use client";

/**
 * CustomerTable
 * - Segment filter tabs, text search, sortable columns
 * - Pagination: [50, 100, 200, 500, 1000, All] — default 50
 * - Export exports only visible (filtered + searched) rows
 * - Segment badges show tooltip descriptions on hover
 */

import { useMemo, useState, useRef, useEffect } from "react";
import {
  ArrowUp, ArrowDown, ArrowUpDown,
  Download, ChevronLeft, ChevronRight,
} from "lucide-react";
import { cn, formatInteger, buildSearchMatcher } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { CustomerRFM, SegmentLabel } from "@/lib/rfm-types";
import { SEGMENT_META } from "@/lib/rfm-types";
import { SEGMENT_TOOLTIPS } from "./RFMUploader";

// ── Segment badge with tooltip ────────────────────────────────────────────────
function SegmentBadge({ label, color }: { label: SegmentLabel; color: string }) {
  const meta    = SEGMENT_META[label];
  const tooltip = SEGMENT_TOOLTIPS[label] ?? label;
  return (
    <span
      className="relative inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white whitespace-nowrap cursor-help"
      style={{ background: color }}
      title={tooltip}
    >
      {meta.emoji} {label}
    </span>
  );
}

// ── Column definitions ────────────────────────────────────────────────────────
const COLUMNS: { key: keyof CustomerRFM; label: string; numeric?: boolean; tooltip: string }[] = [
  { key: "code",         label: "Code",          tooltip: "Customer identifier" },
  { key: "name",         label: "Customer",       tooltip: "Customer name" },
  { key: "recency",      label: "R (days)",       tooltip: "Days since last order", numeric: true },
  { key: "frequency",    label: "F (orders)",     tooltip: "Number of unique orders", numeric: true },
  { key: "monetary",     label: "M (€)",          tooltip: "Total net revenue", numeric: true },
  { key: "rfmScore",     label: "Score",          tooltip: "Mean of normalised R, F, M (0–1)", numeric: true },
  { key: "segmentLabel", label: "Segment",        tooltip: "Assigned RFM segment" },
];

const ROWS_PER_PAGE_OPTIONS: (number | "all")[] = [50, 100, 200, 500, 1000, "all"];

// ── Export helper ─────────────────────────────────────────────────────────────
async function exportVisible(rows: CustomerRFM[], filename = "rfm_export.csv") {
  const { default: Papa } = await import("papaparse");
  const data = rows.map((r) => ({
    CustomerCode: r.code,
    CustomerName: r.name,
    Recency:      r.recency,
    Frequency:    r.frequency,
    Monetary:     r.monetary,
    RFM_Score:    r.rfmScore.toFixed(4),
    Segment:      r.segmentLabel,
  }));
  const csv  = Papa.unparse(data);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main component ────────────────────────────────────────────────────────────
export function CustomerTable({
  customers,
  activeSegment,
  onSegmentChange,
}: {
  customers: CustomerRFM[];
  activeSegment: SegmentLabel | "all";
  onSegmentChange?: (s: SegmentLabel | "all") => void;
}) {
  const [search,      setSearch]      = useState("");
  const [sortCol,     setSortCol]     = useState<keyof CustomerRFM>("rfmScore");
  const [sortDir,     setSortDir]     = useState<"asc" | "desc">("desc");
  const [page,        setPage]        = useState(1);
  const [rpp,         setRpp]         = useState<number | "all">(50);
  const exportBtnRef                  = useRef<HTMLButtonElement>(null);
  const [exportOpen,  setExportOpen]  = useState(false);

  // Close export dropdown on outside click
  useEffect(() => {
    if (!exportOpen) return;
    const h = (e: MouseEvent) => {
      if (!exportBtnRef.current?.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [exportOpen]);

  const toggleSort = (col: keyof CustomerRFM) => {
    if (col === sortCol) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
    setPage(1);
  };

  // Unique segments for filter tabs
  const segments = useMemo(
    () => Array.from(new Set(customers.map((c) => c.segmentLabel))) as SegmentLabel[],
    [customers]
  );

  // Filter + search
  const filtered = useMemo(() => {
    let data = customers;
    if (activeSegment !== "all") data = data.filter((r) => r.segmentLabel === activeSegment);
    const matcher = buildSearchMatcher(search);
    if (matcher) data = data.filter((r) => matcher([r.code, r.name]));
    return data;
  }, [customers, activeSegment, search]);

  // Sort
  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { sensitivity: "base" }) * dir;
    });
  }, [filtered, sortCol, sortDir]);

  // Pagination
  const totalPages = rpp === "all" ? 1 : Math.max(1, Math.ceil(sorted.length / (rpp as number)));
  const safePage   = Math.min(page, totalPages);
  const paged      = rpp === "all"
    ? sorted
    : sorted.slice((safePage - 1) * (rpp as number), safePage * (rpp as number));

  const pageNums = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (safePage <= 4)   return [1, 2, 3, 4, 5, 6, 7];
    if (safePage >= totalPages - 3) return Array.from({ length: 7 }, (_, i) => totalPages - 6 + i);
    return Array.from({ length: 7 }, (_, i) => safePage - 3 + i);
  }, [totalPages, safePage]);

  const rowStart = rpp === "all" ? 1 : (safePage - 1) * (rpp as number) + 1;
  const rowEnd   = rpp === "all" ? sorted.length : Math.min(safePage * (rpp as number), sorted.length);

  return (
    <div className="flex flex-col gap-3">

      {/* Segment filter tabs */}
      {onSegmentChange && (
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => { onSegmentChange("all"); setPage(1); }}
            className={cn(
              "h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer border",
              activeSegment === "all"
                ? "bg-accent/10 text-accent border-accent/30"
                : "text-muted hover:text-primary hover:bg-surface-hover border-transparent"
            )}
          >
            All ({customers.length})
          </button>
          {segments.map((seg) => {
            const meta    = SEGMENT_META[seg];
            const count   = customers.filter((c) => c.segmentLabel === seg).length;
            const isActive = activeSegment === seg;
            return (
              <button
                key={seg}
                onClick={() => { onSegmentChange(isActive ? "all" : seg); setPage(1); }}
                className="h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer"
                style={
                  isActive
                    ? { background: meta.color, color: "#fff", border: `1px solid ${meta.color}` }
                    : { border: "1px solid transparent", color: "#64748b" }
                }
              >
                {meta.emoji} {seg} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Search + export bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search by code or name…"
          className="h-8 pl-3 pr-3 text-[12px] border border-edge rounded-md bg-white focus:outline-none focus:border-accent/50 w-52"
        />
        <span className="text-[11px] text-muted font-mono">
          {sorted.length} / {customers.length} customers
        </span>
        <div className="flex-1" />

        {/* Export button — exports visible (filtered) rows */}
        <div className="relative">
          <Button
            ref={exportBtnRef}
            variant="outline"
            size="sm"
            onClick={() => setExportOpen((v) => !v)}
          >
            <Download size={12} className="mr-1.5" />
            Export CSV
          </Button>
          {exportOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 w-56 bg-white border border-edge rounded-lg shadow-lg py-1">
              <div className="px-3 py-1.5 text-[10px] text-muted uppercase tracking-wider font-semibold border-b border-edge">
                Export visible rows ({sorted.length})
              </div>
              <button
                onClick={() => {
                  exportVisible(sorted, "rfm_filtered.csv");
                  setExportOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 text-primary"
              >
                All visible ({sorted.length} rows)
              </button>
              <div className="border-t border-edge my-1" />
              {segments.map((seg) => {
                const segRows = sorted.filter((c) => c.segmentLabel === seg);
                if (segRows.length === 0) return null;
                return (
                  <button
                    key={seg}
                    onClick={() => {
                      exportVisible(segRows, `rfm_${seg.replace(/\s+/g, "_").toLowerCase()}.csv`);
                      setExportOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50"
                  >
                    <span className="mr-1">{SEGMENT_META[seg].emoji}</span>
                    {seg} ({segRows.length})
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto border border-edge rounded-lg">
        <table className="w-full border-collapse" style={{ minWidth: 700 }}>
          <thead className="sticky top-0 z-10 bg-surface border-b border-edge">
            <tr>
              <th className="px-3 py-2 text-left text-[11px] font-semibold text-muted w-8">#</th>
              {COLUMNS.map((col) => {
                const isSorted = sortCol === col.key;
                return (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    title={col.tooltip}
                    className={cn(
                      "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap group",
                      isSorted ? "text-amber-600" : "text-muted hover:text-primary"
                    )}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {isSorted ? (
                        sortDir === "asc"
                          ? <ArrowUp   size={10} className="text-amber-600 shrink-0" />
                          : <ArrowDown size={10} className="text-amber-600 shrink-0" />
                      ) : (
                        <ArrowUpDown size={10} className="opacity-0 group-hover:opacity-30 shrink-0" />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {paged.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="text-center py-12 text-muted text-sm">
                  No customers match the current filter.
                </td>
              </tr>
            ) : (
              paged.map((row, idx) => (
                <tr
                  key={row.code}
                  className="border-b border-edge/50 hover:bg-surface-hover transition-colors"
                >
                  <td className="px-3 py-2 text-[11px] text-muted/50 font-mono">
                    {rowStart + idx}
                  </td>
                  <td className="px-3 py-2 text-[11px] font-mono text-muted">{row.code}</td>
                  <td className="px-3 py-2 text-[12px] text-primary max-w-[200px] truncate" title={row.name}>
                    {row.name}
                  </td>
                  <td className="px-3 py-2 text-[11px] font-mono">{row.recency}d</td>
                  <td className="px-3 py-2 text-[11px] font-mono">{row.frequency}</td>
                  <td className="px-3 py-2 text-[11px] font-mono">€{formatInteger(row.monetary)}</td>
                  <td className="px-3 py-2 text-[11px] font-mono">{row.rfmScore.toFixed(3)}</td>
                  <td className="px-3 py-2">
                    <SegmentBadge label={row.segmentLabel} color={row.segmentColor} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-muted font-mono shrink-0">
          {sorted.length === 0 ? "0 rows" : `${rowStart}–${rowEnd} of ${sorted.length}`}
        </span>
        <div className="flex-1" />

        {/* Rows per page */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[11px] text-muted">Rows:</span>
          {ROWS_PER_PAGE_OPTIONS.map((n) => (
            <button
              key={String(n)}
              onClick={() => { setRpp(n); setPage(1); }}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] font-mono transition-colors",
                rpp === n ? "bg-accent text-white" : "text-muted hover:text-primary hover:bg-surface-hover"
              )}
            >
              {n === "all" ? "All" : n}
            </button>
          ))}
        </div>

        {/* Page navigation */}
        {rpp !== "all" && totalPages > 1 && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => setPage(Math.max(1, safePage - 1))}
              disabled={safePage === 1}
              className="p-1 rounded text-muted hover:text-primary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} />
            </button>
            {pageNums.map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={cn(
                  "w-6 h-6 rounded text-[11px] font-mono transition-colors",
                  safePage === p ? "bg-accent text-white" : "text-muted hover:text-primary hover:bg-surface-hover"
                )}
              >
                {p}
              </button>
            ))}
            <button
              onClick={() => setPage(Math.min(totalPages, safePage + 1))}
              disabled={safePage === totalPages}
              className="p-1 rounded text-muted hover:text-primary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
