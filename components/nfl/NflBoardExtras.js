'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, gradeFor } from '../../lib/nfl/theme'
import { LABELS } from '../../lib/nfl/scoreLabels'
import { quoteFor } from '../../lib/nfl/oddsMatch'
import NflTable from './NflTable'
import NflFace from './NflFace'
import { Segmented, FilterPill } from '../Filters'
import RangeDual from '../RangeDual'

// TUDDY BOARD EXTRAS (2026-09-27, board filters plan): the pieces MOONSHOT's
// board has that TUDDY's two boards (Touchdowns.js for TD, Boards.js for the
// other markets) did not, built once and used by both.

/** List | Cards switch, MOONSHOT's words. */
export function ViewSwitch({ value, onChange }) {
  return (
    <Segmented label="View" value={value} onChange={onChange}
      options={[{ key: 'list', label: 'List', title: 'One sortable table: click a header, shift-click for a tiebreaker' }, { key: 'cards', label: 'Cards', title: 'The card board' }]} />
  )
}

/**
 * THE LIST VIEW (plan TUDDY 1). The market's score, grade, its three heaviest
 * components (percentiles in the week's pool -- the numbers the score is built
 * from, spec.weights), the matchup and the book's price. A phone keeps five
 * columns: rank, player, score and the two heaviest components; the rest is on
 * the card a tap away. Sort any header; shift-click adds a tiebreaker.
 */
export function NflBoardList({ players, market, weights, odds, phone, onPlayerClick }) {
  const top = Object.entries(weights || {}).sort((a, b) => b[1] - a[1]).slice(0, phone ? 2 : 3).map(([k]) => k)
  const rows = players.map((p, i) => {
    const q = odds ? quoteFor(odds, p, market) : null
    return {
      _id: p.player_id, _p: p, rank: i + 1, name: p.name, pos: p.position,
      matchup: `${p.team}${p.opp ? ` v ${p.opp}` : ''}`,
      score: Math.round(p.scores[market]), grade: gradeFor(p.scores[market]).label,
      price: q && q.over != null && q.matches !== false ? Number(q.over) : null,
      ...Object.fromEntries(top.map((k) => [k, Number.isFinite(p.components?.[market]?.[k]) ? Math.round(p.components[market][k]) : null])),
    }
  })
  const columns = [
    { key: 'rank', label: '#', w: 30, heat: false },
    { key: 'name', label: 'Player', w: phone ? 158 : 170, heat: false, sticky: true, fmt: (v, r) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <NflFace player={r._p} size={22} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
      </span>) },
    ...(phone ? [] : [{ key: 'pos', label: 'Pos', w: 40, heat: false }, { key: 'matchup', label: 'Game', w: 80, heat: false }]),
    { key: 'score', label: 'Score', w: 52, primary: true, scale: 'seq', domain: [0, 100] },
    ...(phone ? [] : [{ key: 'grade', label: 'Grade', w: 56, heat: false }]),
    ...top.map((k) => ({ key: k, label: LABELS[k] || k, w: phone ? 74 : 86, scale: 'seq', domain: [0, 100] })),
    ...(phone || !odds ? [] : [{ key: 'price', label: 'Price', w: 60, heat: false, fmt: (v) => (v == null ? '—' : v > 0 ? `+${v}` : String(v)) }]),
  ]
  if (!rows.length) return null
  return (
    <NflTable rows={rows} columns={columns} heatMode="primary" maxRows={rows.length} maxHeight={9999}
      dimRow={(r) => r._p?.low_sample} onRowClick={(r) => (r._p?.position === 'DEF' ? null : onPlayerClick?.(r._p, market))}
      caption={phone
        ? 'Score and the two heaviest parts of it, as percentiles in this week’s pool. Tap a row for the full card.'
        : 'Score, grade, and the three heaviest parts of the score as percentiles in this week’s pool. Click a header to sort; shift-click adds a tiebreaker.'} />
  )
}

// ── THE ANGLE ROW (plan TUDDY 2) ─────────────────────────────────────────────
// MOONSHOT's one-tap Angle chips, from fields every board row already carries.
// Each is a stated rule, never a guess; a chip whose field isn't on the row
// simply matches nobody (and says 0).
//   Softest matchup  the opponent ranks top 8 (softest) vs his role on this
//                    market's DvP stat (matchupTag; TD's stat where a market
//                    has none)
//   Red-zone role    TD component f_rz_opp >= 75th percentile
//   Goal-line back   an RB with TD component f_gl_opp >= 75th
//   High total       TD component implied_total >= 70th
//   Scored last week games_since_last_td === 0
//   TD in 2 straight his last two logged games both had a TD (logs)
//   Due              red-zone role (f_rz_opp >= 75) and no TD in his last 2+
const tdc = (p, k) => { const v = p?.components?.TD?.[k]; return Number.isFinite(v) ? Number(v) : null }
function lastTwoTd(logs, id) {
  const g = logs?.logs?.[String(id)]?.log
  if (!Array.isArray(g)) return null
  const td = g.filter((x) => Number.isFinite(x?.g_td)).slice(-2)
  return td.length === 2 ? td.every((x) => x.g_td > 0) : null
}
export function angleDefs({ matchup, logs, market, matchupTag }) {
  const stat = ['TD', 'REC_YDS', 'REC', 'RUSH_YDS', 'RUSH_ATT', 'PASS_YDS'].includes(market) ? market : 'TD'
  return [
    { key: 'soft', label: 'Softest matchup', title: 'His opponent ranks in the league’s softest 8 against his role on this market (DvP).',
      test: (p) => { const t = matchupTag?.(matchup, p, stat); return Boolean(t && Number.isFinite(t.rank) && t.rank <= 8) } },
    { key: 'rz', label: 'Red-zone role', title: 'Red-zone touches in the top quarter of the week’s pool.', test: (p) => (tdc(p, 'f_rz_opp') ?? -1) >= 75 },
    { key: 'gl', label: 'Goal-line back', title: 'A running back with goal-line opportunity in the top quarter.', test: (p) => p.position === 'RB' && (tdc(p, 'f_gl_opp') ?? -1) >= 75 },
    { key: 'total', label: 'High total', title: 'His team’s implied total in the top 30% of the week.', test: (p) => (tdc(p, 'implied_total') ?? -1) >= 70 },
    { key: 'last', label: 'Scored last week', title: 'A touchdown in his last game.', test: (p) => p.games_since_last_td === 0 },
    { key: 'two', label: 'TD in 2 straight', title: 'A touchdown in each of his last two logged games.', test: (p) => lastTwoTd(logs, p.player_id) === true },
    { key: 'due', label: 'Due', title: 'A top-quarter red-zone role and no touchdown in his last two or more games.', test: (p) => (tdc(p, 'f_rz_opp') ?? -1) >= 75 && Number(p.games_since_last_td) >= 2 },
  ]
}

/** One row of chips, one tap each, counts from the pool; scrolls sideways on a phone. */
export function AngleRow({ defs, pool, value, onChange }) {
  return (
    <div className="nfl-angle-row" style={{ display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto', flexWrap: 'nowrap', paddingBottom: 2, marginTop: 8 }}>
      <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.1em', color: C.text3, fontFamily: NUM_FONT, flexShrink: 0 }}>ANGLE</span>
      {defs.map((d) => {
        const n = pool.filter(d.test).length
        const on = value === d.key
        return (
          <button key={d.key} type="button" title={d.title} onClick={() => onChange(on ? null : d.key)} aria-pressed={on}
            style={{ flexShrink: 0, minHeight: 44, padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
            {/* 44px tap target, a 30px pill inside it */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, height: 30, padding: '0 11px', borderRadius: 999, whiteSpace: 'nowrap',
              border: `1px solid ${on ? C.green : C.border}`, background: on ? `${C.green}22` : 'transparent', color: on ? C.green : C.text2,
              font: `700 11px/1 ${NUM_FONT}` }}>
              {d.label} <span style={{ color: on ? C.green : C.text3 }}>{n}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

// ── GAME, TIME WINDOW, SCORE RANGE (plan TUDDY 3 + 4) ────────────────────────
// MOONSHOT's drawer has a game picker, a time window and a score range. The
// window is read off each game's own kickoff in US Eastern: Thursday, Sunday
// early (before 3pm), Sunday late (3pm-7pm), Sunday night (7pm on), Monday
// night; anything else (Friday/Saturday) is "Other". Nothing guessed: a player
// whose game has no kickoff on file matches no window.
const ET = (ms) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(new Date(ms))
  return { wd: parts.find((x) => x.type === 'weekday')?.value, hr: Number(parts.find((x) => x.type === 'hour')?.value) % 24 }
}
export function windowOf(ms) {
  if (!Number.isFinite(ms)) return null
  const { wd, hr } = ET(ms)
  if (wd === 'Thu') return 'thu'
  if (wd === 'Mon') return 'mnf'
  if (wd === 'Sun') return hr < 15 ? 'early' : hr < 19 ? 'late' : 'snf'
  return 'other'
}
const WINDOWS = [['thu', 'Thursday'], ['early', 'Sun early'], ['late', 'Sun late'], ['snf', 'Sunday night'], ['mnf', 'Monday night'], ['other', 'Other']]

export function useNflDrawerFilters(pool, games, market) {
  const [game, setGame] = useState('all')
  const [win, setWin] = useState('all')
  const [range, setRange] = useState([0, 100])
  const byTeam = useMemo(() => {
    const m = new Map()
    for (const g of games || []) {
      const t = Date.parse(g?.kickoff || '')
      const key = `${g.away}@${g.home}`
      for (const team of [g.away, g.home]) if (team) m.set(team, { key, t: Number.isFinite(t) ? t : null, win: windowOf(t) })
    }
    return m
  }, [games])
  const gameOptions = useMemo(() => {
    const seen = new Map()
    for (const g of games || []) {
      const key = `${g.away}@${g.home}`
      if (seen.has(key)) continue
      const n = pool.filter((p) => byTeam.get(p.team)?.key === key).length
      if (n) seen.set(key, { key, label: `${g.away} @ ${g.home}`, count: n, t: Date.parse(g.kickoff || '') || 0 })
    }
    return [{ key: 'all', label: 'All games', count: pool.length }, ...[...seen.values()].sort((a, b) => a.t - b.t)]
  }, [games, pool, byTeam])
  const windowCounts = useMemo(() => Object.fromEntries(WINDOWS.map(([k]) => [k, pool.filter((p) => byTeam.get(p.team)?.win === k).length])), [pool, byTeam])
  const test = (p) => {
    const g = byTeam.get(p.team)
    if (game !== 'all' && g?.key !== game) return false
    if (win !== 'all' && g?.win !== win) return false
    const s = Number(p.scores?.[market])
    if ((range[0] > 0 || range[1] < 100) && !(Number.isFinite(s) && s >= range[0] && s <= range[1])) return false
    return true
  }
  const scored = range[0] > 0 || range[1] < 100
  const chips = [
    game !== 'all' ? { key: 'game', label: gameOptions.find((o) => o.key === game)?.label || game, onClear: () => setGame('all') } : null,
    win !== 'all' ? { key: 'win', label: WINDOWS.find(([k]) => k === win)?.[1] || win, onClear: () => setWin('all') } : null,
    scored ? { key: 'score', label: `Score ${range[0]}–${range[1]}`, onClear: () => setRange([0, 100]) } : null,
  ].filter(Boolean)
  const reset = () => { setGame('all'); setWin('all'); setRange([0, 100]) }
  const label = { fontSize: 10, color: C.text2, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 800 }
  const section = (
    <>
      <div style={label}>Game</div>
      <select value={game} onChange={(e) => setGame(e.target.value)} aria-label="Game"
        style={{ width: '100%', minHeight: 40, margin: '6px 0 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, padding: '0 8px', fontSize: 12 }}>
        {gameOptions.map((o) => <option key={o.key} value={o.key}>{o.label} ({o.count})</option>)}
      </select>
      <div style={label}>Time window</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '7px 0 12px' }}>
        {WINDOWS.filter(([k]) => windowCounts[k] > 0).map(([k, l]) => (
          <FilterPill key={k} active={win === k} onClick={() => setWin(win === k ? 'all' : k)} count={windowCounts[k]}>{l}</FilterPill>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={label}>Score</span>
        <span style={{ fontFamily: NUM_FONT, fontSize: 10, color: C.text2 }}>{range[0]}–{range[1]}</span>
      </div>
      <div style={{ margin: '6px 0 14px' }}>
        <RangeDual min={0} max={100} step={1} low={range[0]} high={range[1]}
          onLow={(v) => setRange([Math.min(v, range[1]), range[1]])} onHigh={(v) => setRange([range[0], Math.max(v, range[0])])} />
      </div>
    </>
  )
  return { test, chips, reset, section, activeCount: chips.length }
}

export const numFontStyle = { fontFamily: NUM_FONT, color: C.text3 }
