'use client'
// + slip on a BUCKETS player page (2026-10-17): every board market the books quote at the card's bar (lib/nba/oddsQuote.js nbaQuote), at the
// real price. BUCKETS is hidden until BUCKETS_PUBLIC, so this only renders inside its shell. No quote, no button.
import SlipAdd from '../SlipAdd'
import { nbaQuote, NBA_ODDS_KEY } from '../../lib/nba/oddsQuote'
import { NBA_MARKETS } from '../../lib/nba/model'
import { useLiveFetch } from '../../lib/useLiveFetch'
import { C, NUM_FONT } from '../../lib/nba/theme'

export default function BucketsSlipAdd({ id, name, team = null, opp = null, style = null }) {
  const { data: odds } = useLiveFetch('/api/odds/latest?sport=nba')
  const game = team && opp ? { key: [team, opp].sort().join('-'), label: [team, opp].sort().join(' · ') } : null
  const legs = Object.keys(NBA_ODDS_KEY).map((m) => {
    const q = nbaQuote(odds, id, m)
    return q ? { key: `${id}|${m}`, id: String(id), name, team, market: NBA_MARKETS[m]?.label || m, line: `o${q.line}`, side: 'over', price: Number(q.best_over ?? q.over), game } : null
  }).filter(Boolean)
  return <SlipAdd sport="nba" legs={legs} C={C} NUM_FONT={NUM_FONT} accent={C.purple} style={style} />
}
