import { parseNum } from "./parsers";
import type {
  SalesRow,
  StockRow,
  BestSellerItem,
  WeeklyDataPoint,
  StockStatusLabel,
  DateRangePreset,
  BestSellerSortBy,
} from "./stock-types";

// ── Parse DD-MM-YYYY → Date ──────────────────────────────────────────────────
function parseDDMMYYYY(raw: string): Date | null {
  if (!raw) return null;
  const parts = raw.trim().split(/[-/.]/);
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  if (isNaN(day) || isNaN(month) || isNaN(year)) return null;
  return new Date(year, month - 1, day);
}

// ── Parse raw CSV rows into SalesRow[] ───────────────────────────────────────
// Filters ITEM rows only: Header ≠ "H", Item not null/empty, Item ≠ "T"
export function parseSalesRows(raw: Record<string, unknown>[]): SalesRow[] {
  const result: SalesRow[] = [];

  for (const r of raw) {
    const header = String(r["Header"] ?? "").trim();
    const item = String(r["Item"] ?? "").trim();

    // Skip header rows, empty items, and total rows
    if (header === "H" || !item || item === "T") continue;

    const dateParsed = parseDDMMYYYY(String(r["Order date"] ?? ""));
    if (!dateParsed) continue; // Skip rows without valid dates

    result.push({
      Header: header,
      Item: item,
      ItemDescription: String(r["Item descriptionDescription"] ?? "").trim(),
      Quantity: parseNum(r["Quantity"]) ?? 0,
      NetPrice: parseNum(r["Net price"]) ?? 0,
      UnitPrice: parseNum(r["Unit price"]) ?? 0,
      Discount: parseNum(r["Discount"]) ?? 0,
      CostPriceFC: parseNum(r["CostPriceFC"]) ?? 0,
      OrderDate: String(r["Order date"] ?? "").trim(),
      OrderDateParsed: dateParsed.toISOString(),
      OrderNumber: String(r["Order number"] ?? "").trim(),
      OrderedByCode: String(r["Ordered byCode"] ?? "").trim(),
      OrderedByDescription: String(r["Ordered byDescription"] ?? "").trim(),
    });
  }

  return result;
}

// ── Auto-detect date range ───────────────────────────────────────────────────
export function getDateRange(sales: SalesRow[]): { min: Date; max: Date } | null {
  if (sales.length === 0) return null;
  let min = new Date(sales[0].OrderDateParsed).getTime();
  let max = new Date(sales[0].OrderDateParsed).getTime();
  for (const row of sales) {
    const t = new Date(row.OrderDateParsed).getTime();
    if (t < min) min = t;
    if (t > max) max = t;
  }
  return { min: new Date(min), max: new Date(max) };
}

// ── Compute date filter boundaries ───────────────────────────────────────────
export function getDateFilterRange(
  preset: DateRangePreset,
  maxDate: Date,
  customStart?: string,
  customEnd?: string
): { start: Date | null; end: Date | null } {
  if (preset === "all") return { start: null, end: null };

  if (preset === "custom") {
    return {
      start: customStart ? new Date(customStart) : null,
      end: customEnd ? new Date(customEnd) : null,
    };
  }

  const end = new Date();
  const start = new Date(end);
  switch (preset) {
    case "1w": start.setDate(start.getDate() - 7); break;
    case "1m": start.setMonth(start.getMonth() - 1); break;
    case "3m": start.setMonth(start.getMonth() - 3); break;
    case "6m": start.setMonth(start.getMonth() - 6); break;
    case "1y": start.setFullYear(start.getFullYear() - 1); break;
  }
  return { start, end };
}

// ── Stock status computation ─────────────────────────────────────────────────
export function computeStockStatus(
  qtySold: number,
  currentStock: number | null
): StockStatusLabel {
  if (currentStock === null || currentStock === undefined) return "N/A";
  if (currentStock === 0) return "Sold Out";

  const dailyRate = qtySold / 31; // monthly approximation
  const weekSupply = dailyRate * 7;
  const ninetyDaySupply = dailyRate * 90;

  if (currentStock < weekSupply) return "Low Stock";
  if (currentStock > ninetyDaySupply && ninetyDaySupply > 0) return "Overstocked";
  return "Healthy";
}

// ── Derive categories from sales+stock ───────────────────────────────────────
export function deriveCategories(
  sales: SalesRow[],
  stock: StockRow[]
): string[] {
  // Build stock lookup for category
  const stockLookup = new Map<string, string>();
  for (const row of stock) {
    if (row.ItemGroupDescriptionDescription) {
      stockLookup.set(row.ItemCode, row.ItemGroupDescriptionDescription);
    }
  }

  const categories = new Set<string>();
  for (const row of sales) {
    const cat = stockLookup.get(row.Item);
    if (cat) categories.add(cat);
  }

  return Array.from(categories).sort();
}

// ── Main aggregation ─────────────────────────────────────────────────────────
export function aggregateBestSellers(
  sales: SalesRow[],
  stock: StockRow[],
  filters: {
    dateStart: Date | null;
    dateEnd: Date | null;
    categories: string[];
    topN: number | "all";
    sortBy: BestSellerSortBy;
    excludedItems?: string[];
  }
): BestSellerItem[] {
  // Build stock lookup
  const stockMap = new Map<string, StockRow>();
  for (const row of stock) {
    stockMap.set(row.ItemCode, row);
  }

  // Build category lookup from stock
  const categoryMap = new Map<string, string>();
  for (const row of stock) {
    if (row.ItemGroupDescriptionDescription) {
      categoryMap.set(row.ItemCode, row.ItemGroupDescriptionDescription);
    }
  }

  // Filter by date range BEFORE aggregation
  let filtered = sales;
  if (filters.dateStart) {
    const startT = filters.dateStart.getTime();
    filtered = filtered.filter((r) => new Date(r.OrderDateParsed).getTime() >= startT);
  }
  if (filters.dateEnd) {
    const endOfDay = new Date(filters.dateEnd);
    endOfDay.setHours(23, 59, 59, 999);
    const endT = endOfDay.getTime();
    filtered = filtered.filter((r) => new Date(r.OrderDateParsed).getTime() <= endT);
  }

  // Aggregate per item
  const aggMap = new Map<string, {
    itemCode: string;
    productName: string;
    totalQty: number;
    totalRevenue: number;
    totalGrossProfit: number;
    orderNumbers: Set<string>;
    unitPrices: number[];
  }>();

  for (const row of filtered) {
    if (filters.excludedItems && filters.excludedItems.includes(row.Item)) {
      continue;
    }
    let agg = aggMap.get(row.Item);
    if (!agg) {
      agg = {
        itemCode: row.Item,
        productName: row.ItemDescription,
        totalQty: 0,
        totalRevenue: 0,
        totalGrossProfit: 0,
        orderNumbers: new Set(),
        unitPrices: [],
      };
      aggMap.set(row.Item, agg);
    }
    agg.totalQty += row.Quantity;
    agg.totalRevenue += row.NetPrice;
    agg.totalGrossProfit += (row.NetPrice - (row.CostPriceFC * row.Quantity));
    agg.orderNumbers.add(row.OrderNumber);
    agg.unitPrices.push(row.UnitPrice);
    // Update product name if better
    if (!agg.productName && row.ItemDescription) {
      agg.productName = row.ItemDescription;
    }
  }

  // Convert to BestSellerItem[]
  let items: BestSellerItem[] = [];
  for (const agg of aggMap.values()) {
    const category = categoryMap.get(agg.itemCode) ?? "";
    const stockRow = stockMap.get(agg.itemCode);
    const currentStock = stockRow ? stockRow.AvailableStock : null;

    items.push({
      rank: 0, // set after sorting
      itemCode: agg.itemCode,
      productName: agg.productName,
      category,
      totalQty: agg.totalQty,
      totalRevenue: agg.totalRevenue,
      grossProfit: agg.totalGrossProfit,
      orderCount: agg.orderNumbers.size,
      avgUnitPrice: agg.unitPrices.length > 0
        ? agg.unitPrices.reduce((s, v) => s + v, 0) / agg.unitPrices.length
        : 0,
      currentStock,
      plannedIn: stockRow ? stockRow.PlannedInStock : null,
      plannedOut: stockRow ? stockRow.PlannedOutStock : null,
      stockStatus: computeStockStatus(agg.totalQty, currentStock),
    });
  }

  // Filter by category
  if (filters.categories.length > 0) {
    items = items.filter((i) => filters.categories.includes(i.category));
  }

  // Sort
  items.sort((a, b) => {
    switch (filters.sortBy) {
      case "totalQty": return b.totalQty - a.totalQty;
      case "totalRevenue": return b.totalRevenue - a.totalRevenue;
      case "orderCount": return b.orderCount - a.orderCount;
      default: return b.totalQty - a.totalQty;
    }
  });

  // Apply Top N
  if (filters.topN !== "all") {
    items = items.slice(0, filters.topN);
  }

  // Set ranks
  items.forEach((item, i) => { item.rank = i + 1; });

  return items;
}

// ── Weekly breakdown ─────────────────────────────────────────────────────────
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday start
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekLabel(weekStart: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  // Compute week number within the month
  const firstOfMonth = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
  const firstMonday = new Date(firstOfMonth);
  const dayOfWeek = firstMonday.getDay();
  firstMonday.setDate(firstMonday.getDate() + (dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek));

  let weekNum = 1;
  const temp = new Date(firstMonday);
  while (temp < weekStart) {
    temp.setDate(temp.getDate() + 7);
    weekNum++;
  }

  return `W${weekNum} ${months[weekStart.getMonth()]}`;
}

export function computeWeeklyBreakdown(
  sales: SalesRow[],
  dateStart: Date | null,
  dateEnd: Date | null,
  excludedItems?: string[]
): WeeklyDataPoint[] {
  let filtered = sales;
  if (dateStart) {
    const startT = dateStart.getTime();
    filtered = filtered.filter((r) => new Date(r.OrderDateParsed).getTime() >= startT);
  }
  if (dateEnd) {
    const endOfDay = new Date(dateEnd);
    endOfDay.setHours(23, 59, 59, 999);
    const endT = endOfDay.getTime();
    filtered = filtered.filter((r) => new Date(r.OrderDateParsed).getTime() <= endT);
  }

  const weekMap = new Map<string, { weekStart: Date; totalQty: number; totalRevenue: number; grossProfit: number }>();

  for (const row of filtered) {
    if (excludedItems && excludedItems.includes(row.Item)) {
      continue;
    }
    const ws = getWeekStart(new Date(row.OrderDateParsed));
    const key = ws.toISOString().slice(0, 10);
    let entry = weekMap.get(key);
    if (!entry) {
      entry = { weekStart: ws, totalQty: 0, totalRevenue: 0, grossProfit: 0 };
      weekMap.set(key, entry);
    }
    entry.totalQty += row.Quantity;
    entry.totalRevenue += row.NetPrice;
    entry.grossProfit += (row.NetPrice - (row.CostPriceFC * row.Quantity));
  }

  const weeks = Array.from(weekMap.values()).sort(
    (a, b) => a.weekStart.getTime() - b.weekStart.getTime()
  );

  return weeks.map((w) => ({
    weekLabel: formatWeekLabel(w.weekStart),
    weekStart: w.weekStart,
    totalQty: w.totalQty,
    totalRevenue: w.totalRevenue,
    grossProfit: w.grossProfit,
  }));
}

// ── Chart color palette (consistent per category) ────────────────────────────
const CATEGORY_COLORS = [
  "#2563eb", "#7c3aed", "#059669", "#d97706", "#dc2626",
  "#0891b2", "#4f46e5", "#16a34a", "#ea580c", "#be185d",
  "#6366f1", "#0d9488", "#ca8a04", "#9333ea", "#e11d48",
  "#0284c7", "#65a30d", "#c026d3", "#f59e0b", "#ef4444",
];

export function getCategoryColor(category: string, allCategories: string[]): string {
  const idx = allCategories.indexOf(category);
  return CATEGORY_COLORS[idx >= 0 ? idx % CATEGORY_COLORS.length : 0];
}

// ── Format helpers ───────────────────────────────────────────────────────────
export function formatCurrency(value: number): string {
  const abs = Math.abs(value);
  const formatted = abs.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const [intPart, decPart] = formatted.split(".");
  // For EU formatting: use dot as thousands, comma as decimal
  // But toFixed already gives us the decimal point...
  // Let's do proper EU formatting
  const intFormatted = Math.floor(abs).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const dec = abs.toFixed(2).split(".")[1];
  const sign = value < 0 ? "-" : "";
  return `€${sign}${intFormatted},${dec}`;
}

export function formatQty(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}
