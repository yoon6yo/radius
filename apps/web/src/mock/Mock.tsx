// Visual demo with fake data (?mock=1 live, ?mock=accept with the consent sheet). No network.
import { useEffect, useState } from "react";
import { AcceptDialog } from "@/components/AcceptDialog";
import { DeviceCard } from "@/components/DeviceCard";
import { Hero } from "@/components/Hero";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { TransferView } from "@/lib/peerTransfer";
import type { PeerLink } from "@/lib/usePeer";

const MB = 1024 * 1024;
const PEERS = [
  { id: "3fa91-galaxy", name: "민준의 Galaxy" },
  { id: "b27c4-ipad", name: "서연의 iPad" },
  { id: "9d0e2-pc", name: "회사 PC" },
  { id: "5c6a8-iphone", name: "하준의 iPhone" },
  { id: "e41f7-nas", name: "거실 NAS" },
];
const FILES = [
  { name: "여행 영상.mov", size: 400 * MB },
  ...Array.from({ length: 13 }, (_, i) => ({ name: `IMG_${2041 + i}.heic`, size: (30 + ((i * 37) % 140)) * MB })),
];
const OFFER = { from: "서연의 iPad", peerId: "b27c4-ipad", duplicate: false, files: FILES.map((f) => ({ path: f.name, size: f.size })) };
const total = FILES.reduce((n, f) => n + f.size, 0);

function sending(done: number): TransferView {
  let left = done;
  return {
    id: 1,
    direction: "send",
    name: "mock",
    done,
    total,
    status: "active",
    files: FILES.map((f) => {
      const d = Math.min(f.size, left);
      left -= d;
      return { ...f, done: d };
    }),
  };
}

export function Mock({ variant }: { variant: string }) {
  const [count, setCount] = useState(variant === "accept" ? 3 : 1);
  const [done, setDone] = useState(total * 0.35);
  const [offer, setOffer] = useState(variant === "accept" ? OFFER : null);

  useEffect(() => {
    if (variant === "accept") return undefined;
    const t = setInterval(() => setCount((c) => (c >= PEERS.length ? 1 : c + 1)), 3000);
    return () => clearInterval(t);
  }, [variant]);
  useEffect(() => {
    const t = setInterval(() => setDone((d) => (d + total * 0.01 > total ? total * 0.05 : d + total * 0.01)), 400);
    return () => clearInterval(t);
  }, []);

  const peers = PEERS.slice(0, count);
  const link = (i: number): PeerLink | undefined =>
    i === 0 ? { state: "connected", pongs: {}, failure: null, transfer: sending(done) } : i === 1 ? { state: "connected", pongs: {}, failure: null, transfer: null } : undefined;
  return (
    <main className="relative mx-auto flex min-h-dvh max-w-lg flex-col px-5 pb-8 pt-10">
      <ThemeToggle />
      <h1 className="text-[22px] font-bold tracking-tight">Radius</h1>
      <Hero status="online" name="맑은 바다" peers={peers} activeIds={[PEERS[0]!.id]} onRename={() => true} />
      <h2 className="mb-1 mt-10 text-[13px] font-semibold text-muted-foreground">근처 기기</h2>
      <ul className="-mx-2 grid grid-cols-2 gap-x-2 gap-y-4">
        {peers.map((p, i) => (
          <DeviceCard key={p.id} id={p.id} name={p.name} link={link(i)} onConnect={() => undefined} onSend={() => undefined} />
        ))}
      </ul>
      <AcceptDialog offer={offer} onAnswer={() => setOffer(null)} />
    </main>
  );
}
