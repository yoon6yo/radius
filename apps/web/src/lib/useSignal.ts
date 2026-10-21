import { useEffect, useState } from "react";
import { SignalClient, type SignalStatus } from "@radius/engine";
import type { PeerInfo } from "@radius/protocol";
import { loadIdentity } from "./device";

export interface SignalState {
  status: SignalStatus;
  peers: PeerInfo[];
  self: { id: string; name: string } | null;
}

function signalUrl(): string {
  const configured = import.meta.env.VITE_SIGNAL_URL;
  if (typeof configured === "string" && configured) return configured;
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
}

export function useSignal(): SignalState {
  const [state, setState] = useState<SignalState>({ status: "connecting", peers: [], self: null });

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
      });
      client.start();
    });

    return () => {
      cancelled = true;
      client?.stop();
    };
  }, []);

  return state;
}
