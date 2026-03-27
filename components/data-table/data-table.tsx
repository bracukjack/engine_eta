"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { FixedSizeList as List } from "react-window";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { OUTPUT_COLUMNS, TOTAL_ROW_WIDTH, type OutputRow } from "@/lib/types";
import { StatusBadge, PolicyBadge } from "@/components/status-badge/status-badge";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

const ROW_HEIGHT = 36;

function CellValue({ column, value }: { column: keyof OutputRow; value: unknown }) {
  if (column === "Status") {
    return <StatusBadge status={value as "active" | "draft"} />;
  }
  if (column === "Variant Inventory Policy") {
    return <PolicyBadge policy={value as "continue" | "deny"} />;
  }
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted/50">—</span>;
  }
  if (typeof value === "number") {
    return <span className="font-mono text-xs">{value}</span>;
  }
  return <span className="truncate">{String(value)}</span>;
}

export function DataTable() {
  const results = useAppStore((s) => s.results);
  const statusFilter = useAppStore((s) => s.statusFilter);
  const etaFilter = useAppStore((s) => s.etaFilter);
  const discountFilter = useAppStore((s) => s.discountFilter);
  const sortColumn = useAppStore((s) => s.sortColumn);
  const sortDirection = useAppStore((s) => s.sortDirection);
  const toggleSort = useAppStore((s) => s.toggleSort);

  const containerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(400);

  // Resize observer for dynamic height
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0].contentRect.height - 36; // subtract header height
      setListHeight(Math.max(h, 100));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Sync horizontal scroll between header and list
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const handler = () => {
      if (headerRef.current) headerRef.current.scrollLeft = el.scrollLeft;
    };
    el.addEventListener("scroll", handler);
    return () => el.removeEventListener("scroll", handler);
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
    return data;
  }, [results, statusFilter, etaFilter, discountFilter]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortColumn) return filteredData;
    const sorted = [...filteredData].sort((a, b) => {
      const av = a[sortColumn];
      const bv = b[sortColumn];
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "number" && typeof bv === "number") return av - bv;
      return String(av).localeCompare(String(bv));
    });
    return sortDirection === "desc" ? sorted.reverse() : sorted;
  }, [filteredData, sortColumn, sortDirection]);

  const Row = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const row = sortedData[index];
      const policy = row["Variant Inventory Policy"];
      return (
        <div
          style={style}
          className={cn(
            "flex items-center border-b border-edge/50 text-xs transition-colors",
            policy === "continue" && "bg-amber-50",
            row.Status === "draft" && "bg-zinc-50",
            "hover:bg-surface-hover"
          )}
        >
          <div className="flex items-center" style={{ minWidth: TOTAL_ROW_WIDTH }}>
            {OUTPUT_COLUMNS.map((col) => (
              <div
                key={col.key}
                className="px-2.5 truncate shrink-0"
                style={{ width: col.width }}
              >
                <CellValue column={col.key} value={row[col.key]} />
              </div>
            ))}
          </div>
        </div>
      );
    },
    [sortedData]
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
      {/* Scroll-synced header */}
      <div ref={headerRef} className="overflow-hidden border-b border-edge bg-surface shrink-0">
        <div className="flex items-center h-9" style={{ minWidth: TOTAL_ROW_WIDTH }}>
          {OUTPUT_COLUMNS.map((col) => (
            <button
              key={col.key}
              onClick={() => toggleSort(col.key)}
              className="flex items-center gap-1 px-2.5 text-[11px] font-semibold text-muted uppercase tracking-wider hover:text-primary transition-colors shrink-0 cursor-pointer"
              style={{ width: col.width }}
            >
              <span className="truncate">{col.label}</span>
              {sortColumn === col.key ? (
                sortDirection === "asc" ? (
                  <ArrowUp size={10} className="text-accent shrink-0" />
                ) : (
                  <ArrowDown size={10} className="text-accent shrink-0" />
                )
              ) : (
                <ArrowUpDown size={10} className="opacity-0 group-hover:opacity-30 shrink-0" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Virtualized rows */}
      <List
        outerRef={outerRef}
        height={listHeight}
        width="100%"
        itemSize={ROW_HEIGHT}
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
