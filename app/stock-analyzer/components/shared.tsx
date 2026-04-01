"use client";

import { useState, useRef, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { StockRow } from "@/lib/stock-types";
import { STOCK_COLUMNS } from "@/lib/stock-types";
import {
  Upload,
  X,
  CheckCircle2,
  Check,
  Columns3,
  Filter,
} from "lucide-react";

// ── EU number parser ─────────────────────────────────────────────────────────
export function parseStockNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  const s = String(val).trim();
  if (s === "" || s === "-") return 0;
  const normalized = s.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(normalized);
  return isNaN(n) ? 0 : n;
}

// ── Process raw CSV rows → StockRow[] + StockSummary ─────────────────────────
import type { StockSummary } from "@/lib/stock-types";

export function processRows(
  raw: Record<string, unknown>[]
): { rows: StockRow[]; summary: StockSummary } {
  const rows: StockRow[] = raw.map((r, i) => {
    const stock       = parseStockNum(r["Stock"]);
    const plannedOut  = parseStockNum(r["PlannedOutStock"]);
    return {
      No:                              i + 1,
      ItemCode:                        String(r["ItemCode"] ?? ""),
      ItemDescriptionDescription:      String(r["ItemDescriptionDescription"] ?? ""),
      ItemGroupDescriptionDescription: String(r["ItemGroupDescriptionDescription"] ?? ""),
      Class01Description:              "",
      Class04Description:              "",
      Stock:                           stock,
      PlannedInStock:                  parseStockNum(r["PlannedInStock"]),
      PlannedOutStock:                 plannedOut,
      AvailableStock:                  parseStockNum(r["AvailableStock"]),
      RealStock:                       stock - plannedOut,
    };
  });

  const summary: StockSummary = {
    total:             rows.length,
    inStock:           rows.filter((r) => r.Stock > 0).length,
    outOfStock:        rows.filter((r) => r.Stock === 0).length,
    negativeRealStock: rows.filter((r) => r.RealStock < 0).length,
    totalStockQty:     rows.reduce((s, r) => s + r.Stock, 0),
    totalPlannedOut:   rows.reduce((s, r) => s + r.PlannedOutStock, 0),
  };

  return { rows, summary };
}

// ── Real Stock Badge ─────────────────────────────────────────────────────────
import { formatInteger } from "@/lib/utils";

export function RealStockBadge({ value }: { value: number }) {
  const base = "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold font-mono";
  if (value < 0)
    return <span className={`${base} bg-red-100 text-red-700`}>{formatInteger(value)}</span>;
  if (value === 0)
    return <span className={`${base} bg-amber-100 text-amber-700`}>0</span>;
  return <span className={`${base} bg-green-100 text-green-700`}>{formatInteger(value)}</span>;
}

// ── Column Toggle ────────────────────────────────────────────────────────────
export function StockColumnToggle({
  visible,
  onToggle,
  onShowAll,
  onHideAll,
}: {
  visible: (keyof StockRow)[];
  onToggle: (k: keyof StockRow) => void;
  onShowAll: () => void;
  onHideAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef   = useRef<HTMLButtonElement>(null);
  const hidden   = STOCK_COLUMNS.length - visible.length;

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current   && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div className="relative">
      <Button ref={btnRef} variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
        <Columns3 size={12} className="mr-1.5" />
        Columns
        {hidden > 0 && (
          <span className="ml-1.5 bg-accent text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
            {hidden} hidden
          </span>
        )}
      </Button>
      {open && (
        <div ref={panelRef} className="absolute top-full left-0 mt-1 z-50 w-56 bg-white border border-edge rounded-lg shadow-lg py-1">
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-edge">
            <button onClick={onShowAll} className="text-[11px] text-accent hover:underline cursor-pointer">Select All</button>
            <span className="text-muted text-[11px]">·</span>
            <button onClick={onHideAll} className="text-[11px] text-accent hover:underline cursor-pointer">Clear All</button>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {STOCK_COLUMNS.map((col) => {
              const checked = visible.includes(col.key);
              return (
                <button
                  key={col.key}
                  onClick={() => onToggle(col.key)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <span className={cn(
                    "flex items-center justify-center w-4 h-4 rounded border",
                    checked ? "bg-accent border-accent text-white" : "border-edge bg-white"
                  )}>
                    {checked && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span className="text-primary">{col.label}</span>
                  <span className="ml-auto text-[10px] text-muted/60 truncate max-w-[100px]">{col.tooltip}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Category Multi-Select ────────────────────────────────────────────────────
export function CategoryFilter({
  categories,
  selected,
  onChange,
  label = "Category",
}: {
  categories: string[];
  selected: string[];
  onChange: (cats: string[]) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef   = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current   && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const toggle = (cat: string) =>
    onChange(selected.includes(cat) ? selected.filter((c) => c !== cat) : [...selected, cat]);

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-[12px] transition-colors cursor-pointer",
          selected.length > 0
            ? "border-accent bg-accent/5 text-accent"
            : "border-edge bg-white text-muted hover:text-primary hover:border-primary/30"
        )}
      >
        <Filter size={12} />
        {label}
        {selected.length > 0 && (
          <>
            <span className="bg-accent text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
              {selected.length}
            </span>
            <span
              onClick={(e) => { e.stopPropagation(); onChange([]); }}
              className="hover:bg-accent/20 rounded p-0.5"
            >
              <X size={10} />
            </span>
          </>
        )}
      </button>
      {open && (
        <div ref={panelRef} className="absolute top-full left-0 mt-1 z-50 w-64 bg-white border border-edge rounded-lg shadow-lg py-1">
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-edge">
            <button onClick={() => onChange(categories)} className="text-[11px] text-accent hover:underline cursor-pointer">Select All</button>
            <span className="text-muted text-[11px]">·</span>
            <button onClick={() => onChange([])} className="text-[11px] text-accent hover:underline cursor-pointer">Clear All</button>
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {categories.map((cat) => {
              const checked = selected.includes(cat);
              return (
                <button
                  key={cat}
                  onClick={() => toggle(cat)}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <span className={cn(
                    "flex items-center justify-center w-4 h-4 rounded border shrink-0",
                    checked ? "bg-accent border-accent text-white" : "border-edge bg-white"
                  )}>
                    {checked && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span className="text-primary truncate">{cat}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Cell Hover Tooltip (only when text is actually truncated) ────────────────
export function DataTooltip() {
  const [state, setState] = useState<{ text: string; visible: boolean }>({ text: "", visible: false });
  const divRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOver = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tip]");
      if (!el) return;
      const tip = el.dataset.tip ?? "";
      if (!tip) return;
      // Clone without overflow constraint to measure natural text width
      const clone = el.cloneNode(true) as HTMLElement;
      clone.setAttribute(
        "style",
        "position:fixed;visibility:hidden;top:-9999px;left:-9999px;" +
        "overflow:visible;width:auto;max-width:none;white-space:nowrap;display:inline-block;"
      );
      document.body.appendChild(clone);
      const naturalWidth = clone.offsetWidth;
      document.body.removeChild(clone);
      if (naturalWidth <= el.offsetWidth) return;
      setState({ text: tip, visible: true });
    };
    const onOut = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-tip]");
      if (!el) return;
      if (el.contains(e.relatedTarget as Node)) return;
      setState((s) => ({ ...s, visible: false }));
    };
    const onMove = (e: MouseEvent) => {
      if (!divRef.current) return;
      divRef.current.style.left = `${e.clientX + 14}px`;
      divRef.current.style.top  = `${e.clientY + 16}px`;
    };
    document.addEventListener("mouseover",  onOver, true);
    document.addEventListener("mouseout",   onOut,  true);
    document.addEventListener("mousemove",  onMove, { passive: true });
    return () => {
      document.removeEventListener("mouseover",  onOver, true);
      document.removeEventListener("mouseout",   onOut,  true);
      document.removeEventListener("mousemove",  onMove);
    };
  }, []);

  if (!state.visible || !state.text) return null;

  return (
    <div
      ref={divRef}
      style={{ position: "fixed", top: 0, left: 0, zIndex: 9999 }}
      className="bg-gray-900 text-white text-[11px] font-mono px-2.5 py-1 rounded-md shadow-xl max-w-sm pointer-events-none break-all"
    >
      {state.text}
    </div>
  );
}

// ── Copy toast ("✓ Copied" pill that floats up and fades) ────────────────────
export function showCopiedToast(x: number, y: number) {
  const el = document.createElement("div");
  el.textContent = "✓ Copied";
  Object.assign(el.style, {
    position:   "fixed",
    top:        `${y - 36}px`,
    left:       `${x}px`,
    transform:  "translateX(-50%)",
    background: "#16a34a",
    color:      "white",
    fontSize:   "11px",
    fontFamily: "monospace",
    padding:    "3px 12px",
    borderRadius: "20px",
    zIndex:     "9999",
    pointerEvents: "none",
    transition: "opacity 0.4s ease, transform 0.5s ease",
  });
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity   = "0";
    el.style.transform = "translateX(-50%) translateY(-14px)";
  }, 400);
  setTimeout(() => el.remove(), 900);
}

// ── File Slot ────────────────────────────────────────────────────────────────
export function StockFileSlot({
  label,
  hint,
  required = false,
  fileName,
  isReady,
  onDrop,
  onClear,
}: {
  label: string;
  hint: string;
  required?: boolean;
  fileName: string | null;
  isReady: boolean;
  onDrop: (file: File) => void;
  onClear?: () => void;
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => { if (files[0]) onDrop(files[0]); },
    accept: {
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".csv", ".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
    multiple: false,
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "relative border rounded-md p-3 cursor-pointer transition-all duration-200",
        isDragActive && "border-accent bg-blue-50 scale-[1.02]",
        isReady
          ? "border-emerald-300 bg-emerald-50"
          : "border-edge hover:border-muted bg-white"
      )}
    >
      <input {...getInputProps()} />
      <div className="flex items-center gap-2.5">
        {isReady ? (
          <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
        ) : (
          <Upload
            size={14}
            className={cn("shrink-0 transition-colors", isDragActive ? "text-accent" : "text-muted")}
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-primary truncate">
            {label}
            {required && <span className="text-red-400 ml-0.5">*</span>}
          </p>
          {isReady ? (
            <p className="text-[11px] text-emerald-600 font-mono truncate">{fileName}</p>
          ) : (
            <p className="text-[11px] text-muted font-mono">{hint}</p>
          )}
        </div>
        {isReady && onClear && (
          <button
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="p-0.5 rounded text-muted hover:text-red-500 transition-colors"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
