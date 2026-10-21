import { encodeWarmupFrame } from "@radius/protocol";
import type { DataLink } from "./types";

/** Enough for SCTP to leave slow start and take its start-up loss while nobody waits on the link. */
export const WARMUP_BYTES = 4 * 1024 * 1024;
const HIGH_WATERMARK = 256 * 1024;

/**
 * Pushes padding the peer drops through the data channels. The first big burst on a fresh link loses
 * its tail and then idles for seconds in SCTP retransmit backoff; doing that here keeps it off the first transfer.
 */
export async function warmUp(link: DataLink, bytes = WARMUP_BYTES): Promise<void> {
  await link.waitReady();
  const frame = encodeWarmupFrame();
  for (let sent = 0; sent < bytes; sent += frame.byteLength) {
    let best = -1;
    for (let c = 0; c < link.channelCount; c++) {
      if (link.isOpen(c) && (best < 0 || link.bufferedAmount(c) < link.bufferedAmount(best))) best = c;
    }
    if (best < 0) return;
    if (link.bufferedAmount(best) >= HIGH_WATERMARK) await link.waitDrain(best);
    if (!link.sendData(best, frame.slice(0))) return;
  }
}
