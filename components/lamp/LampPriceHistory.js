'use client'
// Price history on a LAMP player page: MOONSHOT's timeline (components/PriceHistory.js) on his anytime-goal price, only where the book's
// line IS the GOAL bar (lib/nhl/lampQuote.js). A goalie has no goal price, so the page doesn't mount this for him.
import PriceHistory from '../PriceHistory'
import { lampQuoteOf } from '../../lib/nhl/lampQuote'
import { useLiveFetch } from '../../lib/useLiveFetch'
import { C, NUM_FONT } from '../../lib/nhl/theme'

export default function LampPriceHistory({ id }) {
  const { data: odds } = useLiveFetch('/api/odds/latest?sport=nhl')
  return <PriceHistory quote={lampQuoteOf(odds, { id }, 'GOAL')} marketLabel="1+ goal" theme={C} numFont={NUM_FONT} />
}
