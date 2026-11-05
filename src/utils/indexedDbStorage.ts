import { DOEReport } from '../types/doe';
import { sanitizeReportList } from './doeUtils';

const IDB_NAME = 'doe_work_permit_idb_v1';
const IDB_VERSION = 1;
const STORE_REPORTS = 'reports_store';
const KEY_ACTIVE_REPORTS = 'active_reports';

function openReportsDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_REPORTS)) {
          db.createObjectStore(STORE_REPORTS);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveReportsToIndexedDB(reports: DOEReport[]): Promise<void> {
  const db = await openReportsDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_REPORTS, 'readwrite');
      const store = tx.objectStore(STORE_REPORTS);
      store.put(reports, KEY_ACTIVE_REPORTS);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

export async function loadReportsFromIndexedDB(): Promise<DOEReport[]> {
  const db = await openReportsDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_REPORTS, 'readonly');
      const store = tx.objectStore(STORE_REPORTS);
      const req = store.get(KEY_ACTIVE_REPORTS);
      req.onsuccess = () => {
        db.close();
        const raw = req.result;
        if (Array.isArray(raw)) {
          resolve(sanitizeReportList(raw));
        } else {
          resolve([]);
        }
      };
      req.onerror = () => {
        db.close();
        resolve([]);
      };
    } catch {
      db.close();
      resolve([]);
    }
  });
}
