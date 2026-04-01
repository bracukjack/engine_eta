"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { Users, ShoppingCart, TrendingUp, Clock } from "lucide-react";
import { type PORecord, type PriceRecord, leadTimeDays, fmtDate, CHART_COLORS } from "@/lib/po-tracker";
import { MetricCard, SelectFilter, ThCell, PaginationBar } from "../components/shared";

interface SupplierRow {
  supplier: string; totalPO: number; totalItems: number;
  avgLeadTime: number | null; lastOrder: string | null;
  currency: string; priceRecords: number;
}

type SupplierCol = keyof SupplierRow;

function buildSupplierRows(poData: PORecord[], priceData: PriceRecord[]): SupplierRow[] {
  const map = new Map<string, { pos: Set<string>; items: number; leadTimes: number[]; lastOrder: string | null; currencies: Set<string> }>();
  for (const po of poData) {
    if (!map.has(po.supplier)) map.set(po.supplier, { pos: new Set(), items: 0, leadTimes: [], lastOrder: null, currencies: new Set() });
    const s = map.get(po.supplier)!;
    s.pos.add(po.orderNumber);
    s.items += po.items.length;
    const lt = leadTimeDays(po.orderDate, po.receiptDate);
    if (lt !== null && lt >= 0) s.leadTimes.push(lt);
    if (po.orderDate && (!s.lastOrder || po.orderDate > s.lastOrder)) s.lastOrder = po.orderDate;
    if (po.currency) s.currencies.add(po.currency);
  }
  const priceCountMap = new Map<string, number>();
  for (const p of priceData) priceCountMap.set(p.supplierName, (priceCountMap.get(p.supplierName) ?? 0) + 1);
  return Array.from(map.entries()).map(([supplier, s]) => ({
    supplier, totalPO: s.pos.size, totalItems: s.items,
    avgLeadTime: s.leadTimes.length > 0 ? Math.round(s.leadTimes.reduce((a, b) => a + b, 0) / s.leadTimes.length) : null,
    lastOrder: s.lastOrder, currency: Array.from(s.currencies).join(", "),
    priceRecords: priceCountMap.get(supplier) ?? 0,
  }));
}

function SupplierBarChart({ rows }: { rows: SupplierRow[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<import("chart.js").Chart | null>(null);
  const top15 = useMemo(() => [...rows].sort((a, b) => b.totalPO - a.totalPO).slice(0, 15), [rows]);

  useEffect(() => {
    if (!canvasRef.current) return;
    let cancelled = false;
    import("chart.js").then(({ Chart, CategoryScale, LinearScale, BarElement, BarController, Tooltip }) => {
      if (cancelled) return;
      Chart.register(CategoryScale, LinearScale, BarElement, BarController, Tooltip);
      chartRef.current?.destroy();
      chartRef.current = new Chart(canvasRef.current!, {
        type: "bar",
        data: {
          labels: top15.map((r) => r.supplier),
          datasets: [{ data: top15.map((r) => r.totalPO), backgroundColor: "#2563eb", borderRadius: 4 }],
        },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw} PO` } } },
          scales: {
            x: { grid: { color: "#e2e8f0" }, ticks: { font: { size: 11, family: "monospace" }, color: "#64748b" } },
            y: { grid: { display: false }, ticks: { font: { size: 11 }, color: "#0f172a" } },
          },
        },
      });
    });
    return () => { cancelled = true; chartRef.current?.destroy(); chartRef.current = null; };
  }, [top15]);

  return (
    <div className="shrink-0 border-b border-edge bg-panel px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Top 15 Suppliers by Total PO</p>
      <div style={{ height: Math.max(180, top15.length * 28) }}>
        <canvas ref={canvasRef} />
      </div>
      <div className="flex items-center gap-3 flex-wrap mt-2">
        {top15.slice(0, 6).map((r, i) => (
          <div key={r.supplier} className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="text-[11px] text-primary">{r.supplier}</span>
            <span className="text-[10px] font-mono text-muted">({r.totalPO} PO)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SupplierPerformanceTab({ poData, priceData }: { poData: PORecord[]; priceData: PriceRecord[] }) {
  const [sortCol, setSortCol] = useState<SupplierCol>("totalPO");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");

  const rows = useMemo(() => buildSupplierRows(poData, priceData), [poData, priceData]);
  const allCurrencies = useMemo(() => Array.from(new Set(poData.map((p) => p.currency).filter(Boolean))).sort(), [poData]);
  const allYears = useMemo(() => Array.from(new Set(poData.map((p) => p.orderDate?.split("-")[2]).filter(Boolean) as string[])).sort().reverse(), [poData]);

  const filtered = useMemo(() => {
    if (currencyFilter === "all" && yearFilter === "all") return rows;
    const matching = new Set(poData.filter((po) =>
      (currencyFilter === "all" || po.currency === currencyFilter) &&
      (yearFilter === "all" || po.orderDate?.split("-")[2] === yearFilter)
    ).map((po) => po.supplier));
    return rows.filter((r) => matching.has(r.supplier));
  }, [rows, poData, currencyFilter, yearFilter]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortCol]; const bv = b[sortCol];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      if (av === null) return 1; if (bv === null) return -1;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sortCol, sortDir]);

  const paged = useMemo(() => sorted.slice((page - 1) * rowsPerPage, page * rowsPerPage), [sorted, page, rowsPerPage]);

  function toggleSort(col: SupplierCol) {
    if (sortCol === col) { if (sortDir === "asc") setSortDir("desc"); else { setSortCol("totalPO"); setSortDir("desc"); } }
    else { setSortCol(col); setSortDir("asc"); }
  }

  const allLeadTimes = rows.flatMap((r) => r.avgLeadTime !== null ? [r.avgLeadTime] : []);
  const globalAvgLead = allLeadTimes.length > 0 ? Math.round(allLeadTimes.reduce((a, b) => a + b, 0) / allLeadTimes.length) : null;
  const mostActive = rows.reduce<SupplierRow | null>((best, r) => (!best || r.totalPO > best.totalPO ? r : best), null);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 px-4 py-2 border-b border-edge bg-panel flex items-center gap-2 flex-wrap">
        <MetricCard label="Total Suppliers" value={rows.length} icon={Users} />
        <MetricCard label="Avg PO / Supplier" value={rows.length > 0 ? (rows.reduce((s, r) => s + r.totalPO, 0) / rows.length).toFixed(1) : "0"} icon={ShoppingCart} />
        <MetricCard label="Most Active" value={mostActive?.supplier ?? "—"} icon={TrendingUp} />
        <MetricCard label="Avg Lead Time" value={globalAvgLead !== null ? `${globalAvgLead} days` : "—"} icon={Clock} />
      </div>

      <div className="shrink-0 px-4 py-2 border-b border-edge bg-surface flex items-center gap-3 flex-wrap">
        <SelectFilter label="Currency" value={currencyFilter}
          options={[{ value: "all", label: "All" }, ...allCurrencies.map((c) => ({ value: c, label: c }))]}
          onChange={(v) => { setCurrencyFilter(v); setPage(1); }} />
        <div className="w-px h-5 bg-edge shrink-0" />
        <SelectFilter label="Year" value={yearFilter}
          options={[{ value: "all", label: "All" }, ...allYears.map((y) => ({ value: y, label: y }))]}
          onChange={(v) => { setYearFilter(v); setPage(1); }} />
      </div>

      <SupplierBarChart rows={filtered} />

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full border-collapse" style={{ tableLayout: "fixed", minWidth: 700 }}>
          <colgroup>
            <col style={{ width: "28%" }} /><col style={{ width: "10%" }} /><col style={{ width: "11%" }} />
            <col style={{ width: "12%" }} /><col style={{ width: "12%" }} /><col style={{ width: "12%" }} /><col style={{ width: "12%" }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-edge">
              {([ ["supplier","Supplier"],["totalPO","Total PO"],["totalItems","Total Items"],
                  ["avgLeadTime","Avg Lead Time"],["lastOrder","Last Order"],["currency","Currency"],["priceRecords","Price Records"],
              ] as [SupplierCol, string][]).map(([col, label]) => (
                <ThCell key={col} label={label} colKey={col} sortCol={sortCol} sortDir={sortDir} onSort={(k) => toggleSort(k as SupplierCol)} />
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0
              ? <tr><td colSpan={7} className="text-center py-16 text-muted text-sm">No data.</td></tr>
              : paged.map((row) => (
                <tr key={row.supplier} className="border-b border-edge/50 transition-colors hover:bg-surface-hover">
                  <td className="px-3 py-2 text-[12px] truncate" title={row.supplier}>{row.supplier}</td>
                  <td className="px-3 py-2 text-[12px] font-mono">{row.totalPO}</td>
                  <td className="px-3 py-2 text-[12px] font-mono">{row.totalItems}</td>
                  <td className="px-3 py-2 text-[12px] font-mono">{row.avgLeadTime !== null ? `${row.avgLeadTime}d` : "—"}</td>
                  <td className="px-3 py-2 text-[12px] font-mono">{fmtDate(row.lastOrder)}</td>
                  <td className="px-3 py-2"><span className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium rounded bg-slate-100 border border-slate-200 text-primary">{row.currency}</span></td>
                  <td className="px-3 py-2 text-[12px] font-mono">{row.priceRecords}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <PaginationBar total={sorted.length} page={page} rowsPerPage={rowsPerPage} onPage={setPage} onRowsPerPage={setRowsPerPage} />
    </div>
  );
}
