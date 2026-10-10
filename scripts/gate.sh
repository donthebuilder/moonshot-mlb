#!/usr/bin/env bash
# THE PUSH GATE (BATCH-GAME-WRITEUP, 2026-10-04; CLAUDE.md "Before any push").
# One command, every check, fails on the first error:
#
#   scripts/gate.sh "/app#sport=nfl&tab=games,/admin"        # the pages you changed
#   scripts/gate.sh --base https://dashnetwork.vercel.app "..." # after the deploy, against prod
#
# Local: npm run build, check-routes, check-parity, check-scales, check-shell-route, check-no-printed-probability, then `next start` on :3108 and
# check-market-chips + check-interactions --quick (taps), check-mobile --all + check-clickable on the pages. Reports go to a temp folder
# (never the repo's mobile-report/). Exit 0 = green.
set -euo pipefail
cd "$(dirname "$0")/.."
BASE=""
if [ "${1:-}" = "--base" ]; then BASE="$2"; shift 2; fi
PAGES="${1:?usage: scripts/gate.sh [--base URL] \"<comma-separated pages>\"}"
OUT="$(mktemp -d "${TMPDIR:-/tmp}/gate.XXXXXX")"
REPO="$PWD"
echo "gate: reports in $OUT"

if [ -z "$BASE" ]; then
  echo "--- build";  npm run build > "$OUT/build.log" 2>&1 || { tail -30 "$OUT/build.log"; echo "GATE FAIL: build"; exit 1; }
  echo "--- routes"; node scripts/check-routes.mjs || { echo "GATE FAIL: check-routes"; exit 1; }
  echo "--- odds/numerology aliases"; node scripts/check-odds-alias.mjs || { echo "GATE FAIL: check-odds-alias"; exit 1; }
  echo "--- parity"; node scripts/check-parity.mjs > "$OUT/parity.log" 2>&1 || { grep -E "^FAIL|^parity" "$OUT/parity.log"; echo "GATE FAIL: check-parity"; exit 1; }
  echo "--- scales"; node scripts/check-scales.mjs > "$OUT/scales.log" 2>&1 || { tail -20 "$OUT/scales.log"; echo "GATE FAIL: check-scales"; exit 1; }
  echo "--- shell routes + slate words"; node scripts/check-shell-route.mjs > "$OUT/shell.log" 2>&1 || { grep FAIL "$OUT/shell.log"; echo "GATE FAIL: check-shell-route"; exit 1; }
  echo "--- no printed probability"; node scripts/check-no-printed-probability.mjs || { echo "GATE FAIL: check-no-printed-probability"; exit 1; }
  npx next start -p 3108 > "$OUT/server.log" 2>&1 &
  SERVER=$!
  trap 'kill $SERVER 2>/dev/null || true' EXIT
  for _ in $(seq 1 60); do curl -s -o /dev/null http://localhost:3108/ && break; sleep 1; done
  BASE="http://localhost:3108"
  # The crash class that shipped for three days (a market chip that throws after a tap) is only caught by TAPPING.
  # Both run from the repo root (they resolve playwright from the cwd). ~2 min each.
  echo "--- market chips"; node scripts/check-market-chips.mjs --base "$BASE" > "$OUT/chips.log" 2>&1 || { tail -20 "$OUT/chips.log"; echo "GATE FAIL: check-market-chips"; exit 1; }
  echo "--- interactions (quick)"; node scripts/check-interactions.mjs --quick --base "$BASE" --out "$OUT/interaction-report" > "$OUT/interactions.log" 2>&1 || { grep -E "^\[" -A3 "$OUT/interactions.log" | head -40; echo "GATE FAIL: check-interactions"; exit 1; }
fi

cd "$OUT"
echo "--- phone checks ($BASE)"
NODE_PATH="$REPO/node_modules" node "$REPO/scripts/check-mobile.mjs" --all --base "$BASE" --pages "$PAGES" 2>&1 | grep -v -i "deprecat\|trace-\|Reparsing\|module type\|type\": \"module" | tail -3
grep -q "^None\.$" <(sed -n '/^## Errors/,/^## /p' mobile-report/index.md) || { sed -n '/^## Errors/,/^## Warnings/p' mobile-report/index.md | head -40; echo "GATE FAIL: check-mobile has errors"; exit 1; }
echo "--- tap checks"
NODE_PATH="$REPO/node_modules" node "$REPO/scripts/check-clickable.mjs" --base "$BASE" --pages "$PAGES" 2>&1 | grep "not tappable" | tee clickable.txt
tail -1 clickable.txt | grep -q "^0 not tappable" || { echo "GATE FAIL: untappable names / teams / games"; exit 1; }
echo "GATE GREEN"
