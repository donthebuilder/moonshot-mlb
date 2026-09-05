#!/bin/bash
# ── SHIP ────────────────────────────────────────────────────────────────────
# One command. Checks the build, pushes, tells you what happens next.
# Run it from anywhere:   bash ~/Desktop/moonshot-push/SHIP.sh
set -uo pipefail
cd "$(dirname "$0")" || exit 1

echo "── where you are ──"
git rev-parse --abbrev-ref HEAD | sed 's/^/  branch: /'
AHEAD=$(git rev-list --count @{u}..HEAD 2>/dev/null || echo '?')
echo "  unpushed commits: $AHEAD"
if [ "$AHEAD" = "0" ]; then echo; echo "Nothing to push. Already live."; exit 0; fi
echo
git --no-pager log --oneline @{u}..HEAD | sed 's/^/  /'
echo

# ── deps ───────────────────────────────────────────────────────────────────
# A commit can add a dependency to package.json, and package.json alone does
# not put it on disk. That is exactly how the Edge Config commit failed here:
# the build could not find @vercel/edge-config because nothing had installed
# it yet. So: if package.json is newer than node_modules, install first.
if [ ! -d node_modules ] || [ package.json -nt node_modules ] || [ package-lock.json -nt node_modules ]; then
  echo "── deps (package.json changed) ──"
  if npm install >/tmp/ship-npm.log 2>&1; then
    touch node_modules
    echo "  ok"
  else
    echo "  npm install FAILED — nothing pushed. Last 20 lines:"
    tail -20 /tmp/ship-npm.log | sed 's/^/    /'
    exit 1
  fi
  echo
fi

echo "── build ──"
if ! npx next build >/tmp/ship-build.log 2>&1; then
  echo "  BUILD FAILED — nothing pushed. Last 20 lines:"
  tail -20 /tmp/ship-build.log | sed 's/^/    /'
  exit 1
fi
echo "  ok"
echo

echo "── checks ──"
FAIL=0
for s in scripts/check-*.mjs; do
  if node "$s" >/dev/null 2>&1; then echo "  ok   $(basename "$s")"
  else echo "  FAIL $(basename "$s")"; FAIL=1; fi
done
if [ "$FAIL" = "1" ]; then echo; echo "A check failed — nothing pushed. Run the failing one to see why."; exit 1; fi
echo

echo "── push ──"
if ! git push origin "$(git rev-parse --abbrev-ref HEAD)"; then
  echo
  echo "Push failed. If it asked for a username, you need a GitHub token in the"
  echo "keychain:  gh auth login   (or set up a credential helper)."
  exit 1
fi
echo
echo "Pushed. Vercel builds automatically — give it about a minute."
echo
echo "This deploy turns on the FRANCHISE draft clock (vercel.json cron,"
echo "every minute). Nothing to configure: it reuses the CRON_SECRET that"
echo "already runs your push notifications. To confirm it is alive, open"
echo "Vercel → your project → Cron Jobs and look for /api/fantasy/draft-tick."
