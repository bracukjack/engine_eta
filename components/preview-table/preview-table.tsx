"use client";

import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import { FixedSizeList as List } from "react-window";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { HIGHLIGHTED_PREVIEW_COLUMNS, FILE_SLOTS_CONFIG, TABLE_SIZE_CONFIG, type FileKey, type TableSize } from "@/lib/types";
import { Search, AlertTriangle, FileText, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

const FIRST_COL_WIDTH = 44;
const COL_MIN_WIDTH = 130;

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

  const outerRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(400);
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
  const highlighted = previewTab ? HIGHLIGHTED_PREVIEW_COLUMNS[previewTab] : new Set<string>();

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

  // Measure list height
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((e) => setListHeight(Math.max(100, e[0]?.contentRect.height ?? 400)));
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Sync header horizontal scroll
  const syncScroll = useCallback(() => {
    if (headerRef.current && outerRef.current)
      headerRef.current.scrollLeft = outerRef.current.scrollLeft;
  }, []);
  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    el.addEventListener("scroll", syncScroll);
    return () => el.removeEventListener("scroll", syncScroll);
  }, [syncScroll, activeData]);

  if (tabs.length === 0) return null;

  const headers = activeData?.headers ?? [];
  const colCount = headers.length;
  const totalWidth = FIRST_COL_WIDTH + colCount * COL_MIN_WIDTH;

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

          {/* ── Header ───────────────────────────────────────── */}
          <div className="shrink-0 border-b border-edge bg-surface overflow-hidden">
            <div ref={headerRef} className="overflow-hidden">
              <div className="flex" style={{ width: totalWidth, minWidth: "100%", height: 36 }}>
                {/* Row # */}
                <div
                  className="shrink-0 sticky left-0 z-20 bg-slate-100 border-r border-edge flex items-center justify-center text-[10px] font-bold text-muted"
                  style={{ width: FIRST_COL_WIDTH }}
                >#</div>
                {headers.map((h, ci) => {
                  const isHl = highlighted.has(h);
                  const isSorted = sortCol === ci;
                  return (
                    <button
                      key={ci}
                      onClick={() => handleSort(ci)}
                      className={cn(
                        "shrink-0 flex items-center gap-1 px-2 text-[11px] font-semibold uppercase tracking-wider border-r border-edge cursor-pointer transition-colors truncate",
                        isSorted
                          ? "bg-amber-50 text-amber-700 border-b-2 border-b-amber-400"
                          : isHl
                          ? "bg-amber-50/60 text-amber-800 hover:bg-amber-50"
                          : "bg-slate-100 text-muted hover:text-primary"
                      )}
                      style={{ width: COL_MIN_WIDTH }}
                      title={h}
                    >
                      <span className="truncate flex-1 text-left">{h}</span>
                      {isSorted ? (
                        sortDir === "asc" ? <ArrowUp size={10} className="text-amber-600 shrink-0" /> : <ArrowDown size={10} className="text-amber-600 shrink-0" />
                      ) : (
                        <ArrowUpDown size={10} className="opacity-20 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Body (virtualized) ──────────────────────────── */}
          <div ref={containerRef} className="flex-1 min-h-0">
            {displayRows.length > 0 ? (
              <List
                outerRef={outerRef}
                height={listHeight}
                width="100%"
                itemCount={displayRows.length}
                itemSize={sizeConfig.rowHeight}
                style={{ overflowX: "auto", overflowY: "auto" }}
              >
                {({ index, style }) => {
                  const row = displayRows[index];
                  const isEven = index % 2 === 0;
                  return (
                    <div
                      style={{ ...style, width: totalWidth, minWidth: "100%" }}
                      className={cn("flex items-center border-b border-edge/50 hover:bg-surface-hover", isEven ? "bg-white" : "bg-slate-50/60")}
                    >
                      <div
                        className="shrink-0 sticky left-0 z-10 bg-inherit border-r border-edge flex items-center justify-center font-mono text-muted"
                        style={{ width: FIRST_COL_WIDTH, fontSize: sizeConfig.fontSize, padding: sizeConfig.cellPadding }}
                      >
                        {index + 1}
                      </div>
                      {row.map((cell, ci) => {
                        const isHl = highlighted.has(headers[ci] ?? "");
                        return (
                          <div
                            key={ci}
                            className={cn(
                              "shrink-0 font-mono border-r border-edge truncate",
                              isHl ? "text-primary" : "text-primary/55"
                            )}
                            style={{ width: COL_MIN_WIDTH, fontSize: sizeConfig.fontSize, padding: sizeConfig.cellPadding }}
                            title={cell}
                          >
                            {cell === "" ? <span className="text-muted/30">—</span> : cell}
                          </div>
                        );
                      })}
                    </div>
                  );
                }}
              </List>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-muted">
                {previewSearch ? "No rows match your search" : "No data"}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

