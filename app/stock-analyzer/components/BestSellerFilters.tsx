"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Filter, X, Check, Calendar } from "lucide-react";
import type { DateRangePreset, BestSellerSortBy } from "@/lib/stock-types";

interface BestSellerFiltersProps {
  dateRange: DateRangePreset;
  customStart: string;
  customEnd: string;
  categories: string[];
  selectedCategories: string[];
  topN: number | "all";
  sortBy: BestSellerSortBy;
  onDateRangeChange: (preset: DateRangePreset) => void;
  onCustomStartChange: (date: string) => void;
  onCustomEndChange: (date: string) => void;
  onCategoryChange: (cats: string[]) => void;
  excludedItems: string[];
  excludedItemsOptions: { code: string; name: string }[];
  onExcludedItemsChange: (items: string[]) => void;
  onTopNChange: (n: number | "all") => void;
  onSortByChange: (s: BestSellerSortBy) => void;
  disabledTopN?: boolean;
  disabledSortBy?: boolean;
}

const DATE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "all", label: "All" },
  { value: "1w", label: "1W" },
  { value: "1m", label: "1M" },
  { value: "3m", label: "3M" },
  { value: "6m", label: "6M" },
  { value: "1y", label: "1Y" },
  { value: "custom", label: "Custom" },
];

const TOP_N_OPTIONS: { value: number | "all"; label: string }[] = [
  { value: 10, label: "Top 10" },
  { value: 20, label: "Top 20" },
  { value: 30, label: "Top 30" },
  { value: 50, label: "Top 50" },
  { value: 100, label: "Top 100" },
];

const SORT_OPTIONS: { value: BestSellerSortBy; label: string }[] = [
  { value: "totalQty", label: "Qty" },
  { value: "totalRevenue", label: "Revenue" },
  { value: "orderCount", label: "Orders" },
];

function CategoryDropdown({
  categories,
  selected,
  onChange,
}: {
  categories: string[];
  selected: string[];
  onChange: (cats: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const toggle = (cat: string) =>
    onChange(selected.includes(cat) ? selected.filter((c) => c !== cat) : [...selected, cat]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-[12px] transition-colors cursor-pointer",
          selected.length > 0
            ? "border-accent bg-accent/5 text-accent"
            : "border-edge bg-white text-muted hover:text-primary hover:border-primary/30"
        )}
      >
        <Filter size={12} />
        Category
        {selected.length > 0 && (
          <>
            <span className="bg-accent text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
              {selected.length}
            </span>
            <span
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
              className="hover:bg-accent/20 rounded p-0.5"
            >
              <X size={10} />
            </span>
          </>
        )}
      </button>
      {open && (
        <div ref={panelRef} className="absolute top-full left-0 mt-1 z-50 w-64 bg-white border border-edge rounded-lg shadow-lg py-1">
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-edge">
            <button onClick={() => onChange(categories)} className="text-[11px] text-accent hover:underline cursor-pointer">Select All</button>
            <span className="text-muted text-[11px]">·</span>
            <button onClick={() => onChange([])} className="text-[11px] text-accent hover:underline cursor-pointer">Clear All</button>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {categories.map((cat) => {
              const checked = selected.includes(cat);
              return (
                <button
                  key={cat}
                  onClick={() => toggle(cat)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <span className={cn(
                    "flex items-center justify-center w-4 h-4 rounded border shrink-0",
                    checked ? "bg-accent border-accent text-white" : "border-edge bg-white"
                  )}>
                    {checked && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span className="text-primary truncate">{cat}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ExcludedItemsDropdown({
  options,
  selected,
  onChange,
}: {
  options: { code: string; name: string }[];
  selected: string[];
  onChange: (items: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const toggle = (code: string) =>
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.code.toLowerCase().includes(q) || (o.name && o.name.toLowerCase().includes(q)));
  }, [options, search]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-[12px] transition-colors cursor-pointer",
          selected.length > 0
            ? "border-red-400 bg-red-50 text-red-600 font-medium"
            : "border-edge bg-white text-muted hover:text-primary hover:border-primary/30"
        )}
      >
        <Filter size={12} className={selected.length > 0 ? "text-red-500" : ""} />
        Exclude Items
        {selected.length > 0 && (
          <>
            <span className="bg-red-500 text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
              {selected.length}
            </span>
            <span
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
              className="hover:bg-red-500/20 rounded p-0.5 text-red-600"
            >
              <X size={10} />
            </span>
          </>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute top-full left-0 mt-2 w-72 bg-white border border-edge rounded-lg shadow-xl z-[60] overflow-hidden flex flex-col"
        >
          <div className="p-2 border-b border-edge">
             <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product..." className="w-full bg-slate-50 border border-edge outline-none rounded px-2 py-1 text-[11px]" />
          </div>
          <div className="max-h-60 overflow-y-auto p-1 text-[12px] flex flex-col">
            {filtered.slice(0, 100).map((opt) => {
              const checked = selected.includes(opt.code);
              return (
                <button
                  key={opt.code}
                  onClick={() => toggle(opt.code)}
                  className="flex items-start gap-2 w-full px-2 py-1.5 text-left hover:bg-slate-50 transition-colors group cursor-pointer"
                >
                  <div
                    className={cn(
                      "w-4 h-4 mt-0.5 border rounded flex items-center justify-center shrink-0 transition-colors",
                      checked ? "bg-red-500 border-red-500 text-white" : "border-edge group-hover:border-red-400 bg-white"
                    )}
                  >
                    {checked && <Check size={10} strokeWidth={3} />}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col">
                    <span className="text-primary truncate">{opt.name || opt.code}</span>
                    <span className="text-[10px] text-muted font-mono">{opt.code}</span>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-center text-muted">No items found</p>
            )}
            {filtered.length > 100 && (
              <p className="px-3 py-2 text-center text-[10px] text-muted font-mono bg-slate-50 shrink-0">Showing first 100 items...</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BestSellerFilters({
  dateRange,
  customStart,
  customEnd,
  categories,
  selectedCategories,
  topN,
  sortBy,
  onDateRangeChange,
  onCustomStartChange,
  onCustomEndChange,
  onCategoryChange,
  excludedItems,
  excludedItemsOptions,
  onExcludedItemsChange,
  onTopNChange,
  onSortByChange,
  disabledTopN,
  disabledSortBy,
}: BestSellerFiltersProps) {
  return (
    <div className="shrink-0 px-4 py-2 border-b border-edge bg-surface flex items-center gap-2 flex-wrap">
      {/* Date range presets */}
      <div className="flex items-center gap-0.5">
        <Calendar size={12} className="text-muted mr-1" />
        {DATE_PRESETS.map((p) => (
          <button
            key={p.value}
            onClick={() => onDateRangeChange(p.value)}
            className={cn(
              "h-7 px-2 rounded-md text-[11px] font-medium transition-colors cursor-pointer",
              dateRange === p.value
                ? "bg-accent/10 text-accent border border-accent/30"
                : "text-muted hover:text-primary hover:bg-surface-hover border border-transparent"
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Custom date range */}
      {dateRange === "custom" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={customStart}
            onChange={(e) => onCustomStartChange(e.target.value)}
            className="h-7 px-2 text-[11px] border border-edge rounded-md bg-white focus:outline-none focus:border-accent/50 font-mono"
          />
          <span className="text-muted text-[11px]">→</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => onCustomEndChange(e.target.value)}
            className="h-7 px-2 text-[11px] border border-edge rounded-md bg-white focus:outline-none focus:border-accent/50 font-mono"
          />
        </div>
      )}

      <div className="w-px h-5 bg-edge shrink-0" />

      {/* Category filter */}
      {categories.length > 0 && (
        <CategoryDropdown
          categories={categories}
          selected={selectedCategories}
          onChange={onCategoryChange}
        />
      )}

      <div className="w-px h-5 bg-edge shrink-0" />

      {/* Excluded Items */}
      {excludedItemsOptions.length > 0 && (
        <ExcludedItemsDropdown
          options={excludedItemsOptions}
          selected={excludedItems}
          onChange={onExcludedItemsChange}
        />
      )}

      <div className="w-px h-5 bg-edge shrink-0" />

      {/* Top N */}
      <div className={cn("flex items-center gap-0.5", disabledTopN && "opacity-40 pointer-events-none")}>
        {TOP_N_OPTIONS.map((opt) => (
          <button
            key={String(opt.value)}
            onClick={() => onTopNChange(opt.value)}
            className={cn(
              "h-7 px-2 rounded-md text-[11px] font-medium transition-colors cursor-pointer",
              topN === opt.value
                ? "bg-accent/10 text-accent border border-accent/30"
                : "text-muted hover:text-primary hover:bg-surface-hover border border-transparent"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="w-px h-5 bg-edge shrink-0" />

      {/* Sort by */}
      <div className={cn("flex items-center gap-0.5", disabledSortBy && "opacity-40 pointer-events-none")}>
        <span className="text-[11px] text-muted mr-1">Sort:</span>
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onSortByChange(opt.value)}
            className={cn(
              "h-7 px-2 rounded-md text-[11px] font-medium transition-colors cursor-pointer",
              sortBy === opt.value
                ? "bg-accent/10 text-accent border border-accent/30"
                : "text-muted hover:text-primary hover:bg-surface-hover border border-transparent"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
