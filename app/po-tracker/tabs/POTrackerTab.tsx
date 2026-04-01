"use client";

import { useState, useMemo, useEffect } from "react";
import { ChevronDown, ChevronRight as ChevronRightIcon, ShoppingCart, Clock, Truck, Users, Tag } from "lucide-react";
import { type PORecord, leadTimeDays, getStatus, fmtDate } from "@/lib/po-tracker";
import { MetricCard, SearchInput, SelectFilter, ThCell, PaginationBar } from "../components/shared";

type POCol = "orderNumber" | "supplier" | "orderDate" | "receiptDate" | "leadTime" | "qtyItems" | "currency" | "status";

type StatusVal = "Received" | "Pending";

interface PORow {
  orderNumber: string; supplier: string; currency: string;
  orderDate: string | null; receiptDate: string | null;
  leadTime: number | null; qtyItems: number;
  status: StatusVal; items: import("@/lib/po-tracker").POLineItem[];
}

function buildPORows(data: PORecord[]): PORow[] {
  return data.map((po) => ({
    orderNumber: po.orderNumber, supplier: po.supplier, currency: po.currency,
    orderDate: po.orderDate, receiptDate: po.receiptDate,
    leadTime: leadTimeDays(po.orderDate, po.receiptDate),
    qtyItems: po.items.length, status: getStatus(po.receiptDate), items: po.items,
  }));
}

function StatusBadge({ status }: { status: StatusVal }) {
  return status === "Received"
    ? <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium rounded bg-emerald-50 text-emerald-700 border border-emerald-200">Received</span>
    : <span className="inline-flex items-center px-2 py-0.5 text-[11px] font-mono font-medium rounded bg-amber-50 text-amber-700 border border-amber-200">Pending</span>;
}

export default function POTrackerTab({ poData }: { poData: PORecord[] }) {
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
            Clear
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
