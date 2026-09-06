#!/usr/bin/env bash
# ── ONE COMMAND TO SHIP ──────────────────────────────────────────────────────
#
# Claude sessions can commit to this repo but cannot push it. Neither machine
# they run on has a credential for github.com: the Linux VM behind the desktop
# file bridge has no keychain, and the cloud container's egress proxy refuses
# writes ("donthebuilder/moonshot-mlb is not in this session's authorized
# repository set"). So the last step is always yours, and this is it.
#
# It also clears stale git lock files first. Those accumulate because the same
# sessions cannot delete through the bridge: any git command of theirs that is
# killed mid-run leaves a .git/index.lock behind, and the NEXT git command --
# usually yours -- fails with "Another git process seems to be running."
#
# Usage:  ./push.sh
set -euo pipefail
cd "$(dirname "$0")"

for lock in .git/index.lock .git/HEAD.lock .git/config.lock; do
  if [ -e "$lock" ] && ! pgrep -f "git " >/dev/null 2>&1; then
    echo "clearing stale $lock"
    rm -f "$lock"
  fi
done
find .git/objects -name 'tmp_obj_*' -delete 2>/dev/null || true

echo "--- unpushed ---"
git --no-pager log --oneline origin/main..HEAD || true
echo "--- status ---"
git status --short

git push origin main
echo "pushed. Vercel builds from main."
