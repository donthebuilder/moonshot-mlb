#!/bin/bash
# ── SHIP CALLED IT ──────────────────────────────────────────────────────────
# One command turns on @CalledItHR. Run it from the Mac's Terminal:
#
#     bash ~/Desktop/moonshot-push/SHIP-CALLEDIT.sh
#
# It does, in order:
#   1. the Supabase migration   (copies the SQL, opens the editor — you press Run)
#   2. the X keys + Discord     (asks once, saves them to .calledit.env, never to git)
#   3. Vercel env vars          (sets them on production for you)
#   4. build · commit · push    (your existing SHIP.sh)
#   5. fires one tick           (so you see the first post without waiting)
#   6. opens the X profile      (the two images are the one thing it cannot upload)
#
# Safe to run twice. Anything already done is skipped or overwritten cleanly.
set -uo pipefail
cd "$(dirname "$0")" || exit 1
ENVF=".calledit.env"
SITE_URL="https://dashnetwork.vercel.app"

say()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
# The prompt goes to STDERR. The first version printed it to stdout, and
# because the caller captures stdout, every saved key began with its own
# label ("  API Key: xxxx") — and Vercel got those. Never again.
ask()  { local v; printf '  %s: ' "$1" >&2; read -r v; printf '%s' "${v//[[:space:]]/}"; }
have() { grep -q "^$1=." "$ENVF" 2>/dev/null; }
getv() { grep "^$1=" "$ENVF" | head -1 | cut -d= -f2-; }
setv() { touch "$ENVF"; chmod 600 "$ENVF"; grep -v "^$1=" "$ENVF" > "$ENVF.tmp" 2>/dev/null || true; printf '%s=%s\n' "$1" "$2" >> "$ENVF.tmp"; mv "$ENVF.tmp" "$ENVF"; }

# ── 1. the database ────────────────────────────────────────────────────────
say "1/6  Supabase migration"
MIG="supabase/migrations/202609050001_homer_feed.sql"
REF=$(grep -o 'NEXT_PUBLIC_SUPABASE_URL=https://[a-z0-9]*' .env.local 2>/dev/null | sed 's#.*https://##')
if have MIGRATED; then
  echo "  already done — skipping (delete MIGRATED= from $ENVF to redo)"
else
  pbcopy < "$MIG"
  echo "  The SQL is on your clipboard. A browser tab is opening on the SQL editor."
  echo "  → press Cmd+V, then click RUN (green button, bottom right)."
  open "https://supabase.com/dashboard/project/${REF:-_}/sql/new"
  printf '  Press Enter here once it says Success… '; read -r _
  setv MIGRATED "$(date +%F)"
fi

# ── 2. the keys ────────────────────────────────────────────────────────────
say "2/6  X app keys"
if have X_API_KEY && have X_API_SECRET && have X_ACCESS_TOKEN && have X_ACCESS_SECRET; then
  echo "  already saved in $ENVF — skipping"
else
  echo "  A browser tab is opening on the X developer portal."
  echo "  In your app → Settings → User authentication settings: set READ AND WRITE."
  echo "  Then Keys and tokens: copy the four values below. If the Access Token"
  echo "  already existed BEFORE you set Read and Write, click Regenerate on it."
  open "https://developer.x.com/en/portal/dashboard"
  echo
  setv X_API_KEY       "$(ask 'API Key')"
  setv X_API_SECRET    "$(ask 'API Key Secret')"
  setv X_ACCESS_TOKEN  "$(ask 'Access Token')"
  setv X_ACCESS_SECRET "$(ask 'Access Token Secret')"
fi
have X_HANDLE || setv X_HANDLE "@CalledItHR"

say "2/6  Discord webhook (optional)"
if have DISCORD_HOMER_WEBHOOK; then
  echo "  already saved — skipping"
else
  echo "  Discord → the channel → Edit channel → Integrations → Webhooks → New → Copy URL."
  echo "  Leave blank to skip Discord for now."
  W=$(ask 'Webhook URL')
  [ -n "$W" ] && setv DISCORD_HOMER_WEBHOOK "$W"
fi

# ── 3. vercel ──────────────────────────────────────────────────────────────
say "3/6  Vercel environment (production)"
# Output is NOT hidden here: the first run of this script sat silent on this
# step and nobody could tell whether it was logging in, asking a question, or
# hung. Whatever Vercel says, you see.
if ! npx vercel whoami >/dev/null 2>&1; then
  echo "  Vercel needs you to log in once (a browser tab will open):"
  npx vercel login || { echo "  login did not complete — run the script again."; exit 1; }
fi
FAILED=0
put() {  # name value
  [ -z "$2" ] && return 0
  if printf '%s' "$2" | npx vercel env add "$1" production --force --yes 2>&1 | sed 's/^/    /' | grep -viE "^ *$|Vercel CLI" ; then :; fi
  if npx vercel env ls production 2>/dev/null | grep -q " $1 "; then echo "  set  $1"; else echo "  NOT set: $1"; FAILED=1; fi
}
put X_API_KEY       "$(getv X_API_KEY)"
put X_API_SECRET    "$(getv X_API_SECRET)"
put X_ACCESS_TOKEN  "$(getv X_ACCESS_TOKEN)"
put X_ACCESS_SECRET "$(getv X_ACCESS_SECRET)"
put X_HANDLE        "$(getv X_HANDLE)"
put X_POST_MODE     "flagged"   # free X tier: only called homers go to X (~300/mo). Change to "all" on Basic.
put NEXT_PUBLIC_SITE_URL "$SITE_URL"
have DISCORD_HOMER_WEBHOOK && put DISCORD_HOMER_WEBHOOK "$(getv DISCORD_HOMER_WEBHOOK)"
if [ "$FAILED" = "1" ]; then
  echo
  echo "  The CLI could not set some of them. Do it by hand — a browser tab is opening"
  echo "  on the project's Environment Variables page. Add each of these (Production):"
  echo
  for k in X_API_KEY X_API_SECRET X_ACCESS_TOKEN X_ACCESS_SECRET X_HANDLE DISCORD_HOMER_WEBHOOK; do
    have "$k" && printf '    %-24s %s\n' "$k" "$(getv "$k")"
  done
  printf '    %-24s %s\n' X_POST_MODE flagged
  printf '    %-24s %s\n' NEXT_PUBLIC_SITE_URL "$SITE_URL"
  open "https://vercel.com/dashboard" 2>/dev/null
  echo
  printf '  Press Enter here when they are saved… '; read -r _
fi

# ── 4. build · commit · push ───────────────────────────────────────────────
say "4/6  Commit and ship"
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -q -m "Called It: public homer feed — X/Discord bot, cards, /called page, pregame call, recap, weekly

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>" && echo "  committed"
  bash SHIP.sh || { echo; echo "SHIP.sh stopped — fix what it printed, then run this again."; exit 1; }
else
  # Nothing to push, but the env vars above only reach the functions on a
  # NEW deployment — so redeploy the current one.
  echo "  nothing new to commit — redeploying so the environment variables take effect"
  npx vercel redeploy "$SITE_URL" --yes 2>&1 | grep -iE "production|ready|error|https://" | sed 's/^/    /'
fi

# ── 5. first tick ──────────────────────────────────────────────────────────
say "5/6  First tick"
echo "  waiting 90s for Vercel to finish the deploy…"
sleep 90
SECRET=$(getv CALLEDIT_SECRET)
if [ -n "$SECRET" ]; then
  curl -sS -H "Authorization: Bearer $SECRET" "$SITE_URL/api/dash/homers/tick" | python3 -m json.tool | sed 's/^/  /'
  echo
  echo "  'fresh' = homers it just posted. 'skipped: nothing-started' before games = normal."
else
  echo "  no CALLEDIT_SECRET in $ENVF — the cron will fire on its own within a minute anyway."
fi

# ── 6. the two images ──────────────────────────────────────────────────────
say "6/6  Profile images (the one thing this script cannot upload)"
open public/brand
open "https://x.com/settings/profile"
echo "  Finder is showing calledit-header.png and calledit-avatar.png."
echo "  On the X page that opened: click the camera on the banner → calledit-header.png,"
echo "  then the camera on the avatar → calledit-avatar.png → Save."
echo
say "Done. Watch: https://x.com/CalledItHR   and   $SITE_URL/called"
