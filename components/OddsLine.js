'use client'
import { C, NUM_FONT } from '../lib/theme'
import { fmtOdds, VERDICT } from '../lib/odds'

// 💰 The book's line for one pick, rendered as a comparison rather than a price.
//
// A bare "-180" is decoration. "-180 · needs 64% · you hit 71%" is a decision.
// So the price never appears without the break-even beside it, and the verdict
// chip only appears when a real historical rate was supplied — a score is not a
// probability and comparing one to an implied percentage would be confident
// nonsense.

const TONE = { good: C.green || '#4ade80', bad: '#f87171', flat: C.text3 }

export default function OddsLine({ quote, edge, compact = false }) {
  if (!quote) return null
  const v = edge ? VERDICT[edge.verdict] : null
  const col = v ? TONE[v.tone] : C.text3
  const line = Number(quote.line)

  return (
    <span
      title={[
        `${quote.name || ''} · ${quote.market}`,
        `line ${line} · over ${fmtOdds(quote.over)}${quote.under ? ` / under ${fmtOdds(quote.under)}` : ''}`,
        `break-even ${quote.implied ?? '—'}%`,
        quote.best_over ? `best ${fmtOdds(quote.best_over)} at ${quote.best_book}` : '',
        `${quote.books} book${quote.books === 1 ? '' : 's'} at this line`,
        edge ? `his rate ${edge.have}% vs ${edge.need}% needed → ${edge.diff > 0 ? '+' : ''}${edge.diff}pp` : '',
      ].filter(Boolean).join('\n')}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
        fontFamily: NUM_FONT, fontSize: compact ? 9 : 10,
        border: `1px solid ${col}44`, background: `${col}12`,
        borderRadius: 6, padding: compact ? '1px 5px' : '2px 7px',
      }}
    >
      {Number.isFinite(line) && (
        <span style={{ color: C.text2, fontWeight: 700 }}>o{line}</span>
      )}
      <b style={{ color: C.text, fontWeight: 900 }}>{fmtOdds(quote.over)}</b>
      {quote.implied != null && (
        <span style={{ color: C.text3 }}>need {Math.round(quote.implied)}%</span>
      )}
      {edge && (
        <b style={{ color: col }}>
          {edge.diff > 0 ? '+' : ''}{edge.diff}
        </b>
      )}
    </span>
  )
}

/** The whole category board for one player — used in the modal. */
export function OddsRow({ quotes }) {
  const rows = Object.entries(quotes || {}).filter(([, q]) => q)
  if (!rows.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
      {rows.map(([cat, { quote, edge }]) => (
        <span key={cat} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <span style={{
            fontFamily: NUM_FONT, fontSize: 8.5, fontWeight: 900, color: C.text3,
            letterSpacing: '.06em',
          }}>{cat}</span>
          <OddsLine quote={quote} edge={edge} compact />
        </span>
      ))}
    </div>
  )
}
