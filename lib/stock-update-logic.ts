import { parseFileBuffer, parseNum } from "./parsers";

export interface StockUpdateOutputRow {
  No: number;
  SKU: string;
  EAN: string;
  Qty: number | string;
  ETA: string;
  StockAwal: number | string;
  PlannedIn: number | string;
  PlannedOut: number | string;
  ETAAsli: string;
}

/** 
 * Returns the exact entry if found, otherwise all entries whose key starts with
 * `key + "-"` (handles size-variant SKUs like BA037N-M-40x30 matching BA037N-M).
 */
function lookupWithSizeFallback<T>(map: Map<string, T>, key: string): T[] {
  const exact = map.get(key);
  if (exact !== undefined) return [exact];
  const prefix = key + "-";
  const results: T[] = [];
  for (const [k, v] of map.entries()) {
    if (k.startsWith(prefix)) results.push(v);
  }
  return results;
}

type StockPos = { stock: number; plannedIn: number; plannedOut: number; effectiveStock: number; showETA: boolean };

function aggregateStockPos(matches: StockPos[]): StockPos {
  if (matches.length === 0) return { stock: 0, plannedIn: 0, plannedOut: 0, effectiveStock: 0, showETA: false };
  if (matches.length === 1) return matches[0]!;
  const stock = matches.reduce((s, m) => s + m.stock, 0);
  const plannedIn = matches.reduce((s, m) => s + m.plannedIn, 0);
  const plannedOut = matches.reduce((s, m) => s + m.plannedOut, 0);
  return {
    stock,
    plannedIn,
    plannedOut,
    effectiveStock: Math.max(0, stock - plannedOut),
    showETA: matches.some(m => m.showETA),
  };
}

type PoEntry = { latestDate: Date | null; rawLatestStr: string };

function aggregatePo(matches: PoEntry[]): PoEntry | undefined {
  if (matches.length === 0) return undefined;
  if (matches.length === 1) return matches[0];
  let latest: Date | null = null;
  let latestStr = "-";
  for (const m of matches) {
    if (m.latestDate && (!latest || m.latestDate > latest)) {
      latest = m.latestDate;
      latestStr = m.rawLatestStr;
    }
  }
  return { latestDate: latest, rawLatestStr: latestStr };
}

function parseStockNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  const s = String(val).trim();
  if (s === "" || s === "-") return 0;
  const normalized = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : Math.round(n); // As per requirement: must be integers
}

function parseDateValue(val: unknown): Date | null {
  if (!val) return null;
  const str = String(val).trim();
  if (!str) return null;

  // Handle dd-mm-yyyy or dd/mm/yyyy
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  }
  // Handle yyyy-mm-dd or yyyy/mm/dd
  const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymdMatch) {
    const [, y, m, d] = ymdMatch;
    return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
  }
  
  // Try JS standard parser
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) return parsed;
  return null;
}

function formatDateDisplay(d: Date | null): string {
  if (!d || isNaN(d.getTime())) return "-";
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export async function processStockUpdateData(
  stockPosBuffer: ArrayBuffer,
  poBuffer: ArrayBuffer,
  stockUpdateBuffer: ArrayBuffer
): Promise<StockUpdateOutputRow[]> {
  // Parse buffers
  const stockPosRaw = await parseFileBuffer(stockPosBuffer);
  const poRaw = await parseFileBuffer(poBuffer);
  const stockUpdateRaw = await parseFileBuffer(stockUpdateBuffer);

  // 1. Process Stock Position
  const stockPositions = new Map<string, {
    stock: number;
    plannedIn: number;
    plannedOut: number;
    effectiveStock: number;
    showETA: boolean;
  }>();

  for (const row of stockPosRaw) {
    const itemCode = String(row["ItemCode"] ?? row["Code"] ?? "").trim();
    if (!itemCode) continue;

    const stock = parseStockNum(row["Stock"]);
    const plannedIn = parseStockNum(row["PlannedInStock"]);
    const plannedOut = parseStockNum(row["PlannedOutStock"]);

    const effectiveStock = Math.max(0, stock - plannedOut);
    const showETA = stock === 0 && plannedIn > 0;

    stockPositions.set(itemCode, {
      stock,
      plannedIn,
      plannedOut,
      effectiveStock,
      showETA,
    });
  }

  // 2. Process Purchase Orders
  const purchaseOrders = new Map<string, { latestDate: Date | null; rawLatestStr: string }>();

  for (const row of poRaw) {
    const item = String(row["Item"] ?? "").trim();
    if (!item) continue;

    const receiptDateStr = String(row["Receipt date"] ?? "").trim();
    const parsedDate = parseDateValue(receiptDateStr);

    const existing = purchaseOrders.get(item);
    if (!existing) {
      if (parsedDate) {
        purchaseOrders.set(item, { latestDate: parsedDate, rawLatestStr: receiptDateStr });
      }
    } else if (parsedDate && existing.latestDate && parsedDate > existing.latestDate) {
      purchaseOrders.set(item, { latestDate: parsedDate, rawLatestStr: receiptDateStr });
    }
  }

  // 3. Process Stock Update output
  const output: StockUpdateOutputRow[] = [];
  let rowIndex = 1;

  for (const row of stockUpdateRaw) {
    const sku = String(row["SKU"] ?? row["Variant SKU"] ?? row["ItemCode"] ?? "").trim();
    if (!sku) continue; // skip empty rows

    const ean = String(row["EAN"] ?? row["Barcode"] ?? "").trim();

    if (sku.startsWith("ASM-")) {
      // ASM case
      const noPrefix = sku.substring(4); // Remove "ASM-"
      const components = noPrefix.split("_").map(c => c.trim()).filter(Boolean);
      
      let minQty = Infinity;
      const componentEtas: { d: Date | null; showEta: boolean; raw: string }[] = [];
      const stockAwalVals: number[] = [];
      const plannedInVals: number[] = [];
      const plannedOutVals: number[] = [];
      const etaAsliVals: string[] = [];

      let anyShowEta = false;
      let allHavePo = true;

      for (const compSku of components) {
        const pos = aggregateStockPos(lookupWithSizeFallback(stockPositions, compSku));
        const po = aggregatePo(lookupWithSizeFallback(purchaseOrders, compSku));

        stockAwalVals.push(pos.stock);
        plannedInVals.push(pos.plannedIn);
        plannedOutVals.push(pos.plannedOut);

        if (pos.effectiveStock < minQty) {
          minQty = pos.effectiveStock;
        }

        if (pos.showETA) anyShowEta = true;
        if (!po || !po.latestDate) allHavePo = false;

        componentEtas.push({
          d: po?.latestDate ?? null,
          showEta: pos.showETA,
          raw: po?.rawLatestStr ?? "-"
        });

        etaAsliVals.push(po?.rawLatestStr ?? "-");
      }

      if (minQty === Infinity) minQty = 0;

      let asmEta = "-";
      if (anyShowEta && allHavePo) {
        let earliestDate: Date | null = null;
        for (const meta of componentEtas) {
          if (meta.d) {
            if (!earliestDate || meta.d < earliestDate) {
              earliestDate = meta.d;
            }
          }
        }
        asmEta = earliestDate ? formatDateDisplay(earliestDate) : "-";
      }

      output.push({
        No: rowIndex++,
        SKU: sku,
        EAN: ean,
        Qty: minQty,
        ETA: asmEta,
        StockAwal: stockAwalVals.join(" & "),
        PlannedIn: plannedInVals.join(" & "),
        PlannedOut: plannedOutVals.join(" & "),
        ETAAsli: etaAsliVals.map(val => {
          const pd = parseDateValue(val);
          return pd ? formatDateDisplay(pd) : "-";
        }).join(" & "),
      });

    } else {
      // Normal SKU case
      const pos = aggregateStockPos(lookupWithSizeFallback(stockPositions, sku));
      const po = aggregatePo(lookupWithSizeFallback(purchaseOrders, sku));

      let normalEta = "-";
      if (pos.showETA && po && po.latestDate) {
        normalEta = formatDateDisplay(po.latestDate);
      }

      output.push({
        No: rowIndex++,
        SKU: sku,
        EAN: ean,
        Qty: pos.effectiveStock,
        ETA: normalEta,
        StockAwal: pos.stock,
        PlannedIn: pos.plannedIn,
        PlannedOut: pos.plannedOut,
        ETAAsli: po?.latestDate ? formatDateDisplay(po.latestDate) : "-",
      });
    }
  }

  return output;
}
