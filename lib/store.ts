"use client";

import { create } from "zustand";
import type { FileKey, OutputRow, Summary, TableSize, ExportRowLimit } from "./types";
import { OUTPUT_COLUMNS } from "./types";

interface FileSlotState {
  file: File | null;
  status: "empty" | "ready";
}

interface AppStore {
  // ── Files ──────────────────────────────────────────────────────────
  files: Record<FileKey, FileSlotState>;
  setFile: (key: FileKey, file: File) => void;
  removeFile: (key: FileKey) => void;
  allFilesReady: () => boolean;

  // ── Processing ─────────────────────────────────────────────────────
  processingState: "idle" | "processing" | "done" | "error";
  progress: { step: string; progress: number; message: string } | null;
  error: string | null;
  results: OutputRow[];
  summary: Summary | null;

  startProcessing: () => void;
  setProgress: (step: string, progress: number, message: string) => void;
  setResults: (data: OutputRow[], summary: Summary) => void;
  setError: (msg: string) => void;
  reset: () => void;

  // ── Filters ────────────────────────────────────────────────────────
  statusFilter: "all" | "active" | "draft";
  etaFilter: "all" | "yes" | "no";
  discountFilter: "all" | "yes" | "no";
  policyFilter: "all" | "continue" | "deny";
  setStatusFilter: (f: "all" | "active" | "draft") => void;
  setEtaFilter: (f: "all" | "yes" | "no") => void;
  setDiscountFilter: (f: "all" | "yes" | "no") => void;
  setPolicyFilter: (f: "all" | "continue" | "deny") => void;

  // ── Column Visibility ──────────────────────────────────────────────
  visibleColumns: (keyof OutputRow)[];
  setVisibleColumns: (cols: (keyof OutputRow)[]) => void;
  toggleColumn: (col: keyof OutputRow) => void;
  showAllColumns: () => void;
  hideAllColumns: () => void;

  // ── Sort (3-click: asc → desc → none) ─────────────────────────────
  sortColumn: keyof OutputRow | null;
  sortDirection: "asc" | "desc";
  toggleSort: (column: keyof OutputRow) => void;

  // ── Table Size ─────────────────────────────────────────────────────
  tableSize: TableSize;
  setTableSize: (s: TableSize) => void;

  // ── Export Row Limit ───────────────────────────────────────────────
  exportRowLimit: ExportRowLimit;
  customRowLimit: number;
  setExportRowLimit: (l: ExportRowLimit) => void;
  setCustomRowLimit: (n: number) => void;

  // ── Sidebar ────────────────────────────────────────────────────────
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

const emptySlot: FileSlotState = { file: null, status: "empty" };

export const useAppStore = create<AppStore>((set, get) => ({
  // Files
  files: {
    shopify: { ...emptySlot },
    sales: { ...emptySlot },
    stock: { ...emptySlot },
    purchase: { ...emptySlot },
    items: { ...emptySlot },
  },
  setFile: (key, file) =>
    set((s) => ({
      files: { ...s.files, [key]: { file, status: "ready" as const } },
    })),
  removeFile: (key) =>
    set((s) => ({
      files: { ...s.files, [key]: { file: null, status: "empty" as const } },
    })),
  allFilesReady: () => Object.values(get().files).every((f) => f.status === "ready"),

  // Processing
  processingState: "idle",
  progress: null,
  error: null,
  results: [],
  summary: null,

  startProcessing: () =>
    set({ processingState: "processing", progress: null, error: null, results: [], summary: null }),
  setProgress: (step, progress, message) =>
    set({ progress: { step, progress, message } }),
  setResults: (data, summary) =>
    set({ processingState: "done", results: data, summary, progress: { step: "Done", progress: 100, message: "Complete" } }),
  setError: (msg) =>
    set({ processingState: "error", error: msg, progress: null }),
  reset: () =>
    set({ processingState: "idle", progress: null, error: null, results: [], summary: null }),

  // Filters
  statusFilter: "all",
  etaFilter: "all",
  discountFilter: "all",
  policyFilter: "all",
  setStatusFilter: (f) => set({ statusFilter: f }),
  setEtaFilter: (f) => set({ etaFilter: f }),
  setDiscountFilter: (f) => set({ discountFilter: f }),
  setPolicyFilter: (f) => set({ policyFilter: f }),

  // Column Visibility
  visibleColumns: OUTPUT_COLUMNS.map((c) => c.key),
  setVisibleColumns: (cols) => set({ visibleColumns: cols }),
  toggleColumn: (col) =>
    set((s) => ({
      visibleColumns: s.visibleColumns.includes(col)
        ? s.visibleColumns.filter((c) => c !== col)
        : [...s.visibleColumns, col],
    })),
  showAllColumns: () => set({ visibleColumns: OUTPUT_COLUMNS.map((c) => c.key) }),
  hideAllColumns: () => set({ visibleColumns: [] }),

  // Sort (3-click: asc → desc → clear)
  sortColumn: null,
  sortDirection: "asc",
  toggleSort: (column) =>
    set((s) => {
      if (s.sortColumn !== column) return { sortColumn: column, sortDirection: "asc" as const };
      if (s.sortDirection === "asc") return { sortColumn: column, sortDirection: "desc" as const };
      return { sortColumn: null, sortDirection: "asc" as const };
    }),

  // Table Size
  tableSize: "M",
  setTableSize: (s) => set({ tableSize: s }),

  // Export Row Limit
  exportRowLimit: "all",
  customRowLimit: 50,
  setExportRowLimit: (l) => set({ exportRowLimit: l }),
  setCustomRowLimit: (n) => set({ customRowLimit: n }),

  // Sidebar
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
