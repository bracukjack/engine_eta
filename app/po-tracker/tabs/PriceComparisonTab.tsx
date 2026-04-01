"use client";

import { useState, useMemo } from "react";
import { AlertCircle } from "lucide-react";
import { type PriceRecord, fmtDate, fmtPrice } from "@/lib/po-tracker";
import { ItemDropdown, SelectFilter, EmptyState, ThCell } from "../components/shared";

type CompareCol = "supplierName" | "currency" | "latestPrice" | "activeFrom" | "purchaseLeadTime" | "minimumQuantity" | "mainSupplier";

interface CompareRow {
  supplierName: string; currency: string; latestPrice: number | null;
  activeFrom: string | null; purchaseLeadTime: number | null; minimumQuantity: number | null;
  mainSupplier: string; isMain: boolean;
}

function buildCompareRows(priceData: PriceRecord[], itemCode: string, currency: string): CompareRow[] {
  const filtered = priceData.filter((r) => r.itemCode === itemCode && (currency === "all" || r.currency === currency));
  const latestMap = new Map<string, PriceRecord>();
  for (const r of filtered) {
    const ex = latestMap.get(r.supplierName);
    if (!ex || (r.activeFrom ?? "") > (ex.activeFrom ?? "")) latestMap.set(r.supplierName, r);
  }
  return Array.from(latestMap.values()).map((r) => ({
    supplierName: r.supplierName, currency: r.currency, latestPrice: r.purchasePrice,
    activeFrom: r.activeFrom, purchaseLeadTime: r.purchaseLeadTime, minimumQuantity: r.minimumQuantity,
    mainSupplier: r.mainSupplier, isMain: r.mainSupplier === "1",
  }));
}

export default function PriceComparisonTab({ priceData }: { priceData: PriceRecord[] }) {
  const [selectedItem, setSelectedItem] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [sortCol, setSortCol] = useState<CompareCol>("latestPrice");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const itemOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of priceData) map.set(r.itemCode, (map.get(r.itemCode) ?? 0) + 1);
    return Array.from(map.entries()).map(([code, count]) => ({ code, count })).sort((a, b) => a.code.localeCompare(b.code));
  }, [priceData]);

  const allCurrencies = useMemo(() => selectedItem ? Array.from(new Set(priceData.filter((r) => r.itemCode === selectedItem).map((r) => r.currency).filter(Boolean))).sort() : [], [priceData, selectedItem]);
  const compareRows = useMemo(() => selectedItem ? buildCompareRows(priceData, selectedItem, currencyFilter) : [], [priceData, selectedItem, currencyFilter]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...compareRows].sort((a, b) => {
      const av = a[sortCol]; const bv = b[sortCol];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      if (av === null) return 1; if (bv === null) return -1;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [compareRows, sortCol, sortDir]);

  function toggleSort(col: CompareCol) {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }

  const prices = compareRows.map((r) => r.latestPrice).filter((p): p is number => p !== null);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;
  const cheapest = compareRows.find((r) => r.latestPrice !== null && r.latestPrice === minPrice);

  function getRowBg(row: CompareRow): string | undefined {
    if (compareRows.length < 2 || row.latestPrice === null) return undefined;
    if (row.latestPrice === minPrice) return "#f0fdf4";
    if (row.latestPrice === maxPrice) return "#fef2f2";
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 px-4 py-3 border-b border-edge bg-surface flex items-center gap-3 flex-wrap">
        <ItemDropdown value={selectedItem} options={itemOptions} onChange={(v) => { setSelectedItem(v); setCurrencyFilter("all"); }} />
        {allCurrencies.length > 1 && (
          <>
            <div className="w-px h-5 bg-edge shrink-0" />
            <SelectFilter label="Currency" value={currencyFilter}
              options={[{ value: "all", label: "All" }, ...allCurrencies.map((c) => ({ value: c, label: c }))]}
              onChange={setCurrencyFilter} />
          </>
        )}
      </div>

      {!selectedItem ? <EmptyState message="Select an item code to compare supplier prices" />
        : compareRows.length === 0 ? <EmptyState message="No price data found for this item / currency" />
        : (
          <div className="flex-1 min-h-0 overflow-auto">
            <div className="px-4 py-2 border-b border-edge bg-panel flex items-center gap-2">
              {compareRows.length === 1
                ? <span className="flex items-center gap-1.5 text-[12px] text-muted px-2.5 py-1 rounded bg-blue-50 border border-blue-200"><AlertCircle size={13} className="text-blue-400" />Hanya 1 supplier tersedia untuk item ini</span>
                : <span className="text-[12px] text-primary">
                    <span className="font-semibold">{compareRows.length} supplier(s) found</span>
                    {cheapest && <> — cheapest: <span className="text-emerald-600 font-semibold">{cheapest.supplierName}</span> at <span className="font-mono">{fmtPrice(cheapest.latestPrice)} {cheapest.currency}</span></>}
                  </span>}
            </div>
            <table className="w-full border-collapse" style={{ tableLayout: "fixed", minWidth: 700 }}>
              <colgroup>
                <col style={{ width: "26%" }} /><col style={{ width: "9%" }} /><col style={{ width: "13%" }} />
                <col style={{ width: "11%" }} /><col style={{ width: "11%" }} /><col style={{ width: "10%" }} /><col style={{ width: "12%" }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-edge">
                  {([["supplierName","Supplier"],["currency","Currency"],["latestPrice","Latest Price"],
                    ["activeFrom","Active From"],["purchaseLeadTime","Lead Time"],["minimumQuantity","Min Qty"],["mainSupplier","Status"],
                  ] as [CompareCol, string][]).map(([col, label]) => (
                    <ThCell key={col} label={label} colKey={col} sortCol={sortCol} sortDir={sortDir} onSort={(k) => toggleSort(k as CompareCol)} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, i) => (
                  <tr key={i} className="border-b border-edge/50 transition-colors" style={{ backgroundColor: getRowBg(row) }}>
                    <td className="px-3 py-2 text-[12px] truncate" title={row.supplierName}>{row.supplierName}</td>
                    <td className="px-3 py-2"><span className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium rounded bg-slate-100 border border-slate-200 text-primary">{row.currency}</span></td>
                    <td className="px-3 py-2 text-[12px] font-mono font-semibold">{fmtPrice(row.latestPrice)}</td>
                    <td className="px-3 py-2 text-[12px] font-mono">{fmtDate(row.activeFrom)}</td>
                    <td className="px-3 py-2 text-[12px] font-mono">{row.purchaseLeadTime !== null ? `${row.purchaseLeadTime}d` : "—"}</td>
                    <td className="px-3 py-2 text-[12px] font-mono">{row.minimumQuantity ?? "—"}</td>
                    <td className="px-3 py-2">
                      {row.isMain && <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium rounded bg-accent/10 text-accent border border-accent/30">Main Supplier</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}
