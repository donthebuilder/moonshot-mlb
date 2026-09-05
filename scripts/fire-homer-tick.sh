#!/bin/bash
# Fire one homer-feed tick by hand and see what it did — the same call the
# Vercel cron makes every minute. Run from the Mac:
#
#   CRON_SECRET=<the value on Vercel> bash fire-tick.sh
#
# Reads: { day, seen, fresh, discord, x, xFailed, board, mode }
#   seen     homers in the live feed right now
#   fresh    ones this call was the first to record (and posted)
#   pregame  set when the pregame call went out (its X post id, or "already")
#   skipped  "no-games" / "nothing-started" — nothing to do yet
#
# Safe to run as often as you like: every claim is an insert that either
# sticks or doesn't, so a second run never double-posts.
set -euo pipefail
SITE="${DASH_SITE_URL:-https://dashnetwork.vercel.app}"
: "${CRON_SECRET:?set CRON_SECRET to the value on Vercel}"
curl -sS -H "Authorization: Bearer ${CRON_SECRET}" "${SITE}/api/dash/homers/tick" | python3 -m json.tool
echo
echo "cards:  ${SITE}/api/dash/homers/card?day=$(date -u +%F)&pregame=1"
echo "        ${SITE}/api/dash/homers/card?day=$(date -u +%F)&recap=1"
echo "page:   ${SITE}/called"
