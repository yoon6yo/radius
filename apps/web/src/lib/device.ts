import type { DeviceIdentity } from "@radius/engine";
import { toBase64Url } from "@radius/protocol";
import { kvGet, kvPut, openDb, request } from "./kv";

const KEY = "identity";

interface StoredIdentity {
  keys: CryptoKeyPair;
  name: string;
}

const NAMES = { adj: ["파란", "맑은", "고요한", "빠른", "푸른", "깊은"], noun: ["고래", "돌고래", "파도", "바다", "하늘", "물결"] };

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)] as T;
}

function randomName(): string {
  return `${pick(NAMES.adj)} ${pick(NAMES.noun)}`;
}

async function loadOrCreate(): Promise<StoredIdentity> {
  let db: IDBDatabase | null = null;
  try {
    db = await openDb();
    const found = await request<StoredIdentity | undefined>(db, "readonly", (s) => s.get(KEY));
    if (found) return found;
  } catch {
    // storage unavailable (private mode etc.): fall through to an ephemeral identity
  }
  // Private key is non-extractable: it can sign but never leave the browser.
  const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const created: StoredIdentity = { keys, name: randomName() };
  try {
    if (db) await request(db, "readwrite", (s) => s.put(created, KEY));
  } catch {
    // keep going with the in-memory identity
  }
  db?.close();
  return created;
}

export async function loadIdentity(): Promise<DeviceIdentity> {
  const { keys, name } = await loadOrCreate();
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", keys.publicKey));
  return {
    publicKey: toBase64Url(spki),
    name,
    sign: async (message) =>
      toBase64Url(new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, keys.privateKey, message))),
  };
}

/** Persists a new display name on the stored identity. Returns false when there is nothing to update. */
export async function saveDeviceName(name: string): Promise<boolean> {
  const stored = await kvGet<StoredIdentity>(KEY);
  if (!stored) return false;
  await kvPut(KEY, { ...stored, name });
  return true;
}
