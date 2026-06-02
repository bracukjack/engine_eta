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
    /** Total master rows with an Sku, before studio-item filtering. */
    masterTotal: number;
    /** Rows skipped because their Sku is not in the studio item list. */
    skippedNotStudio: number;
  };
}

/**
 * Collect the set of valid SKUs (uppercase) from a parsed studio-item file
 * (e.g. LogItemSearch export). The item code lives in the `Code` column;
 * a few alternative headers are accepted for safety.
 */
export function collectStudioSkus(itemRows: Record<string, unknown>[]): Set<string> {
  const set = new Set<string>();
  if (itemRows.length === 0) return set;
  const headers = Object.keys(itemRows[0]);
  const codeCol =
    ["Code", "code", "Sku", "SKU", "ItemCode", "ProductCode"].find((c) => headers.includes(c)) ??
    headers[0];
  for (const row of itemRows) {
    const code = String(row[codeCol] ?? "").trim();
    if (code) set.add(code.toUpperCase());
  }
  return set;
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

/**
 * Transform parsed master rows into Shopify import rows.
 *
 * When `allowedSkus` is provided (set of uppercase SKUs from the studio item
 * list), only master products whose Sku is in that set are kept — the rest are
 * counted in `stats.skippedNotStudio`. Pass `null` to map every product.
 */
export function transformToShopify(
  masterRows: Record<string, unknown>[],
  allowedSkus: Set<string> | null = null
): MappingResult {
  const products: MappedProduct[] = [];
  let totalImages = 0;
  let missingRequired = 0;
  let publishedTrue = 0;
  let masterTotal = 0;
  let skippedNotStudio = 0;

  // Track handle usage so duplicate titles get unique handles (-2, -3, …).
  // Shopify treats rows sharing a handle as one product, so this avoids
  // silently merging distinct products that happen to share a name.
  const handleCounts = new Map<string, number>();

  for (const row of masterRows) {
    const sku = str(row["Sku"]);
    if (sku === "") continue; // skip rows without an SKU
    masterTotal++;

    // Studio filter: keep only SKUs present in the studio item list
    if (allowedSkus && !allowedSkus.has(sku.toUpperCase())) {
      skippedNotStudio++;
      continue;
    }

    const name = str(row["Name"]);
    // Handle is generated from the Title (Name); fall back to Sku if empty.
    const baseHandle = toHandle(name) || toHandle(sku);
    const seen = handleCounts.get(baseHandle) ?? 0;
    handleCounts.set(baseHandle, seen + 1);
    const handle = seen === 0 ? baseHandle : `${baseHandle}-${seen + 1}`;
    const isPublished = str(row["Published"]).toLowerCase() === "true";
    if (isPublished) publishedTrue++;

    // ── Main row ─────────────────────────────────────────────────────────
    const main: ShopifyRow = {};
    for (const col of SHOPIFY_COLUMNS) main[col] = "";

    main["Handle"] = handle;
    main["Title"] = name;
    main["Body (HTML)"] = str(row["FullDescription"]);
    main["Vendor"] = str(row["Manufacturer"]);
    // Collection tree from CategoryTrail → flat tag per level (Shopify smart collections)
    const { tags: catTags, type: catType } = parseCategoryTrail(str(row["CategoryTrail"]));
    main["Product Category"] = "";
    main["Type"] = catType;
    main["Tags"] = catTags.join(", ");
    main["Published"] = isPublished ? "TRUE" : "FALSE";
    main["Option1 Name"] = "Title";
    main["Option1 Value"] = "Default Title";
    main["Variant SKU"] = sku;
    main["Variant Grams"] = "0";
    main["Variant Inventory Tracker"] = "shopify";
    main["Variant Inventory Qty"] = String(Math.round(parseNum(row["StockQuantity"]) ?? 0));
    main["Variant Inventory Policy"] = "deny";
    main["Variant Fulfillment Service"] = "manual";
    main["Variant Price"] = priceOut(row["Price"]);
    main["Variant Compare At Price"] = priceOut(row["OldPrice"]);
    main["Variant Requires Shipping"] = "TRUE";
    main["Variant Taxable"] = "TRUE";
    main["Variant Barcode"] = str(row["Gtin"]);
    main["Variant Weight Unit"] = "kg";
    main["Gift Card"] = "FALSE";
    main["SEO Title"] = str(row["MetaTitle"]);
    main["SEO Description"] = str(row["MetaDescription"]);
    main["Status"] = isPublished ? "active" : "draft";

    // Metafields
    for (const { spec, col } of METAFIELD_MAP) {
      main[col] = str(row[spec]);
    }

    // ── Images ───────────────────────────────────────────────────────────
    const images: { src: string; alt: string }[] = [];
    for (let i = 1; i <= MAX_IMAGES; i++) {
      const src = str(row[`Image_${i}`]);
      if (src === "") continue;
      images.push({ src, alt: str(row[`Image_AltTag_${i}`]) });
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
      masterTotal,
      skippedNotStudio,
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
