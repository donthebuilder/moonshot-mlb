#!/usr/bin/env bash
#
# apply-zones-fix.sh — makes the three Hot Zones changes in the bot repo.
#
# Clones FRESH into /tmp. It deliberately does not touch ~/MLB-HR-DASHBOARD,
# which is a pre-migration checkout missing mlb_dashboard.py, make_slim.py,
# player_splits.py and publish_data.sh — committing from there would delete them.
#
# Shows you the diff and stops. Nothing is pushed until you say so.
#
# Run:  bash apply-zones-fix.sh

set -euo pipefail

REPO=https://github.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT.git
WORK=/tmp/zones-fix

rm -rf "$WORK"
echo "Cloning fresh (main)…"
git clone --depth 1 "$REPO" "$WORK" >/dev/null 2>&1
cd "$WORK"

python3 - <<'PYEOF'
import sys, pathlib

changed, skipped = [], []

def edit(path, fn):
    p = pathlib.Path(path)
    if not p.exists():
        sys.exit(f"ABORT: {path} not found. Repo layout changed — re-read ZONES-FIX.md and do it by hand.")
    before = p.read_text()
    after = fn(before)
    if after is None:
        skipped.append(path); return
    p.write_text(after)
    changed.append(path)

def need(text, anchor, path):
    if anchor not in text:
        sys.exit(f"ABORT: expected to find in {path}:\n    {anchor!r}\nIt isn't there, so nothing was changed. Do it by hand from ZONES-FIX.md.")

# ── 1. spray-cache.yml : permissions + publish step ─────────────────────────
def wf(t):
    if 'publish_data.sh "Spray cache"' in t:
        return None                                  # already applied
    need(t, "permissions:\n  contents: read", ".github/workflows/spray-cache.yml")
    t = t.replace("permissions:\n  contents: read",
                  "permissions:\n  contents: write", 1)
    t = t.rstrip("\n") + """

      # Publish the zone profiles. Without this the job computes them and
      # throws them away when the runner dies -- which is why Hot Zones was
      # empty for months while this workflow reported success every day.
      - name: Publish to data branch
        run: bash .github/scripts/publish_data.sh "Spray cache"
"""
    return t

edit(".github/workflows/spray-cache.yml", wf)

# ── 2. spray_cache.py : write zone files to current/zones/today ──────────────
ZONES_FN = '''

ZONES_DIR = PUBLIC_DATA_DIR / "current" / "zones" / "today"


def write_zone_files(players_out: dict[str, dict[str, Any]]) -> int:
    """One small file per hitter holding only the zone profiles.

    Deliberately NOT merged into current/detail/<slate>/batter_<id>.json. This
    job runs on a fresh checkout where public/data is gitignored and therefore
    empty, so anything written into detail/ here would be a stub with no
    spray_chart -- and publish_data.sh copies detail/ as a whole directory, so
    publishing those stubs would replace the real detail files and blank every
    spray chart, pitch profile and EV log on the site. A directory this job
    alone owns has no such failure mode.
    """
    written = 0
    for player in players_out.values():
        pid = player.get("player_id")
        if not pid:
            continue
        zp = player.get("zone_profile")
        pzp = player.get("pitcher_zone_profile")
        if not zp and not pzp:
            continue
        payload = {"player_id": pid, "name": player.get("name", "")}
        if zp:
            payload["zone_profile"] = zp
        if pzp:
            payload["pitcher_zone_profile"] = pzp
        write_json(ZONES_DIR / f"batter_{pid}.json", payload)
        written += 1
    return written
'''

def sc(t):
    if "def write_zone_files" in t:
        return None
    need(t, "def write_outputs(", "bots/spray_cache.py")
    t = t.replace("\ndef write_outputs(", ZONES_FN + "\ndef write_outputs(", 1)
    anchor = 'print(f"Written: {written} individual batter files to public/data/pitch/", file=sys.stderr)'
    need(t, anchor, "bots/spray_cache.py")
    t = t.replace(anchor, anchor + '''
    zoned = write_zone_files(payload.get("players", {}))
    print(f"Written: {zoned} zone files to public/data/current/zones/today/", file=sys.stderr)''', 1)
    return t

edit("bots/spray_cache.py", sc)

# ── 3. publish_data.sh : stage and carry forward zones/ ─────────────────────
def pub(t):
    if 'for sub in detail splits zones' in t:
        return None
    a1 = '[ -d "$SRC/data/current/splits" ] && cp -r "$SRC/data/current/splits" "$STAGE/public/data/current/" || true'
    need(t, a1, ".github/scripts/publish_data.sh")
    t = t.replace(a1, a1 + '''
  # Zone profiles from spray_cache.py.
  [ -d "$SRC/data/current/zones" ] && cp -r "$SRC/data/current/zones" "$STAGE/public/data/current/" || true''', 1)
    a2 = "for sub in detail splits; do"
    need(t, a2, ".github/scripts/publish_data.sh")
    # Without this, the hourly Today run drops zones/ from the branch every run.
    t = t.replace(a2, "for sub in detail splits zones; do", 1)
    return t

edit(".github/scripts/publish_data.sh", pub)

for p in changed: print(f"  patched  {p}")
for p in skipped: print(f"  already  {p}  (no change needed)")
if not changed:
    print("\nNothing to do — all three changes are already in place.")
PYEOF

echo
echo "──────── diff ────────"
git --no-pager diff --stat
echo
git --no-pager diff

if git diff --quiet; then
  echo "No changes to commit."
  exit 0
fi

echo
echo "──────────────────────"
read -r -p "Commit and push these to main? [y/N] " ok
if [ "$ok" != "y" ] && [ "$ok" != "Y" ]; then
  echo "Left alone. The patched clone is at $WORK if you want to look."
  exit 0
fi

git add -A
git commit -q -m "Publish zone profiles so Hot Zones can populate

spray_cache.py has computed zone_profile and pitcher_zone_profile daily for
months and thrown both away. The workflow ran with contents: read and no
publish step, so its only persistence was actions/cache, which dies with the
runner. Nothing it produced ever reached the data branch and Hot Zones was
empty across all 297 detail files.

Zone profiles go to their own current/zones/<slate>/ directory rather than
being merged into current/detail/. This job runs on a fresh checkout where
public/data is gitignored and empty, so batter files written into detail/ here
would be stubs holding a zone_profile and nothing else -- and publish_data.sh
copies detail/ wholesale, so publishing them would have replaced the real
detail files and blanked every spray chart, pitch profile and EV log on the
site. A directory this job alone owns cannot collide with the slate workflows.

publish_data.sh carries zones/ forward alongside detail/ and splits/, without
which the hourly Today run would drop it from the branch on every publish."
git push
echo
echo "Pushed. Now run the Spray Cache workflow, then verify:"
echo
echo "  cd /tmp && rm -rf zc && git clone --depth 1 --branch data $REPO zc \\"
echo "    && ls zc/public/data/current/zones/today | wc -l"
echo
echo "A few hundred files means Hot Zones will light up on the next page load."
echo "Zero means it still isn't publishing."
