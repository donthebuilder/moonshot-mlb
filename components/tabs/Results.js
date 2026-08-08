'use client'
import { useEffect, useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { gradedResultsUrl } from '../../lib/dataSource'
import { arr, n, clean } from '../../lib/player'
import { PanelTitle, Empty, Chip, Card } from '../ui'
import Backtest from './Backtest'
import ResultsDepth from './ResultsDepth'
import HRPitchProfile from '../HRPitchProfile'
import PickScorecard, { pickJob } from '../PickScorecard'
import { pillMeta } from '../../lib/pills'
import ScoreAudit from '../ScoreAudit'
import ReportCard from '../ReportCard'
import PlayerPickRecord from '../PlayerPickRecord'
import PLSimulator from '../PLSimulator'

// ── helpers ────────────────────────────────────────────────────────────────

const ROLE_EMOJI_COLORS = {
  '🧨': C.orange,
  '🔥': '#f97316',
  '🏁': '#22d3ee',
  '💠': '#38bdf8',
  '👀': '#a78bfa',
  '⚾': '#4ade80',
}

function roleColor(role) {
  const s = String(role || '')
  for (const [emoji, col] of Object.entries(ROLE_EMOJI_COLORS)) {
    if (s.includes(emoji)) return col
  }
  return C.text2
}

function roleEmoji(role) {
  const m = String(role || '').match(/^(\S+)/)
  return m ? m[1] : '—'
}

function pickLabel(pick) {
  const m = { TOP: '🏆 Top', HR: '🧨 HR', HRR: '🏁 HRR', HIT: '💠 Hit', CONTACT: '⚾ Contact', TOP15: '🏆 Top15' }
  return m[String(pick || '')] || pick || '—'
}

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

// ── Category performance bar ─────────────────────────────────────────────────

function CategoryBar({ slots }) {
  const cats = [
    { key: 'TOP15', label: '🏆 Top15', color: C.orange },
    { key: 'TOP',   label: '🔥 Top',   color: '#f97316' },
    { key: 'HR',    label: '🧨 HR',    color: C.orange },
    { key: 'HRR',   label: '🏁 HRR',   color: C.cyan },
    { key: 'HIT',   label: '💠 Hit',   color: '#38bdf8' },
    { key: 'CONTACT', label: '⚾ Con', color: '#4ade80' },
  ]
  if (!slots?.length) return null

  return (
    <Card style={{ padding: 0, marginBottom: 10, overflow: 'hidden' }}>
      <SectionHeader title="Category Performance" color={C.text3} />
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {cats.map(({ key, label, color }) => {
          const group = slots.filter(r => r.pick_type === key)
          if (!group.length) return null
          const hrCount = group.filter(r => si(r.got_hr) || si(r.actual_hr) > 0).length
          const hitCount = group.filter(r => si(r.actual_hits) >= 1).length
          const hrPct = (hrCount / group.length) * 100
          return (
            <div key={key}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: color, fontWeight: 700, minWidth: 68 }}>{label}</span>
                <MiniBar value={hrPct} color={color} />
                <span style={{ fontSize: 10, fontFamily: NUM_FONT, color: C.text2, minWidth: 50, textAlign: 'right' }}>
                  {hrCount}/{group.length} HR · {hitCount}H
                </span>
              </div>
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

// ── Pick row ─────────────────────────────────────────────────────────────────

function PickRow({ r, i, onPlayerClick }) {
  const gotHR = r.got_hr === 1 || (r.actual_hr || 0) > 0
  const gotHit = (r.actual_hits || 0) >= 1
  const multiHit = (r.actual_hits || 0) >= 2
  const rank = r.rank
  const role = r.final_hr_role || ''
  const col = roleColor(role)
  const pick = r.game_pick_role || r.pick_type || ''
  const job = pickJob(r)
  const spot = r.weak_spot_flag
  const aligned = (r.top_board_tags || []).some(t => String(t).includes('🧩'))
  const pills = (Array.isArray(r.signal_pills) ? r.signal_pills : []).slice(0, 2)
  const isFinal = r.is_final === 1

  return (
    <div
      onClick={() => onPlayerClick && onPlayerClick(r)}
      style={{
        display: 'grid',
        gridTemplateColumns: '28px 1fr auto auto',
        gap: 8,
        alignItems: 'center',
        padding: '9px 12px',
        borderTop: i ? `1px solid ${C.border}` : 'none',
        background: gotHR ? `${C.green}0d` : multiHit ? `${C.yellow}08` : 'transparent',
        cursor: onPlayerClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        {gotHR
          ? <span style={{ fontSize: 14 }}>✅</span>
          : multiHit
          ? <span style={{ fontSize: 12 }}>⭐</span>
          : rank
          ? <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>#{rank}</span>
          : <span style={{ fontSize: 11, color: C.border }}>·</span>}
      </div>

      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>{r.name}</span>
          {spot && <span title="Weak pitcher spot" style={{ fontSize: 11 }}>⭐</span>}
          {aligned && <span title="Aligned signals" style={{ fontSize: 11 }}>🧩</span>}
          <span style={{ fontSize: 10, color: C.text3 }}>{r.team}</span>
          {r.pitcher_name && <span style={{ fontSize: 10, color: C.text3 }}>vs {r.pitcher_name}</span>}
        </div>
        <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT, marginTop: 1, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ color: col }}>{roleEmoji(role)} {role.replace(/^\S+\s*/, '')}</span>
          {pills.map((p, pi) => <span key={pi} title={pillMeta(p).title} style={{ color: pillMeta(p).color }}>{p}</span>)}
          {gotHR && (r.actual_hr || 0) > 0 && (
            <span style={{ color: C.green, fontWeight: 700 }}>
              {r.actual_hr > 1 ? `${r.actual_hr} HR` : 'HR ✓'}
            </span>
          )}
          {!gotHR && gotHit && (
            <span style={{ color: C.yellow, fontWeight: 700 }}>
              {r.actual_hits > 1 ? `${r.actual_hits}H 🔥` : '1H'}
            </span>
          )}
        </div>
      </div>

      {/* The pick chip, and next to it whether he did THAT pick's job — not
          whether he homered. A HIT pick that singled gets a ✓ here even though
          the row has no green HR highlight, which is the whole point. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <span style={{
          fontSize: 9, padding: '2px 6px', borderRadius: 5,
          background: `${col}22`, color: col,
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
          fontFamily: NUM_FONT, whiteSpace: 'nowrap',
        }}>{pickLabel(pick)}</span>
        {job && isFinal && (
          <span
            title={job.did
              ? `Did its job — a ${job.label} pick needed ${job.job}, and he got it.`
              : `Missed — a ${job.label} pick needed ${job.job}.`}
            style={{
              fontSize: 10, fontWeight: 900, fontFamily: NUM_FONT,
              color: job.did ? job.color : C.border,
            }}
          >{job.did ? '✓' : '·'}</span>
        )}
      </div>

      <div style={{ textAlign: 'right', minWidth: 56 }}>
        {isFinal ? (
          <div style={{ fontFamily: NUM_FONT, fontSize: 10, color: C.text3, lineHeight: 1.6 }}>
            {(r.actual_hits || 0) > 0
              ? <div style={{ color: C.text2 }}>{r.actual_hits}H {r.actual_tb}TB</div>
              : null}
            {((r.actual_runs || 0) > 0 || (r.actual_rbi || 0) > 0)
              ? <div>{r.actual_runs}R {r.actual_rbi}RBI</div>
              : null}
            {!(r.actual_hits > 0) && !(r.actual_runs > 0) && !gotHR
              ? <div style={{ color: C.border }}>0-fer</div>
              : null}
          </div>
        ) : (
          <span style={{ fontSize: 10, color: C.cyan }}>Live</span>
        )}
      </div>
    </div>
  )
}

// ── Main ─────────────────────────────────────────────────────────────────────

// ── HR by pitch type ──────────────────────────────────────────────────────────
//
// A caveat that has to lead, because the obvious reading of this tab is wrong:
// THIS IS NOT THE PITCH TONIGHT'S HOMER WAS HIT OFF. That isn't published.
// Searching results_live.json for "pitch_type" returns zero hits — a homer
// entry carries longest_ft, distances_ft, max_ev_mph and launch_angle, and
// nothing about what was thrown. graded_slots has pitcher_throws and
// pitcher_fb_rate, which are pre-game scouting fields, not the pitch.
//
// What this shows is each of tonight's HR hitters against his own HR-by-pitch
// history, from the spray_chart in his detail file. That file runs a day or two
// behind the live slate, so tonight's homer isn't in it yet either — it appears
// retroactively once the detail files rebuild.
//
// It's still the right thing to look at after a slate: "he went deep tonight,
// and he has four this season off the fastball" is the question this answers.
// It just isn't "he hit a slider tonight", and the panel says so out loud.
function HRByPitch({ homers = [], captureReport, players = [], pick, setPick }) {
  const entries = useMemo(() => {
    const list = arr(captureReport?.all_homer_entries).length
      ? arr(captureReport.all_homer_entries)
      : homers
    const byId = new Map()
    for (const p of players) {
      const id = p?.player_id ?? p?.id
      if (id != null) byId.set(String(id), p)
    }
    return list.map((h) => ({
      id: h?.player_id ?? null,
      name: clean(h?.name, '—'),
      team: clean(h?.team, ''),
      hr: si(h?.hr) || 1,
      ft: si(h?.longest_ft),
      ev: sf(h?.max_ev_mph),
      la: sf(h?.launch_angle),
      slate: h?.player_id != null ? byId.get(String(h.player_id)) : null,
    })).sort((a, b) => b.ft - a.ft)
  }, [homers, captureReport, players])

  const selected = useMemo(
    () => entries.find((e) => String(e.id) === String(pick)) || entries[0] || null,
    [entries, pick],
  )

  if (!entries.length) return <Empty text="No home runs on tonight's slate yet." />

  return (
    <div>
      <Card style={{ padding: '10px 14px', marginBottom: 10 }}>
        <div style={{ fontSize: 11, color: C.text2, lineHeight: 1.6 }}>
          <b style={{ color: C.orange }}>This is not the pitch tonight&apos;s homer was hit off.</b>{' '}
          The results feed doesn&apos;t record that — a homer entry carries distance, exit velocity and
          launch angle, and nothing about what was thrown. What&apos;s below is each hitter&apos;s{' '}
          <b style={{ color: C.text }}>season</b> home-run breakdown by pitch type, from his batted-ball
          file, which runs a day or two behind. Tonight&apos;s homer will show up in it once the detail
          files rebuild.
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
        {entries.map((e) => {
          const on = selected && String(selected.id) === String(e.id)
          return (
            <button
              key={e.id ?? e.name}
              onClick={() => setPick(e.id)}
              title={`${e.ft} ft · ${e.ev.toFixed(1)} mph · ${e.la.toFixed(0)}°`}
              style={{
                padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
                fontSize: 10.5, fontWeight: 700, fontFamily: NUM_FONT,
                border: `1px solid ${on ? C.orange : C.border}`,
                background: on ? 'rgba(249,115,22,.12)' : 'transparent',
                color: on ? C.orange : C.text3,
              }}
            >
              {e.name.split(' ').slice(-1)[0]}
              <span style={{ opacity: .7 }}> {e.ft}ft</span>
            </button>
          )
        })}
      </div>

      {selected && (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 800 }}>{selected.name}</span>
            <span style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT }}>
              {selected.team} · tonight: {selected.hr} HR · {selected.ft} ft ·{' '}
              {selected.ev.toFixed(1)} mph · {selected.la.toFixed(0)}°
            </span>
          </div>
          {selected.slate
            ? <HRPitchProfile player={selected.slate} />
            : (
              <div style={{ fontSize: 11, color: C.text3, padding: '8px 0', lineHeight: 1.6 }}>
                {selected.name} isn&apos;t on the currently loaded slate, so his batted-ball file
                isn&apos;t available to break down. This happens when Results is showing a different
                day than the Games board.
              </div>
            )}
        </>
      )}
    </div>
  )
}

export default function Results({ results, backtest, players = [], onPlayerClick }) {
  const [tab, setTab] = useState('hr')
  // Receipts-first (2026-08-06): the Report card IS the product — it opens
  // the tab. Overview and the rest are one click away.
  const [subTab, setSubTab] = useState('card')
  const [pitchPick, setPitchPick] = useState(null)

  // DAY PICKER.
  //
  // live_results_tracker writes graded_results_<date>.json every night and
  // publish_data.sh keeps the last 150 on the branch — nine are there today.
  // Nothing read them, so Results could only ever show the current day and
  // last night's card was gone by morning.
  //
  // The date list comes from backtest_summary.per_day rather than by probing
  // for files, so the picker only ever offers days that actually graded.
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

  const topBoard = useMemo(() => slots.filter(r => r.rank != null).sort((a, b) => a.rank - b.rank), [slots])
  const hrRows = useMemo(() => slots.filter(r => r.got_hr === 1 || (r.actual_hr || 0) > 0), [slots])
  const allRows = useMemo(() => {
    const seen = new Set()
    return [...slots]
      .sort((a, b) => (b.top_board_score_v2 || 0) - (a.top_board_score_v2 || 0))
      .filter(r => { if (seen.has(r.player_id)) return false; seen.add(r.player_id); return true })
  }, [slots])

  const topHit = topBoard.filter(r => r.got_hr === 1 || (r.actual_hr || 0) > 0).length

  const pickRows = tab === 'board' ? topBoard : tab === 'hr' ? hrRows : allRows

  const DayPicker = () => (
<div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
      <span style={{ fontSize: 9, color: C.text3, textTransform: 'uppercase', letterSpacing: '.07em' }}>Day</span>
      <TabBtn active={day === 'live'} onClick={() => setDay('live')}>Live / today</TabBtn>
      {gradedDays.map((d) => (
        <TabBtn key={d} active={day === d} onClick={() => setDay(d)}>{d.slice(5)}</TabBtn>
      ))}
      {dayState === 'loading' && (
        <span style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>loading…</span>
      )}
      {day !== 'live' && (
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          graded final · picks and slate shown are that day&apos;s
        </span>
      )}
    </div>
  )

  if (!slots.length && !homers.length) {
    return (
      <div>
        <PanelTitle title="Results" sub="Nightly grading" />
        <DayPicker />
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

      <DayPicker />

      {day !== 'live' && (
        <Card style={{ padding: '8px 13px', marginBottom: 10 }}>
          <div style={{ fontSize: 10.5, color: C.text3, lineHeight: 1.55 }}>
            Showing <b style={{ color: C.text2 }}>{date}</b>, graded and final. The Games board and
            every other tab are still on tonight&apos;s slate — only this tab moved. Anything here
            that needs a slate row (the Pitchers tab, HR by pitch) will match fewer players on an
            older day, and says so where it happens.
          </div>
        </Card>
      )}

      {/* sub-nav */}
      <details style={{ marginBottom: 10, background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 10 }}>
        <summary style={{ padding: '8px 13px', fontSize: 11, fontWeight: 800, cursor: 'pointer', color: C.text2 }}>
          📖 How to read Results <span style={{ fontSize: 9, color: C.text3, fontWeight: 400 }}>— 60-second walkthrough</span>
        </summary>
        <div style={{ padding: '2px 14px 12px', fontSize: 11, color: C.text2, lineHeight: 1.75 }}>
          <b style={{ color: C.orange }}>Start with the Report Card</b> — the headline strip is the whole story:
          the season record on every pick, and the <b>since-the-lock</b> record beside it, which is the honest one
          (those picks froze at first pitch and could never be edited). Letter grades compare each night to the
          bot&apos;s OWN baselines — a 20% HR night is an A while a 55% HIT night is a D, because the bars differ.
          <br /><b style={{ color: '#38bdf8' }}>Pitchers</b> answers &quot;did the arms we targeted give it up&quot; —
          🎯 called it, 💥 burned us unflagged (the model&apos;s real misses), 🧱 flag didn&apos;t cash.
          <br /><b style={{ color: '#a78bfa' }}>Picks</b> grades every pick against its own bar — a HIT pick that
          singled counts even without a homer; grading everything on homers is the classic mistake this page avoids.
          <br /><b style={{ color: '#4ade80' }}>Track record</b> ignores the day picker entirely: it&apos;s every
          player the bot has ever designated, per category, with rates only shown at 3+ picks.
          <br /><span style={{ color: C.text3 }}>The day picker up top moves ONLY this tab. A ≈ next to old records
          means reconstructed from rate×pool — the older file format didn&apos;t store counts. And everywhere on this
          site: the ❓ pill under the tabs explains the page you&apos;re on.</span>
        </div>
      </details>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <TabBtn active={subTab === 'overview'} onClick={() => setSubTab('overview')}>📊 Overview</TabBtn>
        <TabBtn active={subTab === 'card'} onClick={() => setSubTab('card')}>🧾 Report card</TabBtn>
        <TabBtn active={subTab === 'pitcher'} onClick={() => setSubTab('pitcher')}>⚾ Pitchers</TabBtn>
        <TabBtn active={subTab === 'pitchtype'} onClick={() => setSubTab('pitchtype')}>🎯 HR by pitch</TabBtn>
        <TabBtn active={subTab === 'pairs'} onClick={() => setSubTab('pairs')}>🔗 Pairs & Pools</TabBtn>
        <TabBtn active={subTab === 'picks'} onClick={() => setSubTab('picks')}>📋 Picks</TabBtn>
        <TabBtn active={subTab === 'record'} onClick={() => setSubTab('record')}>👤 Track record</TabBtn>
        <TabBtn active={subTab === 'pl'} onClick={() => setSubTab('pl')}>💰 P/L</TabBtn>
      </div>

      {/* ONE LINE OF ORIENTATION under the sub-nav — this tab grew seven
          views and "great but confusing" was fair. Each view's one-line job,
          keyed to whatever is selected, so you always know what you're
          looking at and what the picker above does or doesn't affect. */}
      <div style={{ fontSize: 10, color: C.text3, margin: '-2px 0 10px', lineHeight: 1.5, fontFamily: NUM_FONT }}>
        {{
          overview: '📊 Tonight graded as it happens: capture rate, multi-hit days, score audit. Follows the day picker.',
          pitcher: '⚾ Which arms gave it up tonight, joined to the slate. Follows the day picker.',
          pitchtype: '🎯 Each HR hitter against his own HR-by-pitch history — NOT the pitch it was hit off (unpublished). Follows the day picker.',
          pairs: '🔗 How the bot’s pairs and pools graded tonight. Follows the day picker.',
          picks: '📋 Every pick with its result — and “Did its job” grades each against its own category. Follows the day picker.',
          record: '👤 Every player the bot has ever picked, per category, across all 39 archived days. IGNORES the day picker — it spans everything.',
          pl: '💰 The whole archive replayed at your odds, flat stakes. IGNORES the day picker — it spans everything.',
        }[subTab]}
      </div>

      {/* OVERVIEW */}
      {subTab === 'overview' && (
        <>
          <CaptureBanner report={captureReport} uniqueReport={uniqueReport} />
          <TrackingLegend slots={slots} />
          <ExpandedStats slots={slots} players={players} />
          <HRHits homers={homers} />
          <MultiHitCluster slots={slots} />
          <CategoryBar slots={slots} />
          <ScoreAudit slots={slots} players={players} />
          <MissedHRs report={captureReport} />
        </>
      )}

      {/* PITCHERS */}
      {subTab === 'pitcher' && (
        <PitcherWeaknessDigest slots={slots} players={players} />
      )}

      {/* HR BY PITCH TYPE */}
      {subTab === 'pitchtype' && (
        <HRByPitch homers={homers} captureReport={captureReport} players={players} pick={pitchPick} setPick={setPitchPick} />
      )}

      {/* PAIRS & POOLS */}
      {subTab === 'pairs' && (
        <PairsResults pairPoolResults={pairPoolResults} />
      )}

      {/* PER-PLAYER TRACK RECORD — spans every graded day, so it ignores the
          day picker above on purpose. */}
      {subTab === 'record' && (
        <PlayerPickRecord players={players} backtest={backtest} onPlayerClick={onPlayerClick} />
      )}

      {/* P/L — the archive at your odds. Spans all graded days, ignores the
          day picker like Track record does. */}
      {subTab === 'pl' && <PLSimulator />}

      {subTab === 'card' && <ReportCard backtest={backtest} />}

      {/* PICKS */}
      {subTab === 'picks' && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <TabBtn active={tab === 'hr'} onClick={() => setTab('hr')}>✅ HR Scorers ({hrRows.length})</TabBtn>
            <TabBtn active={tab === 'board'} onClick={() => setTab('board')}>🏆 Top Board ({topBoard.length})</TabBtn>
            <TabBtn active={tab === 'all'} onClick={() => setTab('all')}>📋 All ({allRows.length})</TabBtn>
            <TabBtn active={tab === 'job'} onClick={() => setTab('job')}>🎯 Did its job</TabBtn>
          </div>

          {tab === 'job' && (
            <PickScorecard slots={slots} backtest={backtest} onPlayerClick={onPlayerClick} />
          )}

          {tab !== 'job' && (pickRows.length === 0
            ? <Empty text={tab === 'hr' ? 'No HR scorers in this pick set.' : 'No picks in this view.'} />
            : (
              <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
                {pickRows.map((r, i) => (
                  <PickRow key={r.player_id || i} r={r} i={i} onPlayerClick={onPlayerClick} />
                ))}
              </div>
            )
          )}
        </>
      )}

      {/* Every pick against the outcome it was picked FOR, not against home
          runs. Reads `view`, NOT `results` — it was hardwired to tonight's
          file, so the day picker up top changed every section except this
          one, which kept showing live zeros under an archived day's header.
          The whole tab follows the picker now, this block included. */}
      <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
        <ResultsDepth results={view} onPlayerClick={onPlayerClick} />
      </div>

      {/* The archive. Everything above is one slate; this is whether any of
          it has worked over the graded days -- the only screen on the site
          that scores the model instead of the players. */}
      {backtest && (
        <div style={{ marginTop: 26, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
          <Backtest backtest={backtest} />
        </div>
      )}
    </div>
  )
}
