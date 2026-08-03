# Fixing Hot Zones — three edits in `donthebuilder/MLB-HR-DASHBOARD-STREAMLIT`

Edit these on github.com. **Do not use `~/MLB-HR-DASHBOARD` on your Mac** — that
folder is a pre-migration checkout (its `today.yml` still runs `today_bot.py`,
and `mlb_dashboard.py`, `make_slim.py`, `player_splits.py` and
`publish_data.sh` don't exist in it). Pushing from there would delete them.

## Why the obvious fix is wrong

The natural approach is to have `spray_cache.py` merge `zone_profile` into
`public/data/current/detail/today/batter_<id>.json`, since that's where the app
reads. **That would blank every spray chart on the site.**

The Spray Cache workflow runs on a fresh CI checkout. `public/data` is
gitignored, so it starts empty — the only detail files that exist on that runner
are the ones spray_cache itself writes, and those would contain a `zone_profile`
and nothing else. `publish_data.sh` copies `current/detail` as a whole
directory, so publishing would replace the real detail files with those stubs.
Spray charts, pitch profiles and EV logs would all go blank.

So zones get their own directory. Only `spray_cache.py` writes it, nothing else
reads that path, and the two workflows can't overwrite each other.

---

## 1. `bots/spray_cache.py`

**a)** Next to the existing `PITCH_DIR` definition (~line 84), add:

```python
ZONES_DIR = PUBLIC_DATA_DIR / "current" / "zones" / "today"
```

**b)** Add this function just above `write_outputs`:

```python
def write_zone_files(players_out: dict[str, dict[str, Any]]) -> int:
    """One tiny file per hitter holding only the zone profiles.

    Deliberately NOT merged into current/detail/<slate>/batter_<id>.json. This
    job runs on a fresh checkout where public/data is empty, so anything it
    writes into detail/ would be a stub with no spray_chart -- and
    publish_data.sh copies detail/ wholesale, so publishing those stubs would
    wipe the real files. A directory this job alone owns has no such hazard.
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
```

**c)** In `write_outputs`, after the `write_individual_batter_files` call, add:

```python
    zoned = write_zone_files(payload.get("players", {}))
    print(f"Written: {zoned} zone files to public/data/current/zones/today/", file=sys.stderr)
```

---

## 2. `.github/scripts/publish_data.sh`

**a)** In `stage_local()`, beside the existing `detail` and `splits` copies:

```bash
  # Zone profiles from spray_cache.py.
  [ -d "$SRC/data/current/zones" ] && cp -r "$SRC/data/current/zones" "$STAGE/public/data/current/" || true
```

**b)** In `carry_forward()`, change the per-slate merge loop from:

```bash
  for sub in detail splits; do
```

to:

```bash
  for sub in detail splits zones; do
```

That second change is the one that matters: without it, the hourly Today run
would drop `zones/` from the branch every time it publishes.

---

## 3. `.github/workflows/spray-cache.yml`

**a)** Change:

```yaml
permissions:
  contents: read
```

to:

```yaml
permissions:
  contents: write
```

**b)** Add as the final step, after the "Save spray/zone cache" step:

```yaml
      - name: Publish to data branch
        run: bash .github/scripts/publish_data.sh "Spray cache"
```

---

## Verify

Run the Spray Cache workflow, wait for it to finish, then:

```bash
cd /tmp && rm -rf zc && \
git clone --depth 1 --branch data \
  https://github.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT.git zc && \
ls zc/public/data/current/zones/today | wc -l && \
python3 -c "import json,glob; f=glob.glob('zc/public/data/current/zones/today/*.json'); \
print(len(f),'files;',sum(1 for x in f if json.load(open(x)).get('zone_profile')),'with zone_profile')"
```

Expect roughly 250-300 files with a non-null `zone_profile`. Today it is 0.

Then confirm nothing regressed — the detail files must still have their spray
charts:

```bash
python3 -c "import json,glob; f=glob.glob('zc/public/data/current/detail/today/batter_*.json'); \
print(len(f),'detail files;',sum(1 for x in f if json.load(open(x)).get('spray_chart')),'still have spray_chart')"
```

Those two numbers must match. If the second is 0, the stub-overwrite described
at the top has happened and the change went into `detail/` instead of `zones/`.

The moonshot-mlb side is already done — `HotZoneMap.js` reads `current/zones/`
and falls back to its honest empty state while the fetch 404s.
