// LAMP v5's ONE RULE (2026-10-23, lib/nhl/versions.js): a skater the injury report lists OUT or on injured reserve / suspended is not
// scored. Pure: the caller hands in the injury index (lib/injuries/read peekIndex) and the man; null = score him as usual.
import { injuryVerdict } from '../injuries/lookup'

/** legs { ok: false, injury, reason } for a man the report keeps out (lib/injuries BLOCKS), else null. No index: null (never guessed). */
export function injuryLegs(index, who) {
  const v = index ? injuryVerdict(index, who) : null
  if (!v?.blocked) return null
  const what = v.status === 'OUT' ? 'Out' : v.status === 'IL' ? 'On the injured list' : v.word
  return { ok: false, injury: v.status, reason: `${what}${v.entry?.note ? ` (${String(v.entry.note).toLowerCase()})` : ''} on the injury report: not scored` }
}
