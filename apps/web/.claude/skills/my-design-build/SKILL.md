---
name: my-design-build
description: Production-grade site/UI pipeline — design direction from the brief (no reference site), build, screenshot critique loop, audits, preview deploy. Run only when the user types /my-design-build.
disable-model-invocation: true
---

# My Design Build Pipeline

Goal: ship a site that does not look AI-generated, verified by measurements, not by your own opinion.
Run from the frontend root (`<repo>/frontend`, Vite). Inputs live there: `SPEC.md` (what to build, acceptance criteria) and `DESIGN.md` (visual system).
Dev server URL: `$DEV_URL`, default `http://localhost:5173`. Below, `<url>` means that value.

## Token rules (follow strictly)
- Screenshots: above-the-fold only (`node scripts/shoot.mjs <url>`). Use `--full` once, at the final check.
- Max 3 critique rounds per page. If still failing, stop and report what blocks you.
- Never paste Lighthouse JSON into context. Run `bash scripts/lh.sh <url>` — it prints scores only.
- Run tests/builds and read only failures (the project hook filters plain `npm test`/`npm run build`).
- Do not re-read files you just edited.

## Human checkpoints
There are exactly two. Ask with AskUserQuestion (screenshot paths in each option), then record the choice and reason in `DECISIONS.md` — it doubles as design-decision evidence.
1. Design direction pick (Stage 1)
2. Hero variant pick (Stage 4)

## Stage 0 — Brief
Read `SPEC.md`. If product, audience, sections, or design-direction words are empty, ask once for all missing items together. Do not invent business facts, prices, testimonials, or user counts.

## Stage 1 — Design direction from the brief (no reference site)
- If `DESIGN.md` exists, use it and skip to Stage 2.
- Never copy or imitate an existing site or brand. Derive the look only from SPEC.md: audience, use context, mood words, things to avoid.
- If SPEC.md sets a mood reference, translate it into abstract principles (spacing, type hierarchy, color restraint, motion stance) inside each direction's rationale. Never copy that brand's colors, fonts, logos, or layouts.
- Run Impeccable's `init` to capture product context in PRODUCT.md (skip if it exists).
- Decide the surface mode: landing/marketing pages may be distinctive and bold; app screens and dashboards stay restrained and use familiar patterns.
- Propose 3 clearly different directions. Each = a one-line concept, type pairing, color roles (body text contrast at least 4.5:1), spacing scale, radius, motion stance, and 2 things it avoids. Render each as a hero mock at `?dir=1`, `?dir=2`, `?dir=3` and screenshot them.
- CHECKPOINT 1: the user picks one direction.
- Write the chosen direction's tokens into `DESIGN.md`. It is our own system, not borrowed.

## Stage 2 — Design context
Turn Impeccable's auto detector hook off for this project (`impeccable hooks off`) — we audit explicitly in Stage 6. Delete the losing direction mocks.

## Stage 3 — Build
- Implement sections from SPEC.md using DESIGN.md tokens only (CSS variables / Tailwind theme). No hard-coded colors outside the token file.
- UI primitives come only from shadcn/ui (`npx shadcn@4.21.1 add <component>`), themed by mapping DESIGN.md tokens onto shadcn's CSS variables. No other component library, no pasted community component dumps.
- Real copy from SPEC.md. No lorem ipsum, no fake logos, no fabricated testimonials.
- Images: only files in `public/assets/`. If none, use typography, CSS, and SVG shapes. Never hotlink stock images.
- Motion: apply emil-design-eng principles. Respect `prefers-reduced-motion`.
- Data from the backend comes only through the OpenAPI-generated types; never hand-write API response types.

## Stage 4 — Hero variants
Build two hero variants reachable at `?v=a` and `?v=b`. Screenshot both. CHECKPOINT 2. Delete the losing variant.

## Stage 5 — Visual loop (max 3 rounds)
1. `node scripts/shoot.mjs <url>` → read the 3 PNGs and any console errors printed.
2. Critique against DESIGN.md: hierarchy, spacing rhythm, alignment, contrast, mobile layout, overflow.
3. Fix the top 3 issues only. Repeat.

## Stage 6 — Audits (all must pass)
- Impeccable audit: 0 critical issues.
- `bash scripts/lh.sh <url>` (mobile): performance ≥ 90, accessibility ≥ 95, best-practices ≥ 95, seo ≥ 95.
- Zero console errors in shoot.mjs output.
- `npm run lint` (if defined) and `npm run build` pass.
- Run Impeccable's `document` so DESIGN.md matches what was actually built.

## Stage 7 — Ship
- Branch: `git pull` the base (`develop` if it exists, else the default branch), then `feature/<slug>` off its tip. Never commit to main/master/develop.
- Commit with `/commit` (Conventional Commits, `feat:` …). Confirm with the user before pushing; push as a separate step.
- Cloudflare Pages' GitHub integration deploys a preview for the pushed branch.
- Remind the user to run `/security-review` before merging.
- Final report: preview URL, Lighthouse scores, what changed, open issues, and entries added to DECISIONS.md.
