'use client'
import { useMemo } from 'react'
import PropCards from '../props/PropCards'
import TeamMark from '../TeamMark'
import { faceUrl } from '../PlayerFace'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { NBA_MARKETS } from '../../lib/nba/model'
import { RAW_OF } from '../../lib/nba/legs'
import { useBucketsBoard } from '../../lib/nba/useBuckets'
import { useFollowing } from '../../lib/dash/follow'
import { useLiveFetch } from '../../lib/useLiveFetch'
import { nbaQuote } from '../../lib/nba/oddsQuote'
import { fmtOdds } from '../../lib/odds'
import LineMoveChip from '../LineMoveChip'
import BucketsCompare from './BucketsCompare'
import { STATUS_WORD } from '../../lib/callStatus'

// 🏀 BUCKETS PROPS, MOONSHOT'S PAGE (2026-10-04, Donovan: "make sure the props
// pages look like the mlb one"). The shared grid (components/props/PropCards.js)
// on BUCKETS' eight markets, one /api/buckets/board read each -- the same rows the
// board below uses. CALLED / ON THE BOARD come from the board (lib/nba/model
// scoreNight), the why line from the board's own whyNba, the tiles from the
// legs the market's score is built from. The price is the book's, only at the card's own bar (nbaQuote).

const KEYS = ['pts', 'reb', 'ast', '3pm', 'pra', 'dd', 'td', 'first']
const MARKETS = [...KEYS, 'NONE']
const SHORT = { pts: 'PTS', reb: 'REB', ast: 'AST', '3pm': '3PM', pra: 'PRA', dd: 'Double-double', td: 'Triple-double', first: 'First basket', NONE: 'On the board' }
const LEG = { ptsPg: 'PTS / G', rebPg: 'REB / G', astPg: 'AST / G', tpmPg: '3PM / G', tpaPg: '3PA / G', tpPct: '3P%', praPg: 'PRA / G', ddRate: 'DD GAMES', ddRecent: 'DD LAST 10', tdRate: 'TD GAMES', minPg: 'MIN / G', fgaPg: 'FGA / G', ftaPg: 'FTA / G', fgaShare: 'FGA SHARE', oppPts: 'OPP PTS', oppReb: 'OPP REB', oppAst: 'OPP AST', oppTpm: 'OPP 3PM' }
const fmt = (leg, v) => {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  if (leg === 'tpPct' || leg === 'fgaShare' || leg === 'ddRate' || leg === 'ddRecent' || leg === 'tdRate') return `${Math.round(n <= 1 ? n * 100 : n)}%`
  return (Math.round(n * 10) / 10).toFixed(1)
}

function bucketsAdapter(startOf, odds) {
  // the book's price at the card's own bar (lib/nba/oddsQuote.js, as BucketsCard); DD / TD / first basket have no book line here: unpriced
  const quoteOf = (r, k) => nbaQuote(odds, r.id, k === 'NONE' ? KEYS.find((m) => r[m]) : k)
  const color = (k) => (k === 'NONE' ? C.text3 : C.purple)   // ONE accent (2026-10-07 colour diet): the market's name says which market it is
  const rowOf = (r, k) => (k === 'NONE' ? KEYS.map((m) => r[m]).find(Boolean) : r[k])
  return {
    markets: MARKETS,
    pillLabel: (k) => SHORT[k],
    groupLabel: (k) => (k === 'NONE' ? SHORT.NONE : NBA_MARKETS[k]?.label || SHORT[k]),
    color,
    rolesOf: (r) => KEYS.filter((k) => r[k]?.status === 'called'),
    primaryOf: (r) => KEYS.find((k) => r[k]?.status === 'called') || null,
    score: (r, k) => { const x = rowOf(r, k); return Number.isFinite(x?.score) ? x.score : null },
    idOf: (r) => String(r.id),
    keyOf: (r) => `${r.id}-${r.gameId}`,
    card: (r, k) => {
      const x = rowOf(r, k) || {}
      const legs = (NBA_MARKETS[k === 'NONE' ? 'pts' : k]?.legs || []).slice(0, 3)
      const chips = []
      // the result, once graded (audit: BUCKETS cards never showed hit / miss)
      if (x.hit === true || x.hit === false) chips.push({ t: k === 'first' ? (x.hit ? '✅ scored first' : '❌ not first') : k === 'dd' || k === 'td' ? (x.hit ? `✅ ${SHORT[k].toLowerCase()}` : `❌ no ${SHORT[k].toLowerCase()}`) : `${x.hit ? '✅' : '❌'} ${x.actual ?? '—'} ${SHORT[k]}`, warn: !x.hit })
      else if (x.voidReason) chips.push({ t: `➖ void · ${x.voidReason}`, warn: true })
      if (x.injury) chips.push({ t: `⚠ ${x.injury}`, warn: true })
      if (x.role && chips.length < 2) chips.push({ t: x.role, warn: false })
      return {
        photo: faceUrl({ sport: 'nba', id: r.id, size: 96 }),
        dialTitle: `${SHORT[k]} score — BUCKETS' number for this market, 0-100 within tonight's pool`,
        market: NBA_MARKETS[k]?.label || SHORT[k],
        title: r.name,
        badge: STATUS_WORD[x.status] || STATUS_WORD.off,   // lib/callStatus words, never typed here (audit 2026-10-20)
        badgeQuiet: x.status !== 'called',
        meta: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, maxWidth: '100%' }}>
          <TeamMark sport="nba" abbr={r.team} variant="logo" px={16} />
          <span>{r.home ? 'vs' : '@'}</span>
          <span data-opp="" style={{ opacity: .62 }}>{r.opp}</span>{/* the opponent is quiet text: one logo per player (10-18) */}
          {r.pos ? <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>· {r.pos}</span> : null}
        </span>,
        metaRight: (() => { const q = quoteOf(r, k); return q ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{fmtOdds(q.best_over ?? q.over)}<LineMoveChip quote={q} theme={C} numFont={NUM_FONT} compact /></span> : null })(),
        line: x.why || null,
        facts: null,
        chips: chips.slice(0, 2),
        tiles: legs.map((l) => { const rk = RAW_OF[l] || l; return { k: LEG[rk] || LEG[l] || l, v: fmt(rk, x.legs?.[rk]) } }),
      }
    },
    priced: (r, k) => Boolean(quoteOf(r, k)),
    priceNum: (r, k) => { const q = quoteOf(r, k); return q ? Number(q.best_over ?? q.over) : null },
    startsAt: (r) => startOf.get(String(r.gameId)) ?? NaN,
    gameOf: (r) => (r?.gameId ? { key: String(r.gameId), label: r.home ? `${r.opp}@${r.team}` : `${r.team}@${r.opp}` } : null),
    // the pair history the slip quotes (lib/slipPairHist.js): two 25-point (points market) legs, from our own graded games
    pairHist: { sport: 'nba', idOf: (r) => String(r.id), nameOf: (r) => r.name, isEventLeg: (k) => k === 'pts' },
    sportKey: 'nba',
    precisionKey: 'buckets_precision_v1',
    sortTimeLabel: 'Tip-off',
    picksTitle: 'everyone called tonight, in any market',
    unit: 'call',
    copy: { priced: "Cards where a book's line is this card's own bar (PTS 25+, REB 10+, ...). Double-double, triple-double and first basket have no book line." },
  }
}

export default function BucketsProps({ date = null, onOpenPlayer }) {
  const b = {
    pts: useBucketsBoard(date, 'pts'), reb: useBucketsBoard(date, 'reb'), ast: useBucketsBoard(date, 'ast'),
    '3pm': useBucketsBoard(date, '3pm'), pra: useBucketsBoard(date, 'pra'), dd: useBucketsBoard(date, 'dd'), td: useBucketsBoard(date, 'td'), first: useBucketsBoard(date, 'first'),
  }
  const following = useFollowing('nba')
  const datas = KEYS.map((k) => b[k].data)
  const { rows, startOf } = useMemo(() => {
    const m = new Map(); const st = new Map()
    KEYS.forEach((k, i) => {
      const d = datas[i]
      for (const g of d?.games || []) { const t = Date.parse(g.start || g.startUtc || ''); if (Number.isFinite(t)) st.set(String(g.id), t) }
      for (const x of d?.rows || []) {
        const id = `${x.playerId}|${x.gameId}`
        const cur = m.get(id) || { id: x.playerId, gameId: x.gameId, name: x.name, team: x.team, opp: x.opp, home: x.home, pos: x.pos }
        cur[k] = x
        m.set(id, cur)
      }
    })
    return { rows: [...m.values()], startOf: st }
  }, datas) // eslint-disable-line react-hooks/exhaustive-deps
  const { data: odds } = useLiveFetch('/api/odds/latest?sport=nba')   // once, no timer (as BucketsCard)
  const a = useMemo(() => bucketsAdapter(startOf, odds), [startOf, odds])
  if (!rows.length) return null
  return (
    <PropCards a={a} rows={rows} date={date} onOpen={(r) => onOpenPlayer?.(r.id)}
      onWatch={(r) => following.toggle({ id: r.id, name: r.name, team: r.team, position: r.pos })}
      watchIds={following.ids}
      // LAMP's Props, piece for piece (2026-10-20 style audit: "buckets doesnt feel shared"): the stat strip, search + Filter, and Compare
      // two picks (BucketsCompare, the player page's compare, on the points board's rows the viewer may see)
      hero find={{ nameOf: (r) => r.name || '', teamOf: (r) => r.team || '', placeholder: 'Search player or team…' }}
      compareOf={(pool) => <BucketsCompare rows={pool.filter((r) => r.pts).map((r) => r.pts)} onOpenPlayer={onOpenPlayer} />}
      theme={C} numFont={NUM_FONT} accent={C.purple} accentWash={`color-mix(in srgb, ${C.purple} 14%, transparent)`} />
  )
}
