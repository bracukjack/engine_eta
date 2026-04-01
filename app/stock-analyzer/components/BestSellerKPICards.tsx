"use client";

import { formatCurrency, formatQty } from "@/lib/bestSeller";

interface BestSellerKPICardsProps {
  totalSKU: number;
  totalQtySold: number;
  totalRevenue: number;
  avgDiscount: number;
}

function KPICard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex-1 min-w-[140px] flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white border border-edge shadow-sm">
      <div>
        <p className="text-[11px] text-muted leading-tight">{label}</p>
        <p className={`text-sm font-mono font-semibold leading-tight mt-0.5 ${accent ? "text-accent" : "text-primary"}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

export default function BestSellerKPICards({
  totalSKU,
  totalQtySold,
  totalRevenue,
  avgDiscount,
}: BestSellerKPICardsProps) {
  return (
    <div className="shrink-0 px-4 py-2.5 border-b border-edge bg-panel flex items-stretch gap-2 flex-wrap">
      <KPICard label="Total SKU" value={formatQty(totalSKU)} />
      <KPICard label="Total Qty Sold" value={formatQty(totalQtySold)} accent />
      <KPICard label="Total Revenue" value={formatCurrency(totalRevenue)} accent />
      <KPICard label="Avg Discount" value={`${avgDiscount.toFixed(2)}%`} />
    </div>
  );
}
