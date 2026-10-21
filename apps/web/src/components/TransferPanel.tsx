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

  return (
    <div className="mt-4" aria-live="polite">
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">
            {running ? verb : statusLine(t)}
            <span className="ml-2 font-normal text-muted-foreground">{t.files.length === 1 ? t.files[0]!.name : `파일 ${t.files.length}개`}</span>
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground tabular-nums">
            {t.status === "waiting"
              ? t.direction === "send"
                ? `${name}님이 수락하길 기다리고 있어요`
                : "수락을 기다리고 있어요"
              : `파일 ${t.files.length}개 중 ${filesDone}개 완료`}
          </p>
        </div>
        <p className="shrink-0 text-[40px] font-bold leading-none tracking-tight text-primary tabular-nums">
          {complete ? 100 : pct}
          <span className="text-xl">%</span>
        </p>
      </div>

      <div
        role="progressbar"
        aria-label="전송 진행률"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={complete ? 100 : pct}
        className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full w-full origin-left bg-primary transition-transform duration-200 ease-linear will-change-transform" style={{ transform: `scaleX(${(complete ? 100 : pct) / 100})` }} />
      </div>
      <p className="mt-2 text-[13px] text-muted-foreground tabular-nums">
        {formatBytes(complete ? t.total : t.done)} / {formatBytes(t.total)}
        {running && rate > 0 && ` · ${formatBytes(rate)}/초`}
        {running && eta && ` · 남은 시간 ${eta}`}
      </p>

      <ul className="mt-3 max-h-64 divide-y divide-border overflow-auto rounded-[16px] bg-secondary" aria-label="파일 목록">
        {t.files.map((f, i) => {
          const st = fileState(complete ? f.size : f.done, f.size, running);
          return (
            <li key={i} className="px-3 py-2.5">
              <div className="flex items-center gap-3">
                <span className="grid size-5 shrink-0 place-items-center" aria-hidden>
                  {st === "done" ? (
                    <Check className="size-4 text-primary" />
                  ) : st === "running" ? (
                    <Loader2 className="size-4 animate-spin text-primary" />
                  ) : (
                    <i className="size-2 rounded-full bg-muted-foreground/40" />
                  )}
                </span>
                <span className="min-w-0 flex-1 break-all text-[14px] leading-snug">{f.name}</span>
                <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">{formatBytes(f.size)}</span>
              </div>
              {st === "running" && (
                <div className="ml-8 mt-2 h-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full w-full origin-left bg-primary/70 transition-transform duration-200 ease-linear will-change-transform" style={{ transform: `scaleX(${Math.floor((f.done / f.size) * 100) / 100})` }} />
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {complete && t.direction === "receive" && (
        <p className="mt-3 text-[13px] text-muted-foreground">다운로드 폴더로 자동 저장했어요. 저장되지 않았다면 다시 저장을 눌러 주세요.</p>
      )}
      <div className="mt-3 flex gap-2">
        {t.save && (
          <Button variant="secondary" className="h-10 rounded-full px-5 text-[15px]" data-testid={`save-${name}`} onClick={() => void t.save?.()}>
            다시 저장
          </Button>
        )}
        {!running && (
          <Button variant="ghost" className="h-10 rounded-full px-5 text-[15px]" onClick={onClose}>
            닫기
          </Button>
        )}
      </div>
    </div>
  );
}
