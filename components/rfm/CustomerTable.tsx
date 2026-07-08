"use client";

/**
 * CustomerTable
 * - Segment filter tabs, text search, sortable columns
 * - Pagination: [50, 100, 200, 500, 1000, All] — default 50
 * - Export exports only visible (filtered + searched) rows
 * - Segment badges show tooltip descriptions on hover
 */

import { useMemo, useState, useRef, useEffect } from "react";
import { Download } from "lucide-react";
import { cn, formatInteger, buildSearchMatcher } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ColumnDef } from "@tanstack/react-table";
import { VirtualDataTable, type VDTColumnMeta } from "@/components/data-table/virtual-data-table";
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
      data-tooltip={tooltip}
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

  // Column model
  const columns = useMemo<ColumnDef<CustomerRFM>[]>(() => {
    const sizes: Record<string, number> = {
      code: 120, name: 220, recency: 100, frequency: 110, monetary: 120, rfmScore: 90, segmentLabel: 150,
    };
    return COLUMNS.map((c) => {
      const meta: VDTColumnMeta = { headerTitle: c.tooltip };
      const base: ColumnDef<CustomerRFM> = {
        id: c.key,
        accessorKey: c.key,
        header: c.label,
        size: sizes[c.key] ?? 120,
        meta,
      };
      switch (c.key) {
        case "code":
          return { ...base, meta: { ...meta, cellClassName: "font-mono text-muted" }, cell: ({ row }) => row.original.code };
        case "name":
          return { ...base, meta: { ...meta, cellClassName: "text-primary" }, cell: ({ row }) => row.original.name };
        case "recency":
          return { ...base, meta: { ...meta, cellClassName: "font-mono" }, cell: ({ row }) => `${row.original.recency}d` };
        case "frequency":
          return { ...base, meta: { ...meta, cellClassName: "font-mono" }, cell: ({ row }) => row.original.frequency };
        case "monetary":
          return { ...base, meta: { ...meta, cellClassName: "font-mono" }, cell: ({ row }) => `€${formatInteger(row.original.monetary)}` };
        case "rfmScore":
          return { ...base, meta: { ...meta, cellClassName: "font-mono" }, cell: ({ row }) => row.original.rfmScore.toFixed(3) };
        case "segmentLabel":
          return { ...base, cell: ({ row }) => <SegmentBadge label={row.original.segmentLabel} color={row.original.segmentColor} /> };
        default:
          return base;
      }
    });
  }, []);

  const getCellTip = (row: CustomerRFM, id: string): string | undefined => {
    switch (id) {
      case "code": return row.code;
      case "name": return row.name;
      case "recency": return `${row.recency}d`;
      case "frequency": return String(row.frequency);
      case "monetary": return `€${formatInteger(row.monetary)}`;
      case "rfmScore": return row.rfmScore.toFixed(3);
      case "segmentLabel": return row.segmentLabel;
      default: return undefined;
    }
  };

  return (
    <div className="flex flex-col gap-3">

      {/* Segment filter tabs */}
      {onSegmentChange && (
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => onSegmentChange("all")}
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
                onClick={() => onSegmentChange(isActive ? "all" : seg)}
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
          onChange={(e) => setSearch(e.target.value)}
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
      <VirtualDataTable<CustomerRFM>
        className="border border-edge rounded-lg overflow-hidden"
        maxHeight="65vh"
        data={sorted}
        columns={columns}
        rowHeight={36}
        fontSize="11px"
        cellPadding="8px 12px"
        headerPadding="0 12px"
        rowNumber
        rowNumberWidth={40}
        enableCopy
        getCellTip={getCellTip}
        sortColumnId={sortCol}
        sortDir={sortDir}
        onSort={(id) => toggleSort(id as keyof CustomerRFM)}
        pagination
        pageSize={50}
        pageSizeOptions={[50, 100, 200, 500, 1000]}
        empty="No customers match the current filter."
      />
    </div>
  );
}
