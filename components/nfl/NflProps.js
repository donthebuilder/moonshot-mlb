'use client'
import { useMemo } from 'react'
import PropCards from '../props/PropCards'
import TeamMark from '../TeamMark'
import { faceUrl } from '../PlayerFace'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import { quoteFor } from '../../lib/nfl/oddsMatch'
import { impliedPct, payoutWords } from '../../lib/odds'
import { kickoffFor } from '../../lib/nfl/kickoff'
import { boardReason } from '../../lib/nfl/boardReason'
import { baselineFor } from '../../lib/nfl/tdPool'
import { useNflWatchlist } from '../../lib/nfl/watchlist'

// 🏈 TUDDY PROPS, MOONSHOT'S PAGE (2026-10-04, Donovan: "make sure the props
// pages look like the mlb one"). The shared grid (components/props/PropCards.js)
// on TUDDY's card: a player is CALLED in a market when the bot put him on that
// market's card this week (picks.card[market].rungs). Each card wears the
// market you browse -- that market's score, the bar the card grades it on, the
// one-line reason his score is high (lib/nfl/boardReason, the line Boards and
// This week already use), and his per-game numbers for that market as tiles.
// The price is the book's own line for THAT market and only when it is the
// card's bar (quoteFor's `matches`), the same rule MOONSHOT's Priced follows.

const MARKETS = ['TD', 'REC_YDS', 'REC', 'RUSH_YDS', 'RUSH_ATT', 'PASS_YDS', 'KICK_PTS', 'NONE']
const SHORT = { TD: 'ATD', REC_YDS: 'Rec yds', REC: 'Rec', RUSH_YDS: 'Rush yds', RUSH_ATT: 'Rush att', PASS_YDS: 'Pass yds', KICK_PTS: 'Kick pts', NONE: 'Not on the card' }
const LONG = { TD: 'Anytime TD', REC_YDS: 'Receiving yards', REC: 'Receptions', RUSH_YDS: 'Rushing yards', RUSH_ATT: 'Rushing attempts', PASS_YDS: 'Passing yards', KICK_PTS: 'Kicker points', NONE: 'Not on the card' }
const one = (v) => (Number.isFinite(Number(v)) ? (Math.round(Number(v) * 10) / 10).toFixed(1) : '—')
const TILES = {
  TD: (s) => [['TD / G', one(s.TD)], ['RZ OPP / G', one(s.RZ)], ['xTD', one(s.xTD)]],
  REC_YDS: (s) => [['TGT / G', one(s.TGT)], ['REC YDS / G', one(s.RECYD)], ['REC / G', one(s.REC)]],
  REC: (s) => [['REC / G', one(s.REC)], ['TGT / G', one(s.TGT)], ['CATCH %', Number(s.TGT) > 0 && Number.isFinite(Number(s.REC)) ? `${Math.round((100 * Number(s.REC)) / Number(s.TGT))}%` : '—']],
  RUSH_YDS: (s) => [['CAR / G', one(s.CAR)], ['RUSH YDS / G', one(s.RUYD)], ['TD / G', one(s.TD)]],
  RUSH_ATT: (s) => [['CAR / G', one(s.CAR)], ['RUSH YDS / G', one(s.RUYD)], ['RZ OPP / G', one(s.RZ)]],
  PASS_YDS: (s) => [['ATT / G', one(s.ATT)], ['PASS YDS / G', one(s.PAYD)], ['CPOE', one(s.CPOE)]],
  KICK_PTS: (s) => [['FG / G', one(s.FGM)], ['PAT / G', one(s.PAT)], ['PTS / G', Number.isFinite(Number(s.FGM)) && Number.isFinite(Number(s.PAT)) ? one(3 * Number(s.FGM) + Number(s.PAT)) : '—']],
}

function nflAdapter({ players, card, markets, odds, games }) {
  // 2026-10-07 colour diet: one accent for every market; 'not on the card' is grey.
  const colors = { TD: C.green, REC_YDS: C.green, RUSH_YDS: C.green, REC: C.green, PASS_YDS: C.green, KICK_PTS: C.green, RUSH_ATT: C.green, NONE: C.text3 }
  // who is on each market's card, and at which bar
  const onCard = new Map()
  for (const [mk, blk] of Object.entries(card || {})) for (const r of blk?.rungs || []) {
    const id = String(r.player_id)
    if (!onCard.has(id)) onCard.set(id, new Map())
    onCard.get(id).set(mk, { rank: r.rank, bar: blk.bar })
  }
  // the reason line's inputs, per market (as This week builds them)
  const why = {}
  for (const mk of MARKETS) {
    const spec = (markets || []).find((m) => m.key === mk)
    if (!spec?.weights) continue
    const pool = players.filter((p) => Number.isFinite(p?.scores?.[mk]))
    why[mk] = { spec, pool, base: baselineFor(pool, mk) }
  }
  const quote = (r, k) => { const q = quoteFor(odds, r, k); return q && q.over != null && q.matches !== false ? q : null }
  return {
    markets: MARKETS,
    pillLabel: (k) => SHORT[k],
    groupLabel: (k) => (k === 'NONE' ? LONG.NONE : `${LONG[k]}${card?.[k]?.bar != null ? ` · ${card[k].bar}+` : ''}`),
    color: (k) => colors[k] || C.text3,
    rolesOf: (r) => MARKETS.filter((k) => onCard.get(String(r.player_id))?.has(k)),
    primaryOf: (r) => MARKETS.find((k) => onCard.get(String(r.player_id))?.has(k)) || null,
    score: (r, k) => { const v = k === 'NONE' ? r?.scores?.TD : r?.scores?.[k]; return Number.isFinite(v) ? Math.round(v * 10) / 10 : null },
    idOf: (r) => String(r.player_id),
    keyOf: (r) => String(r.player_id),
    card: (r, k) => {
      const slot = onCard.get(String(r.player_id))?.get(k)
      const mk = k === 'NONE' ? 'TD' : k
      const w = why[mk] ? boardReason(r, why[mk].spec.weights, why[mk].base, mk, why[mk].pool) : null
      const q = quote(r, mk)
      const s = r.stats || {}
      const chips = []
      if (slot?.rank) chips.push({ t: `#${slot.rank} on the card`, warn: false })
      if (r.questionable) chips.push({ t: '⚠ questionable', warn: true })
      // the best book's price on this bar, what it pays, what it assumes (2026-10-04
      // user review, build 1). No fair price / room until TUDDY passes a calibration gate.
      if (q) { const px = q.best_over ?? q.over; chips.push({ t: `${payoutWords(px)} · ${q.best_book || 'best book'} · needs ${impliedPct(px)}%`, warn: false }) }
      if (r.coverage_mismatch_tag && chips.length < 2) chips.push({ t: r.coverage_mismatch_tag, warn: false })
      return {
        photo: faceUrl({ sport: 'nfl', espnId: r.espn_id, size: 96 }),
        dialTitle: `${LONG[mk]} score for this market`,
        market: card?.[mk]?.bar != null ? `${card[mk].bar}+ ${SHORT[mk].toLowerCase()}` : LONG[mk],
        title: r.name,
        badge: slot ? 'CALLED' : 'NOT CALLED',
        badgeQuiet: !slot,
        meta: <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0, maxWidth: '100%' }}>
          <TeamMark sport="nfl" abbr={r.team} variant="logo" px={16} />
          <span>vs</span>
          <TeamMark sport="nfl" abbr={r.opp} variant="logo" px={16} />
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>· {r.position}</span>
        </span>,
        metaRight: q ? (() => { const px = Number(q.best_over ?? q.over); return px > 0 ? `+${px}` : String(px) })() : null,
        line: w?.text || null,
        facts: null,
        chips: chips.slice(0, 2),
        tiles: (TILES[mk] || TILES.TD)(s).map(([kk, v]) => ({ k: kk, v })),
      }
    },
    priced: (r, k) => Boolean(quote(r, k === 'NONE' ? 'TD' : k)),
    priceNum: (r, k) => { const q = quote(r, k === 'NONE' ? 'TD' : k); return q ? Number(q.best_over ?? q.over) : null },
    startsAt: (r) => kickoffFor(games, r) ?? NaN,
    gameOf: (r) => (r?.team && r?.opp ? { key: [r.team, r.opp].sort().join('-'), label: [r.team, r.opp].sort().join(' · ') } : null),
    precisionKey: 'tuddy_precision_v1',
    sortTimeLabel: 'Kickoff',
    picksTitle: "everyone on this week's card",
    unit: 'call',
  }
}

export default function NflProps({ data, picks, odds, onPlayerClick }) {
  const players = useMemo(() => (data?.players || []).filter((p) => p && p.player_id && !p.on_bye), [data])
  const watchlist = useNflWatchlist(data)
  const watchIds = useMemo(() => new Set((watchlist.pins || []).map((p) => String(p.player_id ?? p.id))), [watchlist.pins])
  const a = useMemo(() => nflAdapter({ players, card: picks?.card, markets: data?.markets, odds, games: data?.games }), [players, picks, data, odds])
  if (!players.length) return null
  return (
    <PropCards a={a} rows={players} onOpen={onPlayerClick} onWatch={(p) => watchlist.toggle(p)} watchIds={watchIds}
      theme={C} numFont={NUM_FONT} accent={C.green} accentWash={`color-mix(in srgb, ${C.green} 14%, transparent)`} />
  )
}
