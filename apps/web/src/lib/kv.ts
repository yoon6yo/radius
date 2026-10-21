export const DB_NAME = "radius";
export const STORE = "kv";

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function request<T>(db: IDBDatabase, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = fn(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Best-effort read/write: storage can be unavailable (private mode), in which case callers fall back to memory. */
export async function kvGet<T>(key: string): Promise<T | undefined> {
  try {
    const db = await openDb();
    try {
      return await request<T | undefined>(db, "readonly", (s) => s.get(key));
    } finally {
      db.close();
    }
  } catch {
    return undefined;
  }
}

export async function kvPut(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDb();
    try {
      await request(db, "readwrite", (s) => s.put(value, key));
    } finally {
      db.close();
    }
  } catch {
    // keep the in-memory value
  }
}
