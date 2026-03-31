"use client";

import { create } from "zustand";
import type { StockRow, StockSummary, StockStatusFilter, StockTableSize } from "./stock-types";
import { STOCK_COLUMNS } from "./stock-types";

const DEFAULT_VISIBLE: (keyof StockRow)[] = STOCK_COLUMNS.map((c) => c.key);

interface StockState {
  rows: StockRow[];
  summary: StockSummary | null;
  fileName: string | null;
  processingState: "idle" | "processing" | "done" | "error";
  error: string | null;

  search: string;
  categoryFilter: string[];
  stockStatusFilter: StockStatusFilter;

  sortColumn: keyof StockRow | null;
  sortDirection: "asc" | "desc";

  visibleColumns: (keyof StockRow)[];
  tableSize: StockTableSize;

  rowsPerPage: number | "all";
  currentPage: number;

  setRows: (rows: StockRow[], summary: StockSummary, fileName: string) => void;
  setProcessing: () => void;
  setError: (msg: string) => void;
  reset: () => void;

  setSearch: (s: string) => void;
  setCategoryFilter: (cats: string[]) => void;
  setStockStatusFilter: (f: StockStatusFilter) => void;

  toggleSort: (col: keyof StockRow) => void;
  toggleColumn: (col: keyof StockRow) => void;
  showAllColumns: () => void;
  hideAllColumns: () => void;

  setTableSize: (s: StockTableSize) => void;
  setRowsPerPage: (n: number | "all") => void;
  setCurrentPage: (p: number) => void;
}

export const useStockStore = create<StockState>((set) => ({
  rows: [],
  summary: null,
  fileName: null,
  processingState: "idle",
  error: null,

  search: "",
  categoryFilter: [],
  stockStatusFilter: "all",

  sortColumn: null,
  sortDirection: "asc",

  visibleColumns: DEFAULT_VISIBLE,
  tableSize: "M",

  rowsPerPage: 50,
  currentPage: 1,

  setRows: (rows, summary, fileName) =>
    set({ rows, summary, fileName, processingState: "done", error: null, currentPage: 1 }),
  setProcessing: () => set({ processingState: "processing", error: null }),
  setError: (msg) => set({ processingState: "error", error: msg }),
  reset: () =>
    set({
      rows: [],
      summary: null,
      fileName: null,
      processingState: "idle",
      error: null,
      search: "",
      categoryFilter: [],
      stockStatusFilter: "all",
      sortColumn: null,
      sortDirection: "asc",
      currentPage: 1,
    }),

  setSearch: (search) => set({ search, currentPage: 1 }),
  setCategoryFilter: (categoryFilter) => set({ categoryFilter, currentPage: 1 }),
  setStockStatusFilter: (stockStatusFilter) => set({ stockStatusFilter, currentPage: 1 }),

  toggleSort: (col) =>
    set((s) => ({
      sortColumn: col,
      sortDirection: s.sortColumn === col && s.sortDirection === "asc" ? "desc" : "asc",
      currentPage: 1,
    })),

  toggleColumn: (col) =>
    set((s) => ({
      visibleColumns: s.visibleColumns.includes(col)
        ? s.visibleColumns.filter((c) => c !== col)
        : [...s.visibleColumns, col],
    })),
  showAllColumns: () => set({ visibleColumns: DEFAULT_VISIBLE }),
  hideAllColumns: () => set({ visibleColumns: [] }),

  setTableSize: (tableSize) => set({ tableSize }),
  setRowsPerPage: (rowsPerPage) => set({ rowsPerPage, currentPage: 1 }),
  setCurrentPage: (currentPage) => set({ currentPage }),
}));
