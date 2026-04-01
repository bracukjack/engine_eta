"use client";

import { useState, useCallback, Suspense, lazy } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Truck, TrendingUp, Users, Tag, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseFileBuffer } from "@/lib/parsers";
import { parsePOData, parsePriceData, type PORecord, type PriceRecord } from "@/lib/po-tracker";
import { FileUploadCard, type FileSlotState } from "./components/shared";

const POTrackerTab = lazy(() => import("./tabs/POTrackerTab"));
const SupplierPerformanceTab = lazy(() => import("./tabs/SupplierPerformanceTab"));
const PriceHistoryTab = lazy(() => import("./tabs/PriceHistoryTab"));
const PriceComparisonTab = lazy(() => import("./tabs/PriceComparisonTab"));

type Tab = "po-tracker" | "supplier-performance" | "price-history" | "price-comparison";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "po-tracker", label: "PO Tracker", icon: Truck },
  { key: "supplier-performance", label: "Supplier Performance", icon: Users },
  { key: "price-history", label: "Price History", icon: TrendingUp },
  { key: "price-comparison", label: "Price Comparison", icon: Tag },
];

function POTrackerInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = (searchParams.get("tab") ?? "po-tracker") as Tab;

  const setActiveTab = useCallback((tab: Tab) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [searchParams, router]);

  const [poData, setPoData] = useState<PORecord[] | null>(null);
  const [priceData, setPriceData] = useState<PriceRecord[] | null>(null);
  const [poState, setPoState] = useState<FileSlotState>("idle");
  const [priceState, setPriceState] = useState<FileSlotState>("idle");
  const [poFile, setPoFile] = useState<{ name: string; size: number } | null>(null);
  const [priceFile, setPriceFile] = useState<{ name: string; size: number } | null>(null);
  const [poError, setPoError] = useState<string | undefined>();
  const [priceError, setPriceError] = useState<string | undefined>();

  const handlePoFile = useCallback(async (file: File) => {
    setPoState("loading"); setPoError(undefined);
    try {
      const buffer = await file.arrayBuffer();
      const raw = await parseFileBuffer(buffer);
      setPoData(parsePOData(raw as Record<string, unknown>[]));
      setPoFile({ name: file.name, size: file.size });
      setPoState("done");
    } catch (err) {
      setPoError(err instanceof Error ? err.message : String(err));
      setPoState("error");
    }
  }, []);

  const handlePriceFile = useCallback(async (file: File) => {
    setPriceState("loading"); setPriceError(undefined);
    try {
      const buffer = await file.arrayBuffer();
      const raw = await parseFileBuffer(buffer);
      setPriceData(parsePriceData(raw as Record<string, unknown>[]));
      setPriceFile({ name: file.name, size: file.size });
      setPriceState("done");
    } catch (err) {
      setPriceError(err instanceof Error ? err.message : String(err));
      setPriceState("error");
    }
  }, []);

  const isLoaded = poData !== null && priceData !== null;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-base">
      {/* Page header */}
      <div className="shrink-0 border-b border-edge bg-surface px-5 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-sm font-semibold text-primary">PO Tracker</h1>
          <p className="text-[11px] text-muted font-mono mt-0.5">
            {isLoaded
              ? `${poData.length} purchase orders · ${priceData.length} price records`
              : "Upload PO and Price Log CSV files to begin"}
          </p>
        </div>
        {isLoaded && (
          <button
            onClick={() => { setPoData(null); setPriceData(null); setPoState("idle"); setPriceState("idle"); setPoFile(null); setPriceFile(null); }}
            className="flex items-center gap-1.5 text-[11px] text-muted hover:text-red-500 transition-colors cursor-pointer"
          >
            <X size={12} />Clear
          </button>
        )}
      </div>

      {/* Tabs */}
      {isLoaded && (
        <div className="shrink-0 border-b border-edge bg-surface px-5 flex items-end gap-0">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={cn("flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium transition-colors cursor-pointer border-b-2 -mb-px",
                activeTab === key ? "text-accent border-accent" : "text-muted border-transparent hover:text-primary hover:border-edge")}>
              <Icon size={13} />{label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col relative">
        {!isLoaded ? (
          <div className="absolute inset-0 flex items-center justify-center p-8 overflow-y-auto">
            <div className="w-full max-w-2xl space-y-6 m-auto">
              <div className="text-center space-y-1">
                <h2 className="text-sm font-semibold text-primary">Upload PO Data Files</h2>
                <p className="text-[12px] text-muted font-mono">Upload both CSV files exported from Exact Online to begin</p>
              </div>
              <div className="flex gap-4">
                <FileUploadCard
                  title="PO Orders File"
                  hint="PurPurchOrdersSearch — purchase orders & line items"
                  state={poState} fileName={poFile?.name} fileSize={poFile?.size} error={poError}
                  onFile={handlePoFile}
                  onClear={() => { setPoData(null); setPoState("idle"); setPoFile(null); setPoError(undefined); }}
                />
                <FileUploadCard
                  title="Price Log File"
                  hint="LogPurchaseItemPricesSearch — supplier price history"
                  state={priceState} fileName={priceFile?.name} fileSize={priceFile?.size} error={priceError}
                  onFile={handlePriceFile}
                  onClear={() => { setPriceData(null); setPriceState("idle"); setPriceFile(null); setPriceError(undefined); }}
                />
              </div>
              <p className="text-center text-[11px] text-muted/60 font-mono">
                Both files required · Date format DD-MM-YYYY · UTF-16 LE · Tab-separated
              </p>
            </div>
          </div>
        ) : (
          <Suspense fallback={
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full border-4 border-accent/20 border-t-accent animate-spin" />
            </div>
          }>
            {activeTab === "po-tracker" && <POTrackerTab poData={poData} />}
            {activeTab === "supplier-performance" && <SupplierPerformanceTab poData={poData} priceData={priceData} />}
            {activeTab === "price-history" && <PriceHistoryTab priceData={priceData} />}
            {activeTab === "price-comparison" && <PriceComparisonTab priceData={priceData} />}
          </Suspense>
        )}
      </div>
    </div>
  );
}

export default function POTrackerPage() {
  return (
    <Suspense fallback={<div className="flex-1" />}>
      <POTrackerInner />
    </Suspense>
  );
}
