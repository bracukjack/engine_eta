import Papa from "papaparse";
import type { Config, DiscountRow, StockRow, OfferRow, LogRow, KatanaRow, CampaignOfferRow } from "./types";

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

function buildKatanaLookup(
  katanaRows: KatanaRow[],
  langCol: string
): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of katanaRows) {
    const sku = String(r.Sku ?? "").trim();
    if (!sku) continue;
    const name = String(r[langCol] ?? "").trim();
    if (name) map.set(sku, name);
  }
  return map;
}

function buildOutputRows(
  enriched: ReturnType<typeof enrichWithPrice>,
  config: Config,
  katanaMap: Map<string, string> | null
): CampaignOfferRow[] {
  return enriched
    .filter((r) => r.retailPrice !== null)
    .map((r) => {
      const sku = String(r.SKU).trim();
      // Prefer Katana name; fall back to offers Product column
      const productTitle =
        (katanaMap && katanaMap.get(sku)) ||
        String(r.offer!.Product ?? "").trim();

      return {
        EAN: String(r.GTIN ?? "").trim(),
        "SKU VU": String(r.offer!["Product SKU"] ?? "").trim(),
        "Shop name": config.shopName,
        "Product title": productTitle,
        Price: r.retailPrice!,
        "Discount price": calcDiscountPrice(r.retailPrice!, r.DISC),
        "% discount": formatDiscPct(r.DISC),
        Country: config.country,
      };
    });
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
  logBuffer: ArrayBuffer,
  katanaBuffer?: ArrayBuffer | null,
  katanaLangCol?: string | null
): ProcessResult {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const XLSX = require("xlsx") as typeof import("xlsx");

  // Parse discount list (Excel)
  const discWb = XLSX.read(discBuffer, { type: "array" });
  const disc = XLSX.utils.sheet_to_json<DiscountRow>(
    discWb.Sheets[discWb.SheetNames[0]]
  );

  // Decode CSVs
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

  // Optional: parse Katana file and build name lookup
  let katanaMap: Map<string, string> | null = null;
  if (katanaBuffer && katanaLangCol) {
    const katanaWb = XLSX.read(katanaBuffer, { type: "array" });
    const katanaRows = XLSX.utils.sheet_to_json<KatanaRow>(
      katanaWb.Sheets[katanaWb.SheetNames[0]]
    );
    katanaMap = buildKatanaLookup(katanaRows, katanaLangCol);
  }

  const stockMap = filterPositiveStock(stock);
  const matched = matchOffers(disc, stockMap, offers);
  const enriched = enrichWithPrice(matched, log);
  const rows = buildOutputRows(enriched, config, katanaMap);

  return {
    rows,
    matched: matched.length,
    skipped: disc.length - matched.length,
  };
}
