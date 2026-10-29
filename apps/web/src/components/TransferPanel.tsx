import { useState } from "react";
import { Check } from "lucide-react";
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

const COLLAPSED_ROWS = 4;

/** Files with their own progress. Collapsed: finished ones drop out and only the next few show. */
function FileList({ files, running }: { files: TransferView["files"]; running: boolean }) {
  const [all, setAll] = useState(false);
  const firstOpen = files.findIndex((f) => f.done < f.size);
  const finished = files.filter((f) => f.done >= f.size).length;
  const start = all || firstOpen < 0 || files.length <= COLLAPSED_ROWS ? 0 : firstOpen;
  const rows = files.slice(start, all ? undefined : start + COLLAPSED_ROWS);
  const hidden = files.length - start - rows.length;
  return (
    <div className="mt-3">
      <ul aria-label="파일 목록" className={all ? "max-h-72 overflow-auto" : ""}>
        {rows.map((f, k) => {
          const i = start + k;
          const done = f.done >= f.size;
          const active = running && !done && (i === firstOpen || f.done > 0);
          const pct = f.size > 0 ? Math.floor((f.done / f.size) * 100) : 100;
          return (
            <li key={i} className="py-1.5">
              <div className="flex items-center gap-3">
                <span className="grid size-4 shrink-0 place-items-center" aria-hidden>
                  {done ? <Check className="size-4 text-primary" /> : <i className={`size-1.5 rounded-full ${active ? "bg-primary" : "bg-muted-foreground/40"}`} />}
                </span>
                <span className={`min-w-0 flex-1 truncate text-[13px] ${done || active ? "" : "text-muted-foreground"}`}>{f.name}</span>
                <span className={`shrink-0 text-[13px] tabular-nums ${active ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                  {active ? `${pct}%` : formatBytes(f.size)}
                </span>
              </div>
              {active && (
                <div className="ml-7 mt-1.5 h-0.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`${f.name} 진행률`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                  <div className="h-full w-full origin-left bg-primary transition-transform duration-200 ease-linear" style={{ transform: `scaleX(${pct / 100})` }} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {files.length > COLLAPSED_ROWS && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-1 min-h-11 text-[13px] font-semibold text-primary">
          {all ? "접기" : `${hidden > 0 ? `나머지 ${hidden}개` : "전체"} 보기${finished > 0 ? ` · 완료 ${finished}개` : ""}`}
        </button>
      )}
    </div>
  );
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
      <div className="mt-2" aria-live="polite">
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
            <Button variant="ghost" size="sm" className="h-11 rounded-full px-3 text-[13px]" data-testid={`save-${name}`} onClick={() => void t.save?.()}>
              다시 저장
            </Button>
          )}
          <Button variant="ghost" size="sm" className="h-11 rounded-full px-3 text-[13px] text-muted-foreground" onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3" aria-live="polite">
      <p className="min-w-0 truncate text-[14px] font-semibold">
        {verb}
        <span className="ml-2 font-normal text-muted-foreground">{label}</span>
      </p>
      {t.status !== "waiting" && <p className="mt-1 text-[56px] font-extrabold leading-none tracking-[-0.05em] text-primary tabular-nums">{pct}<span className="ml-1 text-2xl font-bold tracking-tight">%</span></p>}
      <div
        role="progressbar"
        aria-label="전송 진행률"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-3 h-1 overflow-hidden rounded-full bg-muted"
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
      {t.files.length > 1 && <FileList files={t.files} running={running} />}
    </div>
  );
}
