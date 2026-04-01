"use client";

import { cn } from "@/lib/utils";
import { formatCurrency, formatQty } from "@/lib/bestSeller";
import type { BestSellerItem, StockStatusLabel } from "@/lib/stock-types";

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

export default function SKUCompareTable({ items, hasStockData }: SKUCompareTableProps) {
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
    <div className="mx-4 my-3 bg-white border border-edge rounded-lg shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 border-b border-edge">
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
            {items.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-12 text-muted text-sm">
                  No data to display
                </td>
              </tr>
            ) : (
              items.map((item) => (
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
    </div>
  );
}
