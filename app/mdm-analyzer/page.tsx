"use client";

import { useCallback, Suspense, lazy, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useMDMStore } from "@/lib/mdm-store";
import type { ErrorRow, Country, CountrySource } from "@/lib/mdm-store";
import { getXLSX } from "@/lib/parsers";
import { StockFileSlot } from "@/app/stock-analyzer/components/shared";
import { CheckCircle, AlertTriangle, Loader2, Database } from "lucide-react";

const PublishMDMTab = lazy(() => import("./tabs/PublishMDMTab"));
const ErrorMDMTab = lazy(() => import("./tabs/ErrorMDMTab"));

// ── Tab config (extensible) ───────────────────────────────────────────────────

const MDM_TABS = [
  { id: "publish", label: "Publish MDM", icon: CheckCircle },
  { id: "error", label: "Error MDM", icon: AlertTriangle },
] as const;

type TabId = (typeof MDM_TABS)[number]["id"];

// ── Country derivation ────────────────────────────────────────────────────────

function deriveCountry(
  channels: string,
  attrCodes: string
): { country: Country; source: CountrySource } {
  const ch = channels.trim().toUpperCase();
  if (ch === "FR" || ch === "ES" || ch === "IT" || ch === "DE") {
    return { country: ch as Country, source: "channel" };
  }
  const codes = attrCodes.toLowerCase();
  if (codes.endsWith("_es")) return { country: "ES", source: "attribute-code" };
  if (codes.endsWith("_it")) return { country: "IT", source: "attribute-code" };
  if (codes.endsWith("_de")) return { country: "DE", source: "attribute-code" };
  return { country: "FR", source: "attribute-code" };
}

// ── Error Details parser ──────────────────────────────────────────────────────

async function parseErrorDetails(buffer: ArrayBuffer): Promise<ErrorRow[]> {
  const XLSX = await getXLSX();
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const ws = wb.Sheets["Error Details"];
  if (!ws)
    throw new Error(
      "File does not contain expected sheet 'Error Details'. Please upload the correct MDM Export file."
    );
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  return raw.map((r, i) => {
    const channels = String(r["channels"] ?? "").trim();
    const attributeCodes = String(r["attribute-codes"] ?? "").trim();
    const { country, source } = deriveCountry(channels, attributeCodes);
    return {
      _id: i,
      lineNumber: String(r["line-number"] ?? ""),
      reference: String(r["provider-unique-identifier"] ?? "").trim(),
      channels,
      attributeLabel: String(r["attribute-label"] ?? ""),
      attributeCodes,
      errorCode: String(r["error-code"] ?? ""),
      errorMessage: String(r["error-message"] ?? ""),
      derived_country: country,
      country_source: source,
    };
  });
}

// ── Inner page ────────────────────────────────────────────────────────────────

function MDMAnalyzerInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const mdmFileName = useMDMStore((s) => s.mdmFileName);
  const mdmFile = useMDMStore((s) => s.mdmFile);
  const publishedFileName = useMDMStore((s) => s.publishedFileName);

  const setMdmFile = useMDMStore((s) => s.setMdmFile);
  const clearMdmFile = useMDMStore((s) => s.clearMdmFile);
  const setPublishedFile = useMDMStore((s) => s.setPublishedFile);
  const clearPublishedFile = useMDMStore((s) => s.clearPublishedFile);
  const setErrorState = useMDMStore((s) => s.setErrorState);
  const setErrorError = useMDMStore((s) => s.setErrorError);
  const setErrorResults = useMDMStore((s) => s.setErrorResults);
  const resetError = useMDMStore((s) => s.resetError);
  const resetPublish = useMDMStore((s) => s.resetPublish);

  const activeTab = (searchParams.get("tab") ?? "publish") as TabId;

  const setActiveTab = useCallback(
    (tab: TabId) => {
      startTransition(() => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("tab", tab);
        router.replace(`?${params.toString()}`, { scroll: false });
      });
    },
    [searchParams, router]
  );

  // When MDM Export file is dropped → run Error MDM analysis immediately
  const handleMdmFile = useCallback(
    async (file: File) => {
      setMdmFile(file);
      resetPublish();
      setErrorState("processing");
      try {
        const buffer = await file.arrayBuffer();
        // Small delay so "processing" state renders before heavy sync work
        await new Promise((r) => setTimeout(r, 50));
        const rows = await parseErrorDetails(buffer);
        setErrorResults(rows);
      } catch (e) {
        setErrorError(e instanceof Error ? e.message : String(e));
        setErrorState("error");
      }
    },
    [setMdmFile, resetPublish, setErrorState, setErrorResults, setErrorError]
  );

  const handleClearMdm = useCallback(() => {
    clearMdmFile();
    resetError();
    resetPublish();
  }, [clearMdmFile, resetError, resetPublish]);

  const handlePublishedFile = useCallback(
    (file: File) => {
      setPublishedFile(file);
      resetPublish();
    },
    [setPublishedFile, resetPublish]
  );

  const handleClearPublished = useCallback(() => {
    clearPublishedFile();
    resetPublish();
  }, [clearPublishedFile, resetPublish]);

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-base">

      {/* Page header */}
      <div className="shrink-0 border-b border-edge bg-surface px-5 py-3 flex items-center gap-3">
        <Database size={16} className="text-accent shrink-0" />
        <div>
          <h1 className="text-sm font-semibold text-primary">MDM Analyzer</h1>
          <p className="text-[11px] text-muted font-mono mt-0.5">
            {mdmFileName ?? "Upload MDM Export file to begin"}
          </p>
        </div>
      </div>

      {/* Feature tabs */}
      <div className="shrink-0 border-b border-edge bg-surface px-5 flex items-end gap-0">
        {MDM_TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            type="button"
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium -mb-px transition-colors cursor-pointer",
              activeTab === id
                ? "text-accent border-b-2 border-accent"
                : "text-muted hover:text-primary border-b-2 border-transparent"
            )}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Main content: left file panel + right tab content */}
      <div className="flex flex-1 min-h-0">

        {/* Left panel: file slots */}
        <div className="w-[220px] shrink-0 border-r border-edge bg-surface/50 p-3 space-y-2 overflow-y-auto">
          <h3 className="text-[11px] font-semibold text-muted uppercase tracking-wider px-1 pb-1">
            Input Files
          </h3>
          <StockFileSlot
            label="MDM Export File"
            hint="MDMExport.xlsx"
            required
            fileName={mdmFileName}
            isReady={!!mdmFileName}
            onDrop={handleMdmFile}
            onClear={handleClearMdm}
          />
          <StockFileSlot
            label="Published Products"
            hint="Published.xlsx"
            fileName={publishedFileName}
            isReady={!!publishedFileName}
            onDrop={handlePublishedFile}
            onClear={handleClearPublished}
          />

          {/* Contextual hints */}
          {!mdmFileName && (
            <p className="text-[11px] text-muted/60 px-1 pt-1 leading-relaxed">
              Upload the MDM Export file to analyze errors and compare publish status.
            </p>
          )}
          {mdmFileName && !publishedFileName && (
            <p className="text-[11px] text-muted/60 px-1 pt-1 leading-relaxed">
              Upload Published Products to compare publish status (Tab 1).
            </p>
          )}
          {mdmFileName && publishedFileName && (
            <p className="text-[11px] text-emerald-600 px-1 pt-1 leading-relaxed">
              Both files ready. Switch to Publish MDM tab and click Analyze.
            </p>
          )}
        </div>

        {/* Right panel */}
        <div
          className={cn(
            "flex-1 flex flex-col min-h-0 transition-opacity duration-300",
            isPending ? "opacity-50" : "opacity-100"
          )}
        >
          <Suspense
            fallback={
              <div className="flex-1 flex items-center justify-center">
                <Loader2 size={32} className="mx-auto text-accent animate-spin" />
              </div>
            }
          >
            {activeTab === "publish" ? <PublishMDMTab /> : <ErrorMDMTab />}
          </Suspense>
        </div>
      </div>
    </div>
  );
}

// ── Default export (Suspense boundary for useSearchParams) ────────────────────

export default function MDMAnalyzerPage() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <MDMAnalyzerInner />
    </Suspense>
  );
}
