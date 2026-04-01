"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { parseFileBuffer } from "@/lib/parsers";
import {
  ArrowUp, ArrowDown, ArrowUpDown, ChevronLeft, ChevronRight,
  Search, X, ChevronDown, ChevronRight as ChevronRightIcon,
  Truck, TrendingUp, Users, ShoppingCart, BarChart2, Clock,
  Tag, AlertCircle, Loader2, Upload, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface POLineItem {
  item: string;
  quantity: number | null;
  unitPrice: number | null;
  vatCode: string;
}

interface PORecord {
  orderNumber: string;
  supplier: string;
  currency: string;
  orderDate: string | null;
  receiptDate: string | null;
  discount: string;
  items: POLineItem[];
}

interface PriceRecord {
  itemCode: string;
  supplierName: string;
  supplierCode: string;
  currency: string;
  purchasePrice: number | null;
  activeFrom: string | null;
  activeTo: string | null;
  purchaseLeadTime: number | null;
  minimumQuantity: number | null;
  unitDescription: string;
  dropShipment: string;
  mainSupplier: string;
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseNum(s: string | undefined): number | null {
  if (!s || s.trim() === "") return null;
  const n = parseFloat(s.trim().replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

function parsePOData(raw: Record<string, unknown>[]): PORecord[] {
  const poMap = new Map<string, PORecord>();
  for (const row of raw) {
    const header = String(row["Header"] ?? "").trim();
    const orderNumber = String(row["Order number"] ?? "").trim();
    const supplier = String(row["Supplier nameDescription"] ?? "").trim();
    const currency = String(row["Currency"] ?? "").trim();
    const orderDate = String(row["Order date"] ?? "").trim() || null;
    const receiptDate = String(row["Receipt date"] ?? "").trim() || null;
    const discount = String(row["Discount"] ?? "").trim();

    if (header === "H") {
      if (!poMap.has(orderNumber)) {
        poMap.set(orderNumber, { orderNumber, supplier, currency, orderDate, receiptDate, discount, items: [] });
      }
    } else {
      const item = String(row["Item"] ?? "").trim();
      if (!item || !orderNumber) continue;
      const lineItem: POLineItem = {
        item,
        quantity: parseNum(String(row["Quantity"] ?? "")),
        unitPrice: parseNum(String(row["Unit price"] ?? "")),
        vatCode: String(row["VAT code"] ?? "").trim(),
      };
      const po = poMap.get(orderNumber);
      if (po) {
        po.items.push(lineItem);
      } else {
        poMap.set(orderNumber, { orderNumber, supplier, currency, orderDate, receiptDate, discount, items: [lineItem] });
      }
    }
  }
  return Array.from(poMap.values());
}

function parsePriceData(raw: Record<string, unknown>[]): PriceRecord[] {
  const records: PriceRecord[] = [];
  for (const row of raw) {
    const header = String(row["Header"] ?? "").trim();
    if (header === "H") continue;
    const itemCode = String(row["Item code"] ?? "").trim();
    const purchasePriceRaw = String(row["Purchase price"] ?? "").trim();
    if (!itemCode || !purchasePriceRaw) continue;
    records.push({
      itemCode,
      supplierName: String(row["Supplier name"] ?? "").trim(),
      supplierCode: String(row["Supplier code"] ?? "").trim(),
      currency: String(row["Currency"] ?? "").trim(),
      purchasePrice: parseNum(purchasePriceRaw),
      activeFrom: String(row["Active from"] ?? "").trim() || null,
      activeTo: String(row["Active to"] ?? "").trim() || null,
      purchaseLeadTime: parseNum(String(row["Purchase lead time"] ?? "")),
      minimumQuantity: parseNum(String(row["Minimum quantity"] ?? "")),
      unitDescription: String(row["Unit description"] ?? "").trim(),
      dropShipment: String(row["Drop shipment"] ?? "").trim(),
      mainSupplier: String(row["Main supplier"] ?? "").trim(),
    });
  }
  return records;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDate(s: string | null): Date | null {
  if (!s) return null;
  const parts = s.split("-");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
  const dt = new Date(`${y}-${m}-${d}`);
  return isNaN(dt.getTime()) ? null : dt;
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  const parts = s.split("-");
  if (parts.length !== 3) return s;
  return `${parts[0]}/${parts[1]}/${parts[2]}`;
}

function fmtPrice(n: number | null): string {
  if (n === null) return "—";
  const abs = Math.abs(n).toFixed(2);
  const [intPart, dec] = abs.split(".");
  const fmt = intPart!.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${n < 0 ? "-" : ""}${fmt},${dec}`;
}

const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);

function getStatus(receiptDate: string | null): "Received" | "Pending" {
  const d = parseDate(receiptDate);
  if (!d) return "Pending";
  return d <= TODAY ? "Received" : "Pending";
}

function leadTimeDays(orderDate: string | null, receiptDate: string | null): number | null {
  const a = parseDate(orderDate);
  const b = parseDate(receiptDate);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

const CHART_COLORS = [
  "#2563eb", "#16a34a", "#dc2626", "#d97706", "#7c3aed",
  "#0891b2", "#be185d", "#65a30d", "#ea580c", "#0369a1",
];

// ── Shared UI ─────────────────────────────────────────────────────────────────

function SortIcon({ col, sortCol, sortDir }: { col: string; sortCol: string | null; sortDir: "asc" | "desc" }) {
  if (sortCol === col)
    return sortDir === "asc"
      ? <ArrowUp size={10} className="text-amber-600 shrink-0" />
      : <ArrowDown size={10} className="text-amber-600 shrink-0" />;
  return <ArrowUpDown size={10} className="opacity-0 group-hover:opacity-30 shrink-0" />;
}

function ThCell({ label, colKey, sortCol, sortDir, onSort }: {
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

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={cn("h-7 px-2.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer",
        active ? "bg-accent/10 text-accent border border-accent/30" : "text-muted hover:text-primary hover:bg-surface-hover border border-transparent")}>
      {label}
    </button>
  );
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ElementType }) {
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

function PaginationBar({ total, page, rowsPerPage, onPage, onRowsPerPage }: {
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

function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
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

function SelectFilter({ label, value, options, onChange }: {
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

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      <AlertCircle size={32} className="text-muted/30" />
      <p className="text-sm text-muted font-mono">{message}</p>
    </div>
  );
}

function ItemDropdown({ value, options, onChange }: {
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

// ── File Upload Card ──────────────────────────────────────────────────────────

type FileSlotState = "idle" | "loading" | "done" | "error";

function FileUploadCard({ title, hint, state, fileName, fileSize, error, onFile, onClear }: {
  title: string; hint: string;
  state: FileSlotState; fileName?: string; fileSize?: number; error?: string;
  onFile: (f: File) => void; onClear: () => void;
}) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (files) => { if (files[0]) onFile(files[0]); },
    accept: { "text/csv": [".csv"], "text/plain": [".txt"], "application/vnd.ms-excel": [".csv"] },
    multiple: false,
  });

  if (state === "loading") {
    return (
      <div className="flex-1 rounded-xl border border-edge bg-white p-4 flex items-center justify-center gap-2 min-h-[160px]">
        <Loader2 size={18} className="text-accent animate-spin" />
        <span className="text-[12px] text-muted font-mono">Parsing…</span>
      </div>
    );
  }

  if (state === "done" && fileName) {
    return (
      <div className="flex-1 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 flex flex-col gap-3">
        <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">{title}</p>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-emerald-200">
          <CheckCircle2 size={14} className="text-emerald-600 shrink-0" />
          <span className="text-[12px] text-emerald-700 font-mono truncate flex-1">{fileName}</span>
          {fileSize !== undefined && (
            <span className="text-[11px] text-emerald-600/70 font-mono shrink-0">{(fileSize / 1024).toFixed(0)} KB</span>
          )}
          <button onClick={onClear} className="text-emerald-600 hover:text-red-500 transition-colors shrink-0">
            <X size={13} />
          </button>
        </div>
        <div {...getRootProps()} className="cursor-pointer">
          <input {...getInputProps()} />
          <button className="flex items-center gap-1.5 text-[11px] text-muted hover:text-accent transition-colors cursor-pointer">
            <Upload size={11} /> Replace file
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 rounded-xl border border-edge bg-white p-4 flex flex-col gap-3">
      <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">{title}</p>
      {state === "error" && error && (
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded bg-red-50 border border-red-200 text-[11px] text-red-600 font-mono">
          <AlertCircle size={11} /> {error}
        </div>
      )}
      <div {...getRootProps()}
        className={cn("flex flex-col items-center justify-center py-8 rounded-xl border-2 border-dashed cursor-pointer transition-all",
          isDragActive ? "border-accent bg-accent/5 animate-drop" : "border-edge hover:border-accent/40 hover:bg-surface-hover")}>
        <input {...getInputProps()} />
        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors",
          isDragActive ? "bg-accent/10" : "bg-surface border border-edge")}>
          <Upload size={20} className={isDragActive ? "text-accent" : "text-muted/60"} />
        </div>
        <p className="text-[12px] font-semibold text-primary mb-0.5">
          {isDragActive ? "Drop the file" : "Upload CSV"}
        </p>
        <p className="text-[11px] text-muted text-center max-w-[200px]">{hint}</p>
        <p className="text-[10px] text-muted/50 mt-2 font-mono">.csv · UTF-16 LE · tab-separated</p>
      </div>
    </div>
  );
}

// ── Feature 1: PO Tracker ─────────────────────────────────────────────────────

type POCol = "orderNumber" | "supplier" | "orderDate" | "receiptDate" | "leadTime" | "qtyItems" | "currency" | "status";

interface PORow {
  orderNumber: string; supplier: string; currency: string;
  orderDate: string | null; receiptDate: string | null;
  leadTime: number | null; qtyItems: number;
  status: "Received" | "Pending"; items: POLineItem[];
}

function buildPORows(data: PORecord[]): PORow[] {
  return data.map((po) => ({
    orderNumber: po.orderNumber, supplier: po.supplier, currency: po.currency,
    orderDate: po.orderDate, receiptDate: po.receiptDate,
    leadTime: leadTimeDays(po.orderDate, po.receiptDate),
    qtyItems: po.items.length, status: getStatus(po.receiptDate), items: po.items,
  }));
}

function StatusBadge({ status }: { status: "Received" | "Pending" }) {
  return status === "Received"
    ? <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium rounded bg-emerald-50 text-emerald-700 border border-emerald-200">Received</span>
    : <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium rounded bg-amber-50 text-amber-700 border border-amber-200">Pending</span>;
}

function POTrackerTab({ poData }: { poData: PORecord[] }) {
  const [searchRaw, setSearchRaw] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [sortCol, setSortCol] = useState<POCol | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => { const id = setTimeout(() => setSearch(searchRaw), 300); return () => clearTimeout(id); }, [searchRaw]);

  const rows = useMemo(() => buildPORows(poData), [poData]);
  const years = useMemo(() => Array.from(new Set(rows.map((r) => r.orderDate?.split("-")[2]).filter(Boolean) as string[])).sort().reverse(), [rows]);
  const currencies = useMemo(() => Array.from(new Set(rows.map((r) => r.currency).filter(Boolean))).sort(), [rows]);

  const filtered = useMemo(() => {
    let d = rows;
    if (statusFilter !== "all") d = d.filter((r) => r.status === statusFilter);
    if (currencyFilter !== "all") d = d.filter((r) => r.currency === currencyFilter);
    if (yearFilter !== "all") d = d.filter((r) => r.orderDate?.split("-")[2] === yearFilter);
    if (search) {
      const q = search.toLowerCase();
      d = d.filter((r) => r.supplier.toLowerCase().includes(q) || r.orderNumber.toLowerCase().includes(q) || r.items.some((it) => it.item.toLowerCase().includes(q)));
    }
    return d;
  }, [rows, statusFilter, currencyFilter, yearFilter, search]);

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortCol] ?? ""; const bv = b[sortCol] ?? "";
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sortCol, sortDir]);

  const paged = useMemo(() => sorted.slice((page - 1) * rowsPerPage, page * rowsPerPage), [sorted, page, rowsPerPage]);

  function toggleSort(col: POCol) {
    if (sortCol === col) { if (sortDir === "asc") setSortDir("desc"); else { setSortCol(null); setSortDir("asc"); } }
    else { setSortCol(col); setSortDir("asc"); }
  }

  function toggleExpand(key: string) {
    setExpanded((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  const totalPO = rows.length;
  const pending = rows.filter((r) => r.status === "Pending").length;
  const received = rows.filter((r) => r.status === "Received").length;
  const uniqueSuppliers = new Set(rows.map((r) => r.supplier)).size;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 px-4 py-2 border-b border-edge bg-panel flex items-center gap-2 flex-wrap">
        <MetricCard label="Total PO" value={totalPO} icon={ShoppingCart} />
        <MetricCard label="Pending" value={pending} icon={Clock} />
        <MetricCard label="Received" value={received} icon={Truck} />
        <MetricCard label="Unique Suppliers" value={uniqueSuppliers} icon={Users} />
      </div>

      <div className="shrink-0 px-4 py-2 border-b border-edge bg-surface flex items-center gap-3 flex-wrap">
        <SearchInput value={searchRaw} onChange={setSearchRaw} placeholder="Search supplier, PO, item…" />
        <div className="w-px h-5 bg-edge shrink-0" />
        <SelectFilter label="Status" value={statusFilter}
          options={[{ value: "all", label: "All" }, { value: "Pending", label: "Pending" }, { value: "Received", label: "Received" }]}
          onChange={(v) => { setStatusFilter(v); setPage(1); }} />
        <div className="w-px h-5 bg-edge shrink-0" />
        <SelectFilter label="Currency" value={currencyFilter}
          options={[{ value: "all", label: "All" }, ...currencies.map((c) => ({ value: c, label: c }))]}
          onChange={(v) => { setCurrencyFilter(v); setPage(1); }} />
        <div className="w-px h-5 bg-edge shrink-0" />
        <SelectFilter label="Year" value={yearFilter}
          options={[{ value: "all", label: "All" }, ...years.map((y) => ({ value: y, label: y }))]}
          onChange={(v) => { setYearFilter(v); setPage(1); }} />
        {(statusFilter !== "all" || currencyFilter !== "all" || yearFilter !== "all" || search) && (
          <button onClick={() => { setStatusFilter("all"); setCurrencyFilter("all"); setYearFilter("all"); setSearchRaw(""); setSearch(""); setPage(1); }}
            className="flex items-center gap-1 text-[11px] text-muted hover:text-red-500 ml-auto transition-colors cursor-pointer">
            <X size={11} />Clear
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full border-collapse" style={{ tableLayout: "fixed", minWidth: 820 }}>
          <colgroup>
            <col style={{ width: "30px" }} />
            <col style={{ width: "8%" }} /><col style={{ width: "22%" }} /><col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} /><col style={{ width: "9%" }} /><col style={{ width: "7%" }} />
            <col style={{ width: "8%" }} /><col style={{ width: "11%" }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-edge">
              <th className="px-3 py-2" />
              <ThCell label="No. PO" colKey="orderNumber" sortCol={sortCol} sortDir={sortDir} onSort={(k) => toggleSort(k as POCol)} />
              <ThCell label="Supplier" colKey="supplier" sortCol={sortCol} sortDir={sortDir} onSort={(k) => toggleSort(k as POCol)} />
              <ThCell label="Tgl Order" colKey="orderDate" sortCol={sortCol} sortDir={sortDir} onSort={(k) => toggleSort(k as POCol)} />
              <ThCell label="Tgl Estimasi" colKey="receiptDate" sortCol={sortCol} sortDir={sortDir} onSort={(k) => toggleSort(k as POCol)} />
              <ThCell label="Lead Time" colKey="leadTime" sortCol={sortCol} sortDir={sortDir} onSort={(k) => toggleSort(k as POCol)} />
              <ThCell label="Items" colKey="qtyItems" sortCol={sortCol} sortDir={sortDir} onSort={(k) => toggleSort(k as POCol)} />
              <ThCell label="Mata Uang" colKey="currency" sortCol={sortCol} sortDir={sortDir} onSort={(k) => toggleSort(k as POCol)} />
              <ThCell label="Status" colKey="status" sortCol={sortCol} sortDir={sortDir} onSort={(k) => toggleSort(k as POCol)} />
            </tr>
          </thead>
          <tbody>
            {paged.length === 0
              ? <tr><td colSpan={9} className="text-center py-16 text-muted text-sm">No rows match the current filters.</td></tr>
              : paged.flatMap((row) => {
                const isExp = expanded.has(row.orderNumber);
                return [
                  <tr key={row.orderNumber} onClick={() => toggleExpand(row.orderNumber)}
                    className="border-b border-edge/50 transition-colors hover:bg-surface-hover cursor-pointer">
                    <td className="px-3 py-2 text-center">
                      {isExp ? <ChevronDown size={13} className="text-muted" /> : <ChevronRightIcon size={13} className="text-muted" />}
                    </td>
                    <td className="px-3 py-2 text-[12px] font-mono text-muted/80 truncate">{row.orderNumber}</td>
                    <td className="px-3 py-2 text-[12px] truncate" title={row.supplier}>{row.supplier}</td>
                    <td className="px-3 py-2 text-[12px] font-mono">{fmtDate(row.orderDate)}</td>
                    <td className="px-3 py-2 text-[12px] font-mono">{fmtDate(row.receiptDate)}</td>
                    <td className="px-3 py-2 text-[12px] font-mono">{row.leadTime !== null ? `${row.leadTime}d` : "—"}</td>
                    <td className="px-3 py-2 text-[12px] font-mono">{row.qtyItems}</td>
                    <td className="px-3 py-2 text-[12px]">
                      <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium rounded bg-slate-100 border border-slate-200 text-primary">{row.currency}</span>
                    </td>
                    <td className="px-3 py-2"><StatusBadge status={row.status} /></td>
                  </tr>,
                  ...(isExp && row.items.length > 0 ? [
                    <tr key={`${row.orderNumber}-items`} className="border-b border-edge/50 bg-panel">
                      <td />
                      <td colSpan={8} className="px-3 py-2">
                        <div className="flex items-center gap-1 flex-wrap">
                          {row.items.map((it) => (
                            <span key={it.item} className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono rounded bg-white border border-edge text-primary">
                              <Tag size={9} className="text-accent" />{it.item}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>,
                  ] : []),
                ];
              })}
          </tbody>
        </table>
      </div>

      <PaginationBar total={sorted.length} page={page} rowsPerPage={rowsPerPage} onPage={setPage} onRowsPerPage={setRowsPerPage} />
    </div>
  );
}

// ── Feature 2: Supplier Performance ──────────────────────────────────────────

interface SupplierRow {
  supplier: string; totalPO: number; totalItems: number;
  avgLeadTime: number | null; lastOrder: string | null;
  currency: string; priceRecords: number;
}

type SupplierCol = keyof SupplierRow;

function buildSupplierRows(poData: PORecord[], priceData: PriceRecord[]): SupplierRow[] {
  const map = new Map<string, { pos: Set<string>; items: number; leadTimes: number[]; lastOrder: string | null; currencies: Set<string> }>();
  for (const po of poData) {
    if (!map.has(po.supplier)) map.set(po.supplier, { pos: new Set(), items: 0, leadTimes: [], lastOrder: null, currencies: new Set() });
    const s = map.get(po.supplier)!;
    s.pos.add(po.orderNumber);
    s.items += po.items.length;
    const lt = leadTimeDays(po.orderDate, po.receiptDate);
    if (lt !== null && lt >= 0) s.leadTimes.push(lt);
    if (po.orderDate && (!s.lastOrder || po.orderDate > s.lastOrder)) s.lastOrder = po.orderDate;
    if (po.currency) s.currencies.add(po.currency);
  }
  const priceCountMap = new Map<string, number>();
  for (const p of priceData) priceCountMap.set(p.supplierName, (priceCountMap.get(p.supplierName) ?? 0) + 1);
  return Array.from(map.entries()).map(([supplier, s]) => ({
    supplier, totalPO: s.pos.size, totalItems: s.items,
    avgLeadTime: s.leadTimes.length > 0 ? Math.round(s.leadTimes.reduce((a, b) => a + b, 0) / s.leadTimes.length) : null,
    lastOrder: s.lastOrder, currency: Array.from(s.currencies).join(", "),
    priceRecords: priceCountMap.get(supplier) ?? 0,
  }));
}

function SupplierBarChart({ rows }: { rows: SupplierRow[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<import("chart.js").Chart | null>(null);
  const top15 = useMemo(() => [...rows].sort((a, b) => b.totalPO - a.totalPO).slice(0, 15), [rows]);

  useEffect(() => {
    if (!canvasRef.current) return;
    let cancelled = false;
    import("chart.js").then(({ Chart, CategoryScale, LinearScale, BarElement, BarController, Tooltip }) => {
      if (cancelled) return;
      Chart.register(CategoryScale, LinearScale, BarElement, BarController, Tooltip);
      chartRef.current?.destroy();
      chartRef.current = new Chart(canvasRef.current!, {
        type: "bar",
        data: {
          labels: top15.map((r) => r.supplier),
          datasets: [{ data: top15.map((r) => r.totalPO), backgroundColor: "#2563eb", borderRadius: 4 }],
        },
        options: {
          indexAxis: "y", responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw} PO` } } },
          scales: {
            x: { grid: { color: "#e2e8f0" }, ticks: { font: { size: 11, family: "monospace" }, color: "#64748b" } },
            y: { grid: { display: false }, ticks: { font: { size: 11 }, color: "#0f172a" } },
          },
        },
      });
    });
    return () => { cancelled = true; chartRef.current?.destroy(); chartRef.current = null; };
  }, [top15]);

  return (
    <div className="shrink-0 border-b border-edge bg-panel px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Top 15 Suppliers by Total PO</p>
      <div style={{ height: Math.max(180, top15.length * 28) }}>
        <canvas ref={canvasRef} />
      </div>
      <div className="flex items-center gap-3 flex-wrap mt-2">
        {top15.slice(0, 6).map((r, i) => (
          <div key={r.supplier} className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="text-[11px] text-primary">{r.supplier}</span>
            <span className="text-[10px] font-mono text-muted">({r.totalPO} PO)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SupplierPerformanceTab({ poData, priceData }: { poData: PORecord[]; priceData: PriceRecord[] }) {
  const [sortCol, setSortCol] = useState<SupplierCol>("totalPO");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");

  const rows = useMemo(() => buildSupplierRows(poData, priceData), [poData, priceData]);
  const allCurrencies = useMemo(() => Array.from(new Set(poData.map((p) => p.currency).filter(Boolean))).sort(), [poData]);
  const allYears = useMemo(() => Array.from(new Set(poData.map((p) => p.orderDate?.split("-")[2]).filter(Boolean) as string[])).sort().reverse(), [poData]);

  const filtered = useMemo(() => {
    if (currencyFilter === "all" && yearFilter === "all") return rows;
    const matching = new Set(poData.filter((po) =>
      (currencyFilter === "all" || po.currency === currencyFilter) &&
      (yearFilter === "all" || po.orderDate?.split("-")[2] === yearFilter)
    ).map((po) => po.supplier));
    return rows.filter((r) => matching.has(r.supplier));
  }, [rows, poData, currencyFilter, yearFilter]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[sortCol]; const bv = b[sortCol];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      if (av === null) return 1; if (bv === null) return -1;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filtered, sortCol, sortDir]);

  const paged = useMemo(() => sorted.slice((page - 1) * rowsPerPage, page * rowsPerPage), [sorted, page, rowsPerPage]);

  function toggleSort(col: SupplierCol) {
    if (sortCol === col) { if (sortDir === "asc") setSortDir("desc"); else { setSortCol("totalPO"); setSortDir("desc"); } }
    else { setSortCol(col); setSortDir("asc"); }
  }

  const allLeadTimes = rows.flatMap((r) => r.avgLeadTime !== null ? [r.avgLeadTime] : []);
  const globalAvgLead = allLeadTimes.length > 0 ? Math.round(allLeadTimes.reduce((a, b) => a + b, 0) / allLeadTimes.length) : null;
  const mostActive = rows.reduce<SupplierRow | null>((best, r) => (!best || r.totalPO > best.totalPO ? r : best), null);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 px-4 py-2 border-b border-edge bg-panel flex items-center gap-2 flex-wrap">
        <MetricCard label="Total Suppliers" value={rows.length} icon={Users} />
        <MetricCard label="Avg PO / Supplier" value={rows.length > 0 ? (rows.reduce((s, r) => s + r.totalPO, 0) / rows.length).toFixed(1) : "0"} icon={ShoppingCart} />
        <MetricCard label="Most Active" value={mostActive?.supplier ?? "—"} icon={TrendingUp} />
        <MetricCard label="Avg Lead Time" value={globalAvgLead !== null ? `${globalAvgLead} days` : "—"} icon={Clock} />
      </div>

      <div className="shrink-0 px-4 py-2 border-b border-edge bg-surface flex items-center gap-3 flex-wrap">
        <SelectFilter label="Currency" value={currencyFilter}
          options={[{ value: "all", label: "All" }, ...allCurrencies.map((c) => ({ value: c, label: c }))]}
          onChange={(v) => { setCurrencyFilter(v); setPage(1); }} />
        <div className="w-px h-5 bg-edge shrink-0" />
        <SelectFilter label="Year" value={yearFilter}
          options={[{ value: "all", label: "All" }, ...allYears.map((y) => ({ value: y, label: y }))]}
          onChange={(v) => { setYearFilter(v); setPage(1); }} />
      </div>

      <SupplierBarChart rows={filtered} />

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full border-collapse" style={{ tableLayout: "fixed", minWidth: 700 }}>
          <colgroup>
            <col style={{ width: "28%" }} /><col style={{ width: "10%" }} /><col style={{ width: "11%" }} />
            <col style={{ width: "12%" }} /><col style={{ width: "12%" }} /><col style={{ width: "12%" }} /><col style={{ width: "12%" }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-surface">
            <tr className="border-b border-edge">
              {([ ["supplier","Supplier"],["totalPO","Total PO"],["totalItems","Total Items"],
                  ["avgLeadTime","Avg Lead Time"],["lastOrder","Last Order"],["currency","Currency"],["priceRecords","Price Records"],
              ] as [SupplierCol, string][]).map(([col, label]) => (
                <ThCell key={col} label={label} colKey={col} sortCol={sortCol} sortDir={sortDir} onSort={(k) => toggleSort(k as SupplierCol)} />
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.length === 0
              ? <tr><td colSpan={7} className="text-center py-16 text-muted text-sm">No data.</td></tr>
              : paged.map((row) => (
                <tr key={row.supplier} className="border-b border-edge/50 transition-colors hover:bg-surface-hover">
                  <td className="px-3 py-2 text-[12px] truncate" title={row.supplier}>{row.supplier}</td>
                  <td className="px-3 py-2 text-[12px] font-mono">{row.totalPO}</td>
                  <td className="px-3 py-2 text-[12px] font-mono">{row.totalItems}</td>
                  <td className="px-3 py-2 text-[12px] font-mono">{row.avgLeadTime !== null ? `${row.avgLeadTime}d` : "—"}</td>
                  <td className="px-3 py-2 text-[12px] font-mono">{fmtDate(row.lastOrder)}</td>
                  <td className="px-3 py-2"><span className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium rounded bg-slate-100 border border-slate-200 text-primary">{row.currency}</span></td>
                  <td className="px-3 py-2 text-[12px] font-mono">{row.priceRecords}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <PaginationBar total={sorted.length} page={page} rowsPerPage={rowsPerPage} onPage={setPage} onRowsPerPage={setRowsPerPage} />
    </div>
  );
}

// ── Feature 3: Price History Viewer ──────────────────────────────────────────

type PriceHistCol = "supplierName" | "currency" | "purchasePrice" | "activeFrom" | "activeTo" | "purchaseLeadTime" | "minimumQuantity";

function PriceHistoryChart({ records, item }: { records: PriceRecord[]; item: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<import("chart.js").Chart | null>(null);

  const bySupplier = useMemo(() => {
    const map = new Map<string, { date: string; price: number }[]>();
    for (const r of records) {
      if (!r.activeFrom || r.purchasePrice === null) continue;
      if (!map.has(r.supplierName)) map.set(r.supplierName, []);
      map.get(r.supplierName)!.push({ date: r.activeFrom, price: r.purchasePrice });
    }
    map.forEach((pts) => pts.sort((a, b) => a.date.localeCompare(b.date)));
    return map;
  }, [records]);

  const suppliers = useMemo(() => Array.from(bySupplier.keys()), [bySupplier]);

  useEffect(() => {
    if (!canvasRef.current || suppliers.length === 0) return;
    let cancelled = false;
    import("chart.js").then(({ Chart, CategoryScale, LinearScale, PointElement, LineElement, LineController, Tooltip }) => {
      if (cancelled) return;
      Chart.register(CategoryScale, LinearScale, PointElement, LineElement, LineController, Tooltip);
      chartRef.current?.destroy();
      const allDates = Array.from(new Set(Array.from(bySupplier.values()).flatMap((pts) => pts.map((p) => p.date)))).sort();
      chartRef.current = new Chart(canvasRef.current!, {
        type: "line",
        data: {
          labels: allDates.map(fmtDate),
          datasets: suppliers.map((sup, i) => {
            const ptMap = new Map(bySupplier.get(sup)!.map((p) => [p.date, p.price]));
            return {
              label: sup,
              data: allDates.map((d) => ptMap.get(d) ?? null),
              borderColor: CHART_COLORS[i % CHART_COLORS.length],
              backgroundColor: CHART_COLORS[i % CHART_COLORS.length] + "22",
              tension: 0.3, spanGaps: true, pointRadius: 4,
            };
          }),
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => ` ${ctx.dataset.label}: ${fmtPrice(ctx.raw as number)}` } } },
          scales: {
            x: { grid: { color: "#e2e8f0" }, ticks: { font: { size: 10, family: "monospace" }, color: "#64748b" } },
            y: { grid: { color: "#e2e8f0" }, ticks: { font: { size: 10, family: "monospace" }, color: "#64748b" } },
          },
        },
      });
    });
    return () => { cancelled = true; chartRef.current?.destroy(); chartRef.current = null; };
  }, [bySupplier, suppliers]);

  const latestBySupplier = new Map<string, PriceRecord>();
  for (const r of records) {
    const ex = latestBySupplier.get(r.supplierName);
    if (!ex || (r.activeFrom ?? "") > (ex.activeFrom ?? "")) latestBySupplier.set(r.supplierName, r);
  }

  if (suppliers.length === 0) return null;
  return (
    <div className="shrink-0 border-b border-edge bg-panel px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted mb-2">Price History — {item}</p>
      <div style={{ height: 240 }}><canvas ref={canvasRef} /></div>
      <div className="flex items-center gap-3 flex-wrap mt-2">
        {suppliers.map((sup, i) => {
          const latest = latestBySupplier.get(sup);
          return (
            <div key={sup} className="flex items-center gap-1.5">
              <span className="w-3 h-2 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="text-[11px] text-primary">{sup}</span>
              {latest?.purchasePrice !== null && <span className="text-[10px] font-mono text-muted">({fmtPrice(latest!.purchasePrice)} {latest!.currency})</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PriceHistoryTab({ priceData }: { priceData: PriceRecord[] }) {
  const [selectedItem, setSelectedItem] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [sortCol, setSortCol] = useState<PriceHistCol>("activeFrom");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const itemOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of priceData) map.set(r.itemCode, (map.get(r.itemCode) ?? 0) + 1);
    return Array.from(map.entries()).map(([code, count]) => ({ code, count })).sort((a, b) => a.code.localeCompare(b.code));
  }, [priceData]);

  const selectedRecords = useMemo(() => selectedItem ? priceData.filter((r) => r.itemCode === selectedItem) : [], [priceData, selectedItem]);
  const displayRecords = useMemo(() => currencyFilter !== "all" ? selectedRecords.filter((r) => r.currency === currencyFilter) : selectedRecords, [selectedRecords, currencyFilter]);
  const currencies = useMemo(() => Array.from(new Set(selectedRecords.map((r) => r.currency).filter(Boolean))).sort(), [selectedRecords]);

  const sortedRecords = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...displayRecords].sort((a, b) => {
      const av = a[sortCol]; const bv = b[sortCol];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      if (av === null) return 1; if (bv === null) return -1;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [displayRecords, sortCol, sortDir]);

  function toggleSort(col: PriceHistCol) {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 px-4 py-3 border-b border-edge bg-surface flex items-center gap-3 flex-wrap">
        <ItemDropdown value={selectedItem} options={itemOptions} onChange={(v) => { setSelectedItem(v); setCurrencyFilter("all"); }} />
        {currencies.length > 1 && (
          <>
            <div className="w-px h-5 bg-edge shrink-0" />
            <SelectFilter label="Currency" value={currencyFilter}
              options={[{ value: "all", label: "All" }, ...currencies.map((c) => ({ value: c, label: c }))]}
              onChange={setCurrencyFilter} />
          </>
        )}
      </div>

      {!selectedItem ? <EmptyState message="Select an item code to view price history" />
        : displayRecords.length === 0 ? <EmptyState message="No price history found for this item / currency" />
        : (
          <>
            <PriceHistoryChart records={displayRecords} item={selectedItem} />
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full border-collapse" style={{ tableLayout: "fixed", minWidth: 700 }}>
                <colgroup>
                  <col style={{ width: "25%" }} /><col style={{ width: "9%" }} /><col style={{ width: "13%" }} />
                  <col style={{ width: "11%" }} /><col style={{ width: "11%" }} /><col style={{ width: "10%" }} /><col style={{ width: "10%" }} />
                </colgroup>
                <thead className="sticky top-0 z-10 bg-surface">
                  <tr className="border-b border-edge">
                    {([["supplierName","Supplier"],["currency","Currency"],["purchasePrice","Purchase Price"],
                      ["activeFrom","Active From"],["activeTo","Active To"],["purchaseLeadTime","Lead Time"],["minimumQuantity","Min Qty"],
                    ] as [PriceHistCol, string][]).map(([col, label]) => (
                      <ThCell key={col} label={label} colKey={col} sortCol={sortCol} sortDir={sortDir} onSort={(k) => toggleSort(k as PriceHistCol)} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedRecords.map((r, i) => (
                    <tr key={i} className="border-b border-edge/50 transition-colors hover:bg-surface-hover">
                      <td className="px-3 py-2 text-[12px] truncate" title={r.supplierName}>{r.supplierName}</td>
                      <td className="px-3 py-2"><span className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium rounded bg-slate-100 border border-slate-200 text-primary">{r.currency}</span></td>
                      <td className="px-3 py-2 text-[12px] font-mono">{fmtPrice(r.purchasePrice)}</td>
                      <td className="px-3 py-2 text-[12px] font-mono">{fmtDate(r.activeFrom)}</td>
                      <td className="px-3 py-2 text-[12px] font-mono">{fmtDate(r.activeTo)}</td>
                      <td className="px-3 py-2 text-[12px] font-mono">{r.purchaseLeadTime !== null ? `${r.purchaseLeadTime}d` : "—"}</td>
                      <td className="px-3 py-2 text-[12px] font-mono">{r.minimumQuantity ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
    </div>
  );
}

// ── Feature 4: Price Comparison Tool ─────────────────────────────────────────

type CompareCol = "supplierName" | "currency" | "latestPrice" | "activeFrom" | "purchaseLeadTime" | "minimumQuantity" | "mainSupplier";

interface CompareRow {
  supplierName: string; currency: string; latestPrice: number | null;
  activeFrom: string | null; purchaseLeadTime: number | null; minimumQuantity: number | null;
  mainSupplier: string; isMain: boolean;
}

function buildCompareRows(priceData: PriceRecord[], itemCode: string, currency: string): CompareRow[] {
  const filtered = priceData.filter((r) => r.itemCode === itemCode && (currency === "all" || r.currency === currency));
  const latestMap = new Map<string, PriceRecord>();
  for (const r of filtered) {
    const ex = latestMap.get(r.supplierName);
    if (!ex || (r.activeFrom ?? "") > (ex.activeFrom ?? "")) latestMap.set(r.supplierName, r);
  }
  return Array.from(latestMap.values()).map((r) => ({
    supplierName: r.supplierName, currency: r.currency, latestPrice: r.purchasePrice,
    activeFrom: r.activeFrom, purchaseLeadTime: r.purchaseLeadTime, minimumQuantity: r.minimumQuantity,
    mainSupplier: r.mainSupplier, isMain: r.mainSupplier === "1",
  }));
}

function PriceComparisonTab({ priceData }: { priceData: PriceRecord[] }) {
  const [selectedItem, setSelectedItem] = useState("");
  const [currencyFilter, setCurrencyFilter] = useState("all");
  const [sortCol, setSortCol] = useState<CompareCol>("latestPrice");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const itemOptions = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of priceData) map.set(r.itemCode, (map.get(r.itemCode) ?? 0) + 1);
    return Array.from(map.entries()).map(([code, count]) => ({ code, count })).sort((a, b) => a.code.localeCompare(b.code));
  }, [priceData]);

  const allCurrencies = useMemo(() => selectedItem ? Array.from(new Set(priceData.filter((r) => r.itemCode === selectedItem).map((r) => r.currency).filter(Boolean))).sort() : [], [priceData, selectedItem]);
  const compareRows = useMemo(() => selectedItem ? buildCompareRows(priceData, selectedItem, currencyFilter) : [], [priceData, selectedItem, currencyFilter]);

  const sortedRows = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...compareRows].sort((a, b) => {
      const av = a[sortCol]; const bv = b[sortCol];
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      if (av === null) return 1; if (bv === null) return -1;
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [compareRows, sortCol, sortDir]);

  function toggleSort(col: CompareCol) {
    if (sortCol === col) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("asc"); }
  }

  const prices = compareRows.map((r) => r.latestPrice).filter((p): p is number => p !== null);
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null;
  const cheapest = compareRows.find((r) => r.latestPrice !== null && r.latestPrice === minPrice);

  function getRowBg(row: CompareRow): string | undefined {
    if (compareRows.length < 2 || row.latestPrice === null) return undefined;
    if (row.latestPrice === minPrice) return "#f0fdf4";
    if (row.latestPrice === maxPrice) return "#fef2f2";
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="shrink-0 px-4 py-3 border-b border-edge bg-surface flex items-center gap-3 flex-wrap">
        <ItemDropdown value={selectedItem} options={itemOptions} onChange={(v) => { setSelectedItem(v); setCurrencyFilter("all"); }} />
        {allCurrencies.length > 1 && (
          <>
            <div className="w-px h-5 bg-edge shrink-0" />
            <SelectFilter label="Currency" value={currencyFilter}
              options={[{ value: "all", label: "All" }, ...allCurrencies.map((c) => ({ value: c, label: c }))]}
              onChange={setCurrencyFilter} />
          </>
        )}
      </div>

      {!selectedItem ? <EmptyState message="Select an item code to compare supplier prices" />
        : compareRows.length === 0 ? <EmptyState message="No price data found for this item / currency" />
        : (
          <div className="flex-1 min-h-0 overflow-auto">
            <div className="px-4 py-2 border-b border-edge bg-panel flex items-center gap-2">
              {compareRows.length === 1
                ? <span className="flex items-center gap-1.5 text-[12px] text-muted px-2.5 py-1 rounded bg-blue-50 border border-blue-200"><AlertCircle size={13} className="text-blue-400" />Hanya 1 supplier tersedia untuk item ini</span>
                : <span className="text-[12px] text-primary">
                    <span className="font-semibold">{compareRows.length} supplier(s) found</span>
                    {cheapest && <> — cheapest: <span className="text-emerald-600 font-semibold">{cheapest.supplierName}</span> at <span className="font-mono">{fmtPrice(cheapest.latestPrice)} {cheapest.currency}</span></>}
                  </span>}
            </div>
            <table className="w-full border-collapse" style={{ tableLayout: "fixed", minWidth: 700 }}>
              <colgroup>
                <col style={{ width: "26%" }} /><col style={{ width: "9%" }} /><col style={{ width: "13%" }} />
                <col style={{ width: "11%" }} /><col style={{ width: "11%" }} /><col style={{ width: "10%" }} /><col style={{ width: "12%" }} />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-surface">
                <tr className="border-b border-edge">
                  {([["supplierName","Supplier"],["currency","Currency"],["latestPrice","Latest Price"],
                    ["activeFrom","Active From"],["purchaseLeadTime","Lead Time"],["minimumQuantity","Min Qty"],["mainSupplier","Status"],
                  ] as [CompareCol, string][]).map(([col, label]) => (
                    <ThCell key={col} label={label} colKey={col} sortCol={sortCol} sortDir={sortDir} onSort={(k) => toggleSort(k as CompareCol)} />
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((row, i) => (
                  <tr key={i} className="border-b border-edge/50 transition-colors" style={{ backgroundColor: getRowBg(row) }}>
                    <td className="px-3 py-2 text-[12px] truncate" title={row.supplierName}>{row.supplierName}</td>
                    <td className="px-3 py-2"><span className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium rounded bg-slate-100 border border-slate-200 text-primary">{row.currency}</span></td>
                    <td className="px-3 py-2 text-[12px] font-mono font-semibold">{fmtPrice(row.latestPrice)}</td>
                    <td className="px-3 py-2 text-[12px] font-mono">{fmtDate(row.activeFrom)}</td>
                    <td className="px-3 py-2 text-[12px] font-mono">{row.purchaseLeadTime !== null ? `${row.purchaseLeadTime}d` : "—"}</td>
                    <td className="px-3 py-2 text-[12px] font-mono">{row.minimumQuantity ?? "—"}</td>
                    <td className="px-3 py-2">
                      {row.isMain && <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium rounded bg-accent/10 text-accent border border-accent/30">Main Supplier</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Tab = "po-tracker" | "supplier-performance" | "price-history" | "price-comparison";

const TABS: { key: Tab; label: string; icon: React.ElementType }[] = [
  { key: "po-tracker", label: "PO Tracker", icon: Truck },
  { key: "supplier-performance", label: "Supplier Performance", icon: BarChart2 },
  { key: "price-history", label: "Price History", icon: TrendingUp },
  { key: "price-comparison", label: "Price Comparison", icon: Tag },
];

export default function POTrackerPage() {
  const [activeTab, setActiveTab] = useState<Tab>("po-tracker");
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
      {!isLoaded ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="w-full max-w-2xl space-y-6">
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
        <>
          {activeTab === "po-tracker" && <POTrackerTab poData={poData} />}
          {activeTab === "supplier-performance" && <SupplierPerformanceTab poData={poData} priceData={priceData} />}
          {activeTab === "price-history" && <PriceHistoryTab priceData={priceData} />}
          {activeTab === "price-comparison" && <PriceComparisonTab priceData={priceData} />}
        </>
      )}
    </div>
  );
}
