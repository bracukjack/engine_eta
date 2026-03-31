"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { CustomerRFM, ClusterCentroid, ElbowPoint, SegmentLabel } from "./rfm-types";
import { idbStorage } from "./idb-storage";

interface RFMState {
  // Data
  customers: CustomerRFM[];
  centroids: ClusterCentroid[];
  elbowData: ElbowPoint[];
  optimalK: number;
  dateRange: { from: string; to: string } | null;
  fileName: string | null;

  // Processing
  processingState: "idle" | "processing" | "done" | "error";
  progressStep: string;
  progressPct: number;
  progressMsg: string;
  error: string | null;

  // Table filters
  search: string;
  segmentFilter: SegmentLabel | "all";
  sortColumn: keyof CustomerRFM | null;
  sortDirection: "asc" | "desc";
  currentPage: number;
  rowsPerPage: number;

  // Actions
  setResult: (data: import("./rfm-types").RFMResult, fileName: string) => void;
  setProgress: (step: string, pct: number, msg: string) => void;
  setProcessing: () => void;
  setError: (msg: string) => void;
  reset: () => void;

  setSearch: (s: string) => void;
  setSegmentFilter: (f: SegmentLabel | "all") => void;
  toggleSort: (col: keyof CustomerRFM) => void;
  setCurrentPage: (p: number) => void;
  setRowsPerPage: (n: number) => void;
}

export const useRFMStore = create<RFMState>()(
  persist(
    (set) => ({
      customers: [],
      centroids: [],
      elbowData: [],
      optimalK: 0,
      dateRange: null,
      fileName: null,

      processingState: "idle",
      progressStep: "",
      progressPct: 0,
      progressMsg: "",
      error: null,

      search: "",
      segmentFilter: "all",
      sortColumn: null,
      sortDirection: "asc",
      currentPage: 1,
      rowsPerPage: 25,

      setResult: (data, fileName) =>
        set({
          customers: data.customers,
          centroids: data.centroids,
          elbowData: data.elbowData,
          optimalK: data.optimalK,
          dateRange: data.dateRange,
          fileName,
          processingState: "done",
          error: null,
          currentPage: 1,
        }),

      setProgress: (step, pct, msg) =>
        set({ progressStep: step, progressPct: pct, progressMsg: msg }),

      setProcessing: () =>
        set({ processingState: "processing", error: null, progressPct: 0, progressMsg: "" }),

      setError: (msg) => set({ processingState: "error", error: msg }),

      reset: () =>
        set({
          customers: [],
          centroids: [],
          elbowData: [],
          optimalK: 0,
          dateRange: null,
          fileName: null,
          processingState: "idle",
          error: null,
          progressPct: 0,
          progressMsg: "",
          search: "",
          segmentFilter: "all",
          sortColumn: null,
          sortDirection: "asc",
          currentPage: 1,
        }),

      setSearch: (search) => set({ search, currentPage: 1 }),
      setSegmentFilter: (segmentFilter) => set({ segmentFilter, currentPage: 1 }),
      toggleSort: (col) =>
        set((s) => ({
          sortColumn: col,
          sortDirection: s.sortColumn === col && s.sortDirection === "asc" ? "desc" : "asc",
          currentPage: 1,
        })),
      setCurrentPage: (currentPage) => set({ currentPage }),
      setRowsPerPage: (rowsPerPage) => set({ rowsPerPage, currentPage: 1 }),
    }),
    {
      name: "rfm-store",
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({
        customers: s.customers,
        centroids: s.centroids,
        elbowData: s.elbowData,
        optimalK: s.optimalK,
        dateRange: s.dateRange,
        fileName: s.fileName,
      }),
    }
  )
);
