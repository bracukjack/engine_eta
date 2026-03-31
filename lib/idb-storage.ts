/**
 * IndexedDB storage adapter for Zustand's persist middleware.
 * Data automatically expires after EXPIRY_MS (30 days).
 * Falls back silently to no-op on SSR or if IndexedDB is unavailable.
 */

const DB_NAME = "engine_eta";
const STORE_NAME = "persist";
const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

let _db: IDBDatabase | null = null;
let _dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);
  if (_dbPromise) return _dbPromise;

  _dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      _db = request.result;
      resolve(_db);
    };
    request.onerror = () => {
      _dbPromise = null;
      reject(request.error);
    };
  });

  return _dbPromise;
}

export const idbStorage = {
  async getItem(name: string): Promise<string | null> {
    if (typeof window === "undefined" || !window.indexedDB) return null;
    try {
      const db = await openDB();
      return new Promise((resolve) => {
        const req = db
          .transaction(STORE_NAME, "readonly")
          .objectStore(STORE_NAME)
          .get(name);
        req.onsuccess = () => {
          const entry = req.result as { v: string; exp: number } | undefined;
          if (!entry || Date.now() > entry.exp) {
            resolve(null);
          } else {
            resolve(entry.v);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch {
      return null;
    }
  },

  async setItem(name: string, value: string): Promise<void> {
    if (typeof window === "undefined" || !window.indexedDB) return;
    try {
      const db = await openDB();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(
          { v: value, exp: Date.now() + EXPIRY_MS },
          name
        );
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      /* ignore write errors */
    }
  },

  async removeItem(name: string): Promise<void> {
    if (typeof window === "undefined" || !window.indexedDB) return;
    try {
      const db = await openDB();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(name);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    } catch {
      /* ignore delete errors */
    }
  },
};
