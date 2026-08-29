'use client'
import Leaders from './Leaders'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { catColor, verdictInk } from '../../lib/scales'
import { gradedResultsUrl } from '../../lib/dataSource'
import { dedupeGraded } from '../../lib/graded'
import { arr, n, clean } from '../../lib/player'
import { PanelTitle, Empty, Chip, Card, WhatThis } from '../ui'
import Backtest from './Backtest'
import ResultsDepth, { ARCHIVE, archText } from './ResultsDepth'
import SignalAudit from '../SignalAudit'
import PickScorecard, { pickJob } from '../PickScorecard'
import ScoreAudit from '../ScoreAudit'
import ReportCard from '../ReportCard'
import PlayerPickRecord from '../PlayerPickRecord'
import PLSimulator from '../PLSimulator'
import ScoreBands from '../ScoreBands'

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
const TAG_COLORS = {
  '🏆': '#f97316', '🧨': '#f97316', '🔥': '#f97316',
  '🏁': '#22d3ee', '💠': '#38bdf8', '⚾': C.orange, '⭐': '#facc15',
}
function tagColor(tag) {
  for (const [emoji, col] of Object.entries(TAG_COLORS)) {
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

// ── Flow / Fold, hoisted to module scope (2026-08-18) ──────────────────────
// Used inside the "overview" sub-tab's render (an IIFE that re-runs on every
// Results render). Same bug and same fix as Scoreboard.js's Fold and this
// file's own Row/Group above PitcherWeaknessDigest: a component declared
// INSIDE a render gets a new identity every render, and React unmounts the
// old one — which throws away a native <details>'s open/closed state. A
// panel you opened to check the numbers was closing itself the next time the
// results silently refreshed.
const Flow = ({ num, title, note }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '20px 0 8px', paddingBottom: 5, borderBottom: `1px solid ${C.border}` }}>
    <span style={{ fontFamily: NUM_FONT, fontSize: 11, fontWeight: 900, color: C.orange, border: `1px solid ${C.orange}55`, borderRadius: 999, padding: '1px 8px' }}>{num}</span>
    <span style={{ fontSize: 12.5, fontWeight: 900 }}>{title}</span>
    <span style={{ fontSize: 9.5, color: C.text3 }}>{note}</span>
  </div>
)
// A demoted panel: closed by default, honest label about what's inside.
const Fold = ({ label, children }) => (
  <details style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11, marginBottom: 8 }}>
    <summary style={{ padding: '8px 13px', fontSize: 10.5, fontWeight: 800, cursor: 'pointer', color: C.text2 }}>{label}</summary>
    <div style={{ padding: '4px 10px 10px' }}>{children}</div>
  </details>
)

// ── micro components ────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', fontSize: 12, fontWeight: 700, borderRadius: 999,
      border: `1px solid ${active ? C.orange : C.border}`,
      background: active ? `${C.orange}22` : 'rgba(255,255,255,.035)',
      color: active ? C.orange : C.text2, cursor: 'pointer', whiteSpace: 'nowrap',
    }}>{children}</button>
  )
}

function StatRow({ label, value, accent }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 11, color: C.text3 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 800, color: accent || C.text, fontFamily: NUM_FONT }}>{value}</span>
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
      fontSize: 10, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.07em',
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
            <span style={{ fontSize: 11, color: C.text2 }}>{label}</span>
            <span style={{ fontSize: 12, fontWeight: 800, color, fontFamily: NUM_FONT }}>{count}</span>
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
      <div style={{ fontSize: 10, color: C.text3 }}>{label}</div>
      <span style={{ fontFamily: NUM_FONT, fontWeight: 800, fontSize: 15, color: tone || C.text }}>{value}</span>
      {sub && <div style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>{sub}</div>}
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
      <div style={{ fontSize: 9, color: C.text3, padding: '0 14px 10px', lineHeight: 1.5 }}>
        HRW and the 375+ count aren&apos;t written into the graded results, so they&apos;re read off
        tonight&apos;s slate instead — matched {matched} of {unique.length} players by id.
        {matched < unique.length && ' The unmatched ones are graded players who aren’t on the current slate, which happens when results are showing a different day; they’re excluded rather than counted as zero.'}
        {' '}A dash means the field is genuinely absent, not that the value is zero.
      </div>
    </Card>
  )
}

// ── Capture banner ──────────────────────────────────────────────────────────

function CaptureBanner({ report, uniqueReport }) {
  if (!report) return null
  const pctVal = sf(report.hr_capture_pct)
  const total = si(report.total_hrs_on_slate)
  const caught = si(report.caught_hrs_on_sheet)
  const missed = total - caught
  const col = barColor(pctVal)
  const uniq = uniqueReport || {}

  return (
    <Card style={{ padding: '12px 14px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ flex: 1, minWidth: 140 }}>
          {/* "Capture" read as prediction accuracy when it is COVERAGE — how
              many of the night's homers appeared anywhere on the full sheet
              (hundreds of names), not how many picks hit. Label it what it is
              and say so on the card (08-29 outside review). */}
          <div style={{ fontSize: 10, color: C.text3, marginBottom: 5, fontFamily: NUM_FONT, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Full-sheet HR coverage</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MiniBar value={pctVal} color={col} />
            <span style={{ fontFamily: NUM_FONT, fontWeight: 800, fontSize: 18, color: col, minWidth: 52 }}>{pctVal.toFixed(1)}%</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Chip color={C.green}>{caught} caught</Chip>
          <Chip color={C.red}>{missed} missed</Chip>
          <Chip color={C.text2}>{total} total HRs</Chip>
        </div>
      </div>
      <div style={{ fontSize: 10, color: C.text3, lineHeight: 1.5, marginBottom: uniqueReport?.unique_players_tracked ? 8 : 0 }}>
        Coverage, not accuracy: this counts homers by anyone appearing anywhere on the
        full scored sheet — not homers by picks. Pick accuracy is the graded card above.
      </div>

      {uniq.unique_players_tracked ? (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
          <div>
            <div style={{ fontSize: 10, color: C.text3, marginBottom: 2 }}>Unique tracked</div>
            <span style={{ fontFamily: NUM_FONT, fontWeight: 800, fontSize: 15, color: C.text }}>{si(uniq.unique_players_tracked)}</span>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.text3, marginBottom: 2 }}>With HR</div>
            <span style={{ fontFamily: NUM_FONT, fontWeight: 800, fontSize: 15, color: C.green }}>{si(uniq.unique_players_with_hr)}</span>
          </div>
          <div>
            <div style={{ fontSize: 10, color: C.text3, marginBottom: 2 }}>HR accuracy</div>
            <span style={{ fontFamily: NUM_FONT, fontWeight: 800, fontSize: 15, color: barColor(sf(uniq.unique_hr_accuracy_pct)) }}>{sf(uniq.unique_hr_accuracy_pct).toFixed(1)}%</span>
          </div>
        </div>
      ) : null}
    </Card>
  )
}

// ── HR scorers bubbles ───────────────────────────────────────────────────────

function HRHits({ homers }) {
  if (!homers?.length) return null
  return (
    <Card style={{ padding: 0, marginBottom: 10, overflow: 'hidden' }}>
      <SectionHeader title={`✅ HR Scorers (${homers.length})`} color={C.green} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 12px' }}>
        {homers.map((h, i) => {
          const tags = Array.isArray(h.tags) ? h.tags : []
          const mainTag = tags[0] || '⚾'
          const col = tagColor(mainTag)
          const base = h.base_row || {}
          const multiHR = si(base.actual_hr) > 1
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 9px', borderRadius: 8,
              background: `${col}18`, border: `1px solid ${col}44`,
            }}>
              <span style={{ fontSize: 13 }}>{mainTag}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{h.name}</span>
              <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>{h.team}</span>
              {multiHR && <span style={{ fontSize: 10, color: C.yellow, fontWeight: 800, fontFamily: NUM_FONT }}>{si(base.actual_hr)}HR</span>}
              {tags.slice(1).map((t, ti) => <span key={ti} style={{ fontSize: 11 }}>{t}</span>)}
            </div>
          )
        })}
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
          <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{p.name}</span>
          <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>{p.throws}HP</span>
          {p.weak_side && <span style={{ fontSize: 9.5, color: C.purple, fontFamily: NUM_FONT }}>bleeds vs {p.weak_side}</span>}
        </div>
        <div style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, marginTop: 1 }}>
          our picks vs him: <b style={{ color: hitPicks ? accent : C.text3 }}>{hitPicks}/{p.picks.length} homered</b>
          {p.hr9 > 0 && <> · HR/9 <span style={{ color: p.hr9 >= 1.2 ? verdictInk(true).color : C.text2 }}>{p.hr9.toFixed(2)}</span></>}
          {p.whip > 0 && <> · WHIP <span style={{ color: p.whip >= 1.30 ? verdictInk(true).color : C.text2 }}>{p.whip.toFixed(2)}</span></>}
        </div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 900, fontFamily: NUM_FONT, color: p.hr_allowed_today > 0 ? accent : C.text3 }}>
          {p.hr_allowed_today} HR
        </div>
        <div style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>
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
        <span style={{ fontSize: 10, fontWeight: 900, color: accent, letterSpacing: '.08em', fontFamily: NUM_FONT }}>{label}</span>
        <span style={{ fontSize: 9, color: C.text3 }}>{note}</span>
      </div>
      {collapsed ? (
        <details>
          <summary style={{ fontSize: 9.5, color: C.text3, padding: '0 14px 8px', cursor: 'pointer', fontFamily: NUM_FONT }}>
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
        <div style={{ fontSize: 11.5, color: C.text3, lineHeight: 1.6 }}>
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
      <div style={{ padding: '8px 14px 2px', fontSize: 10.5, color: C.text2, fontFamily: NUM_FONT, lineHeight: 1.6 }}>
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

// ── Missed HR analysis ────────────────────────────────────────────────────────

function MissedHRs({ report }) {
  const missed = report?.missed_homer_entries || []
  if (!missed.length) return null
  return (
    <Card style={{ padding: 0, marginBottom: 10, overflow: 'hidden' }}>
      <SectionHeader title={`❌ Missed HRs — Not on Sheet (${missed.length})`} color={C.red} />
      <div style={{ padding: '8px 0' }}>
        {missed.slice(0, 20).map((h, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px',
            borderTop: i ? `1px solid ${C.border}` : 'none',
          }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.text, flex: 1 }}>{h.name}</span>
            <span style={{ fontSize: 10, color: C.text3 }}>{h.team}</span>
            {si(h.hr) > 1 && <span style={{ fontSize: 10, color: C.yellow, fontFamily: NUM_FONT, fontWeight: 800 }}>{si(h.hr)} HR</span>}
          </div>
        ))}
      </div>
    </Card>
  )
}

// ── Pairs performance ─────────────────────────────────────────────────────────

function PairsResults({ pairPoolResults }) {
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
        <div style={{ fontSize: 11, color: C.text3, marginBottom: 6 }}>PAIRS ({pairs.length} total · {clearedPairs.length} cleared)</div>
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
                <span style={{ fontSize: 11, color: aHR ? C.green : C.text2, fontWeight: aHR ? 700 : 400 }}>{pair.a?.name}</span>
                <span style={{ fontSize: 10, color: C.text3 }}>+</span>
                <span style={{ fontSize: 11, color: bHR ? C.green : C.text2, fontWeight: bHR ? 700 : 400 }}>{pair.b?.name}</span>
                <span style={{ fontSize: 10, color: C.text3, marginLeft: 'auto', fontFamily: NUM_FONT }}>{si(pair.hr_count)}/{si(pair.total_count)} HR</span>
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
            <div style={{ fontSize: 11, color: C.text3, marginBottom: 6 }}>{label}</div>
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
                      <span style={{ fontSize: 10, fontWeight: 800, color: col, minWidth: 14 }}>{letter}</span>
                      <MiniBar value={Math.min(100, hitRatio * 100)} color={col} />
                      <span style={{ fontSize: 10, fontFamily: NUM_FONT, color: col, minWidth: 44 }}>
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
                              fontSize: 10.5,
                              color: hit ? C.green : C.text2,
                              fontWeight: hit ? 700 : 400,
                            }}>
                              {hit ? '💥 ' : ''}{m?.name}
                              <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}> {m?.team}</span>
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

// ── Multi-hit / multi-HR cluster ──────────────────────────────────────────────

function MultiHitCluster({ slots }) {
  const multis = useMemo(() => {
    if (!slots?.length) return []
    const seen = new Set()
    return slots
      .filter(r => {
        const pid = r.player_id
        if (seen.has(pid)) return false
        seen.add(pid)
        return si(r.actual_hits) >= 2 || si(r.actual_hr) >= 2
      })
      .sort((a, b) => si(b.actual_hr) - si(a.actual_hr) || si(b.actual_hits) - si(a.actual_hits))
  }, [slots])

  if (!multis.length) return null

  // Every one of these rows IS a graded slot, so game_pick_role is right on
  // it — the question "was the multi-hit guy one of ours" was answerable the
  // whole time and just wasn't shown.
  const pickOf = (r) => String(r?.game_pick_role || r?.pick_type || '').split('/')[0].trim().toUpperCase()
  const botCount = multis.filter((r) => pickOf(r)).length

  return (
    <Card style={{ padding: 0, marginBottom: 10, overflow: 'hidden' }}>
      <SectionHeader
        title={`⭐ Multi-Hit / Multi-HR Day (${multis.length})`}
        color={C.yellow}
        right={botCount > 0 ? `🤖 ${botCount} of ${multis.length} were bot picks` : undefined}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 12px' }}>
        {multis.map((r, i) => {
          const col = si(r.actual_hr) >= 2 ? C.yellow : C.green
          const pick = pickOf(r)
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px',
              borderRadius: 8, background: `${col}18`,
              // A bot pick that went multi gets the orange ring — the site
              // co-signing its own call — plus the category so you know WHICH
              // pick cashed. Non-picks stay in their result colour.
              border: `1px solid ${pick ? C.orange : `${col}44`}`,
              boxShadow: pick ? `0 0 8px ${C.orange}22` : 'none',
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{r.name}</span>
              <span style={{ fontSize: 10, color: C.text3 }}>{r.team}</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: col, fontFamily: NUM_FONT }}>
                {si(r.actual_hits)}H{si(r.actual_hr) > 0 ? ` · ${si(r.actual_hr)}HR` : ''}{si(r.actual_tb) > 0 ? ` · ${si(r.actual_tb)}TB` : ''}
              </span>
              {pick && (
                <span
                  title={`The bot designated him as its ${pick} pick for this game`}
                  style={{
                    fontSize: 8.5, fontWeight: 900, fontFamily: NUM_FONT,
                    color: C.orange, letterSpacing: '.05em',
                  }}
                >🤖 {pick}</span>
              )}
            </div>
          )
        })}
      </div>
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
                <b style={{ color: C.text, fontSize: 13 }}>{tier.label || key.replaceAll('_', ' ')}</b>
                <span style={{ color: colors[key], fontSize: 9, fontWeight: 900, textTransform: 'uppercase' }}>
                  {full.n >= 200 ? 'measured' : 'tracking'}
                </span>
              </div>
              <div style={{ color: C.text3, fontSize: 10, lineHeight: 1.5, minHeight: 30, marginTop: 4 }}>{tier.rule || 'Waiting for the first locked row.'}</div>
              <div style={{ color: colors[key], fontFamily: NUM_FONT, fontSize: 17, fontWeight: 900, marginTop: 8 }}>{record(full)}</div>
              <div style={{ color: C.text3, fontFamily: NUM_FONT, fontSize: 10, marginTop: 5 }}>L7 {record(seven)} · L30 {record(thirty)}</div>
              {reference && (
                <div style={{ color: C.text2, fontSize: 9.5, lineHeight: 1.5, marginTop: 8 }}>
                  Audit reference: {(reference.hr_rate * 100).toFixed(1)}% over {reference.n} hitter-games; shown separately from the live locked record.
                </div>
              )}
            </Card>
          )
        })}
      </div>
      {!hasSchema && (
        <div style={{ color: C.text3, fontSize: 10, lineHeight: 1.6, marginTop: 7 }}>
          Clean tracking for these power tiers begins with the first official run using hr_overlay_v2. Earlier nights are not recreated from later data.
        </div>
      )}
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function Results({ results, liveResults = null, slateDate = '', backtest, evalReport = null, players = [], onPlayerClick }) {
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
  const captureReport = view?.hr_capture_report || null
  const uniqueReport = view?.unique_player_report || null
  const pairPoolResults = view?.pair_pool_results || null
  const date = String(view?.label || view?.date || 'Today')

  // topBoard dedupes too (2026-08-08): a hitter can hold TWO ranked slot
  // types (Top Board + Top Picks), which put the same man on the board
  // twice with identical lines. One row per player, best rank wins.
  const topBoard = useMemo(() => {
    const seen = new Set()
    return slots.filter(r => r.rank != null).sort((a, b) => a.rank - b.rank)
      .filter(r => { const k = String(r.player_id); if (seen.has(k)) return false; seen.add(k); return true })
  }, [slots])
  const allRows = useMemo(() => {
    const seen = new Set()
    return [...slots]
      .sort((a, b) => (b.top_board_score_v2 || 0) - (a.top_board_score_v2 || 0))
      .filter(r => { const k = String(r.player_id); if (seen.has(k)) return false; seen.add(k); return true })
  }, [slots])

  // ONE ROW PER PLAYER (lib/graded.js). `slots` stays raw for everything whose
  // subject is a PICK — the scorecard, the per-lane bars, the category tables,
  // where a hitter designated twice genuinely is two picks. `uniqSlots` is for
  // everything whose subject is a PLAYER: how many hitters got a base hit, how
  // many wore the ⭐, how many are still live. Those were counting the
  // multi-category picks twice, which quietly inflated exactly the hitters the
  // bot likes most.
  const uniqSlots = useMemo(() => dedupeGraded(slots), [slots])

  const topHit = topBoard.filter(r => r.got_hr === 1 || (r.actual_hr || 0) > 0).length

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
          <span style={{ fontSize: 9, color: C.green, fontWeight: 900, letterSpacing: '.09em', fontFamily: NUM_FONT }}>● LIVE</span>
          <span style={{ fontSize: 12.5, fontWeight: 900, color: C.text }}>Tonight</span>
          <span style={{ fontSize: 10, color: C.text3 }}>
            {liveMissing ? 'waiting for grading' : 'updates as games finish'}
          </span>
          {(liveMissing || liveFileStale) && (
            <div style={{
              order: 4, flex: '1 1 100%', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              fontSize: 10.5, color: C.text2, lineHeight: 1.5,
              border: '1px solid rgba(248,113,113,.45)', background: 'rgba(248,113,113,.08)',
              borderRadius: 8, padding: '7px 9px',
            }}>
              <span>{liveMissing ? `No grading has published for ${slateDate || 'tonight'} yet.` : `The live file is still dated ${liveFileDate || 'an earlier night'}.`}</span>
              {gradedDays.length > 0 && (
                <button type="button" onClick={() => setDay(gradedDays[0])} style={{
                  marginLeft: 'auto', padding: '5px 9px', borderRadius: 7, cursor: 'pointer',
                  border: `1px solid ${C.orange}66`, background: `${C.orange}14`, color: C.orange,
                  fontSize: 10, fontWeight: 800,
                }}>Open latest final</button>
              )}
            </div>
          )}
          {liveIsPregame && gradedDays.length > 0 && (
            <div style={{
              order: 4, flex: '1 1 100%', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              fontSize: 10.5, color: C.text2, lineHeight: 1.5,
              border: `1px solid ${C.border}`, background: 'rgba(255,255,255,.03)',
              borderRadius: 8, padding: '7px 9px',
            }}>
              <span>All {(results?.graded_slots || results?.results || []).length} tracked picks are still pregame.</span>
              <button type="button" onClick={() => setDay(gradedDays[0])} style={{
                marginLeft: 'auto', padding: '5px 9px', borderRadius: 7, cursor: 'pointer',
                border: `1px solid ${C.orange}66`, background: `${C.orange}14`, color: C.orange,
                fontSize: 10, fontWeight: 800,
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
                fontSize: 10.5, fontWeight: 800, fontFamily: NUM_FONT,
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
          <span style={{ fontSize: 9, color: C.orange, fontWeight: 900, letterSpacing: '.1em', fontFamily: NUM_FONT }}>
            📅 ARCHIVE
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 900, color: C.text }}>{prettyDay(day)}</span>
          <span style={{ fontSize: 10, color: C.text3 }}>graded · final</span>
          {newerDay && <button type="button" onClick={() => setDay(newerDay)} style={{
            marginLeft: 'auto', padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
            fontSize: 10, fontWeight: 800, fontFamily: NUM_FONT,
            border: `1px solid ${C.border}`, background: C.bg3, color: C.text2,
          }}>← Newer</button>}
          {olderDay && <button type="button" onClick={() => setDay(olderDay)} style={{
            padding: '4px 10px', borderRadius: 999, cursor: 'pointer',
            fontSize: 10, fontWeight: 800, fontFamily: NUM_FONT,
            border: `1px solid ${C.border}`, background: C.bg3, color: C.text2,
          }}>Older →</button>}
          <button
            type="button"
            onClick={() => { setDay('live'); setArchiveOpen(false) }}
            style={{
              marginLeft: newerDay ? 0 : 'auto', padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
              fontSize: 10.5, fontWeight: 800, fontFamily: NUM_FONT,
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
              fontSize: 10.5, fontWeight: 800, fontFamily: NUM_FONT,
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
            <span style={{ fontSize: 11.5, fontWeight: 900 }}>Past nights</span>
            <span style={{ fontSize: 9.5, color: C.text3 }}>Selecting a date changes Results only.</span>
            <span style={{ marginLeft: 'auto', fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>{gradedDays.length} final</span>
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
                  fontSize: 10.5, fontWeight: 700, fontFamily: NUM_FONT, whiteSpace: 'nowrap',
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
        <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginTop: 6 }}>loading that night…</div>
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
  // 🏆 LEADERS. Season stats plus the historical strip off the graded archive
  // — the context for whether any of this has been right, which is why it
  // belongs inside Results rather than as its own tab. No sub-views: the
  // component wears its own controls, so the branch mounts it whole. It sits
  // at the real return, after every hook, and FIRST, before the nothing-graded
  // guard — the season's leaders have nothing to do with whether tonight has
  // graded. (Same hazard class as the old True Price branch: a conditional
  // return above a hook is a blank page.)
  // SAME HAZARD CLASS AS 'leaders' — placed at the real return, after every
  // hook, and BEFORE the nothing-graded guard. The band table is measured off
  // the season archive and has nothing to do with whether tonight has graded;
  // a conditional return above a hook is a blank page.
  if (mode === 'bands') {
    return (
      <div>
        <PanelTitle
          title="Results"
          sub="what each 0-100 score is actually worth, measured against every outcome"
        />
        <ModeBar mode={mode} setMode={setMode} />
        <ScoreBands />
      </div>
    )
  }

  if (mode === 'leaders') {
    return (
      <div>
        <PanelTitle title="Results" sub="the season’s actual lines — context for every graded night" />
        <ModeBar mode={mode} setMode={setMode} />
        <Leaders players={players} onPlayerClick={onPlayerClick} />
      </div>
    )
  }

  // SCOPED TO THIS NIGHT (2026-08-16). This used to return for the whole tab,
  // which meant a pregame morning — nothing graded yet — took the season
  // report card, the signal audit and the P/L simulator down with it, none of
  // which read tonight's file at all.
  if (mode === 'night' && !slots.length && !homers.length) {
    return (
      <div>
        <PanelTitle title="Results" sub="Nightly grading" />
        <ModeBar mode={mode} setMode={setMode} />
        {archiveBar}
        <Empty text={
          dayState === 'loading' ? 'Loading that day…'
            : day !== 'live' ? `No graded file published for ${day}.`
            : 'No graded results yet tonight — games haven’t started or nothing has been graded.'
        } />
        <div style={{ fontSize: 10.5, color: C.text3, lineHeight: 1.6, marginTop: 10, maxWidth: 640 }}>
          <b style={{ color: C.text2 }}>All season</b> above still works — the report card, the
          per-player track record, the signal audit and the P/L run off the archive and do not need
          tonight to have started.
        </div>
      </div>
    )
  }

  return (
    <div>
      <PanelTitle
        title="Results"
        sub={mode === 'night'
          ? `${date} · ${slots.length} slots · ${allRows.length} unique`
          : `every graded night in the archive · ${gradedDays.length} of them`}
        right={mode === 'night' ? (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Chip color={C.green}>{homers.length} HRs on sheet</Chip>
            {topHit > 0 && <Chip color={C.orange}>{topHit}/{topBoard.length} Top Board</Chip>}
          </div>
        ) : null}
      />

      <ModeBar mode={mode} setMode={setMode} />

      {/* The day picker belongs to This night and nothing else. */}
      {mode === 'night' && archiveBar}

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
      {subTab === 'overview' && (() => {
        // PLAYER-level counts run off uniqSlots; PICK-level ones (withJob,
        // the lanes) stay on the raw slots — see the uniqSlots comment above.
        const judge = uniqSlots.filter((r) => (r.actual_ab || 0) > 0)
        const withJob = judge.filter((r) => pickJob(r))
        const didJob = withJob.filter((r) => pickJob(r)?.did).length
        const baseHit = judge.filter((r) => (r.actual_hits || 0) >= 1).length
        const hrOnly = judge.filter((r) => r.got_hr === 1 || (r.actual_hr || 0) > 0).length
        const multi = judge.filter((r) => (r.actual_hits || 0) >= 2 || (r.actual_hr || 0) >= 2).length
        const stillLive = uniqSlots.filter((r) => r.is_final !== 1).length
        const capPct = Number(captureReport?.hr_capture_pct || 0)
        const capCaught = si(captureReport?.caught_hrs_on_sheet)
        const capTotal = si(captureReport?.total_hrs_on_slate)
        const missedList = arr(captureReport?.missed_homer_entries)

        // ── the lanes, each against its own bar ──
        const lanes = {}
        withJob.forEach((r) => {
          const j = pickJob(r)
          if (!lanes[j.role]) lanes[j.role] = { role: j.role, label: j.label, job: j.job, color: j.color, n: 0, did: 0 }
          lanes[j.role].n += 1
          if (j.did) lanes[j.role].did += 1
        })
        const laneList = Object.values(lanes).sort((a, b) => b.did / b.n - a.did / a.n)
        const bigLanes = laneList.filter((l) => l.n >= 3)
        const bestLane = bigLanes[0] || null
        const worstLane = bigLanes.length > 1 ? bigLanes[bigLanes.length - 1] : null

        // ── hot or cold vs the season's own base ──
        const seasonBase = Number(backtest?.overall_base_hit_accuracy) || null
        const tonightBase = judge.length ? (100 * baseHit) / judge.length : null
        const runDiff = seasonBase != null && tonightBase != null && judge.length >= 5 ? tonightBase - seasonBase : null

        const B = ({ children, col = C.text }) => <b style={{ color: col, fontFamily: NUM_FONT }}>{children}</b>
        const Take = ({ col, children, title }) => (
          <div style={{ display: 'flex', gap: 9, alignItems: 'baseline' }} title={title}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: col, flexShrink: 0, position: 'relative', top: -1 }} />
            <span style={{ fontSize: 12, color: C.text2, lineHeight: 1.65, minWidth: 0 }}>{children}</span>
          </div>
        )

        // ── THE TAKEAWAYS, NOW CARRYING WHAT THE TILES CARRIED ─────────────
        //
        // "2 · The night in numbers" used to sit directly under this block:
        // five tiles restating, number for number, the sentences above them —
        // Did its job, Base hit, If graded HR-only, Multi-hit / multi-HR, HR
        // capture. Tiles lose to sentences, and a sentence is the only shape
        // that can carry the clause the number needs ("the unfair yardstick",
        // "of every pick", "slate homers on the sheet"). All five are folded in
        // below: every value, every sub-line kept as words, every tooltip kept
        // on the row — and k/n printed on every rate, which a tile never had
        // room for. Two of them (base hit, HR-only) used to render only under
        // conditions, so folding them in actually made them MORE reliable.
        //
        // Each sentence still only renders when its data exists; a sentence
        // that would have to say "0 of 0" says nothing instead.
        const takes = []
        if (!judge.length) {
          takes.push(
            <Take key="none" col={C.text3}>
              Nothing to grade yet — no pick has recorded an at-bat. Sentences appear here as the night fills in.
            </Take>,
          )
        } else {
          // ① the "Did its job" tile, plus the sub-line it wore.
          if (withJob.length) {
            const p = (100 * didJob) / withJob.length
            takes.push(
              <Take key="job" col={verdictInk(true).color}
                title="Every pick against the bar it was designated for — the tile that used to sit below called this “Did its job”.">
                The picks cleared <B col={verdictInk(true).color}>{didJob} of {withJob.length}</B> of their own bars
                (<B col={verdictInk(true).color}>{p.toFixed(0)}%</B>) — a HIT pick needed a hit, an HRR pick 2+ H+R+RBI;
                nobody here is graded on homers he wasn&apos;t picked for.
              </Take>,
            )
          }
          // ② the "Base hit" tile — now unconditional, with the hot/cold read
          // it used to be separate from. It only ever appeared when the season
          // base existed AND five picks had batted, so on a thin night the
          // page could show the tile and not the sentence.
          {
            const p = (100 * baseHit) / judge.length
            const hot = runDiff != null && runDiff >= 5
            const cold = runDiff != null && runDiff <= -5
            takes.push(
              <Take key="hit" col={verdictInk(false).color}
                title="Every graded pick against the plainest bar there is: one base hit. Four of the five lanes are not picked for it, so this is scale, not a grade.">
                On the plainest bar there is — one base hit — the same picks went{' '}
                <B col={verdictInk(false).color}>{baseHit} of {judge.length}</B> ({p.toFixed(0)}% of every pick that batted)
                {runDiff == null ? '.' : (
                  <>
                    , which is the model running{' '}
                    <B col={hot ? verdictInk(true).color : cold ? verdictInk(false).color : C.text}>{hot ? 'hot' : cold ? 'cold' : 'right on'}</B>{' '}
                    against its season base of <B>{seasonBase.toFixed(1)}%</B> lifetime.
                    {cold ? ' One night, not a verdict — the base is the number to trust.' : ''}
                  </>
                )}
              </Take>,
            )
          }
          // ③ the "If graded HR-only" tile, and the sub-line that made it
          // readable: the unfair yardstick.
          {
            const p = (100 * hrOnly) / judge.length
            takes.push(
              <Take key="hronly" col={C.orange}
                title="Kept because people ask for it, labelled because it is unfair: only the HR and TOP lanes are picked to homer, so this grades three lanes on a bar nobody set them.">
                Graded on homers alone — the unfair yardstick, since only the HR and TOP lanes are
                picked for one — the night reads <B col={C.orange}>{hrOnly} of {judge.length}</B>{' '}
                ({p.toFixed(0)}%).
              </Take>,
            )
          }
          if (bestLane) {
            const p = (100 * bestLane.did) / bestLane.n
            const a = ARCHIVE.lanes[bestLane.role]
            takes.push(
              <Take key="best" col={bestLane.color}
                title={a ? `Over ${ARCHIVE.nights} graded nights the ${bestLane.role} lane cleared ${a.bar} ${archText(a)}, voids excluded.` : undefined}>
                <B col={bestLane.color}>{bestLane.label}</B> picks cleared <B col={bestLane.color}>{bestLane.did} of {bestLane.n}</B>{' '}
                ({p.toFixed(0)}%) — {p >= 65 ? 'the reliable lane again' : 'the night’s strongest lane'}
                {a ? <> ; the lane&apos;s own archive rate is <B>{archText(a)}</B> over {ARCHIVE.nights} graded nights</> : ''}.
              </Take>,
            )
          }
          if (worstLane && (100 * worstLane.did) / worstLane.n < 50 && worstLane.role !== bestLane?.role) {
            const a = ARCHIVE.lanes[worstLane.role]
            takes.push(
              <Take key="worst" col={C.text3}>
                <B col={worstLane.color}>{worstLane.label}</B> went <B>{worstLane.did} of {worstLane.n}</B> — the lane to be
                patient with tonight; its bar is {worstLane.job}
                {a ? <> , and it clears that bar <B>{archText(a)}</B> of the time across the archive</> : ''}.
              </Take>,
            )
          }
          // ④ the "HR capture" tile. Says so even at zero, because a 0% tile
          // and "no homer has landed yet" are very different facts.
          // The sky-blue accent below (both branches) is this card's constant
          // section colour, not a magnitude-tiered verdict -- capPct's
          // good/bad framing lives in the TEXT ("wide net" vs "leaky
          // night"), not the colour. No exact C token matches it, so it's
          // left literal.
          if (capTotal > 0) {
            takes.push(
              <Take key="cap" col="#38bdf8"
                title="Slate homers that were on the sheet somewhere — any lane, any rank. The full caught-vs-missed detail is the fold under this block.">
                <B col="#38bdf8">{capCaught}</B> of the slate&apos;s <B>{capTotal}</B> home runs were somewhere on the sheet
                (<B col="#38bdf8">{capPct.toFixed(0)}%</B>) — {capPct >= 70 ? 'a wide net on a night it mattered' : capPct >= 50 ? 'a decent net' : 'a leaky night for the net'}
                {missedList.length ? <> ; the other <B col={verdictInk(false).color}>{missedList.length}</B> never made it (list below)</> : ''}.
              </Take>,
            )
          } else if (captureReport) {
            takes.push(
              <Take key="cap0" col="#38bdf8"
                title="The capture tile used to print 0% here, which reads as a failed net rather than an empty slate.">
                Nobody on the slate has gone deep yet, so there is no capture rate to quote — not a
                miss, just no homers to catch.
              </Take>,
            )
          }
          // ⑤ the "Multi-hit / multi-HR" tile, which showed a bare count.
          // The gold below is the site's established gold accent with no
          // matching C token -- the same exception the Pairs.js pass
          // documented for its own dozen-odd uses of that gold -- and it
          // isn't a verdict-pair member, so it's left literal rather than
          // guessing a nearest token.
          takes.push(
            <Take key="multi" col="#FCD34D"
              title="A pick with 2+ hits or 2+ homers — the big individual nights. Every one of them is named under “Who delivered”.">
              {multi > 0 ? (
                <>
                  <B col="#FCD34D">{multi}</B> of the <B>{judge.length}</B> picks that batted put up a
                  multi-hit or multi-HR line — the loudest individual night{multi > 1 ? 's' : ''} on the sheet.
                </>
              ) : (
                <>No pick has put up a multi-hit or multi-HR line yet, out of <B>{judge.length}</B> that batted.</>
              )}
            </Take>,
          )
          if (day === 'live' && stillLive > 0) {
            // Tense guard (2026-08-29): "still live" was rendering on a slate
            // whose calendar date had already passed — a bot-side flag lag
            // this page can't fix, but it CAN stop asserting liveness it
            // can't verify. Past-dated slate: same count, honest wording.
            const slateBehind = Boolean(
              slateDate && slateDate < new Date().toLocaleDateString('en-CA'),
            )
            takes.push(
              <Take key="live" col={C.cyan}>
                {slateBehind ? (
                  <>
                    <B col={C.cyan}>{stillLive}</B> slot{stillLive > 1 ? 's' : ''} on the {slateDate} slate{' '}
                    {stillLive > 1 ? 'haven’t' : 'hasn’t'} been marked final in the feed yet — the
                    numbers above may still settle when the grade lands.
                  </>
                ) : (
                  <>
                    <B col={C.cyan}>{stillLive}</B> slot{stillLive > 1 ? 's are' : ' is'} still live — every sentence above
                    moves until the last out.
                  </>
                )}
              </Take>,
            )
          }
        }

        // Flow and Fold now live at module scope (2026-08-18) — this whole
        // block is an IIFE inside Results' JSX, re-run on every render, so
        // these were getting a fresh identity even more often than the other
        // two instances of this bug. See Scoreboard.js's Fold for the full
        // diagnosis of why that silently closes an opened <details>.

        return (
        <>
          {/* 1 · THE TAKEAWAYS — sentences before any chart */}
          <Flow num="1" title="The takeaways" note="tonight in sentences — every claim computed from the graded slots, nothing editorial" />
          <div style={{
            background: `linear-gradient(155deg, ${C.bg2}, rgba(249,115,22,.04))`,
            border: `1px solid ${C.border}`, borderRadius: 13,
            padding: '12px 15px', display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 4,
          }}>
            {takes}
          </div>

          {/* The two folds that belong to the sentences above: the capture
              detail the capture sentence counts, and the archive the lane
              sentences are being measured against. Both closed by default —
              the answer is the block above, these are the receipts. */}
          <Fold label="📡 Capture detail — the full net, caught vs missed">
            <CaptureBanner report={captureReport} uniqueReport={uniqueReport} />
          </Fold>
          <Fold label={`📐 What ${ARCHIVE.nights} graded nights say each lane is worth`}>
            {/* Restated from the 2026-08-16 backtest over this project's own
                archive. Older copy elsewhere in the repo was fit on nine days
                and counted voids as losses, which is most of the gap. */}
            <div style={{ fontSize: 11.5, color: C.text2, lineHeight: 1.7 }}>
              <B>{ARCHIVE.nights}</B> graded nights, <B>{ARCHIVE.games.toLocaleString()}</B> games,{' '}
              <B>{ARCHIVE.picks.toLocaleString()}</B> judgeable designated picks. Each lane on its own
              bar, voids excluded — a man who never batted is a void, not a loss.
              {/* Each lane name below wears its CAT.role identity colour --
                  except TOP, which stays the literal established gold
                  rather than catColor('role','TOP') (=C.yellow): CAT.role
                  says TOP is 'yellow' but this gold is visibly a different
                  shade, and PickScorecard.js's own TOP colour is this same
                  gold, not C.yellow either. A real fix is a registry
                  decision (add a gold CAT token, or reconcile
                  CAT.role.TOP to what's actually shipping) -- flagged in
                  the session report, not decided here. */}
              <div style={{ marginTop: 6 }}>
                HIT <B col={catColor('role', 'HIT')}>{archText(ARCHIVE.lanes.HIT)}</B> ·{' '}
                HRR <B col={C.cyan}>{archText(ARCHIVE.lanes.HRR)}</B> ·{' '}
                CONTACT <B col={verdictInk(true).color}>{archText(ARCHIVE.lanes.CONTACT)}</B> ·{' '}
                legacy TOP <B col="#FCD34D">{archText(ARCHIVE.lanes.TOP)}</B> on its HR bar ·{' '}
                HR <B col={C.orange}>{archText(ARCHIVE.lanes.HR)}</B>.
              </div>
              <div style={{ marginTop: 6, color: C.text3 }}>
                The bar matters more than the pick: the same legacy per-game TOP pick, the same night,
                judged on 1+ hit instead of a homer went <B col={C.text}>{archText(ARCHIVE.topOnHits)}</B>.
                {' '}This archived tier is not The Four, which are the current four market headline calls.
                {' '}And taking a
                single pick per game — always the top-scored HIT pick — returned{' '}
                <B col={C.text}>{archText(ARCHIVE.onePerGame)}</B>; count the voids as losses instead of
                setting them aside and that floor is{' '}
                <B>{ARCHIVE.onePerGame.voidsAsLossesPct}%</B>.
              </div>
              <div style={{ marginTop: 6, fontSize: 10, color: C.text3 }}>
                These are measured frequencies with their denominators, over an archive that is not a
                random sample of the season — it is whatever survived on disk, 62 nights inside a
                119-day span. Tonight is one night against them.
              </div>
            </div>
          </Fold>

          {/* 2 · WHO DELIVERED — names stay visible; names are the takeaway */}
          <Flow num="2" title="Who delivered" note="homers first, then the multi-hit nights" />
          <HRHits homers={homers} />
          <MultiHitCluster slots={uniqSlots} />

          {/* 3 · THE LANES — sentence-sized lines, bars folded */}
          <Flow num="3" title="How each lane did" note="every category against its own bar, smallest samples included" />
          {laneList.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {laneList.map((l) => (
                <span key={l.role} title={`A ${l.label} pick's job is ${l.job}.${
                  ARCHIVE.lanes[l.role]
                    ? ` Across ${ARCHIVE.nights} graded nights that lane cleared it ${archText(ARCHIVE.lanes[l.role])}, voids excluded.`
                    : ''
                }`} style={{
                  display: 'inline-flex', alignItems: 'baseline', gap: 6,
                  border: `1px solid ${l.color}44`, background: `${l.color}10`, borderRadius: 9, padding: '4px 11px',
                }}>
                  <span style={{ fontSize: 10, fontWeight: 900, color: l.color, fontFamily: NUM_FONT }}>{l.label}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 800, color: C.text, fontFamily: NUM_FONT }}>{l.did}/{l.n}</span>
                  <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>{((100 * l.did) / l.n).toFixed(0)}%</span>
                </span>
              ))}
            </div>
          )}
          {/* The "Lane bars" fold came off here (2026-08-09): CategoryBar drew
              the same per-category rates the chips above already carry, and
              ResultsDepth's tier table carries them a third time with more
              columns. One fact, one shape. */}
          <Fold label="🎯 Pick by pick — every pick against its own bar">
            <PickScorecard slots={slots} backtest={backtest} onPlayerClick={onPlayerClick} />
          </Fold>

          {/* 4 · MODEL CHECKS — all receipts, all folded */}
          <Flow num="4" title="Model checks" note="the receipts — open when you want to audit, skip when you just want the read" />
          <Fold label="🔬 Flags, slate summary and score audit — did the numbers mean anything tonight">
            <TrackingLegend slots={uniqSlots} />
            <ExpandedStats slots={uniqSlots} players={players} />
            <ScoreAudit slots={uniqSlots} players={players} />
          </Fold>

          {/* 4½ · WHY THE HITS DIDN'T COME (2026-08-17) ──────────────────────
              Donovan: "thinking about the hit — a batter's form on why they
              should NOT get a hit since they're hitting at a 70ish clip. there
              should be data supporting why players didn't get hit."
              Every high-hit-score man who went hitless, with the EVIDENCE the
              slate already carried against him: his 0-for-N, the arm's
              strikeout rates, his own K%, his average against that hand, his
              L5 form. Where nothing in the data flagged him, it says so —
              a 70 clip means three in ten miss with no excuse available, and
              pretending otherwise would be inventing a story. */}
          {(() => {
            const byId = new Map(players.map((pl) => [Number(pl?.player_id ?? pl?.id), pl]))
            const misses = uniqSlots
              .filter((r) => (r.actual_ab || 0) > 0 && (r.actual_hits || 0) === 0)
              .filter((r) => Number(r.hit_score || 0) >= 60
                || /HIT/i.test(String(r.pick_type || r.slot_type || '')))
              .map((r) => ({ r, sl: byId.get(Number(r.player_id)) || null }))
              .sort((a, b) => Number(b.r.hit_score || 0) - Number(a.r.hit_score || 0))
            if (!misses.length) return null
            const pct = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? `${(Number(v) * 100).toFixed(0)}%` : null)
            const av = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v).toFixed(3).replace(/^0\./, '.') : null)
            return (
              <>
                <Flow num="4½" title="Why the hits didn’t come" note="every 60+ hit score that went hitless, with the evidence the slate carried against him — or an honest shrug" />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
                  {misses.slice(0, 8).map(({ r, sl }) => {
                    const throwsL = String(sl?.pitcher_throws || '').toUpperCase().startsWith('L')
                    const vsHand = throwsL ? sl?.avg_vs_lhp : sl?.avg_vs_rhp
                    const clues = []
                    const k9 = Number(sl?.pitcher_k9)
                    const pk = Number(sl?.pitcher_k_rate)
                    const myK = Number(sl?.season_k_rate)
                    if (Number.isFinite(k9) && k9 >= 9) clues.push(`the arm strikes out ${k9.toFixed(1)}/9${pct(pk) ? ` (${pct(pk)} of hitters)` : ''}`)
                    if (Number.isFinite(myK) && myK >= 0.24) clues.push(`his own K rate is ${pct(myK)}`)
                    if (av(vsHand) && Number(vsHand) < 0.24) clues.push(`he hits ${av(vsHand)} vs ${throwsL ? 'LHP' : 'RHP'} — the hand he saw`)
                    const l5h = Number(sl?.last5_hits)
                    if (Number.isFinite(l5h) && l5h <= 3) clues.push(`only ${l5h} hits over his last 5`)
                    return (
                      <div key={`${r.player_id}-miss`} style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.65 }}>
                        <b onClick={() => sl && onPlayerClick?.(sl)}
                          style={{ color: C.text, cursor: sl ? 'pointer' : 'default' }}>{r.name || sl?.name}</b>
                        <span style={{ fontFamily: NUM_FONT, color: C.text3 }}>
                          {' '}hit score {Number(r.hit_score || 0).toFixed(0)} · went 0-for-{r.actual_ab}
                        </span>
                        {' — '}
                        {clues.length
                          ? <span style={{ color: C.text3 }}>{clues.join('; ')}.</span>
                          : <span style={{ color: C.text3 }}>nothing in the slate flagged this one — a {Number(r.hit_score || 0).toFixed(0)} clip still misses roughly {(100 - Number(r.hit_score || 0)).toFixed(0)} nights in 100, and this was one.</span>}
                      </div>
                    )
                  })}
                  {misses.length > 8 && (
                    <div style={{ fontSize: 9.5, color: C.text3 }}>+ {misses.length - 8} more hitless 60+ scores — the full table below has every one.</div>
                  )}
                </div>
              </>
            )
          })()}

          {/* 5 · WHAT GOT AWAY — the sentence up top already counted them */}
          <Flow num="5" title="What got away" note="homers the sheet never had — the model's real misses" />
          {missedList.length > 0 ? (
            <>
              <div style={{ fontSize: 11.5, color: C.text2, lineHeight: 1.6, marginBottom: 8 }}>
                {missedList.slice(0, 3).map((h, i) => (
                  <span key={i}>
                    <b style={{ color: C.text }}>{clean(h?.name, '—')}</b>
                    <span style={{ color: C.text3, fontFamily: NUM_FONT }}> {clean(h?.team, '')}</span>
                    {i < Math.min(3, missedList.length) - 1 ? ', ' : ''}
                  </span>
                ))}
                {missedList.length > 3 ? ` and ${missedList.length - 3} more` : ''} homered from off the sheet.
              </div>
              <Fold label={`❌ The full missed list (${missedList.length})`}>
                <MissedHRs report={captureReport} />
              </Fold>
            </>
          ) : (
            <div style={{ fontSize: 11, color: C.text3, marginBottom: 8 }}>
              Nothing got away{capTotal > 0 ? ' — every slate homer was on the sheet somewhere' : ' yet'}.
            </div>
          )}

          {/* 6 · THE FULL GRADING TABLES. These used to render under EVERY
              sub-tab, so the season Report card came with the whole night's
              grading bolted to the bottom of it. They belong to the night, so
              they live inside the night's view — and behind a fold, because
              they are the deep version of everything above. */}
          <Flow num="6" title="The full tables" note="the same night at full depth — score calibration, every homer vs the board, every pick" />
          <Fold label="📋 Open the full grading tables">
            <ResultsDepth results={view} onPlayerClick={onPlayerClick} />
          </Fold>
        </>
        )
      })()}

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
    </div>
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
  // True Price sat third here for one round; it moved to the Odds tab
  // (2026-08-16) because it answers the book's question, not this tab's —
  // see the comment at the mode branch above. Leaders took the slot: the
  // season's real numbers are the context every graded night is read against.
  ['leaders', '🏆 Leaders',    'the season’s actual numbers'],
  // 2026-08-16, Donovan: "what band of hr score goes yard every... 70 an up,
  // 70-50, 50-30, 40 or lower, unscored... for each category too". This tab
  // asks "has any of this been right", and "what is a 74 actually worth" is
  // the most load-bearing version of that question on the whole site.
  ['bands',   '📊 Score bands', 'what a 0-100 is actually worth'],
]
function ModeBar({ mode, setMode }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 11, flexWrap: 'wrap' }}>
      {MODES.map(([k, label, question]) => {
        const on = mode === k
        return (
          <button
            key={k} onClick={() => setMode(k)}
            style={{
              flex: '1 1 170px', minWidth: 0, textAlign: 'left', cursor: 'pointer',
              padding: '7px 13px', borderRadius: 11,
              border: `1px solid ${on ? C.orange : C.border}`,
              background: on ? 'rgba(249,115,22,.13)' : 'rgba(255,255,255,.03)',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 900, color: on ? C.orange : C.text2 }}>{label}</div>
            <div style={{ fontSize: 9.5, color: C.text3, marginTop: 1 }}>{question}</div>
          </button>
        )
      })}
    </div>
  )
}
