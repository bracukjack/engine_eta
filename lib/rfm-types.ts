// ── RFM Analysis Types ────────────────────────────────────────────────────────

export interface CustomerRFM {
  code: string;
  name: string;
  recency: number;        // days since last order
  frequency: number;      // unique order count
  monetary: number;       // total net price
  recencyNorm: number;    // normalised [0–1], inverted (1 = very recent)
  frequencyNorm: number;  // normalised [0–1]
  monetaryNorm: number;   // normalised [0–1]
  rfmScore: number;       // mean of the three normed values
  clusterId: number;
  segmentLabel: SegmentLabel;
  segmentColor: string;
}

export interface ClusterCentroid {
  id: number;
  recencyNorm: number;
  frequencyNorm: number;
  monetaryNorm: number;
  avgRecency: number;
  avgFrequency: number;
  avgMonetary: number;
  count: number;
}

export type SegmentLabel =
  | "VIP Champions"
  | "At Risk"
  | "New / Potential"
  | "One-time Buyers"
  | "Loyal Customers";

export interface SegmentMeta {
  label: SegmentLabel;
  color: string;
  emoji: string;
  recommendation: string;
}

export const SEGMENT_META: Record<SegmentLabel, SegmentMeta> = {
  "VIP Champions": {
    label: "VIP Champions",
    color: "#D97706",
    emoji: "👑",
    recommendation: "Berikan program loyalty & early access produk baru",
  },
  "At Risk": {
    label: "At Risk",
    color: "#DC2626",
    emoji: "⚠️",
    recommendation: "Kirim re-engagement campaign & penawaran khusus",
  },
  "New / Potential": {
    label: "New / Potential",
    color: "#16A34A",
    emoji: "🌱",
    recommendation: "Nurture dengan email sequence & product education",
  },
  "One-time Buyers": {
    label: "One-time Buyers",
    color: "#6B7280",
    emoji: "🛒",
    recommendation: "Win-back campaign dengan diskon first-repeat purchase",
  },
  "Loyal Customers": {
    label: "Loyal Customers",
    color: "#2563EB",
    emoji: "💙",
    recommendation: "Pertahankan engagement dengan program referral & reward",
  },
};

export interface ElbowPoint { k: number; wcss: number; }

export interface RFMResult {
  customers: CustomerRFM[];
  centroids: ClusterCentroid[];
  elbowData: ElbowPoint[];
  optimalK: number;
  totalCustomers: number;
  dateRange: { from: string; to: string };
}

// ── Worker message types ───────────────────────────────────────────────────────
export interface RFMWorkerInput {
  type: "analyze";
  rows: Record<string, unknown>[];
}
export interface RFMWorkerProgress {
  type: "progress";
  step: string;
  progress: number;
  message: string;
}
export interface RFMWorkerResult {
  type: "result";
  data: RFMResult;
}
export interface RFMWorkerError {
  type: "error";
  message: string;
}
export type RFMWorkerResponse = RFMWorkerProgress | RFMWorkerResult | RFMWorkerError;
