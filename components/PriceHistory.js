'use client'
// PRICE HISTORY on a player page, for every sport (2026-10-17, Donovan: "the player portal is not looking the same as the site's
// component"). It is MOONSHOT's OddsTimeline (components/OddsTimeline.js, the one PlayerModal draws) given the sport's own quote and
// theme. A quote with fewer than two real snapshots draws no chart; the section then says so in one line instead of going missing or
// guessing a line. Nothing is invented: the points are the books' opening price and our reads (lib/odds/latest.js movement).
import OddsTimeline, { oddsTimelinePoints } from './OddsTimeline'

export const NO_HISTORY_LINE = 'Price history starts when the book posts a line'

export default function PriceHistory({ quote = null, marketLabel = 'price', theme, numFont }) {
  if (oddsTimelinePoints(quote).length >= 2) return <OddsTimeline quote={quote} marketLabel={marketLabel} theme={theme} numFont={numFont} />
  return (
    <section aria-label="Price history" style={{ margin: '4px 0 12px', padding: '10px 12px', border: `1px solid ${theme.border}`, borderRadius: 11, background: theme.bg2 }}>
      <b style={{ color: theme.text, fontSize: 12 }}>Price timeline · {marketLabel}</b>
      <div style={{ color: theme.text3, fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>{NO_HISTORY_LINE}.</div>
    </section>
  )
}
