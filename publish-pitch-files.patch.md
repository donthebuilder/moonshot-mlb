# Patch: publish per-batter zone files

**Repo:** `MLB-HR-DASHBOARD-STREAMLIT` · **File:** `bots/make_slim.py`
**Why:** the moonshot UI draws hot-zone and spray charts. `make_slim.py`
currently *drops* the four keys those charts read, because the Streamlit UI
never displayed them. This keeps dropping them from the slim slate (so the
main payload stays ~1 MB) but also writes each one out as a small per-batter
file the UI can fetch on click.

No bot logic changes. No new workflow. `mlb_dashboard.py` already computes
all of this — it's currently thrown away.

## What the UI reads

| Key | Used by |
|---|---|
| `zone_profile` | `HotZoneMap` — the batter's zone grid |
| `pitcher_zone_profile` | `HotZoneMap` — opposing pitcher overlay |
| `batter_pitch_type_profile` | `HotZoneMap` — per-pitch breakdown (`by_pitch`) |
| `spray_chart` (fallback `batted_ball_log`) | `SprayChart` |

Only these four are emitted. The other ten dropped keys stay dropped —
emitting all of them would put ~50 MB on the data branch instead of ~20 MB.

## 1. Add after `DROP_KEYS`

```python
# Keys the Next.js UI (moonshot-mlb) fetches per player, on click.
# Dropped from the slim slate above, written to public/data/pitch/ instead.
PITCH_KEYS = (
    "zone_profile",
    "pitcher_zone_profile",
    "batter_pitch_type_profile",
    "spray_chart",
    "batted_ball_log",   # SprayChart falls back to this when spray_chart is absent
)
PITCH_DIR = DATA_DIR / "pitch"


def emit_pitch_files(rows: List[Dict[str, Any]]) -> int:
    """One small JSON per batter with just the chart payloads."""
    PITCH_DIR.mkdir(parents=True, exist_ok=True)
    written = 0
    for row in rows:
        if not isinstance(row, dict):
            continue
        pid = row.get("player_id") or row.get("id")
        if not pid:
            continue
        payload = {k: row[k] for k in PITCH_KEYS if row.get(k)}
        if not payload:
            continue
        (PITCH_DIR / f"batter_{pid}.json").write_text(
            json.dumps(payload, separators=(",", ":")), encoding="utf-8"
        )
        written += 1
    return written
```

## 2. Call it in `slim_file`, just before the drop

Find:

```python
    if isinstance(payload, list):
        slimmed: Any = slim_rows(payload)
```

Replace with:

```python
    if isinstance(payload, list):
        emit_pitch_files(payload)
        slimmed: Any = slim_rows(payload)
```

And in the two `dict` branches, add the same call against
`payload["players"]` / `payload["rows"]` before slimming.

Only emit for the *today* slate — running it for tomorrow as well doubles the
file count for no benefit, since the UI only ever requests today's players.

## 3. Publish the folder

`.github/scripts/publish_data.sh` copies specific paths to the `data` branch.
Add `public/data/pitch/` alongside `public/data/current/`.

Because the data branch is a single force-pushed orphan commit, this adds
~20 MB to the branch tip but **nothing to history** — the property that keeps
the repo small is preserved.

## 4. Verify

From moonshot-mlb, after the next bot run:

```bash
node scripts/smoke.mjs
```

Then open any player. Heatmap cells should fill; labels are amber `#f5a623`.

## Risk

Low, and contained. If this patch is wrong the worst case is per-batter files
that are absent or malformed — the UI already handles both (`HotZoneMap` shows
an error state, `SprayChart` falls back to the embedded log, then to "no
data"). The slim slate is written by the same code path as before, so the
Streamlit app is unaffected either way.
