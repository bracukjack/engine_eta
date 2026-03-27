"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { FixedSizeList as List } from "react-window";
import { cn } from "@/lib/utils";
import type { Rule, DiscountZone } from "@/lib/association-rules/types";
import {
  DiscountDecisionBadge,
  ZoneDot,
} from "./DiscountDecisionBadge";
import { ArrowUp, ArrowDown, ArrowRight } from "lucide-react";

const ROW_HEIGHT = 44;

type SortKey = "lift" | "confidence" | "support" | "count";

interface Props {
  rules: Rule[];
  search: string;
  zoneFilter: DiscountZone | "all";
  onSearchChange: (s: string) => void;
  onZoneFilterChange: (z: DiscountZone | "all") => void;
}

export function RulesTable({
  rules,
  search,
  zoneFilter,
  onSearchChange,
  onZoneFilterChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(400);
  const [sortKey, setSortKey] = useState<SortKey>("lift");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0].contentRect.height - 80;
      setListHeight(Math.max(h, 100));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const handler = () => {
      if (headerRef.current) headerRef.current.scrollLeft = el.scrollLeft;
    };
    el.addEventListener("scroll", handler);
    return () => el.removeEventListener("scroll", handler);
  }, []);

  const filtered = useMemo(() => {
    let data = rules;
    if (zoneFilter !== "all") {
      data = data.filter((r) => r.zone === zoneFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(
        (r) =>
          r.antecedent.some((s) => s.toLowerCase().includes(q)) ||
          r.consequent.some((s) => s.toLowerCase().includes(q)) ||
          r.antecedentNames.some((s) => s.toLowerCase().includes(q)) ||
          r.consequentNames.some((s) => s.toLowerCase().includes(q))
      );
    }
    return data;
  }, [rules, zoneFilter, search]);

  const sorted = useMemo(() => {
    const s = [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return s;
  }, [filtered, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const COLS = [
    { key: "antecedent" as const, label: "If buy (A)", width: 240 },
    { key: "arrow" as const, label: "", width: 30 },
    { key: "consequent" as const, label: "Then buy (B)", width: 240 },
    { key: "support" as const, label: "Support", width: 90, sortable: true },
    { key: "confidence" as const, label: "Confidence", width: 100, sortable: true },
    { key: "lift" as const, label: "Lift", width: 80, sortable: true },
    { key: "count" as const, label: "Count", width: 70, sortable: true },
    { key: "zone" as const, label: "Zone", width: 180 },
    { key: "discount" as const, label: "Disc %", width: 70 },
  ];
  const TOTAL_WIDTH = COLS.reduce((s, c) => s + c.width, 0);

  const Row = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const r = sorted[index];
      return (
        <div
          style={style}
          className="flex items-center border-b border-edge/50 text-xs hover:bg-surface-hover transition-colors"
        >
          <div className="flex items-center" style={{ minWidth: TOTAL_WIDTH }}>
            {/* Antecedent */}
            <div className="px-2 truncate shrink-0" style={{ width: 240 }}>
              <span className="font-mono text-[11px]">
                {r.antecedent.join(", ")}
              </span>
              <br />
              <span className="text-[10px] text-muted truncate">
                {r.antecedentNames.join(", ")}
              </span>
            </div>
            {/* Arrow */}
            <div
              className="flex items-center justify-center shrink-0"
              style={{ width: 30 }}
            >
              <ArrowRight size={12} className="text-muted" />
            </div>
            {/* Consequent */}
            <div className="px-2 truncate shrink-0" style={{ width: 240 }}>
              <span className="font-mono text-[11px]">
                {r.consequent.join(", ")}
              </span>
              <br />
              <span className="text-[10px] text-muted truncate">
                {r.consequentNames.join(", ")}
              </span>
            </div>
            {/* Support */}
            <div
              className="px-2 font-mono text-xs text-center shrink-0"
              style={{ width: 90 }}
            >
              {(r.support * 100).toFixed(1)}%
            </div>
            {/* Confidence */}
            <div
              className="px-2 font-mono text-xs text-center shrink-0"
              style={{ width: 100 }}
            >
              {(r.confidence * 100).toFixed(1)}%
            </div>
            {/* Lift */}
            <div
              className={cn(
                "px-2 font-mono text-xs text-center font-semibold shrink-0",
                r.lift >= 1.5
                  ? "text-emerald-600"
                  : r.lift >= 1.2
                    ? "text-amber-600"
                    : "text-primary"
              )}
              style={{ width: 80 }}
            >
              {r.lift.toFixed(2)}
            </div>
            {/* Count */}
            <div
              className="px-2 font-mono text-xs text-center shrink-0"
              style={{ width: 70 }}
            >
              {r.count}
            </div>
            {/* Zone */}
            <div className="px-2 shrink-0" style={{ width: 180 }}>
              <DiscountDecisionBadge zone={r.zone} />
            </div>
            {/* Discount */}
            <div
              className="px-2 font-mono text-xs text-center shrink-0"
              style={{ width: 70 }}
            >
              {r.recommendedDiscountPct > 0
                ? `${r.recommendedDiscountPct}%`
                : "—"}
            </div>
          </div>
        </div>
      );
    },
    [sorted, TOTAL_WIDTH]
  );

  return (
    <div ref={containerRef} className="flex-1 flex flex-col min-h-0">
      {/* Filter bar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-edge bg-surface/50">
        <input
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search SKU or product..."
          className="bg-white border border-edge rounded px-2.5 py-1 text-xs font-mono w-56 focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted">Zone:</span>
          {(["all", "green", "yellow", "purple", "gray"] as const).map((z) => (
            <button
              key={z}
              onClick={() => onZoneFilterChange(z)}
              className={cn(
                "flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium border transition-colors",
                zoneFilter === z
                  ? "bg-accent/10 text-accent border-accent/30"
                  : "bg-white text-muted border-edge hover:border-muted"
              )}
            >
              {z !== "all" && <ZoneDot zone={z} />}
              {z === "all" ? "All" : z.charAt(0).toUpperCase() + z.slice(1)}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-muted font-mono ml-auto">
          {sorted.length} / {rules.length} rules
        </span>
      </div>

      {/* Header */}
      <div
        ref={headerRef}
        className="overflow-hidden border-b border-edge bg-surface shrink-0"
      >
        <div
          className="flex items-center h-9"
          style={{ minWidth: TOTAL_WIDTH }}
        >
          {COLS.map((col) => {
            const isSortable =
              "sortable" in col && (col as { sortable?: boolean }).sortable === true;
            const isSorted = isSortable && sortKey === col.key;
            return (
              <button
                key={col.key}
                onClick={() =>
                  isSortable && toggleSort(col.key as SortKey)
                }
                disabled={!isSortable}
                className={cn(
                  "flex items-center gap-1 px-2 text-[11px] font-semibold text-muted uppercase tracking-wider shrink-0",
                  isSortable
                    ? "hover:text-primary cursor-pointer"
                    : "cursor-default"
                )}
                style={{ width: col.width }}
              >
                <span className="truncate">{col.label}</span>
                {isSorted &&
                  (sortDir === "desc" ? (
                    <ArrowDown size={10} className="text-accent shrink-0" />
                  ) : (
                    <ArrowUp size={10} className="text-accent shrink-0" />
                  ))}
              </button>
            );
          })}
        </div>
      </div>

      {/* Rows */}
      {sorted.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted text-sm">
          <p className="text-xs">
            {rules.length === 0 ? "No rules generated yet" : "No matching rules"}
          </p>
        </div>
      ) : (
        <List
          outerRef={outerRef}
          height={listHeight}
          width="100%"
          itemSize={ROW_HEIGHT}
          itemCount={sorted.length}
          overscanCount={10}
        >
          {Row}
        </List>
      )}

      {/* Footer */}
      <div className="shrink-0 h-7 flex items-center px-3 border-t border-edge bg-surface">
        <span className="text-[11px] text-muted font-mono">
          {sorted.length} rules
        </span>
      </div>
    </div>
  );
}
