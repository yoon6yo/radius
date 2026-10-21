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

export function Hero({ status, name }: { status: HeroStatus; name: string | undefined }) {
  const live = status === "online";
  return (
    <section className="relative mt-6 overflow-hidden rounded-[28px] bg-primary px-6 py-6 text-primary-foreground" aria-label="내 기기">
      <Rings />
      <p className="text-sm">내 기기</p>
      <p className="mt-1 truncate text-2xl font-bold tracking-tight">{name ?? "연결하는 중"}</p>
      <p className="mt-3 flex items-center gap-2 text-sm">
        <i className={`size-2 rounded-full ${live ? "bg-emerald-400" : "bg-amber-300"}`} />
        {STATUS_TEXT[status]}
      </p>
    </section>
  );
}
