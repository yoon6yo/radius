// OPFS writer: createSyncAccessHandle is only available in dedicated workers.
interface WorkerScope {
  onmessage: ((e: MessageEvent<Req>) => void) | null;
  postMessage(msg: unknown): void;
}
const scope = self as unknown as WorkerScope;

// Not in TS's DOM lib yet.
interface FileSystemSyncAccessHandle {
  write(data: Uint8Array, opts: { at: number }): number;
  truncate(size: number): void;
  flush(): void;
  close(): void;
}
type SyncFileHandle = FileSystemFileHandle & {
  createSyncAccessHandle(): Promise<FileSystemSyncAccessHandle>;
};

type Req =
  | { seq: number; op: "open"; dir: string; idx: number; path: string; size: number }
  | { seq: number; op: "write"; dir: string; idx: number; offset: number; data: Uint8Array }
  | { seq: number; op: "close"; dir: string; idx: number }
  | { seq: number; op: "abort"; dir: string };

const ROOT = "transfers";
const handles = new Map<string, FileSystemSyncAccessHandle>();
const key = (dir: string, idx: number) => `${dir}|${idx}`;

async function transferDir(dir: string): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const base = await root.getDirectoryHandle(ROOT, { create: true });
  return base.getDirectoryHandle(dir, { create: true });
}

async function open(r: Extract<Req, { op: "open" }>): Promise<void> {
  let cur = await transferDir(r.dir);
  const parts = r.path.split("/");
  for (const p of parts.slice(0, -1)) cur = await cur.getDirectoryHandle(p, { create: true });
  const file = (await cur.getFileHandle(parts[parts.length - 1]!, { create: true })) as SyncFileHandle;
  const h = await file.createSyncAccessHandle();
  h.truncate(r.size);
  handles.set(key(r.dir, r.idx), h);
}

function closeHandle(k: string): void {
  const h = handles.get(k);
  if (!h) return;
  h.flush();
  h.close();
  handles.delete(k);
}

async function run(r: Req): Promise<void> {
  switch (r.op) {
    case "open":
      return open(r);
    case "write": {
      const h = handles.get(key(r.dir, r.idx));
      if (!h) throw new Error("not_open");
      const n = h.write(r.data, { at: r.offset });
      if (n !== r.data.length) throw new Error("short_write");
      return;
    }
    case "close":
      return closeHandle(key(r.dir, r.idx));
    case "abort": {
      for (const k of [...handles.keys()]) if (k.startsWith(`${r.dir}|`)) closeHandle(k);
      const root = await navigator.storage.getDirectory();
      const base = await root.getDirectoryHandle(ROOT, { create: true });
      await base.removeEntry(r.dir, { recursive: true }).catch(() => undefined);
    }
  }
}

scope.onmessage = (e) => {
  const r = e.data;
  run(r).then(
    () => scope.postMessage({ seq: r.seq, ok: true }),
    (err: unknown) => scope.postMessage({ seq: r.seq, ok: false, error: String(err) }),
  );
};
