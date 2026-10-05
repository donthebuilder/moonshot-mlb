'use client'
import Tap from './Tap'
import { leaveTarget } from '../lib/openTarget'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { alpha } from '../lib/scales'
import { nameOf, teamOf, n, clean } from '../lib/player'
import { dedupeGraded } from '../lib/graded'
import { pickSplit } from '../lib/seasonSplit'
import { hrShapeMeta, hrLine } from '../lib/hrShape'
import { fetchLiveSlate } from '../lib/liveSlate'
import { easternToday } from '../lib/data'
import { WhatThis } from './ui'
import LedgerBody from './ledger/LedgerBody'
import { LedgerFrame, RoundLine, WatchStrip, AlignBox, LookOutBox, NextUpBox, ScorerChips, SpotBars } from './ledger/LedgerBlocks'
import { pitcherTags } from '../lib/pitcherTags'
import { pregameLedger } from '../lib/pregameLedger'
import { writeAlignArchive, readAlignArchive, shiftDateKey, usePeople } from '../lib/alignments'
import { listLedgerNights, readLedgerNight } from '../lib/ledgerArchive'
import { gradedResultsUrl } from '../lib/dataSource'
import NamePatterns from './NamePatterns'
import { dayRootOf, lifePathOf } from '../lib/numerology/core'
import { onLiveRefresh } from '../lib/liveRefresh'
import { homerModel, ord } from '../lib/ledger/homerModel'

// 🧾 THE HOMER LEDGER (2026-08-09, Donovan: "somewhere showing what number
// home run people are hitting — like if you notice more people getting their
// 15th, or a certain batting order spot getting more HRs on the day. More of
// something that builds and runs for each slate.")
//
// WHAT THIS ANSWERS: as tonight's homers land, which ones they were in each
// hitter's season (his 15th, his 5th) and where in the batting order they're
// coming from — a picture that fills in through the evening instead of a
// verdict handed down at the end.
//
// SOURCES, nothing invented:
//   results (prop)       actual_hr per graded player, tonight only (date-gated
//                       the same way the storyline tracker is — the file
//                       holds the last graded slate until a new one starts).
//                       Handed down from Scoreboard.js, which already has it —
//                       see the 2026-08-13 note below the imports for why this
//                       used to be its own fetch and isn't anymore.
//   MLB people/stats    the AUTHORITATIVE season homer total, which already
//                       includes tonight — so his latest homer simply IS that
//                       number, with no arithmetic to get wrong. Same call
//                       also carries his jersey number and birthdate
//                       (2026-08-13, see below) — nothing extra to fetch.
//   the slate row       lineup_spot, and season_hr as a marked fallback only
//
// THE NUMBER (rewritten 2026-08-09 — see the audit note above the fetch).
// It used to be slate.season_hr + tonight's homers, which double-counted any
// hitter whose slate row had already been rebuilt after he went deep, and
// which could only test the LAST number for a milestone so multi-homer nights
// skipped round numbers. Both were confidently-stated wrong numbers, which is
// the worst thing a panel like this can do. It asks the league now.
// A hitter with no total from either source shows "—"; an approximate one is
// marked with ≈ and says why in its tooltip.
//
// THE SPOT BARS: nine buckets, one per lineup slot, counting tonight's
// homers. Sample sizes are tiny by nature — a full slate is ~25 homers across
// nine spots — so the strip states the count and explicitly refuses to call
// three homers from the 2-hole a trend. It's a picture of tonight, not a
// finding about baseball.
//
// NUMEROLOGY (2026-08-13, Donovan sent gematrinator.com screenshots — jersey
// numbers, birthdays, "life path" numbers, matched player to player "just
// like the batting order thing" [LineupSlotMatchup's slot+side braid]).
// Confirmed scope, from his own answers: lives HERE, inside "Aligning with
// tonight" — not a new panel, not the bot's pick scoring. Jersey + birthday
// only for now; the deeper gematria-cipher treatment from the screenshots is
// a later step if this one earns it. See the longer note above digitRoot()
// below for why this isn't the first time a jersey/date signal was tried in
// this codebase, and why that history doesn't disqualify watching it here.

// ord: lib/ledger/homerModel.js (2026-10-03)

// ── NUMEROLOGY, ONE RULE FOR EVERYTHING (2026-08-13) ────────────────────
//
// Donovan sent gematrinator.com screenshots and wants jersey numbers and
// birthdays tracked "with the numerology," matched against players the same
// way the ledger already matches season-homer numbers — and he confirmed
// this belongs INSIDE the ledger's existing "Aligning with tonight" section,
// not a new panel, and not the bot's pick scoring.
//
// Worth knowing before reading further: a jersey/date numerology signal was
// already tried in the bot (numerology_score, numerology_pair_score, up to
// 84% of one pairing formula) and pulled in a 2026-06-27 audit — the note
// says "no statistical basis," and more precisely, nothing downstream ever
// actually called it. That's a note about orphaned code, not a verdict on
// whether the patterns are worth watching — this stays exactly where the
// digit-root strip already lives: pattern spotting, disclosed as such,
// never fed into a score.
//
// digitRoot() below is the SAME reduction the homer-count pattern already
// uses (17 → 1+7 = 8) — moved up from inside model() so the fetch effect can
// use it too. One definition of "numerology" for the whole panel: a jersey,
// a birthday, and a homer count all reduce the same way, so a match across
// different kinds of number means what it looks like it means.
// digitRoot / dayRootOf / lifePathOf: one copy, lib/numerology/core.js (2026-09-27).

// Birthday reductions. "day number" is Donovan's own example — Jan 2 → 2 —
// which digitRoot already gives you for single-digit days; this just extends
// it to two-digit days (the 26th → 2+6 → 8) instead of inventing a second
// rule. Life path is the standard numerology sum of every digit in the full
// date, reduced the same way. Both read straight off the league's
// birthDate string (YYYY-MM-DD) — no local birthday database to maintain or
// get stale.

// joinNames: lib/ledger/homerModel.js, with the model it serves (2026-10-03)

// Season-HR + jersey + birthday lookup cache (2026-08-13, "load faster" —
// see below). Keyed by pid, holding the last authoritative values AND how
// many of his tonight homers had already happened when it was fetched, so a
// cache hit only counts if it's at least that current — a real second homer
// always forces a fresh ask instead of quietly serving a total that's now
// one light. Jersey/birthday never change mid-season, so they just ride
// along in the same cached record rather than needing their own freshness
// rule. Module-level on purpose: it should survive this component
// unmounting when you leave the Scoreboard tab, not reset every time you
// come back to it.
const seasonHrCache = new Map()   // pid -> { hr, jersey, dayRoot, lifePath, atCount, ts }
const SEASON_HR_TTL = 10 * 60 * 1000


// ══ THE LOOK-OUT (rebuilt 2026-08-23; the 08-22 build was lost) ═════════════
// Donovan reframed the ledger as "both recap and predictive, read as a live
// look-out": WHO NEEDS WHAT (milestones), WHICH ARMS ARE TIRING (the tag
// rules, live), and pool load. Pool load needs pair/pool membership the
// slate rows don't carry — deliberately absent rather than faked; it lands
// when the bot publishes pool membership per row (rule: no data, no panel).
// Everything here is a LOOKUP, not a statistical claim — the pair-rhythm
// null test (claude/moonshot-pair-rhythm-null-test.md) is why this panel
// makes no per-night rate claims.
function LookOut({ players, onPlayerClick = null, onOpenPitcher = null }) {
  const model = useMemo(() => {
    // one row per distinct starter, carrying the pitcher_* stat fields
    const byArm = new Map()
    for (const p of players) {
      const pid = Number(p?.pitcher_id)
      if (!pid || byArm.has(pid)) continue
      if (p?.pitcher_hr9 == null) continue
      byArm.set(pid, p)
    }
    const arms = []
    for (const [pid, row] of byArm) {
      const t = pitcherTags(row)
      const wear = t.tags.filter((x) => x.key === 'velo_down' || x.key === 'getting_hit' || x.key === 'era_spiking')
      if (t.leaks >= 2 || wear.length) {
        arms.push({
          pid,
          name: clean(row.pitcher_name, 'Unknown'),
          team: clean(row.pitcher_team, ''),
          opp: clean(row.team, ''),
          leaks: t.leaks,
          blowup: t.blowup,
          tiring: wear.length > 0,
          evidence: (wear[0] || t.tags.find((x) => x.tone === 'leak'))
            ? `${(wear[0] || t.tags.find((x) => x.tone === 'leak')).label} ${(wear[0] || t.tags.find((x) => x.tone === 'leak')).evidence}`
            : '',
        })
      }
    }
    arms.sort((a, b) => b.leaks - a.leaks)

    // WHO NEEDS WHAT — a bat one homer from a round number tonight.
    const seen = new Set()
    const milestones = []
    for (const p of players) {
      const pid = Number(p?.player_id)
      if (!pid || seen.has(pid)) continue
      seen.add(pid)
      const hr = n(p?.season_hr, null)
      if (hr == null) continue
      const next = Math.ceil((hr + 1) / 10) * 10
      if (next - hr === 1) {
        milestones.push({ pid, name: nameOf(p), team: teamOf(p), hr, next })
      }
    }
    milestones.sort((a, b) => b.hr - a.hr)
    return { arms: arms.slice(0, 8), milestones: milestones.slice(0, 8) }
  }, [players])

  // ── SAID ONCE, IN CHIPS (2026-08-29) ──────────────────────────────────────
  // Donovan: "like all the words, i feel some of the stuff can be slimmed down
  // and put in bubbles, made more style than just text. like the arms to
  // target seems like extra — 'pitchers, 6 alarms'."
  //
  // He is describing the same sentence printed eight times. The arms row read
  // "Bailey Ober (MIN vs CWS) — BLOWUP RISK, 6 alarms · Daniel Lynch IV
  // (KC vs CLE) — BLOWUP RISK, 6 alarms · ..." — the phrase BLOWUP RISK
  // occupying more of the line than the eight names it was describing. Same
  // shape below it: "sits on 29 — one swing from 30", nine times.
  //
  // The repeated words move into the row's own label, once, and each entry
  // becomes a chip carrying only what differs: who, which game, how many
  // alarms. Nothing is dropped — the alarm count is still on every chip, the
  // evidence sentence is still in its tooltip, and a non-blowup arm still
  // shows what tripped it. It is the same eight arms in a third of the height.
  //
  // The footnote moves into the header for the same reason: a caveat nobody
  // reaches is not a caveat.
  if (!model.arms.length && !model.milestones.length) return null
  // THE BOX IS SHARED NOW (2026-09-28): components/ledger/LedgerBlocks.js
  // LookOutBox, style for style, for TUDDY and LAMP too.
  return (
    <LookOutBox
      title="👀 The look-out — tonight, before it happens"
      tag="lookups, not predictions"
      rows={[
        {
          key: 'arms', label: 'Arms to watch', hint: 'BLOWUP RISK · alarms',
          hintTitle: 'An arm lands here when the tag rules trip at least two independent alarms on it, or a live wear signal fires. BLOWUP RISK is the tag set\'s own label for the worst of them. The rules run live off tonight\'s rows — these are lookups, not predictions.',
          chips: model.arms.map((a) => ({
            key: a.pid, name: a.name, small: a.team ? `${a.team}${a.opp ? `·${a.opp}` : ''}` : null, em: `${a.leaks}🔔`, hot: a.blowup,
            title: `${a.leaks} independent alarms${a.tiring ? ' · wear signal live' : ''}${a.evidence ? ` — ${a.evidence}` : ''}`,
            onClick: onOpenPitcher && (() => onOpenPitcher(a.pid)),
          })),
        },
        {
          key: 'needs', label: 'Who needs what', hint: 'one swing from a round number',
          hintTitle: 'A hitter one home run short of the next multiple of ten. A round number is a counting fact, not a reason to expect a swing — it is here because it is the thing people notice, and it is labelled as a lookup for that reason.',
          chips: model.milestones.map((m) => ({
            key: m.pid, name: m.name, small: m.team || null, em: `${m.hr}→${m.next}`,
            onClick: onPlayerClick && (() => onPlayerClick({ player_id: m.pid, name: m.name, team: m.team })),
          })),
        },
      ]}
      foot="Pool load arrives when the bot publishes pool membership."
    />
  )
}

// ── TWO PLACES, TWO JOBS (2026-08-24) ──────────────────────────────────────
// Donovan: "the full home run ledger should live in Alignments — that in
// itself should be its own research tool."
//
// So it mounts twice. On Home it stays what it has always been: tonight,
// foldable, a panel you glance at between innings. In Alignments it is the
// tool — always open, never remembering a collapse, and carrying a night
// picker, because the whole point of the numbers strip is comparing nights
// and a panel that can only ever show today cannot do that.
//
// One component rather than two, deliberately: every section here (the roots,
// the repeats, the name echoes, the matching game, the watch) is exactly what
// the research view needs, and a forked copy would be a second version of
// arithmetic that has already been wrong twice this month.
export default function HomerLedger({ players = [], slateDate = '', results, onPlayerClick, onNavigate = null, variant = 'home', standalone = false }) {
  const research = variant === 'research'
  // '' = tonight. Any other value is an archived night, read from the branch's
  // own graded file rather than from anything this browser happens to hold.
  const [night, setNight] = useState('')
  const [nightData, setNightData] = useState(null)
  const [nightState, setNightState] = useState('idle')
  // ── CLOSEABLE, AND IT REMEMBERS (2026-08-17) ──────────────────────────────
  // Donovan, twice: "hr ledger on home page should be close able just like a
  // the other things", "yeah like the ledger need to be colasbple".
  // It sits at the top of Home, which is where he wants it — so on the nights
  // he does not want it there, it has to fold. Stored per device like the other
  // dismissibles, so closing it once is closing it for good.
  //
  // CLOSED BY DEFAULT from 2026-09-03. It was open on every visit, and it is
  // one of the two tallest things on Home. That was right when Home had no
  // folding of its own; now that nine sections fold (components/Fold.js) an
  // always-open ledger is the exception that makes the rest look arbitrary.
  // The stored preference still wins in BOTH directions, so anyone who opened
  // it on purpose keeps it open and anyone who shut it keeps it shut.
  const [open, setOpen] = useState(false)
  useEffect(() => {
    try {
      const v = window.localStorage.getItem('ms_ledger_open')
      if (v === '1') setOpen(true)
      else if (v === '0') setOpen(false)
    } catch { /* private mode */ }
  }, [])
  const toggle = () => {
    setOpen((v) => {
      const next = !v
      try { window.localStorage.setItem('ms_ledger_open', next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }
  // Research mode is never folded: it IS the page you navigated to, and a
  // remembered collapse from the Home mount would greet you with a shut panel.
  // `standalone` (2026-09-27): the Ledger tab mounts it as the page itself --
  // same rule as research mode, never folded; nothing else changes.
  const openNow = research || standalone || open
  const Chevron = () => (
    <span
      onClick={(e) => { e.stopPropagation(); toggle() }}
      title={open ? 'Hide the ledger' : 'Show the ledger'}
      style={{ marginLeft: 'auto', cursor: 'pointer', color: C.text3, fontSize: 11, padding: '0 2px' }}
    >{openNow ? '▾' : '▸'}</span>
  )

  const dateKey = (research && night) || slateDate || easternToday()

  // ── PAST NIGHT: TONIGHT'S FORWARD-LOOKING STRIPS COME OFF (2026-08-24) ────
  // Several sections here are about the board that has NOT played yet — the
  // look-out (which arms are tiring, who needs one for a round number), the
  // pregame watchlist scorecard, and "who lines up next". Every one of them
  // reads the `players` prop, which is TONIGHT'S slate, and none of them has
  // any way to know it is being rendered under an August 22 header.
  //
  // Left in, they were the worst kind of wrong: a research page confidently
  // printing tonight's arms-to-watch under a date three days old, with nothing
  // saying which night each half belonged to. The night itself — who went
  // deep, what number it was, the roots, the echoes, the spots — is all
  // genuinely about the archived night and stays.
  const pastNight = Boolean(research && night)
  // What to call the night being read. Every strip below was written for
  // tonight and says so; on an archived night the same sentence has to name
  // the date instead, or the panel reports August 22 as though it were now.
  const nightWord = pastNight ? `on ${night}` : 'tonight'

  // ── THE NIGHT PICKER (2026-08-24, research mode only) ─────────────────────
  // The strips under the header are all comparisons — which root the night
  // landed on, which numbers repeated, which names echoed — and a panel that
  // can only ever show TODAY cannot answer the question those strips exist to
  // raise. Tonight is the default; every other night comes off the branch's
  // own graded file, so what you read here is the same payload the Results tab
  // grades from.
  //
  // DEFINED UP HERE, ABOVE THE EARLY RETURNS, because it has to render on BOTH
  // paths. It was inside the main one only — so on a night before the first
  // homer lands (which, on a research page, is most of the hours anyone would
  // be doing research in) the component took the pregame branch and the picker
  // was simply unreachable. A research tool you cannot point at a past night
  // is a panel.
  const NightPicker = () => {
    if (!research || nights.length === 0) return null
    // ── PICK A NIGHT BY LOOKING AT IT (2026-08-31) ─────────────────────────
    //
    // This was a wrap of identical date pills — "08-24 08-25 08-26 …" — and on
    // a browser holding sixty archived nights that is sixty identical objects
    // with nothing to choose between them. The question anyone actually has in
    // front of an archive is WHICH NIGHT IS WORTH OPENING, and a row of dates
    // cannot answer it, so people open a few at random and stop.
    //
    // Every archived night already carries its own homer total (entry.total,
    // written by lib/ledgerArchive.js). So the picker draws it: one bar per
    // night, height scaled to that night's homers, newest on the right like
    // every other strip on this site. A big night looks like a big night.
    //
    // The bars are read straight off localStorage, no fetch, and a night the
    // store has no count for still renders as a selectable stub rather than
    // disappearing — an unknown count is not zero homers.
    const counts = nights.map((d) => {
      const rec = readLedgerNight(d)
      const total = Number(rec?.total)
      return { date: d, total: Number.isFinite(total) ? total : null }
    })
    const top = Math.max(1, ...counts.map((c) => c.total || 0))
    const cell = (key, label, sub, total, isOn) => (
      <button key={key} onClick={() => setNight(key)}
        // Tonight is not an archived night with a missing count — it is the
        // live slate, and telling somebody their device has no count for it
        // reads as a fault. Caught in render.
        title={key === ''
          ? 'Tonight — the live slate, counted as it happens rather than read off the archive.'
          : total == null
            ? `${label} — this device has the night archived but no homer count stored for it.`
            : `${label} — ${total} homer${total === 1 ? '' : 's'} on that slate.`}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          padding: '4px 5px 3px', borderRadius: 8, cursor: 'pointer', flex: '0 0 auto',
          border: `1px solid ${isOn ? C.orange : 'transparent'}`,
          background: isOn ? `${C.orange}14` : 'transparent',
        }}>
        <span style={{ fontFamily: NUM_FONT, fontSize: 8, color: isOn ? C.orange : C.text3, lineHeight: 1 }}>
          {total == null ? '·' : total}
        </span>
        <span style={{
          width: 12, borderRadius: 2,
          height: total == null ? 3 : Math.max(3, Math.round((total / top) * 26)),
          background: total == null ? C.border2 : (isOn ? C.orange : alpha(C.orange, 0.42)),
        }} />
        <span style={{ fontFamily: NUM_FONT, fontSize: 8, color: isOn ? C.text2 : C.text3, whiteSpace: 'nowrap' }}>
          {sub}
        </span>
      </button>
    )
    return (
      <div style={{ margin: '7px 0 9px' }}>
        <div className="dense-scroll" style={{
          display: 'flex', gap: 2, alignItems: 'flex-end', overflowX: 'auto',
          paddingBottom: 2, WebkitOverflowScrolling: 'touch',
        }}>
          {cell('', 'Tonight', 'now', null, night === '')}

          {/* Oldest on the left, newest on the right — the same direction as
              the run strips and the sparklines, so the eye does not have to
              relearn which way time runs on this page. */}
          {[...counts].reverse().map((c) => cell(c.date, c.date, c.date.slice(5), c.total, night === c.date))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', marginTop: 3 }}>
          <span style={{ fontSize: 8.5, color: C.text3 }}>
            bar height is that night&apos;s homers · newest on the right
          </span>
          {nightState === 'loading' && <span style={{ fontSize: 9, color: C.text3 }}>loading…</span>}
          {nightState === 'empty' && night && (
            <span style={{ fontSize: 9, color: C.yellow }}>
              no graded file published for {night}
            </span>
          )}
        </div>
      </div>
    )
  }

  // THE ARCHIVE THIS BROWSER KNOWS ABOUT. writeAlignArchive drops one key per
  // night it has seen, so the picker offers exactly the nights there is
  // something to show for — no probing the branch for files that may not
  // exist, and no list of dates that all open empty.
  // TWO ARCHIVES, ONE LIST (2026-08-24). This used to read only the keys
  // writeAlignArchive drops as you browse — which meant the picker offered
  // exactly the nights you happened to have the site open for, and on a fresh
  // browser it offered nothing at all. The Homer Ledger's own page can now
  // BACKFILL nights straight off the branch's graded files
  // (lib/ledgerArchive.js), so the picker unions both: anything either store
  // knows about is a night there is something to show for. Still no probing
  // the branch for files that may not exist, and still no list of dates that
  // all open empty.
  const nights = useMemo(() => {
    if (!research) return []
    const out = new Set(listLedgerNights())
    try {
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const k = window.localStorage.key(i) || ''
        const m = k.match(/^ms_align_archive_(\d{4}-\d{2}-\d{2})$/)
        if (m) out.add(m[1])
      }
    } catch { /* private mode: tonight only, which is still a working panel */ }
    out.delete(slateDate || easternToday())
    return [...out].sort().reverse().slice(0, 21)
  // The list is read once per mount, which is enough: the page that backfills
  // (components/tabs/LedgerLab.js) lives in a sibling view, so coming back to
  // this one remounts the component and re-reads the store.
  }, [research, slateDate])

  // A past night comes off the branch's graded file — the same payload the
  // Results tab reads, so the two can never disagree about what happened.
  useEffect(() => {
    if (!research || !night) { setNightData(null); setNightState('idle'); return undefined }
    let alive = true
    setNightState('loading'); setNightData(null)
    fetch(gradedResultsUrl(night), { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setNightData(j || null); setNightState(j ? 'done' : 'empty') } })
      .catch(() => { if (alive) setNightState('empty') })
    return () => { alive = false }
  }, [research, night])

  const payload = research && night ? nightData : results
  // COMPARED IN THE SAME FRAME THE SLATE DATE IS BUILT IN (2026-08-17).
  // This read `> new Date().toLocaleDateString('en-CA')` — the viewer's local
  // day — against a slateDate that lib/data.js derives from the games. With the
  // old max-game_time-in-local-time rule, tonight's slate came back as tomorrow
  // for anyone at UTC or east of it, so this was true all day and the component
  // returned null before doing anything. Both sides are US Eastern now, which
  // is the only frame in which "is this slate tomorrow's" has one answer for
  // every viewer.
  const isTmrw = slateDate && slateDate > easternToday()

  // SOURCED FROM THE PROP NOW, NOT ITS OWN FETCH (2026-08-13, Donovan: "it
  // need to load faster"). Scoreboard.js already holds this exact payload —
  // Dashboard.js fetches it once and polls it every 45s live / 5min idle,
  // shared with LiveWire, SlatePulse and the gone-yard tracker on the same
  // page — and was simply never handing it down here. This component had its
  // own copy of the same fetch, its own 3-minute timer, and its own
  // cache-buster, fully duplicating a request the page already makes (and
  // refreshes faster than this one did on its own, while live). Reusing the
  // prop deletes a redundant network round-trip on every mount for free —
  // the shape is identical (fetchJSON in lib/data.js returns the raw parsed
  // JSON, no transform), so nothing below needed to change to read it.
  // ── DETECTION: THE LEAGUE, NOT THE BOT (2026-08-16) ─────────────────────
  //
  // Donovan: "people are saying they dont see it or i wish i would have seen
  // it earlier... the detection has to be better and faster updating too."
  //
  // Both halves of that were structural, and neither was about polling harder.
  //
  // SLOWER THAN THE PAGE IT SITS ON. This panel read tonight's homers out of
  // the bot's graded file, so a homer only appeared here after the whole
  // chain: the ball lands, live_results_tracker.py writes the file, the data
  // branch propagates, and Dashboard's 45s poll picks it up. Minutes, and none
  // of them ours. Meanwhile lib/liveSlate.js is ALREADY polling the league
  // boxscore every 35 seconds for MiniWire, off a module-level cache — and
  // that snapshot carries homeRuns per batter. The fast number was on the page
  // the whole time; the ledger just wasn't reading it.
  //
  // AND IT COULD NOT SEE HALF THE HOMERS. The graded file only holds the ~85
  // hitters the bot designated. A homer from anyone else — most of a slate —
  // was invisible to this panel by construction. `lines` in the live snapshot
  // is EVERY batter in EVERY game, with a name attached, which is why an
  // off-slate homer can render at all now instead of silently not existing.
  //
  // So: the LIVE snapshot decides WHO homered and HOW MANY, because it is
  // faster and more complete. The GRADED file is still read, for one thing it
  // uniquely has — hr_events, the launch speed / angle / distance the grader
  // stamps on each homer, which is what lets a card say what KIND of homer it
  // was. A homer the live feed has and the grader hasn't reached yet simply
  // shows no band, which is the same honest gap an older night already had.
  // BIRTHDAYS FOR THE WHOLE SLATE, not just the men who already went deep
  // (2026-08-23). The people map the ledger fetches below covers the hitters
  // in the ledger; the watch needs the same two numbers for everybody who has
  // NOT homered yet, which is the entire point of a watch. usePeople is the
  // batched, module-cached call Alignments already makes for exactly this, so
  // this is a shared cache hit rather than a second round of requests.
  const { people, loaded: peopleLoaded } = usePeople(players)

  const [live, setLive] = useState(null)
  const [liveErr, setLiveErr] = useState(null)   // last league-call failure, surfaced
  useEffect(() => {
    if (isTmrw) return undefined
    let alive = true
    const pull = () => fetchLiveSlate()
      .then((s) => { if (alive) { setLive(s); setLiveErr(null) } })
      .catch((e) => { if (alive) setLiveErr(String(e?.message || e || 'league call failed')) })
    pull()
    // was a 12 s loop (2026-08-17); now it pulls on load, on a ↻ and on return
    const id = onLiveRefresh(pull)   // LIVE ON YOUR TAP (2026-10-02): no timer -- a ↻ or a return to the tab (lib/liveRefresh.js)
    const onVis = () => { if (!document.hidden) pull() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      id()
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [isTmrw])

  // ── THE LEDGER REMEMBERS (2026-08-17) ─────────────────────────────────────
  // Donovan, diagnosing his own bug correctly: "the ledger is live and when
  // the game goes off the player disappears. i dont want it like that."
  //
  // He was right. The ledger rebuilt itself from the CURRENT snapshot every
  // tick, and a player was only "a homer tonight" for as long as his game was
  // in that snapshot. Three ways out of it: his game goes Final past the
  // viewer's midnight (the viewer-local date filter in liveSlate — fixed
  // there too), his game's single boxscore call fails one tick, or the feed
  // hiccups entirely. Each one silently un-homered a man who had homered.
  //
  // A ledger is a RECORD. Once a homer is seen it is written down — keyed by
  // slate date, max-HR-per-player so a late correction can only add, persisted
  // to localStorage so a page reload mid-slate does not start the night over.
  // Nothing is ever removed until the date key changes. Yesterday's entries
  // are dropped by key, not by feed behaviour.
  const seenRef = useMemo(() => {
    const store = { key: `ms_ledger_seen_${dateKey}`, map: new Map() }
    try {
      // Prune any other night's record while loading tonight's — but NOT while
      // the research view is parked on an archived night (2026-08-24). That
      // mount's dateKey is the night being READ, and the prune would have
      // deleted tonight's live record as a side effect of looking at
      // yesterday: the homers would still be on the branch, but the running
      // in-browser record the Home panel renders from would be gone.
      if (!(research && night)) {
        for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
          const k = window.localStorage.key(i)
          if (k && k.startsWith('ms_ledger_seen_') && k !== store.key) window.localStorage.removeItem(k)
        }
      }
      const raw = window.localStorage.getItem(store.key)
      if (raw) Object.entries(JSON.parse(raw)).forEach(([pid, rec]) => store.map.set(Number(pid), rec))
    } catch { /* private mode: memory-only, still sticky for the session */ }
    return store
  }, [dateKey, research, night])

  const rows = useMemo(() => {
    if (isTmrw) return null

    // hr_events by pid, from the graded file when it is for tonight. This is
    // the ONLY thing taken from the bot now, and its absence is survivable.
    const eventsById = new Map()
    if (payload && String(payload.date || '') === String(dateKey)) {
      dedupeGraded(payload.graded_slots || payload.results || []).forEach((s) => {
        const pid = Number(s?.player_id)
        if (pid && Array.isArray(s?.hr_events) && s.hr_events.length) eventsById.set(pid, s.hr_events)
      })
    }

    // THE LIVE PATH — write what the snapshot shows into the record, then
    // RENDER THE RECORD. The snapshot can only ever add or raise; a player
    // missing from this tick keeps last tick's entry.
    // AN ARCHIVED NIGHT NEVER READS THE LIVE WIRE. The snapshot is tonight's
    // by definition, and folding it into a past night would put tonight's
    // homers under yesterday's date.
    const lines = (research && night) ? null : live?.lines
    if (lines && Object.keys(lines).length) {
      Object.entries(lines).forEach(([id, l]) => {
        const pid = Number(id)
        const hr = n(l?.hr, 0)
        if (!pid || hr <= 0) return
        const prev = seenRef.map.get(pid)
        if (!prev || hr > prev.hr) {
          seenRef.map.set(pid, { hr, name: String(l?.name || prev?.name || '') })
        }
      })
      try {
        window.localStorage.setItem(seenRef.key,
          JSON.stringify(Object.fromEntries([...seenRef.map].map(([k, v]) => [k, v]))))
      } catch { /* full or private: the in-memory record still holds */ }
    }
    if (seenRef.map.size) {
      return [...seenRef.map].map(([pid, rec]) => ({
        pid, hr: rec.hr, events: eventsById.get(pid) || [], liveName: rec.name, fromLive: true,
      }))
    }
    if (lines && Object.keys(lines).length) {
      // Snapshot loaded, record empty: a real zero once games have started;
      // indistinguishable from "not loaded" before first pitch.
      const started = Object.values(live?.games || {}).some((g) => g?.state && g.state !== 'Preview')
      if (started) return []
    }

    // FALLBACK: the graded file, exactly as before. Reached before first pitch,
    // when the league call fails, and on any archived night.
    if (!payload) return null
    // date gate — the live file keeps the last graded slate until the next
    // one starts grading, so an ungated read shows a stale night
    if (String(payload.date || '') !== String(dateKey)) return null
    // DEDUPE BY PLAYER (2026-08-09). A hitter designated in two categories
    // (TOP *and* HR, say) gets a graded slot per category, each carrying the
    // same actual_hr — walking the slots naively counted his homer twice and
    // inflated the night's total. The rule now lives in lib/graded.js because
    // it had bitten three components; this call site kept its own copy of it
    // until then.
    return dedupeGraded(payload.graded_slots || payload.results || [])
      // hr_events rides along from 2026-08-11: the grader now records each
      // homer's launch speed, angle and distance, so the ledger can say WHAT
      // KIND of homer it was and not just that one happened. Older nights
      // have no hr_events and simply show no band — an untracked homer and a
      // wall-scraper are different claims.
      // NAME AND TEAM RIDE ALONG (2026-08-24). They always existed in the
      // file and were always thrown away, because the card resolved every
      // hitter against the SLATE rows — which are tonight's. That is fine for
      // tonight and wrong the moment the research view is parked on an
      // archived night: anyone who homered on August 22 and is not playing
      // today had no slate row to match, so he rendered as "#673357". The
      // graded row knows who he is; take its word for it when the slate has
      // nothing to say.
      .map((s) => ({
        pid: Number(s?.player_id),
        hr: n(s?.actual_hr, 0),
        events: s?.hr_events || [],
        fileName: clean(s?.name, ''),
        fileTeam: clean(s?.team, ''),
        fileSpot: n(s?.lineup_spot, 0) || null,
      }))
      .filter((x) => x.pid && x.hr > 0)
  }, [payload, isTmrw, dateKey, live, seenRef, research, night])

  // ── THE NUMBER HAS TO BE RIGHT, OR THE PANEL IS WORSE THAN NOTHING ───────
  //
  // AUDIT 2026-08-09. `nth` was computed as slate.season_hr + tonight's homers,
  // and that arithmetic is wrong in two ways that both produce a confidently
  // stated false number — the worst failure mode for a panel whose entire job
  // is to print a number.
  //
  //   1. season_hr IS NOT ALWAYS PREGAME. The slate republishes thirteen times
  //      a day. A hitter who goes deep in the 1:05 window gets a rebuilt slate
  //      row at 4pm whose season_hr ALREADY counts that homer — so pre + hr
  //      counts it twice and the ledger says "his 31st" for his 30th. Nothing
  //      in the payload distinguishes a pregame count from a refreshed one.
  //
  //   2. MULTI-HOMER GAMES SKIPPED ROUND NUMBERS. Only the final number was
  //      tested for a milestone, so a hitter sitting on 14 who hit two tonight
  //      reached 15 and 16 — and 16 isn't round, so his 15th went unmarked.
  //
  // Both disappear if we stop doing arithmetic and ask the league. One batched
  // people/stats call returns the AUTHORITATIVE season total, already including
  // tonight, so his latest homer IS that number and the ones he hit tonight
  // are the range below it. Same endpoint Storylines already uses.
  //
  // The slate arithmetic survives only as the fallback when the call fails,
  // and rows sourced that way are marked approximate in their tooltip rather
  // than presented with the same confidence.
  const [seasonHr, setSeasonHr] = useState(null)   // pid -> authoritative total
  // KEYED ON pid:hr, NOT JUST pid (2026-08-13, same "load faster" pass). The
  // old key was the pid list alone, so a SECOND homer from someone already on
  // tonight's list didn't change the key and never re-asked the league — his
  // season total could sit one light until some other, unrelated player's
  // homer happened to change the pid set. Encoding tonight's own count per
  // pid means an actual change to what we need to know is the only thing
  // that retriggers a check, and it's what the cache below keys against.
  const hrKey = useMemo(
    () => (rows || []).map((r) => `${r.pid}:${r.hr}`).sort().join(','),
    [rows],
  )
  useEffect(() => {
    if (!rows?.length) { setSeasonHr(null); return undefined }
    let alive = true
    const tonightCount = new Map(rows.map((r) => [r.pid, r.hr]))
    ;(async () => {
      const out = new Map()
      const now = Date.now()
      const need = []
      // CACHED PER PID (2026-08-13, "load faster"). Switching tabs away from
      // Scoreboard and back used to re-ask the league for every hitter's
      // season total from scratch, even seconds later. A season total is
      // final the moment his homer lands, so it's safe to hold for a few
      // minutes — only served from cache when we last fetched at or after his
      // CURRENT tonight tally, so a fresh homer always forces a fresh ask.
      tonightCount.forEach((hr, pid) => {
        const hit = seasonHrCache.get(pid)
        if (hit && hit.atCount >= hr && now - hit.ts < SEASON_HR_TTL) {
          out.set(pid, { hr: hit.hr, jersey: hit.jersey, dayRoot: hit.dayRoot, lifePath: hit.lifePath })
        } else need.push(pid)
      })
      for (let i = 0; i < need.length; i += 100) {
        const batch = need.slice(i, i + 100)
        // primaryNumber + birthDate (2026-08-13, numerology): both ride the
        // SAME batched call the season total already makes — nothing new to
        // fetch, just two more field names in the sparse-fieldset. Both are
        // base `people` fields (same level as `id`), not nested under stats.
        const url = 'https://statsapi.mlb.com/api/v1/people?personIds='
          + batch.join(',')
          + '&hydrate=stats(group=[hitting],type=[season])'
          + '&fields=people,id,primaryNumber,birthDate,stats,type,displayName,splits,team,gameType,stat,homeRuns,gamesPlayed'
        try {
          const j = await fetch(url).then((r) => (r.ok ? r.json() : null))
          ;(j?.people || []).forEach((person) => {
            // pickSplit, not splits[0]: a hitter traded mid-season has one
            // row per club and splits[0] is the OLD one, so his Nth-homer
            // number would be short by everything he did after the trade.
            const blk = (person.stats || []).find((s) => s?.type?.displayName === 'season')
            const hr = Number(pickSplit(blk)?.homeRuns)
            const pid = Number(person.id)
            const jerseyNum = Number(person.primaryNumber)
            // '' !== null but Number('') is 0 — without the empty-string
            // guard, "no number on file" would silently become "wears #0."
            const jersey = person.primaryNumber != null && person.primaryNumber !== '' && Number.isFinite(jerseyNum) ? jerseyNum : null
            const dayRoot = dayRootOf(person.birthDate)
            const lifePath = lifePathOf(person.birthDate)
            if (Number.isFinite(hr)) {
              out.set(pid, { hr, jersey, dayRoot, lifePath })
              seasonHrCache.set(pid, { hr, jersey, dayRoot, lifePath, atCount: tonightCount.get(pid) ?? 0, ts: now })
            }
          })
        } catch { /* fall back to slate arithmetic for these ids */ }
      }
      if (alive) setSeasonHr(out.size ? out : null)
    })()
    return () => { alive = false }
  }, [hrKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // the numbers live in lib/ledger/homerModel.js (2026-10-03); this component draws them
  // peopleLoaded, not people: the Map is stable, the tick is what changes
  const model = useMemo(() => homerModel({ rows, players, seasonHr, people }), [rows, players, seasonHr, peopleLoaded])   // eslint-disable-line react-hooks/exhaustive-deps

  // ── THE ARCHIVE WRITE (2026-08-18) ────────────────────────────────────────
  // Donovan: "the data can be stored in alignment for use, if need have the
  // data for archive as well." This is the one place on the site that knows
  // what ACTUALLY happened numerology-wise tonight — everywhere else
  // (Alignments.js) only ever sees the pregame slate. So this writes a small
  // summary under today's date every time the model changes with real homers
  // in it; Alignments reads it back as "today's number so far" live, and as
  // "yesterday's number" the next day, once this key stops being touched and
  // is effectively frozen. Guarded to the REAL live date — a look at a past
  // slateDate must never overwrite that day's own already-frozen archive.
  useEffect(() => {
    if (dateKey !== easternToday() || !model || !model.total) return
    writeAlignArchive(dateKey, {
      total: model.total,
      topRoot: model.topRoot ? { root: model.topRoot.root, names: model.topRoot.list.map((c) => c.name) } : null,
      topJerseyRoot: model.topJerseyRoot ? { root: model.topJerseyRoot.root, names: model.topJerseyRoot.list.map((c) => c.name) } : null,
      topDayRoot: model.topDayRoot ? { root: model.topDayRoot.root, names: model.topDayRoot.list.map((c) => c.name) } : null,
      topLifePath: model.topLifePath ? { root: model.topLifePath.root, names: model.topLifePath.list.map((c) => c.name) } : null,
      roots: model.roots.map((r) => ({ root: r.root, n: r.list.length })),
      aligned: model.aligned.slice(0, 15).map((c) => ({
        pid: c.pid, name: c.name, team: c.team,
        tags: c.tags.map((t) => t.label),
      })),
    })
  }, [model, dateKey])

  // ── WHY THIS NOW RENDERS BEFORE THE FIRST HOMER (2026-08-17) ──────────────
  //
  // Donovan, for the third time: "im also looking for that home run ledger
  // thing maybe it will show during the slate". His guess was exactly right,
  // and that WAS the bug. Earlier: "people are saying they dont see it or i
  // wish i would have seen it earlier."
  //
  // Two gates were hiding it, and moving it onto five surfaces fixed neither:
  //   1. Every mount site required `results?.live_mode === true`, so during the
  //      day the component was not on the page at all.
  //   2. This line returned null whenever the night's homer count was 0 — so
  //      even once live, it stayed invisible until the first ball left the yard.
  //
  // Between them, the ledger only existed in the window after the first homer
  // of the night. Nobody can learn that a feature exists inside a window they
  // have to already be watching to see. A thing you cannot find before it has
  // content is a thing you never find.
  //
  // So: tomorrow still returns null, because there is nothing to say about a
  // slate that has not happened. But today with zero homers renders a WAITING
  // strip — it names itself, says what it will show, and says when. That is
  // information, not decoration: "no homers yet" is a fact about tonight.
  // TOMORROW STILL SAYS NOTHING — there is no night to report on — but the
  // RESEARCH page must not vanish when the site happens to be parked on
  // tomorrow's slate: the whole point of that page is the nights behind you.
  // So it keeps its header and its picker and says which it is.
  if (isTmrw && !(research && night)) {
    if (!research) return null
    return (
      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: '9px 14px 11px', marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12.5, fontWeight: 900 }}>💥 Homer ledger — research</span>
          <span style={{ fontSize: 9.5, color: C.text3 }}>
            the site is on tomorrow&apos;s slate, which has not happened — pick a night below
          </span>
        </div>
        <NightPicker />
        {nights.length === 0 && (
          <div style={{ fontSize: 10.5, color: C.text3, marginTop: 6, lineHeight: 1.6 }}>
            No nights archived on this device yet. The Archive view can pull them off the branch.
          </div>
        )}
      </div>
    )
  }

  if (!model || !model.total) {
    // ── PREGAME: THE LEDGER'S OWN QUESTIONS, ASKED FORWARD ──────────────────
    // Donovan: "pregame numerology suggestions like the storylines would be
    // helpful for the ledger, that way i can see where it lies even when slate
    // hasnt fully kicked off."
    //
    // Not a placeholder. The same three things the ledger reports after a homer
    // — what number it was, which lineup spot it came from, whether the names
    // rhyme — stated about tonight's board before anything has happened. Every
    // line is a countable fact with its denominator on it, and the header says
    // outright that none of it is graded or fed into a score, because numerology
    // presented without that sentence is the most misleading thing here.
    const pre = pregameLedger(players)
    return (
      <div style={{
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: '9px 14px 11px', marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
          <span onClick={research ? undefined : toggle}
                style={{ fontSize: 12.5, fontWeight: 900, cursor: research ? 'default' : 'pointer' }}>
            💥 Homer ledger{research ? ' — research' : ''}
          </span>
          <span style={{ fontSize: 9.5, color: C.text3 }}>
            {research && night
              // An archived night with nobody in it is a REAL answer, and it is
              // not "no homers YET" — that sentence belongs to tonight only.
              ? `no homers in the graded file for ${night}`
              : 'no homers yet tonight — it fills as they land, on its own, every few seconds'}
          </span>
          {/* ── YESTERDAY'S ALIGNMENT (2026-08-23) ─────────────────────────
              Donovan: "when all the games are final look at the running themes
              document, keep for tomorrow as yesterday's alignment, then same
              thing." The ledger is keyed to ONE slate date and prunes every
              other night's record on load, so at the 3:30am rollover last
              night stopped existing here — which is what "the players
              disappear" was. The archive the ledger already writes every night
              (writeAlignArchive, 2026-08-18) is the running record; it was
              only ever read by Alignments. Reading it back here means the
              blank before tonight's first homer is no longer blank: it is
              what last night landed on, which is the thing you carry in. */}
          {(() => {
            const y = readAlignArchive(shiftDateKey(dateKey, -1))
            if (!y || !y.total) return null
            const bits = []
            if (y.topRoot) bits.push(`root ${y.topRoot.root}`)
            if (y.topLifePath) bits.push(`life path ${y.topLifePath.root}`)
            if (y.topDayRoot) bits.push(`day ${y.topDayRoot.root}`)
            if (y.topJerseyRoot) bits.push(`jerseys on ${y.topJerseyRoot.root}`)
            return (
              <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}
                title={y.topRoot ? `Last night's root ${y.topRoot.root}: ${(y.topRoot.names || []).join(', ')}` : undefined}>
                · yesterday: {y.total} homers{bits.length ? ` on ${bits.join(' · ')}` : ''}
              </span>
            )
          })()}
          {/* ── THE BLANK EXPLAINS ITSELF (2026-08-17) ─────────────────────
              Donovan: "one person went yard and the hr ledger has not
              populated with anything." A blank that might mean "no homers",
              "league call failing", or "still waiting on the first pull" is
              three different problems wearing one face. Say which. */}
          {(() => {
            if (liveErr) {
              return <span style={{ fontSize: 9, color: C.yellow }} title={liveErr}>⚠ league feed failing — retrying</span>
            }
            if (!live) return <span style={{ fontSize: 9, color: C.text3 }}>· first check pending…</span>
            const games = Object.values(live?.games || {})
            const started = games.filter((g) => g?.state && g.state !== 'Preview').length
            const lines = Object.keys(live?.lines || {}).length
            return (
              <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}
                title="What the league feed is showing this panel right now. If a homer has landed and this still reads 0, the boxscore has not caught up yet — it usually lags the broadcast by under a minute.">
                · watching {started}/{games.length} games · {lines} live batting lines
              </span>
            )
          })()}
          {!research && <Chevron />}
        </div>
        <NightPicker />
        {!openNow || pastNight ? (
          // An archived night that graded to nothing: say that, and say
          // nothing else — every strip below this describes tonight's board.
          pastNight ? (
            <div style={{ fontSize: 10.5, color: C.text3, marginTop: 5, lineHeight: 1.6 }}>
              The graded file for {night} has no home runs in it. Either nothing left the yard
              among the names the sheet was watching, or the night was written before any game
              finished.
            </div>
          ) : null
        ) : !pre ? (
          <div style={{ fontSize: 10, color: C.text3, marginTop: 4, lineHeight: 1.6 }}>
            When one goes, this is where it shows up: who hit it, what number home
            run it was for him, which lineup spot it came from, whether the bot had
            him, and the shape of the swing.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 9.5, color: C.text3, margin: '5px 0 6px', lineHeight: 1.6, maxWidth: 820 }}>
              <b style={{ color: C.text2 }}>Until then — what it is watching.</b>{' '}
              Countable facts about tonight&apos;s board, not forecasts:{' '}
              <b style={{ color: C.text2 }}>none of this is graded and none of it feeds any score.</b>{' '}
              Read it as where the interesting numbers already sit.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <LookOut players={players} onPlayerClick={onPlayerClick} onOpenPitcher={onNavigate ? (pid) => { leaveTarget('pitcher', pid); onNavigate('pitchers') } : null} />
              {/* Chips, for the reason the look-out above got them
                  (2026-08-29): four names each followed by the same
                  "29→30 ★" shape reads as a sentence you have to parse. The
                  count and the caveat live in the label, once; each name is
                  a tappable chip carrying only its own two numbers. */}
              {pre.milestones.length > 0 && (
                <div className="ledger-chip-row">
                  <span className="ledger-chip-label" style={{ color: '#FCD34D' }}>
                    One away from a round number
                    <i>{pre.milestones.length} of {pre.total} hitters · ★ = the bot designated him</i>
                  </span>
                  <div className="ledger-chips">
                    {pre.milestones.slice(0, 4).map((m) => (
                      <button
                        type="button"
                        key={`${m.name}-${m.next}`}
                        className="ledger-chip"
                        onClick={onPlayerClick ? () => onPlayerClick(m._raw) : undefined}
                        disabled={!onPlayerClick}
                      >
                        <b>{m.name}</b>
                        <em>{m.at}→{m.next}</em>
                        {m.designated && <span className="ledger-chip-star">★</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {pre.stack && (
                <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.65 }}>
                  <b style={{ color: '#f97316' }}>Where the picks are batting.</b>{' '}
                  The <span style={{ fontFamily: NUM_FONT }}>#{pre.stack.spot}</span> hole holds{' '}
                  <span style={{ fontFamily: NUM_FONT }}>{pre.stack.count}</span> of the{' '}
                  <span style={{ fontFamily: NUM_FONT }}>{pre.stack.placed}</span> designated
                  hitters with a confirmed spot — the ledger reports the spot every homer
                  came from, so this is the same column, before the fact.
                </div>
              )}
              {/* ── FOR FUN, AND SAID SO (2026-08-29) ────────────────────
                  Donovan, asked how the coincidence blocks should read after
                  the rebuild: "i like one and two, but do what's best."

                  What's best is the first with the second's care. These two —
                  shirt numbers landing on home-run counts, and hitters whose
                  names rhyme — are the only things on this page that are pure
                  overlap. Everything else here is a countable fact about
                  tonight's board with a reason to be looked at. Mixed into the
                  same column, at the same weight, in the same voice, a reader
                  has no way to tell which is which — and the prettier the
                  containers around them get, the worse that gets. That is the
                  actual integrity problem in this rebuild, and it is this one.

                  So: their own panel, headed with the disclaimer instead of
                  trailing it, drawn a step quieter than the measured blocks —
                  no accent colour on the labels, no large numerals, a dimmer
                  ground. Not hidden, not shrunk to a link, not rewritten: the
                  writing is the part he likes and every word of it survives.
                  They simply cannot be mistaken for a finding any more.

                  Nothing is dropped. Full counts, full names, same clicks. */}
              {(pre.jerseys.length > 0 || pre.echoes.length > 0) && (
                <div className="ledger-forfun">
                  <div className="ledger-forfun-head">
                    <span>🎲 For fun · not evidence</span>
                    <em>overlap, not signal</em>
                  </div>
                  <p className="ledger-forfun-caveat">
                    Raw counts across tonight&apos;s {pre.picks} picks, noticed after the fact. No
                    significance test is possible before the fact — the sample and the population
                    would be the same people — so nothing below claims anything about likelihood.
                    None of it is graded and none of it feeds any score.
                  </p>

                  {pre.jerseys.length > 0 && (
                    <div className="ledger-forfun-row">
                      <span className="ledger-forfun-label">Number meets number</span>
                      <span className="ledger-forfun-body">
                        {pre.jerseys.length} hitters whose home run count is level with their shirt
                        or one short of it:{' '}
                        {pre.jerseys.slice(0, 3).map((j, i) => (
                          <span key={`${j.name}-${j.jersey}`}>
                            {i > 0 && ' · '}
                            <span
                              onClick={onPlayerClick ? () => onPlayerClick(j._raw) : undefined}
                              style={{ cursor: onPlayerClick ? 'pointer' : 'default', color: C.text2, fontWeight: 700 }}
                            >{j.name}</span>
                            <span style={{ fontFamily: NUM_FONT }}>
                              {' '}#{j.jersey}, {j.hr} HR{j.kind === 'reaches' ? ' — one to match' : ' — level'}
                            </span>
                          </span>
                        ))}
                      </span>
                    </div>
                  )}

                  {pre.echoes.length > 0 && (
                    <div className="ledger-forfun-row">
                      <span className="ledger-forfun-label">Names that rhyme tonight</span>
                      <span className="ledger-forfun-body">
                        {pre.echoes.map((e, i) => (
                          <span key={`${e.kind}-${e.key}`}>
                            {i > 0 && ' · '}
                            <span style={{ color: C.text2, fontWeight: 700 }}>{e.names.join(' + ')}</span>
                            <span>{` (same ${e.kind === 'first' ? 'first name' : 'surname'})`}</span>
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
        <style jsx>{`
          .ledger-chip-row{display:flex;flex-direction:column;gap:5px}
          .ledger-chip-label{display:flex;align-items:baseline;gap:7px;flex-wrap:wrap;font-size:10.5px;font-weight:800}
          .ledger-chip-label i{color:${C.text3};font-family:${NUM_FONT};font-size:8.5px;font-weight:700;font-style:normal;letter-spacing:.03em}
          .ledger-chips{display:flex;flex-wrap:wrap;gap:5px}
          .ledger-chip{display:inline-flex;align-items:baseline;gap:5px;padding:4px 9px;border:1px solid ${C.border};border-radius:999px;background:${C.bg};color:inherit;font-family:inherit;cursor:pointer}
          .ledger-chip:disabled{cursor:default}
          .ledger-chip:hover:not(:disabled){border-color:rgba(252,211,77,.45);background:rgba(252,211,77,.07)}
          .ledger-chip b{font-size:10.5px;font-weight:800;color:${C.text}}
          .ledger-chip em{color:${C.text3};font-family:${NUM_FONT};font-size:9px;font-weight:900;font-style:normal}
          .ledger-chip-star{color:#FCD34D;font-size:9px}
          /* A step quieter than everything above it, on purpose: no accent on
             the labels, no large numerals, a dimmer ground and a dashed edge.
             It has to be readable and it must not look like a board. */
          .ledger-forfun{margin-top:4px;padding:9px 11px;border:1px dashed ${C.border2};border-radius:10px;background:rgba(255,255,255,.015)}
          .ledger-forfun-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px}
          .ledger-forfun-head span{font-size:9px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:${C.text3}}
          .ledger-forfun-head em{font-family:${NUM_FONT};font-size:8px;font-weight:800;font-style:normal;color:${C.text3};opacity:.8}
          .ledger-forfun-caveat{margin:5px 0 8px;font-size:9px;line-height:1.55;color:${C.text3}}
          .ledger-forfun-row{display:flex;flex-wrap:wrap;gap:4px 8px;padding:5px 0;border-top:1px solid rgba(255,255,255,.05)}
          .ledger-forfun-label{flex:0 0 auto;font-size:9.5px;font-weight:800;color:${C.text3};letter-spacing:.02em}
          .ledger-forfun-body{flex:1 1 220px;min-width:0;font-size:10px;line-height:1.6;color:${C.text3}}
        `}</style>
      </div>
    )
  }
  const { cards, spots, spotMax, total, placed, topSpot, repeats, roots, topRoot, numbered, aligned, nextUp = [] } = model
  const milestones = cards.filter((c) => c.milestone)

  return (
    <LedgerFrame accent={C.orange}>
      {/* ── THE WHOLE HEADER WAS ONE BIG CLOSE BUTTON (2026-08-23) ────────
          Donovan: "i'm wondering what happened to the home runs on the
          ledger." Nothing had: ms_ledger_open was "0" on his phone and
          nineteen homers were sitting behind a collapsed panel. This row is
          the full width of the card and every part of it toggled, so a tap
          meant to scroll, or to read the count, shut the thing — and a
          remembered close means it stays shut the next night too.
          The title and the chevron toggle. The count and the note do not. */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
        {/* On its own tab (standalone) there is nothing to fold -- the toggle only
            flipped ms_ledger_open and collapsed Home's ledger next visit
            (route audit B3). Title inert, chevron gone, there and in research. */}
        <span onClick={research || standalone ? undefined : toggle}
          style={{ fontSize: 12.5, fontWeight: 900, cursor: research || standalone ? 'default' : 'pointer' }}>
          🧾 Homer ledger{research ? ' — research' : ''}
        </span>
        <span style={{ fontSize: 10, color: C.orange, fontFamily: NUM_FONT, fontWeight: 800 }}>
          {total} {research && night ? `on ${night}` : 'tonight'}
        </span>
        {!research && onNavigate && (
          <span onClick={() => onNavigate('ledger')}
            title="The full ledger with every night this browser has seen — the roots, the echoes, the matching game, all of it"
            style={{
              fontSize: 9, color: C.cyan, cursor: 'pointer', fontFamily: NUM_FONT,
              textDecoration: 'underline', textDecorationStyle: 'dotted',
            }}>research →</span>
        )}
        {!research && onNavigate && (
          <span onClick={() => { try { window.sessionStorage.setItem('ms_ledger_open_view', 'season') } catch { /* private mode */ } onNavigate('ledger') }}
            title="Every homer in the majors across the nights this device holds — by night, and by hitter"
            style={{
              fontSize: 9, color: C.orange, cursor: 'pointer', fontFamily: NUM_FONT,
              textDecoration: 'underline', textDecorationStyle: 'dotted',
            }}>season record →</span>
        )}
        {openNow
          ? <span style={{ fontSize: 9, color: C.text3 }}>{research ? 'every night this browser has seen' : 'builds as the slate plays'}</span>
          : <span onClick={toggle} style={{ fontSize: 9, color: C.orange, cursor: 'pointer', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
              hidden — tap to show all {total}
            </span>}
        {!(research || standalone) && <span onClick={toggle} style={{ cursor: 'pointer' }}><Chevron /></span>}
      </div>
      <NightPicker />

      {/* Everything below the header folds. The count stays visible closed, so
          a shut ledger still tells you how many have landed. */}
      {openNow && (
      // the sections in the shared ledger order (components/ledger/LedgerBody, BATCH-ONE-SITE
      // step 1) -- the same blocks, props and order as before, so the page is unchanged
      <LedgerBody sections={{
        intro: (<WhatThis maxWidth={640}>
        which homer of the season each one was, and where in the order tonight&apos;s power is coming from.
      </WhatThis>),
        round: (<RoundLine label={pastNight ? `Round number on ${night}:` : 'Round number tonight:'}
        items={milestones.map((c) => ({ key: c.pid, name: c.name, num: ord(c.roundNum ?? c.nth), onClick: c.p ? () => onPlayerClick?.(c.p) : null }))} />),
        /* ── DID TONIGHT'S HOMERS HIT THE PREGAME WATCHLIST? (2026-08-17) ─────
          Donovan: "home rundegler sshould also knwo todals numeroldy and see if
          any player algin with them ass well."
          The pregame panel names who is one homer from a round number, whose
          shirt matches his homer count, and which names rhyme. When the slate
          starts, that list stops being visible — so the ledger never checked
          its own predictions against what actually happened. It does now.
          This is a HIT/MISS on a list stated in advance, which makes it the one
          numerology claim on the site that is falsifiable. It says the miss
          count too, because a watchlist that only reports its hits is a horoscope. */
        watch: ((() => {
        if (pastNight) return null
        const pre = pregameLedger(players)
        if (!pre) return null
        const homered = new Map()
        cards.forEach((c) => { if (c.pid != null) homered.set(String(c.pid), c) })
        const nameHit = new Set(cards.map((c) => String(c.name || '').toLowerCase()))
        const hitMs = pre.milestones.filter((m) => homered.has(String(m._raw?.player_id)))
        const hitJs = pre.jerseys.filter((j) => homered.has(String(j._raw?.player_id)))
        const hitEch = pre.echoes.filter((e) => e.names.some((nm) => nameHit.has(String(nm).toLowerCase())))
        const hits = hitMs.length + hitJs.length + hitEch.length
        const watched = pre.milestones.length + pre.jerseys.length + pre.echoes.length
        if (!watched) return null
        return (
          <WatchStrip label="Tonight's watchlist:" hits={hits} watched={watched}
            sentence={hits === 0
              ? 'landed so far — stated before first pitch, and none of it has come in yet.'
              : 'landed so far, off a list written before first pitch.'}>
              {hitMs.map((m) => (
                <span key={`m-${m.name}`}>
                  {' · '}<b onClick={() => m._raw && onPlayerClick?.(m._raw)}
                    style={{ color: C.text, cursor: onPlayerClick ? 'pointer' : 'default' }}>{m.name}</b>
                  <span style={{ color: C.text3, fontFamily: NUM_FONT }}> got his {ord(m.next)}</span>
                </span>
              ))}
              {hitJs.map((j) => (
                <span key={`j-${j.name}`}>
                  {' · '}<b onClick={() => j._raw && onPlayerClick?.(j._raw)}
                    style={{ color: C.text, cursor: onPlayerClick ? 'pointer' : 'default' }}>{j.name}</b>
                  <span style={{ color: C.text3, fontFamily: NUM_FONT }}> #{j.jersey}, now level</span>
                </span>
              ))}
              {hitEch.map((e) => (
                <span key={`e-${e.key}`}>
                  {' · '}<span style={{ color: C.text }}>{e.names.join(' + ')}</span>
                  <span style={{ color: C.text3 }}> — one of the rhyme went</span>
                </span>
              ))}
          </WatchStrip>
        )
      })()),
        /* 🧲 ALIGNING WITH THE NIGHT — the lead, because it's the question.
          Everything below this is the raw material; this is the answer. */
        align: (<AlignBox
        title={`🧲 ${pastNight ? `Aligning on ${night}` : 'Aligning with tonight'}`}
        sub={`${aligned.length} homer${aligned.length === 1 ? '' : 's'} lining up with ${pastNight ? `${night}'s` : "tonight's"} numbers`}
        chips={aligned.map((c) => ({ key: `al${c.pid}`, name: c.name, tags: c.tags, onClick: c.p ? () => onPlayerClick?.(c.p) : null }))}
        foot="Overlap, not evidence. ~25 homers spread over fifty numbers, nine lineup spots, jersey numbers and birthdays will line up by arithmetic alone — this is the trend made visible while it forms, never a reason to chase one."
      />),
        /* ── 🔤 NAME ECHOES (2026-08-16) ───────────────────────────────────
          Donovan: "all track common names or names that vibe together like
          bobby witt tommy white 2 sylablas or like bryce and brice... maybe
          all the j names are going... austin riley riley greene or pete
          alonso pete crow."

          Sibling of the numerology block directly above, and held to the
          same standard, which for this one is the entire difficulty: with
          ~25 names you will ALWAYS find some shared initial or rhyme, so a
          panel that prints whatever it found is a noise generator. It is
          baselined against everyone who batted tonight and only speaks when
          a pattern beats chance — three J-names is nothing if a sixth of the
          league is a J. `population` is not optional dressing: without it the
          initial family cannot be rated at all and drops out. See
          lib/namePatterns.js, which measured its own false-positive rate
          against 300 synthetic nights rather than assuming one.

          Renders nothing when nothing clears. That is the normal state. */
        lookout: (!pastNight && <LookOut players={players} onPlayerClick={onPlayerClick} onOpenPitcher={onNavigate ? (pid) => { leaveTarget('pitcher', pid); onNavigate('pitchers') } : null} />),
        /* The name-echo test needs the POPULATION it drew from, and on an
          archived night the population on file is tonight's slate — a
          different set of men. Rating August 22's names against August 24's
          board would be a null model of the wrong universe, so the test sits
          out rather than reporting a number nobody can defend. */
        names: (!pastNight && <NamePatterns homers={model.cards} population={players} />),
        /* 🔮 WHO LINES UP NEXT — the forward half of the alignment strip.
          "i need the ledger to have some prediction of players that align as
          well." Same three numbers the night is landing on, asked forward:
          who has NOT homered yet and is standing on one of them. Each chip
          carries its reasons in the tooltip and the strongest one inline.
          Pattern-watching, counted and disclosed — never fed to a score. */
        nextUp: (!pastNight && nextUp.length > 0 && (() => {
        // ── NOW, LATER, OR NOT AT ALL (2026-08-23) ────────────────────────
        // Donovan: "who's a J that looks good tonight that can go later or
        // now." A watch list that keeps naming men whose game ended two hours
        // ago is a list you stop reading, so the game state decides both who
        // survives and what order they stand in: still batting first, then
        // first pitch to come, and anybody already final is simply gone. The
        // state comes off the same live snapshot the ledger already holds —
        // `lines[pid].state` — so this costs nothing.
        const lines = live?.lines || {}
        const upcoming = nextUp
          .map((x) => {
            const st = String(lines[x.pid]?.state || '')
            return { ...x, when: st === 'Final' ? 'done' : st === 'Live' ? 'now' : 'later' }
          })
          .filter((x) => x.when !== 'done')
          .sort((a, b) => (a.when === b.when ? 0 : a.when === 'now' ? -1 : 1))
          .slice(0, 8)
        if (!upcoming.length) return null
        return (
          <NextUpBox title="🔮 Fits tonight's pattern, hasn't gone yet"
            rows={upcoming.map((x) => ({ key: x.pid, when: x.when, name: x.name, chips: x.chips,
              title: `${x.why.join('. ')}. Bot HR score ${x.hrScore.toFixed(0)}.`, onClick: onPlayerClick ? () => onPlayerClick(x.p) : null }))}
            about="Hitters not in the ledger who sit on whatever tonight is landing on — the leading root, a repeated number, the hot lineup spot, a jersey, a birth day, a life path, the name echo running tonight, or a straight match with somebody who already went: the same first name, the same surname, a name one letter apart, an odd syllable shape they share, or the same number on the back. ↔ is a match with that man. ⚡ means his game is live, ⏳ means first pitch is still ahead. Ranked by how many of those he sits on, then by HR score. A watch, not a prediction — nothing here is graded, scored, or fed to a pick." />
        )
      })()),
        /* 🔢 THE REPEATS — the number pattern, which is the whole reason this
          panel exists. Same-number clusters first, then the digit root. */
        pattern: ((repeats.length > 0 || topRoot) && (
        <div style={{
          background: 'rgba(167,139,250,.07)', border: '1px solid rgba(167,139,250,.3)',
          borderRadius: 10, padding: '7px 11px', marginBottom: 9,
        }}>
          <div style={{ fontSize: 10.5, fontWeight: 900, color: '#a78bfa', marginBottom: 3 }}>
            🔢 The number pattern
          </div>
          {repeats.map(({ num, list }) => (
            <div key={num} style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.6 }}>
              <b style={{ color: '#a78bfa', fontFamily: NUM_FONT }}>{list.length} hitters</b> notched their{' '}
              <b style={{ color: C.text, fontFamily: NUM_FONT }}>{ord(num)}</b> {nightWord} —{' '}
              {list.map((c, i) => (
                <span key={c.pid}>
                  {i > 0 ? ', ' : ''}
                  <span onClick={() => c.p && onPlayerClick?.(c.p)} style={{ cursor: c.p ? 'pointer' : 'default', color: C.text }}>{c.name}</span>
                </span>
              ))}
            </div>
          ))}
          {topRoot && (
            <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.6, marginTop: repeats.length ? 3 : 0 }}
              title={`Digit root: add the digits of the homer number until one digit is left (17 → 1+7 = 8). ${topRoot.list.length} of tonight's ${numbered.length} numbered homers land on ${topRoot.root}.`}>
              <b style={{ color: '#a78bfa', fontFamily: NUM_FONT }}>{topRoot.list.length}</b> of tonight&apos;s{' '}
              {numbered.length} numbered homers reduce to{' '}
              <b style={{ color: C.text, fontFamily: NUM_FONT }}>{topRoot.root}</b>{' '}
              <span style={{ color: C.text3 }}>
                ({topRoot.list.slice(0, 5).map((c) => c.nth).join(', ')}{topRoot.list.length > 5 ? '…' : ''})
              </span>
            </div>
          )}
          <div style={{ fontSize: 8.5, color: C.text3, marginTop: 4, lineHeight: 1.5 }}>
            Pattern watching, not evidence — ~25 homers spread over numbers 1–50 cluster by arithmetic
            alone. Digit root = add the digits until one is left (17 → 8). Fun to track, never a reason to bet.
          </div>
        </div>
      )),
        /* every homer tonight, numbered -- ScorerChips (components/ledger/LedgerBlocks.js) */
        scorers: (<ScorerChips sport="mlb" accent={C.orange} cards={cards.map((c) => ({
        key: c.pid, icon: '💥', team: c.team || null, name: c.name, times: c.hr, milestone: c.milestone, numHot: c.milestone,
        num: c.nth != null ? `${ord(c.nth)}${c.exact ? '' : '≈'}` : '—',
        spot: c.spot ? `#${c.spot}` : null,
        onClick: c.p ? () => onPlayerClick?.(c.p) : null,
        title: `${c.name}${c.team ? ` (${c.team})` : ''}${c.spot ? ` · batting ${ord(c.spot)}` : ''}${
          c.nth == null
            ? ' — no season HR count available for him, so the number is left blank rather than guessed'
            : ` — his ${ord(c.nth)} homer of the season${c.hr > 1 ? ` (${c.tonightNums.slice().reverse().map(ord).join(' and ')} tonight)` : ''}. ${
                c.exact
                  ? 'Season total read straight from the league, so it already includes tonight.'
                  : 'APPROXIMATE — the league total could not be read, so this is the slate’s pregame count plus tonight’s homers, which can run one high if the slate was rebuilt after he went deep.'}`}`,
        badges: [
          // WHAT KIND of homer (hrShapeMeta, only when the ball was tracked).
          ...(c.events || []).map((e, i) => { const m = hrShapeMeta(e); return m ? { k: `e${i}`, label: m.short, color: m.color, title: `${m.label} — ${hrLine(e)}. ${m.blurb}` } : null }).filter(Boolean),
          // The ways he lines up with the night's numbers, said as a word.
          ...(c.tags?.length > 0 ? [{ k: 'al', label: c.tags.length > 1 ? `${c.tags.length} ALIGNS` : 'ALIGNS', color: C.orange, title: `${c.tags.map((t) => t.label).join(' · ')} — ${c.tags.map((t) => t.why).join(' ')}` }] : []),
        ],
      }))} />),
        /* where in the order tonight's power came from */
        spots: (placed > 0 && (
        <SpotBars title="Homers by lineup spot" accent={C.orange}
          bars={spots.slice(1).map((v, i) => ({ key: i, label: i + 1, value: v, title: `${v} homer${v === 1 ? '' : 's'} tonight from the ${ord(i + 1)} spot, out of ${placed} placed` }))}
          foot={<>
            {placed} of {total} homers have a known lineup spot.
            {spots[topSpot] >= 3 && <> The <b style={{ color: C.text2 }}>{ord(topSpot)} spot</b> leads {nightWord} with {spots[topSpot]}.</>}
            {' '}A full slate is ~25 homers across nine spots, so a tall bar is a picture of one night,
            not a finding about baseball — read it as texture, never as a signal to chase.
          </>} />
      )),
      }} />
      )}
    </LedgerFrame>
  )
}
