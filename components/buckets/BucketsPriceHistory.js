'use client'
// Price history on a BUCKETS player page: MOONSHOT's timeline (components/PriceHistory.js) on the first board market the books quote at its
// bar (lib/nba/oddsQuote.js nbaQuote; points first). Renders only inside the hidden-until-public BUCKETS shell.
import PriceHistory from '../PriceHistory'
import { nbaQuote, NBA_ODDS_KEY } from '../../lib/nba/oddsQuote'
import { NBA_MARKETS } from '../../lib/nba/model'
import { useLiveFetch } from '../../lib/useLiveFetch'
import { C, NUM_FONT } from '../../lib/nba/theme'

export default function BucketsPriceHistory({ id }) {
  const { data: odds } = useLiveFetch('/api/odds/latest?sport=nba')
  const m = Object.keys(NBA_ODDS_KEY).find((k) => nbaQuote(odds, id, k)) || 'pts'
  return <PriceHistory quote={nbaQuote(odds, id, m)} marketLabel={NBA_MARKETS[m]?.label || m} theme={C} numFont={NUM_FONT} />
}
