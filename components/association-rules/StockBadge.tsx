"use client";

import type { StockInfo } from "@/lib/association-rules/types";
import { cn } from "@/lib/utils";

const STATUS_CONFIG = {
  in_stock: {
    label: "In Stock",
    bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  low_stock: {
    label: "Low Stock",
    bg: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
  out_of_stock: {
    label: "Out of Stock",
    bg: "bg-red-50 text-red-600 border-red-200",
    dot: "bg-red-500",
  },
  incoming: {
    label: "Incoming",
    bg: "bg-blue-50 text-blue-700 border-blue-200",
    dot: "bg-blue-500",
  },
} as const;

export function StockBadge({ stock }: { stock: StockInfo }) {
  const config = STATUS_CONFIG[stock.status];
  const qty =
    stock.status === "out_of_stock" && stock.plannedInStock > 0
      ? stock.plannedInStock
      : stock.availableStock;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-medium rounded-full border",
        config.bg
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", config.dot)} />
      {config.label}
      {stock.status !== "out_of_stock" && (
        <span className="font-mono">({Math.round(qty)})</span>
      )}
      {stock.status === "incoming" && (
        <span className="font-mono">({Math.round(stock.plannedInStock)})</span>
      )}
    </span>
  );
}
