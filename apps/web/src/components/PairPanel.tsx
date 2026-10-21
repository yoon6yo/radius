import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { PairCode } from "@/lib/useSignal";

interface PairPanelProps {
  code: PairCode | null;
  error: boolean;
  onRequestCode(): void;
  onJoin(code: string): boolean;
}

function useRemainingSeconds(expiresAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (expiresAt === null) return undefined;
    const update = () => setNow(Date.now());
    const first = setTimeout(update, 0);
    const t = setInterval(update, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [expiresAt]);
  return expiresAt === null ? 0 : Math.max(0, Math.ceil((expiresAt - now) / 1000));
}

/** Meet a device on another network: one side shows a six-digit code, the other types it. */
export function PairPanel({ code, error, onRequestCode, onJoin }: PairPanelProps) {
  const [open, setOpen] = useState(false);
  const [entry, setEntry] = useState("");
  const left = useRemainingSeconds(code?.expiresAt ?? null);
  const active = code !== null && left > 0;

  if (!open) {
    return (
      <Button variant="ghost" className="mt-3 h-10 rounded-full px-4 text-[14px] text-muted-foreground" onClick={() => setOpen(true)}>
        다른 네트워크 기기 연결
      </Button>
    );
  }

  return (
    <div className="mt-3 rounded-[var(--radius)] bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[15px] font-semibold">다른 네트워크 기기 연결</p>
        <Button variant="ghost" size="sm" className="h-8 rounded-full px-3 text-[13px] text-muted-foreground" onClick={() => setOpen(false)}>
          닫기
        </Button>
      </div>

      <div className="mt-3">
        {active ? (
          <p className="text-[13px] text-muted-foreground">
            상대 기기에 이 번호를 입력하게 해 주세요 · {left}초 남음
          </p>
        ) : (
          <p className="text-[13px] text-muted-foreground">한쪽에서 번호를 만들고, 다른 쪽에서 입력해요.</p>
        )}
        {active ? (
          <p className="mt-1 text-[32px] font-bold tracking-[0.2em] tabular-nums" data-testid="pair-code" aria-label={`연결 번호 ${code?.code.split("").join(" ")}`}>
            {code?.code}
          </p>
        ) : (
          <Button className="mt-2 h-10 rounded-full px-5 text-[15px]" onClick={onRequestCode}>
            번호 만들기
          </Button>
        )}
      </div>

      <form
        className="mt-4 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (/^\d{6}$/.test(entry) && onJoin(entry)) setEntry("");
        }}
      >
        <label className="sr-only" htmlFor="pair-entry">
          상대 기기의 연결 번호
        </label>
        <input
          id="pair-entry"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={entry}
          onChange={(e) => setEntry(e.target.value.replace(/\D/g, ""))}
          placeholder="상대의 번호 6자리"
          aria-invalid={error}
          className="h-10 min-w-0 flex-1 rounded-full bg-secondary px-4 text-[15px] tabular-nums outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        <Button type="submit" variant="secondary" className="h-10 rounded-full px-4 text-[15px]" disabled={entry.length !== 6}>
          연결
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-destructive">
          번호가 맞지 않거나 만료됐어요. 다시 확인해 주세요.
        </p>
      )}
    </div>
  );
}
