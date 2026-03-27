export interface Rule {
  antecedent: string[];
  consequent: string[];
  antecedentNames: string[];
  consequentNames: string[];
  support: number;
  confidence: number;
  lift: number;
  count: number;
  zone: DiscountZone;
  recommendedDiscountPct: number;
  action: string;
}

export interface MiningStats {
  totalRows: number;
  totalOrders: number;
  basketsUsed: number;
  uniqueSKUs: number;
  rulesFound: number;
  strongBundles: number;
  computeTimeMs: number;
  channels: string[];
}

export interface MiningParams {
  minSupport: number;
  minConfidence: number;
  minLift: number;
  maxItemsetSize: number;
}

export interface FilterParams {
  dateFrom: string | null;
  dateTo: string | null;
  orderStatuses: string[];
  channels: string[];
  minBasketSize: number;
  skipItems: string[];
}

export type WorkerIncoming = {
  type: "start";
  file: File;
  params: MiningParams;
  filters: FilterParams;
};

export type WorkerMessage =
  | { type: "progress"; step: string; pct: number; message: string }
  | { type: "channels"; channels: string[] }
  | { type: "done"; rules: Rule[]; stats: MiningStats }
  | { type: "error"; message: string };

export type DiscountZone = "green" | "yellow" | "purple" | "gray";

export const ZONE_CONFIG: Record<
  DiscountZone,
  { label: string; discountRange: [number, number]; action: string }
> = {
  green: {
    label: "No discount needed",
    discountRange: [0, 5],
    action: "Show as Frequently Bought Together",
  },
  yellow: {
    label: "Moderate bundle discount",
    discountRange: [5, 15],
    action: "Show in cart when product A is added",
  },
  purple: {
    label: "Aggressive discount",
    discountRange: [15, 25],
    action: "Special campaign to change buying habit",
  },
  gray: {
    label: "Skip",
    discountRange: [0, 0],
    action: "No real association — do not create bundle",
  },
};

export const DEFAULT_MINING_PARAMS: MiningParams = {
  minSupport: 0.01,
  minConfidence: 0.3,
  minLift: 1.0,
  maxItemsetSize: 3,
};

export const DEFAULT_FILTER_PARAMS: FilterParams = {
  dateFrom: null,
  dateTo: null,
  orderStatuses: ["Complete"],
  channels: [],
  minBasketSize: 2,
  skipItems: ["T", "TRANSPORT", "Divers", "CNCL006"],
};
