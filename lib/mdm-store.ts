"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// ── 30-day expiring localStorage adapter ──────────────────────────────────────

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const expiringLocalStorage = {
  getItem: (name: string): string | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(name);
      if (!raw) return null;
      const wrapper = JSON.parse(raw) as { savedAt: number; data: string };
      if (!wrapper.savedAt || Date.now() - wrapper.savedAt > THIRTY_DAYS_MS) {
        localStorage.removeItem(name);
        return null;
      }
      return wrapper.data;
    } catch {
      return null;
    }
  },
  setItem: (name: string, value: string): void => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(name, JSON.stringify({ savedAt: Date.now(), data: value }));
    } catch {
      // Quota exceeded — skip silently
    }
  },
  removeItem: (name: string): void => {
    if (typeof window === "undefined") return;
    localStorage.removeItem(name);
  },
};

export type PublishStatus = "published" | "unpublished" | "not_listed";
export type Country = "FR" | "ES" | "IT" | "DE";
export type CountrySource = "channel" | "attribute-code";
export type ProcessingState = "idle" | "processing" | "done" | "error";

export interface PublishRow {
  _id: number;
  reference: string;
  productTitle: string;
  category: string;
  brand: string;
  ean: string;
  publish_status: PublishStatus;
  publishedPlatform: boolean | null;
  price: string;
  stock: string;
}

export interface PublishSummary {
  total: number;
  published: number;
  unpublished: number;
  notListed: number;
  skipped: number;
}

export interface ErrorRow {
  _id: number;
  lineNumber: string;
  reference: string;
  channels: string;
  attributeLabel: string;
  attributeCodes: string;
  errorCode: string;
  errorMessage: string;
  derived_country: Country;
  country_source: CountrySource;
}

export const PUBLISH_COLUMNS: { key: keyof PublishRow; label: string; flex: number }[] = [
  { key: "reference", label: "Reference", flex: 2 },
  { key: "productTitle", label: "Product Title", flex: 3 },
  { key: "category", label: "Category", flex: 3 },
  { key: "brand", label: "Brand", flex: 1.5 },
  { key: "ean", label: "EAN", flex: 1.5 },
  { key: "publish_status", label: "Publish Status", flex: 1.5 },
  // { key: "publishedPlatform", label: "Published (Platform)", flex: 1.5 },
  { key: "price", label: "Price", flex: 1 },
  { key: "stock", label: "Stock", flex: 1 },
];

export const ERROR_COLUMNS: { key: keyof ErrorRow; label: string; flex: number }[] = [
  { key: "lineNumber", label: "Line #", flex: 0.8 },
  { key: "reference", label: "Reference", flex: 2 },
  { key: "derived_country", label: "Country", flex: 1 },
  { key: "attributeLabel", label: "Attribute Label", flex: 2 },
  { key: "attributeCodes", label: "Attribute Code", flex: 2 },
  { key: "errorCode", label: "Error Code", flex: 1.5 },
  { key: "errorMessage", label: "Error Message", flex: 3 },
];

interface MDMStore {
  // ── Shared file state ──────────────────────────────────────────────────────
  mdmFile: File | null;
  mdmFileName: string | null;
  publishedFile: File | null;
  publishedFileName: string | null;
  setMdmFile: (file: File) => void;
  clearMdmFile: () => void;
  setPublishedFile: (file: File) => void;
  clearPublishedFile: () => void;

  // ── Publish MDM ────────────────────────────────────────────────────────────
  publishState: ProcessingState;
  publishError: string | null;
  publishActiveRows: PublishRow[];
  publishInactiveRows: PublishRow[];
  publishSummary: PublishSummary | null;

  publishSubTab: "active" | "inactive";
  publishSearch: string;
  publishStatusFilter: "all" | PublishStatus;
  publishSortColumn: keyof PublishRow | null;
  publishSortDirection: "asc" | "desc";
  publishCurrentPage: number;
  publishRowsPerPage: number | "all";
  publishVisibleColumns: string[];

  setPublishState: (s: ProcessingState) => void;
  setPublishError: (e: string | null) => void;
  setPublishResults: (active: PublishRow[], inactive: PublishRow[], summary: PublishSummary) => void;
  resetPublish: () => void;
  setPublishSubTab: (t: "active" | "inactive") => void;
  setPublishSearch: (s: string) => void;
  setPublishStatusFilter: (f: "all" | PublishStatus) => void;
  togglePublishSort: (col: keyof PublishRow) => void;
  setPublishCurrentPage: (p: number) => void;
  setPublishRowsPerPage: (n: number | "all") => void;
  togglePublishColumn: (col: string) => void;
  showAllPublishColumns: () => void;
  hideAllPublishColumns: () => void;

  // ── Error MDM ──────────────────────────────────────────────────────────────
  errorState: ProcessingState;
  errorError: string | null;
  errorRows: ErrorRow[];

  errorSearch: string;
  errorCountryFilter: Country[];
  errorSourceFilter: "all" | CountrySource;
  errorCodeFilter: string;
  errorSortColumn: keyof ErrorRow | null;
  errorSortDirection: "asc" | "desc";
  errorCurrentPage: number;
  errorRowsPerPage: number | "all";
  errorVisibleColumns: string[];

  setErrorState: (s: ProcessingState) => void;
  setErrorError: (e: string | null) => void;
  setErrorResults: (rows: ErrorRow[]) => void;
  resetError: () => void;
  setErrorSearch: (s: string) => void;
  setErrorCountryFilter: (c: Country[]) => void;
  setErrorSourceFilter: (f: "all" | CountrySource) => void;
  setErrorCodeFilter: (f: string) => void;
  toggleErrorSort: (col: keyof ErrorRow) => void;
  setErrorCurrentPage: (p: number) => void;
  setErrorRowsPerPage: (n: number | "all") => void;
  toggleErrorColumn: (col: string) => void;
  showAllErrorColumns: () => void;
  hideAllErrorColumns: () => void;
}

export const useMDMStore = create<MDMStore>()(
  persist(
    (set) => ({
  // Shared file state
  mdmFile: null,
  mdmFileName: null,
  publishedFile: null,
  publishedFileName: null,
  setMdmFile: (file) => set({ mdmFile: file, mdmFileName: file.name }),
  clearMdmFile: () => set({ mdmFile: null, mdmFileName: null }),
  setPublishedFile: (file) => set({ publishedFile: file, publishedFileName: file.name }),
  clearPublishedFile: () => set({ publishedFile: null, publishedFileName: null }),

  // Publish MDM
  publishState: "idle",
  publishError: null,
  publishActiveRows: [],
  publishInactiveRows: [],
  publishSummary: null,
  publishSubTab: "active",
  publishSearch: "",
  publishStatusFilter: "all",
  publishSortColumn: null,
  publishSortDirection: "asc",
  publishCurrentPage: 1,
  publishRowsPerPage: 50,
  publishVisibleColumns: PUBLISH_COLUMNS.map((c) => String(c.key)),

  setPublishState: (s) => set({ publishState: s }),
  setPublishError: (e) => set({ publishError: e }),
  setPublishResults: (active, inactive, summary) =>
    set({ publishState: "done", publishActiveRows: active, publishInactiveRows: inactive, publishSummary: summary }),
  resetPublish: () =>
    set({ publishState: "idle", publishError: null, publishActiveRows: [], publishInactiveRows: [], publishSummary: null }),
  setPublishSubTab: (t) => set({ publishSubTab: t, publishCurrentPage: 1 }),
  setPublishSearch: (s) => set({ publishSearch: s, publishCurrentPage: 1 }),
  setPublishStatusFilter: (f) => set({ publishStatusFilter: f, publishCurrentPage: 1 }),
  togglePublishSort: (col) =>
    set((s) => {
      if (s.publishSortColumn !== col) return { publishSortColumn: col, publishSortDirection: "asc" as const };
      if (s.publishSortDirection === "asc") return { publishSortColumn: col, publishSortDirection: "desc" as const };
      return { publishSortColumn: null, publishSortDirection: "asc" as const };
    }),
  setPublishCurrentPage: (p) => set({ publishCurrentPage: p }),
  setPublishRowsPerPage: (n) => set({ publishRowsPerPage: n, publishCurrentPage: 1 }),
  togglePublishColumn: (col) =>
    set((s) => ({
      publishVisibleColumns: s.publishVisibleColumns.includes(col)
        ? s.publishVisibleColumns.filter((c) => c !== col)
        : [...s.publishVisibleColumns, col],
    })),
  showAllPublishColumns: () => set({ publishVisibleColumns: PUBLISH_COLUMNS.map((c) => String(c.key)) }),
  hideAllPublishColumns: () => set({ publishVisibleColumns: [] }),

  // Error MDM
  errorState: "idle",
  errorError: null,
  errorRows: [],
  errorSearch: "",
  errorCountryFilter: [],
  errorSourceFilter: "all",
  errorCodeFilter: "all",
  errorSortColumn: null,
  errorSortDirection: "asc",
  errorCurrentPage: 1,
  errorRowsPerPage: 50,
  errorVisibleColumns: ERROR_COLUMNS.map((c) => String(c.key)),

  setErrorState: (s) => set({ errorState: s }),
  setErrorError: (e) => set({ errorError: e }),
  setErrorResults: (rows) => set({ errorState: "done", errorRows: rows }),
  resetError: () => set({ errorState: "idle", errorError: null, errorRows: [] }),
  setErrorSearch: (s) => set({ errorSearch: s, errorCurrentPage: 1 }),
  setErrorCountryFilter: (c) => set({ errorCountryFilter: c, errorCurrentPage: 1 }),
  setErrorSourceFilter: (f) => set({ errorSourceFilter: f, errorCurrentPage: 1 }),
  setErrorCodeFilter: (f) => set({ errorCodeFilter: f, errorCurrentPage: 1 }),
  toggleErrorSort: (col) =>
    set((s) => {
      if (s.errorSortColumn !== col) return { errorSortColumn: col, errorSortDirection: "asc" as const };
      if (s.errorSortDirection === "asc") return { errorSortColumn: col, errorSortDirection: "desc" as const };
      return { errorSortColumn: null, errorSortDirection: "asc" as const };
    }),
  setErrorCurrentPage: (p) => set({ errorCurrentPage: p }),
  setErrorRowsPerPage: (n) => set({ errorRowsPerPage: n, errorCurrentPage: 1 }),
  toggleErrorColumn: (col) =>
    set((s) => ({
      errorVisibleColumns: s.errorVisibleColumns.includes(col)
        ? s.errorVisibleColumns.filter((c) => c !== col)
        : [...s.errorVisibleColumns, col],
    })),
  showAllErrorColumns: () => set({ errorVisibleColumns: ERROR_COLUMNS.map((c) => String(c.key)) }),
  hideAllErrorColumns: () => set({ errorVisibleColumns: [] }),
    }),
    {
      name: "mdm-store",
      storage: createJSONStorage(() => expiringLocalStorage),
      partialize: (s) => ({
        // File names only — File objects are not serializable
        mdmFileName: s.mdmFileName,
        publishedFileName: s.publishedFileName,
        // Publish MDM results & UI state
        publishState: s.publishState === "processing" ? "idle" : s.publishState,
        publishActiveRows: s.publishActiveRows,
        publishInactiveRows: s.publishInactiveRows,
        publishSummary: s.publishSummary,
        publishVisibleColumns: s.publishVisibleColumns,
        publishStatusFilter: s.publishStatusFilter,
        publishRowsPerPage: s.publishRowsPerPage,
        // Error MDM results & UI state
        errorState: s.errorState === "processing" ? "idle" : s.errorState,
        errorRows: s.errorRows,
        errorVisibleColumns: s.errorVisibleColumns,
        errorCountryFilter: s.errorCountryFilter,
        errorCodeFilter: s.errorCodeFilter,
        errorRowsPerPage: s.errorRowsPerPage,
      }),
    }
  )
);
