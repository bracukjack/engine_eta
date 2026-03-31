"use client";

/**
 * CustomerTable — sortable, searchable, paginated table of RFM customers.
 * Supports segment filter, column sorting, and export per segment or all.
 */

import { useMemo, useState } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown, Download, ChevronLeft, ChevronRight } from "lucide-react";
import { cn, formatInteger, buildSearchMatcher } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { CustomerRFM, SegmentLabel } from "@/lib/rfm-types";
import { SEGMENT_META } from "@/lib/rfm-types";

const COLUMNS: {
  key: keyof CustomerRFM;
  label: string;
  numeric?: boolean;
  tooltip: string;
}[] = [
  { key: "code",          label: "Code",        tooltip: "Customer code" },
  { key: "name",          label: "Customer",    tooltip: "Customer name" },
  { key: "recency",       label: "Recency (d)", tooltip: "Days since last order", numeric: true },
  { key: "frequency",     label: "Orders",      tooltip: "Number of unique orders", numeric: true },
  { key: "monetary",      label: "Monetary (€)",tooltip: "Total net sales value", numeric: true },
  { key: "rfmScore",      label: "RFM Score",   tooltip: "Mean of normed R, F, M (0–1)", numeric: true },
  { key: "segmentLabel",  label: "Segment",     tooltip: "Assigned segment" },
];

async function exportCSV(rows: CustomerRFM[], filename: string) {
  const { default: Papa } = await import("papaparse");
  const data = rows.map((r) => ({
    CustomerCode:  r.code,
    CustomerName:  r.name,
    Recency:       r.recency,
    Frequency:     r.frequency,
    Monetary:      r.monetary,
    RFM_Score:     r.rfmScore.toFixed(4),
    Segment:       r.segmentLabel,
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

export function CustomerTable({
  customers,
  activeSegment,
}: {
  customers: CustomerRFM[];
  activeSegment: SegmentLabel | "all";
}) {
  const [search,        setSearch]        = useState("");
  const [sortCol,       setSortCol]       = useState<keyof CustomerRFM>("rfmScore");
  const [sortDir,       setSortDir]       = useState<"asc" | "desc">("desc");
  const [page,          setPage]          = useState(1);
  const [rowsPerPage]                     = useState(25);
  const [exportOpen,    setExportOpen]    = useState(false);

  const toggleSort = (col: keyof CustomerRFM) => {
    if (col === sortCol) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
    setPage(1);
  };

  const filtered = useMemo(() => {
    let data = customers;
    if (activeSegment !== "all") data = data.filter((r) => r.segmentLabel === activeSegment);
    const matcher = buildSearchMatcher(search);
    if (matcher) data = data.filter((r) => matcher([r.code, r.name, r.segmentLabel]));
    return data;
  }, [customers, activeSegment, search]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortCol], bv = b[sortCol];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { sensitivity: "base" }) * dir;
    });
  }, [filtered, sortCol, sortDir]);

  const totalPages  = Math.max(1, Math.ceil(sorted.length / rowsPerPage));
  const safePage    = Math.min(page, totalPages);
  const paged       = sorted.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);

  // Unique segments in current data (for export dropdown)
  const segments = Array.from(new Set(customers.map((c) => c.segmentLabel))) as SegmentLabel[];

  const pageNums = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (safePage <= 4)  return [1, 2, 3, 4, 5, 6, 7];
    if (safePage >= totalPages - 3) return Array.from({ length: 7 }, (_, i) => totalPages - 6 + i);
    return Array.from({ length: 7 }, (_, i) => safePage - 3 + i);
  }, [totalPages, safePage]);

  return (
    <div className="flex flex-col min-h-0">
      {/* Controls */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search code or name…"
          className="h-8 pl-3 pr-3 text-[12px] border border-edge rounded-md bg-white focus:outline-none focus:border-accent/50 w-52"
        />
        <span className="text-[11px] text-muted font-mono ml-1">
          {sorted.length} / {customers.length} customers
        </span>

        <div className="flex-1" />

        {/* Export dropdown */}
        <div className="relative">
          <Button variant="outline" size="sm" onClick={() => setExportOpen((v) => !v)}>
            <Download size={12} className="mr-1.5" />
            Export CSV
          </Button>
          {exportOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-white border border-edge rounded-lg shadow-lg py-1">
              <button
                onClick={() => { exportCSV(sorted, "rfm_all.csv"); setExportOpen(false); }}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 text-primary"
              >
                Export All ({sorted.length})
              </button>
              <div className="border-t border-edge my-1" />
              {segments.map((seg) => {
                const segRows = sorted.filter((c) => c.segmentLabel === seg);
                return (
                  <button
                    key={seg}
                    onClick={() => {
                      exportCSV(segRows, `rfm_${seg.replace(/\s+/g, "_").toLowerCase()}.csv`);
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
              <th className="text-left px-3 py-2 text-[11px] font-semibold text-muted w-6">#</th>
              {COLUMNS.map((col) => {
                const isSorted = sortCol === col.key;
                return (
                  <th
                    key={col.key}
                    onClick={() => toggleSort(col.key)}
                    title={col.tooltip}
                    className={cn(
                      "text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap group",
                      isSorted ? "text-amber-600" : "text-muted hover:text-primary"
                    )}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {isSorted ? (
                        sortDir === "asc"
                          ? <ArrowUp size={10} className="text-amber-600 shrink-0" />
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
              paged.map((row, idx) => {
                const meta = SEGMENT_META[row.segmentLabel];
                return (
                  <tr
                    key={row.code}
                    className="border-b border-edge/50 hover:bg-surface-hover transition-colors"
                  >
                    <td className="px-3 py-2 text-[11px] text-muted/60 font-mono">
                      {(safePage - 1) * rowsPerPage + idx + 1}
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
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white whitespace-nowrap"
                        style={{ background: meta.color }}
                      >
                        {meta.emoji} {row.segmentLabel}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <span className="text-[11px] text-muted font-mono">
          {sorted.length === 0
            ? "0 rows"
            : `${(safePage - 1) * rowsPerPage + 1}–${Math.min(safePage * rowsPerPage, sorted.length)} of ${sorted.length}`}
        </span>
        <div className="flex-1" />
        {totalPages > 1 && (
          <div className="flex items-center gap-0.5">
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
