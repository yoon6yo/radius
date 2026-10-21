#!/usr/bin/env bash
# Usage: bash scripts/lh.sh [url]   — prints Lighthouse mobile scores only.
# Uses Playwright's Chromium when CHROME_PATH is unset, so no separate Chrome install is needed.
set -euo pipefail
URL="${1:-${DEV_URL:-http://localhost:5173}}"
if [[ -z "${CHROME_PATH:-}" ]]; then
  CHROME_PATH="$(node -e 'console.log(require("playwright").chromium.executablePath())')"
  export CHROME_PATH
fi
mkdir -p shots
npx -y lighthouse@13.5.0 "$URL" --quiet \
  --only-categories=performance,accessibility,best-practices,seo \
  --chrome-flags="--headless=new --no-sandbox" \
  --output=json --output-path=shots/lh.json >/dev/null
node -e 'const r=require("./shots/lh.json");for(const [k,v] of Object.entries(r.categories))console.log(k.padEnd(15),Math.round(v.score*100))'
