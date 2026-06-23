"use client";

import { useState, useCallback, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseFileBuffer } from "@/lib/parsers";
import { exportToCsv, exportToExcel } from "@/lib/utils";
import {
  Upload,
  CheckCircle2,
  X,
  Download,
  FileSearch,
  AlertCircle,
  AlertTriangle,
  ChevronsUpDown,
  ChevronUp,
  ChevronDown,
  ExternalLink,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ActiveTab = "missing-offers" | "log-matcher";

// ── Shared helper ─────────────────────────────────────────────────────────────

function findField(row: Record<string, unknown>, candidates: string[]): string {
  const keys = Object.keys(row);
  for (const c of candidates) {
    const key = keys.find((k) => k.trim().toLowerCase() === c.toLowerCase());
    if (key !== undefined && String(row[key] ?? "").trim() !== "") {
      return String(row[key]).trim();
    }
  }
  return "";
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AmazonPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("missing-offers");

  const TABS: { id: ActiveTab; label: string; Icon: typeof AlertCircle }[] = [
    { id: "missing-offers", label: "Missing Offers", Icon: AlertCircle },
    { id: "log-matcher", label: "Log Matcher", Icon: FileSearch },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-edge bg-surface px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-sm font-semibold text-primary tracking-tight mr-2">Amazon</h1>
          <div className="flex items-center gap-1 bg-panel border border-edge rounded-md p-0.5">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 h-6 text-[11px] font-semibold rounded transition-colors",
                  activeTab === id
                    ? "bg-white text-primary shadow-sm border border-edge"
                    : "text-muted hover:text-primary"
                )}
              >
                <Icon size={11} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeTab === "missing-offers" ? <MissingOffersTab /> : <LogMatcherTab />}
      </div>
    </div>
  );
}

// ── Missing Offers Tab ────────────────────────────────────────────────────────

interface MissingOfferItem {
  date: string;
  productName: string;
  asin: string;
  sku: string;
  gtin: string;
  qty: number;
}

type QtyFilter = "all" | "zero" | "hasstock";
type MOSortCol = "date" | "productName" | "asin" | "sku" | "gtin" | "qty";
type SortDir = "asc" | "desc";

function parseMissingOfferItem(row: Record<string, unknown>): MissingOfferItem {
  const qtyStr = findField(row, [
    "quantity", "qty", "available (fbm)", "afn-fulfillable-quantity",
    "Quantity Available", "Available", "FBM Fulfillable Qty",
  ]);
  return {
    date: findField(row, ["date-time", "Date Added", "date", "listing-date", "created-date"]),
    productName: findField(row, ["item-name", "title", "Title", "Product Name", "Name", "Description"]),
    asin: findField(row, ["asin1", "asin", "ASIN"]),
    sku: findField(row, ["seller-sku", "sku", "SKU", "Seller SKU", "Code", "code"]),
    gtin: findField(row, ["external-product-id", "gtin", "GTIN", "upc", "UPC", "EAN", "ean"]),
    qty: Math.max(0, parseInt(qtyStr, 10) || 0),
  };
}

function MissingOffersTab() {
  const [items, setItems] = useState<MissingOfferItem[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [qtyFilter, setQtyFilter] = useState<QtyFilter>("all");
  const [sortCol, setSortCol] = useState<MOSortCol>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const onDrop = useCallback(async (accepted: File[]) => {
    const file = accepted[0];
    if (!file) return;
    setError(null);
    setFileName(file.name);
    setItems([]);
    try {
      const buf = await file.arrayBuffer();
      const rows = await parseFileBuffer(buf);
      const parsed = rows.map(parseMissingOfferItem).filter((i) => i.sku || i.asin);
      if (parsed.length === 0) {
        setError("No valid rows found. Make sure the file has SKU or ASIN columns.");
        setFileName(null);
        return;
      }
      setItems(parsed);
    } catch (err) {
      setError(`Failed to parse file: ${err instanceof Error ? err.message : String(err)}`);
      setFileName(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "text/tab-separated-values": [".tsv", ".txt"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
    multiple: false,
  });

  const summary = useMemo(() => ({
    total: items.length,
    zero: items.filter((i) => i.qty === 0).length,
    hasStock: items.filter((i) => i.qty > 0).length,
  }), [items]);

  const filtered = useMemo(() => {
    let data = items;
    if (qtyFilter === "zero") data = data.filter((i) => i.qty === 0);
    else if (qtyFilter === "hasstock") data = data.filter((i) => i.qty > 0);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      data = data.filter(
        (i) =>
          i.sku.toLowerCase().includes(q) ||
          i.asin.toLowerCase().includes(q) ||
          i.productName.toLowerCase().includes(q) ||
          i.gtin.toLowerCase().includes(q)
      );
    }
    return [...data].sort((a, b) => {
      const av = sortCol === "qty" ? a.qty : String(a[sortCol] ?? "");
      const bv = sortCol === "qty" ? b.qty : String(b[sortCol] ?? "");
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [items, qtyFilter, search, sortCol, sortDir]);

  const handleSort = (col: MOSortCol) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  function SortIcon({ col }: { col: MOSortCol }) {
    if (sortCol !== col) return <ChevronsUpDown size={10} className="text-muted/40 ml-1 inline" />;
    return sortDir === "asc"
      ? <ChevronUp size={10} className="text-accent ml-1 inline" />
      : <ChevronDown size={10} className="text-accent ml-1 inline" />;
  }

  const COLS: { key: MOSortCol; label: string; align?: "right" }[] = [
    { key: "date", label: "Date Added" },
    { key: "productName", label: "Product Name" },
    { key: "asin", label: "ASIN" },
    { key: "sku", label: "SKU" },
    { key: "gtin", label: "GTIN" },
    { key: "qty", label: "Qty (FBM)", align: "right" },
  ];

  return (
    <div className="p-4 space-y-4">
      {items.length === 0 && (
        <div className="max-w-xl">
          <div
            {...getRootProps()}
            className={cn(
              "border-2 border-dashed rounded-lg p-10 cursor-pointer transition-all duration-200 text-center select-none",
              isDragActive
                ? "border-accent bg-blue-50"
                : "border-edge hover:border-accent/40 bg-surface"
            )}
          >
            <input {...getInputProps()} />
            <Upload
              size={24}
              className={cn("mx-auto mb-3", isDragActive ? "text-accent" : "text-muted")}
            />
            <p className="text-sm font-medium text-primary">
              {isDragActive ? "Drop file here" : "Upload Amazon Seller Central export"}
            </p>
            <p className="text-[11px] text-muted font-mono mt-1">
              .csv · .tsv · .xlsx · UTF-16 supported
            </p>
          </div>
          {error && (
            <div className="mt-3 flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>
      )}

      {items.length > 0 && (
        <>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded text-[11px] text-emerald-700 font-mono">
              <CheckCircle2 size={12} />
              <span className="truncate max-w-[180px]">{fileName}</span>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search SKU, ASIN, product..."
              className="h-7 px-2.5 text-xs bg-white border border-edge rounded focus:outline-none focus:ring-2 focus:ring-accent/30 w-52"
            />
            <div className="flex items-center gap-1 bg-panel border border-edge rounded-md p-0.5">
              {(
                [
                  ["all", "All"],
                  ["zero", "Qty = 0"],
                  ["hasstock", "Qty > 0"],
                ] as [QtyFilter, string][]
              ).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setQtyFilter(val)}
                  className={cn(
                    "px-2.5 h-6 text-[11px] font-semibold rounded transition-colors",
                    qtyFilter === val
                      ? "bg-white text-primary shadow-sm border border-edge"
                      : "text-muted hover:text-primary"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => { setItems([]); setFileName(null); setSearch(""); setQtyFilter("all"); }}
              className="flex items-center gap-1 text-[11px] text-muted hover:text-red-500 transition-colors ml-auto"
            >
              <X size={11} />
              Reset
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 max-w-lg">
            {[
              { label: "Total Missing", val: summary.total, variant: "neutral" },
              { label: "Zero Stock", val: summary.zero, variant: "red" },
              { label: "Has Stock", val: summary.hasStock, variant: "green" },
            ].map(({ label, val, variant }) => (
              <div
                key={label}
                className={cn(
                  "border rounded-lg px-4 py-3 text-center",
                  variant === "red"
                    ? "border-red-200 bg-red-50/50"
                    : variant === "green"
                      ? "border-green-200 bg-green-50/50"
                      : "border-edge bg-surface"
                )}
              >
                <p className="text-[11px] text-muted font-mono uppercase tracking-wide">{label}</p>
                <p
                  className={cn(
                    "text-2xl font-bold font-mono mt-0.5",
                    variant === "red" ? "text-red-600" : variant === "green" ? "text-green-700" : "text-primary"
                  )}
                >
                  {val}
                </p>
              </div>
            ))}
          </div>

          <div className="bg-surface border border-edge rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="bg-panel border-b border-edge">
                    <th className="px-3 py-2 text-left font-semibold text-muted font-mono w-8">#</th>
                    {COLS.map((c) => (
                      <th
                        key={c.key}
                        onClick={() => handleSort(c.key)}
                        className={cn(
                          "px-3 py-2 font-semibold text-muted font-mono cursor-pointer hover:text-primary select-none whitespace-nowrap",
                          c.align === "right" ? "text-right" : "text-left"
                        )}
                      >
                        {c.label}
                        <SortIcon col={c.key} />
                      </th>
                    ))}
                    <th className="px-3 py-2 text-left font-semibold text-muted font-mono whitespace-nowrap">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 500).map((item, i) => (
                    <tr
                      key={i}
                      className={cn(
                        "border-b border-edge/50 hover:bg-surface-hover transition-colors",
                        item.qty === 0 ? "bg-red-50/30" : item.qty < 5 ? "bg-amber-50/20" : ""
                      )}
                    >
                      <td className="px-3 py-1.5 text-muted font-mono">{i + 1}</td>
                      <td className="px-3 py-1.5 font-mono text-muted whitespace-nowrap">
                        {item.date || "—"}
                      </td>
                      <td className="px-3 py-1.5 text-primary max-w-[240px]">
                        <span className="block truncate">{item.productName || "—"}</span>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-muted whitespace-nowrap">
                        {item.asin || "—"}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-primary whitespace-nowrap">
                        {item.sku || "—"}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-muted whitespace-nowrap">
                        {item.gtin || "—"}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-1.5 font-mono font-semibold text-right whitespace-nowrap",
                          item.qty === 0
                            ? "text-red-600"
                            : item.qty < 5
                              ? "text-amber-600"
                              : "text-primary"
                        )}
                      >
                        {item.qty}
                      </td>
                      <td className="px-3 py-1.5">
                        <a
                          href={
                            item.asin
                              ? `https://sellercentral.amazon.com/inventory?searchField=ASIN&searchValue=${item.asin}`
                              : "https://sellercentral.amazon.com/inventory"
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[10px] text-accent hover:underline font-semibold"
                        >
                          Add Offer
                          <ExternalLink size={9} />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > 500 && (
              <div className="px-4 py-2 border-t border-edge bg-panel text-[11px] text-muted font-mono">
                Showing 500 of {filtered.length.toLocaleString("en-US")} rows
              </div>
            )}
            {filtered.length === 0 && (
              <div className="text-center py-8 text-sm text-muted">No items match your filters</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── Log Matcher Tab ───────────────────────────────────────────────────────────

interface LogItem {
  code: string;
  description: string;
  purchasePrice: string;
  salesPrice: string;
  status: string;
  countryOfOrigin: string;
}

interface MatchResult {
  sku: string;
  matched: boolean;
  item?: LogItem;
}

type LMSortCol = "sku" | "description" | "purchasePrice" | "salesPrice" | "status" | "countryOfOrigin";
type ViewFilter = "all" | "matched" | "notfound";

function buildLogMap(rows: Record<string, unknown>[]): Map<string, LogItem> {
  const map = new Map<string, LogItem>();
  for (const row of rows) {
    const code = findField(row, [
      "Code", "code", "SKU", "sku", "ItemCode", "item_code", "Item Code", "seller-sku",
    ]);
    if (!code) continue;
    map.set(code.trim().toLowerCase(), {
      code,
      description: findField(row, ["Description", "description", "Name", "name", "Title", "title"]),
      purchasePrice: findField(row, [
        "Purchase Price", "PurchasePrice", "purchase_price", "Cost", "cost", "Cost Price",
      ]),
      salesPrice: findField(row, [
        "Sales Price", "SalesPrice", "sale_price", "Price", "price", "Retail Price",
      ]),
      status: findField(row, ["Status", "status", "Active", "active", "Item Status"]),
      countryOfOrigin: findField(row, [
        "Country of Origin", "country_of_origin", "Country", "country", "Origin",
      ]),
    });
  }
  return map;
}

function parseSkuInput(raw: string): string[] {
  const lines = raw.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  return [...new Set(lines)];
}

function LogMatcherTab() {
  const [logFile, setLogFile] = useState<File | null>(null);
  const [logRows, setLogRows] = useState<Record<string, unknown>[]>([]);
  const [logError, setLogError] = useState<string | null>(null);
  const [skuInput, setSkuInput] = useState("");
  const [results, setResults] = useState<MatchResult[]>([]);
  const [hasRun, setHasRun] = useState(false);
  const [sortCol, setSortCol] = useState<LMSortCol>("sku");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [viewFilter, setViewFilter] = useState<ViewFilter>("all");

  const onDropLog = useCallback(async (accepted: File[]) => {
    const file = accepted[0];
    if (!file) return;
    setLogError(null);
    setLogFile(file);
    setResults([]);
    setHasRun(false);
    try {
      const buf = await file.arrayBuffer();
      const rows = await parseFileBuffer(buf);
      setLogRows(rows);
    } catch (err) {
      setLogError(`Failed to parse file: ${err instanceof Error ? err.message : String(err)}`);
      setLogFile(null);
      setLogRows([]);
    }
  }, []);

  const { getRootProps: getLogProps, getInputProps: getLogInput, isDragActive: isLogDrag } =
    useDropzone({
      onDrop: onDropLog,
      accept: {
        "text/csv": [".csv"],
        "text/tab-separated-values": [".tsv"],
        "text/plain": [".txt"],
      },
      multiple: false,
    });

  const onSkuFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setSkuInput(String(ev.target?.result ?? ""));
    reader.readAsText(file);
    e.target.value = "";
  }, []);

  const skuList = useMemo(() => parseSkuInput(skuInput), [skuInput]);

  const runMatching = useCallback(() => {
    if (logRows.length === 0 || skuList.length === 0) return;
    const map = buildLogMap(logRows);
    const res: MatchResult[] = skuList.map((sku) => {
      const item = map.get(sku.trim().toLowerCase());
      return { sku, matched: !!item, item };
    });
    setResults(res);
    setHasRun(true);
  }, [logRows, skuList]);

  const summary = useMemo(() => ({
    total: results.length,
    matched: results.filter((r) => r.matched).length,
    notFound: results.filter((r) => !r.matched).length,
  }), [results]);

  const getItemVal = (r: MatchResult, col: LMSortCol): string => {
    if (col === "sku") return r.sku;
    return String(r.item?.[col as keyof LogItem] ?? "");
  };

  const filtered = useMemo(() => {
    let data = results;
    if (viewFilter === "matched") data = data.filter((r) => r.matched);
    else if (viewFilter === "notfound") data = data.filter((r) => !r.matched);
    return [...data].sort((a, b) => {
      const cmp = getItemVal(a, sortCol).localeCompare(getItemVal(b, sortCol));
      return sortDir === "asc" ? cmp : -cmp;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, viewFilter, sortCol, sortDir]);

  const handleSort = (col: LMSortCol) => {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  };

  const handleExportExcel = useCallback(async () => {
    const headers = [
      "SKU", "Description", "Purchase Price", "Sales Price",
      "Status", "Country of Origin", "Match Status",
    ];
    const rows = filtered.map((r) => [
      r.sku,
      r.item?.description ?? "",
      r.item?.purchasePrice ?? "",
      r.item?.salesPrice ?? "",
      r.item?.status ?? "",
      r.item?.countryOfOrigin ?? "",
      r.matched ? "Matched" : "Not Found",
    ]);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    await exportToExcel(headers, rows, `LogMatched_${date}`);
  }, [filtered]);

  const handleExportCsv = useCallback(() => {
    const headers = [
      "SKU", "Description", "Purchase Price", "Sales Price",
      "Status", "Country of Origin", "Match Status",
    ];
    const rows = filtered.map((r) => [
      r.sku,
      r.item?.description ?? "",
      r.item?.purchasePrice ?? "",
      r.item?.salesPrice ?? "",
      r.item?.status ?? "",
      r.item?.countryOfOrigin ?? "",
      r.matched ? "Matched" : "Not Found",
    ]);
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    exportToCsv(headers, rows, `LogMatched_${date}`);
  }, [filtered]);

  function SortIcon({ col }: { col: LMSortCol }) {
    if (sortCol !== col) return <ChevronsUpDown size={10} className="text-muted/40 ml-1 inline" />;
    return sortDir === "asc"
      ? <ChevronUp size={10} className="text-accent ml-1 inline" />
      : <ChevronDown size={10} className="text-accent ml-1 inline" />;
  }

  const COLS: { key: LMSortCol; label: string }[] = [
    { key: "sku", label: "SKU / Code" },
    { key: "description", label: "Description" },
    { key: "purchasePrice", label: "Purchase Price" },
    { key: "salesPrice", label: "Sales Price" },
    { key: "status", label: "Status" },
    { key: "countryOfOrigin", label: "Country of Origin" },
  ];

  const canRun = logRows.length > 0 && skuList.length > 0;

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Step 1: Upload log file */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent text-white text-[10px] font-bold shrink-0">
              1
            </span>
            <span className="text-xs font-semibold text-primary">Upload Log File</span>
          </div>
          <div
            {...getLogProps()}
            className={cn(
              "border-2 border-dashed rounded-lg p-6 cursor-pointer transition-all duration-200 text-center select-none",
              isLogDrag
                ? "border-accent bg-blue-50"
                : logFile
                  ? "border-emerald-300 bg-emerald-50"
                  : "border-edge hover:border-accent/40 bg-surface"
            )}
          >
            <input {...getLogInput()} />
            {logFile ? (
              <>
                <CheckCircle2 size={20} className="mx-auto mb-2 text-emerald-600" />
                <p className="text-xs font-medium text-emerald-700 truncate">{logFile.name}</p>
                <p className="text-[11px] text-muted font-mono mt-1">
                  {logRows.length.toLocaleString("en-US")} rows loaded
                </p>
              </>
            ) : (
              <>
                <Upload
                  size={20}
                  className={cn("mx-auto mb-2", isLogDrag ? "text-accent" : "text-muted")}
                />
                <p className="text-xs font-medium text-primary">
                  {isLogDrag ? "Drop file here" : "Drag & drop CSV/TSV, or click to browse"}
                </p>
                <p className="text-[11px] text-muted font-mono mt-1">.csv · .tsv · UTF-16 supported</p>
              </>
            )}
          </div>
          {logError && (
            <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              {logError}
            </div>
          )}
        </div>

        {/* Step 2: SKU input */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-accent text-white text-[10px] font-bold shrink-0">
                2
              </span>
              <span className="text-xs font-semibold text-primary">Input SKU List</span>
            </div>
            <label className="text-[11px] text-accent hover:underline cursor-pointer font-semibold">
              Upload file
              <input type="file" accept=".txt,.csv" onChange={onSkuFileChange} className="hidden" />
            </label>
          </div>
          <textarea
            value={skuInput}
            onChange={(e) => setSkuInput(e.target.value)}
            placeholder={"Paste SKUs here, one per line...\n\nAFSHU-001\nAFCHU-002\nBB-CHAIR-03"}
            className="w-full h-[140px] px-3 py-2 text-xs font-mono bg-white border border-edge rounded-lg focus:outline-none focus:ring-2 focus:ring-accent/30 resize-none"
          />
          {skuList.length > 0 && (
            <p className="text-[11px] text-muted font-mono">
              {skuList.length} unique SKU{skuList.length !== 1 ? "s" : ""} detected
            </p>
          )}
        </div>
      </div>

      {/* Run button */}
      <div className="flex items-center gap-3">
        <Button variant="accent" size="sm" onClick={runMatching} disabled={!canRun}>
          Run Matching
        </Button>
        {!canRun && (
          <span className="text-[11px] text-muted">
            {logRows.length === 0 ? "Upload a log file first" : "Add SKUs to match"}
          </span>
        )}
      </div>

      {/* Results */}
      {hasRun && (
        <>
          <div className="grid grid-cols-3 gap-3 max-w-lg">
            {[
              { label: "Total Input", val: summary.total, variant: "neutral" },
              { label: "Matched", val: summary.matched, variant: "green" },
              { label: "Not Found", val: summary.notFound, variant: "red" },
            ].map(({ label, val, variant }) => (
              <div
                key={label}
                className={cn(
                  "border rounded-lg px-4 py-3 text-center",
                  variant === "green"
                    ? "border-green-200 bg-green-50/50"
                    : variant === "red"
                      ? "border-red-200 bg-red-50/50"
                      : "border-edge bg-surface"
                )}
              >
                <p className="text-[11px] text-muted font-mono uppercase tracking-wide">{label}</p>
                <p
                  className={cn(
                    "text-2xl font-bold font-mono mt-0.5",
                    variant === "green" ? "text-green-700" : variant === "red" ? "text-red-600" : "text-primary"
                  )}
                >
                  {val}
                </p>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1 bg-panel border border-edge rounded-md p-0.5">
              {(
                [
                  ["all", "All"],
                  ["matched", "Matched"],
                  ["notfound", "Not Found"],
                ] as [ViewFilter, string][]
              ).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setViewFilter(val)}
                  className={cn(
                    "px-2.5 h-6 text-[11px] font-semibold rounded transition-colors",
                    viewFilter === val
                      ? "bg-white text-primary shadow-sm border border-edge"
                      : "text-muted hover:text-primary"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <Button variant="default" size="sm" onClick={handleExportExcel}>
              <Download size={12} className="mr-1.5" />
              Export Excel
            </Button>
            <Button variant="ghost" size="sm" onClick={handleExportCsv}>
              <Download size={12} className="mr-1.5" />
              Export CSV
            </Button>
          </div>

          <div className="bg-surface border border-edge rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="bg-panel border-b border-edge">
                    <th className="px-3 py-2 text-left font-semibold text-muted font-mono w-8">#</th>
                    {COLS.map((c) => (
                      <th
                        key={c.key}
                        onClick={() => handleSort(c.key)}
                        className="px-3 py-2 text-left font-semibold text-muted font-mono cursor-pointer hover:text-primary select-none whitespace-nowrap"
                      >
                        {c.label}
                        <SortIcon col={c.key} />
                      </th>
                    ))}
                    <th className="px-3 py-2 text-left font-semibold text-muted font-mono whitespace-nowrap">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 2000).map((r, i) => (
                    <tr
                      key={i}
                      className={cn(
                        "border-b border-edge/50 hover:bg-surface-hover transition-colors",
                        !r.matched && "bg-red-50/30"
                      )}
                    >
                      <td className="px-3 py-1.5 text-muted font-mono">{i + 1}</td>
                      <td className="px-3 py-1.5 font-mono text-primary whitespace-nowrap">{r.sku}</td>
                      <td className="px-3 py-1.5 text-primary max-w-[200px]">
                        <span className="block truncate">{r.item?.description || "—"}</span>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-muted whitespace-nowrap">
                        {r.item?.purchasePrice || "—"}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-muted whitespace-nowrap">
                        {r.item?.salesPrice || "—"}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-muted whitespace-nowrap">
                        {r.item?.status || "—"}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-muted whitespace-nowrap">
                        {r.item?.countryOfOrigin || "—"}
                      </td>
                      <td className="px-3 py-1.5">
                        <span
                          className={cn(
                            "inline-block px-2 py-0.5 rounded text-[10px] font-semibold",
                            r.matched ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                          )}
                        >
                          {r.matched ? "Matched" : "Not Found"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > 2000 && (
              <div className="px-4 py-2 border-t border-edge bg-panel text-[11px] text-muted font-mono">
                Showing 2,000 of {filtered.length.toLocaleString("en-US")} rows
              </div>
            )}
            {filtered.length === 0 && (
              <div className="text-center py-8 text-sm text-muted">No results</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
