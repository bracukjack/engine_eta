import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { idbStorage } from "@/lib/idb-storage";
import type { CampaignOfferRow, KatanaLangKey } from "./types";
import { ALL_COLUMN_KEYS } from "./types";

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

  // Katana language selection — persisted
  selectedLang: KatanaLangKey;
  setSelectedLang: (lang: KatanaLangKey) => void;

  // Processing
  processingState: "idle" | "processing" | "success" | "error";
  error: string | null;

  // Results — persisted
  results: CampaignOfferRow[];
  matchedCount: number;
  skippedCount: number;

  // Table UI — persisted
  search: string;
  sortColumn: keyof CampaignOfferRow | null;
  sortDirection: "asc" | "desc";
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
  setResults: (rows: CampaignOfferRow[], matched: number, skipped: number) => void;

  // Table actions
  setSearch: (v: string) => void;
  toggleSort: (col: keyof CampaignOfferRow) => void;
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
      shopName: "",
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

      selectedLang: "Name_en",
      setSelectedLang: (selectedLang) => set({ selectedLang }),

      processingState: "idle",
      error: null,
      results: [],
      matchedCount: 0,
      skippedCount: 0,

      search: "",
      sortColumn: null,
      sortDirection: "asc",
      visibleColumns: [...ALL_COLUMN_KEYS],

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
      setResults: (results, matchedCount, skippedCount) =>
        set({ processingState: "success", results, matchedCount, skippedCount, error: null }),

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
      showAllColumns: () => set({ visibleColumns: [...ALL_COLUMN_KEYS] }),
      hideAllColumns: () => set({ visibleColumns: [] }),
      updateRow: (index, patch) =>
        set((state) => {
          const results = [...state.results];
          results[index] = { ...results[index], ...patch };
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
          matchedCount: 0,
          skippedCount: 0,
          search: "",
          sortColumn: null,
          sortDirection: "asc",
          visibleColumns: [...ALL_COLUMN_KEYS],
        }),
    }),
    {
      name: "op-marketing-v1",
      storage: createJSONStorage(() => idbStorage),
      partialize: (state) => ({
        country: state.country,
        shopName: state.shopName,
        selectedLang: state.selectedLang,
        results: state.results,
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
