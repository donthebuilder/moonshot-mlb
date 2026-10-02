'use client'
// THE STATUS STAMP (2026-10-01, BATCH-TABLE-SKIN-V2 step 4; R2 makes every
// other status label on the site use it). The word comes from lib/callStatus
// STATUS_WORD -- never re-derived here -- and the status from the caller,
// which got it from callStatus / tdCallStatus / scoreNight. CALLED wears the
// product's accent; ON THE BOARD is quiet; NOT ON THE BOARD is quieter.
import { STATUS_WORD } from '../lib/callStatus'
import { useSportTheme } from './SportTheme'

// THREE LOOKS, ONE SET OF WORDS (R2c, 2026-10-02). variant:
//   'stamp' (default) -- the bordered stamp above, the v2 sheet's STATUS column.
//   'text'  -- StoryRow's BoardBadge: the word (plus the 0-100 score when he is
//              on the board) in the mono font, no border.
//   'chip'  -- LAMP's CalledChip: a filled accent chip, dark ink.
// The old BoardBadge / CalledChip names stay as wrappers over this, same pixels.
// theme / numFont override the SportTheme when a caller passes its own.
export default function CallStatusBadge({ status, accent = null, size = 9, short = false, style, variant = 'stamp', score = null, theme = null, numFont = null }) {
  const sport = useSportTheme()
  const C = theme || sport.C
  const NUM_FONT = numFont || sport.NUM_FONT
  if (!STATUS_WORD[status]) return null
  const ac = accent || sport.accent
  if (variant === 'chip') {
    return <span style={{ marginRight: 7, background: ac, color: C.bg, font: `900 7.5px/1 ${NUM_FONT}`, letterSpacing: '.12em', borderRadius: 4, padding: '2px 5px', verticalAlign: '1px', whiteSpace: 'nowrap', ...style }}>{STATUS_WORD[status]}</span>
  }
  if (variant === 'text') {
    const t = status === 'called' ? ac : status === 'board' ? C.text2 : C.text3
    return <span style={{ color: t, fontFamily: NUM_FONT, fontSize: 10, fontWeight: 800, ...style }}>{STATUS_WORD[status]}{status !== 'off' && Number.isFinite(Number(score)) ? ` ${Math.round(score)}` : ''}</span>
  }
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
