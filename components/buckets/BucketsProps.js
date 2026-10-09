'use client'
import { useMemo } from 'react'
import PropCards from '../props/PropCards'
import TeamMark from '../TeamMark'
import { faceUrl } from '../PlayerFace'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { NBA_MARKETS } from '../../lib/nba/model'
import { useBucketsBoard } from '../../lib/nba/useBuckets'
import { useFollowing } from '../../lib/dash/follow'

// 🏀 BUCKETS PROPS, MOONSHOT'S PAGE (2026-10-04, Donovan: "make sure the props
// pages look like the mlb one"). The shared grid (components/props/PropCards.js)
// on BUCKETS' eight markets, one /api/buckets/board read each -- the same rows the
// board below uses. CALLED / ON THE BOARD come from the board (lib/nba/model
// scoreNight), the why line from the board's own whyNba, the tiles from the
// legs the market's score is built from. No per-player price on the board.

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

function bucketsAdapter(startOf) {
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
      else if (!x.locked) chips.push({ t: '⏳ preview — not locked yet', warn: true })
      if (x.injury) chips.push({ t: `⚠ ${x.injury}`, warn: true })
      if (x.role && chips.length < 2) chips.push({ t: x.role, warn: false })
      return {
        photo: faceUrl({ sport: 'nba', id: r.id, size: 96 }),
        dialTitle: `${SHORT[k]} score — BUCKETS' number for this market, 0-100 within tonight's pool`,
        market: NBA_MARKETS[k]?.label || SHORT[k],
        title: r.name,
        badge: x.status === 'called' ? 'CALLED' : x.status === 'board' ? 'ON BOARD' : 'NOT CALLED',
        badgeQuiet: x.status !== 'called',
        meta: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, maxWidth: '100%' }}>
          <TeamMark sport="nba" abbr={r.team} variant="logo" px={16} />
          <span>{r.home ? 'vs' : '@'}</span>
          <TeamMark sport="nba" abbr={r.opp} variant="logo" px={16} />
          {r.pos ? <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>· {r.pos}</span> : null}
        </span>,
        metaRight: null,
        line: x.why || null,
        facts: null,
        chips: chips.slice(0, 2),
        tiles: legs.map((l) => ({ k: LEG[l] || l, v: fmt(l, x.legs?.[l]) })),
      }
    },
    priced: () => false,
    priceNum: () => null,
    startsAt: (r) => startOf.get(String(r.gameId)) ?? NaN,
    gameOf: (r) => (r?.gameId ? { key: String(r.gameId), label: r.home ? `${r.opp}@${r.team}` : `${r.team}@${r.opp}` } : null),
    precisionKey: 'buckets_precision_v1',
    sortTimeLabel: 'Tip-off',
    picksTitle: 'everyone called tonight, in any market',
    unit: 'call',
    copy: { priced: 'BUCKETS prices live on the Odds page; the board carries no per-player price, so this finds nobody.' },
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
  const a = useMemo(() => bucketsAdapter(startOf), [startOf])
  if (!rows.length) return null
  return (
    <PropCards a={a} rows={rows} onOpen={(r) => onOpenPlayer?.(r.id)}
      onWatch={(r) => following.toggle({ id: r.id, name: r.name, team: r.team, position: r.pos })}
      watchIds={following.ids} theme={C} numFont={NUM_FONT} accent={C.purple} accentWash={`color-mix(in srgb, ${C.purple} 14%, transparent)`} />
  )
}
