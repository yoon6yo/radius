import { useEffect, useRef } from "react";
import { deviceFingerprint, type FileMeta } from "@radius/protocol";
import { Button } from "@/components/ui/button";
import { safeName } from "@/lib/exportOpfs";
import { formatBytes } from "@/lib/format";

export interface IncomingOffer {
  from: string;
  peerId: string;
  /** Another online peer uses the same display name. */
  duplicate: boolean;
  files: FileMeta[];
}

/** Modal consent sheet; Escape counts as decline and "거절" has the initial focus. */
export function AcceptDialog({ offer, onAnswer }: { offer: IncomingOffer | null; onAnswer(accept: boolean): void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (offer && !d.open) d.showModal();
    if (!offer && d.open) d.close();
  }, [offer]);

  const total = offer?.files.reduce((n, f) => n + f.size, 0) ?? 0;

  return (
    <dialog
      ref={ref}
      aria-labelledby="accept-title"
      onCancel={(e) => {
        e.preventDefault();
        onAnswer(false);
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-[32px] border-0 bg-card p-7 text-foreground shadow-xl backdrop:bg-black/40"
      data-testid="accept-dialog"
    >
      {offer && (
        <>
          <h2 id="accept-title" className="break-keep text-[28px] font-bold leading-tight tracking-tight">
            {offer.from}님이 {offer.files.length === 1 ? "파일을" : `파일 ${offer.files.length}개를`} 보내려고 해요
          </h2>
          <p className="mt-4 text-[13px] text-muted-foreground">보낸 기기 번호</p>
          <p className="text-[28px] font-bold leading-tight tracking-[0.12em] tabular-nums" data-testid="fingerprint">
            {deviceFingerprint(offer.peerId)}
          </p>
          <p className="mt-1 text-[13px] text-muted-foreground">모르는 기기에서 온 파일이면 거절해 주세요. 총 {formatBytes(total)}</p>
          {offer.duplicate && (
            <p role="alert" className="mt-3 rounded-2xl bg-destructive/10 px-4 py-3 text-[13px] font-medium text-destructive">
              이름이 같은 기기가 근처에 더 있어요. 받기 전에 기기 번호를 확인해 주세요.
            </p>
          )}
          <ul className="mt-5 max-h-64 overflow-auto" aria-label="받을 파일">
            {offer.files.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-2 text-[15px]">
                <span className="min-w-0 break-all">{safeName(f.path)}</span>
                <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">{formatBytes(f.size)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" autoFocus className="h-12 rounded-full px-6 text-[16px] text-muted-foreground" onClick={() => onAnswer(false)}>
              거절
            </Button>
            <Button className="h-12 rounded-full px-8 text-[16px] font-semibold" onClick={() => onAnswer(true)}>
              받기
            </Button>
          </div>
        </>
      )}
    </dialog>
  );
}
