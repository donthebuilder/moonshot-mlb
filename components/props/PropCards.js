'use client'
import { useEffect, useMemo, useState } from 'react'
import { C as MLB_C, NUM_FONT as MLB_NUM, TYPE } from '../../lib/theme'
import VerdictHero, { PeriodTiles } from '../VerdictHero'
import MobileFold from '../MobileFold'
import { FilterPill } from '../Filters'

// ══ PROP CARDS, EVERY PRODUCT (2026-10-04) ══════════════════════════════════
// Donovan: "make sure the props pages look like the mlb one". This is
// MOONSHOT's Props grid (components/tabs/PropsGrid.js, whose long notes on the
// dial, the precision cut, the filters and the per-market ranking all still
// apply) lifted out unchanged: market pills, Only / Sort, Precision, cards
// grouped by market and ranked only inside their own market, the soft cap.
// Each product passes an ADAPTER -- its markets, its words, its card content --
// and its theme. Nothing here knows a sport; nothing here computes a score.
//
//   adapter = {
//     markets: [key...]          group order (a row with no called market -> 'NONE')
//     pillLabel(k), groupLabel(k), color(k)
//     rolesOf(r) -> [key...]      markets this row is CALLED in
//     primaryOf(r) -> key|null
//     score(r, k)                 the market's own score (ranking inside a block)
//     idOf(r), keyOf(r)
//     card(r, k) -> VerdictHero props (photo, title, badge, badgeQuiet, meta,
//                   metaRight, market, line, facts, chips, tiles, dialTitle)
//     priced(r, k) -> bool        the book quotes THIS market's own bar
//     priceNum(r, k) -> number|null
//     startsAt(r) -> ms|NaN
//     precisionKey                localStorage key for the remembered cut
//     sortTimeLabel               'First pitch' / 'Kickoff' / 'Puck drop' / 'Tip'
//     everyoneLabel, picksTitle, unit ('badge' / 'call')
//   }

const SOFT_CAP = 60
const PRECISION = [
  { key: 0, label: 'All', title: 'Every call published tonight.' },
  { key: 1, label: '🎯 1 each', title: 'The single best pick in each market.' },
  { key: 2, label: '2 each', title: 'The top two in each market.' },
  { key: 3, label: '3 each', title: 'The top three in each market.' },
]

function GroupHead({ label, color, count, C, NUM_FONT }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '16px 0 9px' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
      <span style={{
        fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.14em',
        textTransform: 'uppercase', color, whiteSpace: 'nowrap',
      }}>{label}</span>
      <span style={{ fontSize: TYPE.micro, fontFamily: NUM_FONT, fontWeight: 700, color: C.text3 }}>{count}</span>
      <span style={{ flex: 1, height: 1, background: C.border, minWidth: 8 }} />
    </div>
  )
}

function Card({ a, r, k, onOpen, onWatch, watched, C, accent, accentWash }) {
  const p = a.card(r, k)
  return (
    <div onClick={onOpen ? () => onOpen(r) : undefined}
      style={{ cursor: onOpen ? 'pointer' : 'default', minWidth: 0 }}>
      <VerdictHero
        lead="face"
        photo={p.photo}
        col={a.color(k)}
        score={a.score(r, k)}
        dialTitle={p.dialTitle}
        market={p.market}
        title={p.title}
        badge={p.badge}
        badgeQuiet={p.badgeQuiet}
        meta={p.meta}
        metaRight={p.metaRight}
        line={p.line}
        facts={p.facts}
        chips={p.chips}
        footer={p.tiles ? <PeriodTiles tiles={p.tiles} /> : null}
        right={onWatch && (
          <button
            onClick={(e) => { e.stopPropagation(); onWatch(r) }}
            title={watched ? 'Remove from watchlist' : 'Add to watchlist'}
            style={{
              flexShrink: 0, background: watched ? accentWash : 'transparent',
              border: `1px solid ${watched ? accent : C.border}`,
              color: watched ? accent : C.text3,
              borderRadius: 7, padding: '6px 10px', fontSize: 13, lineHeight: 1, cursor: 'pointer',
            }}
          >{watched ? '★' : '☆'}</button>
        )}
      />
    </div>
  )
}

export default function PropCards({
  a, rows: rawRows = [], onOpen, onWatch, watchIds, compare = null,
  theme = MLB_C, numFont = MLB_NUM, accent = MLB_C.orange, accentWash = 'rgba(249,115,22,.14)',
}) {
  const C = theme
  const NUM_FONT = numFont
  const [market, setMarket] = useState('picks')
  const [all, setAll] = useState(false)
  const [precision, setPrecision] = useState(1)
  const [onlyPriced, setOnlyPriced] = useState(false)
  const [onlyUpcoming, setOnlyUpcoming] = useState(false)
  const [onlyWatched, setOnlyWatched] = useState(false)
  const [sortBy, setSortBy] = useState('score')
  const now = useMemo(() => Date.now(), [rawRows, onlyUpcoming]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(a.precisionKey)
      if (raw === null) return
      const v = Number(raw)
      if (Number.isFinite(v) && v >= 0 && v <= 3) setPrecision(v)
    } catch { /* private mode */ }
  }, [a.precisionKey])
  const pickPrecision = (v) => {
    setPrecision(v); setAll(false)
    try { window.localStorage.setItem(a.precisionKey, String(v)) } catch { /* private mode */ }
  }

  const rows = useMemo(() => (rawRows || []).filter((r) => r && a.idOf(r)), [rawRows, a])
  const callable = useMemo(() => a.markets.filter((k) => k !== 'NONE'), [a])

  const counts = useMemo(() => {
    const c = { picks: 0, everyone: rows.length }
    for (const k of callable) c[k] = 0
    for (const r of rows) {
      const toks = a.rolesOf(r)
      if (toks.length) c.picks += 1
      for (const k of callable) if (toks.includes(k)) c[k] += 1
    }
    return c
  }, [rows, callable, a])

  const groups = useMemo(() => {
    const single = market !== 'picks' && market !== 'everyone'
    let out = rows
    if (market === 'picks') out = out.filter((r) => a.rolesOf(r).length)
    else if (single) out = out.filter((r) => a.rolesOf(r).includes(market))
    if (onlyWatched) out = out.filter((r) => watchIds?.has(a.idOf(r)))
    if (onlyUpcoming) out = out.filter((r) => { const t = a.startsAt(r); return Number.isFinite(t) && t > now })
    if (onlyPriced) out = out.filter((r) => a.priced(r, single ? market : (a.primaryOf(r) || market)))
    const buckets = new Map()
    for (const r of out) {
      const k = single ? market : (a.primaryOf(r) || 'NONE')
      if (!buckets.has(k)) buckets.set(k, [])
      buckets.get(k).push(r)
    }
    return a.markets.filter((k) => buckets.has(k)).map((k) => {
      const sc = (r) => a.score(r, k) ?? -1
      const cmp = sortBy === 'price'
        ? (x, y) => {
          const px = a.priceNum(x, k); const py = a.priceNum(y, k)
          return (py ?? -1e9) - (px ?? -1e9) || sc(y) - sc(x)
        }
        : sortBy === 'time'
          ? (x, y) => (a.startsAt(x) || 9e15) - (a.startsAt(y) || 9e15) || sc(y) - sc(x)
          : (x, y) => sc(y) - sc(x) || String(a.card(x, k).title).localeCompare(String(a.card(y, k).title))
      return { key: k, rows: buckets.get(k).sort(cmp) }
    })
  }, [rows, market, onlyPriced, onlyUpcoming, onlyWatched, watchIds, now, sortBy, a])

  const shown = useMemo(() => (precision > 0 ? groups.map((g) => ({ key: g.key, rows: g.rows.slice(0, precision) })) : groups), [groups, precision])
  const total = useMemo(() => shown.reduce((s, g) => s + g.rows.length, 0), [shown])
  const dropped = useMemo(() => groups.reduce((s, g) => s + g.rows.length, 0) - total, [groups, total])
  const capped = useMemo(() => {
    if (all || total <= SOFT_CAP) return shown
    let left = SOFT_CAP
    const out = []
    for (const g of shown) {
      if (left <= 0) break
      out.push({ key: g.key, rows: g.rows.slice(0, left) })
      left -= Math.min(left, g.rows.length)
    }
    return out
  }, [shown, total, all])
  const hidden = total - capped.reduce((s, g) => s + g.rows.length, 0)

  const pills = [
    { key: 'picks', label: 'Picks', count: counts.picks, title: a.picksTitle },
    ...callable.map((k) => ({ key: k, label: a.pillLabel(k), count: counts[k] })),
    { key: 'everyone', label: a.everyoneLabel || 'Everyone', count: counts.everyone },
  ]
  const kicker = { fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.1em', color: C.text3, textTransform: 'uppercase', fontFamily: NUM_FONT, flexShrink: 0 }
  const unit = a.unit || 'badge'
  // the product's own words where it has them (MOONSHOT keeps its originals)
  const T = { priced: "Cards where the book has posted a number on this pick's OWN bar.", upcoming: 'Games that have not started yet.', watched: 'Only names on your watchlist.', sortScore: "Each market's own score -- cards only rank against cards measured the same way.", sortPrice: 'Longest price first, within each market block. An unpriced card sinks.', sortTime: 'Earliest start first, within each market block.', empty: 'No board published yet, or the market filter left nobody. Clear it above.', precision: {}, ...(a.copy || {}) }

  return (
    <div>
      {compare && (
        <MobileFold title="⚖️ Compare two picks" summary="side by side, with a verdict" accent={accent}>{compare}</MobileFold>
      )}
      <div className="chip-row" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', paddingBottom: 2 }}>
        {pills.map((o) => (
          <FilterPill key={o.key} active={market === o.key} onClick={() => { setMarket(o.key); setAll(false) }} count={o.count} title={o.title}>{o.label}</FilterPill>
        ))}
      </div>
      <div className="chip-row" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
        <span style={kicker}>Only</span>
        <FilterPill active={onlyPriced} onClick={() => setOnlyPriced(!onlyPriced)}
          title={T.priced}>💵 Priced</FilterPill>
        <FilterPill active={onlyUpcoming} onClick={() => setOnlyUpcoming(!onlyUpcoming)}
          title={T.upcoming}>⏱ Not started</FilterPill>
        <FilterPill active={onlyWatched} onClick={() => setOnlyWatched(!onlyWatched)}
          title={T.watched}>★ Watchlist</FilterPill>
        <span style={{ width: 6 }} />
        <span style={kicker}>Sort</span>
        {[['score', 'Score'], ['price', 'Longest price'], ['time', a.sortTimeLabel || 'Start time']].map(([k, label]) => (
          <FilterPill key={k} active={sortBy === k} onClick={() => setSortBy(k)}
            title={k === 'score' ? T.sortScore : k === 'price' ? T.sortPrice : T.sortTime}>{label}</FilterPill>
        ))}
      </div>
      <div className="chip-row" style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
        <span style={kicker}>Precision</span>
        {PRECISION.map((o) => (
          <FilterPill key={o.key} active={precision === o.key} onClick={() => pickPrecision(o.key)} title={T.precision[o.key] || o.title}>{o.label}</FilterPill>
        ))}
      </div>

      <div style={{ fontSize: TYPE.body, color: C.text3, margin: '8px 0 4px', lineHeight: 1.55 }}>
        {hidden > 0 ? `showing ${total - hidden} of ${total}` : `${total} card${total === 1 ? '' : 's'}`}
        {' — the verdict first, tap one for the full read.'}
        {dropped > 0 && (
          <>
            {' '}<b style={{ color: C.text2 }}>Precision is on</b> — the top{' '}
            {precision === 1 ? 'pick' : `${precision}`} in each market, with{' '}
            <b style={{ color: C.text2 }}>{dropped}</b> further {unit}{dropped === 1 ? '' : 's'} cut.
            {' '}Nothing is deleted — switch to <b style={{ color: C.text2 }}>All</b> for the whole card.
          </>
        )}
      </div>

      {total === 0 ? (
        <div style={{ fontSize: TYPE.body, color: C.text3, marginTop: 10 }}>
          Nothing matches.{' '}
          {onlyPriced || onlyUpcoming || onlyWatched
            ? `The ${[onlyPriced && 'Priced', onlyUpcoming && 'Not started', onlyWatched && 'Watchlist'].filter(Boolean).join(' + ')} filter left nobody in this market — turn one off above.`
            : T.empty}
        </div>
      ) : (
        <>
          {capped.map((g) => (
            <div key={g.key}>
              <GroupHead label={a.groupLabel(g.key)} color={a.color(g.key)} count={g.rows.length} C={C} NUM_FONT={NUM_FONT} />
              <div style={{ display: 'grid', gap: 11, gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 330px), 1fr))' }}>
                {g.rows.map((r) => (
                  <Card key={a.keyOf(r)} a={a} r={r} k={g.key} onOpen={onOpen} onWatch={onWatch} watched={watchIds?.has(a.idOf(r))} C={C} accent={accent} accentWash={accentWash} />
                ))}
              </div>
            </div>
          ))}
          {hidden > 0 && (
            <div style={{ marginTop: 14 }}>
              <FilterPill onClick={() => setAll(true)} count={hidden}>Show the rest</FilterPill>
            </div>
          )}
        </>
      )}
    </div>
  )
}
