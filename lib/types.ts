export type FileKey = "shopify" | "sales" | "stock" | "purchase" | "items" | "published";

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
  No: number;
  Title: string;
  "Variant SKU": string;
  "Variant Quantity": number;
  Status: "active" | "draft" | "archived";
  Published: "TRUE" | "FALSE";
  "Variant Price": number | null;
  "Variant Compare at Price": number | null;
  ETA: string | null;
  "Variant Inventory Policy": "continue" | "deny";
  PlannedInStock: number;
  PlannedOutStock: number;
  "Discount %": number | null;
  "Cost per item": number | null;
  Reference: string | null;
  B2C: "Yes" | "No";
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
  b2cTotal: number;
}

export const OUTPUT_COLUMNS: { key: keyof OutputRow; label: string; flex: number; }[] = [
  { key: "No", label: "No", flex: 0.5 },
  { key: "Title", label: "Title", flex: 3 },
  { key: "Variant SKU", label: "SKU", flex: 2 },
  { key: "Variant Quantity", label: "Qty", flex: 1 },
  { key: "Status", label: "Status", flex: 1, },
  { key: "Published", label: "Published", flex: 1, },
  { key: "B2C", label: "B2C", flex: 1, },
  { key: "Variant Price", label: "Price", flex: 1 },
  { key: "Variant Compare at Price", label: "Compare Price", flex: 1.5 },
  { key: "ETA", label: "ETA", flex: 1.5 },
  { key: "Variant Inventory Policy", label: "Policy", flex: 1.5 },
  { key: "PlannedInStock", label: "Planned", flex: 1 },
  // { key: "PlannedOutStock", label: "Planned Out", flex: 1 },
  { key: "Discount %", label: "Disc %", flex: 1, },
  { key: "Cost per item", label: "Cost", flex: 1 },
  // { key: "Reference", label: "Reference", flex: 2 },
];

export const PRICE_COLUMNS: Set<keyof OutputRow> = new Set([
  "Variant Price",
  "Variant Compare at Price",
  "Cost per item",
]);

export const INTEGER_OUTPUT_COLUMNS: Set<keyof OutputRow> = new Set([
  "Variant Quantity",
  "PlannedInStock",
  "PlannedOutStock",
]);

export type TableSize = "S" | "M" | "L";

export const TABLE_SIZE_CONFIG: Record<TableSize, { rowHeight: number; fontSize: string; cellPadding: string }> = {
  S: { rowHeight: 32, fontSize: "11px", cellPadding: "4px 8px" },
  M: { rowHeight: 44, fontSize: "13px", cellPadding: "8px 12px" },
  L: { rowHeight: 60, fontSize: "15px", cellPadding: "12px 16px" },
};

export type ExportRowLimit = "all" | 10 | 20 | 50 | 100 | "custom";

export interface BatchProgress {
  current: number;
  total: number;
  phase: "building" | "compressing";
}

// ── Preview ──────────────────────────────────────────────────────────────────

export interface PreviewData {
  filename: string;
  headers: string[];
  rows: string[][];
  totalRows: number;
  encoding: string;
  separator: string;
  error?: string;
}

export const HIGHLIGHTED_PREVIEW_COLUMNS: Record<FileKey, Set<string>> = {
  shopify: new Set([
    "Variant SKU", "Variant Inventory Qty", "Variant Price",
    "Variant Compare At Price", "Cost per item", "Status",
    "ETA (product.metafields.custom.eta)",
  ]),
  sales: new Set(["Item", "Reference", "Order date", "Order status"]),
  stock: new Set(["ItemCode", "Stock", "PlannedInStock", "PlannedOutStock"]),
  purchase: new Set(["Item", "Receipt date"]),
  items: new Set(["Code", "SalesPrice", "Extra field:  Retail Price EUR", "Class_09Description"]),
  published: new Set(["SKU", "LimitedToStores"]),
};

export const FILE_SLOTS_CONFIG: { key: FileKey; label: string; hint: string }[] = [
  { key: "shopify", label: "Shopify Export", hint: "export-shopify.csv" },
  { key: "sales", label: "Sales Orders", hint: "sales-orders.csv (UTF-16)" },
  { key: "stock", label: "Stock Positions", hint: "stock-positions.csv (UTF-16)" },
  { key: "purchase", label: "Purchase Orders", hint: "purchase-orders.csv (UTF-16)" },
  { key: "items", label: "Items", hint: "items.csv (UTF-16)" },
  { key: "published", label: "Published Products", hint: "publishedproducts.xlsx" },
];
