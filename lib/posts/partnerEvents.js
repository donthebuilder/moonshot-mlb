// THE PARTNER EVENT CARD (MOCK, 2026-10-31, Donovan: a partner server runs SportDataIQ's goal alerts; "replace with our card ... include the numerology").
// One live event (a goal, a homer, a touchdown) as DASH's own moment card, plus ONE numerology line. Nothing sends from here: scripts/discord-posts/cases.mjs
// renders it from real stored events so Donovan can look first. Numerology keeps lib/posts/byNumbers.js's voice: it says what lines up, never that it means anything.
import { todayNumbers, dayFinds } from './byNumbers.js'
import { ordinal } from '../format.js'

const dom = (d) => Number(String(d || '').slice(8, 10)) || null

/** "🔢 Day 6 (15 → 6) · #15 is today's date" -- the day's number, plus how this man lines up with it when he does. `man` = { number, birthDate }. Pure; null when the day has none. */
export function numberLine({ day, man = null }) {
  const t = todayNumbers(day)
  if (!t) return null
  const head = `🔢 Day ${t.udRoot}${t.udChain.length > 1 ? ` (${t.udChain.join(' → ')})` : ''}`
  const f = man ? dayFinds([{ ...man, name: 'x', status: 'called' }], { day })[0] : null
  if (!f) return head
  const tail = f.type === 'birthday' ? 'plays on his birthday'
    : f.type === 'date' ? `born on the ${ordinal(dom(man.birthDate))}, today's date`
    : f.type === 'path' ? f.label
    : `#${man.number} is ${f.label}`
  return `${head} · ${tail}`
}

/** The moment embed with the numerology line as its last line. Pure. */
export function withNumbers(embed, line) {
  if (!embed || !line) return embed
  return { ...embed, description: [embed.description, line].filter(Boolean).join('\n') }
}
