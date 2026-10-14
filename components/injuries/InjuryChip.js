'use client'
// THE AVAILABILITY CHIP: OUT / IL / D / Q / DTD. Information only -- it sits BESIDE the call status (CALLED stays CALLED,
// from lib/callStatus; a locked CALLED man who then goes OUT reads "CALLED · OUT") and changes no score. Tap explains
// (lib/explain.js, works without hover): the status in plain words, the note, who said it and when.
// The visible chip is small; its tap area is padded out to a thumb (negative margins give the room back, so the row does not grow). 14px sideways (was 11, a 41px box) so it is 44px wide.
import { explain } from '../../lib/explain'
import { STATUS_INFO } from '../../lib/injuries/statuses'
import { updatedLabel } from '../../lib/injuries/words'

/** @param entry  a lib/injuries entry; @param C the product's theme tokens; @param font NUM_FONT */
export default function InjuryChip({ entry, C, font, size = 9, style, label = null }) {
  if (!entry || !STATUS_INFO[entry.status]) return null
  const info = STATUS_INFO[entry.status]
  const tone = info.tone === 'red' ? C.red : C.yellow
  const text = [info.explain, entry.note ? `${entry.note}.` : '', `ESPN injury report${entry.updatedAt ? `, ${updatedLabel(entry.updatedAt)}` : ''}.`].filter(Boolean).join(' ')
  const say = (e) => { e.stopPropagation(); explain(`${entry.name} · ${info.word}`, text) }
  const { marginLeft = 5, ...rest } = style || {}
  return (
    <span role="button" tabIndex={0} aria-label={`${entry.name}: ${info.word}. ${text}`} data-injury={entry.status} title={text}
      onClick={say}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); say(e) } }}
      style={{ display: 'inline-block', padding: '15px 14px', margin: `-15px -14px -15px ${marginLeft - 14}px`, cursor: 'pointer', verticalAlign: 'middle' }}>
      <span style={{
        display: 'inline-block', fontFamily: font, fontSize: size, fontWeight: 900, letterSpacing: '.08em', color: tone,
        border: `1px solid ${tone}`, borderRadius: 4, padding: '1px 5px', lineHeight: 1.3, whiteSpace: 'nowrap', ...rest,
      }}>{label || info.chip}</span>
    </span>
  )
}
