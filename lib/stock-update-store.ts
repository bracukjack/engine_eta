import { create } from "zustand";
import type { StockUpdateOutputRow } from "./stock-update-logic";

interface StockUpdateState {
  stockPosFileName: string | null;
  stockPosBuffer: ArrayBuffer | null;
  
  poFileName: string | null;
  poBuffer: ArrayBuffer | null;

  stockUpdateFileName: string | null;
  stockUpdateBuffer: ArrayBuffer | null;

  logItemFileName: string | null;
  logItemBuffer: ArrayBuffer | null;

  processingState: "idle" | "processing" | "success" | "error";
  error: string | null;
  results: StockUpdateOutputRow[];

  visibleColumns: string[];
  toggleColumn: (col: string) => void;
  showAllColumns: () => void;
  hideAllColumns: () => void;

  // Table generic filters
  search: string;
  setSearch: (search: string) => void;

  sortColumn: keyof StockUpdateOutputRow | null;
  sortDirection: "asc" | "desc";
  toggleSort: (col: keyof StockUpdateOutputRow) => void;

  // Actions
  setStockPosFile: (filename: string, buffer: ArrayBuffer) => void;
  removeStockPosFile: () => void;

  setPoFile: (filename: string, buffer: ArrayBuffer) => void;
  removePoFile: () => void;

  setStockUpdateFile: (filename: string, buffer: ArrayBuffer) => void;
  removeStockUpdateFile: () => void;

  setLogItemFile: (filename: string, buffer: ArrayBuffer) => void;
  removeLogItemFile: () => void;

  setProcessing: () => void;
  setError: (err: string) => void;
  setResults: (data: StockUpdateOutputRow[]) => void;
  resetAll: () => void;
}

export const useStockUpdateStore = create<StockUpdateState>((set) => ({
  stockPosFileName: null,
  stockPosBuffer: null,

  poFileName: null,
  poBuffer: null,

  stockUpdateFileName: null,
  stockUpdateBuffer: null,

  logItemFileName: null,
  logItemBuffer: null,

  processingState: "idle",
  error: null,
  results: [],

  visibleColumns: ["SKU", "EAN", "Qty", "ETA", "StockAwal", "PlannedIn", "PlannedOut", "ETAAsli", "Class08Desc"],
  toggleColumn: (col) =>
    set((state) => ({
      visibleColumns: state.visibleColumns.includes(col)
        ? state.visibleColumns.filter((c) => c !== col)
        : [...state.visibleColumns, col],
    })),
  showAllColumns: () =>
    set({ visibleColumns: ["SKU", "EAN", "Qty", "ETA", "StockAwal", "PlannedIn", "PlannedOut", "ETAAsli", "Class08Desc"] }),
  hideAllColumns: () => set({ visibleColumns: [] }),

  search: "",
  setSearch: (search) => set({ search }),

  sortColumn: null,
  sortDirection: "asc",
  toggleSort: (col) =>
    set((state) => {
      if (state.sortColumn === col) {
        if (state.sortDirection === "asc") return { sortDirection: "desc" };
        return { sortColumn: null, sortDirection: "asc" };
      }
      return { sortColumn: col, sortDirection: "asc" };
    }),

  setStockPosFile: (filename, buffer) => set({ stockPosFileName: filename, stockPosBuffer: buffer, error: null }),
  removeStockPosFile: () => set({ stockPosFileName: null, stockPosBuffer: null, processingState: "idle", results: [] }),

  setPoFile: (filename, buffer) => set({ poFileName: filename, poBuffer: buffer, error: null }),
  removePoFile: () => set({ poFileName: null, poBuffer: null, processingState: "idle", results: [] }),

  setStockUpdateFile: (filename, buffer) => set({ stockUpdateFileName: filename, stockUpdateBuffer: buffer, error: null }),
  removeStockUpdateFile: () => set({ stockUpdateFileName: null, stockUpdateBuffer: null, processingState: "idle", results: [] }),

  setLogItemFile: (filename, buffer) => set({ logItemFileName: filename, logItemBuffer: buffer, error: null }),
  removeLogItemFile: () => set({ logItemFileName: null, logItemBuffer: null, processingState: "idle", results: [] }),

  setProcessing: () => set({ processingState: "processing", error: null }),
  setError: (error) => set({ processingState: "error", error }),
  setResults: (results) => set({ processingState: "success", results, error: null }),

  resetAll: () => set({
    stockPosFileName: null,
    stockPosBuffer: null,
    poFileName: null,
    poBuffer: null,
    stockUpdateFileName: null,
    stockUpdateBuffer: null,
    logItemFileName: null,
    logItemBuffer: null,
    processingState: "idle",
    error: null,
    results: [],
    visibleColumns: ["SKU", "EAN", "Qty", "ETA", "StockAwal", "PlannedIn", "PlannedOut", "ETAAsli", "Class08Desc"],
    search: "",
    sortColumn: null,
  })
}));
