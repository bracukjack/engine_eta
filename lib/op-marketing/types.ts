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

// Dynamic row — "Product title" or "Product title (XX)" columns are added at runtime
export type CampaignOfferRow = {
  EAN: string;
  "SKU VU": string;
  "Shop name": string;
  Price: number;
  "Discount price": number;
  "% discount": string;
  Country: string;
  [key: string]: string | number; // holds "Product title" or "Product title (EN)" etc.
};

// ── Column definition ─────────────────────────────────────────────────────────

export interface ColDef {
  key: string;
  label: string;
  flex: number;
  numeric?: boolean;  // price columns → toFixed(2) with comma decimal
  integer?: boolean;  // count columns → plain integer, no separator
  center?: boolean;
}

const FIXED_LEFT: ColDef[] = [
  { key: "EAN", label: "EAN", flex: 2 },
  { key: "SKU VU", label: "SKU VU", flex: 2 },
  { key: "Shop name", label: "Shop Name", flex: 2 },
];

const FIXED_RIGHT: ColDef[] = [
  { key: "Price", label: "Price", flex: 1.5, numeric: true },
  { key: "Discount price", label: "Disc. Price", flex: 1.5, numeric: true },
  { key: "% discount", label: "% Disc", flex: 1, center: true },
  { key: "Country", label: "Country", flex: 1, center: true },
  { key: "Stock", label: "Stock", flex: 1, integer: true },
  { key: "Planned Out", label: "Plan Out", flex: 1, integer: true },
  { key: "Real Stock", label: "Real Stock", flex: 1.2, integer: true },
];

/**
 * Build column list dynamically.
 * - No langs (or Katana not uploaded) → single "Product title" column
 * - 1+ langs → one "Product title (XX)" column per selected language
 */
export function buildCampaignColumns(selectedLangs: string[]): ColDef[] {
  const titleCols: ColDef[] =
    selectedLangs.length === 0
      ? [{ key: "Product title", label: "Product Title", flex: 3 }]
      : selectedLangs.map((lang) => {
          const code = lang.replace("Name_", "");
          return { key: `Product title (${code})`, label: `Title (${code})`, flex: 2.5 };
        });

  return [...FIXED_LEFT, ...titleCols, ...FIXED_RIGHT];
}

export function langCodeToTitleKey(lang: string): string {
  if (lang === "") return "Product title";
  const code = lang.replace("Name_", "");
  return `Product title (${code})`;
}

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
