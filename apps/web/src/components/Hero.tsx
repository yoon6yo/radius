import { memo, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { askLevels, peerWave, wavePath } from "@/lib/peerWave";

const STATUS_TEXT = {
  online: "연결됨",
  connecting: "연결 중…",
  offline: "연결이 끊겼어요. 인터넷을 확인해 주세요",
  replaced: "다른 창에서 열려 있어요",
} as const;

export type HeroStatus = keyof typeof STATUS_TEXT;

const MAX_WAVES = 6;
const WIDTH = 1260; // longest column (512) + the 420 slide, rounded up to whole periods
const color = (hue: number) => `oklch(0.66 0.17 ${hue})`;

/** One device's wave; memoised so transfer progress ticks do not rebuild the path data. */
const PeerPath = memo(function PeerPath({ id, busy }: { id: string; busy: boolean }) {
  const w = useMemo(() => peerWave(id), [id]);
  const d = useMemo(
    () => (busy ? wavePath(w.period, w.amp * 1.8, WIDTH, askLevels(w)) : wavePath(w.period, w.amp, WIDTH)),
    [busy, w],
  );
  return (
    <g className="wave-in">
      <g className="wave-slide" style={{ animationDuration: `${busy ? w.dur / 1.5 : w.dur}s` }}>
        <path d={d} stroke={color(w.hue)} strokeWidth="2" strokeOpacity="0.85" />
      </g>
    </g>
  );
});

/**
 * The product's one decorative move: a signal wave crossing the devices in range.
 * Every nearby device adds its own wave (colour, frequency, speed from its id).
 * A device mid-transfer sends an amplitude-keyed wave; flat when offline; static under reduced motion.
 */
function Wave({ live, peers, activeIds }: { live: boolean; peers: { id: string }[]; activeIds: string[] }) {
  const shown = peers.slice(0, MAX_WAVES);
  return (
    <div aria-hidden className="relative mt-6 h-24 w-full overflow-hidden sm:mt-8 sm:h-[120px]">
      <svg viewBox={`0 0 ${WIDTH} 120`} className="absolute left-0 top-1/2 h-[120px] -translate-y-1/2 overflow-visible" style={{ width: WIDTH }} fill="none">
        {live ? (
          <>
            <g className="wave-slide">
              <path d={wavePath(210, 30, WIDTH)} stroke="var(--primary)" strokeWidth="3" />
            </g>
            <g className="wave-slide" style={{ animationDuration: "11s", animationDirection: "reverse" }}>
              <path d={wavePath(210, 15, WIDTH)} stroke="var(--primary)" strokeWidth="2" strokeOpacity="0.35" />
            </g>
            {shown.map((p) => (
              <PeerPath key={p.id} id={p.id} busy={activeIds.includes(p.id)} />
            ))}
          </>
        ) : (
          <path d={`M0 60 H${WIDTH}`} stroke="var(--primary)" strokeWidth="3" strokeOpacity="0.25" />
        )}
      </svg>
    </div>
  );
}

interface HeroProps {
  status: HeroStatus;
  name: string | undefined;
  peers: { id: string }[];
  /** Devices mid-transfer: their waves carry amplitude-keyed bursts. */
  activeIds?: string[];
  onRename(name: string): boolean;
}

export function Hero({ status, name, peers, activeIds = [], onRename }: HeroProps) {
  const live = status === "online";
  const nearby = peers.length;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);

  const commit = () => {
    if (draft.trim() === (name ?? "")) return setEditing(false);
    if (onRename(draft)) setEditing(false);
    else setInvalid(true);
  };
  return (
    <section className="mt-10 sm:mt-14" aria-label="내 기기">
      <div aria-live="polite" aria-atomic="true">
      <p className="flex items-baseline text-[clamp(88px,30vw,128px)] font-extrabold leading-none tracking-[-0.06em] tabular-nums">
        {live ? nearby : "–"}
        <span className="ml-2 text-[32px] font-bold tracking-tight">대</span>
      </p>
      <p className="mt-4 text-xl text-muted-foreground">
        {!live ? "근처 기기를 찾을 수 없어요" : nearby === 0 ? "근처에 다른 기기가 없어요" : "근처에서 받을 수 있어요"}
      </p>
      </div>
      <Wave live={live} peers={peers} activeIds={activeIds} />

      <div className="mt-6">
        <p className="text-[13px] font-semibold text-muted-foreground">내 기기</p>
        {editing ? (
          <form
            className="mt-1 flex items-center gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              commit();
            }}
          >
            <label className="sr-only" htmlFor="device-name">
              기기 이름
            </label>
            <input
              id="device-name"
              autoFocus
              maxLength={32}
              value={draft}
              aria-invalid={invalid}
              onChange={(e) => {
                setDraft(e.target.value);
                setInvalid(false);
              }}
              onKeyDown={(e) => e.key === "Escape" && setEditing(false)}
              className="min-w-0 flex-1 border-b border-muted-foreground/40 bg-transparent py-1 text-2xl font-bold tracking-tight focus-visible:outline-none focus:border-foreground aria-[invalid=true]:border-destructive"
            />
            <button type="submit" className="shrink-0 py-2 text-[15px] font-semibold text-primary">
              저장
            </button>
            <button type="button" onClick={() => setEditing(false)} className="shrink-0 py-2 text-[15px] text-muted-foreground">
              취소
            </button>
          </form>
        ) : (
          <button
            type="button"
            aria-label="기기 이름 바꾸기"
            disabled={!name}
            onClick={() => {
              setDraft(name ?? "");
              setInvalid(false);
              setEditing(true);
            }}
            className="group mt-1 flex min-h-11 max-w-full items-center gap-2"
          >
            <span className="truncate text-2xl font-bold tracking-tight">{name ?? "연결하는 중"}</span>
            {name && <Pencil className="size-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden />}
          </button>
        )}
        {invalid && (
          <p role="alert" className="mt-2 text-sm text-destructive">
            이름은 1~32자로 줄바꿈 없이 입력해 주세요.
          </p>
        )}
        <p role="status" className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
          <i className={`size-2 rounded-full ${live ? "bg-success" : "bg-warning"}`} />
          {STATUS_TEXT[status]}
        </p>
      </div>
    </section>
  );
}
