import { useSignal } from "@/lib/useSignal";

export function App() {
  const { status, peers, self } = useSignal();

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="text-2xl font-semibold">Radius</h1>
      <p className="mt-1 text-sm text-neutral-500" data-testid="status">
        {status}
        {self ? ` · ${self.name}` : ""}
      </p>
      <ul className="mt-6 space-y-2" data-testid="peers">
        {peers.map((p) => (
          <li key={p.id} className="rounded-lg border border-neutral-200 px-4 py-3">
            {p.name}
          </li>
        ))}
      </ul>
    </main>
  );
}
