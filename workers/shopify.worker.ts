/* eslint-disable no-restricted-globals */

// ── Worker scope typing ──────────────────────────────────────────────────────
interface WorkerSelf {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}
const ctx = self as unknown as WorkerSelf;

// ── Helpers ──────────────────────────────────────────────────────────────────

/** European number format: "1.234,56" → 1234.56 */
function parseNum(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const s = String(val).trim();
  if (s === "") return null;
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/** Extract discount % from Class_09Description */
function extractDiscount(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (s.toUpperCase() === "NO" || s === "") return null;
  const m = s.match(/(\d+(?:\.\d+)?)%/);
  return m ? parseFloat(m[1]) : null;
}

/** Parse DD-MM-YYYY → Date */
function parseDMY(val: unknown): Date | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  const parts = s.split("-");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y) return null;
  const dt = new Date(y, m - 1, d);
  return isNaN(dt.getTime()) ? null : dt;
}

/** Send progress to main thread */
function progress(step: string, pct: number, message: string) {
  ctx.postMessage({ type: "progress", step, progress: pct, message });
}

type Row = Record<string, unknown>;

// ── Main processing ──────────────────────────────────────────────────────────
ctx.onmessage = (e: MessageEvent) => {
  const { files } = e.data as {
    files: Record<string, Record<string, unknown>[]>;
  };

  try {
    // ── Use pre-parsed rows from main thread ───────────────────────────
    progress("Loading", 10, "Reading parsed data...");
    const shopifyRows: Row[] = files.shopify;
    const salesRows: Row[] = files.sales;
    const stockRows: Row[] = files.stock;
    const purchaseRows: Row[] = files.purchase;
    const itemRows: Row[] = files.items;

    progress("Loading", 30, "All files loaded");

    // ── STEP 1: Sales Orders ───────────────────────────────────────────
    progress("Sales Orders", 35, "Processing sales orders...");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const unpaidSkus = new Set<string>();
    const refMap = new Map<string, string>();
    const refDateMap = new Map<string, number>();

    for (const row of salesRows) {
      const item = String(row["Item"] ?? "").trim();
      if (item === "") continue;

      const ref = String(row["Reference"] ?? "");
      const isPaid = ref.toUpperCase().includes("PAID");

      if (!isPaid) {
        unpaidSkus.add(item);
      }

      const orderDate = parseDMY(row["Order date"]);
      if (orderDate) {
        const ts = orderDate.getTime();
        const existing = refDateMap.get(item);
        if (existing === undefined || ts > existing) {
          refDateMap.set(item, ts);
          refMap.set(item, ref);
        }
      }
    }

    progress("Sales Orders", 45, `Found ${unpaidSkus.size} unpaid SKUs`);

    // ── STEP 2: Stock Positions ────────────────────────────────────────
    progress("Stock", 50, "Processing stock positions...");

    const plannedMap = new Map<string, number>();
    for (const row of stockRows) {
      const code = String(row["ItemCode"] ?? "").trim();
      const planned = parseNum(row["PlannedInStock"]);
      if (code && planned !== null) {
        plannedMap.set(code, planned);
      }
    }

    // ── STEP 3: Purchase Orders ────────────────────────────────────────
    progress("Purchase Orders", 55, "Processing purchase orders...");

    const etaMap = new Map<string, Date>();
    for (const row of purchaseRows) {
      const item = String(row["Item"] ?? "").trim();
      if (!item) continue;

      const receiptDate = parseDMY(row["Receipt date"]);
      if (!receiptDate || receiptDate < today) continue;

      const existing = etaMap.get(item);
      if (!existing || receiptDate < existing) {
        etaMap.set(item, receiptDate);
      }
    }

    progress("Purchase Orders", 65, `Found ${etaMap.size} SKUs with future ETA`);

    // ── STEP 4: Item Pricing ───────────────────────────────────────────
    progress("Items", 70, "Processing item pricing...");

    interface ItemInfo {
      priceOut: number | null;
      compareOut: number | null;
      discountPct: number | null;
      salesNum: number | null;
    }
    const itemMap = new Map<string, ItemInfo>();

    for (const row of itemRows) {
      const code = String(row["Code"] ?? "").trim();
      if (!code) continue;

      const retailNum = parseNum(row["Extra field:  Retail Price EUR"]);
      const salesNum = parseNum(row["SalesPrice"]);
      const discountPct = extractDiscount(row["Class_09Description"]);

      let priceOut: number | null;
      let compareOut: number | null;

      if (discountPct !== null && retailNum !== null) {
        priceOut = Math.round(retailNum * (1 - discountPct / 100) * 100) / 100;
        compareOut = retailNum;
      } else {
        priceOut = retailNum;
        compareOut = null;
      }

      itemMap.set(code, { priceOut, compareOut, discountPct, salesNum });
    }

    progress("Items", 80, `Processed ${itemMap.size} items`);

    // ── STEP 5: Shopify Variants ───────────────────────────────────────
    progress("Shopify", 85, "Building output...");

    const etaCol = "ETA (product.metafields.custom.eta)";
    const output: Record<string, unknown>[] = [];

    for (const row of shopifyRows) {
      const skuRaw = row["Variant SKU"];
      if (skuRaw === null || skuRaw === undefined || String(skuRaw).trim() === "")
        continue;

      const sku = String(skuRaw).trim();
      const qtyRaw = row["Variant Inventory Qty"];
      const qty =
        typeof qtyRaw === "number" ? qtyRaw : parseFloat(String(qtyRaw)) || 0;
      const planned = plannedMap.get(sku) ?? 0;

      // GOAL 1 — Status
      let status: "active" | "draft";
      if (qty >= 1) {
        status = "active";
      } else if (qty + planned > 0) {
        status = "active";
      } else if (unpaidSkus.has(sku)) {
        status = "active";
      } else {
        status = "draft";
      }

      // GOAL 2 — Inventory Policy
      const policy: "continue" | "deny" =
        status === "active" && qty <= 0 ? "continue" : "deny";
      const published = status === "active" ? "TRUE" : "FALSE";

      // GOAL 3 — ETA
      const etaDate = etaMap.get(sku);
      let etaFromPo: string | null = null;
      if (etaDate) {
        const dd = String(etaDate.getDate()).padStart(2, "0");
        const mm = String(etaDate.getMonth() + 1).padStart(2, "0");
        const yyyy = etaDate.getFullYear();
        etaFromPo = `${dd}/${mm}/${yyyy}`;
      }
      const existingEta = row[etaCol] ? String(row[etaCol]).trim() : null;
      const etaFinal =
        etaFromPo ?? (existingEta && existingEta !== "" ? existingEta : null);

      // GOAL 4 — Pricing
      const itemInfo = itemMap.get(sku);
      let variantPrice: number | null;
      let compareAtPrice: number | null;
      let discountPct: number | null;
      let costPerItem: number | null;

      if (itemInfo) {
        variantPrice = itemInfo.priceOut;
        compareAtPrice = itemInfo.compareOut;
        discountPct = itemInfo.discountPct;
        costPerItem = itemInfo.salesNum;
      } else {
        variantPrice = parseNum(row["Variant Price"]);
        compareAtPrice = parseNum(row["Variant Compare At Price"]);
        discountPct = null;
        costPerItem = null;
      }

      const reference = refMap.get(sku) ?? null;

      output.push({
        Title: String(row["Title"] ?? ""),
        "Variant SKU": sku,
        "Variant Quantity": qty,
        Status: status,
        Published: published,
        "Variant Price": variantPrice,
        "Variant Compare at Price": compareAtPrice,
        ETA: etaFinal,
        "Variant Inventory Policy": policy,
        PlannedInStock: planned,
        "Discount %": discountPct,
        "Cost per item": costPerItem,
        Reference: reference,
      });
    }

    // ── Summary ────────────────────────────────────────────────────────
    const summary = {
      total: output.length,
      active: output.filter((r) => r.Status === "active").length,
      draft: output.filter((r) => r.Status === "draft").length,
      continueCount: output.filter(
        (r) => r["Variant Inventory Policy"] === "continue"
      ).length,
      deny: output.filter((r) => r["Variant Inventory Policy"] === "deny")
        .length,
      etaFilled: output.filter(
        (r) => r.ETA !== null && r.ETA !== ""
      ).length,
      hasDiscount: output.filter((r) => r["Discount %"] !== null).length,
      costFilled: output.filter((r) => r["Cost per item"] !== null).length,
      referenceFilled: output.filter(
        (r) => r.Reference !== null && r.Reference !== ""
      ).length,
    };

    progress("Complete", 100, "Processing complete!");
    ctx.postMessage({ type: "result", data: output, summary });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.postMessage({ type: "error", message });
  }
};

export {};
