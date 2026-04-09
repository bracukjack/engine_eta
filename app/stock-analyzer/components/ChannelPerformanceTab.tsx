"use client";

import { useState, useMemo } from "react";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { ChevronUp, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatQty, getChannelColor } from "@/lib/bestSeller";
import type { ChannelStat } from "@/lib/stock-types";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type SortMetric = "totalRevenue" | "totalQty" | "grossProfit" | "orderCount";
type SortKey = keyof ChannelStat;
type SortDir = "asc" | "desc";

const SORT_METRICS: { key: SortMetric; label: string }[] = [
  { key: "totalRevenue", label: "Revenue" },
  { key: "totalQty",     label: "Qty" },
  { key: "grossProfit",  label: "Gross Profit" },
  { key: "orderCount",   label: "Orders" },
];

interface ChannelPerformanceTabProps {
  data: ChannelStat[];
}

export default function ChannelPerformanceTab({ data }: ChannelPerformanceTabProps) {
  const [sortMetric, setSortMetric] = useState<SortMetric>("totalRevenue");
  const [tableSortKey, setTableSortKey] = useState<SortKey>("totalRevenue");
  const [tableSortDir, setTableSortDir] = useState<SortDir>("desc");
  const [hiddenChannels, setHiddenChannels] = useState<Set<string>>(new Set());

  const allChannels = useMemo(() => data.map((c) => c.channel), [data]);

  const filteredData = useMemo(
    () => data.filter((c) => !hiddenChannels.has(c.channel)),
    [data, hiddenChannels]
  );

  const toggleChannel = (channel: string) => {
    setHiddenChannels((prev) => {
      const next = new Set(prev);
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      return next;
    });
  };

  const toggleTableSort = (key: SortKey) => {
    if (tableSortKey === key) {
      setTableSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setTableSortKey(key);
      setTableSortDir("desc");
    }
  };

  // Chart data sorted by selected metric descending
  const chartData = useMemo(() => {
    return [...filteredData].sort((a, b) => b[sortMetric] - a[sortMetric]);
  }, [filteredData, sortMetric]);

  // Table data sorted by table sort
  const tableData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      const av = a[tableSortKey];
      const bv = b[tableSortKey];
      const dir = tableSortDir === "asc" ? 1 : -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filteredData, tableSortKey, tableSortDir]);

  // KPI totals
  const kpi = useMemo(() => {
    const totalRevenue = filteredData.reduce((s, c) => s + c.totalRevenue, 0);
    const totalQty = filteredData.reduce((s, c) => s + c.totalQty, 0);
    const best = filteredData.length > 0 ? [...filteredData].sort((a, b) => b.totalRevenue - a.totalRevenue)[0]! : null;
    return { totalRevenue, totalQty, best, channelCount: filteredData.length };
  }, [filteredData]);

  if (data.length === 0) {
    return (
      <div className="mx-4 my-3 bg-white border border-edge rounded-lg shadow-sm p-10 text-center">
        <p className="text-sm text-muted">No channel data available</p>
        <p className="text-[11px] text-muted/50 font-mono mt-1">Upload Sales Orders to see channel performance</p>
      </div>
    );
  }

  const chartLabels = chartData.map((c) => c.channel);
  const chartValues = chartData.map((c) => c[sortMetric] as number);
  const chartColors = chartData.map((c) => getChannelColor(c.channel));

  const chartDataset = {
    labels: chartLabels,
    datasets: [
      {
        label: SORT_METRICS.find((m) => m.key === sortMetric)?.label ?? "",
        data: chartValues,
        backgroundColor: chartColors.map((c) => c + "cc"),
        borderColor: chartColors,
        borderWidth: 1,
        borderRadius: 3,
        barPercentage: 0.65,
      },
    ],
  };

  const isCurrency = sortMetric === "totalRevenue" || sortMetric === "grossProfit";

  const chartOptions = {
    indexAxis: "y" as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: { parsed: { x: number } }) =>
            isCurrency ? `  ${formatCurrency(ctx.parsed.x)}` : `  ${formatQty(ctx.parsed.x)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: "#f1f5f9" },
        ticks: {
          font: { size: 11, family: "monospace" },
          callback: (value: number | string) =>
            isCurrency ? `€${formatQty(Number(value))}` : formatQty(Number(value)),
        },
      },
      y: {
        grid: { display: false },
        ticks: { font: { size: 12 }, autoSkip: false },
      },
    },
  };

  const chartHeight = Math.max(200, data.length * 44);

  const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
    { key: "channel",        label: "Channel" },
    { key: "skuCount",       label: "SKUs",             numeric: true },
    { key: "orderCount",     label: "Orders",           numeric: true },
    { key: "totalQty",       label: "Qty Sold",         numeric: true },
    { key: "avgOrderValue",  label: "Avg Order Value",  numeric: true },
    { key: "totalRevenue",   label: "Revenue",          numeric: true },
    { key: "revenueShare",   label: "Revenue Share",    numeric: true },
    { key: "grossProfit",    label: "Gross Profit",     numeric: true },
  ];

  return (
    <div className="space-y-3 px-4 py-3">
      {/* Channel visibility toggle */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] text-muted shrink-0">Channels:</span>
        <button
          onClick={() => setHiddenChannels(new Set())}
          className={cn(
            "px-2 py-0.5 text-[11px] rounded-full border transition-colors cursor-pointer",
            hiddenChannels.size === 0
              ? "border-accent bg-accent text-white"
              : "border-edge bg-white text-muted hover:bg-surface-hover"
          )}
        >
          All
        </button>
        {allChannels.map((channel) => {
          const color = getChannelColor(channel);
          const isHidden = hiddenChannels.has(channel);
          return (
            <button
              key={channel}
              onClick={() => toggleChannel(channel)}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-full border transition-all cursor-pointer select-none",
                isHidden
                  ? "border-edge bg-surface text-muted/40 line-through"
                  : "border-edge bg-white text-primary hover:bg-surface-hover"
              )}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0 transition-colors"
                style={{ backgroundColor: isHidden ? "#cbd5e1" : color }}
              />
              {channel}
            </button>
          );
        })}
        {hiddenChannels.size > 0 && (
          <span className="text-[11px] text-muted/50 font-mono">
            ({hiddenChannels.size} hidden)
          </span>
        )}
      </div>

      {/* Sort control bar */}
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted">Show:</span>
        <div className="flex items-center gap-0 border border-edge rounded-md overflow-hidden">
          {SORT_METRICS.map((m) => (
            <button
              key={m.key}
              onClick={() => setSortMetric(m.key)}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer",
                sortMetric === m.key
                  ? "bg-accent text-white"
                  : "bg-white text-muted hover:bg-surface-hover"
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI cards */}
      <div className="flex items-stretch gap-2 flex-wrap">
        <KPICard label="Total Channels" value={String(kpi.channelCount)} />
        {kpi.best && (
          <KPICard
            label="Best Channel"
            value={kpi.best.channel}
            sub={formatCurrency(kpi.best.totalRevenue)}
            accent
          />
        )}
        <KPICard label="Total Revenue" value={formatCurrency(kpi.totalRevenue)} accent />
        <KPICard label="Total Qty Sold" value={formatQty(kpi.totalQty)} accent />
      </div>

      {/* Bar chart */}
      <div className="bg-white border border-edge rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-edge">
          <h3 className="text-xs font-semibold text-primary">
            Channel Performance — {SORT_METRICS.find((m) => m.key === sortMetric)?.label}
          </h3>
        </div>
        <div className="px-4 py-3" style={{ height: chartHeight }}>
          {/* @ts-ignore chart.js type mismatch */}
          <Bar data={chartDataset} options={chartOptions} />
        </div>
      </div>

      {/* Stats table */}
      <div className="bg-white border border-edge rounded-lg shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-edge">
          <h3 className="text-xs font-semibold text-primary">Channel Breakdown</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ tableLayout: "auto", minWidth: 780 }}>
            <thead className="sticky top-0 z-10 bg-surface">
              <tr className="border-b border-edge">
                <th className="text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted w-6">#</th>
                {COLUMNS.map((col) => {
                  const isSorted = tableSortKey === col.key;
                  return (
                    <th
                      key={col.key}
                      onClick={() => toggleTableSort(col.key)}
                      className={cn(
                        "text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap group",
                        isSorted ? "text-accent" : "text-muted hover:text-primary"
                      )}
                    >
                      <div className="flex items-center gap-1">
                        {col.label}
                        {isSorted ? (
                          tableSortDir === "desc"
                            ? <ChevronDown size={10} className="text-accent shrink-0" />
                            : <ChevronUp size={10} className="text-accent shrink-0" />
                        ) : (
                          <ChevronDown size={10} className="opacity-0 group-hover:opacity-30 shrink-0" />
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {tableData.map((stat, idx) => {
                const isTop = idx === 0 && tableSortKey === "totalRevenue" && tableSortDir === "desc";
                const color = getChannelColor(stat.channel);
                return (
                  <tr
                    key={stat.channel}
                    className={cn(
                      "border-b border-edge/50 transition-colors hover:bg-surface-hover",
                      isTop && "bg-accent/5"
                    )}
                  >
                    <td className="px-3 py-2 text-[11px] font-mono text-muted/60">{idx + 1}</td>
                    {/* Channel name with color dot */}
                    <td className="px-3 py-2 text-[12px] font-medium">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        {stat.channel}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[12px] font-mono">{formatQty(stat.skuCount)}</td>
                    <td className="px-3 py-2 text-[12px] font-mono">{formatQty(stat.orderCount)}</td>
                    <td className="px-3 py-2 text-[12px] font-mono">{formatQty(stat.totalQty)}</td>
                    <td className="px-3 py-2 text-[12px] font-mono">{formatCurrency(stat.avgOrderValue)}</td>
                    <td className="px-3 py-2 text-[12px] font-mono font-semibold">{formatCurrency(stat.totalRevenue)}</td>
                    {/* Revenue share with progress bar */}
                    <td className="px-3 py-2 min-w-[120px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-slate-100 rounded-full h-1.5 min-w-[60px]">
                          <div
                            className="h-1.5 rounded-full"
                            style={{ width: `${Math.min(100, stat.revenueShare).toFixed(1)}%`, backgroundColor: color }}
                          />
                        </div>
                        <span className="text-[11px] font-mono text-muted shrink-0 w-10 text-right">
                          {stat.revenueShare.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[12px] font-mono">{formatCurrency(stat.grossProfit)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* bottom spacer */}
      <div className="h-2" />
    </div>
  );
}

function KPICard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="flex-1 min-w-[150px] flex flex-col gap-0.5 px-3 py-2.5 rounded-lg bg-white border border-edge shadow-sm">
      <p className="text-[11px] text-muted leading-tight">{label}</p>
      <p className={cn("text-sm font-mono font-semibold leading-tight", accent ? "text-accent" : "text-primary")}>
        {value}
      </p>
      {sub && <p className="text-[11px] font-mono text-muted leading-tight">{sub}</p>}
    </div>
  );
}
