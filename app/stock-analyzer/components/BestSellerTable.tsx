"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { cn, buildSearchMatcher, exportToExcel, exportToCsv } from "@/lib/utils";
import { formatQty } from "@/lib/bestSeller";
import { getChannelColorClass } from "./BestSellerFilters";
import type { BestSellerItem, StockStatusLabel } from "@/lib/stock-types";
import type { ColumnDef } from "@tanstack/react-table";
import { VirtualDataTable } from "@/components/data-table/virtual-data-table";
import {
  Search, X, Download, ChevronLeft, ChevronRight, Check, Columns3
} from "lucide-react";
import { Button } from "@/components/ui/button";

function formatCurrencyInt(value: number): string {
  const abs = Math.round(Math.abs(value));
  const sign = value < 0 ? "-" : "";
  const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `€${sign}${formatted}`;
}

function StockStatusBadge({ status }: { status: StockStatusLabel }) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold font-mono";
  switch (status) {
    case "Sold Out":
      return <span className={`${base} bg-red-100 text-red-700`}>Sold Out</span>;
    case "Low Stock":
      return <span className={`${base} bg-amber-100 text-amber-700`}>Low Stock</span>;
    case "Healthy":
      return <span className={`${base} bg-green-100 text-green-700`}>Healthy</span>;
    case "Overstocked":
      return <span className={`${base} bg-blue-100 text-blue-700`}>Overstocked</span>;
    case "N/A":
    default:
      return <span className={`${base} bg-slate-100 text-slate-500`}>N/A</span>;
  }
}

type SortKey = keyof BestSellerItem;

const COLUMNS: { key: SortKey; label: string; flex: number; numeric?: boolean }[] = [
  { key: "rank", label: "Rank", flex: 0.5, numeric: true },
  { key: "itemCode", label: "Item Code", flex: 1.5 },
  { key: "productName", label: "Product Name", flex: 3 },
  { key: "category", label: "Category", flex: 1.5 },
  { key: "totalQty", label: "Total Qty", flex: 0.8, numeric: true },
  { key: "totalRevenue", label: "Revenue", flex: 1, numeric: true },
  { key: "grossProfit", label: "Gross Profit", flex: 1, numeric: true },
  { key: "orderCount", label: "Orders", flex: 0.7, numeric: true },
  { key: "currentStock", label: "Stock", flex: 0.7, numeric: true },
  { key: "stockStatus", label: "Status", flex: 0.9 },
  { key: "channels", label: "Channels", flex: 1.6 },
];

const PAGE_SIZES: (number | "all")[] = [50, 100, 200, 500, 1000, "all"];

const STATUS_OPTIONS: { value: StockStatusLabel | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "Sold Out", label: "Sold Out" },
  { value: "Low Stock", label: "Low" },
  { value: "Healthy", label: "Healthy" },
  { value: "Overstocked", label: "Over" },
  { value: "N/A", label: "N/A" },
];

interface BestSellerTableProps {
  items: BestSellerItem[];
}

export default function BestSellerTable({ items }: BestSellerTableProps) {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [sortCol, setSortCol] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [statusFilter, setStatusFilter] = useState<StockStatusLabel | "all">("all");
  const [rowsPerPage, setRowsPerPage] = useState<number | "all">(50);
  const [currentPage, setCurrentPage] = useState(1);

  // Column toggle state
  const [visibleCols, setVisibleCols] = useState<SortKey[]>(COLUMNS.map((c) => c.key));
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const colMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!colMenuOpen) return;
    const h = (e: MouseEvent) => {
      if (colMenuRef.current && !colMenuRef.current.contains(e.target as Node)) {
        setColMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [colMenuOpen]);

  const toggleCol = (k: SortKey) => setVisibleCols((prev) => prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]);
  const activeCols = useMemo(() => COLUMNS.filter((c) => visibleCols.includes(c.key)), [visibleCols]);

  // Debounced search
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Reset page on filter change
  useEffect(() => { setCurrentPage(1); }, [search, statusFilter]);

  const toggleSort = (col: SortKey) => {
    if (sortCol === col) {
      setSortDir((d) => d === "asc" ? "desc" : "asc");
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
    setCurrentPage(1);
  };

  // Filtered + sorted
  const processed = useMemo(() => {
    let data = [...items];

    // Status filter
    if (statusFilter !== "all") {
      data = data.filter((i) => i.stockStatus === statusFilter);
    }

    // Search
    const matcher = buildSearchMatcher(search);
    if (matcher) {
      data = data.filter((i) => matcher([i.itemCode, i.productName, i.category]));
    }

    // Sort
    if (sortCol) {
      const dir = sortDir === "asc" ? 1 : -1;
      data.sort((a, b) => {
        const av = a[sortCol];
        const bv = b[sortCol];
        if (av === null && bv === null) return 0;
        if (av === null) return 1;
        if (bv === null) return -1;
        if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
        return String(av).localeCompare(String(bv), undefined, { sensitivity: "base" }) * dir;
      });
    }

    return data;
  }, [items, statusFilter, search, sortCol, sortDir]);

  // Pagination
  const totalPages = rowsPerPage === "all"
    ? 1
    : Math.max(1, Math.ceil(processed.length / (rowsPerPage as number)));
  const safePage = Math.min(currentPage, totalPages);

  const pagedRows = useMemo(() => {
    if (rowsPerPage === "all") return processed;
    const start = (safePage - 1) * (rowsPerPage as number);
    return processed.slice(start, start + (rowsPerPage as number));
  }, [processed, rowsPerPage, safePage]);

  // Page numbers
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (safePage <= 4) return [1, 2, 3, 4, 5, 6, 7];
    if (safePage >= totalPages - 3) return Array.from({ length: 7 }, (_, i) => totalPages - 6 + i);
    return Array.from({ length: 7 }, (_, i) => safePage - 3 + i);
  }, [totalPages, safePage]);

  // Build exportable rows from visible columns
  const getExportData = useCallback(() => {
    const COLS: { key: string; label: string }[] = [
      { key: "rank",         label: "Rank" },
      { key: "itemCode",     label: "ItemCode" },
      { key: "productName",  label: "ProductName" },
      { key: "category",     label: "Category" },
      { key: "totalQty",     label: "TotalQty" },
      { key: "totalRevenue", label: "TotalRevenue" },
      { key: "orderCount",   label: "OrderCount" },
      { key: "currentStock", label: "CurrentStock" },
      { key: "stockStatus",  label: "StockStatus" },
    ].filter((c) => (visibleCols as string[]).includes(c.key));
    const headers = COLS.map((c) => c.label);
    const rows: (string | number | null | undefined)[][] = processed.map((row) =>
      COLS.map((c): string | number | null | undefined => {
        if (c.key === "totalRevenue") return row.totalRevenue.toFixed(2);
        if (c.key === "currentStock") return row.currentStock ?? "N/A";
        return (row as unknown as Record<string, string | number | null | undefined>)[c.key] ?? "";
      })
    );
    return { headers, rows };
  }, [processed, visibleCols]);

  // Export CSV
  const handleExport = useCallback(() => {
    const { headers, rows } = getExportData();
    exportToCsv(headers, rows, `best_sellers_${new Date().toISOString().slice(0, 10)}`);
  }, [getExportData]);

  const handleExportExcel = useCallback(async () => {
    const { headers, rows } = getExportData();
    await exportToExcel(headers, rows, `best_sellers_${new Date().toISOString().slice(0, 10)}`, "Best Sellers");
  }, [getExportData]);

  // Column model for the (only the visible) columns.
  const columns = useMemo<ColumnDef<BestSellerItem>[]>(
    () =>
      activeCols.map((c) => {
        const base: ColumnDef<BestSellerItem> = {
          id: c.key,
          accessorKey: c.key,
          header: c.label,
          size: Math.max(60, Math.round(c.flex * 110)),
        };
        switch (c.key) {
          case "rank":
            return { ...base, meta: { cellClassName: "font-mono text-muted/60" }, cell: ({ row }) => row.original.rank };
          case "itemCode":
            return { ...base, meta: { cellClassName: "font-mono" }, cell: ({ row }) => row.original.itemCode };
          case "category":
            return { ...base, cell: ({ row }) => row.original.category || "—" };
          case "totalQty":
            return { ...base, meta: { cellClassName: "font-mono" }, cell: ({ row }) => formatQty(row.original.totalQty) };
          case "totalRevenue":
            return { ...base, meta: { cellClassName: "font-mono" }, cell: ({ row }) => formatCurrencyInt(row.original.totalRevenue) };
          case "grossProfit":
            return { ...base, meta: { cellClassName: "font-mono" }, cell: ({ row }) => formatCurrencyInt(row.original.grossProfit) };
          case "orderCount":
            return { ...base, meta: { cellClassName: "font-mono" }, cell: ({ row }) => row.original.orderCount };
          case "currentStock":
            return {
              ...base,
              meta: { cellClassName: "font-mono" },
              cell: ({ row }) => (row.original.currentStock !== null ? formatQty(row.original.currentStock) : "N/A"),
            };
          case "stockStatus":
            return { ...base, cell: ({ row }) => <StockStatusBadge status={row.original.stockStatus} /> };
          case "channels":
            return {
              ...base,
              cell: ({ row }) =>
                row.original.channels.length === 0 ? (
                  <span className="text-[11px] text-muted">—</span>
                ) : (
                  <div className="flex gap-0.5 overflow-hidden">
                    {row.original.channels.map((ch) => (
                      <span
                        key={ch}
                        className={cn(
                          "inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium leading-none shrink-0",
                          getChannelColorClass(ch)
                        )}
                      >
                        {ch}
                      </span>
                    ))}
                  </div>
                ),
            };
          default:
            // productName and any text columns
            return base;
        }
      }),
    [activeCols]
  );

  // Text to copy / show on hover, per cell.
  const getCellTip = useCallback((row: BestSellerItem, id: string): string | undefined => {
    switch (id) {
      case "rank": return String(row.rank);
      case "itemCode": return row.itemCode;
      case "productName": return row.productName;
      case "category": return row.category || undefined;
      case "totalQty": return formatQty(row.totalQty);
      case "totalRevenue": return formatCurrencyInt(row.totalRevenue);
      case "grossProfit": return formatCurrencyInt(row.grossProfit);
      case "orderCount": return String(row.orderCount);
      case "currentStock": return row.currentStock !== null ? formatQty(row.currentStock) : "N/A";
      case "stockStatus": return row.stockStatus;
      case "channels": return row.channels.join(", ") || undefined;
      default: return undefined;
    }
  }, []);

  return (
    <div className="mx-4 my-3 bg-white border border-edge rounded-lg shadow-sm overflow-hidden flex flex-col min-h-0 relative z-0">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-edge flex-wrap shrink-0 relative z-20">
        <h3 className="text-xs font-semibold text-primary">Best Seller Data</h3>

        <div className="flex-1 min-w-0" />

        {/* Search */}
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search code, name…"
            className="pl-7 pr-7 h-7 text-[11px] border border-edge rounded-md bg-white focus:outline-none focus:border-accent/50 w-48"
          />
          {searchInput && (
            <button
              onClick={() => { setSearchInput(""); setSearch(""); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-primary cursor-pointer"
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Stock status filter */}
        <div className="flex items-center gap-0.5">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setStatusFilter(opt.value)}
              className={cn(
                "h-6 px-2 rounded text-[10px] font-medium transition-colors cursor-pointer",
                statusFilter === opt.value
                  ? "bg-accent/10 text-accent border border-accent/30"
                  : "text-muted hover:text-primary border border-transparent"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Column Select */}
        <div className="relative" ref={colMenuRef}>
          <Button variant="outline" size="sm" onClick={() => setColMenuOpen((v) => !v)}>
            <Columns3 size={12} className="mr-1.5" />
            Columns
            {COLUMNS.length - visibleCols.length > 0 && (
              <span className="ml-1.5 bg-accent text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
                {COLUMNS.length - visibleCols.length} hidden
              </span>
            )}
          </Button>
          {colMenuOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-white border border-edge rounded-lg shadow-lg py-1 max-h-64 overflow-y-auto">
              <div className="flex items-center gap-1 px-2 py-1.5 border-b border-edge">
                <button onClick={() => setVisibleCols(COLUMNS.map(c => c.key))} className="text-[11px] text-accent hover:underline cursor-pointer">Select All</button>
              </div>
              <div className="py-1">
                {COLUMNS.map((c) => {
                  const checked = visibleCols.includes(c.key);
                  return (
                    <button
                      key={c.key}
                      onClick={() => toggleCol(c.key)}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 transition-colors"
                    >
                      <span className={cn(
                        "flex items-center justify-center w-4 h-4 rounded border shrink-0",
                        checked ? "bg-accent border-accent text-white" : "border-edge bg-white"
                      )}>
                        {checked && <Check size={10} strokeWidth={3} />}
                      </span>
                      <span className="text-primary truncate">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Export */}
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download size={12} className="mr-1.5" />
          CSV
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportExcel}>
          <Download size={12} className="mr-1.5" />
          Excel
        </Button>
      </div>

      {/* Table */}
      <VirtualDataTable<BestSellerItem>
        className="relative z-10"
        maxHeight={500}
        data={pagedRows}
        columns={columns}
        rowHeight={32}
        fontSize="12px"
        cellPadding="6px 12px"
        headerPadding="0 12px"
        enableCopy
        getCellTip={getCellTip}
        sortColumnId={sortCol}
        sortDir={sortDir}
        onSort={(id) => toggleSort(id as SortKey)}
        getRowClassName={(row) =>
          cn(
            row.stockStatus === "Sold Out" && "bg-red-50/40",
            row.stockStatus === "Low Stock" && "bg-amber-50/30"
          )
        }
        empty="No rows match the current filters."
      />

      {/* Pagination bar */}
      <div className="border-t border-edge bg-surface px-4 h-10 flex items-center gap-3 shrink-0 relative z-20">
        <span className="text-[11px] text-muted font-mono shrink-0">
          {processed.length === 0
            ? "0 rows"
            : rowsPerPage === "all"
              ? `${processed.length} rows`
              : `${Math.min((safePage - 1) * (rowsPerPage as number) + 1, processed.length)}–${Math.min(safePage * (rowsPerPage as number), processed.length)} of ${processed.length}`}
        </span>

        <div className="flex-1" />

        {/* Rows per page */}
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[11px] text-muted">Rows:</span>
          {PAGE_SIZES.map((n) => (
            <button
              key={String(n)}
              onClick={() => { setRowsPerPage(n); setCurrentPage(1); }}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] font-mono transition-colors cursor-pointer",
                rowsPerPage === n
                  ? "bg-accent text-white"
                  : "text-muted hover:text-primary hover:bg-surface-hover"
              )}
            >
              {n === "all" ? "All" : n}
            </button>
          ))}
        </div>

        {/* Page nav */}
        {rowsPerPage !== "all" && totalPages > 1 && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
              disabled={safePage === 1}
              className="p-1 rounded text-muted hover:text-primary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronLeft size={14} />
            </button>
            {pageNumbers.map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={cn(
                  "w-6 h-6 rounded text-[11px] font-mono transition-colors cursor-pointer",
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
              className="p-1 rounded text-muted hover:text-primary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
