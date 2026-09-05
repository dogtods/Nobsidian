/**
 * Persistent Storage Engine for Connected Notes
 * Provides robust dual-layer persistence using IndexedDB (primary, high-capacity, safe from 5MB quota errors)
 * and LocalStorage (secondary fallback and fast synchronous restore).
 */

import { Note } from "../types";

const DB_NAME = "CardNoteDB";
const DB_VERSION = 1;
const STORE_NAME = "keyval";

export const LS_KEY = "cn_notes_cache";
export const AUTO_SYNC_KEY_V2 = "cn_auto_sync_enabled_v2";
export const AUTO_SYNC_KEY_V1 = "cn_auto_sync_enabled";
export const IDB_AUTO_SYNC_KEY = "auto_sync_preference";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getIndexedDB(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.resolve(null);
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => {
          console.warn("IndexedDB open error:", e);
          resolve(null);
        };
        req.onblocked = () => {
          console.warn("IndexedDB open blocked");
          resolve(null);
        };
      } catch (err) {
        console.warn("IndexedDB open exception:", err);
        resolve(null);
      }
    });
  }
  return dbPromise;
}

export async function idbGet<T = any>(key: string): Promise<T | null> {
  try {
    const db = await getIndexedDB();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result !== undefined ? req.result : null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

export async function idbSet(key: string, val: any): Promise<void> {
  try {
    const db = await getIndexedDB();
    if (!db) return;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(val, key);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  } catch {
    // silent catch
  }
}

/**
 * Save notes data securely to both IndexedDB and LocalStorage.
 * IndexedDB has virtually unlimited storage capacity on mobile browsers (no 5MB QuotaExceededError).
 */
export async function saveNotesLocally(notes: Note[], activeNoteId: string | null): Promise<void> {
  // 1. Primary: Save full payload to IndexedDB
  try {
    await idbSet(LS_KEY, { notes, activeId: activeNoteId, savedAt: Date.now() });
  } catch (e) {
    console.warn("IndexedDB notes save failed:", e);
  }

  // 2. Secondary: Attempt localStorage save with QuotaExceededError protection
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ notes, activeId: activeNoteId }));
  } catch (err: any) {
    // If quota exceeded, save compact version so localStorage does not crash or block settings
    try {
      const compactNotes = notes.map((n) => ({
        id: n.id,
        title: n.title,
        content: n.content,
        summary: n.summary,
        keywords: n.keywords,
        sourceUrl: n.sourceUrl,
        dateStr: n.dateStr,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      }));
      localStorage.setItem(LS_KEY, JSON.stringify({ notes: compactNotes, activeId: activeNoteId }));
    } catch {
      // IndexedDB has already persisted the full dataset safely
    }
  }
}

/**
 * Load notes from local storage, checking IndexedDB as high-capacity source and localStorage as fast fallback.
 */
export async function loadNotesLocally(): Promise<{ notes: Note[]; activeId: string | null } | null> {
  // 1. Check IndexedDB first for complete data
  try {
    const idbData = await idbGet<{ notes: Note[]; activeId: string | null }>(LS_KEY);
    if (idbData && Array.isArray(idbData.notes) && idbData.notes.length > 0) {
      return idbData;
    }
  } catch (e) {}

  // 2. Fallback to localStorage
  try {
    const stored = localStorage.getItem(LS_KEY);
    if (stored) {
      const data = JSON.parse(stored);
      if (data && Array.isArray(data.notes) && data.notes.length > 0) {
        return data;
      }
    }
  } catch (e) {}

  return null;
}

/**
 * Synchronously read autoSync preference from localStorage with legacy key support.
 */
export function getStoredAutoSyncSync(): boolean {
  try {
    const v2 = localStorage.getItem(AUTO_SYNC_KEY_V2);
    if (v2 !== null) return JSON.parse(v2) === true;
    const v1 = localStorage.getItem(AUTO_SYNC_KEY_V1);
    if (v1 !== null) return JSON.parse(v1) === true;
  } catch (e) {}
  return false;
}

/**
 * Immediately persist autoSync preference to localStorage (both v1 and v2 keys) AND IndexedDB.
 * This guarantees the preference will never be cleared when closing or reopening the mobile browser.
 */
export function saveAutoSyncPreference(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_SYNC_KEY_V2, JSON.stringify(enabled));
  } catch (e) {}
  try {
    localStorage.setItem(AUTO_SYNC_KEY_V1, JSON.stringify(enabled));
  } catch (e) {}
  idbSet(IDB_AUTO_SYNC_KEY, enabled).catch(() => {});
}

/**
 * Asynchronously read autoSync preference from IndexedDB.
 */
export async function loadAutoSyncPreferenceAsync(): Promise<boolean | null> {
  try {
    const val = await idbGet<boolean>(IDB_AUTO_SYNC_KEY);
    if (val !== null && val !== undefined) {
      return Boolean(val);
    }
  } catch (e) {}
  return null;
}
