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

export interface TransferView {
  direction: "send" | "receive";
  name: string;
  done: number;
  total: number;
  status: "waiting" | "active" | "complete" | "failed" | "rejected" | "cancelled";
  /** Received and verified; the user starts the download with this (needs a click gesture). */
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
    const name = files.length === 1 ? files[0]!.name : `${files.length} files`;
    const total = files.reduce((n, f) => n + f.size, 0);
    const view = (status: TransferView["status"], done = 0) =>
      this.opts.onView({ direction: "send", name, done, total, status });
    if (files.length > MAX_OFFER_FILES) return view("failed");
    const sender = new Sender({
      id: crypto.getRandomValues(new Uint32Array(1))[0]!,
      link: this.link(),
      codec: zstdCodec,
      files: files.map((f) => ({
        path: f.webkitRelativePath || f.name,
        source: { size: f.size, read: (o, l) => f.slice(o, o + l).arrayBuffer() },
      })),
      onProgress: (done) => view("active", done),
    });
    this.sender = sender;
    view("waiting");
    sender.start();
    void sender.result.then((r) => {
      if (this.sender === sender) this.sender = null;
      view(statusOf(r), r.status === "complete" ? total : 0);
    });
  }

  private startReceiving(): void {
    const sink = new OpfsSink(this.opts.peerId);
    let name = "";
    let total = 0;
    let paths: string[] = [];
    const view = (status: TransferView["status"], done = 0) =>
      this.opts.onView({ direction: "receive", name, done, total, status });
    const receiver = new Receiver({
      sink,
      codec: zstdCodec,
      send: (m) => this.conn?.sendControl(JSON.stringify(m)) ?? false,
      onOffer: async (files, resumedBytes) => {
        total = files.reduce((n, f) => n + f.size, 0);
        name = files.length === 1 ? safeName(files[0]!.path) : `${files.length} files`;
        paths = files.map((f) => f.path);
        if ((await freeBytes()) < total - resumedBytes) return "no_space";
        const asking = (this.asking = new AbortController());
        const ok = await this.opts.ask(files, asking.signal).finally(() => {
          if (this.asking === asking) this.asking = null;
        });
        if (!ok) return "declined";
        view("active");
        return "accept";
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
      this.opts.onView({
        direction: "receive",
        name,
        done: total,
        total,
        status: "complete",
        save: async () => {
          await exportTransfer(dir, paths);
          if (saved) return;
          saved = true;
          await completeStaging(dir);
        },
      });
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
