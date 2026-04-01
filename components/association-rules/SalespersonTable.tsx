"use client";

import { useState, useMemo } from "react";
import type { SalespersonMetric, SegmentSummary } from "@/lib/association-rules/types";
import { Users, Award } from "lucide-react";
import { showCopiedToast } from "@/components/ui/data-tooltip";

const SEGMENT_LABELS: Record<string, { label: string; color: string }> = {
  champion: { label: "Champion", color: "bg-emerald-100 text-emerald-700" },
  loyal: { label: "Loyal", color: "bg-blue-100 text-blue-700" },
  potential: { label: "Potential", color: "bg-amber-100 text-amber-700" },
  at_risk: { label: "At Risk", color: "bg-orange-100 text-orange-700" },
  lost: { label: "Lost", color: "bg-red-100 text-red-700" },
};

interface Props {
  metrics: SalespersonMetric[];
  segments: SegmentSummary[];
}

export function SalespersonTable({ metrics, segments }: Props) {
  const [tab, setTab] = useState<"salesperson" | "segments">("salesperson");
  const [sortKey, setSortKey] = useState<"totalRevenue" | "totalOrders" | "avgBasketValue" | "crossSellRate">("totalRevenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(
    () =>
      [...metrics].sort((a, b) =>
        sortDir === "desc" ? b[sortKey] - a[sortKey] : a[sortKey] - b[sortKey]
      ),
    [metrics, sortKey, sortDir]
  );

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Sub tabs */}
      <div className="shrink-0 flex items-center gap-0 border-b border-edge bg-surface/50">
        <button
          onClick={() => setTab("salesperson")}
          className={`px-4 py-2 text-[11px] font-semibold border-b-2 transition-colors ${
            tab === "salesperson" ? "text-accent border-accent" : "text-muted border-transparent hover:text-primary"
          }`}
        >
          Salesperson Performance
        </button>
        <button
          onClick={() => setTab("segments")}
          className={`px-4 py-2 text-[11px] font-semibold border-b-2 transition-colors ${
            tab === "segments" ? "text-accent border-accent" : "text-muted border-transparent hover:text-primary"
          }`}
        >
          Customer Segments (RFM)
        </button>
      </div>

      {tab === "salesperson" ? (
        <div
          className="flex-1 overflow-auto"
          onDoubleClick={(e) => {
            const el = (e.target as HTMLElement).closest("[data-tip]");
            if (!el) return;
            const text = (el.textContent ?? "").trim();
            if (!text) return;
            navigator.clipboard.writeText(text);
            showCopiedToast(e.clientX, e.clientY);
          }}
        >
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center h-8 border-b border-edge bg-surface px-4 text-[10px] font-semibold text-muted uppercase tracking-wider">
            <div className="w-[180px] shrink-0">Name</div>
            <button onClick={() => toggleSort("totalOrders")} className="w-[80px] shrink-0 text-center hover:text-primary cursor-pointer">Orders</button>
            <button onClick={() => toggleSort("totalRevenue")} className="w-[110px] shrink-0 text-center hover:text-primary cursor-pointer">Revenue</button>
            <div className="w-[80px] shrink-0 text-center">Items</div>
            <button onClick={() => toggleSort("avgBasketValue")} className="w-[100px] shrink-0 text-center hover:text-primary cursor-pointer">Avg Basket</button>
            <button onClick={() => toggleSort("crossSellRate")} className="w-[100px] shrink-0 text-center hover:text-primary cursor-pointer">Cross-Sell</button>
            <div className="flex-1 min-w-[200px]">Top Items</div>
          </div>

          {sorted.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted text-xs">No salesperson data</div>
          ) : (
            sorted.map((sp, i) => (
              <div
                key={sp.name}
                className="flex items-center px-4 py-2.5 border-b border-edge/50 text-xs hover:bg-surface-hover transition-colors"
              >
                <div className="w-[180px] shrink-0 flex items-center gap-2">
                  {i < 3 && <Award size={12} className={i === 0 ? "text-amber-500" : i === 1 ? "text-slate-400" : "text-amber-700"} />}
                  <span className="font-medium truncate" data-tip={sp.name}>{sp.name}</span>
                </div>
                <div className="w-[80px] shrink-0 text-center font-mono">{sp.totalOrders}</div>
                <div className="w-[110px] shrink-0 text-center font-mono font-semibold">
                  &euro;{sp.totalRevenue.toLocaleString()}
                </div>
                <div className="w-[80px] shrink-0 text-center font-mono">{sp.uniqueItems}</div>
                <div className="w-[100px] shrink-0 text-center font-mono">
                  &euro;{sp.avgBasketValue.toLocaleString()}
                </div>
                <div className="w-[100px] shrink-0 text-center">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                    sp.crossSellRate >= 50 ? "bg-emerald-100 text-emerald-700" :
                    sp.crossSellRate >= 30 ? "bg-amber-100 text-amber-700" :
                    "bg-slate-100 text-slate-600"
                  }`}>
                    {sp.crossSellRate}%
                  </span>
                </div>
                <div className="flex-1 min-w-[200px] flex flex-wrap gap-1">
                  {sp.topItemNames.slice(0, 3).map((name, j) => (
                    <span key={j} className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded truncate max-w-[150px]" data-tip={name}>{name}</span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        /* RFM Segments */
        <div className="flex-1 overflow-auto p-4">
          {segments.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted text-xs">No segment data</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {segments.map((seg) => {
                const label = SEGMENT_LABELS[seg.segment] || { label: seg.segment, color: "bg-slate-100 text-slate-600" };
                return (
                  <div key={seg.segment} className="border border-edge rounded-lg p-4 bg-white space-y-3">
                    <div className="flex items-center justify-between">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${label.color}`}>
                        {label.label}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted">
                        <Users size={12} /> {seg.customerCount}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-[10px] text-muted">Avg Recency</p>
                        <p className="text-sm font-semibold font-mono">{seg.avgRecency}d</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted">Avg Freq</p>
                        <p className="text-sm font-semibold font-mono">{seg.avgFrequency}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted">Avg Spend</p>
                        <p className="text-sm font-semibold font-mono">&euro;{seg.avgMonetary.toLocaleString()}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted mb-1">Top Items</p>
                      <div className="flex flex-wrap gap-1">
                        {seg.topItemNames.map((name, i) => (
                          <span key={i} className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded truncate max-w-[120px]">
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
