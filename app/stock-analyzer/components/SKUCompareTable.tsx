"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatQty } from "@/lib/bestSeller";
import type { BestSellerItem, StockStatusLabel } from "@/lib/stock-types";
import { ChevronLeft, ChevronRight } from "lucide-react";

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

interface SKUCompareTableProps {
  items: BestSellerItem[];
  hasStockData: boolean;
}

const PAGE_SIZES: (number | "all")[] = [10, 25, 50, 100, "all"];

export default function SKUCompareTable({ items, hasStockData }: SKUCompareTableProps) {
  const [rowsPerPage, setRowsPerPage] = useState<number | "all">(25);
  const [currentPage, setCurrentPage] = useState(1);

  // Pagination
  const totalPages = rowsPerPage === "all"
    ? 1
    : Math.max(1, Math.ceil(items.length / (rowsPerPage as number)));
  
  // Safe page in case data shrinks
  const safePage = Math.min(currentPage, totalPages);

  const pagedRows = useMemo(() => {
    if (rowsPerPage === "all") return items;
    const start = (safePage - 1) * (rowsPerPage as number);
    return items.slice(start, start + (rowsPerPage as number));
  }, [items, rowsPerPage, safePage]);

  // Page numbers for UI
  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (safePage <= 4) return [1, 2, 3, 4, 5, 6, 7];
    if (safePage >= totalPages - 3) return Array.from({ length: 7 }, (_, i) => totalPages - 6 + i);
    return Array.from({ length: 7 }, (_, i) => safePage - 3 + i);
  }, [totalPages, safePage]);

  if (!hasStockData) {
    return (
      <div className="mx-4 my-3 bg-white border border-edge rounded-lg shadow-sm p-6 text-center">
        <p className="text-sm text-muted">Upload stock file to compare</p>
        <p className="text-[11px] text-muted/50 font-mono mt-1">Stock Position CSV required for SKU comparison</p>
      </div>
    );
  }

  const columns = [
    { key: "itemCode", label: "Item Code", flex: 1.5 },
    { key: "productName", label: "Product Name", flex: 3 },
    { key: "category", label: "Category", flex: 2 },
    { key: "totalQty", label: "Qty Sold", flex: 1, numeric: true },
    { key: "totalRevenue", label: "Revenue", flex: 1.2, numeric: true },
    { key: "currentStock", label: "Current Stock", flex: 1, numeric: true },
    { key: "stockStatus", label: "Stock Status", flex: 1.2 },
  ];

  const totalFlex = columns.reduce((s, c) => s + c.flex, 0);

  return (
    <div className="mx-4 my-3 bg-white border border-edge rounded-lg shadow-sm overflow-hidden flex flex-col relative z-0">
      <div className="px-4 py-2.5 border-b border-edge shrink-0 relative z-20">
        <h3 className="text-xs font-semibold text-primary">SKU Compare vs Stock Position</h3>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse" style={{ tableLayout: "fixed", minWidth: 700 }}>
          <colgroup>
            {columns.map((col) => (
              <col key={col.key} style={{ width: `${((col.flex / totalFlex) * 100).toFixed(2)}%` }} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-edge">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pagedRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-12 text-muted text-sm">
                  No data to display
                </td>
              </tr>
            ) : (
              pagedRows.map((item) => (
                <tr
                  key={item.itemCode}
                  className={cn(
                    "border-b border-edge/50 transition-colors hover:bg-surface-hover",
                    item.stockStatus === "Sold Out" && "bg-red-50/40",
                    item.stockStatus === "Low Stock" && "bg-amber-50/30"
                  )}
                >
                  <td className="px-3 py-1.5 text-[12px] font-mono truncate">{item.itemCode}</td>
                  <td className="px-3 py-1.5 text-[12px] truncate" title={item.productName}>{item.productName}</td>
                  <td className="px-3 py-1.5 text-[12px] truncate">{item.category || "—"}</td>
                  <td className="px-3 py-1.5 text-[12px] font-mono">{formatQty(item.totalQty)}</td>
                  <td className="px-3 py-1.5 text-[12px] font-mono">{formatCurrency(item.totalRevenue)}</td>
                  <td className="px-3 py-1.5 text-[12px] font-mono">
                    {item.currentStock !== null ? formatQty(item.currentStock) : "N/A"}
                  </td>
                  <td className="px-3 py-1.5">
                    <StockStatusBadge status={item.stockStatus} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination bar */}
      <div className="border-t border-edge bg-surface px-4 h-10 flex items-center gap-3 shrink-0 relative z-20">
        <span className="text-[11px] text-muted font-mono shrink-0">
          {items.length === 0
            ? "0 rows"
            : rowsPerPage === "all"
              ? `${items.length} rows`
              : `${Math.min((safePage - 1) * (rowsPerPage as number) + 1, items.length)}–${Math.min(safePage * (rowsPerPage as number), items.length)} of ${items.length}`}
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
