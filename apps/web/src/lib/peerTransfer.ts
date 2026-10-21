import {
  Receiver,
  Sender,
  warmUp,
  type DataLink,
  type PeerConnection,
  type TransferResult,
} from "@radius/engine";
import { MAX_OFFER_FILES, parseTransferMsg, type FileMeta } from "@radius/protocol";
import { exportTransfer, freeBytes, safeName } from "./exportOpfs";
import { OpfsSink, completeStaging } from "./opfsSink";
import { zstdCodec } from "./zstdCodec";

export interface TransferFile {
  /** Display path (peer-supplied names are sanitized before they get here). */
  name: string;
  size: number;
  /** Verified (receive) or acknowledged (send) bytes. */
  done: number;
}

export interface TransferView {
  /** Unique per transfer on this link; lets the UI tell a new transfer from an update. */
  id: number;
  direction: "send" | "receive";
  name: string;
  done: number;
  total: number;
  status: "waiting" | "active" | "complete" | "failed" | "rejected" | "cancelled";
  files: TransferFile[];
  /** Received and verified. The browser may have blocked the automatic download, so this saves again. */
  save?: () => Promise<void>;
}

export interface PeerTransferOptions {
  /** Authenticated id of the remote peer; scopes resumable staging. */
  peerId: string;
  onView(v: TransferView): void;
  /** Consent prompt for an incoming offer; must resolve false and close the prompt once `signal` aborts. */
  ask(files: FileMeta[], signal: AbortSignal): Promise<boolean>;
}

/** Glue between one PeerConnection and the transfer engine (one send + one receive at a time). */
/** Shared across instances so TransferView.id is unique for the page lifetime. */
let nextTransferId = 0;

export class PeerTransfer {
  private conn: PeerConnection | null = null;
  private sender: Sender | null = null;
  private receiver: Receiver | null = null;
  private asking: AbortController | null = null;
  private readonly opts: PeerTransferOptions;
  private warmed = false;

  constructor(opts: PeerTransferOptions) {
    this.opts = opts;
  }

  attach(conn: PeerConnection): void {
    this.conn = conn;
  }

  /** Once per link: the SCTP association survives ICE restarts, so a reconnect needs no second warm-up. */
  warmUp(): void {
    if (this.warmed || !this.conn) return;
    this.warmed = true;
    void warmUp(this.link()).catch(() => undefined);
  }

  handleControl(raw: string): void {
    let msg;
    try {
      msg = parseTransferMsg(JSON.parse(raw));
    } catch {
      return;
    }
    if (!msg) return;
    if (msg.t === "offer") {
      if (!this.receiver) this.startReceiving();
      this.receiver?.handleControl(msg);
      return;
    }
    this.sender?.handleControl(msg);
    this.receiver?.handleControl(msg);
  }

  handleData(buf: ArrayBuffer): void {
    this.receiver?.handleData(buf);
  }

  /** Terminal link state: end both transfers; receiver staging stays on disk for a resume. */
  interrupt(): void {
    this.asking?.abort();
    this.sender?.interrupt();
    this.receiver?.interrupt();
  }

  send(files: File[]): void {
    if (files.length === 0) return;
    this.sender?.interrupt();
    const id = ++nextTransferId;
    const name = files.length === 1 ? files[0]!.name : `${files.length} files`;
    const total = files.reduce((n, f) => n + f.size, 0);
    const fileDone = files.map(() => 0);
    const view = (status: TransferView["status"], done = 0) =>
      this.opts.onView({
        id,
        direction: "send",
        name,
        done,
        total,
        status,
        files: files.map((f, i) => ({ name: f.webkitRelativePath || f.name, size: f.size, done: fileDone[i]! })),
      });
    if (files.length > MAX_OFFER_FILES) return view("failed");
    const sender = new Sender({
      id: crypto.getRandomValues(new Uint32Array(1))[0]!,
      link: this.link(),
      codec: zstdCodec,
      files: files.map((f) => ({
        path: f.webkitRelativePath || f.name,
        source: { size: f.size, read: (o, l) => f.slice(o, o + l).arrayBuffer() },
      })),
      onFileProgress: (f, n) => {
        fileDone[f] = n;
      },
      onProgress: (done) => view("active", done),
    });
    this.sender = sender;
    view("waiting");
    sender.start();
    void sender.result.then((r) => {
      if (this.sender === sender) this.sender = null;
      if (r.status === "complete") files.forEach((f, i) => (fileDone[i] = f.size));
      view(statusOf(r), r.status === "complete" ? total : 0);
    });
  }

  private startReceiving(): void {
    const sink = new OpfsSink(this.opts.peerId);
    const id = ++nextTransferId;
    let name = "";
    let total = 0;
    let paths: string[] = [];
    let sizes: number[] = [];
    let fileDone: number[] = [];
    const filesView = (): TransferFile[] => paths.map((p, i) => ({ name: safeName(p), size: sizes[i]!, done: fileDone[i]! }));
    const view = (status: TransferView["status"], done = 0) =>
      this.opts.onView({ id, direction: "receive", name, done, total, status, files: filesView() });
    const receiver = new Receiver({
      sink,
      codec: zstdCodec,
      send: (m) => this.conn?.sendControl(JSON.stringify(m)) ?? false,
      onOffer: async (files, resumedBytes) => {
        total = files.reduce((n, f) => n + f.size, 0);
        name = files.length === 1 ? safeName(files[0]!.path) : `${files.length} files`;
        paths = files.map((f) => f.path);
        sizes = files.map((f) => f.size);
        fileDone = files.map(() => 0);
        if ((await freeBytes()) < total - resumedBytes) return "no_space";
        const asking = (this.asking = new AbortController());
        const ok = await this.opts.ask(files, asking.signal).finally(() => {
          if (this.asking === asking) this.asking = null;
        });
        if (!ok) return "declined";
        view("active");
        return "accept";
      },
      onFileProgress: (f, n) => {
        fileDone[f] = n;
      },
      onProgress: (done) => view("active", done),
    });
    this.receiver = receiver;
    void receiver.result.then(async (r) => {
      if (this.receiver === receiver) this.receiver = null;
      sink.dispose();
      if (r.status !== "complete") return view(statusOf(r));
      const dir = sink.dir;
      let saved = false;
      const save = async () => {
        await exportTransfer(dir, paths);
        if (saved) return;
        saved = true;
        await completeStaging(dir);
      };
      fileDone = [...sizes];
      this.opts.onView({ id, direction: "receive", name, done: total, total, status: "complete", files: filesView(), save });
      // Browsers may block a download that is not tied to a click; the view keeps `save` for a second try.
      void save().catch(() => undefined);
    });
  }

  private link(): DataLink {
    const c = this.conn;
    if (!c) throw new Error("not_attached");
    return {
      channelCount: c.dataChannelCount,
      isOpen: (i) => c.isDataOpen(i),
      bufferedAmount: (i) => c.bufferedAmount(i),
      sendData: (i, f) => c.sendData(i, f),
      sendControl: (m) => c.sendControl(JSON.stringify(m)),
      waitDrain: (i) => c.waitDrain(i),
      waitReady: () => c.waitReady(),
    };
  }
}

function statusOf(r: TransferResult): TransferView["status"] {
  return r.status;
}
