export type FileKey = "shopify" | "sales" | "stock" | "purchase" | "items";

export interface FileSlot {
  key: FileKey;
  label: string;
  hint: string;
  file: File | null;
  status: "empty" | "ready";
}

export interface WorkerInput {
  type: "process";
  files: Record<FileKey, Record<string, unknown>[]>;
}

export interface WorkerProgress {
  type: "progress";
  step: string;
  progress: number;
  message: string;
}

export interface WorkerResult {
  type: "result";
  data: OutputRow[];
  summary: Summary;
}

export interface WorkerError {
  type: "error";
  message: string;
}

export type WorkerResponse = WorkerProgress | WorkerResult | WorkerError;

export interface OutputRow {
  Title: string;
  "Variant SKU": string;
  "Variant Quantity": number;
  Status: "active" | "draft";
  Published: "TRUE" | "FALSE";
  "Variant Price": number | null;
  "Variant Compare at Price": number | null;
  ETA: string | null;
  "Variant Inventory Policy": "continue" | "deny";
  PlannedInStock: number;
  "Discount %": number | null;
  "Cost per item": number | null;
  Reference: string | null;
}

export interface Summary {
  total: number;
  active: number;
  draft: number;
  continueCount: number;
  deny: number;
  etaFilled: number;
  hasDiscount: number;
  costFilled: number;
  referenceFilled: number;
}

export const OUTPUT_COLUMNS: { key: keyof OutputRow; label: string; width: number }[] = [
  { key: "Title", label: "Title", width: 200 },
  { key: "Variant SKU", label: "Variant SKU", width: 140 },
  { key: "Variant Quantity", label: "Qty", width: 70 },
  { key: "Status", label: "Status", width: 80 },
  { key: "Published", label: "Published", width: 80 },
  { key: "Variant Price", label: "Price", width: 90 },
  { key: "Variant Compare at Price", label: "Compare Price", width: 120 },
  { key: "ETA", label: "ETA", width: 100 },
  { key: "Variant Inventory Policy", label: "Policy", width: 90 },
  { key: "PlannedInStock", label: "Planned", width: 90 },
  { key: "Discount %", label: "Disc %", width: 80 },
  { key: "Cost per item", label: "Cost", width: 90 },
  { key: "Reference", label: "Reference", width: 150 },
];

export const TOTAL_ROW_WIDTH = OUTPUT_COLUMNS.reduce((sum, c) => sum + c.width, 0);

export const FILE_SLOTS_CONFIG: { key: FileKey; label: string; hint: string }[] = [
  { key: "shopify", label: "Shopify Export", hint: "export-shopify.csv" },
  { key: "sales", label: "Sales Orders", hint: "sales-orders.csv (UTF-16)" },
  { key: "stock", label: "Stock Positions", hint: "stock-positions.csv (UTF-16)" },
  { key: "purchase", label: "Purchase Orders", hint: "purchase-orders.csv (UTF-16)" },
  { key: "items", label: "Items", hint: "items.csv (UTF-16)" },
];
