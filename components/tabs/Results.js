'use client'
import CallHistory from '../record/CallHistory'
import CalibrationTable from '../record/CalibrationTable'
import MoneyAnswer from '../MoneyAnswer'
import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import Tap from '../Tap'
import { ModeBar as ModeBarPart, TabBtn } from '../results/ResultsParts'
import { etToday } from '../../lib/freshness'
import { mlbSlateState } from '../../lib/mlbSlateState'
import { tabName } from '../../lib/routes'
import { C, NUM_FONT, TYPE } from '../../lib/theme'
import { hr9Color } from '../../lib/hr9'
import { verdictInk } from '../../lib/scales'
import { gradedResultsUrl } from '../../lib/dataSource'
import { dedupeGraded } from '../../lib/graded'
import { n, clean } from '../../lib/player'
import { PanelTitle, Empty, Card, WhatThis } from '../ui'
import Backtest from './Backtest'
import ResultsDepth from './ResultsDepth'
import SignalAudit from '../SignalAudit'
import PickScorecard, { pickJob } from '../PickScorecard'
import ScoreAudit from '../ScoreAudit'
import ReportCard from '../ReportCard'
import PlayerPickRecord from '../PlayerPickRecord'
import PLSimulator from '../PLSimulator'
import DenseTable from '../DenseTable'
import { useLockedRecord } from '../../lib/useLockedRecord'
import { useMlbStatusNight } from '../../lib/useMlbStatus'
import { lockedPickLine } from '../../lib/record/lockedRecord'
import RecordPage from '../record/RecordPage'
import { mlbRecordModel } from '../../lib/record/page'

// EVERY NAME OPENS HIS CARD (2026-09-27, CLICK-EVERYTHING-PLAN): the page's
// onPlayerClick, available to every panel below without threading a prop
// through each one. A panel row becomes { player_id, name, team } -- the
// player card loads the rest by id.
const PickCtx = createContext(null)
const usePick = () => { const onPick = useContext(PickCtx); return onPick ? (row) => onPick({ player_id: row?.player_id ?? row?.id, name: row?.name, team: row?.team }) : null }

// SIMPLIFICATION PASS, 2026-08-09 (owner: "everything from Bettable results
// down is too much, even for me" / "I don't know what I'm looking at").
//
// What came out, and why — every cut is a fact that was already on the page in
// another shape, never a fact that was only here:
//
//   · ResultsDepth and Backtest used to render under EVERY sub-tab. Opening
//     the Report card gave you the season card AND the whole night's grading
//     AND the archive, stacked. They're now scoped: the night's depth belongs
//     to Overview, the archive belongs to the Report card.
//   · The "📋 Picks" sub-tab is gone. Its three views were duplicates — HR
//     Scorers repeated "Who delivered", Top Board repeated the Board rank
//     column, All repeated ResultsDepth's "Every pick" table. Its one unique
//     view, "Did its job", moved into Overview as a fold.
//   · The "🎯 HR by pitch" sub-tab is gone. It led with a paragraph saying it
//     is NOT the pitch tonight's homer was hit off and runs a day behind —
//     the same per-hitter breakdown is one click away inside a player's card,
//     where it isn't pretending to be a result.
//   · "Category Performance" bars came out: pick-type rates are already the
//     lane chips in Overview §3 and the tier table in ResultsDepth.
//   · The day picker became an archive browser instead of a tenth filter.

// ── 2026-08-16, THE FLOW PASS ───────────────────────────────────────────────
//
// Donovan sent this page twice — the overview and the True Price sub-view —
// with one note across the whole round: "lots of the pages seems all over the
// palace or scrroll up to scoll back down", things should "flow beetter".
//
// Three things were wrong here and all three were navigation or repetition:
//
//   1. SEVEN SUB-TABS IN TWO ROWS. THIS NIGHT (3) and ALL SEASON (4) sat as
//      two labelled rows of pills under a third row (Results / True Price) and
//      under the day picker. Four rows of chrome before a number. The two
//      groups are genuinely different questions, so they are now the top-level
//      control — three modes, one row, each captioned with the question it
//      answers — and the views inside a mode are one row of at most four pills
//      under it. Nothing was deleted; each mode remembers where you left it.
//   2. THE DAY PICKER SAT ABOVE FOUR VIEWS IT DOES NOT MOVE. Report card,
//      Track record, Signals and P/L all span the archive and ignore it. It
//      now renders only in This night, where it applies.
//   3. "THE NIGHT IN NUMBERS" — five tiles restating the five sentences
//      directly above them. Folded into those sentences, with every number,
//      every sub-line and every tooltip kept. Tiles lose to sentences; this is
//      the sixth time that has been recorded in this repo.
//
// Also fixed on the way past: the "nothing graded yet" early return used to
// bail out of the WHOLE tab, so on a pregame morning the season report card,
// the signal audit and the P/L simulator were unreachable even though none of
// them depends on tonight. The guard is scoped to This night now.

// ── helpers ────────────────────────────────────────────────────────────────

// TAG_COLORS is the HR-scorer bubble's tag-emoji identity (🏆/🧨/🔥/🏁/💠/⚾/⭐)
// -- genuinely categorical, same as Pairs.js's own TAG_COLORS, but it doesn't
// overlap CAT.role/pitch/result so it isn't a lib/scales.js concept. Left as
// a literal dictionary on purpose, the same call the Pairs.js pass made for
// the identical shape: adding a CAT key for it is a registry decision, not
// something this pass should invent unilaterally. Flagged in the session
// report rather than converted here -- including the four entries that
// happen to numerically equal C.orange (three of them) and C.cyan, left
// untouched rather than cherry-picked so the dict stays one decision.
// Called, not frozen: C is mutated after mount (applyTheme, lib/theme.js), so a
// module-level literal keeps the palette it was imported with. See #23.
const TAG_COLORS = () => ({
  '🏆': '#f97316', '🧨': '#f97316', '🔥': '#f97316',
  '🏁': '#22d3ee', '💠': '#38bdf8', '⚾': C.orange, '⭐': '#facc15',
})
function tagColor(tag) {
  for (const [emoji, col] of Object.entries(TAG_COLORS())) {
    if (tag.includes(emoji)) return col
  }
  return C.text2
}

function sf(v, d = 0) { const n = parseFloat(v); return isNaN(n) ? d : n }
function si(v, d = 0) { const n = parseInt(v); return isNaN(n) ? d : n }

function pct(val, total) {
  if (!total) return '—'
  return `${((val / total) * 100).toFixed(1)}%`
}

function barColor(p) {
  return p >= 70 ? C.green : p >= 50 ? C.yellow : C.red
}

// ── Fold, hoisted to module scope (2026-08-18) ──────────────────────
// Used inside the "overview" sub-tab's render (an IIFE that re-runs on every
// Results render). Same bug and same fix as Scoreboard.js's Fold and this
// file's own Row/Group above PitcherWeaknessDigest: a component declared
// INSIDE a render gets a new identity every render, and React unmounts the
// old one — which throws away a native <details>'s open/closed state. A
// panel you opened to check the numbers was closing itself the next time the
// results silently refreshed.
// A demoted panel: closed by default, honest label about what's inside.
const Fold = ({ label, children }) => (
  <details style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11, marginBottom: 8 }}>
    <summary style={{ padding: '8px 13px', fontSize: TYPE.label, fontWeight: 800, cursor: 'pointer', color: C.text2 }}>{label}</summary>
    <div style={{ padding: '4px 10px 10px' }}>{children}</div>
  </details>
)

// ── micro components ────────────────────────────────────────────────────────

// TabBtn: components/results/ResultsParts.js (2026-09-30).

function StatRow({ label, value, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: TYPE.label, color: C.text3 }}>{label}</span>
      <span style={{ fontSize: TYPE.body, fontWeight: 800, color: accent || C.text, fontFamily: NUM_FONT }}>{value}</span>
    </div>
  )
}

function MiniBar({ value, max = 100, color }) {
  const w = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div style={{ height: 4, borderRadius: 3, background: C.border, overflow: 'hidden', flex: 1 }}>
      <div style={{ height: '100%', width: `${w}%`, background: color, borderRadius: 3 }} />
    </div>
  )
}

function SectionHeader({ title, color = C.text3, right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 8,
      fontSize: TYPE.label, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.07em',
      padding: '10px 14px 6px', background: C.bg3, borderBottom: `1px solid ${C.border}`,
    }}>
      <span>{title}</span>
      {right && (
        <span style={{ marginLeft: 'auto', color: C.orange, fontFamily: NUM_FONT, textTransform: 'none', letterSpacing: 0 }}>
          {right}
        </span>
      )}
    </div>
  )
}

// ONE LINE, PLAIN ENGLISH, AT THE TOP OF EVERY SECTION. The rule from the
// 2026-08-09 pass: if a panel can't say in one sentence what question it
// answers, it comes off the page rather than getting a longer caption.
// Every Purpose() on this tab folds now (2026-08-23) — one change, every
// section. See ui.WhatThis for why these stopped printing in full.
function Purpose({ children }) {
  return <WhatThis maxWidth={760}>{children}</WhatThis>
}

// WHERE AN ARCHIVE-WIDE RATE COMES FROM (2026-10-01, queue 0d). Track record,
// Signals, P/L and the Card add up graded_results_<date>.json, which is written
// after the games (season counts include that night's homer; scores and picks
// are a later re-run -- claude/HR-MODEL-FINDINGS-2026-10-01.md §1). ADDENDUM
// §35: every number names its source and date, so these views say theirs and
// print the locked pick record beside it (lib/record/lockedRecord.js, 2026-10-06).
function ArchiveSource() {
  const rec = useLockedRecord()
  return (
    <p style={{ margin: '0 0 10px', fontSize: 12, lineHeight: 1.6, color: C.text3, maxWidth: 760 }}>
      <b style={{ color: C.text2 }}>Source:</b> the post-game graded files, which carry re-run scores and
      season counts that include that night&apos;s homer, so archive-wide rates here read biased. The{' '}
      {lockedPickLine(rec)}.
    </p>
  )
}

// ── Tracking legend + expanded stats ─────────────────────────────────────────
// Surfaces what ⭐ (weak pitcher spot) and 🧩 (aligned signals) actually mean,
// plus a few more of the underlying tracked stats, so the overview isn't
// just emojis with no key to read them by.

function TrackingLegend({ slots }) {
  if (!slots?.length) return null
  const starCount = slots.filter(r => r.weak_spot_flag).length
  const puzzleCount = slots.filter(r => (r.top_board_tags || []).some(t => String(t).includes('🧩'))).length
  const matchCount = slots.filter(r => r.pitch_type_match_flag).length
  const hiddenCount = slots.filter(r => r.hidden_hr_value).length
  const trapCount = slots.filter(r => r.trap_flag).length

  // Flag-type identity (weak spot / aligned signals / pitch match / hidden
  // value / trap) -- its own categorical concept, not CAT.role/pitch/result,
  // so left as literals rather than inventing a CAT key. Two of five already
  // route through the registry: weak-spot borrows C.yellow because that hue
  // is already this file's colour for it, and trap is the one member that IS
  // a real verdict (a trap is the bad/down side), hence verdictInk(false).
  const items = [
    { emoji: '⭐', label: 'Weak pitcher spot', count: starCount, color: C.yellow },
    { emoji: '🧩', label: 'Aligned signals',   count: puzzleCount, color: '#a78bfa' },
    { emoji: '🎯', label: 'Pitch type match',   count: matchCount, color: '#38bdf8' },
    { emoji: '👻', label: 'Hidden HR value',    count: hiddenCount, color: '#71717a' },
    { emoji: '⚠️', label: 'Trap flag',          count: trapCount, color: verdictInk(false).color },
  ].filter(x => x.count > 0)

  if (!items.length) return null

  return (
    <Card style={{ padding: 0, marginBottom: 10, overflow: 'hidden' }}>
      <SectionHeader title="🔑 What's Being Tracked" color={C.text3} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 14px' }}>
        {items.map(({ emoji, label, count, color }) => (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px',
            borderRadius: 8, background: `${color}14`, border: `1px solid ${color}33`,
          }}>
            <span style={{ fontSize: 13 }}>{emoji}</span>
            <span style={{ fontSize: TYPE.label, color: C.text2 }}>{label}</span>
            <span style={{ fontSize: TYPE.body, fontWeight: 800, color, fontFamily: NUM_FONT }}>{count}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

// WHY "Avg HRW" AND "Total 375+" WERE ALWAYS BLANK.
//
// Both read fields that graded_slots does not contain. Verified against the
// live payload: hrw_score is present on 0 of 90 graded slots, and
// recent_375_num on 0 of 90. Both are on 143 of 143 slate rows. So `avg()`
// filtered everything out and printed 0.0, and the 375 reducer summed nothing
// and printed 0 — silently, because a zero looks like a real answer.
//
// recent_350_num IS on graded_slots (90 of 90), which is why nothing else on
// this card ever looked broken.
//
// Same fix as the Pitchers tab: join to the slate by player_id. Anything that
// doesn't match is counted and said out loud rather than quietly averaged away.
function ExpandedStats({ slots, players = [] }) {
  const slateById = useMemo(() => {
    const m = new Map()
    for (const p of players) {
      const id = p?.player_id ?? p?.id
      if (id != null) m.set(String(id), p)
    }
    return m
  }, [players])

  const stats = useMemo(() => {
    if (!slots?.length) return null
    const seen = new Set()
    const unique = slots.filter(r => {
      if (seen.has(r.player_id)) return false
      seen.add(r.player_id)
      return true
    })
    // Slot value first, slate row as the fallback for fields grading drops.
    const merged = unique.map(r => ({ row: r, slate: slateById.get(String(r.player_id)) || null }))
    const matched = merged.filter(m => m.slate).length
    const pick = (m, key) => {
      const a = sf(m.row[key])
      if (a > 0) return a
      return m.slate ? sf(m.slate[key]) : 0
    }
    const avg = (key) => {
      const vals = merged.map(m => pick(m, key)).filter(v => v > 0)
      return vals.length ? { v: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length } : { v: 0, n: 0 }
    }
    const sum = (key) => merged.reduce((s, m) => s + Math.round(pick(m, key)), 0)
    return {
      unique,
      matched,
      avgHrScore: avg('hr_score'),
      avgHrw: avg('hrw_score'),
      total375: sum('recent_375_num'),
      total350: sum('recent_350_num'),
    }
  }, [slots, slateById])

  if (!stats) return null
  const { unique, matched, avgHrScore, avgHrw, total375, total350 } = stats
  const Cell = ({ label, value, sub, tone }) => (
    <div>
      <div style={{ fontSize: TYPE.micro, color: C.text3 }}>{label}</div>
      <span style={{ fontFamily: NUM_FONT, fontWeight: 800, fontSize: TYPE.title, color: tone || C.text }}>{value}</span>
      {sub && <div style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{sub}</div>}
    </div>
  )

  return (
    <Card style={{ padding: 0, marginBottom: 10, overflow: 'hidden' }}>
      <SectionHeader title="📈 Slate Stat Summary" color={C.text3} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: '10px 14px' }}>
        <Cell label="Avg HR Score" value={avgHrScore.v.toFixed(1)} sub={`${avgHrScore.n} players`} />
        <Cell label="Avg HRW" value={avgHrw.n ? avgHrw.v.toFixed(1) : '—'} sub={avgHrw.n ? `${avgHrw.n} players` : 'not graded'} />
        <Cell label="Total 350+ (slate)" value={total350} tone={C.orange} />
        <Cell label="Total 375+ (slate)" value={total375 || '—'} tone={C.orange} />
        <Cell label="Unique players tracked" value={unique.length} />
      </div>
      <div style={{ fontSize: TYPE.body, color: C.text3, padding: '0 14px 10px', lineHeight: 1.5 }}>
        HRW and the 375+ count aren&apos;t written into the graded results, so they&apos;re read off
        tonight&apos;s slate instead — matched {matched} of {unique.length} players by id.
        {matched < unique.length && ' The unmatched ones are graded players who aren’t on the current slate, which happens when results are showing a different day; they’re excluded rather than counted as zero.'}
        {' '}A dash means the field is genuinely absent, not that the value is zero.
      </div>
    </Card>
  )
}


// ── Pitcher weakness digest ───────────────────────────────────────────────────

// WHY THIS WAS ALWAYS EMPTY.
//
// It keyed on `r.pitcher_name`, and graded_slots does not have that field.
// Checked against the live results payload: the string "pitcher_name" appears
// zero times in results_live.json. What graded_slots does carry is
// pitcher_throws, pitcher_fb_rate, pitcher_hr_allowed and pitcher_weak_side —
// the scouting fields, but not the name, the HR/9 or the WHIP this panel wants
// to print. So `name` was null on every row, every row was skipped, the list
// came back empty and `if (!pitchers.length) return null` hid the whole tab.
// Clicking ⚾ Pitchers rendered nothing at all.
//
// The slate rows have all of it. Every hitter in today_slim carries his
// opposing starter stamped on him, so joining graded_slots to the slate by
// player_id recovers the name, HR/9 and WHIP. Anything still unmatched — a
// graded player who isn't on tonight's slate, which happens after a lineup
// change — falls back to the fields that are on the slot, and is labelled
// rather than dropped silently the way it was before.
// Row and Group used to be declared INSIDE PitcherWeaknessDigest — fixed
// 2026-08-18 alongside Scoreboard.js's Fold (see its long comment for the
// full diagnosis). Group's collapsed lists use a native <details>, which is
// uncontrolled DOM state: a fresh function identity for Group on every
// PitcherWeaknessDigest render silently unmounted and remounted it, so an
// arm list you had expanded snapped back shut on the next poll tick. Hoisted
// to module scope so their identity is stable across renders; both take
// everything they need as props (plus si(), already module-level below).
const Row = ({ p, accent }) => {
  const hitPicks = p.picks.filter((r) => si(r.actual_hr) > 0).length
  return (
    <div style={{ padding: '7px 14px', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: TYPE.name, fontWeight: 800, color: C.text }}>{p.name}</span>
          <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{p.throws}HP</span>
          {p.weak_side && <span style={{ fontSize: TYPE.micro, color: C.purple, fontFamily: NUM_FONT }}>bleeds vs {p.weak_side}</span>}
        </div>
        <div style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT, marginTop: 1 }}>
          our picks vs him: <b style={{ color: hitPicks ? accent : C.text3 }}>{hitPicks}/{p.picks.length} homered</b>
          {p.hr9 > 0 && <> · HR/9 <span style={{ color: hr9Color(p.hr9, C.text2) }}>{p.hr9.toFixed(2)}</span></>}
          {p.whip > 0 && <> · WHIP <span style={{ color: p.whip >= 1.30 ? verdictInk(true).color : C.text2 }}>{p.whip.toFixed(2)}</span></>}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: TYPE.title, fontWeight: 900, fontFamily: NUM_FONT, color: p.hr_allowed_today > 0 ? accent : C.text3 }}>
          {p.hr_allowed_today} HR
        </div>
        <div style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>
          {p.hit_allowed_today} H · <span title="Strikeouts he hung on OUR graded hitters — partial by construction, but a K-heavy line here marks a strikeout-prop arm" style={{ color: p.k_today >= 6 ? verdictInk(false).color : C.text3, cursor: 'default' }}>{p.k_today} K</span>
        </div>
      </div>
    </div>
  )
}

const Group = ({ icon, label, note, list, accent, collapsed }) => {
  if (!list.length) return null
  const body = list.map((p, i) => <Row key={i} p={p} accent={accent} />)
  return (
    <div style={{ borderLeft: `3px solid ${accent}`, margin: '8px 10px', borderRadius: 8, background: `${accent}06`, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, padding: '7px 14px 5px' }}>
        <span style={{ fontSize: 11 }}>{icon}</span>
        <span style={{ fontSize: TYPE.label, fontWeight: 900, color: accent, letterSpacing: '.08em', fontFamily: NUM_FONT }}>{label}</span>
        <span style={{ fontSize: TYPE.micro, color: C.text3 }}>{note}</span>
      </div>
      {collapsed ? (
        <details>
          <summary style={{ fontSize: TYPE.micro, color: C.text3, padding: '0 14px 8px', cursor: 'pointer', fontFamily: NUM_FONT }}>
            {list.length} arm{list.length > 1 ? 's' : ''} — expand
          </summary>
          {body}
        </details>
      ) : body}
    </div>
  )
}

function PitcherWeaknessDigest({ slots, players = [] }) {
  const slateById = useMemo(() => {
    const m = new Map()
    for (const p of players) {
      const id = p?.player_id ?? p?.id
      if (id != null) m.set(String(id), p)
    }
    return m
  }, [players])

  const pitchers = useMemo(() => {
    if (!slots?.length) return []
    const map = {}
    let unmatched = 0
    for (const r of slots) {
      const slate = slateById.get(String(r.player_id))
      const name = r.pitcher_name || r.opposing_pitcher || slate?.pitcher_name || null
      if (!name) { unmatched += 1; continue }
      if (!map[name]) {
        map[name] = {
          name,
          throws: r.pitcher_throws || slate?.pitcher_throws || '?',
          hr9: sf(r.pitcher_hr9 ?? slate?.pitcher_hr9 ?? r.pitcher_hr_per9 ?? r.pitcher_hr_allowed),
          whip: sf(r.pitcher_whip ?? slate?.pitcher_whip),
          fb_rate: sf(r.pitcher_fb_rate ?? slate?.pitcher_fb_rate),
          weak_side: r.pitcher_weak_side || slate?.pitcher_weak_side || '',
          era: sf(slate?.pitcher_era),
          picks: [],
          hr_allowed_today: 0,
          hit_allowed_today: 0,
          k_today: 0,
        }
      }
      map[name].picks.push(r)
      if (si(r.actual_hr) > 0) map[name].hr_allowed_today += si(r.actual_hr)
      if (si(r.actual_hits) > 0) map[name].hit_allowed_today += si(r.actual_hits)
      // actual_k rides every graded slot (tracker line 1335) — the K's he
      // hung on OUR hitters. Partial by construction (only picks counted),
      // the label says so.
      if (si(r.actual_k) > 0) map[name].k_today += si(r.actual_k)
    }
    const out = Object.values(map)
      .filter(p => p.picks.length > 0)
      .sort((a, b) => b.hr_allowed_today - a.hr_allowed_today || b.picks.length - a.picks.length)
    out._unmatched = unmatched
    return out
  }, [slots, slateById])

  if (!pitchers.length) {
    return (
      <Card style={{ padding: '12px 14px', marginBottom: 10 }}>
        <div style={{ fontSize: TYPE.body, color: C.text3, lineHeight: 1.6 }}>
          No starter could be matched to tonight&apos;s graded picks. The results payload doesn&apos;t
          carry pitcher names, so this panel joins each graded slot to the slate by player_id — which
          means it needs the slate loaded. If the Games board has data and this is still empty, the
          graded players aren&apos;t on the current slate, which happens when results are showing a
          previous day.
        </div>
      </Card>
    )
  }

  // VERDICT QUADRANTS (2026-08-08, "more intuitive"): the page's question
  // is not "list the pitchers" — it's "did the arms we targeted give it up,
  // and did any arm burn us unflagged". Four buckets, in the order a bettor
  // cares: called it, missed arm, flag didn't cash, quiet-as-expected
  // (collapsed — no-news is the biggest and least interesting group).
  const buckets = { called: [], missedArm: [], noCash: [], quiet: [] }
  pitchers.forEach((p) => {
    const targeted = !!(p.weak_side || (p.hr9 >= 1.2) || (p.whip >= 1.30))
    const gave = p.hr_allowed_today > 0
    p._targeted = targeted
    if (targeted && gave) buckets.called.push(p)
    else if (!targeted && gave) buckets.missedArm.push(p)
    else if (targeted && !gave) buckets.noCash.push(p)
    else buckets.quiet.push(p)
  })
  const flaggedN = buckets.called.length + buckets.noCash.length
  const unflaggedHr = buckets.missedArm.reduce((a, p) => a + p.hr_allowed_today, 0)

  // Row and Group now live at module scope, above this function — see the
  // comment there for why (native <details> state was getting wiped by a
  // fresh component identity on every poll-driven re-render).

  return (
    <Card style={{ padding: 0, marginBottom: 10, overflow: 'hidden' }}>
      {/* This card's sky-blue section accent is not a data value and has no
          exact C token match, so it's left literal rather than guessing
          the nearest hue. */}
      <SectionHeader title="⚾ Pitcher Results — Model vs Actual" color="#38bdf8" />
      {/* the verdict, before the list */}
      <div style={{ padding: '8px 14px 2px', fontSize: TYPE.body, color: C.text2, fontFamily: NUM_FONT, lineHeight: 1.6 }}>
        flagged <b style={{ color: C.text }}>{flaggedN}</b> weak arm{flaggedN !== 1 ? 's' : ''} ·{' '}
        <b style={{ color: verdictInk(true).color }}>{buckets.called.length}</b> gave it up
        {flaggedN > 0 && <> ({((100 * buckets.called.length) / flaggedN).toFixed(0)}%)</>}
        {unflaggedHr > 0 && <> · <b style={{ color: verdictInk(false).color }}>{unflaggedHr} HR</b> came off arms it didn&apos;t flag</>}
      </div>
      {/* This is a 4-state grid (flagged x gave-it-up), not a binary -- CALLED
          IT and BURNED US are the true up/down pair so they already route
          through verdictInk. FLAG DIDN'T CASH and QUIET are the other two
          cells and don't have a warm/cool side to take: the gold below is
          the site's established gold accent with no matching C token (the
          same exception the Pairs.js pass documented for its own dozen-odd
          uses of that same gold) and the dim grey is a one-off neutral for
          "no news". Neither is a CAT concept or a verdict-pair member, so
          both stay literal. */}
      <Group icon="🎯" label="CALLED IT" note="flagged weak, and he gave it up" list={buckets.called} accent={verdictInk(true).color} />
      <Group icon="💥" label="BURNED US UNFLAGGED" note="the model didn't flag him — he homered anyway" list={buckets.missedArm} accent={verdictInk(false).color} />
      <Group icon="🧱" label="FLAG DIDN'T CASH" note="targeted as weak, held anyway" list={buckets.noCash} accent="#FCD34D" />
      <Group icon="😴" label="QUIET, AS EXPECTED" note="unflagged, no damage — the biggest group and the least news" list={buckets.quiet} accent="#3f3f46" collapsed />
      <div style={{ height: 8 }} />
    </Card>
  )
}


// ── Pairs performance ─────────────────────────────────────────────────────────

function PairsResults({ pairPoolResults }) {
  const pick = usePick()
  const pairs = pairPoolResults?.all_pairs || []
  const pools = pairPoolResults?.graded_pools || []
  if (!pairs.length && !pools.length) return null

  const clearedPairs = pairs.filter(p => p.cleared)
  // ⚠️ REGRESSION CAUGHT IN THE REPO SCAN (2026-08-09). The bot retired the
  // 6-man pool today and publishes two 3-mans in its place. This filter only
  // knew about 4-MAN and 6-MAN, so from tonight onwards the Results tab would
  // have rendered an EMPTY "6-MAN POOLS" heading and dropped every 3-man pool
  // on the floor — no error, no warning, just a section of the results page
  // quietly missing half its content.
  //
  // Worth naming the class: a label-matching filter is a contract between two
  // repos, and nothing enforces it. Both spellings are matched now, and the
  // heading is derived from what actually came back rather than hard-coded.
  const pool4 = pools.filter(p => (p.label || '').startsWith('4-MAN'))
  const poolSmall = pools.filter(p => (p.label || '').startsWith('3-MAN'))
  const pool6 = pools.filter(p => (p.label || '').startsWith('6-MAN'))
  // Anything the bot starts publishing under a label nobody anticipated still
  // renders, rather than vanishing.
  const poolOther = pools.filter(p => !/^(3|4|6)-MAN/.test(p.label || ''))

  return (
    <Card style={{ padding: 0, marginBottom: 10, overflow: 'hidden' }}>
      <SectionHeader title="🔗 Pairs & Pools Performance" color={C.purple} />

      {/* pair summary */}
      <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: TYPE.label, color: C.text3, marginBottom: 6 }}>PAIRS ({pairs.length} total · {clearedPairs.length} cleared)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {pairs.map((pair, i) => {
            const aHR = si(pair.a_hr) > 0
            const bHR = si(pair.b_hr) > 0
            const cleared = pair.cleared === 1
            const col = cleared ? C.green : (aHR || bHR) ? C.yellow : C.border
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 8,
                background: cleared ? `${C.green}0d` : 'transparent',
                border: `1px solid ${col}44`,
              }}>
                <span style={{ fontSize: 11, color: col, fontWeight: 800, minWidth: 14 }}>{cleared ? '✅' : (aHR || bHR) ? '½' : '·'}</span>
                <Tap onClick={pick && pair.a && (() => pick(pair.a))}><span style={{ fontSize: TYPE.name, color: aHR ? C.green : C.text2, fontWeight: aHR ? 700 : 400 }}>{pair.a?.name}</span></Tap>
                <span style={{ fontSize: TYPE.micro, color: C.text3 }}>+</span>
                <Tap onClick={pick && pair.b && (() => pick(pair.b))}><span style={{ fontSize: TYPE.name, color: bHR ? C.green : C.text2, fontWeight: bHR ? 700 : 400 }}>{pair.b?.name}</span></Tap>
                <span style={{ fontSize: TYPE.micro, color: C.text3, marginLeft: 'auto', fontFamily: NUM_FONT }}>{si(pair.hr_count)}/{si(pair.total_count)} HR</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* pool summary */}
      {[
        { label: '3-MAN POOLS', list: poolSmall },
        { label: '4-MAN POOLS', list: pool4 },
        { label: '6-MAN POOLS (retired)', list: pool6 },
        { label: 'OTHER POOLS', list: poolOther },
      ].map(({ label, list }) => (
        list.length > 0 && (
          <div key={label} style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: TYPE.label, color: C.text3, marginBottom: 6 }}>{label}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {list.map((pool, i) => {
                // Colour and bar run to the published 2+ primary grade. The
                // complete hit count remains visible for the 2/3/4 ladder.
                const size = Math.max(1, si(pool.total_count))
                const bar = si(pool.bar) || Math.min(2, size)
                const hits = si(pool.hr_count)
                const hitRatio = hits / bar
                const col = hits >= bar ? C.green : hits > 0 ? C.yellow : C.text3
                const letter = (pool.label || '').replace(/^[346]-MAN HR POOL /, '')
                const homered = new Set((pool.homer_names || []).map((x) => String(x || '').toLowerCase()))
                const members = Array.isArray(pool.players) ? pool.players : []
                return (
                  <div key={i} style={{
                    padding: '6px 8px', borderRadius: 8,
                    border: `1px solid ${col}33`,
                    background: hitRatio > 0 ? `${col}0d` : 'transparent',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: TYPE.micro, fontWeight: 800, color: col, minWidth: 14 }}>{letter}</span>
                      <MiniBar value={Math.min(100, hitRatio * 100)} color={col} />
                      <span style={{ fontSize: TYPE.micro, fontFamily: NUM_FONT, color: col, minWidth: 44 }}>
                        {hits}/{size} HR · need {bar}
                      </span>
                    </div>
                    {/* Who is actually in the pool. Without this a pool is just
                        a letter and a bar, and you can't tell whether it missed
                        because the picks were bad or because they sat. */}
                    {members.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4, paddingLeft: 22 }}>
                        {members.map((m, j) => {
                          const hit = homered.has(String(m?.name || '').toLowerCase())
                          return (
                            <span key={j} style={{
                              fontSize: TYPE.name,
                              color: hit ? C.green : C.text2,
                              fontWeight: hit ? 700 : 400,
                            }}>
                              <Tap onClick={pick && m && (() => pick(m))}>
                                {hit ? '💥 ' : ''}{m?.name}
                                <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}> {m?.team}</span>
                              </Tap>
                              {j < members.length - 1 && <span style={{ color: C.text3 }}> ·</span>}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      ))}
    </Card>
  )
}


function HRTierRecord({ report }) {
  const order = ['hr_overlay', 'power_overlay', 'premium_power']
  const colors = { hr_overlay: '#4ade80', power_overlay: '#FCD34D', premium_power: '#f97316' }
  const pct = (value) => Number.isFinite(Number(value)) ? `${(Number(value) * 100).toFixed(1)}%` : 'collecting'
  const record = (stats) => stats?.n ? `${stats.hrs}/${stats.n} · ${pct(stats.hr_rate)}` : '0 tracked · collecting'
  const tiers = report?.tiers || {}
  const hasSchema = Number(report?.eligible_schema_n || 0) > 0

  return (
    <div style={{ marginTop: 18, paddingTop: 18, borderTop: `1px solid ${C.border}` }}>
      <Purpose>the permanent HR overlay record — membership frozen before first pitch, then graded after the game.</Purpose>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 8 }}>
        {order.map((key) => {
          const tier = tiers[key] || {}
          const full = tier.all || {}
          const seven = tier.rolling?.['7'] || {}
          const thirty = tier.rolling?.['30'] || {}
          const reference = report?.reference?.[key]
          return (
            <Card key={key} style={{ borderTop: `3px solid ${colors[key]}`, padding: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <b style={{ color: C.text, fontSize: TYPE.name }}>{tier.label || key.replaceAll('_', ' ')}</b>
                <span style={{ color: colors[key], fontSize: TYPE.label, fontWeight: 900, textTransform: 'uppercase' }}>
                  {full.n >= 200 ? 'measured' : 'tracking'}
                </span>
              </div>
              <div style={{ color: C.text3, fontSize: TYPE.body, lineHeight: 1.5, minHeight: 30, marginTop: 4 }}>{tier.rule || 'Waiting for the first locked row.'}</div>
              <div style={{ color: colors[key], fontFamily: NUM_FONT, fontSize: TYPE.title, fontWeight: 900, marginTop: 8 }}>{record(full)}</div>
              <div style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: TYPE.micro, marginTop: 5 }}>L7 {record(seven)} · L30 {record(thirty)}</div>
              {reference && (
                <div style={{ color: C.text2, fontSize: TYPE.body, lineHeight: 1.5, marginTop: 8 }}>
                  Audit reference: {(reference.hr_rate * 100).toFixed(1)}% over {reference.n} hitter-games; shown separately from the live locked record.
                </div>
              )}
            </Card>
          )
        })}
      </div>
      {!hasSchema && (
        <div style={{ color: C.text3, fontSize: TYPE.body, lineHeight: 1.6, marginTop: 7 }}>
          Clean tracking for these power tiers begins with the first official run using hr_overlay_v2. Earlier nights are not recreated from later data.
        </div>
      )}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

// The page's name is the registry's (MLB_NAV.results = "The record") -- the
// nav, the drawer and the front door all call it that, and the heading said
// "Results" (stranger test F14: one page, two names).
const RECORD_NAME = tabName('mlb', 'results')

export default function Results({ results, liveResults = null, slateDate = '', backtest, evalReport = null, players = [], onPlayerClick }) {
  // every HR call this season, its lock price and result (2026-10-04, user review build 2)
  const callHistory = <CallHistory sport="mlb" Table={DenseTable} onOpenPlayer={(id) => { const p = (players || []).find((x) => String(x.player_id) === String(id)); if (p) onPlayerClick?.(p) }} title="Every home-run call, its price, its result" />
  // each tier's calls, hits and rate with its lock time (2026-10-06, lib/calibration)
  // THE LOCKED TABLE LEADS (2026-10-06, ledger audit P0-2): it is passed as `locked` so RecordPage
  // draws it above the post-game archive's BY MARKET table; the call list stays below.
  const lockedTiers = <CalibrationTable sport="mlb" Table={DenseTable} />
  // THREE QUESTIONS, NOT SEVEN PILLS. `mode` is the question; each mode keeps
  // its own last-opened view, so switching to All season and back does not
  // dump you out of the sub-view you were reading. The seven keys are
  // unchanged — 'overview', 'pitcher', 'pairs' under night; 'card', 'record',
  // 'signals', 'pl' under season — so nothing that referenced them by name
  // had to move.
  const [mode, setMode] = useState('night')
  // OPENS ON OVERVIEW (2026-08-09, owner: "open up results at Overview").
  // It used to open on the season Report card, which meant the first thing you
  // saw after a slate was a season average rather than last night. Overview is
  // last night; the card is one click away and hasn't moved.
  const [nightTab, setNightTab] = useState('overview')
  const [seasonTab, setSeasonTab] = useState('card')
  const subTab = mode === 'night' ? nightTab : seasonTab
  const setSubTab = mode === 'night' ? setNightTab : setSeasonTab
  const [archiveOpen, setArchiveOpen] = useState(false)

  // THE ARCHIVE BROWSER (was: the day picker).
  //
  // live_results_tracker writes graded_results_<date>.json every night and
  // publish_data.sh keeps the last 150 on the branch. The date list comes from
  // backtest_summary.per_day rather than by probing for files, so it only ever
  // offers days that actually graded.
  //
  // It used to render as a flat row of date pills sitting in a stack of other
  // pill rows, so it read as one more filter and the default day was easy to
  // lose track of. Now the default view is stated ("Tonight — live"), and the
  // history is behind one "past nights" button that opens a dated list. When
  // you're in the archive the page wears a bar saying so with one click back.
  const [day, setDay] = useState('live')
  const [dayData, setDayData] = useState(null)
  const [dayState, setDayState] = useState('idle')
  // the night on screen, labelled the way /called labels it (one definition)
  const feedNight = useMlbStatusNight((day === 'live' ? results : dayData)?.date || null)

  const gradedDays = useMemo(() => {
    const per = backtest?.per_day
    const dates = Array.isArray(per) ? per.map((d) => d?.date) : Object.keys(per || {})
    return dates.filter(Boolean).sort().reverse()
  }, [backtest])

  // 🌙 PREGAME MORNINGS (2026-08-15, Donovan: "why hasn't the results
  // updated"). It HAD updated — the live file had rolled over to tonight's
  // pregame shell (90 tracked slots, all AB 0, nothing started), and last
  // night's finished grading sat behind the date picker. Correct data, wrong
  // default: a results page whose lead view is ninety pending rows reads as
  // broken every single morning. So when the live payload has nothing judged
  // yet, the tab says so in one line and points at last night, instead of
  // presenting the empty shell as the news.
  // ── "TONIGHT" MUST BE TONIGHT (2026-08-23) ────────────────────────────────
  //
  // `results` is now the slate-GATED payload (see Dashboard): tonight's own
  // file when the branch has one, null when it doesn't. `liveResults` is the
  // raw results_live.json, passed in only so this tab can name the date the
  // branch is actually serving.
  //
  // The failure this exists for: results_live.json froze on 2026-08-21 and was
  // still being served on the 23rd while graded_results_2026-08-23.json sat
  // beside it. Every other surface date-gated and went quiet; this tab, which
  // was handed the ungated file, rendered a completed two-day-old card under
  // "🌙 Tonight — live". A results page is the one page on the site that has
  // to be right about which night it is describing — being empty is survivable,
  // being confidently wrong is not.
  const liveFileDate = clean(liveResults?.date, '')
  const liveFileStale = !!slateDate && !!liveFileDate && liveFileDate !== slateDate
  const liveMissing = day === 'live' && !results
  // "● LIVE · Tonight · updates as games finish" showed at 3 AM for a slate
  // the league had long called final (stranger test F5): the live FILE is
  // not the live GAME. The league's feed (lib/mlbSlateState.js) says whether
  // that slate is still being played.
  const [liveOver, setLiveOver] = useState(false)
  useEffect(() => {
    if (day !== 'live' || !liveFileDate) { setLiveOver(false); return undefined }
    let alive = true
    mlbSlateState(liveFileDate).then((st) => { if (alive && st) setLiveOver(st.over) })
    return () => { alive = false }
  }, [day, liveFileDate])

  const liveIsPregame = (() => {
    if (day !== 'live') return false
    const rows = results?.graded_slots || results?.results || []
    if (!rows.length) return false
    return !rows.some((r) => Number(r?.actual_ab) > 0 || Number(r?.is_final) === 1)
  })()


  useEffect(() => {
    if (day === 'live') { setDayData(null); setDayState('idle'); return }
    let alive = true
    setDayState('loading'); setDayData(null)
    fetch(gradedResultsUrl(day))
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (alive) { setDayData(j); setDayState(j ? 'done' : 'missing') } })
      .catch(() => { if (alive) setDayState('error') })
    return () => { alive = false }
  }, [day])

  // Everything below reads `view`, so the whole tab follows the picker.
  const view = day === 'live' ? results : dayData

  const slots = useMemo(() => {
    if (!view) return []
    if (Array.isArray(view.graded_slots)) return view.graded_slots
    if (Array.isArray(view)) return view
    if (Array.isArray(view.results)) return view.results
    return []
  }, [view])

  const homers = useMemo(() => Array.isArray(view?.merged_homers) ? view.merged_homers : [], [view])
  const pairPoolResults = view?.pair_pool_results || null
  const date = String(view?.label || view?.date || 'Today')

  // ONE ROW PER PLAYER (lib/graded.js). `slots` stays raw for everything whose
  // subject is a PICK — the scorecard, the per-lane bars, the category tables,
  // where a hitter designated twice genuinely is two picks. `uniqSlots` is for
  // everything whose subject is a PLAYER: how many hitters got a base hit, how
  // many wore the ⭐, how many are still live. Those were counting the
  // multi-category picks twice, which quietly inflated exactly the hitters the
  // bot likes most.
  const uniqSlots = useMemo(() => dedupeGraded(slots), [slots])

  const prettyDay = (d) => {
    try {
      return new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    } catch { return d }
  }

  const archiveIndex = day === 'live' ? -1 : gradedDays.indexOf(day)
  const newerDay = archiveIndex > 0 ? gradedDays[archiveIndex - 1] : null
  const olderDay = archiveIndex >= 0 && archiveIndex < gradedDays.length - 1
    ? gradedDays[archiveIndex + 1]
    : null

  // Rendered as an element, not a nested component, so the open/closed state
  // above survives every re-render of the page.
  const archiveBar = (
    <div style={{ marginBottom: 12 }}>
      {day === 'live' ? (
        <div className="results-night-bar" style={{
          display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
          background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11, padding: '9px 11px',
        }}>
          <span style={{ fontSize: TYPE.label, color: liveOver ? C.text3 : C.green, fontWeight: 900, letterSpacing: '.09em', fontFamily: NUM_FONT }}>{liveOver ? '● FINAL' : '● LIVE'}</span>
          <span style={{ fontSize: TYPE.name, fontWeight: 900, color: C.text }}>{liveOver && liveFileDate < etToday() ? 'Last night' : 'Tonight'}</span>
          <span style={{ fontSize: TYPE.micro, color: C.text3 }}>
            {liveMissing ? 'waiting for grading' : liveOver ? 'games over · final grades post in the morning' : 'updates as games finish'}
          </span>
          {(liveMissing || liveFileStale) && (
            <div style={{
              order: 4, flex: '1 1 100%', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              fontSize: TYPE.body, color: C.text2, lineHeight: 1.5,
              border: '1px solid rgba(248,113,113,.45)', background: 'rgba(248,113,113,.08)',
              borderRadius: 8, padding: '7px 9px',
            }}>
              <span>{liveMissing ? `No grading has published for ${slateDate || 'tonight'} yet.` : `The live file is still dated ${liveFileDate || 'an earlier night'}.`}</span>
              {gradedDays.length > 0 && (
                <button type="button" onClick={() => setDay(gradedDays[0])} style={{
                  marginLeft: 'auto', padding: '5px 9px', borderRadius: 7, cursor: 'pointer',
                  border: `1px solid ${C.orange}66`, background: `${C.orange}14`, color: C.orange,
                  fontSize: TYPE.label, fontWeight: 800,
                }}>Open latest final</button>
              )}
            </div>
          )}
          {liveIsPregame && gradedDays.length > 0 && (
            <div style={{
              order: 4, flex: '1 1 100%', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              fontSize: TYPE.body, color: C.text2, lineHeight: 1.5,
              border: `1px solid ${C.border}`, background: 'rgba(255,255,255,.03)',
              borderRadius: 8, padding: '7px 9px',
            }}>
              <span>All {(results?.graded_slots || results?.results || []).length} tracked picks are still pregame.</span>
              <button type="button" onClick={() => setDay(gradedDays[0])} style={{
                marginLeft: 'auto', padding: '5px 9px', borderRadius: 7, cursor: 'pointer',
                border: `1px solid ${C.orange}66`, background: `${C.orange}14`, color: C.orange,
                fontSize: TYPE.label, fontWeight: 800,
              }}>View latest final</button>
            </div>
          )}
          {gradedDays.length > 0 && (
            <button
              type="button"
              onClick={() => setArchiveOpen((v) => !v)}
              aria-expanded={archiveOpen}
              aria-controls="results-archive-nights"
              style={{
                marginLeft: 'auto', padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
                fontSize: TYPE.label, fontWeight: 800, fontFamily: NUM_FONT,
                border: `1px solid ${archiveOpen ? C.orange : C.border}`,
                background: archiveOpen ? `${C.orange}18` : 'transparent',
                color: archiveOpen ? C.orange : C.text2,
              }}
            >📅 {archiveOpen ? 'Close archive' : `Past nights · ${gradedDays.length}`}</button>
          )}
        </div>
      ) : (
        <div style={{
          display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap',
          background: `${C.orange}14`, border: `1px solid ${C.orange}55`,
          borderRadius: 11, padding: '9px 13px',
        }}>
          <span style={{ fontSize: TYPE.label, color: C.orange, fontWeight: 900, letterSpacing: '.1em', fontFamily: NUM_FONT }}>
            📅 ARCHIVE
          </span>
          <span style={{ fontSize: TYPE.name, fontWeight: 900, color: C.text }}>{prettyDay(day)}</span>
          <span style={{ fontSize: TYPE.micro, color: C.text3 }}>graded · final</span>
          {newerDay && <button type="button" onClick={() => setDay(newerDay)} style={{
            marginLeft: 'auto', padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
            fontSize: TYPE.label, fontWeight: 800, fontFamily: NUM_FONT,
            border: `1px solid ${C.border}`, background: C.bg3, color: C.text2,
          }}>← Newer</button>}
          {olderDay && <button type="button" onClick={() => setDay(olderDay)} style={{
            padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
            fontSize: TYPE.label, fontWeight: 800, fontFamily: NUM_FONT,
            border: `1px solid ${C.border}`, background: C.bg3, color: C.text2,
          }}>Older →</button>}
          <button
            type="button"
            onClick={() => { setDay('live'); setArchiveOpen(false) }}
            style={{
              marginLeft: newerDay ? 0 : 'auto', padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
              fontSize: TYPE.label, fontWeight: 800, fontFamily: NUM_FONT,
              border: `1px solid ${C.orange}`, background: `${C.orange}22`, color: C.orange,
            }}
          >Tonight</button>
          <button
            type="button"
            onClick={() => setArchiveOpen((v) => !v)}
            aria-expanded={archiveOpen}
            aria-controls="results-archive-nights"
            style={{
              padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
              fontSize: TYPE.label, fontWeight: 800, fontFamily: NUM_FONT,
              border: `1px solid ${C.border}`, background: 'transparent', color: C.text2,
            }}
          >📅 All nights</button>
        </div>
      )}

      {archiveOpen && gradedDays.length > 0 && (
        <div id="results-archive-nights" style={{
          marginTop: 8, background: C.bg2, border: `1px solid ${C.border}`,
          borderRadius: 11, padding: '10px 13px',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: TYPE.name, fontWeight: 900 }}>Past nights</span>
            <span style={{ fontSize: TYPE.micro, color: C.text3 }}>Selecting a date changes Results only.</span>
            <span style={{ marginLeft: 'auto', fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{gradedDays.length} final</span>
          </div>
          <div className="archive-night-grid">
            {gradedDays.map((d) => (
              <button
                type="button"
                key={d}
                onClick={() => { setDay(d); setArchiveOpen(false) }}
                aria-current={day === d ? 'date' : undefined}
                style={{
                  padding: '5px 11px', borderRadius: 8, cursor: 'pointer',
                  fontSize: TYPE.label, fontWeight: 700, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
                  border: `1px solid ${day === d ? C.orange : C.border}`,
                  background: day === d ? `${C.orange}18` : C.bg3,
                  color: day === d ? C.orange : C.text2,
                }}
              >{prettyDay(d)}</button>
            ))}
          </div>
        </div>
      )}

      {dayState === 'loading' && (
        <div style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT, marginTop: 6 }}>loading that night…</div>
      )}
    </div>
  )

  // 🏷 TRUE PRICE MOVED OUT (2026-08-16, tab consolidation). It lived here as
  // a third mode for one round, and it was the wrong home: True Price answers
  // "what does the book charge", which is the Odds tab's question, not "was
  // the bot right", which is this tab's. One question, one home — it is now a
  // view inside OddsBoard, next to the live board it exists to sanity-check,
  // and the component itself is untouched. Nothing else about the mode came
  // out; its slot went to Leaders below.
  //
  // Leaders and Score bands were modes here; they are their own tabs now
  // (BATCH-RECORD-PAGE: they aren't the record).
  // SCOPED TO THIS NIGHT (2026-08-16). This used to return for the whole tab,
  // which meant a pregame morning — nothing graded yet — took the season
  // report card, the signal audit and the P/L simulator down with it, none of
  // which read tonight's file at all.
  // the live FILE is not the live GAME: on the live day the league's feed
  // (liveOver above) says whether the slate is over -- the archiveBar's own rule
  const recordModel = mlbRecordModel({ night: view, feed: feedNight, backtest, live: day === 'live' ? !liveOver : null, onOpen: onPlayerClick ? (raw) => onPlayerClick(raw) : null })
  const emptyNight = mode === 'night' && !slots.length && !homers.length
  if (emptyNight) recordModel.last = null
  const receiptsHead = (
    <>
      <ModeBar mode={mode} setMode={setMode} />
      {mode === 'night' && archiveBar}
    </>
  )

  if (emptyNight) {
    return (
      <div>
        <PanelTitle title={RECORD_NAME} sub="Nightly grading" />
        <RecordPage record={recordModel} Table={DenseTable} locked={lockedTiers} calls={callHistory} receiptsLabel="every night, every pick" receipts={(
          <>
            {receiptsHead}
            <Empty text={
              dayState === 'loading' ? 'Loading that day…'
                : day !== 'live' ? `No graded file published for ${day}.`
                : 'No graded results yet tonight — games haven’t started or nothing has been graded.'
            } />
          </>
        )} />
      </div>
    )
  }

  return (
    <PickCtx.Provider value={onPlayerClick || null}><div>
      <PanelTitle
        title={RECORD_NAME}
        sub={`${gradedDays.length} graded nights in the archive`}
      />
      <RecordPage record={recordModel} Table={DenseTable} locked={lockedTiers} calls={callHistory} receiptsLabel="every night, every pick, the season's audits" receipts={(<>
      {receiptsHead}

      {/* ── #34: THE MONEY ANSWER, ON THE PAGE THAT ASKS THE QUESTION ──────
          "All season" is labelled "is the model any good" in the mode bar, and
          until now the one measurement that answers it in money lived behind a
          mode pill on the Odds tab, which is itself in the drawer. The finding
          was never about the True Price page — that page is the most honest
          thing on the site — it was about a product leading with "every pick
          graded in public" while keeping the money answer three clicks away.
          It is the first thing under the question now, and it links through
          rather than duplicating the table. */}
      {mode === 'season' && (
        <div style={{ marginBottom: 11 }}><MoneyAnswer /></div>
      )}

      {/* ONE ROW OF VIEWS, scoped to the question above it. */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {(mode === 'night'
          ? [['overview', '📊 Overview'], ['pitcher', '⚾ Pitchers'], ['pairs', '🔗 Pairs & Pools']]
          : [['card', '🧾 Report card'], ['record', '👤 Track record'], ['signals', '🔬 Signals'], ['pl', '🌙 P/L']]
        ).map(([k, label]) => (
          <TabBtn key={k} active={subTab === k} onClick={() => setSubTab(k)}>{label}</TabBtn>
        ))}
      </div>

      {/* One plain-English line for whatever is selected. */}
      <WhatThis maxWidth={760}>
        {{
          overview: 'how the night went — did the picks do the jobs they were picked for, who delivered, and what got away.',
          pitcher: 'did the arms we called weak actually give it up — and which arm burned us without a flag.',
          pairs: 'how the bot’s pairs and pools graded out.',
          card: 'is the model any good, all season — letter grades, records and trust curves. Always the last complete night; the night picker in This night does not move it.',
          record: 'which players the bot has been right about over every graded day. Spans the whole archive.',
          signals: 'is each badge on this site worth anything — every flag graded against the archive.',
          pl: 'what the archive would have returned at flat stakes, in moons (1 moon = 1 unit, never dollars).',
        }[subTab]}
      </WhatThis>

      {/* OVERVIEW — takeaways first (2026-08-08, "less charts, more things
          to understand and take from"). The page now leads with computed
          SENTENCES — what tonight actually said, in words a bettor can act
          on — and demotes the heavier panels behind honest toggles. The
          numbered flow stays, but every number opens with its sentence. */}
      {/* THE NIGHT'S RECEIPTS (BATCH-RECORD-PAGE, 2026-10-02). The record
          itself -- the night's lanes, the homers caught, called it / what got
          away -- is RecordPage above; the sentences, lane chips and lists that
          restated it are gone. What stays is the audit, folded. */}
      {subTab === 'overview' && (
        <>
          <Fold label="🧾 Every pick against its own job">
            <PickScorecard slots={slots} backtest={backtest} onPlayerClick={onPlayerClick} />
          </Fold>
          <Fold label="🔬 Flags, slate summary and score audit">
            <TrackingLegend slots={uniqSlots} />
            <ExpandedStats slots={uniqSlots} players={players} />
            <ScoreAudit slots={uniqSlots} players={players} />
          </Fold>
          <Fold label="📋 The full grading tables">
            <ResultsDepth results={view} onPlayerClick={onPlayerClick} />
          </Fold>
        </>
      )}

      {/* PITCHERS */}
      {subTab === 'pitcher' && (
        <PitcherWeaknessDigest slots={uniqSlots} players={players} />
      )}

      {/* PAIRS & POOLS */}
      {subTab === 'pairs' && (
        pairPoolResults
          ? <PairsResults pairPoolResults={pairPoolResults} />
          : <Empty text="No pairs or pools were graded for this night." />
      )}

      {/* PER-PLAYER TRACK RECORD — spans every graded day, so it ignores the
          day picker above on purpose. */}
      {(subTab === 'record' || subTab === 'signals' || subTab === 'pl' || subTab === 'card') && <ArchiveSource />}
      {subTab === 'record' && (
        <PlayerPickRecord players={players} backtest={backtest} onPlayerClick={onPlayerClick} />
      )}

      {/* 🔬 SIGNAL AUDIT — every displayed flag graded against the archive.
          Spans all graded days; ignores the day picker like Track record. */}
      {subTab === 'signals' && <SignalAudit backtest={backtest} />}

      {/* P/L — the archive at your odds. Spans all graded days, ignores the
          day picker like Track record does. */}
      {subTab === 'pl' && <PLSimulator />}

      {/* THE SEASON CARD, and under it the archive it's a summary of. Backtest
          used to render under every sub-tab; it belongs with the report card,
          which is the only other season-wide view of the same thing. */}
      {subTab === 'card' && (
        <>
          <ReportCard backtest={backtest} />
          <HRTierRecord report={evalReport?.hr_overlay} />
          {backtest && (
            <div style={{ marginTop: 26, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
              <Purpose>
                the same season, night by night — whether the record above is a trend or one good week.
              </Purpose>
              <Backtest backtest={backtest} />
            </div>
          )}
        </>
      )}
      </>)} />
    </div></PickCtx.Provider>
  )
}

// ── THE THREE QUESTIONS ─────────────────────────────────────────────────────
//
// Replaces ResultPills (🧾 Results / 🏷 True Price), which was one of FOUR
// rows of navigation stacked at the top of this tab. The old second and third
// rows — THIS NIGHT and ALL SEASON, seven pills between them — are folded in
// here as the first two questions, because that is what they always were: the
// labels above those rows were already saying "these are two different
// questions", they just weren't shaped like it.
//
// Each button carries the question it answers, so the split is legible before
// you click rather than after. Every one of the seven views is still exactly
// one click deep.
const MODES = [
  ['night',   '🌙 This night', 'how the picks graded'],
  ['season',  '📈 All season', 'is the model any good'],
]
function ModeBar({ mode, setMode }) {
  return <ModeBarPart modes={MODES} mode={mode} setMode={setMode} />   // components/results/ResultsParts.js
}
