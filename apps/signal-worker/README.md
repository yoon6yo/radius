# @radius/signal-worker

Cloudflare Workers port of `apps/signal`. One Durable Object (`SignalHub`) holds every room, so free-plan duration stays under 24h x 128 MB per day.

## Local
`pnpm --filter @radius/signal-worker dev` (wrangler dev, `--local`), then `VITE_SIGNAL_URL=ws://localhost:8787/ws` for the web app.

## Deploy
1. `pnpm --filter @radius/signal-worker exec wrangler login`
2. Set `ALLOWED_ORIGINS` in `wrangler.toml` to the web origin (e.g. `https://radius.pages.dev`).
3. `pnpm --filter @radius/signal-worker deploy` -> `https://radius-signal.<account>.workers.dev`
4. Build the web with `VITE_SIGNAL_URL=wss://radius-signal.<account>.workers.dev/ws` and publish `apps/web/dist` to Pages.
