"use client";

import { useState, useMemo } from "react";
import { useStockStore } from "@/lib/stock-store";
import {
  aggregateBestSellers,
  getDateRange,
  getDateFilterRange,
  deriveCategories,
  computeWeeklyBreakdown,
} from "@/lib/bestSeller";
import type { DateRangePreset, BestSellerSortBy } from "@/lib/stock-types";
import BestSellerFilters from "../components/BestSellerFilters";
import BestSellerKPICards from "../components/BestSellerKPICards";
import BestSellerChart from "../components/BestSellerChart";
import SKUCompareTable from "../components/SKUCompareTable";
import BestSellerTable from "../components/BestSellerTable";
import WeeklyBreakdown from "../components/WeeklyBreakdown";
import { Upload } from "lucide-react";

export default function BestSellerTab() {
  const salesData = useStockStore((s) => s.salesData);
  const stockRows = useStockStore((s) => s.rows);
  const hasStockData = stockRows.length > 0;

  // Local filter state
  const [dateRange, setDateRange] = useState<DateRangePreset>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [topN, setTopN] = useState<number | "all">(10);
  const [sortBy, setSortBy] = useState<BestSellerSortBy>("totalQty");

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

  // Aggregate best sellers
  const bestSellers = useMemo(
    () =>
      aggregateBestSellers(salesData, stockRows, {
        dateStart: dateFilter.start,
        dateEnd: dateFilter.end,
        categories: categoryFilter,
        topN,
        sortBy,
      }),
    [salesData, stockRows, dateFilter, categoryFilter, topN, sortBy]
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
      }),
    [salesData, stockRows, dateFilter, categoryFilter, sortBy]
  );

  // Weekly breakdown
  const weeklyData = useMemo(
    () => computeWeeklyBreakdown(salesData, dateFilter.start, dateFilter.end),
    [salesData, dateFilter]
  );

  // KPI computations
  const kpi = useMemo(() => {
    const items = allBestSellers;
    return {
      totalSKU: items.length,
      totalQtySold: items.reduce((s, i) => s + i.totalQty, 0),
      totalRevenue: items.reduce((s, i) => s + i.totalRevenue, 0),
      avgDiscount:
        items.length > 0
          ? items.reduce((s, i) => s + i.avgDiscount, 0) / items.length
          : 0,
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
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
      {/* Filters */}
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
        onTopNChange={setTopN}
        onSortByChange={setSortBy}
      />

      {/* KPI Cards */}
      <BestSellerKPICards
        totalSKU={kpi.totalSKU}
        totalQtySold={kpi.totalQtySold}
        totalRevenue={kpi.totalRevenue}
        avgDiscount={kpi.avgDiscount}
      />

      {/* Chart */}
      <BestSellerChart
        items={bestSellers}
        allCategories={categories}
        title={chartTitle}
      />

      {/* SKU Compare */}
      <SKUCompareTable
        items={bestSellers}
        hasStockData={hasStockData}
      />

      {/* Data Table */}
      <BestSellerTable items={allBestSellers} />

      {/* Weekly Breakdown */}
      <WeeklyBreakdown data={weeklyData} />

      {/* Bottom spacer */}
      <div className="h-4 shrink-0" />
    </div>
  );
}
