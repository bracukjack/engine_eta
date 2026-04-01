"use client";

import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { FixedSizeList as List } from "react-window";
import { cn } from "@/lib/utils";
import { showCopiedToast } from "@/components/ui/data-tooltip";
import type { ItemRule } from "@/lib/association-rules/types";
import { StockBadge } from "./StockBadge";
import { ArrowUp, ArrowDown, ArrowRight, ChevronDown, ChevronRight } from "lucide-react";

const ROW_HEIGHT = 48;

type SortKey = "lift" | "confidence" | "support" | "count" | "revenueLift" | "profitLift" | "basketUplift";

interface Props {
  rules: ItemRule[];
  hideOutOfStock: boolean;
  sortByRevenue: boolean;
}

export function RulesTable({ rules, hideOutOfStock, sortByRevenue }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(400);
  const [sortKey, setSortKey] = useState<SortKey>(
    sortByRevenue ? "revenueLift" : "confidence"
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  // Debounce search input (300ms)
  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Sync sort key with parent toggle
  useEffect(() => {
    setSortKey(sortByRevenue ? "revenueLift" : "confidence");
  }, [sortByRevenue]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0].contentRect.height - 90;
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
    if (hideOutOfStock) {
      data = data.filter((r) => r.consequentStock.status !== "out_of_stock");
    }
    if (search) {
      const isMultiSku = search.includes(",");

      if (isMultiSku) {
        // Multi-SKU mode: comma-separated prefixes, OR logic, startsWith
        const prefixes = search
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        if (prefixes.length > 0) {
          data = data.filter((r) => {
            const allSkus = [...r.antecedent, ...r.consequent];
            return prefixes.some((prefix) =>
              allSkus.some((sku) => sku.toLowerCase().startsWith(prefix))
            );
          });
        }
      } else {
        // Global search: SKU, name, category — includes
        const q = search.trim().toLowerCase();
        if (q) {
          data = data.filter(
            (r) =>
              r.antecedent.some((s) => s.toLowerCase().includes(q)) ||
              r.consequent.some((s) => s.toLowerCase().includes(q)) ||
              r.antecedentNames.some((s) => s.toLowerCase().includes(q)) ||
              r.consequentNames.some((s) => s.toLowerCase().includes(q)) ||
              r.consequentItemGroup.toLowerCase().includes(q) ||
              r.consequentSubCategory.toLowerCase().includes(q)
          );
        }
      }
    }
    return data;
  }, [rules, hideOutOfStock, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      return sortDir === "desc" ? bv - av : av - bv;
    });
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
    { key: "antecedent", label: "If customer buys", width: 200 },
    { key: "arrow", label: "", width: 28 },
    { key: "consequent", label: "Recommend", width: 200 },
    { key: "confidence", label: "Conf.", width: 80, sortable: true },
    { key: "lift", label: "Lift", width: 65, sortable: true },
    { key: "revenueLift", label: "Rev.Lift", width: 80, sortable: true },
    { key: "profitLift", label: "Profit", width: 75, sortable: true },
    { key: "basketUplift", label: "Basket+", width: 70, sortable: true },
    { key: "stability", label: "Stability", width: 70 },
    { key: "stock", label: "Stock", width: 120 },
    { key: "alternative", label: "Alternative", width: 130 },
    { key: "support", label: "Support", width: 70, sortable: true },
    { key: "count", label: "Count", width: 55, sortable: true },
  ] as const;
  const TOTAL_WIDTH = COLS.reduce((s, c) => s + c.width, 0);

  const Row = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const r = sorted[index];
      const isOOS = r.consequentStock.status === "out_of_stock";
      const isExpanded = expandedIdx === index;

      return (
        <div style={style}>
          <div
            className={cn(
              "flex items-center border-b border-edge/50 text-xs transition-colors cursor-pointer h-full",
              isOOS ? "opacity-40" : "hover:bg-surface-hover"
            )}
            onClick={() => setExpandedIdx(isExpanded ? null : index)}
          >
            <div
              className="flex items-center"
              style={{ minWidth: TOTAL_WIDTH }}
            >
              {/* Expand indicator */}
              <div className="w-5 flex items-center justify-center shrink-0">
                {isExpanded ? (
                  <ChevronDown size={10} className="text-muted" />
                ) : (
                  <ChevronRight size={10} className="text-muted" />
                )}
              </div>
              {/* Antecedent */}
              <div
                className="px-1.5 truncate shrink-0"
                style={{ width: 200 - 5 }}
                data-tip={r.antecedentNames.join(", ")}
              >
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
                style={{ width: 28 }}
              >
                <ArrowRight size={12} className="text-muted" />
              </div>
              {/* Consequent */}
              <div
                className="px-1.5 truncate shrink-0"
                style={{ width: 200 }}
                data-tip={r.consequentNames.join(", ")}
              >
                <span className="font-mono text-[11px]">
                  {r.consequent.join(", ")}
                </span>
                <br />
                <span className="text-[10px] text-muted truncate">
                  {r.consequentNames.join(", ")}
                </span>
              </div>
              {/* Confidence */}
              <div
                className="px-1.5 font-mono text-xs text-center shrink-0"
                style={{ width: 80 }}
              >
                {(r.confidence * 100).toFixed(1)}%
              </div>
              {/* Lift */}
              <div
                className={cn(
                  "px-1.5 font-mono text-xs text-center font-semibold shrink-0",
                  r.lift >= 2
                    ? "text-emerald-600"
                    : r.lift >= 1.5
                      ? "text-amber-600"
                      : "text-primary"
                )}
                style={{ width: 65 }}
              >
                {r.lift.toFixed(2)}
              </div>
              {/* Revenue Lift */}
              <div
                className="px-1.5 font-mono text-xs text-center shrink-0"
                style={{ width: 80 }}
              >
                {r.revenueLift.toFixed(0)}
              </div>
              {/* Profit Lift */}
              <div
                className="px-1.5 font-mono text-xs text-center shrink-0"
                style={{ width: 75 }}
              >
                {r.profitLift.toFixed(0)}
              </div>
              {/* Basket Uplift */}
              <div
                className={cn(
                  "px-1.5 font-mono text-xs text-center shrink-0",
                  r.basketUplift > 0.2 ? "text-emerald-600 font-semibold" : ""
                )}
                style={{ width: 70 }}
              >
                {r.basketUplift > 0 ? `+${(r.basketUplift * 100).toFixed(0)}%` : "—"}
              </div>
              {/* Stability */}
              <div className="px-1.5 shrink-0 text-center" style={{ width: 70 }}>
                <span className={cn(
                  "inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold",
                  r.stabilityScore === "high" ? "bg-emerald-100 text-emerald-700" :
                  r.stabilityScore === "medium" ? "bg-amber-100 text-amber-700" :
                  "bg-red-100 text-red-700"
                )}>
                  {r.stabilityScore}
                </span>
              </div>
              {/* Stock */}
              <div className="px-1.5 shrink-0" style={{ width: 120 }}>
                <StockBadge stock={r.consequentStock} />
              </div>
              {/* Alternative */}
              <div className="px-1.5 shrink-0 truncate" style={{ width: 130 }}>
                {r.alternative ? (
                  <span className="text-[10px] text-blue-600" title={`${r.alternative.code}: ${r.alternative.name}`}>
                    {r.alternative.code}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted">—</span>
                )}
              </div>
              {/* Support */}
              <div
                className="px-1.5 font-mono text-xs text-center shrink-0"
                style={{ width: 70 }}
              >
                {(r.support * 100).toFixed(2)}%
              </div>
              {/* Count */}
              <div
                className="px-1.5 font-mono text-xs text-center shrink-0"
                style={{ width: 55 }}
              >
                {r.count}
              </div>
            </div>
          </div>
        </div>
      );
    },
    [sorted, TOTAL_WIDTH, expandedIdx]
  );

  // Expanded detail panel (shown below the list when a row is selected)
  const expandedRule = expandedIdx !== null ? sorted[expandedIdx] : null;

  return (
    <div ref={containerRef} className="flex-1 flex flex-col min-h-0">
      {/* Search bar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-edge bg-surface/50">
        <input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search SKU or product... (comma = multi-SKU)"
          className="bg-white border border-edge rounded px-2.5 py-1 text-xs font-mono w-72 focus:outline-none focus:ring-1 focus:ring-accent/50"
        />
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
          className="flex items-center h-8"
          style={{ minWidth: TOTAL_WIDTH }}
        >
          <div className="w-5 shrink-0" />
          {COLS.map((col) => {
            const isSortable = "sortable" in col && col.sortable;
            const isSorted = isSortable && sortKey === col.key;
            return (
              <button
                key={col.key}
                onClick={() =>
                  isSortable && toggleSort(col.key as SortKey)
                }
                disabled={!isSortable}
                className={cn(
                  "flex items-center gap-1 px-1.5 text-[10px] font-semibold text-muted uppercase tracking-wider shrink-0",
                  isSortable
                    ? "hover:text-primary cursor-pointer"
                    : "cursor-default"
                )}
                style={{ width: col.width }}
              >
                <span className="truncate">{col.label}</span>
                {isSorted &&
                  (sortDir === "desc" ? (
                    <ArrowDown size={9} className="text-accent shrink-0" />
                  ) : (
                    <ArrowUp size={9} className="text-accent shrink-0" />
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
            {rules.length === 0
              ? "No rules generated yet"
              : "No matching rules"}
          </p>
        </div>
      ) : (
        <div
          onDoubleClick={(e) => {
            const el = (e.target as HTMLElement).closest("[data-tip]");
            if (!el) return;
            const text = (el.getAttribute("data-tip") ?? "").trim();
            if (!text) return;
            navigator.clipboard.writeText(text);
            showCopiedToast(e.clientX, e.clientY);
          }}
        >
          <List
            outerRef={outerRef}
            height={listHeight - (expandedRule ? 100 : 0)}
            width="100%"
            itemSize={ROW_HEIGHT}
            itemCount={sorted.length}
            overscanCount={10}
          >
            {Row}
          </List>
        </div>
      )}

      {/* Expanded detail panel */}
      {expandedRule && (
        <div className="shrink-0 border-t border-edge bg-slate-50 px-4 py-3">
          <div className="flex items-start gap-6 text-xs">
            <div className="w-16 h-16 rounded bg-slate-200 flex items-center justify-center text-muted text-[10px]">
              IMG
            </div>
            <div className="flex-1 min-w-0 space-y-1">
              <p className="font-semibold text-primary">
                {expandedRule.consequentNames.join(", ")}
              </p>
              <p className="text-muted font-mono text-[11px]">
                {expandedRule.consequent.join(", ")}
              </p>
              <div className="flex gap-4 text-[11px] text-muted flex-wrap">
                <span>
                  Group:{" "}
                  <strong className="text-primary">
                    {expandedRule.consequentItemGroup || "—"}
                  </strong>
                </span>
                <span>
                  Sub-category:{" "}
                  <strong className="text-primary">
                    {expandedRule.consequentSubCategory || "—"}
                  </strong>
                </span>
                <span>
                  Sales Price:{" "}
                  <strong className="text-primary">
                    {expandedRule.consequentSalesPrice > 0
                      ? `\u20AC ${expandedRule.consequentSalesPrice.toFixed(2)}`
                      : "—"}
                  </strong>
                </span>
                <span>
                  Profit Lift:{" "}
                  <strong className="text-primary">{expandedRule.profitLift.toFixed(0)}</strong>
                </span>
                <span>
                  Basket Uplift:{" "}
                  <strong className="text-primary">
                    {expandedRule.basketUplift > 0 ? `+${(expandedRule.basketUplift * 100).toFixed(1)}%` : "—"}
                  </strong>
                </span>
                <span>
                  Stability:{" "}
                  <strong className="text-primary">{expandedRule.stabilityScore}</strong>
                </span>
                {expandedRule.alternative && (
                  <span>
                    Alt:{" "}
                    <strong className="text-blue-600">
                      {expandedRule.alternative.code} ({expandedRule.alternative.name})
                    </strong>
                  </span>
                )}
              </div>
            </div>
            <div>
              <StockBadge stock={expandedRule.consequentStock} />
            </div>
          </div>
        </div>
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
