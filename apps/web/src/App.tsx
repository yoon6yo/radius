import { useSignal } from "@/lib/useSignal";
import { usePeers } from "@/lib/usePeer";
import { AcceptDialog } from "@/components/AcceptDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DeviceCard } from "@/components/DeviceCard";
import { Hero } from "@/components/Hero";

export function App() {
  const signal = useSignal();
  const { status, peers, self } = signal;
  const { links, connect, sendFiles, offer, respond } = usePeers(signal);

  const activeIds = peers.filter((p) => ["active", "waiting"].includes(links[p.id]?.transfer?.status ?? "")).map((p) => p.id);

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-lg flex-col px-5 pb-8 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <ThemeToggle />
      <h1 className="text-[22px] font-bold tracking-tight">Radius</h1>
      <span hidden data-testid="status">
        {status}
        {self ? ` · ${self.name}` : ""}
      </span>
      <Hero status={status} name={self?.name} peers={peers} activeIds={activeIds} onRename={signal.rename} />

      <h2 className="mb-1 mt-8 text-[13px] font-semibold text-muted-foreground">근처 기기</h2>
      {peers.length === 0 ? (
        <p className="py-4 text-[15px] text-muted-foreground" data-testid="peers">
          같은 Wi‑Fi에서 다른 기기로 Radius를 열어 주세요.
        </p>
      ) : (
        <ul className="-mx-2 grid grid-cols-2 gap-x-2 gap-y-4" data-testid="peers">
          {peers.map((p) => (
            <DeviceCard
              key={p.id}
              id={p.id}
              name={p.name}
              link={links[p.id]}
              onConnect={() => connect(p.id)}
              onSend={(files) => sendFiles(p.id, files)}
            />
          ))}
        </ul>
      )}

      <AcceptDialog offer={offer} onAnswer={respond} />
    </main>
  );
}
