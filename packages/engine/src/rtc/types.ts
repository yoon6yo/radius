export type RtcSignal =
  | { t: "sdp"; description: { type: "offer" | "answer"; sdp: string } }
  | { t: "ice"; candidate: RTCIceCandidateInit | null };

export type PeerState = "connecting" | "connected" | "reconnecting" | "failed" | "closed";

export interface PeerConnectionOptions {
  selfId: string;
  peerId: string;
  /** Relays an opaque payload to the peer (e.g. SignalClient.sendSignal). */
  sendSignal(data: unknown): void;
  iceServers?: RTCIceServer[];
  /** Number of data channels besides control. Default 4. */
  dataChannels?: number;
  onState?(state: PeerState): void;
  onControl?(data: string | ArrayBuffer): void;
  onData?(index: number, data: string | ArrayBuffer): void;
  /** ICE `disconnected` is tolerated this long before restarting. Default 3000. */
  disconnectGraceMs?: number;
  /** Consecutive failed restarts before giving up. Default 5. */
  maxRestarts?: number;
  /** Delay before the given zero-based restart attempt. */
  restartBackoffMs?(attempt: number): number;
  RTCPeerConnectionImpl?: new (config: RTCConfiguration) => RTCPeerConnection;
}
