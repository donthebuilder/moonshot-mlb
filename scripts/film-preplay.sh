#!/bin/bash
# FILM A PREPLAY (OR AN X CUT) ON DONOVAN'S MAC (2026-10-23; Donovan: "if it's gonna take an hour every time" -- the cloud
# copy has no graphics card; a Mac films the same video in minutes). One command:
#
#   bash film-preplay.sh <sport> <game id> [recorder options]
#   e.g. bash ~/Downloads/film-preplay.sh mlb 849802 --day today          (World Series Game 2's PREPLAY)
#        bash ~/Downloads/film-preplay.sh nfl 401873010 --x               (a TUDDY replay, the X cut)
#
# What it does: uses the same second copy of the site as post-preplay.sh (~/Desktop/moonshot-preplay, the
# preplay-tracking-look branch; made the first time, your own checkout never touched), builds it, starts it on
# localhost:3312 with your .env.local, films the stage with scripts/record-replay.mjs into ~/Downloads, stops the server,
# and prints the post-preplay.sh command to post it. Nothing is posted by this script.
set -euo pipefail
SPORT="${1:?usage: bash film-preplay.sh <mlb|nhl|nfl|nba> <game id> [--day today] [--x]}"
GAME="${2:?the game id (MLB gamePk, NHL game id, ESPN event id)}"
shift 2
HERE="${SITE:-$HOME/Desktop/moonshot-push}"
[ -d "$HERE/.git" ] || [ -f "$HERE/.git" ] || { echo "no site checkout at $HERE (set SITE=/path/to/moonshot-push)"; exit 1; }
command -v ffmpeg >/dev/null || { echo "needs ffmpeg to make the video: brew install ffmpeg"; exit 1; }
COPY="$(dirname "$HERE")/moonshot-preplay"

cd "$HERE"
git fetch -q origin preplay-tracking-look
if [ ! -d "$COPY" ]; then
  echo "first time: making $COPY (the preplay branch, next to your checkout)"
  git worktree add -q --detach "$COPY" origin/preplay-tracking-look
  (cd "$COPY" && npm ci --no-audit --no-fund >/dev/null)
else
  (cd "$COPY" && git checkout -q --detach origin/preplay-tracking-look && npm ci --no-audit --no-fund >/dev/null)
fi
[ -f "$HERE/.env.local" ] && ln -sf "$HERE/.env.local" "$COPY/.env.local"

cd "$COPY"
echo "building the site (a few minutes)…"
npm run build >/tmp/preplay-build.log 2>&1 || npm run build >/tmp/preplay-build.log 2>&1 || { echo "build failed: see /tmp/preplay-build.log"; exit 1; }
npx next start -p 3312 >/tmp/preplay-server.log 2>&1 &
SRV=$!
trap 'kill $SRV 2>/dev/null || true' EXIT
for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:3312 && break; sleep 1; done

OUT="$HOME/Downloads/preplay-$SPORT-$GAME$( [[ " $* " == *" --x "* ]] && echo "-x" ).mp4"
echo "filming → $OUT"
node scripts/record-replay.mjs --sport "$SPORT" --game "$GAME" --base http://localhost:3312 --fps 30 --tail 0.4 --out "$OUT" "$@" 2>&1 | grep -v "MODULE_TYPELESS\|Reparsing\|To eliminate\|trace-warnings"
echo
echo "filmed: $OUT"
echo "to post it (shows the post, asks y/n, never after the start):"
echo "  bash ~/Downloads/post-preplay.sh \"$OUT\" ~/Downloads/<post>.txt <start time, ISO UTC>"
