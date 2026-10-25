'use client'
import { useMemo, useState } from 'react'
import NflTable from '../NflTable'
import SlipPlus from '../../SlipPlus'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nfl/theme'
import { flatChip, FLAT_CHIP_CLASS } from '../../../lib/chips'
import { trending, HR_THIN } from '../../../lib/hitRater'
import { fmtOdds } from '../../../lib/odds'
import { usePreview, ShowMoreButton } from '../../ListPreview'
import TrendingAll from '../../TrendingAll'

// 🔥 TUDDY TRENDING (2026-10-25, Donovan: Trending "shared", "5 good props ... from different sports"; BUCKETS' twin,
// components/buckets/tabs/Trending.js, on the same core lib/hitRater.js). This week's props that keep clearing: every book line on
// file (receptions, receiving / rushing / passing yards, rush attempts, kicking points, anytime TD) for a game not yet kicked off,
// and how often the man went OVER it -- last 5 / 10 / 20 games, since 2025, at this week's venue side, against this week's club.
// Percent first, the count small under it. Read from what the TUDDY shell already holds: the week file, the bot's game logs
// (nfl_logs.json, one row a game) and the odds feed -- no extra request. "+" puts the BOOK's line on TUDDY's slip.
// A hit rate counts games that happened; nothing here is a chance (no implied %).

import { tuddyTrendingRows, NFL_TREND_LANES } from '../../../lib/nfl/trending'

const LANE_PILLS = [['all', 'All'], ...NFL_TREND_LANES.map((l) => [l.key, l.short || l.label])]

const pctCell = (c) => (!c || !c.n ? '—' : (
  <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.15 }}>
    <span>{c.pct}%</span><span style={{ font: `600 10px/1.1 ${NUM_FONT}`, color: C.text3 }}>{`${c.ok}/${c.n}`}</span>
  </span>
))

export default function Trending({ data, logs, odds, onPlayerClick }) {
  const [lane, setLane] = useState('all')
  const [every, setEvery] = useState(false)   // ALL SPORTS (components/TrendingAll.js)
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
      <div role="group" aria-label="Which sports" style={{ display: 'flex', gap: 6 }}>
        {[[false, 'TUDDY'], [true, 'All sports']].map(([k, l]) => (
          <button key={l} type="button" className={FLAT_CHIP_CLASS} aria-pressed={every === k} onClick={() => setEvery(k)} style={flatChip(every === k, C.green, C, NUM_FONT)}>{l}</button>
        ))}
      </div>
      {every ? <TrendingAll C={C} NUM_FONT={NUM_FONT} accent={C.green} Table={NflTable} /> : (<>
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
      </>)}
    </div>
  )
}
