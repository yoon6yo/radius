import { useCallback, useEffect, useRef, useState } from "react";
import { SignalClient, type SignalStatus } from "@radius/engine";
import { sanitizeName, type PeerInfo } from "@radius/protocol";
import { loadIdentity, saveDeviceName } from "./device";

export interface PairCode {
  code: string;
  expiresAt: number;
}

export interface SignalState {
  status: SignalStatus;
  peers: PeerInfo[];
  self: { id: string; name: string } | null;
  /** Saved devices that are online now, on any network. */
  friendsOnline: PeerInfo[];
  pairCode: PairCode | null;
  /** True after a code entry was rejected; cleared by the next attempt. */
  pairError: boolean;
  sendSignal(to: string, data: unknown): boolean;
  /** Renames this device everywhere; false when the name is not acceptable. */
  rename(name: string): boolean;
  /** Ids of saved devices; presence needs the other side to have saved this device too. */
  setFriends(ids: string[]): void;
  requestCode(): void;
  joinCode(code: string): boolean;
  setPairedHandler(h: ((peer: PeerInfo) => void) | null): void;
  /** Registers the (single) handler for relayed peer payloads. */
  setSignalHandler(h: ((from: string, data: unknown) => void) | null): void;
}

type SignalData = Pick<SignalState, "status" | "peers" | "self" | "friendsOnline" | "pairCode" | "pairError">;

function signalUrl(): string {
  const configured = import.meta.env.VITE_SIGNAL_URL;
  if (typeof configured === "string" && configured) return configured;
  return `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
}

export function useSignal(): SignalState {
  const [state, setState] = useState<SignalData>({
    status: "connecting",
    peers: [],
    self: null,
    friendsOnline: [],
    pairCode: null,
    pairError: false,
  });
  const clientRef = useRef<SignalClient | null>(null);
  const handlerRef = useRef<((from: string, data: unknown) => void) | null>(null);
  const sendSignal = useCallback(
    (to: string, data: unknown) => clientRef.current?.sendSignal(to, data) ?? false,
    [],
  );
  const friendsRef = useRef<string[]>([]);
  const pairedRef = useRef<((peer: PeerInfo) => void) | null>(null);
  const setFriends = useCallback((ids: string[]) => {
    friendsRef.current = ids;
    clientRef.current?.setFriends(ids);
  }, []);
  const requestCode = useCallback(() => {
    clientRef.current?.requestCode();
  }, []);
  const joinCode = useCallback((code: string) => {
    setState((s) => ({ ...s, pairError: false }));
    return clientRef.current?.joinCode(code) ?? false;
  }, []);
  const setPairedHandler = useCallback((h: ((peer: PeerInfo) => void) | null) => {
    pairedRef.current = h;
  }, []);
  const rename = useCallback((raw: string) => {
    const name = sanitizeName(raw);
    if (!name) return false;
    void saveDeviceName(name);
    clientRef.current?.rename(name);
    setState((s) => (s.self ? { ...s, self: { ...s.self, name } } : s));
    return true;
  }, []);
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
        onFriends: (friendsOnline) => setState((s) => ({ ...s, friendsOnline })),
        onCode: (code, ttl) => setState((s) => ({ ...s, pairCode: { code, expiresAt: Date.now() + ttl * 1000 } })),
        onPaired: (peer) => {
          setState((s) => ({ ...s, pairCode: null, pairError: false }));
          pairedRef.current?.(peer);
        },
        onError: (code) => {
          if (code === "bad_code") setState((s) => ({ ...s, pairError: true }));
        },
        onSignal: (from, data) => handlerRef.current?.(from, data),
      });
      clientRef.current = client;
      client.setFriends(friendsRef.current);
      client.start();
    });

    return () => {
      cancelled = true;
      clientRef.current = null;
      client?.stop();
    };
  }, []);

  return { ...state, sendSignal, setSignalHandler, rename, setFriends, requestCode, joinCode, setPairedHandler };
}
