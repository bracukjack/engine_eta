"use client";

import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import { cn, buildSearchMatcher, exportToExcel, exportToCsv } from "@/lib/utils";
import { useOPMarketingStore } from "@/lib/op-marketing/store";
import { processCampaignOffers } from "@/lib/op-marketing/process";
import { CAMPAIGN_COLUMNS, KATANA_LANG_COLUMNS } from "@/lib/op-marketing/types";
import type { CampaignOfferRow, KatanaLangKey } from "@/lib/op-marketing/types";
import { StockFileSlot } from "@/app/stock-analyzer/components/shared";
import { Button } from "@/components/ui/button";
import {
  Play, Loader2, AlertCircle, X, Download, Search,
  ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight,
  Columns3, Check, Tag, FileSpreadsheet,
} from "lucide-react";

// ── Column Toggle ─────────────────────────────────────────────────────────────
function ColumnToggle() {
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

  const hidden = CAMPAIGN_COLUMNS.length - visibleColumns.length;

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
        <div ref={ref} className="absolute top-full left-0 mt-1 z-50 w-48 bg-white border border-edge rounded-lg shadow-lg py-1">
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-edge">
            <button onClick={showAllColumns} className="text-[11px] text-accent hover:underline cursor-pointer">Select All</button>
            <span className="text-muted text-[11px]">·</span>
            <button onClick={hideAllColumns} className="text-[11px] text-accent hover:underline cursor-pointer">Clear All</button>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {CAMPAIGN_COLUMNS.map((col) => {
              const checked = visibleColumns.includes(col.key);
              return (
                <button
                  key={col.key}
                  onClick={() => toggleColumn(col.key)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <span className={cn(
                    "flex items-center justify-center w-4 h-4 rounded border shrink-0",
                    checked ? "bg-accent border-accent text-white" : "border-edge bg-white"
                  )}>
                    {checked && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span className="text-primary truncate">{col.label}</span>
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
function ExportMenu({ rows }: { rows: CampaignOfferRow[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const visibleColumns = useOPMarketingStore((s) => s.visibleColumns);

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

  const activeCols = CAMPAIGN_COLUMNS.filter((c) => visibleColumns.includes(c.key));

  const getExportData = useCallback(() => {
    const headers = activeCols.map((c) => c.label);
    const data = rows.map((row) => activeCols.map((c) => row[c.key] ?? ""));
    return { headers, data };
  }, [rows, activeCols]);

  const handleExcel = useCallback(async () => {
    const { headers, data } = getExportData();
    const date = new Date().toISOString().slice(0, 10);
    await exportToExcel(headers, data, `campaign_offers_${date}`, "Campaign Offers");
    setOpen(false);
  }, [getExportData]);

  const handleCsv = useCallback(() => {
    const { headers, data } = getExportData();
    const date = new Date().toISOString().slice(0, 10);
    exportToCsv(headers, data, `campaign_offers_${date}`);
    setOpen(false);
  }, [getExportData]);

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

// ── Editable Cell — every column is editable via double-click ─────────────────
function EditableCell({
  rowIndex,
  col,
  value,
}: {
  rowIndex: number;
  col: (typeof CAMPAIGN_COLUMNS)[number];
  value: string | number;
}) {
  const updateRow = useOPMarketingStore((s) => s.updateRow);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDoubleClick = useCallback(() => {
    setDraft(value === null || value === undefined ? "" : String(value));
    setEditing(true);
  }, [value]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = useCallback(
    (raw: string) => {
      setEditing(false);
      const trimmed = raw.trim();

      if (col.numeric) {
        // Accept both "1234.56" and "1234,56"
        const n = parseFloat(trimmed.replace(",", "."));
        if (!isNaN(n)) updateRow(rowIndex, { [col.key]: n } as Partial<CampaignOfferRow>);
        return;
      }
      // Text columns — save as-is
      updateRow(rowIndex, { [col.key]: trimmed } as Partial<CampaignOfferRow>);
    },
    [col, rowIndex, updateRow]
  );

  const cancel = useCallback(() => setEditing(false), []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") { e.preventDefault(); commit(draft); }
      if (e.key === "Escape") cancel();
    },
    [draft, commit, cancel]
  );

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(draft)}
        onKeyDown={handleKeyDown}
        className={cn(
          "w-full border border-accent rounded bg-white focus:outline-none text-[12px]",
          col.numeric ? "text-right font-mono" : "text-left"
        )}
        style={{ padding: "1px 6px" }}
      />
    );
  }

  const displayValue =
    col.numeric && typeof value === "number"
      ? value.toFixed(2).replace(".", ",")
      : value === null || value === undefined || value === ""
      ? "—"
      : String(value);

  const isEmpty = value === null || value === undefined || value === "";

  return (
    <div
      onDoubleClick={handleDoubleClick}
      className={cn(
        "w-full h-full flex items-center truncate cursor-text group",
        col.center && "justify-center",
        col.numeric && "justify-end font-mono",
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

  const handleSearchChange = useCallback(
    (val: string) => {
      setSearchInput(val);
      if (searchTimeout) clearTimeout(searchTimeout);
      setSearchTimeout(setTimeout(() => store.setSearch(val), 200));
    },
    [store, searchTimeout]
  );

  // File handlers
  const handleDisclist = useCallback(async (file: File) => {
    store.setDisclistFile(file.name, await file.arrayBuffer());
  }, [store]);
  const handleStock = useCallback(async (file: File) => {
    store.setStockFile(file.name, await file.arrayBuffer());
  }, [store]);
  const handleOffers = useCallback(async (file: File) => {
    store.setOffersFile(file.name, await file.arrayBuffer());
  }, [store]);
  const handleLog = useCallback(async (file: File) => {
    store.setLogFile(file.name, await file.arrayBuffer());
  }, [store]);
  const handleKatana = useCallback(async (file: File) => {
    store.setKatanaFile(file.name, await file.arrayBuffer());
  }, [store]);

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
        store.katanaBuffer ? store.selectedLang : null
      );
      store.setResults(result.rows, result.matched, result.skipped);
      setCurrentPage(1);
    } catch (err) {
      store.setError(err instanceof Error ? err.message : String(err));
    }
  }, [allFilesReady, store]);

  // Derived table data
  const matcher = useMemo(() => buildSearchMatcher(store.search), [store.search]);

  const filteredRows = useMemo(() => {
    if (!store.search || !matcher) return store.results;
    return store.results.filter((r) =>
      matcher([r.EAN, r["SKU VU"], r["Product title"], r["Shop name"], r.Country])
    );
  }, [store.results, store.search, matcher]);

  const sortedRows = useMemo(() => {
    if (!store.sortColumn) return filteredRows;
    const col = store.sortColumn;
    const dir = store.sortDirection === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const av = a[col];
      const bv = b[col];
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

  const activeCols = useMemo(
    () => CAMPAIGN_COLUMNS.filter((c) => store.visibleColumns.includes(c.key)),
    [store.visibleColumns]
  );
  const totalFlex = activeCols.reduce((s, c) => s + c.flex, 0);

  // Map paged row back to its index in store.results for editing
  const getResultIndex = useCallback(
    (row: CampaignOfferRow) => store.results.indexOf(row),
    [store.results]
  );

  const hasResults = store.results.length > 0;

  return (
    <div className="flex flex-1 min-h-0">
      {/* ── Left panel: config + files ── */}
      <div className="w-[240px] shrink-0 border-r border-edge bg-surface/50 p-3 space-y-3 overflow-y-auto flex flex-col">
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
                placeholder="e.g. MyShop"
                className="w-full border border-edge rounded px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent/50 bg-white"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wider px-1">
            Input Files
          </h3>
          <StockFileSlot
            label="Discount List"
            hint=".xlsx file"
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
            label="Offers CSV"
            hint=".csv (semicolon sep.)"
            required
            fileName={store.offersFileName}
            isReady={!!store.offersFileName}
            onDrop={handleOffers}
            onClear={store.removeOffersFile}
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

        {/* Katana — optional, for multilingual product names */}
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
          {/* Language selector — only shown when Katana file is loaded */}
          {store.katanaFileName && (
            <div>
              <label className="text-[11px] text-muted font-medium block mb-0.5">
                Product Name Language
              </label>
              <select
                value={store.selectedLang}
                onChange={(e) => store.setSelectedLang(e.target.value as KatanaLangKey)}
                className="w-full border border-edge rounded px-2.5 py-1.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent/50 bg-white cursor-pointer"
              >
                {KATANA_LANG_COLUMNS.map((lang) => (
                  <option key={lang.key} value={lang.key}>
                    {lang.label}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-muted/60 font-mono mt-1 px-0.5">
                Overrides "Product title" from offers
              </p>
            </div>
          )}
        </div>

        {hasResults && (
          <div className="space-y-1 pt-1 border-t border-edge">
            <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wider px-1">
              Result
            </h3>
            <div className="space-y-1 px-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-muted">Output rows</span>
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
        {/* Top action bar */}
        <div className="shrink-0 border-b border-edge bg-surface px-4 py-2.5 flex items-center gap-2 flex-wrap">
          <Button
            variant="accent"
            size="sm"
            onClick={handleRun}
            disabled={!allFilesReady || store.processingState === "processing"}
          >
            {store.processingState === "processing" ? (
              <Loader2 size={14} className="animate-spin mr-1.5" />
            ) : (
              <Play size={12} className="mr-1.5" />
            )}
            {store.processingState === "processing" ? "Processing…" : "Run"}
          </Button>

          {hasResults && (
            <>
              <button
                onClick={store.resetAll}
                className="flex items-center gap-1.5 text-[11px] text-muted hover:text-red-500 transition-colors cursor-pointer ml-1"
              >
                <X size={12} /> Reset Data
              </button>
              <div className="w-px h-5 bg-edge shrink-0 mx-1" />
              <ColumnToggle />
              <ExportMenu rows={sortedRows} />
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
              {" · "}{activeCols.length}/{CAMPAIGN_COLUMNS.length} cols
              {" · "}<span className="text-muted/60">dbl-click cell to edit</span>
            </span>
          )}
        </div>

        {/* Error banner */}
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
              <table className="w-full border-collapse" style={{ tableLayout: "fixed", minWidth: 700 }}>
                <colgroup>
                  {activeCols.map((col) => (
                    <col
                      key={col.key}
                      style={{ width: `${((col.flex / totalFlex) * 100).toFixed(2)}%` }}
                    />
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
                                col.numeric ? "text-right" : col.center ? "text-center" : "text-left"
                              )}
                            >
                              <EditableCell
                                rowIndex={resultIdx}
                                col={col}
                                value={row[col.key] ?? ""}
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
                  <button
                    onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
                    disabled={safePage === 1}
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
                        safePage === page
                          ? "bg-accent text-white"
                          : "text-muted hover:text-primary hover:bg-surface-hover"
                      )}
                    >
                      {page}
                    </button>
                  ))}
                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
                    disabled={safePage === totalPages}
                    className="p-1 rounded text-muted hover:text-primary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center space-y-2">
              <Tag size={40} className="mx-auto text-muted/30" />
              <p className="text-sm text-muted">Fill in config and upload all 4 files to start</p>
              <div className="text-[11px] text-muted/50 font-mono mt-2 space-y-0.5">
                <p>• Discount List (.xlsx)</p>
                <p>• Stock CSV (UTF-16)</p>
                <p>• Offers CSV (semicolon delimiter)</p>
                <p>• Item Log CSV (UTF-16)</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
