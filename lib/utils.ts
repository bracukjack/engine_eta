import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number as European price:
 * comma as decimal separator, dot as thousands separator, always 2 decimal places.
 * 1 → "1,00"  |  2.5 → "2,50"  |  1234.56 → "1.234,56"
 * null / undefined / NaN → ""
 */
export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  const fixed = Math.abs(value).toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  const intFormatted = intPart!.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const sign = value < 0 ? "-" : "";
  return `${sign}${intFormatted},${decPart}`;
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
