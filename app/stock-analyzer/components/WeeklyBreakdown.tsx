"use client";

import { useState } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency, formatQty } from "@/lib/bestSeller";
import type { WeeklyDataPoint } from "@/lib/stock-types";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

interface WeeklyBreakdownProps {
  data: WeeklyDataPoint[];
  defaultOpen?: boolean;
}

export default function WeeklyBreakdown({ data, defaultOpen = false }: WeeklyBreakdownProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  // Only show when >= 2 weeks of data
  if (data.length < 2) return null;

  const labels = data.map((d) => d.weekLabel);

  const chartData = {
    labels,
    datasets: [
      {
        label: "Total Qty",
        data: data.map((d) => d.totalQty),
        borderColor: "#2563eb",
        backgroundColor: "rgba(37, 99, 235, 0.1)",
        fill: true,
        tension: 0.3,
        yAxisID: "y",
        pointRadius: 3,
        pointHoverRadius: 5,
      },
      {
        label: "Total Revenue (€)",
        data: data.map((d) => d.totalRevenue),
        borderColor: "#059669",
        backgroundColor: "rgba(5, 150, 105, 0.1)",
        fill: true,
        tension: 0.3,
        yAxisID: "y1",
        pointRadius: 3,
        pointHoverRadius: 5,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: "index" as const,
      intersect: false,
    },
    plugins: {
      legend: {
        position: "top" as const,
        labels: {
          font: { size: 11 },
          usePointStyle: true,
          pointStyleWidth: 8,
        },
      },
      tooltip: {
        callbacks: {
          label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) => {
            const label = ctx.dataset.label ?? "";
            const val = ctx.parsed.y ?? 0;
            if (label.includes("Revenue")) {
              return `${label}: ${formatCurrency(val)}`;
            }
            return `${label}: ${formatQty(val)}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: "#f1f5f9" },
        ticks: { font: { size: 11 } },
      },
      y: {
        type: "linear" as const,
        position: "left" as const,
        grid: { color: "#f1f5f9" },
        ticks: {
          font: { size: 11, family: "monospace" },
          callback: (value: number | string) => formatQty(Number(value)),
        },
        title: {
          display: true,
          text: "Qty",
          font: { size: 11 },
          color: "#2563eb",
        },
      },
      y1: {
        type: "linear" as const,
        position: "right" as const,
        grid: { drawOnChartArea: false },
        ticks: {
          font: { size: 11, family: "monospace" },
          callback: (value: number | string) => `€${formatQty(Number(value))}`,
        },
        title: {
          display: true,
          text: "Revenue (€)",
          font: { size: 11 },
          color: "#059669",
        },
      },
    },
  };

  return (
    <div className="mx-4 my-3 bg-white border border-edge rounded-lg shadow-sm overflow-hidden">
      {/* Collapsible header */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-surface-hover transition-colors cursor-pointer"
      >
        {isOpen ? (
          <ChevronDown size={14} className="text-muted shrink-0" />
        ) : (
          <ChevronRight size={14} className="text-muted shrink-0" />
        )}
        <h3 className="text-xs font-semibold text-primary">Weekly Breakdown</h3>
        <span className="text-[10px] text-muted font-mono ml-auto">
          {data.length} weeks
        </span>
      </button>

      {/* Chart */}
      {isOpen && (
        <div className="border-t border-edge px-4 py-3" style={{ height: 320 }}>
          {/* @ts-ignore chart.js type mismatch */}
          <Line data={chartData} options={options} />
        </div>
      )}
    </div>
  );
}
