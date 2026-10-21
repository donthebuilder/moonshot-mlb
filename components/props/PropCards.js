'use client'
import { useEffect, useMemo, useState } from 'react'
import { C as MLB_C, NUM_FONT as MLB_NUM, TYPE } from '../../lib/theme'
import VerdictHero, { PeriodTiles } from '../VerdictHero'
import MobileFold from '../MobileFold'
import { FilterPill } from '../Filters'
import { useSlip } from '../../lib/slip/store'
import { useCalledForSlip } from './slipCalls'
import BetSlip, { sameGameLine } from './BetSlip'
import { fetchJSON } from '../../lib/data'
import { pairHistV2Paths } from '../../lib/dataSource'
import { readPairHistV2 } from '../../lib/pairHistV2'
import { pairHistNotes } from '../../lib/slipPairHist'
import HelpTip from '../HelpTip'
import HeroStat from '../HeroStat'
import PropFind from './PropFind'
import { takeSlipSeed } from '../../lib/slipSeed'
import { useCallGate, HiddenCalledLine } from '../MemberGate'
import { lockedFor } from '../../lib/members/gate'

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

// HIS STORYLINES ON THE CARD (2026-10-20, Donovan: "there's text under that shows percentiles ... that needs their storylines
// or milestones that they're getting close to"). The same rows as the Storylines page and the home tape (/api/stories), his own,
// milestones first; the percentile line stays only on a card with no story. The long "priced for X, delivered Y" model rows stay
// on the Storylines page.
const STORY_MAX = 2
function StoryChips({ stories, C, NUM_FONT, accent }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      {stories.slice(0, STORY_MAX).map((s, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 11.5, lineHeight: 1.45, color: C.text2, minWidth: 0 }}>
          <span style={{ flexShrink: 0 }}>{s.icon}</span>
          <span style={{ minWidth: 0 }}>
            {(s.parts || []).map((x, j) => (x.t === 'name' && j === 0 && x.v === s.name ? null
              : x.t === 'num' ? <b key={j} style={{ fontFamily: NUM_FONT, color: accent }}>{x.v}</b>
                : x.t === 'name' ? <b key={j} style={{ color: C.text }}>{x.v}</b>
                  : <span key={j}>{j === 1 ? String(x.v).replace(/^\s+/, '') : x.v}</span>))}
          </span>
        </span>
      ))}
    </div>
  )
}

function useStoriesByPlayer(sport) {
  const [by, setBy] = useState(null)
  useEffect(() => {
    if (!sport) return undefined
    let alive = true
    fetch(`/api/stories?sport=${encodeURIComponent(sport)}`).then((x) => (x.ok ? x.json() : null)).then((j) => {
      if (!alive || !j) return
      const m = new Map()
      for (const s of j.stories || []) {
        if (s.type === 'model' || !s.player_id || String(s.player_id).startsWith('team:')) continue
        const k = String(s.player_id)
        if (!m.has(k)) m.set(k, [])
        m.get(k).push(s)
      }
      for (const l of m.values()) l.sort((x, y) => (y.type === 'milestone') - (x.type === 'milestone') || (y.rarity || 0) - (x.rarity || 0))
      setBy(m)
    }).catch(() => {})
    return () => { alive = false }
  }, [sport])
  return by
}

function Card({ a, r, k, onOpen, onWatch, watched, onSlip = null, inSlip = false, stories = null, C, NUM_FONT, accent, accentWash }) {
  const p = a.card(r, k)
  const storyLine = stories?.length ? <StoryChips stories={stories} C={C} NUM_FONT={NUM_FONT} accent={accent} /> : null
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
        line={storyLine || p.line}
        facts={p.facts}
        chips={p.chips}
        footer={p.tiles ? <PeriodTiles tiles={p.tiles} /> : null}
        right={(onWatch || onSlip) && (
          <span style={{ display: 'inline-flex', gap: 6, flexShrink: 0 }}>
            {/* + SLIP (2026-10-04, user review #4): only on a card with a price on its own bar */}
            {onSlip && (
              <button
                className="tap44"
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
                className="tap44"
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
  a: aIn, rows: rawRows = [], onOpen, onWatch, watchIds, compare = null,
  // find: { nameOf(r), teamOf(r), placeholder } turns on the search box + Filter button (MOONSHOT's Controls row).
  // compareOf(pool): the sport's Compare-two fold, fed ONLY the rows a non-member may see named. hero: the stat strip.
  find = null, compareOf = null, hero = false,
  theme = MLB_C, numFont = MLB_NUM, accent = MLB_C.orange, accentWash = 'rgba(249,115,22,.14)',
}) {
  const C = theme
  const NUM_FONT = numFont
  // THE MEMBERS GATE ON THE PROPS PAGE (2026-10-16, Donovan: "lock those too, what about the props page"). Props, lines, prices and stats are public; what a card says
  // about a CALLED pick is not. A row is CALLED here when the adapter gives it a market (WATCH is coverage, not a call). For a confirmed non-member the free four (counted
  // in the page's own order: best market score first) keep their cards; every other CALLED, not-started pick is a hitter with NO market (rolesOf [] -> he is in
  // Everyone / the quiet group, not in Picks, not on the slip's "called" shortcut or seed, not a suggested partner). Members, unknown membership, started games: unchanged.
  const isCall = (r) => aIn.rolesOf(r).some((k) => k !== 'WATCH' && k !== 'NONE')
  const lockKeyOf = (r) => (aIn.lockKey ? aIn.lockKey(r) : aIn.keyOf(r))
  const gateOf = useCallGate({
    rows: () => (rawRows || []).filter((r) => r && isCall(r)), source: rawRows, statusOf: () => 'called', keyOf: lockKeyOf,
    timeOf: (r) => aIn.startsAt(r), gradedOf: (r) => (aIn.gradedOf ? aIn.gradedOf(r) : false), rankOf: (r) => -(Number(aIn.score(r, aIn.primaryOf(r))) || 0),
  })
  const hiddenRow = (r) => {
    if (!gateOf || !isCall(r)) return false
    const g = gateOf(r)
    return lockedFor({ status: 'called', started: g.started, graded: g.graded, key: g.key, free: g.free, memberState: 'free' })
  }
  const a = useMemo(() => (gateOf ? { ...aIn, rolesOf: (r) => (hiddenRow(r) ? [] : aIn.rolesOf(r)), primaryOf: (r) => (hiddenRow(r) ? null : aIn.primaryOf(r)) } : aIn),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aIn, gateOf])
  const [market, setMarket] = useState('picks')
  const [query, setQuery] = useState('')
  const [fTeam, setFTeam] = useState('')
  const [fGame, setFGame] = useState('')
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
  // THE SLIP: ONE store per sport (lib/slip/store.js), the same slip the floating slip bar (components/Slip.js) and every player page add to.
  const sport = aIn.sportKey
  const storiesBy = useStoriesByPlayer(sport)
  const { legs: slip, toggle: toggleLeg, remove: removeLeg, clear: clearSlip, addMany } = useSlip(sport)
  const slipKeyOf = (r, k) => `${a.keyOf(r)}|${k}`
  // PAIRING HELP ON THE SLIP (the deleted Parlay Builder's useful parts, lib/slipPairs.js): only a product whose
  // adapter has the rules (MOONSHOT) gets the pair notes and the suggested partners; the rest are unchanged.
  const rowOfKey = useMemo(() => new Map((rawRows || []).map((r) => [String(a.keyOf(r)), r])), [rawRows, a])
  const slipLegs = useMemo(() => slip.map((l) => { const [rk, k] = String(l.key).split('|'); return { key: l.key, k, r: rowOfKey.get(rk) } }), [slip, rowOfKey])
  // TUDDY / LAMP / BUCKETS (2026-10-15): their adapters name the event the pair history counts (a.pairHist); two legs on it get the
  // pair's stored record from the same four-season file the Pairs page draws (lib/slipPairHist.js). Fetched once, and only when
  // the slip holds two legs, so a visit that never builds a slip costs nothing.
  const histSport = a.pairHist?.sport || null
  const [histFile, setHistFile] = useState(null)
  const wantHist = Boolean(histSport) && slip.length >= 2
  useEffect(() => {
    if (!wantHist) return undefined
    let alive = true
    fetchJSON(pairHistV2Paths(histSport), (j) => Boolean(readPairHistV2(j, histSport)))
      .then((j) => { if (alive) setHistFile(readPairHistV2(j, histSport)) })
      .catch(() => { if (alive) setHistFile(null) })
    return () => { alive = false }
  }, [wantHist, histSport])
  const pairNotes = useMemo(() => {
    if (slip.length < 2) return []
    if (a.slipNotes) return a.slipNotes(slipLegs)
    return a.pairHist ? pairHistNotes(slipLegs, histFile, a.pairHist) : []
  }, [a, slip.length, slipLegs, histFile])
  const partnerPicks = useMemo(() => (a.slipPartners && slip.length ? a.slipPartners(slipLegs, gateOf ? (rawRows || []).filter((r) => !hiddenRow(r)) : rawRows, Date.now()) : []), [a, slip.length, slipLegs, rawRows])
  // Names checked on the Numerology page arrive once (lib/slipSeed.js): each goes on the slip in the first
  // market it is priced in. Read from storage, not from `slip`, because the stored slip loads in an effect.
  const [seedNote, setSeedNote] = useState('')
  useEffect(() => {
    if (!a.acceptsSeed || !rawRows?.length) return
    const seed = takeSlipSeed()
    if (!seed) return
    const byId = new Map(rawRows.map((r) => [String(a.idOf(r)), r]))
    let added = 0
    const found = []
    for (const sr of seed) {
      const r = byId.get(String(a.idOf(sr))) || rawRows.find((x) => String(a.keyOf(x)) === String(a.keyOf(sr)))
      if (!r) continue
      const k = (a.rolesOf(r) || []).find((m) => a.priceNum(r, m) != null)
      if (!k) continue
      const key = `${a.keyOf(r)}|${k}`
      if (slip.some((l) => l.key === key)) continue
      found.push(legFor(r, k, 'seed'))
      added += 1
    }
    addMany(found)
    setSeedNote(`${added} of the ${seed.length} names you checked ${added === 1 ? 'is' : 'are'} on your slip${added < seed.length ? `; the other ${seed.length - added} have no price posted yet` : ''}.`)
  }, [a, rawRows])   // eslint-disable-line react-hooks/exhaustive-deps
  // a leg: the price is the book's real one on this pick's own bar, never made up
  const legFor = (r, k, source) => ({
    key: slipKeyOf(r, k), sport, id: String(a.idOf(r)), name: a.card(r, k).title, team: r?.team ?? r?.team_abbr ?? null, market: a.pillLabel(k),
    line: a.card(r, k).market ?? null, side: 'over', price: a.priceNum(r, k), game: a.gameOf ? a.gameOf(r) : null, source,
  })
  const toggleSlip = (r, k) => {
    const price = a.priceNum(r, k)
    if (price == null && !slip.some((l) => l.key === slipKeyOf(r, k))) return
    toggleLeg(legFor(r, k, 'card'))
  }
  useCalledForSlip({ a: aIn, rows: rawRows, legFor: (r, k, src) => ({ ...legFor(r, k, src) }) })
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

  // THE ROWS A NON-MEMBER MAY SEE NAMED: a hidden CALLED pick (see hiddenRow) is in no search result and in no Compare picker, so he cannot be
  // found by name. The gate is applied here, at the data the two controls read, not in the controls.
  const pool = useMemo(() => (rawRows || []).filter((r) => r && !hiddenRow(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rawRows, gateOf])
  const norm = (v) => String(v ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  const needle = norm(query)
  const finding = Boolean(find) && Boolean(needle || fTeam || fGame)
  const findTeams = useMemo(() => (find ? [...new Set((rawRows || []).map((r) => find.teamOf(r)).filter(Boolean))].sort() : []), [rawRows, find])
  const findGames = useMemo(() => {
    if (!find || !a.gameOf) return []
    const m = new Map()
    for (const r of rawRows || []) { const g = a.gameOf(r); if (g?.key && !m.has(g.key)) m.set(g.key, g.label) }
    return [...m].map(([key, label]) => ({ key, label }))
  }, [rawRows, find, a])
  const found = useMemo(() => {
    if (!find || (!needle && !fTeam && !fGame)) return rawRows
    const hide = new Set(needle ? (rawRows || []).filter((r) => r && hiddenRow(r)) : [])
    return (rawRows || []).filter((r) => {
      if (!r) return false
      if (needle) {
        if (hide.has(r)) return false
        const tm = norm(find.teamOf(r))
        if (!norm(find.nameOf(r)).includes(needle) && tm !== needle && !(needle.length >= 2 && tm.startsWith(needle))) return false
      }
      if (fTeam && find.teamOf(r) !== fTeam) return false
      if (fGame && String(a.gameOf?.(r)?.key) !== String(fGame)) return false
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawRows, find, needle, fTeam, fGame, a, gateOf])
  const rows = useMemo(() => (found || []).filter((r) => r && a.idOf(r)), [found, a])
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
    // a search / team / game in force looks at everyone (Picks would hide a player who is not called), uncut
    const mk = finding && market === 'picks' ? 'everyone' : market
    const single = mk !== 'picks' && mk !== 'everyone'
    let out = rows
    if (mk === 'picks') out = out.filter((r) => a.rolesOf(r).length)
    else if (single) out = out.filter((r) => a.rolesOf(r).includes(mk))
    if (onlyWatched) out = out.filter((r) => watchIds?.has(a.idOf(r)))
    if (onlyUpcoming) out = out.filter((r) => { const t = a.startsAt(r); return Number.isFinite(t) && t > now })
    if (onlyPriced) out = out.filter((r) => a.priced(r, single ? mk : (a.primaryOf(r) || mk)))
    const buckets = new Map()
    for (const r of out) {
      const k = single ? mk : (a.primaryOf(r) || 'NONE')
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
  }, [rows, market, finding, onlyPriced, onlyUpcoming, onlyWatched, watchIds, now, sortBy, a])

  const shown = useMemo(() => (precision > 0 && !finding ? groups.map((g) => ({ key: g.key, rows: g.rows.slice(0, precision) })) : groups), [groups, precision, finding])
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

  // THE HERO STRIP (hero): what the slate is, from the same rows the cards read -- games, how many have started, the calls, the priced calls.
  const heroStats = useMemo(() => {
    if (!hero) return null
    const byGame = new Map()
    let priced = 0
    let calls = 0
    for (const r of rawRows || []) {
      if (!r || !a.idOf(r)) continue
      const g = a.gameOf ? a.gameOf(r) : null
      const t = a.startsAt(r)
      if (g?.key) { const cur = byGame.get(g.key); if (!cur || (Number.isFinite(t) && t < cur)) byGame.set(g.key, Number.isFinite(t) ? t : (cur ?? Infinity)) }
      const rl = a.rolesOf(r)
      if (rl.length) calls += 1
      if (rl.some((k) => a.priced(r, k))) priced += 1
    }
    const n = byGame.size
    const started = [...byGame.values()].filter((t) => Number.isFinite(t) && t <= now).length
    return { n, started, priced, calls }
  }, [hero, rawRows, a, now])

  return (
    <div>
      {heroStats && (
        <div className="chip-row" style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '2px 0 4px' }}>
          {heroStats.n > 0 && <HeroStat theme={C} numFont={NUM_FONT} label="GAMES" value={heroStats.n} />}
          {heroStats.n > 0 && <HeroStat theme={C} numFont={NUM_FONT} label="STARTED" value={`${heroStats.started}/${heroStats.n}`} col={C.text} />}
          <HeroStat theme={C} numFont={NUM_FONT} label={`${a.unit === 'badge' ? 'BADGES' : 'CALLS'}`} value={heroStats.calls} col={accent} />
          <HeroStat theme={C} numFont={NUM_FONT} label="PRICED" value={heroStats.priced} col={C.text} />
        </div>
      )}
      {find && (
        <PropFind query={query} setQuery={setQuery} team={fTeam} setTeam={setFTeam} game={fGame} setGame={setFGame} market={market} setMarket={(m) => { setMarket(m); setAll(false) }}
          teams={findTeams} games={findGames} markets={pills.map((o) => ({ key: o.key, label: o.label }))}
          placeholder={find.placeholder} C={C} NUM_FONT={NUM_FONT} accent={accent} />
      )}
      {(compare || compareOf) && (
        <MobileFold title="⚖️ Compare two picks" summary="side by side, with a verdict" accent={accent}>{compareOf ? compareOf(pool) : compare}</MobileFold>
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

      {gateOf && <HiddenCalledLine n={gateOf.hidden} C={C} NUM_FONT={NUM_FONT} style={{ marginTop: 2 }} />}
      {seedNote && <div role="status" style={{ fontSize: TYPE.body, color: C.text2, margin: '4px 0 6px', lineHeight: 1.5 }}>{seedNote}</div>}
      <BetSlip pairNotes={pairNotes} partners={partnerPicks} onAdd={(p) => toggleSlip(p.r, p.k)} legs={slip} onRemove={removeLeg} onClear={clearSlip} C={C} NUM_FONT={NUM_FONT} accent={accent} />
      {sameGame.length > 0 && (
        <div style={{ fontSize: TYPE.body, color: C.text2, margin: '4px 0 6px', lineHeight: 1.5 }}>
          {sameGameLine(sameGame.map((x) => ({ label: x.label, n: x.ids.size })))}
          <HelpTip label="Same game" color={C.text3} text="Picks from one game share the weather, starters and game flow. For MLB home runs we measured that link: two hitters in the same game homered together 1.05x as often as two unrelated hitters, which is about independent. We have not measured it for other markets. The parlay chance above treats every pick as separate." />
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
                  <Card key={a.keyOf(r)} a={a} r={r} k={g.key} stories={storiesBy?.get(String(a.idOf(r))) || null} onOpen={onOpen} onWatch={onWatch} watched={watchIds?.has(a.idOf(r))}
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
