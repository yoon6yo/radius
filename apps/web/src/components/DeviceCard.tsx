import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PeerLink } from "@/lib/usePeer";
import { TransferPanel } from "./TransferPanel";

interface DeviceCardProps {
  name: string;
  link: PeerLink | undefined;
  onConnect(): void;
  onSend(files: File[]): void;
  /** Present for saved devices: forgets this device. */
  onRemove?(): void;
}

const DOT: Record<PeerLink["state"], string> = {
  connecting: "bg-amber-400",
  connected: "bg-emerald-500",
  reconnecting: "bg-amber-400",
  failed: "bg-destructive",
  closed: "bg-muted-foreground/40",
};

const SLOW_MS = 8000;

/** True once `waiting` has lasted `ms`. */
function useSlow(waiting: boolean, ms: number): boolean {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!waiting) return undefined;
    const t = setTimeout(() => setSlow(true), ms);
    return () => {
      clearTimeout(t);
      setSlow(false);
    };
  }, [waiting, ms]);
  return waiting && slow;
}

export function subText(link: PeerLink | undefined, slow: boolean): string {
  switch (link?.state) {
    case undefined:
    case "closed":
      return "연결할 수 있어요";
    case "connecting":
      return slow ? "응답이 늦어요. 상대 기기에서 Radius가 열려 있는지 확인해 주세요" : "연결을 요청했어요";
    case "reconnecting":
      return "연결이 끊겨 다시 연결하는 중이에요";
    case "connected":
      return "연결됐어요";
    case "failed":
      return "연결하지 못했어요";
  }
}

export function DeviceCard({ name, link, onConnect, onSend, onRemove }: DeviceCardProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [closedId, setClosedId] = useState<number | null>(null);
  const t = link?.transfer ?? null;
  const showTransfer = t !== null && t.id !== closedId;
  const live = t !== null && (t.status === "active" || t.status === "waiting");
  const connecting = link?.state === "connecting" || link?.state === "reconnecting";
  const connected = link?.state === "connected";
  const failed = link?.state === "failed" || link?.state === "closed";
  const slow = useSlow(link?.state === "connecting", SLOW_MS);

  const drop = (e: React.DragEvent) => {
    e.preventDefault();
    setOver(false);
    if (connected && e.dataTransfer.files.length > 0) onSend([...e.dataTransfer.files]);
  };

  return (
    <li
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      data-expanded={showTransfer || undefined}
      className={`rounded-[var(--radius)] bg-card px-4 py-3.5 shadow-[0_1px_3px_rgb(15_40_80/0.07)] ring-2 transition-[box-shadow,background-color] duration-300 ${
        over && connected ? "bg-accent ring-primary/50" : "ring-transparent"
      } ${connected ? "connected-flash" : ""}`}
    >
      <div className="flex items-center gap-3">
        <span aria-hidden className="relative grid size-11 shrink-0 place-items-center rounded-full bg-accent text-[17px] font-semibold text-primary">
          {Array.from(name.trim())[0]?.toUpperCase() ?? "?"}
          <i className={`absolute -bottom-0.5 -right-0.5 size-3.5 rounded-full ring-2 ring-card ${DOT[link?.state ?? "closed"]}`} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold leading-tight">{name}</p>
          <p
            className={`mt-0.5 text-[13px] leading-snug ${slow || (failed && link) ? "text-foreground" : "truncate text-muted-foreground"}`}
            data-testid={`link-${name}`}
          >
            {subText(link, slow)}
          </p>
        </div>
        {!live && (!showTransfer || failed) && (
          connecting ? (
            <Button disabled size="sm" className="h-9 shrink-0 rounded-full px-4 text-[14px]">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {link?.state === "reconnecting" ? "다시 연결 중" : "연결 중"}
            </Button>
          ) : connected ? (
            <Button size="sm" className="h-9 shrink-0 rounded-full px-4 text-[14px]" onClick={() => input.current?.click()}>
              <Send className="size-4" aria-hidden />
              보내기
            </Button>
          ) : (
            <Button size="sm" className="h-9 shrink-0 rounded-full px-4 text-[14px]" onClick={onConnect}>
              {failed && link ? "다시 시도" : "연결"}
            </Button>
          )
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} className="shrink-0 min-h-9 rounded-full px-3 text-[13px] text-muted-foreground">
            삭제
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        data-testid={`file-${name}`}
        onChange={(e) => {
          onSend([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />

      {showTransfer && <TransferPanel name={name} transfer={t} onClose={() => setClosedId(t.id)} />}

      {link?.failure && (
        <p role="alert" title={link.failure} className="mt-3 text-[13px] text-destructive" data-testid={`failure-${name}`}>
          같은 Wi‑Fi에 연결돼 있는지 확인하고 다시 시도해 주세요.
        </p>
      )}

      {/* Raw state for test scripts; not meant to be read. */}
      <span hidden data-testid={`pongs-${name}`}>
        {link ? Object.keys(link.pongs).sort().map((k) => `${k}:${link.pongs[k]}`).join(" ") : ""}
      </span>
      <span hidden data-testid={`xfer-${name}`}>
        {t ? `${t.direction} ${t.status} ${t.done}/${t.total}` : ""}
      </span>
    </li>
  );
}
