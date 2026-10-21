import {
  AUTH_CONTEXT,
  fromBase64Url,
  parseServerMsg,
  type PeerInfo,
  type ServerMsg,
} from "@radius/protocol";

export interface DeviceIdentity {
  /** base64url SPKI of the ECDSA P-256 public key. */
  publicKey: string;
  name: string;
  /** Returns a base64url IEEE-P1363 ECDSA/SHA-256 signature. */
  sign(message: Uint8Array<ArrayBuffer>): Promise<string>;
}

export type SignalStatus = "connecting" | "online" | "offline" | "replaced";

export interface SignalClientOptions {
  url: string;
  identity: DeviceIdentity;
  onStatus?(status: SignalStatus): void;
  onPeers?(peers: PeerInfo[]): void;
  onSignal?(from: string, data: unknown): void;
  WebSocketImpl?: typeof WebSocket;
  /** Reconnect delay in ms for the given zero-based attempt. */
  backoffMs?(attempt: number): number;
}

const CLOSE_REPLACED = 4000;

export function defaultBackoff(attempt: number): number {
  const base = Math.min(30_000, 500 * 2 ** attempt);
  return base * (0.5 + Math.random() / 2);
}

export class SignalClient {
  private ws: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private attempt = 0;
  private stopped = true;
  private readonly peerMap = new Map<string, PeerInfo>();
  private selfId_ = "";
  private status_: SignalStatus = "offline";
  private readonly opts: SignalClientOptions;

  constructor(opts: SignalClientOptions) {
    this.opts = opts;
  }

  get id(): string {
    return this.selfId_;
  }
  get status(): SignalStatus {
    return this.status_;
  }
  get peers(): PeerInfo[] {
    return [...this.peerMap.values()];
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.attempt = 0;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.ws?.close();
    this.ws = null;
    this.reset("offline");
  }

  /** Returns false when offline; the caller decides whether to retry. */
  sendSignal(to: string, data: unknown): boolean {
    return this.status_ === "online" && this.trySend({ t: "signal", to, data });
  }

  rename(name: string): boolean {
    return this.status_ === "online" && this.trySend({ t: "rename", name });
  }

  private trySend(msg: unknown): boolean {
    if (this.ws?.readyState !== 1) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  private setStatus(s: SignalStatus): void {
    if (this.status_ === s) return;
    this.status_ = s;
    this.opts.onStatus?.(s);
  }

  private emitPeers(): void {
    this.opts.onPeers?.(this.peers);
  }

  private reset(status: SignalStatus): void {
    const hadPeers = this.peerMap.size > 0;
    this.peerMap.clear();
    this.selfId_ = "";
    this.setStatus(status);
    if (hadPeers) this.emitPeers();
  }

  private connect(): void {
    const WS = this.opts.WebSocketImpl ?? WebSocket;
    this.setStatus("connecting");
    const ws = new WS(this.opts.url);
    this.ws = ws;
    ws.onopen = () => {
      ws.send(JSON.stringify({ t: "hello", pub: this.opts.identity.publicKey, name: this.opts.identity.name }));
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws || typeof ev.data !== "string") return;
      let msg: ServerMsg | null = null;
      try {
        msg = parseServerMsg(JSON.parse(ev.data));
      } catch {
        // ignore malformed frames
      }
      if (msg) void this.handle(ws, msg);
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.stopped) return;
      if (ev.code === CLOSE_REPLACED) {
        this.stopped = true;
        return this.reset("replaced");
      }
      this.reset("offline");
      this.timer = setTimeout(() => {
        this.timer = null;
        this.connect();
      }, (this.opts.backoffMs ?? defaultBackoff)(this.attempt++));
    };
    ws.onerror = () => ws.close();
  }

  private async handle(ws: WebSocket, msg: ServerMsg): Promise<void> {
    switch (msg.t) {
      case "challenge": {
        const nonce = fromBase64Url(msg.nonce);
        if (!nonce) return ws.close();
        const prefix = new TextEncoder().encode(AUTH_CONTEXT);
        const message = new Uint8Array(prefix.length + nonce.length);
        message.set(prefix);
        message.set(nonce, prefix.length);
        try {
          const sig = await this.opts.identity.sign(message);
          if (this.ws === ws) ws.send(JSON.stringify({ t: "auth", sig }));
        } catch {
          ws.close();
        }
        return;
      }
      case "ready":
        this.attempt = 0;
        this.selfId_ = msg.id;
        this.peerMap.clear();
        for (const p of msg.peers) this.peerMap.set(p.id, p);
        this.setStatus("online");
        return this.emitPeers();
      case "peer":
        this.peerMap.set(msg.peer.id, msg.peer);
        return this.emitPeers();
      case "left":
        if (this.peerMap.delete(msg.id)) this.emitPeers();
        return;
      case "signal":
        return this.opts.onSignal?.(msg.from, msg.data);
      case "error":
        return;
    }
  }
}
