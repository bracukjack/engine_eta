"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { type PriceRecord, fmtDate, fmtPrice, CHART_COLORS } from "@/lib/po-tracker";
import { ItemDropdown, SelectFilter, EmptyState, ThCell } from "../components/shared";

type PriceHistCol = "supplierName" | "currency" | "purchasePrice" | "activeFrom" | "activeTo" | "purchaseLeadTime" | "minimumQuantity";

function PriceHistoryChart({ records, item }: { records: PriceRecord[]; item: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<import("chart.js").Chart | null>(null);

  const bySupplier = useMemo(() => {
    const map = new Map<string, { date: string; price: number }[]>();
    for (const r of records) {
      if (!r.activeFrom || r.purchasePrice === null) continue;
      if (!map.has(r.supplierName)) map.set(r.supplierName, []);
      map.get(r.supplierName)!.push({ date: r.activeFrom, price: r.purchasePrice });
    }
    map.forEach((pts) => pts.sort((a, b) => a.date.localeCompare(b.date)));
    return map;
  }, [records]);

  const suppliers = useMemo(() => Array.from(bySupplier.keys()), [bySupplier]);

  useEffect(() => {
    if (!canvasRef.current || suppliers.length === 0) return;
    let cancelled = false;
    import("chart.js").then(({ Chart, CategoryScale, LinearScale, PointElement, LineElement, LineController, Tooltip }) => {
      if (cancelled) return;
      Chart.register(CategoryScale, LinearScale, PointElement, LineElement, LineController, Tooltip);
      chartRef.current?.destroy();
      const allDates = Array.from(new Set(Array.from(bySupplier.values()).flatMap((pts) => pts.map((p) => p.date)))).sort();
      chartRef.current = new Chart(canvasRef.current!, {
        type: "line",
        data: {
          labels: allDates.map(fmtDate),
          datasets: suppliers.map((sup, i) => {
            const ptMap = new Map(bySupplier.get(sup)!.map((p) => [p.date, p.price]));
            return {
              label: sup,
              data: allDates.map((d) => ptMap.get(d) ?? null),
              borderColor: CHART_COLORS[i % CHART_COLORS.length],
              backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + "22",
              tension: 0.3, spanGaps: true, pointRadius: 4,
            };
          }),
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmtPrice(ctx.raw as number)}` } } },
          scales: {
            x: { grid: { color: "#e2e8f0" }, ticks: { font: { size: 10, family: "monospace" }, color: "#64748b" } },
            y: { grid: { color: "#e2e8f0" }, ticks: { font: { size: 10, family: "monospace" }, color: "#64748b" } },
          },
        },
      });
    });
    return () => { cancelled = true; chartRef.current?.destroy(); chartRef.current = null; };
  }, [bySupplier, suppliers]);

  const latestBySupplier = new Map<string, PriceRecord>();
  for (const r of records) {
    const ex = latestBySupplier.get(r.supplierName);
    if (!ex || (r.activeFrom ?? "") > (ex.activeFrom ?? "")) latestBySupplier.set(r.supplierName, r);
  }

  if (suppliers.length === 0) return null;
  return (
    <div className="shrink-0 border-b border-edge bg-panel px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Price History — {item}</p>
      <div style={{ height: 240 }}><canvas ref={canvasRef} /></div>
      <div className="flex items-center gap-3 flex-wrap mt-2">
        {suppliers.map((sup, i) => {
          const latest = latestBySupplier.get(sup);
          return (
            <div key={sup} className="flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="text-[11px] text-primary">{sup}</span>
              {latest?.purchasePrice !== null && <span className="text-[10px] font-mono text-muted">({fmtPrice(latest!.purchasePrice)} {latest!.currency})</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PriceHistoryTab({ priceData }: { priceData: PriceRecord[] }) {
  const [selectedItem, setSelectedItem] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [sortCol, setSortCol] = useState<PriceHistCol>("activeFrom");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const itemOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of priceData) map.set(r.itemCode, (map.get(r.itemCode) ?? 0) + 1);
    return Array.from(map.entries()).map(([code, count]) => ({ code, count })).sort((a, b) => a.code.localeCompare(b.code));
  }, [priceData]);

  const selectedRecords = useMemo(() => selectedItem ? priceData.filter((r) => r.itemCode === selectedItem) : [], [priceData, selectedItem]);
  const displayRecords = useMemo(() => currencyFilter !== "all" ? selectedRecords.filter((r) => r.currency === currencyFilter) : selectedRecords, [selectedRecords, currencyFilter]);
  const currencies = useMemo(() => Array.from(new Set(selectedRecords.map((r) => r.currency).filter(Boolean))).sort(), [selectedRecords]);

  const sortedRecords = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...displayRecords].sort((a, b) => {
      const av = a[sortCol]; const bv = b[sortCol];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      if (av === null) return 1; if (bv === null) return -1;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [displayRecords, sortCol, sortDir]);

  function toggleSort(col: PriceHistCol) {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 px-4 py-3 border-b border-edge bg-surface flex items-center gap-3 flex-wrap">
        <ItemDropdown value={selectedItem} options={itemOptions} onChange={(v) => { setSelectedItem(v); setCurrencyFilter("all"); }} />
        {currencies.length > 1 && (
          <>
            <div className="w-px h-5 bg-edge shrink-0" />
            <SelectFilter label="Currency" value={currencyFilter}
              options={[{ value: "all", label: "All" }, ...currencies.map((c) => ({ value: c, label: c }))]}
              onChange={setCurrencyFilter} />
          </>
        )}
      </div>

      {!selectedItem ? <EmptyState message="Select an item code to view price history" />
        : displayRecords.length === 0 ? <EmptyState message="No price history found for this item / currency" />
        : (
          <>
            <PriceHistoryChart records={displayRecords} item={selectedItem} />
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full border-collapse" style={{ tableLayout: "fixed", minWidth: 700 }}>
                <colgroup>
                  <col style={{ width: "25%" }} /><col style={{ width: "9%" }} /><col style={{ width: "13%" }} />
                  <col style={{ width: "11%" }} /><col style={{ width: "11%" }} /><col style={{ width: "10%" }} /><col style={{ width: "10%" }} />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-surface">
                  <tr className="border-b border-edge">
                    {([["supplierName","Supplier"],["currency","Currency"],["purchasePrice","Purchase Price"],
                      ["activeFrom","Active From"],["activeTo","Active To"],["purchaseLeadTime","Lead Time"],["minimumQuantity","Min Qty"],
                    ] as [PriceHistCol, string][]).map(([col, label]) => (
                      <ThCell key={col} label={label} colKey={col} sortCol={sortCol} sortDir={sortDir} onSort={(k) => toggleSort(k as PriceHistCol)} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRecords.map((r, i) => (
                    <tr key={i} className="border-b border-edge/50 transition-colors hover:bg-surface-hover">
                      <td className="px-3 py-2 text-[12px] truncate" title={r.supplierName}>{r.supplierName}</td>
                      <td className="px-3 py-2"><span className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium rounded bg-slate-100 border border-slate-200 text-primary">{r.currency}</span></td>
                      <td className="px-3 py-2 text-[12px] font-mono">{fmtPrice(r.purchasePrice)}</td>
                      <td className="px-3 py-2 text-[12px] font-mono">{fmtDate(r.activeFrom)}</td>
                      <td className="px-3 py-2 text-[12px] font-mono">{fmtDate(r.activeTo)}</td>
                      <td className="px-3 py-2 text-[12px] font-mono">{r.purchaseLeadTime !== null ? `${r.purchaseLeadTime}d` : "—"}</td>
                      <td className="px-3 py-2 text-[12px] font-mono">{r.minimumQuantity ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
    </div>
  );
}
