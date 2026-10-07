'use client'
import { useEffect, useMemo, useState } from 'react'
import { C as MLB_C, NUM_FONT as MLB_NUM, TYPE } from '../../lib/theme'
import VerdictHero, { PeriodTiles } from '../VerdictHero'
import MobileFold from '../MobileFold'
import { FilterPill } from '../Filters'
import BetSlip, { sameGameLine } from './BetSlip'
import HelpTip from '../HelpTip'
import { takeSlipSeed } from '../../lib/slipSeed'

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
//     gameOf(r) -> { key, label }|null   which game (the same-game note on Picks)
//     precisionKey                localStorage key for the remembered cut
//     sortTimeLabel               'First pitch' / 'Kickoff' / 'Puck drop' / 'Tip'
//     everyoneLabel, picksTitle, unit ('badge' / 'call')
//   }

const SOFT_CAP = 60
const PRECISION = [
  { key: 0, label: 'All', title: 'Every call published tonight.' },
  { key: 1, label: 'Top 1', title: 'The single best pick in each market.' },
  { key: 2, label: 'Top 2', title: 'The top two in each market.' },
  { key: 3, label: 'Top 3', title: 'The top three in each market.' },
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

function Card({ a, r, k, onOpen, onWatch, watched, onSlip = null, inSlip = false, C, NUM_FONT, accent, accentWash }) {
  const p = a.card(r, k)
  return (
    <div onClick={onOpen ? () => onOpen(r) : undefined}
      style={{ cursor: onOpen ? 'pointer' : 'default', minWidth: 0 }}>
      <VerdictHero
        theme={C} numFont={NUM_FONT}
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
        right={(onWatch || onSlip) && (
          <span style={{ display: 'inline-flex', gap: 6, flexShrink: 0 }}>
            {/* + SLIP (2026-10-04, user review #4): only on a card with a price on its own bar */}
            {onSlip && (
              <button
                onClick={(e) => { e.stopPropagation(); onSlip(r, k) }}
                title={inSlip ? 'Remove from your slip' : 'Add to your slip'}
                style={{
                  flexShrink: 0, background: inSlip ? accentWash : 'transparent',
                  border: `1px solid ${inSlip ? accent : C.border}`,
                  color: inSlip ? accent : C.text3,
                  borderRadius: 7, padding: '6px 8px', fontSize: 11, fontWeight: 800, lineHeight: 1, cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >{inSlip ? '✓ slip' : '+ slip'}</button>
            )}
            {onWatch && (
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
          </span>
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
  // NOT STARTED BY DEFAULT (2026-10-04 user review #16: finished games sat
  // beside tonight's). null = automatic: on while any game is still to come,
  // off once everything is under way or final, so the default never empties
  // the page. A tap sets it for good.
  const [upcomingPick, setOnlyUpcoming] = useState(null)
  const [onlyWatched, setOnlyWatched] = useState(false)
  const [sortBy, setSortBy] = useState('score')
  // THE SLIP: legs kept in this browser for a day (components/props/BetSlip.js)
  const slipKey = `${a.precisionKey}_slip_v1`
  const [slip, setSlip] = useState([])
  useEffect(() => {
    try { const v = JSON.parse(window.localStorage.getItem(slipKey) || '[]'); setSlip(Array.isArray(v) ? v.filter((l) => Date.now() - (l.at || 0) < 864e5) : []) } catch { /* private mode */ }
  }, [slipKey])
  const saveSlip = (next) => { setSlip(next); try { window.localStorage.setItem(slipKey, JSON.stringify(next)) } catch { /* private mode */ } }
  const slipKeyOf = (r, k) => `${a.keyOf(r)}|${k}`
  // PAIRING HELP ON THE SLIP (the deleted Parlay Builder's useful parts, lib/slipPairs.js): only a product whose
  // adapter has the rules (MOONSHOT) gets the pair notes and the suggested partners; the rest are unchanged.
  const rowOfKey = useMemo(() => new Map((rawRows || []).map((r) => [String(a.keyOf(r)), r])), [rawRows, a])
  const slipLegs = useMemo(() => slip.map((l) => { const [rk, k] = String(l.key).split('|'); return { key: l.key, k, r: rowOfKey.get(rk) } }), [slip, rowOfKey])
  const pairNotes = useMemo(() => (a.slipNotes && slip.length >= 2 ? a.slipNotes(slipLegs) : []), [a, slip.length, slipLegs])
  const partnerPicks = useMemo(() => (a.slipPartners && slip.length ? a.slipPartners(slipLegs, rawRows, Date.now()) : []), [a, slip.length, slipLegs, rawRows])
  // Names checked on the Numerology page arrive once (lib/slipSeed.js): each goes on the slip in the first
  // market it is priced in. Read from storage, not from `slip`, because the stored slip loads in an effect.
  const [seedNote, setSeedNote] = useState('')
  useEffect(() => {
    if (!a.acceptsSeed || !rawRows?.length) return
    const seed = takeSlipSeed()
    if (!seed) return
    let cur = []
    try { const v = JSON.parse(window.localStorage.getItem(slipKey) || '[]'); cur = Array.isArray(v) ? v.filter((l) => Date.now() - (l.at || 0) < 864e5) : [] } catch { /* private mode */ }
    const byId = new Map(rawRows.map((r) => [String(a.idOf(r)), r]))
    let added = 0
    const next = [...cur]
    for (const sr of seed) {
      const r = byId.get(String(a.idOf(sr))) || rawRows.find((x) => String(a.keyOf(x)) === String(a.keyOf(sr)))
      if (!r) continue
      const k = (a.rolesOf(r) || []).find((m) => a.priceNum(r, m) != null)
      if (!k) continue
      const key = `${a.keyOf(r)}|${k}`
      if (next.some((l) => l.key === key)) continue
      next.push({ key, name: a.card(r, k).title, market: a.pillLabel(k), price: a.priceNum(r, k), game: a.gameOf ? a.gameOf(r) : null, at: Date.now() })
      added += 1
    }
    setSlip(next)
    try { window.localStorage.setItem(slipKey, JSON.stringify(next)) } catch { /* private mode */ }
    setSeedNote(`${added} of the ${seed.length} names you checked ${added === 1 ? 'is' : 'are'} on your slip${added < seed.length ? `; the other ${seed.length - added} have no price posted yet` : ''}.`)
  }, [a, rawRows, slipKey])   // eslint-disable-line react-hooks/exhaustive-deps
  const toggleSlip = (r, k) => {
    const key = slipKeyOf(r, k)
    if (slip.some((l) => l.key === key)) return saveSlip(slip.filter((l) => l.key !== key))
    const price = a.priceNum(r, k)
    if (price == null) return
    saveSlip([...slip, { key, name: a.card(r, k).title, market: a.pillLabel(k), price, game: a.gameOf ? a.gameOf(r) : null, at: Date.now() }])
  }
  const now = useMemo(() => Date.now(), [rawRows, upcomingPick]) // eslint-disable-line react-hooks/exhaustive-deps
  const anyUpcoming = useMemo(() => (rawRows || []).some((r) => { const t = a.startsAt(r); return Number.isFinite(t) && t > now }), [rawRows, a, now])
  const onlyUpcoming = upcomingPick ?? anyUpcoming
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
  // SAME GAME, ONE BET (2026-10-04 user review #12: three Utah skaters read as
  // three chances). Among tonight's picks (the filters apply, the Top-N cut
  // doesn't), the games holding two or more
  // different players. Needs the adapter's gameOf(row) -> { key, label }.
  const sameGame = useMemo(() => {
    if (market !== 'picks' || !a.gameOf) return []
    const by = new Map()
    for (const g of groups) for (const r of g.rows) {
      const gm = a.gameOf(r)
      if (!gm?.key) continue
      if (!by.has(gm.key)) by.set(gm.key, { label: gm.label, ids: new Set() })
      by.get(gm.key).ids.add(a.idOf(r))
    }
    return [...by.values()].filter((x) => x.ids.size >= 2).sort((x, y) => y.ids.size - x.ids.size)
  }, [groups, market, a])
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
        <span style={kicker}>Per market</span>
        {PRECISION.map((o) => (
          <FilterPill key={o.key} active={precision === o.key} onClick={() => pickPrecision(o.key)} title={T.precision[o.key] || o.title}>{o.label}</FilterPill>
        ))}
      </div>

      <div style={{ fontSize: TYPE.body, color: C.text3, margin: '8px 0 4px', lineHeight: 1.55 }}>
        {hidden > 0 ? `showing ${total - hidden} of ${total}` : `${total} card${total === 1 ? '' : 's'}`}
        {dropped > 0 && (
          <>
            {' · '}top <b style={{ color: C.text2 }}>{precision}</b> per market, <b style={{ color: C.text2 }}>{dropped}</b> more under <b style={{ color: C.text2 }}>All</b>
          </>
        )}
      </div>

      {seedNote && <div role="status" style={{ fontSize: TYPE.body, color: C.text2, margin: '4px 0 6px', lineHeight: 1.5 }}>{seedNote}</div>}
      <BetSlip pairNotes={pairNotes} partners={partnerPicks} onAdd={(p) => toggleSlip(p.r, p.k)} legs={slip} onRemove={(key) => saveSlip(slip.filter((l) => l.key !== key))} onClear={() => saveSlip([])} C={C} NUM_FONT={NUM_FONT} accent={accent} />
      {sameGame.length > 0 && (
        <div style={{ fontSize: TYPE.body, color: C.text2, margin: '4px 0 6px', lineHeight: 1.5 }}>
          {sameGameLine(sameGame.map((x) => ({ label: x.label, n: x.ids.size })))}
          <HelpTip label="Same game" color={C.text3} text="Picks from one game rise or fall together, so count them as one bet, not several." />
        </div>
      )}
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
                  <Card key={a.keyOf(r)} a={a} r={r} k={g.key} onOpen={onOpen} onWatch={onWatch} watched={watchIds?.has(a.idOf(r))}
                    onSlip={g.key !== 'NONE' && a.priceNum(r, g.key) != null ? toggleSlip : null} inSlip={slip.some((l) => l.key === slipKeyOf(r, g.key))}
                    C={C} NUM_FONT={NUM_FONT} accent={accent} accentWash={accentWash} />
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
