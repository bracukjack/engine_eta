/* eslint-disable no-restricted-globals */

// ── Worker scope typing ──────────────────────────────────────────────────────
interface WorkerSelf {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(message: unknown): void;
}
const ctx = self as unknown as WorkerSelf;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Smart number parser matching Python smart_parse_number exactly.
 * Keeps values as strings until here (via PapaParse), then applies:
 *   Rule A: no separators           "32"         → 32
 *   Rule B: dots only               "134.95"     → 134.95 (decimal)
 *                                   "1.234"      → 1234   (3-digit = thousands)
 *                                   "1.234.567"  → 1234567
 *   Rule C: commas only             "54,95"      → 54.95  (EU decimal)
 *                                   "1,234"      → 1234   (3-digit = thousands)
 *   Rule D: both present            last separator wins as decimal
 */
function parseNum(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return isNaN(val) ? null : val;

  let s = String(val).trim().replace(/[\s€$£\u00A0]/g, "");
  if (s === "" || s === "-" || s.toLowerCase() === "n/a") return null;
  if (!/\d/.test(s)) return null;

  const dotCount = (s.match(/\./g) ?? []).length;
  const commaCount = (s.match(/,/g) ?? []).length;

  try {
    if (dotCount === 0 && commaCount === 0) return parseFloat(s);                 // Rule A
    if (dotCount > 0 && commaCount === 0) {                                        // Rule B
      if (dotCount > 1) return parseFloat(s.replace(/\./g, ""));
      return s.split(".").pop()!.length === 3
        ? parseFloat(s.replace(/\./g, ""))
        : parseFloat(s);
    }
    if (commaCount > 0 && dotCount === 0) {                                        // Rule C
      if (commaCount > 1) return parseFloat(s.replace(/,/g, ""));
      return s.split(",").pop()!.length === 3
        ? parseFloat(s.replace(/,/g, ""))
        : parseFloat(s.replace(",", "."));
    }
    // Rule D: both present — last separator is the decimal
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    return lastComma > lastDot
      ? parseFloat(s.replace(/\./g, "").replace(",", "."))  // EU: "1.234,56"
      : parseFloat(s.replace(/,/g, ""));                     // US: "1,234.56"
  } catch {
    return null;
  }
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
    const publishedRows: Row[] = files.published ?? [];

    progress("Loading", 30, "All files loaded");

    // ── STEP 1: Sales Orders ───────────────────────────────────────────
    progress("Sales Orders", 35, "Processing sales orders...");

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const refsMap = new Map<string, string[]>();

    for (const row of salesRows) {
      const item = String(row["Item"] ?? "").trim();
      if (item === "") continue;

      const ref = String(row["Reference"] ?? "").trim();
      if (ref) {
        const existing = refsMap.get(item);
        if (!existing) {
          refsMap.set(item, [ref]);
        } else if (!existing.includes(ref)) {
          existing.push(ref);
        }
      }
    }

    progress("Sales Orders", 45, `Collected references for ${refsMap.size} SKUs`);

    // ── STEP 2: Stock Positions ────────────────────────────────────────
    progress("Stock", 50, "Processing stock positions...");

    const plannedInMap  = new Map<string, number>();
    const plannedOutMap = new Map<string, number>();
    const stockQtyMap   = new Map<string, number>(); // key: lowercase ItemCode
    for (const row of stockRows) {
      const code = String(row["ItemCode"] ?? "").trim();
      if (!code) continue;

      plannedInMap.set(code,  parseNum(row["PlannedInStock"])  ?? 0);
      plannedOutMap.set(code, parseNum(row["PlannedOutStock"]) ?? 0);
      stockQtyMap.set(code.toLowerCase(), parseNum(row["Stock"]) ?? 0);
    }

    // ── STEP 3: Purchase Orders ────────────────────────────────────────
    progress("Purchase Orders", 55, "Processing purchase orders...");

    const poBatchesMap = new Map<string, Array<{ qty: number; date: Date }>>();
    for (const row of purchaseRows) {
      const item = String(row["Item"] ?? "").trim();
      if (!item) continue;

      const receiptDate = parseDMY(row["Receipt date"]);
      // Only keep dates strictly after today (not today itself, not past dates)
      if (!receiptDate || receiptDate <= today) continue;

      const qty = Math.round(parseNum(row["Quantity"]) ?? 0);
      if (qty <= 0) continue;

      const existing = poBatchesMap.get(item);
      if (!existing) {
        poBatchesMap.set(item, [{ qty, date: receiptDate }]);
      } else {
        existing.push({ qty, date: receiptDate });
      }
    }

    // Sort each SKU's batches by receipt date ascending
    for (const batches of poBatchesMap.values()) {
      batches.sort((a, b) => a.date.getTime() - b.date.getTime());
    }

    progress("Purchase Orders", 65, `Found ${poBatchesMap.size} SKUs with future PO batches`);

    // ── STEP 4: Item Pricing ───────────────────────────────────────────
    progress("Items", 70, "Processing item pricing...");

    interface ItemInfo {
      priceOut: number | null;
      compareOut: number | null;
      discountPct: number | null;
      salesNum: number | null;
      costNum: number | null;
    }
    const itemMap = new Map<string, ItemInfo>();
    const itemCodeCasingMap = new Map<string, string>(); // lowercase → original casing from items

    for (const row of itemRows) {
      const code = String(row["Code"] ?? "").trim();
      if (!code) continue;

      itemCodeCasingMap.set(code.toLowerCase(), code);

      const retailNum = parseNum(row["Extra field:  Retail Price EUR"]);
      const salesNum = parseNum(row["SalesPrice"]);
      const costNum = parseNum(row["CostPriceStandard"]);
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

      itemMap.set(code.toLowerCase(), { priceOut, compareOut, discountPct, salesNum, costNum });
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
      const canonicalSku = itemCodeCasingMap.get(sku.toLowerCase()) ?? sku;
      const handle = String(row["Handle"] ?? "").trim();

      // ── GIFTCARD special rule ────────────────────────────────────────
      if (sku.toUpperCase() === "GIFTCARD") {
        const itemInfo = itemMap.get(sku.toLowerCase());
        output.push({
          No: 0,
          Handle: handle,
          Title: String(row["Title"] ?? ""),
          "Variant SKU": canonicalSku,
          "Variant Quantity": 999,
          Status: "active",
          Published: "TRUE",
          "Variant Price": 25,
          "Variant Compare at Price": null,
          ETA: null,
          "Variant Inventory Policy": "deny",
          PlannedInStock: 0,
          PlannedOutStock: 0,
          "Discount %": null,
          "Cost per item": itemInfo?.costNum ?? null,
          "B2B Price": itemInfo?.salesNum ?? null,
          Reference: null,
          B2C: "No" as const,
          Tags: String(row["Tags"] ?? "").trim() || null,
        });
        continue;
      }

      const stockQty   = stockQtyMap.get(sku.toLowerCase()) ?? 0;
      const plannedIn  = plannedInMap.get(sku)  ?? 0;
      const plannedOut = plannedOutMap.get(sku) ?? 0;
      const variantQty = Math.max(0, stockQty - plannedOut);

      // GOAL 1 & 2 — Status + Policy
      let status: "active" | "draft";
      let policy: "continue" | "deny";
      let published: "TRUE" | "FALSE";

      if (variantQty >= 1) {
        status = "active"; published = "TRUE";  policy = "deny";
      } else {
        const total = variantQty + plannedIn;
        if (total >= 1) {
          status = "active"; published = "TRUE";  policy = "continue";
        } else {
          status = "draft";  published = "FALSE"; policy = "deny";
        }
      }

      // GOAL 3 — ETA
      // Simulate cumulative stock flow batch-by-batch to find when stock turns positive.
      // ETA = receipt date of the batch that brings (stock - plannedOut + Σqty) above zero.
      const poBatches = poBatchesMap.get(sku) ?? [];
      let etaFromPo: string | null = null;
      if (poBatches.length > 0) {
        let running = stockQty - plannedOut;
        for (const batch of poBatches) {
          running += batch.qty;
          if (running >= 1) {
            const dd = String(batch.date.getDate()).padStart(2, "0");
            const mm = String(batch.date.getMonth() + 1).padStart(2, "0");
            const yyyy = batch.date.getFullYear();
            etaFromPo = `${dd}/${mm}/${yyyy}`;
            break;
          }
        }
      }
      const existingEtaRaw = row[etaCol] ? String(row[etaCol]).trim() : null;
      // Validate existingEta: only keep if the date is strictly after today.
      // Format expected: DD/MM/YYYY (same format written by this worker).
      let existingEta: string | null = null;
      if (existingEtaRaw) {
        const parts = existingEtaRaw.split("/");
        if (parts.length === 3) {
          const [ed, em, ey] = parts.map(Number);
          if (ed && em && ey) {
            const existingDate = new Date(ey, em - 1, ed);
            if (!isNaN(existingDate.getTime()) && existingDate > today) {
              existingEta = existingEtaRaw;
            }
          }
        }
      }

      // etaFromPo is already null if no batch brought running total above zero.
      // Fall back to existingEta only when there are no PO batches and net stock is positive.
      const netAvailable = stockQty + plannedIn - plannedOut;
      const etaFinal = etaFromPo
        ?? (poBatches.length === 0 && netAvailable > 0 && existingEta ? existingEta : null);

      const itemInfo = itemMap.get(sku.toLowerCase());
      let variantPrice: number | null;
      let compareAtPrice: number | null;
      let discountPct: number | null;
      let costPerItem: number | null;
      let b2bPrice: number | null;

      if (itemInfo) {
        variantPrice = itemInfo.priceOut;
        compareAtPrice = itemInfo.compareOut;
        discountPct = itemInfo.discountPct;
        costPerItem = itemInfo.costNum;
        b2bPrice = itemInfo.salesNum;
      } else {
        variantPrice = parseNum(row["Variant Price"]);
        compareAtPrice = parseNum(row["Variant Compare At Price"]);
        discountPct = null;
        costPerItem = null;
        b2bPrice = null;
      }

      const refs = refsMap.get(sku);
      const reference = refs && refs.length > 0 ? refs.join("\n") : null;

      // ── Tags ─────────────────────────────────────────────────────────
      // Start from existing Shopify tags (separator: ", ")
      const rawTags = String(row["Tags"] ?? "").trim();
      const existingTags = rawTags !== ""
        ? rawTags.split(",").map((t) => {
            const tag = t.trim();
            return /^coming[\s-]soon$/i.test(tag) ? "COMING SOON" : tag;
          }).filter(Boolean)
        : [];
      // Add "Sale" tag only when the product actually has a discount (Discount %).
      // Remove it when there is no discount, even if it was present in the source tags.
      const alreadyHasSaleTag = existingTags.some((t) => t.toLowerCase() === "sale");
      if (discountPct !== null) {
        if (!alreadyHasSaleTag) existingTags.push("Sale");
      } else if (alreadyHasSaleTag) {
        const saleIdx = existingTags.findIndex((t) => t.toLowerCase() === "sale");
        if (saleIdx !== -1) existingTags.splice(saleIdx, 1);
      }
      // "Sale" and "New" are mutually exclusive — "New" is removed when "Sale" is present
      const hasSale = existingTags.some((t) => t.toLowerCase() === "sale");
      const filteredTags = hasSale
        ? existingTags.filter((t) => t.toLowerCase() !== "new")
        : existingTags;

      // PRE-ORDER: add when active + qty ≤ 0 + ETA present; remove when qty > 1
      // - COMING SOON takes priority (new/never-sold product): skip PRE-ORDER if COMING SOON is present
      // - PRE-ORDER and NEW are mutually exclusive: remove NEW when PRE-ORDER is applied
      const preOrderIdx = filteredTags.findIndex((t) => t.toLowerCase() === "pre-order");
      const hasPreOrder = preOrderIdx !== -1;
      const hasComingSoon = filteredTags.some((t) => t.toLowerCase() === "coming soon");

      if (status === "active" && variantQty <= 0 && etaFinal !== null && etaFinal !== "") {
        if (!hasComingSoon) {
          if (!hasPreOrder) filteredTags.push("PRE-ORDER");
          // NEW is mutually exclusive with PRE-ORDER
          const newIdx = filteredTags.findIndex((t) => t.toLowerCase() === "new");
          if (newIdx !== -1) filteredTags.splice(newIdx, 1);
        }
      } else if (variantQty > 1 && hasPreOrder) {
        filteredTags.splice(preOrderIdx, 1);
      }

      const tagsOut = filteredTags.length > 0 ? filteredTags.join(", ") : null;

      output.push({
        No: 0,
        Handle: handle,
        Title: String(row["Title"] ?? ""),
        "Variant SKU": canonicalSku,
        "Variant Quantity": Math.round(variantQty),
        Status: status,
        Published: published,
        "Variant Price": variantPrice,
        "Variant Compare at Price": compareAtPrice,
        ETA: etaFinal,
        "Variant Inventory Policy": policy,
        PlannedInStock: Math.round(plannedIn),
        PlannedOutStock: Math.round(plannedOut),
        "Discount %": discountPct,
        "Cost per item": costPerItem,
        "B2B Price": b2bPrice,
        Reference: reference,
        B2C: "No" as const,
        Tags: tagsOut,
      });
    }

    // ── STEP 6: Published Products B2C Filter (Final Override) ────────
    progress("Published", 91, "Applying B2C published filter...");

    // 6A: Detect SKU column
    function findSkuColumn(headers: string[]): string | null {
      const candidates = [
        "SKU", "Sku", "sku",
        "Variant SKU", "VariantSKU", "variant_sku",
        "ItemCode", "Code", "ProductCode",
        "Barcode",
      ];
      for (const c of candidates) {
        if (headers.includes(c)) return c;
      }
      return headers[0] ?? null;
    }

    const publishedHeaders = publishedRows.length > 0 ? Object.keys(publishedRows[0]) : [];
    const skuColumn = findSkuColumn(publishedHeaders);

    if (skuColumn) {
      progress("Published", 91, `Using SKU column: "${skuColumn}"`);
    }

    progress("Published", 92, "Building B2C SKU set...");

    const b2cSkus = new Set<string>();
    const allChannelsSkus = new Set<string>(); // LimitedToStores empty = all channels active

    if (skuColumn) {
      for (const row of publishedRows) {
        const sku = String(row[skuColumn] ?? "").trim();
        if (sku === "") continue;
        const limitedTo = String(row["LimitedToStores"] ?? "").trim();
        if (limitedTo === "") {
          allChannelsSkus.add(sku);
        } else if (limitedTo.toLowerCase().includes("b2c")) {
          b2cSkus.add(sku);
        }
      }
    }

    progress("Published", 95, `Found ${b2cSkus.size} B2C SKUs, ${allChannelsSkus.size} all-channel SKUs`);

    if (b2cSkus.size === 0 && allChannelsSkus.size === 0) {
      progress("Published", 96, "⚠ No B2C data found — all SKUs will be draft");
    }

    // 6B: Apply B2C override + set informational B2C column
    for (const row of output) {
      const sku = String(row["Variant SKU"]).trim();
      // GIFTCARD is always active — skip B2C override
      if (sku.toUpperCase() === "GIFTCARD") continue;
      if (b2cSkus.has(sku)) {
        // LimitedToStores contains B2C → keep stock-based status, mark as B2C
        row["B2C"] = "Yes";
      } else if (allChannelsSkus.has(sku)) {
        // LimitedToStores empty → all channels active → B2C is included
        row["B2C"] = "Yes";
      } else {
        // Not in published or limited to other stores → force draft
        row["B2C"] = "No";
        row["Status"] = "draft";
        row["Published"] = "FALSE";
        row["Variant Inventory Policy"] = "deny";
      }
    }

    progress("Published", 98, "B2C filter applied");

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
      b2cTotal: b2cSkus.size,
    };

    output.forEach((r, i) => { r.No = i + 1; });

    progress("Complete", 100, "Processing complete!");
    ctx.postMessage({ type: "result", data: output, summary });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.postMessage({ type: "error", message });
  }
};

export {};
