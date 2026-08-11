# MOONSHOT — handoff, 2026-08-10 (UPDATED)

Read this top to bottom before touching anything. The "start here" section is
the whole job; everything below it is evidence and context.

---

## 0 · FIRST, PUSH

```
cd ~/Desktop/moonshot-push && git push
cd ~/Desktop/moonshot-push/bot-ship && git push     # may already be current
```

Twelve site commits landed today. Donovan has been pushing as we went, so check
`git status -sb` before assuming anything is unpushed. **Claude cannot push** —
no git credentials in the sandbox. Every commit is authored as
`git -c user.email="donovanalexander14@gmail.com" -c user.name="Donovan"`.

---

## 1 · START HERE — the five jobs, in order

### JOB 0 — At the Plate box score missing statline (site side, quick blocker)

**The problem.** Box score shipped in §3 today but is missing key stats:
strikeouts, home runs, doubles, triples, XBH and similar stat fields. The
display is incomplete.

**The fix.** Verify which stats are available in the live boxscore payload
(`/api/v1.1/game/{pk}/feed/live`), then wire them into the box score component
render. Check the field names and ensure they map correctly to display. This is
likely a render pass issue rather than a data availability issue — the payload
probably has them but the component is not displaying them.

**Start here:** Check what's in `boxScore.teams[].players[].stats` from the live
feed and cross-ref with what `AtThePlate` component is rendering.

### JOB 1 — per-homer batted-ball capture (bot side, small, unblocks everything)

**The problem, verified today.** The archive has 13,714 graded rows and 1,883
homers across 133 nights. Every homer row says `actual_hr: 1` and **nothing
about the ball** — no launch angle, no exit velocity, no distance. The
`bbe_profile` field that looks like it should help is the hitter's *rolling
prior* profile (his last-20 averages going in), not the swing that left the
yard. So Donovan's ask — "line drive HR, fly ball HR, moonshots, lasers" —
is **not answerable from the existing archive at all**.

**The fix.** The grader must record each homer's `launchSpeed`, `launchAngle`
and `totalDistance`. The extraction is already proven on the site side:
`lib/livePitches.js` → `fetchHrContext()` reads exactly those three fields off
`/api/v1.1/game/{pk}/feed/live` (`playEvents[].hitData`) for the toast. Port
the same read into the grading step so it lands in `graded_results_*.json`.

Suggested row shape (new keys, additive — do not restructure existing ones):

```
hr_events: [
  { inning, pitcher_id, pitcher_name, launch_speed, launch_angle,
    total_distance, pitch_type, event }
]
```

A list because a two-homer night is two different balls.

### JOB 2 — backfill the 128 nights

13,698 of 13,714 rows carry `game_pk`, and the league's feed still serves past
games. So a backfill script can walk every archived night, pull each homer's
hit data, and attach `hr_events` retroactively. That turns 1,883 homers from
uncategorisable into classifiable, and it is the difference between starting
the HR-type analysis in a month and starting it with a full season.

Classification thresholds to *propose and then test*, not to assume:
laser < ~24° · moonshot > ~32° and 400ft+ · wall-scraper < 360ft at any angle ·
inside-the-park off the event name. **Do not ship these as facts until the
distribution has been looked at.**

### JOB 3 — the "leading up to" scan — ALREADY RUN, results in §2

This one needed no backfill and has already been done. Read §2 before
re-running anything. Two follow-ups are named there.

### JOB 4 — three mobile cutoffs, LOOKED AT rather than inferred

All three are from Donovan's screenshots, all are "content wider than the
viewport". **Do not guess at these** — one round was already burned today
guessing at an overflow that could not be measured from the sandbox.

1. **EV Log / pitch page** — the explanatory paragraph is clipped on the LEFT
   edge and the BBE window chips (`15BBE 25BBE 50BBE 100BBE`) run off the
   right. Something on that page is wider than the screen.
2. **At the Plate** — a large empty gap between the batter header and
   `FINAL COUNT`. Almost certainly the zone map area reserving height while
   empty ("he hasn't seen a pitch yet"). Should collapse, not reserve.
3. **Matt Olson player card** — stat tiles cut off at the right. **This may
   already be fixed**; that screenshot is timestamped 1:28, before the
   `min-width: 0` fix on `.playerboard > *` landed. Confirm before working it.

The tool that would settle all three in minutes is a browser. Chrome MCP was
disconnected all session. If it is available next time, use it first.

---

## 2 · THE SCAN THAT WAS RUN — what a hitter looked like before he homered

**Method.** 13,714 graded rows, 1,883 homers (13.7%), 133 nights. Held
`hr_score` fixed in fixed-width bands, compared top-quartile vs bottom-quartile
HR rate on each field *within* band, sample-weighted across bands. 100
candidate pre-game numeric fields after excluding derived scores and outcomes.

**The control was run and it is clean.** `hr_score` scanned against itself:

```
band width 12 → +2.0pp     ← leaks, too wide
band width  8 → +0.6pp
band width  6 → +0.2pp
band width  4 → -0.4pp     ← the width used for the headline table
band width  2 → -0.3pp
```

This matters because on 2026-08-09 a version of this scan reported 38 of 164
fields as significant, which was a broken control rather than a discovery. It
is not broken here.

**Two corrections were made to the run's own output** and both are already
applied to the numbers below:

- A line the script printed claiming the 4-point bands leaked was **wrong** —
  the control above says they do not. The width-2 re-run is a robustness check
  that agreed, not a rescue.
- The Benjamini-Hochberg marking in the script was **wrong**. BH is a step-*up*
  procedure: find the largest rank passing `0.05·i/m`, then reject everything
  at or below it. Rank 9 passes at 0.0375, so **all twelve tested fields
  survive**, including `season_iso` which the script marked as failing.

All p-values sat at the 200-shuffle floor (≤0.005). Read them as "beyond this
test's resolution", not as exact values.

### Results — within-band lift, holding hr_score fixed

| field | lift @ width 4 | lift @ width 2 | read |
|---|---|---|---|
| season_iso | +9.4pp | +10.2pp | power family — model under-weights |
| season_slg | +7.9pp | +8.8pp | same family |
| **season_k_rate** | **+6.6pp** | **+7.6pp** | **see below** |
| iso_vs_rhp | +6.6pp | — | same family |
| season_hr | +6.2pp | — | same family |
| last5_hr | +6.1pp | +6.8pp | same family |
| last10_xbh | +5.0pp | — | same family |
| **l20pa_fb_rate** | **−4.6pp** | **−5.0pp** | **suspicious, see below** |
| lineup_spot | −4.5pp | −4.9pp | already in the blend — rediscovery |
| recent_hard_hit_rate | +4.1pp | +4.6pp | power family |
| weak_spot_flag | +4.2pp | +3.8pp | already in the blend |
| pitcher_ev_allowed | +4.1pp | +3.6pp | arm quality |
| pitcher_barrel_allowed | +3.6pp | +3.8pp | arm quality |
| pitcher_fb_rate | +3.7pp | +3.5pp | arm quality |

### The two findings that are actually interesting

**Strikeout rate is POSITIVE (+7.6pp).** Within the same `hr_score` band,
hitters who strike out *more* homer *more*. That is the three-true-outcomes
profile. **Next step:** find where `season_k_rate` enters the blend in
`bots/mlb_dashboard.py`. If it is a penalty, the model is charging twice for
something that partly pays back. Do not change a weight without a sweep across
all archived nights — and check the sweep actually ran on every night, because
on 2026-08-09 a season_power sweep silently ran on 32 of 58 and the reported
"monotone climb" was an artifact.

**Fly-ball rate is NEGATIVE (−5.0pp).** Backwards from every intuition about
home runs, and the single most suspicious line in the table. It is on 17 bands
— a smaller sample than the rest. **Do not act on this until you know whether
`l20pa_fb_rate` is popup-inclusive.** A hitter whose air contact is infield
flies is indistinguishable from one who lifts the ball, on that field, and that
alone could produce the whole sign. Check the bot's definition first.

Everything else in the table is either the power family (the model
rediscovering its own inputs at a weight that is too low — real but boring) or
fields already in the blend.

---

## 3 · WHAT SHIPPED TODAY

**Palette.** Verdict pulled to forest green (0.500 → 0.393 luminance); Signal
rebuilt from the site's own props sheet (`ThresholdGrid.js` colours — deep
tinted cells with lit numbers, the first ramp here that ships paired `inks`),
then its good end held at one hue; a fourth "Yours" ramp solved live from
sliders (`lib/rampSolver.js`); a global palette button in the header. **Ember
is the default again** — but a device that already chose a ramp keeps its
choice, so Donovan's phone still shows Signal until he taps Ember once.

**Lineups.** `fetchLiveSlate` now pulls pre-game boxscores (verified: a
Preview-state game returns a full `battingOrder`), on a 4-minute cache separate
from the 15s live one. Games annotates moved/scratched hitters, merges the
posted card over the bot's order, and has a slate-wide "card watch" strip.
MiniWire toasts scratches and now polls during the pre-game window at all,
which it never did before.

**Live.** Scores on game cards; box score on At the Plate; `LiveAtBats` rail
(every live at-bat at once, both tabs, no new request); `JustNow` (finished
at-bats for picks + watchlist, feeds pulled only for games containing your
names — 2-4 of a 15-game slate).

**Picks.** The Bot tab was landing on a raw text dump; it now opens on
`PickBoard` — each category's bar stated, live CLEARED/MISSED/LIVE/SCRATCHED,
running record over lead picks only. Tab renamed Bot → Picks (key unchanged,
deep links safe).

**Bot.** `today.yml` gained 02:00 and 03:00 UTC runs for late West-coast lineup
cards. This is a *scoring* fix, not just display: `lineup_confirmed` moves
`lineup_raw` 65 → 100 and carries 0.17 weight.

**Fixes.** Player tab on a phone (the master-detail list was unreachable —
`selected` fell back to `matches[0]` so it was never null); breakpoint drift
(JS said 560, CSS said 700); `Number(playerId())` is NaN (see §4).

---

## 4 · TRAPS — read before writing code

**`playerId()` vs `mlbId()`.** `playerId(p)` is a composite ROW key,
`"621566-824887"`, man plus game. `mlbId(p)` is the league's numeric id.
`Number(playerId(p))` is `NaN`, and `Map` treats NaN as a single key — so nine
slate rows collapse into one entry and nothing matches. This shipped twice
today. `scripts/check-ids.mjs` now fails the build on it and on the mirror
mistake (a numeric id handed to `watchIds`, which is keyed on the composite).

**`<button>` does not inherit text colour.** It resets to the UA's
`buttontext`, near-black, invisible on this page. Every name in the JustNow
rail rendered as a dark smudge for exactly this reason. Set `color` explicitly
on any button that draws its own text.

**Grid items need `min-width: 0`.** `1fr` means `minmax(auto, 1fr)` and `auto`
is min-content, so one unshrinkable child stretches the track past the viewport
and takes the page with it.

**`Number(null) === 0`**, not NaN. Silent sort corruption; blanks float to the
top of ascending sorts.

**Verify fields exist in live payloads before building components.** This is a
standing rule and it has paid out repeatedly — most recently by proving the
pre-game `battingOrder` existed before anything was built on it.

**Box score stats must be explicitly rendered.** The live payload contains many
stats but the component only renders what is explicitly mapped. Strikeouts,
home runs, doubles, triples, XBH — verify each exists in the payload, then add
to the render pass. Do not assume a stat field will appear just because it's in
the feed.

**Two-lane policy.** Live pulls are context only. Nothing on the site folds
into a score until the graded archive validates it. The site must never trigger
a bot run (it would also mean a GitHub token in a public static site).

**Never** add `.github/workflows` to the site repo. **Never** push from
`~/MLB-HR-DASHBOARD` (stale archive). **No odds display** anywhere.

---

## 5 · HOW TO VERIFY

```
cd ~/Desktop/moonshot-push
node scripts/check-ids.mjs        # composite vs numeric id mixups
node scripts/check-undefined.mjs  # lib helpers called but never imported
node scripts/check-palette.mjs    # contrast, dead zone, spec drift

/tmp/node_modules/.bin/esbuild components/*.js components/tabs/*.js \
  --bundle --loader:.js=jsx --outdir=/tmp/x \
  --external:react --external:react-dom --external:next --external:next/* \
  --jsx=automatic
```

The bundle must be a **full bundle with imports resolved**, not a per-file
parse — esbuild catches missing MODULES but not missing NAMES, which is what
`check-undefined` is for. There is no `node_modules` in the checkout, so no
`next build` and no screenshots from the sandbox.

**Unverified and worth watching:** `JustNow` has never rendered real events —
it needs a live game containing a pick. Empty paths are tested and it fails
closed (renders nothing, fetches nothing), but the first real events will be
the first anyone sees.

---

## 6 · STANDING / BENCHED

NFL sibling (`nfl-lab/`) · Derby rework (benched, deep link still works) ·
Discord webhook rotation (Donovan's task — webhooks live ONLY in the
`DISCORD_WEBHOOK` Actions secret, comma-separated, never committed) ·
defense-stat validation revisit.
