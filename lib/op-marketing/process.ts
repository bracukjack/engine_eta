import Papa from "papaparse";
import type { Config, DiscountRow, StockRow, OfferRow, LogRow, CampaignOfferRow } from "./types";

function filterPositiveStock(rows: StockRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    const stock = Number(r.Stock) || 0;
    const planned = Number(r.PlannedOutStock) || 0;
    const real = stock - planned;
    if (real > 0) map.set(String(r.ItemCode).trim(), real);
  }
  return map;
}

function matchOffers(
  disc: DiscountRow[],
  stockMap: Map<string, number>,
  offers: OfferRow[]
) {
  const offerMap = new Map(offers.map((o) => [String(o["Offer SKU"]).trim(), o]));
  return disc
    .filter((d) => stockMap.has(String(d.SKU).trim()))
    .map((d) => ({ ...d, offer: offerMap.get(String(d.SKU).trim()) }))
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
  // Handle "40%" format
  if (s.endsWith("%")) {
    return parseFloat(s.replace("%", "")) / 100;
  }
  // Handle "0.40" format
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

function buildOutputRows(
  enriched: ReturnType<typeof enrichWithPrice>,
  config: Config
): CampaignOfferRow[] {
  return enriched
    .filter((r) => r.retailPrice !== null)
    .map((r) => ({
      EAN: String(r.GTIN ?? "").trim(),
      "SKU VU": String(r.offer!["Product SKU"] ?? "").trim(),
      "Shop name": config.shopName,
      "Product title": String(r.offer!.Product ?? "").trim(),
      Price: r.retailPrice!,
      "Discount price": calcDiscountPrice(r.retailPrice!, r.DISC),
      "% discount": formatDiscPct(r.DISC),
      Country: config.country,
    }));
}

export interface ProcessResult {
  rows: CampaignOfferRow[];
  skipped: number;
  matched: number;
}

export function processCampaignOffers(
  config: Config,
  discBuffer: ArrayBuffer,
  stockBuffer: ArrayBuffer,
  offersBuffer: ArrayBuffer,
  logBuffer: ArrayBuffer
): ProcessResult {
  // Dynamic import of xlsx — resolved at call time (client bundle includes it)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require("xlsx") as typeof import("xlsx");

  // Parse discount list (Excel)
  const discWb = XLSX.read(discBuffer, { type: "array" });
  const disc = XLSX.utils.sheet_to_json<DiscountRow>(
    discWb.Sheets[discWb.SheetNames[0]]
  );

  // Decode CSVs: stock & log are UTF-16, offers is UTF-8 with ';' delimiter
  const stockText = new TextDecoder("utf-16").decode(stockBuffer);
  const offersText = new TextDecoder("utf-8").decode(offersBuffer);
  const logText = new TextDecoder("utf-16").decode(logBuffer);

  const stock = Papa.parse<StockRow>(stockText, {
    header: true,
    skipEmptyLines: true,
  }).data;

  const offers = Papa.parse<OfferRow>(offersText, {
    header: true,
    skipEmptyLines: true,
    delimiter: ";",
  }).data;

  const log = Papa.parse<LogRow>(logText, {
    header: true,
    skipEmptyLines: true,
  }).data;

  const stockMap = filterPositiveStock(stock);
  const matched = matchOffers(disc, stockMap, offers);
  const enriched = enrichWithPrice(matched, log);
  const rows = buildOutputRows(enriched, config);

  return {
    rows,
    matched: matched.length,
    skipped: disc.length - matched.length,
  };
}
