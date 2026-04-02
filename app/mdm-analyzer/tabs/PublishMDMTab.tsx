"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useMDMStore, PUBLISH_COLUMNS } from "@/lib/mdm-store";
import type { PublishRow, PublishStatus } from "@/lib/mdm-store";
import { getXLSX } from "@/lib/parsers";
import { buildSearchMatcher, cn } from "@/lib/utils";
import { StatChip } from "@/components/status-badge/status-badge";
import { Button } from "@/components/ui/button";
import {
  Search, X, ArrowUp, ArrowDown, ArrowUpDown,
  Download, ChevronLeft, ChevronRight, Play,
  Columns3, Check, AlertCircle, Loader2, CheckCircle2,
} from "lucide-react";

// ── Parse & Compare Logic ────────────────────────────────────────────────────

const normalize = (val: unknown) => String(val ?? "").trim();

export async function runPublishComparison(
  mdmBuffer: ArrayBuffer,
  publishedBuffer: ArrayBuffer
): Promise<{ active: PublishRow[]; inactive: PublishRow[]; summary: import("@/lib/mdm-store").PublishSummary }> {
  const XLSX = await getXLSX();

  // ── Read MDM Export "Data" sheet ─────────────────────────────────────────
  const mdmWb = XLSX.read(new Uint8Array(mdmBuffer), { type: "array" });
  const dataWs = mdmWb.Sheets["Data"];
  if (!dataWs) throw new Error("File does not contain expected sheet 'Data'. Please upload the correct MDM Export file.");

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(dataWs, { header: 1, defval: "" }) as unknown[][];
  if (rawRows.length < 2) throw new Error("MDM Export 'Data' sheet has insufficient rows.");

  let headerRowIndex = -1;
  const colMap = new Map<string, number>();

  for (let r = 0; r < Math.min(rawRows.length, 10); r++) {
    const rowObj = rawRows[r] as unknown[];
    let hasRef = false;
    const tempMap = new Map<string, number>();

    rowObj.forEach((code, idx) => {
      const c = normalize(code).toLowerCase();
      if (c) tempMap.set(c, idx);
      if (c === "reference") hasRef = true;
    });

    if (hasRef) {
      headerRowIndex = r;
      tempMap.forEach((v, k) => colMap.set(k, v));
      break;
    }
  }

  if (headerRowIndex === -1) {
    throw new Error("Could not find a header row containing 'Reference' column in MDM Export 'Data' sheet.");
  }

  const getByAttr = (row: unknown[], attrCode: string) => {
    const idx = colMap.get(attrCode.toLowerCase());
    return idx !== undefined ? normalize(row[idx]) : "";
  };

  // Skip attribute-code row if present (some MDM exports include it as row after header)
  let dataStartIndex = headerRowIndex + 1;
  const nextRow = rawRows[dataStartIndex] as unknown[];
  if (nextRow && nextRow[0] && String(nextRow[0]).trim().toLowerCase().startsWith("attr_")) {
    dataStartIndex++;
  }

  const productRows = rawRows.slice(dataStartIndex);

  // ── Read Published Products "Products" sheet ──────────────────────────────
  const pubWb = XLSX.read(new Uint8Array(publishedBuffer), { type: "array" });
  const pubWs = pubWb.Sheets["Products"];
  if (!pubWs) throw new Error("File does not contain expected sheet 'Products'. Please upload the correct Published Products file.");

  const pubData = XLSX.utils.sheet_to_json<Record<string, unknown>>(pubWs, { defval: "" });

  const pubMap = new Map<string, Record<string, unknown>>();
  for (const row of pubData) {
    let sku = "";
    for (const key of Object.keys(row)) {
      if (key.trim().toLowerCase() === "sku") {
        sku = normalize(row[key]);
        break;
      }
    }
    if (sku) pubMap.set(sku, row);
  }

  // ── Compare ───────────────────────────────────────────────────────────────
  let skipped = 0;
  const active: PublishRow[] = [];
  const inactive: PublishRow[] = [];

  productRows.forEach((row, i) => {
    const ref = getByAttr(row as unknown[], "Reference");
    if (!ref) { skipped++; return; }

    const pubRow = pubMap.get(ref);
    let publish_status: PublishStatus;
    let publishedPlatform: boolean | null = null;
    let price = "";
    let stock = "";

    if (!pubRow) {
      // Not found in published list → unpublished
      publish_status = "unpublished";
    } else {
      let pub: unknown;
      let pubPrice: unknown;
      let pubStock: unknown;

      for (const k of Object.keys(pubRow)) {
        const lowerK = k.trim().toLowerCase();
        if (lowerK === "published") pub = pubRow[k];
        if (lowerK === "price") pubPrice = pubRow[k];
        if (lowerK === "stockquantity") pubStock = pubRow[k];
      }

      publishedPlatform = pub === true || normalize(pub).toLowerCase() === "true";
      publish_status = publishedPlatform ? "published" : "unpublished";
      price = normalize(pubPrice);
      stock = normalize(pubStock);
    }

    const resultRow: PublishRow = {
      _id: i,
      reference: ref,
      productTitle: getByAttr(row as unknown[], "Product title"),
      category: getByAttr(row as unknown[], "Category"),
      brand: getByAttr(row as unknown[], "Brand"),
      ean: getByAttr(row as unknown[], "Ean Code"),
      publish_status,
      publishedPlatform,
      price,
      stock,
    };

    if (publish_status === "published") {
      active.push(resultRow);
    } else {
      inactive.push(resultRow);
    }
  });

  const summary = {
    total: active.length + inactive.length + skipped,
    published: active.length,
    unpublished: inactive.length,
    notListed: 0,
    skipped,
  };

  return { active, inactive, summary };
}

// ── Column Toggle ─────────────────────────────────────────────────────────────

function PublishColumnToggle() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const visibleColumns = useMDMStore((s) => s.publishVisibleColumns);
  const toggleColumn = useMDMStore((s) => s.togglePublishColumn);
  const showAll = useMDMStore((s) => s.showAllPublishColumns);
  const hideAll = useMDMStore((s) => s.hideAllPublishColumns);
  const hidden = PUBLISH_COLUMNS.length - visibleColumns.length;

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
        <div ref={panelRef} className="absolute top-full left-0 mt-1 z-50 w-56 bg-white border border-edge rounded-lg shadow-lg py-1">
          <div className="flex items-center gap-1 px-2 py-1.5 border-b border-edge">
            <button onClick={showAll} className="text-[11px] text-accent hover:underline cursor-pointer">Select All</button>
            <span className="text-muted text-[11px]">·</span>
            <button onClick={hideAll} className="text-[11px] text-accent hover:underline cursor-pointer">Clear All</button>
          </div>
          <div className="max-h-72 overflow-y-auto py-1">
            {PUBLISH_COLUMNS.map((col) => {
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

// ── Publish Status Badge ──────────────────────────────────────────────────────

function PublishStatusBadge({ status }: { status: PublishStatus }) {
  if (status === "published") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-700">
        Published
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-100 text-red-700">
      Unpublished
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PublishMDMTab() {
  const mdmFile = useMDMStore((s) => s.mdmFile);
  const publishedFile = useMDMStore((s) => s.publishedFile);
  const publishState = useMDMStore((s) => s.publishState);
  const publishError = useMDMStore((s) => s.publishError);
  const publishActiveRows = useMDMStore((s) => s.publishActiveRows);
  const publishInactiveRows = useMDMStore((s) => s.publishInactiveRows);
  const publishSummary = useMDMStore((s) => s.publishSummary);
  const publishSearch = useMDMStore((s) => s.publishSearch);
  const publishStatusFilter = useMDMStore((s) => s.publishStatusFilter);
  const publishSortColumn = useMDMStore((s) => s.publishSortColumn);
  const publishSortDirection = useMDMStore((s) => s.publishSortDirection);
  const publishCurrentPage = useMDMStore((s) => s.publishCurrentPage);
  const publishRowsPerPage = useMDMStore((s) => s.publishRowsPerPage);
  const publishVisibleColumns = useMDMStore((s) => s.publishVisibleColumns);

  const setPublishState = useMDMStore((s) => s.setPublishState);
  const setPublishError = useMDMStore((s) => s.setPublishError);
  const setPublishResults = useMDMStore((s) => s.setPublishResults);
  const resetPublish = useMDMStore((s) => s.resetPublish);
  const setPublishSearch = useMDMStore((s) => s.setPublishSearch);
  const setPublishStatusFilter = useMDMStore((s) => s.setPublishStatusFilter);
  const togglePublishSort = useMDMStore((s) => s.togglePublishSort);
  const setPublishCurrentPage = useMDMStore((s) => s.setPublishCurrentPage);
  const setPublishRowsPerPage = useMDMStore((s) => s.setPublishRowsPerPage);

  const [searchInput, setSearchInput] = useState(publishSearch);
  const [searchTimeout, setSearchTimeout] = useState<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback(
    (val: string) => {
      setSearchInput(val);
      if (searchTimeout) clearTimeout(searchTimeout);
      setSearchTimeout(setTimeout(() => setPublishSearch(val), 200));
    },
    [setPublishSearch, searchTimeout]
  );

  // All rows combined — single unified table
  const allRows = useMemo(
    () => [...publishActiveRows, ...publishInactiveRows],
    [publishActiveRows, publishInactiveRows]
  );

  const handleExport = useCallback(() => {
    const activeCols = PUBLISH_COLUMNS.filter((c) => publishVisibleColumns.includes(String(c.key)));
    const headers = activeCols.map((c) => c.label);
    const csvRows = allRows.map((row) =>
      activeCols.map((c) => {
        const v = row[c.key];
        if (c.key === "publishedPlatform") return v === null ? "" : String(v);
        return String(v ?? "");
      })
    );
    const csv = [headers, ...csvRows]
      .map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mdm-publish-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [allRows, publishVisibleColumns]);

  const handleExportExcel = useCallback(async () => {
    const XLSX = await getXLSX();
    const activeCols = PUBLISH_COLUMNS.filter((c) => publishVisibleColumns.includes(String(c.key)));
    const headers = activeCols.map((c) => c.label);
    const dataRows = allRows.map((row) =>
      activeCols.map((c) => {
        const v = row[c.key];
        if (c.key === "publishedPlatform") return v === null ? "" : String(v);
        return v ?? "";
      })
    );
    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "MDM Publish");
    XLSX.writeFile(wb, `mdm-publish-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }, [allRows, publishVisibleColumns]);

  // ── Derive table data ────────────────────────────────────────────────────
  const matcher = useMemo(() => buildSearchMatcher(publishSearch), [publishSearch]);

  const filteredRows = useMemo(() => {
    let result = allRows;
    if (publishStatusFilter !== "all") {
      result = result.filter((r) => r.publish_status === publishStatusFilter);
    }
    if (matcher) {
      result = result.filter((r) =>
        matcher([r.reference, r.productTitle, r.category, r.brand])
      );
    }
    return result;
  }, [allRows, publishStatusFilter, matcher]);

  const sortedRows = useMemo(() => {
    if (!publishSortColumn) return filteredRows;
    const dir = publishSortDirection === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const av = a[publishSortColumn];
      const bv = b[publishSortColumn];
      const aEmpty = av === null || av === undefined || av === "";
      const bEmpty = bv === null || bv === undefined || bv === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filteredRows, publishSortColumn, publishSortDirection]);

  const totalPages = useMemo(
    () => (publishRowsPerPage === "all" ? 1 : Math.ceil(sortedRows.length / (publishRowsPerPage as number))),
    [sortedRows, publishRowsPerPage]
  );

  const safePage = Math.min(publishCurrentPage, Math.max(1, totalPages));

  const pagedRows = useMemo(
    () =>
      publishRowsPerPage === "all"
        ? sortedRows
        : sortedRows.slice((safePage - 1) * (publishRowsPerPage as number), safePage * (publishRowsPerPage as number)),
    [sortedRows, publishRowsPerPage, safePage]
  );

  const activeCols = useMemo(
    () => PUBLISH_COLUMNS.filter((c) => publishVisibleColumns.includes(String(c.key))),
    [publishVisibleColumns]
  );

  const totalFlex = useMemo(() => activeCols.reduce((s, c) => s + c.flex, 0), [activeCols]);

  const pageNumbers = useMemo(() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (safePage <= 4) return [1, 2, 3, 4, 5, 6, 7];
    if (safePage >= totalPages - 3) return Array.from({ length: 7 }, (_, i) => totalPages - 6 + i);
    return Array.from({ length: 7 }, (_, i) => safePage - 3 + i);
  }, [totalPages, safePage]);

  const matchRate = publishSummary
    ? ((publishSummary.published / Math.max(publishSummary.total - publishSummary.skipped, 1)) * 100).toFixed(1)
    : null;

  // ── States ───────────────────────────────────────────────────────────────

  if (!mdmFile || !publishedFile) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-2">
          <CheckCircle2 size={40} className="mx-auto text-muted/30" />
          <p className="text-sm text-muted font-semibold">Upload both files to compare</p>
          <p className="text-[11px] text-muted/60">
            {!mdmFile ? "MDM Export file is required." : "Published Products file is required."}
          </p>
        </div>
      </div>
    );
  }

  if (publishState === "processing") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 size={32} className="mx-auto text-accent animate-spin" />
          <p className="text-sm text-muted font-mono">Comparing MDM vs Published…</p>
        </div>
      </div>
    );
  }

  if (publishState === "error") {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-3 max-w-md">
          <AlertCircle size={32} className="mx-auto text-red-400" />
          <p className="text-sm font-semibold text-red-600">Error processing files</p>
          <p className="text-xs text-muted font-mono break-all">{publishError}</p>
          <Button variant="outline" size="sm" onClick={resetPublish}>Try Again</Button>
        </div>
      </div>
    );
  }

  if (publishState === "idle") {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <CheckCircle2 size={40} className="mx-auto text-accent/40" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-primary">Both files ready</p>
            <p className="text-[11px] text-muted">Click Run Analysis in the top bar to compare MDM Export against Published Products.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Results ───────────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col min-h-0">

      {/* Control bar */}
      <div className="shrink-0 border-b border-edge bg-surface px-4 py-2 flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search reference, title, category…"
            className="pl-7 pr-7 h-8 text-[12px] border border-edge rounded-md bg-white focus:outline-none focus:border-accent/50 w-64"
          />
          {searchInput && (
            <button
              onClick={() => { setSearchInput(""); setPublishSearch(""); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1">
          {([
            { value: "all", label: "All" },
            { value: "published", label: "Published" },
            { value: "unpublished", label: "Unpublished" },
          ] as { value: "all" | PublishStatus; label: string }[]).map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPublishStatusFilter(opt.value)}
              className={cn(
                "h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer",
                publishStatusFilter === opt.value
                  ? "bg-accent/10 text-accent border border-accent/30"
                  : "text-muted hover:text-primary hover:bg-surface-hover border border-transparent"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0" />

        <PublishColumnToggle />

        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download size={12} className="mr-1.5" />
          CSV
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportExcel}>
          <Download size={12} className="mr-1.5" />
          Excel
        </Button>
      </div>

      {/* Summary bar */}
      {publishSummary && (
        <div className="shrink-0 px-4 py-2 border-b border-edge bg-panel flex items-center gap-2 flex-wrap">
          <StatChip label="Total MDM" value={publishSummary.total} />
          <StatChip label="Published" value={publishSummary.published} accent />
          <StatChip label="Unpublished" value={publishSummary.unpublished} />
          {matchRate !== null && (
            <StatChip label="Match Rate" value={`${matchRate}%`} accent />
          )}
          {publishSummary.skipped > 0 && (
            <StatChip label="Skipped (no ref)" value={publishSummary.skipped} />
          )}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full border-collapse" style={{ tableLayout: "fixed", minWidth: 800 }}>
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
                const isSorted = publishSortColumn === col.key;
                return (
                  <th
                    key={String(col.key)}
                    onClick={() => togglePublishSort(col.key)}
                    className={cn(
                      "text-left px-3 py-2 text-[11px] font-semibold uppercase tracking-wider cursor-pointer select-none whitespace-nowrap group",
                      isSorted ? "text-amber-600" : "text-muted hover:text-primary"
                    )}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {isSorted ? (
                        publishSortDirection === "asc"
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
                  No rows match the current filters.
                </td>
              </tr>
            ) : (
              pagedRows.map((row) => (
                <tr
                  key={row._id}
                  className={cn(
                    "border-b border-edge/50 transition-colors hover:bg-surface-hover",
                    row.publish_status === "unpublished" && "bg-red-50/40"
                  )}
                >
                  {activeCols.map((col) => {
                    const value = row[col.key];
                    return (
                      <td
                        key={String(col.key)}
                        className="px-3 py-2 text-[12px] truncate overflow-hidden"
                      >
                        {col.key === "publish_status" ? (
                          <PublishStatusBadge status={value as PublishStatus} />
                        ) : col.key === "publishedPlatform" ? (
                          <span className={cn(
                            "text-[11px] font-mono",
                            value === true ? "text-emerald-600" : value === false ? "text-red-500" : "text-muted"
                          )}>
                            {value === null ? "—" : String(value)}
                          </span>
                        ) : col.key === "reference" || col.key === "ean" ? (
                          <span className="font-mono text-[11px]">{String(value ?? "")}</span>
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
            : publishRowsPerPage === "all"
              ? `${sortedRows.length} rows`
              : `${Math.min((safePage - 1) * (publishRowsPerPage as number) + 1, sortedRows.length)}–${Math.min(safePage * (publishRowsPerPage as number), sortedRows.length)} of ${sortedRows.length}`}
        </span>
        <div className="flex-1" />
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[11px] text-muted">Rows:</span>
          {([25, 50, 100, "all"] as (number | "all")[]).map((n) => (
            <button
              key={String(n)}
              onClick={() => setPublishRowsPerPage(n)}
              className={cn(
                "px-2 py-0.5 rounded text-[11px] font-mono transition-colors",
                publishRowsPerPage === n
                  ? "bg-accent text-white"
                  : "text-muted hover:text-primary hover:bg-surface-hover"
              )}
            >
              {n === "all" ? "All" : n}
            </button>
          ))}
        </div>
        {publishRowsPerPage !== "all" && totalPages > 1 && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => setPublishCurrentPage(Math.max(1, safePage - 1))}
              disabled={safePage === 1}
              className="p-1 rounded text-muted hover:text-primary hover:bg-surface-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            {pageNumbers.map((page) => (
              <button
                key={page}
                onClick={() => setPublishCurrentPage(page)}
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
              onClick={() => setPublishCurrentPage(Math.min(totalPages, safePage + 1))}
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
