"use client";

import type { SeasonalPeriod } from "@/lib/association-rules/types";
import { Calendar, TrendingUp, ShoppingCart } from "lucide-react";

interface Props {
  data: SeasonalPeriod[];
}

export function SeasonalInsights({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted text-xs">
        No seasonal data available
      </div>
    );
  }

  const maxRevenue = Math.max(...data.map((d) => d.revenue));
  const maxOrders = Math.max(...data.map((d) => d.orderCount));

  return (
    <div className="flex-1 overflow-auto p-4 space-y-4">
      {/* Revenue chart (bar) */}
      <div className="border border-edge rounded-lg p-4 bg-white">
        <h3 className="text-xs font-semibold text-primary mb-3 flex items-center gap-1.5">
          <TrendingUp size={14} /> Monthly Revenue
        </h3>
        <div className="flex items-end gap-1 h-40">
          {data.map((d) => (
            <div key={d.period} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col items-center">
                <span className="text-[9px] font-mono text-muted mb-0.5">
                  &euro;{(d.revenue / 1000).toFixed(0)}k
                </span>
                <div
                  className="w-full bg-accent/70 rounded-t min-h-[2px] transition-all"
                  style={{ height: `${maxRevenue > 0 ? (d.revenue / maxRevenue) * 120 : 0}px` }}
                />
              </div>
              <span className="text-[8px] text-muted font-mono -rotate-45 origin-center whitespace-nowrap">
                {d.period}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Orders chart (bar) */}
      <div className="border border-edge rounded-lg p-4 bg-white">
        <h3 className="text-xs font-semibold text-primary mb-3 flex items-center gap-1.5">
          <ShoppingCart size={14} /> Monthly Orders
        </h3>
        <div className="flex items-end gap-1 h-40">
          {data.map((d) => (
            <div key={d.period} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col items-center">
                <span className="text-[9px] font-mono text-muted mb-0.5">
                  {d.orderCount}
                </span>
                <div
                  className="w-full bg-blue-400/70 rounded-t min-h-[2px] transition-all"
                  style={{ height: `${maxOrders > 0 ? (d.orderCount / maxOrders) * 120 : 0}px` }}
                />
              </div>
              <span className="text-[8px] text-muted font-mono -rotate-45 origin-center whitespace-nowrap">
                {d.period}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Period details table */}
      <div className="border border-edge rounded-lg bg-white overflow-hidden">
        <div className="flex items-center h-8 border-b border-edge bg-surface px-4 text-[10px] font-semibold text-muted uppercase tracking-wider">
          <div className="w-[100px] shrink-0 flex items-center gap-1"><Calendar size={10} /> Period</div>
          <div className="w-[80px] shrink-0 text-center">Orders</div>
          <div className="w-[110px] shrink-0 text-center">Revenue</div>
          <div className="w-[90px] shrink-0 text-center">Avg Basket</div>
          <div className="flex-1">Top Items</div>
        </div>
        {data.map((d) => (
          <div key={d.period} className="flex items-center px-4 py-2 border-b border-edge/50 text-xs hover:bg-surface-hover transition-colors">
            <div className="w-[100px] shrink-0 font-mono font-semibold">{d.period}</div>
            <div className="w-[80px] shrink-0 text-center font-mono">{d.orderCount}</div>
            <div className="w-[110px] shrink-0 text-center font-mono">&euro;{d.revenue.toLocaleString()}</div>
            <div className="w-[90px] shrink-0 text-center font-mono">{d.avgBasketSize}</div>
            <div className="flex-1 flex flex-wrap gap-1">
              {d.topItemNames.slice(0, 3).map((name, i) => (
                <span key={i} className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded truncate max-w-[130px]">{name}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
