"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { FixedSizeList as List } from "react-window";
import { cn, formatPrice, formatInteger, buildSearchMatcher } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { OUTPUT_COLUMNS, PRICE_COLUMNS, INTEGER_OUTPUT_COLUMNS, TABLE_SIZE_CONFIG, type OutputRow } from "@/lib/types";
import { StatusBadge, PolicyBadge } from "@/components/status-badge/status-badge";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

function ReferenceCell({ value, fontSize }: { value: string; fontSize: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const refs = value.split("\n").filter(Boolean);

  const POPOVER_WIDTH = 260;

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      const left = Math.min(r.left, window.innerWidth - POPOVER_WIDTH - 8);
      setPos({ top: r.bottom + 4, left: Math.max(8, left) });
    }
    setOpen((v) => !v);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="flex items-center gap-1 min-w-0 max-w-full cursor-pointer text-left"
        onClick={toggle}
        style={{ fontSize }}
      >
        <span className="truncate">{refs[0] ?? "—"}</span>
        {refs.length > 1 && (
          <span className="shrink-0 text-[9px] font-mono bg-slate-100 text-muted rounded px-1">
            +{refs.length - 1}
          </span>
        )}
      </button>
      {open && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="fixed z-50 bg-white border border-edge rounded-lg shadow-lg py-1 overflow-y-auto"
            style={{ top: pos.top, left: pos.left, width: POPOVER_WIDTH, height: 300 }}
          >
            {refs.map((ref, i) => (
              <div key={i} className="px-3 py-1.5 text-[11px] font-mono text-primary hover:bg-slate-50 whitespace-nowrap">
                {ref}
              </div>
            ))}
          </div>
        </>,
        document.body
      )}
    </>
  );
}

function CellValue({ column, value, fontSize }: { column: keyof OutputRow; value: unknown; fontSize: string }) {
  if (column === "Status") {
    return <StatusBadge status={value as "active" | "draft"} />;
  }
  if (column === "Variant Inventory Policy") {
    return <PolicyBadge policy={value as "continue" | "deny"} />;
  }
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted/50">—</span>;
  }
  if (column === "Reference") {
    return <ReferenceCell value={String(value)} fontSize={fontSize} />;
  }
  if (PRICE_COLUMNS.has(column)) {
    const formatted = formatPrice(value as number | null);
    return formatted ? <span className="font-mono" style={{ fontSize }}>{formatted}</span> : <span className="text-muted/50">—</span>;
  }
  if (INTEGER_OUTPUT_COLUMNS.has(column)) {
    const formatted = formatInteger(value as number | null);
    return formatted !== "" ? <span className="font-mono" style={{ fontSize }}>{formatted}</span> : <span className="text-muted/50">—</span>;
  }
  if (typeof value === "number") {
    return <span className="font-mono" style={{ fontSize }}>{value}</span>;
  }
  return <span className="truncate" title={String(value)}>{String(value)}</span>;
}

export function DataTable() {
  const results = useAppStore((s) => s.results);
  const statusFilter = useAppStore((s) => s.statusFilter);
  const etaFilter = useAppStore((s) => s.etaFilter);
  const discountFilter = useAppStore((s) => s.discountFilter);
  const policyFilter = useAppStore((s) => s.policyFilter);
  const search = useAppStore((s) => s.search);
  const sortColumn = useAppStore((s) => s.sortColumn);
  const sortDirection = useAppStore((s) => s.sortDirection);
  const toggleSort = useAppStore((s) => s.toggleSort);
  const visibleColumns = useAppStore((s) => s.visibleColumns);
  const tableSize = useAppStore((s) => s.tableSize);

  const containerRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(700);

  const sizeConfig = TABLE_SIZE_CONFIG[tableSize];

  // Visible column definitions
  const activeCols = useMemo(
    () => OUTPUT_COLUMNS.filter((c) => visibleColumns.includes(c.key)),
    [visibleColumns]
  );

  // Resize observer for dynamic height
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0].contentRect.height - 36;
      setListHeight(Math.max(h, 100));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Filter data
  const filteredData = useMemo(() => {
    let data = results;
    if (statusFilter !== "all") {
      data = data.filter((r) => r.Status === statusFilter);
    }
    if (etaFilter === "yes") {
      data = data.filter((r) => r.ETA !== null && r.ETA !== "");
    } else if (etaFilter === "no") {
      data = data.filter((r) => r.ETA === null || r.ETA === "");
    }
    if (discountFilter === "yes") {
      data = data.filter((r) => r["Discount %"] !== null);
    } else if (discountFilter === "no") {
      data = data.filter((r) => r["Discount %"] === null);
    }
    if (policyFilter !== "all") {
      data = data.filter((r) => r["Variant Inventory Policy"] === policyFilter);
    }
    const matcher = buildSearchMatcher(search);
    if (matcher) {
      data = data.filter((r) =>
        matcher([r["Variant SKU"], r.Title, r.Reference])
      );
    }
    return data;
  }, [results, statusFilter, etaFilter, discountFilter, policyFilter, search]);

  // Sort data with nulls-to-bottom
  const sortedData = useMemo(() => {
    if (!sortColumn) return filteredData;
    const col = sortColumn;
    const dir = sortDirection === "asc" ? 1 : -1;
    return [...filteredData].sort((a, b) => {
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
  }, [filteredData, sortColumn, sortDirection]);

  const Row = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const row = sortedData[index];
      const policy = row["Variant Inventory Policy"];
      return (
        <div
          style={style}
          className={cn(
            "flex items-center border-b border-edge/50 transition-colors",
            policy === "continue" && "bg-amber-50",
            row.Status === "draft" && "bg-zinc-50",
            "hover:bg-surface-hover"
          )}
        >
          <div className="flex items-center w-full" style={{ minWidth: 400 }}>
            {activeCols.map((col) => (
              <div
                key={col.key}
                className={cn(
                  "truncate shrink-0",
                  col.align === "center" ? "text-center" : "text-left"
                )}
                style={{ flex: col.flex, padding: sizeConfig.cellPadding, fontSize: sizeConfig.fontSize }}
                title={col.key !== "Reference" && row[col.key] != null ? String(row[col.key]) : undefined}
              >
                <CellValue column={col.key} value={row[col.key]} fontSize={sizeConfig.fontSize} />
              </div>
            ))}
          </div>
        </div>
      );
    },
    [sortedData, activeCols, sizeConfig]
  );

  if (results.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted text-sm">
        <div className="text-center space-y-2">
          <p className="font-mono text-xs text-muted">No data yet</p>
          <p className="text-[11px] text-muted/70">
            Upload files and run the processor
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 flex flex-col min-h-0">
      {/* Header */}
      <div className="border-b border-edge bg-surface shrink-0">
        <div className="flex items-center h-9" style={{ minWidth: 400 }}>
          {activeCols.map((col) => {
            const isSorted = sortColumn === col.key;
            return (
              <button
                key={col.key}
                onClick={() => toggleSort(col.key)}
                className={cn(
                  "flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider hover:text-primary transition-colors shrink-0 cursor-pointer",
                  col.align === "center" ? "justify-center" : "justify-start",
                  isSorted ? "text-amber-600" : "text-muted"
                )}
                style={{ flex: col.flex, padding: "0 8px" }}
                title={col.label}
              >
                <span className="truncate">{col.label}</span>
                {isSorted ? (
                  sortDirection === "asc" ? (
                    <ArrowUp size={10} className="text-amber-600 shrink-0" />
                  ) : (
                    <ArrowDown size={10} className="text-amber-600 shrink-0" />
                  )
                ) : (
                  <ArrowUpDown size={10} className="opacity-20 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Virtualized rows */}
      <List
        height={listHeight}
        width="100%"
        itemSize={sizeConfig.rowHeight}
        itemCount={sortedData.length}
        overscanCount={10}
      >
        {Row}
      </List>

      {/* Row count */}
      <div className="shrink-0 h-7 flex items-center px-3 border-t border-edge bg-surface">
        <span className="text-[11px] text-muted font-mono">
          {sortedData.length} / {results.length} rows
        </span>
      </div>
    </div>
  );
}
