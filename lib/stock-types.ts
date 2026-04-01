export interface StockRow {
  No: number;
  ItemCode: string;
  ItemDescriptionDescription: string;
  ItemGroupDescriptionDescription: string;
  Class01Description: string;
  Class06Description: string;
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

export interface SalesRow {
  Header: string;
  Item: string;
  ItemDescription: string;
  Quantity: number;
  NetPrice: number;
  UnitPrice: number;
  Discount: number;
  CostPriceFC: number;
  OrderDate: string;       // raw DD-MM-YYYY string
  OrderDateParsed: Date;   // parsed Date for filtering
  OrderNumber: string;
  OrderedByCode: string;
  OrderedByDescription: string;
}

export type StockStatusLabel = "Sold Out" | "Low Stock" | "Healthy" | "Overstocked" | "N/A";

export interface BestSellerItem {
  rank: number;
  itemCode: string;
  productName: string;
  category: string;
  totalQty: number;
  totalRevenue: number;
  orderCount: number;
  avgDiscount: number;
  avgUnitPrice: number;
  currentStock: number | null;
  plannedIn: number | null;
  plannedOut: number | null;
  stockStatus: StockStatusLabel;
}

export interface WeeklyDataPoint {
  weekLabel: string;
  weekStart: Date;
  totalQty: number;
  totalRevenue: number;
}

export type DateRangePreset = "all" | "1w" | "1m" | "2m" | "3m" | "6m" | "custom";
export type BestSellerSortBy = "totalQty" | "totalRevenue" | "orderCount";

export const STOCK_COLUMNS: {
  key: keyof StockRow;
  label: string;
  flex: number;
  tooltip: string;
  numeric?: boolean;
}[] = [
  { key: "No",                            label: "No",          flex: 0.8, tooltip: "Row number" },
  { key: "RealStock",      label: "Real",   flex: 1,   tooltip: "Real Stock = Stock − PlannedOutStock", numeric: true },
  { key: "ItemCode",                      label: "Item Code",   flex: 2, tooltip: "Unique product identifier" },
  { key: "ItemDescriptionDescription",    label: "Desc", flex: 3, tooltip: "Product name" },
  { key: "ItemGroupDescriptionDescription", label: "Category",  flex: 2,   tooltip: "Product category group" },
  { key: "Class01Description", label: "Class 01", flex: 1.5, tooltip: "Product sub-category (Class 01)" },
  { key: "Class06Description", label: "Class 06", flex: 1.5, tooltip: "Product sub-category (Class 06)" },
  { key: "Stock",          label: "Stock",        flex: 0.6, tooltip: "Current physical stock quantity", numeric: true },
  { key: "PlannedInStock", label: "Plan In",   flex: 0.9, tooltip: "Planned incoming stock",          numeric: true },
  { key: "PlannedOutStock",label: "Plan Out",  flex: 0.9, tooltip: "Planned outgoing stock",          numeric: true },
  { key: "AvailableStock", label: "Available",    flex: 0.9, tooltip: "System-calculated available stock", numeric: true },
];

export type StockStatusFilter = "all" | "inStock" | "outOfStock" | "negative";
export type StockTableSize  = "S" | "M" | "L";

export const STOCK_TABLE_SIZE: Record<StockTableSize, { fontSize: string; cellPadding: string }> = {
  S: { fontSize: "11px", cellPadding: "4px 12px" },
  M: { fontSize: "12px", cellPadding: "6px 12px" },
  L: { fontSize: "13px", cellPadding: "8px 12px" },
};
