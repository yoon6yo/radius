import { isPolite, parseRtcSignal } from "./negotiation";
import type { PeerConnectionOptions, PeerState, RtcSignal } from "./types";

const DEFAULT_STUN = "stun:stun.l.google.com:19302";
const CONTROL_ID = 0;

function defaultRestartBackoff(attempt: number): number {
  return Math.min(10_000, 1000 * 2 ** attempt);
}

/**
 * One peer link: perfect negotiation, a negotiated control channel (id 0)
 * and N negotiated data channels (ids 1..N), with ICE restart on connectivity loss.
 */
export class PeerConnection {
  private readonly pc: RTCPeerConnection;
  private readonly polite: boolean;
  private readonly control: RTCDataChannel;
  private readonly data: RTCDataChannel[] = [];
  private readonly opts: PeerConnectionOptions;
  private state_: PeerState = "connecting";
  private everConnected = false;
  private makingOffer = false;
  private ignoreOffer = false;
  private restartAttempt = 0;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(opts: PeerConnectionOptions) {
    this.opts = opts;
    this.polite = isPolite(opts.selfId, opts.peerId);
    const Impl = opts.RTCPeerConnectionImpl ?? RTCPeerConnection;
    this.pc = new Impl({ iceServers: opts.iceServers ?? [{ urls: DEFAULT_STUN }] });

    this.control = this.openChannel("control", CONTROL_ID, (d) => opts.onControl?.(d));
    const n = opts.dataChannels ?? 4;
    for (let i = 0; i < n; i++) {
      this.data.push(this.openChannel(`data-${i}`, i + 1, (d) => opts.onData?.(i, d)));
    }

    this.pc.onnegotiationneeded = () => void this.negotiate();
    this.pc.onicecandidate = (e) => this.sendRtc({ t: "ice", candidate: e.candidate?.toJSON() ?? null });
    this.pc.oniceconnectionstatechange = () => this.onIceState();
  }

  get state(): PeerState {
    return this.state_;
  }

  sendControl(data: string | ArrayBuffer): boolean {
    return this.trySend(this.control, data);
  }

  sendData(index: number, data: string | ArrayBuffer): boolean {
    const ch = this.data[index];
    return ch !== undefined && this.trySend(ch, data);
  }

  /** Feed a payload received from the signaling relay. Malformed input is dropped. */
  async handleSignal(raw: unknown): Promise<void> {
    const sig = parseRtcSignal(raw);
    if (!sig || this.state_ === "closed") return;
    try {
      if (sig.t === "sdp") await this.onRemoteDescription(sig.description);
      else if (sig.candidate) await this.onRemoteCandidate(sig.candidate);
    } catch {
      this.setState("failed");
    }
  }

  close(): void {
    if (this.state_ === "closed") return;
    this.clearTimers();
    this.setState("closed");
    for (const ch of [this.control, ...this.data]) ch.onclose = null;
    this.pc.close();
  }

  private openChannel(
    label: string,
    id: number,
    onMessage: (d: string | ArrayBuffer) => void,
  ): RTCDataChannel {
    const ch = this.pc.createDataChannel(label, { negotiated: true, id, ordered: true });
    ch.binaryType = "arraybuffer";
    ch.onmessage = (e: MessageEvent<string | ArrayBuffer>) => onMessage(e.data);
    ch.onopen = () => this.refresh();
    // A negotiated channel cannot be reopened; losing one means the link is unusable.
    ch.onclose = () => this.setState("failed");
    return ch;
  }

  private trySend(ch: RTCDataChannel, data: string | ArrayBuffer): boolean {
    if (ch.readyState !== "open") return false;
    try {
      ch.send(data as string);
      return true;
    } catch {
      return false;
    }
  }

  private sendRtc(sig: RtcSignal): void {
    if (this.state_ === "closed") return;
    this.opts.sendSignal(sig);
  }

  private async negotiate(): Promise<void> {
    try {
      this.makingOffer = true;
      await this.pc.setLocalDescription();
      this.sendLocalDescription();
    } catch {
      this.setState("failed");
    } finally {
      this.makingOffer = false;
    }
  }

  private sendLocalDescription(): void {
    const d = this.pc.localDescription;
    if (d && (d.type === "offer" || d.type === "answer")) {
      this.sendRtc({ t: "sdp", description: { type: d.type, sdp: d.sdp } });
    }
  }

  private async onRemoteDescription(description: { type: "offer" | "answer"; sdp: string }) {
    const collision =
      description.type === "offer" && (this.makingOffer || this.pc.signalingState !== "stable");
    this.ignoreOffer = !this.polite && collision;
    if (this.ignoreOffer) return;
    await this.pc.setRemoteDescription(description);
    if (description.type === "offer") {
      await this.pc.setLocalDescription();
      this.sendLocalDescription();
    }
  }

  private async onRemoteCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    try {
      await this.pc.addIceCandidate(candidate);
    } catch (e) {
      // Candidates belonging to an ignored offer are expected to be rejected.
      if (!this.ignoreOffer) throw e;
    }
  }

  private onIceState(): void {
    const s = this.pc.iceConnectionState;
    if (s === "connected" || s === "completed") {
      this.clearTimers();
      this.restartAttempt = 0;
    } else if (s === "disconnected") {
      this.graceTimer ??= setTimeout(() => {
        this.graceTimer = null;
        this.scheduleRestart();
      }, this.opts.disconnectGraceMs ?? 3000);
    } else if (s === "failed") {
      this.scheduleRestart();
    }
    this.refresh();
  }

  private scheduleRestart(): void {
    if (this.restartTimer || this.state_ === "closed" || this.state_ === "failed") return;
    if (this.restartAttempt >= (this.opts.maxRestarts ?? 5)) {
      this.setState("failed");
      return;
    }
    const delay = (this.opts.restartBackoffMs ?? defaultRestartBackoff)(this.restartAttempt++);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.state_ === "closed" || this.state_ === "failed") return;
      this.pc.restartIce();
    }, delay);
  }

  private refresh(): void {
    if (this.state_ === "closed" || this.state_ === "failed") return;
    const ice = this.pc.iceConnectionState;
    const open = [this.control, ...this.data].every((c) => c.readyState === "open");
    if ((ice === "connected" || ice === "completed") && open) {
      this.everConnected = true;
      this.setState("connected");
    } else if (this.everConnected) {
      this.setState("reconnecting");
    }
  }

  private setState(s: PeerState): void {
    if (this.state_ === s || this.state_ === "closed") return;
    this.state_ = s;
    if (s === "failed") this.clearTimers();
    this.opts.onState?.(s);
  }

  private clearTimers(): void {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.graceTimer = null;
    this.restartTimer = null;
  }
}
