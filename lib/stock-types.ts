export interface StockRow {
  No: number;
  ItemCode: string;
  ItemDescriptionDescription: string;
  ItemGroupDescriptionDescription: string;
  Stock: number;
  PlannedInStock: number;
  PlannedOutStock: number;
  AvailableStock: number;
  RealStock: number;
}

export interface StockSummary {
  total: number;
  inStock: number;
  outOfStock: number;
  negativeRealStock: number;
  totalStockQty: number;
  totalPlannedOut: number;
}

export const STOCK_COLUMNS: {
  key: keyof StockRow;
  label: string;
  flex: number;
  tooltip: string;
  numeric?: boolean;
}[] = [
  { key: "No",                            label: "No",          flex: 0.4, tooltip: "Row number" },
  { key: "RealStock",      label: "Real Stock",   flex: 1,   tooltip: "Real Stock = Stock − PlannedOutStock", numeric: true },
  { key: "ItemCode",                      label: "Item Code",   flex: 1.5, tooltip: "Unique product identifier" },
  { key: "ItemDescriptionDescription",    label: "Description", flex: 3.5, tooltip: "Product name" },
  { key: "ItemGroupDescriptionDescription", label: "Category",  flex: 2,   tooltip: "Product category group" },
  { key: "Stock",          label: "Stock",        flex: 0.8, tooltip: "Current physical stock quantity", numeric: true },
  { key: "PlannedInStock", label: "Planned In",   flex: 0.9, tooltip: "Planned incoming stock",          numeric: true },
  { key: "PlannedOutStock",label: "Planned Out",  flex: 0.9, tooltip: "Planned outgoing stock",          numeric: true },
  { key: "AvailableStock", label: "Available",    flex: 0.9, tooltip: "System-calculated available stock", numeric: true },
];

export type StockStatusFilter = "all" | "inStock" | "outOfStock" | "negative";
export type StockTableSize  = "S" | "M" | "L";

export const STOCK_TABLE_SIZE: Record<StockTableSize, { fontSize: string; cellPadding: string }> = {
  S: { fontSize: "11px", cellPadding: "4px 12px" },
  M: { fontSize: "12px", cellPadding: "6px 12px" },
  L: { fontSize: "13px", cellPadding: "8px 12px" },
};
