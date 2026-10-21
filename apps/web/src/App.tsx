import { useMemo } from "react";
import { useSignal } from "@/lib/useSignal";
import { useSaved } from "@/lib/useSaved";
import { PairPanel } from "@/components/PairPanel";
import { usePeers } from "@/lib/usePeer";
import { AcceptDialog } from "@/components/AcceptDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DeviceCard } from "@/components/DeviceCard";
import { HistoryList } from "@/components/HistoryList";
import { Hero } from "@/components/Hero";

export function App() {
  const signal = useSignal();
  const { status, peers, self, friendsOnline } = signal;
  const everyone = useMemo(() => [...peers, ...friendsOnline.filter((f) => !peers.some((p) => p.id === f.id))], [peers, friendsOnline]);
  const { saved, save, remove } = useSaved(signal, everyone);
  const { links, connect, sendFiles, offer, respond, history } = usePeers({ ...signal, peers: everyone }, save);
  const nearby = new Set(peers.map((p) => p.id));
  const online = new Set(friendsOnline.map((f) => f.id));
  const savedElsewhere = saved.filter((d) => !nearby.has(d.id));

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-8 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <ThemeToggle />
      <h1 className="text-[34px] font-bold leading-tight tracking-tight">Radius</h1>
      <span hidden data-testid="status">
        {status}
        {self ? ` · ${self.name}` : ""}
      </span>
      <Hero status={status} name={self?.name} onRename={signal.rename} />

      <h2 className="mb-2 mt-9 px-1 text-[13px] font-semibold text-muted-foreground">근처 기기</h2>
      {peers.length === 0 ? (
        <div className="rounded-[var(--radius)] bg-card px-6 py-10 text-center" data-testid="peers">
          <p className="text-[17px] font-semibold">근처에 다른 기기가 없어요</p>
          <p className="mt-1 text-[13px] text-muted-foreground">같은 Wi‑Fi에서 다른 기기로 Radius를 열어 주세요.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="peers">
          {peers.map((p) => (
            <DeviceCard
              key={p.id}
              name={p.name}
              link={links[p.id]}
              onConnect={() => connect(p.id)}
              onSend={(files) => sendFiles(p.id, files)}
            />
          ))}
        </ul>
      )}

      {savedElsewhere.length > 0 && (
        <>
          <h2 className="mb-2 mt-9 px-1 text-[13px] font-semibold text-muted-foreground">저장된 기기</h2>
          <ul className="flex flex-col gap-3" data-testid="saved">
            {savedElsewhere.map((d) =>
              online.has(d.id) ? (
                <DeviceCard
                  key={d.id}
                  name={friendsOnline.find((f) => f.id === d.id)?.name ?? d.name}
                  link={links[d.id]}
                  onConnect={() => connect(d.id)}
                  onSend={(files) => sendFiles(d.id, files)}
                  onRemove={() => remove(d.id)}
                />
              ) : (
                <li key={d.id} className="flex items-center gap-3 rounded-[var(--radius)] bg-card px-4 py-3">
                  <i aria-hidden className="size-2.5 shrink-0 rounded-full bg-muted-foreground/40" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-muted-foreground">{d.name}</p>
                    <p className="text-[13px] text-muted-foreground">지금은 꺼져 있어요</p>
                  </div>
                  <button type="button" onClick={() => remove(d.id)} className="shrink-0 min-h-9 rounded-full px-3 text-[13px] text-muted-foreground">
                    삭제
                  </button>
                </li>
              ),
            )}
          </ul>
        </>
      )}
      <PairPanel code={signal.pairCode} error={signal.pairError} onRequestCode={signal.requestCode} onJoin={signal.joinCode} />

      <HistoryList entries={history} />

      <AcceptDialog offer={offer} onAnswer={respond} />
    </main>
  );
}
