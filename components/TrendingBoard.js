'use client'
import { useMemo, useState } from 'react'
import SlipPlus from './SlipPlus'
import PageHeader from './PageHeader'
import TrendingAll from './TrendingAll'
import { flatChip, FLAT_CHIP_CLASS } from '../lib/chips'
import { useLiveFetch } from '../lib/useLiveFetch'
import { trending, HR_THIN } from '../lib/hitRater'
import { fmtOdds } from '../lib/odds'
import { usePreview, ShowMoreButton } from './ListPreview'

// 🔥 ONE TRENDING PAGE FOR EVERY PRODUCT (2026-10-25; BUCKETS' page, made shared when LAMP got its own -- "built FROM the component
// that already does the job"). Tonight's props that keep clearing: every book line on file, how often the man went OVER it (last
// 5 / 10 / 20, the long run, at tonight's venue side, against tonight's club) and how often the men at his spot went over it against
// tonight's defense (D). Percent first, the count small under it. Sorted the Trending way (lib/hitRater.js). "+" puts the BOOK's line
// on the product's slip. A product hands its route, its lanes, its filters (each a query param the route counts) and its words.
// A hit rate counts games that happened; nothing here is a chance (no implied %).

const MIN_N = HR_THIN

export default function TrendingBoard({ sport, route, brandName, C, NUM_FONT, accent, Table, onOpenPlayer, lanePills, filters = [], sinceLabel, dLongLabel = null, dTitle, dNote, emptyNote, eyebrow }) {
  const [picked, setPicked] = useState({})   // param -> value
  const qs = new URLSearchParams(Object.fromEntries(Object.entries(picked).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]))).toString()
  const { data, loading } = useLiveFetch(`${route}${qs ? `?${qs}` : ''}`, { keep: `trending:${sport}` })
  const [lane, setLane] = useState('all')
  const [every, setEvery] = useState(false)   // ALL SPORTS (components/TrendingAll.js)
  const [hot, setHot] = useState(false)
  const pctCell = (c) => (!c || !c.n ? '—' : (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.15 }}>
      <span>{c.pct}%</span><span style={{ font: `600 10px/1.1 ${NUM_FONT}`, color: C.text3 }}>{`${c.ok}/${c.n}`}</span>
    </span>
  ))
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
    { key: 'season', label: sinceLabel, group: 'Over the line', w: 64, fmt: cell('Season') },
    { key: 'ha', label: 'HM/AW', group: 'Over the line', w: 56, fmt: cell('HA'), title: 'His games at tonight’s venue side (home or away)' },
    { key: 'h2h', label: 'H2H', group: 'Over the line', w: 52, fmt: cell('H2H'), title: 'His games against tonight’s club' },
    { key: 'dL10', label: 'D L10', group: 'Tonight’s defense', w: 56, fmt: dcell('L10'), title: dTitle },
    { key: 'dSeason', label: dLongLabel || `D ${sinceLabel}`, group: 'Tonight’s defense', w: 70, fmt: dcell('Season'), title: dTitle },
    { key: 'avg', label: 'AVG', group: 'His games', w: 48, fmt: (v) => (v == null ? '—' : v.toFixed(1)) },
    { key: 'price', label: 'PRICE', group: 'Book', w: 58, heat: false, mono: true, fmt: (v) => (v == null ? '—' : fmtOdds(v)) },
    { key: 'slip', label: '', group: 'Book', w: 48, heat: false, numeric: false, fmt: (v, r) => {
      const x = r._raw
      return <SlipPlus sport={sport} C={C} NUM_FONT={NUM_FONT} accent={accent}
        // the BOOK's line, keyed with it: a board leg on his card (the product's own bar) is a different bet
        leg={{ key: `${x.id}|${x.lane}|o${x.line}`, id: String(x.id), name: x.name, team: x.team, market: x.word, line: `o${x.line}`, side: 'over', price: x.odds, game: null }} />
    } },
  ]
  const chip = (on) => flatChip(on, accent, C, NUM_FONT)
  const notes = filters.map((f) => (picked[f.param] != null ? f.note(picked[f.param]) : '')).join('')
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
      <PageHeader eyebrow={eyebrow} title="Trending" theme={C} numFont={NUM_FONT} accent={accent}
        note="Tonight’s lines that keep clearing. Tap + to build a slip." />
      <div role="group" aria-label="Which sports" style={{ display: 'flex', gap: 6 }}>
        {[[false, brandName], [true, 'All sports']].map(([k, l]) => (
          <button key={l} type="button" className={FLAT_CHIP_CLASS} aria-pressed={every === k} onClick={() => setEvery(k)} style={chip(every === k)}>{l}</button>
        ))}
      </div>
      {every ? <TrendingAll C={C} NUM_FONT={NUM_FONT} accent={accent} Table={Table} /> : (<>
      <div role="group" aria-label="Lane" className="chip-row" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {lanePills.map(([k, l]) => (
          <button key={k} type="button" className={FLAT_CHIP_CLASS} aria-pressed={lane === k} onClick={() => setLane(k)} style={chip(lane === k)}>{l}</button>
        ))}
        {filters.flatMap((f) => f.pills.map(([k, l]) => (
          <button key={`${f.param}-${l}`} type="button" className={FLAT_CHIP_CLASS} aria-pressed={(picked[f.param] ?? null) === k} onClick={() => setPicked((p) => ({ ...p, [f.param]: k }))} style={chip((picked[f.param] ?? null) === k)}>{l}</button>
        )))}
        <button type="button" className={FLAT_CHIP_CLASS} aria-pressed={hot} onClick={() => setHot((v) => !v)} title="L10 at 70% or better" style={chip(hot)}>{hot ? '✓ 70%+ L10' : '70%+ L10'}</button>
      </div>
      {loading && !data ? <div style={{ fontSize: 12, color: C.text3 }}>Reading tonight’s lines…</div> : null}
      {data && !rows.length ? <div style={{ fontSize: 12, color: C.text3, padding: '12px 0' }}>{data.why || emptyNote}</div> : null}
      {rows.length ? (
        <>
          <div style={{ font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: accent }}>{rows.length} PROPS · L10 FIRST · UNDER {MIN_N} GAMES LEFT OUT</div>
          <Table rows={pv.shown} columns={columns} maxHeight={9999} maxRows={rows.length} heatMode="standouts" initialSort={null} />
          <ShowMoreButton open={pv.open} restN={pv.restN} toggle={pv.toggle} total={pv.total} itemWord="props" />
          <div style={{ fontSize: 12, color: C.text3, lineHeight: 1.5 }}>% = games he went over tonight’s line; small = the count. {dNote}{notes} Price = the best book over.</div>
        </>
      ) : null}
      </>)}
    </div>
  )
}
