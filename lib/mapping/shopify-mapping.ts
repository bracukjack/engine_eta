import { parseNum } from "@/lib/parsers";

// ── Spec_* → Shopify metafield column mapping ────────────────────────────────
// Source header (master / KATANAPIM) → target header (Shopify import CSV)
export const METAFIELD_MAP: { spec: string; col: string }[] = [
  { spec: "Spec_Colour",                  col: "Color (product.metafields.custom.colour)" },
  { spec: "Spec_Material",                col: "Material (product.metafields.custom.material)" },
  { spec: "Spec_Country of origin",       col: "Country of origin (product.metafields.custom.country_origin)" },
  { spec: "Spec_Care & Maintenance",      col: "Care & Maintenance (product.metafields.custom.care___maintenance)" },
  { spec: "Spec_Dishwasher proof",        col: "Dishwasher proof (product.metafields.custom.dishwasher_proof)" },
  { spec: "Spec_Microwave proof",         col: "Microwave proof (product.metafields.custom.microwave_proof)" },
  { spec: "Spec_Oven proof",              col: "Oven proof (product.metafields.custom.oven_proof)" },
  { spec: "Spec_Food proof",              col: "Food proof (product.metafields.custom.food_proof)" },
  { spec: "Spec_Waterproof",              col: "Waterproof (product.metafields.custom.waterproof)" },
  { spec: "Spec_Washing protocol",        col: "Washing protocol (product.metafields.custom.washing_protocol)" },
  { spec: "Spec_Usage",                   col: "Usage (product.metafields.custom.usage)" },
  { spec: "Spec_Type of fitting",         col: "Type of fitting (product.metafields.custom.type_of_fitting)" },
  { spec: "Spec_Stand Included",          col: "Stand included (product.metafields.custom.including_stand)" },
  { spec: "Spec_Inner cushion included",  col: "Inner cushion included (product.metafields.custom.inner_cushion)" },
  { spec: "Spec_Cable and fitting included", col: "Cable and fitting included (product.metafields.custom.cable_fitting)" },
  { spec: "Spec_Capacity (ml)",           col: "Capacity (ml) (product.metafields.custom.capacity__ml_)" },
  { spec: "Spec_Height (cm)",             col: "Height (product.metafields.custom.size_y_value)" },
  { spec: "Spec_Width (cm)",              col: "Width (product.metafields.custom.size_z_value)" },
  { spec: "Spec_Length (cm)",             col: "Length (product.metafields.custom.size_x_value)" },
  { spec: "Spec_Wattage",                 col: "Wattage (product.metafields.custom.wattage)" },
  { spec: "Spec_Voltage (V)",             col: "Voltage (product.metafields.custom.watt)" },
];

// ── Ordered Shopify import CSV header ────────────────────────────────────────
export const SHOPIFY_COLUMNS: string[] = [
  "Handle",
  "Title",
  "Body (HTML)",
  "Vendor",
  "Product Category",
  "Type",
  "Tags",
  "Published",
  "Option1 Name",
  "Option1 Value",
  "Variant SKU",
  "Variant Grams",
  "Variant Inventory Tracker",
  "Variant Inventory Qty",
  "Variant Inventory Policy",
  "Variant Fulfillment Service",
  "Variant Price",
  "Variant Compare At Price",
  "Variant Requires Shipping",
  "Variant Taxable",
  "Variant Barcode",
  "Variant Weight Unit",
  "Image Src",
  "Image Position",
  "Image Alt Text",
  "Gift Card",
  "SEO Title",
  "SEO Description",
  "Status",
  ...METAFIELD_MAP.map((m) => m.col),
];

const MAX_IMAGES = 21;

/** Columns shown in the mapping preview table (subset of SHOPIFY_COLUMNS). */
export const DISPLAY_COLUMNS: { key: string; label: string; width: number; numeric?: boolean }[] = [
  { key: "Handle", label: "Handle", width: 200 },
  { key: "Title", label: "Title", width: 280 },
  { key: "Variant SKU", label: "SKU", width: 150 },
  { key: "Vendor", label: "Vendor", width: 140 },
  { key: "Type", label: "Type", width: 150 },
  { key: "Tags", label: "Collections", width: 220 },
  { key: "Variant Price", label: "Price", width: 90, numeric: true },
  { key: "Variant Compare At Price", label: "Compare", width: 100, numeric: true },
  { key: "Variant Inventory Qty", label: "Qty", width: 70, numeric: true },
  { key: "Published", label: "Published", width: 90 },
  { key: "Status", label: "Status", width: 90 },
  { key: "Variant Barcode", label: "Barcode", width: 140 },
  { key: "SEO Title", label: "SEO Title", width: 220 },
];

export type ShopifyRow = Record<string, string>;

export interface MappedProduct {
  handle: string;
  title: string;
  sku: string;
  price: string;
  status: string;
  imageCount: number;
  /** Required field present? (Handle, Title, SKU) */
  hasRequired: boolean;
  /** The product's main row (all Shopify columns filled). */
  main: ShopifyRow;
  /** Main row + extra image rows. */
  rows: ShopifyRow[];
}

export interface MappingResult {
  products: MappedProduct[];
  rows: ShopifyRow[];
  stats: {
    products: number;
    totalImages: number;
    totalRows: number;
    missingRequired: number;
    publishedTrue: number;
    /** Rows in the uploaded Katana master file (0 if none uploaded). */
    masterRowsTotal: number;
    /** Products whose Sku matched a row in the Katana master file. */
    matchedKatana: number;
    /** Products with no Katana match — supplement fields (images, body html,
     *  vendor, tags, SEO, stock, compare-at price...) are left blank. */
    noKatanaMatch: number;
  };
}

/** Collapse whitespace + lowercase, so header lookups tolerate stray double spaces. */
function normHeader(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Find the actual row key matching one of `candidates` (whitespace/case-insensitive). */
function findColumn(headers: string[], candidates: string[]): string | undefined {
  const normed = headers.map((h) => normHeader(h));
  for (const c of candidates) {
    const idx = normed.indexOf(normHeader(c));
    if (idx !== -1) return headers[idx];
  }
  return undefined;
}

/** Index Katana master rows by Sku (uppercase) for O(1) lookup from the item loop. */
function indexMasterBySku(
  masterRows: Record<string, unknown>[]
): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>();
  for (const row of masterRows) {
    const sku = str(row["Sku"]);
    if (sku) map.set(sku.toUpperCase(), row);
  }
  return map;
}

const str = (v: unknown): string =>
  v === null || v === undefined ? "" : String(v).trim();

/** Slugify any text → lowercase, only [a-z0-9-]. */
export function toHandle(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

// Grouping roots that are dropped from a trail path — they are containers in the
// PIM, not real collections (e.g. "Shop > Furniture" → collection is "Furniture").
const CATEGORY_ROOTS = new Set([
  "shop", "catalog", "catalogue", "catalog & shop", "collections", "home", "all", "all products",
]);
// Roots that identify the main category tree path (used to pick the product Type).
const CATALOG_ROOTS = new Set(["shop", "catalog", "catalogue", "catalog & shop"]);

/**
 * Parse a (possibly multi-path) CategoryTrail into flat collection tags + a Type.
 *
 * A CategoryTrail can hold several paths separated by " | ", each with levels
 * separated by " > ":
 *   "Shop > Furniture > Tables > Dining Tables | Sales > Dining | Collections > The Oh My Gee Collection"
 *
 * Each level becomes a flat tag (so a Shopify smart collection "tag = X" picks it
 * up), grouping roots are dropped, and tags are de-duplicated (case-insensitive,
 * order preserved). `type` is the deepest level of the catalog ("Shop") path.
 */
export function parseCategoryTrail(trail: string): { tags: string[]; type: string } {
  const tags: string[] = [];
  const seen = new Set<string>();
  let type = "";
  let firstPathDeepest = "";

  if (!trail) return { tags, type };

  for (const path of trail.split("|")) {
    let parts = path.split(">").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) continue;

    const isCatalog = CATALOG_ROOTS.has(parts[0].toLowerCase());
    // Drop a leading grouping root (keep the path if it is a single real collection)
    if (parts.length > 1 && CATEGORY_ROOTS.has(parts[0].toLowerCase())) parts = parts.slice(1);
    if (parts.length === 0) continue;

    const deepest = parts[parts.length - 1];
    if (isCatalog && !type) type = deepest;
    if (!firstPathDeepest) firstPathDeepest = deepest;

    for (const p of parts) {
      const key = p.toLowerCase();
      if (!seen.has(key)) { seen.add(key); tags.push(p); }
    }
  }

  if (!type) type = firstPathDeepest; // no explicit Shop path → fall back
  return { tags, type };
}

/** Format a price-ish value; blank for null/0. */
function priceOut(v: unknown): string {
  const n = parseNum(v);
  if (n === null || n === 0) return "";
  return n.toFixed(2);
}

// Studio item column candidates (LogItemSearch export). Header names are
// matched whitespace/case-insensitively via findColumn, since "Extra field:"
// columns have inconsistent double-spacing in real exports.
const ITEM_CODE_HEADERS = ["Code", "code", "Sku", "SKU", "ItemCode", "ProductCode"];
const ITEM_TITLE_HEADERS = ["DescriptionDescription", "Description"];
const ITEM_PRICE_HEADERS = ["Extra field: Studio Bizar Base Price"];
const ITEM_BARCODE_HEADERS = ["Barcode"];
const ITEM_STATUS_HEADERS = ["Class_10Description"];

/**
 * Transform parsed studio item rows (LogItemSearch export) into Shopify import
 * rows. The item file is the source of truth: every row with a Code becomes a
 * product, and Title / Price / Barcode / Published all come from it directly.
 *
 * `masterRows` (Katana/KATANAPIM export) is optional and only supplies fields
 * that don't exist in the item file — Body (HTML), Vendor, collection Tags/
 * Type, images, SEO Title/Description, stock qty and compare-at price. When a
 * Sku has no Katana match those fields are simply left blank (counted in
 * `stats.noKatanaMatch`) — the product is still exported.
 */
export function transformToShopify(
  itemRows: Record<string, unknown>[],
  masterRows: Record<string, unknown>[] | null = null
): MappingResult {
  const products: MappedProduct[] = [];
  let totalImages = 0;
  let missingRequired = 0;
  let publishedTrue = 0;
  let matchedKatana = 0;
  let noKatanaMatch = 0;

  const masterIndex = masterRows ? indexMasterBySku(masterRows) : null;

  if (itemRows.length === 0) {
    return {
      products: [],
      rows: [],
      stats: {
        products: 0, totalImages: 0, totalRows: 0, missingRequired: 0,
        publishedTrue: 0, masterRowsTotal: masterRows?.length ?? 0,
        matchedKatana: 0, noKatanaMatch: 0,
      },
    };
  }

  const headers = Object.keys(itemRows[0]);
  const codeKey = findColumn(headers, ITEM_CODE_HEADERS) ?? headers[0];
  const titleKey = findColumn(headers, ITEM_TITLE_HEADERS);
  const priceKey = findColumn(headers, ITEM_PRICE_HEADERS);
  const barcodeKey = findColumn(headers, ITEM_BARCODE_HEADERS);
  const statusKey = findColumn(headers, ITEM_STATUS_HEADERS);

  // Track handle usage so duplicate titles get unique handles (-2, -3, …).
  // Shopify treats rows sharing a handle as one product, so this avoids
  // silently merging distinct products that happen to share a name.
  const handleCounts = new Map<string, number>();

  for (const row of itemRows) {
    const sku = str(row[codeKey]);
    if (sku === "") continue; // skip rows without a code

    const kRow = masterIndex ? masterIndex.get(sku.toUpperCase()) ?? null : null;
    if (masterIndex) { if (kRow) matchedKatana++; else noKatanaMatch++; }

    const name = str(titleKey ? row[titleKey] : "");
    // Handle is generated from the Title; fall back to Sku if empty.
    const baseHandle = toHandle(name) || toHandle(sku);
    const seen = handleCounts.get(baseHandle) ?? 0;
    handleCounts.set(baseHandle, seen + 1);
    const handle = seen === 0 ? baseHandle : `${baseHandle}-${seen + 1}`;
    const isPublished = str(statusKey ? row[statusKey] : "").toUpperCase() === "YES";
    if (isPublished) publishedTrue++;

    // ── Main row ─────────────────────────────────────────────────────────
    const main: ShopifyRow = {};
    for (const col of SHOPIFY_COLUMNS) main[col] = "";

    main["Handle"] = handle;
    main["Title"] = name;
    main["Body (HTML)"] = str(kRow?.["FullDescription"]);
    main["Vendor"] = str(kRow?.["Manufacturer"]);
    // Collection tree from CategoryTrail → flat tag per level (Shopify smart collections)
    const { tags: catTags, type: catType } = parseCategoryTrail(str(kRow?.["CategoryTrail"]));
    main["Product Category"] = "";
    main["Type"] = catType;
    main["Tags"] = catTags.join(", ");
    main["Published"] = isPublished ? "TRUE" : "FALSE";
    main["Option1 Name"] = "Title";
    main["Option1 Value"] = "Default Title";
    main["Variant SKU"] = sku;
    main["Variant Grams"] = "0";
    main["Variant Inventory Tracker"] = "shopify";
    main["Variant Inventory Qty"] = String(Math.round(parseNum(kRow?.["StockQuantity"]) ?? 0));
    main["Variant Inventory Policy"] = "deny";
    main["Variant Fulfillment Service"] = "manual";
    main["Variant Price"] = priceOut(priceKey ? row[priceKey] : undefined);
    main["Variant Compare At Price"] = priceOut(kRow?.["OldPrice"]);
    main["Variant Requires Shipping"] = "TRUE";
    main["Variant Taxable"] = "TRUE";
    main["Variant Barcode"] = str(barcodeKey ? row[barcodeKey] : "");
    main["Variant Weight Unit"] = "kg";
    main["Gift Card"] = "FALSE";
    main["SEO Title"] = str(kRow?.["MetaTitle"]);
    main["SEO Description"] = str(kRow?.["MetaDescription"]);
    main["Status"] = isPublished ? "active" : "draft";

    // Metafields (Katana-only — supplement fields)
    for (const { spec, col } of METAFIELD_MAP) {
      main[col] = str(kRow?.[spec]);
    }

    // ── Images (Katana-only — supplement fields) ────────────────────────
    const images: { src: string; alt: string }[] = [];
    for (let i = 1; i <= MAX_IMAGES; i++) {
      const src = str(kRow?.[`Image_${i}`]);
      if (src === "") continue;
      images.push({ src, alt: str(kRow?.[`Image_AltTag_${i}`]) });
    }
    totalImages += images.length;

    if (images.length > 0) {
      main["Image Src"] = images[0].src;
      main["Image Position"] = "1";
      main["Image Alt Text"] = images[0].alt;
    }

    const rows: ShopifyRow[] = [main];

    // Extra image rows: only Handle + image columns filled
    for (let i = 1; i < images.length; i++) {
      const imgRow: ShopifyRow = {};
      for (const col of SHOPIFY_COLUMNS) imgRow[col] = "";
      imgRow["Handle"] = handle;
      imgRow["Image Src"] = images[i].src;
      imgRow["Image Position"] = String(i + 1);
      imgRow["Image Alt Text"] = images[i].alt;
      rows.push(imgRow);
    }

    const hasRequired = handle !== "" && name !== "" && sku !== "";
    if (!hasRequired) missingRequired++;

    products.push({
      handle,
      title: name,
      sku,
      price: main["Variant Price"],
      status: main["Status"],
      imageCount: images.length,
      hasRequired,
      main,
      rows,
    });
  }

  const rows = products.flatMap((p) => p.rows);

  return {
    products,
    rows,
    stats: {
      products: products.length,
      totalImages,
      totalRows: rows.length,
      missingRequired,
      publishedTrue,
      masterRowsTotal: masterRows?.length ?? 0,
      matchedKatana,
      noKatanaMatch,
    },
  };
}

/** Escape one CSV field: wrap in quotes and double internal quotes. */
function csvField(v: string): string {
  if (/[",\r\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** Generate a Shopify import CSV string (UTF-8 with BOM). */
export function generateCsv(
  rows: ShopifyRow[],
  columns: string[] = SHOPIFY_COLUMNS
): string {
  const lines: string[] = [];
  lines.push(columns.map(csvField).join(","));
  for (const row of rows) {
    lines.push(columns.map((c) => csvField(row[c] ?? "")).join(","));
  }
  const BOM = "﻿";
  return BOM + lines.join("\r\n");
}
