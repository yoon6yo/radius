import {
  Receiver,
  Sender,
  type DataLink,
  type PeerConnection,
  type TransferResult,
} from "@radius/engine";
import { MAX_OFFER_FILES, parseTransferMsg, type FileMeta } from "@radius/protocol";
import { exportTransfer, freeBytes } from "./exportOpfs";
import { OpfsSink } from "./opfsSink";

export interface TransferView {
  direction: "send" | "receive";
  name: string;
  done: number;
  total: number;
  status: "waiting" | "active" | "complete" | "failed" | "rejected" | "cancelled";
}

export interface PeerTransferOptions {
  onView(v: TransferView): void;
  /** Dev stand-in for the M6 accept sheet. */
  ask(files: FileMeta[]): boolean;
}

/** Glue between one PeerConnection and the transfer engine (one send + one receive at a time). */
export class PeerTransfer {
  private conn: PeerConnection | null = null;
  private sender: Sender | null = null;
  private receiver: Receiver | null = null;
  private readonly opts: PeerTransferOptions;

  constructor(opts: PeerTransferOptions) {
    this.opts = opts;
  }

  attach(conn: PeerConnection): void {
    this.conn = conn;
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

  send(files: File[]): void {
    if (this.sender || files.length === 0) return;
    const name = files.length === 1 ? files[0]!.name : `${files.length} files`;
    const total = files.reduce((n, f) => n + f.size, 0);
    const view = (status: TransferView["status"], done = 0) =>
      this.opts.onView({ direction: "send", name, done, total, status });
    if (files.length > MAX_OFFER_FILES) return view("failed");
    const sender = new Sender({
      id: crypto.getRandomValues(new Uint32Array(1))[0]!,
      link: this.link(),
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
      this.sender = null;
      view(statusOf(r), r.status === "complete" ? total : 0);
    });
  }

  private startReceiving(): void {
    const dir = `${Date.now()}-${crypto.randomUUID()}`;
    const sink = new OpfsSink(dir);
    let name = "";
    let total = 0;
    let paths: string[] = [];
    const view = (status: TransferView["status"], done = 0) =>
      this.opts.onView({ direction: "receive", name, done, total, status });
    const receiver = new Receiver({
      sink,
      send: (m) => this.conn?.sendControl(JSON.stringify(m)) ?? false,
      onOffer: async (files) => {
        total = files.reduce((n, f) => n + f.size, 0);
        name = files.length === 1 ? files[0]!.path : `${files.length} files`;
        paths = files.map((f) => f.path);
        if ((await freeBytes()) < total) return "no_space";
        if (!this.opts.ask(files)) return "declined";
        view("active");
        return "accept";
      },
      onProgress: (done) => view("active", done),
    });
    this.receiver = receiver;
    void receiver.result.then(async (r) => {
      this.receiver = null;
      if (r.status === "complete") await exportTransfer(dir, paths);
      sink.dispose();
      view(statusOf(r), r.status === "complete" ? total : 0);
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
