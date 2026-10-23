#!/bin/bash
# POST A PREPLAY VIDEO TO X FROM DONOVAN'S MAC (2026-10-22). One command:
#
#   bash post-preplay.sh <video.mp4> <post.txt> <first pitch, ISO UTC>
#   e.g. bash ~/Downloads/post-preplay.sh ~/Downloads/preplay-ws-game1.mp4 ~/Downloads/preplay-ws-game1-post.txt 2026-10-24T00:00:00Z
#
# Runs from anywhere (Downloads is fine): it finds your site checkout at ~/Desktop/moonshot-push (set SITE=... to use another).
#
# What it does:
#   1. the first time only: makes a second copy of the site next to this one (~/Desktop/moonshot-preplay, a git worktree on
#      the preplay-tracking-look branch, which has the video poster), installs it, and links your .env.local (the X keys)
#      into it. Your own checkout is never switched or touched.
#   2. a dry run: prints the post exactly as X will get it, the video's size, and minutes to first pitch
#   3. asks you: post it? (y/n). Only "y" sends.
#   4. uploads the video to X, posts it on @CalledItHR, prints the post id. Never after first pitch.
set -euo pipefail
VIDEO="${1:?usage: bash post-preplay.sh <video.mp4> <post.txt> <first pitch ISO, e.g. 2026-10-24T00:00:00Z>}"
TEXT="${2:?the post text file}"
LOCK="${3:?first pitch, UTC ISO (e.g. 2026-10-24T00:00:00Z)}"
HERE="${SITE:-$HOME/Desktop/moonshot-push}"
[ -d "$HERE/.git" ] || [ -f "$HERE/.git" ] || { echo "no site checkout at $HERE (set SITE=/path/to/moonshot-push)"; exit 1; }
COPY="$(dirname "$HERE")/moonshot-preplay"
VIDEO="$(cd "$(dirname "$VIDEO")" && pwd)/$(basename "$VIDEO")"
TEXT="$(cd "$(dirname "$TEXT")" && pwd)/$(basename "$TEXT")"

cd "$HERE"
git fetch -q origin preplay-tracking-look
if [ ! -d "$COPY" ]; then
  echo "first time: making $COPY (the preplay branch, next to your checkout)"
  git worktree add -q --detach "$COPY" origin/preplay-tracking-look
  (cd "$COPY" && npm ci --no-audit --no-fund >/dev/null)
else
  (cd "$COPY" && git checkout -q --detach origin/preplay-tracking-look)
fi
[ -f "$HERE/.env.local" ] && ln -sf "$HERE/.env.local" "$COPY/.env.local"
[ -f "$COPY/.env.local" ] || { echo "no .env.local with the X keys in $HERE: nothing posted"; exit 1; }

cd "$COPY"
node --import ./scripts/_esm-resolve.mjs scripts/post-x-video.mjs --video "$VIDEO" --text "$TEXT" --before "$LOCK" --dry 2>/dev/null
read -r -p "Post this to @CalledItHR now? (y/n) " ok
[ "$ok" = "y" ] || { echo "not posted"; exit 0; }
node --import ./scripts/_esm-resolve.mjs scripts/post-x-video.mjs --video "$VIDEO" --text "$TEXT" --before "$LOCK" 2>&1 | grep -v "MODULE_TYPELESS\|Reparsing\|To eliminate\|trace-warnings"
