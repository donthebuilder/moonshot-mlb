'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT } from '../../lib/theme'
import { arr, n, clean } from '../../lib/player'
import { PanelTitle, Empty, Chip, Card } from '../ui'
import Backtest from './Backtest'
import ResultsDepth from './ResultsDepth'

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

function SectionHeader({ title, color = C.text3 }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 800, color, textTransform: 'uppercase', letterSpacing: '0.07em', padding: '10px 14px 6px', background: C.bg3, borderBottom: `1px solid ${C.border}` }}>
      {title}
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

function ExpandedStats({ slots }) {
  if (!slots?.length) return null
  const seen = new Set()
  const unique = slots.filter(r => {
    if (seen.has(r.player_id)) return false
    seen.add(r.player_id)
    return true
  })
  const avg = (key) => {
    const vals = unique.map(r => sf(r[key])).filter(v => v > 0)
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
  }
  const avgHrScore = avg('hr_score')
  const avgHrw = avg('hrw_score')
  const total375 = unique.reduce((sum, r) => sum + si(r.recent_375_num ?? r.dist_375_count), 0)
  const totalBarrels = unique.reduce((sum, r) => sum + si(r.barrel_count), 0)

  return (
    <Card style={{ padding: 0, marginBottom: 10, overflow: 'hidden' }}>
      <SectionHeader title="📈 Slate Stat Summary" color={C.text3} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: '10px 14px' }}>
        <div>
          <div style={{ fontSize: 10, color: C.text3 }}>Avg HR Score</div>
          <span style={{ fontFamily: NUM_FONT, fontWeight: 800, fontSize: 15 }}>{avgHrScore.toFixed(1)}</span>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.text3 }}>Avg HRW</div>
          <span style={{ fontFamily: NUM_FONT, fontWeight: 800, fontSize: 15 }}>{avgHrw.toFixed(1)}</span>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.text3 }}>Total 375+ (slate)</div>
          <span style={{ fontFamily: NUM_FONT, fontWeight: 800, fontSize: 15, color: C.orange }}>{total375}</span>
        </div>
        <div>
          <div style={{ fontSize: 10, color: C.text3 }}>Unique players tracked</div>
          <span style={{ fontFamily: NUM_FONT, fontWeight: 800, fontSize: 15 }}>{unique.length}</span>
        </div>
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

function PitcherWeaknessDigest({ slots }) {
  const pitchers = useMemo(() => {
    if (!slots?.length) return []
    const map = {}
    for (const r of slots) {
      const name = r.pitcher_name || r.opposing_pitcher || null
      if (!name) continue
      if (!map[name]) {
        map[name] = {
          name,
          throws: r.pitcher_throws || '?',
          hr9: sf(r.pitcher_hr9 ?? r.pitcher_hr_per9 ?? r.pitcher_hr_allowed),
          whip: sf(r.pitcher_whip),
          fb_rate: sf(r.pitcher_fb_rate),
          weak_side: r.pitcher_weak_side || '',
          picks: [],
          hr_allowed_today: 0,
          hit_allowed_today: 0,
        }
      }
      map[name].picks.push(r)
      if (si(r.actual_hr) > 0) map[name].hr_allowed_today += si(r.actual_hr)
      if (si(r.actual_hits) > 0) map[name].hit_allowed_today += si(r.actual_hits)
    }
    return Object.values(map)
      .filter(p => p.picks.length > 0)
      .sort((a, b) => b.hr_allowed_today - a.hr_allowed_today || b.picks.length - a.picks.length)
  }, [slots])

  if (!pitchers.length) return null

  return (
    <Card style={{ padding: 0, marginBottom: 10, overflow: 'hidden' }}>
      <SectionHeader title="⚾ Pitcher Results — Model vs Actual" color="#38bdf8" />
      <div style={{ padding: '8px 0' }}>
        {pitchers.map((p, i) => {
          const hrPct = p.picks.length ? (p.picks.filter(r => si(r.actual_hr) > 0).length / p.picks.length) * 100 : 0
          const isWeak = p.weak_side || (p.hr9 >= 1.2) || (p.whip >= 1.30)
          return (
            <div key={i} style={{
              padding: '8px 14px',
              borderTop: i ? `1px solid ${C.border}` : 'none',
              background: p.hr_allowed_today >= 2 ? `${C.red}08` : 'transparent',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{p.name}</span>
                <span style={{ fontSize: 10, color: C.text3 }}>{p.throws}HP</span>
                {isWeak && <Chip color="#38bdf8" style={{ fontSize: 9 }}>Weak Pitcher</Chip>}
                {p.weak_side && <span style={{ fontSize: 10, color: '#a78bfa' }}>vs {p.weak_side}</span>}
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 10, color: C.text3, fontFamily: NUM_FONT }}>
                  <span>Picks: {p.picks.length}</span>
                  {p.hr9 > 0 && <span style={{ marginLeft: 8 }}>HR/9: <span style={{ color: p.hr9 >= 1.2 ? C.red : C.text2 }}>{p.hr9.toFixed(2)}</span></span>}
                  {p.whip > 0 && <span style={{ marginLeft: 8 }}>WHIP: <span style={{ color: p.whip >= 1.30 ? C.red : C.text2 }}>{p.whip.toFixed(2)}</span></span>}
                  {p.fb_rate > 0 && <span style={{ marginLeft: 8 }}>FB%: {(p.fb_rate * 100).toFixed(0)}%</span>}
                </div>
                <div style={{ fontSize: 10, fontFamily: NUM_FONT }}>
                  <span style={{ color: p.hr_allowed_today > 0 ? C.green : C.text3 }}>Today: {p.hr_allowed_today} HR · {p.hit_allowed_today} H</span>
                  {p.picks.length > 0 && <span style={{ marginLeft: 8, color: barColor(hrPct) }}>{hrPct.toFixed(0)}% HR rate</span>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
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
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <MiniBar value={hitRatio * 100} color={col} />
                    <span style={{ fontSize: 10, fontFamily: NUM_FONT, color: col, minWidth: 40 }}>{si(pool.hr_count)}/{si(pool.total_count)} HR</span>
                    <span style={{ fontSize: 10, color: C.text3 }}>{(pool.label || '').replace('4-MAN HR POOL ', '').replace('6-MAN HR POOL ', '')}</span>
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

  return (
    <Card style={{ padding: 0, marginBottom: 10, overflow: 'hidden' }}>
      <SectionHeader title={`⭐ Multi-Hit / Multi-HR Day (${multis.length})`} color={C.yellow} />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '10px 12px' }}>
        {multis.map((r, i) => {
          const col = si(r.actual_hr) >= 2 ? C.yellow : C.green
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px',
              borderRadius: 8, background: `${col}18`, border: `1px solid ${col}44`,
            }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{r.name}</span>
              <span style={{ fontSize: 10, color: C.text3 }}>{r.team}</span>
              <span style={{ fontSize: 10, fontWeight: 800, color: col, fontFamily: NUM_FONT }}>
                {si(r.actual_hits)}H{si(r.actual_hr) > 0 ? ` · ${si(r.actual_hr)}HR` : ''}{si(r.actual_tb) > 0 ? ` · ${si(r.actual_tb)}TB` : ''}
              </span>
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
          {pills.map((p, pi) => <span key={pi}>{p}</span>)}
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

      <div>
        <span style={{
          fontSize: 9, padding: '2px 6px', borderRadius: 5,
          background: `${col}22`, color: col,
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
          fontFamily: NUM_FONT, whiteSpace: 'nowrap',
        }}>{pickLabel(pick)}</span>
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

export default function Results({ results, backtest, onPlayerClick }) {
  const [tab, setTab] = useState('hr')
  const [subTab, setSubTab] = useState('overview')

  const slots = useMemo(() => {
    if (!results) return []
    if (Array.isArray(results.graded_slots)) return results.graded_slots
    if (Array.isArray(results)) return results
    if (Array.isArray(results.results)) return results.results
    return []
  }, [results])

  const homers = useMemo(() => Array.isArray(results?.merged_homers) ? results.merged_homers : [], [results])
  const captureReport = results?.hr_capture_report || null
  const uniqueReport = results?.unique_player_report || null
  const pairPoolResults = results?.pair_pool_results || null
  const date = String(results?.date || results?.label || 'Today')

  const topBoard = useMemo(() => slots.filter(r => r.rank != null).sort((a, b) => a.rank - b.rank), [slots])
  const hrRows = useMemo(() => slots.filter(r => r.got_hr === 1 || (r.actual_hr || 0) > 0), [slots])
  const allRows = useMemo(() => {
    const seen = new Set()
    return [...slots]
      .sort((a, b) => (b.top_board_score_v2 || 0) - (a.top_board_score_v2 || 0))
      .filter(r => { if (seen.has(r.player_id)) return false; seen.add(r.player_id); return true })
  }, [slots])

  const topHit = topBoard.filter(r => r.got_hr === 1 || (r.actual_hr || 0) > 0).length

  if (!slots.length && !homers.length) return <Empty text="No graded results yet." />

  const pickRows = tab === 'board' ? topBoard : tab === 'hr' ? hrRows : allRows

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

      {/* sub-nav */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <TabBtn active={subTab === 'overview'} onClick={() => setSubTab('overview')}>📊 Overview</TabBtn>
        <TabBtn active={subTab === 'pitcher'} onClick={() => setSubTab('pitcher')}>⚾ Pitchers</TabBtn>
        <TabBtn active={subTab === 'pairs'} onClick={() => setSubTab('pairs')}>🔗 Pairs & Pools</TabBtn>
        <TabBtn active={subTab === 'picks'} onClick={() => setSubTab('picks')}>📋 Picks</TabBtn>
      </div>

      {/* OVERVIEW */}
      {subTab === 'overview' && (
        <>
          <CaptureBanner report={captureReport} uniqueReport={uniqueReport} />
          <TrackingLegend slots={slots} />
          <ExpandedStats slots={slots} />
          <HRHits homers={homers} />
          <MultiHitCluster slots={slots} />
          <CategoryBar slots={slots} />
          <MissedHRs report={captureReport} />
        </>
      )}

      {/* PITCHERS */}
      {subTab === 'pitcher' && (
        <PitcherWeaknessDigest slots={slots} />
      )}

      {/* PAIRS & POOLS */}
      {subTab === 'pairs' && (
        <PairsResults pairPoolResults={pairPoolResults} />
      )}

      {/* PICKS */}
      {subTab === 'picks' && (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <TabBtn active={tab === 'hr'} onClick={() => setTab('hr')}>✅ HR Scorers ({hrRows.length})</TabBtn>
            <TabBtn active={tab === 'board'} onClick={() => setTab('board')}>🏆 Top Board ({topBoard.length})</TabBtn>
            <TabBtn active={tab === 'all'} onClick={() => setTab('all')}>📋 All ({allRows.length})</TabBtn>
          </div>

          {pickRows.length === 0
            ? <Empty text={tab === 'hr' ? 'No HR scorers in this pick set.' : 'No picks in this view.'} />
            : (
              <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, overflow: 'hidden' }}>
                {pickRows.map((r, i) => (
                  <PickRow key={r.player_id || i} r={r} i={i} onPlayerClick={onPlayerClick} />
                ))}
              </div>
            )
          }
        </>
      )}

      {/* Tonight, graded properly: every pick against the outcome it was
          picked FOR, not against home runs. */}
      <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.border}` }}>
        <ResultsDepth results={results} onPlayerClick={onPlayerClick} />
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
