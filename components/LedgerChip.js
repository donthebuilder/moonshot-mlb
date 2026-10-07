'use client'
// THE LEDGER CHIP (2026-10-07): one small pill, "Ledger 7/18" -- the CALLED men who have scored so far
// tonight, out of those called -- that opens The Ledger on its Tonight tab. It sits in the Filters row of
// every Rankings page (components/FiltersDrawer.js `ledger`) so The Ledger is one tap from the page people
// live on, without adding a row. The number is the Tonight strip's own count (lib/ledger/chip.js); with
// none yet it reads just "Ledger". A real link (an address), so a long-press or a copied link opens the
// same page, and a 44px target pulled back with a negative margin so the row keeps its height.
import { useSportTheme } from './SportTheme'
import { isHiddenSport } from '../lib/routes'
import { ledgerHash } from '../lib/ledger/views'
import { useLedgerCount, ledgerCountText } from '../lib/ledger/chip'

export default function LedgerChip({ sport, style = null }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  const count = useLedgerCount(sport)
  if (isHiddenSport(sport)) return null   // BUCKETS has no Ledger on any public surface until it opens
  const text = ledgerCountText(count)
  return (
    <a href={ledgerHash(sport)}
      aria-label={text ? `The Ledger: ${count.scored} of ${count.of} called have scored tonight` : 'The Ledger'}
      title="The Ledger: tonight's calls, who scored, the record"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, flex: '0 0 auto', minHeight: 44, margin: '-7px 0', padding: '0 4px',
        color: C.text2, font: `800 11.5px/1 ${NUM_FONT}`, textDecoration: 'none', whiteSpace: 'nowrap', ...(style || {}),
      }}>
      <span aria-hidden="true">{'\u{1F4D2}'}</span>
      <span style={{ textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: C.border2 }}>Ledger</span>
      {text ? <b style={{ color: accent }}>{text}</b> : <span aria-hidden="true">{'›'}</span>}
    </a>
  )
}
