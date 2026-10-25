'use client'
import { useMemo, useState } from 'react'
import BucketsTable from '../BucketsTable'
import SlipPlus from '../../SlipPlus'
import PageHeader from '../../PageHeader'
import { C, NUM_FONT } from '../../../lib/nba/theme'
import { flatChip, FLAT_CHIP_CLASS } from '../../../lib/chips'
import { useLiveFetch } from '../../../lib/useLiveFetch'
import { trending, HR_THIN } from '../../../lib/hitRater'
import { fmtOdds } from '../../../lib/odds'
import { usePreview, ShowMoreButton } from '../../ListPreview'
import { Kicker, EmptyState } from '../ui'
import TrendingAll from '../../TrendingAll'

// 🔥 TRENDING (2026-10-25, Donovan: "see if we could get like 5 good props ... and just put them together"; Doink's Hit Rater +
// Trending Insights). Tonight's props that keep clearing: every book line on file (PTS / REB / AST / 3PM / PRA), how often the
// man went OVER it -- last 5 / 10 / 20, since last season, at tonight's venue side, against tonight's club -- percent first and
// the count small under it ("I like the percentages"). Sorted the Trending way (lib/hitRater.js trending: L10 %, then the
// longer sample). "+" puts the leg on the one BUCKETS slip (the same leg key as his player page), so five good props build there.
// A hit rate counts games that happened; nothing here is a chance (no implied %). Data: /api/buckets/trending.

const LANE_PILLS = [['all', 'All'], ['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['3pm', '3PM'], ['pra', 'PRA']]
// MINUTES (2026-10-25): only games he played that long (the defense's starters too); the route counts them (?min=)
const MIN_PILLS = [[null, 'Any min'], [20, '20+ min'], [25, '25+ min'], [30, '30+ min']]
// SHOT ATTEMPTS: only games with that many field-goal attempts (?fga=)
const FGA_PILLS = [[null, 'Any FGA'], [10, '10+ FGA'], [15, '15+ FGA'], [20, '20+ FGA']]
const MIN_N = HR_THIN

const pctCell = (c) => (!c || !c.n ? '—' : (
  <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.15 }}>
    <span>{c.pct}%</span><span style={{ font: `600 10px/1.1 ${NUM_FONT}`, color: C.text3 }}>{`${c.ok}/${c.n}`}</span>
  </span>
))

export default function Trending({ onOpenPlayer }) {
  const [minMin, setMinMin] = useState(null)
  const [minFga, setMinFga] = useState(null)
  const qs = new URLSearchParams({ ...(minMin ? { min: String(minMin) } : {}), ...(minFga ? { fga: String(minFga) } : {}) }).toString()
  const { data, loading } = useLiveFetch(`/api/buckets/trending${qs ? `?${qs}` : ''}`, { keep: 'trending' })
  const [lane, setLane] = useState('all')
  const [every, setEvery] = useState(false)   // ALL SPORTS (components/TrendingAll.js)
  const [hot, setHot] = useState(false)
  const rows = useMemo(() => {
    const all = (data?.rows || []).filter((r) => lane === 'all' || r.lane === lane)
    const ranked = trending(all, { minN: MIN_N, take: 9999 })
    return (hot ? ranked.filter((r) => (r.own.L10?.pct ?? 0) >= 70) : ranked).map((r) => ({
      _key: r.key, _raw: r, name: r.name, team: r.team, prop: `${r.word} o${r.line}`,
      l5: r.own.L5?.pct ?? null, l10: r.own.L10?.pct ?? null, l20: r.own.L20?.pct ?? null, season: r.own.Season?.pct ?? null,
      ha: r.own.HA?.pct ?? null, h2h: r.own.H2H?.pct ?? null, dL10: r.dvp?.L10?.pct ?? null, dSeason: r.dvp?.Season?.pct ?? null, avg: r.avg, price: r.odds,
    }))
  }, [data, lane, hot])
  const pv = usePreview(rows, 25)
  const cell = (k) => (v, r) => pctCell(r._raw.own[k])
  const dcell = (k) => (v, r) => pctCell(r._raw.dvp?.[k])
  const columns = [
    { key: 'name', label: 'Player', group: 'Player', w: 132, sticky: true, bold: true, numeric: false, heat: false, link: (r) => (onOpenPlayer ? () => onOpenPlayer(r.id) : null) },
    { key: 'prop', label: 'Prop', group: 'Tonight', w: 84, numeric: false, heat: false, mono: true },
    { key: 'l10', label: 'L10', group: 'Over the line', w: 52, fmt: cell('L10'), primary: true },
    { key: 'l5', label: 'L5', group: 'Over the line', w: 52, fmt: cell('L5') },
    { key: 'l20', label: 'L20', group: 'Over the line', w: 52, fmt: cell('L20') },
    { key: 'season', label: 'SINCE 25-26', group: 'Over the line', w: 64, fmt: cell('Season') },
    { key: 'ha', label: 'HM/AW', group: 'Over the line', w: 56, fmt: cell('HA'), title: 'His games at tonight’s venue side (home or away)' },
    { key: 'h2h', label: 'H2H', group: 'Over the line', w: 52, fmt: cell('H2H'), title: 'His games against tonight’s club' },
    { key: 'dL10', label: 'D L10', group: 'Tonight’s defense', w: 56, fmt: dcell('L10'), title: 'The last 10 starter games at his spot (G / F / C) against tonight’s defense: how many went over his line' },
    { key: 'dSeason', label: 'D SINCE 25-26', group: 'Tonight’s defense', w: 70, fmt: dcell('Season'), title: 'Every starter game at his spot against tonight’s defense since last season, over his line' },
    { key: 'avg', label: 'AVG', group: 'His games', w: 48, fmt: (v) => (v == null ? '—' : v.toFixed(1)) },
    { key: 'price', label: 'PRICE', group: 'Book', w: 58, heat: false, mono: true, fmt: (v) => (v == null ? '—' : fmtOdds(v)) },
    { key: 'slip', label: '', group: 'Book', w: 48, heat: false, numeric: false, fmt: (v, r) => {
      const x = r._raw
      return <SlipPlus sport="nba" C={C} NUM_FONT={NUM_FONT} accent={C.purple}
        // the BOOK's line, keyed with it: the player page's leg (lib/nba/oddsQuote, the board's own bar) is a different bet
        leg={{ key: `${x.id}|${x.lane}|o${x.line}`, id: String(x.id), name: x.name, team: x.team, market: x.word, line: `o${x.line}`, side: 'over', price: x.odds, game: null }} />
    } },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      <PageHeader eyebrow="BUCKETS · TRENDING" title="Trending" theme={C} numFont={NUM_FONT} accent={C.purple}
        note="Tonight’s lines that keep clearing. Tap + to build a slip." />
      <div role="group" aria-label="Which sports" style={{ display: 'flex', gap: 6 }}>
        {[[false, 'BUCKETS'], [true, 'All sports']].map(([k, l]) => (
          <button key={l} type="button" className={FLAT_CHIP_CLASS} aria-pressed={every === k} onClick={() => setEvery(k)} style={flatChip(every === k, C.purple, C, NUM_FONT)}>{l}</button>
        ))}
      </div>
      {every ? <TrendingAll C={C} NUM_FONT={NUM_FONT} accent={C.purple} Table={BucketsTable} /> : (<>
      <div role="group" aria-label="Lane" className="chip-row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {LANE_PILLS.map(([k, l]) => (
          <button key={k} type="button" className={FLAT_CHIP_CLASS} aria-pressed={lane === k} onClick={() => setLane(k)} style={flatChip(lane === k, C.purple, C, NUM_FONT)}>{l}</button>
        ))}
        {MIN_PILLS.map(([k, l]) => (
          <button key={l} type="button" className={FLAT_CHIP_CLASS} aria-pressed={minMin === k} onClick={() => setMinMin(k)} style={flatChip(minMin === k, C.purple, C, NUM_FONT)}>{l}</button>
        ))}
        {FGA_PILLS.map(([k, l]) => (
          <button key={l} type="button" className={FLAT_CHIP_CLASS} aria-pressed={minFga === k} onClick={() => setMinFga(k)} style={flatChip(minFga === k, C.purple, C, NUM_FONT)}>{l}</button>
        ))}
        <button type="button" className={FLAT_CHIP_CLASS} aria-pressed={hot} onClick={() => setHot((v) => !v)} title="L10 at 70% or better" style={flatChip(hot, C.purple, C, NUM_FONT)}>{hot ? '✓ 70%+ L10' : '70%+ L10'}</button>
      </div>
      {loading && !data ? <div style={{ fontSize: 12, color: C.text3 }}>Reading tonight’s lines…</div> : null}
      {data && !rows.length ? <EmptyState title="NO LINES YET" note={data.why || 'The books’ lines land at noon ET; each game’s again an hour before tip.'} /> : null}
      {rows.length ? (
        <>
          <Kicker>{rows.length} PROPS · L10 FIRST · {`UNDER ${MIN_N} GAMES LEFT OUT`}</Kicker>
          <BucketsTable rows={pv.shown} columns={columns} maxHeight={9999} maxRows={rows.length} heatMode="standouts" initialSort={null} />
          <ShowMoreButton open={pv.open} restN={pv.restN} toggle={pv.toggle} total={pv.total} itemWord="props" />
          <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.5 }}>% = games he went over tonight’s line; small = the count. D = starters at his spot vs tonight’s defense, at his line.{minMin ? ` Only games of ${minMin}+ minutes.` : ''}{minFga ? ` Only games of ${minFga}+ shots.` : ''} Price = the best book over.</div>
        </>
      ) : null}
      </>)}
    </div>
  )
}
