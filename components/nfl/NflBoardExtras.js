'use client'
import { useMemo, useState } from 'react'
import { C, NUM_FONT, gradeFor } from '../../lib/nfl/theme'
import { LABELS } from '../../lib/nfl/scoreLabels'
import { quoteFor } from '../../lib/nfl/oddsMatch'
import NflTable from './NflTable'
import NflFace from './NflFace'
import { Segmented, FilterPill, AngleRow as SharedAngleRow } from '../Filters'
import { alpha } from '../../lib/scales'
import RangeDual from '../RangeDual'
import WatchBox from '../WatchBox'
import MobileFold from '../MobileFold'
import { lineFor, tdsIn } from '../../lib/nfl/liveSlate'

// TUDDY BOARD EXTRAS (2026-09-27, board filters plan): the pieces MOONSHOT's
// board has that TUDDY's two boards (Touchdowns.js for TD, Boards.js for the
// other markets) did not, built once and used by both.

/** List | Cards switch, MOONSHOT's words. */
export function ViewSwitch({ value, onChange }) {
  return (
    <Segmented value={value} onChange={onChange}
      options={[{ key: 'list', label: '☰ List', title: 'One sortable table: click a header, shift-click for a tiebreaker' }, { key: 'cards', label: '▦ Cards', title: 'The card board' }]} />
  )
}

/**
 * THE BOARD'S TITLE ROW (2026-09-27), RankedBoard's own: the market in big
 * type, "N ranked" in a pill, one line under it, List | Cards on the right,
 * and the accent underline. Replaces "showing 60 of 310 across 16 games" as a
 * grey sentence and a separate "VIEW" row.
 */
export function BoardHead({ title, count, sub, view, setView }) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', paddingBottom: 8, marginTop: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-.02em', color: C.text }}>{title}</span>
            <span style={{ fontSize: 11, fontWeight: 800, fontFamily: NUM_FONT, color: C.green, border: `1px solid ${alpha(C.green, 0.4)}`, background: alpha(C.green, 0.08), borderRadius: 999, padding: '1px 9px' }}>{count} ranked</span>
          </div>
          {sub && <div style={{ fontSize: 11, color: C.text3, fontFamily: NUM_FONT, marginTop: 3, lineHeight: 1.45 }}>{sub}</div>}
        </div>
        <ViewSwitch value={view} onChange={setView} />
      </div>
      <div style={{ height: 2, marginBottom: 10, borderRadius: 1, background: `linear-gradient(90deg, ${C.green}, ${alpha(C.cyan, 0.5)} 45%, transparent)` }} />
    </>
  )
}

/** A labelled pill group inside the Filters drawer (position, only, sort). */
export function DrawerPills({ label, children }) {
  return (
    <>
      <div style={{ fontSize: 10, color: C.text2, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 800 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '7px 0 12px' }}>{children}</div>
    </>
  )
}

/** The week's games for the top bar's game picker, by kickoff: AWY @ HOM. */
export function nflGameOptions(games) {
  const seen = new Map()
  for (const g of games || []) {
    if (!g?.away || !g?.home) continue
    const key = `${g.away}@${g.home}`
    if (!seen.has(key)) seen.set(key, { key, label: `${g.away} @ ${g.home}`, t: Date.parse(g.kickoff || '') || 0 })
  }
  return [...seen.values()].sort((a, b) => a.t - b.t).map(({ key, label }) => ({ key, label }))
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
        {/* Wraps to a second line rather than "Amon-Ra St. B…" on a phone. */}
        <span style={{ whiteSpace: 'normal', lineHeight: 1.15, minWidth: 0 }}>{v}</span>
      </span>) },
    ...(phone ? [] : [{ key: 'pos', label: 'Pos', w: 40, heat: false }, { key: 'matchup', label: 'Game', w: 80, heat: false }]),
    { key: 'score', label: 'Score', w: 52, primary: true, scale: 'seq', domain: [0, 100] },
    ...(phone ? [] : [{ key: 'grade', label: 'Grade', w: 56, heat: false }]),
    ...top.map((k) => ({ key: k, label: LABELS[k] || k, w: phone ? 74 : 86, scale: 'seq', domain: [0, 100] })),
    ...(phone || !odds ? [] : [{ key: 'price', label: 'Price', w: 60, heat: false, fmt: (v) => (v == null ? '—' : v > 0 ? `+${v}` : String(v)) }]),
  ]
  if (!rows.length) return null
  return (
    <div className="nfl-board-list">
    <style>{`@media (max-width: 860px){.nfl-board-list .dense-sticky{max-width:150px!important;min-width:132px!important}}`}</style>
    <NflTable rows={rows} columns={columns} heatMode="primary" maxRows={rows.length} maxHeight={9999}
      dimRow={(r) => r._p?.low_sample} onRowClick={(r) => (r._p?.position === 'DEF' ? null : onPlayerClick?.(r._p, market))}
      caption={phone
        ? 'Score and the two heaviest parts of it, as percentiles in this week’s pool. Tap a row for the full card.'
        : 'Score, grade, and the three heaviest parts of the score as percentiles in this week’s pool. Click a header to sort; shift-click adds a tiebreaker.'} />
    </div>
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
//   Scored last week a TD in his last game BEFORE this week (logs)
//   TD in 2 straight a TD in each of his last two games before this week
//   Due              red-zone role (f_rz_opp >= 75) and no TD in his last two
//                    games before this week
// BEFORE THIS WEEK (2026-09-28). The week file and the logs are rebuilt after
// Sunday's games, so on a Monday games_since_last_td and the logs' last row
// ARE this week: "scored last week" listed the men who just scored, and TD
// WATCH's "✓ SCORED AGAIN" graded a man on the game that put him there.
// tdRun reads only log rows before the board's own season/week; with no log
// for him it says null and the chip matches nobody -- never the post-week field.
const tdc = (p, k) => { const v = p?.components?.TD?.[k]; return Number.isFinite(v) ? Number(v) : null }
export function tdRun(logs, id, before = null) {
  const g = logs?.logs?.[String(id)]?.log
  if (!Array.isArray(g)) return null
  const prior = g.filter((x) => Number.isFinite(x?.g_td) && (!before?.season || !before?.week || x.s < before.season || (x.s === before.season && x.w < before.week)))
  const tds = prior.slice(-2).reverse().map((x) => x.g_td)   // newest first
  if (!tds.length) return null
  return { last: tds[0] > 0, two: tds.length === 2 ? tds[0] > 0 && tds[1] > 0 : null, dry2: tds.length === 2 ? tds[0] === 0 && tds[1] === 0 : null }
}
export function angleDefs({ matchup, logs, market, matchupTag, week = null }) {
  const stat = ['TD', 'REC_YDS', 'REC', 'RUSH_YDS', 'RUSH_ATT', 'PASS_YDS'].includes(market) ? market : 'TD'
  return [
    { key: 'soft', label: 'Softest matchup', title: 'His opponent ranks in the league’s softest 8 against his role on this market (DvP).',
      test: (p) => { const t = matchupTag?.(matchup, p, stat); return Boolean(t && Number.isFinite(t.rank) && t.rank <= 8) } },
    { key: 'rz', label: 'Red-zone role', title: 'Red-zone touches in the top quarter of the week’s pool.', test: (p) => (tdc(p, 'f_rz_opp') ?? -1) >= 75 },
    { key: 'gl', label: 'Goal-line back', title: 'A running back with goal-line opportunity in the top quarter.', test: (p) => p.position === 'RB' && (tdc(p, 'f_gl_opp') ?? -1) >= 75 },
    { key: 'total', label: 'High total', title: 'His team’s implied total in the top 30% of the week.', test: (p) => (tdc(p, 'implied_total') ?? -1) >= 70 },
    { key: 'last', label: 'Scored last week', title: 'A touchdown in his last game before this week.', test: (p) => tdRun(logs, p.player_id, week)?.last === true },
    { key: 'two', label: 'TD in 2 straight', title: 'A touchdown in each of his last two games before this week.', test: (p) => tdRun(logs, p.player_id, week)?.two === true },
    { key: 'due', label: 'Due', title: 'A top-quarter red-zone role and no touchdown in his last two games before this week.', test: (p) => (tdc(p, 'f_rz_opp') ?? -1) >= 75 && tdRun(logs, p.player_id, week)?.dry2 === true },
  ]
}

/** The shared Angle row (components/Filters.js), in TUDDY's green. */
export function AngleRow(props) {
  return <SharedAngleRow {...props} accent={C.green} className="nfl-angle-row" />
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

// `ext.game` (2026-09-27): the game picker moved to the top bar beside the
// team (BoardHub owns it, '' = all); the drawer then keeps window + score.
export function useNflDrawerFilters(pool, games, market, ext = null) {
  const [gameOwn, setGameOwn] = useState('all')
  const game = ext ? (ext.game || 'all') : gameOwn
  const setGame = ext ? (v) => ext.setGame?.(v === 'all' ? '' : v) : setGameOwn
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
    game !== 'all' && !ext ? { key: 'game', label: gameOptions.find((o) => o.key === game)?.label || game, onClear: () => setGame('all') } : null,
    win !== 'all' ? { key: 'win', label: WINDOWS.find(([k]) => k === win)?.[1] || win, onClear: () => setWin('all') } : null,
    scored ? { key: 'score', label: `Score ${range[0]}–${range[1]}`, onClear: () => setRange([0, 100]) } : null,
  ].filter(Boolean)
  const reset = () => { if (!ext) setGame('all'); setWin('all'); setRange([0, 100]) }
  const label = { fontSize: 10, color: C.text2, textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 800 }
  const section = (
    <>
      {!ext && <><div style={label}>Game</div>
      <select value={game} onChange={(e) => setGame(e.target.value)} aria-label="Game"
        style={{ width: '100%', minHeight: 40, margin: '6px 0 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.bg, color: C.text, padding: '0 8px', fontSize: 12 }}>
        {gameOptions.map((o) => <option key={o.key} value={o.key}>{o.label} ({o.count})</option>)}
      </select></>}
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

// ── TD WATCH: MOONSHOT's B2B WATCH box, the same component (2026-09-28) ────
// components/WatchBox.js draws it. Three rows, each a fact, disjoint so no
// name sits in two (the B2B rule):
//   TD IN 2+ STRAIGHT  a TD in each of his last two games before this week
//                      (tdRun, the Angle row's helper)
//   SCORED LAST WEEK   a TD in his last game before this week, not above
//   BACK FROM A BYE    his team's rest days before this game >= 13
//                      (the week file's home_rest_days / away_rest_days)
// A card turns green "✓ SCORED AGAIN" on a touchdown THIS week: the live
// line while games are on (lib/nfl/liveSlate tdsIn), the graded week file
// (nfl_results lines[id].TD) once they're over -- only when its season and
// week are the board's. No hit-rate claim: the graded weeks can't measure one.
export function tdWatchLists(players, games, logs = null, week = null) {
  const rest = new Map()
  for (const g of games || []) {
    if (g.home) rest.set(g.home, Number(g.home_rest_days))
    if (g.away) rest.set(g.away, Number(g.away_rest_days))
  }
  const byScore = (a, b) => (b.scores?.TD ?? 0) - (a.scores?.TD ?? 0)
  const two = players.filter((p) => tdRun(logs, p.player_id, week)?.two === true).sort(byScore)
  const twoIds = new Set(two.map((p) => p.player_id))
  const scored = players.filter((p) => tdRun(logs, p.player_id, week)?.last === true && !twoIds.has(p.player_id)).sort(byScore)
  const bye = players.filter((p) => (rest.get(p.team) ?? 0) >= 13).sort(byScore)
  return { two, scored, bye }
}
const WATCH_CAP = 10
export function TdWatch({ players, games, logs = null, results = null, liveSnap = null, week = null, onPlayerClick }) {
  const { two, scored, bye } = useMemo(() => tdWatchLists(players, games, logs, week), [players, games, logs, week?.season, week?.week])
  const graded = results && week && results.season === week.season && results.week === week.week ? results.lines || null : null
  const scoredNow = (p) => Number(graded?.[p.player_id]?.TD) > 0 || tdsIn(lineFor(liveSnap, p)) > 0
  if (!two.length && !scored.length && !bye.length) return null
  const items = (list) => list.slice(0, WATCH_CAP).map((p) => ({
    key: p.player_id, tile: p.team || 'NFL', name: p.name,
    line: `TD score ${Math.round(p.scores?.TD ?? 0)}`,
    hit: scoredNow(p), hitText: '✓ SCORED AGAIN',
    onClick: () => onPlayerClick?.(p, 'TD'),
  }))
  const label = (words, list) => `${words}${list.length > WATCH_CAP ? ` · top ${WATCH_CAP} of ${list.length}` : ''}`
  const total = two.length + scored.length
  // Folded on a phone like MOONSHOT's B2B Watch (MobileFold), the count and
  // the rows in the summary; open on a desktop.
  return (
    <MobileFold title="🔁 TD Watch" count={total || null} accent={C.green} rememberKey="fold_tdwatch_v1"
      summary={[two.length && `${two.length} TD in 2+ straight`, scored.length && `${scored.length} scored last week`, bye.length && `${bye.length} back from a bye`].filter(Boolean).join(' · ')}>
    <WatchBox
      icon="🔁" title="TD WATCH" accent={C.green} theme={C} numFont={NUM_FONT} ariaLabel="TD watch"
      status={total ? `${total} scored last time out` : 'nobody on a scoring run this week'}
      note="facts from the week file · no hit-rate claim"
      rows={[
        { key: 'two', label: label('🔥 TD in 2+ straight', two), items: items(two) },
        { key: 'last', label: label('✅ scored last week', scored), items: items(scored) },
        { key: 'bye', label: label('🛌 back from a bye', bye), accent: C.blue, items: items(bye) },
      ]}
      footer="Every row is a fact from the week file and the game logs, not a pick. No hit rate is claimed for any of them: TUDDY's graded weeks are too few to measure one. A card turns green when he scores again this week."
    />
    </MobileFold>
  )
}

export const numFontStyle = { fontFamily: NUM_FONT, color: C.text3 }
