import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/format";
import type { TransferView } from "@/lib/peerTransfer";
import { formatEta, percent, statusLine } from "@/lib/transferText";
import { useRate } from "@/lib/useRate";

interface TransferPanelProps {
  name: string;
  transfer: TransferView;
  onClose(): void;
}

function fileState(done: number, size: number, running: boolean): "done" | "running" | "queued" {
  if (done >= size) return "done";
  return running && done > 0 ? "running" : "queued";
}

export function TransferPanel({ name, transfer: t, onClose }: TransferPanelProps) {
  const running = t.status === "active" || t.status === "waiting";
  const rate = useRate(t.done, t.status === "active");
  const filesDone = t.files.filter((f) => f.done >= f.size).length;
  const pct = percent(t);
  const eta = formatEta(t.total - t.done, rate);
  const verb = t.direction === "send" ? "보내는 중" : "받는 중";
  const complete = t.status === "complete";

  const single = t.files.length === 1 ? t.files[0]! : null;
  const label = single ? single.name : `파일 ${t.files.length}개`;

  if (!running) {
    return (
      <div className="mt-3 rounded-[16px] bg-secondary px-4 py-3" aria-live="polite">
        <div className="flex items-center gap-3">
          {complete && <Check className="size-4 shrink-0 text-primary" aria-hidden />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold">
              {statusLine(t)}
              <span className="ml-2 font-normal text-muted-foreground">{label}</span>
            </p>
            {complete && <p className="mt-0.5 text-[13px] text-muted-foreground tabular-nums">{formatBytes(t.total)}</p>}
          </div>
          {t.save && (
            <Button variant="ghost" size="sm" className="h-8 rounded-full px-3 text-[13px]" data-testid={`save-${name}`} onClick={() => void t.save?.()}>
              다시 저장
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-8 rounded-full px-3 text-[13px] text-muted-foreground" onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 truncate text-[14px] font-semibold">
          {verb}
          <span className="ml-2 font-normal text-muted-foreground">{label}</span>
        </p>
        <p className="shrink-0 text-[14px] font-semibold text-primary tabular-nums">{t.status === "waiting" ? "" : `${pct}%`}</p>
      </div>
      <div
        role="progressbar"
        aria-label="전송 진행률"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full w-full origin-left bg-primary transition-transform duration-200 ease-linear will-change-transform" style={{ transform: `scaleX(${pct / 100})` }} />
      </div>
      <p className="mt-2 text-[13px] text-muted-foreground tabular-nums">
        {t.status === "waiting"
          ? t.direction === "send"
            ? `${name}님이 수락하길 기다리고 있어요`
            : "수락을 기다리고 있어요"
          : [
              `${formatBytes(t.done)} / ${formatBytes(t.total)}`,
              rate > 0 ? `${formatBytes(rate)}/초` : "",
              eta ? `남은 시간 ${eta}` : "",
              t.files.length > 1 ? `${filesDone}/${t.files.length}개` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
      </p>
      {t.files.length > 1 && (
        <ul className="mt-2 max-h-40 divide-y divide-border overflow-auto rounded-[16px] bg-secondary" aria-label="파일 목록">
          {t.files.map((f, i) => {
            const st = fileState(f.done, f.size, running);
            return (
              <li key={i} className="flex items-center gap-3 px-3 py-2">
                <span className="grid size-4 shrink-0 place-items-center" aria-hidden>
                  {st === "done" ? (
                    <Check className="size-4 text-primary" />
                  ) : st === "running" ? (
                    <Loader2 className="size-4 animate-spin text-primary" />
                  ) : (
                    <i className="size-1.5 rounded-full bg-muted-foreground/40" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{f.name}</span>
                <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">{formatBytes(f.size)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
