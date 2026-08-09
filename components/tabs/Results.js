'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { gradedResultsUrl } from '../../lib/dataSource'
import { arr, n, clean } from '../../lib/player'
import { PanelTitle, Empty, Chip, Card } from '../ui'
import Backtest from './Backtest'
import ResultsDepth from './ResultsDepth'
import SignalAudit from '../SignalAudit'
import PickScorecard, { pickJob } from '../PickScorecard'
import ScoreAudit from '../ScoreAudit'
import ReportCard from '../ReportCard'
import PlayerPickRecord from '../PlayerPickRecord'
import PLSimulator from '../PLSimulator'

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
//     lane chips in Overview §4 and the tier table in ResultsDepth.
//   · The day picker became an archive browser instead of a tenth filter.

// ── helpers ────────────────────────────────────────────────────────────────

const TAG_COLORS = {
  '🏆': '#f97316', '🧨': '#f97316', '🔥': '#f97316',
  '🏁': '#22d3ee', '💠': '#38bdf8', '⚾': '#4ade80', '⭐': '#facc15',
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
function Purpose({ children }) {
  return (
    <div style={{ fontSize: 10.5, color: C.text3, lineHeight: 1.55, margin: '0 0 8px' }}>
      <b style={{ color: C.text2 }}>What this answers:</b> {children}
    </div>
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

  const items = [
    { emoji: '⭐', label: 'Weak pitcher spot', count: starCount, color: C.yellow },
    { emoji: '🧩', label: 'Aligned signals',   count: puzzleCount, color: '#a78bfa' },
    { emoji: '🎯', label: 'Pitch type match',   count: matchCount, color: '#38bdf8' },
    { emoji: '👻', label: 'Hidden HR value',    count: hiddenCount, color: '#71717a' },
    { emoji: '⚠️', label: 'Trap flag',          count: trapCount, color: '#f87171' },
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
          <div style={{ fontSize: 10, color: C.text3, marginBottom: 5, fontFamily: NUM_FONT, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sheet HR Capture</div>
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

  const Row = ({ p, accent }) => {
    const hitPicks = p.picks.filter(r => si(r.actual_hr) > 0).length
    return (
      <div style={{ padding: '7px 14px', borderTop: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: C.text }}>{p.name}</span>
            <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>{p.throws}HP</span>
            {p.weak_side && <span style={{ fontSize: 9.5, color: '#a78bfa', fontFamily: NUM_FONT }}>bleeds vs {p.weak_side}</span>}
          </div>
          <div style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT, marginTop: 1 }}>
            our picks vs him: <b style={{ color: hitPicks ? accent : C.text3 }}>{hitPicks}/{p.picks.length} homered</b>
            {p.hr9 > 0 && <> · HR/9 <span style={{ color: p.hr9 >= 1.2 ? '#f87171' : C.text2 }}>{p.hr9.toFixed(2)}</span></>}
            {p.whip > 0 && <> · WHIP <span style={{ color: p.whip >= 1.30 ? '#f87171' : C.text2 }}>{p.whip.toFixed(2)}</span></>}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 900, fontFamily: NUM_FONT, color: p.hr_allowed_today > 0 ? accent : C.text3 }}>
            {p.hr_allowed_today} HR
          </div>
          <div style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>
            {p.hit_allowed_today} H · <span title="Strikeouts he hung on OUR graded hitters — partial by construction, but a K-heavy line here marks a strikeout-prop arm" style={{ color: p.k_today >= 6 ? '#f87171' : C.text3, cursor: 'help' }}>{p.k_today} K</span>
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

  return (
    <Card style={{ padding: 0, marginBottom: 10, overflow: 'hidden' }}>
      <SectionHeader title="⚾ Pitcher Results — Model vs Actual" color="#38bdf8" />
      {/* the verdict, before the list */}
      <div style={{ padding: '8px 14px 2px', fontSize: 10.5, color: C.text2, fontFamily: NUM_FONT, lineHeight: 1.6 }}>
        flagged <b style={{ color: C.text }}>{flaggedN}</b> weak arm{flaggedN !== 1 ? 's' : ''} ·{' '}
        <b style={{ color: '#4ade80' }}>{buckets.called.length}</b> gave it up
        {flaggedN > 0 && <> ({((100 * buckets.called.length) / flaggedN).toFixed(0)}%)</>}
        {unflaggedHr > 0 && <> · <b style={{ color: '#f87171' }}>{unflaggedHr} HR</b> came off arms it didn&apos;t flag</>}
      </div>
      <Group icon="🎯" label="CALLED IT" note="flagged weak, and he gave it up" list={buckets.called} accent="#4ade80" />
      <Group icon="💥" label="BURNED US UNFLAGGED" note="the model didn't flag him — he homered anyway" list={buckets.missedArm} accent="#f87171" />
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
  const pool4 = pools.filter(p => (p.label || '').startsWith('4-MAN'))
  const pool6 = pools.filter(p => (p.label || '').startsWith('6-MAN'))

  return (
    <Card style={{ padding: 0, marginBottom: 10, overflow: 'hidden' }}>
      <SectionHeader title="🔗 Pairs & Pools Performance" color="#a78bfa" />

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
      {[{ label: '4-MAN POOLS', list: pool4 }, { label: '6-MAN POOLS', list: pool6 }].map(({ label, list }) => (
        list.length > 0 && (
          <div key={label} style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 11, color: C.text3, marginBottom: 6 }}>{label}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {list.map((pool, i) => {
                const hitRatio = si(pool.hr_count) / Math.max(1, si(pool.total_count))
                const col = hitRatio >= 1 ? C.green : hitRatio >= 0.5 ? C.yellow : C.text3
                const letter = (pool.label || '').replace('4-MAN HR POOL ', '').replace('6-MAN HR POOL ', '')
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
                      <MiniBar value={hitRatio * 100} color={col} />
                      <span style={{ fontSize: 10, fontFamily: NUM_FONT, color: col, minWidth: 44 }}>
                        {si(pool.hr_count)}/{si(pool.total_count)} HR
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

// ── Main ─────────────────────────────────────────────────────────────────────

export default function Results({ results, backtest, players = [], onPlayerClick }) {
  // OPENS ON OVERVIEW (2026-08-09, owner: "open up results at Overview").
  // It used to open on the season Report card, which meant the first thing you
  // saw after a slate was a season average rather than last night. Overview is
  // last night; the card is one click away and hasn't moved.
  const [subTab, setSubTab] = useState('overview')
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

  const topHit = topBoard.filter(r => r.got_hr === 1 || (r.actual_hr || 0) > 0).length

  const prettyDay = (d) => {
    try {
      return new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    } catch { return d }
  }

  // Rendered as an element, not a nested component, so the open/closed state
  // above survives every re-render of the page.
  const archiveBar = (
    <div style={{ marginBottom: 12 }}>
      {day === 'live' ? (
        <div style={{ display: 'flex', gap: 9, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 900, color: C.text }}>
            🌙 Tonight — live
          </span>
          <span style={{ fontSize: 10, color: C.text3 }}>
            grading updates as games finish
          </span>
          {gradedDays.length > 0 && (
            <button
              onClick={() => setArchiveOpen((v) => !v)}
              style={{
                marginLeft: 'auto', padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
                fontSize: 10.5, fontWeight: 800, fontFamily: NUM_FONT,
                border: `1px solid ${archiveOpen ? C.orange : C.border}`,
                background: archiveOpen ? `${C.orange}18` : 'transparent',
                color: archiveOpen ? C.orange : C.text2,
              }}
            >📅 {archiveOpen ? 'Close' : 'Browse'} past nights ({gradedDays.length})</button>
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
          <span style={{ fontSize: 10, color: C.text3 }}>
            graded and final — only this tab moved, everything else is still on tonight
          </span>
          <button
            onClick={() => { setDay('live'); setArchiveOpen(false) }}
            style={{
              marginLeft: 'auto', padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
              fontSize: 10.5, fontWeight: 800, fontFamily: NUM_FONT,
              border: `1px solid ${C.orange}`, background: `${C.orange}22`, color: C.orange,
            }}
          >← Back to tonight</button>
          <button
            onClick={() => setArchiveOpen((v) => !v)}
            style={{
              padding: '4px 12px', borderRadius: 999, cursor: 'pointer',
              fontSize: 10.5, fontWeight: 800, fontFamily: NUM_FONT,
              border: `1px solid ${C.border}`, background: 'transparent', color: C.text2,
            }}
          >📅 Pick another night</button>
        </div>
      )}

      {archiveOpen && gradedDays.length > 0 && (
        <div style={{
          marginTop: 8, background: C.bg2, border: `1px solid ${C.border}`,
          borderRadius: 11, padding: '10px 13px',
        }}>
          <div style={{ fontSize: 10.5, color: C.text3, lineHeight: 1.55, marginBottom: 8 }}>
            <b style={{ color: C.text2 }}>What this answers:</b> what a previous night actually
            graded out to. Picking one moves <b style={{ color: C.text2 }}>only this tab</b> — the
            Games board and every other page stay on tonight&apos;s slate.
          </div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', maxHeight: 190, overflowY: 'auto' }}>
            {gradedDays.map((d) => (
              <button
                key={d}
                onClick={() => { setDay(d); setArchiveOpen(false) }}
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

  if (!slots.length && !homers.length) {
    return (
      <div>
        <PanelTitle title="Results" sub="Nightly grading" />
        {archiveBar}
        <Empty text={
          dayState === 'loading' ? 'Loading that day…'
            : day !== 'live' ? `No graded file published for ${day}.`
            : 'No graded results yet tonight — games haven’t started or nothing has been graded.'
        } />
      </div>
    )
  }

  return (
    <div>
      <PanelTitle
        title="Results"
        sub={`${date} · ${slots.length} slots · ${allRows.length} unique`}
        right={
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <Chip color={C.green}>{homers.length} HRs on sheet</Chip>
            {topHit > 0 && <Chip color={C.orange}>{topHit}/{topBoard.length} Top Board</Chip>}
          </div>
        }
      />

      {archiveBar}

      {/* SUB-NAV, in two labelled groups (2026-08-09). Nine equal-looking
          pills hid the single most confusing thing about this tab: three of
          them followed the day picker and four ignored it. The split says it
          once, up front, instead of nine times in nine captions. */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 4, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 8.5, color: C.text3, fontWeight: 900, letterSpacing: '.1em', fontFamily: NUM_FONT }}>
          THIS NIGHT
        </span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <TabBtn active={subTab === 'overview'} onClick={() => setSubTab('overview')}>📊 Overview</TabBtn>
          <TabBtn active={subTab === 'pitcher'} onClick={() => setSubTab('pitcher')}>⚾ Pitchers</TabBtn>
          <TabBtn active={subTab === 'pairs'} onClick={() => setSubTab('pairs')}>🔗 Pairs & Pools</TabBtn>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 8.5, color: C.text3, fontWeight: 900, letterSpacing: '.1em', fontFamily: NUM_FONT }}>
          ALL SEASON
        </span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <TabBtn active={subTab === 'card'} onClick={() => setSubTab('card')}>🧾 Report card</TabBtn>
          <TabBtn active={subTab === 'record'} onClick={() => setSubTab('record')}>👤 Track record</TabBtn>
          <TabBtn active={subTab === 'signals'} onClick={() => setSubTab('signals')}>🔬 Signals</TabBtn>
          <TabBtn active={subTab === 'pl'} onClick={() => setSubTab('pl')}>🌙 P/L</TabBtn>
        </div>
      </div>

      {/* One plain-English line for whatever is selected. */}
      <div style={{ fontSize: 10.5, color: C.text3, margin: '-2px 0 12px', lineHeight: 1.55 }}>
        <b style={{ color: C.text2 }}>What this answers:</b>{' '}
        {{
          overview: 'how the night went — did the picks do the jobs they were picked for, who delivered, and what got away.',
          pitcher: 'did the arms we called weak actually give it up — and which arm burned us without a flag.',
          pairs: 'how the bot’s pairs and pools graded out.',
          card: 'is the model any good, all season — letter grades, records and trust curves. Always the last complete night; the archive browser does not move it.',
          record: 'which players the bot has been right about over every graded day. Spans the whole archive.',
          signals: 'is each badge on this site worth anything — every flag graded against the archive.',
          pl: 'what the archive would have returned at flat stakes, in moons (1 moon = 1 unit, never dollars).',
        }[subTab]}
      </div>

      {/* OVERVIEW — takeaways first (2026-08-08, "less charts, more things
          to understand and take from"). The page now leads with computed
          SENTENCES — what tonight actually said, in words a bettor can act
          on — and demotes the heavier panels behind honest toggles. The
          numbered flow stays, but every number opens with its sentence. */}
      {subTab === 'overview' && (() => {
        const judge = slots.filter((r) => (r.actual_ab || 0) > 0)
        const withJob = judge.filter((r) => pickJob(r))
        const didJob = withJob.filter((r) => pickJob(r)?.did).length
        const baseHit = judge.filter((r) => (r.actual_hits || 0) >= 1).length
        const hrOnly = judge.filter((r) => r.got_hr === 1 || (r.actual_hr || 0) > 0).length
        const multi = judge.filter((r) => (r.actual_hits || 0) >= 2 || (r.actual_hr || 0) >= 2).length
        const stillLive = slots.filter((r) => r.is_final !== 1).length
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
        const Take = ({ col, children }) => (
          <div style={{ display: 'flex', gap: 9, alignItems: 'baseline' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: col, flexShrink: 0, position: 'relative', top: -1 }} />
            <span style={{ fontSize: 12, color: C.text2, lineHeight: 1.65, minWidth: 0 }}>{children}</span>
          </div>
        )
        // The takeaway sentences — each only renders when its data exists.
        const takes = []
        if (!judge.length) {
          takes.push(
            <Take key="none" col={C.text3}>
              Nothing to grade yet — no pick has recorded an at-bat. Sentences appear here as the night fills in.
            </Take>,
          )
        } else {
          if (withJob.length) {
            const p = (100 * didJob) / withJob.length
            takes.push(
              <Take key="job" col="#4ade80">
                The picks cleared <B col="#4ade80">{didJob} of {withJob.length}</B> of their own bars
                (<B col="#4ade80">{p.toFixed(0)}%</B>) — a HIT pick needed a hit, an HRR pick 2+ H+R+RBI;
                nobody here is graded on homers he wasn&apos;t picked for.
              </Take>,
            )
          }
          if (runDiff != null) {
            const hot = runDiff >= 5, cold = runDiff <= -5
            takes.push(
              <Take key="run" col={hot ? C.orange : cold ? '#60A5FA' : C.text2}>
                The model ran <B col={hot ? C.orange : cold ? '#60A5FA' : C.text}>{hot ? 'hot' : cold ? 'cold' : 'right on'}</B>{' '}
                {hot || cold ? 'against' : ''} its season base — <B>{tonightBase.toFixed(0)}%</B> of picks got a base hit
                vs <B>{seasonBase.toFixed(1)}%</B> lifetime.
                {cold ? ' One night, not a verdict — the base is the number to trust.' : ''}
              </Take>,
            )
          }
          if (bestLane) {
            const p = (100 * bestLane.did) / bestLane.n
            takes.push(
              <Take key="best" col={bestLane.color}>
                <B col={bestLane.color}>{bestLane.label}</B> picks cleared <B col={bestLane.color}>{bestLane.did} of {bestLane.n}</B>{' '}
                ({p.toFixed(0)}%) — {p >= 65 ? 'the reliable lane again' : 'the night’s strongest lane'}.
              </Take>,
            )
          }
          if (worstLane && (100 * worstLane.did) / worstLane.n < 50 && worstLane.role !== bestLane?.role) {
            takes.push(
              <Take key="worst" col={C.text3}>
                <B col={worstLane.color}>{worstLane.label}</B> went <B>{worstLane.did} of {worstLane.n}</B> — the lane to be
                patient with tonight; its bar is {worstLane.job}.
              </Take>,
            )
          }
          if (capTotal > 0) {
            takes.push(
              <Take key="cap" col="#38bdf8">
                <B col="#38bdf8">{capCaught}</B> of the slate&apos;s <B>{capTotal}</B> home runs were somewhere on the sheet
                (<B col="#38bdf8">{capPct.toFixed(0)}%</B>) — {capPct >= 70 ? 'a wide net on a night it mattered' : capPct >= 50 ? 'a decent net' : 'a leaky night for the net'}
                {missedList.length ? <> ; the other <B col="#f87171">{missedList.length}</B> never made it (list below)</> : ''}.
              </Take>,
            )
          }
          if (multi > 0) {
            takes.push(
              <Take key="multi" col="#FCD34D">
                <B col="#FCD34D">{multi}</B> pick{multi > 1 ? 's' : ''} put up a multi-hit or multi-HR line — the loudest
                individual night{multi > 1 ? 's' : ''} on the sheet.
              </Take>,
            )
          }
          if (day === 'live' && stillLive > 0) {
            takes.push(
              <Take key="live" col={C.cyan}>
                <B col={C.cyan}>{stillLive}</B> slot{stillLive > 1 ? 's are' : ' is'} still live — every sentence above
                moves until the last out.
              </Take>,
            )
          }
        }

        const Flow = ({ num, title, note }) => (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '20px 0 8px', paddingBottom: 5, borderBottom: `1px solid ${C.border}` }}>
            <span style={{ fontFamily: NUM_FONT, fontSize: 11, fontWeight: 900, color: C.orange, border: `1px solid ${C.orange}55`, borderRadius: 999, padding: '1px 8px' }}>{num}</span>
            <span style={{ fontSize: 12.5, fontWeight: 900 }}>{title}</span>
            <span style={{ fontSize: 9.5, color: C.text3 }}>{note}</span>
          </div>
        )
        const Tile = ({ label, value, sub, col }) => (
          <div style={{ flex: '1 1 130px', minWidth: 0, background: C.bg2, border: `1px solid ${C.border}`, borderTop: `2px solid ${col}`, borderRadius: 10, padding: '8px 12px' }}>
            <div style={{ fontSize: 8, color: C.text3, fontWeight: 800, letterSpacing: '.09em', fontFamily: NUM_FONT, textTransform: 'uppercase' }}>{label}</div>
            <div style={{ fontSize: 19, fontWeight: 900, fontFamily: NUM_FONT, color: col }}>{value}</div>
            <div style={{ fontSize: 8.5, color: C.text3, fontFamily: NUM_FONT }}>{sub}</div>
          </div>
        )
        // A demoted panel: closed by default, honest label about what's inside.
        const Fold = ({ label, children }) => (
          <details style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 11, marginBottom: 8 }}>
            <summary style={{ padding: '8px 13px', fontSize: 10.5, fontWeight: 800, cursor: 'pointer', color: C.text2 }}>{label}</summary>
            <div style={{ padding: '4px 10px 10px' }}>{children}</div>
          </details>
        )

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

          {/* 2 · THE NIGHT IN NUMBERS — the tiles, capture detail folded */}
          <Flow num="2" title="The night in numbers" note="the same story as the sentences, as tiles" />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
            <Tile label="Did its job" value={withJob.length ? `${((100 * didJob) / withJob.length).toFixed(0)}%` : '—'} sub={`${didJob}/${withJob.length} picks, own bars`} col="#4ade80" />
            <Tile label="Base hit" value={judge.length ? `${((100 * baseHit) / judge.length).toFixed(0)}%` : '—'} sub={`${baseHit}/${judge.length} of every pick`} col="#60A5FA" />
            <Tile label="If graded HR-only" value={judge.length ? `${((100 * hrOnly) / judge.length).toFixed(0)}%` : '—'} sub={`${hrOnly}/${judge.length} — the unfair yardstick`} col={C.orange} />
            <Tile label="Multi-hit / multi-HR" value={multi} sub="big individual nights" col="#FCD34D" />
            <Tile label="HR capture" value={`${capPct.toFixed(0)}%`} sub="slate homers on the sheet" col="#38bdf8" />
          </div>
          <Fold label="📡 Capture detail — the full net, caught vs missed">
            <CaptureBanner report={captureReport} uniqueReport={uniqueReport} />
          </Fold>

          {/* 3 · WHO DELIVERED — names stay visible; names are the takeaway */}
          <Flow num="3" title="Who delivered" note="homers first, then the multi-hit nights" />
          <HRHits homers={homers} />
          <MultiHitCluster slots={slots} />

          {/* 4 · THE LANES — sentence-sized lines, bars folded */}
          <Flow num="4" title="How each lane did" note="every category against its own bar, smallest samples included" />
          {laneList.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {laneList.map((l) => (
                <span key={l.role} title={`A ${l.label} pick's job is ${l.job}.`} style={{
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

          {/* 5 · MODEL CHECKS — all receipts, all folded */}
          <Flow num="5" title="Model checks" note="the receipts — open when you want to audit, skip when you just want the read" />
          <Fold label="🔬 Flags, slate summary and score audit — did the numbers mean anything tonight">
            <TrackingLegend slots={slots} />
            <ExpandedStats slots={slots} players={players} />
            <ScoreAudit slots={slots} players={players} />
          </Fold>

          {/* 6 · WHAT GOT AWAY — the sentence up top already counted them */}
          <Flow num="6" title="What got away" note="homers the sheet never had — the model's real misses" />
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

          {/* 7 · THE FULL GRADING TABLES. These used to render under EVERY
              sub-tab, so the season Report card came with the whole night's
              grading bolted to the bottom of it. They belong to the night, so
              they live inside the night's view — and behind a fold, because
              they are the deep version of everything above. */}
          <Flow num="7" title="The full tables" note="the same night at full depth — score calibration, every homer vs the board, every pick" />
          <Fold label="📋 Open the full grading tables">
            <ResultsDepth results={view} onPlayerClick={onPlayerClick} />
          </Fold>
        </>
        )
      })()}

      {/* PITCHERS */}
      {subTab === 'pitcher' && (
        <PitcherWeaknessDigest slots={slots} players={players} />
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
