// The quiet "birthday today / tomorrow / in N days" chip (lib/birthday.js).
// Renders nothing outside the week or with no known date.
import { birthdayChip, bornLine } from '../../lib/birthday'
import { alpha } from '../../lib/scales'

export function BirthdayChip({ birth, on, accent, textColor, font }) {
  const word = birthdayChip(birth, on)
  if (!word) return null
  return (
    <span style={{ display: 'inline-block', marginLeft: 8, padding: '0 7px', borderRadius: 3, border: `1px solid ${alpha(accent, 0.4)}`, color: textColor || accent, fontSize: 12, fontWeight: 700, lineHeight: '17px', fontFamily: font, whiteSpace: 'nowrap', verticalAlign: 'baseline' }}>{word}</span>
  )
}

/** "Born Mar 14, 1998 · age 27" (+ chip) as its own quiet line; null when the date is unknown. */
export default function BornLine({ birth, on, accent, C, font, style }) {
  const line = bornLine(birth, on)
  if (!line) return null
  return (
    <div data-born style={{ color: C.text3, fontSize: 12, lineHeight: '17px', marginBottom: 6, minWidth: 0, ...style }}>
      {line}<BirthdayChip birth={birth} on={on} accent={accent} textColor={C.text2} font={font} />
    </div>
  )
}
