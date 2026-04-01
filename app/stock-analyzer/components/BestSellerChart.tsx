"use client";

import { useState } from "react";
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
import { cn } from "@/lib/utils";
import { getCategoryColor, formatCurrency, formatQty } from "@/lib/bestSeller";
import type { BestSellerItem } from "@/lib/stock-types";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface BestSellerChartProps {
  items: BestSellerItem[];
  allCategories: string[];
  title: string;
}

export default function BestSellerChart({
  items,
  allCategories,
  title,
}: BestSellerChartProps) {
  const [metric, setMetric] = useState<"qty" | "revenue" | "grossProfit">("qty");

  const labels = items.map((item) =>
    item.productName.length > 30 ? item.productName.slice(0, 30) + "…" : item.productName
  );

  const data = {
    labels,
    datasets: [
      {
        label: metric === "qty" ? "Total Qty" : metric === "revenue" ? "Total Revenue (€)" : "Gross Profit (€)",
        data: items.map((item) =>
          metric === "qty" ? item.totalQty : metric === "revenue" ? item.totalRevenue : item.grossProfit
        ),
        backgroundColor: items.map((item) =>
          metric === "grossProfit"
            ? "rgba(34,197,94,0.75)"
            : getCategoryColor(item.category, allCategories)
        ),
        borderRadius: 3,
        barPercentage: 0.7,
      },
    ],
  };

  const options = {
    indexAxis: "y" as const,
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        callbacks: {
          title: (ctx: { dataIndex: number }[]) => {
            const idx = ctx[0]?.dataIndex ?? 0;
            return items[idx]?.productName ?? "";
          },
          label: (ctx: { parsed: { x: number } }) => {
            if (metric === "qty") return `Qty: ${formatQty(ctx.parsed.x)}`;
            if (metric === "revenue") return `Revenue: ${formatCurrency(ctx.parsed.x)}`;
            return `Gross Profit: ${formatCurrency(ctx.parsed.x)}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: "#f1f5f9" },
        ticks: {
          font: { size: 11, family: "monospace" },
          callback: (value: number | string) =>
            metric === "qty"
              ? formatQty(Number(value))
              : `€${formatQty(Number(value))}`,

        },
      },
      y: {
        grid: { display: false },
        ticks: {
          font: { size: 11 },
          autoSkip: false,
        },
      },
    },
  };

  const chartHeight = Math.max(300, items.length * 32);

  return (
    <div className="mx-4 my-3 bg-white border border-edge rounded-lg shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-edge">
        <h3 className="text-xs font-semibold text-primary">{title}</h3>
        <div className="flex items-center gap-0 border border-edge rounded-md overflow-hidden">
          <button
            onClick={() => setMetric("qty")}
            className={cn(
              "px-2.5 py-1 text-[11px] font-mono transition-colors cursor-pointer",
              metric === "qty" ? "bg-accent text-white" : "bg-white text-muted hover:bg-surface-hover"
            )}
          >
            Qty
          </button>
          <button
            onClick={() => setMetric("revenue")}
            className={cn(
              "px-2.5 py-1 text-[11px] font-mono transition-colors cursor-pointer",
              metric === "revenue" ? "bg-accent text-white" : "bg-white text-muted hover:bg-surface-hover"
            )}
          >
            Revenue
          </button>
          <button
            onClick={() => setMetric("grossProfit")}
            className={cn(
              "px-2.5 py-1 text-[11px] font-mono transition-colors cursor-pointer",
              metric === "grossProfit" ? "bg-emerald-500 text-white" : "bg-white text-muted hover:bg-surface-hover"
            )}
          >
            Profit
          </button>
        </div>
      </div>

      {/* Chart */}
      <div className="px-4 py-3" style={{ height: chartHeight }}>
        {/* @ts-ignore chart.js type mismatch */}
        <Bar data={data} options={options} />
      </div>
    </div>
  );
}
