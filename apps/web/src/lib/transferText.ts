import type { TransferView } from "./peerTransfer";

export function percent(t: Pick<TransferView, "done" | "total">): number {
  return t.total > 0 ? Math.min(100, Math.floor((t.done / t.total) * 100)) : 0;
}

/** "약 1분" / "약 40초" / "" when the rate is unknown. */
export function formatEta(remainingBytes: number, bytesPerSec: number): string {
  if (bytesPerSec <= 0 || remainingBytes <= 0) return "";
  const s = Math.ceil(remainingBytes / bytesPerSec);
  if (s < 60) return `약 ${Math.max(s, 1)}초`;
  const totalMin = Math.ceil(s / 60);
  if (totalMin < 60) return `약 ${totalMin}분`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `약 ${h}시간` : `약 ${h}시간 ${m}분`;
}

export function statusLine(t: TransferView): string {
  const verb = t.direction === "send" ? "보내는 중" : "받는 중";
  switch (t.status) {
    case "waiting":
      return t.direction === "send" ? "상대가 수락하길 기다려요" : "수락을 기다려요";
    case "active":
      return verb;
    case "complete":
      return t.direction === "send" ? "보냈어요" : "받았어요";
    case "failed":
      return "전송이 끊겼어요. 다시 시도해 주세요";
    case "rejected":
      return "상대가 받지 않았어요";
    case "cancelled":
      return "취소됐어요";
  }
}
