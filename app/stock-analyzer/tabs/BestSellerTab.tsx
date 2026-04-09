"use client";

import { useState, useMemo } from "react";
import { useStockStore } from "@/lib/stock-store";
import {
  aggregateBestSellers,
  getDateRange,
  getDateFilterRange,
  deriveCategories,
  computeWeeklyBreakdown,
  getChannels,
  aggregateByChannel,
} from "@/lib/bestSeller";
import type { DateRangePreset, BestSellerSortBy } from "@/lib/stock-types";
import BestSellerFilters from "../components/BestSellerFilters";
import BestSellerKPICards from "../components/BestSellerKPICards";
import BestSellerChart from "../components/BestSellerChart";
import SKUCompareTable from "../components/SKUCompareTable";
import BestSellerTable from "../components/BestSellerTable";
import WeeklyBreakdown from "../components/WeeklyBreakdown";
import ChannelPerformanceTab from "../components/ChannelPerformanceTab";
import { Upload, BarChart3, TableProperties, CalendarDays, GitCompareArrows, Store } from "lucide-react";
import { cn } from "@/lib/utils";

type InnerTab = "overview" | "skuCompare" | "dataTable" | "weekly" | "channels";

const INNER_TABS: { key: InnerTab; label: string; icon: React.ElementType }[] = [
  { key: "overview",   label: "Overview",    icon: BarChart3 },
  { key: "skuCompare", label: "SKU Compare", icon: GitCompareArrows },
  { key: "dataTable",  label: "Data Table",  icon: TableProperties },
  { key: "weekly",     label: "Weekly",       icon: CalendarDays },
  { key: "channels",   label: "Channels",    icon: Store },
];

interface BestSellerTabProps {
  innerView?: string;
  onInnerViewChange?: (view: string) => void;
}

export default function BestSellerTab({ innerView, onInnerViewChange }: BestSellerTabProps) {
  const salesData = useStockStore((s) => s.salesData);
  const stockRows = useStockStore((s) => s.rows);
  const hasStockData = stockRows.length > 0;

  // Inner tab — use prop if provided (for URL routing), else local state
  const [localView, setLocalView] = useState<InnerTab>("overview");
  const activeView = (innerView as InnerTab) || localView;
  const setActiveView = (v: InnerTab) => {
    if (onInnerViewChange) onInnerViewChange(v);
    else setLocalView(v);
  };

  // Local filter state
  const [dateRange, setDateRange] = useState<DateRangePreset>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [topN, setTopN] = useState<number | "all">(10);
  const [sortBy, setSortBy] = useState<BestSellerSortBy>("totalQty");
  const [excludedItems, setExcludedItems] = useState<string[]>([]);
  const [channelFilter, setChannelFilter] = useState<string[]>([]);

  // Deriving excluded item options
  const excludedItemsOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of salesData) {
      if (!map.has(r.Item)) map.set(r.Item, r.ItemDescription || r.Item);
    }
    return Array.from(map.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [salesData]);

  // Date range detection
  const dateRangeBounds = useMemo(() => getDateRange(salesData), [salesData]);

  // Compute date filter boundaries
  const dateFilter = useMemo(() => {
    if (!dateRangeBounds) return { start: null, end: null };
    return getDateFilterRange(dateRange, dateRangeBounds.max, customStart, customEnd);
  }, [dateRange, dateRangeBounds, customStart, customEnd]);

  // Derive categories from sales + stock
  const categories = useMemo(
    () => deriveCategories(salesData, stockRows),
    [salesData, stockRows]
  );

  // Derive channels from sales data
  const channels = useMemo(() => getChannels(salesData), [salesData]);

  // Aggregate best sellers
  const bestSellers = useMemo(
    () =>
      aggregateBestSellers(salesData, stockRows, {
        dateStart: dateFilter.start,
        dateEnd: dateFilter.end,
        categories: categoryFilter,
        topN,
        sortBy,
        excludedItems,
        channels: channelFilter,
      }),
    [salesData, stockRows, dateFilter, categoryFilter, topN, sortBy, excludedItems, channelFilter]
  );

  // Full results without topN limit (for the data table)
  const allBestSellers = useMemo(
    () =>
      aggregateBestSellers(salesData, stockRows, {
        dateStart: dateFilter.start,
        dateEnd: dateFilter.end,
        categories: categoryFilter,
        topN: "all",
        sortBy,
        excludedItems,
        channels: channelFilter,
      }),
    [salesData, stockRows, dateFilter, categoryFilter, sortBy, excludedItems, channelFilter]
  );

  // Weekly breakdown
  const weeklyData = useMemo(
    () => computeWeeklyBreakdown(salesData, dateFilter.start, dateFilter.end, excludedItems),
    [salesData, dateFilter, excludedItems]
  );

  // Channel stats
  const channelStats = useMemo(
    () => aggregateByChannel(salesData, {
      dateStart: dateFilter.start,
      dateEnd: dateFilter.end,
      excludedItems,
    }),
    [salesData, dateFilter, excludedItems]
  );

  // KPI computations
  const kpi = useMemo(() => {
    const items = allBestSellers;
    return {
      totalSKU: items.length,
      totalQtySold: items.reduce((s, i) => s + i.totalQty, 0),
      totalRevenue: items.reduce((s, i) => s + i.totalRevenue, 0),
      totalGrossProfit: items.reduce((s, i) => s + i.grossProfit, 0),
    };
  }, [allBestSellers]);

  // Chart title
  const chartTitle = useMemo(() => {
    const nLabel = topN === "all" ? "All" : `Top ${topN}`;
    const metricLabel = sortBy === "totalQty" ? "Total Qty" : sortBy === "totalRevenue" ? "Total Revenue" : "Order Count";
    
    let dateLabel = "";
    if (dateRangeBounds) {
      const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      if (dateFilter.start && dateFilter.end) {
        dateLabel = ` — ${months[dateFilter.start.getMonth()]} ${dateFilter.start.getFullYear()}`;
        if (dateFilter.start.getMonth() !== dateFilter.end.getMonth() || dateFilter.start.getFullYear() !== dateFilter.end.getFullYear()) {
          dateLabel += ` to ${months[dateFilter.end.getMonth()]} ${dateFilter.end.getFullYear()}`;
        }
      } else {
        const min = dateRangeBounds.min;
        const max = dateRangeBounds.max;
        dateLabel = ` — ${months[min.getMonth()]} ${min.getFullYear()} to ${months[max.getMonth()]} ${max.getFullYear()}`;
      }
    }

    return `${nLabel} Products by ${metricLabel}${dateLabel}`;
  }, [topN, sortBy, dateFilter, dateRangeBounds]);

  // Empty state
  if (salesData.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-2">
          <Upload size={40} className="mx-auto text-muted/30" />
          <p className="text-sm text-muted">Upload Sales Orders CSV to see Best Seller analysis</p>
          <p className="text-[11px] text-muted/50 font-mono">Upload both Stock Positions and Sales Orders to enable this tab</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Filters — shared across all inner tabs */}
      <BestSellerFilters
        dateRange={dateRange}
        customStart={customStart}
        customEnd={customEnd}
        categories={categories}
        selectedCategories={categoryFilter}
        topN={topN}
        sortBy={sortBy}
        onDateRangeChange={setDateRange}
        onCustomStartChange={setCustomStart}
        onCustomEndChange={setCustomEnd}
        onCategoryChange={setCategoryFilter}
        excludedItems={excludedItems}
        excludedItemsOptions={excludedItemsOptions}
        onExcludedItemsChange={setExcludedItems}
        channels={channels}
        selectedChannels={channelFilter}
        onChannelChange={setChannelFilter}
        onTopNChange={setTopN}
        onSortByChange={setSortBy}
        disabledTopN={activeView === "dataTable" || activeView === "weekly"}
        disabledSortBy={activeView === "dataTable" || activeView === "weekly"}
      />

      {/* Inner tab bar */}
      <div className="shrink-0 border-b border-edge bg-surface/50 px-4 flex items-end gap-0">
        {INNER_TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveView(key)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium transition-colors cursor-pointer border-b-2 -mb-px",
              activeView === key
                ? "text-accent border-accent"
                : "text-muted border-transparent hover:text-primary"
            )}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Inner tab content — scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {activeView === "overview" && (
          <>
            <BestSellerKPICards
              totalSKU={kpi.totalSKU}
              totalQtySold={kpi.totalQtySold}
              totalRevenue={kpi.totalRevenue}
              totalGrossProfit={kpi.totalGrossProfit}
            />
            <BestSellerChart
              items={bestSellers}
              allCategories={categories}
              title={chartTitle}
            />
          </>
        )}

        {activeView === "skuCompare" && (
          <SKUCompareTable
            items={bestSellers}
            hasStockData={hasStockData}
          />
        )}

        {activeView === "dataTable" && (
          <BestSellerTable items={allBestSellers} />
        )}

        {activeView === "weekly" && (
          <WeeklyBreakdown data={weeklyData} defaultOpen />
        )}

        {activeView === "channels" && (
          <ChannelPerformanceTab data={channelStats} />
        )}

        {/* Bottom spacer */}
        <div className="h-4 shrink-0" />
      </div>
    </div>
  );
}
