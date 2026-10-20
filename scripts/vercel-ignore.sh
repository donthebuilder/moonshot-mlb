#!/bin/bash
# VERCEL IGNORED BUILD STEP (2026-09-27, BATCH-COST-CUT step A2).
# vercel.json "ignoreCommand" runs this. Exit 0 = SKIP the build, exit 1 = BUILD.
# Build CPU minutes were $8.30 of a $28 overage: every worktree PR branch built
# a preview, then main built again on merge, and doc-only pushes built too.
#
#   1. Only the production branch builds (main until 2026-10-20, then `release`: see 5). Preview branches skip (check a branch locally with
#      `npm run build` + `npx next start`, as every batch already does).
#   2. On main, skip when the push touches nothing that ships: every changed
#      path is docs/, scripts/, supabase/, .claude*/, ARCHIVE/ or a *.md.
#   3. Anything unclear (no previous SHA, previous SHA not in the clone,
#      git error) BUILDS. A wasted build costs minutes; a skipped real
#      change would leave the site stale.

#   4. A preview can still be asked for: a branch commit whose message
#      contains [preview] builds (2026-09-28, so a link to tap is one word away).

#   5. RELEASE TRAIN (2026-10-20): Vercel's production branch becomes `release`, moved up to main 3x a day by
#      .github/workflows/release-train.yml. So the test is "is this the PRODUCTION build" (VERCEL_ENV), not "is this
#      main": until the production branch is switched, main is still production and builds exactly as before; after,
#      main is a preview like any branch and only `release` builds.
# FAIL-SAFE: if VERCEL_ENV is ever missing in this step, fall back to the branch names (main or release build), so a
# missing variable can only cost a build, never skip production.
ENV_KIND="$VERCEL_ENV"
if [ -z "$ENV_KIND" ]; then
  case "$VERCEL_GIT_COMMIT_REF" in main|release) ENV_KIND=production ;; *) ENV_KIND=preview ;; esac
  echo "ignore: VERCEL_ENV not set -- treating '$VERCEL_GIT_COMMIT_REF' as $ENV_KIND"
fi
if [ "$ENV_KIND" != "production" ]; then
  case "$VERCEL_GIT_COMMIT_MESSAGE" in
    *"[preview]"*) echo "ignore: branch '$VERCEL_GIT_COMMIT_REF' asked for a preview -- building"; exit 1 ;;
  esac
  echo "ignore: branch '$VERCEL_GIT_COMMIT_REF' is not the production branch -- skipping (add [preview] to the commit message to build one)"
  exit 0
fi

PREV="$VERCEL_GIT_PREVIOUS_SHA"
if [ -z "$PREV" ] || ! git cat-file -e "$PREV^{commit}" 2>/dev/null; then
  echo "ignore: no usable previous SHA -- building"
  exit 1
fi

CHANGED=$(git diff --name-only "$PREV" HEAD 2>/dev/null) || { echo "ignore: git diff failed -- building"; exit 1; }
if [ -z "$CHANGED" ]; then
  echo "ignore: nothing changed since $PREV -- building (a redeploy is deliberate)"
  exit 1
fi

# 2026-10-04: also the working folders that never ship (claude/, nfl-lab/, mobile-report/)
# and loose root files (*.sql, *.sh, *.txt) -- build minutes were 62% of this cycle's bill.
SHIPPING=$(echo "$CHANGED" | grep -Ev '^(docs/|scripts/|supabase/|\.claude[^/]*/|ARCHIVE/|claude/|nfl-lab/|mobile-report/)|\.md$|^[^/]+\.(sql|sh|txt)$')
if [ -z "$SHIPPING" ]; then
  echo "ignore: only docs/scripts/migrations/notes changed since $PREV -- skipping"
  exit 0
fi
echo "ignore: app files changed -- building"
echo "$SHIPPING" | head -5
exit 1
