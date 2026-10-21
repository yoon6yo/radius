import { MAX_FRIENDS } from "@radius/protocol";
import { kvGet, kvPut } from "./kv";

export interface SavedDevice {
  id: string;
  name: string;
  savedAt: number;
}

const KEY = "friends";

/** Adds or refreshes a device; the oldest entries are dropped once the server-side watch limit is reached. */
export function upsertSaved(list: readonly SavedDevice[], peer: { id: string; name: string }, now: number): SavedDevice[] {
  const existing = list.find((d) => d.id === peer.id);
  const next = existing
    ? list.map((d) => (d.id === peer.id ? { ...d, name: peer.name } : d))
    : [...list, { id: peer.id, name: peer.name, savedAt: now }];
  return next.length > MAX_FRIENDS ? [...next].sort((a, b) => b.savedAt - a.savedAt).slice(0, MAX_FRIENDS) : next;
}

export function removeSaved(list: readonly SavedDevice[], id: string): SavedDevice[] {
  return list.filter((d) => d.id !== id);
}

export async function loadSaved(): Promise<SavedDevice[]> {
  const raw = await kvGet<unknown>(KEY);
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (d): d is SavedDevice =>
      typeof d === "object" && d !== null && typeof (d as SavedDevice).id === "string" && typeof (d as SavedDevice).name === "string",
  );
}

export function persistSaved(list: readonly SavedDevice[]): Promise<void> {
  return kvPut(KEY, list);
}
