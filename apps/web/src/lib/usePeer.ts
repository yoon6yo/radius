import { useCallback, useEffect, useRef, useState } from "react";
import { PeerConnection, parseRtcSignal, type PeerState } from "@radius/engine";
import { safeName, sweepTransfers } from "./exportOpfs";
import { PeerTransfer, type TransferView } from "./peerTransfer";
import type { SignalState } from "./useSignal";

export interface PeerLink {
  state: PeerState;
  /** Echo replies received per channel: "c" = control, "0".. = data index. */
  pongs: Record<string, number>;
  transfer: TransferView | null;
}

/** Dev-only: one PeerConnection per remote peer with a ping/pong echo over every channel. */
export function usePeers(signal: SignalState) {
  const { self, status, sendSignal, setSignalHandler } = signal;
  const conns = useRef(new Map<string, PeerConnection>());
  const xfers = useRef(new Map<string, PeerTransfer>());
  const [links, setLinks] = useState<Record<string, PeerLink>>({});

  const patch = useCallback((id: string, fn: (l: PeerLink) => PeerLink) => {
    setLinks((all) => ({ ...all, [id]: fn(all[id] ?? { state: "connecting", pongs: {}, transfer: null }) }));
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
        onView: (transfer) => patch(peerId, (l) => ({ ...l, transfer })),
        ask: (files) => {
          const list = files.slice(0, 10).map((f) => `${safeName(f.path)} (${f.size} B)`);
          if (files.length > list.length) list.push(`… +${files.length - list.length} more`);
          return window.confirm(`Receive from ${peerId.slice(0, 8)}?\n${list.join("\n")}`);
        },
      });
      const conn: PeerConnection = new PeerConnection({
        selfId: self.id,
        peerId,
        sendSignal: (data) => sendSignal(peerId, data),
        onState: (state) => {
          if (state === "failed" || state === "closed") xfer.interrupt();
          patch(peerId, (l) => ({ ...l, state }));
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
      patch(peerId, () => ({ state: "connecting", pongs: {}, transfer: null }));
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

  return { links, connect: open, ping, sendFiles };
}
