"use client";

import { useRef, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { parseFileBuffer } from "@/lib/parsers";
import { cn, formatInteger } from "@/lib/utils";
import { StatChip } from "@/components/status-badge/status-badge";
import { useRFMStore } from "@/lib/rfm-store";
import { SEGMENT_META } from "@/lib/rfm-types";
import type { RFMWorkerResponse, SegmentLabel } from "@/lib/rfm-types";
import { ElbowChart } from "@/components/rfm/ElbowChart";
import { RFMScatterPlot } from "@/components/rfm/RFMScatterPlot";
import { SegmentDashboard } from "@/components/rfm/SegmentDashboard";
import { CustomerTable } from "@/components/rfm/CustomerTable";
import { RFMUploader } from "@/components/rfm/RFMUploader";
import { Users2, BarChart2, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type RFMTab = "customer" | "product";

const TABS: { key: RFMTab; label: string; icon: React.ElementType }[] = [
  { key: "customer", label: "Customer Segmentation", icon: Users2 },
  { key: "product",  label: "Product Performance",   icon: BarChart2 },
];

// ── Inner component (uses useSearchParams — must be inside Suspense) ──────────
function RFMAnalysisInner() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const tab          = (searchParams.get("tab") ?? "customer") as RFMTab;

  const workerRef   = useRef<Worker | null>(null);
  const fileNameRef = useRef<string>("");

  const customers      = useRFMStore((s) => s.customers);
  const centroids      = useRFMStore((s) => s.centroids);
  const elbowData      = useRFMStore((s) => s.elbowData);
  const optimalK       = useRFMStore((s) => s.optimalK);
  const dateRange      = useRFMStore((s) => s.dateRange);
  const fileName       = useRFMStore((s) => s.fileName);
  const procState      = useRFMStore((s) => s.processingState);
  const progStep       = useRFMStore((s) => s.progressStep);
  const progPct        = useRFMStore((s) => s.progressPct);
  const progMsg        = useRFMStore((s) => s.progressMsg);
  const error          = useRFMStore((s) => s.error);
  const segmentFilter  = useRFMStore((s) => s.segmentFilter);

  const setResult        = useRFMStore((s) => s.setResult);
  const setProgress      = useRFMStore((s) => s.setProgress);
  const setProcessing    = useRFMStore((s) => s.setProcessing);
  const setError         = useRFMStore((s) => s.setError);
  const reset            = useRFMStore((s) => s.reset);
  const setSegmentFilter = useRFMStore((s) => s.setSegmentFilter);

  // ── Worker lifecycle ─────────────────────────────────────────────────────────
  useEffect(() => {
    workerRef.current = new Worker(
      new URL("../../workers/rfm.worker.ts", import.meta.url)
    );

    workerRef.current.onmessage = (e: MessageEvent<RFMWorkerResponse>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        setProgress(msg.step, msg.progress, msg.message);
      } else if (msg.type === "result") {
        setResult(msg.data, fileNameRef.current);
      } else if (msg.type === "error") {
        setError(msg.message);
      }
    };

    workerRef.current.onerror = (err) => setError(err.message || "Worker error");

    return () => workerRef.current?.terminate();
  }, [setProgress, setResult, setError]);

  // ── File handler ─────────────────────────────────────────────────────────────
  const handleRun = useCallback(
    async (file: File) => {
      if (!workerRef.current) return;
      setProcessing();
      fileNameRef.current = file.name;
      try {
        const buffer = await file.arrayBuffer();
        const rows   = await parseFileBuffer(buffer);
        workerRef.current.postMessage({ type: "analyze", rows });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [setProcessing, setError]
  );

  // ── Tab navigation ───────────────────────────────────────────────────────────
  const handleTabChange = useCallback(
    (t: RFMTab) => {
      router.push(`/rfm-analysis?tab=${t}`, { scroll: false });
    },
    [router]
  );

  // ── Derived data ─────────────────────────────────────────────────────────────
  const segmentLabels = useMemo(() => {
    const map: Record<number, SegmentLabel> = {};
    for (const c of customers) map[c.clusterId] = c.segmentLabel;
    return map;
  }, [customers]);

  const summaryStats = useMemo(() => {
    const total   = customers.length;
    const avgFreq = total ? customers.reduce((s, c) => s + c.frequency, 0) / total : 0;
    const avgMon  = total ? customers.reduce((s, c) => s + c.monetary,  0) / total : 0;
    const bySegment = (Object.keys(SEGMENT_META) as SegmentLabel[]).map((label) => ({
      label,
      count: customers.filter((c) => c.segmentLabel === label).length,
    }));
    return { total, avgFreq, avgMon, bySegment };
  }, [customers]);

  const isLoaded    = procState === "done" && customers.length > 0;
  const isUploading = procState === "idle" || procState === "processing" || procState === "error";

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-base">

      {/* Page header */}
      <div className="shrink-0 border-b border-edge bg-surface px-5 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-primary">RFM Analysis</h1>
          <p className="text-[11px] text-muted font-mono mt-0.5">
            {isLoaded && fileName && tab === "customer"
              ? `${fileName}${dateRange ? ` · ${dateRange.from} – ${dateRange.to}` : ""}`
              : "Customer segmentation & product clustering"}
          </p>
        </div>
        {isLoaded && tab === "customer" && (
          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-[11px] text-muted hover:text-red-500 transition-colors cursor-pointer"
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* Tab bar */}
      <div className="shrink-0 border-b border-edge bg-surface px-5 flex items-end">
        {TABS.map((t) => {
          const Icon     = t.icon;
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => handleTabChange(t.key)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 -mb-px transition-colors",
                isActive
                  ? "text-accent border-accent"
                  : "text-muted border-transparent hover:text-primary"
              )}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Customer Segmentation tab ──────────────────────────────────────────── */}
      {tab === "customer" && (
        <>
          {/* Upload / Progress / Error state */}
          {isUploading && (
            <div className="flex-1 overflow-y-auto">
              <div className="max-w-2xl mx-auto px-5 py-8 space-y-4">

                {/* Processing progress */}
                {procState === "processing" && (
                  <div className="bg-white rounded-xl border border-edge p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center shrink-0">
                        <Users2 size={16} className="text-accent animate-pulse" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-primary">{progStep || "Processing…"}</p>
                        <p className="text-[11px] text-muted font-mono truncate">{progMsg}</p>
                      </div>
                      <span className="text-[12px] font-mono font-bold text-accent shrink-0">{progPct}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all duration-300"
                        style={{ width: `${progPct}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Error */}
                {procState === "error" && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12px] font-semibold text-red-700 mb-1">Analysis failed</p>
                      <p className="text-[11px] text-red-600 font-mono break-all">{error}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={reset} className="shrink-0">
                      Try Again
                    </Button>
                  </div>
                )}

                {/* Uploader */}
                {procState !== "processing" && (
                  <div className={cn("bg-white rounded-xl border border-edge p-5", procState === "error" && "opacity-75")}>
                    <RFMUploader onRun={handleRun} isProcessing={false} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Main dashboard (data loaded) */}
          {isLoaded && (
            <div className="flex-1 min-h-0 overflow-y-auto">
              <div className="p-5 space-y-5">

                {/* Summary stats + segment filter chips */}
                <div className="flex items-center gap-2 flex-wrap">
                  <StatChip label="Customers"   value={summaryStats.total}                       accent />
                  <StatChip label="Clusters"    value={optimalK} />
                  <StatChip label="Avg Orders"  value={summaryStats.avgFreq.toFixed(1)} />
                  <StatChip label="Avg Revenue" value={`€${formatInteger(summaryStats.avgMon)}`} />
                  {dateRange && <StatChip label="Period" value={`${dateRange.from} – ${dateRange.to}`} />}

                  {summaryStats.bySegment.filter((s) => s.count > 0).map((s) => {
                    const meta   = SEGMENT_META[s.label];
                    const active = segmentFilter === s.label;
                    return (
                      <button
                        key={s.label}
                        title={meta.label}
                        onClick={() => setSegmentFilter(active ? "all" : s.label)}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-mono transition-all cursor-pointer"
                        style={
                          active
                            ? { background: meta.color, borderColor: meta.color, color: "#fff" }
                            : { borderColor: "#e2e8f0", background: "#fff", color: "#64748b" }
                        }
                      >
                        {meta.emoji} {s.label} · {s.count}
                      </button>
                    );
                  })}

                  {segmentFilter !== "all" && (
                    <button
                      onClick={() => setSegmentFilter("all")}
                      className="flex items-center gap-1 text-[11px] text-muted hover:text-red-500 transition-colors cursor-pointer"
                    >
                      <X size={11} /> Clear filter
                    </button>
                  )}
                </div>

                {/* Charts row */}
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
                  <div className="lg:col-span-2 bg-white rounded-xl border border-edge p-4">
                    <ElbowChart data={elbowData} optimalK={optimalK} />
                    <p className="text-[11px] text-muted mt-2 text-center font-mono">
                      K optimal yang dipilih:{" "}
                      <strong className="text-accent">{optimalK} cluster</strong>
                    </p>
                  </div>
                  <div className="lg:col-span-3 bg-white rounded-xl border border-edge p-4 relative">
                    <RFMScatterPlot customers={customers} activeSegment={segmentFilter} />
                  </div>
                </div>

                {/* Segment cards */}
                <div className="bg-white rounded-xl border border-edge p-4">
                  <h2 className="text-[12px] font-semibold text-primary mb-3 flex items-center gap-2">
                    <Users2 size={14} className="text-accent" />
                    Segment Overview
                  </h2>
                  <SegmentDashboard
                    centroids={centroids}
                    segmentLabels={segmentLabels}
                    total={customers.length}
                    activeSegment={segmentFilter}
                    onSelect={setSegmentFilter}
                  />
                </div>

                {/* Customer table */}
                <div className="bg-white rounded-xl border border-edge p-4">
                  <h2 className="text-[12px] font-semibold text-primary mb-3 flex items-center gap-2">
                    <Users2 size={14} className="text-accent" />
                    Customer Detail
                    {segmentFilter !== "all" && (
                      <span
                        className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                        style={{ background: SEGMENT_META[segmentFilter].color }}
                      >
                        {SEGMENT_META[segmentFilter].emoji} {segmentFilter}
                      </span>
                    )}
                  </h2>
                  <CustomerTable
                    customers={customers}
                    activeSegment={segmentFilter}
                    onSegmentChange={setSegmentFilter}
                  />
                </div>

              </div>
            </div>
          )}
        </>
      )}

      {/* ── Product Performance tab ────────────────────────────────────────────── */}
      {tab === "product" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
          <div className="w-12 h-12 rounded-2xl bg-surface border border-edge flex items-center justify-center">
            <BarChart2 size={22} className="text-muted/50" />
          </div>
          <p className="text-[13px] font-semibold text-primary">Product Performance</p>
          <p className="text-[12px] text-muted max-w-xs">
            Product clustering by revenue, margin, sell-through rate, and days on hand.
            Coming in the next step.
          </p>
        </div>
      )}

    </div>
  );
}

// ── Default export wraps inner component in Suspense (required for useSearchParams) ──
export default function RFMAnalysisPage() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <RFMAnalysisInner />
    </Suspense>
  );
}
