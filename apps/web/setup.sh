#!/usr/bin/env bash
# Run from the frontend root (the dir with package.json, e.g. <repo>/frontend or <repo>/apps/web): bash setup.sh
# Everything installs project-scoped. Versions are pinned (each >= 2 weeks old when chosen).
# Package manager is auto-detected (pnpm / yarn / npm) from the nearest lockfile or workspace file,
# and the script is idempotent: re-running skips what is already set up.
set -euo pipefail

[[ -f package.json ]] || { echo "package.json 없음 — Vite 프론트 루트에서 실행하세요."; exit 1; }
command -v python3 >/dev/null || { echo "python3 필요 (테스트 출력 필터 훅)."; exit 1; }

detect_pm() {
  local d="$PWD"
  while [[ "$d" != "/" ]]; do
    if [[ -f "$d/pnpm-lock.yaml" || -f "$d/pnpm-workspace.yaml" ]]; then echo pnpm; return; fi
    if [[ -f "$d/yarn.lock" ]]; then echo yarn; return; fi
    if [[ -f "$d/package-lock.json" ]]; then echo npm; return; fi
    d="$(dirname "$d")"
  done
  echo npm
}
PM="$(detect_pm)"
echo "package manager: $PM"

# pnpm is often only reachable through corepack; tools such as shadcn spawn a bare `pnpm`, so shim it.
if [[ "$PM" == pnpm ]] && ! command -v pnpm >/dev/null; then
  command -v corepack >/dev/null || { echo "pnpm 또는 corepack 필요."; exit 1; }
  SHIM="$(mktemp -d)"
  printf '#!/bin/sh\nexec corepack pnpm "$@"\n' > "$SHIM/pnpm"
  chmod +x "$SHIM/pnpm"
  export PATH="$SHIM:$PATH"
fi

add_dev() {
  case "$PM" in
    pnpm) pnpm add -D --save-exact "$@" ;;
    yarn) yarn add -D --exact "$@" ;;
    *) npm i -D --save-exact "$@" ;;
  esac
}
run_bin() {
  case "$PM" in
    pnpm) pnpm exec "$@" ;;
    yarn) yarn "$@" ;;
    *) npx "$@" ;;
  esac
}
dlx() {
  case "$PM" in
    pnpm) pnpm dlx "$@" ;;
    yarn) yarn dlx "$@" ;;
    *) npx -y "$@" ;;
  esac
}

# Prerequisites shadcn needs. Tailwind and the alias touch project config, so they are never auto-edited.
if ! grep -q '"tailwindcss"' package.json; then
  echo "Tailwind 미설정. 먼저: tailwindcss @tailwindcss/vite 설치, vite.config에 플러그인 추가, CSS에 @import \"tailwindcss\"."
  exit 1
fi
if ! grep -q '"@/\*"' tsconfig*.json 2>/dev/null; then
  echo "경로 별칭 미설정. tsconfig compilerOptions에 \"baseUrl\": \".\", \"paths\": { \"@/*\": [\"./src/*\"] } 를 추가하고,"
  echo "vite.config의 resolve.alias에 \"@\" → ./src 를 추가한 뒤 다시 실행하세요."
  exit 1
fi
if [[ ! -f components.json ]]; then
  # -p is required: without a preset the CLI blocks on an interactive menu. `echo n` answers the re-install prompt.
  echo n | dlx shadcn@4.21.1 init -t vite -b radix -p nova -y
fi

SKILLS_CLI="skills@1.7.0"
npx -y "$SKILLS_CLI" add pbakaus/impeccable --skill impeccable --agent claude-code -y
npx -y "$SKILLS_CLI" add emilkowalski/skills --skill emil-design-eng --agent claude-code -y
npx -y "$SKILLS_CLI" add vercel-labs/agent-skills --skill web-design-guidelines --agent claude-code -y

add_dev playwright@1.63.0
run_bin playwright install chromium

chmod +x .claude/hooks/*.sh

touch .gitignore
for p in '.env*' '!.env.example' 'shots/' 'SECRETS.md'; do
  grep -qxF "$p" .gitignore || echo "$p" >> .gitignore
done

echo "완료. skills-lock.json은 커밋해 스킬 버전을 고정하세요. 서드파티 스킬은 전체 에이전트 권한으로 실행되니 .claude/skills/*/scripts 를 한 번 훑어보세요."
echo "다음: SPEC.md 채우기 → $PM run dev → /my-design-build"
