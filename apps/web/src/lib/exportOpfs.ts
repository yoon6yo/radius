const ROOT = "transfers";

/** Peer-supplied names are shown and saved verbatim otherwise; drop control and bidi override chars. */
// eslint-disable-next-line no-control-regex
const UNSAFE_NAME_CHARS = /[\u0000-\u001f\u007f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;
export function safeName(name: string): string {
  return name.replace(UNSAFE_NAME_CHARS, "");
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
    a.download = safeName(parts[parts.length - 1]!);
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
