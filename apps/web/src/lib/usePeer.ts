import { useCallback, useEffect, useRef, useState } from "react";
import { FAILURE_HINTS, PeerConnection, parseRtcSignal, sdpFingerprint, type PeerState } from "@radius/engine";
import type { IncomingOffer } from "@/components/AcceptDialog";
import { sweepTransfers } from "./exportOpfs";
import { PeerTransfer, type TransferView } from "./peerTransfer";
import type { SignalState } from "./useSignal";

export interface PeerLink {
  state: PeerState;
  /** Echo replies received per channel: "c" = control, "0".. = data index. */
  pongs: Record<string, number>;
  transfer: TransferView | null;
  /** User-facing hint once the link failed; cleared on the next attempt. */
  failure: string | null;
}

/** Dev-only: one PeerConnection per remote peer with a ping/pong echo over every channel. */
export function usePeers(signal: SignalState) {
  const { self, status, sendSignal, setSignalHandler } = signal;
  const conns = useRef(new Map<string, PeerConnection>());
  const xfers = useRef(new Map<string, PeerTransfer>());
  const [links, setLinks] = useState<Record<string, PeerLink>>({});
  const [offer, setOffer] = useState<IncomingOffer | null>(null);
  const answer = useRef<((accept: boolean) => void) | null>(null);
  const peersRef = useRef(signal.peers);
  useEffect(() => {
    peersRef.current = signal.peers;
  }, [signal.peers]);

  /** One consent prompt at a time; a second offer while one is open is declined. */
  const ask = useCallback((peerId: string, files: IncomingOffer["files"]): Promise<boolean> => {
    if (answer.current) return Promise.resolve(false);
    const from = peersRef.current.find((p) => p.id === peerId)?.name ?? peerId.slice(0, 8);
    return new Promise((resolve) => {
      answer.current = (accept) => {
        answer.current = null;
        setOffer(null);
        resolve(accept);
      };
      setOffer({ from, files });
    });
  }, []);

  const respond = useCallback((accept: boolean) => answer.current?.(accept), []);

  const patch = useCallback((id: string, fn: (l: PeerLink) => PeerLink) => {
    setLinks((all) => ({ ...all, [id]: fn(all[id] ?? { state: "connecting", pongs: {}, transfer: null, failure: null }) }));
  }, []);

  const open = useCallback(
    (peerId: string): PeerConnection | null => {
      const existing = conns.current.get(peerId);
      if (existing && existing.state !== "closed" && existing.state !== "failed") return existing;
      existing?.close();
      if (!self) return null;
      const pong = (key: string) =>
        patch(peerId, (l) => ({ ...l, pongs: { ...l.pongs, [key]: (l.pongs[key] ?? 0) + 1 } }));
      const xfer = new PeerTransfer({
        peerId,
        onView: (transfer) => patch(peerId, (l) => ({ ...l, transfer })),
        ask: (files) => ask(peerId, files),
      });
      const conn: PeerConnection = new PeerConnection({
        selfId: self.id,
        peerId,
        sendSignal: (data) => sendSignal(peerId, data),
        onState: (state) => {
          if (state === "failed" || state === "closed") xfer.interrupt();
          if (state === "connected") xfer.warmUp();
          const failure = state === "failed" ? FAILURE_HINTS[conn.failureReason] : null;
          patch(peerId, (l) => ({ ...l, state, failure }));
        },
        onControl: (d) => {
          if (typeof d !== "string") return;
          if (d === "ping") conn.sendControl("pong");
          else if (d === "pong") pong("c");
          else xfer.handleControl(d);
        },
        onData: (i, d) => {
          if (typeof d !== "string") xfer.handleData(d);
          else if (d === "ping") conn.sendData(i, "pong");
          else if (d === "pong") pong(String(i));
        },
      });
      xfer.attach(conn);
      conns.current.set(peerId, conn);
      xfers.current.set(peerId, xfer);
      patch(peerId, () => ({ state: "connecting", pongs: {}, transfer: null, failure: null }));
      return conn;
    },
    [self, sendSignal, patch, ask],
  );

  useEffect(() => {
    setSignalHandler((from, data) => {
      // Dev-only: only an incoming offer may create a link; real consent is the M3 accept sheet.
      const sig = parseRtcSignal(data);
      const known = conns.current.get(from);
      if (!sig || (!known && !(sig.t === "sdp" && sig.description.type === "offer"))) return;
      // A peer that restarted (page reload) offers with a new DTLS identity: the old association is dead
      // and a renegotiation cannot adopt it, so start a fresh connection instead.
      const fp = sig.t === "sdp" && sig.description.type === "offer" ? sdpFingerprint(sig.description.sdp) : null;
      if (known && fp && known.remoteFingerprint && known.remoteFingerprint !== fp) known.close();
      void open(from)?.handleSignal(data);
    });
    return () => setSignalHandler(null);
  }, [open, setSignalHandler]);

  useEffect(() => {
    void sweepTransfers().catch(() => undefined);
  }, []);

  useEffect(() => {
    const map = conns.current;
    return () => {
      for (const c of map.values()) c.close();
      map.clear();
    };
  }, []);

  useEffect(() => {
    const map = conns.current;
    const notify = (online: boolean) => map.forEach((c) => c.notifyNetwork(online));
    const up = () => notify(true);
    const down = () => notify(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
    };
  }, []);

  // Signaling is needed to renegotiate; once it is back, retry links that are not up.
  useEffect(() => {
    if (status === "online") conns.current.forEach((c) => c.notifyNetwork(true));
  }, [status]);

  const ping = useCallback((peerId: string) => {
    const c = conns.current.get(peerId);
    if (!c) return;
    c.sendControl("ping");
    for (let i = 0; i < 4; i++) c.sendData(i, "ping");
  }, []);

  const sendFiles = useCallback((peerId: string, files: File[]) => xfers.current.get(peerId)?.send(files), []);

  return { links, connect: open, ping, sendFiles, offer, respond };
}
