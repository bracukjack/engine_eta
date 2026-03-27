"use client";

import { useState } from "react";
import type { MiningParams, FilterParams } from "@/lib/association-rules/types";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";

interface Props {
  params: MiningParams;
  filters: FilterParams;
  channels: string[];
  onParamsChange: (p: MiningParams) => void;
  onFiltersChange: (f: FilterParams) => void;
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

export function FilterPanel({
  params,
  filters,
  channels,
  onParamsChange,
  onFiltersChange,
}: Props) {
  const [newSkip, setNewSkip] = useState("");

  return (
    <div className="space-y-0">
      <Section title="Date Range" defaultOpen={false}>
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={filters.dateFrom || ""}
            onChange={(e) =>
              onFiltersChange({ ...filters, dateFrom: e.target.value || null })
            }
            className="flex-1 bg-white border border-edge rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          <span className="text-[11px] text-muted">→</span>
          <input
            type="date"
            value={filters.dateTo || ""}
            onChange={(e) =>
              onFiltersChange({ ...filters, dateTo: e.target.value || null })
            }
            className="flex-1 bg-white border border-edge rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
        </div>
      </Section>

      <Section title="Order Status">
        <div className="space-y-1">
          {["Complete", "Partial", "Open"].map((s) => (
            <label
              key={s}
              className="flex items-center gap-2 text-xs text-primary cursor-pointer"
            >
              <input
                type="checkbox"
                checked={filters.orderStatuses.includes(s)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...filters.orderStatuses, s]
                    : filters.orderStatuses.filter((x) => x !== s);
                  onFiltersChange({ ...filters, orderStatuses: next });
                }}
                className="rounded border-edge accent-accent"
              />
              {s}
            </label>
          ))}
        </div>
      </Section>

      {channels.length > 0 && (
        <Section title="Channel" defaultOpen={false}>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            <label className="flex items-center gap-2 text-xs text-primary cursor-pointer font-medium">
              <input
                type="checkbox"
                checked={filters.channels.length === 0}
                onChange={() => onFiltersChange({ ...filters, channels: [] })}
                className="rounded border-edge accent-accent"
              />
              All channels
            </label>
            {channels.map((ch) => (
              <label
                key={ch}
                className="flex items-center gap-2 text-xs text-primary cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={
                    filters.channels.length === 0 ||
                    filters.channels.includes(ch)
                  }
                  onChange={(e) => {
                    if (filters.channels.length === 0) {
                      onFiltersChange({
                        ...filters,
                        channels: e.target.checked ? [ch] : [],
                      });
                    } else {
                      const next = e.target.checked
                        ? [...filters.channels, ch]
                        : filters.channels.filter((x) => x !== ch);
                      onFiltersChange({
                        ...filters,
                        channels: next.length === channels.length ? [] : next,
                      });
                    }
                  }}
                  className="rounded border-edge accent-accent"
                />
                <span className="truncate">{ch || "(empty)"}</span>
              </label>
            ))}
          </div>
        </Section>
      )}

      <Section title="Mining Parameters">
        <div className="space-y-3">
          <SliderField
            label="Min Support"
            value={params.minSupport}
            min={0.005}
            max={0.2}
            step={0.005}
            format={(v) => `${(v * 100).toFixed(1)}%`}
            onChange={(v) => onParamsChange({ ...params, minSupport: v })}
          />
          <SliderField
            label="Min Confidence"
            value={params.minConfidence}
            min={0.1}
            max={0.9}
            step={0.05}
            format={(v) => `${(v * 100).toFixed(0)}%`}
            onChange={(v) => onParamsChange({ ...params, minConfidence: v })}
          />
          <SliderField
            label="Min Lift"
            value={params.minLift}
            min={0.5}
            max={5}
            step={0.1}
            format={(v) => v.toFixed(1)}
            onChange={(v) => onParamsChange({ ...params, minLift: v })}
          />
          <SliderField
            label="Max Itemset Size"
            value={params.maxItemsetSize}
            min={2}
            max={5}
            step={1}
            format={(v) => `${v} items`}
            onChange={(v) =>
              onParamsChange({ ...params, maxItemsetSize: v })
            }
          />
        </div>
      </Section>

      <Section title="Exclude SKUs" defaultOpen={false}>
        <div className="flex flex-wrap gap-1 mb-2">
          {filters.skipItems.map((item) => (
            <span
              key={item}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[11px] font-mono"
            >
              {item}
              <button
                onClick={() =>
                  onFiltersChange({
                    ...filters,
                    skipItems: filters.skipItems.filter((x) => x !== item),
                  })
                }
                className="text-muted hover:text-red-500"
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            value={newSkip}
            onChange={(e) => setNewSkip(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newSkip.trim()) {
                onFiltersChange({
                  ...filters,
                  skipItems: [...filters.skipItems, newSkip.trim()],
                });
                setNewSkip("");
              }
            }}
            placeholder="Add SKU..."
            className="flex-1 bg-white border border-edge rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent/50"
          />
          <button
            onClick={() => {
              if (newSkip.trim()) {
                onFiltersChange({
                  ...filters,
                  skipItems: [...filters.skipItems, newSkip.trim()],
                });
                setNewSkip("");
              }
            }}
            className="p-1 rounded border border-edge hover:bg-surface-hover text-muted hover:text-primary transition-colors"
          >
            <Plus size={14} />
          </button>
        </div>
      </Section>
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
