"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { useAppStore } from "@/lib/store";
import { parseFileBuffer, getXLSX } from "@/lib/parsers";
import { Upload, CheckCircle2, Play, Loader2, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BestSellerRow {
  handle: string;
  title: string;
  sku: string;
  tags: string;
}

export function BestSellerTab() {
  const [bsFile, setBsFile] = useState<File | null>(null);
  const [results, setResults] = useState<BestSellerRow[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<string[]>([]);

  const shopifyFile = useAppStore((s) => s.files.shopify.file);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (accepted) => {
      if (accepted.length > 0) {
        setBsFile(accepted[0]);
        setResults([]);
        setError(null);
        setNotFound([]);
      }
    },
    accept: {
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".csv", ".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
    multiple: false,
  });

  const handleProcess = useCallback(async () => {
    if (!bsFile || !shopifyFile) return;
    setProcessing(true);
    setError(null);
    setNotFound([]);

    try {
      // Parse best seller file → collect SKU set
      const bsBuf = await bsFile.arrayBuffer();
      const bsRows = await parseFileBuffer(bsBuf);
      const bsSkuSet = new Set<string>();
      for (const row of bsRows) {
        const sku = String(row["SKU"] ?? "").trim().toUpperCase();
        if (sku) bsSkuSet.add(sku);
      }

      // Parse raw Shopify export → match by Variant SKU
      const shopifyBuf = await shopifyFile.arrayBuffer();
      const shopifyRows = await parseFileBuffer(shopifyBuf);

      // Deduplicate by Handle — tag is product-level
      // collect title and existing tags from first row per handle
      const handleMap = new Map<string, { handle: string; title: string; sku: string; existingTags: string }>();
      for (const row of shopifyRows) {
        const sku = String(row["Variant SKU"] ?? "").trim().toUpperCase();
        const handle = String(row["Handle"] ?? "").trim();
        if (!sku || !handle) continue;
        if (!bsSkuSet.has(sku)) continue;

        if (!handleMap.has(handle)) {
          handleMap.set(handle, {
            handle,
            title: String(row["Title"] ?? "").trim(),
            sku,
            existingTags: String(row["Tags"] ?? "").trim(),
          });
        } else {
          const existing = handleMap.get(handle)!;
          if (!existing.title) existing.title = String(row["Title"] ?? "").trim();
          // tags only appear on the first product row; keep whichever is non-empty
          if (!existing.existingTags) existing.existingTags = String(row["Tags"] ?? "").trim();
        }
      }

      // Determine which SKUs were not found
      const foundSkus = new Set(Array.from(handleMap.values()).map((r) => r.sku));
      const missing = Array.from(bsSkuSet).filter((s) => !foundSkus.has(s));
      setNotFound(missing);

      const output: BestSellerRow[] = Array.from(handleMap.values()).map((r) => {
        // Merge "Best Seller" into existing tags without duplicating
        const existing = r.existingTags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean);
        if (!existing.some((t) => t.toLowerCase() === "best seller")) {
          existing.push("Best Seller");
        }
        return {
          handle: r.handle,
          title: r.title,
          sku: r.sku,
          tags: existing.join(", "),
        };
      });

      setResults(output);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessing(false);
    }
  }, [bsFile, shopifyFile]);

  const handleExportXlsx = useCallback(async () => {
    if (results.length === 0) return;
    const XLSX = await getXLSX();
    const date = new Date().toISOString().slice(0, 10);
    const data = results.map((r, i) => ({
      No: i + 1,
      Handle: r.handle,
      Title: r.title,
      "Variant SKU": r.sku,
      Tags: r.tags,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Best Sellers");
    const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `best_seller_tags_${date}_${results.length}rows.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results]);

  const handleExportCsv = useCallback(async () => {
    if (results.length === 0) return;
    const XLSX = await getXLSX();
    const date = new Date().toISOString().slice(0, 10);
    const data = results.map((r, i) => ({
      No: i + 1,
      Handle: r.handle,
      Title: r.title,
      "Variant SKU": r.sku,
      Tags: r.tags,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `best_seller_tags_${date}_${results.length}rows.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [results]);

  const canProcess = !!bsFile && !!shopifyFile && !processing;

  return (
    <div className="flex-1 flex flex-col min-h-0 p-4 gap-4 overflow-y-auto">
      {/* Controls row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* File drop zone */}
        <div
          {...getRootProps()}
          className={cn(
            "border rounded-md p-3 cursor-pointer transition-all duration-200 min-w-[200px]",
            isDragActive && "border-accent bg-blue-50 scale-[1.02]",
            bsFile
              ? "border-emerald-300 bg-emerald-50"
              : "border-edge hover:border-muted bg-white"
          )}
        >
          <input {...getInputProps()} />
          <div className="flex items-center gap-2">
            {bsFile ? (
              <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
            ) : (
              <Upload size={14} className="text-muted shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary truncate max-w-[160px]">
                {bsFile ? bsFile.name : "Best Seller File"}
              </p>
              <p className="text-[10px] text-muted mt-0.5">
                {bsFile ? "Click to replace" : "Drop .xlsx / .csv here"}
              </p>
            </div>
            {bsFile && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setBsFile(null);
                  setResults([]);
                  setNotFound([]);
                }}
                className="ml-1 text-muted hover:text-red-500 transition-colors cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        {/* Shopify file status */}
        <span className={cn("text-[11px]", shopifyFile ? "text-emerald-600" : "text-orange-500")}>
          {shopifyFile
            ? `✓ Shopify: ${shopifyFile.name}`
            : "⚠ Upload Shopify file first (main tab)"}
        </span>

        <Button
          variant="accent"
          size="sm"
          onClick={handleProcess}
          disabled={!canProcess}
        >
          {processing ? (
            <Loader2 size={14} className="animate-spin mr-1.5" />
          ) : (
            <Play size={12} className="mr-1.5" />
          )}
          {processing ? "Processing..." : "Process"}
        </Button>

        {results.length > 0 && (
          <>
            <Button variant="outline" size="sm" onClick={handleExportXlsx}>
              <Download size={12} className="mr-1.5" />
              Export XLSX
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download size={12} className="mr-1.5" />
              Export CSV
            </Button>
            <span className="text-[11px] text-muted font-mono">
              {results.length} product{results.length !== 1 ? "s" : ""} matched
            </span>
          </>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 rounded bg-red-50 border border-red-200 text-red-600 text-xs font-mono shrink-0">
          {error}
        </div>
      )}

      {/* Not found warning */}
      {notFound.length > 0 && (
        <div className="px-3 py-2 rounded bg-amber-50 border border-amber-200 text-amber-700 text-xs font-mono shrink-0">
          {notFound.length} SKU(s) not found in Shopify data:{" "}
          {notFound.slice(0, 10).join(", ")}
          {notFound.length > 10 ? ` …+${notFound.length - 10} more` : ""}
        </div>
      )}

      {/* Results table */}
      {results.length > 0 && (
        <div className="flex-1 min-h-0 overflow-auto border border-edge rounded-md">
          <table className="w-full text-xs font-mono border-collapse">
            <thead className="sticky top-0 bg-surface z-10 border-b border-edge">
              <tr>
                <th className="px-3 py-2 text-left text-[11px] text-muted font-semibold w-10">No</th>
                <th className="px-3 py-2 text-left text-[11px] text-muted font-semibold">Handle</th>
                <th className="px-3 py-2 text-left text-[11px] text-muted font-semibold">Title</th>
                <th className="px-3 py-2 text-left text-[11px] text-muted font-semibold">SKU</th>
                <th className="px-3 py-2 text-left text-[11px] text-muted font-semibold">Tags</th>
              </tr>
            </thead>
            <tbody>
              {results.map((row, i) => (
                <tr
                  key={row.handle}
                  className={cn(
                    "border-b border-edge last:border-0",
                    i % 2 === 0 ? "bg-white" : "bg-surface/30"
                  )}
                >
                  <td className="px-3 py-1.5 text-muted">{i + 1}</td>
                  <td className="px-3 py-1.5 text-primary">{row.handle}</td>
                  <td className="px-3 py-1.5 text-primary max-w-[280px] truncate">{row.title}</td>
                  <td className="px-3 py-1.5 text-primary">{row.sku}</td>
                  <td className="px-3 py-1.5">
                    <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-[10px] font-semibold">
                      {row.tags}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Empty state */}
      {results.length === 0 && !processing && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted">
            <p className="text-sm font-medium">No results yet</p>
            <p className="text-[11px] mt-1">Upload best seller file and click Process</p>
          </div>
        </div>
      )}
    </div>
  );
}
