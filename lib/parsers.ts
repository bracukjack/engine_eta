/**
 * Dynamically import xlsx with CJS/ESM interop safety.
 */
export async function getXLSX() {
  const mod = await import("xlsx");
  // Handle both ESM default export and CJS module.exports
  return ((mod as Record<string, unknown>).default ?? mod) as typeof import("xlsx");
}

/**
 * Parse a file buffer into JSON rows.
 * Handles UTF-16 LE encoded TSV files (e.g. Exact Online exports)
 * as well as standard CSV and XLSX files.
 */
export async function parseFileBuffer(
  buffer: ArrayBuffer
): Promise<Record<string, unknown>[]> {
  const XLSX = await getXLSX();

  const bytes = new Uint8Array(buffer);
  // Detect UTF-16 LE BOM (0xFF 0xFE) — xlsx 0.18.5 community edition
  // crashes internally on these because codepage support was removed.
  const isUtf16 = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;

  let wb;
  if (isUtf16) {
    const text = new TextDecoder("utf-16le").decode(buffer);
    wb = XLSX.read(text, { type: "string" });
  } else {
    wb = XLSX.read(bytes, { type: "array" });
  }

  if (!wb.SheetNames.length) return [];
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}

/** Convert European number format: "1.234,56" → 1234.56 */
export function parseNum(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  const s = String(val).trim();
  if (s === "") return null;
  const cleaned = s.replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Extract discount percentage from Class_09Description:
 *   YES_40% / 40% / YES_15% → number
 *   NO / "" / null           → null
 */
export function extractDiscount(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (s.toUpperCase() === "NO" || s === "") return null;
  const m = s.match(/(\d+(?:\.\d+)?)%/);
  return m ? parseFloat(m[1]) : null;
}
