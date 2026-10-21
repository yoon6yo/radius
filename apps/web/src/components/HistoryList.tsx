import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format";
import type { HistoryEntry } from "@/lib/usePeer";

const TIME = new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" });

/** Transfers finished while this page has been open; nothing is stored. */
export function HistoryList({ entries }: { entries: HistoryEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section aria-label="주고받은 기록" className="mt-9">
      <h2 className="mb-2 px-1 text-[13px] font-semibold text-muted-foreground">주고받은 기록</h2>
      <ul className="space-y-3">
        {entries.map((e) => (
          <li key={e.key} className="rounded-[var(--radius)] bg-card p-4">
            <p className="text-[15px] font-semibold">
              {e.peerName}님{e.direction === "send" ? "에게 보냈어요" : "에게서 받았어요"}
            </p>
            <p className="mt-0.5 text-[13px] text-muted-foreground tabular-nums">
              {TIME.format(e.at)} · 파일 {e.files.length}개 · {formatBytes(e.total)}
            </p>
            <ul className="mt-3 divide-y divide-border rounded-[16px] bg-secondary">
              {e.files.map((f, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[14px]">
                  <span className="min-w-0 break-all">{f.name}</span>
                  <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">{formatBytes(f.size)}</span>
                </li>
              ))}
            </ul>
            {e.save && (
              <Button variant="secondary" className="mt-3 h-10 rounded-full px-5 text-[15px]" onClick={() => void e.save?.()}>
                다시 저장
              </Button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
