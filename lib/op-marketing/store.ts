import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/lib/idb-storage";
import type { CampaignOfferRow, KatanaLangKey } from "./types";

interface OPMarketingState {
  // Config
  country: string;
  shopName: string;
  setCountry: (v: string) => void;
  setShopName: (v: string) => void;

  // Input files — NOT persisted (ArrayBuffer can't be serialised)
  disclistFileName: string | null;
  disclistBuffer: ArrayBuffer | null;
  stockFileName: string | null;
  stockBuffer: ArrayBuffer | null;
  offersFileName: string | null;
  offersBuffer: ArrayBuffer | null;
  logFileName: string | null;
  logBuffer: ArrayBuffer | null;
  katanaFileName: string | null;
  katanaBuffer: ArrayBuffer | null;

  // Katana language multi-selection — persisted
  selectedLangs: KatanaLangKey[];
  toggleLang: (lang: KatanaLangKey) => void;
  setSelectedLangs: (langs: KatanaLangKey[]) => void;

  // Run mode — persisted
  appendMode: boolean;
  setAppendMode: (v: boolean) => void;

  // Stock filter — persisted
  minStock: number;
  setMinStock: (v: number) => void;

  // Processing
  processingState: "idle" | "processing" | "success" | "error";
  error: string | null;

  // Results — persisted
  results: CampaignOfferRow[];
  /** Ordered column keys present in current results (drives table column order) */
  activeColumnKeys: string[];
  matchedCount: number;
  skippedCount: number;

  // Table UI — persisted
  search: string;
  sortColumn: string | null;
  sortDirection: "asc" | "desc";
  /** Which of activeColumnKeys are visible */
  visibleColumns: string[];

  // File actions
  setDisclistFile: (name: string, buf: ArrayBuffer) => void;
  removeDisclistFile: () => void;
  setStockFile: (name: string, buf: ArrayBuffer) => void;
  removeStockFile: () => void;
  setOffersFile: (name: string, buf: ArrayBuffer) => void;
  removeOffersFile: () => void;
  setLogFile: (name: string, buf: ArrayBuffer) => void;
  removeLogFile: () => void;
  setKatanaFile: (name: string, buf: ArrayBuffer) => void;
  removeKatanaFile: () => void;

  // Processing actions
  setProcessing: () => void;
  setError: (err: string) => void;
  /**
   * @param columnKeys  Ordered column keys from the new result rows
   */
  setResults: (
    rows: CampaignOfferRow[],
    matched: number,
    skipped: number,
    columnKeys: string[]
  ) => void;

  // Table actions
  setSearch: (v: string) => void;
  toggleSort: (col: string) => void;
  toggleColumn: (col: string) => void;
  showAllColumns: () => void;
  hideAllColumns: () => void;
  updateRow: (index: number, patch: Partial<CampaignOfferRow>) => void;

  resetAll: () => void;
}

export const useOPMarketingStore = create<OPMarketingState>()(
  persist(
    (set) => ({
      country: "AT",
      shopName: "Bazar Bizar",
      setCountry: (country) => set({ country }),
      setShopName: (shopName) => set({ shopName }),

      disclistFileName: null,
      disclistBuffer: null,
      stockFileName: null,
      stockBuffer: null,
      offersFileName: null,
      offersBuffer: null,
      logFileName: null,
      logBuffer: null,
      katanaFileName: null,
      katanaBuffer: null,

      selectedLangs: [],
      toggleLang: (lang) =>
        set((state) => ({
          selectedLangs: state.selectedLangs.includes(lang)
            ? state.selectedLangs.filter((l) => l !== lang)
            : [...state.selectedLangs, lang],
        })),
      setSelectedLangs: (selectedLangs) => set({ selectedLangs }),

      appendMode: false,
      setAppendMode: (appendMode) => set({ appendMode }),

      minStock: 3,
      setMinStock: (minStock) => set({ minStock: Math.max(1, Math.floor(minStock)) }),

      processingState: "idle",
      error: null,
      results: [],
      activeColumnKeys: [],
      matchedCount: 0,
      skippedCount: 0,

      search: "",
      sortColumn: null,
      sortDirection: "asc",
      visibleColumns: [],

      setDisclistFile: (name, buf) =>
        set({ disclistFileName: name, disclistBuffer: buf, error: null }),
      removeDisclistFile: () =>
        set({ disclistFileName: null, disclistBuffer: null }),

      setStockFile: (name, buf) =>
        set({ stockFileName: name, stockBuffer: buf, error: null }),
      removeStockFile: () =>
        set({ stockFileName: null, stockBuffer: null }),

      setOffersFile: (name, buf) =>
        set({ offersFileName: name, offersBuffer: buf, error: null }),
      removeOffersFile: () =>
        set({ offersFileName: null, offersBuffer: null }),

      setLogFile: (name, buf) =>
        set({ logFileName: name, logBuffer: buf, error: null }),
      removeLogFile: () =>
        set({ logFileName: null, logBuffer: null }),

      setKatanaFile: (name, buf) =>
        set({ katanaFileName: name, katanaBuffer: buf, error: null }),
      removeKatanaFile: () =>
        set({ katanaFileName: null, katanaBuffer: null }),

      setProcessing: () => set({ processingState: "processing", error: null }),
      setError: (error) => set({ processingState: "error", error }),

      setResults: (newRows, matched, skipped, newColKeys) =>
        set((state) => {
          if (state.appendMode && state.results.length > 0) {
            // Merge column keys: preserve existing order, append any new keys
            const merged = [...state.activeColumnKeys];
            for (const k of newColKeys) {
              if (!merged.includes(k)) merged.push(k);
            }
            // Make newly-added columns visible too
            const mergedVisible = [...state.visibleColumns];
            for (const k of newColKeys) {
              if (!mergedVisible.includes(k)) mergedVisible.push(k);
            }
            return {
              processingState: "success",
              results: [...state.results, ...newRows],
              activeColumnKeys: merged,
              matchedCount: state.matchedCount + matched,
              skippedCount: state.skippedCount + skipped,
              visibleColumns: mergedVisible,
              error: null,
            };
          }
          // Replace mode
          return {
            processingState: "success",
            results: newRows,
            activeColumnKeys: newColKeys,
            matchedCount: matched,
            skippedCount: skipped,
            visibleColumns: newColKeys,
            error: null,
          };
        }),

      setSearch: (search) => set({ search }),
      toggleSort: (col) =>
        set((state) => {
          if (state.sortColumn === col) {
            if (state.sortDirection === "asc") return { sortDirection: "desc" as const };
            return { sortColumn: null, sortDirection: "asc" as const };
          }
          return { sortColumn: col, sortDirection: "asc" as const };
        }),
      toggleColumn: (col) =>
        set((state) => ({
          visibleColumns: state.visibleColumns.includes(col)
            ? state.visibleColumns.filter((c) => c !== col)
            : [...state.visibleColumns, col],
        })),
      showAllColumns: () =>
        set((state) => ({ visibleColumns: [...state.activeColumnKeys] })),
      hideAllColumns: () => set({ visibleColumns: [] }),
      updateRow: (index, patch) =>
        set((state) => {
          const results = [...state.results];
          results[index] = { ...results[index], ...(patch as Record<string, string | number>) } as CampaignOfferRow;
          return { results };
        }),

      resetAll: () =>
        set({
          disclistFileName: null,
          disclistBuffer: null,
          stockFileName: null,
          stockBuffer: null,
          offersFileName: null,
          offersBuffer: null,
          logFileName: null,
          logBuffer: null,
          katanaFileName: null,
          katanaBuffer: null,
          processingState: "idle",
          error: null,
          results: [],
          activeColumnKeys: [],
          matchedCount: 0,
          skippedCount: 0,
          search: "",
          sortColumn: null,
          sortDirection: "asc",
          visibleColumns: [],
          // keep config/filter settings on reset
        }),
    }),
    {
      name: "op-marketing-v1",
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => ({
        country: state.country,
        shopName: state.shopName,
        selectedLangs: state.selectedLangs,
        appendMode: state.appendMode,
        minStock: state.minStock,
        results: state.results,
        activeColumnKeys: state.activeColumnKeys,
        matchedCount: state.matchedCount,
        skippedCount: state.skippedCount,
        search: state.search,
        sortColumn: state.sortColumn,
        sortDirection: state.sortDirection,
        visibleColumns: state.visibleColumns,
      }),
    }
  )
);
