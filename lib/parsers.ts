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

/** Convert European number format: "1.234,56" → 1234.56.  Already-numeric values are returned as-is. */
export function parseNum(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return isNaN(val) ? null : val;
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

/**
 * Read a file buffer and return raw string rows for preview.
 * Detects UTF-16 LE BOM for Exact Online files, else assumes UTF-8.
 * Returns max `maxRows` rows + total count.
 */
export async function previewFileBuffer(
  buffer: ArrayBuffer,
  filename: string,
  maxRows = 500
): Promise<import("./types").PreviewData> {
  const XLSX = await getXLSX();
  const bytes = new Uint8Array(buffer);
  const isUtf16 = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;

  const encoding = isUtf16 ? "UTF-16" : "UTF-8";
  const separator = isUtf16 ? "Tab-separated" : "Comma-separated";

  let wb;
  try {
    if (isUtf16) {
      let text = new TextDecoder("utf-16le").decode(buffer);
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
      wb = XLSX.read(text, { type: "string", raw: true });
    } else {
      wb = XLSX.read(bytes, { type: "array", raw: true });
    }
  } catch {
    return { filename, headers: [], rows: [], totalRows: 0, encoding, separator, error: "Could not read this file. Make sure it is a valid CSV file and has not been corrupted." };
  }

  if (!wb.SheetNames.length || !wb.Sheets[wb.SheetNames[0]]) {
    return { filename, headers: [], rows: [], totalRows: 0, encoding, separator, error: "This file appears to be empty." };
  }

  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });

  if (raw.length === 0) {
    return { filename, headers: [], rows: [], totalRows: 0, encoding, separator, error: "This file appears to be empty." };
  }

  let headers = raw[0].map((h) => {
    let s = String(h ?? "");
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
    return s;
  });

  const allRows = raw.slice(1);
  const preview = allRows.slice(0, maxRows);
  const colCount = headers.length;

  const rows = preview.map((r) => {
    const arr = r.map((c) => {
      if (c === null || c === undefined) return "";
      return String(c);
    });
    while (arr.length < colCount) arr.push("");
    return arr;
  });

  return { filename, headers, rows, totalRows: allRows.length, encoding, separator };
}
