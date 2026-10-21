// OPFS writer: createSyncAccessHandle is only available in dedicated workers.
interface WorkerScope {
  onmessage: ((e: MessageEvent<Req>) => void) | null;
  postMessage(msg: unknown): void;
}
const scope = self as unknown as WorkerScope;

// Not in TS's DOM lib yet.
interface FileSystemSyncAccessHandle {
  read(buf: Uint8Array, opts: { at: number }): number;
  getSize(): number;
  write(data: Uint8Array, opts: { at: number }): number;
  truncate(size: number): void;
  flush(): void;
  close(): void;
}
type SyncFileHandle = FileSystemFileHandle & {
  createSyncAccessHandle(): Promise<FileSystemSyncAccessHandle>;
};

type Req =
  | { seq: number; op: "resume"; dir: string; files: { path: string; size: number }[] }
  | { seq: number; op: "record"; dir: string; idx: number; block: number; hash: Uint8Array | null }
  | { seq: number; op: "complete"; dir: string }
  | { seq: number; op: "read"; dir: string; idx: number; offset: number; length: number }
  | { seq: number; op: "open"; dir: string; idx: number; path: string; size: number }
  | { seq: number; op: "write"; dir: string; idx: number; offset: number; data: Uint8Array }
  | { seq: number; op: "close"; dir: string; idx: number }
  | { seq: number; op: "abort"; dir: string };

// Layout: transfers/<dir>/{meta.json, log.bin, data/<peer paths>}. Peer paths never touch meta/log.
// log.bin = append-only records: u16 file | u32 block | 32B hash (all zero = revoked).
const ROOT = "transfers";
const RECORD_BYTES = 38;
const HASH_BYTES = 32;
const handles = new Map<string, FileSystemSyncAccessHandle>();
const logs = new Map<string, FileSystemSyncAccessHandle>();
const key = (dir: string, idx: number) => `${dir}|${idx}`;

async function transferDir(dir: string): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  const base = await root.getDirectoryHandle(ROOT, { create: true });
  return base.getDirectoryHandle(dir, { create: true });
}

async function removeDir(dir: string): Promise<void> {
  for (const k of [...handles.keys()]) if (k.startsWith(`${dir}|`)) closeHandle(k);
  closeLog(dir);
  const root = await navigator.storage.getDirectory();
  const base = await root.getDirectoryHandle(ROOT, { create: true });
  await base.removeEntry(dir, { recursive: true }).catch(() => undefined);
}

function closeLog(dir: string): void {
  const l = logs.get(dir);
  if (!l) return;
  l.flush();
  l.close();
  logs.delete(dir);
}

interface Meta {
  files: { path: string; size: number }[];
  touched: number;
  completed: boolean;
}

async function writeMeta(d: FileSystemDirectoryHandle, meta: Meta): Promise<void> {
  const h = await ((await d.getFileHandle("meta.json", { create: true })) as SyncFileHandle).createSyncAccessHandle();
  const bytes = new TextEncoder().encode(JSON.stringify(meta));
  h.truncate(0);
  h.write(bytes, { at: 0 });
  h.flush();
  h.close();
}

async function readMeta(d: FileSystemDirectoryHandle): Promise<Meta | null> {
  try {
    const m = JSON.parse(await (await (await d.getFileHandle("meta.json")).getFile()).text()) as Meta;
    return Array.isArray(m.files) && typeof m.touched === "number" ? m : null;
  } catch {
    return null;
  }
}

/** Replays log.bin; a torn trailing record (tab killed mid-append) is ignored. */
function replay(log: FileSystemSyncAccessHandle): [number, number, Uint8Array][] {
  const size = log.getSize();
  const buf = new Uint8Array(size - (size % RECORD_BYTES));
  log.read(buf, { at: 0 });
  const latest = new Map<string, [number, number, Uint8Array]>();
  const dv = new DataView(buf.buffer);
  for (let o = 0; o < buf.length; o += RECORD_BYTES) {
    const f = dv.getUint16(o);
    const b = dv.getUint32(o + 2);
    const h = buf.slice(o + 6, o + RECORD_BYTES);
    const k = `${f}:${b}`;
    if (h.every((v) => v === 0)) latest.delete(k);
    else latest.set(k, [f, b, h]);
  }
  return [...latest.values()];
}

async function resume(r: Extract<Req, { op: "resume" }>): Promise<[number, number, Uint8Array][]> {
  let d = await transferDir(r.dir);
  const meta = await readMeta(d);
  if (!meta || meta.completed || JSON.stringify(meta.files) !== JSON.stringify(r.files)) {
    await removeDir(r.dir);
    d = await transferDir(r.dir);
  }
  await writeMeta(d, { files: r.files, touched: Date.now(), completed: false });
  const log = await ((await d.getFileHandle("log.bin", { create: true })) as SyncFileHandle).createSyncAccessHandle();
  logs.set(r.dir, log);
  return replay(log);
}

function record(r: Extract<Req, { op: "record" }>): void {
  const log = logs.get(r.dir);
  if (!log) throw new Error("no_log");
  // Data must be durable before the log claims the block is verified.
  handles.get(key(r.dir, r.idx))?.flush();
  const rec = new Uint8Array(RECORD_BYTES);
  const dv = new DataView(rec.buffer);
  dv.setUint16(0, r.idx);
  dv.setUint32(2, r.block);
  if (r.hash) {
    if (r.hash.length !== HASH_BYTES) throw new Error("bad_hash");
    rec.set(r.hash, 6);
  }
  if (log.write(rec, { at: log.getSize() }) !== RECORD_BYTES) throw new Error("short_write");
  log.flush();
}

async function complete(dir: string): Promise<void> {
  closeLog(dir);
  const d = await transferDir(dir);
  const meta = await readMeta(d);
  if (meta) await writeMeta(d, { ...meta, completed: true, touched: Date.now() });
}

async function open(r: Extract<Req, { op: "open" }>): Promise<void> {
  let cur = await (await transferDir(r.dir)).getDirectoryHandle("data", { create: true });
  const parts = r.path.split("/");
  for (const p of parts.slice(0, -1)) cur = await cur.getDirectoryHandle(p, { create: true });
  const file = (await cur.getFileHandle(parts[parts.length - 1]!, { create: true })) as SyncFileHandle;
  const h = await file.createSyncAccessHandle();
  if (h.getSize() !== r.size) h.truncate(r.size);
  handles.set(key(r.dir, r.idx), h);
}

function closeHandle(k: string): void {
  const h = handles.get(k);
  if (!h) return;
  h.flush();
  h.close();
  handles.delete(k);
}

async function run(r: Req): Promise<unknown> {
  switch (r.op) {
    case "resume":
      return resume(r);
    case "record":
      return record(r);
    case "complete":
      return complete(r.dir);
    case "read": {
      const h = handles.get(key(r.dir, r.idx));
      if (!h) throw new Error("not_open");
      const buf = new Uint8Array(r.length);
      if (h.read(buf, { at: r.offset }) !== r.length) throw new Error("short_read");
      return buf;
    }
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
    case "abort":
      return removeDir(r.dir);
  }
}

scope.onmessage = (e) => {
  const r = e.data;
  run(r).then(
    (result) => scope.postMessage({ seq: r.seq, ok: true, result }),
    (err: unknown) => scope.postMessage({ seq: r.seq, ok: false, error: String(err) }),
  );
};
