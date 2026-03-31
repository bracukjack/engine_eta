"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { parseFileBuffer } from "@/lib/parsers";
import { buildSearchMatcher, formatInteger, cn } from "@/lib/utils";
import { StatChip } from "@/components/status-badge/status-badge";
import { Button } from "@/components/ui/button";
import { useStockStore } from "@/lib/stock-store";
import type { ItemsLookup } from "@/lib/stock-store";
import { STOCK_COLUMNS, STOCK_TABLE_SIZE } from "@/lib/stock-types";
import type { StockRow, StockSummary, StockStatusFilter, StockTableSize } from "@/lib/stock-types";
import {
  Upload, Search, X, ArrowUp, ArrowDown, ArrowUpDown,
  Download, Columns3, Check, ChevronLeft, ChevronRight,
  PackageSearch, Loader2, AlertCircle, Filter, CheckCircle2,
} from "lucide-react";

// ── EU number parser ─────────────────────────────────────────────────────────
function parseStockNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  const s = String(val).trim();
  if (s === "" || s === "-") return 0;
  const normalized = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
}

// ── Process raw CSV rows → StockRow[] + StockSummary ─────────────────────────
function processRows(
  raw: Record<string, unknown>[]
): { rows: StockRow[]; summary: StockSummary } {
  const rows: StockRow[] = raw.map((r, i) => {
    const stock       = parseStockNum(r["Stock"]);
    const plannedOut  = parseStockNum(r["PlannedOutStock"]);
    return {
      No:                              i + 1,
      ItemCode:                        String(r["ItemCode"] ?? ""),
      ItemDescriptionDescription:      String(r["ItemDescriptionDescription"] ?? ""),
      ItemGroupDescriptionDescription: String(r["ItemGroupDescriptionDescription"] ?? ""),
      Class01Description:              "",
      Class06Description:              "",
      Stock:                           stock,
      PlannedInStock:                  parseStockNum(r["PlannedInStock"]),
      PlannedOutStock:                 plannedOut,
      AvailableStock:                  parseStockNum(r["AvailableStock"]),
      RealStock:                       stock - plannedOut,
    };
  });

  const summary: StockSummary = {
    total:             rows.length,
    inStock:           rows.filter((r) => r.Stock > 0).length,
    outOfStock:        rows.filter((r) => r.Stock === 0).length,
    negativeRealStock: rows.filter((r) => r.RealStock < 0).length,
    totalStockQty:     rows.reduce((s, r) => s + r.Stock, 0),
    totalPlannedOut:   rows.reduce((s, r) => s + r.PlannedOutStock, 0),
  };

  return { rows, summary };
}

// ── Real Stock Badge ─────────────────────────────────────────────────────────
function RealStockBadge({ value }: { value: number }) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold font-mono";
  if (value < 0)
    return <span className={`${base} bg-red-100 text-red-700`}>{formatInteger(value)}</span>;
  if (value === 0)
    return <span className={`${base} bg-amber-100 text-amber-700`}>0</span>;
  return <span className={`${base} bg-green-100 text-green-700`}>{formatInteger(value)}</span>;
}

// ── Column Toggle ────────────────────────────────────────────────────────────
function StockColumnToggle({
  visible,
  onToggle,
  onShowAll,
  onHideAll,
}: {
  visible: (keyof StockRow)[];
  onToggle: (k: keyof StockRow) => void;
  onShowAll: () => void;
  onHideAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef   = useRef<HTMLButtonElement>(null);
  const hidden   = STOCK_COLUMNS.length - visible.length;

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current   && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div className="relative">
      <Button ref={btnRef} variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <Columns3 size={12} className="mr-1.5" />
        Columns
        {hidden > 0 && (
          <span className="ml-1.5 bg-accent text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
            {hidden} hidden
          </span>
        )}
      </Button>
      {open && (
        <div ref={panelRef} className="absolute top-full left-0 mt-1 z-50 w-56 bg-white border border-edge rounded-lg shadow-lg py-1">
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-edge">
            <button onClick={onShowAll} className="text-[11px] text-accent hover:underline cursor-pointer">Select All</button>
            <span className="text-muted text-[11px]">·</span>
            <button onClick={onHideAll} className="text-[11px] text-accent hover:underline cursor-pointer">Clear All</button>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {STOCK_COLUMNS.map((col) => {
              const checked = visible.includes(col.key);
              return (
                <button
                  key={col.key}
                  onClick={() => onToggle(col.key)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <span className={cn(
                    "flex items-center justify-center w-4 h-4 rounded border",
                    checked ? "bg-accent border-accent text-white" : "border-edge bg-white"
                  )}>
                    {checked && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span className="text-primary">{col.label}</span>
                  <span className="ml-auto text-[10px] text-muted/60 truncate max-w-[100px]">{col.tooltip}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Category Multi-Select ────────────────────────────────────────────────────
function CategoryFilter({
  categories,
  selected,
  onChange,
  label = "Category",
}: {
  categories: string[];
  selected: string[];
  onChange: (cats: string[]) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef   = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current   && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const toggle = (cat: string) =>
    onChange(selected.includes(cat) ? selected.filter((c) => c !== cat) : [...selected, cat]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-[12px] transition-colors cursor-pointer",
          selected.length > 0
            ? "border-accent bg-accent/5 text-accent"
            : "border-edge bg-white text-muted hover:text-primary hover:border-primary/30"
        )}
      >
        <Filter size={12} />
        {label}
        {selected.length > 0 && (
          <>
            <span className="bg-accent text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
              {selected.length}
            </span>
            <span
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
              className="hover:bg-accent/20 rounded p-0.5"
            >
              <X size={10} />
            </span>
          </>
        )}
      </button>
      {open && (
        <div ref={panelRef} className="absolute top-full left-0 mt-1 z-50 w-64 bg-white border border-edge rounded-lg shadow-lg py-1">
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-edge">
            <button onClick={() => onChange(categories)} className="text-[11px] text-accent hover:underline cursor-pointer">Select All</button>
            <span className="text-muted text-[11px]">·</span>
            <button onClick={() => onChange([])} className="text-[11px] text-accent hover:underline cursor-pointer">Clear All</button>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {categories.map((cat) => {
              const checked = selected.includes(cat);
              return (
                <button
                  key={cat}
                  onClick={() => toggle(cat)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <span className={cn(
                    "flex items-center justify-center w-4 h-4 rounded border shrink-0",
                    checked ? "bg-accent border-accent text-white" : "border-edge bg-white"
                  )}>
                    {checked && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span className="text-primary truncate">{cat}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── File Slot ────────────────────────────────────────────────────────────────
function StockFileSlot({
  label,
  hint,
  required = false,
  fileName,
  isReady,
  onDrop,
  onClear,
}: {
  label: string;
  hint: string;
  required?: boolean;
  fileName: string | null;
  isReady: boolean;
  onDrop: (file: File) => void;
  onClear?: () => void;
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => { if (files[0]) onDrop(files[0]); },
    accept: {
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".csv", ".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
    multiple: false,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "relative border rounded-md p-3 cursor-pointer transition-all duration-200",
        isDragActive && "border-accent bg-blue-50 scale-[1.02]",
        isReady
          ? "border-emerald-300 bg-emerald-50"
          : "border-edge hover:border-muted bg-white"
      )}
    >
      <input {...getInputProps()} />
      <div className="flex items-center gap-2.5">
        {isReady ? (
          <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
        ) : (
          <Upload
            size={14}
            className={cn("shrink-0 transition-colors", isDragActive ? "text-accent" : "text-muted")}
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-primary truncate">
            {label}
            {required && <span className="text-red-400 ml-0.5">*</span>}
          </p>
          {isReady ? (
            <p className="text-[11px] text-emerald-600 font-mono truncate">{fileName}</p>
          ) : (
            <p className="text-[11px] text-muted font-mono">{hint}</p>
          )}
        </div>
        {isReady && onClear && (
          <button
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="p-0.5 rounded text-muted hover:text-red-500 transition-colors"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────
export default function StockAnalyzerPage() {
  const rows             = useStockStore((s) => s.rows);
  const summary          = useStockStore((s) => s.summary);
  const fileName         = useStockStore((s) => s.fileName);
  const processingState  = useStockStore((s) => s.processingState);
  const error            = useStockStore((s) => s.error);
  const search           = useStockStore((s) => s.search);
  const categoryFilter   = useStockStore((s) => s.categoryFilter);
  const stockStatusFilter = useStockStore((s) => s.stockStatusFilter);
  const sortColumn       = useStockStore((s) => s.sortColumn);
  const sortDirection    = useStockStore((s) => s.sortDirection);
  const visibleColumns   = useStockStore((s) => s.visibleColumns);
  const tableSize        = useStockStore((s) => s.tableSize);
  const rowsPerPage      = useStockStore((s) => s.rowsPerPage);
  const currentPage      = useStockStore((s) => s.currentPage);

  const itemsFileName        = useStockStore((s) => s.itemsFileName);
  const class01Filter        = useStockStore((s) => s.class01Filter);
  const class06Filter        = useStockStore((s) => s.class06Filter);

  const setRows               = useStockStore((s) => s.setRows);
  const setItemsData          = useStockStore((s) => s.setItemsData);
  const clearItemsData        = useStockStore((s) => s.clearItemsData);
  const setProcessing         = useStockStore((s) => s.setProcessing);
  const setError              = useStockStore((s) => s.setError);
  const reset                 = useStockStore((s) => s.reset);
  const setSearch             = useStockStore((s) => s.setSearch);
  const setCategoryFilter     = useStockStore((s) => s.setCategoryFilter);
  const setClass01Filter      = useStockStore((s) => s.setClass01Filter);
  const setClass06Filter      = useStockStore((s) => s.setClass06Filter);
  const setStockStatusFilter  = useStockStore((s) => s.setStockStatusFilter);
  const toggleSort            = useStockStore((s) => s.toggleSort);
  const toggleColumn          = useStockStore((s) => s.toggleColumn);
  const showAllColumns        = useStockStore((s) => s.showAllColumns);
  const hideAllColumns        = useStockStore((s) => s.hideAllColumns);
  const setTableSize          = useStockStore((s) => s.setTableSize);
  const setRowsPerPage        = useStockStore((s) => s.setRowsPerPage);
  const setCurrentPage        = useStockStore((s) => s.setCurrentPage);

  // Debounced search
  const [searchInput, setSearchInput] = useState(search);
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(id);
  }, [searchInput, setSearch]);

  // File handler
  const handleFile = useCallback(
    async (file: File) => {
      setProcessing();
      try {
        const buffer = await file.arrayBuffer();
        const raw    = await parseFileBuffer(buffer);
        const { rows, summary } = processRows(raw as Record<string, unknown>[]);
        setRows(rows, summary, file.name);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [setProcessing, setRows, setError]
  );

  // Items file handler (items.csv → Class01/Class06 lookup)
  const handleItemsFile = useCallback(
    async (file: File) => {
      try {
        const buffer = await file.arrayBuffer();
        const raw    = await parseFileBuffer(buffer) as Record<string, unknown>[];
        const lookup: ItemsLookup = {};
        for (const r of raw) {
          const code = String(r["Code"] ?? "").trim();
          if (!code) continue;
          lookup[code] = {
            class01: String(r["Class_01Description"] ?? "").trim(),
            class06: String(r["Class_06Description"] ?? "").trim(),
          };
        }
        setItemsData(lookup, file.name);
      } catch {
        // silently ignore items parse error — sub-categories stay empty
      }
    },
    [setItemsData]
  );

  // Unique sorted categories & sub-categories
  const categories = useMemo(
    () =>
      Array.from(
        new Set(rows.map((r) => r.ItemGroupDescriptionDescription).filter(Boolean))
      ).sort(),
    [rows]
  );

  const class01Options = useMemo(() => {
    const base = categoryFilter.length > 0
      ? rows.filter((r) => categoryFilter.includes(r.ItemGroupDescriptionDescription))
      : rows;
    return Array.from(new Set(base.map((r) => r.Class01Description).filter(Boolean))).sort();
  }, [rows, categoryFilter]);

  const class06Options = useMemo(() => {
    let base = rows;
    if (categoryFilter.length > 0)
      base = base.filter((r) => categoryFilter.includes(r.ItemGroupDescriptionDescription));
    if (class01Filter.length > 0)
      base = base.filter((r) => class01Filter.includes(r.Class01Description));
    return Array.from(new Set(base.map((r) => r.Class06Description).filter(Boolean))).sort();
  }, [rows, categoryFilter, class01Filter]);

  // Active (visible) columns
  const activeCols = useMemo(
    () => STOCK_COLUMNS.filter((c) => visibleColumns.includes(c.key)),
    [visibleColumns]
  );

  // Total flex for proportional widths
  const totalFlex = useMemo(
    () => activeCols.reduce((s, c) => s + c.flex, 0),
    [activeCols]
  );

  // Filtered rows
  const filteredRows = useMemo(() => {
    let data = rows;
    if (categoryFilter.length > 0)
      data = data.filter((r) => categoryFilter.includes(r.ItemGroupDescriptionDescription));
    if (class01Filter.length > 0)
      data = data.filter((r) => class01Filter.includes(r.Class01Description));
    if (class06Filter.length > 0)
      data = data.filter((r) => class06Filter.includes(r.Class06Description));
    if (stockStatusFilter === "inStock")    data = data.filter((r) => r.Stock > 0);
    else if (stockStatusFilter === "outOfStock") data = data.filter((r) => r.Stock === 0);
    else if (stockStatusFilter === "negative")   data = data.filter((r) => r.RealStock < 0);
    const matcher = buildSearchMatcher(search);
    if (matcher)
      data = data.filter((r) =>
        matcher([r.ItemCode, r.ItemDescriptionDescription, r.ItemGroupDescriptionDescription])
      );
    return data;
  }, [rows, categoryFilter, class01Filter, class06Filter, stockStatusFilter, search]);

  // Sorted rows
  const sortedRows = useMemo(() => {
    if (!sortColumn) return filteredRows;
    const dir = sortDirection === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const av = a[sortColumn];
      const bv = b[sortColumn];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv), undefined, { sensitivity: "base" }) * dir;
    });
  }, [filteredRows, sortColumn, sortDirection]);

  // Pagination
  const totalPages = rowsPerPage === "all"
    ? 1
    : Math.max(1, Math.ceil(sortedRows.length / (rowsPerPage as number)));

  const safeCurrentPage = Math.min(currentPage, totalPages);

  const pagedRows = useMemo(() => {
    if (rowsPerPage === "all") return sortedRows;
    const start = (safeCurrentPage - 1) * (rowsPerPage as number);
    return sortedRows.slice(start, start + (rowsPerPage as number));
  }, [sortedRows, rowsPerPage, safeCurrentPage]);

  // Export CSV
  const handleExport = useCallback(async () => {
    const { default: Papa } = await import("papaparse");
    const data = sortedRows.map((row, i) => {
      const obj: Record<string, unknown> = {};
      for (const col of activeCols) {
        obj[col.label] = col.key === "No" ? i + 1 : row[col.key];
      }
      return obj;
    });
    const csv  = Papa.unparse(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `stock_analysis_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sortedRows, activeCols]);

  // Cascading filter handlers — each level clears downstream selections
  const handleCategoryFilter = useCallback((cats: string[]) => {
    setCategoryFilter(cats);
    setClass01Filter([]);
    setClass06Filter([]);
  }, [setCategoryFilter, setClass01Filter, setClass06Filter]);

  const handleClass01Filter = useCallback((cats: string[]) => {
    setClass01Filter(cats);
    setClass06Filter([]);
  }, [setClass01Filter, setClass06Filter]);

  const sizeConfig  = STOCK_TABLE_SIZE[tableSize];
  const isLoaded    = rows.length > 0 && processingState !== "processing";
  const isFiltered  = categoryFilter.length > 0 || class01Filter.length > 0 || class06Filter.length > 0 || stockStatusFilter !== "all" || search !== "";
  const hasItemsData = class01Options.length > 0 || class06Options.length > 0;

  // Pagination page numbers (window of 7)
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (safeCurrentPage <= 4) return [1, 2, 3, 4, 5, 6, 7];
    if (safeCurrentPage >= totalPages - 3) return Array.from({ length: 7 }, (_, i) => totalPages - 6 + i);
    return Array.from({ length: 7 }, (_, i) => safeCurrentPage - 3 + i);
  }, [totalPages, safeCurrentPage]);

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-base">

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-edge bg-surface px-5 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-primary">Stock Analyzer</h1>
          <p className="text-[11px] text-muted font-mono mt-0.5">
            {fileName ?? "Upload a CSV file to begin"}
          </p>
        </div>
        {isLoaded && (
          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-[11px] text-muted hover:text-red-500 transition-colors cursor-pointer"
          >
            <X size={12} />
            Clear
          </button>
        )}
      </div>

      {/* ── Feature tabs ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-edge bg-surface px-5 flex items-end gap-0">
        <button className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-accent border-b-2 border-accent -mb-px">
          <PackageSearch size={13} />
          Real Stock
        </button>
      </div>

      {/* ── Main content: left file panel + right content ───────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Left panel: file slots */}
        <div className="w-[220px] shrink-0 border-r border-edge bg-surface/50 p-3 space-y-2 overflow-y-auto">
          <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wider px-1 pb-1">
            Input Files
          </h3>
          <StockFileSlot
            label="Stock Positions"
            hint="stock-positions.csv"
            required
            fileName={fileName}
            isReady={isLoaded}
            onDrop={handleFile}
            onClear={reset}
          />
          <StockFileSlot
            label="Items CSV"
            hint="items.csv (optional)"
            fileName={itemsFileName}
            isReady={!!itemsFileName}
            onDrop={handleItemsFile}
            onClear={clearItemsData}
          />
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col min-h-0">
          {processingState === "processing" ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-3">
                <Loader2 size={32} className="mx-auto text-accent animate-spin" />
                <p className="text-sm text-muted font-mono">Parsing file…</p>
              </div>
            </div>
          ) : processingState === "error" ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-3 max-w-md">
                <AlertCircle size={32} className="mx-auto text-red-400" />
                <p className="text-sm font-semibold text-red-600">Error loading file</p>
                <p className="text-xs text-muted font-mono break-all">{error}</p>
                <Button variant="outline" size="sm" onClick={reset}>Try Again</Button>
              </div>
            </div>
          ) : !isLoaded ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-2">
                <PackageSearch size={40} className="mx-auto text-muted/30" />
                <p className="text-sm text-muted">Upload a stock positions file to begin</p>
                <p className="text-[11px] text-muted/50 font-mono">Supports .csv · .xlsx · .xls</p>
              </div>
            </div>
          ) : (
            /* ── Data loaded ──────────────────────────────────────────────── */
            <div className="flex-1 flex flex-col min-h-0">

          {/* Control bar */}
          <div className="shrink-0 border-b border-edge bg-surface px-4 py-2 flex items-center gap-2 flex-wrap">

            {/* Search */}
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search code, name, category…"
                className="pl-7 pr-7 h-8 text-[12px] border border-edge rounded-md bg-white focus:outline-none focus:border-accent/50 w-60"
              />
              {searchInput && (
                <button
                  onClick={() => { setSearchInput(""); setSearch(""); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
                >
                  <X size={11} />
                </button>
              )}
            </div>

            <div className="flex-1 min-w-0" />

            {/* Column toggle */}
            <StockColumnToggle
              visible={visibleColumns}
              onToggle={toggleColumn}
              onShowAll={showAllColumns}
              onHideAll={hideAllColumns}
            />

            {/* Export */}
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download size={12} className="mr-1.5" />
              Export CSV
            </Button>

            {/* Table size */}
            <div className="flex items-center gap-0 border border-edge rounded-md overflow-hidden">
              {(["S", "M", "L"] as StockTableSize[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setTableSize(s)}
                  className={cn(
                    "px-2.5 py-1.5 text-[11px] font-mono transition-colors",
                    tableSize === s
                      ? "bg-accent text-white"
                      : "bg-white text-muted hover:bg-surface-hover"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Summary stats */}
          {summary && (
            <div className="shrink-0 px-4 py-2 border-b border-edge bg-panel flex items-center gap-2 flex-wrap">
              <StatChip label="Total SKUs"        value={summary.total} />
              <StatChip label="In Stock"          value={summary.inStock}           accent />
              <StatChip label="Out of Stock"      value={summary.outOfStock} />
              <StatChip label="Negative Real"     value={summary.negativeRealStock} />
              <StatChip label="Total Qty"         value={formatInteger(summary.totalStockQty)} />
              <StatChip label="Total Planned Out" value={formatInteger(summary.totalPlannedOut)} />
              {isFiltered && (
                <>
                  <div className="w-px h-5 bg-edge" />
                  <StatChip label="Showing" value={`${filteredRows.length} / ${rows.length}`} accent />
                </>
              )}
            </div>
          )}

          {/* Filter bar */}
          <div className="shrink-0 px-4 py-2 border-b border-edge bg-surface flex items-center gap-2 flex-wrap">
            <CategoryFilter
              categories={categories}
              selected={categoryFilter}
              onChange={handleCategoryFilter}
            />

            {hasItemsData && class01Options.length > 0 && (
              <CategoryFilter
                categories={class01Options}
                selected={class01Filter}
                onChange={handleClass01Filter}
                label="Class 01"
              />
            )}

            {hasItemsData && class06Options.length > 0 && (
              <CategoryFilter
                categories={class06Options}
                selected={class06Filter}
                onChange={setClass06Filter}
                label="Class 06"
              />
            )}

            <div className="w-px h-5 bg-edge shrink-0" />

            {/* Stock status chips */}
            <div className="flex items-center gap-1">
              {([
                { value: "all",        label: "All" },
                { value: "inStock",    label: "In Stock" },
                { value: "outOfStock", label: "Out of Stock" },
                { value: "negative",   label: "Negative Real" },
              ] as { value: StockStatusFilter; label: string }[]).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setStockStatusFilter(opt.value)}
                  className={cn(
                    "h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer",
                    stockStatusFilter === opt.value
                      ? "bg-accent/10 text-accent border border-accent/30"
                      : "text-muted hover:text-primary hover:bg-surface-hover border border-transparent"
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {isFiltered && (
              <button
                onClick={() => {
                  setCategoryFilter([]);
                  setClass01Filter([]);
                  setClass06Filter([]);
                  setStockStatusFilter("all");
                  setSearchInput("");
                  setSearch("");
                }}
                className="flex items-center gap-1 text-[11px] text-muted hover:text-red-500 ml-auto transition-colors cursor-pointer"
              >
                <X size={11} />
                Clear filters
              </button>
            )}
          </div>

          {/* Table */}
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full border-collapse" style={{ tableLayout: "fixed", minWidth: 700 }}>
              <colgroup>
                {activeCols.map((col) => (
                  <col
                    key={col.key}
                    style={{ width: `${((col.flex / totalFlex) * 100).toFixed(2)}%` }}
                  />
                ))}
              </colgroup>

              {/* Sticky header */}
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-edge">
                  {activeCols.map((col) => {
                    const isSorted = sortColumn === col.key;
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
                            sortDirection === "asc"
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

              {/* Body */}
              <tbody>
                {pagedRows.length === 0 ? (
                  <tr>
                    <td colSpan={activeCols.length} className="text-center py-16 text-muted text-sm">
                      {isFiltered ? "No rows match the current filters." : "No data."}
                    </td>
                  </tr>
                ) : (
                  pagedRows.map((row, pageIdx) => {
                    const displayNo =
                      rowsPerPage === "all"
                        ? pageIdx + 1
                        : (safeCurrentPage - 1) * (rowsPerPage as number) + pageIdx + 1;
                    return (
                      <tr
                        key={row.No}
                        className={cn(
                          "border-b border-edge/50 transition-colors hover:bg-surface-hover",
                          row.RealStock < 0 && "bg-red-50/40"
                        )}
                      >
                        {activeCols.map((col) => {
                          const value = row[col.key];
                          return (
                            <td
                              key={col.key}
                              className="truncate overflow-hidden"
                              style={{ padding: sizeConfig.cellPadding, fontSize: sizeConfig.fontSize }}
                              title={
                                col.key !== "RealStock" && value != null ? String(value) : undefined
                              }
                            >
                              {col.key === "No" ? (
                                <span className="font-mono text-muted/60">{displayNo}</span>
                              ) : col.key === "RealStock" ? (
                                <RealStockBadge value={row.RealStock} />
                              ) : col.numeric ? (
                                <span className="font-mono">{formatInteger(value as number)}</span>
                              ) : (
                                <span>{String(value ?? "")}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination bar */}
          <div className="shrink-0 border-t border-edge bg-surface px-4 h-10 flex items-center gap-3">
            {/* Row count */}
            <span className="text-[11px] text-muted font-mono shrink-0">
              {sortedRows.length === 0
                ? "0 rows"
                : rowsPerPage === "all"
                  ? `${sortedRows.length} rows`
                  : `${Math.min((safeCurrentPage - 1) * (rowsPerPage as number) + 1, sortedRows.length)}–${Math.min(safeCurrentPage * (rowsPerPage as number), sortedRows.length)} of ${sortedRows.length}`}
            </span>

            <div className="flex-1" />

            {/* Rows per page */}
            <div className="flex items-center gap-1 shrink-0">
              <span className="text-[11px] text-muted">Rows:</span>
              {([25, 50, 100, "all"] as (number | "all")[]).map((n) => (
                <button
                  key={String(n)}
                  onClick={() => setRowsPerPage(n)}
                  className={cn(
                    "px-2 py-0.5 rounded text-[11px] font-mono transition-colors",
                    rowsPerPage === n
                      ? "bg-accent text-white"
                      : "text-muted hover:text-primary hover:bg-surface-hover"
                  )}
                >
                  {n === "all" ? "All" : n}
                </button>
              ))}
            </div>

            {/* Page navigation */}
            {rowsPerPage !== "all" && totalPages > 1 && (
              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => setCurrentPage(Math.max(1, safeCurrentPage - 1))}
                  disabled={safeCurrentPage === 1}
                  className="p-1 rounded text-muted hover:text-primary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>

                {pageNumbers.map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    className={cn(
                      "w-6 h-6 rounded text-[11px] font-mono transition-colors",
                      safeCurrentPage === page
                        ? "bg-accent text-white"
                        : "text-muted hover:text-primary hover:bg-surface-hover"
                    )}
                  >
                    {page}
                  </button>
                ))}

                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, safeCurrentPage + 1))}
                  disabled={safeCurrentPage === totalPages}
                  className="p-1 rounded text-muted hover:text-primary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
