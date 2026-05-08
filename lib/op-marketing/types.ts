export interface Config {
  country: string;
  shopName: string;
}

export interface DiscountRow {
  SKU: string;
  GTIN: string;
  DISC: string;
}

export interface StockRow {
  ItemCode: string;
  Stock: string | number;
  PlannedOutStock: string | number;
}

export interface OfferRow {
  "Offer SKU": string;
  "Product SKU": string;
  Product: string;
  EAN: string;
}

export interface LogRow {
  Code: string;
  "Extra field:  Retail Price EUR": string;
}

export interface CampaignOfferRow {
  EAN: string;
  "SKU VU": string;
  "Shop name": string;
  "Product title": string;
  Price: number;
  "Discount price": number;
  "% discount": string;
  Country: string;
}

export const CAMPAIGN_COLUMNS: {
  key: keyof CampaignOfferRow;
  label: string;
  flex: number;
  numeric?: boolean;
  center?: boolean;
}[] = [
  { key: "EAN", label: "EAN", flex: 2 },
  { key: "SKU VU", label: "SKU VU", flex: 2 },
  { key: "Shop name", label: "Shop Name", flex: 2 },
  { key: "Product title", label: "Product Title", flex: 3 },
  { key: "Price", label: "Price", flex: 1.5, numeric: true },
  { key: "Discount price", label: "Disc. Price", flex: 1.5, numeric: true },
  { key: "% discount", label: "% Disc", flex: 1, center: true },
  { key: "Country", label: "Country", flex: 1, center: true },
];

export const ALL_COLUMN_KEYS = CAMPAIGN_COLUMNS.map((c) => c.key);

// ── Katana ────────────────────────────────────────────────────────────────────

export interface KatanaRow {
  Sku: string;
  [key: string]: string | number | null | undefined;
}

export const KATANA_LANG_COLUMNS = [
  { key: "Name_en", label: "English (EN)" },
  { key: "Name_nl", label: "Dutch (NL)" },
  { key: "Name_FR", label: "French (FR)" },
  { key: "Name_ES", label: "Spanish (ES)" },
  { key: "Name_IT", label: "Italian (IT)" },
  { key: "Name_DE", label: "German (DE)" },
  { key: "Name_PT", label: "Portuguese (PT)" },
  { key: "Name_PL", label: "Polish (PL)" },
] as const;

export type KatanaLangKey = (typeof KATANA_LANG_COLUMNS)[number]["key"];
