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

export const OUTPUT_COLUMNS: { key: keyof OutputRow; label: string; flex: number; align: "left" | "center" }[] = [
  { key: "Title", label: "Title", flex: 3, align: "left" },
  { key: "Variant SKU", label: "Variant SKU", flex: 2, align: "left" },
  { key: "Variant Quantity", label: "Qty", flex: 1, align: "center" },
  { key: "Status", label: "Status", flex: 1, align: "center" },
  { key: "Published", label: "Published", flex: 1, align: "center" },
  { key: "Variant Price", label: "Price", flex: 1, align: "center" },
  { key: "Variant Compare at Price", label: "Compare Price", flex: 1.5, align: "center" },
  { key: "ETA", label: "ETA", flex: 1.5, align: "left" },
  { key: "Variant Inventory Policy", label: "Policy", flex: 1.5, align: "center" },
  { key: "PlannedInStock", label: "Planned", flex: 1, align: "center" },
  { key: "Discount %", label: "Disc %", flex: 1, align: "center" },
  { key: "Cost per item", label: "Cost", flex: 1, align: "center" },
  { key: "Reference", label: "Reference", flex: 2, align: "left" },
];

export const PRICE_COLUMNS: Set<keyof OutputRow> = new Set([
  "Variant Price",
  "Variant Compare at Price",
  "Cost per item",
]);

export const INTEGER_OUTPUT_COLUMNS: Set<keyof OutputRow> = new Set([
  "Variant Quantity",
  "PlannedInStock",
]);

export type TableSize = "S" | "M" | "L";

export const TABLE_SIZE_CONFIG: Record<TableSize, { rowHeight: number; fontSize: string; cellPadding: string }> = {
  S: { rowHeight: 32, fontSize: "11px", cellPadding: "4px 8px" },
  M: { rowHeight: 44, fontSize: "13px", cellPadding: "8px 12px" },
  L: { rowHeight: 60, fontSize: "15px", cellPadding: "12px 16px" },
};

export type ExportRowLimit = "all" | 10 | 20 | 50 | 100 | "custom";

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
  stock: new Set(["ItemCode", "PlannedInStock"]),
  purchase: new Set(["Item", "Receipt date"]),
  items: new Set(["Code", "SalesPrice", "Extra field:  Retail Price EUR", "Class_09Description"]),
};

export const FILE_SLOTS_CONFIG: { key: FileKey; label: string; hint: string }[] = [
  { key: "shopify", label: "Shopify Export", hint: "export-shopify.csv" },
  { key: "sales", label: "Sales Orders", hint: "sales-orders.csv (UTF-16)" },
  { key: "stock", label: "Stock Positions", hint: "stock-positions.csv (UTF-16)" },
  { key: "purchase", label: "Purchase Orders", hint: "purchase-orders.csv (UTF-16)" },
  { key: "items", label: "Items", hint: "items.csv (UTF-16)" },
];
