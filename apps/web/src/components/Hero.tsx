import { useState } from "react";
import { Pencil } from "lucide-react";

const STATUS_TEXT = {
  online: "연결됨",
  connecting: "연결 중…",
  offline: "연결이 끊겼어요. 인터넷을 확인해 주세요",
  replaced: "다른 창에서 열려 있어요",
} as const;

export type HeroStatus = keyof typeof STATUS_TEXT;

/** Calm range rings: the product's one decorative move. Static, stacked circles under reduced motion. */
function Rings() {
  return (
    <div aria-hidden className="pointer-events-none absolute right-12 top-1/2 size-0 text-primary-foreground">
      <svg className="absolute left-1/2 top-1/2 size-0 overflow-visible">
        {[0, 1.2, 2.4].map((delay, i) => (
          <circle
            key={delay}
            r="40"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            className="ripple"
            style={{ animationDelay: `${-delay}s`, ["--rs" as string]: 1 + i * 0.7, ["--ro" as string]: 0.3 - i * 0.08 }}
          />
        ))}
      </svg>
    </div>
  );
}

export function Hero({ status, name, onRename }: { status: HeroStatus; name: string | undefined; onRename(name: string): boolean }) {
  const live = status === "online";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [invalid, setInvalid] = useState(false);

  const commit = () => {
    if (draft.trim() === (name ?? "")) return setEditing(false);
    if (onRename(draft)) setEditing(false);
    else setInvalid(true);
  };
  return (
    <section className="relative mt-6 overflow-hidden rounded-[28px] bg-primary px-6 py-6 text-primary-foreground" aria-label="내 기기">
      <Rings />
      <p className="text-sm">내 기기</p>
      {editing ? (
        <form
          className="mt-1 flex items-center gap-2"
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
            className="h-10 min-w-0 flex-1 rounded-full bg-primary-foreground px-4 text-lg font-semibold text-foreground outline-none"
          />
          <button type="submit" className="h-10 shrink-0 rounded-full bg-primary-foreground/20 px-4 text-sm font-semibold">
            저장
          </button>
        </form>
      ) : (
        <p className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight">
          <span className="min-w-0 truncate">{name ?? "연결하는 중"}</span>
          {name && (
            <button
              type="button"
              aria-label="기기 이름 바꾸기"
              onClick={() => {
                setDraft(name);
                setInvalid(false);
                setEditing(true);
              }}
              className="grid size-8 shrink-0 place-items-center rounded-full bg-primary-foreground/15"
            >
              <Pencil className="size-4" aria-hidden />
            </button>
          )}
        </p>
      )}
      {invalid && (
        <p role="alert" className="mt-1 text-sm">
          이름은 1~32자로 줄바꿈 없이 입력해 주세요.
        </p>
      )}
      <p className="mt-3 flex items-center gap-2 text-sm">
        <i className={`size-2 rounded-full ${live ? "bg-emerald-400" : "bg-amber-300"}`} />
        {STATUS_TEXT[status]}
      </p>
    </section>
  );
}
