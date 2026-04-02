"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useMDMStore, ERROR_COLUMNS } from "@/lib/mdm-store";
import type { ErrorRow, Country } from "@/lib/mdm-store";
import { buildSearchMatcher, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Search, X, ArrowUp, ArrowDown, ArrowUpDown,
  Download, ChevronLeft, ChevronRight,
  Columns3, Check, AlertCircle, Loader2, Filter, ChevronDown,
} from "lucide-react";

// ── Country config ─────────────────────────────────────────────────────────────

const COUNTRY_CONFIG: Record<Country, { flag: string; name: string; accent: string; bg: string; border: string; text: string }> = {
  FR: { flag: "🇫🇷", name: "France", accent: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700" },
  ES: { flag: "🇪🇸", name: "Spain", accent: "text-red-600", bg: "bg-red-50", border: "border-red-200", text: "text-red-700" },
  IT: { flag: "🇮🇹", name: "Italy", accent: "text-green-600", bg: "bg-green-50", border: "border-green-200", text: "text-green-700" },
  DE: { flag: "🇩🇪", name: "Germany", accent: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-800" },
};

const COUNTRIES: Country[] = ["FR", "ES", "IT", "DE"];

// ── Column Toggle ──────────────────────────────────────────────────────────────

function ErrorColumnToggle() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const visibleColumns = useMDMStore((s) => s.errorVisibleColumns);
  const toggleColumn = useMDMStore((s) => s.toggleErrorColumn);
  const showAll = useMDMStore((s) => s.showAllErrorColumns);
  const hideAll = useMDMStore((s) => s.hideAllErrorColumns);
  const hidden = ERROR_COLUMNS.length - visibleColumns.length;

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
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
            {hidden}
          </span>
        )}
      </Button>
      {open && (
        <div ref={panelRef} className="absolute top-full right-0 mt-1 z-50 w-56 bg-white border border-edge rounded-lg shadow-lg py-1">
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-edge">
            <button onClick={showAll} className="text-[11px] text-accent hover:underline cursor-pointer">Select All</button>
            <span className="text-muted text-[11px]">·</span>
            <button onClick={hideAll} className="text-[11px] text-accent hover:underline cursor-pointer">Clear All</button>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {ERROR_COLUMNS.map((col) => {
              const checked = visibleColumns.includes(String(col.key));
              return (
                <button
                  key={String(col.key)}
                  onClick={() => toggleColumn(String(col.key))}
                  className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <span className={cn(
                    "flex items-center justify-center w-4 h-4 rounded border shrink-0",
                    checked ? "bg-accent border-accent text-white" : "border-edge bg-white"
                  )}>
                    {checked && <Check size={10} strokeWidth={3} />}
                  </span>
                  <span className="text-primary">{col.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Country filter dropdown ───────────────────────────────────────────────────

function CountryFilterDropdown({
  selected,
  onChange,
}: {
  selected: Country[];
  onChange: (c: Country[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const toggle = (c: Country) =>
    onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);

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
        Country
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
        <div ref={panelRef} className="absolute top-full left-0 mt-1 z-50 w-40 bg-white border border-edge rounded-lg shadow-lg py-1">
          {COUNTRIES.map((c) => {
            const cfg = COUNTRY_CONFIG[c];
            const checked = selected.includes(c);
            return (
              <button
                key={c}
                onClick={() => toggle(c)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <span className={cn(
                  "flex items-center justify-center w-4 h-4 rounded border shrink-0",
                  checked ? "bg-accent border-accent text-white" : "border-edge bg-white"
                )}>
                  {checked && <Check size={10} strokeWidth={3} />}
                </span>
                <span>{cfg.flag}</span>
                <span className="text-primary">{c} — {cfg.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Error Code dropdown ───────────────────────────────────────────────────────

function ErrorCodeDropdown({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const isFiltered = value !== "all";

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-[12px] transition-colors cursor-pointer",
          isFiltered
            ? "border-accent bg-accent/5 text-accent"
            : "border-edge bg-white text-muted hover:text-primary hover:border-primary/30"
        )}
      >
        Error Code
        {isFiltered ? (
          <>
            <span className="font-mono text-[11px]">{value}</span>
            <span
              onClick={(e) => { e.stopPropagation(); onChange("all"); }}
              className="hover:bg-accent/20 rounded p-0.5"
            >
              <X size={10} />
            </span>
          </>
        ) : (
          <ChevronDown size={12} />
        )}
      </button>
      {open && (
        <div ref={panelRef} className="absolute top-full left-0 mt-1 z-50 w-56 bg-white border border-edge rounded-lg shadow-lg py-1 max-h-64 overflow-y-auto">
          <button
            onClick={() => { onChange("all"); setOpen(false); }}
            className={cn(
              "flex items-center w-full px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors cursor-pointer",
              value === "all" ? "text-accent font-medium" : "text-primary"
            )}
          >
            All error codes
          </button>
          <div className="border-t border-edge my-1" />
          {options.map((code) => (
            <button
              key={code}
              onClick={() => { onChange(code); setOpen(false); }}
              className={cn(
                "flex items-center w-full px-3 py-1.5 text-[11px] font-mono hover:bg-slate-50 transition-colors cursor-pointer",
                value === code ? "text-accent font-medium" : "text-primary"
              )}
            >
              {code}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Country badge ────────────────────────────────────────────────────────────

function CountryBadge({ country }: { country: Country }) {
  const cfg = COUNTRY_CONFIG[country];
  return (
    <span className={cn(
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border",
      cfg.bg, cfg.border, cfg.text
    )}>
      {cfg.flag} {country}
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function ErrorMDMTab() {
  const mdmFile = useMDMStore((s) => s.mdmFile);
  const errorState = useMDMStore((s) => s.errorState);
  const errorError = useMDMStore((s) => s.errorError);
  const errorRows = useMDMStore((s) => s.errorRows);
  const errorSearch = useMDMStore((s) => s.errorSearch);
  const errorCountryFilter = useMDMStore((s) => s.errorCountryFilter);
  const errorCodeFilter = useMDMStore((s) => s.errorCodeFilter);
  const errorSortColumn = useMDMStore((s) => s.errorSortColumn);
  const errorSortDirection = useMDMStore((s) => s.errorSortDirection);
  const errorCurrentPage = useMDMStore((s) => s.errorCurrentPage);
  const errorRowsPerPage = useMDMStore((s) => s.errorRowsPerPage);
  const errorVisibleColumns = useMDMStore((s) => s.errorVisibleColumns);

  const setErrorSearch = useMDMStore((s) => s.setErrorSearch);
  const setErrorCountryFilter = useMDMStore((s) => s.setErrorCountryFilter);
  const setErrorCodeFilter = useMDMStore((s) => s.setErrorCodeFilter);
  const toggleErrorSort = useMDMStore((s) => s.toggleErrorSort);
  const setErrorCurrentPage = useMDMStore((s) => s.setErrorCurrentPage);
  const setErrorRowsPerPage = useMDMStore((s) => s.setErrorRowsPerPage);

  // Debounced search
  const [searchInput, setSearchInput] = useState(errorSearch);
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback(
    (val: string) => {
      setSearchInput(val);
      if (searchTimeout) clearTimeout(searchTimeout);
      setSearchTimeout(setTimeout(() => setErrorSearch(val), 200));
    },
    [setErrorSearch, searchTimeout]
  );

  // ── Country summary counts ───────────────────────────────────────────────
  const countryCounts = useMemo(() => {
    const counts: Record<Country, { total: number; unique: Set<string> }> = {
      FR: { total: 0, unique: new Set() },
      ES: { total: 0, unique: new Set() },
      IT: { total: 0, unique: new Set() },
      DE: { total: 0, unique: new Set() },
    };
    for (const row of errorRows) {
      counts[row.derived_country].total++;
      if (row.reference) counts[row.derived_country].unique.add(row.reference);
    }
    return counts;
  }, [errorRows]);

  // ── Unique error codes for dropdown ─────────────────────────────────────
  const errorCodes = useMemo(
    () => Array.from(new Set(errorRows.map((r) => r.errorCode).filter(Boolean))).sort(),
    [errorRows]
  );

  // ── Filtering ────────────────────────────────────────────────────────────
  const matcher = useMemo(() => buildSearchMatcher(errorSearch), [errorSearch]);

  const filteredRows = useMemo(() => {
    let result = errorRows;
    if (errorCountryFilter.length > 0)
      result = result.filter((r) => errorCountryFilter.includes(r.derived_country));
    if (errorCodeFilter !== "all")
      result = result.filter((r) => r.errorCode === errorCodeFilter);
    if (matcher)
      result = result.filter((r) =>
        matcher([r.reference, r.attributeLabel, r.attributeCodes, r.errorMessage])
      );
    return result;
  }, [errorRows, errorCountryFilter, errorCodeFilter, matcher]);

  // ── Sorting ──────────────────────────────────────────────────────────────
  const sortedRows = useMemo(() => {
    if (!errorSortColumn) return filteredRows;
    const dir = errorSortDirection === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const av = a[errorSortColumn];
      const bv = b[errorSortColumn];
      const aEmpty = av === null || av === undefined || av === "";
      const bEmpty = bv === null || bv === undefined || bv === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filteredRows, errorSortColumn, errorSortDirection]);

  // ── Pagination ───────────────────────────────────────────────────────────
  const totalPages = useMemo(
    () => (errorRowsPerPage === "all" ? 1 : Math.ceil(sortedRows.length / (errorRowsPerPage as number))),
    [sortedRows, errorRowsPerPage]
  );
  const safePage = Math.min(errorCurrentPage, Math.max(1, totalPages));
  const pagedRows = useMemo(
    () =>
      errorRowsPerPage === "all"
        ? sortedRows
        : sortedRows.slice((safePage - 1) * (errorRowsPerPage as number), safePage * (errorRowsPerPage as number)),
    [sortedRows, errorRowsPerPage, safePage]
  );

  const activeCols = useMemo(
    () => ERROR_COLUMNS.filter((c) => errorVisibleColumns.includes(String(c.key))),
    [errorVisibleColumns]
  );
  const totalFlex = useMemo(() => activeCols.reduce((s, c) => s + c.flex, 0), [activeCols]);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (safePage <= 4) return [1, 2, 3, 4, 5, 6, 7];
    if (safePage >= totalPages - 3) return Array.from({ length: 7 }, (_, i) => totalPages - 6 + i);
    return Array.from({ length: 7 }, (_, i) => safePage - 3 + i);
  }, [totalPages, safePage]);

  const isFiltered =
    errorCountryFilter.length > 0 ||
    errorCodeFilter !== "all" ||
    errorSearch !== "";

  const handleExport = useCallback(() => {
    const headers = activeCols.map((c) => c.label);
    const csvRows = sortedRows.map((row) =>
      activeCols.map((c) => String(row[c.key] ?? ""))
    );
    const csv = [headers, ...csvRows]
      .map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mdm-errors-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeCols, sortedRows]);

  // ── States ───────────────────────────────────────────────────────────────

  if (!mdmFile) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-2">
          <AlertCircle size={40} className="mx-auto text-muted/30" />
          <p className="text-sm text-muted font-semibold">Upload MDM Export file to begin</p>
          <p className="text-[11px] text-muted/60">The Error Details sheet will be parsed automatically.</p>
        </div>
      </div>
    );
  }

  if (errorState === "processing") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 size={32} className="mx-auto text-accent animate-spin" />
          <p className="text-sm text-muted font-mono">Parsing error details…</p>
        </div>
      </div>
    );
  }

  if (errorState === "error") {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-3 max-w-md">
          <AlertCircle size={32} className="mx-auto text-red-400" />
          <p className="text-sm font-semibold text-red-600">Error parsing file</p>
          <p className="text-xs text-muted font-mono break-all">{errorError}</p>
        </div>
      </div>
    );
  }

  if (errorState === "idle") {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-2">
          <Loader2 size={32} className="mx-auto text-accent animate-spin" />
          <p className="text-sm text-muted">Processing…</p>
        </div>
      </div>
    );
  }

  // ── Results ───────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Country summary cards */}
      <div className="shrink-0 px-4 py-3 border-b border-edge bg-panel flex items-stretch gap-3 flex-wrap">
        {COUNTRIES.map((country) => {
          const cfg = COUNTRY_CONFIG[country];
          const counts = countryCounts[country];
          const isSelected = errorCountryFilter.includes(country);
          return (
            <button
              key={country}
              onClick={() => {
                if (isSelected) {
                  setErrorCountryFilter(errorCountryFilter.filter((c) => c !== country));
                } else {
                  setErrorCountryFilter([...errorCountryFilter, country]);
                }
              }}
              className={cn(
                "flex flex-col gap-1 px-4 py-2.5 rounded-lg border transition-all cursor-pointer text-left min-w-[120px]",
                isSelected
                  ? `${cfg.bg} ${cfg.border} ring-2 ring-offset-1 ring-current`
                  : "bg-white border-edge hover:border-primary/20 hover:bg-slate-50"
              )}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-lg leading-none">{cfg.flag}</span>
                <span className={cn("text-[12px] font-semibold", isSelected ? cfg.text : "text-primary")}>
                  {country} — {cfg.name}
                </span>
              </div>
              <div className="flex items-baseline gap-3 mt-0.5">
                <div>
                  <span className={cn("text-lg font-bold font-mono", isSelected ? cfg.text : "text-primary")}>
                    {counts.total}
                  </span>
                  <span className="text-[10px] text-muted ml-1">errors</span>
                </div>
                <div>
                  <span className={cn("text-sm font-semibold font-mono", isSelected ? cfg.text : "text-muted")}>
                    {counts.unique.size}
                  </span>
                  <span className="text-[10px] text-muted ml-1">products</span>
                </div>
              </div>
            </button>
          );
        })}
        {errorCountryFilter.length > 0 && (
          <button
            onClick={() => setErrorCountryFilter([])}
            className="flex items-center gap-1 self-start mt-1 text-[11px] text-muted hover:text-red-500 transition-colors cursor-pointer"
          >
            <X size={11} />
            Clear
          </button>
        )}
      </div>

      {/* Control bar */}
      <div className="shrink-0 border-b border-edge bg-surface px-4 py-2 flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search reference, attribute, error…"
            className="pl-7 pr-7 h-8 text-[12px] border border-edge rounded-md bg-white focus:outline-none focus:border-accent/50 w-64"
          />
          {searchInput && (
            <button
              onClick={() => { setSearchInput(""); setErrorSearch(""); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
            >
              <X size={11} />
            </button>
          )}
        </div>

        <CountryFilterDropdown selected={errorCountryFilter} onChange={setErrorCountryFilter} />

        <ErrorCodeDropdown options={errorCodes} value={errorCodeFilter} onChange={setErrorCodeFilter} />

        {isFiltered && (
          <button
            onClick={() => {
              setErrorCountryFilter([]);
              setErrorCodeFilter("all");
              setSearchInput("");
              setErrorSearch("");
            }}
            className="flex items-center gap-1 text-[11px] text-muted hover:text-red-500 transition-colors cursor-pointer"
          >
            <X size={11} />
            Clear filters
          </button>
        )}

        <div className="flex-1 min-w-0" />

        <ErrorColumnToggle />

        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download size={12} className="mr-1.5" />
          Export CSV
        </Button>
      </div>

      {/* Summary strip */}
      <div className="shrink-0 px-4 py-2 border-b border-edge bg-panel flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-muted">
          Total errors: <span className="font-semibold text-primary font-mono">{errorRows.length}</span>
        </span>
        {isFiltered && (
          <>
            <span className="text-muted text-[11px]">·</span>
            <span className="text-[11px] text-accent font-mono font-semibold">
              {filteredRows.length} shown
            </span>
          </>
        )}
      </div>

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full border-collapse" style={{ tableLayout: "fixed", minWidth: 900 }}>
          <colgroup>
            {activeCols.map((col) => (
              <col
                key={String(col.key)}
                style={{ width: `${((col.flex / totalFlex) * 100).toFixed(2)}%` }}
              />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-edge">
              {activeCols.map((col) => {
                const isSorted = errorSortColumn === col.key;
                return (
                  <th
                    key={String(col.key)}
                    onClick={() => toggleErrorSort(col.key)}
                    className={cn(
                      "text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap group",
                      isSorted ? "text-amber-600" : "text-muted hover:text-primary"
                    )}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {isSorted ? (
                        errorSortDirection === "asc"
                          ? <ArrowUp size={10} className="text-amber-600 shrink-0" />
                          : <ArrowDown size={10} className="text-amber-600 shrink-0" />
                      ) : (
                        <ArrowUpDown size={10} className="opacity-0 group-hover:opacity-30 shrink-0" />
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pagedRows.length === 0 ? (
              <tr>
                <td colSpan={activeCols.length} className="text-center py-16 text-muted text-sm">
                  {isFiltered ? "No rows match the current filters." : "No error data."}
                </td>
              </tr>
            ) : (
              pagedRows.map((row) => (
                <tr
                  key={row._id}
                  className="border-b border-edge/50 transition-colors hover:bg-surface-hover"
                >
                  {activeCols.map((col) => {
                    const value = row[col.key];
                    return (
                      <td
                        key={String(col.key)}
                        className={cn(
                          "px-3 py-2 text-[12px] overflow-hidden",
                          col.key === "errorMessage" ? "whitespace-normal" : "truncate"
                        )}
                      >
                        {col.key === "derived_country" ? (
                          <CountryBadge country={value as Country} />
                        ) : col.key === "attributeCodes" ? (
                          <span className="font-mono text-[11px] text-muted">{String(value ?? "")}</span>
                        ) : col.key === "lineNumber" ? (
                          <span className="font-mono text-[11px] text-muted/70">{String(value ?? "")}</span>
                        ) : col.key === "reference" ? (
                          <span className="font-mono text-[11px]">{String(value ?? "")}</span>
                        ) : col.key === "errorCode" ? (
                          <span className="font-mono text-[11px] bg-red-50 text-red-700 px-1.5 py-0.5 rounded">
                            {String(value ?? "")}
                          </span>
                        ) : (
                          <span>{String(value ?? "")}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination bar */}
      <div className="shrink-0 border-t border-edge bg-surface px-4 h-10 flex items-center gap-3">
        <span className="text-[11px] text-muted font-mono shrink-0">
          {sortedRows.length === 0
            ? "0 rows"
            : errorRowsPerPage === "all"
            ? `${sortedRows.length} rows`
            : `${Math.min((safePage - 1) * (errorRowsPerPage as number) + 1, sortedRows.length)}–${Math.min(safePage * (errorRowsPerPage as number), sortedRows.length)} of ${sortedRows.length}`}
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[11px] text-muted">Rows:</span>
          {([25, 50, 100, "all"] as (number | "all")[]).map((n) => (
            <button
              key={String(n)}
              onClick={() => setErrorRowsPerPage(n)}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] font-mono transition-colors",
                errorRowsPerPage === n
                  ? "bg-accent text-white"
                  : "text-muted hover:text-primary hover:bg-surface-hover"
              )}
            >
              {n === "all" ? "All" : n}
            </button>
          ))}
        </div>
        {errorRowsPerPage !== "all" && totalPages > 1 && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => setErrorCurrentPage(Math.max(1, safePage - 1))}
              disabled={safePage === 1}
              className="p-1 rounded text-muted hover:text-primary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            {pageNumbers.map((page) => (
              <button
                key={page}
                onClick={() => setErrorCurrentPage(page)}
                className={cn(
                  "w-6 h-6 rounded text-[11px] font-mono transition-colors",
                  safePage === page
                    ? "bg-accent text-white"
                    : "text-muted hover:text-primary hover:bg-surface-hover"
                )}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setErrorCurrentPage(Math.min(totalPages, safePage + 1))}
              disabled={safePage === totalPages}
              className="p-1 rounded text-muted hover:text-primary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
