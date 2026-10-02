'use client'
// THE STATUS STAMP (2026-10-01, BATCH-TABLE-SKIN-V2 step 4; R2 makes every
// other status label on the site use it). The word comes from lib/callStatus
// STATUS_WORD -- never re-derived here -- and the status from the caller,
// which got it from callStatus / tdCallStatus / scoreNight. CALLED wears the
// product's accent; ON THE BOARD is quiet; NOT ON THE BOARD is quieter.
import { STATUS_WORD } from '../lib/callStatus'
import { useSportTheme } from './SportTheme'

export default function CallStatusBadge({ status, accent = null, size = 9, short = false, style }) {
  const { C, NUM_FONT, accent: sportAccent } = useSportTheme()
  if (!STATUS_WORD[status]) return null
  const ac = accent || sportAccent
  const word = short && status === 'board' ? 'BOARD' : short && status === 'off' ? 'OFF' : STATUS_WORD[status]
  const tone = status === 'called' ? ac : status === 'board' ? C.text2 : C.text3
  return (
    <span title={STATUS_WORD[status]} style={{
      display: 'inline-block', fontFamily: NUM_FONT, fontSize: size, fontWeight: 900, letterSpacing: '.08em',
      color: tone, border: `1px solid ${status === 'called' ? `${ac}88` : C.border2}`, borderRadius: 4,
      padding: '1px 5px', whiteSpace: 'nowrap', lineHeight: 1.3, ...style,
    }}>{word}</span>
  )
}
