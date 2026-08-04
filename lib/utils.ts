import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { DecimalSeparator } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a search query into a matcher function.
 *
 * - Comma present → multi-SKU mode: each token is a prefix, matched with
 *   `startsWith` (case-insensitive, OR logic).
 *   Example: "AFSHU, AFCHU" → match any field starting with "afshu" or "afchu"
 *
 * - No comma → global search: single token matched with `includes`
 *   (case-insensitive).
 *
 * Returns `null` when the query is effectively empty (no work to do).
 */
export function buildSearchMatcher(
  raw: string
): ((fields: (string | null | undefined)[]) => boolean) | null {
  if (!raw) return null;

  const hasComma = raw.includes(",");

  if (hasComma) {
    const prefixes = raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (prefixes.length === 0) return null;
    return (fields) =>
      prefixes.some((prefix) =>
        fields.some((f) => f != null && f.toLowerCase().startsWith(prefix))
      );
  }

  const q = raw.trim().toLowerCase();
  if (!q) return null;
  return (fields) =>
    fields.some((f) => f != null && f.toLowerCase().includes(q));
}

/**
 * Format a number as a price for on-screen display, always 2 decimal places.
 * `separator` picks which character is the decimal mark; the thousands
 * separator is always the other one, so the two never collide.
 * comma (default): dot thousands, comma decimal → 1234.56 → "1.234,56"
 * dot: comma thousands, dot decimal → 1234.56 → "1,234.56"
 * null / undefined / NaN → ""
 */
export function formatPrice(
  value: number | null | undefined,
  separator: DecimalSeparator = "comma"
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  const fixed = Math.abs(value).toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const thousandsChar = separator === "comma" ? "." : ",";
  const decimalChar = separator === "comma" ? "," : ".";
  const intFormatted = intPart!.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsChar);
  const sign = value < 0 ? "-" : "";
  return `${sign}${intFormatted}${decimalChar}${decPart}`;
}

/**
 * Format a number as a Shopify-safe price for export: no thousands
 * separator, always 2 decimal places. `separator` picks the decimal mark.
 * dot (default): 1234.56 → "1234.56"  |  comma: 1234.56 → "1234,56"
 * null / undefined / NaN → ""
 */
export function formatPriceExport(
  value: number | null | undefined,
  separator: DecimalSeparator = "dot"
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  const fixed = value.toFixed(2);
  return separator === "comma" ? fixed.replace(".", ",") : fixed;
}

/**
 * Parse a user-typed/pasted price string, honoring the given decimal
 * separator. Strips thousands grouping first so pasting a "show"-formatted
 * value (with grouping) round-trips correctly.
 * comma: "1.234,56" or "1234,56" → 1234.56
 * dot: "1,234.56" or "1234.56" → 1234.56
 * "" / unparseable → null
 */
export function parsePriceInput(
  raw: string,
  separator: DecimalSeparator = "dot"
): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const thousandsChar = separator === "comma" ? "." : ",";
  const decimalChar = separator === "comma" ? "," : ".";
  const normalized = trimmed.split(thousandsChar).join("").split(decimalChar).join(".");
  const n = parseFloat(normalized);
  return Number.isNaN(n) ? null : n;
}

/**
 * Format a number as a European integer (whole number, dot as thousands separator).
 * 1234 → "1.234"  |  42 → "42"  |  null / NaN → ""
 */
export function formatInteger(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  const n = Math.round(value);
  const abs = Math.abs(n);
  const formatted = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return n < 0 ? `-${formatted}` : formatted;
}

/**
 * Export tabular data as an Excel (.xlsx) file using SheetJS.
 * @param headers  Array of column header strings
 * @param rows     2D array of cell values (one array per row)
 * @param filename Desired filename (without extension)
 * @param sheetName Optional worksheet name (default: "Sheet1")
 */
export async function exportToExcel(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
  filename: string,
  sheetName = "Sheet1"
): Promise<void> {
  const mod = await import("xlsx");
  const XLSX = ((mod as Record<string, unknown>).default ?? mod) as typeof import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

/**
 * Export tabular data as a UTF-8 CSV file.
 * @param headers  Array of column header strings
 * @param rows     2D array of cell values
 * @param filename Desired filename (without extension)
 */
export function exportToCsv(
  headers: string[],
  rows: (string | number | boolean | null | undefined)[][],
  filename: string
): void {
  const csv = [headers, ...rows]
    .map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
