"use client";

import { useState, useMemo, useEffect } from "react";
import type { SequentialRule } from "@/lib/association-rules/types";
import { StockBadge } from "./StockBadge";
import { ArrowRight, Clock } from "lucide-react";

interface Props {
  rules: SequentialRule[];
}

export function SequentialRulesTab({ rules }: Props) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<"lift" | "confidence" | "avgDaysBetween" | "count">("lift");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Debounce
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  const filtered = useMemo(() => {
    let data = rules;
    const q = search.trim().toLowerCase();
    if (q) {
      data = data.filter(
        (r) =>
          r.antecedent.some((s) => s.toLowerCase().includes(q)) ||
          r.consequent.some((s) => s.toLowerCase().includes(q)) ||
          r.antecedentNames.some((s) => s.toLowerCase().includes(q)) ||
          r.consequentNames.some((s) => s.toLowerCase().includes(q))
      );
    }
    return [...data].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [rules, search, sortKey, sortDir]);

  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-auto">
      {/* Search */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-edge bg-surface/50">
        <input
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setTimeout(() => setSearch(e.target.value), 300);
          }}
          placeholder="Search sequential rules..."
          className="bg-white border border-edge rounded px-2.5 py-1 text-xs font-mono w-72 focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
        <span className="text-[11px] text-muted font-mono ml-auto">
          {filtered.length} / {rules.length} sequential rules
        </span>
      </div>

      {/* Header */}
      <div className="shrink-0 flex items-center h-8 border-b border-edge bg-surface px-4 text-[10px] font-semibold text-muted uppercase tracking-wider">
        <div className="w-[200px] shrink-0">Order N: Bought</div>
        <div className="w-7 shrink-0" />
        <div className="w-[200px] shrink-0">Order N+1: Then Bought</div>
        <button onClick={() => toggleSort("confidence")} className="w-[90px] shrink-0 text-center hover:text-primary cursor-pointer">Confidence</button>
        <button onClick={() => toggleSort("lift")} className="w-[70px] shrink-0 text-center hover:text-primary cursor-pointer">Lift</button>
        <button onClick={() => toggleSort("avgDaysBetween")} className="w-[90px] shrink-0 text-center hover:text-primary cursor-pointer">Avg Days</button>
        <div className="w-[120px] shrink-0">Stock</div>
        <button onClick={() => toggleSort("count")} className="w-[60px] shrink-0 text-center hover:text-primary cursor-pointer">Count</button>
      </div>

      {/* Rows */}
      {filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted text-xs">
          {rules.length === 0 ? "No sequential rules found" : "No matching rules"}
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          {filtered.slice(0, 200).map((r, i) => (
            <div
              key={i}
              className="flex items-center px-4 py-2 border-b border-edge/50 text-xs hover:bg-surface-hover transition-colors"
            >
              <div className="w-[200px] shrink-0 truncate">
                <span className="font-mono text-[11px]">{r.antecedent.join(", ")}</span>
                <br />
                <span className="text-[10px] text-muted">{r.antecedentNames.join(", ")}</span>
              </div>
              <div className="w-7 shrink-0 flex items-center justify-center">
                <ArrowRight size={12} className="text-muted" />
              </div>
              <div className="w-[200px] shrink-0 truncate">
                <span className="font-mono text-[11px]">{r.consequent.join(", ")}</span>
                <br />
                <span className="text-[10px] text-muted">{r.consequentNames.join(", ")}</span>
              </div>
              <div className="w-[90px] shrink-0 text-center font-mono">{(r.confidence * 100).toFixed(1)}%</div>
              <div className="w-[70px] shrink-0 text-center font-mono font-semibold text-emerald-600">{r.lift.toFixed(2)}</div>
              <div className="w-[90px] shrink-0 text-center font-mono flex items-center justify-center gap-1">
                <Clock size={10} className="text-muted" />
                {r.avgDaysBetween}d
              </div>
              <div className="w-[120px] shrink-0">
                <StockBadge stock={r.consequentStock} />
              </div>
              <div className="w-[60px] shrink-0 text-center font-mono">{r.count}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
