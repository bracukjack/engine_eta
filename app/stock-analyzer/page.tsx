"use client";

import { useCallback, Suspense, lazy } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { parseFileBuffer } from "@/lib/parsers";
import { parseSalesRows } from "@/lib/bestSeller";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useStockStore } from "@/lib/stock-store";
import type { ItemsLookup } from "@/lib/stock-store";
import {
  X,
  PackageSearch, Loader2, AlertCircle,
  TrendingUp,
} from "lucide-react";

import {
  processRows,
  StockFileSlot,
} from "./components/shared";

const RealStockTab = lazy(() => import("./tabs/RealStockTab"));
const BestSellerTab = lazy(() => import("./tabs/BestSellerTab"));

// ── Main Inner Component ─────────────────────────────────────────────────────
function StockAnalyzerInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlTab = searchParams.get("tab") ?? "realStock";
  const urlView = searchParams.get("view") ?? "overview";

  // ── Zustand selectors (only those needed for shell layout) ─────────────────
  const rows             = useStockStore((s) => s.rows);
  const fileName         = useStockStore((s) => s.fileName);
  const processingState  = useStockStore((s) => s.processingState);
  const error            = useStockStore((s) => s.error);
  const itemsFileName    = useStockStore((s) => s.itemsFileName);
  const salesFileName    = useStockStore((s) => s.salesFileName);
  const salesRowCount    = useStockStore((s) => s.salesRowCount);
  const activeTab        = urlTab as "realStock" | "bestSeller";

  const setRows          = useStockStore((s) => s.setRows);
  const setItemsData     = useStockStore((s) => s.setItemsData);
  const clearItemsData   = useStockStore((s) => s.clearItemsData);
  const setProcessing    = useStockStore((s) => s.setProcessing);
  const setError         = useStockStore((s) => s.setError);
  const reset            = useStockStore((s) => s.reset);
  const setSalesData     = useStockStore((s) => s.setSalesData);
  const clearSalesData   = useStockStore((s) => s.clearSalesData);

  // Tab navigation via URL
  const setActiveTab = useCallback((tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    params.delete("view");
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  const setInnerView = useCallback((view: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", view);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  // ── File handlers ────────────────────────────────────────────────────────
  const handleFile = useCallback(
    async (file: File) => {
      setProcessing();
      try {
        const buffer = await file.arrayBuffer();
        const rawData = await parseFileBuffer(buffer);
        const { rows: parsed, summary: s } = processRows(rawData as Record<string, unknown>[]);
        setRows(parsed, s, file.name);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [setRows, setProcessing, setError]
  );

  const handleItemsFile = useCallback(
    async (file: File) => {
      const buffer = await file.arrayBuffer();
      const rawData = await parseFileBuffer(buffer);
      const lookup: ItemsLookup = {};
      for (const r of rawData as Record<string, unknown>[]) {
        const code = String(r["Code"] ?? r["ItemCode"] ?? "").trim();
        if (code) {
          lookup[code] = {
            class01: String(r["Class_01"] ?? r["Class01Description"] ?? ""),
            class06: String(r["Class_06"] ?? r["Class06Description"] ?? ""),
          };
        }
      }
      setItemsData(lookup, file.name);
    },
    [setItemsData]
  );

  const handleSalesFile = useCallback(
    async (file: File) => {
      const buffer = await file.arrayBuffer();
      const rawData = await parseFileBuffer(buffer);
      const salesRows = parseSalesRows(rawData as Record<string, unknown>[]);
      setSalesData(salesRows, file.name);
    },
    [setSalesData]
  );

  const isLoaded = rows.length > 0 && processingState !== "processing";
  const hasBothFiles = isLoaded && salesRowCount > 0;

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-base">

      {/* Page header */}
      <div className="shrink-0 border-b border-edge bg-surface px-5 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-primary">Stock Analyzer</h1>
          <p className="text-[11px] text-muted font-mono mt-0.5">
            {fileName ?? "Upload a CSV file to begin"}
          </p>
        </div>
        {isLoaded && (
          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-[11px] text-muted hover:text-red-500 transition-colors cursor-pointer"
          >
            <X size={12} />
            Clear
          </button>
        )}
      </div>

      {/* Feature tabs */}
      <div className="shrink-0 border-b border-edge bg-surface px-5 flex items-end gap-0">
        <button
          onClick={() => setActiveTab("realStock")}
          type="button"
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium -mb-px transition-colors cursor-pointer",
            activeTab === "realStock"
              ? "text-accent border-b-2 border-accent"
              : "text-muted hover:text-primary border-b-2 border-transparent"
          )}
        >
          <PackageSearch size={13} />
          Real Stock
        </button>
        <button
          onClick={() => hasBothFiles && setActiveTab("bestSeller")}
          type="button"
          disabled={!hasBothFiles}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium -mb-px transition-colors",
            activeTab === "bestSeller"
              ? "text-accent border-b-2 border-accent"
              : hasBothFiles
                ? "text-muted hover:text-primary border-b-2 border-transparent cursor-pointer"
                : "text-muted/40 cursor-not-allowed border-b-2 border-transparent"
          )}
        >
          <TrendingUp size={13} />
          Best Seller
          {salesRowCount > 0 && (
            <span className="bg-accent/10 text-accent text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
              {salesRowCount}
            </span>
          )}
        </button>
      </div>

      {/* Main content: left file panel + right content */}
      <div className="flex flex-1 min-h-0">

        {/* Left panel: file slots */}
        <div className="w-[220px] shrink-0 border-r border-edge bg-surface/50 p-3 space-y-2 overflow-y-auto">
          <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wider px-1 pb-1">
            Input Files
          </h3>
          <StockFileSlot
            label="Stock Positions"
            hint="stock-positions.csv"
            required
            fileName={fileName}
            isReady={isLoaded}
            onDrop={handleFile}
            onClear={reset}
          />
          <StockFileSlot
            label="Items CSV"
            hint="items.csv (optional)"
            fileName={itemsFileName}
            isReady={!!itemsFileName}
            onDrop={handleItemsFile}
            onClear={clearItemsData}
          />
          <StockFileSlot
            label="Sales Orders"
            hint="salesorder.csv"
            fileName={salesFileName}
            isReady={!!salesFileName}
            onDrop={handleSalesFile}
            onClear={clearSalesData}
          />
        </div>

        {/* Right panel */}
        <div className="flex-1 flex flex-col min-h-0">
          {activeTab === "bestSeller" ? (
            <Suspense fallback={
              <div className="flex-1 flex items-center justify-center">
                <Loader2 size={32} className="mx-auto text-accent animate-spin" />
              </div>
            }>
              <BestSellerTab innerView={urlView} onInnerViewChange={setInnerView} />
            </Suspense>
          ) : processingState === "processing" ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-3">
                <Loader2 size={32} className="mx-auto text-accent animate-spin" />
                <p className="text-sm text-muted font-mono">Parsing file…</p>
              </div>
            </div>
          ) : processingState === "error" ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-3 max-w-md">
                <AlertCircle size={32} className="mx-auto text-red-400" />
                <p className="text-sm font-semibold text-red-600">Error loading file</p>
                <p className="text-xs text-muted font-mono break-all">{error}</p>
                <Button variant="outline" size="sm" onClick={reset}>Try Again</Button>
              </div>
            </div>
          ) : !isLoaded ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center space-y-2">
                <PackageSearch size={40} className="mx-auto text-muted/30" />
                <p className="text-sm text-muted">Upload a stock positions file to begin</p>
                <p className="text-[11px] text-muted/50 font-mono">Supports .csv · .xlsx · .xls</p>
              </div>
            </div>
          ) : (
            <Suspense fallback={
              <div className="flex-1 flex items-center justify-center">
                <Loader2 size={32} className="mx-auto text-accent animate-spin" />
              </div>
            }>
              <RealStockTab />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Default export wraps inner component in Suspense (required for useSearchParams) ──
export default function StockAnalyzerPage() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <StockAnalyzerInner />
    </Suspense>
  );
}
