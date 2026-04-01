"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { StockRow, StockSummary, StockStatusFilter, StockTableSize } from "./stock-types";
import { STOCK_COLUMNS } from "./stock-types";
import { idbStorage } from "./idb-storage";

const DEFAULT_VISIBLE: (keyof StockRow)[] = STOCK_COLUMNS.map((c) => c.key);

export type ItemsLookup = Record<string, { class01: string; class06: string }>;

function enrichRows(raw: StockRow[], lookup: ItemsLookup): StockRow[] {
  return raw.map((r) => ({
    ...r,
    Class01Description: lookup[r.ItemCode]?.class01 ?? "",
    Class06Description: lookup[r.ItemCode]?.class06 ?? "",
  }));
}

interface StockState {
  rows: StockRow[];
  rawStockRows: StockRow[];
  summary: StockSummary | null;
  fileName: string | null;
  processingState: "idle" | "processing" | "done" | "error";
  error: string | null;

  itemsLookup: ItemsLookup;
  itemsFileName: string | null;

  search: string;
  categoryFilter: string[];
  class01Filter: string[];
  class06Filter: string[];
  stockStatusFilter: StockStatusFilter;

  sortColumn: keyof StockRow | null;
  sortDirection: "asc" | "desc";

  visibleColumns: (keyof StockRow)[];
  tableSize: StockTableSize;

  rowsPerPage: number | "all";
  currentPage: number;

  setRows: (rows: StockRow[], summary: StockSummary, fileName: string) => void;
  setItemsData: (lookup: ItemsLookup, itemsFileName: string) => void;
  clearItemsData: () => void;
  setProcessing: () => void;
  setError: (msg: string) => void;
  reset: () => void;

  setSearch: (s: string) => void;
  setCategoryFilter: (cats: string[]) => void;
  setClass01Filter: (cats: string[]) => void;
  setClass06Filter: (cats: string[]) => void;
  setStockStatusFilter: (f: StockStatusFilter) => void;

  toggleSort: (col: keyof StockRow) => void;
  toggleColumn: (col: keyof StockRow) => void;
  showAllColumns: () => void;
  hideAllColumns: () => void;

  setTableSize: (s: StockTableSize) => void;
  setRowsPerPage: (n: number | "all") => void;
  setCurrentPage: (p: number) => void;
}

export const useStockStore = create<StockState>()(
  persist(
    (set) => ({
      rows: [],
      rawStockRows: [],
      summary: null,
      fileName: null,
      processingState: "idle",
      error: null,

      itemsLookup: {},
      itemsFileName: null,

      search: "",
      categoryFilter: [],
      class01Filter: [],
      class06Filter: [],
      stockStatusFilter: "all",

      sortColumn: null,
      sortDirection: "asc",

      visibleColumns: DEFAULT_VISIBLE,
      tableSize: "M",

      rowsPerPage: 50,
      currentPage: 1,

      setRows: (rawRows, summary, fileName) =>
        set((s) => ({
          rawStockRows: rawRows,
          rows: enrichRows(rawRows, s.itemsLookup),
          summary,
          fileName,
          processingState: "done",
          error: null,
          currentPage: 1,
        })),

      setItemsData: (lookup, itemsFileName) =>
        set((s) => ({
          itemsLookup: lookup,
          itemsFileName,
          rows: s.rawStockRows.length > 0 ? enrichRows(s.rawStockRows, lookup) : s.rows,
        })),

      clearItemsData: () =>
        set((s) => ({
          itemsLookup: {},
          itemsFileName: null,
          class01Filter: [],
          class06Filter: [],
          rows: s.rawStockRows.length > 0 ? enrichRows(s.rawStockRows, {}) : s.rows,
        })),

      setProcessing: () => set({ processingState: "processing", error: null }),
      setError: (msg) => set({ processingState: "error", error: msg }),
      reset: () =>
        set({
          rows: [],
          rawStockRows: [],
          summary: null,
          fileName: null,
          processingState: "idle",
          error: null,
          itemsLookup: {},
          itemsFileName: null,
          search: "",
          categoryFilter: [],
          class01Filter: [],
          class06Filter: [],
          stockStatusFilter: "all",
          sortColumn: null,
          sortDirection: "asc",
          currentPage: 1,
        }),

      setSearch: (search) => set({ search, currentPage: 1 }),
      setCategoryFilter: (categoryFilter) => set({ categoryFilter, currentPage: 1 }),
      setClass01Filter: (class01Filter) => set({ class01Filter, currentPage: 1 }),
      setClass06Filter: (class06Filter) => set({ class06Filter, currentPage: 1 }),
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
    }),
    {
      name: "stock-store",
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({
        rows: s.rows,
        rawStockRows: s.rawStockRows,
        itemsLookup: s.itemsLookup,
        fileName: s.fileName,
        itemsFileName: s.itemsFileName,
        summary: s.summary,
        visibleColumns: s.visibleColumns,
      }),
    }
  )
);
