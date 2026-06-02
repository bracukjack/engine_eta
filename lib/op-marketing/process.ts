import Papa from "papaparse";
import type {
  Config, StockRow, OfferRow, LogRow, KatanaRow, CampaignOfferRow,
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

function validateColumns(
  rows: Record<string, unknown>[],
  required: string[],
  fileLabel: string
): void {
  if (rows.length === 0) {
    throw new Error(`${fileLabel}: file is empty or could not be parsed.`);
  }
  const headers = Object.keys(rows[0]);
  const missing = required.filter((col) => !headers.includes(col));
  if (missing.length > 0) {
    throw new Error(
      `${fileLabel}: missing required column${missing.length > 1 ? "s" : ""}: ${missing.map((c) => `"${c}"`).join(", ")}\n` +
      `Found columns: ${headers.map((c) => `"${c}"`).join(", ")}`
    );
  }
}

export interface ProcessResult {
  rows: CampaignOfferRow[];
  matched: number;
  skipped: number;
  columnKeys: string[];
}

export function processCampaignOffers(
  config: Config,
  stockBuffer: ArrayBuffer,
  offersBuffer: ArrayBuffer,
  logBuffer: ArrayBuffer,
  katanaBuffer?: ArrayBuffer | null,
  selectedLangs?: string[] | null,
  minStock = 1
): ProcessResult {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require("xlsx") as typeof import("xlsx");

  const stockText = new TextDecoder("utf-16").decode(stockBuffer);
  const offersText = new TextDecoder("utf-8").decode(offersBuffer);
  const logText = new TextDecoder("utf-16").decode(logBuffer);

  const stock = Papa.parse<StockRow>(stockText, { header: true, skipEmptyLines: true }).data;
  validateColumns(stock as Record<string, unknown>[], ["ItemCode", "Stock", "PlannedOutStock"], "Stock CSV (UTF-16)");

  const offers = Papa.parse<OfferRow>(offersText, {
    header: true, skipEmptyLines: true, delimiter: ";",
  }).data;
  validateColumns(offers as Record<string, unknown>[], ["Offer SKU", "Product SKU", "Product"], "Offers CSV");

  const log = Papa.parse<LogRow>(logText, { header: true, skipEmptyLines: true }).data;
  validateColumns(log as Record<string, unknown>[], [
    "Code", "Barcode", "Class_09Description", "Extra field:  Retail Price EUR",
  ], "Item Log CSV (UTF-16)");

  const langs = katanaBuffer && selectedLangs && selectedLangs.length > 0 ? selectedLangs : [];
  let katanaMap: Map<string, Record<string, string>> | null = null;
  if (katanaBuffer && langs.length > 0) {
    const katanaWb = XLSX.read(katanaBuffer, { type: "array" });
    const katanaRows = XLSX.utils.sheet_to_json<KatanaRow>(
      katanaWb.Sheets[katanaWb.SheetNames[0]]
    );
    katanaMap = buildKatanaMultiLookup(katanaRows, langs);
  }

  const stockMap = buildStockMap(stock, minStock);
  const offerMap = new Map(offers.map((o) => [String(o["Offer SKU"]).trim(), o]));

  const rows: CampaignOfferRow[] = [];
  let matched = 0;

  for (const logRow of log) {
    const sku = String(logRow.Code).trim();
    const stockInfo = stockMap.get(sku);
    const offer = offerMap.get(sku);

    const rawPrice = String(logRow["Extra field:  Retail Price EUR"] ?? "").trim().replace(",", ".");
    const retailPrice = parseFloat(rawPrice);

    if (!stockInfo || !offer || isNaN(retailPrice)) continue;

    matched++;
    const disc = String(logRow.Class_09Description ?? "").trim();
    const fallbackTitle = String(offer.Product ?? "").trim();

    const titleEntries: Record<string, string> = {};
    if (langs.length === 0 || !katanaMap) {
      titleEntries["Product title"] = fallbackTitle;
    } else {
      const katanaNames = katanaMap.get(sku) ?? {};
      for (const lang of langs) {
        const colKey = langCodeToTitleKey(lang);
        titleEntries[colKey] = katanaNames[lang] || fallbackTitle;
      }
    }

    rows.push({
      EAN: String(logRow.Barcode ?? "").trim(),
      "SKU VU": String(offer["Product SKU"] ?? "").trim(),
      "Shop name": config.shopName,
      ...titleEntries,
      Price: retailPrice,
      "Discount price": calcDiscountPrice(retailPrice, disc),
      "% discount": formatDiscPct(disc),
      Country: config.country,
      Stock: stockInfo.stock,
      "Planned Out": stockInfo.plannedOut,
      "Real Stock": stockInfo.realStock,
    });
  }

  const columnKeys = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { rows, matched, skipped: log.length - matched, columnKeys };
}
