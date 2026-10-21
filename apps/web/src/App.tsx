import { useSignal } from "@/lib/useSignal";
import { usePeers } from "@/lib/usePeer";

export function App() {
  const signal = useSignal();
  const { status, peers, self } = signal;
  const { links, connect, ping } = usePeers(signal);

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold">Radius</h1>
      <p className="mt-1 text-sm text-neutral-500" data-testid="status">
        {status}
        {self ? ` · ${self.name}` : ""}
      </p>
      <ul className="mt-6 space-y-2" data-testid="peers">
        {peers.map((p) => {
          const link = links[p.id];
          return (
            <li key={p.id} className="flex items-center gap-3 rounded-lg border border-neutral-200 px-4 py-3">
              <span className="flex-1">{p.name}</span>
              <span className="text-xs text-neutral-500" data-testid={`link-${p.name}`}>
                {link?.state ?? "idle"}
              </span>
              <span className="text-xs tabular-nums" data-testid={`pongs-${p.name}`}>
                {link ? Object.keys(link.pongs).sort().map((k) => `${k}:${link.pongs[k]}`).join(" ") : ""}
              </span>
              <button className="text-sm underline" onClick={() => connect(p.id)}>
                connect
              </button>
              <button className="text-sm underline" onClick={() => ping(p.id)}>
                ping
              </button>
            </li>
          );
        })}
      </ul>
    </main>
  );
}
