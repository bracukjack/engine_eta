"use client";

import { useRef, useEffect, useCallback, useMemo, useState } from "react";
import { useDropzone } from "react-dropzone";
import { parseFileBuffer } from "@/lib/parsers";
import { cn, formatInteger } from "@/lib/utils";
import { StatChip } from "@/components/status-badge/status-badge";
import { Button } from "@/components/ui/button";
import { useRFMStore } from "@/lib/rfm-store";
import { SEGMENT_META } from "@/lib/rfm-types";
import type { RFMWorkerResponse, SegmentLabel } from "@/lib/rfm-types";
import { ElbowChart } from "@/components/rfm/ElbowChart";
import { RFMScatterPlot } from "@/components/rfm/RFMScatterPlot";
import { SegmentDashboard } from "@/components/rfm/SegmentDashboard";
import { CustomerTable } from "@/components/rfm/CustomerTable";
import {
  Upload, Users2, X, Loader2, AlertCircle, TrendingUp,
} from "lucide-react";

export default function RFMAnalysisPage() {
  const workerRef = useRef<Worker | null>(null);

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

  const setResult         = useRFMStore((s) => s.setResult);
  const setProgress       = useRFMStore((s) => s.setProgress);
  const setProcessing     = useRFMStore((s) => s.setProcessing);
  const setError          = useRFMStore((s) => s.setError);
  const reset             = useRFMStore((s) => s.reset);
  const setSegmentFilter  = useRFMStore((s) => s.setSegmentFilter);

  // ── Worker lifecycle ─────────────────────────────────────────────────────
  useEffect(() => {
    workerRef.current = new Worker(
      new URL("../../workers/rfm.worker.ts", import.meta.url)
    );
    workerRef.current.onmessage = (e: MessageEvent<RFMWorkerResponse>) => {
      const msg = e.data;
      if (msg.type === "progress") {
        setProgress(msg.step, msg.progress, msg.message);
      } else if (msg.type === "result") {
        setResult(msg.data, workerRef.current!["_fileName"] ?? "");
      } else if (msg.type === "error") {
        setError(msg.message);
      }
    };
    workerRef.current.onerror = (err) => setError(err.message || "Worker error");
    return () => workerRef.current?.terminate();
  }, [setProgress, setResult, setError]);

  // ── File handler ─────────────────────────────────────────────────────────
  const handleFile = useCallback(
    async (file: File) => {
      if (!workerRef.current) return;
      setProcessing();
      (workerRef.current as Worker & { _fileName: string })._fileName = file.name;
      try {
        const buffer = await file.arrayBuffer();
        const rows   = await parseFileBuffer(buffer);
        workerRef.current.postMessage({ type: "analyze", rows });
        // Patch: once result arrives, the store fileName comes from setResult call above,
        // but we pass it here via a second setResult call after the worker responds.
        // We store the name on the worker ref and use it in onmessage.
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [setProcessing, setError]
  );

  // Fix: override setResult to capture fileName properly
  // (worker onmessage sets it from workerRef._fileName)
  useEffect(() => {
    if (!workerRef.current) return;
    const orig = workerRef.current.onmessage;
    workerRef.current.onmessage = (e: MessageEvent<RFMWorkerResponse>) => {
      const msg = e.data;
      if (msg.type === "result") {
        const fname = (workerRef.current as Worker & { _fileName?: string })._fileName ?? "";
        setResult(msg.data, fname);
      } else {
        (orig as EventListener)?.(e);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setResult]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => { if (files[0]) handleFile(files[0]); },
    accept: {
      "text/csv":   [".csv"],
      "text/plain": [".txt"],
      "application/vnd.ms-excel": [".csv"],
    },
    multiple: false,
  });

  // ── Derived data ─────────────────────────────────────────────────────────
  // Build segmentLabels map: clusterId → SegmentLabel (from customers)
  const segmentLabels = useMemo(() => {
    const map: Record<number, SegmentLabel> = {};
    for (const c of customers) {
      map[c.clusterId] = c.segmentLabel;
    }
    return map;
  }, [customers]);

  const summaryStats = useMemo(() => {
    const total   = customers.length;
    const bySegment = Object.entries(SEGMENT_META).map(([label]) => ({
      label: label as SegmentLabel,
      count: customers.filter((c) => c.segmentLabel === label).length,
    }));
    const avgFreq = total ? customers.reduce((s, c) => s + c.frequency, 0) / total : 0;
    const avgMon  = total ? customers.reduce((s, c) => s + c.monetary, 0) / total : 0;
    return { total, bySegment, avgFreq, avgMon };
  }, [customers]);

  const isLoaded = procState === "done" && customers.length > 0;

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-base">

      {/* Page header */}
      <div className="shrink-0 border-b border-edge bg-surface px-5 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-primary">RFM Analysis</h1>
          <p className="text-[11px] text-muted font-mono mt-0.5">
            {fileName
              ? `${fileName}${dateRange ? ` · ${dateRange.from} – ${dateRange.to}` : ""}`
              : "Upload a Sales Orders CSV to begin"}
          </p>
        </div>
        {isLoaded && (
          <button
            onClick={reset}
            className="flex items-center gap-1.5 text-[11px] text-muted hover:text-red-500 transition-colors cursor-pointer"
          >
            <X size={12} /> Clear
          </button>
        )}
      </div>

      {/* Feature tab */}
      <div className="shrink-0 border-b border-edge bg-surface px-5 flex items-end">
        <button className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium text-accent border-b-2 border-accent -mb-px">
          <Users2 size={13} />
          Customer Segmentation
        </button>
      </div>

      {/* ── Idle / Loading / Error ─────────────────────────────────────────── */}
      {!isLoaded ? (
        <div className="flex-1 flex items-center justify-center p-8">
          {procState === "processing" ? (
            <div className="w-full max-w-sm text-center space-y-4">
              <Loader2 size={32} className="mx-auto text-accent animate-spin" />
              <div>
                <p className="text-sm font-semibold text-primary">{progStep || "Processing…"}</p>
                <p className="text-[11px] text-muted font-mono mt-0.5">{progMsg}</p>
              </div>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-300"
                  style={{ width: `${progPct}%` }}
                />
              </div>
              <p className="text-[11px] text-muted font-mono">{progPct}%</p>
            </div>
          ) : procState === "error" ? (
            <div className="text-center space-y-3 max-w-md">
              <AlertCircle size={32} className="mx-auto text-red-400" />
              <p className="text-sm font-semibold text-red-600">Analysis failed</p>
              <p className="text-xs text-muted font-mono break-all">{error}</p>
              <Button variant="outline" size="sm" onClick={reset}>Try Again</Button>
            </div>
          ) : (
            /* Drop zone */
            <div
              {...getRootProps()}
              className={cn(
                "relative flex flex-col items-center justify-center w-full max-w-lg mx-auto py-20 rounded-2xl border-2 border-dashed cursor-pointer transition-all",
                isDragActive
                  ? "border-accent bg-accent/5 animate-drop"
                  : "border-edge hover:border-accent/40 hover:bg-surface-hover"
              )}
            >
              <input {...getInputProps()} />
              <div className={cn(
                "w-16 h-16 rounded-2xl flex items-center justify-center mb-5 transition-colors",
                isDragActive ? "bg-accent/10" : "bg-surface border border-edge"
              )}>
                <TrendingUp size={28} className={isDragActive ? "text-accent" : "text-muted/60"} />
              </div>
              <p className="text-sm font-semibold text-primary mb-1">
                {isDragActive ? "Drop the CSV file here" : "Upload Sales Orders CSV"}
              </p>
              <p className="text-[12px] text-muted text-center max-w-xs">
                Needs columns: <span className="font-mono text-[11px]">Header</span>,{" "}
                <span className="font-mono text-[11px]">Ordered byCode</span>,{" "}
                <span className="font-mono text-[11px]">Order date</span>,{" "}
                <span className="font-mono text-[11px]">Net price</span>
              </p>
              <p className="text-[11px] text-muted/50 mt-4 font-mono">
                Date format: DD-MM-YYYY · Supports .csv / .txt (tab/comma delimited)
              </p>

              {/* Example */}
              <div className="mt-5 rounded-lg border border-edge bg-slate-50 px-4 py-2 text-[10px] font-mono text-muted w-full max-w-sm overflow-x-auto">
                <div className="text-muted/50 mb-1">Expected format (tab or comma):</div>
                <div>Header · Order number · Ordered byCode · Order date · Net price</div>
                <div>H · 77201 · 2513 · 01-01-2026 · </div>
                <div> · 77201 · 2513 · 01-01-2026 · 19.95</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── Main dashboard ───────────────────────────────────────────────── */
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-5 space-y-6">

            {/* Summary stats */}
            <div className="flex items-center gap-2 flex-wrap">
              <StatChip label="Customers"   value={summaryStats.total} accent />
              <StatChip label="Segments"    value={optimalK} />
              <StatChip label="Avg Orders"  value={summaryStats.avgFreq.toFixed(1)} />
              <StatChip label="Avg Revenue" value={`€${formatInteger(summaryStats.avgMon)}`} />
              {dateRange && (
                <StatChip label="Period" value={`${dateRange.from} – ${dateRange.to}`} />
              )}
              {/* Segment counts */}
              {summaryStats.bySegment.filter((s) => s.count > 0).map((s) => (
                <button
                  key={s.label}
                  onClick={() => setSegmentFilter(segmentFilter === s.label ? "all" : s.label)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded border text-[11px] font-mono transition-all cursor-pointer",
                    segmentFilter === s.label
                      ? "border-current text-white shadow-sm"
                      : "border-edge bg-white text-muted hover:text-primary hover:border-primary/30"
                  )}
                  style={segmentFilter === s.label
                    ? { background: SEGMENT_META[s.label].color, borderColor: SEGMENT_META[s.label].color }
                    : undefined}
                >
                  {SEGMENT_META[s.label].emoji} {s.label} · {s.count}
                </button>
              ))}
              {segmentFilter !== "all" && (
                <button
                  onClick={() => setSegmentFilter("all")}
                  className="flex items-center gap-1 text-[11px] text-muted hover:text-red-500 transition-colors"
                >
                  <X size={11} /> Clear filter
                </button>
              )}
            </div>

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
              {/* Elbow chart — left, narrower */}
              <div className="lg:col-span-2 bg-white rounded-xl border border-edge p-4">
                <ElbowChart data={elbowData} optimalK={optimalK} />
                <p className="text-[11px] text-muted mt-2 text-center font-mono">
                  K optimal yang dipilih:{" "}
                  <strong className="text-accent">{optimalK} cluster</strong>
                </p>
              </div>

              {/* Scatter plot — right, wider */}
              <div className="lg:col-span-3 bg-white rounded-xl border border-edge p-4 relative">
                <RFMScatterPlot customers={customers} activeSegment={segmentFilter} />
              </div>
            </div>

            {/* Segment dashboard cards */}
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
                <Upload size={14} className="text-accent" />
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
              <CustomerTable customers={customers} activeSegment={segmentFilter} />
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
