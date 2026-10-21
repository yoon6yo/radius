import { useCallback, useEffect, useRef, useState } from "react";
import { PeerConnection, parseRtcSignal, type PeerState } from "@radius/engine";
import type { SignalState } from "./useSignal";

export interface PeerLink {
  state: PeerState;
  /** Echo replies received per channel: "c" = control, "0".. = data index. */
  pongs: Record<string, number>;
}

/** Dev-only: one PeerConnection per remote peer with a ping/pong echo over every channel. */
export function usePeers(signal: SignalState) {
  const { self, status, sendSignal, setSignalHandler } = signal;
  const conns = useRef(new Map<string, PeerConnection>());
  const [links, setLinks] = useState<Record<string, PeerLink>>({});

  const patch = useCallback((id: string, fn: (l: PeerLink) => PeerLink) => {
    setLinks((all) => ({ ...all, [id]: fn(all[id] ?? { state: "connecting", pongs: {} }) }));
  }, []);

  const open = useCallback(
    (peerId: string): PeerConnection | null => {
      const existing = conns.current.get(peerId);
      if (existing && existing.state !== "closed" && existing.state !== "failed") return existing;
      existing?.close();
      if (!self) return null;
      const pong = (key: string) =>
        patch(peerId, (l) => ({ ...l, pongs: { ...l.pongs, [key]: (l.pongs[key] ?? 0) + 1 } }));
      const conn: PeerConnection = new PeerConnection({
        selfId: self.id,
        peerId,
        sendSignal: (data) => sendSignal(peerId, data),
        onState: (state) => patch(peerId, (l) => ({ ...l, state })),
        onControl: (d) => (d === "ping" ? conn.sendControl("pong") : d === "pong" && pong("c")),
        onData: (i, d) => (d === "ping" ? conn.sendData(i, "pong") : d === "pong" && pong(String(i))),
      });
      conns.current.set(peerId, conn);
      patch(peerId, () => ({ state: "connecting", pongs: {} }));
      return conn;
    },
    [self, sendSignal, patch],
  );

  useEffect(() => {
    setSignalHandler((from, data) => {
      // Dev-only: only an incoming offer may create a link; real consent is the M3 accept sheet.
      const sig = parseRtcSignal(data);
      const known = conns.current.get(from);
      if (!sig || (!known && !(sig.t === "sdp" && sig.description.type === "offer"))) return;
      void open(from)?.handleSignal(data);
    });
    return () => setSignalHandler(null);
  }, [open, setSignalHandler]);

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

  return { links, connect: open, ping };
}
