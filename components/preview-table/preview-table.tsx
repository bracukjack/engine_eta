"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { HIGHLIGHTED_PREVIEW_COLUMNS, FILE_SLOTS_CONFIG, TABLE_SIZE_CONFIG, type TableSize } from "@/lib/types";
import { Search, AlertTriangle, FileText } from "lucide-react";
import { VirtualDataTable, type VDTColumnMeta } from "@/components/data-table/virtual-data-table";

const FIRST_COL_WIDTH = 44;
const COL_MIN_WIDTH = 130;

type PreviewRow = string[];

export function PreviewTable() {
  const previewData = useAppStore((s) => s.previewData);
  const previewTab = useAppStore((s) => s.previewTab);
  const previewRowLimit = useAppStore((s) => s.previewRowLimit);
  const previewSearch = useAppStore((s) => s.previewSearch);
  const setPreviewTab = useAppStore((s) => s.setPreviewTab);
  const setPreviewRowLimit = useAppStore((s) => s.setPreviewRowLimit);
  const setPreviewSearch = useAppStore((s) => s.setPreviewSearch);

  const [size, setSize] = useState<TableSize>("M");
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [searchInput, setSearchInput] = useState(previewSearch);

  const sizeConfig = TABLE_SIZE_CONFIG[size];

  // Available tabs (only uploaded files)
  const tabs = useMemo(
    () =>
      FILE_SLOTS_CONFIG.filter((cfg) => previewData[cfg.key] !== null).map(
        (cfg) => ({ key: cfg.key, label: cfg.label, data: previewData[cfg.key]! })
      ),
    [previewData]
  );

  const activeData = previewTab ? previewData[previewTab] : null;
  const highlighted = useMemo(
    () => (previewTab ? HIGHLIGHTED_PREVIEW_COLUMNS[previewTab] : new Set<string>()),
    [previewTab]
  );

  // Reset sort when tab changes
  useEffect(() => { setSortCol(null); setSortDir("asc"); }, [previewTab]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setPreviewSearch(searchInput), 150);
    return () => clearTimeout(t);
  }, [searchInput, setPreviewSearch]);

  // Filter rows
  const filteredRows = useMemo(() => {
    if (!activeData) return [];
    let rows = activeData.rows;
    if (previewSearch) {
      const term = previewSearch.toLowerCase();
      rows = rows.filter((r) => r.some((c) => c.toLowerCase().includes(term)));
    }
    return rows;
  }, [activeData, previewSearch]);

  // Sort rows
  const sortedRows = useMemo(() => {
    if (sortCol === null) return filteredRows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filteredRows].sort((a, b) => {
      const av = a[sortCol] ?? "";
      const bv = b[sortCol] ?? "";
      const an = parseFloat(av.replace(",", ".").replace(/\./g, ""));
      const bn = parseFloat(bv.replace(",", ".").replace(/\./g, ""));
      if (!isNaN(an) && !isNaN(bn)) return (an - bn) * dir;
      return av.localeCompare(bv, undefined, { sensitivity: "base" }) * dir;
    });
  }, [filteredRows, sortCol, sortDir]);

  // Row limit
  const displayRows = useMemo(
    () => (previewRowLimit >= sortedRows.length ? sortedRows : sortedRows.slice(0, previewRowLimit)),
    [sortedRows, previewRowLimit]
  );

  // 3-click sort cycle
  const handleSort = useCallback((ci: number) => {
    setSortCol((prev) => {
      if (prev !== ci) { setSortDir("asc"); return ci; }
      setSortDir((d) => {
        if (d === "asc") return "desc";
        // third click → clear
        setSortCol(null);
        return "asc";
      });
      return ci;
    });
  }, []);

  const headers = useMemo(() => activeData?.headers ?? [], [activeData]);
  const colCount = headers.length;

  // One column per CSV header; data rows are plain string[] indexed by column.
  const columns = useMemo<ColumnDef<PreviewRow>[]>(
    () =>
      headers.map((h, ci) => {
        const isHl = highlighted.has(h);
        const meta: VDTColumnMeta = {
          headerClassName: isHl ? "bg-amber-50/60 text-amber-800 hover:bg-amber-50" : "bg-slate-100",
          cellClassName: cn("font-mono", isHl ? "text-primary" : "text-primary/55"),
        };
        return {
          id: String(ci),
          header: h,
          size: COL_MIN_WIDTH,
          accessorFn: (row) => row[ci] ?? "",
          cell: ({ getValue }) => {
            const v = getValue<string>();
            return v === "" ? <span className="text-muted/30">—</span> : v;
          },
          meta,
        };
      }),
    [headers, highlighted]
  );

  if (tabs.length === 0) return null;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── File tabs ─────────────────────────────────── */}
      <div className="shrink-0 flex items-center justify-between border-b border-edge bg-surface/50 px-2 py-1">
        <div className="flex items-center gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setPreviewTab(tab.key)}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold rounded cursor-pointer transition-colors whitespace-nowrap",
                previewTab === tab.key
                  ? "bg-white text-primary shadow-sm border border-edge"
                  : "text-muted hover:bg-slate-50"
              )}
            >
              <FileText size={10} />
              {tab.label}
              <span className="text-[9px] font-mono bg-slate-100 rounded px-1">
                {tab.data.totalRows.toLocaleString()}
              </span>
            </button>
          ))}
        </div>
        {/* Size toggle — same style as top bar */}
        <div className="shrink-0 inline-flex border border-edge rounded overflow-hidden ml-2">
          {(["S", "M", "L"] as TableSize[]).map((s) => (
            <button
              key={s}
              onClick={() => setSize(s)}
              className={cn(
                "px-2 py-1 text-[10px] font-bold cursor-pointer transition-colors",
                size === s ? "bg-amber-500 text-white" : "bg-white text-muted hover:bg-slate-50"
              )}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {!activeData ? (
        <div className="flex-1 flex items-center justify-center text-xs text-muted">Select a file tab</div>
      ) : activeData.error ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 p-4">
          <AlertTriangle size={20} className="text-amber-500" />
          <p className="text-xs text-red-600 text-center">{activeData.error}</p>
        </div>
      ) : (
        <>
          {/* ── Search + row limit ───────────────────────────── */}
          <div className="shrink-0 flex items-center gap-2 px-2 py-1.5 border-b border-edge bg-white">
            <div className="flex-1 relative">
              <Search size={10} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search rows…"
                className="w-full bg-slate-50 border border-edge rounded pl-6 pr-2 py-1 text-[11px] font-mono text-primary focus:outline-none focus:ring-1 focus:ring-accent/50"
              />
            </div>
            <select
              value={previewRowLimit >= sortedRows.length ? -1 : previewRowLimit}
              onChange={(e) => {
                const v = Number(e.target.value);
                setPreviewRowLimit(v === -1 ? Infinity : v);
              }}
              className="bg-slate-50 border border-edge rounded px-2 py-1 text-[10px] font-mono text-primary cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent/50"
            >
              {[50, 100, 500].map((n) => (
                <option key={n} value={n}>Top {n}</option>
              ))}
              <option value={-1}>All ({sortedRows.length.toLocaleString()})</option>
            </select>
          </div>

          {/* ── Stats bar ───────────────────────────────────── */}
          <div className="shrink-0 flex items-center gap-2 px-2 py-0.5 border-b border-edge bg-slate-50 text-[10px] text-muted font-mono">
            <span className="truncate max-w-[160px]" title={activeData.filename}>{activeData.filename}</span>
            <span className="text-muted/40">|</span>
            <span>{displayRows.length.toLocaleString()}{sortedRows.length !== displayRows.length ? ` / ${sortedRows.length.toLocaleString()}` : ""} rows</span>
            <span className="text-muted/40">|</span>
            <span>{colCount} cols</span>
            <span className="text-muted/40">|</span>
            <span>{activeData.encoding}</span>
          </div>

          {/* ── Table (virtualized, sticky header) ──────────── */}
          <VirtualDataTable<PreviewRow>
            data={displayRows}
            columns={columns}
            rowHeight={sizeConfig.rowHeight}
            fontSize={sizeConfig.fontSize}
            cellPadding={sizeConfig.cellPadding}
            headerPadding="0 8px"
            bordered
            rowNumber
            rowNumberWidth={FIRST_COL_WIDTH}
            enableCopy
            getCellTip={(row, id) => row[Number(id)] || undefined}
            sortColumnId={sortCol === null ? null : String(sortCol)}
            sortDir={sortDir}
            onSort={(id) => handleSort(Number(id))}
            getRowClassName={(_, index) => (index % 2 === 0 ? "bg-white" : "bg-slate-50/60")}
            empty={previewSearch ? "No rows match your search" : "No data"}
          />
        </>
      )}
    </div>
  );
}

