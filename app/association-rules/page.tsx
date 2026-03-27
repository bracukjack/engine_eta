"use client";

import { useRef, useCallback, useEffect, useState, useMemo } from "react";
import type {
  Rule,
  MiningStats,
  MiningParams,
  FilterParams,
  WorkerMessage,
  DiscountZone,
} from "@/lib/association-rules/types";
import {
  DEFAULT_MINING_PARAMS,
  DEFAULT_FILTER_PARAMS,
} from "@/lib/association-rules/types";
import { getXLSX } from "@/lib/parsers";
import { FileUploadZone } from "@/components/association-rules/FileUploadZone";
import { FilterPanel } from "@/components/association-rules/FilterPanel";
import { RulesTable } from "@/components/association-rules/RulesTable";
import { BundleCards } from "@/components/association-rules/BundleCards";
import { MetricsSummary } from "@/components/association-rules/MetricsSummary";
import { ProgressBar } from "@/components/association-rules/ProgressBar";
import { Button } from "@/components/ui/button";
import { Play, Download, Loader2 } from "lucide-react";

type ProcessingState = "idle" | "processing" | "done" | "error";
type Tab = "rules" | "bundles";

export default function AssociationRulesPage() {
  const workerRef = useRef<Worker | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [processingState, setProcessingState] = useState<ProcessingState>("idle");
  const [progress, setProgress] = useState<{
    step: string;
    pct: number;
    message: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rules, setRules] = useState<Rule[]>([]);
  const [stats, setStats] = useState<MiningStats | null>(null);
  const [channels, setChannels] = useState<string[]>([]);
  const [params, setParams] = useState<MiningParams>(DEFAULT_MINING_PARAMS);
  const [filters, setFilters] = useState<FilterParams>(DEFAULT_FILTER_PARAMS);
  const [tab, setTab] = useState<Tab>("rules");
  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState<DiscountZone | "all">("all");

  // Initialize worker
  useEffect(() => {
    workerRef.current = new Worker(
      new URL("../../workers/association.worker.ts", import.meta.url)
    );

    workerRef.current.onmessage = (e: MessageEvent<WorkerMessage>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        setProgress({ step: msg.step, pct: msg.pct, message: msg.message });
      } else if (msg.type === "channels") {
        setChannels(msg.channels);
      } else if (msg.type === "done") {
        setRules(msg.rules);
        setStats(msg.stats);
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

  const canRun = file !== null && processingState !== "processing";

  const handleRun = useCallback(() => {
    if (!canRun || !workerRef.current || !file) return;
    setProcessingState("processing");
    setProgress(null);
    setError(null);
    setRules([]);
    setStats(null);
    workerRef.current.postMessage({ type: "start", file, params, filters });
  }, [canRun, file, params, filters]);

  const handleRemoveFile = useCallback(() => {
    setFile(null);
    setProcessingState("idle");
    setProgress(null);
    setError(null);
    setRules([]);
    setStats(null);
    setChannels([]);
  }, []);

  const fileStatus = useMemo(() => {
    if (!file) return "empty" as const;
    if (processingState === "done") return "done" as const;
    if (processingState === "processing") return "processing" as const;
    return "ready" as const;
  }, [file, processingState]);

  // Export rules CSV
  const handleExportRules = useCallback(async () => {
    if (rules.length === 0) return;
    const XLSX = await getXLSX();
    const data = rules.map((r) => ({
      Antecedent: r.antecedent.join(", "),
      "Antecedent Names": r.antecedentNames.join(", "),
      Consequent: r.consequent.join(", "),
      "Consequent Names": r.consequentNames.join(", "),
      "Support %": +(r.support * 100).toFixed(2),
      "Confidence %": +(r.confidence * 100).toFixed(2),
      Lift: +r.lift.toFixed(3),
      Count: r.count,
      Zone: r.zone,
      "Recommended Discount %": r.recommendedDiscountPct,
      Action: r.action,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "association_rules.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [rules]);

  // Export bundle suggestions
  const handleExportBundles = useCallback(async () => {
    const bundleRules = rules.filter(
      (r) => r.zone === "green" || r.zone === "yellow"
    );
    if (bundleRules.length === 0) return;
    const XLSX = await getXLSX();
    const data = bundleRules.map((r) => ({
      SKU_A: r.antecedent.join(", "),
      SKU_B: r.consequent.join(", "),
      "Bundle Name": `${r.antecedentNames[0] || r.antecedent[0]} + ${r.consequentNames[0] || r.consequent[0]}`,
      Confidence: +(r.confidence * 100).toFixed(1),
      Lift: +r.lift.toFixed(2),
      "Discount Zone": r.zone,
      "Recommended Discount %": r.recommendedDiscountPct,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bundle_suggestions.csv";
    a.click();
    URL.revokeObjectURL(url);
  }, [rules]);

  return (
    <div className="flex flex-col h-full">
      {/* ── Top Bar ───────────────────────────────────────────────── */}
      <div className="shrink-0 border-b border-edge bg-surface px-4 py-3">
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

          {rules.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={handleExportRules}>
                <Download size={12} className="mr-1.5" />
                Export Rules
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportBundles}>
                <Download size={12} className="mr-1.5" />
                Export Bundles
              </Button>
            </>
          )}
        </div>

        {/* Progress */}
        {processingState === "processing" && progress && (
          <div className="mt-2.5">
            <ProgressBar
              step={progress.step}
              pct={progress.pct}
              message={progress.message}
            />
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="mt-2 px-3 py-2 rounded bg-red-50 border border-red-200 text-red-600 text-xs font-mono">
            {error}
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="mt-2.5">
            <MetricsSummary stats={stats} />
          </div>
        )}
      </div>

      {/* ── Main Content ──────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">
        {/* Left panel: Upload + Filters */}
        <div className="w-[280px] shrink-0 border-r border-edge bg-surface/50 p-3 overflow-y-auto space-y-3">
          <FileUploadZone
            file={file}
            onFile={setFile}
            onRemove={handleRemoveFile}
            status={fileStatus}
          />
          <FilterPanel
            params={params}
            filters={filters}
            channels={channels}
            onParamsChange={setParams}
            onFiltersChange={setFilters}
          />
        </div>

        {/* Right panel: Tabs */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Tab bar */}
          {rules.length > 0 && (
            <div className="shrink-0 flex items-center gap-0 border-b border-edge bg-surface">
              {(
                [
                  { key: "rules" as const, label: "Rules Table" },
                  { key: "bundles" as const, label: "Bundle Cards" },
                ] as const
              ).map((t) => (
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
          )}

          {/* Tab content */}
          {tab === "rules" ? (
            <RulesTable
              rules={rules}
              search={search}
              zoneFilter={zoneFilter}
              onSearchChange={setSearch}
              onZoneFilterChange={setZoneFilter}
            />
          ) : (
            <BundleCards rules={rules} />
          )}
        </div>
      </div>
    </div>
  );
}
