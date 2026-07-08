"use client";

import { useState, useCallback, useMemo } from "react";
import { useStockStore } from "@/lib/stock-store";
import { buildSearchMatcher, formatInteger, cn, exportToExcel, exportToCsv } from "@/lib/utils";
import { StatChip } from "@/components/status-badge/status-badge";
import { Button } from "@/components/ui/button";
import { STOCK_COLUMNS, STOCK_TABLE_SIZE } from "@/lib/stock-types";
import type { StockTableSize, StockStatusFilter, StockRow } from "@/lib/stock-types";
import type { ColumnDef } from "@tanstack/react-table";
import { VirtualDataTable, type VDTColumnMeta } from "@/components/data-table/virtual-data-table";
import {
  Search, X, Download, ChevronLeft, ChevronRight,
} from "lucide-react";

import {
  RealStockBadge,
  StockColumnToggle,
  CategoryFilter,
} from "../components/shared";

// STOCK_TABLE_SIZE has no row height; derive one per size for virtualization.
const STOCK_ROW_HEIGHT: Record<StockTableSize, number> = { S: 28, M: 32, L: 38 };

export default function RealStockTab() {
  const rows              = useStockStore((s) => s.rows);
  const summary           = useStockStore((s) => s.summary);
  const search            = useStockStore((s) => s.search);
  const setSearch         = useStockStore((s) => s.setSearch);
  const categoryFilter    = useStockStore((s) => s.categoryFilter);
  const setCategoryFilter = useStockStore((s) => s.setCategoryFilter);
  const class01Filter     = useStockStore((s) => s.class01Filter);
  const setClass01Filter  = useStockStore((s) => s.setClass01Filter);
  const class04Filter     = useStockStore((s) => s.class04Filter);
  const setClass04Filter  = useStockStore((s) => s.setClass04Filter);
  const stockStatusFilter = useStockStore((s) => s.stockStatusFilter);
  const setStockStatusFilter = useStockStore((s) => s.setStockStatusFilter);
  const sortColumn        = useStockStore((s) => s.sortColumn);
  const toggleSort        = useStockStore((s) => s.toggleSort);
  const sortDirection     = useStockStore((s) => s.sortDirection);
  const visibleColumns    = useStockStore((s) => s.visibleColumns);
  const toggleColumn      = useStockStore((s) => s.toggleColumn);
  const showAllColumns    = useStockStore((s) => s.showAllColumns);
  const hideAllColumns    = useStockStore((s) => s.hideAllColumns);
  const tableSize         = useStockStore((s) => s.tableSize);
  const setTableSize      = useStockStore((s) => s.setTableSize);
  const rowsPerPage       = useStockStore((s) => s.rowsPerPage);
  const setRowsPerPage    = useStockStore((s) => s.setRowsPerPage);
  const currentPage       = useStockStore((s) => s.currentPage);
  const setCurrentPage    = useStockStore((s) => s.setCurrentPage);


  // Debounced search
  const [searchInput, setSearchInput] = useState(search);
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback(
    (val: string) => {
      setSearchInput(val);
      if (searchTimeout) clearTimeout(searchTimeout);
      setSearchTimeout(setTimeout(() => setSearch(val), 200));
    },
    [setSearch, searchTimeout]
  );

  // Derived filters
  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.ItemGroupDescriptionDescription).filter(Boolean))).sort(),
    [rows]
  );

  const class01Options = useMemo(
    () => Array.from(new Set(rows.map((r) => r.Class01Description).filter(Boolean))).sort(),
    [rows]
  );

  const class04Options = useMemo(
    () => Array.from(new Set(rows.map((r) => r.Class04Description).filter(Boolean))).sort(),
    [rows]
  );

  const hasItemsDataActual = class01Options.length > 0 || class04Options.length > 0;

  const handleCategoryFilter = useCallback(
    (cats: string[]) => { setCategoryFilter(cats); setCurrentPage(1); },
    [setCategoryFilter, setCurrentPage]
  );

  const handleClass01Filter = useCallback(
    (cats: string[]) => { setClass01Filter(cats); setCurrentPage(1); },
    [setClass01Filter, setCurrentPage]
  );

  const matcher = useMemo(() => buildSearchMatcher(search), [search]);

  const filteredRows = useMemo(() => {
    let result = rows;
    if (categoryFilter.length > 0)
      result = result.filter((r) => categoryFilter.includes(r.ItemGroupDescriptionDescription));
    if (class01Filter.length > 0)
      result = result.filter((r) => class01Filter.includes(r.Class01Description));
    if (class04Filter.length > 0)
      result = result.filter((r) => class04Filter.includes(r.Class04Description));
    if (stockStatusFilter === "inStock") result = result.filter((r) => r.Stock > 0);
    if (stockStatusFilter === "outOfStock") result = result.filter((r) => r.Stock === 0);
    if (stockStatusFilter === "negative") result = result.filter((r) => r.RealStock < 0);
    if (search && matcher) {
      result = result.filter((r) =>
        matcher([r.ItemCode, r.ItemDescriptionDescription, r.ItemGroupDescriptionDescription])
      );
    }
    return result;
  }, [rows, categoryFilter, class01Filter, class04Filter, stockStatusFilter, search, matcher]);

  const sortedRows = useMemo(() => {
    if (!sortColumn) return filteredRows;
    const dir = sortDirection === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const av = a[sortColumn]; const bv = b[sortColumn];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av ?? "").localeCompare(String(bv ?? "")) * dir;
    });
  }, [filteredRows, sortColumn, sortDirection]);

  const activeCols = useMemo(
    () => STOCK_COLUMNS.filter((c) => visibleColumns.includes(c.key)),
    [visibleColumns]
  );

  const totalPages = useMemo(
    () => (rowsPerPage === "all" ? 1 : Math.ceil(sortedRows.length / (rowsPerPage as number))),
    [sortedRows, rowsPerPage]
  );

  const safeCurrentPage = Math.min(currentPage, Math.max(1, totalPages));

  const pagedRows = useMemo(
    () =>
      rowsPerPage === "all"
        ? sortedRows
        : sortedRows.slice((safeCurrentPage - 1) * (rowsPerPage as number), safeCurrentPage * (rowsPerPage as number)),
    [sortedRows, rowsPerPage, safeCurrentPage]
  );

  const handleExport = useCallback(() => {
    exportToCsv(activeCols.map((c) => c.label), sortedRows.map((row) => activeCols.map((c) => row[c.key] ?? "")), "stock-export");
  }, [activeCols, sortedRows]);

  const handleExportExcel = useCallback(async () => {
    await exportToExcel(activeCols.map((c) => c.label), sortedRows.map((row) => activeCols.map((c) => row[c.key] ?? "")), "stock-export", "Stock");
  }, [activeCols, sortedRows]);

  const sizeConfig = STOCK_TABLE_SIZE[tableSize];
  const isFiltered = categoryFilter.length > 0 || class01Filter.length > 0 || class04Filter.length > 0 || stockStatusFilter !== "all" || search !== "";

  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (safeCurrentPage <= 4) return [1, 2, 3, 4, 5, 6, 7];
    if (safeCurrentPage >= totalPages - 3) return Array.from({ length: 7 }, (_, i) => totalPages - 6 + i);
    return Array.from({ length: 7 }, (_, i) => safeCurrentPage - 3 + i);
  }, [totalPages, safeCurrentPage]);

  const pageOffset = rowsPerPage === "all" ? 0 : (safeCurrentPage - 1) * (rowsPerPage as number);

  // Column model for the visible columns.
  const columns = useMemo<ColumnDef<StockRow>[]>(
    () =>
      activeCols.map((col) => {
        const meta: VDTColumnMeta = { headerTitle: col.tooltip };
        const base: ColumnDef<StockRow> = {
          id: col.key,
          accessorKey: col.key,
          header: col.label,
          size: Math.max(60, Math.round(col.flex * 110)),
          meta,
        };
        if (col.key === "No")
          return { ...base, meta: { ...meta, cellClassName: "font-mono text-muted/60" }, cell: ({ row }) => pageOffset + row.index + 1 };
        if (col.key === "RealStock")
          return { ...base, cell: ({ row }) => <RealStockBadge value={row.original.RealStock} /> };
        if (col.numeric)
          return { ...base, meta: { ...meta, cellClassName: "font-mono" }, cell: ({ row }) => formatInteger(row.original[col.key] as number) };
        return { ...base, cell: ({ row }) => String(row.original[col.key] ?? "") };
      }),
    [activeCols, pageOffset]
  );

  const getCellTip = useCallback((row: StockRow, id: string): string | undefined => {
    if (id === "No") return undefined;
    const col = STOCK_COLUMNS.find((c) => c.key === id);
    const value = row[id as keyof StockRow];
    if (id === "RealStock") return String(row.RealStock);
    if (col?.numeric) return formatInteger(value as number);
    return value != null ? String(value) : undefined;
  }, []);

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Control bar */}
      <div className="shrink-0 border-b border-edge bg-surface px-4 py-2 flex items-center gap-2 flex-wrap">
        {/* Search */}
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
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

        <StockColumnToggle
          visible={visibleColumns}
          onToggle={toggleColumn}
          onShowAll={showAllColumns}
          onHideAll={hideAllColumns}
        />

        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download size={12} className="mr-1.5" />
          CSV
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportExcel}>
          <Download size={12} className="mr-1.5" />
          Excel
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
          <StatChip label="Total SKUs" value={summary.total} />
          <StatChip label="In Stock" value={summary.inStock} accent />
          <StatChip label="Out of Stock" value={summary.outOfStock} />
          <StatChip label="Negative Real" value={summary.negativeRealStock} />
          <StatChip label="Total Qty" value={formatInteger(summary.totalStockQty)} />
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

        {hasItemsDataActual && class01Options.length > 0 && (
          <CategoryFilter
            categories={class01Options}
            selected={class01Filter}
            onChange={handleClass01Filter}
            label="Class 01"
          />
        )}

        {hasItemsDataActual && class04Options.length > 0 && (
          <CategoryFilter
            categories={class04Options}
            selected={class04Filter}
            onChange={setClass04Filter}
            label="Class 04"
          />
        )}

        <div className="w-px h-5 bg-edge shrink-0" />

        {/* Stock status chips */}
        <div className="flex items-center gap-1">
          {([
            { value: "all", label: "All" },
            { value: "inStock", label: "In Stock" },
            { value: "outOfStock", label: "Out of Stock" },
            { value: "negative", label: "Negative Real" },
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
              setClass04Filter([]);
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
      <VirtualDataTable<StockRow>
        data={pagedRows}
        columns={columns}
        rowHeight={STOCK_ROW_HEIGHT[tableSize]}
        fontSize={sizeConfig.fontSize}
        cellPadding={sizeConfig.cellPadding}
        headerPadding="0 12px"
        enableCopy
        getCellTip={getCellTip}
        sortColumnId={sortColumn}
        sortDir={sortDirection}
        onSort={(id) => toggleSort(id as keyof StockRow)}
        getRowClassName={(row) => cn(row.RealStock < 0 && "bg-red-50/40")}
        empty={isFiltered ? "No rows match the current filters." : "No data."}
      />

      {/* Pagination bar */}
      <div className="shrink-0 border-t border-edge bg-surface px-4 h-10 flex items-center gap-3">
        <span className="text-[11px] text-muted font-mono shrink-0">
          {sortedRows.length === 0
            ? "0 rows"
            : rowsPerPage === "all"
              ? `${sortedRows.length} rows`
              : `${Math.min((safeCurrentPage - 1) * (rowsPerPage as number) + 1, sortedRows.length)}–${Math.min(safeCurrentPage * (rowsPerPage as number), sortedRows.length)} of ${sortedRows.length}`}
        </span>

        <div className="flex-1" />

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
  );
}
