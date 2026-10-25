'use client'
import { useMemo, useState } from 'react'
import NflTable from '../NflTable'
import SlipPlus from '../../SlipPlus'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nfl/theme'
import { flatChip, FLAT_CHIP_CLASS } from '../../../lib/chips'
import { propLanesOf } from '../../../lib/propLanes'
import { hitRaterRow, trending, HR_THIN } from '../../../lib/hitRater'
import { fmtOdds } from '../../../lib/odds'
import { usePreview, ShowMoreButton } from '../../ListPreview'

// 🔥 TUDDY TRENDING (2026-10-25, Donovan: Trending "shared", "5 good props ... from different sports"; BUCKETS' twin,
// components/buckets/tabs/Trending.js, on the same core lib/hitRater.js). This week's props that keep clearing: every book line on
// file (receptions, receiving / rushing / passing yards, rush attempts, kicking points, anytime TD) for a game not yet kicked off,
// and how often the man went OVER it -- last 5 / 10 / 20 games, since 2025, at this week's venue side, against this week's club.
// Percent first, the count small under it. Read from what the TUDDY shell already holds: the week file, the bot's game logs
// (nfl_logs.json, one row a game) and the odds feed -- no extra request. "+" puts the BOOK's line on TUDDY's slip.
// A hit rate counts games that happened; nothing here is a chance (no implied %).

// the odds feed's market for each lane (lib/odds/latest.js SPORTS.nfl + the anytime TD snap market)
const ODDS_KEY = { TD: 'player_anytime_td', REC_YDS: 'player_reception_yds', REC: 'player_receptions', RUSH_YDS: 'player_rush_yds', RUSH_ATT: 'player_rush_attempts', PASS_YDS: 'player_pass_yds', KICK_PTS: 'player_kicking_points' }
const LANES = propLanesOf('nfl').filter((l) => ODDS_KEY[l.key] && l.stat)
const LANE_PILLS = [['all', 'All'], ...LANES.map((l) => [l.key, l.short || l.label])]

const pctCell = (c) => (!c || !c.n ? '—' : (
  <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.15 }}>
    <span>{c.pct}%</span><span style={{ font: `600 10px/1.1 ${NUM_FONT}`, color: C.text3 }}>{`${c.ok}/${c.n}`}</span>
  </span>
))

/** The rows: every lined man x lane whose game has not kicked off. Pure over the three files the shell holds. */
export function tuddyTrendingRows({ data, logs, odds, now = Date.now() }) {
  const lined = odds?.by_player_id || {}
  const byId = new Map((data?.players || []).map((p) => [String(p.player_id), p]))
  const gameOf = (team) => (data?.games || []).find((g) => g.home === team || g.away === team)
  const out = []
  for (const [id, quotes] of Object.entries(lined)) {
    const p = byId.get(id)
    const log = logs?.logs?.[id]?.log
    if (!p || !Array.isArray(log) || !log.length) continue
    const g = gameOf(p.team)
    if (!g || !(Date.parse(g.kickoff) > now)) continue   // this week's game, not under way
    const games = log.slice().reverse().map((x) => ({ ...x, home: x.h === 1 ? true : x.h === 0 ? false : null }))
    const next = { opp: g.home === p.team ? g.away : g.home, home: g.home === p.team }
    for (const lane of LANES) {
      const q = quotes?.[ODDS_KEY[lane.key]]
      const line = Number(q?.line)
      if (!Number.isFinite(line)) continue
      const best = Number(q.best_over ?? q.over)
      const row = hitRaterRow({ p: { sport: 'nfl', id, name: p.name, team: p.team, pos: p.position }, lane: { key: lane.key, word: lane.short || lane.label, stat: (x) => x[lane.stat] }, line, odds: Number.isFinite(best) ? best : null, games, next })
      out.push({ ...row, gameId: g.game_id })
    }
  }
  return out
}

export default function Trending({ data, logs, odds, onPlayerClick }) {
  const [lane, setLane] = useState('all')
  const [hot, setHot] = useState(false)
  const all = useMemo(() => tuddyTrendingRows({ data, logs, odds }), [data, logs, odds])
  const rows = useMemo(() => {
    const ranked = trending(all.filter((r) => lane === 'all' || r.lane === lane), { minN: HR_THIN, take: 9999 })
    return (hot ? ranked.filter((r) => (r.own.L10?.pct ?? 0) >= 70) : ranked).map((r) => ({
      _key: r.key, _raw: r, name: r.name, team: r.team, prop: `${r.word} o${r.line}`,
      l10: r.own.L10?.pct ?? null, l5: r.own.L5?.pct ?? null, l20: r.own.L20?.pct ?? null, season: r.own.Season?.pct ?? null,
      ha: r.own.HA?.pct ?? null, h2h: r.own.H2H?.pct ?? null, avg: r.avg, price: r.odds,
    }))
  }, [all, lane, hot])
  const pv = usePreview(rows, 25)
  const cell = (k) => (v, r) => pctCell(r._raw.own[k])
  const open = (r) => { const p = (data?.players || []).find((x) => String(x.player_id) === String(r.id)); if (p) onPlayerClick?.(p, r.lane) }
  const columns = [
    { key: 'name', label: 'Player', group: 'Player', w: 132, sticky: true, bold: true, numeric: false, heat: false, link: (r) => () => open(r) },
    { key: 'prop', label: 'Prop', group: 'This week', w: 110, numeric: false, heat: false, mono: true },
    { key: 'l10', label: 'L10', group: 'Over the line', w: 52, fmt: cell('L10'), primary: true },
    { key: 'l5', label: 'L5', group: 'Over the line', w: 52, fmt: cell('L5') },
    { key: 'l20', label: 'L20', group: 'Over the line', w: 52, fmt: cell('L20') },
    { key: 'season', label: 'SINCE 2025', group: 'Over the line', w: 64, fmt: cell('Season') },
    { key: 'ha', label: 'HM/AW', group: 'Over the line', w: 56, fmt: cell('HA'), title: 'His games at this week’s venue side (home or away)' },
    { key: 'h2h', label: 'H2H', group: 'Over the line', w: 52, fmt: cell('H2H'), title: 'His games against this week’s club' },
    { key: 'avg', label: 'AVG', group: 'His games', w: 52, fmt: (v) => (v == null ? '—' : v.toFixed(1)) },
    { key: 'price', label: 'PRICE', group: 'Book', w: 62, heat: false, mono: true, fmt: (v) => (v == null ? '—' : fmtOdds(v)) },
    { key: 'slip', label: '', group: 'Book', w: 48, heat: false, numeric: false, fmt: (v, r) => {
      const x = r._raw
      // the BOOK's line, keyed with it (a board leg on his card is a different bet)
      return <SlipPlus sport="nfl" C={C} NUM_FONT={NUM_FONT} accent={C.green}
        leg={{ key: `${x.id}|${x.lane}|o${x.line}`, id: String(x.id), name: x.name, team: x.team, market: x.word, line: `o${x.line}`, side: 'over', price: x.odds, game: null }} />
    } },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      <PageHeader eyebrow="TUDDY · TRENDING" title="Trending" theme={C} numFont={NUM_FONT} accent={C.green}
        note="This week’s lines that keep clearing. Tap + to build a slip." />
      <div role="group" aria-label="Market" className="chip-row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {LANE_PILLS.map(([k, l]) => (
          <button key={k} type="button" className={FLAT_CHIP_CLASS} aria-pressed={lane === k} onClick={() => setLane(k)} style={flatChip(lane === k, C.green, C, NUM_FONT)}>{l}</button>
        ))}
        <button type="button" className={FLAT_CHIP_CLASS} aria-pressed={hot} onClick={() => setHot((v) => !v)} title="L10 at 70% or better" style={flatChip(hot, C.green, C, NUM_FONT)}>{hot ? '✓ 70%+ L10' : '70%+ L10'}</button>
      </div>
      {!logs || !odds ? <div style={{ fontSize: 12, color: C.text3 }}>Reading this week’s lines and logs…</div> : null}
      {logs && odds && !rows.length ? <div style={{ fontSize: 12, color: C.text3 }}>No lines on file for a game that has not started.</div> : null}
      {rows.length ? (
        <>
          <div style={{ font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: C.text3 }}>{rows.length} PROPS · L10 FIRST · UNDER {HR_THIN} GAMES LEFT OUT</div>
          <NflTable rows={pv.shown} columns={columns} maxHeight={9999} maxRows={rows.length} heatMode="standouts" initialSort={null} />
          <ShowMoreButton open={pv.open} restN={pv.restN} toggle={pv.toggle} total={pv.total} itemWord="props" />
          <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.5 }}>% = games he went over this week’s line; small = the count. Price = the best book over.</div>
        </>
      ) : null}
    </div>
  )
}
