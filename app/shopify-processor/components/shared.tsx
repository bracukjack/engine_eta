"use client";

import { useState, useRef, useEffect } from "react";
import { Download, FileSpreadsheet, Loader2, ChevronDown, X, Tags, Check } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { DataTable } from "@/components/data-table/data-table";
import { PreviewTable } from "@/components/preview-table/preview-table";
import { Button } from "@/components/ui/button";
import type { BatchProgress, DecimalSeparator, ExportRowLimit, TableSize } from "@/lib/types";
import { BestSellerTab } from "./best-seller-tab";
import { MasterMappingTab } from "./master-mapping-tab";

export function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] text-muted">{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-white border border-edge rounded px-2 py-1 text-xs text-primary font-mono focus:outline-none focus:ring-1 focus:ring-accent/50 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 bg-accent/10 text-accent text-[11px] font-medium rounded-full px-2.5 py-0.5">
      {label}
      <button
        onClick={onRemove}
        className="hover:bg-accent/20 rounded-full p-0.5 transition-colors cursor-pointer"
      >
        <X size={10} />
      </button>
    </span>
  );
}

export function TagFilter({
  availableTags,
  selected,
  onChange,
}: {
  availableTags: string[];
  selected: string[];
  onChange: (tags: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (tag: string) =>
    onChange(
      selected.includes(tag)
        ? selected.filter((t) => t !== tag)
        : [...selected, tag]
    );

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded border cursor-pointer transition-colors ${
          selected.length > 0
            ? "bg-accent text-white border-accent"
            : "bg-white text-muted border-edge hover:bg-slate-50"
        }`}
      >
        <Tags size={12} />
        Tags
        {selected.length > 0 && (
          <span className="text-[9px] font-mono rounded px-1 bg-white/20 text-white">
            {selected.length}
          </span>
        )}
        <ChevronDown size={10} />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute top-full left-0 mt-1 z-50 w-52 bg-white border border-edge rounded-lg shadow-lg py-1"
        >
          {selected.length > 0 && (
            <div className="flex items-center px-2 py-1.5 border-b border-edge">
              <button
                onClick={() => onChange([])}
                className="text-[11px] text-accent hover:underline cursor-pointer"
              >
                Clear All
              </button>
            </div>
          )}
          <div className="max-h-72 overflow-y-auto py-1">
            {availableTags.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-muted">No tags found</div>
            ) : (
              availableTags.map((tag) => {
                const checked = selected.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggle(tag)}
                    className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <span
                      className={`flex items-center justify-center w-4 h-4 rounded border shrink-0 ${
                        checked ? "bg-accent border-accent text-white" : "border-edge bg-white"
                      }`}
                    >
                      {checked && <Check size={10} strokeWidth={3} />}
                    </span>
                    <span className="text-primary truncate">{tag}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ExportDropdown({
  onExportXlsx,
  onExportCsv,
  rowCount,
  colCount,
  exportRowLimit,
  customRowLimit,
  filteredTotal,
  onSetExportRowLimit,
  onSetCustomRowLimit,
  splitMode,
  rowsPerFile,
  batchProgress,
  onSetSplitMode,
  onSetRowsPerFile,
  excludeSkus,
  onSetExcludeSkus,
}: {
  onExportXlsx: () => void;
  onExportCsv: () => void;
  rowCount: number;
  colCount: number;
  exportRowLimit: ExportRowLimit;
  customRowLimit: number;
  filteredTotal: number;
  onSetExportRowLimit: (l: ExportRowLimit) => void;
  onSetCustomRowLimit: (n: number) => void;
  splitMode: boolean;
  rowsPerFile: number;
  batchProgress: BatchProgress | null;
  onSetSplitMode: (v: boolean) => void;
  onSetRowsPerFile: (n: number) => void;
  excludeSkus: string;
  onSetExcludeSkus: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const ROW_OPTIONS: { value: ExportRowLimit; label: string }[] = [
    { value: "all", label: "All rows" },
    { value: 10, label: "Top 10" },
    { value: 20, label: "Top 20" },
    { value: 50, label: "Top 50" },
    { value: 100, label: "Top 100" },
    { value: "custom", label: "Custom…" },
  ];

  const isBuilding = batchProgress?.phase === "building";

  return (
    <div className="relative z-50">
      <Button
        ref={btnRef}
        variant="outline"
        size="sm"
        disabled={!!batchProgress}
        onClick={() => !batchProgress && setOpen((v) => !v)}
      >
        {batchProgress ? (
          <>
            <Loader2 size={14} className="animate-spin mr-1.5" />
            {isBuilding ? "Building ZIP..." : "Compressing..."}
          </>
        ) : (
          <>
            <Download size={12} className="mr-1.5" />
            Export
            <ChevronDown size={10} className="ml-1" />
          </>
        )}
      </Button>
      {open && (
        <div
          ref={ref}
          className="absolute top-full left-0 mt-1 w-60 bg-white border border-edge rounded-lg shadow-lg py-1"
        >
          <div className="px-3 py-1.5 border-b border-edge">
            <span className="text-[10px] text-muted font-mono">
              Exporting {rowCount.toLocaleString()} rows × {colCount} columns
            </span>
          </div>

          <div className="px-3 py-2 border-b border-edge">
            <span className="text-[10px] text-muted uppercase tracking-wider font-semibold">Rows</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {ROW_OPTIONS.map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => onSetExportRowLimit(opt.value)}
                  className={`px-2 py-0.5 text-[10px] rounded border cursor-pointer transition-colors ${
                    exportRowLimit === opt.value
                      ? "bg-accent text-white border-accent"
                      : "bg-white text-primary border-edge hover:bg-slate-50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {exportRowLimit === "custom" && (
              <input
                type="number"
                min={1}
                max={filteredTotal}
                value={customRowLimit}
                onChange={(e) => onSetCustomRowLimit(Math.max(1, Math.min(filteredTotal, Number(e.target.value) || 1)))}
                className="mt-1.5 w-full bg-white border border-edge rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            )}
          </div>

          <div className="px-3 py-2 border-b border-edge">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted uppercase tracking-wider font-semibold">Split to ZIP</span>
              <button
                onClick={() => onSetSplitMode(!splitMode)}
                className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors cursor-pointer ${splitMode ? "bg-accent" : "bg-edge"}`}
              >
                <span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${splitMode ? "translate-x-3.5" : "translate-x-0.5"}`} />
              </button>
            </div>
            {splitMode && (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[10px] text-muted">Rows per file:</span>
                <input
                  type="number"
                  min={1}
                  value={rowsPerFile}
                  onChange={(e) => onSetRowsPerFile(Math.max(1, Number(e.target.value) || 1))}
                  className="w-16 bg-white border border-edge rounded px-2 py-0.5 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent/50"
                />
                {rowCount > 0 && (
                  <span className="text-[10px] text-muted">→ {Math.ceil(rowCount / rowsPerFile)} files</span>
                )}
              </div>
            )}
          </div>

          <div className="px-3 py-2 border-b border-edge">
            <span className="text-[10px] text-muted uppercase tracking-wider font-semibold">Exclude SKUs</span>
            <input
              type="text"
              value={excludeSkus}
              onChange={(e) => onSetExcludeSkus(e.target.value)}
              placeholder="SKU1, SKU2, ..."
              className="mt-1 w-full bg-white border border-edge rounded px-2 py-1 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-accent/50 placeholder:text-muted/50"
            />
            {excludeSkus.trim() && (
              <span className="text-[10px] text-muted/70 mt-0.5 block">
                {excludeSkus.split(",").map((s) => s.trim()).filter(Boolean).length} SKU(s) excluded
              </span>
            )}
          </div>

          <button
            onClick={() => { onExportXlsx(); setOpen(false); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <FileSpreadsheet size={12} className="text-green-600" />
            {splitMode ? "Export ZIP of .xlsx files" : "Export to Excel (.xlsx)"}
          </button>
          <button
            onClick={() => { onExportCsv(); setOpen(false); }}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <Download size={12} className="text-blue-600" />
            {splitMode ? "Export ZIP of .csv files" : "Export to CSV (.csv)"}
          </button>
        </div>
      )}
    </div>
  );
}

export function SizeToggle({
  value,
  onChange,
}: {
  value: TableSize;
  onChange: (s: TableSize) => void;
}) {
  const sizes: TableSize[] = ["S", "M", "L"];
  return (
    <div className="inline-flex border border-edge rounded overflow-hidden">
      {sizes.map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={`px-2 py-1 text-[10px] font-bold cursor-pointer transition-colors ${
            value === s
              ? "bg-amber-500 text-white"
              : "bg-white text-muted hover:bg-slate-50"
          }`}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

export function DecimalToggle({
  value,
  onChange,
}: {
  value: DecimalSeparator;
  onChange: (s: DecimalSeparator) => void;
}) {
  const options: { value: DecimalSeparator; label: string; title: string }[] = [
    { value: "comma", label: "1.234,56", title: "Comma as decimal separator (1.234,56)" },
    { value: "dot", label: "1,234.56", title: "Dot as decimal separator (1,234.56)" },
  ];
  return (
    <div className="inline-flex border border-edge rounded overflow-hidden" title="Decimal separator for prices — applies to the table, copied values, and exports">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          title={o.title}
          className={`px-2 py-1 text-[10px] font-mono cursor-pointer transition-colors ${
            value === o.value
              ? "bg-accent text-white"
              : "bg-white text-muted hover:bg-slate-50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function RightPanel({
  isFiltered,
  statusFilter,
  etaFilter,
  discountFilter,
  policyFilter,
  b2cFilter,
  dupSkuFilter,
  dupSkuCount,
  tagsFilter,
  availableTags,
  setStatusFilter,
  setEtaFilter,
  setDiscountFilter,
  setPolicyFilter,
  setB2cFilter,
  setDupSkuFilter,
  setTagsFilter,
  activeTab,
  onTabChange,
}: {
  isFiltered: boolean;
  statusFilter: string;
  etaFilter: string;
  discountFilter: string;
  policyFilter: string;
  b2cFilter: string;
  dupSkuFilter: boolean;
  dupSkuCount: number;
  tagsFilter: string[];
  availableTags: string[];
  setStatusFilter: (v: "all" | "active" | "draft") => void;
  setEtaFilter: (v: "all" | "yes" | "no") => void;
  setDiscountFilter: (v: "all" | "yes" | "no") => void;
  setPolicyFilter: (v: "all" | "continue" | "deny") => void;
  setB2cFilter: (v: "all" | "yes" | "no") => void;
  setDupSkuFilter: (v: boolean) => void;
  setTagsFilter: (tags: string[]) => void;
  activeTab: "output" | "preview" | "best-seller" | "mapping";
  onTabChange: (t: "output" | "preview" | "best-seller" | "mapping") => void;
}) {
  const tab = activeTab;
  const setTab = onTabChange;
  const previewData = useAppStore((s) => s.previewData);
  const results = useAppStore((s) => s.results);
  const hasPreview = Object.values(previewData).some((d) => d !== null);

  return (
    <>
      {/* Tab bar */}
      <div className="shrink-0 flex items-center border-b border-edge bg-surface/50">
        <button
          onClick={() => setTab("output")}
          className={`px-4 py-2 text-[11px] font-semibold cursor-pointer transition-colors border-b-2 ${
            tab === "output"
              ? "border-accent text-primary bg-white"
              : "border-transparent text-muted hover:bg-slate-50"
          }`}
        >
          Output
          {results.length > 0 && (
            <span className="ml-1.5 text-[9px] font-mono text-accent bg-accent/10 rounded px-1">
              {results.length}
            </span>
          )}
        </button>
        <button
          onClick={() => { if (hasPreview) setTab("preview"); }}
          className={`px-4 py-2 text-[11px] font-semibold cursor-pointer transition-colors border-b-2 ${
            tab === "preview"
              ? "border-accent text-primary bg-white"
              : "border-transparent text-muted hover:bg-slate-50"
          } ${!hasPreview ? "opacity-40 pointer-events-none" : ""}`}
        >
          Preview
          {hasPreview && (
            <span className="ml-1.5 text-[9px] font-mono text-accent bg-accent/10 rounded px-1">
              {Object.values(previewData).filter((d) => d !== null).length}
            </span>
          )}
        </button>
        <button
          onClick={() => setTab("best-seller")}
          className={`px-4 py-2 text-[11px] font-semibold cursor-pointer transition-colors border-b-2 ${
            tab === "best-seller"
              ? "border-amber-500 text-primary bg-white"
              : "border-transparent text-muted hover:bg-slate-50"
          }`}
        >
          Best Seller
        </button>
        <button
          onClick={() => setTab("mapping")}
          className={`px-4 py-2 text-[11px] font-semibold cursor-pointer transition-colors border-b-2 ${
            tab === "mapping"
              ? "border-violet-500 text-primary bg-white"
              : "border-transparent text-muted hover:bg-slate-50"
          }`}
        >
          Master → Shopify
        </button>
      </div>

      {/* Filter bar */}
      {tab === "output" && results.length > 0 && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-edge bg-surface/50 flex-wrap">
          <span className="text-[11px] text-muted uppercase tracking-wider font-semibold">Filters</span>
          <FilterSelect
            label="Status"
            value={statusFilter}
            options={[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "draft", label: "Draft" },
            ]}
            onChange={(v) => setStatusFilter(v as "all" | "active" | "draft")}
          />
          <FilterSelect
            label="ETA"
            value={etaFilter}
            options={[
              { value: "all", label: "All" },
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            onChange={(v) => setEtaFilter(v as "all" | "yes" | "no")}
          />
          <FilterSelect
            label="Discount"
            value={discountFilter}
            options={[
              { value: "all", label: "All" },
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            onChange={(v) => setDiscountFilter(v as "all" | "yes" | "no")}
          />
          <FilterSelect
            label="Policy"
            value={policyFilter}
            options={[
              { value: "all", label: "All" },
              { value: "continue", label: "Continue" },
              { value: "deny", label: "Deny" },
            ]}
            onChange={(v) => setPolicyFilter(v as "all" | "continue" | "deny")}
          />
          <FilterSelect
            label="B2C"
            value={b2cFilter}
            options={[
              { value: "all", label: "All" },
              { value: "yes", label: "Yes" },
              { value: "no", label: "No" },
            ]}
            onChange={(v) => setB2cFilter(v as "all" | "yes" | "no")}
          />
          <button
            onClick={() => setDupSkuFilter(!dupSkuFilter)}
            className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded border cursor-pointer transition-colors ${
              dupSkuFilter
                ? "bg-orange-500 text-white border-orange-500"
                : "bg-white text-muted border-edge hover:bg-slate-50"
            }`}
          >
            Dup SKU
            {dupSkuCount > 0 && (
              <span className={`text-[9px] font-mono rounded px-1 ${dupSkuFilter ? "bg-white/20 text-white" : "bg-orange-100 text-orange-600"}`}>
                {dupSkuCount}
              </span>
            )}
          </button>
          <TagFilter
            availableTags={availableTags}
            selected={tagsFilter}
            onChange={setTagsFilter}
          />
          {isFiltered && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {statusFilter !== "all" && <FilterChip label={`Status: ${statusFilter}`} onRemove={() => setStatusFilter("all")} />}
              {etaFilter !== "all" && <FilterChip label={`ETA: ${etaFilter}`} onRemove={() => setEtaFilter("all")} />}
              {discountFilter !== "all" && <FilterChip label={`Discount: ${discountFilter}`} onRemove={() => setDiscountFilter("all")} />}
              {policyFilter !== "all" && <FilterChip label={`Policy: ${policyFilter}`} onRemove={() => setPolicyFilter("all")} />}
              {b2cFilter !== "all" && <FilterChip label={`B2C: ${b2cFilter}`} onRemove={() => setB2cFilter("all")} />}
              {dupSkuFilter && <FilterChip label="Dup SKU" onRemove={() => setDupSkuFilter(false)} />}
              {tagsFilter.map((t) => (
                <FilterChip
                  key={t}
                  label={`Tag: ${t}`}
                  onRemove={() => setTagsFilter(tagsFilter.filter((x) => x !== t))}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {tab === "output" ? (
        <DataTable />
      ) : tab === "preview" ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <PreviewTable />
        </div>
      ) : tab === "best-seller" ? (
        <BestSellerTab />
      ) : (
        <MasterMappingTab />
      )}
    </>
  );
}
