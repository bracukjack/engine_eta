"use client";

import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import { cn, buildSearchMatcher, exportToExcel, exportToCsv } from "@/lib/utils";
import { useOPMarketingStore } from "@/lib/op-marketing/store";
import { processCampaignOffers } from "@/lib/op-marketing/process";
import { KATANA_LANG_COLUMNS } from "@/lib/op-marketing/types";
import type { CampaignOfferRow, ColDef, KatanaLangKey } from "@/lib/op-marketing/types";
import { buildCampaignColumns } from "@/lib/op-marketing/types";
import { StockFileSlot } from "@/app/stock-analyzer/components/shared";
import { Button } from "@/components/ui/button";
import {
  Play, Loader2, AlertCircle, X, Download, Search,
  ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight,
  Columns3, Check, Tag, FileSpreadsheet, PlusCircle, RefreshCw,
  Languages,
} from "lucide-react";

// ── Language multi-select dropdown ────────────────────────────────────────────
function LangPicker() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const selectedLangs = useOPMarketingStore((s) => s.selectedLangs);
  const toggleLang = useOPMarketingStore((s) => s.toggleLang);
  const setSelectedLangs = useOPMarketingStore((s) => s.setSelectedLangs);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-xs transition-colors cursor-pointer",
          selectedLangs.length > 0
            ? "border-accent bg-accent/5 text-accent"
            : "border-edge bg-white text-muted hover:text-primary hover:border-primary/40"
        )}
      >
        <Languages size={12} />
        <span>
          {selectedLangs.length === 0
            ? "Language (from offers)"
            : selectedLangs.length === 1
            ? KATANA_LANG_COLUMNS.find((l) => l.key === selectedLangs[0])?.label ?? selectedLangs[0]
            : `${selectedLangs.length} languages`}
        </span>
        {selectedLangs.length > 0 && (
          <span
            onClick={(e) => { e.stopPropagation(); setSelectedLangs([]); }}
            className="hover:bg-accent/20 rounded p-0.5 -mr-1"
          >
            <X size={10} />
          </span>
        )}
      </button>

      {open && (
        <div
          ref={ref}
          className="absolute top-full left-0 mt-1 z-50 w-52 bg-white border border-edge rounded-lg shadow-lg py-1"
        >
          <div className="px-3 py-1.5 border-b border-edge">
            <p className="text-[10px] text-muted/70 font-mono leading-tight">
              Each language adds a separate<br />"Product title (XX)" column
            </p>
          </div>
          <div className="py-1">
            {KATANA_LANG_COLUMNS.map((lang) => {
              const checked = selectedLangs.includes(lang.key);
              return (
                <button
                  key={lang.key}
                  onClick={() => toggleLang(lang.key as KatanaLangKey)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <span className={cn(
                    "flex items-center justify-center w-4 h-4 rounded border shrink-0",
                    checked ? "bg-accent border-accent text-white" : "border-edge bg-white"
                  )}>
                    {checked && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span className="text-primary">{lang.label}</span>
                </button>
              );
            })}
          </div>
          <div className="border-t border-edge px-3 py-1.5">
            <p className="text-[10px] text-muted/60 font-mono">
              Katana file required for name lookup
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Column Toggle ─────────────────────────────────────────────────────────────
function ColumnToggle({ allKeys }: { allKeys: string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const visibleColumns = useOPMarketingStore((s) => s.visibleColumns);
  const toggleColumn = useOPMarketingStore((s) => s.toggleColumn);
  const showAllColumns = useOPMarketingStore((s) => s.showAllColumns);
  const hideAllColumns = useOPMarketingStore((s) => s.hideAllColumns);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const hidden = allKeys.length - visibleColumns.length;

  return (
    <div className="relative z-50">
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
        <div ref={ref} className="absolute top-full left-0 mt-1 z-50 w-52 bg-white border border-edge rounded-lg shadow-lg py-1">
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-edge">
            <button onClick={showAllColumns} className="text-[11px] text-accent hover:underline cursor-pointer">Select All</button>
            <span className="text-muted text-[11px]">·</span>
            <button onClick={hideAllColumns} className="text-[11px] text-accent hover:underline cursor-pointer">Clear All</button>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {allKeys.map((key) => {
              const checked = visibleColumns.includes(key);
              return (
                <button
                  key={key}
                  onClick={() => toggleColumn(key)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <span className={cn(
                    "flex items-center justify-center w-4 h-4 rounded border shrink-0",
                    checked ? "bg-accent border-accent text-white" : "border-edge bg-white"
                  )}>
                    {checked && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span className="text-primary truncate">{key}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Export Dropdown ───────────────────────────────────────────────────────────
function ExportMenu({
  rows,
  activeCols,
}: {
  rows: CampaignOfferRow[];
  activeCols: ColDef[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (
        ref.current && !ref.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const country = useOPMarketingStore((s) => s.country);

  const getExportData = useCallback(() => {
    const headers = activeCols.map((c) => c.key);
    const data = rows.map((row) => activeCols.map((c) => row[c.key] ?? ""));
    return { headers, data };
  }, [rows, activeCols]);

  const baseName = useCallback(() => {
    const date = new Date().toISOString().slice(0, 10);
    const suffix = country.trim() ? `_${country.trim().toUpperCase()}` : "";
    return `campaign_offers${suffix}_${date}`;
  }, [country]);

  const handleExcel = useCallback(async () => {
    const { headers, data } = getExportData();
    await exportToExcel(headers, data, baseName(), "Campaign Offers");
    setOpen(false);
  }, [getExportData, baseName]);

  const handleCsv = useCallback(() => {
    const { headers, data } = getExportData();
    exportToCsv(headers, data, baseName());
    setOpen(false);
  }, [getExportData, baseName]);

  return (
    <div className="relative z-40">
      <Button ref={btnRef} variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <Download size={12} className="mr-1.5" />
        Export
      </Button>
      {open && (
        <div ref={ref} className="absolute top-full left-0 mt-1 w-52 bg-white border border-edge rounded-lg shadow-lg py-1">
          <div className="px-3 py-1.5 border-b border-edge">
            <span className="text-[10px] text-muted font-mono">
              {rows.length.toLocaleString()} rows × {activeCols.length} cols
            </span>
          </div>
          <button
            onClick={handleExcel}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <FileSpreadsheet size={12} className="text-green-600" />
            Export to Excel (.xlsx)
          </button>
          <button
            onClick={handleCsv}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Download size={12} className="text-blue-600" />
            Export to CSV (.csv)
          </button>
        </div>
      )}
    </div>
  );
}

// ── Editable Cell ─────────────────────────────────────────────────────────────
function EditableCell({
  rowIndex,
  colKey,
  value,
  numeric,
  integer,
  center,
}: {
  rowIndex: number;
  colKey: string;
  value: string | number;
  numeric?: boolean;
  integer?: boolean;
  center?: boolean;
}) {
  const updateRow = useOPMarketingStore((s) => s.updateRow);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) { inputRef.current?.focus(); inputRef.current?.select(); }
  }, [editing]);

  const isNumericCol = numeric || integer;

  const commit = useCallback(
    (raw: string) => {
      setEditing(false);
      const trimmed = raw.trim();
      if (isNumericCol) {
        const n = integer
          ? parseInt(trimmed, 10)
          : parseFloat(trimmed.replace(",", "."));
        if (!isNaN(n)) updateRow(rowIndex, { [colKey]: n });
        return;
      }
      updateRow(rowIndex, { [colKey]: trimmed });
    },
    [colKey, isNumericCol, integer, rowIndex, updateRow]
  );

  const cancel = useCallback(() => setEditing(false), []);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(draft); }
          if (e.key === "Escape") cancel();
        }}
        className={cn(
          "w-full border border-accent rounded bg-white focus:outline-none text-[12px]",
          isNumericCol ? "text-right font-mono" : "text-left"
        )}
        style={{ padding: "1px 6px" }}
      />
    );
  }

  const displayValue =
    integer && typeof value === "number"
      ? String(Math.round(value))                          // plain integer, no separator
      : numeric && typeof value === "number"
      ? value.toFixed(2).replace(".", ",")                 // euro price format
      : value === null || value === undefined || value === ""
      ? "—"
      : String(value);

  const isEmpty = value === null || value === undefined || value === "";

  return (
    <div
      onDoubleClick={() => {
        setDraft(value === null || value === undefined ? "" : String(value));
        setEditing(true);
      }}
      className={cn(
        "w-full h-full flex items-center truncate cursor-text group",
        center && "justify-center",
        numeric && "justify-end font-mono",
        isEmpty && "text-muted/40"
      )}
      title="Double-click to edit"
    >
      <span className="truncate">{displayValue}</span>
      <span className="ml-1 opacity-0 group-hover:opacity-25 text-[8px] text-muted shrink-0 select-none">✎</span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function CampaignOffersTab() {
  const store = useOPMarketingStore();

  const [rowsPerPage, setRowsPerPage] = useState<number | "all">(25);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchInput, setSearchInput] = useState(store.search);
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((val: string) => {
    setSearchInput(val);
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeout(setTimeout(() => store.setSearch(val), 200));
  }, [store, searchTimeout]);

  // File handlers
  const handleDisclist = useCallback(async (f: File) => store.setDisclistFile(f.name, await f.arrayBuffer()), [store]);
  const handleStock = useCallback(async (f: File) => store.setStockFile(f.name, await f.arrayBuffer()), [store]);
  const handleOffers = useCallback(async (f: File) => store.setOffersFile(f.name, await f.arrayBuffer()), [store]);
  const handleLog = useCallback(async (f: File) => store.setLogFile(f.name, await f.arrayBuffer()), [store]);
  const handleKatana = useCallback(async (f: File) => store.setKatanaFile(f.name, await f.arrayBuffer()), [store]);

  const allFilesReady =
    !!store.disclistBuffer &&
    !!store.stockBuffer &&
    !!store.offersBuffer &&
    !!store.logBuffer &&
    store.country.trim() !== "" &&
    store.shopName.trim() !== "";

  const handleRun = useCallback(async () => {
    if (!allFilesReady) return;
    store.setProcessing();
    try {
      const result = processCampaignOffers(
        { country: store.country, shopName: store.shopName },
        store.disclistBuffer!,
        store.stockBuffer!,
        store.offersBuffer!,
        store.logBuffer!,
        store.katanaBuffer,
        store.katanaBuffer && store.selectedLangs.length > 0 ? store.selectedLangs : null,
        store.minStock
      );
      store.setResults(result.rows, result.matched, result.skipped, result.columnKeys);
      setCurrentPage(1);
    } catch (err) {
      store.setError(err instanceof Error ? err.message : String(err));
    }
  }, [allFilesReady, store]);

  // Build ColDef array from activeColumnKeys (preserves order, derives props from key name)
  const allColDefs = useMemo((): ColDef[] => {
    if (store.activeColumnKeys.length === 0) return buildCampaignColumns(store.selectedLangs);
    return store.activeColumnKeys.map((key): ColDef => {
      if (key === "Price" || key === "Discount price") return { key, label: key === "Price" ? "Price" : "Disc. Price", flex: 1.5, numeric: true };
      if (key === "% discount") return { key, label: "% Disc", flex: 1, center: true };
      if (key === "Country") return { key, label: "Country", flex: 1, center: true };
      if (key === "EAN") return { key, label: "EAN", flex: 2 };
      if (key === "SKU VU") return { key, label: "SKU VU", flex: 2 };
      if (key === "Shop name") return { key, label: "Shop Name", flex: 2 };
      if (key === "Product title") return { key, label: "Product Title", flex: 3 };
      if (key.startsWith("Product title (")) return { key, label: key.replace("Product title (", "Title ("), flex: 2.5 };
      if (key === "Stock") return { key, label: "Stock", flex: 1, integer: true };
      if (key === "Planned Out") return { key, label: "Plan Out", flex: 1, integer: true };
      if (key === "Real Stock") return { key, label: "Real Stock", flex: 1.2, integer: true };
      return { key, label: key, flex: 2 };
    });
  }, [store.activeColumnKeys, store.selectedLangs]);

  const activeCols = useMemo(
    () => allColDefs.filter((c) => store.visibleColumns.includes(c.key)),
    [allColDefs, store.visibleColumns]
  );
  const totalFlex = activeCols.reduce((s, c) => s + c.flex, 0);

  // Filtering & sorting
  const matcher = useMemo(() => buildSearchMatcher(store.search), [store.search]);

  const filteredRows = useMemo(() => {
    if (!store.search || !matcher) return store.results;
    return store.results.filter((r) =>
      matcher([
        r.EAN, r["SKU VU"], r["Shop name"], r.Country,
        ...Object.entries(r)
          .filter(([k]) => k.startsWith("Product title"))
          .map(([, v]) => String(v)),
      ])
    );
  }, [store.results, store.search, matcher]);

  const sortedRows = useMemo(() => {
    if (!store.sortColumn) return filteredRows;
    const col = store.sortColumn;
    const dir = store.sortDirection === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const av = a[col]; const bv = b[col];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true }) * dir;
    });
  }, [filteredRows, store.sortColumn, store.sortDirection]);

  const totalPages = rowsPerPage === "all" ? 1 : Math.max(1, Math.ceil(sortedRows.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);

  const pagedRows = useMemo(() => {
    if (rowsPerPage === "all") return sortedRows;
    const start = (safePage - 1) * (rowsPerPage as number);
    return sortedRows.slice(start, start + (rowsPerPage as number));
  }, [sortedRows, rowsPerPage, safePage]);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (safePage <= 4) return [1, 2, 3, 4, 5, 6, 7];
    if (safePage >= totalPages - 3) return Array.from({ length: 7 }, (_, i) => totalPages - 6 + i);
    return Array.from({ length: 7 }, (_, i) => safePage - 3 + i);
  }, [totalPages, safePage]);

  const getResultIndex = useCallback(
    (row: CampaignOfferRow) => store.results.indexOf(row),
    [store.results]
  );

  const hasResults = store.results.length > 0;

  return (
    <div className="flex flex-1 min-h-0">
      {/* ── Left panel ── */}
      <div className="w-[240px] shrink-0 border-r border-edge bg-surface/50 p-3 space-y-3 overflow-y-auto">

        {/* Config */}
        <div className="space-y-2">
          <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wider px-1">
            Configuration
          </h3>
          <div className="space-y-1.5">
            <div>
              <label className="text-[11px] text-muted font-medium block mb-0.5">
                Country Code <span className="text-red-400">*</span>
              </label>
              <input
                value={store.country}
                onChange={(e) => store.setCountry(e.target.value.toUpperCase())}
                placeholder="AT"
                maxLength={5}
                className="w-full border border-edge rounded px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent/50 bg-white"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted font-medium block mb-0.5">
                Shop Name <span className="text-red-400">*</span>
              </label>
              <input
                value={store.shopName}
                onChange={(e) => store.setShopName(e.target.value)}
                placeholder="Bazar Bizar"
                className="w-full border border-edge rounded px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent/50 bg-white"
              />
            </div>
            <div>
              <label className="text-[11px] text-muted font-medium block mb-0.5">
                Min Real Stock
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  value={store.minStock}
                  onChange={(e) => store.setMinStock(Number(e.target.value) || 1)}
                  className="w-full border border-edge rounded px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent/50 bg-white"
                />
                <div className="flex flex-row gap-0.5 shrink-0">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => store.setMinStock(n)}
                      className={cn(
                        "px-1.5 py-0.5 text-[10px] rounded border font-mono transition-colors cursor-pointer",
                        store.minStock === n
                          ? "bg-accent text-white border-accent"
                          : "bg-white text-muted border-edge hover:border-accent/50 hover:text-accent"
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[10px] text-muted/50 mt-0.5 font-mono">
                stock − planned_out ≥ {store.minStock}
              </p>
            </div>
          </div>
        </div>

        {/* Shared files — uploaded once */}
        <div className="space-y-2">
          <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wider px-1">
            Shared Files
          </h3>
          <StockFileSlot
            label="Discount List"
            hint=".xlsx"
            required
            fileName={store.disclistFileName}
            isReady={!!store.disclistFileName}
            onDrop={handleDisclist}
            onClear={store.removeDisclistFile}
          />
          <StockFileSlot
            label="Stock CSV"
            hint=".csv (UTF-16)"
            required
            fileName={store.stockFileName}
            isReady={!!store.stockFileName}
            onDrop={handleStock}
            onClear={store.removeStockFile}
          />
          <StockFileSlot
            label="Item Log CSV"
            hint=".csv (UTF-16)"
            required
            fileName={store.logFileName}
            isReady={!!store.logFileName}
            onDrop={handleLog}
            onClear={store.removeLogFile}
          />
        </div>

        {/* Offers — can be swapped per channel */}
        <div className="space-y-2">
          <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wider px-1 flex items-center gap-1">
            Offers
            <span className="text-[9px] text-muted/50 font-normal normal-case tracking-normal">per channel</span>
          </h3>
          <StockFileSlot
            label="Offers CSV"
            hint=".csv (semicolon sep.)"
            required
            fileName={store.offersFileName}
            isReady={!!store.offersFileName}
            onDrop={handleOffers}
            onClear={store.removeOffersFile}
          />
          {/* Append mode toggle */}
          <div className="flex items-center justify-between px-0.5">
            <div className="flex flex-col">
              <span className="text-[11px] text-muted font-medium">Append to table</span>
              <span className="text-[10px] text-muted/50">
                {store.appendMode ? "Run adds rows to existing data" : "Run replaces existing data"}
              </span>
            </div>
            <button
              onClick={() => store.setAppendMode(!store.appendMode)}
              className={cn(
                "relative inline-flex h-4 w-7 items-center rounded-full transition-colors shrink-0",
                store.appendMode ? "bg-accent" : "bg-edge"
              )}
            >
              <span className={cn(
                "inline-block h-3 w-3 rounded-full bg-white transition-transform",
                store.appendMode ? "translate-x-3.5" : "translate-x-0.5"
              )} />
            </button>
          </div>
        </div>

        {/* Katana — optional, multilingual product names */}
        <div className="space-y-2">
          <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wider px-1">
            Product Names
          </h3>
          <StockFileSlot
            label="Katana Daily Export"
            hint=".xlsx — optional"
            fileName={store.katanaFileName}
            isReady={!!store.katanaFileName}
            onDrop={handleKatana}
            onClear={store.removeKatanaFile}
          />
          {store.katanaFileName && (
            <div>
              <label className="text-[11px] text-muted font-medium block mb-1">
                Language columns
              </label>
              <LangPicker />
            </div>
          )}
        </div>

        {/* Result summary */}
        {hasResults && (
          <div className="space-y-1 pt-1 border-t border-edge">
            <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wider px-1">
              Result
            </h3>
            <div className="space-y-1 px-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-muted">Total rows</span>
                <span className="font-mono text-primary font-semibold">{store.results.length}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted">Matched</span>
                <span className="font-mono text-emerald-600">{store.matchedCount}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-muted">Skipped</span>
                <span className="font-mono text-amber-600">{store.skippedCount}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Right panel ── */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Action bar */}
        <div className="shrink-0 border-b border-edge bg-surface px-4 py-2.5 flex items-center gap-2 flex-wrap">
          <Button
            variant="accent"
            size="sm"
            onClick={handleRun}
            disabled={!allFilesReady || store.processingState === "processing"}
          >
            {store.processingState === "processing" ? (
              <Loader2 size={14} className="animate-spin mr-1.5" />
            ) : store.appendMode && hasResults ? (
              <PlusCircle size={12} className="mr-1.5" />
            ) : (
              <Play size={12} className="mr-1.5" />
            )}
            {store.processingState === "processing"
              ? "Processing…"
              : store.appendMode && hasResults
              ? "Run & Append"
              : "Run"}
          </Button>

          {/* Append mode quick-toggle in bar */}
          {hasResults && (
            <button
              onClick={() => store.setAppendMode(!store.appendMode)}
              className={cn(
                "flex items-center gap-1.5 text-[11px] px-2 py-1 rounded border transition-colors cursor-pointer",
                store.appendMode
                  ? "border-accent/40 bg-accent/5 text-accent"
                  : "border-edge bg-white text-muted hover:text-primary"
              )}
              title={store.appendMode ? "Append mode: Run adds rows to existing table" : "Replace mode: Run replaces existing table"}
            >
              {store.appendMode ? <PlusCircle size={11} /> : <RefreshCw size={11} />}
              {store.appendMode ? "Append" : "Replace"}
            </button>
          )}

          {hasResults && (
            <>
              <button
                onClick={store.resetAll}
                className="flex items-center gap-1.5 text-[11px] text-muted hover:text-red-500 transition-colors cursor-pointer ml-1"
              >
                <X size={12} /> Reset
              </button>
              <div className="w-px h-5 bg-edge shrink-0 mx-1" />
              <ColumnToggle allKeys={store.activeColumnKeys} />
              <ExportMenu rows={sortedRows} activeCols={activeCols} />
            </>
          )}

          {hasResults && (
            <div className="relative ml-1">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search EAN, SKU, product…"
                className="pl-7 pr-7 h-8 text-[12px] border border-edge rounded-md bg-white focus:outline-none focus:border-accent/50 w-52"
              />
              {searchInput && (
                <button
                  onClick={() => { setSearchInput(""); store.setSearch(""); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          )}

          {hasResults && (
            <span className="ml-auto text-[11px] text-muted font-mono">
              {filteredRows.length < store.results.length
                ? `${filteredRows.length.toLocaleString()} / ${store.results.length.toLocaleString()} rows`
                : `${store.results.length.toLocaleString()} rows`}
              {" · "}{activeCols.length}/{allColDefs.length} cols
              {" · "}<span className="text-muted/50">dbl-click to edit</span>
            </span>
          )}
        </div>

        {/* Error */}
        {store.processingState === "error" && (
          <div className="mx-4 mt-3 px-3 py-2 rounded bg-red-50 border border-red-200 text-red-600 text-xs font-mono flex items-start gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5" />
            <span>{store.error}</span>
          </div>
        )}

        {/* Content */}
        {store.processingState === "processing" ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3">
              <Loader2 size={32} className="mx-auto text-accent animate-spin" />
              <p className="text-sm text-muted font-mono">Processing files…</p>
            </div>
          </div>
        ) : hasResults ? (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex-1 min-h-0 overflow-auto">
              <table
                className="w-full border-collapse"
                style={{ tableLayout: "fixed", minWidth: Math.max(700, activeCols.length * 100) }}
              >
                <colgroup>
                  {activeCols.map((col) => (
                    <col key={col.key} style={{ width: `${((col.flex / totalFlex) * 100).toFixed(2)}%` }} />
                  ))}
                </colgroup>

                <thead className="sticky top-0 z-10 bg-surface">
                  <tr className="border-b border-edge">
                    {activeCols.map((col) => {
                      const isSorted = store.sortColumn === col.key;
                      return (
                        <th
                          key={col.key}
                          className={cn(
                            "px-3 py-2 text-[11px] font-semibold uppercase tracking-wider select-none whitespace-nowrap group",
                            col.numeric || col.center ? "text-center" : "text-left",
                            isSorted ? "text-amber-600" : "text-muted"
                          )}
                        >
                          <div className={cn(
                            "flex items-center gap-1",
                            col.numeric || col.center ? "justify-center" : "justify-start"
                          )}>
                            <button
                              onClick={() => store.toggleSort(col.key)}
                              className="flex items-center gap-1 cursor-pointer hover:text-primary"
                            >
                              {col.label}
                              {isSorted ? (
                                store.sortDirection === "asc"
                                  ? <ArrowUp size={10} className="text-amber-600 shrink-0" />
                                  : <ArrowDown size={10} className="text-amber-600 shrink-0" />
                              ) : (
                                <ArrowUpDown size={10} className="opacity-0 group-hover:opacity-30 shrink-0" />
                              )}
                            </button>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>

                <tbody>
                  {pagedRows.length === 0 ? (
                    <tr>
                      <td colSpan={activeCols.length} className="text-center py-16 text-muted text-sm">
                        No results for "{store.search}"
                      </td>
                    </tr>
                  ) : (
                    pagedRows.map((row, pageIdx) => {
                      const resultIdx = getResultIndex(row);
                      return (
                        <tr
                          key={`${row.EAN}-${row["SKU VU"]}-${pageIdx}`}
                          className="border-b border-edge/50 transition-colors hover:bg-surface-hover"
                        >
                          {activeCols.map((col) => (
                            <td
                              key={col.key}
                              className={cn(
                                "px-2 py-1.5 text-[12px] overflow-hidden",
                                (col.numeric || col.integer) ? "text-right" : col.center ? "text-center" : "text-left"
                              )}
                            >
                              <EditableCell
                                rowIndex={resultIdx}
                                colKey={col.key}
                                value={row[col.key] ?? ""}
                                numeric={col.numeric}
                                integer={col.integer}
                                center={col.center}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="shrink-0 border-t border-edge bg-surface px-4 h-10 flex items-center gap-3">
              <span className="text-[11px] text-muted font-mono shrink-0">
                {sortedRows.length === 0
                  ? "0 rows"
                  : rowsPerPage === "all"
                  ? `${sortedRows.length} rows`
                  : `${Math.min((safePage - 1) * (rowsPerPage as number) + 1, sortedRows.length)}–${Math.min(safePage * (rowsPerPage as number), sortedRows.length)} of ${sortedRows.length}`}
              </span>
              <div className="flex-1" />
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[11px] text-muted">Rows:</span>
                {([25, 50, 100, "all"] as (number | "all")[]).map((n) => (
                  <button
                    key={String(n)}
                    onClick={() => { setRowsPerPage(n); setCurrentPage(1); }}
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
              {rowsPerPage !== "all" && totalPages > 1 && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <button onClick={() => setCurrentPage(Math.max(1, safePage - 1))} disabled={safePage === 1} className="p-1 rounded text-muted hover:text-primary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={14} /></button>
                  {pageNumbers.map((page) => (
                    <button key={page} onClick={() => setCurrentPage(page)} className={cn("w-6 h-6 rounded text-[11px] font-mono transition-colors", safePage === page ? "bg-accent text-white" : "text-muted hover:text-primary hover:bg-surface-hover")}>{page}</button>
                  ))}
                  <button onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))} disabled={safePage === totalPages} className="p-1 rounded text-muted hover:text-primary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronRight size={14} /></button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center space-y-2">
              <Tag size={40} className="mx-auto text-muted/30" />
              <p className="text-sm text-muted">Upload shared files + offers to start</p>
              <div className="text-[11px] text-muted/50 font-mono mt-2 space-y-0.5">
                <p>Shared: Discount List, Stock CSV, Item Log CSV</p>
                <p>Per channel: Offers CSV</p>
                <p>Optional: Katana (multilingual names)</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
