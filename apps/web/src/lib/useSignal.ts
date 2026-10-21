import { useCallback, useEffect, useRef, useState } from "react";
import { SignalClient, type SignalStatus } from "@radius/engine";
import type { PeerInfo } from "@radius/protocol";
import { loadIdentity } from "./device";

export interface SignalState {
  status: SignalStatus;
  peers: PeerInfo[];
  self: { id: string; name: string } | null;
  sendSignal(to: string, data: unknown): boolean;
  /** Registers the (single) handler for relayed peer payloads. */
  setSignalHandler(h: ((from: string, data: unknown) => void) | null): void;
}

type SignalData = Pick<SignalState, "status" | "peers" | "self">;

function signalUrl(): string {
  const configured = import.meta.env.VITE_SIGNAL_URL;
  if (typeof configured === "string" && configured) return configured;
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
}

export function useSignal(): SignalState {
  const [state, setState] = useState<SignalData>({ status: "connecting", peers: [], self: null });
  const clientRef = useRef<SignalClient | null>(null);
  const handlerRef = useRef<((from: string, data: unknown) => void) | null>(null);
  const sendSignal = useCallback(
    (to: string, data: unknown) => clientRef.current?.sendSignal(to, data) ?? false,
    [],
  );
  const setSignalHandler = useCallback((h: ((from: string, data: unknown) => void) | null) => {
    handlerRef.current = h;
  }, []);

  useEffect(() => {
    let cancelled = false;
    let client: SignalClient | null = null;

    void loadIdentity().then((identity) => {
      if (cancelled) return;
      client = new SignalClient({
        url: signalUrl(),
        identity,
        onStatus: (status) =>
          setState((s) => ({ ...s, status, self: status === "online" && client ? { id: client.id, name: identity.name } : null })),
        onPeers: (peers) => setState((s) => ({ ...s, peers })),
        onSignal: (from, data) => handlerRef.current?.(from, data),
      });
      clientRef.current = client;
      client.start();
    });

    return () => {
      cancelled = true;
      clientRef.current = null;
      client?.stop();
    };
  }, []);

  return { ...state, sendSignal, setSignalHandler };
}
