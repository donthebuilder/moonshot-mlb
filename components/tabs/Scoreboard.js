'use client'
import { useState, useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { nameOf, teamOf, oppOf, n, clean, hrScore, mlbId } from '../../lib/player'
import { isAligned, hrRank } from '../../lib/scoring'
import { designationOf, hitterRoleTitle, hitterLaneLabel, hitterLaneTitle, laneRanker } from '../../lib/verdict'
import { gameNumbers, doubleheaderNote } from '../../lib/doubleheader'
import { PanelTitle, Empty, btnStyle, WhatThis } from '../ui'
import DenseTable from '../DenseTable'
import BoardFilters, { useBoardFilter } from '../BoardFilters'
import OffBoardStrip from '../OffBoardStrip'
import HomerLedger from '../HomerLedger'
import LaneRecord from '../LaneRecord'
import { laneRecord, laneOf as homerLaneOf, LANES as HOMER_LANES } from '../../lib/lanes'
import { hrShapeMeta } from '../../lib/hrShape'
import WeakSpotCards from '../WeakSpotCards'
import StartHere from '../StartHere'
import SlatePulse from '../SlatePulse'
import LiveWire from '../LiveWire'
// NearMisses is no longer mounted here (2026-09-03) — the component still
// exists and is still imported by the pages that use it; only this page's
// mount was removed.
import ProjectedOutput from '../ProjectedOutput'
import { groupPitchers, groupGames } from '../../lib/data'
import { airVerdict } from '../../lib/conditions'
import { DIV_FIELD } from '../../lib/scales'
import { boardColumns, boardRows, LG } from '../../lib/boardColumns'

// ── FOLD LIVES AT MODULE SCOPE, NOT INSIDE Scoreboard() (fixed 2026-08-18) ──
//
// Donovan: "the projected output is glitching... a lot of the site with the
// stuff that refreshes its glitches or closes when open and refreshes."
//
// This was it. `Fold` used to be declared INSIDE the Scoreboard function
// body, which means every render created a BRAND NEW function — and React
// treats a JSX element's `type` by function identity, not by what the
// function does. A new identity for <Fold> every render is a different
// component as far as React is concerned, so it unmounted the old <details>
// and mounted a fresh one — on every single re-render, including the silent
// background poll (every 45s live, 5min idle; see Dashboard.js). A user-
// opened <details> is native, uncontrolled DOM state, and unmounting it
// throws that state away. The "open" fold you were reading would slam shut
// the next time the slate silently refreshed underneath you — not a data
// problem, a component-identity problem. Same bug, hoisted the same way, in
// Results.js (PitcherWeaknessDigest's Group/Row, and the overview tab's
// Fold/Flow) — grep the codebase for "const Fold = (" or similar nested
// component declarations before adding another one anywhere on the site.
const Fold = ({ label, open = false, children }) => (
  <details open={open} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11, marginBottom: 10 }}>
    <summary style={{ padding: '8px 13px', fontSize: 11, fontWeight: 800, cursor: 'pointer', color: C.text2 }}>{label}</summary>
    <div style={{ padding: '2px 12px 10px' }}>{children}</div>
  </details>
)

// Scoreboard — every hitter on the slate, every column, sortable.
//
// This page was already a sortable table; what it lacked was colour. At 15+
// numeric columns an uncoloured grid gets read one cell at a time, which is
// the opposite of what a scoreboard is for. It now shares DenseTable with
// Games and the boards, so sorting, the ramp and the row-click behave
// identically everywhere instead of three tables each doing it their own way.
//
// The bespoke table this replaces carried its own comparator with a
// null-handling fix in it. DenseTable covers the same case: non-numeric values
// fall through to a string compare, and a missing lineup spot renders as '—'
// rather than a sentinel number.
//
// ── FLOW PASS (2026-08-16, Donovan: pages "all over the palace or scrroll up
// to scoll back down") ───────────────────────────────────────────────────────
//
// Two things were wrong with the running order, and neither was a missing
// panel — everything on this page earns its place, it was arranged badly.
//
//   1. THE HOMER SECTIONS WERE SPLIT. Pre-game the order ran picks → near
//      misses → wire → LEDGER → pulse → GONE YARD → weak spots, so the two
//      panels about tonight's home runs — who has hit one (Gone yard) and what
//      number it was for him and from which lineup spot (the Ledger) — had
//      two unrelated sections wedged between them. Reading one meant scrolling
//      past the other and back. They are one subject and they now sit as one
//      block, with Near misses (the homers that almost happened) beside them.
//
//   2. REFERENCE MATERIAL FLOATED ABOVE THE THING IT EXPLAINS. Weak spots is
//      the roster behind the board's ★ column; it was stranded mid-page in one
//      order and above the orientation panel in the other. It is now the last
//      thing before the 266-row board in both orders — fold it open and the
//      column it explains is right there.
//
// The page also opens on a stated line instead of a symbol code. The header
// sub used to read "266 batters · ★12 weak spot · ◆9 aligned · ▲41 matchup
// edge", which is only legible if you already know all three glyphs; the same
// counts are now a sentence that says what each mark means, plus how tonight's
// air is playing (lib/conditions, not a fifth private chip strip) and how many
// balls have already left the yard. Every count is printed with its
// denominator — k of n — because that is the only honest form for a frequency.


// Two trackers above the grid, ported from Streamlit. Both answer questions
// the 268-row table can't: who has ALREADY gone deep tonight, and which arms
// have soft spots the lineup can reach. Neither is derivable by sorting.
// `answers` is not optional in practice — the 2026-08-09 spoon-feed pass:
// every panel says in one plain sentence what decision it helps with, and it
// has to sit inside the panel rather than in the fold label, because in live
// mode these render open with no label at all.
function Tracker({ title, count, children, note, answers }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 800, marginBottom: answers ? 2 : 6 }}>
        {title} <span style={{ color: C.text3, fontFamily: NUM_FONT, fontWeight: 600 }}>({count})</span>
      </div>
      {answers && <WhatThis maxWidth={640}>{answers}</WhatThis>}
      {children}
      {note && <div style={{ fontSize: 9.5, color: C.text3, marginTop: 5 }}>{note}</div>}
    </div>
  )
}

// boardOnly (2026-09-25): the same component, rendering ONLY the full board
// -- the title, the filters and the every-hitter table -- for the dedicated
// "The Board" view (#tab=fullboard). Donovan: "there is no dedicated place to
// look at the boards at every single one in order." The table lived at the
// bottom of Live under eight other sections; now it also has a page where it
// is the only thing on it. One component, one table, one column list -- not
// a second copy that would drift.
export default function Scoreboard({ players, mode = 'today', slateDate = '', results, backtest, onWatch, watchIds, onPlayerClick, onNavigate, odds = null, boardOnly = false }) {
  const [alignedOnly, setAlignedOnly] = useState(false)

  const alignedCount = useMemo(() => players.filter(isAligned).length, [players])

  // Game / starting pitcher / category filter -- the same shared
  // BoardFilters panel the ranked boards use (components/BoardFilters.js),
  // reused rather than rebuilt (rule #21). No scoreType: this page isn't a
  // single-score ranking, it's every column, sortable -- so the Score
  // slider stays hidden, same as Watchlist.js's own useBoardFilter(onSlate)
  // call. Team already has a site-wide filter (Controls, in Dashboard.js)
  // so BoardFilters correctly doesn't duplicate one -- see that file's own
  // header comment.
  const { filtered, state: filterState } = useBoardFilter(players)

  // Off the FULL slate, not the filtered pool: whether a matchup repeats is a
  // fact about tonight's schedule, and it must not switch off because the
  // aligned-only toggle happened to hide one half of the doubleheader.
  const dh = useMemo(() => gameNumbers(players), [players])
  // Percentiles only mean anything against the rows in view — see laneRanker.
  const laneOf = useMemo(() => laneRanker(players), [players])
  const dhNote = useMemo(() => doubleheaderNote(players), [players])

  // The board rank over the FULL slate (not the filtered pool) -- one source,
  // lib/scoring.js hrRank -> lib/boardOrder.js. Guarded by check-rank-lock.
  const boardRankOf = useMemo(() => hrRank(players), [players])

  const rows = useMemo(() => {
    const pool = alignedOnly ? filtered.filter(isAligned) : filtered
    // The column set and the row shape live in lib/boardColumns.js now
    // (2026-09-25) so every hitter table on the site reads the same list.
    return boardRows(pool, { dh, laneOf, slateSize: players.length, watchIds, rankOf: boardRankOf })
  }, [players, filtered, alignedOnly, watchIds, dh, laneOf, boardRankOf])

  // Who has already homered tonight, matched back to where the board had him.
  // The board rank is the point: a scoreboard that only lists the homers tells
  // you nothing about whether the model saw them coming.
  const goneYard = useMemo(() => {
    const homers = results?.hr_capture_report?.all_homer_entries || results?.merged_homers || []
    // 🔒 THE rank, not a local one (2026-08-11). hrRank in lib/scoring.js is
    // the single source of the HR ordering — the HR board shows these same
    // numbers, so a hitter is #4 here and #4 there and nowhere else. Enforced
    // by scripts/check-rank-lock.mjs; do not reintroduce a local sort.
    const rankOf = hrRank(players)
    // JOIN BY ID, NOT BY NAME. The id is on these entries — the _key below
    // already used it — and this joined on a letters-only squash of the name
    // instead. MLB carries same-named hitters, and findIndex on a list sorted
    // by HR score returns whichever of them scores higher, so the homer got
    // the wrong man's board rank, HR score and tier role. Any name the two
    // sources spell differently (accents, a suffix) silently rendered no rank
    // at all. tabs/Derby.js joins the identical array by player_id already.
    const byId = new Map(players.map((p) => [mlbId(p), p]).filter(([k2]) => k2))
    // THE LANE (A1, 2026-09-14). PICKS / BOARD / RATED — which of the three
    // lanes this homer lands in, per lib/lanes.js. Per-game rank decides
    // BOARD; the slate-wide rank in the column beside it is a different
    // number and stays.
    const lanes = laneRecord(players, homers)
    return homers.map((h, i) => {
      const p = byId.get(Number(h?.player_id)) || null
      const lane = p ? homerLaneOf(p, lanes.ranks) : null
      return {
        _key: `${h?.player_id ?? h?.name}-${i}`,
        _raw: p,
        lane: lane ? HOMER_LANES[lane].label : 'MISS',
        laneKey: lane || 'miss',
        rank: p ? rankOf.get(mlbId(p)) ?? null : null,
        name: clean(h?.name, '—'),
        team: clean(h?.team, ''),
        // n(h?.hr, 1) invented "1 HR" whenever the field was absent, under a
        // column captioned "how many home runs he has already hit tonight".
        // A missing count is unknown, and reads as one.
        hr: Number.isFinite(Number(h?.hr)) ? Number(h.hr) : null,
        score: p ? hrScore(p) : 0,
        // L5 HR / L10 HR (2026-09-13) — Donovan: "add more stats like L5.
        // L10." Was this coming? Same fields and same column shape as the
        // board below (last5_hr / last10_hr) — was he trending into it.
        l5hr: p ? n(p.last5_hr, null) : null,
        l10hr: p ? n(p.last10_hr, null) : null,
        // ── THE NEW ROLES, HERE TOO (2026-09-13) ─────────────────────────
        // Donovan: "show the new roles not the old contact monitor shit."
        // This table was still on tierRole(p) — final_hr_role, the model's
        // raw conviction tier (Power Watch / Contact-Monitor / etc.) — the
        // exact thing 2026-08-23 already replaced on the big board below
        // (see designationOf() in lib/verdict.js: "the dense tables' Role
        // column shows the MODEL's tier out of final_hr_role. That is a
        // different fact from the bot's DESIGNATION (game_pick_role), and
        // the designation is the actionable one"). Sorted-low rows in a
        // 45-deep gone-yard list skew toward the model's least-confident
        // tier, which is why so many of them read "Contact / Monitor" —
        // not a bug, just the wrong field. Same designation-or-lane
        // fallback the board uses, same laneOf ranking (defined above).
        role: p ? (designationOf(p) || hitterLaneLabel(p, laneOf(p))) : '—',
        roleTitle: p
          ? (designationOf(p) ? hitterRoleTitle(p) : hitterLaneTitle(p, laneOf(p), players.length))
          : 'No market scored for this hitter tonight.',
        // ── THE PITCHER LINE (2026-08-22) ────────────────────────────────
        // Donovan: "'GONE YARD' on the Rundown carries the pitcher line:
        // HR/9, H9, L3 H/9, WHIP weakness, HH, K/9, L3 K/9, HR luck ± —
        // just presented well."
        //
        // Seven of the eight are published on every slate row and are read
        // straight off it. THE EIGHTH IS NOT: there is no pitcher_l3_k9 in
        // the payload (l3 covers era, whip and hr9 only), so that column
        // does not render rather than being faked from the season figure.
        // The caption says which one is missing and why.
        //
        // "WHIP weakness" is read as the SIDE split — his WHIP against the
        // hand this hitter bats from, which is the number that was actually
        // weak for this homer, not the aggregate.
        pName: p ? clean(p.pitcher_name, 'TBD') : '—',
        pHr9: p ? n(p.pitcher_hr9, null) : null,
        pWhip: p ? n(p.pitcher_whip, null) : null,
        pL3Whip: p ? n(p.pitcher_l3_whip, null) : null,
        pL3Hr9: p ? n(p.pitcher_l3_hr9, null) : null,
        pWhipSide: p
          ? (String(p.bats || '').toUpperCase().startsWith('L')
              ? n(p.pitcher_whip_vs_lhb, n(p.pitcher_whip, null))
              : n(p.pitcher_whip_vs_rhb, n(p.pitcher_whip, null)))
          : null,
        pHH: p ? (() => {
          const v = n(p.pitcher_hardhit_allowed, null)
          return v == null ? null : (v <= 1 ? v * 100 : v)
        })() : null,
        pK9: p ? n(p.pitcher_k9, null) : null,
        pLuck: p ? n(p.pitcher_hr_luck, null) : null,
        // ── EVENT-CARD FIELDS (2026-09-14, MOONSHOT batch 2) ──────────────
        // Donovan, off the brand audit: homer event cards need distance + EV
        // big. No bot work needed — get_all_homers_from_game() has stamped
        // these on every hr_capture_report entry since the 08-11 backfill;
        // they just weren't being read onto this table's rows yet.
        longestFt: h?.longest_ft == null ? null : Number(h.longest_ft),
        maxEv: h?.max_ev_mph == null ? null : Number(h.max_ev_mph),
        launchAngle: h?.launch_angle == null ? null : Number(h.launch_angle),
      }
    })
    // laneOf omitted from deps deliberately — it's itself a [players]-keyed
    // useMemo defined above, so it's already current whenever players is;
    // adding it would just be the same dependency stated twice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, players])

  // Every starter with at least one weak lineup slot the opposing order fills.
  // The grouped entries themselves, for the cards — the flattened `weakSpots`
  // rows below are still what the count and the fold label are built from.
  const weakEntries = useMemo(
    () => groupPitchers(players).filter((e) => (e.lineup || []).some((b) => b.weak_spot_flag)),
    [players],
  )
  const weakSpots = useMemo(() => {
    return groupPitchers(players)
      .map((e, i) => {
        const hit = (e.lineup || []).filter((b) => b.weak_spot_flag)
        if (!hit.length) return null
        return {
          _key: e.pitcher_id ?? e.pitcher_name ?? i,
          pitcher: clean(e.pitcher_name, 'Unknown'),
          hr9: n(e.pitcher_hr9, 0),
          spots: hit.map((b) => b.lineup_spot).filter((x) => x != null).join(', '),
          hitters: hit.map((b) => b.name).join(', '),
          damage: Math.max(...hit.map((b) => n(b.raw?.pitcher_spot_damage_score, 0)), 0),
        }
      })
      .filter(Boolean)
  }, [players])

  // ── how the air is playing, one game per game_pk (2026-08-16) ────────────
  // The Park column at the far right of the board carries the factor per
  // hitter, and the ranked ladder with weather lives on Power — but the page
  // opened with no statement of whether tonight is a carrying slate at all.
  // airVerdict only speaks when temp, wind direction and park agree strongly
  // enough to claim something, and returns '' otherwise, so a neutral night
  // counts as neither. Counted, never averaged: k of n, with n stated.
  const airRead = useMemo(() => {
    const seen = new Map()
    players.forEach((p) => {
      const pk = p?.game_pk ?? `${teamOf(p)}-${oppOf(p)}`
      if (!seen.has(pk)) seen.set(pk, p)
    })
    const rows2 = [...seen.values()]
    const carrying = rows2.filter((p) => airVerdict(p) === 'carrying')
    const dead = rows2.filter((p) => airVerdict(p) === 'dead')
    return { games: rows2.length, carrying, dead }
  }, [players])

  if (!players.length) return <Empty text="No players yet." />

  // lit(k) — counted ★weak/◆aligned/▲edge for the stat-tile row — retired
  // 2026-09-13 along with that row (see PanelTitle below). Weak and
  // Aligned still print their own counts on their own fold labels.

  // ── SECTION ORDER (2026-08-08 rearrange): live first when live ──────────
  // Pre-game the page reads top-down as a plan: how to read it → the picks →
  // the pulse. Once games are live it reads as a broadcast: the wire and
  // who's gone yard jump to the top, and the orientation panels step back.
  // Heavy panels (storylines, weak spots, and gone-yard pre-live) collapse
  // by default so the first screen is calm — everything is one click deep,
  // nothing is gone.
  const liveNow = results?.live_mode === true

  // Fold now lives at module scope, above this function — see the long
  // comment there for why that fixes the "closes when it refreshes" bug.

  // ── SEVEN SECTIONS, SEVEN COLOURS — TRIED AND REVERTED (2026-09-13) ─────
  // Donovan asked for a left-bar colour accent per section, then, same day
  // after seeing it live: "the side color rail thing remove i dont like
  // those." Reverted to plain sections, no wrapper needed.
  const secStart = <StartHere key="start" onNavigate={onNavigate} />
  const secWire = <LiveWire key="wire" players={players} mode={mode} results={results} watchIds={watchIds} odds={odds} onPlayerClick={onPlayerClick} />
  const secPulse = <SlatePulse key="pulse" players={players} slateDate={slateDate} backtest={backtest} onPlayerClick={onPlayerClick} />
  // ── THE FOUR CAME OFF THIS PAGE (2026-09-03) ─────────────────────────────
  // Donovan: "remove the four from the live page." It is the entire contents
  // of the Picks tab, rendered here a second time — the same duplication the
  // Ledger was pulled for on 08-30, and the same argument: Picks is where you
  // go to be told what to back, this page is where you go to watch it happen.
  // ◇ AND THIS TOOK ITS PLACE. The four headline surfaces on this page were
  // all built from the ~105 tagged bats; the other ~160 men playing tonight
  // appeared nowhere but row 140 of the table. See OffBoardStrip.js — the
  // categories are capped, so being untagged is arithmetic, not a verdict.
  const secOff = <OffBoardStrip key="off" players={players} onPlayerClick={onPlayerClick} />
  // 🧱 NEAR MISSES replaced Storylines AND the slate-strength fold here
  // (2026-08-15, Donovan, this page only: "take storylines off and put near
  // misses from players who haven't gone yard in 2+ games, and statcast
  // when... the tonight's board one you can just remove"). Storylines still
  // lives on Home and in every game's deep dive; SlateStrength still renders
  // inside Boards. This page is the one you watch between innings, and the
  // between-innings question is who's been hitting homers without getting
  // one — that's the drought most likely to end tonight.
  // ── CLOSED BY DEFAULT ON THIS PAGE (2026-08-18, second flow pass) ────────
  // Donovan, again, today: "rearrange the rundown page to flow better."
  // These two used to force `open` — reasonable back when they were a few
  // lines each, wrong now: the SAME day's earlier work gave Near Misses a
  // distance bar and an expandable spray chart per hitter, and gave Projected
  // Output a full sorted bar chart on top of its podium and heat table. Two
  // small panels became two tall ones, and the page's own stated headline
  // — "every hitter, one sortable table" — was buried under both of them
  // PLUS the wire, the homer block and the picks before a reader ever saw a
  // single row of the actual board. Nothing is removed — see the counts
  // below, computed off the same helpers the open panels use, so a closed
  // fold still states its headline fact instead of hiding it behind a click.
  // 🧱 NEAR MISSES CAME OFF (2026-09-03, Donovan: "remove the near misses").
  // It answered "who is due" — which is what the Due board and the Homer
  // Ledger are both for, and neither of those has to be folded shut to fit.
  // Removed from the running order rather than nulled — see the order arrays
  // at the foot of this component.
  // 📈 PROJECTED OUTPUT, MOVED HERE FROM GAMES (2026-08-18). Donovan: "put the
  // projected output on the scoreboard page" — Games is a per-game browsing
  // tool, and this is a slate-wide check ("did the model see what I'm looking
  // at"), which belongs beside the rest of this page's whole-board panels
  // rather than at the foot of a card grid it has nothing to do with.
  // groupGames() is the same helper Games.js used to build its own `games`
  // prop — imported fresh here rather than threaded through as a prop, since
  // Scoreboard already receives the flat `players` list this page is built
  // from and grouping it is a one-line memo, not new data.
  const projGames = useMemo(() => groupGames(players), [players])
  const secProjected = (
    <Fold key="projected" label="📈 Projected output">
      <ProjectedOutput games={projGames} players={players} watchIds={watchIds} />
    </Fold>
  )
  // 🧾 THE LEDGER IS BACK (2026-09-13, Donovan: "move the home run ledger
  // fro[m] the home page tot[o] the live page"). It was pulled off this
  // page on 2026-08-30 because Home already carried the same card — see
  // the (now stale) history that used to sit here. That argument runs the
  // other way now: Donovan wants it on the page where he's actually
  // watching the game, not the front door, so it came off Home (see
  // Home.js) and landed here instead, beside Gone yard — same subject,
  // per the flow-pass note above ("gone yard beside the ledger").
  const secLedger = <HomerLedger key="ledger" players={players} slateDate={slateDate} results={results} onPlayerClick={onPlayerClick} onNavigate={onNavigate} />
  // Does the slate carry an HR-luck reading at all tonight? See the note on
  // the column below — the field ships zero-filled and a zero-filled column
  // reads as a finding.
  const hasLuck = goneYard.some((r) => Number.isFinite(r.pLuck) && r.pLuck !== 0)
  // THREE LANES, NEVER MIXED (A1, 2026-09-14). "X of N came from the top 15"
  // was one lane pretending to be the record. PICKS is the bet slip, BOARD
  // is each game's top 8, RATED is everyone the slate scored — and a homer
  // is reported in the innermost lane it landed in, no further in.
  const laneRec = useMemo(() => laneRecord(players, results?.hr_capture_report?.all_homer_entries || results?.merged_homers || []), [players, results])
  const goneTable = goneYard.length > 0 && (
    <Tracker
      title="💥 Gone yard"
      count={goneYard.length}
      answers="is the model seeing tonight coming? Every homer already hit, in the lane it landed in — PICKS is the bet slip, BOARD is each game's top 8, RATED is everyone the slate scored. A RATED hit is a RATED hit; it is never written up as a pick."
      note={<LaneRecord record={laneRec} />}
    >
      <DenseTable
        rows={goneYard}
        columns={[
          { key: 'lane', label: 'Lane', heat: false, w: 50, mono: true,
            explain: 'PICKS: he carried the TOP or HR designation. BOARD: he was in his game\'s top 8 by HR score. RATED: the slate scored him. MISS: he was not on the slate at all.',
            fmt: (v, r) => (
              <b style={{ fontFamily: NUM_FONT, fontSize: 9.5, letterSpacing: '.06em',
                          color: r?.laneKey === 'picks' ? C.orange : r?.laneKey === 'board' ? C.green : r?.laneKey === 'rated' ? C.text2 : C.red }}>{v}</b>
            ) },
          { key: 'rank', label: 'Board', heat: false, w: 46, mono: true, dim: true,
            fmt: (v) => (v == null ? '—' : `#${v}`) },
          { key: 'name', label: 'Player', heat: false, w: 132, bold: true, sticky: true },
          { key: 'team', label: 'Tm',     heat: false, w: 34, mono: true, dim: true },
          // ── DISTANCE / EV / SHAPE, AS COLUMNS (2026-09-14) ────────────────
          // Donovan didn't want the card treatment on this page — pulled the
          // event-card version, kept the underlying fact: distance and exit
          // velo were already on every homer entry (08-11 backfill) and
          // weren't reading onto this table. They read on now, as three more
          // columns instead of a separate strip. hrShapeMeta is the same
          // percentile-band read the crushed-homer work already shipped.
          { key: 'longestFt', label: 'Dist', heat: false, w: 52, mono: true,
            fmt: (v) => (v == null ? '—' : `${Math.round(v)}ft`),
            title: 'How far the ball traveled, when Statcast tracked it.' },
          { key: 'maxEv', label: 'EV', heat: false, w: 52, mono: true,
            fmt: (v) => (v == null ? '—' : `${Number(v).toFixed(1)}`),
            title: 'Exit velocity off the bat, mph, when Statcast tracked it.' },
          { key: 'shape', label: 'Shape', heat: false, w: 56, mono: true,
            title: 'Wall-scraper / Laser / Standard / Moonshot / No-doubter — a percentile read of the ball\'s launch angle and distance, not physics. See lib/hrShape.js.',
            fmt: (v, r) => {
              const m = (r.longestFt != null || r.maxEv != null)
                ? hrShapeMeta({ total_distance: r.longestFt, launch_speed: r.maxEv, launch_angle: r.launchAngle })
                : null
              return m
                ? <b style={{ fontFamily: NUM_FONT, fontSize: 9, fontWeight: 900, color: m.color }}>{m.short}</b>
                : <span style={{ color: C.text3 }}>—</span>
            } },
          // explicit: here "HR" is homers hit TONIGHT, not the HR score the
          // glossary would otherwise attach to that label
          { key: 'hr',   label: 'HR',     w: 34,
            explain: 'How many home runs he has already hit tonight.' },
          { key: 'score', label: 'HR score', w: 58, dp: 1, scale: 'div', anchor: DIV_FIELD, domain: [0, 100], primary: true },
          { key: 'l5hr',  label: 'L5 HR',  w: 46,
            title: 'Home runs in his last five games.' },
          { key: 'l10hr', label: 'L10 HR', w: 50,
            title: 'Home runs in his last ten games.' },
          { key: 'role', label: 'Role',   heat: false, w: 158, dim: true, titleKey: 'roleTitle',
            title: 'The hitter archetype comes first; the grading market stays in parentheses. Official picks settle on that market. Other rows show their strongest profile lane, not an official pick.' },
          // ── the arm he did it against ──────────────────────────────────
          { key: 'pName',  label: 'Arm',     heat: false, w: 120, dim: true },
          { key: 'pHr9',   label: 'HR/9',    w: 50, dp: 2, scale: 'div', anchor: LG.hr9, ceiling: 0.80,
            anchorLabel: `league ${LG.hr9.toFixed(2)}`,
            title: `Homers allowed per nine, against a league mark of ${LG.hr9.toFixed(2)}. ▲ he was already giving them up.` },
          { key: 'pL3Hr9', label: 'L3 HR/9', w: 58, dp: 2, scale: 'div', anchor: LG.hr9, ceiling: 0.80,
            anchorLabel: `league ${LG.hr9.toFixed(2)}`,
            title: 'Homers per nine over his last three starts — the recent version of the column beside it. Where it runs above the season figure, the arm was trending into this.' },
          { key: 'pWhip',  label: 'WHIP',    w: 50, dp: 2, scale: 'div', anchor: LG.whip, ceiling: 0.35,
            blankWhen: (v) => !(v > 0), fmt: (v) => (Number(v) > 0 ? Number(v).toFixed(2) : '—'),
            anchorLabel: `league ${LG.whip.toFixed(2)}`,
            title: `Walks and hits per inning, against a league mark of ${LG.whip.toFixed(2)}.` },
          // A WHIP of exactly 0.00 over three starts is not a measurement,
          // it is a gap in the feed — one starter on tonight's slate carries
          // it. Blank rather than drawn as the best WHIP on the board.
          { key: 'pL3Whip', label: 'L3 WHIP', w: 58, dp: 2, scale: 'div', anchor: LG.whip, ceiling: 0.35,
            blankWhen: (v) => !(v > 0), fmt: (v) => (Number(v) > 0 ? Number(v).toFixed(2) : '—'),
            anchorLabel: `league ${LG.whip.toFixed(2)}`,
            title: 'WHIP over his last three starts.' },
          { key: 'pWhipSide', label: 'WHIP side', w: 64, dp: 2, scale: 'div', anchor: LG.whip, ceiling: 0.35,
            blankWhen: (v) => !(v > 0), fmt: (v) => (Number(v) > 0 ? Number(v).toFixed(2) : '—'),
            anchorLabel: `league ${LG.whip.toFixed(2)}`,
            title: 'His WHIP against the hand THIS hitter bats from — the weakness that was actually on the field for this homer, rather than the aggregate. Falls back to overall WHIP when the split is not published.' },
          { key: 'pHH',    label: 'HH%',     w: 50, dp: 1, scale: 'div', anchor: LG.hardHit, ceiling: 12,
            anchorLabel: `league ${LG.hardHit.toFixed(1)}%`,
            title: `Hard-hit rate allowed, against a league mark of ${LG.hardHit.toFixed(1)}%.` },
          { key: 'pK9',    label: 'K/9',     w: 48, dp: 2, scale: 'div', anchor: LG.k9, ceiling: 3, invert: true,
            anchorLabel: `league ${LG.k9.toFixed(2)}`,
            title: `Strikeouts per nine, against a league mark of ${LG.k9.toFixed(2)}. Inverted — cool is the dangerous arm, because missing bats is what stops this from happening.` },
          // ── HR LUCK RENDERS ONLY IF IT HAS ANYTHING TO SAY ──────────────
          // pitcher_hr_luck is published on every row and is 0.00 for ALL 30
          // starters on tonight's slate — the field exists, the data does not.
          // A column of "0.00 ·" is worse than no column: it looks measured.
          // It appears the day the bot starts filling it and not before.
          ...(hasLuck ? [{
            key: 'pLuck', label: 'HR luck', w: 58, dp: 2, scale: 'div', anchor: 0, ceiling: 6,
            anchorLabel: '0 (homers matching contact)',
            title: 'Homers allowed against what his contact profile deserved. ▲ he had been giving up more than his contact says he should; ▼ he had been getting away with it, and tonight is the correction.',
          }] : []),
        ]}
        onRowClick={onPlayerClick}
        initialSort="score"
        heatMode="sorted"
        maxHeight={280}
        caption="Every homer already hit tonight, next to where this board had the hitter — and the line the arm was carrying into it. The pitcher columns are drawn against league marks, so ▲ means he was already worse than average at that and ▼ means he was better. Two columns from the ask are not here, and both on purpose: there is no last-three-starts K/9 in the payload (L3 covers ERA, WHIP and HR/9 only), and HR luck ships zero-filled for every starter tonight — it appears the day it carries a reading. Inventing either from the season figure would be a number that looks measured and is not."
      />
    </Tracker>
  )
  // Live: who's gone yard is the news — it renders open, right under the
  // wire. Pre-live (or an empty list) it stays out of the way.
  const secGone = goneYard.length > 0 && (
    liveNow
      ? <div key="gone" style={{ marginBottom: 14 }}>{goneTable}</div>
      : <Fold key="gone" label={`💥 Gone yard (${goneYard.length}) — tonight's homers vs where the board had them`}>{goneTable}</Fold>
  )
  const secWeak = weakSpots.length > 0 && (
    <Fold key="weak" label="★ Weak spots">
      <Tracker
        title="★ Weak spots"
        count={weakSpots.length}
        answers="which starters have a soft lineup slot tonight, and which hitters are standing in it."
        note="Damage is how hard that pitcher gets hit in those spots. Sorted hardest first."
      >
        {/* Cards, not five columns (2026-09-03, Donovan: "weak spots strips
            can be better than just names and numbers"). The old table joined
            a comma-joined list of slots to a comma-joined list of hitters and
            left the reader to line them up, and it threw away
            pitcher_spot_damage_reason — the bot's own sentence explaining the
            flag. See WeakSpotCards.js. */}
        <WeakSpotCards entries={weakEntries} onPlayerClick={onPlayerClick} />
      </Tracker>
    </Fold>
  )

  // ── RUNNING ORDER (2026-08-16 flow pass; see the note above the imports) ──
  //
  // Live — the page is a broadcast, and the lead is what just happened:
  //   wire → THE HOMER BLOCK (gone yard, the ledger, the near misses that
  //   nearly joined them) → how to read this → the picks → the picks' own
  //   clock and what changed since yesterday → weak spots → the board.
  //
  // Pre-game — the page is a plan, and the lead is THE FOUR:
  //   how to read this → THE FOUR → the picks' clock + yesterday's diff →
  //   near misses → the wire (renders nothing until something is live) →
  //   the homer block → weak spots → the board.
  //
  // Two rules drive both: panels read together sit together (gone yard beside
  // the ledger; the pick strip beside the unconfirmed countdown that is about
  // those same picks), and reference sits below what it supports (weak spots
  // immediately above the board whose ★ column it lists).
  //
  // StartHere sits directly above the pick strip in BOTH orders now. It used
  // to be last in live mode, where its own first step — "The Four, right
  // below" — pointed at the bottom of the page. It is self-dismissing and
  // collapses to a single "?" chip once you've read it, so it costs a
  // returning visitor one line.
  // ── THE FOUR LEADS. ASKED FOR REPEATEDLY (2026-08-17) ─────────────────────
  // Donovan: "how hard is it to put the four at the top of the scoreboard like
  // ive asked you to rearrange alot of the site to flow better you didnt do
  // that."
  //
  // It was second in both orders, behind StartHere — a self-dismissing
  // explainer — and in live mode behind three more blocks. The page's own
  // StartHere text says "Tonight's picks is The Four, immediately below", so
  // the explainer was pointing at something that was not immediately below.
  // The picks go first. StartHere follows them, which is also where an
  // explainer belongs: after the thing it explains, for the reader who wants it.
  //
  // ── THIRD FLOW PASS (2026-08-18): THE ORDER WASN'T THE PROBLEM ANYMORE ──
  // Donovan, again: "rearrange the rundown page to flow better." The order
  // below already matches the two rules stated above and hasn't changed
  // this round — what changed is that Near Misses and Projected Output each
  // grew a real chart earlier today (a distance bar + expandable spray field;
  // a full sorted bar chart), so the SAME order now reads as a much longer
  // wall before the page's own promised centerpiece — "every hitter, one
  // sortable table" — at the foot of the page. Reordering again would have
  // been the fourth attempt at the same knob; the actual fix was weight, so
  // those two now default CLOSED with their headline number stated right on
  // the fold (see where they're built, above) instead of force-open. Gone
  // yard stays open live — it's the moment's actual news, not analysis.
  // Projected Output pulled forward (2026-08-30) so the page's own promised
  // centerpiece shows up before Near Misses' chart rather than after it —
  // that ordering, not the ledger removal above, is what was actually
  // burying it.
  // ── PULSE LEADS, PROJECTED TRAILS (2026-09-13, fourth flow pass) ─────────
  // Donovan, pointing right at "Since 09-11": "move to top rail." And at
  // "Projected output": "put this at bottom of page." Two explicit,
  // specific placements this time, not a general "flow better" — so this
  // pass moves exactly those two and leaves the rest of the running order
  // (and the reasoning above it) alone.
  const order = liveNow
    // Live — the lead is what just happened. Ledger sits right beside gone
    // yard — same subject, per the two-rules note above.
    ? [secPulse, secWire, secGone, secLedger, secOff, secStart, secWeak, secProjected]
    // Pre-game — the lead is the plan. With The Four gone, StartHere leads
    // again (it is the orientation panel and it self-dismisses), then what the
    // bot changed its mind about, then the men it never named.
    : [secPulse, secStart, secOff, secWire, secGone, secLedger, secWeak, secProjected]

  return (
    <div>
      <PanelTitle
        title={boardOnly ? 'The Board' : 'Live'}
        sub={boardOnly
          ? `${rows.length} hitters, #1 to #${rows.length} — every one the model rated tonight, in order`
          : `${rows.length} batters on the board${alignedOnly ? ' (aligned only — the filter is on)' : ''}${liveNow ? ' · live — the wire and tonight’s homers lead' : ''}`}
        right={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {alignedCount > 0 && (
              <button
                onClick={() => setAlignedOnly((v) => !v)}
                title="Weak-spot + pitch-match + real recent contact quality all stacking together"
                style={btnStyle(C.purple, alignedOnly)}
              >
                ◆ Aligned only ({alignedCount})
              </button>
            )}
            {/* 🏟 PARKS RANKED BUTTON, REMOVED (2026-09-13). Donovan marked it
                for removal directly on a screenshot. Parks ranked is still
                one tap away on the Power tab; this page just no longer
                links to it from here. */}
          </div>
        }
      />

      {/* ── THE FIVE STAT TILES, REMOVED (2026-09-13) ─────────────────────
          Donovan marked this row for removal directly on a screenshot —
          Games / ★ Weak / ◆ Aligned / ▲ Edge / HR tonight. Same pass also
          dropped the count/subtitle off Weak spots' and Projected output's
          own fold labels below, so those numbers aren't printed a second
          time anywhere on this page either now — Aligned's count still
          shows on its own button, up in PanelTitle. */}
      {/* "The Four leads" was stale — The Four came off this page entirely
          on 2026-09-03 (see the note further down), and this sentence never
          got updated to match. Fixed 2026-09-13 while trimming this page's
          helper text: Pulse is what actually leads both orders now. */}
      {!boardOnly && (
        <WhatThis label="slate context" maxWidth={760}>
          {airRead.carrying.length > 0 && <>The air is carrying in {airRead.carrying.length} of {airRead.games} games. </>}
          {airRead.dead.length > 0 && <>It is playing dead in {airRead.dead.length} of {airRead.games}. </>}
          {laneRec.total > 0 && <>Homers so far — picks {laneRec.hit.picks} of {laneRec.total}, board {laneRec.hit.board} of {laneRec.total}, rated {laneRec.hit.rated} of {laneRec.total}. </>}
          {liveNow ? 'Live action leads below.' : 'Pulse leads; the sortable full board follows.'}
        </WhatThis>
      )}

      {!boardOnly && order}

      {/* Trimmed 2026-09-13 (Donovan: "the litte helper text ... does not
          [h]elp"). Also fixed a dangling fragment — this paragraph used to
          open on "who to look at first tonight," a leftover clause with
          nothing before it. */}
      <WhatThis>
        Every hitter on the slate, #1 to the bottom, in board order — <b style={{ color: C.text2 }}>you
        can use the order without reading a single column</b>. Sort any other header for a
        different question — Hit for contact plays, Park for launch pads, K risk for
        strikeouts. Tap the ⓘ next to a column name for what it means.
      </WhatThis>

      {/* Why a name is on this board twice, answered before it is asked.
          A sentence, not a symbol legend — the question is about the schedule.
          Empty on every ordinary slate, so nothing renders and nothing is
          explained that isn't happening. */}
      {dhNote && (
        <div style={{
          fontSize: 10.5, color: C.text3, lineHeight: 1.65, maxWidth: 820,
          margin: '0 0 8px',
        }}>
          ⚾⚾ {dhNote}
        </div>
      )}

      <BoardFilters state={filterState} total={players.length} shown={filtered.length} />

      {!rows.length && (
        <Empty text={filterState.active ? 'No hitters clear this filter.' : 'No hitters on the board.'} />
      )}

      <DenseTable
        rows={rows}
        columns={boardColumns({ onWatch, dhOn: dh.size > 0 })}
        onRowClick={onPlayerClick}
        initialSort={{ key: 'rank', dir: 'asc' }}
        heatMode="sorted"
        maxHeight={640}
        // Every single one, in order (2026-09-25): no cap on this table. It
        // is the one place the whole board can be read #1 to #N; a "show 200
        // more" door on it defeated the point. ~270 rows renders fine.
        maxRows={Math.max(rows.length, 1)}
        caption={"Every stat here sorts — click a header, shift-click to add a tiebreaker. Columns run in groups: the model scores, then the season line, then the split against the hand tonight's starter throws, then statcast, then the arm itself. Colour follows what you sort by, plus HR, which stays lit as the through-line. Where a column is drawn against a league mark, ▲ means above it and ▼ below, and a number sitting on league reads blank because that is not a finding — hover any header for the mark it uses. P ERA, P WHIP, P HH%, P FB%, P Brl%, P EV and P PullAir% run warm-is-good-for-the-bat; P K/9 and P SwStr% run the other way, because missing bats is what stops a homer. Blank cells are unpublished, not zero."}
      />
    </div>
  )
}
