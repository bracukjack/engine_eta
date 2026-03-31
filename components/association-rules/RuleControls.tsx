"use client";

import { useState } from "react";
import type { WorkerFilters, RankingWeights } from "@/lib/association-rules/types";
import { ChevronDown, ChevronRight } from "lucide-react";

interface Props {
  filters: WorkerFilters;
  onFiltersChange: (f: WorkerFilters) => void;
  availableItemGroups: string[];
  // Display-only filters (not sent to worker)
  hideOutOfStock: boolean;
  onHideOutOfStockChange: (v: boolean) => void;
  sortByRevenue: boolean;
  onSortByRevenueChange: (v: boolean) => void;
  optimizeProfit: boolean;
  onOptimizeProfitChange: (v: boolean) => void;
  rankingWeights: RankingWeights;
  onRankingWeightsChange: (w: RankingWeights) => void;
}

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-edge last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 w-full px-1 py-2 text-[11px] font-semibold text-muted uppercase tracking-wider hover:text-primary transition-colors"
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {title}
      </button>
      {open && <div className="pb-3 space-y-2">{children}</div>}
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-muted">{label}</span>
        <span className="text-[11px] font-mono font-semibold text-primary">
          {format(value)}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none bg-slate-200 accent-accent cursor-pointer"
      />
    </div>
  );
}

export function RuleControls({
  filters,
  onFiltersChange,
  availableItemGroups,
  hideOutOfStock,
  onHideOutOfStockChange,
  sortByRevenue,
  onSortByRevenueChange,
  optimizeProfit,
  onOptimizeProfitChange,
  rankingWeights,
  onRankingWeightsChange,
}: Props) {
  return (
    <div className="space-y-0">
      <Section title="Mining Parameters">
        <div className="space-y-3">
          <SliderField
            label="Min Support"
            value={filters.minSupport}
            min={0.005}
            max={0.05}
            step={0.005}
            format={(v) => `${(v * 100).toFixed(1)}%`}
            onChange={(v) => onFiltersChange({ ...filters, minSupport: v })}
          />
          <SliderField
            label="Min Confidence"
            value={filters.minConfidence}
            min={0.1}
            max={0.5}
            step={0.05}
            format={(v) => `${(v * 100).toFixed(0)}%`}
            onChange={(v) => onFiltersChange({ ...filters, minConfidence: v })}
          />
          <SliderField
            label="Min Lift"
            value={filters.minLift}
            min={1.0}
            max={3.0}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(v) => onFiltersChange({ ...filters, minLift: v })}
          />
        </div>
      </Section>

      <Section title="Date Range" defaultOpen={false}>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={filters.dateFrom || ""}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                dateFrom: e.target.value || null,
              })
            }
            className="flex-1 bg-white border border-edge rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          <span className="text-[11px] text-muted">&rarr;</span>
          <input
            type="date"
            value={filters.dateTo || ""}
            onChange={(e) =>
              onFiltersChange({
                ...filters,
                dateTo: e.target.value || null,
              })
            }
            className="flex-1 bg-white border border-edge rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
        </div>
      </Section>

      {availableItemGroups.length > 0 && (
        <Section title="Item Groups" defaultOpen={false}>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            <label className="flex items-center gap-2 text-xs text-primary cursor-pointer font-medium">
              <input
                type="checkbox"
                checked={filters.itemGroups.length === 0}
                onChange={() =>
                  onFiltersChange({ ...filters, itemGroups: [] })
                }
                className="rounded border-edge accent-accent"
              />
              All groups
            </label>
            {availableItemGroups.map((group) => (
              <label
                key={group}
                className="flex items-center gap-2 text-xs text-primary cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={
                    filters.itemGroups.length === 0 ||
                    filters.itemGroups.includes(group)
                  }
                  onChange={(e) => {
                    if (filters.itemGroups.length === 0) {
                      onFiltersChange({
                        ...filters,
                        itemGroups: e.target.checked ? [group] : [],
                      });
                    } else {
                      const next = e.target.checked
                        ? [...filters.itemGroups, group]
                        : filters.itemGroups.filter((x) => x !== group);
                      onFiltersChange({
                        ...filters,
                        itemGroups:
                          next.length === availableItemGroups.length
                            ? []
                            : next,
                      });
                    }
                  }}
                  className="rounded border-edge accent-accent"
                />
                <span className="truncate">{group}</span>
              </label>
            ))}
          </div>
        </Section>
      )}

      <Section title="Display Filters">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-xs text-primary cursor-pointer">
            <input
              type="checkbox"
              checked={hideOutOfStock}
              onChange={(e) => onHideOutOfStockChange(e.target.checked)}
              className="rounded border-edge accent-accent"
            />
            Hide out-of-stock
          </label>
          <label className="flex items-center gap-2 text-xs text-primary cursor-pointer">
            <input
              type="checkbox"
              checked={sortByRevenue}
              onChange={(e) => onSortByRevenueChange(e.target.checked)}
              className="rounded border-edge accent-accent"
            />
            Sort by Revenue Lift
          </label>
          <label className="flex items-center gap-2 text-xs text-primary cursor-pointer">
            <input
              type="checkbox"
              checked={optimizeProfit}
              onChange={(e) => onOptimizeProfitChange(e.target.checked)}
              className="rounded border-edge accent-accent"
            />
            Optimize for Profit
          </label>
        </div>
      </Section>

      <Section title="Ranking Weights" defaultOpen={false}>
        <div className="space-y-3">
          <SliderField
            label="Lift"
            value={rankingWeights.lift}
            min={0}
            max={1}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(v) => onRankingWeightsChange({ ...rankingWeights, lift: v })}
          />
          <SliderField
            label="Confidence"
            value={rankingWeights.confidence}
            min={0}
            max={1}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(v) => onRankingWeightsChange({ ...rankingWeights, confidence: v })}
          />
          <SliderField
            label="Profit"
            value={rankingWeights.profitLift}
            min={0}
            max={1}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(v) => onRankingWeightsChange({ ...rankingWeights, profitLift: v })}
          />
          <SliderField
            label="Stock Score"
            value={rankingWeights.stockScore}
            min={0}
            max={1}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(v) => onRankingWeightsChange({ ...rankingWeights, stockScore: v })}
          />
          <SliderField
            label="Support"
            value={rankingWeights.support}
            min={0}
            max={1}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(v) => onRankingWeightsChange({ ...rankingWeights, support: v })}
          />
        </div>
      </Section>
    </div>
  );
}
