import Papa from "papaparse";
import type {
  Config, DiscountRow, StockRow, OfferRow, LogRow, KatanaRow, CampaignOfferRow,
} from "./types";
import { langCodeToTitleKey } from "./types";

interface StockInfo {
  stock: number;
  plannedOut: number;
  realStock: number;
}

function buildStockMap(rows: StockRow[], minStock: number): Map<string, StockInfo> {
  const map = new Map<string, StockInfo>();
  for (const r of rows) {
    const stock = Number(r.Stock) || 0;
    const plannedOut = Number(r.PlannedOutStock) || 0;
    const realStock = stock - plannedOut;
    if (realStock >= minStock) {
      map.set(String(r.ItemCode).trim(), { stock, plannedOut, realStock });
    }
  }
  return map;
}

function matchOffers(
  disc: DiscountRow[],
  stockMap: Map<string, StockInfo>,
  offers: OfferRow[]
) {
  const offerMap = new Map(offers.map((o) => [String(o["Offer SKU"]).trim(), o]));
  return disc
    .filter((d) => stockMap.has(String(d.SKU).trim()))
    .map((d) => ({
      ...d,
      offer: offerMap.get(String(d.SKU).trim()),
      stockInfo: stockMap.get(String(d.SKU).trim())!,
    }))
    .filter((d) => d.offer !== undefined);
}

function enrichWithPrice(
  matched: ReturnType<typeof matchOffers>,
  log: LogRow[]
) {
  const priceMap = new Map<string, number>();
  for (const l of log) {
    const raw = String(l["Extra field:  Retail Price EUR"] ?? "")
      .trim()
      .replace(",", ".");
    const val = parseFloat(raw);
    if (!isNaN(val)) priceMap.set(String(l.Code).trim(), val);
  }
  return matched.map((r) => ({
    ...r,
    retailPrice: priceMap.get(String(r.SKU).trim()) ?? null,
  }));
}

function parseDisc(disc: string): number {
  const s = String(disc).trim();
  if (s.endsWith("%")) return parseFloat(s.replace("%", "")) / 100;
  const n = parseFloat(s);
  if (!isNaN(n) && n > 0 && n < 1) return n;
  if (!isNaN(n) && n >= 1) return n / 100;
  return 0;
}

function calcDiscountPrice(retailPrice: number, disc: string): number {
  const pct = parseDisc(disc);
  return Math.round(retailPrice * (1 - pct) * 100) / 100;
}

function formatDiscPct(disc: string): string {
  const s = String(disc).trim();
  if (s.endsWith("%")) return s;
  const n = parseFloat(s);
  if (!isNaN(n) && n > 0 && n < 1) return `${Math.round(n * 100)}%`;
  if (!isNaN(n)) return `${Math.round(n)}%`;
  return s;
}

// Build a map: sku → { langKey → productName }
function buildKatanaMultiLookup(
  katanaRows: KatanaRow[],
  langs: string[]
): Map<string, Record<string, string>> {
  const map = new Map<string, Record<string, string>>();
  for (const r of katanaRows) {
    const sku = String(r.Sku ?? "").trim();
    if (!sku) continue;
    const names: Record<string, string> = {};
    for (const lang of langs) {
      const name = String(r[lang] ?? "").trim();
      if (name) names[lang] = name;
    }
    if (Object.keys(names).length > 0) map.set(sku, names);
  }
  return map;
}

function buildOutputRows(
  enriched: ReturnType<typeof enrichWithPrice>,
  config: Config,
  katanaMap: Map<string, Record<string, string>> | null,
  selectedLangs: string[]
): CampaignOfferRow[] {
  return enriched
    .filter((r) => r.retailPrice !== null)
    .map((r): CampaignOfferRow => {
      const sku = String(r.SKU).trim();
      const fallbackTitle = String(r.offer!.Product ?? "").trim();

      // Build title columns
      const titleEntries: Record<string, string> = {};
      if (selectedLangs.length === 0 || !katanaMap) {
        // No Katana / no lang selected → single "Product title" from offers
        titleEntries["Product title"] = fallbackTitle;
      } else {
        // One column per selected language
        const katanaNames = katanaMap.get(sku) ?? {};
        for (const lang of selectedLangs) {
          const colKey = langCodeToTitleKey(lang);
          titleEntries[colKey] = katanaNames[lang] || fallbackTitle;
        }
      }

      return {
        EAN: String(r.GTIN ?? "").trim(),
        "SKU VU": String(r.offer!["Product SKU"] ?? "").trim(),
        "Shop name": config.shopName,
        ...titleEntries,
        Price: r.retailPrice!,
        "Discount price": calcDiscountPrice(r.retailPrice!, r.DISC),
        "% discount": formatDiscPct(r.DISC),
        Country: config.country,
        Stock: r.stockInfo.stock,
        "Planned Out": r.stockInfo.plannedOut,
        "Real Stock": r.stockInfo.realStock,
      };
    });
}

export interface ProcessResult {
  rows: CampaignOfferRow[];
  matched: number;
  skipped: number;
  /** Ordered column keys for the rows produced by this run */
  columnKeys: string[];
}

export function processCampaignOffers(
  config: Config,
  discBuffer: ArrayBuffer,
  stockBuffer: ArrayBuffer,
  offersBuffer: ArrayBuffer,
  logBuffer: ArrayBuffer,
  katanaBuffer?: ArrayBuffer | null,
  selectedLangs?: string[] | null,
  minStock = 1
): ProcessResult {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require("xlsx") as typeof import("xlsx");

  const discWb = XLSX.read(discBuffer, { type: "array" });
  const disc = XLSX.utils.sheet_to_json<DiscountRow>(
    discWb.Sheets[discWb.SheetNames[0]]
  );

  const stockText = new TextDecoder("utf-16").decode(stockBuffer);
  const offersText = new TextDecoder("utf-8").decode(offersBuffer);
  const logText = new TextDecoder("utf-16").decode(logBuffer);

  const stock = Papa.parse<StockRow>(stockText, { header: true, skipEmptyLines: true }).data;
  const offers = Papa.parse<OfferRow>(offersText, {
    header: true, skipEmptyLines: true, delimiter: ";",
  }).data;
  const log = Papa.parse<LogRow>(logText, { header: true, skipEmptyLines: true }).data;

  const langs = katanaBuffer && selectedLangs && selectedLangs.length > 0
    ? selectedLangs
    : [];

  let katanaMap: Map<string, Record<string, string>> | null = null;
  if (katanaBuffer && langs.length > 0) {
    const katanaWb = XLSX.read(katanaBuffer, { type: "array" });
    const katanaRows = XLSX.utils.sheet_to_json<KatanaRow>(
      katanaWb.Sheets[katanaWb.SheetNames[0]]
    );
    katanaMap = buildKatanaMultiLookup(katanaRows, langs);
  }

  const stockMap = buildStockMap(stock, minStock);
  const matched = matchOffers(disc, stockMap, offers);
  const enriched = enrichWithPrice(matched, log);
  const rows = buildOutputRows(enriched, config, katanaMap, langs);

  // Derive the column key order from first row (preserves insertion order)
  const columnKeys = rows.length > 0 ? Object.keys(rows[0]) : [];

  return { rows, matched: matched.length, skipped: disc.length - matched.length, columnKeys };
}
