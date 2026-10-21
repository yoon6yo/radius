const ROOT = "transfers";

/** Peer-supplied names: drop control, format (bidi/zero-width) and line/paragraph separator chars. */
const UNSAFE_NAME_CHARS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
const MAX_NAME_CHARS = 128;
const TAIL_CHARS = 24;
/** Also collapses whitespace runs so padding can't push the real extension out of view. */
export function stripUnsafe(name: string): string {
  return name.replace(UNSAFE_NAME_CHARS, "").replace(/\s+/gu, " ").trim();
}
/** For display only; truncates the middle so the real extension always stays visible. */
export function safeName(name: string): string {
  const clean = stripUnsafe(name);
  if (clean.length <= MAX_NAME_CHARS) return clean;
  return `${clean.slice(0, MAX_NAME_CHARS - TAIL_CHARS - 1)}…${clean.slice(-TAIL_CHARS)}`;
}

async function dirHandle(dir: string): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const base = await root.getDirectoryHandle(ROOT, { create: true });
  return base.getDirectoryHandle(dir);
}

/** Saves each received file via a disk-backed File (no memory copy). Folders are flattened by M6's zip export. */
export async function exportTransfer(dir: string, paths: string[]): Promise<void> {
  const base = await dirHandle(dir);
  for (const path of paths) {
    let cur = base;
    const parts = path.split("/");
    for (const p of parts.slice(0, -1)) cur = await cur.getDirectoryHandle(p);
    const file = await (await cur.getFileHandle(parts[parts.length - 1]!)).getFile();
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = stripUnsafe(parts[parts.length - 1]!);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000);
  }
}

/** Dev-only housekeeping until M4's resumable staging with a 7-day expiry. */
export async function purgeTransfers(): Promise<void> {
  const root = await navigator.storage.getDirectory();
  await root.removeEntry(ROOT, { recursive: true }).catch(() => undefined);
}

export async function freeBytes(): Promise<number> {
  const { quota = 0, usage = 0 } = await navigator.storage.estimate();
  return Math.max(0, quota - usage);
}
