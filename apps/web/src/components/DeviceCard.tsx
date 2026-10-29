import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { peerWave } from "@/lib/peerWave";
import type { PeerLink } from "@/lib/usePeer";
import { TransferPanel } from "./TransferPanel";

interface DeviceCardProps {
  id: string;
  name: string;
  link: PeerLink | undefined;
  onConnect(): void;
  onSend(files: File[]): void;
}

const DOT: Record<PeerLink["state"], string> = {
  connecting: "bg-warning",
  connected: "bg-success",
  reconnecting: "bg-warning",
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

export function DeviceCard({ id, name, link, onConnect, onSend }: DeviceCardProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [closedId, setClosedId] = useState<number | null>(null);
  const t = link?.transfer ?? null;
  const showTransfer = t !== null && t.id !== closedId;
  const live = t !== null && (t.status === "active" || t.status === "waiting");
  const connecting = link?.state === "connecting" || link?.state === "reconnecting";
  const connected = link?.state === "connected";
  const failed = link?.state === "failed" || link?.state === "closed";
  const hue = peerWave(id).hue;
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
      className={`rounded-3xl p-2 ring-2 transition-[box-shadow,background-color] duration-300 ${showTransfer ? "col-span-2" : ""} ${
        over && connected ? "bg-accent ring-primary/50" : "ring-transparent"
      } ${connected ? "connected-flash" : ""}`}
    >
      <div className={`flex gap-3 ${showTransfer ? "items-center" : "flex-col items-center text-center"}`}>
        <span
          aria-hidden
          className="relative grid size-11 shrink-0 place-items-center rounded-full text-[16px] font-bold text-white"
          style={{ background: `oklch(0.48 0.14 ${hue})` }}
        >
          {Array.from(name.trim())[0]?.toUpperCase() ?? "?"}
        </span>
        <div className="w-full min-w-0 flex-1">
          <p className="truncate text-lg font-semibold leading-tight tracking-tight">{name}</p>
          <p
            className={`mt-0.5 text-[13px] leading-snug ${slow || (failed && link) ? "text-foreground" : "truncate text-muted-foreground"}`}
            data-testid={`link-${name}`}
          >
            <i aria-hidden className={`mr-1.5 inline-block size-1.5 rounded-full align-middle ${DOT[link?.state ?? "closed"]}`} />
            {subText(link, slow)}
          </p>
        </div>
        {!live && (!showTransfer || failed) && (
          connecting ? (
            <Button disabled variant="ghost" size="sm" className="h-11 shrink-0 rounded-full bg-muted px-5 text-[14px]">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {link?.state === "reconnecting" ? "다시 연결 중" : "연결 중"}
            </Button>
          ) : connected ? (
            <Button size="sm" className="h-11 shrink-0 rounded-full bg-foreground px-5 text-[14px] font-semibold text-background hover:bg-foreground/85" onClick={() => input.current?.click()}>
              보내기
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="h-11 shrink-0 rounded-full bg-accent px-5 text-[14px] font-semibold text-primary hover:bg-accent/70 dark:text-foreground" onClick={onConnect}>
              {failed && link ? "다시 시도" : "연결"}
            </Button>
          )
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
