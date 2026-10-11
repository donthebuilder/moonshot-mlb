'use client'
// THE AVAILABILITY CHIP: OUT / IL / D / Q / DTD. Information only -- it sits BESIDE the call status (CALLED stays CALLED,
// from lib/callStatus; a locked CALLED man who then goes OUT reads "CALLED · OUT") and changes no score. Tap explains
// (lib/explain.js, works without hover): the status in plain words, the note, who said it and when.
import { explain } from '../../lib/explain'
import { STATUS_INFO } from '../../lib/injuries/statuses'
import { updatedLabel } from '../../lib/injuries/words'

/** @param entry  a lib/injuries entry; @param C the product's theme tokens; @param font NUM_FONT */
export default function InjuryChip({ entry, C, font, size = 9, style }) {
  if (!entry || !STATUS_INFO[entry.status]) return null
  const info = STATUS_INFO[entry.status]
  const tone = info.tone === 'red' ? C.red : C.yellow
  const text = [info.explain, entry.note ? `${entry.note}.` : '', `ESPN injury report${entry.updatedAt ? `, ${updatedLabel(entry.updatedAt)}` : ''}.`].filter(Boolean).join(' ')
  return (
    <span role="button" tabIndex={0} aria-label={`${entry.name}: ${info.word}. ${text}`} data-injury={entry.status}
      onClick={(e) => { e.stopPropagation(); explain(`${entry.name} · ${info.word}`, text) }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); explain(`${entry.name} · ${info.word}`, text) } }}
      title={text}
      style={{
        display: 'inline-block', fontFamily: font, fontSize: size, fontWeight: 900, letterSpacing: '.08em', color: tone,
        border: `1px solid ${tone}`, borderRadius: 4, padding: '1px 5px', lineHeight: 1.3, whiteSpace: 'nowrap', cursor: 'pointer', marginLeft: 5, verticalAlign: 'middle', ...style,
      }}>{info.chip}</span>
  )
}
