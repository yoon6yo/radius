import { useEffect, useRef } from "react";
import type { FileMeta } from "@radius/protocol";
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

const MAX_LISTED = 10;

/** Modal consent sheet; Escape counts as decline and Decline has the initial focus. */
export function AcceptDialog({ offer, onAnswer }: { offer: IncomingOffer | null; onAnswer(accept: boolean): void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (offer && !d.open) d.showModal();
    if (!offer && d.open) d.close();
  }, [offer]);

  const total = offer?.files.reduce((n, f) => n + f.size, 0) ?? 0;
  const listed = offer?.files.slice(0, MAX_LISTED) ?? [];
  const more = (offer?.files.length ?? 0) - listed.length;

  return (
    <dialog
      ref={ref}
      aria-labelledby="accept-title"
      onCancel={(e) => {
        e.preventDefault();
        onAnswer(false);
      }}
      className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-xl border border-neutral-200 p-5 backdrop:bg-black/40"
      data-testid="accept-dialog"
    >
      {offer && (
        <>
          <h2 id="accept-title" className="text-lg font-semibold">
            {offer.from} wants to send {offer.files.length === 1 ? "a file" : `${offer.files.length} files`}
          </h2>
          <p className="mt-1 text-sm text-neutral-500">
            Device ID <span className="font-mono">{offer.peerId.slice(0, 8)}</span> · Total {formatBytes(total)}
          </p>
          {offer.duplicate && (
            <p role="alert" className="mt-2 text-sm font-medium text-red-600">
              Another device here has the same name. Check the device ID before accepting.
            </p>
          )}
          <ul className="mt-3 max-h-48 space-y-1 overflow-auto text-sm">
            {listed.map((f, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="break-all">{safeName(f.path)}</span>
                <span className="shrink-0 tabular-nums text-neutral-500">{formatBytes(f.size)}</span>
              </li>
            ))}
            {more > 0 && <li className="text-neutral-500">… +{more} more</li>}
          </ul>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" autoFocus onClick={() => onAnswer(false)}>
              Decline
            </Button>
            <Button onClick={() => onAnswer(true)}>Accept</Button>
          </div>
        </>
      )}
    </dialog>
  );
}
