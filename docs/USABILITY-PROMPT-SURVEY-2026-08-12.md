# Usability prompt: read-only survey and plan

**2026-08-12.** Per the prompt's own instruction: *"Start with a read-only
survey of all the tabs and give me your prioritized list before you edit
anything. I want to see the plan first."* This is that survey. Nothing in
moonshot-push has been edited as part of it.

Scope covered at full-read depth: every shared surface the prompt names
(`Header.js`, `Controls.js`, `PlayerCard.js`, `DenseTable.js`, `Heatmap.js`,
`GameLineup.js`, `ProjectedOutput.js`, `Slip.js`, `Empty` in `ui.js`, plus
`Explain.js`, `TabExplainer.js`, `StartHere.js`, `lib/theme.js`,
`lib/scoring.js`, `lib/player.js`, `lib/dataSource.js`), `Guide.js` in full,
and every tab file's import graph, `<Empty>` call sites, and file existence.
The other ~14 tab bodies were grep-signal-checked (empty states, wiring,
score usage) but not read line-by-line for copy-level issues yet — that's
the work still ahead, listed at the bottom.

## The headline finding

**This prompt was written against an earlier version of the repo.** A
separate, substantial usability pass already happened on 2026-08-09 — before
this document reached me — and it already built most of what this prompt
asks for, under different names. Some of it's better than what the prompt
describes; none of it is what the prompt's "ground truth" section says is
there. Section 1 below is the diff between what the prompt assumes and what
actually exists, verified against the live files, not against memory.

## 1. Ground truth corrections

- **`lib/plain.js` and `components/tabs/Tonight.js` do not exist** — confirmed
  by directory listing, not just search. What replaced them: the glossary
  (`TERMS`/`RANK_NOT_PERCENT`/lookup) now lives in `components/Explain.js` as
  `GLOSSARY`, and it's bigger than the prompt describes — 90+ terms, with its
  own dated comment recording a 2026-08-09 sweep that found only 214 of 699
  DenseTable columns resolved to an explanation. The landing-tab idea became
  two things instead of one file: a real `home` tab (first in the nav, added
  2026-08-08 "so the site opens welcoming, not blasting stats") and
  `components/StartHere.js`, a dismissible four-step card + symbol legend
  that explicitly documents *why* it isn't a Guide reroute ("nobody's first
  click should be a glossary").
- **Fact #1 (ranks, not percentages) is already fully shipped**, and more
  strongly than the prompt asks for: `RANK_NOT_PERCENT` auto-attaches to
  every score term via `ExplainBanner`, so the caveat travels with the
  definition instead of depending on whoever writes the next component to
  remember it.
- **Fact #2 (two HR numbers disagree) is no longer true.** `scoreFor(p,'hr')`
  in `lib/scoring.js:184` is now `return hrScore(p)` — a direct pass-through,
  not a computed adjustment. The ISO multiplier that used to separate the two
  was removed 2026-08-09 (measured to be corrupting `ProjectedOutput`'s
  calibration, and to be double-counting ISO that `hr_score` already
  contains). There is now exactly one HR number, and it's locked — Task #6 of
  this same session's work put a build check on it (see below). Any copy pass
  built around "these two numbers disagree" needs a different premise; the
  raw `isoAdjustedHr()` lens still exists but only as a labeled second
  opinion on the new Read tab, not a second ranking anywhere.
- **Fact #3 (85-band projects lower than 70-band) is still true**, verified
  live in `ProjectedOutput.js`'s own caption text: *"the 85+ band produced
  16.1% while the 70 band produced 18.7%."* Unchanged, still correct, still
  worth a copy note wherever Proj HR is explained.
- **`Guide.js` was rewritten wholesale on 2026-08-09** — its own header
  comment says so: 385 lines / eleven accordions cut to five steps, a color
  key, a symbol glossary, a stat glossary and a tab map. Neither of the two
  "known defects" the prompt cites (the "70+ is a strong play" line, the
  "down through B, C, D" grades line) exists anywhere in the current file —
  not because someone patched those two lines, but because the whole page
  they lived in is gone. `gradeFor()` still bottoms out at `C+` with no D/F,
  confirmed at `lib/scoring.js:225-233`, so if that grade text ever comes
  back it still needs to match reality.
- **EVLog, PitchBreakdown, Backtest, and ResultsDepth are not orphaned** —
  the prompt's scope list treats them as tabs; they're not top-level tabs,
  they're sub-views. `EVLog` and `PitchBreakdown` render inside
  `PlayerModal.js` (per-player drill-down); `Backtest` and `ResultsDepth`
  render inside `Results.js`. They're real and reachable, just nested.
- **`components/tabs/SprayBoard.js` genuinely is dead** — nothing imports it
  anymore (verified: it doesn't appear in any import graph). It was
  superseded by a `SprayField` component living in `PlayerModal` — the same
  `lib/theme.js` comment that documents the merge explains why: "the
  identical SprayField lives in every player modal, so a whole tab for it
  was a duplicate with worse access." The file is just unreachable weight at
  this point.
- **The tab list itself has moved.** `AtThePlate` (live batter zone/spray,
  added 2026-08-09) and `Home` aren't in the prompt's scope list at all.
  `Derby` is "benched" — deep-link only, not in the nav. `RankedBoard` +
  `HitsHRR` share one `board` tab; `LongestBoard` + `DueBoard` share one
  `longest` tab (labeled "Power"). The prompt's framing of these as
  Power(Longest+Due) and RankedBoard/HitsHRR(Boards) was already correct —
  just noting it's confirmed, not assumed.

## 2. Already done — matches or exceeds what the prompt asks for

- **"Every tab gets a one-sentence purpose line at the top"** — this is
  `TabExplainer.js`, live on 14 of 16 nav tabs (`scoreboard`, `board`,
  `longest`, `games`, `pitchers`, `pairs`, `pools`, `bot`, `leaders`,
  `player`, `watchlist`, `pairhist`, `results`, `guide`). Auto-opens on a
  visitor's first trip to each tab, collapses to a pill after. This is
  functionally the prompt's #1 requested deliverable, already shipped.
- **Tap-to-explain instead of hover** — `Explain.js`'s own header comment
  states the exact problem the prompt raises ("a title attribute is a HOVER
  tooltip... on a phone, literally every explanation we have written is
  invisible") and the fix already in place: an ⓘ tap target, one plain
  sentence, closes on a second tap.
- **"Never let blank read as zero"** is already handled well at the table
  layer: `DenseTable.js` sinks blanks to the bottom of any sort regardless of
  direction, and renders true dashes (`—`) for non-finite values, `·` for
  unlit flags. Real zero and missing render differently in the general path.
- **"Distinguish not-built-yet from filtered-to-nothing"** is already done on
  most boards, not just documented as an intent — `RankedBoard.js:92` reads
  `state.active ? 'No hitters clear this filter.' : 'No {type} picks yet.'`
  as two different messages depending on cause; the same split shows up in
  `LongestBoard.js`, `DueBoard.js`, `Watchlist.js`, and `Leaders.js`. A few
  tabs only have one `<Empty>` message (see section 3) but this is the
  minority, not the norm the prompt assumes.
- **The caption-length complaint is already solved once** — `DenseTable.js`
  folds every caption to its first sentence with a "why ▸" expander, with a
  comment quoting the exact feedback that caused it ("I think it's a little
  too much written words").

## 3. Real, current, verified gaps — prioritized

**Do now** — mechanical, low-risk, the fix pattern already exists elsewhere
in the codebase:

1. **`TabExplainer.js` has no entry for `home` or `atplate`.** Every other
   nav tab got a purpose line; these two didn't, most likely because they
   were both added after the explainer shipped. Two dictionary entries.
2. **`PlayerCard.js` is the single highest-traffic surface still on the
   pre-2026-08-09 hover pattern.** The emoji stack, the weak-spot star's
   specific reason, and the score badge itself ("its verdict, not a stat")
   are all bare `title=` + `cursor:'help'` — invisible on a phone, by
   `Explain.js`'s own stated definition of the problem. Every board on the
   site opens this card on click, so this is the highest-leverage single fix
   in the whole survey. The `InfoDot`/`Explain` pattern to fix it already
   exists and is proven elsewhere; this is applying it, not inventing it.
3. **`Heatmap.js` has no caption fold.** `DenseTable.js` does. `
   ProjectedOutput.js` hands `Heatmap` a caption that runs to several
   sentences (the CALIB explanation, the 85-vs-70-band note) and it renders
   unfolded every time — in tension with the exact user complaint that made
   `DenseTable` grow a fold in the first place. Either give `Heatmap` the
   same fold or shorten the long captions directly.
4. **`components/tabs/SprayBoard.js` is dead code.** Confirmed unreachable
   from any import. Flagging for a decision rather than deleting outright —
   the prompt says never delete a *feature*, but this isn't one anymore.
5. **Header.js's NFL pill is hover-title-only** (minor, low-traffic — it's a
   disabled placeholder, not a real feature).

**Next** — needs the live-render pass before acting, can't be judged safely
from source alone:

- Mobile footprint of the sticky header — `SlateTiles`, two stat pills, the
  date badge, the palette button, the Today/Tomorrow toggle and the tab rail
  are all sticky at once. Plausible that this eats a lot of a 390px viewport
  permanently, but that's a screenshot question, not a source-reading one.
- Re-run the explain-coverage sweep. 214/699 was the number on 2026-08-09;
  more terms were added since, but nobody's re-measured the percentage.
  Recommend a small script (`scripts/check-explain-coverage.mjs`, same
  pattern as the existing `check-*.mjs` scripts) that walks every
  `DenseTable` columns array and reports which keys/labels fail
  `explainFor()` — a repeatable measurement instead of me eyeballing ~30
  column lists by hand, which is both slower and less trustworthy.
- Spot-check `C.text3` on `C.bg2` contrast on a couple of real rendered
  screens, per the prompt's own concern.
- The handful of tabs with only one `<Empty>` message where a filter could
  plausibly also empty the list (`Pools.js`, `Games.js`) — worth a quick look
  at whether they need a second message or genuinely never have that state.

## 4. Found, deliberately NOT changed — flagged with a recommendation

1. **`lib/player.js`'s `nn()` collapses "field missing" into a real `0` for
   nearly every stat accessor site-wide** — `hrScore`, `hitScore`,
   `prodScore`, `tbScore`, `pitchMixScore`, `ihrVal`, `avgEV`, `barrelRate`,
   `hardHitRate`, `launchAngle`, the distance buckets, the platoon splits —
   all of it funnels through `nn(v) = n(pick(v), 0)`, and `n()`'s fallback on
   anything non-finite is `0`, not `null`. That `0` is indistinguishable from
   a genuine zero by the time `DenseTable` sees it — the blank-sinks-to-
   bottom and dash-for-missing logic in section 2 never fires for these,
   because the value it receives is already a real number. This is the exact
   same "0 IS NOT NO DATA" shape as the `weather_hr_effect_pct` bug fixed on
   the bot side earlier this session — same pattern, different layer.
   **Recommendation: don't touch `nn()`'s global default.** `hrRank()`,
   every sort comparator, and every heat-color range calculation across the
   site depend on it always returning a finite number — changing the
   fallback is a data-model change with real blast radius, not a copy fix,
   and belongs behind the same measure-first discipline as the ISO and
   `hidden_hr_value` fixes earlier this session. The right next step is to
   check how often this actually fires on live payloads (which of these
   fields are ever truly absent, versus always-present-but-sometimes-
   legitimately-zero) before deciding whether a narrow, display-only
   "has-this-field" gate is worth adding at the handful of call sites where
   it would matter — the same shape as the `weather_has_data` gate that
   already exists.
2. **The prompt's central "two HR numbers disagree" premise is architecturally
   gone** (see fact #2 above) — not a bug, just worth flagging so no copy
   gets written to explain a split that no longer exists anywhere in the UI.

## 5. Not yet done — before any editing starts

- **The live-render, Playwright-screenshot pass at 430px** that the prompt
  itself requires as the verification method ("a build that compiles is not
  evidence the screen is right — look at it"). Everything above comes from
  reading source; contrast, real overflow, and actual mobile layout still
  need to be seen, not inferred.
- **Line-by-line copy read of the ~14 tab bodies** only grep-checked so far
  (Scoreboard, RankedBoard, HitsHRR, LongestBoard, DueBoard, Games,
  Pitchers, Pairs, Pools, Leaders, PlayerBoard, Watchlist, PairHistory,
  Results, EVLog, PitchBreakdown) — typos, doubled spaces, straight quotes,
  the things the prompt's copy rules ask for. That's real per-tab work, not
  an architecture question, and it's what "one tab per commit" in the
  prompt's own workflow is describing.

## Recommended order, if this plan gets a go-ahead

Work the "do now" list in section 3 first — five small, independently
provable commits, each screenshot-verified before and after, in the order
listed (PlayerCard's tap-targets is the highest-value single change). Then
move to the tab-by-tab copy pass the prompt's own scope list describes,
using the live-render step to catch what source-reading can't.
