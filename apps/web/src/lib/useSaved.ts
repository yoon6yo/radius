import { useCallback, useEffect, useMemo, useState } from "react";
import type { PeerInfo } from "@radius/protocol";
import { loadSaved, persistSaved, removeSaved, upsertSaved, type SavedDevice } from "./friends";
import type { SignalState } from "./useSignal";

/** Devices this one has exchanged files with (or paired by code); kept on this device and watched on the server. */
export function useSaved(signal: Pick<SignalState, "setFriends" | "setPairedHandler">, online: readonly PeerInfo[]) {
  const { setFriends, setPairedHandler } = signal;
  const [saved, setSaved] = useState<SavedDevice[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadSaved().then((stored) => {
      if (cancelled) return;
      // Anything saved before the load finished is kept.
      setSaved((current) => current.reduce((acc, d) => upsertSaved(acc, d, d.savedAt), stored));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const save = useCallback((peer: { id: string; name: string }) => setSaved((l) => upsertSaved(l, peer, Date.now())), []);
  const remove = useCallback((id: string) => setSaved((l) => removeSaved(l, id)), []);

  useEffect(() => {
    setPairedHandler(save);
    return () => setPairedHandler(null);
  }, [save, setPairedHandler]);

  // A saved device that renamed itself shows (and is stored with) its latest name.
  const view = useMemo(() => {
    const names = new Map(online.map((p) => [p.id, p.name]));
    return saved.map((d) => (names.has(d.id) && names.get(d.id) !== d.name ? { ...d, name: names.get(d.id) as string } : d));
  }, [saved, online]);

  useEffect(() => {
    if (!ready) return;
    void persistSaved(view);
    setFriends(view.map((d) => d.id));
  }, [view, ready, setFriends]);

  return { saved: view, save, remove };
}
