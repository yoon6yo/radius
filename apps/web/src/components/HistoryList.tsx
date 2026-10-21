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
      <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius)] bg-card">
        {entries.map((e) => {
          const first = e.files[0]?.name ?? "";
          const what = e.files.length > 1 ? `${first} 외 ${e.files.length - 1}개` : first;
          return (
            <li key={e.key} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-semibold">
                  {e.peerName}님{e.direction === "send" ? "에게 보냈어요" : "에게서 받았어요"}
                </p>
                <p className="mt-0.5 truncate text-[13px] text-muted-foreground tabular-nums">
                  {what} · {formatBytes(e.total)} · {TIME.format(e.at)}
                </p>
              </div>
              {e.save && (
                <Button variant="ghost" size="sm" className="h-9 shrink-0 rounded-full px-3 text-[13px]" onClick={() => void e.save?.()}>
                  다시 저장
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
