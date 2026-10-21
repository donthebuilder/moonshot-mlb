'use client'
// THE AVAILABILITY TAG INSIDE SOMETHING ALREADY TAPPABLE (2026-10-21, Donovan: "show like Q tags and DTD O tags").
// InjuryChip is its own button (tap explains). A name chip on Numerology is ALREADY a button (tap collects him), and a
// button inside a button breaks on a phone, so this is the same OUT / IL / D / Q / DTD letters from the same injury layer
// (lib/injuries/statuses STATUS_INFO, same red / amber tone), drawn as plain text. The rows that are not buttons use the
// tappable PlayerInjuryChip. Renders nothing for a man the report does not list, while it loads, or when it is
// unavailable: a chip never claims "healthy". Information only: it moves no score and no order.
import { useInjuryLayer } from './InjuryLayer'
import { STATUS_INFO } from '../../lib/injuries/statuses'

/** `who` = { player_id, name, team }. Returns the entry's chip, or null. */
export function useInjuryEntry(who) {
  const layer = useInjuryLayer()
  const entry = layer?.entryFor ? layer.entryFor(who) : null
  return entry && STATUS_INFO[entry.status] ? entry : null
}

export default function InjuryMark({ who, C, font, size = 8.5 }) {
  const entry = useInjuryEntry(who)
  if (!entry) return null
  const info = STATUS_INFO[entry.status]
  const tone = info.tone === 'red' ? C.red : C.yellow
  return (
    <span data-injury={entry.status} title={`${info.word}${entry.note ? ` · ${entry.note}` : ''} (ESPN injury report)`}
      style={{ display: 'inline-block', marginLeft: 5, fontFamily: font, fontSize: size, fontWeight: 900, letterSpacing: '.06em', color: tone,
        border: `1px solid ${tone}`, borderRadius: 3, padding: '0 3px', lineHeight: 1.35, verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
      {info.chip}
    </span>
  )
}
