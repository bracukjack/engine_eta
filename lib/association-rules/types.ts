// ── Stock ────────────────────────────────────────────────────────────────────

export type StockStatus = "in_stock" | "low_stock" | "out_of_stock" | "incoming";

export interface StockInfo {
  availableStock: number;
  plannedInStock: number;
  status: StockStatus;
}

// ── Item Rule (Tab 1 + Tab 3) ───────────────────────────────────────────────

export interface ItemRule {
  antecedent: string[];
  consequent: string[];
  antecedentNames: string[];
  consequentNames: string[];
  support: number;
  confidence: number;
  lift: number;
  count: number;
  revenueLift: number; // lift * avg net price of consequent
  consequentAvgPrice: number;
  consequentStock: StockInfo;
  consequentItemGroup: string;
  consequentSubCategory: string;
  consequentSalesPrice: number;
  // Phase 2
  profitLift: number; // lift * (salesPrice - costPrice)
  basketUplift: number; // avg basket value WITH consequent vs WITHOUT
  stabilityScore: "low" | "medium" | "high"; // confidence CV across months
  alternative: { code: string; name: string; stock: StockInfo } | null; // in-stock alt in same subCategory
}

// ── Sequential Rules ────────────────────────────────────────────────────────

export interface SequentialRule {
  antecedent: string[];
  consequent: string[];
  antecedentNames: string[];
  consequentNames: string[];
  support: number;
  confidence: number;
  lift: number;
  count: number;
  avgDaysBetween: number;
  consequentStock: StockInfo;
}

// ── RFM Segmentation ────────────────────────────────────────────────────────

export type RFMSegment = "champion" | "loyal" | "potential" | "at_risk" | "lost";

export interface SegmentSummary {
  segment: RFMSegment;
  customerCount: number;
  avgRecency: number; // days since last order
  avgFrequency: number; // orders per customer
  avgMonetary: number; // avg total spend
  topItems: string[]; // top 5 item codes
  topItemNames: string[];
}

// ── Salesperson Metrics ─────────────────────────────────────────────────────

export interface SalespersonMetric {
  name: string;
  totalOrders: number;
  totalRevenue: number;
  uniqueItems: number;
  avgBasketSize: number;
  avgBasketValue: number;
  topItems: string[];
  topItemNames: string[];
  crossSellRate: number; // % orders with 2+ categories
}

// ── Seasonal Insights ───────────────────────────────────────────────────────

export interface SeasonalPeriod {
  period: string; // "2024-01", "Q1 2024", etc.
  orderCount: number;
  revenue: number;
  topItems: string[];
  topItemNames: string[];
  avgBasketSize: number;
}

// ── Negative Rules & Cannibalization ────────────────────────────────────────

export interface NegativeRule {
  itemA: string;
  itemB: string;
  nameA: string;
  nameB: string;
  observedSupport: number;
  expectedSupport: number;
  lift: number; // < 1.0
  itemGroupA: string;
  itemGroupB: string;
}

export interface CannibalizationPair {
  itemA: string;
  itemB: string;
  nameA: string;
  nameB: string;
  subCategory: string;
  priceA: number;
  priceB: number;
  coOccurrenceRate: number; // how rarely they appear together
  soloRateA: number; // % orders with A but not B
  soloRateB: number; // % orders with B but not A
}

// ── Ranking Weights ─────────────────────────────────────────────────────────

export interface RankingWeights {
  lift: number;
  confidence: number;
  profitLift: number;
  stockScore: number;
  support: number;
}

// ── Category (Tab 2) ────────────────────────────────────────────────────────

export interface CategoryRule {
  antecedent: string;
  consequent: string;
  support: number;
  confidence: number;
  lift: number;
  count: number;
  level: "itemGroup" | "subCategory";
}

export interface MatrixCell {
  row: string;
  col: string;
  lift: number;
  confidence: number;
  count: number;
}

// ── Bundle (Tab 4) ──────────────────────────────────────────────────────────

export interface BundleItem {
  code: string;
  name: string;
  itemGroup: string;
  salesPrice: number;
  stock: StockInfo;
}

export interface Bundle {
  id: string;
  name: string;
  items: BundleItem[];
  support: number;
  frequency: number;
  totalValue: number;
  stockCompleteness: number; // 0–1
  categories: string[];
}

// ── Stats ────────────────────────────────────────────────────────────────────

export interface AnalysisStats {
  totalOrders: number;
  uniqueItems: number;
  rulesFound: number;
  estimatedRevenueOpportunity: number;
  computeTimeMs: number;
}

// ── Full results from worker ────────────────────────────────────────────────

export interface AnalysisResults {
  itemRules: ItemRule[];
  itemGroupMatrix: MatrixCell[];
  subCategoryMatrix: MatrixCell[];
  crossCategoryRules: CategoryRule[];
  bundles: Bundle[];
  stats: AnalysisStats;
  salespersons: string[];
  itemGroups: string[];
  salespersonItems: Record<string, string[]>;
  // Phase 2
  sequentialRules: SequentialRule[];
  segments: SegmentSummary[];
  negativeRules: NegativeRule[];
  cannibalizationPairs: CannibalizationPair[];
  salespersonMetrics: SalespersonMetric[];
  seasonalData: SeasonalPeriod[];
  smartBundles: Bundle[];
}

// ── Worker filters (sent to worker, need re-run) ────────────────────────────

export interface WorkerFilters {
  minSupport: number;
  minConfidence: number;
  minLift: number;
  dateFrom: string | null;
  dateTo: string | null;
  itemGroups: string[];
}

export const DEFAULT_WORKER_FILTERS: WorkerFilters = {
  minSupport: 0.01,
  minConfidence: 0.2,
  minLift: 1.3,
  dateFrom: null,
  dateTo: null,
  itemGroups: [],
};

// ── Worker messages ─────────────────────────────────────────────────────────

export type WorkerIncoming = {
  type: "start";
  salesRows: Record<string, string>[];
  productRows: Record<string, string>[];
  stockRows: Record<string, string>[];
  filters: WorkerFilters;
};

export type WorkerMessage =
  | { type: "progress"; step: string; pct: number; message: string }
  | { type: "done"; results: AnalysisResults }
  | { type: "error"; message: string };

// ── File slot ───────────────────────────────────────────────────────────────

export interface FileSlot {
  file: File | null;
  status: "empty" | "parsing" | "parsed" | "error";
  rowCount: number;
  error: string | null;
}

export const EMPTY_FILE_SLOT: FileSlot = {
  file: null,
  status: "empty",
  rowCount: 0,
  error: null,
};

// ── Tab ─────────────────────────────────────────────────────────────────────

export type AnalysisTab =
  | "recommendations"
  | "categories"
  | "revenue"
  | "bundles"
  | "sequential"
  | "salesperson"
  | "seasonal"
  | "conflicts";
