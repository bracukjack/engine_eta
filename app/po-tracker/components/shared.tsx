"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { cn } from "@/lib/utils";
import {
  ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight,
  Search, X, ChevronDown, ChevronRight as ChevronRightIcon,
  AlertCircle, Loader2, Upload, CheckCircle2,
} from "lucide-react";

export function SortIcon({ col, sortCol, sortDir }: { col: string; sortCol: string | null; sortDir: "asc" | "desc" }) {
  if (sortCol === col)
    return sortDir === "asc"
      ? <ArrowUp size={10} className="text-amber-600 shrink-0" />
      : <ArrowDown size={10} className="text-amber-600 shrink-0" />;
  return <ArrowUpDown size={10} className="opacity-0 group-hover:opacity-30 shrink-0" />;
}

export function ThCell({ label, colKey, sortCol, sortDir, onSort }: {
  label: string; colKey: string; sortCol: string | null; sortDir: "asc" | "desc"; onSort: (k: string) => void;
}) {
  return (
    <th onClick={() => onSort(colKey)}
      className={cn("text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap group",
        sortCol === colKey ? "text-amber-600" : "text-muted hover:text-primary")}>
      <div className="flex items-center gap-1">
        {label}
        <SortIcon col={colKey} sortCol={sortCol} sortDir={sortDir} />
      </div>
    </th>
  );
}

export function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={cn("h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer",
        active ? "bg-accent/10 text-accent border border-accent/30" : "text-muted hover:text-primary hover:bg-surface-hover border border-transparent")}>
      {label}
    </button>
  );
}

export function MetricCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-white border border-edge shadow-sm">
      <Icon size={14} className="text-accent shrink-0" />
      <div>
        <p className="text-[11px] text-muted leading-none">{label}</p>
        <p className="text-sm font-mono font-semibold text-primary leading-tight">{value}</p>
      </div>
    </div>
  );
}

export function PaginationBar({ total, page, rowsPerPage, onPage, onRowsPerPage }: {
  total: number; page: number; rowsPerPage: number;
  onPage: (p: number) => void; onRowsPerPage: (n: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / rowsPerPage));
  const safePage = Math.min(page, totalPages);
  const start = Math.min((safePage - 1) * rowsPerPage + 1, total);
  const end = Math.min(safePage * rowsPerPage, total);

  const pageNums = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (safePage <= 4) return [1, 2, 3, 4, 5, 6, 7];
    if (safePage >= totalPages - 3) return Array.from({ length: 7 }, (_, i) => totalPages - 6 + i);
    return Array.from({ length: 7 }, (_, i) => safePage - 3 + i);
  }, [totalPages, safePage]);

  return (
    <div className="shrink-0 border-t border-edge bg-surface px-4 h-10 flex items-center gap-3">
      <span className="text-[11px] text-muted font-mono shrink-0">
        {total === 0 ? "0 rows" : `${start}–${end} of ${total}`}
      </span>
      <div className="flex-1" />
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-[11px] text-muted">Rows:</span>
        {[25, 50, 100].map((n) => (
          <button key={n} onClick={() => { onRowsPerPage(n); onPage(1); }}
            className={cn("px-2 py-0.5 rounded text-[11px] font-mono transition-colors",
              rowsPerPage === n ? "bg-accent text-white" : "text-muted hover:text-primary hover:bg-surface-hover")}>
            {n}
          </button>
        ))}
      </div>
      {totalPages > 1 && (
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={() => onPage(Math.max(1, safePage - 1))} disabled={safePage === 1}
            className="p-1 rounded text-muted hover:text-primary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <ChevronLeft size={14} />
          </button>
          {pageNums.map((p) => (
            <button key={p} onClick={() => onPage(p)}
              className={cn("w-6 h-6 rounded text-[11px] font-mono transition-colors",
                safePage === p ? "bg-accent text-white" : "text-muted hover:text-primary hover:bg-surface-hover")}>
              {p}
            </button>
          ))}
          <button onClick={() => onPage(Math.min(totalPages, safePage + 1))} disabled={safePage === totalPages}
            className="p-1 rounded text-muted hover:text-primary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative">
      <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? "Search…"}
        className="pl-7 pr-7 h-8 text-[12px] border border-edge rounded-md bg-white focus:outline-none focus:border-accent/50 w-60" />
      {value && (
        <button onClick={() => onChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-primary">
          <X size={11} />
        </button>
      )}
    </div>
  );
}

export function SelectFilter({ label, value, options, onChange }: {
  label: string; value: string; options: { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px] text-muted">{label}:</span>
      <div className="flex items-center gap-1">
        {options.map((opt) => (
          <FilterChip key={opt.value} label={opt.label} active={value === opt.value} onClick={() => onChange(opt.value)} />
        ))}
      </div>
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <AlertCircle size={32} className="text-muted/30" />
      <p className="text-sm text-muted font-mono">{message}</p>
    </div>
  );
}

export function ItemDropdown({ value, options, onChange }: {
  value: string; options: { code: string; count: number }[]; onChange: (v: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.code.toLowerCase().includes(q));
  }, [options, search]);

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 h-8 px-3 rounded-md border border-edge bg-white text-[12px] text-primary hover:border-accent/40 transition-colors min-w-[240px] cursor-pointer">
        <span className="flex-1 text-left truncate font-mono">{value || <span className="text-muted font-sans">Select item code…</span>}</span>
        <ChevronDown size={12} className="text-muted shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-80 bg-white border border-edge rounded-lg shadow-lg">
          <div className="p-2 border-b border-edge">
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search item code…"
                className="w-full pl-6 pr-2 h-7 text-[12px] border border-edge rounded focus:outline-none focus:border-accent/50" />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.slice(0, 200).map((opt) => (
              <button key={opt.code} onClick={() => { onChange(opt.code); setOpen(false); setSearch(""); }}
                className={cn("flex items-center justify-between w-full px-3 py-1.5 text-left text-[12px] hover:bg-surface-hover transition-colors cursor-pointer",
                  value === opt.code && "bg-accent/5 text-accent")}>
                <span className="font-mono">{opt.code}</span>
                <span className="text-[10px] text-muted">{opt.count} supplier{opt.count > 1 ? "s" : ""}</span>
              </button>
            ))}
            {filtered.length === 0 && <p className="px-3 py-2 text-[12px] text-muted">No items found</p>}
          </div>
        </div>
      )}
    </div>
  );
}

export type FileSlotState = "idle" | "loading" | "done" | "error";

export function TrackerFileSlot({
  label,
  hint,
  state,
  fileName,
  error,
  onDrop,
  onClear,
}: {
  label: string;
  hint: string;
  state: FileSlotState;
  fileName?: string | null;
  error?: string;
  onDrop: (file: File) => void;
  onClear?: () => void;
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => { if (files[0]) onDrop(files[0]); },
    accept: { "text/csv": [".csv"], "text/plain": [".txt"], "application/vnd.ms-excel": [".csv"] },
    multiple: false,
  });

  const isReady = state === "done";
  const isError = state === "error";
  const isLoading = state === "loading";

  return (
    <div
      {...getRootProps()}
      className={cn(
        "relative border rounded-md p-3 cursor-pointer transition-all duration-200",
        isDragActive && "border-accent bg-blue-50 scale-[1.02]",
        isLoading && "border-edge bg-slate-50 opacity-70 cursor-wait",
        isReady && !isLoading && "border-emerald-300 bg-emerald-50",
        isError && "border-red-300 bg-red-50",
        !isReady && !isError && !isLoading && !isDragActive && "border-edge hover:border-muted bg-white"
      )}
    >
      <input {...getInputProps()} disabled={isLoading} />
      <div className="flex items-center gap-2.5">
        {isLoading ? (
          <Loader2 size={14} className="text-accent animate-spin shrink-0" />
        ) : isReady ? (
          <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
        ) : isError ? (
          <AlertCircle size={14} className="text-red-500 shrink-0" />
        ) : (
          <Upload
            size={14}
            className={cn("shrink-0 transition-colors", isDragActive ? "text-accent" : "text-muted")}
          />
        )}
        <div className="flex-1 min-w-0 text-left">
          <p className={cn("text-xs font-medium truncate", isError ? "text-red-700" : "text-primary")}>
            {label}
          </p>
          {isLoading ? (
            <p className="text-[11px] text-muted font-mono truncate">Parsing file...</p>
          ) : isReady ? (
            <p className="text-[11px] text-emerald-600 font-mono truncate">{fileName}</p>
          ) : isError ? (
            <p className="text-[11px] text-red-600 font-mono truncate">{error}</p>
          ) : (
            <p className="text-[11px] text-muted font-mono truncate">{hint}</p>
          )}
        </div>
        {isReady && onClear && (
          <button
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            className="p-0.5 rounded text-muted hover:text-red-500 transition-colors shrink-0"
          >
            <X size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
