import { useSignal } from "@/lib/useSignal";
import { usePeers } from "@/lib/usePeer";
import { AcceptDialog } from "@/components/AcceptDialog";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DeviceCard } from "@/components/DeviceCard";
import { HistoryList } from "@/components/HistoryList";
import { Hero } from "@/components/Hero";

export function App() {
  const signal = useSignal();
  const { status, peers, self } = signal;
  const { links, connect, sendFiles, offer, respond, history } = usePeers(signal);

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-8 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <ThemeToggle />
      <h1 className="text-[34px] font-bold leading-tight tracking-tight">Radius</h1>
      <span hidden data-testid="status">
        {status}
        {self ? ` · ${self.name}` : ""}
      </span>
      <Hero status={status} name={self?.name} />

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

      <HistoryList entries={history} />

      <p className="mt-4 hidden px-1 text-center text-[13px] text-muted-foreground [@media(hover:hover)]:block">
        연결된 기기 위로 파일을 끌어다 놓으면 바로 보내요.
      </p>
      <AcceptDialog offer={offer} onAnswer={respond} />
    </main>
  );
}
