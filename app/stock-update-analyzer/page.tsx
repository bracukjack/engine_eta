"use client";

import { useCallback, useMemo, useState } from "react";
import { cn, buildSearchMatcher, exportToExcel, exportToCsv } from "@/lib/utils";
import { useStockUpdateStore } from "@/lib/stock-update-store";
import { processStockUpdateData } from "@/lib/stock-update-logic";
import type { StockUpdateOutputRow } from "@/lib/stock-update-logic";
import { Button } from "@/components/ui/button";
import {
  Activity, X, Loader2, AlertCircle, Search, Download, ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight, Play, Copy, Columns3, Check
} from "lucide-react";
import { StockFileSlot } from "@/app/stock-analyzer/components/shared";
import { showCopiedToast } from "@/components/ui/data-tooltip";

type ColumnDef = {
  key: string;
  label: string;
  flex: number;
  numeric?: boolean;
  center?: boolean;
};

const COLUMNS: ColumnDef[] = [
  { key: "SKU", label: "SKU", flex: 2 },
  { key: "EAN", label: "EAN", flex: 2 },
  { key: "Qty", label: "Qty", flex: 1, numeric: true },
  { key: "ETA", label: "ETA", flex: 1.5, center: true },
  { key: "StockAwal", label: "Stock Awal", flex: 1.5 },
  { key: "PlannedIn", label: "Planned In", flex: 1.5 },
  { key: "PlannedOut", label: "Planned Out", flex: 1.5 },
  { key: "ETAAsli", label: "ETA Asli", flex: 2 },
];

function LocalColumnToggle({
  visible,
  onToggle,
  onShowAll,
  onHideAll,
}: {
  visible: string[];
  onToggle: (k: string) => void;
  onShowAll: () => void;
  onHideAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hidden = COLUMNS.length - visible.length;

  return (
    <div className="relative z-50">
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <Columns3 size={12} className="mr-1.5" />
        Columns
        {hidden > 0 && (
           <span className="ml-1.5 bg-accent text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
            {hidden} hidden
          </span>
        )}
      </Button>
      {open && (
        <>
        <div className="fixed inset-0" onClick={() => setOpen(false)} />
        <div className="absolute top-full left-0 mt-1 z-50 w-48 bg-white border border-edge rounded-lg shadow-lg py-1">
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-edge">
            <button onClick={onShowAll} className="text-[11px] text-accent hover:underline cursor-pointer">Select All</button>
            <span className="text-muted text-[11px]">·</span>
            <button onClick={onHideAll} className="text-[11px] text-accent hover:underline cursor-pointer">Clear All</button>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {COLUMNS.map((col) => {
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
                  <span className="text-primary truncate">{col.label}</span>
                </button>
              );
            })}
          </div>
        </div>
        </>
      )}
    </div>
  );
}

export default function StockUpdateAnalyzerPage() {
  const store = useStockUpdateStore();
  const [rowsPerPage, setRowsPerPage] = useState<number | "all">(25);
  const [currentPage, setCurrentPage] = useState(1);

  // File Handlers
  const handleDropStockPos = useCallback(async (file: File) => {
    store.setStockPosFile(file.name, await file.arrayBuffer());
  }, [store]);

  const handleDropPo = useCallback(async (file: File) => {
    store.setPoFile(file.name, await file.arrayBuffer());
  }, [store]);

  const handleDropStockUpdate = useCallback(async (file: File) => {
    store.setStockUpdateFile(file.name, await file.arrayBuffer());
  }, [store]);

  const allFilesReady = !!store.stockPosBuffer && !!store.poBuffer && !!store.stockUpdateBuffer;

  const handleRunAnalysis = useCallback(async () => {
    if (!allFilesReady) return;
    store.setProcessing();
    try {
      const results = await processStockUpdateData(store.stockPosBuffer!, store.poBuffer!, store.stockUpdateBuffer!);
      store.setResults(results);
      setCurrentPage(1);
    } catch (err) {
      store.setError(err instanceof Error ? err.message : String(err));
    }
  }, [allFilesReady, store]);

  // Derived state for table
  const matcher = useMemo(() => buildSearchMatcher(store.search), [store.search]);

  const filteredRows = useMemo(() => {
    let res = store.results;
    if (store.search && matcher) {
      res = res.filter(r => matcher([r.SKU, r.EAN, r.ETA, r.ETAAsli]));
    }
    return res;
  }, [store.results, store.search, matcher]);

  const sortedRows = useMemo(() => {
    if (!store.sortColumn) return filteredRows;
    const dir = store.sortDirection === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const col = store.sortColumn as keyof StockUpdateOutputRow;
      const av = a[col];
      const bv = b[col];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? ""), undefined, { numeric: true }) * dir;
    });
  }, [filteredRows, store.sortColumn, store.sortDirection]);

  // Pagination bounds
  const totalPages = rowsPerPage === "all" ? 1 : Math.max(1, Math.ceil(sortedRows.length / rowsPerPage));
  const safePage = Math.min(currentPage, totalPages);
  
  const pagedRows = useMemo(() => {
    if (rowsPerPage === "all") return sortedRows;
    const start = (safePage - 1) * rowsPerPage;
    return sortedRows.slice(start, start + rowsPerPage);
  }, [sortedRows, rowsPerPage, safePage]);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (safePage <= 4) return [1, 2, 3, 4, 5, 6, 7];
    if (safePage >= totalPages - 3) return Array.from({ length: 7 }, (_, i) => totalPages - 6 + i);
    return Array.from({ length: 7 }, (_, i) => safePage - 3 + i);
  }, [totalPages, safePage]);

  // Search input with debounce
  const [searchInput, setSearchInput] = useState(store.search);
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback((val: string) => {
    setSearchInput(val);
    if (searchTimeout) clearTimeout(searchTimeout);
    setSearchTimeout(setTimeout(() => store.setSearch(val), 200));
  }, [store, searchTimeout]);

  const getExportRows = useCallback(() =>
    sortedRows.map(row => COLUMNS.map(c => row[c.key as keyof typeof row] ?? "")),
  [sortedRows]);

  const handleExportCsv = useCallback(() => {
    exportToCsv(COLUMNS.map(c => c.label), getExportRows(), "stock-update-analyzer");
  }, [getExportRows]);

  const handleExportExcel = useCallback(async () => {
    await exportToExcel(COLUMNS.map(c => c.label), getExportRows(), "stock-update-analyzer", "Stock Update");
  }, [getExportRows]);

  const handleCopyColumn = useCallback((colKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const values = sortedRows.map(row => row[colKey as keyof StockUpdateOutputRow] ?? "");
    navigator.clipboard.writeText(values.join("\n"));
    showCopiedToast(e.clientX, e.clientY);
  }, [sortedRows]);

  const activeCols = useMemo(() => COLUMNS.filter(c => store.visibleColumns.includes(c.key)), [store.visibleColumns]);
  const totalFlex = activeCols.reduce((s, c) => s + c.flex, 0);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-base">
      <div className="shrink-0 border-b border-edge bg-surface px-5 py-3 flex items-center gap-3 flex-wrap">
        <h1 className="text-sm font-semibold text-primary mr-2">Stock Update Analyzer</h1>
        
        <Button
          variant="accent"
          size="sm"
          onClick={handleRunAnalysis}
          disabled={!allFilesReady}
        >
          {store.processingState === "processing" ? (
            <Loader2 size={14} className="animate-spin mr-1.5" />
          ) : (
            <Play size={12} className="mr-1.5" />
          )}
          {store.processingState === "processing" ? "Processing..." : "Run Analysis"}
        </Button>

        {store.results.length > 0 && (
          <>
            <button onClick={store.resetAll} className="flex items-center gap-1.5 text-[11px] text-muted hover:text-red-500 transition-colors cursor-pointer ml-1">
              <X size={12} /> Reset Data
            </button>
            <div className="w-px h-5 bg-edge shrink-0 mx-1" />
            <LocalColumnToggle
              visible={store.visibleColumns}
              onToggle={store.toggleColumn}
              onShowAll={store.showAllColumns}
              onHideAll={store.hideAllColumns}
            />
          </>
        )}
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-[240px] shrink-0 border-r border-edge bg-surface/50 p-3 space-y-4 overflow-y-auto flex flex-col">
          <div className="space-y-2">
            <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wider px-1 pb-1">Input Files</h3>
            <StockFileSlot
              label="Stock Position"
              hint=".csv (UTF-16)"
              required
              fileName={store.stockPosFileName}
              isReady={!!store.stockPosFileName}
              onDrop={handleDropStockPos}
              onClear={store.removeStockPosFile}
            />
            <StockFileSlot
              label="Purchase Orders"
              hint=".csv (UTF-16)"
              required
              fileName={store.poFileName}
              isReady={!!store.poFileName}
              onDrop={handleDropPo}
              onClear={store.removePoFile}
            />
            <StockFileSlot
              label="Stock Update"
              hint=".xlsx file"
              required
              fileName={store.stockUpdateFileName}
              isReady={!!store.stockUpdateFileName}
              onDrop={handleDropStockUpdate}
              onClear={store.removeStockUpdateFile}
            />
          </div>
        </div>

        <div className="flex-1 flex flex-col min-h-0 animate-in fade-in duration-500 relative">
          {store.processingState === "error" ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-3 max-w-md">
                <AlertCircle size={32} className="mx-auto text-red-500" />
                <p className="text-sm font-semibold text-red-600">Error processing files</p>
                <p className="text-xs text-muted font-mono break-all">{store.error}</p>
                <Button variant="outline" size="sm" onClick={() => store.setProcessing()}>Retry</Button>
              </div>
            </div>
          ) : store.processingState === "success" ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="shrink-0 border-b border-edge bg-surface px-4 py-2 flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                  <input
                    value={searchInput}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="Search SKU or EAN…"
                    className="pl-7 pr-7 h-8 text-[12px] border border-edge rounded-md bg-white focus:outline-none focus:border-accent/50 w-52"
                  />
                  {searchInput && (
                    <button onClick={() => { setSearchInput(""); store.setSearch(""); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-primary">
                      <X size={11} />
                    </button>
                  )}
                </div>
                <div className="flex-1 min-w-0" />
                <Button variant="outline" size="sm" onClick={handleExportCsv}>
                  <Download size={12} className="mr-1.5" />
                  CSV
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportExcel}>
                  <Download size={12} className="mr-1.5" />
                  Excel
                </Button>
              </div>

              <div className="flex-1 min-h-0 overflow-auto">
                <table className="w-full border-collapse" style={{ tableLayout: "fixed", minWidth: 800 }}>
                  <colgroup>
                    {activeCols.map(col => <col key={col.key} style={{ width: `${((col.flex / totalFlex) * 100).toFixed(2)}%` }} />)}
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-surface">
                    <tr className="border-b border-edge">
                      {activeCols.map(col => {
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
                            <div className={cn("flex items-center gap-1", col.numeric || col.center ? "justify-center" : "justify-start")}>
                              <div onClick={() => store.toggleSort(col.key as keyof StockUpdateOutputRow)} className="flex items-center gap-1 cursor-pointer hover:text-primary">
                                {col.label}
                                {isSorted ? (
                                  store.sortDirection === "asc" ? <ArrowUp size={10} className="text-amber-600 shrink-0" /> : <ArrowDown size={10} className="text-amber-600 shrink-0" />
                                ) : (
                                  <ArrowUpDown size={10} className="opacity-0 group-hover:opacity-30 shrink-0" />
                                )}
                              </div>
                              <button onClick={(e) => handleCopyColumn(col.key, e)} title={`Copy entire ${col.label} column`} className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted hover:text-accent hover:bg-accent/10 transition-colors ml-1">
                                <Copy size={11} />
                              </button>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody
                    onDoubleClick={(e) => {
                      const td = (e.target as HTMLElement).closest("td");
                      if (!td) return;
                      const text = (td.textContent ?? "").trim();
                      if (!text) return;
                      navigator.clipboard.writeText(text);
                      showCopiedToast(e.clientX, e.clientY);
                    }}
                  >
                    {pagedRows.length === 0 ? (
                      <tr>
                        <td colSpan={activeCols.length} className="text-center py-16 text-muted text-sm">No match for "{store.search}".</td>
                      </tr>
                    ) : (
                      pagedRows.map((row) => (
                        <tr key={row.SKU} className="border-b border-edge/50 transition-colors hover:bg-surface-hover">
                          {activeCols.map(col => {
                            const val = row[col.key as keyof typeof row];
                            return (
                              <td
                                key={col.key}
                                className={cn(
                                  "truncate px-3 py-2 text-[12px]",
                                  col.numeric ? "text-center font-mono" : col.center ? "text-center" : "text-left"
                                )}
                                title={String(val)}
                              >
                                {val}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="shrink-0 border-t border-edge bg-surface px-4 h-10 flex items-center gap-3">
                <span className="text-[11px] text-muted font-mono shrink-0">
                  {sortedRows.length === 0 ? "0 rows" : rowsPerPage === "all" ? `${sortedRows.length} rows` : `${Math.min((safePage - 1) * rowsPerPage + 1, sortedRows.length)}–${Math.min(safePage * rowsPerPage, sortedRows.length)} of ${sortedRows.length}`}
                </span>
                <div className="flex-1" />
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[11px] text-muted">Rows:</span>
                  {([25, 50, 100, "all"] as (number | "all")[]).map(n => (
                    <button key={String(n)} onClick={() => { setRowsPerPage(n); setCurrentPage(1); }} className={cn("px-2 py-0.5 rounded text-[11px] font-mono transition-colors", rowsPerPage === n ? "bg-accent text-white" : "text-muted hover:text-primary hover:bg-surface-hover")}>
                      {n === "all" ? "All" : n}
                    </button>
                  ))}
                </div>
                {rowsPerPage !== "all" && totalPages > 1 && (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => setCurrentPage(Math.max(1, safePage - 1))} disabled={safePage === 1} className="p-1 rounded text-muted hover:text-primary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"><ChevronLeft size={14} /></button>
                    {pageNumbers.map(page => (
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
                <Activity size={40} className="mx-auto text-muted/30" />
                <p className="text-sm text-muted">Upload all 3 required files to proceed</p>
                <div className="text-[11px] text-muted/50 font-mono mt-2 space-y-1">
                  <p>• Stock Position (CSV, \t sep)</p>
                  <p>• Purchase Orders (CSV, \t sep)</p>
                  <p>• Stock Update (XLSX)</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
