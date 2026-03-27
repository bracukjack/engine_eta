"use client";

import { create } from "zustand";
import type { FileKey, OutputRow, Summary } from "./types";

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
  setStatusFilter: (f: "all" | "active" | "draft") => void;
  setEtaFilter: (f: "all" | "yes" | "no") => void;
  setDiscountFilter: (f: "all" | "yes" | "no") => void;

  // ── Sort ───────────────────────────────────────────────────────────
  sortColumn: keyof OutputRow | null;
  sortDirection: "asc" | "desc";
  toggleSort: (column: keyof OutputRow) => void;

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
  setStatusFilter: (f) => set({ statusFilter: f }),
  setEtaFilter: (f) => set({ etaFilter: f }),
  setDiscountFilter: (f) => set({ discountFilter: f }),

  // Sort
  sortColumn: null,
  sortDirection: "asc",
  toggleSort: (column) =>
    set((s) => ({
      sortColumn: column,
      sortDirection: s.sortColumn === column && s.sortDirection === "asc" ? "desc" : "asc",
    })),

  // Sidebar
  sidebarCollapsed: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
