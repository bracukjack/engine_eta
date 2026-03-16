"use client";

import { useState, useCallback, useRef } from "react";
import Papa from "papaparse";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import _ from "lodash";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

dayjs.extend(customParseFormat);

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type Row = Record<string, unknown>;

interface ProcessResult {
  matched: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Find a column name case-insensitively from a list of candidates */
function findColumn(headers: string[], candidates: string[]): string | null {
  for (const c of candidates) {
    const found = headers.find(
      (h) => h.trim().toLowerCase() === c.toLowerCase()
    );
    if (found) return found;
  }
  return null;
}

/** Parse a file (CSV or XLSX) and return rows */
function parseFile(file: File): Promise<Row[]> {
  return new Promise((resolve, reject) => {
    const ext = file.name.split(".").pop()?.toLowerCase();

    if (ext === "xlsx" || ext === "xls") {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer);
          const wb = XLSX.read(data, { type: "array" });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const rows: Row[] = XLSX.utils.sheet_to_json(ws, { defval: "" });
          resolve(rows);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read XLSX file"));
      reader.readAsArrayBuffer(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target!.result as string;
          const firstLine = text.split("\n")[0] || "";
          let delimiter = ",";
          if (firstLine.includes("\t")) delimiter = "\t";
          else if (firstLine.split(";").length > firstLine.split(",").length)
            delimiter = ";";

          const result = Papa.parse<Row>(text, {
            header: true,
            skipEmptyLines: true,
            delimiter,
          });
          if (result.errors.length > 0 && result.data.length === 0) {
            reject(
              new Error(
                `CSV parse error: ${result.errors[0]?.message ?? "unknown"}`
              )
            );
          }
          resolve(result.data);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read CSV file"));
      reader.readAsText(file);
    }
  });
}

const DATE_FORMATS = [
  "DD/MM/YYYY",
  "D/M/YYYY",
  "DD-MM-YYYY",
  "YYYY-MM-DD",
  "MM/DD/YYYY",
  "M/D/YYYY",
  "DD.MM.YYYY",
  "YYYY/MM/DD",
];

function parseDate(value: unknown): dayjs.Dayjs | null {
  if (value == null || value === "") return null;

  // Excel serial number
  if (typeof value === "number") {
    const excelEpoch = dayjs("1899-12-30");
    return excelEpoch.add(value, "day");
  }

  const str = String(value).trim();
  for (const fmt of DATE_FORMATS) {
    const d = dayjs(str, fmt, true);
    if (d.isValid()) return d;
  }
  const d = dayjs(str);
  return d.isValid() ? d : null;
}

/* ------------------------------------------------------------------ */
/*  Main processing logic (mirrors the Python notebook)                */
/* ------------------------------------------------------------------ */
function processData(
  poRows: Row[],
  productRows: Row[],
  cutoffDate: string
): { result: Row[]; matched: number } {
  const poHeaders = poRows.length > 0 ? Object.keys(poRows[0]) : [];
  const prodHeaders =
    productRows.length > 0 ? Object.keys(productRows[0]) : [];

  // --- Normalise PO columns ---
  const poSkuCol = findColumn(poHeaders, ["Item", "SKU", "item", "sku"]);
  if (!poSkuCol)
    throw new Error(
      "SKU column not found in PO file (expected: Item / SKU)."
    );

  const poDateCol = findColumn(poHeaders, [
    "Receipt date",
    "Receipt_date",
    "receipt_date",
    "receipt date",
  ]);
  if (!poDateCol)
    throw new Error("Receipt date column not found in PO file.");

  const poOrderCol = findColumn(poHeaders, [
    "Order number",
    "Order_number",
    "order_number",
    "order number",
  ]);

  // --- Normalise Product columns ---
  const prodSkuCol = findColumn(prodHeaders, [
    "Variant SKU",
    "SKU",
    "variant_sku",
    "variant sku",
  ]);
  if (!prodSkuCol)
    throw new Error(
      "SKU column not found in Products file (expected: Variant SKU / SKU)."
    );

  const prodTitleCol = findColumn(prodHeaders, ["Title", "title"]);
  if (!prodTitleCol)
    throw new Error("Title column not found in Products file.");

  // 1. Drop PO rows without SKU
  let po = poRows.filter((r) => {
    const v = r[poSkuCol];
    return v != null && String(v).trim() !== "";
  });

  // 2. Parse Receipt date & attach helpers
  po = po.map((r) => ({
    ...r,
    __parsed_date: parseDate(r[poDateCol]),
    __sku: String(r[poSkuCol]).trim(),
  }));

  // Drop rows where date is invalid
  po = po.filter(
    (r) =>
      (r as Row & { __parsed_date: dayjs.Dayjs | null }).__parsed_date !== null
  );

  // 3. Filter Receipt date >= cutoff date
  const cutoff = cutoffDate
    ? dayjs(cutoffDate).startOf("day")
    : dayjs().startOf("day");
  po = po.filter((r) => {
    const d = (r as Row & { __parsed_date: dayjs.Dayjs }).__parsed_date;
    return d.isSame(cutoff, "day") || d.isAfter(cutoff, "day");
  });

  // 4. Sort by Receipt date asc, then Order number
  po = _.sortBy(po, [
    (r) =>
      (r as Row & { __parsed_date: dayjs.Dayjs }).__parsed_date.valueOf(),
    (r) => (poOrderCol ? r[poOrderCol] : ""),
  ]);

  // 5. Group by SKU, take first per SKU → ETA
  const grouped = _.groupBy(
    po,
    (r) => (r as Row & { __sku: string }).__sku
  );
  const etaMap = new Map<string, string>();
  for (const [sku, rows] of Object.entries(grouped)) {
    const first = rows[0] as Row & { __parsed_date: dayjs.Dayjs };
    etaMap.set(sku, first.__parsed_date.format("DD/MM/YYYY"));
  }

  // 6. Inner-join Products with ETA on SKU — output only Title, SKU, ETA
  const result: Row[] = [];
  for (const prod of productRows) {
    const sku = String(prod[prodSkuCol] ?? "").trim();
    if (sku === "") continue;
    const eta = etaMap.get(sku);
    if (eta) {
      result.push({
        Title: prod[prodTitleCol] ?? "",
        SKU: sku,
        ETA: eta,
      });
    }
  }

  return { result, matched: result.length };
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function Home() {
  const [poFile, setPoFile] = useState<File | null>(null);
  const [prodFile, setProdFile] = useState<File | null>(null);
  const [cutoffDate, setCutoffDate] = useState<string>(
    dayjs().format("YYYY-MM-DD")
  );
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [processing, setProcessing] = useState(false);

  const poRef = useRef<HTMLInputElement>(null);
  const prodRef = useRef<HTMLInputElement>(null);

  const handleProcess = useCallback(async () => {
    setError("");
    setStatus("");
    setResult(null);

    if (!poFile) {
      setError("Please select a Purchase Order file first.");
      return;
    }
    if (!prodFile) {
      setError("Please select a Products file first.");
      return;
    }

    setProcessing(true);
    setStatus("Reading files...");

    try {
      const [poRows, prodRows] = await Promise.all([
        parseFile(poFile),
        parseFile(prodFile),
      ]);

      if (poRows.length === 0)
        throw new Error("PO file is empty or could not be parsed.");
      if (prodRows.length === 0)
        throw new Error("Products file is empty or could not be parsed.");

      setStatus(
        `PO: ${poRows.length} rows, Products: ${prodRows.length} rows. Processing...`
      );

      const { result: rows, matched } = processData(poRows, prodRows, cutoffDate);

      if (rows.length === 0) {
        throw new Error("No matching SKU found between PO and Products.");
      }

      // Build Excel
      setStatus("Generating Excel file...");
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Products with ETA");
      const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
      const blob = new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      saveAs(blob, "products_with_eta.xlsx");

      setResult({ matched });
      setStatus(
        `Done! ${matched} SKUs were matched and downloaded successfully.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("");
    } finally {
      setProcessing(false);
    }
  }, [poFile, prodFile, cutoffDate]);

  const resetAll = () => {
    setPoFile(null);
    setProdFile(null);
    setCutoffDate(dayjs().format("YYYY-MM-DD"));
    setStatus("");
    setError("");
    setResult(null);
    if (poRef.current) poRef.current.value = "";
    if (prodRef.current) prodRef.current.value = "";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4 font-[family-name:var(--font-geist-sans)]">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600 text-white mb-4 shadow-lg shadow-indigo-200 dark:shadow-indigo-900/40">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className="w-7 h-7"
            >
              <path d="M5.625 1.5c-1.036 0-1.875.84-1.875 1.875v17.25c0 1.035.84 1.875 1.875 1.875h12.75c1.035 0 1.875-.84 1.875-1.875V12.75A3.75 3.75 0 0016.5 9h-1.875a1.875 1.875 0 01-1.875-1.875V5.25A3.75 3.75 0 009 1.5H5.625z" />
              <path d="M12.971 1.816A5.23 5.23 0 0114.25 5.25v1.875c0 .207.168.375.375.375H16.5a5.23 5.23 0 013.434 1.279 9.768 9.768 0 00-6.963-6.963z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            ETA Product Matcher
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Upload Purchase Order &amp; Shopify Products, then download the
            result with ETA
          </p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-slate-800/60 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-black/20 border border-slate-200/80 dark:border-slate-700/50 p-6 space-y-5">
          {/* PO Upload */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
              Purchase Order
              <span className="font-normal text-slate-400 dark:text-slate-500 ml-1">
                (CSV / XLSX)
              </span>
            </label>
            <input
              ref={poRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => {
                setPoFile(e.target.files?.[0] ?? null);
                setError("");
                setResult(null);
              }}
              className="block w-full text-sm text-slate-500 dark:text-slate-400
                file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0
                file:text-sm file:font-semibold file:cursor-pointer
                file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100
                dark:file:bg-indigo-900/30 dark:file:text-indigo-400 dark:hover:file:bg-indigo-900/50
                transition-colors cursor-pointer"
            />
            {poFile && (
              <span className="block mt-1.5 text-xs text-slate-400 truncate">
                {poFile.name} ({(poFile.size / 1024).toFixed(1)} KB)
              </span>
            )}
          </div>

          {/* Products Upload */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
              Products Shopify
              <span className="font-normal text-slate-400 dark:text-slate-500 ml-1">
                (CSV / XLSX)
              </span>
            </label>
            <input
              ref={prodRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => {
                setProdFile(e.target.files?.[0] ?? null);
                setError("");
                setResult(null);
              }}
              className="block w-full text-sm text-slate-500 dark:text-slate-400
                file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0
                file:text-sm file:font-semibold file:cursor-pointer
                file:bg-emerald-50 file:text-emerald-600 hover:file:bg-emerald-100
                dark:file:bg-emerald-900/30 dark:file:text-emerald-400 dark:hover:file:bg-emerald-900/50
                transition-colors cursor-pointer"
            />
            {prodFile && (
              <span className="block mt-1.5 text-xs text-slate-400 truncate">
                {prodFile.name} ({(prodFile.size / 1024).toFixed(1)} KB)
              </span>
            )}
          </div>

          {/* Cutoff Date */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
              Receipt Date starting from
              <span className="font-normal text-slate-400 dark:text-slate-500 ml-1">
                (remove data before this date)
              </span>
            </label>
            <input
              type="date"
              value={cutoffDate}
              suppressHydrationWarning
              onChange={(e) => {
                setCutoffDate(e.target.value);
                setResult(null);
              }}
              className="block w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
            />
            <span className="block mt-1.5 text-xs text-slate-400">
              Default: today ({dayjs().format("DD/MM/YYYY")})
            </span>
          </div>

          {/* Large file warning */}
          {((poFile && poFile.size > 10 * 1024 * 1024) ||
            (prodFile && prodFile.size > 10 * 1024 * 1024)) && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 p-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-5 h-5 text-amber-500 mt-0.5 shrink-0"
              >
                <path
                  fillRule="evenodd"
                  d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.345 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Large files detected. Browser processing can be slow or run out
                of memory for files larger than 10 MB.
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={handleProcess}
              disabled={processing || !poFile || !prodFile}
              className="flex-1 py-3 px-4 rounded-xl font-semibold text-sm text-white
                bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800
                disabled:opacity-40 disabled:cursor-not-allowed
                transition-colors shadow-sm shadow-indigo-200 dark:shadow-indigo-900/30
                flex items-center justify-center gap-2"
            >
              {processing ? (
                <>
                  <svg
                    className="animate-spin h-4 w-4 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                    Processing...
                </>
              ) : (
                <>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="w-4 h-4"
                  >
                    <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
                    <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
                  </svg>
                  Process &amp; Download
                </>
              )}
            </button>
            <button
              onClick={resetAll}
              disabled={processing}
              className="py-3 px-4 rounded-xl font-semibold text-sm
                text-slate-600 dark:text-slate-300
                bg-slate-100 hover:bg-slate-200 active:bg-slate-300
                dark:bg-slate-700 dark:hover:bg-slate-600 dark:active:bg-slate-500
                disabled:opacity-40 disabled:cursor-not-allowed
                transition-colors"
            >
              Reset
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 p-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-5 h-5 text-red-500 mt-0.5 shrink-0"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {/* Status / Success */}
          {status && !error && (
            <div
              className={`flex items-start gap-2 rounded-xl p-3 ${
                result
                  ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40"
                  : "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/40"
              }`}
            >
              {result ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg
                  className="animate-spin h-5 w-5 text-blue-500 mt-0.5 shrink-0"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
              )}
              <p
                className={`text-sm ${
                  result
                    ? "text-emerald-700 dark:text-emerald-300"
                    : "text-blue-700 dark:text-blue-300"
                }`}
              >
                {status}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 dark:text-slate-500 mt-6">
          All processing happens in your browser. No data is sent to the
          server.
        </p>
      </div>
    </div>
  );
}
