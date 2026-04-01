"use client";

import { useRef, useCallback, useEffect, useState, Suspense, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import type {
  AnalysisResults,
  WorkerFilters,
  WorkerMessage,
  FileSlot,
  AnalysisTab,
  RankingWeights,
} from "@/lib/association-rules/types";
import { DEFAULT_WORKER_FILTERS, EMPTY_FILE_SLOT } from "@/lib/association-rules/types";
import { cn } from "@/lib/utils";
import { parseFileBuffer } from "@/lib/parsers";
import { FileUploadZone } from "@/components/association-rules/FileUploadZone";
import { RuleControls } from "@/components/association-rules/RuleControls";
import { RulesTable } from "@/components/association-rules/RulesTable";
import { CategoryHeatmap } from "@/components/association-rules/CategoryHeatmap";
import { RevenueOpportunities } from "@/components/association-rules/RevenueOpportunities";
import { BundleGrid } from "@/components/association-rules/BundleGrid";
import { KpiBar } from "@/components/association-rules/KpiBar";
import { ProgressBar } from "@/components/association-rules/ProgressBar";
import { SequentialRulesTab } from "@/components/association-rules/SequentialRulesTab";
import { SalespersonTable } from "@/components/association-rules/SalespersonTable";
import { SeasonalInsights } from "@/components/association-rules/SeasonalInsights";
import { ConflictsPanel } from "@/components/association-rules/ConflictsPanel";
import { Button } from "@/components/ui/button";
import { Play, Loader2, X } from "lucide-react";
import { idbStorage } from "@/lib/idb-storage";

const ASSOC_RESULTS_KEY = "association-results";

type ProcessingState = "idle" | "processing" | "done" | "error";

const TABS: { key: AnalysisTab; label: string }[] = [
  { key: "recommendations", label: "Item Recommendations" },
  { key: "categories", label: "Category Insights" },
  { key: "revenue", label: "Revenue Opportunities" },
  { key: "bundles", label: "Bundles" },
  { key: "sequential", label: "Sequential" },
  { key: "salesperson", label: "Salesperson" },
  { key: "seasonal", label: "Seasonal" },
  { key: "conflicts", label: "Conflicts" },
];

const DEFAULT_RANKING_WEIGHTS: RankingWeights = {
  lift: 0.3,
  confidence: 0.2,
  profitLift: 0.2,
  stockScore: 0.2,
  support: 0.1,
};

function AssociationRulesInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const workerRef = useRef<Worker | null>(null);

  // ── File state ───────────────────────────────────────────────────────────
  const [salesSlot, setSalesSlot] = useState<FileSlot>(EMPTY_FILE_SLOT);
  const [productSlot, setProductSlot] = useState<FileSlot>(EMPTY_FILE_SLOT);
  const [stockSlot, setStockSlot] = useState<FileSlot>(EMPTY_FILE_SLOT);

  // Parsed rows kept in refs to avoid re-renders on large data
  const salesRowsRef = useRef<Record<string, string>[]>([]);
  const productRowsRef = useRef<Record<string, string>[]>([]);
  const stockRowsRef = useRef<Record<string, string>[]>([]);

  // ── Processing state ─────────────────────────────────────────────────────
  const [processingState, setProcessingState] =
    useState<ProcessingState>("idle");
  const [progress, setProgress] = useState<{
    step: string;
    pct: number;
    message: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<AnalysisResults | null>(null);

  // ── Filters ──────────────────────────────────────────────────────────────
  const [filters, setFilters] = useState<WorkerFilters>(DEFAULT_WORKER_FILTERS);

  // Display-only filters (applied client-side, no re-run needed)
  const [hideOutOfStock, setHideOutOfStock] = useState(true);
  const [sortByRevenue, setSortByRevenue] = useState(false);
  const [optimizeProfit, setOptimizeProfit] = useState(false);
  const [rankingWeights, setRankingWeights] = useState<RankingWeights>(DEFAULT_RANKING_WEIGHTS);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [isPending, startTransition] = useTransition();
  const tab = (searchParams.get("tab") ?? "recommendations") as AnalysisTab;
  const setTab = useCallback((t: AnalysisTab) => {
    startTransition(() => {
      router.replace(`?tab=${t}`, { scroll: false });
    });
  }, [router]);

  // ── IDB persistence ──────────────────────────────────────────────────────

  // Load persisted results on mount
  useEffect(() => {
    idbStorage.getItem(ASSOC_RESULTS_KEY).then((v) => {
      if (!v) return;
      try {
        const stored = JSON.parse(v) as AnalysisResults;
        setResults(stored);
        setProcessingState("done");
      } catch {
        // corrupt data — ignore
      }
    });
  }, []);

  // Save results to IDB whenever they change
  useEffect(() => {
    if (results !== null) {
      idbStorage.setItem(ASSOC_RESULTS_KEY, JSON.stringify(results));
    }
  }, [results]);

  const handleReset = useCallback(() => {
    setResults(null);
    setProcessingState("idle");
    setError(null);
    setProgress(null);
    idbStorage.removeItem(ASSOC_RESULTS_KEY);
  }, []);

  // ── Worker init ──────────────────────────────────────────────────────────
  useEffect(() => {
    workerRef.current = new Worker(
      new URL("../../workers/association.worker.ts", import.meta.url)
    );

    workerRef.current.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        setProgress({ step: msg.step, pct: msg.pct, message: msg.message });
      } else if (msg.type === "done") {
        setResults(msg.results);
        setProcessingState("done");
        setProgress({ step: "Complete", pct: 100, message: "Done!" });
      } else if (msg.type === "error") {
        setError(msg.message);
        setProcessingState("error");
      }
    };

    workerRef.current.onerror = (err) => {
      setError(err.message || "Worker encountered an error");
      setProcessingState("error");
    };

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // ── File handlers ────────────────────────────────────────────────────────

  const handleFile = useCallback(
    async (
      type: "sales" | "product" | "stock",
      file: File
    ) => {
      const setSlot =
        type === "sales"
          ? setSalesSlot
          : type === "product"
            ? setProductSlot
            : setStockSlot;
      const rowsRef =
        type === "sales"
          ? salesRowsRef
          : type === "product"
            ? productRowsRef
            : stockRowsRef;

      setSlot({ file, status: "parsing", rowCount: 0, error: null });

      try {
        const buffer = await file.arrayBuffer();
        const rows = await parseFileBuffer(buffer);
        rowsRef.current = rows as Record<string, string>[];
        setSlot({
          file,
          status: "parsed",
          rowCount: rows.length,
          error: null,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Parse error";
        rowsRef.current = [];
        setSlot({ file, status: "error", rowCount: 0, error: msg });
      }
    },
    []
  );

  const handleRemoveFile = useCallback(
    (type: "sales" | "product" | "stock") => {
      const setSlot =
        type === "sales"
          ? setSalesSlot
          : type === "product"
            ? setProductSlot
            : setStockSlot;
      const rowsRef =
        type === "sales"
          ? salesRowsRef
          : type === "product"
            ? productRowsRef
            : stockRowsRef;

      setSlot(EMPTY_FILE_SLOT);
      rowsRef.current = [];
    },
    []
  );

  // ── Run analysis ─────────────────────────────────────────────────────────

  const allParsed =
    salesSlot.status === "parsed" &&
    productSlot.status === "parsed" &&
    stockSlot.status === "parsed";
  const canRun = allParsed && processingState !== "processing";

  const handleRun = useCallback(() => {
    if (!canRun || !workerRef.current) return;
    setProcessingState("processing");
    setProgress(null);
    setError(null);
    setResults(null);
    workerRef.current.postMessage({
      type: "start",
      salesRows: salesRowsRef.current,
      productRows: productRowsRef.current,
      stockRows: stockRowsRef.current,
      filters,
    });
  }, [canRun, filters]);

  // Available item groups from results (for filter checkboxes)
  const availableItemGroups = results?.itemGroups ?? [];

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-edge bg-surface px-4 py-3 space-y-2.5">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-sm font-semibold text-primary tracking-tight mr-2">
            Association Rules
          </h1>

          <Button
            variant="accent"
            size="sm"
            onClick={handleRun}
            disabled={!canRun}
          >
            {processingState === "processing" ? (
              <Loader2 size={14} className="animate-spin mr-1.5" />
            ) : (
              <Play size={12} className="mr-1.5" />
            )}
            {processingState === "processing" ? "Mining..." : "Run Analysis"}
          </Button>

          {results !== null && (
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 text-[11px] text-muted hover:text-red-500 transition-colors cursor-pointer"
            >
              <X size={12} />
              Reset Data
            </button>
          )}

          {!allParsed && (
            <span className="text-[11px] text-muted">
              Upload all 3 files to enable analysis
            </span>
          )}
        </div>

        {/* File upload zones */}
        <FileUploadZone
          salesSlot={salesSlot}
          productSlot={productSlot}
          stockSlot={stockSlot}
          onSalesFile={(f) => handleFile("sales", f)}
          onProductFile={(f) => handleFile("product", f)}
          onStockFile={(f) => handleFile("stock", f)}
          onRemoveSales={() => handleRemoveFile("sales")}
          onRemoveProduct={() => handleRemoveFile("product")}
          onRemoveStock={() => handleRemoveFile("stock")}
        />

        {/* Progress */}
        {processingState === "processing" && progress && (
          <ProgressBar
            step={progress.step}
            pct={progress.pct}
            message={progress.message}
          />
        )}

        {/* Error */}
        {error && (
          <div className="px-3 py-2 rounded bg-red-50 border border-red-200 text-red-600 text-xs font-mono">
            {error}
          </div>
        )}

        {/* KPI bar */}
        {results && <KpiBar stats={results.stats} />}
      </div>

      {/* ── Main Content ──────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel: Controls */}
        <div className="w-[240px] shrink-0 border-r border-edge bg-surface/50 p-3 overflow-y-auto">
          <RuleControls
            filters={filters}
            onFiltersChange={setFilters}
            availableItemGroups={availableItemGroups}
            hideOutOfStock={hideOutOfStock}
            onHideOutOfStockChange={setHideOutOfStock}
            sortByRevenue={sortByRevenue}
            onSortByRevenueChange={setSortByRevenue}
            optimizeProfit={optimizeProfit}
            onOptimizeProfitChange={setOptimizeProfit}
            rankingWeights={rankingWeights}
            onRankingWeightsChange={setRankingWeights}
          />
        </div>

        {/* Right panel: Tabs */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Tab bar */}
          <div className="shrink-0 flex items-center gap-0 border-b border-edge bg-surface">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-2 text-xs font-semibold transition-colors border-b-2 ${
                  tab === t.key
                    ? "text-accent border-accent"
                    : "text-muted border-transparent hover:text-primary"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className={cn("flex-1 min-h-0 flex flex-col transition-opacity duration-300", isPending ? "opacity-50" : "opacity-100 animate-in fade-in slide-in-from-bottom-2 duration-500 overflow-y-auto")}>
            {tab === "recommendations" && (
              <RulesTable
                rules={results?.itemRules ?? []}
                hideOutOfStock={hideOutOfStock}
                sortByRevenue={sortByRevenue}
              />
            )}
            {tab === "categories" && (
              <CategoryHeatmap
                itemGroupMatrix={results?.itemGroupMatrix ?? []}
                subCategoryMatrix={results?.subCategoryMatrix ?? []}
                crossCategoryRules={results?.crossCategoryRules ?? []}
              />
            )}
            {tab === "revenue" && (
              <RevenueOpportunities
                rules={results?.itemRules ?? []}
                salespersons={results?.salespersons ?? []}
                salespersonItems={results?.salespersonItems ?? {}}
              />
            )}
            {tab === "bundles" && (
              <BundleGrid
                bundles={results?.bundles ?? []}
                smartBundles={results?.smartBundles ?? []}
              />
            )}
            {tab === "sequential" && (
              <SequentialRulesTab rules={results?.sequentialRules ?? []} />
            )}
            {tab === "salesperson" && (
              <SalespersonTable
                metrics={results?.salespersonMetrics ?? []}
                segments={results?.segments ?? []}
              />
            )}
            {tab === "seasonal" && (
              <SeasonalInsights data={results?.seasonalData ?? []} />
            )}
            {tab === "conflicts" && (
              <ConflictsPanel
                negativeRules={results?.negativeRules ?? []}
                cannibalizationPairs={results?.cannibalizationPairs ?? []}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AssociationRulesPage() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <AssociationRulesInner />
    </Suspense>
  );
}
