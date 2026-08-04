"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import type { ColumnDef } from "@tanstack/react-table";
import { cn, formatPrice, formatPriceExport, parsePriceInput, buildSearchMatcher } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { OUTPUT_COLUMNS, PRICE_COLUMNS, INTEGER_OUTPUT_COLUMNS, TABLE_SIZE_CONFIG, type OutputRow, type DecimalSeparator } from "@/lib/types";
import { StatusBadge, PolicyBadge } from "@/components/status-badge/status-badge";
import { VirtualDataTable } from "@/components/data-table/virtual-data-table";

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
  decimalSeparator,
}: {
  sku: string;
  column: keyof OutputRow;
  row: OutputRow;
  fontSize: string;
  decimalSeparator: DecimalSeparator;
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
    if (PRICE_COLUMNS.has(column)) {
      // Match the "show" format so the auto-selected text (and anything
      // copied from it) uses the same decimal separator as the table.
      setDraft(formatPriceExport(value as number | null, decimalSeparator));
    } else {
      setDraft(value === null || value === undefined ? "" : String(value));
    }
    setEditing(true);
  }, [column, value, decimalSeparator]);

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
      const v = parsePriceInput(trimmed, decimalSeparator);
      updateRow(sku, { [column]: v } as Partial<OutputRow>);
      return;
    }
  }, [column, row, sku, updateRow, decimalSeparator]);

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
      <CellValue column={column} value={value} fontSize={fontSize} decimalSeparator={decimalSeparator} />
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

function CellValue({ column, value, fontSize, decimalSeparator }: { column: keyof OutputRow; value: unknown; fontSize: string; decimalSeparator: DecimalSeparator }) {
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
  if (PRICE_COLUMNS.has(column)) {
    const formatted = formatPrice(value as number | null, decimalSeparator);
    const zero = decimalSeparator === "comma" ? "0,00" : "0.00";
    return <span className="font-mono" style={{ fontSize }}>{formatted || zero}</span>;
  }
  if (INTEGER_OUTPUT_COLUMNS.has(column)) {
    const num = value as number | null;
    return <span className="font-mono" style={{ fontSize }}>{num !== null && num !== undefined ? Math.round(num) : "0"}</span>;
  }
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted/50">—</span>;
  }
  if (column === "Reference") {
    return <ReferenceCell value={String(value)} fontSize={fontSize} />;
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
  const dupSkuFilter = useAppStore((s) => s.dupSkuFilter);
  const tagsFilter = useAppStore((s) => s.tagsFilter);
  const search = useAppStore((s) => s.search);
  const sortColumn = useAppStore((s) => s.sortColumn);
  const sortDirection = useAppStore((s) => s.sortDirection);
  const toggleSort = useAppStore((s) => s.toggleSort);
  const visibleColumns = useAppStore((s) => s.visibleColumns);
  const tableSize = useAppStore((s) => s.tableSize);
  const decimalSeparator = useAppStore((s) => s.decimalSeparator);

  const sizeConfig = TABLE_SIZE_CONFIG[tableSize];
  // Horizontal padding shared between header & body cells so columns line up precisely
  const hPad = sizeConfig.cellPadding.split(" ")[1] ?? "8px";

  const dupSkuSet = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of results) counts.set(r["Variant SKU"], (counts.get(r["Variant SKU"]) ?? 0) + 1);
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([s]) => s));
  }, [results]);

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
    if (dupSkuFilter) {
      data = data.filter((r) => dupSkuSet.has(r["Variant SKU"]));
    }
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

  // ── Column model (TanStack Table) ─────────────────────────────────────────
  const columns = useMemo<ColumnDef<OutputRow>[]>(
    () =>
      OUTPUT_COLUMNS.filter((c) => visibleColumns.includes(c.key)).map((c) => ({
        accessorKey: c.key,
        header: c.label,
        size: Math.max(64, Math.round(c.flex * 100)),
        cell:
          c.key === "No"
            ? ({ row }) => <span className="font-mono text-muted">{row.index + 1}</span>
            : ({ row }) => (
                <EditableCell
                  sku={row.original["Variant SKU"]}
                  column={c.key}
                  row={row.original}
                  fontSize={sizeConfig.fontSize}
                  decimalSeparator={decimalSeparator}
                />
              ),
      })),
    [visibleColumns, sizeConfig.fontSize, decimalSeparator]
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
    <div className="flex-1 flex flex-col min-h-0">
      <VirtualDataTable<OutputRow>
        data={sortedData}
        columns={columns}
        rowHeight={sizeConfig.rowHeight}
        fontSize={sizeConfig.fontSize}
        cellPadding={sizeConfig.cellPadding}
        headerPadding={`0 ${hPad}`}
        enableCopy
        getCellTip={(r, id) => {
          const key = id as keyof OutputRow;
          if (EDITABLE_COLUMNS.has(key) || key === "Reference") return undefined;
          const val = r[key];
          return val != null ? String(val) : undefined;
        }}
        sortColumnId={sortColumn}
        sortDir={sortDirection}
        onSort={(id) => toggleSort(id as keyof OutputRow)}
        getRowClassName={(r) =>
          cn(
            r["Variant Inventory Policy"] === "continue" && "bg-amber-50",
            r.Status === "draft" && "bg-zinc-50"
          )
        }
      />

      {/* Row count */}
      <div className="shrink-0 h-7 flex items-center px-3 border-t border-edge bg-surface">
        <span className="text-[11px] text-muted font-mono">
          {sortedData.length} / {results.length} rows
        </span>
      </div>
    </div>
  );
}
