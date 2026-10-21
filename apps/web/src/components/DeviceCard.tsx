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
      return "눌러서 연결해요";
    case "connecting":
      return slow ? "응답이 늦어요. 상대 기기에서 Radius가 열려 있는지 확인해 주세요" : "상대 기기에 연결을 요청했어요";
    case "reconnecting":
      return "연결이 끊겨서 다시 연결하는 중이에요";
    case "connected":
      return "연결됐어요. 파일을 보낼 수 있어요";
    case "failed":
      return "연결하지 못했어요";
  }
}

export function DeviceCard({ name, link, onConnect, onSend }: DeviceCardProps) {
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
      className={`rounded-[var(--radius)] bg-card p-4 ring-2 transition-[box-shadow,background-color] duration-300 ${
        over && connected ? "bg-accent ring-primary/50" : "ring-transparent"
      } ${connected ? "connected-flash" : ""}`}
    >
      <p className="flex items-center gap-2">
        <i aria-hidden className={`size-2.5 shrink-0 rounded-full ${DOT[link?.state ?? "closed"]}`} />
        <span className="truncate text-[17px] font-semibold leading-tight">{name}</span>
      </p>
      <p
        className={`mt-1 min-h-[2.4em] text-[13px] leading-snug ${slow || (failed && link) ? "text-foreground" : "text-muted-foreground"}`}
        data-testid={`link-${name}`}
      >
        {subText(link, slow)}
      </p>

      {!live && (
        <div className="mt-3">
          {connecting ? (
            <Button disabled className="h-10 w-full rounded-full text-[15px]">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {link?.state === "reconnecting" ? "다시 연결하는 중…" : "연결하는 중…"}
            </Button>
          ) : connected ? (
            <Button className="h-10 w-full rounded-full text-[15px]" onClick={() => input.current?.click()}>
              <Send className="size-4" aria-hidden />
              파일 보내기
            </Button>
          ) : (
            <Button className="h-10 w-full rounded-full text-[15px]" onClick={onConnect}>
              {failed && link ? "다시 시도" : "연결"}
            </Button>
          )}
        </div>
      )}
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
