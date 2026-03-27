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
 *
 * Strategy:
 *   - Real Excel files (.xlsx / .xls, detected by magic bytes) → xlsx library
 *   - CSV/TSV files (UTF-16 LE from Exact Online, or UTF-8) → PapaParse
 *     with dynamicTyping: false so all values stay as raw strings.
 *     This prevents xlsx from silently converting EU numbers like "54,95"
 *     into the wrong integer 5495 before parseNum ever sees them.
 */
export async function parseFileBuffer(
  buffer: ArrayBuffer
): Promise<Record<string, unknown>[]> {
  const bytes = new Uint8Array(buffer);

  // Magic-byte detection for actual Excel files
  const isXlsx = bytes[0] === 0x50 && bytes[1] === 0x4b; // PK (ZIP / OOXML)
  const isXls  = bytes[0] === 0xd0 && bytes[1] === 0xcf; // OLE2 compound doc

  if (isXlsx || isXls) {
    const XLSX = await getXLSX();
    const wb = XLSX.read(bytes, { type: "array" });
    if (!wb.SheetNames.length) return [];
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws, { defval: "" });
  }

  // CSV / TSV — use PapaParse so numbers are never auto-converted
  const Papa = (await import("papaparse")).default;
  const isUtf16 = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;

  let text = isUtf16
    ? new TextDecoder("utf-16le").decode(buffer)
    : new TextDecoder("utf-8").decode(buffer);
  // Strip BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const result = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: false,          // keep all values as raw strings
    delimiter: isUtf16 ? "\t" : "", // UTF-16 Exact files are tab-separated
  });

  return result.data as Record<string, unknown>[];
}

/**
 * Smart number parser — port langsung dari Python smart_parse_number.
 *
 * Auto-detect format EU vs US berdasarkan jumlah & posisi titik/koma:
 *   Rule A: tidak ada separator         "32"        → 32
 *   Rule B: hanya titik                 "134.95"    → 134.95  (desimal)
 *                                       "1.234"     → 1234    (thousands, 3 digit)
 *                                       "1.234.567" → 1234567 (multi-dot = thousands)
 *   Rule C: hanya koma                  "134,95"    → 134.95  (EU desimal)
 *                                       "1,234"     → 1234    (US thousands, 3 digit)
 *                                       "1,234,567" → 1234567 (multi-comma = thousands)
 *   Rule D: ada keduanya                "1.234,56"  → 1234.56 (EU: koma terakhir = decimal)
 *                                       "1,234.56"  → 1234.56 (US: titik terakhir = decimal)
 *
 * Ini menggantikan versi lama yang hardcode EU-only:
 *   ❌ s.replace(/\./g, "").replace(",", ".")
 *   Efek: "134.95" → "13495", "1.00" → "100" (SALAH)
 */
export function parseNum(val: unknown): number | null {
  if (val === null || val === undefined || val === "") return null;
  if (typeof val === "number") return isNaN(val) ? null : val;

  // Strip currency symbols dan whitespace
  let s = String(val).trim().replace(/[\s€$£\u00A0]/g, "");
  if (s === "" || s === "-" || s.toLowerCase() === "n/a") return null;
  if (!/\d/.test(s)) return null;

  const dotCount = (s.match(/\./g) ?? []).length;
  const commaCount = (s.match(/,/g) ?? []).length;

  try {
    // Rule A: tidak ada separator
    if (dotCount === 0 && commaCount === 0) {
      return parseFloat(s);
    }

    // Rule B: hanya titik
    if (dotCount > 0 && commaCount === 0) {
      if (dotCount > 1) {
        // Multi-titik → semua thousands: "1.234.567" → 1234567
        return parseFloat(s.replace(/\./g, ""));
      }
      const afterDot = s.split(".").pop()!;
      // Tepat 3 digit setelah titik → thousands separator: "1.234" → 1234
      // Selain 3 digit → decimal: "134.95" → 134.95, "1.00" → 1.00
      return afterDot.length === 3
        ? parseFloat(s.replace(/\./g, ""))
        : parseFloat(s);
    }

    // Rule C: hanya koma
    if (commaCount > 0 && dotCount === 0) {
      if (commaCount > 1) {
        // Multi-koma → semua thousands: "1,234,567" → 1234567
        return parseFloat(s.replace(/,/g, ""));
      }
      const afterComma = s.split(",").pop()!;
      // Tepat 3 digit setelah koma → thousands separator: "1,234" → 1234
      // Selain 3 digit → EU decimal: "134,95" → 134.95
      return afterComma.length === 3
        ? parseFloat(s.replace(/,/g, ""))
        : parseFloat(s.replace(",", "."));
    }

    // Rule D: ada keduanya → separator terakhir menentukan decimal
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastComma > lastDot) {
      // EU format: "1.234,56" → koma adalah decimal
      return parseFloat(s.replace(/\./g, "").replace(",", "."));
    } else {
      // US format: "1,234.56" → titik adalah decimal
      return parseFloat(s.replace(/,/g, ""));
    }
  } catch {
    return null;
  }
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