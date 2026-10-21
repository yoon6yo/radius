# My Design Kit (로컬 환경 맞춤판)

원본 대비 바뀐 점: 전역 설정(auto 모드·opusplan·시크릿 차단·sandbox)은 이미 `~/.claude/settings.json`에 있으므로 키트에는 프로젝트 전용 항목만 남김. 훅은 jq 대신 python3, 도구 버전 고정, 기본 URL은 Vite(5173), 체크포인트는 무인 자동선택 대신 질문, 배포 단계는 전역 Git 규칙(develop 분기·/commit·push 전 확인)을 따름.

## 스택 (역할당 1개 — 같은 역할 스킬 중복 설치 금지)
- 취향 총괄: Impeccable (frontend-design 포함 상위호환 → Taste/Hallmark/ui-ux-pro-max/frontend-design 설치 금지)
- 모션: emil-design-eng · 규칙/접근성: web-design-guidelines · 컴포넌트: shadcn/ui(Vite+React+TS+Tailwind) · 검증: Playwright+Lighthouse
- Apple/Nothing 등은 설치하지 않고 SPEC.md "무드 레퍼런스"의 원칙 차용으로만 사용. 21st.dev 미사용.
- 사전조건: Tailwind + `npx shadcn@4.21.1 init` 완료 (setup.sh가 확인)

## 설치 (프로젝트마다 1회)
- Claude Code에서 `/my-design-init [경로]` — 이 템플릿을 인자 경로 → `<repo>/frontend` → `<repo>/apps/web` → 현재 폴더 순으로 `package.json`이 있는 곳에 복사(기존 파일은 덮어쓰지 않음)하고 `setup.sh` 실행. 패키지 매니저(pnpm/yarn/npm)는 자동 감지
- Cloudflare Pages에서 GitHub 저장소 연결 (루트 디렉터리 = 설치 경로, 빌드 `<pm> run build`, 출력 `dist`) — 토큰 불필요, push = 배포

## 실행
1. `SPEC.md` 채우기, 에셋은 `public/assets/`
2. `npm run dev` (포트가 5173이 아니면 `DEV_URL` 지정)
3. `frontend/`에서 Claude Code 실행 후:
   ```
   /my-design-build
   /goal SPEC.md 수용 기준 체크박스가 전부 [x]이고 프리뷰 URL을 보고할 때까지, 또는 30턴 후 중단
   ```
4. 체크포인트 2번(디자인 방향 3개 중 선택, 히어로 시안 선택)과 push 확인에만 응답. 선택 근거는 DECISIONS.md에 남음
5. 머지 전 `/security-review`

## 파일
- `.claude/skills/my-design-build/SKILL.md` — 파이프라인 (`/my-design-build`로만 실행)
- `.claude/settings.json` — 테스트 출력 필터 훅, `printenv`/`env` 차단 (나머지 차단 규칙은 전역)
- `.claude/hooks/filter-test-output.{sh,py}` — 단순 테스트·빌드 명령만 실패 줄로 축약. `&&`·파이프 등이 섞인 명령은 손대지 않음
- `scripts/shoot.mjs` — 3개 폭 스크린샷 + 콘솔 에러
- `scripts/lh.sh` — Lighthouse 점수만 출력 (Playwright Chromium 사용)
- `SPEC.md` — /goal 완료 기준
- `SECRETS.md` — 준 권한 목록(값 없음, gitignore됨)
