#!/bin/bash
# Fire the homer-feed tick by hand — the same call the Vercel cron makes
# every minute — or post one night's recap on demand.
#
#   bash scripts/fire-homer-tick.sh                       one tick, right now
#   bash scripts/fire-homer-tick.sh --recap 2026-09-04    post that night's recap
#   bash scripts/fire-homer-tick.sh --recap 2026-09-04 --force   re-post it even if it already went out
#
# CRON_SECRET comes from .calledit.env if the ship script saved it there,
# else from the environment, else it is pulled from Vercel.
set -euo pipefail
cd "$(dirname "$0")/.." || exit 1
SITE="${DASH_SITE_URL:-https://dashnetwork.vercel.app}"
SECRET="${CRON_SECRET:-}"
[ -z "$SECRET" ] && [ -f .calledit.env ] && SECRET=$(grep '^CRON_SECRET=' .calledit.env | cut -d= -f2- || true)
if [ -z "$SECRET" ]; then
  npx vercel env pull .env.vercel.tmp --environment=production >/dev/null 2>&1 || true
  SECRET=$(grep '^CRON_SECRET=' .env.vercel.tmp 2>/dev/null | cut -d= -f2- | tr -d '"' || true)
  rm -f .env.vercel.tmp
  [ -n "$SECRET" ] && [ -f .calledit.env ] && printf 'CRON_SECRET=%s\n' "$SECRET" >> .calledit.env
fi
[ -z "$SECRET" ] && { echo "no CRON_SECRET — run: npx vercel login   then try again"; exit 1; }

Q=""
if [ "${1:-}" = "--recap" ]; then
  Q="?recap=${2:?give the night, e.g. --recap 2026-09-04}"
  [ "${3:-}" = "--force" ] && Q="$Q&force=1"
fi
curl -sS -H "Authorization: Bearer ${SECRET}" "${SITE}/api/dash/homers/tick${Q}" | python3 -m json.tool
echo
echo "page:   ${SITE}/called"
