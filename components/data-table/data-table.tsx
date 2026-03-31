"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { FixedSizeList as List } from "react-window";
import { cn, formatPrice, formatInteger, buildSearchMatcher } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { OUTPUT_COLUMNS, PRICE_COLUMNS, INTEGER_OUTPUT_COLUMNS, TABLE_SIZE_CONFIG, type OutputRow } from "@/lib/types";
import { StatusBadge, PolicyBadge } from "@/components/status-badge/status-badge";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

// ── Editable columns ──────────────────────────────────────────────────────────
const EDITABLE_COLUMNS = new Set<keyof OutputRow>([
  "Variant Quantity",
  "Status",
  "Published",
  "Variant Inventory Policy",
  "ETA",
  "Variant Price",
  "Variant Compare at Price",
  "Cost per item",
  "Discount %",
]);

type SelectOption = { value: string; label: string };

const COLUMN_OPTIONS: Partial<Record<keyof OutputRow, SelectOption[]>> = {
  Status: [
    { value: "active", label: "Active" },
    { value: "draft", label: "Draft" },
    { value: "archived", label: "Archived" },
  ],
  Published: [
    { value: "TRUE", label: "True" },
    { value: "FALSE", label: "False" },
  ],
  "Variant Inventory Policy": [
    { value: "continue", label: "Continue" },
    { value: "deny", label: "Deny" },
  ],
};

// ── EditableCell ──────────────────────────────────────────────────────────────
function EditableCell({
  sku,
  column,
  row,
  fontSize,
}: {
  sku: string;
  column: keyof OutputRow;
  row: OutputRow;
  fontSize: string;
}) {
  const updateRow = useAppStore((s) => s.updateRow);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  const value = row[column];
  const options = COLUMN_OPTIONS[column];
  const isSelect = !!options;

  // On double-click → enter edit mode
  const handleDoubleClick = useCallback(() => {
    if (!EDITABLE_COLUMNS.has(column)) return;
    setDraft(value === null || value === undefined ? "" : String(value));
    setEditing(true);
  }, [column, value]);

  // Focus input/select when editing starts
  useEffect(() => {
    if (!editing) return;
    if (isSelect) {
      selectRef.current?.focus();
    } else {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing, isSelect]);

  const commit = useCallback((raw: string) => {
    setEditing(false);
    const trimmed = raw.trim();

    if (column === "Status") {
      const v = trimmed as "active" | "draft" | "archived";
      if (v !== row.Status) updateRow(sku, { Status: v });
      return;
    }
    if (column === "Published") {
      const v = trimmed as "TRUE" | "FALSE";
      if (v !== row.Published) updateRow(sku, { Published: v });
      return;
    }
    if (column === "Variant Inventory Policy") {
      const v = trimmed as "continue" | "deny";
      if (v !== row["Variant Inventory Policy"]) updateRow(sku, { "Variant Inventory Policy": v });
      return;
    }
    if (column === "ETA") {
      const v = trimmed === "" ? null : trimmed;
      if (v !== row.ETA) updateRow(sku, { ETA: v });
      return;
    }
    if (column === "Variant Quantity") {
      const n = parseInt(trimmed, 10);
      const v = isNaN(n) ? 0 : Math.max(0, n);
      if (v !== row["Variant Quantity"]) updateRow(sku, { "Variant Quantity": v });
      return;
    }
    if (column === "Discount %") {
      const pct = trimmed === "" ? null : parseFloat(trimmed);
      const validPct = pct === null || isNaN(pct) ? null : pct;
      // Recalculate price from compare-at when discount changes
      const compareAt = row["Variant Compare at Price"];
      let newPrice = row["Variant Price"];
      if (validPct !== null && compareAt !== null) {
        newPrice = Math.round(compareAt * (1 - validPct / 100) * 100) / 100;
      }
      updateRow(sku, { "Discount %": validPct, "Variant Price": newPrice });
      return;
    }
    // Numeric price columns
    if (PRICE_COLUMNS.has(column)) {
      const n = trimmed === "" ? null : parseFloat(trimmed);
      const v = n === null || isNaN(n) ? null : n;
      updateRow(sku, { [column]: v } as Partial<OutputRow>);
      return;
    }
  }, [column, row, sku, updateRow]);

  const cancel = useCallback(() => setEditing(false), []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); commit(draft); }
    if (e.key === "Escape") cancel();
  }, [draft, commit, cancel]);

  // Select: commit immediately on change
  const handleSelectChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    commit(e.target.value);
  }, [commit]);

  if (editing && isSelect) {
    return (
      <select
        ref={selectRef}
        value={String(value ?? "")}
        onChange={handleSelectChange}
        onBlur={cancel}
        onKeyDown={(e) => e.key === "Escape" && cancel()}
        className="w-full border border-accent rounded px-1 bg-white shadow-sm focus:outline-none capitalize"
        style={{ fontSize, padding: "1px 4px" }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    );
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={handleKeyDown}
        className="w-full border border-accent rounded px-1 bg-white focus:outline-none font-mono"
        style={{ fontSize, padding: "1px 4px" }}
      />
    );
  }

  const isEditable = EDITABLE_COLUMNS.has(column);

  return (
    <div
      onDoubleClick={isEditable ? handleDoubleClick : undefined}
      className={cn("w-full h-full flex items-center", isEditable && "cursor-text group")}
      title={isEditable ? "Double-click to edit" : undefined}
    >
      <CellValue column={column} value={value} fontSize={fontSize} />
      {isEditable && (
        <span className="ml-1 opacity-0 group-hover:opacity-30 text-[8px] text-muted shrink-0">✎</span>
      )}
    </div>
  );
}


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
  if (column === "B2C") {
    if (value === "Yes") {
      return (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
          B2C
        </span>
      );
    }
    return <span className="text-muted/40 text-[10px]">—</span>;
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
  const b2cFilter = useAppStore((s) => s.b2cFilter);
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
    if (b2cFilter === "yes") {
      data = data.filter((r) => r.B2C === "Yes");
    } else if (b2cFilter === "no") {
      data = data.filter((r) => r.B2C === "No");
    }
    const matcher = buildSearchMatcher(search);
    if (matcher) {
      data = data.filter((r) =>
        matcher([r["Variant SKU"], r.Title, r.Reference])
      );
    }
    return data;
  }, [results, statusFilter, etaFilter, discountFilter, policyFilter, b2cFilter, search]);

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
                <EditableCell sku={row["Variant SKU"]} column={col.key} row={row} fontSize={sizeConfig.fontSize} />
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
